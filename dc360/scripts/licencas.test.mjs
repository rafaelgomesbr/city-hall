/**
 * Testes da conferência de licenças (V2-F01-E19, `licencas.mjs`).
 *
 * Os casos negativos montam lockfiles e políticas sintéticos numa pasta
 * temporária e provam que a régua morde: AGPL reprova, componente sem licença
 * reprova, exceção vencida reprova, e o estado real do repositório passa. O
 * que os testes NÃO podem provar sozinhos é a lista de licenças em si: ela é o
 * CP-43, decidido por Rafael com o jurídico.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  avaliarLicenca,
  componentesDeProducao,
  conferir,
  executar,
  lerExpressao,
  normalizarLicenca,
  problemasDaPolitica,
  relatorio,
} from "./licencas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const SCRIPT = join(AQUI, "licencas.mjs");
const HOJE = "2026-10-24";

const politicaReal = JSON.parse(readFileSync(join(RAIZ, "politica-de-licencas.json"), "utf8"));

/** Política mínima e bem formada; `decidida` liga o modo que reprova. */
function politica({
  decidida = true,
  excecoes = [],
  permitidas = ["MIT", "ISC", "BSD-3-Clause", "Apache-2.0"],
} = {}) {
  return {
    decisao: decidida
      ? {
          checkpoint: "CP-43",
          status: "decidida",
          decidida_por: "Rafael",
          decidida_em: "2026-10-24",
        }
      : { checkpoint: "CP-43", status: "proposta" },
    permitidas,
    proibidas: ["AGPL", "GPL", "SSPL"],
    excecoes,
  };
}

const pacote = (nome, versao, extra = {}) => [
  `node_modules/${nome}`,
  { version: versao, ...extra },
];
const lockfile = (...entradas) => ({
  lockfileVersion: 3,
  packages: { "": { name: "x" }, ...Object.fromEntries(entradas) },
});

/** Monta uma "raiz" falsa com os dois lockfiles e a política, devolve a pasta. */
function raizFalsa({ plataforma, campo, pol }) {
  const dir = mkdtempSync(join(tmpdir(), "licencas-"));
  mkdirSync(join(dir, "apps", "campo"), { recursive: true });
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(plataforma));
  writeFileSync(join(dir, "apps", "campo", "package-lock.json"), JSON.stringify(campo));
  writeFileSync(join(dir, "politica-de-licencas.json"), JSON.stringify(pol));
  return dir;
}

const limpo = lockfile(pacote("a", "1.0.0", { license: "MIT" }));

// ----- o estado real -----

test("o estado real do repositório passa: os dois lockfiles lidos, sem defeito na política, a exceção nomeada em uso", () => {
  const { codigo, resultado } = executar({ hoje: HOJE });
  assert.equal(codigo, 0);
  assert.deepEqual(resultado.defeitos, []);
  assert.ok(resultado.contagem.plataforma.total > 50, "a árvore da plataforma foi lida");
  assert.ok(resultado.contagem.campo.total > 300, "a árvore do aplicativo de campo foi lida");
  assert.equal(resultado.contagem.campo.excecao, 1, "o `exit` está coberto pela exceção nomeada");
  assert.equal(resultado.contagem.plataforma.proibida + resultado.contagem.campo.proibida, 0);
  assert.equal(resultado.contagem.plataforma.sem_licenca + resultado.contagem.campo.sem_licenca, 0);
});

test("a política versionada tem as listas propostas pelo roadmap e não decide nada pelo Rafael", () => {
  assert.deepEqual(problemasDaPolitica(politicaReal, HOJE), []);
  for (const id of [
    "MIT",
    "ISC",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "Apache-2.0",
    "0BSD",
    "CC0-1.0",
    "OFL-1.1",
  ]) {
    assert.ok(politicaReal.permitidas.includes(id), `${id} falta nas permitidas`);
  }
  assert.deepEqual(politicaReal.proibidas, ["AGPL", "GPL", "SSPL"]);
  assert.equal(politicaReal.decisao.checkpoint, "CP-43");
  if (politicaReal.decisao.status === "decidida") {
    assert.ok(politicaReal.decisao.decidida_por && politicaReal.decisao.decidida_em);
  }
  assert.match(politicaReal.descricao, /PROPOSTA|decid/i);
});

