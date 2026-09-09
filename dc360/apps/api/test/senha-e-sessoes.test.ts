import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * Redefinicao de senha por quem administra, e encerramento de sessoes.
 *
 * O QUE ESTES TESTES EXISTEM PARA IMPEDIR nao e "a rota devolve 200". E o
 * conjunto de atalhos que uma rota de redefinicao de senha vira quando alguem
 * a escreve com pressa, cada um deles um caminho de tomada de conta:
 *
 *   - redefinir a senha de alguem de outro municipio (e descobrir, pela
 *     diferenca entre 403 e 404, que aquela conta existe);
 *   - um coordenador redefinir a senha do administrador e entrar como ele;
 *   - redefinir a senha e deixar as sessoes antigas vivas, que devolve a conta
 *     ao invasor exatamente no caso em que a redefinicao foi pedida por causa
 *     dele;
 *   - redefinir a PROPRIA senha sem provar a senha atual, que transforma uma
 *     sessao esquecida aberta na recepcao em conta sequestrada;
 *   - fazer qualquer uma dessas coisas sem deixar rastro.
 *
 * A conferencia do efeito e feita fora da camada testada, direto no banco como
 * dono das tabelas, que e o padrao desta suite.
 */

const SENHA_A = "serra-alta-senha-forte";
const SENHA_B = "vale-fundo-senha-forte";

/** O formato ditavel por telefone, sem `l`, `o`, `0` nem `1`. */
const FORMATO_TEMPORARIA = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;

let mem: BancoEmMemoria;
let app: FastifyInstance;

const id: Record<string, string> = {};
const tokens: Record<string, { acesso: string; renovacao: string }> = {};

