/**
 * A TELA DE AVISOS, que o sino do cabeçalho abre.
 *
 * A lista morava dentro do Perfil, atrás de um rolamento de oito cartões, e o
 * dono pediu o sino no topo de toda tela. A lista veio para cá com o MESMO
 * comportamento que já tinha lá, mais o acabamento que uma tela própria
 * permite. O que estes casos travam, e por que cada um importa para quem está
 * na rua:
 *
 * 1. **Abre do disco, e sincroniza na abertura.** Sem sinal, mostra o que já
 *    estava no aparelho em vez de um vazio que parece defeito. Com sinal,
 *    pergunta ao servidor, e uma falha nisso não apaga nada.
 * 2. **Marcar como lido acontece no aparelho primeiro.** O agente lê no morro;
 *    o envio é consequência, e consequência não pode ser condição.
 * 3. **Marcar alcança SÓ o que a tela desenhou.** O aparelho guarda até trinta;
 *    a tela desenha oito. Marcar os trinta apagaria do sino, aqui e no servidor,
 *    aviso que ninguém leu, e o `POST /avisos/lidos` não se desfaz.
 * 4. **O aviso leva à vistoria QUANDO a tarefa está neste aparelho**, e só
 *    então. O sino fala do município inteiro; a lista de tarefas é da equipe e
 *    vem do disco. Um toque que abre o nada, sem sinal, é pior que um toque que
 *    não existe: por isso a linha só vira botão quando há para onde ir.
 * 5. **A lista entra em cascata**, no ritmo de `cascata`, que é o mesmo das
 *    outras listas do produto.
 *
 * O banco é SQLite DE VERDADE, em memória, e o módulo do sino é o de verdade:
 * o que se dubla é o servidor (`baixarAvisos` e `marcarAvisosLidos`) e o que
 * a tela de tarefas tem guardado. Mora em `__tests__` porque tudo dentro de
 * `src/app` vira ROTA no Expo.
 */

import { DatabaseSync } from "node:sqlite";
import { Animated } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { CursorDeAvisos, Pendencia, RespostaDeAvisos } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

let mockBanco: DatabaseSync | null = null;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...(params as never[]));
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...(params as never[]));
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...(params as never[])) ?? null;
      },
      async withTransactionAsync(corpo: () => Promise<void>) {
        db.exec("BEGIN");
        try { await corpo(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class {},
}));

/* ============================================================
   O servidor falso: uma janela só, sem corte
   ============================================================ */

type LinhaFalsa = {
  id: string; tipo: string; ocorrenciaId: string; protocolo: string;
  criadoEm: string; detalhe: string | null; lido: boolean;
};

let mockAcervo: LinhaFalsa[] = [];
/** Ligado, a rede estoura, que é o aparelho sem sinal. */
let mockRedeFalha = false;
let mockBaixou = 0;
let mockLeiturasRecebidas: string[][] = [];

jest.mock("../dados/api", () => ({
  baixarAvisos: async (_token: string, _cursor: CursorDeAvisos): Promise<RespostaDeAvisos> => {
    mockBaixou += 1;
    if (mockRedeFalha) throw new Error("sem sinal");
    return {
      ate: "2026-09-15T12:00:00.000Z",
      ateId: null,
      itens: mockAcervo,
      teto: 200,
      truncada: false,
      naoLidos: mockAcervo.filter((a) => !a.lido).length,
      naoLidosTruncado: false,
    };
  },
  marcarAvisosLidos: async (_token: string, ids: readonly string[]) => {
    if (mockRedeFalha) throw new Error("sem sinal");
    mockLeiturasRecebidas.push([...ids]);
    return { marcados: ids.length };
  },
}));

const mockEmpurrar = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockEmpurrar(...args),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-teste",
    lerIdentidade: () => null,
    identidade: { usuarioId: "u1", nome: "Agente de teste" },
  }),
}));

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: "celular" }),
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

/** As tarefas que ESTE aparelho tem no disco. É o que decide se o aviso leva a algum lugar. */
let mockTarefas: Pendencia[] = [];
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
}));

import Avisos from "../app/(agente)/avisos";
import { ProvedorDeTema } from "../ui/componentes";
import { AVISOS_VAZIOS, avisosGuardados, guardarAvisos, type AvisosGuardados } from "../dados/avisos";
import { bancoLocal } from "../dados/banco-local";
import { cascata } from "../ui/tokens";

