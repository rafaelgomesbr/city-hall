import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../../../dc360/apps/web/package.json", import.meta.url));
const { webkit, chromium } = require("playwright");
const html = `<a href="#x" id="a">link</a><button id="b">botão</button><input id="c">`;
for (const [nome, motor] of [["chromium", chromium], ["webkit", webkit]]) {
  const nav = await motor.launch(); const pg = await (await nav.newContext()).newPage();
  await pg.setContent(html); await pg.keyboard.press("Tab");
  const r1 = await pg.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  await pg.keyboard.press("Tab");
  const r2 = await pg.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  console.log(`${nome}: página mínima (link, botão, campo): 1º Tab -> ${r1}; 2º Tab -> ${r2}`);
  await nav.close();
}
