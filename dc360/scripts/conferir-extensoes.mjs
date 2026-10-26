/**
 * Conferência de extensões do banco: PostGIS (V2-F01-E22, decisão D-16).
 *
 * É a parte `--extensoes` de `scripts/conferir-ambiente.mjs`, separada em
 * arquivo próprio para o roteiro de ambiente não crescer sem fim. Quem a chama
 * é `conferir-ambiente.mjs --extensoes`.
 *
 * ## O que ela confere, e por quê
 *
 * O PostGIS cria uma tabela de referência (`spatial_ref_sys`), duas views e
 * mais de mil funções. Num provedor como o Supabase, o que mora num schema que
 * a API REST publica vira rota para `anon`, `authenticated` e `service_role`
 * (o `service_role` ignora RLS). `db/provedores/supabase-endurecer.sql` fecha
 * isso; esta conferência prova que fechou, SEM mudar nada (só leitura):
 *
 *   1. o provedor OFERECE a extensão (`pg_available_extensions`). É a pergunta
 *      do CP-44: sem isso a F32 fica bloqueada;
 *   2. ela está INSTALADA no schema certo (`extensions`, nunca `public`);
 *   3. nenhum dos três papéis do provedor, nem PUBLIC, tem privilégio em objeto
 *      da extensão;
 *   4. `dc360_app` tem o mínimo para consultar: USAGE no schema, SELECT em
 *      `spatial_ref_sys` e EXECUTE em todas as funções. Sem isso o smoke
 *      espacial da E21 falharia no HML.
 *   5. com a extensão disponível e AINDA NÃO instalada (o caso de PROD antes da
 *      F32), o papel de setup tem como criá-la: é superusuário ou tem CREATE no
 *      banco (o dono do banco tem). Disponível não é criável: o plano pode
 *      oferecer a extensão e o papel de setup não poder `CREATE EXTENSION`.
 *
 * "Tem privilégio" no item 3 é o EFETIVO (`has_*_privilege`), que conta a
 * herança por associação de papéis: um papel intermediário com EXECUTE, de que
 * `anon` é membro, abre a mesma porta que a concessão direta, e uma consulta só
 * à ACL não o veria.
 *
 * Em PROD (`--ambiente=prod`) só a disponibilidade e a capacidade de criar são
 * exigidas: a extensão nasce na migration da F32. Se já estiver instalada, o
 * resto é conferido igual.
 *
 * Limite assumido do item 5: no Postgres comum, PostGIS não é extensão
 * confiável, e só superusuário a cria. Provedores como o Supabase liberam o
 * papel `postgres` por fora do Postgres (extensão `supautils`), e isso só se
 * confirma TENTANDO em HML (CP-44). Por isso, sem ser superusuário e com a
 * extensão não confiável, a conferência AVISA em vez de aprovar em silêncio.
 *
 * ## O que ela NUNCA faz
 *
 * Nunca escreve: toda consulta roda numa transação READ ONLY e nenhuma contém
 * comando de escrita (o teste reprova). Nunca imprime a URL, usuário ou senha:
 * a URL vem da variável de ambiente `DATABASE_URL_SETUP` (nunca de argumento,
 * que apareceria na lista de processos) e a saída só tem nomes de papel,
 * nomes de objeto da extensão e contagens.
 *
 * ## Uso, de dentro de `dc360`
 *
 *   DATABASE_URL_SETUP=... node scripts/conferir-ambiente.mjs --extensoes
 *   DATABASE_URL_SETUP=... node scripts/conferir-ambiente.mjs --extensoes --ambiente=prod
 *   node scripts/conferir-ambiente.mjs --extensoes --fatos=ARQUIVO.json
 *       avalia fatos já coletados (o mesmo JSON que `coletarFatos` devolve),
 *       sem banco nenhum.
 *
 * Saída: 0 tudo confere; 1 alguma conferência falhou; 2 uso errado ou falha ao
 * consultar.
 */
import { readFileSync } from "node:fs";

/** O schema onde o PostGIS deve morar, salvo `--esquema`. É o padrão do Supabase. */
export const ESQUEMA_PADRAO = "extensions";

/** Os papéis que o provedor cria e que chegam pela API REST. */
export const PAPEIS_DO_PROVEDOR = ["anon", "authenticated", "service_role"];

