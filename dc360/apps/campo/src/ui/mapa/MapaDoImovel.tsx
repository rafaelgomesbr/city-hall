import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from "react-native-maps";

import type { Ponto } from "../../dados/mapa";
import { PRAZO_DO_MAPA_MS } from "../../dados/mapa";
import { Carregando, Txt, useTema } from "../componentes";
import { borda, espaco, icone, movimento, raio } from "../tokens";
import { DesenhoDaCriticidade, LegendaDeCriticidade } from "./DesenhoDaCriticidade";
import { ModoDoMapaDito } from "./ModoDoMapaDito";
import { PlanoDasTarefas } from "./PlanoDasTarefas";
import { PlanoEsquematico } from "./PlanoEsquematico";
import { estiloDoGoogle } from "./estilo-do-google";
import type { PinoNoMapa } from "./pinos";
import type { EstadoDoMapa } from "./useMapaDoMunicipio";

/**
 * O MAPA, a peça que as telas consomem, em dois feitios.
 *
 * Ela junta as decisões que já moram em outros arquivos e não toma nenhuma
 * nova: o modo (`decidirModoDoMapa`), o estilo (`estiloDoGoogle`) e o desenho
 * de reserva (`PlanoEsquematico` para um imóvel, `PlanoDasTarefas` para N). O
 * que ela acrescenta é o prazo, que é a parte que só existe aqui porque só aqui
 * há um mapa montado para observar.
 *
 * ## Um imóvel, ou N pinos, e por que a peça é a mesma
 *
 * Até 15/09/2026 ela desenhava um imóvel só, e isso estava escrito como
 * decisão: "um mapa só, do imóvel FOCADO, e não N pinos espalhados: o agente
 * não precisa de uma visão geral do município (essa é do coordenador)". O medo
 * era o agente cair na tela do coordenador, e ele continua de pé: o que a tela
 * do agente desenha são as TAREFAS DELE, na mesma ordem da lista dele, e nunca
 * a ocorrência de outra equipe. Nada aqui busca ocorrência nenhuma: os pinos
 * chegam prontos de quem já tem a lista.
 *
 * O que caiu foi a parte de "um só". Quem paga pediu, com a tela na mão, o mapa
 * das tarefas do dia com o ponto de cada uma, e a razão dele é a mesma do
 * roteiro: com um pino por vez, escolher em que ordem subir o morro exige
 * trocar de tarefa e olhar de novo, uma por uma.
 *
 * ## Provedor Google nos DOIS lados
 *
 * `PROVIDER_GOOGLE` no iOS e no Android. O Apple Maps não aceita paleta
 * própria, e o pedido foi explícito: "personalizar da nossa maneira", "algo
 * como o Uber faz". Um mapa com a paleta da Apple dentro de um produto com a
 * nossa é uma página de terceiro embutida, não uma superfície de trabalho.
 *
 * A armadilha, e ela é silenciosa: no iOS, `PROVIDER_GOOGLE` só faz efeito se
 * o pod do Google estiver dentro do binário, e o plugin só o acrescenta quando
 * `DC360_MAPS_CHAVE_IOS` existe no momento do `prebuild`. Sem ela, o
 * `PROVIDER_GOOGLE` é ignorado e o Apple Maps desenha no lugar, com o nosso
 * estilo jogado fora e sem erro nenhum. É por isso que `decidirModoDoMapa`
 * recusa o modo Google quando o binário não tem chave, em vez de tentar: uma
 * tela que parece certa e está errada não é descoberta por ninguém.
 */

