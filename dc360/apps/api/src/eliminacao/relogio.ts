import type { Banco } from "../banco/tipos.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import type { Trava } from "../push/trava.js";

/**
 * O relógio que elimina município.
 *
 * O console do fornecedor pode ELIMINAR uma prefeitura para sempre, com sete
 * dias de arrependimento. O console só escreve a intenção no banco (a linha
 * do livro `eliminacoes_de_municipio` e a marca em `organizacoes`, migração
 * 038): ele não tem credencial de armazenamento (ADR 0008), e toda execução
 * irreversível deste produto precisa ser guardada pelo ESTADO DO BANCO, e não
 * por um clique. Quem executa é este relógio, dentro da API, que é o processo
 * que já tem a credencial do armazenamento e já roda as outras rotinas de
 * prazo.
 *
 * ====================================================================
 * TRÊS FASES, E ELAS NÃO SE MISTURAM.
 *
 *   1. `executar_eliminacoes_vencidas()`, no banco. Para cada eliminação
 *      vencida e não cancelada, com a organização suspensa e marcada, apaga
 *      todas as linhas de negócio na ordem das chaves estrangeiras, confere
 *      que restou zero, grava as contagens no livro e marca `eliminada_em`.
 *      A linha de `organizacoes` FICA, e é ela que diz "há armazenamento por
 *      purgar". A função devolve o identificador e o prefixo.
 *   2. A PURGA do armazenamento sob o prefixo, objeto a objeto, página a
 *      página, contando o que apagou.
 *   3. `concluir_eliminacao(org)`: marca a purga, apaga a linha da
 *      organização e fecha o livro. SÓ acontece com a purga COMPLETA.
 *
 * ====================================================================
 * A PURGA PRECISA ESTAR COMPLETA ANTES DE CONCLUIR, e esta é a regra que
 * governa o arquivo.
 *
 * Uma organização apagada do banco com fotografias sobrando no armazenamento
 * é dado pessoal sem dono: a imagem da casa de uma família em situação de
 * risco, num balde, sem nenhuma linha que diga de quem é nem por que está lá.
 * É exatamente o que a varredura de órfãos (`armazenamento/orfaos.ts`) existe
 * para achar, e este relógio não pode ser quem produz isso. Então:
 *
 *   - Listagem que falha no meio: PARA, não conclui, registra, fica para a
 *     próxima rodada. Uma lista com página perdida tem a forma de uma lista
 *     completa em que alguns objetos não aparecem, e concluir por cima dela
 *     deixaria justamente esses.
 *   - Um `apagar` que falha: os outros objetos continuam saindo (progresso é
 *     progresso), mas a rodada não conclui, registra, e a próxima tenta de
 *     novo. Apagar é idempotente: `ausente` na segunda rodada é sucesso.
 *
 * ====================================================================
 * COMO UMA PURGA INTERROMPIDA É RETOMADA, e por quem.
 *
 * Quem lembra é o BANCO, e não este processo. `executar_eliminacoes_vencidas()`
 * devolve, em toda rodada, também quem já teve as linhas apagadas e ainda
 * não teve o armazenamento purgado (`eliminada_em` sem
 * `armazenamento_purgado_em`), até `concluir_eliminacao` marcar a purga. É
 * idempotente: nessa segunda vez não há mais nada a apagar, e o livro não é
 * tocado.
 *
 * Isso cobre os três jeitos de uma purga ficar pela metade: o provedor de
 * armazenamento recusou uma página ou um objeto (a rodada seguinte aceita);
 * o processo reiniciou no meio (deploy, máquina trocada); e a purga começou
 * na OUTRA máquina do Fly, que nunca vai lembrar dela aqui.
 *
 * A primeira versão deste arquivo guardava a lista na memória do processo, e
 * declarava em teste que reinício e troca de máquina a perdiam. A função do
 * banco mudou por causa disso, e o teste que declarava a limitação virou o
 * que prova a retomada. A memória do processo continua existindo como
 * atalho para a falha comum dentro de uma mesma vida do processo, e ela é
 * reconferida no contexto da própria organização, debaixo do RLS, antes de
 * qualquer `listar`: uma organização já concluída pela outra máquina não é
 * purgada duas vezes.
 *
 * ====================================================================
 * O PREFIXO É CONFERIDO ANTES DE QUALQUER `listar`.
 *
 * O prefixo vem da função do banco, escrita por outra frente. Se um dia ela
 * devolver texto vazio, `tenant/`, ou o prefixo de outro município, o laço de
 * purga listaria e apagaria o armazenamento de TODAS as prefeituras. A única
 * forma aceita é `tenant/<id da própria organização>/`, que é a que
 * `chaveDeStorage` produz e o CHECK do banco exige. O que não tem essa forma
 * não é purgado nem concluído, e o log diz por quê.
 *
 * ====================================================================
 * POR QUE NÃO HÁ CHAVE DE AMBIENTE PARA DESLIGAR ISTO.
 *
 * A varredura de órfãos sobe atrás de `VARREDURA_DE_ORFAOS_ATIVA` porque ela
 * só LISTA, e ficar desligada um mês adia uma lista. Este relógio EXECUTA uma
 * decisão do fornecedor já tomada, com segundo fator, e com sete dias de
 * espera escritos no banco. Uma chave desligada em produção deixaria
 * eliminações vencerem sem acontecer, em silêncio, e a saída seria alguém
 * rodar `DELETE` à mão com a credencial de dono: o padrão que a ADR 0008
 * nomeia como o problema. É a mesma classe da minimização por prazo, que
 * também sobe sempre porque executa obrigação legal (a eliminação ao fim do
 * contrato é a última obrigação de `docs/SAIDA-DE-MUNICIPIO.md`).
 *
 * O que protege contra o relógio fazer algo errado não é uma chave: é o
 * estado do banco. Sem eliminação vencida, a rodada é uma chamada de função
 * que devolve zero linhas. E a falha mais provável (a listagem do S3 nunca
 * falou com provedor de verdade) degrada para "a purga nunca conclui e o log
 * reclama a cada rodada", que é alto e não é perigoso.
 */

