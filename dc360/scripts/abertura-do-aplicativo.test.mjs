/**
 * A TELA DE ABERTURA do aplicativo de campo, conferida por máquina.
 *
 * O defeito que este portão trava foi visto no aparelho: `app.config.ts`
 * declarava `backgroundColor: "#101519"` e mais nada, então quem usa o telefone
 * em modo claro, que é a maioria de quem trabalha na rua com sol na tela, abria
 * o aplicativo e via meio segundo de tela quase preta antes de a interface
 * clara aparecer. Abertura que não combina com o que vem depois parece defeito
 * de carregamento, e é a primeira coisa que o aplicativo mostra.
 *
 * Ele ficou mais visível depois que a abertura passou a segurar também o
 * carregamento das fontes: a tela que piscava agora fica de pé o tempo
 * suficiente para ser lida.
 *
 * Três coisas ficam presas aqui, e cada uma é um jeito diferente de o conserto
 * se desfazer sem ninguém perceber:
 *
 * 1. **As duas cores são as do tema**, lidas de `src/ui/tokens.ts`. Sem isto,
 *    a abertura vira um par de cores escolhido à mão, que envelhece no dia em
 *    que a paleta mudar (e ela já mudou uma vez neste projeto, de laranja para
 *    violeta).
 * 2. **O plugin recebe o bloco do tema escuro.** Sem `dark`, o fundo claro
 *    passa a valer para os dois modos, que é a MESMA falha com a cor trocada.
 * 3. **As duas artes existem no disco.** Caminho de imagem que não existe não
 *    reprova em teste nenhum: ele reprova no `prebuild`, na máquina de quem
 *    estiver gerando o binário, minutos antes do envio para a loja.
 *
 * ## Por que mora em `scripts/`
 *
 * Mesma razão de `entitlements-do-ios.test.mjs` e dos outros portões do
 * aplicativo: isto confere CONFIGURAÇÃO, lendo arquivo. O pacote do aplicativo
 * roda em `jest-expo`, sem `node:fs` e sem os tipos de Node.
 *
 * O que ele NÃO faz, dito na cara: lê o TEXTO do arquivo, não a configuração
 * resolvida pelo Expo. Um `app.config.ts` que decidisse a cor em tempo de
 * execução, a partir de variável de ambiente, passaria por aqui sem ser medido.
 * Hoje ele não decide: as quatro linhas são constantes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { lerEntradas, lerTokensDoApp, semComentarios } from "./fonte-do-aplicativo.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA_DO_APP = join(RAIZ, "apps", "campo");
const APP_CONFIG = join(PASTA_DO_APP, "app.config.ts");

/** O texto do arquivo, sem comentário: os parágrafos acima citam as cores. */
function fonteDaConfiguracao() {
  return semComentarios(readFileSync(APP_CONFIG, "utf8"));
}

/**
 * Lê a constante `ABERTURA`, que é onde as quatro decisões moram.
 *
 * Ela existe para que o campo legado `splash` e o plugin `expo-splash-screen`
 * não possam divergir: enquanto houver dois lugares dizendo a mesma coisa,
 * eles precisam dizer a MESMA coisa.
 */
function lerAbertura() {
  const casou = /const ABERTURA = \{([\s\S]*?)\n\} as const;/.exec(fonteDaConfiguracao());
  assert.ok(
    casou,
    "app.config.ts não declara mais `const ABERTURA = { ... } as const;`. "
    + "Se a constante mudou de nome, este portão parou de medir a abertura.",
  );
  const cru = lerEntradas(casou[1]);
  return Object.fromEntries(
    Object.entries(cru).map(([chave, valor]) => [chave, valor.replace(/^["']|["']$/g, "")]),
  );
}

test("a abertura declara uma cor por tema, e são as cores do tema", () => {
  const abertura = lerAbertura();
  const tokens = lerTokensDoApp();

  assert.notEqual(
    abertura["fundoClaro"]?.toUpperCase(),
    abertura["fundoEscuro"]?.toUpperCase(),
    "a abertura tem uma cor só para os dois temas. Quem roda o aparelho no outro "
    + "modo vê a abertura de um tema seguida da interface do outro.",
  );

  assert.equal(
    abertura["fundoClaro"]?.toUpperCase(),
    tokens.temaClaro.fundo.toUpperCase(),
    "o fundo claro da abertura não é `temaClaro.fundo` de src/ui/tokens.ts. "
    + "Cor escolhida à mão aqui envelhece sozinha no dia em que a paleta mudar.",
  );

  assert.equal(
    abertura["fundoEscuro"]?.toUpperCase(),
    tokens.temaEscuro.fundo.toUpperCase(),
    "o fundo escuro da abertura não é `temaEscuro.fundo` de src/ui/tokens.ts.",
  );
});

test("o plugin da abertura recebe o bloco do tema escuro", () => {
  const fonte = fonteDaConfiguracao();
  const bloco = /"expo-splash-screen",\s*\{([\s\S]*?)\n {6}\},/.exec(fonte);
  assert.ok(bloco, "o plugin expo-splash-screen sumiu de app.config.ts, ou mudou de forma");

  assert.match(
    bloco[1],
    /dark:\s*\{/,
    "o plugin da abertura não recebe `dark`. Sem ele, o fundo declarado vale "
    + "para os dois modos e a abertura fica presa num tema só.",
  );

  /*
    As duas pontas saem da constante, e não de literal repetido. É o que
    impede o campo legado `splash` e o plugin de divergirem em silêncio: quem
    trocar a cor num lugar e esquecer o outro produz uma abertura que muda de
    cor conforme a ferramenta que leu a configuração.
  */
  for (const campo of ["image", "backgroundColor"]) {
    assert.match(
      bloco[1],
      new RegExp(`${campo}:\\s*ABERTURA\\.`),
      `o plugin escreve \`${campo}\` à mão em vez de usar a constante ABERTURA.`,
    );
  }
});

test("as duas artes de abertura existem no disco", () => {
  const abertura = lerAbertura();

  for (const chave of ["imagemClara", "imagemEscura"]) {
    const relativo = abertura[chave];
    assert.ok(relativo, `ABERTURA.${chave} sumiu de app.config.ts`);
    const caminho = join(PASTA_DO_APP, relativo.replace(/^\.\//, ""));
    assert.ok(
      existsSync(caminho),
      `ABERTURA.${chave} aponta para ${relativo}, que não existe. Isso não `
      + "reprova em teste nenhum: reprova no prebuild, minutos antes do envio "
      + "para a loja. Gere de novo com `node scripts/gerar-icones.mjs`.",
    );
  }
});

test("a leitura da constante enxerga mesmo o arquivo", () => {
  /*
    Âncora, pela razão de sempre neste repositório: portão cego dá verde para
    sempre. Se a constante mudar de forma e a expressão parar de casar, o
    `lerAbertura` já estoura; o que este caso pega é o outro lado, uma leitura
    que casa e devolve um objeto vazio ou pela metade.
  */
  const abertura = lerAbertura();
  assert.deepEqual(
    Object.keys(abertura).sort(),
    ["fundoClaro", "fundoEscuro", "imagemClara", "imagemEscura", "larguraDaImagem"],
    "a leitura de ABERTURA devolveu um conjunto de chaves inesperado",
  );
});
