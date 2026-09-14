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

/**
 * O corpo de um bloco `{ ... }`, por contagem de chaves a partir de uma âncora.
 *
 * Existe porque a versão anterior deste portão recortava o plugin por
 * INDENTAÇÃO (`\n {6}\},`), o que amarra o portão ao formatador: um `prettier`
 * com outra largura, ou o bloco mudando de nível, e a leitura devolve o pedaço
 * errado ou nada.
 */
function corpoDoBloco(fonte, ancora) {
  const inicio = fonte.indexOf(ancora);
  if (inicio === -1) return null;
  const abre = fonte.indexOf("{", inicio);
  if (abre === -1) return null;
  let profundidade = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade += 1;
    if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(abre + 1, i);
    }
  }
  return null;
}

/**
 * Toda atribuição de `image` e `backgroundColor` de um bloco, com o valor.
 *
 * TODA, e o "toda" é o conserto. A versão anterior perguntava se o bloco tinha
 * ALGUMA `backgroundColor: ABERTURA.` dentro, com `assert.match`, e o bloco
 * `dark:` mora dentro do bloco do plugin: bastava o `dark` usar a constante
 * para o campo de cima poder ser escrito à mão, e vice-versa. Medido por
 * mutação, o portão passava verde com a cor clara do plugin escrita à mão, com
 * a imagem clara do plugin escrita à mão, e com o campo legado `splash` inteiro
 * escrito à mão, que é literalmente o defeito que o comentário do arquivo diz
 * que este caso impede.
 */
function ondeAAberturaEscreveValor(corpo) {
  return [...corpo.matchAll(/(?:^|[\s{,])(image|backgroundColor)\s*:\s*([^,\n}]+)/g)]
    .map(([, campo, valor]) => ({ campo, valor: valor.trim() }));
}

/** Os dois lugares que dizem a mesma coisa, e por isso têm que dizer a mesma. */
function blocosDaAbertura(fonte) {
  const doPlugin = corpoDoBloco(fonte, '"expo-splash-screen",');
  assert.ok(doPlugin, "o plugin expo-splash-screen sumiu de app.config.ts, ou mudou de forma");
  const legado = corpoDoBloco(fonte, "\n  splash:");
  assert.ok(
    legado,
    "o campo legado `splash` sumiu de app.config.ts. Se ele foi removido de "
    + "propósito, tire esta leitura junto; se sumiu sozinho, o manifesto perdeu "
    + "a abertura que as ferramentas leem sem rodar plugin.",
  );
  return { "o plugin expo-splash-screen": doPlugin, "o campo legado `splash`": legado };
}

test("o plugin da abertura recebe o bloco do tema escuro", () => {
  const fonte = fonteDaConfiguracao();
  const { "o plugin expo-splash-screen": doPlugin } = blocosDaAbertura(fonte);

  assert.match(
    doPlugin,
    /dark:\s*\{/,
    "o plugin da abertura não recebe `dark`. Sem ele, o fundo declarado vale "
    + "para os dois modos e a abertura fica presa num tema só.",
  );
});

test("nenhuma cor e nenhuma arte de abertura é escrita à mão, nos DOIS lugares", () => {
  /*
    As quatro pontas saem da constante, e não de literal repetido. É o que
    impede o campo legado `splash` e o plugin de divergirem em silêncio: quem
    trocar a cor num lugar e esquecer o outro produz uma abertura que muda de
    cor conforme a ferramenta que leu a configuração.

    Cada atribuição é conferida, e não "existe pelo menos uma certa". Ver o
    comentário de `ondeAAberturaEscreveValor`: era exatamente por medir "pelo
    menos uma" que três mutações diferentes passavam verdes aqui.
  */
  const fonte = fonteDaConfiguracao();
  const aMao = [];

  for (const [onde, corpo] of Object.entries(blocosDaAbertura(fonte))) {
    const atribuicoes = ondeAAberturaEscreveValor(corpo);
    assert.ok(
      atribuicoes.length >= 4,
      `${onde} declara só ${atribuicoes.length} valores de abertura. São quatro no `
      + "mínimo (imagem e fundo, no claro e no escuro): a leitura quebrou, ou o "
      + "bloco perdeu metade das decisões.",
    );
    for (const { campo, valor } of atribuicoes) {
      if (!/^ABERTURA\.\w+$/.test(valor)) aMao.push(`${onde}: ${campo}: ${valor}`);
    }
  }

  assert.deepEqual(
    aMao,
    [],
    "valor de abertura escrito à mão em vez de sair da constante ABERTURA:\n  "
    + aMao.join("\n  ")
    + "\n\nEnquanto houver dois lugares dizendo a mesma coisa, eles precisam dizer a "
    + "MESMA coisa. Um literal aqui envelhece sozinho, e o defeito só aparece no "
    + "aparelho de alguém.",
  );
});

test("a leitura dos dois blocos pega o valor escrito à mão", () => {
  /*
    O caso-irmão obrigatório, e ele existe porque o caso acima passou verde por
    três mutações antes de ser reescrito. Sem reintroduzir o defeito, "nenhum
    valor à mão" é indistinguível de "a leitura não achou valor nenhum".
  */
  const bloco = corpoDoBloco(
    `[
      "expo-splash-screen",
      {
        image: ABERTURA.imagemClara,
        backgroundColor: "#F5F7F8",
        imageWidth: ABERTURA.larguraDaImagem,
        dark: {
          image: ABERTURA.imagemEscura,
          backgroundColor: ABERTURA.fundoEscuro,
        },
      },
    ]`,
    '"expo-splash-screen",',
  );
  assert.ok(bloco, "a leitura por contagem de chaves deixou de achar o bloco");

  const atribuicoes = ondeAAberturaEscreveValor(bloco);
  assert.equal(
    atribuicoes.length, 4,
    "a leitura precisa enxergar as QUATRO atribuições, inclusive as de dentro do "
    + "`dark`: era por enxergar só a primeira que o portão absolvia as outras",
  );
  assert.deepEqual(
    atribuicoes.filter((a) => !/^ABERTURA\.\w+$/.test(a.valor)),
    [{ campo: "backgroundColor", valor: '"#F5F7F8"' }],
    "a cor escrita à mão no plugin não foi acusada, e foi ela que passou verde na mutação",
  );

  /* E o bloco inteiro certo não pode produzir acusação nenhuma. */
  const certo = corpoDoBloco(
    `x = { splash: { image: ABERTURA.imagemClara, resizeMode: "contain",
       backgroundColor: ABERTURA.fundoClaro,
       dark: { image: ABERTURA.imagemEscura, backgroundColor: ABERTURA.fundoEscuro } } };`,
    "splash:",
  );
  const doCerto = ondeAAberturaEscreveValor(certo);
  assert.equal(doCerto.length, 4);
  assert.deepEqual(doCerto.filter((a) => !/^ABERTURA\.\w+$/.test(a.valor)), []);
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
