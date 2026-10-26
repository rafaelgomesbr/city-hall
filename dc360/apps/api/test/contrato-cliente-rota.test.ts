import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { ROTAS_DO_CONTRATO, type RotaComGrupo } from "../src/contrato/rotas.js";
import { construirServidor } from "../src/servidor.js";
import { semPrefixoDeVersao } from "../src/versao-v1.js";
import { JS_DO_CONSOLE } from "../../console/src/pagina.js";
import {
  chamarComOpcoes,
  contarChamadas,
  extrairChamadas,
  fetchNaBase,
  pularGenerico,
  semComentarios,
  usosDeRedeDoGlobal,
  usosDeRedeFora,
  type Chamada,
  type Extracao,
  type FuncaoDeChamada,
  type Infra,
  type Perfil,
} from "./apoio/extrair-chamadas.js";
import { chavesDoEsquema } from "./apoio/esquemas.js";
import { chaveNormalizada, normalizarRota, rotasDaV1 } from "./apoio/rotas.js";
import { SEM_TOKEN } from "./superficie-registrada.js";

/**
 * Contrato cliente x rota (V2-F02-E05), que generaliza o mínimo do painel
 * (`contrato-do-painel.test.ts`, V2-F00-E23).
 *
 * O painel chamou `/pacote.zip` durante semanas, e a rota registrada era
 * `/saida/pacote.zip`. Nenhum teste punha lado a lado o que o cliente chama e o
 * que o servidor registra. Este arquivo faz isso para os TRÊS clientes:
 *
 *   - painel   `apps/web/src/dados/http.ts`
 *   - campo    `apps/campo/src/dados/{api,historico-da-casa,mapa,rota,foto-do-agente}.ts`
 *              e `packages/campo/src/transporte.ts` (a fila offline)
 *   - console  o script que o próprio console serve (`JS_DO_CONSOLE`), que fala
 *              com o servidor do console, e não com a API
 *
 * Lê cada cliente como TEXTO, tira de cada chamada o método e o caminho
 * (interpolação vira `:p`, query sai) e confronta com as rotas `/v1` do
 * servidor MONTADO (`printRoutes`), e não com uma lista copiada. Confere:
 *
 *   1. o caminho existe;
 *   2. o método bate com o da rota;
 *   3. o corpo e a consulta casam com o esquema do registro do contrato
 *      (`src/contrato/`) quando o registro o tem: nenhuma chave que o esquema
 *      não conheça, e toda chave obrigatória presente. Só se confere o que o
 *      texto do cliente mostra; o que vem de variável ou de expressão fica
 *      DECLARADO no relatório (`naoLidos`), não ignorado calado;
 *   4. pedido sem token só mira rota isenta de token (`SEM_TOKEN`);
 *   5. todo `fetch` de cliente passa por `chamar` ou pela base; `fetch` solto,
 *      fora da lista de URLs assinadas declaradas, reprova.
 *
 * Rotas `/v1` sem cliente saem num relatório e NÃO reprovam: há rota só de API
 * (a V2-F03 e a F11 criam as do portal e do cidadão). Com a variável
 * `RELATORIO_CONTRATO_CLIENTE_ROTA` apontando para um arquivo, o relatório é
 * gravado lá (é assim que a evidência da etapa é gerada).
 *
 * O corpo da RESPOSTA não é conferido aqui: é o `contrato-*-respostas.test.ts`.
 */

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const lerDoRepositorio = (caminho: string): string => readFileSync(join(RAIZ, caminho), "utf8");

// ---------------------------------------------------------------------------
// Os clientes: arquivo, perfil e piso de chamadas
// ---------------------------------------------------------------------------

type ArquivoDeCliente = {
  /** Caminho a partir de `dc360/`. */
  arquivo: string;
  perfil: Perfil;
  /** Piso do que a âncora conta no arquivo: contador que quebrasse e devolvesse zero passaria sem isto. */
  minimo: number;
};

type Cliente = {
  nome: "painel" | "campo" | "console";
  arquivos: readonly ArquivoDeCliente[];
};

const SEM_AUTORIZACAO = { tipo: "sem-authorization" } as const;

/** O `chamar` do painel e do campo. Painel: `semSessao: true`. Campo: sem a opção `token`. */
const CHAMAR_DO_PAINEL = chamarComOpcoes({ tipo: "opcao-verdadeira", chave: "semSessao" });
const CHAMAR_DO_CAMPO = chamarComOpcoes({ tipo: "sem-chave", chave: "token" });

/** `pedir(caminho, token)` de `historico-da-casa.ts`: só lê. */
const PEDIR_DO_HISTORICO: FuncaoDeChamada = {
  nome: "pedir",
  metodo: { onde: "fixo", valor: "GET" },
  corpo: { onde: "nenhum" },
  semToken: { tipo: "nunca" },
};

/** `chamar(caminho, corpo, metodo = "POST")` e `pedir(caminho, corpo, metodo, mensagem)` da fila offline. */
const posicionais = (nome: string): FuncaoDeChamada => ({
  nome,
  metodo: { onde: "posicional", indice: 2, padrao: "POST" },
  corpo: { onde: "posicional", indice: 1 },
  semToken: { tipo: "nunca" },
});

