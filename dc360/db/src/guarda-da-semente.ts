/**
 * A guarda do `--semear` (V2-F01-E11).
 *
 * ## O defeito que isto fecha
 *
 * `db/seeds/desenvolvimento.sql` dá a TODAS as contas a mesma senha conhecida
 * (`defesa-civil-2026`, que está no repositório). O `--semear` de `cli.ts` só
 * recusava com `NODE_ENV=production` NO PROCESSO. Quem roda o migrador da
 * própria máquina, com a `DATABASE_URL` de produção copiada do Fly e sem essa
 * variável, não tinha nada que o parasse: o comando semearia, na base dos
 * municípios de verdade, dois municípios fictícios com contas de coordenador
 * cuja senha qualquer pessoa lê no repositório.
 *
 * Confiar numa variável que o operador precisa lembrar de definir é confiar
 * que o erro não aconteça. Aqui a recusa olha o que NÃO depende de memória:
 * para onde a conexão vai.
 *
 * ## A regra
 *
 * Semear com a semente de desenvolvimento só vale em banco DESCARTÁVEL:
 *   - sem `DATABASE_URL` (o Postgres em WebAssembly que morre com o processo); ou
 *   - com `DATABASE_URL` cujo host é a própria máquina (`localhost`, `127.0.0.1`,
 *     `::1`) ou um nome de serviço do Docker (um rótulo só, sem ponto).
 *
 * E mesmo assim recusa quando o processo se declara PROD ou HML, quando
 * `NODE_ENV=production`, ou quando a URL traz a identidade de um banco de PROD
 * (a conhecida abaixo ou a declarada em `IDENTIDADE_DO_BANCO`). Um banco de HML
 * recebe a semente própria (`apps/api/src/semear-homologacao.ts`), que sorteia a
 * senha de cada conta, e nunca esta.
 *
 * A guarda é FAIL-CLOSED: URL que não dá para analisar recusa, e host que não é
 * da própria máquina recusa, em vez de tentar adivinhar que é inofensivo.
 *
 * Nunca devolve nem registra a URL: a senha mora nela.
 */

/**
 * Referências dos projetos de banco de PRODUÇÃO. Precisa ser IGUAL a
 * `ambientes.prod.identidadeDoBanco` de `scripts/ambientes.json`: o teste
 * `db/test/guarda-da-semente.test.ts` compara as duas e reprova a divergência.
 */
export const IDENTIDADES_DE_PROD: readonly string[] = ["bppklrxxwjshxvkvwirw"];

export type EntradaDaGuarda = {
  /** O valor de `DATABASE_URL`, ou `undefined`/vazio para o banco efêmero. */
  url: string | undefined;
  /** As variáveis de ambiente do processo (só as que a guarda lê). */
  env: Readonly<Record<string, string | undefined>>;
};

const HOSTS_DA_PROPRIA_MAQUINA = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Os segmentos separados por ponto do usuário e do host, em minúsculas. */
function segmentosDaUrl(analisada: URL): string[] {
  let usuario = analisada.username;
  try {
    usuario = decodeURIComponent(usuario);
  } catch {
    // Percent-encoding quebrado: o usuário cru ainda serve para a comparação.
  }
  return [...usuario.toLowerCase().split("."), ...analisada.hostname.toLowerCase().split(".")];
}

/** O host é a própria máquina, ou um nome de serviço do Docker (um rótulo, sem ponto)? */
function hostEhDescartavel(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (HOSTS_DA_PROPRIA_MAQUINA.has(host)) return true;
  return host !== "" && !host.includes(".") && !host.includes(":");
}

/**
 * Devolve o MOTIVO de recusar o `--semear`, ou `null` quando pode semear.
 * O motivo diz o que está errado e o que fazer, e nunca repete a URL.
 */
export function motivoParaNaoSemear({ url, env }: EntradaDaGuarda): string | null {
  if (env["NODE_ENV"] === "production") {
    return "--semear não é permitido com NODE_ENV=production. A semente de desenvolvimento "
      + "traz uma senha conhecida (está no repositório).";
  }

  const ambiente = env["AMBIENTE_DC360"]?.trim();
  if (ambiente === "prod") {
    return "--semear não é permitido com AMBIENTE_DC360=prod. A semente de desenvolvimento "
      + "traz uma senha conhecida e dados fictícios, e em produção seria uma porta aberta.";
  }
  if (ambiente === "hml") {
    return "--semear não é permitido com AMBIENTE_DC360=hml: a semente de desenvolvimento dá a "
      + "toda conta uma senha conhecida. Em homologação use a semente própria, que sorteia a "
      + "senha de cada conta: `cd apps/api && npx tsx src/semear-homologacao.ts`.";
  }

  const textoDaUrl = url?.trim();
  if (!textoDaUrl) return null; // Banco efêmero: morre com o processo.

  let analisada: URL;
  try {
    analisada = new URL(textoDaUrl);
  } catch {
    return "--semear recusou a DATABASE_URL porque ela não é uma URL que dê para analisar, e sem "
      + "analisá-la não há como saber se o banco é descartável.";
  }

  // Além das identidades de PROD conhecidas, a que o próprio processo declara
  // (se declarar) também nomeia um banco que não é descartável.
  const identidadesProtegidas = [
    ...IDENTIDADES_DE_PROD,
    env["IDENTIDADE_DO_BANCO"]?.trim(),
    env["CONSOLE_IDENTIDADE_DO_BANCO"]?.trim(),
  ]
    .filter((i): i is string => Boolean(i))
    .map((i) => i.toLowerCase());
  const segmentos = segmentosDaUrl(analisada);
  if (identidadesProtegidas.some((i) => segmentos.includes(i))) {
    return "--semear recusou a DATABASE_URL: ela traz a identidade de um banco de PRODUÇÃO "
      + "(ou do banco declarado em IDENTIDADE_DO_BANCO). A semente de desenvolvimento dá "
      + "a toda conta uma senha conhecida, e nunca entra num banco de verdade.";
  }

  if (!hostEhDescartavel(analisada.hostname)) {
    return "--semear só semeia banco descartável: o host da DATABASE_URL precisa ser a própria "
      + "máquina (localhost, 127.0.0.1) ou um serviço do Docker. Banco hospedado, de HML ou de "
      + "qualquer outro ambiente, recusa. Em homologação use a semente própria "
      + "(`cd apps/api && npx tsx src/semear-homologacao.ts`).";
  }
  return null;
}
