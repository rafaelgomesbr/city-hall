/**
 * Toda variável de ambiente que o código lê está documentada no
 * `.env.example` do workspace, e nada documentado lá deixou de ser lido.
 *
 * O `.env.example` é o único lugar que alguém montando uma máquina nova vai
 * procurar, e ele vale exatamente o quanto é completo: uma variável lida pelo
 * código e ausente do exemplo é uma configuração que só existe na cabeça de
 * quem escreveu a linha. Um revisor conferiu a API e o console por script em
 * 15/09/2026 e achou o aplicativo de campo com duas de fora (`DC360_DEV_LOCAL`
 * e `EAS_PROJECT_ID`), uma delas a que decide se o build de loja aceita http
 * em rede local. Este arquivo transforma aquela conferência em portão.
 *
 * O que cada lado lê:
 *
 * - API e console: as chaves do `z.object({...})` chamado `esquema` (ou
 *   `ESQUEMA`) em `src/config.ts`, que é a única porta de entrada deles, e
 *   mais qualquer `process.env["NOME"]` escrito no mesmo arquivo.
 * - Aplicativo de campo: todo `process.env["NOME"]` de `app.config.ts`, que é
 *   lido no `prebuild` e não no aparelho.
 *
 * O `.env.example` documenta uma variável com a linha `NOME=` ou `# NOME=`
 * (a forma comentada é a das opcionais, e é como os três arquivos já
 * escrevem). Menção em prosa não conta: prosa não se copia para o `.env`.
 *
 * O que ele NÃO faz: não lê `process.env` fora dos arquivos de configuração
 * (`postgres.ts` lê `NODE_ENV` direto, e `pdf.ts` lê o caminho do navegador
 * por uma constante), porque a régua é "a configuração declarada bate com a
 * documentada", e essas leituras soltas são assunto de outra régua.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/**
 * Variáveis que o código lê e que NÃO vêm do `.env`, com a razão.
 *
 * Cada entrada é uma exceção nomeada: sem a razão escrita, a lista vira o
 * lugar onde variável esquecida se esconde.
 */
const NAO_VEM_DO_ENV = {
  "apps/campo": {
    EAS_BUILD_PROFILE: "o EAS a define no momento do build (é o nome do perfil de eas.json); "
      + "documentá-la no .env.example convidaria alguém a preenchê-la à mão",
  },
};

const WORKSPACES = [
  { pasta: "apps/api", configuracao: "src/config.ts", ler: lidasPeloEsquema },
  { pasta: "apps/console", configuracao: "src/config.ts", ler: lidasPeloEsquema },
  { pasta: "apps/campo", configuracao: "app.config.ts", ler: lidasPorProcessEnv },
];

