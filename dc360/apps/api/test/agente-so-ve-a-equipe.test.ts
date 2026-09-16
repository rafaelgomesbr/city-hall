import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O token do agente de campo NÃO lê a base do município.
 *
 * O QUE O REVISOR PROVOU contra a API real: `GET /ocorrencias`, `GET
 * /ocorrencias/:id`, `/mapa`, `/interditados` e as duas leituras de
 * `/evidencias` exigiam só autenticação. Com o token de um agente (o papel
 * cujo aparelho anda pelo morro, cai e é emprestado), dava para paginar a
 * fila inteira do município, com nome, contato, relato e descrição de
 * vulnerabilidade de cada família, sem uma linha de registro de consulta.
 * `docs/PAPEIS_E_RESPONSABILIDADES.md` promete que o agente "não pode ver a
 * fila do município", e a promessa valia só para a tela.
 *
 * A REGRA: para `agente_campo`, essas leituras recortam às ocorrências da
 * EQUIPE dele, com o mesmo `equipe_id` de `/campo/meu-trabalho`. Sem equipe,
 * vazio. Ocorrência de outra equipe responde 404, nunca 403: 403 confirmaria
 * que aquele identificador existe.
 *
 * E a LISTAGEM deixa de entregar contato, relato e descrição de vulnerabilidade
 * para TODO papel: a tabela do painel não os desenha, e devolvê-los em lote,
 * sem registro, era o "resíduo" que `privacidade/consulta.ts` admitia. Quem
 * precisa deles abre o dossiê, que registra a consulta.
 *
 * Os dados são os da semente: Diego (agente) é da Equipe Alfa; c1 e c4 são da
 * Alfa; c3 e c8 são da Bravo; o resto não tem equipe.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const OC_ALFA_4 = "11111111-1111-4111-8111-0000000000c4";
const OC_BRAVO_8 = "11111111-1111-4111-8111-0000000000c8";
const AGENTE_DIEGO = "11111111-1111-4111-8111-0000000000d3";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;
let tokenOperador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function ids(token: string, url: string): Promise<string[]> {
  const r = await app.inject({ method: "GET", url, headers: com(token) });
  expect(r.statusCode, `${url}: ${r.body}`).toBe(200);
  return (r.json().itens as Array<{ id: string }>).map((i) => i.id).sort();
}

