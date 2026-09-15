import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import type { Severidade } from "@dc360/shared";

import type { Ponto, RotaEsquematica } from "../../dados/mapa";
import { rotaEsquematica } from "../../dados/mapa";
import { Txt, useTema } from "../componentes";
import { borda, espaco, icone, opacidade, raio } from "../tokens";
import { DesenhoDaCriticidade } from "./DesenhoDaCriticidade";

/**
 * O MAPA DE QUANDO NÃO HÁ SINAL, e ele não é um consolo.
 *
 * O ladrilho nativo do Google tem cache OPORTUNISTA: ele guarda o que já foi
 * baixado, e mais nada. Quer dizer que o trecho do morro que o agente nunca
 * abriu COM sinal abre cinza, e é exatamente ali que este aplicativo trabalha.
 * Um mapa cinza no alto do morro, na chuva, com o morador esperando, é o
 * produto dizendo que não sabe onde a casa fica.
 *
 * Este desenho funciona sempre igual, com ou sem rede, porque ele não busca
 * nada: são dois pontos que o aparelho já tem e uma conta de trigonometria.
 *
 * ## O que ele desenha
 *
 * O agente no centro, o imóvel numa direção, a seta entre os dois, e a rosa
 * dos ventos em volta. O RUMO é verdade geométrica: o ângulo desenhado é o
 * rumo calculado, então virar o corpo até a seta apontar para a frente é uma
 * instrução que funciona. A DISTÂNCIA está no texto.
 *
 * ## O que ele NÃO tenta ser, e isto precisa estar escrito
 *
 * **Não é um mapa em escala.** O raio em que o imóvel é desenhado é fixo: dois
 * pontos a 80 metros e dois pontos a 3 km produzem o mesmo desenho, com textos
 * diferentes. Fingir escala com dois pontos é pior que não ter escala, porque
 * o olho acredita no desenho antes de ler o número.
 *
 * **Não é a projeção do painel, e a diferença é de semântica.** O painel
 * projeta N ocorrências entre os seus próprios mínimo e máximo
 * (`apps/web/src/paginas/Mapa.tsx`), e ali a posição relativa dentro do
 * conjunto É a informação. Aqui são dois pontos: `min` e `max` são eles
 * mesmos, a divisão zera quando o agente chega no imóvel, e dois pontos a
 * quinze metros um do outro iriam para cantos opostos do desenho como se
 * estivessem longe. A técnica se transporta; o significado não.
 *
 * **Não é rua.** Ele não sabe que existe um barranco entre os dois pontos. A
 * seta aponta para a casa, não para o caminho até ela, e é por isso que o
 * botão de entregar ao mapa do aparelho (`abrirNoMapa`, no mesmo módulo de
 * dados) continua existindo ao lado: quem tem as regiões baixadas e sabe de
 * rota é o aplicativo de mapas do aparelho.
 *
 * **Não é norte magnético.** O "N" desenhado é o norte geográfico do desenho,
 * que é para cima, sempre. Ele não gira com o telefone, porque este aplicativo
 * não lê a bússola (e não declara `NSMotionUsageDescription`, de propósito:
 * ver `app.config.ts`). O rumo é lido como quem lê um mapa de papel.
 */

/** O lado do desenho, em unidades de `viewBox`. Só relação, nunca ponto. */
const LADO = 200;
const CENTRO = LADO / 2;

/**
 * O raio fixo em que o imóvel é desenhado.
 *
 * Fixo é a escolha, e o parágrafo "não é um mapa em escala" acima é a razão.
 * O valor deixa margem para o pino e para o anel externo caberem dentro do
 * `viewBox` sem serem cortados em nenhum dos oito rumos.
 */
const RAIO_DO_IMOVEL = 62;

/**
 * Os anéis da rosa dos ventos, que dão profundidade sem prometer distância.
 *
 * O maior é o mesmo raio em que o imóvel é desenhado, de propósito: o pino cai
 * EM CIMA do anel externo, e o desenho lê como um instrumento em vez de como
 * dois círculos e um ponto solto no meio deles.
 */
const ANEIS = [26, 44, RAIO_DO_IMOVEL];

/** Marca do norte: um triângulo pequeno no topo, e o "N" vem em texto fora do SVG. */
const AGULHA_DO_NORTE = `M ${CENTRO} 8 L ${CENTRO + 5} 18 L ${CENTRO - 5} 18 Z`;

/** Grau para radiano, com o zero apontando para CIMA e girando para a direita. */
function pontoNoAnel(graus: number, raioDoAnel: number): { x: number; y: number } {
  const radianos = ((graus - 90) * Math.PI) / 180;
  return {
    x: CENTRO + raioDoAnel * Math.cos(radianos),
    y: CENTRO + raioDoAnel * Math.sin(radianos),
  };
}

