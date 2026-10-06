import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * V2-F00-E08: o token do agente de campo NÃO lê ofício e NÃO lê o sino de
 * outra equipe.
 *
 * O QUE O REVISOR PROVOU contra a API real (AUT-12 e AUT-13): `GET /oficios` e
 * `GET /oficios/:id` exigiam só autenticação e devolviam, ao token de um
 * agente, número, órgão, `orgao_email`, `observacoes` e, na ficha, o IP de
 * quem abriu o link, de ofício de ocorrência de QUALQUER equipe. `GET /avisos`
 * entregava protocolo e tipo de fato do município inteiro a qualquer papel, e
 * a contagem `naoLidos` não passava por recorte nenhum (o número do sino
 * denunciava avisos que a lista não mostrava).
 *
 * A REGRA: ofício é ato da coordenação (ação `consultar_oficio`, que o agente
 * não tem), e o sino do agente é o da EQUIPE dele, com o mesmo recorte das
 * leituras de ocorrência. Recurso de outro município responde 404, nunca 403.
 *
 * Os dados são os da semente: Diego é agente da Equipe Alfa (c1 e c4); c3 e c8
 * são da Bravo; Tarcísio é agente de Vale Fundo. O agente da Bravo e a
 * administradora ficam por conta deste arquivo.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const ORG_B = "22222222-2222-4222-8222-000000000002";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const OC_BRAVO_8 = "11111111-1111-4111-8111-0000000000c8";
const OC_SEM_EQUIPE_2 = "11111111-1111-4111-8111-0000000000c2";
const EQUIPE_BRAVO = "11111111-1111-4111-8111-0000000000e2";
const AGENTE_DIEGO = "11111111-1111-4111-8111-0000000000d3";
const AGENTE_BRAVO = "11111111-1111-4111-8111-0000000000d9";
const OC_B_1 = "22222222-2222-4222-8222-0000000000c1";
const EMAIL_DO_ORGAO = "plantao@bombeiros.exemplo.gov.br";
const IP_DE_QUEM_ABRIU = "203.0.113.77";

let mem: BancoEmMemoria;
let app: FastifyInstance;
const tokens: Record<string, string> = {};
let oficioAlfa = "";
let oficioBravo = "";
let oficioDeB = "";

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou (${email}): ${r.body}`);
  return r.json().acesso;
}

/** Orgao, providencia e oficio (com uma abertura que guardou IP), como dono das tabelas. */
async function emitirPorFora(
  org: string, ocorrencia: string, numero: string, sigla: string,
): Promise<string> {
  const db = mem.bruto;
  const orgao = await db.query<{ id: string }>(
    `INSERT INTO orgaos (organizacao_id, nome, sigla, email)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [org, `Corpo de Bombeiros ${sigla}`, sigla, EMAIL_DO_ORGAO],
  );
  const providencia = await db.query<{ id: string }>(
    `INSERT INTO providencias
       (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao,
        responsavel, prazo_em, encaminhada_em)
     VALUES ($1, $2, $3, $4, 'Avaliacao de risco imediato.', 'Chefe de plantao',
             now() + interval '24 hours', now())
     RETURNING id`,
    [org, ocorrencia, orgao.rows[0]!.id, `Corpo de Bombeiros ${sigla}`],
  );
  const oficio = await db.query<{ id: string }>(
    `INSERT INTO oficios
       (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano,
        observacoes, emitido_por_nome)
     VALUES ($1, $2, $3, $4, $5, 2026, 'Observacao reservada da coordenacao.', 'Helena (coordenador)')
     RETURNING id`,
    [org, ocorrencia, providencia.rows[0]!.id, orgao.rows[0]!.id, numero],
  );
  const envio = await db.query<{ id: string }>(
    `INSERT INTO oficio_envios
       (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
        expira_em, solicitado_por_nome, desfecho)
     VALUES ($1, $2, 1, $3, $4, now() + interval '72 hours', 'Helena (coordenador)', 'entregue')
     RETURNING id`,
    [org, oficio.rows[0]!.id, EMAIL_DO_ORGAO, `hash-${sigla}-${numero}`],
  );
  await db.query(
    `INSERT INTO oficio_aberturas (organizacao_id, oficio_id, envio_id, resultado, ip)
     VALUES ($1, $2, $3, 'entregue', $4)`,
    [org, oficio.rows[0]!.id, envio.rows[0]!.id, IP_DE_QUEM_ABRIU],
  );
  return oficio.rows[0]!.id;
}

