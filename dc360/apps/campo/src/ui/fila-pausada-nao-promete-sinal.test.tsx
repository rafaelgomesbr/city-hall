/**
 * A fila PAUSADA não promete sinal em lugar nenhum da tela da fila
 * (V2-F00-E06, correção 3).
 *
 * A correção 1 trocou o cartão da coleta e a correção 2 o cartão da tarefa,
 * mas sobravam quatro pontos da própria tela da fila que, com a sessão
 * encerrada, a conta desativada ou a senha provisória, ainda diziam que o envio
 * sai "quando a conexão voltar" ou "com sinal":
 *
 * 1. o cartão da DEVOLUÇÃO pendente ("vai sair quando ... houver sinal");
 * 2. a tarja "Sem sinal agora" ("sai quando a conexão voltar");
 * 3. a legenda do botão "Tentar enviar agora" ("com sinal, o envio acontece
 *    sem você tocar em nada");
 * 4. o retorno de "Tentar de novo" ("se houver sinal, ela sai agora").
 *
 * As frases esperadas vêm de `frasesDaPausa`, a fonte única da faixa, do aviso
 * da fila e dos cartões: o teste não copia texto, exige a mesma frase.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type {
  AutorDaColeta, ItemDeDevolucao, ItemDeVistoria, ItemFila, MotivoDeSessao,
} from "@dc360/campo";

const AGENTE: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("../dados/correcao-da-coleta", () => ({
  devolverParaCorrecao: jest.fn(async () => ({ retirada: false, motivo: "nao_encontrada" })),
}));
jest.mock("./useReducaoDeMovimento", () => ({ useReducaoDeMovimento: () => false }));
jest.mock("./retornoTatil", () => ({ retornoTatil: jest.fn() }));

const mockEncerrarSessaoVencida = jest.fn(async () => {});
/* O MESMO objeto a cada renderização: um novo refaz o efeito de abertura em laço. */
const mockSessao = {
  obterToken: async () => "token-de-mentira",
  lerIdentidade: () => AGENTE,
  identidade: AGENTE,
  encerrarSessaoVencida: () => mockEncerrarSessaoVencida(),
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));
let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({ useSinal: () => ({ temSinal: mockTemSinal, tipo: "Wi-Fi" }) }));

