import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { blocoDaFuncao, lerFonte, normalizarFimDeLinha } from "./ler-fonte";

/**
 * O leitor de fonte dos testes do painel (V2-F00-E21).
 *
 * Duas promessas, e a segunda é a que importa: o mesmo arquivo em CRLF e em LF
 * dá o mesmo resultado, E normalizar o fim de linha não faz um defeito real
 * passar. Um helper que deixasse o teste verde em qualquer árvore porque passou
 * a recortar mais ou menos do que devia seria pior que o vermelho de antes.
 */

const PAGINA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "paginas", "Ocorrencia.tsx");
const ASSINATURA = "export function BlocoEncerramento";

const pasta = mkdtempSync(join(tmpdir(), "dc360-ler-fonte-"));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

/** Grava o texto em disco com o fim de linha pedido e devolve o caminho. */
function gravar(nome: string, texto: string, fim: "\n" | "\r\n"): string {
  const caminho = join(pasta, nome);
  writeFileSync(caminho, normalizarFimDeLinha(texto).replace(/\n/g, fim));
  return caminho;
}

describe("A mesma fonte em CRLF e em LF", () => {
  const original = readFileSync(PAGINA, "utf8");
  const emLf = gravar("Ocorrencia-lf.tsx", original, "\n");
  const emCrlf = gravar("Ocorrencia-crlf.tsx", original, "\r\n");

  it("lê igual nas duas árvores, sem nenhum CR sobrando", () => {
    expect(readFileSync(emCrlf, "utf8")).toContain("\r\n");
    expect(lerFonte(emCrlf)).toBe(lerFonte(emLf));
    expect(lerFonte(emCrlf)).not.toContain("\r");
  });

  it("recorta o mesmo bloco de BlocoEncerramento nas duas, com uma chamada de onEnviar só", () => {
    const deCrlf = blocoDaFuncao(lerFonte(emCrlf), ASSINATURA);
    expect(deCrlf).toBe(blocoDaFuncao(lerFonte(emLf), ASSINATURA));
    expect([...deCrlf.matchAll(/onEnviar\(/g)]).toHaveLength(1);
    // Recorte que fosse até o fim do arquivo levaria o componente seguinte junto.
    expect(deCrlf.length).toBeLessThan(lerFonte(emLf).length - lerFonte(emLf).indexOf(ASSINATURA));
  });

  it("o recorte aceita o texto cru em CRLF, sem depender de quem chamou ter normalizado", () => {
    const cru = readFileSync(emCrlf, "utf8");
    expect(blocoDaFuncao(cru, ASSINATURA)).toBe(blocoDaFuncao(lerFonte(emLf), ASSINATURA));
  });
});

describe("Normalizar não esconde mudança real", () => {
  const funcao = [
    "export function BlocoEncerramento() {",
    "  const decisao = proximoPassoDoEncerramento(passo, motivo);",
    "  if (decisao.tipo === \"perguntar\") {",
    "    setPasso(\"confirmar\");",
    "    return;",
    "  }",
    "  onEnviar(motivo);",
    "}",
    "",
    "export function Outra() {",
    "  onEnviar(motivo);",
    "}",
    "",
  ].join("\n");

  it("a chave de fechamento movida para antes da gravação tira o onEnviar do bloco", () => {
    // A chave na coluna zero subiu para logo depois do desvio: o onEnviar
    // ficou fora da função. A conferência do teste de encerramento (uma
    // chamada só, depois do "perguntar") tem de reprovar, em CRLF e em LF.
    const movida = funcao.replace("  }\n  onEnviar(motivo);\n}\n", "  }\n}\n  onEnviar(motivo);\n");
    for (const fim of ["\n", "\r\n"] as const) {
      const bloco = blocoDaFuncao(lerFonte(gravar(`movida${fim.length}.tsx`, movida, fim)), ASSINATURA);
      expect([...bloco.matchAll(/onEnviar\(/g)]).toHaveLength(0);
    }
  });

  it("a função sem chave na coluna zero reprova alto, em vez de levar o resto do arquivo", () => {
    const indentada = funcao.replace(/^}$/gm, "  }");
    for (const fim of ["\n", "\r\n"] as const) {
      const fonte = lerFonte(gravar(`indentada${fim.length}.tsx`, indentada, fim));
      expect(() => blocoDaFuncao(fonte, ASSINATURA)).toThrow(/coluna zero/);
    }
  });

  it("assinatura que sumiu reprova, em vez de recortar a partir do começo", () => {
    expect(() => blocoDaFuncao(funcao, "export function NaoExiste")).toThrow(/não tem/);
  });

  it("CR solto não é fim de linha e continua no texto", () => {
    expect(normalizarFimDeLinha("a\rb\r\nc")).toBe("a\rb\nc");
  });
});
