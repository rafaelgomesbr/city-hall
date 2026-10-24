/**
 * O contrato de ambiente DEV, HML e PROD, conferido (V2-F01-E09).
 *
 * `scripts/ambientes.json` é a matriz, e `scripts/conferir-ambiente.mjs` a
 * compara com o repositório e com os NOMES dos segredos do Fly. Estes testes
 * provam as duas conferências e, principalmente, que elas MORDEM: cada caso
 * negativo estraga uma coisa de um jeito que o defeito real estragaria e
 * confere que a reprovação aparece com a frase certa.
 *
 * O que a E09 quer pego e este arquivo prova:
 *   - `conferir-ambiente` reprova segredo exclusivo de PROD no app de HML;
 *   - o toml de HML não pode carregar a identidade nem o domínio de PROD;
 *   - a matriz nunca guarda segredo, e a saída nunca imprime valor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AMBIENTES,
  APPS,
  DOMINIOS_COMPARTILHADOS,
  RAIZ_DO_PRODUTO,
  compararNomes,
  conferirRepositorio,
  estadoDe,
  formatarComparacao,
  lerArgumentos,
  lerEnvDoToml,
  lerMatriz,
  lerNomesDeSegredos,
  reprovou,
  validarMatriz,
  variaveisDoEsquema,
} from "./conferir-ambiente.mjs";

const SCRIPT = fileURLToPath(new URL("./conferir-ambiente.mjs", import.meta.url));
const MATRIZ = lerMatriz();

/** Uma cópia profunda da matriz para cada caso estragar à vontade. */
const copiaDaMatriz = () => structuredClone(MATRIZ);

/** Os nomes de segredo que um app de um ambiente PRECISA ter, segundo a matriz. */
function segredosObrigatorios(app, ambiente) {
  return MATRIZ.apps[app].variaveis
    .filter((v) => v.onde === "segredo" && estadoDe(v, ambiente) === "obrigatoria")
    .map((v) => v.nome);
}

/** Uma pasta temporária com os arquivos que `conferirRepositorio` lê, copiados do repositório. */
function raizSintetica() {
  const raiz = mkdtempSync(join(tmpdir(), "conferir-ambiente-"));
  const arquivos = [
    "apps/api/src/config.ts",
    "apps/console/src/config.ts",
    "fly.toml",
    "fly.console.toml",
    ".nvmrc",
    ".node-version",
    "package.json",
    "Dockerfile",
    "Dockerfile.console",
    "compose.yaml",
  ];
  for (const a of arquivos) {
    const destino = join(raiz, a);
    mkdirSync(join(destino, ".."), { recursive: true });
    cpSync(join(RAIZ_DO_PRODUTO, a), destino);
  }
  return raiz;
}

