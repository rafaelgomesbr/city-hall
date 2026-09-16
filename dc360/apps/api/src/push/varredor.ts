import type { Banco } from "../banco/tipos.js";
import { semAFicha, type AmbienteApns, type EnvioDePush, type Plataforma } from "./envio.js";
import { montarAviso, type TipoDeAviso } from "./mensagem.js";
import type { Trava } from "./trava.js";

/**
 * O laço que envia os avisos de push: a tarefa nova que o despacho enfileirou
 * e o prazo que está vencendo.
 *
 * Sem ele, o prazo de uma vistoria vence e ninguém fica sabendo: o coordenador
 * só descobre quando abre a tela, e quem está na rua não abre tela nenhuma. E,
 * desde 15/09/2026, sem ele o despacho fica mudo: a rota
 * `POST /ocorrencias/:id/despacho` enfileira uma linha `tarefa_nova` em
 * `notificacoes_enviadas` por aparelho da equipe (migração 042), e é esta
 * rodada que a tira da fila e a manda para a Apple e para o Google, com o som
 * de despacho (ver `toqueDoAviso` em `mensagem.ts`). A rota não fala com
 * provedor nenhum: ela responde ao coordenador em milissegundos, e provedor
 * responde quando quer.
 *
 * A TAREFA NOVA SAI PRIMEIRO na rodada, antes do prazo. Despacho é uma pessoa
 * decidindo agora que esta equipe vai; prazo é relógio, e pode esperar a
 * próxima rodada se o teto de tempo bater.
 *
 * TRÊS GARANTIAS SUSTENTAM ESTE LAÇO, e cada uma cobre uma falha diferente:
 *
 *   1. TRAVA (ver `trava.ts`). Duas máquinas no Fly varrem ao mesmo tempo, e
 *      sem trava o agente recebe tudo em duplicata.
 *   2. CONEXÃO SEPARADA. O `banco` que chega aqui tem pool próprio, pequeno,
 *      e não é o das requisições. Uma varredura lenta não pode consumir as
 *      conexões que o agente em campo precisa para sincronizar a vistoria,
 *      que é a operação que não pode esperar.
 *   3. IDEMPOTÊNCIA NO BANCO. As funções `varrer_prazos` (migração 016) e
 *      `varrer_tarefas_novas` (migração 042) reivindicam a notificação ANTES
 *      de qualquer conversa com a Apple, e só devolvem o que conseguiram
 *      reivindicar. Reiniciar o processo não remanda o que já foi mandado,
 *      porque quem lembra é a tabela e não a memória do processo.
 */

export type ResumoDaVarredura = {
  /** `true` quando outra máquina estava varrendo e esta desistiu da rodada. */
  travado: boolean;
  reivindicadas: number;
  entregues: number;
  falhas: number;
  aparelhosRevogados: number;
  /**
   * Quantas notificações já reivindicadas ficaram sem tentativa porque a
   * rodada bateu no teto de tempo. Elas NÃO se perdem: a reivindicação está no
   * banco, e a rodada seguinte as pega de novo depois da espera.
   */
  adiadasPorTempo: number;
  /**
   * Os motivos das falhas, agregados: `{ "apns 403 InvalidProviderToken": 12 }`.
   *
   * É o que vai para o log no fim da rodada, e é o que distingue "a Apple
   * recusou a credencial" de "o provedor está fora do ar" sem abrir o banco.
   * Nunca leva ficha: o `detalhe` já chega sem ela (`envio.ts`), e ainda
   * assim passa por `semAFicha` aqui, porque log é copiado para mais lugares
   * que o banco.
   */
  detalhesDasFalhas: Record<string, number>;
};

/**
 * O que a última rodada concluída deixou no quadro, para `/saude` ler.
 *
 * Só contadores. Nem ficha, nem município, nem identificador de notificação:
 * `/saude` responde a qualquer um.
 */
export type UltimaRodada = {
  rodadaEm: string;
  reivindicadas: number;
  entregues: number;
  falhas: number;
  revogados: number;
};

/*
  O que a rodada precisa de cada alvo, e nada mais. Protocolo e endereço não
  entram aqui de propósito: a notificação não os leva (ver `mensagem.ts`), e o
  que o processo não lê não tem como parar em log nem em corpo de push.
*/
type LinhaDeAlvo = {
  notificacao_id: string;
  organizacao_id: string;
  aparelho_id: string;
  ficha: string;
  plataforma: Plataforma;
  ocorrencia_id: string;
  severidade: string | null;
  prazo_em: string | Date | null;
};

