/**
 * Testes de `conferir-indices-de-evidencia.mjs` (V2-F00-E21, correção 1).
 * Cada caso monta uma pasta de evidência de mentira e prova que o conferidor
 * reprova o que tem de reprovar: índice adulterado, arquivo faltando, fim de
 * linha trocado ou misturado. O último bloco roda contra a evidência real e o
 * `.gitattributes` real.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PASTA_DE_EVIDENCIAS,
  acharIndices,
  conferirFimDeLinhaNoGit,
  conferirIndice,
  conferirTudo,
  lerLinhasDoIndice,
  relatorio,
} from "./conferir-indices-de-evidencia.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_DO_REPOSITORIO = resolve(AQUI, "..", "..");
const sha = (conteudo) => createHash("sha256").update(conteudo).digest("hex");
const temporarios = [];
after(() => temporarios.forEach((p) => rmSync(p, { recursive: true, force: true })));

/** Cria `pasta/arquivo` com o conteúdo dado (cria as subpastas). */
function gravar(pasta, arquivo, conteudo) {
  const caminho = join(pasta, arquivo);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

/** Pasta de evidência com os arquivos dados e um `INDEX.md` correto sobre eles. */
function evidencia(arquivos, { aparte = {} } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "indices-de-evidencia-"));
  temporarios.push(raiz);
  const pasta = join(raiz, "G00", "V2-F00-E99");
  const linhas = ["# INDEX", "", "| Arquivo | SHA-256 |", "| --- | --- |"];
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    gravar(pasta, nome, conteudo);
    linhas.push(`| ${nome} | ${aparte[nome] ?? sha(conteudo)} |`);
  }
  gravar(pasta, "INDEX.md", linhas.join("\n") + "\n");
  return { raiz, pasta, indice: join(pasta, "INDEX.md") };
}

const SAIDA_LF = "linha 1\nlinha 2\nlinha 3\n";

describe("conferir-indices-de-evidencia: o que passa", () => {
  it("índice correto sobre os bytes do disco passa", () => {
    const { indice } = evidencia({ "RESUMO.md": "# resumo\n", "saidas/01.txt": SAIDA_LF });
    const r = conferirIndice(indice);
    assert.deepEqual(r.problemas, []);
    assert.equal(r.conferidos, 2);
  });

  it("lê a tabela mesmo com nota em citação acima dela e ignora cabeçalho e separador", () => {
    const linhas = lerLinhasDoIndice(`# INDEX\n\n> Nota de 2026-10-15: texto com | barra\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| a.txt | ${"a".repeat(64)} |\n`);
    assert.deepEqual(linhas.map((l) => l.arquivo), ["a.txt"]);
  });

  it("VEREDITO.md, RISCO-ACEITO.md e validacao/ são do gatekeeper: não entram na conferência", () => {
    const { indice } = evidencia(
      { "RESUMO.md": "x\n" },
    );
    // o índice lista os três com hash errado e arquivos que nem existem: nada disso pode reprovar
    const antigo = `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| RESUMO.md | ${sha("x\n")} |\n| VEREDITO.md | ${"0".repeat(64)} |\n| RISCO-ACEITO.md | ${"0".repeat(64)} |\n| validacao/abc1234/qa.md | ${"0".repeat(64)} |\n`;
    writeFileSync(indice, antigo);
    assert.deepEqual(conferirIndice(indice).problemas, []);
  });
});

