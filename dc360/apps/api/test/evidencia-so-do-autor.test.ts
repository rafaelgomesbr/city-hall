import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Foto de campo: quem envia é o autor da coleta (V2-F00-E06, correção 1).
 *
 * O DEFEITO, provado pela rodada 1 da validação: a fila do aparelho atravessa
 * a troca de turno. Se a conta trocava com a foto do Diego em voo, a
 * confirmação chegava com o token da Ana e a trilha, que é append-only, passava
 * a dizer que a Ana anexou uma fotografia que ela nunca viu. A vistoria e a
 * devolução já respondiam 409 `autor_divergente` nesse caso; a foto não
 * conferia nada, e a mentira não tem correção possível depois de gravada.
 *
 * A REGRA, no servidor (a tela não é controle de acesso):
 *
 * - autorizar o envio com `coletadaPor` diferente do token: 409;
 * - reautorizar uma chave que é de outra pessoa: 409, sem devolver a evidência;
 * - confirmar uma evidência que outra pessoa autorizou: 409, sem evento na
 *   trilha e sem marcar como enviada;
 * - evidência de outro município continua 404, nunca 403.
 */

const SENHA = "defesa-civil-2026";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const ANA = "11111111-1111-4111-8111-0000000000d9";
const TARCISIO = "22222222-2222-4222-8222-0000000000d3";

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenDiego: string;
let tokenAna: string;
let tokenCoordenadora: string;
let tokenAgenteDeFora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function ocorrenciaEmCampo(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenadora),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenadora),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  const d = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  if (d.statusCode !== 200) throw new Error(`despacho falhou: ${d.body}`);
  return id;
}

function pedido(ocorrenciaId: string, extras: Record<string, unknown> = {}) {
  return {
    ocorrenciaId,
    idempotencyKey: crypto.randomUUID(),
    nomeArquivo: "IMG_0001.png",
    tipoConteudo: "image/png",
    tamanhoBytes: PIXEL_PNG.length,
    capturadaEm: new Date().toISOString(),
    legenda: "Trinca na parede dos fundos",
    ordem: 0,
    ...extras,
  };
}

async function autorizar(token: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(token), payload: corpo,
  });
}

async function confirmar(token: string, evidenciaId: string) {
  return app.inject({
    method: "POST", url: "/evidencias/confirmar-envio", headers: com(token),
    payload: { evidenciaId },
  });
}

async function enviarBytes(url: string, cabecalhos: Record<string, string>) {
  const alvo = new URL(url);
  return app.inject({
    method: "PUT", url: alvo.pathname + alvo.search,
    headers: { ...cabecalhos, "content-length": String(PIXEL_PNG.length) },
    payload: PIXEL_PNG,
  });
}

async function linhaDaEvidencia(chaveDeIdempotencia: string) {
  const r = await mem.bruto.query<{
    id: string; anexada_por: string | null; enviada_em: string | null;
  }>(
    "SELECT id, anexada_por, enviada_em FROM evidencias WHERE idempotency_key = $1",
    [chaveDeIdempotencia],
  );
  return r.rows[0] ?? null;
}