type Alvo = LinhaDeAlvo & { tipo: TipoDeAviso };

const COLUNAS_DO_ALVO =
  "notificacao_id, organizacao_id, aparelho_id, ficha, plataforma, ocorrencia_id, severidade, prazo_em";

export type DependenciasDoVarredor = {
  /** Pool próprio, separado do das requisições. */
  banco: Banco;
  trava: Trava;
  enviar: EnvioDePush;
  /** Quantos minutos antes do vencimento o aviso sai. */
  janelaMinutos: number;
  /** Quanto esperar antes de tentar de novo uma notificação que falhou. */
  esperaMinutos?: number;
  tentativasMaximas?: number;
  /** Teto de notificações por varredura. */
  teto?: number;
  /** Retenção de `notificacoes_enviadas`, em dias. Ver a migração 016. */
  retencaoDias?: number;
  /**
   * Teto de tempo da RODADA INTEIRA, e não de cada chamada.
   *
   * Tempo limite por chamada não basta, e a conta mostra por quê: com o teto
   * de 500 notificações por rodada e dez segundos por envio, uma noite em que
   * o provedor engasga em todas prende a trava por até uma hora e vinte. Nesse
   * tempo a outra máquina do Fly desiste de dezenas de rodadas, e o produto
   * fica sem avisar prazo por um motivo que nenhum log explica.
   *
   * Quatro minutos, contra o intervalo de cinco do relógio: a rodada termina
   * antes de a seguinte bater na porta, que é o que mantém uma rodada por
   * intervalo mesmo no pior dia.
   */
  tempoLimiteDaRodadaMs?: number;
  /** Injeção de relógio, para o teste medir o teto sem esperar de verdade. */
  agora?: () => number;
  /**
   * Para onde vai o que a rodada tem a dizer. `nivel` ausente é `warn`, que é
   * o que toda linha daqui era até 15/09/2026; o resumo de rodada bem-sucedida
   * sai como `info`, para o log de produção não gritar quando está tudo certo.
   */
  registrar?: (
    evento: Record<string, unknown>,
    mensagem: string,
    nivel?: "info" | "warn",
  ) => void;
};

const ESPERA_PADRAO_MINUTOS = 10;
const TENTATIVAS_PADRAO = 5;
const TETO_PADRAO = 500;
const RETENCAO_PADRAO_DIAS = 90;

/**
 * O PISO DA RETENÇÃO, e ele existe porque a policy do banco tem um.
 *
 * A migração 037 dá a `notificacoes_enviadas` uma policy de DELETE com a idade
 * escrita dentro (`enviada_em < now() - interval '30 days'`), que é o que
 * impede a policy de virar licença para apagar notificação recente.
 *
 * Só que condição de idade fixa numa policy, contra um prazo que chega por
 * parâmetro, reabre exatamente o silêncio que a 037 veio fechar: com retenção
 * configurada abaixo do piso, as linhas entre os dois números ficam no banco,
 * e o `DELETE` volta dizendo zero sem estourar. Ninguém descobre.
 *
 * Então a recusa é EXPLÍCITA e acontece antes de qualquer varredura. Melhor um
 * processo que não sobe dizendo o número exato do que um expurgo que roda todo
 * dia e não apaga nada.
 */
export const RETENCAO_MINIMA_DIAS = 30;
const TEMPO_LIMITE_PADRAO_DA_RODADA_MS = 4 * 60_000;

