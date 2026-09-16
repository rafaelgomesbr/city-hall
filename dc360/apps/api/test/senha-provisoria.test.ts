import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * Senha provisória vence em 72 horas e obriga a troca na primeira entrada.
 *
 * O DEFEITO: a senha temporária sorteada por quem administra
 * (`POST /usuarios/:id/redefinir-senha`) e a senha inicial do administrador
 * criado pelo console eram senhas comuns. Ditadas por telefone e anotadas num
 * papel, valiam para sempre, e nada obrigava a troca: o comentário da rota
 * chamava isso de pendência e nomeava a coluna que faltava.
 *
 * A REGRA (migração 046): `usuarios.senha_provisoria_ate`. Enquanto
 * preenchida e no futuro, a senha entra, mas a sessão só alcança
 * `/auth/trocar-senha` (e sair): todo o resto responde 403
 * `troca_de_senha_obrigatoria`. Trocar a senha zera a coluna, no banco, por
 * gatilho, e a rota devolve um token de acesso novo para a mesma sessão. No
 * passado, a senha provisória não entra mais: quem administra sorteia outra.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const DIEGO_EMAIL = "diego.alves@serraalta.exemplo.gov.br";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenRita: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function tentarEntrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function entrar(email: string, senha = SENHA) {
  const r = await tentarEntrar(email, senha);
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json() as { acesso: string; renovacao: string; trocaDeSenhaObrigatoria?: boolean };
}

async function redefinirDiego(): Promise<string> {
  const r = await app.inject({
    method: "POST", url: `/usuarios/${DIEGO}/redefinir-senha`, headers: com(tokenRita),
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json().senhaTemporaria as string;
}

async function prazoDe(id: string): Promise<string | null> {
  const r = await mem.bruto.query<{ senha_provisoria_ate: string | null }>(
    "SELECT senha_provisoria_ate FROM usuarios WHERE id = $1", [id],
  );
  return r.rows[0]!.senha_provisoria_ate;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-senha-provisoria-com-32-bytes!!!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  tokenRita = (await entrar("rita.lopes@serraalta.exemplo.gov.br")).acesso;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A senha temporária de quem administra", () => {
  it("grava o prazo de 72 horas, e a senha escolhida pela pessoa o zera", async () => {
    const temporaria = await redefinirDiego();
    const prazo = await prazoDe(DIEGO);
    expect(prazo).not.toBeNull();
    const horas = (new Date(prazo!).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(71);
    expect(horas).toBeLessThanOrEqual(72);

    const sessao = await entrar(DIEGO_EMAIL, temporaria);
    expect(sessao.trocaDeSenhaObrigatoria).toBe(true);

    const troca = await app.inject({
      method: "POST", url: "/auth/trocar-senha", headers: com(sessao.acesso),
      payload: { senhaAtual: temporaria, senha: SENHA },
    });
    expect(troca.statusCode, troca.body).toBe(200);
    expect(await prazoDe(DIEGO)).toBeNull();
    // A sessão continua, com um token novo que já não carrega a marca.
    expect(typeof troca.json().acesso).toBe("string");
    const depois = await app.inject({
      method: "GET", url: "/campo/meu-trabalho", headers: com(troca.json().acesso),
    });
    expect(depois.statusCode, depois.body).toBe(200);
  });

  it("enquanto provisória, a sessão só alcança a troca de senha: leitura e escrita respondem 403", async () => {
    const temporaria = await redefinirDiego();
    try {
      const sessao = await entrar(DIEGO_EMAIL, temporaria);

      const leitura = await app.inject({
        method: "GET", url: "/campo/meu-trabalho", headers: com(sessao.acesso),
      });
      expect(leitura.statusCode, leitura.body).toBe(403);
      expect(leitura.json().erro).toBe("troca_de_senha_obrigatoria");

      const escrita = await app.inject({
        method: "POST", url: "/sincronizacao/vistoria", headers: com(sessao.acesso),
        payload: { idempotencyKey: crypto.randomUUID(), ocorrenciaId: OC_ALFA_1 },
      });
      expect(escrita.statusCode, escrita.body).toBe(403);
      expect(escrita.json().erro).toBe("troca_de_senha_obrigatoria");

      // A renovação também carrega a marca: o token novo continua trancado.
      const renovado = await app.inject({
        method: "POST", url: "/auth/renovar", payload: { renovacao: sessao.renovacao },
      });
      expect(renovado.statusCode, renovado.body).toBe(200);
      expect(renovado.json().trocaDeSenhaObrigatoria).toBe(true);
      const aindaTrancado = await app.inject({
        method: "GET", url: "/campo/meu-trabalho", headers: com(renovado.json().acesso),
      });
      expect(aindaTrancado.statusCode).toBe(403);

      // Sair continua funcionando: a pessoa nunca fica presa.
      const saida = await app.inject({
        method: "POST", url: "/auth/sair", payload: { renovacao: renovado.json().renovacao },
      });
      expect(saida.statusCode).toBe(204);
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET senha_hash = $2, senha_provisoria_ate = NULL WHERE id = $1",
        [DIEGO, await derivarSenha(SENHA)],
      );
    }
  }, 300_000);

  it("vencida, a senha provisória não entra, e a resposta diz o que fazer só a quem a tinha", async () => {
    const temporaria = await redefinirDiego();
    try {
      await mem.bruto.query(
        "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 minute' WHERE id = $1", [DIEGO],
      );
      const r = await tentarEntrar(DIEGO_EMAIL, temporaria);
      expect(r.statusCode).toBe(401);
      expect(r.json().erro).toBe("senha_provisoria_vencida");
      // Senha errada continua recebendo a resposta genérica, sem dizer nada.
      const errada = await tentarEntrar(DIEGO_EMAIL, "senha-errada-de-proposito");
      expect(errada.statusCode).toBe(401);
      expect(errada.json().erro).toBe("credenciais");
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET senha_hash = $2, senha_provisoria_ate = NULL WHERE id = $1",
        [DIEGO, await derivarSenha(SENHA)],
      );
    }
  }, 300_000);

  it("uma sessão viva cuja senha provisória venceu no meio não escreve nem renova", async () => {
    const temporaria = await redefinirDiego();
    try {
      const sessao = await entrar(DIEGO_EMAIL, temporaria);
      await mem.bruto.query(
        "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 minute' WHERE id = $1", [DIEGO],
      );
      const troca = await app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: com(sessao.acesso),
        payload: { senhaAtual: temporaria, senha: SENHA },
      });
      expect(troca.statusCode, troca.body).toBe(401);
      expect(troca.json().erro).toBe("sessao");
      const renovado = await app.inject({
        method: "POST", url: "/auth/renovar", payload: { renovacao: sessao.renovacao },
      });
      expect(renovado.statusCode).toBe(401);
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET senha_hash = $2, senha_provisoria_ate = NULL WHERE id = $1",
        [DIEGO, await derivarSenha(SENHA)],
      );
    }
  }, 300_000);
});

