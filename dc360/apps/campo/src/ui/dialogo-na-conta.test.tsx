/**
 * Sair da conta, com coleta pendente no aparelho.
 *
 * É a decisão mais cara desta tela e uma das mais caras do produto: sair apaga
 * a sessão, e sem sessão a fila não consegue enviar. Uma vistoria feita no
 * morro fica presa no aparelho até alguém entrar de novo, e ninguém do lado da
 * coordenação sabe que ela existe.
 *
 * O que estes testes travam, e o que mudou: a pergunta era `Alert.alert`, do
 * sistema, e um alerta do sistema é invisível para o teste da tela. Dava para
 * provar "o alerta foi chamado" espionando o módulo, e não dava para provar o
 * que importa, que é **a sessão continuar de pé enquanto ninguém respondeu**.
 * Agora a pergunta é um componente desta árvore, e a prova é direta.
 *
 * O arquivo mora em `src/ui` junto do `Dialogo` que ele exercita, e não em
 * `src/__tests__`: aquela pasta existe por causa do Expo, que transforma tudo
 * dentro de `src/app` em rota, e nada aqui está dentro de `src/app`.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));

/*
  "Minha conta" virou Perfil, fundida com "Minha equipe": a tela agora também lê
  o trabalho concluído e o sino do município. Nenhum dos dois é o assunto deste
  arquivo, que é o diálogo da saída.
*/
const SINO_VAZIO = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => null,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
}));

jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: SINO_VAZIO,
  avisosGuardados: async () => SINO_VAZIO,
  sincronizarAvisos: async () => SINO_VAZIO,
  marcarAvisosComoLidosNoAparelho: async () => SINO_VAZIO,
  fraseDoAviso: () => "Atualização na ocorrência",
  complementoDoAviso: () => null,
}));

/** Quantas coletas o aparelho diz ter esperando. Cada teste ajusta. */
let mockPendentes = 0;
/* A pausa que a fila entrega no resumo (V2-F00-E06, correção 3). */
let mockPausadaPor: string | null = null;
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({
      pendentes: mockPendentes, enviando: 0, bloqueados: 0, confirmados: 0,
      pausadaPor: mockPausadaPor,
    }),
    /* O Perfil assina a fila (V2-F00-E15), e a fila de verdade avisa quem assina na hora. */
    assinar: (ouvinte: (r: unknown) => void) => {
      ouvinte({
        pendentes: mockPendentes, enviando: 0, bloqueados: 0, confirmados: 0,
        pausadaPor: mockPausadaPor,
      });
      return () => undefined;
    },
  }),
}));

/*
  Nenhuma vistoria começada no disco: este arquivo é sobre a FILA. O caso com
  rascunho mora em `dialogo-na-conta-com-vistoria-comecada.test.tsx`.
*/
jest.mock("../dados/rascunho", () => ({ listarRascunhos: async () => [] }));

const mockSair = jest.fn(async () => {});
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: mockSair,
    obterToken: async () => "token-de-mentira",
    identidade: {
      nome: "Agente de teste",
      papel: "agente_campo",
      matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: false, tipo: null }),
}));

import { router } from "expo-router";
/*
  A tela passou a oferecer a escolha de tema (claro, escuro ou acompanhar o
  sistema), e com ela veio a exigência do `ProvedorDeTema` por cima: o alternador
  estoura fora dele de propósito, para um alternador sem provedor aparecer em
  quem escreve a tela e não em quem usa o aplicativo.

  O depósito da preferência é dublado para esta suíte não abrir banco nenhum. O
  caminho de verdade até o SQLite é provado em `dados/preferencia-de-tema.test.ts`,
  e o alternador em si em `__tests__/tema-a-escolha-do-agente.test.tsx`.
*/
jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

import Perfil from "../app/(agente)/perfil";
import { frasesDaPausa } from "../dados/pausa-da-fila";
import { ProvedorDeTema } from "./componentes";