/** Roda `fn` com uma raiz sintética e apaga a pasta no fim. */
function comRaiz(fn) {
  const raiz = raizSintetica();
  try {
    return fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

function trocar(raiz, arquivo, de, para) {
  const caminho = join(raiz, arquivo);
  const antes = readFileSync(caminho, "utf8");
  assert.ok(antes.includes(de), `${arquivo} não contém ${JSON.stringify(de)}: o caso não estragaria nada`);
  // Todas as ocorrências: o texto citado em comentário não pode esconder a troca.
  writeFileSync(caminho, antes.split(de).join(para));
}

// ---------------------------------------------------------------------------
// A matriz e o repositório de verdade
// ---------------------------------------------------------------------------

test("a matriz real é bem formada", () => {
  assert.deepEqual(validarMatriz(MATRIZ), []);
});

test("o repositório real bate com a matriz, e desde a E11 HML existe e passa sem aviso", () => {
  const { problemas, avisos } = conferirRepositorio();
  assert.deepEqual(problemas, []);
  assert.deepEqual(avisos, [], "fly.hml.toml e fly.console.hml.toml nasceram na V2-F01-E11");
});

test("a lista de domínios compartilhados é a MESMA do código da API", () => {
  const fonte = readFileSync(join(RAIZ_DO_PRODUTO, "apps/api/src/ambiente.ts"), "utf8");
  const bloco = /DOMINIOS_COMPARTILHADOS: readonly string\[\] = \[([\s\S]*?)\];/.exec(fonte);
  assert.ok(bloco, "ambiente.ts não declara mais DOMINIOS_COMPARTILHADOS");
  const nomes = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nomes, DOMINIOS_COMPARTILHADOS);
});

test("a matriz cobre exatamente o que cada config.ts lê", () => {
  for (const [app, caminho] of [["api", "apps/api/src/config.ts"], ["console", "apps/console/src/config.ts"]]) {
    const lidas = variaveisDoEsquema(readFileSync(join(RAIZ_DO_PRODUTO, caminho), "utf8"));
    const naMatriz = new Set(MATRIZ.apps[app].variaveis.map((v) => v.nome));
    assert.deepEqual([...lidas].sort(), [...naMatriz].sort(), app);
  }
});

test("as quatro variáveis do contrato estão na matriz com a regra certa", () => {
  const api = new Map(MATRIZ.apps.api.variaveis.map((v) => [v.nome, v]));
  for (const nome of ["AMBIENTE_DC360", "IDENTIDADE_DO_BANCO", "DOMINIO_DO_AMBIENTE"]) {
    assert.equal(api.get(nome).onde, "env", `${nome} é não secreta e mora no [env]`);
    assert.equal(api.get(nome).hml, "obrigatoria");
    assert.equal(api.get(nome).prod, "obrigatoria");
  }
  assert.equal(api.get("EMAIL_DOMINIOS_DE_TESTE").prod, "proibida", "o filtro de teste não existe em PROD");
  assert.equal(api.get("AMBIENTE_DC360").valores.hml, "hml");
  assert.equal(api.get("AMBIENTE_DC360").valores.prod, "prod");
});

test("nenhuma variável de segredo da matriz tem valor, e a organização não é configuração", () => {
  for (const app of APPS) {
    for (const v of MATRIZ.apps[app].variaveis) {
      if (v.onde === "segredo") assert.equal(v.valores, undefined, `${app}.${v.nome}`);
      assert.doesNotMatch(v.nome, /ORGANIZACAO|MUNICIPIO|TENANT/, `${app}.${v.nome}: a organização vem do token, não da configuração`);
    }
  }
});

test("estadoDe: ausente na matriz quer dizer opcional", () => {
  assert.equal(estadoDe({ nome: "X" }, "hml"), "opcional");
  assert.equal(estadoDe({ nome: "X", hml: "proibida" }, "hml"), "proibida");
  assert.equal(estadoDe({ nome: "X", hml: "proibida" }, "prod"), "opcional");
  assert.deepEqual(AMBIENTES, ["dev", "hml", "prod"]);
});

// ---------------------------------------------------------------------------
// A matriz mal formada reprova
// ---------------------------------------------------------------------------

test("validarMatriz reprova valor fixo em variável de segredo", () => {
  const m = copiaDaMatriz();
  m.apps.api.variaveis.find((v) => v.nome === "DATABASE_URL").valores = { prod: "postgres://x" };
  assert.match(validarMatriz(m).join("\n"), /DATABASE_URL: variável de SEGREDO não pode ter valor fixo/);
});

test("validarMatriz reprova nome repetido, estado inventado e lugar inventado", () => {
  const m = copiaDaMatriz();
  m.apps.api.variaveis.push({ nome: "PORT", onde: "env" });
  m.apps.api.variaveis.find((v) => v.nome === "HOST").prod = "talvez";
  m.apps.api.variaveis.find((v) => v.nome === "LOGIN_POR_IP").onde = "cofre";
  const texto = validarMatriz(m).join("\n");
  assert.match(texto, /PORT: nome repetido/);
  assert.match(texto, /HOST: prod precisa ser obrigatoria, opcional, proibida/);
  assert.match(texto, /LOGIN_POR_IP: "onde" precisa ser env ou segredo/);
});

test("validarMatriz reprova valor fixo que contradiz a proibição, e obrigatório em dev", () => {
  const m = copiaDaMatriz();
  const v = m.apps.api.variaveis.find((x) => x.nome === "EMAIL_DOMINIOS_DE_TESTE");
  v.valores = { prod: "teste.exemplo.com.br" };
  m.apps.api.variaveis.find((x) => x.nome === "DATABASE_URL").dev = "obrigatoria";
  const texto = validarMatriz(m).join("\n");
  assert.match(texto, /EMAIL_DOMINIOS_DE_TESTE: valores.prod contradiz a proibição/);
  assert.match(texto, /DATABASE_URL: nada é obrigatório em dev/);
});

test("validarMatriz reprova HML e PROD com a mesma identidade de banco", () => {
  const m = copiaDaMatriz();
  m.ambientes.hml.identidadeDoBanco = m.ambientes.prod.identidadeDoBanco.toUpperCase();
  assert.match(validarMatriz(m).join("\n"), /MESMA identidade de banco/);
});

test("validarMatriz reprova domínios de HML e PROD iguais ou um dentro do outro (CORS cruzado)", () => {
  for (const hml of ["dc360-painel-web.vercel.app", "hml.dc360-painel-web.vercel.app"]) {
    const m = copiaDaMatriz();
    m.ambientes.hml.dominio = hml;
    assert.match(validarMatriz(m).join("\n"), /iguais ou um dentro do outro/, hml);
  }
  const ok = copiaDaMatriz();
  ok.ambientes.hml.dominio = "dc360-painel-hml.vercel.app";
  ok.ambientes.hml.identidadeDoBanco = "refhmlxxxxxxxxx";
  assert.deepEqual(validarMatriz(ok), [], "domínios irmãos, que só compartilham o provedor, são separados");
});

test("validarMatriz reprova domínio compartilhado do provedor e domínio mal formado", () => {
  for (const dominio of ["vercel.app", "fly.dev", "com.br"]) {
    const m = copiaDaMatriz();
    m.ambientes.hml.dominio = dominio;
    assert.match(validarMatriz(m).join("\n"), /domínio compartilhado do provedor/, dominio);
  }
  const m = copiaDaMatriz();
  m.ambientes.prod.dominio = "https://painel.exemplo.com.br";
  assert.match(validarMatriz(m).join("\n"), /fora do formato de domínio/);
});

test("validarMatriz reprova identidade ou domínio marcados como segredo", () => {
  const m = copiaDaMatriz();
  m.apps.api.variaveis.find((v) => v.nome === "IDENTIDADE_DO_BANCO").onde = "segredo";
  assert.match(validarMatriz(m).join("\n"), /identidade e domínio moram no \[env\]/);
});

test("validarMatriz reprova matriz sem ambiente, sem app ou sem versão", () => {
  assert.match(validarMatriz({}).join("\n"), /versao da matriz precisa ser 1/);
  const m = copiaDaMatriz();
  delete m.ambientes.hml;
  assert.match(validarMatriz(m).join("\n"), /ambientes.hml está faltando/);
});

// ---------------------------------------------------------------------------
// O repositório estragado reprova
// ---------------------------------------------------------------------------

test("o repositório sintético intacto passa (controle: sem ele os negativos provam nada)", () => {
  comRaiz((raiz) => {
    assert.deepEqual(conferirRepositorio({ raiz }).problemas, []);
  });
});

test("toml de PROD sem AMBIENTE_DC360 reprova", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", '  AMBIENTE_DC360 = "prod"\n', "");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /fly\.toml: \[env\] não declara AMBIENTE_DC360, obrigatória em PROD/);
  });
});

