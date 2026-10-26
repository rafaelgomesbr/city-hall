/**
 * Testes do `esperar-painel.mjs` (V2-F01-E12, correção 1 da F01, achado 5 da
 * revisão independente).
 *
 * O selo `hml-ok-<sha>` nascia depois de o ramo `homologacao` se mover, sem
 * ninguém olhar se a Vercel publicou. Aqui a API do GitHub e o painel são
 * dublês (`buscar`), o relógio é controlado (`agora` e `dormir`), e nenhum caso
 * toca rede, token ou Vercel de verdade.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  avaliarPainel,
  dominioDoAmbiente,
  escolherDeployment,
  esperarPainel,
  estadoDoDeployment,
  lerArgumentos,
} from "./esperar-painel.mjs";

const executar = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("./esperar-painel.mjs", import.meta.url));

const SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJETO = "dc360-painel-hml";
const ENDERECO = "dc360-painel-hml.vercel.app";
const REPO = "dono/repositorio";

const resposta = (status, corpo, cabecalhos = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null },
  json: async () => corpo,
  body: { cancel: async () => {} },
});

/** Relógio de mentira: `dormir` só anda o ponteiro. */
function relogio() {
  let t = 0;
  return {
    agora: () => t,
    dormir: async (ms) => {
      t += ms;
    },
  };
}

/**
 * Um GitHub e um painel de mentira. `estados` é a sequência de estados do
 * deployment a cada consulta (null = a Vercel ainda não registrou nada); o
 * último se repete. `painel` é a sequência de status do endereço de HML.
 */
function mundo({ estados, painel = [200], outros = [] }) {
  const pedidos = [];
  let iEstado = 0;
  let iPainel = 0;
  const buscar = async (url, opcoes = {}) => {
    pedidos.push({ url, opcoes });
    const u = new URL(url);
    if (u.hostname === "api.github.com" && u.pathname === `/repos/${REPO}/deployments`) {
      const estado = estados[Math.min(iEstado, estados.length - 1)];
      // Sem deployment, a consulta de estado não acontece: a rodada termina aqui.
      if (estado === null) iEstado++;
      return resposta(200, [
        ...outros,
        ...(estado === null
          ? []
          : [
              {
                id: 77,
                environment: `Production – ${PROJETO}`,
                created_at: "2026-10-26T10:00:00Z",
                sha: SHA,
              },
            ]),
      ]);
    }
    if (
      u.hostname === "api.github.com" &&
      u.pathname === `/repos/${REPO}/deployments/77/statuses`
    ) {
      const estado = estados[Math.min(iEstado++, estados.length - 1)];
      return resposta(200, [
        { state: estado, created_at: "2026-10-26T10:01:00Z", log_url: "https://vercel.com/x/logs" },
      ]);
    }
    if (u.hostname === ENDERECO) {
      const status = painel[Math.min(iPainel++, painel.length - 1)];
      return resposta(
        status,
        null,
        status === 200 ? { "content-type": "text/html; charset=utf-8" } : {},
      );
    }
    throw new Error(`pedido inesperado: ${url}`);
  };
  return { buscar, pedidos };
}

const base = {
  repositorio: REPO,
  token: "token-de-mentira",
  commit: SHA,
  projeto: PROJETO,
  endereco: ENDERECO,
  limiteMs: 15 * 60_000,
  intervaloMs: 15_000,
};

