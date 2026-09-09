import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { geradorPlaywright } from "../src/documentos/pdf.js";

/**
 * Os dois botões de PDF do painel, e por que eles davam 503 em produção.
 *
 * Nada disto aparece rodando na máquina de quem desenvolve, e é justamente
 * esse o problema: em desenvolvimento `playwright` está instalado, o navegador
 * baixado, e o PDF sai. O defeito morava no empacotamento, e só na imagem:
 *
 *  1. `playwright` era devDependency, e a etapa `dependencias` do Dockerfile
 *     roda `npm ci --omit=dev`. O import dinâmico de pdf.ts falhava, a rota
 *     respondia 503 "use a versão para impressão", e o Chromium instalado na
 *     imagem ficava de peso morto.
 *  2. Mesmo resolvido o item 1, ainda faltava dizer ao Playwright ONDE está o
 *     navegador. A imagem definia `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, mas
 *     o Playwright não lê essa variável (conferido no playwright-core 1.62.1:
 *     as únicas que ele lê sobre onde achar navegador são
 *     `PLAYWRIGHT_BROWSERS_PATH` e os endereços de download). Ele iria
 *     procurar o navegador que baixa sozinho, que
 *     `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` acabara de impedir de existir.
 *
 * Por isso metade dos casos aqui lê arquivo de manifesto e de imagem: o
 * defeito está lá, e um teste que só exercitasse o gerador passaria com o
 * produto quebrado em produção, que foi exatamente o que aconteceu.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const manifesto = JSON.parse(readFileSync(join(RAIZ, "apps/api/package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const dockerfile = readFileSync(join(RAIZ, "Dockerfile"), "utf8");

// ---------------------------------------------------------------------------
// Leitura das etapas do Dockerfile, com herança de ENV.
// ---------------------------------------------------------------------------

type Etapa = { pai: string | null; linhas: string[] };

/**
 * `ENV` vale para a etapa e para toda etapa que nasce dela, então conferir
 * apenas o bloco literal daria falso negativo no dia em que a variável subir
 * para a etapa `base`, que é onde ela está.
 */
function lerEtapas(texto: string): Map<string, Etapa> {
  // Junta continuações de linha antes de qualquer coisa: `ENV A=1 \` seguido
  // de `B=2` é um comando só.
  const linhas = texto.replace(/\\\r?\n\s*/g, " ").split(/\r?\n/);
  const etapas = new Map<string, Etapa>();
  let atual: Etapa | null = null;
  for (const linha of linhas) {
    const inicio = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(linha.trim());
    if (inicio) {
      const nome = inicio[2] ?? inicio[1]!;
      const base = inicio[1]!;
      atual = { pai: etapas.has(base) ? base : null, linhas: [] };
      etapas.set(nome, atual);
      continue;
    }
    atual?.linhas.push(linha.trim());
  }
  return etapas;
}

function ambienteDaEtapa(etapas: Map<string, Etapa>, nome: string): Record<string, string> {
  const etapa = etapas.get(nome);
  if (!etapa) throw new Error(`etapa ${nome} não existe no Dockerfile`);
  const herdado = etapa.pai ? ambienteDaEtapa(etapas, etapa.pai) : {};
  const proprio: Record<string, string> = {};
  for (const linha of etapa.linhas) {
    if (!/^ENV\s/i.test(linha)) continue;
    for (const par of linha.slice(4).matchAll(/([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|\S+)/g)) {
      proprio[par[1]!] = par[2]!.replace(/^"|"$/g, "");
    }
  }
  return { ...herdado, ...proprio };
}

const etapas = lerEtapas(dockerfile);

describe("O PDF entra na imagem", () => {
  it("playwright e dependencia de producao, senao o --omit=dev o deixa de fora", () => {
    expect(manifesto.dependencies["playwright"]).toBeDefined();
    expect(manifesto.devDependencies["playwright"]).toBeUndefined();
  });

  it("a etapa que instala producao nao baixa navegador", () => {
    // Sem isto, o `npm ci` de `dependencias` baixaria um Chromium só dele,
    // além do Chromium do Debian que a etapa `runtime` instala.
    expect(ambienteDaEtapa(etapas, "dependencias")["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"]).toBe("1");
    expect(ambienteDaEtapa(etapas, "construcao")["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"]).toBe("1");
    expect(ambienteDaEtapa(etapas, "runtime")["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"]).toBe("1");
  });

  it("a variavel que aponta o navegador e lida por alguem", () => {
    /*
      O caso que pega o defeito nº 2. A imagem apontava o Chromium do Debian
      numa variável que ninguém lia: nem o Playwright, que não conhece esse
      nome, nem o nosso código, que nem olhava. Configuração decorativa é pior
      que configuração ausente, porque parece resolvida.
    */
    const apontada = ambienteDaEtapa(etapas, "runtime")["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
    expect(apontada).toBe("/usr/bin/chromium");

    const fonte = readFileSync(join(RAIZ, "apps/api/src/documentos/pdf.ts"), "utf8");
    expect(fonte).toContain("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  });

  it("o topo do Dockerfile parou de anunciar a decisao como pendente", () => {
    expect(dockerfile).not.toContain("DECISÃO PENDENTE");
    expect(dockerfile).toContain("COPY db/provedores db/provedores");
  });
});

describe("O gerador de PDF", () => {
  const HTML = "<!doctype html><html lang=\"pt-BR\"><body><h1>Laudo de vistoria</h1></body></html>";
  const VARIAVEL = "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH";
  const INEXISTENTE = "/nao/existe/chromium-de-mentira";

  it("usa o navegador apontado pelo ambiente, e uma falha nao envenena o gerador", async () => {
    const original = process.env[VARIAVEL];
    const gerador = geradorPlaywright();
    try {
      process.env[VARIAVEL] = INEXISTENTE;
      const primeiro = await gerador.gerar(HTML).catch((e: unknown) => e);
      // Prova de que a variável É lida: o erro cita o caminho que só ela deu.
      expect(String(primeiro)).toContain(INEXISTENTE);

      delete process.env[VARIAVEL];
      const segundo = await gerador.gerar(HTML).catch((e: unknown) => e);

      if (segundo instanceof Error) {
        /*
          Ambiente sem navegador nenhum. O que ainda precisa ser verdade é que
          a SEGUNDA tentativa foi uma tentativa NOVA: antes, a promessa
          rejeitada ficava guardada dentro do gerador e toda chamada seguinte
          recebia a mesma rejeição antiga, então instalar o navegador não
          adiantava nada até alguém reiniciar o processo.
        */
        expect(String(segundo)).not.toContain(INEXISTENTE);
        return;
      }

      const bytes = Buffer.from(segundo);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(bytes.subarray(-1024).toString("latin1")).toContain("%%EOF");
      expect(bytes.length).toBeGreaterThan(1_000);
    } finally {
      if (original === undefined) delete process.env[VARIAVEL];
      else process.env[VARIAVEL] = original;
      await gerador.encerrar().catch(() => undefined);
    }
  }, 180_000);
});
