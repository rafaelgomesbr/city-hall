import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * As regras de conteúdo do projeto, verificadas por máquina.
 *
 * `CLAUDE.md` fixa duas que não são estilo e sim risco:
 *
 * 1. **Nenhum travessão.** É preferência declarada do projeto para todo texto
 *    que sai daqui, e vale também para o que aparece na tela.
 * 2. **Nenhuma norma além das autorizadas, e nenhum artigo inventado.** Um
 *    número de lei errado num termo de interdição é motivo para anular o ato,
 *    e um artigo inventado num documento oficial é pior que nenhuma citação.
 *
 * Até aqui as duas dependiam de alguém lembrar. Este arquivo as transforma em
 * portão, e ele varre a superfície que o PRODUTO gera: o código do sistema,
 * o texto que ele imprime e o protótipo de demonstração.
 *
 * Isenções do travessão (V2-F00-E20, 2026-10-07). O portão reprovava três
 * fontes legítimas: o literal dentro do teste que proíbe o caractere (virou
 * escape), a auditoria de 2026-09-30, que cita o caractere para descrever esse
 * falso positivo, e a saída bruta de teste arquivada como evidência, que
 * reproduz a linha que reprovou. Relatório e saída bruta são PROVA: reescrevê-los
 * para agradar o teste apagaria o que eles provam. Por isso a varredura deixa de
 * olhar para eles, e só para eles: a saída bruta é isenta apenas fora de `.md`
 * (o `RESUMO.md` e o `INDEX.md` de uma evidência são texto escrito à mão e
 * continuam varridos), e a auditoria antiga é isenta pelo nome exato do
 * arquivo. Os casos de âncora no fim deste arquivo provam o recorte num
 * diretório sintético.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PRODUTO = join(AQUI, "..", "..", "..");        // dc360/
const RAIZ_REPO = join(RAIZ_PRODUTO, "..");               // repositório

/**
 * Normas que `docs/CONTEXTO.md` autoriza citar. Qualquer outra num texto que
 * chega ao cidadão ou ao processo administrativo reprova.
 */
const NORMAS_AUTORIZADAS = new Set([
  "12.608/2012", // Política Nacional de Proteção e Defesa Civil
  "14.750/2023", // altera a 12.608
  "13.709/2018", // LGPD
  "14.133/2021", // licitações e contratos
  "182/2021",    // Marco Legal das Startups
  "14.129/2021", // Governo Digital
  "13.146/2015", // acessibilidade digital
]);

const CITACAO_DE_NORMA =
  /(?:Lei|Decreto|Portaria|Instru[çc][ãa]o\s+Normativa|Resolu[çc][ãa]o)[^,.;:<)\n]{0,60}?(\d[\d.]*\/\d{4})/g;

const TRAVESSAO = "—";

/*
  `Pods` entra na lista pela mesma razão de `node_modules`: é dependência de
  terceiro baixada, não texto que este produto escreve.

  Ela apareceu quando o aplicativo passou a depender de módulo nativo e alguém
  rodou `npx expo prebuild`: a pasta `apps/campo/ios/` inteira é gerada e está no
  `.gitignore`, e dentro dela o CocoaPods deixa o código-fonte das bibliotecas,
  com os `README.md` delas. A varredura passou a reprovar por um travessão no
  README do utilitário de mapas do Google.

  Esta regra governa o que o PRODUTO afirma, e não o que a dependência dele diz
  de si mesma, do mesmo jeito que `docs/referencia/` é isento por ser pesquisa.
  Apagar travessão dentro de `Pods` seria editar código de terceiro que a
  próxima instalação reescreve.
*/
const PASTAS_IGNORADAS = new Set([
  "node_modules", "dist", ".git", "coverage", ".angular", "Pods",
]);
/*
  `.json`, `.webmanifest`, `.svg`, `.yaml`, `.yml` e `.toml` entraram em
  15/09/2026, depois de um revisor provar que um travessão no
  `apps/web/public/manifest.webmanifest` (o nome do produto na tela inicial
  do celular) passava calado. São superfícies que o produto mostra ou entrega:
  o manifesto aparece na instalação, o SVG é o ícone, o `eas.json` do Expo é
  o perfil de envio para a loja, e o YAML e o TOML são o que o deploy lê.
*/
const EXTENSOES = [
  ".ts", ".tsx", ".css", ".sql", ".md", ".js", ".mjs", ".html", ".txt",
  ".json", ".webmanifest", ".svg", ".yaml", ".yml", ".toml",
];

