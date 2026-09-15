import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROTAS_PUBLICAS, ehTelaInterna, marcarComoInterna } from "../src/seo/indexacao";
import { PRODUTO, tituloDaAba } from "../src/seo/titulo";

/**
 * O que o painel diz de si para quem chega de fora.
 *
 * Até este portão existir, o `index.html` tinha três linhas no `<head>`:
 * charset, viewport e o título. Sem ícone, a aba mostrava o globo cinza do
 * navegador; sem descrição, o resultado de busca mostrava o primeiro texto
 * que o robô achasse; sem Open Graph, o endereço colado no WhatsApp de um
 * coordenador virava um cartão vazio. E como tudo isso mora num arquivo que
 * ninguém abre depois do primeiro dia, a regressão seria silenciosa.
 *
 * O portão lê o `index.html`, o manifesto e os bytes dos arquivos de marca em
 * `public/`. Ele reprova se faltar tag, se a imagem da prévia tiver endereço
 * relativo (quem monta a prévia é outro servidor, e relativo para ele é nada),
 * se o manifesto esquecer o ícone mascarável (o Android recorta o ícone comum
 * num círculo e come a sigla), ou se um PNG no disco não tiver o tamanho que
 * o HTML e o manifesto prometem: o tamanho é lido do cabeçalho IHDR, não do
 * nome do arquivo.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = join(RAIZ, "public");
const FONTE = join(RAIZ, "src");

const INDEX = readFileSync(join(RAIZ, "index.html"), "utf8");
const TOKENS = readFileSync(join(FONTE, "estilos", "tokens.css"), "utf8");

/* ------------------------------------------------------------------ */
/* Leitura das tags do <head>                                          */
/* ------------------------------------------------------------------ */

type Tag = Record<string, string>;

/** Toda `<meta>` e `<link>` do documento, como um objeto de atributos. */
function tagsDoHead(html: string): Tag[] {
  const tags: Tag[] = [];
  for (const casou of html.matchAll(/<(meta|link)\b([^>]*?)\/?>/g)) {
    const tag: Tag = { tag: casou[1]! };
    for (const atributo of casou[2]!.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      tag[atributo[1]!] = atributo[2]!;
    }
    tags.push(tag);
  }
  return tags;
}

function achar(tags: Tag[], chave: string, valor: string): Tag | undefined {
  return tags.find((t) => t[chave] === valor);
}

/**
 * Cada exigência é um nome (o que aparece na lista de faltas) e uma função
 * que diz se o HTML a cumpre. A lista é o contrato; o teste positivo exige
 * que ela saia vazia, e o negativo exige que ela morda o `index.html` antigo.
 */
