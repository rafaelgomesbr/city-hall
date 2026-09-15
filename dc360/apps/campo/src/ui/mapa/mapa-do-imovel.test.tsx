import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PRAZO_DO_MAPA_MS, decidirModoDoMapa } from "../../dados/mapa";
import { DEMORA_MS, ProvedorDeTema } from "../componentes";
import { espaco, movimento, temaClaro } from "../tokens";
import { MapaDoImovel, enquadrar, pontoNaVista } from "./MapaDoImovel";

/**
 * O MAPA DENTRO DA TELA, e os três defeitos que estes casos travam.
 *
 * 1. **A legenda de modo não pode mentir nem por um instante.** O painel pagou
 *    por isto em 13/09: ele aparecia no plano esquemático, afirmava em voz
 *    alta "nenhuma coordenada sai deste navegador" e um instante depois
 *    trocava pelo mapa de ruas do Google. A legenda tinha dito uma coisa
 *    falsa, e é justamente por ela que o município sabe se a coordenada das
 *    famílias está saindo dali. Aqui, enquanto a configuração não chega, a
 *    tela não desenha mapa nenhum.
 *
 * 2. **Chave recusada não falha alto, e no aplicativo falha ainda mais baixo.**
 *    No painel existe `gm_authFailure`, que é um retorno de chamada global do
 *    Google. No SDK nativo não existe equivalente: no Android a única pista é
 *    uma linha de `logcat`, e no iOS nem isso. O que existe é `onMapLoaded`, e
 *    a AUSÊNCIA dele dentro de um prazo é o sinal. Sem este prazo, a tela fica
 *    com o quadrado cinza do Google, em inglês, para sempre.
 *
 * 3. **Um mapa centrado no imóvel com o agente fora da tela é pior que nenhum
 *    mapa**, porque parece dizer que o agente não está por perto.
 */

/*
  O dublê de `react-native-maps` NÃO é montado aqui: ele mora em
  `apps/campo/__mocks__/react-native-maps.tsx` e o jest o usa sozinho, porque
  mock de módulo do `node_modules` posto ao lado de `node_modules` é automático.

  Isso não é economia de linhas. A biblioteca de verdade chama
  `TurboModuleRegistry.getEnforcing("AirMapsModule")` no momento do `import`, e
  `getEnforcing` existe para ESTOURAR quando o módulo nativo não está presente:
  no jest nunca está. Quer dizer que toda tela que desenhar mapa passa a
  derrubar a própria suíte, e as quatro telas desta versão vão desenhar mapa.
  Um dublê escrito neste arquivo resolveria só este arquivo, e as outras quatro
  frentes descobririam o problema uma a uma, cada uma com um erro dentro de
  `node_modules` que ninguém associa ao mapa.

  O dublê comum é exercitado AQUI, e essa é a outra metade da decisão: dublê
  que ninguém usa apodrece, e o dia em que ele divergir da biblioteca de
  verdade nenhum caso acusa.
*/
import {
  limparMapaDublado, mapaDublado,
} from "../../../__mocks__/react-native-maps";

const IMOVEL = { latitude: -27.585378, longitude: -48.548050 };
const AGENTE = { latitude: -27.595378, longitude: -48.548050 };

const naoDesenhou = jest.fn();
const desistiu = jest.fn();

/**
 * As sobras aceitas aqui são só as COMUNS aos dois feitios da peça.
 *
 * `PropsDoMapa` virou união (um imóvel, ou N pinos), e `Partial` de uma união
 * não se espalha dentro de um JSX que já escolheu um dos lados: o TypeScript
 * passa a não saber qual dos dois está sendo montado. O que estes casos variam
 * é altura e recuo, que valem para os dois.
 */
type SobrasDoMapa = { altura?: number | "preencher"; recuoInferior?: number };

async function desenhar(
  decisao: ReturnType<typeof decidirModoDoMapa> | null,
  extras: SobrasDoMapa = {},
): Promise<void> {
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <MapaDoImovel
          imovel={IMOVEL}
          agente={AGENTE}
          rotulo="Servidão Boa Esperança, 148"
          mapa={{
            decisao,
            aoGoogleNaoDesenhar: naoDesenhou,
            desistirDeEsperar: desistiu,
          }}
          {...extras}
        />
      </ProvedorDeTema>,
    );
  });
}

