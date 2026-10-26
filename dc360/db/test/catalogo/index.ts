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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import {
  INVARIANTES_QUE_NAO_SE_DISPENSAM,
  type ColunaComUpdate,
  type ContribuicaoDoCatalogo,
  type ExcecaoAoIsolamento,
  type FuncaoPrivilegiada,
} from "./tipos.js";
import { MINIMO_DO_MOTIVO, chaveDaFuncao, type FontesDoCatalogo } from "./conferir.js";

export * from "./tipos.js";
export {
  chaveDaFuncao,
  conferirEsquemas,
  conferirExcecoes,
  conferirFontes,
  conferirFuncoesPrivilegiadas,
  nomeQualificado,
  quemExecuta,
} from "./conferir.js";
export type { ConsultaSql, FontesDoCatalogo } from "./conferir.js";

/**
 * Na ordem de junção. A base primeiro; depois as etapas na ORDEM EM QUE AS
 * MIGRAÇÕES ENTRAM (054 antes de 056, 061 depois de 054), que não é a ordem
 * numérica das etapas. O rótulo é a etapa do arquivo (`f03-e15.ts` é
 * `V2-F03-E15`), e toda entrada do arquivo tem de dizer essa mesma etapa.
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
 * (redefinir o que nunca foi declarado é sinal de nome errado). Toda entrada
 * diz a etapa do arquivo de onde veio (`etapa` igual ao rótulo da
 * contribuição): uma entrada não se passa por outra etapa, nem pela base.
 */
function juntar<T extends { etapa: string; redefine?: true }>(
  nome: string,
  itens: ReadonlyArray<readonly [string, T]>,
  chave: (t: T) => string,
  conferirTroca: (anterior: T, nova: T, de: string) => void = () => undefined,
): T[] {
  const porChave = new Map<string, T>();
  for (const [de, item] of itens) {
    const k = chave(item);
    if (item.etapa !== de) {
      throw new Error(`${nome}: "${k}" está no arquivo de ${de} mas diz etapa "${item.etapa}"`);
    }
    const anterior = porChave.get(k);
    const redefine = item.redefine === true;
    if (anterior && !redefine) {
      throw new Error(`${nome}: "${k}" aparece duas vezes (a segunda em ${de}) sem redefine: true`);
    }
    if (!anterior && redefine) {
      throw new Error(
        `${nome}: "${k}" em ${de} declara redefine: true mas não há entrada anterior`,
      );
    }
    if (anterior) conferirTroca(anterior, item, de);
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

  const funcoes = juntar(
    "FUNCOES_PRIVILEGIADAS",
    deCada((c) => c.funcoes),
    chaveDaFuncao,
    (anterior, nova, de) => {
      if (!(Number(nova.migracao) > Number(anterior.migracao))) {
        throw new Error(
          `FUNCOES_PRIVILEGIADAS: "${chaveDaFuncao(nova)}" em ${de} redefine com a migração ` +
            `${nova.migracao}, que não é maior que a ${anterior.migracao} da entrada substituída`,
        );
      }
    },
  );
  for (const f of funcoes) {
    if (!new RegExp(`^[a-z_][a-z0-9_]*\\.${f.nome}\\(`).test(f.assinatura)) {
      throw new Error(
        `FUNCOES_PRIVILEGIADAS: a assinatura "${f.assinatura}" não é de "${f.nome}" ` +
          "(a forma é esquema.nome(tipo,tipo), sem espaço)",
      );
    }
  }

  /*
    Uma redefinição de exceção (achado 1, sabotagem S8d) não pode ALARGAR a
    exceção: dispensar um invariante que a entrada anterior mantinha é abrir
    uma porta nova com a assinatura de outra etapa. Exceção que precisa
    dispensar mais nasce com nome próprio, revisada como nova.
  */
  const excecoes = juntar(
    "EXCECOES_AO_ISOLAMENTO",
    deCada((c) => c.excecoes),
    (e) => e.tabela,
    (anterior, nova, de) => {
      const alarga = nova.dispensa.filter((i) => !anterior.dispensa.includes(i));
      if (alarga.length) {
        throw new Error(
          `EXCECOES_AO_ISOLAMENTO: "${nova.tabela}" em ${de} redefine a exceção dispensando ` +
            `${alarga.join(", ")}, que a entrada anterior mantinha: redefinição não alarga exceção`,
        );
      }
    },
  );
  for (const [de, c] of contribuicoes) {
    for (const e of c.excecoes) {
      if (e.doFornecedor && de !== "base") {
        throw new Error(
          `EXCECOES_AO_ISOLAMENTO: "${e.tabela}" em ${de} declara doFornecedor: a regra do ` +
            "fornecedor só nasce na base congelada, nunca num arquivo de etapa",
        );
      }
    }
  }
  for (const e of excecoes) {
    const proibida = e.dispensa.filter((i) => INVARIANTES_QUE_NAO_SE_DISPENSAM.includes(i));
    if (proibida.length) {
      throw new Error(
        `EXCECOES_AO_ISOLAMENTO: "${e.tabela}" dispensa ${proibida.join(", ")}, que não se dispensa`,
      );
    }
  }

  const colunasComUpdate = juntar(
    "COLUNAS_COM_UPDATE_DO_APP",
    deCada((c) => c.colunasComUpdate),
    (c) => `${c.tabela}.${c.coluna}`,
  );
  for (const c of colunasComUpdate) {
    if (c.motivo.trim().length < MINIMO_DO_MOTIVO) {
      throw new Error(
        `COLUNAS_COM_UPDATE_DO_APP: "${c.tabela}.${c.coluna}" tem motivo curto demais ` +
          `(mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
      );
    }
  }

  return { funcoes, excecoes, colunasComUpdate };
}

const JUNTADO = juntarCatalogo(CONTRIBUICOES_DO_CATALOGO);

/** Toda função `SECURITY DEFINER` do banco, por assinatura. O teto `<= 27` morreu aqui. */
export const FUNCOES_PRIVILEGIADAS: readonly FuncaoPrivilegiada[] = JUNTADO.funcoes;

/** Toda tabela que dispensa algum invariante do portão, com o que dispensa e o que mantém. */
export const EXCECOES_AO_ISOLAMENTO: readonly ExcecaoAoIsolamento[] = JUNTADO.excecoes;

/** O UPDATE por coluna do papel de aplicação, por nome. */
export const COLUNAS_COM_UPDATE_DO_APP: readonly ColunaComUpdate[] = JUNTADO.colunasComUpdate;

/** A raiz `dc360/`, de onde partem os caminhos de `provas`. */
export const RAIZ_DC360 = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** As migrações e os arquivos de prova do repositório, para `conferirFontes`. */
export function fontesDoRepositorio(): FontesDoCatalogo {
  const pasta = join(RAIZ_DC360, "db", "migrations");
  const migracoes = new Map<string, string>();
  for (const f of readdirSync(pasta)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()) {
    migracoes.set(f.slice(0, 3), readFileSync(join(pasta, f), "utf8"));
  }
  return {
    migracoes,
    ler: (caminho) => {
      const completo = join(RAIZ_DC360, caminho);
      return existsSync(completo) ? readFileSync(completo, "utf8") : null;
    },
  };
}
