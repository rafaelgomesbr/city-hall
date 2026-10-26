import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ORIGENS,
  PAPEIS,
  PAPEIS_DE_SERVIDOR,
  POSTO,
  ROTULO_PAPEL,
  acoesDoPapel,
  edicaoUsuarioSchema,
  papeisQuePodeConceder,
  podeExecutar,
  usuarioSchema,
} from "@dc360/shared";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";

/**
 * OS PAPÉIS DO PACOTE COMPARTILHADO BATEM COM OS DO BANCO, E `usuario_orgao`
 * NASCE FECHADO (V2-F03-E04, ADR 0009 decisão 5).
 *
 * O papel era escrito em cinco lugares sem nada que os prendesse (`PAPEIS` no
 * shared e quatro CHECKs no banco). A migração 053 pôs a lista do banco em três
 * domínios; este arquivo prende as duas pontas para sempre:
 *
 *  1. SHARED CONTRA BANCO: `PAPEIS` é exatamente o domínio `papel_de_conta`; os
 *     autores administrativos são esses mais `operador_da_plataforma`;
 *     `ORIGENS` é o CHECK de `trilha_eventos.origem`. Papel novo de um lado
 *     sem o outro reprova aqui.
 *  2. O PAPEL EM SI: posto 1, nenhuma ação, fora de `PAPEIS_DE_SERVIDOR`, fora
 *     do que um formulário concede, fora do cadastro.
 *  3. A API: `PATCH /usuarios/:id` recusa converter nos dois sentidos (409
 *     `papel_nao_se_converte`), `POST /usuarios` não cria a conta, e o LOGIN
 *     dela responde exatamente o que responde um email que não existe, com a
 *     senha certa também, sem chave de configuração que o abra (P-09).
 *  4. O ISOLAMENTO: conta de órgão do município A não aparece em `GET
 *     /usuarios` do B.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const RITA = "rita.lopes@serraalta.exemplo.gov.br";
const JONAS_OPERADOR = "11111111-1111-4111-8111-0000000000d2";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAdmin: string;
let tokenB: string;
let orgaoId: string;
let servidorId: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string, senha = SENHA) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function token(email: string): Promise<string> {
  const r = await entrar(email);
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** Os valores entre aspas simples de uma definição de CHECK do banco. */
function valoresDe(definicao: string): string[] {
  return [...definicao.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();
}

async function definicaoDoDominio(nome: string): Promise<string> {
  const r = await mem.bruto.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_type t JOIN pg_constraint c ON c.contypid = t.oid
      WHERE t.typtype = 'd' AND t.typname = $1`,
    [nome],
  );
  expect(r.rows, nome).toHaveLength(1);
  return r.rows[0]!.def;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-dos-papeis-batem-com-o-banco-32-bytes!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // Uma conta de órgão e uma de servidor no município A, com a senha da semente.
  const hash = (
    await mem.bruto.query<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE id = $1", [
      JONAS_OPERADOR,
    ])
  ).rows[0]!.senha_hash;
  orgaoId = (
    await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       VALUES ($1, 'Orgao Externo Um', 'OE-1', 'orgao.um@defesacivil.exemplo.gov.br', 'usuario_orgao', $2)
       RETURNING id`,
      [ORG_A, hash],
    )
  ).rows[0]!.id;
  servidorId = (
    await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       VALUES ($1, 'Servidor Comum', 'SC-1', 'servidor.comum@serraalta.exemplo.gov.br', 'operador', $2)
       RETURNING id`,
      [ORG_A, hash],
    )
  ).rows[0]!.id;

  // Um segundo município, com o seu administrador.
  const orgB = (
    await mem.bruto.query<{ id: string }>(
      "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Vale Fundo','Vale Fundo','MG') RETURNING id",
    )
  ).rows[0]!.id;
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1, 'Admin de B', 'VF-1', 'admin@valefundo.exemplo.gov.br', 'administrador', $2)`,
    [orgB, hash],
  );

  tokenAdmin = await token(RITA);
  tokenB = await token("admin@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("o pacote compartilhado e o banco falam a mesma lista", () => {
  it("PAPEIS é exatamente o domínio papel_de_conta", async () => {
    expect(valoresDe(await definicaoDoDominio("papel_de_conta"))).toEqual([...PAPEIS].sort());
  });

  it("os autores administrativos são os papéis de conta mais operador_da_plataforma", async () => {
    expect(valoresDe(await definicaoDoDominio("papel_de_autor_administrativo"))).toEqual(
      [...PAPEIS, "operador_da_plataforma"].sort(),
    );
  });

  it("ORIGENS é exatamente o CHECK de trilha_eventos.origem", async () => {
    const r = await mem.bruto.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'trilha_eventos_origem_check'`,
    );
    expect(valoresDe(r.rows[0]!.def)).toEqual([...ORIGENS].sort());
    expect(ORIGENS).toContain("portal");
  });

  it("tipo_de_ator existe no banco com os três tipos (a E06 o liga ao shared)", async () => {
    expect(valoresDe(await definicaoDoDominio("tipo_de_ator"))).toEqual([
      "servidor",
      "sistema",
      "usuario_orgao",
    ]);
  });

  it("as quatro colunas usam o domínio, e nenhuma coluna de papel ficou com CHECK solto", async () => {
    const r = await mem.bruto.query<{ tabela: string; coluna: string; dominio: string }>(
      `SELECT table_name AS tabela, column_name AS coluna, domain_name AS dominio
         FROM information_schema.columns
        WHERE table_schema = 'public' AND domain_name IS NOT NULL ORDER BY 1, 2`,
    );
    expect(r.rows).toEqual([
      { tabela: "ocorrencia_consultas", coluna: "usuario_papel", dominio: "papel_de_conta" },
      {
        tabela: "trilha_administrativa",
        coluna: "autor_papel",
        dominio: "papel_de_autor_administrativo",
      },
      { tabela: "trilha_eventos", coluna: "autor_papel", dominio: "papel_de_conta" },
      { tabela: "usuarios", coluna: "papel", dominio: "papel_de_conta" },
    ]);
    const soltos = await mem.bruto.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'c' AND conname ~ '(autor_papel|usuario_papel|usuarios_papel)_check'`,
    );
    expect(soltos.rows).toEqual([]);
  });
});

