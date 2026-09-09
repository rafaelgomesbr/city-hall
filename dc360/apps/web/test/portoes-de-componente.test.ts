import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { rotuloVago } from "../src/componentes/ConfirmarAcao";

/**
 * OS PORTÕES DE COMPONENTE, LIGADOS.
 *
 * Eles nasceram com `describe.skip` porque as peças (`Campo`, `Modal`,
 * `ConfirmarAcao`, `Toast`) chegaram antes das telas que iriam usá-las, e
 * portão ligado sobre código que ainda não migrou reprova o turno de todo
 * mundo sem consertar nada. A migração aconteceu, o `.skip` saiu, e o que
 * cada um destes portões impede a partir de agora é a VOLTA:
 *
 * - rótulo escrito à mão fora de `Campo`. Eram 53 `htmlFor` em onze arquivos;
 *   sobraram cinco `<label>`, todos de uma forma que `Campo` não expressa e
 *   que este portão passou a descrever com precisão (ver o próprio teste);
 * - `window.confirm` e companhia. Não havia nenhum, e continua não havendo:
 *   este é portão de catraca. A janela nativa não tem tradução confiável, não
 *   tem o número do protocolo dentro e não dá para dizer nela que encerrar não
 *   tem desfazer;
 * - modal sem armadilha de foco. Era um caso, a galeria de fotos, que
 *   prometia `role="dialog"` e deixava o Tab escapar para a página de trás;
 * - `setTimeout` sem cancelamento. Era um caso, a ida para "/entrar" depois de
 *   redefinir a senha, que sobrevivia à tela que o criou;
 * - ato irreversível gravado num toque só. Encerrar, levantar interdição e
 *   registrar a resposta do órgão gravavam no primeiro clique (o encerramento
 *   pedia dois toques no mesmo botão, que é outra coisa), e desativar usuário
 *   ou equipe era um clique numa célula de tabela;
 * - o número do protocolo existindo só num aviso que some sozinho.
 *
 * `test/formularios.test.ts` foi ensinado a ler `<Campo>` na mesma leva, e não
 * teve mínimo baixado: a explicação está no cabeçalho dele.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const COMPONENTES = "componentes";

function arquivos(pasta: string, extensao: RegExp): string[] {
  const achados: string[] = [];
  for (const arquivo of readdirSync(pasta)) {
    const caminho = join(pasta, arquivo);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, extensao));
    else if (extensao.test(arquivo)) achados.push(caminho);
  }
  return achados;
}

function nome(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

function linhaDe(fonte: string, posicao: number): number {
  return fonte.slice(0, posicao).split("\n").length;
}

/** Fecha o parêntese aberto em `aberturaEm` e devolve a posição seguinte. */
function fimDoParenteses(fonte: string, aberturaEm: number): number {
  let profundidade = 0;
  for (let i = aberturaEm; i < fonte.length; i++) {
    if (fonte[i] === "(") profundidade++;
    else if (fonte[i] === ")") {
      profundidade--;
      if (profundidade === 0) return i + 1;
    }
  }
  return fonte.length;
}

/**
 * O `useEffect` que contém esta posição, se houver.
 *
 * A contagem de parênteses ignora string e expressão regular, então um
 * parêntese solto dentro de texto desalinha a conta. É grosseiro de
 * propósito: o portão precisa ser lido e entendido por quem chega, e um
 * analisador de verdade aqui seria mais código do que o painel que ele
 * guarda.
 */
