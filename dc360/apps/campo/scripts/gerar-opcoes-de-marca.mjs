/**
 * Desenha opções de marca para o aplicativo e monta uma folha de contato.
 *
 * Existe separado de `gerar-icones.mjs` de propósito: aquele produz os
 * arquivos que as lojas consomem, e este produz material de decisão. Só
 * depois de a marca ser escolhida é que ela entra no outro.
 *
 * A folha mostra cada opção em 1024, em 120 e em 40 pixels. O de 40 é o que
 * decide: é o tamanho em que o ícone vive de verdade, na tela inicial do
 * aparelho do agente, ao lado do WhatsApp. Marca que só funciona grande é
 * marca que não funciona.
 *
 * Rodar (de dentro de apps/campo):
 *   node scripts/gerar-opcoes-de-marca.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const AQUI = dirname(fileURLToPath(import.meta.url));
const requireDaqui = createRequire(import.meta.url);
const { chromium } = requireDaqui(join(AQUI, "..", "..", "..", "node_modules", "playwright"));

const DESTINO = process.argv[2] ?? join(AQUI, "..", "assets", "opcoes");

/** Os mesmos valores de `design-system/tokens.css`. Nenhuma cor inventada. */
const VIOLETA = "#5B21B6";
const VIOLETA_ESCURO = "#4C1D95";
const TINTA = "#101519";
const GELO = "#ECF1F4";

/*
  As três marcas, em SVG sobre uma caixa de 100 por 100, para escalarem sem
  perder geometria. Cada uma carrega uma ideia só: marca com duas ideias vira
  ilustração e some em 40 pixels.
*/
const MARCAS = {
  cume: {
    titulo: "Escudo com cume",
    ideia: "O escudo e o que ele protege: a encosta. Deslizamento em encosta ocupada é o que mais mata na Defesa Civil brasileira, e a marca fala disso, não de segurança em geral.",
    svg: `
      <path d="M50 12 L82 24 V52 C82 71 68 83 50 89 C32 83 18 71 18 52 V24 Z"
            fill="${GELO}"/>
      <path d="M28 70 L44 44 L54 58 L63 45 L76 70 Z" fill="${VIOLETA}"/>`,
  },
  alerta: {
    titulo: "Escudo com alerta",
    ideia: "Defesa mais risco, na leitura mais direta possível. Legível em qualquer tamanho, ao custo de parecer aplicativo de segurança digital.",
    svg: `
      <path d="M50 12 L82 24 V52 C82 71 68 83 50 89 C32 83 18 71 18 52 V24 Z"
            fill="${GELO}"/>
      <path d="M50 36 L67 66 H33 Z" fill="${VIOLETA}"/>`,
  },
  prumo: {
    titulo: "Marco em campo",
    ideia: "O alerta pousado num ponto do território, que é o que o agente faz: levar a vistoria até o lugar. Sem escudo, que é o clichê do setor.",
    svg: `
      <path d="M50 10 C66 10 79 23 79 39 C79 57 50 90 50 90 C50 90 21 57 21 39 C21 23 34 10 50 10 Z"
            fill="${GELO}"/>
      <path d="M50 25 L64 51 H36 Z" fill="${VIOLETA}"/>`,
  },
};

/** Um ícone: a marca sobre o gradiente violeta, no formato de app. */
function icone(chave, lado) {
  const raio = Math.round(lado * 0.22);
  return `<div class="icone" style="width:${lado}px;height:${lado}px;border-radius:${raio}px">
    <svg viewBox="0 0 100 100" width="${lado}" height="${lado}">${MARCAS[chave].svg}</svg>
  </div>`;
}

const estilo = `
  * { box-sizing: border-box; }
  body {
    margin: 0; background: ${TINTA}; color: ${GELO};
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    padding: 56px 64px;
  }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: .01em; }
  .sub { opacity: .62; font-size: 16px; margin: 0 0 44px; }
  .linha {
    display: grid; grid-template-columns: 1024px 1fr; gap: 44px;
    align-items: center; padding: 32px 0;
    border-top: 1px solid rgba(236,241,244,.13);
  }
  .icone {
    background: linear-gradient(135deg, ${VIOLETA}, ${VIOLETA_ESCURO});
    display: grid; place-items: center; position: relative; overflow: hidden;
    flex: none;
  }
  .icone::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(200deg, rgba(255,255,255,.14), transparent 58%);
  }
  .nome { font-size: 26px; font-weight: 700; margin: 0 0 10px; }
  .ideia { font-size: 17px; opacity: .72; line-height: 1.5; margin: 0 0 26px; max-width: 46ch; }
  .reais { display: flex; align-items: flex-end; gap: 26px; }
  .par { display: grid; justify-items: center; gap: 9px; }
  .medida { font-size: 13px; opacity: .5; }
`;

const linhas = Object.keys(MARCAS).map((c) => `
  <div class="linha">
    ${icone(c, 1024)}
    <div>
      <p class="nome">${MARCAS[c].titulo}</p>
      <p class="ideia">${MARCAS[c].ideia}</p>
      <div class="reais">
        <div class="par">${icone(c, 120)}<span class="medida">120 px</span></div>
        <div class="par">${icone(c, 40)}<span class="medida">40 px, o tamanho real</span></div>
      </div>
    </div>
  </div>`).join("");

const folha = `<!doctype html><html><head><meta charset="utf-8"><style>${estilo}</style></head>
<body>
  <h1>Opções de marca do aplicativo de campo</h1>
  <p class="sub">Violeta, tinta e gelo saem de design-system/tokens.css. Nenhuma cor nova.</p>
  ${linhas}
</body></html>`;

mkdirSync(DESTINO, { recursive: true });
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 1800, height: 1200 } });
  await pagina.setContent(folha, { waitUntil: "load" });
  await pagina.screenshot({ path: join(DESTINO, "folha-de-contato.png"), fullPage: true });
  await pagina.close();

  for (const chave of Object.keys(MARCAS)) {
    const p = await navegador.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:1024px;height:1024px;background:${TINTA}}
      ${estilo}
      body{padding:0;display:grid;place-items:center}
    </style></head><body>${icone(chave, 1024)}</body></html>`, { waitUntil: "load" });
    await p.screenshot({ path: join(DESTINO, `icone-${chave}.png`) });
    await p.close();
    console.log(`  icone-${chave}.png`);
  }
} finally {
  await navegador.close();
}
console.log(`Folha de contato em ${DESTINO}/folha-de-contato.png`);
