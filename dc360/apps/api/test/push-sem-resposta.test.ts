import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { criarProvedorFcm } from "../src/push/fcm.js";
import { montarAviso } from "../src/push/mensagem.js";
import type { Trava } from "../src/push/trava.js";
import { agendarVarredura, varrerAvisos } from "../src/push/varredor.js";

/**
 * O servidor que aceita a conexão e nunca responde.
 *
 * Este é o modo de falha comum de rede móvel e de balanceador saturado, e era
 * o buraco do caminho do Google. O `fetch` global do Node NÃO tem tempo
 * limite: o caminho da Apple foi protegido (`setTimeout` de dez segundos em
 * `apns.ts`), e o do Google caiu no `fetch` cru, nem na troca do token nem no
 * envio.
 *
 * O estrago não é a notificação perdida. O varredor segura uma trava de aviso
 * do Postgres durante a rodada e só a solta no `finally`; com o `await` preso
 * para sempre, o `finally` nunca roda, a trava nunca é solta, e a outra máquina
 * do Fly desiste de todas as rodadas seguintes. O aviso de prazo para de sair
 * do produto INTEIRO, nas duas máquinas, sem uma linha de log, sem falha de
 * health check e sem alerta, até alguém reimplantar por outro motivo.
 *
 * Por isso este arquivo cobra três tetos, e não um: por chamada, pela rodada
 * inteira, e o vigia que solta a trava quando nem a rodada termina. Os dois
 * primeiros são cooperativos, ou seja, dependem de o laço continuar rodando; o
 * terceiro é o único que cobre a promessa que nunca resolve.
 */

const AVISO = montarAviso("prazo_vencendo", {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "11111111-1111-4111-8111-0000000000c3",
  severidade: "critica",
  prazoEm: "2026-09-09T23:00:00.000Z",
});

/** Uma promessa que nunca resolve nem rejeita: o servidor mudo. */
const NUNCA_RESPONDE = () => new Promise<never>(() => {});

describe("FCM: a chamada que nao volta", () => {
  function contaDeTeste() {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    return {
      project_id: "dc360-exemplo",
      client_email: "push@dc360-exemplo.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      token_uri: "https://oauth2.exemplo/token",
    };
  }

  it("a troca do token de acesso desiste no tempo limite", async () => {
    /*
      A troca é a mais perigosa das duas chamadas: ela acontece uma vez e
      prende a rodada inteira ANTES de a primeira notificação sequer ser
      tentada. Sem o teto, este `await` não retornava nunca, e o teste
      simplesmente estourava o tempo do vitest.
    */
    const conta = contaDeTeste();
    const provedor = criarProvedorFcm(conta, { buscar: NUNCA_RESPONDE, tempoLimiteMs: 60 });

    const erro = await provedor.enviar("ficha-do-diego", AVISO).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/tempo limite/);
  }, 10_000);

  it("o envio desiste no tempo limite mesmo com o token ja trocado", async () => {
    const conta = contaDeTeste();
    const provedor = criarProvedorFcm(conta, {
      tempoLimiteMs: 60,
      buscar: async (url, o) => {
        if (url === conta.token_uri) {
          return {
            status: 200,
            text: async () => JSON.stringify({ access_token: "acesso-de-teste", expires_in: 3600 }),
          };
        }
        return NUNCA_RESPONDE() as never as { status: number; text(): Promise<string> };
        // `o` existe só para a assinatura casar com a real.
        void o;
      },
    });

    const erro = await provedor.enviar("ficha-do-diego", AVISO).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/tempo limite/);
  }, 10_000);

  it("resposta dentro do tempo continua passando", async () => {
    /*
      Contraponto obrigatório: sem ele, um teto quebrado que rejeitasse toda
      chamada passaria nos dois casos acima, e a suíte ficaria verde provando
      que o push nunca funciona.
    */
    const conta = contaDeTeste();
    const provedor = criarProvedorFcm(conta, {
      tempoLimiteMs: 5_000,
      buscar: async (url) => (url === conta.token_uri
        ? { status: 200, text: async () => JSON.stringify({ access_token: "t", expires_in: 3600 }) }
        : { status: 200, text: async () => "{}" }),
    });

    expect(await provedor.enviar("ficha-do-diego", AVISO))
      .toEqual({ desfecho: "entregue", detalhe: null });
  }, 10_000);
});

