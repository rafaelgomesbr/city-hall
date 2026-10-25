import { z } from "zod";

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
 * ## Zod 4 (correção 10 da E19)
 *
 * O Zod 3.25.76 tem a advisory GHSA-mrhx-c7xc-m3w5 (alta, consumo de memória
 * em coleções grandes) sem correção na linha 3; o produto subiu para a 4. A
 * API do mapa mudou: `z.setErrorMap` virou `z.config({ customError })`, o
 * código `invalid_string` virou `invalid_format`, `invalid_enum_value` e
 * `invalid_literal` viraram `invalid_value`, e o tipo recebido não vem mais
 * pronto (`received`): sai do `input` do problema. As FRASES em português são
 * as mesmas de antes (o teste `mensagens-em-portugues.test.ts` as confere).
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
  int: "um número inteiro",
  bigint: "um número",
  boolean: "sim ou não",
  date: "uma data",
  array: "uma lista",
  object: "um objeto",
  null: "nulo",
  undefined: "nada",
  nan: "um valor que não é número",
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
  record: "um objeto",
  tuple: "uma lista",
  file: "um arquivo",
};

function tipo(nome: string): string {
  return TIPO[nome] ?? nome;
}

/**
 * O tipo do valor que chegou, no vocabulário do Zod 3 (que as frases usam).
 * No Zod 4 o problema carrega o `input` e não mais o tipo recebido.
 */
function tipoRecebido(valor: unknown): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "array";
  if (typeof valor === "number" && Number.isNaN(valor)) return "nan";
  if (valor instanceof Date) return "date";
  if (valor instanceof Map) return "map";
  if (valor instanceof Set) return "set";
  return typeof valor;
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

/**
 * Um valor dito em português para entrar numa frase. Nunca devolve o
 * identificador cru de JavaScript: `JSON.stringify(undefined)` é o próprio
 * `undefined` (o valor, não um texto), `JSON.stringify(null)` e
 * `JSON.stringify(NaN)` dão "null", e `JSON.stringify(1n)` lança TypeError.
 * Frase com "undefined" ou "null" no meio chega ao agente na rua.
 */
function valorDito(valor: unknown): string {
  if (valor === undefined) return "nada";
  if (valor === null) return "nulo";
  switch (typeof valor) {
    case "string":
      return JSON.stringify(valor);
    case "number":
      if (Number.isNaN(valor)) return "um valor que não é número";
      return Number.isFinite(valor) ? String(valor) : "infinito";
    case "bigint":
    case "boolean":
      return String(valor);
    default:
      /* Objeto, lista, função, símbolo: dizer o tipo, sem repetir o conteúdo
         que veio de fora numa frase de erro. */
      return tipo(tipoRecebido(valor));
  }
}

function lista(valores: ReadonlyArray<unknown>): string {
  return valores.map((v) => (typeof v === "string" ? v : valorDito(v))).join(", ");
}

/** O problema como o Zod 4 o entrega ao mapa: ainda sem `message` e com `input`. */
type Problema = Parameters<z.core.$ZodErrorMap>[0];

