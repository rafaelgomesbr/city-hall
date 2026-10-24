/**
 * Testes do SBOM por release (V2-F01-E19): o conferidor de SBOM, o script que
 * anexa ao Release (com um `gh` de mentira) e as travas do `sbom.yml`.
 *
 * O que estes testes NÃO provam: que o GitHub aceita o workflow e que o Trivy
 * real gera os dois SBOM de imagem. Isso só o run de `workflow_dispatch` prova,
 * e está registrado como pendência da etapa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { problemasDoSbom } from "./conferir-sbom.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_DO_REPO = join(AQUI, "..", "..");
const CONFERIR = join(AQUI, "conferir-sbom.mjs");
const PUBLICAR = join(AQUI, "publicar-sbom.sh");
const WINDOWS = process.platform === "win32";

const workflow = readFileSync(join(RAIZ_DO_REPO, ".github", "workflows", "sbom.yml"), "utf8");
/** O workflow sem as linhas que são só comentário. */
const corpo = workflow
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

const sbom = (n, extra = {}) => ({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: Array.from({ length: n }, (_, i) => ({
    type: "library",
    name: `pacote-${i}`,
    version: "1.0.0",
  })),
  ...extra,
});

// ----- conferir-sbom.mjs -----

test("conferir-sbom: um CycloneDX com componentes passa; vazio, formato errado e componente sem nome reprovam", () => {
  assert.deepEqual(problemasDoSbom(sbom(3), 1), []);
  assert.ok(problemasDoSbom(sbom(0), 1).some((p) => /SBOM vazio não é prova/.test(p)));
  assert.ok(problemasDoSbom(sbom(5), 10).some((p) => /mínimo esperado é 10/.test(p)));
  assert.ok(problemasDoSbom(sbom(2, { bomFormat: "SPDX" }), 1).some((p) => /CycloneDX/.test(p)));
  assert.ok(
    problemasDoSbom(sbom(2, { specVersion: undefined }), 1).some((p) => /specVersion/.test(p)),
  );
  assert.ok(
    problemasDoSbom(sbom(1, { components: [{ type: "library" }] }), 1).some((p) =>
      /sem nome/.test(p),
    ),
  );
  assert.ok(problemasDoSbom(null).length > 0);
  assert.ok(problemasDoSbom([]).length > 0);
});

