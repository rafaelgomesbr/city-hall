import {
  IDENTIDADES_DE_PROD,
  hostEhDescartavel,
  segmentosDaUrl,
  type EntradaDaGuarda,
} from "./guarda-da-semente.js";
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
 * Desfazer a última migração (V2-F01-E18). Só em banco descartável ou de HML.
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
 * Nomes de papel, pedaços de host do provedor e palavras de ambiente que NÃO
 * identificam um banco de HML: constam na URL de qualquer ambiente do mesmo
 * provedor, e uma `IDENTIDADE_DO_BANCO` igual a um deles liberaria o desfazer
 * contra o banco de PROD. Contém as listas `PAPEIS_DE_BANCO` e
 * `SEGMENTOS_GENERICOS_DE_HOST` de `apps/api/src/ambiente.ts` (o teste
 * `desfazer-migracao.test.ts` confere), mais os rótulos de provedor mais comuns.
 */
export const IDENTIDADES_GENERICAS: readonly string[] = [
  "postgres",
  "authenticator",
  "authenticated",
  "anon",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
  "pgbouncer",
  "dc360_api",
  "dc360_app",
  "dc360_setup",
  "dc360_console",
  "dc360_console_login",
  "pooler",
  "supabase",
  "database",
  "postgresql",
  "amazonaws",
  "localhost",
  "flycast",
  "internal",
  "transaction",
  "session",
  "producao",
  "production",
  "homologacao",
  "staging",
  "desenvolvimento",
  "development",
  "firebaseapp",
  "herokuapp",
  "onrender",
];

/** A referência de HML declarada é específica o bastante para provar que a URL é de HML? */
function identidadeDeHmlServe(identidade: string): boolean {
  const id = identidade.toLowerCase();
  return (
    id.length >= 8 &&
    !/^dc360_/.test(id) &&
    !IDENTIDADES_GENERICAS.includes(id) &&
    !/^aws-\d+-[a-z]{2}-[a-z]+-\d+$/.test(id) &&
    !/^[a-z]{2}-[a-z]+-\d+$/.test(id)
  );
}

/**
 * Devolve o MOTIVO de recusar o desfazer, ou `null`. FAIL-CLOSED, como a guarda
 * do `--semear`: o desfazer só roda onde o dado pode ser perdido.
 *
 * Antes (revisão 1 da F01) ele recusava só o que RECONHECIA como produção
 * (`AMBIENTE_DC360=prod`, `NODE_ENV=production` ou a identidade conhecida do
 * banco de PROD na URL). Um PROD restaurado num projeto novo, com outra
 * referência, não era reconhecido por nada disso: bastava a URL dele numa
 * máquina sem variável nenhuma e o desfazer apagava dado de município real.
 *
 * Agora só desfaz em um destes dois casos:
 *   1. banco DESCARTÁVEL: sem `DATABASE_URL` (o Postgres em WebAssembly), ou
 *      host que é a própria máquina (`localhost`, `127.0.0.1`, `::1`) ou serviço
 *      do Docker (um rótulo só, sem ponto);
 *   2. HOMOLOGAÇÃO declarada: `AMBIENTE_DC360=hml` e `IDENTIDADE_DO_BANCO` com a
 *      referência do projeto de HML (específica, diferente da de PROD) constando
 *      no usuário ou no host da URL, por segmento.
 *
 * E em qualquer caso recusa `AMBIENTE_DC360=prod`, `NODE_ENV=production` (fora do
 * HML declarado), URL que não dá para analisar e URL que traz a identidade de um
 * banco de PRODUÇÃO. Banco hospedado sem a declaração de HML recusa: ele pode ser
 * qualquer coisa, inclusive os municípios de verdade. Nunca repete a URL: a senha
 * mora nela.
 */
export function motivoParaNaoDesfazer({ url, env }: EntradaDaGuarda): string | null {
  const ambiente = env["AMBIENTE_DC360"]?.trim();
  if (ambiente === "prod") {
    return (
      "--desfazer não é permitido com AMBIENTE_DC360=prod: desfazer apaga dado. Em produção, " +
      "corrija com uma migração nova (aditiva) ou restaure a cópia (runbook de restore)."
    );
  }
  if (env["NODE_ENV"] === "production" && ambiente !== "hml") {
    return (
      "--desfazer não é permitido com NODE_ENV=production: desfazer apaga dado. Em produção, " +
      "corrija com uma migração nova (aditiva) ou restaure a cópia (runbook de restore)."
    );
  }

  const textoDaUrl = url?.trim();
  if (!textoDaUrl) return null; // Banco efêmero: morre com o processo.

  let analisada: URL;
  try {
    analisada = new URL(textoDaUrl);
  } catch {
    return (
      "--desfazer recusou a DATABASE_URL porque ela não é uma URL que dê para analisar, e sem " +
      "analisá-la não há como saber se o banco é descartável."
    );
  }

  const segmentos = segmentosDaUrl(analisada);
  const declarada = env["IDENTIDADE_DO_BANCO"]?.trim().toLowerCase();

  // Em HML declarado, a identidade declarada é a do HML e não vira "protegida".
  const protegidas = [
    ...IDENTIDADES_DE_PROD,
    ...(ambiente === "hml" ? [] : [declarada, env["CONSOLE_IDENTIDADE_DO_BANCO"]?.trim()]),
  ]
    .filter((i): i is string => Boolean(i))
    .map((i) => i.toLowerCase());
  if (protegidas.some((i) => segmentos.includes(i))) {
    return (
      "--desfazer recusou a DATABASE_URL: ela traz a identidade de um banco de PRODUÇÃO " +
      "(ou do banco declarado em IDENTIDADE_DO_BANCO). Desfazer apaga dado."
    );
  }

  if (hostEhDescartavel(analisada.hostname)) return null;

  if (ambiente === "hml") {
    if (!declarada) {
      return (
        "--desfazer em HML exige IDENTIDADE_DO_BANCO com a referência do projeto de HML, " +
        "que precisa constar no usuário ou no host da DATABASE_URL. Sem ela não há como saber " +
        "que o banco hospedado é o de homologação."
      );
    }
    if (!identidadeDeHmlServe(declarada)) {
      return (
        "--desfazer recusou a IDENTIDADE_DO_BANCO declarada: ela é nome de papel, pedaço de host " +
        "do provedor ou curta demais, e consta na URL de qualquer ambiente. Use a referência " +
        "inteira do projeto de HML."
      );
    }
    if (!segmentos.includes(declarada)) {
      return (
        "--desfazer recusou a DATABASE_URL: a IDENTIDADE_DO_BANCO declarada para HML não consta " +
        "no usuário nem no host dela. O banco não é o de homologação declarado."
      );
    }
    return null;
  }

  return (
    "--desfazer só roda em banco descartável (localhost, 127.0.0.1 ou serviço do Docker) ou em " +
    "HML declarado (AMBIENTE_DC360=hml com IDENTIDADE_DO_BANCO batendo na DATABASE_URL). Esta " +
    "DATABASE_URL é de um banco hospedado que a guarda não reconhece como homologação, e " +
    "desfazer apaga dado."
  );
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
