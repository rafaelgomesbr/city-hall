// Converte a árvore REAL que o react-test-renderer produz para os componentes do
// aplicativo de campo (estilos já achatados) em uma página HTML e fotografa com
// o Playwright, em 390 px de largura, no tema claro e no escuro.
//
// NÍVEL DE PROVA (diga isto sempre que citar a captura): é a árvore de verdade
// dos componentes alterados, com os estilos e textos reais, desenhada pelo motor
// de layout do Chromium (flexbox) e não pelo Yoga do React Native. Não é a tela
// do aparelho nem do emulador. Diferenças esperadas: fonte (o aparelho usa a do
// sistema), antialiasing, o visor da câmera (aqui um bloco preto) e a barra de
// abas do roteador, que não entra nesta árvore.
//
// uso: node arvore-para-html.mjs <pasta-das-arvores> <pasta-de-saida>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const [, , PASTA_ARVORES, PASTA_SAIDA] = process.argv;
mkdirSync(PASTA_SAIDA, { recursive: true });
const require = createRequire("/Users/rafaelgomes/Documents/city-hall/dc360/package.json");
const { chromium } = require("playwright");

const FUNDO = { light: "#F5F7F8", dark: "#101519" };
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const argb = (p) => {
  const n = p >>> 0;
  return `rgba(${(n >>> 16) & 255},${(n >>> 8) & 255},${n & 255},${(((n >>> 24) & 255) / 255).toFixed(3)})`;
};
const px = (v) => (typeof v === "number" ? `${v}px` : v);

function cssDe(s, pai) {
  const c = [];
  const u = (k, v) => c.push(`${k}:${v}`);
  const PX = {
    width: "width", height: "height", minWidth: "min-width", minHeight: "min-height", maxWidth: "max-width",
    padding: "padding", paddingHorizontal: null, paddingVertical: null, paddingTop: "padding-top",
    paddingBottom: "padding-bottom", paddingLeft: "padding-left", paddingRight: "padding-right",
    margin: "margin", marginTop: "margin-top", marginBottom: "margin-bottom", marginLeft: "margin-left",
    marginRight: "margin-right", gap: "gap", top: "top", left: "left", right: "right", bottom: "bottom",
    borderRadius: "border-radius", borderWidth: "border-width", borderLeftWidth: "border-left-width",
    borderRightWidth: "border-right-width", borderTopWidth: "border-top-width", borderBottomWidth: "border-bottom-width",
    fontSize: "font-size", lineHeight: "line-height", letterSpacing: "letter-spacing",
  };
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue;
    if (k in PX && PX[k]) u(PX[k], px(v));
    else if (k === "paddingHorizontal") { u("padding-left", px(v)); u("padding-right", px(v)); }
    else if (k === "paddingVertical") { u("padding-top", px(v)); u("padding-bottom", px(v)); }
    else if (k === "marginHorizontal") { u("margin-left", px(v)); u("margin-right", px(v)); }
    else if (k === "marginVertical") { u("margin-top", px(v)); u("margin-bottom", px(v)); }
    else if (k === "backgroundColor") u("background-color", v);
    else if (k === "borderColor") u("border-color", v);
    else if (/^border(Left|Right|Top|Bottom)Color$/.test(k)) u(k.replace(/([A-Z])/g, "-$1").toLowerCase(), v);
    else if (k === "color") u("color", v);
    else if (k === "fontWeight") u("font-weight", v);
    else if (k === "flexDirection") u("flex-direction", v);
    else if (k === "alignItems") u("align-items", v);
    else if (k === "alignSelf") u("align-self", v);
    else if (k === "justifyContent") u("justify-content", v);
    else if (k === "flexWrap") u("flex-wrap", v);
    else if (k === "flex") u("flex", v === 0 ? "0 0 auto" : `${v} 1 0%`);
    else if (k === "flexGrow") u("flex-grow", v);
    else if (k === "flexShrink") u("flex-shrink", v);
    else if (k === "position") u("position", v);
    else if (k === "opacity") u("opacity", v);
    else if (k === "overflow") u("overflow", v);
    else if (k === "textAlign") u("text-align", v);
    else if (k === "textTransform") u("text-transform", v);
    else if (k === "fontFamily") u("font-family", /system/i.test(v) ? `-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif` : v);
    else if (k === "transform") u("transform", v.map((t) => Object.entries(t).map(([n, x]) => `${n}(${typeof x === "number" && /translate/.test(n) ? x + "px" : x})`).join(" ")).join(" "));
  }
  if (s.shadowColor && s.shadowOpacity) {
    const o = s.shadowOffset ?? { width: 0, height: 0 };
    u("box-shadow", `${o.width}px ${o.height}px ${s.shadowRadius ?? 0}px ${s.shadowColor}${""}`);
    c.push(`filter:none`);
    c.push(`--sombra-opacidade:${s.shadowOpacity}`);
  }
  if (s.borderWidth || s.borderLeftWidth || s.borderTopWidth || s.borderRightWidth || s.borderBottomWidth) u("border-style", "solid");
  return c.join(";");
}

