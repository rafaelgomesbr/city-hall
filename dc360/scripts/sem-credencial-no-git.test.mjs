/**
 * Nenhum arquivo de credencial no git.
 *
 * Regra do Rafael de 26/10/2026: "qualquer chave no código tem que sair, e ser
 * feito do jeito certo". O `.gitignore` impede o `git add` comum, mas não o
 * `git add -f` nem um arquivo com outro nome na mesma família, então a regra
 * mora num teste, que é o que o CI e o `npm run verificar` cobram.
 *
 * Lê o índice do git (`git ls-files`), não o disco: a cópia local do
 * `google-services.json` que o desenvolvimento usa existe no disco, ignorada,
 * e isso é o certo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  encoding: "utf8",
}).trim();

/** Nome de arquivo que é credencial, com o motivo que aparece na falha. */
export const PROIBIDOS = [
  [/(^|\/)google-services\.json$/, "arquivo do Firebase (Android): vem do EAS por GOOGLE_SERVICES_JSON"],
  [/(^|\/)GoogleService-Info\.plist$/, "arquivo do Firebase (iOS)"],
  [/firebase-adminsdk.*\.json$|-conta-servico\.json$/, "conta de serviço do Firebase"],
  [/\.(p8|p12|keystore|jks|mobileprovision)$/, "chave ou certificado de assinatura"],
  [/(^|\/)\.env(\.[^/]*)?$/, "arquivo de ambiente com valor real"],
  [/segredos-do-console\.env$/, "segredos do console"],
];

/** O que tem nome parecido e NÃO é credencial: modelo sem valor. */
const PERMITIDOS = [/(^|\/)\.env\.example$/];

export function credenciaisNoIndice(arquivos) {
  return arquivos.flatMap((arquivo) => {
    if (PERMITIDOS.some((p) => p.test(arquivo))) return [];
    const achado = PROIBIDOS.find(([padrao]) => padrao.test(arquivo));
    return achado ? [`${arquivo} (${achado[1]})`] : [];
  });
}

test("nenhum arquivo de credencial está no índice do git", () => {
  const arquivos = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
  assert.ok(arquivos.length > 100, "o git ls-files tem que ver o repositório inteiro");
  assert.deepEqual(credenciaisNoIndice(arquivos), []);
});

test("o app.config.ts lê o arquivo do Firebase da variável do EAS, e não de um caminho fixo", () => {
  const fonte = readFileSync(join(RAIZ, "dc360", "apps", "campo", "app.config.ts"), "utf8");
  assert.match(fonte, /googleServicesFile: process\.env\["GOOGLE_SERVICES_JSON"\]/);
  assert.doesNotMatch(fonte, /googleServicesFile: "\.\/google-services\.json"/);
  const ignorado = readFileSync(join(RAIZ, "dc360", "apps", "campo", ".gitignore"), "utf8");
  assert.match(ignorado, /^google-services\.json$/m, "o .gitignore do aplicativo tem que ignorar a cópia local");
});

test("o teste morde: reconhece cada família e poupa o modelo .env.example", () => {
  assert.deepEqual(
    credenciaisNoIndice([
      "dc360/apps/campo/google-services.json",
      "dc360/apps/campo/GoogleService-Info.plist",
      "x/defesa-civil-firebase-adminsdk-abc.json",
      "AuthKey_ABC.p8",
      "android/app/release.keystore",
      "dc360/apps/api/.env",
      "dc360/apps/api/.env.producao",
      "dc360/apps/api/.env.example",
      "dc360/apps/campo/src/ui/mapa/estilo-do-google.ts",
    ]).map((s) => s.split(" ")[0]),
    [
      "dc360/apps/campo/google-services.json",
      "dc360/apps/campo/GoogleService-Info.plist",
      "x/defesa-civil-firebase-adminsdk-abc.json",
      "AuthKey_ABC.p8",
      "android/app/release.keystore",
      "dc360/apps/api/.env",
      "dc360/apps/api/.env.producao",
    ],
  );
});
