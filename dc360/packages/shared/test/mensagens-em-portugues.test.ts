import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aberturaOcorrenciaSchema,
  envelopeSincronizacaoSchema,
  numeroDoTexto,
  pedidoDeEvidenciaSchema,
  uuidSchema,
  vistoriaSchema,
} from "../src/index.js";

/**
 * AS MENSAGENS DO ZOD CHEGAM À TELA DO AGENTE, e chegavam em inglês.
 *
 * Os esquemas deste pacote escrevem mensagem própria onde alguém lembrou de
 * escrever ("Informe quem assinou", "Informe o nome do órgão"). Onde ninguém
 * lembrou, o Zod responde com a frase padrão dele, em inglês: "Number must be
 * greater than 0", "Required", "Invalid uuid". Essas frases não ficam no
 * servidor: o 422 devolve `issues[].message` inteiro ao aparelho, e a
 * conferência que o aplicativo faz antes de enfileirar (`conferirColeta`, em
 * `@dc360/campo`) usa os MESMOS esquemas. Nos dois caminhos a frase vai para
 * o cartão "Corrija N itens antes de concluir", na tela de vistoria, na rua.
 *
 * O caso concreto que o revisor alcançou com o aparelho na mão: precisão de
 * GPS abaixo de meio metro arredonda para zero, `gpsPrecisaoMetros` exige
 * positivo, e o agente lia "Number must be greater than 0" ao lado de
 * "Precisão da leitura de GPS".
 *
 * A correção é um mapa de erros GLOBAL, em português, instalado no ponto de
 * entrada do pacote. Mensagem explícita continua vencendo, e é isso que o
 * último caso guarda: uma tradução que atropelasse "Informe quem assinou"
 * seria pior do que o inglês.
 */

/** A primeira mensagem do primeiro problema, ou a lista inteira para o erro. */
function mensagem(resultado: z.ZodSafeParseResult<unknown>): string {
  if (resultado.success) throw new Error("esperava reprovação");
  return resultado.error.issues.map((i) => i.message).join(" | ");
}

const INGLES = /\b(must|required|expected|received|invalid|string|number|array|element|character)\b/i;

