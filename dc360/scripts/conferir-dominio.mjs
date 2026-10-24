#!/usr/bin/env node
/**
 * Confere, contra a rede de verdade, o endereço de um ambiente (V2-F01-E10).
 *
 * ## Por que este roteiro existe
 *
 * Cada ambiente (HML, PROD) tem um painel e uma API em endereços diferentes, e
 * três coisas precisam estar certas em cada um e só aparecem quando alguém usa:
 * o certificado TLS, o redirecionamento de http para https com HSTS, e a
 * origem que a API aceita no CORS. O terceiro é o perigoso: CORS aberto demais
 * liga PROD a HML, e o painel de homologação passaria a conseguir ler dados de
 * produção com a sessão de quem estiver logado nos dois. CORS fechado demais
 * derruba o painel por uma tela em branco que ninguém explica. Nenhum teste de
 * unidade pega nenhum dos dois, porque o defeito mora na configuração do
 * provedor (Vercel, Fly), e não no código.
 *
 * ## O que ele confere, para os hosts passados por argumento
 *
 * Para o painel e para a API:
 *   1. TLS válido: a cadeia confia, o nome do certificado bate com o host e
 *      faltam ao menos 14 dias para vencer.
 *   2. `http://host/` redireciona (301, 302, 307 ou 308) para `https://host/`.
 *   3. A resposta https traz HSTS com `max-age` de pelo menos 180 dias.
 * Só no painel:
 *   4. `X-Content-Type-Options: nosniff` e `frame-ancestors` (CSP ou
 *      `X-Frame-Options`), que o `vercel.json` declara.
 * Só na API:
 *   5. O preflight CORS da origem do PRÓPRIO ambiente (o painel passado) volta
 *      com `access-control-allow-origin` igual a essa origem, exata, e com
 *      `access-control-allow-credentials: true`. Curinga reprova.
 *   6. O preflight de uma origem que não é do ambiente volta SEM
 *      `access-control-allow-origin`. A origem inventada
 *      `https://origem-invalida.example` é sempre testada; cada `--negar` soma
 *      uma origem de OUTRO ambiente (o painel de PROD contra a API de HML, e o
 *      de HML contra a de PROD, que é o cruzamento que a etapa quer negado).
 *
 * ## O que ele NÃO confere
 *
 * Não valida DNS próprio, SPF, DKIM nem DMARC (dependem de CP-04 e são da
 * F15-E14). Não confere o CORS do bucket de evidência (F06-E15). Não prova que
 * o painel entra na API: isso é o E2E do ambiente. E não muda nada em lugar
 * nenhum: só lê, com `GET` e `OPTIONS`.
 *
 * Uso, de dentro de `dc360`:
 *   node scripts/conferir-dominio.mjs --painel=HOST --api=HOST [--negar=ORIGEM ...]
 *
 * `HOST` aceita `exemplo.com.br` ou `https://exemplo.com.br`. Sem porta, sem
 * caminho, sem curinga. `--api` e `--painel` são os dois obrigatórios.
 *
 * Saída: 0 tudo confere; 1 alguma conferência falhou; 2 uso errado.
 */
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";

/** HSTS mínimo aceito: 180 dias, o que o helmet da API já manda. */
export const HSTS_MINIMO_SEGUNDOS = 15552000;
/** Margem de validade do certificado, em dias. */
export const DIAS_MINIMOS_DO_CERTIFICADO = 14;
/** Origem que nenhum ambiente pode aceitar. */
export const ORIGEM_INVENTADA = "https://origem-invalida.example";

const REDIRECIONAMENTOS = new Set([301, 302, 307, 308]);
const DIA_EM_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

/**
 * Reduz o argumento a um host DNS simples. Recusa o que não é: porta, caminho,
 * curinga, esquema que não seja https, texto vazio ou com espaço.
 */
