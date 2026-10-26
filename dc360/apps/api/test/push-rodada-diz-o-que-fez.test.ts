import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import type { EnvioDePush } from "../src/push/envio.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import { agendarVarredura, varrerAvisos } from "../src/push/varredor.js";

/**
 * A RODADA DIZ O QUE FEZ, E O DESPACHO NÃO ESPERA O RELÓGIO.
 *
 * Dois defeitos de operação, achados com o push prestes a ser ligado de
 * verdade, e os dois do tipo que não acende luz nenhuma:
 *
 *   1. O varredor só escrevia no log quando uma EXCEÇÃO estourava. O desfecho
 *      `falha` (a Apple recusou com `InvalidProviderToken`, o Google com
 *      `SENDER_ID_MISMATCH`) ia para a coluna `detalhe` do banco e para lugar
 *      nenhum mais: cem por cento de recusa com o log limpo e `/saude` verde.
 *      O resumo que `varrerAvisos` devolve era jogado fora por
 *      `agendarVarredura`.
 *   2. O relógio era só `setInterval`: a primeira rodada saía cinco minutos
 *      depois da partida, e todo deploy somava cinco minutos ao despacho que
 *      caiu nesse intervalo. E o despacho, que é uma pessoa decidindo agora
 *      que esta equipe vai, esperava até cinco minutos para virar push.
 *
 * NENHUM ENVIO DE VERDADE ACONTECE AQUI. O envio é duplo de teste.
 */

let mem: BancoEmMemoria;
let orgA: string;
let agenteA: string;

type Registro = { evento: Record<string, unknown>; mensagem: string; nivel: string | undefined };

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

/*
  Espera por condição e com limite: volta assim que a condição vale e REPROVA,
  com a mensagem de `o_que`, se ela não valer no prazo. Antes o laço devolvia
  em silêncio quando o prazo estourava e a falha aparecia depois, numa
  asserção que não dizia o que tinha faltado.
*/
async function esperarAte(condicao: () => boolean, prazoMs: number, o_que: string): Promise<void> {
  await vi.waitFor(
    () => expect(condicao(), o_que).toBe(true),
    { timeout: prazoMs, interval: 10 },
  );
}

async function registrarAparelho(ficha: string): Promise<void> {
  await mem.bruto.query(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
     VALUES ($1,$2,'ios',$3)`,
    [orgA, agenteA, ficha],
  );
}

beforeEach(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  const ea = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Alfa') RETURNING id", [orgA],
  );
  const ua = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id)
     VALUES ($1,'Diego Alves','SA-3','diego@serraalta.exemplo.gov.br','agente_campo',$2)
     RETURNING id`,
    [orgA, ea.rows[0]!.id],
  );
  agenteA = ua.rows[0]!.id;
  await db.query(
    `INSERT INTO ocorrencias
       (organizacao_id,protocolo,tipo,status,severidade,endereco,solicitante_nome,
        canal_entrada,descricao,equipe_id,prazo_em)
     VALUES ($1,'000417/2026','deslizamento','em_campo','critica','Servidão Boa Esperança, 148',
             'Marilda Nogueira','telefone','Talude cedeu',$2, now() + interval '20 minutes')`,
    [orgA, ea.rows[0]!.id],
  );
}, 120_000);

afterEach(async () => {
  await mem?.banco.encerrar();
});