beforeEach(() => {
  mockPendentes = 0;
  mockPausadaPor = null;
  mockSair.mockClear();
  (router.replace as jest.Mock).mockClear();
});

/** Monta a tela e espera o resumo da fila responder. */
async function abrirATela(): Promise<void> {
  await render(<ProvedorDeTema><Perfil /></ProvedorDeTema>);
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

describe("a pergunta antes de sair", () => {
  it("o toque em 'Sair da conta' abre a pergunta e NÃO encerra a sessão", async () => {
    /*
      O defeito que isto trava: qualquer refatoração que ligue o botão direto ao
      `sair()` deixa a tela funcionando aos olhos de quem testa à mão, porque o
      aplicativo volta para a entrada do mesmo jeito. O que se perde é a chance
      de o agente ver que tem três coletas presas no aparelho, e isso só
      aparece horas depois, quando ninguém mais liga o efeito à causa.
    */
    mockPendentes = 3;
    await abrirATela();

    await tocar("Sair da conta");

    expect(screen.getByTestId("dialogo")).toBeTruthy();
    expect(mockSair).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a pergunta conta quantas coletas ficam presas no aparelho", async () => {
    mockPendentes = 3;
    await abrirATela();

    await tocar("Sair da conta");

    expect(screen.getByText(/3 coletas ainda não enviadas/)).toBeTruthy();
  });

  /*
    Com a fila pausada pela sessão, "volta a subir quando você entrar de novo,
    com sinal" é a promessa errada (V2-F00-E06, correção 3): sinal não destrava
    nenhum dos três casos, e na conta desativada nem entrar de novo destrava. A
    pergunta diz a frase da pausa, a mesma da faixa do topo.
  */
  it.each([
    "sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria",
  ] as const)("com a fila pausada por %s, a pergunta diz a frase da pausa e não promete sinal", async (motivo) => {
    mockPendentes = 3;
    mockPausadaPor = motivo;
    await abrirATela();

    await tocar("Sair da conta");

    expect(screen.getByText(/3 coletas ainda não enviadas/)).toBeTruthy();
    expect(screen.getByText(new RegExp(
      frasesDaPausa(motivo).detalhe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ))).toBeTruthy();
    expect(screen.queryByText(/entrar de novo, com sinal|entrar de novo,\s+com sinal/)).toBeNull();
  });

  it("sem coleta pendente, a pergunta continua existindo, com outro texto", async () => {
    // Sair sem fila também custa: entrar de novo exige sinal, e sinal é
    // justamente o que falta onde este aplicativo é usado.
    await abrirATela();

    await tocar("Sair da conta");

    expect(screen.getByText(/precisar de sinal e da sua senha/)).toBeTruthy();
  });
});

describe("as duas respostas", () => {
  it("'Continuar conectado' fecha a pergunta e a sessão segue de pé", async () => {
    mockPendentes = 2;
    await abrirATela();
    await tocar("Sair da conta");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-recusa")); });

    expect(mockSair).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    /* A folha DESCE antes de sair (ver `Dialogo`): o que se cobra é que ela
       vá embora, e não que suma no mesmo quadro do toque. */
    await waitFor(() => { expect(screen.queryByTestId("dialogo")).toBeNull(); });
  });

  it("o botão que repete o verbo encerra a sessão e leva para a entrada", async () => {
    mockPendentes = 2;
    await abrirATela();
    await tocar("Sair da conta");

    await act(async () => { fireEvent.press(screen.getByTestId("dialogo-acao")); });

    expect(mockSair).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });

  /*
    "OK" responderia à pergunta do título sem dizer o que acontece com as
    coletas que estão no aparelho, e é exatamente essa a dúvida de quem lê isto
    no fim do plantão.
  */
  it("o botão que age diz o que faz, e não 'OK'", async () => {
    await abrirATela();
    await tocar("Sair da conta");

    expect(screen.getByTestId("dialogo-acao").props.accessibilityLabel)
      .toBe("Sair da conta");
  });
});
