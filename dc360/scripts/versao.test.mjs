/**
 * Testes de `versao.mjs` (V2-F01-E07).
 *
 * Cada caso monta uma árvore de mentira em pasta temporária (raiz, três
 * workspaces, lockfile, aplicativo e CHANGELOG) e prova que o script reprova o
 * que tem de reprovar: um workspace fora do número, lockfile defasado, versão
 * sem seção no CHANGELOG, tag `v1`. O último bloco roda contra a árvore REAL e
 * como comando (o código de saída é o que o CI lê). Nenhum caso cria tag.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { RAIZ_PADRAO, conferir, conferirTag, lerChangelog, lerSemVer, nomeDaTag, principal, proximaVersao, subir } from "./versao.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(AQUI, "versao.mjs");
const temporarios = [];
after(() => temporarios.forEach((p) => rmSync(p, { recursive: true, force: true })));

const json = (dados) => `${JSON.stringify(dados, null, 2)}\n`;

const CHANGELOG_PADRAO = `# Changelog

## Não lançado

Nada ainda.

## plataforma 0.1.0 - 2026-10-24

Primeira versão.

## campo 0.1.0 - 2026-10-24

Primeira versão do aplicativo.
`;

/** Árvore mínima, com tudo no mesmo número. `opcoes.changelog` troca o CHANGELOG. */
function arvore({ versao = "0.1.0", versaoDoApp = "0.1.0", changelog = CHANGELOG_PADRAO } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "versao-"));
  temporarios.push(raiz);
  const gravar = (arquivo, conteudo) => {
    mkdirSync(dirname(join(raiz, arquivo)), { recursive: true });
    writeFileSync(join(raiz, arquivo), conteudo);
  };
  gravar("package.json", json({ name: "dc360", version: versao, workspaces: ["packages/*", "apps/api"] }));
  gravar("packages/shared/package.json", json({ name: "@dc360/shared", version: versao }));
  gravar("packages/campo/package.json", json({ name: "@dc360/campo", version: versao }));
  gravar("apps/api/package.json", json({ name: "@dc360/api", version: versao }));
  gravar(
    "package-lock.json",
    json({
      name: "dc360",
      version: versao,
      lockfileVersion: 3,
      packages: {
        "": { name: "dc360", version: versao },
        "apps/api": { name: "@dc360/api", version: versao },
        "packages/campo": { name: "@dc360/campo", version: versao },
        "packages/shared": { name: "@dc360/shared", version: versao },
      },
    }),
  );
  gravar("apps/campo/app.config.ts", `// config\nconst VERSAO = "${versaoDoApp}";\nconst BUILD = 7;\n`);
  gravar("apps/campo/package.json", json({ name: "@dc360/campo-app", version: versaoDoApp }));
  gravar(
    "apps/campo/package-lock.json",
    json({ name: "@dc360/campo-app", version: versaoDoApp, lockfileVersion: 3, packages: { "": { name: "@dc360/campo-app", version: versaoDoApp } } }),
  );
  gravar("CHANGELOG.md", changelog);
  return raiz;
}

const ler = (raiz, arquivo) => readFileSync(join(raiz, arquivo), "utf8");
const lerJ = (raiz, arquivo) => JSON.parse(ler(raiz, arquivo));
const algum = (problemas, trecho) => problemas.some((p) => p.includes(trecho));

describe("SemVer e próxima versão", () => {
  it("aceita só X.Y.Z estrito e rejeita zero à esquerda, sufixo e falta de parte", () => {
    assert.deepEqual(lerSemVer("0.12.3"), [0, 12, 3]);
    for (const ruim of ["1", "0.1", "0.1.0-rc1", "0.01.0", "v0.1.0", "0.1.0.0", "", null, undefined]) {
      assert.equal(lerSemVer(ruim), null, String(ruim));
    }
  });

  it("y zera o z, z só soma, e uma versão explícita maior é aceita", () => {
    assert.equal(proximaVersao("0.3.7", "y"), "0.4.0");
    assert.equal(proximaVersao("0.3.7", "z"), "0.3.8");
    assert.equal(proximaVersao("0.3.7", "0.9.0"), "0.9.0");
  });

  it("recusa a 1.0.0 (decisão da G28), versão igual, versão menor e formato ruim", () => {
    assert.throws(() => proximaVersao("0.3.7", "1.0.0"), /G28/);
    assert.throws(() => proximaVersao("0.3.7", "0.3.7"), /maior/);
    assert.throws(() => proximaVersao("0.3.7", "0.2.9"), /maior/);
    assert.throws(() => proximaVersao("0.3.7", "0.4"), /SemVer/);
  });

  it("monta o nome da tag de cada linha", () => {
    assert.equal(nomeDaTag("plataforma", "0.2.0"), "v0.2.0");
    assert.equal(nomeDaTag("campo", "0.2.0"), "campo-v0.2.0");
  });
});

