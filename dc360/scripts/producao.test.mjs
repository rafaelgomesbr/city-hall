import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import {
  ErroDeCredencial, ErroDeUso, ajudaDaSenha, comandoDoNpm, lerAmbiente, linhasDoAlvo, montarUrl,
  obterSenha, perfilDoAmbiente, perguntarSemEco, senhaDoChaveiro, urlSemSenha,
} from "./producao.mjs";

/**
 * Os roteiros de producao por ambiente e por sistema (V2-F01-E15).
 *
 * Nada aqui toca banco, chaveiro ou terminal de verdade: o sistema operacional,
 * o ambiente do processo e os comandos externos entram por parametro, e a
 * matriz de ambientes e uma de mentira.
 */

/** Uma matriz com HML ja nascido, para provar que a URL segue o ambiente. */
const MATRIZ = {
  ambientes: {
    hml: { identidadeDoBanco: "hmlprojetoabcdef", bancoHost: "hml.exemplo.test", bancoPorta: 5433 },
    prod: { identidadeDoBanco: "prodprojetoabcdef", bancoHost: "prod.exemplo.test", bancoPorta: 5432 },
  },
};
const MATRIZ_SEM_HML = {
  ambientes: { hml: { identidadeDoBanco: null }, prod: MATRIZ.ambientes.prod },
};

/* ---------------------------------------------------------------------
 * --ambiente e obrigatorio
 * --------------------------------------------------------------------- */

test("sem --ambiente o roteiro recusa, e a mensagem explica por que nao ha padrao", () => {
  assert.throws(
    () => lerAmbiente(["--aplicar"]),
    (e) => e instanceof ErroDeUso && e.codigo === 2 && /--ambiente hml\|prod/.test(e.message) && /por omissão/.test(e.message),
  );
  assert.throws(() => lerAmbiente([]), ErroDeUso);
});

test("--ambiente sem valor, ou seguido de outra opcao, recusa", () => {
  assert.throws(() => lerAmbiente(["--ambiente"]), ErroDeUso);
  assert.throws(() => lerAmbiente(["--ambiente", "--aplicar"]), ErroDeUso);
  assert.throws(() => lerAmbiente(["--ambiente="]), ErroDeUso);
});

test("so hml e prod servem; dev e qualquer outra coisa recusam", () => {
  assert.throws(() => lerAmbiente(["--ambiente", "dev"]), /dev é a sua máquina/);
  assert.throws(() => lerAmbiente(["--ambiente", "producao"]), /não serve/);
  assert.throws(() => lerAmbiente(["--ambiente=PROD"]), /não serve/, "caixa alta nao e aceita: ambiente e escolha deliberada");
});

test("as duas formas aceitas, e o restante dos argumentos sai sem --ambiente", () => {
  assert.deepEqual(lerAmbiente(["--ambiente", "hml", "--aplicar"]), { ambiente: "hml", restante: ["--aplicar"] });
  assert.deepEqual(lerAmbiente(["--conferir", "--ambiente=prod"]), { ambiente: "prod", restante: ["--conferir"] });
  assert.deepEqual(
    lerAmbiente(["--municipio", "Serra Alta", "--ambiente", "prod", "--uf", "MG"]).restante,
    ["--municipio", "Serra Alta", "--uf", "MG"],
    "o provisionador nao recebe --ambiente",
  );
});

/* ---------------------------------------------------------------------
 * URL por ambiente
 * --------------------------------------------------------------------- */

test("o perfil de cada ambiente vem da matriz: projeto, host e porta proprios", () => {
  const hml = perfilDoAmbiente("hml", MATRIZ);
  const prod = perfilDoAmbiente("prod", MATRIZ);
  assert.deepEqual([hml.projeto, hml.host, hml.porta], ["hmlprojetoabcdef", "hml.exemplo.test", 5433]);
  assert.deepEqual([prod.projeto, prod.host, prod.porta], ["prodprojetoabcdef", "prod.exemplo.test", 5432]);
  assert.notEqual(hml.cofre, prod.cofre, "cofres diferentes");
  assert.notEqual(hml.variavelDaSenha, prod.variavelDaSenha, "variaveis diferentes");
});

test("a URL de cada ambiente aponta para o banco dele e para nenhum outro", () => {
  const u = new URL(montarUrl("x", perfilDoAmbiente("hml", MATRIZ)));
  assert.equal(u.username, "postgres.hmlprojetoabcdef");
  assert.equal(u.hostname, "hml.exemplo.test");
  assert.equal(u.port, "5433");
  assert.equal(u.searchParams.get("sslmode"), "verify-full");
  assert.doesNotMatch(u.toString(), /prodprojeto|prod\.exemplo/);
});

