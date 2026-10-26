import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Consulta } from "../src/banco/tipos.js";

/**
 * Idempotência da criação do chamado e da evidência (V2-F02-E07).
 *
 * O DEFEITO. `POST /ocorrencias` não tinha chave: toque duplo, ou reenvio do
 * formulário sob sinal ruim, criava dois chamados e queimava dois números do
 * protocolo oficial (`proximo_protocolo` roda antes do INSERT). E a busca por
 * `idempotency_key` em `/evidencias/autorizar-envio` não conferia a ocorrência:
 * a chave repetida em OUTRA ocorrência devolvia a evidência da primeira.
 *
 * O que estes testes provam, na ordem do que a etapa promete:
 *  1. mesma chave, mesmo `id` e `protocolo`, e o contador do protocolo andou uma vez;
 *  2. sem chave, dois chamados (o comportamento de sempre);
 *  3. chave que não é uuid, 422;
 *  4. a mesma chave nos municípios A e B cria um chamado em cada;
 *  5. a corrida: o segundo pedido cai no índice único, a transação volta inteira
 *     (a sequência não é consumida), a rota relê e devolve;
 *  6. a mesma chave de foto em outra ocorrência é 409 `chave_ja_usada_em_outro_registro`.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const ORG_B = "22222222-2222-4222-8222-000000000002";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const EQUIPE_UNICA = "22222222-2222-4222-8222-0000000000e1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;
let tokenAgenteA: string;
let tokenAgenteB: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });
const chaveNova = () => crypto.randomUUID();

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

function corpo(extras: Record<string, unknown> = {}) {
  return {
    solicitanteNome: "Marilda Souza Prado",
    canalEntrada: "telefone",
    endereco: "Rua do Temporal, 21",
    tipo: "deslizamento",
    descricao: "Talude cedeu durante a chuva da noite.",
    ...extras,
  };
}

function abrir(token: string, extras: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/ocorrencias",
    headers: com(token),
    payload: corpo(extras),
  });
}

/** O último número emitido na sequência do município, no ano, lido como dono do banco. */
async function ultimoDaSequencia(org: string): Promise<number> {
  const r = await mem.bruto.query<{ ultimo: number }>(
    "SELECT COALESCE(sum(ultimo), 0)::int AS ultimo FROM protocolo_sequencias WHERE organizacao_id = $1",
    [org],
  );
  return r.rows[0]!.ultimo;
}

async function quantosComAChave(org: string, chave: string): Promise<number> {
  const r = await mem.bruto.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM ocorrencias WHERE organizacao_id = $1 AND chave_de_criacao = $2",
    [org, chave],
  );
  return r.rows[0]!.n;
}

