/**
 * A lápide da coleta, do nascimento à sepultura.
 *
 * O defeito que estes testes travam é a vistoria duplicada: entre concluir a
 * coleta (que apaga o rascunho) e a próxima atualização bem sucedida da lista
 * de tarefas (que offline leva horas), nada no aparelho lembrava que aquela
 * ocorrência já tinha sido vistoriada. Um toque abria vistoria nova, com chave
 * de idempotência nova, e o servidor aceitava as duas: dois laudos, um
 * protocolo.
 *
 * Aqui o banco é SQLite DE VERDADE, em memória, e não um mapa fingindo de
 * tabela. A diferença importa em cada um destes testes: a chave primária que
 * impede duas lápides da mesma ocorrência, o `ON CONFLICT DO UPDATE` que
 * substitui a lápide arquivada, o `WHERE situacao = 'na_fila'` que impede a
 * promoção indevida e o `DELETE` do logout só existem no SQL. Num banco falso,
 * todos passariam sem nunca terem sido executados.
 */

import { DatabaseSync } from "node:sqlite";

/*
  Uma instância só, viva entre as reaberturas.

  `apagarDadosLocais` termina chamando `esquecerConexao()`, e a próxima
  chamada a `bancoLocal()` abre de novo. Se cada abertura devolvesse um banco
  novo e vazio, o teste do logout passaria sem nunca ter apagado nada: o dado
  sumiria porque o banco sumiu, que é exatamente o contrário do que se quer
  provar. Um aparelho de verdade reabre o MESMO arquivo.
*/
let mockBanco: DatabaseSync | null = null;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
      async withTransactionAsync(corpo: () => Promise<void>) {
        db.exec("BEGIN");
        try { await corpo(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
  },
}));

/* O logout também varre as assinaturas do disco, que não existem aqui. */
jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class {},
}));

import { apagarDadosLocais, bancoLocal, esquecerConexao } from "./banco-local";
import {
  arquivarColeta, coletaDe, esquecerColeta, listarColetas, marcarColetada, marcarEnviada,
} from "./coletas";
import { aplicarReconciliacao } from "./pendencias";

const OCORRENCIA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "99999999-9999-4999-8999-999999999999";

function coleta(ocorrenciaId = OCORRENCIA, chave = "22222222-2222-4222-8222-222222222222") {
  return {
    ocorrenciaId,
    idempotencyKey: chave,
    protocolo: "2026/000123",
    coletadaEm: "2026-09-09T13:00:00.000Z",
  };
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
});

describe("a tabela coletas", () => {
  it("existe no esquema local, com a ocorrência como chave primária", async () => {
    const db = await bancoLocal();
    const colunas = await db.getAllAsync<{ name: string; pk: number }>(
      "PRAGMA table_info(coletas)", [],
    );
    expect(colunas.map((c) => c.name)).toEqual([
      "ocorrencia_id", "idempotency_key", "protocolo", "coletada_em", "situacao",
    ]);
    expect(colunas.filter((c) => c.pk === 1).map((c) => c.name)).toEqual(["ocorrencia_id"]);
  });

  /*
    Uma ocorrência, uma lápide. Se a chave primária fosse a de idempotência,
    duas coletas da mesma ocorrência conviveriam na tabela, e a pergunta que a
    tela faz ("esta ocorrência já foi coletada aqui?") passaria a ter duas
    respostas.
  */
  it("guarda uma lápide por ocorrência, e a segunda substitui a primeira", async () => {
    await marcarColetada(coleta());
    await marcarColetada({ ...coleta(), idempotencyKey: "chave-nova" });
    const todas = await listarColetas();
    expect(todas).toHaveLength(1);
    expect(todas[0]?.idempotencyKey).toBe("chave-nova");
  });
});

describe("marcarColetada, coletaDe e esquecerColeta", () => {
  it("a coleta gravada nasce na fila e é encontrada pela ocorrência", async () => {
    await marcarColetada(coleta());
    expect(await coletaDe(OCORRENCIA)).toEqual({
      ocorrenciaId: OCORRENCIA,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      protocolo: "2026/000123",
      coletadaEm: "2026-09-09T13:00:00.000Z",
      situacao: "na_fila",
    });
  });

  it("ocorrência nunca coletada não tem lápide", async () => {
    await marcarColetada(coleta());
    expect(await coletaDe(OUTRA)).toBeNull();
  });

  it("esquecerColeta apaga só a lápide pedida", async () => {
    await marcarColetada(coleta());
    await marcarColetada(coleta(OUTRA, "outra-chave"));
    await esquecerColeta(OCORRENCIA);
    expect(await coletaDe(OCORRENCIA)).toBeNull();
    expect(await coletaDe(OUTRA)).not.toBeNull();
  });

  /*
    Situação ilegível vira `na_fila`, que BARRA. Errar barrando custa ao agente
    um toque a mais na saída deliberada; errar liberando custa um segundo laudo
    do mesmo protocolo.
  */
  it("situação desconhecida no disco é lida como na_fila", async () => {
    const db = await bancoLocal();
    await db.runAsync(
      `INSERT INTO coletas (ocorrencia_id, idempotency_key, protocolo, coletada_em, situacao)
       VALUES (?, 'k', 'p', 'q', 'lixo_de_versao_antiga')`,
      [OCORRENCIA],
    );
    expect((await coletaDe(OCORRENCIA))?.situacao).toBe("na_fila");
  });
});

