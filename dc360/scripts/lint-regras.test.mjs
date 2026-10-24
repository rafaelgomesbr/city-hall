/**
 * As regras de lint MORDEM (V2-F01-E17): código ruim sintético, no lugar onde a
 * etapa manda, reprova com a regra certa; código bom não é acusado.
 *
 * Usa a API do ESLint com a configuração real do repositório. O texto é
 * analisado no caminho de um arquivo que existe (o parser tipado precisa de um
 * arquivo conhecido pelo tsconfig), mas o conteúdo é o sintético.
 *
 * As supressões da baseline NÃO se aplicam à API (só ao `eslint` da linha de
 * comando), então aqui toda regra aparece, e o que a baseline faz fica por
 * conta da evidência do "PR de prova" (o `eslint` de verdade reprovando).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMPO = join(DC360, "apps", "campo");

const API = join(DC360, "apps", "api", "src", "config.ts");
const WEB = join(DC360, "apps", "web", "src", "componentes", "Estrutura.tsx");
const SCRIPT = join(DC360, "scripts", "lint.mjs");
// O nome tem de bater letra por letra com o do disco: o macOS e o Windows não
// distinguem maiúscula, o Linux do CI distingue ("was not found by the project service").
const TELA_DO_CAMPO = join(CAMPO, "src", "ui", "Avatar.tsx");

// Com `CI=true` o typescript-estree entra em "execução única" e, nos arquivos
// tipados por `project` (os scripts .mjs), lê o texto DO DISCO em vez do texto
// que o teste entrega ao `lintText`. O resultado era "nenhum achado" só no CI,
// com o código sintético ignorado. Desligar a inferência faz o teste medir o
// texto sintético em qualquer ambiente. Só o teste muda: o `eslint` de verdade
// lê do disco e não é afetado.
process.env.TSESTREE_SINGLE_RUN = "false";

async function regras(cwd, texto, filePath) {
  const eslint = new ESLint({ cwd });
  const [r] = await eslint.lintText(texto, { filePath });
  return r.messages.map((m) => m.ruleId ?? `ERRO-FATAL: ${m.message}`);
}

describe("as regras de segurança e de promessa mordem no monorepo", { timeout: 300_000 }, () => {
  it("chamada assíncrona sem await em apps/api/src reprova", async () => {
    const texto =
      "async function grava(): Promise<void> {}\nexport function f(): void {\n  grava();\n}\n";
    assert.deepEqual(await regras(DC360, texto, API), ["@typescript-eslint/no-floating-promises"]);
  });

  it("com await (ou com void explícito) passa", async () => {
    const com =
      "async function grava(): Promise<void> {}\nexport async function f(): Promise<void> {\n  await grava();\n  void grava();\n}\n";
    assert.deepEqual(await regras(DC360, com, API), []);
  });

  it("async passado onde se espera função sem retorno reprova (no-misused-promises)", async () => {
    const texto =
      "export function f(xs: number[]): void {\n  xs.forEach(async (x) => { await Promise.resolve(x); });\n}\n";
    assert.deepEqual(await regras(DC360, texto, API), ["@typescript-eslint/no-misused-promises"]);
  });

  it("hook com dependência faltando em apps/web/src reprova", async () => {
    const texto = [
      'import { useEffect, useState } from "react";',
      "export function C({ id }: { id: string }) {",
      '  const [a, setA] = useState("");',
      "  useEffect(() => { setA(id); }, []);",
      "  return <p>{a}</p>;",
      "}",
      "",
    ].join("\n");
    assert.deepEqual(await regras(DC360, texto, WEB), ["react-hooks/exhaustive-deps"]);
  });

  it("hook com as dependências certas passa", async () => {
    const texto = [
      'import { useEffect, useState } from "react";',
      "export function C({ id }: { id: string }) {",
      '  const [a, setA] = useState("");',
      "  useEffect(() => { setA(id); }, [id]);",
      "  return <p>{a}</p>;",
      "}",
      "",
    ].join("\n");
    assert.deepEqual(await regras(DC360, texto, WEB), []);
  });

  it("eval, Function e any explícito reprovam", async () => {
    assert.deepEqual(await regras(DC360, 'export const r = eval("1");\n', API), ["no-eval"]);
    // `new Function(texto)` é acusado pelas duas regras (a do núcleo e a tipada).
    assert.deepEqual(
      (await regras(DC360, 'export const f = new Function("return 1");\n', API)).sort(),
      ["@typescript-eslint/no-implied-eval", "no-new-func"],
    );
    assert.deepEqual(await regras(DC360, "export const x: any = 1;\n", API), [
      "@typescript-eslint/no-explicit-any",
    ]);
  });

  it("setTimeout com texto reprova (execução implícita)", async () => {
    const texto = 'export function f(): void {\n  setTimeout("alert(1)", 10);\n}\n';
    assert.deepEqual(await regras(DC360, texto, API), ["@typescript-eslint/no-implied-eval"]);
  });

  it("promessa solta num script .mjs reprova, mas os casos do node:test não", async () => {
    const solta = "async function f() {}\nf();\n";
    assert.deepEqual(await regras(DC360, solta, SCRIPT), [
      "@typescript-eslint/no-floating-promises",
    ]);
    const caso = 'import { test } from "node:test";\ntest("a", () => {});\n';
    assert.deepEqual(await regras(DC360, caso, SCRIPT), []);
  });

  it("eslint-disable que não suprime nada reprova", async () => {
    const texto = "// eslint-disable-next-line no-eval\nexport const a = 1;\n";
    const r = await regras(DC360, texto, API);
    assert.equal(r.length, 1);
  });
});

describe("as regras mordem no aplicativo de campo", { timeout: 300_000 }, () => {
  before(() => {
    // Sem o `node_modules` do aplicativo o lint com tipos não mede nada. Falta
    // de dependência reprova aqui, não pula (mesma regra do `test:campo`).
    assert.ok(
      existsSync(join(CAMPO, "node_modules")),
      "apps/campo/node_modules não existe: rode `npm ci` em dc360/apps/campo",
    );
  });

  it("promessa solta e hook com dependência faltando reprovam", async () => {
    const texto = [
      'import { useEffect, useState } from "react";',
      "async function grava(): Promise<void> {}",
      "export function Tela({ id }: { id: string }) {",
      '  const [a, setA] = useState("");',
      "  useEffect(() => { setA(id); }, []);",
      "  grava();",
      "  return a;",
      "}",
      "",
    ].join("\n");
    const r = (await regras(CAMPO, texto, TELA_DO_CAMPO)).sort();
    assert.deepEqual(r, ["@typescript-eslint/no-floating-promises", "react-hooks/exhaustive-deps"]);
  });
});