describe("conferir (positivos)", () => {
  it("árvore com tudo no mesmo número e seção no CHANGELOG passa", () => {
    const { problemas, versoes } = conferir(arvore());
    assert.deepEqual(problemas, []);
    assert.deepEqual(versoes, { plataforma: "0.1.0", campo: "0.1.0" });
  });

  it("as duas linhas podem estar em números diferentes", () => {
    const changelog = `${CHANGELOG_PADRAO}`.replace("## campo 0.1.0", "## campo 0.2.0");
    const { problemas, versoes } = conferir(arvore({ versaoDoApp: "0.2.0", changelog }));
    assert.deepEqual(problemas, []);
    assert.deepEqual(versoes, { plataforma: "0.1.0", campo: "0.2.0" });
  });

  it("subir plataforma leva TODOS os workspaces e o lockfile ao mesmo número", () => {
    const raiz = arvore();
    const resultado = subir(raiz, "plataforma", "y");
    assert.equal(resultado.nova, "0.2.0");
    for (const a of ["package.json", "packages/shared/package.json", "packages/campo/package.json", "apps/api/package.json"]) {
      assert.equal(lerJ(raiz, a).version, "0.2.0", a);
    }
    const trava = lerJ(raiz, "package-lock.json");
    assert.equal(trava.version, "0.2.0");
    for (const chave of ["", "apps/api", "packages/campo", "packages/shared"]) assert.equal(trava.packages[chave].version, "0.2.0", chave);
    // o app é outra linha e não anda junto
    assert.equal(lerJ(raiz, "apps/campo/package.json").version, "0.1.0");
    assert.match(ler(raiz, "apps/campo/app.config.ts"), /const VERSAO = "0\.1\.0";/);
    // e a formatação do npm foi preservada byte a byte (só a versão mudou)
    assert.equal(ler(raiz, "package.json"), json({ name: "dc360", version: "0.2.0", workspaces: ["packages/*", "apps/api"] }));
  });

  it("subir campo muda VERSAO, o package.json e o lockfile do app, e não toca o BUILD", () => {
    const raiz = arvore();
    const resultado = subir(raiz, "campo", "z");
    assert.equal(resultado.nova, "0.1.1");
    assert.equal(ler(raiz, "apps/campo/app.config.ts"), `// config\nconst VERSAO = "0.1.1";\nconst BUILD = 7;\n`);
    assert.equal(lerJ(raiz, "apps/campo/package.json").version, "0.1.1");
    const travaDoApp = lerJ(raiz, "apps/campo/package-lock.json");
    assert.equal(travaDoApp.version, "0.1.1");
    assert.equal(travaDoApp.packages[""].version, "0.1.1");
    assert.equal(lerJ(raiz, "package.json").version, "0.1.0");
  });

  it("depois de subir e de escrever a seção, conferir fecha; sem a seção, reprova", () => {
    const raiz = arvore();
    subir(raiz, "plataforma", "z");
    assert.ok(algum(conferir(raiz).problemas, "CHANGELOG sem a seção \"## plataforma 0.1.1"));
    writeFileSync(
      join(raiz, "CHANGELOG.md"),
      CHANGELOG_PADRAO.replace("## plataforma 0.1.0", "## plataforma 0.1.1 - 2026-10-25\n\nCorreção.\n\n## plataforma 0.1.0"),
    );
    assert.deepEqual(conferir(raiz).problemas, []);
  });

  it("lê as seções do CHANGELOG e ignora o 'Não lançado'", () => {
    const { secoes, problemas } = lerChangelog(CHANGELOG_PADRAO);
    assert.deepEqual(problemas, []);
    assert.deepEqual(secoes.map((s) => `${s.linha} ${s.versao}`), ["plataforma 0.1.0", "campo 0.1.0"]);
    assert.equal(secoes[0].corpo, "Primeira versão.");
  });
});

