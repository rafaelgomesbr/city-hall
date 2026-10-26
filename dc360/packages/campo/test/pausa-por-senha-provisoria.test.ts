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
  type AutorDaColeta,
  type FotoLocal,
  type Transporte,
} from "../src/index.js";

/**
 * V2-F00-E06, correção 1: a senha provisória e as corridas de troca de conta.
 *
 * A rodada 1 da validação provou, contra a API e o motor reais, que o 403
 * `troca_de_senha_obrigatoria` (o que o servidor responde a quem entrou com a
 * senha que a coordenação sorteou) caía em `FalhaPermanente`: todo item virava
 * `bloqueado`, o dreno não parava e o cartão oferecia "Descartar", que apaga
 * coleta que o servidor nunca recebeu. Perda de dado, sem risco aceito.
 *
 * Aqui estão a matriz inteira de classificação (status x código x rota x
 * estado final do item) e as corridas de troca de conta que a mesma rodada
 * achou: a pausa atribuída a quem estava logado quando a resposta chegou, o
 * 401 tardio que devolvia a pendente um item já confirmado, e o pedido de um
 * item que saía com a credencial de outra pessoa.
 */

const MOMENTO = new Date("2026-10-06T14:00:00.000Z");
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE_A = "11111111-1111-4111-8111-111111111111";
const CHAVE_B = "22222222-2222-4222-8222-222222222222";
const CHAVE_C = "33333333-3333-4333-8333-333333333333";
const FOTO_A = "ffffffff-1111-4111-8111-000000000001";
const FOTO_B = "ffffffff-2222-4222-8222-000000000002";

const AGENTE_A: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};
const AGENTE_B: AutorDaColeta = {
  usuarioId: "u-bruno", nome: "Bruno Lima", organizacaoId: "org-serra-alta",
};