async function quantosEventosDeRegistro(ocorrenciaId: string): Promise<number> {
  const r = await mem.bruto.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'registro'",
    [ocorrenciaId],
  );
  return r.rows[0]!.n;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-chave-de-criacao-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenA = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenB = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
  tokenAgenteA = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenAgenteB = await entrar("tarcisio.ramos@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("criação do chamado com chave", () => {
  it("a mesma chave duas vezes devolve o MESMO id e protocolo, e a sequência avança uma vez", async () => {
    const chave = chaveNova();
    const antes = await ultimoDaSequencia(ORG_A);

    const primeira = await abrir(tokenA, { chaveDeCriacao: chave });
    expect(primeira.statusCode, primeira.body).toBe(201);
    const depoisDaPrimeira = await ultimoDaSequencia(ORG_A);
    expect(depoisDaPrimeira).toBe(antes + 1);

    const segunda = await abrir(tokenA, { chaveDeCriacao: chave });
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json()).toEqual(primeira.json());
    expect(Object.keys(segunda.json()).sort()).toEqual(["id", "protocolo"]);

    // A repetição não consumiu número nenhum, e não há segundo chamado.
    expect(await ultimoDaSequencia(ORG_A)).toBe(depoisDaPrimeira);
    expect(await quantosComAChave(ORG_A, chave)).toBe(1);
    // Nem segundo "registro" na trilha: o evento é do nascimento, não do reenvio.
    expect(await quantosEventosDeRegistro(primeira.json().id)).toBe(1);
  }, 60_000);

  it("o reenvio com o corpo diferente ainda devolve o chamado original, sem alterá-lo", async () => {
    const chave = chaveNova();
    const primeira = await abrir(tokenA, { chaveDeCriacao: chave, endereco: "Rua Original, 1" });
    const reenvio = await abrir(tokenA, { chaveDeCriacao: chave, endereco: "Rua Outra, 999" });
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json().id).toBe(primeira.json().id);
    const linha = await mem.bruto.query<{ endereco: string }>(
      "SELECT endereco FROM ocorrencias WHERE id = $1",
      [primeira.json().id],
    );
    expect(linha.rows[0]!.endereco).toBe("Rua Original, 1");
  }, 60_000);

  it("sem chave, dois pedidos são dois chamados distintos (o comportamento de sempre)", async () => {
    const antes = await ultimoDaSequencia(ORG_A);
    const a = await abrir(tokenA);
    const b = await abrir(tokenA);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().id).not.toBe(b.json().id);
    expect(a.json().protocolo).not.toBe(b.json().protocolo);
    expect(await ultimoDaSequencia(ORG_A)).toBe(antes + 2);
  }, 60_000);

  it("chaves diferentes são chamados diferentes", async () => {
    const a = await abrir(tokenA, { chaveDeCriacao: chaveNova() });
    const b = await abrir(tokenA, { chaveDeCriacao: chaveNova() });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().id).not.toBe(b.json().id);
  }, 60_000);

  it("chave que não é uuid: 422 com o campo, e nada é criado nem consumido", async () => {
    const antes = await ultimoDaSequencia(ORG_A);
    for (const invalida of [
      "nao-e-uuid",
      "1234",
      "",
      42,
      "dddddddd-0000-4000-8000-000000000001-x",
    ]) {
      const r = await abrir(tokenA, { chaveDeCriacao: invalida });
      expect(r.statusCode, `${String(invalida)}: ${r.body}`).toBe(422);
      expect(r.json().campos?.map((c: { campo: string }) => c.campo)).toContain("chaveDeCriacao");
    }
    expect(await ultimoDaSequencia(ORG_A)).toBe(antes);
  }, 60_000);

  it("sem credencial, a chave não abre nada: 401, e o chamado de quem tem credencial segue intacto", async () => {
    const chave = chaveNova();
    const criada = await abrir(tokenA, { chaveDeCriacao: chave });
    const r = await app.inject({
      method: "POST",
      url: "/ocorrencias",
      payload: corpo({ chaveDeCriacao: chave }),
    });
    expect(r.statusCode).toBe(401);
    expect(criada.statusCode).toBe(201);
  }, 60_000);
});

describe("isolamento entre municípios", () => {
  it("a mesma chave em A e em B cria um chamado em cada, sem 404 nem 409 cruzado", async () => {
    const chave = chaveNova();
    const deA = await abrir(tokenA, { chaveDeCriacao: chave });
    const deB = await abrir(tokenB, { chaveDeCriacao: chave });
    expect(deA.statusCode, deA.body).toBe(201);
    expect(deB.statusCode, deB.body).toBe(201);
    expect(deA.json().id).not.toBe(deB.json().id);

    // O reenvio de cada lado devolve o SEU chamado, e nunca o do vizinho.
    const reA = await abrir(tokenA, { chaveDeCriacao: chave });
    const reB = await abrir(tokenB, { chaveDeCriacao: chave });
    expect(reA.statusCode).toBe(200);
    expect(reB.statusCode).toBe(200);
    expect(reA.json()).toEqual(deA.json());
    expect(reB.json()).toEqual(deB.json());

    expect(await quantosComAChave(ORG_A, chave)).toBe(1);
    expect(await quantosComAChave(ORG_B, chave)).toBe(1);
  }, 60_000);

  it("a chave de A não deixa B ler o chamado de A: B só vê o que B criou", async () => {
    const chave = chaveNova();
    const deA = await abrir(tokenA, { chaveDeCriacao: chave });
    const deB = await abrir(tokenB, { chaveDeCriacao: chave });
    const leitura = await app.inject({
      method: "GET",
      url: `/ocorrencias/${deA.json().id}`,
      headers: com(tokenB),
    });
    expect(leitura.statusCode).toBe(404);
    expect(deB.json().id).not.toBe(deA.json().id);
  }, 60_000);

  it("a sequência de cada município anda sozinha: a chave de A não gasta número de B", async () => {
    const antesB = await ultimoDaSequencia(ORG_B);
    await abrir(tokenA, { chaveDeCriacao: chaveNova() });
    expect(await ultimoDaSequencia(ORG_B)).toBe(antesB);
  }, 60_000);
});