export function normalizarHost(texto) {
  const bruto = String(texto ?? "").trim().toLowerCase();
  if (!bruto) throw new Error("host vazio");
  const semEsquema = bruto.replace(/^https:\/\//, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(semEsquema) || semEsquema.startsWith("http:")) {
    throw new Error(`"${texto}": só https é aceito, o ambiente tem de servir TLS`);
  }
  const semBarra = semEsquema.replace(/\/$/, "");
  if (semBarra.includes("*")) throw new Error(`"${texto}": curinga não é um host`);
  if (/[/?#@:\s]/.test(semBarra)) {
    throw new Error(`"${texto}": informe só o host (sem porta, caminho, usuário nem espaço)`);
  }
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(semBarra)) {
    throw new Error(`"${texto}": não é um nome de host válido`);
  }
  return semBarra;
}

/** Origem (esquema, host e nada mais) de um argumento de `--negar`. */
export function normalizarOrigem(texto) {
  const bruto = String(texto ?? "").trim().toLowerCase().replace(/\/$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/.test(bruto)) {
    throw new Error(`"${texto}": origem tem de ser esquema://host, sem caminho nem curinga`);
  }
  return bruto;
}

/** Lê os argumentos. Lança `Error` com mensagem de uso quando algo está errado. */
export function lerArgumentos(argv) {
  const achado = { painel: undefined, api: undefined, negar: [] };
  for (const arg of argv) {
    const m = /^--(painel|api|negar)=(.*)$/.exec(arg);
    if (!m) throw new Error(`argumento desconhecido: ${arg}`);
    if (m[1] === "negar") achado.negar.push(normalizarOrigem(m[2]));
    else if (achado[m[1]] !== undefined) throw new Error(`--${m[1]} repetido`);
    else achado[m[1]] = normalizarHost(m[2]);
  }
  if (!achado.painel) throw new Error("falta --painel=HOST");
  if (!achado.api) throw new Error("falta --api=HOST");
  return achado;
}

/* ------------------------------------------------------------------ */
/* Julgamentos (funções puras, uma por conferência)                    */
/* ------------------------------------------------------------------ */

/**
 * `cert`: { autorizado, erro, validoAte } como `lerCertificado` devolve.
 * `validoAte` é um texto de data ou `Date`.
 */
export function avaliarCertificado(cert, agora = new Date()) {
  if (!cert.autorizado) {
    return { ok: false, detalhe: `certificado não confiável: ${cert.erro || "motivo não informado"}` };
  }
  const fim = new Date(cert.validoAte);
  if (Number.isNaN(fim.getTime())) return { ok: false, detalhe: "validade do certificado ilegível" };
  const dias = Math.floor((fim.getTime() - agora.getTime()) / DIA_EM_MS);
  if (dias < DIAS_MINIMOS_DO_CERTIFICADO) {
    return {
      ok: false,
      detalhe: dias < 0 ? `certificado vencido há ${-dias} dia(s)` : `certificado vence em ${dias} dia(s), o mínimo é ${DIAS_MINIMOS_DO_CERTIFICADO}`,
    };
  }
  return { ok: true, detalhe: `válido, vence em ${dias} dia(s)` };
}

/** `resposta`: { status, location }. A resposta é a de `http://host/`, sem seguir o redirecionamento. */
export function avaliarRedirecionamento(resposta, host) {
  if (!REDIRECIONAMENTOS.has(resposta.status)) {
    return { ok: false, detalhe: `http://${host}/ respondeu ${resposta.status}, esperado redirecionamento para https` };
  }
  let destino;
  try {
    destino = new URL(resposta.location ?? "", `http://${host}/`);
  } catch {
    return { ok: false, detalhe: `redirecionamento sem Location legível (${resposta.location ?? "ausente"})` };
  }
  if (destino.protocol !== "https:" || destino.hostname !== host) {
    return { ok: false, detalhe: `redireciona para ${destino.origin}, esperado https://${host}` };
  }
  return { ok: true, detalhe: `${resposta.status} para ${destino.origin}` };
}

