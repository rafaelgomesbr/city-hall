import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

import type { Ponto } from "../../dados/mapa";
import { PRAZO_DO_MAPA_MS } from "../../dados/mapa";
import { Carregando, useTema } from "../componentes";
import { borda, espaco, raio } from "../tokens";
import { ModoDoMapaDito } from "./ModoDoMapaDito";
import { PlanoEsquematico } from "./PlanoEsquematico";
import { estiloDoGoogle } from "./estilo-do-google";
import type { EstadoDoMapa } from "./useMapaDoMunicipio";

/**
 * O MAPA DO IMÓVEL, a peça que as telas consomem.
 *
 * Ela junta as três decisões que já moram em outros arquivos e não toma
 * nenhuma nova: o modo (`decidirModoDoMapa`), o estilo (`estiloDoGoogle`) e o
 * desenho de reserva (`PlanoEsquematico`). O que ela acrescenta é o prazo, que
 * é a parte que só existe aqui porque só aqui há um mapa montado para observar.
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
 * `DC360_MAPS_CHAVE` existe no momento do `prebuild`. Sem ela, o
 * `PROVIDER_GOOGLE` é ignorado e o Apple Maps desenha no lugar, com o nosso
 * estilo jogado fora e sem erro nenhum. É por isso que `decidirModoDoMapa`
 * recusa o modo Google quando o binário não tem chave, em vez de tentar: uma
 * tela que parece certa e está errada não é descoberta por ninguém.
 */

export type PropsDoMapa = {
  /** Onde a coordenação disse que o imóvel está. */
  imovel: Ponto;
  /** Onde o aparelho diz que o agente está, ou `null` se o GPS ainda não veio. */
  agente?: Ponto | null;
  /** O que o marcador anuncia a quem lê a tela em voz alta. */
  rotulo: string;
  /**
   * O que `useMapaDoMunicipio` devolveu, INTEIRO, e não desmontado em três
   * propriedades.
   *
   * A tela chama o gancho e repassa o resultado. Desmontar obrigaria cada uma
   * das quatro telas a ligar três fios à mão, e o dia em que aparecesse um
   * quarto fio (foi o que aconteceu com `desistirDeEsperar`, que o portão de
   * design cobrou depois da primeira versão) as quatro precisariam ser
   * lembradas, uma a uma. Quem esquecesse teria uma tela que compila e que se
   * comporta diferente das outras três.
   */
  mapa: EstadoDoMapa;
  altura?: number;
  /**
   * Quantos pontos da BORDA DE BAIXO estão cobertos por outra coisa, hoje a
   * folha arrastável do padrão Uber.
   *
   * Não encolhe o desenho: encolhe a área ÚTIL. Os ladrilhos continuam
   * preenchendo a moldura inteira por baixo da folha (encolher o mapa deixaria
   * uma tarja vazia aparecendo na borda no meio do arraste), e o que passa a
   * considerar só a faixa visível é o centro, o enquadramento e os controles.
   *
   * Sem isto o pino é centralizado na moldura inteira, ou seja, ATRÁS da
   * folha: o agente arrasta a folha para baixo justamente para ver onde a casa
   * fica, e encontra o mapa olhando para outro lugar.
   */
  recuoInferior?: number;
};

/**
 * Quanto da moldura o recuo pode comer, no máximo.
 *
 * A folha em `cheia` pede 92%, e o dia em que alguém pedir a moldura inteira o
 * mapa ficaria com área útil zero ou negativa: o SDK responde a isso deslocando
 * o centro para fora do mundo desenhado, e ninguém associa o sintoma à folha.
 * Oitenta e cinco por cento deixa sempre uma faixa onde o pino cabe.
 */
const TETO_DO_RECUO = 0.85;

/**
 * Quanto do mundo cabe na tela, em graus, quando só o imóvel é conhecido.
 *
 * Cerca de 400 metros de lado na latitude de Florianópolis: perto o bastante
 * para a rua ter nome legível e largo o bastante para o quarteirão inteiro
 * caber. Quando o agente também é conhecido, este valor não é usado: o
 * enquadramento passa a ser calculado para os dois pontos caberem.
 */
const ABERTURA_PADRAO = 0.004;

/** Folga em volta dos dois pontos, para nenhum deles encostar na moldura. */
const FOLGA = 2.2;