function efeitoAoRedor(fonte: string, posicao: number): string | null {
  let encontrado: string | null = null;
  for (const casou of fonte.matchAll(/useEffect\(/g)) {
    const inicio = casou.index;
    if (inicio > posicao) break;
    const fim = fimDoParenteses(fonte, inicio + "useEffect".length);
    if (fim > posicao) encontrado = fonte.slice(inicio, fim);
  }
  return encontrado;
}

/**
 * A mesma fonte, com todo comentário apagado e o resto no lugar.
 *
 * Isto nasceu de um defeito destes portões, e não do painel. O portão de modal
 * procura `role="dialog"` como TEXTO, então ele reprovava o comentário que
 * explica por que a galeria de fotos deixou de escrever `role="dialog"` à mão.
 * O incentivo que isso cria é o pior possível: para o portão ficar verde, quem
 * migra apaga a explicação. Regra que só passa quando ninguém escreve o porquê
 * está ensinando a coisa errada.
 *
 * Cada caractere de comentário vira espaço, e as quebras de linha ficam, então
 * as posições e os números de linha continuam valendo para a fonte original.
 * O passo por dentro de string existe porque `"https://exemplo"` não é
 * comentário, e apagar dali para a frente engoliria código de verdade.
 */
function codigoSem(fonte: string): string {
  const saida = [...fonte];
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i]!;
    const proximo = fonte[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < fonte.length && fonte[i] !== c) {
        if (fonte[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "/" && proximo === "/") {
      while (i < fonte.length && fonte[i] !== "\n") { saida[i] = " "; i++; }
      continue;
    }
    if (c === "/" && proximo === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const ate = fim === -1 ? fonte.length : fim + 2;
      for (; i < ate; i++) if (fonte[i] !== "\n") saida[i] = " ";
      continue;
    }
    i++;
  }
  return saida.join("");
}

/**
 * Lê uma tag JSX inteira a partir do `<`.
 *
 * Não dá para parar no primeiro `>`: quase toda tag deste painel carrega uma
 * seta (`onChange={(e) => ...}`), e a seta tem um `>` no meio. Contar chaves
 * resolve, porque toda seta mora dentro de um `{}`.
 */
function lerTag(fonte: string, inicio: number): string {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === "{") profundidade++;
    else if (c === "}") profundidade--;
    else if (c === ">" && profundidade === 0) return fonte.slice(inicio, i + 1);
  }
  return fonte.slice(inicio);
}

/** O corpo de uma função nomeada, a partir da chave que o abre. */
function corpoDaFuncao(fonte: string, aberturaEm: number): string {
  const chave = fonte.indexOf("{", fonte.indexOf(")", aberturaEm));
  if (chave === -1) return "";
  let profundidade = 0;
  for (let i = chave; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    else if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(aberturaEm, i + 1);
    }
  }
  return fonte.slice(aberturaEm);
}

/**
 * A função NOMEADA mais interna que contém esta marca.
 *
 * A mais interna, e não a primeira: numa tela, a função que grava mora dentro
 * do componente, e devolver o componente diria "a gravação está em Usuarios",
 * que é verdade e não serve para nada.
 */
function funcaoQueContem(fonte: string, marca: string): { nome: string; corpo: string } | null {
  const posicao = fonte.indexOf(marca);
  if (posicao === -1) return null;
  let melhor: { nome: string; corpo: string; inicio: number } | null = null;
  for (const casou of fonte.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) {
    if (casou.index > posicao) break;
    const corpo = corpoDaFuncao(fonte, casou.index);
    if (casou.index + corpo.length <= posicao) continue;
    if (!melhor || casou.index > melhor.inicio) {
      melhor = { nome: casou[1]!, corpo, inicio: casou.index };
    }
  }
  return melhor ? { nome: melhor.nome, corpo: melhor.corpo } : null;
}

/** O valor de uma propriedade JSX escrita entre chaves, com as chaves dentro. */
function valorDaPropriedade(fonte: string, propriedade: string): string | null {
  const inicio = fonte.indexOf(`${propriedade}={`);
  if (inicio === -1) return null;
  const abertura = fonte.indexOf("{", inicio);
  let profundidade = 0;
  for (let i = abertura; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    else if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(abertura + 1, i);
    }
  }
  return null;
}

/** O controle que carrega este `id`, se ele estiver escrito neste arquivo. */
function controleComId(fonte: string, id: string): string | null {
  for (const casou of fonte.matchAll(/<(input|textarea|select)\b/g)) {
    const tag = lerTag(fonte, casou.index);
    if (new RegExp(`\\bid="${id}"`).test(tag)) return tag;
  }
  return null;
}

/** Marcador da exceção deliberada, escrita na linha de cima com a razão. */
const PERMISSAO = "portao de componente: excecao";

function temPermissaoAcima(fonte: string, posicao: number): boolean {
  const linhas = fonte.slice(0, posicao).split("\n");
  return linhas.slice(-5).join(" ").includes(PERMISSAO);
}

