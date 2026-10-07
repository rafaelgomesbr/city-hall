import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "../src/dados/http";

/**
 * V2-F00-E18: a frase de rede quando o sinal cai ao apertar "Registrar".
 *
 * A checagem de duplicidade é um GET, e GET leva a frase de leitura ("Não foi
 * possível carregar esta tela"). Só que ela é o primeiro passo do envio do
 * formulário: quem apertou o botão precisa ler que o que preencheu não foi
 * enviado, e não que uma tela não carregou. A seção 19 de `fluxo-api.e2e.mjs`
 * prova o mesmo no navegador; aqui o `fetch` é trocado para travar a frase.
 */

function armazenamento(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() { return dados.size; },
    clear: () => dados.clear(),
    getItem: (k: string) => dados.get(k) ?? null,
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => { dados.delete(k); },
    setItem: (k: string, v: string) => { dados.set(k, v); },
  } as Storage;
}

const SESSAO = { id: "u", nome: "Helena", papel: "coordenador", organizacaoId: "o", organizacaoNome: "DC" } as never;

describe("Checagem de duplicidade sem rede", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", armazenamento());
    sessionStorage.setItem("dc360:tokens", JSON.stringify({ acesso: "acesso-1", renovacao: "renovacao-1" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("diz que o que foi preenchido não foi enviado, e não que a tela não carregou", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    const erro = await http.possiveisDuplicidades(SESSAO, "vendaval", "Rua Sem Sinal, 1").catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(http.SemConexao);
    expect((erro as Error).message).toBe(
      "Sem conexão com o servidor. O que você preencheu não foi enviado. Verifique o sinal e tente de novo.",
    );
    expect((erro as Error).message).not.toContain("carregar esta tela");
  });

  it("a recusa do servidor continua chegando como está, sem virar frase de rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ erro: "dados_invalidos", mensagem: "Endereço muito curto." }),
      { status: 422, headers: { "content-type": "application/json" } },
    )));

    const erro = await http.possiveisDuplicidades(SESSAO, "vendaval", "R").catch((e: unknown) => e);

    expect(erro).not.toBeInstanceOf(http.SemConexao);
    expect(erro).toBeInstanceOf(http.ErroDaApi);
  });

  it("com rede, devolve as candidatas", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ itens: [] }), { status: 200, headers: { "content-type": "application/json" } },
    )));

    await expect(http.possiveisDuplicidades(SESSAO, "vendaval", "Rua Sem Sinal, 1")).resolves.toEqual([]);
  });
});
