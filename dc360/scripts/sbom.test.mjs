/**
 * Testes do SBOM por release (V2-F01-E19): o conferidor de SBOM, o script que
 * anexa ao Release (com um `gh` de mentira) e as travas do `sbom.yml`, incluindo
 * (DV-27) o gerador de SBOM instalado por lockfile próprio, não por `npm exec`.
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
  assert.doesNotMatch(job("sbom-npm"), /permissions:|write/, "sbom-npm não pode ter escrita");
  // O job da imagem lê o GHCR (o selo e a imagem): `packages: read`, nunca escrita.
  const imagemJob = job("sbom-imagem");
  assert.doesNotMatch(imagemJob, /write/, "sbom-imagem não pode ter escrita");
  assert.match(
    imagemJob,
    /^ {4}permissions:\n {6}contents: read\n {6}packages: read\n/m,
    "sbom-imagem só lê o repositório e os pacotes",
  );
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
  assert.match(imagem, /- imagem: api\n/);
  assert.match(imagem, /- imagem: console\n/);
  assert.match(
    imagem,
    /varrer-imagem\.sh instalar/,
    "o mesmo Trivy fixo e com SHA-256 conferido da E20",
  );
  assert.match(imagem, /image --no-progress --image-src remote --format cyclonedx/);
});

// Correção 1 da F01 (E19): o SBOM da imagem descreve a imagem PUBLICADA e promovida,
// por digest, e nunca uma reconstrução (o Dockerfile instala o Debian corrente).
test("sbom.yml: o SBOM da imagem lê a imagem publicada por digest, do mesmo selo que a promoção, e não reconstrói", () => {
  const imagem = job("sbom-imagem");
  assert.doesNotMatch(
    imagem,
    /docker build(?!x)|docker buildx build|DC360_VERSAO|dc360-\$\{IMAGEM\}:sbom/,
  );
  // O mesmo lugar e as mesmas provas de promover-producao.yml.
  assert.match(
    imagem,
    /imagetools inspect "\$imagem:hml-ok-\$COMMIT" --format '\{\{\.Manifest\.Digest\}\}'/,
  );
  assert.match(imagem, /imagetools inspect "\$imagem:sha-\$COMMIT"/);
  assert.match(imagem, /\[ "\$digest" != "\$construido" \]/);
  assert.match(imagem, /gh attestation verify "oci:\/\/\$imagem@\$digest"/);
  assert.match(
    imagem,
    /--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/deploy-hml\.yml"/,
  );
  // Digest ausente falha com mensagem clara e sai com erro.
  assert.match(imagem, /::error::o commit \$COMMIT não tem a imagem \$IMAGEM aprovada em HML/);
  // O que o Trivy lê é a referência com o digest, do registro.
  assert.match(imagem, /REFERENCIA: \$\{\{ steps\.digest\.outputs\.referencia \}\}/);
  assert.match(imagem, /echo "referencia=\$imagem@\$digest"/);
  assert.match(imagem, /--output "\$arquivo" "\$REFERENCIA"/);
  // O SBOM tem de citar o digest.
  assert.match(imagem, /grep -q "\$\{DIGEST#sha256:\}" "\$arquivo"/);
});

test("sbom.yml: o SBOM da imagem usa as MESMAS provas de digest que a promoção para PROD", () => {
  const promocao = readFileSync(
    join(RAIZ_DO_REPO, ".github", "workflows", "promover-producao.yml"),
    "utf8",
  );
  for (const trecho of [
    `imagetools inspect "$imagem:hml-ok-$COMMIT" --format '{{.Manifest.Digest}}'`,
    `imagetools inspect "$imagem:sha-$COMMIT" --format '{{.Manifest.Digest}}'`,
    `--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/deploy-hml.yml"`,
    `base="ghcr.io/\${GITHUB_REPOSITORY,,}"`,
  ]) {
    assert.ok(promocao.includes(trecho), `promover-producao.yml mudou: ${trecho}`);
  }
  const imagem = job("sbom-imagem");
  for (const trecho of [
    `imagetools inspect "$imagem:hml-ok-$COMMIT" --format '{{.Manifest.Digest}}'`,
    `imagetools inspect "$imagem:sha-$COMMIT" --format '{{.Manifest.Digest}}'`,
    `--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/deploy-hml.yml"`,
    `ghcr.io/\${GITHUB_REPOSITORY,,}/dc360-`,
  ]) {
    assert.ok(imagem.includes(trecho), `sbom.yml diverge da promoção: ${trecho}`);
  }
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

// ----- DV-27: o gerador de SBOM e as dependências dele vêm de um lockfile -----

const PASTA_DO_GERADOR = join(AQUI, "sbom-gerador");

/**
 * Problemas na forma como o workflow obtém o gerador. Função pura sobre os três textos,
 * para os casos negativos estragarem um deles e provarem que a regra morde.
 */