function envelope(chave: string): EnvelopeSincronizacao {
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

function foto(chave: string, ordem: number): FotoLocal {
  return {
    idempotencyKey: chave, uriLocal: `file:///fotos/${ordem}.jpg`,
    nomeArquivo: `IMG_000${ordem}.jpg`, tipoConteudo: "image/jpeg", tamanhoBytes: 4,
    capturadaEm: MOMENTO.toISOString(), legenda: `Foto ${ordem}`, ordem,
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
const TROCA_DE_SENHA = {
  erro: "troca_de_senha_obrigatoria",
  mensagem: "Você entrou com uma senha provisória.",
};

describe("Matriz de classificação: status e código contra o transporte e a fila reais", () => {
  type Esperado =
    | { classe: "sessao"; motivo: "sessao_encerrada" | "conta_desativada" | "troca_de_senha_obrigatoria" }
    | { classe: "permanente"; codigo: string }
    | { classe: "temporaria" };

  /*
    O que cada resposta da API faz com a fila. A regra, em uma frase: o 401 de
    qualquer código e o 403 de CONTA (desativada, senha provisória) pausam; só o
    que é do DADO ou do PAPEL (`sem_permissao`, 409 `autor_divergente`) é
    permanente por desenho; a suspensão do contrato espera.
  */
  const MATRIZ: Array<[string, number, Record<string, unknown>, Esperado]> = [
    ["401 nao_autenticado", 401, NAO_AUTENTICADO, { classe: "sessao", motivo: "sessao_encerrada" }],
    ["401 sessao_encerrada", 401, SESSAO_ENCERRADA, { classe: "sessao", motivo: "sessao_encerrada" }],
    ["401 sem código", 401, {}, { classe: "sessao", motivo: "sessao_encerrada" }],
    ["401 de código fora do catálogo", 401, { erro: "qualquer_coisa" }, { classe: "sessao", motivo: "sessao_encerrada" }],
    ["403 conta_desativada", 403, CONTA_DESATIVADA, { classe: "sessao", motivo: "conta_desativada" }],
    ["403 troca_de_senha_obrigatoria", 403, TROCA_DE_SENHA, { classe: "sessao", motivo: "troca_de_senha_obrigatoria" }],
    ["403 acesso_suspenso", 403, { erro: "acesso_suspenso", mensagem: "Suspenso." }, { classe: "temporaria" }],
    ["403 sem_permissao", 403, { erro: "sem_permissao", mensagem: "Sem permissão." }, { classe: "permanente", codigo: "sem_permissao" }],
    ["403 posto_insuficiente", 403, { erro: "posto_insuficiente", mensagem: "Seu perfil não alcança isto." }, { classe: "permanente", codigo: "posto_insuficiente" }],
    ["403 posto_insuficiente_para_dado_pessoal", 403, { erro: "posto_insuficiente_para_dado_pessoal", mensagem: "Seu perfil não alcança isto." }, { classe: "permanente", codigo: "posto_insuficiente_para_dado_pessoal" }],
    ["403 email_so_por_administrador", 403, { erro: "email_so_por_administrador", mensagem: "Seu perfil não alcança isto." }, { classe: "permanente", codigo: "email_so_por_administrador" }],
    ["403 assinatura", 403, { erro: "assinatura", mensagem: "Seu perfil não alcança isto." }, { classe: "permanente", codigo: "assinatura" }],
    ["403 sem código", 403, {}, { classe: "permanente", codigo: "http_403" }],
    ["409 autor_divergente", 409, { erro: "autor_divergente", mensagem: "Outro agente." }, { classe: "permanente", codigo: "autor_divergente" }],
    ["409 ja_encerrada", 409, { erro: "ja_encerrada", mensagem: "Encerrada." }, { classe: "permanente", codigo: "ja_encerrada" }],
    ["429", 429, {}, { classe: "temporaria" }],
    ["503", 503, {}, { classe: "temporaria" }],
  ];

  function transporteDe(status: number, corpo: Record<string, unknown>) {
    return transporteHttp({
      baseUrl: "http://api.exemplo",
      // Token que nunca muda: o 401 não ganha segunda chance e o resultado é o da pausa.
      obterToken: async () => "token",
      buscar: (async () => resposta(status, corpo)) as unknown as typeof fetch,
    });
  }

  for (const [nome, status, corpo, esperado] of MATRIZ) {
    it(`${nome}: as quatro rotas da fila classificam igual`, async () => {
      const devolucao: DevolucaoDeTarefa = {
        idempotencyKey: CHAVE_A, ocorrenciaId: OCORRENCIA,
        decididaEm: MOMENTO.toISOString(), motivo: "morador_ausente", devolvidaPor: "u-ana",
      };
      const t = transporteDe(status, corpo);

      const erros = await Promise.all([
        t.enviar(envelope(CHAVE_A)).catch((e: unknown) => e),
        t.devolver(devolucao).catch((e: unknown) => e),
        t.autorizarFoto({ ocorrenciaId: OCORRENCIA, foto: foto(FOTO_A, 0) }).catch((e: unknown) => e),
        t.confirmarFoto("ev-1").catch((e: unknown) => e),
      ]);

      for (const erro of erros) {
        if (esperado.classe === "sessao") {
          expect(erro).toBeInstanceOf(FalhaDeSessao);
          expect((erro as FalhaDeSessao).motivo).toBe(esperado.motivo);
        } else if (esperado.classe === "permanente") {
          expect(erro).toBeInstanceOf(FalhaPermanente);
          expect((erro as FalhaPermanente).codigo).toBe(esperado.codigo);
        } else {
          expect(erro).toBeInstanceOf(FalhaTemporaria);
        }
      }
    });

    it(`${nome}: o item termina no estado certo na fila`, async () => {
      const { fila } = montar({}, { transporte: transporteDe(status, corpo) });
      await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

      const r = await fila.drenar();

      const [item] = await fila.itens();
      if (esperado.classe === "sessao") {
        expect(item!.estado).toBe("pendente");
        expect(item!.tentativas).toBe(0);
        expect(r.paradaPor).toBe(esperado.motivo);
        expect(r.bloqueados).toBe(0);
        expect((await fila.resumo()).pausadaPor).toBe(esperado.motivo);
      } else if (esperado.classe === "permanente") {
        // `ja_encerrada` é coleta sem destino: arquivada, e nunca bloqueada.
        expect(item!.estado).toBe(esperado.codigo === "ja_encerrada" ? "arquivado" : "bloqueado");
        expect(r.paradaPor).toBeUndefined();
      } else {
        expect(item!.estado).toBe("pendente");
        expect(item!.tentativas).toBe(1);
        expect(r.paradaPor).toBeUndefined();
        expect(r.bloqueados).toBe(0);
      }
    });
  }
});

describe("403 troca_de_senha_obrigatoria: a fila PAUSA e nenhuma coleta é perdida", () => {
  async function tresColetas(fila: ReturnType<typeof montar>["fila"], avancar: (ms: number) => void) {
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    avancar(60_000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });
    avancar(60_000);
    await fila.enfileirar(envelope(CHAVE_C), { protocolo: "000473/2026" });
  }

  it("três coletas: zero bloqueadas, tentativas inalteradas, o dreno para na primeira chamada", async () => {
    const buscar = vi.fn(async () => resposta(403, TROCA_DE_SENHA));
    const { fila, avancar } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo", obterToken: async () => "token-provisorio",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await tresColetas(fila, avancar);

    const r = await fila.drenar();

    const itens = await fila.itens();
    expect(itens.map((i) => i.estado)).toEqual(["pendente", "pendente", "pendente"]);
    expect(itens.map((i) => i.tentativas)).toEqual([0, 0, 0]);
    expect(itens.every((i) => i.ultimaFalha === null)).toBe(true);
    expect(r.paradaPor).toBe("troca_de_senha_obrigatoria");
    expect(r.bloqueados).toBe(0);
    expect(buscar).toHaveBeenCalledTimes(1);
    const resumo = await fila.resumo();
    expect(resumo.bloqueados).toBe(0);
    expect(resumo.pausadaPor).toBe("troca_de_senha_obrigatoria");
  });

  it("a pausa nova SUBSTITUI a velha: de sessão encerrada para senha provisória, e depois sobe tudo", async () => {
    // O roteiro real: a coordenação redefine a senha (as sessões caem, 401),
    // o agente entra com a provisória (403 em toda escrita), e depois troca a senha.
    let fase: "sessao_velha" | "provisoria" | "trocada" = "sessao_velha";
    const recebidas: string[] = [];
    const buscar = vi.fn(async (_url: string, init: RequestInit) => {
      if (fase === "sessao_velha") return resposta(401, SESSAO_ENCERRADA);
      if (fase === "provisoria") return resposta(403, TROCA_DE_SENHA);
      recebidas.push(JSON.parse(String(init.body)).idempotencyKey as string);
      return resposta(201, { vistoriaId: "v", duplicada: false });
    });
    const { fila, avancar } = montar({}, {
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo", obterToken: async () => "token",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await tresColetas(fila, avancar);

    expect((await fila.drenar()).paradaPor).toBe("sessao_encerrada");
    expect((await fila.resumo()).pausadaPor).toBe("sessao_encerrada");

    fase = "provisoria";
    expect((await fila.drenar()).paradaPor).toBe("troca_de_senha_obrigatoria");
    // Não fica "Sessão encerrada" por cima: a pausa nova trocou a velha.
    expect((await fila.resumo()).pausadaPor).toBe("troca_de_senha_obrigatoria");
    expect((await fila.resumo()).bloqueados).toBe(0);

    fase = "trocada";
    const r = await fila.drenar();
    expect(r.enviados).toBe(3);
    expect(recebidas).toEqual([CHAVE_A, CHAVE_B, CHAVE_C]);
    expect((await fila.resumo()).pausadaPor).toBeNull();
    expect((await fila.resumo()).bloqueados).toBe(0);
  });

  it("a devolução de tarefa e a foto também esperam, sem bloquear", async () => {
    const { fila } = montar({
      autorizarFoto: async () => { throw new FalhaDeSessao("Defina a sua senha.", "troca_de_senha_obrigatoria"); },
      devolver: async () => { throw new FalhaDeSessao("Defina a sua senha.", "troca_de_senha_obrigatoria"); },
    }, { arquivos: { ler: async () => new Uint8Array([1, 2, 3, 4]) } });
    await fila.enfileirarDevolucao({
      idempotencyKey: CHAVE_A, ocorrenciaId: OCORRENCIA,
      decididaEm: MOMENTO.toISOString(), motivo: "morador_ausente",
    }, { protocolo: "000471/2026" });
    await fila.enfileirar(envelope(CHAVE_B), {
      protocolo: "000472/2026", fotos: [foto(FOTO_A, 0)],
    });

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("troca_de_senha_obrigatoria");
    expect((await fila.itens()).map((i) => i.estado)).toEqual(["pendente", "pendente"]);
    expect((await fila.resumo()).bloqueados).toBe(0);
  });
});

describe("Corridas de troca de conta com o dreno em voo", () => {
  /** Uma promessa que o teste resolve ou rejeita quando quiser. */
  function adiavel<T>() {
    let resolver!: (v: T) => void;
    let rejeitar!: (e: unknown) => void;
    const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
    return { promessa, resolver, rejeitar };
  }
  const cederAoLaco = () => new Promise<void>((r) => setTimeout(r, 0));

  it("a pausa é do AUTOR do item, e não de quem está logado quando a resposta chega", async () => {
    const { fila, sessao } = montar({
      enviar: async () => {
        // A pessoa saiu e outra entrou enquanto o pedido estava na rua.
        sessao.atual = AGENTE_B;
        throw new FalhaDeSessao("Conta desativada.", "conta_desativada");
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    await fila.drenar();

    // O B entrou depois e não tem nada a ver com a conta do A.
    expect((await fila.resumo()).pausadaPor).toBeNull();
    // O A volta: a pausa é dele.
    sessao.atual = AGENTE_A;
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");
  });

  it("cancelar, trocar de conta e a resposta tardia 403: a pausa não aparece para o outro agente", async () => {
    const pendente = adiavel<{ vistoriaId: string; duplicada: boolean }>();
    const chamadas = vi.fn();
    const { fila, sessao } = montar({
      enviar: async () => { chamadas(); return pendente.promessa; },
    });
    sessao.atual = AGENTE_B;
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const dreno = fila.drenar();
    await cederAoLaco();
    expect(chamadas).toHaveBeenCalledTimes(1);
    fila.cancelar();
    sessao.atual = AGENTE_A;
    pendente.rejeitar(new FalhaDeSessao("Conta desativada.", "conta_desativada"));
    await dreno;

    const resumo = await fila.resumo();
    expect(resumo.pausadaPor, "o A leu a pausa do B").toBeNull();
    expect(resumo.deOutroAutor).toBe(1);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
  });

  it("dois drenos: o 401 tardio do primeiro NÃO devolve a pendente o item que o segundo confirmou", async () => {
    const primeira = adiavel<{ vistoriaId: string; duplicada: boolean }>();
    let chamada = 0;
    const { fila } = montar({
      enviar: async () => {
        chamada += 1;
        if (chamada === 1) return primeira.promessa;
        return { vistoriaId: "v1", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const dreno1 = fila.drenar();
    await cederAoLaco();
    fila.cancelar(); // o aparelho perdeu e recuperou o sinal
    const dreno2 = await fila.drenar();
    expect(dreno2.enviados).toBe(1);
    expect((await fila.itens())[0]!.estado).toBe("confirmado");

    // A resposta do primeiro pedido chega tarde, com 401.
    primeira.rejeitar(new FalhaDeSessao("Sessão encerrada.", "sessao_encerrada"));
    await dreno1;

    const [item] = await fila.itens();
    expect(item!.estado, "o item confirmado regrediu").toBe("confirmado");
    expect((await fila.resumo()).pausadaPor, "pausa falsa depois de um envio que deu certo").toBeNull();
  });

  it("trocar de conta com a foto em voo: nenhum pedido seguinte sai com a conta nova", async () => {
    const chamadas: string[] = [];
    const { fila, sessao } = montar({
      autorizarFoto: async ({ foto: f }) => {
        chamadas.push(`autorizar:${f.idempotencyKey}:${sessao.atual?.usuarioId}`);
        // A primeira autorização estava na rua quando a conta mudou.
        if (f.idempotencyKey === FOTO_A) sessao.atual = AGENTE_B;
        return {
          evidenciaId: `ev-${f.idempotencyKey}`, chave: `k/${f.idempotencyKey}.jpg`,
          url: `https://armazenamento.exemplo/${f.idempotencyKey}`, cabecalhos: {}, jaEnviada: false,
        };
      },
      enviarBytes: async (url) => { chamadas.push(`bytes:${url.split("/").pop()}:${sessao.atual?.usuarioId}`); },
      confirmarFoto: async (id) => { chamadas.push(`confirmar:${id}:${sessao.atual?.usuarioId}`); },
      enviar: async () => { chamadas.push(`enviar:${sessao.atual?.usuarioId}`); return { vistoriaId: "v", duplicada: false }; },
    }, { arquivos: { ler: async () => new Uint8Array([1, 2, 3, 4]) } });
    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026", fotos: [foto(FOTO_A, 0), foto(FOTO_B, 1)],
    });

    const r = await fila.drenar();

    // Só a chamada que já estava em voo. Nada mais sai com o B logado.
    expect(chamadas).toEqual([`autorizar:${FOTO_A}:${AGENTE_A.usuarioId}`]);
    expect(r.interrompido).toBe(true);
    expect(r.bloqueados).toBe(0);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
    expect(item!.autor?.usuarioId).toBe(AGENTE_A.usuarioId);
    expect((await fila.resumo()).pausadaPor).toBeNull();
  });

  it("cancelar() com a foto em voo: o item para antes do próximo pedido e a coleta continua guardada", async () => {
    const chamadas: string[] = [];
    let cancelou = false;
    const { fila } = montar({
      autorizarFoto: async ({ foto: f }) => {
        chamadas.push("autorizar");
        // O aplicativo vai para segundo plano, ou a conta mudou: só na primeira volta.
        if (!cancelou) { cancelou = true; fila.cancelar(); }
        return {
          evidenciaId: "ev", chave: `k/${f.idempotencyKey}.jpg`,
          url: "https://armazenamento.exemplo/x", cabecalhos: {}, jaEnviada: false,
        };
      },
      enviarBytes: async () => { chamadas.push("bytes"); },
      confirmarFoto: async () => { chamadas.push("confirmar"); },
      enviar: async () => { chamadas.push("enviar"); return { vistoriaId: "v", duplicada: false }; },
    }, { arquivos: { ler: async () => new Uint8Array([1, 2, 3, 4]) } });
    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026", fotos: [foto(FOTO_A, 0)],
    });

    await fila.drenar();

    expect(chamadas).toEqual(["autorizar"]);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);

    // Retomada: o item sobe inteiro, uma vez.
    const r = await fila.drenar();
    expect(r.enviados).toBe(1);
  });

  it("o pedido de autorização da foto declara quem coletou (o servidor confere com o token)", async () => {
    const corpos: Array<Record<string, unknown>> = [];
    const buscar = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/evidencias/autorizar-envio")) {
        corpos.push(JSON.parse(String(init.body)));
        return resposta(201, {
          evidenciaId: "ev", chave: "k/x.jpg", url: "https://armazenamento.exemplo/x",
          cabecalhos: {}, jaEnviada: true,
        });
      }
      return resposta(201, { vistoriaId: "v", duplicada: false });
    });
    const { fila } = montar({}, {
      arquivos: { ler: async () => new Uint8Array([1, 2, 3, 4]) },
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo", obterToken: async () => "token",
        buscar: buscar as unknown as typeof fetch,
      }),
    });
    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026", fotos: [foto(FOTO_A, 0)],
    });

    await fila.drenar();

    expect(corpos).toHaveLength(1);
    expect(corpos[0]!["coletadaPor"]).toBe(AGENTE_A.usuarioId);
  });
});
