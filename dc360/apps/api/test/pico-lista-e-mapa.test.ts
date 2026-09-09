import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  O dia de pico: a lista, o mapa e o prazo.

  Tres defeitos que so aparecem quando a cidade tem muita ocorrencia ao mesmo
  tempo, que e exatamente o dia em que o painel precisa estar certo.

  1. O MAPA MOSTRAVA METADE DA CIDADE SEM AVISAR. Ele pedia a lista comum, que
     sempre foi paginada, e desenhava o que viesse. O painel pedia cem por
     pagina. Numa enxurrada com duzentas ocorrencias ativas, o coordenador via
     cem marcadores e nada na tela dizia que faltava o resto. Nao e lentidao, e
     informacao falsa numa tela de decisao operacional.

  2. O FILTRO DE ATRASADAS ERA DO NAVEGADOR. Ele peneirava a pagina ja baixada,
     entao "so atrasadas" mostrava as atrasadas QUE COUBERAM, e o rodape
     contava essas. Pior: a expressao do navegador nao era a do indicador do
     painel. O painel excluia rascunho, o navegador nao. Um numero na tela
     dizia trinta, o outro dizia outra coisa, e nao havia como saber qual
     mentiu.

  3. O TETO SILENCIOSO. Um teto de desenho e legitimo (mil marcadores travam a
     aba de um notebook de prefeitura). O que nao pode e a tela nao dizer que
     ele existe. Por isso a rota do mapa devolve o total junto com os pontos.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;
let orgA = "";
let orgB = "";
let token = "";

const SENHA = "senha-de-teste-bem-longa";

/** Ativas com coordenada, prazo no futuro. Severidade baixa. */
const ATIVAS_COM_COORDENADA = 205;
/** Ativas sem coordenada: nunca aparecem no mapa, em desenho nenhum. */
const ATIVAS_SEM_COORDENADA = 7;
/** Atrasadas de verdade: ativas, prazo vencido, severidade critica. */
const ATRASADAS = 30;
/** O teto de pontos por pagina do mapa, fixado na rota. */
const TETO_DO_MAPA = 200;

const ATIVAS = ATIVAS_COM_COORDENADA + ATIVAS_SEM_COORDENADA + ATRASADAS;
const NO_MAPA = ATIVAS_COM_COORDENADA + ATRASADAS;

async function semearOrganizacao(nome: string, municipio: string): Promise<string> {
  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1,$2,'MG') RETURNING id",
    [nome, municipio],
  );
  return org.rows[0]!.id;
}

/**
 * Insere um lote pelo dono das tabelas.
 *
 * Abrir duzentas ocorrencias pela rota levaria minutos e nao provaria nada a
 * mais: o que esta sob teste e a leitura, e o volume e a condicao para o
 * defeito aparecer.
 */
