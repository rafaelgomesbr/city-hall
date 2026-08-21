import { describe, expect, it } from "vitest";
import { ACOES, PAPEIS, SemPermissao, exigirPermissao, podeExecutar } from "../src/index.js";

/**
 * A tabela de permissões é a única fonte da regra de quem pode o quê. A tela
 * consulta para decidir o que desenhar, e a camada de dados consulta para
 * decidir se grava. Estes testes fixam o contrato para que uma mudança de
 * papel não passe despercebida.
 */
describe("Permissões por papel", () => {
  it("operador de plantão registra chamado, mas não decide sobre ele", () => {
    expect(podeExecutar("operador", "abrir_ocorrencia")).toBe(true);
    expect(podeExecutar("operador", "classificar_triagem")).toBe(false);
    expect(podeExecutar("operador", "despachar_equipe")).toBe(false);
    expect(podeExecutar("operador", "encerrar_ocorrencia")).toBe(false);
    expect(podeExecutar("operador", "gerenciar_usuarios")).toBe(false);
  });

  it("agente de campo só registra vistoria", () => {
    expect(podeExecutar("agente_campo", "registrar_vistoria")).toBe(true);
    expect(podeExecutar("agente_campo", "despachar_equipe")).toBe(false);
    expect(podeExecutar("agente_campo", "encerrar_ocorrencia")).toBe(false);
  });

  it("coordenador conduz o fluxo inteiro do escritório", () => {
    for (const acao of ["classificar_triagem", "despachar_equipe",
                        "encaminhar_providencia", "encerrar_ocorrencia"] as const) {
      expect(podeExecutar("coordenador", acao), acao).toBe(true);
    }
  });

  it("ninguém além do agente de campo registra vistoria", () => {
    // A vistoria é ato de quem esteve no local e assina por isso.
    for (const papel of PAPEIS) {
      if (papel === "agente_campo") continue;
      expect(podeExecutar(papel, "registrar_vistoria"), papel).toBe(false);
    }
  });

  it("exigirPermissao lança erro identificável, não erro genérico", () => {
    expect(() => exigirPermissao("operador", "encerrar_ocorrencia")).toThrow(SemPermissao);
    try {
      exigirPermissao("operador", "encerrar_ocorrencia");
    } catch (e) {
      expect(e).toBeInstanceOf(SemPermissao);
      expect((e as SemPermissao).papel).toBe("operador");
      expect((e as SemPermissao).acao).toBe("encerrar_ocorrencia");
      // A mensagem vai para a tela: precisa dizer o que a pessoa não pode fazer.
      expect((e as SemPermissao).message).toContain("encerrar ocorrência");
    }
  });

  it("toda ação declarada é permitida a pelo menos um papel", () => {
    // Ação que ninguém pode executar é ação morta, ou papel esquecido.
    for (const acao of ACOES) {
      const algum = PAPEIS.some((p) => podeExecutar(p, acao));
      expect(algum, `nenhum papel pode ${acao}`).toBe(true);
    }
  });
});