describe("a rodada deixa o resumo no log", () => {
  function coletor() {
    const registros: Registro[] = [];
    return {
      registros,
      registrar: (evento: Record<string, unknown>, mensagem: string, nivel?: "info" | "warn") => {
        registros.push({ evento, mensagem, nivel });
      },
    };
  }

  it("falha de envio (desfecho, não exceção) vira warn com os motivos agregados, e sem a ficha", async () => {
    /*
      O caso real: `APNS_KEY_ID` trocado. A Apple responde 403
      InvalidProviderToken para TODAS as notificações, o desfecho `falha` vai
      para o banco, e até aqui nada disso chegava ao log. O operador olhava
      `/saude` verde e um log limpo, e o agente não recebia nada.
    */
    await registrarAparelho("ficha-secreta-do-diego");
    const log = coletor();

    const resumo = await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), janelaMinutos: 60,
      enviar: async () => ({ desfecho: "falha", detalhe: "apns 403 InvalidProviderToken" }),
      registrar: log.registrar,
    });
    expect(resumo.falhas).toBe(1);

    const doResumo = log.registros.find((r) => r.evento["falhas"] === 1);
    expect(doResumo, "a rodada terminou com falha e nada foi para o log").toBeDefined();
    expect(doResumo!.nivel).toBe("warn");
    expect(doResumo!.evento["reivindicadas"]).toBe(1);
    expect(doResumo!.evento["detalhes"]).toEqual({ "apns 403 InvalidProviderToken": 1 });
    // Ficha não vai para o log: quem a tem escreve na tela bloqueada do agente.
    expect(JSON.stringify(log.registros)).not.toContain("ficha-secreta-do-diego");
  });

  it("rodada com entrega e sem falha vira info com os contadores", async () => {
    await registrarAparelho("ficha-do-diego");
    const log = coletor();

    await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), janelaMinutos: 60,
      enviar: async () => ({ desfecho: "entregue", detalhe: null }),
      registrar: log.registrar,
    });

    const doResumo = log.registros.find((r) => r.evento["reivindicadas"] === 1);
    expect(doResumo, "a rodada entregou e nada foi para o log").toBeDefined();
    expect(doResumo!.nivel).toBe("info");
    expect(doResumo!.evento["entregues"]).toBe(1);
    expect(doResumo!.evento["falhas"]).toBe(0);
  });

  it("rodada sem nada a fazer não escreve linha nenhuma: log que repete a cada cinco minutos ensina a ignorar log", async () => {
    // Sem aparelho registrado, a rodada não reivindica nada.
    const log = coletor();
    await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), janelaMinutos: 60,
      enviar: async () => ({ desfecho: "entregue", detalhe: null }),
      registrar: log.registrar,
    });
    expect(log.registros).toEqual([]);
  });

  it("a ficha recusada conta como falha no resumo, com o motivo, e o aparelho revogado conta à parte", async () => {
    await registrarAparelho("ficha-morta");
    const log = coletor();
    await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), janelaMinutos: 60,
      enviar: async () => ({ desfecho: "ficha_invalida", detalhe: "apns 400 BadDeviceToken" }),
      registrar: log.registrar,
    });
    const doResumo = log.registros.find((r) => r.evento["falhas"] === 1);
    expect(doResumo).toBeDefined();
    expect(doResumo!.nivel).toBe("warn");
    expect(doResumo!.evento["revogados"]).toBe(1);
    expect(doResumo!.evento["detalhes"]).toEqual({ "apns 400 BadDeviceToken": 1 });
  });
});

