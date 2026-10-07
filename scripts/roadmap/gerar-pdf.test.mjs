import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { executarCli } from "./apoio-de-teste.mjs";
import { contarPaginas, gerarPdf, requisicaoPermitida } from "./gerar-pdf.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = join(AQUI, "..", "..", "docs", "relatorios-v2", "modelo", "relatorio.css");
const BOM = readFileSync(join(AQUI, "fixtures", "relatorio", "bom.html"), "utf8");

let navegadorOk = true;
let motivo = "";
let pasta;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerar-pdf-"));
  try {
    const html = join(pasta, "sonda.html");
    writeFileSync(html, "<!doctype html><title>sonda</title><p>oi</p>");
    await gerarPdf({ html, pdf: join(pasta, "sonda.pdf") });
  } catch (e) {
    navegadorOk = false;
    motivo = e.message;
  }
});

test("requisicaoPermitida: só o arquivo local, dados e a fonte do Google", () => {
  assert.equal(requisicaoPermitida("file:///C:/x/relatorio.html"), true);
  assert.equal(requisicaoPermitida("data:image/png;base64,AAAA"), true);
  assert.equal(requisicaoPermitida("https://fonts.googleapis.com/css2?family=Work+Sans"), true);
  assert.equal(requisicaoPermitida("https://fonts.gstatic.com/s/worksans/v1/x.woff2"), true);
  assert.equal(requisicaoPermitida("https://cdn.example.com/lib.js"), false);
  assert.equal(requisicaoPermitida("https://fonts.googleapis.com.invasor.example/x"), false);
  assert.equal(requisicaoPermitida("http://localhost:4000/api"), false);
  assert.equal(requisicaoPermitida("isto nao e url"), false);
});

test("contarPaginas: conta /Type /Page e ignora /Type /Pages", () => {
  const falso = Buffer.from("<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page /Parent 1 0 R >>", "latin1");
  assert.equal(contarPaginas(falso), 2);
  assert.equal(contarPaginas(Buffer.from("nada")), 0);
});

test("gera o PDF do relatório com bytes, páginas, SHA-256, cabeçalho e numeração do @page", async (t) => {
  if (!navegadorOk) return t.skip(`Chromium indisponível: ${motivo}`);
  const html = join(pasta, "relatorio.html");
  // O relatório da fixture aponta para ../modelo/relatorio.css, que aqui não existe: aponta para o CSS real.
  writeFileSync(
    html,
    BOM.replace(`<link rel="stylesheet" href="../modelo/relatorio.css">`, `<link rel="stylesheet" href="${pathToFileURL(CSS).href}"><style>:root { --cabecalho-pagina: "Defesa Civil 360 | Teste"; }</style>`),
  );
  const pdf = join(pasta, "relatorio.pdf");
  const r = await gerarPdf({ html, pdf });
  assert.ok(existsSync(pdf));
  assert.ok(r.bytes > 5000, `PDF pequeno demais: ${r.bytes}`);
  assert.ok(r.paginas >= 1);
  assert.equal(r.vazio, false);
  assert.deepEqual(r.errosDeConsole, []);
  assert.deepEqual(r.requisicoesRecusadas, []);
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
  assert.equal(r.reprovado, false);
  assert.equal(readFileSync(pdf).subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(contarPaginas(readFileSync(pdf)), r.paginas);

  // Quando o pdftotext existe, confere o texto do cabeçalho e a numeração (margin boxes do @page).
  let texto = null;
  try {
    texto = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
  } catch {
    texto = null;
  }
  if (texto !== null) {
    assert.match(texto, /Defesa Civil 360 \| Teste/);
    assert.match(texto, /P.gina 1 de \d+/);
  }
});

test("reprova requisição de rede fora da regra (e a recusa, em vez de baixar)", async (t) => {
  if (!navegadorOk) return t.skip(`Chromium indisponível: ${motivo}`);
  const html = join(pasta, "rede.html");
  writeFileSync(html, `<!doctype html><title>rede</title><p>x</p><img src="https://cdn.example.com/tracker.png" alt="">`);
  const r = await gerarPdf({ html, pdf: join(pasta, "rede.pdf") });
  assert.deepEqual(r.requisicoesRecusadas, ["https://cdn.example.com/tracker.png"]);
  assert.equal(r.reprovado, true);
});

test("reprova erro de console", async (t) => {
  if (!navegadorOk) return t.skip(`Chromium indisponível: ${motivo}`);
  const html = join(pasta, "erro.html");
  writeFileSync(html, `<!doctype html><title>erro</title><p>x</p><script>console.error("quebrou"); throw new Error("de proposito");</script>`);
  const r = await gerarPdf({ html, pdf: join(pasta, "erro.pdf") });
  assert.ok(r.errosDeConsole.length >= 2, JSON.stringify(r.errosDeConsole));
  assert.equal(r.reprovado, true);
});

test("--exigir-fontes reprova quando a fonte não carrega (sem rede, ela cai no fallback)", async (t) => {
  if (!navegadorOk) return t.skip(`Chromium indisponível: ${motivo}`);
  const html = join(pasta, "fonte.html");
  // Pede uma fonte que não existe localmente nem na rede permitida: o check do navegador diz que não carregou.
  writeFileSync(html, `<!doctype html><title>f</title><style>@font-face{font-family:"Work Sans";src:url("file:///nao-existe.woff2")}</style><p style="font-family:'Work Sans'">x</p>`);
  const r = await gerarPdf({ html, pdf: join(pasta, "fonte.pdf"), exigirFontes: true });
  assert.equal(r.fonteOk, false);
  assert.equal(r.reprovado, true);
});

test("CLI: arquivo inexistente e uso errado saem com código 2; sucesso sai com 0 e imprime bytes e páginas", async (t) => {
  assert.equal(executarCli("gerar-pdf.mjs", []).codigo, 2);
  assert.equal(executarCli("gerar-pdf.mjs", [join(pasta, "nao-existe.html")]).codigo, 2);
  assert.equal(executarCli("gerar-pdf.mjs", [join(pasta, "x.html"), "--inventado"]).codigo, 2);
  assert.equal(executarCli("gerar-pdf.mjs", [join(pasta, "x.html"), "--pdf"]).codigo, 2);
  if (!navegadorOk) return t.skip(`Chromium indisponível: ${motivo}`);
  const html = join(pasta, "cli.html");
  const pdf = join(pasta, "cli-saida.pdf");
  writeFileSync(html, "<!doctype html><title>cli</title><h1>Olá</h1>");
  const r = executarCli("gerar-pdf.mjs", [html, "--pdf", pdf]);
  assert.equal(r.codigo, 0, r.erro + r.saida);
  assert.match(r.saida, /\d+ bytes, \d+ páginas, erros de console: 0/);
  assert.match(r.saida, /SHA-256: [0-9a-f]{64}/);
  assert.ok(existsSync(pdf));
});

after(() => {
  rmSync(pasta, { recursive: true, force: true });
});
