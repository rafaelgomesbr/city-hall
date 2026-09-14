/**
 * O SINO DO AGENTE, do cursor à leitura que sobrevive à falta de sinal.
 *
 * `GET /avisos` e `POST /avisos/lidos` existem no servidor desde o T8, escritas
 * **sem `exigirPermissao`, expressamente para não deixar "operador e agente de
 * campo sem sino nenhum"**, e o aplicativo nunca as chamou. Estes casos travam
 * as três coisas que a ligação dessa ponta pode quebrar em silêncio.
 *
 * ## 1. O cursor é um PAR, e o par é o caso mais importante deste arquivo
 *
 * O servidor devolve `ate` e `ateId`, e a pergunta seguinte ecoa os dois em
 * `desde` e `desdeId`. A consulta lá é
 * `criado_em > desde OR (criado_em = desde AND id > desdeId)`, e a razão está
 * escrita na rota: **uma sincronização grava várias vistorias na MESMA
 * transação, e todas recebem o mesmo `now()`**, então instante empatado aqui é
 * rotina, não exceção. Um cliente que mandasse só o instante perderia os
 * empatados do lado de fora do corte, para sempre, sem erro em lugar nenhum.
 *
 * O servidor falso deste arquivo implementa a MESMA expressão, com um teto de
 * dois, sobre três avisos em que dois empatam no instante. É por isso que o
 * caso sabe falhar: com `desdeId` omitido do cliente, a terceira linha nunca
 * mais é entregue, e a asserção é sobre o que chegou, e não sobre o formato da
 * requisição.
 *
 * ## 2. Marcar como lido sobrevive ao morro
 *
 * O agente lê os avisos sem sinal. Sem a lista de pendentes, ele sai da tela,
 * volta, e encontra tudo por ler de novo; pior, a sincronização seguinte
 * traria os mesmos avisos com o `lido: false` do servidor e apagaria a leitura
 * que ele fez.
 *
 * ## 3. Registro velho no disco não pode derrubar a tela
 *
 * O aparelho pode ter gravado o estado do sino com uma versão anterior deste
 * arquivo. A leitura dá padrão a cada campo, e não difunde um objeto por cima
 * de outro: `undefined` em `lidosPendentes` estouraria na abertura, sem sinal,
 * que é quando ninguém tem como investigar.
 *
 * O banco aqui é SQLite DE VERDADE, em memória: `marcas` é a tabela que o
 * logout apaga, e é nela que o sino mora.
 */

import { DatabaseSync } from "node:sqlite";
import type { CursorDeAvisos, RespostaDeAvisos } from "./api";

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
   O SERVIDOR FALSO, com a MESMA expressão de cursor da rota
   ============================================================ */

/** Quantos avisos cabem numa resposta deste servidor falso. */
const TETO_FALSO = 2;

/** O relógio do servidor, que é de onde `ate` sai quando nada é cortado. */
const RELOGIO = "2026-09-14T12:00:00.000Z";

type LinhaFalsa = { id: string; criadoEm: string; lido: boolean };

let mockAcervo: LinhaFalsa[] = [];
/** Os cursores que o aplicativo mandou, na ordem. É o rastro da paginação. */
let mockCursoresRecebidos: CursorDeAvisos[] = [];
/** Os lotes que o aplicativo mandou marcar como lidos, na ordem. */
let mockLeiturasRecebidas: string[][] = [];
/** Ligado, `POST /avisos/lidos` falha, que é o aparelho sem sinal. */
let mockLeituraFalha = false;

