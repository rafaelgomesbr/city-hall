import Constants from "expo-constants";
import { cabecalhosDaVersao } from "@dc360/campo";

/**
 * A versão deste binário e o cabeçalho que a leva à API (V2-F02-E06).
 *
 * A versão é a do `expoConfig.version` (o `version` de `app.config.ts`, a
 * mesma que o perfil mostra). Todo pedido do aplicativo à API leva
 * `x-app-version: campo/<versão>`: as chamadas de `api.ts`, as de `rota.ts`,
 * `mapa.ts` e `historico-da-casa.ts`, e o transporte da fila, que recebe a
 * versão por parâmetro (`fila.ts`). As URLs assinadas do armazenamento não
 * levam: não falam com a API, e os cabeçalhos delas entram na assinatura.
 *
 * Mora num arquivo próprio, e não em `api.ts`, porque vários testes dublam
 * `./api` inteiro; um dublê que não conhecesse esta função quebraria o pedido
 * do mapa ou do histórico sem motivo.
 */
export function versaoDoAplicativo(): string | null {
  const versao = Constants.expoConfig?.version;
  return typeof versao === "string" && versao.trim() !== "" ? versao.trim() : null;
}

/** `{ "x-app-version": "campo/<versão>" }`, ou vazio quando a versão não é conhecida. */
export function cabecalhoDaVersao(): Record<string, string> {
  return cabecalhosDaVersao(versaoDoAplicativo());
}
