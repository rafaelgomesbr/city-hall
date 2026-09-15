/**
 * No perfil, os mesmos dois defeitos da lista de hoje.
 *
 * O Rafa citou as duas telas na mesma frase: "no perfil também, 'não deu pra
 * atualizar agora'". É o mesmo aviso, com a mesma frase errada e a mesma falta
 * de saída, e a causa é a mesma: a sessão daquele aparelho tinha sido revogada
 * pelo servidor, então TODA chamada respondia 401, e o aplicativo lia 401 como
 * um tropeço de rede que passa sozinho.
 *
 * O que muda aqui em relação à lista é só o desenho: lá o aviso mora na faixa
 * de altura fixa e o ato de dispensar fica atrás do `ⓘ`; aqui ele é um `Aviso`
 * inteiro, e o ato entra no botão que a peça já oferece (o `Botao` do produto,
 * com o alvo de 52 e rótulo de leitor de tela).
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Perfil from "../app/(agente)/perfil";
import { SemSinal, type MeuTrabalho } from "../dados/api";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";
import { toque } from "../ui/tokens";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "dark",
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

/** A resposta do servidor, que carrega status. Ver `dados/falha-de-atualizacao`. */
class ErroDaApiFalso extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  ErroDaApi: class ErroDaApi extends Error {},
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));

let mockGuardado: { dados: MeuTrabalho; baixadoEm: string } | null = null;
/** O que a próxima ida à rede faz. Nulo: responde o trabalho de sempre. */
let quebrarARedeCom: Error | null = null;
const mockAtualizarMeuTrabalho = jest.fn(async (): Promise<MeuTrabalho> => {
  if (quebrarARedeCom) throw quebrarARedeCom;
  return TRABALHO;
});

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: jest.fn(async () => mockGuardado),
  atualizarMeuTrabalho: () => mockAtualizarMeuTrabalho(),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    identidade: { usuarioId: "u1", nome: "Agente", matricula: "123", papel: "agente_campo" },
    obterToken: async () => "token-de-teste",
    lerIdentidade: () => null,
    sair: async () => undefined,
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
  }),
}));

const AVISOS = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};
jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: AVISOS,
  avisosGuardados: async () => AVISOS,
  sincronizarAvisos: async () => AVISOS,
  marcarAvisosComoLidosNoAparelho: async () => AVISOS,
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
  colegas: [{ id: "u1", nome: "Agente", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false }],
  concluidas: [],
  totalConcluidas: 0,
  tetoDeConcluidas: 50,
  devolvidasNoMes: 0,
};

beforeEach(() => {
  /* Com cópia no aparelho: é o caso do relato, em que a tela mostra o que já
     tinha e só a ATUALIZAÇÃO falha. */
  mockGuardado = { dados: TRABALHO, baixadoEm: new Date().toISOString() };
  quebrarARedeCom = null;
});

async function abrirATela() {
  await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

async function tocarNoRotulo(rotulo: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByLabelText(rotulo)); });
}

const DISPENSAR = "Dispensar o aviso de atualização";

describe("o servidor que não reconhece mais a sessão", () => {
  it("o perfil diz que a sessão terminou, e não que foi a rede", async () => {
    quebrarARedeCom = new ErroDaApiFalso(401, "nao_autenticado", "Token inválido ou expirado.");
    await abrirATela();

    expect(screen.getByText("Sua sessão terminou")).toBeTruthy();
    expect(screen.queryByText(/Não deu para atualizar agora/)).toBeNull();
  });

  it("e ensina o caminho de volta, sem prometer o que não vale", async () => {
    quebrarARedeCom = new ErroDaApiFalso(401, "nao_autenticado", "Token inválido ou expirado.");
    await abrirATela();

    /* O botão de sair também diz "Sair da conta": o que se procura aqui é a
       frase do AVISO, que manda usar aquele botão. */
    expect(screen.getByText(/toque em "Sair da conta" e entre de novo/)).toBeTruthy();
    expect(screen.getByText(/continua guardado no aparelho/)).toBeTruthy();
  });

  it("sem sinal continua dizendo que é o sinal", async () => {
    quebrarARedeCom = new SemSinal();
    await abrirATela();

    expect(screen.getByText("Sem sinal para atualizar")).toBeTruthy();
    expect(screen.queryByText(/Sua sessão terminou/)).toBeNull();
  });
});

describe("o aviso de rede tem saída", () => {
  it("dá para fechar, com alvo de 52 e rótulo para quem ouve a tela", async () => {
    quebrarARedeCom = new ErroDaApiFalso(500, "erro", "O servidor não respondeu.");
    await abrirATela();

    const fechar = screen.getByLabelText(DISPENSAR);
    /* O alvo de toque do produto. Um `×` de 24 pontos num aviso é exatamente o
       botão que o dedo com luva de campo não acerta. */
    expect(fechar.props.style.minHeight ?? fechar.props.style[0]?.minHeight).toBe(toque);

    await tocarNoRotulo(DISPENSAR);
    expect(screen.queryByText("Não deu para atualizar agora")).toBeNull();
  });

  /*
    O gatilho de sumir sozinho é a atualização SEGUINTE dar certo, e não o
    relógio: "não deu para atualizar" continua sendo verdade enquanto não der,
    e esconder isso por tempo deixaria o agente olhando uma tela velha achando
    que é a de agora.
  */
  it("some sozinho quando a atualização seguinte dá certo", async () => {
    quebrarARedeCom = new ErroDaApiFalso(500, "erro", "O servidor não respondeu.");
    await abrirATela();
    expect(screen.getByText("Não deu para atualizar agora")).toBeTruthy();

    quebrarARedeCom = null;
    /* Com cópia no aparelho não há botão de baixar: quem atualiza é o gesto. */
    await act(async () => {
      screen.getByTestId("tela-do-perfil").props.refreshControl.props.onRefresh();
    });

    expect(screen.queryByText("Não deu para atualizar agora")).toBeNull();
    expect(screen.queryByLabelText(DISPENSAR)).toBeNull();
  });
});
