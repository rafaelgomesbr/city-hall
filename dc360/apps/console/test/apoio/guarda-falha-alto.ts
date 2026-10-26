import { afterAll, afterEach, expect } from "vitest";
import { lerDesviosDaGuarda } from "../../src/guarda-de-codigos-de-erro.js";

/**
 * O "falha alto" da guarda das respostas de acesso do console (V2-F00-E05,
 * correção 3): caso que passou por uma resposta 401 ou 403 fora do contrato
 * reprova, confira ele o que conferir. Ver `src/guarda-de-codigos-de-erro.ts`.
 */
afterEach(() => {
  const desvios = lerDesviosDaGuarda();
  expect(desvios, "resposta 401 ou 403 fora do contrato do console (guarda em tempo de execução)").toEqual([]);
});

/*
  E o que sair num `afterAll` do arquivo (um servidor encerrando, uma sonda final):
  este `afterAll` é registrado antes dos do arquivo e, na ordem de pilha do vitest,
  roda depois deles.
*/
afterAll(() => {
  const desvios = lerDesviosDaGuarda();
  expect(desvios, "resposta 401 ou 403 fora do catálogo num afterAll (guarda em tempo de execução)").toEqual([]);
});
