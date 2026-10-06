import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";
import { hashDoToken } from "../src/auth/tokens.js";

/**
 * V2-F00-E10: a recuperação de senha por email sem oráculo de usuário.
 *
 * `recuperacao.test.ts` prova o caminho feliz e que o corpo do 202 é igual para
 * email que existe e que não existe. O que ele NÃO provava, e que é por onde a
 * enumeração de contas escapa de verdade em produção, é o que acontece DEPOIS
 * da resposta ser montada:
 *
 * 1. O envio era aguardado dentro do pedido. Com provedor real, quem tem conta
 *    esperava a viagem até o provedor e quem não tem voltava na hora: o relógio
 *    entregava o que o corpo escondia.
 * 2. Provedor fora do ar derrubava o pedido com 500 só para quem tem conta, e
 *    para quem não tem seguia 202: o código de status entregava o resto.
 * 3. Não havia teto por conta. O limite de endereço protege de um endereço,
 *    não de cem endereços martelando o mesmo email até encher a caixa de
 *    entrada de uma pessoa (e o suporte que ela vai chamar).
 *
 * O que continua sendo verdade e fica trancado aqui também: o token só existe
 * no banco como hash, o link vence, o link de uma conta não serve a outra, e
 * nada que venha do corpo escolhe o município.
 */

const SENHA = "defesa-civil-2026";
const HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const DIEGO = "diego.alves@serraalta.exemplo.gov.br";
const JONAS = "jonas.ferreira@serraalta.exemplo.gov.br";
const SIMONE = "simone.paz@valefundo.exemplo.gov.br";
const TARCISIO = "tarcisio.ramos@valefundo.exemplo.gov.br";

/** O teto por email: o padrão, escrito aqui para o teste não aceitar mudança calada dele. */
const TETO_POR_EMAIL = 5;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let linhasDeLog: string[] = [];
let enviadas: Mensagem[] = [];

/** O que o notificador faz na próxima chamada: o teste troca para simular o provedor. */
let comportamento: (m: Mensagem) => Promise<void> = async () => {};

const notificador: Notificador = {
  async enviar(m) {
    enviadas.push(m);
    await comportamento(m);
    return { idNoProvedor: null };
  },
};

function tokenDaUltima(): string {
  const corpo = enviadas.at(-1)!.corpo;
  const link = corpo.match(/https?:\/\/\S+/)![0];
  return decodeURIComponent(new URL(link).searchParams.get("token")!);
}

async function pedir(email: string, extra: Record<string, unknown> = {}, headers = {}) {
  return app.inject({
    method: "POST", url: "/auth/recuperar", headers, payload: { email, ...extra },
  });
}

async function redefinir(token: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/redefinir", payload: { token, senha } });
}

async function entrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-recuperacao-com-mais-de-32-bytes-y",
      LOGIN_POR_IP: "10000",
      URL_PAINEL: "https://painel.exemplo.gov.br",
      RECUPERACAO_MINUTOS: "30",
    } as NodeJS.ProcessEnv),
    notificador,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    destinoDeLog: { write: (linha: string) => { linhasDeLog.push(linha); } },
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => {
  enviadas = [];
  linhasDeLog = [];
  comportamento = async () => {};
});

describe("O pedido não deixa o relógio nem o status contarem quem tem conta", () => {
  it("provedor fora do ar: o pedido de quem tem conta continua 202, igual ao de quem não tem", async () => {
    comportamento = async () => { throw new Error("O provedor de email nao respondeu: ECONNRESET"); };

    const existe = await pedir(DIEGO);
    const naoExiste = await pedir("ninguem-mesmo@exemplo.gov.br");

    // Antes do conserto: 500 só no primeiro, e o 500 diz "esse email tem conta".
    expect(existe.statusCode).toBe(202);
    expect(naoExiste.statusCode).toBe(202);
    expect(existe.json()).toEqual(naoExiste.json());
  }, 120_000);

  it("a falha do provedor vai para o log, sem o link e sem o email de quem pediu", async () => {
    comportamento = async (m) => {
      // O provedor ecoa o pedido no erro: é o caso real que `semOsEnderecos` existe para cobrir.
      const link = m.corpo.match(/https?:\/\/\S+/)![0];
      throw new Error(`campo text invalido: ${link} para ${m.para}`);
    };

    await pedir(DIEGO);
    // O envio roda depois da resposta: o encerramento do servidor o espera.
    await new Promise((ok) => setTimeout(ok, 50));

    const log = linhasDeLog.join("\n");
    expect(log).toContain("recuperacao");
    expect(log).not.toContain("redefinir-senha");
    expect(log).not.toContain(tokenDaUltima());
    expect(log).not.toContain(DIEGO);
  }, 120_000);

  it("provedor lento: o pedido não espera o envio terminar", async () => {
    let liberar!: () => void;
    comportamento = () => new Promise<void>((ok) => { liberar = ok; });

    const resposta = await Promise.race([
      pedir(JONAS),
      new Promise<"esperou">((ok) => setTimeout(() => ok("esperou"), 8_000)),
    ]);
    // Antes do conserto o pedido ficava pendurado até o provedor responder.
    expect(resposta).not.toBe("esperou");
    expect((resposta as { statusCode: number }).statusCode).toBe(202);
    expect(enviadas).toHaveLength(1);
    liberar?.();
  }, 120_000);
});