beforeEach(() => {
  naoDesenhou.mockClear();
  desistiu.mockClear();
  limparMapaDublado();
  jest.useFakeTimers();
});
afterEach(() => { jest.useRealTimers(); });

describe("A tela diz em que modo está, e nunca antes de saber", () => {
  it("enquanto a configuração não chega, não desenha mapa nenhum", async () => {
    await desenhar(null);
    expect(screen.queryByText("Mapa do Google")).toBeNull();
    expect(screen.queryByText("Plano esquemático")).toBeNull();
    expect(screen.getByText(/Vendo como o seu município configurou o mapa/)).toBeTruthy();
  });

  it("a espera tem porta de saída, e a saída é o plano esquemático", async () => {
    /*
      `scripts/portao-design-do-aplicativo.test.mjs` reprova `Carregando` sem
      `aoDesistir`, e mordeu esta peça na primeira vez que ela rodou. A espera
      aqui é curta (oito segundos de teto), mas num morro com sinal oscilando
      oito segundos parados olhando para uma roda bastam para o agente concluir
      que o aplicativo travou. Desistir vira autorização vazia, então nenhuma
      coordenada sai do aparelho por causa de uma desistência.
    */
    await desenhar(null);
    /*
      A saída só aparece depois de `DEMORA_MS`, e é o próprio `Carregando` que
      decide isso: oferecer a porta no primeiro quadro faria toda espera normal
      parecer um problema. Aqui o relógio é falso, então o teste anda até lá.
    */
    await act(async () => { jest.advanceTimersByTime(DEMORA_MS + 1); });
    const saida = screen.getByText("Desenhar sem o mapa do Google");
    expect(saida).toBeTruthy();
    await act(async () => { fireEvent.press(saida); });
    expect(desistiu).toHaveBeenCalledTimes(1);
  });

  it("município que não autorizou: plano esquemático, dito com a razão", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: false, doBuild: "chave" }));
    expect(screen.getByText("Plano esquemático")).toBeTruthy();
    expect(screen.getByText(/optou por não enviar coordenada ao Google/)).toBeTruthy();
    expect(mapaDublado.props).toBeNull();
  });

  it("binário sem chave: plano esquemático, e o texto manda avisar a coordenação", async () => {
    /*
      É o único dos quatro motivos que é defeito de quem montou o aplicativo, e
      não escolha nem circunstância. Sem esta distinção um erro de compilação
      ficaria parecido com uma decisão de privacidade, e ninguém conserta o que
      parece intencional.
    */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "" }));
    expect(screen.getByText(/compilada sem a chave do mapa/)).toBeTruthy();
    expect(mapaDublado.props).toBeNull();
  });

  it("autorizado: monta o mapa, com o provedor Google e o nosso estilo", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(screen.getByText("Mapa do Google")).toBeTruthy();
    expect(mapaDublado.props?.["provider"]).toBe("google");
    expect(Array.isArray(mapaDublado.props?.["customMapStyle"])).toBe(true);
  });

  /*
    O AVISO DE CHAVE DIVERGENTE SAIU, e dois casos saíram com ele.

    Eles se chamavam "chave divergente: desenha, e diz que a conta cai na chave
    compilada" e "e quem OUVE a tela também fica sabendo da chave divergente".
    Comparavam a chave que `GET /configuracao` manda com a do binário, e o aviso
    dizia "avise a coordenação para gerar o aplicativo de novo".

    A chave que a API manda é a do PAINEL (`MAPS_KEY`, restrita a sites), e a
    do binário é a de Apps iOS ou de Apps Android (`DC360_MAPS_CHAVE_IOS`,
    `DC360_MAPS_CHAVE_ANDROID`, desde o commit `b5afd64`): o console do Google
    aceita um tipo de restrição por chave, então elas SEMPRE diferem numa
    instalação certa. O aviso virou mentira em toda instalação, e a captura de
    quem paga mostrava exatamente isso. O que decide o modo agora é o booleano
    `mapaAutorizado`, e o caso abaixo guarda que a legenda não fala mais de
    chave nenhuma.
  */
  it("o resumo do modo Google não fala de chave: não há mais o que comparar", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }));
    expect(screen.queryByText(/é diferente da que está nesta versão do aplicativo/)).toBeNull();
    expect(String(screen.getByRole("summary").props.accessibilityLabel))
      .not.toMatch(/gerar o aplicativo de novo/);
  });

  it("quem OUVE a tela ouve que a coordenada vai para o Google, sem o detalhe na tela", async () => {
    /*
      O caso que mais importa deste bloco, e o mais fácil de perder.

      No modo autorizado `MapaDoImovel` desenha a legenda SEM o parágrafo
      (`comDetalhe={decisao.modo !== "google"}`): na tela fica só "Mapa do
      Google", porque o mapa de ruas ao lado já é a explicação para quem vê.
      Para quem ouve não há mapa ao lado, e a frase que diz que a coordenada
      está saindo do aparelho só existe no rótulo do resumo. Um resumo que não é
      elemento de acessibilidade não tem rótulo nenhum: a promessa da seção 2.2
      do `SUBPROCESSADORES.md` deixava de ser dita para quem depende de ouvi-la.
    */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(screen.queryByText(/é enviada ao Google/)).toBeNull();
    expect(String(screen.getByRole("summary").props.accessibilityLabel))
      .toMatch(/é enviada ao Google/);
  });

  it("e o resumo do modo Google não cita chave em lugar nenhum", async () => {
    /*
      Legenda de modo é a seção 2.2 do `SUBPROCESSADORES.md` virada tela: ela
      fala de para onde a coordenada vai, e chave é assunto do console do
      Google, não do agente.
    */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(String(screen.getByRole("summary").props.accessibilityLabel))
      .not.toMatch(/chave/i);
  });
});

