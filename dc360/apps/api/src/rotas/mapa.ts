import { request as requisitarHttp } from "node:http";
import { request as requisitarHttps } from "node:https";
import { lookup as consultarNome } from "node:dns/promises";
import { isIP } from "node:net";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CASAS_DE_COORDENADA, lerLocalizacao } from "@dc360/shared";
import { RegraDeNegocio, autorizar } from "../servidor.js";

/**
 * O LINK CURTO DO GOOGLE MAPS, aberto pelo servidor a pedido do coordenador.
 *
 * ## Por que esta rota existe
 *
 * O reclame de quem paga, na letra: "o campo localização do mapa ao abrir a
 * ocorrência tem que aceitar link curto do gmaps, hoje não tá aceitando". O
 * link que chega pelo WhatsApp é `maps.app.goo.gl/...`, e ele não carrega a
 * coordenada dentro dele: ela só aparece depois que alguém segue o
 * redirecionamento. O painel recusava de propósito, e dizia por quê: seguir o
 * link a partir do navegador do coordenador expõe a máquina dele (a requisição
 * sai da rede interna da prefeitura, com os cookies e o alcance de rede dela),
 * e seguir a partir do servidor, feito de qualquer jeito, é uma ferramenta de
 * requisição forjada do lado servidor. `apps/web/PENDENCIAS.md` seção 2
 * escreveu a especificação para o dia em que a rota fosse feita, e este
 * arquivo é ela, item a item.
 *
 * ## O que sai daqui, e para onde
 *
 * O link, e só ele, para o encurtador do Google e para o Google Maps. É o
 * servidor da prefeitura contando ao Google que aquele ponto foi consultado,
 * e por isso a tela pede um ato explícito (o botão "Descobrir o ponto"), nunca
 * automático. Está declarado em `docs/SUBPROCESSADORES.md`, seção 2.2.
 *
 * ## O que NÃO fica aqui: nada
 *
 * A rota é resposta, não registro. O link não vai para o banco, nem para o
 * log, nem para cache: cada pedido é uma consulta, e a coordenada que volta
 * é gravada pela abertura da ocorrência, se e quando a pessoa gravar.
 *
 * ## As defesas, na ordem em que acontecem
 *
 * 1. **Lista fechada de encurtador** (`maps.app.goo.gl` e `goo.gl`, mais
 *    nada), conferida no texto da URL, ANTES de consultar nome ou conectar.
 *    Só `https:`, sem usuário na URL, sem porta.
 * 2. **A cada salto**: o host precisa estar na lista de encurtadores ou de
 *    destinos do Google Maps; o nome é resolvido; o ENDEREÇO resolvido é
 *    conferido contra as faixas privada, de retorno local, link-local (onde
 *    mora o serviço de metadados de nuvem) e não roteável; e a conexão é
 *    feita NESSE endereço, por um `lookup` fixo, sem uma segunda consulta ao
 *    DNS que pudesse responder outra coisa.
 * 3. **Tetos**: quatro saltos, cinco segundos no total, e nenhum corpo lido:
 *    a conexão é derrubada assim que os cabeçalhos chegam.
 * 4. **O destino final** só pode ser um domínio do Google Maps, e a
 *    coordenada é lida da URL final pelo MESMO leitor do painel
 *    (`lerLocalizacao`, do pacote compartilhado). URL final sem coordenada
 *    legível (o Google às vezes redireciona para uma busca por nome) responde
 *    que o link não aponta para um ponto: nome não é ponto, e transformar um
 *    no outro seria geocodificação, que este produto não faz.
 */

/** Os únicos hosts que um link colado pode ter. Lista fechada, de propósito. */
export const ENCURTADORES_ACEITOS = ["maps.app.goo.gl", "goo.gl"] as const;

/**
 * Os únicos hosts em que o link pode TERMINAR. `maps.app.goo.gl` e `goo.gl`
 * são aceitos como salto intermediário (o `goo.gl` antigo redireciona para o
 * novo antes de chegar ao mapa), mas terminar neles é o encurtador não tendo
 * levado a lugar nenhum.
 */
export const DESTINOS_DO_GOOGLE_MAPS = [
  "www.google.com", "google.com", "maps.google.com", "www.google.com.br", "google.com.br",
] as const;

/** Quantos redirecionamentos a rota segue. O quinto é recusado sem ser seguido. */
export const TETO_DE_SALTOS = 4;

/** Teto de tempo para a cadeia INTEIRA de saltos, e não por salto. */
export const TEMPO_LIMITE_MS = 5_000;