/** Aviso gravado como dono das tabelas, com idade que ja passou da margem de commit. */
async function semearAviso(org: string, ocorrencia: string, chave: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, criado_em)
     VALUES ($1, 'vistoria_recebida', $2, $3, now() - interval '1 hour')
     RETURNING id`,
    [org, ocorrencia, chave],
  );
  return r.rows[0]!.id;
}

type Sino = {
  itens: Array<{ id: string; ocorrenciaId: string; protocolo: string; lido: boolean }>;
  naoLidos: number;
};

async function sino(token: string): Promise<Sino> {
  const r = await app.inject({ method: "GET", url: "/avisos", headers: com(token) });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as Sino;
}

/**
 * A verdade, calculada fora da rota: os avisos do município que pertencem a
 * ocorrências da equipe, e quantos deles a pessoa ainda não leu. É o oráculo
 * contra o qual a rota é medida, para o teste não depender de quantos avisos
 * a própria semente gera.
 */
async function avisosDaEquipe(
  equipe: string | null, usuario: string,
): Promise<{ ids: string[]; naoLidos: number }> {
  const r = await mem.bruto.query<{ id: string; lido: boolean }>(
    `SELECT a.id, (l.usuario_id IS NOT NULL) AS lido
       FROM avisos a
       JOIN ocorrencias o ON o.organizacao_id = a.organizacao_id AND o.id = a.ocorrencia_id
       LEFT JOIN avisos_lidos l ON l.aviso_id = a.id AND l.usuario_id = $3
      WHERE a.organizacao_id = $1 AND o.equipe_id IS NOT DISTINCT FROM $2
        AND $2::uuid IS NOT NULL
      ORDER BY a.id`,
    [ORG_A, equipe, usuario],
  );
  return {
    ids: r.rows.map((l) => l.id),
    naoLidos: r.rows.filter((l) => !l.lido).length,
  };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-leitura-do-agente-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // Um agente da Equipe Bravo, com a mesma senha da semente, para o caso "a
  // equipe do lado nao ve o que e da Alfa". A semente so tem agente na Alfa.
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     SELECT $1, organizacao_id, 'Bruno Bravo', 'SA-3392', 'bruno.bravo@serraalta.exemplo.gov.br',
            'agente_campo', $2, senha_hash
       FROM usuarios WHERE id = $3`,
    [AGENTE_BRAVO, EQUIPE_BRAVO, AGENTE_DIEGO],
  );

  oficioAlfa = await emitirPorFora(ORG_A, OC_ALFA_1, "000901/2026", "CBA");
  oficioBravo = await emitirPorFora(ORG_A, OC_BRAVO_8, "000902/2026", "CBB");
  oficioDeB = await emitirPorFora(ORG_B, OC_B_1, "000901/2026", "CBV");

  tokens["diego"] = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokens["bruno"] = await entrar("bruno.bravo@serraalta.exemplo.gov.br");
  tokens["helena"] = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokens["jonas"] = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokens["rita"] = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokens["aurelio"] = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
  tokens["tarcisio"] = await entrar("tarcisio.ramos@valefundo.exemplo.gov.br");
}, 240_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Ofício: o agente de campo não lê", () => {
  it("GET /oficios responde 403 sem_permissao ao agente, com ou sem filtro, e não entrega nada", async () => {
    for (const url of ["/oficios", `/oficios?ocorrenciaId=${OC_ALFA_1}`, `/oficios?ocorrenciaId=${OC_BRAVO_8}`]) {
      const r = await app.inject({ method: "GET", url, headers: com(tokens["diego"]!) });
      expect(r.statusCode, `${url}: ${r.body}`).toBe(403);
      expect(r.json().erro).toBe("sem_permissao");
      expect(r.body).not.toContain(EMAIL_DO_ORGAO);
      expect(r.body).not.toContain("000901/2026");
      expect(r.body).not.toContain("000902/2026");
    }
  });

  it("GET /oficios/:id responde 403 ao agente, do ofício da equipe dele, de outra equipe e de um id que não existe: a resposta não revela qual existe", async () => {
    const inexistente = "99999999-9999-4999-8999-999999999999";
    for (const id of [oficioAlfa, oficioBravo, oficioDeB, inexistente]) {
      const r = await app.inject({
        method: "GET", url: `/oficios/${id}`, headers: com(tokens["diego"]!),
      });
      expect(r.statusCode, id).toBe(403);
      expect(r.json().erro, id).toBe("sem_permissao");
      // O que o revisor encontrou: e-mail do órgão, observações e IP de quem abriu o link.
      expect(r.body, id).not.toContain(EMAIL_DO_ORGAO);
      expect(r.body, id).not.toContain("Observacao reservada");
      expect(r.body, id).not.toContain(IP_DE_QUEM_ABRIU);
    }
  });

  it("o agente de outro município também recebe 403, e a 403 não muda com o município do ofício", async () => {
    for (const id of [oficioAlfa, oficioDeB]) {
      const r = await app.inject({
        method: "GET", url: `/oficios/${id}`, headers: com(tokens["tarcisio"]!),
      });
      expect(r.statusCode, id).toBe(403);
      expect(r.json().erro, id).toBe("sem_permissao");
    }
    const lista = await app.inject({ method: "GET", url: "/oficios", headers: com(tokens["tarcisio"]!) });
    expect(lista.statusCode).toBe(403);
  });

  it("sem token continua sendo 401, e não 403", async () => {
    expect((await app.inject({ method: "GET", url: "/oficios" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: `/oficios/${oficioAlfa}` })).statusCode).toBe(401);
  });
});

