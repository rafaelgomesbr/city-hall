import type { Banco } from "../banco/tipos.js";
import type { Trava } from "../push/trava.js";

/**
 * O relógio que faz cada município escrever o próprio resumo.
 *
 * O QUE ELE EXISTE PARA IMPEDIR: a migração 023 entregou a tabela de métricas,
 * a função que a escreve, a visão que o console lê e o papel de leitura do
 * fornecedor, e **ninguém chamava a função**. Nesse estado a tabela fica vazia
 * para sempre, a visão responde `sem_escrita_recente` para todo município, e o
 * console do fornecedor mostra uma tela impecável afirmando que nenhuma
 * prefeitura usa o produto. Nada disso quebra teste nenhum, porque nada está
 * errado: está apenas desligado. É a mesma família de defeito do
 * `NOTIFICADOR_URL` que era validado na partida e nunca lido por linha nenhuma
 * do servidor.
 *
 * =====================================================================
 * A DIREÇÃO DO DADO É O PONTO INTEIRO, E ELA MORA NESTE LAÇO.
 *
 * A ADR 0008 recusa a saída óbvia (uma consulta privilegiada que soma todos os
 * municípios de uma vez), porque ela exige exatamente a credencial que não
 * pode existir: uma conexão que enxerga dado de negócio de mais de uma
 * prefeitura. O teste daquele desenho ficaria verde e falso.
 *
 * Aqui a seta se inverte, e é por isso que este arquivo abre uma transação POR
 * MUNICÍPIO em vez de uma consulta só:
 *
 *   1. `municipios_a_resumir` (migração 026) responde apenas QUEM está sem
 *      resumo fresco, em `setof uuid`. Ela não lê ocorrência, não devolve nome
 *      e não aceita município de parâmetro.
 *   2. Para cada identificador, `comTenant` abre a transação daquele município,
 *      assume `dc360_app` e define `app.organizacao_atual`. Só então
 *      `resumir_municipio()` roda, e ela é SECURITY INVOKER: as contagens
 *      enxergam exatamente as linhas daquele município, e nem uma a mais.
 *
 * O efeito é que não existe caminho, nem por engano de código neste arquivo,
 * para um município resumir o vizinho: as linhas do vizinho não estão lá para
 * serem contadas.
 *
 * =====================================================================
 * POR QUE UM RELÓGIO PRÓPRIO, E NÃO UM PEDAÇO DO VARREDOR DE PRAZO.
 *
 * O varredor de `push/varredor.ts` seria o lugar mais barato de encaixar isto,
 * e é o lugar errado por duas razões que já estão escritas lá e em `index.ts`:
 *
 *   - Ele só sobe com `PUSH_ATIVO=sim`. O resumo tem que ser escrito
 *     independentemente de o push estar ligado, senão a ausência de métrica
 *     passaria a significar duas coisas ao mesmo tempo ("ninguém usou" e "o
 *     push está desligado"), e a ADR 0008 assume por escrito que a ausência
 *     precisa ser um sinal legível.
 *   - Ele é um laço POR NOTIFICAÇÃO, com teto de tempo por rodada e desistência
 *     no meio: uma rodada que estoura o teto deixa notificações para depois, e
 *     isso é a resposta certa para aviso de prazo. Para o resumo seria a
 *     resposta errada, porque o município que ficasse de fora apareceria como
 *     calado no console, e calado é o sinal de "este município está com
 *     problema".
 *
 * O parentesco certo é com `privacidade/minimizacao.ts`: rotina que sobe
 * sempre, com trava própria e pool próprio, e cuja regra inteira mora no banco.
 */

/**
 * O número da trava de aviso desta rotina.
 *
 * Vive aqui, e não junto das outras duas em `push/trava.ts`, porque ele
 * pertence a esta rotina e não ao push: `travaPostgres` recebe a chave por
 * parâmetro justamente para cada rotina trazer a sua. O número segue a
 * convenção das outras (o sufixo é o número da migração que criou a coisa
 * travada, aqui a 023, que criou a tabela de métricas), e ser distinto é o que
 * impede o resumo de deixar de rodar sempre que o push estiver no ar naquele
 * instante.
 */
export const CHAVE_DO_RESUMO = 5410360023;

export type ResumoDaEscritaDeMetricas = {
  /** `true` quando outra máquina estava escrevendo e esta desistiu da rodada. */
  travado: boolean;
  /** Quantos municípios escreveram o próprio resumo nesta rodada. */
  municipios: number;
  /** Quantos tentaram e falharam. Cada um vira silêncio no console. */
  falhas: number;
};

export type DependenciasDoResumo = {
  /** Pool próprio, separado do das requisições. */
  banco: Banco;
  trava: Trava;
  /**
   * De quanto tempo o resumo de hoje ainda vale.
   *
   * Sem isto o relógio reescreveria a tabela inteira a cada rodada mesmo quando
   * nada mudou, e `atualizado_em` deixaria de significar "este número é desta
   * hora" para significar "o relógio está vivo". São coisas diferentes, e o
   * console decide alarme com a primeira.
   */
  frescorMinutos: number;
  registrar?: (evento: Record<string, unknown>, mensagem: string) => void;
};

