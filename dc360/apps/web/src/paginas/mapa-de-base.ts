/**
 * O mapa de base, e o modo em que ele NÃO existe.
 *
 * O painel desenha as ocorrências de duas maneiras, e a diferença entre elas
 * não é estética, é de a quem o município entrega a coordenada das famílias
 * que ele vistoriou.
 *
 * MODO GOOGLE (a implantação tem chave, servida em tempo de execução por
 * `GET /configuracao` da API daquele município, e não assada no build). O mapa
 * cartográfico vem do Google. A coordenada de cada ocorrência ativa desenhada
 * é enviada aos Estados Unidos a cada carregamento da tela, e o carregamento é
 * cobrado por unidade.
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

import {
  GRADE_DO_GLIFO, caminhosDoGlifo, glifoDeSeveridade, type Severidade,
} from "@dc360/shared";

export type ModoDoMapa = "google" | "esquematico";

/**
 * A chave, RECEBIDA de quem chamou, com a variável de build só como reserva.
 *
 * Este arquivo não lê mais o ambiente por dentro, e a razão é de conta a
 * pagar. `import.meta.env` é tempo de BUILD, e o painel é UM build estático
 * servindo TODOS os municípios: a chave assada ali seria a chave do
 * FORNECEDOR, cobrada no cartão dele, pagando o carregamento de mapa de todas
 * as prefeituras, porque o Google cobra por carregamento. Enquanto a chave
 * morava aqui dentro, não havia nem onde uma prefeitura pôr a dela.
 *
 * QUEM GANHA DE QUEM: `daApi` ganha. Ela veio de `GET /configuracao` do
 * servidor daquele município, em tempo de execução, e é a chave de quem paga
 * a conta. `doBuild` só entra quando `daApi` chega vazia, e o lugar onde isso
 * acontece é o desenvolvimento: `npm run dev` no modo de demonstração, sem API
 * nenhuma para perguntar. No painel implantado ela é inerte, porque
 * `vercel.json` declara `VITE_GOOGLE_MAPS_CHAVE` vazia de propósito, e um
 * portão em `test/mapa-e-coordenada.test.ts` reprova quem a preencher: um
 * valor ali voltaria a ser a chave do fornecedor no mapa de todo mundo.
 *
 * Os dois parâmetros são explícitos para o teste conseguir descrever os dois
 * modos e a precedência entre eles sem mexer em variável de ambiente do
 * processo: um portão que só sabe testar o modo em que a máquina dele está
 * configurada é um portão que nunca viu o outro modo.
 */
export function chaveDoGoogleMaps(
  daApi: unknown,
  doBuild: unknown = import.meta.env["VITE_GOOGLE_MAPS_CHAVE"],
): string {
  const limpar = (bruta: unknown): string => (typeof bruta === "string" ? bruta.trim() : "");
  return limpar(daApi) || limpar(doBuild);
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
  /** A âncora do símbolo do marcador: o glifo é desenhado na grade de 24 e ancora no centro dela. */
  Point: new (x: number, y: number) => unknown;
};

type JanelaComGoogle = {
  google?: { maps?: ApiDoGoogleMaps };
  /**
   * O gancho pelo qual o Google avisa que RECUSOU a chave.
   *
   * Não é opção de estilo: é a única forma de saber. Quando a chave é
   * inválida, está sem faturamento ou está fora da lista de referenciadores
   * permitidos, o script do carregador responde 200 e carrega normalmente,
   * `script.onload` dispara, a API existe e o mapa é construído. A recusa só
   * aparece na PRIMEIRA renderização, e o Google a comunica de dois jeitos:
   * escrevendo no console do navegador e chamando esta função global, se ela
   * existir. Sem ela, o painel fica com a caixa cinza de erro do Google, com
   * uma mensagem em inglês sobre chave de desenvolvedor, e nenhuma parte do
   * produto sabe que aconteceu.
   */
  gm_authFailure?: () => void;
};

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