async function semear(): Promise<void> {
  const db = mem.bruto;

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  const orgA = a.rows[0]!.id;
  const orgB = b.rows[0]!.id;

  const hashA = await derivarSenha(SENHA_A);
  const hashB = await derivarSenha(SENHA_B);

  const pessoas: Array<[string, string, string, string, string, string, string]> = [
    ["helena", orgA, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador", hashA],
    ["jonas", orgA, "Jonas Ferreira", "SA-2", "jonas@serraalta.exemplo.gov.br", "operador", hashA],
    ["diego", orgA, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo", hashA],
    ["rita", orgA, "Rita Lopes", "SA-4", "rita@serraalta.exemplo.gov.br", "administrador", hashA],
    ["carmem", orgA, "Carmem Boaventura", "SA-5", "carmem@serraalta.exemplo.gov.br", "coordenador", hashA],
    ["aurelio", orgB, "Aurelio Machado", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador", hashB],
    ["simone", orgB, "Simone Paz", "VF-2", "simone@valefundo.exemplo.gov.br", "operador", hashB],
  ];

  for (const [apelido, org, nome, matricula, email, papel, hash] of pessoas) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [org, nome, matricula, email, papel, hash],
    );
    id[apelido] = r.rows[0]!.id;
  }
}

async function tentarEntrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function entrar(email: string, senha: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await tentarEntrar(email, senha);
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

function comToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Se o token de renovacao ainda abre porta. E o que prova que a sessao caiu. */
async function sessaoViva(renovacao: string): Promise<boolean> {
  const r = await app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
  return r.statusCode === 200;
}

function redefinir(alvo: string, token: string) {
  return app.inject({
    method: "POST", url: `/usuarios/${alvo}/redefinir-senha`, headers: comToken(token),
  });
}

function encerrarSessoesDe(alvo: string, token: string) {
  return app.inject({
    method: "POST", url: `/usuarios/${alvo}/encerrar-sessoes`, headers: comToken(token),
  });
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-senha-e-sessoes-com-mais-de-32-bytes",
    // A suite faz dezenas de logins legitimos: o limite por endereco e
    // exercitado em outro arquivo, com o valor real.
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await semear();

  tokens["helena"] = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
  tokens["jonas"] = await entrar("jonas@serraalta.exemplo.gov.br", SENHA_A);
  tokens["rita"] = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);
  // Aurelio NAO entra aqui de proposito: o teste de "encerrar as minhas
  // sessoes" conta quantas caem, e uma sessao aberta na preparacao mudaria a
  // conta sem que o caso dissesse nada sobre isso.
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Quem administra redefine a senha de outra pessoa", () => {
  it("troca a senha: a antiga morre e a temporaria entra", async () => {
    const r = await redefinir(id["diego"]!, tokens["helena"]!.acesso);
    expect(r.statusCode).toBe(200);

    const temporaria = r.json().senhaTemporaria as string;
    expect(temporaria).toMatch(FORMATO_TEMPORARIA);
    // O hash nunca sai, nem para quem administra o municipio.
    expect(r.body).not.toContain("scrypt$");
    // A resposta carrega um segredo: nao pode encostar em cache nenhum.
    expect(r.headers["cache-control"]).toBe("no-store");

    expect((await tentarEntrar("diego@serraalta.exemplo.gov.br", SENHA_A)).statusCode).toBe(401);
    expect((await tentarEntrar("diego@serraalta.exemplo.gov.br", temporaria)).statusCode).toBe(200);
  }, 300_000);

  it("derruba TODAS as sessoes do alvo", async () => {
    const email = "carmem@serraalta.exemplo.gov.br";
    const noCelular = await entrar(email, SENHA_A);
    const noComputador = await entrar(email, SENHA_A);

    const r = await redefinir(id["carmem"]!, tokens["rita"]!.acesso);
    expect(r.statusCode).toBe(200);

    /*
      Este e o caso que da sentido a rota inteira: a senha esta sendo
      redefinida justamente porque alguem invadiu a conta. Trocar a senha e
      deixar o token de renovacao do invasor vivo devolve a conta para ele.

      A pergunta e feita ao banco pelos tokens, e nao ao numero que a rota
      devolve, de proposito: uma rota que respondesse "2 sessoes encerradas"
      sem encerrar nada passaria pela contagem e reprovaria aqui, que e a
      ordem certa de descobrir isso.
    */
    expect(await sessaoViva(noCelular.renovacao), "celular").toBe(false);
    expect(await sessaoViva(noComputador.renovacao), "computador").toBe(false);
    expect(r.json().sessoesEncerradas).toBe(2);
  }, 300_000);

  it("conta de outro municipio responde 404, nunca 403, e nada la muda", async () => {
    const antes = await entrar("simone@valefundo.exemplo.gov.br", SENHA_B);

    const r = await redefinir(id["simone"]!, tokens["helena"]!.acesso);
    /*
      404 e nao 403: 403 diria "existe essa conta, voce e que nao alcanca", e
      isso transforma a rota num verificador de quais ids existem no produto
      inteiro. O municipio do token e o unico universo que existe.
    */
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain("senhaTemporaria");

    expect((await tentarEntrar("simone@valefundo.exemplo.gov.br", SENHA_B)).statusCode).toBe(200);
    expect(await sessaoViva(antes.renovacao), "a sessao de la sobreviveu").toBe(true);
  }, 300_000);

  it("nao redefine a propria senha por esta rota", async () => {
    const r = await redefinir(id["helena"]!, tokens["helena"]!.acesso);
    /*
      Sem esta recusa a rota vira escalada: uma sessao esquecida aberta na
      recepcao redefine a senha de quem administra sem provar a senha atual.
      Para a propria senha existe /auth/trocar-senha, que exige a atual.
    */
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toBe("autoredefinicao");
    expect((await tentarEntrar("helena@serraalta.exemplo.gov.br", SENHA_A)).statusCode).toBe(200);
  }, 300_000);

  it("coordenador nao redefine a senha do administrador", async () => {
    const r = await redefinir(id["rita"]!, tokens["helena"]!.acesso);
    // Posto: sem isto, todo coordenador vira administrador em dois passos,
    // redefinindo a senha do teto do municipio e entrando como ele.
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
    expect((await tentarEntrar("rita@serraalta.exemplo.gov.br", SENHA_A)).statusCode).toBe(200);
  }, 300_000);

  it("quem nao gerencia usuarios nao chega ao banco", async () => {
    const r = await redefinir(id["diego"]!, tokens["jonas"]!.acesso);
    // A permissao e conferida ANTES de qualquer escrita: o operador leva 403 e
    // a senha do alvo continua sendo a que era.
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
  }, 300_000);

  it("exige token", async () => {
    const r = await app.inject({
      method: "POST", url: `/usuarios/${id["diego"]}/redefinir-senha`,
    });
    expect(r.statusCode).toBe(401);
  }, 60_000);

  it("deixa o ato na trilha, e a trilha nao carrega a senha", async () => {
    const r = await redefinir(id["jonas"]!, tokens["rita"]!.acesso);
    expect(r.statusCode).toBe(200);
    const temporaria = r.json().senhaTemporaria as string;

    const trilha = await mem.bruto.query<{
      acao: string; autor_nome: string; alvo_nome: string; depois: unknown;
    }>(
      `SELECT acao, autor_nome, alvo_nome, depois
         FROM trilha_administrativa
        WHERE alvo_id = $1 AND acao = 'senha_redefinida'
        ORDER BY registrado_em DESC`,
      [id["jonas"]],
    );

    // Quem fez e em quem, que e a pergunta de uma investigacao real.
    expect(trilha.rows).toHaveLength(1);
    expect(trilha.rows[0]!.autor_nome).toBe("Rita Lopes");
    expect(trilha.rows[0]!.alvo_nome).toBe("Jonas Ferreira");

    // E nunca, em hipotese nenhuma, a senha ou o hash.
    const tudo = JSON.stringify(trilha.rows);
    expect(tudo).not.toContain(temporaria);
    expect(tudo).not.toContain("scrypt$");
  }, 300_000);

  it("a senha temporaria e sorteada de novo a cada vez", async () => {
    const primeira = (await redefinir(id["diego"]!, tokens["rita"]!.acesso)).json().senhaTemporaria;
    const segunda = (await redefinir(id["diego"]!, tokens["rita"]!.acesso)).json().senhaTemporaria;
    // Senha fixa de reset ("Mudar@2026") e a credencial que todo mundo do
    // setor conhece de cor no segundo mes.
    expect(segunda).not.toBe(primeira);
    for (const senha of [primeira as string, segunda as string]) {
      expect(senha).toMatch(FORMATO_TEMPORARIA);
      // Ditada por telefone: `l`, `o`, `0` e `1` sao erro de digitacao certo.
      expect(senha).not.toMatch(/[lo01]/);
    }
  }, 300_000);
});