describe("a promoção para enviada", () => {
  it("a fila confirmando leva a lápide de na_fila para enviada", async () => {
    await marcarColetada(coleta());
    await marcarEnviada(OCORRENCIA);
    expect((await coletaDe(OCORRENCIA))?.situacao).toBe("enviada");
  });

  /*
    A ordem que acontece de verdade: o agente arquiva a lápide offline para
    revistoriar, e a confirmação da coleta ANTIGA só chega quando o sinal
    volta. Sem o `WHERE situacao = 'na_fila'`, essa confirmação atrasada
    ressuscitaria a barreira e a revistoria autorizada seria bloqueada, sem
    nada na tela explicando por quê.
  */
  it("confirmação atrasada não ressuscita a lápide já arquivada", async () => {
    await marcarColetada(coleta());
    await arquivarColeta(OCORRENCIA);
    await marcarEnviada(OCORRENCIA);
    expect((await coletaDe(OCORRENCIA))?.situacao).toBe("arquivada");
  });
});

describe("arquivarColeta", () => {
  it("arquiva sem apagar: o registro da coleta anterior continua no aparelho", async () => {
    await marcarColetada(coleta());
    await arquivarColeta(OCORRENCIA);
    const guardada = await coletaDe(OCORRENCIA);
    expect(guardada?.situacao).toBe("arquivada");
    expect(guardada?.idempotencyKey).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("a coleta seguinte substitui a arquivada, com a chave nova", async () => {
    await marcarColetada(coleta());
    await arquivarColeta(OCORRENCIA);
    await marcarColetada(coleta(OCORRENCIA, "chave-da-revistoria"));
    const guardada = await coletaDe(OCORRENCIA);
    expect(guardada?.situacao).toBe("na_fila");
    expect(guardada?.idempotencyKey).toBe("chave-da-revistoria");
  });
});

describe("aplicarReconciliacao", () => {
  /*
    O servidor confirmando é o único momento em que a lápide pode sair. É
    também o que impede a tabela de crescer por todo o tempo de vida de um
    aparelho que roda o ano inteiro.
  */
  it("vistoria concluída no servidor apaga a lápide", async () => {
    await marcarColetada(coleta());
    await aplicarReconciliacao([{ id: OCORRENCIA, status: "vistoria_concluida" }]);
    expect(await coletaDe(OCORRENCIA)).toBeNull();
  });

  /*
    Encerrada, devolvida e mudança de equipe significam que a coleta NÃO
    chegou. A que está na fila continua sendo a única prova de que o agente
    esteve lá, e a lápide continua sendo o que impede coletar de novo por cima.
  */
  it("ocorrência encerrada sem vistoria mantém a lápide", async () => {
    await marcarColetada(coleta());
    await aplicarReconciliacao([{ id: OCORRENCIA, status: "encerrada" }]);
    expect(await coletaDe(OCORRENCIA)).not.toBeNull();
  });

  it("apaga só as confirmadas, e deixa as outras em pé", async () => {
    await marcarColetada(coleta());
    await marcarColetada(coleta(OUTRA, "outra-chave"));
    await aplicarReconciliacao([
      { id: OCORRENCIA, status: "vistoria_concluida" },
      { id: OUTRA, status: "triagem" },
    ]);
    expect(await coletaDe(OCORRENCIA)).toBeNull();
    expect(await coletaDe(OUTRA)).not.toBeNull();
  });
});

describe("o logout de aparelho compartilhado", () => {
  /*
    O aparelho de Defesa Civil de município pequeno passa de turno em turno. A
    lápide guarda protocolo e horário da vistoria que o agente do dia fez;
    deixá-la fora do `DELETE` entregaria essa lista ao agente da noite, que é o
    vazamento que aquele bloco existe para impedir.
  */
  it("apagarDadosLocais leva as lápides junto com o resto", async () => {
    await marcarColetada(coleta());
    await marcarColetada(coleta(OUTRA, "outra-chave"));
    expect(await listarColetas()).toHaveLength(2);

    await apagarDadosLocais();

    expect(await listarColetas()).toEqual([]);
  });
});