const CLIENTES: readonly Cliente[] = [
  {
    nome: "painel",
    arquivos: [
      {
        arquivo: "apps/web/src/dados/http.ts",
        perfil: { funcoes: [CHAMAR_DO_PAINEL, fetchNaBase(["BASE"])] },
        minimo: 70,
      },
    ],
  },
  {
    nome: "campo",
    arquivos: [
      {
        arquivo: "apps/campo/src/dados/api.ts",
        perfil: { funcoes: [CHAMAR_DO_CAMPO, fetchNaBase(["BASE"])] },
        minimo: 14,
      },
      {
        arquivo: "apps/campo/src/dados/historico-da-casa.ts",
        perfil: { funcoes: [PEDIR_DO_HISTORICO, fetchNaBase(["base"])] },
        minimo: 3,
      },
      {
        arquivo: "apps/campo/src/dados/mapa.ts",
        perfil: { funcoes: [fetchNaBase(["base"])] },
        minimo: 1,
      },
      {
        arquivo: "apps/campo/src/dados/rota.ts",
        perfil: { funcoes: [fetchNaBase(["base"])] },
        minimo: 1,
      },
      {
        arquivo: "apps/campo/src/dados/foto-do-agente.ts",
        perfil: {
          funcoes: [fetchNaBase(["base"])],
          assinadas: new Map([
            [
              "autorizacao.url",
              "PUT dos bytes da foto de perfil na URL assinada que `POST /usuarios/eu/foto/autorizar-envio` devolveu: " +
                "vai direto ao armazenamento, sem token, e a assinatura está na própria URL",
            ],
          ]),
        },
        minimo: 1,
      },
      {
        arquivo: "packages/campo/src/transporte.ts",
        perfil: {
          funcoes: [posicionais("chamar"), posicionais("pedir"), fetchNaBase(["base"], "buscar")],
          assinadas: new Map([
            [
              "url",
              "PUT dos bytes da evidência na URL assinada que `POST /evidencias/autorizar-envio` devolveu: " +
                "vai direto ao armazenamento, sem token, e a assinatura está na própria URL",
            ],
          ]),
        },
        minimo: 8,
      },
    ],
  },
  {
    nome: "console",
    arquivos: [
      {
        // O texto do script que o console serve (uma constante), não um arquivo lido do disco.
        arquivo: "apps/console/src/pagina.ts (JS_DO_CONSOLE)",
        perfil: {
          funcoes: [
            {
              nome: "pedir",
              metodo: { onde: "opcoes", chave: "method", padrao: "GET" },
              corpo: { onde: "opcoes", chave: "body", json: true },
              semToken: SEM_AUTORIZACAO,
            },
            {
              nome: "pedirComSessao",
              metodo: { onde: "posicional", indice: 1, padrao: "GET" },
              corpo: { onde: "posicional", indice: 2 },
              semToken: { tipo: "nunca" },
            },
            fetchNaBase(["BASE_DA_API"]),
          ],
        },
        minimo: 17,
      },
    ],
  },
];

/**
 * Interpolações que não são parâmetro de rota e sim um nome FIXO de rota.
 *
 * `abrirDocumento` monta `/documentos/${ocorrenciaId}/${tipo}`, e a API não
 * registra `/documentos/:id/:tipo`: registra uma rota por documento. O valor sai
 * da própria união `TipoDeDocumento` do painel, e cada valor precisa ter a sua
 * rota.
 */
