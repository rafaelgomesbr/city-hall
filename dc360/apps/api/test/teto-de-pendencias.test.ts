import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { TETO_DE_RECONCILIACAO } from "../src/rotas/sincronizacao.js";

/*
  Dois tetos que existem para o aparelho no 3G do morro, e não para o banco.

  1. `GET /sincronizacao/pendencias` não tinha LIMIT. Uma equipe com muita
     ocorrência despachada baixava a lista inteira de uma vez, na conexão pior
     do sistema, que é justamente a de quem está na rua. O teto corta, e a
     resposta DECLARA que cortou: calar seria pior, porque o agente veria uma
     lista aparentemente completa e concluiria que o resto do trabalho não é
     dele.

  2. Com teto, a ORDEM deixa de ser detalhe. A ordenação era só por
     `prazo_em NULLS LAST`, e prazo empata o tempo todo (a coordenação despacha
     um lote inteiro com o mesmo prazo de 24h). Empate sem desempate significa
     ordem indefinida: a mesma pergunta devolve conjuntos diferentes, e a
     tarefa que caiu fora hoje pode ser a que fica dentro amanhã, sem que nada
     tenha mudado. O desempate por id é o que torna o corte uma decisão e não
     um sorteio.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";

/** Igual ao `TETO_DE_PENDENCIAS` de `src/rotas/sincronizacao.ts`. */
const TETO = 200;

/** Quantas tarefas a equipe do Diego tem despachadas, de propósito acima do teto. */
const DESPACHADAS = TETO + 5;

