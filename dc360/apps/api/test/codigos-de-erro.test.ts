import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CODIGOS_DE_ERRO_DE_ACESSO, LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO, ehCodigoDeErroDeAcesso,
  type CodigoDeErroDeAcesso,
} from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * Os códigos de erro de acesso (V2-F00-E05): o cliente distingue "renove o
 * token", "entre de novo" e "conta desativada, pare e avise" pelo CÓDIGO.
 *
 * O PROBLEMA: com a vigência religada na escrita (E04), conta desativada,
 * papel rebaixado e sessão encerrada saíam como o mesmo `401 sessao`. O painel
 * só lia `nao_autenticado` como sessão morta, o aparelho lia qualquer 401 como
 * "entre de novo", e a fila trata 401 e 403 como falha permanente. Conta
 * desativada era indistinguível de token vencido, e entrar de novo não resolve
 * para quem foi desativado.
 *
 * O QUE ESTE ARQUIVO GUARDA:
 *
 *   - Cada código do catálogo (`packages/shared/src/codigos-de-erro.ts`) sai
 *     do servidor real, com o status que o catálogo diz.
 *   - Nada sai fora do catálogo: um leitor de fonte reprova código novo de
 *     autenticação que não esteja na lista, e `sessao` (o nome antigo) não
 *     volta.
 *   - `/auth/entrar` NÃO muda: conta desativada recebe a mesma recusa genérica
 *     da senha errada e do e-mail que não existe (resistência a enumeração).
 *   - Isolamento: conta desativada do município A que tenta escrever em
 *     ocorrência do município B recebe `conta_desativada` e NADA sobre B, e o
 *     404 de recurso de outro município continua 404, nunca 403.
 */

const SENHA = "serra-alta-senha-forte";
const SEGREDO = "segredo-dos-codigos-de-erro-com-mais-de-32-bytes";

const EMAIL_COORD_A = "helena@serraalta.exemplo.gov.br";
const EMAIL_AGENTE_A = "diego@serraalta.exemplo.gov.br";
const EMAIL_COORD_B = "aurelio@valefundo.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let orgA: string;
let orgB: string;
let ocorrenciaA: string;
let ocorrenciaB: string;

async function semear(): Promise<void> {
  const db = mem.bruto;
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  const hash = await derivarSenha(SENHA);
  await db.query(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,'Helena Coutinho','SA-1',$2,'coordenador',$3),
            ($1,'Diego Alves','SA-3',$4,'agente_campo',$3),
            ($5,'Aurelio Machado','VF-1',$6,'coordenador',$3)`,
    [orgA, EMAIL_COORD_A, hash, EMAIL_AGENTE_A, orgB, EMAIL_COORD_B],
  );

  const ocA = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','deslizamento','registrada','Rua das Acacias, 245','Marilda','telefone','Talude cedeu')
     RETURNING id`,
    [orgA],
  );
  ocorrenciaA = ocA.rows[0]!.id;
  const ocB = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','alagamento','registrada','Rua do Rio, 12','Joaquim','telefone','Agua na calcada')
     RETURNING id`,
    [orgB],
  );
  ocorrenciaB = ocB.rows[0]!.id;
}

function tentarEntrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function entrar(email: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await tentarEntrar(email, SENHA);
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

const com = (token: string) => ({ authorization: `Bearer ${token}` });

/** Uma escrita inofensiva: corrigir a coordenada de uma ocorrência. */
function escrever(token: string, ocorrenciaId: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${ocorrenciaId}/coordenada`, headers: com(token),
    payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
  });
}

function ler(token: string) {
  return app.inject({ method: "GET", url: "/ocorrencias?status=ativas", headers: com(token) });
}

function renovar(renovacao: string) {
  return app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
}

async function usuarioDe(email: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>("SELECT id FROM usuarios WHERE email = $1", [email]);
  return r.rows[0]!.id;
}

/** Desativa SEM revogar as sessões: é o estado que a vigência tem de pegar sozinha. */
async function desativar(email: string): Promise<void> {
  await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE email = $1", [email]);
}

async function reativarTodos(): Promise<void> {
  await mem.bruto.query("UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL");
  await mem.bruto.query(
    `UPDATE organizacoes SET eliminada_em = NULL, eliminacao_agendada_para = NULL,
            acesso_suspenso_em = NULL, suspensao_motivo = NULL`,
  );
}

