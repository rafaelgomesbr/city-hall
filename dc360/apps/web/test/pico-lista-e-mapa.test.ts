import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * O dia de pico visto do painel: a lista, o mapa e o prazo.
 *
 * Tres defeitos que so aparecem quando a cidade tem muita ocorrencia ao mesmo
 * tempo, que e exatamente o dia em que o coordenador nao pode desconfiar da
 * tela.
 *
 * 1. O MAPA DESENHAVA UM RECORTE COM CARA DE TUDO. Ele pedia a lista comum,
 *    que sempre foi paginada, e desenhava o que chegasse: cem marcadores numa
 *    enxurrada de duzentas ocorrencias ativas, sem uma linha dizendo que
 *    faltava metade da cidade.
 *
 * 2. AS ATRASADAS ERAM FILTRADAS NO NAVEGADOR, em cima da pagina ja baixada.
 *    Com paginacao isso mente duas vezes: filtra so o que veio e conta so o
 *    que filtrou. E a expressao do navegador nem era a do indicador do painel.
 *
 * 3. O PRAZO SO TINHA A CONTAGEM REGRESSIVA. "Restam 4h" responde "esta
 *    apertado?" e nao responde "quando?", que e a pergunta de quem vai escalar
 *    equipe e precisa saber se aquilo cai dentro ou fora do turno.
 *
 * Os casos de fonte existem porque a metade que so aparece com dado de
 * verdade na tela (a tabela inteira, o aviso do mapa) nao roda sem navegador.
 * Eles trancam o caminho pelo qual o defeito volta.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const LISTA = join(RAIZ, "paginas", "Ocorrencias.tsx");
const MAPA = join(RAIZ, "paginas", "Mapa.tsx");

function fonte(caminho: string): string {
  return readFileSync(caminho, "utf8");
}

const HORA = 3_600_000;
const daqui = (horas: number): string => new Date(Date.now() + horas * HORA).toISOString();

/* ============================================================
   1. O prazo, em duas colunas
   ============================================================ */

describe("O prazo mostra a data, e nao so a contagem regressiva", () => {
  it("existe um componente que diz QUANDO vence", async () => {
    const comuns = await import("../src/componentes/comuns");
    expect(
      typeof comuns.PrazoVenceEm,
      "a coluna de prazo continua so com o relativo. Quem vai escalar equipe "
      + "precisa da data: 'Restam 4h' as 17h quer dizer 21h, com a equipe fora "
      + "do turno, e essa conta esta sendo feita de cabeca na pressa",
    ).toBe("function");
  });

  it("imprime data e hora em pt-BR", async () => {
    const { PrazoVenceEm, formatarDataHora } = await import("../src/componentes/comuns");
    const prazo = daqui(4);
    const html = renderToStaticMarkup(
      createElement(PrazoVenceEm, { prazoEm: prazo, encerrada: false }),
    );
    expect(html).toContain(formatarDataHora(prazo));
    expect(
      formatarDataHora(prazo),
      "a data precisa sair no formato do Brasil: dia, mes, ano e hora",
    ).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
  });

  it("vencido e dito por cor E por palavra, nunca so por cor", async () => {
    const { PrazoVenceEm } = await import("../src/componentes/comuns");
    const html = renderToStaticMarkup(
      createElement(PrazoVenceEm, { prazoEm: daqui(-3), encerrada: false }),
    );
    expect(html, "a palavra 'Vencido' sumiu da celula").toContain("Vencido");
    expect(html, "o selo perdeu a cor semantica de perigo").toContain("selo--perigo");
    expect(html, "o icone que sobrevive ao daltonismo e ao sol na tela").toContain("<svg");
  });

  it("nao chama de vencida a ocorrencia ja encerrada", async () => {
    // O prazo de uma encerrada passou, e passar deixou de importar. Marcar
    // vermelho aqui encheria a lista de alarme falso.
    const { PrazoVenceEm } = await import("../src/componentes/comuns");
    const html = renderToStaticMarkup(
      createElement(PrazoVenceEm, { prazoEm: daqui(-3), encerrada: true }),
    );
    expect(html).not.toContain("Vencido");
  });

  it("sem triagem, diz o motivo de nao haver prazo", async () => {
    const { PrazoVenceEm } = await import("../src/componentes/comuns");
    const html = renderToStaticMarkup(
      createElement(PrazoVenceEm, { prazoEm: null, encerrada: false }),
    );
    expect(html, "celula vazia parece dado faltando").toContain("Aguarda triagem");
  });

  it("a barra e o relativo continuam existindo, na coluna ao lado", async () => {
    const { Prazo } = await import("../src/componentes/comuns");
    const html = renderToStaticMarkup(
      createElement(Prazo, { prazoEm: daqui(4), criadoEm: daqui(-1), encerrada: false }),
    );
    expect(html).toContain("Restam");
    expect(html).toContain("prazo__trilho");
  });

  it("a tabela da lista tem as DUAS colunas, com cabecalho proprio", () => {
    const html = fonte(LISTA);
    expect(html, "a coluna da data nao foi criada").toContain('<th scope="col">Vence em</th>');
    expect(html, "a barra perdeu o cabecalho").toContain('<th scope="col">Restam</th>');
    expect(
      html.includes('<th scope="col">Prazo</th>'),
      "a coluna unica 'Prazo' continua la: ela e a que escondia a data",
    ).toBe(false);
  });
});

/* ============================================================
   2. O filtro de atrasadas, no servidor
   ============================================================ */

