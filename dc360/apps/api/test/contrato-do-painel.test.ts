import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { rotasRegistradas, SEM_TOKEN } from "./superficie-registrada.js";

/**
 * Contrato mínimo painel x API (V2-F00-E23).
 *
 * O painel chamou `/pacote.zip` durante semanas, e a rota registrada era
 * `/saida/pacote.zip`: o cliente foi escrito lendo `rotas/saida.ts` sem
 * conferir o prefixo que `servidor.ts` põe na frente. Nenhum teste viu, porque
 * nenhum teste punha lado a lado o que o cliente chama e o que o servidor
 * registra. Este arquivo faz isso, e só isso:
 *
 *   - lê `apps/web/src/dados/http.ts` como TEXTO e tira de cada `chamar(` e
 *     `fetch(` o método e o caminho (interpolação vira `:p`, query sai);
 *   - lê as rotas do servidor MONTADO, pela mesma leitura de `printRoutes` que
 *     `superficie.test.ts` usa, e não de uma lista copiada (lista copiada mente
 *     do mesmo jeito que o cliente mentiu);
 *   - exige que `MÉTODO caminho` exista entre as registradas.
 *
 * O extrator é por varredura de texto, e extrator de texto erra calado: se ele
 * deixar de ver uma chamada, o teste fica verde sobre menos do que devia. Por
 * isso a âncora conta as chamadas por um caminho independente (expressão
 * regular sobre as linhas que não são comentário) e reprova se a extração
 * devolver menos do que a contagem.
 *
 * Esta é a versão MÍNIMA: só o painel, só existência de rota. A F02-E05 a
 * generaliza para o app de campo e o console e a liga ao OpenAPI (F02-E04);
 * corpo e resposta não são validados aqui.
 */

const HTTP_DO_PAINEL = fileURLToPath(new URL("../../web/src/dados/http.ts", import.meta.url));
const TIPOS_DO_PAINEL = fileURLToPath(new URL("../../web/src/dados/tipos.ts", import.meta.url));

/**
 * Caminhos do painel que podem não existir na API, cada um com o motivo e a
 * etapa que resolve. Vazia hoje: tudo o que o painel chama existe. Entrada
 * aqui é dívida declarada, e o teste reprova a entrada que deixou de ser usada.
 */
const EXCECOES = new Map<string, string>([]);

/**
 * Interpolações que não são parâmetro de rota e sim um nome FIXO de rota.
 *
 * `abrirDocumento` monta `/documentos/${ocorrenciaId}/${tipo}`, e a API não
 * registra `/documentos/:id/:tipo`: registra uma rota por documento. Ler `tipo`
 * como `:p` reprovaria um caminho certo; ignorá-lo deixaria passar um tipo que
 * a API não emite. O valor sai da própria união `TipoDeDocumento` do painel, e
 * cada valor precisa ter a sua rota.
 */
function expansoes(): Map<string, string[]> {
  return new Map([["tipo", lerUniao(readFileSync(TIPOS_DO_PAINEL, "utf8"), "TipoDeDocumento")]]);
}