describe("Encerrar todas as minhas sessoes", () => {
  it("encerra as outras e preserva a de onde a pessoa clicou", async () => {
    const email = "aurelio@valefundo.exemplo.gov.br";
    const noCelular = await entrar(email, SENHA_B);
    const noTablet = await entrar(email, SENHA_B);
    const daqui = await entrar(email, SENHA_B);

    const r = await app.inject({
      method: "POST", url: "/auth/encerrar-sessoes", headers: comToken(daqui.acesso),
    });
    expect(r.statusCode).toBe(200);

    /*
      A ORDEM DAS TRES LINHAS ABAIXO NAO E ESTILO, E CONDICAO DO TESTE, e o
      motivo e uma limitacao real do produto que vale registrar aqui.

      Perguntar "a sessao caiu?" e apresentar o token de renovacao dela. Um
      token de renovacao revogado que reaparece e, para `auth/servico.ts`, o
      sintoma classico de token roubado, e a resposta correta para roubo e
      derrubar a familia inteira de sessoes daquele usuario, inclusive a que
      esta rota acabou de preservar. Conferir a preservada DEPOIS das outras
      mediria a defesa contra reuso, e nao esta rota.

      A consequencia fora do teste e a mesma, e esta anotada como pendencia:
      enquanto um aparelho antigo continuar tentando renovar sozinho com o
      token que caiu, a sessao preservada cai junto na primeira tentativa.
      Distinguir "revogada de proposito" de "rotacionada e reaparecida" exige
      que `dono_do_token` (migracao 002) devolva o motivo da revogacao.
    */
    expect(await sessaoViva(daqui.renovacao), "esta").toBe(true);
    expect(await sessaoViva(noCelular.renovacao), "celular").toBe(false);
    expect(await sessaoViva(noTablet.renovacao), "tablet").toBe(false);
    expect(r.json().sessoesEncerradas).toBe(2);
  }, 300_000);

  it("nao mexe na senha, e qualquer papel alcanca", async () => {
    const email = "diego@serraalta.exemplo.gov.br";
    const senha = (await redefinir(id["diego"]!, tokens["rita"]!.acesso)).json().senhaTemporaria;
    const sessao = await entrar(email, senha);

    // Agente de campo nao gerencia usuario nenhum, e ainda assim sai dos
    // proprios aparelhos: retirar o proprio acesso nao e ato administrativo.
    const r = await app.inject({
      method: "POST", url: "/auth/encerrar-sessoes", headers: comToken(sessao.acesso),
    });
    expect(r.statusCode).toBe(200);
    expect((await tentarEntrar(email, senha)).statusCode).toBe(200);
  }, 300_000);

  it("exige token", async () => {
    const r = await app.inject({ method: "POST", url: "/auth/encerrar-sessoes" });
    expect(r.statusCode).toBe(401);
  }, 60_000);
});

