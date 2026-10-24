import { afterEach, describe, expect, it, vi } from "vitest";
import type { Banco, Consulta } from "../src/banco/tipos.js";
import type { Armazenamento } from "../src/armazenamento/tipos.js";
import type { Trava } from "../src/push/trava.js";
import type { NivelDoRegistro } from "../src/observabilidade/reportador.js";
import { agendarMinimizacao, minimizarPorPrazo } from "../src/privacidade/minimizacao.js";
import { agendarResumo, resumirMunicipios } from "../src/metricas/resumo.js";
import { agendarVarreduraDeOrfaos, varrerOrfaos } from "../src/armazenamento/orfaos.js";

/**
 * FALHA DE ROTINA AGENDADA SAI EM NÍVEL `error` (V2-F01-E14, OPS-41).
 *
 * Antes, `index.ts` passava `app.log.info` como `registrar` da minimização, do
 * resumo e da varredura de órfãos. Uma minimização que "falhou inteira" (a
 * retenção prometida deixou de ser executada) ficava numa linha `info`, igual à
 * de uma rodada boa, e só era vista por quem abria o log de propósito. Agora a
 * rotina pede o nível, e falha é `error`, que é o que um alerta de log acorda.
 *
 * O caso de sucesso fica provado ao lado: rodada boa NÃO sobe para `error`,
 * senão o alerta passa a gritar o tempo todo e a equipe aprende a ignorá-lo.
 */

type Linha = { evento: Record<string, unknown>; mensagem: string; nivel: NivelDoRegistro | undefined };

function coletor() {
  const linhas: Linha[] = [];
  const registrar = (evento: Record<string, unknown>, mensagem: string, nivel?: NivelDoRegistro) => {
    linhas.push({ evento, mensagem, nivel });
  };
  return { linhas, registrar };
}

const travaLivre: Trava = {
  tentar: async () => true,
  soltar: async () => undefined,
  encerrar: async () => undefined,
};

function bancoComSemTenant(
  semTenant: <T>(f: (c: Consulta) => Promise<T>) => Promise<T>,
  comTenant: Banco["comTenant"] = async () => { throw new Error("comTenant não esperado"); },
): Banco {
  return { semTenant, comTenant, encerrar: async () => undefined } as Banco;
}

/** Espera o relógio de verdade disparar; os intervalos do teste são de milissegundos. */
async function esperarAte(condicao: () => boolean, limiteMs = 2000): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error("a condição não ocorreu a tempo");
    await new Promise((r) => setTimeout(r, 5));
  }
}

afterEach(() => { vi.restoreAllMocks(); });

describe("minimização por prazo", () => {
  it("falha inteira do relógio sai em error, com a mensagem do erro", async () => {
    const { linhas, registrar } = coletor();
    const banco = bancoComSemTenant(async () => { throw new Error("conexão recusada"); });
    const agendada = agendarMinimizacao({ banco, trava: travaLivre, registrar }, 5);
    await esperarAte(() => linhas.length > 0);
    await agendada.parar();
    expect(linhas[0]).toMatchObject({
      mensagem: "minimizacao por prazo falhou inteira",
      nivel: "error",
      evento: { erro: "conexão recusada" },
    });
  });

  it("rodada que minimizou algo NÃO sobe para error", async () => {
    const { linhas, registrar } = coletor();
    const banco = bancoComSemTenant(async (f) => f({
      query: async () => ({ rows: [{ municipio: "m", ocorrencia: "o", campos_removidos: ["nome", "telefone"] }] }),
    } as Consulta));
    const resumo = await minimizarPorPrazo({ banco, trava: travaLivre, registrar });
    expect(resumo).toMatchObject({ ocorrencias: 1, campos: 2 });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.nivel === undefined || linhas[0]!.nivel === "info").toBe(true);
  });
});

