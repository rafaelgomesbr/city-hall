import { View, type ColorValue } from "react-native";

import { Txt } from "./componentes";
import { espaco, icone, peso, raio } from "./tokens";

/**
 * O CRACHÁ NUMÉRICO, que a barra padrão posicionava sozinha e agora tem dono.
 *
 * Ele nasceu dentro de `ui/BarraDeAbas.tsx`, sem exportação, porque a barra era
 * o único lugar do aplicativo que desenhava número sobre ícone. O sino do
 * cabeçalho (`ui/Sino.tsx`) passou a ser o segundo, e o dono pediu O MESMO
 * número no avatar do menu e no sino: dois desenhos do mesmo crachá em dois
 * arquivos é como o número da fila e o número dos avisos passam a ter tamanhos
 * diferentes no mesmo aparelho sem ninguém ter decidido isso.
 *
 * A EXTRAÇÃO FOI PELA METADE, de propósito e com aviso: a barra é de outra
 * frente, e a cópia que mora lá dentro continua lá até essa frente trocar a
 * função local por este arquivo. Enquanto as duas existirem, elas precisam
 * concordar, e concordam: este é o desenho de lá, sem mudar um número. Quem
 * passar por `BarraDeAbas.tsx` apaga a de lá, importa esta e usa uma só.
 *
 * Número, e não pontinho colorido: o agente precisa saber QUANTAS coletas
 * esperam e QUANTOS avisos chegaram, porque é o número que decide se vale
 * abrir agora. A cor vem de fora, porque ela é semântica e mora onde a
 * contagem é feita: o crachá da fila muda quando há item com problema, e o do
 * sino é de outra cor porque conta outra coisa.
 *
 * Ele fica sobre o canto do ícone, e não ao lado da palavra: ao lado,
 * empurraria o rótulo e mudaria a largura da coluna toda vez que a fila
 * passasse de um dígito para dois.
 */
export function Cracha({ texto, fundo, cor, testID }: {
  texto: string;
  fundo: ColorValue;
  cor: string;
  testID: string;
}) {
  return (
    <View
      /* Quem fala é o tocável inteiro, e o número já está dentro da frase dele
         ("Envio, 4 na fila, ...", "Avisos, 3 por ler"). Um crachá que falasse
         poria o número solto entre o rótulo e o elemento seguinte. */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={{
        position: "absolute",
        /*
          A âncora é o canto de cima do bloco do ícone, deslocada por tokens: o
          crachá encosta no ícone sem sair da coluna nem tocar a borda da barra.
        */
        top: -espaco.e1,
        left: icone.acao - espaco.e2,
        /*
          `minHeight` e não `height`, pela mesma razão do item da barra: com a
          fonte grande do sistema o número cresce, e uma caixa fixa o cortaria
          pela metade justamente para quem aumentou a fonte por precisar dela.
        */
        minWidth: espaco.e4,
        minHeight: espaco.e4,
        paddingHorizontal: espaco.e1,
        borderRadius: raio.pilula,
        backgroundColor: fundo,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variante="legenda" peso={peso.negrito} cor={cor}>{texto}</Txt>
    </View>
  );
}
