import { describe, expect, it, vi } from "vitest";
import type { DevolucaoDeTarefa, EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaDeSessao,
  FalhaPermanente,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
  type Arquivos,
  type AutorDaColeta,
  type FotoLocal,
  type ObterToken,
  type Transporte,
} from "../src/index.js";

/**
 * A fila e o transporte diante de 401 e 403 de SESSÃO (V2-F00-E06).
 *
 * O que estes testes protegem é uma frase só: a vistoria feita no morro não
 * vira "recusada" porque a sessão do agente caiu, ou porque a conta dele foi
 * desativada depois de ele sair. Antes desta etapa, `transporte.ts` lia 401 e
 * 403 como `FalhaPermanente`, a fila bloqueava o item e ao lado do cartão
 * ficava o botão "Descartar".
 *
 * Os três códigos vêm do catálogo de `@dc360/shared` (`codigos-de-erro.ts`):
 * 401 `nao_autenticado` (renova e repete, uma vez), 401 `sessao_encerrada` e
 * 403 `conta_desativada` (a fila para e guarda). 403 `sem_permissao` continua
 * recusa do dado, e continua bloqueando.
 */

const MOMENTO = new Date("2026-10-06T14:00:00.000Z");
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE_A = "11111111-1111-4111-8111-111111111111";
const CHAVE_B = "22222222-2222-4222-8222-222222222222";
const CHAVE_C = "33333333-3333-4333-8333-333333333333";

const AGENTE_A: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};
const AGENTE_B: AutorDaColeta = {
  usuarioId: "u-bruno", nome: "Bruno Lima", organizacaoId: "org-serra-alta",
};

function envelope(chave: string, ocorrencia = OCORRENCIA): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: ocorrencia,
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

function transporteFalso(parcial: Partial<Transporte>): Transporte {
  return {
    enviar: async () => ({ vistoriaId: "v", duplicada: false }),
    devolver: async () => { throw new Error("devolver nao esperado neste teste"); },
    autorizarFoto: async () => { throw new Error("autorizarFoto nao esperado neste teste"); },
    enviarBytes: async () => { throw new Error("enviarBytes nao esperado neste teste"); },
    confirmarFoto: async () => { throw new Error("confirmarFoto nao esperado neste teste"); },
    ...parcial,
  };
}

function montar(
  transporte: Partial<Transporte>,
  extras: Partial<Parameters<typeof criarFilaDeSincronizacao>[0]> = {},
) {
  const loja = lojaEmMemoria();
  const sessao = { atual: AGENTE_A as AutorDaColeta | null };
  let agora = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte: transporteFalso(transporte),
    sessaoAtual: () => sessao.atual,
    agora: () => new Date(agora),
    dormir: async () => undefined,
    ruido: () => 0.5,
    ...extras,
  });
  return { fila, sessao, avancar: (ms: number) => { agora += ms; } };
}