describe("O prazo, que é o `gm_authFailure` que o SDK nativo não tem", () => {
  it("passado o prazo sem o mapa desenhar, avisa quem pode trocar de modo", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(naoDesenhou).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(PRAZO_DO_MAPA_MS + 1); });
    expect(naoDesenhou).toHaveBeenCalledTimes(1);
  });

  it("o mapa que desenhou cancela o prazo, e o modo não cai mais", async () => {
    /*
      Sem este cancelamento, todo mapa que funcionasse cairia para o plano
      esquemático doze segundos depois de aparecer, que é o defeito oposto e
      igualmente silencioso: o agente veria o mapa de ruas sumir sozinho.
    */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    await act(async () => { mapaDublado.onMapLoaded?.(); });

    await act(async () => { jest.advanceTimersByTime(PRAZO_DO_MAPA_MS * 3); });
    expect(naoDesenhou).not.toHaveBeenCalled();
  });

  it("no plano esquemático o prazo nem começa a contar", async () => {
    /*
      O relógio só existe quando há mapa do Google montado para observar.
      Contando antes disso, uma configuração lenta derrubaria o mapa antes de
      ele existir, e o motivo registrado seria "o Google recusou" quando o
      Google nem foi chamado.
    */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: false, doBuild: "" }));
    await act(async () => { jest.advanceTimersByTime(PRAZO_DO_MAPA_MS * 3); });
    expect(naoDesenhou).not.toHaveBeenCalled();
  });
});

describe("O enquadramento cabe TODOS os pontos", () => {
  it("sem o agente, abre em volta do imóvel", () => {
    const janela = enquadrar([IMOVEL], null)!;
    expect(janela.latitude).toBe(IMOVEL.latitude);
    expect(janela.longitude).toBe(IMOVEL.longitude);
    expect(janela.latitudeDelta).toBeGreaterThan(0);
  });

  it("com o agente, centra entre os dois e cabe a distância entre eles", () => {
    /*
      Um mapa centrado no imóvel com o agente fora da tela parece dizer que o
      agente não está por perto, que é o oposto do que este mapa existe para
      responder.
    */
    const janela = enquadrar([IMOVEL], AGENTE)!;
    expect(janela.latitude).toBeCloseTo((IMOVEL.latitude + AGENTE.latitude) / 2, 6);
    expect(janela.latitudeDelta).toBeGreaterThan(
      Math.abs(IMOVEL.latitude - AGENTE.latitude),
    );
  });

  it("com os dois quase no mesmo lugar, não abre com o zoom no chão", () => {
    /*
      Sem o piso, a janela calculada teria alguns metros de lado: o mapa abriria
      mostrando dois pinos e nenhuma rua, que não orienta ninguém.
    */
    const coladinho = { latitude: IMOVEL.latitude + 0.00001, longitude: IMOVEL.longitude };
    const janela = enquadrar([IMOVEL], coladinho)!;
    expect(janela.latitudeDelta).toBeGreaterThan(0.001);
    expect(janela.longitudeDelta).toBeGreaterThan(0.001);
  });

  /*
    COM N TAREFAS, a aritmética de dois pontos vira mínimo e máximo com folga.
    Enquadrar pela primeira deixaria as outras fora da tela, e um mapa que
    mostra uma tarefa quando existem cinco não é um mapa incompleto: ele é um
    mapa que afirma que só existe uma.
  */
  it("com N pontos, a janela contém o mais ao norte e o mais ao sul", () => {
    const norte = { latitude: -27.560000, longitude: -48.548050 };
    const sul = { latitude: -27.610000, longitude: -48.548050 };
    const meio = { latitude: -27.590000, longitude: -48.500000 };

    const janela = enquadrar([meio, norte, sul], null)!;

    expect(janela.latitude).toBeCloseTo((norte.latitude + sul.latitude) / 2, 6);
    expect(janela.latitudeDelta).toBeGreaterThan(norte.latitude - sul.latitude);
    /* E o eixo leste-oeste sai do ponto que está mais a leste, e não da média:
       sem isso, o `meio` cairia fora pela lateral. */
    expect(janela.longitudeDelta).toBeGreaterThan(meio.longitude - norte.longitude);
  });

  /*
    Sem ponto nenhum não há janela possível, e inventar uma é pior do que não
    desenhar: a que o SDK escolhe sozinho fica no meio do oceano Atlântico.
  */
  it("sem ponto nenhum, não há janela", () => {
    expect(enquadrar([], null)).toBeNull();
  });
});

