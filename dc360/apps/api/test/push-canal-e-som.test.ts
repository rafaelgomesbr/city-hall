import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { montarAviso } from "../src/push/mensagem.js";
import { criarProvedorApns } from "../src/push/apns.js";
import { criarProvedorFcm } from "../src/push/fcm.js";

/*
  DESPACHO TOCA SEMPRE; PRAZO TOCA POR SEVERIDADE. Nenhum dos dois e conforto.

  A decisao de 15/09/2026, na letra de quem paga: o celular do agente de campo
  deve obrigatoriamente ser notificado, vibrado ou sonoro, de que recebeu uma
  nova ocorrencia, com som caracteristico. Isso vale para TODA severidade do
  aviso de tarefa nova: despacho e uma pessoa decidindo agora que esta equipe
  vai, e quem despacha as tres da manha precisa da equipe as tres da manha.

  O prazo continua na regra anterior, pelo argumento anterior: prazo e relogio,
  e prazo de severidade baixa tocando as tres da manha e como se ensina um
  agente a silenciar o aplicativo inteiro nos ajustes do sistema. A partir dai
  o aviso de severidade CRITICA tambem nao toca.

  Dois defeitos que estes testes travam desde a revisao do turno T8:

  1. No iOS o servidor mandava `aps.sound = "default"` sem olhar a severidade.
  2. No Android o servidor nao mandava `channelId` nenhum, entao os canais que
     o aplicativo declara nao roteavam nada: tudo caia no canal padrao.
     A regra e do proprio expo-notifications, que le
     `remoteMessage.notification?.channelId ?: remoteMessage.data["channelId"]`.
     E o SDK do Firebase, que desenha a notificacao com o aplicativo fechado,
     le `android.notification.channel_id`. Os dois precisam ir.
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

describe("os nomes de canal e de som batem entre servidor e aplicativo", () => {
  it("o servidor manda exatamente os canais que o aplicativo declara", () => {
    /*
      Se um lado renomear o canal, o Android NAO reclama: ele joga a
      notificacao no canal padrao, em silencio. Um defeito que nao aparece em
      lugar nenhum ate alguem no plantao noturno perder um aviso critico.
    */
    const doAplicativo = readFileSync(
      new URL("../../campo/src/push/canais.ts", import.meta.url), "utf8",
    );
    const doServidor = readFileSync(new URL("../src/push/mensagem.ts", import.meta.url), "utf8");
    for (const canal of ["dc360.despacho.v1", "dc360.urgencia.v1", "dc360.comum.v1"]) {
      expect(doAplicativo, `o aplicativo nao declara ${canal}`).toContain(canal);
      expect(doServidor, `o servidor nao manda ${canal}`).toContain(canal);
    }
  });

  it("o som de despacho que o servidor pede e o arquivo que o aplicativo declara", () => {
    /*
      O iOS procura `aps.sound` pelo nome do arquivo no bundle; se o nome nao
      existir la, toca o som padrao sem avisar. O aplicativo declara o arquivo
      em `app.config.ts` (`sounds`) e o nome em `canais.ts`.
    */
    const doAplicativo = readFileSync(
      new URL("../../campo/src/push/canais.ts", import.meta.url), "utf8",
    );
    const configDoAplicativo = readFileSync(
      new URL("../../campo/app.config.ts", import.meta.url), "utf8",
    );
    const doServidor = readFileSync(new URL("../src/push/mensagem.ts", import.meta.url), "utf8");
    expect(doServidor).toContain('"despacho.wav"');
    expect(doAplicativo).toContain('"despacho.wav"');
    expect(configDoAplicativo).toContain("./assets/sons/despacho.wav");
  });
});

describe("Android: a tarefa nova vai para o canal de despacho em toda severidade", () => {
  for (const severidade of ["critica", "alta", "media", "baixa", null] as const) {
    it(`severidade ${severidade ?? "ausente"}: canal de despacho, som, prioridade alta`, async () => {
      const { provedor, enviados } = capturarFcm();
      await provedor.enviar("ficha-de-teste", montarAviso("tarefa_nova", { ...DETALHE, severidade }));
      const mensagem = JSON.parse(enviados[0]!).message;
      // Para o expo-notifications, que desenha com o aplicativo aberto.
      expect(mensagem.data.channelId).toBe("dc360.despacho.v1");
      // Para o SDK do Firebase, que desenha com o aplicativo fechado.
      expect(mensagem.android.notification.channel_id).toBe("dc360.despacho.v1");
      // Nome de recurso em res/raw: sem extensao, e o mesmo arquivo do iOS.
      expect(mensagem.android.notification.sound).toBe("despacho");
      expect(mensagem.android.notification.notification_priority).toBe("PRIORITY_MAX");
      expect(mensagem.android.priority).toBe("high");
    });
  }
});

describe("Android: o prazo continua saindo da severidade", () => {
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
      const mensagem = JSON.parse(enviados[0]!).message;
      expect(mensagem.data.channelId).toBe(esperado);
      expect(mensagem.android.notification.channel_id).toBe(esperado);
      // O prazo nao leva o som de despacho: o canal dele decide (som do
      // sistema na urgencia, silencio no comum).
      expect(mensagem.android.notification.sound).toBeUndefined();
    });
  }
});

describe("iOS: a tarefa nova toca o som de despacho em toda severidade, e fura o Foco", () => {
  for (const severidade of ["critica", "alta", "media", "baixa", null] as const) {
    it(`severidade ${severidade ?? "ausente"} toca despacho.wav como sensivel ao tempo`, async () => {
      const { provedor, enviados } = capturarApns();
      await provedor.enviar("ficha", montarAviso("tarefa_nova", { ...DETALHE, severidade }));
      const aps = JSON.parse(enviados[0]!).aps;
      expect(aps.sound).toBe("despacho.wav");
      expect(aps["interruption-level"]).toBe("time-sensitive");
    });
  }
});

describe("iOS: o prazo continua saindo da severidade", () => {
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
    // aplicativo inteiro e nunca mais desfaz. (Era `tarefa_nova` ate
    // 15/09/2026; a tarefa nova agora toca sempre, e o caso passou a ser o
    // prazo, que e o unico que continua nesta regra.)
    const { provedor, enviados } = capturarApns();
    await provedor.enviar("ficha", montarAviso("prazo_vencendo", { ...DETALHE, severidade: null }));
    const aps = JSON.parse(enviados[0]!).aps;
    expect(aps.sound).toBeUndefined();
    expect(aps["interruption-level"]).toBe("active");
  });
});
