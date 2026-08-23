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
 * A marca: monograma sobre gradiente, dentro de um escudo arredondado.
 *
 * `preencher` controla a margem interna. O ícone de loja ocupa a arte toda; o
 * ícone adaptativo do Android precisa de folga porque o sistema recorta em
 * círculo, quadrado ou gota conforme o fabricante, e desenho encostado na
 * borda some no recorte.
 */
function marca({ lado, folga, fundo }) {
  const raio = Math.round(lado * 0.22);
  const caixa = lado - folga * 2;
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
  .sigla {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-weight: 800; letter-spacing: ${Math.round(caixa * 0.005)}px;
    font-size: ${Math.round(caixa * 0.36)}px;
    color: ${GELO};
    line-height: 1;
    z-index: 1;
  }
</style></head>
<body><div class="escudo"><span class="sigla">DC</span></div></body></html>`;
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
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-weight: 800; font-size: ${Math.round(emblema * 0.36)}px; color: ${GELO};
  }
  .nome {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: ${GELO}; font-weight: 700; font-size: ${Math.round(emblema * 0.17)}px;
    letter-spacing: .02em;
  }
</style></head>
<body><div class="marca"><div class="escudo">DC</div><div class="nome">Defesa Civil 360</div></div></body></html>`;
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
    html: marca({ lado: 1024, folga: 0, fundo: TINTA }) },
  { arquivo: "icone-adaptativo.png", largura: 1024, altura: 1024,
    html: marca({ lado: 1024, folga: Math.round(1024 * 0.22), fundo: "transparent" }) },
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