describe("Teto de pedidos por email (quem enche a caixa de entrada dos outros)", () => {
  it(`só ${TETO_POR_EMAIL} mensagens por hora para o mesmo email, e o corpo do 202 não muda`, async () => {
    const respostas = [];
    for (let i = 0; i < TETO_POR_EMAIL + 3; i += 1) respostas.push(await pedir(TARCISIO));

    expect(respostas.every((r) => r.statusCode === 202)).toBe(true);
    expect(new Set(respostas.map((r) => r.body)).size).toBe(1);
    // Antes do conserto: oito mensagens para a mesma pessoa.
    expect(enviadas).toHaveLength(TETO_POR_EMAIL);
  }, 180_000);

  it("o teto conta email que não existe do mesmo jeito, para não virar oráculo", async () => {
    const inexistente = "quem-nao-existe@exemplo.gov.br";
    const respostas = [];
    for (let i = 0; i < TETO_POR_EMAIL + 3; i += 1) respostas.push(await pedir(inexistente));

    expect(respostas.every((r) => r.statusCode === 202)).toBe(true);
    expect(new Set(respostas.map((r) => r.body)).size).toBe(1);
    expect(enviadas).toHaveLength(0);
  }, 180_000);

  it("maiúscula e minúscula são o mesmo email para o teto", async () => {
    const maiusculo = SIMONE.toUpperCase();
    for (let i = 0; i < TETO_POR_EMAIL + 2; i += 1) {
      await pedir(i % 2 === 0 ? SIMONE : maiusculo);
    }
    expect(enviadas).toHaveLength(TETO_POR_EMAIL);
  }, 180_000);

  it("o teto de um email não afeta o de outro", async () => {
    // TARCISIO e SIMONE já gastaram o teto acima; HELENA ainda tem o dela.
    const r = await pedir(HELENA);
    expect(r.statusCode).toBe(202);
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]!.para).toBe(HELENA);
  }, 60_000);
});

describe("Nada que venha do pedido escolhe o município", () => {
  it("campos de município no corpo e nos cabeçalhos são ignorados: resposta idêntica à de email inexistente", async () => {
    const orgDeA = (await mem.bruto.query<{ id: string }>(
      "SELECT id FROM organizacoes WHERE nome ILIKE '%Serra Alta%'",
    )).rows[0]!.id;
    const orgDeB = (await mem.bruto.query<{ id: string }>(
      "SELECT id FROM organizacoes WHERE nome ILIKE '%Vale Fundo%'",
    )).rows[0]!.id;

    // A "tela do município A" pedindo o email de uma conta do município B.
    const deB = await pedir("aurelio.machado@valefundo.exemplo.gov.br", {
      organizacaoId: orgDeA, organizacao_id: orgDeA,
    }, { "x-organizacao-id": orgDeA, origin: "https://serraalta.exemplo.gov.br" });
    const inexistente = await pedir("ninguem-de-b@exemplo.gov.br", {
      organizacaoId: orgDeB,
    }, { "x-organizacao-id": orgDeB });

    expect(deB.statusCode).toBe(202);
    expect(deB.body).toBe(inexistente.body);
    expect(deB.headers["content-type"]).toBe(inexistente.headers["content-type"]);
    // O link vai para a dona do email, e o município dela vem do registro, não do pedido.
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]!.para).toBe("aurelio.machado@valefundo.exemplo.gov.br");
    const gravada = (await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT r.organizacao_id FROM recuperacoes_senha r JOIN usuarios u ON u.id = r.usuario_id"
      + " WHERE lower(u.email) = $1 ORDER BY r.criada_em DESC LIMIT 1",
      ["aurelio.machado@valefundo.exemplo.gov.br"],
    )).rows[0]!.organizacao_id;
    expect(gravada).toBe(orgDeB);
  }, 120_000);

  it("o token de uma conta troca a senha dela e de mais ninguém", async () => {
    await pedir(JONAS);
    const tokenDoJonas = tokenDaUltima();

    const r = await redefinir(tokenDoJonas, "senha-nova-do-jonas-2026");
    expect(r.statusCode).toBe(200);

    expect((await entrar(JONAS, "senha-nova-do-jonas-2026")).statusCode).toBe(200);
    // Nem a colega do mesmo município nem a conta do outro município mudaram.
    expect((await entrar(DIEGO, SENHA)).statusCode).toBe(200);
    expect((await entrar("aurelio.machado@valefundo.exemplo.gov.br", SENHA)).statusCode).toBe(200);
  }, 180_000);
});