describe("Portões de componente", () => {
  it("a varredura enxerga as telas de verdade", () => {
    /*
      Âncora, igual à dos outros portões deste projeto. Sem ela, um erro de
      caminho faria tudo aqui passar vazio, que é o pior jeito de um portão
      falhar: fica verde enquanto deixou de olhar.
    */
    const telas = arquivos(RAIZ, /\.tsx$/);
    expect(telas.length).toBeGreaterThan(8);
    expect(telas.map(nome)).toContain("paginas/Ocorrencia.tsx");
    expect(telas.map(nome)).toContain("componentes/Campo.tsx");
  });

  it("a varredura apaga comentário e mais nada", () => {
    /*
      Sem este caso, `codigoSem` poderia passar a apagar código junto e os
      quatro portões de texto ficariam verdes olhando um arquivo em branco,
      que é o pior jeito de um portão falhar.
    */
    const fonte = [
      '// role="dialog" escrito na prosa',
      '/* aria-modal= no meio de um bloco */',
      'const endereco = "https://exemplo.test/a";',
      'const janela = <div role="dialog" />;',
    ].join("\n");
    const limpo = codigoSem(fonte);

    expect(limpo.length, "as posições precisam continuar valendo").toBe(fonte.length);
    expect(limpo.split("\n").length, "as linhas precisam continuar valendo").toBe(4);
    expect([...limpo.matchAll(/role="dialog"|aria-modal=/g)]).toHaveLength(1);
    // A barra dupla dentro de string não abre comentário.
    expect(limpo).toContain('"https://exemplo.test/a"');
  });

  it("todo rótulo nasce dentro de Campo", () => {
    /*
      `Campo` é o único lugar que amarra rótulo, controle, erro e dica de uma
      vez. Rótulo escrito à mão fora dele é a amarração feita de novo, e a
      parte que some primeiro é o `aria-describedby` do erro, que não muda um
      pixel na tela.

      DUAS FORMAS DE RÓTULO CONTINUAM FORA DE `Campo`, e o portão passou a
      dizer quais são em vez de deixar cada tela alegar uma razão própria.
      Nenhuma das duas é preguiça: as duas são estruturalmente imunes ao
      defeito que este portão persegue.

      1. O rótulo que ENVOLVE o próprio controle (`<label>` sem `htmlFor`, com
         o `<input>` dentro). Não existe par `htmlFor`/`id` para divergir: a
         amarração é a própria aninhagem, e ela não tem como se desfazer sem
         que alguém mova o controle para fora, o que é visível. É a forma da
         caixa de marcação, e `Campo` não a expressa: ele acrescentaria
         "(opcional)" ao rótulo ou marcaria a caixa como obrigatória, e as duas
         coisas seriam mentira (`required` numa caixa significa "precisa estar
         marcada", e a de vulnerabilidade social pode ficar desmarcada).

      2. O rótulo INVISÍVEL de um filtro: `class="oculto-visualmente"` num
         `<label htmlFor>` que aponta para um `type="search"`. Filtro não é
         campo a preencher (o portão de obrigatoriedade já o isenta pelo mesmo
         motivo), não tem erro nem dica para amarrar, e o rótulo existe só para
         o leitor de tela, ao lado de um `placeholder` que diz a mesma coisa a
         quem enxerga. `Campo` também não expressa isto: ele não deixa a caixa
         do rótulo ser escondida, então a barra de filtros ganharia um título
         visível por campo e a linha inteira mudaria de altura.

      Qualquer outra forma reprova, e continua havendo a saída de emergência
      escrita na linha de cima com a razão.
    */
    const EXCECOES = new Set([
      // Aqui MORA o `<label>` do painel: é o próprio componente.
      "componentes/Campo.tsx",
    ]);

    const achados: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      if (EXCECOES.has(nome(caminho))) continue;
      const original = readFileSync(caminho, "utf8");
      const fonte = codigoSem(original);
      for (const casou of fonte.matchAll(/<label\b/g)) {
        if (temPermissaoAcima(original, casou.index)) continue;

        const abertura = lerTag(fonte, casou.index);
        const para = /\bhtmlFor="([^"]+)"/.exec(abertura)?.[1];
        const marca = `${nome(caminho)}:${linhaDe(fonte, casou.index)}`;

        if (!para) {
          // Forma 1: o rótulo precisa MESMO conter o controle. Sem isso ele
          // não rotula nada, e o campo fica mudo para o leitor de tela.
          const fim = fonte.indexOf("</label>", casou.index);
          const dentro = fim === -1 ? "" : fonte.slice(casou.index, fim);
          if (/<(input|textarea|select)\b/.test(dentro)) continue;
          achados.push(`${marca}  <label> sem htmlFor e sem controle dentro`);
          continue;
        }

        // Forma 2: invisível E apontando para um filtro.
        const invisivel = /className="[^"]*\boculto-visualmente\b/.test(abertura);
        const alvo = controleComId(fonte, para);
        if (invisivel && alvo !== null && /\btype="search"/.test(alvo)) continue;

        achados.push(`${marca}  htmlFor="${para}"`);
      }
    }

    expect(
      achados,
      "rótulo escrito à mão fora de `Campo`. Use `<Campo id=... rotulo=...>`, "
      + `ou escreva "${PERMISSAO}" na linha de cima com a razão, ou acrescente `
      + "o arquivo à lista de exceções deste teste, com comentário:\n"
      + achados.join("\n"),
    ).toEqual([]);
  });

  it("as duas formas aceitas são reconhecidas, e as parecidas não", () => {
    /*
      Prova de que as duas exceções são estreitas mesmo, sem depender de o
      painel estar certo para descobrir isso. Sem este caso, afrouxar a regra
      por acidente (aceitar qualquer `<label>` sem `htmlFor`, por exemplo)
      passaria despercebido: o portão continuaria verde, olhando menos.
    */
    const envolvente = '<label className="caixa-marcacao"><input type="checkbox" /></label>';
    expect(/\bhtmlFor="/.test(lerTag(envolvente, 0))).toBe(false);
    expect(/<(input|textarea|select)\b/.test(envolvente)).toBe(true);

    // Rótulo sem `htmlFor` e sem controle dentro não rotula coisa nenhuma.
    const solto = "<label>Nome</label><input id=\"nome\" />";
    const fim = solto.indexOf("</label>");
    expect(/<(input|textarea|select)\b/.test(solto.slice(0, fim))).toBe(false);

    // Invisível, mas apontando para um campo de preencher: reprova.
    const filtroFalso = '<label className="oculto-visualmente" htmlFor="x">Nome</label>'
      + '<input id="x" type="text" />';
    expect(/\btype="search"/.test(controleComId(filtroFalso, "x") ?? "")).toBe(false);

    // Visível e apontando para uma busca: também reprova, porque aí `Campo`
    // dá conta e a exceção deixa de ter razão de ser.
    const visivel = '<label htmlFor="y">Buscar</label><input id="y" type="search" />';
    expect(/className="[^"]*\boculto-visualmente\b/.test(lerTag(visivel, 0))).toBe(false);
  });

  it("nenhuma janela nativa do navegador decide nada", () => {
    /*
      `window.confirm` não tem o nome do protocolo dentro, não tem tradução
      confiável, não diz que o ato não tem desfazer, trava a aba inteira e em
      alguns navegadores traz a caixa de "impedir que esta página abra mais
      diálogos", que some com a confirmação seguinte sem avisar ninguém.
      `ConfirmarAcao` existe para isto.
    */
    const achados: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx?$/)) {
      const fonte = codigoSem(readFileSync(caminho, "utf8"));
      for (const casou of fonte.matchAll(/(?:\bwindow\.)?\b(confirm|alert|prompt)\s*\(/g)) {
        // `setAviso(...)` e afins não entram: só o nome nu ou com `window.`.
        const antes = fonte[casou.index - 1] ?? " ";
        if (/[.\w$]/.test(antes) && !casou[0].startsWith("window.")) continue;
        achados.push(`${nome(caminho)}:${linhaDe(fonte, casou.index)}  ${casou[1]}(`);
      }
    }
    expect(
      achados,
      "janela nativa do navegador no lugar de `ConfirmarAcao` ou `Toast`:\n"
      + achados.join("\n"),
    ).toEqual([]);
  });

  it("todo modal tem armadilha de foco, e ela só existe em um lugar", () => {
    /*
      `role="dialog"` promete ao leitor de tela que aquilo é uma janela com
      começo e fim. Sem prender o Tab, a promessa é falsa: o foco sai pela
      borda para a página de trás, que continua desenhada, e a pessoa passa a
      operar controles que não vê. Meia biblioteca de modal escrita dentro de
      uma página é o defeito que este portão proíbe.
    */
    const DONO_DA_JANELA = `${COMPONENTES}/Modal.tsx`;

    const achados: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      if (nome(caminho) === DONO_DA_JANELA) continue;
      const original = readFileSync(caminho, "utf8");
      const fonte = codigoSem(original);
      for (const casou of fonte.matchAll(/role="dialog"|aria-modal=/g)) {
        if (temPermissaoAcima(original, casou.index)) continue;
        achados.push(`${nome(caminho)}:${linhaDe(fonte, casou.index)}  ${casou[0]}`);
      }
    }

    expect(
      achados,
      "janela modal fora de `Modal`. Use `<Modal>` ou `<ConfirmarAcao>`: eles "
      + "prendem o Tab, devolvem o foco a quem abriu e interditam a página de "
      + "trás. Declarar `role=\"dialog\"` sem isso promete uma janela que não "
      + "existe:\n" + achados.join("\n"),
    ).toEqual([]);
  });

  it("todo setTimeout de componente é cancelado no desmonte", () => {
    /*
      Relógio de pé depois que o componente saiu dispara sobre uma tela que
      já não existe: em desenvolvimento vira aviso no console, em produção
      vira comportamento que ninguém reproduz (a navegação da tela anterior
      acontecendo por cima da tela nova).

      Duas formas passam, e são as duas que de fato cancelam:

      1. `setTimeout` dentro de um `useEffect` que chama `clearTimeout` (a
         limpeza do efeito é o desmonte);
      2. `setTimeout` dentro de uma função que DEVOLVE o cancelamento
         (`return () => clearTimeout(...)`), que é a forma de
         `agendarFechamento` em `componentes/Toast.tsx`: quem chama pendura o
         retorno na limpeza do efeito, e `test/toast.test.ts` confere as duas
         pontas.

      O resto reprova: relógio que ninguém tem como parar.
    */
    const DEVOLVE_CANCELAMENTO = /return \(\) => clearTimeout\(/;
    const soltos: string[] = [];
    const semLimpeza: string[] = [];

    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      const original = readFileSync(caminho, "utf8");
      const fonte = codigoSem(original);
      for (const casou of fonte.matchAll(/\bsetTimeout\s*\(/g)) {
        if (temPermissaoAcima(original, casou.index)) continue;
        const marca = `${nome(caminho)}:${linhaDe(fonte, casou.index)}`;
        const efeito = efeitoAoRedor(fonte, casou.index);
        if (efeito !== null) {
          if (!efeito.includes("clearTimeout")) semLimpeza.push(marca);
          continue;
        }
        if (!DEVOLVE_CANCELAMENTO.test(fonte.slice(casou.index, casou.index + 400))) {
          soltos.push(marca);
        }
      }
    }

    expect(
      [...soltos, ...semLimpeza],
      "temporizador que sobrevive ao componente.\n"
      + (soltos.length > 0
        ? "fora de useEffect e sem devolver o cancelamento:\n" + soltos.join("\n") + "\n"
        : "")
      + (semLimpeza.length > 0
        ? "dentro de useEffect que não chama clearTimeout:\n" + semLimpeza.join("\n")
        : ""),
    ).toEqual([]);
  });

  /**
   * Os atos que não têm desfazer, e a gravação de cada um.
   *
   * A lista é escrita à mão de propósito: não existe jeito de a máquina
   * descobrir sozinha qual escrita é irreversível, porque isso é decisão de
   * domínio, não propriedade do código. Escrevê-la aqui obriga quem
   * acrescentar um ato desses a passar por este arquivo e a dizer, no lugar
   * onde alguém vai ler, por que aquilo não tem volta.
   *
   * `gravacao` é o trecho que efetivamente grava. O portão acha a função que o
   * contém e exige que seja ELA que a janela chama: assim, a confirmação não
   * pode virar enfeite ao lado de um botão que continua gravando direto, que é
   * o jeito mais comum de uma confirmação nascer morta.
   */
  const IRREVERSIVEIS: ReadonlyArray<{
    arquivo: string; componente: string; gravacao: string; porque: string;
  }> = [
    {
      arquivo: "paginas/Ocorrencia.tsx",
      componente: "BlocoEncerramento",
      gravacao: "onEnviar({ motivo: decisao.motivo })",
      porque: "encerrada é estado terminal, e a trilha não tem policy de UPDATE nem de DELETE",
    },
    {
      arquivo: "paginas/Ocorrencia.tsx",
      componente: "BlocoDesinterdicao",
      gravacao: "onEnviar(resultado.data.motivo)",
      porque: "autoriza uma família a voltar para uma casa que o município declarou insegura",
    },
    {
      arquivo: "paginas/Ocorrencia.tsx",
      componente: "BlocoRespostaProvidencia",
      gravacao: "onEnviar(alvo, resultado.data)",
      porque: "a resposta do órgão não pode ser alterada depois: corrigir seria apagar o que ele disse",
    },
    {
      arquivo: "paginas/Usuarios.tsx",
      componente: "Usuarios",
      gravacao: "await alternarUsuarioAtivo(",
      porque: "derruba as sessões da pessoa e para a sincronização do aplicativo dela no meio da vistoria",
    },
    {
      arquivo: "paginas/Equipes.tsx",
      componente: "Equipes",
      gravacao: 'await atualizarEquipe(sessao, e.id, e.nome, e.especialidade ?? "", !e.ativa)',
      porque: "tira do despacho uma equipe que pode estar em atendimento agora",
    },
    {
      arquivo: "paginas/Orgaos.tsx",
      componente: "Orgaos",
      gravacao: "await desativarOrgao(sessao, alvo.id, conferido.motivo)",
      porque: "tira da lista de destinos um órgão que pode ter providência sem resposta agora, "
        + "e o motivo digitado entra numa trilha que não tem policy de UPDATE nem de DELETE",
    },
    {
      arquivo: "paginas/Ocorrencia.tsx",
      componente: "CartaoOficios",
      gravacao: "await enviarOficio(sessao, oficio.id)",
      porque: "coloca um endereço de uso único para o dossiê de uma família dentro da caixa de "
        + "entrada de outro órgão, e email enviado não se recolhe",
    },
  ];

  it("todo ato irreversível pergunta antes, e quem grava é quem a janela chama", () => {
    const achados: string[] = [];

    for (const ato of IRREVERSIVEIS) {
      const fonte = readFileSync(join(RAIZ, ato.arquivo), "utf8");
      const inicio = new RegExp(`(?:async\\s+)?function\\s+${ato.componente}\\s*\\(`).exec(fonte)?.index;
      if (inicio === undefined) {
        achados.push(`${ato.arquivo}: não achei o componente ${ato.componente}`);
        continue;
      }
      const componente = corpoDaFuncao(fonte, inicio);

      if (!componente.includes("<ConfirmarAcao")) {
        achados.push(
          `${ato.arquivo} > ${ato.componente}: grava sem perguntar. ${ato.porque}`,
        );
        continue;
      }
      if (!componente.includes(ato.gravacao)) {
        achados.push(
          `${ato.arquivo} > ${ato.componente}: a gravação "${ato.gravacao}" mudou de forma; `
          + "atualize esta lista junto com o código, senão o portão passa a olhar o nada",
        );
        continue;
      }

      const grava = funcaoQueContem(componente, ato.gravacao);
      const confirmador = valorDaPropriedade(componente, "aoConfirmar");
      if (grava === null || confirmador === null) {
        achados.push(`${ato.arquivo} > ${ato.componente}: não achei quem grava ou quem confirma`);
        continue;
      }
      if (!new RegExp(`\\b${grava.nome}\\b`).test(confirmador)) {
        achados.push(
          `${ato.arquivo} > ${ato.componente}: a janela chama "${confirmador.trim()}", `
          + `mas quem grava é "${grava.nome}". Confirmação que não está no caminho da `
          + "gravação é enfeite: o botão de fora continua gravando direto",
        );
      }
    }

    expect(
      achados,
      "escrita irreversível sem `ConfirmarAcao` no caminho:\n" + achados.join("\n"),
    ).toEqual([]);
  });

  it("a lista de atos irreversíveis aponta para código que existe", () => {
    /*
      Âncora da lista acima. Sem ela, renomear um componente faria os cinco
      casos passarem a olhar arquivos vazios, e o portão ficaria verde sem
      conferir nada.
    */
    for (const ato of IRREVERSIVEIS) {
      const fonte = readFileSync(join(RAIZ, ato.arquivo), "utf8");
      expect(fonte, `${ato.arquivo} não tem ${ato.componente}`)
        .toContain(`function ${ato.componente}(`);
    }
    expect(new Set(IRREVERSIVEIS.map((a) => a.componente)).size).toBe(IRREVERSIVEIS.length);
  });

  it("o protocolo recém gerado chega à tela, e não só ao aviso que some", async () => {
    /*
      O aviso de registro é `Toast`: ele some sozinho, aparece no canto e pode
      passar enquanto o leitor de tela está no meio de outra leitura. Se o
      número do protocolo existisse só ali, quem desviou o olho por três
      segundos perderia o número do chamado que acabou de abrir, com o morador
      ainda na linha, e o único jeito de recuperá-lo seria procurar na lista.

      Por isso o portão confere as duas pontas: a frase carrega o protocolo, e
      a tela para onde a pessoa vai imprime o mesmo protocolo no título.
    */
    const { avisoDoRegistro } = await import("../src/paginas/ocorrencia-regras");

    const frase = avisoDoRegistro({ protocolo: "000123/2026", papel: "coordenador" });
    expect(frase, "o aviso não diz o número do protocolo").toContain("000123/2026");
    expect(frase, "o aviso não diz o que fazer em seguida").toMatch(/pr[óo]ximo passo/i);

    // Quem não classifica não pode ser mandado classificar: o servidor recusa,
    // e a frase viraria uma instrução para levar 403.
    expect(avisoDoRegistro({ protocolo: "000123/2026", papel: "operador" }))
      .toMatch(/coordena[çc][ãa]o/i);

    const detalhe = readFileSync(join(RAIZ, "paginas", "Ocorrencia.tsx"), "utf8");
    expect(detalhe, "o detalhe não anuncia o registro").toContain("<Toast");
    expect(detalhe).toContain("avisoDoRegistro(");
    expect(
      /<h1>[\s\S]{0,200}\{o\.protocolo\}/.test(detalhe),
      "o protocolo saiu do título da tela: ele passaria a existir só no aviso "
      + "passageiro, que é exatamente o que este portão proíbe",
    ).toBe(true);

    const registro = readFileSync(join(RAIZ, "paginas", "NovaOcorrencia.tsx"), "utf8");
    expect(registro, "a tela de registro não marca a navegação como recém gravada")
      .toContain("recemRegistrada: true");
    expect(
      detalhe.includes("state: null"),
      "a marca de \"recém registrada\" não é apagada do histórico: recarregar a "
      + "aba semanas depois anunciaria de novo um registro antigo",
    ).toBe(true);
  });

  it("nenhum botão de confirmação diz apenas OK", () => {
    /*
      O botão é a última chance de perceber que o protocolo da janela não é o
      da tela que se estava lendo. "OK" não diz o que vai acontecer, e quem
      está com o rádio na mão confirma o que lembra de ter clicado.

      Só os rótulos escritos como texto literal são conferidos: rótulo montado
      em variável não tem como ser lido aqui, e é por isso que a mesma regra
      também avisa em desenvolvimento, dentro de `ConfirmarAcao`.
    */
    const achados: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      const fonte = readFileSync(caminho, "utf8");
      for (const casou of fonte.matchAll(/rotuloDaAcao="([^"]*)"/g)) {
        if (!rotuloVago(casou[1] ?? "")) continue;
        achados.push(`${nome(caminho)}:${linhaDe(fonte, casou.index)}  "${casou[1]}"`);
      }
    }
    expect(
      achados,
      'rótulo de confirmação que não diz o que vai acontecer. Repita o ato e o '
      + 'objeto, como em "Encerrar 000123/2026":\n' + achados.join("\n"),
    ).toEqual([]);
  });
});
