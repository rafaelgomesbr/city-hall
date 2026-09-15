import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import { CSS_DO_CONSOLE, JS_DO_CONSOLE, PAGINA_DO_CONSOLE } from "../src/pagina.js";
import { FACES_DE_FONTE } from "../src/fontes.js";
import type { Config } from "../src/config.js";
import type { EscritaDoConsole, LeituraDoConsole } from "../src/banco.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";

/**
 * O acabamento da tela tem portão, e o portão é a política de segurança de
 * conteúdo.
 *
 * A política que este processo emite é
 * `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`.
 * Ou seja: atributo `style`, etiqueta `<style>`, `<script>` escrito dentro do
 * HTML, CDN de ícone e folha do Google Fonts são TODOS bloqueados, e bloqueados
 * em silêncio: a página carrega, some o estilo, e nada no terminal do servidor
 * denuncia. O comentário em `servidor.ts` explica por que abrir
 * `'unsafe-inline'` não é opção: é a diretiva que faz a política deixar de
 * valer.
 *
 * Os casos deste arquivo são o que impede alguém (ou alguma pressa) de escrever
 * `style="..."` num elemento e descobrir em produção. Eles conferem o HTML, o
 * CSS e o script como eles saem, e conferem que a fonte que a folha pede é
 * servida por este mesmo processo.
 *
 * O segundo grupo é a régua de design do produto: cor, sombra, raio e duração
 * vêm de token `--ds-*` e de mais lugar nenhum, e os dois temas existem
 * completos. É a mesma régua do painel do município, aplicada a uma tela que
 * não tem passo de build para impor nada.
 */

const CHAVE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE);

/**
 * Um hash de senha PRONTO, e não uma derivação.
 *
 * Nenhum caso deste arquivo entra no console: eles leem o HTML, o CSS, o script
 * e três rotas de fonte. Derivar uma senha no `beforeAll` custaria uma passagem
 * de `scrypt` de cerca de 128 MB só para preencher um campo que ninguém confere,
 * e com as suítes rodando em paralelo é esse tipo de custo que faz caso de outro
 * arquivo estourar o prazo por falta de memória. O formato continua sendo o
 * verdadeiro, que é o que a configuração exige na partida.
 */
const HASH_QUALQUER =
  "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk";

const LEITURA_VAZIA: LeituraDoConsole = { ler: async () => [], encerrar: async () => {} };
const ESCRITA_QUE_ACUSA: EscritaDoConsole = {
  executar: async () => {
    throw new Error("uma rota escreveu durante o teste de acabamento");
  },
};

/** O trecho da folha em que NENHUM valor pode ser escrito à mão. */
const MARCA_DE_FIM = "/* ============ FIM DOS TOKENS ============ */";

function componentes(): string {
  const corte = CSS_DO_CONSOLE.indexOf(MARCA_DE_FIM);
  expect(corte, "a folha perdeu o marcador que separa os tokens dos componentes")
    .toBeGreaterThan(0);
  return CSS_DO_CONSOLE.slice(corte + MARCA_DE_FIM.length);
}

/** Tira comentário de CSS, para não acusar valor citado dentro de explicação. */
function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

let app: FastifyInstance;

beforeAll(async () => {
  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: "coordenacao@fornecedor.com.br",
      senha: HASH_QUALQUER,
      segundoFator: cofre.cifrar(
        gerarSegredoTotp(), contextoDoOperador("coordenacao@fornecedor.com.br"),
      ),
    }]),
  };
  app = await construirConsole({
    config, leitura: LEITURA_VAZIA, escrita: ESCRITA_QUE_ACUSA, limitePorEndereco: 500,
    // O log deste arquivo nao interessa a nenhum caso daqui: ele vai para o ralo
    // para a saida do teste continuar legivel. Quem confere o log e
    // `diagnostico-da-porta.test.ts`.
    destinoDeLog: { write: () => {} },
  });
});

afterAll(async () => {
  await app?.close();
});