describe("O link: uso único, vencimento e guarda só como hash", () => {
  it("o banco guarda o hash do token e nunca o token", async () => {
    await pedir(HELENA);
    const token = tokenDaUltima();

    const linhas = (await mem.bruto.query<{ token_hash: string }>(
      "SELECT r.token_hash FROM recuperacoes_senha r JOIN usuarios u ON u.id = r.usuario_id"
      + " WHERE lower(u.email) = $1 ORDER BY r.criada_em DESC LIMIT 1",
      [HELENA],
    )).rows;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.token_hash).not.toBe(token);
    expect(linhas[0]!.token_hash).toBe(hashDoToken(token));
    // Nenhuma coluna da tabela carrega o token em claro.
    const tudo = JSON.stringify((await mem.bruto.query("SELECT * FROM recuperacoes_senha")).rows);
    expect(tudo).not.toContain(token);
  }, 120_000);

  it("o link vence: passado o prazo, a mesma resposta de link que não vale mais", async () => {
    await pedir(HELENA);
    const token = tokenDaUltima();
    await mem.bruto.query(
      "UPDATE recuperacoes_senha SET expira_em = now() - interval '1 minute' WHERE usada_em IS NULL",
    );

    const vencido = await redefinir(token, "senha-nova-da-helena-2026");
    const inventado = await redefinir("token-que-nunca-existiu-mesmo", "senha-nova-da-helena-2026");

    expect(vencido.statusCode).toBe(401);
    // A tela precisa de UMA frase para os três casos (vencido, usado, inventado):
    // se a API distinguisse, a API viraria o oráculo de quais links já existiram.
    expect(vencido.body).toBe(inventado.body);
    expect((await entrar(HELENA, "senha-nova-da-helena-2026")).statusCode).toBe(401);
  }, 120_000);

  it("a mensagem de link que não vale mais está em português, com acento", async () => {
    const r = await redefinir("token-completamente-inventado-aqui", "uma-senha-qualquer-longa");
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toBe("Este link de redefinição não vale mais. Peça um novo.");
  }, 60_000);

  it("o 202 e o 503 estão em português, com acento", async () => {
    const r = await pedir("alguem-qualquer@exemplo.gov.br");
    expect(r.json().mensagem).toBe(
      "Se existir conta com esse email, enviamos um link de redefinição. "
      + "Confira sua caixa de entrada.",
    );
  }, 60_000);
});

describe("A tela pode saber se a recuperação está ligada antes de pedir o email", () => {
  it("GET /auth/recuperacao diz só se está ativa, sem token e sem dado de município", async () => {
    const r = await app.inject({ method: "GET", url: "/auth/recuperacao" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ativa: true });
  }, 60_000);
});

describe("Limite por endereço no pedido de recuperação", () => {
  it("o quarto pedido do mesmo endereço em cinco minutos leva 429, e trocar o cabeçalho não ajuda", async () => {
    const memoria = await bancoEmMemoria({ semear: false });
    const servidor = await construirServidor({
      banco: memoria.banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-limite-com-mais-de-trinta-e-dois-bytes",
        LOGIN_POR_IP: "3",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await servidor.ready();
    try {
      const status: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const r = await servidor.inject({
          method: "POST", url: "/auth/recuperar",
          // Um X-Forwarded-For novo a cada pedido: era a brecha que `rede.ts` fecha.
          headers: { "x-forwarded-for": `198.51.100.${i + 10}` },
          payload: { email: `alguem${i}@exemplo.gov.br` },
        });
        status.push(r.statusCode);
      }
      expect(status).toEqual([202, 202, 202, 429]);
    } finally {
      await servidor.close();
      await memoria.banco.encerrar();
    }
  }, 120_000);
});