/** Um token de acesso autêntico e já vencido (mesma assinatura, `exp` no passado). */
async function tokenVencido(org: string, usuarioId: string): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({
    org, papel: "coordenador", nome: "Helena Coutinho",
    sid: "00000000-0000-4000-8000-000000000000",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(usuarioId)
    .setIssuer("dc360-api")
    .setAudience("dc360")
    .setIssuedAt(agora - 1200)
    .setExpirationTime(agora - 300)
    .sign(new TextEncoder().encode(SEGREDO));
}

/**
 * A resposta é do catálogo: o código está na lista, e o status é o que o
 * catálogo promete para ele (`acesso_suspenso` pode ser 503 nas rotas da fila,
 * mas aqui só se testam rotas comuns, que respondem 403).
 */
function expectDoCatalogo(
  r: { statusCode: number; json: () => { erro?: unknown; mensagem?: unknown }; body: string },
  codigo: CodigoDeErroDeAcesso,
): void {
  const corpo = r.json();
  expect(corpo.erro, r.body).toBe(codigo);
  expect(ehCodigoDeErroDeAcesso(corpo.erro), `${String(corpo.erro)} não está no catálogo`).toBe(true);
  expect(r.statusCode, r.body).toBe(CODIGOS_DE_ERRO_DE_ACESSO[codigo].status);
  expect(typeof corpo.mensagem).toBe("string");
  expect((corpo.mensagem as string).length).toBeGreaterThan(0);
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: SEGREDO,
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await semear();
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(async () => {
  await reativarTodos();
});

describe("Cada código do catálogo sai do servidor real", () => {
  it("token vencido, adulterado ou ausente responde 401 nao_autenticado: o cliente renova e repete", async () => {
    const helena = await usuarioDe(EMAIL_COORD_A);
    const vencido = await ler(await tokenVencido(orgA, helena));
    expectDoCatalogo(vencido, "nao_autenticado");
    expectDoCatalogo(await ler("isto-nao-e-um-jwt"), "nao_autenticado");
    expectDoCatalogo(await app.inject({ method: "GET", url: "/ocorrencias?status=ativas" }), "nao_autenticado");
    // O vencido também é recusado na escrita, com o MESMO código (o cliente renova).
    expectDoCatalogo(await escrever(await tokenVencido(orgA, helena), ocorrenciaA), "nao_autenticado");
  });

  it("sessão encerrada por alguém responde 401 sessao_encerrada: entrar de novo, nada se perde", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    expect((await escrever(helena.acesso, ocorrenciaA)).statusCode).toBe(200);
    await mem.bruto.query(
      `UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra'
        WHERE usuario_id = $1 AND revogada_em IS NULL`,
      [await usuarioDe(EMAIL_COORD_A)],
    );
    const r = await escrever(helena.acesso, ocorrenciaA);
    expectDoCatalogo(r, "sessao_encerrada");
    expect(r.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.sessao_encerrada.mensagem);
  });

  it("papel diferente do token é nao_autenticado (renove e repita), e NÃO sessão encerrada nem conta desativada", async () => {
    // Até a V2-F00-E07 saía como sessao_encerrada. A sessão está de pé e o
    // token é legítimo: o que mudou foi o cadastro, e a renovação já devolve o
    // token com o papel novo. Registro em docs/DECISOES-DE-TESTE-DA-FASE-00.md.
    const helena = await entrar(EMAIL_COORD_A);
    await mem.bruto.query("UPDATE usuarios SET papel = 'operador' WHERE email = $1", [EMAIL_COORD_A]);
    try {
      expectDoCatalogo(await escrever(helena.acesso, ocorrenciaA), "nao_autenticado");
    } finally {
      await mem.bruto.query("UPDATE usuarios SET papel = 'coordenador' WHERE email = $1", [EMAIL_COORD_A]);
    }
  });

  it("conta desativada responde 403 conta_desativada, e não 401: entrar de novo não resolve", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    expect((await escrever(helena.acesso, ocorrenciaA)).statusCode).toBe(200);
    await desativar(EMAIL_COORD_A);
    const r = await escrever(helena.acesso, ocorrenciaA);
    expectDoCatalogo(r, "conta_desativada");
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada.mensagem);
    // O que a pessoa lê diz o que fazer, em português, sem jargão de sessão.
    expect(r.json().mensagem).toMatch(/coordena[çc][ãa]o/i);
  });

  it("conta desativada com as sessões TAMBÉM encerradas (o que o painel faz) continua conta_desativada", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    await desativar(EMAIL_COORD_A);
    await mem.bruto.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'usuario desativado' WHERE usuario_id = $1",
      [await usuarioDe(EMAIL_COORD_A)],
    );
    // Se a ordem fosse a outra, sairia sessao_encerrada e o cliente mandaria entrar de novo.
    expectDoCatalogo(await escrever(helena.acesso, ocorrenciaA), "conta_desativada");
  });

  it("leitura com token vivo segue pela assinatura até a F03-E03: a troca declarada não mudou", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    await desativar(EMAIL_COORD_A);
    expect((await ler(helena.acesso)).statusCode).toBe(200);
  });

  it("acesso_suspenso, troca_de_senha_obrigatoria e sem_permissao seguem emitidos, no catálogo e com o mesmo texto", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);

    const semPermissao = await app.inject({ method: "GET", url: "/usuarios", headers: com(diego.acesso) });
    expectDoCatalogo(semPermissao, "sem_permissao");

    await mem.bruto.query(
      "UPDATE usuarios SET senha_provisoria_ate = now() + interval '1 hour' WHERE email = $1", [EMAIL_COORD_A],
    );
    const troca = await escrever(helena.acesso, ocorrenciaA);
    expectDoCatalogo(troca, "troca_de_senha_obrigatoria");
    expect(troca.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.troca_de_senha_obrigatoria.mensagem);
    await mem.bruto.query("UPDATE usuarios SET senha_provisoria_ate = NULL");

    await mem.bruto.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato' WHERE id = $1", [orgA],
    );
    const suspenso = await escrever(helena.acesso, ocorrenciaA);
    expectDoCatalogo(suspenso, "acesso_suspenso");
    expect(suspenso.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.acesso_suspenso.mensagem);
  });
});