test("toml de PROD com AMBIENTE_DC360 errado reprova", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", 'AMBIENTE_DC360 = "prod"', 'AMBIENTE_DC360 = "hml"');
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /AMBIENTE_DC360 deveria valer "prod" em PROD/);
  });
});

test("toml de PROD com a identidade de banco trocada reprova", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", 'IDENTIDADE_DO_BANCO = "bppklrxxwjshxvkvwirw"', 'IDENTIDADE_DO_BANCO = "outroprojetoxxxxx"');
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /IDENTIDADE_DO_BANCO não é a identidade de banco que a matriz declara para PROD/);
  });
});

test("toml com SEGREDO no [env] reprova (segredo no repositório)", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", '  HOST = "0.0.0.0"', '  HOST = "0.0.0.0"\n  JWT_SEGREDO = "x"');
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /JWT_SEGREDO, que é SEGREDO e não pode estar no repositório/);
  });
});

test("toml de PROD com variável proibida ou desconhecida reprova", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", '  HOST = "0.0.0.0"', '  HOST = "0.0.0.0"\n  EMAIL_DOMINIOS_DE_TESTE = "teste.exemplo.com.br"\n  VARIAVEL_NOVA = "1"');
    const texto = conferirRepositorio({ raiz }).problemas.join("\n");
    assert.match(texto, /declara EMAIL_DOMINIOS_DE_TESTE, proibida em PROD/);
    assert.match(texto, /declara VARIAVEL_NOVA, que a matriz não conhece/);
  });
});