test("conferir-sbom: o código de saída que o CI lê (0 em ordem, 1 reprovado, 2 arquivo ilegível ou uso errado)", () => {
  const pasta = mkdtempSync(join(tmpdir(), "sbom-"));
  try {
    const bom = join(pasta, "bom.cdx.json");
    const vazio = join(pasta, "vazio.cdx.json");
    const lixo = join(pasta, "lixo.cdx.json");
    writeFileSync(bom, JSON.stringify(sbom(40)));
    writeFileSync(vazio, JSON.stringify(sbom(0)));
    writeFileSync(lixo, "{ não é json");
    const rodar = (...args) =>
      spawnSync(process.execPath, [CONFERIR, ...args], { encoding: "utf8" });

    const ok = rodar(bom, "--minimo=30");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /CycloneDX 1\.6, 40 componentes/);
    assert.equal(rodar(vazio).status, 1);
    assert.equal(rodar(bom, "--minimo=41").status, 1);
    assert.equal(rodar(lixo).status, 2);
    assert.equal(rodar(join(pasta, "nao-existe.json")).status, 2);
    assert.equal(rodar().status, 2);
    assert.equal(rodar(bom, "--minimo=abc").status, 2);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ----- publicar-sbom.sh, com um `gh` de mentira -----

const SUFIXOS = ["npm-plataforma", "npm-campo", "imagem-api", "imagem-console"];
const MINIMOS = { "npm-plataforma": 30, "npm-campo": 100, "imagem-api": 10, "imagem-console": 10 };

/** Pasta com os quatro SBOM (ou alguns) e um `gh` que registra as chamadas. */
function montar({ faltando = null, componentes = {} } = {}) {
  const base = mkdtempSync(join(tmpdir(), "publicar-sbom-"));
  const sboms = join(base, "sbom");
  const bin = join(base, "bin");
  mkdirSync(sboms);
  mkdirSync(bin);
  for (const s of SUFIXOS) {
    if (s === faltando) continue;
    writeFileSync(
      join(sboms, `sbom-v0.1.0-${s}.cdx.json`),
      JSON.stringify(sbom(componentes[s] ?? MINIMOS[s] + 5)),
    );
  }
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if [ "$1" = "release" ] && [ "$2" = "view" ]; then exit "\${STUB_VIEW_EXIT:-0}"; fi
exit 0
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  return { base, sboms, bin, log: join(base, "gh.log") };
}

function publicar(m, tag = "v0.1.0", env = {}) {
  const r = spawnSync("bash", [PUBLICAR, tag, m.sboms], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${m.bin}:${process.env.PATH}`, STUB_LOG: m.log, ...env },
  });
  const chamadas = existsSync(m.log) ? readFileSync(m.log, "utf8").trim().split("\n") : [];
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}`, chamadas };
}

test(
  "publicar-sbom.sh: com os quatro SBOM e sem Release, cria RASCUNHO e anexa os quatro mais o SHA256SUMS.txt com --clobber",
  { skip: WINDOWS && "script em bash" },
  () => {
    const m = montar();
    try {
      const r = publicar(m, "v0.1.0", { STUB_VIEW_EXIT: "1" });
      assert.equal(r.codigo, 0, r.saida);
      const criar = r.chamadas.find((c) => c.startsWith("release create"));
      assert.ok(criar, "criou o Release");
      assert.match(
        criar,
        /^release create v0\.1\.0 --draft --verify-tag /,
        "como rascunho: o repositório é público",
      );
      const subir = r.chamadas.find((c) => c.startsWith("release upload"));
      assert.match(subir, /^release upload v0\.1\.0 /);
      assert.match(subir, /--clobber$/);
      for (const s of SUFIXOS) assert.match(subir, new RegExp(`sbom-v0\\.1\\.0-${s}\\.cdx\\.json`));
      assert.match(subir, /SHA256SUMS\.txt/);

      // O SHA-256 gravado é o do arquivo, e o `--check` do manual funciona.
      const linhas = readFileSync(join(m.sboms, "SHA256SUMS.txt"), "utf8").trim().split("\n");
      assert.equal(linhas.length, 4);
      for (const linha of linhas) {
        const [hash, nome] = linha.split(/\s+\*?/);
        assert.equal(
          hash,
          createHash("sha256")
            .update(readFileSync(join(m.sboms, nome)))
            .digest("hex"),
          nome,
        );
      }
    } finally {
      rmSync(m.base, { recursive: true, force: true });
    }
  },
);

test(
  "publicar-sbom.sh: Release que já existe não é recriado, só recebe os arquivos",
  { skip: WINDOWS && "script em bash" },
  () => {
    const m = montar();
    try {
      const r = publicar(m, "campo-v0.2.1", { STUB_VIEW_EXIT: "0" });
      assert.equal(r.codigo, 0, r.saida);
      assert.equal(
        r.chamadas.some((c) => c.startsWith("release create")),
        false,
      );
      assert.ok(r.chamadas.some((c) => c.startsWith("release upload campo-v0.2.1 ")));
    } finally {
      rmSync(m.base, { recursive: true, force: true });
    }
  },
);

test(
  "publicar-sbom.sh: faltando um dos quatro, ou um deles vazio, não publica NADA (SBOM pela metade parece completo)",
  { skip: WINDOWS && "script em bash" },
  () => {
    for (const caso of [
      { faltando: "imagem-console" },
      { faltando: "npm-campo" },
      { componentes: { "npm-plataforma": 0 } },
      { componentes: { "imagem-api": 3 } },
    ]) {
      const m = montar(caso);
      try {
        const r = publicar(m);
        assert.equal(r.codigo, 1, `${JSON.stringify(caso)}: ${r.saida}`);
        assert.deepEqual(r.chamadas, [], `${JSON.stringify(caso)}: o gh não pode ter sido chamado`);
        assert.equal(
          existsSync(join(m.sboms, "SHA256SUMS.txt")),
          false,
          "sem soma de verificação de coisa incompleta",
        );
      } finally {
        rmSync(m.base, { recursive: true, force: true });
      }
    }
  },
);

test(
  "publicar-sbom.sh: tag fora do padrão e uso errado saem 2 sem chamar o gh",
  { skip: WINDOWS && "script em bash" },
  () => {
    const m = montar();
    try {
      for (const tag of ["v0.1", "v0.1.0; rm -rf /", "release-1", "../v0.1.0", "V0.1.0", ""]) {
        const r = publicar(m, tag);
        assert.equal(r.codigo, 2, `tag "${tag}": ${r.saida}`);
      }
      const semPasta = spawnSync("bash", [PUBLICAR, "v0.1.0", join(m.base, "nao-existe")], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${m.bin}:${process.env.PATH}`, STUB_LOG: m.log },
      });
      assert.equal(semPasta.status, 2);
      assert.deepEqual(
        readdirSync(m.base).filter((n) => n === "gh.log"),
        [],
        "o gh nunca foi chamado",
      );
    } finally {
      rmSync(m.base, { recursive: true, force: true });
    }
  },
);

// ----- sbom.yml -----

/** Texto do job `id` (as chaves de job têm 2 espaços; o job vai até o próximo). */
function job(id) {
  const m = new RegExp(`^ {2}${id}:\\n((?: {3,}.*\\n|\\n)+)`, "m").exec(`${corpo}\n`);
  assert.ok(m, `job ${id} não encontrado em sbom.yml`);
  return m[1];
}

test("sbom.yml: dispara em tag v* e campo-v* e em rodada manual, e nada mais", () => {
  assert.match(
    corpo,
    /^on:\n {2}push:\n {4}tags: \["v\*", "campo-v\*"\]\n {2}workflow_dispatch:\n/m,
  );
  assert.doesNotMatch(corpo, /pull_request|schedule:|branches:/);
});

test("sbom.yml: escrita só no job publicar, só contents, só em tag; o topo e os jobs que geram só leem", () => {
  assert.match(corpo, /^permissions:\n {2}contents: read\n/m, "topo com leitura");
  const escritas = [...corpo.matchAll(/^\s*([\w-]+):\s*write\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(escritas, ["contents"], "uma única linha de escrita, em contents");
  const publicar = job("publicar");
  assert.match(publicar, /^ {4}permissions:\n {6}contents: write\n/m);
  assert.match(publicar, /^ {4}if: \$\{\{ github\.ref_type == 'tag' \}\}$/m, "só roda em tag");
  assert.match(publicar, /needs: \[sbom-npm, sbom-imagem\]/);
  for (const gerador of ["sbom-npm", "sbom-imagem"]) {
    assert.doesNotMatch(job(gerador), /permissions:|write/, `${gerador} não pode ter escrita`);
  }
  assert.doesNotMatch(corpo, /secrets\./, "nenhum segredo: só o GITHUB_TOKEN do job de tag");
});

test("sbom.yml: os dois lockfiles e as duas imagens estão na matriz, o gerador npm tem versão exata e lê só o lockfile de produção", () => {
  const npm = job("sbom-npm");
  assert.match(npm, /pasta: dc360\n/);
  assert.match(npm, /pasta: dc360\/apps\/campo\n/);
  assert.match(corpo, /CYCLONEDX_NPM_VERSAO: "\d+\.\d+\.\d+"/, "versão exata, sem ^ nem latest");
  assert.match(npm, /--package-lock-only/);
  assert.match(npm, /--omit dev/);
  assert.match(npm, /--output-format JSON/);
  assert.match(npm, /--ignore-scripts/);

  const imagem = job("sbom-imagem");
  assert.match(imagem, /dockerfile: Dockerfile\n/);
  assert.match(imagem, /dockerfile: Dockerfile\.console\n/);
  assert.match(
    imagem,
    /varrer-imagem\.sh instalar/,
    "o mesmo Trivy fixo e com SHA-256 conferido da E20",
  );
  assert.match(imagem, /image --no-progress --format cyclonedx --output/);
  assert.match(imagem, /DC360_VERSAO/);
});

test("sbom.yml: nome de tag e de ramo entram nos comandos por variável de ambiente, nunca interpolados no script", () => {
  for (const linha of corpo.split("\n")) {
    if (!/github\.ref_name/.test(linha)) continue;
    assert.match(
      linha,
      /^\s+[A-Z_]+: \$\{\{ github\.ref_name \}\}$/,
      `interpolação direta no script: ${linha.trim()}`,
    );
  }
  assert.match(job("publicar"), /bash dc360\/scripts\/publicar-sbom\.sh "\$TAG"/);
});

test("sbom.yml: o job publicar não grava credencial no checkout e só traz dc360/scripts", () => {
  const publicar = job("publicar");
  assert.match(publicar, /persist-credentials: false/);
  assert.match(publicar, /sparse-checkout: dc360\/scripts/);
  assert.match(publicar, /actions\/download-artifact@[0-9a-f]{40} # v\d/);
});