describe("Renovar com a conta desativada", () => {
  it("responde 403 conta_desativada, e a renovação não emite par nenhum", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    await desativar(EMAIL_COORD_A);
    const r = await renovar(helena.renovacao);
    expectDoCatalogo(r, "conta_desativada");
    expect(r.json().acesso, "conta desativada não ganha token novo").toBeUndefined();
    expect(r.json().renovacao).toBeUndefined();
    // As sessões dela caem junto (o que a renovação já fazia).
    const vivas = await mem.bruto.query(
      "SELECT 1 FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [await usuarioDe(EMAIL_COORD_A)],
    );
    expect(vivas.rows).toHaveLength(0);
  });

  it("renovação encerrada de conta ATIVA continua 401 sessao_encerrada: entra de novo", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    await mem.bruto.query(
      `UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra'
        WHERE usuario_id = $1`, [await usuarioDe(EMAIL_COORD_A)],
    );
    expectDoCatalogo(await renovar(helena.renovacao), "sessao_encerrada");
  });
});

describe("/auth/entrar não conta nada sobre a conta (resistência a enumeração)", () => {
  it("conta desativada com a senha CERTA recebe a mesma recusa da senha errada e do e-mail inexistente", async () => {
    await desativar(EMAIL_AGENTE_A);
    const desativada = await tentarEntrar(EMAIL_AGENTE_A, SENHA);
    const errada = await tentarEntrar(EMAIL_COORD_A, "senha-errada-qualquer-12345");
    const inexistente = await tentarEntrar("ninguem@serraalta.exemplo.gov.br", "qualquer-senha-12345");

    for (const r of [desativada, errada, inexistente]) {
      expect(r.statusCode, r.body).toBe(401);
      expect(r.json().erro).toBe("credenciais");
    }
    expect(desativada.json().mensagem).toBe(errada.json().mensagem);
    expect(desativada.json().mensagem).toBe(inexistente.json().mensagem);
    expect(desativada.body, "nem o código novo vaza na entrada").not.toMatch(/desativ/i);
  });
});

