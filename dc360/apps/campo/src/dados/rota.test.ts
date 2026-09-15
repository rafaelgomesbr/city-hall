/**
 * O CAMINHO POR RUAS, do lado do aparelho.
 *
 * O que se prova aqui, e cada item é uma metade de uma promessa:
 *
 * 1. **O decodificador de polilinha está certo.** O Google devolve a linha
 *    comprimida no formato dele, e um decodificador com o sinal trocado
 *    desenha o caminho num espelho: o agente entra na rua errada com o mapa
 *    dizendo que é a certa. O caso usa o exemplo canônico da documentação, com
 *    os três pontos que ela publica.
 * 2. **A chave do Google nunca é vista daqui.** O aplicativo fala com a API do
 *    produto (`POST /rota`), e nunca com `routes.googleapis.com`. O portão em
 *    `scripts/portao-do-mapa-do-aplicativo.test.mjs` mede isso no texto; aqui
 *    se mede na chamada.
 * 3. **Cada fracasso tem uma frase, e a frase diz o que fazer.** Sem sinal, sem
 *    o município ter ligado, ou o servidor caído, o botão explica em uma linha
 *    e a linha reta continua. Os três são diferentes e não podem virar um
 *    "erro" só.
 * 4. **Guardado por tarefa, no aparelho, para não pedir de novo.** O mesmo
 *    toque na mesma tarefa, da mesma esquina, não custa outra chamada: nem à
 *    API, nem, por consequência, ao Google. E o que fica guardado morre no
 *    logout junto com o resto de `marcas`, porque é coordenada de tarefa.
 */

import { DatabaseSync } from "node:sqlite";

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
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class { name = ""; delete(): void { /* nada no disco nestes casos */ } },
  Directory: class { list(): unknown[] { return []; } },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

import { apagarDadosLocais, bancoLocal, esquecerConexao } from "./banco-local";
import {
  CaminhoIndisponivel, decodificarPolilinha, fraseDoCaminho, lerCaminhoGuardado,
  verOCaminho,
} from "./rota";

/* Dois pontos reais de Florianópolis. */
const AQUI = { latitude: -27.595378, longitude: -48.54805 };
const IMOVEL = { latitude: -27.585378, longitude: -48.54805 };

/** A resposta de `POST /rota`, na forma que a API devolve. */
const RESPOSTA = { duracaoSegundos: 846, distanciaMetros: 4213, polilinha: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" };

function responder(status: number, corpo: unknown): jest.Mock {
  const falso = jest.fn(async () => ({
    ok: status >= 200 && status < 300, status, json: async () => corpo,
  }));
  (globalThis as { fetch: unknown }).fetch = falso;
  return falso;
}

beforeEach(() => {
  mockBanco = null;
  esquecerConexao();
});

describe("o decodificador de polilinha", () => {
  it("lê o exemplo da documentação do Google, ponto a ponto", () => {
    /*
      O exemplo publicado em developers.google.com/maps/documentation/utilities/polylinealgorithm:
      (38.5, -120.2), (40.7, -120.95), (43.252, -126.453). Se algum sinal ou
      deslocamento de bit estiver errado, nenhum dos três bate.
    */
    expect(decodificarPolilinha("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("um ponto só é um ponto só, e texto vazio é lista vazia", () => {
    expect(decodificarPolilinha("_p~iF~ps|U")).toEqual([{ latitude: 38.5, longitude: -120.2 }]);
    expect(decodificarPolilinha("")).toEqual([]);
  });

  it("texto que não é polilinha não estoura, e não inventa ponto", () => {
    /*
      Uma sequência cortada no meio (o servidor devolveu metade) não pode
      derrubar a tela do mapa: o que der para ler é lido, e o que não der é
      descartado, em vez de virar um ponto no meio do oceano.
    */
    expect(() => decodificarPolilinha("_p~iF~ps|U_ul")).not.toThrow();
    expect(decodificarPolilinha("_p~iF~ps|U_ul")).toEqual([{ latitude: 38.5, longitude: -120.2 }]);
  });
});

describe("a frase do caminho", () => {
  it("diz o tempo em minutos de carro e a distância na régua do produto", () => {
    expect(fraseDoCaminho({ duracaoSegundos: 846, distanciaMetros: 4213 }))
      .toBe("cerca de 14 min de carro, 4,2 km");
  });

  it("abaixo de um minuto não inventa precisão", () => {
    expect(fraseDoCaminho({ duracaoSegundos: 40, distanciaMetros: 350 }))
      .toBe("menos de 1 min de carro, 350 m");
  });

  it("acima de uma hora diz as horas, e os minutos só quando há", () => {
    expect(fraseDoCaminho({ duracaoSegundos: 3_900, distanciaMetros: 52_000 }))
      .toBe("cerca de 1 h 5 min de carro, 52,0 km");
    expect(fraseDoCaminho({ duracaoSegundos: 7_200, distanciaMetros: 100_000 }))
      .toBe("cerca de 2 h de carro, 100,0 km");
  });
});

describe("ver o caminho, com a API do produto e nunca com o Google", () => {
  it("pede a POST /rota com o token, e devolve o caminho decodificado", async () => {
    const chamada = responder(200, RESPOSTA);
    const { caminho, guardado } = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    });

    expect(guardado).toBe(false);
    expect(caminho.duracaoSegundos).toBe(846);
    expect(caminho.distanciaMetros).toBe(4213);
    expect(caminho.pontos).toHaveLength(3);
    expect(caminho.pontos[0]).toEqual({ latitude: 38.5, longitude: -120.2 });

    expect(chamada).toHaveBeenCalledTimes(1);
    const [url, opcoes] = chamada.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.exemplo.test/rota");
    expect(url).not.toMatch(/googleapis/);
    expect(opcoes.method).toBe("POST");
    expect(opcoes.headers["authorization"]).toBe("Bearer tok");
    expect(JSON.parse(opcoes.body)).toEqual({ origem: AQUI, destino: IMOVEL });
  });

  it("sem sinal, o motivo é `sem-sinal` e a frase manda esperar o sinal", async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const erro = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(CaminhoIndisponivel);
    expect((erro as CaminhoIndisponivel).motivo).toBe("sem-sinal");
    expect((erro as CaminhoIndisponivel).message).toMatch(/[Ss]em sinal/);
    expect((erro as CaminhoIndisponivel).message).toMatch(/linha reta/);
  });

  it("município que não ligou o caminho: o motivo é dele, e a frase diz isso", async () => {
    responder(503, { erro: "caminho_desligado", mensagem: "..." });
    const erro = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    }).catch((e: unknown) => e);
    expect((erro as CaminhoIndisponivel).motivo).toBe("municipio-nao-ligou");
    expect((erro as CaminhoIndisponivel).message).toMatch(/município não ligou o caminho/);
  });

  it("qualquer outra falha do servidor é `falhou`, com a linha reta valendo", async () => {
    responder(502, { erro: "caminho_indisponivel", mensagem: "..." });
    const erro = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    }).catch((e: unknown) => e);
    expect((erro as CaminhoIndisponivel).motivo).toBe("falhou");
    expect((erro as CaminhoIndisponivel).message).toMatch(/linha reta/);
  });

  it("resposta sem polilinha é falha, e não um caminho vazio", async () => {
    responder(200, { duracaoSegundos: 10, distanciaMetros: 10, polilinha: "" });
    const erro = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    }).catch((e: unknown) => e);
    expect((erro as CaminhoIndisponivel).motivo).toBe("falhou");
  });
});

