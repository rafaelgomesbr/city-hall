import { z, type ZodType } from "zod";
import { CODIGOS_DE_ERRO, erroDaApiSchema, type CodigoDeErro } from "@dc360/shared";
import {
  GRUPOS,
  ROTAS_DO_CONTRATO,
  ROTAS_PENDENTES,
  rotasSemResposta,
  type RotaComGrupo,
} from "./rotas.js";

/**
 * Gera o documento OpenAPI 3.1 do `/v1` a partir do registro de rotas
 * (`rotas.ts`) e dos esquemas Zod que ele aponta (V2-F02-E04).
 *
 * O documento é DERIVADO: `apps/api/openapi/v1.json` nunca se edita à mão, só
 * se regera (`npm run openapi --workspace @dc360/api`), e o teste reprova o
 * arquivo que difere do que esta função devolve. Não é rota da API: descreve a
 * superfície inteira e por isso fica só no repositório.
 *
 * Zod 4 converte para JSON Schema sozinho (`z.toJSONSchema`), no dialeto
 * 2020-12 que o OpenAPI 3.1 adota. Nenhuma dependência nova. O corpo, a query
 * e os parâmetros descrevem o que o servidor ACEITA (`io: "input"`: um esquema
 * com `transform` vale pela forma de entrada) e a resposta, o que ele DEVOLVE
 * (`io: "output"`).
 */

type Json = Record<string, unknown>;

export type DocumentoOpenApi = {
  openapi: "3.1.0";
  info: Json;
  paths: Record<string, Record<string, Json>>;
  components: { schemas: Record<string, Json> };
  [extensao: `x-${string}`]: unknown;
};

const SEM_RESPOSTA =
  "Resposta ainda não descrita no contrato (dívida listada em apps/api/PENDENCIAS.md).";

function esquemaJson(esquema: ZodType, io: "input" | "output"): Json {
  const bruto = z.toJSONSchema(esquema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "throw",
    reused: "inline",
    cycles: "throw",
  }) as Json;
  const { $schema: _ignorado, ...resto } = bruto;
  return resto;
}

/** Os parâmetros de um objeto Zod: um por propriedade, `in` path ou query. */
function parametrosDe(esquema: ZodType, onde: "path" | "query"): Json[] {
  const json = esquemaJson(esquema, "input");
  const propriedades = (json.properties ?? {}) as Record<string, Json>;
  const obrigatorias = new Set((json.required ?? []) as string[]);
  return Object.keys(propriedades)
    .sort()
    .map((nome) => ({
      name: nome,
      in: onde,
      required: onde === "path" ? true : obrigatorias.has(nome),
      schema: propriedades[nome],
    }));
}

