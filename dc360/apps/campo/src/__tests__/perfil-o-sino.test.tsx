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
/** Os identificadores que a tela mandou marcar, na ordem dos toques. */
let mockMarcados: string[][] = [];
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
    mockMarcados.push([...ids]);
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
  mockMarcados = [];
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

describe("marcar como lidos só alcança o que passou pelos olhos", () => {
  it("não marca o aviso que a tela nem chegou a desenhar", async () => {
    /*
      O aparelho guarda até trinta avisos; a tela desenha oito. O agente desce o
      morro, abre o Perfil, lê os oito que cabem e toca em "Marcar como lidos".
      Os outros quatro nunca apareceram na tela dele.
    */
    mockNoDisco = {
      ...mockVazio,
      itens: Array.from({ length: 12 }, (_, i) => aviso({
        id: `av${i + 1}`,
        protocolo: `00012${i}/2026`,
        criadoEm: new Date(Date.now() - i * 60_000).toISOString(),
      })),
      naoLidos: 12,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    await abrirATela();

    /* O nono aviso não está na tela: é este o fato de que o resto depende. */
    expect(screen.queryByText("000128/2026")).toBeNull();

    await fireEvent.press(screen.getByTestId("marcar-avisos-lidos"));
    await act(async () => {});

    /* Só os oito desenhados. Marcar os quatro de baixo apagaria do sino, aqui e
       no servidor, aviso que ninguém leu, e ele não volta em pergunta nenhuma. */
    expect(mockMarcados).toHaveLength(1);
    expect(mockMarcados[0]).toEqual(
      ["av1", "av2", "av3", "av4", "av5", "av6", "av7", "av8"],
    );
  });

  it("o rótulo falado promete o que o botão de fato faz", async () => {
    mockNoDisco = {
      ...mockVazio,
      itens: Array.from({ length: 12 }, (_, i) => aviso({
        id: `av${i + 1}`,
        protocolo: `00012${i}/2026`,
        criadoEm: new Date(Date.now() - i * 60_000).toISOString(),
      })),
      naoLidos: 12,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    await abrirATela();

    /* "os 12 avisos que estão nesta tela" seria o botão contando uma coisa e
       fazendo outra, para quem ouve a tela e não vê que só há oito. */
    expect(screen.getByLabelText(
      "Marcar como lidos os 8 avisos que estão nesta tela",
    )).toBeTruthy();
  });

  it("o que ficou abaixo do corte continua alcançável pelo dedo", async () => {
    /*
      A lista mostra sempre os mais NOVOS. Sem saída, um aviso por ler que caiu
      abaixo do oitavo nunca mais sobe sozinho: o crachá contaria por ler algo
      que não há como ler, que é o item preso para sempre da fila, no sino.
    */
    mockNoDisco = {
      ...mockVazio,
      itens: Array.from({ length: 12 }, (_, i) => aviso({
        id: `av${i + 1}`,
        protocolo: `00012${i}/2026`,
        criadoEm: new Date(Date.now() - i * 60_000).toISOString(),
      })),
      naoLidos: 12,
      baixadoEm: new Date().toISOString(),
    };
    mockRedeFalha = true;
    await abrirATela();

    expect(screen.queryByText("000128/2026")).toBeNull();

    await fireEvent.press(screen.getByLabelText(
      "Mostrar os 4 avisos que ficaram fora da lista",
    ));
    await act(async () => {});

    expect(screen.getByText("000128/2026")).toBeTruthy();
    /* E agora marcar alcança os doze, porque os doze estão desenhados. */
    await fireEvent.press(screen.getByTestId("marcar-avisos-lidos"));
    await act(async () => {});
    expect(mockMarcados[0]).toHaveLength(12);
  });
});