function lerUniao(fonte: string, nome: string): string[] {
  const casou = new RegExp(`export type ${nome} =([^;]+);`).exec(fonte);
  if (!casou) throw new Error(`união ${nome} não encontrada em tipos.ts`);
  const valores = [...casou[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (valores.length === 0) throw new Error(`união ${nome} sem valores`);
  return valores;
}

// ---------------------------------------------------------------------------
// Leitura do cliente
// ---------------------------------------------------------------------------

type Parte = { tipo: "texto" | "expr"; valor: string };

export type Chamada = {
  funcao: "chamar" | "fetch";
  linha: number;
  metodo: string;
  /** Um caminho normalizado, ou vários quando uma interpolação se expande. */
  caminhos: string[];
  /** Pedido feito sem token: `semSessao: true`, ou `fetch` sem `authorization`. */
  semToken: boolean;
};

type Infra = "definicao" | "repeticao" | "envio";

type Extracao = {
  chamadas: Chamada[];
  infra: Infra[];
  naoLidas: string[];
};

function linhaDe(fonte: string, i: number): number {
  return fonte.slice(0, i).split("\n").length;
}

/** Pula string ou template a partir da aspa em `i`; devolve o índice depois do fim. */
function pularLiteral(fonte: string, i: number): number {
  return lerLiteral(fonte, i).fim;
}

/**
 * Lê um literal de string. Template devolve as partes de texto e as
 * interpolações separadas, com aninhamento (template dentro de `${}`).
 */
function lerLiteral(fonte: string, i: number): { partes: Parte[]; fim: number } {
  const aspa = fonte[i]!;
  const partes: Parte[] = [];
  let texto = "";
  let j = i + 1;
  while (j < fonte.length) {
    const c = fonte[j]!;
    if (c === "\\") { texto += fonte.slice(j, j + 2); j += 2; continue; }
    if (c === aspa) {
      if (texto) partes.push({ tipo: "texto", valor: texto });
      return { partes, fim: j + 1 };
    }
    if (aspa === "`" && c === "$" && fonte[j + 1] === "{") {
      if (texto) partes.push({ tipo: "texto", valor: texto });
      texto = "";
      const inicio = j + 2;
      let k = inicio;
      let nivel = 1;
      while (k < fonte.length && nivel > 0) {
        const d = fonte[k]!;
        if (d === '"' || d === "'" || d === "`") { k = pularLiteral(fonte, k); continue; }
        if (d === "{") nivel++;
        else if (d === "}") nivel--;
        k++;
      }
      partes.push({ tipo: "expr", valor: fonte.slice(inicio, k - 1).trim() });
      j = k;
      continue;
    }
    texto += c;
    j++;
  }
  throw new Error(`literal sem fim na linha ${linhaDe(fonte, i)}`);
}

/** Índice depois do `>` que fecha o genérico em `i`, ignorando `=>`. */
function pularGenerico(fonte: string, i: number): number {
  let nivel = 0;
  let k = i;
  while (k < fonte.length) {
    const c = fonte[k]!;
    if (c === '"' || c === "'" || c === "`") { k = pularLiteral(fonte, k); continue; }
    if (c === "<") nivel++;
    else if (c === ">" && fonte[k - 1] !== "=") {
      nivel--;
      if (nivel === 0) return k + 1;
    }
    k++;
  }
  throw new Error(`genérico sem fim na linha ${linhaDe(fonte, i)}`);
}

/** Índice depois do `)` que fecha os argumentos abertos em `i`. */
function pularArgumentos(fonte: string, i: number): number {
  let nivel = 0;
  let k = i;
  while (k < fonte.length) {
    const c = fonte[k]!;
    if (c === '"' || c === "'" || c === "`") { k = pularLiteral(fonte, k); continue; }
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) return k + 1;
    }
    k++;
  }
  throw new Error(`chamada sem fim na linha ${linhaDe(fonte, i)}`);
}

/**
 * Transforma as partes do literal em caminho(s) de rota.
 *
 * Interpolação que ocupa um segmento inteiro vira `:p`; a que fica no fim e
 * monta query (`${x ? "?a=1" : ""}`) sai junto com a query; qualquer outra
 * forma é recusada, para nunca adivinhar um caminho.
 */
