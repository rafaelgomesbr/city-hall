/**
 * A DENSIDADE VISUAL do aplicativo de campo, verificada por máquina.
 *
 * O relato que abriu esta frente é de quem paga, com a lista de tarefas aberta
 * no iPhone: "essa tela tá extremamente poluída com textos coloridos pra todo
 * lado". Ele tem razão, e a causa é estrutural, não descuido.
 *
 * Cinco frentes refizeram cinco telas em paralelo. Todas obedeceram à regra da
 * casa, escrita no topo de `src/ui/componentes.tsx`: nada se comunica só por
 * cor. Todas a obedeceram do jeito mais direto, acrescentando um bloco com
 * fundo próprio, ícone e palavra. Cada decisão está certa sozinha; somadas,
 * num cartão só da lista, viraram quatro blocos coloridos empilhados, três
 * deles com fundo cheio.
 *
 * **Nada disso aparecia em teste nenhum, porque teste nenhum media quantos
 * blocos coloridos um cartão tem.** É essa a pergunta que este portão passa a
 * fazer, e a régua que ele cobra está escrita, com as razões, em
 * `apps/campo/src/ui/regua.ts`.
 *
 * ## O que é medido aqui
 *
 * 1. **R1: um bloco preenchido por peça.** Peça é o cartão, o item de lista, a
 *    seção e a tela. Precisa de ÁRVORE e não de texto solto: sem aninhamento
 *    não existe "dentro da mesma peça", e uma contagem linear responderia
 *    sempre "o arquivo tem muitos", que é verde garantido e prova nenhuma. A
 *    árvore vem de `arvoreJsx`, em `fonte-do-aplicativo.mjs`, com os enganos
 *    que ela sabe evitar escritos lá.
 * 2. **R3 e R5 continuam ligadas no componente.** As duas moram em
 *    `pesoEfetivo`, e a contagem de R1 CONFIA nelas: um chip `ok` não é
 *    contado como bloco preenchido porque a régua promete que ele não pinta.
 *    Promessa que o portão assume e não verifica é exatamente o caso que não
 *    sabe falhar, então aqui ela é verificada duas vezes: a lista é lida do
 *    próprio `regua.ts`, e o `Chip` e o `Aviso` precisam estar chamando
 *    `pesoEfetivo`. O terceiro lado da prova é renderizado, e mora em
 *    `apps/campo/src/ui/chip.test.tsx` e `aviso-e-vazio.test.tsx`.
 * 3. **R5 é PROVADA por cálculo, e não aceita por confiança.** O portão mede
 *    `sevCriticaTexto` sobre o cartão claro e exige que qualquer tom cujo
 *    texto reprove em AA sem o fundo dele esteja na lista dos que não aleviam.
 *
 * ## O que este portão NÃO faz, dito na cara
 *
 * - Ele lê o que está ESCRITO, não o que o React Native desenha. Fundo montado
 *   a partir de um valor que vem de fora do arquivo (uma propriedade, por
 *   exemplo) passa por ele. É o mesmo limite dos outros portões daqui, e está
 *   escrito no cabeçalho de `fonte-do-aplicativo.mjs`.
 * - Ele não mede pílula NEUTRA. `superficie2` é superfície do tema, não
 *   recado, e contá-la transformaria a régua numa proibição de agrupar coisas.
 *   O custo disso é real e está assumido: dez pílulas neutras iguais, uma por
 *   linha de uma lista, viram textura, e quem pega isso é a revisão, não este
 *   arquivo.
 * - Ele não mede quantidade de TEXTO colorido fora de `Chip` e `Aviso`. A cor
 *   de texto solta (o prazo na linha dele, por exemplo) é justamente o peso
 *   leve que a régua pede, e puni-la empurraria a tela de volta para o bloco.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RAIZ_DO_APP,
  arquivosDeFonte,
  arvoreJsx,
  atributoLiteral,
  contraste,
  corDeTexto,
  ePeca,
  lerTokensDoApp,
  nomeCurto,
  PECAS,
  semComentarios,
} from "./fonte-do-aplicativo.mjs";

const REGUA_TS = join(RAIZ_DO_APP, "ui", "regua.ts");
const tokens = lerTokensDoApp();

/* ============================================================
   1. A régua, lida de onde ela mora
   ============================================================ */

