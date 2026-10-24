import type { Trava } from "../push/trava.js";
import type { NivelDoRegistro } from "../observabilidade/reportador.js";
import type { Armazenamento } from "./tipos.js";

/**
 * O alerta de armazenamento do BUCKET INTEIRO (V2-F01-E14, OPS-45).
 *
 * `uso.ts` e a função `situacao_de_armazenamento` do banco cuidam do teto de
 * CADA município, contratado com ele. Este alerta é de outra natureza: é o
 * balde do provedor, o que o fornecedor paga e que, se encher, para TODOS os
 * municípios de uma vez. A cota (`S3_COTA_BYTES`) é o que o fornecedor
 * contratou com o provedor, e o alerta acende acima de 80% dela, folga em que
 * ainda dá para pedir mais espaço sem que ninguém tenha foto recusada em campo.
 *
 * COMO O ALERTA CHEGA A ALGUÉM: ele é uma linha de log em nível `error`, e quem
 * a transforma em aviso para uma pessoa é a regra do destino de logs e do
 * monitor (F21-E06 e CP-06). Sem essa regra a linha existe e ninguém é
 * acordado: por isso o RESUMO da etapa lista a regra como pendência humana, e
 * não a dá por entregue.
 *
 * A medição percorre o balde inteiro (`listar("")`), que é chamada cobrada pelo
 * provedor, a mesma da varredura de órfãos: por isso roda uma vez por dia, com
 * trava, e nunca por requisição. O log leva só contagens e percentual: chave de
 * objeto carrega o identificador do município e fica fora dele.
 */

export const LIMIAR_DO_ALERTA_DE_COTA = 0.8;

/**
 * Número da trava no banco, escolhido à mão como os das outras rotinas, e
 * distinto delas (ver `push/trava.ts`): duas máquinas não listam o balde juntas.
 */
export const CHAVE_DO_ALERTA_DE_COTA = 5410360047;

/** Teto de páginas por medição: continuação que não termina não prende a rotina. */
const PAGINAS_MAXIMAS = 100_000;

export type DependenciasDoAlertaDeCota = {
  armazenamento: Armazenamento;
  /** A cota do bucket em bytes (`S3_COTA_BYTES`). */
  cotaBytes: number;
  trava?: Trava;
  limiar?: number;
  registrar?: (evento: Record<string, unknown>, mensagem: string, nivel?: NivelDoRegistro) => void;
};

export type ResumoDoAlertaDeCota = {
  travado: boolean;
  objetos: number;
  bytes: number;
  /** Fração da cota usada (0.82 é 82%), ou `null` se a medição falhou. */
  fracao: number | null;
  situacao: "dentro_da_cota" | "acima_do_limiar" | "medicao_falhou" | "travado";
};

export async function conferirCotaDeArmazenamento(
  dep: DependenciasDoAlertaDeCota,
): Promise<ResumoDoAlertaDeCota> {
  const registrar = dep.registrar ?? (() => {});
  const limiar = dep.limiar ?? LIMIAR_DO_ALERTA_DE_COTA;
  const resumo: ResumoDoAlertaDeCota = {
    travado: false, objetos: 0, bytes: 0, fracao: null, situacao: "medicao_falhou",
  };

  if (dep.trava && !(await dep.trava.tentar())) {
    resumo.travado = true;
    resumo.situacao = "travado";
    return resumo;
  }

  try {
    let continuacao: string | undefined;
    let paginas = 0;
    do {
      const pagina = await dep.armazenamento.listar("", continuacao);
      if (pagina.falha) {
        /*
          Listagem parcial NÃO vira número. Somar o que deu para ler diria
          "estamos em 40%" quando o balde está em 90%, e um alerta que
          subestima é pior que a falta dele.
        */
        registrar(
          { objetosLidos: resumo.objetos },
          "nao foi possivel medir o armazenamento: a listagem do bucket falhou",
          "error",
        );
        return resumo;
      }
      for (const objeto of pagina.objetos) {
        resumo.objetos += 1;
        resumo.bytes += objeto.tamanhoBytes;
      }
      const proxima = pagina.continuacao ?? undefined;
      paginas += 1;
      if (proxima !== undefined && (proxima === continuacao || paginas >= PAGINAS_MAXIMAS)) {
        registrar(
          { objetosLidos: resumo.objetos },
          "nao foi possivel medir o armazenamento: a listagem do bucket nao terminou",
          "error",
        );
        return resumo;
      }
      continuacao = proxima;
    } while (continuacao);

    resumo.fracao = resumo.bytes / dep.cotaBytes;
    // `>` e não `>=`: "acima de 80%" é o que o texto da etapa diz.
    const acima = resumo.fracao > limiar;
    resumo.situacao = acima ? "acima_do_limiar" : "dentro_da_cota";
    registrar(
      {
        objetos: resumo.objetos,
        bytes: resumo.bytes,
        cotaBytes: dep.cotaBytes,
        percentual: Math.round(resumo.fracao * 1000) / 10,
      },
      acima
        ? "armazenamento acima do limiar de alerta da cota do bucket"
        : "armazenamento dentro da cota do bucket",
      acima ? "error" : "info",
    );
    return resumo;
  } finally {
    // `finally`: trava presa faria a outra máquina desistir de todas as rodadas.
    await dep.trava?.soltar();
  }
}

export type AlertaDeCotaAgendado = { parar(): Promise<void> };

/**
 * Põe a medição num relógio, com a primeira rodada na partida: sem ela um
 * deploy por dia reinicia o temporizador e a medição nunca chega a rodar. A
 * medição da partida não bloqueia a subida da API.
 */
export function agendarAlertaDeCota(
  dep: DependenciasDoAlertaDeCota,
  intervaloMs: number,
): AlertaDeCotaAgendado {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});

  async function rodada(): Promise<void> {
    if (emAndamento) return;
    emAndamento = true;
    try {
      await conferirCotaDeArmazenamento(dep);
    } catch (erro) {
      registrar(
        { erro: erro instanceof Error ? erro.message : String(erro) },
        "a medicao de armazenamento falhou inteira",
        "error",
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
      await dep.trava?.encerrar();
    },
  };
}