/** O papel da aplicação, que precisa continuar enxergando a extensão. */
export const PAPEL_DA_APLICACAO = "dc360_app";

const IDENTIFICADOR = /^[a-z_][a-z0-9_]{0,62}$/;

/** Objetos que pertencem à extensão `postgis`, achados por `pg_depend` e não por schema. */
const DA_EXTENSAO = `
  JOIN pg_depend d ON d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
  JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'postgis'`;

/** Privilégios de tabela e de sequência que contam como "tocar" a extensão. */
export const PRIVILEGIOS_DE_TABELA = "SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER";
export const PRIVILEGIOS_DE_SEQUENCIA = "USAGE,SELECT,UPDATE";
/** O privilégio de banco que `CREATE SCHEMA` e `CREATE EXTENSION` pedem. */
export const PRIVILEGIO_DE_CRIACAO = "CREATE";

/**
 * Todo objeto da extensão, com o oid, o tipo (`r` relação, `s` sequência, `f`
 * função) e a ACL efetiva (a padrão do tipo quando ainda não há ACL explícita).
 */
const OBJETOS_DA_EXTENSAO = `
  SELECT c.oid AS oid, c.relname::text AS nome,
         (CASE c.relkind WHEN 'S' THEN 's' ELSE 'r' END)::text AS tipo,
         coalesce(c.relacl, acldefault((CASE c.relkind WHEN 'S' THEN 's' ELSE 'r' END)::"char", c.relowner)) AS acl
  FROM pg_class c
  ${DA_EXTENSAO} AND d.classid = 'pg_class'::regclass AND d.objid = c.oid
  WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f', 'S')
  UNION ALL
  SELECT p.oid, p.proname::text, 'f'::text, coalesce(p.proacl, acldefault('f'::"char", p.proowner))
  FROM pg_proc p
  ${DA_EXTENSAO} AND d.classid = 'pg_proc'::regclass AND d.objid = p.oid`;

/**
 * As consultas. Só leitura, e sem parâmetro interpolado em texto: o que varia
 * (schema esperado, papéis, lista de privilégios) entra como parâmetro.
 */
export const CONSULTAS = {
  disponivel: `SELECT default_version, installed_version
FROM pg_available_extensions WHERE name = 'postgis'`,

  instalada: `SELECT n.nspname AS esquema, e.extversion AS versao
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'postgis'`,

  // O papel de setup consegue criar a extensão? Só faz sentido antes de ela
  // existir. `$1` é o privilégio de criação em banco (PRIVILEGIO_DE_CRIACAO).
  // `trusted` vem da versão padrão da extensão (Postgres 13 ou mais).
  criacao: `SELECT r.rolsuper AS superusuario,
       pg_has_role(r.oid, d.datdba, 'USAGE') AS dono_do_banco,
       has_database_privilege(r.oid, d.oid, $1::text) AS cria_no_banco,
       coalesce(v.trusted, false) AS confiavel
FROM pg_roles r
CROSS JOIN pg_database d
LEFT JOIN pg_available_extensions a ON a.name = 'postgis'
LEFT JOIN pg_available_extension_versions v ON v.name = a.name AND v.version = a.default_version
WHERE r.rolname = current_user AND d.datname = current_database()`,

  // PUBLIC é o grantee 0, lido da ACL (não existe papel para perguntar). Os
  // papéis do provedor são perguntados pelo privilégio EFETIVO
  // (`has_*_privilege`), que conta a herança por associação de papéis, e NÃO
  // pela ACL, que só mostraria a concessão feita direto a eles. Um papel do
  // provedor só aparece quando o privilégio dele não é o de PUBLIC (que já tem
  // a sua linha) ou quando a ACL o cita direto. Objeto sem ACL explícita usa o
  // padrão do tipo, e o padrão de função é EXECUTE para PUBLIC: `acldefault`.
  // $1 papéis do provedor; $2 privilégios de tabela; $3 privilégios de sequência.
  exposicao: `WITH obj AS (${OBJETOS_DA_EXTENSAO}
)
SELECT papel,
       count(DISTINCT oid)::int AS objetos,
       (array_agg(nome ORDER BY nome))[1:3] AS exemplos
FROM (
  SELECT 'PUBLIC'::text AS papel, o.oid, o.nome
  FROM obj o, LATERAL aclexplode(o.acl) a
  WHERE a.grantee = 0
  UNION ALL
  SELECT r.rolname::text, o.oid, o.nome
  FROM pg_roles r
  CROSS JOIN obj o
  WHERE r.rolname = ANY ($1::text[])
    AND CASE o.tipo
          WHEN 'f' THEN has_function_privilege(r.oid, o.oid, 'EXECUTE')
          WHEN 's' THEN has_sequence_privilege(r.oid, o.oid, $3::text)
          ELSE has_table_privilege(r.oid, o.oid, $2::text)
        END
    AND (
      NOT EXISTS (SELECT 1 FROM aclexplode(o.acl) a WHERE a.grantee = 0)
      OR EXISTS (SELECT 1 FROM aclexplode(o.acl) a WHERE a.grantee = r.oid)
    )
) x
GROUP BY papel
ORDER BY papel`,

  aplicacao: `SELECT
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2::text) AS existe,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2::text)
       THEN has_schema_privilege($2::text, $1::text, 'USAGE') END AS uso_no_esquema,
  -- Sem to_regclass: ele resolve o nome e exige USAGE no schema para o papel de
  -- quem consulta (42501 quando o papel de setup não o tem). Pelo catálogo, o
  -- oid sai de pg_class/pg_namespace, que qualquer papel lê.
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2::text)
        AND EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace s ON s.oid = t.relnamespace
                    WHERE s.nspname = $1::text AND t.relname = 'spatial_ref_sys')
       THEN (SELECT has_table_privilege($2::text, t.oid, 'SELECT')
             FROM pg_class t JOIN pg_namespace s ON s.oid = t.relnamespace
             WHERE s.nspname = $1::text AND t.relname = 'spatial_ref_sys')
       END AS select_srs,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2::text)
       THEN (SELECT count(*)::int FROM pg_proc p
             ${DA_EXTENSAO} AND d.classid = 'pg_proc'::regclass AND d.objid = p.oid
             WHERE NOT has_function_privilege($2::text, p.oid, 'EXECUTE')) END AS funcoes_sem_execute`,
};

