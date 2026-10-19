import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { hashDoToken } from "../src/auth/tokens.js";

/**
 * A PRÓPRIA CONTA, ESCRITA DE OUTRO JEITO (V2-F00-E09, correção 3, achado 1
 * da validação de bb0f654).
 *
 * As rotas de quem administra recusam com 422 agir sobre a própria conta:
 * redefinir a própria senha sem informar a atual (`autoredefinicao`),
 * derrubar as próprias sessões pelo botão de terceiro (`autoencerramento`) e
 * desativar a si mesma (`autodesativacao`). A recusa comparava o id da rota
 * com o do token COMO TEXTO, e o Postgres lê o uuid sem caixa: o mesmo id em
 * maiúsculas passava pela recusa e chegava ao banco como a própria conta. A
 * administradora redefinia a própria senha sem a atual (quem senta numa
 * sessão dela aberta toma a conta) e derrubava as próprias sessões.
 *
 * O conserto normaliza o id da rota (minúsculas, a forma que o Postgres
 * devolve) no esquema que o lê, antes de qualquer comparação. Os formatos
 * alternativos que o Postgres também aceitaria como uuid (chaves, sem hífens,
 * `urn:uuid:`, espaço ou quebra de linha) não passam pelo esquema: são 422 de
 * dado inválido, nunca 200.
 */

const SENHA = "defesa-civil-2026";
const RITA = "11111111-1111-4111-8111-0000000000d4";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let rita: { acesso: string; renovacao: string };

async function entrarComoRita(): Promise<void> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email: EMAIL_RITA, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  rita = { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

type Rota = {
  nome: string;
  erro: string;
  pedir: (id: string) => ReturnType<FastifyInstance["inject"]>;
};

const rotas: Rota[] = [
  {
    nome: "redefinir a senha",
    erro: "autoredefinicao",
    pedir: (id) => app.inject({
      method: "POST", url: `/usuarios/${id}/redefinir-senha`, headers: { authorization: `Bearer ${rita.acesso}` },
    }),
  },
  {
    nome: "encerrar as sessões",
    erro: "autoencerramento",
    pedir: (id) => app.inject({
      method: "POST", url: `/usuarios/${id}/encerrar-sessoes`, headers: { authorization: `Bearer ${rita.acesso}` },
    }),
  },
  {
    nome: "desativar a conta",
    erro: "autodesativacao",
    pedir: (id) => app.inject({
      method: "PATCH", url: `/usuarios/${id}/situacao`, headers: { authorization: `Bearer ${rita.acesso}` },
      payload: { ativo: false },
    }),
  },
];

/** O mesmo id da Rita em grafias que o Postgres lê como o mesmo uuid. */
const mesmaContaEmOutraCaixa: Array<[string, string]> = [
  ["em maiúsculas", RITA.toUpperCase()],
  ["com caixa misturada", "11111111-1111-4111-8111-0000000000D4"],
];

/**
 * Formatos que o Postgres também aceitaria como uuid e que o esquema recusa.
 * Vão na URL codificados, como um cliente os mandaria.
 */
const formatosAlternativos: Array<[string, string]> = [
  ["entre chaves", `{${RITA}}`],
  ["sem hífens", RITA.replaceAll("-", "")],
  ["sem hífens, em maiúsculas", RITA.replaceAll("-", "").toUpperCase()],
  ["com o prefixo urn:uuid:", `urn:uuid:${RITA}`],
  ["com espaço antes", ` ${RITA}`],
  ["com quebra de linha depois", `${RITA}\n`],
  ["com hífens fora do lugar", "11111111111141118111-0000-0000-00d4"],
];

/** O que tem de continuar intacto na conta da Rita depois de cada recusa. */
async function exigirContaDaRitaIntacta(): Promise<void> {
  const linha = await mem.bruto.query<{ ativo: boolean; senha_provisoria_ate: string | null }>(
    "SELECT ativo, senha_provisoria_ate FROM usuarios WHERE id = $1", [RITA],
  );
  expect(linha.rows[0]!.ativo, "a conta da Rita foi desativada").toBe(true);
  expect(linha.rows[0]!.senha_provisoria_ate, "a senha da Rita virou temporária").toBeNull();
  const sessao = await mem.bruto.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM sessoes WHERE token_hash = $1 AND revogada_em IS NULL", [hashDoToken(rita.renovacao)],
  );
  expect(Number(sessao.rows[0]!.n), "a sessão de onde a Rita clicou caiu").toBe(1);
  const entra = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email: EMAIL_RITA, senha: SENHA } });
  expect(entra.statusCode, `a senha da Rita deixou de entrar: ${entra.body}`).toBe(200);
}

