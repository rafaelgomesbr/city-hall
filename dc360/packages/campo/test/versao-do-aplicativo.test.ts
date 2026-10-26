/**
 * Versão do aplicativo no transporte e o 426 na fila (V2-F02-E06, parte 3B).
 *
 * Duas promessas:
 *
 * 1. Todo pedido à API leva `x-app-version: campo/<versão>`, com a versão
 *    recebida por PARÂMETRO (o pacote não conhece o Expo). A URL assinada do
 *    armazenamento não fala com a API e não leva o cabeçalho: os cabeçalhos
 *    dela entram na assinatura.
 * 2. O 426 `versao_do_aplicativo_antiga` entra na classe de falha que a
 *    V2-F00-E06 criou para `conta_desativada` (`FalhaDeSessao`): a fila PAUSA
 *    e o item PERMANECE pendente, com a mesma contagem de tentativas. Nada
 *    some, nada vira bloqueado com "Descartar" ao lado, e a renovação do token
 *    não é gasta. Antes desta etapa o 426 caía em "outro 4xx" e a coleta
 *    virava `bloqueado`.
 *
 * O status decide primeiro (426 é sempre "o aplicativo está velho", nunca "o
 * dado está errado"), e por isso qualquer 426 pausa, com ou sem código.
 */
import { describe, expect, it, vi } from "vitest";
import type { DevolucaoDeTarefa, EnvelopeSincronizacao } from "@dc360/shared";
import type { DevolucaoSemAutor } from "../src/index.js";
import {
  FalhaDeSessao,
  FalhaPermanente,
  FalhaTemporaria,
  cabecalhosDaVersao,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
  type ObterToken,
} from "../src/index.js";

const MOMENTO = new Date("2026-10-26T14:00:00.000Z");
const AUTOR = { usuarioId: "agente-ana", nome: "Ana Ribeiro", organizacaoId: "serra-alta" };
const CHAVES = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERSAO = "1.2.0";
const CABECALHO = `campo/${VERSAO}`;
const RECUSA_426 = {
  erro: "versao_do_aplicativo_antiga",
  mensagem: "Atualize o aplicativo para continuar.",
  versaoMinima: "1.3.0",
};

function envelope(chave = CHAVES[0]!): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: OCORRENCIA,
    coletadaEm: MOMENTO.toISOString(),
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Moradora",
      assinaturaChave: "assinatura.png",
      coletadaEm: MOMENTO.toISOString(),
    },
  };
}

function devolucao(chave = CHAVES[2]!): DevolucaoSemAutor {
  return {
    idempotencyKey: chave,
    ocorrenciaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    decididaEm: MOMENTO.toISOString(),
    motivo: "morador_ausente",
  };
}

/** A devolução como o transporte a recebe: com quem devolveu. */
function devolucaoComAutor(): DevolucaoDeTarefa {
  return { ...devolucao(), devolvidaPor: AUTOR.usuarioId };
}

function resposta(status: number, corpo: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function montar(respostas: Response[], versaoDoAplicativo: string | null = VERSAO) {
  const buscar = vi.fn(async (_url: string, _opcoes?: RequestInit) => {
    const proxima = respostas.shift();
    if (!proxima) throw new Error("Pedido além do previsto no teste.");
    return proxima;
  });
  const obterToken = vi.fn<ObterToken>(async (pedido) =>
    pedido?.renovarJa ? "token-novo" : "token-atual",
  );
  const transporte = transporteHttp({
    baseUrl: "https://api.exemplo/v1",
    obterToken,
    buscar: buscar as typeof fetch,
    ...(versaoDoAplicativo === null ? {} : { versaoDoAplicativo }),
  });
  const deposito = depositoSobreChaveValor(lojaEmMemoria());
  const remover = vi.spyOn(deposito, "remover");
  let instante = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito,
    transporte,
    sessaoAtual: () => AUTOR,
    agora: () => new Date(instante),
    ruido: () => 0.5,
  });
  return {
    transporte,
    fila,
    deposito,
    remover,
    buscar,
    obterToken,
    avancar: () => {
      instante += 600_000;
    },
  };
}

function cabecalhosDoPedido(buscar: ReturnType<typeof montar>["buscar"], n: number) {
  return (buscar.mock.calls[n]?.[1]?.headers ?? {}) as Record<string, string>;
}