let contadorDeGradiente = 0;
function render(n, pai = "View") {
  if (n === null || n === undefined) return "";
  if (typeof n === "string") return esc(n);
  if (Array.isArray(n)) return n.map((x) => render(x, pai)).join("");
  const filhos = (n.children ?? []).map((f) => render(f, n.type)).join("");
  const css = cssDe(n.style ?? {}, pai);
  const rotulo = n.props?.accessibilityLabel ? ` data-rotulo="${esc(n.props.accessibilityLabel)}"` : "";
  switch (n.type) {
    case "Text": {
      const ate = n.props?.numberOfLines;
      const corte = ate === 1 ? ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        : ate ? `;display:-webkit-box;-webkit-line-clamp:${ate};-webkit-box-orient:vertical;overflow:hidden` : "";
      return pai === "Text"
        ? `<span style="${css}">${filhos}</span>`
        : `<div style="${css};margin:0${corte}">${filhos}</div>`;
    }
    case "RCTRefreshControl": return "";
    case "RNSVGSvgView": {
      const sobreposto = n.style?.position === "absolute";
      if (sobreposto) return `<svg style="position:absolute;left:0;top:0;width:100%;height:100%" preserveAspectRatio="none">${filhos}</svg>`;
      return `<svg style="${css};flex:none" width="${n.props.width}" height="${n.props.height}" viewBox="0 0 24 24" fill="none">${filhos}</svg>`;
    }
    case "RNSVGGroup": return `<g>${filhos}</g>`;
    case "RNSVGDefs": return `<defs>${filhos}</defs>`;
    case "RNSVGLinearGradient": {
      contadorDeGradiente += 1;
      const g = n.props.gradient ?? [];
      const id = n.props.name;
      return `<linearGradient id="${id}" x1="${n.props.x1}" x2="${n.props.x2}" y1="${n.props.y1}" y2="${n.props.y2}">
        <stop offset="${g[0]}" stop-color="${argb(g[1])}"/><stop offset="${g[2]}" stop-color="${argb(g[3])}"/></linearGradient>`;
    }
    case "RNSVGRect": {
      const f = n.props.fill;
      const fill = f?.brushRef ? `url(#${f.brushRef})` : "none";
      return `<rect x="0" y="0" width="100%" height="100%" fill="${fill}"/>`;
    }
    case "RNSVGPath": case "RNSVGCircle": {
      const p = n.props;
      const traco = p.stroke?.payload !== undefined ? argb(p.stroke.payload) : "none";
      const atr = `fill="none" stroke="${traco}" stroke-width="${p.strokeWidth ?? 1}" ${p.strokeLinecap ? 'stroke-linecap="round"' : ""} ${p.strokeLinejoin ? 'stroke-linejoin="round"' : ""}`;
      return n.type === "RNSVGPath"
        ? `<path d="${p.d}" ${atr}/>`
        : `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" ${atr}/>`;
    }
    default:
      return `<div${rotulo} style="${css};display:flex;flex-direction:${n.style?.flexDirection ?? "column"};box-sizing:border-box;position:${n.style?.position ?? "relative"};flex-shrink:${n.style?.flexShrink ?? 0};min-width:0">${filhos}</div>`;
  }
}

function pagina(arvore, esquema, titulo, nivel, opcoes = {}) {
  const fundo = opcoes.fundo ?? FUNDO[esquema];
  const visor = opcoes.visor
    ? `<div style="flex:1;min-height:560px;background:#000;color:#8a8a8a;display:flex;align-items:center;justify-content:center;font:12px system-ui">visor da câmera (bloco preto: a câmera só existe no aparelho)</div>`
    : "";
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="margin:0;background:${esquema === "dark" ? "#000" : "#dfe3e6"};font-family:system-ui">
  <div style="width:390px;margin:0 auto">
    <div style="font:600 12px system-ui;color:${esquema === "dark" ? "#ddd" : "#222"};padding:8px 4px">${esc(titulo)}</div>
    <div style="width:390px;min-height:${opcoes.altura ?? 844}px;background:${fundo};display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden">
      ${visor}${render(arvore)}
    </div>
    <div style="font:11px system-ui;color:${esquema === "dark" ? "#aaa" : "#444"};padding:6px 4px">${esc(nivel)}</div>
  </div></body></html>`;
}

const NIVEL = "Prova de nível E1+: árvore real do React Native renderizada em Chromium (390 px). Não é aparelho nem emulador.";
const CASOS = [
  ["camera", "E16-voltar-sem-fotografar-sobre-o-visor", "E16, botão Voltar sem fotografar sobre o visor preto", { visor: true, altura: 700 }],
  ["fila-andando", "E16-fila-pendentes-com-a-condicao-do-aplicativo-aberto", "E16, fila: pendente com 0, 3 e 9 tentativas", { altura: 900 }],
  ["fila-pausada", "E06-fila-pausada-pela-sessao", "E06, fila pausada pela sessão encerrada", { altura: 800 }],
  ["lista-andando", "E06-lista-com-a-fila-andando", "E06, lista de tarefas com a fila andando (controle)", { altura: 1000 }],
  ["lista-sessao", "E06-lista-com-a-sessao-encerrada", "E06, faixa e cartão da tarefa com a sessão encerrada", { altura: 1000 }],
  ["lista-senha", "E06-lista-com-a-senha-provisoria", "E06, faixa e cartão da tarefa com a senha provisória", { altura: 1000 }],
];

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
const feitos = [];
for (const [arq, nome, titulo, opc] of CASOS) {
  for (const esquema of ["light", "dark"]) {
    const arvore = JSON.parse(readFileSync(`${PASTA_ARVORES}/${arq}-${esquema}.json`, "utf8"));
    const html = pagina(arvore, esquema, `${titulo} (${esquema === "light" ? "claro" : "escuro"})`, NIVEL, opc);
    await pg.setContent(html, { waitUntil: "load" });
    const saida = `${PASTA_SAIDA}/${nome}-390-${esquema === "light" ? "claro" : "escuro"}.png`;
    await pg.screenshot({ path: saida, fullPage: true });
    writeFileSync(saida.replace(/\.png$/, ".html"), html);
    feitos.push(saida);
  }
}
await nav.close();
console.log(feitos.join("\n"));
