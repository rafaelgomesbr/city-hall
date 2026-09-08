/**
 * Gera os arquivos de imagem que as lojas exigem.
 *
 * As duas lojas recusam binário sem ícone, e o ícone não pode ser um
 * quadrado cinza: ele aparece na tela inicial do aparelho do agente, ao lado
 * do WhatsApp e do aplicativo do banco. Este script desenha a marca do
 * produto com os tokens do design system e captura em PNG no tamanho exato
 * de cada loja, usando o navegador que já está instalado para os testes.
 *
 * Gerar em vez de commitar binário tem uma razão prática: quando a
 * identidade mudar, como já mudou uma vez neste projeto (laranja para
 * violeta), basta rodar de novo. Um PNG commitado ficaria velho em silêncio.
 *
 * Rodar (de dentro de apps/campo):
 *   node scripts/gerar-icones.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = join(AQUI, "..", "assets");
const requireDaqui = createRequire(import.meta.url);

/*
  O Playwright vive no node_modules da raiz do monorepo, instalado para as
  suítes de navegador. Reaproveitá-lo evita trazer um rasterizador só para
  desenhar três imagens.
*/
const { chromium } = requireDaqui(join(AQUI, "..", "..", "..", "node_modules", "playwright"));

/** Os mesmos valores de `design-system/tokens.css`. Nenhuma cor inventada. */
const VIOLETA = "#5B21B6";
const VIOLETA_ESCURO = "#4C1D95";
const TINTA = "#101519";
const GELO = "#ECF1F4";

/**
 * O brasão: escudo cheio com a encosta vazada nele.
 *
 * O escudo diz defesa; o cume diz o que está sendo defendido. Deslizamento em
 * encosta ocupada é o que mais mata na Defesa Civil brasileira, então a marca
 * fala do trabalho e não de "segurança" genérica.
 *
 * Duas formas só, ambas cheias: aos 40 pixels da tela inicial, que é onde o
 * ícone realmente vive, linha fina some e detalhe vira sujeira.
 */
const BRASAO = `
  <path d="M50 12 L82 24 V52 C82 71 68 83 50 89 C32 83 18 71 18 52 V24 Z" fill="${GELO}"/>
  <path d="M28 70 L44 44 L54 58 L63 45 L76 70 Z" fill="${VIOLETA}"/>`;

/**
 * A marca: monograma sobre gradiente, dentro de um escudo arredondado.
 *
 * `folga` controla a margem interna, e `raio` o arredondamento da arte.
 *
 * Os dois são ZERO nas artes de loja, e a razão é um erro fácil de cometer:
 * o sistema operacional já aplica a máscara arredondada por cima do ícone.
 * Arte que chega arredondada, com o fundo da tela aparecendo nos cantos, sai
 * com uma borda escura em volta depois da máscara. Arte de ícone sangra até
 * a borda, sempre.
 *
 * A folga do ícone adaptativo do Android é outra história: lá o sistema
 * recorta em círculo, quadrado ou gota conforme o fabricante, e o desenho
 * encostado na borda some no recorte. O fundo continua sangrando; o que
 * recua é o desenho.
 */
function marca({ lado, folga, fundo, raio, recuo = 0 }) {
  const caixa = lado - folga * 2;
  /*
    `recuo` encolhe SÓ o desenho, deixando o fundo sangrar. É o que a área de
    segurança do ícone adaptativo do Android pede: o recorte do fabricante come
    a borda, e o que não pode ser comido é o brasão.
  */
  const desenho = Math.round(caixa * 0.62 * (1 - recuo));
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${lado}px; height: ${lado}px; }
  body { background: ${fundo}; display: grid; place-items: center; }
  .escudo {
    width: ${caixa}px; height: ${caixa}px;
    border-radius: ${raio}px;
    background: linear-gradient(135deg, ${VIOLETA}, ${VIOLETA_ESCURO});
    display: grid; place-items: center;
    position: relative; overflow: hidden;
  }
  /* Faixa diagonal discreta: dá volume sem virar ilustração, e some bem em
     tamanho pequeno, que é onde o ícone realmente vive. */
  .escudo::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(200deg, rgba(255,255,255,.14), transparent 58%);
  }
  .marca { width: ${desenho}px; height: ${desenho}px; z-index: 1; }
</style></head>
<body><div class="escudo"><svg class="marca" viewBox="0 0 100 100">${BRASAO}</svg></div></body></html>`;
}

/** Tela de abertura: marca centrada sobre o fundo escuro do tema. */
function abertura({ largura, altura }) {
  const emblema = Math.round(Math.min(largura, altura) * 0.22);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${largura}px; height: ${altura}px; background: ${TINTA}; }
  body { display: grid; place-items: center; }
  .marca { display: grid; place-items: center; gap: ${Math.round(emblema * 0.28)}px; }
  .escudo {
    width: ${emblema}px; height: ${emblema}px;
    border-radius: ${Math.round(emblema * 0.22)}px;
    background: linear-gradient(135deg, ${VIOLETA}, ${VIOLETA_ESCURO});
    display: grid; place-items: center;
  }
  .escudo svg { width: ${Math.round(emblema * 0.62)}px; height: ${Math.round(emblema * 0.62)}px; }
  .nome {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: ${GELO}; font-weight: 700; font-size: ${Math.round(emblema * 0.17)}px;
    letter-spacing: .02em;
  }
</style></head>
<body><div class="marca"><div class="escudo"><svg viewBox="0 0 100 100">${BRASAO}</svg></div><div class="nome">Defesa Civil 360</div></div></body></html>`;
}

/*
  Os três arquivos, e por que cada tamanho é esse:

  - `icone.png` a 1024: é o que a App Store e a Play Store pedem como arte
    mestra, e o Expo deriva dele todas as densidades do iOS.
  - `icone-adaptativo.png` a 1024 com folga de 22%: o Android recorta o
    primeiro plano numa máscara que varia por fabricante, e o guia oficial
    reserva a área de segurança central.
  - `splash.png` a 1284 por 2778: a maior tela de iPhone atual. O Expo
    redimensiona para baixo sem perder nitidez; o caminho contrário borra.
*/
const ARTES = [
  { arquivo: "icone.png", largura: 1024, altura: 1024,
    html: marca({ lado: 1024, folga: 0, raio: 0, fundo: VIOLETA }) },
  { arquivo: "icone-adaptativo.png", largura: 1024, altura: 1024,
    html: marca({ lado: 1024, folga: 0, raio: 0, fundo: VIOLETA, recuo: 0.22 }) },
  { arquivo: "splash.png", largura: 1284, altura: 2778,
    html: abertura({ largura: 1284, altura: 2778 }) },
];

mkdirSync(DESTINO, { recursive: true });

const navegador = await chromium.launch();
try {
  for (const arte of ARTES) {
    const pagina = await navegador.newPage({
      viewport: { width: arte.largura, height: arte.altura },
      deviceScaleFactor: 1,
    });
    await pagina.setContent(arte.html, { waitUntil: "load" });
    await pagina.screenshot({
      path: join(DESTINO, arte.arquivo),
      // Fundo transparente só no ícone adaptativo: o Android põe a cor por
      // baixo, e um fundo opaco aqui apareceria como moldura no recorte.
      omitBackground: arte.arquivo === "icone-adaptativo.png",
    });
    await pagina.close();
    console.log(`  ${arte.arquivo}  ${arte.largura}x${arte.altura}`);
  }
} finally {
  await navegador.close();
}

console.log("Artes geradas em assets/.");
