import { StatusBar } from "expo-status-bar";

import { useTema } from "./componentes";

/**
 * A barra do sistema, pintada pelo tema DO APLICATIVO.
 *
 * Ela era `<StatusBar style="auto" />`, e "auto" quer dizer "pergunte ao
 * sistema". Enquanto o aplicativo também seguia o sistema, os dois nunca
 * divergiam. Com a escolha na mão do agente eles divergem no primeiro toque, e
 * o resultado é o defeito que não tem como não ser visto: o telefone no modo
 * claro, o aplicativo no escuro por escolha do agente, e a hora, o sinal e a
 * bateria desenhados em preto sobre a faixa escura do aplicativo. É a única
 * parte da tela que este produto não redesenha, e por isso a única que fica
 * ilegível sem nada na interface explicando.
 *
 * `style` aqui nomeia a cor do CONTEÚDO da barra, não a do fundo: "light" é
 * texto claro, que é o que se quer por cima de um tema escuro. Escrever o
 * inverso é o erro fácil, e ele não aparece no simulador de quem está no mesmo
 * modo dos dois lados.
 *
 * Mora num arquivo próprio, e não solto em `_layout.tsx`, porque tudo dentro
 * de `src/app` é ROTA no Expo Router: um teste que quisesse montar só isto
 * precisaria arrastar a pilha de navegação, a sessão, o push e a tela de
 * abertura junto. Aqui ele monta três linhas.
 */
export function BarraDeStatus() {
  const tema = useTema();
  return <StatusBar style={tema.escuro ? "light" : "dark"} />;
}
