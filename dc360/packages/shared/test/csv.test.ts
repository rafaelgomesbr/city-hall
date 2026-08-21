import { describe, expect, it } from "vitest";
import { celulaCsv, montarCsv } from "../src/index.js";

/**
 * O caso que este arquivo existe para impedir é o de injeção de fórmula.
 *
 * O relato de uma ocorrência vem do que um cidadão dita por telefone. Se ele
 * disser um endereço que começa com `=`, e o operador digitar como ouviu, a
 * planilha exportada executa aquilo na máquina de quem abrir. A vítima é o
 * servidor público, e ele nunca vai suspeitar do arquivo que a própria
 * prefeitura gerou.
 */
describe("Célula de CSV", () => {
  it("neutraliza os inícios que a planilha trata como fórmula", () => {
    for (const perigoso of [
      "=1+1",
      "=HYPERLINK(\"http://malicioso\",\"clique\")",
      "+1+1",
      "-1+1",
      "@SUM(A1)",
      "\tcomeca com tabulacao",
      "\rcomeca com retorno",
    ]) {
      const saida = celulaCsv(perigoso);
      // Apóstrofo na frente: a planilha entende "isto é texto" e não o mostra.
      expect(saida.replace(/^"/, "").startsWith("'"), `nao neutralizou: ${perigoso}`).toBe(true);
    }
  });

  it("não mexe em texto comum", () => {
    expect(celulaCsv("Rua das Acácias, 245")).toBe('"Rua das Acácias, 245"');
    expect(celulaCsv("Deslizamento")).toBe("Deslizamento");
    expect(celulaCsv(42)).toBe("42");
  });

  it("escapa aspas duplicando, conforme a norma", () => {
    expect(celulaCsv('ele disse "vai cair"')).toBe('"ele disse ""vai cair"""');
  });

  it("protege campos com separador, quebra de linha e ponto e vírgula", () => {
    expect(celulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(celulaCsv("a;b")).toBe('"a;b"');
  });

  it("vazio e ausente viram célula vazia, não a palavra null", () => {
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(undefined)).toBe("");
  });
});

describe("Arquivo CSV", () => {
  it("abre certo no Excel em português", () => {
    const csv = montarCsv(["Protocolo", "Endereço"], [["000471/2026", "Rua das Acácias"]]);

    // Marca de ordem de bytes: sem ela, "Acácias" vira "AcÃ¡cias" no
    // relatório que chega ao prefeito.
    expect(csv.startsWith("\uFEFF")).toBe(true);
    // Ponto e vírgula: vírgula quebraria a planilha em configuração pt-BR.
    expect(csv).toContain("Protocolo;Endereço");
    // CRLF conforme RFC 4180.
    expect(csv).toContain("\r\n");
  });

  it("uma linha por registro, com o cabeçalho na frente", () => {
    const csv = montarCsv(["a", "b"], [[1, 2], [3, 4]]);
    const linhas = csv.replace("\uFEFF", "").trimEnd().split("\r\n");
    expect(linhas).toEqual(["a;b", "1;2", "3;4"]);
  });

  it("um relato malicioso não vira fórmula no arquivo inteiro", () => {
    const csv = montarCsv(
      ["Protocolo", "Relato"],
      [["000471/2026", '=cmd|\'/c calc\'!A1']],
    );
    expect(csv).not.toContain(";=cmd");
    expect(csv).toContain("'=cmd");
  });
});
