import { describe, expect, it } from "vitest";
import type { DevolucaoDeTarefa, EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  devolucoesPorOcorrencia,
  impedimentoParaDevolver,
  lojaEmMemoria,
  temColetaNaFila,
  type AutorDaColeta,
  type DevolucaoSemAutor,
  type Transporte,
} from "../src/index.js";

/**
 * A tarefa vencida que o agente devolve para a coordenação.
 *
 * O que estes testes protegem não é o formato do pedido, é a sequência da rua:
 * o agente sobe o morro, a tarefa vence, ninguém atende no portão, e ele decide
 * devolver SEM SINAL. Entre esse toque e a coordenação saber pode passar meia
 * manhã, e nesse intervalo nada pode sumir do aparelho.
 *
 * Três coisas não podem acontecer, e cada uma tem caso aqui:
 *
 * 1. A devolução sumir antes de o servidor confirmar (a tarefa teria voltado
 *    para ninguém).
 * 2. A devolução subir com o nome de quem está no aparelho agora, em vez do
 *    nome de quem decidiu no morro.
 * 3. Uma devolução jogar fora uma coleta que está esperando envio.
 */

const MOMENTO = new Date("2026-09-13T14:00:00.000Z");

const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHAVE = "11111111-1111-4111-8111-111111111111";
const CHAVE_DA_COLETA = "22222222-2222-4222-8222-222222222222";

const AGENTE_A: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};
const AGENTE_B: AutorDaColeta = {
  usuarioId: "u-bruno", nome: "Bruno Lima", organizacaoId: "org-serra-alta",
};

function devolucao(chave = CHAVE, ocorrencia = OCORRENCIA): DevolucaoSemAutor {
  return {
    idempotencyKey: chave,
    ocorrenciaId: ocorrencia,
    decididaEm: MOMENTO.toISOString(),
    motivo: "morador_ausente",
  };
}

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
    enviar: async () => { throw new Error("enviar nao esperado neste teste"); },
    devolver: async () => ({ duplicada: false }),
    autorizarFoto: async () => { throw new Error("autorizarFoto nao esperado"); },
    enviarBytes: async () => { throw new Error("enviarBytes nao esperado"); },
    confirmarFoto: async () => { throw new Error("confirmarFoto nao esperado"); },
    ...parcial,
  };
}

function relogio(inicio = MOMENTO) {
  let atual = inicio.getTime();
  return { agora: () => new Date(atual), avancar: (ms: number) => { atual += ms; } };
}

function montar(transporte: Partial<Transporte>) {
  const loja = lojaEmMemoria();
  const tempo = relogio();
  const sessao = { atual: AGENTE_A as AutorDaColeta | null };
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte: transporteFalso(transporte),
    sessaoAtual: () => sessao.atual,
    agora: tempo.agora,
    dormir: async () => undefined,
    ruido: () => 0.5,
  });
  return { fila, loja, tempo, sessao };
}

describe("quando a tela pode oferecer a devolução", () => {
  /*
    Sem a trava do prazo, um dia ruim vira uma lista limpa: o agente devolve
    tudo às oito da manhã e a coordenação descobre ao meio-dia.
  */
  it("tarefa no prazo não pode ser devolvida", () => {
    expect(impedimentoParaDevolver({ vencida: false, coletaNoAparelho: false }))
      .toBe("no_prazo");
  });

  it("tarefa vencida, sem coleta no aparelho, pode", () => {
    expect(impedimentoParaDevolver({ vencida: true, coletaNoAparelho: false }))
      .toBeNull();
  });

  /*
    O caso que custa uma vistoria: o agente coletou, o envio não saiu por falta
    de sinal, e a tarefa venceu. Devolver aqui apagaria a manhã dele.
  */
  it("tarefa vencida com coleta esperando envio não pode", () => {
    expect(impedimentoParaDevolver({ vencida: true, coletaNoAparelho: true }))
      .toBe("coleta_no_aparelho");
  });

  it("a coleta guardada vence o prazo na explicação, porque a frase errada ali custa a vistoria", () => {
    expect(impedimentoParaDevolver({ vencida: false, coletaNoAparelho: true }))
      .toBe("coleta_no_aparelho");
  });
});