type PropsComuns = {
  /** Onde o aparelho diz que o agente está, ou `null` se o GPS ainda não veio. */
  agente?: Ponto | null;
  /**
   * O que `useMapaDoMunicipio` devolveu, INTEIRO, e não desmontado em três
   * propriedades.
   *
   * A tela chama o gancho e repassa o resultado. Desmontar obrigaria cada uma
   * das telas a ligar três fios à mão, e o dia em que aparecesse um quarto fio
   * (foi o que aconteceu com `desistirDeEsperar`, que o portão de design cobrou
   * depois da primeira versão) todas precisariam ser lembradas, uma a uma. Quem
   * esquecesse teria uma tela que compila e que se comporta diferente das outras.
   */
  mapa: EstadoDoMapa;
  /**
   * A altura da moldura, em pontos, ou `"preencher"`.
   *
   * `"preencher"` existe para a tela do mapa, onde o mapa é a superfície de
   * trabalho e não uma ilustração dentro de um formulário. Ali a altura é o que
   * sobra depois do cabeçalho, do cartão e da lista, e o número só existe em
   * tempo de layout: medir com `onLayout` para devolver o número obrigaria a
   * tela a não desenhar nada no primeiro quadro e a saltar no segundo.
   *
   * As legendas (a de modo e a de criticidade) ficam FORA da altura preenchida,
   * e isso é a razão de a opção existir: elas nunca podem ser empurradas para
   * fora da tela por um mapa que cresceu.
   */
  altura?: number | "preencher";
  /**
   * O caminho por ruas até a tarefa escolhida, quando o agente PEDIU.
   *
   * Uma lista de pontos, já decodificada por `src/dados/rota.ts`, ou nada. É
   * desenhado como linha na cor de destaque por cima dos ladrilhos, e só no
   * mapa do Google: no plano esquemático a rota não existe, porque o plano é o
   * mapa de quem está sem sinal, e sem sinal ninguém pede caminho. A distância
   * e o rumo em linha reta continuam na frase do cartão nos dois modos.
   *
   * Nunca é buscado por esta peça. Ela desenha o que recebe, e quem decide se
   * há algo a receber é o botão "Ver o caminho" da tela, um toque por vez.
   */
  caminho?: readonly Ponto[] | null;
  /**
   * Quantos pontos da BORDA DE BAIXO estão cobertos por outra coisa.
   *
   * Não encolhe o desenho: encolhe a área ÚTIL. Os ladrilhos continuam
   * preenchendo a moldura inteira por baixo do que a cobre (encolher o mapa
   * deixaria uma tarja vazia aparecendo na borda no meio de um arraste), e o
   * que passa a considerar só a faixa visível é o centro, o enquadramento e os
   * controles.
   *
   * Só faz sentido com altura em NÚMERO: o teto que impede a área útil de zerar
   * é uma fração dela. Com `"preencher"` nada cobre o mapa, porque a tela que
   * preenche é justamente a que deixou de empilhar folha sobre folha.
   */
  recuoInferior?: number;
};

export type PropsDoMapa = PropsComuns & (
  | {
    /** Onde a coordenação disse que o imóvel está. */
    imovel: Ponto;
    /** O que o marcador anuncia a quem lê a tela em voz alta. */
    rotulo: string;
    pinos?: undefined;
  }
  | {
    /**
     * As tarefas do dia, na ordem da lista, e pelo menos uma.
     *
     * Vazio não é desenhável: um mapa sem ponto nenhum abriria centrado na ilha
     * nula, no golfo da Guiné. Quem tem a lista é quem sabe dizer se ela está
     * vazia e por quê (nenhuma tarefa, ou nenhuma com coordenada), e as duas
     * frases são diferentes na tela.
     */
    pinos: readonly PinoNoMapa[];
    imovel?: undefined;
    rotulo?: undefined;
  }
);

/**
 * Quanto da moldura o recuo pode comer, no máximo.
 *
 * Uma folha em `cheia` pede 92%, e o dia em que alguém pedir a moldura inteira o
 * mapa ficaria com área útil zero ou negativa: o SDK responde a isso deslocando
 * o centro para fora do mundo desenhado, e ninguém associa o sintoma à folha.
 * Oitenta e cinco por cento deixa sempre uma faixa onde o pino cabe.
 */