/**
 * Os `testID` do desenho existem porque o TEXTO não prova o DESENHO.
 *
 * A primeira versão dos casos deste componente conferia só as frases, e a
 * rodada de reversão pegou: trocando `?? null` por `?? 0` na linha do rumo, a
 * seta passava a ser desenhada apontando para o norte mesmo sem GPS, e os sete
 * casos continuavam verdes. Um teste cujo título diz "não inventa direção" e
 * que não olha a direção desenhada é exatamente o tipo de verde que faz uma
 * suíte parecer maior do que ela é.
 */
export type PropsDoPlano = {
  /** Onde a coordenação disse que o imóvel está. */
  imovel: Ponto;
  /** Onde o aparelho diz que o agente está, ou `null` se o GPS ainda não veio. */
  agente: Ponto | null;
  /** Quanto o desenho ocupa na tela, em pontos. */
  tamanho?: number;
  /**
   * A gravidade da ocorrência, quando a TELA que mostra este desenho também
   * mostra a legenda de criticidade. Ver o parágrafo do marcador, mais abaixo.
   *
   * Os três valores querem dizer três coisas diferentes, e a distinção é o que
   * mantém a regra de pé:
   *
   * - **ausente** (`undefined`): esta tela não fala de gravidade. É o caso da
   *   vistoria, que mostra UM imóvel e não tem legenda: ali o pino sai em tinta
   *   de texto, como sempre saiu.
   * - **`null`**: a ocorrência existe e ninguém classificou ainda. Tem forma e
   *   palavra próprias, como no `SeloSeveridade`.
   * - **uma severidade**: cor e forma da escala, com a legenda na mesma tela.
   */
  severidade?: Severidade | null;
};

/**
 * O desenho mais a frase, porque o desenho sozinho não é acessível.
 *
 * Quem ouve a tela não vê seta nenhuma, e a regra da casa é que nada se
 * comunica só por forma ou só por cor. Por isso a mesma informação sai duas
 * vezes: no traço, para quem olha de relance, e em `accessibilityLabel` mais o
 * texto abaixo, para quem lê e para quem ouve.
 */