describe("o cabeçalho de versão", () => {
  it("monta campo/<versão> e some quando a versão não é conhecida", () => {
    expect(cabecalhosDaVersao("1.4.0")).toEqual({ "x-app-version": "campo/1.4.0" });
    expect(cabecalhosDaVersao(" 1.4.0 ")).toEqual({ "x-app-version": "campo/1.4.0" });
    expect(cabecalhosDaVersao("")).toEqual({});
    expect(cabecalhosDaVersao("   ")).toEqual({});
    expect(cabecalhosDaVersao(null)).toEqual({});
    expect(cabecalhosDaVersao(undefined)).toEqual({});
  });

  it("vai em todo pedido à API: vistoria, autorização e confirmação de foto, devolução", async () => {
    const { transporte, buscar } = montar([
      resposta(201, { vistoriaId: "v" }),
      resposta(200, { evidenciaId: "e", chave: "c", url: "u", cabecalhos: {}, jaEnviada: false }),
      resposta(200),
      resposta(200, { duplicada: false }),
    ]);

    await transporte.enviar(envelope());
    await transporte.autorizarFoto({
      ocorrenciaId: OCORRENCIA,
      foto: { idempotencyKey: CHAVES[1]!, tipoConteudo: "image/jpeg", tamanhoBytes: 10 } as never,
      coletadaPor: AUTOR.usuarioId,
    } as never);
    await transporte.confirmarFoto("e");
    await transporte.devolver(devolucaoComAutor());

    expect(buscar).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++) {
      const cabecalhos = cabecalhosDoPedido(buscar, i);
      expect(cabecalhos["x-app-version"]).toBe(CABECALHO);
      // O cabeçalho é só aditivo: o que já ia continua indo.
      expect(cabecalhos["authorization"]).toMatch(/^Bearer /);
      expect(cabecalhos["content-type"]).toBe("application/json");
    }
  });

  it("vai também no pedido repetido depois da renovação do 401", async () => {
    const { transporte, buscar } = montar([
      resposta(401, { erro: "nao_autenticado" }),
      resposta(201, { vistoriaId: "v" }),
    ]);

    await transporte.enviar(envelope());

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(cabecalhosDoPedido(buscar, 0)["x-app-version"]).toBe(CABECALHO);
    expect(cabecalhosDoPedido(buscar, 1)["x-app-version"]).toBe(CABECALHO);
    expect(cabecalhosDoPedido(buscar, 1)["authorization"]).toBe("Bearer token-novo");
  });

  it("não vai na URL assinada do armazenamento, que recebe exatamente os cabeçalhos assinados", async () => {
    const { transporte, buscar } = montar([resposta(200)]);
    const url = "https://api.exemplo/armazenamento/objeto?assinatura=teste";

    await transporte.enviarBytes(url, { "content-type": "image/jpeg" }, new Uint8Array([1]));

    expect(buscar.mock.calls[0]?.[0]).toBe(url);
    expect(buscar.mock.calls[0]?.[1]?.headers).toEqual({ "content-type": "image/jpeg" });
  });

  it("sem versão informada o pedido sai como antes, sem o cabeçalho", async () => {
    const { transporte, buscar } = montar([resposta(201, { vistoriaId: "v" })], null);

    await transporte.enviar(envelope());

    expect(cabecalhosDoPedido(buscar, 0)).toEqual({
      "content-type": "application/json",
      authorization: "Bearer token-atual",
    });
  });
});

