import { describe, expect, it } from "vitest";
import {
  CAPACIDADE_MAXIMA, TextoLongoDemais, bitsDeFormato, bitsDeVersao, correcaoDeErro, matrizQr,
} from "../src/componentes/qr";

/**
 * O código QR da ativação da verificação em duas etapas.
 *
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR é de uma espécie específica e
 * cruel: um código QR errado PARECE um código QR. Ele tem os três olhos, o
 * quadriculado, o tamanho certo, e passa por qualquer revisão humana. O
 * sintoma aparece na mão de quem está ligando a segunda etapa da conta de
 * administrador do município, na forma de "meu telefone não lê", sem nenhuma
 * pista do motivo. Foi exatamente o que aconteceu na primeira versão deste
 * módulo: o polinômio gerador saía espelhado, todos os bytes de correção de
 * erro ficavam errados, e o desenho continuava lindo.
 *
 * Por isso os casos abaixo NÃO comparam o desenho consigo mesmo. Cada um
 * confere um pedaço contra um valor que veio de fora deste repositório:
 *
 *   - as duas palavras de verificação (formato e versão) contra as tabelas
 *     publicadas na ISO/IEC 18004, que aqui são CALCULADAS por BCH e não
 *     copiadas;
 *   - a correção de erro contra o vetor conhecido de "HELLO WORLD";
 *   - a estrutura contra o que a norma manda desenhar em posição fixa.
 *
 * O QUE ESTES CASOS NÃO PROVAM, dito de frente: que um telefone lê o desenho.
 * Isso foi conferido à parte, fora da suíte, gerando o desenho e decodificando
 * com o detector de código QR do CoreImage da Apple (o mesmo motor da câmera
 * do iPhone), nas versões 1, 2, 6 e 9, e o texto voltou idêntico ao original.
 * Não dá para trazer essa conferência para cá porque ela depende de Swift e de
 * uma máquina Apple, e um portão que só roda na máquina de uma pessoa não é
 * portão.
 */

describe("As palavras de verificação, contra a tabela da norma", () => {
  it("os quinze bits de formato do nível L, nas oito máscaras", () => {
    /*
      Tabela publicada na ISO/IEC 18004 para o nível L. Se o cálculo BCH deste
      módulo divergir dela em UM bit, o leitor não descobre qual máscara foi
      usada e o desenho inteiro vira ruído.
    */
    const daNorma = [
      "111011111000100", "111001011110011", "111110110101010", "111100010011101",
      "110011000101111", "110001100011000", "110110001000001", "110100101110110",
    ];
    for (let mascara = 0; mascara < 8; mascara++) {
      expect(
        bitsDeFormato(mascara).toString(2).padStart(15, "0"),
        `formato da máscara ${mascara}`,
      ).toBe(daNorma[mascara]);
    }
  });

  it("os dezoito bits de versão, que só existem da versão 7 em diante", () => {
    expect(bitsDeVersao(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
    expect(bitsDeVersao(8).toString(2).padStart(18, "0")).toBe("001000010110111100");
    expect(bitsDeVersao(9).toString(2).padStart(18, "0")).toBe("001001101010011001");
  });
});

describe("A correção de erro", () => {
  it("bate com o vetor conhecido de HELLO WORLD", () => {
    /*
      Vetor clássico da literatura de código QR: estes dezesseis bytes de dados
      produzem estes dez de correção. Ele é o que pega o erro que já aconteceu
      aqui (polinômio gerador com os coeficientes em ordem invertida), e que
      nenhuma conferência visual pegaria.
    */
    const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(correcaoDeErro(dados, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("um byte diferente muda a correção inteira", () => {
    // Âncora: sem ela, uma implementação que devolvesse sempre a mesma coisa
    // passaria no caso acima se o vetor fosse o único exercitado.
    const a = correcaoDeErro([1, 2, 3, 4], 7);
    const b = correcaoDeErro([1, 2, 3, 5], 7);
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(7);
  });
});

describe("O desenho", () => {
  const uri = "otpauth://totp/DC360:helena%40serraalta.exemplo.gov.br"
    + "?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DC360";

  it("escolhe a menor versão que cabe, e o tamanho segue a versão", () => {
    expect(matrizQr("oi").versao).toBe(1);
    expect(matrizQr("oi").tamanho).toBe(21);

    const grande = matrizQr(uri);
    expect(grande.versao).toBe(6);
    expect(grande.tamanho).toBe(17 + 4 * 6);
  });

  it("recusa o que não cabe, em vez de desenhar algo ilegível", () => {
    /*
      A recusa É a funcionalidade. Um desenho truncado seria indistinguível de
      um bom, e a pessoa tentaria três vezes antes de desconfiar da tela; com a
      recusa, ela lê "cadastre o segredo à mão" e resolve em vinte segundos.
    */
    expect(() => matrizQr("x".repeat(CAPACIDADE_MAXIMA + 1))).toThrow(TextoLongoDemais);
    expect(() => matrizQr("x".repeat(CAPACIDADE_MAXIMA))).not.toThrow();
  });

  it("tem os três olhos, nos três cantos, com a borda clara em volta", () => {
    const { modulos, tamanho } = matrizQr(uri);
    const olho = (linha: number, coluna: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const borda = i === 0 || i === 6 || j === 0 || j === 6;
          const centro = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          expect(
            modulos[linha + i]![coluna + j],
            `olho em ${linha},${coluna}: módulo ${i},${j}`,
          ).toBe(borda || centro);
        }
      }
    };
    olho(0, 0);
    olho(0, tamanho - 7);
    olho(tamanho - 7, 0);

    // A borda clara entre o olho e os dados: sem ela o leitor não acha o olho.
    for (let i = 0; i < 8; i++) {
      expect(modulos[7]![i], `separador horizontal em ${i}`).toBe(false);
      expect(modulos[i]![7], `separador vertical em ${i}`).toBe(false);
    }
  });

  it("tem as duas réguas de tempo, alternando", () => {
    const { modulos, tamanho } = matrizQr(uri);
    for (let i = 8; i < tamanho - 8; i++) {
      expect(modulos[6]![i], `régua horizontal em ${i}`).toBe(i % 2 === 0);
      expect(modulos[i]![6], `régua vertical em ${i}`).toBe(i % 2 === 0);
    }
  });

  it("tem o módulo escuro fixo que a norma manda", () => {
    for (const texto of ["oi", uri]) {
      const m = matrizQr(texto);
      expect(m.modulos[4 * m.versao + 9]![8], `versão ${m.versao}`).toBe(true);
    }
  });

  it("o mesmo texto sempre desenha a mesma coisa", () => {
    /*
      Não é preciosismo: o enchimento é fixado pela norma justamente para isto,
      e um desenho que mudasse a cada chamada seria sinal de alguma aleatoriedade
      no caminho, que num desenho que carrega segredo é o começo de uma pergunta
      pior.
    */
    expect(matrizQr(uri).modulos).toEqual(matrizQr(uri).modulos);
  });

  it("textos diferentes desenham coisas diferentes", () => {
    expect(matrizQr(`${uri}a`).modulos).not.toEqual(matrizQr(uri).modulos);
  });
});