/**
 * Roda as consultas por `consultar(sql, parametros) => linhas` e devolve os
 * fatos. Quem chama decide se `consultar` fala com um banco ou é de mentira.
 */
export async function coletarFatos(consultar) {
  const [disp] = await consultar(CONSULTAS.disponivel, []);
  const [inst] = await consultar(CONSULTAS.instalada, []);
  const fatos = {
    disponivel: disp
      ? { versaoPadrao: disp.default_version ?? null, versaoInstalada: disp.installed_version }
      : null,
    instalada: inst ? { esquema: inst.esquema, versao: inst.versao } : null,
    criacao: null,
    exposicao: [],
    aplicacao: null,
  };
  if (!inst) {
    // Disponível e ainda não instalada: quem vai criá-la precisa poder.
    if (disp) {
      const [c] = await consultar(CONSULTAS.criacao, [PRIVILEGIO_DE_CRIACAO]);
      fatos.criacao = c
        ? {
            superusuario: c.superusuario === true,
            donoDoBanco: c.dono_do_banco === true,
            criaNoBanco: c.cria_no_banco === true,
            confiavel: c.confiavel === true,
          }
        : null;
    }
    return fatos;
  }
  const expostos = await consultar(CONSULTAS.exposicao, [
    PAPEIS_DO_PROVEDOR,
    PRIVILEGIOS_DE_TABELA,
    PRIVILEGIOS_DE_SEQUENCIA,
  ]);
  fatos.exposicao = expostos.map((l) => ({
    papel: l.papel,
    objetos: l.objetos,
    exemplos: l.exemplos ?? [],
  }));
  const [app] = await consultar(CONSULTAS.aplicacao, [inst.esquema, PAPEL_DA_APLICACAO]);
  fatos.aplicacao = {
    existe: app.existe === true,
    usoNoEsquema: app.uso_no_esquema ?? null,
    selectSpatialRefSys: app.select_srs ?? null,
    funcoesSemExecute: app.funcoes_sem_execute ?? null,
  };
  return fatos;
}

/**
 * Avalia os fatos. Devolve `{ problemas, avisos, linhas }`. `problemas` reprova.
 * `ambiente` é `hml` (completo) ou `prod` (só a disponibilidade é exigida).
 */