describe("Isolamento: a conta desativada não confirma nada sobre outro município", () => {
  it("escrever na ocorrência do município B com conta desativada do A responde a MESMA coisa que escrever na própria e numa que não existe", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    await desativar(EMAIL_COORD_A);

    const naDeB = await escrever(helena.acesso, ocorrenciaB);
    const naPropria = await escrever(helena.acesso, ocorrenciaA);
    const numaQueNaoExiste = await escrever(helena.acesso, "11111111-1111-4111-8111-00000000ffff");

    for (const r of [naDeB, naPropria, numaQueNaoExiste]) expectDoCatalogo(r, "conta_desativada");
    // O corpo é idêntico: nada a distingue do caso em que B não existe.
    expect(naDeB.body).toBe(naPropria.body);
    expect(naDeB.body).toBe(numaQueNaoExiste.body);
    expect(naDeB.body).not.toContain(ocorrenciaB);
  });

  it("conta ATIVA do município B escrevendo na ocorrência do A continua 404 (nunca 403), e lendo também", async () => {
    const aurelio = await entrar(EMAIL_COORD_B);
    const escrita = await escrever(aurelio.acesso, ocorrenciaA);
    expect(escrita.statusCode, escrita.body).toBe(404);
    expect(escrita.json().erro).not.toBe("sem_permissao");
    const leitura = await app.inject({
      method: "GET", url: `/ocorrencias/${ocorrenciaA}`, headers: com(aurelio.acesso),
    });
    expect(leitura.statusCode, leitura.body).toBe(404);
  });
});

describe("Nada sai fora do catálogo", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const SRC = join(AQUI, "..", "src");

  function fontes(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome);
      return statSync(caminho).isDirectory() ? fontes(caminho) : caminho.endsWith(".ts") ? [caminho] : [];
    });
  }

  /** Os códigos da ENTRADA, que ficam fora do catálogo de acesso por serem de outra pergunta. */
  const DA_ENTRADA = new Set(["credenciais", "bloqueado", "senha_provisoria_vencida"]);

  /**
   * Os códigos de autenticação que o texto da fonte declara: o primeiro
   * argumento de `new FalhaAutenticacao(...)` e o `codigo = "..."` das classes
   * de erro de acesso. O que não é da entrada nem do catálogo é "fora".
   */
  function codigosForaDoCatalogo(fonte: string): string[] {
    const achados = [
      ...[...fonte.matchAll(/new FalhaAutenticacao\(\s*"([a-z_]+)"/g)].map((m) => m[1]!),
      ...[...fonte.matchAll(/readonly codigo = "([a-z_]+)" as const/g)].map((m) => m[1]!),
    ];
    return achados.filter((c) => !ehCodigoDeErroDeAcesso(c) && !DA_ENTRADA.has(c));
  }

  it("os arquivos da API só declaram códigos de autenticação do catálogo ou da entrada", () => {
    const fora: string[] = [];
    for (const arquivo of fontes(SRC)) {
      for (const codigo of codigosForaDoCatalogo(readFileSync(arquivo, "utf8"))) {
        fora.push(`${arquivo}: ${codigo}`);
      }
    }
    expect(fora).toEqual([]);
  });

  it("o leitor pega código novo e o nome antigo: o teste de catálogo reprova de verdade", () => {
    expect(codigosForaDoCatalogo('throw new FalhaAutenticacao("sessao", "x");')).toEqual(["sessao"]);
    expect(codigosForaDoCatalogo('throw new FalhaAutenticacao(\n  "inativo",\n  "x");')).toEqual(["inativo"]);
    expect(codigosForaDoCatalogo('readonly codigo = "conta_bloqueada" as const;')).toEqual(["conta_bloqueada"]);
    expect(codigosForaDoCatalogo('throw new FalhaAutenticacao("sessao_encerrada", "x");')).toEqual([]);
  });

  it("ninguém escreve `erro: \"sessao\"` à mão em lugar nenhum da API", () => {
    for (const arquivo of fontes(SRC)) {
      expect(readFileSync(arquivo, "utf8"), arquivo).not.toMatch(/erro:\s*"sessao"/);
    }
  });

  it("o catálogo tem os seis códigos e cada um tem ação e mensagem", () => {
    expect([...LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO].sort()).toEqual([
      "acesso_suspenso", "conta_desativada", "nao_autenticado", "sem_permissao",
      "sessao_encerrada", "troca_de_senha_obrigatoria",
    ]);
  });
});
