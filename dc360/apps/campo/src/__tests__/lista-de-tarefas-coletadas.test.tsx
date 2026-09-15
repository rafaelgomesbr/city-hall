/**
 * A lista de tarefas depois que a vistoria já foi feita.
 *
 * O relato que este arquivo trava, na letra: "ao concluir a vistoria e ela
 * entrar na fila de envio, o item ainda aparece na lista de tarefas sem
 * qualquer indicativo".
 *
 * A tarefa só sai da lista quando o aparelho conseguir falar com o servidor, e
 * no morro isso leva horas. Nesse intervalo ela ficava idêntica às que ninguém
 * tocou, e era esse silêncio que convidava o agente a abrir de novo e começar,
 * sem saber, a segunda vistoria do mesmo protocolo.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo.
 */

import { act, render, screen } from "@testing-library/react-native";
import type { ColetaLocal } from "@dc360/campo";
import type { Pendencia } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

/* `useFocusEffect` vira um efeito comum: o roteador de verdade traria o Expo
   Router inteiro para dentro do teste sem responder nenhuma pergunta a mais. */
jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "https://api.exemplo",
}));

let mockTarefas: Pendencia[] = [];
let mockColetas: ColetaLocal[] = [];
let mockRascunhos: { ocorrenciaId: string }[] = [];
/* `tipo` entra aqui porque a fila passou a levar dois tipos de item, e a
   promoção da lápide só vale para a vistoria: uma devolução confirmada marcando
   "coletada e enviada" seria a tela afirmando uma vistoria que não houve. O
   depósito garante o campo até para item gravado por versão anterior. */
let mockItensDaFila: { tipo: string; ocorrenciaId: string; estado: string }[] = [];
const mockPromovidas: string[] = [];

jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-09T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  /* Nulo: a lista veio inteira. O aviso de corte tem teste proprio. */
  tetoAtingido: jest.fn(async () => null),
}));

jest.mock("../dados/rascunho", () => ({
  listarRascunhos: jest.fn(async () => mockRascunhos),
}));

jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async (id: string) => { mockPromovidas.push(id); }),
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({ itens: async () => mockItensDaFila }),
}));

/* Sem sinal: a tela lê o disco e não tenta a rede, que é o estado em que o
   defeito acontece. */
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: false, tipo: "nenhum" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: { nome: "Agente de teste", municipio: "Teste", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "11111111-1111-4111-8111-111111111111";

function tarefa(): Pendencia {
  return {
    id: ID,
    protocolo: "2026/000123",
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
    criado_em: "2026-09-09T09:00:00.000Z",
  } as Pendencia;
}

function lapide(situacao: ColetaLocal["situacao"]): ColetaLocal {
  return {
    ocorrenciaId: ID,
    idempotencyKey: "chave-da-coleta",
    protocolo: "2026/000123",
    coletadaEm: "2026-09-09T13:00:00.000Z",
    situacao,
  };
}

async function abrirALista(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  mockColetas = [];
  mockRascunhos = [];
  mockItensDaFila = [];
  mockPromovidas.length = 0;
});

describe("o selo da coleta na lista", () => {
  /*
    Antes disto a tarefa concluída ficava aqui igual às intocadas, e o agente
    não tinha como saber que já tinha subido naquele morro.
  */
  it("a tarefa já coletada diz que está aguardando envio", async () => {
    mockColetas = [lapide("na_fila")];

    await abrirALista();

    expect(screen.getByText(/Coletada, aguardando envio/)).toBeTruthy();
  });

  it("a coleta já confirmada pelo servidor diz que foi enviada", async () => {
    mockColetas = [lapide("enviada")];

    await abrirALista();

    expect(screen.getByText(/Coletada e enviada/)).toBeTruthy();
  });

  it("tarefa nunca coletada não ganha selo nenhum", async () => {
    await abrirALista();

    expect(screen.queryByText(/Coletada/)).toBeNull();
  });

  /*
    O selo entra também no rótulo de acessibilidade: quem usa leitor de tela
    não vê nem a borda de destaque nem o tique, e "isso já foi coletado" é
    justamente a informação que evita a segunda vistoria.
  */
  it("o selo também é dito por quem lê a tela em voz alta", async () => {
    mockColetas = [lapide("na_fila")];

    await abrirALista();

    /* O resumo do item é o elemento que o leitor anuncia, e o selo vai nele. */
    expect(
      screen.getByLabelText(/^Protocolo 2026\/000123.*Coletada, aguardando envio/),
    ).toBeTruthy();
  });

  /*
    Os dois nunca aparecem juntos: quando existe lápide que barra, a tela de
    vistoria não retoma rascunho nenhum, e convidar a "continuar" seria
    prometer uma tela que não vai abrir.
  */
  it("coletada vence 'vistoria começada' quando os dois existem", async () => {
    mockColetas = [lapide("na_fila")];
    mockRascunhos = [{ ocorrenciaId: ID }];

    await abrirALista();

    expect(screen.getByText(/Coletada, aguardando envio/)).toBeTruthy();
    expect(screen.queryByText(/Vistoria começada/)).toBeNull();
  });
});

describe("a promoção do selo pela fila de envio", () => {
  it("item confirmado pela fila promove a lápide para enviada", async () => {
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "confirmado" }];

    await abrirALista();

    /*
      A conta e por ocorrencia, e nao por chamada: a tela le o disco na
      montagem e a cada foco, entao a promocao acontece mais de uma vez. Ela e
      idempotente de proposito (`UPDATE ... WHERE situacao = 'na_fila'`), e
      exigir exatamente uma chamada aqui seria travar o numero de leituras da
      tela, que nao e o que este teste protege.
    */
    expect([...new Set(mockPromovidas)]).toEqual([ID]);
  });

  /*
    Item que ainda está subindo não é prova de envio. Dizer "enviada" aqui
    seria a tela afirmando que o servidor tem o que ele ainda não tem.
  */
  it("item pendente na fila não promove nada", async () => {
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [{ tipo: "vistoria", ocorrenciaId: ID, estado: "pendente" }];

    await abrirALista();

    expect(mockPromovidas).toEqual([]);
  });

  /*
    Sumir da fila não é prova de envio: descartar também tira da fila, e uma
    lápide dizendo "enviada" sobre uma coleta descartada esconderia do agente
    um laudo que nunca chegou.
  */
  it("coleta ausente da fila não vira enviada", async () => {
    mockColetas = [lapide("na_fila")];
    mockItensDaFila = [];

    await abrirALista();

    expect(mockPromovidas).toEqual([]);
  });
});
