import type { FastifyInstance, FastifyRequest } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { criarAutenticacaoDaRequisicao } from "../src/auth/autenticacao-da-requisicao.js";
import { derivarSenha } from "../src/auth/senha.js";
import { emitirAcesso } from "../src/auth/tokens.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import type { Banco } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { rotasRegistradas } from "./apoio/rotas.js";
import { ehSemToken } from "./superficie-registrada.js";

/**
 * A vigência vale em TODA requisição autenticada, leitura inclusive
 * (V2-F03-E03, ADR 0009 decisão 2, divida DV-35).
 *
 * ANTES: só a escrita (e o GET marcado com efeito) ia ao banco conferir se
 * quem apresenta o token AINDA PODE. Conta desativada, sessão encerrada por
 * quem administra, senha provisória vencida e município suspenso continuavam
 * LENDO por até `ACESSO_MINUTOS` (15). A leitura devolve dossiê de família
 * (nome, contato, vulnerabilidade): ler é o ato que mais importa proteger.
 *
 * AGORA: `criarAutenticacaoDaRequisicao` chama `lerVigencia` e `exigirVigencia`
 * em todo método, GET e HEAD incluídos, numa consulta só e sem cache.
 *
 * O QUE ESTE ARQUIVO FAZ DE DIFERENTE DE `vigencia-na-escrita.test.ts`: aquele
 * prova a regra em rotas escolhidas; este ENUMERA as rotas do servidor montado
 * (as mesmas de `superficie.test.ts`, menos as isenções de `SEM_TOKEN`) e exige
 * a recusa de CADA UMA, em cada situação de vigência. Rota nova, de qualquer
 * método, que esquecesse a autenticação ou que a fizesse sem a vigência,
 * reprovaria aqui sem ninguém ter de lembrar.
 *
 * Duas âncoras impedem que o teste passe vazio: o controle (com a vigência em
 * dia nenhuma rota responde um dos códigos de vigência) e a contagem mínima de
 * rotas de cada método.
 */

const SENHA = "defesa-civil-2026";
const SEGREDO = "segredo-da-vigencia-em-toda-requisicao-com-32-bytes!";
/*
  A conta de cada caso é NOVA (ver `beforeEach`), e por duas razões: o limitador
  de taxa da API tem balde por usuário e roda ANTES da autenticação, então uma
  varredura de todas as rotas esgotaria o balde de uma conta única e a resposta
  seria 429, e não a recusa de vigência que se quer ver; e cada caso estraga a
  vigência da sua conta sem precisar consertar nada para o seguinte. O nome
  `HELENA` ficou porque a conta é sempre uma coordenadora do mesmo município.
*/
let EMAIL_HELENA = "";
let HELENA = "";
let hashDaSenha = "";
let contas = 0;
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const UUID_QUALQUER = "00000000-0000-4000-8000-000000000000";

/** Todo código de vigência: com a vigência em dia, nenhum deles pode sair. */
const CODIGOS_DE_VIGENCIA = [
  "sessao_encerrada",
  "conta_desativada",
  "acesso_suspenso",
  "nao_autenticado",
  "troca_de_senha_obrigatoria",
];

let mem: BancoEmMemoria;
let app: FastifyInstance;
let organizacaoDeHelena: string;
let segredo: Uint8Array;

const com = (t: string) => ({ authorization: `Bearer ${t}` });
const preencher = (caminho: string) => caminho.replace(/:[A-Za-z]+/g, UUID_QUALQUER);

async function entrar(email = EMAIL_HELENA): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

async function restaurarHelena(): Promise<void> {
  await mem.bruto.query(
    `UPDATE usuarios SET ativo = true, papel = 'coordenador', senha_provisoria_ate = NULL
      WHERE id = $1`,
    [HELENA],
  );
  await mem.bruto.query(
    "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1",
    [organizacaoDeHelena],
  );
}

type Resposta = { rota: string; status: number; erro: string | undefined; corpo: string };

/** O HEAD não leva corpo: para ele o status é a prova inteira. */
const ehHead = (r: Resposta) => r.rota.startsWith("HEAD ");

