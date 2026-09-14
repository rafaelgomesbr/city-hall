import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PRAZO_DO_MAPA_MS, decidirModoDoMapa } from "../../dados/mapa";
import { DEMORA_MS, ProvedorDeTema } from "../componentes";
import { espaco } from "../tokens";
import { MapaDoImovel, enquadrar } from "./MapaDoImovel";

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

async function desenhar(
  decisao: ReturnType<typeof decidirModoDoMapa> | null,
  extras: Partial<React.ComponentProps<typeof MapaDoImovel>> = {},
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
    await desenhar(decidirModoDoMapa({ daApi: "", doBuild: "chave" }));
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
    await desenhar(decidirModoDoMapa({ daApi: "chave-do-municipio", doBuild: "" }));
    expect(screen.getByText(/compilada sem a chave do mapa/)).toBeTruthy();
    expect(mapaDublado.props).toBeNull();
  });

  it("autorizado: monta o mapa, com o provedor Google e o nosso estilo", async () => {
    await desenhar(decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" }));
    expect(screen.getByText("Mapa do Google")).toBeTruthy();
    expect(mapaDublado.props?.["provider"]).toBe("google");
    expect(Array.isArray(mapaDublado.props?.["customMapStyle"])).toBe(true);
  });

  it("chave divergente: desenha, e diz que a conta cai na chave compilada", async () => {
    await desenhar(decidirModoDoMapa({ daApi: "a-nova", doBuild: "a-velha" }));
    expect(screen.getByText("Mapa do Google")).toBeTruthy();
    expect(screen.getByText(/é diferente da que está nesta versão do aplicativo/)).toBeTruthy();
  });

  it("e quem OUVE a tela também fica sabendo da chave divergente", async () => {
    /*
      A legenda de modo é um resumo com rótulo próprio, e um resumo é lido como
      uma coisa só: no Android o `contentDescription` do agrupamento ganha dos
      filhos. Enquanto o aviso da chave divergente existia só como filho
      desenhado, ele não era falado por ninguém.

      Ele é dirigido ao agente ("avise a coordenação"), e é o único caminho pelo
      qual alguém descobre que a prefeitura rotacionou `MAPS_KEY` no servidor e
      não gerou o aplicativo de novo: o mapa continua desenhando e a conta
      continua caindo na chave antiga, então não há nada quebrado na tela para
      investigar. Um agente que usa leitor de tela era o único que nunca ficava
      sabendo.
    */
    await desenhar(decidirModoDoMapa({ daApi: "a-nova", doBuild: "a-velha" }));
    const resumo = screen.getByRole("summary");
    expect(String(resumo.props.accessibilityLabel))
      .toMatch(/Avise a coordenação para gerar o aplicativo de novo/);
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
    await desenhar(decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" }));
    expect(screen.queryByText(/é enviada ao Google/)).toBeNull();
    expect(String(screen.getByRole("summary").props.accessibilityLabel))
      .toMatch(/é enviada ao Google/);
  });

  it("e sem divergência o resumo não fala de chave nenhuma", async () => {
    /*
      A metade que impede a correção de virar ruído: colar o aviso em todo
      resumo faria o caso que importa deixar de se distinguir.
    */
    await desenhar(decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" }));
    expect(String(screen.getByRole("summary").props.accessibilityLabel))
      .not.toMatch(/chave/i);
  });
});

describe("O prazo, que é o `gm_authFailure` que o SDK nativo não tem", () => {
  it("passado o prazo sem o mapa desenhar, avisa quem pode trocar de modo", async () => {
    await desenhar(decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" }));
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
    await desenhar(decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" }));
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
    await desenhar(decidirModoDoMapa({ daApi: "", doBuild: "" }));
    await act(async () => { jest.advanceTimersByTime(PRAZO_DO_MAPA_MS * 3); });
    expect(naoDesenhou).not.toHaveBeenCalled();
  });
});

describe("O enquadramento cabe os dois pontos", () => {
  it("sem o agente, abre em volta do imóvel", () => {
    const janela = enquadrar(IMOVEL, null);
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
    const janela = enquadrar(IMOVEL, AGENTE);
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
    const janela = enquadrar(IMOVEL, coladinho);
    expect(janela.latitudeDelta).toBeGreaterThan(0.001);
    expect(janela.longitudeDelta).toBeGreaterThan(0.001);
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
    await desenhar(decidirModoDoMapa({ daApi: "chave-do-municipio", doBuild: "chave-do-municipio" }), {
      altura: 600, recuoInferior: 300,
    });
    expect(mapaDublado.props?.["mapPadding"]).toEqual({
      top: 0, right: 0, bottom: 300, left: 0,
    });
  });

  it("sem recuo pedido, nada é reservado", async () => {
    await desenhar(decidirModoDoMapa({ daApi: "chave-do-municipio", doBuild: "chave-do-municipio" }));
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
    await desenhar(decidirModoDoMapa({ daApi: null, doBuild: null }), {
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
    await desenhar(decidirModoDoMapa({ daApi: "chave-do-municipio", doBuild: "chave-do-municipio" }), {
      altura: 400, recuoInferior: 900,
    });
    const reservado = (mapaDublado.props?.["mapPadding"] as { bottom: number }).bottom;
    expect(reservado).toBeLessThan(400);
    expect(reservado).toBeGreaterThan(0);
  });
});
