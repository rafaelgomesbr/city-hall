import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * O SINO DENTRO DO PERFIL, e ele abre do disco.
 *
 * `GET /avisos` foi escrita **sem `exigirPermissao`, expressamente para não
 * deixar "operador e agente de campo sem sino nenhum"**, e o aplicativo nunca a
 * chamou. É o único canal que funciona quando o push não alcança, e o push hoje
 * manda dois tipos de aviso (`tarefa_nova` e `prazo_vencendo`) contra os quatro
 * que o sino carrega.
 *
 * O que estes casos travam, e por que cada um importa para quem está na rua:
 *
 * 1. **A tela abre do disco, e o sino junto.** Sem sinal, o sino mostra o que
 *    já estava no aparelho em vez de um vazio que parece defeito. Um sino que só
 *    existisse com sinal seria um sino que só existe na base, ou seja,
 *    exatamente onde ninguém precisa dele.
 * 2. **Marcar como lido acontece no aparelho primeiro.** O agente lê no morro; o
 *    envio é consequência, e consequência não pode ser condição.
 * 3. **A linha do aviso não é tocável.** No painel ela leva à ocorrência; aqui
 *    levaria a uma ocorrência que o aparelho pode simplesmente não ter, porque
 *    a lista de tarefas é da EQUIPE e vem do disco, e o sino fala do município
 *    inteiro. Um toque que abre o nada, sem sinal, é pior que um toque que não
 *    existe.
 * 4. **Tipo desconhecido continua legível.** Um tipo novo criado no servidor
 *    antes de o aplicativo aprender a palavra faria o sino CONTAR avisos que a
 *    lista desenha como linhas em branco.
 *
 * Todos os casos abaixo REPROVAM antes da ligação: nada no aplicativo chamava a
 * rota, e nenhuma tela desenhava aviso nenhum.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
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
    obterToken: async () => mockToken,
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

/** Nulo: sessão sem token utilizável, que é o aparelho que não vai à rede. */
let mockToken: string | null = "token-de-teste";

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: "celular" }),
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => null,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
}));

/*
  O depósito do sino, dublado no ponto em que ele encontra o disco.

  Ele guarda estado de VERDADE entre as chamadas, e não devolve constante: é o
  que permite provar que marcar como lido muda o que a tela desenha sem nenhuma
  ida à rede. O caminho até o SQLite, o cursor e a lista de leitura pendente são
  provados em `dados/avisos.test.ts`, contra um servidor falso.
*/
type EstadoFalso = {
  itens: {
    id: string; tipo: string; ocorrenciaId: string; protocolo: string;
    criadoEm: string; detalhe: string | null; lido: boolean;
  }[];
  cursor: null;
  naoLidos: number;
  naoLidosTruncado: boolean;
  lidosPendentes: string[];
  baixadoEm: string | null;
};

const mockVazio: EstadoFalso = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

let mockNoDisco: EstadoFalso = mockVazio;
let mockSincronizou = 0;
/** Ligado, a sincronização estoura, que é o aparelho sem sinal. */
let mockRedeFalha = false;

