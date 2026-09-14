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
 * Esvazia todo texto literal, preservando as aspas e o número de linhas.
 *
 * Existe para a conta-conferência de `tocaveis` contar o que `arvoreJsx`
 * CONTA: o leitor de árvore pula texto literal, então uma string que
 * contivesse `"<Pressable ..."` (a mensagem de um teste, por exemplo) faria a
 * contagem crua achar uma abertura a mais e o portão reprovar código inocente.
 * Reprovar quem não errou ensina a afrouxar a regra, e regra afrouxada não
 * volta a apertar sozinha.
 */
export function semTextoLiteral(fonte) {
  let saida = "";
  let aspas = null;
  for (let i = 0; i < fonte.length; i++) {
    const c = fonte[i];
    if (aspas) {
      if (c === "\\") { saida += "  "; i += 1; continue; }
      if (c === aspas) { aspas = null; saida += c; continue; }
      saida += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") aspas = c;
    saida += c;
  }
  return saida;
}

/**
 * As TAGS que este arquivo considera tocáveis.
 *
 * `Tocavel` entra na lista, e sem ele a varredura ficou CEGA no dia em que a
 * frente de movimento migrou os sete tocáveis das telas para a primitiva: de um
 * dia para o outro o portão passou a enxergar seis elementos no aplicativo
 * inteiro, e só não deu verde mudo porque a âncora de quantidade reprovou.
 *
 * A primitiva não dispensa nada: ela exige `accessibilityLabel` e
 * `accessibilityRole` no TIPO, justamente para o que está escrito na fonte
 * continuar sendo a verdade que este portão lê. Um componente que preenchesse
 * sozinho seria um componente que apaga a varredura.
 */
export const TAGS_TOCAVEIS = new Set([
  "Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback", "Tocavel",
]);

/**
 * Recorta a TAG DE ABERTURA de cada elemento tocável, com o número da linha.
 *
 * ## A leitura por LINHA que morava aqui, e por que ela era cega
 *
 * A versão anterior juntava linhas até encontrar uma cujo conteúdo, sem espaço,
 * fosse exatamente `>` ou `/>`, e parava na própria linha quando ela terminasse
 * em `>` precedido de espaço. Nenhum dos dois casos cobre a forma mais comum de
 * todas, que é a tag fechando COLADA no último atributo:
 *
 *     <Pressable onPress={abrir} style={{ minHeight: toque }}>
 *
 * O `>` ali vem depois de `}`, e não de espaço, então a leitura não parava: ela
 * seguia por até sessenta linhas, engolindo os FILHOS do elemento. Treze dos
 * dezessete tocáveis do aplicativo eram lidos assim. O efeito é o pior que um
 * portão pode ter, porque ele inverte o sentido da medida: um tocável mudo
 * passava a "ter" `accessibilityLabel` porque um ícone lá dentro tinha, e um
 * tocável sem altura declarada passava a "ter" piso porque um `View` interno
 * declarava `minHeight: toque`. O portão media o filho e absolvia o pai.
 *
 * ## O que faz agora
 *
 * Usa `arvoreJsx`, que é o leitor que os portões de densidade e de hierarquia
 * já usam: ele pula chave de atributo com aspas respeitadas (então
 * `onPress={() => ...}` não termina a tag no `>` da seta, que era o defeito
 * ORIGINAL desta função) e para no `>` de topo, que é onde a tag de abertura de
 * fato acaba. Cada nó devolve os próprios atributos, e só os próprios.
 *
 * Ter um leitor só é o que o cabeçalho deste arquivo já pedia: parser duplicado
 * vira parser divergente, e aí dois portões passam a medir árvores diferentes.
 *
 * `texto` continua trazendo o nome da tag na frente porque as mensagens dos
 * portões mostram esse trecho, e `<Pressable` sozinho num relatório é mais
 * legível que uma lista de atributos sem dono.
 */
export function tocaveis(fonte) {
  const achados = [];
  const visitar = (nos) => {
    for (const no of nos) {
      if (TAGS_TOCAVEIS.has(no.tag)) {
        achados.push({ linha: no.linha, texto: `<${no.tag}${no.atributos}` });
      }
      visitar(no.filhos);
    }
  };
  visitar(arvoreJsx(fonte));

  /*
    A CONTA-CONFERÊNCIA, e ela é obrigatória: `arvoreJsx` DESFAZ o elemento que
    nunca fecha (é o que impede um genérico mal lido de sequestrar o resto do
    arquivo), e desfazer quer dizer sumir. Um tocável que sumisse assim ficaria
    invisível para os três casos do portão de acessibilidade, calado e verde,
    que é exatamente a doença que esta função acabou de sair de ter.

    Aqui a divergência ESTOURA, e não devolve a lista menor. É o mesmo critério
    que `lerEntradas` já segue neste arquivo: parser que lê metade é pior que
    parser que explode, porque metade passa despercebida.
  */
  const aberturas = (semTextoLiteral(fonte).match(
    new RegExp(`<(?:${[...TAGS_TOCAVEIS].join("|")})(?![A-Za-z])`, "g"),
  ) ?? []).length;
  if (aberturas !== achados.length) {
    throw new Error(
      `a leitura da árvore achou ${achados.length} tocáveis e o texto tem ${aberturas} `
      + "aberturas. Algum elemento não fecha, ou o leitor de árvore o perdeu pelo "
      + "caminho, e um tocável perdido é um tocável que nenhuma das três regras mede.",
    );
  }
  return achados.sort((a, b) => a.linha - b.linha);
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
    fonteMinimaDeInteracao: escalar("fonteMinimaDeInteracao"),
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

/* ============================================================
   A árvore de elementos
   ============================================================ */

/**
 * Recorta a ÁRVORE de elementos do arquivo, e não só as tags soltas.
 *
 * `tocaveis()`, logo acima, lê elemento por elemento, e isso bastou para as
 * três perguntas que os portões faziam até agora: alvo de toque, rótulo de
 * acessibilidade e valor escrito à mão. Nenhuma delas depende de onde o
 * elemento está.
 *
 * A pergunta do portão de densidade depende, e só ela: "quantos blocos com
 * fundo preenchido coexistem DENTRO da mesma peça". Sem aninhamento não há
 * "dentro", e uma varredura linear responderia sempre a mesma coisa (o arquivo
 * inteiro tem muitos), que é verde garantido e prova nenhuma.
 *
 * ## O que o leitor faz para não se enganar
 *
 * 1. **Só nome com inicial maiúscula abre elemento.** Em React Native todo
 *    componente é assim, e isso já descarta `i < linhas.length`.
 * 2. **`<` colado num identificador NÃO abre elemento.** É o que separa
 *    `useState<Tema>` e `Record<Severidade, TomDoChip>` de um `<Tema>` de
 *    verdade. Sem esta regra, um genérico do topo do arquivo empilhava uma tag
 *    que nunca fecha, e todo elemento seguinte virava filho dela.
 * 3. **Chave em atributo é pulada inteira, com aspas respeitadas.** É por isso
 *    que `onPress={() => ...}` não termina a tag no `>` da seta, que é o
 *    defeito exato que `tocaveis()` já tinha documentado.
 * 4. **Expressão de atributo é varrida à parte e vira filha.** `renderItem={()
 *    => <Cartao>...</Cartao>}` desenha um cartão DENTRO da lista, e um leitor
 *    que pulasse a chave não veria o cartão nenhuma vez.
 * 5. **Fechamento que não casa não engole o resto.** Ao fechar `</View>`, tudo
 *    que ficou aberto por engano é desfeito e os filhos sobem para o pai. Sem
 *    isso, um único engano deslocaria a árvore inteira do arquivo.
 *
 * O que ele NÃO faz, dito na cara: não é um analisador de TypeScript, não
 * resolve componente que se monta em tempo de execução e não sabe o que um
 * `props.children` vindo de outro arquivo desenha. É o mesmo limite dos outros
 * portões daqui, e está escrito no cabeçalho deste arquivo.
 */
export function arvoreJsx(fonte, linhaBase = 1) {
  const IDENTIFICADOR = /[A-Za-z0-9_$]/;
  const raizes = [];
  const pilha = [];

  const filhosDe = (no) => (no ? no.filhos : raizes);
  const linhaEm = (indice) => linhaBase + (fonte.slice(0, indice).match(/\n/g)?.length ?? 0);

  /** Fim de um texto literal, com escape respeitado. */
  function fimDoTexto(inicio) {
    const aspas = fonte[inicio];
    let k = inicio + 1;
    while (k < fonte.length) {
      if (fonte[k] === "\\") { k += 2; continue; }
      if (fonte[k] === aspas) return k + 1;
      k += 1;
    }
    return k;
  }

  /** Fim de um grupo `{...}` equilibrado, pulando texto literal por dentro. */
  function fimDaChave(inicio) {
    let profundidade = 0;
    let k = inicio;
    while (k < fonte.length) {
      const c = fonte[k];
      if (c === '"' || c === "'" || c === "`") { k = fimDoTexto(k); continue; }
      if (c === "{") profundidade += 1;
      if (c === "}") {
        profundidade -= 1;
        if (profundidade === 0) return k + 1;
      }
      k += 1;
    }
    return k;
  }

  /*
    Desfaz o que ficou aberto por engano, subindo os filhos para o pai.

    Um genérico que escapou da regra 2, ou uma tag que este leitor não soube
    fechar, não pode sequestrar o resto do arquivo: o custo do engano fica no
    elemento enganado, e não na árvore toda.
  */
  function desfazer(no) {
    const pai = pilha[pilha.length - 1];
    const irmaos = filhosDe(pai);
    const posicao = irmaos.indexOf(no);
    if (posicao >= 0) irmaos.splice(posicao, 1, ...no.filhos);
  }

  function fecharAte(nome) {
    let alvo = -1;
    for (let k = pilha.length - 1; k >= 0; k--) {
      if (pilha[k].tag === nome) { alvo = k; break; }
    }
    // Fechamento sem abertura correspondente: ignorado, e a pilha fica de pé.
    if (alvo === -1) return;
    while (pilha.length - 1 > alvo) desfazer(pilha.pop());
    pilha.pop();
  }

  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];

    if (c === '"' || c === "'" || c === "`") { i = fimDoTexto(i); continue; }

    if (c === "<" && fonte[i + 1] === "/") {
      const casou = /^<\/\s*([A-Za-z][\w.$]*)\s*>/.exec(fonte.slice(i, i + 120));
      if (casou) { fecharAte(casou[1]); i += casou[0].length; continue; }
      i += 1;
      continue;
    }

    if (c === "<" && /[A-Z]/.test(fonte[i + 1] ?? "")) {
      if (IDENTIFICADOR.test(fonte[i - 1] ?? " ")) { i += 1; continue; }
      const nome = /^<([A-Z][\w.$]*)/.exec(fonte.slice(i, i + 120))?.[1];
      if (!nome) { i += 1; continue; }

      let j = i + 1 + nome.length;
      let atributos = "";
      const expressoes = [];
      let autoFechado = false;
      let fechou = false;

      while (j < fonte.length) {
        const d = fonte[j];
        if (d === '"' || d === "'" || d === "`") {
          const fim = fimDoTexto(j);
          atributos += fonte.slice(j, fim);
          j = fim;
          continue;
        }
        if (d === "{") {
          const fim = fimDaChave(j);
          const dentro = fonte.slice(j + 1, fim - 1);
          const elementos = arvoreJsx(dentro, linhaEm(j));
          expressoes.push(...elementos);
          /*
            Expressão que CARREGA elemento não entra no texto dos atributos, e
            a que não carrega entra inteira.

            A diferença custou um defeito de contagem. `style={{ backgroundColor:
            ... }}` precisa entrar, senão o portão de densidade deixa de
            enxergar todo fundo escrito à mão. Já `renderItem={() => <View
            style={{ backgroundColor: ... }}>}` não pode entrar: o fundo mora no
            elemento de dentro, que já vira filho aqui, e copiar o texto para os
            atributos da lista faz o MESMO fundo ser contado duas vezes, uma na
            lista e outra no filho. Quem pegou foi o caso que reproduz o cartão
            da reclamação: ele esperava três blocos e a leitura devolvia quatro.
          */
          atributos += elementos.length > 0 ? "{}" : fonte.slice(j, fim);
          j = fim;
          continue;
        }
        if (d === ">") {
          autoFechado = atributos.trimEnd().endsWith("/");
          j += 1;
          fechou = true;
          break;
        }
        atributos += d;
        j += 1;
      }
      // Tag que não fecha até o fim do arquivo: não é JSX, e nada nasce dela.
      if (!fechou) { i += 1; continue; }

      const no = { tag: nome, linha: linhaEm(i), atributos, filhos: [...expressoes] };
      filhosDe(pilha[pilha.length - 1]).push(no);
      if (!autoFechado) pilha.push(no);
      i = j;
      continue;
    }

    i += 1;
  }

  while (pilha.length > 0) desfazer(pilha.pop());
  return raizes;
}

