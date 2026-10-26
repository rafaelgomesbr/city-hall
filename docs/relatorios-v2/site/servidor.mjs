// Servidor da página de progresso da V2 para o Fly (alternativa à Vercel, que limita 100 deploys por dia).
//
// Reaproveita `middleware.js` sem copiar nada: ele é escrito com Request e Response da web, que o Node 22 já tem.
// Quem decide se a pessoa entra (senha, cookie assinado, tela de login, sair) é ele; este arquivo só entrega
// os arquivos de `progresso/` quando ele responde "siga" (cabeçalho x-middleware-next).
//
// Variáveis: PROGRESSO_SENHA e PROGRESSO_SEGREDO (só como segredo do Fly, nunca em arquivo), PORT (padrão 8080).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import middleware from "./middleware.js";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT ?? 8080);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// Os mesmos cabeçalhos do vercel.json.
const CABECALHOS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-cache, must-revalidate",
  "Strict-Transport-Security": "max-age=31536000",
};

/** Caminho da URL para o arquivo em disco, ou null se sair da pasta do site. */
export function arquivoDoCaminho(caminho, raiz = RAIZ) {
  let c = caminho.replace(/\/+$/, "") || "/";
  if (!extname(c)) c += "/index.html";
  const arquivo = normalize(join(raiz, c));
  return arquivo.startsWith(normalize(raiz) + sep) ? arquivo : null;
}

function paraRequest(req) {
  const origem = `https://${req.headers.host ?? "localhost"}`;
  const cabecalhos = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) cabecalhos.set(k, Array.isArray(v) ? v.join(", ") : v);
  // Atrás do proxy do Fly o esquema é https; o middleware só lê o caminho e os cabeçalhos.
  const temCorpo = req.method !== "GET" && req.method !== "HEAD";
  return new Request(new URL(req.url, origem), {
    method: req.method,
    headers: cabecalhos,
    ...(temCorpo ? { body: Readable.toWeb(req), duplex: "half" } : {}),
  });
}

async function enviar(res, resposta) {
  const cabecalhos = {};
  for (const [k, v] of resposta.headers) cabecalhos[k] = v;
  const setCookie = resposta.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cabecalhos["set-cookie"] = setCookie;
  delete cabecalhos["x-middleware-next"];
  res.writeHead(resposta.status, cabecalhos);
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

export function criarServidor({ raiz = RAIZ } = {}) {
  return createServer(async (req, res) => {
    try {
      const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (caminho === "/saude") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("ok");
        return;
      }
      if (caminho === "/" || caminho === "") {
        res.writeHead(303, { Location: "/progresso", "Cache-Control": "no-store" }).end();
        return;
      }
      const resposta = await middleware(paraRequest(req));
      if (resposta.headers.get("x-middleware-next") !== "1") {
        await enviar(res, resposta);
        return;
      }
      const arquivo = caminho.startsWith("/progresso") ? arquivoDoCaminho(caminho, raiz) : null;
      if (!arquivo) {
        res.writeHead(404, { ...CABECALHOS, "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
        return;
      }
      const dados = await readFile(arquivo);
      res.writeHead(200, { ...CABECALHOS, "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : dados);
    } catch (erro) {
      const naoAchou = erro?.code === "ENOENT" || erro?.code === "EISDIR";
      res.writeHead(naoAchou ? 404 : 500, { ...CABECALHOS, "Content-Type": "text/plain; charset=utf-8" }).end(naoAchou ? "Não encontrado" : "Erro interno");
      if (!naoAchou) console.error(erro);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  criarServidor().listen(PORTA, "0.0.0.0", () => console.log(`Página de progresso em 0.0.0.0:${PORTA}`));
}