test("toml comentado não conta como declarado", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.toml", '  AMBIENTE_DC360 = "prod"', '  # AMBIENTE_DC360 = "prod"');
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /não declara AMBIENTE_DC360/);
  });
});

test("toml do console sem a identidade reprova", () => {
  comRaiz((raiz) => {
    trocar(raiz, "fly.console.toml", '  CONSOLE_IDENTIDADE_DO_BANCO = "bppklrxxwjshxvkvwirw"\n', "");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /fly\.console\.toml: \[env\] não declara CONSOLE_IDENTIDADE_DO_BANCO/);
  });
});

test("HML com o toml carregando a identidade e o domínio de PROD reprova (HML ligado a PROD)", () => {
  comRaiz((raiz) => {
    const matriz = copiaDaMatriz();
    matriz.ambientes.hml.identidadeDoBanco = "refhmlxxxxxxxxx";
    matriz.ambientes.hml.dominio = "dc360-painel-hml.vercel.app";
    // O toml de HML é o de PROD com a marca d'água, copiado sem trocar nada: o erro de verdade.
    const prod = readFileSync(join(raiz, "fly.toml"), "utf8");
    writeFileSync(join(raiz, "fly.hml.toml"), prod.replace('AMBIENTE_DC360 = "prod"', 'AMBIENTE_DC360 = "hml"'));
    const texto = conferirRepositorio({ raiz, matriz }).problemas.join("\n");
    assert.match(texto, /fly\.hml\.toml: IDENTIDADE_DO_BANCO não é a identidade de banco que a matriz declara para HML/);
    assert.match(texto, /fly\.hml\.toml: DOMINIO_DO_AMBIENTE não é o domínio que a matriz declara para HML/);
    assert.match(texto, /api: IDENTIDADE_DO_BANCO tem o MESMO valor no toml de HML e no de PROD/);
    assert.match(texto, /api: DOMINIO_DO_AMBIENTE tem o MESMO valor no toml de HML e no de PROD/);
  });
});

test("a matriz declarar a identidade de HML sem o toml de HML existir reprova", () => {
  comRaiz((raiz) => {
    const matriz = copiaDaMatriz();
    matriz.ambientes.hml.identidadeDoBanco = "refhmlxxxxxxxxx";
    assert.match(conferirRepositorio({ raiz, matriz }).problemas.join("\n"), /fly\.hml\.toml \(HML, api\) não existe, mas a matriz já declara/);
  });
});

test("variável nova no config.ts sem linha na matriz reprova, e o inverso também", () => {
  comRaiz((raiz) => {
    trocar(raiz, "apps/api/src/config.ts", "  PORT: z.coerce", "  VARIAVEL_NOVA_DA_API: z.string().optional(),\n  PORT: z.coerce");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /api: VARIAVEL_NOVA_DA_API é lida por apps\/api\/src\/config\.ts e não está na matriz/);
  });
  comRaiz((raiz) => {
    const matriz = copiaDaMatriz();
    matriz.apps.console.variaveis.push({ nome: "CONSOLE_FANTASMA", onde: "env" });
    assert.match(conferirRepositorio({ raiz, matriz }).problemas.join("\n"), /console: CONSOLE_FANTASMA está na matriz e apps\/console\/src\/config\.ts não a lê mais/);
  });
});

test("Node e Postgres: divergência entre os arquivos reprova", () => {
  comRaiz((raiz) => {
    writeFileSync(join(raiz, ".node-version"), "20\n");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /\.node-version e \.nvmrc divergem/);
  });
  comRaiz((raiz) => {
    trocar(raiz, "package.json", '">=22 <23"', '">=20"');
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /engines\.node deveria ser ">=22 <23"/);
  });
  comRaiz((raiz) => {
    trocar(raiz, "compose.yaml", "postgis/postgis:17-3.5", "postgis/postgis:16-3.4");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /deveria ser Postgres 17/);
  });
  comRaiz((raiz) => {
    trocar(raiz, "Dockerfile", "FROM node:22-bookworm-slim", "FROM node:20-bookworm-slim");
    assert.match(conferirRepositorio({ raiz }).problemas.join("\n"), /Dockerfile: a imagem base deveria ser node:22/);
  });
});

