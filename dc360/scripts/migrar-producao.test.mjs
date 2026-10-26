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

  assert.match(url.username, /^postgres\./);
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
  /*
    Pelo pooler o nome do papel leva o projeto colado (`postgres.<projeto>`), e
    isso é exigência do provedor: é assim que ele sabe para qual banco
    encaminhar. O que importa aqui é que o papel ANTES do ponto seja `postgres`
    e não `dc360_api`.
  */
  assert.match(new URL(montarUrl("x")).username, /^postgres\./);
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
  PELO POOLER, EM MODO SESSÃO, e isto foi uma correção e não uma escolha de
  gosto.

  A primeira versão apontava para a conexão direta (`db.<projeto>.supabase.co`)
  com o argumento de que migração é sessão longa. O argumento estava certo e o
  endereço estava errado: contra a rede de verdade, em 14/09/2026, ele deu

    Error: getaddrinfo ENOTFOUND db.bppklrxxwjshxvkvwirw.supabase.co

  A causa não é queda nem bloqueio. O nome da conexão direta só tem registro
  AAAA, ou seja, só existe em IPv6:

    dig +short A    db.bppklrxxwjshxvkvwirw.supabase.co  ->  (vazio)
    dig +short AAAA db.bppklrxxwjshxvkvwirw.supabase.co  ->  2600:1f1e:c3:2702:...

  Numa rede sem IPv6, que é a da maioria das prefeituras e era a da máquina que
  rodou, aquilo é um nome que não resolve. O pooler tem IPv4.

  O que NÃO pode mudar é a porta. 5432 é modo SESSÃO: a conexão é sua do começo
  ao fim, que é o que migração precisa. 6543 é modo TRANSAÇÃO, onde a conexão é
  devolvida ao fim de cada transação e não há sessão nenhuma para segurar
  `SET ROLE`, trava de aviso ou qualquer coisa que atravesse comandos.
*/
test("vai pelo pooler, porque a conexão direta não tem IPv4", () => {
  assert.match(HOST, /pooler/);
});

test("em modo SESSÃO (5432), e nunca em modo transação (6543)", () => {
  const url = new URL(montarUrl("x"));

  assert.equal(url.port, "5432");
  assert.notEqual(url.port, "6543");
});

test("o nome do cofre e da conta são os mesmos que a mensagem de ajuda ensina", () => {
  /*
    Parece bobo e não é: a mensagem que ensina a guardar a senha e o código que
    a procura são dois lugares dizendo a mesma coisa. No dia em que um mudar, a
    pessoa guarda a senha num lugar e o roteiro procura no outro, e a mensagem
    de erro diz exatamente o comando que ela acabou de rodar.
  */
  /* A leitura do chaveiro mora em `producao.mjs` desde 15/09/2026, compartilhada
     com `copiar-producao.mjs`; a mensagem de ajuda está lá. */
  const fonte = readFileSync(new URL("./producao.mjs", import.meta.url), "utf8");
  assert.match(fonte, new RegExp(`add-generic-password -a \\$\\{CONTA\\}`));
  assert.match(fonte, new RegExp(`-s \\$\\{COFRE\\}`));
  assert.equal(typeof CONTA, "string");
  assert.equal(typeof COFRE, "string");
});

test("no Windows a senha sai do Gerenciador de Credenciais, e nunca vai na linha de comando", async () => {
  const { comandoDeLeitura, senhaDoChaveiro } = await import("./producao.mjs");
  const win = comandoDeLeitura("win32");
  assert.equal(win.programa, "powershell.exe");
  const script = win.argumentos.at(-1);
  assert.match(script, /PasswordVault/);
  assert.ok(script.includes(`Retrieve('${COFRE}','${CONTA}')`));
  assert.match(script, /OutputEncoding=\[Text\.Encoding\]::UTF8/, "senha com acento chega inteira");

  const mac = comandoDeLeitura("darwin");
  assert.equal(mac.programa, "security");
  assert.deepEqual(mac.argumentos, ["find-generic-password", "-a", CONTA, "-s", COFRE, "-w"]);

  let chamado;
  const senha = senhaDoChaveiro({
    plataforma: "win32",
    executar: (programa, argumentos) => { chamado = { programa, argumentos }; return "s3nh@#/\r\n"; },
  });
  assert.equal(senha, "s3nh@#/", "o fim de linha do Windows não entra na senha");
  assert.equal(chamado.programa, "powershell.exe");
});

test("o guia de como guardar a senha no Windows pergunta sem eco", async () => {
  const { comoGuardar } = await import("./producao.mjs");
  const guia = comoGuardar("win32");
  assert.match(guia, /Read-Host -AsSecureString/);
  assert.ok(guia.includes(`PasswordCredential('${COFRE}','${CONTA}'`));
  assert.doesNotMatch(comoGuardar("darwin"), /PowerShell/);
});

test("no Windows o npm é chamado pelo shell, porque o Node 22 recusa .cmd sem ele", () => {
  const fonte = readFileSync(new URL("./migrar-producao.mjs", import.meta.url), "utf8");
  assert.match(fonte, /shell: process\.platform === "win32"/);
});
