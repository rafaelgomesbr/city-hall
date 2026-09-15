/**
 * Ler coordenada do que a pessoa realmente tem na mão.
 *
 * O formulário pedia "Latitude (opcional)" e "Longitude (opcional)", em dois
 * campos separados. Ninguém que atende telefone digita coordenada, e o próprio
 * produto confessava isso: o estado vazio do mapa dizia "registre latitude e
 * longitude na abertura para a ocorrência aparecer aqui", ou seja, uma tela
 * pedindo às pessoas que façam o que elas nunca fazem.
 *
 * O que a pessoa TEM é o link que o solicitante mandou pelo WhatsApp, ou o
 * endereço da barra do Google Maps que ela abriu para achar a rua. Este módulo
 * lê esses formatos.
 *
 * TUDO LOCAL, sem uma única chamada de rede, e o teste deste módulo é um
 * portão contra isso. O link ENCURTADO (`maps.app.goo.gl`), que não carrega a
 * coordenada dentro dele, é a única exceção do produto, e ela não mora aqui:
 * quem o abre é o servidor do município, em `apps/api/src/rotas/mapa.ts`, a
 * pedido explícito do coordenador (um botão, nunca automático), porque abrir
 * o link é o servidor da prefeitura contando ao Google que aquele ponto foi
 * consultado (`docs/SUBPROCESSADORES.md`, seção 2.2). O servidor lê a URL
 * final com ESTE leitor, e é por isso que os formatos abaixo são a lista
 * completa para os dois lados.
 */

export type Coordenada = { lat: number; lng: number };

/**
 * Casas decimais que a GRAVAÇÃO guarda, e que todo documento imprime.
 *
 * Seis casas são cerca de dez centímetros, mais fino do que qualquer GPS de
 * celular acerta debaixo de chuva. Quinze casas não são precisão: são o resto
 * binário do `Number`, e imprimir isso convida quem lê a confiar em dígito que
 * nunca mediu nada.
 *
 * O número mora aqui, e não só no painel, porque o teto precisava valer também
 * na ESCRITA. Enquanto ele existia apenas em `apps/web`, o mesmo campo aceitava
 * quinze casas por qualquer outra porta da API, e a divergência voltava por
 * onde ninguém estava olhando. O painel continua aplicando o teto na leitura do
 * texto colado (`apps/web/src/paginas/coordenada-colada.ts`), e um teste
 * confere que os dois números são o mesmo, para um não envelhecer sozinho.
 */
export const CASAS_DE_COORDENADA = 6;

export type LeituraDeLocalizacao =
  | { tipo: "vazio" }
  | { tipo: "coordenada"; coordenada: Coordenada }
  | { tipo: "invertida"; coordenada: Coordenada; sugestao: Coordenada }
  | { tipo: "encurtado" }
  | { tipo: "nao_reconhecido" };

/** Domínios de encurtador que o Google usa e que NÃO carregam a coordenada. */
const ENCURTADORES = [
  "maps.app.goo.gl",
  "goo.gl/maps",
  "g.co/kgs",
  "maps.google.com/maps?cid=",
];

/*
  Os formatos que aparecem de verdade, em ordem de frequência:

  - `?q=lat,lng` e `&query=lat,lng`: o que o compartilhamento do Google gera.
  - `ll=`, `daddr=` e `destination=`: o centro do mapa e o destino de um link
    de "como chegar", que é o que o encurtador devolve quando o solicitante
    compartilhou a rota em vez do lugar.
  - `/@lat,lng,17z`: o que está na barra de endereço quando alguém navega.
  - `!3dlat!4dlng`: o formato interno que aparece em link de lugar.
  - `geo:lat,lng`: o que o Android gera ao compartilhar localização.
  - `lat, lng` cru: quem já sabe a coordenada e cola direto.
*/
const PADROES: RegExp[] = [
  /[?&](?:q|query|ll|sll|daddr|destination)=(-?\d{1,3}\.\d+)[,%2C\s]+(-?\d{1,3}\.\d+)/i,
  /\/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  /^geo:(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i,
  /^\s*(-?\d{1,3}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)\s*$/,
];

/**
 * A caixa que contém o Brasil, com folga.
 *
 * Serve a UM propósito: detectar latitude e longitude trocadas, que é o erro
 * mais comum de quem cola coordenada à mão. Em Minas Gerais, `-22.41` e
 * `-45.45` invertidos caem no meio do oceano Índico, e a tela consegue dizer
 * isso em vez de gravar um ponto errado em silêncio.
 */
const BRASIL = { latMin: -34.5, latMax: 6.5, lngMin: -74.5, lngMax: -32.0 };

function dentroDoBrasil(c: Coordenada): boolean {
  return c.lat >= BRASIL.latMin && c.lat <= BRASIL.latMax
    && c.lng >= BRASIL.lngMin && c.lng <= BRASIL.lngMax;
}

function coordenadaValida(c: Coordenada): boolean {
  return Number.isFinite(c.lat) && Number.isFinite(c.lng)
    && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

export function lerLocalizacao(texto: string): LeituraDeLocalizacao {
  const limpo = texto.trim();
  if (!limpo) return { tipo: "vazio" };

  /*
    Encurtador primeiro, e antes de tentar qualquer padrão.

    Um link `maps.app.goo.gl` não tem coordenada nenhuma dentro dele: ela só
    aparece depois que o navegador segue o redirecionamento. Cair no
    "não reconheci" aqui mandaria a pessoa conferir o que ela colou, quando o
    que ela colou está certo e o problema é outro.
  */
  if (ENCURTADORES.some((d) => limpo.includes(d))) return { tipo: "encurtado" };

  for (const padrao of PADROES) {
    const casou = padrao.exec(limpo);
    if (!casou) continue;

    const bruta = { lat: Number(casou[1]), lng: Number(casou[2]) };
    if (!coordenadaValida(bruta)) continue;

    if (dentroDoBrasil(bruta)) return { tipo: "coordenada", coordenada: bruta };

    // Fora do Brasil: quase sempre latitude e longitude trocadas.
    const trocada = { lat: bruta.lng, lng: bruta.lat };
    if (coordenadaValida(trocada) && dentroDoBrasil(trocada)) {
      return { tipo: "invertida", coordenada: bruta, sugestao: trocada };
    }

    // Fora do Brasil e a troca não ajuda: aceita como está. O produto é para
    // município brasileiro, mas recusar coordenada válida seria arrogância de
    // software, e existe fronteira.
    return { tipo: "coordenada", coordenada: bruta };
  }

  return { tipo: "nao_reconhecido" };
}

/** Como a coordenada aparece na tela depois de reconhecida. */
export function coordenadaEmTexto(c: Coordenada): string {
  return `${c.lat.toFixed(CASAS_DE_COORDENADA)}, ${c.lng.toFixed(CASAS_DE_COORDENADA)}`;
}

/**
 * O link para abrir no mapa, montado no NAVEGADOR de quem está atendendo.
 *
 * Não é o servidor da prefeitura falando com o Google: é o navegador de quem
 * já ia abrir o Google de qualquer jeito. Custo zero, dependência zero, e
 * nenhum tile pago.
 */
export function linkParaMapa(c: Coordenada): string {
  return `https://www.google.com/maps?q=${c.lat},${c.lng}`;
}