describe("o pedido entra na fila", () => {
  it("guarda a devolução com o autor da sessão e ela sobrevive ao aplicativo fechar", async () => {
    const { fila, loja } = montar({});

    const r = await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    expect(r.enfileirada).toBe(true);
    const [item] = await fila.itens();
    expect(item!.tipo).toBe("devolucao");
    expect(item!.estado).toBe("pendente");
    expect(item!.autor).toEqual(AGENTE_A);
    expect(item!.protocolo).toBe("000471/2026");

    // O disco é a prova: fila nova, mesma loja, item continua lá.
    const outra = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteFalso({}),
      sessaoAtual: () => AGENTE_A,
    });
    expect(await outra.itens()).toHaveLength(1);
  });

  /*
    O aparelho velho demora a responder e o dedo toca de novo. Dois itens
    produziriam dois eventos de devolução para uma tarefa só.
  */
  it("tocar duas vezes não cria duas devoluções", async () => {
    const { fila } = montar({});

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const segunda = await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    expect(segunda).toMatchObject({ enfileirada: true, jaExistia: true });
    expect(await fila.itens()).toHaveLength(1);
  });

  it("uma segunda devolução da mesma ocorrência, com chave nova, também não", async () => {
    const { fila } = montar({});

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const outra = await fila.enfileirarDevolucao(
      devolucao("33333333-3333-4333-8333-333333333333"),
      { protocolo: "000471/2026" },
    );

    expect(outra).toMatchObject({ enfileirada: true, jaExistia: true });
    expect(await fila.itens()).toHaveLength(1);
  });

  /*
    Devolver por cima de uma coleta guardada faria a coordenação receber "não
    deu para vistoriar" sobre uma vistoria que existe, a dois toques dali.
  */
  it("recusa devolver tarefa que tem coleta na fila, e não enfileira nada", async () => {
    const { fila } = montar({});
    await fila.enfileirar(envelope(CHAVE_DA_COLETA), { protocolo: "000471/2026" });

    const r = await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    expect(r).toEqual({ enfileirada: false, motivo: "coleta_na_fila" });
    const itens = await fila.itens();
    expect(itens).toHaveLength(1);
    expect(itens[0]!.tipo).toBe("vistoria");
  });

  it("coleta de OUTRA ocorrência não impede nada", async () => {
    const { fila } = montar({});
    await fila.enfileirar(envelope(CHAVE_DA_COLETA, OUTRA), { protocolo: "000999/2026" });

    const r = await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    expect(r.enfileirada).toBe(true);
  });

  /*
    `devolvidaPor` é obrigatório no contrato e conferido pelo servidor. Sem
    sessão, o item ficaria parado para sempre e a tarefa teria sumido da lista
    do agente em troca de nada.
  */
  it("sem sessão aberta, não enfileira", async () => {
    const { fila, sessao } = montar({});
    sessao.atual = null;

    const r = await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });

    expect(r).toEqual({ enfileirada: false, motivo: "sem_sessao" });
    expect(await fila.itens()).toHaveLength(0);
  });
});

