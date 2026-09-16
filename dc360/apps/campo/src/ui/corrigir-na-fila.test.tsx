/**
 * O CARTÃO DA COLETA QUE O SERVIDOR RECUSOU, depois de 15/09/2026.
 *
 * As capturas do dono, com a vistoria 000009/2026 parada na fila por 422:
 * "Precisa de atenção", "Alguns campos precisam ser corrigidos.", "0 de 2
 * arquivos já subiram", e os botões "Tentar de novo" e "Descartar". As palavras
 * dele: "se o intuito era ajudar a resolver o problema cadê o botão de editar?
 * só tem de descartar"; "o tentar novamente ali não faz sentido algum"; "pelo
 * menos mostra os campos que precisam de ajuste, possibilita a edição".
 *
 * Três coisas ficam travadas aqui:
 *
 * 1. O cartão LISTA os campos do 422, cada um com a frase do servidor, em vez
 *    da frase seca.
 * 2. Para recusa do DADO, o botão principal é "Corrigir a vistoria", e "Tentar
 *    de novo" some: repetir a mesma coleta recebe a mesma recusa. Para recusa
 *    que não é do dado (ocorrência não encontrada, sessão encerrada), "Tentar
 *    de novo" continua, e corrigir é oferecido como segunda saída.
 * 3. "Corrigir a vistoria" devolve a coleta para rascunho e abre a tela de
 *    vistoria; quando o motor recusa, o cartão diz que nada mudou.
 *
 * O arquivo mora em `src/ui` pela mesma razão dos vizinhos: `src/app` é rota.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { CODIGO_ARQUIVO_SUMIU } from "@dc360/campo";
import type { AutorDaColeta, ItemDeVistoria, ResultadoDaRetirada } from "@dc360/campo";

const AGENTE: AutorDaColeta = {
  usuarioId: "u-klaus", nome: "Klaus Berger", organizacaoId: "org-serra-alta",
};
const OUTRO_AGENTE: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE = "11111111-1111-4111-8111-000000000009";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));
jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
jest.mock("./useReducaoDeMovimento", () => ({ useReducaoDeMovimento: () => true }));
jest.mock("./retornoTatil", () => ({ retornoTatil: jest.fn() }));

const mockSessao = {
  obterToken: async () => "token-de-mentira",
  lerIdentidade: () => AGENTE,
  identidade: AGENTE,
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));
jest.mock("../dados/conectividade", () => ({ useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }) }));

const mockPush = jest.fn((_rota: unknown) => undefined);
jest.mock("expo-router", () => ({ router: { push: (rota: unknown) => mockPush(rota) } }));

let mockItens: ItemDeVistoria[] = [];
const mockReenviar = jest.fn(async (_id: string) => undefined);
const mockFila = {
  itens: async () => mockItens,
  assinar: () => () => undefined,
  drenar: async () => undefined,
  descartar: jest.fn(async () => undefined),
  reenviar: mockReenviar,
  assumir: jest.fn(async () => undefined),
  abrirMaoDasEvidenciasPerdidas: jest.fn(async () => ({ liberado: true, perdidas: 0 })),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

let mockDevolucao: ResultadoDaRetirada = { retirada: false, motivo: "nao_encontrada" };
const mockDevolver = jest.fn(async (_fila: unknown, _id: string) => mockDevolucao);
jest.mock("../dados/correcao-da-coleta", () => ({
  devolverParaCorrecao: (fila: unknown, id: string) => mockDevolver(fila, id),
}));

import TelaDaFila from "../app/(agente)/fila";
import { temaEscuro } from "./tokens";

function item(parcial: Partial<ItemDeVistoria> & Pick<ItemDeVistoria, "id">): ItemDeVistoria {
  return {
    tipo: "vistoria",
    ocorrenciaId: OCORRENCIA,
    protocolo: "000009/2026",
    autor: AGENTE,
    envelope: {} as never,
    estado: "bloqueado",
    tentativas: 3,
    criadoEm: "2026-09-15T20:40:00.000Z",
    liberadoEm: "2026-09-15T20:40:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
    ...parcial,
  };
}

/** A vistoria 000009/2026 como ela ficou na fila. */
const RECUSADA_POR_422 = item({
  id: CHAVE,
  fotos: [
    {
      papel: "foto", idempotencyKey: "ffffffff-1111-4111-8111-000000000001",
      uriLocal: "file:///documentos/foto-1.jpg", nomeArquivo: "vistoria-000009-2026-1.jpg",
      tipoConteudo: "image/jpeg", tamanhoBytes: 0, capturadaEm: "2026-09-15T20:41:00.000Z",
      ordem: 0, chave: null, evidenciaId: null, enviada: false,
    },
    {
      papel: "assinatura", idempotencyKey: `${CHAVE}-assinatura`,
      uriLocal: "file:///documentos/assinatura.png", nomeArquivo: "assinatura.png",
      tipoConteudo: "image/png", tamanhoBytes: 0, capturadaEm: "2026-09-15T20:58:00.000Z",
      ordem: 1, chave: null, evidenciaId: null, enviada: false,
    },
  ],
  ultimaFalha: {
    codigo: "dados_invalidos",
    mensagem: "Alguns campos precisam ser corrigidos.",
    campos: [
      { campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." },
    ],
    permanente: true,
    em: "2026-09-15T21:07:25.000Z",
  },
});

const NAO_ENCONTRADA = item({
  id: "22222222-2222-4222-8222-000000000002",
  protocolo: "000010/2026",
  ultimaFalha: {
    codigo: "nao_encontrada", mensagem: "Ocorrência não encontrada.", campos: [],
    permanente: true, em: "2026-09-15T21:07:25.000Z",
  },
});

beforeEach(() => {
  mockItens = [];
  mockPush.mockClear();
  mockReenviar.mockClear();
  mockDevolver.mockClear();
  mockDevolucao = { retirada: false, motivo: "nao_encontrada" };
});

async function abrirATela(): Promise<void> {
  await render(<TelaDaFila />);
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

function fundo(texto: string): string | undefined {
  const estilo = StyleSheet.flatten(screen.getByText(texto).parent?.parent?.props.style);
  return (estilo as { backgroundColor?: string } | undefined)?.backgroundColor;
}

/* ========================================================================
   1. O cartão lista os campos
   ======================================================================== */

describe("a coleta recusada por 422", () => {
  it("lista cada campo com a frase do servidor, e não a frase seca", async () => {
    mockItens = [RECUSADA_POR_422];
    await abrirATela();

    expect(screen.getByText("Precisa de correção")).toBeTruthy();
    // O rótulo humano do campo, vindo do pacote compartilhado, e a frase dele.
    expect(screen.getByText("Tamanho do arquivo")).toBeTruthy();
    expect(screen.getByText(
      "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele.",
    )).toBeTruthy();
    // A frase seca do servidor não é o cartão.
    expect(screen.queryByText("Alguns campos precisam ser corrigidos.")).toBeNull();
  });

  it("o passo diz o que o botão faz, e a chave reusada é dita em palavras", async () => {
    mockItens = [RECUSADA_POR_422];
    await abrirATela();

    const passos = screen.getByTestId(`o-que-fazer-${CHAVE}`);
    expect(within(passos).getByText(/Corrigir a vistoria/)).toBeTruthy();
    expect(within(passos).getByText(/nada duplica/)).toBeTruthy();
  });
});

/* ========================================================================
   2. Qual botão é o principal
   ======================================================================== */

describe("os botões da coleta parada", () => {
  it("recusa do dado: 'Corrigir a vistoria' é o principal e 'Tentar de novo' some", async () => {
    mockItens = [RECUSADA_POR_422];
    await abrirATela();

    expect(screen.getByText("Corrigir a vistoria")).toBeTruthy();
    expect(fundo("Corrigir a vistoria")).toBe(temaEscuro.destaqueFundo);
    expect(screen.queryByText("Tentar de novo")).toBeNull();
    // Descartar continua existindo, em segundo lugar.
    expect(screen.getByText("Descartar")).toBeTruthy();
  });

  it("arquivo perdido também é recusa do dado: corrigir é a saída ao lado de enviar sem", async () => {
    mockItens = [item({
      id: "33333333-3333-4333-8333-000000000003",
      fotos: [{
        papel: "foto", idempotencyKey: "ffffffff-3333-4333-8333-000000000003",
        uriLocal: "file:///documentos/sumiu.jpg", nomeArquivo: "sumiu.jpg",
        tipoConteudo: "image/jpeg", tamanhoBytes: 10, capturadaEm: "2026-09-15T20:41:00.000Z",
        ordem: 0, chave: null, evidenciaId: null, enviada: false, perdida: true,
      }],
      ultimaFalha: {
        codigo: CODIGO_ARQUIVO_SUMIU, mensagem: "Um registro sumiu.", campos: [],
        permanente: true, em: "2026-09-15T21:07:25.000Z",
      },
    })];
    await abrirATela();

    expect(screen.getByText("Enviar sem os registros perdidos")).toBeTruthy();
    expect(screen.getByText("Corrigir a vistoria")).toBeTruthy();
    expect(screen.queryByText("Tentar de novo")).toBeNull();
  });

  it("recusa que não é do dado: 'Tentar de novo' continua, e corrigir é a segunda saída", async () => {
    mockItens = [NAO_ENCONTRADA];
    await abrirATela();

    expect(screen.getByText("Tentar de novo")).toBeTruthy();
    expect(fundo("Tentar de novo")).toBe(temaEscuro.destaqueFundo);
    expect(screen.getByText("Corrigir a vistoria")).toBeTruthy();
    expect(fundo("Corrigir a vistoria")).not.toBe(temaEscuro.destaqueFundo);
  });

  it("coleta de outro agente não ganha 'Corrigir': o rascunho seria concluído com o nome errado", async () => {
    mockItens = [{ ...RECUSADA_POR_422, autor: OUTRO_AGENTE }];
    await abrirATela();

    expect(screen.queryByText("Corrigir a vistoria")).toBeNull();
    expect(screen.getByText("Descartar")).toBeTruthy();
  });
});

/* ========================================================================
   3. O toque em "Corrigir a vistoria"
   ======================================================================== */

describe("'Corrigir a vistoria'", () => {
  it("devolve a coleta para rascunho e abre a tela de vistoria", async () => {
    mockItens = [RECUSADA_POR_422];
    mockDevolucao = {
      retirada: true,
      coleta: {
        ocorrenciaId: OCORRENCIA, protocolo: "000009/2026",
        envelope: {} as never, fotos: [], ultimaFalha: null,
      },
    };
    await abrirATela();

    await tocar("Corrigir a vistoria");

    expect(mockDevolver).toHaveBeenCalledWith(mockFila, CHAVE);
    expect(mockPush).toHaveBeenCalledWith(`/(agente)/vistoria/${OCORRENCIA}`);
    // Não passa por "Tentar de novo": corrigir não é repetir.
    expect(mockReenviar).not.toHaveBeenCalled();
  });

  it("quando o motor recusa, o cartão diz que nada mudou e a tela não abre", async () => {
    mockItens = [RECUSADA_POR_422];
    mockDevolucao = { retirada: false, motivo: "de_outro_autor" };
    await abrirATela();

    await tocar("Corrigir a vistoria");

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("Nada mudou")).toBeTruthy();
  });

  it("não pergunta antes: corrigir não destrói nada, a coleta vira rascunho", async () => {
    mockItens = [RECUSADA_POR_422];
    mockDevolucao = {
      retirada: true,
      coleta: {
        ocorrenciaId: OCORRENCIA, protocolo: "000009/2026",
        envelope: {} as never, fotos: [], ultimaFalha: null,
      },
    };
    await abrirATela();

    await tocar("Corrigir a vistoria");

    expect(screen.queryByTestId("dialogo")).toBeNull();
    expect(mockDevolver).toHaveBeenCalledTimes(1);
  });
});
