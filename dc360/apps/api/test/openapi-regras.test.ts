import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CANAIS_ENTRADA,
  SEVERIDADES,
  TIPO_A_CLASSIFICAR,
  aberturaOcorrenciaSchema,
  triagemSchema,
} from "@dc360/shared";
import {
  gerarOpenApi,
  operacoesSemAnotacaoDeRegras,
  refinamentosDe,
} from "../src/contrato/openapi.js";
import { ROTAS_DO_CONTRATO, type RotaComGrupo } from "../src/contrato/rotas.js";

/**
 * O que o JSON Schema NÃO expressa (V2-F02-E04, correção 1).
 *
 * `z.toJSONSchema` descarta `refine` e `superRefine`: o documento aceitaria um
 * corpo que a API recusa. O documento não pode prometer mais do que a API
 * aceita, então toda regra condicional de uma entrada sai ANOTADA
 * (`x-regras-adicionais`, com o campo e o texto da regra) na operação e no
 * esquema do corpo, e o corpo opcional sai com `required: false`.
 *
 * Arquivo à parte de `openapi.test.ts` porque este não sobe servidor.
 */

const abertura = {
  solicitanteNome: "Ana Souza",
  canalEntrada: CANAIS_ENTRADA[0],
  endereco: "Rua das Flores, 10",
  tipo: TIPO_A_CLASSIFICAR,
  descricao: "Barulho de rachadura na parede.",
};
const triagem = { severidade: SEVERIDADES[0], vulnerabilidadePresente: true };

type Operacao = {
  description?: string;
  "x-regras-adicionais"?: { em: string; campo: string; regra: string }[];
  requestBody?: {
    required: boolean;
    content: { "application/json": { schema: Record<string, unknown> } };
  };
};

const documento = gerarOpenApi();
const operacao = (caminho: string, metodo: string) =>
  (documento.paths[caminho] as Record<string, Operacao>)[metodo]!;

describe("regras condicionais que o JSON Schema perde", () => {
  it("o Zod recusa os dois corpos que o JSON Schema, sozinho, deixaria passar", () => {
    expect(aberturaOcorrenciaSchema.safeParse(abertura).success).toBe(false);
    expect(triagemSchema.safeParse(triagem).success).toBe(false);
    expect(
      aberturaOcorrenciaSchema.safeParse({ ...abertura, tipoDescricao: "Rachadura grande" })
        .success,
    ).toBe(true);
    // Os dois corpos satisfazem as propriedades e o `required` do esquema gerado:
    // só a regra condicional os recusa.
    const doc = documento.paths["/v1/ocorrencias"]!.post as unknown as Operacao;
    const requeridas = doc.requestBody!.content["application/json"].schema.required as string[];
    expect(requeridas.every((k) => k in abertura)).toBe(true);
  });

  it("a abertura com tipo `outro` anota a regra da descrição do tipo", () => {
    const op = operacao("/v1/ocorrencias", "post");
    expect(op["x-regras-adicionais"]).toEqual([
      expect.objectContaining({ em: "corpo", campo: "tipoDescricao" }),
    ]);
    expect(op["x-regras-adicionais"]![0]!.regra).toContain("Descreva em poucas palavras");
    expect(op.description).toContain("tipoDescricao");
    expect(op.requestBody!.content["application/json"].schema["x-regras-adicionais"]).toBeDefined();
  });

  it("a triagem com vulnerabilidade presente anota a regra da descrição", () => {
    const op = operacao("/v1/ocorrencias/{id}/triagem", "post");
    expect(op["x-regras-adicionais"]).toEqual([
      expect.objectContaining({ em: "corpo", campo: "vulnerabilidadeDescricao" }),
    ]);
    expect(op["x-regras-adicionais"]![0]!.regra).toContain(
      "Descreva a vulnerabilidade identificada",
    );
  });

  it("toda entrada real com refinamento nas entradas sai anotada, e a anotação cobre cada regra", () => {
    const comRegra = ROTAS_DO_CONTRATO.filter((r) =>
      [r.corpo, r.consulta, r.parametros].some((e) => e && refinamentosDe(e).length > 0),
    );
    expect(comRegra.length).toBeGreaterThanOrEqual(2);
    expect(operacoesSemAnotacaoDeRegras(ROTAS_DO_CONTRATO, documento)).toEqual([]);
    for (const r of comRegra) {
      const esperadas = [r.corpo, r.consulta, r.parametros].flatMap((e) =>
        e ? refinamentosDe(e) : [],
      );
      const op = (
        documento.paths[r.caminho.replace(/:([A-Za-z0-9_]+)/g, "{$1}")] as Record<string, Operacao>
      )[r.metodo.toLowerCase()]!;
      expect(op["x-regras-adicionais"]?.length, `${r.metodo} ${r.caminho}`).toBe(esperadas.length);
    }
  });

  it("achar refinamento aninhado: regra dentro de objeto interno também sai", () => {
    const interno = z
      .object({ a: z.string().optional(), b: z.string().optional() })
      .refine((v) => !!v.a || !!v.b, {
        message: "Informe a ou b",
        path: ["a"],
      });
    const externo = z.object({ itens: z.array(interno) });
    const achadas = refinamentosDe(externo);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]).toMatchObject({
      caminho: "itens",
      campo: "itens.a",
      regra: "Informe a ou b",
    });
  });

  it("esquema sintético com superRefine sem texto sai anotado e sem a anotação o guarda reprova", () => {
    const sintetica: RotaComGrupo = {
      metodo: "POST",
      caminho: "/v1/sintetica",
      resumo: "Rota de teste.",
      grupo: "teste",
      corpo: z.object({ x: z.number() }).superRefine((v, ctx) => {
        if (v.x < 0) ctx.addIssue({ code: "custom", message: "negativo" });
      }),
    };
    const doc = gerarOpenApi([sintetica], []);
    const op = (doc.paths["/v1/sintetica"] as Record<string, Operacao>).post!;
    expect(op["x-regras-adicionais"]).toHaveLength(1);
    expect(typeof op["x-regras-adicionais"]![0]!.regra).toBe("string");
    expect(op["x-regras-adicionais"]![0]!.regra.length).toBeGreaterThan(0);
    expect(operacoesSemAnotacaoDeRegras([sintetica], doc)).toEqual([]);

    delete op["x-regras-adicionais"];
    expect(operacoesSemAnotacaoDeRegras([sintetica], doc)).toEqual(["POST /v1/sintetica"]);
  });

  it("esquema sem refinamento não ganha anotação", () => {
    const simples: RotaComGrupo = {
      metodo: "POST",
      caminho: "/v1/simples",
      resumo: "Sem regra condicional.",
      grupo: "teste",
      corpo: z.object({ x: z.number() }),
    };
    const op = (gerarOpenApi([simples], []).paths["/v1/simples"] as Record<string, Operacao>).post!;
    expect(op["x-regras-adicionais"]).toBeUndefined();
  });
});