export function avaliarExtensoes(fatos, { ambiente = "hml", esquema = ESQUEMA_PADRAO } = {}) {
  const problemas = [];
  const avisos = [];
  const linhas = [];
  const p = (t) => problemas.push(t);
  const exigeInstalada = ambiente !== "prod";

  if (!fatos?.disponivel) {
    p(
      "postgis não aparece em pg_available_extensions: o provedor ou o plano não oferece a extensão (é a pergunta do CP-44)",
    );
    return { problemas, avisos, linhas };
  }
  linhas.push(`postgis disponível (versão ${fatos.disponivel.versaoPadrao ?? "desconhecida"})`);

  if (!fatos.instalada) {
    // Disponível não é criável: o papel de setup precisa poder criar. Vale em
    // HML e em PROD, porque é o que o CP-44 pergunta ao provedor.
    const c = fatos.criacao;
    if (!c) {
      p(
        "não consegui conferir se o papel de setup pode criar a extensão (fatos sem `criacao`): disponível no provedor não prova que dá para criar",
      );
    } else if (c.superusuario !== true && c.criaNoBanco !== true && c.donoDoBanco !== true) {
      p(
        "o papel de setup não pode criar a extensão: não é superusuário, não é dono do banco e não tem CREATE nele. Disponível no provedor não é criável por este papel (CP-44)",
      );
    } else if (c.superusuario !== true && c.confiavel !== true) {
      avisos.push(
        "o papel de setup não é superusuário e postgis não é extensão confiável: no Postgres comum só superusuário a cria. Em provedores que liberam isso por fora (Supabase) só se confirma tentando em HML (CP-44)",
      );
    } else {
      linhas.push("o papel de setup pode criar a extensão");
    }
    if (exigeInstalada) {
      p(
        `postgis não está instalado: rode db/provedores/postgis.sql com o papel de setup (esquema ${esquema})`,
      );
    } else {
      avisos.push("postgis ainda não está instalado em PROD: a extensão nasce na migration da F32");
    }
    return { problemas, avisos, linhas };
  }
  linhas.push(
    `postgis instalado: versão ${fatos.instalada.versao}, schema ${fatos.instalada.esquema}`,
  );

  if (fatos.instalada.esquema === "public") {
    p(
      "postgis está no schema public, que a API REST do provedor publica: spatial_ref_sys e as funções viram rota. Mova para um schema próprio",
    );
  } else if (fatos.instalada.esquema !== esquema) {
    p(`postgis está no schema ${fatos.instalada.esquema}; o esperado é ${esquema}`);
  }

  for (const e of fatos.exposicao ?? []) {
    const exemplos = e.exemplos.length > 0 ? ` (por exemplo: ${e.exemplos.join(", ")})` : "";
    p(
      `${e.papel} tem privilégio em ${e.objetos} objeto(s) da extensão${exemplos}: rode db/provedores/supabase-endurecer.sql`,
    );
  }

  const app = fatos.aplicacao;
  if (!app?.existe) {
    p(`${PAPEL_DA_APLICACAO} não existe: não dá para conferir o que a aplicação enxerga`);
  } else {
    const esq = fatos.instalada.esquema;
    if (app.usoNoEsquema !== true) {
      p(`${PAPEL_DA_APLICACAO} não tem USAGE no schema ${esq}: o smoke espacial da E21 falharia`);
    }
    if (app.selectSpatialRefSys !== true) {
      p(`${PAPEL_DA_APLICACAO} não tem SELECT em ${esq}.spatial_ref_sys`);
    }
    if ((app.funcoesSemExecute ?? 0) > 0) {
      p(
        `${PAPEL_DA_APLICACAO} não tem EXECUTE em ${app.funcoesSemExecute} função(ões) da extensão`,
      );
    }
  }
  if (problemas.length === 0) {
    linhas.push(
      `nenhum papel do provedor (nem PUBLIC) toca a extensão; ${PAPEL_DA_APLICACAO} tem o mínimo`,
    );
  }
  return { problemas, avisos, linhas };
}

