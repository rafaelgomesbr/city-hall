import { Linking, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { Pendencia } from "../dados/api";
import { descartarRascunho, salvarRascunho } from "../dados/rascunho";
import { temaEscuro } from "../ui/tokens";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

/**
 * A tela de vistoria vista de fora, do jeito que o agente a usa.
 *
 * Este arquivo mora em `__tests__` e não ao lado da tela por um motivo do
 * Expo, e não de gosto: tudo que está dentro de `src/app` vira ROTA. Um
 * `[id].test.tsx` ali seria uma tela navegável chamada "teste" dentro do
 * aplicativo publicado.
 *
 * Os três defeitos que estes testes travam foram levantados com o aparelho na
 * mão, e todos os três são de tela e não de dados:
 *
 * 1. Não havia saída nomeada. A barra de abas some aqui de propósito (uma
 *    escotilha de fuga permanente embaixo do polegar produz vistoria pela
 *    metade), e o efeito colateral era um formulário longo sem nenhuma porta
 *    visível. O rascunho sempre esteve seguro no disco; o que faltava era
 *    dizer isso ao agente com um botão.
 * 2. O prazo sumia. Ele existia só na lista de tarefas. Dentro do formulário,
 *    justamente onde se decide parar para fotografar mais uma parede, a
 *    informação não estava em lugar nenhum.
 * 3. A coordenada só alimentava a minuta. Ela chegava ao aparelho e não
 *    levava ninguém a lugar nenhum.
 */

/* ============================================================
   O aparelho, de mentira
   ============================================================ */

/**
 * A navegação precisa ser o MESMO objeto a cada renderização.
 *
 * O efeito que carrega a ocorrência depende dela. Devolver um objeto novo a
 * cada chamada faria o efeito rodar de novo a cada renderização, e como ele
 * chama `setState` no fim, o teste entraria em laço infinito e nada disso
 * seria culpa da tela.
 */
jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      back: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: "oc-1" }),
    useNavigation: () => navegacao,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111",
}));

jest.mock("expo-file-system", () => ({
  File: class {
    size = 0;
    constructor(_uri: string) {}
  },
}));

/** A ocorrência que está guardada no aparelho. Cada teste ajusta o que precisa. */
let mockOcorrencia: Pendencia;

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

/** O catálogo de órgãos que este aparelho tem. Cada teste ajusta o que precisa. */
let mockCatalogoDeOrgaos: Array<{ id: string; nome: string; sigla: string | null }> = [];

jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: jest.fn(async () => mockOcorrencia),
  /* Lido do DISCO, sempre. A tela não faz chamada de rede em lugar nenhum. */
  orgaosGuardados: jest.fn(async () => mockCatalogoDeOrgaos),
}));

