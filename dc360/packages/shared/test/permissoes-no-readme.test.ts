import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACOES, PAPEIS, ROTULO_ACAO, ROTULO_PAPEL, acoesDoPapel, podeExecutar } from "../src/index.js";
import type { Acao, Papel } from "../src/index.js";

/**
 * A tabela de permissões do `README.md` está presa ao catálogo (V2-F00-E22,
 * correção 4).
 *
 * O README dizia que a tabela era "gerada a partir de `acoesDoPapel`, e um
 * teste reprova se ela divergir do código", e o teste não existia: a tabela
 * ficou sem `levantar_interdicao` (concedida a coordenador e administrador) e
 * ninguém viu, porque documentação não quebra build. Este arquivo é o teste
 * que a frase prometia.
 *
 * A tabela é GERADA aqui, linha a linha, de `acoesDoPapel`, `ROTULO_ACAO` e
 * `ROTULO_PAPEL`, e comparada com a que está no README, entre o marcador
 * `<!-- permissoes: gerado ... -->` e a primeira linha que não é de tabela.
 * Reprova se faltar ação, se sobrar ação, se o papel não tiver linha, se tiver
 * linha de papel que não existe, ou se a ordem divergir (a ordem é a de
 * `PERMISSOES`, que é a de leitura). Quando reprovar, a mensagem traz a linha
 * certa, pronta para colar.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const README = join(AQUI, "..", "..", "..", "README.md");
const MARCADOR = "<!-- permissoes: gerado a partir de packages/shared/src/permissoes.ts -->";

/** A linha de tabela que o código manda ter para um papel. */
function linhaGerada(papel: (typeof PAPEIS)[number]): string {
  const pode = acoesDoPapel(papel).map((a) => ROTULO_ACAO[a]).join(", ");
  return `| ${ROTULO_PAPEL[papel]} | ${pode} |`;
}

/** A tabela inteira que o código manda ter (cabeçalho, separador e uma linha por papel). */
export function tabelaGerada(): string[] {
  return ["| Papel | Pode |", "| --- | --- |", ...PAPEIS.map(linhaGerada)];
}

/** As linhas de tabela que seguem o marcador no texto do README. */
export function tabelaDoReadme(texto: string): string[] {
  const linhas = texto.split(/\r?\n/);
  const i = linhas.indexOf(MARCADOR);
  if (i < 0) throw new Error("README sem o marcador da tabela de permissões");
  const tabela: string[] = [];
  for (let k = i + 1; k < linhas.length; k++) {
    const l = linhas[k]!;
    if (l.trim() === "" && tabela.length === 0) continue;
    if (!l.startsWith("|")) break;
    tabela.push(l);
  }
  return tabela;
}

/** As diferenças, em português, entre a tabela do README e a do código. */
export function diferencas(texto: string): string[] {
  const esperada = tabelaGerada();
  const real = tabelaDoReadme(texto);
  const out: string[] = [];
  for (const papel of PAPEIS) {
    const cert = linhaGerada(papel);
    const rotulo = `| ${ROTULO_PAPEL[papel]} |`;
    const achada = real.find((l) => l.startsWith(rotulo));
    if (!achada) { out.push(`falta a linha do papel ${papel}; deveria ser: ${cert}`); continue; }
    if (achada === cert) continue;
    const celula = (l: string) => l.slice(rotulo.length).replace(/\|\s*$/, "").trim();
    const tem = new Set(celula(achada).split(", "));
    const deve = new Set(celula(cert).split(", "));
    const faltam = [...deve].filter((x) => !tem.has(x));
    const sobram = [...tem].filter((x) => !deve.has(x));
    out.push(
      `${papel}: ${faltam.length ? `faltam [${faltam.join("; ")}]` : "nada falta"}, ` +
      `${sobram.length ? `sobram [${sobram.join("; ")}]` : "nada sobra"}` +
      `${!faltam.length && !sobram.length ? ", mas a ordem difere" : ""}. Linha certa: ${cert}`,
    );
  }
  for (const l of real.slice(2)) {
    if (!PAPEIS.some((p) => l.startsWith(`| ${ROTULO_PAPEL[p]} |`))) {
      out.push(`linha de papel que o código não tem: ${l.slice(0, 60)}`);
    }
  }
  if (!out.length && real.join("\n") !== esperada.join("\n")) {
    out.push("cabeçalho ou separador da tabela diferem do esperado");
  }
  return out;
}

