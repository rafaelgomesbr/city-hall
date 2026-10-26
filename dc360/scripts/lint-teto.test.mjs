/**
 * O teto da baseline de lint (V2-F01-E17): a baseline só desce.
 *
 * O que este arquivo prende:
 *   - `lint-teto.json` é exatamente a soma das duas baselines do ESLint (com
 *     folga ou a menos, reprova);
 *   - contra o ramo-base, o total, a contagem de uma regra, uma regra nova e um
 *     arquivo novo na baseline de formatação reprovam; descer e ficar igual passam;
 *   - a leitura do ramo-base funciona num repositório de verdade (o "PR de prova
 *     que sobe o teto à mão" reprova);
 *   - o `package.json` e o workflow chamam o lint e a formatação onde a etapa pede.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARQUIVOS,
  calcularAtual,
  contarSupressoes,
  lerDoRef,
  montarTeto,
  problemasContraBase,
  problemasDeConsistencia,
  problemasPorArquivoERegra,
} from "./lint-teto.mjs";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lerJson = (rel) => JSON.parse(readFileSync(join(DC360, rel), "utf8"));

const mono = {
  "a.ts": { "no-eval": { count: 1 }, "@typescript-eslint/no-explicit-any": { count: 2 } },
  "b.ts": { "no-eval": { count: 3 } },
};
const campo = { "c.tsx": { "@typescript-eslint/no-floating-promises": { count: 4 } } };

describe("a soma das baselines", () => {
  it("soma por regra e por projeto", () => {
    const t = montarTeto(mono, campo);
    assert.equal(t.total, 10);
    assert.deepEqual(t.porProjeto, { monorepo: 6, campo: 4 });
    assert.equal(t.porRegra["no-eval"], 4);
    assert.equal(t.porRegra["@typescript-eslint/no-floating-promises"], 4);
  });

  it("baseline vazia soma zero", () => {
    assert.equal(contarSupressoes({}).total, 0);
    assert.equal(contarSupressoes(undefined).total, 0);
  });
});

describe("lint-teto.json contra as baselines", () => {
  it("o do repositório confere exatamente com as duas baselines reais", () => {
    const problemas = problemasDeConsistencia(lerJson(ARQUIVOS.teto), calcularAtual());
    assert.deepEqual(problemas, []);
  });

  it("teto igual à soma passa", () => {
    assert.deepEqual(problemasDeConsistencia(montarTeto(mono, campo), montarTeto(mono, campo)), []);
  });

  it("teto com folga reprova (folga é lugar para o achado novo se esconder)", () => {
    const calculado = montarTeto(mono, campo);
    const folgado = { ...calculado, total: calculado.total + 5 };
    const p = problemasDeConsistencia(folgado, calculado);
    assert.equal(p.length, 1);
    assert.match(p[0], /com folga/);
  });

  it("teto menor que a soma reprova", () => {
    const calculado = montarTeto(mono, campo);
    const p = problemasDeConsistencia({ ...calculado, total: calculado.total - 1 }, calculado);
    assert.match(p.join("\n"), /menor que a soma/);
  });

  it("contagem de uma regra diferente da soma reprova mesmo com o total igual", () => {
    const calculado = montarTeto(mono, campo);
    const trocado = {
      ...calculado,
      porRegra: { ...calculado.porRegra, "no-eval": 3, "@typescript-eslint/no-explicit-any": 3 },
    };
    const p = problemasDeConsistencia(trocado, calculado);
    assert.equal(p.length, 2);
  });

  it("arquivo ausente reprova", () => {
    assert.match(problemasDeConsistencia(null, montarTeto(mono, campo))[0], /ausente/);
  });
});

describe("contra o ramo-base: a baseline só desce", () => {
  const base = montarTeto(mono, campo);

  it("igual passa", () => {
    assert.deepEqual(problemasContraBase({ tetoAtual: base, tetoBase: base }), []);
  });

  it("descer passa", () => {
    const menor = montarTeto({ "a.ts": { "no-eval": { count: 1 } } }, campo);
    assert.deepEqual(problemasContraBase({ tetoAtual: menor, tetoBase: base }), []);
  });

  it("subir o total à mão reprova", () => {
    const p = problemasContraBase({
      tetoAtual: { ...base, total: base.total + 1 },
      tetoBase: base,
    });
    assert.match(p[0], /o teto de lint subiu: 10 na base, 11 aqui/);
  });

  it("regenerar a baseline com um defeito novo (total e regra sobem juntos) reprova", () => {
    const maisUm = montarTeto({ ...mono, "d.ts": { "no-eval": { count: 1 } } }, campo);
    const p = problemasContraBase({ tetoAtual: maisUm, tetoBase: base });
    assert.match(p.join("\n"), /o teto de lint subiu/);
    assert.match(p.join("\n"), /regra no-eval subiu: 4 na base, 5 aqui/);
  });

  it("trocar um achado por outro (total igual, regra nova) reprova", () => {
    const trocado = montarTeto(
      {
        "a.ts": { "no-eval": { count: 1 }, "no-new-func": { count: 2 } },
        "b.ts": { "no-eval": { count: 3 } },
      },
      campo,
    );
    const p = problemasContraBase({ tetoAtual: trocado, tetoBase: base });
    assert.match(
      p.join("\n"),
      /regra no-new-func subiu: 0 na base, 2 aqui \(regra nova na baseline\)/,
    );
  });

  it("sem teto na base (introdução do mecanismo) não há contra o quê comparar", () => {
    assert.deepEqual(problemasContraBase({ tetoAtual: base, tetoBase: null }), []);
  });

  it("arquivo novo na baseline de formatação reprova; sair da lista passa", () => {
    const antes = { arquivos: ["a.ts", "b.ts"] };
    assert.match(
      problemasContraBase({
        formatoAtual: { arquivos: ["a.ts", "b.ts", "c.ts"] },
        formatoBase: antes,
      })[0],
      /arquivo novo na baseline de formatação: c\.ts/,
    );
    assert.deepEqual(
      problemasContraBase({ formatoAtual: { arquivos: ["a.ts"] }, formatoBase: antes }),
      [],
    );
  });
});

describe("contra o ramo-base: o teto vale por arquivo e regra, não só no total", () => {
  const baseMono = {
    "a.ts": { "no-eval": { count: 1 } },
    "b.ts": { "no-eval": { count: 2 } },
  };
  const base = { monorepo: baseMono, campo };

  it("corrigir uma supressão num arquivo e abrir outra do mesmo tipo noutro reprova, com o total igual", () => {
    // a.ts perdeu a sua; um arquivo novo da API ganhou uma. Total 3 e 3.
    const atualMono = {
      "b.ts": { "no-eval": { count: 2 } },
      "api.ts": { "no-eval": { count: 1 } },
    };
    const tetoBase = montarTeto(baseMono, campo);
    const tetoAtual = montarTeto(atualMono, campo);
    assert.equal(tetoAtual.total, tetoBase.total);
    assert.deepEqual(tetoAtual.porRegra, tetoBase.porRegra);
    // Só por total e por regra não se vê nada (o buraco achado na revisão):
    assert.deepEqual(problemasContraBase({ tetoAtual, tetoBase }), []);
    // Com as baselines por arquivo, reprova.
    const p = problemasContraBase({
      tetoAtual,
      tetoBase,
      supressoesAtual: { monorepo: atualMono, campo },
      supressoesBase: base,
    });
    assert.equal(p.length, 1);
    assert.match(
      p[0],
      /monorepo: api\.ts regra no-eval subiu: 0 na base, 1 aqui \(par arquivo\+regra novo/,
    );
  });

  it("subir a contagem de um par que já existia reprova", () => {
    const p = problemasPorArquivoERegra(
      { monorepo: { ...baseMono, "b.ts": { "no-eval": { count: 3 } } }, campo },
      base,
    );
    assert.match(p.join("\n"), /b\.ts regra no-eval subiu: 2 na base, 3 aqui\./);
  });

  it("o mesmo vale para o aplicativo de campo", () => {
    const p = problemasPorArquivoERegra(
      { monorepo: baseMono, campo: { "c.tsx": { "no-eval": { count: 1 } } } },
      base,
    );
    assert.match(p.join("\n"), /campo: c\.tsx regra no-eval subiu: 0 na base/);
  });

  it("igual e descer passam; arquivo corrigido some sem problema", () => {
    assert.deepEqual(problemasPorArquivoERegra(base, base), []);
    assert.deepEqual(
      problemasPorArquivoERegra(
        { monorepo: { "b.ts": { "no-eval": { count: 1 } } }, campo: {} },
        base,
      ),
      [],
    );
  });

  it("sem baseline na base (introdução do mecanismo) não há contra o quê comparar", () => {
    assert.deepEqual(problemasPorArquivoERegra(base, null), []);
    assert.deepEqual(problemasPorArquivoERegra(base, { monorepo: null, campo: null }), []);
  });

  it("num repositório de verdade: baselines do ramo-base lidas por git, o par novo reprova", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-teto-par-"));
    const git = (...args) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    try {
      git("init", "-q", "-b", "master");
      mkdirSync(join(dir, "dc360", "apps", "campo"), { recursive: true });
      const raiz = join(dir, "dc360");
      writeFileSync(join(raiz, ARQUIVOS.monorepo), JSON.stringify(baseMono));
      writeFileSync(join(raiz, ARQUIVOS.campo), JSON.stringify(campo));
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      const lido = {
        monorepo: lerDoRef("master", ARQUIVOS.monorepo, raiz),
        campo: lerDoRef("master", ARQUIVOS.campo, raiz),
      };
      assert.deepEqual(lido.monorepo, baseMono);
      const atual = {
        monorepo: { "b.ts": { "no-eval": { count: 2 } }, "api.ts": { "no-eval": { count: 1 } } },
        campo,
      };
      assert.equal(problemasPorArquivoERegra(atual, lido).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a leitura do ramo-base num repositório de verdade (o PR de prova)", () => {
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "lint-teto-"));
    const git = (...args) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    git("init", "-q", "-b", "master");
    mkdirSync(join(dir, "dc360"));
    return { dir: join(dir, "dc360"), raiz: dir, git };
  }

  it("lê o teto de master, e o PR que sobe o teto à mão reprova", () => {
    const { dir, raiz, git } = repo();
    try {
      const base = montarTeto(mono, campo);
      writeFileSync(join(dir, ARQUIVOS.teto), JSON.stringify(base));
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      git("checkout", "-q", "-b", "pr");
      writeFileSync(join(dir, ARQUIVOS.teto), JSON.stringify({ ...base, total: base.total + 1 }));
      git("commit", "-q", "-am", "sobe o teto");

      const lido = lerDoRef("master", ARQUIVOS.teto, dir);
      assert.equal(lido.total, 10);
      const atual = JSON.parse(readFileSync(join(dir, ARQUIVOS.teto), "utf8"));
      const p = problemasContraBase({ tetoAtual: atual, tetoBase: lido });
      assert.match(p[0], /subiu/);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("arquivo que não existia no ramo-base lê como null; ref inexistente é erro, não silêncio", () => {
    const { dir, raiz, git } = repo();
    try {
      writeFileSync(join(dir, "outro.json"), "{}");
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      assert.equal(lerDoRef("master", ARQUIVOS.teto, dir), null);
      assert.throws(() => lerDoRef("ramo-que-nao-existe", ARQUIVOS.teto, dir), /não consegui ler/);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("onde o lint e a formatação são chamados", () => {
  const pkg = lerJson("package.json");
  const workflow = readFileSync(join(DC360, "..", ".github", "workflows", "verificar.yml"), "utf8");

  function job(nome) {
    const inicio = workflow.indexOf(`\n  ${nome}:\n`);
    assert.ok(inicio >= 0, `job ${nome} não encontrado`);
    const resto = workflow.slice(inicio + 1);
    const fim = resto.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
    return fim < 0 ? resto : resto.slice(0, fim + 1);
  }

  it("package.json tem os scripts e o `verificar` os chama", () => {
    for (const s of ["lint", "lint:campo", "lint:podar", "lint:teto", "formato:conferir"]) {
      assert.ok(pkg.scripts[s], `falta o script ${s}`);
    }
    for (const s of ["lint", "lint:teto", "formato:conferir"]) {
      assert.ok(pkg.scripts.verificar.includes(`npm run ${s}`), `verificar não chama ${s}`);
    }
  });

  it("o job `produto` roda lint, teto e formatação, e o `aplicativo` roda o lint do aplicativo", () => {
    const produto = job("produto");
    assert.match(produto, /run: npm run lint 2>&1/);
    assert.match(produto, /npm run lint:teto/);
    assert.match(produto, /npm run formato:conferir/);
    assert.match(job("aplicativo"), /npm run lint:campo/);
  });

  it("as devDependencies do lint estão na raiz, e o aplicativo não ganhou nenhuma", () => {
    for (const d of [
      "eslint",
      "@eslint/js",
      "typescript-eslint",
      "eslint-plugin-react-hooks",
      "prettier",
    ]) {
      assert.ok(pkg.devDependencies?.[d], `falta ${d} em devDependencies`);
    }
    const campoPkg = JSON.parse(readFileSync(join(DC360, "apps", "campo", "package.json"), "utf8"));
    for (const d of ["eslint", "prettier", "typescript-eslint"]) {
      assert.equal(
        campoPkg.devDependencies?.[d],
        undefined,
        `${d} não deve entrar no lockfile do Expo`,
      );
    }
  });
});
