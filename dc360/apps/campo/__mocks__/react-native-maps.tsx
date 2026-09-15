import { createElement, forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

/**
 * O DUBLÊ DE `react-native-maps`, COMPARTILHADO POR TODO O PACOTE.
 *
 * ## Por que ele é obrigatório, e não uma conveniência
 *
 * A biblioteca de verdade NÃO CARREGA no jest, e não é por falta de
 * configuração: `src/index.ts` dela chama
 * `TurboModuleRegistry.getEnforcing("AirMapsModule")` no momento do `import`, e
 * `getEnforcing` existe justamente para ESTOURAR quando o módulo nativo não
 * está presente. No ambiente do jest nunca está.
 *
 * Isso quer dizer que qualquer arquivo que importe `react-native-maps`,
 * direta ou indiretamente, derruba a suíte inteira que o tocar. `MapaDoImovel`
 * importa, então toda tela que desenhar mapa passa a importar também: sem este
 * dublê, as quatro telas desta versão perderiam os testes que já têm, e o
 * sintoma seria um erro dentro de `node_modules` que ninguém associa ao mapa.
 *
 * ## Por que ele fica AQUI, e não num `jest.mock` por arquivo
 *
 * Mock de módulo do `node_modules` posto em `__mocks__/` ao lado de
 * `node_modules` é usado AUTOMATICAMENTE pelo jest, sem nenhum `jest.mock` na
 * chamada. É o que faz as quatro telas herdarem isto sem ninguém precisar
 * lembrar, e lembrar é exatamente o que não acontece.
 *
 * ## O que ele NÃO é
 *
 * Não é um mapa. Ele não desenha ladrilho, não projeta coordenada e não sabe o
 * que é zoom. Quem prova que o mapa desenha é o aparelho na mão, e a prova
 * nativa deste turno é o `BUILD SUCCEEDED` com o pod do Google dentro.
 *
 * O que ele faz é duas coisas, e as duas existem para poder ser VERIFICADAS:
 * guarda as propriedades com que foi montado (o provedor e o estilo, que é o
 * que o portão do mapa cobra) e guarda `onMapLoaded`, que é o único sinal de
 * que o Google terminou de desenhar e a única forma de exercitar o prazo que
 * substitui o `gm_authFailure` que o SDK nativo não tem.
 */

/** O valor de verdade da biblioteca, copiado de `src/ProviderConstants.ts`. */
export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;

export type PropsDoMapaDublado = Record<string, unknown>;

/**
 * O que o último mapa montado recebeu.
 *
 * Objeto e não valores soltos para o teste conseguir limpar tudo de uma vez
 * entre casos: propriedade esquecida de um caso para o outro é como uma suíte
 * passa a medir a execução anterior.
 */
export const mapaDublado: {
  props: PropsDoMapaDublado | null;
  onMapLoaded: (() => void) | null;
  /**
   * O que cada marcador recebeu, na ordem em que foi montado.
   *
   * Existe porque o marcador é a única parte do mapa que carrega DADO do
   * produto: qual tarefa é, onde ela fica, e o que acontece ao tocar nela. O
   * desenho dele ninguém prova aqui (quem desenha é o SDK nativo, e a prova é o
   * aparelho na mão), mas o dado precisa ser conferível: um mapa com os pinos
   * certos é a diferença entre o agente subir o morro certo e o errado.
   */
  marcadores: PropsDoMapaDublado[];
  /**
   * O que cada linha desenhada recebeu, na ordem em que foi montada.
   *
   * Pelo mesmo motivo dos marcadores: a linha do caminho carrega DADO (os
   * pontos que vieram da API, decodificados), e a diferença entre uma linha
   * com os pontos certos e uma com os pontos trocados é o agente entrando na
   * rua errada com o mapa dizendo que é a certa.
   */
  polilinhas: PropsDoMapaDublado[];
  /**
   * Cada pedido de mover a câmera (`animateToRegion`), na ordem: a região
   * pedida e a duração. Quem move é o SDK; o que se confere é PARA ONDE e
   * SE a peça pediu, porque a régua é "só quando o pino está fora da vista".
   */
  camera: [unknown, unknown][];
} = { props: null, onMapLoaded: null, marcadores: [], polilinhas: [], camera: [] };

export function limparMapaDublado(): void {
  mapaDublado.props = null;
  mapaDublado.onMapLoaded = null;
  mapaDublado.marcadores = [];
  mapaDublado.polilinhas = [];
  mapaDublado.camera = [];
}

/*
  `forwardRef` porque a peça segura uma referência ao mapa para mover a
  câmera. O dublê expõe só o que a peça chama.
*/
const MapView = forwardRef<{ animateToRegion: (r: unknown, d?: number) => void }, PropsDoMapaDublado>(
  function MapView(props, ref) {
  useImperativeHandle(ref, () => ({
    animateToRegion: (regiao: unknown, duracao?: number) => { mapaDublado.camera.push([regiao, duracao]); },
  }));
  mapaDublado.props = props;
  mapaDublado.onMapLoaded = (props["onMapLoaded"] as (() => void) | undefined) ?? null;
  /*
    A lista de marcadores é zerada pelo MAPA, e não pelo marcador.

    O React monta o pai antes dos filhos, então quando os marcadores se
    registram, logo abaixo, a lista já está vazia daquela renderização. Sem
    isto, uma tela que renderiza duas vezes (e toda tela deste aplicativo
    renderiza) deixaria dois marcadores por tarefa, e um caso que conta pinos
    mediria o número de renderizações.
  */
  mapaDublado.marcadores = [];
  mapaDublado.polilinhas = [];
  /*
    `createElement` e não `View(props)`: no ambiente do jest o `View` é uma
    CLASSE, e chamá-la como função morre com "Cannot call a class as a
    function", num estouro que aparece dentro do reconciliador do React, longe
    da causa.
  */
  return createElement(View, { testID: "mapa-do-google", ...props });
  },
);

/* O marcador não desenha nada, e continua não desenhando: quem o desenha é o
   SDK nativo. O que ele faz é REGISTRAR com que propriedades foi montado, para
   o teste poder conferir qual tarefa está em qual ponto e o que o toque nela
   faz. Um `View` a mais na árvore só poluiria as consultas das telas. */
export function Marker(props: PropsDoMapaDublado): null {
  /*
    Um registro por `identifier`, e o que vale é o ÚLTIMO desenho.

    O marcador re-renderiza sozinho, sem o mapa: é o que acontece quando
    `tracksViewChanges` desliga por relógio dentro dele. O mapa só zera a lista
    quando ELE renderiza, então sem esta troca o mesmo pino apareceria duas
    vezes, e um caso que lê `tracksViewChanges` encontraria primeiro a versão
    velha, ainda ligada, e daria verde para um pino que na verdade já congelou
    (ou vermelho para um que ainda não).
  */
  const id = props["identifier"];
  const posicao = id === undefined
    ? -1
    : mapaDublado.marcadores.findIndex((m) => m["identifier"] === id);
  if (posicao >= 0) mapaDublado.marcadores[posicao] = props;
  else mapaDublado.marcadores.push(props);
  return null;
}
export function Callout(): null { return null; }
/* A linha do caminho, registrada como o marcador: quem desenha é o SDK, e o
   que se confere aqui são os pontos e a cor que chegaram a ela. */
export function Polyline(props: PropsDoMapaDublado): null {
  mapaDublado.polilinhas.push(props);
  return null;
}
export function Circle(): null { return null; }

export default MapView;