test("lerArgumentos exige ambiente, projeto e commit de 40 hexadecimais, e aceita um limite em minutos", () => {
  assert.deepEqual(lerArgumentos(["--ambiente=hml", `--projeto=${PROJETO}`, `--commit=${SHA}`]), {
    ambiente: "hml",
    projeto: PROJETO,
    commit: SHA,
    limiteMin: 15,
  });
  assert.equal(
    lerArgumentos(["--ambiente=hml", `--projeto=${PROJETO}`, `--commit=${SHA}`, "--limite-min=5"])
      .limiteMin,
    5,
  );
  assert.throws(() => lerArgumentos(["--ambiente=hml", `--projeto=${PROJETO}`]), /--commit/);
  assert.throws(
    () => lerArgumentos(["--ambiente=hml", `--projeto=${PROJETO}`, "--commit=abc"]),
    /40/,
  );
  assert.throws(
    () => lerArgumentos(["--ambiente=dev", `--projeto=${PROJETO}`, `--commit=${SHA}`]),
    /hml ou prod/,
  );
  assert.throws(
    () => lerArgumentos(["--ambiente=hml", "--projeto=", `--commit=${SHA}`]),
    /--projeto/,
  );
  assert.throws(
    () =>
      lerArgumentos([
        "--ambiente=hml",
        `--projeto=${PROJETO}`,
        `--commit=${SHA}`,
        "--limite-min=0",
      ]),
    /limite/,
  );
  assert.throws(
    () => lerArgumentos(["--ambiente=hml", `--projeto=${PROJETO}`, `--commit=${SHA}`, "--outro"]),
    /desconhecido/,
  );
});

test("o endereço do painel vem da matriz de ambientes; HML sem domínio declarado reprova dizendo de quem depende", () => {
  assert.equal(dominioDoAmbiente("prod"), "dc360-painel-web.vercel.app");
  assert.equal(dominioDoAmbiente("hml", { ambientes: { hml: { dominio: ENDERECO } } }), ENDERECO);
  assert.throws(
    () => dominioDoAmbiente("hml", { ambientes: { hml: { dominio: null } } }),
    /ambientes\.json.*CP-05/s,
  );
});

test("o deployment escolhido é o mais novo de PRODUÇÃO do projeto de HML; preview e outro projeto não contam", () => {
  const lista = [
    { id: 1, environment: `Production – ${PROJETO}`, created_at: "2026-10-26T09:00:00Z" },
    { id: 2, environment: `Production – ${PROJETO}`, created_at: "2026-10-26T10:00:00Z" },
    { id: 3, environment: `Preview – ${PROJETO}`, created_at: "2026-10-26T11:00:00Z" },
    { id: 4, environment: "Production – dc360-painel-web", created_at: "2026-10-26T12:00:00Z" },
    { id: 5, environment: `Production – ${PROJETO}-velho`, created_at: "2026-10-26T13:00:00Z" },
  ];
  assert.equal(escolherDeployment(lista, PROJETO).id, 2);
  assert.equal(escolherDeployment(lista.slice(2), PROJETO), null);
  assert.equal(
    escolherDeployment(
      [{ id: 9, environment: `production - ${PROJETO}`, created_at: "x" }],
      PROJETO,
    ).id,
    9,
    "hífen e caixa baixa também",
  );
});

test("o estado do deployment: success é Ready; failure, error e inactive reprovam; o resto espera", () => {
  assert.equal(estadoDoDeployment([{ state: "success" }]).estado, "pronto");
  for (const ruim of ["failure", "error", "inactive"])
    assert.equal(estadoDoDeployment([{ state: ruim }]).estado, "falhou", ruim);
  for (const espera of ["pending", "queued", "in_progress"])
    assert.equal(estadoDoDeployment([{ state: espera }]).estado, "esperando", espera);
  assert.equal(estadoDoDeployment([]).estado, "esperando");
  // O mais novo vale, mesmo fora de ordem.
  assert.equal(
    estadoDoDeployment([
      { state: "pending", created_at: "2026-10-26T10:00:00Z" },
      { state: "success", created_at: "2026-10-26T10:05:00Z" },
    ]).estado,
    "pronto",
  );
});

test("o painel responde: 200 com HTML passa; erro, redirecionamento ou corpo que não é HTML reprova", () => {
  const h = (ct) => ({ get: (n) => (n === "content-type" ? ct : null) });
  assert.equal(avaliarPainel({ status: 200, headers: h("text/html; charset=utf-8") }).ok, true);
  assert.equal(avaliarPainel({ status: 404, headers: h("text/html") }).ok, false);
  assert.equal(avaliarPainel({ status: 401, headers: h("text/html") }).ok, false);
  assert.equal(avaliarPainel({ status: 308, headers: h(null) }).ok, false);
  assert.equal(avaliarPainel({ status: 200, headers: h("application/json") }).ok, false);
});