/**
 * O número da trava de aviso desta rotina.
 *
 * Segue a convenção das outras (`push/trava.ts`): o sufixo é o número da
 * migração que criou a coisa travada. Distinto de todas, porque compartilhar
 * a chave faria a eliminação deixar de rodar sempre que a outra rotina
 * estivesse no ar, e uma eliminação venceria em silêncio.
 *
 * A trava aqui pesa mais do que nas outras: sem ela, as duas máquinas do Fly
 * purgam o mesmo prefixo ao mesmo tempo, e o `concluir_eliminacao` de uma
 * corre com a listagem da outra.
 */
export const CHAVE_DA_ELIMINACAO = 5410360038;

/** `tenant/{organizacao}/`, e nada além disso. */
const FORMA_DO_PREFIXO = /^tenant\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/$/;

export type ResumoDaEliminacao = {
  /** `true` quando outra máquina estava executando e esta desistiu da rodada. */
  travado: boolean;
  /** Organizações eliminadas por inteiro nesta rodada: banco, armazenamento e linha. */
  concluidas: number;
  /** Organizações com purga por terminar ao fim desta rodada. */
  pendentes: number;
  /** Objetos apagados do armazenamento nesta rodada, somando todas. */
  objetosApagados: number;
};

export type DependenciasDaEliminacao = {
  /** Pool próprio, separado do das requisições. */
  banco: Banco;
  armazenamento: Armazenamento;
  trava: Trava;
  registrar?: (evento: Record<string, unknown>, mensagem: string) => void;
};

type LinhaDeEliminacao = {
  organizacao_id: string;
  prefixo_do_armazenamento: string;
  /**
   * O nome do município, quando a função o devolver. O contrato combinado
   * devolve só identificador e prefixo; o nome vive no livro
   * (`eliminacoes_de_municipio`), que a API não lê. Se a migração passar a
   * devolvê-lo, ele entra no log sem mudar uma linha aqui.
   */
  nome?: string | null;
};

type ResultadoDaPurga = {
  completa: boolean;
  apagados: number;
  bytesApagados: number;
  falhas: string[];
};

/**
 * Apaga tudo o que existe sob o prefixo, e diz se conseguiu tudo.
 *
 * Página a página, sem segurar a lista inteira na memória: um município de
 * três anos tem dezenas de milhares de objetos. A continuação da listagem é a
 * última chave devolvida, então apagar os objetos da página antes de pedir a
 * próxima não muda a página seguinte.
 */
