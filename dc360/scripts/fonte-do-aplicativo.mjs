/**
 * Leitura da fonte do aplicativo de campo, para os portões de qualidade dele.
 *
 * ## Por que estes portões moram em `scripts/` e não em `apps/campo/`
 *
 * A razão é a mesma já escrita em `entitlements-do-ios.test.mjs`, e ela não é
 * preferência: o pacote do aplicativo roda em `jest-expo`, cujo ambiente é o
 * do React Native. Ele não tem os tipos de Node, não tem `node:fs` e não tem
 * `__dirname`. Um portão que VARRE ARQUIVO precisa dos três. Pôr a varredura
 * lá dentro significaria empurrar `@types/node` e uma configuração de ambiente
 * para dentro de um pacote que hoje não os tem, só para um punhado de testes
 * que nem sequer montam componente.
 *
 * Aqui, ao lado de `entitlements-do-ios.test.mjs`, `node:fs` é o normal, e
 * `npm run test:scripts` já roda tudo que casa com `scripts/*.test.mjs`, então
 * os portões entram em `npm run verificar` sem mexer em `package.json`.
 *
 * O que se perde, dito na cara: estes portões leem TEXTO, não árvore de
 * sintaxe. Eles enxergam o que está escrito no arquivo, não o que o React
 * Native renderiza. Estilo montado em tempo de execução a partir de um valor
 * vindo de fora passa por eles. Isso é o mesmo limite que os portões do painel
 * já têm, e está escrito lá também.
 *
 * Este arquivo não é um teste: é a leitura compartilhada pelos três portões.
 * Ficar em um lugar só é deliberado, porque parser duplicado vira parser
 * divergente, e aí dois portões passam a enxergar árvores diferentes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_DO_REPO = fileURLToPath(new URL("..", import.meta.url));
export const RAIZ_DO_APP = join(RAIZ_DO_REPO, "apps", "campo", "src");
export const TOKENS_TS = join(RAIZ_DO_APP, "ui", "tokens.ts");
export const TOKENS_CSS = join(RAIZ_DO_REPO, "apps", "web", "src", "estilos", "tokens.css");

/** Caminho mostrado nas mensagens: sempre relativo a `apps/campo/src`. */
export function nomeCurto(caminho) {
  return relative(RAIZ_DO_APP, caminho).split(sep).join("/");
}

/**
 * Arquivos de fonte do aplicativo.
 *
 * `somenteProduto` deixa de fora os testes, e a razão é específica: um teste
 * que trava uma cor esperada PRECISA escrever a cor. `faixa-de-sincronizacao.test.tsx`
 * afirma, em hexadecimal, o fundo de cada estado da faixa, e é justamente esse
 * o valor do teste. Proibir o literal ali obrigaria o teste a importar o mesmo
 * token que o componente importa, e aí ele passaria a afirmar "o componente
 * usa o que o componente usa", que é verde garantido e prova nenhuma.
 */
export function arquivosDeFonte(pasta = RAIZ_DO_APP, { somenteProduto = true } = {}) {
  const achados = [];
  for (const nome of readdirSync(pasta).sort()) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      if (somenteProduto && nome === "__tests__") continue;
      achados.push(...arquivosDeFonte(caminho, { somenteProduto }));
      continue;
    }
    if (!/\.tsx?$/.test(nome) || /\.d\.ts$/.test(nome)) continue;
    if (somenteProduto && /\.test\.tsx?$/.test(nome)) continue;
    achados.push(caminho);
  }
  return achados;
}

/**
 * Apaga comentários preservando o número de linhas.
 *
 * Existe porque portão que pune quem EXPLICA ensina a apagar a explicação. O
 * portão do mapa do painel tomou essa mesma decisão em 13/09, e aqui ela pesa
 * mais: metade dos arquivos deste aplicativo tem parágrafos de comentário
 * contando o defeito que a linha abaixo conserta, e vários deles citam
 * `Alert.alert` e cores em hexadecimal pelo nome, porque é disso que estão
 * falando.
 *
 * A varredura é um scanner de verdade, e não um `replace` de expressão
 * regular, porque `"https://..."` dentro de uma string tem `//` no meio: uma
 * troca cega cortaria a linha ali e o portão passaria a enxergar um arquivo
 * que não existe.
 *
 * As linhas sobrevivem vazias, e não somem, senão todo número de linha das
 * mensagens apontaria para o lugar errado, e mensagem que aponta para o lugar
 * errado é pior que nenhuma mensagem.
 */
