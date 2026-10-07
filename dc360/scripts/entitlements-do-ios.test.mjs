import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

/**
 * O `aps-environment` PRECISA estar no binário, e este caso existe porque ele
 * não estava.
 *
 * Descoberto em 13/09/2026: `apps/campo/app.config.ts` configura o plugin
 * `expo-notifications` com `mode` decidido pelo perfil do build, e está certo.
 * Só que a pasta `ios/` tinha sido gerada ANTES dessa configuração existir, e
 * ninguém regenerou. O resultado era um `DefesaCivil360.entitlements` com
 * `<dict/>`, vazio.
 *
 * ## Por que é o pior tipo de defeito
 *
 * Sem `aps-environment`, o iOS recusa dar ficha de push ao aplicativo. E não
 * recusa alto: o aplicativo compila, instala, abre, o agente concede a
 * permissão na tela, e o registro devolve nada. Do lado do servidor, zero
 * aparelho registrado, que é indistinguível de "ninguém instalou ainda".
 * Ninguém descobre pelo aplicativo. O agente conclui que o produto não avisa,
 * e a conclusão dele fica certa.
 *
 * O mesmo vale para o valor ERRADO: um binário de loja assinado com
 * `development` é aceito pela App Store, instala, registra ficha, e nunca
 * recebe nada, porque a ficha é de um ambiente e o servidor fala com o outro.
 *
 * ## Por que mora em `scripts/` e não em `apps/campo/`
 *
 * Isto confere PROJETO GERADO, não código do aplicativo. O pacote do
 * aplicativo roda em `jest-expo`, sem tipos de Node, então ler arquivo lá é
 * empurrar uma dependência de ambiente para dentro de um pacote que não a tem.
 * Aqui, ao lado dos outros roteiros, `node:fs` é o normal.
 *
 * ## Por que pula quando não há `ios/`
 *
 * A pasta é gerada e está fora do git, então não existe numa máquina recém
 * clonada nem na integração contínua. Reprovar onde não há nada a conferir
 * ensina a ignorar a reprovação. Este portão guarda a máquina onde o build
 * acontece, que é onde o defeito nasce.
 */
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA_IOS = `${RAIZ}apps/campo/ios`;
const ENTITLEMENTS = `${PASTA_IOS}/DefesaCivil360/DefesaCivil360.entitlements`;
const APP_CONFIG = `${RAIZ}apps/campo/app.config.ts`;

test("o entitlements do iOS declara aps-environment", { skip: !existsSync(PASTA_IOS) && "sem pasta ios/ nesta máquina" }, () => {
  assert.ok(
    existsSync(ENTITLEMENTS),
    `Existe ios/ e não existe ${ENTITLEMENTS}. Regenere: npx expo prebuild --platform ios`,
  );
  const texto = readFileSync(ENTITLEMENTS, "utf8");
  assert.match(
    texto, /aps-environment/,
    "O entitlements não declara aps-environment. O aplicativo compila, instala, " +
    "pede permissão e NUNCA recebe notificação, sem erro em lugar nenhum, e o " +
    "servidor vê zero aparelho registrado, que é igual a 'ninguém instalou ainda'. " +
    "Regenere: npx expo prebuild --platform ios",
  );
});

test("o valor do aps-environment é um dos dois que a Apple aceita", { skip: !existsSync(ENTITLEMENTS) && "sem projeto iOS gerado" }, () => {
  const texto = readFileSync(ENTITLEMENTS, "utf8");
  const valor = /<key>aps-environment<\/key>\s*<string>([^<]+)<\/string>/.exec(texto)?.[1];
  assert.ok(
    valor && ["development", "production"].includes(valor),
    `aps-environment com valor inesperado: ${JSON.stringify(valor)}. ` +
    "Os dois únicos que a Apple aceita são development e production.",
  );
});