describe("corpo opcional", () => {
  const rota = (corpo: z.ZodType): RotaComGrupo => ({
    metodo: "POST",
    caminho: "/v1/corpo",
    resumo: "Corpo de teste.",
    grupo: "teste",
    corpo,
  });
  const requestBody = (corpo: z.ZodType) =>
    (gerarOpenApi([rota(corpo)], []).paths["/v1/corpo"] as Record<string, Operacao>).post!
      .requestBody!;

  it("corpo `.optional()` sai com required false", () => {
    expect(requestBody(z.object({ a: z.string() }).optional()).required).toBe(false);
  });

  it("corpo com padrão de objeto vazio também é opcional", () => {
    expect(requestBody(z.object({ a: z.string().optional() }).default({})).required).toBe(false);
  });

  it("corpo obrigatório continua com required true", () => {
    expect(requestBody(z.object({ a: z.string() })).required).toBe(true);
  });
});

describe("regras anotadas por caminho (V2-F02-E04, parte 4B)", () => {
  const ponto = z
    .object({ lat: z.number(), lng: z.number() })
    .refine((p) => !(p.lat === 0 && p.lng === 0), {
      message: "A coordenada 0,0 não é um lugar.",
    });

  it("o mesmo esquema em dois campos gera duas anotações, uma por caminho", () => {
    const achadas = refinamentosDe(z.object({ origem: ponto, destino: ponto }));
    expect(achadas.map((a) => a.caminho).sort()).toEqual(["destino", "origem"]);
    expect(achadas.every((a) => a.regra === "A coordenada 0,0 não é um lugar.")).toBe(true);
  });

  it("o mesmo esquema em dois itens de uma lista e numa união não duplica o mesmo caminho", () => {
    const achadas = refinamentosDe(
      z.object({ a: z.union([ponto, ponto]), b: z.array(ponto), c: ponto.optional() }),
    );
    expect(achadas.map((a) => a.caminho).sort()).toEqual(["a", "b", "c"]);
  });

  it("esquema recursivo termina e anota a regra do nível raiz uma vez", () => {
    const arvore: z.ZodType = z
      .object({
        nome: z.string(),
        get filhos() {
          return z.array(arvore);
        },
      })
      .refine((n) => n.nome !== "", { message: "Nome vazio." });
    const achadas = refinamentosDe(arvore);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]).toMatchObject({ caminho: "", regra: "Nome vazio." });
  });

  it("recursão por referência de outro campo também termina", () => {
    const no: z.ZodType = z.object({
      valor: ponto,
      get proximo() {
        return no.optional();
      },
    });
    const achadas = refinamentosDe(no);
    expect(achadas.map((a) => a.caminho)).toEqual(["valor"]);
  });

  it("POST /v1/rota anota a coordenada 0,0 na origem E no destino, no documento e no guarda", () => {
    const op = operacao("/v1/rota", "post");
    const regras = op["x-regras-adicionais"]!;
    expect(regras.map((x) => x.campo).sort()).toEqual(["destino", "origem"]);
    expect(regras.every((x) => x.em === "corpo")).toBe(true);
    expect(operacoesSemAnotacaoDeRegras(ROTAS_DO_CONTRATO, documento)).toEqual([]);
    const esquemaDoCorpo = op.requestBody!.content["application/json"].schema;
    expect(esquemaDoCorpo["x-regras-adicionais"]).toHaveLength(2);
  });
});

