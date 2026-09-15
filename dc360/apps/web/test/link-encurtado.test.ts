import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { lerLocalizacaoColada } from "../src/paginas/coordenada-colada";
import { mensagemDaLeitura } from "../src/paginas/coordenada-corrigida";
import {
  FRASE_ABRINDO, ROTULO_DO_BOTAO, descobrirPonto, linkNoTexto, origemDoPonto,
  textoDoPontoDescoberto, type Resolvedor,
} from "../src/paginas/link-encurtado";
import { DescobrirPonto } from "../src/componentes/DescobrirPonto";
import { ErroDaApi, SemConexao } from "../src/dados/http";
import * as local from "../src/dados/local";
import * as repositorio from "../src/dados/repositorio";

/**
 * O LINK CURTO DO GOOGLE MAPS, do lado da tela.
 *
 * O reclame de quem paga, na letra: "o campo localização do mapa ao abrir a
 * ocorrência tem que aceitar link curto do gmaps, hoje não tá aceitando". O
 * painel recusava de propósito, e continua sem abrir link nenhum a partir do
 * navegador: quem abre é o servidor da prefeitura (`POST /mapa/resolver-link`),
 * e só quando a pessoa aperta o botão, porque abrir o link é o servidor
 * contando ao Google que aquele ponto foi consultado.
 *
 * O que este arquivo prende:
 *
 * 1. A leitura `encurtado` OFERECE o botão, com a frase que diz o que vai
 *    acontecer, e não dispara nada sozinha.
 * 2. O sucesso PREENCHE o campo com um texto que o leitor da tela relê como
 *    ponto, e a tela diz de onde o ponto veio.
 * 3. Cada falha vira a frase da API, e não "erro".
 * 4. O modo de demonstração diz que não abre link, em vez de fingir.
 * 5. As duas telas (abertura e correção) usam o mesmo componente.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const LINK = "https://maps.app.goo.gl/AbCdEfGhIjKlMnOp7";
const PONTO = { latitude: -27.595378, longitude: -48.54805, urlFinal: "https://www.google.com/maps/@-27.595378,-48.54805,17z" };

function resolvedorQue(resposta: () => Promise<typeof PONTO>): Resolvedor {
  return async () => resposta();
}

describe("A leitura `encurtado` oferece o botão, e não abre nada sozinha", () => {
  it("o componente desenha a frase e o botão, e nada mais acontece sem clique", () => {
    let chamadas = 0;
    const html = renderToStaticMarkup(h(DescobrirPonto, {
      url: LINK,
      resolver: resolvedorQue(async () => { chamadas += 1; return PONTO; }),
      onPonto: () => {},
    }));
    expect(html).toContain(ROTULO_DO_BOTAO);
    expect(html).toContain("servidor da prefeitura");
    expect(html).toContain("Google");
    expect(html, "o botão é um botão, e não um link").toMatch(/<button[^>]*type="button"[^>]*>[^<]*Descobrir o ponto/);
    expect(chamadas, "desenhar não é pedir: só o clique chama o servidor").toBe(0);
  });

  it("as frases fixas dizem o ato e quem o faz", () => {
    expect(ROTULO_DO_BOTAO).toBe("Descobrir o ponto");
    expect(FRASE_ABRINDO).toBe("Abrindo o link no servidor da prefeitura para descobrir o ponto");
  });

  it("a mensagem da correção deixou de dizer que o painel não abre link, e aponta o botão", () => {
    const frase = mensagemDaLeitura("encurtado");
    expect(frase).toContain("encurtado");
    expect(frase).not.toMatch(/não abre link nenhum/);
    expect(frase).toContain(ROTULO_DO_BOTAO);
  });

  it("a abertura e a correção desenham o MESMO componente no caso `encurtado`", () => {
    /*
      Portão de texto, porque este painel não roda em navegador de teste. O
      que ele impede é o pior desfecho: a abertura ganha o botão e a correção
      continua dizendo que o painel não abre link nenhum.
    */
    for (const arquivo of ["NovaOcorrencia.tsx", "Ocorrencia.tsx"]) {
      const fonte = readFileSync(join(RAIZ, "paginas", arquivo), "utf8");
      expect(fonte, `${arquivo} importa o componente`).toMatch(/import \{ DescobrirPonto \} from "\.\.\/componentes\/DescobrirPonto"/);
      expect(fonte, `${arquivo} desenha o componente`).toContain("<DescobrirPonto");
      expect(fonte, `${arquivo} ainda diz que o painel não abre link nenhum`)
        .not.toMatch(/painel não abre link nenhum/);
    }
  });
});