describe("Tabela de permissões do README presa ao catálogo do pacote compartilhado", () => {
  const texto = readFileSync(README, "utf8");

  it("o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação)", () => {
    expect(diferencas(texto), "gere a tabela de novo e cole abaixo do marcador").toEqual([]);
  });

  it("o catálogo é coerente: todo rótulo é único e não vazio, e toda ação do catálogo é de alguém", () => {
    // Rótulo repetido tornaria a tabela ambígua (duas ações com o mesmo texto).
    const rotulos = ACOES.map((a) => ROTULO_ACAO[a]);
    expect(new Set(rotulos).size).toBe(ACOES.length);
    for (const r of rotulos) expect(r.trim()).not.toBe("");
    // Ação que ninguém tem é ação morta ou concessão esquecida.
    for (const a of ACOES) {
      expect(PAPEIS.some((p) => acoesDoPapel(p).includes(a)), a).toBe(true);
    }
    // O rótulo não pode conter a vírgula que a tabela usa como separador.
    for (const r of rotulos) expect(r).not.toContain(",");
  });

  it("o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira)", () => {
    const celulas = tabelaDoReadme(texto).slice(2).join(" ");
    for (const a of ACOES) expect(celulas, a).toContain(ROTULO_ACAO[a]);
  });

  /*
    MUTAÇÕES: provam que a comparação morde. Cada uma altera o TEXTO do README
    em memória e exige que o teste acuse. (A mutação no código de permissões,
    feita à mão e arquivada na evidência, é a de acrescentar uma ação ao
    papel e ver o primeiro caso reprovar.)
  */
  describe("mordida", () => {
    const igual = (t: string) => expect(diferencas(t)).toEqual([]);

    it("a tabela atual passa (controle)", () => igual(texto));

    it("ação que FALTA no README é acusada, com o nome do papel e da ação", () => {
      const rotulo = ROTULO_ACAO.levantar_interdicao;
      const mutado = texto.replace(`${rotulo}, `, "");
      expect(mutado).not.toBe(texto);
      const d = diferencas(mutado);
      expect(d.length).toBeGreaterThan(0);
      expect(d.join("\n")).toContain(`faltam [${rotulo}]`);
    });

    it("ação que SOBRA no README é acusada", () => {
      const mutado = texto.replace("| Agente de campo | registrar vistoria |",
        "| Agente de campo | registrar vistoria, exportar dados |");
      expect(mutado).not.toBe(texto);
      expect(diferencas(mutado).join("\n")).toContain("sobram [exportar dados]");
    });

    it("papel sem linha, linha de papel inexistente e ordem trocada são acusados", () => {
      const sem = texto.split("\n").filter((l) => !l.startsWith("| Agente de campo |")).join("\n");
      expect(diferencas(sem).join("\n")).toContain("falta a linha do papel agente_campo");
      const extra = texto.replace("| Agente de campo | registrar vistoria |",
        "| Fiscal | x |\n| Agente de campo | registrar vistoria |");
      expect(diferencas(extra).join("\n")).toContain("linha de papel que o código não tem");
      const op = linhaGerada("operador");
      const [a, b] = acoesDoPapel("operador").map((x) => ROTULO_ACAO[x]);
      const trocada = texto.replace(op, op.replace(`${a}, ${b}`, `${b}, ${a}`));
      expect(trocada).not.toBe(texto);
      expect(diferencas(trocada).join("\n")).toContain("a ordem difere");
    });

    it("README sem o marcador falha em voz alta (a tabela não pode perder a amarra)", () => {
      expect(() => diferencas(texto.replace(MARCADOR, ""))).toThrow(/marcador/);
    });
  });
});

/**
 * A segunda tabela da casa: "A tabela, de uma vez", em
 * `docs/PAPEIS_E_RESPONSABILIDADES.md`, uma linha por ação e uma coluna por
 * papel ("sim", "não", "**só ele**"). Ela também dizia "um teste reprova se esta
 * tabela divergir do código" sem teste, e estava sem três das dezesseis ações.
 * Aqui cada célula é conferida com `podeExecutar`, e cada ação do catálogo
 * precisa ter linha (e linha sem ação do catálogo reprova).
 */
const PAPEIS_DOC = join(AQUI, "..", "..", "..", "docs", "PAPEIS_E_RESPONSABILIDADES.md");
const COLUNAS: readonly Papel[] = ["operador", "agente_campo", "coordenador", "administrador"];

