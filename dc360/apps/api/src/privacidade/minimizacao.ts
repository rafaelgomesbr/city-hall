import type { Banco } from "../banco/tipos.js";
import type { Trava } from "../push/trava.js";
import type { NivelDoRegistro } from "../observabilidade/reportador.js";

/**
 * A varredura que executa a minimização por prazo.
 *
 * O QUE ELA EXISTE PARA IMPEDIR: `docs/PRIVACIDADE.md` promete, na seção 4,
 * que nome e contato do solicitante viram marcador de "removido por prazo"
 * quando o prazo do município vence, e que isso é "executado pelo sistema, não
 * por lembrete". Sem este laço, a promessa dependeria de alguém rodar um
 * comando à mão todo mês, e ninguém roda. O documento passaria a descrever um
 * comportamento que o produto não tem, que é a pior espécie de documento
 * jurídico: um que parece verdade.
 *
 * TODA A REGRA MORA NO BANCO, na função `minimizar_por_prazo` da migração 021.
 * Aqui não existe prazo, não existe critério de qual campo sai, e não existe
 * município: este arquivo é relógio, trava e log, e nada mais. Isso é
 * deliberado, porque a decisão de destruir dado de cidadão não pode depender
 * de qual versão do processo Node está no ar naquele momento.
 *
 * A ARMADILHA QUE A TRAVA RESOLVE é a mesma da varredura de prazo: em produção
 * a API roda em duas máquinas no Fly, e as duas sobem este relógio. Sem trava,
 * as duas chamam a função ao mesmo tempo. O banco não corromperia nada (a
 * própria função só alcança quem ainda não tem marcador), mas as duas
 * gravariam evento de trilha para a mesma remoção, e a trilha é append-only:
 * o registro duplicado ficaria lá para sempre, dizendo que o dado foi removido
 * duas vezes.
 */

export type ResumoDaMinimizacao = {
  /** `true` quando outra máquina estava varrendo e esta desistiu da rodada. */
  travado: boolean;
  /** Quantas ocorrências tiveram algum campo removido nesta rodada. */
  ocorrencias: number;
  /** Quantos campos ao todo. Uma ocorrência pode perder três de uma vez. */
  campos: number;
};

/**
 * O texto que substitui o nome, e ele é MARCADOR e não `NULL`.
 *
 * `NULL` não distingue "nunca teve nome" de "o nome foi descartado no prazo", e
 * o segundo precisa ser demonstrável: numa auditoria o município tem que
 * conseguir mostrar que CUMPRIU a retenção, e não que deixou o campo em branco.
 *
 * A mesma constante está escrita na migração 021, dentro da restrição
 * `marcador_de_remocao_e_coerente`. Não é duplicação solta: qualquer caminho
 * que carimbe a data de remoção e escreva outro texto é recusado pelo Postgres,
 * então os dois lados não têm como divergir em silêncio.
 */
export const MARCADOR_REMOVIDO_POR_PRAZO = "removido por prazo";

/**
 * Teto de ocorrências por rodada.
 *
 * Não é sobre carga: é sobre a PRIMEIRA rodada. Um município com três anos de
 * histórico que acabou de configurar o prazo tem milhares de ocorrências
 * vencidas de uma vez, e sem teto tudo isso viraria uma transação só,
 * segurando trava em milhares de linhas de `ocorrencias`, que é a tabela mais
 * consultada do produto, possivelmente no meio de uma noite de chuva.
 *
 * Com teto, a mesma limpeza acontece em rodadas seguidas e ninguém na frente
 * da tela percebe. O preço é levar algumas horas para pôr o histórico em dia
 * na primeira vez, e isso não tem custo nenhum: o prazo é medido em dias.
 */
const TETO_PADRAO = 500;

export type DependenciasDaMinimizacao = {
  /** Pool próprio, separado do das requisições. */
  banco: Banco;
  trava: Trava;
  teto?: number;
  /**
   * Para onde vai o que a rotina tem a dizer. `nivel` ausente é `info`; FALHA
   * sai sempre como `error` (V2-F01-E14), porque é o nível em que o alerta do
   * destino de logs dispara. Rotina que falha em `info` só é vista por quem
   * abre o log de propósito.
   */
  registrar?: (evento: Record<string, unknown>, mensagem: string, nivel?: NivelDoRegistro) => void;
};

type LinhaMinimizada = {
  municipio: string;
  ocorrencia: string;
  campos_removidos: string[];
};

export async function minimizarPorPrazo(
  dep: DependenciasDaMinimizacao,
): Promise<ResumoDaMinimizacao> {
  const resumo: ResumoDaMinimizacao = { travado: false, ocorrencias: 0, campos: 0 };
  const registrar = dep.registrar ?? (() => {});

  if (!(await dep.trava.tentar())) {
    resumo.travado = true;
    return resumo;
  }

  try {
    const linhas = await dep.banco.semTenant(async (c) => {
      const r = await c.query<LinhaMinimizada>(
        "SELECT * FROM minimizar_por_prazo($1)",
        [dep.teto ?? TETO_PADRAO],
      );
      return r.rows;
    });

    resumo.ocorrencias = linhas.length;
    for (const linha of linhas) resumo.campos += linha.campos_removidos.length;

    if (linhas.length > 0) {
      /*
        O log conta QUANTAS, e nunca QUAIS.

        Registrar protocolo, endereço ou identificador de ocorrência aqui faria
        o log virar o último lugar do sistema onde o dado descartado continua
        apontável, e log é lido por mais gente e guardado por mais tempo do que
        qualquer um imagina. Quem precisa saber quais ocorrências foram
        minimizadas lê a trilha de cada uma, que é onde a informação pertence e
        onde ela está sob RLS.

        Mas a linha PRECISA existir: sem nenhum sinal no log, a diferença entre
        "a varredura rodou e não achou nada" e "a varredura parou de rodar em
        março" é invisível, e a segunda é a que produz dado pessoal vivo além
        do prazo que o município prometeu.
      */
      registrar(
        { ocorrencias: resumo.ocorrencias, campos: resumo.campos },
        "minimizacao por prazo executada",
      );
    }
  } finally {
    // `finally` e não o fim do bloco: uma exceção com a trava presa faria a
    // máquina seguinte desistir de todas as rodadas seguintes, e a retenção
    // pararia de ser executada sem ninguém perceber.
    await dep.trava.soltar();
  }

  return resumo;
}

export type MinimizacaoAgendada = { parar(): Promise<void> };

/**
 * Põe a minimização num relógio.
 *
 * As mesmas duas defesas da varredura de prazo, pelas mesmas razões: `unref()`
 * para o temporizador não segurar o processo em pé durante um deploy, e trava
 * de sobreposição no próprio processo para uma rodada demorada não ganhar
 * outra por cima.
 */
export function agendarMinimizacao(
  dep: DependenciasDaMinimizacao,
  intervaloMs: number,
): MinimizacaoAgendada {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});

  const relogio = setInterval(() => {
    if (emAndamento) return;
    emAndamento = true;
    void minimizarPorPrazo(dep)
      .catch((erro: unknown) => {
        registrar(
          { erro: erro instanceof Error ? erro.message : String(erro) },
          "minimizacao por prazo falhou inteira",
          "error",
        );
      })
      .finally(() => { emAndamento = false; });
  }, intervaloMs);

  relogio.unref();

  return {
    async parar() {
      clearInterval(relogio);
      await dep.trava.encerrar();
    },
  };
}