describe("Ofício: quem tem a ação consulta, e o município vizinho não alcança", () => {
  it("operador, coordenador e administrador listam e abrem (200), com o conteúdo de sempre", async () => {
    for (const quem of ["jonas", "helena", "rita"]) {
      const lista = await app.inject({
        method: "GET", url: "/oficios", headers: com(tokens[quem]!),
      });
      expect(lista.statusCode, `${quem}: ${lista.body}`).toBe(200);
      const numeros = (lista.json().itens as Array<{ numero: string }>).map((i) => i.numero);
      expect(numeros, quem).toEqual(expect.arrayContaining(["000901/2026", "000902/2026"]));

      const filtrada = await app.inject({
        method: "GET", url: `/oficios?ocorrenciaId=${OC_ALFA_1}`, headers: com(tokens[quem]!),
      });
      expect(filtrada.statusCode, quem).toBe(200);
      expect((filtrada.json().itens as unknown[]).length, quem).toBe(1);

      const ficha = await app.inject({
        method: "GET", url: `/oficios/${oficioBravo}`, headers: com(tokens[quem]!),
      });
      expect(ficha.statusCode, `${quem}: ${ficha.body}`).toBe(200);
      expect(ficha.json().orgao_email, quem).toBe(EMAIL_DO_ORGAO);
      expect(ficha.json().aberturas[0].ip, quem).toBe(IP_DE_QUEM_ABRIU);
    }
  });

  it("coordenador de outro município responde 404 no ofício de Serra Alta, e a lista dele não o traz", async () => {
    const r = await app.inject({
      method: "GET", url: `/oficios/${oficioAlfa}`, headers: com(tokens["aurelio"]!),
    });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain(EMAIL_DO_ORGAO);

    const lista = await app.inject({ method: "GET", url: "/oficios", headers: com(tokens["aurelio"]!) });
    expect(lista.statusCode).toBe(200);
    const itens = lista.json().itens as Array<{ id: string }>;
    expect(itens.map((i) => i.id)).toEqual([oficioDeB]);
  });
});