describe("a corrida: o segundo pedido perde no índice único e a transação inteira volta", () => {
  let restaurar: (() => void) | null = null;

  afterEach(() => {
    restaurar?.();
    restaurar = null;
  });

  /**
   * Faz a PRIMEIRA leitura pela chave dentro da próxima transação devolver
   * vazio, como se o outro pedido ainda não tivesse confirmado: é o instante
   * em que dois pedidos simultâneos passam os dois pela conferência. O banco em
   * memória tem uma conexão só e serializa os pedidos, então a corrida real não
   * acontece sozinha; o INSERT, o índice e o `ROLLBACK` abaixo são os de verdade.
   */
  function cegarALeituraPelaChaveUmaVez(): { cegou: () => boolean } {
    const real = mem.banco.comTenant.bind(mem.banco);
    let cegou = false;
    mem.banco.comTenant = ((org: string, execucao: (c: Consulta) => Promise<unknown>) =>
      real(org, (c) =>
        execucao(
          new Proxy(c, {
            get(alvo, prop, receptor) {
              if (prop !== "query") return Reflect.get(alvo, prop, receptor);
              return async (sql: string, ...resto: unknown[]) => {
                if (
                  !cegou &&
                  /FROM ocorrencias WHERE organizacao_id = \$1 AND chave_de_criacao/.test(sql)
                ) {
                  cegou = true;
                  return { rows: [] };
                }
                return (alvo.query as (...a: unknown[]) => Promise<unknown>)(sql, ...resto);
              };
            },
          }),
        ),
      )) as typeof mem.banco.comTenant;
    restaurar = () => {
      mem.banco.comTenant = real;
    };
    return { cegou: () => cegou };
  }

  it("cai no 23505, volta a transação (protocolo não consumido), relê e devolve 200 com o mesmo chamado", async () => {
    const chave = chaveNova();
    const primeira = await abrir(tokenA, { chaveDeCriacao: chave });
    expect(primeira.statusCode).toBe(201);
    const sequenciaDepoisDoVencedor = await ultimoDaSequencia(ORG_A);
    const noveDeA = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ocorrencias WHERE organizacao_id = $1",
      [ORG_A],
    );

    const cego = cegarALeituraPelaChaveUmaVez();
    const perdedora = await abrir(tokenA, { chaveDeCriacao: chave });
    expect(cego.cegou(), "a conferência prévia precisa ter passado em branco").toBe(true);

    expect(perdedora.statusCode, perdedora.body).toBe(200);
    expect(perdedora.json()).toEqual(primeira.json());
    // O `proximo_protocolo` da tentativa perdedora voltou junto com a transação.
    expect(await ultimoDaSequencia(ORG_A)).toBe(sequenciaDepoisDoVencedor);
    const depois = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ocorrencias WHERE organizacao_id = $1",
      [ORG_A],
    );
    expect(depois.rows[0]!.n).toBe(noveDeA.rows[0]!.n);
    expect(await quantosEventosDeRegistro(primeira.json().id)).toBe(1);
  }, 60_000);

  it("sem chave a conferência nem acontece: nada é interceptado e o pedido cria normalmente", async () => {
    const cego = cegarALeituraPelaChaveUmaVez();
    const r = await abrir(tokenA);
    expect(r.statusCode).toBe(201);
    expect(cego.cegou()).toBe(false);
  }, 60_000);
});

