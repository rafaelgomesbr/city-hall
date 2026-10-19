import { describe, expect, it } from "vitest";
import {
  CODIGOS_DA_ENTRADA, CODIGOS_DE_ERRO_DE_ACESSO, LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO, acaoParaOCodigo,
  ehCodigoDaEntrada, ehCodigoDeErroDeAcesso,
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
    expect(LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO).toHaveLength(10);
  });

  it("as quatro recusas que antes saíam fora da lista são 403 sem ação para o cliente: erro comum, nunca sessão morta", () => {
    for (const c of [
      "posto_insuficiente", "posto_insuficiente_para_dado_pessoal", "email_so_por_administrador", "assinatura",
    ] as const) {
      expect(CODIGOS_DE_ERRO_DE_ACESSO[c], c).toMatchObject({ status: 403, acao: "nenhuma" });
      expect(acaoParaOCodigo(c), c).toBe("nenhuma");
    }
  });

  it("só cinco dos dez têm ação para o cliente: os do acesso à conta e à sessão, que já existiam", () => {
    const comAcao = LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO.filter((c) => CODIGOS_DE_ERRO_DE_ACESSO[c].acao !== "nenhuma");
    expect(comAcao.sort()).toEqual([
      "acesso_suspenso", "conta_desativada", "nao_autenticado", "sessao_encerrada", "troca_de_senha_obrigatoria",
    ]);
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
  it("reconhece os dez códigos", () => {
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

describe("Os códigos da entrada ficam FORA do catálogo de acesso", () => {
  it("são três, com o status que a entrada responde", () => {
    expect(CODIGOS_DA_ENTRADA.credenciais.status).toBe(401);
    expect(CODIGOS_DA_ENTRADA.senha_provisoria_vencida.status).toBe(401);
    expect(CODIGOS_DA_ENTRADA.bloqueado.status).toBe(429);
    for (const c of Object.keys(CODIGOS_DA_ENTRADA)) expect(ehCodigoDaEntrada(c), c).toBe(true);
  });

  it("`credenciais` não é código de acesso: senha atual errada na troca de senha não derruba a tela", () => {
    for (const c of Object.keys(CODIGOS_DA_ENTRADA)) {
      expect(ehCodigoDeErroDeAcesso(c), c).toBe(false);
      expect(acaoParaOCodigo(c), c).toBeNull();
    }
  });

  it("nenhum código está nas duas listas, e o que não é texto ou é chave herdada de Object não conta", () => {
    for (const c of LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO) expect(ehCodigoDaEntrada(c), c).toBe(false);
    for (const fora of [undefined, null, 401, {}, "constructor", "toString", "__proto__", "sessao"]) {
      expect(ehCodigoDaEntrada(fora), String(fora)).toBe(false);
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
