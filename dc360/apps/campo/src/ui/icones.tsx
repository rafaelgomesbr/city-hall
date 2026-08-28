import Svg, { Circle, Path } from "react-native-svg";

/**
 * Os três ícones da barra inferior, desenhados à mão.
 *
 * Sem biblioteca de ícones de propósito. O `react-native-svg` já está aqui,
 * porque a assinatura em campo depende dele, e três traçados custam menos que
 * um pacote novo com o seu ciclo de versão. Este aplicativo acabou de perder
 * uma tarde por incompatibilidade de dependência transitiva; a régua para
 * acrescentar mais uma subiu.
 *
 * Traço e não preenchimento, porque a barra distingue o item ativo pela COR do
 * traço mais o peso do rótulo. E o rótulo está sempre lá: a regra do
 * aplicativo é que nada se comunica só por cor, e ícone sozinho falha pela
 * mesma razão, com o agravante de que o agente usa isto duas vezes por semana
 * e não decora pictograma.
 */

/* `cor` vem do `tabBarIcon`, que entrega `ColorValue` e não `string`. */
type Props = { cor: import("react-native").ColorValue; tamanho?: number };

/** Prancheta: a lista do que fazer. */
export function IconeTarefas({ cor, tamanho = 24 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z"
        stroke={cor} strokeWidth={1.8} strokeLinejoin="round"
      />
      <Path
        d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16"
        stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M8.5 11.5h7M8.5 15.5h4" stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Seta subindo para uma nuvem: o que ainda vai sair do aparelho. */
export function IconeEnvio({ cor, tamanho = 24 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 18.5A3.5 3.5 0 0 1 6 11.6a5 5 0 0 1 9.7-1.4A3.9 3.9 0 0 1 18 18.5"
        stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M12 20.5v-8m0 0-2.6 2.6M12 12.5l2.6 2.6"
        stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Duas pessoas: a equipe. */
export function IconeEquipe({ cor, tamanho = 24 }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={9.5} cy={8} r={3.2} stroke={cor} strokeWidth={1.8} />
      <Path
        d="M3.8 19.2a5.7 5.7 0 0 1 11.4 0"
        stroke={cor} strokeWidth={1.8} strokeLinecap="round"
      />
      <Path
        d="M16.2 5.2a3.2 3.2 0 0 1 0 5.6M17.6 14.2a5.7 5.7 0 0 1 2.6 5"
        stroke={cor} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}