export function semComentarios(fonte) {
  let saida = "";
  let i = 0;
  let aspas = null;

  while (i < fonte.length) {
    const c = fonte[i];
    const proximo = fonte[i + 1];

    if (aspas) {
      saida += c;
      if (c === "\\") { saida += proximo ?? ""; i += 2; continue; }
      if (c === aspas) aspas = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") { aspas = c; saida += c; i += 1; continue; }

    if (c === "/" && proximo === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const trecho = fonte.slice(i, fim === -1 ? fonte.length : fim + 2);
      saida += trecho.replace(/[^\n]/g, "");
      i += trecho.length;
      continue;
    }

    if (c === "/" && proximo === "/") {
      const quebra = fonte.indexOf("\n", i);
      i = quebra === -1 ? fonte.length : quebra;
      continue;
    }

    saida += c;
    i += 1;
  }
  return saida;
}

/**
 * Recorta a TAG DE ABERTURA de cada elemento tocável, com o número da linha.
 *
 * Por que não a heurística do painel (juntar linhas até a primeira que tenha
 * `>`): em React Native quase todo tocável tem `onPress={() => ...}`, e uma
 * arrow function TEM `>` dentro. A heurística do painel pararia de ler na
 * primeira linha de `onPress` e nunca chegaria ao `style`, que é onde mora o
 * alvo de toque. O portão daria verde por enxergar metade do elemento.
 *
 * Aqui a leitura termina na linha cujo conteúdo, sem espaço, é `>` ou `/>`,
 * que é como este código fecha tag de várias linhas, ou na própria linha
 * quando a tag cabe nela. O teto de 60 linhas existe para um JSX malformado
 * não varrer o arquivo inteiro.
 */
export function tocaveis(fonte) {
  /*
    Sem caractere obrigatório depois do nome, e isso não é detalhe: a forma mais
    comum neste código é `<Pressable` sozinho no fim da linha, com os atributos
    embaixo. Exigir `[\s/>]` logo em seguida (que é o que a primeira versão
    fazia) não casava com nenhum deles, e a varredura encontrava ZERO tocáveis
    no aplicativo inteiro, verde e cega. Quem pegou foi a âncora de quantidade.
  */
  const TAGS = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)(?![A-Za-z])/;
  const linhas = fonte.split("\n");
  const achados = [];

  for (let i = 0; i < linhas.length; i++) {
    if (!TAGS.test(linhas[i])) continue;
    const pedacos = [linhas[i].trim()];
    if (!/(^|\s)\/?>$/.test(linhas[i].trim())) {
      for (let j = i + 1; j < Math.min(i + 60, linhas.length); j++) {
        const atual = linhas[j].trim();
        pedacos.push(atual);
        if (atual === ">" || atual === "/>") break;
      }
    }
    achados.push({ linha: i + 1, texto: pedacos.join(" ") });
  }
  return achados;
}

/* ============================================================
   Leitura de `src/ui/tokens.ts`
   ============================================================ */

/** Recorta `export const NOME = { ... }` por contagem de chaves. */
function objeto(fonte, nome) {
  const abertura = new RegExp(`export const ${nome}(?:\\s*:\\s*[\\w.]+)?\\s*=\\s*\\{`);
  const casou = abertura.exec(fonte);
  if (!casou) throw new Error(`tokens.ts não declara mais "export const ${nome}"`);
  const inicio = fonte.indexOf("{", casou.index);
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(inicio + 1, i);
    }
  }
  throw new Error(`chave não fechada em "export const ${nome}" no tokens.ts`);
}

/**
 * Lê `chave: valor` de um corpo de objeto.
 *
 * O trecho `(?:[^,\n}()]|\([^)]*\))+` existe por um defeito que a rodada de
 * mutação pegou: a primeira versão cortava o valor no primeiro vírgula, e
 * `perigoFundo: "rgba(255, 135, 135, 0.12)"` virava `"rgba(255`. Nenhum token
 * do aplicativo usa `rgba()` hoje, então nada estava errado agora; mas o dia
 * em que alguém escrevesse um, a paridade leria um valor que não existe e
 * compararia contra o painel sem acusar nada. Parser que lê metade do valor é
 * pior que parser que explode.
 *
 * Exportada porque é ela que o portão de paridade prova, com um texto de
 * exemplo, em vez de depender de o arquivo real ter o caso difícil dentro.
 */
