import { describe, expect, it } from "vitest";
import { errosPorCampo, rotuloDoCampo } from "../src/campos.js";

/*
  O defeito, confirmado nas duas pontas em 08/09/2026: o servidor devolve a
  lista de campos invalidos no 422 e ninguem exibe. No aplicativo a lista e
  descartada dentro do transporte; no painel ela e montada em `ErroDaApi.campos`
  e nunca lida. O agente ve "Alguns campos precisam ser corrigidos" sobre uma
  coleta que custou uma manha, e nao tem como agir.
*/

describe("rotulo de campo", () => {
  it("traduz o caminho direto", () => {
    expect(rotuloDoCampo("assinanteNome")).toBe("Quem assinou");
  });

  it("traduz caminho aninhado, tirando o prefixo do envelope", () => {
    expect(rotuloDoCampo("vistoria.assinanteNome")).toBe("Quem assinou");
    expect(rotuloDoCampo("vistoria.checklist")).toBe("Checklist técnico");
  });

  it("numera o item quando o caminho traz indice de array", () => {
    // Sem o numero, tres fotos com o mesmo problema viram tres linhas iguais.
    expect(rotuloDoCampo("vistoria.fotos.2.capturadaEm")).toBe("Hora da fotografia (item 3)");
  });

  it("devolve o proprio caminho quando nao conhece, em vez de esconder", () => {
    expect(rotuloDoCampo("algo.que.ninguem.mapeou")).toBe("algo.que.ninguem.mapeou");
  });
});

describe("erros por campo", () => {
  it("monta o mapa que o formulario casa com os proprios campos", () => {
    const mapa = errosPorCampo([
      { campo: "vistoria.assinanteNome", mensagem: "Informe quem assinou" },
      { campo: "endereco", mensagem: "Informe o endereço" },
    ]);
    expect(mapa["assinanteNome"]).toBe("Informe quem assinou");
    expect(mapa["endereco"]).toBe("Informe o endereço");
  });

  it("mantem a primeira mensagem quando o mesmo campo aparece duas vezes", () => {
    const mapa = errosPorCampo([
      { campo: "vistoria.fotos.0.capturadaEm", mensagem: "primeira" },
      { campo: "vistoria.fotos.1.capturadaEm", mensagem: "segunda" },
    ]);
    expect(mapa["capturadaEm"]).toBe("primeira");
  });

  it("aceita lista vazia sem quebrar", () => {
    expect(errosPorCampo([])).toEqual({});
  });
});
