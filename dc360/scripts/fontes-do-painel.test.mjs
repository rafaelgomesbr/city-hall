import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import {
  DESTINO, FACES, LICENCAS, ORIGEM, RAIZ, gerarEmMemoria, ttfParaWoff,
} from "./gerar-fontes-do-painel.mjs";

/**
 * As fontes do painel são geradas, e o que está no repositório precisa ser o
 * que o roteiro produz.
 *
 * Duas coisas erram em silêncio aqui, e as duas são cobradas:
 *
 *   1. alguém troca um `.ttf` do aplicativo (fonte nova) e esquece de gerar de
 *      novo: o painel fica com a fonte velha e o aplicativo com a nova, e a
 *      identidade visual diverge sem ninguém perceber;
 *   2. alguém edita um `.woff` à mão, ou o codificador muda: o arquivo deixa de
 *      ser o `.ttf` original tabela a tabela, e o que o navegador desenha
 *      deixa de ser a fonte licenciada.
 */

test("cada .woff do repositorio e exatamente o que o roteiro gera dos .ttf do aplicativo", () => {
  for (const { nome, bytes } of gerarEmMemoria()) {
    const caminho = join(DESTINO, nome);
    assert.ok(existsSync(caminho), `falta ${nome}: rode node scripts/gerar-fontes-do-painel.mjs`);
    assert.ok(
      readFileSync(caminho).equals(bytes),
      `${nome} diverge do que o roteiro gera: rode node scripts/gerar-fontes-do-painel.mjs`,
    );
  }
});

test("a licenca OFL acompanha as fontes, igual a de origem", () => {
  for (const licenca of LICENCAS) {
    assert.ok(existsSync(join(DESTINO, licenca)), `falta ${licenca} em public/fontes`);
    assert.equal(
      readFileSync(join(DESTINO, licenca), "utf8"),
      readFileSync(join(ORIGEM, licenca), "utf8"),
      `${licenca} difere da licença que veio com a fonte`,
    );
  }
});

/**
 * O WOFF reconstrói o TTF tabela a tabela: descomprimindo cada tabela e
 * comparando com a tabela de mesma etiqueta no `.ttf` de origem. É a prova de
 * que o codificador não perde nem altera byte nenhum da fonte licenciada.
 */
test("o WOFF e o TTF tabela a tabela, e o cabecalho diz a verdade sobre os tamanhos", () => {
  for (const face of FACES) {
    const ttf = readFileSync(join(ORIGEM, face.origem));
    const woff = ttfParaWoff(ttf);

    assert.equal(woff.subarray(0, 4).toString("ascii"), "wOFF");
    assert.equal(woff.readUInt32BE(4), ttf.readUInt32BE(0), "flavor diferente do sfnt");
    assert.equal(woff.readUInt32BE(8), woff.length, "o tamanho do cabeçalho não é o do arquivo");
    const numTables = woff.readUInt16BE(12);
    assert.equal(numTables, ttf.readUInt16BE(4));
    assert.equal(woff.readUInt16BE(14), 0, "reservado precisa ser zero");

    const tabelasDoTtf = new Map();
    for (let i = 0; i < numTables; i++) {
      const base = 12 + i * 16;
      tabelasDoTtf.set(
        ttf.subarray(base, base + 4).toString("latin1"),
        ttf.subarray(ttf.readUInt32BE(base + 8), ttf.readUInt32BE(base + 8) + ttf.readUInt32BE(base + 12)),
      );
    }

    let totalSfnt = 12 + 16 * numTables;
    let etiquetaAnterior = "";
    for (let i = 0; i < numTables; i++) {
      const e = 44 + i * 20;
      const etiqueta = woff.subarray(e, e + 4).toString("latin1");
      const offset = woff.readUInt32BE(e + 4);
      const comp = woff.readUInt32BE(e + 8);
      const orig = woff.readUInt32BE(e + 12);
      assert.ok(etiqueta > etiquetaAnterior, `diretório fora de ordem em ${etiqueta}`);
      etiquetaAnterior = etiqueta;
      assert.equal(offset % 4, 0, `tabela ${etiqueta} desalinhada`);
      const bruta = woff.subarray(offset, offset + comp);
      const dados = comp < orig ? inflateSync(bruta) : bruta;
      assert.ok(dados.equals(tabelasDoTtf.get(etiqueta)), `${face.destino}: a tabela ${etiqueta} não é a do .ttf`);
      totalSfnt += (orig + 3) & ~3;
    }
    assert.equal(woff.readUInt32BE(16), totalSfnt, "totalSfntSize errado");
    assert.ok(woff.length < ttf.length * 0.7, `${face.destino} não encolheu: a compressão não está valendo`);
  }
});

test("o tokens.css do painel declara exatamente as faces geradas, e nenhuma outra", () => {
  const tokens = readFileSync(join(RAIZ, "apps", "web", "src", "estilos", "tokens.css"), "utf8");
  const declaradas = [...tokens.matchAll(/url\("\/fontes\/([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(declaradas, FACES.map((f) => f.destino).sort());
});

test("o codificador e determinista: duas passadas, os mesmos bytes", () => {
  const ttf = readFileSync(join(ORIGEM, FACES[0].origem));
  assert.ok(ttfParaWoff(ttf).equals(ttfParaWoff(ttf)));
});