// ----- leitura do lockfile -----

test("componentesDeProducao: ignora dev, link, workspace e a raiz; deduplica; mantém devOptional", () => {
  const lock = lockfile(
    pacote("prod", "1.0.0", { license: "MIT" }),
    pacote("so-dev", "2.0.0", { dev: true, license: "MIT" }),
    pacote("opcional-de-dev", "3.0.0", { devOptional: true, license: "ISC" }),
    pacote("pai/node_modules/prod", "1.0.0", { license: "MIT" }),
    pacote("@dc360/shared", "0.1.0", { link: true, resolved: "packages/shared" }),
    ["packages/shared", { version: "0.1.0" }],
    pacote("antigo", "1.0.0", { license: { type: "BSD-3-Clause", url: "x" } }),
    pacote("sem-campo", "1.0.0"),
  );
  const nomes = componentesDeProducao(lock).map((c) => `${c.pacote}@${c.versao}:${c.licenca}`);
  assert.deepEqual(nomes, [
    "antigo@1.0.0:BSD-3-Clause",
    "opcional-de-dev@3.0.0:ISC",
    "prod@1.0.0:MIT",
    "sem-campo@1.0.0:",
  ]);
  assert.throws(() => componentesDeProducao({ lockfileVersion: 1, dependencies: {} }), /packages/);
});

// Correção 1 da F01 (E19): confiar só em `dev: true` deixava sumir da conferência
// um componente que o grafo de runtime alcança (lockfile editado ou corrompido).
test("componentesDeProducao: o grafo de runtime decide, e a marca `dev: true` inconsistente não esconde o componente", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": {
        name: "dc360",
        dependencies: { "fast-uri": "^4.2.3" },
        devDependencies: { vitest: "1" },
      },
      // Alcançado pela raiz em runtime, mas marcado como só de desenvolvimento à mão.
      "node_modules/fast-uri": { version: "4.2.3", dev: true, license: "AGPL-3.0" },
      // Só de desenvolvimento de verdade: alcançado apenas por devDependencies.
      "node_modules/vitest": { version: "1.0.0", dev: true, license: "MIT" },
    },
  };
  const nomes = componentesDeProducao(lock).map((c) => `${c.pacote}@${c.versao}:${c.licenca}`);
  assert.deepEqual(
    nomes,
    ["fast-uri@4.2.3:AGPL-3.0"],
    "só o de runtime; o de verdade-dev segue de fora",
  );
  // Com a política decidida, o AGPL escondido pela marca agora reprova.
  const resultado = conferir(
    [{ nome: "plataforma", componentes: componentesDeProducao(lock) }],
    politica(),
    HOJE,
  );
  assert.equal(resultado.contagem.plataforma.proibida, 1);
  assert.equal(resultado.reprova, true);
});

test("componentesDeProducao: dependência transitiva de runtime também é alcançada pelo grafo, mesmo marcada dev", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "dc360", dependencies: { a: "1" } },
      "node_modules/a": { version: "1.0.0", license: "MIT", dependencies: { b: "1" } },
      "node_modules/b": { version: "1.0.0", dev: true, license: "GPL-3.0-only" },
    },
  };
  assert.deepEqual(
    componentesDeProducao(lock).map((c) => c.pacote),
    ["a", "b"],
  );
});

test("normalizarLicenca: texto, objeto antigo {type}, lista antiga e ausência", () => {
  assert.equal(normalizarLicenca(" MIT "), "MIT");
  assert.equal(normalizarLicenca({ type: "MIT", url: "x" }), "MIT");
  assert.equal(normalizarLicenca([{ type: "MIT" }, { type: "Apache-2.0" }]), "(MIT OR Apache-2.0)");
  assert.equal(normalizarLicenca(undefined), "");
  assert.equal(normalizarLicenca(42), "");
});

// ----- expressões SPDX -----