describe("o mapa de erros do pacote compartilhado fala português", () => {
  it("too_small: número, texto e lista", () => {
    expect(mensagem(z.number().positive().safeParse(0)))
      .toBe("Precisa ser maior que 0");
    expect(mensagem(z.number().min(1).safeParse(0)))
      .toBe("Precisa ser maior ou igual a 1");
    expect(mensagem(z.string().min(2).safeParse("a")))
      .toBe("Precisa ter ao menos 2 caracteres");
    expect(mensagem(z.string().min(1).safeParse("")))
      .toBe("Não pode ficar em branco");
    expect(mensagem(z.string().length(2).safeParse("a")))
      .toBe("Precisa ter exatamente 2 caracteres");
    expect(mensagem(z.array(z.string()).min(1).safeParse([])))
      .toBe("Precisa ter ao menos 1 item");
    expect(mensagem(z.array(z.string()).min(3).safeParse([])))
      .toBe("Precisa ter ao menos 3 itens");
  });

  it("too_big: número, texto e lista", () => {
    expect(mensagem(z.number().max(720).safeParse(721)))
      .toBe("Precisa ser menor ou igual a 720");
    expect(mensagem(z.number().lt(10).safeParse(10)))
      .toBe("Precisa ser menor que 10");
    expect(mensagem(z.string().max(3).safeParse("abcd")))
      .toBe("Precisa ter no máximo 3 caracteres");
    expect(mensagem(z.array(z.string()).max(1).safeParse(["a", "b"])))
      .toBe("Precisa ter no máximo 1 item");
  });

  it("invalid_type: ausente é obrigatório, presente é o tipo errado", () => {
    expect(mensagem(z.object({ a: z.string() }).safeParse({})))
      .toBe("Campo obrigatório");
    expect(mensagem(z.number().safeParse("12")))
      .toBe("Era esperado um número, veio um texto");
    expect(mensagem(z.string().safeParse(12)))
      .toBe("Era esperado um texto, veio um número");
    expect(mensagem(z.boolean().safeParse("sim")))
      .toBe("Era esperado sim ou não, veio um texto");
    expect(mensagem(z.array(z.string()).safeParse({})))
      .toBe("Era esperada uma lista, veio um objeto");
    expect(mensagem(z.string().safeParse(null)))
      .toBe("Era esperado um texto, veio nulo");
  });

  it("invalid_string: uuid, datetime, email e regex", () => {
    expect(mensagem(z.string().uuid().safeParse("chave-fixa")))
      .toBe("Não é um identificador válido (UUID)");
    expect(mensagem(z.string().datetime().safeParse("ontem")))
      .toBe("Não é uma data e hora válidas (ISO 8601)");
    expect(mensagem(z.string().email().safeParse("sem-arroba")))
      .toBe("Não é um email válido");
    expect(mensagem(z.string().regex(/^\d+$/).safeParse("abc")))
      .toBe("Formato inválido");
    expect(mensagem(z.string().url().safeParse("abc")))
      .toBe("Não é um endereço válido");
  });

  it("invalid_enum_value: diz o que veio e o que era aceito", () => {
    expect(mensagem(z.enum(["alta", "media"]).safeParse("urgente")))
      .toBe("Valor não reconhecido: \"urgente\". Os aceitos são: alta, media");
  });

  it("os outros códigos também não escapam em inglês", () => {
    expect(mensagem(z.object({ a: z.string() }).strict().safeParse({ a: "x", b: 1 })))
      .toBe("Campo não reconhecido: b");
    expect(mensagem(z.object({ a: z.string() }).strict().safeParse({ a: "x", b: 1, c: 2 })))
      .toBe("Campos não reconhecidos: b, c");
    expect(mensagem(z.union([z.string(), z.number()]).safeParse(true)))
      .toBe("Valor inválido");
    expect(mensagem(z.number().int().safeParse(1.5)))
      .toBe("Precisa ser um número inteiro");
    expect(mensagem(z.number().multipleOf(5).safeParse(7)))
      .toBe("Precisa ser múltiplo de 5");
    expect(mensagem(z.number().finite().safeParse(Infinity)))
      .toBe("Precisa ser um número finito");
    expect(mensagem(z.literal("x").safeParse("y")))
      .toBe("Era esperado exatamente \"x\"");
    expect(mensagem(z.date().safeParse(new Date("nada"))))
      .toBe("Data inválida");
    expect(mensagem(z.string().refine(() => false).safeParse("x")))
      .toBe("Valor inválido");
    expect(mensagem(z.discriminatedUnion("t", [
      z.object({ t: z.literal("a") }), z.object({ t: z.literal("b") }),
    ]).safeParse({ t: "c" })))
      .toBe("Tipo não reconhecido. Os aceitos são: \"a\", \"b\"");
  });

  it("a mensagem explícita escrita no esquema continua valendo", () => {
    const resultado = vistoriaSchema.safeParse({
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "",
      assinaturaChave: null,
      coletadaEm: "2026-09-14T12:00:00.000Z",
    });
    expect(mensagem(resultado)).toBe("Informe quem assinou");
  });

  /*
    O caso do revisor, de ponta a ponta pelo esquema do servidor: precisão
    zero e chave fora de UUID. Nenhuma das duas frases pode chegar à rua em
    inglês.
  */
  it("o 422 da vistoria 000009/2026 sai inteiro em português", () => {
    const envelope = envelopeSincronizacaoSchema.safeParse({
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      coletadaEm: "2026-09-14T12:00:00.000Z",
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: false },
          { chave: "interdicao_indicada", resposta: false },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [],
        gpsPrecisaoMetros: 0,
        assinanteNome: "Marilda Souza Prado",
        assinaturaChave: null,
        coletadaEm: "2026-09-14T12:00:00.000Z",
      },
    });
    expect(mensagem(envelope)).toBe("Precisa ser maior que 0");
    expect(mensagem(envelope)).not.toMatch(INGLES);

    const pedido = pedidoDeEvidenciaSchema.safeParse({
      ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      idempotencyKey: "chave-fixa-assinatura",
      nomeArquivo: "assinatura.png",
      tipoConteudo: "image/png",
      tamanhoBytes: 0,
      capturadaEm: "2026-09-14T12:00:00.000Z",
      ordem: 0,
    });
    expect(mensagem(pedido)).not.toMatch(INGLES);
  });
});