/* ============================================================
   N pinos, a legenda que vem com eles, e o imóvel só
   ============================================================ */

describe("Com pinos, a peça desenha a criticidade E a legenda dela", () => {
  const PINOS = [
    {
      id: "a", ponto: IMOVEL, rotulo: "Servidão Boa Esperança, 148", severidade: "critica" as const,
    },
    {
      id: "b",
      ponto: { latitude: -27.58, longitude: -48.54 },
      rotulo: "Rua de Cima, 9",
      severidade: "baixa" as const,
    },
  ];

  async function comPinos(decisao: ReturnType<typeof decidirModoDoMapa>): Promise<void> {
    await act(async () => {
      await render(
        <ProvedorDeTema>
          <MapaDoImovel
            pinos={PINOS}
            agente={AGENTE}
            mapa={{
              decisao,
              aoGoogleNaoDesenhar: naoDesenhou,
              desistirDeEsperar: desistiu,
            }}
          />
        </ProvedorDeTema>,
      );
    });
  }

  /*
    A LEGENDA VEM COM OS PINOS, no mesmo componente, e não é responsabilidade
    da tela. `CLAUDE.md` proíbe comunicar estado só por cor: se a legenda fosse
    da tela, bastaria uma tela nova esquecê-la para o produto passar a comunicar
    gravidade por cor sozinha, sem nenhum arquivo ficar visivelmente errado.
  */
  it("a legenda aparece no mapa do Google", async () => {
    await comPinos(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(screen.getByTestId("legenda-de-criticidade")).toBeTruthy();
    expect(screen.getByText("Crítica")).toBeTruthy();
  });

  it("e aparece igual no plano de reserva, porque o pino é colorido nos dois", async () => {
    await comPinos(decidirModoDoMapa({ mapaAutorizado: false, doBuild: "" }));
    expect(screen.getByTestId("legenda-de-criticidade")).toBeTruthy();
  });

  it("um marcador por pino, com a identidade da ocorrência", async () => {
    await comPinos(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(mapaDublado.marcadores.map((m) => m["identifier"])).toEqual(["a", "b"]);
  });

  /*
    E O IMÓVEL SOZINHO CONTINUA SEM LEGENDA E SEM COR DE GRAVIDADE.

    É a tela de vistoria: uma casa só, nenhuma escala de comparação e nenhuma
    legenda. Pintar o marcador ali seria exatamente o que a regra proíbe, e é a
    razão que estava escrita no código antes desta frente.
  */
  it("com um imóvel só, não há legenda de criticidade nenhuma", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "a-mesma" }));
    expect(screen.queryByTestId("legenda-de-criticidade")).toBeNull();
  });
});

/* ============================================================
   O pino que não aparecia: o bitmap congelado antes de o SVG pintar
   ============================================================ */

