import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as Compartilhado from "../src/index.js";
import { pessoasAtingidasSchema, vistoriaSchema } from "../src/index.js";

/**
 * O QUE O ZOD 4 FAZ DE DIFERENTE DO 3, e que nenhum esquema do produto pode
 * usar sem querer (V2-F02-E03: DV-20 e DV-37).
 *
 * São três armadilhas, todas LATENTES (nenhum esquema do repositório cai nelas
 * hoje) e todas silenciosas:
 *
 * 1. `.default(x).optional()`: no Zod 3 o campo ausente continuava ausente; no
 *    Zod 4 o padrão é aplicado. Quem escreveu "opcional, sem valor" passa a
 *    gravar o padrão. A ordem inversa (`.optional().default(x)`) sempre
 *    aplicou o padrão e é o jeito honesto de escrever isto.
 * 2. `z.record(z.enum([...]), v)`: no Zod 4 EXIGE todas as chaves do enum. Quem
 *    quer "algumas das chaves" escreve `z.partialRecord`.
 * 3. Objeto `Date` onde se espera objeto, em esquema com TODOS os campos
 *    opcionais: passa e sai `{}`. Só um chamador em processo o produz (JSON e
 *    query string não têm `Date`), mas a recusa é do esquema.
 *
 * Cada armadilha tem DOIS portões: um caso que prende o comportamento do Zod
 * (se uma atualização do Zod mudar o que sabemos, este arquivo reprova e a
 * leitura das armadilhas recomeça) e uma varredura que reprova o esquema que
 * cair nela. A varredura anda por TODOS os esquemas exportados pelo pacote
 * compartilhado, em profundidade, e depois lê o texto de `packages/*` e
 * `apps/*` para as duas formas que o texto denuncia.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PRODUTO = join(AQUI, "..", "..", "..");

/* ---------- O comportamento do Zod 4, preso ---------- */

describe("DV-20: o que o Zod 4 faz com .default() dentro de .optional()", () => {
  it(".default(5).optional() APLICA o padrão com o campo ausente e com undefined", () => {
    const dentro = z.object({ x: z.number().default(5).optional() });
    expect(dentro.parse({})).toEqual({ x: 5 });
    expect(dentro.parse({ x: undefined })).toEqual({ x: 5 });
    expect(dentro.parse({ x: 7 })).toEqual({ x: 7 });
  });

  it(".optional().default(5) faz o mesmo: a ordem não protege, só o ESQUEMA SEM padrão deixa o campo ausente", () => {
    const fora = z.object({ x: z.number().optional().default(5) });
    expect(fora.parse({})).toEqual({ x: 5 });
    const semPadrao = z.object({ x: z.number().optional() });
    expect(semPadrao.parse({})).toEqual({});
  });
});

describe("DV-20: o que o Zod 4 faz com z.record(z.enum(...))", () => {
  const chaves = z.enum(["a", "b"]);

  it("z.record com chaves de enum EXIGE todas as chaves", () => {
    const todas = z.record(chaves, z.number());
    const r = todas.safeParse({ a: 1 });
    expect(r.success).toBe(false);
    expect(todas.safeParse({ a: 1, b: 2 }).success).toBe(true);
  });

  it("recusa chave fora do enum (não é um mapa livre)", () => {
    expect(z.record(chaves, z.number()).safeParse({ a: 1, b: 2, c: 3 }).success).toBe(false);
  });

  it("z.partialRecord é o jeito de dizer 'algumas das chaves'", () => {
    const algumas = z.partialRecord(chaves, z.number());
    expect(algumas.safeParse({ a: 1 }).success).toBe(true);
    expect(algumas.safeParse({}).success).toBe(true);
    expect(algumas.safeParse({ c: 1 }).success).toBe(false);
  });
});

describe("DV-37: Date onde se espera objeto", () => {
  it("o Zod 4 deixa um Date passar por z.object com todos os campos opcionais (e sai {})", () => {
    const soOpcionais = z.object({ y: z.string().optional() });
    const r = soOpcionais.safeParse(new Date());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({});
  });

  it("com um campo obrigatório o Date já reprova (falta o campo)", () => {
    expect(z.object({ y: z.string() }).safeParse(new Date()).success).toBe(false);
  });

  it("a contagem de pessoas atingidas, que só tem campos opcionais, recusa Date e diz por quê", () => {
    const r = pessoasAtingidasSchema.safeParse(new Date());
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.map((i) => i.message)).toEqual([
        "Era esperado um objeto, veio uma data",
      ]);
  });

  it("e continua aceitando o que aceitava: objeto vazio, contagens, e recusando o que recusava", () => {
    expect(pessoasAtingidasSchema.parse({})).toEqual({});
    expect(pessoasAtingidasSchema.parse({ desabrigados: 3, feridos: 0 })).toEqual({
      desabrigados: 3,
      feridos: 0,
    });
    expect(pessoasAtingidasSchema.safeParse({ desabrigados: -1 }).success).toBe(false);
    expect(pessoasAtingidasSchema.safeParse(null).success).toBe(false);
    expect(pessoasAtingidasSchema.safeParse([]).success).toBe(false);
    expect(pessoasAtingidasSchema.safeParse("x").success).toBe(false);
  });

  it("a vistoria continua com as cinco contagens achatadas no mesmo nível (a .shape não se perdeu)", () => {
    for (const campo of ["desalojados", "desabrigados", "feridos", "desaparecidos", "obitos"]) {
      expect(Object.keys(vistoriaSchema.shape), campo).toContain(campo);
    }
  });
});

