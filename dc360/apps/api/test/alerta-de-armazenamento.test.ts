import { describe, expect, it } from "vitest";
import type { Armazenamento, PaginaDeObjetos } from "../src/armazenamento/tipos.js";
import type { Trava } from "../src/push/trava.js";
import type { NivelDoRegistro } from "../src/observabilidade/reportador.js";
import {
  CHAVE_DO_ALERTA_DE_COTA, LIMIAR_DO_ALERTA_DE_COTA, agendarAlertaDeCota, conferirCotaDeArmazenamento,
} from "../src/armazenamento/alerta-de-cota.js";

/**
 * O ALERTA DE 80% DA COTA DO BUCKET (V2-F01-E14, OPS-45).
 *
 * A medição soma o tamanho de tudo o que existe no balde e compara com
 * `S3_COTA_BYTES`. "Acima de 80%" é estritamente acima: no 80% exato ainda é
 * `info`. A linha de alerta é `error`, e só leva contagens: chave de objeto
 * carrega o identificador do município e não pode ir para o log.
 */

type Linha = { evento: Record<string, unknown>; mensagem: string; nivel: NivelDoRegistro | undefined };

function coletor() {
  const linhas: Linha[] = [];
  return {
    linhas,
    registrar: (evento: Record<string, unknown>, mensagem: string, nivel?: NivelDoRegistro) => {
      linhas.push({ evento, mensagem, nivel });
    },
  };
}

/** Um balde em páginas: cada item é o tamanho de um objeto. */
function baldeEmPaginas(paginas: number[][]): Armazenamento {
  return {
    listar: async (_prefixo: string, continuacao?: string): Promise<PaginaDeObjetos> => {
      const i = continuacao ? Number(continuacao) : 0;
      return {
        objetos: (paginas[i] ?? []).map((tamanhoBytes, j) => ({
          chave: `tenant/00000000-0000-4000-8000-00000000000${i}/${j}.jpg`,
          tamanhoBytes,
          modificadoEm: null,
        })),
        continuacao: i + 1 < paginas.length ? String(i + 1) : null,
      };
    },
  } as Armazenamento;
}

const COTA = 1_000;