describe("guardado por tarefa, no aparelho", () => {
  it("o segundo pedido da mesma tarefa, da mesma esquina, não vai à rede", async () => {
    const chamada = responder(200, RESPOSTA);
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL });

    /* Dez metros ao lado: o GPS oscilou, a esquina é a mesma. */
    const oscilou = { latitude: AQUI.latitude + 0.00009, longitude: AQUI.longitude };
    const segundo = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: oscilou, destino: IMOVEL,
    });
    expect(segundo.guardado).toBe(true);
    expect(segundo.caminho.duracaoSegundos).toBe(846);
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it("o agente que andou mais de um quarteirão pede de novo", async () => {
    const chamada = responder(200, RESPOSTA);
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL });
    const longe = { latitude: AQUI.latitude + 0.005, longitude: AQUI.longitude };
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: longe, destino: IMOVEL });
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("outra tarefa é outro pedido, mesmo da mesma esquina", async () => {
    const chamada = responder(200, RESPOSTA);
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL });
    await verOCaminho({ ocorrenciaId: "oc-2", token: "tok", origem: AQUI, destino: IMOVEL });
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("depois de 24 horas o guardado não vale mais", async () => {
    const chamada = responder(200, RESPOSTA);
    const meioDia = Date.parse("2026-09-15T12:00:00Z");
    await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL, agora: () => meioDia,
    });
    await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
      agora: () => meioDia + 25 * 60 * 60 * 1000,
    });
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("fracasso não fica guardado: com sinal de volta, pede de novo", async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL })
      .catch(() => undefined);
    expect(await lerCaminhoGuardado("oc-1", AQUI, IMOVEL)).toBeNull();

    const voltou = responder(200, RESPOSTA);
    const { guardado } = await verOCaminho({
      ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL,
    });
    expect(guardado).toBe(false);
    expect(voltou).toHaveBeenCalledTimes(1);
  });

  it("o logout leva o caminho junto, porque é coordenada de tarefa", async () => {
    /*
      `marcas` morre no logout de propósito, e o caminho mora lá por isso: ele
      carrega a coordenada do imóvel de uma família e a posição do agente do
      turno. O aparelho de plantão passa de mão em mão, e nada disso pode
      sobrar para o próximo.
    */
    responder(200, RESPOSTA);
    await verOCaminho({ ocorrenciaId: "oc-1", token: "tok", origem: AQUI, destino: IMOVEL });
    expect(await lerCaminhoGuardado("oc-1", AQUI, IMOVEL)).not.toBeNull();

    await apagarDadosLocais();
    /* A limpeza de fato rodou: sem esta linha o caso passaria verde num logout
       que não apagou nada. */
    const db = await bancoLocal();
    expect(await db.getAllAsync("SELECT chave FROM marcas")).toEqual([]);
    expect(await lerCaminhoGuardado("oc-1", AQUI, IMOVEL)).toBeNull();
  });
});
