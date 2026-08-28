import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A interdição tem fim, e o fim é um ato com autor, data e motivo.
 *
 * O QUE FALTAVA. O sistema sabia interditar e não sabia desinterditar. O termo
 * saía, e não existia coluna, rota nem documento para o dia em que o risco
 * cessa. A ocorrência era encerrada e a interdição sumia junto, sem nunca ter
 * sido levantada.
 *
 * Isso não é lacuna de funcionalidade, é defeito com pessoa dentro. Uma
 * família interditada volta para casa de um jeito ou de outro: ou espera um
 * papel que ninguém emite, ou volta por conta própria enquanto o registro
 * oficial continua dizendo que a casa é insegura.
 *
 * O que este arquivo prende:
 *
 * 1. Emitir o termo É interditar, e a data é a da PRIMEIRA emissão.
 * 2. Não se levanta o que não foi interditado.
 * 3. Não se levanta duas vezes.
 * 4. Quem não tem a permissão não levanta, e o município vizinho não enxerga.
 * 5. O ato entra na trilha, que é append-only.
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
let tokenOperador: string;
let tokenDeFora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** Uma ocorrência com vistoria concluída, indicando interdição ou não. */
async function comVistoria(
  endereco: string, interdicao = true,
): Promise<{ id: string; protocolo: string }> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  const { id, protocolo } = criar.json();

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

  const coletadaEm = new Date(Date.now() - 5_000).toISOString();
  const s = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId: id,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: interdicao },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [],
        gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado",
        assinaturaChave: null,
        coletadaEm,
        observacoes: "Vistoria realizada com a moradora presente.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);
  return { id, protocolo };
}

/** Emite o termo, que é o ato que interdita. */
async function interditar(id: string): Promise<void> {
  const r = await app.inject({
    method: "GET", url: `/documentos/${id}/termo-de-interdicao`,
    headers: com(tokenCoordenador),
  });
  if (r.statusCode !== 200) throw new Error(`termo falhou: ${r.body}`);
}

function interditados(token: string) {
  return app.inject({ method: "GET", url: "/ocorrencias/interditados", headers: com(token) });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-desinterdicao-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Emitir o termo é interditar", () => {
  it("o imóvel aparece na lista de interditados depois do termo", async () => {
    const alvo = await comVistoria("Rua do Mirante, 88");

    const antes = await interditados(tokenCoordenador);
    expect(antes.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(false);

    await interditar(alvo.id);

    const depois = await interditados(tokenCoordenador);
    const linha = depois.json().itens.find((i: { id: string }) => i.id === alvo.id);
    expect(linha, "o termo saiu e o imóvel não entrou na lista").toBeDefined();
    expect(linha.endereco).toBe("Rua do Mirante, 88");
    expect(linha.interditada_por_nome).toBe("Helena Vasques Coutinho");
  });

  it("reimprimir o termo NÃO muda a data da interdição", async () => {
    /*
      Reimprimir é rotina: o primeiro papel molhou, o processo pede segunda
      via, a recepção imprime de novo. A interdição, porém, aconteceu quando
      aconteceu. Se a segunda impressão reescrevesse a data, o registro
      passaria a dizer que a família ficou fora de casa menos tempo do que
      ficou, e é essa conta que alguém vai querer fazer depois.
    */
    const alvo = await comVistoria("Travessa São Bento, 12");
    await interditar(alvo.id);
    const primeira = (await interditados(tokenCoordenador)).json()
      .itens.find((i: { id: string }) => i.id === alvo.id).interditada_em;

    await new Promise((r) => setTimeout(r, 20));
    await interditar(alvo.id);

    const segunda = (await interditados(tokenCoordenador)).json()
      .itens.find((i: { id: string }) => i.id === alvo.id).interditada_em;
    expect(segunda).toBe(primeira);
  });
});