/**
 * AS PEÇAS: cada uma é um recipiente que o olho lê como uma coisa só.
 *
 * Nasceu dentro do portão de densidade, para a R1 ("um bloco preenchido por
 * peça") ter onde contar. Mora aqui desde que a régua de hierarquia passou a
 * precisar da MESMA noção para a H1 ("um protagonista por peça"): as duas
 * perguntas são "quantos X coexistem dentro do que o olho lê junto", e duas
 * listas de peças para uma noção só é o defeito que o cabeçalho deste arquivo
 * já nomeia para os parsers (duas leituras divergem, e aí dois portões passam a
 * medir árvores diferentes).
 *
 * `Tocavel` está na lista porque o cartão da lista de tarefas É um `Tocavel`: o
 * cartão inteiro é o botão. Sem ele, o que está dentro do cartão subiria para o
 * item de lista e se misturaria ao que está fora dele.
 */
export const PECAS = new Set([
  "Cartao", "ItemDeLista", "Secao", "Tocavel",
  "ScrollView", "FlatList", "SectionList", "Modal", "Dialogo",
]);

/**
 * Uma `View` que ocupa a tela inteira TAMBÉM é uma peça, e ela precisa ser.
 *
 * A tela de vistoria é o caso: a tarja de erro fica FORA da rolagem, presa no
 * alto, porque o formulário passa de dois mil pontos e um erro desenhado no
 * meio dele acontece onde ninguém está olhando. Sem esta regra, a tarja não
 * teria peça nenhuma a que pertencer e cairia no balde do arquivo, junto com
 * tudo que as OUTRAS telas daquele mesmo arquivo desenham. Balde de arquivo
 * soma coisas que nunca aparecem juntas, e soma errado.
 */
export function ePeca(no) {
  if (PECAS.has(no.tag)) return true;
  return no.tag === "View" && /\bflex\s*:\s*1\b/.test(no.atributos);
}

/**
 * O valor de um atributo, quando ele é texto literal.
 *
 * Devolve `null` quando o atributo existe mas o valor vem de expressão
 * (`tom={estado.tom}`), e `undefined` quando ele não existe. A diferença é o
 * que permite ao portão ser CONSERVADOR no caso certo: valor que só existe em
 * tempo de execução conta como o pior caso, e atributo ausente cai no padrão
 * declarado pelo componente.
 */
export function atributoLiteral(atributos, nome) {
  const literal = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*"([^"]*)"`).exec(atributos);
  if (literal) return literal[1];
  const expressao = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*\\{`).test(atributos);
  if (expressao) return null;
  return undefined;
}
