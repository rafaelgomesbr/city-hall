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

test("a escolha do ambiente continua morando no app.config.ts, e não escrita à mão", () => {
  const config = readFileSync(APP_CONFIG, "utf8");
  assert.match(
    config, /EAS_BUILD_PROFILE"\] === "producao" \? "production" : "development"/,
    "app.config.ts deixou de decidir o aps-environment pelo perfil do build. " +
    "Escrito à mão, ele erra na direção que não avisa.",
  );
});