function expansoesDoPainel(): Map<string, string[]> {
  const fonte = lerDoRepositorio("apps/web/src/dados/tipos.ts");
  const casou = /export type TipoDeDocumento =([^;]+);/.exec(fonte);
  if (!casou) throw new Error("união TipoDeDocumento não encontrada em tipos.ts");
  const valores = [...casou[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (valores.length === 0) throw new Error("união TipoDeDocumento sem valores");
  return new Map([["tipo", valores]]);
}

/** O texto do cliente, sem comentários, pronto para o extrator. */
function textoDoCliente(a: ArquivoDeCliente): string {
  return semComentarios(
    a.arquivo.includes("JS_DO_CONSOLE") ? JS_DO_CONSOLE : lerDoRepositorio(a.arquivo),
  );
}

/**
 * Chamadas cuja FORMA (corpo ou consulta) diverge do esquema do registro e que
 * são dívida declarada, cada uma com o motivo e a etapa que a resolve. Vazia
 * hoje. Entrada aqui é dívida, e o teste reprova a que deixou de ser usada.
 */
const EXCECOES_DE_FORMA = new Map<string, string>([]);

// ---------------------------------------------------------------------------
// Confronto com a API
// ---------------------------------------------------------------------------

type Registro = {
  /** `MÉTODO /caminho` normalizados das rotas do servidor que se confrontam. */
  rotas: Set<string>;
  /** caminho normalizado → métodos registrados nele (para dizer "o método está errado"). */
  metodosDoCaminho: Map<string, string[]>;
  /** Entrada do registro do contrato, por `MÉTODO /caminho` normalizado sem `/v1`. Só a API tem. */
  contrato: Map<string, RotaComGrupo>;
  /** Chaves isentas de token, normalizadas e sem `/v1`. Só a API tem. */
  semToken: Set<string> | null;
};

function montarRegistro(
  rotas: readonly { metodo: string; caminho: string }[],
  comContrato: boolean,
): Registro {
  const chaves = new Set<string>();
  const metodosDoCaminho = new Map<string, string[]>();
  for (const r of rotas) {
    const caminho = normalizarRota(r.caminho);
    chaves.add(`${r.metodo} ${caminho}`);
    metodosDoCaminho.set(caminho, [...(metodosDoCaminho.get(caminho) ?? []), r.metodo]);
  }
  return {
    rotas: chaves,
    metodosDoCaminho,
    contrato: comContrato
      ? new Map(
          ROTAS_DO_CONTRATO.map((r) => [
            chaveNormalizada(r.metodo, semPrefixoDeVersao(r.caminho)),
            r,
          ]),
        )
      : new Map(),
    semToken: comContrato
      ? new Set(
          [...SEM_TOKEN.keys()].map((k) => {
            const [m, c] = k.split(" ");
            return chaveNormalizada(m!, semPrefixoDeVersao(c!));
          }),
        )
      : null,
  };
}

type Situacao =
  "conferido" | "sem-esquema" | "sem-entrada" | "esquema-ilegivel" | "nao-lido" | "sem-dado";

type Linha = {
  chave: string;
  arquivo: string;
  linha: number;
  corpo: { situacao: Situacao; detalhe: string };
  consulta: { situacao: Situacao; detalhe: string };
};

type Resultado = {
  contadas: number;
  extraidas: number;
  infra: Infra[];
  naoLidas: string[];
  /** O caminho não existe (em nenhum método). */
  faltando: string[];
  /** O caminho existe, o método não. */
  metodoErrado: string[];
  semTokenForaDaIsencao: string[];
  /** Corpo ou consulta que o esquema do registro não aceita. */
  formaDivergente: string[];
  linhas: Linha[];
  usadas: Set<string>;
  excecoesUsadas: Set<string>;
};

function conferirForma(
  c: Chamada,
  entrada: RotaComGrupo | undefined,
  rotulo: string,
): Pick<Linha, "corpo" | "consulta"> & { divergencias: string[] } {
  const divergencias: string[] = [];
  const corpo = { situacao: "sem-dado" as Situacao, detalhe: "" };
  const consulta = { situacao: "sem-dado" as Situacao, detalhe: "" };

  if (!entrada) {
    corpo.situacao = consulta.situacao = "sem-entrada";
    corpo.detalhe = consulta.detalhe = "a rota ainda está em `pendentes` do registro";
    return { corpo, consulta, divergencias };
  }

  // Corpo
  if (!entrada.corpo) {
    corpo.situacao =
      c.corpo.tipo === "literal" && c.corpo.chaves.length > 0 ? "sem-esquema" : "sem-dado";
    corpo.detalhe =
      corpo.situacao === "sem-esquema" ? "o registro não descreve corpo para esta rota" : "";
  } else {
    const esquema = chavesDoEsquema(entrada.corpo);
    if (!esquema) {
      corpo.situacao = "esquema-ilegivel";
      corpo.detalhe = "o esquema do corpo não é um objeto simples (união, união discriminada...)";
    } else if (c.corpo.tipo === "ilegivel") {
      corpo.situacao = "nao-lido";
      corpo.detalhe = c.corpo.motivo;
    } else {
      const escritas = c.corpo.tipo === "literal" ? c.corpo.chaves : [];
      const possiveis = c.corpo.tipo === "literal" ? c.corpo.possiveis : [];
      const desconhecidas = esquema.aceitaOutras
        ? []
        : escritas.filter((k) => !esquema.chaves.has(k));
      const faltam = [...esquema.chaves]
        .filter(([k, obrigatoria]) => obrigatoria && !possiveis.includes(k))
        .map(([k]) => k);
      if (desconhecidas.length)
        divergencias.push(
          `${rotulo}: corpo com chave que o esquema não conhece: ${desconhecidas.join(", ")}`,
        );
      if (faltam.length)
        divergencias.push(`${rotulo}: corpo sem a chave obrigatória: ${faltam.join(", ")}`);
      corpo.situacao = "conferido";
      corpo.detalhe = `${escritas.length} chave(s) no literal contra ${esquema.chaves.size} do esquema`;
    }
  }

  // Consulta
  if (!entrada.consulta) {
    consulta.situacao = c.consulta.chaves.length > 0 ? "sem-esquema" : "sem-dado";
    consulta.detalhe =
      consulta.situacao === "sem-esquema" ? "o registro não descreve consulta para esta rota" : "";
  } else {
    const esquema = chavesDoEsquema(entrada.consulta);
    if (!esquema) {
      consulta.situacao = "esquema-ilegivel";
      consulta.detalhe = "o esquema da consulta não é um objeto simples";
    } else {
      const desconhecidas = esquema.aceitaOutras
        ? []
        : c.consulta.chaves.filter((k) => !esquema.chaves.has(k));
      if (desconhecidas.length)
        divergencias.push(
          `${rotulo}: consulta com chave que o esquema não conhece: ${desconhecidas.join(", ")}`,
        );
      if (c.consulta.dinamica) {
        consulta.situacao = "nao-lido";
        consulta.detalhe =
          "a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas";
      } else {
        const faltam = [...esquema.chaves]
          .filter(([k, obrigatoria]) => obrigatoria && !c.consulta.chaves.includes(k))
          .map(([k]) => k);
        if (faltam.length)
          divergencias.push(`${rotulo}: consulta sem a chave obrigatória: ${faltam.join(", ")}`);
        consulta.situacao = "conferido";
        consulta.detalhe = `${c.consulta.chaves.length} chave(s) no texto contra ${esquema.chaves.size} do esquema`;
      }
    }
  }
  return { corpo, consulta, divergencias };
}

export function conferirArquivo(
  fonte: string,
  arquivo: string,
  perfil: Perfil,
  registro: Registro,
  exp: Map<string, string[]> = new Map(),
  extrair: (f: string) => Extracao = (f) => extrairChamadas(f, perfil, exp),
): Resultado {
  const { chamadas, infra, naoLidas } = extrair(fonte);
  const r: Resultado = {
    contadas: contarChamadas(fonte, perfil),
    extraidas: chamadas.length,
    infra,
    naoLidas,
    faltando: [],
    metodoErrado: [],
    semTokenForaDaIsencao: [],
    formaDivergente: [],
    linhas: [],
    usadas: new Set(),
    excecoesUsadas: new Set(),
  };

  for (const c of chamadas) {
    for (const caminho of c.caminhos) {
      const chave = `${c.metodo} ${caminho}`;
      const rotulo = `${chave} (${arquivo} linha ${c.linha})`;
      if (!registro.rotas.has(chave)) {
        const outros = registro.metodosDoCaminho.get(caminho);
        if (outros) r.metodoErrado.push(`${rotulo}: a rota existe, mas com ${outros.join("/")}`);
        else r.faltando.push(rotulo);
        continue;
      }
      r.usadas.add(chave);
      if (c.semToken && registro.semToken && !registro.semToken.has(chave)) {
        r.semTokenForaDaIsencao.push(rotulo);
      }
      if (registro.semToken === null) {
        r.linhas.push({
          chave,
          arquivo,
          linha: c.linha,
          corpo: { situacao: "sem-dado", detalhe: "o console não tem registro de contrato" },
          consulta: { situacao: "sem-dado", detalhe: "" },
        });
        continue;
      }
      const forma = conferirForma(c, registro.contrato.get(chave), rotulo);
      r.linhas.push({
        chave,
        arquivo,
        linha: c.linha,
        corpo: forma.corpo,
        consulta: forma.consulta,
      });
      for (const d of forma.divergencias) {
        if (EXCECOES_DE_FORMA.has(chave)) r.excecoesUsadas.add(chave);
        else r.formaDivergente.push(d);
      }
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// O servidor de verdade
// ---------------------------------------------------------------------------

let mem: BancoEmMemoria;
let app: FastifyInstance;
let registroDaApi: Registro;
let registroDoConsole: Registro;
let rotasDaApi: { metodo: string; caminho: string }[];

/**
 * As rotas que o servidor do console registra, lidas do texto de `servidor.ts`.
 *
 * O console não tem registro de contrato nem dá para montá-lo aqui sem o banco
 * e a semente do dono (o apoio de teste do console existe para isso, e roda no
 * `test:console`); então as rotas saem do texto de `rotas.<verbo>(...)`. A
 * leitura tem a mesma defesa dos clientes: a contagem de TODA ocorrência de
 * `rotas.<verbo>` tem de bater com a de rotas lidas (rota com genérico de
 * tipos, `rotas.get<{ Params: ... }>(`, já foi esquecida por uma leitura
 * ingênua), e o registro sob `/v1` é conferido no texto.
 */
function rotasDoConsole(): { metodo: string; caminho: string }[] {
  const fonte = semComentarios(lerDoRepositorio("apps/console/src/servidor.ts"));
  const ocorrencias = [...fonte.matchAll(/\brotas\.(get|post|put|patch|delete)\b/g)];
  const rotas: { metodo: string; caminho: string }[] = [];
  for (const o of ocorrencias) {
    let k = o.index! + o[0].length;
    while (/\s/.test(fonte[k] ?? "")) k++;
    if (fonte[k] === "<") k = pularGenerico(fonte, k);
    while (/\s/.test(fonte[k] ?? "")) k++;
    if (fonte[k] !== "(") continue;
    k++;
    while (/\s/.test(fonte[k] ?? "")) k++;
    const literal = /^"([^"]+)"/.exec(fonte.slice(k, k + 200));
    if (literal) rotas.push({ metodo: o[1]!.toUpperCase(), caminho: literal[1]! });
  }
  if (rotas.length !== ocorrencias.length) {
    throw new Error(
      `servidor.ts do console tem ${ocorrencias.length} rotas e o teste leu ${rotas.length}`,
    );
  }
  // O que dá o `/v1` a estas rotas: o registro duplo por função única.
  if (!/registrarRotasDeNegocio\(v1\)[\s\S]{0,40}prefix:\s*"\/v1"/.test(fonte)) {
    throw new Error(
      "servidor.ts do console não registra as rotas de negócio sob /v1 como o teste espera",
    );
  }
  return rotas;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-contrato-de-cliente-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  rotasDaApi = rotasDaV1(app);
  registroDaApi = montarRegistro(rotasDaApi, true);
  registroDoConsole = montarRegistro(rotasDoConsole(), false);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

const registroDe = (c: Cliente): Registro =>
  c.nome === "console" ? registroDoConsole : registroDaApi;

/** O resultado de cada arquivo de cliente, calculado uma vez. */
const resultados = new Map<string, Resultado>();
function resultadoDe(c: Cliente, a: ArquivoDeCliente): Resultado {
  let r = resultados.get(a.arquivo);
  if (!r) {
    r = conferirArquivo(
      textoDoCliente(a),
      a.arquivo,
      a.perfil,
      registroDe(c),
      c.nome === "painel" ? expansoesDoPainel() : new Map(),
    );
    resultados.set(a.arquivo, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Leitura do servidor e do registro
// ---------------------------------------------------------------------------

describe("As rotas que os clientes confrontam foram lidas", () => {
  it("a árvore /v1 da API foi lida e traz o prefixo da saída", () => {
    // Âncora do lado do servidor: se a leitura de `printRoutes` quebrar, o
    // conjunto fica vazio e TODO caminho reprovaria; o contrário (conjunto
    // cheio de lixo) é o que este par de verificações impede.
    expect(registroDaApi.rotas.size).toBeGreaterThan(80);
    expect(registroDaApi.rotas.has("POST /saida/pacote.zip")).toBe(true);
    expect(registroDaApi.rotas.has("POST /pacote.zip")).toBe(false);
    // O espelho sem prefixo fica de fora: o contrato é contra a versão.
    expect(rotasDaApi.every((r) => !r.caminho.startsWith("/v1"))).toBe(true);
  });

  it("o registro do contrato foi lido e cobre a maior parte das rotas", () => {
    const comEntrada = [...registroDaApi.rotas].filter((k) => registroDaApi.contrato.has(k));
    expect(registroDaApi.contrato.size).toBeGreaterThan(90);
    expect(comEntrada.length).toBeGreaterThan(90);
    // O servidor registra `/x` e `/x/`; depois da normalização são uma rota só.
    expect(registroDaApi.rotas.has("GET /avisos/")).toBe(false);
  });

  it("as rotas do console foram lidas de servidor.ts", () => {
    expect(registroDoConsole.rotas.size).toBeGreaterThanOrEqual(15);
    expect(registroDoConsole.rotas.has("POST /municipios/:p/suspender")).toBe(true);
    expect(registroDoConsole.rotas.has("POST /entrar")).toBe(true);
    expect(registroDoConsole.rotas.has("GET /municipios")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Os clientes
// ---------------------------------------------------------------------------

for (const cliente of CLIENTES) {
  describe(`Tudo o que o ${cliente.nome} chama existe, com o método e a forma certos`, () => {
    for (const arquivo of cliente.arquivos) {
      describe(arquivo.arquivo, () => {
        it("toda chamada foi lida pelo extrator", () => {
          expect(
            resultadoDe(cliente, arquivo).naoLidas,
            "chamada que o extrator não soube ler",
          ).toEqual([]);
        });

        it("o caminho existe na API", () => {
          expect(
            resultadoDe(cliente, arquivo).faltando,
            "o cliente chama rota que o servidor não registra",
          ).toEqual([]);
        });

        it("o método bate com o da rota", () => {
          expect(
            resultadoDe(cliente, arquivo).metodoErrado,
            "o cliente chama a rota com outro método",
          ).toEqual([]);
        });

        it("o corpo e a consulta casam com o esquema do registro", () => {
          expect(resultadoDe(cliente, arquivo).formaDivergente).toEqual([]);
        });

        it("o que sai sem token mira rota isenta de token", () => {
          // Este caso não concede nem testa acesso: confere só que nenhum
          // pedido sem token do cliente mira rota que o portão de superfície
          // exige protegida.
          expect(resultadoDe(cliente, arquivo).semTokenForaDaIsencao).toEqual([]);
        });

        it("âncora: a extração alcança todas as chamadas contadas por outro caminho", () => {
          const r = resultadoDe(cliente, arquivo);
          expect(r.contadas).toBeGreaterThanOrEqual(arquivo.minimo);
          expect(r.extraidas + r.infra.length).toBe(r.contadas);
        });
      });
    }

    it("o cliente tem chamadas de verdade (não é um conjunto vazio que passa)", () => {
      const extraidas = cliente.arquivos.reduce((t, a) => t + resultadoDe(cliente, a).extraidas, 0);
      const piso = { painel: 70, campo: 20, console: 15 }[cliente.nome];
      expect(extraidas).toBeGreaterThanOrEqual(piso);
    });
  });
}

describe("Particularidades dos clientes", () => {
  const painel = CLIENTES[0]!;
  const http = painel.arquivos[0]!;

  it("o painel tem as três chamadas que são o próprio mecanismo, e só elas", () => {
    expect([...resultadoDe(painel, http).infra].sort()).toEqual([
      "definicao",
      "envio",
      "repeticao",
    ]);
  });

  it("os tipos de documento do painel se expandem em rotas que existem", () => {
    // Sem a expansão de `${tipo}` o extrator produziria `/documentos/:p/:p`,
    // que não é rota.
    const { chamadas } = extrairChamadas(textoDoCliente(http), http.perfil, expansoesDoPainel());
    const doc = chamadas.find((c) => c.caminhos.some((x) => x.startsWith("/documentos/")));
    expect(doc?.caminhos).toEqual(
      expect.arrayContaining(["/documentos/:p/laudo", "/documentos/:p/laudo.pdf"]),
    );
    expect(doc?.caminhos.length).toBe(expansoesDoPainel().get("tipo")!.length);
  });

  it("a fila offline do campo declara a URL assinada e nada mais fora da base", () => {
    const campo = CLIENTES[1]!;
    const transporte = campo.arquivos.find((a) => a.arquivo.endsWith("transporte.ts"))!;
    const r = resultadoDe(campo, transporte);
    expect(r.infra.filter((i) => i === "assinada")).toHaveLength(1);
  });

  it("o campo lê a versão mínima sem token e a rota está isenta", () => {
    const campo = CLIENTES[1]!;
    const chamadas = campo.arquivos.flatMap(
      (a) => extrairChamadas(textoDoCliente(a), a.perfil).chamadas,
    );
    const semToken = chamadas
      .filter((c) => c.semToken)
      .flatMap((c) => c.caminhos.map((p) => `${c.metodo} ${p}`));
    expect(semToken).toEqual(expect.arrayContaining(["POST /auth/entrar", "POST /auth/renovar"]));
  });
});

// ---------------------------------------------------------------------------
// Todo fetch de cliente passa por chamar ou pela base
// ---------------------------------------------------------------------------

/** Os diretórios de código de cliente, a partir de `dc360/`. */
const PASTAS_DE_CLIENTE = [
  "apps/web/src",
  "apps/campo/src",
  "packages/campo/src",
  "apps/console/src",
];

function arquivosDeCodigo(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "node_modules") continue;
      achados.push(...arquivosDeCodigo(caminho));
    } else if (/\.(ts|tsx|js|mjs)$/.test(nome) && !/\.(test|spec|d)\.(ts|tsx)$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/**
 * Arquivos de cliente que usam rede e NÃO são lidos pelo contrato, cada um com
 * a razão. `pagina.ts` do console é lido pelo texto exportado (`JS_DO_CONSOLE`),
 * e não pelo arquivo, porque o script está dentro de um template literal.
 */
const REDE_FORA_DO_CONTRATO = new Map<string, string>([
  [
    "apps/console/src/pagina.ts",
    "o script do console é um template literal; o contrato lê o texto exportado (`JS_DO_CONSOLE`), com a mesma regra",
  ],
]);

describe("Todo fetch de cliente passa por chamar ou pela base", () => {
  const cobertos = new Set(CLIENTES.flatMap((c) => c.arquivos.map((a) => a.arquivo)));

  it("nenhum arquivo de cliente usa rede sem estar na lista lida pelo contrato", () => {
    const soltos: string[] = [];
    for (const pasta of PASTAS_DE_CLIENTE) {
      for (const arquivo of arquivosDeCodigo(join(RAIZ, pasta))) {
        const rel = relative(RAIZ, arquivo).split("\\").join("/");
        if (cobertos.has(rel) || REDE_FORA_DO_CONTRATO.has(rel)) continue;
        for (const uso of usosDeRedeFora(readFileSync(arquivo, "utf8"))) {
          soltos.push(`${rel} linha ${uso.linha}: ${uso.texto.trim().slice(0, 80)}`);
        }
      }
    }
    expect(soltos, "chamada de rede fora de `chamar`/base e fora dos arquivos declarados").toEqual(
      [],
    );
  });

  it("arquivo coberto cujo perfil não declara fetch não chama fetch, nem qualificado (correção 1)", () => {
    const aChamar: string[] = [];
    for (const c of CLIENTES) {
      for (const a of c.arquivos) {
        if (a.perfil.funcoes.some((f) => f.nome === "fetch")) continue;
        for (const uso of usosDeRedeDoGlobal(textoDoCliente(a))) {
          aChamar.push(`${a.arquivo} linha ${uso.linha}: ${uso.texto.trim().slice(0, 80)}`);
        }
      }
    }
    expect(aChamar, "fetch em arquivo coberto cujo perfil só lê outras funções").toEqual([]);
  });

  it("toda lista de exceção tem razão escrita e arquivo que existe", () => {
    for (const [arquivo, razao] of REDE_FORA_DO_CONTRATO) {
      expect(razao.length, arquivo).toBeGreaterThan(30);
      expect(statSync(join(RAIZ, arquivo)).isFile()).toBe(true);
    }
    for (const c of CLIENTES) {
      for (const a of c.arquivos) {
        for (const [expressao, razao] of a.perfil.assinadas ?? []) {
          expect(razao.length, `${a.arquivo} ${expressao}`).toBeGreaterThan(30);
        }
      }
    }
  });

  it("o contrato lê tudo o que o console tem de chamada de rede", () => {
    const aoVivo = usosDeRedeFora(JS_DO_CONSOLE);
    // O único `fetch` do console é o de `pedir`, e ele passa pela base.
    expect(aoVivo).toHaveLength(1);
    expect(aoVivo[0]!.texto).toContain("BASE_DA_API");
  });

  it("toda assinada declarada é usada", () => {
    for (const c of CLIENTES) {
      for (const a of c.arquivos) {
        if (!a.perfil.assinadas) continue;
        expect(resultadoDe(c, a).infra, `assinada sem uso em ${a.arquivo}`).toContain("assinada");
      }
    }
  });
});

describe("Exceções de forma", () => {
  it("toda exceção é usada e tem motivo com etapa dona", () => {
    const usadas = new Set([...resultados.values()].flatMap((r) => [...r.excecoesUsadas]));
    for (const [chave, motivo] of EXCECOES_DE_FORMA) {
      expect(usadas.has(chave), `exceção morta: ${chave}`).toBe(true);
      expect(motivo, `exceção sem etapa dona: ${chave}`).toMatch(/V2-F\d\d-E\d\d/);
    }
  });
});

// ---------------------------------------------------------------------------
// Casos sintéticos: o teste teria pego o defeito
// ---------------------------------------------------------------------------

describe("Casos sintéticos: o teste teria pego o defeito", () => {
  const PERFIL_DO_PAINEL: Perfil = { funcoes: [CHAMAR_DO_PAINEL, fetchNaBase(["BASE"])] };
  const PERFIL_DO_CAMPO: Perfil = { funcoes: [CHAMAR_DO_CAMPO, fetchNaBase(["BASE"])] };
  const PERFIL_DA_FILA: Perfil = {
    funcoes: [posicionais("chamar"), posicionais("pedir"), fetchNaBase(["base"], "buscar")],
    assinadas: new Map([["url", "URL assinada de teste, declarada como a de transporte.ts"]]),
  };
  const conferir = (fonte: string, perfil: Perfil, registro = registroDaApi) =>
    conferirArquivo(fonte, "teste.ts", perfil, registro);

  it("o caminho certo do pacote passa (controle)", () => {
    const r = conferir(
      `chamar<Blob>("/saida/pacote.zip", { metodo: "POST", arquivo: true });`,
      PERFIL_DO_PAINEL,
    );
    expect(r.faltando).toEqual([]);
    expect(r.metodoErrado).toEqual([]);
    expect(r.extraidas).toBe(1);
  });

  it("POST /pacote.zip, o defeito da E11, reprova contra o servidor montado", () => {
    const r = conferir(
      `chamar<Blob>("/pacote.zip", { metodo: "POST", arquivo: true });`,
      PERFIL_DO_PAINEL,
    );
    expect(r.faltando).toEqual(["POST /pacote.zip (teste.ts linha 1)"]);
  });

  it("cliente GET contra rota POST reprova", () => {
    const r = conferir(`chamar<Blob>("/saida/pacote.zip", { arquivo: true });`, PERFIL_DO_PAINEL);
    expect(r.metodoErrado).toHaveLength(1);
    expect(r.metodoErrado[0]).toContain("GET /saida/pacote.zip");
    expect(r.metodoErrado[0]).toContain("POST");
  });

  it("chamada do campo sem rota reprova", () => {
    const r = conferir(
      `await chamar("/sincronizacao/nao-existe", { token, metodo: "POST", corpo: { a: 1 } });`,
      PERFIL_DO_CAMPO,
    );
    expect(r.faltando).toEqual(["POST /sincronizacao/nao-existe (teste.ts linha 1)"]);
  });

  it("chamada da fila offline sem rota, ou com método errado, reprova", () => {
    const semRota = conferir(
      `await chamar("/evidencias/nao-existe", { evidenciaId });`,
      PERFIL_DA_FILA,
    );
    expect(semRota.faltando).toHaveLength(1);
    const get = conferir(
      `await chamar("/evidencias/confirmar-envio", { evidenciaId }, "GET");`,
      PERFIL_DA_FILA,
    );
    expect(get.metodoErrado).toHaveLength(1);
    const certo = conferir(
      `await chamar("/evidencias/confirmar-envio", { evidenciaId });`,
      PERFIL_DA_FILA,
    );
    expect(certo.faltando).toEqual([]);
    expect(certo.metodoErrado).toEqual([]);
    expect(certo.formaDivergente).toEqual([]);
  });

  it("caminho com parâmetro faltando reprova", () => {
    const certo = conferir(
      'await chamar(`/ocorrencias/${id}/triagem`, { metodo: "POST", corpo: t });',
      PERFIL_DO_PAINEL,
    );
    expect(certo.faltando).toEqual([]);
    const semParametro = conferir(
      'await chamar(`/ocorrencias/triagem`, { metodo: "POST", corpo: t });',
      PERFIL_DO_PAINEL,
    );
    expect(semParametro.faltando).toEqual(["POST /ocorrencias/triagem (teste.ts linha 1)"]);
  });

  it("a rota do console só existe no console, e a do console não existe na API", () => {
    const perfilDoConsole = CLIENTES[2]!.arquivos[0]!.perfil;
    const certa = conferir(
      `pedirComSessao("/municipios", "GET");`,
      perfilDoConsole,
      registroDoConsole,
    );
    expect(certa.faltando).toEqual([]);
    const naApi = conferir(`pedirComSessao("/municipios", "GET");`, perfilDoConsole, registroDaApi);
    expect(naApi.faltando).toEqual(["GET /municipios (teste.ts linha 1)"]);
  });

  it("corpo com chave que o esquema não conhece reprova", () => {
    const r = conferir(
      `chamar("/auth/entrar", { metodo: "POST", semSessao: true, corpo: { email, senha, lembrar } });`,
      PERFIL_DO_PAINEL,
    );
    expect(r.formaDivergente).toHaveLength(1);
    expect(r.formaDivergente[0]).toContain("lembrar");
  });

  it("corpo sem a chave obrigatória reprova", () => {
    const r = conferir(
      `chamar("/auth/entrar", { metodo: "POST", semSessao: true, corpo: { email } });`,
      PERFIL_DO_PAINEL,
    );
    expect(r.formaDivergente).toHaveLength(1);
    expect(r.formaDivergente[0]).toContain("senha");
  });

  it("corpo que vem de variável fica declarado como não lido, e não como aprovado", () => {
    const r = conferir(
      'chamar(`/ocorrencias/${id}/triagem`, { metodo: "POST", corpo: t });',
      PERFIL_DO_PAINEL,
    );
    expect(r.formaDivergente).toEqual([]);
    expect(r.linhas[0]!.corpo.situacao).toBe("nao-lido");
  });

  it("consulta com chave obrigatória faltando reprova, e a dinâmica fica declarada", () => {
    // `GET /busca` exige `q`; o registro tem de dizer isso, ou o caso não prova nada.
    expect([
      ...(chavesDoEsquema(registroDaApi.contrato.get("GET /busca")?.consulta)?.chaves ?? []),
    ]).toContainEqual(["q", true]);
    const sem = conferir(`chamar("/busca");`, PERFIL_DO_PAINEL);
    expect(sem.formaDivergente).toHaveLength(1);
    expect(sem.formaDivergente[0]).toContain("consulta sem a chave obrigatória: q");
    const com = conferir("chamar(`/busca?q=${encodeURIComponent(q)}`);", PERFIL_DO_PAINEL);
    expect(com.formaDivergente).toEqual([]);
    expect(com.linhas[0]!.consulta.situacao).toBe("conferido");
    const errada = conferir("chamar(`/busca?q=${q}&pagina=2`);", PERFIL_DO_PAINEL);
    expect(errada.formaDivergente[0]).toContain(
      "consulta com chave que o esquema não conhece: pagina",
    );
    const dinamica = conferir("chamar(`/busca?${params.toString()}`);", PERFIL_DO_PAINEL);
    expect(dinamica.linhas[0]!.consulta.situacao).toBe("nao-lido");
  });

  it("pedido sem token em rota protegida reprova", () => {
    const r = conferir(`chamar("/ocorrencias", { semSessao: true });`, PERFIL_DO_PAINEL);
    expect(r.semTokenForaDaIsencao).toEqual(["GET /ocorrencias (teste.ts linha 1)"]);
    const livre = conferir(
      `chamar("/auth/entrar", { metodo: "POST", semSessao: true, corpo: { email, senha } });`,
      PERFIL_DO_PAINEL,
    );
    expect(livre.semTokenForaDaIsencao).toEqual([]);
  });

  it("fetch solto, fora da base e das assinadas declaradas, é chamada não lida", () => {
    const solto = conferir(
      `await fetch("https://exemplo.com.br/api/ocorrencias");`,
      PERFIL_DO_PAINEL,
    );
    expect(solto.naoLidas).toHaveLength(1);
    const variavel = conferir(`await fetch(endereco, { headers });`, PERFIL_DO_PAINEL);
    expect(variavel.naoLidas).toHaveLength(1);
    const outraBase = conferir("await fetch(`${OUTRA}/ocorrencias`);", PERFIL_DO_PAINEL);
    expect(outraBase.naoLidas).toHaveLength(1);
    const naBase = conferir(
      "await fetch(`${BASE}/ocorrencias`, { headers: { authorization: x } });",
      PERFIL_DO_PAINEL,
    );
    expect(naBase.naoLidas).toEqual([]);
    expect(naBase.faltando).toEqual([]);
  });

  it.each(["globalThis", "window", "self"])(
    "%s.fetch(...) em arquivo coberto conta, é extraído e é conferido (correção 1)",
    (global) => {
      const certa = conferir(
        `await ${global}.fetch(\`\${BASE}/ocorrencias\`, { method: "GET" });`,
        PERFIL_DO_PAINEL,
      );
      expect(certa.contadas).toBe(1);
      expect(certa.extraidas).toBe(1);
      expect(certa.faltando).toEqual([]);
      // O defeito da revisão: rota que não existe, chamada pela forma qualificada, passava calada.
      const inexistente = conferir(
        `await ${global}.fetch(\`\${BASE}/rota-que-nao-existe\`, { method: "DELETE" });`,
        PERFIL_DO_PAINEL,
      );
      expect(inexistente.contadas).toBe(1);
      expect(inexistente.extraidas).toBe(1);
      expect(inexistente.faltando).toHaveLength(1);
      // Fora da base e de variável, a forma qualificada também é chamada não lida.
      const solta = conferir(
        `await ${global}.fetch("https://exemplo.com.br/api/x");`,
        PERFIL_DO_PAINEL,
      );
      expect(solta.contadas).toBe(1);
      expect(solta.naoLidas).toHaveLength(1);
    },
  );

  it("o texto real do painel com uma chamada qualificada a rota inexistente acrescentada reprova", () => {
    const painel = CLIENTES[0]!;
    const arquivo = painel.arquivos[0]!;
    const base = resultadoDe(painel, arquivo);
    const com = conferirArquivo(
      `${textoDoCliente(arquivo)}\nawait globalThis.fetch(\`\${BASE}/rota-que-nao-existe\`, { method: "DELETE" });\n`,
      arquivo.arquivo,
      arquivo.perfil,
      registroDaApi,
      expansoesDoPainel(),
    );
    expect(com.contadas).toBe(base.contadas + 1);
    expect(com.extraidas).toBe(base.extraidas + 1);
    expect(com.faltando).toHaveLength(base.faltando.length + 1);
    expect(com.faltando.some((f) => f.includes("/rota-que-nao-existe"))).toBe(true);
  });

  it("fetch por colchetes (globalThis['fetch'](...)) conta e reprova como não lido", () => {
    const r = conferir(
      "await globalThis['fetch'](`${BASE}/rota-que-nao-existe`, { method: 'DELETE' });",
      PERFIL_DO_PAINEL,
    );
    expect(r.contadas).toBe(1);
    expect(r.extraidas).toBe(0);
    expect(r.naoLidas).toHaveLength(1);
  });

  it("método de outro objeto chamado fetch NÃO é o fetch global", () => {
    const r = conferir(
      "await cliente.fetch(`${BASE}/rota-que-nao-existe`); await a.globalThis.fetch(x);",
      PERFIL_DO_PAINEL,
    );
    expect(r.contadas).toBe(0);
    expect(r.extraidas).toBe(0);
    expect(r.naoLidas).toEqual([]);
  });

  it("a varredura de arquivo coberto acha fetch qualificado quando o perfil não declara fetch", () => {
    expect(usosDeRedeDoGlobal("await globalThis.fetch(url);")).toHaveLength(1);
    expect(usosDeRedeDoGlobal("await window.fetch(url);")).toHaveLength(1);
    expect(usosDeRedeDoGlobal("await self.fetch(url);")).toHaveLength(1);
    expect(usosDeRedeDoGlobal("await globalThis['fetch'](url);")).toHaveLength(1);
    expect(usosDeRedeDoGlobal("await fetch(url);")).toHaveLength(1);
    expect(usosDeRedeDoGlobal("const r = buscar(url); cliente.fetch(url);")).toEqual([]);
  });

  it("uma URL assinada só passa quando a expressão está declarada", () => {
    const declarada = conferir(
      `await buscar(url, { method: "PUT", body: corpo });`,
      PERFIL_DA_FILA,
    );
    expect(declarada.naoLidas).toEqual([]);
    expect(declarada.infra).toContain("assinada");
    const outra = conferir(
      `await buscar(endereco, { method: "PUT", body: corpo });`,
      PERFIL_DA_FILA,
    );
    expect(outra.naoLidas).toHaveLength(1);
  });

  it("fetch em arquivo que nenhum perfil declara é achado pela varredura", () => {
    expect(
      usosDeRedeFora("const r = await fetch(url);\n// fetch(comentario)\n * fetch(jsdoc)"),
    ).toHaveLength(1);
    expect(usosDeRedeFora("const x = new XMLHttpRequest();")).toHaveLength(1);
    expect(usosDeRedeFora("const r = buscar(`${base}/x`);")).toEqual([]);
  });

  it("comentário que cita a chamada não vira chamada", () => {
    const fonte = [
      "/* uma explicação",
      '   que fala de chamar("/inexistente") sem asterisco */',
      '// chamar("/outra-inexistente")',
      "const a = 1;",
    ].join("\n");
    const limpo = semComentarios(fonte);
    expect(limpo).not.toContain("inexistente");
    expect(limpo.split("\n")).toHaveLength(4);
    expect(contarChamadas(limpo, { funcoes: [CHAMAR_DO_PAINEL] })).toBe(0);
  });

  it("chamada que o extrator não lê aparece como não lida e fura a âncora", () => {
    const r = conferir('chamar<X>(caminhoMontado, { metodo: "POST" });', PERFIL_DO_PAINEL);
    expect(r.contadas).toBe(1);
    expect(r.extraidas).toBe(0);
    expect(r.naoLidas).toHaveLength(1);
  });

  it("extrator que perde uma chamada reprova a âncora", () => {
    const painel = CLIENTES[0]!;
    const arquivo = painel.arquivos[0]!;
    const perdeUma = (f: string) => {
      const e = extrairChamadas(f, arquivo.perfil, expansoesDoPainel());
      return { ...e, chamadas: e.chamadas.slice(0, -1) };
    };
    const r = conferirArquivo(
      textoDoCliente(arquivo),
      arquivo.arquivo,
      arquivo.perfil,
      registroDaApi,
      expansoesDoPainel(),
      perdeUma,
    );
    expect(r.extraidas + r.infra.length).toBe(r.contadas - 1);
    expect(r.extraidas + r.infra.length).not.toBe(r.contadas);
  });
});

// ---------------------------------------------------------------------------
// Rotas sem cliente: relatório, não reprovação
// ---------------------------------------------------------------------------

describe("Rotas /v1 sem cliente (relatório)", () => {
  it("lista as rotas que nenhum cliente chama e grava o relatório", () => {
    const usadasPorCliente = (nome: Cliente["nome"]): Set<string> =>
      new Set(
        CLIENTES.filter((c) => c.nome === nome).flatMap((c) =>
          c.arquivos.flatMap((a) => [...resultadoDe(c, a).usadas]),
        ),
      );
    const painel = usadasPorCliente("painel");
    const campo = usadasPorCliente("campo");
    const console_ = usadasPorCliente("console");

    const todas = [...registroDaApi.rotas].sort();
    const semCliente = todas.filter((k) => !painel.has(k) && !campo.has(k));
    const soPainel = todas.filter((k) => painel.has(k) && !campo.has(k));
    const soCampo = todas.filter((k) => campo.has(k) && !painel.has(k));
    const ambos = todas.filter((k) => campo.has(k) && painel.has(k));
    const consoleSemCliente = [...registroDoConsole.rotas].sort().filter((k) => !console_.has(k));

    // Âncoras do relatório: ele só tem valor se as contas fecham.
    expect(soPainel.length + soCampo.length + ambos.length + semCliente.length).toBe(todas.length);
    expect(painel.size).toBeGreaterThan(40);
    expect(campo.size).toBeGreaterThan(8);

    const linhas: string[] = [];
    const secao = (titulo: string, itens: string[]): void => {
      linhas.push(
        `## ${titulo} (${itens.length})`,
        "",
        ...(itens.length ? itens.map((i) => `- ${i}`) : ["- nenhuma"]),
        "",
      );
    };

    linhas.push(
      "# Contrato cliente x rota: relatório (V2-F02-E05)",
      "",
      `Rotas \`/v1\` registradas pelo servidor montado: ${todas.length}. Chamadas distintas (método e caminho) do painel: ${painel.size}; do campo: ${campo.size}; do console: ${console_.size} (de ${registroDoConsole.rotas.size} rotas do console).`,
      "",
      "Este relatório NÃO reprova nada: há rota só de API. Rafael marca as que deveriam ter cliente.",
      "",
    );
    secao("Rotas /v1 sem cliente (nem painel nem campo)", semCliente);
    secao("Rotas /v1 só do painel", soPainel);
    secao("Rotas /v1 só do campo", soCampo);
    secao("Rotas /v1 dos dois", ambos);
    secao("Rotas do console sem chamada no script do console", consoleSemCliente);

    linhas.push("## Chamadas por arquivo", "");
    linhas.push(
      "| Cliente | Arquivo | Chamadas lidas | Mecanismo (definição, repetição, envio, assinada) | Contadas por outro caminho |",
      "|---|---|---|---|---|",
    );
    for (const c of CLIENTES) {
      for (const a of c.arquivos) {
        const r = resultadoDe(c, a);
        linhas.push(
          `| ${c.nome} | \`${a.arquivo}\` | ${r.extraidas} | ${r.infra.length} (${[...r.infra].sort().join(", ") || "nenhum"}) | ${r.contadas} |`,
        );
      }
    }
    linhas.push("");

    const situacoes: Situacao[] = [
      "conferido",
      "sem-esquema",
      "sem-entrada",
      "esquema-ilegivel",
      "nao-lido",
      "sem-dado",
    ];
    // O console não tem registro de contrato: fica de fora destas contas.
    const daApi = CLIENTES.filter((c) => c.nome !== "console").flatMap((c) =>
      c.arquivos.map((a) => resultadoDe(c, a)),
    );
    const contar = (campo_: "corpo" | "consulta", s: Situacao): number =>
      daApi.reduce((t, r) => t + r.linhas.filter((l) => l[campo_].situacao === s).length, 0);
    linhas.push(
      "## O que foi conferido contra o esquema do registro (chamadas do painel e do campo; o console não tem registro)",
      "",
    );
    linhas.push("| Situação | Corpo | Consulta |", "|---|---|---|");
    for (const s of situacoes)
      linhas.push(`| ${s} | ${contar("corpo", s)} | ${contar("consulta", s)} |`);
    linhas.push(
      "",
      "- `conferido`: o texto do cliente mostrou as chaves e o esquema do registro as aceitou (sem chave desconhecida, com todas as obrigatórias).",
      "- `nao-lido`: o corpo vem de variável ou de expressão (ou a query é montada em tempo de execução): NÃO se leu estaticamente, e fica declarado aqui.",
      "- `sem-esquema` / `sem-entrada` / `esquema-ilegivel`: o registro não descreve o corpo ou a consulta, ou a rota está em `pendentes`, ou o esquema não é um objeto simples.",
      "- `sem-dado`: a chamada não manda corpo/consulta e a rota não exige.",
      "",
    );

    const naoLidos = daApi.flatMap((r) =>
      r.linhas
        .filter((l) => l.corpo.situacao === "nao-lido" || l.consulta.situacao === "nao-lido")
        .map(
          (l) =>
            `${l.chave} (${l.arquivo} linha ${l.linha}): ${l.corpo.situacao === "nao-lido" ? `corpo: ${l.corpo.detalhe}` : `consulta: ${l.consulta.detalhe}`}`,
        ),
    );
    secao("Corpos e consultas que não deu para ler estaticamente", naoLidos);

    const relatorio = linhas.join("\n");
    const destino = process.env["RELATORIO_CONTRATO_CLIENTE_ROTA"];
    if (destino) {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, relatorio, "utf8");
    }
    // Uma linha no terminal: o relatório inteiro é o arquivo de evidência.
    console.info(
      `contrato cliente x rota: ${todas.length} rotas /v1, ${semCliente.length} sem cliente; ` +
        `painel ${painel.size}, campo ${campo.size}, console ${console_.size} chamadas distintas`,
    );
  });
});
