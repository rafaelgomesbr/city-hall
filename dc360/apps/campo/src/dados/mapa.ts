import Constants from "expo-constants";
import { Linking, Platform } from "react-native";

import { enderecoDaApi } from "./api";

/**
 * Entregar a coordenada da ocorrência ao aplicativo de mapas do aparelho.
 *
 * A coordenada já chegava no aparelho e só alimentava a minuta do laudo. Quem
 * precisa dela primeiro é o agente que ainda está no carro tentando achar a
 * casa: endereço de morro raramente tem placa, e digitar de novo, à mão, uma
 * coordenada de seis casas decimais dentro de outro aplicativo é onde nasce o
 * erro de dígito que leva a equipe para a rua errada.
 *
 * Este arquivo não desenha mapa nenhum e não fala com a rede. Ele monta um
 * endereço e entrega ao sistema operacional, que abre o aplicativo que a
 * pessoa já usa e já tem os mapas baixados.
 */

/** Casas decimais da coordenada. Seis é cerca de onze centímetros. */
const CASAS = 6;

/**
 * Coordenada em texto, e nunca `String(numero)`.
 *
 * Dois defeitos que `toFixed` evita, e os dois produzem endereço que o
 * aplicativo de mapas recusa em silêncio (ele abre centralizado em outro
 * lugar, sem dizer que não entendeu):
 *
 * 1. Notação científica. `String(0.0000001)` é `"1e-7"`, e isso vai parar
 *    dentro da URL do jeito que está.
 * 2. Lixo de ponto flutuante. Uma soma feita antes de chegar aqui produz
 *    `3.3000000000000003`, com dezesseis casas que não significam nada e
 *    alongam a URL sem acrescentar precisão.
 */
function emTexto(valor: number): string {
  return valor.toFixed(CASAS);
}

/**
 * O rótulo dentro do `q=...(rótulo)` do esquema `geo:`.
 *
 * `encodeURIComponent` NÃO escapa parênteses, e é justamente o parêntese que
 * delimita o rótulo neste esquema. Um endereço como
 * "Rua das Palmeiras, 120 (fundos)" fecharia o grupo cedo demais e o resto do
 * texto viraria sintaxe solta: o pino some ou o aplicativo abre sem entender o
 * endereço. Por isso os dois parênteses saem daqui já escapados.
 */
