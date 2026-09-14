import { createElement } from "react";
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
} = { props: null, onMapLoaded: null };

export function limparMapaDublado(): void {
  mapaDublado.props = null;
  mapaDublado.onMapLoaded = null;
}

function MapView(props: PropsDoMapaDublado) {
  mapaDublado.props = props;
  mapaDublado.onMapLoaded = (props["onMapLoaded"] as (() => void) | undefined) ?? null;
  /*
    `createElement` e não `View(props)`: no ambiente do jest o `View` é uma
    CLASSE, e chamá-la como função morre com "Cannot call a class as a
    function", num estouro que aparece dentro do reconciliador do React, longe
    da causa.
  */
  return createElement(View, { testID: "mapa-do-google", ...props });
}

/* O marcador não desenha nada: quem o confere é o teste do componente, pelas
   propriedades que o mapa recebeu, e um `View` a mais só polui a árvore. */
export function Marker(): null { return null; }
export function Callout(): null { return null; }
export function Polyline(): null { return null; }
export function Circle(): null { return null; }

export default MapView;