const TETO_DO_RECUO = 0.85;

/**
 * Quanto do mundo cabe na tela, em graus, quando só há um ponto conhecido.
 *
 * Cerca de 400 metros de lado na latitude de Florianópolis: perto o bastante
 * para a rua ter nome legível e largo o bastante para o quarteirão inteiro
 * caber. Quando há mais de um ponto, este valor vira o PISO: o enquadramento
 * passa a ser calculado para todos caberem.
 */
const ABERTURA_PADRAO = 0.004;

/** Folga em volta dos pontos, para nenhum deles encostar na moldura. */
const FOLGA = 2.2;

/**
 * O MARCADOR DE CRITICIDADE, no mapa de ruas.
 *
 * Ver `criticidade.ts` para o argumento inteiro de por que o pino leva
 * gravidade: cor, forma e a legenda que esta mesma peça desenha logo abaixo.
 *
 * ## `tracksViewChanges`, e o pino que não aparecia
 *
 * Marcador com filho próprio é redesenhado em bitmap a cada quadro enquanto
 * essa propriedade for verdadeira, e com dez ou vinte pinos isso derruba a
 * taxa de quadros justamente no aparelho barato que este produto precisa
 * atender. Por isso ela precisa DESLIGAR. A pergunta é quando.
 *
 * A versão anterior desligava 260 ms depois de montar (`movimento.mudancaDeEstado`),
 * e isso produziu a captura de quem paga: a legenda dizia "Crítica" e o mapa
 * estava vazio. `tracksViewChanges={false}` congela o marcador no bitmap do
 * que estiver desenhado NAQUELE instante, e o desenho do pino é SVG
 * (`react-native-svg`), que no iOS pinta de forma assíncrona, num quadro que
 * não é o do React. Se o SVG ainda não tinha pintado quando o relógio bateu,
 * o bitmap capturado era vazio, e ficava vazio até `severidade` ou
 * `escolhido` mudarem, o que numa lista de uma tarefa nunca acontece. Os 260
 * ms não bastavam porque eles contavam desde a MONTAGEM DO REACT, e o mapa do
 * Google, os ladrilhos e o SVG do pino pintam depois disso, em ordem que o
 * JavaScript não vê.
 *
 * O que decide agora é um sinal que o SDK dá: `onMapLoaded`, "quando o mapa
 * terminou de desenhar todos os ladrilhos". Só a partir dele a peça começa a
 * contar a transição, e desliga a captura depois dela. Uma mudança de estado
 * inteira depois de o mapa inteiro estar pintado é folga de sobra para o SVG
 * de um pino. E toda mudança de `severidade` ou `escolhido` religa a captura
 * (o anel do escolhido precisa aparecer) e volta a contar.
 */
function MarcadorDeCriticidade({ pino, mapaDesenhou }: { pino: PinoNoMapa; mapaDesenhou: boolean }) {
  const tema = useTema();
  const [capturando, setCapturando] = useState(true);

  useEffect(() => {
    setCapturando(true);
    /*
      Enquanto o mapa não disse que desenhou, não há relógio nenhum: o pino
      continua sendo capturado a cada quadro, porque ainda não existe um
      quadro em que se possa confiar. É o custo de alguns milissegundos de
      redesenho durante a abertura, contra um mapa vazio para o resto do dia.
    */
    if (!mapaDesenhou) return;
    const relogio = setTimeout(() => { setCapturando(false); }, movimento.mudancaDeEstado);
    return () => { clearTimeout(relogio); };
  }, [mapaDesenhou, pino.severidade, pino.escolhido]);

  return (
    <Marker
      identifier={pino.id}
      coordinate={pino.ponto}
      onPress={pino.aoTocar}
      tracksViewChanges={capturando}
      /* O desenho é centrado NO ponto, e não pendurado acima dele: a figura é
         uma marca de lugar, e não um alfinete com haste. */
      anchor={{ x: 0.5, y: 0.5 }}
      accessibilityLabel={pino.rotulo}
    >
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
    </Marker>
  );
}

