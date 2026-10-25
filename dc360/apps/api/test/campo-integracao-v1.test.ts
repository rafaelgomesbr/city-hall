/**
 * A fila de campo contra a API, falando com `/v1` (V2-F02-E01).
 *
 * `campo-integracao.test.ts` prova o caminho que o aplicativo já instalado
 * usa: SEM prefixo, o espelho legado. O aplicativo novo vai falar com `/v1`, e
 * o que ele faz (login, pendências, vistoria offline, foto, troca de senha
 * provisória, sessão que cai, município suspenso devolvendo 503 à fila) tem de
 * dar o MESMO resultado. Em vez de copiar 845 linhas, este arquivo liga o
 * prefixo e importa o outro: o arquivo original lê a variável ao carregar e
 * monta toda URL com ela, então os dois prefixos rodam as mesmas asserções.
 *
 * A URL assinada de envio de foto que a API devolve não ganha prefixo nos dois
 * casos (ela é infraestrutura, ver `ROTAS_FORA_DO_PREFIXO`).
 */
process.env["DC360_PREFIXO_DA_API_NO_TESTE"] = "/v1";

await import("./campo-integracao.test.js");
