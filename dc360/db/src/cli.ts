import { aplicarMigracoes, migracoesPendentes, type ExecutorSql } from "./migrar.js";
import { urlComAncoraDeConfianca } from "./conexao.js";
import { carregarMigracoes, carregarSemente } from "./carregar.js";

/**
 * Aplicador de migrações pela linha de comando.
 *
 *   npm run migrar               aplica o que falta
 *   npm run migrar -- --conferir só diz o que falta, sem aplicar
 *   npm run migrar -- --semear   aplica e semeia (nunca em produção)
 *
 * `--conferir` existe para o contêiner poder recusar subir com esquema
 * atrasado, em vez de servir requisição contra um banco que não tem a coluna
 * que o código espera.
 */
async function conectar(): Promise<{ bd: ExecutorSql; encerrar: () => Promise<void> }> {
  const url = process.env["DATABASE_URL"];

  if (url) {
    const { default: pg } = await import("pg");
    /*
      A raiz do provedor entra aqui, e não na URL que a pessoa digitou.

      Sem isto, migrar contra a Supabase morre com SELF_SIGNED_CERT_IN_CHAIN, e
      o contorno que a pessoa encontra sozinha é tirar o `sslmode`, que deixa a
      conexão cifrada e NÃO autenticada. Ver `conexao.ts`.
    */
    const cliente = new pg.Client({ connectionString: urlComAncoraDeConfianca(url) });
    await cliente.connect();
    return {
      bd: {
        // O `pg` devolve QueryResult, que tem `rows` mas com tipagem própria.
        // O molde do executor é intencionalmente mínimo: só `rows`.
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
        exec: (sql: string) => cliente.query(sql),
      },
      encerrar: () => cliente.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.waitReady;
  console.warn(
    "DATABASE_URL ausente: migrando um Postgres em WebAssembly efêmero. " +
    "Serve para conferir a sintaxe das migrações, não para preparar um banco real.",
  );
  return {
    bd: {
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        const r = await db.query<Record<string, unknown>>(
          sql, params ? [...params] : undefined,
        );
        return { rows: r.rows as T[] };
      },
      exec: (sql: string) => db.exec(sql),
    },
    encerrar: () => db.close(),
  };
}

const { bd, encerrar } = await conectar();
const migracoes = carregarMigracoes();

/*
  O `APNS_AMBIENTE` de quem migra vai para a sessão, e é a migração 044 que o
  lê: as linhas de `aparelhos` que já existem recebem o ambiente que o
  servidor usava até então, em vez do padrão. SQL puro não lê variável de
  ambiente; a configuração de sessão é a ponte, e ela sobrevive às transações
  que o aplicador abre por migração. Só os dois valores válidos entram; outro
  qualquer é ignorado, e a migração cai em `producao`, que é o padrão da
  própria variável. Depois da 044 aplicada isto não faz mais nada.
*/
const apnsAmbiente = process.env["APNS_AMBIENTE"];
if (apnsAmbiente === "producao" || apnsAmbiente === "teste") {
  await bd.exec(`SET dc360.apns_ambiente = '${apnsAmbiente}'`);
}

try {
  if (process.argv.includes("--conferir")) {
    const pendentes = await migracoesPendentes(bd, migracoes);
    if (pendentes.length === 0) {
      console.log("Esquema em dia.");
    } else {
      console.error(`Faltam ${pendentes.length} migração(ões): ${pendentes.join(", ")}`);
      process.exitCode = 1;
    }
  } else {
    const r = await aplicarMigracoes(bd, migracoes, { registrar: (m) => console.log(m) });
    console.log(
      r.aplicadas.length === 0
        ? `Nada a fazer: ${r.jaEstavam.length} migração(ões) já aplicada(s).`
        : `Aplicadas: ${r.aplicadas.join(", ")}`,
    );

    if (process.argv.includes("--semear")) {
      if (process.env["NODE_ENV"] === "production") {
        // A semente traz senha conhecida e dados fictícios. Em produção ela
        // seria uma porta aberta com nome e sobrenome.
        throw new Error("--semear não é permitido com NODE_ENV=production");
      }
      await bd.exec(carregarSemente());
      console.log("Semeado com os dois municípios fictícios.");
    }
  }
} finally {
  await encerrar();
}