/** `/v1/ocorrencias/:id` vira `/v1/ocorrencias/{id}`. */
export function caminhoOpenApi(caminho: string): string {
  return caminho.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function parametrosDoCaminho(caminho: string): string[] {
  return [...caminho.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
}

function respostasDe(r: RotaComGrupo): Json {
  const respostas: Record<string, Json> = {};
  const chave = `${r.metodo} ${r.caminho}`;

  if (r.resposta) {
    const { status, descricao, esquema, tipo } = r.resposta;
    const resposta: Json = { description: descricao };
    if (esquema) {
      resposta.content = { "application/json": { schema: esquemaJson(esquema, "output") } };
    } else if (tipo) {
      const conteudo = new Map<string, Json>([
        [tipo, { schema: { type: "string", format: "binary" } }],
      ]);
      resposta.content = Object.fromEntries(conteudo);
    }
    respostas[String(status)] = resposta;

    /* Os outros status de sucesso: o corpo é o da principal, salvo esquema próprio. */
    for (const outra of r.tambemResponde ?? []) {
      if (String(outra.status) in respostas) {
        throw new Error(
          `${chave}: o status ${outra.status} de \`tambemResponde\` repete outra resposta da entrada`,
        );
      }
      const adicional: Json = { description: outra.descricao };
      if (outra.resposta) {
        adicional.content = {
          "application/json": { schema: esquemaJson(outra.resposta, "output") },
        };
      } else if (resposta.content) {
        adicional.content = resposta.content;
      }
      respostas[String(outra.status)] = adicional;
    }
  } else {
    if ((r.tambemResponde ?? []).length > 0) {
      throw new Error(`${chave}: \`tambemResponde\` exige a \`resposta\` principal descrita`);
    }
    respostas.default = { description: SEM_RESPOSTA };
  }

  /* Os códigos do catálogo, agrupados pelo status com que a rota os escreve. */
  const porStatus = new Map<number, CodigoDeErro[]>();
  for (const codigo of r.erros ?? []) {
    const entrada = CODIGOS_DE_ERRO[codigo];
    for (const status of [
      entrada.status,
      ...(("tambemSai" in entrada && entrada.tambemSai) || []),
    ]) {
      porStatus.set(status, [...(porStatus.get(status) ?? []), codigo]);
    }
  }
  for (const status of [...porStatus.keys()].sort((a, b) => a - b)) {
    const codigos = porStatus.get(status)!;
    if (String(status) in respostas) {
      throw new Error(
        `${chave}: o status ${status} dos erros colide com uma resposta de sucesso da entrada`,
      );
    }
    respostas[String(status)] = {
      description: codigos.map((c) => `${c}: ${CODIGOS_DE_ERRO[c].titulo}`).join("; "),
      "x-codigos-de-erro": codigos,
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/ErroDaApi" } },
      },
    };
  }
  return respostas;
}

/* ---------------------------------------------------------------------------
   Regras que o JSON Schema não expressa (`refine` e `superRefine`).

   `z.toJSONSchema` descarta os refinamentos: o corpo `{ tipo: "outro" }` sem
   `tipoDescricao` passa pelo JSON Schema e é recusado pelo Zod. O documento
   não pode prometer mais do que a API aceita, então cada refinamento achado
   nas entradas (corpo, query e parâmetros, em qualquer profundidade) sai como
   `x-regras-adicionais` na operação e no esquema do corpo, com o campo e o
   texto da regra, e a `description` da operação repete o texto para quem lê o
   documento sem ferramenta. `operacoesSemAnotacaoDeRegras` é o guarda.
   ------------------------------------------------------------------------ */

export type RegraAdicional = {
  /** Onde o refinamento mora, em caminho de propriedades (vazio: no próprio esquema). */
  caminho: string;
  /** O campo a que a recusa se refere (o `path` do refinamento) ou `(corpo inteiro)`. */
  campo: string;
  /** O texto da regra, o mesmo que a API devolve quando recusa. */
  regra: string;
};

export type RegraAdicionalDaOperacao = RegraAdicional & { em: "corpo" | "consulta" | "parametros" };

const REGRA_SEM_TEXTO =
  "regra de validação própria do esquema, sem texto declarado: a API pode recusar um pedido " +
  "que as propriedades acima aceitam";

function ehEsquemaZod(valor: unknown): valor is ZodType {
  /* Esquema tem `safeParse`; o `check` de um refinamento tem `def` mas não tem `safeParse`. */
  return (
    typeof valor === "object" &&
    valor !== null &&
    "def" in valor &&
    typeof (valor as { safeParse?: unknown }).safeParse === "function"
  );
}

type DefDeCheck = { check?: string; path?: PropertyKey[]; error?: unknown };

/**
 * A definição de um `check` do Zod. O `refine` expõe `.def`; o `superRefine`
 * cria um check que guarda a definição numa propriedade própria NÃO enumerável
 * (a do próprio Zod, que a varredura de código-fonte da API proíbe escrever por
 * nome, e com razão: ela existe para as respostas do Node). Por isso se lê pelas
 * chaves próprias do objeto, sem citar nome nenhum.
 */
function defDoCheck(check: unknown): DefDeCheck | undefined {
  if (typeof check !== "object" || check === null) return undefined;
  const direto = (check as { def?: DefDeCheck }).def;
  if (direto && typeof direto === "object") return direto;
  for (const chave of Object.getOwnPropertyNames(check)) {
    const interno = (check as Record<string, unknown>)[chave];
    const def = (interno as { def?: DefDeCheck } | null)?.def;
    if (def && typeof def === "object") return def;
  }
  return undefined;
}

function textoDaRegra(erro: unknown): string {
  if (typeof erro === "string" && erro.trim()) return erro;
  if (typeof erro === "function") {
    try {
      const texto: unknown = (erro as (iss: unknown) => unknown)({});
      if (typeof texto === "string" && texto.trim()) return texto;
      const mensagem = (texto as { message?: unknown } | null)?.message;
      if (typeof mensagem === "string" && mensagem.trim()) return mensagem;
    } catch {
      /* a função esperava a ocorrência da recusa: cai no texto padrão */
    }
  }
  return REGRA_SEM_TEXTO;
}

/**
 * Todo `refine` e `superRefine` de um esquema Zod, em qualquer profundidade
 * (objeto dentro de lista, união, opcional, pipe...). Passeia pela definição
 * interna do Zod, sem depender do tipo de nó: toda propriedade que for esquema,
 * lista de esquemas ou mapa de esquemas (`shape`) é visitada.
 *
 * A visita é por CAMINHO, não por objeto: o mesmo esquema usado em dois campos
 * (o `pontoSchema` de `origem` e de `destino`) é uma regra em cada lugar e sai
 * duas vezes. Duas coisas impedem a repetição inútil: o par (esquema, caminho)
 * nunca é visitado duas vezes (união com a mesma opção repetida, `optional` em
 * volta do mesmo nó), e um esquema que já está na cadeia de quem o contém não
 * é visitado de novo (esquema recursivo, com `get` que devolve o próprio
 * esquema): sem isso o caminho cresceria para sempre.
 */
export function refinamentosDe(esquema: ZodType): RegraAdicional[] {
  const achadas: RegraAdicional[] = [];
  const vistos = new WeakMap<object, Set<string>>();
  const naCadeia = new Set<object>();

  const visitar = (no: ZodType, caminho: string[]): void => {
    const chaveDoCaminho = caminho.join(".");
    const jaNesteCaminho = vistos.get(no) ?? new Set<string>();
    if (naCadeia.has(no) || jaNesteCaminho.has(chaveDoCaminho)) return;
    jaNesteCaminho.add(chaveDoCaminho);
    vistos.set(no, jaNesteCaminho);
    naCadeia.add(no);
    const def = no.def as unknown as Record<string, unknown>;

    const checks = Array.isArray(def.checks) ? (def.checks as unknown[]) : [];
    for (const check of checks) {
      const d = defDoCheck(check);
      if (d?.check !== "custom") continue;
      const campo = [...caminho, ...(d.path ?? []).map(String)].join(".");
      achadas.push({
        caminho: chaveDoCaminho,
        campo: campo || "(corpo inteiro)",
        regra: textoDaRegra(d.error),
      });
    }

    for (const [chave, valor] of Object.entries(def)) {
      if (chave === "checks") continue;
      if (ehEsquemaZod(valor)) {
        visitar(valor, caminho);
      } else if (Array.isArray(valor)) {
        for (const item of valor) if (ehEsquemaZod(item)) visitar(item, caminho);
      } else if (typeof valor === "object" && valor !== null) {
        for (const [nome, filho] of Object.entries(valor)) {
          if (ehEsquemaZod(filho)) visitar(filho, [...caminho, nome]);
        }
      }
    }
    naCadeia.delete(no);
  };

  visitar(esquema, []);
  return achadas;
}

function regrasAdicionaisDe(r: RotaComGrupo): RegraAdicionalDaOperacao[] {
  const entradas = [
    ["corpo", r.corpo],
    ["consulta", r.consulta],
    ["parametros", r.parametros],
  ] as const;
  return entradas.flatMap(([em, esquema]) =>
    esquema ? refinamentosDe(esquema).map((regra) => ({ em, ...regra })) : [],
  );
}

function descricaoDasRegras(regras: readonly RegraAdicionalDaOperacao[]): string {
  const linhas = regras.map((x) => `${x.em}, campo ${x.campo}: ${x.regra}`);
  return (
    "Regras adicionais que o esquema JSON não expressa e a API aplica (um pedido que as " +
    `quebra é recusado mesmo com as propriedades corretas): ${linhas.join("; ")}.`
  );
}

/**
 * O guarda: as chaves `MÉTODO caminho` das entradas cujo esquema tem
 * refinamento e cuja operação no documento NÃO traz `x-regras-adicionais` com
 * uma anotação por refinamento. Vazia é verde.
 */
export function operacoesSemAnotacaoDeRegras(
  rotas: readonly RotaComGrupo[],
  documento: DocumentoOpenApi,
): string[] {
  const faltam: string[] = [];
  for (const r of rotas) {
    const esperadas = regrasAdicionaisDe(r).length;
    if (esperadas === 0) continue;
    const operacao = documento.paths[caminhoOpenApi(r.caminho)]?.[r.metodo.toLowerCase()];
    const anotadas = operacao?.["x-regras-adicionais"];
    if (!Array.isArray(anotadas) || anotadas.length !== esperadas) {
      faltam.push(`${r.metodo} ${r.caminho}`);
    }
  }
  return faltam;
}

function operacaoDe(r: RotaComGrupo): Json {
  const nomesDeCaminho = parametrosDoCaminho(r.caminho);
  const doCaminho = r.parametros ? parametrosDe(r.parametros, "path") : [];
  const declarados = doCaminho.map((p) => p.name as string).sort();
  if (JSON.stringify(declarados) !== JSON.stringify([...nomesDeCaminho].sort())) {
    throw new Error(
      `${r.metodo} ${r.caminho}: os parâmetros de caminho (${nomesDeCaminho.join(", ") || "nenhum"}) ` +
        `não batem com o esquema de \`parametros\` (${declarados.join(", ") || "nenhum"})`,
    );
  }

  const parametros = [...doCaminho, ...(r.consulta ? parametrosDe(r.consulta, "query") : [])];
  const regras = regrasAdicionaisDe(r);
  const operacao: Json = { tags: [r.grupo], summary: r.resumo };
  if (regras.length > 0) operacao.description = descricaoDasRegras(regras);
  if (parametros.length > 0) operacao.parameters = parametros;
  if (r.corpo) {
    const esquemaDoCorpo = esquemaJson(r.corpo, "input");
    const doCorpo = regras.filter((x) => x.em === "corpo");
    if (doCorpo.length > 0) {
      esquemaDoCorpo["x-regras-adicionais"] = doCorpo.map(({ em: _em, ...resto }) => resto);
    }
    operacao.requestBody = {
      /* Corpo que aceita `undefined` (`.optional()`, `.default()`) não é obrigatório. */
      required: !r.corpo.safeParse(undefined).success,
      content: { "application/json": { schema: esquemaDoCorpo } },
    };
  }
  if (regras.length > 0) operacao["x-regras-adicionais"] = regras;
  operacao.responses = respostasDe(r);
  if (!r.resposta) operacao["x-resposta-pendente"] = true;
  if (r.nova) operacao["x-nova"] = true;
  return operacao;
}

/** O documento inteiro, em memória e com a ordem das chaves estável. */
export function gerarOpenApi(
  rotas: readonly RotaComGrupo[] = ROTAS_DO_CONTRATO,
  pendentes: readonly string[] = ROTAS_PENDENTES.map((p) => p.chave),
): DocumentoOpenApi {
  const paths: Record<string, Record<string, Json>> = {};
  const ordenadas = [...rotas].sort(
    (a, b) => a.caminho.localeCompare(b.caminho, "en") || a.metodo.localeCompare(b.metodo, "en"),
  );
  for (const r of ordenadas) {
    const caminho = caminhoOpenApi(r.caminho);
    (paths[caminho] ??= {})[r.metodo.toLowerCase()] = operacaoDe(r);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "API do Defesa Civil 360",
      version: "1.0.0",
      description:
        "Contrato do /v1, gerado de apps/api/src/contrato. Documento derivado: não se edita à " +
        "mão (npm run openapi --workspace @dc360/api). Rota registrada sem entrada aparece em " +
        "`x-rotas-pendentes`; operação sem resposta descrita leva `x-resposta-pendente`.",
    },
    paths,
    components: { schemas: { ErroDaApi: esquemaJson(erroDaApiSchema, "output") } },
    "x-rotas-pendentes": [...pendentes].sort(),
  };
}