describe("o papel usuario_orgao, do lado do pacote compartilhado", () => {
  it("é papel de conta e não é papel de servidor", () => {
    expect(PAPEIS).toContain("usuario_orgao");
    expect(PAPEIS_DE_SERVIDOR).not.toContain("usuario_orgao");
    expect([...PAPEIS_DE_SERVIDOR].sort()).toEqual([
      "administrador",
      "agente_campo",
      "coordenador",
      "operador",
    ]);
    expect(ROTULO_PAPEL.usuario_orgao.length).toBeGreaterThan(0);
  });

  it("tem posto 1 e NENHUMA ação", () => {
    expect(POSTO.usuario_orgao).toBe(1);
    expect(acoesDoPapel("usuario_orgao")).toEqual([]);
  });

  it("nenhuma ação do catálogo é permitida a ele, hoje ou quando alguém acrescentar uma", () => {
    for (const acao of [
      "abrir_ocorrencia",
      "gerenciar_usuarios",
      "consultar_trilha",
      "exportar_dados",
      "gerenciar_organizacao",
      "registrar_vistoria",
    ] as const) {
      expect(podeExecutar("usuario_orgao", acao), acao).toBe(false);
    }
  });

  it("nenhum posto concede o papel por formulário: o administrador concede só os quatro de servidor", () => {
    expect([...papeisQuePodeConceder("administrador")].sort()).toEqual(
      [...PAPEIS_DE_SERVIDOR].sort(),
    );
    expect(papeisQuePodeConceder("coordenador")).not.toContain("usuario_orgao");
  });

  it("o usuário do painel e o cadastro só aceitam papel de servidor, e a edição aceita todos (para a regra responder 409)", () => {
    const base = {
      id: "11111111-1111-4111-8111-0000000000aa",
      organizacaoId: ORG_A,
      nome: "Fulano",
      matricula: "M-1",
      email: "fulano@exemplo.gov.br",
      equipeId: null,
      ativo: true,
    };
    expect(usuarioSchema.safeParse({ ...base, papel: "operador" }).success).toBe(true);
    expect(usuarioSchema.safeParse({ ...base, papel: "usuario_orgao" }).success).toBe(false);
    const edicao = { nome: "Fulano", matricula: "M-1", email: "fulano@exemplo.gov.br" };
    expect(edicaoUsuarioSchema.safeParse({ ...edicao, papel: "usuario_orgao" }).success).toBe(true);
    expect(edicaoUsuarioSchema.safeParse({ ...edicao, papel: "papel_inventado" }).success).toBe(
      false,
    );
  });
});