/**
 * Quanto o traço do caminho mede, em pontos.
 *
 * Grosso o bastante para ser visto por cima de uma rua desenhada, e não tanto
 * que esconda o nome dela. Não é token porque não é espaçamento, raio nem
 * borda de peça: é espessura de traço sobre mapa, e o único outro traço do
 * produto (o do plano esquemático) tem a própria conta em SVG.
 */
const ESPESSURA_DO_CAMINHO = 5;

export function MapaDoImovel(props: PropsDoMapa) {
  const { agente = null, mapa, altura = 220, recuoInferior = 0, caminho = null } = props;
  const { decisao, aoGoogleNaoDesenhar, desistirDeEsperar } = mapa;
  const tema = useTema();
  const [desenhou, setDesenhou] = useState(false);
  const modo = decisao?.modo ?? null;

  /*
    O PRAZO, que é o `gm_authFailure` que o SDK nativo não tem.

    Ele só começa a contar quando o mapa do Google está de fato montado, e ele
    é cancelado assim que `onMapLoaded` chega. Montar o relógio antes disso
    (por exemplo, no primeiro quadro da tela) faria o prazo correr durante a
    espera pela configuração, e uma configuração lenta derrubaria o mapa antes
    de ele existir.
  */
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (modo !== "google" || desenhou) return;
    relogio.current = setTimeout(aoGoogleNaoDesenhar, PRAZO_DO_MAPA_MS);
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = null;
    };
  }, [modo, desenhou, aoGoogleNaoDesenhar]);

  const preenche = altura === "preencher";
  const alturaEmPontos = preenche ? null : altura;
  /* Nunca negativo e nunca a moldura toda. Ver `TETO_DO_RECUO`. */
  const reservado = alturaEmPontos === null
    ? 0
    : Math.min(Math.max(0, recuoInferior), alturaEmPontos * TETO_DO_RECUO);

  const moldura = {
    ...(alturaEmPontos === null ? { flex: 1 } : { height: alturaEmPontos }),
    borderRadius: raio.cartao,
    borderWidth: borda.fio,
    borderColor: tema.borda,
    backgroundColor: tema.superficie2,
    overflow: "hidden" as const,
  };

  /*
    Enquanto a configuração não chega, a tela não desenha mapa NENHUM, e não
    cai no plano esquemático "enquanto isso". Ver o parágrafo do estado de
    espera em `useMapaDoMunicipio`: a legenda de modo é o que prova ao município
    que a coordenada não está saindo daqui, e uma legenda que muda sozinha um
    segundo depois já disse uma coisa falsa.
  */
  if (!decisao) {
    return (
      <View
        testID="moldura-do-mapa"
        style={[moldura, { alignItems: "center", justifyContent: "center" }]}
      >
        <Carregando
          mensagem="Vendo como o seu município configurou o mapa"
          aoDesistir={desistirDeEsperar}
          rotuloDaSaida="Desenhar sem o mapa do Google"
        />
      </View>
    );
  }

  /*
    UM feitio ou o outro, resolvido aqui e uma vez só.

    O imóvel sozinho vira um pino SEM criticidade (`severidade` fica ausente, e
    a ausência é o que diz "esta tela não fala de gravidade"): é a tela de
    vistoria, onde há uma casa só e nenhuma legenda. Ver o comentário do
    marcador em `PlanoEsquematico`.
  */
  const alvo = props.pinos !== undefined
    ? { feitio: "pinos" as const, pinos: props.pinos }
    : { feitio: "imovel" as const, imovel: props.imovel, rotulo: props.rotulo };
  const pontos = alvo.feitio === "pinos"
    ? alvo.pinos.map((p) => p.ponto)
    : [alvo.imovel];
  const janela = enquadrar(pontos, agente);

  return (
    <View style={{ gap: espaco.e2, ...(preenche ? { flex: 1 } : {}) }}>
      {/*
        A MOLDURA é o mapa, e só o mapa. As legendas vêm depois dela, como
        irmãs: a altura pedida pela tela é a altura DO MAPA, e a legenda de
        modo nunca pode ser empurrada para fora da tela por um mapa que
        cresceu, porque é ela que responde para onde a coordenada das
        famílias está indo.
      */}
      <View testID="moldura-do-mapa" style={moldura}>
        {!janela ? (
          /*
            Nada para enquadrar. A tela que tem a lista é quem sabe dizer por
            quê, e ela diz: aqui fica só o desenho que não mente, que é nenhum.
          */
          <View testID="mapa-sem-ponto" style={{ flex: 1, justifyContent: "center", padding: espaco.e3 }}>
            <Txt variante="corpoP" discreto alinhamento="center">
              Não há ponto para desenhar no mapa.
            </Txt>
          </View>
        ) : decisao.modo === "google" ? (
          <MapView
            /*
              Nos dois lados, e de propósito. Ver o cabeçalho deste arquivo.
            */
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            customMapStyle={estiloDoGoogle(tema)}
            /*
              `initialRegion` e não `region`, e a diferença é de quem manda na
              câmera.

              Com `region`, o mapa é CONTROLADO: toda renderização da tela
              devolve a câmera para onde a propriedade diz, e o agente que
              arrasta para ver a rua vizinha vê o mapa voltar sozinho enquanto o
              dedo ainda está na tela. Com `initialRegion`, o enquadramento é
              feito uma vez, com todos os pontos dentro (ver `enquadrar`), e
              depois a câmera é dele.

              É por isso que escolher outro pino NÃO move o mapa: não precisa,
              porque o que ele escolheu já está enquadrado desde a abertura, e
              mover seria tirar da tela o que ele estava olhando para responder
              uma pergunta que ele não fez.
            */
            initialRegion={janela}
            /*
              A faixa coberta por outra peça. Ver `recuoInferior` em `PropsComuns`.
            */
            mapPadding={{ top: 0, right: 0, bottom: reservado, left: 0 }}
            /*
              O mapa é para OLHAR e não para explorar: a informação é onde as
              casas ficam em relação a onde o agente está. Rotação e inclinação
              transformam um relance em três gestos para voltar ao norte, e
              quem está de luva na chuva não volta.
            */
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            /*
              O ponto azul do sistema, que é o desenho que todo mundo já
              reconhece, e que não custa uma permissão a mais: o aplicativo já
              pede localização em primeiro plano para carimbar a vistoria.
            */
            showsUserLocation={Boolean(agente)}
            showsMyLocationButton={false}
            /*
              O único sinal de que o Google terminou. A biblioteca o documenta
              como "quando o mapa terminou de desenhar todos os ladrilhos", e é
              ele que cancela o prazo acima. `onMapReady` NÃO serve: ele dispara
              com a chave recusada do mesmo jeito, porque a vista foi criada.
            */
            onMapLoaded={() => { setDesenhou(true); }}
            accessibilityLabel={
              alvo.feitio === "pinos"
                ? `Mapa com ${alvo.pinos.length} tarefas suas`
                : `Mapa do local: ${alvo.rotulo}`
            }
          >
            {/*
              O caminho vai ANTES dos marcadores, e a ordem é o que decide quem
              fica por cima: a linha passa por baixo dos pinos, e o pino da
              tarefa continua legível no fim dela.
            */}
            {caminho && caminho.length > 1 && (
              <Polyline
                coordinates={[...caminho]}
                strokeColor={tema.destaque}
                strokeWidth={ESPESSURA_DO_CAMINHO}
              />
            )}
            {alvo.feitio === "pinos"
              ? alvo.pinos.map((pino) => (
                <MarcadorDeCriticidade key={pino.id} pino={pino} mapaDesenhou={desenhou} />
              ))
              : (
                <Marker
                  coordinate={alvo.imovel}
                  title={alvo.rotulo}
                  /*
                    SEM cor de severidade, e a razão está inteira no comentário
                    do marcador em `PlanoEsquematico`: aqui é a tela de vistoria,
                    com um imóvel só e sem legenda de criticidade na tela. Onde a
                    legenda existe, quem desenha é `MarcadorDeCriticidade`.
                  */
                  pinColor={tema.texto}
                />
              )}
          </MapView>
        ) : (
          <View
            testID="area-do-plano"
            /*
              O mesmo recuo, e aqui ele importa mais: este é o mapa de quem
              está SEM SINAL, que é quando o mapa mais faz falta. O desenho
              centra os pontos na área que sobra, e não na moldura inteira.
            */
            style={{
              flex: 1,
              justifyContent: "center",
              padding: espaco.e3,
              paddingBottom: reservado + espaco.e3,
            }}
          >
            {alvo.feitio === "pinos"
              ? <PlanoDasTarefas pinos={alvo.pinos} agente={agente} />
              : <PlanoEsquematico imovel={alvo.imovel} agente={agente} />}
          </View>
        )}
      </View>

      {/*
        A LEGENDA DE CRITICIDADE mora AQUI, e não na tela, e isso é a regra
        virada estrutura.

        `CLAUDE.md` proíbe comunicar estado só por cor. O pino leva a gravidade
        em cor e em forma, e as duas só viram informação com a legenda à vista.
        Se a legenda fosse responsabilidade da tela, bastaria uma tela nova
        esquecê-la para o produto passar a comunicar gravidade por cor sozinha,
        sem nenhum arquivo ficar visivelmente errado. Desenhada aqui, ela chega
        junto com os pinos, sempre, nos dois modos de mapa.
      */}
      {alvo.feitio === "pinos" && (
        <LegendaDeCriticidade severidades={alvo.pinos.map((p) => p.severidade)} />
      )}

      <ModoDoMapaDito decisao={decisao} comDetalhe={decisao.modo !== "google"} />
    </View>
  );
}

