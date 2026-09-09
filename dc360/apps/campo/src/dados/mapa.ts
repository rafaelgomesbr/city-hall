import { Linking, Platform } from "react-native";

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