/** `valor`: o cabeçalho `strict-transport-security` ou `null`. */
export function avaliarHsts(valor) {
  if (!valor) return { ok: false, detalhe: "sem Strict-Transport-Security" };
  const m = /(?:^|;)\s*max-age\s*=\s*"?(\d+)"?/i.exec(valor);
  if (!m) return { ok: false, detalhe: `Strict-Transport-Security sem max-age (${valor})` };
  const segundos = Number(m[1]);
  if (segundos < HSTS_MINIMO_SEGUNDOS) {
    return { ok: false, detalhe: `max-age=${segundos} é menor que ${HSTS_MINIMO_SEGUNDOS} (180 dias)` };
  }
  return { ok: true, detalhe: `max-age=${segundos}` };
}

/** `h`: função `nome => valor|null` sobre os cabeçalhos da resposta do painel. */
export function avaliarCabecalhosDoPainel(h) {
  const falhas = [];
  if ((h("x-content-type-options") ?? "").toLowerCase() !== "nosniff") falhas.push("falta X-Content-Type-Options: nosniff");
  const csp = h("content-security-policy") ?? "";
  const xfo = (h("x-frame-options") ?? "").toLowerCase();
  const naoEmbute = /(^|;)\s*frame-ancestors\s+('none'|'self')/i.test(csp) || xfo === "deny" || xfo === "sameorigin";
  if (!naoEmbute) falhas.push("falta frame-ancestors (CSP) ou X-Frame-Options");
  return falhas.length ? { ok: false, detalhe: falhas.join("; ") } : { ok: true, detalhe: "nosniff e frame-ancestors presentes" };
}

/** O preflight da origem do próprio ambiente tem de ser aceito, exato e com credenciais. */
export function avaliarPreflightAceito(resposta, origem) {
  const acao = resposta.headers("access-control-allow-origin");
  if (resposta.status < 200 || resposta.status >= 300) {
    return { ok: false, detalhe: `preflight de ${origem} respondeu ${resposta.status}` };
  }
  if (acao === "*") return { ok: false, detalhe: "access-control-allow-origin é curinga (*)" };
  if (acao !== origem) return { ok: false, detalhe: `access-control-allow-origin é ${acao ?? "ausente"}, esperado ${origem}` };
  if ((resposta.headers("access-control-allow-credentials") ?? "").toLowerCase() !== "true") {
    return { ok: false, detalhe: "falta access-control-allow-credentials: true" };
  }
  return { ok: true, detalhe: `aceita exatamente ${origem}` };
}

/** O preflight de uma origem que não é do ambiente não pode devolver `access-control-allow-origin`. */
export function avaliarPreflightNegado(resposta, origem) {
  const acao = resposta.headers("access-control-allow-origin");
  if (acao !== null && acao !== undefined) {
    return { ok: false, detalhe: `${origem} recebeu access-control-allow-origin: ${acao} (status ${resposta.status})` };
  }
  return { ok: true, detalhe: `${origem} negada (status ${resposta.status}, sem access-control-allow-origin)` };
}

/* ------------------------------------------------------------------ */
/* Rede (substituível nos testes)                                      */
/* ------------------------------------------------------------------ */

/** Abre uma conexão TLS na porta 443 e devolve o que importa do certificado. */
export function lerCertificado(host, { porta = 443, tempoMs = 10_000 } = {}) {
  return new Promise((resolver, rejeitar) => {
    const socket = connect({ host, port: porta, servername: host, rejectUnauthorized: false });
    socket.setTimeout(tempoMs, () => {
      socket.destroy();
      rejeitar(new Error(`sem resposta TLS de ${host}:${porta} em ${tempoMs} ms`));
    });
    socket.once("error", rejeitar);
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const resultado = {
        autorizado: socket.authorized,
        erro: socket.authorizationError ? String(socket.authorizationError) : "",
        validoAte: cert?.valid_to,
      };
      socket.end();
      resolver(resultado);
    });
  });
}

/** `fetch` sem seguir redirecionamento, com tempo limite, devolvendo só o que se confere. */
export async function pedir(url, { method = "GET", headers = {}, tempoMs = 15_000 } = {}) {
  const resposta = await fetch(url, { method, headers, redirect: "manual", signal: AbortSignal.timeout(tempoMs) });
  await resposta.body?.cancel();
  return {
    status: resposta.status,
    location: resposta.headers.get("location"),
    headers: (nome) => resposta.headers.get(nome),
  };
}