export async function varrerAvisos(dep: DependenciasDoVarredor): Promise<ResumoDaVarredura> {
  const retencaoDias = dep.retencaoDias ?? RETENCAO_PADRAO_DIAS;
  if (retencaoDias < RETENCAO_MINIMA_DIAS) {
    throw new Error(
      `Retenção de ${retencaoDias} dias é menor que o piso de ${RETENCAO_MINIMA_DIAS}, `
      + "que está escrito na policy de expurgo da migração 037. Abaixo dele o "
      + "DELETE não enxerga as linhas mais novas que o piso, volta dizendo zero "
      + "e não estoura: o dado fica no banco e o documento afirma que saiu. "
      + "Para reter menos que isso, baixe o piso na policy primeiro, com "
      + "migração nova.",
    );
  }

  const resumo: ResumoDaVarredura = {
    travado: false, reivindicadas: 0, entregues: 0, falhas: 0, aparelhosRevogados: 0,
    adiadasPorTempo: 0, detalhesDasFalhas: {},
  };
  const contarFalha = (detalhe: string | null) => {
    resumo.falhas += 1;
    const motivo = detalhe ?? "(sem detalhe)";
    resumo.detalhesDasFalhas[motivo] = (resumo.detalhesDasFalhas[motivo] ?? 0) + 1;
  };
  const registrar = dep.registrar ?? (() => {});
  const agora = dep.agora ?? (() => Date.now());
  const limiteDaRodada = agora()
    + (dep.tempoLimiteDaRodadaMs ?? TEMPO_LIMITE_PADRAO_DA_RODADA_MS);

  if (!(await dep.trava.tentar())) {
    // Não é erro nem aviso: é o comportamento correto quando a outra máquina
    // pegou a rodada. A informação existe para o dia em que alguém precisar
    // provar que a trava está funcionando.
    resumo.travado = true;
    return resumo;
  }

  try {
    const espera = `${dep.esperaMinutos ?? ESPERA_PADRAO_MINUTOS} minutes`;
    const tentativasMaximas = dep.tentativasMaximas ?? TENTATIVAS_PADRAO;
    const teto = dep.teto ?? TETO_PADRAO;

    /*
      As duas reivindicações na MESMA transação, e a tarefa nova antes do
      prazo. Uma transação só porque, se a segunda função estourar, a
      reivindicação da primeira volta atrás em vez de ficar `enviando` sem
      ninguém para enviar. O teto vale para cada função: no pior caso a rodada
      tem o dobro do teto, e o teto de tempo abaixo continua mandando.
    */
    const alvos = await dep.banco.semTenant(async (c): Promise<Alvo[]> => {
      const tarefas = await c.query<LinhaDeAlvo>(
        `SELECT ${COLUNAS_DO_ALVO} FROM varrer_tarefas_novas($1::interval, $2, $3)`,
        [espera, tentativasMaximas, teto],
      );
      const prazos = await c.query<LinhaDeAlvo>(
        `SELECT ${COLUNAS_DO_ALVO}
           FROM varrer_prazos($1::interval, $2::interval, $3, $4, $5::interval)`,
        [`${dep.janelaMinutos} minutes`, espera, tentativasMaximas, teto, `${retencaoDias} days`],
      );
      return [
        ...tarefas.rows.map((linha): Alvo => ({ ...linha, tipo: "tarefa_nova" })),
        ...prazos.rows.map((linha): Alvo => ({ ...linha, tipo: "prazo_vencendo" })),
      ];
    });

    resumo.reivindicadas = alvos.length;

    /*
      O AMBIENTE DA APNs DE CADA APARELHO, lido depois da reivindicação.

      `varrer_prazos` (016) e `varrer_tarefas_novas` (042) não devolvem a
      coluna `ambiente` (044), e redefinir duas funções SECURITY DEFINER para
      acrescentar uma coluna seria copiar cem linhas de SQL para dentro de uma
      migração nova. Uma consulta por município por rodada, debaixo do RLS,
      resolve o mesmo: só os aparelhos iOS entram, porque o Google não tem
      sandbox separado.

      Se esta leitura falhar, a rodada inteira falha e a trava é solta pelo
      `finally`: as linhas já reivindicadas voltam depois da espera. Cair em
      silêncio no padrão `producao` seria mandar a ficha do sandbox para a
      APNs de produção, que responde `BadDeviceToken`, e o varredor revogaria
      o aparelho de quem está em campo. É exatamente o defeito que a coluna
      existe para fechar.
    */
    const ambientes = await ambientesDosAparelhos(dep.banco, alvos);

    for (const alvo of alvos) {
      /*
        O teto de tempo da rodada é conferido ANTES de cada envio, e não
        depois: conferir depois já teria pago o custo que o teto existe para
        evitar.

        Parar aqui não perde notificação nenhuma. A reivindicação está gravada
        em `notificacoes_enviadas` (migração 016), então a rodada seguinte
        encontra estas de novo depois da espera. O que se perde é atraso, e é a
        troca certa: o alternativo é a trava presa e o produto inteiro mudo.
      */
      if (agora() >= limiteDaRodada) {
        resumo.adiadasPorTempo = alvos.length - (resumo.entregues + resumo.falhas);
        registrar(
          { reivindicadas: alvos.length, adiadas: resumo.adiadasPorTempo },
          "varredura de avisos interrompida pelo teto de tempo da rodada",
        );
        break;
      }

      /*
        Uma notificação por vez, e o erro de uma NÃO derruba as outras.

        O caso que isso protege é o de uma noite de temporal: cinquenta avisos
        na fila, o terceiro esbarra num aparelho com ficha estranha, e sem este
        `try` os quarenta e sete seguintes não sairiam. Notificação que não sai
        não pode virar notificação que ninguém recebe.
      */
      try {
        const notificacao = montarAviso(alvo.tipo, {
          organizacaoId: alvo.organizacao_id,
          ocorrenciaId: alvo.ocorrencia_id,
          severidade: alvo.severidade,
          prazoEm: alvo.prazo_em instanceof Date
            ? alvo.prazo_em.toISOString()
            : alvo.prazo_em,
        });

        const ambiente = ambientes.get(alvo.aparelho_id);
        const resultado = await dep.enviar(
          {
            ficha: alvo.ficha,
            plataforma: alvo.plataforma,
            ...(ambiente ? { ambiente } : {}),
          },
          notificacao,
        );

        await dep.banco.comTenant(alvo.organizacao_id, async (c) => {
          await c.query(
            "UPDATE notificacoes_enviadas SET desfecho = $1, detalhe = $2 WHERE id = $3",
            [resultado.desfecho, resultado.detalhe, alvo.notificacao_id],
          );

          /*
            Ficha morta revoga o aparelho, e é assim que a lista se limpa
            sozinha.

            Reinstalar o aplicativo troca a ficha; trocar de aparelho abandona
            a antiga. Sem esta revogação, cada aparelho aposentado vira uma
            tentativa por varredura para sempre, e a lista de destinos só
            cresce. Com ela, o aparelho que hoje pertence a outra pessoa para
            de receber tarefa da equipe de que o dono anterior fazia parte.
          */
          if (resultado.desfecho === "ficha_invalida") {
            const revogado = await c.query<{ id: string }>(
              `UPDATE aparelhos
                  SET revogado_em = now(),
                      motivo_revogacao = 'ficha recusada pelo provedor de notificacao'
                WHERE id = $1 AND revogado_em IS NULL
                RETURNING id`,
              [alvo.aparelho_id],
            );
            resumo.aparelhosRevogados += revogado.rows.length;
          }
        });

        if (resultado.desfecho === "entregue") resumo.entregues += 1;
        else contarFalha(resultado.detalhe ? semAFicha(resultado.detalhe, alvo.ficha) : null);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        contarFalha(`excecao: ${semAFicha(mensagem, alvo.ficha)}`);
        /*
          O log NÃO leva a ficha, nem o endereço, nem o protocolo. Leva o
          identificador da linha, que é o que permite ao suporte achar o
          registro. Log é lido por mais gente e guardado por mais tempo do que
          qualquer um imagina.
        */
        registrar(
          {
            notificacao: alvo.notificacao_id,
            tipo: alvo.tipo,
            erro: semAFicha(mensagem, alvo.ficha),
          },
          "falha ao tratar uma notificacao de push",
        );
      }
    }
  } finally {
    // `finally` e não o fim do bloco: uma exceção com a trava presa faria a
    // máquina seguinte desistir de todas as rodadas seguintes, e o produto
    // pararia de avisar sem ninguém perceber.
    await dep.trava.soltar();
  }

  /*
    A RODADA DIZ O QUE FEZ, e é a única linha de log que uma rodada normal
    produz.

    Até 15/09/2026 só exceção chegava ao log. O desfecho `falha` (a Apple
    recusando a credencial com `InvalidProviderToken`, o bundle errado com
    `TopicDisallowed`, o Google com `SENDER_ID_MISMATCH`) ia para a coluna
    `detalhe` e para lugar nenhum mais: cem por cento de recusa com o log
    limpo e `/saude` verde, e o único jeito de descobrir era abrir o banco.

    `warn` quando houve falha, com os motivos agregados; `info` quando
    entregou tudo; NADA quando não havia o que fazer, porque uma linha a cada
    cinco minutos dizendo "zero" ensina a equipe a ignorar log. Sem ficha,
    sem município, sem identificador de notificação: é resumo, não trilha.
  */
  if (resumo.reivindicadas > 0) {
    const evento = {
      reivindicadas: resumo.reivindicadas,
      entregues: resumo.entregues,
      falhas: resumo.falhas,
      revogados: resumo.aparelhosRevogados,
      adiadas: resumo.adiadasPorTempo,
      ...(resumo.falhas > 0 ? { detalhes: resumo.detalhesDasFalhas } : {}),
    };
    if (resumo.falhas > 0) {
      registrar(evento, "varredura de avisos terminou com falha de envio", "warn");
    } else {
      registrar(evento, "varredura de avisos concluida", "info");
    }
  }

  return resumo;
}

