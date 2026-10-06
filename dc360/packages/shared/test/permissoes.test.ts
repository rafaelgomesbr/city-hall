import { describe, expect, it } from "vitest";
import {
  ACOES, PAPEIS, POSTO, PostoInsuficiente, SemPermissao, acoesDoPapel,
  exigirPermissao, exigirPostoParaGerir, papeisQuePodeConceder, podeExecutar,
  podeGerirPapel,
} from "../src/index.js";

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

  it("consultar ofício é de operador, coordenador e administrador, e NUNCA do agente de campo (V2-F00-E08)", () => {
    // O agente recebe 403 em `GET /oficios`: a ficha traz o e-mail do órgão, as
    // observações da coordenação e o IP de quem abriu o link.
    expect(podeExecutar("operador", "consultar_oficio")).toBe(true);
    expect(podeExecutar("coordenador", "consultar_oficio")).toBe(true);
    expect(podeExecutar("administrador", "consultar_oficio")).toBe(true);
    expect(podeExecutar("agente_campo", "consultar_oficio")).toBe(false);
    expect(acoesDoPapel("agente_campo")).not.toContain("consultar_oficio");
  });

  it("consultar ofício é leitura: o operador a tem e continua sem emitir nem enviar ofício", () => {
    expect(podeExecutar("operador", "emitir_documento")).toBe(false);
    expect(podeExecutar("operador", "encaminhar_providencia")).toBe(false);
  });

  it("a recusa de consultar ofício diz o que a pessoa não pode fazer", () => {
    try {
      exigirPermissao("agente_campo", "consultar_oficio");
      throw new Error("devia ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(SemPermissao);
      expect((e as SemPermissao).acao).toBe("consultar_oficio");
      expect((e as SemPermissao).message).toContain("consultar os ofícios de encaminhamento");
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

describe("Posto: quem manda em quem", () => {
  it("o administrador é o teto do município", () => {
    for (const papel of PAPEIS) {
      expect(POSTO["administrador"], papel).toBeGreaterThanOrEqual(POSTO[papel]);
    }
    // E é teto sozinho: se empatasse com o coordenador, a regra de posto não
    // separaria nada e voltaríamos aos dois nomes para a mesma coisa.
    expect(POSTO["administrador"]).toBeGreaterThan(POSTO["coordenador"]);
  });

  it("o coordenador administra só quem está ABAIXO dele: nem administrador, nem outro coordenador", () => {
    expect(podeGerirPapel("coordenador", "administrador")).toBe(false);
    /*
      A ADR 0006 diz "administra equipes e usuários abaixo dele", e o
      administrador "é o único que administra outro administrador". Com `>=`
      o coordenador criava, rebaixava e desativava outro coordenador, e um
      desativava o outro em cadeia: dois nomes para o mesmo poder de novo, um
      degrau abaixo. Só o teto do município administra o próprio posto.
    */
    expect(podeGerirPapel("coordenador", "coordenador")).toBe(false);
    expect(podeGerirPapel("coordenador", "operador")).toBe(true);
    expect(podeGerirPapel("coordenador", "agente_campo")).toBe(true);
    // E o posto 1 não administra ninguém, nem a si mesmo.
    expect(podeGerirPapel("operador", "operador")).toBe(false);
    expect(podeGerirPapel("agente_campo", "agente_campo")).toBe(false);
  });

  it("o administrador administra todo mundo, inclusive outro administrador", () => {
    for (const papel of PAPEIS) {
      expect(podeGerirPapel("administrador", papel), papel).toBe(true);
    }
  });

  it("ninguém concede papel de posto acima do seu", () => {
    // É esta a regra que impede o coordenador de se promover: para virar
    // administrador ele precisaria conceder um papel que não alcança.
    expect(papeisQuePodeConceder("coordenador")).not.toContain("administrador");
    expect(papeisQuePodeConceder("administrador")).toContain("administrador");
    expect(papeisQuePodeConceder("operador")).not.toContain("coordenador");
  });

  it("exigirPostoParaGerir lança com mensagem que diz o que fazer", () => {
    expect(() => exigirPostoParaGerir("administrador", "coordenador")).not.toThrow();
    try {
      exigirPostoParaGerir("coordenador", "administrador");
      throw new Error("devia ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(PostoInsuficiente);
      expect((erro as Error).message).toMatch(/administra o município/i);
    }
  });

  it("o administrador tem ação que o coordenador não tem", () => {
    /*
      O defeito que este caso existe para impedir: antes, as duas listas de
      permissão eram idênticas item por item, e "administrador" era um papel
      decorativo. Se alguém empatar as duas de novo, aqui reprova.
    */
    const doAdmin = new Set(acoesDoPapel("administrador"));
    const doCoord = new Set(acoesDoPapel("coordenador"));
    const exclusivas = [...doAdmin].filter((a) => !doCoord.has(a));
    expect(exclusivas.length, "administrador voltou a ser cópia do coordenador")
      .toBeGreaterThan(0);
    // E o contrário não pode existir: o teto não pode ter menos que o de baixo.
    expect([...doCoord].filter((a) => !doAdmin.has(a))).toEqual([]);
  });

  it("todo papel tem posto declarado", () => {
    // Papel novo sem posto entraria como undefined e as comparações virariam
    // false silenciosamente, liberando ou barrando por acidente.
    for (const papel of PAPEIS) {
      expect(typeof POSTO[papel], papel).toBe("number");
    }
  });
});
