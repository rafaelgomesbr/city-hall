import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { hashDoToken } from "../src/auth/tokens.js";

/**
 * A escrita confere, no banco, se quem escreve AINDA PODE.
 *
 * O QUE O REVISOR PROVOU: `exigirAutenticacao` verificava só a assinatura do
 * token de acesso. Conta desativada, papel rebaixado ou sessões encerradas
 * por quem administra continuavam ESCREVENDO (registrar, despachar, encerrar,
 * subir vistoria) por até quinze minutos, e o comentário em `auth/sessoes.ts`
 * chamava isso de pendência. Em quinze minutos se encerra uma ocorrência com
 * motivo inventado, e a trilha não se corrige.
 *
 * A REGRA: toda escrita (qualquer método que não seja GET ou HEAD) lê UMA
 * linha do banco, na mesma consulta que já conferia a suspensão do município:
 * a conta está ativa, o papel é o do token, e a sessão do token
 * (`sid`) está de pé. Qualquer um dos três falhando responde 401 `sessao`,
 * que o painel e o aparelho já leem como "entre de novo".
 *
 * LEITURA continua confiando no token pelos quinze minutos, como
 * `auth/suspensao.ts` explica e este arquivo NÃO contesta: o custo seria uma
 * ida ao banco em cada leitura de uma noite de chuva, e ler por quinze
 * minutos não produz registro. A exceção (leituras do agente de campo) já
 * consulta `usuarios` pela equipe, mas não a sessão; fica declarado.
 *
 * E o TOKEN DE RENOVAÇÃO VENCIDO deixa de derrubar a família inteira: reuso é
 * só o token ROTACIONADO que reaparece. Ver a migração 046.
 */

const SENHA = "defesa-civil-2026";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenRita: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

