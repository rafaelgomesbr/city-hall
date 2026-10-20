import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A ressalva da saída a campo, presa por teste (V2-F00-E24, correção 3).
 *
 * A decisão: o aplicativo do agente ainda NÃO declara a saída a campo
 * (V2-F14-E01). Enquanto isso, nenhum texto que o município lê pode afirmar
 * que alguém "acompanha quem está em campo", nem descrever a saída declarada
 * pelo agente, sem dizer que o recurso está em construção. É a promessa de
 * segurança física que a etapa existe para retirar.
 *
 * Por que está aqui. A correção 2 da E24 criou um guarda com a mesma regra,
 * mas ele vivia só na pasta da evidência e nenhuma suíte o rodava. A correção 4
 * da E22 reescreveu a tabela de papéis, soltou a ressalva de uma linha, e
 * ninguém viu até a validação. Regra que só roda quando alguém lembra não
 * existe: aqui ela roda no `npm test`.
 *
 * A unidade conferida é a linha nos HTML e o parágrafo nos Markdown, com uma
 * exceção que fecha um buraco do guarda antigo: em tabela Markdown a unidade é
 * a LINHA da tabela. Como a tabela inteira é um parágrafo só, uma ressalva em
 * qualquer célula dela absolvia todas as outras linhas.
 *
 * Exceção deliberada: a tabela de permissões do README (`### Quem pode o quê`)
 * é GERADA do catálogo `acoesDoPapel`, com teste que reprova edição manual
 * (`permissoes-no-readme.test.ts`), por isso a regra do README só cobre a frase
 * em negrito do texto corrido. Já a tabela de papéis é escrita à mão, e a
 * ressalva cabe nela: "sim (em construção)".
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(AQUI, "..", "..", "..", "..");

const RESSALVA = /em constru[cç][aã]o/i;

export interface Regra {
  arquivo: string;
  unidade: "linha" | "paragrafo";
  padrao: RegExp;
}

export const REGRAS: readonly Regra[] = [
  { arquivo: "docs/apresentacao-produto-alyson.html", unidade: "linha", padrao: /acompanha(r)? quem est[aá] em campo/i },
  { arquivo: "dc360/docs/apresentacao/2026-09-15-para-o-alyson.html", unidade: "linha", padrao: /acompanha(r)? quem est[aá] em campo|retorno n[aã]o confirmado/i },
  { arquivo: "dc360/docs/PRIVACIDADE.md", unidade: "paragrafo", padrao: /sa[ií]da a campo declarada pelo agente/i },
  { arquivo: "dc360/docs/PAPEIS_E_RESPONSABILIDADES.md", unidade: "paragrafo", padrao: /acompanhar quem est[aá] em campo|acompanha quem est[aá] em campo/i },
  { arquivo: "dc360/README.md", unidade: "paragrafo", padrao: /\*\*acompanha quem est[aá] em campo\*\*/i },
];

/** Divide o texto em unidades; parágrafo que é tabela Markdown vira uma unidade por linha. */
function unidadesDe(texto: string, unidade: Regra["unidade"]): string[] {
  const linhas = texto.split(/\r?\n/);
  if (unidade === "linha") return linhas;
  const paragrafos = texto.split(/\r?\n\s*\r?\n/);
  return paragrafos.flatMap((p) => (p.trimStart().startsWith("|") ? p.split(/\r?\n/) : [p]));
}

export function conferir(texto: string, regra: Regra): { conferidas: number; semRessalva: string[] } {
  const ocorrencias = unidadesDe(texto, regra.unidade).filter((u) => regra.padrao.test(u));
  return {
    conferidas: ocorrencias.length,
    semRessalva: ocorrencias.filter((u) => !RESSALVA.test(u)).map((u) => u.trim().slice(0, 110)),
  };
}

const lerDoRepo = (arquivo: string) => readFileSync(join(RAIZ_REPO, arquivo), "utf8");

/** Quantas ocorrências cada documento tem hoje: padrão que some do texto não pode virar aprovação em silêncio. */
const OCORRENCIAS_ESPERADAS: Record<string, number> = {
  "docs/apresentacao-produto-alyson.html": 3,
  "dc360/docs/apresentacao/2026-09-15-para-o-alyson.html": 2,
  "dc360/docs/PRIVACIDADE.md": 1,
  "dc360/docs/PAPEIS_E_RESPONSABILIDADES.md": 4,
  "dc360/README.md": 1,
};

describe("Saída a campo: nenhum documento promete o recurso sem a ressalva 'em construção'", () => {
  for (const regra of REGRAS) {
    it(`${regra.arquivo}: toda ocorrência traz a ressalva`, () => {
      const r = conferir(lerDoRepo(regra.arquivo), regra);
      expect(r.semRessalva).toEqual([]);
      expect(r.conferidas).toBe(OCORRENCIAS_ESPERADAS[regra.arquivo]);
    });
  }

  it("morde: tirar a ressalva de qualquer ocorrência de qualquer documento reprova", () => {
    for (const regra of REGRAS) {
      const texto = lerDoRepo(regra.arquivo);
      const unidades = unidadesDe(texto, regra.unidade);
      const alvos = unidades.filter((u) => regra.padrao.test(u));
      expect(alvos.length).toBeGreaterThan(0);
      for (const alvo of alvos) {
        const sem = alvo.replace(/\s*\(?em constru[cç][aã]o[^)\n]*\)?/gi, "").replace(/em constru[cç][aã]o/gi, "");
        expect(RESSALVA.test(sem)).toBe(false);
        const r = conferir(texto.replace(alvo, sem), regra);
        expect(r.semRessalva.length, `${regra.arquivo}: sem a ressalva em "${alvo.trim().slice(0, 60)}"`).toBeGreaterThan(0);
      }
    }
  });

  it("morde na regressão real da E22: a linha da tabela de papéis sem a ressalva é acusada, com ela passa", () => {
    const regra = REGRAS.find((r) => r.arquivo.endsWith("PAPEIS_E_RESPONSABILIDADES.md"))!;
    const texto = lerDoRepo(regra.arquivo);
    const certa = "| Acompanhar quem está em campo agora | sim (em construção) | não | sim (em construção) | sim (em construção) |";
    const antiga = "| Acompanhar quem está em campo agora | sim | não | sim | sim |";
    expect(texto).toContain(certa);
    const reprovada = conferir(texto.replace(certa, antiga), regra);
    expect(reprovada.semRessalva.join("\n")).toContain("Acompanhar quem está em campo agora");
    expect(conferir(texto, regra).semRessalva).toEqual([]);
  });

  it("a ressalva de uma linha da tabela não absolve as outras (unidade é a linha da tabela)", () => {
    const regra = REGRAS.find((r) => r.arquivo.endsWith("PAPEIS_E_RESPONSABILIDADES.md"))!;
    const tabela = [
      "| Ação | Operador |",
      "| --- | :---: |",
      "| Acompanhar quem está em campo agora | sim |",
      "| Outra ação qualquer | sim (em construção) |",
    ].join("\n");
    const r = conferir(tabela, regra);
    expect(r.conferidas).toBe(1);
    expect(r.semRessalva).toHaveLength(1);
  });
});