export function MapaDoImovel({
  imovel, agente = null, rotulo, mapa, altura = 220, recuoInferior = 0,
}: PropsDoMapa) {
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

  /* Nunca negativo e nunca a moldura toda. Ver `TETO_DO_RECUO`. */
  const reservado = Math.min(Math.max(0, recuoInferior), altura * TETO_DO_RECUO);

  const moldura = {
    height: altura,
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
      <View style={[moldura, { alignItems: "center", justifyContent: "center" }]}>
        <Carregando
          mensagem="Vendo como o seu município configurou o mapa"
          aoDesistir={desistirDeEsperar}
          rotuloDaSaida="Desenhar sem o mapa do Google"
        />
      </View>
    );
  }

  return (
    <View style={{ gap: espaco.e2 }}>
      <View style={moldura}>
        {decisao.modo === "google" ? (
          <MapView
            /*
              Nos dois lados, e de propósito. Ver o cabeçalho deste arquivo.
            */
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            customMapStyle={estiloDoGoogle(tema)}
            initialRegion={enquadrar(imovel, agente)}
            /*
              A faixa coberta pela folha. Ver `recuoInferior` em `PropsDoMapa`.
            */
            mapPadding={{ top: 0, right: 0, bottom: reservado, left: 0 }}
            /*
              O mapa é para OLHAR e não para explorar: a informação é onde a
              casa fica em relação a onde o agente está. Rotação e inclinação
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
            accessibilityLabel={`Mapa do local: ${rotulo}`}
          >
            <Marker
              coordinate={imovel}
              title={rotulo}
              /*
                O marcador NÃO leva cor de severidade, e a razão é a mesma do
                pino do plano esquemático: severidade tem selo com ícone e
                palavra na própria tela, e repeti-la só em cor, num desenho sem
                legenda, é comunicar estado por cor sozinha.
              */
              pinColor={tema.texto}
            />
          </MapView>
        ) : (
          <View
            testID="area-do-plano"
            /*
              O mesmo recuo, e aqui ele importa mais: este é o mapa de quem
              está SEM SINAL, que é quando o mapa mais faz falta. O desenho
              centra os dois pontos na área que sobra, e não na moldura inteira.
            */
            style={{
              flex: 1,
              justifyContent: "center",
              padding: espaco.e3,
              paddingBottom: reservado + espaco.e3,
            }}
          >
            <PlanoEsquematico imovel={imovel} agente={agente} />
          </View>
        )}
      </View>

      <ModoDoMapaDito decisao={decisao} comDetalhe={decisao.modo !== "google"} />
    </View>
  );
}

/**
 * O enquadramento inicial, e o caso que ele resolve.
 *
 * Com os dois pontos conhecidos, a janela precisa caber os dois: um mapa
 * centrado no imóvel com o agente fora da tela é pior que nenhum mapa, porque
 * ele parece dizer que o agente não está por perto. Com só o imóvel, usa a
 * abertura padrão.
 *
 * O piso de `ABERTURA_PADRAO` existe para o caso em que os dois estão quase no
 * mesmo lugar: sem ele, a janela calculada teria alguns metros de lado e o
 * mapa abriria com o zoom no chão, mostrando dois pinos e nenhuma rua.
 * A conta é feita em GRAUS e não em metros, de propósito: grau é o
 * que o SDK entende, e passar por metro para voltar a grau seria arredondar
 * duas vezes o mesmo número.
 */
export function enquadrar(imovel: Ponto, agente: Ponto | null): {
  latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
} {
  if (!agente) {
    return {
      latitude: imovel.latitude,
      longitude: imovel.longitude,
      latitudeDelta: ABERTURA_PADRAO,
      longitudeDelta: ABERTURA_PADRAO,
    };
  }
  return {
    latitude: (imovel.latitude + agente.latitude) / 2,
    longitude: (imovel.longitude + agente.longitude) / 2,
    latitudeDelta: Math.max(
      ABERTURA_PADRAO, Math.abs(imovel.latitude - agente.latitude) * FOLGA,
    ),
    longitudeDelta: Math.max(
      ABERTURA_PADRAO, Math.abs(imovel.longitude - agente.longitude) * FOLGA,
    ),
  };
}
