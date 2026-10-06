import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "../src/dados/http";

/**
 * V2-F00-E11: o cliente do botão "Baixar pacote de saída".
 *
 * Dois defeitos juntos, e nenhum teste enxergava nenhum dos dois:
 *
 * 1. O cliente chamava `/pacote.zip`, e a rota registrada é `/saida/pacote.zip`
 *    (o prefixo é de `servidor.ts`). Todo clique terminava em 404. O teste da
 *    API chamava a rota certa direto, então a API estava "provada" e o botão
 *    nunca tinha baixado nada.
 * 2. Era um `fetch` solto: um token de acesso vencido (15 minutos) respondia 401
 *    e a pessoa lia o erro cru, em vez de o painel renovar e repetir como faz
 *    em toda outra chamada.
 *
 * A prova de navegador, contra a API real, é a seção 28 de `fluxo-api.e2e.mjs`.
 * Aqui o `fetch` é trocado para conferir o que o cliente MANDA e como reage a
 * cada resposta.
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

const json = (status: number, corpo: unknown): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const zip = (): Response =>
  new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]), {
    status: 200, headers: { "content-type": "application/zip" },
  });

const SESSAO = { id: "u", nome: "Rita", papel: "administrador", organizacaoId: "o", organizacaoNome: "DC" } as never;

type Chamada = { url: string; metodo: string; autorizacao: string | undefined };

function simular(respostas: Array<(chamada: Chamada) => Response | Promise<Response>>) {
  const chamadas: Chamada[] = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const chamada: Chamada = {
      url,
      metodo: init.method ?? "GET",
      autorizacao: (init.headers as Record<string, string> | undefined)?.["authorization"],
    };
    chamadas.push(chamada);
    const faz = respostas[Math.min(i, respostas.length - 1)]!;
    i += 1;
    return faz(chamada);
  }));
  return chamadas;
}

describe("Baixar o pacote de saída", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", armazenamento());
    sessionStorage.setItem("dc360:tokens", JSON.stringify({ acesso: "acesso-1", renovacao: "renovacao-1" }));
    // `URL.createObjectURL` existe no Node, mas o valor não importa aqui.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pacote");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    http.aoExpirar(null);
  });

  it("chama POST /saida/pacote.zip com o token, e entrega o endereço e o nome do arquivo", async () => {
    const chamadas = simular([() => zip()]);

    const { url, nome } = await http.baixarPacoteDeSaida(SESSAO);

    expect(chamadas).toHaveLength(1);
    // O defeito: `/pacote.zip`. O caminho certo termina em `/saida/pacote.zip`.
    expect(chamadas[0]!.url.endsWith("/saida/pacote.zip")).toBe(true);
    expect(chamadas[0]!.url.endsWith("//pacote.zip")).toBe(false);
    expect(chamadas[0]!.metodo).toBe("POST");
    expect(chamadas[0]!.autorizacao).toBe("Bearer acesso-1");
    expect(url).toBe("blob:pacote");
    expect(nome).toMatch(/^dc360-pacote-de-saida-\d{4}-\d{2}-\d{2}\.zip$/);
    // O conteúdo baixado é o corpo da resposta, byte a byte.
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]));
  });

  it("401 no primeiro pedido renova o token UMA vez e baixa com o token novo", async () => {
    const chamadas = simular([
      () => json(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." }),
      () => json(200, { acesso: "acesso-2", renovacao: "renovacao-2", usuario: { papel: "administrador", nome: "Rita" } }),
      () => zip(),
    ]);

    const { url } = await http.baixarPacoteDeSaida(SESSAO);

    expect(url).toBe("blob:pacote");
    expect(chamadas.map((c) => c.url.split("/").slice(-2).join("/"))).toEqual(["saida/pacote.zip", "auth/renovar", "saida/pacote.zip"]);
    expect(chamadas[0]!.autorizacao).toBe("Bearer acesso-1");
    expect(chamadas[2]!.autorizacao, "o repetido leva o token novo").toBe("Bearer acesso-2");
    expect(JSON.parse(sessionStorage.getItem("dc360:tokens")!).acesso).toBe("acesso-2");
  });

  it("se renovar não adianta, para: uma renovação, um pedido repetido, e a tela é avisada da sessão", async () => {
    const chamadas = simular([
      () => json(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." }),
      () => json(401, { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente." }),
    ]);
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.baixarPacoteDeSaida(SESSAO)).rejects.toMatchObject({ status: 401 });

    // Pedido, renovação que falha. Sem terceiro pedido e sem laço.
    expect(chamadas).toHaveLength(2);
    expect(expirou).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("dc360:tokens")).toBeNull();
  });

  it("403 sem permissão: a frase do servidor chega à tela, e a sessão continua", async () => {
    const frase = "Seu perfil não tem permissão para alterar os dados do município.";
    const chamadas = simular([() => json(403, { erro: "sem_permissao", mensagem: frase })]);
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.baixarPacoteDeSaida(SESSAO)).rejects.toMatchObject({
      name: "ErroDaApi", status: 403, codigo: "sem_permissao", message: frase,
    });

    expect(chamadas).toHaveLength(1);
    expect(expirou).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dc360:tokens")).not.toBeNull();
  });

  it("município suspenso: a frase de contrato chega à tela, sem derrubar a sessão", async () => {
    const frase = "O acesso deste município ao sistema foi suspenso pelo fornecedor. "
      + "Procure quem administra o contrato na sua prefeitura.";
    simular([() => json(403, { erro: "acesso_suspenso", mensagem: frase })]);
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.baixarPacoteDeSaida(SESSAO)).rejects.toMatchObject({
      status: 403, codigo: "acesso_suspenso", message: frase,
    });
    expect(expirou).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dc360:tokens")).not.toBeNull();
  });

  it("sem rede: a frase diz que o ARQUIVO não foi baixado, e não que algo preenchido não foi enviado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    const erro = await http.baixarPacoteDeSaida(SESSAO).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(http.SemConexao);
    expect((erro as Error).message).toBe(
      "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo.",
    );
    expect((erro as Error).message).not.toContain("preencheu");
  });

  it("a conexão que cai no MEIO do arquivo também vira a frase de rede, e não 'Failed to fetch'", async () => {
    const corpoQueCai = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array([1, 2, 3])); },
      pull() { throw new TypeError("network error"); },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(corpoQueCai, {
      status: 200, headers: { "content-type": "application/zip" },
    })));

    const erro = await http.baixarPacoteDeSaida(SESSAO).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(http.SemConexao);
    expect((erro as Error).message).toContain("O arquivo não foi baixado");
  });
});
