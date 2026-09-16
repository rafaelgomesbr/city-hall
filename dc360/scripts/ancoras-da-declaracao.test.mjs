import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { conferirAncoras, contemSimbolo, descrever, resolverCaminho } from "./ancoras-da-declaracao.mjs";

/**
 * O portão das âncoras de `docs/DECLARACAO-NAS-LOJAS.md`.
 *
 * O documento é o que quem submete o aplicativo às lojas copia para o
 * formulário, e cada afirmação dele aponta para o código. Até 15/09/2026 o
 * apontamento era por número de linha, e seis já estavam errados. Agora é por
 * símbolo, e este arquivo confere a cada `npm run test:scripts` que o arquivo
 * citado existe, que o símbolo está nele, que a ausência afirmada é ausência
 * mesmo, e que nenhuma âncora por número de linha voltou.
 *
 * Os casos-irmãos abaixo reintroduzem cada defeito numa CÓPIA do texto e veem
 * o conferidor morder. Sem eles, um erro de expressão regular faria o
 * conferidor devolver vazio e o portão passaria verde sem ler nada.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DOCUMENTO = new URL("../docs/DECLARACAO-NAS-LOJAS.md", import.meta.url);

function texto() {
  return readFileSync(DOCUMENTO, "utf8");
}

test("o documento de verdade passa: todo arquivo citado existe, todo simbolo esta la, nenhum numero de linha", () => {
  const problemas = conferirAncoras(texto(), RAIZ);
  assert.deepEqual(problemas, [], `âncoras quebradas em docs/DECLARACAO-NAS-LOJAS.md:\n${descrever(problemas)}`);
});

test("a ancora: o documento tem dezenas de ancoras por simbolo, senao o portao esta lendo o arquivo errado", () => {
  const ancoras = [...texto().matchAll(/`[^`#\s]+#!?[\w$.-]+`/g)];
  assert.ok(ancoras.length >= 60, `só ${ancoras.length} âncoras: o documento perdeu as evidências ou o portão perdeu o documento`);
  const deAusencia = ancoras.filter((m) => m[0].includes("#!"));
  assert.ok(deAusencia.length >= 3, "as âncoras de ausência sumiram");
});

test("caso-irmao: simbolo que nao existe no arquivo e mordido", () => {
  const copia = texto() + "\n\nProva: `apps/campo/app.config.ts#simboloQueNaoExisteEmLugarNenhum`.\n";
  const problemas = conferirAncoras(copia, RAIZ);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].motivo, /simboloQueNaoExisteEmLugarNenhum não existe em apps\/campo\/app\.config\.ts/);
});

test("caso-irmao: arquivo que nao existe e mordido, com e sem ancora", () => {
  const copia = texto()
    + "\n\nProva: `apps/campo/src/dados/arquivo-renomeado.ts#entrar` e `apps/campo/src/dados/outro-sumido.ts`.\n";
  const problemas = conferirAncoras(copia, RAIZ);
  const motivos = problemas.map((p) => p.motivo).join("\n");
  assert.match(motivos, /arquivo-renomeado\.ts#entrar/);
  assert.match(motivos, /outro-sumido\.ts/);
});

test("caso-irmao: a ancora por numero de linha, que era a forma antiga, e mordida em todas as suas grafias", () => {
  for (const forma of ["linha 212", "linhas 141 a 154", "linhas 25, 26 e 62", "Linha 326:"]) {
    const problemas = conferirAncoras(`${texto()}\n\nProva com ${forma} no meio.\n`, RAIZ);
    assert.equal(problemas.length, 1, `não mordeu "${forma}"`);
    assert.match(problemas[0].motivo, /número de linha/);
  }
});

test("caso-irmao: a ancora de ausencia morde quando o simbolo EXISTE", () => {
  const copia = texto() + "\n\nProva: `apps/campo/app.config.ts#!allowBackup`.\n";
  const problemas = conferirAncoras(copia, RAIZ);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].motivo, /afirma que allowBackup NÃO existe/);
});

test("caso-irmao: ausencia em pasta varre a pasta inteira", () => {
  const existe = conferirAncoras(`${texto()}\n\nProva: \`apps/campo/src#!getLastKnownPositionAsync\`.\n`, RAIZ);
  assert.equal(existe.length, 1, "não achou o símbolo que existe em vários arquivos da pasta");
  assert.match(existe[0].motivo, /existe \([2-9]\d* arquivo\(s\)\)/);
  const naoExiste = conferirAncoras(`${texto()}\n\nProva: \`apps/campo/src#!simboloQueNaoExisteEmLugarNenhum\`.\n`, RAIZ);
  assert.deepEqual(naoExiste, []);
});

test("presenca em pasta nao vale como ancora: ela nao diz onde olhar", () => {
  const problemas = conferirAncoras(`${texto()}\n\nProva: \`apps/campo/src#capturarGps\`.\n`, RAIZ);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].motivo, /pasta/);
});

test("o simbolo e palavra inteira: foto nao casa em foto_chave, e um nome com ponto casa literal", () => {
  assert.equal(contemSimbolo("const foto_chave = 1;", "foto"), false);
  assert.equal(contemSimbolo("const foto_chave = 1;", "foto_chave"), true);
  assert.equal(contemSimbolo("accuracy: Location.Accuracy.High,", "Location.Accuracy.High"), true);
  assert.equal(contemSimbolo("sairDaApi()", "sair"), false);
  assert.equal(contemSimbolo("const sair = 1", "sair"), true);
});

test("o caminho resolve da raiz, de apps/campo, de apps/campo/src e de docs, nessa ordem", () => {
  assert.ok(resolverCaminho(RAIZ, "apps/campo/app.config.ts"));
  assert.ok(resolverCaminho(RAIZ, "app.config.ts"));
  assert.ok(resolverCaminho(RAIZ, "dados/api.ts"));
  assert.ok(resolverCaminho(RAIZ, "../apps/campo/LOJAS.md"));
  assert.equal(resolverCaminho(RAIZ, "nao/existe.ts"), null);
});

/*
  As seis âncoras erradas que o revisor achou na versão 2, agora por símbolo:
  cada uma precisa continuar apontando para algo que existe. Se um destes
  símbolos for renomeado, este caso e o primeiro reprovam juntos, e o nome novo
  entra no documento no mesmo commit.
*/
test("as seis ancoras que o revisor provou erradas na versao 2 estao por simbolo, e resolvem", () => {
  const doc = texto();
  for (const ancora of [
    "`apps/campo/app.config.ts#allowBackup`",
    "`apps/campo/app.config.ts#NSAllowsArbitraryLoads`",
    "`apps/campo/app.config.ts#googleServicesFile`",
    "`apps/campo/src/push/PortaExpo.ts#obterFicha`",
    "`apps/campo/src/dados/banco-local.ts#apagarDadosLocais`",
    "`apps/campo/src/app/(agente)/mapa.tsx#verOndeEstou`",
  ]) {
    assert.ok(doc.includes(ancora), `o documento perdeu ${ancora}`);
  }
});
