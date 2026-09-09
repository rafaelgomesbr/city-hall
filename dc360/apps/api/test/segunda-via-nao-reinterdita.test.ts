import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Reimprimir o termo de interdição não pode reinterditar o imóvel.
 *
 * O DEFEITO, reproduzido por revisão adversarial, em três passos, todos
 * legítimos: emitir o termo (que É o ato de interditar), levantar a interdição
 * com motivo, e pedir o MESMO termo de novo, que é a segunda via de rotina que
 * o próprio `desinterdicao.test.ts` chama de legítima (o papel molhou, o
 * processo pede cópia).
 *
 * Depois do terceiro passo: `interditada_em` recebia data NOVA,
 * `desinterditada_em` voltava a NULL, `desinterdicao_motivo` era APAGADO, e o
 * imóvel voltava a constar interditado. Sem um único evento na trilha.
 *
 * Por que é o pior tipo de defeito deste produto:
 *
 * 1. A casa volta a constar interditada por um ato que ninguém praticou.
 * 2. O termo de desinterdição, que é o papel que autoriza a família a voltar,
 *    deixa de poder ser emitido, porque a rota dele exige `desinterditada_em`.
 * 3. Some a coluna que responde, anos depois, POR QUE a família foi autorizada
 *    a voltar.
 * 4. A trilha é append-only, então o evento de desinterdição continua lá: o
 *    registro passa a se contradizer sozinho.
 *
 * O que este arquivo prende: emitir segunda via não muda estado nenhum, e a
 * reinterdição legítima (risco voltou, vistoria nova) continua funcionando.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const MOTIVO =
  "Contenção do talude executada pela Secretaria de Obras e conferida em nova "
  + "vistoria técnica. Sem trincas ativas.";

let mem: BancoEmMemoria;
let app: FastifyInstance;
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

async function vistoriar(ocorrenciaId: string): Promise<void> {
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
}

async function ocorrenciaInterditavel(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  const { id } = criar.json();
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: {
      severidade: "critica", vulnerabilidadePresente: true,
      vulnerabilidadeDescricao: "Idosa acamada na residência.",
    },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  await vistoriar(id);
  return id;
}

async function emitirTermo(id: string): Promise<number> {
  const r = await app.inject({
    method: "GET", url: `/documentos/${id}/termo-de-interdicao`,
    headers: com(tokenCoordenador),
  });
  return r.statusCode;
}