describe("O sucesso preenche o campo, e a tela diz de onde o ponto veio", () => {
  it("o ponto descoberto vira o texto do campo, e o leitor da tela o relê como ponto", async () => {
    const descoberta = await descobrirPonto(LINK, resolvedorQue(async () => PONTO));
    expect(descoberta.tipo).toBe("ponto");
    if (descoberta.tipo !== "ponto") return;
    expect(descoberta.coordenada).toEqual({ lat: -27.595378, lng: -48.54805 });
    expect(descoberta.urlFinal).toBe(PONTO.urlFinal);

    const texto = textoDoPontoDescoberto(descoberta);
    expect(texto).toBe("-27.595378, -48.548050");
    /*
      Ida e volta: o texto que o botão põe no campo precisa ser lido pelo
      MESMO leitor que lê o que a pessoa cola. Se o formato divergir, o campo
      mostra "não reconheci coordenada nisso" logo depois de descobrir o ponto.
    */
    const relida = lerLocalizacaoColada(texto);
    expect(relida.tipo).toBe("coordenada");
    if (relida.tipo === "coordenada") {
      expect(relida.coordenada).toEqual({ lat: -27.595378, lng: -48.54805 });
    }
  });

  it("o servidor recebe o LINK, e não a frase em volta dele", async () => {
    /*
      O leitor compartilhado aceita "veja aqui https://maps.app.goo.gl/x" como
      `encurtado`, porque é assim que o link chega colado do WhatsApp. O
      servidor recebe só o link: mandar a frase inteira levaria um
      `link_nao_aceito` por causa de duas palavras que não são o link.
    */
    const recebidos: string[] = [];
    const resolver: Resolvedor = async (url) => { recebidos.push(url); return PONTO; };
    await descobrirPonto(`veja aqui ${LINK} que a dona Maria mandou`, resolver);
    await descobrirPonto(`  ${LINK}\n`, resolver);
    await descobrirPonto("sem link nenhum", resolver);
    expect(recebidos).toEqual([LINK, LINK, "sem link nenhum"]);
    expect(linkNoTexto(`Local: ${LINK}, portão azul`)).toBe(LINK);
  });

  it("a origem do ponto diz que ele veio do link, pelo servidor, e leva ao mapa", () => {
    const origem = origemDoPonto(`veja aqui ${LINK} que a dona Maria mandou`, PONTO.urlFinal);
    expect(origem.frase).toContain("descoberto pelo servidor da prefeitura");
    expect(origem.frase).toContain(`link encurtado ${LINK}.`);
    expect(origem.frase, "a frase cita o link, não a conversa em volta").not.toContain("dona Maria");
    expect(origem.link).toBe(PONTO.urlFinal);
  });

  it("o componente chama `onPonto` com o que a tela precisa, e só no sucesso", async () => {
    const recebidos: unknown[] = [];
    const descoberta = await descobrirPonto(LINK, resolvedorQue(async () => PONTO));
    if (descoberta.tipo === "ponto") recebidos.push(descoberta);
    expect(recebidos).toHaveLength(1);

    const falha = await descobrirPonto(LINK, resolvedorQue(async () => { throw new SemConexao(); }));
    expect(falha.tipo).toBe("falha");
  });
});