/** O texto exato do arquivo `v1.json`. */
export function serializarOpenApi(documento: DocumentoOpenApi): string {
  return `${JSON.stringify(documento, null, 2)}\n`;
}

/** O relatório das entradas existentes sem resposta e das rotas ainda sem entrada. */
export function relatorioDeRotasSemResposta(): string {
  const semResposta = rotasSemResposta();
  const linhas: string[] = [
    "Relatório do contrato /v1 (V2-F02-E04)",
    "",
    `Rotas com entrada: ${ROTAS_DO_CONTRATO.length}`,
    `Rotas ainda sem entrada (pendentes): ${ROTAS_PENDENTES.length}`,
    `Total sob /v1: ${ROTAS_DO_CONTRATO.length + ROTAS_PENDENTES.length}`,
    `Entradas existentes sem resposta descrita: ${semResposta.length}`,
    "",
    "Por grupo (entradas / com resposta / sem resposta / pendentes):",
  ];
  for (const g of GRUPOS) {
    const sem = semResposta.filter((r) => r.grupo === g.nome).length;
    linhas.push(
      `  ${g.nome}: ${g.rotas.length} / ${g.rotas.length - sem} / ${sem} / ${g.pendentes.length}`,
    );
  }
  linhas.push("", "Entradas existentes sem resposta:");
  for (const r of semResposta) linhas.push(`  [${r.grupo}] ${r.metodo} ${r.caminho}`);
  linhas.push("", "Rotas pendentes (sem entrada):");
  for (const p of ROTAS_PENDENTES) linhas.push(`  [${p.grupo}] ${p.chave}`);
  return `${linhas.join("\n")}\n`;
}
