import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CODIGOS_DA_ENTRADA, CODIGOS_DE_ERRO_DE_ACESSO, LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO,
  ehCodigoDeErroDeAcesso, type CodigoDeErroDeAcesso,
} from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import {
  codigosMortos, rastrearClasses, reprovacoes, varrerFonte, varrerPasta,
  type RegrasDeConferencia, type Varredura,
} from "./varredura-de-erros.js";

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
 *     do servidor real, por requisição, com o status e a mensagem que o
 *     catálogo diz.
 *   - Nada de acesso sai fora do catálogo. Uma varredura do código-fonte pela
 *     árvore sintática do TypeScript (`varredura-de-erros.ts`) lê TODAS as
 *     formas de emitir erro, na API inteira e no console do fornecedor, e
 *     reprova resposta 401 ou 403 (ou de status que o texto não resolve) com
 *     código fora do catálogo e da lista da entrada. `sessao` (o nome antigo)
 *     não volta por nenhuma delas. Cada forma tem o seu caso de mordida, com
 *     fonte de exemplo e com o fonte real mutado em memória.
 *   - O catálogo não carrega código morto: todo código dele é emitido por
 *     algum ponto do servidor.
 *   - O que NÃO é prendido aqui (404, 409, 422, 429, 5xx, regra de negócio) é da
 *     V2-F02-E03, e o cabeçalho do catálogo diz o mesmo.
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
const EMAIL_ADMIN_A = "ivone@serraalta.exemplo.gov.br";

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
            ($5,'Aurelio Machado','VF-1',$6,'coordenador',$3),
            ($1,'Ivone Lacerda','SA-9',$7,'administrador',$3)`,
    [orgA, EMAIL_COORD_A, hash, EMAIL_AGENTE_A, orgB, EMAIL_COORD_B, EMAIL_ADMIN_A],
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

describe("As recusas de permissão por posto e a URL assinada saem do servidor real (correção 2 da E05)", () => {
  it("coordenador gerindo conta de administrador responde 403 posto_insuficiente, e não 404: é conta do próprio município", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${await usuarioDe(EMAIL_ADMIN_A)}/situacao`,
      headers: com(helena.acesso), payload: { ativo: false },
    });
    expectDoCatalogo(r, "posto_insuficiente");
    // A frase é da rota (diz de qual perfil é a conta); o catálogo guarda a padrão.
    expect(r.json().mensagem).toMatch(/administrador/i);
  });

  it("coordenador exportando dados pessoais responde 403 posto_insuficiente_para_dado_pessoal, com a frase do catálogo", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const r = await app.inject({
      method: "GET", headers: com(helena.acesso),
      url: "/relatorios/ocorrencias.csv?nivel=completo&justificativa="
        + encodeURIComponent("Resposta a ofício do Ministério Público sobre o talude."),
    });
    expectDoCatalogo(r, "posto_insuficiente_para_dado_pessoal");
    expect(r.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.posto_insuficiente_para_dado_pessoal.mensagem);
  });

  it("coordenador trocando o email de outra pessoa responde 403 email_so_por_administrador, com a frase do catálogo", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${await usuarioDe(EMAIL_AGENTE_A)}`, headers: com(helena.acesso),
      payload: {
        nome: "Diego Alves", matricula: "SA-3", email: "diego.outro@serraalta.exemplo.gov.br",
        papel: "agente_campo",
      },
    });
    expectDoCatalogo(r, "email_so_por_administrador");
    expect(r.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.email_so_por_administrador.mensagem);
  });

  it("URL assinada sem assinatura responde 403 assinatura, sem token: a assinatura é a credencial", async () => {
    const leitura = await app.inject({ method: "GET", url: "/armazenamento/objeto?chave=qualquer/coisa.jpg" });
    expectDoCatalogo(leitura, "assinatura");
    const envio = await app.inject({
      method: "PUT", url: "/armazenamento/objeto?chave=qualquer/coisa.jpg",
      headers: { "content-type": "image/jpeg" }, payload: Buffer.from("x"),
    });
    expectDoCatalogo(envio, "assinatura");
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

/**
 * Correção 1 da V2-F00-E05. O teste acima desativa por UPDATE direto e deixa
 * a sessão de pé, estado que o produto NUNCA produz: desativar pelo painel
 * (`PATCH /usuarios/:id/situacao`) revoga as sessões na mesma transação. Aí
 * `sessao_por_token` já não devolve a sessão e a renovação caía em
 * `sessao_encerrada`, de modo que a pessoa desativada que voltava depois dos
 * 15 minutos do token de acesso lia "sessão encerrada" e, ao entrar, "Email ou
 * senha inválidos", e nunca ficava sabendo que a conta foi desativada.
 *
 * Aqui a desativação é a REAL, pelo endpoint, e a renovação é a que o cliente
 * faz depois que o token de acesso vence.
 */
describe("Renovar depois de desativar PELO ENDPOINT real (correção 1 da E05)", () => {
  /** Quem administra desativa ou reativa uma conta do município A, pela rota do produto. */
  async function mudarSituacao(quem: string, alvoEmail: string, ativo: boolean) {
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${await usuarioDe(alvoEmail)}/situacao`,
      headers: com(quem), payload: { ativo },
    });
    expect(r.statusCode, r.body).toBe(200);
  }

  async function sessoesVivas(email: string): Promise<number> {
    const r = await mem.bruto.query(
      "SELECT 1 FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [await usuarioDe(email)],
    );
    return r.rows.length;
  }

  it("desativada pelo painel, a renovação do aparelho responde 403 conta_desativada, sem par novo, e repete", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, false);
    // O estado que o produto produz: as sessões já caíram antes de qualquer renovação.
    expect(await sessoesVivas(EMAIL_AGENTE_A)).toBe(0);

    const r = await renovar(diego.renovacao);
    expectDoCatalogo(r, "conta_desativada");
    expect(r.json().mensagem).toBe(CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada.mensagem);
    expect(r.json().acesso, "conta desativada não ganha token novo").toBeUndefined();
    expect(r.json().renovacao).toBeUndefined();
    expect(await sessoesVivas(EMAIL_AGENTE_A), "a revogação por desativação continua valendo").toBe(0);

    // O aparelho pode insistir: a resposta não muda (o cliente para na primeira).
    expectDoCatalogo(await renovar(diego.renovacao), "conta_desativada");
  });

  it("um token de renovação JÁ ROTACIONADO, apresentado depois da desativação, também diz conta_desativada", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    const rotacionado = await renovar(diego.renovacao);
    expect(rotacionado.statusCode, rotacionado.body).toBe(200);
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, false);
    // O aparelho que perdeu a resposta da renovação ainda tem o token antigo.
    expectDoCatalogo(await renovar(diego.renovacao), "conta_desativada");
    expectDoCatalogo(await renovar(rotacionado.json().renovacao), "conta_desativada");
  });

  it("NEGATIVO: token de renovação que o servidor não conhece continua 401 sessao_encerrada, igual ao de conta ativa encerrada", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    // Diego é desativado; um terceiro token inventado e o de uma conta ativa
    // encerrada por quem administra têm de sair IGUAIS entre si.
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, false);
    const aurelio = await entrar(EMAIL_COORD_B);
    await mem.bruto.query(
      `UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra'
        WHERE usuario_id = $1`, [await usuarioDe(EMAIL_COORD_B)],
    );

    const desconhecido = await renovar("token-que-ninguem-emitiu-0123456789abcdef0123456789abcdef");
    const deContaInexistente = await renovar("outro-token-inventado-fedcba9876543210fedcba9876543210");
    const deContaAtiva = await renovar(aurelio.renovacao);
    for (const r of [desconhecido, deContaInexistente, deContaAtiva]) expectDoCatalogo(r, "sessao_encerrada");
    expect(desconhecido.body).toBe(deContaInexistente.body);
    expect(desconhecido.body, "quem não tem credencial não distingue conta ativa de inexistente").toBe(deContaAtiva.body);
    // E o aparelho de Diego, que TEM o token, continua sabendo.
    expectDoCatalogo(await renovar(diego.renovacao), "conta_desativada");
  });

  it("NEGATIVO: sessão encerrada por quem administra, SEM desativar, continua 401 sessao_encerrada", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    const encerrar = await app.inject({
      method: "POST", url: `/usuarios/${await usuarioDe(EMAIL_AGENTE_A)}/encerrar-sessoes`,
      headers: com(helena.acesso),
    });
    expect(encerrar.statusCode, encerrar.body).toBe(200);
    expectDoCatalogo(await renovar(diego.renovacao), "sessao_encerrada");
    // A conta está ativa: entrar de novo é o caminho, e funciona.
    expect((await tentarEntrar(EMAIL_AGENTE_A, SENHA)).statusCode).toBe(200);
  });

  it("NEGATIVO: desativada e REATIVADA, a renovação antiga volta a ser sessao_encerrada: a conta está ativa, é só entrar", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, false);
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, true);
    // Dizer "conta desativada" a uma conta ativa mandaria a pessoa parar sem motivo.
    expectDoCatalogo(await renovar(diego.renovacao), "sessao_encerrada");
    expect((await tentarEntrar(EMAIL_AGENTE_A, SENHA)).statusCode).toBe(200);
  });

  it("depois do 403, entrar com a senha certa continua a recusa genérica: a tela de entrada não confirma nada a quem não tem token", async () => {
    const helena = await entrar(EMAIL_COORD_A);
    const diego = await entrar(EMAIL_AGENTE_A);
    await mudarSituacao(helena.acesso, EMAIL_AGENTE_A, false);
    expectDoCatalogo(await renovar(diego.renovacao), "conta_desativada");
    const desativada = await tentarEntrar(EMAIL_AGENTE_A, SENHA);
    const inexistente = await tentarEntrar("ninguem@serraalta.exemplo.gov.br", SENHA);
    expect(desativada.statusCode).toBe(401);
    expect(desativada.body).toBe(inexistente.body);
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


/**
 * A varredura do fonte (correção 2 da V2-F00-E05).
 *
 * A primeira versão deste portão lia o fonte por expressão regular e só via
 * `new FalhaAutenticacao("x")` e `readonly codigo = "x" as const`. O servidor
 * emitia `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`,
 * `email_so_por_administrador` e `assinatura` (todos 403) fora do catálogo, e um
 * código novo em `send({ erro })` ou em `new RegraDeNegocio(..., 403)` passava
 * com o teste verde, ao contrário do que o README e o cabeçalho do catálogo
 * diziam. Agora a leitura é pela árvore sintática (`varredura-de-erros.ts`), que
 * enxerga o código numa linha e o status em outra, e o que ela não entende ela
 * reprova em vez de deixar passar.
 */
describe("Nada de acesso sai fora do catálogo (varredura do código-fonte)", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const RAIZ_API = join(AQUI, "..", "src");
  const RAIZ_CONSOLE = join(AQUI, "..", "..", "console", "src");
  /** As classes de erro do pacote compartilhado também chegam ao tratador global. */
  const RAIZ_SHARED = join(AQUI, "..", "..", "..", "packages", "shared", "src");

  /** O status que cada código do catálogo tem de ter. `acesso_suspenso` também é 503 nas rotas da fila. */
  const CATALOGO: Record<string, number | readonly number[]> = Object.fromEntries(
    LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO.map((c) => [
      c, c === "acesso_suspenso" ? [403, 503] : CODIGOS_DE_ERRO_DE_ACESSO[c].status,
    ]),
  );
  const ENTRADA: Record<string, number> = Object.fromEntries(
    Object.entries(CODIGOS_DA_ENTRADA).map(([c, v]) => [c, v.status]),
  );

  /**
   * Os pontos que a varredura não resolve sozinha e que foram conferidos à mão.
   * Cada um diz por que é seguro, e a lista é curta de propósito: ponto novo
   * que não esteja aqui reprova.
   */
  const REGRAS_DA_API: RegrasDeConferencia = {
    catalogo: CATALOGO,
    aceitosAlemDoCatalogo: ENTRADA,
    repasses: [
      {
        arquivo: /servidor\.ts$/, chave: "erro.codigo", origem: "parametro-do-tratador",
        porque: "o tratador global repassa o `codigo` de uma classe de erro. Vale só porque TODA classe com "
          + "`codigo` (literal, atribuído no construtor, getter ou propriedade de parâmetro) é varrida e a "
          + "calculada reprova sem repasse próprio (as duas bases acima)",
      },
      {
        arquivo: /servidor\.ts$/, chave: "RegraDeNegocio.codigo",
        porque: "é a classe base: o `codigo` dela vem de cada `new RegraDeNegocio(...)` e de cada `super(...)` "
          + "de subclasse, todos varridos. Classe NOVA com `codigo` calculado não está nesta lista e reprova",
      },
      {
        arquivo: /auth[\\/]servico\.ts$/, chave: "FalhaAutenticacao.codigo",
        porque: "é a classe base: o `codigo` dela vem de cada `new FalhaAutenticacao(...)`, todos varridos, "
          + "e o tipo da propriedade fecha a lista",
      },
      {
        arquivo: /servidor\.ts$/, chave: "suspenso.codigo", origem: "new:AcessoSuspenso",
        porque: "é o `codigo` literal de `AcessoSuspenso` (`acesso_suspenso`), varrido na classe",
      },
      {
        arquivo: /push[\\/]apns\.ts$/, chave: "par:corpo", origem: "chamada:resolver",
        porque: "é o argumento de `resolver(...)` na chamada HTTP/2 do servidor ao provedor de notificação "
          + "(APNs), uma resposta que o servidor RECEBE, e não uma resposta que ele emite. Um par "
          + "`{ status, corpo }` abreviado em qualquer outro lugar de `apns.ts` reprova",
      },
      {
        arquivo: /servidor\.ts$/, chave: "corpo_invalido", statusOrigem: "doLeitorDeCorpo.statusCode",
        porque: "o status é o do Fastify para `FST_ERR_CTP_*` (400, 413 ou 415), erro de leitura do corpo, "
          + "nunca de acesso",
      },
    ],
  };

  /** O console tem contrato próprio: estes são os 401 e 403 dele, e só eles. */
  const CONTRATO_DO_CONSOLE: Record<string, number> = {
    sem_sessao: 401, so_o_dono: 403, credenciais_invalidas: 401, desafio_invalido: 401,
    codigo_invalido: 401, senha_incorreta: 401, recuperacao_invalida: 401,
  };
  const REGRAS_DO_CONSOLE: RegrasDeConferencia = {
    catalogo: {},
    aceitosAlemDoCatalogo: CONTRATO_DO_CONSOLE,
    repasses: [{
      arquivo: /console[\\/]src[\\/]servidor\.ts$/, chave: "recusa.corpo",
      porque: "o corpo vem de `traduzirRecusaDoBanco`, cujos literais (`so_o_dono` 403, `acao_recusada` 409) "
        + "a varredura lê na forma `{ status, corpo: { erro } }`",
    }],
  };

  let api: Varredura;
  let console_: Varredura;
  beforeAll(() => {
    api = varrerPasta(RAIZ_API, RAIZ_SHARED);
    console_ = varrerPasta(RAIZ_CONSOLE);
  });

  it("toda resposta 401 ou 403 da API carrega um código do catálogo ou da entrada, em qualquer forma de emitir", () => {
    expect(api.emissoes.length, "a varredura leu alguma coisa").toBeGreaterThan(100);
    expect(reprovacoes(api, REGRAS_DA_API)).toEqual([]);
  });

  it("o console do fornecedor só responde 401 e 403 com os códigos do contrato dele", () => {
    expect(console_.emissoes.length, "a varredura leu alguma coisa").toBeGreaterThan(20);
    expect(reprovacoes(console_, REGRAS_DO_CONSOLE)).toEqual([]);
    expect(codigosMortos(console_, Object.keys(CONTRATO_DO_CONSOLE))).toEqual([]);
  });

  it("o catálogo e a lista da entrada não carregam código morto: o servidor emite cada um", () => {
    expect(codigosMortos(api, [...LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO, ...Object.keys(CODIGOS_DA_ENTRADA)])).toEqual([]);
  });

  it("ninguém escreve `erro: \"sessao\"` à mão em lugar nenhum da API", () => {
    for (const e of api.emissoes) expect(e.codigo, `${e.arquivo}:${e.linha}`).not.toBe("sessao");
  });

  it("o catálogo tem os dez códigos e cada um tem ação e mensagem", () => {
    expect([...LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO].sort()).toEqual([
      "acesso_suspenso", "assinatura", "conta_desativada", "email_so_por_administrador",
      "nao_autenticado", "posto_insuficiente", "posto_insuficiente_para_dado_pessoal",
      "sem_permissao", "sessao_encerrada", "troca_de_senha_obrigatoria",
    ]);
    expect(Object.keys(CODIGOS_DA_ENTRADA).sort()).toEqual(["bloqueado", "credenciais", "senha_provisoria_vencida"]);
  });

  describe("o console: a recusa montada numa função também é varrida inteira", () => {
    const real = readFileSync(join(RAIZ_CONSOLE, "servidor.ts"), "utf8");
    const nome = join(RAIZ_CONSOLE, "servidor.ts");
    const contra = (texto: string) => reprovacoes(varrerFonte(texto, nome), REGRAS_DO_CONSOLE);

    it("o original passa", () => {
      expect(contra(real)).toEqual([]);
    });

    it.each([
      ["M9 { status: 403, corpo: variavel }",
        (t: string) => t + '\nconst corpoEmVariavel = { erro: "bloqueio_novo" };\nconst m9 = { status: 403, corpo: corpoEmVariavel };\n'],
      ["M9b { status: calculado, corpo: { erro } }",
        (t: string) => t + '\nfunction m9b(n: number) { return { status: n, corpo: { erro: "bloqueio_novo", mensagem: "x" } }; }\n'],
      ["{ status: 403, corpo: { erro: novo } }",
        (t: string) => t + '\nconst m = { status: 403, corpo: { erro: "bloqueio_novo", mensagem: "x" } };\n'],
      ["N13 { status: 403, corpo } abreviado",
        (t: string) => t + '\nconst corpo = { erro: "bloqueio_novo", mensagem: "x" };\nconst m13 = { status: 403, corpo };\n'],
      ["{ status: 403, corpo: { mensagem } } sem erro",
        (t: string) => t + '\nconst m = { status: 403, corpo: { mensagem: "x" } };\n'],
    ])("%s reprova", (_forma, aplicar) => {
      expect(contra(aplicar(real)).length).toBeGreaterThan(0);
    });
  });

  describe("a varredura morde em cada forma de emitir (fonte de exemplo)", () => {
    const FORA = (texto: string) => reprovacoes(varrerFonte(texto, "src/exemplo.ts"), REGRAS_DA_API);

    it.each([
      ["send com .code(403) e código novo", 'resposta.code(403).send({ erro: "inativo", mensagem: "x" });'],
      ["send com .status(401) e o nome antigo", 'resposta.status(401).send({ erro: "sessao", mensagem: "x" });'],
      ["send no meio de uma cadeia com header", 'resposta.header("a", "b").code(403).send({ erro: "novo", mensagem: "x" });'],
      ["send pelo corpo numa constante", 'const R = { erro: "novo", mensagem: "x" };\nfunction f(r) { return r.code(403).send(R); }'],
      ["tratador global", 'app.setErrorHandler((erro, req, resposta) => {\n  return resposta.code(403).send({ erro: "novo", mensagem: erro.message });\n});'],
      ["RegraDeNegocio com 403 em várias linhas", 'throw new RegraDeNegocio(\n  "novo",\n  "Frase.",\n  403,\n);'],
      ["RegraDeNegocio com 401 e o nome antigo", 'throw new RegraDeNegocio("sessao", "Frase.", 401);'],
      ["FalhaAutenticacao com código novo", 'throw new FalhaAutenticacao(\n  "inativo",\n  "x");'],
      ["classe de erro com codigo literal", 'class Novo extends Error {\n  readonly codigo = "novo" as const;\n}'],
      ["recusa montada em função (status e corpo)", "function f() { return { status: 403, corpo: { erro: \"novo\", mensagem: \"x\" } }; }"],
      ["código do catálogo com o status trocado", 'resposta.code(401).send({ erro: "conta_desativada", mensagem: "x" });'],
      ["código do catálogo na regra de negócio sem status (vira 409)", 'throw new RegraDeNegocio("sem_permissao", "x");'],
    ])("reprova: %s", (_forma, fonte) => {
      const falhas = FORA(fonte);
      expect(falhas.length, fonte).toBeGreaterThan(0);
    });

    it.each([
      ["401 sem o campo erro", 'resposta.code(401).send({ mensagem: "x" });'],
      ["403 sem send na mesma cadeia", "resposta.code(403);\nreturn { mensagem: \"x\" };"],
      ["403 com corpo que não é objeto nem constante", "resposta.code(403).send(montar());"],
      ["código calculado em resposta 403", "resposta.code(403).send({ erro: qualquerCoisa, mensagem: \"x\" });"],
      ["status calculado com código fora do catálogo", 'resposta.code(status).send({ erro: "novo", mensagem: "x" });'],
      ["statusCode escrito à mão", 'throw Object.assign(new Error("x"), { statusCode: 403 });'],
      ["status atribuído fora de code()", "resposta.statusCode = 401;"],
      ["erro do Fastify por httpErrors", 'throw app.httpErrors.forbidden("x");'],
      ["erro do Fastify por createError", 'const E = createError("FST_X", "x", 403);'],
      ["statusCode declarado na classe", "class E extends Error { statusCode = 403; }"],
      ["Error enviado direto num 403", 'resposta.code(403).send(new Error("x"));'],
    ])("falha para o lado seguro: %s", (_forma, fonte) => {
      expect(FORA(fonte).length, fonte).toBeGreaterThan(0);
    });


    /*
      As formas que a revisão independente da correção 2 plantou, uma a uma, e que a
      primeira varredura deixava passar com o teste verde (39 de 39).
    */
    it.each([
      ["subclasse de RegraDeNegocio com super(codigo, mensagem, 403)",
        'class Bloqueio extends RegraDeNegocio {\n  constructor() { super("novo", "x", 403); }\n}'],
      ["subclasse da subclasse",
        'class A extends RegraDeNegocio { constructor() { super("novo", "x", 403); } }\nclass B extends A {}'],
      ["subclasse de FalhaAutenticacao com código novo",
        'class Falha extends FalhaAutenticacao { constructor() { super("novo", "x"); } }'],
      ["subclasse que repassa o código do chamador (calculado, com status de acesso)",
        'class Bloqueio extends RegraDeNegocio {\n  constructor(codigo: string) { super(codigo, "x", 403); }\n}'],
      ["importação com outro nome",
        'import { RegraDeNegocio as R } from "./servidor.js";\nthrow new R("novo", "x", 403);'],
      ["importação como espaço de nomes",
        'import * as S from "./servidor.js";\nthrow new S.RegraDeNegocio("novo", "x", 403);'],
      ["reexportação com outro nome, usada depois",
        'export { RegraDeNegocio as Recusa } from "./servidor.js";\nimport { Recusa } from "./x.js";\nthrow new Recusa("novo", "x", 403);'],
      ["classe guardada em variável",
        'const R = RegraDeNegocio;\nthrow new R("novo", "x", 403);'],
      ["Reflect.construct com a classe",
        'throw Reflect.construct(RegraDeNegocio, ["novo", "x", 403]);'],
      ["codigo atribuído no construtor (literal)",
        'class B extends Error {\n  readonly codigo: string;\n  constructor() { super("x"); this.codigo = "novo"; }\n}'],
      ["codigo atribuído no construtor (calculado)",
        'class B extends Error {\n  readonly codigo: string;\n  constructor(c: string) { super("x"); this.codigo = c; }\n}'],
      ["codigo por getter", 'class B extends Error {\n  get codigo() { return "novo"; }\n}'],
      ["codigo por getter calculado", 'class B extends Error {\n  get codigo() { return this.x; }\n}'],
      ["codigo por propriedade de parâmetro com valor", 'class B extends Error {\n  constructor(readonly codigo = "novo") { super("x"); }\n}'],
      ["codigo por propriedade de parâmetro sem valor", 'class B extends Error {\n  constructor(readonly codigo: string) { super("x"); }\n}'],
      ["escrita direta na resposta do Node (raw.writeHead)",
        'resposta.raw.writeHead(403, { "content-type": "application/json" });\nresposta.raw.end(JSON.stringify({ erro: "novo" }));'],
      ["resposta tomada pelo hijack", "resposta.hijack();"],
      ["status numa constante, corpo no return",
        'const PROIBIDO = 403;\nasync function f(resposta) {\n  resposta.code(PROIBIDO);\n  return { erro: "novo", mensagem: "x" };\n}'],
      ["status 403 sozinho, corpo no return", 'async function f(resposta) {\n  resposta.status(403);\n  return { erro: "novo" };\n}'],
      // ---- segunda passada da revisão independente ----
      ["statusCode por chave computada (N02/N03)", 'throw Object.assign(new Error("m"), { code: "FST_X", ["statusCode"]: 403 });'],
      ["statusCode por colchete (N14)", 'resposta["statusCode"] = 403;\nreturn { erro: "n14" };'],
      ["statusCode por defineProperty (N20)", 'const e = new Error("m");\nObject.defineProperty(e, "statusCode", { value: 403 });\nthrow e;'],
      ["remendo de erro de negócio por Object.assign (N17)", 'throw Object.assign(new RegraDeNegocio("n17", "m"), { status: 403 });'],
      ["auxiliar com code(s) calculado e corpo em string (N06)",
        'export function negar(r, s: number) {\n  return r.code(s).header("content-type", "application/json").send(\'{"erro":"n06"}\');\n}'],
      ["spread depois de erro sobrescreve o código (N10)",
        'const extra = { erro: "n10" };\nresposta.code(403).send({ erro: "sem_permissao", mensagem: "m", ...extra });'],
      ["gancho onSend que reescreve o corpo (N12)",
        'app.addHook("onSend", async (_req, resposta, payload) =>\n  resposta.statusCode === 401 ? JSON.stringify({ erro: "n12" }) : payload);'],
      ["gancho que lança erro de negócio",
        'app.addHook("preHandler", async () => {\n  throw new RegraDeNegocio("n04", "m", 403);\n});'],
      ["RegraDeNegocio com argumentos espalhados (N15)", 'const ARGS = ["n15", "m", 403] as const;\nthrow new RegraDeNegocio(...ARGS);'],
      ["subclasse que sobrescreve o status (N16)",
        'class Conflito extends RegraDeNegocio {\n  constructor() { super("conflito_n16", "m"); }\n  override readonly status = 403;\n}'],
      ["classe de erro com status 403 literal", "class E extends Error { readonly status = 403; }"],
      // ---- terceira passada ----
      ["S1 reatribui o parâmetro do tratador global",
        'app.setErrorHandler((erro, req, resposta) => {\n  erro = { codigo: "s1_novo" } as never;\n  return resposta.code(403).send({ erro: erro.codigo });\n});'],
      ["S3 atribui o codigo depois de construir",
        'const e = new RegraDeNegocio("sem_permissao", "m", 403);\n(e as { codigo: string }).codigo = "s3_novo";\nthrow e;'],
      ["atribuição ao codigo num método da classe, fora do construtor",
        'class E extends Error { readonly codigo = "sem_permissao"; trocar() { this.codigo = "outro"; } }'],
      ["Reflect.set do codigo (B1)",
        'const e = new RegraDeNegocio("nao_autenticado", "m", 401);\nReflect.set(e, "codigo", "token_ausente");\nthrow e;'],
      ["Reflect.defineProperty", 'Reflect.defineProperty(e, "codigo", { value: "x" });'],
      ["par { status, corpo } abreviado fora da chamada conferida do APNs",
        'function f() { const corpo = { erro: "novo" }; const status = 403; return { status, corpo }; }'],
    ])("reprova: %s", (_forma, fonte) => {
      expect(FORA(fonte).length, fonte).toBeGreaterThan(0);
    });

    it("subclasse e apelido com código do catálogo passam; o mesmo código num status de acesso diferente do catálogo não", () => {
      const bom = [
        'class Posto extends RegraDeNegocio { constructor() { super("posto_insuficiente", "x", 403); } }',
        'import { RegraDeNegocio as R } from "./servidor.js";\nthrow new R("posto_insuficiente", "x", 403);',
        'import * as S from "./servidor.js";\nthrow new S.RegraDeNegocio("nao_encontrada", "x", 404);',
        'class C extends Error { readonly codigo = "conta_desativada" as const; }',
        'class D extends Error { get codigo() { return "sem_permissao"; } }',
        'if (e instanceof RegraDeNegocio) { const t: RegraDeNegocio = e; }',
        'resposta.code(erro.status).send({ erro: "sem_permissao", mensagem: "x", ...(erro.campos ? { campos: erro.campos } : {}) });',
        'app.addHook("onSend", async (_req, resposta) => { resposta.header("cache-control", "no-store"); });',
      ].join("\n");
      expect(FORA(bom)).toEqual([]);
      expect(FORA('class P extends RegraDeNegocio { constructor() { super("posto_insuficiente", "x", 401); } }').length).toBeGreaterThan(0);
    });

    it("a classe rastreada em OUTRO arquivo também vale: a pasta inteira é varrida de uma vez", () => {
      const base = { fonte: 'export class RegraDeNegocio extends Error {}', nome: "src/servidor.ts" };
      const sub = { fonte: 'import { RegraDeNegocio } from "./servidor.js";\nexport class Nova extends RegraDeNegocio { constructor() { super("novo", "x", 403); } }', nome: "src/nova.ts" };
      const uso = { fonte: 'import { Nova as N } from "./nova.js";\nclass Filha extends N { constructor() { super("outra", "x", 403); } }', nome: "src/uso.ts" };
      const rastreadas = rastrearClasses([base, sub, uso]);
      expect(rastreadas.get("Filha")).toMatchObject({ familia: "RegraDeNegocio", base: false });
      const v: Varredura = { emissoes: [], problemas: [] };
      for (const f of [base, sub, uso]) {
        const r = varrerFonte(f.fonte, f.nome, rastreadas);
        v.emissoes.push(...r.emissoes);
        v.problemas.push(...r.problemas);
      }
      expect(v.emissoes.map((e) => e.codigo).sort()).toEqual(["novo", "outra"]);
    });

    it("não reprova o que é do catálogo, da entrada ou de outro status (controles negativos da mordida)", () => {
      const limpo = [
        'resposta.code(403).send({ erro: "sem_permissao", mensagem: "x" });',
        'resposta.code(401).send({ erro: "nao_autenticado", mensagem: "x" });',
        'throw new RegraDeNegocio("posto_insuficiente", "x", 403);',
        'throw new FalhaAutenticacao("credenciais", "x");',
        'throw new FalhaAutenticacao("bloqueado", "x");',
        'throw new RegraDeNegocio("nao_encontrada", "x", 404);',
        'throw new RegraDeNegocio("ja_encerrada", "x");',
        'resposta.code(422).send({ erro: "dados_invalidos", mensagem: "x" });',
        'resposta.code(503).send({ erro: "envio_desligado", mensagem: "x" });',
        'resposta.code(200).send({ ok: true });',
        'class Suspenso extends Error { readonly codigo = "acesso_suspenso" as const; }',
      ].join("\n");
      expect(FORA(limpo)).toEqual([]);
    });

    it("um repasse só vale para o arquivo, a expressão E a origem que foram conferidos", () => {
      const noTratador = 'app.setErrorHandler((erro, req, resposta) => {\n  return resposta.code(403).send({ erro: erro.codigo, mensagem: "x" });\n});';
      expect(reprovacoes(varrerFonte(noTratador, "src/servidor.ts"), REGRAS_DA_API)).toEqual([]);
      // outro arquivo
      expect(reprovacoes(varrerFonte(noTratador, "src/rotas/outra.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
      // fora do tratador, o `erro` é outra coisa
      expect(reprovacoes(varrerFonte('function f(erro, resposta) { return resposta.code(403).send({ erro: erro.codigo }); }', "src/servidor.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
      // `erro` sombreado dentro do tratador (N19)
      const sombra = 'app.setErrorHandler((erro, req, resposta) => {\n  if (x) { const erro = { codigo: "n19" }; return resposta.code(403).send({ erro: erro.codigo }); }\n});';
      expect(reprovacoes(varrerFonte(sombra, "src/servidor.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
      // o status do `corpo_invalido` só vale se vier do que foi conferido (N18)
      const ok = 'const status = doLeitorDeCorpo.statusCode;\nresposta.code(status).send({ erro: "corpo_invalido", mensagem: "x" });';
      expect(reprovacoes(varrerFonte(ok, "src/servidor.ts"), REGRAS_DA_API)).toEqual([]);
      // O par abreviado do APNs só vale como argumento de `resolver(...)`, em `push/apns.ts`.
      const apns = 'requisicao.on("end", () => resolver({ status, corpo }));';
      expect(reprovacoes(varrerFonte(apns, "src/push/apns.ts"), REGRAS_DA_API)).toEqual([]);
      expect(reprovacoes(varrerFonte('const r = { status, corpo };', "src/push/apns.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
      expect(reprovacoes(varrerFonte(apns, "src/rotas/outra.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
      const ruim = 'resposta.code(Number("403")).send({ erro: "corpo_invalido", mensagem: "x" });';
      expect(reprovacoes(varrerFonte(ruim, "src/servidor.ts"), REGRAS_DA_API).length).toBeGreaterThan(0);
    });
  });

  describe("a varredura morde no fonte REAL, mutado em memória (nada é gravado)", () => {
    const real = (relativo: string) => ({
      nome: join(RAIZ_API, relativo),
      texto: readFileSync(join(RAIZ_API, relativo), "utf8"),
    });

    /** Troca UMA ocorrência no texto real e confere que o fonte mutado reprova, e o original não. */
    function mutar(relativo: string, de: string, para: string): string[] {
      const { nome, texto } = real(relativo);
      expect(texto, `${relativo} tem de conter o trecho mutado`).toContain(de);
      expect(reprovacoes(varrerFonte(texto, nome), REGRAS_DA_API), "o original passa").toEqual([]);
      return reprovacoes(varrerFonte(texto.replace(de, para), nome), REGRAS_DA_API);
    }

    it("send({ erro }) do tratador global: `posto_insuficiente` vira `inativo`", () => {
      const falhas = mutar("servidor.ts", 'send({ erro: "posto_insuficiente"', 'send({ erro: "inativo"');
      expect(falhas.join("\n")).toContain("inativo");
    });

    it("RegraDeNegocio com 403: `email_so_por_administrador` vira o nome antigo `sessao`", () => {
      const falhas = mutar(
        join("rotas", "administracao.ts"), '"email_so_por_administrador"', '"sessao"',
      );
      expect(falhas.join("\n")).toContain("sessao");
    });

    it("RegraDeNegocio com 403 em outra rota: `posto_insuficiente_para_dado_pessoal` vira `inativo`", () => {
      const falhas = mutar(
        join("rotas", "prestacao-de-contas.ts"), '"posto_insuficiente_para_dado_pessoal"', '"inativo"',
      );
      expect(falhas.join("\n")).toContain("inativo");
    });

    it("send({ erro }) de rota: `assinatura` vira `url_vencida`", () => {
      const falhas = mutar(join("rotas", "armazenamento-local.ts"), 'erro: "assinatura"', 'erro: "url_vencida"');
      expect(falhas.join("\n")).toContain("url_vencida");
    });

    it("FalhaAutenticacao: `nao_autenticado` vira `token_vencido`", () => {
      const falhas = mutar(join("auth", "vigencia.ts"), 'new FalhaAutenticacao("nao_autenticado"', 'new FalhaAutenticacao("token_vencido"');
      expect(falhas.join("\n")).toContain("token_vencido");
    });

    it("classe de erro: `acesso_suspenso` vira `contrato_suspenso`", () => {
      const falhas = mutar(
        join("auth", "suspensao.ts"), 'readonly codigo = "acesso_suspenso"', 'readonly codigo = "contrato_suspenso"',
      );
      expect(falhas.join("\n")).toContain("contrato_suspenso");
    });

    it("o tratador global: `sem_permissao` com o status trocado para 401", () => {
      const falhas = mutar("servidor.ts", 'resposta.code(403).send({ erro: "sem_permissao"', 'resposta.code(401).send({ erro: "sem_permissao"');
      expect(falhas.join("\n")).toContain("sem_permissao");
    });

    /*
      As mutações da revisão independente, aplicadas ao texto REAL (em memória) do tratador global, e cada
      uma tem de reprovar. A classe plantada fica no fim do próprio `servidor.ts`, o que é o caso mais fácil
      de uma varredura por arquivo; a pasta inteira é varrida no teste de cima.
    */
    const mutarTrecho = (relativo: string, aplicar: (texto: string) => string) => {
      const { nome, texto } = real(relativo);
      const novo = aplicar(texto);
      expect(novo, "a mutação mudou o texto").not.toBe(texto);
      expect(reprovacoes(varrerFonte(texto, nome), REGRAS_DA_API), "o original passa").toEqual([]);
      return reprovacoes(varrerFonte(novo, nome), REGRAS_DA_API);
    };
    const comRamoNoTratador = (classe: string) => (t: string) =>
      t.replace("    if (erro instanceof SemPermissao) {", `    if (erro instanceof BloqueioNovo) {\n      return resposta.code(403).send({ erro: erro.codigo, mensagem: erro.message });\n    }\n    if (erro instanceof SemPermissao) {`)
        + `\n${classe}\n`;

    it.each([
      ["M1b subclasse de RegraDeNegocio com super(\"x\", .., 403)",
        (t: string) => t + '\nclass BloqueioNovo extends RegraDeNegocio {\n  constructor() { super("bloqueio_novo", "x", 403); }\n}\n'],
      ["M3 importação com outro nome",
        (t: string) => 'import { RegraDeNegocio as RecusaM3 } from "./servidor.js";\n' + t + '\nfunction m3() { throw new RecusaM3("bloqueio_novo", "x", 403); }\n'],
      ["M6 importação como espaço de nomes",
        (t: string) => 'import * as S from "./servidor.js";\n' + t + '\nfunction m6() { throw new S.RegraDeNegocio("bloqueio_novo", "x", 403); }\n'],
      ["M2c classe com codigo atribuído no construtor, enviada pelo tratador como erro.codigo",
        comRamoNoTratador('class BloqueioNovo extends Error {\n  readonly codigo: string;\n  constructor() { super("x"); this.codigo = "bloqueio_novo"; }\n}')],
      ["M2c' o mesmo, com o código vindo do chamador",
        comRamoNoTratador('class BloqueioNovo extends Error {\n  readonly codigo: string;\n  constructor(c: string) { super("x"); this.codigo = c; }\n}')],
      ["M7 classe com getter codigo",
        comRamoNoTratador('class BloqueioNovo extends Error {\n  get codigo() { return "bloqueio_novo"; }\n}')],
      ["M8 classe com codigo como propriedade de parâmetro",
        comRamoNoTratador('class BloqueioNovo extends Error {\n  constructor(readonly codigo = "bloqueio_novo") { super("x"); }\n}')],
      ["N18 corpo_invalido com status que não é o do Fastify",
        (t: string) => t.replace("    if (erro instanceof SemPermissao) {", '    if ((erro as { n18?: number }).n18 === 1) {\n      return resposta.code(Number("403")).send({ erro: "corpo_invalido", mensagem: "m" });\n    }\n    if (erro instanceof SemPermissao) {')],
      ["N19 erro.codigo com `erro` sombreado no tratador",
        (t: string) => t.replace("    if (erro instanceof SemPermissao) {", '    if ((erro as { n19?: number }).n19 === 1) {\n      const erro = { codigo: "n19" };\n      return resposta.code(403).send({ erro: erro.codigo, mensagem: "m" });\n    }\n    if (erro instanceof SemPermissao) {')],
      ["M4 escrita direta com raw.writeHead(403)",
        (t: string) => t.replace("    if (erro instanceof SemPermissao) {", '    if (erro instanceof SemPermissao) {\n      resposta.raw.writeHead(403);\n      resposta.raw.end(JSON.stringify({ erro: "bloqueio_novo" }));')],
      ["M11 resposta.code(CONSTANTE_403) e o corpo no return",
        (t: string) => t.replace("    if (erro instanceof SemPermissao) {", '    if (erro instanceof SemPermissao) {\n      resposta.code(PROIBIDO_M11);\n      return { erro: "bloqueio_novo", mensagem: "x" };')
          + "\nconst PROIBIDO_M11 = 403;\n"],
    ])("%s", (_nome, aplicar) => {
      const falhas = mutarTrecho("servidor.ts", aplicar);
      expect(falhas.length, "a varredura deixou passar").toBeGreaterThan(0);
    });

    it("catálogo sem `posto_insuficiente`: o servidor emite um código que a lista não tem", () => {
      const semEle = { ...CATALOGO };
      delete semEle["posto_insuficiente"];
      expect(reprovacoes(api, { ...REGRAS_DA_API, catalogo: semEle }).join("\n")).toContain("posto_insuficiente");
    });

    it("catálogo com código que ninguém emite: aponta como morto", () => {
      expect(codigosMortos(api, [...LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO, "codigo_inventado"])).toEqual(["codigo_inventado"]);
    });
  });
});
