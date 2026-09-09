import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O prazo de retenção é decisão do MUNICÍPIO, e esta é a porta por onde ele
 * decide.
 *
 * O município é o controlador na acepção da Lei 13.709/2018: é a competência
 * dele que justifica o tratamento, então é ele que fixa por quanto tempo o
 * dado fica. O fornecedor entrega o mecanismo e nunca o número.
 *
 * Sem esta rota, a varredura da migração 021 estaria pronta e sem nenhuma
 * forma de ser ligada, e a seção 4 da política de privacidade descreveria uma
 * retenção que ninguém consegue configurar.
 */

const SENHA = "defesa-civil-2026";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const VALE_FUNDO = "22222222-2222-4222-8222-000000000002";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAdministrador: string;
let tokenCoordenador: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function prazosNoBanco(org: string) {
  const r = await mem.bruto.query<{
    retencao_solicitante_dias: number | null;
    retencao_vulnerabilidade_dias: number | null;
  }>(
    `SELECT retencao_solicitante_dias, retencao_vulnerabilidade_dias
       FROM organizacoes WHERE id = $1`,
    [org],
  );
  return r.rows[0]!;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-retencao-do-municipio-com-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAdministrador = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Quem decide o prazo", () => {
  it("o município começa sem prazo nenhum, e por isso não perde nada", async () => {
    /*
      O padrão conservador é NÃO REMOVER. Escolher um número por quem ainda não
      decidiu seria o fornecedor decidindo, no lugar do controlador, o dia em
      que um dado de cidadão é destruído.
    */
    const r = await app.inject({
      method: "GET", url: "/organizacao/retencao", headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().solicitanteDias).toBeNull();
    expect(r.json().vulnerabilidadeDias).toBeNull();
  }, 60_000);

  it("coordenador não fixa o prazo: é ato de quem administra o município", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenCoordenador),
      payload: { solicitanteDias: 30, vulnerabilidadeDias: 30 },
    });
    expect(r.statusCode).toBe(403);
    expect((await prazosNoBanco(SERRA_ALTA)).retencao_solicitante_dias).toBeNull();
  }, 60_000);

  it("o administrador fixa, e o valor volta na leitura", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
      payload: { solicitanteDias: 1825, vulnerabilidadeDias: 365 },
    });
    expect(r.statusCode).toBe(200);

    const lido = await app.inject({
      method: "GET", url: "/organizacao/retencao", headers: com(tokenAdministrador),
    });
    expect(lido.json().solicitanteDias).toBe(1825);
    expect(lido.json().vulnerabilidadeDias).toBe(365);
  }, 60_000);

  it("recusa a vulnerabilidade sair depois do nome, e diz o que corrigir", async () => {
    /*
      Configurar noventa dias para o nome e cinco anos para a vulnerabilidade
      faria o sistema descartar o identificador comum e continuar guardando a
      frase que descreve a doença de quem mora na casa, que é o contrário do
      que minimização quer dizer.
    */
    const r = await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
      payload: { solicitanteDias: 90, vulnerabilidadeDias: 1825 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().mensagem).toMatch(/vulnerabilidade/i);

    // E nada mudou: a recusa não pode deixar metade aplicada.
    expect((await prazosNoBanco(SERRA_ALTA)).retencao_solicitante_dias).toBe(1825);
  }, 60_000);

  it("nulo é valor, e não campo esquecido: dá para voltar atrás", async () => {
    const r = await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
      payload: { solicitanteDias: null, vulnerabilidadeDias: null },
    });
    expect(r.statusCode).toBe(200);
    expect((await prazosNoBanco(SERRA_ALTA)).retencao_solicitante_dias).toBeNull();
  }, 60_000);

  it("a mudança entra na trilha administrativa, com antes e depois", async () => {
    /*
      Encurtar um prazo destrói dado de cidadão que ainda estava dentro do
      anterior. Sem `antes` e `depois` na trilha, "quem mandou apagar isso?"
      não tem resposta, e a varredura fica sendo o único suspeito de um
      descarte que alguém pediu.
    */
    await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
      payload: { solicitanteDias: 730, vulnerabilidadeDias: 730 },
    });

    const r = await mem.bruto.query<{
      autor_nome: string; alvo_tipo: string;
      antes: { solicitanteDias: number | null };
      depois: { solicitanteDias: number | null };
    }>(
      `SELECT * FROM trilha_administrativa
        WHERE acao = 'retencao_alterada' ORDER BY registrado_em DESC LIMIT 1`,
    );
    const ato = r.rows[0];
    expect(ato, "prazo alterado sem rastro de quem alterou").toBeTruthy();
    expect(ato!.alvo_tipo).toBe("organizacao");
    expect(ato!.autor_nome).toMatch(/Rita/i);
    expect(ato!.antes.solicitanteDias).toBeNull();
    expect(ato!.depois.solicitanteDias).toBe(730);
  }, 60_000);

  it("um município não fixa o prazo do outro", async () => {
    /*
      A organização sai do token verificado, e de mais lugar nenhum. Se
      viesse do corpo da requisição, o administrador de uma prefeitura
      escolheria o dia da destruição do dado da prefeitura vizinha.
    */
    await app.inject({
      method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
      payload: { solicitanteDias: 1, vulnerabilidadeDias: 1, organizacaoId: VALE_FUNDO },
    });
    expect((await prazosNoBanco(VALE_FUNDO)).retencao_solicitante_dias).toBeNull();
  }, 60_000);

  it("o banco recusa prazo fora da faixa plausível", async () => {
    for (const dias of [0, -30, 40_000]) {
      const r = await app.inject({
        method: "PATCH", url: "/organizacao/retencao", headers: com(tokenAdministrador),
        payload: { solicitanteDias: dias, vulnerabilidadeDias: null },
      });
      expect(r.statusCode, `aceitou ${dias} dias de retencao`).toBe(422);
    }
  }, 60_000);
});