test("caminho feliz: espera a Vercel registrar, passar de pending a Ready, e o endereço de HML responder", async () => {
  const { buscar, pedidos } = mundo({
    estados: [null, "pending", "in_progress", "success"],
    painel: [404, 200],
  });
  const r = await esperarPainel({ ...base, buscar, ...relogio() });
  assert.equal(r.ok, true, r.detalhe);
  assert.match(r.detalhe, /Ready/);
  const doGithub = pedidos.filter((p) => new URL(p.url).hostname === "api.github.com");
  assert.ok(doGithub.every((p) => p.opcoes.headers.authorization === "Bearer token-de-mentira"));
  assert.ok(
    doGithub.some((p) => p.url.includes(`sha=${SHA}`)),
    "os deployments são filtrados pelo commit implantado",
  );
});

test("falha de build na Vercel reprova LOGO, sem esperar o limite, e diz onde está o log", async () => {
  const { buscar } = mundo({ estados: ["pending", "failure"] });
  const r = relogio();
  const resultado = await esperarPainel({ ...base, buscar, ...r });
  assert.equal(resultado.ok, false);
  assert.match(resultado.detalhe, /failure/);
  assert.match(resultado.detalhe, /vercel\.com\/x\/logs/);
  assert.ok(r.agora() < 5 * 60_000, "não esperou o limite inteiro");
});

test("Vercel que nunca fica Ready, ou que nunca registra o deployment, reprova no limite, com o último estado", async () => {
  const preso = await esperarPainel({
    ...base,
    limiteMs: 5 * 60_000,
    buscar: mundo({ estados: ["in_progress"] }).buscar,
    ...relogio(),
  });
  assert.equal(preso.ok, false);
  assert.match(preso.detalhe, /tempo esgotado.*5 min.*in_progress/s);
  const nada = await esperarPainel({
    ...base,
    limiteMs: 2 * 60_000,
    buscar: mundo({
      estados: [null],
      outros: [{ id: 1, environment: "Preview – x", created_at: "z" }],
    }).buscar,
    ...relogio(),
  });
  assert.equal(nada.ok, false);
  assert.match(nada.detalhe, /nenhum deployment de produção do projeto dc360-painel-hml/);
});

test("Ready mas o endereço de HML não responde: reprova no limite nomeando o endereço, e queda de rede não derruba a espera", async () => {
  const { buscar } = mundo({ estados: ["success"], painel: [503] });
  let caiu = false;
  const comQueda = async (url, opcoes) => {
    if (!caiu) {
      caiu = true;
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
    }
    return buscar(url, opcoes);
  };
  const r = await esperarPainel({ ...base, limiteMs: 3 * 60_000, buscar: comQueda, ...relogio() });
  assert.equal(r.ok, false);
  assert.match(r.detalhe, new RegExp(`${ENDERECO}.*503`));
});

test("como comando: sem argumentos sai 2; HML sem domínio na matriz sai 1 sem tocar a rede", async () => {
  await assert.rejects(executar(process.execPath, [SCRIPT]), (erro) => {
    assert.equal(erro.code, 2);
    assert.match(erro.stderr, /uso: node scripts\/esperar-painel\.mjs/);
    return true;
  });
  await assert.rejects(
    executar(
      process.execPath,
      [SCRIPT, "--ambiente=hml", `--projeto=${PROJETO}`, `--commit=${SHA}`],
      { env: { ...process.env, GH_TOKEN: "", GITHUB_REPOSITORY: REPO } },
    ),
    (erro) => {
      assert.equal(erro.code, 1);
      assert.match(erro.stderr, /CP-05/);
      return true;
    },
  );
});
