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
  } else {
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
  const operacao: Json = { tags: [r.grupo], summary: r.resumo };
  if (parametros.length > 0) operacao.parameters = parametros;
  if (r.corpo) {
    operacao.requestBody = {
      required: true,
      content: { "application/json": { schema: esquemaJson(r.corpo, "input") } },
    };
  }
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
