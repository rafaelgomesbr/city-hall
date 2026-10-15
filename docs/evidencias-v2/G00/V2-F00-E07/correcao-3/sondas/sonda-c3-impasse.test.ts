import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { bancoPostgres } from "../src/banco/postgres.js";
import type { Banco } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { hashDoToken } from "../src/auth/tokens.js";
import type { FastifyInstance } from "fastify";

/*
  SONDA da correção 3 da E07 (não vai para o repositório como teste; cópia
  arquivada em sondas/). Caça impasse (40P01) e sobra de sessão com o login
  novo (sessão, trava, releitura) disputando ao mesmo tempo com: troca de senha
  pela própria pessoa, redefinição e desativação por quem administra,
  renovação, encerrar sessões e a suspensão pelo console (que toma a linha do
  município antes da trava da pessoa). Postgres real.
*/
const URL = process.env.DC360_POSTGRES_DE_PROVA ?? "";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const SENHA = "defesa-civil-2026";
const RODADAS = Number(process.env.RODADAS ?? 80);

describe.skipIf(!URL)("sonda c3: impasse e sobra", () => {
  let banco: Banco;
  let cliente: pg.Client;
  let app: FastifyInstance;
  let nome = "";
  const url = (n: string) => { const u = new globalThis.URL(URL); u.pathname = `/${n}`; return u.toString(); };

  beforeAll(async () => {
    nome = `sonda_c3_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nome}`);
    await admin.end();
    cliente = new pg.Client({ connectionString: url(nome) });
    await cliente.connect();
    await aplicarMigracoes({
      query: async <T>(sql: string, params?: readonly unknown[]) => ({ rows: (await cliente.query(sql, params ? [...params] : undefined)).rows as T[] }),
      exec: (sql: string) => cliente.query(sql),
    }, carregarMigracoes());
    await cliente.query(carregarSemente());
    banco = bancoPostgres(url(nome), { maximoConexoes: 16 });
    app = await construirServidor({
      banco,
      config: carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-c3-com-mais-de-32-bytes!!", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await banco?.encerrar();
    await cliente?.end();
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    await admin.end();
  });

  it("caos: nenhum 500, nenhum 40P01, nenhuma sessão viva da Helena depois de cada mudança", async () => {
    const hashSenha = await derivarSenha(SENHA);
    const org = String((await cliente.query("SELECT organizacao_id FROM usuarios WHERE id = $1", [HELENA])).rows[0].organizacao_id);
    const dono = (await cliente.query(
      `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
       VALUES ('dono.da.sonda@fornecedor.exemplo', 'scrypt$' || repeat('a', 90), 'v1.sonda', 'dono') RETURNING id`,
    )).rows[0].id as string;
    const consoleDb = new pg.Client({ connectionString: url(nome) });
    await consoleDb.connect();

    const contagem: Record<string, Record<number, number>> = {};
    const anotar = (ato: string, status: number) => {
      contagem[ato] ??= {};
      contagem[ato]![status] = (contagem[ato]![status] ?? 0) + 1;
    };
    const sobras: string[] = [];
    let erros500 = 0;
    let impasses = 0;

    const entrar = (email: string) => app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < RODADAS; i += 1) {
      await cliente.query("UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org]);
      await cliente.query(
        "UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = $1",
        [HELENA, hashSenha],
      );
      await cliente.query("UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza da sonda' WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA]);
      const rita = (await entrar(EMAIL_RITA)).json().acesso as string;
      const outro = (await entrar(EMAIL_HELENA)).json() as { acesso: string; renovacao: string };
      const ato = ["troca", "redefinicao", "desativacao", "suspensao"][i % 4]!;
      const atraso = Math.random() * 250;

      const mudanca = (async () => {
        await esperar(atraso);
        if (ato === "troca") {
          return app.inject({ method: "POST", url: "/auth/trocar-senha", headers: { authorization: `Bearer ${outro.acesso}` }, payload: { senhaAtual: SENHA, senha: "outra-senha-da-sonda-2026" } });
        }
        if (ato === "redefinicao") {
          return app.inject({ method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: { authorization: `Bearer ${rita}` } });
        }
        if (ato === "desativacao") {
          return app.inject({ method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: { authorization: `Bearer ${rita}` }, payload: { ativo: false } });
        }
        await consoleDb.query("BEGIN");
        await consoleDb.query("SELECT set_config('app.console_operador', $1, true)", [dono]);
        try {
          await consoleDb.query("SELECT console_suspender_municipio($1, 'sonda c3')", [org]);
          await consoleDb.query("COMMIT");
          return { statusCode: 200, body: "" };
        } catch (e) {
          await consoleDb.query("ROLLBACK");
          if ((e as { code?: string }).code === "40P01") impasses += 1;
          return { statusCode: 599, body: String(e) };
        }
      })();
      const logins = [0, 1, 2].map(() => entrar(EMAIL_HELENA));
      const renov = app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao: outro.renovacao } });
      // Na rodada da troca, o "encerrar" de quem administra derrubaria a sessão
      // de onde a pessoa troca e a troca nunca aconteceria (401): ali quem
      // disputa no lugar dele é a própria pessoa encerrando as outras.
      const enc = ato === "troca"
        ? app.inject({ method: "POST", url: "/auth/encerrar-sessoes", headers: { authorization: `Bearer ${outro.acesso}` } })
        : app.inject({ method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: { authorization: `Bearer ${rita}` } });

      const [m, ...resto] = await Promise.all([mudanca, ...logins, renov, enc]);
      anotar(ato, m.statusCode);
      for (const r of resto) {
        anotar("outros", r.statusCode);
        if (r.statusCode >= 500) { erros500 += 1; sobras.push(`rodada ${i} ${ato}: ${r.body}`); }
      }
      if (m.statusCode >= 500) { erros500 += 1; sobras.push(`rodada ${i} ${ato} (mudança): ${m.body}`); }

      // Depois da mudança (todas encerram as sessões da Helena, a troca preserva a de onde trocou):
      const vivas = Number((await cliente.query(
        `SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL
           AND ($3::boolean IS FALSE
                OR familia_id IS DISTINCT FROM (SELECT familia_id FROM sessoes WHERE token_hash = $2))`,
        [HELENA, hashDoToken(outro.renovacao), ato === "troca"],
      )).rows[0].n);
      // A troca preserva a cadeia de `outro`; a renovação dela pode ter herdado.
      // O que não pode existir é sessão viva FORA dessa cadeia (um login que sobreviveu).
      if (m.statusCode === 200 && vivas > 0) sobras.push(`rodada ${i} ${ato}: ${vivas} sessão(ões) viva(s) fora da cadeia preservada`);
    }
    await consoleDb.end();
    console.log(JSON.stringify({ rodadas: RODADAS, contagem, erros500, impasses, sobras }, null, 2));
    expect(impasses).toBe(0);
    expect(erros500).toBe(0);
    expect(sobras).toEqual([]);
  }, 600_000);
});