export function problemasDoGeradorTravado({ corpoDoWorkflow, pacote, lock }) {
  const problemas = [];
  const versao = /CYCLONEDX_NPM_VERSAO: "(\d+\.\d+\.\d+)"/.exec(corpoDoWorkflow)?.[1];
  if (!versao) problemas.push("falta CYCLONEDX_NPM_VERSAO exata no workflow");
  if (/\bnpm exec\b|\bnpx\b/.test(corpoDoWorkflow)) {
    problemas.push(
      "o workflow usa npm exec/npx: as dependências transitivas do gerador seriam resolvidas na hora",
    );
  }
  if (
    !/npm ci [^\n]*--ignore-scripts[^\n]*--prefix dc360\/scripts\/sbom-gerador/.test(
      corpoDoWorkflow,
    )
  ) {
    problemas.push(
      "falta `npm ci --ignore-scripts ... --prefix dc360/scripts/sbom-gerador` (instalação pelo lockfile, sem script)",
    );
  }
  if (/npm install\b/.test(corpoDoWorkflow))
    problemas.push("`npm install` reescreve o lockfile: use `npm ci`");
  if (!/sbom-gerador\/node_modules\/\.bin\/cyclonedx-npm/.test(corpoDoWorkflow)) {
    problemas.push("o workflow não roda o gerador instalado a partir do lockfile");
  }
  const declarada = pacote?.dependencies?.["@cyclonedx/cyclonedx-npm"];
  if (declarada !== versao)
    problemas.push(
      `package.json do gerador declara "${declarada}" e o workflow ${versao} (versão exata nos dois)`,
    );
  const raiz = lock?.packages?.["node_modules/@cyclonedx/cyclonedx-npm"]?.version;
  if (raiz !== versao)
    problemas.push(`o lockfile resolve o gerador em ${raiz}, e o workflow fixa ${versao}`);
  if (lock?.lockfileVersion !== 3) problemas.push("lockfileVersion diferente de 3");
  const semIntegridade = Object.entries(lock?.packages ?? {}).filter(
    ([nome, p]) => nome !== "" && !p.link && !p.integrity,
  );
  if (semIntegridade.length > 0) {
    problemas.push(
      `pacote sem integrity no lockfile: ${semIntegridade
        .slice(0, 3)
        .map(([n]) => n)
        .join(", ")}`,
    );
  }
  const deOutroLugar = Object.entries(lock?.packages ?? {}).filter(
    ([nome, p]) =>
      nome !== "" && p.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(p.resolved),
  );
  if (deOutroLugar.length > 0)
    problemas.push(
      `pacote que não vem do registro do npm: ${deOutroLugar
        .slice(0, 3)
        .map(([n]) => n)
        .join(", ")}`,
    );
  if (Object.keys(lock?.packages ?? {}).length < 20)
    problemas.push("lockfile com poucos pacotes: as transitivas não estão travadas");
  return problemas;
}

const leJson = (caminho) => JSON.parse(readFileSync(caminho, "utf8"));