describe("PATCH /usuarios/:id: usuario_orgao e servidor não se convertem", () => {
  const corpo = (nome: string, matricula: string, email: string, papel: string) => ({
    nome,
    matricula,
    email,
    papel,
  });

  it("servidor para usuario_orgao: 409 papel_nao_se_converte, e a conta não muda", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: `/usuarios/${servidorId}`,
      headers: com(tokenAdmin),
      payload: corpo(
        "Servidor Comum",
        "SC-1",
        "servidor.comum@serraalta.exemplo.gov.br",
        "usuario_orgao",
      ),
    });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("papel_nao_se_converte");
    const c = await mem.bruto.query<{ papel: string }>("SELECT papel FROM usuarios WHERE id = $1", [
      servidorId,
    ]);
    expect(c.rows[0]!.papel).toBe("operador");
  });

  it.each(["coordenador", "operador", "agente_campo", "administrador"])(
    "usuario_orgao para %s: 409 papel_nao_se_converte, e a conta não muda",
    async (papel) => {
      const r = await app.inject({
        method: "PATCH",
        url: `/usuarios/${orgaoId}`,
        headers: com(tokenAdmin),
        payload: corpo("Orgao Externo Um", "OE-1", "orgao.um@defesacivil.exemplo.gov.br", papel),
      });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().erro).toBe("papel_nao_se_converte");
      const c = await mem.bruto.query<{ papel: string }>(
        "SELECT papel FROM usuarios WHERE id = $1",
        [orgaoId],
      );
      expect(c.rows[0]!.papel).toBe("usuario_orgao");
    },
  );

  it("a recusa não deixa rastro de ato administrativo (nada mudou)", async () => {
    const antes = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM trilha_administrativa WHERE acao = 'papel_alterado'",
    );
    await app.inject({
      method: "PATCH",
      url: `/usuarios/${orgaoId}`,
      headers: com(tokenAdmin),
      payload: corpo(
        "Orgao Externo Um",
        "OE-1",
        "orgao.um@defesacivil.exemplo.gov.br",
        "coordenador",
      ),
    });
    const depois = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM trilha_administrativa WHERE acao = 'papel_alterado'",
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it("papel inventado continua sendo 422 de validação, e não 409", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: `/usuarios/${servidorId}`,
      headers: com(tokenAdmin),
      payload: corpo(
        "Servidor Comum",
        "SC-1",
        "servidor.comum@serraalta.exemplo.gov.br",
        "papel_inventado",
      ),
    });
    expect(r.statusCode, r.body).toBe(422);
  });

  it("trocar entre papéis de servidor e editar a conta de órgão SEM mudar o papel continuam valendo", async () => {
    const troca = await app.inject({
      method: "PATCH",
      url: `/usuarios/${servidorId}`,
      headers: com(tokenAdmin),
      payload: corpo(
        "Servidor Comum",
        "SC-1",
        "servidor.comum@serraalta.exemplo.gov.br",
        "agente_campo",
      ),
    });
    expect(troca.statusCode, troca.body).toBe(200);
    const edicao = await app.inject({
      method: "PATCH",
      url: `/usuarios/${orgaoId}`,
      headers: com(tokenAdmin),
      payload: corpo(
        "Orgao Externo Renomeado",
        "OE-1",
        "orgao.um@defesacivil.exemplo.gov.br",
        "usuario_orgao",
      ),
    });
    expect(edicao.statusCode, edicao.body).toBe(200);
    const c = await mem.bruto.query<{ papel: string; nome: string }>(
      "SELECT papel, nome FROM usuarios WHERE id = $1",
      [orgaoId],
    );
    expect(c.rows[0]).toEqual({ papel: "usuario_orgao", nome: "Orgao Externo Renomeado" });
  });

  it("o banco repete a recusa: o gatilho barra a conversão mesmo sem passar pela API", async () => {
    await expect(
      mem.bruto.query("UPDATE usuarios SET papel = 'coordenador' WHERE id = $1", [orgaoId]),
    ).rejects.toMatchObject({ code: "23514", constraint: "papel_nao_se_converte" });
  });
});

