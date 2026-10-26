/**
 * O cabeçalho de versão nos pedidos do aplicativo à API (V2-F02-E06, parte 3B).
 *
 * Todo pedido do aplicativo à API leva `x-app-version: campo/<versão>`, com a
 * versão do `expoConfig.version`. A URL assinada do armazenamento não leva:
 * ela não fala com a API, e os cabeçalhos dela entram na assinatura. A fila
 * recebe a versão por parâmetro e é testada no pacote
 * (`packages/campo/test/versao-do-aplicativo.test.ts`).
 *
 * O 426 fora da fila (entrar, baixar a lista) chega como `ErroDaApi` com a
 * frase do servidor, como qualquer recusa: a tela própria de "atualize o
 * aplicativo" é da V2-F14-E08.
 */
import { DatabaseSync } from "node:sqlite";

/*
  O `fs` e o `path` vêm por `jest.requireActual`, tipados à mão no mínimo que a
  varredura usa, como em `push/logout-cala-o-aparelho.test.tsx`: o aplicativo
  não carrega os tipos do Node, que no aparelho não existe.
*/
declare const __dirname: string;
const { readFileSync, readdirSync, statSync } = jest.requireActual("fs") as {
  readFileSync(caminho: string, codificacao: "utf8"): string;
  readdirSync(caminho: string): string[];
  statSync(caminho: string): { isDirectory(): boolean };
};
const { join } = jest.requireActual("path") as { join(...partes: string[]): string };

let mockVersao: string | undefined = "1.4.0";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { version: mockVersao, extra: { apiUrl: "https://api.exemplo.test" } };
    },
  },
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
      async execAsync(sql: string) {
        db.exec(sql);
      },
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
  File: class {
    name = "";
    delete(): void {
      /* nada no disco nestes casos */
    }
  },
  Directory: class {
    list(): unknown[] {
      return [];
    }
  },
}));

import * as api from "./api";
import { esquecerConexao } from "./banco-local";
import { buscarHistoricoDaCasa } from "./historico-da-casa";
import { buscarAutorizacaoDoMapa, esquecerAutorizacaoDoMapa } from "./mapa";
import { frasesDaPausa } from "./pausa-da-fila";
import { verOCaminho } from "./rota";
import { cabecalhoDaVersao, versaoDoAplicativo } from "./versao-do-aplicativo";

type Pedido = { url: string; cabecalhos: Record<string, string> };

const buscarOriginal = globalThis.fetch;
let pedidos: Pedido[] = [];

function responder(status: number, corpo: unknown): void {
  pedidos = [];
  globalThis.fetch = jest.fn(
    async (url: unknown, opcoes?: { headers?: Record<string, string> }) => {
      pedidos.push({ url: String(url), cabecalhos: { ...(opcoes?.headers ?? {}) } });
      return { ok: status >= 200 && status < 300, status, json: async () => corpo };
    },
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  mockVersao = "1.4.0";
  mockBanco = null;
  esquecerConexao();
  esquecerAutorizacaoDoMapa();
});

afterEach(() => {
  globalThis.fetch = buscarOriginal;
});

describe("a versão lida do binário", () => {
  it("é a do expoConfig.version, e some quando o binário não a declara", () => {
    expect(versaoDoAplicativo()).toBe("1.4.0");
    expect(cabecalhoDaVersao()).toEqual({ "x-app-version": "campo/1.4.0" });
    mockVersao = undefined;
    expect(versaoDoAplicativo()).toBeNull();
    expect(cabecalhoDaVersao()).toEqual({});
    mockVersao = "  ";
    expect(cabecalhoDaVersao()).toEqual({});
  });
});