describe("426: a fila pausa e o item permanece", () => {
  it("426 em POST /sincronizacao/vistoria mantém o item pendente e pausa a fila", async () => {
    const { fila, deposito, remover, buscar, obterToken } = montar([resposta(426, RECUSA_426)]);
    for (const chave of CHAVES.slice(0, 2)) {
      await fila.enfileirar(envelope(chave), { protocolo: "000001/2026", fotos: [] });
    }
    const antes = await deposito.listar();

    const r = await fila.drenar();

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0]?.[0]).toBe("https://api.exemplo/v1/sincronizacao/vistoria");
    expect(r.paradaPor).toBe("versao_do_aplicativo_antiga");
    expect(r.interrompido).toBe(true);
    expect(r.bloqueados).toBe(0);
    expect(r.enviados).toBe(0);

    const depois = await deposito.listar();
    expect(depois).toHaveLength(2);
    for (const item of depois) {
      const original = antes.find((i) => i.id === item.id)!;
      expect(item.estado).toBe("pendente");
      expect(item.tentativas).toBe(original.tentativas);
      expect(item.ultimaFalha ?? null).toBeNull();
      expect(item.envelope).toEqual(original.envelope);
    }
    expect(remover).not.toHaveBeenCalled();
    // Sem renovação: o 426 não é da sessão, e o token de renovação é rotativo.
    expect(obterToken).not.toHaveBeenCalledWith({ renovarJa: true });

    const resumo = await fila.resumo();
    expect(resumo.pausadaPor).toBe("versao_do_aplicativo_antiga");
    expect(resumo.bloqueados).toBe(0);
    expect(resumo.pendentes).toBe(2);
  });

  it("depois de atualizar, as mesmas coletas sobem com as mesmas chaves e nada se perde", async () => {
    const { fila, deposito, buscar, avancar } = montar([
      resposta(426, RECUSA_426),
      resposta(201, { vistoriaId: "v1" }),
      resposta(201, { vistoriaId: "v2" }),
    ]);
    for (const chave of CHAVES.slice(0, 2)) {
      await fila.enfileirar(envelope(chave), { protocolo: "000001/2026", fotos: [] });
    }

    expect((await fila.drenar()).paradaPor).toBe("versao_do_aplicativo_antiga");
    avancar();
    const r = await fila.drenar();

    expect(r.paradaPor).toBeUndefined();
    expect(r.enviados).toBe(2);
    const enviados = buscar.mock.calls
      .slice(1)
      .map((c) => (JSON.parse(c[1]?.body as string) as { idempotencyKey: string }).idempotencyKey);
    expect(enviados).toEqual(CHAVES.slice(0, 2));
    expect((await fila.resumo()).pausadaPor).toBeNull();
    expect((await deposito.listar()).every((i) => i.estado === "confirmado")).toBe(true);
  });

  it("426 na devolução também pausa e mantém a devolução pendente", async () => {
    const { fila, deposito, remover } = montar([resposta(426, RECUSA_426)]);
    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("versao_do_aplicativo_antiga");
    const [item] = await deposito.listar();
    expect(item?.tipo).toBe("devolucao");
    expect(item?.estado).toBe("pendente");
    expect(item?.tentativas).toBe(0);
    expect(remover).not.toHaveBeenCalled();
  });

  it.each([
    ["com o código do catálogo", RECUSA_426],
    ["sem corpo", null],
    ["com código desconhecido", { erro: "codigo_novo", mensagem: "Outra frase." }],
  ])(
    "426 %s em qualquer rota da fila vira FalhaDeSessao, nunca FalhaPermanente",
    async (_nome, corpo) => {
      for (const chamar of [
        (t: ReturnType<typeof montar>["transporte"]) => t.enviar(envelope()),
        (t: ReturnType<typeof montar>["transporte"]) => t.confirmarFoto("e"),
        (t: ReturnType<typeof montar>["transporte"]) => t.devolver(devolucaoComAutor()),
        (t: ReturnType<typeof montar>["transporte"]) =>
          t.autorizarFoto({
            ocorrenciaId: OCORRENCIA,
            foto: {
              idempotencyKey: CHAVES[1]!,
              tipoConteudo: "image/jpeg",
              tamanhoBytes: 10,
            } as never,
            coletadaPor: AUTOR.usuarioId,
          } as never),
      ]) {
        const { transporte, obterToken } = montar([resposta(426, corpo)]);
        const erro = await chamar(transporte).catch((e: unknown) => e);
        expect(erro).toBeInstanceOf(FalhaDeSessao);
        expect(erro).not.toBeInstanceOf(FalhaPermanente);
        expect((erro as FalhaDeSessao).motivo).toBe("versao_do_aplicativo_antiga");
        expect((erro as Error).message.length).toBeGreaterThan(0);
        expect(obterToken).not.toHaveBeenCalledWith({ renovarJa: true });
      }
    },
  );

  it("a frase do servidor vai junto da falha quando veio", async () => {
    const { transporte } = montar([resposta(426, RECUSA_426)]);
    await expect(transporte.enviar(envelope())).rejects.toMatchObject({
      motivo: "versao_do_aplicativo_antiga",
      message: RECUSA_426.mensagem,
    });
  });

  it("o PUT na URL assinada não conhece 426: segue a regra do armazenamento", async () => {
    const { transporte } = montar([resposta(426)]);
    await expect(
      transporte.enviarBytes("https://arquivos.exemplo/foto?assinatura=x", {}, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(FalhaPermanente);
  });
});