async function restaurar(): Promise<void> {
  await mem.bruto.query(
    "UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = ANY($1::uuid[])",
    [[RITA, HELENA], await derivarSenha(SENHA)],
  );
  await entrarComoRita();
}

describe("A própria conta com o id escrito de outro jeito", () => {
  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    app = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test", JWT_SEGREDO: "segredo-do-id-da-propria-conta-com-32-bytes!", LOGIN_POR_IP: "10000",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    /*
      Um segundo administrador ativo: sem ele a desativação da própria conta
      cairia na recusa do último administrador, e o caso não provaria nada
      sobre a recusa da autodesativação.
    */
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       SELECT organizacao_id, 'Otávio Prado Reis', 'SA-9001', 'otavio.reis@serraalta.exemplo.gov.br',
              'administrador', senha_hash
         FROM usuarios WHERE id = $1`,
      [RITA],
    );
    await entrarComoRita();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  for (const rota of rotas) {
    it(`${rota.nome} com o próprio id em minúsculas: 422 ${rota.erro} (controle)`, async () => {
      try {
        const r = await rota.pedir(RITA);
        expect(r.statusCode, r.body).toBe(422);
        expect(r.json().erro).toBe(rota.erro);
        await exigirContaDaRitaIntacta();
      } finally {
        await restaurar();
      }
    }, 120_000);

    for (const [grafia, id] of mesmaContaEmOutraCaixa) {
      it(`${rota.nome} com o próprio id ${grafia}: 422 ${rota.erro}, e nada muda`, async () => {
        try {
          const r = await rota.pedir(id);
          expect(r.statusCode, `${rota.nome} sobre a própria conta, id ${grafia}: ${r.body}`).toBe(422);
          expect(r.json().erro).toBe(rota.erro);
          expect(r.body).not.toContain("senhaTemporaria");
          await exigirContaDaRitaIntacta();
        } finally {
          await restaurar();
        }
      }, 120_000);
    }

    it(`${rota.nome} com o próprio id em formatos alternativos de uuid: nunca 200, e nada muda`, async () => {
      try {
        for (const [formato, id] of formatosAlternativos) {
          const r = await rota.pedir(encodeURIComponent(id));
          expect(r.statusCode, `${rota.nome}, id ${formato}: ${r.body}`).not.toBe(200);
          expect([400, 404, 422], `${rota.nome}, id ${formato}: ${r.body}`).toContain(r.statusCode);
          expect(r.body).not.toContain("senhaTemporaria");
        }
        await exigirContaDaRitaIntacta();
      } finally {
        await restaurar();
      }
    }, 120_000);
  }

  /*
    O CONSERTO NÃO PODE RECUSAR O QUE É LEGÍTIMO: o id de OUTRA pessoa em
    maiúsculas continua sendo aquela pessoa, e a redefinição dela responde 200
    com a temporária, como com o id em minúsculas.
  */
  it("o id de outra pessoa em maiúsculas continua valendo: a redefinição da Helena responde 200", async () => {
    try {
      const r = await rotas[0]!.pedir(HELENA.toUpperCase());
      expect(r.statusCode, r.body).toBe(200);
      expect(typeof r.json().senhaTemporaria).toBe("string");
      const helena = await mem.bruto.query<{ senha_provisoria_ate: string | null }>(
        "SELECT senha_provisoria_ate FROM usuarios WHERE id = $1", [HELENA],
      );
      expect(helena.rows[0]!.senha_provisoria_ate, "a redefinição não marcou a temporária").not.toBeNull();
      await exigirContaDaRitaIntacta();
    } finally {
      await restaurar();
    }
  }, 120_000);
});