function aviso(por: Partial<LinhaFalsa> = {}): LinhaFalsa {
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

function doze(): LinhaFalsa[] {
  return Array.from({ length: 12 }, (_, i) => aviso({
    id: `av${i + 1}`,
    protocolo: `00012${i}/2026`,
    criadoEm: new Date(Date.now() - i * 60_000).toISOString(),
  }));
}

/** Grava no aparelho como se uma sincronização anterior tivesse trazido isto. */
async function noDisco(itens: LinhaFalsa[], por: Partial<AvisosGuardados> = {}): Promise<void> {
  await guardarAvisos({
    ...AVISOS_VAZIOS,
    itens,
    naoLidos: itens.filter((a) => !a.lido).length,
    baixadoEm: new Date().toISOString(),
    ...por,
  });
}

function tarefa(id: string): Pendencia {
  return {
    id, protocolo: "000123/2026", tipo: "deslizamento", severidade: "alta",
    endereco: "Rua das Flores, 10", ponto_referencia: null, latitude: null, longitude: null,
    descricao: "", solicitante_nome: "Maria", solicitante_contato: null,
    vulnerabilidade_presente: false, vulnerabilidade_descricao: null,
    prazo_em: null, criado_em: new Date().toISOString(),
  };
}

beforeEach(async () => {
  mockAcervo = [];
  mockRedeFalha = false;
  mockBaixou = 0;
  mockLeiturasRecebidas = [];
  mockTemSinal = true;
  mockTarefas = [];
  mockEmpurrar.mockClear();
  const db = await bancoLocal();
  await db.execAsync("DELETE FROM marcas;");
});

afterEach(() => { jest.restoreAllMocks(); });

async function abrirATela(): Promise<void> {
  await act(async () => { await render(<ProvedorDeTema><Avisos /></ProvedorDeTema>); });
  await act(async () => {});
}

describe("a tela abre do disco", () => {
  it("mostra o que já estava no aparelho mesmo com a rede fora", async () => {
    await noDisco([aviso(), aviso({ id: "av2", tipo: "prazo_vencido", protocolo: "000124/2026" })]);
    mockRedeFalha = true;
    mockTemSinal = false;

    await abrirATela();

    expect(screen.getByText("Vistoria recebida do campo")).toBeTruthy();
    expect(screen.getByText("Prazo de atendimento vencido")).toBeTruthy();
    expect(screen.getByLabelText("2, por ler")).toBeTruthy();
  });

  it("sem nunca ter baixado, explica o que é o sino em vez de mostrar um vazio mudo", async () => {
    mockRedeFalha = true;
    mockTemSinal = false;
    await abrirATela();

    expect(screen.getByText(/depois da primeira atualização com sinal/)).toBeTruthy();
    /* Nada por ler não pode ter botão de marcar: ele não teria o que marcar. */
    expect(screen.queryByTestId("marcar-avisos-lidos")).toBeNull();
  });

  it("já baixado e sem nada, diz que não há novidade em vez de parecer quebrado", async () => {
    await noDisco([]);
    await abrirATela();

    expect(screen.getByText(/Nenhum aviso/)).toBeTruthy();
  });

  it("sincroniza na abertura, e o que chegou aparece", async () => {
    mockAcervo = [aviso({ tipo: "providencia_respondida" })];
    await abrirATela();

    expect(mockBaixou).toBe(1);
    expect(screen.getByText("Órgão respondeu a providência")).toBeTruthy();
    expect(screen.getByLabelText("1, por ler")).toBeTruthy();
  });

  it("a contagem truncada vira piso, e não um total que ninguém contou", async () => {
    await noDisco([aviso()], { naoLidos: 500, naoLidosTruncado: true });
    mockRedeFalha = true;
    await abrirATela();

    expect(screen.getByLabelText("500+, por ler")).toBeTruthy();
  });
});

describe("marcar como lido", () => {
  it("vale na tela na hora, e fica no aparelho sem esperar o servidor", async () => {
    await noDisco([aviso(), aviso({ id: "av2", protocolo: "000124/2026" })]);
    mockRedeFalha = true;
    await abrirATela();

    await act(async () => { fireEvent.press(screen.getByTestId("marcar-avisos-lidos")); });

    expect(screen.getByLabelText("0, por ler")).toBeTruthy();
    expect(screen.queryByTestId("marcar-avisos-lidos")).toBeNull();
    /* O aparelho é quem sabe da leitura até o servidor confirmar. */
    const guardado = await avisosGuardados();
    expect(guardado.lidosPendentes.sort()).toEqual(["av1", "av2"]);
    expect(mockLeiturasRecebidas).toEqual([]);
  });

  it("o estado de leitura é falado, e não só desenhado no peso da letra", async () => {
    await noDisco([aviso(), aviso({ id: "av2", protocolo: "000124/2026", lido: true })]);
    mockRedeFalha = true;
    await abrirATela();

    expect(screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000123/2026, por ler",
    )).toBeTruthy();
    expect(screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000124/2026, lido",
    )).toBeTruthy();
  });
});