function traduzir(issue: Problema): string {
  /*
    Campo ausente é "Campo obrigatório", qualquer que seja a regra que o
    reprovou. No Zod 3 só `invalid_type` carregava o "Required"; no Zod 4 um
    enum, um literal ou uma união obrigatórios que chegam sem o campo
    reprovam com o código da própria regra (`invalid_value`, `invalid_union`),
    e a frase daquela regra imprimia "Valor não reconhecido: undefined". Por
    isso a checagem vem ANTES do `switch`, para todos os códigos. Fora daqui
    ficam os problemas do objeto como um todo (chaves a mais), que não têm
    um campo ausente para apontar.
  */
  if (issue.input === undefined && issue.code !== "unrecognized_keys") {
    return "Campo obrigatório";
  }

  switch (issue.code) {
    case "invalid_type": {
      /* `z.number()` do Zod 4 recusa Infinity como tipo errado; para quem lê
         a frase certa é a do número finito (era o `.finite()` do Zod 3). */
      if (typeof issue.input === "number" && !Number.isNaN(issue.input) && !Number.isFinite(issue.input)) {
        return "Precisa ser um número finito";
      }
      const recebido = tipoRecebido(issue.input);
      /* NaN (por exemplo `z.coerce.number()` sobre "abc") é um `number` para
         o JavaScript: sem este caso a frase saía "Era esperado um número,
         veio um número" (DV-19). */
      if (recebido === "nan" && ["number", "int", "integer", "float"].includes(issue.expected)) {
        return "Precisa ser um número";
      }
      /* `.int()` reprova com "esperava inteiro, veio float": a pergunta é
         sobre a forma do número, e não sobre o tipo do valor. */
      if (issue.expected === "int" || issue.expected === "integer") return "Precisa ser um número inteiro";
      /* Data inválida (`new Date("nada")`) é um Date: o tipo está certo e o
         valor não, como no Zod 3 (`invalid_date`). */
      if (issue.expected === "date" && recebido === "date") return "Data inválida";
      return `${eraEsperado(issue.expected)}, veio ${tipo(recebido)}`;
    }

    case "invalid_value":
      /* Literal tem um valor só; enum tem vários (no Zod 3 eram dois códigos). */
      if (issue.values.length === 1) {
        return `Era esperado exatamente ${valorDito(issue.values[0])}`;
      }
      return `Valor não reconhecido: ${valorDito(issue.input)}. Os aceitos são: ${lista(issue.values)}`;

    case "unrecognized_keys":
      return issue.keys.length === 1
        ? `Campo não reconhecido: ${issue.keys[0]}`
        : `Campos não reconhecidos: ${issue.keys.join(", ")}`;

    case "invalid_union":
      /* União discriminada (no Zod 3, `invalid_union_discriminator`). */
      {
        const opcoes = Array.isArray(issue.options) ? (issue.options as unknown[]) : [];
        if (issue.discriminator !== undefined && opcoes.length > 0) {
          return `Tipo não reconhecido. Os aceitos são: ${opcoes.map((o) => valorDito(o)).join(", ")}`;
        }
      }
      return "Valor inválido";

    case "invalid_format": {
      switch (issue.format) {
        case "includes": return `Precisa conter "${(issue as { includes?: string }).includes}"`;
        case "starts_with": return `Precisa começar com "${(issue as { prefix?: string }).prefix}"`;
        case "ends_with": return `Precisa terminar com "${(issue as { suffix?: string }).suffix}"`;
        case "uuid":
        case "guid": return "Não é um identificador válido (UUID)";
        case "datetime": return "Não é uma data e hora válidas (ISO 8601)";
        case "date": return "Não é uma data válida";
        case "time": return "Não é um horário válido";
        case "email": return "Não é um email válido";
        case "url": return "Não é um endereço válido";
        case "ipv4":
        case "ipv6": return "Não é um endereço IP válido";
        default: return "Formato inválido";
      }
    }

    case "too_small": {
      const { minimum, exact, inclusive, origin } = issue;
      if (origin === "string") {
        if (exact) return `Precisa ter exatamente ${caracteres(minimum)}`;
        if (Number(minimum) === 1 && inclusive) return "Não pode ficar em branco";
        return inclusive
          ? `Precisa ter ao menos ${caracteres(minimum)}`
          : `Precisa ter mais de ${caracteres(minimum)}`;
      }
      if (origin === "array" || origin === "set") {
        if (exact) return `Precisa ter exatamente ${itens(minimum)}`;
        return inclusive
          ? `Precisa ter ao menos ${itens(minimum)}`
          : `Precisa ter mais de ${itens(minimum)}`;
      }
      if (origin === "date") {
        const data = new Date(Number(minimum)).toISOString();
        if (exact) return `Precisa ser exatamente ${data}`;
        return inclusive ? `Precisa ser em ${data} ou depois` : `Precisa ser depois de ${data}`;
      }
      if (exact) return `Precisa ser exatamente ${minimum}`;
      return inclusive
        ? `Precisa ser maior ou igual a ${minimum}`
        : `Precisa ser maior que ${minimum}`;
    }

    case "too_big": {
      const { maximum, exact, inclusive, origin } = issue;
      if (origin === "string") {
        if (exact) return `Precisa ter exatamente ${caracteres(maximum)}`;
        return inclusive
          ? `Precisa ter no máximo ${caracteres(maximum)}`
          : `Precisa ter menos de ${caracteres(maximum)}`;
      }
      if (origin === "array" || origin === "set") {
        if (exact) return `Precisa ter exatamente ${itens(maximum)}`;
        return inclusive
          ? `Precisa ter no máximo ${itens(maximum)}`
          : `Precisa ter menos de ${itens(maximum)}`;
      }
      if (origin === "date") {
        const data = new Date(Number(maximum)).toISOString();
        if (exact) return `Precisa ser exatamente ${data}`;
        return inclusive ? `Precisa ser em ${data} ou antes` : `Precisa ser antes de ${data}`;
      }
      if (exact) return `Precisa ser exatamente ${maximum}`;
      return inclusive
        ? `Precisa ser menor ou igual a ${maximum}`
        : `Precisa ser menor que ${maximum}`;
    }

    case "custom":
      return "Valor inválido";

    case "not_multiple_of":
      return `Precisa ser múltiplo de ${issue.divisor}`;

    default:
      return "Valor inválido";
  }
}

/**
 * O mapa, exportado para quem precisar consultar (o teste) ou instalar por
 * conta própria numa cópia diferente do Zod.
 */
export const mensagensDoZodEmPortugues: z.core.$ZodErrorMap = (issue) => traduzir(issue);

/*
  Instalado no `import`, e não numa função que alguém precise lembrar de
  chamar. `index.ts` importa este arquivo antes dos esquemas: quem usa o
  pacote já recebe as mensagens certas sem saber que isto existe.

  `customError` só é consultado quando a regra NÃO trouxe frase própria, e vem
  antes do idioma embutido do Zod: a ordem de precedência do Zod 4 mantém a
  mensagem explícita vencendo.
*/
z.config({ customError: mensagensDoZodEmPortugues });
