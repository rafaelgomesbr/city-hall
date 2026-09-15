import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

import type { Ponto } from "../../dados/mapa";
import { Txt, Tocavel, useTema } from "../componentes";
import { borda, espaco, icone, opacidade, raio, toque } from "../tokens";
import { DesenhoDaCriticidade } from "./DesenhoDaCriticidade";
import { PlanoEsquematico } from "./PlanoEsquematico";
import { caixaDosPontos, projetarNoPlano, type PinoNoMapa } from "./pinos";

/**
 * O MAPA DAS TAREFAS DO DIA QUANDO NÃO HÁ LADRILHO, e ele não é um consolo.
 *
 * Este é o desenho que aparece quando o município optou por não mandar
 * coordenada ao Google, quando o binário foi compilado sem a chave, ou quando o
 * Google não desenhou. Nos três casos o agente continua com o mesmo trabalho
 * para fazer, e as duas perguntas dele continuam sendo as mesmas: onde ficam as
 * minhas tarefas, e em que ordem eu subo.
 *
 * ## O que ele desenha, e por que a projeção aqui é legítima
 *
 * As tarefas projetadas entre os próprios mínimo e máximo, com o norte para
 * cima, e o agente no meio delas quando o aparelho sabe onde ele está. A razão
 * completa está em `projetarNoPlano`, em `pinos.ts`: com N pontos, a posição
 * relativa dentro do conjunto É a informação, e foi por isso que o painel
 * sempre desenhou assim.
 *
 * ## Com UMA tarefa só, ele não desenha: ele delega
 *
 * Um ponto sozinho não tem "posição relativa" a nada, e a projeção
 * degeneraria (é o parágrafo que `PlanoEsquematico` já escreve sobre dois
 * pontos indo para cantos opostos como se estivessem longe). Com uma tarefa, a
 * pergunta volta a ser a da tela de vistoria, "para que lado eu ando", e a
 * resposta é a rosa dos ventos com o rumo VERDADEIRO, que já existe e já tem
 * casos. Nesse caminho também não há pino para escolher, porque não há escolha:
 * o cartão abaixo do mapa já mostra a única tarefa.
 *
 * ## O que ele NÃO é, e isto precisa continuar escrito na tela
 *
 * Não é escala: duas tarefas a 80 metros e a 3 km ocupam o mesmo desenho, com
 * textos diferentes. Não é rua: ele não sabe que há um barranco entre dois
 * pontos. Não é bússola: o norte é o geográfico do desenho, para cima, e não
 * gira com o telefone (este aplicativo não lê a bússola, de propósito, e nem
 * declara `NSMotionUsageDescription`). A distância e o rumo de verdade saem de
 * `rotaEsquematica` e aparecem no cartão da tarefa escolhida, em palavras.
 */

/** O lado do desenho de fundo, em unidades de `viewBox`. Só relação, nunca ponto. */
const LADO = 100;

/** Marca do norte: o mesmo triângulo pequeno do plano do imóvel, no topo. */
const AGULHA_DO_NORTE = `M ${LADO / 2} 3 L ${LADO / 2 + 3} 9 L ${LADO / 2 - 3} 9 Z`;

export type PropsDoPlanoDasTarefas = {
  pinos: readonly PinoNoMapa[];
  /** Onde o aparelho diz que o agente está, ou `null` se o GPS não veio. */
  agente: Ponto | null;
};