describe("o cabeçalho em todo pedido do aplicativo à API", () => {
  it("entrar, renovar e baixar a lista levam campo/<versão>, e o resto do pedido não muda", async () => {
    responder(200, {
      acesso: "a",
      renovacao: "r",
      usuario: {
        id: "u",
        nome: "Ana",
        matricula: "1",
        papel: "agente",
        organizacaoId: "o",
        organizacaoNome: "Serra Alta",
        municipio: "Serra Alta",
        uf: "SC",
      },
      itens: [],
    });
    await api.entrar("ana@exemplo.test", "senha");
    const entrar = pedidos[0]!;
    responder(200, { acesso: "a2", renovacao: "r2" });
    await api.renovar("r");
    const renovar = pedidos[0]!;
    responder(200, { itens: [] });
    await api.baixarPendencias("token");
    const lista = pedidos[0]!;

    for (const pedido of [entrar, renovar, lista]) {
      expect(pedido.url.startsWith("https://api.exemplo.test/v1/")).toBe(true);
      expect(pedido.cabecalhos["x-app-version"]).toBe("campo/1.4.0");
      expect(pedido.cabecalhos["accept"]).toBe("application/json");
    }
    expect(lista.cabecalhos["authorization"]).toBe("Bearer token");
  });

  it("sem versão no binário o pedido sai como antes, sem o cabeçalho", async () => {
    mockVersao = undefined;
    responder(200, { itens: [] });
    await api.baixarPendencias("token");
    expect(pedidos[0]!.cabecalhos).toEqual({
      accept: "application/json",
      authorization: "Bearer token",
    });
  });

  it("o caminho até o imóvel, a autorização do mapa e o histórico da casa também levam", async () => {
    responder(200, {
      duracaoSegundos: 60,
      distanciaMetros: 100,
      polilinha: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    });
    await verOCaminho({
      ocorrenciaId: "oc-1",
      token: "tok",
      origem: { latitude: -27.595378, longitude: -48.54805 },
      destino: { latitude: -27.585378, longitude: -48.54805 },
    });
    const rota = pedidos[0]!;
    responder(200, { mapaAutorizado: false });
    await buscarAutorizacaoDoMapa("tok");
    const configuracao = pedidos[0]!;
    responder(200, {});
    await buscarHistoricoDaCasa("tok", "oc-1");
    const historico = [...pedidos];

    expect(rota.url).toBe("https://api.exemplo.test/v1/rota");
    expect(configuracao.url).toBe("https://api.exemplo.test/v1/configuracao");
    expect(historico.length).toBeGreaterThan(0);
    for (const pedido of [rota, configuracao, ...historico]) {
      expect(pedido.url.startsWith("https://api.exemplo.test/v1/")).toBe(true);
      expect(pedido.cabecalhos["x-app-version"]).toBe("campo/1.4.0");
      expect(pedido.cabecalhos["authorization"]).toBe("Bearer tok");
    }
  });

  /*
    A rede de segurança para o pedido que alguém acrescentar depois: todo
    `fetch(` do aplicativo leva o cabeçalho, salvo o PUT na URL assinada da foto
    do agente, que vai ao armazenamento com exatamente os cabeçalhos assinados.
  */
  it("todo fetch do aplicativo monta o cabeçalho, salvo o da URL assinada", () => {
    const raiz = join(__dirname, "..");
    const fontes: string[] = [];
    const andar = (pasta: string) => {
      for (const nome of readdirSync(pasta)) {
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) andar(caminho);
        else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) fontes.push(caminho);
      }
    };
    andar(raiz);

    const semCabecalho: string[] = [];
    let urlsAssinadas = 0;
    let comCabecalho = 0;
    for (const arquivo of fontes) {
      const texto = readFileSync(arquivo, "utf8");
      const partes = texto.split(/\bfetch\(/).slice(1);
      for (const parte of partes) {
        // O pedido inteiro cabe nas linhas seguintes à chamada.
        const pedido = parte.split("\n").slice(0, 14).join("\n");
        if (/^autorizacao\.url\b/.test(parte)) {
          expect(pedido).not.toContain("cabecalhoDaVersao");
          urlsAssinadas += 1;
        } else if (pedido.includes("cabecalhoDaVersao()")) {
          comCabecalho += 1;
        } else {
          semCabecalho.push(`${arquivo}: fetch(${parte.slice(0, 60)}`);
        }
      }
    }
    expect(semCabecalho).toEqual([]);
    expect(urlsAssinadas).toBe(1);
    // api.ts, historico-da-casa.ts, mapa.ts e rota.ts.
    expect(comCabecalho).toBe(4);
  });
});

describe("o 426 fora da fila", () => {
  it("chega como ErroDaApi com a frase do servidor, sem renovar e sem frase inventada", async () => {
    responder(426, {
      erro: "versao_do_aplicativo_antiga",
      mensagem: "Atualize o aplicativo para continuar.",
      versaoMinima: "1.5.0",
    });
    const erro = await api.baixarPendencias("token").catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(api.ErroDaApi);
    const recusa = erro as InstanceType<typeof api.ErroDaApi>;
    expect(recusa.status).toBe(426);
    expect(recusa.codigo).toBe("versao_do_aplicativo_antiga");
    expect(recusa.mensagemAmigavel()).toBe("Atualize o aplicativo para continuar.");
    // Um pedido só: o 426 não é da sessão e não aciona renovação nenhuma.
    expect(pedidos).toHaveLength(1);
  });
});

/*
  A fila pausada pelo 426 fala pelas MESMAS faixa, aviso e cartão das outras
  pausas (`frasesDaPausa`), sem tela nova: a tela "atualize o aplicativo" é da
  V2-F14-E08. As regras são as das outras três pausas.
*/
describe("as frases da pausa pelo 426", () => {
  const versao = frasesDaPausa("versao_do_aplicativo_antiga");
  const outras = (
    ["sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria"] as const
  ).map((m) => frasesDaPausa(m));

  it("prometem que a coleta continua guardada e dizem o único ato que resolve", () => {
    expect(versao.detalhe).toMatch(/continuam guardadas/i);
    expect(versao.detalhe).toMatch(/nada foi apagado/i);
    expect(versao.faixaDetalhe).toMatch(/guardadas/i);
    expect(versao.doCartao).toMatch(/guardada/i);
    for (const texto of [versao.faixaTitulo, versao.detalhe, versao.doCartao, versao.daLista]) {
      expect(texto).toMatch(/atualiz/i);
    }
    expect(versao.detalhe).toMatch(/entrar de novo não resolve/i);
    expect(versao.daLista).toMatch(/^Você já vistoriou tudo o que está nesta lista/);
    expect(versao.daLista).not.toMatch(/sinal/i);
  });

  it("não se confundem com as outras pausas, não têm travessão e não prometem envio em segundo plano", () => {
    for (const outra of outras) {
      expect(versao.titulo).not.toBe(outra.titulo);
      expect(versao.faixaTitulo).not.toBe(outra.faixaTitulo);
      expect(versao.doCartao).not.toBe(outra.doCartao);
      expect(versao.daLista).not.toBe(outra.daLista);
    }
    const falsa = /segundo plano|fechado|assim que houver sinal|(sai|sobe|sobem|acontece) sozinh/i;
    for (const texto of Object.values(versao)) {
      expect(texto).not.toContain(String.fromCharCode(0x2014));
      expect(texto).not.toMatch(falsa);
    }
    expect(versao.detalhe).toMatch(/com o aplicativo aberto/i);
  });
});
