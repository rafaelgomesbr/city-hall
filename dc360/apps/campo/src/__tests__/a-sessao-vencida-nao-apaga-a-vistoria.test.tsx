/**
 * A sessão que venceu não pode apagar a vistoria começada.
 *
 * O achado, provado pelo revisor em 15/09/2026: a faixa da lista de tarefas
 * dizia "Sua sessão terminou" e oferecia "Sair e entrar de novo", e o botão
 * chamava o MESMO `sair()` do fim do turno. `sair()` apaga o dado local
 * (`apagarDadosLocais`), e o dado local inclui o rascunho da vistoria começada
 * com as fotos e a assinatura dela: nada na fila aponta para esses arquivos
 * ainda, então a limpeza os leva junto. A pessoa só precisava entrar de novo, e
 * perdia meia hora de barranco sem nenhum aviso.
 *
 * O caminho certo é outro verbo da sessão, `encerrarSessaoVencida`, que
 * derruba a credencial e deixa o disco como está. Quem confere se a pessoa
 * que entra em seguida é a mesma fica no login (`acolherNoAparelho`), e a
 * prova disso está em `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`. Aqui se prova
 * a tela: o botão da faixa chama o verbo que NÃO apaga, e diz "Entrar de novo".
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: () => "99999999-9999-4999-8999-999999999999",
}));

/** A resposta do servidor, que carrega status. Ver `dados/falha-de-atualizacao`. */
class MockErroDaApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}
jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  ErroDaApi: class ErroDaApi extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

const mockTarefa = {
  id: "11111111-1111-4111-8111-111111111111",
  protocolo: "000471/2026",
  tipo: "deslizamento",
  severidade: "alta",
  endereco: "Servidão do Morro, 45",
  ponto_referencia: null,
  latitude: -27.595378,
  longitude: -48.548050,
  descricao: "Barranco escorregou sobre os fundos da casa.",
  solicitante_nome: "Maria de exemplo",
  solicitante_contato: null,
  vulnerabilidade_presente: false,
  vulnerabilidade_descricao: null,
  prazo_em: null,
  criado_em: "2026-09-13T09:00:00.000Z",
} as Pendencia;

/* Lista e data ESTÁVEIS: valor novo a cada leitura troca o estado, que
   provoca renderização, que relê o disco, para sempre. */
const mockTarefas = [mockTarefa];
const mockBaixadasEm = new Date().toISOString();
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => mockBaixadasEm),
  atualizarPendencias: jest.fn(async () => {
    throw new MockErroDaApi(401, "nao_autenticado", "Token inválido ou expirado.");
  }),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

const SEM_RASCUNHOS: never[] = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));
const SEM_COLETAS: never[] = [];
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => SEM_COLETAS),
  marcarEnviada: jest.fn(async () => {}),
}));
const SEM_ITENS: never[] = [];
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    itens: async () => SEM_ITENS,
    assinar: () => () => {},
    drenar: jest.fn(async () => ({})),
    enfileirarDevolucao: jest.fn(),
  }),
}));
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

/*
  Os DOIS verbos da sessão, espionados: o que apaga (`sair`) e o que não apaga
  (`encerrarSessaoVencida`). O teste inteiro é sobre qual dos dois o botão
  chama.
*/
const mockSair = jest.fn(async () => {});
const mockEncerrarSessaoVencida = jest.fn(async () => {});
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
    sair: mockSair,
    encerrarSessaoVencida: mockEncerrarSessaoVencida,
  }),
}));

import { router } from "expo-router";
import Tarefas from "../app/(agente)/index";

beforeEach(() => {
  mockSair.mockClear();
  mockEncerrarSessaoVencida.mockClear();
  (router.replace as jest.Mock).mockClear();
});

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

describe("a sessão que venceu no meio do plantão", () => {
  it("o botão da faixa diz 'Entrar de novo', e não 'Sair'", async () => {
    await abrirALista();
    const faixa = within(screen.getByTestId("faixa-de-estado"));
    expect(faixa.getByText("Sua sessão terminou")).toBeTruthy();
    expect(screen.getByTestId("ato-do-aviso").props.accessibilityLabel).toBe("Entrar de novo");
  });

  it("tocar nele derruba a sessão SEM apagar o disco, e leva à entrada", async () => {
    await abrirALista();

    await act(async () => { fireEvent.press(screen.getByTestId("ato-do-aviso")); });

    /* O ponto do teste: o verbo que apaga rascunho, fotos e assinatura NÃO é
       chamado. Quem confere a pessoa que entra depois é o login. */
    expect(mockSair).not.toHaveBeenCalled();
    expect(mockEncerrarSessaoVencida).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });

  it("o texto por extenso promete a vistoria começada de pé, e não manda 'Sair da conta'", async () => {
    await abrirALista();
    await act(async () => { fireEvent.press(screen.getByTestId("detalhe-da-lista")); });

    const dialogo = within(screen.getByTestId("explicacao"));
    expect(dialogo.getByText(/Entrar de novo/)).toBeTruthy();
    expect(dialogo.getByText(/vistoria começada/)).toBeTruthy();
    /* Mandar a pessoa a "Sair da conta" seria mandá-la ao caminho que apaga. */
    expect(dialogo.queryByText(/Sair da conta/)).toBeNull();
  });
});