describe("O marcador só é congelado em bitmap depois de o mapa desenhar", () => {
  const PINOS = [{
    id: "a", ponto: IMOVEL, rotulo: "Servidão Boa Esperança, 148", severidade: "critica" as const,
  }];

  async function comPinos(): Promise<ReturnType<typeof render>> {
    let tela!: ReturnType<typeof render>;
    await act(async () => {
      tela = render(
        <ProvedorDeTema>
          <MapaDoImovel
            pinos={PINOS}
            agente={AGENTE}
            mapa={{
              decisao: decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }),
              aoGoogleNaoDesenhar: naoDesenhou,
              desistirDeEsperar: desistiu,
            }}
          />
        </ProvedorDeTema>,
      );
    });
    return tela;
  }

  const marcador = () => mapaDublado.marcadores.find((m) => m["identifier"] === "a")!;

  /*
    O DEFEITO, na captura de quem paga: a legenda dizia "Crítica" e o mapa
    estava vazio. `tracksViewChanges={false}` congela o marcador no bitmap do
    que estiver desenhado NAQUELE instante, e o desenho do pino é SVG
    (`react-native-svg`), que no iOS pinta de forma assíncrona. A versão
    anterior desligava 260 ms depois de montar: se o SVG ainda não tinha
    pintado, o bitmap capturado era vazio, e ficava vazio até `severidade` ou
    `escolhido` mudarem, o que numa lista de uma tarefa nunca acontece.
  */
  it("enquanto o mapa não carregou, o marcador continua sendo redesenhado", async () => {
    await comPinos();
    expect(marcador()["tracksViewChanges"]).toBe(true);

    /* Muito além dos 260 ms de antes: o relógio sozinho não desliga mais nada. */
    await act(async () => { jest.advanceTimersByTime(PRAZO_DO_MAPA_MS - 1); });
    expect(marcador()["tracksViewChanges"]).toBe(true);
  });

  it("depois de `onMapLoaded` mais uma mudança de estado, congela", async () => {
    await comPinos();
    await act(async () => { mapaDublado.onMapLoaded?.(); });
    /* Ainda não: o SDK acabou de dizer que desenhou, e o pino ganha uma
       transição inteira para ser capturado com o SVG já pintado. */
    expect(marcador()["tracksViewChanges"]).toBe(true);

    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado + 1); });
    expect(marcador()["tracksViewChanges"]).toBe(false);
  });

  it("escolher o pino religa a captura, para o anel aparecer, e desliga de novo", async () => {
    const tela = await comPinos();
    await act(async () => { mapaDublado.onMapLoaded?.(); });
    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado + 1); });
    expect(marcador()["tracksViewChanges"]).toBe(false);

    await act(async () => {
      tela.rerender(
        <ProvedorDeTema>
          <MapaDoImovel
            pinos={[{ ...PINOS[0]!, escolhido: true }]}
            agente={AGENTE}
            mapa={{
              decisao: decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }),
              aoGoogleNaoDesenhar: naoDesenhou,
              desistirDeEsperar: desistiu,
            }}
          />
        </ProvedorDeTema>,
      );
    });
    expect(marcador()["tracksViewChanges"]).toBe(true);

    await act(async () => { jest.advanceTimersByTime(movimento.mudancaDeEstado + 1); });
    expect(marcador()["tracksViewChanges"]).toBe(false);
  });

  it("o dado que chega ao marcador é o da tarefa: ponto, rótulo e o que o toque faz", async () => {
    /*
      O dublê devolvia `null` para `Marker` sem guardar nada, então nenhum caso
      provava o que o marcador recebia. Agora ele guarda, e este caso lê.
    */
    const tocou = jest.fn();
    await act(async () => {
      render(
        <ProvedorDeTema>
          <MapaDoImovel
            pinos={[{ ...PINOS[0]!, aoTocar: tocou }]}
            agente={AGENTE}
            mapa={{
              decisao: decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }),
              aoGoogleNaoDesenhar: naoDesenhou,
              desistirDeEsperar: desistiu,
            }}
          />
        </ProvedorDeTema>,
      );
    });
    const m = marcador();
    expect(m["coordinate"]).toEqual(IMOVEL);
    expect(m["accessibilityLabel"]).toBe("Servidão Boa Esperança, 148");
    /* Centrado NO ponto: é marca de lugar, não alfinete com haste. */
    expect(m["anchor"]).toEqual({ x: 0.5, y: 0.5 });
    (m["onPress"] as () => void)();
    expect(tocou).toHaveBeenCalledTimes(1);
  });
});

