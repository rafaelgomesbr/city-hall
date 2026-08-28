import { describe, expect, it, vi } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  esperaAteProximaTentativa,
  lojaEmMemoria,
  transporteHttp,
  type Arquivos,
  type ChaveValor,
  type FotoLocal,
  type Recibo,
  type Transporte,
} from "../src/index.js";

/**
 * O que estes testes protegem não é "a função devolve o valor certo". É o
 * comportamento na rua: sinal que cai no meio do envio, aplicativo fechado
 * durante a sincronização, servidor fora do ar, agente tocando duas vezes no
 * botão porque o aparelho travou.
 *
 * Em toda situação dessas, duas coisas não podem acontecer: perder uma coleta
 * feita no morro, e gravar o mesmo laudo duas vezes.
 */

const MOMENTO = new Date("2026-08-21T14:00:00.000Z");

function envelope(chave: string, ocorrencia = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: ocorrencia,
    coletadaEm: MOMENTO.toISOString(),
    vistoria: {
      checklist: [{ chave: "risco_iminente", resposta: true },
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

const CHAVE_A = "11111111-1111-4111-8111-111111111111";
const CHAVE_B = "22222222-2222-4222-8222-222222222222";
const CHAVE_C = "33333333-3333-4333-8333-333333333333";

/**
 * Transporte completo a partir do pedaço que cada teste se importa.
 *
 * As três operações de foto lançam por padrão: se um teste que não deveria
 * mexer em foto acabar chamando uma delas, isso aparece como erro em vez de
 * passar silenciosamente.
 */
function transporteFalso(parcial: Partial<Transporte>): Transporte {
  return {
    enviar: async () => ({ vistoriaId: "v", duplicada: false }),
    autorizarFoto: async () => { throw new Error("autorizarFoto nao esperado neste teste"); },
    enviarBytes: async () => { throw new Error("enviarBytes nao esperado neste teste"); },
    confirmarFoto: async () => { throw new Error("confirmarFoto nao esperado neste teste"); },
    ...parcial,
  };
}

/** Relógio controlado: esperar de verdade tornaria o teste lento e instável. */
function relogio(inicio = MOMENTO) {
  let atual = inicio.getTime();
  return {
    agora: () => new Date(atual),
    avancar: (ms: number) => { atual += ms; },
  };
}

function montar(
  transporte: Partial<Transporte>,
  extras: Partial<Parameters<typeof criarFilaDeSincronizacao>[0]> = {},
) {
  const loja = lojaEmMemoria();
  const tempo = relogio();
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte: transporteFalso(transporte),
    agora: tempo.agora,
    dormir: async () => undefined,
    ruido: () => 0.5, // determinístico
    ...extras,
  });
  return { fila, loja, tempo };
}

describe("Enfileirar", () => {
  it("guarda a coleta e a fila sobrevive ao aplicativo fechar", async () => {
    const loja = lojaEmMemoria();
    const transporte = transporteFalso({
      enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
    });

    const primeira = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja), transporte, agora: relogio().agora,
    });
    await primeira.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    // Mesma loja, instância nova: é o que acontece quando o app é reaberto.
    const depoisDeReabrir = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja), transporte, agora: relogio().agora,
    });
    const itens = await depoisDeReabrir.itens();

    expect(itens).toHaveLength(1);
    expect(itens[0]!.protocolo).toBe("000471/2026");
    expect(itens[0]!.estado).toBe("pendente");
  });

  it("tocar duas vezes no botão de concluir não cria duas coletas", async () => {
    const { fila } = montar({ enviar: async () => ({ vistoriaId: "v1", duplicada: false }) });

    // O agente toca, a tela demora a responder no aparelho velho, ele toca de novo.
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    expect(await fila.itens()).toHaveLength(1);
  });

  it("reenfileirar não apaga o progresso de um item que já tentou subir", async () => {
    /**
     * O caso perigoso não é criar duas linhas na fila (o depósito é indexado
     * pela chave, então isso já não acontece). É o item voltar ao início:
     * tentativas zeradas e nova janela de espera. Numa fila que já falhou
     * algumas vezes, isso reinicia a contagem para sempre e o item nunca
     * chega ao bloqueio que avisaria a pessoa de que algo está errado.
     */
    const { fila, tempo } = montar({
      enviar: async () => { throw new FalhaTemporaria("Sem conexão."); },
    });

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();

    const antes = (await fila.itens())[0]!;
    expect(antes.tentativas).toBe(1);

    tempo.avancar(500);
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const depois = (await fila.itens())[0]!;
    expect(depois.tentativas, "a contagem de tentativas não pode voltar a zero").toBe(1);
    expect(depois.liberadoEm, "a janela de espera não pode ser antecipada").toBe(antes.liberadoEm);
    expect(depois.criadoEm, "o lugar na ordem de coleta não pode mudar").toBe(antes.criadoEm);
  });
});

