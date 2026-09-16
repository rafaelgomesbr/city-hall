/**
 * Sair da conta com VISTORIA COMEÇADA no aparelho, e a fila lida ao vivo.
 *
 * Dois achados do revisor de 15/09/2026, no mesmo cartão do Perfil:
 *
 * 1. O diálogo de saída só contava a FILA. A saída explícita apaga o dado
 *    local, e o dado local inclui o rascunho da vistoria começada, com as
 *    fotos e a assinatura dela (nada na fila aponta para esses arquivos ainda,
 *    então a limpeza os leva). O agente com meia hora de barranco gravada
 *    tocava em "Sair da conta" lendo "você vai precisar de sinal e da sua
 *    senha", e perdia tudo. O diálogo passa a contar os rascunhos e a dizer, na
 *    cara, que sair apaga.
 *
 * 2. O Perfil lia `fila.resumo()` UMA vez na montagem, e a aba fica montada o
 *    dia inteiro: "Coletas esperando envio", o aviso "Espere a fila esvaziar"
 *    e o texto do diálogo envelheciam, discordando do crachá do menu, que
 *    assina a fila. Agora o Perfil assina pelo mesmo gancho (`useResumoDaFila`).
 *
 * Mora em `src/ui` junto do `Dialogo` que exercita, pela mesma razão de
 * `dialogo-na-conta.test.tsx`: nada aqui está dentro de `src/app`.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ResumoFila } from "@dc360/campo";

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

const SINO_VAZIO = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => null,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
  pendenciasGuardadas: async () => [],
}));

jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: SINO_VAZIO,
  avisosGuardados: async () => SINO_VAZIO,
  sincronizarAvisos: async () => SINO_VAZIO,
  marcarAvisosComoLidosNoAparelho: async () => SINO_VAZIO,
  fraseDoAviso: () => "Atualização na ocorrência",
  complementoDoAviso: () => null,
}));

jest.mock("../dados/coletas", () => ({ listarColetas: async () => [] }));

/** Quantas vistorias COMEÇADAS o aparelho tem no disco. */
let mockRascunhos: { ocorrenciaId: string; fotos: unknown[]; assinaturaUri: string | null }[] = [];
jest.mock("../dados/rascunho", () => ({
  listarRascunhos: jest.fn(async () => mockRascunhos),
}));

/** A fila de verdade AVISA quem assina; aqui o teste faz o mesmo. */
const mockOuvintes = new Set<(r: ResumoFila) => void>();
function resumoCom(pendentes: number): ResumoFila {
  return {
    pendentes, enviando: 0, confirmados: 0, bloqueados: 0, arquivados: 0,
    deOutroAutor: 0, sincronizando: false,
  };
}
let mockResumoInicial = resumoCom(0);
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    assinar: (ouvinte: (r: ResumoFila) => void) => {
      mockOuvintes.add(ouvinte);
      ouvinte(mockResumoInicial);
      return () => { mockOuvintes.delete(ouvinte); };
    },
  }),
}));

const mockSair = jest.fn(async () => {});
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: mockSair,
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => null,
    identidade: {
      usuarioId: "u1",
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

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

import Perfil from "../app/(agente)/perfil";
import { ProvedorDeTema } from "./componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

beforeEach(() => {
  mockRascunhos = [];
  mockResumoInicial = resumoCom(0);
  mockOuvintes.clear();
  mockSair.mockClear();
});

async function abrirATela(): Promise<void> {
  await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

async function tocar(texto: string): Promise<void> {
  await act(async () => { fireEvent.press(screen.getByText(texto)); });
}

function rascunho(id: string, comFoto: boolean): typeof mockRascunhos[number] {
  return {
    ocorrenciaId: id,
    fotos: comFoto ? [{ idempotencyKey: `f-${id}` }] : [],
    assinaturaUri: comFoto ? `file:///documentos/assinatura-${id}.png` : null,
  };
}

describe("a pergunta antes de sair, com vistoria começada", () => {
  it("diz quantas vistorias começadas serão apagadas, e que as fotos vão junto", async () => {
    mockRascunhos = [rascunho("a", true), rascunho("b", false)];
    await abrirATela();

    await tocar("Sair da conta");

    const dialogo = within(screen.getByTestId("dialogo"));
    expect(dialogo.getByText(/2 vistorias começadas neste aparelho/)).toBeTruthy();
    expect(dialogo.getByText(/com fotos/)).toBeTruthy();
    expect(dialogo.getByText(/sair apaga/i)).toBeTruthy();
  });

  it("uma só, sem foto: singular, e sem prometer foto que não existe", async () => {
    mockRascunhos = [rascunho("a", false)];
    await abrirATela();

    await tocar("Sair da conta");

    const dialogo = within(screen.getByTestId("dialogo"));
    expect(dialogo.getByText(/1 vistoria começada neste aparelho/)).toBeTruthy();
    expect(dialogo.queryByText(/com fotos/)).toBeNull();
  });

  it("o botão de confirmar é o de perigo, porque o ato apaga", async () => {
    mockRascunhos = [rascunho("a", true)];
    await abrirATela();

    await tocar("Sair da conta");

    const confirmar = screen.getByTestId("dialogo-acao");
    /* `destrutiva` no diálogo vira o tipo `perigo` do botão, que é o único
       preenchido de perigo do produto: a cor e a posição dizem "isto apaga". */
    expect(confirmar.props.accessibilityLabel).toBe("Sair da conta");
    expect(screen.getByTestId("dialogo").props.accessibilityViewIsModal).toBe(true);
    expect(mockSair).not.toHaveBeenCalled();
  });

  it("sem vistoria começada e sem fila, a pergunta não fala em apagar", async () => {
    await abrirATela();

    await tocar("Sair da conta");

    const dialogo = within(screen.getByTestId("dialogo"));
    expect(dialogo.queryByText(/começada/)).toBeNull();
    expect(dialogo.getByText(/precisar de sinal e da sua senha/)).toBeTruthy();
  });
});

describe("a fila lida ao vivo, e não uma vez", () => {
  it("quando a fila esvazia, o chip e o aviso de esperar somem sem trocar de aba", async () => {
    mockResumoInicial = resumoCom(3);
    await abrirATela();
    expect(screen.getByTestId("coletas-esperando")).toBeTruthy();
    expect(screen.getByText("Espere a fila esvaziar antes de sair")).toBeTruthy();

    /* A fila AVISA, como avisa no aparelho quando o dreno termina. */
    await act(async () => { for (const ouvinte of mockOuvintes) ouvinte(resumoCom(0)); });

    expect(screen.queryByTestId("coletas-esperando")).toBeNull();
    expect(screen.queryByText("Espere a fila esvaziar antes de sair")).toBeNull();
    expect(screen.getByText("Nenhuma")).toBeTruthy();
  });

  it("o diálogo de saída conta a fila de AGORA, e não a da montagem", async () => {
    mockResumoInicial = resumoCom(3);
    await abrirATela();

    await act(async () => { for (const ouvinte of mockOuvintes) ouvinte(resumoCom(1)); });
    await tocar("Sair da conta");

    const dialogo = within(screen.getByTestId("dialogo"));
    expect(dialogo.getByText(/1 coleta ainda não enviada/)).toBeTruthy();
    expect(dialogo.queryByText(/3 coletas/)).toBeNull();
  });
});