test("DV-27: o gerador de SBOM é instalado por `npm ci` a partir de um lockfile com integrity, e a versão bate nos três lugares", () => {
  const pacote = leJson(join(PASTA_DO_GERADOR, "package.json"));
  const lock = leJson(join(PASTA_DO_GERADOR, "package-lock.json"));
  assert.deepEqual(problemasDoGeradorTravado({ corpoDoWorkflow: corpo, pacote, lock }), []);
  assert.equal(pacote.private, true, "ferramenta de release, nunca publicada");
  assert.deepEqual(
    Object.keys(pacote.dependencies),
    ["@cyclonedx/cyclonedx-npm"],
    "uma dependência direta, a versão exata",
  );
});

test("DV-27: a regra do gerador travado morde (npm exec, sem lockfile, sem integrity, versão fora de sincronia)", () => {
  const pacote = leJson(join(PASTA_DO_GERADOR, "package.json"));
  const lock = leJson(join(PASTA_DO_GERADOR, "package-lock.json"));
  const casos = {
    "volta o npm exec": {
      corpoDoWorkflow: corpo.replace("npm ci --ignore-scripts", "npm exec --yes --ignore-scripts"),
      pacote,
      lock,
      esperado: /npm exec/,
    },
    "npm install no lugar do npm ci": {
      corpoDoWorkflow: corpo.replace("npm ci ", "npm install "),
      pacote,
      lock,
      esperado: /npm install|falta `npm ci/,
    },
    "instalação sem --ignore-scripts": {
      corpoDoWorkflow: corpo.replace(/npm ci --ignore-scripts/, "npm ci"),
      pacote,
      lock,
      esperado: /falta `npm ci/,
    },
    "lockfile sem as transitivas": {
      corpoDoWorkflow: corpo,
      pacote,
      lock: {
        ...lock,
        packages: {
          "": {},
          "node_modules/@cyclonedx/cyclonedx-npm":
            lock.packages["node_modules/@cyclonedx/cyclonedx-npm"],
        },
      },
      esperado: /poucos pacotes/,
    },
    "pacote sem integrity": {
      corpoDoWorkflow: corpo,
      pacote,
      lock: {
        ...lock,
        packages: {
          ...lock.packages,
          "node_modules/ms": {
            version: "2.1.3",
            resolved: "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
          },
        },
      },
      esperado: /sem integrity/,
    },
    "pacote de fora do registro": {
      corpoDoWorkflow: corpo,
      pacote,
      lock: {
        ...lock,
        packages: {
          ...lock.packages,
          "node_modules/ms": {
            version: "2.1.3",
            integrity: "sha512-x",
            resolved: "https://example.org/ms.tgz",
          },
        },
      },
      esperado: /não vem do registro/,
    },
    "package.json com outra versão": {
      corpoDoWorkflow: corpo,
      pacote: { dependencies: { "@cyclonedx/cyclonedx-npm": "^6.0.0" } },
      lock,
      esperado: /declara "\^6\.0\.0"/,
    },
    "workflow com outra versão": {
      corpoDoWorkflow: corpo.replace(
        /CYCLONEDX_NPM_VERSAO: "[\d.]+"/,
        'CYCLONEDX_NPM_VERSAO: "6.0.2"',
      ),
      pacote,
      lock,
      esperado: /declara "6\.0\.1" e o workflow 6\.0\.2/,
    },
  };
  for (const [nome, { esperado, ...entrada }] of Object.entries(casos)) {
    const problemas = problemasDoGeradorTravado(entrada).join(" | ");
    assert.match(problemas, esperado, `caso "${nome}" tinha de reprovar: ${problemas}`);
  }
});

test("DV-27: o que o gerador não cobre fica escrito: o SBOM exclui devOptional e a conferência de licença não", () => {
  assert.match(
    workflow,
    /Limite que sobra: o `--omit dev` do gerador usa `npm ls`, que\n#\s+exclui `devOptional`/,
  );
  assert.match(workflow, /667 componentes/);
  assert.match(workflow, /731/);
});
