import { IDENTIDADES_DE_PROD, type EntradaDaGuarda } from "./guarda-da-semente.js";
import {
  TABELA_DE_MIGRACOES,
  migracoesAplicadas,
  tomarTravaDeMigracao,
  type ExecutorSql,
  type Migracao,
  type OpcoesDaTrava,
} from "./migrar.js";
import { cabecalhoIrreversivel, type Desfazer } from "./regras-de-migracao.js";

/**
 * Desfazer a última migração (V2-F01-E18). Só fora de produção.
 *
 * O desfazer APAGA dado: o que a migração criou (tabela, coluna) some com o
 * que estava dentro. Em produção isso não é um passo de rotina, é uma perda.
 * Lá o caminho de volta é migração aditiva (uma nova, que corrige) ou restaurar
 * a cópia (F22-E04). Por isso a recusa é a primeira coisa que acontece, antes
 * de conectar ou de tomar qualquer trava.
 *
 * Desfaz UMA migração por vez, a última do registro. Voltar várias é rodar o
 * comando de novo, olhando o resultado de cada uma: pular por cima de uma volta
 * que falha esconderia em que estado o banco ficou.
 */

export class DesfazerRecusado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "DesfazerRecusado";
  }
}

/**
 * Devolve o MOTIVO de recusar o desfazer, ou `null`. Fail-closed no que sabe
 * reconhecer como produção: `AMBIENTE_DC360=prod`, `NODE_ENV=production` ou uma
 * URL que traz a identidade de um banco de PRODUÇÃO (a conhecida, ou a que o
 * processo declara). Nunca repete a URL: a senha mora nela.
 */
export function motivoParaNaoDesfazer({ url, env }: EntradaDaGuarda): string | null {
  const ambiente = env["AMBIENTE_DC360"]?.trim();
  if (ambiente === "prod") {
    return (
      "--desfazer não é permitido com AMBIENTE_DC360=prod: desfazer apaga dado. Em produção, " +
      "corrija com uma migração nova (aditiva) ou restaure a cópia (runbook de restore)."
    );
  }
  if (env["NODE_ENV"] === "production") {
    return (
      "--desfazer não é permitido com NODE_ENV=production: desfazer apaga dado. Em produção, " +
      "corrija com uma migração nova (aditiva) ou restaure a cópia (runbook de restore)."
    );
  }

  const protegidas = [
    ...IDENTIDADES_DE_PROD,
    env["IDENTIDADE_DO_BANCO"]?.trim(),
    env["CONSOLE_IDENTIDADE_DO_BANCO"]?.trim(),
  ]
    .filter((i): i is string => Boolean(i))
    .map((i) => i.toLowerCase());
  const textoDaUrl = (url ?? "").toLowerCase();
  if (protegidas.some((i) => textoDaUrl.includes(i))) {
    return (
      "--desfazer recusou a DATABASE_URL: ela traz a identidade de um banco de PRODUÇÃO " +
      "(ou do banco declarado em IDENTIDADE_DO_BANCO). Desfazer apaga dado."
    );
  }
  return null;
}

/** `desfeita` é o nome da migração desfeita, ou `null` com o `motivo` de não haver o que desfazer. */
export type ResultadoDesfazer = { desfeita: string | null; motivo?: string };

export async function desfazerUltimaMigracao(
  bd: ExecutorSql,
  migracoes: readonly Migracao[],
  desfazeres: readonly Desfazer[],
  contexto: EntradaDaGuarda,
  opcoes: { registrar?: (mensagem: string) => void; trava?: OpcoesDaTrava } = {},
): Promise<ResultadoDesfazer> {
  const recusa = motivoParaNaoDesfazer(contexto);
  if (recusa) throw new DesfazerRecusado(recusa);

  const registrar = opcoes.registrar ?? (() => undefined);
  const soltar = await tomarTravaDeMigracao(bd, { ...opcoes.trava, registrar });
  try {
    // `migracoesAplicadas` já vem em ordem de versão e não cria tabela.
    const aplicadas = await migracoesAplicadas(bd);
    const ultima = aplicadas[aplicadas.length - 1]?.versao;
    if (!ultima) return { desfeita: null, motivo: "Nenhuma migração aplicada: nada a desfazer." };

    const migracao = migracoes.find((m) => m.versao === ultima);
    if (!migracao) {
      throw new DesfazerRecusado(
        `A última migração aplicada neste banco é ${ultima}, mas esse arquivo não existe nesta ` +
          "versão do código. Desfazer exige o arquivo da migração e o da volta; use o código " +
          "que a aplicou.",
      );
    }

    const cabecalho = cabecalhoIrreversivel(migracao.sql);
    if (cabecalho && cabecalho !== "malformado") {
      throw new DesfazerRecusado(
        `${ultima} está declarada IRREVERSIVEL (${cabecalho.motivo}; aprovado por ` +
          `${cabecalho.aprovadoPor}; ${cabecalho.data}) e não tem volta. Descarte e recrie o banco.`,
      );
    }

    const volta = desfazeres.find((d) => d.versao === ultima);
    if (!volta) {
      throw new DesfazerRecusado(
        `${ultima} não tem arquivo em db/migrations/desfazer/. As migrações até a 051 foram ` +
          "aplicadas antes da regra e não têm volta: em banco descartável, recrie o banco.",
      );
    }

    registrar(`desfazendo ${ultima}`);
    await bd.exec("BEGIN");
    try {
      await bd.exec(volta.sql);
      await bd.query(`DELETE FROM ${TABELA_DE_MIGRACOES} WHERE versao = $1`, [ultima]);
      await bd.exec("COMMIT");
    } catch (erro) {
      await bd.exec("ROLLBACK").catch(() => undefined);
      throw new Error(
        `Falha ao desfazer ${ultima}: ${erro instanceof Error ? erro.message : String(erro)}`,
        { cause: erro },
      );
    }
    return { desfeita: ultima };
  } finally {
    await soltar();
  }
}