let tokenDiego = "";
let tokenSolange = "";
/** Os ids das tarefas do Diego, na ordem em que o banco os enxerga por id. */
let idsDoDiego: string[] = [];

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
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

  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  const orgId = org.rows[0]!.id;

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  const equipeAlfa = alfa.rows[0]!.id;
  const bravo = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Bravo') RETURNING id", [orgId],
  );
  const equipeBravo = bravo.rows[0]!.id;

  for (const [nome, matricula, email, equipe] of [
    ["Diego", "A-1", "diego@serraalta.exemplo.gov.br", equipeAlfa],
    ["Solange", "B-1", "solange@serraalta.exemplo.gov.br", equipeBravo],
  ] as const) {
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
       VALUES ($1,$2,$3,$4,'agente_campo',$5,$6)`,
      [orgId, nome, matricula, email, equipe, hash],
    );
  }

  /*
    Os ids são escolhidos aqui, e as linhas entram na ordem INVERSA da ordem
    por id, de propósito.

    Sem isso o teste seria um sorteio: com `gen_random_uuid()` e inserção
    sequencial, a ordem física do banco poderia coincidir com a ordem por id e
    a ausência de desempate passaria despercebida. Invertendo, a lista sem
    desempate devolve as tarefas de id MAIOR e a lista com desempate devolve as
    de id menor, e as duas nunca se confundem.

    Todas com o MESMO prazo, que é como a coordenação despacha um lote: o
    empate é a situação normal, não a exótica.
  */
  const prazo = "2026-09-10T12:00:00.000Z";
  idsDoDiego = Array.from({ length: DESPACHADAS }, () => crypto.randomUUID()).sort();

  let numero = 0;
  for (const id of [...idsDoDiego].reverse()) {
    numero += 1;
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (id, organizacao_id, protocolo, tipo, status, severidade, endereco,
          solicitante_nome, canal_entrada, descricao, equipe_id, prazo_em)
       VALUES ($1,$2,$3,'deslizamento','em_campo','alta',$4,'Joana','telefone',
               'Trinca nova depois da chuva.',$5,$6)`,
      [id, orgId, `2026-${String(numero).padStart(5, "0")}`, `Rua do Morro, ${numero}`,
        equipeAlfa, prazo],
    );
  }

  // A equipe Bravo fica com pouca coisa: é o caso de lista que cabe inteira.
  for (let i = 0; i < 3; i++) {
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, severidade, endereco,
          solicitante_nome, canal_entrada, descricao, equipe_id, prazo_em)
       VALUES ($1,$2,'inundacao','em_campo','media',$3,'Marcos','telefone',
               'Água entrou na casa.',$4,$5)`,
      [orgId, `2026-9${i}`, `Servidão Boa Esperança, ${i + 1}`, equipeBravo, prazo],
    );
  }

  await mem.bruto.query(
    "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,1)",
    [orgId, new Date().getFullYear()],
  );

  tokenDiego = await comoUsuario("diego@serraalta.exemplo.gov.br");
  tokenSolange = await comoUsuario("solange@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

async function pendencias(token: string) {
  const r = await app.inject({
    method: "GET", url: "/sincronizacao/pendencias",
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    status: r.statusCode,
    corpo: r.json() as {
      itens: Array<{ id: string; protocolo: string }>;
      teto: number;
      truncada: boolean;
    },
  };
}

describe("teto da lista de pendências", () => {
  it("corta no teto em vez de despejar a fila inteira no 3G do morro", async () => {
    const { status, corpo } = await pendencias(tokenDiego);
    expect(status).toBe(200);
    expect(
      corpo.itens.length,
      `a lista saiu com ${corpo.itens.length} tarefas, sem teto nenhum`,
    ).toBe(TETO);
  });

  it("declara o teto e avisa que cortou, em vez de mentir por omissão", async () => {
    const { corpo } = await pendencias(tokenDiego);
    // Sem estes dois campos o aplicativo não tem como distinguir "acabou o
    // trabalho" de "acabou a lista", e mostra a segunda como se fosse a
    // primeira.
    expect(corpo.teto, "a resposta não declara o teto que aplicou").toBe(TETO);
    expect(corpo.truncada, "a resposta cortou a lista e não avisou").toBe(true);
  });

  it("lista que cabe inteira não vem marcada como cortada", async () => {
    const { corpo } = await pendencias(tokenSolange);
    expect(corpo.itens).toHaveLength(3);
    expect(corpo.truncada, "lista completa marcada como cortada assusta à toa").toBe(false);
    expect(corpo.teto).toBe(TETO);
  });

  it("com prazo empatado, o corte é decidido pelo id e não sorteado", async () => {
    /*
      Esta é a linha que reprova quando falta o desempate por id. Todas as
      tarefas têm o mesmo prazo, então ordenar só por `prazo_em` deixa a ordem
      por conta do plano de execução, e o que entra na lista vira sorteio: a
      página seguinte repete item ou pula item, e a tarefa que caiu fora hoje
      pode ser outra amanhã sem nada ter mudado.
    */
    const { corpo } = await pendencias(tokenDiego);
    expect(corpo.itens.map((o) => o.id)).toEqual(idsDoDiego.slice(0, TETO));
  });

  it("a mesma pergunta devolve a mesma lista", async () => {
    const primeira = await pendencias(tokenDiego);
    const segunda = await pendencias(tokenDiego);
    expect(segunda.corpo.itens.map((o) => o.id)).toEqual(primeira.corpo.itens.map((o) => o.id));
  });
});

describe("teto da reconciliação combinado com o aplicativo", () => {
  /*
    O aplicativo corta a lista de ids no próprio teto antes de enviar. Se os
    dois números divergirem, quem paga é o aparelho que ficou muito tempo fora:
    ele é o que tem mais ids guardados, é o que mais precisa saber por que as
    tarefas sumiram, e é o que levaria 422 e perderia a reconciliação inteira
    em vez de perder só o excedente.

    A comparação é feita lendo o arquivo do aplicativo como texto de propósito:
    importar `apps/campo/src/dados/api.ts` aqui arrastaria o Expo e o React
    Native para dentro da suíte da API.
  */
  it("o teto do servidor é o mesmo que o aplicativo aplica antes de enviar", () => {
    const fonte = readFileSync(
      new URL("../../campo/src/dados/api.ts", import.meta.url), "utf8",
    );
    const achado = /export const TETO_DE_RECONCILIACAO = (\d+)/.exec(fonte);
    expect(achado, "o aplicativo deixou de declarar TETO_DE_RECONCILIACAO").not.toBeNull();
    expect(
      Number(achado![1]),
      "o teto do aplicativo divergiu do teto do servidor: o aparelho que passou "
      + "muito tempo fora leva 422 e perde a reconciliação inteira",
    ).toBe(TETO_DE_RECONCILIACAO);
  });

  it("aceita exatamente o teto e recusa um a mais", async () => {
    const noTeto = Array.from({ length: TETO_DE_RECONCILIACAO }, () => crypto.randomUUID());
    const dentro = await app.inject({
      method: "POST", url: "/sincronizacao/pendencias/reconciliar",
      headers: { authorization: `Bearer ${tokenDiego}` },
      payload: { conhecidas: noTeto },
    });
    expect(dentro.statusCode, "a lista cheia que o aplicativo envia foi recusada").toBe(200);

    const passandoDoTeto = await app.inject({
      method: "POST", url: "/sincronizacao/pendencias/reconciliar",
      headers: { authorization: `Bearer ${tokenDiego}` },
      payload: { conhecidas: [...noTeto, crypto.randomUUID()] },
    });
    expect(passandoDoTeto.statusCode).toBe(422);
  });
});