/**
 * `docs/referencia/` fica de fora, e a razão importa.
 *
 * São documentos de PESQUISA: o levantamento técnico jurídico e o dossiê de
 * viabilidade. O trabalho deles é justamente levantar normas, e várias que
 * eles citam não estão na lista autorizada porque a lista governa o que o
 * PRODUTO afirma, não o que a pesquisa investigou. Apagar citação de pesquisa
 * para satisfazer um teste seria destruir a evidência que sustentou a decisão.
 */
type Isencao = {
  caminho: string;
  /**
   * `pasta`: tudo abaixo do caminho. `pasta-fora-de-md`: tudo abaixo do caminho
   * que não termina em `.md`. `arquivo`: só aquele arquivo, pelo nome exato.
   */
  alcance: "pasta" | "pasta-fora-de-md" | "arquivo";
};

const CAMINHOS_IGNORADOS: Isencao[] = [
  { caminho: join("docs", "referencia"), alcance: "pasta" },
  { caminho: join("relatorio"), alcance: "pasta" },
  // Este arquivo cita normas e o travessão por natureza.
  { caminho: join("dc360", "packages", "shared", "test"), alcance: "pasta" },
  /*
    Saída bruta da auditoria Baseline Zero (`.txt`, `.json`). É o que os
    comandos imprimiram em 2026-09-30, inclusive a linha que este teste
    reprovava. Editar seria falsificar a evidência; os `.md` da auditoria
    continuam varridos.
  */
  { caminho: join("docs", "auditoria-v2", "raw"), alcance: "pasta-fora-de-md" },
  /*
    Saída bruta arquivada como evidência das etapas da V2. Uma etapa que prova
    um teste vermelho por travessão reproduz o travessão na saída. O `RESUMO.md`
    e o `INDEX.md` de cada etapa são escritos à mão e continuam varridos.
  */
  { caminho: join("docs", "evidencias-v2"), alcance: "pasta-fora-de-md" },
  /*
    Relatório de auditoria anterior, histórico. A linha 313 cita o caractere
    para descrever o falso positivo deste mesmo portão. Isento pelo nome exato:
    outro relatório em `docs/` continua varrido.
  */
  { caminho: join("docs", "AUDITORIA-2026-09-30.md"), alcance: "arquivo" },
  /*
    Relatório do validador de QA da E22 na rodada 8 (registro 4f4871c). Ele
    prova que este portão morde citando uma norma inventada de propósito como
    cenário negativo. É evidência de validação com INDEX.md: reescrever a frase
    seria falsificá-la. Isento pelo nome exato; os outros relatórios continuam
    varridos.
  */
  { caminho: join("docs", "evidencias-v2", "G00", "V2-F00-E22", "validacao", "60cbc2f", "qa.md"), alcance: "arquivo" },
];

/** `relativo` é o caminho a partir da raiz do repositório, com o separador do sistema. */
function isento(relativo: string): boolean {
  return CAMINHOS_IGNORADOS.some(({ caminho, alcance }) => {
    if (alcance === "arquivo") return relativo === caminho;
    if (alcance === "pasta-fora-de-md") {
      // O separador no fim impede que `docs/evidencias-v2-outra` herde a isenção.
      return relativo.startsWith(caminho + sep) && !relativo.endsWith(".md");
    }
    // `pasta`: o próprio caminho ou o que está abaixo dele, com o separador no fim da comparação
    // (sem isso `docs/referencia-outra` herdaria a isenção de `docs/referencia`; D4, 2026-10-13).
    return relativo === caminho || relativo.startsWith(caminho + sep);
  });
}

/**
 * Limite de tempo EXPLÍCITO dos casos que varrem a árvore inteira (V-INS-04 do
 * registro da E03). O padrão do vitest é 5 s, e a varredura lê o repositório
 * todo: com a máquina carregada (a suíte inteira, um `npm install` do Expo
 * gravando em `node_modules`, outro processo no disco) ela leva muito mais que
 * os cerca de 200 ms que leva livre. 60 s é folga larga sobre isso e continua
 * sendo limite: varredura presa reprova com "Test timed out", não fica
 * pendurada.
 */
const LIMITE_DA_VARREDURA_MS = 60_000;