async function purgarPrefixo(
  armazenamento: Armazenamento,
  prefixo: string,
): Promise<ResultadoDaPurga> {
  const resultado: ResultadoDaPurga = { completa: true, apagados: 0, bytesApagados: 0, falhas: [] };
  let continuacao: string | undefined;

  do {
    const pagina = await armazenamento.listar(prefixo, continuacao);
    if (pagina.falha) {
      // PARA AQUI. Continuar com o que deu para ler produziria uma lista com
      // buraco, e o buraco tem a forma de "estes objetos não existem".
      resultado.completa = false;
      resultado.falhas.push(`listagem: ${pagina.falha}`);
      break;
    }

    for (const objeto of pagina.objetos) {
      const apagado = await armazenamento.apagar(objeto.chave);
      if (apagado.situacao === "falha") {
        resultado.completa = false;
        resultado.falhas.push(`${objeto.chave}: ${apagado.motivo}`);
        continue;
      }
      // `ausente` conta como apagado: o objeto não está lá, que é o que se
      // queria. Acontece na rodada que retoma uma purga interrompida.
      resultado.apagados += 1;
      resultado.bytesApagados += objeto.tamanhoBytes;
    }

    continuacao = pagina.continuacao ?? undefined;
  } while (continuacao);

  return resultado;
}

export type Eliminador = {
  /** Uma rodada: executa o que venceu, purga, conclui o que deu, retoma o que ficou. */
  executar(): Promise<ResumoDaEliminacao>;
  /** As organizações com purga pendente que este processo lembra. */
  pendentes(): string[];
};

/**
 * Monta o eliminador, com a memória de purgas pendentes.
 *
 * É uma fábrica, e não uma função solta, porque a lista de pendentes precisa
 * de vida longa: uma por processo, atravessando rodadas. Duas instâncias
 * seriam duas listas, e a segunda não saberia o que a primeira deixou pela
 * metade.
 */