describe("Dreno com a rede funcionando", () => {
  it("envia na ordem em que as coletas foram feitas", async () => {
    const enviados: string[] = [];
    const { fila, tempo } = montar({
      enviar: async (e) => {
        enviados.push(e.idempotencyKey);
        return { vistoriaId: "v", duplicada: false };
      },
    });

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_C), { protocolo: "000473/2026" });

    const r = await fila.drenar();

    // A ordem do laudo é a ordem da coleta, e é por isso que o envio é um por
    // vez em vez de paralelo.
    expect(enviados).toEqual([CHAVE_A, CHAVE_B, CHAVE_C]);
    expect(r.enviados).toBe(3);
    expect(r.interrompido).toBe(false);
  });

  it("reconhece o que o servidor marcou como duplicado", async () => {
    const { fila } = montar({ enviar: async () => ({ vistoriaId: "v1", duplicada: true }) });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();
    expect(r.duplicados).toBe(1);
    expect(r.enviados).toBe(0);
  });

  it("some da fila depois de um tempo confirmado", async () => {
    const { fila, tempo } = montar(
      { enviar: async () => ({ vistoriaId: "v1", duplicada: false }) },
      { reterConfirmadoMs: 10_000 },
    );
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    await fila.drenar();
    expect((await fila.itens()).map((i) => i.estado)).toEqual(["confirmado"]);

    tempo.avancar(11_000);
    await fila.drenar();
    expect(await fila.itens()).toHaveLength(0);
  });
});

