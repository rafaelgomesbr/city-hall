import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matrizQr } from "../src/qr.js";
import { uriDeAtivacao } from "../../api/src/auth/totp.js";

/**
 * O QR do console é uma CÓPIA do QR do painel, e este arquivo é o portão que
 * impede as duas cópias de envelhecerem separadas.
 *
 * A razão da cópia está no cabeçalho de `src/qr.ts`: a imagem de produção do
 * console não carrega `apps/web`, então importar de lá compilaria na máquina
 * de quem desenvolve e quebraria o build. O preço de copiar é o de sempre, e
 * ele é pago aqui: quem corrigir o algoritmo lá e esquecer aqui recebe um
 * vermelho, e não um operador cujo telefone "não lê o código".
 *
 * A comparação é do texto DEPOIS do primeiro bloco de comentário de cada
 * arquivo, porque o cabeçalho do console explica a cópia e o do painel explica
 * a ativação. Tudo o que é algoritmo precisa ser idêntico byte a byte.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

function semOCabecalho(caminho: string): string {
  const texto = readFileSync(caminho, "utf8");
  const fim = texto.indexOf("*/");
  expect(fim, `${caminho} nao comeca com um bloco de comentario`).toBeGreaterThan(0);
  return texto.slice(fim + 2);
}

describe("O QR do console e o do painel, byte a byte", () => {
  it("o corpo dos dois arquivos e identico", () => {
    const doConsole = semOCabecalho(join(AQUI, "..", "src", "qr.ts"));
    const doPainel = semOCabecalho(join(AQUI, "..", "..", "web", "src", "componentes", "qr.ts"));
    expect(doConsole.length, "a copia do console ficou vazia").toBeGreaterThan(5_000);
    expect(
      doConsole === doPainel,
      "src/qr.ts do console divergiu de apps/web/src/componentes/qr.ts: corrija no painel "
      + "e traga a copia para ca, nunca o contrario",
    ).toBe(true);
  });

  it("o endereco otpauth de um operador cabe no desenho, com email longo", () => {
    /*
      O painel aceita ate a versao 9 (230 bytes). O endereco do console leva o
      emissor "DC360 Console" duas vezes e o email do operador, e um email de
      fornecedor pode ser comprido. Este caso fixa que um email de 60
      caracteres ainda cabe, para a tela nao cair no "digite a mao" por um
      email normal.
    */
    const segredo = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const email = "coordenacao.regional.sudeste.plantao@fornecedor-de-software.com.br";
    const endereco = uriDeAtivacao(segredo, email, "DC360 Console");
    const matriz = matrizQr(endereco);
    expect(matriz.tamanho).toBeGreaterThan(20);
    expect(matriz.modulos[0]!.slice(0, 7).every(Boolean), "o olho do canto nao esta la").toBe(true);
  });
});
