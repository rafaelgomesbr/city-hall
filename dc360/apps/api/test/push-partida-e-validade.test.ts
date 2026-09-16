import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { criarProvedorApns } from "../src/push/apns.js";
import { criarProvedorFcm } from "../src/push/fcm.js";
import { montarAviso } from "../src/push/mensagem.js";

/**
 * DUAS COISAS QUE A PARTIDA E O PROVEDOR PROMETIAM E NÃO FAZIAM.
 *
 * 1. `apns.ts` dizia, em comentário, que a chave inválida "sobe na partida,
 *    para o arranque falhar alto". Não subia: `importPKCS8` só rodava dentro
 *    de `tokenDeProvedor`, no PRIMEIRO ENVIO, que acontece na primeira rodada
 *    com alvo, minutos ou horas depois do deploy, e o erro virava desfecho
 *    `falha` numa linha do banco. O processo subia, `/saude` dizia `ok`, e o
 *    push não funcionava por causa de um `.p8` colado pela metade.
 *
 * 2. A notificação saía sem prazo de validade. Sem `apns-expiration` a Apple
 *    guarda por um tempo que ela escolhe; sem `android.ttl` o Google guarda
 *    por quatro semanas. Um "prazo vencendo" entregue dois dias depois, com o
 *    prazo já vencido e a ocorrência encerrada, ensina o agente a não confiar
 *    no aviso, que é o único canal que alcança quem está em campo.
 *
 * NENHUM ENVIO DE VERDADE ACONTECE AQUI.
 */

function chaveEc(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function contaDeTeste() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    project_id: "dc360-exemplo",
    client_email: "push@dc360-exemplo.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.exemplo/token",
  };
}

const AGORA = Date.parse("2026-09-15T12:00:00.000Z");
const PRAZO = "2026-09-15T12:45:00.000Z";

const DESPACHO = montarAviso("tarefa_nova", {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "33333333-3333-4333-8333-000000000009",
  severidade: "media",
  prazoEm: PRAZO,
});
const PRAZO_VENCENDO = montarAviso("prazo_vencendo", {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "33333333-3333-4333-8333-000000000009",
  severidade: "alta",
  prazoEm: PRAZO,
});

describe("a chave da Apple é conferida na partida, e não no primeiro envio", () => {
  const LIXO = "-----BEGIN PRIVATE KEY-----\nNAOEUMACHAVEDEVERDADE123456\n-----END PRIVATE KEY-----\n";

  it("validar() recusa a chave inválida com a mensagem que diz o que fazer, sem citar o material", async () => {
    const provedor = criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "b", chavePem: LIXO },
      { transporte: async () => ({ status: 200, corpo: "" }) },
    );
    await expect(provedor.validar()).rejects.toThrow(/APNS_CHAVE/);
    await expect(provedor.validar()).rejects.not.toThrow(/NAOEUMACHAVEDEVERDADE/);
  });

  it("validar() aceita a chave boa, e não gasta chamada nenhuma ao transporte", async () => {
    let chamadas = 0;
    const provedor = criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "b", chavePem: chaveEc() },
      { transporte: async () => { chamadas += 1; return { status: 200, corpo: "" }; } },
    );
    await expect(provedor.validar()).resolves.toBeUndefined();
    expect(chamadas).toBe(0);
  });

  it("a conta de serviço do Google também é conferida na partida", async () => {
    const conta = { ...contaDeTeste(), private_key: LIXO };
    const provedor = criarProvedorFcm(conta, {
      buscar: async () => ({ status: 200, text: async () => "{}" }),
    });
    await expect(provedor.validar()).rejects.toThrow(/FCM_CONTA_SERVICO/);
    await expect(provedor.validar()).rejects.not.toThrow(/NAOEUMACHAVEDEVERDADE/);
  });
});

describe("a notificação leva prazo de validade", () => {
  function apnsEspiao() {
    const pedidos: Array<{ cabecalhos: Record<string, string>; corpo: string }> = [];
    const provedor = criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "br.gov.exemplo.dc360", chavePem: chaveEc() },
      {
        agora: () => AGORA,
        transporte: async (pedido) => { pedidos.push(pedido); return { status: 200, corpo: "" }; },
      },
    );
    return { provedor, pedidos };
  }

  function fcmEspiao() {
    const conta = contaDeTeste();
    const corpos: Array<Record<string, any>> = [];
    const provedor = criarProvedorFcm(conta, {
      agora: () => AGORA,
      buscar: async (url, o) => {
        if (url === conta.token_uri) {
          return {
            status: 200,
            text: async () => JSON.stringify({ access_token: "t", expires_in: 3600 }),
          };
        }
        corpos.push(JSON.parse(o.body));
        return { status: 200, text: async () => "{}" };
      },
    });
    return { provedor, corpos };
  }

  it("APNs: o despacho vale quatro horas a partir de agora", async () => {
    /*
      Quatro horas é o tempo de um plantão sem sinal no morro. Depois disso,
      a tarefa que ainda for da equipe aparece quando o aplicativo abrir, e um
      aviso de despacho entregue no dia seguinte só confunde.
    */
    const { provedor, pedidos } = apnsEspiao();
    await provedor.enviar("ficha", DESPACHO);
    expect(pedidos[0]!.cabecalhos["apns-expiration"]).toBe(String(AGORA / 1000 + 4 * 3600));
  });

  it("APNs: o prazo vencendo vale até o prazo, porque depois dele o aviso mente", async () => {
    const { provedor, pedidos } = apnsEspiao();
    await provedor.enviar("ficha", PRAZO_VENCENDO);
    expect(pedidos[0]!.cabecalhos["apns-expiration"]).toBe(String(Date.parse(PRAZO) / 1000));
  });

  it("FCM: android.ttl é declarado, em segundos, com a mesma regra", async () => {
    const { provedor, corpos } = fcmEspiao();
    await provedor.enviar("ficha", DESPACHO);
    await provedor.enviar("ficha", PRAZO_VENCENDO);
    expect(corpos[0]!.message.android.ttl).toBe("14400s");
    // 45 minutos até o prazo.
    expect(corpos[1]!.message.android.ttl).toBe("2700s");
  });

  it("prazo já passado (relógio fora de sincronia) não vira validade negativa", async () => {
    const vencido = montarAviso("prazo_vencendo", {
      organizacaoId: "11111111-1111-4111-8111-000000000001",
      ocorrenciaId: "33333333-3333-4333-8333-000000000009",
      severidade: "alta",
      prazoEm: "2026-09-15T11:00:00.000Z",
    });
    const apns = apnsEspiao();
    await apns.provedor.enviar("ficha", vencido);
    // Validade no instante atual: entrega agora ou descarta, nunca "no passado".
    expect(Number(apns.pedidos[0]!.cabecalhos["apns-expiration"])).toBeGreaterThanOrEqual(AGORA / 1000);

    const fcm = fcmEspiao();
    await fcm.provedor.enviar("ficha", vencido);
    expect(fcm.corpos[0]!.message.android.ttl).toBe("0s");
  });
});