export const REDE_REAL = { lerCertificado, pedir };

/* ------------------------------------------------------------------ */
/* Orquestração                                                        */
/* ------------------------------------------------------------------ */

/** Roda `fn` e converte falha de rede numa conferência reprovada, para uma queda não esconder as outras. */
async function tentar(fn) {
  try {
    return await fn();
  } catch (erro) {
    return { ok: false, detalhe: `erro de rede: ${erro?.cause?.code ?? erro?.code ?? ""} ${erro?.message ?? erro}`.replace(/\s+/g, " ").trim() };
  }
}

/**
 * Faz todas as conferências e devolve a lista `{ nome, ok, detalhe }`.
 * `caminhoApi` é a rota usada para HSTS e preflight na API (`/saude`).
 */
export async function conferirAmbiente(
  { painel, api, negar = [] },
  rede = REDE_REAL,
  { agora = new Date(), caminhoApi = "/saude" } = {},
) {
  const resultados = [];
  const registrar = (nome, r) => resultados.push({ nome, ok: r.ok, detalhe: r.detalhe });
  const origemDoPainel = `https://${painel}`;

  for (const [papel, host] of [["painel", painel], ["api", api]]) {
    registrar(`${papel}: TLS válido (${host})`, await tentar(async () => avaliarCertificado(await rede.lerCertificado(host), agora)));
    registrar(
      `${papel}: http redireciona para https (${host})`,
      await tentar(async () => avaliarRedirecionamento(await rede.pedir(`http://${host}/`), host)),
    );
    const https = await tentar(async () => ({ ok: true, resposta: await rede.pedir(`https://${host}${papel === "api" ? caminhoApi : "/"}`) }));
    if (!https.resposta) {
      registrar(`${papel}: HSTS (${host})`, https);
      if (papel === "painel") registrar(`${papel}: cabeçalhos de segurança (${host})`, https);
    } else {
      registrar(`${papel}: HSTS (${host})`, avaliarHsts(https.resposta.headers("strict-transport-security")));
      if (papel === "painel") registrar(`${papel}: cabeçalhos de segurança (${host})`, avaliarCabecalhosDoPainel(https.resposta.headers));
    }
  }

  const preflight = (origem) =>
    rede.pedir(`https://${api}${caminhoApi}`, {
      method: "OPTIONS",
      headers: {
        origin: origem,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  registrar(
    `api: CORS aceita só a origem do ambiente (${origemDoPainel})`,
    await tentar(async () => avaliarPreflightAceito(await preflight(origemDoPainel), origemDoPainel)),
  );
  for (const origem of [ORIGEM_INVENTADA, ...negar.filter((o) => o !== origemDoPainel)]) {
    registrar(`api: CORS nega ${origem}`, await tentar(async () => avaliarPreflightNegado(await preflight(origem), origem)));
  }
  if (negar.includes(origemDoPainel)) {
    registrar(`api: --negar não pode ser a origem do próprio painel (${origemDoPainel})`, {
      ok: false,
      detalhe: "a mesma origem não pode ser aceita e negada ao mesmo tempo; corrija os argumentos",
    });
  }
  return resultados;
}

export function formatar(resultados) {
  const linhas = resultados.map((r) => `${r.ok ? "OK    " : "FALHA "}${r.nome}: ${r.detalhe}`);
  const falhas = resultados.filter((r) => !r.ok).length;
  linhas.push("", falhas ? `${falhas} conferência(s) falharam de ${resultados.length}.` : `Todas as ${resultados.length} conferências passaram.`);
  return linhas.join("\n");
}

async function principal() {
  let alvo;
  try {
    alvo = lerArgumentos(process.argv.slice(2));
  } catch (erro) {
    console.error(`conferir-dominio: ${erro.message}`);
    console.error("uso: node scripts/conferir-dominio.mjs --painel=HOST --api=HOST [--negar=ORIGEM ...]");
    process.exit(2);
  }
  const resultados = await conferirAmbiente(alvo);
  console.log(formatar(resultados));
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
