import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ROTULO_CHAVE_DO_DETALHE, ROTULO_DOCUMENTO, chavesSemRotulo, paresDoDetalhe, valorDoDetalhe,
} from "../src/paginas/trilha-detalhe";

/**
 * A linha do tempo em português, e não em JSON.
 *
 * O ACHADO (revisão de 15/09/2026): o detalhe de cada evento saía como
 * `prazoHoras: 24 · vistoriaId: 11111111-… · documento: termo_de_interdicao`.
 * Este arquivo prova a tradução E varre as rotas que gravam na trilha (a API
 * e o modo de demonstração) para que toda chave nova nasça com rótulo, ou
 * seja escondida de propósito.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(RAIZ, "..", "api", "src");
const LOCAL = join(RAIZ, "src", "dados", "local.ts");

describe("O valor de cada chave, na forma que a pessoa lê", () => {
  it("as listas fechadas passam pelo dicionário compartilhado que a tela já usa", () => {
    expect(valorDoDetalhe("tipo", "deslizamento")).toBe("Deslizamento");
    expect(valorDoDetalhe("tipoAnterior", "outro")).not.toBe("outro");
    expect(valorDoDetalhe("severidade", "critica")).toBe("Crítica");
    expect(valorDoDetalhe("canal", "telefone")).not.toBe("telefone");
    expect(valorDoDetalhe("statusNaCorrecao", "em_campo")).toBe("Em campo");
    expect(valorDoDetalhe("statusDaOcorrencia", "triagem")).toBe("Em triagem");
    expect(valorDoDetalhe("desfecho", "atendida")).not.toBe("atendida");
    expect(valorDoDetalhe("desfecho", "retorno_confirmado")).toBe("O agente confirmou o retorno");
  });

  it("o documento emitido é dito pelo nome do papel, e os três que o servidor emite têm nome", () => {
    expect(valorDoDetalhe("documento", "termo_de_interdicao")).toBe("Termo de interdição");
    const trilha = readFileSync(join(API, "trilha.ts"), "utf8");
    const tipos = /export type DocumentoEmitido = ([^;]+);/.exec(trilha)?.[1] ?? "";
    const emitidos = [...tipos.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(emitidos.length).toBeGreaterThanOrEqual(3);
    for (const documento of emitidos) {
      expect(ROTULO_DOCUMENTO[documento], `documento sem nome na trilha: ${documento}`).toBeTruthy();
    }
  });

  it("número vira frase com unidade, booleano vira Sim ou Não, data vira data", () => {
    expect(valorDoDetalhe("prazoHoras", 24)).toBe("24 horas");
    expect(valorDoDetalhe("gpsPrecisaoMetros", 8)).toBe("8 m");
    expect(valorDoDetalhe("tamanhoBytes", 204800)).toBe("200 KB");
    expect(valorDoDetalhe("interdicaoAtiva", true)).toBe("Sim");
    expect(valorDoDetalhe("estavaVencida", false)).toBe("Não");
    expect(valorDoDetalhe("interditadaEm", "2026-08-19T18:35:00.000Z")).toMatch(/\d{2}\/\d{2}\/2026/);
    expect(valorDoDetalhe("formato", "html")).toBe("HTML");
  });

  it("o ponto da correção sai como coordenada, e a ausência dele é dita", () => {
    expect(valorDoDetalhe("anterior", null)).toBe("sem ponto");
    expect(valorDoDetalhe("nova", { lat: -22.42, lng: -45.448 })).toMatch(/-22\.42/);
  });

  it("lista de nomes vira lista, lista de registros perdidos vira as horas de captura, vazio é dito", () => {
    expect(valorDoDetalhe("providenciasSemResposta", ["Secretaria de Obras", "Bombeiros"]))
      .toBe("Secretaria de Obras, Bombeiros");
    expect(valorDoDetalhe("providenciasSemResposta", [])).toBe("nenhuma");
    expect(valorDoDetalhe("itens", [{ idempotencyKey: "x", papel: "foto", capturadaEm: "2026-09-15T09:42:00.000Z" }]))
      .toMatch(/09:42|06:42|12:42/);
  });

  it("valor vazio e objeto sem leitura não viram linha", () => {
    expect(valorDoDetalhe("instrucoes", null)).toBeNull();
    expect(valorDoDetalhe("instrucoes", "")).toBeNull();
    expect(valorDoDetalhe("qualquer", { a: 1 })).toBeNull();
  });
});

describe("Os pares que a linha do tempo desenha", () => {
  it("o evento de documento emitido: nome do papel e formato, sem o id da vistoria", () => {
    const pares = paresDoDetalhe({ documento: "termo_de_interdicao", vistoriaId: "11111111-1111-4111-8111-0000000000f1", formato: "html" });
    expect(pares).toEqual([
      { rotulo: "Documento", valor: "Termo de interdição" },
      { rotulo: "Formato", valor: "HTML" },
    ]);
    expect(JSON.stringify(pares)).not.toContain("11111111");
  });

  it("o despacho de antes: prazoHoras vira Prazo em horas, e a chave crua não aparece", () => {
    const pares = paresDoDetalhe({ equipe: "Equipe Charlie", prazoHoras: 24, instrucoes: null });
    expect(pares).toEqual([
      { rotulo: "Equipe", valor: "Equipe Charlie" },
      { rotulo: "Prazo", valor: "24 horas" },
    ]);
    expect(JSON.stringify(pares)).not.toContain("prazoHoras");
  });

  it("identificadores, chave de envio e resumo criptográfico ficam de fora", () => {
    const pares = paresDoDetalhe({
      evidenciaId: "x", tamanhoBytes: 2048, sha256: "abc", idempotencyKey: "k",
      equipeDesignadaId: "e1", equipeDoAgenteId: "e2", vinculadaA: "v",
    });
    expect(pares).toEqual([{ rotulo: "Tamanho do arquivo", valor: "2 KB" }]);
  });

  it("quando o evento traz o desfecho já por extenso, ele fala pelo desfecho e não sai dobrado", () => {
    const pares = paresDoDetalhe({ desfecho: "apoio_acionado", desfechoRotulo: "Acionei apoio", temObservacao: true });
    expect(pares.filter((p) => p.rotulo === "Desfecho")).toEqual([{ rotulo: "Desfecho", valor: "Acionei apoio" }]);
    expect(pares).toContainEqual({ rotulo: "Com observação", valor: "Sim" });
  });

  it("chave desconhecida sai como veio, em vez de sumir", () => {
    expect(paresDoDetalhe({ chaveNova: "valor" })).toEqual([{ rotulo: "chaveNova", valor: "valor" }]);
    expect(chavesSemRotulo({ chaveNova: "valor", tipo: "x", vistoriaId: "y" })).toEqual(["chaveNova"]);
  });
});

/* ------------------------------------------------------------------ */
/* Toda chave que as rotas gravam tem rótulo                           */
/* ------------------------------------------------------------------ */