/** Teto do link colado. Um link curto tem cinquenta caracteres; quinhentos é folga. */
const TETO_DA_URL = 500;

/**
 * Parâmetros que o Google pendura na URL final para saber de onde o clique
 * veio. Não dizem nada sobre o ponto, e devolvê-los ao painel seria devolver
 * rastreio: a URL final volta sem eles.
 */
const PARAMETROS_DE_RASTREAMENTO = new Set([
  "g_st", "g_ep", "entry", "shorturl", "coh", "fbclid", "gclid", "ved", "usg",
]);

/* ============================================================
   A régua de endereço: o que é público e o que não é
   ============================================================ */

function ipv4ParaNumero(texto: string): number | null {
  const partes = texto.split(".");
  if (partes.length !== 4) return null;
  let numero = 0;
  for (const parte of partes) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const valor = Number(parte);
    if (valor > 255) return null;
    numero = numero * 256 + valor;
  }
  return numero >>> 0;
}

/**
 * As faixas IPv4 que a rota nunca conecta, com o prefixo de cada uma.
 *
 * Privadas (RFC 1918), retorno local, link-local (169.254.0.0/16, que é onde
 * mora o serviço de metadados de nuvem, o alvo clássico), o espaço partilhado
 * de operadora (100.64.0.0/10), as faixas de documentação e de teste, as
 * reservadas, multicast e "esta rede" (0.0.0.0/8).
 */
const FAIXAS_V4_RECUSADAS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4Publico(numero: number): boolean {
  return !FAIXAS_V4_RECUSADAS.some(([base, bits]) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((numero & mascara) >>> 0) === ((ipv4ParaNumero(base)! & mascara) >>> 0);
  });
}