describe("Quem administra encerra as sessoes de outra pessoa", () => {
  it("derruba tudo do alvo, e a senha dele continua valendo", async () => {
    const email = "diego@serraalta.exemplo.gov.br";
    const senha = (await redefinir(id["diego"]!, tokens["rita"]!.acesso)).json().senhaTemporaria;
    const noCelular = await entrar(email, senha);

    const r = await encerrarSessoesDe(id["diego"]!, tokens["helena"]!.acesso);
    expect(r.statusCode).toBe(200);
    expect(r.json().sessoesEncerradas).toBe(1);

    // O celular sumiu na area de risco: expulsar nao pode obrigar a inventar
    // uma senha nova para quem volta a trabalhar em uma hora.
    expect(await sessaoViva(noCelular.renovacao)).toBe(false);
    expect((await tentarEntrar(email, senha)).statusCode).toBe(200);
  }, 300_000);

  it("conta de outro municipio responde 404, e a sessao de la sobrevive", async () => {
    const viva = await entrar("simone@valefundo.exemplo.gov.br", SENHA_B);

    const r = await encerrarSessoesDe(id["simone"]!, tokens["helena"]!.acesso);
    expect(r.statusCode).toBe(404);
    expect(await sessaoViva(viva.renovacao)).toBe(true);
  }, 300_000);

  it("nao encerra as proprias sessoes por esta rota", async () => {
    const minha = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);

    const r = await encerrarSessoesDe(id["rita"]!, minha.acesso);
    // Esta rota e sobre outra pessoa e nao preserva sessao nenhuma: aceitar o
    // proprio id aqui desconectaria quem clicou, pelo botao errado.
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toBe("autoencerramento");
    expect(await sessaoViva(minha.renovacao)).toBe(true);
  }, 300_000);

  it("coordenador nao encerra as sessoes do administrador", async () => {
    const doAdministrador = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);

    const r = await encerrarSessoesDe(id["rita"]!, tokens["helena"]!.acesso);
    // Sem posto, derrubar o administrador vira negacao de servico contra o
    // teto do municipio, feita por quem esta abaixo dele.
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
    expect(await sessaoViva(doAdministrador.renovacao)).toBe(true);
  }, 300_000);

  it("deixa o ato na trilha", async () => {
    const senha = (await redefinir(id["carmem"]!, tokens["rita"]!.acesso)).json().senhaTemporaria;
    await entrar("carmem@serraalta.exemplo.gov.br", senha);

    const r = await encerrarSessoesDe(id["carmem"]!, tokens["rita"]!.acesso);
    expect(r.statusCode).toBe(200);
    expect(r.json().sessoesEncerradas).toBe(1);

    const trilha = await mem.bruto.query<{ autor_nome: string; alvo_nome: string }>(
      `SELECT autor_nome, alvo_nome
         FROM trilha_administrativa
        WHERE alvo_id = $1 AND acao = 'sessoes_encerradas'`,
      [id["carmem"]],
    );
    expect(trilha.rows).toHaveLength(1);
    expect(trilha.rows[0]!.autor_nome).toBe("Rita Lopes");
  }, 300_000);
});