describe("A senha inicial do console", () => {
  it("provisionar_municipio carimba 72 horas no administrador que nasce", async () => {
    const criado = await mem.bruto.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_console");
      const r = await tx.query<{ usuario_id: string }>(
        "SELECT usuario_id FROM provisionar_municipio($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          "Coordenadoria de Pedra Branca", "Pedra Branca", "MG", "Rita Nova", "PB-1",
          "rita@pedrabranca.mg.gov.br",
          "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk",
          "Rafael Gomes (operacao da plataforma)",
        ],
      );
      return r.rows[0]!.usuario_id;
    });
    const prazo = await prazoDe(criado);
    expect(prazo).not.toBeNull();
    expect((new Date(prazo!).getTime() - Date.now()) / 3_600_000).toBeGreaterThan(71);
  });

  it("o link de recuperação por email zera o prazo, porque a senha passa a ser da pessoa", async () => {
    await redefinirDiego();
    expect(await prazoDe(DIEGO)).not.toBeNull();
    // A regra é do banco (gatilho da 046): qualquer troca de hash que não
    // carimbe um prazo novo zera o antigo, inclusive `consumir_recuperacao`.
    await mem.bruto.query(
      "UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [DIEGO, await derivarSenha(SENHA)],
    );
    expect(await prazoDe(DIEGO)).toBeNull();
  }, 300_000);

  it("a coluna não existe para ninguém que não passou pela senha sorteada", async () => {
    const r = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM usuarios WHERE organizacao_id = $1 AND senha_provisoria_ate IS NOT NULL",
      [ORG_A],
    );
    expect(r.rows[0]!.n).toBe("0");
  });
});
