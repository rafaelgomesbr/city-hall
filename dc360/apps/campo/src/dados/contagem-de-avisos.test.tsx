/**
 * A CONTAGEM DO SINO, num gancho só, para o cabeçalho e para a barra.
 *
 * O dono pediu o sino no topo de toda tela, com crachá, e pediu O MESMO número
 * no avatar do menu. Dois lugares lendo o disco por conta própria seria a
 * receita para os dois discordarem no primeiro dia: um relê na montagem e fica
 * parado ("3 por ler" enquanto o agente está lendo os três), o outro escuta e
 * zera. `useContagemDeAvisos()` é o único lugar que responde "quantos por ler",
 * e os dois desenhos o chamam.
 *
 * O que estes casos travam, e por que cada um importa para quem está na rua:
 *
 * 1. **A contagem sai do DISCO, e o gancho nunca pede rede.** Um sino que só
 *    existisse com sinal seria um sino que só existe na base.
 * 2. **Quem grava avisa, e o gancho ouve.** Marcar como lido na tela de avisos
 *    precisa zerar o crachá do cabeçalho de TODAS as telas, sem que nenhuma
 *    delas releia nada.
 * 3. **A leitura inicial não sobrescreve um aviso que chegou enquanto ela lia.**
 *    O disco é lento no aparelho velho; se a sincronização gravar entre o
 *    pedido de leitura e a resposta, a resposta é uma fotografia velha, e ela
 *    não pode apagar o presente.
 * 4. **Truncado vira "500+", e a frase falada diz "mais de".** O crachá não
 *    afirma um total que ninguém contou.
 *
 * O banco é SQLite DE VERDADE, em memória, e o gravador é o de verdade: é o
 * caminho inteiro que o cabeçalho vai percorrer no aparelho, e não um dublê
 * que devolve o que o caso quer ouvir.
 */

import { DatabaseSync } from "node:sqlite";
import { act, renderHook } from "@testing-library/react-native";

let mockBanco: DatabaseSync | null = null;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

/** Ligado, a leitura do disco segura a resposta até alguém soltá-la. */
let mockSegurarLeitura: (() => void) | null = null;

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
        /*
          A leitura pode ser SEGURADA, e é assim que se encena o disco lento:
          o caso 3 grava por cima enquanto a primeira leitura ainda não voltou.
        */
        const resultado = db.prepare(sql).get(...(params as never[])) ?? null;
        if (mockSegurarLeitura === null) return resultado;
        await new Promise<void>((soltar) => { mockSegurarLeitura = soltar; });
        return resultado;
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

jest.mock("./api", () => ({
  baixarAvisos: async () => { throw new Error("o gancho não pode chegar à rede"); },
  marcarAvisosLidos: async () => { throw new Error("o gancho não pode chegar à rede"); },
}));

import {
  AVISOS_VAZIOS, contagemDe, fraseDoSino, guardarAvisos, textoDoCracha,
  useContagemDeAvisos, type AvisosGuardados,
} from "./avisos";
import { bancoLocal } from "./banco-local";

function comPorLer(naoLidos: number, truncado = false): AvisosGuardados {
  return { ...AVISOS_VAZIOS, naoLidos, naoLidosTruncado: truncado, baixadoEm: "2026-09-15T12:00:00.000Z" };
}

beforeEach(async () => {
  mockSegurarLeitura = null;
  const db = await bancoLocal();
  await db.execAsync("DELETE FROM marcas;");
});

describe("as palavras da contagem, num lugar só", () => {
  it("antes de ler o disco, o sino não sabe, e diz nada por ler sem afirmar que leu", () => {
    const contagem = contagemDe(null);
    expect(contagem).toEqual({ porLer: 0, truncado: false, lida: false });
    expect(textoDoCracha(contagem)).toBeNull();
    expect(fraseDoSino(contagem)).toBe("Avisos, nenhum por ler");
  });

  it("com avisos, o crachá é o número e a frase diz quantos", () => {
    const contagem = contagemDe(comPorLer(3));
    expect(contagem).toEqual({ porLer: 3, truncado: false, lida: true });
    expect(textoDoCracha(contagem)).toBe("3");
    expect(fraseDoSino(contagem)).toBe("Avisos, 3 por ler");
  });

  it("um aviso só fala no singular", () => {
    expect(fraseDoSino(contagemDe(comPorLer(1)))).toBe("Avisos, 1 por ler");
  });

  it("a contagem truncada vira piso, no crachá e na frase", () => {
    /* O servidor parou de contar em quinhentos. "500" afirmaria um total que
       ninguém contou; "500+" e "mais de 500" dizem só o que se sabe. */
    const contagem = contagemDe(comPorLer(500, true));
    expect(textoDoCracha(contagem)).toBe("500+");
    expect(fraseDoSino(contagem)).toBe("Avisos, mais de 500 por ler");
  });

  it("zero por ler não desenha crachá nenhum", () => {
    expect(textoDoCracha(contagemDe(comPorLer(0)))).toBeNull();
  });
});

describe("o gancho lê o disco e depois só escuta", () => {
  it("nasce sem saber e passa a saber pelo que já estava gravado", async () => {
    await guardarAvisos(comPorLer(2));

    /* Enquanto o disco não respondeu, o sino não afirma nada. */
    mockSegurarLeitura = () => undefined;
    const { result } = await renderHook(() => useContagemDeAvisos());
    expect(result.current.lida).toBe(false);

    const soltar = mockSegurarLeitura;
    mockSegurarLeitura = null;
    await act(async () => { soltar(); });
    expect(result.current).toEqual({ porLer: 2, truncado: false, lida: true });
  });

  it("zera quando alguém grava a leitura, sem reler nada", async () => {
    await guardarAvisos(comPorLer(2));
    const { result } = await renderHook(() => useContagemDeAvisos());
    expect(result.current.porLer).toBe(2);

    /* É o que a tela de avisos faz ao marcar como lidos: grava, e quem grava
       avisa. O cabeçalho de toda tela precisa zerar junto. */
    await act(async () => { await guardarAvisos(comPorLer(0)); });
    expect(result.current.porLer).toBe(0);
  });

  it("a leitura inicial não sobrescreve o que chegou enquanto ela lia", async () => {
    await guardarAvisos(comPorLer(1));

    /* A primeira leitura fica presa no disco lento... */
    mockSegurarLeitura = () => undefined;
    const { result } = await renderHook(() => useContagemDeAvisos());
    expect(result.current.lida).toBe(false);

    /* ...a sincronização grava três por ler enquanto isso... */
    const soltar = mockSegurarLeitura;
    mockSegurarLeitura = null;
    await act(async () => { await guardarAvisos(comPorLer(3)); });
    expect(result.current.porLer).toBe(3);

    /* ...e a resposta velha (um por ler) chega por último. Ela é fotografia do
       passado, e não pode apagar o presente. */
    await act(async () => { soltar(); });
    expect(result.current.porLer).toBe(3);
  });

  it("para de ouvir ao desmontar", async () => {
    const { result, unmount } = await renderHook(() => useContagemDeAvisos());
    unmount();
    /* Sem o desassinar, isto escreveria estado em componente morto: ruído que
       esconde defeito de verdade. O caso passa se nada estourar. */
    await act(async () => { await guardarAvisos(comPorLer(5)); });
    expect(result.current.porLer).toBe(0);
  });
});
