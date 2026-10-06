import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { emitirAcesso, hashDoToken } from "../src/auth/tokens.js";
import { derivarSenha } from "../src/auth/senha.js";

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
 * (`sid`) está de pé. Sessão encerrada responde 401 `sessao_encerrada`
 * ("entre de novo"); papel diferente responde 401 `nao_autenticado` ("renove e
 * repita", porque a renovação já traz o papel novo: V2-F00-E07); conta DESATIVADA responde 403
 * `conta_desativada` ("pare e avise": entrar de novo não resolve). Os códigos
 * são do catálogo de `@dc360/shared` (V2-F00-E05); até lá os dois eram `sessao`.
 *
 * LEITURA continua confiando no token pelos quinze minutos, como
 * `auth/suspensao.ts` explica e este arquivo NÃO contesta: o custo seria uma
 * ida ao banco em cada leitura de uma noite de chuva, e ler por quinze
 * minutos não produz registro. A exceção (leituras do agente de campo) já
 * consulta `usuarios` pela equipe, mas não a sessão; fica declarado.
 *
 * HISTÓRICO: a conferência esteve desligada em `servidor.ts` de 17/09/2026
 * (commit b4439ac) até V2-F00-E04, com o primeiro bloco abaixo em `describe.skip`.
 * Ligada de novo, os quatro casos que reprovavam sem ela (conta desativada,
 * papel rebaixado, sessão encerrada, leitura x escrita) voltaram a ser a prova.
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

describe("Token vivo de quem já não pode", () => {
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
      // 403 e não 401: entrar de novo não resolve para conta desativada.
      expect(recusa.statusCode, recusa.body).toBe(403);
      expect(recusa.json().erro).toBe("conta_desativada");
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
      // O token ainda diz "coordenador". O banco diz "operador". Vale o banco,
      // e a resposta é "renove e repita" (V2-F00-E07), não "entre de novo".
      const recusa = await escrever(helena.acesso);
      expect(recusa.statusCode, recusa.body).toBe(401);
      expect(recusa.json().erro).toBe("nao_autenticado");
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
    expect(doCelular.json().erro).toBe("sessao_encerrada");

    // Quem administra derruba TODAS, inclusive a que sobreviveu acima.
    const rita = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    });
    expect(rita.statusCode, rita.body).toBe(200);
    const recusa = await escrever(noComputador.acesso);
    expect(recusa.statusCode, recusa.body).toBe(401);
    expect(recusa.json().erro).toBe("sessao_encerrada");
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

describe("Bordas da vigência na escrita (V2-F00-E04)", () => {
  const SEGREDO = "segredo-da-vigencia-na-escrita-com-32-bytes!";

  async function orgDeHelena(): Promise<string> {
    const r = await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT organizacao_id FROM usuarios WHERE id = $1", [HELENA],
    );
    return r.rows[0]!.organizacao_id;
  }

  it("município suspenso com conta desativada responde a suspensão primeiro", async () => {
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const org = await orgDeHelena();
    await mem.bruto.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1",
      [org],
    );
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [HELENA]);
    try {
      const r = await escrever(helena.acesso);
      // A resposta que manda procurar o contrato vale mesmo com a conta desativada.
      expect(r.statusCode, r.body).toBe(403);
      expect(r.json().erro).toBe("acesso_suspenso");
    } finally {
      await mem.bruto.query(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org],
      );
      await restaurarHelena();
    }
  });

  it("token com o sid de OUTRA pessoa não escreve: a sessão tem de ser da própria conta", async () => {
    const org = await orgDeHelena();
    const sessaoDeRita = await mem.bruto.query<{ id: string }>(
      `SELECT s.id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE u.email = 'rita.lopes@serraalta.exemplo.gov.br' AND s.revogada_em IS NULL LIMIT 1`,
    );
    const sidDeRita = sessaoDeRita.rows[0]!.id;
    const forjado = await emitirAcesso(
      new TextEncoder().encode(SEGREDO),
      { sub: HELENA, org, papel: "coordenador", nome: "Helena Vasques Coutinho", sid: sidDeRita },
      15,
    );
    const r = await escrever(forjado);
    expect(r.statusCode, r.body).toBe(401);
    expect(r.json().erro).toBe("sessao_encerrada");
  });

  it("a organização continua vindo do token: com a vigência ligada, o município B segue sem ver a ocorrência do A (404)", async () => {
    const hash = await derivarSenha(SENHA);
    const b = await mem.bruto.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
    );
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,'Aurelio Machado','VF-1','aurelio@valefundo.exemplo.gov.br','coordenador',$2)`,
      [b.rows[0]!.id, hash],
    );
    const aurelio = await entrar("aurelio@valefundo.exemplo.gov.br");
    // Conta ativa de B escreve normalmente no que é dela e NÃO enxerga o que é do A.
    const r = await escrever(aurelio.acesso);
    expect(r.statusCode, r.body).toBe(404);
  });

  it("a senha provisória vem do banco na escrita: marca no token sem prazo no banco não tranca, e prazo no banco sem marca no token tranca", async () => {
    const org = await orgDeHelena();
    const helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    const comMarca = await emitirAcesso(
      new TextEncoder().encode(SEGREDO),
      {
        sub: HELENA, org, papel: "coordenador", nome: "Helena Vasques Coutinho",
        sid: (await mem.bruto.query<{ id: string }>(
          "SELECT id FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL ORDER BY criada_em DESC LIMIT 1",
          [HELENA],
        )).rows[0]!.id,
        sp: true,
      },
      15,
    );
    try {
      // O banco não tem prazo: a marca velha do token já não confirmada não tranca.
      const solta = await escrever(comMarca);
      expect(solta.statusCode, solta.body).toBe(200);

      // O banco tem prazo e o token não tem marca: vale o banco.
      await mem.bruto.query(
        "UPDATE usuarios SET senha_provisoria_ate = now() + interval '1 hour' WHERE id = $1", [HELENA],
      );
      const trancada = await escrever(helena.acesso);
      expect(trancada.statusCode, trancada.body).toBe(403);
      expect(trancada.json().erro).toBe("troca_de_senha_obrigatoria");
    } finally {
      await mem.bruto.query("UPDATE usuarios SET senha_provisoria_ate = NULL WHERE id = $1", [HELENA]);
    }
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
    expect(r.json().erro).toBe("sessao_encerrada");

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
