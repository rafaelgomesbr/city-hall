// Achados 1, 2 e 4: o rótulo e o campo focados depois do erro ficam inteiros entre o topo fixo e a barra do pé?
import { WEB, EMAILS, S, CAP, api, tokenDe, navegador, contexto, entrar, registro, aVista } from "./lib.mjs";
const ROTULO = process.env.ROTULO ?? "antes";
const log = registro(`${S}/saidas/foco-${ROTULO}.txt`);
const rita = await tokenDe(EMAILS.rita);
const SENHA_INICIAL = "senha-inicial-bem-comprida-2026";
let n = 0, ruins = 0, total = 0;
const nome = (l, a, d) => `${l}x${a}${d > 1 ? "-dpr2" : ""}`;
async function contaNova(motor, rotulo) {
  n++;
  const email = `c6.${motor}.${rotulo}.${n}.${Date.now() % 100000}@serraalta.exemplo.gov.br`;
  const r = await api("/usuarios", { metodo: "POST", token: rita, corpo: { nome: `Foco ${motor} ${n}`, matricula: `C6-${n}-${Date.now() % 10000}`, email, papel: "operador", senha: SENHA_INICIAL } });
  if (r.status >= 300) throw new Error(`criar usuário: ${r.status} ${JSON.stringify(r.json)}`);
  return email;
}
function anotar(caso, motor, tam, m) { total++; if (!m.ok) ruins++; log(`[${ROTULO} ${motor} ${caso} ${tam}] ${m.ok ? "À VISTA" : "ESCONDIDO"} ${m.txt}`); }
for (const motor of (process.env.MOTORES ?? "chromium,firefox,webkit").split(",")) {
  const nav = await navegador(motor);
  // A) senha atual errada (401 do servidor), clique no botão
  for (const [l, a, d] of [[640, 450, 2], [601, 700, 1], [700, 600, 1], [768, 600, 1], [900, 600, 1], [1024, 600, 1], [1280, 600, 1], [390, 700, 1], [360, 700, 1], [320, 568, 1]]) {
    const email = await contaNova(motor, "a");
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
    await entrar(pg, email, SENHA_INICIAL);
    await pg.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("senha-que-nao-e-a-desta-conta");
    await pg.locator("#conta-senha-nova").fill("frase-nova-bem-comprida-2026");
    await pg.locator("#conta-senha-repetida").fill("frase-nova-bem-comprida-2026");
    const botao = pg.getByRole("button", { name: "Trocar senha", exact: true });
    await botao.click();
    await pg.locator("#conta-senha-atual-erro").waitFor({ timeout: 20000 });
    const h = await botao.elementHandle();
    await pg.waitForFunction((el) => !el.disabled, h, { timeout: 20000 });
    await pg.waitForTimeout(400);
    const m = await aVista(pg);
    anotar("minha-conta-senha-errada", motor, nome(l, a, d), m);
    await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-minha-conta-senha-errada-${nome(l, a, d)}-claro-${motor}.png` });
    await ctx.close();
  }
  // B) conferência da tela (senha nova curta), página no alto, Enter no último campo
  for (const [l, a, d] of [[320, 568, 1], [390, 700, 1], [640, 450, 2], [768, 600, 1]]) {
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
    await entrar(pg, EMAILS.jonas);
    await pg.goto(`${WEB}/minha-conta`, { waitUntil: "networkidle" });
    await pg.locator("#conta-senha-atual").fill("qualquer-coisa-aqui");
    await pg.locator("#conta-senha-nova").fill("curta");
    await pg.locator("#conta-senha-repetida").fill("curta");
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(150);
    await pg.locator("#conta-senha-repetida").press("Enter");
    await pg.waitForTimeout(700);
    const m = await aVista(pg);
    anotar("minha-conta-enter-pagina-no-alto", motor, nome(l, a, d), m);
    await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-minha-conta-enter-pagina-no-alto-${nome(l, a, d)}-claro-${motor}.png` });
    await ctx.close();
  }
  // C) Nova ocorrência: o nome do solicitante e Enter; o foco vai a Endereço, abaixo da janela
  for (const [l, a, d] of [[320, 640, 1], [390, 844, 1], [640, 450, 2], [768, 600, 1], [1280, 600, 1]]) {
    const { ctx, pg } = await contexto(nav, { largura: l, altura: a, dpr: d });
    await entrar(pg, EMAILS.helena);
    await pg.goto(`${WEB}/ocorrencias/nova`, { waitUntil: "networkidle" });
    await pg.locator("#nova-solicitante").click();
    await pg.locator("#nova-solicitante").fill("Joana Prado");
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(700);
    const m = await aVista(pg);
    anotar("nova-ocorrencia-enter-no-solicitante", motor, nome(l, a, d), m);
    await pg.screenshot({ path: `${CAP}/c6-${ROTULO}-nova-ocorrencia-enter-no-solicitante-${nome(l, a, d)}-claro-${motor}.png` });
    await ctx.close();
  }
  await nav.close();
}
log(`[${ROTULO}] resumo: ${total - ruins} de ${total} à vista, ${ruins} escondidos`);
