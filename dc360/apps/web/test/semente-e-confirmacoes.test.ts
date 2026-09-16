import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import * as local from "../src/dados/local";
import type { Sessao } from "../src/dados/tipos";

/**
 * Dois achados pequenos do revisor, com o mesmo remédio: a tela dizer a
 * verdade.
 *
 * 1. A SEMENTE SE CONTRADIZIA. A ocorrência 000473 nascia há 28 horas e o
 *    termo de interdição dela era emitido há 27 dias: a linha do tempo abria
 *    com "Documento oficial emitido" antes de "Chamado registrado", numa
 *    demonstração cujo argumento de venda é a trilha auditável. Ela passa a
 *    ser aberta há 30 dias, com a vistoria e o termo depois do registro.
 *
 * 2. CADASTRAR NÃO CONFIRMAVA NADA. Usuário, equipe e órgão eram gravados, o
 *    formulário limpava e a linha aparecia na tabela, sem uma frase dizendo
 *    que deu certo. Quem usa leitor de tela não vê a linha nova, e quem
 *    enxerga fica na dúvida se o clique pegou. Um `Toast` com `role=status`
 *    resolve os dois.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (relativo: string) => readFileSync(join(SRC, relativo), "utf8");

const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const OCORRENCIA_473 = "11111111-1111-4111-8111-0000000000c3";

describe("A linha do tempo da semente conta a história na ordem", () => {
  let coordenadora: Sessao;

  beforeAll(async () => {
    const c = (await local.contasDisponiveis())
      .find((x) => x.papel === "coordenador" && x.organizacao_id === ORG_SERRA_ALTA);
    if (!c) throw new Error("a semente não tem coordenador em Serra Alta");
    coordenadora = {
      organizacaoId: c.organizacao_id, organizacaoNome: c.organizacao_nome,
      municipio: c.municipio, uf: c.uf,
      usuarioId: c.usuario_id, usuarioNome: c.usuario_nome, papel: c.papel,
    };
  }, 120_000);

  it("000473: registro, triagem, despacho, vistoria e termo, nesta ordem", async () => {
    const trilha = await local.trilhaDaOcorrencia(coordenadora, OCORRENCIA_473);
    const tipos = trilha.map((e) => e.tipo);
    expect(tipos[0], "o primeiro evento tem de ser o registro do chamado").toBe("registro");
    expect(tipos.indexOf("vistoria")).toBeGreaterThan(tipos.indexOf("despacho"));
    expect(tipos.indexOf("documento_emitido")).toBeGreaterThan(tipos.indexOf("vistoria"));
    // A ordem é a do relógio, não da inserção: as datas precisam concordar.
    const instantes = trilha.map((e) => new Date(e.ocorrido_em).getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
  });

  it("000473 foi aberta há um mês, e o imóvel segue interditado há 27 dias", async () => {
    const o = await local.buscarOcorrencia(coordenadora, OCORRENCIA_473);
    expect(o).not.toBeNull();
    const dias = (Date.now() - new Date(o!.criado_em).getTime()) / 86_400_000;
    expect(dias).toBeGreaterThanOrEqual(29);
    expect(dias).toBeLessThanOrEqual(31);
    const interditadaHa = (Date.now() - new Date(o!.interditada_em!).getTime()) / 86_400_000;
    expect(interditadaHa).toBeGreaterThanOrEqual(26.5);
    expect(interditadaHa).toBeLessThanOrEqual(27.5);
    // O termo veio DEPOIS do chamado, o que é a única ordem possível.
    expect(new Date(o!.interditada_em!).getTime()).toBeGreaterThan(new Date(o!.criado_em).getTime());
  });
});

describe("Cadastrar confirma", () => {
  it.each([
    ["paginas/Usuarios.tsx", /Usuário cadastrado|Cadastro corrigido/],
    ["paginas/Equipes.tsx", /Equipe criada|Equipe corrigida/],
    ["paginas/Orgaos.tsx", /Órgão cadastrado|Órgão corrigido/],
  ])("%s anuncia o que gravou com um Toast", (arquivo, frase) => {
    const codigo = fonte(arquivo);
    expect(codigo, `${arquivo} não usa Toast`).toContain("<Toast");
    expect(codigo).toMatch(frase);
    // O Toast tem `role="status"` e `aria-live="polite"` por construção
    // (ver `toast.test.ts`); aqui o que importa é a tela usá-lo, e usá-lo
    // DEPOIS de gravar, não antes.
    expect(codigo).toMatch(/await (criarUsuario|criarEquipe|criarOrgao)\([\s\S]{0,400}?set\w*\(/);
  });
});