/** Pede CADA rota autenticada (e o HEAD de cada GET, se `comHead`) com o token dado. */
async function varrer(token: string, comHead = false): Promise<Resposta[]> {
  const respostas: Resposta[] = [];
  for (const rota of rotasRegistradas(app)) {
    const chave = `${rota.metodo} ${rota.caminho}`;
    if (ehSemToken(chave)) continue;
    const metodos = comHead && rota.metodo === "GET" ? ["GET", "HEAD"] : [rota.metodo];
    for (const metodo of metodos) {
      const r = await app.inject({
        method: metodo as "GET",
        url: preencher(rota.caminho),
        headers: com(token),
        payload: metodo === "GET" || metodo === "HEAD" ? undefined : {},
      });
      let erro: string | undefined;
      try {
        erro = (r.json() as { erro?: string }).erro;
      } catch {
        erro = undefined;
      }
      respostas.push({
        rota: `${metodo} ${rota.caminho}`,
        status: r.statusCode,
        erro,
        corpo: r.body,
      });
    }
  }
  return respostas;
}

/** Quais respostas NÃO são a recusa esperada, para a mensagem de falha listar as rotas. */
function foraDoEsperado(
  respostas: Resposta[],
  esperado: { erro: string; status: number | number[] },
): string[] {
  const aceitos = Array.isArray(esperado.status) ? esperado.status : [esperado.status];
  return respostas
    .filter((r) => !((ehHead(r) || r.erro === esperado.erro) && aceitos.includes(r.status)))
    .map((r) => `${r.rota} respondeu ${r.status} ${r.erro ?? "(sem erro)"}`);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: SEGREDO,
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  segredo = config.jwtSegredos[0];
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    // A varredura pede cada rota várias vezes; o teto global não é o assunto aqui.
    limitePorMinuto: 100_000,
  });
  await app.ready();
  const org = await mem.bruto.query<{ organizacao_id: string }>(
    "SELECT organizacao_id FROM usuarios WHERE email = 'helena.coutinho@serraalta.exemplo.gov.br'",
  );
  organizacaoDeHelena = org.rows[0]!.organizacao_id;
  hashDaSenha = await derivarSenha(SENHA);
}, 180_000);

