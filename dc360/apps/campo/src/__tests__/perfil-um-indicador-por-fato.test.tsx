import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Perfil from "../app/(agente)/perfil";
import type { MeuTrabalho } from "../dados/api";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";

/**
 * O que este teste protege: um indicador por fato, e espera com porta de saída.
 *
 * Dois defeitos da mesma tela, os dois relatados de uso real.
 *
 * O primeiro é o indicador triplicado. Uma variável só, `atualizando`,
 * alimentava ao mesmo tempo o `RefreshControl`, uma roda girando dentro do
 * botão e um texto. Três desenhos para uma busca só, e o pior deles era o do
 * botão: ele dizia "estou ocupado" no mesmo lugar em que o agente precisava
 * ler "não adianta apertar de novo". Sobraram o texto, que conta o fato, e o
 * botão desabilitado, que conta a consequência.
 *
 * O segundo é a espera sem fim. Primeira abertura, sem cópia gravada no
 * aparelho, com sinal ruim: a tela virava roda girando e ficava assim até o
 * agente matar o aplicativo. Agora a espera tem saída, e sair dela devolve a
 * tela ao agente sem cancelar a busca que já está a caminho.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo: um teste ali seria uma tela navegável dentro do
 * aplicativo publicado.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "dark",
}));

/* O roteador de verdade traria o pacote inteiro do expo-router para dentro do
   teste sem nenhuma pergunta a mais respondida. */
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

let mockGuardado: { dados: MeuTrabalho; baixadoEm: string } | null = null;
/** A rede que aceita a chamada e nunca responde, que é o caso do relato. */
let mockResolverBusca: ((dados: MeuTrabalho) => void) | null = null;

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: jest.fn(async () => mockGuardado),
  atualizarMeuTrabalho: jest.fn(
    () => new Promise((cumprir) => { mockResolverBusca = cumprir; }),
  ),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    identidade: { usuarioId: "u1", nome: "Agente", matricula: "123" },
    obterToken: async () => "token-de-teste",
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));

/*
  As peças que a fusão trouxe para esta tela, e que não são o assunto daqui.

  A tela agora responde por identidade, aparelho, tema, sino e saída, e cada uma
  delas tem suíte própria. Dublar todas com o mínimo é o que mantém ESTE arquivo
  falando de uma coisa só: quantos indicadores uma busca acende.
*/
jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
  }),
}));

jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: {
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  },
  avisosGuardados: async () => ({
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  }),
  sincronizarAvisos: async () => ({
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: new Date().toISOString(),
  }),
  marcarAvisosComoLidosNoAparelho: async () => ({
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  }),
  fraseDoAviso: () => "Atualização na ocorrência",
  complementoDoAviso: () => null,
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

const TRABALHO: MeuTrabalho = {
  equipe: { id: "e1", nome: "Equipe Alfa", especialidade: "Geotecnia", ativa: true },
  colegas: [
    { id: "u1", nome: "Agente", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false },
    { id: "u2", nome: "Colega", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false },
  ],
  concluidas: [],
  totalConcluidas: 0,
  tetoDeConcluidas: 50,
  devolvidasNoMes: 0,
};

beforeEach(() => {
  mockGuardado = null;
  mockResolverBusca = null;
});

afterEach(() => { jest.useRealTimers(); });

/** Monta a tela e deixa a leitura do disco e o começo da busca acontecerem. */
async function abrirATela() {
  const tela = await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
  return tela;
}

describe("a primeira abertura, sem cópia no aparelho e com a rede pendurada", () => {
  it("dá saída da espera aos seis segundos e devolve a tela ao agente", async () => {
    jest.useFakeTimers();
    await abrirATela();

    expect(screen.getByTestId("espera")).toBeTruthy();
    expect(screen.queryByLabelText("Parar de esperar")).toBeNull();

    await act(async () => { jest.advanceTimersByTime(6_000); });
    await fireEvent.press(screen.getByLabelText("Parar de esperar"));

    /* A tela volta a ser a tela, com o caminho de sempre à mão. */
    expect(screen.queryByTestId("espera")).toBeNull();
    expect(screen.getByText("O seu trabalho ainda não foi baixado")).toBeTruthy();

    /*
      E a busca continua em voo: quem desistiu foi a espera, não a requisição.
      Cancelar aqui gastaria o dado do agente duas vezes pelo mesmo dado.
    */
    await act(async () => { mockResolverBusca?.(TRABALHO); });
    /* O nome da equipe aparece no cabeçalho (junto do cargo) e no cartão dela. */
    expect(screen.getAllByText("Equipe Alfa").length).toBeGreaterThan(0);
  });

  it("enquanto busca, o botão fica desabilitado e sem roda girando dentro dele", async () => {
    jest.useFakeTimers();
    await abrirATela();
    await act(async () => { jest.advanceTimersByTime(6_000); });
    await fireEvent.press(screen.getByLabelText("Parar de esperar"));

    const botao = screen.getByLabelText("Baixar o meu trabalho");
    expect(botao.props.accessibilityState.disabled).toBe(true);
    /*
      `busy` no botão era o terceiro indicador do mesmo fato. O fato quem conta
      é o texto abaixo; ao botão cabe dizer só que apertar de novo não adianta.
    */
    expect(botao.props.accessibilityState.busy).toBe(false);
    expect(screen.queryByTestId("botao-ocupado")).toBeNull();
    expect(screen.getByText(/Buscando o seu trabalho/i)).toBeTruthy();
  });
});

describe("a tela já aberta, com cópia no aparelho, atualizando por cima", () => {
  it("mostra a busca no puxar da tela e em palavras, e em mais lugar nenhum", async () => {
    mockGuardado = { dados: TRABALHO, baixadoEm: new Date().toISOString() };
    await abrirATela();

    /* O conteúdo é o do disco, e ele aparece antes de a rede responder. */
    expect(screen.getAllByText("Equipe Alfa").length).toBeGreaterThan(0);

    const puxarParaAtualizar = () =>
      screen.getByTestId("tela-do-perfil").props.refreshControl.props.refreshing;
    expect(puxarParaAtualizar()).toBe(true);
    /*
      O texto existe porque o `RefreshControl` só desenha enquanto o dedo
      segura a tela: a atualização que acontece sozinha na abertura ficaria sem
      indicador nenhum.
    */
    expect(screen.getByText(/\(buscando\)/)).toBeTruthy();
    expect(screen.queryByTestId("botao-ocupado")).toBeNull();

    await act(async () => { mockResolverBusca?.(TRABALHO); });
    expect(screen.queryByText(/\(buscando\)/)).toBeNull();
    expect(puxarParaAtualizar()).toBe(false);
  });
});
