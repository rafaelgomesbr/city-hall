import { describe, expect, it } from "vitest";
import { mascararDadoPessoal } from "../src/index.js";

/**
 * A máscara que protege log e evento de erro de terceiro (V2-F01-E14).
 *
 * Ela é rede de segurança para texto que o produto não escreveu (mensagem de
 * exceção, texto de erro do navegador). O que precisa ficar travado é o par:
 * o dado pessoal e a credencial saem, e o código de suporte (UUID) fica, porque
 * sem ele o erro não se acha.
 */

const ID = "3f2b8c1e-5a47-4d0e-9b61-7c2d4e8f1a90";

describe("mascararDadoPessoal", () => {
  it("troca e-mail por marcador", () => {
    const saida = mascararDadoPessoal("falha ao gravar maria.souza@prefeitura-serra.gov.br na tabela");
    expect(saida).toBe("falha ao gravar [email] na tabela");
  });

  it("troca telefone brasileiro em várias grafias", () => {
    for (const telefone of [
      "(11) 91234-5678", "11 91234-5678", "11912345678", "+55 11 91234-5678",
      "(21) 3456-7890", "5511912345678",
    ]) {
      const saida = mascararDadoPessoal(`contato ${telefone} sem retorno`);
      expect(saida, telefone).toBe("contato [telefone] sem retorno");
    }
  });

  it("troca CPF", () => {
    expect(mascararDadoPessoal("cpf 123.456.789-09 invalido")).toBe("cpf [cpf] invalido");
  });

  it("troca coordenada de quatro casas ou mais, em qualquer sinal", () => {
    expect(mascararDadoPessoal("ponto -22.9068, -43.1729 fora")).toBe("ponto [coordenada], [coordenada] fora");
    expect(mascararDadoPessoal("lat 23.55052 lng 46.633309")).toBe("lat [coordenada] lng [coordenada]");
  });

  it("troca token de portador e JWT solto", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3VhcmlvIn0.assinaturaDoToken123";
    expect(mascararDadoPessoal(`cabecalho Bearer ${jwt} recusado`)).toBe("cabecalho Bearer [token] recusado");
    expect(mascararDadoPessoal(`jwt ${jwt} solto`)).toBe("jwt [token] solto");
  });

  it("poupa o UUID, que é o código de suporte, mesmo com dígitos que parecem telefone", () => {
    const comDigitos = "12345678-1234-4234-9234-123456789012";
    expect(mascararDadoPessoal(`requisicao ${ID} e ${comDigitos}`)).toBe(`requisicao ${ID} e ${comDigitos}`);
  });

  it("mascara o que está ao lado do UUID, no mesmo texto", () => {
    const saida = mascararDadoPessoal(`req ${ID} de joao@x.com.br ligou (11) 98888-7777`);
    expect(saida).toBe(`req ${ID} de [email] ligou [telefone]`);
  });

  it("não toca em número comum nem em versão", () => {
    expect(mascararDadoPessoal("rodada 42 de 100, versão 1.2.3, status 503")).toBe(
      "rodada 42 de 100, versão 1.2.3, status 503",
    );
  });

  it("texto vazio continua vazio", () => {
    expect(mascararDadoPessoal("")).toBe("");
  });
});
