import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { router } from "expo-router";

import { Cracha } from "./Cracha";
import { Tocavel, useTema } from "./componentes";
import { useGuardaDeSaida } from "./GuardaDeSaidaDaVistoria";
import { IconeSino } from "./icones";
import { easing, icone, movimento, toque, type CurvaDeEasing } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";
import {
  fraseDoSino, textoDoCracha, useContagemDeAvisos, type ContagemDeAvisos,
} from "../dados/avisos";

/**
 * O SINO DO CABEÇALHO: a porta dos avisos, à direita, em toda tela.
 *
 * O pedido, na letra de quem paga: "falta o sininho de notificações, poderia
 * ter uma aparência mais caprichada". Até aqui os avisos do município moravam
 * escondidos dentro do Perfil, com um crachá na aba dizendo quantos havia, e o
 * cabeçalho de `perfil.tsx` defendia isso com quatro razões. A primeira delas
 * era que o sino precisa de rede e toda tela abre do disco, então um sino fixo
 * no topo ficaria vazio ou velho justamente no morro, ao lado da faixa de
 * sincronização, que nunca mente.
 *
 * A decisão do dono desfaz a CONCLUSÃO e mantém a razão. O sino está no topo,
 * mas ele não pede rede: **lê o disco, e só o disco**, pelo mesmo gancho que a
 * barra usa para o avatar. O que ele mostra no morro é o que já estava
 * guardado, que é exatamente o que a faixa ao lado promete sobre tudo o mais.
 * Quem fala com o servidor é a tela de avisos, na abertura, como o Perfil
 * fazia. Assim os dois indicadores do topo continuam dizendo a verdade, um
 * sobre o presente (a faixa) e outro sobre o que já chegou (o sino).
 *
 * ## O balanço, e por que só na subida
 *
 * Quando a contagem no disco SOBE, o sino balança uma vez, curto, em torno do
 * pino de cima. Sobe quer dizer que chegou aviso novo, e o balanço é a única
 * coisa nesta peça que existe para chamar o olho sem o agente ter perguntado.
 *
 * Descer não balança, e a ausência é decisão: descer é o agente lendo, e
 * comemorar a leitura dele seria o sino tocando por causa do próprio agente,
 * que é ruído no lugar de sinal. A primeira leitura do disco também não é
 * chegada: cada aba monta o seu sino quando abre pela primeira vez, e três
 * avisos que já estavam guardados não acabaram de chegar só porque o agente
 * trocou de aba. Sem essa distinção, o sino balançaria a cada troca de aba do
 * dia inteiro, e um sino que toca por nada é um sino que ninguém mais olha.
 *
 * Quem pediu redução de movimento não recebe balanço nenhum: o número no
 * crachá já diz que chegou coisa nova, e a chave existe porque animação dá
 * enjoo em quem este aplicativo põe em pé num barranco.
 */

/**
 * Quantos graus o sino inclina para cada lado.
 *
 * Catorze, e não trinta: o alvo é um aceno no canto do olho, não um sino de
 * igreja. Acima disso o desenho sai da caixa do ícone e o crachá, que fica
 * parado, passa a parecer que se descolou dele.
 */
export const INCLINACAO_DO_SINO = 14;

/**
 * O percurso do balanço, perna a perna.
 *
 * Três pernas, e a razão de serem três é o que separa um sino de um ponteiro:
 * ele vai para um lado com o CLÍMAX (a única curva do produto que passa do alvo
 * e volta, que é o que dá a sensação de badalada), cruza para o outro lado com
 * menos força e assenta no centro. Uma ida e volta só leria como um empurrão.
 *
 * `fracao` é a parte de `movimento.mudancaDeEstado` que cada perna leva; as
 * três somam um, então o balanço inteiro dura o que uma mudança de estado dura.
 * O número é um só, do token, e não um `duration` escolhido aqui.
 */
const PERCURSO_DO_BALANCO: readonly { ate: number; fracao: number; curva: CurvaDeEasing }[] = [
  { ate: 1, fracao: 0.4, curva: easing.climax },
  { ate: -0.5, fracao: 0.3, curva: easing.entrada },
  { ate: 0, fracao: 0.3, curva: easing.saida },
];