/*
  Zod 4 (E19, correção 10): `.uuid()` passou a exigir um UUID de verdade (RFC
  9562: dígito de versão de 1 a 8 e variante 8, 9, a ou b). O Zod 3 aceitava
  qualquer 8-4-4-4-12 em hexadecimal. O `gen_random_uuid()` do banco e o
  `randomUUID()` do aparelho sempre geraram v4, então nada real muda; o que
  muda é que um identificador montado à mão, como o dublê de teste
  `11111111-1111-1111-1111-111111111111`, é recusado com a frase em português.
*/
describe("uuidSchema na linha 4 do Zod", () => {
  it("aceita o v4 de verdade e o nulo, e recusa o 8-4-4-4-12 que não é UUID", () => {
    for (const ok of [
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "123e4567-e89b-12d3-a456-426614174000",
      "00000000-0000-0000-0000-000000000000",
    ]) expect(uuidSchema.safeParse(ok).success, ok).toBe(true);
    for (const ruim of [
      "11111111-1111-1111-1111-111111111111",
      "chave-fixa",
      "123e4567e89b12d3a456426614174000",
    ]) {
      const r = uuidSchema.safeParse(ruim);
      expect(r.success, ruim).toBe(false);
      expect(mensagem(r)).toBe("Não é um identificador válido (UUID)");
    }
  });
});

/*
  Campo ausente é "Campo obrigatório" em QUALQUER regra (V2-F00-E19, correção
  11). No Zod 4 só `invalid_type` carregava essa frase de graça; enum, literal e
  união obrigatórios reprovam com o código da própria regra, e a frase dessa
  regra imprimia "Valor não reconhecido: undefined". O validador da rodada 9
  reproduziu num 422 real de `POST /ocorrencias`.
*/
describe("campo obrigatório ausente, em qualquer regra", () => {
  const ausente = (esquema: z.ZodType) => mensagem(z.object({ campo: esquema }).safeParse({}));

  it("enum, literal, união, união discriminada e lista ausentes dizem 'Campo obrigatório'", () => {
    expect(ausente(z.enum(["alta", "media"]))).toBe("Campo obrigatório");
    expect(ausente(z.literal("x"))).toBe("Campo obrigatório");
    expect(ausente(z.union([z.string(), z.number()]))).toBe("Campo obrigatório");
    expect(ausente(z.array(z.string()).min(1))).toBe("Campo obrigatório");
    expect(ausente(z.string().uuid())).toBe("Campo obrigatório");
    expect(ausente(z.number().int().positive())).toBe("Campo obrigatório");
    expect(ausente(z.discriminatedUnion("t", [
      z.object({ t: z.literal("a") }), z.object({ t: z.literal("b") }),
    ]))).toBe("Campo obrigatório");
  });

  it("enum explicitamente undefined também (o JSON não carrega undefined, mas o aparelho monta objeto)", () => {
    expect(mensagem(z.object({ campo: z.enum(["a", "b"]) }).safeParse({ campo: undefined })))
      .toBe("Campo obrigatório");
  });

  it("o esquema real de abertura de ocorrência, sem tipo e sem canal, diz 'Campo obrigatório' nos dois", () => {
    const r = aberturaOcorrenciaSchema.safeParse({
      solicitanteNome: "Marilda Souza Prado", endereco: "Rua das Acácias, 120",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    });
    if (r.success) throw new Error("esperava reprovação");
    for (const nome of ["tipo", "canalEntrada"]) {
      const p = r.error.issues.find((i) => i.path[0] === nome);
      expect(p?.message, nome).toBe("Campo obrigatório");
    }
  });

  it("enum presente e errado continua dizendo o que veio e o que era aceito", () => {
    expect(mensagem(z.enum(["alta", "media"]).safeParse("urgente")))
      .toBe("Valor não reconhecido: \"urgente\". Os aceitos são: alta, media");
  });
});