/** Uma resposta HTTP mínima, do tamanho que `transporteHttp` lê. */
function resposta(status: number, corpo: Record<string, unknown> = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

const NAO_AUTENTICADO = { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." };
const SESSAO_ENCERRADA = { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada." };
const CONTA_DESATIVADA = { erro: "conta_desativada", mensagem: "Sua conta foi desativada." };

describe("Transporte HTTP: os três códigos", () => {
  function transporteCom(
    respostas: Response[],
    token: { primeiro: string | null; renovado?: string | null } = { primeiro: "token-velho", renovado: "token-novo" },
  ) {
    const buscar = vi.fn(async () => {
      const r = respostas.shift();
      if (!r) throw new Error("fetch chamado a mais do que o esperado");
      return r;
    });
    const pedidos: Array<{ renovarJa?: boolean } | undefined> = [];
    const obterToken: ObterToken = async (pedido) => {
      pedidos.push(pedido);
      return pedido?.renovarJa ? (token.renovado ?? null) : token.primeiro;
    };
    return {
      buscar, pedidos,
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken,
        buscar: buscar as unknown as typeof fetch,
      }),
    };
  }

  const autorizacoes = (buscar: ReturnType<typeof vi.fn>) =>
    buscar.mock.calls.map((c) =>
      ((c as unknown as [string, RequestInit])[1].headers as Record<string, string>)["authorization"]);

  it("401 nao_autenticado: pede token novo UMA vez, repete o pedido e envia", async () => {
    const { transporte, buscar, pedidos } = transporteCom([
      resposta(401, NAO_AUTENTICADO),
      resposta(201, { vistoriaId: "v1", duplicada: false }),
    ]);

    const recibo = await transporte.enviar(envelope(CHAVE_A));

    expect(recibo).toEqual({ vistoriaId: "v1", duplicada: false });
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(autorizacoes(buscar)).toEqual(["Bearer token-velho", "Bearer token-novo"]);
    expect(pedidos.filter((p) => p?.renovarJa)).toHaveLength(1);
  });

  it("o pedido repetido leva a MESMA chave de idempotência", async () => {
    const { transporte, buscar } = transporteCom([
      resposta(401, NAO_AUTENTICADO),
      resposta(201, { vistoriaId: "v1", duplicada: false }),
    ]);

    await transporte.enviar(envelope(CHAVE_A));

    const corpos = buscar.mock.calls.map((c) =>
      JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).idempotencyKey);
    expect(corpos).toEqual([CHAVE_A, CHAVE_A]);
  });

  it("401 nao_autenticado de novo depois da renovação vira sessao_encerrada, sem laço", async () => {
    const { transporte, buscar, pedidos } = transporteCom([
      resposta(401, NAO_AUTENTICADO),
      resposta(401, NAO_AUTENTICADO),
    ]);

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect((erro as FalhaDeSessao).motivo).toBe("sessao_encerrada");
    // Duas idas ao servidor e uma renovação: nunca uma terceira.
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(pedidos.filter((p) => p?.renovarJa)).toHaveLength(1);
  });

  it("se a renovação devolve o MESMO token (piso, renovação recusada), nem repete o pedido", async () => {
    const { transporte, buscar } = transporteCom(
      [resposta(401, NAO_AUTENTICADO)],
      { primeiro: "token-velho", renovado: "token-velho" },
    );

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("401 sem código nenhum (servidor antigo, corpo vazio) segue o caminho do nao_autenticado", async () => {
    const { transporte, buscar } = transporteCom([
      resposta(401, {}),
      resposta(201, { vistoriaId: "v1", duplicada: false }),
    ]);

    await expect(transporte.enviar(envelope(CHAVE_A))).resolves.toMatchObject({ vistoriaId: "v1" });
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("401 sessao_encerrada: não gasta a renovação, que o servidor já encerrou", async () => {
    const { transporte, buscar, pedidos } = transporteCom([resposta(401, SESSAO_ENCERRADA)]);

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect((erro as FalhaDeSessao).motivo).toBe("sessao_encerrada");
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(pedidos.some((p) => p?.renovarJa)).toBe(false);
  });

  it("403 conta_desativada vira FalhaDeSessao, com a frase do servidor", async () => {
    const { transporte, pedidos } = transporteCom([resposta(403, CONTA_DESATIVADA)]);

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect((erro as FalhaDeSessao).motivo).toBe("conta_desativada");
    expect((erro as FalhaDeSessao).message).toBe("Sua conta foi desativada.");
    // Entrar de novo (e renovar) não resolve conta desativada: nem tenta.
    expect(pedidos.some((p) => p?.renovarJa)).toBe(false);
  });

  it("renovação recusada por conta desativada (o obtentor lança): o envio para como conta_desativada, sem repetir o pedido", async () => {
    // Correção 1 da E05: o 401 nao_autenticado do token vencido não pode virar
    // "entre de novo" quando a renovação já disse que a conta foi desativada.
    const buscar = vi.fn(async () => resposta(401, NAO_AUTENTICADO));
    const obterToken: ObterToken = async (pedido) => {
      if (pedido?.renovarJa) throw new FalhaDeSessao("Sua conta foi desativada.", "conta_desativada");
      return "token-velho";
    };
    const transporte = transporteHttp({
      baseUrl: "http://api.exemplo", obterToken, buscar: buscar as unknown as typeof fetch,
    });

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect((erro as FalhaDeSessao).motivo).toBe("conta_desativada");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("a falha de sessão NÃO é permanente nem temporária: a fila decide por isso", async () => {
    const { transporte } = transporteCom([resposta(403, CONTA_DESATIVADA)]);
    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).not.toBeInstanceOf(FalhaPermanente);
    expect(erro).not.toBeInstanceOf(FalhaTemporaria);
  });

  it("403 sem_permissao continua sendo recusa permanente", async () => {
    const { transporte } = transporteCom([
      resposta(403, { erro: "sem_permissao", mensagem: "Seu perfil não tem permissão." }),
    ]);

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaPermanente);
    expect((erro as FalhaPermanente).codigo).toBe("sem_permissao");
  });

  it("403 sem código também continua permanente (só o código desativa a conta)", async () => {
    const { transporte } = transporteCom([resposta(403, {})]);
    await expect(transporte.enviar(envelope(CHAVE_A))).rejects.toBeInstanceOf(FalhaPermanente);
  });

  it("sem token vira FalhaDeSessao e não FalhaPermanente, e nem sai pela rede", async () => {
    const { transporte, buscar } = transporteCom([], { primeiro: null });

    const erro = await transporte.enviar(envelope(CHAVE_A)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaDeSessao);
    expect(erro).not.toBeInstanceOf(FalhaPermanente);
    expect((erro as FalhaDeSessao).motivo).toBe("sessao_encerrada");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("as outras rotas da API (foto, devolução) leem os três códigos igual", async () => {
    const devolucao: DevolucaoDeTarefa = {
      idempotencyKey: CHAVE_A, ocorrenciaId: OCORRENCIA,
      decididaEm: MOMENTO.toISOString(), motivo: "morador_ausente", devolvidaPor: "u-ana",
    };
    const { transporte } = transporteCom([
      resposta(403, CONTA_DESATIVADA),
      resposta(401, SESSAO_ENCERRADA),
    ]);

    const a = await transporte.devolver(devolucao).catch((e: unknown) => e);
    const b = await transporte.confirmarFoto("ev-1").catch((e: unknown) => e);

    expect(a).toBeInstanceOf(FalhaDeSessao);
    expect((a as FalhaDeSessao).motivo).toBe("conta_desativada");
    expect(b).toBeInstanceOf(FalhaDeSessao);
    expect((b as FalhaDeSessao).motivo).toBe("sessao_encerrada");
  });

  it("5xx e 429 continuam temporários, e a rede fora também", async () => {
    for (const status of [500, 503, 429]) {
      const { transporte } = transporteCom([resposta(status)]);
      await expect(transporte.enviar(envelope(CHAVE_A)), `status ${status}`)
        .rejects.toBeInstanceOf(FalhaTemporaria);
    }
  });
});

describe("A fila para e guarda: nenhum item perdido", () => {
  async function tresColetas(fila: ReturnType<typeof montar>["fila"], avancar: (ms: number) => void) {
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    avancar(60_000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });
    avancar(60_000);
    await fila.enfileirar(envelope(CHAVE_C), { protocolo: "000473/2026" });
  }

  for (const motivo of ["sessao_encerrada", "conta_desativada"] as const) {
    it(`${motivo}: todos os itens ficam pendentes, zero bloqueados, tentativas inalteradas`, async () => {
      const enviar = vi.fn(async () => { throw new FalhaDeSessao("A sessão não vale.", motivo); });
      const { fila, avancar } = montar({ enviar });
      await tresColetas(fila, avancar);
      const antes = await fila.itens();

      const r = await fila.drenar();

      const depois = await fila.itens();
      expect(depois).toHaveLength(3);
      expect(depois.every((i) => i.estado === "pendente")).toBe(true);
      expect(depois.map((i) => i.tentativas)).toEqual(antes.map((i) => i.tentativas));
      expect(depois.map((i) => i.liberadoEm)).toEqual(antes.map((i) => i.liberadoEm));
      expect(depois.every((i) => i.ultimaFalha === null)).toBe(true);
      expect(r.paradaPor).toBe(motivo);
      expect(r.bloqueados).toBe(0);
      expect(r.adiados).toBe(0);
      expect(r.enviados).toBe(0);
      // O dreno PAROU: o segundo e o terceiro nem foram tentados.
      expect(enviar).toHaveBeenCalledTimes(1);
      const resumo = await fila.resumo();
      expect(resumo.bloqueados).toBe(0);
      expect(resumo.pausadaPor).toBe(motivo);
    });
  }

  it("quem tinha tentativas de falha temporária mantém a contagem, sem somar a da pausa", async () => {
    let falha: Error = new FalhaTemporaria("Sem conexão.");
    const { fila, avancar } = montar({ enviar: async () => { throw falha; } });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    await fila.drenar();
    avancar(10 * 60_000);
    await fila.drenar();
    const [antes] = await fila.itens();
    expect(antes!.tentativas).toBe(2);
    expect(antes!.ultimaFalha?.codigo).toBe("falha_de_rede");

    falha = new FalhaDeSessao("A sessão não vale.", "sessao_encerrada");
    avancar(10 * 60_000);
    await fila.drenar();

    const [depois] = await fila.itens();
    expect(depois!.estado).toBe("pendente");
    expect(depois!.tentativas).toBe(2);
    expect(depois!.liberadoEm).toBe(antes!.liberadoEm);
  });

  it("depois de entrar de novo, os itens sobem em ordem e sem duplicar (mesma chave)", async () => {
    let sessaoViva = false;
    const recebidas: string[] = [];
    const { fila, avancar } = montar({
      enviar: async (e) => {
        if (!sessaoViva) throw new FalhaDeSessao("Sessão encerrada.", "sessao_encerrada");
        recebidas.push(e.idempotencyKey);
        return { vistoriaId: `v-${e.idempotencyKey}`, duplicada: false };
      },
    });
    await tresColetas(fila, avancar);

    const parada = await fila.drenar();
    expect(parada.paradaPor).toBe("sessao_encerrada");
    expect(recebidas).toEqual([]);

    sessaoViva = true; // a pessoa entrou de novo
    const r = await fila.drenar();

    expect(r.enviados).toBe(3);
    expect(r.paradaPor).toBeUndefined();
    expect(recebidas).toEqual([CHAVE_A, CHAVE_B, CHAVE_C]);
    const resumo = await fila.resumo();
    expect(resumo.pausadaPor).toBeNull();
    expect(resumo.bloqueados).toBe(0);
  });

  it("conta reativada: a coleta guardada sobe depois da nova entrada", async () => {
    let ativa = false;
    const { fila } = montar({
      enviar: async () => {
        if (!ativa) throw new FalhaDeSessao("Conta desativada.", "conta_desativada");
        return { vistoriaId: "v1", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    expect((await fila.drenar()).paradaPor).toBe("conta_desativada");
    expect((await fila.itens())[0]!.estado).toBe("pendente");

    ativa = true;
    expect((await fila.drenar()).enviados).toBe(1);
  });

  it("o progresso das fotos que já subiram fica guardado quando a sessão cai no meio", async () => {
    const FOTO_A = "ffffffff-1111-4111-8111-000000000001";
    const FOTO_B = "ffffffff-2222-4222-8222-000000000002";
    const foto = (k: string, ordem: number): FotoLocal => ({
      idempotencyKey: k, uriLocal: `file:///fotos/${ordem}.jpg`,
      nomeArquivo: `IMG_000${ordem}.jpg`, tipoConteudo: "image/jpeg", tamanhoBytes: 4,
      capturadaEm: MOMENTO.toISOString(), legenda: `Foto ${ordem}`, ordem,
    });
    const arquivos: Arquivos = { ler: async () => new Uint8Array([1, 2, 3, 4]) };
    let derrubar = true;
    const bytesEnviados: string[] = [];
    const { fila } = montar({
      autorizarFoto: async ({ foto: f }) => {
        if (f.idempotencyKey === FOTO_B && derrubar) {
          throw new FalhaDeSessao("Sessão encerrada.", "sessao_encerrada");
        }
        return {
          evidenciaId: `ev-${f.idempotencyKey}`, chave: `k/${f.idempotencyKey}.jpg`,
          url: `https://armazenamento.exemplo/${f.idempotencyKey}`,
          cabecalhos: {}, jaEnviada: false,
        };
      },
      enviarBytes: async (url) => { bytesEnviados.push(url.split("/").pop()!); },
      confirmarFoto: async () => undefined,
    }, { arquivos });
    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026", fotos: [foto(FOTO_A, 0), foto(FOTO_B, 1)],
    });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
    if (item!.tipo !== "vistoria") throw new Error("era para ser vistoria");
    expect(item!.fotos.map((f) => f.enviada)).toEqual([true, false]);

    // Entrou de novo: só a foto que faltou sobe. A primeira não é reenviada.
    derrubar = false;
    const retomada = await fila.drenar();
    expect(retomada.enviados).toBe(1);
    expect(bytesEnviados).toEqual([FOTO_A, FOTO_B]);
  });

  it("a devolução de tarefa também espera, em vez de bloquear", async () => {
    const { fila } = montar({
      devolver: async () => { throw new FalhaDeSessao("Conta desativada.", "conta_desativada"); },
    });
    await fila.enfileirarDevolucao({
      idempotencyKey: CHAVE_A, ocorrenciaId: OCORRENCIA,
      decididaEm: MOMENTO.toISOString(), motivo: "morador_ausente",
    }, { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("conta_desativada");
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
  });

  it("recusa do dado continua bloqueando: só a sessão é poupada", async () => {
    const { fila } = montar({
      enviar: async () => { throw new FalhaPermanente("Perfil sem permissão.", "sem_permissao"); },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    expect(r.paradaPor).toBeUndefined();
    expect((await fila.itens())[0]!.estado).toBe("bloqueado");
    expect((await fila.resumo()).pausadaPor).toBeNull();
  });
});

describe("Autoria: a pausa de um agente não vale para outro", () => {
  it("o agente B desativado: A entra no aparelho e os itens do B esperam o autor", async () => {
    const enviar = vi.fn(async (_e: EnvelopeSincronizacao) => ({ vistoriaId: "v", duplicada: false }));
    const { fila, sessao } = montar({
      enviar: async (e) => {
        if (sessao.atual === AGENTE_B) throw new FalhaDeSessao("Conta desativada.", "conta_desativada");
        return enviar(e);
      },
    });
    sessao.atual = AGENTE_B;
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    expect((await fila.drenar()).paradaPor).toBe("conta_desativada");
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");

    // O agente A entra depois da desativação do B, no mesmo aparelho.
    sessao.atual = AGENTE_A;
    const r = await fila.drenar();

    // Os itens do B não sobem com a sessão do A (o laudo sairia com o nome errado).
    expect(enviar).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.autor?.usuarioId).toBe(AGENTE_B.usuarioId);
    // E a pausa do B não aparece como se fosse do A.
    const resumo = await fila.resumo();
    expect(resumo.pausadaPor).toBeNull();
    expect(resumo.deOutroAutor).toBe(1);
  });

  it("o B volta: a pausa não fica velha, e uma tentativa só a redescobre", async () => {
    let ativa = false;
    const enviar = vi.fn(async (_e: EnvelopeSincronizacao) => {
      if (!ativa) throw new FalhaDeSessao("Conta desativada.", "conta_desativada");
      return { vistoriaId: "v", duplicada: false };
    });
    const { fila, sessao } = montar({ enviar });
    sessao.atual = AGENTE_B;
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();

    sessao.atual = AGENTE_A;
    await fila.drenar();

    // O B volta com a conta ainda desativada. A pausa velha foi limpa quando o
    // dreno do A não achou nada seu para enviar, e nenhum item guarda marca de
    // falha: o aparelho só descobre de novo com UMA requisição.
    sessao.atual = AGENTE_B;
    expect((await fila.resumo()).pausadaPor).toBeNull();
    const chamadasAntes = enviar.mock.calls.length;
    expect((await fila.drenar()).paradaPor).toBe("conta_desativada");
    expect(enviar.mock.calls.length - chamadasAntes).toBe(1);
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");

    ativa = true;
    expect((await fila.drenar()).enviados).toBe(1);
    expect((await fila.resumo()).pausadaPor).toBeNull();
  });
});

describe("Fila e transporte juntos: renovar e repetir sem perder item", () => {
  it("401 nao_autenticado renova uma vez e o item sobe, sem duplicar", async () => {
    const recebidas: Array<{ chave: string; autorizacao: string }> = [];
    const buscar = vi.fn(async (_url: string, init: RequestInit) => {
      const autorizacao = (init.headers as Record<string, string>)["authorization"]!;
      if (autorizacao === "Bearer token-velho") return resposta(401, NAO_AUTENTICADO);
      recebidas.push({
        chave: JSON.parse(String(init.body)).idempotencyKey as string, autorizacao,
      });
      return resposta(201, { vistoriaId: "v1", duplicada: false });
    });
    const pedidosDeRenovacao = vi.fn();
    const obterToken: ObterToken = async (p) => {
      if (p?.renovarJa) { pedidosDeRenovacao(); return "token-novo"; }
      return "token-velho";
    };
    const { fila } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo", obterToken, buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.enviados).toBe(1);
    expect(r.paradaPor).toBeUndefined();
    expect(pedidosDeRenovacao).toHaveBeenCalledTimes(1);
    expect(recebidas).toEqual([{ chave: CHAVE_A, autorizacao: "Bearer token-novo" }]);
  });

  it("token recusado e renovação que não muda nada: a fila pausa e o item fica", async () => {
    const buscar = vi.fn(async () => resposta(401, NAO_AUTENTICADO));
    const { fila } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken: async () => "token-morto",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    expect(r.bloqueados).toBe(0);
    expect(buscar).toHaveBeenCalledTimes(1);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
  });

  it("sem token nenhum: pausa por sessão encerrada, item pendente (antes era bloqueado)", async () => {
    const buscar = vi.fn();
    const { fila } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken: async () => null,
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    expect(buscar).not.toHaveBeenCalled();
    expect((await fila.itens())[0]!.estado).toBe("pendente");
  });

  it("403 conta_desativada pelo fio: pausa por conta desativada, item pendente", async () => {
    const buscar = vi.fn(async () => resposta(403, CONTA_DESATIVADA));
    const { fila } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken: async () => "token",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("conta_desativada");
    expect((await fila.itens())[0]!.estado).toBe("pendente");
    expect((await fila.resumo()).bloqueados).toBe(0);
  });

  it("403 sem_permissao pelo fio: o item BLOQUEIA, como sempre", async () => {
    const buscar = vi.fn(async () =>
      resposta(403, { erro: "sem_permissao", mensagem: "Seu perfil não tem permissão." }));
    const { fila } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken: async () => "token",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    expect((await fila.itens())[0]!.estado).toBe("bloqueado");
  });
});
