// Acesso restrito por senha (HTTP Basic) para a página de progresso da V2.
// A senha vem da variável PROGRESSO_SENHA do projeto na Vercel; ela NUNCA fica no repositório.
// Qualquer nome de usuário é aceito: só a senha conta.
export const config = { matcher: "/:path*" };

const codificador = new TextEncoder();

async function resumo(texto) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", codificador.encode(texto)));
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

export default async function middleware(request) {
  const esperada = process.env.PROGRESSO_SENHA;
  if (!esperada) {
    return new Response("Configuração incompleta.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const cabecalho = request.headers.get("authorization") ?? "";
  if (cabecalho.startsWith("Basic ")) {
    try {
      const [, ...resto] = atob(cabecalho.slice(6)).split(":");
      const informada = resto.join(":");
      if (iguais(await resumo(informada), await resumo(esperada))) {
        return new Response(null, { headers: { "x-middleware-next": "1" } });
      }
    } catch {
      // credencial malformada: cai na resposta de acesso negado
    }
  }
  return new Response("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Progresso da V2", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