describe("conferir (negativos)", () => {
  it("bump em UM workspace só reprova e nomeia quem está fora", () => {
    const raiz = arvore();
    const arquivo = join(raiz, "packages/shared/package.json");
    writeFileSync(arquivo, json({ name: "@dc360/shared", version: "0.1.1" }));
    const { problemas, versoes } = conferir(raiz);
    assert.ok(algum(problemas, "workspace packages/shared está em 0.1.1"), problemas.join("\n"));
    assert.equal(versoes.plataforma, undefined);
  });

  it("package-lock defasado reprova", () => {
    const raiz = arvore();
    const trava = lerJ(raiz, "package-lock.json");
    trava.packages["apps/api"].version = "0.0.9";
    writeFileSync(join(raiz, "package-lock.json"), json(trava));
    assert.ok(algum(conferir(raiz).problemas, "entrada apps/api"));
  });

  it("aplicativo: VERSAO diferente do package.json do app reprova", () => {
    const raiz = arvore();
    writeFileSync(join(raiz, "apps/campo/app.config.ts"), `const VERSAO = "0.1.1";\n`);
    assert.ok(algum(conferir(raiz).problemas, "campo: apps/campo/package.json está em 0.1.0"));
  });

  it("aplicativo sem a linha VERSAO reprova em vez de passar calado", () => {
    const raiz = arvore();
    writeFileSync(join(raiz, "apps/campo/app.config.ts"), `const outra = 1;\n`);
    assert.ok(algum(conferir(raiz).problemas, "não declara versão"));
  });

  it("versão sem seção no CHANGELOG reprova, para cada linha", () => {
    const raiz = arvore({ changelog: "# Changelog\n\n## Não lançado\n\nNada.\n" });
    const { problemas } = conferir(raiz);
    assert.ok(algum(problemas, "CHANGELOG sem a seção \"## plataforma 0.1.0"));
    assert.ok(algum(problemas, "CHANGELOG sem a seção \"## campo 0.1.0"));
  });

  it("CHANGELOG ausente reprova", () => {
    const raiz = arvore();
    rmSync(join(raiz, "CHANGELOG.md"));
    assert.ok(algum(conferir(raiz).problemas, "CHANGELOG.md não existe"));
  });

  it("seção com data inventada, vazia, repetida ou fora de ordem reprova", () => {
    const base = (miolo) => `# Changelog\n\n${miolo}`;
    const secao = (linha, v, data, corpo = "Texto.") => `## ${linha} ${v} - ${data}\n\n${corpo}\n\n`;
    const cenarios = [
      [secao("plataforma", "0.1.0", "2026-13-40") + secao("campo", "0.1.0", "2026-10-24"), "data"],
      [secao("plataforma", "0.1.0", "2026-10-24", "") + secao("campo", "0.1.0", "2026-10-24"), "vazia"],
      [secao("plataforma", "0.1.0", "2026-10-24") + secao("plataforma", "0.1.0", "2026-10-24") + secao("campo", "0.1.0", "2026-10-24"), "duas vezes"],
      [secao("plataforma", "0.1.0", "2026-10-24") + secao("plataforma", "0.2.0", "2026-10-25") + secao("campo", "0.1.0", "2026-10-24"), "fora de ordem"],
      ["## plataforma 0.1.0\n\nSem data.\n\n" + secao("campo", "0.1.0", "2026-10-24"), "fora do formato"],
    ];
    for (const [texto, esperado] of cenarios) {
      const { problemas } = conferir(arvore({ changelog: base(texto) }));
      assert.ok(algum(problemas, esperado), `${esperado}: ${problemas.join(" | ")}`);
    }
  });

  it("major diferente de 0 nos arquivos reprova (1.0.0 antes da G28)", () => {
    const raiz = arvore({ versao: "1.0.0", changelog: CHANGELOG_PADRAO.replace("plataforma 0.1.0", "plataforma 1.0.0") });
    assert.ok(algum(conferir(raiz).problemas, "G28"));
  });

  it("subir recusa 1.0.0, versão que não cresce, linha desconhecida, e não grava nada", () => {
    const raiz = arvore();
    const antes = ler(raiz, "package.json");
    assert.throws(() => subir(raiz, "plataforma", "1.0.0"), /G28/);
    assert.throws(() => subir(raiz, "plataforma", "0.1.0"), /maior/);
    assert.throws(() => subir(raiz, "api", "z"), /linha desconhecida/);
    assert.equal(ler(raiz, "package.json"), antes);
  });

  it("subir recusa uma linha que já está dividida, em vez de espalhar o erro", () => {
    const raiz = arvore();
    writeFileSync(join(raiz, "apps/api/package.json"), json({ name: "@dc360/api", version: "0.1.5" }));
    assert.throws(() => subir(raiz, "plataforma", "z"), /já está inconsistente/);
    assert.equal(lerJ(raiz, "package.json").version, "0.1.0");
  });

  it("subir recusa reescrever JSON que não está no formato do npm, sem gravar nada pela metade", () => {
    const raiz = arvore();
    writeFileSync(join(raiz, "apps/api/package.json"), `{"name":"@dc360/api","version":"0.1.0"}`);
    assert.throws(() => subir(raiz, "plataforma", "z"), /formato/);
    assert.equal(lerJ(raiz, "package.json").version, "0.1.0");
    assert.equal(lerJ(raiz, "package-lock.json").version, "0.1.0");
  });
});

