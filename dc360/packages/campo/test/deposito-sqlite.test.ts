import { describe, expect, it } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  criarFilaDeSincronizacao, depositoSobreChaveValor, lojaSqlite, prepararSqlite,
  type BancoSqlite, type Transporte,
} from "../src/index.js";

/**
 * Persistência da fila em SQLite.
 *
 * O aparelho não está aqui, mas a parte que dá para verificar fora dele é
 * justamente a que costuma quebrar: o SQL emitido, o comportamento de
 * sobrescrita e a ordem de leitura. O que resta comprovar no celular é se o
 * `expo-sqlite` guarda o que promete quando o sistema mata o processo.
 */

/** Banco falso: um mapa por baixo, registrando o SQL que passou. */
function bancoFalso(): BancoSqlite & {
  sql: string[];
  tabela: Map<string, { valor: string; em: string }>;
} {
  const tabela = new Map<string, { valor: string; em: string }>();
  const sql: string[] = [];

  return {
    tabela,
    sql,
    async execAsync(comando: string) {
      sql.push(comando);
    },
    async runAsync(comando: string, params: readonly unknown[] = []) {
      sql.push(comando);
      if (/^INSERT/i.test(comando.trim())) {
        tabela.set(String(params[0]), { valor: String(params[1]), em: String(params[2]) });
      } else if (/^DELETE/i.test(comando.trim())) {
        tabela.delete(String(params[0]));
      }
      return undefined;
    },
    async getAllAsync<T>(comando: string) {
      sql.push(comando);
      return [...tabela.entries()]
        .sort((a, b) => (a[1].em + a[0]).localeCompare(b[1].em + b[0]))
        .map(([chave]) => ({ chave })) as T[];
    },
    async getFirstAsync<T>(comando: string, params: readonly unknown[] = []) {
      sql.push(comando);
      const linha = tabela.get(String(params[0]));
      return (linha ? { valor: linha.valor } : null) as T | null;
    },
  };
}

/** Quem esta logado no aparelho durante estes testes. */
const AGENTE = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};

const CHAVE_A = "11111111-1111-4111-8111-111111111111";
const CHAVE_B = "22222222-2222-4222-8222-222222222222";