describe("O filtro de atrasadas e do servidor", () => {
  const pedidos: string[] = [];
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    pedidos.length = 0;
    globalThis.fetch = (async (url: string) => {
      pedidos.push(String(url));
      return new Response(
        JSON.stringify({ itens: [], total: 0, pagina: 1, porPagina: 10 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
  });

  afterEach(() => { globalThis.fetch = fetchOriginal; });

  const sessaoFalsa = {} as never;

  it("o filtro, a pagina e o tamanho da pagina viajam na consulta", async () => {
    const { listarPaginaDeOcorrencias } = await import("../src/dados/http");
    await listarPaginaDeOcorrencias(sessaoFalsa, {
      status: "ativas", atrasadas: true, pagina: 3, porPagina: 10,
    });
    const url = pedidos[0] ?? "";
    expect(url, "o filtro de atrasadas ficou no navegador").toContain("atrasadas=1");
    expect(url, "a pagina pedida nao chegou ao servidor").toContain("pagina=3");
    expect(url).toContain("porPagina=10");
  });

  it("desligado, ele nem aparece na consulta", async () => {
    const { listarPaginaDeOcorrencias } = await import("../src/dados/http");
    await listarPaginaDeOcorrencias(sessaoFalsa, { status: "ativas", atrasadas: false });
    expect(pedidos[0] ?? "").not.toContain("atrasadas");
  });

  it("a resposta chega com o total, e nao so com as linhas", async () => {
    const { listarPaginaDeOcorrencias } = await import("../src/dados/http");
    const r = await listarPaginaDeOcorrencias(sessaoFalsa, {});
    expect(
      Object.keys(r).sort(),
      "sem o total a tela nao tem como dizer que esta mostrando um recorte",
    ).toEqual(["itens", "pagina", "porPagina", "total"]);
  });

  it("a tela pede a pagina ao servidor e nao recorta a lista na mao", () => {
    const html = fonte(LISTA);
    expect(html).toMatch(/listarPaginaDeOcorrencias\(/);
    expect(
      html,
      "a tela voltou a peneirar atrasadas no navegador: isso so alcanca a "
      + "pagina que ja desceu, entao o rodape passa a contar o recorte",
    ).not.toMatch(/\.filter\([^)]*prazo_em/);
    expect(
      /\.slice\(\s*\(\s*pagina/.test(html),
      "a tela voltou a recortar a pagina na mao, em cima do que baixou",
    ).toBe(false);
  });

  it("o total mostrado no rodape e o do servidor", () => {
    const html = fonte(LISTA);
    expect(html).toMatch(/const total = dados\?\.total \?\? 0/);
  });
});

/* ============================================================
   2b. A pagina fora do fim
   ============================================================ */

describe("Pagina alem do fim se corrige sem escrever bobagem", () => {
  it("com total cheio e pagina vazia, a tabela nao e desenhada", () => {
    /*
      Com a paginacao no servidor, a lista pode encurtar embaixo de quem esta
      na pagina 3. Desenhar a tabela nesse instante daria cabecalho sem linha
      nenhuma e um rodape dizendo "Mostrando 21 a 2 de 2", que se le como "nao
      tem nenhuma" bem na hora em que existem.
    */
    const html = fonte(LISTA);
    expect(html).toMatch(/visiveis\.length === 0 \?/);
    expect(
      html,
      "a tela precisa pedir a pagina certa quando a atual passou do fim",
      ).toMatch(/pagina > paginas/);
  });
});

/* ============================================================
   3. O mapa, com teto declarado
   ============================================================ */

describe("O mapa conta quantas existem, nao so quantas coube desenhar", () => {
  const pedidos: string[] = [];
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    pedidos.length = 0;
    globalThis.fetch = (async (url: string) => {
      pedidos.push(String(url));
      return new Response(
        JSON.stringify({ itens: [], total: 0, semCoordenada: 0, pagina: 1, porPagina: 200 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
  });

  afterEach(() => { globalThis.fetch = fetchOriginal; });

  it("existe uma consulta propria do mapa", async () => {
    const http = await import("../src/dados/http");
    expect(
      typeof http.pontosDoMapa,
      "o mapa continua pedindo a lista comum, que vem paginada, e desenhando "
      + "a primeira pagina como se fosse a cidade inteira",
    ).toBe("function");
  });

  it("ela pergunta pela rota do mapa, com pagina", async () => {
    const { pontosDoMapa } = await import("../src/dados/http");
    const r = await pontosDoMapa({} as never, 2);
    expect(pedidos[0] ?? "").toContain("/ocorrencias/mapa");
    expect(pedidos[0] ?? "").toContain("pagina=2");
    expect(Object.keys(r).sort()).toEqual(
      ["itens", "pagina", "porPagina", "semCoordenada", "total"],
    );
  });

  it("a tela diz quantas existem, quantas desenhou e quantas nao tem coordenada", () => {
    const html = fonte(MAPA);
    expect(html).toMatch(/pontosDoMapa\(/);
    expect(
      html,
      "o cabecalho voltou a contar so os marcadores desenhados",
    ).toMatch(/Desenhando \{desenhados\.length\} de \{total\}/);
    expect(
      html,
      "o teto voltou a ser silencioso: sem aviso, quem olha o mapa acha que "
      + "viu a cidade inteira",
    ).toMatch(/faltamDesenhar > 0 &&/);
    expect(
      html,
      "as ativas sem coordenada sumiram da tela. Elas nao somem do mapa, elas "
      + "nunca entraram nele, e ninguem fica sabendo",
    ).toMatch(/semCoordenada > 0 &&/);
  });

  it("da para andar para a proxima leva de marcadores", () => {
    const html = fonte(MAPA);
    expect(html).toMatch(/setPagina\(dados\.pagina \+ 1\)/);
    expect(html).toMatch(/setPagina\(dados\.pagina - 1\)/);
  });
});