describe("mais de um status de sucesso (`tambemResponde`, parte 4B)", () => {
  type OpComRespostas = { responses: Record<string, Record<string, unknown>> };
  const respostasDe = (r: RotaComGrupo) =>
    (gerarOpenApi([r], []).paths["/v1/coisas"] as Record<string, OpComRespostas>).post!.responses;
  const base: RotaComGrupo = {
    metodo: "POST",
    caminho: "/v1/coisas",
    resumo: "Cria de forma idempotente.",
    grupo: "teste",
    resposta: {
      status: 201,
      descricao: "Criada.",
      esquema: z.object({ id: z.string() }),
    },
  };

  it("sai uma resposta por status, com o esquema da principal quando não declara outro", () => {
    const respostas = respostasDe({
      ...base,
      tambemResponde: [{ status: 200, descricao: "Reenvio: a mesma coisa." }],
    });
    expect(Object.keys(respostas).sort()).toEqual(["200", "201"]);
    expect(respostas["200"]!.description).toBe("Reenvio: a mesma coisa.");
    expect(respostas["200"]!.content).toEqual(respostas["201"]!.content);
  });

  it("usa o esquema próprio quando a resposta adicional declara um", () => {
    const respostas = respostasDe({
      ...base,
      tambemResponde: [
        { status: 202, descricao: "Aceita.", resposta: z.object({ fila: z.number() }) },
      ],
    });
    const schema = (
      respostas["202"]!.content as Record<string, { schema: { properties: object } }>
    )["application/json"]!.schema;
    expect(Object.keys(schema.properties)).toEqual(["fila"]);
  });

  it("falha quando repete o status principal, repete outro adicional ou colide com um erro", () => {
    expect(() =>
      respostasDe({ ...base, tambemResponde: [{ status: 201, descricao: "Igual." }] }),
    ).toThrow(/201/);
    expect(() =>
      respostasDe({
        ...base,
        tambemResponde: [
          { status: 200, descricao: "A." },
          { status: 200, descricao: "B." },
        ],
      }),
    ).toThrow(/200/);
    expect(() =>
      respostasDe({
        ...base,
        erros: ["dados_invalidos"],
        tambemResponde: [{ status: 422, descricao: "Colide com o erro." }],
      }),
    ).toThrow(/422/);
  });

  it("falha quando a entrada não tem resposta principal", () => {
    const { resposta: _semResposta, ...sem } = base;
    expect(() =>
      respostasDe({ ...sem, tambemResponde: [{ status: 200, descricao: "Órfã." }] }),
    ).toThrow(/resposta/);
  });

  it("as quatro rotas idempotentes listam o 200 do reenvio ao lado do 201", () => {
    for (const [caminho, nome] of [
      ["/v1/ocorrencias", "POST /v1/ocorrencias"],
      ["/v1/sincronizacao/vistoria", "POST /v1/sincronizacao/vistoria"],
      ["/v1/sincronizacao/devolucao", "POST /v1/sincronizacao/devolucao"],
      ["/v1/saida-a-campo", "POST /v1/saida-a-campo"],
    ] as const) {
      const respostas = (documento.paths[caminho] as Record<string, OpComRespostas>).post!
        .responses;
      expect(Object.keys(respostas), nome).toEqual(expect.arrayContaining(["200", "201"]));
      expect(respostas["200"]!.description as string, nome).toMatch(/reenvio/i);
      expect(respostas["200"]!.content, nome).toEqual(respostas["201"]!.content);
    }
  });

  it("nenhuma outra rota ganha `tambemResponde` sem querer (só as quatro idempotentes)", () => {
    const com = ROTAS_DO_CONTRATO.filter((r) => (r.tambemResponde ?? []).length > 0)
      .map((r) => `${r.metodo} ${r.caminho}`)
      .sort();
    expect(com).toEqual([
      "POST /v1/ocorrencias",
      "POST /v1/saida-a-campo",
      "POST /v1/sincronizacao/devolucao",
      "POST /v1/sincronizacao/vistoria",
    ]);
  });
});