jest.mock("../dados/coletas", () => ({
  coletaDe: jest.fn(async () => null),
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

jest.mock("../dados/fila", () => ({
  obterFila: jest.fn(async () => ({ enfileirar: jest.fn(async () => {}) })),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: {
      nome: "Agente de teste",
      matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

/*
  O rascunho é substituído por inteiro, e não por `requireActual`.

  O módulo de verdade abre o banco local do aparelho na primeira chamada. O que
  estes testes verificam não é a gravação (ela tem os testes dela), e sim o que
  a tela PEDE ao disco: gravar a cada toque, e nunca descartar ao sair.
*/
jest.mock("../dados/rascunho", () => ({
  lerRascunho: jest.fn(async () => null),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId,
    protocolo,
    idempotencyKey,
    checklist: {},
    orgaosParaAcionar: [],
    fotos: [],
    gpsPrecisaoMetros: null,
    coordenada: null,
    assinanteNome: "",
    assinaturaUri: null,
    observacoes: "",
    pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

const AGORA = new Date("2026-09-09T12:00:00.000Z");
const MINUTO = 60_000;
const HORA = 3_600_000;

function ocorrenciaDeTeste(mudanca: Partial<Pendencia> = {}): Pendencia {
  return {
    id: "oc-1",
    protocolo: "2026/000123",
    tipo: "deslizamento",
    severidade: "alta",
    endereco: "Servidão do Morro, 45 (fundos)",
    ponto_referencia: "Portão azul depois da caixa d'água",
    latitude: -27.595378,
    longitude: -48.548050,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: null,
    criado_em: "2026-09-09T09:00:00.000Z",
    ...mudanca,
  };
}

/** Abre a tela e espera o carregamento do disco terminar. */
async function abrirATela(): Promise<void> {
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

let abrirUrl: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(AGORA);
  mockOcorrencia = ocorrenciaDeTeste();
  mockCatalogoDeOrgaos = [];

  abrirUrl = jest.spyOn(Linking, "openURL");
  abrirUrl.mockReset();
  abrirUrl.mockResolvedValue(true);

  jest.mocked(router.canGoBack).mockReturnValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/* ============================================================
   1. A saída nomeada
   ============================================================ */

describe("salvar e sair", () => {
  it("existe como botão visível dentro da vistoria", async () => {
    await abrirATela();
    expect(screen.getByText("Salvar e sair")).toBeTruthy();
  });

  it("volta para a lista sem descartar o que já foi preenchido", async () => {
    await abrirATela();

    /*
      Por `testID` e não pelo rótulo falado: os três campos crus desta tela
      viraram `Campo`, que monta o rótulo de acessibilidade com o texto do
      rótulo mais "opcional" e mais "com erro" quando for o caso. Prender o caso
      ao rótulo falado faria a suíte reprovar no dia em que o campo ganhasse uma
      mensagem de erro, que não é o que ele guarda.
    */
    await fireEvent.changeText(
      screen.getByTestId("observacoes-do-agente"),
      "Trinca nova na parede dos fundos.",
    );
    await act(async () => {});

    await fireEvent.press(screen.getByText("Salvar e sair"));

    expect(router.back).toHaveBeenCalledTimes(1);
    /*
      A asserção que importa mais do que a navegação: sair NÃO é desistir.
      Quem apaga o rascunho é a conclusão, depois de a fila aceitar a coleta.
    */
    expect(descartarRascunho).not.toHaveBeenCalled();
    expect(jest.mocked(salvarRascunho).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ observacoes: "Trinca nova na parede dos fundos." }),
    );
  });

  it("não pede confirmação, porque não destrói nada", async () => {
    await abrirATela();
    await fireEvent.press(screen.getByText("Salvar e sair"));

    expect(screen.queryByText(/tem certeza/i)).toBeNull();
    expect(router.back).toHaveBeenCalled();
  });

  it("sem histórico, leva para as tarefas em vez de não fazer nada", async () => {
    // Vistoria aberta direto, sem passar pela lista. `back()` não teria para
    // onde voltar e o botão ficaria mudo, que é o pior desfecho justamente
    // para o botão que existe para provar que dá para sair.
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await abrirATela();

    await fireEvent.press(screen.getByText("Salvar e sair"));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/(agente)");
  });
});

/* ============================================================
   2. O prazo dentro do formulário
   ============================================================ */

/*
  As afirmacoes de prazo casam por PREFIXO, e nao por igualdade.

  O selo passou a trazer tambem a DATA entre parenteses ("Prazo vence em 8h
  (10/09, 12:30)"): o relativo responde "tenho tempo?" e a data responde "cai
  dentro do meu turno?". Prender o teste ao texto inteiro faria o fuso da
  maquina de quem roda a suite decidir se ela passa.
*/
describe("o prazo dentro da vistoria", () => {
  it("mostra quanto falta, e não só na lista de tarefas", async () => {
    mockOcorrencia = ocorrenciaDeTeste({
      prazo_em: new Date(AGORA.getTime() + 8 * HORA).toISOString(),
    });
    await abrirATela();

    expect(screen.getByText(/^Prazo vence em 8h \(/)).toBeTruthy();
  });

  it("diz a palavra 'vencido', e não confia só na cor", async () => {
    mockOcorrencia = ocorrenciaDeTeste({
      prazo_em: new Date(AGORA.getTime() - 3 * HORA).toISOString(),
    });
    await abrirATela();

    /*
      O "! " que abria o rótulo saiu, e no lugar dele entrou `IconePrazoVencido`.
      O caractere era o MESMO "!" do aviso de alerta: dois sinais iguais para
      duas coisas diferentes na mesma tela. A garantia que este caso guarda não
      mudou, e são as três pistas juntas: a palavra "vencido", a cor de perigo e
      agora um desenho com forma própria.
    */
    const selo = screen.getByText(/^Prazo vencido há 3h \(/);
    expect(StyleSheet.flatten(selo.props.style).color).toBe(temaEscuro.perigoTexto);
  });

  it("refaz a conta sozinho, sem o agente sair da tela", async () => {
    mockOcorrencia = ocorrenciaDeTeste({
      prazo_em: new Date(AGORA.getTime() + 90 * MINUTO).toISOString(),
    });
    await abrirATela();
    expect(screen.getByText(/^Prazo vence em 1h30 \(/)).toBeTruthy();

    /*
      Uma vistoria de morro dura quarenta minutos. Sem relógio, a conta fica
      congelada no instante em que a tela abriu e o selo continua prometendo
      uma hora e meia que já foi embora.
    */
    await act(async () => { jest.advanceTimersByTime(31 * MINUTO); });

    expect(screen.getByText(/^Prazo vence em 59min \(/)).toBeTruthy();
    expect(screen.queryByText(/^Prazo vence em 1h30 \(/)).toBeNull();
  });

  it("ocorrência sem prazo não inventa contagem", async () => {
    await abrirATela();
    expect(screen.getByText("Sem prazo definido")).toBeTruthy();
  });
});

/* ============================================================
   3. Abrir no aplicativo de mapas
   ============================================================ */

describe("abrir no mapa", () => {
  it("o botão tem rótulo visível, e não só um ícone", async () => {
    await abrirATela();
    expect(screen.getByText("Abrir no mapa")).toBeTruthy();
  });

  it("entrega ao aparelho a coordenada da OCORRÊNCIA", async () => {
    await abrirATela();

    await fireEvent.press(screen.getByText("Abrir no mapa"));

    await waitFor(() => { expect(abrirUrl).toHaveBeenCalledTimes(1); });
    // A coordenada é a de onde o agente precisa chegar, e não a do GPS dele,
    // que é onde ele já está.
    expect(abrirUrl.mock.calls[0]?.[0]).toContain("-27.595378,-48.548050");
  });

  it("quando nenhum aplicativo atende, mostra a coordenada em texto", async () => {
    abrirUrl.mockRejectedValue(new Error("sem quem atenda"));
    await abrirATela();

    await fireEvent.press(screen.getByText("Abrir no mapa"));

    // Dizer só "não deu" deixaria o agente sem nada. Com os números na tela
    // ele copia para outro aplicativo ou lê por rádio para a base.
    expect(await screen.findByText(/-27\.595378, -48\.548050/)).toBeTruthy();
  });

  it("ocorrência sem coordenada não mostra botão que não leva a lugar nenhum", async () => {
    mockOcorrencia = ocorrenciaDeTeste({ latitude: null, longitude: null });
    await abrirATela();

    expect(screen.queryByText("Abrir no mapa")).toBeNull();
    expect(screen.getByText(/chegou sem coordenada/)).toBeTruthy();
  });
});