describe("A rodada inteira tem teto, e a trava nao fica presa", () => {
  let mem: BancoEmMemoria;
  let orgA: string;
  let equipeA: string;

  /** Trava de mentira que conta as posses e as soltas. */
  function travaEspia(): Trava & { posses: number; soltas: number } {
    const estado = {
      posses: 0,
      soltas: 0,
      async tentar() { estado.posses += 1; return true; },
      async soltar() { estado.soltas += 1; },
      async encerrar() {},
    };
    return estado;
  }

  async function registrarAgenteComAparelho(nome: string, matricula: string, ficha: string) {
    const u = await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id)
       VALUES ($1,$2,$3,$4,'agente_campo',$5) RETURNING id`,
      [orgA, nome, matricula, `${matricula.toLowerCase()}@serraalta.exemplo.gov.br`, equipeA],
    );
    await mem.bruto.query(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'ios',$3)`,
      [orgA, u.rows[0]!.id, ficha],
    );
  }

  beforeEach(async () => {
    mem = await bancoEmMemoria({ semear: false });
    const org = await mem.bruto.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
    );
    orgA = org.rows[0]!.id;
    const eq = await mem.bruto.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Alfa') RETURNING id", [orgA],
    );
    equipeA = eq.rows[0]!.id;
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (organizacao_id,protocolo,tipo,status,severidade,endereco,solicitante_nome,
          canal_entrada,descricao,equipe_id,prazo_em)
       VALUES ($1,'000417/2026','deslizamento','em_campo','critica','Servidão Boa Esperança, 148',
               'Marilda Nogueira','telefone','Talude cedeu',$2, now() + interval '20 minutes')`,
      [orgA, equipeA],
    );
    for (const [i, ficha] of ["ficha-1", "ficha-2", "ficha-3", "ficha-4"].entries()) {
      await registrarAgenteComAparelho(`Agente ${i + 1}`, `SA-${i + 10}`, ficha);
    }
  }, 180_000);

  afterEach(async () => {
    await mem?.banco.encerrar();
  });

  it("para no teto de tempo em vez de varrer a fila inteira devagar", async () => {
    /*
      O cenário é a noite em que o provedor engasga: com o teto de 500
      notificações por rodada e dez segundos por envio, uma rodada inteira em
      falha prende a trava por mais de uma hora. Nesse tempo a outra máquina do
      Fly desiste de dezenas de rodadas, e o produto fica sem avisar prazo.

      O relógio é injetado para o teste medir isso sem gastar o tempo de
      verdade: cada envio "custa" 30 segundos de relógio de mentira.
    */
    let relogio = 0;
    const trava = travaEspia();
    const tentadas: string[] = [];

    const resumo = await varrerAvisos({
      banco: mem.banco,
      trava,
      janelaMinutos: 60,
      agora: () => relogio,
      tempoLimiteDaRodadaMs: 60_000,
      enviar: async (alvo) => {
        tentadas.push(alvo.ficha);
        relogio += 30_000;
        return { desfecho: "entregue", detalhe: null };
      },
    });

    expect(resumo.reivindicadas).toBe(4);
    // Duas cabem no minuto; a terceira já encontra o teto estourado.
    expect(tentadas).toHaveLength(2);
    expect(resumo.adiadasPorTempo).toBe(2);

    // O que importa tanto quanto parar: a trava foi SOLTA. Sem isso a máquina
    // seguinte desistiria de todas as rodadas seguintes.
    expect(trava.soltas).toBe(1);
  }, 180_000);

  it("rodada rapida nao e interrompida", () => {
    // Contraponto: um teto quebrado que cortasse sempre passaria no caso acima
    // e faria o produto parar de avisar prazo a partir da segunda notificação.
    let relogio = 0;
    const trava = travaEspia();
    const tentadas: string[] = [];

    return varrerAvisos({
      banco: mem.banco,
      trava,
      janelaMinutos: 60,
      agora: () => relogio,
      tempoLimiteDaRodadaMs: 60_000,
      enviar: async (alvo) => {
        tentadas.push(alvo.ficha);
        relogio += 10;
        return { desfecho: "entregue", detalhe: null };
      },
    }).then((resumo) => {
      expect(tentadas).toHaveLength(4);
      expect(resumo.adiadasPorTempo).toBe(0);
      expect(resumo.entregues).toBe(4);
    });
  }, 180_000);

  it("a rodada que nao termina tem a trava solta pelo vigia", async () => {
    /*
      Este é o caso que nem o teto por chamada nem o teto por rodada cobrem:
      os dois são cooperativos e dependem de o laço continuar rodando. Aqui o
      envio nunca resolve nem rejeita, então o `finally` do `varrerAvisos` NÃO
      executa, e sem o vigia a trava ficaria presa até o processo morrer,
      calando o aviso de prazo nas duas máquinas do Fly.
    */
    const trava = travaEspia();
    const agendada = agendarVarredura(
      {
        banco: mem.banco,
        trava,
        janelaMinutos: 60,
        tempoLimiteDaRodadaMs: 40,
        enviar: NUNCA_RESPONDE,
      },
      20,
    );

    try {
      // O vigia dispara no dobro do teto da rodada. Esperar por condição, e
      // não por tempo fixo, para o caso não ficar intermitente em runner lento.
      await vi.waitFor(
        () => expect(
          trava.soltas,
          "a rodada travou para sempre e a trava nunca foi solta: a outra máquina "
          + "do Fly desistiria de todas as rodadas seguintes",
        ).toBeGreaterThan(0),
        { timeout: 5_000, interval: 10 },
      );
    } finally {
      await agendada.parar();
    }
  }, 180_000);
});