async function eventosDeAnexo(ocorrenciaId: string) {
  const r = await mem.bruto.query<{ autor_id: string; autor_nome: string }>(
    "SELECT autor_id, autor_nome FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'evidencia_anexada'",
    [ocorrenciaId],
  );
  return r.rows;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-evidencia-do-autor-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // O segundo agente NA MESMA EQUIPE: a divergência é só de pessoa.
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Ana Ribeiro Gouveia','SA-3392','ana.gouveia@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [ANA, SERRA_ALTA, EQUIPE_ALFA, HASH_DA_SEMENTE],
  );

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenAna = await entrar("ana.gouveia@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenAgenteDeFora = await entrar("tarcisio.ramos@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Autorizar o envio: o autor declarado é o do token", () => {
  it("coletadaPor de OUTRA pessoa é recusado com 409 autor_divergente, e nada fica reservado", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 1");
    const corpo = pedido(ocorrencia, { coletadaPor: DIEGO });

    // A foto é do Diego; quem apresenta o token é a Ana.
    const r = await autorizar(tokenAna, corpo);

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
    expect(r.json().mensagem).toContain("conta de quem fez a vistoria");
    expect(await linhaDaEvidencia(corpo.idempotencyKey)).toBeNull();
  }, 60_000);

  it("coletadaPor igual ao token é aceito, e anexada_por é o do token", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 2");
    const corpo = pedido(ocorrencia, { coletadaPor: DIEGO });

    const r = await autorizar(tokenDiego, corpo);

    expect(r.statusCode, r.body).toBe(201);
    expect((await linhaDaEvidencia(corpo.idempotencyKey))!.anexada_por).toBe(DIEGO);
  }, 60_000);

  it("aparelho de versão anterior, sem coletadaPor, continua entrando", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 3");

    const r = await autorizar(tokenDiego, pedido(ocorrencia));

    expect(r.statusCode, r.body).toBe(201);
  }, 60_000);

  it("a mesma chave pedida por OUTRA pessoa não devolve a evidência do autor", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 4");
    const corpo = pedido(ocorrencia);
    const doDiego = await autorizar(tokenDiego, corpo);
    expect(doDiego.statusCode, doDiego.body).toBe(201);

    // A Ana (sem declarar autor nenhum) apresenta a chave do Diego.
    const daAna = await autorizar(tokenAna, corpo);

    expect(daAna.statusCode, daAna.body).toBe(409);
    expect(daAna.json().erro).toBe("autor_divergente");
    expect(daAna.json()).not.toHaveProperty("evidenciaId");
    expect((await linhaDaEvidencia(corpo.idempotencyKey))!.anexada_por).toBe(DIEGO);
  }, 60_000);

  it("a reautorização com os bytes já no armazenamento não confirma em nome de outra pessoa", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 5");
    const corpo = pedido(ocorrencia);
    const doDiego = (await autorizar(tokenDiego, corpo)).json();
    expect((await enviarBytes(doDiego.url, doDiego.cabecalhos)).statusCode).toBe(200);

    // Os bytes chegaram e a resposta se perdeu. A Ana pede a mesma chave:
    // seria ela a confirmar, e a trilha diria que foi ela quem anexou.
    const daAna = await autorizar(tokenAna, corpo);

    expect(daAna.statusCode, daAna.body).toBe(409);
    expect((await linhaDaEvidencia(corpo.idempotencyKey))!.enviada_em).toBeNull();
    expect(await eventosDeAnexo(ocorrencia)).toHaveLength(0);
  }, 60_000);

  it("ocorrência de outro município continua 404, com ou sem autor declarado (o dele)", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 6");

    const semAutor = await autorizar(tokenAgenteDeFora, pedido(ocorrencia));
    const comAutor = await autorizar(tokenAgenteDeFora, pedido(ocorrencia, { coletadaPor: TARCISIO }));

    // 404 e não 403 nem 409: o autor confere, e a ocorrência alheia não existe daqui.
    for (const r of [semAutor, comAutor]) {
      expect(r.statusCode, r.body).toBe(404);
      expect(r.json().erro).toBe("nao_encontrada");
    }
  }, 60_000);

  it("a recusa por autor não depende de a ocorrência existir: não vira oráculo", async () => {
    const existe = await ocorrenciaEmCampo("Rua do Autor, 6b");
    const inventada = crypto.randomUUID();

    const a = await autorizar(tokenAna, pedido(existe, { coletadaPor: DIEGO }));
    const b = await autorizar(tokenAna, pedido(inventada, { coletadaPor: DIEGO }));

    expect(a.statusCode).toBe(409);
    expect(b.statusCode).toBe(409);
    expect(a.json()).toEqual(b.json());
  }, 60_000);
});

describe("Confirmar o envio: só quem autorizou confirma", () => {
  it("a confirmação com o token de OUTRA pessoa é recusada: nada na trilha, nada marcado", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 7");
    const corpo = pedido(ocorrencia);
    const autorizacao = (await autorizar(tokenDiego, corpo)).json();
    expect((await enviarBytes(autorizacao.url, autorizacao.cabecalhos)).statusCode).toBe(200);

    // A conta trocou com a foto em voo: a confirmação chega com o token da Ana.
    const r = await confirmar(tokenAna, autorizacao.evidenciaId);

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
    expect((await linhaDaEvidencia(corpo.idempotencyKey))!.enviada_em).toBeNull();
    expect(await eventosDeAnexo(ocorrencia), "autor falso na trilha append-only").toHaveLength(0);
  }, 60_000);

  it("a confirmação do autor continua valendo, e a trilha diz Diego", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 8");
    const corpo = pedido(ocorrencia);
    const autorizacao = (await autorizar(tokenDiego, corpo)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);

    // Primeiro a Ana tenta e é recusada; depois o Diego volta e conclui.
    expect((await confirmar(tokenAna, autorizacao.evidenciaId)).statusCode).toBe(409);
    const r = await confirmar(tokenDiego, autorizacao.evidenciaId);

    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().confirmada).toBe(true);
    const eventos = await eventosDeAnexo(ocorrencia);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.autor_id).toBe(DIEGO);
    expect((await linhaDaEvidencia(corpo.idempotencyKey))!.anexada_por).toBe(DIEGO);
  }, 60_000);

  it("reconfirmar depois de enviada, por outra pessoa, também é recusado", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 9");
    const autorizacao = (await autorizar(tokenDiego, pedido(ocorrencia))).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    expect((await confirmar(tokenDiego, autorizacao.evidenciaId)).statusCode).toBe(200);

    // O atalho "já estava confirmada" não pode servir de oráculo para quem não é o autor.
    const r = await confirmar(tokenAna, autorizacao.evidenciaId);

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
  }, 60_000);

  it("evidência de outro município: 404, nunca 403 nem 409", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Autor, 10");
    const autorizacao = (await autorizar(tokenDiego, pedido(ocorrencia))).json();

    const r = await confirmar(tokenAgenteDeFora, autorizacao.evidenciaId);

    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");
  }, 60_000);
});
