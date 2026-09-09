import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";

/**
 * As fotos do documento são as da vistoria que ele documenta.
 *
 * O DEFEITO, reproduzido: a consulta de fotos do laudo filtrava só por
 * `ocorrencia_id` e `enviada_em`, sem `vistoria_id`, enquanto todo o resto do
 * documento (checklist, agente, assinante, datas, órgãos indicados) vinha da
 * vistoria vigente. O laudo da re-vistoria B, que concluiu que o risco cessou,
 * saía com as fotos do talude destruído da vistoria A, numeradas como
 * "Fotografia 1 da vistoria" daquela ida.
 *
 * E a re-vistoria não é caso de borda: é o caminho normal de todo levantamento
 * de interdição. É justamente o documento em que a diferença entre as duas
 * idas é a coisa mais importante da folha.
 *
 * O caso difícil, e a razão de a correção não ser um `WHERE` a mais: existem
 * fotos com `vistoria_id` NULO, subidas pelo fluxo de evidência avulsa. Somá-las
 * à vistoria vigente é o mesmo defeito em versão menor (o documento passa a
 * atribuir ao agente uma imagem que ele não fez) e descartá-las cala uma prova
 * que alguém anexou ao processo de propósito. Elas saem em seção própria,
 * ditas pelo que são.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let tokenAgente: string;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function ocorrenciaEmCampo(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento", descricao: "Talude cedeu na madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
  });
  return id;
}

/** Sobe uma foto de verdade e devolve a chave já confirmada no armazenamento. */
async function subirFoto(
  ocorrenciaId: string, legenda: string, token = tokenAgente,
): Promise<{ chave: string; evidenciaId: string }> {
  const autorizacao = await app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(token),
    payload: {
      ocorrenciaId,
      nomeArquivo: "IMG_0001.jpg",
      tipoConteudo: "image/png",
      tamanhoBytes: PIXEL_PNG.length,
      capturadaEm: new Date().toISOString(),
      legenda,
      ordem: 0,
    },
  });
  const corpo = autorizacao.json();
  const alvo = new URL(corpo.url);
  await app.inject({
    method: "PUT", url: alvo.pathname + alvo.search,
    headers: { ...corpo.cabecalhos, "content-length": String(PIXEL_PNG.length) },
    payload: PIXEL_PNG,
  });
  await app.inject({
    method: "POST", url: "/evidencias/confirmar-envio", headers: com(token),
    payload: { evidenciaId: corpo.evidenciaId },
  });
  return { chave: corpo.chave, evidenciaId: corpo.evidenciaId };
}

async function vistoriar(
  ocorrenciaId: string, chaves: string[], observacoes: string,
): Promise<string> {
  const coletadaEm = new Date().toISOString();
  const r = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: false },
          { chave: "interdicao_indicada", resposta: false },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: chaves.map((chave, i) => ({
          chave, capturadaEm: coletadaEm, legenda: `Foto ${i + 1}`,
        })),
        gpsPrecisaoMetros: 5,
        assinanteNome: "Marilda Souza Prado",
        assinaturaChave: null,
        coletadaEm,
        observacoes,
      },
    },
  });
  if (r.statusCode !== 201) throw new Error(`sincronizacao falhou: ${r.body}`);
  return r.json().vistoriaId;
}

function laudo(id: string) {
  return app.inject({
    method: "GET", url: `/documentos/${id}/laudo`, headers: com(tokenCoordenador),
  });
}

/**
 * A URL da foto é assinada na hora, então o que identifica a imagem no HTML é
 * o caminho do objeto, e não a URL inteira.
 */
function caminho(chave: string): string {
  return chave.split("/").pop()!;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-fotos-do-documento-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("O laudo da re-vistoria", () => {
  it("não imprime as fotos da vistoria anterior", async () => {
    const id = await ocorrenciaEmCampo("Rua do Talude, 15");

    const daPrimeira = await subirFoto(id, "Talude destruído");
    await vistoriar(id, [daPrimeira.chave], "Vistoria A: talude cedeu.");

    await new Promise((r) => setTimeout(r, 20));
    const daSegunda = await subirFoto(id, "Talude contido");
    await vistoriar(id, [daSegunda.chave], "Vistoria B: risco cessou.");

    const html = (await laudo(id)).body;

    expect(html).toContain("Vistoria B: risco cessou.");
    expect(
      html.includes(caminho(daSegunda.chave)),
      "a foto da vistoria vigente não saiu no laudo dela",
    ).toBe(true);
    expect(
      html.includes(caminho(daPrimeira.chave)),
      "o laudo da re-vistoria saiu com a foto da vistoria anterior",
    ).toBe(false);
  }, 60_000);

  it("uma vistoria sem foto nenhuma diz que não tem, mesmo com foto de outra vistoria no protocolo", async () => {
    /*
      O caso mais grave da família, porque o documento afirma o contrário do que
      aconteceu: a re-vistoria não fotografou nada, e o laudo dela saía com a
      seção de registro fotográfico cheia, com as imagens da ida anterior.
    */
    const id = await ocorrenciaEmCampo("Rua Sem Foto, 40");
    const daPrimeira = await subirFoto(id, "Trinca na parede");
    await vistoriar(id, [daPrimeira.chave], "Vistoria A.");

    await new Promise((r) => setTimeout(r, 20));
    await vistoriar(id, [], "Vistoria B, sem registro fotográfico.");

    const html = (await laudo(id)).body;
    expect(html).toContain("Nenhuma fotografia foi anexada a esta vistoria.");
    expect(html.includes(caminho(daPrimeira.chave))).toBe(false);
  }, 60_000);
});

describe("A foto anexada fora da vistoria", () => {
  it("sai em seção própria, com quem anexou, e não vira foto da vistoria", async () => {
    const id = await ocorrenciaEmCampo("Rua da Avulsa, 7");
    const daVistoria = await subirFoto(id, "Barranco pela manhã");
    await vistoriar(id, [daVistoria.chave], "Vistoria com uma foto.");

    /*
      Anexada depois, pelo fluxo de evidência, sem coleta atrás: fica com
      `vistoria_id` nulo para sempre. Quem anexa é sempre alguém com
      `registrar_vistoria`, que hoje é o agente de campo, e é justamente por
      isso que o autor precisa constar: sem ele, uma foto acrescentada por
      qualquer agente ao dossiê de qualquer ocorrência do município sai no
      documento sem dono.
    */
    const avulsa = await subirFoto(id, "Foto trazida pela moradora");

    const html = (await laudo(id)).body;

    expect(html).toContain("Fotografias anexadas ao protocolo");
    expect(html).toContain("Anexada por Diego Nakamura Alves");
    expect(
      html.includes(caminho(avulsa.chave)),
      "a foto avulsa sumiu do documento",
    ).toBe(true);

    // E continua sendo distinguível: a da vistoria é numerada como foto, a
    // avulsa como anexo.
    const registro = html.slice(
      html.indexOf("Registro fotográfico"), html.indexOf("Fotografias anexadas"),
    );
    expect(registro.includes(caminho(daVistoria.chave))).toBe(true);
    expect(registro.includes(caminho(avulsa.chave))).toBe(false);
  }, 60_000);

  it("sem foto avulsa, a seção não existe", async () => {
    const id = await ocorrenciaEmCampo("Rua Limpa, 3");
    const foto = await subirFoto(id, "Muro de arrimo");
    await vistoriar(id, [foto.chave], "Vistoria única.");

    const html = (await laudo(id)).body;
    expect(html).not.toContain("Fotografias anexadas ao protocolo");
  }, 60_000);
});