/*
  Nenhuma frase do mapa imprime `undefined` nem `null` de JavaScript, e
  nenhuma lança: o valor que veio de fora entra na frase dito em português.
*/
describe("o mapa nunca imprime undefined nem null crus", () => {
  it("enum que recebe nulo, número, booleano, objeto e lista", () => {
    const e = z.enum(["alta", "media"]);
    expect(mensagem(e.safeParse(null))).toBe("Valor não reconhecido: nulo. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse(7))).toBe("Valor não reconhecido: 7. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse(true))).toBe("Valor não reconhecido: true. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse({ a: 1 }))).toBe("Valor não reconhecido: um objeto. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse([1]))).toBe("Valor não reconhecido: uma lista. Os aceitos são: alta, media");
  });

  it("BigInt, NaN e Infinity no enum não lançam nem viram 'null'", () => {
    const e = z.enum(["alta", "media"]);
    expect(mensagem(e.safeParse(10n))).toBe("Valor não reconhecido: 10. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse(Number.NaN)))
      .toBe("Valor não reconhecido: um valor que não é número. Os aceitos são: alta, media");
    expect(mensagem(e.safeParse(Infinity))).toBe("Valor não reconhecido: infinito. Os aceitos são: alta, media");
  });

  it("literal nulo e lista de aceitos com nulo", () => {
    expect(mensagem(z.literal(null).safeParse("x"))).toBe("Era esperado exatamente nulo");
    expect(mensagem(z.literal(["a", null]).safeParse("x")))
      .toBe("Valor não reconhecido: \"x\". Os aceitos são: a, nulo");
  });

  it("nenhum caso acima deixa 'undefined' ou 'null' na frase", () => {
    const casos = [
      z.enum(["a", "b"]).safeParse(null),
      z.enum(["a", "b"]).safeParse(undefined),
      z.literal(null).safeParse(1),
      z.literal(["a", null]).safeParse(1),
      z.object({ a: z.enum(["a", "b"]) }).safeParse({}),
      z.object({ a: z.enum(["a", "b"]) }).safeParse({ a: null }),
      z.number().safeParse(Number.NaN),
      z.string().safeParse(undefined),
    ];
    for (const c of casos) expect(mensagem(c)).not.toMatch(/\b(undefined|null)\b/);
  });
});

/*
  DV-19: `z.coerce.number()` sobre texto não numérico dá NaN, e a frase saía
  "Era esperado um número, veio um número".
*/
describe("NaN tem frase própria", () => {
  it("coerce.number sobre 'abc' diz 'Precisa ser um número'", () => {
    expect(mensagem(z.coerce.number().safeParse("abc"))).toBe("Precisa ser um número");
    expect(mensagem(z.object({ pagina: z.coerce.number().int() }).safeParse({ pagina: "abc" })))
      .toBe("Precisa ser um número");
  });

  it("number sobre NaN direto também, e coerce de texto válido continua passando", () => {
    expect(mensagem(z.number().safeParse(Number.NaN))).toBe("Precisa ser um número");
    expect(z.coerce.number().safeParse("12").success).toBe(true);
  });

  it("NaN onde se esperava texto diz o que veio sem repetir 'número' como se fosse certo", () => {
    expect(mensagem(z.string().safeParse(Number.NaN)))
      .toBe("Era esperado um texto, veio um valor que não é número");
  });
});

/*
  Dívida de teste da rodada 9 (QA 3 e QA da E06 1): a função `error` de
  `tamanhoBytes` separa "não foi informado" de "precisa ser um número", e o
  mutante que apagava a distinção sobrevivia porque nenhum teste afirmava a
  frase do ausente.
*/
describe("tamanhoBytes separa ausente de não numérico", () => {
  const base = {
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    nomeArquivo: "foto.png",
    tipoConteudo: "image/png",
    capturadaEm: "2026-09-14T12:00:00.000Z",
    ordem: 0,
  };
  const frase = (corpo: Record<string, unknown>) => {
    const r = pedidoDeEvidenciaSchema.safeParse(corpo);
    if (r.success) throw new Error("esperava reprovação");
    return r.error.issues.find((i) => i.path[0] === "tamanhoBytes")?.message;
  };

  it("ausente: 'não foi informado'; texto: 'precisa ser um número de bytes'", () => {
    expect(frase(base)).toBe("O tamanho do arquivo não foi informado.");
    expect(frase({ ...base, tamanhoBytes: "12" }))
      .toBe("O tamanho do arquivo precisa ser um número de bytes.");
    expect(frase({ ...base, tamanhoBytes: null }))
      .toBe("O tamanho do arquivo precisa ser um número de bytes.");
  });
});