test("expressões SPDX: OR escolhe a melhor, AND fica com a pior, WITH vale pela base, + e caixa não enganam", () => {
  const p = politica();
  assert.equal(avaliarLicenca("MIT", p), "permitida");
  assert.equal(avaliarLicenca("mit", p), "permitida");
  assert.equal(avaliarLicenca("(BSD-3-Clause OR GPL-2.0)", p), "permitida");
  assert.equal(avaliarLicenca("MIT AND Apache-2.0", p), "permitida");
  assert.equal(avaliarLicenca("MIT AND GPL-3.0-only", p), "proibida");
  assert.equal(avaliarLicenca("GPL-2.0 WITH Classpath-exception-2.0", p), "proibida");
  assert.equal(avaliarLicenca("GPL-2.0+", p), "proibida");
  assert.equal(avaliarLicenca("AGPL-3.0-or-later", p), "proibida");
  assert.equal(avaliarLicenca("SSPL-1.0", p), "proibida");
  assert.equal(avaliarLicenca("(MIT OR (GPL-3.0 AND Apache-2.0))", p), "permitida");
  assert.equal(avaliarLicenca("MPL-2.0", p), "nao_classificada");
  // LGPL não é GPL: não casa a família proibida (está fora da lista, o que é decisão do CP-43).
  assert.equal(avaliarLicenca("LGPL-3.0", p), "nao_classificada");
  assert.equal(avaliarLicenca("MIT AND MPL-2.0", p), "nao_classificada");
});

test("expressão ilegível ou ausente: sem licença ou não classificada, nunca permitida", () => {
  const p = politica();
  for (const t of ["", "   ", "UNLICENSED", "SEE LICENSE IN LICENSE.md", "none"]) {
    assert.equal(avaliarLicenca(t, p), "sem_licenca", `"${t}"`);
  }
  for (const t of [
    "MIT/X11",
    "(MIT",
    "MIT OR",
    "OR MIT",
    "MIT AND AND ISC",
    "MIT)",
    "GPL-2.0 WITH",
  ]) {
    assert.equal(avaliarLicenca(t, p), "nao_classificada", `"${t}"`);
  }
  assert.equal(
    lerExpressao("MIT OR ISC AND Apache-2.0").tipo,
    "ou",
    "AND amarra mais forte que OR",
  );
});

// ----- o que reprova -----

test("fixture com AGPL: reprova com a política decidida e só avisa com a proposta", () => {
  const arvores = [
    {
      nome: "plataforma",
      componentes: componentesDeProducao(
        lockfile(pacote("engole", "9.9.9", { license: "AGPL-3.0" })),
      ),
    },
  ];
  const decidida = conferir(arvores, politica(), HOJE);
  assert.equal(decidida.reprova, true);
  assert.equal(decidida.achados[0].veredito, "proibida");
  assert.match(relatorio(decidida), /REPROVA, licença PROIBIDA: AGPL-3\.0.*engole@9\.9\.9/);

  const proposta = conferir(arvores, politica({ decidida: false }), HOJE);
  assert.equal(proposta.reprova, false);
  assert.equal(proposta.achados.length, 1);
  assert.match(relatorio(proposta), /AVISO \(CP-43 em aberto\)/);
});

test("componente sem licença reprova com a política decidida (e UNLICENSED também)", () => {
  for (const extra of [{}, { license: "UNLICENSED" }]) {
    const arvores = [
      {
        nome: "campo",
        componentes: componentesDeProducao(lockfile(pacote("mudo", "1.0.0", extra))),
      },
    ];
    const r = conferir(arvores, politica(), HOJE);
    assert.equal(r.reprova, true);
    assert.equal(r.achados[0].veredito, "sem_licenca");
  }
});

