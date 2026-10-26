import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import {
  chamarComOpcoes, contarChamadas, extrairChamadas, fetchNaBase, semComentarios,
  type Extracao, type Infra, type Perfil,
} from "./apoio/extrair-chamadas.js";
import { normalizarRota, rotasRegistradas } from "./apoio/rotas.js";
import { SEM_TOKEN } from "./superficie-registrada.js";

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
//
// O extrator e a âncora moram em `apoio/extrair-chamadas.ts` desde a
// V2-F02-E05, que o usa também para o campo e o console.

const PERFIL_DO_PAINEL: Perfil = {
  funcoes: [chamarComOpcoes({ tipo: "opcao-verdadeira", chave: "semSessao" }), fetchNaBase(["BASE"])],
};

/** Tira de `fonte` as chamadas do painel (já sem comentários). */
function extrair(fonte: string, exp: Map<string, string[]> = new Map()): Extracao {
  return extrairChamadas(semComentarios(fonte), PERFIL_DO_PAINEL, exp);
}

/** As três chamadas que são o próprio mecanismo, e não um endereço do produto. */
const INFRA_ESPERADA: Infra[] = ["definicao", "envio", "repeticao"];

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
  extrair_: (f: string) => Extracao = (f) => extrair(f, expansoes()),
): Resultado {
  const { chamadas, infra, naoLidas } = extrair_(fonte);
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
    contadas: contarChamadas(semComentarios(fonte), PERFIL_DO_PAINEL),
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
    const { chamadas } = extrair(readFileSync(HTTP_DO_PAINEL, "utf8"), expansoes());
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
      const e = extrair(f, expansoes());
      return { ...e, chamadas: e.chamadas.slice(0, -1) };
    };
    const r = conferirContrato(fonte, registradas, perdeUma);
    expect(r.extraidas + r.infra.length).toBe(r.contadas - 1);
    expect(r.extraidas + r.infra.length).not.toBe(r.contadas);
  });
});