describe("o relógio: rodada na partida, despertar do despacho, e o quadro da última rodada", () => {
  const entrega: EnvioDePush = async () => ({ desfecho: "entregue", detalhe: null });
  const UMA_HORA = 60 * 60_000;

  it("a primeira rodada sai na partida, sem esperar o intervalo", async () => {
    /*
      Sem isto, todo deploy soma o intervalo inteiro ao despacho que caiu
      nele: a rota enfileira, o processo novo sobe, e o aviso espera cinco
      minutos por um `setInterval` que ainda não bateu.
    */
    await registrarAparelho("ficha-do-diego");
    const trava = travaEspia();
    const agendada = agendarVarredura(
      { banco: mem.banco, trava, janelaMinutos: 60, enviar: entrega },
      UMA_HORA,
    );
    try {
      await esperarAte(() => trava.soltas >= 1, 5_000, "nenhuma rodada saiu na partida");
      expect(trava.posses, "nenhuma rodada saiu na partida").toBe(1);
    } finally {
      await agendada.parar();
    }
  });

  it("despertar() faz a rodada sair agora, sem esperar o relógio", async () => {
    const trava = travaEspia();
    const agendada = agendarVarredura(
      { banco: mem.banco, trava, janelaMinutos: 60, enviar: entrega },
      UMA_HORA,
    );
    try {
      await esperarAte(() => trava.soltas >= 1, 5_000, "a rodada da partida não terminou");
      expect(trava.posses).toBe(1);

      agendada.despertar();
      await esperarAte(() => trava.soltas >= 2, 5_000, "despertar() não produziu rodada");
      expect(trava.posses, "despertar() não produziu rodada").toBe(2);
    } finally {
      await agendada.parar();
    }
  });

  it("despertar() durante uma rodada em voo coalesce numa rodada só depois dela, nunca em paralelo", async () => {
    /*
      Três despachos em dez segundos, com a rodada da partida presa no
      provedor: o resultado certo é UMA rodada a mais quando a atual
      terminar. Não zero (o despacho que chegou depois da reivindicação ficaria
      esperando o relógio), e não três (a trava do banco e o SKIP LOCKED
      aguentariam, mas seriam idas ao banco a troco de nada).
    */
    await registrarAparelho("ficha-do-diego");
    const trava = travaEspia();
    let soltarEnvio: (() => void) | null = null;
    const envioPreso: EnvioDePush = () => new Promise((resolver) => {
      soltarEnvio = () => resolver({ desfecho: "entregue", detalhe: null });
    });

    const agendada = agendarVarredura(
      { banco: mem.banco, trava, janelaMinutos: 60, enviar: envioPreso },
      UMA_HORA,
    );
    try {
      // A rodada da partida reivindicou e está presa no envio.
      await esperarAte(() => soltarEnvio !== null, 5_000, "a rodada da partida não chegou ao envio");
      expect(trava.posses).toBe(1);
      expect(trava.soltas).toBe(0);

      agendada.despertar();
      agendada.despertar();
      agendada.despertar();
      // Janela de silêncio (ver o comentário mais abaixo): prova que NÃO abriu rodada.
      await new Promise((pronto) => { setTimeout(pronto, 50); });
      expect(trava.posses, "abriu rodada por cima da que estava em voo").toBe(1);

      soltarEnvio!();
      await esperarAte(() => trava.soltas >= 2, 5_000, "a rodada a mais não terminou");
      /*
        Janela de silêncio, e não espera por evento: aqui o teste prova que NÃO
        veio uma terceira rodada, e nada acontece para ser esperado. Esperar
        pouco só pode dar falso verde (deixar passar um defeito), nunca falso
        vermelho; por isso o tempo fixo é o instrumento certo e não é causa de
        intermitência.
      */
      await new Promise((pronto) => { setTimeout(pronto, 100); });
      expect(trava.posses).toBe(2);
      expect(trava.soltas).toBe(2);
    } finally {
      await agendada.parar();
    }
  });

  it("ultimaRodada() é nula antes da primeira rodada e traz os contadores depois", async () => {
    await registrarAparelho("ficha-do-diego");
    const trava = travaEspia();
    const antes = Date.now();
    const agendada = agendarVarredura(
      { banco: mem.banco, trava, janelaMinutos: 60, enviar: entrega },
      UMA_HORA,
    );
    try {
      expect(agendada.ultimaRodada()).toBeNull();
      await esperarAte(() => agendada.ultimaRodada() !== null, 5_000, "a rodada da partida não deixou quadro");
      const ultima = agendada.ultimaRodada()!;
      expect(ultima).toMatchObject({ reivindicadas: 1, entregues: 1, falhas: 0, revogados: 0 });
      expect(Date.parse(ultima.rodadaEm)).toBeGreaterThanOrEqual(antes);
    } finally {
      await agendada.parar();
    }
  });

  it("a rodada que perdeu a trava para a outra máquina não entra no quadro", async () => {
    /*
      Zeros de uma rodada que nem rodou pareceriam "não havia nada a enviar".
      O quadro é o que ESTA máquina fez; uma máquina que nunca ganha a trava
      fica com o quadro vazio, e isso é a verdade sobre ela.
    */
    const ocupada: Trava = {
      tentar: async () => false, soltar: async () => {}, encerrar: async () => {},
    };
    const agendada = agendarVarredura(
      { banco: mem.banco, trava: ocupada, janelaMinutos: 60, enviar: entrega },
      UMA_HORA,
    );
    try {
      // Janela de silêncio: a rodada perdida não deixa quadro, e nada a esperar.
      await new Promise((pronto) => { setTimeout(pronto, 100); });
      expect(agendada.ultimaRodada()).toBeNull();
    } finally {
      await agendada.parar();
    }
  });
});
