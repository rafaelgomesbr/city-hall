import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { montarAviso } from "../src/push/mensagem.js";
import { criarProvedorApns } from "../src/push/apns.js";
import { criarProvedorFcm } from "../src/push/fcm.js";

/*
  Som e canal SAEM DA SEVERIDADE, e nao sao conforto.

  Prazo de severidade baixa tocando as tres da manha e como se ensina um agente
  a silenciar o aplicativo inteiro nos ajustes do sistema. A partir dai o aviso
  de severidade CRITICA tambem nao toca, e o silencio de um aviso que nao
  importava passa a custar o silencio de todos.

  Dois defeitos que estes testes travam, os dois encontrados na revisao do turno
  T8, depois que a metade aplicativo ficou pronta:

  1. No iOS o servidor mandava `aps.sound = "default"` sem olhar a severidade.
  2. No Android o servidor nao mandava `channelId` nenhum, entao os dois canais
     que o aplicativo declara nao roteavam nada: tudo caia no canal padrao.
     A regra e do proprio expo-notifications, que le
     `remoteMessage.notification?.channelId ?: remoteMessage.data["channelId"]`.
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

/** Intercepta o corpo enviado, sem falar com a Apple. */
function capturarApns() {
  const enviados: string[] = [];
  const provedor = criarProvedorApns(
    { keyId: "K", teamId: "T", bundle: "com.exemplo.app", chavePem: chaveEc() },
    {
      transporte: async (pedido) => { enviados.push(pedido.corpo); return { status: 200, corpo: "" }; },
    },
  );
  return { provedor, enviados };
}

/** Intercepta o corpo enviado, sem falar com o Google. */
function capturarFcm() {
  const conta = contaDeTeste();
  const enviados: string[] = [];
  const provedor = criarProvedorFcm(conta, {
    buscar: async (url, o) => {
      if (url === conta.token_uri) {
        return {
          status: 200,
          text: async () => JSON.stringify({ access_token: "acesso-de-teste", expires_in: 3600 }),
        };
      }
      enviados.push(o.body);
      return { status: 200, text: async () => "{}" };
    },
  });
  return { provedor, enviados };
}

const DETALHE = {
  organizacaoId: "11111111-1111-4111-8111-111111111111",
  ocorrenciaId: "22222222-2222-4222-8222-222222222222",
  prazoEm: "2026-09-10T12:00:00.000Z",
};

describe("os nomes de canal batem entre servidor e aplicativo", () => {
  it("o servidor manda exatamente os canais que o aplicativo declara", () => {
    /*
      Se um lado renomear o canal, o Android NAO reclama: ele joga a
      notificacao no canal padrao, em silencio. Um defeito que nao aparece em
      lugar nenhum ate alguem no plantao noturno perder um aviso critico.
    */
    const doAplicativo = readFileSync(
      new URL("../../campo/src/push/canais.ts", import.meta.url), "utf8",
    );
    const doServidor = readFileSync(new URL("../src/push/fcm.ts", import.meta.url), "utf8");
    for (const canal of ["dc360.urgencia.v1", "dc360.comum.v1"]) {
      expect(doAplicativo, `o aplicativo nao declara ${canal}`).toContain(canal);
      expect(doServidor, `o servidor nao manda ${canal}`).toContain(canal);
    }
  });
});

describe("Android: o canal sai da severidade", () => {
  for (const [severidade, esperado] of [
    ["critica", "dc360.urgencia.v1"],
    ["alta", "dc360.urgencia.v1"],
    ["media", "dc360.comum.v1"],
    ["baixa", "dc360.comum.v1"],
    [null, "dc360.comum.v1"],
  ] as const) {
    it(`severidade ${severidade ?? "ausente"} vai para ${esperado}`, async () => {
      const { provedor, enviados } = capturarFcm();
      await provedor.enviar("ficha-de-teste", montarAviso("prazo_vencendo", { ...DETALHE, severidade }));
      expect(JSON.parse(enviados[0]!).message.data.channelId).toBe(esperado);
    });
  }
});

describe("iOS: o som sai da severidade", () => {
  it("severidade critica toca, e fura o Foco do sistema", async () => {
    const { provedor, enviados } = capturarApns();
    await provedor.enviar("ficha", montarAviso("prazo_vencendo", { ...DETALHE, severidade: "critica" }));
    const aps = JSON.parse(enviados[0]!).aps;
    expect(aps.sound).toBe("default");
    expect(aps["interruption-level"]).toBe("time-sensitive");
  });

  it("severidade baixa NAO toca", async () => {
    const { provedor, enviados } = capturarApns();
    await provedor.enviar("ficha", montarAviso("prazo_vencendo", { ...DETALHE, severidade: "baixa" }));
    const aps = JSON.parse(enviados[0]!).aps;
    expect(aps.sound).toBeUndefined();
    expect(aps["interruption-level"]).toBe("active");
  });

  it("severidade ausente cai no silencio, e nao no som", async () => {
    // Errar para o lado do som e o erro que nao tem volta: o agente silencia o
    // aplicativo inteiro e nunca mais desfaz.
    const { provedor, enviados } = capturarApns();
    await provedor.enviar("ficha", montarAviso("tarefa_nova", { ...DETALHE, severidade: null }));
    expect(JSON.parse(enviados[0]!).aps.sound).toBeUndefined();
  });
});