beforeEach(async () => {
  contas += 1;
  EMAIL_HELENA = `coordenacao.e03.${String(contas)}@serraalta.exemplo.gov.br`;
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,$2,$3,$4,'coordenador',$5) RETURNING id`,
    [
      organizacaoDeHelena,
      `Coordenação de prova ${String(contas)}`,
      `E03-${String(contas)}`,
      EMAIL_HELENA,
      hashDaSenha,
    ],
  );
  HELENA = r.rows[0]!.id;
});

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A varredura enxerga a superfície inteira", () => {
  it("há rotas autenticadas de cada método, e a leitura é a maioria que a E03 liga", () => {
    const autenticadas = rotasRegistradas(app).filter(
      (r) => !ehSemToken(`${r.metodo} ${r.caminho}`),
    );
    const porMetodo = (m: string) => autenticadas.filter((r) => r.metodo === m).length;
    // Âncora: se a leitura da árvore quebrar, os casos abaixo passariam vazios.
    expect(autenticadas.length).toBeGreaterThan(60);
    expect(porMetodo("GET")).toBeGreaterThan(20);
    expect(porMetodo("POST")).toBeGreaterThan(20);
  });

  it("controle: com a vigência em dia nenhuma rota responde código de vigência", async () => {
    const token = await entrar();
    const respostas = await varrer(token);
    const indevidas = respostas
      .filter((r) => r.erro !== undefined && CODIGOS_DE_VIGENCIA.includes(r.erro))
      .map((r) => `${r.rota} respondeu ${r.status} ${r.erro}`);
    expect(indevidas, "o controle quebrou: a sonda não distingue vigência de outro erro").toEqual(
      [],
    );
    // E o token continua valendo: o controle não se encerrou a si mesmo.
    expect(
      (await app.inject({ method: "GET", url: "/ocorrencias?status=ativas", headers: com(token) }))
        .statusCode,
    ).toBe(200);
  }, 180_000);
});

describe("Toda rota autenticada recusa quem já não pode, leitura inclusive", () => {
  it("sessão encerrada: 401 sessao_encerrada em todas, GET e HEAD", async () => {
    const token = await entrar();
    await mem.bruto.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra' WHERE usuario_id = $1",
      [HELENA],
    );
    const respostas = await varrer(token, true);
    expect(respostas.length).toBeGreaterThan(60);
    expect(foraDoEsperado(respostas, { erro: "sessao_encerrada", status: 401 })).toEqual([]);
    // O HEAD também (não leva corpo: o status é a prova).
    const heads = respostas.filter(ehHead);
    expect(heads.length).toBeGreaterThan(20);
    expect(heads.every((r) => r.status === 401)).toBe(true);
  }, 180_000);

  it("conta desativada: 403 conta_desativada em todas, mesmo com a sessão ainda de pé", async () => {
    const token = await entrar();
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [HELENA]);
    try {
      const respostas = await varrer(token, true);
      expect(foraDoEsperado(respostas, { erro: "conta_desativada", status: 403 })).toEqual([]);
    } finally {
      await restaurarHelena();
    }
  }, 180_000);

  it("município suspenso: 403 acesso_suspenso em todas (503 só na fila do campo, que é escrita)", async () => {
    const token = await entrar();
    await mem.bruto.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1",
      [organizacaoDeHelena],
    );
    try {
      const respostas = await varrer(token, true);
      expect(foraDoEsperado(respostas, { erro: "acesso_suspenso", status: [403, 503] })).toEqual(
        [],
      );
      // A fila do aparelho (503) é de rota de escrita; toda leitura responde 403.
      const filas503 = respostas.filter((r) => r.status === 503);
      expect(filas503.length).toBeGreaterThan(0);
      expect(filas503.every((r) => r.rota.startsWith("POST ") || r.rota.startsWith("PUT "))).toBe(
        true,
      );
      expect(
        respostas.filter((r) => r.rota.startsWith("GET ")).every((r) => r.status === 403),
      ).toBe(true);
    } finally {
      await restaurarHelena();
    }
  }, 180_000);

  it("município eliminado (linha ainda de pé) conta como suspenso, em toda rota", async () => {
    const token = await entrar();
    // A ordem que o banco cobra: suspensa, agendada, e só então eliminada.
    await mem.bruto.query(
      `UPDATE organizacoes
          SET acesso_suspenso_em = now(), suspensao_motivo = 'eliminacao de prova',
              eliminacao_agendada_para = now() - interval '1 day', eliminada_em = now()
        WHERE id = $1`,
      [organizacaoDeHelena],
    );
    try {
      const respostas = await varrer(token);
      expect(foraDoEsperado(respostas, { erro: "acesso_suspenso", status: [403, 503] })).toEqual(
        [],
      );
    } finally {
      await mem.bruto.query(
        "UPDATE organizacoes SET eliminada_em = NULL, eliminacao_agendada_para = NULL WHERE id = $1",
        [organizacaoDeHelena],
      );
      await restaurarHelena();
    }
  }, 180_000);

  it("senha provisória VENCIDA: 401 sessao_encerrada em todas, e a troca de senha não é exceção", async () => {
    const token = await entrar();
    await mem.bruto.query(
      "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 hour' WHERE id = $1",
      [HELENA],
    );
    try {
      const respostas = await varrer(token);
      expect(foraDoEsperado(respostas, { erro: "sessao_encerrada", status: 401 })).toEqual([]);
    } finally {
      await restaurarHelena();
    }
  }, 180_000);

  it("papel rebaixado: 401 nao_autenticado em todas (renove e repita), e a renovação traz o papel novo", async () => {
    const token = await entrar();
    await mem.bruto.query("UPDATE usuarios SET papel = 'operador' WHERE id = $1", [HELENA]);
    try {
      const respostas = await varrer(token);
      expect(foraDoEsperado(respostas, { erro: "nao_autenticado", status: 401 })).toEqual([]);
    } finally {
      await restaurarHelena();
    }
  }, 180_000);

  it("sid de OUTRA pessoa: 401 sessao_encerrada em todas, a sessão tem de ser da própria conta", async () => {
    const sessaoDeRita = await mem.bruto.query<{ id: string }>(
      `SELECT s.id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE u.email = 'rita.lopes@serraalta.exemplo.gov.br' AND s.revogada_em IS NULL LIMIT 1`,
    );
    let sidDeRita = sessaoDeRita.rows[0]?.id;
    if (!sidDeRita) {
      await entrar("rita.lopes@serraalta.exemplo.gov.br");
      sidDeRita = (
        await mem.bruto.query<{ id: string }>(
          `SELECT s.id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
            WHERE u.email = 'rita.lopes@serraalta.exemplo.gov.br' AND s.revogada_em IS NULL LIMIT 1`,
        )
      ).rows[0]!.id;
    }
    const forjado = await emitirAcesso(
      segredo,
      {
        sub: HELENA,
        org: organizacaoDeHelena,
        papel: "coordenador",
        nome: "Helena",
        sid: sidDeRita,
      },
      15,
    );
    const respostas = await varrer(forjado);
    expect(foraDoEsperado(respostas, { erro: "sessao_encerrada", status: 401 })).toEqual([]);
  }, 180_000);

  it("senha provisória EM VIGOR, mesmo sem a marca no token: o banco manda, e só a troca e o encerrar abrem", async () => {
    const token = await entrar();
    await mem.bruto.query(
      "UPDATE usuarios SET senha_provisoria_ate = now() + interval '1 hour' WHERE id = $1",
      [HELENA],
    );
    try {
      const respostas = await varrer(token);
      const abertas = new Set([
        "POST /auth/trocar-senha",
        "POST /v1/auth/trocar-senha",
        "POST /auth/encerrar-sessoes",
        "POST /v1/auth/encerrar-sessoes",
      ]);
      const trancadas = respostas.filter((r) => !abertas.has(r.rota));
      expect(trancadas.length).toBeGreaterThan(60);
      expect(
        foraDoEsperado(trancadas, { erro: "troca_de_senha_obrigatoria", status: 403 }),
      ).toEqual([]);
      // As duas rotas abertas passam da vigência: a recusa, se houver, não é de vigência.
      for (const r of respostas.filter((x) => abertas.has(x.rota))) {
        expect(CODIGOS_DE_VIGENCIA.includes(r.erro ?? ""), `${r.rota}: ${r.status} ${r.erro}`).toBe(
          false,
        );
      }
    } finally {
      await restaurarHelena();
    }
  }, 180_000);
});

describe("A recusa é a mesma onde tem de ser a mesma, e não depende do recurso", () => {
  it("sessão encerrada e senha provisória vencida dão o MESMO corpo, na leitura e na escrita", async () => {
    const tokenA = await entrar();
    await mem.bruto.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra' WHERE usuario_id = $1",
      [HELENA],
    );
    const encerrada = {
      ler: await app.inject({
        method: "GET",
        url: "/ocorrencias?status=ativas",
        headers: com(tokenA),
      }),
      escrever: await app.inject({
        method: "POST",
        url: `/ocorrencias/${OC_ALFA_1}/coordenada`,
        headers: com(tokenA),
        payload: {},
      }),
    };

    const tokenB = await entrar();
    await mem.bruto.query(
      "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 hour' WHERE id = $1",
      [HELENA],
    );
    try {
      const vencida = {
        ler: await app.inject({
          method: "GET",
          url: "/ocorrencias?status=ativas",
          headers: com(tokenB),
        }),
        escrever: await app.inject({
          method: "POST",
          url: `/ocorrencias/${OC_ALFA_1}/coordenada`,
          headers: com(tokenB),
          payload: {},
        }),
      };
      for (const par of [encerrada, vencida]) {
        expect(par.ler.statusCode).toBe(401);
        expect(par.escrever.statusCode).toBe(401);
        // Leitura e escrita recusam igual: o cliente não aprende nada pelo método.
        expect(par.ler.json()).toEqual(par.escrever.json());
      }
      expect(encerrada.ler.json()).toEqual(vencida.ler.json());
    } finally {
      await restaurarHelena();
    }
  });

  it("sem vigência, o recurso existente e o inexistente respondem IGUAL: a recusa não revela o que há", async () => {
    // Conta de OUTRO município (B), desativada, pedindo uma ocorrência do A e uma que nem existe.
    const org = await mem.bruto.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo E03','Vale Fundo E03','MG') RETURNING id",
    );
    const hash = hashDaSenha;
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,'Aurelio Machado','VF-3','aurelio.e03@valefundo.exemplo.gov.br','coordenador',$2)`,
      [org.rows[0]!.id, hash],
    );
    const token = await entrar("aurelio.e03@valefundo.exemplo.gov.br");

    // Em dia: o recurso do A é 404 para o B, e o inexistente também (404 nunca 403).
    const deA = await app.inject({
      method: "GET",
      url: `/ocorrencias/${OC_ALFA_1}`,
      headers: com(token),
    });
    const inexistente = await app.inject({
      method: "GET",
      url: `/ocorrencias/${UUID_QUALQUER}`,
      headers: com(token),
    });
    expect(deA.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(deA.json()).toEqual(inexistente.json());

    // Desativada: as duas viram a MESMA recusa de vigência, antes de qualquer recurso.
    await mem.bruto.query(
      "UPDATE usuarios SET ativo = false WHERE email = 'aurelio.e03@valefundo.exemplo.gov.br'",
    );
    const deAInativa = await app.inject({
      method: "GET",
      url: `/ocorrencias/${OC_ALFA_1}`,
      headers: com(token),
    });
    const inexistenteInativa = await app.inject({
      method: "GET",
      url: `/ocorrencias/${UUID_QUALQUER}`,
      headers: com(token),
    });
    expect(deAInativa.statusCode).toBe(403);
    expect(deAInativa.json().erro).toBe("conta_desativada");
    expect(deAInativa.json()).toEqual(inexistenteInativa.json());
  });

  it("depois da renovação o token antigo ainda LÊ pelos quinze minutos: rotação não é expulsão", async () => {
    const entrada = await app.inject({
      method: "POST",
      url: "/auth/entrar",
      payload: { email: EMAIL_HELENA, senha: SENHA },
    });
    const { acesso, renovacao } = entrada.json() as { acesso: string; renovacao: string };
    const nova = await app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
    expect(nova.statusCode, nova.body).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/ocorrencias?status=ativas", headers: com(acesso) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/ocorrencias?status=ativas",
          headers: com(nova.json().acesso),
        })
      ).statusCode,
    ).toBe(200);
  });

  it("papel rebaixado: o token antigo recusa, e a renovação devolve o papel novo, que lê como o papel novo", async () => {
    const entrada = await app.inject({
      method: "POST",
      url: "/auth/entrar",
      payload: { email: EMAIL_HELENA, senha: SENHA },
    });
    const { acesso, renovacao } = entrada.json() as { acesso: string; renovacao: string };
    await mem.bruto.query("UPDATE usuarios SET papel = 'operador' WHERE id = $1", [HELENA]);
    try {
      const velho = await app.inject({
        method: "GET",
        url: "/ocorrencias?status=ativas",
        headers: com(acesso),
      });
      expect(velho.statusCode, velho.body).toBe(401);
      expect(velho.json().erro).toBe("nao_autenticado");
      const nova = await app.inject({
        method: "POST",
        url: "/auth/renovar",
        payload: { renovacao },
      });
      expect(nova.statusCode, nova.body).toBe(200);
      expect(nova.json().usuario.papel).toBe("operador");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/ocorrencias?status=ativas",
            headers: com(nova.json().acesso),
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await restaurarHelena();
    }
  });
});