/* ---------- A varredura dos esquemas exportados ---------- */

type Definicao = Record<string, unknown> & { type?: string };

function definicaoDe(esquema: unknown): Definicao | null {
  const interno = (esquema as { _zod?: { def?: Definicao } } | null)?._zod;
  return interno?.def ?? null;
}

/** Todos os nós de esquema alcançáveis dos exportados, com o caminho até cada um. */
function percorrer(): Array<{ caminho: string; esquema: z.ZodType; def: Definicao }> {
  const vistos = new Set<unknown>();
  const nos: Array<{ caminho: string; esquema: z.ZodType; def: Definicao }> = [];

  const visitar = (esquema: unknown, caminho: string): void => {
    const def = definicaoDe(esquema);
    if (!def || vistos.has(esquema)) return;
    vistos.add(esquema);
    nos.push({ caminho, esquema: esquema as z.ZodType, def });

    const forma = def["shape"];
    if (forma && typeof forma === "object") {
      for (const [chave, filho] of Object.entries(forma)) visitar(filho, `${caminho}.${chave}`);
    }
    for (const chave of [
      "innerType",
      "element",
      "in",
      "out",
      "keyType",
      "valueType",
      "left",
      "right",
      "rest",
    ]) {
      visitar(def[chave], `${caminho}<${chave}>`);
    }
    for (const chave of ["options", "items"]) {
      const lista = def[chave];
      if (Array.isArray(lista))
        lista.forEach((filho, i) => visitar(filho, `${caminho}<${chave}${i}>`));
    }
  };

  for (const [nome, valor] of Object.entries(Compartilhado)) visitar(valor, nome);
  return nos;
}

describe("a varredura anda por todos os esquemas exportados", () => {
  const nos = percorrer();

  it("achou esquemas de verdade (a leitura não ficou cega)", () => {
    expect(nos.length).toBeGreaterThan(100);
    expect(nos.some((n) => n.caminho.startsWith("vistoriaSchema"))).toBe(true);
    expect(nos.some((n) => n.def.type === "object")).toBe(true);
  });

  it("DV-20: nenhum .optional() envolve um .default()", () => {
    const achados = nos
      .filter(
        (n) => n.def.type === "optional" && definicaoDe(n.def["innerType"])?.type === "default",
      )
      .map((n) => n.caminho);
    expect(achados).toEqual([]);
  });

  it("DV-20: nenhum z.record tem chaves de enum ou de literal (use z.partialRecord)", () => {
    const achados = nos
      .filter((n) => {
        if (n.def.type !== "record") return false;
        const tipo = definicaoDe(n.def["keyType"])?.type;
        return tipo === "enum" || tipo === "literal";
      })
      .map((n) => n.caminho);
    expect(achados).toEqual([]);
  });

  it("DV-37: todo esquema de objeto exportado recusa um Date (hoje só o de pessoas era furado)", () => {
    const furados = nos
      .filter((n) => n.def.type === "object")
      .filter((n) => n.esquema.safeParse(new Date()).success)
      /* O objeto de dentro de um pipe cuja guarda já recusa Date: o
         `pessoasAtingidasObjeto` não é exportado, mas o nó `out` do pipe é
         alcançável. Ele só é alcançável POR um pipe que recusa o Date antes. */
      .filter((n) => {
        const pai = nos.find((p) => p.def.type === "pipe" && p.def["out"] === n.esquema);
        return !(pai && !pai.esquema.safeParse(new Date()).success);
      })
      .map((n) => n.caminho);
    expect(furados).toEqual([]);
  });

  it("a prova de que a varredura enxerga o defeito: um esquema só de opcionais sem guarda é apontado", () => {
    const sem = z.object({ y: z.string().optional() });
    const comGuarda = z.custom<unknown>((v) => !(v instanceof Date)).pipe(sem);
    expect(sem.safeParse(new Date()).success).toBe(true);
    expect(comGuarda.safeParse(new Date()).success).toBe(false);
  });
});

/* ---------- A leitura de texto das duas formas que o texto denuncia ---------- */

function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome === "test") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...fontes(caminho));
    else if (
      /\.(ts|tsx)$/.test(nome) &&
      !/\.(test|spec)\.tsx?$/.test(nome) &&
      !nome.endsWith(".d.ts")
    ) {
      achados.push(caminho);
    }
  }
  return achados;
}

function origens(): string[] {
  const dirs: string[] = [];
  for (const grupo of ["packages", "apps"]) {
    const base = join(RAIZ_PRODUTO, grupo);
    for (const nome of readdirSync(base)) {
      const src = join(base, nome, "src");
      try {
        if (statSync(src).isDirectory()) dirs.push(src);
      } catch {
        /* pacote sem src */
      }
    }
  }
  return dirs.flatMap(fontes);
}

describe("o texto do código não usa as duas formas armadilhadas", () => {
  const arquivos = origens();

  it("a leitura achou o código do produto", () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it("DV-20: não há '.default(...).optional()' nem 'z.record(z.enum(' em código de produto", () => {
    const achados: string[] = [];
    for (const arquivo of arquivos) {
      const texto = readFileSync(arquivo, "utf8");
      if (/\.default\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\.optional\(\)/.test(texto))
        achados.push(`${arquivo}: default().optional()`);
      if (/z\.record\(\s*z\.(?:enum|literal)\(/.test(texto))
        achados.push(`${arquivo}: z.record(z.enum(`);
    }
    expect(achados).toEqual([]);
  });
});