export async function resumirMunicipios(
  dep: DependenciasDoResumo,
): Promise<ResumoDaEscritaDeMetricas> {
  const resultado: ResumoDaEscritaDeMetricas = { travado: false, municipios: 0, falhas: 0 };
  const registrar = dep.registrar ?? (() => {});

  if (!(await dep.trava.tentar())) {
    resultado.travado = true;
    return resultado;
  }

  try {
    const alvos = await dep.banco.semTenant(async (c) => {
      const r = await c.query<{ municipios_a_resumir: string }>(
        "SELECT municipios_a_resumir($1::interval)",
        [`${dep.frescorMinutos} minutes`],
      );
      return r.rows.map((l) => l.municipios_a_resumir);
    });

    for (const organizacaoId of alvos) {
      /*
        Um município por vez, e a falha de um NÃO derruba os outros.

        Uma conexão derrubada no meio da escrita de uma prefeitura não pode
        apagar o console inteiro. O que se perde é a linha daquele município, e
        ela aparece na visão como `sem_escrita_recente`, que é justamente o
        sinal que a ADR 0008 pediu para a ausência não virar linha faltando.
      */
      try {
        const escreveu = await dep.banco.comTenant(organizacaoId, async (c) => {
          /*
            MUNICÍPIO ELIMINADO NÃO ESCREVE RESUMO, e a condição fica na
            mesma sentença, de propósito.

            Entre `executar_eliminacoes_vencidas()` apagar as linhas de um
            município e `concluir_eliminacao()` apagar a linha da organização
            existe a purga do armazenamento, que demora e pode falhar. Nesse
            intervalo `municipios_a_resumir` ainda devolve o município (a
            linha existe e não tem métrica de hoje), e escrever uma métrica
            aqui recriaria uma linha em `metricas_municipio` apontando para a
            organização: a conclusão bateria na chave estrangeira e a
            eliminação nunca terminaria. Debaixo do RLS `organizacoes` só tem
            a própria linha, então zero linhas quer dizer "eliminada", e a
            função não é chamada.
          */
          const r = await c.query(
            "SELECT resumir_municipio() FROM organizacoes WHERE eliminada_em IS NULL",
          );
          return r.rows.length > 0;
        });
        if (escreveu) resultado.municipios += 1;
      } catch (erro) {
        resultado.falhas += 1;
        /*
          O log leva o identificador da organização e mais nada. Ele não leva
          nome de município de propósito: log é lido por mais gente e guardado
          por mais tempo do que qualquer um imagina, e quem precisa saber de
          qual prefeitura se trata tem o identificador para procurar.
        */
        registrar(
          {
            organizacao: organizacaoId,
            erro: erro instanceof Error ? erro.message : String(erro),
          },
          "municipio nao conseguiu escrever o proprio resumo",
        );
      }
    }

    if (resultado.municipios > 0 || resultado.falhas > 0) {
      registrar(
        { municipios: resultado.municipios, falhas: resultado.falhas },
        "resumo dos municipios escrito",
      );
    }
  } finally {
    // `finally` e não o fim do bloco: uma exceção com a trava presa faria a
    // outra máquina desistir de todas as rodadas seguintes, e o console pararia
    // de receber número sem nada no log dizendo por quê.
    await dep.trava.soltar();
  }

  return resultado;
}

export type ResumoAgendado = { parar(): Promise<void> };

/**
 * Põe a escrita do resumo num relógio.
 *
 * As mesmas defesas da minimização, pelas mesmas razões: `unref()` para o
 * temporizador não segurar o processo em pé durante um deploy, e trava de
 * sobreposição no próprio processo para uma rodada demorada não ganhar outra
 * por cima.
 *
 * A DIFERENÇA É A PRIMEIRA RODADA, que acontece na partida e não no primeiro
 * tique. Sem ela, um banco recém-migrado passa o intervalo inteiro sem uma
 * linha de métrica, e nesse tempo o console mostra silêncio para todo mundo, que
 * é exatamente o sinal de "estes municípios estão com problema". A trava
 * continua valendo: as duas máquinas do Fly subindo juntas não escrevem duas
 * vezes.
 */
export function agendarResumo(
  dep: DependenciasDoResumo,
  intervaloMs: number,
): ResumoAgendado {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});

  async function rodada(): Promise<void> {
    if (emAndamento) return;
    emAndamento = true;
    try {
      await resumirMunicipios(dep);
    } catch (erro) {
      // A escrita do resumo falhando inteira não pode derrubar a API: ela é a
      // parte menos importante do processo. Volta no próximo tique.
      registrar(
        { erro: erro instanceof Error ? erro.message : String(erro) },
        "escrita do resumo dos municipios falhou inteira",
      );
    } finally {
      emAndamento = false;
    }
  }

  const relogio = setInterval(() => { void rodada(); }, intervaloMs);
  relogio.unref();

  void rodada();

  return {
    async parar() {
      clearInterval(relogio);
      await dep.trava.encerrar();
    },
  };
}