// ---------------------------------------------------------------------------
// Os leitores
// ---------------------------------------------------------------------------

test("lerEnvDoToml ignora comentário, outras seções e comentário depois do valor", () => {
  const env = lerEnvDoToml([
    'app = "x"',
    "[env]",
    '  A = "1"',
    '  # B = "2"',
    '  C = "3" # nota',
    "",
    "[http_service]",
    '  D = "4"',
  ].join("\n"));
  assert.deepEqual(env, { A: "1", C: "3" });
});

test("lerEnvDoToml lê os dois tomls de PROD de verdade", () => {
  const api = lerEnvDoToml(readFileSync(join(RAIZ_DO_PRODUTO, "fly.toml"), "utf8"));
  assert.equal(api.AMBIENTE_DC360, "prod");
  assert.equal(api.PUSH_ATIVO, undefined, "PUSH_ATIVO está comentada no toml de PROD");
  const console_ = lerEnvDoToml(readFileSync(join(RAIZ_DO_PRODUTO, "fly.console.toml"), "utf8"));
  assert.equal(console_.AMBIENTE_DC360, "prod");
});

test("lerNomesDeSegredos lê JSON e texto, e DESCARTA o valor e o resumo", () => {
  const valor = "valor-secreto-que-nao-pode-aparecer";
  const json = JSON.stringify([
    { Name: "DATABASE_URL", Digest: "abc123", Value: valor },
    { name: "JWT_SEGREDO", digest: "def456" },
  ]);
  assert.deepEqual(lerNomesDeSegredos(json).sort(), ["DATABASE_URL", "JWT_SEGREDO"]);

  const tabela = [
    "NAME             DIGEST            CREATED AT",
    `DATABASE_URL     abc123def         1d ago ${valor}`,
    "JWT_SEGREDO      def456abc         2d ago",
  ].join("\n");
  const nomes = lerNomesDeSegredos(tabela);
  assert.deepEqual(nomes.sort(), ["DATABASE_URL", "JWT_SEGREDO"]);
  assert.ok(!JSON.stringify(nomes).includes(valor));
  assert.throws(() => lerNomesDeSegredos("[ isso nao e json"), /JSON válido/);
});

// ---------------------------------------------------------------------------
// Os nomes de `fly secrets list` contra a coluna do ambiente
// ---------------------------------------------------------------------------

test("PROD com exatamente os segredos obrigatórios confere", () => {
  const nomes = segredosObrigatorios("api", "prod");
  const r = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "prod", nomes });
  assert.equal(reprovou(r), false, JSON.stringify(r));
  assert.ok(nomes.includes("DATABASE_URL") && nomes.includes("ORIGENS_PERMITIDAS"));
});

test("segredo obrigatório faltando reprova, pelo nome", () => {
  const nomes = segredosObrigatorios("api", "prod").filter((n) => n !== "DATABASE_URL");
  const r = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "prod", nomes });
  assert.deepEqual(r.faltando, ["DATABASE_URL"]);
  assert.equal(reprovou(r), true);
});

test("segredo exclusivo de PROD no app de HML reprova", () => {
  const nomes = [...segredosObrigatorios("api", "hml"), "APNS_CHAVE", "APNS_KEY_ID", "FCM_CONTA_SERVICO"];
  const r = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "hml", nomes });
  assert.deepEqual(r.proibidos, ["APNS_CHAVE", "APNS_KEY_ID", "FCM_CONTA_SERVICO"]);
  assert.equal(reprovou(r), true);
  // Os mesmos nomes em PROD não são problema: é exatamente a diferença entre as colunas.
  const emProd = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "prod", nomes: [...segredosObrigatorios("api", "prod"), "APNS_CHAVE", "APNS_KEY_ID", "FCM_CONTA_SERVICO"] });
  assert.equal(reprovou(emProd), false);
});

test("o console de HML com um segredo da API reprova como desconhecido (ADR 0008: segredos separados)", () => {
  const nomes = [...segredosObrigatorios("console", "hml"), "DATABASE_URL", "JWT_SEGREDO"];
  const r = compararNomes({ matriz: MATRIZ, app: "console", ambiente: "hml", nomes });
  assert.deepEqual(r.desconhecidos, ["DATABASE_URL", "JWT_SEGREDO"]);
});