/**
 * Lê um arquivo de texto, ou devolve `null` se ele sumiu entre a listagem e a
 * leitura (`ENOENT`). Só o ENOENT é tolerado: arquivo que sumiu não tem mais
 * travessão nem norma a achar. Qualquer outro erro (permissão, `EISDIR`, disco)
 * continua derrubando a varredura, porque aí o portão não olhou o que devia.
 */
function lerSeExistir(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8");
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw erro;
  }
}

function arquivos(raiz: string, raizRepo: string = RAIZ_REPO): string[] {
  const encontrados: string[] = [];

  function percorrer(pasta: string): void {
    let nomes: string[];
    try {
      nomes = readdirSync(pasta);
    } catch (erro) {
      // A pasta sumiu entre a listagem do pai e a dela: não há o que varrer.
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") return;
      throw erro;
    }
    for (const nome of nomes) {
      if (PASTAS_IGNORADAS.has(nome)) continue;
      const caminho = join(pasta, nome);
      // `throwIfNoEntry: false`: o arquivo (ou o alvo do link simbólico) pode
      // sumir entre a listagem e esta leitura; some também da varredura.
      const info = statSync(caminho, { throwIfNoEntry: false });
      if (!info) continue;
      if (info.isDirectory()) {
        percorrer(caminho);
      } else if (EXTENSOES.some((e) => nome.endsWith(e))) {
        if (isento(relative(raizRepo, caminho))) continue;
        encontrados.push(caminho);
      }
    }
  }

  percorrer(raiz);
  return encontrados;
}

/**
 * Superfícies que o produto gera ou apresenta. `raizRepo` só muda nos casos de
 * âncora, que montam um repositório sintético com a mesma estrutura.
 */
function superficiesDoProduto(raizRepo: string = RAIZ_REPO): string[] {
  const raizProduto = raizRepo === RAIZ_REPO ? RAIZ_PRODUTO : join(raizRepo, "dc360");
  return [
    ...arquivos(raizProduto, raizRepo),
    ...arquivos(join(raizRepo, "mockup"), raizRepo),
    ...arquivos(join(raizRepo, "docs"), raizRepo),
  ];
}

function nome(caminho: string, raizRepo: string = RAIZ_REPO): string {
  return relative(raizRepo, caminho).split(sep).join("/");
}

function achadosDeTravessao(raizRepo: string = RAIZ_REPO): string[] {
  const achados: string[] = [];
  for (const caminho of superficiesDoProduto(raizRepo)) {
    (lerSeExistir(caminho) ?? "").split("\n").forEach((linha, i) => {
      if (linha.includes(TRAVESSAO)) {
        achados.push(`${nome(caminho, raizRepo)}:${i + 1}  ${linha.trim().slice(0, 90)}`);
      }
    });
  }
  return achados;
}