/**
 * As chaves do objeto literal passado a `registrarEvento(..., "tipo", { ... })`
 * em cada arquivo. Lê por contagem de chaves, pulando comentários; o
 * `...(cond ? { a, b } : {})` de dentro conta também, que é o caso da triagem.
 */
function chavesGravadasEm(fonte: string): Array<{ tipo: string; chaves: string[] }> {
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gravacoes: Array<{ tipo: string; chaves: string[] }> = [];
  const chamada = /registrarEvento\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*"([a-z_]+)"\s*,\s*\{/g;
  for (const casou of semComentarios.matchAll(chamada)) {
    const inicio = casou.index! + casou[0].length;
    let nivel = 1;
    let fim = inicio;
    while (fim < semComentarios.length && nivel > 0) {
      const c = semComentarios[fim]!;
      if (c === "{") nivel += 1;
      else if (c === "}") nivel -= 1;
      fim += 1;
    }
    const corpo = semComentarios.slice(inicio, fim - 1);
    const chaves = [...corpo.matchAll(/(?:^|[{,]\s*)([a-zA-Z]+)\s*(?=[:,}])/gm)]
      .map((m) => m[1]!)
      .filter((c) => c !== "map" && c !== "p" && c !== "String" && c !== "Boolean");
    gravacoes.push({ tipo: casou[1]!, chaves: [...new Set(chaves)] });
  }
  return gravacoes;
}

describe("Toda chave que as rotas gravam na trilha tem rótulo, ou é escondida de propósito", () => {
  const arquivos = [
    ...readdirSync(join(API, "rotas")).filter((n) => n.endsWith(".ts")).map((n) => join(API, "rotas", n)),
    LOCAL,
  ];

  it("a varredura enxerga as gravações de verdade", () => {
    const todas = arquivos.flatMap((a) => chavesGravadasEm(readFileSync(a, "utf8")));
    expect(todas.length, "âncora: as rotas ainda chamam registrarEvento com objeto literal").toBeGreaterThan(10);
    expect(todas.some((g) => g.tipo === "despacho" && g.chaves.includes("prazoHoras"))).toBe(true);
    expect(todas.some((g) => g.tipo === "triagem" && g.chaves.includes("tipoAnterior"))).toBe(true);
  });

  it("nenhuma chave gravada sai crua na linha do tempo", () => {
    const cruas: string[] = [];
    for (const arquivo of arquivos) {
      for (const gravacao of chavesGravadasEm(readFileSync(arquivo, "utf8"))) {
        const detalhe = Object.fromEntries(gravacao.chaves.map((c) => [c, "x"]));
        for (const chave of chavesSemRotulo(detalhe)) {
          cruas.push(`${arquivo.split("/").slice(-2).join("/")} evento "${gravacao.tipo}": ${chave}`);
        }
      }
    }
    expect(
      cruas,
      "chave gravada na trilha sem rótulo em ROTULO_CHAVE_DO_DETALHE (ou sem "
      + "esconder de propósito): sairia crua na linha do tempo:\n" + cruas.join("\n"),
    ).toEqual([]);
  });

  it("o dicionário não tem rótulo com travessão nem chave com espaço", () => {
    for (const [chave, rotulo] of Object.entries(ROTULO_CHAVE_DO_DETALHE)) {
      expect(chave).not.toMatch(/\s/);
      expect(rotulo).not.toContain("—");
    }
  });
});

describe("A tela usa a tradução", () => {
  it("Ocorrencia.tsx desenha os pares e não junta mais `chave: valor` à mão", () => {
    const fonte = readFileSync(join(RAIZ, "src", "paginas", "Ocorrencia.tsx"), "utf8");
    expect(fonte).toMatch(/import \{[^}]*paresDoDetalhe[^}]*\} from "\.\/trilha-detalhe"/);
    expect(fonte, "o antigo `${k}: ${String(v)}` voltou").not.toMatch(/\$\{k\}: \$\{String\(v\)\}/);
  });
});