test("licença fora das duas listas reprova com a política decidida (nega por padrão) e a exceção nomeada a libera", () => {
  const comp = componentesDeProducao(lockfile(pacote("raro", "1.2.3", { license: "MPL-2.0" })));
  assert.equal(conferir([{ nome: "campo", componentes: comp }], politica(), HOJE).reprova, true);

  const excecao = {
    pacote: "raro",
    versao: "1.2.3",
    motivo: "Biblioteca de build, não distribuída no pacote do telefone.",
    dono: "Rafael",
    ate: "2027-01-05",
  };
  const r = conferir(
    [{ nome: "campo", componentes: comp }],
    politica({ excecoes: [excecao] }),
    HOJE,
  );
  assert.equal(r.reprova, false);
  assert.equal(r.contagem.campo.excecao, 1);

  // A exceção é da VERSÃO: versão nova do mesmo pacote volta a reprovar (e a exceção velha vira órfã).
  const nova = componentesDeProducao(lockfile(pacote("raro", "1.3.0", { license: "MPL-2.0" })));
  const r2 = conferir(
    [{ nome: "campo", componentes: nova }],
    politica({ excecoes: [excecao] }),
    HOJE,
  );
  assert.equal(r2.reprova, true);
  assert.ok(r2.defeitos.some((d) => /raro@1\.2\.3.*não casa/.test(d)));
});

test("exceção vencida reprova, nos dois estados da política, e o componente volta a ser achado", () => {
  const comp = componentesDeProducao(lockfile(pacote("raro", "1.2.3", { license: "MPL-2.0" })));
  const vencida = {
    pacote: "raro",
    versao: "1.2.3",
    motivo: "Biblioteca de build, não distribuída no pacote do telefone.",
    dono: "Rafael",
    ate: "2026-10-23",
  };
  for (const decidida of [true, false]) {
    const r = conferir(
      [{ nome: "campo", componentes: comp }],
      politica({ decidida, excecoes: [vencida] }),
      HOJE,
    );
    assert.equal(r.reprova, true, `decidida=${decidida}`);
    assert.ok(r.defeitos.some((d) => /vencida em 2026-10-23/.test(d)));
    assert.equal(r.achados.length, 1, "sem a exceção válida, o componente volta a ser achado");
  }
  // No próprio dia ainda vale (a data vale até o fim do dia).
  const noDia = { ...vencida, ate: HOJE };
  assert.equal(
    conferir([{ nome: "campo", componentes: comp }], politica({ excecoes: [noDia] }), HOJE).reprova,
    false,
  );
});

test("exceção sem motivo, sem dono, sem data, com prazo longo demais ou sem versão: defeito da política", () => {
  const base = {
    pacote: "raro",
    versao: "1.2.3",
    motivo: "Biblioteca de build, não distribuída no pacote do telefone.",
    dono: "Rafael",
    ate: "2027-01-05",
  };
  const casos = [
    [{ ...base, motivo: "ok" }, /motivo curto demais/],
    [{ ...base, dono: "" }, /falta o dono/],
    [{ ...base, ate: undefined }, /falta a data/],
    [{ ...base, ate: "2031-01-01" }, /passa de 366/],
    [{ ...base, ate: "05/01/2027" }, /inválida/],
    [{ ...base, versao: "" }, /precisa de `pacote` e `versao`/],
  ];
  for (const [excecao, esperado] of casos) {
    const defeitos = problemasDaPolitica(politica({ excecoes: [excecao] }), HOJE);
    assert.ok(
      defeitos.some((d) => esperado.test(d)),
      `${JSON.stringify(excecao)} -> ${defeitos.join(" | ")}`,
    );
  }
  assert.ok(
    problemasDaPolitica(politica({ excecoes: [base, base] }), HOJE).some((d) => /repetida/.test(d)),
  );
});

test("exceção desnecessária (a licença já é permitida) e política mal formada também são defeito", () => {
  const comp = componentesDeProducao(lockfile(pacote("bom", "1.0.0", { license: "MIT" })));
  const inutil = {
    pacote: "bom",
    versao: "1.0.0",
    motivo: "Não precisava, a licença já é permitida.",
    dono: "Rafael",
    ate: "2027-01-05",
  };
  const r = conferir(
    [{ nome: "campo", componentes: comp }],
    politica({ excecoes: [inutil] }),
    HOJE,
  );
  assert.equal(r.reprova, true);
  assert.ok(r.defeitos.some((d) => /desnecessária/.test(d)));

  const mal = [
    [{}, /falta `decisao`/],
    [{ ...politica(), decisao: { checkpoint: "CP-43", status: "talvez" } }, /status/],
    [{ ...politica(), decisao: { checkpoint: "CP-43", status: "decidida" } }, /decidida_por/],
    [{ ...politica(), permitidas: [] }, /permitidas/],
    [{ ...politica(), proibidas: "GPL" }, /proibidas/],
    [{ ...politica(), permitidas: ["MIT", "GPL-3.0"] }, /família proibida/],
    [{ ...politica(), excecoes: undefined }, /excecoes/],
  ];
  for (const [pol, esperado] of mal) {
    assert.ok(
      problemasDaPolitica(pol, HOJE).some((d) => esperado.test(d)),
      JSON.stringify(pol),
    );
  }
  assert.equal(
    conferir([{ nome: "campo", componentes: comp }], "isto não é política", HOJE).reprova,
    true,
  );
});

