/**
 * O rascunho que já estava no aparelho quando o aplicativo mudou.
 *
 * O cenário é banal e caro: o agente começa a vistoria de manhã, marca o
 * checklist, tira quatro fotos, captura o GPS e colhe a assinatura. A vistoria
 * fica no aparelho porque não há sinal. O aplicativo atualiza. O item
 * "necessário acionar outro órgão" agora se desdobra numa lista de órgãos, e o
 * rascunho gravado ontem não tem esse campo.
 *
 * `JSON.parse` não reclama de formato antigo: ele devolve um objeto sem a
 * propriedade. Sem conversão explícita na leitura, a tela lê `undefined` onde
 * espera uma lista, a renderização estoura, e o agente perde meia hora de
 * barranco, no morro, sem ter como recuperar. É exatamente o desfecho que
 * gravar a cada toque existe para impedir.
 *
 * O precedente é `normalizar()` em `@dc360/campo`, que converte formato antigo
 * na leitura da fila. Aqui vale a mesma regra: a migração acontece no único
 * ponto por onde o rascunho volta para a tela, por mecanismo e não por
 * disciplina de quem escrever a próxima tela.
 */

import { DatabaseSync } from "node:sqlite";

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

jest.mock("expo-file-system", () => ({
  Paths: { document: "/documentos" },
  Directory: class { list() { return []; } },
  File: class {},
}));

import { bancoLocal, esquecerConexao } from "./banco-local";
import { lerRascunho, listarRascunhos, salvarRascunho } from "./rascunho";

const ID = "oc-de-ontem";

/**
 * O rascunho como o aplicativo da véspera o gravou: com trabalho de campo
 * dentro e SEM o campo dos órgãos.
 */
const RASCUNHO_ANTIGO = {
  ocorrenciaId: ID,
  protocolo: "2026/000123",
  idempotencyKey: "chave-da-coleta-de-ontem",
  checklist: {
    risco_iminente: true,
    evacuacao_necessaria: true,
    interdicao_indicada: true,
    acionar_outro_orgao: true,
  },
  fotos: [{
    idempotencyKey: "foto-1",
    uriLocal: "file:///foto-1.jpg",
    nomeArquivo: "vistoria-2026-000123-1.jpg",
    tipoConteudo: "image/jpeg",
    tamanhoBytes: 2048,
    capturadaEm: "2026-09-08T10:10:00.000Z",
    ordem: 0,
  }],
  gpsPrecisaoMetros: 7,
  coordenada: { lat: -27.595378, lng: -48.548050 },
  assinanteNome: "Maria de exemplo",
  assinaturaUri: "file:///assinatura-1.png",
  observacoes: "Trinca de três centímetros na parede dos fundos.",
  pessoas: { desalojados: "4" },
  coletadaEm: "2026-09-08T10:00:00.000Z",
  atualizadoEm: "2026-09-08T10:40:00.000Z",
};

async function gravarComoAVersaoAntiga(conteudo: unknown): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    `INSERT INTO rascunhos (ocorrencia_id, conteudo, atualizado_em) VALUES (?, ?, ?)`,
    [ID, JSON.stringify(conteudo), "2026-09-08T10:40:00.000Z"],
  );
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
});

describe("abrir um rascunho gravado antes do desdobramento", () => {
  it("devolve a lista de órgãos vazia, e não indefinida", async () => {
    // `undefined` aqui é a tela quebrando no `.length` da renderização, com o
    // trabalho do agente dentro e sem caminho de volta.
    await gravarComoAVersaoAntiga(RASCUNHO_ANTIGO);

    const lido = await lerRascunho(ID);

    expect(lido?.orgaosParaAcionar).toEqual([]);
  });

  it("não perde nada do que já estava preenchido", async () => {
    /*
      A conversão não pode ser uma reconstrução: fotos, GPS, assinatura,
      observações e contagem de pessoas são meia hora de barranco com alguém
      esperando na porta, e a chave de idempotência é o que impede a coleta de
      virar duas quando ela finalmente subir.
    */
    await gravarComoAVersaoAntiga(RASCUNHO_ANTIGO);

    const lido = await lerRascunho(ID);

    expect(lido).toEqual({ ...RASCUNHO_ANTIGO, orgaosParaAcionar: [] });
  });

  it("a lista de rascunhos da tela inicial também converte", async () => {
    // A tela de tarefas mostra os rascunhos em andamento. Converter só numa das
    // duas leituras deixaria o defeito vivo no caminho mais usado do aplicativo.
    await gravarComoAVersaoAntiga(RASCUNHO_ANTIGO);

    const todos = await listarRascunhos();

    expect(todos).toHaveLength(1);
    expect(todos[0]?.orgaosParaAcionar).toEqual([]);
  });

  it("a conversão não é palpite: ninguém inventa um órgão para desbloquear", async () => {
    /*
      O rascunho antigo respondeu "sim" ao item. A tentação seria preencher a
      lista com alguma coisa para o botão de concluir liberar, e isso escreveria
      no laudo um nome que ninguém disse. Vazio faz a conclusão cobrar, e cobrar
      é o certo: o agente ainda está com a tela aberta e responde num toque.
    */
    await gravarComoAVersaoAntiga(RASCUNHO_ANTIGO);

    const lido = await lerRascunho(ID);

    expect(lido?.checklist["acionar_outro_orgao"]).toBe(true);
    expect(lido?.orgaosParaAcionar).toEqual([]);
  });

  it("rascunho já no formato novo passa intacto", async () => {
    // A conversão não pode reescrever o que já está certo: o agente que escolheu
    // os órgãos antes de fechar o aplicativo os encontra de volta.
    const novo = {
      ...RASCUNHO_ANTIGO,
      orgaosParaAcionar: [{ orgaoId: null, nome: "Concessionária de energia" }],
      assinaturaIdempotencyKey: null,
    };
    await salvarRascunho(novo);

    const lido = await lerRascunho(ID);

    expect(lido?.orgaosParaAcionar).toEqual([
      { orgaoId: null, nome: "Concessionária de energia" },
    ]);
  });
});