describe("não regressão com o cabeçalho presente (tabela da parte 2B)", () => {
  it("401 nao_autenticado renova uma vez e, recusado de novo, pausa como sessão encerrada", async () => {
    const { fila, deposito, obterToken } = montar([
      resposta(401, { erro: "nao_autenticado" }),
      resposta(401, { erro: "nao_autenticado" }),
    ]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    expect(obterToken).toHaveBeenCalledWith({ renovarJa: true });
    expect((await deposito.listar())[0]?.estado).toBe("pendente");
  });

  it("409 continua bloqueando só o item, com o código", async () => {
    const { fila, deposito } = montar([
      resposta(409, { erro: "autor_divergente", mensagem: "Coleta de outra pessoa." }),
    ]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });

    const r = await fila.drenar();

    expect(r.paradaPor).toBeUndefined();
    expect(r.bloqueados).toBe(1);
    const [item] = await deposito.listar();
    expect(item?.estado).toBe("bloqueado");
    expect(item?.ultimaFalha?.codigo).toBe("autor_divergente");
  });

  it.each([500, 502, 503, 429])(
    "%i continua temporário: item pendente e adiado",
    async (status) => {
      const { fila, deposito, transporte } = montar([resposta(status), resposta(status)]);
      await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });

      const r = await fila.drenar();

      expect(r.paradaPor).toBeUndefined();
      expect(r.adiados).toBe(1);
      const [item] = await deposito.listar();
      expect(item?.estado).toBe("pendente");
      expect(item?.tentativas).toBe(1);
      await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaTemporaria);
    },
  );
});

describe("depois do 426 o token é pedido sem renovação antecipada (correção 1)", () => {
  it("o pedido seguinte a um 426 leva semRenovar; a primeira resposta que não é 426 desfaz", async () => {
    const { transporte, obterToken } = montar([
      resposta(426, RECUSA_426),
      resposta(426, RECUSA_426),
      resposta(201, { vistoriaId: "v" }),
      resposta(201, { vistoriaId: "v" }),
    ]);

    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaDeSessao);
    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaDeSessao);
    await transporte.enviar(envelope());
    await transporte.enviar(envelope());

    expect(obterToken.mock.calls.map((c) => c[0])).toEqual([
      undefined,
      { semRenovar: true },
      { semRenovar: true },
      undefined,
    ]);
  });

  it("falha de rede não diz nada sobre a versão: a suspensão continua", async () => {
    const buscar = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resposta(426, RECUSA_426))
      .mockRejectedValueOnce(new TypeError("sem rede"))
      .mockResolvedValueOnce(resposta(201, { vistoriaId: "v" }));
    const obterToken = vi.fn<ObterToken>(async () => "token-atual");
    const transporte = transporteHttp({ baseUrl: "https://api.exemplo/v1", obterToken, buscar });

    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaDeSessao);
    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaTemporaria);
    await transporte.enviar(envelope());

    expect(obterToken.mock.calls.map((c) => c[0])).toEqual([
      undefined,
      { semRenovar: true },
      { semRenovar: true },
    ]);
  });

  it("o PUT da URL assinada não mexe na suspensão", async () => {
    const { transporte, obterToken } = montar([
      resposta(426, RECUSA_426),
      resposta(200),
      resposta(201, { vistoriaId: "v" }),
    ]);

    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaDeSessao);
    await transporte.enviarBytes(
      "https://arquivos.exemplo/foto?assinatura=x",
      {},
      new Uint8Array([1]),
    );
    await transporte.enviar(envelope());

    expect(obterToken.mock.calls[1]?.[0]).toEqual({ semRenovar: true });
  });
});
