import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Campo, idsDoCampo, ligacoesDoCampo } from "../src/componentes/Campo";

/**
 * A amarração do campo, que é toda invisível.
 *
 * Nenhum dos atributos daqui muda um pixel na tela: sem eles o formulário
 * continua desenhado igual, e é por isso que eles somem em silêncio quando a
 * amarração é repetida à mão em onze arquivos. O que cada um evita:
 *
 * - `aria-describedby` para o erro: sem ele, quem navega por teclado chega no
 *   campo, ouve só o rótulo, corrige no escuro e descobre o motivo ao enviar
 *   de novo. A mensagem está na tela, dois centímetros abaixo, e não existe
 *   para quem não a enxerga;
 * - `aria-invalid`: sem ele, a borda vermelha é a única pista de que aquele
 *   campo é o do problema, e cor sozinha é o que este produto se proibiu de
 *   usar para comunicar estado;
 * - `required`: sem ele, "obrigatório" existe só na convenção do rótulo;
 * - `htmlFor` casando com o `id`: sem isso, o rótulo é texto solto, o clique
 *   nele não foca o campo, e o leitor de tela anuncia "edição de texto" sem
 *   dizer de quê.
 */

/** Lê o valor de um atributo do HTML renderizado. */
function atributo(html: string, nome: string): string | null {
  return new RegExp(`${nome}="([^"]*)"`).exec(html)?.[1] ?? null;
}

function renderizar(props: Partial<Parameters<typeof Campo>[0]> = {}) {
  return renderToStaticMarkup(
    h(
      Campo,
      {
        id: "motivo",
        rotulo: "Motivo do encerramento",
        ...props,
        children: (ligacoes) => h("textarea", { ...ligacoes }),
      },
    ),
  );
}

describe("A amarração calculada", () => {
  it("erro e dica descrevem o campo, com o erro primeiro", () => {
    /*
      A ordem da lista é a ordem em que o leitor de tela fala. Quem está
      corrigindo precisa ouvir primeiro o que está errado, e não o texto de
      apoio que já ouviu quando preencheu.
    */
    const ligacoes = ligacoesDoCampo({ id: "motivo", erro: "Diga o motivo", temDica: true });
    expect(ligacoes["aria-describedby"]).toBe("motivo-erro motivo-dica");
  });

  it("sem erro, descreve só pela dica", () => {
    expect(ligacoesDoCampo({ id: "motivo", temDica: true })["aria-describedby"]).toBe("motivo-dica");
  });

  it("sem erro e sem dica, não aponta para id que não existe", () => {
    // Apontar para um `id` ausente faz o leitor de tela anunciar o campo sem
    // descrição nenhuma, e ninguém descobre que a descrição sumiu.
    expect(ligacoesDoCampo({ id: "motivo" })["aria-describedby"]).toBeUndefined();
  });

  it("aria-invalid aparece só quando há erro", () => {
    expect(ligacoesDoCampo({ id: "motivo", erro: "Diga o motivo" })["aria-invalid"]).toBe(true);
    expect(ligacoesDoCampo({ id: "motivo" })["aria-invalid"]).toBeUndefined();
  });

  it("obrigatório é o padrão, e opcional é a exceção declarada", () => {
    // A convenção deste painel: marca-se a exceção, não a regra.
    expect(ligacoesDoCampo({ id: "motivo" }).required).toBe(true);
    expect(ligacoesDoCampo({ id: "motivo", opcional: true }).required).toBeUndefined();
  });

  it("os ids derivam do campo, um por texto", () => {
    expect(idsDoCampo("motivo")).toEqual({ dica: "motivo-dica", erro: "motivo-erro" });
  });
});

describe("O campo renderizado", () => {
  it("o rótulo aponta para o controle, e o controle tem esse id", () => {
    const html = renderizar();
    expect(atributo(html, "for")).toBe("motivo");
    expect(html).toMatch(/<textarea[^>]*id="motivo"/);
  });

  it("o erro é anunciado e amarrado ao campo", () => {
    const html = renderizar({ erro: "O banco recusa encerramento sem motivo" });
    expect(html).toMatch(/<textarea[^>]*aria-describedby="motivo-erro"/);
    expect(html).toMatch(/<textarea[^>]*aria-invalid="true"/);
    // O id apontado precisa existir no documento, senão a descrição é uma
    // promessa vazia.
    expect(html).toContain('id="motivo-erro"');
    expect(html).toContain("O banco recusa encerramento sem motivo");
    // E o erro é anunciado no instante em que aparece, não só ao passar por
    // ele: `ErroCampo` carrega `role="alert"`.
    expect(html).toContain('role="alert"');
  });

  it("a dica é amarrada, e não é texto solto ao lado do campo", () => {
    const html = renderizar({ dica: "O banco recusa encerramento sem motivo" });
    expect(html).toMatch(/<textarea[^>]*aria-describedby="motivo-dica"/);
    expect(html).toContain('id="motivo-dica"');
  });

  it("com erro e dica, os dois descrevem, nessa ordem", () => {
    const html = renderizar({ erro: "Diga o motivo", dica: "Fica na trilha" });
    expect(html).toMatch(/<textarea[^>]*aria-describedby="motivo-erro motivo-dica"/);
  });

  it("obrigatório chega ao controle, sem ninguém escrever à mão", () => {
    expect(renderizar()).toMatch(/<textarea[^>]*required/);
  });

  it("opcional diz isso no rótulo E tira o required, de uma vez só", () => {
    /*
      As duas metades separadas divergem: rótulo dizendo "(opcional)" num
      campo que o navegador barra por `required`, ou o contrário. Aqui elas
      saem da mesma propriedade.
    */
    const html = renderizar({ opcional: true });
    expect(html).toContain("(opcional)");
    expect(html).not.toContain("required");
  });
});