describe("Sinal caindo", () => {
  it("mantém a coleta na fila e agenda nova tentativa", async () => {
    const { fila, tempo } = montar({
      enviar: async () => { throw new FalhaTemporaria("Sem conexão com o servidor."); },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();
    expect(r.adiados).toBe(1);

    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(1);
    expect(new Date(item!.liberadoEm).getTime()).toBeGreaterThan(tempo.agora().getTime());
  });

  it("não tenta de novo antes da hora, e tenta quando chega a hora", async () => {
    let chamadas = 0;
    const { fila, tempo } = montar({
      enviar: async () => {
        chamadas += 1;
        if (chamadas === 1) throw new FalhaTemporaria("Sem conexão.");
        return { vistoriaId: "v1", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    await fila.drenar();
    expect(chamadas).toBe(1);

    // Antes da janela: nada acontece, e a bateria agradece.
    await fila.drenar();
    expect(chamadas).toBe(1);

    tempo.avancar(10 * 60_000);
    await fila.drenar();
    expect(chamadas).toBe(2);
    expect((await fila.itens())[0]!.estado).toBe("confirmado");
  });

  it("para no primeiro erro de rede em vez de varrer a fila inteira", async () => {
    let chamadas = 0;
    const { fila, tempo } = montar({
      enviar: async () => {
        chamadas += 1;
        throw new FalhaTemporaria("Sem conexão.");
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_C), { protocolo: "000473/2026" });

    const r = await fila.drenar();

    // Rede caída não melhora no item seguinte: insistir gastaria bateria e
    // ainda por cima queimaria tentativa dos outros itens.
    expect(chamadas).toBe(1);
    expect(r.interrompido).toBe(true);
    const estados = (await fila.itens()).map((i) => i.tentativas);
    expect(estados).toEqual([1, 0, 0]);
  });
});

describe("Servidor recusando", () => {
  it("bloqueia na hora quando repetir não resolve", async () => {
    const { fila } = montar({
      enviar: async () => {
        throw new FalhaPermanente("Essa ocorrência já foi encerrada.", "ja_encerrada");
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const r = await fila.drenar();
    expect(r.bloqueados).toBe(1);

    const [item] = await fila.itens();
    expect(item!.estado).toBe("bloqueado");
    expect(item!.ultimoErro).toContain("já foi encerrada");
    expect(item!.tentativas, "não insiste em erro permanente").toBe(1);
  });

  it("segue para o próximo item depois de bloquear um", async () => {
    const vistos: string[] = [];
    const { fila, tempo } = montar({
      enviar: async (e) => {
        vistos.push(e.idempotencyKey);
        if (e.idempotencyKey === CHAVE_A) {
          throw new FalhaPermanente("Dado inválido.", "dados_invalidos");
        }
        return { vistoriaId: "v", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });

    const r = await fila.drenar();

    // Um laudo recusado não pode segurar os outros: o resto da coleta do dia
    // sobe do mesmo jeito.
    expect(vistos).toEqual([CHAVE_A, CHAVE_B]);
    expect(r.bloqueados).toBe(1);
    expect(r.enviados).toBe(1);
  });

  it("desiste depois do teto de tentativas, sem perder o dado", async () => {
    const { fila, tempo } = montar(
      { enviar: async () => { throw new FalhaTemporaria("Servidor indisponível (503)."); } },
      { maximoTentativas: 3 },
    );
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    for (let i = 0; i < 3; i++) {
      await fila.drenar();
      tempo.avancar(10 * 60_000);
    }

    const [item] = await fila.itens();
    expect(item!.estado).toBe("bloqueado");
    // Bloqueado é diferente de perdido: o envelope continua inteiro na fila,
    // e a pessoa pode mandar tentar de novo.
    expect(item!.envelope.vistoria.assinanteNome).toBe("Moradora");
    expect(item!.ultimoErro).toContain("3 tentativas");
  });

  it("a pessoa pode mandar tentar de novo, e aí funciona", async () => {
    let recusar = true;
    const { fila } = montar({
      enviar: async () => {
        if (recusar) throw new FalhaPermanente("Servidor recusou.", "erro");
        return { vistoriaId: "v1", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();
    expect((await fila.itens())[0]!.estado).toBe("bloqueado");

    recusar = false;
    await fila.reenviar(CHAVE_A);
    expect((await fila.itens())[0]!.estado).toBe("pendente");

    await fila.drenar();
    expect((await fila.itens())[0]!.estado).toBe("confirmado");
  });
});

describe("Cancelamento no meio do dreno", () => {
  it("para depois do item em andamento, sem reenviar o que já subiu", async () => {
    const enviados: string[] = [];
    let filaRef: ReturnType<typeof criarFilaDeSincronizacao>;

    const { fila, tempo } = montar({
      enviar: async (e) => {
        enviados.push(e.idempotencyKey);
        // O sinal cai logo depois do primeiro envio dar certo.
        if (e.idempotencyKey === CHAVE_A) filaRef.cancelar();
        return { vistoriaId: "v", duplicada: false };
      },
    });
    filaRef = fila;

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });

    const r = await fila.drenar();

    expect(enviados).toEqual([CHAVE_A]);
    expect(r.interrompido).toBe(true);

    // O primeiro foi confirmado mesmo com o cancelamento: descartar a
    // resposta faria a próxima rodada reenviar sem necessidade.
    const itens = await fila.itens();
    expect(itens.find((i) => i.id === CHAVE_A)!.estado).toBe("confirmado");
    expect(itens.find((i) => i.id === CHAVE_B)!.estado).toBe("pendente");
  });

  it("dois drenos ao mesmo tempo não enviam o mesmo item duas vezes", async () => {
    const enviados: string[] = [];
    let liberar: (() => void) | null = null;
    const bloqueio = new Promise<void>((r) => { liberar = r; });

    const { fila } = montar({
      enviar: async (e) => {
        enviados.push(e.idempotencyKey);
        await bloqueio;
        return { vistoriaId: "v", duplicada: false };
      },
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const primeiro = fila.drenar();
    // O app dispara outro dreno porque o sinal "voltou" enquanto o primeiro
    // ainda estava em voo. Acontece o tempo todo com Wi-Fi de prefeitura.
    const segundo = await fila.drenar();

    expect(segundo.interrompido, "o segundo dreno recusa começar").toBe(true);
    liberar!();
    await primeiro;

    expect(enviados).toEqual([CHAVE_A]);
  });

  it("app morto durante o envio: reenvia com a mesma chave, e o servidor deduplica", async () => {
    const loja = lojaEmMemoria();
    const tempo = relogio();
    const chavesVistas: string[] = [];

    // Primeira execução: morre no meio do envio.
    const morreu = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      agora: tempo.agora,
      transporte: transporteFalso({
        enviar: async (e) => {
          chavesVistas.push(e.idempotencyKey);
          throw new FalhaTemporaria("processo encerrado no meio do envio");
        },
      }),
    });
    await morreu.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await morreu.drenar();

    tempo.avancar(10 * 60_000);

    // Segunda execução: o servidor já tinha recebido, e avisa que é duplicata.
    const reaberto = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      agora: tempo.agora,
      transporte: transporteFalso({
        enviar: async (e): Promise<Recibo> => {
          chavesVistas.push(e.idempotencyKey);
          return { vistoriaId: "v1", duplicada: true };
        },
      }),
    });
    const r = await reaberto.drenar();

    // A chave é a mesma nas duas tentativas: é isso que permite ao servidor
    // reconhecer o reenvio em vez de gravar um segundo laudo.
    expect(chavesVistas).toEqual([CHAVE_A, CHAVE_A]);
    expect(r.duplicados).toBe(1);
  });
});

describe("Espera entre tentativas", () => {
  it("cresce a cada falha e tem teto", () => {
    const semRuido = () => 1;
    const esperas = [1, 2, 3, 4, 10].map((t) => esperaAteProximaTentativa(t, semRuido));

    for (let i = 1; i < esperas.length; i++) {
      expect(esperas[i]!).toBeGreaterThanOrEqual(esperas[i - 1]!);
    }
    // Sem teto, a décima tentativa esperaria mais de um dia.
    expect(esperas.at(-1)!).toBeLessThanOrEqual(5 * 60_000);
  });

  it("espalha as tentativas em vez de sincronizar todos os aparelhos", () => {
    // Todos os aparelhos que perderam sinal no mesmo temporal voltariam no
    // mesmo instante e derrubariam o servidor de novo na hora em que ele sobe.
    const amostras = new Set(
      Array.from({ length: 50 }, (_, i) => esperaAteProximaTentativa(4, () => i / 50)),
    );
    expect(amostras.size).toBeGreaterThan(10);
  });
});

describe("Resumo para a tela", () => {
  it("conta cada estado e avisa quem está ouvindo", async () => {
    const { fila, tempo } = montar({
      enviar: async (e) => {
        if (e.idempotencyKey === CHAVE_B) throw new FalhaPermanente("recusado", "erro");
        return { vistoriaId: "v", duplicada: false };
      },
    });

    const vistos: number[] = [];
    const cancelar = fila.assinar((r) => vistos.push(r.pendentes));

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    tempo.avancar(1000);
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });

    expect(vistos.at(-1)).toBe(2);

    await fila.drenar();
    const r = await fila.resumo();
    expect(r.confirmados).toBe(1);
    expect(r.bloqueados).toBe(1);
    expect(r.pendentes).toBe(0);
    expect(r.sincronizando).toBe(false);

    cancelar();
  });
});

describe("Depósito", () => {
  it("um registro corrompido não derruba o resto da coleta do dia", async () => {
    const loja = lojaEmMemoria({
      "dc360:fila:quebrado": "{isto não é json",
    });
    const deposito = depositoSobreChaveValor(loja);
    const fila = criarFilaDeSincronizacao({
      deposito,
      transporte: transporteFalso({}),
      agora: relogio().agora,
    });

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    const itens = await fila.itens();

    expect(itens).toHaveLength(1);
    expect(itens[0]!.id).toBe(CHAVE_A);
    expect(await loja.ler("dc360:fila:quebrado"), "o item quebrado sai de circulação").toBeNull();
  });

  it("ignora chaves de outras coisas guardadas no mesmo armazenamento", async () => {
    const loja: ChaveValor = lojaEmMemoria({
      "preferencias:tema": "escuro",
      "dc360:sessao": "{}",
    });
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteFalso({}),
      agora: relogio().agora,
    });
    expect(await fila.itens()).toHaveLength(0);
  });
});

describe("Transporte HTTP", () => {
  const envelopeBase = envelope(CHAVE_A);

  function transporteCom(resposta: Partial<Response> | Error) {
    const buscar = vi.fn(async () => {
      if (resposta instanceof Error) throw resposta;
      return resposta as Response;
    });
    return {
      buscar,
      transporte: transporteHttp({
        baseUrl: "http://api.exemplo",
        obterToken: async () => "token-de-teste",
        buscar: buscar as unknown as typeof fetch,
      }),
    };
  }

  it("manda o token e o envelope, e devolve o recibo", async () => {
    const { buscar, transporte } = transporteCom({
      ok: true, status: 201,
      json: async () => ({ vistoriaId: "v1", duplicada: false }),
    });

    const recibo = await transporte.enviar(envelopeBase);
    expect(recibo).toEqual({ vistoriaId: "v1", duplicada: false });

    const [url, opcoes] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.exemplo/sincronizacao/vistoria");
    expect((opcoes.headers as Record<string, string>)["authorization"]).toBe("Bearer token-de-teste");
    expect(JSON.parse(String(opcoes.body)).idempotencyKey).toBe(CHAVE_A);
  });

  it("rede fora vira falha temporária", async () => {
    const { transporte } = transporteCom(new TypeError("Failed to fetch"));
    await expect(transporte.enviar(envelopeBase)).rejects.toBeInstanceOf(FalhaTemporaria);
  });

  it("5xx e 429 viram falha temporária", async () => {
    for (const status of [500, 502, 503, 429]) {
      const { transporte } = transporteCom({ ok: false, status, json: async () => ({}) });
      await expect(
        transporte.enviar(envelopeBase),
        `status ${status}`,
      ).rejects.toBeInstanceOf(FalhaTemporaria);
    }
  });

  it("recusa do servidor vira falha permanente, com a mensagem dele", async () => {
    for (const status of [400, 403, 404, 409, 422]) {
      const { transporte } = transporteCom({
        ok: false, status,
        json: async () => ({ erro: "ja_encerrada", mensagem: "Essa ocorrência já foi encerrada." }),
      });
      await expect(transporte.enviar(envelopeBase), `status ${status}`)
        .rejects.toThrow("Essa ocorrência já foi encerrada.");
    }
  });

  it("401 é permanente de propósito, para não bloquear a conta do agente", async () => {
    // Repetir com token morto é o caminho mais rápido para estourar o limite
    // de tentativas e bloquear quem está trabalhando. Sessão expirada se
    // resolve entrando de novo, não insistindo.
    const { transporte } = transporteCom({ ok: false, status: 401, json: async () => ({}) });
    await expect(transporte.enviar(envelopeBase)).rejects.toBeInstanceOf(FalhaPermanente);
  });

  it("sem token nem tenta a chamada", async () => {
    const buscar = vi.fn();
    const transporte = transporteHttp({
      baseUrl: "http://api.exemplo",
      obterToken: async () => null,
      buscar: buscar as unknown as typeof fetch,
    });
    await expect(transporte.enviar(envelopeBase)).rejects.toBeInstanceOf(FalhaPermanente);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("O dia inteiro de um agente", () => {
  /**
   * Cenário completo, na ordem em que acontece: sai da base com sinal, sobe o
   * morro e perde, coleta três vistorias offline, desce e o sinal volta
   * intermitente, e no fim tudo precisa estar no servidor uma vez só.
   */
  it("três coletas offline, sinal intermitente, nada perdido e nada duplicado", async () => {
    const recebidasPeloServidor = new Map<string, number>();
    let temSinal = false;
    let instavel = false;

    const { fila, tempo } = montar({
      enviar: async (e) => {
        if (!temSinal) throw new FalhaTemporaria("Sem conexão.");
        if (instavel) {
          instavel = false;
          // Chegou no servidor, mas a resposta se perdeu no caminho de volta:
          // o pior caso, e o motivo de a idempotência existir.
          recebidasPeloServidor.set(e.idempotencyKey, (recebidasPeloServidor.get(e.idempotencyKey) ?? 0) + 1);
          throw new FalhaTemporaria("Conexão caiu esperando a resposta.");
        }
        const jaTinha = recebidasPeloServidor.has(e.idempotencyKey);
        recebidasPeloServidor.set(e.idempotencyKey, (recebidasPeloServidor.get(e.idempotencyKey) ?? 0) + 1);
        return { vistoriaId: `v-${e.idempotencyKey}`, duplicada: jaTinha };
      },
    });

    // No morro, sem sinal.
    await fila.enfileirar(envelope(CHAVE_A, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), { protocolo: "000471/2026" });
    tempo.avancar(20 * 60_000);
    await fila.enfileirar(envelope(CHAVE_B, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), { protocolo: "000472/2026" });
    tempo.avancar(20 * 60_000);
    await fila.enfileirar(envelope(CHAVE_C, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"), { protocolo: "000473/2026" });

    // Tenta sem sinal: nada sai, nada se perde.
    const semSinal = await fila.drenar();
    expect(semSinal.enviados).toBe(0);
    expect(recebidasPeloServidor.size).toBe(0);
    expect((await fila.itens()).every((i) => i.estado === "pendente")).toBe(true);

    // Descendo o morro: sinal volta, mas a primeira resposta se perde.
    temSinal = true;
    instavel = true;
    tempo.avancar(10 * 60_000);
    await fila.drenar();

    // Sinal estável: o resto sobe, e o reenvio do primeiro é reconhecido.
    tempo.avancar(10 * 60_000);
    await fila.drenar();
    tempo.avancar(10 * 60_000);
    await fila.drenar();
    tempo.avancar(10 * 60_000);
    await fila.drenar();

    // Nada ficou para trás.
    expect([...recebidasPeloServidor.keys()].sort()).toEqual([CHAVE_A, CHAVE_B, CHAVE_C].sort());

    // O primeiro chegou duas vezes no servidor, e por isso a chave de
    // idempotência existe: lá ela vira um laudo só.
    expect(recebidasPeloServidor.get(CHAVE_A)).toBe(2);
    expect(recebidasPeloServidor.get(CHAVE_B)).toBe(1);
    expect(recebidasPeloServidor.get(CHAVE_C)).toBe(1);

    const resumoFinal = await fila.resumo();
    expect(resumoFinal.pendentes).toBe(0);
    expect(resumoFinal.bloqueados).toBe(0);
  });
});

describe("Fotos da coleta", () => {
  const FOTO_A = "ffffffff-1111-4111-8111-000000000001";
  const FOTO_B = "ffffffff-2222-4222-8222-000000000002";

  function foto(chaveIdem: string, ordem: number): FotoLocal {
    return {
      idempotencyKey: chaveIdem,
      uriLocal: `file:///fotos/${ordem}.jpg`,
      nomeArquivo: `IMG_000${ordem}.jpg`,
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024 * (ordem + 1),
      capturadaEm: MOMENTO.toISOString(),
      legenda: `Foto ${ordem}`,
      ordem,
    };
  }

  /** Sistema de arquivos do aparelho, simulado. */
  function arquivosFalsos(): Arquivos & { lidos: string[] } {
    const lidos: string[] = [];
    return {
      lidos,
      async ler(uri: string) {
        lidos.push(uri);
        return new Uint8Array([1, 2, 3, 4]);
      },
    };
  }

  function comFotos(
    parcial: Partial<Transporte>,
    arquivos: Arquivos,
    extras: Partial<Parameters<typeof criarFilaDeSincronizacao>[0]> = {},
  ) {
    const loja = lojaEmMemoria();
    const tempo = relogio();
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteFalso(parcial),
      arquivos,
      agora: tempo.agora,
      dormir: async () => undefined,
      ruido: () => 0.5,
      ...extras,
    });
    return { fila, tempo, loja };
  }

  function autorizacaoDe(alvo: { idempotencyKey: string }, jaEnviada = false) {
    return {
      evidenciaId: `ev-${alvo.idempotencyKey}`,
      chave: `tenant/org/ocorrencias/oc/${alvo.idempotencyKey}.jpg`,
      url: `https://armazenamento.exemplo/${alvo.idempotencyKey}`,
      cabecalhos: { "content-type": "image/jpeg" },
      jaEnviada,
    };
  }

  it("as fotos sobem antes do envelope, e o envelope leva as chaves do servidor", async () => {
    const ordem: string[] = [];
    const arquivos = arquivosFalsos();
    const { fila } = comFotos({
      autorizarFoto: async ({ foto: f }) => {
        ordem.push(`autorizou:${f.idempotencyKey}`);
        return autorizacaoDe(f);
      },
      enviarBytes: async (url) => { ordem.push(`bytes:${url.split("/").pop()}`); },
      confirmarFoto: async (id) => { ordem.push(`confirmou:${id}`); },
      enviar: async (e) => {
        ordem.push(`envelope:${e.vistoria.fotos.map((f) => f.chave).join(",")}`);
        return { vistoriaId: "v1", duplicada: false };
      },
    }, arquivos);

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0), foto(FOTO_B, 1)],
    });

    const r = await fila.drenar();

    expect(r.fotosEnviadas).toBe(2);
    expect(r.enviados).toBe(1);
    // O envelope e sempre o ultimo: ele referencia arquivos que precisam ja
    // existir, senao o laudo nasce apontando para foto que nao subiu.
    expect(ordem.at(-1)).toContain("envelope:");
    expect(ordem.at(-1)).toContain(FOTO_A);
    expect(ordem.at(-1)).toContain(FOTO_B);
    expect(ordem.at(-1)).toContain("tenant/org/ocorrencias/oc/");
    expect(arquivos.lidos).toEqual(["file:///fotos/0.jpg", "file:///fotos/1.jpg"]);
  });

  it("retoma da foto que faltou, sem reenviar as que ja subiram", async () => {
    let quebrarNaSegunda = true;
    const bytesEnviados: string[] = [];
    const arquivos = arquivosFalsos();

    const { fila, tempo } = comFotos({
      autorizarFoto: async ({ foto: f }) => autorizacaoDe(f),
      enviarBytes: async (url) => {
        const qual = url.split("/").pop()!;
        if (quebrarNaSegunda && qual === FOTO_B) {
          throw new FalhaTemporaria("Sem conexao com o armazenamento.");
        }
        bytesEnviados.push(qual);
      },
      confirmarFoto: async () => undefined,
      enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
    }, arquivos);

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0), foto(FOTO_B, 1)],
    });

    const primeira = await fila.drenar();
    expect(primeira.enviados).toBe(0);
    expect(bytesEnviados).toEqual([FOTO_A]);

    const meio = (await fila.itens())[0]!;
    expect(meio.fotos[0]!.enviada).toBe(true);
    expect(meio.fotos[1]!.enviada).toBe(false);

    quebrarNaSegunda = false;
    tempo.avancar(10 * 60_000);
    const segunda = await fila.drenar();

    expect(segunda.enviados).toBe(1);
    // Em conexao de borda de cidade, reenviar o que ja subiu e a diferenca
    // entre sincronizar e nao sincronizar.
    expect(bytesEnviados, "a primeira foto nao sobe de novo").toEqual([FOTO_A, FOTO_B]);
  });

  it("foto que o servidor ja tem nao e enviada de novo", async () => {
    const arquivos = arquivosFalsos();
    const { fila } = comFotos({
      autorizarFoto: async ({ foto: f }) => autorizacaoDe(f, true),
      enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
    }, arquivos);

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0)],
    });

    const r = await fila.drenar();
    expect(r.enviados).toBe(1);
    expect(r.fotosEnviadas).toBe(0);
    expect(arquivos.lidos, "nem chegou a abrir o arquivo no aparelho").toEqual([]);
  });

  it("URL de envio vencida e temporaria: pede outra na proxima tentativa", async () => {
    let venceu = true;
    let autorizacoes = 0;
    const arquivos = arquivosFalsos();

    const { fila, tempo } = comFotos({
      autorizarFoto: async ({ foto: f }) => {
        autorizacoes += 1;
        return autorizacaoDe(f);
      },
      enviarBytes: async () => {
        if (venceu) {
          venceu = false;
          throw new FalhaTemporaria("A autorizacao de envio venceu.");
        }
      },
      confirmarFoto: async () => undefined,
      enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
    }, arquivos);

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0)],
    });

    await fila.drenar();
    tempo.avancar(10 * 60_000);
    const segunda = await fila.drenar();

    expect(segunda.enviados).toBe(1);
    // Duas autorizacoes, uma evidencia: a chave de idempotencia da captura e
    // o que impede a segunda de criar linha orfa no banco.
    expect(autorizacoes).toBe(2);
  });

  it("recusa permanente do armazenamento bloqueia sem gastar bateria", async () => {
    const arquivos = arquivosFalsos();
    const { fila } = comFotos({
      autorizarFoto: async ({ foto: f }) => autorizacaoDe(f),
      enviarBytes: async () => {
        throw new FalhaPermanente("O armazenamento recusou o arquivo (415).", "storage_415");
      },
    }, arquivos);

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0)],
    });

    const r = await fila.drenar();
    expect(r.bloqueados).toBe(1);
    expect((await fila.itens())[0]!.ultimoErro).toContain("415");
  });

  it("coleta com foto numa fila sem acesso a arquivos bloqueia, e diz por que", async () => {
    // Erro de montagem do aplicativo, nao da rua: insistir nunca resolveria.
    const { fila } = montar({
      autorizarFoto: async ({ foto: f }) => autorizacaoDe(f),
    });

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000471/2026",
      fotos: [foto(FOTO_A, 0)],
    });

    const r = await fila.drenar();
    expect(r.bloqueados).toBe(1);
    expect((await fila.itens())[0]!.ultimoErro).toContain("acesso aos arquivos");
  });
});