describe("Nada na pagina depende do que a politica de seguranca bloqueia", () => {
  it("o HTML nao tem atributo style nem etiqueta de estilo", () => {
    expect(
      /\sstyle\s*=/.test(PAGINA_DO_CONSOLE),
      "atributo style no HTML: a politica bloqueia, e o elemento aparece sem estilo nenhum "
      + "sem que nada denuncie",
    ).toBe(false);
    expect(
      /<style[\s>]/i.test(PAGINA_DO_CONSOLE),
      "etiqueta <style> no HTML: exigiria 'unsafe-inline', que e a diretiva que faz a "
      + "politica deixar de valer",
    ).toBe(false);
  });

  it("o script nao escreve estilo em elemento nenhum", () => {
    /*
      `elemento.style.x = ...` produz um atributo `style`, e a política bloqueia
      o atributo, não só o que vem escrito no HTML. Um esqueleto de carregamento
      com largura definida em JS seria exatamente isso.
    */
    expect(
      /\.style\s*\./.test(JS_DO_CONSOLE) || /\.style\s*=/.test(JS_DO_CONSOLE),
      "o script escreve estilo em elemento: use classe, que a folha ja carrega",
    ).toBe(false);
    expect(
      /setAttribute\(\s*["']style["']/.test(JS_DO_CONSOLE),
      "o script escreve o atributo style a mao",
    ).toBe(false);
  });

  it("o unico script da pagina vem de rota propria, e nenhum vem escrito dentro", () => {
    const etiquetas = PAGINA_DO_CONSOLE.match(/<script\b[^>]*>/gi) ?? [];
    expect(etiquetas.length, "a pagina perdeu o script, ou ganhou um segundo").toBe(1);
    expect(etiquetas[0]).toContain('src="/console.js"');
    expect(
      /<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(PAGINA_DO_CONSOLE),
      "script escrito dentro do HTML: a politica bloqueia, e a pagina fica sem comportamento",
    ).toBe(false);
  });

  it("a pagina nao pede recurso nenhum de fora deste processo", () => {
    /*
      Sem CDN de ícone, sem folha do Google Fonts, sem imagem remota. Isso não é
      só a política falando: um console que precisa de internet para desenhar é
      um console que muda de cara no dia em que a rede da prefeitura cai, que é
      justamente o dia em que alguém o abre.
    */
    const deFora = [
      ...PAGINA_DO_CONSOLE.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi),
      ...semComentarios(CSS_DO_CONSOLE).matchAll(/url\(\s*["']?(?:https?:)?\/\//gi),
      ...semComentarios(CSS_DO_CONSOLE).matchAll(/@import/gi),
    ].map((m) => m[0]);
    expect(deFora, `a pagina pede recurso de fora: ${deFora.join(", ")}`).toEqual([]);
  });

  it("os icones sao SVG desta pagina, e cada um que o script usa existe no HTML", () => {
    const definidos = new Set(
      [...PAGINA_DO_CONSOLE.matchAll(/<symbol\s+id="([^"]+)"/g)].map((m) => m[1]!),
    );
    expect(definidos.size, "a pagina ficou sem conjunto de icones").toBeGreaterThan(5);

    const pedidosNoHtml = [...PAGINA_DO_CONSOLE.matchAll(/<use\s+href="#([^"]+)"/g)]
      .map((m) => m[1]!);
    const pedidosNoScript = [...JS_DO_CONSOLE.matchAll(/["'](i-[\w-]+)["']/g)].map((m) => m[1]!);

    const orfaos = [...pedidosNoHtml, ...pedidosNoScript].filter((n) => !definidos.has(n));
    expect(orfaos, `icone pedido e nao desenhado: ${orfaos.join(", ")}`).toEqual([]);
    expect(pedidosNoScript.length, "o script parou de usar icone nenhum").toBeGreaterThan(0);
  });

  it("nenhum botao comunica a acao so por icone", () => {
    /*
      A regra do produto inteiro: nada se comunica só por cor, e ícone sozinho
      falha pela mesma razão, com o agravante de que quem ouve a tela não vê
      desenho nenhum. Botão só de ícone precisa de texto escondido para leitor
      de tela.
    */
    const semPalavra: string[] = [];
    for (const m of PAGINA_DO_CONSOLE.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
      const botao = m[0]!;
      const texto = botao
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!texto) semPalavra.push(botao.slice(0, 80));
    }
    expect(semPalavra, `botao sem palavra nenhuma: ${semPalavra.join(" | ")}`).toEqual([]);
  });

  it("nada na pagina usa travessao", () => {
    /*
      Regra de conteúdo do repositório, e ela vale na interface também. O traço
      curto da coluna sem dado continua sendo traço curto.
    */
    /*
      O caractere vem por escape, e nao escrito. A varredura de conteudo do
      repositorio (`packages/shared/test/regras-de-conteudo.test.ts`) le o codigo
      fonte de todo mundo, inclusive este arquivo, e um travessao escrito aqui
      reprovaria ela: o portao acusaria o proprio portao.
    */
    const TRAVESSAO = "\u2014";
    for (const [nome, texto] of [
      ["o HTML", PAGINA_DO_CONSOLE], ["a folha de estilo", CSS_DO_CONSOLE],
      ["o script", JS_DO_CONSOLE],
    ] as const) {
      expect(texto.includes(TRAVESSAO), `${nome} usa travessao`).toBe(false);
    }
  });
});

describe("As fontes do produto saem deste processo", () => {
  it("a folha declara as faces do produto, e nenhuma outra familia", () => {
    const familias = [...CSS_DO_CONSOLE.matchAll(/@font-face[\s\S]*?font-family:\s*"([^"]+)"/g)]
      .map((m) => m[1]!);
    expect(
      familias.sort(),
      "a tipografia do console saiu da tipografia do produto (Work Sans e Roboto Mono)",
    ).toEqual(["Roboto Mono", "Work Sans", "Work Sans"]);
    expect(CSS_DO_CONSOLE).toContain('font-display: swap');
  });

  it("toda fonte que a folha pede e servida por este processo, e chega inteira", async () => {
    /*
      O defeito silencioso: um `@font-face` apontando para um caminho que
      ninguém serve devolve 404, o navegador cai na pilha do sistema, e a tela
      abre com a fonte errada sem nenhum sinal de erro. Os dois lados são
      conferidos aqui, e não um só.
    */
    const pedidas = [...CSS_DO_CONSOLE.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(pedidas.length, "a folha nao pede fonte nenhuma").toBe(3);

    for (const caminho of pedidas) {
      const r = await app.inject({ method: "GET", url: caminho });
      expect(r.statusCode, `${caminho} respondeu ${r.statusCode}`).toBe(200);
      expect(r.headers["content-type"]).toContain("font");
      /* 0x00010000 é a assinatura de um arquivo TrueType. Byte trocado aqui é
         uma fonte que o navegador recusa em silêncio. */
      expect(
        r.rawPayload.subarray(0, 4).toString("hex"),
        `${caminho} nao devolveu um arquivo de fonte`,
      ).toBe("00010000");
      expect(r.rawPayload.length).toBeGreaterThan(50_000);
    }
  });

  it("a lista de faces do modulo e exatamente a que a folha pede", () => {
    const pedidas = [...CSS_DO_CONSOLE.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!).sort();
    expect(FACES_DE_FONTE.map((f) => f.caminho).sort()).toEqual(pedidas);
  });

  it("a fonte tem pilha de reserva, para o caso de ela nao chegar", () => {
    /*
      A fonte é servida por este processo, então "não chegar" é caso raro, e não
      impossível: rede cortada no meio do carregamento, cache envenenado,
      navegador antigo. O token da família já traz a pilha do sistema atrás.
    */
    expect(CSS_DO_CONSOLE).toMatch(/--ds-font:\s*"Work Sans",[^;]*sans-serif/);
    expect(CSS_DO_CONSOLE).toMatch(/--ds-font-mono:\s*"Roboto Mono",[^;]*monospace/);
  });
});

describe("A regua de design do produto vale nesta tela", () => {
  it("nenhum componente escreve cor a mao", () => {
    const css = semComentarios(componentes());
    const soltas = [
      ...css.matchAll(/#[0-9a-fA-F]{3,8}(?![\w-])/g),
      ...css.matchAll(/\b(?:rgba?|hsla?)\s*\(/g),
    ].map((m) => m[0]);
    expect(
      soltas,
      `cor escrita a mao fora dos tokens: ${soltas.join(", ")}. A paleta e a do produto, `
      + "e cor nova aqui e cor que ninguem verificou contra AA",
    ).toEqual([]);
  });

  it("nenhum componente escreve sombra, raio ou duracao a mao", () => {
    const css = semComentarios(componentes());
    const problemas: string[] = [];

    for (const m of css.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
      const valor = m[1]!.trim();
      if (valor === "none" || valor.includes("var(--ds-")) continue;
      problemas.push(`box-shadow: ${valor}`);
    }
    for (const m of css.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
      const valor = m[1]!.trim();
      if (valor.includes("var(--ds-")) continue;
      if (/\d+(?:\.\d+)?(px|rem|em|%)/.test(valor)) problemas.push(`border-radius: ${valor}`);
    }
    /*
      Duração: só vale token, ou `calc()` sobre token. A decisão de 2026-08-20
      soltou o teto de 300 ms e manteve a regra do valor: até uns 500 ms está
      autorizado, desde que o número saia de um token, nunca solto.
    */
    for (const m of css.matchAll(/(transition|animation)(?:-duration)?\s*:\s*([^;}]+)/g)) {
      const valor = m[2]!.trim();
      const semTokens = valor.replace(/var\(--ds-[\w-]+\)/g, " ")
        .replace(/calc\([^)]*\)/g, " ");
      if (/\d+(?:\.\d+)?m?s\b/.test(semTokens)) problemas.push(`${m[1]}: ${valor}`);
    }

    expect(problemas, `valor escrito a mao em componente: ${problemas.join("; ")}`)
      .toEqual([]);
  });

  it("os dois temas existem completos, e o escolhido vence o do sistema", () => {
    expect(CSS_DO_CONSOLE, "o tema escuro por escolha sumiu").toContain('[data-theme="dark"]');
    expect(CSS_DO_CONSOLE, "o tema escuro do sistema sumiu")
      .toContain("@media (prefers-color-scheme: dark)");
    /*
      Sem o `:not([data-theme="light"])`, quem trabalha num notebook em modo
      escuro nao conseguiria ficar no tema claro: a consulta de midia venceria a
      escolha do botao.
    */
    expect(
      CSS_DO_CONSOLE,
      "a consulta de midia atropela a escolha do operador",
    ).toContain(':root:not([data-theme="light"])');

    /* Todo token semântico redefinido no tema por escolha também é redefinido
       no tema do sistema, senão um dos dois fica pela metade. */
    const bloco = (marcador: string) => {
      const inicio = CSS_DO_CONSOLE.indexOf(marcador);
      const fim = CSS_DO_CONSOLE.indexOf("color-scheme: dark", inicio);
      return new Set(
        [...CSS_DO_CONSOLE.slice(inicio, fim).matchAll(/(--ds-[\w-]+)\s*:/g)].map((m) => m[1]!),
      );
    };
    const porEscolha = bloco('[data-theme="dark"] {');
    const doSistema = bloco(':root:not([data-theme="light"]) {');
    expect(porEscolha.size).toBeGreaterThan(10);
    const faltando = [...porEscolha].filter((t) => !doSistema.has(t));
    expect(faltando, `token do tema escuro que so existe num dos dois blocos: ${faltando}`)
      .toEqual([]);
  });

  it("a alternancia de tema esta visivel no topo, e diz o que faz", () => {
    expect(PAGINA_DO_CONSOLE).toContain('id="tema"');
    expect(PAGINA_DO_CONSOLE).toContain('aria-pressed="false"');
    /* O botão é só de ícone, então o rótulo para leitor de tela é obrigatório. */
    expect(PAGINA_DO_CONSOLE).toContain('id="tema-rotulo"');
  });

  it("area de toque de 44 px vem do token, em botao e em campo", () => {
    const css = semComentarios(componentes());
    expect(css).toMatch(/\.botao\s*\{[^}]*min-height:\s*var\(--ds-touch\)/);
    expect(css).toMatch(/\binput\s*\{[^}]*min-height:\s*var\(--ds-touch\)/);
  });

  it("botao desabilitado e campo em foco tem aparencia propria", () => {
    /*
      A lista do que faltava, na letra de quem reclamou: nenhum estado de foco
      além do contorno do navegador, nenhum `:hover`, nenhum `:disabled`.
    */
    const css = semComentarios(componentes());
    expect(css, "botao sem estado desabilitado").toContain(".botao[disabled]");
    expect(css, "botao sem hover").toContain(".botao:hover");
    expect(css, "campo sem foco proprio").toContain(".entrada:focus-within");
    expect(css, "o anel de foco do produto nao esta em uso").toContain("var(--ds-focus-ring)");
    expect(css, "sem indicacao de espera").toContain('[aria-busy="true"] .roda');
  });

  it("todo botao que espera tem roda, e nao so o rotulo trocado", () => {
    /*
      Defeito encontrado abrindo a página: o botão "Atualizar" trocava o rótulo
      para "Atualizando...", a folha escondia o ícone dele (que é o que a regra
      de ocupado faz), e não havia roda nenhuma no lugar. O resultado era um
      botão que perdia o desenho e ganhava reticências, que é menos sinal de
      espera do que ele tinha antes.

      O laço abaixo sai do próprio script: cada `esperar(botao, "x-texto", ...)`
      aponta para o rótulo, e o rótulo mora dentro do botão que precisa da roda.
    */
    const botoes = [...PAGINA_DO_CONSOLE.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map((m) => m[0]!);
    const queEsperam = [...JS_DO_CONSOLE.matchAll(/esperar\([^,]+,\s*["']([\w-]+)["']/g)]
      .map((m) => m[1]!);
    expect(queEsperam.length, "nenhum botao da tela espera por nada").toBeGreaterThan(3);

    const semRoda: string[] = [];
    for (const rotulo of queEsperam) {
      const botao = botoes.find((b) => b.includes(`id="${rotulo}"`));
      expect(botao, `o rotulo "${rotulo}" nao esta dentro de nenhum botao`).toBeTruthy();
      if (!botao!.includes('class="roda"')) semRoda.push(rotulo);
    }
    expect(semRoda, `botao que trava sem roda de carregamento: ${semRoda.join(", ")}`)
      .toEqual([]);
  });

  it("esconder com hidden vence qualquer display de componente", () => {
    /*
      Defeito encontrado abrindo a página num navegador de verdade, e que nenhum
      teste de comportamento pega: o script marcava `hidden` corretamente e a
      FOLHA desmarcava. O atributo `hidden` vira `display: none` por uma regra do
      próprio navegador, com a especificidade mais baixa que existe, e qualquer
      `display` escrito num componente ganha dela.

      O efeito era visível na primeira tela: `.botao { display: inline-flex }`
      punha o botão "Sair" na tela de LOGIN, e `.recado { display: flex }`
      desenhava uma caixa de erro vazia, com ícone de alerta, antes de alguém ter
      tentado entrar.
    */
    const css = semComentarios(componentes());
    expect(
      css,
      "sem esta regra, todo elemento com display de componente ignora o `hidden` que o "
      + "script escreve, e aparece na tela errada",
    ).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);

    /* E a regra precisa vir ANTES de quem ela corrige? Não: `!important` vence
       independente da ordem. O que ela não pode é não existir. */
    const comDisplay = [...css.matchAll(/\.([\w-]+)[^{]*\{[^}]*display:\s*(?!none)/g)]
      .map((m) => m[1]!);
    expect(comDisplay.length, "nenhum componente declara display: a regra acima ficou sem uso")
      .toBeGreaterThan(0);
  });

  it("o alarme de municipio calado nunca e so cor", () => {
    /* A palavra ("calado" ou "em dia") e o ícone vão junto do fundo colorido. */
    expect(JS_DO_CONSOLE).toContain('"calado ha "');
    expect(JS_DO_CONSOLE).toContain('"em dia"');
    expect(JS_DO_CONSOLE).toContain("i-silencio");
    expect(PAGINA_DO_CONSOLE, "o aviso da senha inicial perdeu a palavra Atencao")
      .toContain("<strong>Atenção:</strong>");
  });
});