/**
 * Em qual APNs cada aparelho iOS da rodada fala. Ver o comentário no ponto
 * de uso, em `varrerAvisos`. Uma consulta por município, debaixo do RLS.
 */
async function ambientesDosAparelhos(
  banco: Banco,
  alvos: readonly LinhaDeAlvo[],
): Promise<Map<string, AmbienteApns>> {
  const porMunicipio = new Map<string, string[]>();
  for (const alvo of alvos) {
    if (alvo.plataforma !== "ios") continue;
    const lista = porMunicipio.get(alvo.organizacao_id) ?? [];
    lista.push(alvo.aparelho_id);
    porMunicipio.set(alvo.organizacao_id, lista);
  }

  const ambientes = new Map<string, AmbienteApns>();
  for (const [organizacaoId, ids] of porMunicipio) {
    const linhas = await banco.comTenant(organizacaoId, (c) =>
      c.query<{ id: string; ambiente: AmbienteApns }>(
        "SELECT id, ambiente FROM aparelhos WHERE id = ANY($1::uuid[])",
        [ids],
      ),
    );
    for (const linha of linhas.rows) ambientes.set(linha.id, linha.ambiente);
  }
  return ambientes;
}

export type VarreduraAgendada = {
  parar(): Promise<void>;
  /**
   * Pede uma rodada AGORA. É o que a rota de despacho chama depois do commit.
   *
   * Coalesce: com uma rodada em voo, o pedido fica anotado e vira UMA rodada
   * a mais quando a atual terminar, por mais despachos que cheguem nesse
   * meio tempo. Nunca abre rodada por cima de outra: a trava do banco e o
   * `SKIP LOCKED` aguentariam, mas seriam idas ao banco a troco de nada.
   */
  despertar(): void;
  /** O que a última rodada concluída (e não travada) deixou. `null` antes da primeira. */
  ultimaRodada(): UltimaRodada | null;
};