export function lerEntradas(corpo) {
  const mapa = {};
  for (const casou of corpo.matchAll(/([A-Za-z_]\w*)\s*:\s*((?:[^,\n}()]|\([^)]*\))+)/g)) {
    mapa[casou[1]] = casou[2].trim().replace(/,$/, "");
  }
  return mapa;
}

const entradas = lerEntradas;

/**
 * Lê `tokens.ts` como DADO, e não importando o módulo.
 *
 * Importar exigiria compilar TypeScript dentro de um roteiro de Node, e o
 * portão passaria a depender da compilação para conseguir medir. Ler o texto
 * também é o que os portões do painel fazem com `tokens.css`, então os dois
 * lados da paridade são lidos do mesmo jeito, o que é o mínimo para que a
 * comparação signifique alguma coisa.
 */
export function lerTokensDoApp(caminho = TOKENS_TS) {
  const fonte = semComentarios(readFileSync(caminho, "utf8"));

  const primitivas = {
    violeta: entradas(objeto(fonte, "violeta")),
    tinta: entradas(objeto(fonte, "tinta")),
  };

  const desembrulhar = (bruto) => {
    const texto = bruto.replace(/^["']|["']$/g, "");
    const referencia = /^(violeta|tinta)\.(\w+)$/.exec(bruto.trim());
    if (referencia) {
      const valor = primitivas[referencia[1]][referencia[2]];
      if (valor === undefined) throw new Error(`primitiva inexistente: ${bruto}`);
      return valor.replace(/^["']|["']$/g, "");
    }
    return texto;
  };

  const tema = (nome) => {
    const cru = entradas(objeto(fonte, nome));
    return Object.fromEntries(Object.entries(cru).map(([k, v]) => [k, desembrulhar(v)]));
  };

  const numeros = (nome) => {
    const cru = entradas(objeto(fonte, nome));
    return Object.fromEntries(Object.entries(cru).map(([k, v]) => [k, Number(v)]));
  };

  const escalar = (nome) => {
    const casou = new RegExp(`export const ${nome}\\s*=\\s*([\\d.]+)`).exec(fonte);
    if (!casou) throw new Error(`tokens.ts não declara mais "export const ${nome}"`);
    return Number(casou[1]);
  };

  return {
    violeta: Object.fromEntries(
      Object.entries(primitivas.violeta).map(([k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
    ),
    tinta: Object.fromEntries(
      Object.entries(primitivas.tinta).map(([k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
    ),
    temaClaro: tema("temaClaro"),
    temaEscuro: tema("temaEscuro"),
    papel: tema("papel"),
    espaco: numeros("espaco"),
    raio: numeros("raio"),
    fonte: numeros("fonte"),
    linha: numeros("linha"),
    movimento: numeros("movimento"),
    toque: escalar("toque"),
    fonteMinima: escalar("fonteMinima"),
  };
}

/* ============================================================
   Contraste, pela fórmula da WCAG
   ============================================================ */

export function corDeTexto(texto) {
  const limpo = texto.trim();
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(limpo);
  if (hex) {
    const d = hex[1];
    const cheio = d.length === 3 ? d.split("").map((c) => c + c).join("") : d;
    return {
      r: parseInt(cheio.slice(0, 2), 16),
      g: parseInt(cheio.slice(2, 4), 16),
      b: parseInt(cheio.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(limpo);
  if (rgba) {
    return {
      r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`cor que este portão não sabe ler: ${texto}`);
}

/** Achata transparência sobre o que está atrás, senão o número é ficção. */
export function compor(frente, atras) {
  return {
    r: frente.r * frente.a + atras.r * (1 - frente.a),
    g: frente.g * frente.a + atras.g * (1 - frente.a),
    b: frente.b * frente.a + atras.b * (1 - frente.a),
    a: 1,
  };
}

export function luminancia(c) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

export function contraste(frente, fundo) {
  const composta = frente.a < 1 ? compor(frente, fundo) : frente;
  const a = luminancia(composta);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}
