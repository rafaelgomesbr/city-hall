import type { Banco } from "../banco/tipos.js";
import type { EnvioDePush, Plataforma } from "./envio.js";
import { montarAviso } from "./mensagem.js";
import type { Trava } from "./trava.js";

/**
 * O laço que descobre prazo vencendo e avisa a equipe responsável.
 *
 * Sem ele, o prazo de uma vistoria vence e ninguém fica sabendo: o coordenador
 * só descobre quando abre a tela, e quem está na rua não abre tela nenhuma.
 *
 * TRÊS GARANTIAS SUSTENTAM ESTE LAÇO, e cada uma cobre uma falha diferente:
 *
 *   1. TRAVA (ver `trava.ts`). Duas máquinas no Fly varrem ao mesmo tempo, e
 *      sem trava o agente recebe tudo em duplicata.
 *   2. CONEXÃO SEPARADA. O `banco` que chega aqui tem pool próprio, pequeno,
 *      e não é o das requisições. Uma varredura lenta não pode consumir as
 *      conexões que o agente em campo precisa para sincronizar a vistoria,
 *      que é a operação que não pode esperar.
 *   3. IDEMPOTÊNCIA NO BANCO. A função `varrer_prazos` (migração 016)
 *      reivindica a notificação ANTES de qualquer conversa com a Apple, e só
 *      devolve o que ela conseguiu reivindicar. Reiniciar o processo não
 *      remanda o que já foi mandado, porque quem lembra é a tabela e não a
 *      memória do processo.
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
};

type LinhaDeAlvo = {
  notificacao_id: string;
  organizacao_id: string;
  aparelho_id: string;
  ficha: string;
  plataforma: Plataforma;
  ocorrencia_id: string;
  protocolo: string;
  endereco: string;
  severidade: string | null;
  prazo_em: string | Date | null;
};

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
  registrar?: (evento: Record<string, unknown>, mensagem: string) => void;
};

const ESPERA_PADRAO_MINUTOS = 10;
const TENTATIVAS_PADRAO = 5;
const TETO_PADRAO = 500;
const RETENCAO_PADRAO_DIAS = 90;
const TEMPO_LIMITE_PADRAO_DA_RODADA_MS = 4 * 60_000;

export async function varrerPrazos(dep: DependenciasDoVarredor): Promise<ResumoDaVarredura> {
  const resumo: ResumoDaVarredura = {
    travado: false, reivindicadas: 0, entregues: 0, falhas: 0, aparelhosRevogados: 0,
    adiadasPorTempo: 0,
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
    const alvos = await dep.banco.semTenant(async (c) => {
      const r = await c.query<LinhaDeAlvo>(
        "SELECT * FROM varrer_prazos($1::interval, $2::interval, $3, $4, $5::interval)",
        [
          `${dep.janelaMinutos} minutes`,
          `${dep.esperaMinutos ?? ESPERA_PADRAO_MINUTOS} minutes`,
          dep.tentativasMaximas ?? TENTATIVAS_PADRAO,
          dep.teto ?? TETO_PADRAO,
          `${dep.retencaoDias ?? RETENCAO_PADRAO_DIAS} days`,
        ],
      );
      return r.rows;
    });

    resumo.reivindicadas = alvos.length;

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
          "varredura de prazo interrompida pelo teto de tempo da rodada",
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
        const notificacao = montarAviso("prazo_vencendo", {
          organizacaoId: alvo.organizacao_id,
          ocorrenciaId: alvo.ocorrencia_id,
          severidade: alvo.severidade,
          prazoEm: alvo.prazo_em instanceof Date
            ? alvo.prazo_em.toISOString()
            : alvo.prazo_em,
        });

        const resultado = await dep.enviar(
          { ficha: alvo.ficha, plataforma: alvo.plataforma },
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
        else resumo.falhas += 1;
      } catch (erro) {
        resumo.falhas += 1;
        /*
          O log NÃO leva a ficha, nem o endereço, nem o protocolo. Leva o
          identificador da linha, que é o que permite ao suporte achar o
          registro. Log é lido por mais gente e guardado por mais tempo do que
          qualquer um imagina.
        */
        registrar(
          {
            notificacao: alvo.notificacao_id,
            erro: erro instanceof Error ? erro.message : String(erro),
          },
          "falha ao tratar uma notificacao de prazo",
        );
      }
    }
  } finally {
    // `finally` e não o fim do bloco: uma exceção com a trava presa faria a
    // máquina seguinte desistir de todas as rodadas seguintes, e o produto
    // pararia de avisar sem ninguém perceber.
    await dep.trava.soltar();
  }

  return resumo;
}

export type VarreduraAgendada = { parar(): Promise<void> };

/**
 * Põe a varredura num relógio.
 *
 * Três defesas pequenas e necessárias:
 *
 *   1. `unref()` no relógio: um temporizador vivo segura o processo em pé no
 *      encerramento, e o deploy passa a esperar o tempo do intervalo para
 *      trocar de versão.
 *   2. Trava de sobreposição no próprio processo: se uma varredura demorar
 *      mais que o intervalo, a seguinte não começa por cima dela. A trava do
 *      banco resolveria isso também, mas ela custa uma ida ao banco, e a
 *      resposta certa para "ainda estou varrendo" é não ir.
 *   3. VIGIA da rodada, abaixo, para o caso em que a rodada não termina.
 */
export function agendarVarredura(
  dep: DependenciasDoVarredor,
  intervaloMs: number,
): VarreduraAgendada {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});
  /*
    O vigia solta a trava quando a rodada NÃO TERMINA.

    O teto por chamada e o teto por rodada, lá em cima, são cooperativos: os
    dois dependem de o laço continuar rodando. Este aqui cobre a hipótese que
    eles não cobrem, e que é a que prende a trava de verdade: uma promessa que
    nunca resolve nem rejeita, por um `await` pendurado em qualquer biblioteca
    que não respeite sinal de aborto. Ali o `finally` do `varrerPrazos` nunca
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

  const relogio = setInterval(() => {
    if (emAndamento) return;
    emAndamento = true;

    let rodadaViva = true;
    const vigia = setTimeout(() => {
      if (!rodadaViva) return;
      registrar(
        { tetoMs: tetoDaRodada * 2 },
        "varredura de prazo nao terminou no teto: a trava foi solta por fora",
      );
      void dep.trava.soltar().catch(() => undefined);
      // `emAndamento` volta a `false` aqui de propósito: a rodada presa não
      // pode impedir para sempre que o relógio tente de novo.
      emAndamento = false;
    }, tetoDaRodada * 2);
    if (typeof vigia.unref === "function") vigia.unref();

    void varrerPrazos(dep)
      .catch((erro: unknown) => {
        // A varredura inteira falhando não pode derrubar a API. Ela volta no
        // próximo tique.
        registrar(
          { erro: erro instanceof Error ? erro.message : String(erro) },
          "varredura de prazo falhou inteira",
        );
      })
      .finally(() => {
        rodadaViva = false;
        clearTimeout(vigia);
        emAndamento = false;
      });
  }, intervaloMs);

  relogio.unref();

  return {
    async parar() {
      clearInterval(relogio);
      await dep.trava.encerrar();
    },
  };
}