describe("Assinatura de quem estava no local", () => {
  /**
   * A assinatura sobe pelo mesmo caminho das fotos, e o envelope precisa
   * separá-la delas.
   *
   * Sem essa separação, o traço que a moradora fez com o dedo entraria no
   * laudo como mais uma foto do registro fotográfico, e o campo de assinatura,
   * que é o que sustenta um termo de interdição quando alguém contesta,
   * ficaria vazio.
   */

  const arquivos: Arquivos = { ler: async () => new Uint8Array([1, 2, 3]) };

  function fotoLocal(id: string, nome: string, ordem: number): FotoLocal {
    return {
      idempotencyKey: id,
      uriLocal: `file:///${nome}`,
      nomeArquivo: nome,
      tipoConteudo: nome.endsWith(".png") ? "image/png" : "image/jpeg",
      tamanhoBytes: 3,
      capturadaEm: MOMENTO.toISOString(),
      ordem,
    };
  }

  it("sobe junto com as fotos e vai para o campo dela no envelope", async () => {
    const enviados: EnvelopeSincronizacao[] = [];
    const autorizadas: string[] = [];

    const { fila } = montar({
      autorizarFoto: async ({ foto }) => {
        autorizadas.push(foto.nomeArquivo);
        return {
          evidenciaId: `e-${foto.idempotencyKey}`,
          chave: `tenant/org/${foto.nomeArquivo}`,
          url: "https://balde.exemplo/put",
          cabecalhos: {},
          jaEnviada: false,
        };
      },
      enviarBytes: async () => undefined,
      confirmarFoto: async () => undefined,
      enviar: async (e) => { enviados.push(e); return { vistoriaId: "v1", duplicada: false }; },
    }, { arquivos });

    await fila.enfileirar(envelope(CHAVE_A), {
      protocolo: "000100/2026",
      fotos: [fotoLocal("f1", "trinca.jpg", 0), fotoLocal("f2", "talude.jpg", 1)],
      assinatura: fotoLocal("as", "assinatura.png", 2),
    });
    await fila.drenar();

    // As três subiram pelo mesmo caminho, com a mesma idempotência.
    expect(autorizadas.sort()).toEqual(["assinatura.png", "talude.jpg", "trinca.jpg"]);

    const enviado = enviados[0]!;
    // Mas o envelope separa: duas fotos no registro fotográfico...
    expect(enviado.vistoria.fotos.map((f) => f.chave)).toEqual([
      "tenant/org/trinca.jpg",
      "tenant/org/talude.jpg",
    ]);
    // ...e a assinatura no campo de assinatura.
    expect(enviado.vistoria.assinaturaChave).toBe("tenant/org/assinatura.png");
  });

  it("sem assinatura, o campo continua sendo o que a coleta declarou", async () => {
    // Coleta sem traço é situação normal: o morador pode se recusar a assinar,
    // e o agente registra isso no laudo. O envelope não pode inventar chave.
    const enviados: EnvelopeSincronizacao[] = [];
    const { fila } = montar({
      autorizarFoto: async ({ foto }) => ({
        evidenciaId: "e1", chave: `tenant/org/${foto.nomeArquivo}`,
        url: "https://balde.exemplo/put", cabecalhos: {}, jaEnviada: false,
      }),
      enviarBytes: async () => undefined,
      confirmarFoto: async () => undefined,
      enviar: async (e) => { enviados.push(e); return { vistoriaId: "v1", duplicada: false }; },
    }, { arquivos });

    await fila.enfileirar(envelope(CHAVE_B), {
      protocolo: "000101/2026",
      fotos: [fotoLocal("f1", "trinca.jpg", 0)],
    });
    await fila.drenar();

    expect(enviados[0]!.vistoria.fotos).toHaveLength(1);
    expect(enviados[0]!.vistoria.assinaturaChave).toBe("assinatura.png");
  });

  it("o envio da assinatura retoma de onde parou, como o das fotos", async () => {
    /*
      O cenário: as duas fotos sobem, o sinal cai antes da assinatura. Na
      próxima tentativa, só a assinatura pode subir de novo. Reenviar as fotos
      gastaria a franquia de dados do agente, e num plano de prefeitura isso
      acaba antes do fim do mês.
    */
    let falhar = true;
    const autorizadas: string[] = [];

    const { fila, tempo } = montar({
      autorizarFoto: async ({ foto }) => {
        if (falhar && foto.nomeArquivo === "assinatura.png") {
          throw new FalhaTemporaria("sinal caiu antes da assinatura");
        }
        autorizadas.push(foto.nomeArquivo);
        return {
          evidenciaId: `e-${foto.idempotencyKey}`,
          chave: `tenant/org/${foto.nomeArquivo}`,
          url: "https://balde.exemplo/put", cabecalhos: {}, jaEnviada: false,
        };
      },
      enviarBytes: async () => undefined,
      confirmarFoto: async () => undefined,
      enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
    }, { arquivos });

    await fila.enfileirar(envelope(CHAVE_C), {
      protocolo: "000102/2026",
      fotos: [fotoLocal("f1", "trinca.jpg", 0), fotoLocal("f2", "talude.jpg", 1)],
      assinatura: fotoLocal("as", "assinatura.png", 2),
    });

    await fila.drenar();
    expect(autorizadas).toEqual(["trinca.jpg", "talude.jpg"]);

    falhar = false;
    autorizadas.length = 0;
    // O item ficou adiado com espera crescente. Avançar o relógio é o que
    // permite testar a retomada sem esperar de verdade.
    tempo.avancar(10 * 60_000);
    await fila.drenar();

    // Só a assinatura foi pedida de novo. As duas fotos já tinham chave.
    expect(autorizadas).toEqual(["assinatura.png"]);
  });
});