export function PlanoEsquematico({ imovel, agente, tamanho = 200, severidade }: PropsDoPlano) {
  const tema = useTema();
  const rota: RotaEsquematica | null = rotaEsquematica(agente, imovel);
  /*
    Ver o comentário do MARCADOR, mais abaixo: quem manda aqui é a AUSÊNCIA da
    propriedade, e não o valor dela. `null` é uma ocorrência sem classificação,
    que tem forma e palavra; ausente é uma tela que não fala de gravidade.
  */
  const comCriticidade = severidade !== undefined;

  /*
    Sem GPS o desenho não inventa direção nenhuma. Desenhar a seta para cima
    "porque é o padrão" faria o agente andar para o norte por engano, que é
    exatamente o tipo de erro que este aplicativo não pode cometer.
  */
  const grausDoImovel = rota?.rumo?.graus ?? null;
  const posicaoDoImovel = grausDoImovel === null
    ? { x: CENTRO, y: CENTRO }
    : pontoNoAnel(grausDoImovel, RAIO_DO_IMOVEL);

  const legenda = rota
    ? rota.frase
    : "Ainda não sei onde você está: o aparelho está procurando o GPS. "
      + "O ponto do imóvel continua marcado.";

  return (
    <View style={{ gap: espaco.e2 }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`Plano esquemático. ${legenda}`}
        style={{
          alignSelf: "center",
          width: tamanho,
          height: tamanho,
          borderRadius: raio.cartao,
          overflow: "hidden",
        }}
      >
        <Svg width={tamanho} height={tamanho} viewBox={`0 0 ${LADO} ${LADO}`}>
          {/* O chão do desenho, na mesma superfície de todo cartão do produto. */}
          <Rect x="0" y="0" width={LADO} height={LADO} fill={tema.superficie2} rx={raio.cartao} />

          {/* A rosa dos ventos: três anéis e os quatro eixos, em fio de borda. */}
          <G stroke={tema.borda} strokeWidth={borda.fio} fill="none">
            {ANEIS.map((r) => (
              <Circle key={r} cx={CENTRO} cy={CENTRO} r={r} />
            ))}
            <Line
              x1={CENTRO} y1={CENTRO - RAIO_DO_IMOVEL}
              x2={CENTRO} y2={CENTRO + RAIO_DO_IMOVEL}
            />
            <Line
              x1={CENTRO - RAIO_DO_IMOVEL} y1={CENTRO}
              x2={CENTRO + RAIO_DO_IMOVEL} y2={CENTRO}
            />
          </G>
          <Path d={AGULHA_DO_NORTE} fill={tema.textoDiscreto} />

          {/*
            A seta do agente até o imóvel, desenhada ANTES dos dois pontos para
            passar por baixo deles: linha por cima de marcador faz o marcador
            parecer atravessado, e o olho lê isso como defeito de desenho.
          */}
          {grausDoImovel !== null && (
            <Line
              testID="plano-seta"
              x1={CENTRO}
              y1={CENTRO}
              x2={posicaoDoImovel.x}
              y2={posicaoDoImovel.y}
              stroke={tema.destaque}
              strokeWidth={borda.enfase}
              strokeLinecap="round"
            />
          )}

          {/*
            O IMÓVEL, EM TINTA DE TEXTO enquanto esta tela não tiver legenda.

            Até 15/09/2026 estava escrito aqui que o marcador NÃO leva cor de
            severidade, porque "a severidade é dita pelo selo da tarefa, com
            ícone e palavra, e pintar o pino com ela repetiria o mesmo fato numa
            linguagem que não tem legenda aqui dentro".

            A regra continua igual, e a frase também: o que mudou é que agora
            existe uma tela onde a legenda ESTÁ aqui dentro. Na tela do mapa do
            agente, `MapaDoImovel` desenha a legenda de criticidade junto com os
            pinos, no mesmo componente, e o toque no pino abre o `SeloSeveridade`
            com ícone e palavra. Lá a gravidade chega por três canais (cor, forma
            e palavra), e por isso o pino pode carregá-la.

            Na tela de vistoria nada disso existe: um imóvel só, nenhuma escala
            de comparação e nenhuma legenda. Ali `severidade` não é passada, e
            este desenho continua exatamente o que era.
          */}
          {!comCriticidade && (
            <>
              <Circle
                testID="plano-imovel"
                cx={posicaoDoImovel.x}
                cy={posicaoDoImovel.y}
                r={9}
                fill={tema.superficie}
                stroke={tema.texto}
                strokeWidth={borda.enfase}
              />
              <Circle cx={posicaoDoImovel.x} cy={posicaoDoImovel.y} r={3} fill={tema.texto} />
            </>
          )}

          {/*
            O AGENTE, no centro, quando o aparelho sabe onde ele está.

            O halo largo e apagado é o que se lê como "por aqui", e não como um
            ponto exato: o GPS erra metros, e um pontinho duro afirmaria uma
            precisão que o aparelho não tem.
          */}
          {agente && (
            <G testID="plano-agente">
              <Circle
                cx={CENTRO}
                cy={CENTRO}
                r={14}
                fill={tema.destaque}
                opacity={opacidade.inativo}
              />
              <Circle
                cx={CENTRO}
                cy={CENTRO}
                r={6}
                fill={tema.destaque}
                stroke={tema.superficie}
                strokeWidth={borda.enfase}
              />
            </G>
          )}
        </Svg>

        {/*
          O PINO DE CRITICIDADE fica POR CIMA do desenho, e não dentro dele.

          Ele é o mesmo `DesenhoDaCriticidade` que o mapa do Google e a legenda
          usam, e `react-native-svg` não aceita um `<Svg>` dentro de outro. Um
          `<Path>` com a mesma geometria copiada para cá seria a segunda cópia
          de um vocabulário que existe justamente para não ter duas (e que hoje
          mora em `@dc360/shared`, junto com o painel): a primeira vez que
          alguém trocasse o triângulo da severidade alta, a legenda passaria a
          descrever um pino que não está no desenho. O portão de paridade em
          `scripts/paridade-de-severidade.test.mjs` reprova a cópia.

          A conversão é de unidade de `viewBox` para PONTO, que é onde o estilo
          do React Native vive: o desenho é quadrado, então a mesma razão vale
          nos dois eixos.
        */}
        {comCriticidade && (
          <View
            testID="plano-imovel"
            style={{
              position: "absolute",
              left: (posicaoDoImovel.x / LADO) * tamanho - icone.acao / 2,
              top: (posicaoDoImovel.y / LADO) * tamanho - icone.acao / 2,
            }}
          >
            <DesenhoDaCriticidade severidade={severidade ?? null} tamanho={icone.acao} />
          </View>
        )}
      </View>

      {/*
        A mesma informação em palavra. O "N" do norte vem aqui e não dentro do
        SVG porque `<Text>` do `react-native-svg` não passa por `familiaDoTexto`
        e sairia na fonte do sistema, com o portão de design reprovando junto.
      */}
      <Txt variante="legenda" discreto alinhamento="center">
        O topo do desenho é o norte. O desenho mostra a direção, não a distância.
      </Txt>
      <Txt variante="corpoP" alinhamento="center">{legenda}</Txt>
      {rota?.rumo && (
        <Txt variante="legenda" discreto alinhamento="center" mono>
          {`${rota.distancia} · rumo ${rota.rumo.sigla} (${Math.round(rota.rumo.graus)}°)`}
        </Txt>
      )}
    </View>
  );
}
