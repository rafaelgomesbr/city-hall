/**
 * O QUE SAI NO FIO quando o aplicativo pergunta ao sino.
 *
 * `dados/avisos.test.ts` prova a DECISÃO (qual cursor levar, em que ordem
 * enviar a leitura, o que guardar no disco) contra um servidor falso. Este
 * arquivo prova a outra metade, que aquele não alcança porque dubla `./api`
 * inteiro: **o par do cursor chega mesmo à requisição**.
 *
 * A separação existe porque o defeito mora exatamente na emenda. Um cliente que
 * decide o cursor certo e o serializa errado perde os avisos empatados do mesmo
 * jeito, e os dois arquivos precisam morder: sem este, arrancar `desdeId` da
 * consulta passaria verde.
 *
 * A razão do par está escrita na rota: a consulta lá é
 * `criado_em > desde OR (criado_em = desde AND id > desdeId)`, porque **uma
 * sincronização grava várias vistorias na mesma transação e todas recebem o
 * mesmo `now()`**. Com o instante sozinho, um corte no meio de um empate deixa
 * os empatados atrás do cursor, para sempre, sem erro em lugar nenhum.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

import { baixarAvisos, marcarAvisosLidos } from "./api";

/** O que a última chamada de rede pediu. */
let pedido: { url: string; opcoes: RequestInit } | null = null;

const RESPOSTA = {
  ate: "2026-09-14T12:00:00.000Z",
  ateId: null,
  itens: [],
  teto: 200,
  truncada: false,
  naoLidos: 0,
  naoLidosTruncado: false,
};

beforeEach(() => {
  pedido = null;
  globalThis.fetch = (async (url: string, opcoes: RequestInit) => {
    pedido = { url, opcoes };
    return {
      status: 200,
      ok: true,
      json: async () => RESPOSTA,
    };
  }) as unknown as typeof fetch;
});

describe("a pergunta ao sino", () => {
  it("na primeira carga não leva cursor nenhum, nem um vazio", async () => {
    await baixarAvisos("token", null);

    /*
      Sem cursor, e não com `desde=`: o esquema da rota valida `desde` como data
      com fuso, e uma cadeia vazia reprova a consulta inteira com 422. Primeira
      carga é a AUSÊNCIA do parâmetro.
    */
    expect(pedido?.url).toBe("https://api.exemplo.test/v1/avisos");
  });

  it("leva o PAR (instante, id) quando a resposta anterior foi cortada", async () => {
    await baixarAvisos("token", {
      desde: "2026-09-14T11:00:00.000Z",
      desdeId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
    });

    const url = new URL(pedido?.url ?? "");
    expect(url.pathname).toBe("/v1/avisos");
    expect(url.searchParams.get("desde")).toBe("2026-09-14T11:00:00.000Z");
    /* O id é a metade que desfaz o empate, e é a que some sem ninguém notar. */
    expect(url.searchParams.get("desdeId"))
      .toBe("3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa");
  });

  it("omite o id quando não há empate a desfazer, em vez de mandar vazio", async () => {
    await baixarAvisos("token", { desde: "2026-09-14T11:00:00.000Z", desdeId: null });

    const url = new URL(pedido?.url ?? "");
    expect(url.searchParams.get("desde")).toBe("2026-09-14T11:00:00.000Z");
    expect(url.searchParams.has("desdeId")).toBe(false);
  });

  it("o instante vai escapado, porque `+` cru no fuso vira espaço na consulta", async () => {
    /*
      O servidor emite em UTC, mas o formato aceito pelo esquema inclui fuso com
      sinal, e `+` numa cadeia de consulta significa ESPAÇO. Sem escapar, um
      cursor em horário de Brasília chegaria como "2026-09-14T08:00:00.000 03:00"
      e reprovaria em 422, derrubando o sino inteiro daquele aparelho.
    */
    await baixarAvisos("token", { desde: "2026-09-14T08:00:00.000+03:00", desdeId: null });

    expect(pedido?.url).toContain("%2B03%3A00");
    expect(new URL(pedido?.url ?? "").searchParams.get("desde"))
      .toBe("2026-09-14T08:00:00.000+03:00");
  });

  it("vai autenticada: o sino é do município de quem pergunta", async () => {
    await baixarAvisos("token-de-teste", null);

    const cabecalhos = pedido?.opcoes.headers as Record<string, string>;
    expect(cabecalhos["authorization"]).toBe("Bearer token-de-teste");
  });
});

describe("marcar como lidos", () => {
  it("manda a lista de identificadores, e não um marco de tempo", async () => {
    globalThis.fetch = (async (url: string, opcoes: RequestInit) => {
      pedido = { url, opcoes };
      return { status: 200, ok: true, json: async () => ({ marcados: 2 }) };
    }) as unknown as typeof fetch;

    const r = await marcarAvisosLidos("token", ["a", "b"]);

    expect(pedido?.url).toBe("https://api.exemplo.test/v1/avisos/lidos");
    expect(pedido?.opcoes.method).toBe("POST");
    /*
      A lista, e nunca "tudo até tal hora": com um marco de tempo, o toque em
      marcar apagaria também o que o teto cortou e ninguém viu. Só some do sino
      o que passou pelos olhos de alguém.
    */
    expect(JSON.parse(String(pedido?.opcoes.body))).toEqual({ ids: ["a", "b"] });
    expect(r.marcados).toBe(2);
  });
});
