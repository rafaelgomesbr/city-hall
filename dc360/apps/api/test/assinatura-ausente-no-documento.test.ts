import { describe, expect, it } from "vitest";
import { assinatura } from "../src/documentos/folha.js";

/*
  Confirmado com dado de producao em 09/09/2026: as tres vistorias do piloto de
  Florianopolis tinham `assinatura_chave` nula, porque a tela do aplicativo
  liberava a conclusao sem a assinatura confirmada.

  Os tres laudos sairiam com um espaco em branco acima da linha, que quem le o
  papel meses depois nao consegue distinguir de imagem que nao carregou. Num
  documento que sustenta ato administrativo, silencio ambiguo e pior que
  ausencia declarada.
*/
describe("assinatura no documento oficial", () => {
  it("com traço, imprime a imagem", () => {
    const html = assinatura("Joana Ferreira", "Presente no local", "https://exemplo/assinatura.png");
    expect(html).toContain('class="traco"');
    expect(html).toContain("https://exemplo/assinatura.png");
    expect(html).not.toContain("não coletada");
  });

  it("sem traço, DIZ que não foi coletada, em vez de deixar espaço em branco", () => {
    const html = assinatura("Joana Ferreira", "Presente no local", null);
    expect(html).toContain("Assinatura não coletada");
    expect(html).not.toContain('class="traco"');
  });

  it("sem traço, o nome e o papel continuam impressos", () => {
    // Quem estava no local continua identificado: o que falta é o traço, e o
    // documento precisa dizer as duas coisas.
    const html = assinatura("Joana Ferreira", "Presente no local", undefined);
    expect(html).toContain("Joana Ferreira");
    expect(html).toContain("Presente no local");
  });

  it("escapa o nome, porque ele é texto digitado no morro", () => {
    const html = assinatura('Ana <script>alert(1)</script>', "Presente no local", null);
    expect(html).not.toContain("<script>");
  });
});
