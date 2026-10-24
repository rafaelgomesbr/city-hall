import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "../src/dados/http";
import {
  descreverErroDoPainel,
  instalarErrosGlobais,
  reportadorDeConsole,
  type AlvoDeErrosGlobais,
  type RegistroDeErroDoPainel,
} from "../src/observabilidade";

/**
 * O CÓDIGO DE SUPORTE no painel e os erros globais (V2-F01-E14).
 *
 * Antes, o 500 da API trazia `requisicao` no corpo e nenhuma tela o mostrava:
 * "Erro inesperado" sem nada que a equipe pudesse procurar no log. Agora
 * `ErroDaApi` guarda o id e, nos 5xx, a mensagem que todas as telas já exibem
 * termina com "Código de suporte: <id>".
 */

const ID = "3f2b8c1e-5a47-4d0e-9b61-7c2d4e8f1a90";

function armazenamento(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (k: string) => dados.get(k) ?? null,
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => {
      dados.delete(k);
    },
    setItem: (k: string, v: string) => {
      dados.set(k, v);
    },
  } as Storage;
}

function resposta(
  status: number,
  corpo: unknown,
  cabecalhos: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });
}

describe("ErroDaApi e o código de suporte", () => {
  it("5xx com o id no corpo: a mensagem termina com o código", () => {
    const erro = new http.ErroDaApi(500, {
      erro: "erro_interno",
      mensagem: "Erro inesperado. Se precisar de ajuda, informe o código de suporte.",
      requisicao: ID,
    });
    expect(erro.requisicao).toBe(ID);
    expect(erro.message).toBe(
      `Erro inesperado. Se precisar de ajuda, informe o código de suporte. Código de suporte: ${ID}.`,
    );
  });

  it("5xx com o id só no cabeçalho (proxy trocou o corpo): o código também aparece", () => {
    const erro = new http.ErroDaApi(502, { mensagem: "Serviço indisponível." }, ID);
    expect(erro.message).toBe(`Serviço indisponível. Código de suporte: ${ID}.`);
  });

  it("negativo: 4xx não mostra o código, mas o guarda", () => {
    const erro = new http.ErroDaApi(
      422,
      { erro: "dados_invalidos", mensagem: "Corrija os campos." },
      ID,
    );
    expect(erro.message).toBe("Corrija os campos.");
    expect(erro.requisicao).toBe(ID);
  });

  it("negativo: o que não é UUID nunca vira código de suporte na tela", () => {
    for (const hostil of ["<script>alert(1)</script>", "x".repeat(200), "abc", `${ID}\nX: 1`, ""]) {
      const erro = new http.ErroDaApi(500, { mensagem: "Falha.", requisicao: hostil });
      expect(erro.requisicao, JSON.stringify(hostil)).toBeNull();
      expect(erro.message).toBe("Falha.");
      const doCabecalho = new http.ErroDaApi(500, { mensagem: "Falha." }, hostil);
      expect(doCabecalho.requisicao).toBeNull();
      expect(doCabecalho.message).toBe("Falha.");
    }
  });

  it("5xx sem id nenhum mantém a mensagem como veio", () => {
    expect(new http.ErroDaApi(503, { mensagem: "Indisponível." }).message).toBe("Indisponível.");
  });
});

describe("a chamada HTTP lê X-Request-Id da resposta", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", armazenamento());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("500 com o cabeçalho: o erro lançado leva o código na mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        resposta(
          500,
          { erro: "erro_interno", mensagem: "Erro inesperado." },
          { "x-request-id": ID },
        ),
      ),
    );
    await expect(http.indicadores({} as never)).rejects.toMatchObject({
      status: 500,
      requisicao: ID,
      message: `Erro inesperado. Código de suporte: ${ID}.`,
    });
  });

  it("500 sem cabeçalho e com o id no corpo: o código vem do corpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        resposta(500, { erro: "erro_interno", mensagem: "Erro inesperado.", requisicao: ID }),
      ),
    );
    await expect(http.indicadores({} as never)).rejects.toMatchObject({
      status: 500,
      requisicao: ID,
    });
  });

  it("resposta de teste sem `headers` não quebra a leitura", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ erro: "erro_interno", mensagem: "Falha." }),
      })),
    );
    await expect(http.indicadores({} as never)).rejects.toMatchObject({
      status: 500,
      requisicao: null,
    });
  });
});

describe("erros globais do painel", () => {
  function alvoFalso() {
    const ouvintes: Record<string, (evento: never) => void> = {};
    const alvo = {
      addEventListener: (tipo: string, f: (evento: never) => void) => {
        ouvintes[tipo] = f;
      },
    } as unknown as AlvoDeErrosGlobais;
    return { alvo, ouvintes };
  }

  it("instala os dois ouvintes e manda cada erro para o reportador, com a origem certa", () => {
    const { alvo, ouvintes } = alvoFalso();
    const recebidos: Array<{ erro: unknown; origem: string }> = [];
    instalarErrosGlobais(alvo, {
      reportar: (erro, origem) => {
        recebidos.push({ erro, origem });
      },
    });
    expect(Object.keys(ouvintes).sort()).toEqual(["error", "unhandledrejection"]);

    const lancado = new Error("estourou");
    ouvintes["error"]!({ error: lancado, message: "estourou" } as never);
    ouvintes["unhandledrejection"]!({ reason: "promessa sem catch" } as never);
    expect(recebidos).toEqual([
      { erro: lancado, origem: "janela" },
      { erro: "promessa sem catch", origem: "promessa" },
    ]);
  });

  it("erro de script de outra origem (sem objeto) cai na mensagem", () => {
    const { alvo, ouvintes } = alvoFalso();
    const recebidos: unknown[] = [];
    instalarErrosGlobais(alvo, {
      reportar: (erro) => {
        recebidos.push(erro);
      },
    });
    ouvintes["error"]!({ error: null, message: "Script error." } as never);
    expect(recebidos).toEqual(["Script error."]);
  });

  it("o registro leva tipo, mensagem mascarada e código de suporte, e nada de pilha", () => {
    const erro = new http.ErroDaApi(
      500,
      { mensagem: "Falha ao salvar para maria@prefeitura.gov.br (11) 98888-7777." },
      ID,
    );
    const registro = descreverErroDoPainel(erro, "promessa");
    expect(registro).toEqual<RegistroDeErroDoPainel>({
      origem: "promessa",
      tipo: "ErroDaApi",
      mensagem: `Falha ao salvar para [email] [telefone]. Código de suporte: ${ID}.`,
      requisicao: ID,
    });
    expect(Object.keys(registro)).not.toContain("stack");
  });

  it("valor lançado que não é Error (objeto, número) não vaza o conteúdo", () => {
    const registro = descreverErroDoPainel({ senha: "senha-secreta-123" }, "janela");
    expect(JSON.stringify(registro)).not.toContain("senha-secreta-123");
    expect(registro.mensagem).toBe("");
  });

  it("reportadorDeConsole escreve uma única chamada console.error, sem rede", () => {
    const chamadas: unknown[][] = [];
    const reportador = reportadorDeConsole({
      error: (...a: unknown[]) => {
        chamadas.push(a);
      },
    });
    const rede = vi.fn();
    vi.stubGlobal("fetch", rede);
    reportador.reportar(new Error("x com a@b.org"), "janela");
    vi.unstubAllGlobals();
    expect(chamadas).toHaveLength(1);
    expect(JSON.stringify(chamadas)).not.toContain("a@b.org");
    expect(rede).not.toHaveBeenCalled();
  });
});
