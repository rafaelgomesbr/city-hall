import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { bancoPostgres } from "../src/banco/postgres.js";
import type { Banco } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { conferirSenha, derivarSenha } from "../src/auth/senha.js";
import { gerarTokenRenovacao, hashDoToken } from "../src/auth/tokens.js";
import type { FastifyInstance } from "fastify";

/*
  SONDA da correção 4 da E07 (não vai para o repositório como teste; cópia
  arquivada em sondas/, copiada para apps/api/test só durante a execução).
  Sem grampo: a cada rodada, a troca de senha do invasor (senha antiga, sessão
  A) disputa com uma reação em rodízio (redefinição por quem administra, link
  do email, desativação, troca pela própria pessoa na sessão B), com atraso
  sorteado de 0 a 300 ms para um dos dois lados, mais um login com a senha
  antiga e uma renovação da sessão A no mesmo instante. Postgres real.

  SOBREVIVENTE é o desfecho que nenhuma ordem serial produz: a reação
  respondeu 200 e, no fim, a senha do invasor entra, ou sobra sessão da
  Helena fora da cadeia que a reação preserva (nenhuma, salvo a da vítima na
  troca pela própria pessoa), ou as duas trocas responderam 200.
*/
const URL = process.env.DC360_POSTGRES_DE_PROVA ?? "";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const SENHA = "defesa-civil-2026";
const SENHA_DO_INVASOR = "senha-escolhida-pelo-invasor-2026";
const SENHA_DA_VITIMA = "senha-nova-da-propria-pessoa-2026";
const SENHA_DO_LINK = "senha-definida-pelo-link-do-email-2026";
const RODADAS = Number(process.env.RODADAS ?? 40);

describe.skipIf(!URL)("sonda c4: a troca do invasor contra a reação, sem grampo", () => {
  let banco: Banco;
  let cliente: pg.Client;
  let app: FastifyInstance;
  let nome = "";
  const url = (n: string) => { const u = new globalThis.URL(URL); u.pathname = `/${n}`; return u.toString(); };

  beforeAll(async () => {
    nome = `sonda_c4_${Math.random().toString(36).slice(2, 8)}`;
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
      config: carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-c4-com-mais-de-32-bytes!!", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv),
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

  it("caos: nenhum 500, nenhum 40P01, nenhum sobrevivente", async () => {
    const hashSenha = await derivarSenha(SENHA);
    const org = String((await cliente.query("SELECT organizacao_id FROM usuarios WHERE id = $1", [HELENA])).rows[0].organizacao_id);
    const contagem: Record<string, Record<string, number>> = {};
    const anotar = (chave: string, valor: string) => {
      contagem[chave] ??= {};
      contagem[chave]![valor] = (contagem[chave]![valor] ?? 0) + 1;
    };
    const sobreviventes: string[] = [];
    const erros500: string[] = [];
    let vitimaRecusadaAsClaras = 0;

    const entrar = (email: string, senha = SENHA) => app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const com = (t: string) => ({ authorization: `Bearer ${t}` });

    for (let i = 0; i < RODADAS; i += 1) {
      await cliente.query(
        "UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = $1",
        [HELENA, hashSenha],
      );
      await cliente.query("UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza da sonda' WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA]);
      const rita = (await entrar(EMAIL_RITA)).json().acesso as string;
      const invasor = (await entrar(EMAIL_HELENA)).json() as { acesso: string; renovacao: string };
      const vitima = (await entrar(EMAIL_HELENA)).json() as { acesso: string; renovacao: string };
      const ato = ["redefinicao", "link", "desativacao", "troca_da_vitima"][i % 4]!;
      const token = gerarTokenRenovacao();
      if (ato === "link") {
        await cliente.query(
          `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
           VALUES ($1, $2, $3, now() + interval '30 minutes')`, [org, HELENA, hashDoToken(token)],
        );
      }
      const atraso = Math.random() * 300;
      const invasorPrimeiro = Math.random() < 0.5;

      const reacao = (async () => {
        if (invasorPrimeiro) await esperar(atraso);
        if (ato === "redefinicao") return app.inject({ method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: com(rita) });
        if (ato === "link") return app.inject({ method: "POST", url: "/auth/redefinir", payload: { token, senha: SENHA_DO_LINK } });
        if (ato === "desativacao") return app.inject({ method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: com(rita), payload: { ativo: false } });
        return app.inject({ method: "POST", url: "/auth/trocar-senha", headers: com(vitima.acesso), payload: { senhaAtual: SENHA, senha: SENHA_DA_VITIMA } });
      })();
      const troca = (async () => {
        if (!invasorPrimeiro) await esperar(atraso);
        return app.inject({ method: "POST", url: "/auth/trocar-senha", headers: com(invasor.acesso), payload: { senhaAtual: SENHA, senha: SENHA_DO_INVASOR } });
      })();
      const login = (async () => { await esperar(Math.random() * 300); return entrar(EMAIL_HELENA); })();
      const renov = (async () => {
        await esperar(Math.random() * 300);
        return app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao: invasor.renovacao } });
      })();

      const [rr, rt, rl, rn] = await Promise.all([reacao, troca, login, renov]);
      anotar(`${ato}: reação`, String(rr.statusCode));
      anotar(`${ato}: troca do invasor`, `${rt.statusCode} ${rt.statusCode === 200 ? "" : rt.json().erro}`.trim());
      anotar("login com a senha antiga", String(rl.statusCode));
      anotar("renovação da sessão do invasor", String(rn.statusCode));
      for (const [quem, r] of [["reação", rr], ["troca", rt], ["login", rl], ["renovação", rn]] as const) {
        if (r.statusCode >= 500) erros500.push(`rodada ${i} ${ato} ${quem}: ${r.body}`);
      }

      const linha = (await cliente.query("SELECT senha_hash FROM usuarios WHERE id = $1", [HELENA])).rows[0];
      const senhaDoInvasorVale = await conferirSenha(SENHA_DO_INVASOR, String(linha.senha_hash));
      const familiaDaVitima = String((await cliente.query("SELECT familia_id FROM sessoes WHERE token_hash = $1", [hashDoToken(vitima.renovacao)])).rows[0].familia_id);
      const vivasForaDaVitima = Number((await cliente.query(
        "SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL AND familia_id <> $2",
        [HELENA, familiaDaVitima],
      )).rows[0].n);
      const vivasTotal = Number((await cliente.query(
        "SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA],
      )).rows[0].n);

      if (rr.statusCode === 200) {
        if (ato !== "desativacao" && senhaDoInvasorVale) sobreviventes.push(`rodada ${i} ${ato}: a senha do invasor vale depois da reação (troca ${rt.statusCode})`);
        if (ato === "troca_da_vitima") {
          if (rt.statusCode === 200) sobreviventes.push(`rodada ${i} ${ato}: as duas trocas responderam 200`);
          if (vivasForaDaVitima > 0) sobreviventes.push(`rodada ${i} ${ato}: ${vivasForaDaVitima} sessão(ões) viva(s) fora da cadeia da vítima`);
        } else if (vivasTotal > 0) {
          sobreviventes.push(`rodada ${i} ${ato}: ${vivasTotal} sessão(ões) viva(s) da Helena depois da reação`);
        }
      } else if (ato === "troca_da_vitima" && rr.statusCode === 401) {
        vitimaRecusadaAsClaras += 1;
      }
    }
    console.log(JSON.stringify({ rodadas: RODADAS, contagem, erros500, sobreviventes, vitimaRecusadaAsClaras }, null, 2));
    expect(erros500).toEqual([]);
    expect(sobreviventes).toEqual([]);
  }, 900_000);
});