describe("conferirCotaDeArmazenamento", () => {
  it("abaixo de 80%: info, com a conta certa", async () => {
    const { linhas, registrar } = coletor();
    const r = await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[300, 200]]), cotaBytes: COTA, registrar,
    });
    expect(r).toMatchObject({ objetos: 2, bytes: 500, fracao: 0.5, situacao: "dentro_da_cota" });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.nivel).toBe("info");
    expect(linhas[0]!.evento).toMatchObject({ bytes: 500, cotaBytes: COTA, percentual: 50 });
  });

  it("no 80% exato ainda é info, e um byte acima já é error", async () => {
    const exato = coletor();
    await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[800]]), cotaBytes: COTA, registrar: exato.registrar,
    });
    expect(exato.linhas[0]!.nivel).toBe("info");

    const acima = coletor();
    const r = await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[801]]), cotaBytes: COTA, registrar: acima.registrar,
    });
    expect(r.situacao).toBe("acima_do_limiar");
    expect(acima.linhas[0]).toMatchObject({
      nivel: "error", mensagem: "armazenamento acima do limiar de alerta da cota do bucket",
    });
    expect(LIMIAR_DO_ALERTA_DE_COTA).toBe(0.8);
  });

  it("soma todas as páginas da listagem, não só a primeira", async () => {
    const { linhas, registrar } = coletor();
    const r = await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[300], [300], [250]]), cotaBytes: COTA, registrar,
    });
    expect(r.bytes).toBe(850);
    expect(r.situacao).toBe("acima_do_limiar");
    expect(linhas[0]!.nivel).toBe("error");
  });

  it("acima da cota inteira também alerta", async () => {
    const { linhas, registrar } = coletor();
    await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[1500]]), cotaBytes: COTA, registrar,
    });
    expect(linhas[0]).toMatchObject({ nivel: "error" });
    expect(linhas[0]!.evento["percentual"]).toBe(150);
  });

  it("negativo: listagem que falha NÃO vira número, e sai em error", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = {
      listar: async (): Promise<PaginaDeObjetos> => ({ objetos: [{ chave: "a", tamanhoBytes: 10, modificadoEm: null }], continuacao: null, falha: "403 do provedor" }),
    } as Armazenamento;
    const r = await conferirCotaDeArmazenamento({ armazenamento, cotaBytes: COTA, registrar });
    expect(r.situacao).toBe("medicao_falhou");
    expect(r.fracao).toBeNull();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ nivel: "error" });
    expect(JSON.stringify(linhas[0])).not.toContain("403 do provedor");
  });

  it("negativo: continuação que nunca termina para, e sai em error", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = {
      listar: async (): Promise<PaginaDeObjetos> => ({ objetos: [], continuacao: "sempre-a-mesma" }),
    } as Armazenamento;
    const r = await conferirCotaDeArmazenamento({ armazenamento, cotaBytes: COTA, registrar });
    expect(r.situacao).toBe("medicao_falhou");
    expect(linhas[0]!.nivel).toBe("error");
  });

  it("o log leva só contagens: nenhuma chave de objeto, que carrega o identificador do município", async () => {
    const { linhas, registrar } = coletor();
    await conferirCotaDeArmazenamento({
      armazenamento: baldeEmPaginas([[900]]), cotaBytes: COTA, registrar,
    });
    const texto = JSON.stringify(linhas);
    expect(texto).not.toContain("tenant/");
    expect(texto).not.toContain("00000000-0000-4000");
    expect(Object.keys(linhas[0]!.evento).sort()).toEqual(["bytes", "cotaBytes", "objetos", "percentual"]);
  });

  it("outra máquina com a trava: desiste da rodada sem listar o balde", async () => {
    const { linhas, registrar } = coletor();
    let listou = false;
    const armazenamento = { listar: async () => { listou = true; return { objetos: [], continuacao: null }; } } as unknown as Armazenamento;
    const trava: Trava = { tentar: async () => false, soltar: async () => undefined, encerrar: async () => undefined };
    const r = await conferirCotaDeArmazenamento({ armazenamento, cotaBytes: COTA, trava, registrar });
    expect(r).toMatchObject({ travado: true, situacao: "travado" });
    expect(listou).toBe(false);
    expect(linhas).toHaveLength(0);
  });

  it("solta a trava mesmo quando a listagem lança", async () => {
    let soltou = 0;
    const trava: Trava = { tentar: async () => true, soltar: async () => { soltou += 1; }, encerrar: async () => undefined };
    const armazenamento = { listar: async () => { throw new Error("rede"); } } as unknown as Armazenamento;
    await expect(conferirCotaDeArmazenamento({ armazenamento, cotaBytes: COTA, trava })).rejects.toThrow("rede");
    expect(soltou).toBe(1);
  });
});

describe("agendarAlertaDeCota", () => {
  it("mede na partida, sem esperar o primeiro tique, e uma exceção vira error", async () => {
    const { linhas, registrar } = coletor();
    const armazenamento = { listar: async () => { throw new Error("rede caiu"); } } as unknown as Armazenamento;
    const agendada = agendarAlertaDeCota({ armazenamento, cotaBytes: COTA, registrar }, 60_000);
    const inicio = Date.now();
    while (linhas.length === 0 && Date.now() - inicio < 2000) await new Promise((r) => setTimeout(r, 5));
    await agendada.parar();
    expect(linhas[0]).toMatchObject({ mensagem: "a medicao de armazenamento falhou inteira", nivel: "error" });
  });

  it("a trava tem número próprio, distinto das outras rotinas", () => {
    const outras = [5410360016, 5410360021, 5410360023, 5410360035, 5410360038];
    expect(outras).not.toContain(CHAVE_DO_ALERTA_DE_COTA);
  });
});