/** Lê `--ambiente`, `--esquema` e `--fatos` de quem pediu `--extensoes`. */
export function lerArgumentosDeExtensoes(argv) {
  const saida = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) return { erro: `argumento inesperado: ${a}` };
    saida[m[1]] = m[2] ?? true;
  }
  for (const k of Object.keys(saida)) {
    if (!["extensoes", "ambiente", "esquema", "fatos"].includes(k))
      return { erro: `--${k} não vale com --extensoes` };
  }
  if (saida.extensoes !== true) return { erro: "--extensoes não aceita valor" };
  const ambiente = saida.ambiente ?? "hml";
  if (!["hml", "prod"].includes(ambiente)) return { erro: "--ambiente precisa ser hml ou prod" };
  const esquema = saida.esquema ?? ESQUEMA_PADRAO;
  if (typeof esquema !== "string" || !IDENTIFICADOR.test(esquema))
    return { erro: "--esquema precisa ser um nome de schema em minúsculas" };
  if (saida.fatos === true)
    return { erro: "--fatos precisa de um arquivo, ou - para a entrada padrão" };
  return { extensoes: true, ambiente, esquema, fatos: saida.fatos };
}

/**
 * Carrega a MESMA função que o migrador usa (`db/src/conexao.ts`, compilada em
 * `db/dist`). Reaproveitar e não copiar: a âncora de confiança é segurança, e
 * duas cópias divergem.
 */
async function carregarAncoraDoMigrador() {
  try {
    return await import("../db/dist/conexao.js");
  } catch {
    throw new Error(
      "a âncora de confiança do migrador não está compilada: rode `npm run build:shared` em dc360",
    );
  }
}

/**
 * A URL que a conferência usa para conectar: a do papel de setup, com a raiz do
 * provedor apontada quando ela pede `sslmode` que verifica a cadeia e não traz
 * `sslrootcert` (o mesmo tratamento do migrador). Sem isso, `verify-full` contra
 * o Supabase morre com `SELF_SIGNED_CERT_IN_CHAIN` e a pessoa acaba tirando o
 * `sslmode`, que deixa a conexão cifrada e NÃO autenticada.
 */
export async function urlParaConferencia(url, carregar = carregarAncoraDoMigrador) {
  const { urlComAncoraDeConfianca } = await carregar();
  return urlComAncoraDeConfianca(url);
}

/** Consulta o banco de `DATABASE_URL_SETUP`, em transação READ ONLY. */
async function consultarNoBanco(url) {
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    throw new Error("o pacote pg não está instalado: rode npm ci em dc360");
  }
  const cliente = new pg.Client({ connectionString: await urlParaConferencia(url) });
  try {
    await cliente.connect();
  } catch (erro) {
    throw new Error(
      `não consegui conectar ao banco de DATABASE_URL_SETUP (${erro.code ?? "sem código"})`,
    );
  }
  try {
    await cliente.query("BEGIN READ ONLY");
    const consultar = async (sql, parametros) => (await cliente.query(sql, parametros)).rows;
    return await coletarFatos(consultar);
  } catch (erro) {
    throw new Error(`a consulta falhou (${erro.code ?? "sem código"})`);
  } finally {
    await cliente.query("ROLLBACK").catch(() => {});
    await cliente.end().catch(() => {});
  }
}

/** O comando `--extensoes`. Devolve o código de saída. */
export async function executarExtensoes(args, { env = process.env, saida = console } = {}) {
  let fatos;
  try {
    if (args.fatos !== undefined) {
      try {
        fatos = JSON.parse(readFileSync(args.fatos === "-" ? 0 : args.fatos, "utf8"));
      } catch {
        throw new Error("não consegui ler --fatos como JSON");
      }
    } else {
      const url = env.DATABASE_URL_SETUP;
      if (!url) {
        saida.error(
          "conferir-ambiente: defina DATABASE_URL_SETUP (a URL do papel de setup) ou passe --fatos=ARQUIVO",
        );
        return 2;
      }
      fatos = await consultarNoBanco(url);
    }
  } catch (erro) {
    saida.error(`conferir-ambiente: ${erro.message}`);
    return 2;
  }
  const { problemas, avisos, linhas } = avaliarExtensoes(fatos, args);
  for (const l of linhas) saida.log(l);
  for (const a of avisos) saida.log(`aviso: ${a}`);
  if (problemas.length > 0) {
    for (const t of problemas) saida.error(`PROBLEMA: ${t}`);
    saida.error(`conferir-ambiente --extensoes: ${problemas.length} problema(s)`);
    return 1;
  }
  saida.log("conferir-ambiente --extensoes: confere");
  return 0;
}