describe("Regras de conteúdo", () => {
  it("a varredura alcança o código, o protótipo e a documentação", () => {
    // Âncora: sem ela, um caminho errado faria a varredura passar vazia.
    const lista = superficiesDoProduto().map((c) => nome(c));
    expect(lista.length).toBeGreaterThan(40);
    expect(lista.some((a) => a.startsWith("dc360/apps/api/src"))).toBe(true);
    expect(lista.some((a) => a.startsWith("mockup/"))).toBe(true);
    expect(lista.some((a) => a.startsWith("docs/"))).toBe(true);
    // As superfícies que não são código também entram: o manifesto do painel,
    // o `eas.json` do Expo e o `fly.toml` do deploy.
    expect(lista.some((a) => a.endsWith("apps/web/public/manifest.webmanifest"))).toBe(true);
    expect(lista.some((a) => a.endsWith("apps/campo/eas.json"))).toBe(true);
    expect(lista.some((a) => a.endsWith("dc360/fly.toml"))).toBe(true);
    // E a isenção da pesquisa está de fato valendo.
    expect(lista.some((a) => a.startsWith("docs/referencia"))).toBe(false);
  }, LIMITE_DA_VARREDURA_MS);

  it("nenhum travessão em texto nenhum", () => {
    const achados = achadosDeTravessao();

    expect(
      achados,
      achados.length === 0
        ? ""
        : `travessão encontrado; use vírgula, dois pontos ou parênteses:\n${achados.join("\n")}`,
    ).toEqual([]);
  }, LIMITE_DA_VARREDURA_MS);

  it("nenhuma norma citada fora da lista autorizada", () => {
    const achados: string[] = [];

    for (const caminho of superficiesDoProduto()) {
      (lerSeExistir(caminho) ?? "").split("\n").forEach((linha, i) => {
        for (const casou of linha.matchAll(CITACAO_DE_NORMA)) {
          if (!NORMAS_AUTORIZADAS.has(casou[1]!)) {
            achados.push(`${nome(caminho)}:${i + 1}  ${casou[0].trim()}`);
          }
        }
      });
    }

    expect(
      achados,
      achados.length === 0
        ? ""
        : "norma fora da lista de docs/CONTEXTO.md. Um número de lei errado num " +
          `termo de interdição é motivo para anular o ato:\n${achados.join("\n")}`,
    ).toEqual([]);
  }, LIMITE_DA_VARREDURA_MS);

  it("nenhum número de artigo em documento oficial", () => {
    /*
      A lista autorizada nomeia leis, não artigos. Citar "artigo 7º" de uma lei
      que o projeto não leu é inventar, e num termo de interdição isso é
      munição para anular o ato.

      A varredura é restrita aos geradores de documento oficial: comentário de
      código e documentação de projeto podem falar de artigo sem que isso saia
      impresso com o brasão do município.
    */
    const geradores = arquivos(join(RAIZ_PRODUTO, "apps", "api", "src", "documentos"));
    expect(geradores.length).toBeGreaterThan(0);

    const achados: string[] = [];
    for (const caminho of geradores) {
      (lerSeExistir(caminho) ?? "").split("\n").forEach((linha, i) => {
        if (/\bart(?:\.|igo)\s*\d/i.test(linha)) {
          achados.push(`${nome(caminho)}:${i + 1}  ${linha.trim().slice(0, 90)}`);
        }
      });
    }
    expect(achados).toEqual([]);
  }, LIMITE_DA_VARREDURA_MS);

  it("as isenções da E20 valem só no recorte, e na árvore real", () => {
    // Âncora na árvore de verdade: o que é escrito à mão continua entrando.
    const lista = superficiesDoProduto().map((c) => nome(c));
    expect(lista).toContain("dc360/apps/web/test/trilha-detalhe.test.ts");
    expect(lista).toContain("docs/AUDITORIA-V2-BASELINE-ZERO.md");
    expect(lista).toContain("docs/auditoria-v2/01-baseline.md");
    expect(lista.some((a) => /^docs\/evidencias-v2\/.+\/RESUMO\.md$/.test(a))).toBe(true);
    expect(lista.some((a) => /^docs\/evidencias-v2\/.+\/INDEX\.md$/.test(a))).toBe(true);
    // E o que é saída bruta, e só ele, sai.
    expect(lista).not.toContain("docs/AUDITORIA-2026-09-30.md");
    expect(lista).not.toContain("docs/auditoria-v2/raw/teste-shared.txt");
    expect(lista.some((a) => a.startsWith("docs/evidencias-v2/") && !a.endsWith(".md"))).toBe(false);
    expect(lista.some((a) => a.startsWith("docs/auditoria-v2/raw/") && !a.endsWith(".md"))).toBe(false);
  }, LIMITE_DA_VARREDURA_MS);

  describe("recorte das isenções num repositório sintético", () => {
    /*
      Os casos negativos da E20. Cada arquivo leva um travessão; o portão tem de
      reprovar todos, menos os dois que são saída bruta. Os nomes das armadilhas
      (`evidencias-v2-copia`, `AUDITORIA-2026-10-01.md`, `.txt` fora do `raw`)
      provam que a isenção não pega por prefixo solto nem por parecença de nome.
    */
    const TEXTO = `linha com ${TRAVESSAO} no meio\n`;
    const REPROVAM = [
      "docs/nota-nova.md",
      "docs/evidencias-v2/G00/V2-F00-E99/RESUMO.md",
      "docs/evidencias-v2/G00/V2-F00-E99/INDEX.md",
      "docs/auditoria-v2/raw/nota-escrita-a-mao.md",
      "docs/auditoria-v2/relatorio-fora-do-raw.txt",
      "docs/evidencias-v2-copia/saida.txt",
      "docs/AUDITORIA-2026-10-01.md",
      "docs/sub/AUDITORIA-2026-09-30.md",
      "dc360/apps/api/src/produto-novo.ts",
      "dc360/apps/web/src/Tela.tsx",
      "mockup/app/tela.js",
      // Vizinho de nome de uma pasta isenta: NÃO herda a isenção (D4).
      "docs/referencia-outra/nota.md",
    ];
    const PASSAM = [
      "docs/evidencias-v2/G00/V2-F00-E99/saida-do-teste.txt",
      "docs/evidencias-v2/G00/V2-F00-E99/resultado.json",
      "docs/auditoria-v2/raw/teste-novo.txt",
      "docs/AUDITORIA-2026-09-30.md",
    ];

    function montar(): string {
      const raiz = mkdtempSync(join(tmpdir(), "dc360-conteudo-"));
      for (const relativo of [...REPROVAM, ...PASSAM]) {
        const caminho = join(raiz, ...relativo.split("/"));
        mkdirSync(dirname(caminho), { recursive: true });
        writeFileSync(caminho, TEXTO, "utf8");
      }
      return raiz;
    }

    it("reprova o travessão novo em documento, evidência escrita à mão e produto", () => {
      const raiz = montar();
      try {
        const achados = achadosDeTravessao(raiz).map((a) => a.split(":")[0]);
        for (const relativo of REPROVAM) expect(achados).toContain(relativo);
        expect(achados).toHaveLength(REPROVAM.length);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    }, LIMITE_DA_VARREDURA_MS);

    it("deixa passar só a saída bruta e o relatório histórico pelo nome exato", () => {
      const raiz = montar();
      try {
        const achados = achadosDeTravessao(raiz).map((a) => a.split(":")[0]);
        for (const relativo of PASSAM) expect(achados).not.toContain(relativo);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    }, LIMITE_DA_VARREDURA_MS);

    it("tolera o arquivo que some entre a listagem e a leitura (ENOENT), sem derrubar a varredura", () => {
      /*
        V-INS-04 do registro da E03. A varredura lista a pasta e só depois
        abre cada arquivo; entre uma coisa e outra outro processo pode apagar ou
        trocar o arquivo (o `npm install` do Expo, uma evidência sendo
        regravada). Um link simbólico pendurado reproduz o instante exato:
        `readdirSync` o lista e `statSync` falha com ENOENT. O arquivo que sumiu
        não tem mais travessão a achar; o resto da varredura precisa seguir.
      */
      const raiz = montar();
      try {
        symlinkSync(
          join(raiz, "alvo-que-nao-existe.md"),
          join(raiz, "docs", "sumiu-depois-da-listagem.md"),
        );
        const achados = achadosDeTravessao(raiz).map((a) => a.split(":")[0]);
        expect(achados).not.toContain("docs/sumiu-depois-da-listagem.md");
        for (const relativo of REPROVAM) expect(achados).toContain(relativo);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    }, LIMITE_DA_VARREDURA_MS);

    it("só tolera ENOENT: outro erro de leitura continua derrubando a varredura", () => {
      const raiz = montar();
      try {
        // Uma PASTA com nome de arquivo de texto: listada, e a leitura falha com EISDIR.
        mkdirSync(join(raiz, "docs", "pasta-que-parece-arquivo.md"));
        // `arquivos()` a trata como pasta (não lê); o erro que não é ENOENT só
        // aparece na leitura de arquivo, então provamos pela função de leitura.
        expect(() => lerSeExistir(join(raiz, "docs", "pasta-que-parece-arquivo.md"))).toThrow(/EISDIR/);
        expect(lerSeExistir(join(raiz, "docs", "nao-existe.md"))).toBeNull();
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    }, LIMITE_DA_VARREDURA_MS);
  });

  it("as próprias expressões funcionam", () => {
    // Sem isto, um erro nas expressões faria a varredura passar vazia.
    expect(`texto com ${TRAVESSAO} travessão`.includes(TRAVESSAO)).toBe(true);

    const encontradas = [...
      "nos termos da Lei 12.608/2012 e do Decreto 99.999/2030, considerando"
        .matchAll(CITACAO_DE_NORMA)
    ].map((m) => m[1]);
    expect(encontradas).toContain("12.608/2012");
    expect(encontradas).toContain("99.999/2030");
    expect(NORMAS_AUTORIZADAS.has("99.999/2030")).toBe(false);

    expect(/\bart(?:\.|igo)\s*\d/i.test("nos termos do art. 7º")).toBe(true);
    expect(/\bart(?:\.|igo)\s*\d/i.test("artigo 12 da lei")).toBe(true);
    expect(/\bart(?:\.|igo)\s*\d/i.test("o artesão da cidade")).toBe(false);
  });
});