test("nome que deveria estar no [env] e está nos segredos reprova (o segredo venceria a linha versionada)", () => {
  const nomes = [...segredosObrigatorios("api", "prod"), "AMBIENTE_DC360", "IDENTIDADE_DO_BANCO"];
  const r = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "prod", nomes });
  assert.deepEqual(r.noLugarErrado, ["AMBIENTE_DC360", "IDENTIDADE_DO_BANCO"]);
});

test("nome do próprio Fly (FLY_*) não conta, e o erro de app ou ambiente é de uso", () => {
  const nomes = [...segredosObrigatorios("api", "prod"), "FLY_API_TOKEN"];
  assert.equal(reprovou(compararNomes({ matriz: MATRIZ, app: "api", ambiente: "prod", nomes })), false);
  assert.throws(() => compararNomes({ matriz: MATRIZ, app: "web", ambiente: "prod", nomes: [] }), /app desconhecido/);
  assert.throws(() => compararNomes({ matriz: MATRIZ, app: "api", ambiente: "dev", nomes: [] }), /sem app no Fly/);
});

test("formatarComparacao imprime só nomes e frases, nunca valor", () => {
  const nomes = ["DATABASE_URL", "APNS_CHAVE"];
  const resultado = compararNomes({ matriz: MATRIZ, app: "api", ambiente: "hml", nomes });
  const texto = formatarComparacao({ app: "api", ambiente: "hml", nomes, resultado }).join("\n");
  assert.match(texto, /SOBRA  segredo proibido neste ambiente: APNS_CHAVE/);
  assert.match(texto, /FALTA  segredo obrigatório ausente: JWT_SEGREDO/);
  assert.doesNotMatch(texto, /postgres:\/\//);
});

// ---------------------------------------------------------------------------
// Os argumentos e o comando de verdade
// ---------------------------------------------------------------------------

test("lerArgumentos: sem argumento confere o repositório; com ambiente, exige app", () => {
  assert.equal(lerArgumentos([]).comparar, false);
  assert.equal(lerArgumentos(["--ambiente=prod", "--app=api"]).comparar, true);
  assert.match(lerArgumentos(["--ambiente=dev", "--app=api"]).erro, /hml ou prod/);
  assert.match(lerArgumentos(["--ambiente=prod"]).erro, /--app precisa ser/);
  assert.match(lerArgumentos(["--ambiente=prod", "--app=api", "--fly=Nome Ruim"]).erro, /nome do app no Fly/);
  assert.match(lerArgumentos(["--ambiente=prod", "--app=api", "--lista"]).erro, /arquivo/);
  assert.match(lerArgumentos(["--curinga"]).erro, /opção desconhecida/);
  assert.match(lerArgumentos(["solto"]).erro, /argumento inesperado/);
});

function rodar(args, entrada) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", input: entrada, cwd: RAIZ_DO_PRODUTO });
}

test("o comando: repositório confere com código 0", () => {
  const r = rodar([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /o repositório bate com scripts\/ambientes\.json/);
});

test("o comando: PROD confere com a lista em arquivo e o valor NUNCA aparece na saída", () => {
  const valor = "valor-secreto-que-nao-pode-aparecer";
  const pasta = mkdtempSync(join(tmpdir(), "lista-de-segredos-"));
  try {
    const arquivo = join(pasta, "lista.json");
    writeFileSync(arquivo, JSON.stringify(segredosObrigatorios("api", "prod").map((Name) => ({ Name, Digest: "abc", Value: valor }))));
    const r = rodar(["--ambiente=prod", "--app=api", `--lista=${arquivo}`]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /OK: os nomes batem com a matriz/);
    assert.ok(!(r.stdout + r.stderr).includes(valor));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("o comando: a lista pela entrada padrão, com segredo de PROD no HML, sai com código 1", () => {
  const nomes = [...segredosObrigatorios("api", "hml"), "APNS_CHAVE"];
  const r = rodar(["--ambiente=hml", "--app=api", "--lista=-"], JSON.stringify(nomes.map((Name) => ({ Name }))));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stdout, /SOBRA  segredo proibido neste ambiente: APNS_CHAVE/);
});

test("o comando: uso errado sai com código 2", () => {
  assert.equal(rodar(["--ambiente=dev", "--app=api"]).status, 2);
  assert.equal(rodar(["--ambiente=hml", "--app=api"]).status, 2, "HML sem app na matriz exige --fly");
});