describe("escrita do resumo dos municípios", () => {
  it("município que não conseguiu escrever sai em error, e os outros seguem", async () => {
    const { linhas, registrar } = coletor();
    const banco = bancoComSemTenant(
      async (f) => f({ query: async () => ({ rows: [{ municipios_a_resumir: "org-a" }, { municipios_a_resumir: "org-b" }] }) } as Consulta),
      async (organizacaoId, f) => {
        if (organizacaoId === "org-a") throw new Error("conexão derrubada");
        return f({ query: async () => ({ rows: [{}] }) } as Consulta);
      },
    );
    const r = await resumirMunicipios({ banco, trava: travaLivre, frescorMinutos: 10, registrar });
    expect(r).toMatchObject({ municipios: 1, falhas: 1 });
    const falha = linhas.find((l) => l.mensagem === "municipio nao conseguiu escrever o proprio resumo");
    expect(falha?.nivel).toBe("error");
    // Só o identificador da organização, nunca o nome do município.
    expect(Object.keys(falha!.evento).sort()).toEqual(["erro", "organizacao"]);
  });

  it("falha inteira da rodada sai em error", async () => {
    const { linhas, registrar } = coletor();
    const banco = bancoComSemTenant(async () => { throw new Error("banco fora"); });
    const agendada = agendarResumo({ banco, trava: travaLivre, frescorMinutos: 10, registrar }, 60_000);
    await esperarAte(() => linhas.length > 0);
    await agendada.parar();
    expect(linhas[0]).toMatchObject({ mensagem: "escrita do resumo dos municipios falhou inteira", nivel: "error" });
  });

  it("rodada sem falha NÃO sobe para error", async () => {
    const { linhas, registrar } = coletor();
    const banco = bancoComSemTenant(
      async (f) => f({ query: async () => ({ rows: [{ municipios_a_resumir: "org-a" }] }) } as Consulta),
      async (_org, f) => f({ query: async () => ({ rows: [{}] }) } as Consulta),
    );
    await resumirMunicipios({ banco, trava: travaLivre, frescorMinutos: 10, registrar });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.nivel === undefined || linhas[0]!.nivel === "info").toBe(true);
  });
});

describe("varredura de objeto órfão", () => {
  const bancoSemUso = bancoComSemTenant(async () => { throw new Error("não deveria consultar"); });

  function armazenamentoCom(listar: Armazenamento["listar"]): Armazenamento {
    return { listar } as Armazenamento;
  }

  it("rodada com listagem falha termina em error: a lista tem buraco", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = armazenamentoCom(async () => ({ objetos: [], continuacao: null, falha: "bucket indisponível" }));
    const r = await varrerOrfaos({ banco: bancoSemUso, armazenamento, municipios: [], registrar });
    expect(r.falhas).toHaveLength(1);
    const final = linhas.find((l) => l.mensagem === "varredura de objeto orfao concluida");
    expect(final?.nivel).toBe("error");
    expect(final?.evento["falhas"]).toBe(1);
  });

  it("rodada limpa termina em info", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = armazenamentoCom(async () => ({ objetos: [], continuacao: null }));
    await varrerOrfaos({ banco: bancoSemUso, armazenamento, municipios: [], registrar });
    const final = linhas.find((l) => l.mensagem === "varredura de objeto orfao concluida");
    expect(final?.nivel).toBe("info");
  });

  it("falha inteira do relógio sai em error", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = armazenamentoCom(async () => { throw new Error("rede caiu"); });
    const agendada = agendarVarreduraDeOrfaos(
      { banco: bancoSemUso, armazenamento, trava: travaLivre, registrar }, 5,
    );
    await esperarAte(() => linhas.some((l) => l.mensagem === "varredura de objeto orfao falhou inteira"));
    await agendada.parar();
    const falha = linhas.find((l) => l.mensagem === "varredura de objeto orfao falhou inteira");
    expect(falha?.nivel).toBe("error");
    expect(falha?.evento["erro"]).toBe("rede caiu");
  });
});