/**
 * O balanço em si: um valor animado que vai de -1 a 1, e a função que o dispara.
 *
 * Mora em gancho próprio para a regra "só na subida" ficar num lugar só e ser
 * lida sem o desenho em volta. `contagem.lida` é a linha de base: enquanto o
 * disco não respondeu, não há "antes" para comparar.
 */
function useBalancoDoSino(contagem: ContagemDeAvisos): Animated.Value {
  const reduzirMovimento = useReducaoDeMovimento();
  const balanco = useRef(new Animated.Value(0)).current;
  const anterior = useRef<number | null>(null);

  useEffect(() => {
    if (!contagem.lida) return;
    const antes = anterior.current;
    anterior.current = contagem.porLer;
    if (antes === null || contagem.porLer <= antes) return;
    if (reduzirMovimento) return;

    /*
      Um balanço que ainda está no meio é interrompido e recomeça do centro:
      duas chegadas seguidas produzem um balanço, e não dois somados num
      tremor.
    */
    balanco.stopAnimation();
    balanco.setValue(0);
    Animated.sequence(
      PERCURSO_DO_BALANCO.map((perna) => Animated.timing(balanco, {
        toValue: perna.ate,
        duration: movimento.mudancaDeEstado * perna.fracao,
        easing: Easing.bezier(...perna.curva),
        /* Na thread de interface: o JavaScript pode estar drenando a fila de
           uma manhã inteira de vistorias no exato instante em que o aviso chega. */
        useNativeDriver: true,
      })),
    ).start();
  }, [contagem.lida, contagem.porLer, reduzirMovimento, balanco]);

  return balanco;
}

export function Sino({ testID = "sino" }: { testID?: string }) {
  const tema = useTema();
  const contagem = useContagemDeAvisos();
  const balanco = useBalancoDoSino(contagem);
  const cracha = textoDoCracha(contagem);
  /*
    O sino também é uma SAÍDA da vistoria, e a barra promete perguntar antes
    de sair de vistoria começada. Um sino que saísse sem perguntar quebraria a
    promessa na mesma tela. A pergunta é a mesma da barra, pela mesma guarda
    (`GuardaDeSaidaDaVistoria`); fora do provedor, ele segue direto.
  */
  const guarda = useGuardaDeSaida();

  /*
    O EIXO DO BALANÇO É O PINO DE CIMA, e não o centro do desenho.

    O React Native gira em torno do centro. Um sino que gira pelo centro vira um
    ponteiro de relógio; o de verdade pende do pino e a boca é o que se move.
    Levar o desenho para cima, girar e trazer de volta é o que põe o eixo no
    pino: meio ícone para cima, que é onde o pino de `IconeSino` está.
  */
  const meioIcone = icone.acao / 2;
  const rotacao = balanco.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [`${-INCLINACAO_DO_SINO}deg`, "0deg", `${INCLINACAO_DO_SINO}deg`],
  });

  return (
    <Tocavel
      testID={testID}
      accessibilityRole="button"
      /* Quem ouve a tela não vê crachá nenhum: a frase carrega o número. */
      accessibilityLabel={fraseDoSino(contagem)}
      onPress={() => { guarda.antesDeSair("Avisos", () => { router.push("/(agente)/avisos"); }); }}
      estilo={{
        minHeight: toque,
        minWidth: toque,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/*
        O crachá fica FORA do que gira, e é irmão do sino: um número que
        balançasse junto pareceria descolado do ícone, e o número é o que o
        agente lê de relance.
      */}
      <View style={{ width: icone.acao, height: icone.acao }}>
        <Animated.View
          style={{
            transform: [
              { translateY: -meioIcone },
              { rotate: rotacao },
              { translateY: meioIcone },
            ],
          }}
        >
          <IconeSino cor={tema.texto} tamanho={icone.acao} />
        </Animated.View>
        {cracha !== null && (
          <Cracha
            testID="cracha-do-sino"
            texto={cracha}
            /*
              `alertaTexto` e não `destaque`, pela mesma razão do crachá da aba
              Perfil: o crachá da fila já é violeta, e o sino conta outra coisa
              (notícia do município, e não trabalho que ainda não subiu). E
              `sobreDestaque` para o número, porque branco escrito à mão acerta
              num tema e some no outro. O par é medido no portão de contraste.
            */
            fundo={tema.alertaTexto}
            cor={tema.sobreDestaque}
          />
        )}
      </View>
    </Tocavel>
  );
}
