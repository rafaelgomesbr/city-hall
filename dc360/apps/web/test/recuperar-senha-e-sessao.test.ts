import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "../src/dados/http";

/**
 * V2-F00-E10: o link de redefinição aberto num navegador onde OUTRA pessoa
 * está com a sessão aberta.
 *
 * `App.tsx` deixa `/redefinir-senha` alcançável com sessão ativa de propósito
 * ("o link chega por email e pode ser aberto num navegador onde outra pessoa já
 * está logada"). O que ninguém conferia é o que o cliente HTTP faz nesse caso:
 *
 * 1. Mandava o token de acesso da sessão aberta junto com o pedido de
 *    redefinição, que é pedido de quem NÃO tem sessão.
 * 2. O link vencido volta 401 `sessao_encerrada`, o mesmo código de "sua sessão
 *    foi encerrada". Com token no pedido, o cliente tentava renovar (gastando o
 *    refresh da pessoa que estava logada) e, na segunda recusa, apagava os
 *    tokens e mandava a tela para a entrada com "sua sessão foi encerrada".
 *    Quem só abriu o link de outro colega perdia a própria sessão.
 *
 * A recuperação é pedido sem sessão: não leva token, não renova e não derruba
 * nada.
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

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status, headers: { "content-type": "application/json" },
  });
}

const LINK_VENCIDO = {
  erro: "sessao_encerrada",
  mensagem: "Este link de redefinição não vale mais. Peça um novo.",
};

describe("Recuperação de senha com outra sessão aberta no navegador", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", armazenamento());
    sessionStorage.setItem("dc360:tokens", JSON.stringify({ acesso: "da-outra-pessoa", renovacao: "refresh-dela" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    http.aoExpirar(null);
    http.aoRenovar(null);
  });

  it("o pedido de redefinição não leva o token da sessão aberta", async () => {
    const cabecalhos: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      cabecalhos.push(init.headers as Record<string, string>);
      return resposta(200, { mensagem: "Senha redefinida. Entre com a nova senha." });
    }));

    await http.redefinirSenha("token-do-link", "uma-senha-nova-bem-longa");
    await http.pedirRecuperacao("alguem@exemplo.gov.br");

    expect(cabecalhos).toHaveLength(2);
    for (const c of cabecalhos) expect(c["authorization"]).toBeUndefined();
  });

  it("link vencido (401 sessao_encerrada) não renova, não avisa a tela e não apaga a sessão aberta", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(url);
      return resposta(401, LINK_VENCIDO);
    }));
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.redefinirSenha("token-vencido", "uma-senha-nova-bem-longa"))
      .rejects.toMatchObject({ status: 401, codigo: "sessao_encerrada" });

    expect(chamadas.some((u) => u.endsWith("/auth/renovar")), "não gasta o refresh de quem está logado").toBe(false);
    expect(expirou).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dc360:tokens"), "a sessão da outra pessoa continua").not.toBeNull();
  });

  it("a leitura de 'a recuperação está ligada?' também não leva token e devolve só o interruptor", async () => {
    let cabecalho: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      cabecalho = init.headers as Record<string, string>;
      return resposta(200, { ativa: false });
    }));

    const r = await http.situacaoDaRecuperacao();
    expect(r).toEqual({ ativa: false });
    expect(cabecalho["authorization"]).toBeUndefined();
  });
});