test("lockfile sem componente algum não passa por verde (não leu nada)", () => {
  const r = conferir(
    [{ nome: "plataforma", componentes: [] }],
    politica({ decidida: false }),
    HOJE,
  );
  assert.equal(r.reprova, true);
  assert.ok(r.defeitos.some((d) => /nenhum componente de produção lido/.test(d)));
});

// ----- linha de comando (o código de saída que o CI lê) -----

function rodar(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("linha de comando: repositório real sai 0; AGPL com política decidida sai 1; proposta sai 0; arquivo ilegível sai 2", () => {
  const real = rodar([`--hoje=${HOJE}`]);
  assert.equal(real.status, 0, real.stdout + real.stderr);
  assert.match(real.stdout, /RESULTADO: em ordem/);

  const agpl = lockfile(pacote("engole", "9.9.9", { license: "AGPL-3.0" }));
  const dir = raizFalsa({ plataforma: agpl, campo: limpo, pol: politica() });
  const dirProposta = raizFalsa({
    plataforma: agpl,
    campo: limpo,
    pol: politica({ decidida: false }),
  });
  const dirRuim = raizFalsa({ plataforma: limpo, campo: limpo, pol: politica() });
  try {
    const reprova = rodar([`--raiz=${dir}`, `--hoje=${HOJE}`]);
    assert.equal(reprova.status, 1, reprova.stdout + reprova.stderr);
    assert.match(reprova.stdout, /AGPL-3\.0/);

    const avisa = rodar([`--raiz=${dirProposta}`, `--hoje=${HOJE}`]);
    assert.equal(avisa.status, 0, avisa.stdout + avisa.stderr);
    assert.match(avisa.stdout, /AVISO \(CP-43 em aberto\)/);

    writeFileSync(join(dirRuim, "package-lock.json"), "{ não é json");
    const ilegivel = rodar([`--raiz=${dirRuim}`]);
    assert.equal(ilegivel.status, 2);
    assert.match(ilegivel.stdout, /não é JSON válido/);

    assert.equal(rodar([`--raiz=${join(dir, "nao-existe")}`]).status, 2);
    assert.equal(rodar(["--opcao-que-nao-existe"]).status, 2);
    assert.equal(rodar(["--hoje=amanha"]).status, 2);
  } finally {
    for (const d of [dir, dirProposta, dirRuim]) rmSync(d, { recursive: true, force: true });
  }
});

// ----- onde a conferência roda -----

test("o job produto do verificar.yml roda a conferência de licenças, sem continue-on-error e sem escrita", () => {
  const texto = readFileSync(join(RAIZ, "..", ".github", "workflows", "verificar.yml"), "utf8");
  const inicio = texto.indexOf("\n  produto:\n");
  const fim = texto.indexOf("\n  dependencias:\n");
  assert.ok(inicio > 0 && fim > inicio);
  const job = texto.slice(inicio, fim);
  assert.match(job, /node scripts\/licencas\.mjs/);
  const passo = /- name: Licenças[^\n]*\n(?:(?! {6}- ).*\n)+/.exec(job)?.[0] ?? "";
  assert.ok(passo, "o passo de licenças existe no job produto");
  assert.doesNotMatch(passo, /continue-on-error/);
  assert.doesNotMatch(job, /^\s*[\w-]+:\s*write\s*$/m);
});