async function estado(id: string): Promise<{
  interditada_em: string | null;
  desinterditada_em: string | null;
  desinterdicao_motivo: string | null;
  trilha: Array<{ tipo: string }>;
}> {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${id}`, headers: com(tokenCoordenador),
  });
  const corpo = r.json();
  return { ...corpo.ocorrencia, trilha: corpo.trilha };
}

async function levantar(id: string): Promise<number> {
  const r = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/desinterdicao`,
    headers: com(tokenCoordenador), payload: { motivo: MOTIVO },
  });
  return r.statusCode;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-segunda-via-com-mais-de-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Segunda via do termo depois do levantamento", () => {
  it("não reinterdita, não apaga o motivo e não muda a data", async () => {
    const id = await ocorrenciaInterditavel("Rua do Mirante, 88");
    expect(await emitirTermo(id)).toBe(200);

    const interditado = await estado(id);
    expect(interditado.interditada_em).not.toBeNull();

    expect(await levantar(id)).toBe(200);
    const levantado = await estado(id);
    expect(levantado.desinterditada_em).not.toBeNull();
    expect(levantado.desinterdicao_motivo).toBe(MOTIVO);

    // A SEGUNDA VIA. Mesmo termo, mesma vistoria, nenhuma vistoria nova no
    // meio: o papel molhou e o processo pediu cópia.
    await new Promise((r) => setTimeout(r, 20));
    expect(await emitirTermo(id)).toBe(200);

    const depois = await estado(id);
    expect(
      depois.interditada_em,
      "a segunda via reescreveu a data da interdição",
    ).toBe(levantado.interditada_em);
    expect(
      depois.desinterditada_em,
      "a segunda via reinterditou o imóvel em silêncio",
    ).toBe(levantado.desinterditada_em);
    expect(
      depois.desinterdicao_motivo,
      "a segunda via apagou o motivo do levantamento",
    ).toBe(MOTIVO);
  });

  it("o imóvel continua fora da lista de interditados", async () => {
    const id = await ocorrenciaInterditavel("Travessa São Bento, 12");
    await emitirTermo(id);
    await levantar(id);
    await emitirTermo(id);

    const lista = await app.inject({
      method: "GET", url: "/ocorrencias/interditados", headers: com(tokenCoordenador),
    });
    expect(
      lista.json().itens.some((i: { id: string }) => i.id === id),
      "o imóvel voltou para a lista de interditados sem ato nenhum",
    ).toBe(false);
  });

  it("o termo de desinterdição continua podendo ser emitido depois da segunda via", async () => {
    /*
      Esta é a consequência com pessoa dentro. Com a reinterdição silenciosa, a
      rota do termo de desinterdição passava a responder 409 "não teve
      interdição levantada", e a família ficava sem o papel que a autoriza a
      voltar para casa por causa de uma segunda via que alguém imprimiu.
    */
    const id = await ocorrenciaInterditavel("Rua das Palmeiras, 340");
    await emitirTermo(id);
    await levantar(id);
    await emitirTermo(id);

    const termo = await app.inject({
      method: "GET", url: `/documentos/${id}/termo-de-desinterdicao`,
      headers: com(tokenCoordenador),
    });
    expect(termo.statusCode, termo.body.slice(0, 300)).toBe(200);
    expect(termo.body).toContain("Fica LEVANTADA a interdição");
    expect(termo.body).toContain(MOTIVO);
  });

  it("o registro não se contradiz: a trilha do levantamento continua sozinha", async () => {
    /*
      A trilha não tem policy de UPDATE nem de DELETE. Se o estado reinterdita
      e a trilha continua dizendo que houve levantamento, o registro passa a
      afirmar duas coisas incompatíveis, e nenhuma delas pode ser corrigida.
    */
    const id = await ocorrenciaInterditavel("Alameda dos Ipês, 71");
    await emitirTermo(id);
    await levantar(id);
    await emitirTermo(id);

    const depois = await estado(id);
    expect(depois.trilha.filter((e) => e.tipo === "desinterdicao")).toHaveLength(1);
    expect(depois.desinterditada_em).not.toBeNull();
  });
});

describe("A reinterdição legítima continua funcionando", () => {
  it("com vistoria nova depois do levantamento, o termo interdita de novo", async () => {
    /*
      O risco voltou: chuva de novembro sobre casa liberada em agosto. Aqui a
      emissão É ato, e precisa continuar sendo. A regra que separa este caso da
      segunda via é a mesma que o comentário de `marcarInterditada` já
      afirmava e ninguém conferia: reinterditar exige vistoria posterior ao
      levantamento.
    */
    const id = await ocorrenciaInterditavel("Rua do Ciclo, 100");
    await emitirTermo(id);
    const primeira = (await estado(id)).interditada_em;
    await levantar(id);

    await new Promise((r) => setTimeout(r, 20));
    await vistoriar(id);
    expect(await emitirTermo(id)).toBe(200);

    const depois = await estado(id);
    expect(depois.desinterditada_em, "o levantamento não saiu do estado").toBeNull();
    expect(new Date(depois.interditada_em!).getTime())
      .toBeGreaterThan(new Date(primeira!).getTime());

    const lista = await app.inject({
      method: "GET", url: "/ocorrencias/interditados", headers: com(tokenCoordenador),
    });
    expect(lista.json().itens.some((i: { id: string }) => i.id === id)).toBe(true);
  });

  it("reimprimir enquanto a interdição está de pé continua sem mexer na data", async () => {
    const id = await ocorrenciaInterditavel("Rua do Cedro, 9");
    await emitirTermo(id);
    const primeira = (await estado(id)).interditada_em;

    await new Promise((r) => setTimeout(r, 20));
    await emitirTermo(id);

    expect((await estado(id)).interditada_em).toBe(primeira);
  });
});
