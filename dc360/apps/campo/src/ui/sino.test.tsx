/**
 * O SINO DO CABEÇALHO, que é a porta dos avisos em toda tela.
 *
 * O pedido, na letra de quem paga: "falta o sininho de notificações, poderia
 * ter uma aparência mais caprichada". Decidido com ele: o sino no topo de toda
 * tela, à direita, com crachá; tocar abre a lista de avisos, que até então
 * vivia escondida dentro do Perfil.
 *
 * O que estes casos travam, e por que cada um importa para quem está na rua:
 *
 * 1. **Ele lê o DISCO e nunca pede rede.** O sino é o único elemento fixo do
 *    produto ao lado da faixa de sincronização, que nunca mente. Um sino que
 *    tentasse rede sozinho seria o segundo lugar do aplicativo a falhar no
 *    morro, e falharia ao lado do que nunca falha.
 * 2. **Alvo de 52 e frase falada.** É um tocável como qualquer outro daqui: dedo
 *    com luva, e um leitor de tela que precisa ouvir quantos avisos há sem ver
 *    crachá nenhum.
 * 3. **Balança quando a contagem SOBE, e só quando sobe.** Descer é o agente
 *    lendo, e comemorar isso seria ruído. A primeira leitura do disco também
 *    não é chegada: abrir uma aba pela primeira vez com três avisos guardados
 *    não é receber três avisos.
 * 4. **Respeita a redução de movimento.** Quem ligou a chave ligou porque
 *    animação dá enjoo, e o número no crachá já diz que chegou coisa nova.
 *
 * O banco é SQLite DE VERDADE, em memória, e quem dispara o balanço é o
 * gravador de verdade (`guardarAvisos`): é o caminho que a sincronização vai
 * percorrer no aparelho.
 */

import { DatabaseSync } from "node:sqlite";
import { Animated, Easing } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

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

/** Quantas vezes alguém tentou a rede. O sino não pode ser esse alguém. */
let mockIdasARede = 0;
jest.mock("../dados/api", () => ({
  baixarAvisos: async () => { mockIdasARede += 1; throw new Error("o sino não pede rede"); },
  marcarAvisosLidos: async () => { mockIdasARede += 1; throw new Error("o sino não pede rede"); },
}));

const mockEmpurrar = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockEmpurrar(...args) },
}));

let mockReduzir = false;
jest.mock("./useReducaoDeMovimento", () => ({
  useReducaoDeMovimento: () => mockReduzir,
}));

import { Sino } from "./Sino";
import { ProvedorDeTema } from "./componentes";
import { AVISOS_VAZIOS, guardarAvisos, type AvisosGuardados } from "../dados/avisos";
import { bancoLocal } from "../dados/banco-local";
import { easing, movimento, toque } from "./tokens";

type Cronometrada = {
  toValue?: number; duration?: number; useNativeDriver?: boolean; easing?: (t: number) => number;
};
let animacoes: Cronometrada[] = [];
const timingDeVerdade = Animated.timing;

function comPorLer(naoLidos: number, truncado = false): AvisosGuardados {
  return { ...AVISOS_VAZIOS, naoLidos, naoLidosTruncado: truncado, baixadoEm: "2026-09-15T12:00:00.000Z" };
}

/* O crachá é escondido do leitor de tela de propósito; a busca pede para ver. */
const escondido = { includeHiddenElements: true };

beforeEach(async () => {
  mockIdasARede = 0;
  mockReduzir = false;
  mockEmpurrar.mockClear();
  animacoes = [];
  jest.spyOn(Animated, "timing").mockImplementation(((valor: never, config: Cronometrada) => {
    animacoes.push(config);
    return timingDeVerdade(valor, config as never);
  }) as never);
  const db = await bancoLocal();
  await db.execAsync("DELETE FROM marcas;");
});

afterEach(() => { jest.restoreAllMocks(); });

async function montar(): Promise<void> {
  await act(async () => { await render(<ProvedorDeTema><Sino /></ProvedorDeTema>); });
}

/**
 * As pernas do balanço, na ordem em que foram pedidas.
 *
 * Tudo o que passou por `Animated.timing`: o `Tocavel` por baixo do sino só
 * anima ao toque, e nenhum caso deste bloco toca. Se um dia isso mudar, a
 * contagem aqui muda junto e o caso avisa.
 */
function balancos(): Cronometrada[] {
  return animacoes;
}