describe("Sino: o agente vê e conta só os avisos da equipe dele", () => {
  let avisoAlfa = "";
  let avisoBravo = "";
  let avisoSemEquipe = "";
  let avisoDeB = "";

  beforeAll(async () => {
    avisoAlfa = await semearAviso(ORG_A, OC_ALFA_1, "e08:alfa");
    avisoBravo = await semearAviso(ORG_A, OC_BRAVO_8, "e08:bravo");
    avisoSemEquipe = await semearAviso(ORG_A, OC_SEM_EQUIPE_2, "e08:sem-equipe");
    avisoDeB = await semearAviso(ORG_B, OC_B_1, "e08:vizinha");

    // A primeira consulta do sino materializa os prazos vencidos da semente
    // (a rota escreve), e o aviso novo carimba `now()`, que ainda esta dentro
    // da margem de commit de dez segundos e nao entraria na lista. Envelhece
    // tudo para o oraculo e a lista medirem o mesmo conjunto.
    await sino(tokens["helena"]!);
    await mem.bruto.query(
      "UPDATE avisos SET criado_em = now() - interval '1 hour' WHERE criado_em > now() - interval '1 hour'",
    );
  });

  it("o agente da Alfa recebe o aviso da Alfa, e não o da Bravo, o da ocorrência sem equipe nem o do vizinho", async () => {
    const r = await sino(tokens["diego"]!);
    const ids = r.itens.map((i) => i.id);
    expect(ids).toContain(avisoAlfa);
    expect(ids).not.toContain(avisoBravo);
    expect(ids).not.toContain(avisoSemEquipe);
    expect(ids).not.toContain(avisoDeB);
    // A lista inteira é exatamente a da equipe: nenhuma outra ocorrência passa.
    const esperado = await avisosDaEquipe("11111111-1111-4111-8111-0000000000e1", AGENTE_DIEGO);
    expect([...ids].sort()).toEqual(esperado.ids);
  });

  it("e o agente da Bravo, o contrário", async () => {
    const r = await sino(tokens["bruno"]!);
    const ids = r.itens.map((i) => i.id);
    expect(ids).toContain(avisoBravo);
    expect(ids).not.toContain(avisoAlfa);
    expect(ids).not.toContain(avisoSemEquipe);
    const esperado = await avisosDaEquipe(EQUIPE_BRAVO, AGENTE_BRAVO);
    expect([...ids].sort()).toEqual(esperado.ids);
  });

  it("a contagem de não lidos é a do recorte: o número não denuncia o aviso de outra equipe", async () => {
    const alfa = await sino(tokens["diego"]!);
    const bravo = await sino(tokens["bruno"]!);
    expect(alfa.naoLidos).toBe(
      (await avisosDaEquipe("11111111-1111-4111-8111-0000000000e1", AGENTE_DIEGO)).naoLidos,
    );
    expect(bravo.naoLidos).toBe(
      (await avisosDaEquipe(EQUIPE_BRAVO, AGENTE_BRAVO)).naoLidos,
    );
    // E o número é o da LISTA: com a lista inteira lida na mão, os dois fecham.
    expect(alfa.naoLidos).toBe(alfa.itens.filter((i) => !i.lido).length);
    expect(bravo.naoLidos).toBe(bravo.itens.filter((i) => !i.lido).length);
  });

  it("agente sem equipe: lista vazia e naoLidos 0, mesmo com avisos no município", async () => {
    await mem.bruto.query("UPDATE usuarios SET equipe_id = NULL WHERE id = $1", [AGENTE_DIEGO]);
    try {
      const r = await sino(tokens["diego"]!);
      expect(r.itens).toEqual([]);
      expect(r.naoLidos).toBe(0);
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET equipe_id = '11111111-1111-4111-8111-0000000000e1' WHERE id = $1",
        [AGENTE_DIEGO],
      );
    }
    expect((await sino(tokens["diego"]!)).itens.map((i) => i.id)).toContain(avisoAlfa);
  });

  it("coordenação, operador e administração seguem vendo o município inteiro, com a contagem de sempre", async () => {
    const total = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM avisos WHERE organizacao_id = $1", [ORG_A],
    );
    for (const quem of ["helena", "jonas", "rita"]) {
      const r = await sino(tokens[quem]!);
      const ids = r.itens.map((i) => i.id);
      expect(ids, quem).toEqual(expect.arrayContaining([avisoAlfa, avisoBravo, avisoSemEquipe]));
      expect(ids, quem).not.toContain(avisoDeB);
      expect(r.itens.length, quem).toBe(total.rows[0]!.n);
      expect(r.naoLidos, quem).toBe(total.rows[0]!.n);
    }
  });

  it("o aviso de outro município nunca aparece, em papel nenhum", async () => {
    for (const quem of ["helena", "diego", "bruno", "rita"]) {
      expect((await sino(tokens[quem]!)).itens.map((i) => i.id), quem).not.toContain(avisoDeB);
    }
    const doVizinho = await sino(tokens["aurelio"]!);
    expect(doVizinho.itens.map((i) => i.id)).toEqual([avisoDeB]);
    const doAgenteVizinho = await sino(tokens["tarcisio"]!);
    expect(doAgenteVizinho.itens.map((i) => i.id)).not.toContain(avisoAlfa);
  });

  it("marcar como lido não funciona como oráculo: o aviso de outra equipe responde 'marcados: 0' e nada é gravado", async () => {
    const antes = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM avisos_lidos WHERE usuario_id = $1", [AGENTE_DIEGO],
    );
    const r = await app.inject({
      method: "POST", url: "/avisos/lidos", headers: com(tokens["diego"]!),
      payload: { ids: [avisoBravo, avisoSemEquipe, avisoDeB] },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().marcados).toBe(0);
    const depois = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM avisos_lidos WHERE usuario_id = $1", [AGENTE_DIEGO],
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);

    // O da própria equipe marca, e o número do sino acompanha.
    const antesDoSino = (await sino(tokens["diego"]!)).naoLidos;
    const dele = await app.inject({
      method: "POST", url: "/avisos/lidos", headers: com(tokens["diego"]!),
      payload: { ids: [avisoAlfa] },
    });
    expect(dele.json().marcados).toBe(1);
    expect((await sino(tokens["diego"]!)).naoLidos).toBe(antesDoSino - 1);

    // E a coordenação continua marcando qualquer aviso do município.
    const daCoord = await app.inject({
      method: "POST", url: "/avisos/lidos", headers: com(tokens["helena"]!),
      payload: { ids: [avisoBravo] },
    });
    expect(daCoord.json().marcados).toBe(1);
  });
});