/**
 * As duas listas saem de `regua.ts`, e não são reescritas aqui.
 *
 * Reescrever seria criar a segunda cópia da mesma regra, que é o defeito que a
 * própria régua cita como motivo de existir. Com a leitura, acrescentar um tom
 * à lista do componente muda o que este portão mede, na mesma execução.
 */
function lerListaDaRegua(fonte, nome) {
  const casou = new RegExp(
    `export const ${nome}\\s*:[^=]*=\\s*\\[([^\\]]*)\\]`,
  ).exec(fonte);
  assert.ok(casou, `regua.ts não declara mais "export const ${nome}"`);
  return casou[1]
    .split(",")
    .map((p) => p.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const fonteDaRegua = semComentarios(readFileSync(REGUA_TS, "utf8"));
const NUNCA_PREENCHEM = new Set(lerListaDaRegua(fonteDaRegua, "TONS_QUE_NUNCA_PREENCHEM"));
const NUNCA_ALEVIAM = new Set(lerListaDaRegua(fonteDaRegua, "TONS_QUE_NUNCA_ALEVIAM"));

/* ============================================================
   2. O que conta como bloco preenchido
   ============================================================ */

/** Os tokens de fundo que são RECADO, e não superfície do tema. */
const FUNDO_SEMANTICO = /tema\.(ok|alerta|perigo|sevBaixa|sevMedia|sevAlta|sevCritica)Fundo\b/;

/*
  As peças e `ePeca` moram em `fonte-do-aplicativo.mjs` desde 14/09/2026.

  Elas nasceram aqui, para a R1 ter onde contar ("um bloco preenchido por
  peça"). A régua de hierarquia passou a precisar da MESMA noção para a H1 ("um
  protagonista por peça"), e duas listas de peças para uma noção só é o defeito
  que o cabeçalho daquele arquivo nomeia: duas leituras divergem, e aí os dois
  portões passam a medir árvores diferentes sem ninguém perceber.
*/

/**
 * Onde o vocabulário de preenchimento é DEFINIDO, e por isso não é medido.
 *
 * `Chip` e `Aviso` têm, cada um, o mapa completo de tom para fundo dentro de
 * si: é o arquivo inteiro do componente que "menciona" `okFundo` e
 * `perigoFundo`, e a leitura por aproximação de `fundoEscritoAMao` (que é o que
 * permite seguir `coresDoPrazo.fundo` numa tela) enxerga os dois no mesmo
 * arquivo e conclui que há um empilhamento. Não há: cada um desenha um bloco
 * só, por chamada.
 *
 * A dispensa é do balde do ARQUIVO e de mais nada, e ela não deixa os dois sem
 * portão: eles são os únicos do produto com prova RENDERIZADA das regras da
 * régua, em `ui/chip.test.tsx` e `ui/aviso-e-vazio.test.tsx`, que é a única
 * forma de provar que `pesoEfetivo` produz o desenho certo e não só que ele é
 * chamado.
 */
const ONDE_O_PREENCHIMENTO_E_DEFINIDO = new Set(["ui/Chip.tsx", "ui/componentes.tsx"]);

/**
 * O bloco preenchido, com o nome do que ele é.
 *
 * Três coisas contam, e o critério de cada uma é conservador na direção certa:
 * quando o portão não consegue saber, ele conta. Um falso positivo custa um
 * `peso="leve"` escrito à mão; um falso negativo custa a reclamação de novo.
 */
function blocoPreenchido(no, fonteDoArquivo) {
  const leve = atributoLiteral(no.atributos, "peso") === "leve";

  /*
    A pílula de severidade conta SEMPRE, mesmo pedindo leve, e isso não é
    descuido da leitura: pela R5 ela não alevia quando a ocorrência é crítica,
    e o portão não tem como saber, lendo a fonte, qual severidade vai chegar
    ali em tempo de execução. Contar sempre é a leitura honesta, e ela também é
    a leitura de projeto: a marca de gravidade é justamente quem deve ficar com
    o único fundo cheio da peça.
  */
  if (no.tag === "SeloSeveridade") return "selo de severidade";

  if (no.tag === "Aviso" || no.tag === "Chip") {
    if (leve) return null;
    const tom = atributoLiteral(no.atributos, "tom");
    // Atributo ausente: o padrão dos dois componentes é neutro, que não pinta.
    if (tom === undefined) return null;
    // Tom vindo de expressão: pior caso, porque pode ser perigo.
    if (tom === null) return `${no.tag} com tom decidido em tempo de execução`;
    if (NUNCA_PREENCHEM.has(tom)) return null;
    if (tom === "neutro" || tom === "info") return null;
    return `${no.tag} tom="${tom}"`;
  }

  const fundo = fundoEscritoAMao(no.atributos, fonteDoArquivo);
  return fundo ? `fundo ${fundo}` : null;
}

/**
 * Fundo semântico escrito direto no estilo, inclusive através de UM salto.
 *
 * O salto não é luxo: a tela de vistoria pintava a pílula de prazo com
 * `coresDoPrazo.fundo`, e a lista de tarefas pinta a faixa com
 * `coresDaFaixa.fundo`. As duas constantes são ternários que escolhem entre
 * `perigoFundo`, `alertaFundo` e `superficie2`. Sem resolver o salto, os dois
 * blocos mais coloridos do aplicativo seriam invisíveis para o portão, e ele
 * daria verde exatamente sobre o que motivou a frente.
 *
 * A resolução é por APROXIMAÇÃO: basta o inicializador da constante mencionar
 * um fundo semântico para o bloco contar. É o lado seguro, porque um ternário
 * que às vezes pinta de vermelho é um bloco que às vezes pinta de vermelho.
 */
function fundoEscritoAMao(atributos, fonteDoArquivo) {
  for (const casou of atributos.matchAll(/backgroundColor\s*:\s*([^,\n}]+)/g)) {
    const valor = casou[1];
    const direto = FUNDO_SEMANTICO.exec(valor);
    if (direto) return direto[0];

    for (const nome of new Set(valor.match(/\b[a-zA-Z_$][\w$]*\b/g) ?? [])) {
      if (nome === "tema") continue;
      const declaracao = new RegExp(`const\\s+${nome}\\s*=([\\s\\S]*?);\\s*\\n`)
        .exec(fonteDoArquivo);
      if (!declaracao) continue;
      const indireto = FUNDO_SEMANTICO.exec(declaracao[1]);
      if (indireto) return `${nome} (${indireto[0]})`;
    }
  }
  return null;
}

/* ============================================================
   3. A varredura
   ============================================================ */

/**
 * Mede uma peça de cada vez, atribuindo cada bloco à peça mais PRÓXIMA.
 *
 * Peça dentro de peça conta separado, e é isso que faz a medida significar
 * alguma coisa: um cartão com um bloco preenchido dentro de uma tela com outro
 * não é uma tela com dois, porque o olho nunca lê os dois como um empilhamento.
 */
function medir(caminho) {
  const fonte = semComentarios(readFileSync(caminho, "utf8"));
  const arquivo = nomeCurto(caminho);
  const medidas = [];

  function visitar(filhos, peca, linha) {
    const blocos = [];
    const fila = [...filhos];
    while (fila.length > 0) {
      const no = fila.shift();
      if (ePeca(no)) {
        visitar(no.filhos, no.tag, no.linha);
        continue;
      }
      const bloco = blocoPreenchido(no, fonte);
      if (bloco) blocos.push({ linha: no.linha, oQue: bloco });
      fila.push(...no.filhos);
    }
    medidas.push({ arquivo, peca, linha, blocos });
  }

  /*
    A raiz do arquivo é uma peça também, e sem isso o portão teria um buraco
    do tamanho de uma tela: o que fica FORA de toda rolagem (a tarja de erro da
    vistoria, por exemplo, que é presa no alto da tela de propósito) não teria
    nenhuma peça para pertencer.
  */
  visitar(arvoreJsx(fonte), "arquivo", 1);
  return ONDE_O_PREENCHIMENTO_E_DEFINIDO.has(arquivo)
    ? medidas.filter((m) => m.peca !== "arquivo")
    : medidas;
}

const ARQUIVOS = arquivosDeFonte().filter((c) => /\.tsx$/.test(c));
const MEDIDAS = ARQUIVOS.flatMap(medir);

/** O teto da R1. Um, e o parágrafo que sustenta o número está em `regua.ts`. */
const TETO = 1;

/**
 * Pendência nomeada, com dono, medida e com data de morte.
 *
 * `(agente)/index.tsx` é a tela da reclamação, e ela é a ÚNICA que não foi
 * corrigida nesta frente: quem paga estava com ela aberta no aparelho enquanto
 * este portão era escrito, e outra frente tem o arquivo na mão. Tirá-la da
 * varredura deixaria o portão verde sobre exatamente o cartão que motivou a
 * régua, que é a pior forma de portão cego que existe.
 *
 * Então ela é MEDIDA, o número sai impresso na execução, e a dívida está aqui
 * com o nome de quem a paga. O que a régua implica lá, item a item:
 *
 * - o cartão (`Tocavel`) tem três: a pílula de severidade, a tarja âmbar de
 *   vulnerabilidade e o chip verde de coleta. Pela R3 o chip verde já não
 *   pinta mais nada, porque `pesoEfetivo` o alevia sozinho; sobram dois, e
 *   pela R2 o fundo cheio fica com a severidade, que é a gravidade do fato. A
 *   vulnerabilidade vira ícone mais palavra em `alertaTexto`, sem tarja, na
 *   linha dela;
 * - fora do cartão (`ItemDeLista`) há dois avisos, o da devolução recusada e o
 *   do resultado do envio. Os dois nunca aparecem juntos no mesmo instante,
 *   mas o portão não sabe disso lendo a fonte: um `peso="leve"` no do
 *   resultado do envio resolve, e é o certo de qualquer jeito, porque
 *   confirmação de envio é o caso normal.
 *
 * E a pendência sabe morrer: o último caso deste arquivo REPROVA no dia em que
 * `index.tsx` passar a caber na régua com o nome ainda escrito aqui.
 */
const PENDENTES = new Map([
]);

test("R1: nenhuma peça empilha mais de um bloco preenchido", () => {
  const reprovados = [];
  const pendentes = [];

  for (const medida of MEDIDAS) {
    if (medida.blocos.length <= TETO) continue;
    const linha = `${medida.arquivo}: ${medida.peca} da linha ${medida.linha} tem `
      + `${medida.blocos.length} blocos preenchidos (teto ${TETO})\n`
      + medida.blocos.map((b) => `        linha ${b.linha}: ${b.oQue}`).join("\n");
    if (PENDENTES.has(medida.arquivo)) pendentes.push(linha);
    else reprovados.push(linha);
  }

  if (pendentes.length > 0) {
    /*
      Impresso de propósito, pelo mesmo motivo do portão de acessibilidade:
      pendência calada é pendência esquecida, e quem roda a suíte precisa ver o
      número mesmo quando ele não reprova.
    */
    console.log(`\n  PENDENTE, declarado em PENDENTES:\n      ${pendentes.join("\n      ")}`);
  }

  assert.deepEqual(
    reprovados,
    [],
    "peça com mais de um bloco preenchido. A régua está em apps/campo/src/ui/regua.ts: "
    + "escolha qual dos blocos é o mais grave (R2), deixe esse forte e passe "
    + `peso="leve" nos outros.\n${reprovados.join("\n")}`,
  );
});

test("a varredura enxerga o aplicativo de verdade", () => {
  /*
    A âncora que já salvou dois portões deste diretório de nascerem cegos. Sem
    ela, um engano no leitor de árvore (uma tag que não fecha, um nome de peça
    escrito errado) produz zero peça e zero bloco, e "nenhuma peça passou do
    teto" vira verdade vazia.
  */
  assert.ok(
    MEDIDAS.length >= 60,
    `a varredura achou só ${MEDIDAS.length} peças no aplicativo inteiro: o leitor de árvore quebrou`,
  );
  const blocos = MEDIDAS.reduce((soma, m) => soma + m.blocos.length, 0);
  assert.ok(
    blocos >= 20,
    `a varredura achou só ${blocos} blocos preenchidos: ou o aplicativo perdeu a cor, ou a leitura quebrou`,
  );

  // As quatro telas do relato precisam estar entre as varridas, pelo nome.
  const arquivos = new Set(MEDIDAS.map((m) => m.arquivo));
  for (const tela of [
    "app/(agente)/index.tsx",
    "app/(agente)/fila.tsx",
    "app/(agente)/perfil.tsx",
    "app/(agente)/vistoria/[id].tsx",
  ]) {
    assert.ok(arquivos.has(tela), `${tela} ficou de fora da varredura`);
  }

  // E a peça mais importante do produto precisa ter sido encontrada onde ela está.
  const cartaoDaTarefa = MEDIDAS.filter(
    (m) => m.arquivo === "app/(agente)/index.tsx" && m.peca === "Tocavel",
  );
  assert.ok(
    cartaoDaTarefa.length > 0,
    "o cartão da lista de tarefas é um Tocavel e a varredura não achou nenhum ali",
  );
});

test("a varredura pega o cartão da reclamação, bloco a bloco", () => {
  /*
    O CASO QUE PROVA A PRÓPRIA VARREDURA.

    O texto abaixo é o cartão do relato, reduzido ao osso: quatro blocos
    preenchidos dentro de um cartão só, três deles um embaixo do outro. Ele
    mora aqui, e não é lido de `index.tsx`, por duas razões. A primeira é que a
    prova precisa continuar valendo depois de `index.tsx` ser corrigido, e um
    portão que só sabe medir o defeito enquanto ele existe morre junto com ele.
    A segunda é que assim a contagem é verificável à mão: são quatro, estão
    escritos ali, e qualquer pessoa confere em dez segundos.

    O genérico e a expressão de atributo no meio do texto não são enfeite: são
    os dois enganos que derrubariam o leitor de árvore. `useState<Tema>` empilha
    uma tag que nunca fecha, e `renderItem={...}` esconde um cartão inteiro
    dentro de uma chave de atributo.
  */
  const cartaoDoRelato = `
    const [aberto, setAberto] = useState<Tema>(temaEscuro);
    return (
      <FlatList
        renderItem={() => (
          <ItemDeLista>
            <Tocavel accessibilityRole="button" onPress={() => abrir(t.id)}>
              <View>
                <Txt mono>{t.protocolo}</Txt>
                <SeloSeveridade severidade={t.severidade} />
              </View>
              <View style={{ backgroundColor: tema.alertaFundo }}>
                <Txt>Vulnerabilidade social</Txt>
              </View>
              <Chip texto="Coletada" simbolo="v" tom="ok" />
              <Aviso tom="perigo">O servidor recusou.</Aviso>
            </Tocavel>
          </ItemDeLista>
        )}
      />
    );
  `;

  const arvore = arvoreJsx(cartaoDoRelato);
  const achados = [];
  const fila = [...arvore];
  const pecas = [];
  while (fila.length > 0) {
    const no = fila.shift();
    if (PECAS.has(no.tag)) pecas.push(no.tag);
    const bloco = blocoPreenchido(no, cartaoDoRelato);
    if (bloco) achados.push(bloco);
    fila.push(...no.filhos);
  }

  assert.deepEqual(
    pecas,
    ["FlatList", "ItemDeLista", "Tocavel"],
    "o leitor perdeu o aninhamento: o cartão vive dentro de uma expressão de atributo, "
    + "e `Tema` do genérico não pode virar peça nenhuma",
  );

  /*
    Três e não quatro, e a diferença É a régua funcionando: o chip verde deixou
    de contar porque a R3 tirou o fundo dele dentro do componente. Os três que
    sobram são exatamente os que a R2 manda hierarquizar.
  */
  assert.deepEqual(
    achados.sort(),
    ["Aviso tom=\"perigo\"", "fundo tema.alertaFundo", "selo de severidade"].sort(),
    "a varredura não enxergou os blocos preenchidos do cartão do relato",
  );

  // E o mesmo cartão, corrigido pela régua, precisa passar a caber nela.
  const corrigido = cartaoDoRelato
    .replace('tom="ok"', 'tom="ok" peso="leve"')
    .replace('<Aviso tom="perigo">', '<Aviso tom="perigo" peso="leve">')
    .replace("backgroundColor: tema.alertaFundo", "borderLeftColor: tema.alertaTexto");
  const depois = [];
  const outraFila = [...arvoreJsx(corrigido)];
  while (outraFila.length > 0) {
    const no = outraFila.shift();
    const bloco = blocoPreenchido(no, corrigido);
    if (bloco) depois.push(bloco);
    outraFila.push(...no.filhos);
  }
  assert.deepEqual(
    depois,
    ["selo de severidade"],
    "depois da correção precisa sobrar exatamente um bloco preenchido, o da gravidade",
  );
});

test("a varredura não confunde o que está calmo com o que grita", () => {
  /*
    O outro lado da prova, e o que ele impede é específico: um portão que
    contasse fundo NEUTRO como bloco preenchido reprovaria metade do
    aplicativo, e a saída natural de quem estivesse com pressa seria afrouxar o
    teto até tudo passar. Aí a régua morre por excesso de zelo, que é um jeito
    de morrer tão eficiente quanto a cegueira.
  */
  const calmo = `
    <Cartao>
      <View style={{ backgroundColor: tema.superficie2 }}><Txt>O que fazer</Txt></View>
      <Chip texto="Agente" simbolo="e" tom="neutro" />
      <Chip texto="Enviada" simbolo="v" tom="ok" />
      <Aviso tom="info">Ela sobe sozinha.</Aviso>
      <Aviso tom="sucesso" titulo="Pronto">O pedido saiu.</Aviso>
      <View style={{ backgroundColor: tema.destaque }} />
      <View style={{ backgroundColor: "transparent" }} />
    </Cartao>
  `;
  const achados = [];
  const fila = [...arvoreJsx(calmo)];
  while (fila.length > 0) {
    const no = fila.shift();
    const bloco = blocoPreenchido(no, calmo);
    if (bloco) achados.push(`${no.tag}: ${bloco}`);
    fila.push(...no.filhos);
  }
  assert.deepEqual(achados, [], "a varredura reclamou de peça que não pinta cor semântica nenhuma");

  /*
    E o salto de uma constante local precisa continuar sendo seguido, senão a
    pílula de prazo volta a ser invisível para o portão.
  */
  const comSalto = `
    const coresDoPrazo = prazo.vencido
      ? { fundo: tema.perigoFundo, cor: tema.perigoTexto }
      : { fundo: tema.superficie2, cor: tema.textoDiscreto };
    <View style={{ backgroundColor: coresDoPrazo.fundo }} />
  `;
  const noDoSalto = arvoreJsx(comSalto)[0];
  assert.match(
    blocoPreenchido(noDoSalto, comSalto) ?? "",
    /coresDoPrazo/,
    "o portão parou de seguir o fundo que passa por uma constante local",
  );
});

/* ============================================================
   4. A régua e os componentes precisam continuar concordando
   ============================================================ */

test("R3 e R5 continuam ligadas, e o Chip e o Aviso continuam obedecendo", () => {
  /*
    A contagem de R1 CONFIA nas duas regras: ela não conta um chip `ok` porque
    a régua promete que ele não pinta. Se alguém apagar `pesoEfetivo` de dentro
    do `Chip`, a promessa deixa de valer e o portão continuaria contando de
    menos, verde e errado. Este caso é o que impede isso.

    O terceiro lado da prova é RENDERIZADO e não mora aqui: `jest-expo` monta o
    componente e confere que o estilo não tem fundo. Ler a fonte prova que a
    chamada existe; só a renderização prova que ela produz o desenho certo.
  */
  assert.ok(NUNCA_PREENCHEM.has("ok"), "o tom `ok` do Chip saiu da R3");
  assert.ok(NUNCA_PREENCHEM.has("sucesso"), "o tom `sucesso` do Aviso saiu da R3");
  assert.ok(NUNCA_ALEVIAM.has("sevCritica"), "`sevCritica` saiu da R5, e ver o caso abaixo");

  for (const arquivo of ["ui/Chip.tsx", "ui/componentes.tsx"]) {
    const fonte = semComentarios(readFileSync(join(RAIZ_DO_APP, arquivo), "utf8"));
    assert.match(
      fonte,
      /pesoEfetivo\s*\(/,
      `${arquivo} parou de chamar pesoEfetivo: a R3 e a R5 deixaram de valer, `
      + "e a contagem de R1 deste portão passou a contar de menos",
    );
  }
});

test("R5 é aritmética, e o portão refaz a conta", () => {
  /*
    Este caso é o que separa a R5 de uma opinião. Ele mede, nos dois temas, o
    contraste do texto de cada tom sobre as superfícies em que um bloco LEVE
    seria desenhado, e exige que todo tom que reprova esteja na lista dos que
    não aleviam.

    O número que o motivou: `sevCriticaTexto` é branco nos dois temas, porque
    ele foi escolhido para ficar em cima de vermelho. Sobre o cartão claro ele
    mede 1.00:1. Uma pílula crítica em peso leve seria uma pílula invisível na
    ocorrência mais grave que este produto sabe registrar.

    A direção da prova importa: ele não confere que `sevCritica` está na lista
    (isso o caso acima já faz), ele confere que NINGUÉM que reprova está fora
    dela. No dia em que um tom novo entrar com texto claro demais, é aqui que
    aparece, antes de virar pílula invisível em campo.
  */
  const AA_TEXTO = 4.5;
  const SUPERFICIES = ["superficie", "superficie2", "fundo"];
  const TONS = [
    { tom: "ok", cor: "okTexto" },
    { tom: "sucesso", cor: "okTexto" },
    { tom: "alerta", cor: "alertaTexto" },
    { tom: "perigo", cor: "perigoTexto" },
    { tom: "sevBaixa", cor: "sevBaixaTexto" },
    { tom: "sevMedia", cor: "sevMediaTexto" },
    { tom: "sevAlta", cor: "sevAltaTexto" },
    { tom: "sevCritica", cor: "sevCriticaTexto" },
  ];

  const deveriamNaoAleviar = [];
  for (const { tom, cor } of TONS) {
    for (const tema of ["temaClaro", "temaEscuro"]) {
      for (const superficie of SUPERFICIES) {
        const razao = contraste(
          corDeTexto(tokens[tema][cor]),
          corDeTexto(tokens[tema][superficie]),
        );
        if (razao >= AA_TEXTO) continue;
        if (NUNCA_ALEVIAM.has(tom)) continue;
        deveriamNaoAleviar.push(
          `${tom}: ${cor} sobre ${superficie} em ${tema} = ${razao.toFixed(2)}:1 `
          + `(mínimo ${AA_TEXTO}:1), e o tom NÃO está em TONS_QUE_NUNCA_ALEVIAM`,
        );
      }
    }
  }

  assert.deepEqual(
    deveriamNaoAleviar,
    [],
    "tom que reprova em AA sem o fundo dele e mesmo assim pode ser desenhado leve. "
    + "Ou ele entra em TONS_QUE_NUNCA_ALEVIAM, em apps/campo/src/ui/regua.ts, ou a cor "
    + `de texto dele muda:\n${deveriamNaoAleviar.join("\n")}`,
  );

  // E a âncora: o caso acima precisa estar medindo o número que o motivou.
  const criticaNoClaro = contraste(
    corDeTexto(tokens.temaClaro.sevCriticaTexto),
    corDeTexto(tokens.temaClaro.superficie),
  );
  assert.ok(
    criticaNoClaro < AA_TEXTO,
    "sevCriticaTexto passou a caber sobre o cartão claro: a R5 perdeu a razão de existir "
    + `(${criticaNoClaro.toFixed(2)}:1), e ela precisa sair da régua em vez de ficar por inércia`,
  );
});

test("nenhuma pendência de densidade sobreviveu ao próprio conserto", () => {
  /*
    Pendência que não sabe morrer vira permanente. Este caso reprova no dia em
    que `index.tsx` passar a caber na régua com o nome ainda escrito em
    PENDENTES, obrigando a linha a sair de lá.
  */
  const consertados = [];
  for (const arquivo of PENDENTES.keys()) {
    const doArquivo = MEDIDAS.filter((m) => m.arquivo === arquivo);
    assert.ok(
      doArquivo.length > 0,
      `PENDENTES nomeia um arquivo que a varredura não encontra mais: ${arquivo}`,
    );
    if (doArquivo.every((m) => m.blocos.length <= TETO)) consertados.push(arquivo);
  }
  assert.deepEqual(
    consertados,
    [],
    "arquivo que já cabe na régua e continua declarado como pendência. Tire o nome "
    + `de PENDENTES, em ${nomeCurto(join(RAIZ_DO_APP, ".."))}../scripts/portao-densidade-do-aplicativo.test.mjs:\n`
    + consertados.join("\n"),
  );
});