describe("o sino se apresenta", () => {
  it("é um botão com a frase do sino, e o alvo tem os 52 pontos do produto", async () => {
    await guardarAvisos(comPorLer(3));
    await montar();

    const sino = screen.getByLabelText("Avisos, 3 por ler");
    expect(sino.props.accessibilityRole).toBe("button");
    const estilo = [sino.props.style].flat(3).reduce(
      (junto: Record<string, unknown>, parte: Record<string, unknown> | undefined) => ({ ...junto, ...parte }),
      {},
    );
    expect(estilo["minHeight"]).toBeGreaterThanOrEqual(toque);
    expect(estilo["minWidth"]).toBeGreaterThanOrEqual(toque);
  });

  it("sem nada por ler, diz isso e não desenha crachá nenhum", async () => {
    await montar();

    expect(screen.getByLabelText("Avisos, nenhum por ler")).toBeTruthy();
    expect(screen.queryByTestId("cracha-do-sino", escondido)).toBeNull();
  });

  it("o crachá mostra o número, e o piso ganha o mais", async () => {
    await guardarAvisos(comPorLer(500, true));
    await montar();

    expect(screen.getByText("500+", escondido)).toBeTruthy();
    expect(screen.getByLabelText("Avisos, mais de 500 por ler")).toBeTruthy();
  });

  it("nunca pede rede: quem fala com o servidor é a tela de avisos", async () => {
    await guardarAvisos(comPorLer(3));
    await montar();
    expect(mockIdasARede).toBe(0);
  });

  it("tocar abre a tela de avisos", async () => {
    await montar();
    await act(async () => { fireEvent.press(screen.getByLabelText("Avisos, nenhum por ler")); });
    expect(mockEmpurrar).toHaveBeenCalledWith("/(agente)/avisos");
  });
});

describe("o crachá acompanha o disco", () => {
  it("zera quando a tela de avisos grava a leitura, sem que ninguém releia nada", async () => {
    await guardarAvisos(comPorLer(2));
    await montar();
    expect(screen.getByText("2", escondido)).toBeTruthy();

    await act(async () => { await guardarAvisos(comPorLer(0)); });

    expect(screen.queryByTestId("cracha-do-sino", escondido)).toBeNull();
    expect(screen.getByLabelText("Avisos, nenhum por ler")).toBeTruthy();
  });
});

describe("o balanço", () => {
  it("acontece quando a contagem sobe, com o ritmo e a curva do produto", async () => {
    await guardarAvisos(comPorLer(1));
    await montar();
    expect(balancos()).toHaveLength(0);

    await act(async () => { await guardarAvisos(comPorLer(2)); });

    const pernas = balancos();
    expect(pernas.length).toBeGreaterThan(0);
    /* O balanço inteiro dura o que uma mudança de estado dura, somando as pernas. */
    const total = pernas.reduce((soma, p) => soma + (p.duration ?? 0), 0);
    expect(total).toBeCloseTo(movimento.mudancaDeEstado);
    /* A primeira perna é o clímax: a única curva do produto que passa do alvo
       e volta, que é o que faz um sino parecer sino e não um ponteiro. */
    const climax = Easing.bezier(...easing.climax);
    expect(pernas[0]?.easing?.(0.5)).toBeCloseTo(climax(0.5));
    /* Na thread de interface: o JavaScript pode estar drenando a fila agora. */
    for (const perna of pernas) expect(perna.useNativeDriver).toBe(true);
  });

  it("não acontece na primeira leitura do disco: abrir uma aba não é receber aviso", async () => {
    await guardarAvisos(comPorLer(3));
    await montar();
    expect(balancos()).toHaveLength(0);
  });

  it("não acontece quando a contagem desce: descer é o agente lendo", async () => {
    await guardarAvisos(comPorLer(3));
    await montar();

    await act(async () => { await guardarAvisos(comPorLer(1)); });
    expect(balancos()).toHaveLength(0);
  });

  it("não acontece com a mesma contagem gravada de novo", async () => {
    /* A sincronização grava a cada volta, mesmo sem novidade. Balançar a cada
       gravação seria o sino tocando por nada, a cada abertura de tela. */
    await guardarAvisos(comPorLer(3));
    await montar();

    await act(async () => { await guardarAvisos(comPorLer(3)); });
    expect(balancos()).toHaveLength(0);
  });

  it("com redução de movimento, não balança, e o número muda mesmo assim", async () => {
    mockReduzir = true;
    await guardarAvisos(comPorLer(1));
    await montar();

    await act(async () => { await guardarAvisos(comPorLer(4)); });

    expect(balancos()).toHaveLength(0);
    expect(screen.getByText("4", escondido)).toBeTruthy();
  });
});
