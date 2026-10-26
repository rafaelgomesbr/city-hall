/**
 * A fila de envio quando o servidor recusa QUEM está mandando (V2-F00-E06).
 *
 * Até esta etapa, 401 e 403 de sessão ou de conta eram lidos pelo motor como
 * recusa da coleta: o item virava `bloqueado`, a tela dizia "Precisa de
 * atenção" e ao lado ficava o botão "Descartar". Uma vistoria feita no morro por
 * quem foi desativado (ou cuja sessão caiu) ficava marcada como recusada.
 *
 * Agora o motor mantém o item `pendente` e avisa que a fila está PAUSADA pela
 * sessão. O que a tela cobra aqui:
 *
 * 1. a frase diz o fato, o que resolve e a promessa (a coleta continua guardada);
 * 2. sessão encerrada traz o botão que resolve ("Entrar de novo"); conta
 *    desativada NÃO traz, porque entrar de novo não resolve;
 * 3. o cartão da coleta deixa de prometer "vai sair quando o aplicativo estiver aberto
 *    e houver sinal" (a coleta pausada pela sessão não sai nem assim);
 * 4. nenhum botão de apagar aparece: a coleta pausada não é uma coleta recusada;
 * 5. sem pausa, a tela é a de sempre.
 *
 * Este é o teste de componente que substitui, neste ambiente, a captura em
 * aparelho: o Expo não renderiza aqui, e a foto do aparelho fica como validação
 * humana pendente (ver `docs/evidencias-v2/G00/V2-F00-E06/RESUMO.md`).
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { AutorDaColeta, ItemDeVistoria, ItemFila, MotivoDeSessao } from "@dc360/campo";

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
jest.mock("../dados/conectividade", () => ({ useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }) }));

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

describe("sessão encerrada", () => {
  it("diz o fato, o que resolve e que a coleta continua guardada", async () => {
    await abrirComPausa("sessao_encerrada");

    expect(screen.getByText("Sua sessão terminou e o envio está parado")).toBeTruthy();
    expect(screen.getByText(/Suas coletas continuam guardadas neste aparelho e nada foi apagado/)).toBeTruthy();
    expect(screen.getByText(/Entre de novo com o seu email e a sua senha/)).toBeTruthy();
  });

  it("traz o botão 'Entrar de novo', que derruba a sessão sem apagar e leva à entrada", async () => {
    await abrirComPausa("sessao_encerrada");

    await act(async () => { fireEvent.press(screen.getByText("Entrar de novo")); });

    expect(mockEncerrarSessaoVencida).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/entrar");
    // Nada foi descartado: o ato é encerrar a sessão, não a coleta.
    expect(mockFila.descartar).not.toHaveBeenCalled();
  });

  it("o cartão da coleta não promete 'vai sair quando o aplicativo estiver aberto e houver sinal'", async () => {
    await abrirComPausa("sessao_encerrada");

    expect(screen.queryByText(/Vai sair quando o aplicativo estiver aberto/)).toBeNull();
    expect(screen.queryByText(/assim que houver sinal/)).toBeNull();
    expect(screen.getAllByText("Guardada")).toHaveLength(2);
    expect(screen.getAllByText(/Sobe depois que você entrar de novo/)).toHaveLength(2);
  });

  it("nenhuma coleta ganha 'Descartar' nem 'Tentar de novo'", async () => {
    await abrirComPausa("sessao_encerrada");

    expect(screen.queryByText(/Descartar/)).toBeNull();
    expect(screen.queryByText(/Tentar de novo/)).toBeNull();
    // E o aviso de recusa de coleta ("precisa de atenção") não aparece: o item não foi recusado.
    expect(screen.queryByText(/precisa de atenção|precisam de atenção/i)).toBeNull();
  });
});

describe("conta desativada", () => {
  it("manda procurar a coordenação, com a frase aprovada para o aparelho", async () => {
    await abrirComPausa("conta_desativada");

    expect(screen.getByText("Sua conta foi desativada e o envio está parado")).toBeTruthy();
    const detalhe = screen.getByText(/procure a coordenação do seu município/);
    expect(detalhe.props.children.toString().toLowerCase()).toContain(
      "suas coletas continuam guardadas neste aparelho, procure a coordenação",
    );
  });

  it("NÃO traz 'Entrar de novo': entrar de novo não resolve conta desativada", async () => {
    await abrirComPausa("conta_desativada");

    expect(screen.queryByText("Entrar de novo")).toBeNull();
    expect(screen.getByText(/Entrar de novo não resolve enquanto a conta estiver desativada/)).toBeTruthy();
  });

  it("o cartão diz que a coleta só sobe depois da reativação, e nada pode ser descartado", async () => {
    await abrirComPausa("conta_desativada");

    expect(screen.getAllByText(/Só sobe depois que a coordenação reativar a sua conta/)).toHaveLength(2);
    expect(screen.queryByText(/Descartar/)).toBeNull();
  });
});

describe("senha provisória (correção 1)", () => {
  it("diz o fato, manda definir a senha no painel e promete que a coleta continua guardada", async () => {
    await abrirComPausa("troca_de_senha_obrigatoria");

    expect(screen.getByText("Você entrou com uma senha provisória e o envio está parado")).toBeTruthy();
    expect(screen.getByText(/Suas coletas continuam guardadas neste aparelho e nada foi apagado/)).toBeTruthy();
    expect(screen.getByText(/Defina a sua senha no painel/)).toBeTruthy();
  });

  it("NÃO traz 'Entrar de novo': entrar com a provisória volta ao mesmo lugar", async () => {
    await abrirComPausa("troca_de_senha_obrigatoria");

    expect(screen.queryByText("Entrar de novo")).toBeNull();
  });

  it("o cartão guarda a coleta, e NENHUM botão de apagar aparece (o defeito era 'Descartar')", async () => {
    await abrirComPausa("troca_de_senha_obrigatoria");

    expect(screen.getAllByText("Guardada")).toHaveLength(2);
    expect(screen.getAllByText(/Só sobe depois que você definir a sua senha/)).toHaveLength(2);
    expect(screen.queryByText(/Descartar/)).toBeNull();
    expect(screen.queryByText(/Tentar de novo/)).toBeNull();
    expect(screen.queryByText(/precisa de atenção|precisam de atenção/i)).toBeNull();
    expect(mockFila.descartar).not.toHaveBeenCalled();
  });
});

describe("sem pausa", () => {
  it("a tela é a de sempre: nada de aviso de pausa, e o cartão continua prometendo o envio", async () => {
    await abrirComPausa(null);

    expect(screen.queryByText(/o envio está parado/)).toBeNull();
    expect(screen.queryByText("Entrar de novo")).toBeNull();
    expect(screen.getAllByText("Aguardando")).toHaveLength(2);
  });

  it("a pausa some quando o motor avisa que ela acabou", async () => {
    await abrirComPausa("sessao_encerrada");
    expect(screen.getByText("Sua sessão terminou e o envio está parado")).toBeTruthy();

    await act(async () => { avisarQueMudou?.({ pausadaPor: null }); });

    expect(screen.queryByText("Sua sessão terminou e o envio está parado")).toBeNull();
  });
});