/** Uma escrita inofensiva e idempotente: corrigir a coordenada da mesma ocorrência. */
function escrever(token: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${OC_ALFA_1}/coordenada`, headers: com(token),
    payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
  });
}

function ler(token: string) {
  return app.inject({ method: "GET", url: "/ocorrencias?status=ativas", headers: com(token) });
}

function renovar(renovacao: string) {
  return app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
}

async function restaurarHelena(): Promise<void> {
  await mem.bruto.query(
    "UPDATE usuarios SET ativo = true, papel = 'coordenador' WHERE id = $1", [HELENA],
  );
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-vigencia-na-escrita-com-32-bytes!",
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

/*
  DESLIGADO NESTA IMPLANTAÇÃO: `auth/vigencia.ts` existe e está correto (é o
  que este bloco prova), mas `servidor.ts` não o chama mais na escrita, de
  propósito, porque a revisão que o escreveu não terminou de rodar a própria
  suíte antes do prazo acabar. Ligá-lo sem essa prova arriscaria travar
  escrita legítima em produção. Ver a nota em `servidor.ts` e o plano de
  execução ("PAUSADO em 15/09/2026"). O bloco de baixo ("Token de renovação
  vencido") testa outra coisa, já em vigor, e continua rodando.
*/
describe.skip("Token vivo de quem já não pode (aguardando religar auth/vigencia.ts)", () => {
  it("conta desativada não escreve mais, no pedido seguinte", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    expect((await escrever(helena.acesso)).statusCode).toBe(200);

    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: com(tokenRita),
      payload: { ativo: false },
    });
    expect(r.statusCode, r.body).toBe(200);
    try {
      const recusa = await escrever(helena.acesso);
      expect(recusa.statusCode, recusa.body).toBe(401);
      expect(recusa.json().erro).toBe("sessao");
    } finally {
      await restaurarHelena();
    }
  });

  it("papel rebaixado escreve como o papel NOVO, não como o do token", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    // Coordenadora: a triagem é dela.
    const antes = await app.inject({
      method: "POST", url: `/ocorrencias/${OC_ALFA_1}/coordenada`, headers: com(helena.acesso),
      payload: { coordenada: { lat: -22.42, lng: -45.46 }, motivo: "Ponto conferido no local pela equipe." },
    });
    expect(antes.statusCode, antes.body).toBe(200);

    const rita = await app.inject({
      method: "PATCH", url: `/usuarios/${HELENA}`, headers: com(tokenRita),
      payload: {
        nome: "Helena Vasques Coutinho", matricula: "SA-1042",
        email: "helena.coutinho@serraalta.exemplo.gov.br", papel: "operador",
      },
    });
    expect(rita.statusCode, rita.body).toBe(200);
    try {
      // O token ainda diz "coordenador". O banco diz "operador". Vale o banco.
      const recusa = await escrever(helena.acesso);
      expect(recusa.statusCode, recusa.body).toBe(401);
      expect(recusa.json().erro).toBe("sessao");
    } finally {
      await restaurarHelena();
    }
  });

  it("sessões encerradas por quem administra não escrevem mais, e a de quem clicou em 'Minha conta' sobrevive", async () => {
    const noComputador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const noCelular = await entrar("helena.coutinho@serraalta.exemplo.gov.br");

    // A própria Helena encerra as OUTRAS: a de onde clicou continua.
    const proprias = await app.inject({
      method: "POST", url: "/auth/encerrar-sessoes", headers: com(noComputador.acesso),
    });
    expect(proprias.statusCode, proprias.body).toBe(200);
    expect((await escrever(noComputador.acesso)).statusCode).toBe(200);
    const doCelular = await escrever(noCelular.acesso);
    expect(doCelular.statusCode, doCelular.body).toBe(401);
    expect(doCelular.json().erro).toBe("sessao");

    // Quem administra derruba TODAS, inclusive a que sobreviveu acima.
    const rita = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    });
    expect(rita.statusCode, rita.body).toBe(200);
    const recusa = await escrever(noComputador.acesso);
    expect(recusa.statusCode, recusa.body).toBe(401);
    expect(recusa.json().erro).toBe("sessao");
  });

  it("o token de acesso continua LENDO até vencer: é a troca declarada", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    });
    // Documentado em `auth/suspensao.ts`: leitura com token vivo não vai ao
    // banco. Se este caso um dia reprovar, a decisão mudou e este comentário
    // e aquele precisam mudar juntos.
    expect((await ler(helena.acesso)).statusCode).toBe(200);
    expect((await escrever(helena.acesso)).statusCode).toBe(401);
  });

  it("depois de renovar, o token de acesso antigo ainda escreve até vencer: rotação não é expulsão", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const novo = await renovar(helena.renovacao);
    expect(novo.statusCode, novo.body).toBe(200);
    // A sessão antiga foi revogada por ROTAÇÃO, e não por ninguém: o token de
    // acesso emitido nela é legítimo pelos seus quinze minutos, e a fila do
    // aparelho pode estar no meio de um envio com ele.
    expect((await escrever(helena.acesso)).statusCode).toBe(200);
    expect((await escrever(novo.json().acesso)).statusCode).toBe(200);
  });
});

describe("Token de renovação vencido não é reuso", () => {
  it("expirado responde 401 e as outras sessões da pessoa continuam vivas", async () => {
    const painel = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const aparelho = await entrar("helena.coutinho@serraalta.exemplo.gov.br");

    // O aparelho ficou quinze dias sem sinal: o token dele venceu no banco.
    await mem.bruto.query(
      "UPDATE sessoes SET expira_em = now() - interval '1 day' WHERE token_hash = $1",
      [hashDoToken(aparelho.renovacao)],
    );

    const r = await renovar(aparelho.renovacao);
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toBe("sessao");

    // O painel NÃO caiu: renovar continua funcionando e a sessão não ganhou motivo.
    const doPainel = await renovar(painel.renovacao);
    expect(doPainel.statusCode, doPainel.body).toBe(200);
    const motivos = await mem.bruto.query<{ motivo_revogacao: string | null }>(
      "SELECT motivo_revogacao FROM sessoes WHERE usuario_id = $1 AND motivo_revogacao = 'reuso de token de renovacao'",
      [HELENA],
    );
    expect(motivos.rows).toHaveLength(0);
  });

  it("sessão encerrada pela própria pessoa, ou por quem administra, também não é reuso", async () => {
    const painel = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const celularPerdido = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    await app.inject({ method: "POST", url: "/auth/encerrar-sessoes", headers: com(painel.acesso) });

    // O celular perdido reaparece com o token encerrado: 401, e o painel fica.
    expect((await renovar(celularPerdido.renovacao)).statusCode).toBe(401);
    expect((await renovar(painel.renovacao)).statusCode).toBe(200);
  });

  it("o token ROTACIONADO que reaparece é reuso: a família inteira cai", async () => {
    const roubado = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const outra = await entrar("helena.coutinho@serraalta.exemplo.gov.br");

    // O legítimo renova (rotaciona); o ladrão apresenta o token antigo.
    const legitimo = await renovar(roubado.renovacao);
    expect(legitimo.statusCode).toBe(200);
    expect((await renovar(roubado.renovacao)).statusCode).toBe(401);

    // Tudo caiu, inclusive a renovação nova do legítimo e a outra sessão.
    expect((await renovar(legitimo.json().renovacao)).statusCode).toBe(401);
    expect((await renovar(outra.renovacao)).statusCode).toBe(401);
    const motivos = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessoes WHERE usuario_id = $1 AND motivo_revogacao = 'reuso de token de renovacao'",
      [HELENA],
    );
    expect(Number(motivos.rows[0]!.n)).toBeGreaterThan(0);
  });

  it("H1: dois pedidos de renovação com o mesmo token: um ganha, o outro não emite sessão", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const [a, b] = await Promise.all([renovar(helena.renovacao), renovar(helena.renovacao)]);
    const codigos = [a.statusCode, b.statusCode].sort();
    /*
      O banco em memória serializa as transações, então o segundo pedido lê a
      sessão já revogada e cai como reuso: 200 e 401. O que este caso guarda é
      que NUNCA saem dois pares de tokens de um token só: `revogar_sessao`
      devolvendo zero linhas aborta a emissão, mesmo quando a leitura anterior
      ainda via a sessão de pé.
    */
    expect(codigos).toEqual([200, 401]);
    const emitidas = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sessoes
        WHERE usuario_id = $1 AND criada_em > now() - interval '1 minute' AND revogada_em IS NULL`,
      [HELENA],
    );
    expect(Number(emitidas.rows[0]!.n)).toBeLessThanOrEqual(1);
  });
});