/*
  Item de lista ausente diz QUAL item (V2-F02-E03, DV-44). Antes, um `undefined`
  dentro de uma lista saía "Campo obrigatório", igual ao de um campo de objeto,
  e quem lia a lista de problemas não sabia onde olhar. JSON não carrega
  `undefined` (vira null, que já diz "veio nulo"), mas o aparelho monta objeto
  em memória, como no caso do enum ausente acima.
*/
describe("item de lista ausente diz qual item", () => {
  it("o primeiro, o segundo e o quinto item (a leitura humana começa em 1)", () => {
    const lista = z.array(z.string());
    expect(mensagem(lista.safeParse([undefined]))).toBe("O item 1 da lista é obrigatório");
    expect(mensagem(lista.safeParse(["a", undefined]))).toBe("O item 2 da lista é obrigatório");
    expect(mensagem(lista.safeParse(["a", "b", "c", "d", undefined]))).toBe("O item 5 da lista é obrigatório");
  });

  it("dois buracos dão duas frases diferentes, e o caminho do 422 continua a partir de 0", () => {
    const r = z.object({ fotos: z.array(z.string()) }).safeParse({ fotos: [undefined, "x", undefined] });
    if (r.success) throw new Error("esperava reprovação");
    expect(r.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["fotos.0", "O item 1 da lista é obrigatório"],
      ["fotos.2", "O item 3 da lista é obrigatório"],
    ]);
  });

  it("enum e objeto dentro da lista também (a regra da lista vale para qualquer item)", () => {
    expect(mensagem(z.array(z.enum(["a", "b"])).safeParse(["a", undefined])))
      .toBe("O item 2 da lista é obrigatório");
    expect(mensagem(z.array(z.object({ a: z.string() })).safeParse([{ a: "x" }, undefined])))
      .toBe("O item 2 da lista é obrigatório");
  });

  it("campo de objeto dentro de item de lista continua 'Campo obrigatório' (aponta o campo, não o item)", () => {
    expect(mensagem(z.array(z.object({ a: z.string() })).safeParse([{}])))
      .toBe("Campo obrigatório");
  });

  it("campo de objeto e valor presente de tipo errado não mudam", () => {
    expect(mensagem(z.object({ a: z.string() }).safeParse({}))).toBe("Campo obrigatório");
    expect(mensagem(z.array(z.string()).safeParse(["a", 1])))
      .toBe("Era esperado um texto, veio um número");
    expect(mensagem(z.array(z.string()).safeParse(["a", null])))
      .toBe("Era esperado um texto, veio nulo");
  });
});

/*
  DV-47. Duas frases imprecisas para o campo AUSENTE:

  - União discriminada sem o discriminador: o Zod entrega o objeto inteiro como
    `input` (não é `undefined`), e a frase dizia "Tipo não reconhecido". O que
    falta é o campo `t`, e a frase é "Campo obrigatório". Discriminador presente
    e desconhecido continua dizendo "Tipo não reconhecido".
  - `z.coerce.number()` ausente: o Zod converte ANTES de montar o problema
    (`Number(undefined)` é `NaN`), e o mapa só vê `NaN`, igual ao de "abc". Não
    há como separar os dois dentro do mapa. `numeroDoTexto` não converte o
    ausente: ele chega ao `z.number()` como `undefined` e diz "Campo
    obrigatório"; "abc" continua dizendo "Precisa ser um número".
*/
describe("DV-47: campo ausente em união discriminada e em número vindo de texto", () => {
  const uniao = z.discriminatedUnion("t", [
    z.object({ t: z.literal("a") }), z.object({ t: z.literal("b") }),
  ]);

  it("união discriminada sem o discriminador diz 'Campo obrigatório', no campo e na raiz", () => {
    expect(mensagem(z.object({ campo: uniao }).safeParse({ campo: {} }))).toBe("Campo obrigatório");
    expect(mensagem(uniao.safeParse({}))).toBe("Campo obrigatório");
    expect(mensagem(uniao.safeParse({ t: undefined }))).toBe("Campo obrigatório");
  });

  it("com o discriminador presente e desconhecido, continua 'Tipo não reconhecido'", () => {
    expect(mensagem(uniao.safeParse({ t: "c" })))
      .toBe("Tipo não reconhecido. Os aceitos são: \"a\", \"b\"");
    expect(mensagem(uniao.safeParse("texto"))).not.toBe("Campo obrigatório");
  });

  it("numeroDoTexto: ausente diz 'Campo obrigatório'; texto não numérico, 'Precisa ser um número'", () => {
    const esquema = z.object({ pagina: numeroDoTexto(z.number().int().min(1)) });
    expect(mensagem(esquema.safeParse({}))).toBe("Campo obrigatório");
    expect(mensagem(esquema.safeParse({ pagina: "abc" }))).toBe("Precisa ser um número");
    expect(mensagem(esquema.safeParse({ pagina: "0" }))).toBe("Precisa ser maior ou igual a 1");
  });

  it("numeroDoTexto converte como o coerce (texto, número) e aceita default", () => {
    const esquema = z.object({ pagina: numeroDoTexto(z.number().int().min(1)).default(1) });
    expect(esquema.parse({})).toEqual({ pagina: 1 });
    expect(esquema.parse({ pagina: "7" })).toEqual({ pagina: 7 });
    expect(esquema.parse({ pagina: 3 })).toEqual({ pagina: 3 });
  });
});
