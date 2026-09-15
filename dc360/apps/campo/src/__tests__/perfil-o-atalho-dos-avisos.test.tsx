import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * O SINO SAIU DO PERFIL, e o que fica é o caminho até ele.
 *
 * Até 15/09/2026 a lista de avisos morava dentro desta tela, com oito linhas,
 * "marcar como lidos" e o corte de rolagem, e `perfil-o-sino.test.tsx` provava
 * tudo isso aqui. Os avisos ganharam tela própria (`avisos.tsx`) e ícone na
 * barra (`ui/Sino.tsx`), e é lá que aquela suíte continua, com outro nome.
 *
 * O que fica de dever do perfil é um só, e é o que este arquivo trava: quem
 * procurar os avisos onde eles sempre estiveram encontra um atalho com nome,
 * e o atalho leva à rota nova. E a lista NÃO é mais desenhada aqui: duas
 * telas desenhando o mesmo aviso é como uma delas envelhece em silêncio.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0", extra: { apiUrl: "https://api.exemplo" } } },
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
  }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: jest.fn(async () => undefined),
    obterToken: async () => "token-de-teste",
    lerIdentidade: () => null,
    identidade: {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: "org-1",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => null,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
  pendenciasGuardadas: async () => [],
}));

jest.mock("../dados/foto-do-agente", () => ({
  fotoLocalDoAgente: () => null,
  baixarFotoDoAgente: async () => { throw new Error("sem rede nesta suite"); },
  escolherFoto: async () => ({ situacao: "cancelada" }),
  enviarFoto: async () => { throw new Error("sem rede nesta suite"); },
  removerFotoDoAgente: async () => undefined,
}));

/*
  O depósito do sino, com um aviso por ler dentro. Se o perfil ainda o
  desenhasse, a frase do aviso apareceria na tela; o caso abaixo cobra que
  ela NÃO aparece.
*/
jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: {
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  },
  avisosGuardados: async () => ({
    itens: [{
      id: "av1", tipo: "vistoria_recebida", ocorrenciaId: "oc1", protocolo: "000123/2026",
      criadoEm: new Date().toISOString(), detalhe: null, lido: false,
    }],
    cursor: null, naoLidos: 1, naoLidosTruncado: false, lidosPendentes: [], baixadoEm: null,
  }),
  sincronizarAvisos: async () => { throw new Error("sem sinal"); },
  marcarAvisosComoLidosNoAparelho: async () => undefined,
  fraseDoAviso: () => "Vistoria recebida do campo",
  complementoDoAviso: () => null,
}));

import Perfil from "../app/(agente)/perfil";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

beforeEach(() => { mockPush.mockClear(); });

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

describe("o perfil e os avisos", () => {
  it("não desenha mais a lista de avisos, nem o botão de marcar como lidos", async () => {
    await abrirATela();
    expect(screen.queryByText("Vistoria recebida do campo")).toBeNull();
    expect(screen.queryByTestId("marcar-avisos-lidos")).toBeNull();
    expect(screen.queryByTestId("avisos-por-ler")).toBeNull();
  });

  it("tem o atalho, com nome falado, e ele leva à tela de avisos", async () => {
    await abrirATela();

    const atalho = screen.getByTestId("ver-avisos");
    expect(atalho.props.accessibilityLabel).toBe("Abrir a lista de avisos do município");
    expect(atalho.props.accessibilityRole).toBe("button");

    await fireEvent.press(atalho);
    expect(mockPush).toHaveBeenCalledWith("/(agente)/avisos");
  });
});
