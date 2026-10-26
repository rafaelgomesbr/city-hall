import type { ZodType } from "zod";

/**
 * Lê as CHAVES de um esquema Zod do registro do contrato (V2-F02-E05), sem
 * validar nada: só para o teste de cliente x rota saber quais campos o corpo ou
 * a consulta de uma rota aceita e quais são obrigatórios.
 *
 * Só olha o primeiro nível de um objeto. Esquema que não é um objeto simples
 * (união, união discriminada, `any`) devolve `null`, e quem chama declara que
 * não deu para ler, em vez de adivinhar.
 */

export type ChavesDoEsquema = {
  /** Nome da chave → obrigatória (não aceita `undefined`). */
  chaves: Map<string, boolean>;
  /** O objeto aceita chave fora da lista (`passthrough`, `catchall`). */
  aceitaOutras: boolean;
};

type Definicao = {
  type?: string;
  shape?: Record<string, ZodType>;
  catchall?: ZodType & { _zod?: { def?: Definicao } };
  in?: ZodType;
  innerType?: ZodType;
  getter?: () => ZodType;
  left?: ZodType;
  right?: ZodType;
};

function definicaoDe(esquema: ZodType): Definicao {
  return (esquema as unknown as { _zod: { def: Definicao } })._zod.def;
}

/** Aceita `undefined`? (opcional, com valor padrão...) */
function aceitaAusente(esquema: ZodType): boolean {
  try {
    return esquema.safeParse(undefined).success;
  } catch {
    // refinamento assíncrono não roda aqui; na dúvida, não exigimos o campo
    return true;
  }
}

export function chavesDoEsquema(esquema: ZodType | undefined): ChavesDoEsquema | null {
  if (!esquema) return null;
  const def = definicaoDe(esquema);
  switch (def.type) {
    case "object": {
      const chaves = new Map<string, boolean>();
      for (const [nome, campo] of Object.entries(def.shape ?? {})) {
        chaves.set(nome, !aceitaAusente(campo));
      }
      // `catchall` ausente = chave desconhecida é descartada; `never` = é recusada.
      const tipoDoResto = def.catchall ? definicaoDe(def.catchall).type : undefined;
      return { chaves, aceitaOutras: tipoDoResto !== undefined && tipoDoResto !== "never" };
    }
    case "pipe":
      return def.in ? chavesDoEsquema(def.in) : null;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "readonly":
    case "catch":
    case "nonoptional":
      return def.innerType ? chavesDoEsquema(def.innerType) : null;
    case "lazy":
      return def.getter ? chavesDoEsquema(def.getter()) : null;
    case "intersection": {
      const e = chavesDoEsquema(def.left);
      const d = chavesDoEsquema(def.right);
      if (!e || !d) return null;
      return {
        chaves: new Map([...e.chaves, ...d.chaves]),
        aceitaOutras: e.aceitaOutras || d.aceitaOutras,
      };
    }
    default:
      return null;
  }
}
