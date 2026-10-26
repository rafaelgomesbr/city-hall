/**
 * O QUE SAI NO FIO quando o aplicativo registra o aparelho: a ficha, a
 * plataforma e, desde 15/09/2026, o AMBIENTE da APNs com que este binário
 * fala.
 *
 * O servidor guarda o ambiente por aparelho (migração 044) e roteia cada
 * ficha para a APNs certa. Mandar o campo errado, ou mandar um chute no lugar
 * de "não sei", é o que faz a ficha do sandbox ir para a APNs de produção,
 * que responde `BadDeviceToken` e faz o varredor revogar o aparelho de quem
 * está em campo. Por isso o "não sei" viaja como AUSÊNCIA do campo, e o
 * servidor cai no padrão dele.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

import { registrarAparelho } from "./api";

let pedido: { url: string; opcoes: RequestInit } | null = null;

beforeEach(() => {
  pedido = null;
  globalThis.fetch = (async (url: string, opcoes: RequestInit) => {
    pedido = { url, opcoes };
    return { status: 200, ok: true, json: async () => ({ id: "x", registrado: true }) };
  }) as unknown as typeof fetch;
});

function corpoEnviado(): Record<string, unknown> {
  return JSON.parse(String(pedido?.opcoes.body)) as Record<string, unknown>;
}

it("o binário do Xcode registra `teste`, o da loja registra `producao`", async () => {
  await registrarAparelho("token", "ios", "ficha-do-xcode", "teste");
  expect(pedido?.url).toBe("https://api.exemplo.test/v1/aparelhos");
  expect(corpoEnviado()).toEqual({ plataforma: "ios", ficha: "ficha-do-xcode", ambiente: "teste" });

  await registrarAparelho("token", "ios", "ficha-da-loja", "producao");
  expect(corpoEnviado()).toEqual({ plataforma: "ios", ficha: "ficha-da-loja", ambiente: "producao" });
});

it("quando o binário não sabe, o campo NÃO vai: nem vazio, nem chute", async () => {
  await registrarAparelho("token", "ios", "ficha-antiga", null);
  expect(corpoEnviado()).toEqual({ plataforma: "ios", ficha: "ficha-antiga" });

  await registrarAparelho("token", "android", "ficha-android");
  expect(corpoEnviado()).toEqual({ plataforma: "android", ficha: "ficha-android" });
});