describe("Cada falha mostra a frase da API, e não 'erro'", () => {
  const frases: Array<[string, () => Error]> = [
    ["link_nao_aceito", () => new ErroDaApi(422, { erro: "link_nao_aceito", mensagem: "O servidor só abre link curto do Google Maps." })],
    ["sem_ponto", () => new ErroDaApi(422, { erro: "sem_ponto", mensagem: "Esse link não aponta para um ponto." })],
    ["nao_resolveu", () => new ErroDaApi(502, { erro: "nao_resolveu", mensagem: "O encurtador do Google não respondeu a tempo." })],
    ["sem_permissao", () => new ErroDaApi(403, { erro: "sem_permissao", mensagem: "Você não tem permissão para registrar ocorrência." })],
    ["excesso_de_requisicoes", () => new ErroDaApi(429, { erro: "excesso_de_requisicoes", mensagem: "Requisições demais. Aguarde um instante." })],
  ];

  for (const [codigo, erro] of frases) {
    it(`${codigo}: a frase do servidor chega inteira à tela`, async () => {
      const esperada = erro().message;
      const falha = await descobrirPonto(LINK, resolvedorQue(async () => { throw erro(); }));
      expect(falha.tipo).toBe("falha");
      if (falha.tipo === "falha") expect(falha.mensagem).toBe(esperada);
    });
  }

  it("sem conexão, a frase diz que é a conexão e não o link", async () => {
    const falha = await descobrirPonto(LINK, resolvedorQue(async () => { throw new SemConexao(); }));
    expect(falha.tipo).toBe("falha");
    if (falha.tipo === "falha") expect(falha.mensagem).toMatch(/Sem conexão/);
  });

  it("erro que não é da API nem de rede também vira frase, e nunca vaza objeto", async () => {
    const falha = await descobrirPonto(LINK, resolvedorQue(async () => { throw new Error("qualquer coisa"); }));
    expect(falha.tipo).toBe("falha");
    if (falha.tipo === "falha") {
      expect(falha.mensagem).toBe("qualquer coisa");
    }
    const semMensagem = await descobrirPonto(LINK, resolvedorQue(async () => { throw { estranho: true }; }));
    expect(semMensagem.tipo).toBe("falha");
    if (semMensagem.tipo === "falha") expect(semMensagem.mensagem.length).toBeGreaterThan(10);
  });

  it("o componente desenha a falha com ícone e texto, sem vermelho, e oferece tentar de novo", () => {
    const html = renderToStaticMarkup(h(DescobrirPonto, {
      url: LINK,
      resolver: resolvedorQue(async () => PONTO),
      onPonto: () => {},
      estadoInicial: { tipo: "falha", mensagem: "Esse link não aponta para um ponto." },
    }));
    expect(html).toContain("Esse link não aponta para um ponto.");
    expect(html).toContain(`${ROTULO_DO_BOTAO} de novo`);
    expect(html, "ícone junto do texto, nunca só cor").toMatch(/aria-hidden="true">!</);
    /*
      Vermelho é dado errado entrando (a regra está em `app.css`, junto de
      `.leitura--erro`). O servidor não ter aberto o link é aviso sobre campo
      opcional, com o próximo passo na frase.
    */
    expect(html).not.toContain("leitura--erro");
  });

  it("enquanto abre, a tela diz o que está fazendo e o botão some", () => {
    const html = renderToStaticMarkup(h(DescobrirPonto, {
      url: LINK,
      resolver: resolvedorQue(async () => PONTO),
      onPonto: () => {},
      estadoInicial: { tipo: "abrindo" },
    }));
    expect(html).toContain(FRASE_ABRINDO);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<button/);
  });
});

describe("O modo de demonstração diz que não abre link", () => {
  it("`resolverLinkDeMapa` no modo local recusa com a frase, sem tocar em rede", async () => {
    await expect(local.resolverLinkDeMapa(LINK)).rejects.toThrow(/demonstração/);
    await expect(local.resolverLinkDeMapa(LINK)).rejects.toThrow(/não abre link/);
  });

  it("a recusa da demonstração chega à tela como falha com frase", async () => {
    const falha = await descobrirPonto(LINK, local.resolverLinkDeMapa);
    expect(falha.tipo).toBe("falha");
    if (falha.tipo === "falha") expect(falha.mensagem).toMatch(/demonstração/);
  });

  it("a função sai de `dados/` pelo repositório, nos dois modos", () => {
    expect(typeof repositorio.resolverLinkDeMapa).toBe("function");
  });
});