/* ============================================================
   O caminho por ruas, quando o agente pediu
   ============================================================ */

describe("O caminho desenhado sobre o mapa", () => {
  const PINOS = [{
    id: "a", ponto: IMOVEL, rotulo: "Servidão Boa Esperança, 148", severidade: "critica" as const,
  }];
  const CAMINHO = [AGENTE, { latitude: -27.59, longitude: -48.549 }, IMOVEL];

  async function comCaminho(caminho: readonly typeof IMOVEL[] | null): Promise<void> {
    await act(async () => {
      render(
        <ProvedorDeTema>
          <MapaDoImovel
            pinos={PINOS}
            agente={AGENTE}
            caminho={caminho}
            mapa={{
              decisao: decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }),
              aoGoogleNaoDesenhar: naoDesenhou,
              desistirDeEsperar: desistiu,
            }}
          />
        </ProvedorDeTema>,
      );
    });
  }

  it("com o caminho, desenha UMA linha com os pontos dele, na cor de destaque", async () => {
    await comCaminho(CAMINHO);
    expect(mapaDublado.polilinhas).toHaveLength(1);
    expect(mapaDublado.polilinhas[0]?.["coordinates"]).toEqual(CAMINHO);
    /*
      Cor de MARCA, e não de severidade: o caminho não é gravidade de nada, é
      o traço do que o agente pediu. Pintá-lo de vermelho faria parecer que a
      rua inteira é crítica.
    */
    expect(mapaDublado.polilinhas[0]?.["strokeColor"]).toBe(temaClaro.destaque);
  });

  it("sem caminho, não há linha nenhuma: a reta é dita em palavra, não desenhada", async () => {
    await comCaminho(null);
    expect(mapaDublado.polilinhas).toHaveLength(0);
  });
});

describe("O recuo que a folha cobre", () => {
  /*
    A folha do padrão Uber fica POR CIMA do mapa, e em `cheia` ela cobre 92% da
    altura. Sem dizer isso ao mapa, o pino continua sendo centralizado na
    moldura inteira, ou seja, atrás da folha: o agente arrasta a folha para
    baixo justamente para ver onde a casa fica, e o que ele encontra é o mapa
    olhando para outro lugar.

    Quem resolve isso no SDK do Google é `mapPadding`, que existe para isto: ele
    encolhe a área ÚTIL sem encolher o desenho, então os ladrilhos continuam
    preenchendo a moldura inteira por baixo da folha (o contrário deixaria uma
    tarja vazia aparecendo na borda enquanto a folha é arrastada) e o centro, o
    enquadramento e os controles passam a considerar só a faixa visível.
  */
  it("o mapa do Google recebe o recuo como espaço reservado embaixo", async () => {
    /* Altura de tela inteira e folha em `meia`: a geometria de verdade da lente
       do mapa. Com a altura padrão de 220 da peça, 300 já passaria do teto, e o
       caso mediria o teto em vez do repasse. */
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-do-municipio" }), {
      altura: 600, recuoInferior: 300,
    });
    expect(mapaDublado.props?.["mapPadding"]).toEqual({
      top: 0, right: 0, bottom: 300, left: 0,
    });
  });

  it("sem recuo pedido, nada é reservado", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-do-municipio" }));
    expect(mapaDublado.props?.["mapPadding"]).toEqual({
      top: 0, right: 0, bottom: 0, left: 0,
    });
  });

  /*
    O plano esquemático precisa do mesmo tratamento, e por um motivo mais duro:
    ele é o mapa do agente SEM SINAL, que é quando o mapa mais importa. Ele
    desenha os dois pontos centrados na moldura, então centrar na moldura
    inteira esconde exatamente o pino do imóvel atrás da folha.
  */
  it("o plano esquemático centra na faixa que sobra, e não na moldura inteira", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: false, doBuild: null }), {
      altura: 600, recuoInferior: 300,
    });
    const area = screen.getByTestId("area-do-plano");
    expect(
      Object.assign({}, ...[area.props.style].flat().filter(Boolean)).paddingBottom,
    ).toBe(300 + espaco.e3);
  });

  /*
    Recuo maior que a própria moldura deixaria o mapa com área útil negativa, e
    o SDK responde a isso deslocando o centro para fora do mundo desenhado. A
    folha em `cheia` pede 92%, e o dia em que alguém pedir 100% o mapa não pode
    virar um retângulo sem centro.
  */
  it("o recuo nunca come a moldura inteira", async () => {
    await desenhar(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-do-municipio" }), {
      altura: 400, recuoInferior: 900,
    });
    const reservado = (mapaDublado.props?.["mapPadding"] as { bottom: number }).bottom;
    expect(reservado).toBeLessThan(400);
    expect(reservado).toBeGreaterThan(0);
  });
});