describe("POST /usuarios não cria conta de usuario_orgao (ela nasce só por convite, E10)", () => {
  it("papel usuario_orgao no cadastro: 422, e nada é gravado", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/usuarios",
      headers: com(tokenAdmin),
      payload: {
        nome: "Tentativa Cadastro",
        matricula: "TC-1",
        email: "tentativa.cadastro@defesacivil.exemplo.gov.br",
        papel: "usuario_orgao",
        senha: "senha-bem-comprida-2026",
      },
    });
    expect(r.statusCode, r.body).toBe(422);
    const existe = await mem.bruto.query("SELECT 1 FROM usuarios WHERE matricula = 'TC-1'");
    expect(existe.rows).toHaveLength(0);
  });
});

describe("o login da conta usuario_orgao está fechado, sem chave de configuração", () => {
  it("com a senha CERTA responde 401 credenciais, igual a um email que não existe (corpo e status)", async () => {
    const orgao = await entrar("orgao.um@defesacivil.exemplo.gov.br");
    const inexistente = await entrar("ninguem.assim@nao-existe.exemplo.gov.br");
    expect(orgao.statusCode, orgao.body).toBe(401);
    expect(inexistente.statusCode, inexistente.body).toBe(401);
    expect(orgao.json().erro).toBe("credenciais");
    expect(orgao.json()).toEqual(inexistente.json());
    // Nenhum token, nem desafio de segundo fator, vaza na recusa.
    expect(orgao.body).not.toMatch(/acesso|renovacao|desafio/);
  });

  it("com a senha errada responde o mesmo, e a recusa não conta falha nem bloqueia a conta", async () => {
    for (let i = 0; i < 8; i++) {
      const r = await entrar("orgao.um@defesacivil.exemplo.gov.br", "senha-errada-qualquer-1");
      expect(r.statusCode, r.body).toBe(401);
      expect(r.json().erro).toBe("credenciais");
    }
    const c = await mem.bruto.query<{ falhas_login: number; bloqueado_ate: string | null }>(
      "SELECT falhas_login, bloqueado_ate FROM usuarios WHERE id = $1",
      [orgaoId],
    );
    expect(c.rows[0]).toEqual({ falhas_login: 0, bloqueado_ate: null });
  });

  it("nenhuma sessão nasce para a conta, e o servidor ao lado entra normalmente", async () => {
    const sessoes = await mem.bruto.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1",
      [orgaoId],
    );
    expect(sessoes.rows[0]!.n).toBe(0);
    const servidor = await entrar("servidor.comum@serraalta.exemplo.gov.br");
    expect(servidor.statusCode, servidor.body).toBe(200);
  });

  it("os servidores da semente seguem entrando (o fechamento é só do papel novo)", async () => {
    const r = await entrar(HELENA);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().usuario.papel).toBe("coordenador");
  });
});

describe("o isolamento: a conta de órgão de A não aparece para B", () => {
  it("GET /usuarios de A traz a conta de órgão; o de B não a traz", async () => {
    const deA = await app.inject({ method: "GET", url: "/usuarios", headers: com(tokenAdmin) });
    expect(deA.statusCode, deA.body).toBe(200);
    expect((deA.json().itens as Array<{ id: string }>).some((u) => u.id === orgaoId)).toBe(true);

    const deB = await app.inject({ method: "GET", url: "/usuarios", headers: com(tokenB) });
    expect(deB.statusCode, deB.body).toBe(200);
    expect((deB.json().itens as Array<{ id: string }>).some((u) => u.id === orgaoId)).toBe(false);
  });

  it("o administrador de B não alcança a conta de órgão de A: 404, nunca 403", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: `/usuarios/${orgaoId}`,
      headers: com(tokenB),
      payload: {
        nome: "Orgao Externo Renomeado",
        matricula: "OE-1",
        email: "orgao.um@defesacivil.exemplo.gov.br",
        papel: "usuario_orgao",
      },
    });
    expect(r.statusCode, r.body).toBe(404);
  });
});
