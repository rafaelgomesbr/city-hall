import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";

/**
 * O ENVIO DE OFÍCIO NÃO PERDE O DESFECHO QUANDO QUEM ENVIOU PERDE O DIREITO DE
 * ESCREVER NO MEIO (achado da revisão do ramo `trab/f00pos-api`, 26/10/2026).
 *
 * O envio tem três passos (`rotas/oficios.ts`): o primeiro autoriza e grava a
 * tentativa, numa transação reconferida (H29, migração 052); o segundo entrega a
 * mensagem ao provedor, fora de transação; o terceiro grava o desfecho e o
 * evento `oficio_enviado`. Com a reconferência valendo também no terceiro, a
 * conta desativada durante o segundo fazia o email sair, a resposta ser 403
 * `conta_desativada`, a tentativa ficar `enviando` sem recibo do provedor e a
 * trilha ficar sem o envio que aconteceu.
 *
 * O CONSERTO: o terceiro passo registra um fato já consumado e passa por
 * `comTenantDeFatoConsumado`, sem reconferir. Este arquivo segura o provedor,
 * desativa a conta (ou encerra as sessões) no meio e exige o desfecho e o
 * evento gravados. O passo 1 continua reconferido: o pedido seguinte da mesma
 * pessoa é recusado.
 */

const SENHA = "defesa-civil-2026";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const OC_COM_PROVIDENCIA = "11111111-1111-4111-8111-0000000000c4";
const RECIBO = "7c1ff1cf-0000-4000-8000-abcdefabcdef";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenRita = "";
let orgaoId = "";

/** O provedor de mentira: entrega na hora, ou segura até o teste soltar. */
let segurar: { chegou: () => void; solta: Promise<void> } | null = null;
const enviadas: Mensagem[] = [];
const notificador: Notificador = {
  async enviar(m) {
    enviadas.push(m);
    if (segurar) {
      const s = segurar;
      segurar = null;
      s.chegou();
      await s.solta;
    }
    return { idNoProvedor: RECIBO };
  },
};

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

/** Um ofício novo (providência nova para o órgão com email), pronto para enviar. */
async function oficioNovo(token: string, i: number): Promise<string> {
  const p = await app.inject({
    method: "POST", url: `/ocorrencias/${OC_COM_PROVIDENCIA}/providencia`, headers: com(token),
    payload: {
      orgaoId, orgaoDestino: "Coordenadoria Estadual de Defesa Civil",
      descricao: `Apoio com lonas e escoramento, pedido ${i}.`, responsavel: "Plantão estadual", prazoHoras: 48,
    },
  });
  if (p.statusCode !== 200 && p.statusCode !== 201) throw new Error(`providência falhou: ${p.body}`);
  const providencia = await mem.bruto.query<{ id: string }>(
    `SELECT id FROM providencias WHERE orgao_id = $1 AND descricao = $2`,
    [orgaoId, `Apoio com lonas e escoramento, pedido ${i}.`],
  );
  const o = await app.inject({
    method: "POST", url: "/oficios", headers: com(token),
    payload: { providenciaId: providencia.rows[0]!.id },
  });
  if (o.statusCode !== 201) throw new Error(`ofício falhou: ${o.body}`);
  return o.json().id as string;
}

async function restaurarHelena(): Promise<void> {
  await mem.bruto.query("UPDATE usuarios SET ativo = true WHERE id = $1", [HELENA]);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-oficio-contra-desativacao-32b!!",
      LOGIN_POR_IP: "10000",
      URL_PUBLICA: "http://api.local",
      MARCA_DAGUA: "",
      EMAIL_ATIVO: "sim",
      NOTIFICADOR_URL: "https://api.resend.com/emails",
      NOTIFICADOR_CHAVE: "re_chave-falsa-de-teste",
      EMAIL_REMETENTE: "defesacivil@serraalta.exemplo.gov.br",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    notificador,
  });
  await app.ready();
  tokenRita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  const orgao = await app.inject({
    method: "POST", url: "/orgaos", headers: com(helena),
    payload: { nome: "Coordenadoria Estadual de Defesa Civil", email: "plantao@cedec.exemplo.gov.br" },
  });
  if (orgao.statusCode !== 201) throw new Error(`órgão falhou: ${orgao.body}`);
  orgaoId = orgao.json().id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

const reacoes = [
  {
    nome: "a Rita desativa a conta da Helena",
    disparar: () => app.inject({
      method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: com(tokenRita), payload: { ativo: false },
    }),
    seguinte: { status: 403, erro: "conta_desativada" },
  },
  {
    nome: "a Rita encerra as sessões da Helena",
    disparar: () => app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    }),
    seguinte: { status: 401, erro: "sessao_encerrada" },
  },
];

describe("Ofício enviado enquanto quem enviou perde o direito de escrever", () => {
  for (const [i, reacao] of reacoes.entries()) {
    it(`${i + 1}. ${reacao.nome} enquanto o provedor responde: o desfecho e o oficio_enviado são gravados`, async () => {
      const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
      const oficioId = await oficioNovo(helena, i + 1);
      let chegou!: () => void;
      const noProvedor = new Promise<void>((r) => { chegou = r; });
      let soltar!: () => void;
      const solta = new Promise<void>((r) => { soltar = r; });
      segurar = { chegou, solta };
      try {
        const envio = app.inject({
          method: "POST", url: `/oficios/${oficioId}/envio`, headers: com(helena), payload: {},
        });
        await noProvedor;
        const r = await reacao.disparar();
        expect(r.statusCode, r.body).toBe(200);
        soltar();
        const resposta = await envio;
        expect(resposta.statusCode, `o envio aconteceu e a resposta diz outra coisa: ${resposta.body}`).toBe(202);

        const tentativa = await mem.bruto.query<{ desfecho: string; provedor_id: string | null }>(
          "SELECT desfecho, provedor_id FROM oficio_envios WHERE oficio_id = $1", [oficioId],
        );
        expect(tentativa.rows).toEqual([{ desfecho: "entregue", provedor_id: RECIBO }]);
        const evento = await mem.bruto.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM trilha_eventos
            WHERE tipo = 'oficio_enviado' AND autor_id = $1 AND detalhe->>'numero' =
                  (SELECT numero FROM oficios WHERE id = $2)`,
          [HELENA, oficioId],
        );
        expect(evento.rows[0]!.n, "a trilha ficou sem o envio que aconteceu").toBe(1);

        // O passo 1 continua reconferido: o pedido seguinte já ouve a reação.
        const seguinte = await app.inject({
          method: "POST", url: `/oficios/${oficioId}/envio`, headers: com(helena), payload: {},
        });
        expect(seguinte.statusCode, seguinte.body).toBe(reacao.seguinte.status);
        expect(seguinte.json().erro).toBe(reacao.seguinte.erro);
        expect(enviadas.length, "o reenvio recusado não pode ter chegado ao provedor").toBe(i + 1);
      } finally {
        soltar();
        segurar = null;
        await restaurarHelena();
      }
    }, 60_000);
  }
});