function montarCaminhos(partes: Parte[], exp: Map<string, string[]>): string[] | string {
  let caminhos = [""];
  for (let n = 0; n < partes.length; n++) {
    const p = partes[n]!;
    if (p.tipo === "texto") {
      const corte = p.valor.indexOf("?");
      const pedaco = corte >= 0 ? p.valor.slice(0, corte) : p.valor;
      caminhos = caminhos.map((c) => c + pedaco);
      if (corte >= 0) return caminhos;
      continue;
    }
    const anterior = caminhos[0]!;
    const seguinte = partes[n + 1];
    const fechaSegmento = !seguinte
      || (seguinte.tipo === "texto" && /^[/?]/.test(seguinte.valor));
    if (anterior.endsWith("/") && fechaSegmento) {
      const valores = exp.get(p.valor);
      caminhos = valores
        ? caminhos.flatMap((c) => valores.map((v) => c + v))
        : caminhos.map((c) => c + ":p");
      continue;
    }
    if (!seguinte && /["'`]\?/.test(p.valor)) return caminhos;
    return `interpolação que não é segmento nem query: \${${p.valor}}`;
  }
  return caminhos;
}

/**
 * Tira de `fonte` cada chamada ao servidor. Exportada só para os casos
 * sintéticos poderem trocá-la por uma que perde chamada e provar a âncora.
 */
export function extrairChamadas(fonte: string, exp: Map<string, string[]> = new Map()): Extracao {
  const chamadas: Chamada[] = [];
  const infra: Infra[] = [];
  const naoLidas: string[] = [];

  for (const casou of fonte.matchAll(/\b(chamar|fetch)\b/g)) {
    const funcao = casou[1] as "chamar" | "fetch";
    const inicio = casou.index!;
    const linha = linhaDe(fonte, inicio);
    const textoDaLinha = fonte.split("\n")[linha - 1]!.trim();
    if (/^(\*|\/\/|\/\*)/.test(textoDaLinha)) continue;

    let k = inicio + funcao.length;
    while (/\s/.test(fonte[k]!)) k++;
    if (fonte[k] === "<") {
      k = pularGenerico(fonte, k);
      while (/\s/.test(fonte[k]!)) k++;
    }
    if (fonte[k] !== "(") continue;

    if (/function\s+$/.test(fonte.slice(Math.max(0, inicio - 20), inicio))) {
      infra.push("definicao");
      continue;
    }

    const fimDosArgumentos = pularArgumentos(fonte, k);
    let a = k + 1;
    while (/\s/.test(fonte[a]!)) a++;
    const aspa = fonte[a];

    if (funcao === "chamar" && fonte.startsWith("caminho,", a)) {
      infra.push("repeticao");
      continue;
    }
    if (aspa !== '"' && aspa !== "'" && aspa !== "`") {
      naoLidas.push(`linha ${linha}: ${funcao} com caminho que não é literal`);
      continue;
    }

    const literal = lerLiteral(fonte, a);
    let partes = literal.partes;
    const opcoes = fonte.slice(literal.fim, fimDosArgumentos);

    if (funcao === "fetch") {
      if (partes[0]?.tipo !== "expr" || partes[0].valor !== "BASE") {
        naoLidas.push(`linha ${linha}: fetch que não começa por \${BASE}`);
        continue;
      }
      if (partes.length === 2 && partes[1]!.tipo === "expr" && partes[1]!.valor === "caminho") {
        infra.push("envio");
        continue;
      }
      partes = partes.slice(1);
    }
    if (partes[0]?.tipo !== "texto" || !partes[0].valor.startsWith("/")) {
      naoLidas.push(`linha ${linha}: caminho que não começa por /`);
      continue;
    }

    const caminhos = montarCaminhos(partes, exp);
    if (typeof caminhos === "string") {
      naoLidas.push(`linha ${linha}: ${caminhos}`);
      continue;
    }

    const chave = funcao === "chamar" ? "metodo" : "method";
    const metodoLiteral = new RegExp(`\\b${chave}\\s*:\\s*"([A-Z]+)"`).exec(opcoes);
    if (!metodoLiteral && new RegExp(`\\b${chave}\\b`).test(opcoes)) {
      naoLidas.push(`linha ${linha}: método que não é literal`);
      continue;
    }

    chamadas.push({
      funcao, linha, caminhos,
      metodo: metodoLiteral?.[1] ?? "GET",
      semToken: funcao === "chamar"
        ? /\bsemSessao\s*:\s*true\b/.test(opcoes)
        : !/authorization/.test(opcoes),
    });
  }
  return { chamadas, infra, naoLidas };
}

/**
 * A âncora: conta as chamadas sem o extrator, por expressão regular sobre as
 * linhas que não são comentário. Caminho independente de propósito: se os dois
 * usassem o mesmo código, um defeito nele enganaria os dois juntos.
 */
export function contarChamadas(fonte: string): number {
  return fonte
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .reduce((total, l) => total + (l.match(/\bchamar\s*[<(]|\bfetch\s*\(/g)?.length ?? 0), 0);
}

/** As três chamadas que são o próprio mecanismo, e não um endereço do produto. */
const INFRA_ESPERADA: Infra[] = ["definicao", "envio", "repeticao"];

function normalizarRota(caminho: string): string {
  return caminho.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":p");
}

function normalizarChave(chave: string): string {
  const [metodo, caminho] = chave.split(" ");
  return `${metodo} ${normalizarRota(caminho!)}`;
}

type Resultado = {
  contadas: number;
  extraidas: number;
  infra: Infra[];
  naoLidas: string[];
  faltando: string[];
  semTokenForaDaIsencao: string[];
  excecoesUsadas: Set<string>;
};

export function conferirContrato(
  fonte: string,
  registradas: Set<string>,
  extrair: (f: string) => Extracao = (f) => extrairChamadas(f, expansoes()),
): Resultado {
  const { chamadas, infra, naoLidas } = extrair(fonte);
  const isentas = new Set([...SEM_TOKEN.keys()].map(normalizarChave));
  const faltando: string[] = [];
  const semTokenForaDaIsencao: string[] = [];
  const excecoesUsadas = new Set<string>();

  for (const c of chamadas) {
    for (const caminho of c.caminhos) {
      const chave = `${c.metodo} ${caminho}`;
      if (!registradas.has(chave)) {
        if (EXCECOES.has(chave)) excecoesUsadas.add(chave);
        else faltando.push(`${chave} (http.ts linha ${c.linha})`);
      }
      if (c.semToken && registradas.has(chave) && !isentas.has(chave)) {
        semTokenForaDaIsencao.push(`${chave} (http.ts linha ${c.linha})`);
      }
    }
  }
  return {
    contadas: contarChamadas(fonte),
    extraidas: chamadas.length,
    infra, naoLidas, faltando, semTokenForaDaIsencao, excecoesUsadas,
  };
}

// ---------------------------------------------------------------------------
// O servidor de verdade
// ---------------------------------------------------------------------------

let mem: BancoEmMemoria;
let app: FastifyInstance;
let registradas: Set<string>;

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-contrato-do-painel-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  registradas = new Set(
    rotasRegistradas(app).map((r) => `${r.metodo} ${normalizarRota(r.caminho)}`),
  );
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Tudo o que o painel chama existe na API", () => {
  it("a árvore de rotas foi lida e traz o prefixo da saída", () => {
    // Âncora do lado do servidor: se a leitura de `printRoutes` quebrar, o
    // conjunto fica vazio e TODO caminho reprovaria; o contrário (conjunto
    // cheio de lixo) é o que este par de verificações impede.
    expect(registradas.size).toBeGreaterThan(50);
    expect(registradas.has("POST /saida/pacote.zip")).toBe(true);
    expect(registradas.has("POST /pacote.zip")).toBe(false);
  });

  it("cada chamada de dados/http.ts casa com MÉTODO e caminho registrados", () => {
    const r = conferirContrato(readFileSync(HTTP_DO_PAINEL, "utf8"), registradas);
    expect(r.naoLidas, "chamada que o extrator não soube ler").toEqual([]);
    expect(r.faltando, "o painel chama rota que a API não registra").toEqual([]);
  });

  it("âncora: a extração alcança todas as chamadas contadas", () => {
    const r = conferirContrato(readFileSync(HTTP_DO_PAINEL, "utf8"), registradas);
    // Piso absoluto: um contador que quebrasse e devolvesse zero empataria com
    // um extrator que também não vê nada. Hoje são 74 ocorrências no arquivo.
    expect(r.contadas).toBeGreaterThanOrEqual(70);
    expect([...r.infra].sort()).toEqual(INFRA_ESPERADA);
    expect(r.extraidas + r.infra.length).toBe(r.contadas);
  });

  it("o que o painel chama sem token está nas isenções de superficie.test.ts", () => {
    // Este teste não concede nem testa acesso: confere só que nenhum pedido
    // sem token do painel mira rota que o portão de superfície exige protegida.
    const r = conferirContrato(readFileSync(HTTP_DO_PAINEL, "utf8"), registradas);
    expect(r.semTokenForaDaIsencao).toEqual([]);
  });

  it("toda exceção declarada é usada e tem motivo com etapa dona", () => {
    const r = conferirContrato(readFileSync(HTTP_DO_PAINEL, "utf8"), registradas);
    for (const [chave, motivo] of EXCECOES) {
      expect(r.excecoesUsadas.has(chave), `exceção morta: ${chave}`).toBe(true);
      expect(motivo, `exceção sem etapa dona: ${chave}`).toMatch(/V2-F\d\d-E\d\d/);
    }
  });

  it("os tipos de documento se expandem em rotas que existem", () => {
    // Prova de que a expansão de `${tipo}` aconteceu: sem ela o extrator
    // produziria `/documentos/:p/:p`, que não é rota.
    const { chamadas } = extrairChamadas(readFileSync(HTTP_DO_PAINEL, "utf8"), expansoes());
    const doc = chamadas.find((c) => c.caminhos.some((x) => x.startsWith("/documentos/")));
    expect(doc?.caminhos).toEqual(expect.arrayContaining(["/documentos/:p/laudo", "/documentos/:p/laudo.pdf"]));
    expect(doc?.caminhos.length).toBe(expansoes().get("tipo")!.length);
  });
});

describe("Casos sintéticos: o teste teria pego o defeito", () => {
  const conferir = (fonte: string) => conferirContrato(fonte, registradas);

  it("o caminho certo do pacote passa (controle)", () => {
    const r = conferir(`chamar<Blob>("/saida/pacote.zip", { metodo: "POST", arquivo: true });`);
    expect(r.faltando).toEqual([]);
    expect(r.extraidas).toBe(1);
  });

  it("POST /pacote.zip, o defeito da E11, reprova", () => {
    const r = conferir(`chamar<Blob>("/pacote.zip", { metodo: "POST", arquivo: true });`);
    expect(r.faltando).toEqual(["POST /pacote.zip (http.ts linha 1)"]);
  });

  it("método errado no caminho certo reprova", () => {
    const r = conferir(`chamar<Blob>("/saida/pacote.zip", { arquivo: true });`);
    expect(r.faltando).toEqual(["GET /saida/pacote.zip (http.ts linha 1)"]);
  });

  it("caminho com parâmetro faltando reprova", () => {
    const certo = conferir("await chamar(`/ocorrencias/${id}/triagem`, { metodo: \"POST\", corpo: t });");
    expect(certo.faltando).toEqual([]);
    const semParametro = conferir("await chamar(`/ocorrencias/triagem`, { metodo: \"POST\", corpo: t });");
    expect(semParametro.faltando).toEqual(["POST /ocorrencias/triagem (http.ts linha 1)"]);
  });

  it("chamada que o extrator não lê aparece como não lida e fura a âncora", () => {
    const r = conferir("chamar<X>(caminhoMontado, { metodo: \"POST\" });");
    expect(r.contadas).toBe(1);
    expect(r.extraidas).toBe(0);
    expect(r.naoLidas).toHaveLength(1);
  });

  it("extrator que perde uma chamada reprova a âncora", () => {
    const fonte = readFileSync(HTTP_DO_PAINEL, "utf8");
    const perdeUma = (f: string) => {
      const e = extrairChamadas(f, expansoes());
      return { ...e, chamadas: e.chamadas.slice(0, -1) };
    };
    const r = conferirContrato(fonte, registradas, perdeUma);
    expect(r.extraidas + r.infra.length).toBe(r.contadas - 1);
    expect(r.extraidas + r.infra.length).not.toBe(r.contadas);
  });
});