/*
  O que o caso confere, separado do arquivo para poder ser provado contra um
  rascunho estragado de propósito (o caso negativo logo abaixo).

  A forma antiga escrevia a comparação com `EAS_BUILD_PROFILE` dentro do
  próprio `mode`, e a regex procurava aquela escrita literal. O `app.config.ts`
  passou a decidir uma vez, em `PERFIL_DE_PRODUCAO`, e a ler a constante em dois
  lugares (o `mode` do plugin e o `extra.pushAmbiente`), que é mais seguro: os
  dois não têm mais como divergir. A regex velha reprovava o arquivo certo.
  Agora o caso confere as três pontas dessa decisão: de onde a constante nasce
  e os dois lugares que a leem. E reprova se o `mode` voltar a ser escrito à
  mão, que é o defeito que ele existe para impedir.
*/
function problemasDaEscolhaDoAmbiente(config) {
  const problemas = [];
  if (!/const PERFIL_DE_PRODUCAO = process\.env\["EAS_BUILD_PROFILE"\] === "producao";/.test(config)) {
    problemas.push("PERFIL_DE_PRODUCAO deixou de nascer de EAS_BUILD_PROFILE === \"producao\"");
  }
  if (!/mode: PERFIL_DE_PRODUCAO \? "production" : "development"/.test(config)) {
    problemas.push("o mode do expo-notifications deixou de ler PERFIL_DE_PRODUCAO");
  }
  if (!/pushAmbiente: PERFIL_DE_PRODUCAO \? "producao" : "teste"/.test(config)) {
    problemas.push("o extra.pushAmbiente deixou de ler PERFIL_DE_PRODUCAO");
  }
  if (/mode:\s*["'](?:production|development)["']/.test(config)) {
    problemas.push("o mode está escrito à mão");
  }
  return problemas;
}

test("a escolha do ambiente continua morando no app.config.ts, e não escrita à mão", () => {
  const config = readFileSync(APP_CONFIG, "utf8");
  assert.deepEqual(
    problemasDaEscolhaDoAmbiente(config), [],
    "app.config.ts deixou de decidir o aps-environment pelo perfil do build. " +
    "Escrito à mão, ele erra na direção que não avisa.",
  );
});

test("a conferência do ambiente reprova o mode escrito à mão num rascunho", () => {
  const config = readFileSync(APP_CONFIG, "utf8");
  const aMao = config.replace(
    'mode: PERFIL_DE_PRODUCAO ? "production" : "development"', 'mode: "production"',
  );
  assert.notEqual(aMao, config, "o rascunho não mudou: a linha do mode saiu do app.config.ts");
  assert.deepEqual(problemasDaEscolhaDoAmbiente(aMao), [
    "o mode do expo-notifications deixou de ler PERFIL_DE_PRODUCAO",
    "o mode está escrito à mão",
  ]);

  const semPerfil = config.replace(
    'process.env["EAS_BUILD_PROFILE"] === "producao"', 'true',
  );
  assert.deepEqual(problemasDaEscolhaDoAmbiente(semPerfil), [
    "PERFIL_DE_PRODUCAO deixou de nascer de EAS_BUILD_PROFILE === \"producao\"",
  ]);

  const pushAMao = config.replace(
    'pushAmbiente: PERFIL_DE_PRODUCAO ? "producao" : "teste"', 'pushAmbiente: "producao"',
  );
  assert.deepEqual(problemasDaEscolhaDoAmbiente(pushAMao), [
    "o extra.pushAmbiente deixou de ler PERFIL_DE_PRODUCAO",
  ]);
});

/* ------------------------------------------------------------------------
   O som de despacho e o direito que ele exige (15/09/2026).

   Mesma classe de defeito do `aps-environment`, e o mesmo remédio: o
   `app.config.ts` está certo, e o projeto gerado só fica certo depois do
   `prebuild`. Estes dois casos reprovam na máquina que tem `ios/` de uma
   versão anterior, e a mensagem diz o que rodar.
   ------------------------------------------------------------------------ */
const SOM_NO_PROJETO_IOS = `${PASTA_IOS}/DefesaCivil360/despacho.wav`;
const DIREITO_SENSIVEL_AO_TEMPO = "com.apple.developer.usernotifications.time-sensitive";

/*
   O direito sensível ao tempo é OPCIONAL e depende da conta da Apple: só
   entra com `DC360_TIME_SENSITIVE=sim` no ambiente do prebuild, depois de a
   capacidade estar ligada no App ID (o porquê está em `app.config.ts`). O
   portão exige que o projeto gerado CONCORDE com a variável: ligado, o
   direito está lá; desligado, não está (um direito que o perfil não cobre
   derruba a compilação com "doesn't include the ... capability").
   ------------------------------------------------------------------------ */
const SENSIVEL_LIGADO = process.env["DC360_TIME_SENSITIVE"] === "sim";

test("o entitlements gerado concorda com DC360_TIME_SENSITIVE sobre o direito sensível ao tempo", { skip: !existsSync(ENTITLEMENTS) && "sem projeto iOS gerado" }, () => {
  const texto = readFileSync(ENTITLEMENTS, "utf8");
  const declara = new RegExp(`<key>${DIREITO_SENSIVEL_AO_TEMPO.replace(/\./g, "\\.")}</key>\\s*<true/>`).test(texto);
  if (SENSIVEL_LIGADO) {
    assert.ok(declara,
      `DC360_TIME_SENSITIVE=sim e o entitlements gerado não declara ${DIREITO_SENSIVEL_AO_TEMPO}. ` +
      "Regenere: npx expo prebuild --platform ios --clean");
  } else {
    assert.ok(!declara,
      `O entitlements gerado declara ${DIREITO_SENSIVEL_AO_TEMPO} sem DC360_TIME_SENSITIVE=sim. ` +
      "Sem a capacidade no App ID a compilação para. Ou ligue a variável (com a capacidade " +
      "ligada no portal da Apple), ou regenere: npx expo prebuild --platform ios --clean");
  }
});

test("o som de despacho foi copiado para o projeto iOS", { skip: !existsSync(PASTA_IOS) && "sem pasta ios/ nesta máquina" }, () => {
  assert.ok(
    existsSync(SOM_NO_PROJETO_IOS),
    `${SOM_NO_PROJETO_IOS} não existe. O plugin do expo-notifications copia o ` +
    "arquivo de `sounds` no prebuild; sem ele o `aps.sound = \"despacho.wav\"` que o " +
    "servidor manda cai no som padrão do sistema, sem erro. " +
    "Regenere: npx expo prebuild --platform ios",
  );
});

test("o app.config.ts pede o direito atrás da variável, e declara o som", () => {
  const config = readFileSync(APP_CONFIG, "utf8");
  assert.match(
    config, /DC360_TIME_SENSITIVE"\] === "sim"[\s\S]{0,120}"com\.apple\.developer\.usernotifications\.time-sensitive": true/,
    "app.config.ts deixou de pedir o direito de notificação sensível ao tempo atrás de DC360_TIME_SENSITIVE.",
  );
  assert.match(
    config, /sounds: \["\.\/assets\/sons\/despacho\.wav"\]/,
    "app.config.ts deixou de declarar o som de despacho ao plugin do expo-notifications.",
  );
});