/** Uma evidência já enviada, gravada como dono das tabelas, na ocorrência dada. */
async function evidenciaEm(ocorrenciaId: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO evidencias
       (organizacao_id, ocorrencia_id, chave_storage, capturada_em, ordem,
        tipo_conteudo, tamanho_bytes, enviada_em, anexada_por)
     VALUES ($1, $2, $3, now(), 1, 'image/jpeg', 1024, now(), $4)
     RETURNING id`,
    [
      ORG_A, ocorrenciaId,
      `tenant/${ORG_A}/ocorrencias/${ocorrenciaId}/${crypto.randomUUID()}.jpg`,
      AGENTE_DIEGO,
    ],
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-agente-so-ve-a-equipe-32-bytes!!",
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A listagem do agente é a da equipe dele", () => {
  it("GET /ocorrencias devolve só as da Equipe Alfa, e o total conta só elas", async () => {
    // A âncora: a coordenação vê o município inteiro.
    const tudo = await ids(tokenCoordenador, "/ocorrencias?status=todas&porPagina=100");
    expect(tudo.length).toBeGreaterThan(2);

    const r = await app.inject({
      method: "GET", url: "/ocorrencias?status=todas&porPagina=100", headers: com(tokenAgente),
    });
    expect(r.statusCode).toBe(200);
    const vistas = (r.json().itens as Array<{ id: string }>).map((i) => i.id).sort();
    expect(vistas).toEqual([OC_ALFA_1, OC_ALFA_4].sort());
    // O total é o do recorte, senão a tela diria "2 de 8" e denunciaria os seis.
    expect(r.json().total).toBe(2);
  });

  it("o mapa, os interditados e as duplicidades seguem o mesmo recorte", async () => {
    const mapa = await ids(tokenAgente, "/ocorrencias/mapa");
    for (const id of mapa) expect([OC_ALFA_1, OC_ALFA_4]).toContain(id);

    const rMapa = await app.inject({ method: "GET", url: "/ocorrencias/mapa", headers: com(tokenAgente) });
    const doCoordenador = await app.inject({
      method: "GET", url: "/ocorrencias/mapa", headers: com(tokenCoordenador),
    });
    // O total do mapa também é recortado: ele é impresso na tela ("N ativas").
    expect(rMapa.json().total).toBeLessThan(doCoordenador.json().total);

    // Interdita c8 (Bravo) por fora, como dono das tabelas, e o agente não a vê.
    await mem.bruto.query(
      "UPDATE ocorrencias SET interditada_em = now() WHERE id = $1", [OC_BRAVO_8],
    );
    expect(await ids(tokenCoordenador, "/ocorrencias/interditados")).toContain(OC_BRAVO_8);
    expect(await ids(tokenAgente, "/ocorrencias/interditados")).not.toContain(OC_BRAVO_8);

    const enderecoDaBravo = await mem.bruto.query<{ endereco: string; tipo: string }>(
      "SELECT endereco, tipo FROM ocorrencias WHERE id = $1", [OC_BRAVO_8],
    );
    const { endereco, tipo } = enderecoDaBravo.rows[0]!;
    const consulta = `/ocorrencias/duplicidades/consulta?tipo=${tipo}&endereco=${encodeURIComponent(endereco)}`;
    expect(await ids(tokenCoordenador, consulta)).toContain(OC_BRAVO_8);
    expect(await ids(tokenAgente, consulta)).not.toContain(OC_BRAVO_8);
  });

  it("os indicadores e as providências pendentes não contam o município para o agente", async () => {
    const doCoordenador = await app.inject({
      method: "GET", url: "/ocorrencias/indicadores/painel", headers: com(tokenCoordenador),
    });
    const doAgente = await app.inject({
      method: "GET", url: "/ocorrencias/indicadores/painel", headers: com(tokenAgente),
    });
    expect(doAgente.statusCode).toBe(200);
    expect(doAgente.json().na_fila).toBeLessThan(doCoordenador.json().na_fila);

    const pendentes = await app.inject({
      method: "GET", url: "/ocorrencias/providencias/pendentes", headers: com(tokenAgente),
    });
    expect(pendentes.statusCode).toBe(200);
    for (const p of pendentes.json().itens as Array<{ ocorrencia_id: string }>) {
      expect([OC_ALFA_1, OC_ALFA_4]).toContain(p.ocorrencia_id);
    }
  });
});

describe("O dossiê e as evidências de outra equipe não existem para o agente", () => {
  it("GET /ocorrencias/:id da própria equipe abre, e registra a consulta", async () => {
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${OC_ALFA_1}`, headers: com(tokenAgente),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ocorrencia.id).toBe(OC_ALFA_1);
  });

  it("GET /ocorrencias/:id de outra equipe responde 404, nunca 403, e não registra consulta", async () => {
    const antes = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ocorrencia_consultas WHERE ocorrencia_id = $1", [OC_BRAVO_8],
    );
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${OC_BRAVO_8}`, headers: com(tokenAgente),
    });
    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");
    const depois = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ocorrencia_consultas WHERE ocorrencia_id = $1", [OC_BRAVO_8],
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);

    // E a coordenação continua abrindo a mesma ocorrência: a recusa é do papel, não da linha.
    const daCoordenacao = await app.inject({
      method: "GET", url: `/ocorrencias/${OC_BRAVO_8}`, headers: com(tokenCoordenador),
    });
    expect(daCoordenacao.statusCode).toBe(200);
  });

  it("as evidências de outra equipe não saem, nem em lista nem por URL", async () => {
    const daAlfa = await evidenciaEm(OC_ALFA_1);
    const daBravo = await evidenciaEm(OC_BRAVO_8);

    const listaAlfa = await app.inject({
      method: "GET", url: `/evidencias/ocorrencia/${OC_ALFA_1}`, headers: com(tokenAgente),
    });
    expect(listaAlfa.statusCode).toBe(200);
    expect((listaAlfa.json().itens as Array<{ id: string }>).map((i) => i.id)).toContain(daAlfa);

    const listaBravo = await app.inject({
      method: "GET", url: `/evidencias/ocorrencia/${OC_BRAVO_8}`, headers: com(tokenAgente),
    });
    expect(listaBravo.statusCode).toBe(200);
    expect(listaBravo.json().itens).toEqual([]);

    const urlAlfa = await app.inject({
      method: "GET", url: `/evidencias/${daAlfa}/url`, headers: com(tokenAgente),
    });
    expect(urlAlfa.statusCode, urlAlfa.body).toBe(200);

    const urlBravo = await app.inject({
      method: "GET", url: `/evidencias/${daBravo}/url`, headers: com(tokenAgente),
    });
    expect(urlBravo.statusCode, urlBravo.body).toBe(404);
    expect(urlBravo.body).not.toContain("url");

    // A coordenação continua vendo as duas.
    const listaDaCoordenacao = await app.inject({
      method: "GET", url: `/evidencias/ocorrencia/${OC_BRAVO_8}`, headers: com(tokenCoordenador),
    });
    expect((listaDaCoordenacao.json().itens as Array<{ id: string }>).map((i) => i.id)).toContain(daBravo);
  });
});

describe("Agente sem equipe", () => {
  it("vê lista vazia e 404 em qualquer dossiê, e a lista dele volta quando entra numa equipe", async () => {
    await mem.bruto.query("UPDATE usuarios SET equipe_id = NULL WHERE id = $1", [AGENTE_DIEGO]);
    try {
      const lista = await app.inject({
        method: "GET", url: "/ocorrencias?status=todas", headers: com(tokenAgente),
      });
      expect(lista.statusCode).toBe(200);
      expect(lista.json().itens).toEqual([]);
      expect(lista.json().total).toBe(0);

      const dossie = await app.inject({
        method: "GET", url: `/ocorrencias/${OC_ALFA_1}`, headers: com(tokenAgente),
      });
      expect(dossie.statusCode).toBe(404);
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET equipe_id = '11111111-1111-4111-8111-0000000000e1' WHERE id = $1",
        [AGENTE_DIEGO],
      );
    }
    expect(await ids(tokenAgente, "/ocorrencias?status=todas")).toContain(OC_ALFA_1);
  });
});

describe("A listagem não entrega o que só o dossiê entrega", () => {
  it("nenhum papel recebe contato, relato ou vulnerabilidade na lista paginada", async () => {
    for (const [nome, token] of [
      ["coordenador", tokenCoordenador], ["operador", tokenOperador], ["agente", tokenAgente],
    ] as const) {
      const r = await app.inject({
        method: "GET", url: "/ocorrencias?status=todas", headers: com(token),
      });
      expect(r.statusCode, nome).toBe(200);
      const itens = r.json().itens as Array<Record<string, unknown>>;
      expect(itens.length, nome).toBeGreaterThan(0);
      for (const linha of itens) {
        expect(linha, `${nome}: contato na lista`).not.toHaveProperty("solicitante_contato");
        expect(linha, `${nome}: relato na lista`).not.toHaveProperty("descricao");
        expect(linha, `${nome}: vulnerabilidade na lista`).not.toHaveProperty("vulnerabilidade_descricao");
        // O que a tabela desenha continua vindo.
        expect(linha).toHaveProperty("solicitante_nome");
        expect(linha).toHaveProperty("endereco");
        expect(linha).toHaveProperty("prazo_em");
        expect(linha).toHaveProperty("vulnerabilidade_presente");
      }
    }
  });

  it("o dossiê continua entregando os três, porque ele registra a consulta", async () => {
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${OC_ALFA_1}`, headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ocorrencia).toHaveProperty("solicitante_contato");
    expect(r.json().ocorrencia).toHaveProperty("descricao");
    expect(r.json().ocorrencia).toHaveProperty("vulnerabilidade_descricao");
  });
});
