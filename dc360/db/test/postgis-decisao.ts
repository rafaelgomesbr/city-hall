/**
 * A decisão dos testes espaciais (V2-F01-E21): rodar, pular com aviso ou
 * reprovar. Mora aqui, separada do teste que fala com o Postgres, para ser
 * provada sem Postgres nenhum (`postgis-decisao.test.ts`, na suíte comum).
 *
 * A regra, e por que ela é assim:
 *
 * - Os testes `*.espacial.test.ts` só fazem sentido num Postgres REAL com a
 *   extensão PostGIS: o PGlite 0.2.17 não a traz. Por isso eles não entram no
 *   `npm test` comum (ver `vitest.config.ts`) e têm o comando `test:espacial`.
 * - No CI, `DC360_EXIGE_POSTGIS=1`. Lá, faltar o servidor, a variável da URL
 *   ou a extensão REPROVA. Sem isso o job continuaria verde com o teste
 *   espacial pulado, e foi assim que "a API não sobe contra Postgres nenhum"
 *   sobreviveu a uma suíte inteira (ver o comentário do job `implantavel`).
 * - Na máquina de quem desenvolve a variável não existe. Faltar Postgres com
 *   PostGIS é o caso normal (quem usa só PGlite não precisa de Docker), então
 *   pula, com aviso que diz como rodar de verdade.
 */

/** O que a sonda encontrou no servidor de prova. */
export type EstadoDoServidor = "sem-url" | "inacessivel" | "sem-extensao" | "ok";

export type Decisao =
  { acao: "rodar" } | { acao: "pular"; aviso: string } | { acao: "reprovar"; motivo: string };

/** `DC360_EXIGE_POSTGIS=1` liga a exigência. Qualquer outro valor deixa desligada. */
export function exigePostgis(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DC360_EXIGE_POSTGIS === "1";
}

const COMO_RODAR =
  "Para rodar de verdade: suba um Postgres com PostGIS (docker compose up banco, " +
  "ou a imagem postgis/postgis:17-3.6) e aponte DC360_POSTGRES_DE_PROVA para um " +
  "superusuário dele, depois npm run test:espacial.";

const PROBLEMA: Record<Exclude<EstadoDoServidor, "ok">, string> = {
  "sem-url": "DC360_POSTGRES_DE_PROVA não está definida",
  inacessivel: "o servidor de DC360_POSTGRES_DE_PROVA não aceitou a conexão",
  "sem-extensao": "o servidor não oferece a extensão postgis (pg_available_extensions)",
};

export function decidirPostgis(exige: boolean, estado: EstadoDoServidor): Decisao {
  if (estado === "ok") return { acao: "rodar" };
  if (exige) {
    return {
      acao: "reprovar",
      motivo:
        `DC360_EXIGE_POSTGIS=1 e ${PROBLEMA[estado]}. ` +
        "No CI isto reprova de propósito: pular aqui esconderia que a prova espacial não rodou.",
    };
  }
  return {
    acao: "pular",
    aviso: `Testes espaciais PULADOS: ${PROBLEMA[estado]}. ${COMO_RODAR}`,
  };
}