describe("Levantar a interdição", () => {
  it("sai da lista de interditados e entra na trilha", async () => {
    const alvo = await comVistoria("Rua das Palmeiras, 340");
    await interditar(alvo.id);

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenCoordenador), payload: { motivo: MOTIVO },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().status).toBe("desinterditada");

    const lista = await interditados(tokenCoordenador);
    expect(lista.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(false);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${alvo.id}`, headers: com(tokenCoordenador),
    });
    const evento = detalhe.json().trilha.find(
      (e: { tipo: string }) => e.tipo === "desinterdicao",
    );
    expect(evento, "o levantamento não entrou na trilha").toBeDefined();
    expect(evento.autor_nome).toBe("Helena Vasques Coutinho");
    // O motivo fica na trilha, e não só na coluna: a coluna é o estado de
    // hoje, a trilha é o que aconteceu, e é ela que não se reescreve.
    expect(evento.detalhe.motivo).toBe(MOTIVO);
  });

  it("não levanta o que nunca foi interditado", async () => {
    const alvo = await comVistoria("Rua Nova, 5", false);
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenCoordenador), payload: { motivo: MOTIVO },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("nao_interditada");
  });

  it("não levanta duas vezes", async () => {
    /*
      O segundo levantamento seria um evento falso numa trilha sem policy de
      DELETE: não existe correção depois. É a mesma regra do encerramento
      duplicado, e o caminho para cá é o mesmo: um clique repetido.
    */
    const alvo = await comVistoria("Alameda dos Ipês, 71");
    await interditar(alvo.id);

    const primeira = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenCoordenador), payload: { motivo: MOTIVO },
    });
    expect(primeira.statusCode).toBe(200);

    const segunda = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenCoordenador), payload: { motivo: MOTIVO },
    });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("ja_desinterditada");
  });

  it("recusa motivo curto demais para justificar coisa nenhuma", async () => {
    const alvo = await comVistoria("Rua do Cedro, 9");
    await interditar(alvo.id);

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenCoordenador), payload: { motivo: "ok" },
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("Quem pode levantar interdição", () => {
  it("o operador de plantão não pode", async () => {
    /*
      Registrar chamado e classificar triagem é o trabalho dele. Autorizar uma
      família a voltar para uma casa que o município declarou insegura é
      decisão de coordenação, e esconder o botão na tela não é controle de
      acesso.
    */
    const alvo = await comVistoria("Rua Bela Vista, 400");
    await interditar(alvo.id);

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenOperador), payload: { motivo: MOTIVO },
    });
    expect(r.statusCode).toBe(403);

    // E continua interditado: a recusa não pode ter efeito colateral.
    const lista = await interditados(tokenCoordenador);
    expect(lista.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(true);
  });

  it("o agente de campo não pode", async () => {
    const alvo = await comVistoria("Rua do Sol, 210");
    await interditar(alvo.id);
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenAgente), payload: { motivo: MOTIVO },
    });
    expect(r.statusCode).toBe(403);
  });

  it("sem token não passa", async () => {
    const alvo = await comVistoria("Rua Sem Nome, 1");
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      payload: { motivo: MOTIVO },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe("O município vizinho não alcança", () => {
  it("responde 404, e não 403, para imóvel de outro município", async () => {
    // 403 confirmaria que o recurso existe. A regra do produto é 404.
    const alvo = await comVistoria("Rua Fronteira, 33");
    await interditar(alvo.id);

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/desinterdicao`,
      headers: com(tokenDeFora), payload: { motivo: MOTIVO },
    });
    expect(r.statusCode).toBe(404);
  });

  it("a lista de interditados só mostra o próprio município", async () => {
    const alvo = await comVistoria("Rua Divisa, 77");
    await interditar(alvo.id);

    const daqui = await interditados(tokenCoordenador);
    const dela = await interditados(tokenDeFora);

    expect(daqui.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(true);
    expect(dela.json().itens.some((i: { id: string }) => i.id === alvo.id)).toBe(false);
  });
});
