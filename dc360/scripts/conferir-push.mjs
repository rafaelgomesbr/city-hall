#!/usr/bin/env node
/**
 * Fala com a APNs e com o FCM DE VERDADE, e diz se a credencial serve.
 *
 * ## Por que este roteiro existe
 *
 * O plano de execução dizia, com todas as letras, que o transporte de push
 * "está escrito e comentado como não exercitado": nenhum envio real tinha sido
 * feito, nem para a Apple nem para o Google. Toda a prova era com dublê, e
 * dublê não descobre chave errada, time errado, `bundle` errado, projeto do
 * Firebase errado nem relógio fora de hora. Essas cinco coisas só aparecem na
 * primeira noite de temporal, que é o pior momento possível.
 *
 * ## Como ele prova sem precisar de um aparelho
 *
 * O truque é a ORDEM em que os dois serviços conferem as coisas. Os dois
 * validam PRIMEIRO quem está mandando, e só depois para quem. Então uma ficha
 * de aparelho deliberadamente inválida separa as duas perguntas:
 *
 *   - Se a resposta for "esta ficha não existe" (`BadDeviceToken` na Apple,
 *     `UNREGISTERED` ou `INVALID_ARGUMENT` no Google), a credencial FOI ACEITA.
 *     É esta a prova: o serviço leu nosso token de provedor, conferiu a
 *     assinatura, o time, o tópico, e chegou até a etapa de procurar o
 *     aparelho. Só o destino estava errado, e o destino é falso de propósito.
 *
 *   - Se a resposta for "quem é você?" (`InvalidProviderToken` ou `403` na
 *     Apple, `401` no Google), a credencial NÃO serve, e o push nunca ia
 *     funcionar em aparelho nenhum.
 *
 * Nenhuma notificação chega a ninguém: a ficha não existe. Não há efeito
 * colateral, e dá para rodar quantas vezes quiser.
 *
 * ## O que ele NÃO prova
 *
 * Que uma notificação aparece na tela de um aparelho de verdade. Isso exige
 * aparelho registrado, e continua sendo o último passo. O que ele fecha é a
 * metade que não precisa de ninguém segurando um telefone, e que é justamente
 * a metade que falha calada.
 *
 * Uso, de dentro de `dc360`:
 *   node --env-file=apps/api/.env scripts/conferir-push.mjs
 */
import { readFileSync } from "node:fs";
import { criarProvedorApns, APNS_PRODUCAO, APNS_TESTE } from "../apps/api/dist/push/apns.js";
import { criarProvedorFcm, lerContaDeServico } from "../apps/api/dist/push/fcm.js";
import { montarAviso } from "../apps/api/dist/push/mensagem.js";

/*
  Ficha falsa com o FORMATO certo, e não uma string qualquer.

  A APNs recusa antes de olhar a credencial se a ficha não for hexadecimal de
  64 caracteres, e aí a resposta seria sobre a ficha e não sobre nós, ou seja,
  o roteiro passaria sem provar nada. Sessenta e quatro zeros tem o formato
  certo e não pode pertencer a aparelho nenhum.
*/
const FICHA_FALSA_APPLE = "0".repeat(64);
const FICHA_FALSA_GOOGLE = "fMr1Nao-EXISTE:APA91b" + "x".repeat(120);

/** Respostas que significam "sua credencial serve, o aparelho é que não". */
const CREDENCIAL_ACEITA = [
  "BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic",
  "UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND",
];
/** Respostas que significam "sua credencial não serve". */
const CREDENCIAL_RECUSADA = [
  "InvalidProviderToken", "ExpiredProviderToken", "MissingProviderToken",
  "TopicDisallowed", "Forbidden", "401", "403", "PERMISSION_DENIED", "UNAUTHENTICATED",
];

function classificar(detalhe) {
  const texto = String(detalhe ?? "");
  if (CREDENCIAL_RECUSADA.some((c) => texto.includes(c))) return "recusada";
  if (CREDENCIAL_ACEITA.some((c) => texto.includes(c))) return "aceita";
  return "indefinido";
}

function exigir(nome) {
  const v = process.env[nome];
  if (!v || !v.trim()) {
    console.error(`Falta ${nome}. Rode com: node --env-file=apps/api/.env scripts/conferir-push.mjs`);
    process.exit(2);
  }
  return v.trim();
}

/** Aceita caminho OU conteúdo, como a partida da API já faz (ver push/segredo.ts). */
function caminhoOuConteudo(valor, marca) {
  if (valor.includes(marca)) return valor;
  return readFileSync(valor, "utf8");
}

const aviso = montarAviso("prazo_vencendo", {
  organizacaoId: "00000000-0000-0000-0000-000000000000",
  ocorrenciaId: "00000000-0000-0000-0000-000000000000",
  severidade: "alta",
  prazoEm: new Date(0).toISOString(),
});

let problemas = 0;

// ---------------------------------------------------------------- Apple
console.log("== Apple, APNs ==");
try {
  const credenciais = {
    keyId: exigir("APNS_KEY_ID"),
    teamId: exigir("APNS_TEAM_ID"),
    bundle: exigir("APNS_BUNDLE"),
    chavePem: caminhoOuConteudo(exigir("APNS_CHAVE"), "BEGIN PRIVATE KEY"),
  };
  console.log(`  time ${credenciais.teamId}, chave ${credenciais.keyId}, bundle ${credenciais.bundle}`);

  for (const [nome, url] of [["produção", APNS_PRODUCAO], ["teste (sandbox)", APNS_TESTE]]) {
    const provedor = criarProvedorApns(credenciais, { urlBase: url });
    const r = await provedor.enviar(FICHA_FALSA_APPLE, aviso);
    const veredito = classificar(r.detalhe);
    const rotulo = { aceita: "CREDENCIAL ACEITA", recusada: "CREDENCIAL RECUSADA", indefinido: "INDEFINIDO" }[veredito];
    console.log(`  ${nome}: ${rotulo}  (desfecho ${r.desfecho}, detalhe ${JSON.stringify(r.detalhe)})`);
    if (veredito !== "aceita") problemas++;
  }
} catch (erro) {
  console.log(`  FALHOU antes de falar com a Apple: ${erro.message}`);
  problemas++;
}

// ---------------------------------------------------------------- Google
console.log("\n== Google, FCM ==");
try {
  const bruto = caminhoOuConteudo(exigir("FCM_CONTA_SERVICO"), "private_key");
  const conta = lerContaDeServico(bruto, "(do ambiente)");
  console.log(`  projeto ${conta.project_id}, conta ${conta.client_email}`);

  const provedor = criarProvedorFcm(conta);
  const r = await provedor.enviar(FICHA_FALSA_GOOGLE, aviso);
  const veredito = classificar(r.detalhe);
  const rotulo = { aceita: "CREDENCIAL ACEITA", recusada: "CREDENCIAL RECUSADA", indefinido: "INDEFINIDO" }[veredito];
  console.log(`  ${rotulo}  (desfecho ${r.desfecho}, detalhe ${JSON.stringify(r.detalhe)})`);
  if (veredito !== "aceita") problemas++;
} catch (erro) {
  console.log(`  FALHOU antes de falar com o Google: ${erro.message}`);
  problemas++;
}

console.log("");
if (problemas === 0) {
  console.log("As duas credenciais foram aceitas pelos serviços de verdade.");
  console.log("Falta só o aparelho registrado para uma notificação aparecer numa tela.");
} else {
  console.log(`${problemas} verificação(ões) não fecharam. Veja o detalhe acima.`);
}
process.exit(problemas === 0 ? 0 : 1);