describe("conferir-indices-de-evidencia: o que morde", () => {
  it("INDEX adulterado: hash trocado por outro reprova e nomeia o arquivo e a linha", () => {
    const { indice } = evidencia({ "RESUMO.md": "# resumo\n" }, { aparte: { "RESUMO.md": sha("outra coisa") } });
    const r = conferirIndice(indice);
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0], /linha 5: RESUMO\.md tem SHA-256 diferente do índice/);
  });

  it("arquivo editado depois de indexado reprova", () => {
    const { indice, pasta } = evidencia({ "saidas/01.txt": SAIDA_LF });
    writeFileSync(join(pasta, "saidas/01.txt"), SAIDA_LF + "uma linha a mais\n");
    assert.match(conferirIndice(indice).problemas[0], /saidas\/01\.txt tem SHA-256 diferente/);
  });

  it("arquivo listado e faltando reprova", () => {
    const { indice, pasta } = evidencia({ "RESUMO.md": "x\n", "saidas/01.txt": SAIDA_LF });
    rmSync(join(pasta, "saidas/01.txt"));
    const r = conferirIndice(indice);
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0], /saidas\/01\.txt está no índice e não existe na pasta/);
  });

  it("fim de linha trocado (índice de LF, arquivo em CRLF) reprova e diz a causa", () => {
    const { indice, pasta } = evidencia({ "saidas/01.txt": SAIDA_LF });
    writeFileSync(join(pasta, "saidas/01.txt"), SAIDA_LF.replace(/\n/g, "\r\n"));
    const r = conferirIndice(indice);
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0], /tem SHA-256 diferente do índice/);
    assert.match(r.problemas[0], /bateria com todo o arquivo em LF/);
  });

  it("fim de linha trocado no outro sentido (índice de CRLF, arquivo em LF) reprova e diz a causa", () => {
    const crlf = SAIDA_LF.replace(/\n/g, "\r\n");
    const { indice, pasta } = evidencia({ "saidas/01.txt": crlf });
    writeFileSync(join(pasta, "saidas/01.txt"), SAIDA_LF);
    assert.match(conferirIndice(indice).problemas[0], /bateria com todo o arquivo em CRLF/);
  });

  it("fim de linha misto no disco, índice de outro conteúdo: reprova e avisa que mistura", () => {
    // o índice guardou um texto que nem em LF puro nem em CRLF puro reproduz o arquivo: só o misto (como os de 2026-10-15)
    const { indice, pasta } = evidencia({ "saidas/01.txt": "linha 1\r\nlinha 2\nlinha 3\n" });
    writeFileSync(join(pasta, "saidas/01.txt"), "linha 1\nlinha 2\r\nlinha 3\n");
    const problema = conferirIndice(indice).problemas[0];
    assert.match(problema, /mistura CRLF e LF/);
    assert.doesNotMatch(problema, /bateria/);
  });

  it("o índice não normaliza: um CRLF a mais num arquivo que o índice guardou com LF reprova mesmo que o texto seja o mesmo", () => {
    const { indice, pasta } = evidencia({ "a.txt": "um\ndois\n" });
    writeFileSync(join(pasta, "a.txt"), "um\r\ndois\r\n");
    assert.equal(conferirIndice(indice).problemas.length, 1);
  });

  it("hash que não é 64 hexadecimais, linha repetida e caminho que sai da pasta reprovam", () => {
    const { indice, pasta } = evidencia({ "a.txt": "a\n" });
    gravar(dirname(pasta), "fora.txt", "fora\n");
    writeFileSync(
      indice,
      `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| a.txt | curto |\n| a.txt | ${sha("a\n")} |\n| ../fora.txt | ${sha("fora\n")} |\n`,
    );
    const texto = conferirIndice(indice).problemas.join("\n");
    assert.match(texto, /a\.txt tem um SHA-256 que não é 64 hexadecimais/);
    assert.match(texto, /a\.txt aparece duas vezes/);
    assert.match(texto, /\.\.\/fora\.txt sai da pasta do índice/);
  });

  it("índice sem nenhuma linha de tabela reprova (não passa por vazio)", () => {
    const { indice } = evidencia({ "a.txt": "a\n" });
    writeFileSync(indice, "# INDEX\n\nsem tabela\n");
    assert.match(conferirIndice(indice).problemas[0], /nenhuma linha/);
  });
});