export function PlanoDasTarefas({ pinos, agente }: PropsDoPlanoDasTarefas) {
  const tema = useTema();

  const unico = pinos.length === 1 ? pinos[0] : undefined;
  if (unico) {
    return (
      <PlanoEsquematico
        imovel={unico.ponto}
        agente={agente}
        severidade={unico.severidade}
      />
    );
  }

  /*
    A caixa inclui o AGENTE, quando ele é conhecido, e essa é a decisão que
    muda o desenho.

    Fora da caixa, ele seria desenhado num canto arbitrário ou fora do quadro.
    Dentro dela, um agente distante espreme as tarefas num canto, e isso é
    VERDADE: elas estão todas juntas, longe de onde ele está. É a informação que
    faz ele decidir se vai de carro.
  */
  const caixa = caixaDosPontos([
    ...pinos.map((p) => p.ponto),
    ...(agente ? [agente] : []),
  ]);

  const doAgente = agente && caixa ? projetarNoPlano(agente, caixa) : null;

  return (
    <View style={{ flex: 1, gap: espaco.e2, justifyContent: "center" }}>
      <View
        testID="plano-das-tarefas"
        /*
          QUADRADO, e é por isso que ele não estica com a moldura.

          Uma caixa de 3 por 4 esticaria a projeção nos dois eixos de forma
          diferente, e aí duas tarefas a nordeste uma da outra apareceriam quase
          a leste. O desenho já não promete distância; prometer a direção errada
          seria outra coisa, porque é pela direção que o agente escolhe a rua.
        */
        style={{ flex: 1, aspectRatio: 1, alignSelf: "center" }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${LADO} ${LADO}`}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          {/* O chão do desenho, na mesma superfície de todo cartão do produto.
              O canto sai do raio de cartão, dividido para a unidade deste
              `viewBox` de 100: aplicado cru, ele mal apareceria. */}
          <Rect
            x="0" y="0" width={LADO} height={LADO}
            rx={raio.cartao / 2}
            fill={tema.superficie2}
          />
          {/* Os dois eixos, discretos: eles dão ao olho um centro de referência
              sem prometer medida nenhuma. */}
          <G stroke={tema.borda} strokeWidth={borda.fio} opacity={opacidade.inativo}>
            <Line x1={LADO / 2} y1="10" x2={LADO / 2} y2={LADO - 10} />
            <Line x1="10" y1={LADO / 2} x2={LADO - 10} y2={LADO / 2} />
          </G>
          <Path d={AGULHA_DO_NORTE} fill={tema.textoDiscreto} />

          {/*
            O AGENTE, com o halo largo e apagado que se lê como "por aqui", e
            não como um ponto exato: o GPS erra metros, e um pontinho duro
            afirmaria uma precisão que o aparelho não tem.
          */}
          {doAgente && (
            <G testID="plano-agente">
              <Circle
                cx={doAgente.x * LADO}
                cy={doAgente.y * LADO}
                r="7"
                fill={tema.destaque}
                opacity={opacidade.inativo}
              />
              <Circle
                cx={doAgente.x * LADO}
                cy={doAgente.y * LADO}
                r="3"
                fill={tema.destaque}
                stroke={tema.superficie}
                strokeWidth={borda.fio}
              />
            </G>
          )}
        </Svg>

        {/*
          OS PINOS SÃO TOCÁVEIS DE VERDADE, e não formas dentro do SVG.

          Uma figura de vinte pontos dentro de um desenho é um alvo de vinte
          pontos, e a régua deste produto é 52, porque quem usa isto está em pé,
          na chuva, às vezes de luva. Cada pino é um `Tocavel` posicionado sobre
          o desenho, com o alvo inteiro e com rótulo próprio para quem ouve a
          tela: a figura fica no meio dele, do tamanho que o olho precisa.
        */}
        {caixa && pinos.map((pino) => {
          const onde = projetarNoPlano(pino.ponto, caixa);
          return (
            <Tocavel
              key={pino.id}
              testID={`pino-${pino.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(pino.escolhido) }}
              accessibilityLabel={pino.rotulo}
              onPress={() => { pino.aoTocar?.(); }}
              estilo={{
                position: "absolute",
                left: `${onde.x * 100}%`,
                top: `${onde.y * 100}%`,
                width: toque,
                height: toque,
                marginLeft: -toque / 2,
                marginTop: -toque / 2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/*
                O anel do escolhido, que é CONTORNO e não outra cor de figura: a
                cor da figura já está falando de gravidade, e uma segunda cor no
                mesmo desenho faria as duas competirem. Quem não vê o anel
                continua sabendo qual é a escolhida pelo cartão logo abaixo do
                mapa, que traz o protocolo dela.
              */}
              <View
                style={{
                  padding: espaco.e1,
                  borderRadius: raio.pilula,
                  borderWidth: pino.escolhido ? borda.enfase : 0,
                  borderColor: tema.destaque,
                }}
              >
                <DesenhoDaCriticidade severidade={pino.severidade} tamanho={icone.acao} />
              </View>
            </Tocavel>
          );
        })}
      </View>

      {/*
        O DESENHO DESMENTE A SI MESMO POR ESCRITO, porque o olho acredita no
        desenho antes de ler o número.
      */}
      <Txt variante="legenda" discreto alinhamento="center">
        O topo é o norte. O desenho mostra onde as tarefas ficam umas em relação
        às outras, e não a que distância: a distância e o rumo de cada uma estão
        no cartão dela.
      </Txt>
      {!agente && (
        <Txt variante="corpoP" alinhamento="center">
          O aparelho ainda não sabe onde você está, então o seu ponto não aparece
          no desenho.
        </Txt>
      )}
    </View>
  );
}