describe("Uma consulta por requisição, sem cache", () => {
  /**
   * Um Banco falso que só conta. `criarAutenticacaoDaRequisicao` recebe o Banco
   * e a config: o que sai dela é a prova de quantas idas ao banco a conferência
   * faz, e de que a leitura (GET) faz a MESMA ida que a escrita.
   */
  function bancoQueConta(): { banco: Banco; idas: () => { comTenant: number; consultas: number } } {
    let comTenant = 0;
    let consultas = 0;
    const consulta = {
      query: async () => {
        consultas += 1;
        return {
          rows: [
            {
              suspenso: false,
              ativo: true,
              papel: "coordenador",
              senha_provisoria_ate: null,
              sessao_viva: true,
            },
          ],
        };
      },
    };
    const banco = {
      comTenant: async (_org: string, fn: (c: unknown) => Promise<unknown>) => {
        comTenant += 1;
        return fn(consulta);
      },
    } as unknown as Banco;
    return { banco, idas: () => ({ comTenant, consultas }) };
  }

  async function pedir(metodo: string, config: Record<string, unknown> = {}, vezes = 1) {
    const cfg = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: SEGREDO,
    } as NodeJS.ProcessEnv);
    const { banco, idas } = bancoQueConta();
    const autenticar = criarAutenticacaoDaRequisicao(banco, cfg);
    const token = await emitirAcesso(
      cfg.jwtSegredos[0],
      {
        sub: HELENA,
        org: organizacaoDeHelena,
        papel: "coordenador",
        nome: "Helena",
        sid: UUID_QUALQUER,
      },
      15,
    );
    const req = {
      method: metodo,
      headers: { authorization: `Bearer ${token}` },
      routeOptions: { config, url: "/ocorrencias" },
    } as unknown as FastifyRequest;
    for (let i = 0; i < vezes; i += 1) await autenticar(req);
    return idas();
  }

  it("GET, HEAD e POST fazem exatamente uma ida ao banco", async () => {
    for (const metodo of ["GET", "HEAD", "POST", "PATCH", "DELETE"]) {
      expect(await pedir(metodo), metodo).toEqual({ comTenant: 1, consultas: 1 });
    }
  });

  it("GET com efeito marcado também faz uma só, e duas requisições seguidas com o mesmo token fazem duas (nada fica em cache)", async () => {
    expect(await pedir("GET", { comEfeito: true })).toEqual({ comTenant: 1, consultas: 1 });
    // O mesmo autenticador, o mesmo token, duas vezes: duas idas ao banco.
    expect(await pedir("GET", {}, 2)).toEqual({ comTenant: 2, consultas: 2 });
  });
});