function rotuloParaGeo(rotulo: string): string {
  return encodeURIComponent(rotulo.trim())
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * Os endereços que serão tentados, em ordem de preferência.
 *
 * Separado de `abrirNoMapa` para ter teste sem aparelho e sem simulador: a
 * forma exata da URL é o que decide se o pino finca na casa certa, e isso
 * precisa ser verificável linha a linha.
 *
 * No iOS o alvo é o Mapas da Apple com `daddr` (destino) e `dirflg=d`
 * (dirigindo), porque o agente quer a ROTA, não um ponto para olhar.
 *
 * No Android o esquema `geo:` é o que qualquer aplicativo de mapas instalado
 * atende. O `?q=LAT,LNG(RÓTULO)` é obrigatório: com `geo:LAT,LNG` puro,
 * vários aplicativos apenas centralizam o mapa na coordenada e não fincam
 * pino nenhum, e um mapa centralizado sem pino, visto de dentro do carro, é
 * indistinguível de um mapa que abriu no lugar errado.
 *
 * O último da lista é a mesma coordenada no Google Maps por `https`, que o
 * navegador abre mesmo quando não existe nenhum aplicativo de mapas instalado.
 */
export function enderecosDoMapa(
  plataforma: string,
  lat: number,
  lng: number,
  rotulo: string,
): string[] {
  const par = `${emTexto(lat)},${emTexto(lng)}`;
  const naWeb = `https://www.google.com/maps/search/?api=1&query=${par}`;

  if (plataforma === "ios") {
    return [`http://maps.apple.com/?daddr=${par}&dirflg=d`, naWeb];
  }
  if (plataforma === "android") {
    const marcado = rotulo.trim() ? `(${rotuloParaGeo(rotulo)})` : "";
    return [`geo:${par}?q=${par}${marcado}`, naWeb];
  }
  return [naWeb];
}

/**
 * Abre a coordenada no aplicativo de mapas, e cai no navegador se não der.
 *
 * **Não pergunta antes se o aparelho sabe abrir o esquema.** `canOpenURL`
 * parece a chamada certa e é uma armadilha nas duas plataformas: no Android 11
 * em diante ele responde `false` para qualquer esquema que não esteja
 * declarado em `<queries>` no manifesto, e no iOS para qualquer um que não
 * esteja em `LSApplicationQueriesSchemes`. As duas declarações exigiriam um
 * plugin de configuração novo, e o efeito de esquecer isso é o pior possível:
 * o botão simplesmente não faz nada, num aparelho onde o aplicativo de mapas
 * está instalado e funcionando.
 *
 * Então tenta abrir de verdade. Se o sistema recusar, a promessa é rejeitada e
 * a próxima da lista assume, que é o `https` e sempre tem quem atenda.
 *
 * Devolve `false` só quando nem o navegador atendeu, para a tela poder mostrar
 * a coordenada em texto e o agente conseguir levá-la a algum lugar.
 */
export async function abrirNoMapa(
  lat: number,
  lng: number,
  rotulo: string,
): Promise<boolean> {
  /*
    Coordenada inválida não vira URL.

    Sem esta guarda, uma ocorrência com coordenada faltando abriria
    `geo:NaN,NaN`, o aplicativo de mapas abriria em algum lugar arbitrário e o
    agente acreditaria naquele ponto.
  */
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  for (const endereco of enderecosDoMapa(Platform.OS, lat, lng, rotulo)) {
    try {
      await Linking.openURL(endereco);
      return true;
    } catch {
      // Ninguém atendeu este esquema neste aparelho. Tenta o próximo.
    }
  }
  return false;
}

/* ========================================================================
   O MAPA DE BASE DENTRO DO APLICATIVO
   ========================================================================

   Tudo acima desta linha entrega a coordenada ao aplicativo de mapas do
   aparelho e sai de cena. O que vem abaixo é outra coisa: o mapa desenhado
   DENTRO do produto, que foi o pedido do Rafa ("o agente não precisaria sair
   do app pra ir no maps"), e a decisão de quando ele pode existir.

   Este bloco não desenha nada. Ele responde a uma pergunta só, e ela é de
   privacidade antes de ser de interface: PODE a coordenada desta ocorrência
   sair do aparelho e ir para o Google agora? A resposta tem duas metades que
   moram em lugares diferentes, e confundir as duas é o defeito que este
   arquivo existe para impedir.
   ======================================================================== */


/**
 * Os dois modos, e nenhum deles é degradação do outro.
 *
 * `google` desenha os ladrilhos cartográficos do Google, no nosso estilo, e a
 * coordenada da ocorrência vai aos Estados Unidos a cada carregamento.
 * `esquematico` desenha o imóvel e o agente num plano feito pelo próprio
 * aplicativo, em `react-native-svg`, sem uma única requisição.
 *
 * O plano esquemático não existe só para o município que recusa o Google. Ele
 * existe principalmente para o lugar onde este aplicativo trabalha: o
 * ladrilho nativo tem cache OPORTUNISTA, e o trecho do morro que o agente
 * nunca abriu com sinal abre cinza. Um mapa cinza no alto do morro, na chuva,
 * é o produto dizendo que não sabe onde a casa fica.
 */
export type ModoDoMapa = "google" | "esquematico";

/**
 * Por que o modo é este, e não só qual ele é.
 *
 * A tela precisa DIZER o modo com ícone e texto (`ModoDoMapaDito`), e dizer
 * "esquemático" sem dizer por quê transforma três situações muito diferentes
 * na mesma cara de produto quebrado: o município que recusou o envio, o
 * binário compilado sem a chave, e o Google que recusou a chave. A primeira é
 * escolha, a segunda é erro de compilação e a terceira é erro de console, e
 * cada uma se conserta num lugar diferente.
 */
export type MotivoDoModo =
  /** Município autorizou e o binário tem o SDK: os ladrilhos podem vir. */
  | "autorizado"
  /** `GET /configuracao` respondeu `chaveDoMapa` vazia. É escolha, não falha. */
  | "municipio-nao-autorizou"
  /** O município autorizou e ESTE binário foi compilado sem `DC360_MAPS_CHAVE`. */
  | "binario-sem-chave"
  /** O mapa foi montado e não terminou de desenhar. Ver `RECUSA_DA_CHAVE`. */
  | "google-recusou";

export type DecisaoDoMapa = {
  modo: ModoDoMapa;
  motivo: MotivoDoModo;
  /**
   * O município configurou uma chave e o binário carrega OUTRA.
   *
   * Não muda o modo: quem paga o ladrilho é sempre a chave que está dentro do
   * binário, porque é ela que o SDK nativo usa. Muda o que a tela diz, e é o
   * único jeito de alguém descobrir que rotacionou `MAPS_KEY` no servidor e
   * esqueceu de recompilar o aplicativo: sem este aviso, o mapa continua
   * funcionando e a conta continua caindo na chave antiga, para sempre.
   */
  chaveDivergente: boolean;
};

/**
 * A chave que ESTE BINÁRIO carrega, lida de `extra` do `app.config.ts`.
 *
 * Ela não é a chave "de reserva" que o painel tem em `mapa-de-base.ts`. No
 * painel a chave é uma string que o JavaScript entrega ao carregador, então a
 * da API pode substituir a do build. Aqui ela é `GMSServices.provideAPIKey` no
 * AppDelegate e `com.google.android.geo.API_KEY` no manifesto, escritas pelo
 * plugin durante o `prebuild`: o JavaScript não tem como trocá-las, e ler este
 * campo é a única forma de PERGUNTAR se elas existem.
 */
export function chaveDoMapaDoBuild(): string {
  const extra = Constants.expoConfig?.extra as { mapaChaveDoBuild?: unknown } | undefined;
  return typeof extra?.mapaChaveDoBuild === "string" ? extra.mapaChaveDoBuild.trim() : "";
}

/**
 * A decisão, e as duas metades que ela junta.
 *
 * `daApi` é a AUTORIZAÇÃO. Vem de `GET /configuracao` do servidor daquele
 * município, em tempo de execução, e vazia quer dizer que aquele município não
 * aceita mandar coordenada de imóvel vistoriado para fora do país. É o que
 * `docs/SUBPROCESSADORES.md` seção 2.2 promete por escrito, e promessa de
 * documento jurídico sem portão no código é promessa que a próxima
 * refatoração desfaz em silêncio.
 *
 * `doBuild` é a CREDENCIAL. Ela decide, no iOS, se o pod do Google entra no
 * binário, e sem ela `PROVIDER_GOOGLE` cai em silêncio no Apple Maps: a tela
 * abre, desenha um mapa, ignora o nosso estilo e não devolve erro nenhum. Esse
 * é o pior desfecho de todos, porque parece certo, e é por isso que uma
 * autorização sem credencial vira plano esquemático em vez de virar tentativa.
 *
 * `googleRecusou` ganha de tudo, e é o caminho de volta descrito em
 * `RECUSA_DA_CHAVE`.
 *
 * Os três entram como argumento e nada é lido de dentro, pelo mesmo motivo
 * escrito em `enderecosDoMapa` mais acima: um portão que só sabe testar o modo
 * em que a máquina dele está configurada é um portão que nunca viu o outro
 * modo.
 */
export function decidirModoDoMapa({ daApi, doBuild, googleRecusou = false }: {
  daApi: unknown;
  doBuild: unknown;
  googleRecusou?: boolean;
}): DecisaoDoMapa {
  const limpar = (bruta: unknown): string => (typeof bruta === "string" ? bruta.trim() : "");
  const autorizacao = limpar(daApi);
  const credencial = limpar(doBuild);
  const chaveDivergente =
    autorizacao !== "" && credencial !== "" && autorizacao !== credencial;

  if (googleRecusou) {
    return { modo: "esquematico", motivo: "google-recusou", chaveDivergente };
  }
  if (autorizacao === "") {
    return { modo: "esquematico", motivo: "municipio-nao-autorizou", chaveDivergente };
  }
  if (credencial === "") {
    return { modo: "esquematico", motivo: "binario-sem-chave", chaveDivergente };
  }
  return { modo: "google", motivo: "autorizado", chaveDivergente };
}

/**
 * O que a tela diz em cada motivo, com a frase apontando para onde se conserta.
 *
 * Escrito aqui e não na tela porque quatro frentes vão desenhar mapa em telas
 * diferentes, e quatro textos escritos à mão viram quatro explicações
 * diferentes do mesmo fato. O `titulo` é o que cabe ao lado do ícone, e o
 * `detalhe` é a frase que a tela mostra quando há espaço.
 */
export const EXPLICACAO_DO_MODO: Record<MotivoDoModo, { titulo: string; detalhe: string }> = {
  autorizado: {
    titulo: "Mapa do Google",
    detalhe:
      "A coordenada deste imóvel é enviada ao Google para desenhar o mapa. "
      + "O endereço, o nome, o relato, as fotografias e a assinatura não saem do aparelho por aqui.",
  },
  "municipio-nao-autorizou": {
    titulo: "Plano esquemático",
    detalhe:
      "O seu município optou por não enviar coordenada ao Google. O desenho abaixo é "
      + "feito pelo próprio aplicativo, com a distância e o rumo até o imóvel, e nenhuma "
      + "informação sai daqui.",
  },
  "binario-sem-chave": {
    titulo: "Plano esquemático",
    detalhe:
      "O seu município tem mapa configurado, e esta versão instalada do aplicativo foi "
      + "compilada sem a chave do mapa. Avise a coordenação: é preciso gerar o aplicativo "
      + "de novo com a chave. Até lá, a distância e o rumo abaixo continuam corretos.",
  },
  "google-recusou": {
    titulo: "Plano esquemático",
    detalhe:
      "O Google não desenhou o mapa desta vez. Pode ser falta de sinal, ou a chave do "
      + "município pode ter sido recusada. O desenho abaixo funciona igual, sem internet.",
  },
};

/**
 * A frase da RECUSA, para quem tem o console do Google na mão.
 *
 * O painel descobriu em 13/09/2026 que chave recusada NÃO falha no
 * carregamento: o script responde 200, `window.google.maps` existe, o mapa é
 * construído, e a recusa só aparece na primeira renderização, por
 * `gm_authFailure`. No aplicativo é pior, porque `gm_authFailure` não existe:
 * o SDK nativo não tem retorno de chamada nenhum para chave recusada. No
 * Android a única pista é uma linha no `logcat`; no iOS, nem isso.
 *
 * O EQUIVALENTE, então, teve que ser construído, e ele é um PRAZO. O
 * `react-native-maps` expõe `onMapLoaded`, que a própria biblioteca documenta
 * como "quando o mapa terminou de desenhar todos os ladrilhos", e ele é
 * suportado no Android e no iOS quando o provedor é o Google. Chave recusada,
 * faturamento desligado, API não habilitada e rede bloqueada têm todos o mesmo
 * sintoma observável: `onMapReady` até pode acontecer, e `onMapLoaded` nunca
 * chega. Passado o prazo sem ele, a tela desce para o plano esquemático em vez
 * de ficar com o quadrado cinza do Google.
 *
 * O que este desenho NÃO consegue fazer, dito na cara: separar chave recusada
 * de ausência de sinal. Os dois estouram o mesmo prazo, e é por isso que a
 * frase de `google-recusou` cita as duas causas em vez de acusar a chave.
 * Acusar a chave no morro sem sinal mandaria o coordenador mexer num console
 * que está certo.
 */
export const RECUSA_DA_CHAVE =
  "O Google não terminou de desenhar o mapa. Sem sinal isso é esperado. Com sinal, a causa "
  + "usual é a chave do município: no console do Google Cloud, a restrição da chave precisa "
  + "listar o identificador com.solerte.dc360.campo, o faturamento precisa estar ativo no "
  + "projeto, e as APIs Maps SDK for Android e Maps SDK for iOS precisam estar habilitadas.";

/**
 * Quanto tempo esperar o mapa terminar de desenhar antes de desistir dele.
 *
 * Doze segundos, e o número é escolha de campo e não de laboratório. No 3G de
 * um morro os ladrilhos chegam devagar, e desistir cedo trocaria um mapa que
 * ia funcionar por um plano esquemático, o que é uma piora. Do outro lado,
 * quem está com a chave recusada nunca vai receber nada, e deixar a pessoa
 * olhando um quadrado cinza é o defeito que este prazo existe para fechar.
 *
 * **Declarado:** doze segundos é palpite não medido. O que segura o caso real
 * é o desenho, não o número: passado o prazo a tela troca de modo e continua
 * dizendo a distância e o rumo, então errar o prazo para mais custa espera, e
 * para menos custa um mapa de ruas, nunca a informação de que o agente precisa.
 */
export const PRAZO_DO_MAPA_MS = 12_000;

/* ========================================================================
   Distância e rumo: o que o plano esquemático sabe dizer
   ======================================================================== */

/** Um ponto no mundo, do jeito que o resto do aplicativo já o carrega. */
export type Ponto = { latitude: number; longitude: number };

/** Raio médio da Terra, em metros. */
const RAIO_DA_TERRA_M = 6_371_000;

const paraRadianos = (graus: number): number => (graus * Math.PI) / 180;

/**
 * Distância em metros entre dois pontos, pela fórmula do semiverseno.
 *
 * NÃO é a projeção `min/max` que o painel usa em `Mapa.tsx`, e a diferença é
 * de semântica e não de técnica. Lá são N ocorrências espalhadas pela cidade,
 * e o que informa é a posição RELATIVA de cada uma dentro do conjunto: a
 * projeção em escala é a resposta certa. Aqui são dois pontos, o imóvel e o
 * agente, e `min/max` degenera quando os dois estão no mesmo lugar (o
 * denominador zera) e mente quando estão próximos (dois pontos a quinze metros
 * um do outro ocupariam os cantos opostos do desenho, como se estivessem
 * longe). O que serve a quem está na rua é quantos metros faltam e para que
 * lado, e é isso que estas duas funções calculam.
 *
 * Semiverseno e não Pitágoras sobre graus: perto do equador um grau de
 * longitude e um de latitude não medem o mesmo, e em Florianópolis o erro já
 * passa de dez por cento. Dez por cento de uma quadra é a casa errada.
 */
export function distanciaEmMetros(de: Ponto, para: Ponto): number {
  const dLat = paraRadianos(para.latitude - de.latitude);
  const dLng = paraRadianos(para.longitude - de.longitude);
  const lat1 = paraRadianos(de.latitude);
  const lat2 = paraRadianos(para.latitude);

  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_DA_TERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Rumo inicial em graus, de 0 (norte) a 360, girando para leste.
 *
 * "Inicial" porque num grande círculo o rumo muda ao longo do caminho. Nas
 * distâncias deste produto (metros, às vezes poucos quilômetros) a diferença é
 * invisível, e a palavra fica no nome para ninguém reusar isto para navegação
 * de verdade achando que serve.
 */
export function rumoEmGraus(de: Ponto, para: Ponto): number {
  const lat1 = paraRadianos(de.latitude);
  const lat2 = paraRadianos(para.latitude);
  const dLng = paraRadianos(para.longitude - de.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Os oito rumos, por extenso e na ordem do compasso.
 *
 * Por extenso e não a sigla: "SO" e "SE" trocadas na chuva, com luva, olhando
 * para um barranco, é um erro caro, e "sudoeste" não se confunde com nada. A
 * sigla continua existindo para caber ao lado de um número, e as duas saem da
 * mesma tabela para não divergirem.
 */
const ROSA_DOS_VENTOS = [
  { sigla: "N", nome: "norte" },
  { sigla: "NE", nome: "nordeste" },
  { sigla: "L", nome: "leste" },
  { sigla: "SE", nome: "sudeste" },
  { sigla: "S", nome: "sul" },
  { sigla: "SO", nome: "sudoeste" },
  { sigla: "O", nome: "oeste" },
  { sigla: "NO", nome: "noroeste" },
] as const;

export type Rumo = { sigla: string; nome: string; graus: number };

export function rumoPorExtenso(graus: number): Rumo {
  const normalizado = ((graus % 360) + 360) % 360;
  /*
    `+ 22.5` antes de dividir por 45 é o que centra cada fatia no seu rumo:
    sem isso, 0 grau cairia na borda entre norte e nordeste, e 350 graus (que é
    norte para qualquer pessoa) sairia como noroeste.
  */
  const indice = Math.floor(((normalizado + 22.5) % 360) / 45);
  const escolhido = ROSA_DOS_VENTOS[indice] ?? ROSA_DOS_VENTOS[0];
  return { sigla: escolhido.sigla, nome: escolhido.nome, graus: normalizado };
}

/**
 * Abaixo disto, a distância não é dita: o aparelho não sabe.
 *
 * O GPS de celular em céu aberto erra uns cinco metros, e entre prédios ou sob
 * mata fechada erra bem mais. Escrever "a 3 m" com esse erro é o produto
 * afirmando uma precisão que ele não tem, e o agente procurando uma casa três
 * metros à frente quando ela pode estar atrás dele. Vinte metros é o ponto em
 * que a seta passa a apontar para algum lugar de verdade.
 */
export const PRECISAO_MINIMA_M = 20;

/**
 * A distância em texto, arredondada com honestidade.
 *
 * Metro cheio abaixo de mil, porque é a unidade de quem está andando. Acima,
 * um decimal de quilômetro: "1,4 km" e não "1423 m", que dá quatro dígitos
 * para ler num aparelho molhado sem acrescentar nada.
 *
 * A vírgula decimal é a do Brasil, e não o ponto: este texto é lido por gente,
 * não entregue a nenhum sistema.
 */
export function distanciaEmTexto(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return "distância desconhecida";
  if (metros < PRECISAO_MINIMA_M) return "menos de 20 m";
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * O que o plano esquemático desenha e escreve, num objeto só.
 *
 * `null` em `rumo` quando os dois pontos estão perto demais para haver
 * direção, e `null` no objeto inteiro quando o aparelho ainda não sabe onde o
 * agente está. Os dois casos são diferentes na tela: no primeiro a resposta é
 * "você chegou", no segundo é "ainda estou pegando o GPS", e um `null` só para
 * os dois faria a tela dizer a coisa errada em metade das vezes.
 */
export type RotaEsquematica = {
  metros: number;
  distancia: string;
  /** `null` quando a distância está abaixo da precisão do GPS. */
  rumo: Rumo | null;
  /** A frase inteira, para quem lê a tela em voz alta. */
  frase: string;
};

export function rotaEsquematica(doAgente: Ponto | null, aoImovel: Ponto): RotaEsquematica | null {
  if (!doAgente) return null;
  if (
    !Number.isFinite(doAgente.latitude) || !Number.isFinite(doAgente.longitude)
    || !Number.isFinite(aoImovel.latitude) || !Number.isFinite(aoImovel.longitude)
  ) {
    return null;
  }

  const metros = distanciaEmMetros(doAgente, aoImovel);
  const distancia = distanciaEmTexto(metros);

  if (metros < PRECISAO_MINIMA_M) {
    return {
      metros,
      distancia,
      rumo: null,
      frase: "Você está no ponto informado, dentro da margem de erro do GPS.",
    };
  }

  const rumo = rumoPorExtenso(rumoEmGraus(doAgente, aoImovel));
  return {
    metros,
    distancia,
    rumo,
    frase: `O imóvel fica a ${distancia} a ${rumo.nome} de onde você está.`,
  };
}

/* ========================================================================
   A autorização, perguntada ao servidor do município
   ======================================================================== */

/**
 * `GET /configuracao`, e por que a chamada mora aqui e não em `api.ts`.
 *
 * `api.ts` tem um `chamar` genérico, com tempo limite, tradução de falha de
 * rede e classificação de erro, e reusar aquilo seria o certo se ele fosse
 * exportado. Ele não é, e esta frente não abre `api.ts`: quatro outras frentes
 * estão nas telas neste mesmo turno, e a peça do mapa precisa poder entrar
 * sozinha. O que se perde está dito: sem `ErroDaApi`, esta função não
 * distingue 401 de 500. Ela não precisa. Só existe UMA resposta possível ao
 * fracasso, e ela é a mesma para todos os fracassos: não sei se o município
 * autorizou, então não mando coordenada nenhuma para fora.
 *
 * NÃO trata a chave como segredo, e isso é deliberado: chave de mapa viaja
 * dentro do binário e sai de lá com um descompactador. Ver o comentário de
 * `CHAVE_DO_MAPA` em `app.config.ts`.
 */
const PRAZO_DA_CONFIGURACAO_MS = 8_000;

/**
 * Uma promessa só, guardada, para a sessão inteira do aplicativo.
 *
 * É a mesma memória que `carregarGoogleMaps` tem no painel, e aqui ela fecha
 * um custo diferente. Quatro telas vão desenhar mapa, e a lista de tarefas
 * remonta a cada foco, a cada sinal que volta e a cada 60 s: sem esta
 * memória, cada remontagem faria uma requisição ao servidor da prefeitura
 * para reler UM campo que não muda durante o dia, pelo 3G do morro, gastando
 * bateria e a mesma janela de sinal de que a sincronização precisa.
 */
let autorizacaoEmVoo: Promise<string> | null = null;

/**
 * A autorização do município, ou string vazia quando não deu para saber.
 *
 * Vazio quer dizer "não mande coordenada ao Google", e é a resposta certa nos
 * três casos em que ela aparece: município que recusou, servidor que não
 * respondeu, e aparelho sem sinal. Nenhum deles autoriza, e tratar falha de
 * rede como autorização seria mandar coordenada para fora do país por causa de
 * um erro de conexão.
 */
export async function buscarAutorizacaoDoMapa(token: string): Promise<string> {
  if (autorizacaoEmVoo) return autorizacaoEmVoo;

  autorizacaoEmVoo = (async () => {
    const base = enderecoDaApi().replace(/\/$/, "");
    if (!base) return "";

    const cancelador = new AbortController();
    const relogio = setTimeout(() => cancelador.abort(), PRAZO_DA_CONFIGURACAO_MS);
    try {
      const resposta = await fetch(`${base}/configuracao`, {
        signal: cancelador.signal,
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
      });
      if (!resposta.ok) return "";
      const corpo = (await resposta.json()) as { chaveDoMapa?: unknown };
      return typeof corpo.chaveDoMapa === "string" ? corpo.chaveDoMapa.trim() : "";
    } catch {
      /*
        Sem sinal, tempo esgotado, corpo que não é JSON: tudo cai aqui, e a
        memória é ESQUECIDA de propósito. Guardar o fracasso faria o aplicativo
        nunca mais perguntar enquanto estivesse aberto, e o agente que subiu o
        morro sem sinal de manhã continuaria no plano esquemático à tarde, de
        volta ao escritório, com sinal cheio. É o mesmo cuidado que o `onerror`
        do painel tomou, e pela mesma razão.
      */
      autorizacaoEmVoo = null;
      return "";
    } finally {
      clearTimeout(relogio);
    }
  })();

  return autorizacaoEmVoo;
}

/** Existe para o teste conseguir provar a memória, e para ele não vazar. */
export function esquecerAutorizacaoDoMapa(): void {
  autorizacaoEmVoo = null;
}
