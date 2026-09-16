import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  envelopeSincronizacaoSchema,
  pedidoDeEvidenciaSchema,
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
function mensagem(resultado: z.SafeParseReturnType<unknown, unknown>): string {
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
