import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGEM = "https://api.exemplo.test";
const TOKENS = { acesso: "acesso-antigo", renovacao: "renovacao-antiga" };
const SESSAO = {} as never;

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

describe("A base versionada do painel", () => {
  it.each(["", "/", "///"])(
    "origem com sufixo '%s' usa /v1 sem barra duplicada",
    async (sufixo) => {
      vi.stubEnv("VITE_API_URL", `${ORIGEM}${sufixo}`);
      const buscar = vi.fn(async () => resposta(200, {}));
      vi.stubGlobal("fetch", buscar);
      const http = await import("../src/dados/http");

      await http.indicadores(SESSAO);

      expect(buscar.mock.calls).toHaveLength(1);
      expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
        `${ORIGEM}/v1/ocorrencias/indicadores/painel`,
      );
    },
  );

  it("origem vazia mantém /v1 relativo ao servidor do painel", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const buscar = vi.fn(async () => resposta(200, {}));
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await http.indicadores(SESSAO);

    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/v1/ocorrencias/indicadores/painel");
  });

  it("todas as formas de chamada usam /v1, inclusive os downloads, a renovação e a saída", async () => {
    const chamadas: string[] = [];
    let pediuRenovacao = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (endereco: string) => {
        chamadas.push(endereco);
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

    expect(chamadas).toEqual(
      [
        "/ocorrencias/indicadores/painel",
        "/auth/renovar",
        "/ocorrencias/indicadores/painel",
        "/equipes",
        "/auth/recuperar",
        "/documentos/ocorrencia/laudo",
        "/relatorios/ocorrencias.csv?de=2026-10-01",
        "/saida/pacote.zip",
        "/oficios/oficio/documento",
        "/auth/sair",
      ].map((caminho) => `${ORIGEM}/v1${caminho}`),
    );
  });

  it("endereços assinados devolvidos pela API são preservados sem /v1", async () => {
    const url = `${ORIGEM}/armazenamento/objeto?assinatura=segredo`;
    const urlPublica = `${ORIGEM}/publico/oficio/token-assinado`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (endereco: string) =>
        resposta(
          200,
          endereco.includes("/evidencias/")
            ? { itens: [{ id: "foto", url }] }
            : { url: urlPublica },
        ),
      ),
    );
    const http = await import("../src/dados/http");

    expect(await http.listarEvidencias(SESSAO, "ocorrencia")).toEqual([{ id: "foto", url }]);
    expect(await http.detalharOficio(SESSAO, "oficio")).toEqual({ url: urlPublica });
  });
});

describe("A renovação segue a categoria do erro", () => {
  it.each([
    ["sessao_encerrada", "reentrar"],
    ["credenciais", "reentrar"],
    ["senha_provisoria_vencida", "permanente"],
    ["dados_invalidos", "corrigir"],
    ["excesso_de_requisicoes", "aguardar"],
  ])("401 com código %s da categoria %s não tenta renovar", async (codigo) => {
    const mensagem = "A frase original do servidor.";
    const buscar = vi.fn(async () => resposta(401, { erro: codigo, mensagem }));
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.indicadores(SESSAO)).rejects.toMatchObject({
      status: 401,
      codigo,
      message: mensagem,
    });

    expect(buscar).toHaveBeenCalledTimes(1);
    if (codigo !== "sessao_encerrada") {
      expect(JSON.parse(sessionStorage.getItem("dc360:tokens")!)).toEqual(TOKENS);
    }
  });

  it("categoria aditiva do servidor decide mesmo com código desconhecido", async () => {
    const buscar = vi.fn(async () =>
      resposta(401, {
        erro: "codigo_novo",
        categoria: "aguardar",
        mensagem: "Aguarde e tente novamente.",
      }),
    );
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.indicadores(SESSAO)).rejects.toMatchObject({
      message: "Aguarde e tente novamente.",
    });

    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["sem corpo", null],
    ["JSON inválido", "<html>Falha</html>"],
    ["sem código", JSON.stringify({ mensagem: "Recusa sem código." })],
    ["código desconhecido", JSON.stringify({ erro: "codigo_novo", categoria: "inexistente" })],
    ["JSON nulo", "null"],
  ])("401 %s mantém a renovação antiga e repete com o token novo", async (_nome, corpo) => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(new Response(corpo, { status: 401 }))
      .mockResolvedValueOnce(resposta(200, { acesso: "acesso-novo", renovacao: "renovacao-nova" }))
      .mockResolvedValueOnce(resposta(200, { total: 1 }));
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.indicadores(SESSAO)).resolves.toEqual({ total: 1 });

    expect(buscar.mock.calls.map(([endereco]) => endereco)).toEqual([
      `${ORIGEM}/v1/ocorrencias/indicadores/painel`,
      `${ORIGEM}/v1/auth/renovar`,
      `${ORIGEM}/v1/ocorrencias/indicadores/painel`,
    ]);
    expect(buscar.mock.calls[2]![1].headers.authorization).toBe("Bearer acesso-novo");
  });

  it("403 assinatura (categoria renovar, mas pede endereço novo) não gasta a renovação da sessão", async () => {
    const buscar = vi.fn(async () =>
      resposta(403, { erro: "assinatura", mensagem: "Endereço vencido." }),
    );
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.indicadores(SESSAO)).rejects.toMatchObject({
      status: 403,
      message: "Endereço vencido.",
    });

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("dc360:tokens")!)).toEqual(TOKENS);
  });

  it("a segunda recusa depois da renovação não renova de novo (uma vez só)", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(resposta(401, { erro: "nao_autenticado", mensagem: "Token vencido." }))
      .mockResolvedValueOnce(resposta(200, { acesso: "acesso-novo", renovacao: "renovacao-nova" }))
      .mockResolvedValueOnce(
        resposta(401, { erro: "nao_autenticado", mensagem: "Ainda vencido." }),
      );
    vi.stubGlobal("fetch", buscar);
    const http = await import("../src/dados/http");

    await expect(http.indicadores(SESSAO)).rejects.toMatchObject({ status: 401 });

    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it.each([400, 403, 429, 503])(
    "status %s sem código usa o padrão sem tentar renovar",
    async (status) => {
      const buscar = vi.fn(async () => resposta(status, { mensagem: "Frase preservada." }));
      vi.stubGlobal("fetch", buscar);
      const http = await import("../src/dados/http");

      await expect(http.indicadores(SESSAO)).rejects.toMatchObject({
        status,
        message: "Frase preservada.",
      });

      expect(buscar).toHaveBeenCalledTimes(1);
    },
  );
});