export function diferencasDoDocumentoDePapeis(texto: string): string[] {
  const linhas = texto.split(/\r?\n/);
  const i = linhas.findIndex((l) => l.trim() === "## A tabela, de uma vez");
  if (i < 0) throw new Error("documento sem a seção 'A tabela, de uma vez'");
  const corpo: string[] = [];
  for (let k = i + 1; k < linhas.length; k++) {
    const l = linhas[k]!;
    if (l.trim() === "" && corpo.length === 0) continue;
    if (!l.startsWith("|")) break;
    corpo.push(l);
  }
  const out: string[] = [];
  const celulas = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  // O cabeçalho amarra cada coluna a um papel: coluna trocada faria todo "sim" e "não" mentir
  // sem que nenhuma linha mudasse. Cada título precisa ser o começo do rótulo do papel da coluna.
  const cab = celulas(corpo[0] ?? "");
  COLUNAS.forEach((papel, k) => {
    const titulo = cab[k + 1] ?? "";
    if (titulo === "" || !ROTULO_PAPEL[papel].startsWith(titulo)) {
      out.push(`coluna ${k + 2} do cabeçalho deveria ser o papel ${papel} (${ROTULO_PAPEL[papel]}), e é "${titulo}"`);
    }
  });
  const porRotulo = new Map<string, Acao>();
  for (const a of ACOES) porRotulo.set(ROTULO_ACAO[a].toLowerCase(), a);
  // O documento escreve o rótulo do jeito de gente; este mapa liga o texto da linha à ação.
  const apelidos: Record<string, Acao> = {
    "registrar ocorrência": "abrir_ocorrencia",
    "responder providência": "responder_providencia",
    "emitir laudo ou termo": "emitir_documento",
    "consultar a trilha": "consultar_trilha",
    "alterar dados do município": "gerenciar_organizacao",
  };
  const vistas = new Set<Acao>();
  for (const l of corpo.slice(2)) {
    const c = celulas(l);
    const rotulo = c[0]!.toLowerCase();
    const alvo = apelidos[rotulo] ?? porRotulo.get(rotulo);
    if (!alvo) { out.push(`linha sem ação correspondente no catálogo: "${c[0]}"`); continue; }
    vistas.add(alvo);
    COLUNAS.forEach((papel, k) => {
      const diz = !c[k + 1]!.toLowerCase().startsWith("não");
      if (diz !== podeExecutar(papel, alvo)) {
        out.push(`${alvo} para ${papel}: o documento diz "${c[k + 1]}" e o código diz ${podeExecutar(papel, alvo) ? "sim" : "não"}`);
      }
    });
  }
  for (const a of ACOES) if (!vistas.has(a)) out.push(`ação do catálogo sem linha no documento: ${a}`);
  return out;
}

describe("Tabela de PAPEIS_E_RESPONSABILIDADES.md presa ao catálogo", () => {
  const texto = readFileSync(PAPEIS_DOC, "utf8");

  it("cada ação do catálogo tem linha, e cada sim ou não bate com podeExecutar", () => {
    expect(diferencasDoDocumentoDePapeis(texto)).toEqual([]);
  });

  it("morde: célula trocada, linha removida e linha inventada são acusadas", () => {
    const celulaTrocada = texto.replace("| Exportar dados | não | não | sim | sim |", "| Exportar dados | sim | não | sim | sim |");
    expect(celulaTrocada).not.toBe(texto);
    expect(diferencasDoDocumentoDePapeis(celulaTrocada).join("\n")).toContain("exportar_dados para operador");

    const semLinha = texto.split("\n").filter((l) => !l.startsWith("| Levantar a interdição de um imóvel |")).join("\n");
    expect(semLinha).not.toBe(texto);
    expect(diferencasDoDocumentoDePapeis(semLinha).join("\n")).toContain("ação do catálogo sem linha no documento: levantar_interdicao");

    const colunasTrocadas = texto.replace("| Ação | Operador | Agente | Coordenador | Administrador |", "| Ação | Coordenador | Agente | Operador | Administrador |");
    expect(colunasTrocadas).not.toBe(texto);
    const d = diferencasDoDocumentoDePapeis(colunasTrocadas).join("\n");
    expect(d).toContain("coluna 2 do cabeçalho deveria ser o papel operador");
    expect(d).toContain("coluna 4 do cabeçalho deveria ser o papel coordenador");

    const inventada = texto.replace("| Exportar dados |", "| Apagar município | não | não | não | não |\n| Exportar dados |");
    expect(diferencasDoDocumentoDePapeis(inventada).join("\n")).toContain("linha sem ação correspondente");
  });
});
