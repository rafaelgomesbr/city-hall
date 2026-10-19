import { afterEach, expect } from "vitest";
import { lerDesviosDaGuarda } from "../src/guarda-de-codigos-de-erro.js";

/**
 * O "falha alto" da guarda das respostas de acesso (V2-F00-E05, correção 3).
 *
 * Em teste, a guarda (`src/guarda-de-codigos-de-erro.ts`) troca toda resposta
 * 401 ou 403 fora do catálogo por um 500 e registra o desvio. Um 500 sozinho
 * reprovaria só o teste que confere o status; este apoio reprova QUALQUER caso
 * que tenha passado por um desvio, confira ele o que conferir. O teste da
 * própria guarda lê e esvazia os desvios que provoca de propósito.
 */
afterEach(() => {
  const desvios = lerDesviosDaGuarda();
  expect(desvios, "resposta 401 ou 403 fora do catálogo de códigos de erro (guarda em tempo de execução)").toEqual([]);
});
