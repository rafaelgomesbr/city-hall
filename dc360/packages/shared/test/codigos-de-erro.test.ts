import { describe, expect, it } from "vitest";
import {
  CODIGOS_DE_ERRO_DE_ACESSO, LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO, acaoParaOCodigo,
  ehCodigoDeErroDeAcesso,
} from "../src/index.js";

/**
 * O catálogo dos códigos de erro de acesso (V2-F00-E05).
 *
 * O que importa aqui é o CONTRATO que o cliente lê: três códigos que antes
 * eram um só (`sessao`) e que pedem ações opostas. Quem comprova que o
 * servidor emite exatamente isto é `apps/api/test/codigos-de-erro.test.ts`.
 */

describe("Catálogo dos códigos de erro de acesso", () => {
  it("separa token vencido, sessão encerrada e conta desativada, cada um com a sua ação", () => {
    expect(CODIGOS_DE_ERRO_DE_ACESSO.nao_autenticado).toMatchObject({
      status: 401, acao: "renovar_e_repetir",
    });
    expect(CODIGOS_DE_ERRO_DE_ACESSO.sessao_encerrada).toMatchObject({
      status: 401, acao: "entrar_de_novo",
    });
    expect(CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada).toMatchObject({
      status: 403, acao: "parar_e_avisar",
    });
  });

  it("conta desativada é o único dos três que NÃO é 401: entrar de novo não resolve", () => {
    const tres = ["nao_autenticado", "sessao_encerrada", "conta_desativada"] as const;
    expect(tres.filter((c) => CODIGOS_DE_ERRO_DE_ACESSO[c].status === 403)).toEqual(["conta_desativada"]);
  });

  it("mantém os três códigos que já existiam, sem renomear nem mudar de status", () => {
    expect(CODIGOS_DE_ERRO_DE_ACESSO.acesso_suspenso.status).toBe(403);
    expect(CODIGOS_DE_ERRO_DE_ACESSO.troca_de_senha_obrigatoria.status).toBe(403);
    expect(CODIGOS_DE_ERRO_DE_ACESSO.sem_permissao.status).toBe(403);
  });

  it("a lista é exatamente o catálogo, sem sobra nem falta", () => {
    expect([...LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO].sort()).toEqual(
      Object.keys(CODIGOS_DE_ERRO_DE_ACESSO).sort(),
    );
    expect(LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO).toHaveLength(6);
  });

  it("toda mensagem é uma frase em português para quem usa o sistema, sem jargão de código", () => {
    for (const codigo of LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO) {
      const { mensagem } = CODIGOS_DE_ERRO_DE_ACESSO[codigo];
      expect(mensagem.length, codigo).toBeGreaterThan(20);
      expect(mensagem.endsWith("."), `${codigo}: frase sem ponto final`).toBe(true);
      expect(mensagem, `${codigo}: o código técnico não é para a pessoa ler`).not.toMatch(/_/);
    }
  });

  it("a mensagem de conta desativada manda procurar a coordenação e diz que o que foi registrado fica", () => {
    const { mensagem } = CODIGOS_DE_ERRO_DE_ACESSO.conta_desativada;
    expect(mensagem).toMatch(/coordena[çc][ãa]o/i);
    expect(mensagem).toMatch(/continua guardado/i);
  });
});

describe("ehCodigoDeErroDeAcesso", () => {
  it("reconhece os seis códigos", () => {
    for (const codigo of LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO) {
      expect(ehCodigoDeErroDeAcesso(codigo), codigo).toBe(true);
    }
  });

  it("recusa o nome antigo `sessao` e qualquer código fora da lista: não vira sessão morta", () => {
    for (const fora of ["sessao", "inativo", "credenciais", "erro_interno", "", "NAO_AUTENTICADO"]) {
      expect(ehCodigoDeErroDeAcesso(fora), fora).toBe(false);
    }
  });

  it("recusa o que não é texto e as chaves herdadas de Object", () => {
    for (const fora of [undefined, null, 401, {}, ["nao_autenticado"], "constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(ehCodigoDeErroDeAcesso(fora), String(fora)).toBe(false);
    }
  });
});

describe("acaoParaOCodigo", () => {
  it("devolve a ação do catálogo e null para o que não é dele", () => {
    expect(acaoParaOCodigo("conta_desativada")).toBe("parar_e_avisar");
    expect(acaoParaOCodigo("nao_autenticado")).toBe("renovar_e_repetir");
    expect(acaoParaOCodigo("sessao")).toBeNull();
    expect(acaoParaOCodigo(undefined)).toBeNull();
  });
});