describe("conferir-indices-de-evidencia: falsos verdes que a revisão achou", () => {
  it("arquivo dentro da pasta que o índice não lista reprova", () => {
    const { indice, pasta } = evidencia({ "RESUMO.md": "x\n" });
    gravar(pasta, "saidas/esqueci.txt", "fora do índice\n");
    const problemas = conferirIndice(indice).problemas;
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /saidas\/esqueci\.txt existe na pasta e não está no índice/);
  });

  it("o INDEX.md aninhado, o VEREDITO.md, o RISCO-ACEITO.md e validacao/ não precisam estar no índice", () => {
    const { indice, pasta } = evidencia({ "RESUMO.md": "x\n" });
    gravar(pasta, "saidas/baseline/INDEX.md", "# INDEX\n");
    gravar(pasta, "VEREDITO.md", "v\n");
    gravar(pasta, "RISCO-ACEITO.md", "r\n");
    gravar(pasta, "validacao/abc1234/qa.md", "q\n");
    assert.deepEqual(conferirIndice(indice).problemas, []);
  });

  it("só validacao/ é do gatekeeper: um nome que apenas contém 'validacao' precisa estar no índice e bater", () => {
    const { indice, pasta } = evidencia({ "RESUMO.md": "x\n" });
    gravar(pasta, "saidas/nota-de-validacao.txt", "fora do índice\n");
    gravar(pasta, "validacao-manual.md", "fora do índice\n");
    const texto = conferirIndice(indice).problemas.join("\n");
    assert.match(texto, /saidas\/nota-de-validacao\.txt existe na pasta e não está no índice/);
    assert.match(texto, /validacao-manual\.md existe na pasta e não está no índice/);
    // e listado com hash errado também reprova
    writeFileSync(indice, `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| RESUMO.md | ${sha("x\n")} |\n| saidas/nota-de-validacao.txt | ${"0".repeat(64)} |\n| validacao-manual.md | ${sha("fora do índice\n")} |\n`);
    assert.match(conferirIndice(indice).problemas.join("\n"), /nota-de-validacao\.txt tem SHA-256 diferente/);
  });

  it("pasta de etapa sem INDEX.md reprova (a pasta da fase, sem V2-, não conta)", () => {
    const { raiz, pasta } = evidencia({ "RESUMO.md": "x\n" });
    gravar(raiz, "G00/V2-F00-E98/RESUMO.md", "etapa sem índice\n");
    gravar(raiz, "G00/validacao/nota.md", "pasta da fase\n");
    const r = conferirTudo(raiz);
    assert.deepEqual(r.falhas.map((f) => f.indice), ["G00/V2-F00-E98/INDEX.md"]);
    assert.match(r.falhas[0].problemas[0], /não tem INDEX\.md/);
    rmSync(join(pasta, "..", "V2-F00-E98"), { recursive: true });
    assert.deepEqual(conferirTudo(raiz).falhas, []);
  });

  it("pasta de topo (CP-xx) sem INDEX.md reprova; arquivo solto em G00/ não conta", () => {
    const { raiz } = evidencia({ "RESUMO.md": "x\n" });
    gravar(raiz, "G00/GUIA-DE-VALIDACAO.md", "documento solto\n");
    gravar(raiz, "CP-77/decisao.md", "decisao\n");
    const r = conferirTudo(raiz);
    assert.deepEqual(r.falhas.map((f) => f.indice), ["CP-77/INDEX.md"]);
    gravar(raiz, "CP-77/INDEX.md", `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| decisao.md | ${sha("decisao\n")} |\n`);
    assert.deepEqual(conferirTudo(raiz).falhas, []);
  });

  it("índice que só lista VEREDITO.md (ou nada) reprova, em vez de passar por vazio", () => {
    const { indice, pasta } = evidencia({ "RESUMO.md": "x\n" });
    writeFileSync(indice, `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| VEREDITO.md | ${"0".repeat(64)} |\n`);
    assert.match(conferirIndice(indice).problemas.join("\n"), /só os do gatekeeper/);
    writeFileSync(indice, "# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n");
    assert.match(conferirIndice(indice).problemas.join("\n"), /nenhuma linha/);
    assert.ok(pasta);
  });
});

