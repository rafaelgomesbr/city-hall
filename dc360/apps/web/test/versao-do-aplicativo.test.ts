/**
 * O cabeçalho de versão do painel e o 426 (V2-F02-E06, parte 3B).
 *
 * O painel manda `x-app-version: painel/<build>` em todo pedido à API, só para
 * observabilidade. Nenhuma variável do Vite carrega hoje o número do build, e o
 * valor é `painel/desconhecido`. O 426 que chegasse ao painel mostra a frase do
 * corpo como qualquer recusa e não mexe na sessão: não renova, não apaga o
 * token e não avisa a tela de sessão morta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGEM = "https://api.exemplo.test";
const TOKENS = { acesso: "acesso-antigo", renovacao: "renovacao-antiga" };
const SESSAO = {} as never;
const CABECALHO = "painel/desconhecido";

function armazenamento(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => {
      dados.delete(chave);
    },
    setItem: (chave, valor) => {
      dados.set(chave, valor);
    },
  };
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", ORIGEM);
  vi.stubGlobal("sessionStorage", armazenamento());
  sessionStorage.setItem("dc360:tokens", JSON.stringify(TOKENS));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("o cabeçalho de versão do painel", () => {
  it("vai em todas as formas de pedido: chamada comum, renovação, downloads, sem sessão e saída", async () => {
    const pedidos: Array<{ url: string; cabecalhos: Record<string, string> }> = [];
    let pediuRenovacao = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (endereco: string, opcoes?: RequestInit) => {
        pedidos.push({
          url: endereco,
          cabecalhos: { ...(opcoes?.headers as Record<string, string>) },
        });
        if (endereco.endsWith("/auth/renovar")) {
          return resposta(200, { acesso: "acesso-novo", renovacao: "renovacao-nova" });
        }
        if (endereco.endsWith("/ocorrencias/indicadores/painel") && !pediuRenovacao) {
          pediuRenovacao = true;
          return resposta(401, { erro: "nao_autenticado", mensagem: "Token vencido." });
        }
        if (/\/documentos\/|\/documento$|\.csv\?|\.zip$/.test(endereco)) {
          return new Response(new Uint8Array([1, 2, 3]));
        }
        return resposta(200, {});
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:arquivo");
    const http = await import("../src/dados/http");

    await http.indicadores(SESSAO);
    await http.criarEquipe(SESSAO, "Equipe Alfa", "");
    await http.pedirRecuperacao("rita@exemplo.test");
    await http.abrirDocumento(SESSAO, "ocorrencia", "laudo");
    await http.baixarCsvDeOcorrencias(SESSAO, { de: "2026-10-01" });
    await http.baixarPacoteDeSaida(SESSAO);
    await http.abrirOficio(SESSAO, "oficio");
    await http.encerrarSessao();

    // As mesmas dez chamadas de `http-v1-e-categorias.test.ts`, todas com o cabeçalho.
    expect(pedidos).toHaveLength(10);
    for (const pedido of pedidos) {
      expect(pedido.url.startsWith(`${ORIGEM}/v1/`)).toBe(true);
      expect(pedido.cabecalhos["x-app-version"]).toBe(CABECALHO);
    }
    // Só aditivo: o token continua indo onde ia.
    const comToken = pedidos.filter((p) => !/\/auth\/(renovar|recuperar|sair)$/.test(p.url));
    for (const pedido of comToken) expect(pedido.cabecalhos["authorization"]).toMatch(/^Bearer /);
  });

  it("vai também nos downloads de quem está sem token guardado", async () => {
    sessionStorage.removeItem("dc360:tokens");
    const buscar = vi.fn(async () =>
      resposta(401, { erro: "nao_autenticado", mensagem: "Entre de novo." }),
    );
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.abrirDocumento(SESSAO, "ocorrencia", "laudo")).rejects.toMatchObject({
      status: 401,
    });

    const cabecalhos = (buscar.mock.calls[0] as unknown as [string, RequestInit])[1].headers;
    expect(cabecalhos).toEqual({ "x-app-version": CABECALHO });
  });
});

describe("o 426 no painel", () => {
  const RECUSA = {
    erro: "versao_do_aplicativo_antiga",
    mensagem: "Esta versão não é mais aceita. Recarregue a página.",
  };

  it("mostra a frase do corpo como qualquer erro, sem renovar e sem derrubar a sessão", async () => {
    const buscar = vi.fn(async () => resposta(426, RECUSA));
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.indicadores(SESSAO)).rejects.toMatchObject({
      name: "ErroDaApi",
      status: 426,
      codigo: "versao_do_aplicativo_antiga",
      message: RECUSA.mensagem,
    });

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(expirou).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("dc360:tokens")!)).toEqual(TOKENS);
    http.aoExpirar(null);
  });

  it("num download também: a frase do corpo, sem renovar", async () => {
    const buscar = vi.fn(async () => resposta(426, RECUSA));
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.abrirOficio(SESSAO, "oficio")).rejects.toMatchObject({
      status: 426,
      message: RECUSA.mensagem,
    });
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("dc360:tokens")!)).toEqual(TOKENS);
  });
});
