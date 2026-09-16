import { z, type ZodErrorMap, type ZodIssueOptionalMessage } from "zod";

/**
 * AS MENSAGENS DO ZOD, EM PORTUGUÊS, para o produto inteiro.
 *
 * Os esquemas deste pacote escrevem mensagem própria onde alguém lembrou
 * ("Informe quem assinou", "Informe o nome do órgão"). Onde ninguém lembrou, o
 * Zod respondia com a frase padrão dele, em inglês, e essa frase não fica no
 * servidor: o 422 devolve `issues[].message` inteiro ao aparelho, e a
 * conferência que o aplicativo faz antes de enfileirar (`conferirColeta`, em
 * `@dc360/campo`) usa os MESMOS esquemas. Nos dois caminhos a frase vai para o
 * cartão "Corrija N itens antes de concluir", na tela de vistoria, na rua.
 *
 * O caso que a fez nascer: precisão de GPS abaixo de meio metro arredondava
 * para zero, `gpsPrecisaoMetros` exige positivo, e o agente lia "Number must
 * be greater than 0" ao lado de "Precisão da leitura de GPS".
 *
 * ## Por que um mapa GLOBAL, e não mensagem em cada regra
 *
 * Mensagem em cada regra é o que já existia, e é exatamente o modo de falha:
 * cobre a regra de que alguém lembrou. O mapa cobre a regra que for escrita
 * amanhã. Ele é instalado no ponto de entrada do pacote (`index.ts`), então
 * quem importa `@dc360/shared` já recebe os esquemas com o mapa ligado, sem
 * ter que lembrar de nada. Mensagem explícita continua vencendo: o Zod nem
 * consulta o mapa quando a regra trouxe a própria frase.
 *
 * ## O que as frases NÃO dizem
 *
 * Elas não nomeiam o campo: quem sabe o nome do campo em português é
 * `rotuloDoCampo` (`campos.ts`), e a tela escreve o rótulo ao lado da frase.
 * Uma frase que repetisse o nome produziria "Precisão da leitura de GPS:
 * precisão precisa ser maior que 0".
 */

/** Os tipos do Zod ditos em português, com o artigo que a frase pede. */
const TIPO: Record<string, string> = {
  string: "um texto",
  number: "um número",
  bigint: "um número",
  boolean: "sim ou não",
  date: "uma data",
  array: "uma lista",
  object: "um objeto",
  null: "nulo",
  undefined: "nada",
  nan: "um número",
  integer: "um número inteiro",
  float: "um número",
  symbol: "um símbolo",
  function: "uma função",
  map: "um mapa",
  set: "um conjunto",
  promise: "uma promessa",
  unknown: "um valor",
  void: "nada",
  never: "nada",
};

function tipo(nome: string): string {
  return TIPO[nome] ?? nome;
}

/** "Era esperado um texto" ou "Era esperada uma lista": o particípio concorda. */
function eraEsperado(nome: string): string {
  const dito = tipo(nome);
  return dito.startsWith("uma ") ? `Era esperada ${dito}` : `Era esperado ${dito}`;
}

function itens(n: number | bigint): string {
  return Number(n) === 1 ? "1 item" : `${n} itens`;
}

function caracteres(n: number | bigint): string {
  return Number(n) === 1 ? "1 caractere" : `${n} caracteres`;
}

function lista(valores: ReadonlyArray<unknown>): string {
  return valores.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
}