function envelope(chave: string): EnvelopeSincronizacao {
  const agora = new Date("2026-08-21T14:00:00.000Z").toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    coletadaEm: agora,
    vistoria: {
      checklist: [{ chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Moradora",
      assinaturaChave: null,
      coletadaEm: agora,
    },
  };
}

const transporte: Transporte = {
  enviar: async () => ({ vistoriaId: "v1", duplicada: false }),
  autorizarFoto: async () => { throw new Error("sem foto neste teste"); },
  enviarBytes: async () => { throw new Error("sem foto neste teste"); },
  confirmarFoto: async () => { throw new Error("sem foto neste teste"); },
};

describe("Preparação da tabela", () => {
  it("é idempotente: o aplicativo chama a cada abertura", async () => {
    const db = bancoFalso();
    await prepararSqlite(db);
    await prepararSqlite(db);
    // Sem `IF NOT EXISTS`, a segunda abertura do aplicativo estouraria.
    expect(db.sql.every((s) => s.includes("IF NOT EXISTS"))).toBe(true);
  });

  it("liga o modo de registro adiantado", async () => {
    const db = bancoFalso();
    await prepararSqlite(db);
    // WAL: escrita não bloqueia leitura, e a fila grava a cada foto enviada
    // enquanto a tela lê para mostrar o progresso.
    expect(db.sql.join("\n")).toContain("journal_mode = WAL");
  });
});

describe("Gravação", () => {
  it("sobrescreve sem nunca apagar a linha antes", async () => {
    const db = bancoFalso();
    const loja = lojaSqlite(db);

    await loja.escrever("dc360:fila:x", "primeiro");
    await loja.escrever("dc360:fila:x", "segundo");

    expect(await loja.ler("dc360:fila:x")).toBe("segundo");

    /*
      A fila grava a cada foto enviada. Um par apagar/inserir deixaria uma
      janela em que o item não existe, e se o sistema matar o aplicativo
      exatamente ali a coleta some.
    */
    const escritas = db.sql.filter((s) => /INSERT|DELETE/i.test(s));
    expect(escritas.every((s) => s.includes("ON CONFLICT"))).toBe(true);
    expect(escritas.some((s) => /^DELETE/i.test(s.trim()))).toBe(false);
  });

  it("remove de verdade", async () => {
    const db = bancoFalso();
    const loja = lojaSqlite(db);
    await loja.escrever("dc360:fila:x", "valor");
    await loja.remover("dc360:fila:x");
    expect(await loja.ler("dc360:fila:x")).toBeNull();
  });

  it("chave inexistente devolve nulo, não erro", async () => {
    const loja = lojaSqlite(bancoFalso());
    expect(await loja.ler("dc360:fila:nunca-existiu")).toBeNull();
  });

  it("lê as chaves em ordem estável", async () => {
    const db = bancoFalso();
    const loja = lojaSqlite(db);
    await loja.escrever("dc360:fila:b", "1");
    await loja.escrever("dc360:fila:a", "2");

    // A ordem de coleta é a ordem do laudo: ela não pode mudar entre
    // aberturas do aplicativo.
    const primeira = await loja.chaves();
    const segunda = await loja.chaves();
    expect(primeira).toEqual(segunda);
    expect(db.sql.some((s) => s.includes("ORDER BY"))).toBe(true);
  });
});

describe("A fila inteira sobre SQLite", () => {
  it("guarda a coleta e a recupera depois de reabrir o aplicativo", async () => {
    const db = bancoFalso();
    await prepararSqlite(db);

    const primeira = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaSqlite(db)),
      transporte,
      sessaoAtual: () => AGENTE,
    });
    await primeira.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    // Mesmo banco, instância nova: é o que acontece quando o sistema mata o
    // aplicativo em segundo plano e a pessoa reabre.
    const reaberta = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaSqlite(db)),
      transporte,
      sessaoAtual: () => AGENTE,
    });
    const itens = await reaberta.itens();

    expect(itens).toHaveLength(1);
    expect(itens[0]!.protocolo).toBe("000471/2026");
    expect(itens[0]!.envelope.vistoria.assinanteNome).toBe("Moradora");
  });

  it("drena e limpa, mantendo o que ainda falta", async () => {
    const db = bancoFalso();
    await prepararSqlite(db);

    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaSqlite(db)),
      sessaoAtual: () => AGENTE,
      transporte: {
        ...transporte,
        enviar: async (e) => {
          if (e.idempotencyKey === CHAVE_B) throw new Error("falha proposital");
          return { vistoriaId: "v", duplicada: false };
        },
      },
      reterConfirmadoMs: 0,
    });

    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.enfileirar(envelope(CHAVE_B), { protocolo: "000472/2026" });
    await fila.drenar();

    // O confirmado saiu do banco; o que falhou continua guardado.
    const restantes = await fila.itens();
    expect(restantes.map((i) => i.id)).toEqual([CHAVE_B]);
    expect(db.tabela.has(`dc360:fila:${CHAVE_A}`)).toBe(false);
    expect(db.tabela.has(`dc360:fila:${CHAVE_B}`)).toBe(true);
  });

  it("o que o banco guarda é JSON legível, não binário opaco", async () => {
    const db = bancoFalso();
    await prepararSqlite(db);
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaSqlite(db)),
      transporte,
      sessaoAtual: () => AGENTE,
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    const guardado = db.tabela.get(`dc360:fila:${CHAVE_A}`)!.valor;
    // Suporte a campo abre o banco do aparelho com uma ferramenta comum. Se o
    // conteúdo for opaco, ninguém consegue dizer o que ficou pendente.
    const objeto = JSON.parse(guardado);
    expect(objeto.protocolo).toBe("000471/2026");
    expect(objeto.estado).toBe("pendente");
  });
});