describe("marcar como lidos só alcança o que passou pelos olhos", () => {
  it("não marca o aviso que a tela nem chegou a desenhar", async () => {
    await noDisco(doze());
    mockRedeFalha = true;
    await abrirATela();

    /* O nono aviso não está na tela: é este o fato de que o resto depende. */
    expect(screen.queryByText("000128/2026")).toBeNull();
    expect(screen.getByLabelText("Marcar como lidos os 8 avisos que estão nesta tela")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId("marcar-avisos-lidos")); });

    const guardado = await avisosGuardados();
    expect(guardado.lidosPendentes.sort()).toEqual(
      ["av1", "av2", "av3", "av4", "av5", "av6", "av7", "av8"],
    );
  });

  it("o que ficou abaixo do corte continua alcançável pelo dedo", async () => {
    await noDisco(doze());
    mockRedeFalha = true;
    await abrirATela();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Mostrar os 4 avisos que ficaram fora da lista"));
    });

    expect(screen.getByText("000128/2026")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("marcar-avisos-lidos")); });
    expect((await avisosGuardados()).lidosPendentes).toHaveLength(12);
  });
});

describe("o aviso e a vistoria", () => {
  it("leva à vistoria quando a tarefa está neste aparelho, e marca o aviso como lido", async () => {
    mockTarefas = [tarefa("oc1")];
    await noDisco([aviso({ ocorrenciaId: "oc1" })]);
    mockRedeFalha = true;
    await abrirATela();

    const linha = screen.getByLabelText(/Abrir a vistoria do protocolo 000123\/2026/);
    expect(linha.props.accessibilityRole).toBe("button");
    await act(async () => { fireEvent.press(linha); });

    expect(mockEmpurrar).toHaveBeenCalledWith({
      pathname: "/(agente)/vistoria/[id]", params: { id: "oc1" },
    });
    /* Abrir é ler: o aviso não pode continuar contando como por ler. */
    expect((await avisosGuardados()).lidosPendentes).toEqual(["av1"]);
  });

  it("não é tocável quando a tarefa não está no aparelho, porque não há para onde levar", async () => {
    mockTarefas = [tarefa("outra")];
    await noDisco([aviso({ ocorrenciaId: "oc1" })]);
    mockRedeFalha = true;
    await abrirATela();

    const linha = screen.getByLabelText(
      "Vistoria recebida do campo, protocolo 000123/2026, por ler",
    );
    expect(linha.props.accessibilityRole).toBeUndefined();
    expect(screen.queryByText("Abrir a vistoria")).toBeNull();
    expect(screen.queryByLabelText(/Abrir a vistoria/)).toBeNull();
  });

  it("de tipo que este aplicativo ainda não aprendeu continua legível", async () => {
    await noDisco([aviso({ tipo: "coisa_que_ainda_nao_existe" })]);
    mockRedeFalha = true;
    await abrirATela();

    expect(screen.getByText("Atualização na ocorrência")).toBeTruthy();
    expect(screen.getByText("000123/2026")).toBeTruthy();
  });
});

describe("a entrada", () => {
  it("é em cascata, no ritmo do produto e na thread de interface", async () => {
    type Cronometrada = { delay?: number; useNativeDriver?: boolean };
    const pedidas: Cronometrada[] = [];
    const timingDeVerdade = Animated.timing;
    jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
      pedidas.push(config);
      return timingDeVerdade(valor, config as never);
    }) as never);

    await noDisco([
      aviso({ id: "av1", criadoEm: new Date(Date.now() - 1_000).toISOString() }),
      aviso({ id: "av2", criadoEm: new Date(Date.now() - 2_000).toISOString() }),
      aviso({ id: "av3", criadoEm: new Date(Date.now() - 3_000).toISOString() }),
    ]);
    mockRedeFalha = true;
    await abrirATela();

    const entradas = pedidas.filter((p) => p.delay !== undefined);
    expect(entradas.map((p) => p.delay)).toEqual([0, cascata.passo, 2 * cascata.passo]);
    for (const entrada of entradas) expect(entrada.useNativeDriver).toBe(true);
  });
});