/** As chaves do `z.object({ ... })` chamado `esquema`, mais `process.env["X"]` no mesmo arquivo. */
export function lidasPeloEsquema(fonte) {
  // `esquema` na API, `ESQUEMA` no console: o mesmo objeto com dois nomes.
  const abertura = /const (?:esquema|ESQUEMA)\s*=\s*z\.object\(\{/.exec(fonte);
  assert.ok(abertura, "config.ts não declara mais `const esquema = z.object({`");
  const inicio = abertura.index + abertura[0].length;
  let profundidade = 1;
  let fim = inicio;
  for (; fim < fonte.length && profundidade > 0; fim++) {
    if (fonte[fim] === "{") profundidade += 1;
    if (fonte[fim] === "}") profundidade -= 1;
  }
  const corpo = semComentarios(fonte.slice(inicio, fim));
  /*
    Só as chaves de PRIMEIRO nível: uma linha que começa com dois espaços e
    um nome em maiúsculas seguido de dois pontos. Chave aninhada teria mais
    recuo, e não há nenhuma hoje.
  */
  const chaves = [...corpo.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
  return new Set([...chaves, ...lidasPorProcessEnv(fonte)]);
}

/** Todo `process.env["NOME"]` e `process.env.NOME` do arquivo. */
export function lidasPorProcessEnv(fonte) {
  const limpo = semComentarios(fonte);
  const achados = new Set();
  for (const m of limpo.matchAll(/process\.env\s*(?:\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|\.([A-Z][A-Z0-9_]*))/g)) {
    achados.add(m[1] ?? m[2]);
  }
  return achados;
}

/** As variáveis que o `.env.example` documenta: `NOME=` ou `# NOME=`. */
export function documentadas(exemplo) {
  const achados = new Set();
  for (const m of exemplo.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) achados.add(m[1]);
  return achados;
}

/** Apaga comentários de bloco e de linha, sem tocar em string. */
function semComentarios(fonte) {
  let saida = "";
  let i = 0;
  let aspas = null;
  while (i < fonte.length) {
    const c = fonte[i];
    if (aspas) {
      saida += c;
      if (c === "\\") { saida += fonte[i + 1] ?? ""; i += 2; continue; }
      if (c === aspas) aspas = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { aspas = c; saida += c; i += 1; continue; }
    if (c === "/" && fonte[i + 1] === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      i = fim === -1 ? fonte.length : fim + 2;
      continue;
    }
    if (c === "/" && fonte[i + 1] === "/") {
      const quebra = fonte.indexOf("\n", i);
      i = quebra === -1 ? fonte.length : quebra;
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}

function comparar({ pasta, configuracao, ler }) {
  const lidas = ler(readFileSync(join(RAIZ, pasta, configuracao), "utf8"));
  const doc = documentadas(readFileSync(join(RAIZ, pasta, ".env.example"), "utf8"));
  const excecoes = NAO_VEM_DO_ENV[pasta] ?? {};

  const semDocumentacao = [...lidas].filter((v) => !doc.has(v) && !(v in excecoes)).sort();
  const semLeitura = [...doc].filter((v) => !lidas.has(v)).sort();
  const excecaoInutil = Object.keys(excecoes).filter((v) => !lidas.has(v) || doc.has(v));
  return { lidas, doc, semDocumentacao, semLeitura, excecaoInutil };
}

for (const workspace of WORKSPACES) {
  test(`${workspace.pasta}: toda variável lida está no .env.example, e vice-versa`, () => {
    const r = comparar(workspace);

    // Âncora: uma leitura que devolvesse vazio passaria os dois lados sem medir.
    assert.ok(r.lidas.size >= 5, `${workspace.pasta}: a leitura achou só ${r.lidas.size} variáveis`);
    assert.ok(r.doc.size >= 5, `${workspace.pasta}: o .env.example documenta só ${r.doc.size}`);

    assert.deepEqual(
      r.semDocumentacao, [],
      `${workspace.pasta}/${workspace.configuracao} lê variáveis que ${workspace.pasta}/.env.example `
      + `não documenta:\n  ${r.semDocumentacao.join("\n  ")}\n`
      + "Escreva cada uma como `NOME=` (ou `# NOME=` se for opcional), com o que ela faz.",
    );
    assert.deepEqual(
      r.semLeitura, [],
      `${workspace.pasta}/.env.example documenta variáveis que ${workspace.configuracao} não lê mais:\n  `
      + r.semLeitura.join("\n  "),
    );
    assert.deepEqual(
      r.excecaoInutil, [],
      `exceção em NAO_VEM_DO_ENV que não é mais necessária (não é lida, ou já está documentada): `
      + r.excecaoInutil.join(", "),
    );
  });
}

test("a leitura pega o que deveria pegar, e o portão morde na variável que falta", () => {
  /*
    Caso-irmão: o portão provado com texto de exemplo, para uma expressão
    quebrada não dar verde para sempre. O primeiro é literalmente o defeito
    de 15/09: `app.config.ts` lendo `DC360_DEV_LOCAL` e o exemplo sem a linha.
  */
  const config = [
    'const CHAVE = process.env["DC360_MAPS_CHAVE"]?.trim() ?? "";',
    '// process.env["COMENTADA"] não conta',
    '/* nem process.env["EM_BLOCO"] */',
    'const url = "process.env[\\"DENTRO_DE_STRING\\"]";',
    '...(process.env["DC360_DEV_LOCAL"] === "1" ? { a: 1 } : {}),',
    "const perfil = process.env.EAS_BUILD_PROFILE;",
  ].join("\n");
  assert.deepEqual(
    [...lidasPorProcessEnv(config)].sort(),
    ["DC360_DEV_LOCAL", "DC360_MAPS_CHAVE", "EAS_BUILD_PROFILE"],
  );

  const exemplo = [
    "# Endereço da API",
    "DC360_API_URL=http://localhost:3691",
    "# DC360_MAPS_CHAVE=",
    "#   prosa que menciona DC360_DEV_LOCAL sem documentar",
  ].join("\n");
  assert.deepEqual([...documentadas(exemplo)].sort(), ["DC360_API_URL", "DC360_MAPS_CHAVE"]);

  const esquema = [
    "import { z } from \"zod\";",
    "const esquema = z.object({",
    "  NODE_ENV: z.enum([\"development\", \"test\", \"production\"]).default(\"development\"),",
    "  PORT: z.coerce.number().int().min(1).max(65535).default(3333),",
    "  // ANOTADA: z.string(),",
    "  S3_BALDE: z.string().min(1).optional(),",
    "});",
    "export function carregarConfig(ambiente = process.env) { return esquema.parse(ambiente); }",
  ].join("\n");
  assert.deepEqual([...lidasPeloEsquema(esquema)].sort(), ["NODE_ENV", "PORT", "S3_BALDE"]);
});

test("a leitura enxerga os arquivos de verdade", () => {
  // Uma variável conhecida de cada lado, para um caminho errado não passar calado.
  const api = comparar(WORKSPACES[0]);
  assert.ok(api.lidas.has("DATABASE_URL"));
  assert.ok(api.doc.has("DATABASE_URL"));
  const campo = comparar(WORKSPACES[2]);
  assert.ok(campo.lidas.has("DC360_API_URL"));
  assert.ok(campo.lidas.has("DC360_DEV_LOCAL"), "app.config.ts deixou de ler DC360_DEV_LOCAL");
});