test("com a matriz de verdade, PROD continua sendo o banco de producao de sempre", () => {
  const prod = perfilDoAmbiente("prod");
  assert.equal(prod.projeto, "bppklrxxwjshxvkvwirw");
  assert.match(prod.host, /pooler/);
  assert.equal(prod.porta, 5432, "modo sessao, nunca 6543");
  assert.equal(prod.cofre, "senha-do-banco-dc360", "o item que ja esta no chaveiro do dono");
});

test("HML sem banco declarado recusa, e nao herda o de PROD", () => {
  assert.throws(
    () => perfilDoAmbiente("hml", MATRIZ_SEM_HML),
    (e) => e instanceof ErroDeUso && /ainda não tem banco declarado/.test(e.message) && /V2-F01-E11/.test(e.message),
  );
  assert.throws(() => perfilDoAmbiente("dev", MATRIZ), ErroDeUso);
});

test("a URL mostrada antes de agir nunca traz a senha", () => {
  const perfil = perfilDoAmbiente("prod", MATRIZ);
  const mostrada = urlSemSenha(perfil);
  assert.doesNotMatch(mostrada, /:x@/);
  assert.equal(new URL(mostrada).password, "");
  assert.match(linhasDoAlvo(perfil), /Ambiente: prod\nBanco: postgresql:\/\/postgres\.prodprojetoabcdef@prod\.exemplo\.test:5432/);
});

/* ---------------------------------------------------------------------
 * A senha: variavel, chaveiro de cada sistema, pergunta; nunca a de outro ambiente
 * --------------------------------------------------------------------- */

const hml = perfilDoAmbiente("hml", MATRIZ);
const prod = perfilDoAmbiente("prod", MATRIZ);
const semExecutor = () => { throw new Error("nao devia consultar o chaveiro"); };

test("a variavel de ambiente do ambiente vence tudo, e nao consulta chaveiro", async () => {
  const senha = await obterSenha({
    perfil: prod, plataforma: "darwin", env: { DC360_SENHA_BANCO_PROD: "da-variavel" }, executar: semExecutor, perguntar: null,
  });
  assert.equal(senha, "da-variavel");
});

test("a credencial de HML nao abre PROD, e a de PROD nao abre HML", async () => {
  const soHml = { DC360_SENHA_BANCO_HML: "senha-de-hml" };
  await assert.rejects(
    obterSenha({ perfil: prod, plataforma: "linux", env: soHml, executar: () => { throw new Error("sem"); }, perguntar: null }),
    ErroDeCredencial,
  );
  assert.equal(await obterSenha({ perfil: hml, plataforma: "linux", env: soHml, perguntar: null }), "senha-de-hml");

  const soProd = { DC360_SENHA_BANCO_PROD: "senha-de-prod" };
  await assert.rejects(
    obterSenha({ perfil: hml, plataforma: "win32", env: soProd, perguntar: null }),
    ErroDeCredencial,
  );
});

test("no macOS o chaveiro e lido por security, com o cofre do ambiente, e a senha vem da saida e nunca dos argumentos", async () => {
  const chamadas = [];
  const senha = await obterSenha({
    perfil: prod, plataforma: "darwin", env: {}, perguntar: null,
    executar: (cmd, args) => { chamadas.push([cmd, args]); return "do-chaveiro\n"; },
  });
  assert.equal(senha, "do-chaveiro");
  assert.deepEqual(chamadas, [["security", ["find-generic-password", "-a", "dc360", "-s", prod.cofre, "-w"]]]);
  assert.ok(!JSON.stringify(chamadas).includes("do-chaveiro"));
});

test("no Linux o chaveiro e o secret-tool; sem ele, cai para a pergunta", async () => {
  const chamadas = [];
  const senha = await obterSenha({
    perfil: hml, plataforma: "linux", env: {}, perguntar: null,
    executar: (cmd, args) => { chamadas.push(cmd); assert.deepEqual(args.slice(0, 1), ["lookup"]); return "do-segredo\n"; },
  });
  assert.equal(senha, "do-segredo");
  assert.deepEqual(chamadas, ["secret-tool"]);

  const perguntada = await obterSenha({
    perfil: hml, plataforma: "linux", env: {},
    executar: () => { throw new Error("secret-tool: command not found"); },
    perguntar: async () => "digitada",
  });
  assert.equal(perguntada, "digitada");
});