describe("nome de tag", () => {
  it("aceita vX.Y.Z e campo-vX.Y.Z que batem com os arquivos", () => {
    const raiz = arvore();
    assert.deepEqual(conferirTag(raiz, "v0.1.0").problemas, []);
    assert.deepEqual(conferirTag(raiz, "campo-v0.1.0").problemas, []);
    assert.equal(conferirTag(raiz, "campo-v0.1.0").linha, "campo");
  });

  it("tag v1 reprova, e também v1.0.0, v0.1, V0.1.0, sufixo, vazia e prefixo errado", () => {
    const raiz = arvore();
    for (const ruim of ["v1", "v1.0.0", "v0.1", "V0.1.0", "v0.1.0-rc1", "campo-v1", "campo-v1.0.0", "", "app-v1", "0.1.0", "campo-0.1.0"]) {
      assert.ok(conferirTag(raiz, ruim).problemas.length > 0, `"${ruim}" devia reprovar`);
    }
  });

  it("tag de versão que os arquivos não têm reprova (tag vai no commit que tem o número)", () => {
    const raiz = arvore();
    assert.ok(algum(conferirTag(raiz, "v0.2.0").problemas, "os arquivos da linha plataforma dizem 0.1.0"));
    assert.ok(algum(conferirTag(raiz, "campo-v0.3.0").problemas, "os arquivos da linha campo dizem 0.1.0"));
  });

  it("tag que já existe reprova: tag não se atualiza nem se move", () => {
    const raiz = arvore();
    assert.ok(algum(conferirTag(raiz, "v0.1.0", { existentes: ["v0.1.0"] }).problemas, "já existe"));
    assert.deepEqual(conferirTag(raiz, "v0.1.0", { existentes: ["campo-v0.1.0"] }).problemas, []);
  });

  it("tag de versão sem seção no CHANGELOG reprova", () => {
    const raiz = arvore({ changelog: "# Changelog\n" });
    assert.ok(algum(conferirTag(raiz, "v0.1.0").problemas, "CHANGELOG sem a seção"));
  });
});

describe("como comando e na árvore real", () => {
  const rodar = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

  it("conferir na árvore REAL passa: é isto que segura as versões iguais no CI", () => {
    const { problemas, versoes } = conferir(RAIZ_PADRAO);
    assert.deepEqual(problemas, []);
    assert.ok(versoes.plataforma && versoes.campo);
  });

  it("o repositório não ficou com versão que o ramo não pode ter: major 0 e a tag da versão atual é um nome válido", () => {
    const { versoes } = conferir(RAIZ_PADRAO);
    assert.deepEqual(conferirTag(RAIZ_PADRAO, nomeDaTag("plataforma", versoes.plataforma)).problemas, []);
    assert.deepEqual(conferirTag(RAIZ_PADRAO, nomeDaTag("campo", versoes.campo)).problemas, []);
  });

  it("sai 0 quando está certo, 1 quando um workspace destoa, 2 no uso errado", () => {
    const raiz = arvore();
    const bom = rodar("conferir", `--raiz=${raiz}`);
    assert.equal(bom.status, 0, bom.stderr);
    assert.match(bom.stdout, /plataforma 0\.1\.0, campo 0\.1\.0/);

    writeFileSync(join(raiz, "apps/api/package.json"), json({ name: "@dc360/api", version: "0.1.1" }));
    const ruim = rodar("conferir", `--raiz=${raiz}`);
    assert.equal(ruim.status, 1);
    assert.match(ruim.stderr, /apps\/api/);

    assert.equal(rodar("sem-comando").status, 2);
    assert.equal(rodar("subir", "plataforma", `--raiz=${raiz}`).status, 2);
  });

  it("conferir-tag v1 sai 1 pelo comando, e subir pelo comando escreve nos arquivos", () => {
    const raiz = arvore();
    assert.equal(rodar("conferir-tag", "v1", `--raiz=${raiz}`).status, 1);
    const subiu = rodar("subir", "campo", "y", `--raiz=${raiz}`);
    assert.equal(subiu.status, 0, subiu.stderr);
    assert.match(ler(raiz, "apps/campo/app.config.ts"), /const VERSAO = "0\.2\.0";/);
  });

  it("principal devolve o código sem encerrar o processo", () => {
    const saidas = [];
    const falso = { log: (t) => saidas.push(t), error: (t) => saidas.push(t) };
    assert.equal(principal(["conferir", `--raiz=${arvore()}`], falso), 0);
    assert.equal(principal(["conferir-tag", "v1", `--raiz=${arvore()}`], falso), 1);
    assert.ok(saidas.length >= 2);
  });

  it("o script não cria tag: não há chamada que escreva tag no código", () => {
    const fonte = readFileSync(SCRIPT, "utf8");
    const usosDeTag = fonte.match(/\[\s*"tag"[^\]]*\]/g) ?? [];
    assert.ok(usosDeTag.length > 0);
    for (const uso of usosDeTag) assert.match(uso, /^\[\s*"tag"\s*,\s*"--list"\s*\]$/, uso);
  });
});