/**
 * A mensagem da recusa, escrita para quem tem o console do Google na mão.
 *
 * É a falha mais provável na estreia do modo com chave, e a que mais tempo
 * faz perder, porque tudo parece certo: a chave existe, o script carrega, o
 * mapa é construído, e o que aparece é uma caixa cinza. A frase precisa dizer
 * onde se conserta, senão o defeito vira "o mapa não funciona".
 */
export const RECUSA_DA_CHAVE_DO_GOOGLE =
  "O Google recusou a chave deste painel e o mapa voltou ao plano esquemático. "
  + "A causa usual é a restrição por referenciador HTTP: o endereço deste "
  + "painel precisa estar na lista de sites autorizados da chave, no console do "
  + "Google Cloud. Faturamento desativado no projeto e a API Maps JavaScript "
  + "não habilitada dão o mesmo sintoma.";

/**
 * Quem quer saber que o Google recusou a chave.
 *
 * A recusa chega DEPOIS de a promessa de carregamento já ter sido cumprida
 * (ver `gm_authFailure` acima), então ela não cabe no `catch` de quem chamou:
 * quando ela acontece, aquele `catch` já passou. Por isso é uma inscrição, e
 * não um desfecho da promessa.
 */
let ouvintesDaRecusa: Array<(motivo: string) => void> = [];

export function aoGoogleRecusarAChave(ouvinte: (motivo: string) => void): () => void {
  ouvintesDaRecusa.push(ouvinte);

  const janela = globalThis as unknown as JanelaComGoogle;
  /*
    Instalada uma vez só, e nunca sobrescrita.

    O Google chama o que estiver nesta propriedade global no momento da
    recusa. Reatribuir a cada inscrição funcionaria hoje e quebraria no dia em
    que outra parte do painel também quisesse saber: a última atribuição
    apagaria a anterior em silêncio. A lista de ouvintes resolve isso, e a
    função global vira só o porteiro dela.
  */
  if (!janela.gm_authFailure) {
    janela.gm_authFailure = () => {
      /*
        Esquece o carregamento pelo mesmo motivo do `onerror`: uma chave
        recusada pode ser corrigida no console do Google enquanto a aba está
        aberta, e guardar a promessa faria a tela nunca mais tentar.
      */
      carregamento = null;
      for (const ouvinte of [...ouvintesDaRecusa]) ouvinte(RECUSA_DA_CHAVE_DO_GOOGLE);
    };
  }

  return () => {
    ouvintesDaRecusa = ouvintesDaRecusa.filter((o) => o !== ouvinte);
  };
}

/** Existe para o teste não vazar ouvinte de um caso para o outro. */
export function esquecerOuvintesDaRecusa(): void {
  ouvintesDaRecusa = [];
  const janela = globalThis as unknown as JanelaComGoogle;
  delete janela.gm_authFailure;
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
 * O centro da grade do glifo, onde o símbolo do Google é ancorado.
 *
 * O símbolo do Google ancora na origem do traçado, e o glifo compartilhado é
 * desenhado na grade de 24 com o centro em 12. Ancorar em (12, 12) é o que
 * põe a figura em cima da coordenada, e não com o canto nela.
 */
export const CENTRO_DO_GLIFO = GRADE_DO_GLIFO / 2;

/**
 * A forma de cada severidade, no traçado que o marcador do Google entende.
 *
 * É o MESMO glifo do selo e do pino do plano esquemático (`FormaSeveridade`),
 * vindo de `@dc360/shared`: contorno mais marca, num traçado só, porque o
 * símbolo do Google aceita um caminho por marcador. O contorno é preenchido
 * com a cor do pino e a marca de dentro (ponto, traço, exclamação) aparece
 * pelo traço na cor da superfície, que o Google aplica ao caminho inteiro.
 * Sem classificação não preenche (`glifoDeSeveridade(...).preenche`), senão
 * os quatro dentes do tracejado virariam quatro gomos cinza.
 *
 * Sobrevive ao daltonismo e ao sol na tela do notebook dentro do carro, que é
 * onde este mapa é lido de verdade.
 */
export function caminhoDaSeveridade(severidade: Severidade | null): string {
  return caminhosDoGlifo(glifoDeSeveridade(severidade)).join(" ");
}