test("no Windows nao ha chaveiro embutido: nenhum comando e chamado, e vale a variavel ou a pergunta", async () => {
  assert.equal(senhaDoChaveiro({ plataforma: "win32", perfil: prod, executar: semExecutor }), null);
  const perguntada = await obterSenha({
    perfil: prod, plataforma: "win32", env: {}, executar: semExecutor, perguntar: async () => "digitada-no-windows",
  });
  assert.equal(perguntada, "digitada-no-windows");
});

test("sem nenhuma fonte, a mensagem e em portugues, ensina o sistema em uso e nao leva senha", async () => {
  for (const [plataforma, trecho] of [
    ["darwin", /security add-generic-password -a dc360 -s senha-do-banco-dc360 -w/],
    ["linux", /secret-tool store/],
    ["win32", /Read-Host -MaskInput/],
  ]) {
    const env = { OUTRA_COISA: "x", DC360_SENHA_BANCO_HML: "senha-de-hml-que-nao-pode-vazar" };
    await assert.rejects(
      obterSenha({ perfil: prod, plataforma, env, executar: () => { throw new Error("sem"); }, perguntar: null }),
      (e) => {
        assert.ok(e instanceof ErroDeCredencial);
        assert.match(e.message, /Não achei a senha do banco de PROD/);
        assert.match(e.message, /DC360_SENHA_BANCO_PROD/);
        assert.match(e.message, trecho);
        assert.doesNotMatch(e.message, /que-nao-pode-vazar/);
        return true;
      },
    );
  }
});

test("a ajuda de cada sistema fala so do sistema dele", () => {
  assert.doesNotMatch(ajudaDaSenha({ plataforma: "win32", perfil: prod }), /security add-generic-password|secret-tool/);
  assert.doesNotMatch(ajudaDaSenha({ plataforma: "darwin", perfil: prod }), /secret-tool|Read-Host/);
  assert.doesNotMatch(ajudaDaSenha({ plataforma: "linux", perfil: prod }), /security add-generic-password|Read-Host/);
});

/* ---------------------------------------------------------------------
 * A pergunta sem eco
 * --------------------------------------------------------------------- */

test("a pergunta sem eco mostra a pergunta e NAO ecoa o que se digita", async () => {
  const entrada = new PassThrough();
  const pedacos = [];
  const saida = new PassThrough();
  saida.on("data", (d) => pedacos.push(d.toString()));
  const promessa = perguntarSemEco("Senha: ", { entrada, saida });
  entrada.write("s3nh@-muito-secreta\n");
  assert.equal(await promessa, "s3nh@-muito-secreta");
  const tela = pedacos.join("");
  assert.match(tela, /Senha: /);
  assert.doesNotMatch(tela, /muito-secreta/);
});

test("fechar a entrada sem digitar nada e erro de credencial, nao senha vazia", async () => {
  const entrada = new PassThrough();
  const promessa = perguntarSemEco("Senha: ", { entrada, saida: new PassThrough() });
  entrada.end();
  await assert.rejects(promessa, ErroDeCredencial);
});

/* ---------------------------------------------------------------------
 * npm sem shell
 * --------------------------------------------------------------------- */

test("o npm e chamado sem shell em todo sistema, exceto o ultimo recurso do Windows", () => {
  assert.deepEqual(
    comandoDoNpm({ plataforma: "linux", env: {}, execPath: "/usr/bin/node" }),
    { comando: "npm", prefixo: [], shell: false },
  );
  assert.deepEqual(
    comandoDoNpm({ plataforma: "darwin", env: { npm_execpath: "/x/npm-cli.js" }, execPath: "/usr/bin/node" }),
    { comando: "/usr/bin/node", prefixo: ["/x/npm-cli.js"], shell: false },
  );
  const noWindows = comandoDoNpm({
    plataforma: "win32", env: {}, execPath: "C:\\nodejs\\node.exe", existe: () => true,
  });
  assert.equal(noWindows.comando, "C:\\nodejs\\node.exe");
  assert.equal(noWindows.shell, false, "sem shell: nome com espaco nao se parte");
  assert.match(noWindows.prefixo[0], /npm-cli\.js$/);
  assert.deepEqual(
    comandoDoNpm({ plataforma: "win32", env: {}, execPath: "C:\\nodejs\\node.exe", existe: () => false }),
    { comando: "npm.cmd", prefixo: [], shell: true },
  );
});