export function criarEliminador(dep: DependenciasDaEliminacao): Eliminador {
  const registrar = dep.registrar ?? (() => {});
  const purgasPendentes = new Set<string>();

  /**
   * Fases 2 e 3 para UMA organização. Devolve `true` quando concluiu.
   *
   * A falha de uma NÃO derruba as outras: a que falhou fica com
   * `eliminada_em` preenchido, a linha de pé e o identificador na memória,
   * e a rodada seguinte a retoma.
   */
  async function purgarEConcluir(
    linha: LinhaDeEliminacao,
    resumo: ResumoDaEliminacao,
  ): Promise<boolean> {
    const identificacao = {
      organizacao: linha.organizacao_id,
      ...(linha.nome ? { nome: linha.nome } : {}),
    };

    const forma = FORMA_DO_PREFIXO.exec(linha.prefixo_do_armazenamento);
    if (!forma || forma[1] !== linha.organizacao_id) {
      registrar(
        { ...identificacao, prefixo: linha.prefixo_do_armazenamento },
        "eliminacao recusou purgar: o prefixo do armazenamento nao e o da propria organizacao",
      );
      return false;
    }

    const purga = await purgarPrefixo(dep.armazenamento, linha.prefixo_do_armazenamento);
    resumo.objetosApagados += purga.apagados;

    if (!purga.completa) {
      registrar(
        {
          ...identificacao,
          objetosApagados: purga.apagados,
          bytesApagados: purga.bytesApagados,
          falhas: purga.falhas.slice(0, 20),
          totalDeFalhas: purga.falhas.length,
        },
        "eliminacao com purga incompleta: fica para a proxima rodada",
      );
      return false;
    }

    /*
      Fase 3, e só agora. O banco confere de novo que `eliminada_em` está
      preenchido antes de apagar a linha: a API não tem como concluir uma
      organização que o banco não eliminou.
    */
    await dep.banco.semTenant((c) =>
      c.query("SELECT concluir_eliminacao($1)", [linha.organizacao_id]),
    );
    registrar(
      {
        ...identificacao,
        objetosApagados: purga.apagados,
        bytesApagados: purga.bytesApagados,
      },
      "eliminacao concluida: banco, armazenamento e linha da organizacao",
    );
    return true;
  }

  /**
   * A retomada: a organização que ficou pela metade ainda está eliminada e
   * ainda tem linha? A pergunta é feita dentro do contexto dela, debaixo do
   * RLS, e `organizacoes` só devolve a própria linha.
   */
  async function aindaEsperaPurga(organizacaoId: string): Promise<boolean> {
    return dep.banco.comTenant(organizacaoId, async (c) => {
      const r = await c.query<{ eliminada: boolean }>(
        "SELECT (eliminada_em IS NOT NULL) AS eliminada FROM organizacoes WHERE id = $1",
        [organizacaoId],
      );
      // Sem linha: a outra máquina concluiu. Não é mais pendente.
      return r.rows[0]?.eliminada === true;
    });
  }

  async function executar(): Promise<ResumoDaEliminacao> {
    const resumo: ResumoDaEliminacao = { travado: false, concluidas: 0, pendentes: 0, objetosApagados: 0 };

    if (!(await dep.trava.tentar())) {
      resumo.travado = true;
      return resumo;
    }

    try {
      /*
        Fase 1 é inteira do banco, numa chamada só, sem contexto de município:
        a função é `SECURITY DEFINER` e é ela quem decide o que venceu. A API
        não enumera prefeituras e não decide prazo nenhum; ela recebe uma
        lista do que o banco já executou, e vai purgar o armazenamento
        correspondente.
      */
      const vencidas = await dep.banco.semTenant(async (c) => {
        const r = await c.query<LinhaDeEliminacao>("SELECT * FROM executar_eliminacoes_vencidas()");
        return r.rows;
      });

      for (const linha of vencidas) purgasPendentes.add(linha.organizacao_id);

      const porOrganizacao = new Map(vencidas.map((l) => [l.organizacao_id, l]));

      for (const organizacaoId of [...purgasPendentes]) {
        try {
          /*
            O que a função devolveu nesta rodada tem prefixo; o que ficou de
            rodada anterior é reconferido no banco e recebe o prefixo pela
            forma de sempre, que é a única que a purga aceita.
          */
          const linha = porOrganizacao.get(organizacaoId)
            ?? (await aindaEsperaPurga(organizacaoId)
              ? { organizacao_id: organizacaoId, prefixo_do_armazenamento: `tenant/${organizacaoId}/` }
              : null);
          if (!linha) {
            purgasPendentes.delete(organizacaoId);
            continue;
          }

          if (await purgarEConcluir(linha, resumo)) {
            purgasPendentes.delete(organizacaoId);
            resumo.concluidas += 1;
          }
        } catch (erro) {
          registrar(
            { organizacao: organizacaoId, erro: erro instanceof Error ? erro.message : String(erro) },
            "eliminacao com purga incompleta: fica para a proxima rodada",
          );
        }
      }

      resumo.pendentes = purgasPendentes.size;
    } finally {
      // `finally` pela mesma razão das outras rotinas: uma exceção com a trava
      // presa faria toda rodada seguinte desistir, e a eliminação venceria em
      // silêncio, que é o único desfecho que este relógio existe para impedir.
      await dep.trava.soltar();
    }

    return resumo;
  }

  return { executar, pendentes: () => [...purgasPendentes] };
}

export type EliminacoesAgendadas = { parar(): Promise<void> };

/**
 * Põe a eliminação num relógio.
 *
 * As mesmas defesas do resumo (`metricas/resumo.ts`), pelas mesmas razões:
 * `unref()` para o temporizador não segurar o processo em pé durante um
 * deploy, trava de sobreposição no próprio processo para uma rodada demorada
 * (uma purga de dezenas de milhares de objetos demora) não ganhar outra por
 * cima, e a PRIMEIRA RODADA NA PARTIDA: um deploy que acontece depois de um
 * prazo vencido não deve esperar o intervalo inteiro para executar uma
 * decisão que já venceu.
 */
export function agendarEliminacoes(
  dep: DependenciasDaEliminacao,
  intervaloMs: number,
): EliminacoesAgendadas {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});
  const eliminador = criarEliminador(dep);

  async function rodada(): Promise<void> {
    if (emAndamento) return;
    emAndamento = true;
    try {
      await eliminador.executar();
    } catch (erro) {
      // A rodada falhando inteira não pode derrubar a API. Volta no próximo
      // tique, e o log diz que não rodou: uma eliminação vencida que não
      // acontece precisa aparecer, e `/saude` mostra `vencidas` sem zerar.
      registrar(
        { erro: erro instanceof Error ? erro.message : String(erro) },
        "rodada de eliminacao de municipio falhou inteira",
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
