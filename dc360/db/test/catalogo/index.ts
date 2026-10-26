/**
 * O catálogo nominal do portão de isolamento, juntado: o que existe hoje
 * (`base.ts`) mais a contribuição de cada etapa da F03 (`f03-eNN.ts`).
 *
 * `isolamento.test.ts` lê DAQUI, e é esta junção que as etapas alimentam sem
 * encostar no portão. A ordem da lista abaixo é a ordem em que as entradas são
 * juntadas, e importa em um caso só: uma etapa que REDEFINE uma função (nova
 * migração, nova forma de conferir o tenant) vem DEPOIS da que a criou e
 * declara `redefine: true` (ver `tipos.ts`).
 */
import { BASE } from "./base.js";
import { CATALOGO_F03_E04 } from "./f03-e04.js";
import { CATALOGO_F03_E05 } from "./f03-e05.js";
import { CATALOGO_F03_E06 } from "./f03-e06.js";
import { CATALOGO_F03_E08 } from "./f03-e08.js";
import { CATALOGO_F03_E09 } from "./f03-e09.js";
import { CATALOGO_F03_E10 } from "./f03-e10.js";
import { CATALOGO_F03_E11 } from "./f03-e11.js";
import { CATALOGO_F03_E15 } from "./f03-e15.js";
import { CATALOGO_F03_E16 } from "./f03-e16.js";
import { CATALOGO_F03_E17 } from "./f03-e17.js";
import { CATALOGO_F03_E19 } from "./f03-e19.js";
import { CATALOGO_F03_E20 } from "./f03-e20.js";
import { CATALOGO_F03_E21 } from "./f03-e21.js";
import type {
  ColunaComUpdate,
  ContribuicaoDoCatalogo,
  ExcecaoAoIsolamento,
  FuncaoPrivilegiada,
} from "./tipos.js";
import { chaveDaFuncao } from "./conferir.js";

export * from "./tipos.js";
export {
  chaveDaFuncao,
  conferirExcecoes,
  conferirFuncoesPrivilegiadas,
  quemExecuta,
} from "./conferir.js";
export type { ConsultaSql } from "./conferir.js";

/**
 * Na ordem de junção. A base primeiro; depois as etapas na ORDEM EM QUE AS
 * MIGRAÇÕES ENTRAM (054 antes de 056, 061 depois de 054), que não é a ordem
 * numérica das etapas.
 */
export const CONTRIBUICOES_DO_CATALOGO: ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]> = [
  ["base", BASE],
  ["V2-F03-E04", CATALOGO_F03_E04],
  ["V2-F03-E15", CATALOGO_F03_E15],
  ["V2-F03-E05", CATALOGO_F03_E05],
  ["V2-F03-E09", CATALOGO_F03_E09],
  ["V2-F03-E06", CATALOGO_F03_E06],
  ["V2-F03-E10", CATALOGO_F03_E10],
  ["V2-F03-E11", CATALOGO_F03_E11],
  ["V2-F03-E19", CATALOGO_F03_E19],
  ["V2-F03-E08", CATALOGO_F03_E08],
  ["V2-F03-E21", CATALOGO_F03_E21],
  ["V2-F03-E16", CATALOGO_F03_E16],
  ["V2-F03-E17", CATALOGO_F03_E17],
  ["V2-F03-E20", CATALOGO_F03_E20],
];

/**
 * Junta uma lista de entradas na ordem. Duas entradas com a mesma chave são
 * erro, a não ser que a posterior declare `redefine: true`, caso em que ela
 * substitui a anterior; `redefine: true` sem entrada anterior também é erro
 * (redefinir o que nunca foi declarado é sinal de nome errado).
 */
function juntar<T extends object>(
  nome: string,
  itens: ReadonlyArray<readonly [string, T]>,
  chave: (t: T) => string,
): T[] {
  const porChave = new Map<string, T>();
  for (const [de, item] of itens) {
    const k = chave(item);
    const anterior = porChave.has(k);
    const redefine = (item as { redefine?: true }).redefine === true;
    if (anterior && !redefine) {
      throw new Error(`${nome}: "${k}" aparece duas vezes (a segunda em ${de}) sem redefine: true`);
    }
    if (!anterior && redefine) {
      throw new Error(
        `${nome}: "${k}" em ${de} declara redefine: true mas não há entrada anterior`,
      );
    }
    porChave.set(k, item);
  }
  return [...porChave.values()];
}

export interface CatalogoJuntado {
  readonly funcoes: readonly FuncaoPrivilegiada[];
  readonly excecoes: readonly ExcecaoAoIsolamento[];
  readonly colunasComUpdate: readonly ColunaComUpdate[];
}

/** A junção como função pura, para o teste do próprio mecanismo. */
export function juntarCatalogo(
  contribuicoes: ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]>,
): CatalogoJuntado {
  const deCada = <T>(pegar: (c: ContribuicaoDoCatalogo) => readonly T[]) =>
    contribuicoes.flatMap(([de, c]) => pegar(c).map((item) => [de, item] as const));
  return {
    funcoes: juntar(
      "FUNCOES_PRIVILEGIADAS",
      deCada((c) => c.funcoes),
      chaveDaFuncao,
    ),
    excecoes: juntar(
      "EXCECOES_AO_ISOLAMENTO",
      deCada((c) => c.excecoes),
      (e) => e.tabela,
    ),
    colunasComUpdate: juntar(
      "COLUNAS_COM_UPDATE_DO_APP",
      deCada((c) => c.colunasComUpdate),
      (c) => `${c.tabela}.${c.coluna}`,
    ),
  };
}

const JUNTADO = juntarCatalogo(CONTRIBUICOES_DO_CATALOGO);

/** Toda função `SECURITY DEFINER` do esquema, por nome. O teto `<= 27` morreu aqui. */
export const FUNCOES_PRIVILEGIADAS: readonly FuncaoPrivilegiada[] = JUNTADO.funcoes;

/** Toda tabela sem `organizacao_id` ou sem policy de tenant, por nome e com motivo. */
export const EXCECOES_AO_ISOLAMENTO: readonly ExcecaoAoIsolamento[] = JUNTADO.excecoes;

/** O UPDATE por coluna do papel de aplicação, por nome. */
export const COLUNAS_COM_UPDATE_DO_APP: readonly ColunaComUpdate[] = JUNTADO.colunasComUpdate;
