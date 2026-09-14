import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { COFRE, CONTA, HOST, montarUrl } from "./migrar-producao.mjs";

/**
 * A MONTAGEM DA URL, que é a parte que erra em silêncio.
 *
 * Senha gerada por provedor não é alfanumérica: ela sai com `@`, `/`, `#`, `?`
 * e `:`. Interpolada crua numa URL, qualquer um deles muda o SIGNIFICADO da
 * string, e o erro que volta não fala de senha.
 *
 * O caso mais cruel é o `@`: o analisador de URL passa a achar que o host
 * começa ali, então `postgres:aB@y@host` vira usuário `postgres`, senha `aB`,
 * host `y@host`. O erro que sai é de host que não existe, e quem lê aquilo vai
 * conferir DNS por meia hora.
 */
test("senha com caractere que parte a URL continua chegando inteira", () => {
  const senha = "aB#3/x@y?z:w";
  const url = new URL(montarUrl(senha));

  assert.equal(url.username, "postgres");
  assert.equal(decodeURIComponent(url.password), senha);
  assert.equal(url.hostname, HOST, "o host mudou: a senha invadiu o endereço");
});

test("senha comum passa sem enfeite", () => {
  const url = new URL(montarUrl("abc123"));

  assert.equal(url.password, "abc123");
  assert.equal(url.port, "5432");
});

/*
  O papel é `postgres`, e não o do `.env`. A `DATABASE_URL` da API é do papel de
  APLICAÇÃO, que tem USAGE no schema e não tem CREATE, de propósito: se ela
  pudesse alterar esquema, uma falha na API viraria alteração de banco. Foi
  exatamente essa troca que produziu o "permission denied for schema public"
  que manda procurar policy, RLS e dono de tabela, que é onde o problema não
  está.
*/
test("migra com o papel de setup, nunca com o da aplicação", () => {
  assert.equal(new URL(montarUrl("x")).username, "postgres");
  assert.doesNotMatch(montarUrl("x"), /dc360_api/);
});

/*
  `verify-full` escrito na URL, e não subentendido. Sem ele a conexão fica
  cifrada e NÃO autenticada: quem se colocasse no caminho apresentaria
  certificado próprio e a migração subiria igual, porque o SCRAM só
  retransmite desafio e resposta. Foi o buraco de 09/09/2026, reaberto uma vez
  pela omissão desta palavra numa variável de ambiente.
*/
test("a URL exige verificação do certificado, e diz isso por escrito", () => {
  assert.equal(new URL(montarUrl("x")).searchParams.get("sslmode"), "verify-full");
});

/*
  Conexão DIRETA e não o pooler. O pooler serve a aplicação, que abre e fecha
  conexão o tempo todo; migração é uma sessão longa que altera esquema, e o
  caminho direto é o que o provedor documenta para isso.
*/
test("aponta para a conexão direta, e não para o pooler", () => {
  assert.match(HOST, /^db\./);
  assert.doesNotMatch(HOST, /pooler/);
});

test("o nome do cofre e da conta são os mesmos que a mensagem de ajuda ensina", () => {
  /*
    Parece bobo e não é: a mensagem que ensina a guardar a senha e o código que
    a procura são dois lugares dizendo a mesma coisa. No dia em que um mudar, a
    pessoa guarda a senha num lugar e o roteiro procura no outro, e a mensagem
    de erro diz exatamente o comando que ela acabou de rodar.
  */
  const fonte = readFileSync(new URL("./migrar-producao.mjs", import.meta.url), "utf8");
  assert.match(fonte, new RegExp(`add-generic-password -a \\$\\{CONTA\\}`));
  assert.match(fonte, new RegExp(`-s \\$\\{COFRE\\}`));
  assert.equal(typeof CONTA, "string");
  assert.equal(typeof COFRE, "string");
});
