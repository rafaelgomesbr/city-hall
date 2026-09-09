/**
 * O mapa de base, e o modo em que ele NÃO existe.
 *
 * O painel desenha as ocorrências de duas maneiras, e a diferença entre elas
 * não é estética, é de a quem o município entrega a coordenada das famílias
 * que ele vistoriou.
 *
 * MODO GOOGLE (`VITE_GOOGLE_MAPS_CHAVE` preenchida). O mapa cartográfico vem
 * do Google. A coordenada de cada ocorrência ativa desenhada é enviada aos
 * Estados Unidos a cada carregamento da tela, e o carregamento é cobrado por
 * unidade.
 *
 * MODO ESQUEMÁTICO (chave vazia, que é como o produto está hoje). As mesmas
 * coordenadas são projetadas em escala sobre um plano quadriculado desenhado
 * pelo próprio painel, sem uma única requisição ao Google. Não é degradação,
 * é o modo que `docs/SUBPROCESSADORES.md` seção 2.2 prometeu ao município que
 * recusar o envio: "o resto do produto não muda".
 *
 * A TELA DIZ EM QUAL DOS DOIS ESTÁ. Um mapa sem ruas, sem legenda de modo,
 * parece produto quebrado, e produto que parece quebrado é desligado pelo
 * usuário antes de alguém perguntar por quê. Dizer o modo transforma a mesma
 * tela de "faltou alguma coisa" em "o município escolheu isto".
 *
 * NADA AQUI CHAMA GEOCODING NEM PLACES, e `test/mapa-e-coordenada.ts` reprova
 * quem tentar. As duas são cobradas por requisição e nenhuma das duas resolve
 * problema que este produto tenha: a coordenada já está gravada, veio do
 * aparelho do agente ou do link que o solicitante mandou, e transformar
 * endereço em ponto (ou ponto em endereço) seria pagar para reaprender o que
 * já se sabe, mandando o endereço junto.
 */

export type ModoDoMapa = "google" | "esquematico";

/**
 * A chave, lida do ambiente e de mais lugar nenhum.
 *
 * O parâmetro existe para o teste conseguir descrever os dois modos sem mexer
 * em variável de ambiente do processo: um portão que só sabe testar o modo em
 * que a máquina dele está configurada é um portão que nunca viu o outro modo.
 */
export function chaveDoGoogleMaps(
  bruta: unknown = import.meta.env["VITE_GOOGLE_MAPS_CHAVE"],
): string {
  return typeof bruta === "string" ? bruta.trim() : "";
}

export function modoDoMapa(chave: string): ModoDoMapa {
  return chave.trim() === "" ? "esquematico" : "google";
}

/**
 * A URL do carregador do Google, montada num lugar só.
 *
 * NÃO EXISTE `libraries=` nesta URL, e é de propósito. É por esse parâmetro
 * que `places` entra, e uma vez carregada a biblioteca a primeira busca de
 * endereço vira cobrança recorrente que ninguém aprovou. `geocoding` sequer
 * precisa de biblioteca: ela é a chamada que o produto se proibiu de fazer.
 *
 * `language` e `region` fixam português do Brasil no rótulo das ruas: sem
 * eles o Google escolhe pelo cabeçalho do navegador, e a mesma tela sai em
 * dois idiomas em duas máquinas da mesma sala.
 */
export function urlDoCarregadorDoGoogleMaps(chave: string): string {
  const limpa = chave.trim();
  if (limpa === "") {
    throw new Error(
      "Sem chave do Google Maps não se monta URL nenhuma: o painel desenha o "
      + "plano esquemático e nenhuma coordenada sai deste navegador.",
    );
  }
  const parametros = new URLSearchParams({
    key: limpa,
    v: "quarterly",
    language: "pt-BR",
    region: "BR",
  });
  return `https://maps.googleapis.com/maps/api/js?${parametros.toString()}`;
}

/* ============================================================
   O pedaço da API do Google que este painel usa
   ============================================================ */

/**
 * O contrato é declarado aqui, à mão, e não importado de `@types/google.maps`.
 *
 * Duas razões. A primeira é de dependência: o pacote de tipos traz a superfície
 * inteira do Google, Places e Geocoding incluídos, e um tipo disponível é um
 * convite a usar. A segunda é que este bloco vira documentação executável do
 * que o produto realmente toca: se alguém precisar de algo fora daqui, tem que
 * escrever aqui primeiro, e a revisão vê.
 */
export type PontoDoGoogle = { lat: number; lng: number };

export type LimitesDoGoogle = { extend(ponto: PontoDoGoogle): void };

export type MapaDoGoogle = {
  fitBounds(limites: LimitesDoGoogle, folga?: number): void;
};

export type MarcadorDoGoogle = {
  setMap(mapa: MapaDoGoogle | null): void;
  addListener(evento: string, ouvinte: () => void): unknown;
};