/**
 * O enquadramento inicial, e os dois casos que ele resolve.
 *
 * Com mais de um ponto conhecido, a janela precisa caber TODOS: um mapa
 * centrado na primeira tarefa com as outras fora da tela é pior que nenhum
 * mapa, porque ele parece dizer que só existe uma. O mesmo valia quando os
 * pontos eram sempre dois (o imóvel e o agente), e a conta é a mesma: o centro
 * é o meio da caixa que contém todo mundo, e a abertura é o lado dela com folga.
 *
 * O piso de `ABERTURA_PADRAO` existe para o caso em que os pontos estão quase no
 * mesmo lugar: sem ele, a janela calculada teria alguns metros de lado e o
 * mapa abriria com o zoom no chão, mostrando pinos e nenhuma rua.
 *
 * A conta é feita em GRAUS e não em metros, de propósito: grau é o que o SDK
 * entende, e passar por metro para voltar a grau seria arredondar duas vezes o
 * mesmo número.
 *
 * `null` quando não há ponto NENHUM, e é o único jeito honesto: sem ponto, toda
 * janela possível é uma janela inventada, e a que o SDK escolhe sozinho é o
 * meio do oceano Atlântico.
 */
export function enquadrar(pontos: readonly Ponto[], agente: Ponto | null): {
  latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
} | null {
  const todos = agente ? [...pontos, agente] : [...pontos];
  if (todos.length === 0) return null;

  const lats = todos.map((p) => p.latitude);
  const lngs = todos.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(ABERTURA_PADRAO, (maxLat - minLat) * FOLGA),
    longitudeDelta: Math.max(ABERTURA_PADRAO, (maxLng - minLng) * FOLGA),
  };
}