const EXIGENCIAS: Array<{ nome: string; cumpre: (html: string, tags: Tag[]) => boolean }> = [
  { nome: 'html[lang="pt-BR"]', cumpre: (h) => /<html\b[^>]*\blang="pt-BR"/.test(h) },
  { nome: "<title> com o nome do produto", cumpre: (h) => /<title>Defesa Civil Operacional 360<\/title>/.test(h) },
  { nome: "meta[name=description] com texto", cumpre: (_, t) => (achar(t, "name", "description")?.content?.length ?? 0) > 40 },
  {
    nome: "theme-color para o esquema claro",
    cumpre: (_, t) => t.some((x) => x.name === "theme-color" && x.media === "(prefers-color-scheme: light)" && /^#[0-9A-Fa-f]{6}$/.test(x.content ?? "")),
  },
  {
    nome: "theme-color para o esquema escuro",
    cumpre: (_, t) => t.some((x) => x.name === "theme-color" && x.media === "(prefers-color-scheme: dark)" && /^#[0-9A-Fa-f]{6}$/.test(x.content ?? "")),
  },
  { nome: "link[rel=icon][type=image/svg+xml]", cumpre: (_, t) => t.some((x) => x.rel === "icon" && x.type === "image/svg+xml" && x.href === "/icone.svg") },
  { nome: "link[rel=icon] para o favicon.ico com sizes", cumpre: (_, t) => t.some((x) => x.rel === "icon" && x.href === "/favicon.ico" && /16x16/.test(x.sizes ?? "")) },
  { nome: "link[rel=apple-touch-icon]", cumpre: (_, t) => t.some((x) => x.rel === "apple-touch-icon" && x.href === "/apple-touch-icon.png") },
  { nome: "link[rel=manifest]", cumpre: (_, t) => achar(t, "rel", "manifest")?.href === "/manifest.webmanifest" },
  { nome: "og:type", cumpre: (_, t) => achar(t, "property", "og:type")?.content === "website" },
  { nome: "og:site_name", cumpre: (_, t) => Boolean(achar(t, "property", "og:site_name")?.content) },
  { nome: "og:title", cumpre: (_, t) => Boolean(achar(t, "property", "og:title")?.content) },
  { nome: "og:description", cumpre: (_, t) => (achar(t, "property", "og:description")?.content?.length ?? 0) > 40 },
  { nome: "og:url absoluta", cumpre: (_, t) => /^https:\/\/[^/]+\/$/.test(achar(t, "property", "og:url")?.content ?? "") },
  { nome: "og:image absoluta (https://...)", cumpre: (_, t) => /^https:\/\/[^/]+\/.+\.png$/.test(achar(t, "property", "og:image")?.content ?? "") },
  { nome: "og:image:width", cumpre: (_, t) => /^\d+$/.test(achar(t, "property", "og:image:width")?.content ?? "") },
  { nome: "og:image:height", cumpre: (_, t) => /^\d+$/.test(achar(t, "property", "og:image:height")?.content ?? "") },
  { nome: "og:image:alt", cumpre: (_, t) => (achar(t, "property", "og:image:alt")?.content?.length ?? 0) > 20 },
  { nome: "og:locale pt_BR", cumpre: (_, t) => achar(t, "property", "og:locale")?.content === "pt_BR" },
  { nome: "twitter:card summary_large_image", cumpre: (_, t) => achar(t, "name", "twitter:card")?.content === "summary_large_image" },
];

function faltasNoIndex(html: string): string[] {
  const tags = tagsDoHead(html);
  return EXIGENCIAS.filter((e) => !e.cumpre(html, tags)).map((e) => e.nome);
}

/* ------------------------------------------------------------------ */
/* Leitura de PNG e de ICO                                             */
/* ------------------------------------------------------------------ */

const ASSINATURA_PNG = "89504e470d0a1a0a";

/** Largura e altura do cabeçalho IHDR, ou null se os bytes não forem PNG. */
function dimensoesDoPng(bytes: Buffer): { largura: number; altura: number } | null {
  if (bytes.length < 24) return null;
  if (bytes.subarray(0, 8).toString("hex") !== ASSINATURA_PNG) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
}

/** Os quadros de um .ico: o tamanho declarado no diretório e os bytes de cada um. */
function quadrosDoIco(bytes: Buffer): Array<{ declarado: number; imagem: Buffer }> {
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return [];
  const total = bytes.readUInt16LE(4);
  const quadros: Array<{ declarado: number; imagem: Buffer }> = [];
  for (let i = 0; i < total; i++) {
    const entrada = 6 + 16 * i;
    const largura = bytes.readUInt8(entrada);
    const tamanho = bytes.readUInt32LE(entrada + 8);
    const inicio = bytes.readUInt32LE(entrada + 12);
    quadros.push({ declarado: largura === 0 ? 256 : largura, imagem: bytes.subarray(inicio, inicio + tamanho) });
  }
  return quadros;
}

/** Um PNG de mentira só com a assinatura e o IHDR, para provar que o leitor lê o cabeçalho. */
function pngFalso(largura: number, altura: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from(ASSINATURA_PNG, "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(largura, 16);
  bytes.writeUInt32BE(altura, 20);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/** O valor de `--ds-bg` em cada tema, resolvido até a primitiva em hexadecimal. */
function corDeFundoDoTema(tema: "claro" | "escuro"): string {
  const bloco = tema === "claro"
    ? TOKENS.slice(TOKENS.indexOf(":root {"), TOKENS.indexOf('[data-theme="dark"]'))
    : TOKENS.slice(TOKENS.indexOf('[data-theme="dark"]'));
  const bg = /--ds-bg:\s*var\((--ds-[a-z0-9-]+)\)/.exec(bloco)?.[1];
  expect(bg, `--ds-bg do tema ${tema} não aponta para uma primitiva`).toBeTruthy();
  const hex = new RegExp(`${bg}:\\s*(#[0-9A-Fa-f]{6})`).exec(TOKENS)?.[1];
  expect(hex, `primitiva ${bg} sem valor em tokens.css`).toBeTruthy();
  return hex!.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* index.html                                                          */
/* ------------------------------------------------------------------ */

describe("index.html diz quem é", () => {
  it("cumpre cada exigência de título, ícone, manifesto e prévia de link", () => {
    expect(faltasNoIndex(INDEX)).toEqual([]);
  });

  it("o portão morde: o index.html de antes reprova em quase tudo", () => {
    /* Este era o <head> inteiro até a marca entrar. */
    const antes = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Defesa Civil Operacional 360</title>
  </head>
  <body><div id="root"></div></body>
</html>`;
    const faltas = faltasNoIndex(antes);
    // Só o idioma e o título passavam.
    expect(faltas.length).toBe(EXIGENCIAS.length - 2);
    expect(faltas).toContain("meta[name=description] com texto");
    expect(faltas).toContain("link[rel=icon][type=image/svg+xml]");
    expect(faltas).toContain("og:image absoluta (https://...)");
    expect(faltas).toContain("twitter:card summary_large_image");
  });

  it("o portão morde: og:image relativa reprova mesmo com a tag presente", () => {
    const relativa = INDEX.replace(/content="https:\/\/[^"]*\/og\.png"/, 'content="/og.png"');
    expect(relativa).not.toBe(INDEX);
    expect(faltasNoIndex(relativa)).toEqual(["og:image absoluta (https://...)"]);
  });

  it("og:url e og:image apontam para a mesma origem: é uma constante só", () => {
    const tags = tagsDoHead(INDEX);
    const url = new URL(achar(tags, "property", "og:url")!.content!);
    const imagem = new URL(achar(tags, "property", "og:image")!.content!);
    expect(imagem.origin).toBe(url.origin);
    expect(imagem.pathname).toBe("/og.png");
    // E o comentário que documenta a constante fala do mesmo endereço.
    expect(INDEX).toContain(`ENDEREÇO DO PAINEL EM PRODUÇÃO: ${url.origin}`);
  });

  it("as duas cores de theme-color são --ds-bg de cada tema, copiadas de tokens.css", () => {
    const tags = tagsDoHead(INDEX);
    const claro = tags.find((t) => t.name === "theme-color" && t.media === "(prefers-color-scheme: light)");
    const escuro = tags.find((t) => t.name === "theme-color" && t.media === "(prefers-color-scheme: dark)");
    expect(claro?.content?.toUpperCase()).toBe(corDeFundoDoTema("claro"));
    expect(escuro?.content?.toUpperCase()).toBe(corDeFundoDoTema("escuro"));
  });

  it("nenhum texto voltado para fora tem travessão", () => {
    expect(INDEX).not.toContain("\u2014");
  });
});

/* ------------------------------------------------------------------ */
/* Manifesto                                                           */
/* ------------------------------------------------------------------ */

type Icone = { src: string; sizes: string; type: string; purpose?: string };
type Manifesto = {
  name: string; short_name: string; lang: string; start_url: string; display: string;
  theme_color: string; background_color: string; icons: Icone[];
};

function faltasNoManifesto(m: Partial<Manifesto>): string[] {
  const faltas: string[] = [];
  if (!m.name) faltas.push("name");
  if (m.short_name !== "DC360") faltas.push('short_name "DC360"');
  if (m.lang !== "pt-BR") faltas.push('lang "pt-BR"');
  if (m.start_url !== "/") faltas.push('start_url "/"');
  if (m.display !== "standalone") faltas.push('display "standalone"');
  if (!/^#[0-9A-Fa-f]{6}$/.test(m.theme_color ?? "")) faltas.push("theme_color");
  if (!/^#[0-9A-Fa-f]{6}$/.test(m.background_color ?? "")) faltas.push("background_color");
  const icones = m.icons ?? [];
  if (!icones.some((i) => i.sizes === "192x192" && i.type === "image/png")) faltas.push("ícone 192x192");
  if (!icones.some((i) => i.sizes === "512x512" && i.type === "image/png" && (i.purpose ?? "any") === "any")) faltas.push("ícone 512x512");
  if (!icones.some((i) => i.purpose === "maskable" && i.sizes === "512x512")) faltas.push("ícone mascarável 512x512");
  return faltas;
}

describe("manifest.webmanifest", () => {
  const caminho = join(PUBLICO, "manifest.webmanifest");

  it("existe, é JSON e cumpre cada campo, inclusive o ícone mascarável", () => {
    expect(existsSync(caminho), "public/manifest.webmanifest não existe").toBe(true);
    const manifesto = JSON.parse(readFileSync(caminho, "utf8")) as Manifesto;
    expect(faltasNoManifesto(manifesto)).toEqual([]);
    // As cores do manifesto são as mesmas do theme-color claro do index.html.
    expect(manifesto.theme_color.toUpperCase()).toBe(corDeFundoDoTema("claro"));
    expect(manifesto.background_color.toUpperCase()).toBe(corDeFundoDoTema("claro"));
  });

  it("o portão morde: sem o ícone mascarável, reprova só por ele", () => {
    const manifesto = JSON.parse(readFileSync(caminho, "utf8")) as Manifesto;
    const semMascaravel = { ...manifesto, icons: manifesto.icons.filter((i) => i.purpose !== "maskable") };
    expect(faltasNoManifesto(semMascaravel)).toEqual(["ícone mascarável 512x512"]);
  });

  it("todo ícone que o manifesto lista existe em public/", () => {
    const manifesto = JSON.parse(readFileSync(caminho, "utf8")) as Manifesto;
    for (const icone of manifesto.icons) {
      expect(icone.src.startsWith("/"), `src relativo no manifesto: ${icone.src}`).toBe(true);
      expect(existsSync(join(PUBLICO, icone.src)), `ícone listado e ausente: ${icone.src}`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Arquivos de marca no disco                                          */
/* ------------------------------------------------------------------ */

describe("os arquivos de marca existem no tamanho que o HTML e o manifesto declaram", () => {
  it.each([
    ["icone-192.png", 192, 192],
    ["icone-512.png", 512, 512],
    ["icone-mascaravel-512.png", 512, 512],
    ["apple-touch-icon.png", 180, 180],
  ])("%s tem %ix%i no cabeçalho IHDR", (nome, largura, altura) => {
    const caminho = join(PUBLICO, nome);
    expect(existsSync(caminho), `public/${nome} não existe`).toBe(true);
    expect(dimensoesDoPng(readFileSync(caminho))).toEqual({ largura, altura });
  });

  it("og.png tem exatamente o que og:image:width e og:image:height prometem", () => {
    const tags = tagsDoHead(INDEX);
    const largura = Number(achar(tags, "property", "og:image:width")!.content);
    const altura = Number(achar(tags, "property", "og:image:height")!.content);
    expect([largura, altura]).toEqual([1200, 630]);
    const caminho = join(PUBLICO, "og.png");
    expect(existsSync(caminho), "public/og.png não existe").toBe(true);
    expect(dimensoesDoPng(readFileSync(caminho))).toEqual({ largura, altura });
  });

  it("favicon.ico traz os quadros de 16, 32 e 48, cada um do tamanho que declara", () => {
    const caminho = join(PUBLICO, "favicon.ico");
    expect(existsSync(caminho), "public/favicon.ico não existe").toBe(true);
    const quadros = quadrosDoIco(readFileSync(caminho));
    expect(quadros.map((q) => q.declarado)).toEqual([16, 32, 48]);
    for (const quadro of quadros) {
      expect(dimensoesDoPng(quadro.imagem)).toEqual({ largura: quadro.declarado, altura: quadro.declarado });
    }
  });

  it("os SVG de origem existem e as cores neles carregam o nome do token ao lado", () => {
    for (const nome of ["icone.svg", "og.svg"]) {
      const svg = readFileSync(join(PUBLICO, nome), "utf8");
      const linhas = svg.split("\n");
      const semToken = linhas.filter((l) => /#[0-9A-Fa-f]{6}/.test(l) && !/--ds-/.test(l));
      expect(semToken, `${nome}: cor sem o nome do token na mesma linha:\n${semToken.join("\n")}`).toEqual([]);
    }
  });

  it("o leitor de PNG morde: cabeçalho com outro tamanho reprova, e o que não é PNG também", () => {
    expect(dimensoesDoPng(pngFalso(192, 192))).toEqual({ largura: 192, altura: 192 });
    expect(dimensoesDoPng(pngFalso(191, 192))).not.toEqual({ largura: 192, altura: 192 });
    expect(dimensoesDoPng(Buffer.from("<svg></svg>"))).toBeNull();
  });

  it("os ícones não são o mesmo PNG renomeado", () => {
    const comum = readFileSync(join(PUBLICO, "icone-512.png"));
    const mascaravel = readFileSync(join(PUBLICO, "icone-mascaravel-512.png"));
    expect(comum.equals(mascaravel), "o mascarável precisa ter fundo cheio; o comum, canto arredondado").toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* O que um buscador pode guardar                                      */
/* ------------------------------------------------------------------ */

describe("o que um buscador pode guardar", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("robots.txt permite a raiz", () => {
    const caminho = join(PUBLICO, "robots.txt");
    expect(existsSync(caminho), "public/robots.txt não existe").toBe(true);
    const texto = readFileSync(caminho, "utf8");
    expect(texto).toMatch(/^User-agent: \*$/m);
    expect(texto).toMatch(/^Allow: \/$/m);
    expect(texto).not.toMatch(/^Disallow: \/$/m);
  });

  it("as rotas públicas são exatamente as que ficam fora de <Protegida> em App.tsx", () => {
    const app = readFileSync(join(FONTE, "App.tsx"), "utf8");
    const corte = app.indexOf("<Route element={<Protegida>");
    expect(corte).toBeGreaterThan(0);
    const rotas = (trecho: string) =>
      [...trecho.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]!).filter((r) => r !== "*");

    const foraDaProtecao = rotas(app.slice(0, corte));
    const dentroDaProtecao = rotas(app.slice(corte));
    expect(foraDaProtecao.length).toBeGreaterThan(2);
    expect(dentroDaProtecao.length).toBeGreaterThan(5);

    for (const rota of foraDaProtecao) {
      expect(ehTelaInterna(rota), `${rota} é pública em App.tsx e está marcada como interna`).toBe(false);
    }
    for (const rota of dentroDaProtecao) {
      const exemplo = rota.replace(":id", "00000000-0000-4000-8000-000000000000");
      expect(ehTelaInterna(exemplo), `${rota} é protegida em App.tsx e está marcada como pública`).toBe(true);
    }
    // A raiz é pública (redireciona), e a tela de entrar também.
    expect(ROTAS_PUBLICAS.has("/")).toBe(true);
    expect(ROTAS_PUBLICAS.has("/entrar")).toBe(true);
  });

  it("marcarComoInterna coloca a meta noindex, não duplica, e tira ao voltar para a rota pública", () => {
    /* Um <head> de mentira: só o que a função usa. */
    const metas: Array<{ name: string; content: string; remove: () => void }> = [];
    const head = {
      querySelector: (seletor: string) => metas.find((m) => seletor.includes(`"${m.name}"`)) ?? null,
      append: (m: (typeof metas)[number]) => { metas.push(m); },
    };
    const createElement = () => {
      const meta = { name: "", content: "", remove: () => { metas.splice(metas.indexOf(meta), 1); } };
      return meta;
    };
    vi.stubGlobal("document", { head, createElement });

    marcarComoInterna(true);
    marcarComoInterna(true);
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ name: "robots", content: "noindex" });

    marcarComoInterna(false);
    expect(metas).toHaveLength(0);
    marcarComoInterna(false);
    expect(metas).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Título por tela                                                     */
/* ------------------------------------------------------------------ */

describe("título por tela", () => {
  it("compõe 'Tela · Defesa Civil 360', e só o produto quando não há tela", () => {
    expect(tituloDaAba("Ocorrências")).toBe("Ocorrências · Defesa Civil 360");
    expect(tituloDaAba()).toBe(PRODUTO);
    expect(tituloDaAba("")).toBe(PRODUTO);
    expect(tituloDaAba(PRODUTO)).toBe(PRODUTO);
    expect(tituloDaAba("Ocorrências")).not.toContain("\u2014");
  });

  it("toda tela que App.tsx roteia pede o próprio título com useTitulo", () => {
    /*
      `TrocaDeTela` já garante um título por rota (portão de acessibilidade),
      mas o título que a tela pede é o que sabe o protocolo, e é o que fica
      quando a tela muda de estado sem mudar de rota.
    */
    const app = readFileSync(join(FONTE, "App.tsx"), "utf8");
    const importadas = [...app.matchAll(/import \{([^}]+)\} from "\.\/paginas\/([A-Za-z]+)"/g)];
    expect(importadas.length).toBeGreaterThan(10);

    const faltas: string[] = [];
    for (const casou of importadas) {
      const arquivo = casou[2]!;
      const componentes = casou[1]!.split(",").map((c) => c.trim()).filter(Boolean);
      const fonte = readFileSync(join(FONTE, "paginas", `${arquivo}.tsx`), "utf8");
      const chamadas = (fonte.match(/\buseTitulo\(/g) ?? []).length;
      if (chamadas < componentes.length) {
        faltas.push(`${arquivo}.tsx: ${componentes.length} tela(s), ${chamadas} chamada(s) de useTitulo`);
      }
    }
    expect(faltas, "tela sem useTitulo:\n" + faltas.join("\n")).toEqual([]);
  });

  it("TrocaDeTela passa pelo mesmo formato e marca as telas internas", () => {
    const troca = readFileSync(join(FONTE, "componentes", "TrocaDeTela.tsx"), "utf8");
    expect(troca).toContain("tituloDaAba(");
    expect(troca).toContain("marcarComoInterna(ehTelaInterna(pathname))");
    expect(troca, "o formato do título tem dono: src/seo/titulo.ts").not.toMatch(/document\.title = .*\$\{/);
  });
});

/* ------------------------------------------------------------------ */
/* Vercel                                                              */
/* ------------------------------------------------------------------ */

describe("vercel.json", () => {
  it("dá cache longo a cada arquivo de marca", () => {
    const vercel = JSON.parse(readFileSync(join(RAIZ, "..", "..", "vercel.json"), "utf8")) as {
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const regras = vercel.headers ?? [];
    expect(regras.length).toBeGreaterThan(0);

    for (const arquivo of ["/icone-192.png", "/icone-512.png", "/icone-mascaravel-512.png", "/favicon.ico", "/og.png"]) {
      const regra = regras.find((r) => new RegExp(`^${r.source}$`).test(arquivo));
      expect(regra, `${arquivo} sem regra de cabeçalho em vercel.json`).toBeTruthy();
      const cache = regra!.headers.find((h) => h.key.toLowerCase() === "cache-control")?.value ?? "";
      const maxAge = Number(/max-age=(\d+)/.exec(cache)?.[1] ?? 0);
      expect(maxAge, `${arquivo}: max-age curto demais (${cache})`).toBeGreaterThanOrEqual(30 * 24 * 3600);
    }
  });
});
