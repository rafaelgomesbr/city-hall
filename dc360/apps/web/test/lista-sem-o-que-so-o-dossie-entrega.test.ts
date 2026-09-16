import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A lista de ocorrências não desenha o que só o dossiê entrega.
 *
 * Desde 15/09/2026 `GET /ocorrencias` deixou de devolver contato do
 * solicitante, relato e descrição de vulnerabilidade social, para todo papel
 * (`apps/api/src/privacidade/lista.ts`). O painel precisa acompanhar em três
 * lugares, e este portão cobra os três, pela fonte, porque o painel não roda
 * em navegador de teste:
 *
 * 1. o TIPO da linha de lista é estreito (`LinhaDaListaDeOcorrencias`), para
 *    uma tela que tente desenhar o contato a partir da lista não compilar;
 * 2. a TELA da lista e o painel não referenciam os três campos;
 * 3. o modo de DEMONSTRAÇÃO retira os três da resposta, como a API faz, senão
 *    a reunião com a prefeitura mostra um campo que o produto real não tem.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const fonte = (relativo: string) => readFileSync(join(RAIZ, relativo), "utf8");

const SO_DO_DOSSIE = ["solicitante_contato", "descricao", "vulnerabilidade_descricao"] as const;

describe("O tipo da linha de lista", () => {
  it("omite os três campos, e a página de ocorrências é feita dele", () => {
    const tipos = fonte("dados/tipos.ts");
    const declaracao = /export type LinhaDaListaDeOcorrencias = Omit<\s*LinhaOcorrencia,\s*([^>]+)>/.exec(tipos);
    expect(declaracao, "LinhaDaListaDeOcorrencias sumiu de dados/tipos.ts").not.toBeNull();
    for (const campo of SO_DO_DOSSIE) {
      expect(declaracao![1], `${campo} voltou a fazer parte da linha de lista`).toContain(`"${campo}"`);
    }
    expect(tipos).toMatch(/export type PaginaDeOcorrencias = \{\s*itens: LinhaDaListaDeOcorrencias\[\];/);
  });
});

describe("As telas que desenham a lista", () => {
  it.each(["paginas/Ocorrencias.tsx", "paginas/Painel.tsx"])("%s não desenha os três campos", (arquivo) => {
    const codigo = fonte(arquivo)
      // Comentário não conta: é onde se explica por que o campo não está.
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const campo of ["solicitante_contato", "vulnerabilidade_descricao"]) {
      expect(codigo, `${arquivo} voltou a desenhar ${campo} a partir da lista`).not.toContain(campo);
    }
    // `descricao` sozinho é nome comum (providência tem a sua). O que não pode
    // voltar é o relato da OCORRÊNCIA lido de uma linha de lista.
    expect(codigo).not.toMatch(/\bo\.descricao\b/);
  });
});

describe("O modo de demonstração", () => {
  it("retira os três campos da página, como a API faz", () => {
    const local = fonte("dados/local.ts");
    const inicio = local.indexOf("export async function listarPaginaDeOcorrencias(");
    expect(inicio).toBeGreaterThan(-1);
    const corpo = local.slice(inicio, local.indexOf("export async function", inicio + 1));
    for (const campo of SO_DO_DOSSIE) {
      expect(
        corpo,
        `listarPaginaDeOcorrencias do modo local voltou a devolver ${campo}: a demonstração passaria a mostrar o que o produto real não entrega`,
      ).toMatch(new RegExp(`${campo}:\\s*_\\w+`));
    }
  });
});
