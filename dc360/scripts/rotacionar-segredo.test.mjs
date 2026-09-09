/**
 * Os dois procedimentos do segredo de sessão são OPOSTOS, e este arquivo existe
 * para que a diferença não dependa de alguém lembrar dela às três da manhã.
 *
 * O defeito que ele tranca não é de código, é de operação: aplicar o plano de
 * ROTAÇÃO num caso de VAZAMENTO. Os dois mexem na mesma variável, os dois
 * "colocam o segredo novo na frente", e o segundo tem uma diferença que decide
 * tudo: o segredo comprometido tem que SUMIR da lista. Se ele ficar, o invasor
 * continua fabricando token de administrador pela janela inteira, e ninguém vê
 * nada acontecer.
 *
 * Roda no executor embutido do node (`node --test`), pelo mesmo motivo dos
 * outros testes daqui: `scripts/` não é workspace e não tem `node_modules`.
 *
 * Rodar:  npm run test:scripts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MAXIMO_DE_SEGREDOS, gerarSegredo, planoDeRevogacao, planoDeRotacao, separar,
} from "./rotacionar-segredo.mjs";

const VELHO = "segredo-velho-de-rotacao-com-mais-de-32-bytes";
const VAZADO = "segredo-que-vazou-com-mais-de-trinta-e-dois-bytes";

test("o segredo gerado passa no mínimo que a API exige e não parte a lista", () => {
  const s = gerarSegredo();
  assert.ok(s.length >= 32, `curto demais: ${s.length}`);
  // Vírgula é o separador da lista: um segredo que a contivesse viraria dois
  // segredos curtos, e a partida recusaria por um motivo que ninguém entenderia.
  assert.ok(!s.includes(","));
});

test("rotação: o novo entra na frente e o antigo continua aceito", () => {
  const plano = planoDeRotacao(VELHO, "segredo-novinho-de-rotacao-com-mais-de-32");
  assert.deepEqual(separar(plano.durante), [
    "segredo-novinho-de-rotacao-com-mais-de-32", VELHO,
  ]);
  // Ninguém é derrubado no passo 1: é isso que faz a rotação acontecer de
  // verdade em vez de ser adiada para sempre.
  assert.ok(plano.durante.includes(VELHO));
});

test("rotação: o passo 2 aposenta o antigo, senão a troca ficou pela metade", () => {
  const plano = planoDeRotacao(VELHO, "segredo-novinho-de-rotacao-com-mais-de-32");
  assert.deepEqual(separar(plano.depois), ["segredo-novinho-de-rotacao-com-mais-de-32"]);
  assert.ok(!plano.depois.includes(VELHO));
});

test("rotação: recusa quando a lista passaria do teto", () => {
  const cheia = Array.from({ length: MAXIMO_DE_SEGREDOS }, (_, i) =>
    `segredo-numero-${i}-com-mais-de-trinta-e-dois-bytes`).join(",");
  assert.throws(() => planoDeRotacao(cheia), /teto é 3/);
});

test("revogação: o segredo vazado SAI DA LISTA, e é aqui que os dois planos divergem", () => {
  const atual = `${VAZADO},${VELHO}`;
  const plano = planoDeRevogacao(atual, VAZADO, "segredo-de-emergencia-com-mais-de-32-bytes");

  // A asserção que importa: o comprometido não aparece em lugar nenhum.
  assert.ok(
    !plano.agora.includes(VAZADO),
    "o segredo vazado continuou na lista: enquanto ele for aceito, quem o tem "
    + "fabrica token de administrador de qualquer município",
  );
  assert.equal(separar(plano.agora)[0], "segredo-de-emergencia-com-mais-de-32-bytes");
  // O outro segredo, que não vazou, continua: derrubar quem não precisa ser
  // derrubado não aumenta segurança nenhuma.
  assert.ok(plano.agora.includes(VELHO));
});

test("revogação: recusa quando o valor apontado não está na lista", () => {
  // Revogar o segredo errado é o pior desfecho possível: derruba todo mundo E
  // deixa o comprometido valendo.
  assert.throws(
    () => planoDeRevogacao(VELHO, "isto-nao-esta-na-lista-e-tem-mais-de-32-bytes"),
    /não está na lista atual/,
  );
});
