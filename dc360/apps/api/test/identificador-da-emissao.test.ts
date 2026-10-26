import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { esperarORelogioAndar } from "./esperar-o-relogio.js";

/**
 * O código no rodapé do documento identifica UMA emissão, e existe onde
 * conferi-lo.
 *
 * O que o revisor provou: o rodapé dizia "Código de validação", o código era
 * `sha256(protocolo|vistoria)` (o mesmo para sempre, mudasse o que mudasse no
 * documento) e não existia rota nenhuma que recebesse o código e dissesse a
 * que ele corresponde. Era promessa de conferência sem conferência: alguém com
 * o papel na mão não tinha onde bater o código, e o próprio teste da minuta já
 * dizia que o laudo tinha esse defeito (B8 do levantamento).
 *
 * O que passa a valer:
 *
 * 1. O rodapé chama a coisa pelo nome: "Identificador da emissão".
 * 2. O identificador nasce na PRIMEIRA emissão de cada par (documento,
 *    vistoria), fica gravado em `documento_emitido` na trilha, e a segunda via
 *    carrega o mesmo, porque é o mesmo ato. Vistoria nova produz identificador
 *    novo.
 * 3. `GET /documentos/validar/:codigo`, autenticada e sob RLS, responde o
 *    protocolo, o documento, a vistoria, o instante e quem emitiu. Código de
 *    outro município e código inventado respondem o mesmo 404.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;
let tokenDeFora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function vistoriar(ocorrenciaId: string): Promise<string> {
  const coletadaEm = new Date().toISOString();
  const s = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
        coletadaEm, observacoes: "Talude com trinca ativa.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);
  return s.json().vistoriaId;
}

async function comVistoria(endereco: string): Promise<{ id: string; protocolo: string; vistoriaId: string }> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const { id, protocolo } = criar.json();
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  const vistoriaId = await vistoriar(id);
  return { id, protocolo, vistoriaId };
}

/** O identificador impresso no rodapé, e só ele. */
function identificadorImpresso(html: string): string {
  const m = /Identificador da emissão<br><strong>([0-9A-F]+)<\/strong>/.exec(html);
  if (!m) throw new Error("o rodapé não traz o identificador da emissão");
  return m[1]!;
}

function laudo(id: string, token = tokenCoordenador) {
  return app.inject({ method: "GET", url: `/documentos/${id}/laudo`, headers: com(token) });
}

function validar(codigo: string, token = tokenCoordenador) {
  return app.inject({ method: "GET", url: `/documentos/validar/${codigo}`, headers: com(token) });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-identificador-da-emissao-32-bytes",
    LOGIN_POR_IP: "10000",
    MARCA_DAGUA: "",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("O rodapé diz o que o código é", () => {
  it("imprime 'Identificador da emissão', e não promete validação", async () => {
    const alvo = await comVistoria("Rua do Identificador, 1");
    const r = await laudo(alvo.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.body).toContain("Identificador da emissão");
    expect(r.body).not.toContain("Código de validação");
  });
});

describe("O identificador é da emissão", () => {
  it("a segunda via carrega o mesmo identificador, porque é o mesmo ato", async () => {
    const alvo = await comVistoria("Rua do Identificador, 2");
    const primeira = identificadorImpresso((await laudo(alvo.id)).body);
    await esperarORelogioAndar();
    const segunda = identificadorImpresso((await laudo(alvo.id)).body);
    expect(segunda).toBe(primeira);
  });

  it("laudo e termo da mesma vistoria têm identificadores diferentes", async () => {
    const alvo = await comVistoria("Rua do Identificador, 3");
    const doLaudo = identificadorImpresso((await laudo(alvo.id)).body);
    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`, headers: com(tokenCoordenador),
    });
    expect(termo.statusCode, termo.body).toBe(200);
    const doTermo = identificadorImpresso(termo.body);
    expect(doTermo).not.toBe(doLaudo);
  });

  it("vistoria nova produz identificador novo", async () => {
    const alvo = await comVistoria("Rua do Identificador, 4");
    const antes = identificadorImpresso((await laudo(alvo.id)).body);
    await esperarORelogioAndar();
    await vistoriar(alvo.id);
    const depois = identificadorImpresso((await laudo(alvo.id)).body);
    expect(depois).not.toBe(antes);
  });
});

describe("Onde o identificador se confere", () => {
  it("responde protocolo, documento, vistoria, instante e quem emitiu", async () => {
    const alvo = await comVistoria("Rua do Identificador, 5");
    const html = (await laudo(alvo.id)).body;
    const codigo = identificadorImpresso(html);

    const r = await validar(codigo);
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(corpo.protocolo).toBe(alvo.protocolo);
    expect(corpo.documento).toBe("laudo");
    expect(corpo.vistoriaId).toBe(alvo.vistoriaId);
    expect(corpo.emitidoPor).toContain("Helena Vasques Coutinho");
    expect(new Date(corpo.emitidoEm).getTime()).toBeGreaterThan(0);
    // O identificador conferido é o impresso, e a resposta o repete.
    expect(corpo.codigo).toBe(codigo);
  });

  it("código inventado responde 404", async () => {
    const r = await validar("000000000000");
    expect(r.statusCode).toBe(404);
  });

  it("código de outro município responde o MESMO 404, e não 403", async () => {
    const alvo = await comVistoria("Rua do Identificador, 6");
    const codigo = identificadorImpresso((await laudo(alvo.id)).body);
    const r = await validar(codigo, tokenDeFora);
    expect(r.statusCode).toBe(404);
  });

  it("sem token não confere", async () => {
    const r = await app.inject({ method: "GET", url: "/documentos/validar/ABCDEF012345" });
    expect(r.statusCode).toBe(401);
  });

  it("não aceita o que não tem cara de identificador", async () => {
    const r = await validar("nao-e-um-codigo");
    expect([400, 404, 422]).toContain(r.statusCode);
  });
});
