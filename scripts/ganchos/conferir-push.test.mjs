import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { conferirPush, lerAtualizacoes } from "./conferir-push.mjs";

const ZERO = "0".repeat(40);

function repo() {
  const raiz = mkdtempSync(join(tmpdir(), "pre-push-"));
  const g = (...args) => execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();
  g("init", "-q", "-b", "master");
  g("config", "user.email", "teste@exemplo.invalid");
  g("config", "user.name", "Teste");
  g("config", "commit.gpgsign", "false");
  const escrever = (caminho, texto) => {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), texto);
  };
  const commit = (msg) => {
    g("add", "-A");
    g("commit", "-q", "-m", msg);
    return g("rev-parse", "HEAD");
  };
  escrever("a.txt", "1");
  const base = commit("base");
  return { raiz, g, escrever, commit, base, limpar: () => rmSync(raiz, { recursive: true, force: true }) };
}

/** Cria um ramo com uma mudança e o junta em master com commit de merge. Devolve o SHA do merge. */
function juntar(r, nome) {
  r.g("switch", "-q", "-c", nome);
  r.escrever(`${nome}.txt`, nome);
  r.commit(nome);
  r.g("switch", "-q", "master");
  r.g("merge", "-q", "--no-ff", nome, "-m", `merge ${nome}`);
  return r.g("rev-parse", "HEAD");
}

function arquivarEvidencia(r, sha, verde = true) {
  r.escrever(`docs/evidencias-v2/ci-local/${sha}/resumo.json`, JSON.stringify({ sha, verde, jobs: [] }));
  return r.commit(`evidência do CI local de ${sha.slice(0, 8)}`);
}

const linha = (local, remoto, ref = "refs/heads/master") => `refs/heads/master ${local} ${ref} ${remoto}\n`;

test("lê as linhas que o git passa ao pre-push", () => {
  assert.deepEqual(lerAtualizacoes(`refs/heads/x abc refs/heads/x ${ZERO}\n\n`), [
    { refLocal: "refs/heads/x", shaLocal: "abc", refRemota: "refs/heads/x", shaRemoto: ZERO },
  ]);
});

test("merge com CI local verde mais o commit da evidência passa", () => {
  const r = repo();
  try {
    const merge = juntar(r, "fase");
    const tip = arquivarEvidencia(r, merge);
    assert.deepEqual(conferirPush(linha(tip, r.base), r.raiz), []);
  } finally {
    r.limpar();
  }
});

test("o teste morde: commit direto, merge sem evidência, CI vermelho e reescrita são recusados", () => {
  const r = repo();
  try {
    r.escrever("a.txt", "2");
    const direto = r.commit("commit direto em master");
    assert.match(conferirPush(linha(direto, r.base), r.raiz).join("\n"), /não é commit de merge/);

    r.g("reset", "-q", "--hard", r.base);
    const merge = juntar(r, "sem-evidencia");
    assert.match(conferirPush(linha(merge, r.base), r.raiz).join("\n"), /sem evidência do CI local/);

    const vermelho = arquivarEvidencia(r, merge, false);
    assert.match(conferirPush(linha(vermelho, r.base), r.raiz).join("\n"), /não está verde/);

    // Evidência misturada com outra mudança não conta como "só arquivamento".
    r.g("reset", "-q", "--hard", merge);
    r.escrever(`docs/evidencias-v2/ci-local/${merge}/resumo.json`, JSON.stringify({ sha: merge, verde: true }));
    r.escrever("a.txt", "escondido");
    const misturado = r.commit("evidência e mais uma coisa");
    assert.match(conferirPush(linha(misturado, r.base), r.raiz).join("\n"), /não é commit de merge/);

    // Reescrita: o master remoto não é ancestral do que se empurra.
    assert.match(conferirPush(linha(r.base, misturado), r.raiz).join("\n"), /reescreve master/);
    assert.match(conferirPush(linha(ZERO, r.base), r.raiz).join("\n"), /apagar master/);
  } finally {
    r.limpar();
  }
});

test("push em outro ramo não é conferido", () => {
  const r = repo();
  try {
    r.escrever("a.txt", "2");
    const direto = r.commit("commit no ramo da fase");
    assert.deepEqual(conferirPush(linha(direto, r.base, "refs/heads/v2/f01"), r.raiz), []);
  } finally {
    r.limpar();
  }
});