/** Oito grupos de dezesseis bits, com o `::` expandido e o IPv4 embutido convertido. */
function ipv6ParaGrupos(texto: string): number[] | null {
  let limpo = texto;
  const zona = limpo.indexOf("%");
  if (zona >= 0) limpo = limpo.slice(0, zona);

  const ultimo = limpo.lastIndexOf(":");
  const cauda = limpo.slice(ultimo + 1);
  if (cauda.includes(".")) {
    const v4 = ipv4ParaNumero(cauda);
    if (v4 === null) return null;
    limpo = `${limpo.slice(0, ultimo + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const metades = limpo.split("::");
  if (metades.length > 2) return null;
  const cabeca = metades[0] ? metades[0].split(":") : [];
  const rabo = metades.length === 2 && metades[1] ? metades[1].split(":") : [];
  const faltam = 8 - cabeca.length - rabo.length;
  if (metades.length === 2 ? faltam < 1 : faltam !== 0) return null;

  const grupos = [
    ...cabeca,
    ...(metades.length === 2 ? Array<string>(faltam).fill("0") : []),
    ...rabo,
  ].map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : Number.NaN));
  if (grupos.length !== 8 || grupos.some(Number.isNaN)) return null;
  return grupos;
}

function ipv6Publico(grupos: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = grupos as [number, number, number, number, number, number, number, number];
  const embutido = (alto: number, baixo: number) => ipv4Publico(((alto << 16) | baixo) >>> 0);

  // `::`, `::1` e o IPv4 compatível (`::a.b.c.d`): os seis primeiros grupos zerados.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0) return embutido(g6, g7);
    // `::ffff:a.b.c.d`, o IPv4 mapeado: é o IPv4 que decide.
    if (g5 === 0xffff) return embutido(g6, g7);
  }
  // `64:ff9b::/96`, NAT64: o IPv4 está nos dois últimos grupos.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return embutido(g6, g7);
  }
  // `2002::/16`, 6to4: o IPv4 está no segundo e no terceiro grupo.
  if (g0 === 0x2002) return embutido(g1, g2);
  // Endereço local único (`fc00::/7`), link-local (`fe80::/10`), multicast
  // (`ff00::/8`) e documentação (`2001:db8::/32`).
  if ((g0 & 0xfe00) === 0xfc00) return false;
  if ((g0 & 0xffc0) === 0xfe80) return false;
  if ((g0 & 0xff00) === 0xff00) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  return true;
}

/**
 * Se um endereço já resolvido pode receber uma conexão desta rota.
 *
 * Recebe o ENDEREÇO, nunca o nome: conferir o texto da URL não protege, porque
 * o nome resolve para outro endereço na hora da conexão, e é o endereço que
 * importa. O que não é endereço não é público, por construção.
 */
export function enderecoPublico(endereco: string): boolean {
  const versao = isIP(endereco);
  if (versao === 4) {
    const numero = ipv4ParaNumero(endereco);
    return numero !== null && ipv4Publico(numero);
  }
  if (versao === 6) {
    const grupos = ipv6ParaGrupos(endereco);
    return grupos !== null && ipv6Publico(grupos);
  }
  return false;
}

/* ============================================================
   A rede: nome, conexão no endereço conferido, só cabeçalhos
   ============================================================ */

/** Resolve um nome para UM endereço. Injetável: o teste dubla o DNS. */
export type Lookup = (nome: string) => Promise<{ address: string; family: number }>;

/**
 * Faz UMA requisição e devolve só status e `Location`. Injetável: o teste
 * dubla a rede e guarda para onde cada conexão foi.
 */
export type BuscarCabecalhos = (
  url: URL,
  opcoes: { endereco: string; familia: 4 | 6; signal: AbortSignal },
) => Promise<{ status: number; location: string | null }>;

/** A forma que o `net` exige de um `lookup`, sem depender do tipo do `dns`. */
type LookupDoNet = (
  nome: string,
  opcoes: { all?: boolean | undefined },
  cb: (
    erro: NodeJS.ErrnoException | null,
    endereco: string | Array<{ address: string; family: number }>,
    familia?: number,
  ) => void,
) => void;

/**
 * O `lookup` que o `net` chama para abrir o socket, respondendo SEMPRE o
 * endereço já conferido, para qualquer nome.
 *
 * É esta função que fecha a janela entre conferir e conectar: sem ela, o
 * `https.request` faria a própria consulta de DNS, e um nome que respondeu um
 * endereço público na conferência pode responder um privado um milissegundo
 * depois (é o ataque de religação de DNS). O nome continua indo no SNI e no
 * cabeçalho `Host`, porque é o `https.request` que os monta a partir da URL.
 *
 * Duas formas de resposta, porque o `net` pede das duas: com `all: true`
 * (que é o que ele faz com `autoSelectFamily`, o padrão desde o Node 20) ele
 * espera uma lista; sem, espera endereço e família.
 */
export function lookupFixo(endereco: string, familia: 4 | 6): LookupDoNet {
  return (_nome, opcoes, cb) => {
    if (opcoes.all) cb(null, [{ address: endereco, family: familia }]);
    else cb(null, endereco, familia);
  };
}

/**
 * A camada de rede de produção: uma requisição, no endereço conferido, e a
 * conexão derrubada assim que os cabeçalhos chegam.
 *
 * `GET` e não `HEAD`, porque encurtador nem sempre responde `HEAD` igual, e
 * o corpo não é lido de qualquer jeito: `res.destroy()` no primeiro evento.
 * `agent: false` para não haver socket reaproveitado de uma conexão anterior.
 *
 * Aceita `http:` por UMA razão: o teste precisa provar, com um socket de
 * verdade e sem certificado, que a conexão vai para o endereço conferido e
 * não para o DNS. A rota nunca chega aqui com `http:`: a lista fechada e a
 * conferência de cada salto exigem `https:` antes.
 */
export const buscarCabecalhosPorHttp: BuscarCabecalhos = (url, { endereco, familia, signal }) =>
  new Promise((resolver, rejeitar) => {
    const requisitar = url.protocol === "http:" ? requisitarHttp : requisitarHttps;
    const req = requisitar(url, {
      method: "GET",
      agent: false,
      lookup: lookupFixo(endereco, familia),
      signal,
      headers: {
        "user-agent": "DC360/1 (link de mapa)",
        "accept": "text/html",
        "accept-language": "pt-BR",
      },
    }, (res) => {
      const location = res.headers.location;
      resolver({
        status: res.statusCode ?? 0,
        location: typeof location === "string" && location !== "" ? location : null,
      });
      res.destroy();
    });
    req.on("error", rejeitar);
    req.end();
  });

/* ============================================================
   As regras sobre a URL
   ============================================================ */

function urlLimpa(texto: string): URL | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;
  return url;
}

/** O link colado, se ele for de um encurtador da lista. */
function linkEncurtadoAceito(texto: string): URL | null {
  const url = urlLimpa(texto);
  if (!url) return null;
  return (ENCURTADORES_ACEITOS as readonly string[]).includes(url.hostname) ? url : null;
}

/** Um salto para o qual a rota aceita seguir. */
function saltoAceito(url: URL): boolean {
  return (ENCURTADORES_ACEITOS as readonly string[]).includes(url.hostname)
    || (DESTINOS_DO_GOOGLE_MAPS as readonly string[]).includes(url.hostname);
}

function destinoFinalAceito(url: URL): boolean {
  return (DESTINOS_DO_GOOGLE_MAPS as readonly string[]).includes(url.hostname);
}

/**
 * A URL final como ela volta para o painel: sem os parâmetros de rastreamento.
 *
 * Filtra os pares CRUS da query, e não por `searchParams`: reescrever a query
 * pelo `URLSearchParams` trocaria a vírgula de `q=lat,lng` por `%2C`, e a URL
 * que volta deixaria de ser a que o Google entregou. Só o que é rastreio sai.
 */
export function urlFinalSemRastreamento(url: URL): string {
  const limpa = new URL(url.href);
  const pares = limpa.search.slice(1).split("&").filter((par) => {
    if (par === "") return false;
    const nome = decodeURIComponent(par.split("=")[0] ?? "");
    return !(nome.startsWith("utm_") || PARAMETROS_DE_RASTREAMENTO.has(nome));
  });
  limpa.search = pares.length > 0 ? `?${pares.join("&")}` : "";
  return limpa.href;
}

/* ============================================================
   A rota
   ============================================================ */

export const pedidoSchema = z.object({
  url: z.string().trim().min(1, "Cole o link.").max(TETO_DA_URL, "Esse link é longo demais."),
});

const MENSAGEM_LINK_NAO_ACEITO =
  "O servidor só abre link curto do Google Maps (maps.app.goo.gl ou goo.gl). "
  + "Se o link for longo, cole ele direto no campo: o painel lê a coordenada sem "
  + "abrir nada.";

const MENSAGEM_SEM_PONTO =
  "Esse link não aponta para um ponto: ele abre uma busca por nome no Google "
  + "Maps, e nome não é ponto. Abra o link no seu navegador, ache o lugar no "
  + "mapa e cole aqui o endereço da barra ou a coordenada.";

/** As causas de `nao_resolveu`, cada uma com a frase que a tela mostra. */
const NAO_RESOLVEU = {
  tempo:
    "O encurtador do Google não respondeu a tempo. Tente de novo em instantes, "
    + "ou abra o link no seu navegador e cole aqui o endereço da barra.",
  saltos:
    "O link deu voltas demais antes de chegar ao mapa, e o servidor parou de "
    + "seguir. Abra o link no seu navegador e cole aqui o endereço da barra.",
  destino:
    "O link não levou ao Google Maps, e o servidor não segue link para outro "
    + "lugar. Abra o link no seu navegador, confira para onde ele vai e cole "
    + "aqui o endereço da barra.",
  rede:
    "O servidor não conseguiu abrir o link agora. Tente de novo, ou abra o "
    + "link no seu navegador e cole aqui o endereço da barra.",
} as const;

type CausaDaFalha = keyof typeof NAO_RESOLVEU;

class NaoResolveu extends Error {
  readonly causa: CausaDaFalha;
  constructor(causa: CausaDaFalha) {
    super(causa);
    this.causa = causa;
  }
}

/** O que o painel recebe. */
export type PontoDoLink = {
  latitude: number;
  longitude: number;
  urlFinal: string;
};

export type OpcoesDoMapa = {
  /** Só o teste passa: um dublê no lugar da rede. */
  buscar?: BuscarCabecalhos;
  /** Só o teste passa: um dublê no lugar do DNS. */
  lookup?: Lookup;
  /** Só o teste passa: o teto de tempo encurtado. */
  tempoLimiteMs?: number;
};

const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308]);

/**
 * Segue a cadeia de saltos com todas as defesas, e devolve a URL final.
 *
 * Cada salto repete a conferência inteira: host na lista, nome resolvido,
 * endereço público, conexão nesse endereço. O primeiro salto é a própria URL
 * colada, então nem ela escapa da conferência de endereço.
 */
async function seguirAteOMapa(
  inicial: URL,
  { buscar, lookup, signal }: { buscar: BuscarCabecalhos; lookup: Lookup; signal: AbortSignal },
): Promise<URL> {
  let atual = inicial;
  for (let salto = 0; ; salto += 1) {
    if (!saltoAceito(atual)) throw new NaoResolveu("destino");

    let resolvido: { address: string; family: number };
    try {
      resolvido = await lookup(atual.hostname);
    } catch {
      throw new NaoResolveu("rede");
    }
    if (!enderecoPublico(resolvido.address)) throw new NaoResolveu("destino");
    const familia: 4 | 6 = isIP(resolvido.address) === 6 ? 6 : 4;

    let resposta: { status: number; location: string | null };
    try {
      resposta = await buscar(atual, { endereco: resolvido.address, familia, signal });
    } catch {
      throw new NaoResolveu(signal.aborted ? "tempo" : "rede");
    }
    if (signal.aborted) throw new NaoResolveu("tempo");

    if (REDIRECIONAMENTOS.has(resposta.status)) {
      if (!resposta.location) throw new NaoResolveu("destino");
      if (salto >= TETO_DE_SALTOS) throw new NaoResolveu("saltos");
      let proxima: URL;
      try {
        proxima = new URL(resposta.location, atual);
      } catch {
        throw new NaoResolveu("destino");
      }
      // A mesma régua do link colado: só `https:`, sem usuário, sem porta.
      if (!urlLimpa(proxima.href)) throw new NaoResolveu("destino");
      atual = proxima;
      continue;
    }
    if (resposta.status >= 200 && resposta.status < 300) {
      if (!destinoFinalAceito(atual)) throw new NaoResolveu("destino");
      return atual;
    }
    throw new NaoResolveu("rede");
  }
}

export async function rotasMapa(
  app: FastifyInstance,
  {
    buscar = buscarCabecalhosPorHttp,
    lookup = async (nome) => consultarNome(nome),
    tempoLimiteMs = TEMPO_LIMITE_MS,
  }: OpcoesDoMapa,
): Promise<void> {
  /**
   * Teto próprio, mais apertado que o global: cada pedido que passa é o
   * servidor da prefeitura falando com o Google, e um cliente com defeito não
   * pode virar um laço de consultas. A chave do balde é a do limitador global
   * (a pessoa do token verificado), então um operador com o dedo preso não
   * atrapalha o colega.
   */
  const limite = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.post("/resolver-link", limite, async (req) => {
    /*
      A mesma permissão de quem registra ocorrência: é quem informa a
      localização quando o chamado entra, e é quem cola o link. Nada é lido
      nem escrito no banco, e mesmo assim a permissão vem antes de tudo,
      porque o que esta rota faz é o servidor sair para a rede em nome de
      quem pediu.
    */
    await autorizar(app, req, "abrir_ocorrencia");

    const { url: texto } = pedidoSchema.parse(req.body);
    const inicial = linkEncurtadoAceito(texto);
    if (!inicial) throw new RegraDeNegocio("link_nao_aceito", MENSAGEM_LINK_NAO_ACEITO, 422);

    /*
      Um relógio para a cadeia INTEIRA, e não por salto: quatro saltos de
      quatro segundos cada seriam dezesseis segundos de coordenador olhando
      para o botão. `unref()` para o relógio não segurar o processo no
      encerramento.
    */
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
    if (typeof relogio.unref === "function") relogio.unref();

    let urlFinal: URL;
    try {
      urlFinal = await seguirAteOMapa(inicial, { buscar, lookup, signal: controle.signal });
    } catch (erro) {
      /*
        Só a CAUSA vai para o log. Nem o link, nem para onde ele levou, nem a
        mensagem de erro da rede (que pode carregar a URL): a rota é resposta,
        não registro, e o log é copiado para mais lugares que o banco.
      */
      const causa: CausaDaFalha = erro instanceof NaoResolveu ? erro.causa : "rede";
      req.log.warn({ causa }, "o link de mapa nao resolveu");
      throw new RegraDeNegocio("nao_resolveu", NAO_RESOLVEU[causa], 502);
    } finally {
      clearTimeout(relogio);
    }

    /*
      O MESMO leitor do painel. Um segundo leitor aqui faria a mesma URL ser
      lida de um jeito no servidor e de outro na tela.
    */
    const leitura = lerLocalizacao(urlFinal.href);
    if (leitura.tipo !== "coordenada" && leitura.tipo !== "invertida") {
      throw new RegraDeNegocio("sem_ponto", MENSAGEM_SEM_PONTO, 422);
    }
    const ponto: PontoDoLink = {
      latitude: Number(leitura.coordenada.lat.toFixed(CASAS_DE_COORDENADA)),
      longitude: Number(leitura.coordenada.lng.toFixed(CASAS_DE_COORDENADA)),
      urlFinal: urlFinalSemRastreamento(urlFinal),
    };
    return ponto;
  });
}