describe("A escrita dentro do GET /avisos segue como era (pendência registrada, F07-E03 e F04-E11)", () => {
  it("o token do agente também materializa o prazo vencido do município, uma vez só e sem repetir", async () => {
    const vencida = await mem.bruto.query<{ id: string }>(
      `UPDATE ocorrencias SET prazo_em = now() - interval '2 hours'
        WHERE id = $1 RETURNING id`, [OC_BRAVO_8],
    );
    expect(vencida.rows.length).toBe(1);
    const contar = async () => (await mem.bruto.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM avisos
        WHERE organizacao_id = $1 AND tipo = 'prazo_vencido' AND ocorrencia_id = $2`,
      [ORG_A, OC_BRAVO_8],
    )).rows[0]!.n;

    // O agente da Alfa consulta o sino: a escrita acontece (é do município),
    // mas o aviso que nasceu é da Bravo e ele não o recebe.
    const antes = await contar();
    const r = await sino(tokens["diego"]!);
    const depois = await contar();
    expect(depois).toBe(antes === 0 ? 1 : antes);
    expect(r.itens.map((i) => i.ocorrenciaId)).not.toContain(OC_BRAVO_8);

    // Idempotente: consultar de novo, por qualquer papel, não duplica.
    await sino(tokens["diego"]!);
    await sino(tokens["helena"]!);
    expect(await contar()).toBe(depois);
  });
});
