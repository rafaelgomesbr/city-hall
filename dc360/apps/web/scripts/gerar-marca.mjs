/**
 * Gera os arquivos de marca de `public/` a partir das duas fontes em SVG.
 *
 *   node scripts/gerar-marca.mjs
 *
 * De `public/icone.svg` saem: icone-192.png, icone-512.png, favicon.ico
 * (16, 32 e 48), apple-touch-icon.png (180, fundo cheio) e
 * icone-mascaravel-512.png (fundo cheio, sigla dentro do círculo de 80% que o
 * Android usa como área segura). De `public/og.svg` sai og.png (1200 x 630).
 *
 * O desenho mora nos SVG, e só neles. Este script não decide cor, raio nem
 * tamanho de letra: ele abre o SVG no Chromium do Playwright (que já é
 * dependência do painel pelo teste de ponta a ponta), tira a foto no tamanho
 * pedido e grava. PNG feito à mão, ou por outro caminho, diverge do SVG na
 * primeira mudança de token e ninguém percebe.
 *
 * Nas versões de fundo cheio, o script zera o raio dos cantos (`rect.canto`):
 * no iPhone e no Android quem recorta o canto é o sistema, e um PNG já
 * arredondado por cima do recorte deles fica com uma borda preta.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = join(RAIZ, "public");

const icone = readFileSync(join(PUBLICO, "icone.svg"), "utf8");
const og = readFileSync(join(PUBLICO, "og.svg"), "utf8");

/** Largura e altura lidas do cabeçalho IHDR, para conferir o que foi gravado. */
function dimensoesDoPng(bytes) {
  const assinatura = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== assinatura) throw new Error("não é PNG");
  return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
}

/**
 * Empacota PNGs num .ico. O formato aceita PNG dentro desde o Windows Vista, e
 * todo navegador atual lê; é o que os geradores de favicon fazem.
 */
function empacotarIco(quadros) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(quadros.length, 4);

  const entradas = [];
  let deslocamento = 6 + 16 * quadros.length;
  for (const { tamanho, png } of quadros) {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0);
    entrada.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    entrada.writeUInt8(0, 2); // paleta: nenhuma
    entrada.writeUInt8(0, 3); // reservado
    entrada.writeUInt16LE(1, 4); // planos de cor
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(png.length, 8);
    entrada.writeUInt32LE(deslocamento, 12);
    entradas.push(entrada);
    deslocamento += png.length;
  }
  return Buffer.concat([cabecalho, ...entradas, ...quadros.map((q) => q.png)]);
}

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ deviceScaleFactor: 1 });

  /**
   * Abre um SVG num documento vazio e fotografa só ele.
   * `fundoCheio` zera o raio dos cantos; `transparente` deixa o que está fora
   * do desenho sem cor, em vez de branco; `escalaDaSigla` amplia a sigla em
   * torno do centro (só nos quadros miúdos do favicon, ver abaixo).
   */
  async function fotografar(
    svg,
    { largura, altura, fundoCheio = false, transparente = true, escalaDaSigla = 1 },
  ) {
    await pagina.setViewportSize({ width: largura, height: altura });
    await pagina.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html, body { margin: 0; padding: 0; background: transparent; }
        svg { display: block; width: ${largura}px; height: ${altura}px; }
      </style></head><body>${svg}</body></html>`,
    );
    if (fundoCheio) {
      await pagina.evaluate(() => {
        for (const canto of document.querySelectorAll("rect.canto")) canto.setAttribute("rx", "0");
      });
    }
    if (escalaDaSigla !== 1) {
      await pagina.evaluate((escala) => {
        document
          .getElementById("sigla")
          ?.setAttribute("transform", `translate(256 256) scale(${escala}) translate(-256 -256)`);
      }, escalaDaSigla);
    }
    const png = await pagina.locator("svg").screenshot({ type: "png", omitBackground: transparente });
    const lidas = dimensoesDoPng(png);
    if (lidas.largura !== largura || lidas.altura !== altura) {
      throw new Error(`saiu ${lidas.largura}x${lidas.altura}, esperava ${largura}x${altura}`);
    }
    return png;
  }

  function gravar(nome, bytes) {
    writeFileSync(join(PUBLICO, nome), bytes);
    console.log(`${nome.padEnd(28)} ${String(bytes.length).padStart(7)} bytes`);
  }

  gravar("icone-192.png", await fotografar(icone, { largura: 192, altura: 192 }));
  gravar("icone-512.png", await fotografar(icone, { largura: 512, altura: 512 }));
  gravar(
    "apple-touch-icon.png",
    await fotografar(icone, { largura: 180, altura: 180, fundoCheio: true, transparente: false }),
  );
  gravar(
    "icone-mascaravel-512.png",
    await fotografar(icone, { largura: 512, altura: 512, fundoCheio: true, transparente: false }),
  );

  /*
    Compensação óptica nos quadros miúdos, a mesma que tipografia faz com
    corpo pequeno: a 16 px a sigla na proporção do SVG vira um borrão de dois
    traços, e a 32 ainda perde peso. Ampliada em 25% e 12% ela continua
    dentro do fundo e passa a se ler na aba. A 48 já não precisa.
  */
  const quadros = [];
  for (const [tamanho, escalaDaSigla] of [[16, 1.25], [32, 1.12], [48, 1]]) {
    quadros.push({
      tamanho,
      png: await fotografar(icone, { largura: tamanho, altura: tamanho, escalaDaSigla }),
    });
  }
  gravar("favicon.ico", empacotarIco(quadros));

  gravar("og.png", await fotografar(og, { largura: 1200, altura: 630, transparente: false }));
} finally {
  await navegador.close();
}