let mockItens: ItemFila[] = [];
let avisarQueMudou: ((resumo: unknown) => void) | null = null;
const mockFila = {
  itens: async () => mockItens,
  assinar: (aviso: (resumo: unknown) => void) => {
    avisarQueMudou = aviso;
    return () => { avisarQueMudou = null; };
  },
  drenar: async () => undefined,
  descartar: jest.fn(async () => {}),
  reenviar: jest.fn(async () => {}),
  assumir: jest.fn(async () => {}),
  abrirMaoDasEvidenciasPerdidas: jest.fn(async () => ({ liberado: true, perdidas: 0 })),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

import TelaDaFila from "../app/(agente)/fila";
import { frasesDaPausa } from "../dados/pausa-da-fila";

function coleta(id: string, protocolo: string): ItemDeVistoria {
  return {
    tipo: "vistoria",
    id,
    ocorrenciaId: `oc-${id}`,
    protocolo,
    autor: AGENTE,
    envelope: {} as never,
    estado: "pendente",
    tentativas: 0,
    criadoEm: "2026-10-06T09:00:00.000Z",
    liberadoEm: "2026-10-06T09:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
  };
}

beforeEach(() => {
  mockTemSinal = true;
  mockItens = [coleta("a", "2026/000471"), coleta("b", "2026/000472")];
  avisarQueMudou = null;
  mockEncerrarSessaoVencida.mockClear();
  (router.replace as jest.Mock).mockClear();
  mockFila.descartar.mockClear();
  mockFila.reenviar.mockClear();
});

async function abrirComPausa(pausadaPor: MotivoDeSessao | null): Promise<void> {
  await render(<TelaDaFila />);
  await act(async () => {});
  // O motor avisa o resumo a cada mudança; a pausa chega por esse canal.
  await act(async () => { avisarQueMudou?.({ pausadaPor }); });
}


const MOTIVOS: MotivoDeSessao[] = [
  "sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria",
];

function devolucao(id: string, protocolo: string): ItemDeDevolucao {
  return {
    tipo: "devolucao",
    id,
    ocorrenciaId: `oc-${id}`,
    protocolo,
    autor: AGENTE,
    devolucao: {
      idempotencyKey: `chave-${id}`,
      ocorrenciaId: `oc-${id}`,
      decididaEm: "2026-10-06T09:00:00.000Z",
      motivo: "morador_ausente",
    },
    estado: "pendente",
    tentativas: 0,
    criadoEm: "2026-10-06T09:00:00.000Z",
    liberadoEm: "2026-10-06T09:00:00.000Z",
    ultimaFalha: null,
    confirmadoEm: null,
    fotos: [],
  } as ItemDeDevolucao;
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEGENDA_DO_BOTAO = /Com o aplicativo aberto e com sinal, o envio acontece sem você tocar/;

describe("fila pausada", () => {
  it.each(MOTIVOS)("%s: a devolução guardada diz o que destrava, e não manda esperar sinal", async (motivo) => {
    const frases = frasesDaPausa(motivo);
    mockItens = [devolucao("d", "2026/000480")];

    await abrirComPausa(motivo);

    expect(screen.getByText(new RegExp(`^Motivo: .*${escapar(frases.doCartao)}$`))).toBeTruthy();
    expect(screen.getByText("Devolução guardada")).toBeTruthy();
    expect(screen.queryByText("Devolução aguardando")).toBeNull();
    expect(screen.queryByText(/houver sinal/)).toBeNull();
  });

  it.each(MOTIVOS)("%s: sem sinal, a tarja não promete que a coleta sai quando a conexão voltar", async (motivo) => {
    mockTemSinal = false;

    await abrirComPausa(motivo);

    expect(screen.getByText("Sem sinal agora")).toBeTruthy();
    expect(screen.getByText("Nada se perde: o que está aqui continua guardado neste aparelho.")).toBeTruthy();
    expect(screen.queryByText(/sai quando a conexão voltar/)).toBeNull();
  });

  it.each(MOTIVOS)("%s: a legenda do botão não diz que o envio acontece sozinho com sinal", async (motivo) => {
    await abrirComPausa(motivo);

    expect(screen.getByText("Tentar enviar agora")).toBeTruthy();
    expect(screen.queryByText(LEGENDA_DO_BOTAO)).toBeNull();
  });

  it.each(MOTIVOS)("%s: 'Tentar de novo' devolve o que destrava, e não 'se houver sinal, ela sai agora'", async (motivo) => {
    const frases = frasesDaPausa(motivo);
    mockItens = [{ ...coleta("t", "2026/000490"), estado: "bloqueado" } as ItemFila];

    await abrirComPausa(motivo);
    await act(async () => { fireEvent.press(screen.getByText("Tentar de novo")); });

    expect(mockFila.reenviar).toHaveBeenCalledWith("t");
    expect(screen.getByText(new RegExp(`^O envio foi pedido de novo\\. ${escapar(frases.doCartao)}$`))).toBeTruthy();
    expect(screen.queryByText(/Se houver sinal/)).toBeNull();
  });
});

/* O controle: as quatro frases de antes continuam valendo quando a fila anda. */
describe("fila andando", () => {
  it("devolução aguardando, tarja de sem sinal, legenda e retorno do reenvio são os de sempre", async () => {
    mockItens = [
      devolucao("d", "2026/000480"),
      { ...coleta("t", "2026/000490"), estado: "bloqueado" } as ItemFila,
    ];
    mockTemSinal = false;
    await abrirComPausa(null);

    expect(screen.getByText("Devolução aguardando")).toBeTruthy();
    expect(screen.getByText(/vai sair quando o aplicativo estiver aberto e houver sinal/)).toBeTruthy();
    expect(screen.getByText(/sai quando a conexão voltar/)).toBeTruthy();
  });

  it("com sinal, a legenda do botão e o retorno do reenvio prometem o envio, porque ele acontece", async () => {
    /* Uma pendente também: com só a bloqueada o botão fica apagado e a legenda
       dá lugar ao porquê, que é outro caso. */
    mockItens = [
      coleta("p", "2026/000471"),
      { ...coleta("t", "2026/000490"), estado: "bloqueado" } as ItemFila,
    ];
    await abrirComPausa(null);
    expect(screen.getByText(LEGENDA_DO_BOTAO)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("Tentar de novo")); });

    expect(screen.getByText(/Se houver sinal, ela sai agora/)).toBeTruthy();
  });
});