export type ApiDoGoogleMaps = {
  Map: new (elemento: HTMLElement, opcoes: Record<string, unknown>) => MapaDoGoogle;
  Marker: new (opcoes: Record<string, unknown>) => MarcadorDoGoogle;
  LatLngBounds: new () => LimitesDoGoogle;
};

type JanelaComGoogle = { google?: { maps?: ApiDoGoogleMaps } };

/**
 * Uma promessa só, guardada, para o script inteiro.
 *
 * O mapa remonta a cada troca de página e a cada mudança de leva de
 * marcadores. Sem esta memória, cada remontagem acrescentaria outra tag de
 * script à página: o Google conta cada carregamento, e a conta do município
 * cresceria proporcional a quantas vezes o coordenador clicou em "Próxima".
 */
let carregamento: Promise<ApiDoGoogleMaps> | null = null;

export function carregarGoogleMaps(chave: string): Promise<ApiDoGoogleMaps> {
  if (modoDoMapa(chave) !== "google") {
    return Promise.reject(new Error(
      "Modo sem chave: o painel desenha o plano esquemático, sem contato com o Google.",
    ));
  }
  if (carregamento) return carregamento;

  carregamento = new Promise<ApiDoGoogleMaps>((entregar, recusar) => {
    const janela = globalThis as unknown as JanelaComGoogle;
    const jaCarregada = janela.google?.maps;
    if (jaCarregada) { entregar(jaCarregada); return; }

    const script = document.createElement("script");
    script.src = urlDoCarregadorDoGoogleMaps(chave);
    script.async = true;
    script.onload = () => {
      const api = (globalThis as unknown as JanelaComGoogle).google?.maps;
      if (api) entregar(api);
      else recusar(new Error("O script do Google carregou e não trouxe o mapa."));
    };
    /*
      A falha é esquecida, e não guardada.

      Um município offline, uma chave revogada ou um bloqueio de rede da
      prefeitura falham aqui. Guardar a promessa recusada faria a tela nunca
      mais tentar enquanto a aba estivesse aberta, e o coordenador que
      reconectou continuaria vendo a mesma falha até fechar o navegador.
    */
    script.onerror = () => {
      carregamento = null;
      recusar(new Error(
        "O mapa do Google não carregou. Sem internet, com a chave recusada ou "
        + "com o acesso bloqueado pela rede da prefeitura, o painel desenha o "
        + "plano esquemático.",
      ));
    };
    document.head.appendChild(script);
  });

  return carregamento;
}

/** Existe para o teste conseguir provar a memória, e para ele não vazar. */
export function esquecerCarregamentoDoGoogleMaps(): void {
  carregamento = null;
}

/**
 * O valor de um token do design system, resolvido.
 *
 * O marcador do Google é desenhado por ele, num `canvas` que não enxerga CSS,
 * então a cor precisa chegar como valor. Ler o token em vez de escrever a cor
 * é o que mantém o marcador acompanhando o tema claro e o escuro, e o que
 * mantém o painel dentro da regra de nunca ter cor literal em componente.
 */
export function corDoToken(token: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/**
 * O token de cor de cada severidade, num lugar só.
 *
 * Os dois modos precisam da MESMA cor, e por caminhos diferentes: o plano
 * esquemático escreve `var(--ds-...)` no estilo, e o marcador do Google
 * precisa do valor já resolvido. Duas listas separadas divergiriam na
 * primeira mudança de paleta, e a cidade apareceria com uma cor de crítica no
 * município que tem chave e outra no que não tem.
 */
export function tokenDaSeveridade(severidade: string | null): string {
  switch (severidade) {
    case "critica": return "--ds-sev-critica-bg";
    case "alta": return "--ds-sev-alta-fg";
    case "media": return "--ds-sev-media-fg";
    case "baixa": return "--ds-sev-baixa-fg";
    default: return "--ds-text-muted";
  }
}

/**
 * A forma de cada severidade, no traçado que o marcador do Google entende.
 *
 * É a mesma família de formas de `FormaSeveridade`, centrada na origem porque
 * o símbolo do Google ancora ali: círculo, triângulo, quadrado e losango.
 * Sobrevive ao daltonismo e ao sol na tela do notebook dentro do carro, que é
 * onde este mapa é lido de verdade.
 */
export function caminhoDaSeveridade(severidade: string | null): string {
  switch (severidade) {
    case "critica": return "M 8 0 A 8 8 0 1 1 -8 0 A 8 8 0 1 1 8 0 Z";
    case "alta": return "M 0 -9 L 9 8 L -9 8 Z";
    case "media": return "M -7 -7 H 7 V 7 H -7 Z";
    case "baixa": return "M 0 -8 L 8 0 L 0 8 L -8 0 Z";
    default: return "M 0 -6 A 6 6 0 1 1 0 6 A 6 6 0 1 1 0 -6 Z";
  }
}