jest.mock("../dados/avisos", () => ({
  /*
    Literal, e não `mockVazio`: a fábrica de `jest.mock` roda quando o módulo é
    requerido, e isso acontece na linha de `import`, que o babel iça para cima
    da declaração da constante. Apontar para ela daqui entrega `undefined`.
  */
  AVISOS_VAZIOS: {
    itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
    lidosPendentes: [], baixadoEm: null,
  },
  avisosGuardados: async () => mockNoDisco,
  sincronizarAvisos: async () => {
    mockSincronizou += 1;
    if (mockRedeFalha) throw new Error("sem sinal");
    return mockNoDisco;
  },
  marcarAvisosComoLidosNoAparelho: async (ids: readonly string[]) => {
    mockNoDisco = {
      ...mockNoDisco,
      itens: mockNoDisco.itens.map((a) => (ids.includes(a.id) ? { ...a, lido: true } : a)),
      naoLidos: Math.max(0, mockNoDisco.naoLidos - ids.length),
      lidosPendentes: [...mockNoDisco.lidosPendentes, ...ids],
    };
    return mockNoDisco;
  },
  fraseDoAviso: (tipo: string) => ({
    vistoria_recebida: "Vistoria recebida do campo",
    prazo_vencido: "Prazo de atendimento vencido",
  }[tipo] ?? "Atualização na ocorrência"),
  complementoDoAviso: (a: { tipo: string; detalhe: string | null }) => a.detalhe,
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

function aviso(por: Partial<EstadoFalso["itens"][number]> = {}) {
  return {
    id: "av1",
    tipo: "vistoria_recebida",
    ocorrenciaId: "oc1",
    protocolo: "000123/2026",
    criadoEm: new Date().toISOString(),
    detalhe: null,
    lido: false,
    ...por,
  };
}

beforeEach(() => {
  mockNoDisco = mockVazio;
  mockSincronizou = 0;
  mockRedeFalha = false;
  mockTemSinal = true;
  mockToken = "token-de-teste";
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

describe("o sino abre do disco", () => {
  it("mostra o que já estava no aparelho mesmo com a rede fora", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso(), aviso({ id: "av2", tipo: "prazo_vencido", protocolo: "000124/2026" })],
      naoLidos: 2,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    mockTemSinal = false;

    await abrirATela();

    expect(screen.getByText("Vistoria recebida do campo")).toBeTruthy();
    expect(screen.getByText("Prazo de atendimento vencido")).toBeTruthy();
    expect(screen.getByLabelText("Avisos, 2 por ler")).toBeTruthy();
  });

  it("sem nunca ter baixado, explica o que é o sino em vez de mostrar um vazio mudo", async () => {
    mockRedeFalha = true;
    await abrirATela();

    expect(screen.getByText(/depois da primeira atualização com sinal/)).toBeTruthy();
    expect(screen.getByLabelText("Avisos, nenhum por ler")).toBeTruthy();
    /* Nada por ler não pode ter botão de marcar: ele não teria o que marcar. */
    expect(screen.queryByTestId("marcar-avisos-lidos")).toBeNull();
  });

  it("a contagem truncada vira piso, e não um total que ninguém contou", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso()],
      naoLidos: 500,
      naoLidosTruncado: true,
      baixadoEm: new Date().toISOString(),
    };
    await abrirATela();

    expect(screen.getByText("500+ por ler")).toBeTruthy();
    expect(screen.getByLabelText("Avisos, mais de 500 por ler")).toBeTruthy();
  });
});

describe("marcar como lido", () => {
  it("vale na tela na hora, sem esperar o servidor", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso(), aviso({ id: "av2", protocolo: "000124/2026" })],
      naoLidos: 2,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    await abrirATela();

    await fireEvent.press(screen.getByTestId("marcar-avisos-lidos"));
    await act(async () => {});

    expect(screen.getByLabelText("Avisos, nenhum por ler")).toBeTruthy();
    /* E o botão some, porque não sobrou nada para marcar. */
    expect(screen.queryByTestId("marcar-avisos-lidos")).toBeNull();
  });

  it("o estado de leitura é falado, e não só desenhado no peso da letra", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso(), aviso({ id: "av2", protocolo: "000124/2026", lido: true })],
      naoLidos: 1,
      baixadoEm: new Date().toISOString(),
    };
    await abrirATela();

    expect(screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000123/2026, por ler",
    )).toBeTruthy();
    expect(screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000124/2026, lido",
    )).toBeTruthy();
  });
});

describe("a linha do aviso", () => {
  it("não é tocável, porque não há para onde levar sem sinal", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso()],
      naoLidos: 1,
      baixadoEm: new Date().toISOString(),
    };
    await abrirATela();

    const linha = screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000123/2026, por ler",
    );
    /*
      O sino fala do município inteiro; a lista de tarefas deste aparelho é da
      EQUIPE do agente e vem do disco. Um toque aqui abriria, na maioria das
      vezes, uma ocorrência que este telefone nunca baixou.
    */
    expect(linha.props.accessibilityRole).toBeUndefined();
    expect(linha.props.onClick).toBeUndefined();
  });

  it("de tipo que este aplicativo ainda não aprendeu continua legível", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso({ tipo: "coisa_que_ainda_nao_existe" })],
      naoLidos: 1,
      baixadoEm: new Date().toISOString(),
    };
    await abrirATela();

    /* Impreciso ainda é legível. Linha em branco não diz nada a ninguém, e o
       número do sino continuaria contando o que a lista não mostra. */
    expect(screen.getByText("Atualização na ocorrência")).toBeTruthy();
    expect(screen.getByText("000123/2026")).toBeTruthy();
  });
});

describe("o sino vai junto com o resto, e não numa atualização própria", () => {
  it("uma falha no sino não apaga a tela nem derruba a atualização", async () => {
    /*
      Duas buscas separadas seriam duas chances de falhar e duas idas ao 3G do
      morro para montar uma tela só. O que este caso trava é o isolamento: o
      sino é o recurso menos crítico do produto, e uma falha nele não pode
      derrubar nada.
    */
    mockNoDisco = {
      ...mockVazio,
      itens: [aviso()],
      naoLidos: 1,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    await abrirATela();

    expect(mockSincronizou).toBeGreaterThan(0);
    expect(screen.getByText("Vistoria recebida do campo")).toBeTruthy();
    expect(screen.getByText("Agente de teste")).toBeTruthy();
  });
});