/*
  A CÂMERA E O PINO ABERTO, e a régua que concilia os dois argumentos.

  O comentário de `initialRegion` está certo: mover o mapa a cada escolha
  tiraria da tela o que o agente estava olhando. E "tudo conectado" também
  está certo: expandir um item da lista e o pino dele estar FORA da vista
  (porque o agente arrastou para a rua vizinha) é um toque sem resposta. A
  régua: a câmera só se move quando o pino aberto não está na vista, e aí
  ela vai até ele mantendo o zoom que o agente escolheu.
*/
describe("A câmera vai até o pino aberto só quando ele está fora da vista", () => {
  const PERTO = { latitude: -27.586, longitude: -48.549 };
  const LONGE = { latitude: -27.700, longitude: -48.700 };
  const PINOS = [
    { id: "perto", ponto: PERTO, rotulo: "Perto", severidade: "alta" as const },
    { id: "longe", ponto: LONGE, rotulo: "Longe", severidade: "critica" as const },
  ];

  function peca(escolhido: string | null) {
    return (
      <ProvedorDeTema>
        <MapaDoImovel
          pinos={PINOS.map((p) => ({ ...p, escolhido: p.id === escolhido }))}
          agente={AGENTE}
          mapa={{
            decisao: decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" }),
            aoGoogleNaoDesenhar: naoDesenhou,
            desistirDeEsperar: desistiu,
          }}
        />
      </ProvedorDeTema>
    );
  }

  type Tela = Awaited<ReturnType<typeof render>>;

  async function montarDesenhadoEmVolta(centro: { latitude: number; longitude: number }): Promise<Tela> {
    let tela!: Tela;
    await act(async () => { tela = await render(peca(null)); });
    await act(async () => { mapaDublado.onMapLoaded?.(); });
    /* O agente arrastou: o mapa conta onde a câmera parou. */
    const contar = mapaDublado.props?.["onRegionChangeComplete"] as
      ((r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => void) | undefined;
    await act(async () => {
      contar?.({ ...centro, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    });
    return tela;
  }

  it("`pontoNaVista` mede contra a metade da abertura, com uma folga para o pino não nascer na borda", () => {
    const vista = { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 };
    expect(pontoNaVista({ latitude: 0.1, longitude: 0.1 }, vista)).toBe(true);
    expect(pontoNaVista({ latitude: 0.49, longitude: 0 }, vista)).toBe(false);
    expect(pontoNaVista({ latitude: 0, longitude: 0.6 }, vista)).toBe(false);
  });

  it("pino aberto DENTRO da vista: a câmera fica onde o agente a deixou", async () => {
    const tela = await montarDesenhadoEmVolta(PERTO);
    await act(async () => { await tela.rerender(peca("perto")); });

    expect(mapaDublado.camera).toEqual([]);
  });

  it("pino aberto FORA da vista: a câmera vai até ele, com o mesmo zoom e duração de token", async () => {
    const tela = await montarDesenhadoEmVolta(PERTO);
    await act(async () => { await tela.rerender(peca("longe")); });

    expect(mapaDublado.camera).toHaveLength(1);
    const [regiao, duracao] = mapaDublado.camera[0]!;
    expect(regiao).toEqual({ ...LONGE, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    expect(duracao).toBe(movimento.mudancaDeEstado);
  });

  it("recolher o item (nenhum pino aberto) não move nada", async () => {
    const tela = await montarDesenhadoEmVolta(PERTO);
    await act(async () => { await tela.rerender(peca("longe")); });
    await act(async () => { await tela.rerender(peca(null)); });

    expect(mapaDublado.camera).toHaveLength(1);
  });

  it("antes de o mapa desenhar, escolher não move: a janela de abertura já cabe todos", async () => {
    let tela!: Tela;
    await act(async () => { tela = await render(peca(null)); });
    await act(async () => { await tela.rerender(peca("longe")); });

    expect(mapaDublado.camera).toEqual([]);
  });
});
