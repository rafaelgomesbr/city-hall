// Acesso restrito à página de progresso da V2, com tela de login própria.
//
// - A senha vem da variável PROGRESSO_SENHA do projeto na Vercel; ela NUNCA fica no repositório.
// - PROGRESSO_SEGREDO (aleatório, também só na Vercel) assina o cookie de sessão. Sem ele, a senha serve de chave.
// - O cookie é HttpOnly, Secure, SameSite=Lax, vale só para /progresso e dura 30 dias. Sair apaga o cookie.
// - HTTP Basic continua aceito (curl -u qualquer:senha), para verificação e scripts. Só a senha conta.
// - Cada tentativa errada espera 1 segundo antes de responder.
export const config = { matcher: "/:path*" };

const PREFIXO = "/progresso";
const COOKIE = "progresso_sessao";
const VALIDADE_EM_SEGUNDOS = 30 * 24 * 60 * 60;
const codificador = new TextEncoder();

/* ---------- criptografia ---------- */

const emHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function resumo(texto) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", codificador.encode(texto)));
}

async function assinar(segredo, mensagem) {
  const chave = await crypto.subtle.importKey("raw", codificador.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return emHex(await crypto.subtle.sign("HMAC", chave, codificador.encode(mensagem)));
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

async function senhaConfere(informada, esperada) {
  return iguais(await resumo(informada ?? ""), await resumo(esperada));
}

async function novoCookie(segredo) {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_EM_SEGUNDOS;
  return `${expira}.${await assinar(segredo, `sessao|${expira}`)}`;
}

async function cookieValido(valor, segredo) {
  const [expira, assinatura] = String(valor ?? "").split(".");
  if (!/^\d{9,12}$/.test(expira ?? "") || !assinatura) return false;
  if (Number(expira) <= Math.floor(Date.now() / 1000)) return false;
  const esperada = await assinar(segredo, `sessao|${expira}`);
  return iguais(codificador.encode(assinatura), codificador.encode(esperada));
}

function lerCookie(request, nome) {
  for (const parte of (request.headers.get("cookie") ?? "").split(";")) {
    const [chave, ...resto] = parte.trim().split("=");
    if (chave === nome) return resto.join("=");
  }
  return null;
}

async function autenticado(request, senha, segredo) {
  if (await cookieValido(lerCookie(request, COOKIE), segredo)) return true;
  const cabecalho = request.headers.get("authorization") ?? "";
  if (cabecalho.startsWith("Basic ")) {
    try {
      const [, ...resto] = atob(cabecalho.slice(6)).split(":");
      return await senhaConfere(resto.join(":"), senha);
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------- respostas ---------- */

const CABECALHOS_BASE = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function seguir() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}

function redirecionar(destino, cabecalhos = {}) {
  return new Response(null, { status: 303, headers: { ...CABECALHOS_BASE, Location: destino, ...cabecalhos } });
}

function cookieDeSessao(valor, segundos) {
  return `${COOKIE}=${valor}; Path=${PREFIXO}; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Lax`;
}

function paginaDeLogin(erro) {
  const aviso = erro ? `<p class="erro" role="alert">${erro}</p>` : "";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>Defesa Civil 360, acesso restrito</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&family=Roboto+Mono:wght@500&display=swap">
<style>
:root { --bg: #F6F5FA; --superficie: #FFFFFF; --texto: #1B1730; --suave: #655F7C; --linha: #D9D5E8; --destaque: #5B2BC0; --destaque-sobre: #FFFFFF; --suave-destaque: #EEE8FB; --erro: #B3261E; --erro-fundo: #FBE9E7; --sombra: 0 1px 2px rgba(27,23,48,.06), 0 16px 40px rgba(27,23,48,.10); }
@media (prefers-color-scheme: dark) { :root { --bg: #14111F; --superficie: #1D1830; --texto: #EDEAF7; --suave: #A29DB8; --linha: #3A3452; --destaque: #A98BFF; --destaque-sobre: #14111F; --suave-destaque: #2A2145; --erro: #FFB4AB; --erro-fundo: #3F1B1B; --sombra: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px rgba(0,0,0,.4); } }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--texto); font-family: "Work Sans", system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.5; display: grid; place-items: center; padding: 24px 16px; }
main { width: 100%; max-width: 420px; }
.cartao { background: var(--superficie); border: 1px solid var(--linha); border-radius: 18px; box-shadow: var(--sombra); padding: 32px 28px 28px; display: flex; flex-direction: column; gap: 20px; }
.marca { display: flex; align-items: center; gap: 12px; font-weight: 700; }
.brasao { width: 40px; height: 40px; border-radius: 11px; background: var(--destaque); color: var(--destaque-sobre); display: grid; place-items: center; font-size: .9rem; font-weight: 800; }
.chave { display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--suave-destaque); color: var(--destaque); }
h1 { margin: 0; font-size: 1.65rem; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; text-wrap: balance; }
.sub { margin: 6px 0 0; color: var(--suave); font-size: .95rem; }
form { display: flex; flex-direction: column; gap: 14px; }
label { font-size: .85rem; font-weight: 600; }
.campo { position: relative; display: flex; }
input { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1.5px solid var(--linha); border-radius: 12px; padding: 13px 76px 13px 14px; min-height: 48px; }
input:focus-visible, button:focus-visible { outline: 3px solid var(--destaque); outline-offset: 2px; }
input:focus-visible { outline-offset: 0; border-color: var(--destaque); }
.ver { position: absolute; right: 6px; top: 6px; bottom: 6px; border: 0; background: transparent; color: var(--destaque); font: inherit; font-size: .85rem; font-weight: 600; padding: 0 10px; border-radius: 8px; cursor: pointer; }
.ver:hover { background: var(--suave-destaque); }
.entrar { font: inherit; font-weight: 700; min-height: 48px; border: 0; border-radius: 12px; background: var(--destaque); color: var(--destaque-sobre); cursor: pointer; transition: transform .12s ease, filter .12s ease; }
.entrar:hover { filter: brightness(1.08); }
.entrar:active { transform: translateY(1px); }
.erro { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--erro-fundo); color: var(--erro); font-size: .9rem; font-weight: 500; }
.rodape { text-align: center; color: var(--suave); font-size: .8rem; margin: 18px 0 0; }
@media (prefers-reduced-motion: reduce) { .entrar { transition: none; } }
</style>
</head>
<body>
<main>
  <section class="cartao" aria-labelledby="titulo">
    <div class="marca"><div class="brasao" aria-hidden="true">DC</div> Defesa Civil 360</div>
    <div>
      <span class="chave" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
      <h1 id="titulo" style="margin-top:14px">Progresso da V2</h1>
      <p class="sub">Acesso restrito. Digite a senha para ver o relatório.</p>
    </div>
    <form method="post" action="${PREFIXO}/entrar">
      ${aviso}
      <div>
        <label for="senha">Senha</label>
        <div class="campo" style="margin-top:6px">
          <input id="senha" name="senha" type="password" autocomplete="current-password" required autofocus ${erro ? 'aria-invalid="true"' : ""}>
          <button class="ver" type="button" id="ver" aria-controls="senha" aria-pressed="false">Mostrar</button>
        </div>
      </div>
      <button class="entrar" type="submit">Entrar</button>
    </form>
  </section>
  <p class="rodape">Relatório interno entre sócios.</p>
</main>
<script>
(function () {
  var campo = document.getElementById("senha");
  var botao = document.getElementById("ver");
  botao.addEventListener("click", function () {
    var mostrando = campo.type === "text";
    campo.type = mostrando ? "password" : "text";
    botao.textContent = mostrando ? "Mostrar" : "Ocultar";
    botao.setAttribute("aria-pressed", mostrando ? "false" : "true");
    campo.focus();
  });
})();
</script>
</body>
</html>`;
  // 200 (e não 401) para a tela de login não aparecer como erro no console do navegador; o conteúdo protegido
  // continua inacessível sem sessão (imagens e demais caminhos respondem 401).
  return new Response(html, {
    status: 200,
    headers: {
      ...CABECALHOS_BASE,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function acessoNegado() {
  return new Response("Acesso restrito.", { status: 401, headers: { ...CABECALHOS_BASE, "Content-Type": "text/plain; charset=utf-8" } });
}

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/* ---------- entrada ---------- */

export default async function middleware(request) {
  const senha = process.env.PROGRESSO_SENHA;
  if (!senha) return new Response("Configuração incompleta.", { status: 503, headers: CABECALHOS_BASE });
  const segredo = process.env.PROGRESSO_SEGREDO || senha;
  const caminho = new URL(request.url).pathname;

  if (caminho === `${PREFIXO}/sair`) {
    return redirecionar(PREFIXO, { "Set-Cookie": cookieDeSessao("", 0) });
  }

  if (caminho === `${PREFIXO}/entrar`) {
    if (request.method !== "POST") return redirecionar(PREFIXO);
    let informada = "";
    try {
      informada = String((await request.formData()).get("senha") ?? "");
    } catch {
      informada = "";
    }
    if (await senhaConfere(informada, senha)) {
      return redirecionar(PREFIXO, { "Set-Cookie": cookieDeSessao(await novoCookie(segredo), VALIDADE_EM_SEGUNDOS) });
    }
    await espera(1000);
    return paginaDeLogin("Senha incorreta. Confira e tente de novo.");
  }

  if (await autenticado(request, senha, segredo)) return seguir();

  if (caminho === PREFIXO || caminho === `${PREFIXO}/`) return paginaDeLogin("");
  return acessoNegado();
}