describe("evidência: a chave de foto presa à ocorrência", () => {
  async function ocorrenciaEmCampo(token: string, equipeId: string): Promise<string> {
    const criar = await abrir(token);
    const id = criar.json().id as string;
    await app.inject({
      method: "POST",
      url: `/ocorrencias/${id}/triagem`,
      headers: com(token),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });
    const d = await app.inject({
      method: "POST",
      url: `/ocorrencias/${id}/despacho`,
      headers: com(token),
      payload: { equipeId, prazoHoras: 24 },
    });
    expect(d.statusCode, d.body).toBeLessThan(300);
    return id;
  }

  function autorizarFoto(token: string, ocorrenciaId: string, chave: string) {
    return app.inject({
      method: "POST",
      url: "/evidencias/autorizar-envio",
      headers: com(token),
      payload: {
        ocorrenciaId,
        nomeArquivo: "IMG_0001.jpg",
        tipoConteudo: "image/png",
        tamanhoBytes: 68,
        capturadaEm: new Date().toISOString(),
        ordem: 0,
        idempotencyKey: chave,
      },
    });
  }

  async function linhasDaChave(
    chave: string,
  ): Promise<Array<{ ocorrencia_id: string; id: string }>> {
    const r = await mem.bruto.query<{ ocorrencia_id: string; id: string }>(
      "SELECT id, ocorrencia_id FROM evidencias WHERE idempotency_key = $1",
      [chave],
    );
    return r.rows;
  }

  it("a mesma chave na MESMA ocorrência devolve a mesma evidência (o comportamento que fica)", async () => {
    const ocorrencia = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const chave = chaveNova();
    const primeira = await autorizarFoto(tokenAgenteA, ocorrencia, chave);
    const segunda = await autorizarFoto(tokenAgenteA, ocorrencia, chave);
    expect(primeira.statusCode, primeira.body).toBe(201);
    expect(segunda.statusCode, segunda.body).toBe(201);
    expect(segunda.json().evidenciaId).toBe(primeira.json().evidenciaId);
    expect(await linhasDaChave(chave)).toHaveLength(1);
  }, 60_000);

  it("a mesma chave em OUTRA ocorrência: 409 chave_ja_usada_em_outro_registro, e nada é gravado", async () => {
    const primeira = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const segunda = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const chave = chaveNova();

    const ok = await autorizarFoto(tokenAgenteA, primeira, chave);
    expect(ok.statusCode, ok.body).toBe(201);

    const alheia = await autorizarFoto(tokenAgenteA, segunda, chave);
    expect(alheia.statusCode, alheia.body).toBe(409);
    expect(alheia.json().erro).toBe("chave_ja_usada_em_outro_registro");
    // Não devolveu a evidência da primeira, e não criou nenhuma para a segunda.
    expect(alheia.json().evidenciaId).toBeUndefined();
    const linhas = await linhasDaChave(chave);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.ocorrencia_id).toBe(primeira);
  }, 60_000);

  it("o índice do banco também recusa a mesma chave em outra ocorrência, mesmo fora da rota", async () => {
    const a = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const b = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const chave = chaveNova();
    const inserir = (ocorrencia: string) =>
      mem.bruto.query(
        `INSERT INTO evidencias (organizacao_id, ocorrencia_id, chave_storage, capturada_em, ordem,
                                 tipo_conteudo, tamanho_bytes, idempotency_key)
         VALUES ($1, $2, $3, now(), 0, 'image/png', 68, $4)`,
        [ORG_A, ocorrencia, `tenant/${ORG_A}/${crypto.randomUUID()}`, chave],
      );
    await inserir(a);
    await expect(inserir(a)).rejects.toMatchObject({ code: "23505" });
    await expect(inserir(b)).rejects.toMatchObject({ code: "23505" });
  }, 60_000);

  it("isolamento: a mesma chave de foto em A e em B grava uma em cada, sem 409 cruzado", async () => {
    const deA = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const deB = await ocorrenciaEmCampo(tokenB, EQUIPE_UNICA);
    const chave = chaveNova();

    const emA = await autorizarFoto(tokenAgenteA, deA, chave);
    const emB = await autorizarFoto(tokenAgenteB, deB, chave);
    expect(emA.statusCode, emA.body).toBe(201);
    expect(emB.statusCode, emB.body).toBe(201);
    expect(emA.json().evidenciaId).not.toBe(emB.json().evidenciaId);
    expect(await linhasDaChave(chave)).toHaveLength(2);
  }, 60_000);

  it("chave JÁ USADA em B e depois a mesma em A: A grava a sua, sem 409 e sem ver nada de B", async () => {
    const deB = await ocorrenciaEmCampo(tokenB, EQUIPE_UNICA);
    const deA = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
    const chave = chaveNova();

    const emB = await autorizarFoto(tokenAgenteB, deB, chave);
    expect(emB.statusCode, emB.body).toBe(201);
    expect(await linhasDaChave(chave)).toHaveLength(1);

    const emA = await autorizarFoto(tokenAgenteA, deA, chave);
    expect(emA.statusCode, emA.body).toBe(201);
    expect(emA.json().erro).toBeUndefined();
    // Nada de B vaza para A: nem a evidência, nem a chave de armazenamento.
    expect(emA.json().evidenciaId).not.toBe(emB.json().evidenciaId);
    expect(emA.json().chave).not.toBe(emB.json().chave);
    expect(emA.json().chave).toContain(`tenant/${ORG_A}/`);
    expect(JSON.stringify(emA.json())).not.toContain(ORG_B);
    expect(JSON.stringify(emA.json())).not.toContain(deB);

    const linhas = await mem.bruto.query<{ organizacao_id: string; ocorrencia_id: string }>(
      "SELECT organizacao_id, ocorrencia_id FROM evidencias WHERE idempotency_key = $1 ORDER BY organizacao_id",
      [chave],
    );
    expect(linhas.rows).toEqual([
      { organizacao_id: ORG_A, ocorrencia_id: deA },
      { organizacao_id: ORG_B, ocorrencia_id: deB },
    ]);
  }, 60_000);

  it("com a chave já usada em B, o agente de A que aponta para a ocorrência de B segue em 404", async () => {
    const deB = await ocorrenciaEmCampo(tokenB, EQUIPE_UNICA);
    const chave = chaveNova();
    const emB = await autorizarFoto(tokenAgenteB, deB, chave);
    expect(emB.statusCode, emB.body).toBe(201);

    const r = await autorizarFoto(tokenAgenteA, deB, chave);
    expect(r.statusCode, r.body).toBe(404);
    expect(await linhasDaChave(chave)).toHaveLength(1);
  }, 60_000);

  describe("a corrida da foto: dois pedidos passam pela consulta e o segundo INSERT cai no índice", () => {
    /**
     * Como na corrida do chamado: a PRIMEIRA leitura por `idempotency_key` da
     * próxima transação volta vazia, que é o instante em que dois pedidos
     * concorrentes passam os dois pela conferência. O INSERT e o índice são
     * os do Postgres.
     */
    let restaurarFoto: (() => void) | null = null;
    afterEach(() => {
      restaurarFoto?.();
      restaurarFoto = null;
    });

    function cegarALeituraDaChaveDeFoto(): { cegou: () => boolean } {
      const real = mem.banco.comTenant.bind(mem.banco);
      let cegou = false;
      mem.banco.comTenant = ((org: string, execucao: (c: Consulta) => Promise<unknown>) =>
        real(org, (c) =>
          execucao(
            new Proxy(c, {
              get(alvo, prop, receptor) {
                if (prop !== "query") return Reflect.get(alvo, prop, receptor);
                return async (sql: string, ...resto: unknown[]) => {
                  if (!cegou && /FROM evidencias WHERE idempotency_key = \$1/.test(sql)) {
                    cegou = true;
                    return { rows: [] };
                  }
                  return (alvo.query as (...a: unknown[]) => Promise<unknown>)(sql, ...resto);
                };
              },
            }),
          ),
        )) as typeof mem.banco.comTenant;
      restaurarFoto = () => {
        mem.banco.comTenant = real;
      };
      return { cegou: () => cegou };
    }

    it("outra ocorrência: 409 chave_ja_usada_em_outro_registro, e não 500", async () => {
      const primeira = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
      const segunda = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
      const chave = chaveNova();
      const ok = await autorizarFoto(tokenAgenteA, primeira, chave);
      expect(ok.statusCode, ok.body).toBe(201);

      const cego = cegarALeituraDaChaveDeFoto();
      const perdedora = await autorizarFoto(tokenAgenteA, segunda, chave);
      expect(cego.cegou(), "a consulta prévia precisa ter passado em branco").toBe(true);

      expect(perdedora.statusCode, perdedora.body).toBe(409);
      expect(perdedora.json().erro).toBe("chave_ja_usada_em_outro_registro");
      const linhas = await linhasDaChave(chave);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.ocorrencia_id).toBe(primeira);
    }, 60_000);

    it("mesma ocorrência: devolve o registro existente, como hoje (201 com a mesma evidência)", async () => {
      const ocorrencia = await ocorrenciaEmCampo(tokenA, EQUIPE_ALFA);
      const chave = chaveNova();
      const ok = await autorizarFoto(tokenAgenteA, ocorrencia, chave);
      expect(ok.statusCode, ok.body).toBe(201);

      const cego = cegarALeituraDaChaveDeFoto();
      const perdedora = await autorizarFoto(tokenAgenteA, ocorrencia, chave);
      expect(cego.cegou()).toBe(true);

      expect(perdedora.statusCode, perdedora.body).toBe(201);
      expect(perdedora.json().evidenciaId).toBe(ok.json().evidenciaId);
      expect(await linhasDaChave(chave)).toHaveLength(1);
    }, 60_000);
  });
});
