// Testes do conferidor do `expo export` do aplicativo de campo (DV-39).
// O que importa aqui é o lado que reprova: um empacotamento que "saiu com 0" mas
// sem o zod 4 ou sem o código do shared não pode passar.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MARCAS,
  TAMANHO_MINIMO,
  conferirEmpacotamento,
} from "./conferir-empacotamento-do-campo.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "conferir-empacotamento-do-campo.mjs");

const pacoteBom = () =>
  Buffer.from(`${"x".repeat(TAMANHO_MINIMO)} ${MARCAS.map((m) => m.texto).join(" ")}`);
const metadata = (plataformas) => ({
  fileMetadata: Object.fromEntries(
    plataformas.map((p) => [p, { bundle: `_expo/static/js/${p}/entry.js` }]),
  ),
});

test("um pacote com o zod 4 e o código do shared passa, e a linha traz o SHA-256", () => {
  const { linhas, problemas } = conferirEmpacotamento(
    metadata(["android"]),
    ["android"],
    pacoteBom,
  );
  assert.deepEqual(problemas, []);
  assert.match(
    linhas[0],
    /^android: _expo\/static\/js\/android\/entry\.js \d+ bytes sha256=[0-9a-f]{64}$/,
  );
});

test("sem o zod 4, sem o shared, pequeno demais ou ausente: cada um reprova por si", () => {
  const sem = (texto) => () => Buffer.from(`${"x".repeat(TAMANHO_MINIMO)} ${texto}`);
  const roda = (lerPacote, plataformas = ["android"], meta = metadata(plataformas)) =>
    conferirEmpacotamento(meta, plataformas, lerPacote).problemas;
  assert.match(roda(sem("gpsPrecisaoMetros")).join(), /zod 4/);
  assert.match(roda(sem("_zod")).join(), /@dc360\/shared/);
  assert.match(roda(() => Buffer.from("_zod gpsPrecisaoMetros")).join(), /abaixo de/);
  assert.match(
    roda(() => {
      throw new Error("ENOENT");
    }).join(),
    /não existe no disco/,
  );
  assert.match(
    roda(pacoteBom, ["ios"], metadata(["android"])).join(),
    /ios: o metadata\.json não lista pacote/,
  );
  assert.match(conferirEmpacotamento({}, [], pacoteBom).problemas.join(), /nenhuma plataforma/);
});

test("como comando: pacote bom sai 0; sem metadata.json ou sem o zod 4 sai 1; sem argumento sai 2", () => {
  const pasta = mkdtempSync(join(tmpdir(), "empacotamento-campo-"));
  try {
    assert.equal(
      spawnSync(process.execPath, [SCRIPT, pasta, "android"]).status,
      1,
      "sem metadata.json",
    );
    mkdirSync(join(pasta, "_expo", "static", "js", "android"), { recursive: true });
    writeFileSync(join(pasta, "metadata.json"), JSON.stringify(metadata(["android"])));
    writeFileSync(join(pasta, "_expo/static/js/android/entry.js"), pacoteBom());
    assert.equal(spawnSync(process.execPath, [SCRIPT, pasta, "android"]).status, 0);
    writeFileSync(
      join(pasta, "_expo/static/js/android/entry.js"),
      `${"x".repeat(TAMANHO_MINIMO)} gpsPrecisaoMetros`,
    );
    const r = spawnSync(process.execPath, [SCRIPT, pasta, "android"], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /zod 4/);
    assert.equal(spawnSync(process.execPath, [SCRIPT]).status, 2);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