describe("conferir-indices-de-evidencia: CRLF no índice do git", () => {
  /** Repositório git de mentira com o `.gitattributes` do produto (e, se pedido, um trecho -text). */
  function repositorio(extra = "") {
    const raiz = mkdtempSync(join(tmpdir(), "git-eol-"));
    temporarios.push(raiz);
    const git = (...args) => execFileSync("git", ["-C", raiz, "-c", "core.autocrlf=false", ...args], { encoding: "utf8" });
    git("init", "-q");
    writeFileSync(join(raiz, ".gitattributes"), `* text=auto eol=lf\n*.ps1 text eol=crlf\n${extra}`);
    return { raiz, git };
  }

  it("arquivo de evidência com CRLF que entra no índice do git (-text) reprova", () => {
    const { raiz, git } = repositorio("docs/evidencias-v2/** -text\n");
    gravar(raiz, "docs/evidencias-v2/G00/V2-F00-E99/NOTA.md", "a\r\nb\r\n");
    gravar(raiz, "docs/evidencias-v2/G00/V2-F00-E99/MISTO.md", "a\r\nb\n");
    git("add", "-A");
    const problemas = conferirFimDeLinhaNoGit(raiz);
    assert.equal(problemas.length, 2);
    assert.match(problemas.join("\n"), /NOTA\.md está no índice do git com fim de linha crlf/);
    assert.match(problemas.join("\n"), /MISTO\.md está no índice do git com fim de linha mixed/);
  });

  it("com o .gitattributes do produto o git guarda LF no índice (inclusive .ps1): o que sobra é só o aviso do disco", () => {
    const { raiz, git } = repositorio();
    gravar(raiz, "dc360/scripts/x.ps1", "a\r\nb\r\n");
    gravar(raiz, "imagem.png", "\x89PNG\r\n\x1a\n\0\0");
    git("add", "-A");
    // .ps1 tem eol=crlf (CRLF no disco é o esperado) e o png é binário: nenhum dos dois reprova
    assert.deepEqual(conferirFimDeLinhaNoGit(raiz), []);
  });

  it("falso verde local: arquivo com CRLF no disco que o git devolve em LF (eol=lf) reprova, mesmo com o índice do git em LF", () => {
    const { raiz, git } = repositorio();
    gravar(raiz, "docs/evidencias-v2/G00/V2-F00-E99/NOTA.md", "a\r\nb\r\n");
    gravar(raiz, "docs/evidencias-v2/G00/V2-F00-E99/MISTO.md", "a\r\nb\n");
    git("add", "-A");
    const problemas = conferirFimDeLinhaNoGit(raiz);
    assert.equal(problemas.length, 2);
    assert.match(problemas.join("\n"), /NOTA\.md está no disco com fim de linha crlf e o git o devolve em LF/);
    assert.match(problemas.join("\n"), /MISTO\.md está no disco com fim de linha mixed/);
    assert.match(problemas[0], /não bate num clone novo/);
    // depois de normalizar o disco para LF, passa
    writeFileSync(join(raiz, "docs/evidencias-v2/G00/V2-F00-E99/NOTA.md"), "a\nb\n");
    writeFileSync(join(raiz, "docs/evidencias-v2/G00/V2-F00-E99/MISTO.md"), "a\nb\n");
    assert.deepEqual(conferirFimDeLinhaNoGit(raiz), []);
  });

  it("fora de um repositório git é falha (fail-closed), não passa em silêncio", () => {
    const vazia = mkdtempSync(join(tmpdir(), "sem-git-"));
    temporarios.push(vazia);
    const problemas = conferirFimDeLinhaNoGit(vazia);
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /não consegui rodar git ls-files/);
  });

  it("o repositório real não tem nenhum arquivo com CRLF ou fim de linha misto no índice do git", () => {
    assert.deepEqual(conferirFimDeLinhaNoGit(RAIZ_DO_REPOSITORIO), []);
  });
});

describe("conferir-indices-de-evidencia: varredura", () => {
  it("acha INDEX.md em qualquer profundidade e reprova o aninhado", () => {
    const { raiz, pasta } = evidencia({ "RESUMO.md": "x\n", "saidas/baseline/a.txt": "a\n" });
    gravar(pasta, "saidas/baseline/INDEX.md", `# INDEX\n\n| Arquivo | SHA-256 |\n| --- | --- |\n| a.txt | ${sha("outra")} |\n`);
    assert.equal(acharIndices(raiz).length, 2);
    const r = conferirTudo(raiz);
    assert.deepEqual(r.falhas.map((f) => f.indice), ["G00/V2-F00-E99/saidas/baseline/INDEX.md"]);
    assert.match(relatorio(r), /RESULTADO: 1 índice\(s\) não batem/);
  });
});

describe("conferir-indices-de-evidencia: a evidência real", () => {
  it("todo INDEX.md real bate, em todas as pastas, sem lista de tolerância", () => {
    const r = conferirTudo(PASTA_DE_EVIDENCIAS);
    assert.deepEqual(r.falhas, [], relatorio(r));
    assert.ok(r.indices.length >= 56, "a varredura achou poucos índices: algo errado com a pasta");
  });

  it("o script não tem lista de pendentes nem de exceções (uma lista dessas seria brecha)", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(join(AQUI, "conferir-indices-de-evidencia.mjs"), "utf8");
    assert.doesNotMatch(fonte, /PENDENTES_CONHECIDOS\s*=|const pendente|podeSairDaLista/);
  });
});