function traduzir(issue: ZodIssueOptionalMessage): string {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return "Campo obrigatório";
      /* `.int()` reprova com "esperava inteiro, veio float": a pergunta é
         sobre a forma do número, e não sobre o tipo do valor. */
      if (issue.expected === "integer") return "Precisa ser um número inteiro";
      return `${eraEsperado(issue.expected)}, veio ${tipo(issue.received)}`;

    case z.ZodIssueCode.invalid_literal:
      return `Era esperado exatamente ${JSON.stringify(issue.expected)}`;

    case z.ZodIssueCode.unrecognized_keys:
      return issue.keys.length === 1
        ? `Campo não reconhecido: ${issue.keys[0]}`
        : `Campos não reconhecidos: ${issue.keys.join(", ")}`;

    case z.ZodIssueCode.invalid_union:
      return "Valor inválido";

    case z.ZodIssueCode.invalid_union_discriminator:
      return `Tipo não reconhecido. Os aceitos são: ${issue.options.map((o) => JSON.stringify(o)).join(", ")}`;

    case z.ZodIssueCode.invalid_enum_value:
      return `Valor não reconhecido: ${JSON.stringify(issue.received)}. Os aceitos são: ${lista(issue.options)}`;

    case z.ZodIssueCode.invalid_arguments:
      return "Argumentos inválidos";

    case z.ZodIssueCode.invalid_return_type:
      return "Retorno inválido";

    case z.ZodIssueCode.invalid_date:
      return "Data inválida";

    case z.ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) return `Precisa conter "${issue.validation.includes}"`;
        if ("startsWith" in issue.validation) return `Precisa começar com "${issue.validation.startsWith}"`;
        if ("endsWith" in issue.validation) return `Precisa terminar com "${issue.validation.endsWith}"`;
        return "Formato inválido";
      }
      switch (issue.validation) {
        case "uuid": return "Não é um identificador válido (UUID)";
        case "datetime": return "Não é uma data e hora válidas (ISO 8601)";
        case "date": return "Não é uma data válida";
        case "time": return "Não é um horário válido";
        case "email": return "Não é um email válido";
        case "url": return "Não é um endereço válido";
        case "ip": return "Não é um endereço IP válido";
        case "regex": return "Formato inválido";
        default: return "Formato inválido";
      }

    case z.ZodIssueCode.too_small: {
      const { minimum, exact, inclusive } = issue;
      if (issue.type === "string") {
        if (exact) return `Precisa ter exatamente ${caracteres(minimum)}`;
        if (Number(minimum) === 1 && inclusive) return "Não pode ficar em branco";
        return inclusive
          ? `Precisa ter ao menos ${caracteres(minimum)}`
          : `Precisa ter mais de ${caracteres(minimum)}`;
      }
      if (issue.type === "array" || issue.type === "set") {
        if (exact) return `Precisa ter exatamente ${itens(minimum)}`;
        return inclusive
          ? `Precisa ter ao menos ${itens(minimum)}`
          : `Precisa ter mais de ${itens(minimum)}`;
      }
      if (issue.type === "date") {
        const data = new Date(Number(minimum)).toISOString();
        if (exact) return `Precisa ser exatamente ${data}`;
        return inclusive ? `Precisa ser em ${data} ou depois` : `Precisa ser depois de ${data}`;
      }
      if (exact) return `Precisa ser exatamente ${minimum}`;
      return inclusive
        ? `Precisa ser maior ou igual a ${minimum}`
        : `Precisa ser maior que ${minimum}`;
    }

    case z.ZodIssueCode.too_big: {
      const { maximum, exact, inclusive } = issue;
      if (issue.type === "string") {
        if (exact) return `Precisa ter exatamente ${caracteres(maximum)}`;
        return inclusive
          ? `Precisa ter no máximo ${caracteres(maximum)}`
          : `Precisa ter menos de ${caracteres(maximum)}`;
      }
      if (issue.type === "array" || issue.type === "set") {
        if (exact) return `Precisa ter exatamente ${itens(maximum)}`;
        return inclusive
          ? `Precisa ter no máximo ${itens(maximum)}`
          : `Precisa ter menos de ${itens(maximum)}`;
      }
      if (issue.type === "date") {
        const data = new Date(Number(maximum)).toISOString();
        if (exact) return `Precisa ser exatamente ${data}`;
        return inclusive ? `Precisa ser em ${data} ou antes` : `Precisa ser antes de ${data}`;
      }
      if (exact) return `Precisa ser exatamente ${maximum}`;
      return inclusive
        ? `Precisa ser menor ou igual a ${maximum}`
        : `Precisa ser menor que ${maximum}`;
    }

    case z.ZodIssueCode.custom:
      return "Valor inválido";

    case z.ZodIssueCode.invalid_intersection_types:
      return "Os dois formatos exigidos não se combinam";

    case z.ZodIssueCode.not_multiple_of:
      return `Precisa ser múltiplo de ${issue.multipleOf}`;

    case z.ZodIssueCode.not_finite:
      return "Precisa ser um número finito";

    default:
      return "Valor inválido";
  }
}

/**
 * O mapa, exportado para quem precisar consultar (o teste) ou instalar por
 * conta própria numa cópia diferente do Zod.
 */
export const mensagensDoZodEmPortugues: ZodErrorMap = (issue) => ({ message: traduzir(issue) });

/*
  Instalado no `import`, e não numa função que alguém precise lembrar de
  chamar. `index.ts` importa este arquivo antes dos esquemas: quem usa o
  pacote já recebe as mensagens certas sem saber que isto existe.
*/
z.setErrorMap(mensagensDoZodEmPortugues);