describe("o que sai pelo fio", () => {
  it("a devolução vai pela rota dela, com quem devolveu dentro", async () => {
    const enviadas: DevolucaoDeTarefa[] = [];
    const { fila } = montar({
      devolver: async (d) => { enviadas.push(d); return { duplicada: false }; },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const r = await fila.drenar();

    expect(r.enviados).toBe(1);
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]).toEqual({
      idempotencyKey: CHAVE,
      ocorrenciaId: OCORRENCIA,
      decididaEm: MOMENTO.toISOString(),
      motivo: "morador_ausente",
      devolvidaPor: AGENTE_A.usuarioId,
    });
  });

  /*
    O aparelho de plantão troca de turno. O autor é o de quem DECIDIU no morro,
    e não o de quem está logado na hora em que o sinal volta: a devolução é uma
    declaração assinada, como a vistoria.

    Repare que o item só sobe porque a sessão volta a ser a da autora. Enquanto
    Bruno está no aparelho, o portão de autoria não entrega o item ao dreno.
  */
  it("o autor é o de quem decidiu, e não o de quem estava logado no envio", async () => {
    const enviadas: DevolucaoDeTarefa[] = [];
    const { fila, sessao } = montar({
      devolver: async (d) => { enviadas.push(d); return { duplicada: false }; },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    sessao.atual = AGENTE_B;
    await fila.drenar();
    expect(enviadas, "coleta de outro agente nao sobe com a credencial dele").toHaveLength(0);

    sessao.atual = AGENTE_A;
    await fila.drenar();
    expect(enviadas[0]!.devolvidaPor).toBe(AGENTE_A.usuarioId);
  });

  it("nenhum envelope de vistoria sai pela devolução", async () => {
    let enviouVistoria = false;
    const { fila } = montar({
      enviar: async () => { enviouVistoria = true; return { vistoriaId: "v", duplicada: false }; },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    await fila.drenar();

    expect(enviouVistoria).toBe(false);
  });

  /*
    Reenvio da mesma chave é o normal da fila (o aplicativo morre no meio do
    envio, a resposta se perde no carro). O servidor responde o resultado da
    primeira vez, e a fila conta como duplicado em vez de contar duas devoluções.
  */
  it("o reenvio reconhecido pelo servidor conta como duplicado, não como devolução nova", async () => {
    const { fila } = montar({ devolver: async () => ({ duplicada: true }) });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const r = await fila.drenar();

    expect(r.duplicados).toBe(1);
    expect(r.enviados).toBe(0);
  });
});

describe("entre o toque e a confirmação do servidor", () => {
  /*
    O alívio do agente é a tarefa sair da lista, e a garantia do produto é ela
    NÃO sumir do aparelho antes de a coordenação saber. As duas convivem porque
    o item continua na fila, visível, até o servidor confirmar.
  */
  it("sem sinal, a devolução continua na fila esperando, e nada se perde", async () => {
    const { fila } = montar({
      devolver: async () => { throw new FalhaTemporaria("Sem conexao com o servidor."); },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const r = await fila.drenar();

    expect(r.adiados).toBe(1);
    const [item] = await fila.itens();
    expect(item!.estado, "sinal ruim nao e recusa do servidor").toBe("pendente");
    expect(devolucoesPorOcorrencia(await fila.itens()).get(OCORRENCIA)?.situacao)
      .toBe("a_caminho");
  });

  it("confirmada, ela continua visível por um tempo e depois sai da fila", async () => {
    const { fila, tempo } = montar({});

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    await fila.drenar();

    const [item] = await fila.itens();
    expect(item!.estado).toBe("confirmado");
    /* Enquanto o item existe, a tarefa continua fora da lista do agente. */
    expect(devolucoesPorOcorrencia(await fila.itens()).get(OCORRENCIA)?.situacao)
      .toBe("a_caminho");

    tempo.avancar(31_000);
    await fila.drenar();
    expect(await fila.itens()).toHaveLength(0);
  });
});

describe("quando o servidor recusa", () => {
  /*
    A recusa que existe de verdade: o relógio de quem decide é o do SERVIDOR, e
    o aparelho pode estar adiantado. A tarefa precisa VOLTAR para a lista, com a
    frase que veio de lá, em vez de sumir sem ninguém ter recebido nada.
  */
  it("a devolução recusada fica marcada como recusada, com a frase do servidor", async () => {
    const { fila } = montar({
      devolver: async () => {
        throw new FalhaPermanente(
          "Esta tarefa ainda não venceu. Só é possível devolver depois do prazo.",
          "ainda_no_prazo",
        );
      },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    const estado = devolucoesPorOcorrencia(await fila.itens()).get(OCORRENCIA);
    expect(estado?.situacao).toBe("recusada");
    expect(estado?.mensagem).toBe(
      "Esta tarefa ainda não venceu. Só é possível devolver depois do prazo.",
    );
  });

  /*
    Recusada não é item preso: os dois verbos da tela continuam valendo, e o
    reenvio devolve o item para a fila em vez de exigir que alguém apague.
  */
  it("a devolução recusada tem saída: dá para tentar de novo", async () => {
    let recusar = true;
    const { fila } = montar({
      devolver: async () => {
        if (recusar) throw new FalhaPermanente("Equipe errada.", "equipe_divergente");
        return { duplicada: false };
      },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    await fila.drenar();
    const [bloqueado] = await fila.itens();
    expect(bloqueado!.estado).toBe("bloqueado");

    recusar = false;
    await fila.reenviar(bloqueado!.id);
    await fila.drenar();

    const [depois] = await fila.itens();
    expect(depois!.estado).toBe("confirmado");
  });

  it("e também dá para descartar o pedido recusado", async () => {
    const { fila } = montar({
      devolver: async () => { throw new FalhaPermanente("Equipe errada.", "equipe_divergente"); },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    await fila.drenar();
    const [item] = await fila.itens();

    await fila.descartar(item!.id);

    expect(await fila.itens()).toHaveLength(0);
  });

  /*
    `ja_encerrada` arquiva, como na coleta. Para a devolução isso também é
    recusa: a coordenação não recebeu devolução nenhuma, e a tarefa precisa
    reaparecer com a explicação em vez de sumir em silêncio.
  */
  it("ocorrência encerrada no painel também devolve a tarefa para a lista", async () => {
    const { fila } = montar({
      devolver: async () => {
        throw new FalhaPermanente("A ocorrência já foi encerrada.", "ja_encerrada");
      },
    });

    await fila.enfileirarDevolucao(devolucao(), { protocolo: "000471/2026" });
    await fila.drenar();

    const [item] = await fila.itens();
    expect(item!.estado).toBe("arquivado");
    expect(devolucoesPorOcorrencia(await fila.itens()).get(OCORRENCIA)?.situacao)
      .toBe("recusada");
  });
});

describe("o que a fila conta para as telas", () => {
  it("enviando também é a caminho: a tarefa não volta para a lista no meio do envio", async () => {
    const itens = [
      { tipo: "devolucao", ocorrenciaId: OCORRENCIA, estado: "enviando", ultimaFalha: null },
    ] as never;
    expect(devolucoesPorOcorrencia(itens).get(OCORRENCIA)?.situacao).toBe("a_caminho");
  });

  it("coleta na fila é reconhecida em qualquer estado, inclusive bloqueada", async () => {
    const { fila } = montar({
      enviar: async () => { throw new FalhaPermanente("Dado invalido.", "dados_invalidos"); },
    });
    await fila.enfileirar(envelope(CHAVE_DA_COLETA), { protocolo: "000471/2026" });
    await fila.drenar();

    const itens = await fila.itens();
    expect(itens[0]!.estado).toBe("bloqueado");
    expect(temColetaNaFila(itens, OCORRENCIA)).toBe(true);
  });

  it("fila sem devolução nenhuma não esconde tarefa alguma", async () => {
    const { fila } = montar({});
    await fila.enfileirar(envelope(CHAVE_DA_COLETA), { protocolo: "000471/2026" });

    expect(devolucoesPorOcorrencia(await fila.itens()).size).toBe(0);
  });
});

describe("o aparelho que atualiza com item antigo na fila", () => {
  /*
    Item gravado antes de existir `tipo` é sempre vistoria: a devolução nasce
    junto com o campo. Lido como qualquer outra coisa, uma manhã de coleta sairia
    pela rota errada e seria recusada para sempre.
  */
  it("item sem tipo no disco é lido como vistoria", async () => {
    const antigo = {
      id: CHAVE_DA_COLETA,
      ocorrenciaId: OCORRENCIA,
      protocolo: "000471/2026",
      envelope: envelope(CHAVE_DA_COLETA),
      estado: "pendente",
      tentativas: 0,
      criadoEm: MOMENTO.toISOString(),
      liberadoEm: MOMENTO.toISOString(),
      ultimaFalha: null,
      confirmadoEm: null,
      fotos: [],
    };
    const loja = lojaEmMemoria({
      [`dc360:fila:${CHAVE_DA_COLETA}`]: JSON.stringify(antigo),
    });
    const deposito = depositoSobreChaveValor(loja);

    const [item] = await deposito.listar();

    expect(item!.tipo).toBe("vistoria");
    expect(item!.envelope!.vistoria.assinanteNome).toBe("Moradora");
  });
});