/**
 * Põe a varredura num relógio, e a acorda fora de hora quando alguém pede.
 *
 * A PRIMEIRA RODADA SAI NA PARTIDA, e não no primeiro tique. Com só
 * `setInterval`, todo deploy somava o intervalo inteiro (cinco minutos) ao
 * despacho que caiu nele: a rota enfileirava, o processo novo subia, e o
 * aviso esperava um relógio que ainda não tinha batido. E o próprio despacho,
 * que é uma pessoa decidindo agora que esta equipe vai, esperava até cinco
 * minutos para virar push. Agora a rota chama `despertar()` depois do commit
 * e a rodada sai em segundos; o intervalo continua como rede de segurança,
 * para o prazo (que é relógio) e para o despacho cujo `despertar()` se
 * perdeu com o processo.
 *
 * Três defesas pequenas e necessárias:
 *
 *   1. `unref()` no relógio: um temporizador vivo segura o processo em pé no
 *      encerramento, e o deploy passa a esperar o tempo do intervalo para
 *      trocar de versão.
 *   2. Trava de sobreposição no próprio processo: se uma varredura demorar
 *      mais que o intervalo, a seguinte não começa por cima dela. A trava do
 *      banco resolveria isso também, mas ela custa uma ida ao banco, e a
 *      resposta certa para "ainda estou varrendo" é não ir. `despertar()`
 *      respeita a mesma trava, anotando o pedido para depois.
 *   3. VIGIA da rodada, abaixo, para o caso em que a rodada não termina.
 */