function crescente(a: LinhaFalsa, b: LinhaFalsa): number {
  if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function mockServidorDeAvisos(cursor: CursorDeAvisos): RespostaDeAvisos {
  mockCursoresRecebidos.push(cursor);

  /*
    A MESMA cláusula do SQL da rota, escrita aqui de propósito. Se ela fosse
    frouxa (aceitando o empatado com `>=`, por exemplo), o caso do cursor
    passaria verde com o defeito dentro, que é exatamente o tipo de teste que a
    revisão desta onda mandou procurar.
  */
  const depois = [...mockAcervo].sort(crescente).filter((a) => {
    if (!cursor) return true;
    if (a.criadoEm > cursor.desde) return true;
    return cursor.desdeId !== null
      && a.criadoEm === cursor.desde
      && a.id > cursor.desdeId;
  });

  const truncada = depois.length > TETO_FALSO;
  const entregues = truncada ? depois.slice(0, TETO_FALSO) : depois;
  const ultimo = entregues[entregues.length - 1];

  return {
    ate: truncada && ultimo ? ultimo.criadoEm : RELOGIO,
    ateId: truncada && ultimo ? ultimo.id : null,
    itens: entregues.map((a) => ({
      id: a.id,
      tipo: "vistoria_recebida",
      ocorrenciaId: `oc-${a.id}`,
      protocolo: `00000${a.id}/2026`,
      criadoEm: a.criadoEm,
      detalhe: null,
      lido: a.lido,
    })),
    teto: TETO_FALSO,
    truncada,
    naoLidos: mockAcervo.filter((a) => !a.lido).length,
    naoLidosTruncado: false,
  };
}

jest.mock("./api", () => ({
  baixarAvisos: async (_token: string, cursor: CursorDeAvisos) => mockServidorDeAvisos(cursor),
  marcarAvisosLidos: async (_token: string, ids: readonly string[]) => {
    if (mockLeituraFalha) throw new Error("sem sinal");
    mockLeiturasRecebidas.push([...ids]);
    for (const a of mockAcervo) if (ids.includes(a.id)) a.lido = true;
    return { marcados: ids.length };
  },
}));

import {
  AVISOS_VAZIOS, avisosGuardados, cursorDaResposta, guardarAvisos,
  marcarAvisosComoLidosNoAparelho, marcarComoLidos, mesclarAvisos,
  sincronizarAvisos,
} from "./avisos";
import { bancoLocal } from "./banco-local";

const T1 = "2026-09-14T10:00:00.000Z";
/** O instante EMPATADO: duas vistorias na mesma transação, o mesmo `now()`. */
const T2 = "2026-09-14T11:00:00.000Z";

beforeEach(async () => {
  mockAcervo = [
    { id: "a", criadoEm: T1, lido: false },
    { id: "b", criadoEm: T2, lido: false },
    { id: "c", criadoEm: T2, lido: false },
  ];
  mockCursoresRecebidos = [];
  mockLeiturasRecebidas = [];
  mockLeituraFalha = false;
  const db = await bancoLocal();
  await db.execAsync("DELETE FROM marcas;");
});

describe("o cursor do sino", () => {
  it("é o par (instante, id) da resposta, e nunca o relógio do aparelho", () => {
    const resposta = mockServidorDeAvisos(null);
    expect(resposta.truncada).toBe(true);
    expect(cursorDaResposta(resposta)).toEqual({ desde: T2, desdeId: "b" });
  });

  it("devolve o relógio do servidor, sem id, quando nada foi cortado", () => {
    mockAcervo = [{ id: "a", criadoEm: T1, lido: false }];
    const resposta = mockServidorDeAvisos(null);
    expect(resposta.truncada).toBe(false);
    expect(cursorDaResposta(resposta)).toEqual({ desde: RELOGIO, desdeId: null });
  });

  it("ENTREGA O EMPATADO que ficou fora do corte, que é o defeito que ele evita", async () => {
    /*
      O caso que dá razão a este arquivo inteiro.

      Corte no meio de um empate: a página 1 leva `a` e `b`, e `c` tem o MESMO
      instante de `b`. Com o instante sozinho no cursor, a pergunta seguinte é
      "o que é maior que T2", e `c` não é maior que T2: ele fica atrás do cursor
      e não volta em pergunta nenhuma. Sem sinal e sem erro, o agente
      simplesmente nunca fica sabendo.
    */
    const estado = await sincronizarAvisos("token");

    expect(estado.itens.map((a) => a.id).sort()).toEqual(["a", "b", "c"]);
    /* E o segundo pedido levou o par completo, que é o que torna isso possível. */
    expect(mockCursoresRecebidos[0]).toBeNull();
    expect(mockCursoresRecebidos[1]).toEqual({ desde: T2, desdeId: "b" });
  });

  it("continua de onde parou na abertura seguinte, sem repetir nem pular", async () => {
    await sincronizarAvisos("token");
    const antes = mockCursoresRecebidos.length;

    /* Um aviso novo chega depois do relógio da resposta anterior. */
    mockAcervo.push({ id: "d", criadoEm: "2026-09-14T13:00:00.000Z", lido: false });
    const estado = await sincronizarAvisos("token");

    expect(mockCursoresRecebidos[antes]).toEqual({ desde: RELOGIO, desdeId: null });
    expect(estado.itens.map((a) => a.id).sort()).toEqual(["a", "b", "c", "d"]);
    /* O primeiro da lista é o mais novo: é a ordem em que a tela lê. */
    expect(estado.itens[0]?.id).toBe("d");
  });
});

describe("marcar como lido sem sinal", () => {
  it("vale no aparelho na hora, e o servidor fica sabendo na próxima sincronização", async () => {
    await sincronizarAvisos("token");
    mockLeituraFalha = true;

    const depoisDoToque = await marcarAvisosComoLidosNoAparelho(["a", "b"]);
    expect(depoisDoToque.itens.filter((x) => x.lido).map((x) => x.id).sort())
      .toEqual(["a", "b"]);
    expect(depoisDoToque.naoLidos).toBe(1);
    expect(depoisDoToque.lidosPendentes.sort()).toEqual(["a", "b"]);

    /* O aplicativo morreu e reabriu: a leitura continua lá. */
    const doDisco = await avisosGuardados();
    expect(doDisco.lidosPendentes.sort()).toEqual(["a", "b"]);

    mockLeituraFalha = false;
    const depois = await sincronizarAvisos("token");
    expect(mockLeiturasRecebidas).toHaveLength(1);
    expect([...(mockLeiturasRecebidas[0] ?? [])].sort()).toEqual(["a", "b"]);
    expect(depois.lidosPendentes).toEqual([]);
    expect(depois.naoLidos).toBe(1);
  });

  it("a sincronização não reacende o que o aparelho marcou e ainda não enviou", async () => {
    /*
      A ORDEM da sincronização é o que prova isto: primeiro confirmar o que este
      aparelho decidiu, depois perguntar. Invertida, a resposta viria com o
      `lido: false` do servidor por cima da leitura que o agente acabou de
      fazer, e ele veria os avisos reacenderem debaixo do dedo.
    */
    await sincronizarAvisos("token");
    mockLeituraFalha = true;
    await marcarAvisosComoLidosNoAparelho(["a"]);

    /* O envio continua falhando, e mesmo assim a leitura não se perde. */
    const depois = await sincronizarAvisos("token");
    expect(depois.itens.find((x) => x.id === "a")?.lido).toBe(true);
    expect(depois.lidosPendentes).toEqual(["a"]);
  });

  it("marcar o que já estava lido não mexe em nada, nem no objeto", () => {
    const estado = {
      ...AVISOS_VAZIOS,
      itens: [{
        id: "a", tipo: "vistoria_recebida", ocorrenciaId: "o1",
        protocolo: "000001/2026", criadoEm: T1, detalhe: null, lido: true,
      }],
      naoLidos: 0,
    };
    /* O MESMO objeto: com um objeto novo equivalente o React redesenharia a
       lista debaixo do dedo de quem está tentando ler. */
    expect(marcarComoLidos(estado, ["a"])).toBe(estado);
  });
});

describe("o disco", () => {
  it("registro gravado por versão anterior não derruba a abertura", async () => {
    const db = await bancoLocal();
    /* Como o arquivo gravava antes de `lidosPendentes` existir. */
    await db.runAsync(
      "INSERT INTO marcas (chave, valor) VALUES (?, ?)",
      ["avisos.estado", JSON.stringify({ itens: [], naoLidos: 3 })],
    );

    const lido = await avisosGuardados();
    expect(lido.lidosPendentes).toEqual([]);
    expect(lido.cursor).toBeNull();
    expect(lido.naoLidos).toBe(3);
  });

  it("registro ilegível vira primeira carga, e não erro na tela", async () => {
    const db = await bancoLocal();
    await db.runAsync(
      "INSERT INTO marcas (chave, valor) VALUES (?, ?)",
      ["avisos.estado", "isto não é json"],
    );
    expect(await avisosGuardados()).toEqual(AVISOS_VAZIOS);
  });

  it("a mescla não duplica o aviso que voltou na continuação", async () => {
    await guardarAvisos(AVISOS_VAZIOS);
    const primeira = mesclarAvisos(AVISOS_VAZIOS, mockServidorDeAvisos(null));
    /* A mesma janela de novo, que é o que acontece depois de uma falha. */
    const segunda = mesclarAvisos(primeira, mockServidorDeAvisos(null));

    expect(segunda.itens).toHaveLength(2);
    expect(segunda.itens.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });
});
