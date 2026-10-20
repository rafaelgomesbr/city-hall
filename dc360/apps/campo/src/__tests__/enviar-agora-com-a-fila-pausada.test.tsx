/**
 * "Enviar agora" com a fila PAUSADA diz o que destrava, e não manda esperar
 * sinal (V2-F00-E06, correção 3).
 *
 * O achado da rodada 5 (QA, `validacao/4ce0433/qa.md`): na tarefa vencida com a
 * coleta guardada, tocar em "Enviar agora" com a fila parada pela sessão, pela
 * conta desativada ou pela senha provisória mostrava "Ainda não deu para enviar"
 * e "sai quando o aplicativo estiver aberto e houver sinal". Sinal não resolve
 * nenhum dos três: a sessão encerrada precisa de "entrar de novo", a conta
 * desativada da coordenação, a senha provisória da troca no painel. A tarja
 * contradizia a faixa do topo e o cartão da tarefa, que a correção 2 já tinha
 * consertado para não mandar esperar sinal.
 *
 * As frases esperadas aqui NÃO são copiadas para o teste: vêm de
 * `frasesDaPausa`, a fonte única que a faixa, o aviso da fila e o cartão usam.
 * Se alguém reescrever uma delas, as quatro superfícies mudam juntas, e este
 * teste continua exigindo que a tarja seja uma delas.
 *
 * Mora em `__tests__` porque tudo dentro de `src/app` vira ROTA no Expo.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ItemFila, MotivoDeSessao } from "@dc360/campo";
import type { Pendencia } from "../dados/api";
import { frasesDaPausa } from "../dados/pausa-da-fila";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

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
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => "2026-09-13T13:00:00.000Z"),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

/* Listas vazias ESTÁVEIS: um array novo a cada leitura vira laço de render. */
const SEM_RASCUNHOS: never[] = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));

let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
  marcarEnviada: jest.fn(async () => {}),
}));

/*
  A fila é um dublê com os DOIS canais por onde a tela fica sabendo da pausa: o
  resumo entregue a quem assina (o que a faixa e o cartão leem) e o resultado
  do dreno (`paradaPor`, o retorno real do motor, provado pela sonda E2 do QA
  contra a rota do painel). O item continua `pendente` nos dois, como no motor.
*/
let mockItensDaFila: ItemFila[] = [];
let mockPausadaNoResumo: MotivoDeSessao | null = null;
let mockParadaPor: MotivoDeSessao | undefined;
const mockDrenar = jest.fn(async () => ({
  fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0,
  interrompido: true,
  ...(mockParadaPor ? { paradaPor: mockParadaPor } : {}),
}));
const mockFila = {
  itens: async () => mockItensDaFila,
  assinar: (ouvinte: (r: unknown) => void) => {
    ouvinte({ pendentes: 1, pausadaPor: mockPausadaNoResumo });
    return () => undefined;
  },
  drenar: mockDrenar,
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
  }),
}));

import Tarefas from "../app/(agente)/index";

const ID = "11111111-1111-4111-8111-111111111111";
const PROTOCOLO = "000471/2026";
const VENCIDA = new Date(Date.now() - 3 * 3_600_000).toISOString();

const MOTIVOS: MotivoDeSessao[] = [
  "sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria",
];

function tarefa(): Pendencia {
  return {
    id: ID,
    protocolo: PROTOCOLO,
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
    prazo_em: VENCIDA,
    criado_em: "2026-09-13T09:00:00.000Z",
  } as Pendencia;
}

function coletaPendente(): ItemFila {
  return {
    id: "item-1",
    tipo: "vistoria",
    estado: "pendente",
    autor: { usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-1" },
    ocorrenciaId: ID,
    protocolo: PROTOCOLO,
    tentativas: 0,
    criadoEm: "2026-09-13T12:00:00.000Z",
    liberadoEm: "2026-09-13T12:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    envelope: {} as never,
  } as ItemFila;
}

async function tocarEmEnviarAgora(): Promise<void> {
  await render(<Tarefas />);
  await act(async () => {});
  await act(async () => { fireEvent.press(screen.getByTestId(`enviar-${ID}`)); });
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  mockItensDaFila = [coletaPendente()];
  mockColetas = [{ ocorrenciaId: ID, situacao: "na_fila" }];
  mockPausadaNoResumo = null;
  mockParadaPor = undefined;
  mockDrenar.mockClear();
});

/* Controle: sem pausa a frase de sempre continua valendo, porque é verdade. */
describe("Enviar agora com a fila andando", () => {
  it("sem sinal, diz que a coleta continua guardada e sai com sinal", async () => {
    await tocarEmEnviarAgora();

    expect(screen.getByText("Ainda não deu para enviar")).toBeTruthy();
    expect(screen.getByText(/houver sinal/)).toBeTruthy();
  });
});

describe("Enviar agora com a fila pausada", () => {
  it.each(MOTIVOS)("%s: o dreno devolve a pausa e a tarja diz o que destrava, com as frases da faixa e do cartão", async (motivo) => {
    const frases = frasesDaPausa(motivo);
    mockParadaPor = motivo;

    await tocarEmEnviarAgora();

    expect(mockDrenar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(frases.faixaTitulo)).toBeTruthy();
    expect(screen.getByText(frases.doCartao)).toBeTruthy();
    expect(screen.queryByText("Ainda não deu para enviar")).toBeNull();
    expect(screen.queryByText(/houver sinal/)).toBeNull();
  });

  /*
    O dreno que já estava rodando (o laço de fundo) devolve `interrompido` SEM
    `paradaPor`. A pausa que a tela já conhece pelo resumo da fila tem de valer
    do mesmo jeito: senão a corrida entre o toque e o laço reabre o defeito.
  */
  it.each(MOTIVOS)("%s: o dreno não diz o motivo, mas a fila já estava pausada, e vale a pausa que a tela conhece", async (motivo) => {
    const frases = frasesDaPausa(motivo);
    mockPausadaNoResumo = motivo;

    await tocarEmEnviarAgora();

    expect(screen.getByText(frases.faixaTitulo)).toBeTruthy();
    expect(screen.getByText(frases.doCartao)).toBeTruthy();
    expect(screen.queryByText("Ainda não deu para enviar")).toBeNull();
    expect(screen.queryByText(/houver sinal/)).toBeNull();
  });
});