export function agendarVarredura(
  dep: DependenciasDoVarredor,
  intervaloMs: number,
): VarreduraAgendada {
  let emAndamento = false;
  /** Alguém pediu rodada enquanto uma estava em voo. Vale por uma, só. */
  let pedidoPendente = false;
  let parado = false;
  let ultima: UltimaRodada | null = null;
  const registrar = dep.registrar ?? (() => {});
  /*
    O vigia solta a trava quando a rodada NÃO TERMINA.

    O teto por chamada e o teto por rodada, lá em cima, são cooperativos: os
    dois dependem de o laço continuar rodando. Este aqui cobre a hipótese que
    eles não cobrem, e que é a que prende a trava de verdade: uma promessa que
    nunca resolve nem rejeita, por um `await` pendurado em qualquer biblioteca
    que não respeite sinal de aborto. Ali o `finally` do `varrerAvisos` nunca
    executa, `dep.trava.soltar()` nunca é chamado, e a trava de aviso do
    Postgres fica presa à conexão exclusiva da trava até o processo morrer. A
    consequência é a pior possível para um sistema de emergência: a outra
    máquina do Fly desiste de TODAS as rodadas seguintes, e o produto para de
    avisar prazo sem um erro, sem falha de health check e sem alerta.

    Soltar a trava por fora significa admitir que outra máquina pode varrer
    junto com a rodada travada, e essa é a troca deliberada. A duplicata é
    barrada pela segunda barreira, que é a unicidade em `notificacoes_enviadas`
    (ver `trava.ts`): trava de processo cai junto com o processo, linha em
    tabela não. Entre "pode haver notificação repetida" e "não sai notificação
    nenhuma, em lugar nenhum, até alguém reimplantar", o produto escolhe a
    primeira.

    O prazo do vigia é o dobro do teto da rodada: se ele disparasse junto,
    dispararia em toda rodada que apenas encostou no teto, que é justamente
    quando o mecanismo cooperativo está funcionando.
  */
  const tetoDaRodada = dep.tempoLimiteDaRodadaMs ?? TEMPO_LIMITE_PADRAO_DA_RODADA_MS;

  function rodar(): void {
    if (parado) return;
    if (emAndamento) {
      pedidoPendente = true;
      return;
    }
    emAndamento = true;
    pedidoPendente = false;

    let rodadaViva = true;
    const vigia = setTimeout(() => {
      if (!rodadaViva) return;
      registrar(
        { tetoMs: tetoDaRodada * 2 },
        "varredura de avisos nao terminou no teto: a trava foi solta por fora",
      );
      void dep.trava.soltar().catch(() => undefined);
      // `emAndamento` volta a `false` aqui de propósito: a rodada presa não
      // pode impedir para sempre que o relógio tente de novo.
      emAndamento = false;
    }, tetoDaRodada * 2);
    if (typeof vigia.unref === "function") vigia.unref();

    void varrerAvisos(dep)
      .then((resumo) => {
        /*
          A rodada que perdeu a trava para a outra máquina NÃO entra no
          quadro: zeros de uma rodada que nem rodou pareceriam "não havia
          nada a enviar". O quadro é o que ESTA máquina fez.
        */
        if (resumo.travado) return;
        ultima = {
          rodadaEm: new Date().toISOString(),
          reivindicadas: resumo.reivindicadas,
          entregues: resumo.entregues,
          falhas: resumo.falhas,
          revogados: resumo.aparelhosRevogados,
        };
      })
      .catch((erro: unknown) => {
        // A varredura inteira falhando não pode derrubar a API. Ela volta no
        // próximo tique.
        registrar(
          { erro: erro instanceof Error ? erro.message : String(erro) },
          "varredura de avisos falhou inteira",
        );
      })
      .finally(() => {
        rodadaViva = false;
        clearTimeout(vigia);
        emAndamento = false;
        // O despacho que chegou durante a rodada, depois da reivindicação,
        // não pode esperar o relógio: uma rodada a mais, e só uma.
        if (pedidoPendente) rodar();
      });
  }

  const relogio = setInterval(rodar, intervaloMs);
  relogio.unref();

  // A rodada da partida, pelo mesmo caminho do relógio.
  rodar();

  return {
    despertar: rodar,
    ultimaRodada: () => ultima,
    async parar() {
      parado = true;
      clearInterval(relogio);
      await dep.trava.encerrar();
    },
  };
}