async function lote(
  org: string,
  prefixo: string,
  quantas: number,
  opcoes: {
    status: string;
    severidade: string | null;
    comCoordenada: boolean;
    prazo: "futuro" | "vencido" | "nenhum";
  },
): Promise<void> {
  if (quantas === 0) return;
  const prazo =
    opcoes.prazo === "futuro" ? "now() + interval '4 hours'"
    : opcoes.prazo === "vencido" ? "now() - interval '3 hours'"
    : "NULL";
  const encerrada = opcoes.status === "encerrada";
  await mem.bruto.query(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        latitude, longitude, solicitante_nome, canal_entrada, descricao,
        prazo_em, criado_em, encerrado_em, motivo_encerramento)
     SELECT $1, $2 || '-' || lpad(g::text, 4, '0'), 'deslizamento', $3, $4,
            'Rua de Exemplo, ' || g,
            ${opcoes.comCoordenada ? "-19.9 + g * 0.0001" : "NULL"},
            ${opcoes.comCoordenada ? "-43.9 + g * 0.0001" : "NULL"},
            'Solicitante ' || g, 'telefone', 'Relato de exemplo para teste.',
            ${prazo}, now() - (g || ' minutes')::interval,
            ${encerrada ? "now()" : "NULL"},
            ${encerrada ? "'Risco cessado apos vistoria.'" : "NULL"}
       FROM generate_series(1, $5) g`,
    [org, prefixo, opcoes.status, opcoes.severidade, quantas],
  );
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);

  orgA = await semearOrganizacao("Coordenadoria Serra Alta", "Serra Alta");
  orgB = await semearOrganizacao("Coordenadoria Vale Fundo", "Vale Fundo");
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgA, hash],
  );

  await lote(orgA, "AT", ATIVAS_COM_COORDENADA, {
    status: "triagem", severidade: "baixa", comCoordenada: true, prazo: "futuro",
  });
  await lote(orgA, "SC", ATIVAS_SEM_COORDENADA, {
    status: "registrada", severidade: null, comCoordenada: false, prazo: "nenhum",
  });
  await lote(orgA, "VE", ATRASADAS, {
    status: "em_campo", severidade: "critica", comCoordenada: true, prazo: "vencido",
  });
  // Rascunho vencido e encerrada vencida: as duas armadilhas da definicao de
  // "atrasada". Nenhuma das duas conta, nem no painel nem na lista.
  await lote(orgA, "RA", 1, {
    status: "rascunho", severidade: "alta", comCoordenada: true, prazo: "vencido",
  });
  await lote(orgA, "EN", 1, {
    status: "encerrada", severidade: "alta", comCoordenada: true, prazo: "vencido",
  });
  // Municipio vizinho, com ocorrencias ativas e com coordenada.
  await lote(orgB, "VF", 3, {
    status: "triagem", severidade: "critica", comCoordenada: true, prazo: "vencido",
  });

  const r = await app.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "helena@serraalta.exemplo.gov.br", senha: SENHA },
  });
  token = r.json().acesso as string;
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

const cabecalho = () => ({ authorization: `Bearer ${token}` });

async function pegar(url: string): Promise<{ codigo: number; corpo: any }> {
  const r = await app.inject({ method: "GET", url, headers: cabecalho() });
  return { codigo: r.statusCode, corpo: r.statusCode < 400 ? r.json() : null };
}

/**
 * Pede o mapa e cobra a resposta antes de olhar o conteudo.
 *
 * Sem esta cobranca, a ausencia da rota apareceria em cada caso como "Cannot
 * read properties of null", que nao diz nada a quem le a falha. Ela existe
 * para a saida vermelha nomear o defeito.
 */
async function mapa(url = "/ocorrencias/mapa"): Promise<any> {
  const { codigo, corpo } = await pegar(url);
  expect(
    codigo,
    "a rota do mapa nao respondeu: sem ela a tela pede a lista comum e "
    + "desenha a primeira pagina como se fosse a cidade inteira",
  ).toBe(200);
  return corpo;
}

describe("A lista devolve pagina e total, e o total e o de verdade", () => {
  it("uma pagina de dez traz dez itens e o total de todas as ativas", async () => {
    const { codigo, corpo } = await pegar("/ocorrencias?status=ativas&pagina=1&porPagina=10");
    expect(codigo).toBe(200);
    expect(corpo.itens).toHaveLength(10);
    expect(corpo.total).toBe(ATIVAS);
    expect(corpo.pagina).toBe(1);
    expect(corpo.porPagina).toBe(10);
  });

  it("percorrer todas as paginas nao repete nem perde ocorrencia", async () => {
    const vistos = new Set<string>();
    const porPagina = 50;
    const paginas = Math.ceil(ATIVAS / porPagina);
    for (let p = 1; p <= paginas; p++) {
      const { corpo } = await pegar(`/ocorrencias?status=ativas&pagina=${p}&porPagina=${porPagina}`);
      for (const item of corpo.itens as Array<{ id: string }>) vistos.add(item.id);
    }
    expect(
      vistos.size,
      "linha repetida entre paginas ou linha que nao aparece em nenhuma: "
      + "a ordenacao da lista precisa ser total, com desempate estavel",
    ).toBe(ATIVAS);
  });

  it("pagina alem do fim devolve lista vazia e o total continuo dizendo a verdade", async () => {
    // A tela precisa do total para se corrigir sozinha. Devolver zero aqui
    // faria a lista dizer "nenhuma ocorrencia" com a cidade cheia.
    const { corpo } = await pegar("/ocorrencias?status=ativas&pagina=999&porPagina=20");
    expect(corpo.itens).toHaveLength(0);
    expect(corpo.total).toBe(ATIVAS);
  });
});

describe("O filtro de atrasadas e do servidor, e e o mesmo do painel", () => {
  it("filtrar atrasadas conta TODAS as atrasadas, nao as que couberam na pagina", async () => {
    const { corpo } = await pegar("/ocorrencias?status=ativas&atrasadas=1&pagina=1&porPagina=5");
    expect(corpo.itens).toHaveLength(5);
    expect(
      corpo.total,
      "o filtro de atrasadas nao chegou ao servidor: o total voltou sendo o "
      + "da fila inteira, e a tela ia peneirar no navegador so o que baixou",
    ).toBe(ATRASADAS);
  });

  it("a lista filtrada e o indicador do painel dao o MESMO numero", async () => {
    const painel = await pegar("/ocorrencias/indicadores/painel");
    const lista = await pegar("/ocorrencias?status=ativas&atrasadas=1&porPagina=100");
    expect(painel.corpo.atrasadas).toBe(ATRASADAS);
    expect(
      lista.corpo.total,
      "o painel e a lista contam atrasadas de jeitos diferentes. O coordenador "
      + "clica no indicador que diz " + painel.corpo.atrasadas + " e cai numa "
      + "lista que diz " + lista.corpo.total,
    ).toBe(painel.corpo.atrasadas);
  });

  it("rascunho vencido e encerrada vencida nao sao atrasadas", async () => {
    const { corpo } = await pegar("/ocorrencias?status=todas&atrasadas=1&porPagina=100");
    const status = new Set((corpo.itens as Array<{ status: string }>).map((o) => o.status));
    expect(status.has("rascunho"), "rascunho e chamado que ninguem assumiu").toBe(false);
    expect(status.has("encerrada"), "encerrada nao tem prazo a estourar").toBe(false);
    expect(corpo.total).toBe(ATRASADAS);
  });

  it('desligar o filtro com "0" desliga mesmo', async () => {
    // Toda string nao vazia e verdadeira em JavaScript: sem esquema explicito,
    // `atrasadas=0` LIGARIA o filtro e a fila apareceria pela metade.
    const { corpo } = await pegar("/ocorrencias?status=ativas&atrasadas=0&porPagina=10");
    expect(corpo.total).toBe(ATIVAS);
  });
});

describe("O mapa diz quantas existem, e nao so quantas desenhou", () => {
  it("devolve o total de ativas com coordenada junto com os pontos", async () => {
    const corpo = await mapa();
    expect(corpo.total).toBe(NO_MAPA);
    expect(corpo.itens.length).toBe(TETO_DO_MAPA);
    expect(
      corpo.itens.length,
      "o teto nao foi exercitado: o teste precisa de mais ativas com "
      + "coordenada do que cabe numa pagina, senao nada prova o aviso",
    ).toBeLessThan(corpo.total);
  });

  it("conta a parte separadamente as ativas SEM coordenada", async () => {
    // Elas nao aparecem no mapa em desenho nenhum, e some-las ao total faria
    // a tela prometer marcador que nunca vai existir.
    const corpo = await mapa();
    expect(corpo.semCoordenada).toBe(ATIVAS_SEM_COORDENADA);
  });

  it("a segunda pagina traz o resto, sem repetir a primeira", async () => {
    const um = await mapa("/ocorrencias/mapa?pagina=1");
    const dois = await mapa("/ocorrencias/mapa?pagina=2");
    expect(dois.itens.length).toBe(NO_MAPA - TETO_DO_MAPA);
    const ids = new Set<string>();
    for (const item of [...um.itens, ...dois.itens] as Array<{ id: string }>) {
      ids.add(item.id);
    }
    expect(ids.size).toBe(NO_MAPA);
  });

  it("o que o teto corta e o menos grave, nunca a critica", async () => {
    const corpo = await mapa("/ocorrencias/mapa?pagina=1");
    const criticas = (corpo.itens as Array<{ severidade: string }>)
      .filter((o) => o.severidade === "critica").length;
    expect(
      criticas,
      "ocorrencia critica ficou de fora do primeiro desenho do mapa",
    ).toBe(ATRASADAS);
  });

  it("nao desenha ocorrencia encerrada nem rascunho", async () => {
    const um = await mapa("/ocorrencias/mapa?pagina=1");
    const dois = await mapa("/ocorrencias/mapa?pagina=2");
    const status = new Set(
      [...um.itens, ...dois.itens].map((o: { status: string }) => o.status),
    );
    expect(status.has("encerrada")).toBe(false);
    expect(status.has("rascunho")).toBe(false);
  });

  it("nao devolve relato, contato nem vulnerabilidade do solicitante", async () => {
    /*
      O mapa precisa de protocolo, tipo, severidade, endereco e coordenada. Uma
      tela que desenha a cidade inteira de uma vez nao tem por que carregar
      telefone de morador e descricao de vulnerabilidade social junto.
    */
    const corpo = await mapa("/ocorrencias/mapa?porPagina=1");
    const ponto = corpo.itens[0] as Record<string, unknown>;
    expect(Object.keys(ponto).sort()).toEqual(
      ["endereco", "id", "latitude", "longitude", "protocolo", "severidade", "status", "tipo"],
    );
  });

  it("o mapa de um municipio nao conta nem desenha o do vizinho", async () => {
    // Regra numero um da casa. O vizinho tem tres ativas com coordenada, todas
    // criticas e vencidas: se o RLS falhasse, o total e a contagem de criticas
    // acusariam na hora.
    const corpo = await mapa();
    expect(corpo.total).toBe(NO_MAPA);
    const doVizinho = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ocorrencias WHERE organizacao_id = $1", [orgB],
    );
    expect(Number(doVizinho.rows[0]!.n)).toBe(3);
    const protocolos = (corpo.itens as Array<{ protocolo: string }>).map((o) => o.protocolo);
    expect(protocolos.some((p) => p.startsWith("VF"))).toBe(false);
  });

  it("pedir mais que o teto e recusado, e nao atendido em silencio", async () => {
    // Atender calado devolveria uma pagina menor que a pedida, e a tela
    // acharia que ja tinha tudo.
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/mapa?porPagina=${TETO_DO_MAPA + 1}`, headers: cabecalho(),
    });
    expect(r.statusCode).toBe(422);
  });

  it("sem token nao ha mapa", async () => {
    const r = await app.inject({ method: "GET", url: "/ocorrencias/mapa" });
    expect(r.statusCode).toBe(401);
  });
});
