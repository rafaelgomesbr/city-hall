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
import { COLUNAS_PROIBIDAS_DO_PORTAO } from "./colunas-proibidas.js";
import {
  INVARIANTES_QUE_NAO_SE_DISPENSAM,
  type ChaveParaTabelaGlobal,
  type ColunaProibida,
  type ColunaComPrivilegio,
  type ColunaComUpdate,
  type ContribuicaoDoCatalogo,
  type ExcecaoAoIsolamento,
  type FuncaoPrivilegiada,
  type LeituraDeExtensao,
  type PolicyRestritiva,
  type PreparoDeTabela,
  type PrivilegioDeColuna,
  type SequenciaDoProduto,
  type TabelaSemProvaComportamental,
  type TipoProprio,
  type VisaoSemInvoker,
} from "./tipos.js";
import { MINIMO_DO_MOTIVO, chaveDaFuncao, type FontesDoCatalogo } from "./conferir.js";

export * from "./tipos.js";
export {
  chaveDaFuncao,
  conferirChavesEstrangeiras,
  conferirColunasProibidas,
  conferirCriacaoDeObjetos,
  conferirDeclaracoesCompletas,
  conferirDisparoDosGatilhos,
  conferirEliminacaoSemMunicipio,
  conferirEsquemas,
  conferirExcecoes,
  conferirFontes,
  conferirFuncoesPrivilegiadas,
  conferirGatilhosPrivilegiados,
  conferirPrivilegiosDeColuna,
  nomeQualificado,
  provarRecusaForaDaTabela,
  quemExecuta,
} from "./conferir.js";
export type {
  BancoComTransacao,
  BancoDescartavel,
  ConsultaSql,
  FontesDoCatalogo,
} from "./conferir.js";
export {
  HistoricoDasDefinicoes,
  composicoesDePolicies,
  conferirAclDeExtensoes,
  conferirCorpoDasFuncoes,
  conferirDefinicaoInstalada,
  conferirGatilhoForaDoAlcance,
  conferirMarcaDeLiberacao,
  conferirModoDasPolicies,
  conferirPoliciesDoFornecedor,
  conferirQuemCitaOrigensDeConta,
  conferirLeitoraDeOrigem,
  conferirSequenciasETipos,
  conferirVisoes,
  definicoesInstaladas,
  foraDoModelo,
} from "./conferir-objetos.js";
export {
  SEARCH_PATH_DA_LEITORA,
  TIPOS_DA_LEITORA,
  conferirCorpoDaLeitora,
  simbolosDoCorpo,
} from "./leitora.js";
export {
  comoAtor,
  ident,
  provarIsolamento,
  provarTabela,
  provarVisoes,
  semear,
  tabelasDaProva,
  visoesLegiveis,
} from "./comportamental.js";
export type {
  Ator,
  BancoDaProva,
  RelatorioDaProva,
  Semeadura,
  TransacaoSql,
} from "./comportamental.js";
export { POLICIES_DO_FORNECEDOR } from "./fornecedor.js";
export type { PolicyDoFornecedor } from "./fornecedor.js";

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
  readonly preparos: readonly PreparoDeTabela[];
  readonly semProvaComportamental: readonly TabelaSemProvaComportamental[];
  readonly policiesRestritivas: readonly PolicyRestritiva[];
  readonly visoesSemInvoker: readonly VisaoSemInvoker[];
  readonly tiposProprios: readonly TipoProprio[];
  readonly sequencias: readonly SequenciaDoProduto[];
  readonly leiturasDeExtensao: readonly LeituraDeExtensao[];
  /** Parte 0G: os grupos de privilégio por coluna, como declarados (por tabela, papel e privilégio). */
  readonly privilegiosDeColuna: readonly PrivilegioDeColuna[];
  /**
   * Parte 0G: TODO privilégio de coluna, achatado coluna a coluna, os grupos
   * de `privilegiosDeColuna` mais o UPDATE do `dc360_app` de `colunasComUpdate`.
   * É o que a conferência compara com o banco.
   */
  readonly privilegiosDeColunaAchatados: readonly ColunaComPrivilegio[];
  /** Parte 0G: as chaves estrangeiras sem `organizacao_id` para tabela global. */
  readonly chavesParaGlobais: readonly ChaveParaTabelaGlobal[];
  /** Correção 1 da 0G: as colunas proibidas, as do portão mais as que as etapas acrescentam. */
  readonly colunasProibidas: readonly ColunaProibida[];
}

/**
 * O regime de uma exceção, para a redefinição preservar (correção 1 da 0G):
 * a exceção comum, a do fornecedor, ou a sem município com a espécie e o
 * destino na eliminação.
 */
function regimeDaExcecao(e: ExcecaoAoIsolamento): string {
  if (e.semMunicipio) {
    return `sem município ${e.semMunicipio.especie}, ${e.semMunicipio.naEliminacao.destino} na eliminação`;
  }
  return e.doFornecedor ? "do fornecedor" : "exceção comum";
}

/**
 * A junção como função pura, para o teste do próprio mecanismo. As colunas
 * proibidas do portão (`colunas-proibidas.ts`) entram à parte, porque não são
 * de etapa nenhuma: a junção do catálogo real as passa, e as sondas passam as
 * delas.
 */
export function juntarCatalogo(
  contribuicoes: ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]>,
  proibidasDoPortao: readonly ColunaProibida[] = [],
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
      // Correção 2 da ADR 0009: a marca do caminho antigo não sai numa redefinição.
      if (anterior.recusadaDepoisDaLiberacao && !nova.recusadaDepoisDaLiberacao) {
        throw new Error(
          `FUNCOES_PRIVILEGIADAS: "${chaveDaFuncao(nova)}" em ${de} redefine uma função marcada ` +
            '"recusada depois da liberação" sem a marca: função do caminho antigo não deixa de sê-lo',
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
      /*
        Correção 1 da 0G (item 2 da auditoria): o REGIME se preserva. Tirar
        `semMunicipio` de uma tabela protegida a devolvia à exceção comum (que
        aceita o INSERT do app com policy de INSERT) e a tirava da prova da
        eliminação; trocar `protegida` por `global` a tornava alvo aceito de
        chave sem município; trocar o destino na eliminação muda o que acontece
        com a linha de quem foi eliminado. Qualquer transição de regime é
        ampliação de exceção, e ampliação não se faz por redefinição: a regra
        de cima, sem caminho de volta.
      */
      const regime = regimeDaExcecao(anterior);
      const novo = regimeDaExcecao(nova);
      if (regime !== novo) {
        throw new Error(
          `EXCECOES_AO_ISOLAMENTO: "${nova.tabela}" em ${de} redefine a exceção trocando o regime ` +
            `(${regime} para ${novo}): o regime de uma exceção se preserva, e mudá-lo é ampliar a ` +
            "exceção, o que uma redefinição não faz",
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

  /*
    As listas da parte 0D: a mesma junção (etapa igual à do arquivo, nada em
    duplicidade sem `redefine`), e a mesma exigência de motivo escrito.
  */
  const comMotivo = <T extends { etapa: string; motivo: string; redefine?: true }>(
    nome: string,
    itens: T[],
    chave: (t: T) => string,
  ): T[] => {
    for (const i of itens) {
      if (i.motivo.trim().length < MINIMO_DO_MOTIVO) {
        throw new Error(
          `${nome}: "${chave(i)}" tem motivo curto demais (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
        );
      }
    }
    return itens;
  };
  const lista = <T extends { etapa: string; motivo: string; redefine?: true }>(
    nome: string,
    pegar: (c: ContribuicaoDoCatalogo) => readonly T[] | undefined,
    chave: (t: T) => string,
  ): T[] =>
    comMotivo(
      nome,
      juntar(
        nome,
        deCada((c) => pegar(c) ?? []),
        chave,
      ),
      chave,
    );

  /*
    Parte 0G. O regime de tabela sem município não se soma ao do fornecedor,
    e o porquê do destino na eliminação tem de estar escrito.
  */
  for (const e of excecoes) {
    if (e.semMunicipio && e.doFornecedor) {
      throw new Error(
        `EXCECOES_AO_ISOLAMENTO: "${e.tabela}" declara semMunicipio e doFornecedor, regimes que se excluem`,
      );
    }
    if (e.semMunicipio && e.semMunicipio.naEliminacao.porque.trim().length < MINIMO_DO_MOTIVO) {
      throw new Error(
        `EXCECOES_AO_ISOLAMENTO: "${e.tabela}" tem o porquê do destino na eliminação curto demais ` +
          `(mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
      );
    }
  }

  /*
    Parte 0G: o privilégio por coluna generalizado. Um grupo por tabela, papel
    e privilégio; `redefine` (a E08 encolhendo a lista de `usuarios`) só com
    migração maior. O mesmo grupo não se declara também em `colunasComUpdate`:
    duas fontes para a mesma lista é como uma delas envelhece.
  */
  /*
    Correção 1 da 0G (item 1): as COLUNAS PROIBIDAS, as do portão
    (`colunas-proibidas.ts`) e as que uma etapa acrescenta. Nunca se redefinem
    (uma proibição não se afrouxa por arquivo de etapa) e não se repetem.
  */
  const colunasProibidas = comMotivo(
    "COLUNAS_PROIBIDAS",
    juntar(
      "COLUNAS_PROIBIDAS",
      [
        ...proibidasDoPortao.map((p) => [p.etapa, p] as const),
        ...deCada((c) => c.colunasProibidas ?? []),
      ],
      (p) =>
        `${p.tabela}:${[...p.colunas].sort().join(",")}:${[...p.privilegios].sort().join(",")}`,
      (_anterior, nova, de) => {
        throw new Error(
          `COLUNAS_PROIBIDAS: "${nova.tabela}" em ${de} redefine uma proibição: proibição não se redefine`,
        );
      },
    ),
    (p) => p.tabela,
  );
  const proibido = new Set<string>();
  for (const p of colunasProibidas) {
    if (!/^\d{3}$/.test(p.desdeMigracao) || p.colunas.length === 0 || p.privilegios.length === 0) {
      throw new Error(
        `COLUNAS_PROIBIDAS: "${p.tabela}" precisa de desdeMigracao com 3 dígitos, colunas e privilégios`,
      );
    }
    for (const coluna of p.colunas) {
      for (const privilegio of p.privilegios) {
        const k = `${p.tabela}.${coluna}:${privilegio}`;
        if (proibido.has(k)) {
          throw new Error(`COLUNAS_PROIBIDAS: "${k}" proibida duas vezes`);
        }
        proibido.add(k);
      }
    }
  }

  const chaveDoGrupo = (p: PrivilegioDeColuna) => `${p.papel}:${p.tabela}:${p.privilegio}`;
  for (const [de, c] of contribuicoes) {
    for (const p of c.privilegiosDeColuna ?? []) {
      if (p.ampliacao && !p.redefine) {
        throw new Error(
          `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(p)}" em ${de} declara ampliacao sem redefine: ` +
            "a primeira declaração de um grupo não amplia nada",
        );
      }
    }
  }
  const privilegiosDeColuna = comMotivo(
    "PRIVILEGIOS_DE_COLUNA",
    juntar(
      "PRIVILEGIOS_DE_COLUNA",
      deCada((c) => c.privilegiosDeColuna ?? []),
      chaveDoGrupo,
      (anterior, nova, de) => {
        if (!(Number(nova.migracao) > Number(anterior.migracao))) {
          throw new Error(
            `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(nova)}" em ${de} redefine com a migração ` +
              `${nova.migracao}, que não é maior que a ${anterior.migracao} da entrada substituída`,
          );
        }
        /*
          Correção 1 da 0G (item 1 da auditoria): a redefinição SÓ ENCOLHE. O
          conjunto novo é comparado com o anterior, e o que ela acrescenta tem
          de ser EXATAMENTE a ampliação declarada, com a justificativa. Sem
          isso, uma etapa recolocava `senha_hash` no UPDATE de `usuarios`
          depois da E08, e o grant correspondente passava.
        */
        const acrescenta = nova.colunas.filter((c) => !anterior.colunas.includes(c)).sort();
        const declarada = [...(nova.ampliacao?.colunas ?? [])].sort();
        if (acrescenta.length && !nova.ampliacao) {
          throw new Error(
            `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(nova)}" em ${de} redefine AMPLIANDO a lista ` +
              `(${acrescenta.join(", ")}) sem declarar a ampliação: redefinição só encolhe`,
          );
        }
        if (nova.ampliacao) {
          if (JSON.stringify(acrescenta) !== JSON.stringify(declarada) || declarada.length === 0) {
            throw new Error(
              `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(nova)}" em ${de} declara a ampliação ` +
                `(${declarada.join(", ") || "nada"}), e a redefinição acrescenta ` +
                `(${acrescenta.join(", ") || "nada"}) à lista anterior`,
            );
          }
          if (nova.ampliacao.justificativa.trim().length < MINIMO_DO_MOTIVO) {
            throw new Error(
              `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(nova)}" em ${de} amplia a lista com a ` +
                `justificativa curta demais (mínimo ${MINIMO_DO_MOTIVO} caracteres)`,
            );
          }
          const vetada = declarada.filter((c) =>
            proibido.has(`${nova.tabela}.${c}:${nova.privilegio}`),
          );
          if (vetada.length) {
            throw new Error(
              `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(nova)}" em ${de} amplia a lista com ` +
                `${vetada.join(", ")}, coluna proibida (COLUNAS_PROIBIDAS): nunca se aceita de volta`,
            );
          }
        }
      },
    ),
    chaveDoGrupo,
  );
  for (const p of privilegiosDeColuna) {
    if (p.colunas.length === 0 || new Set(p.colunas).size !== p.colunas.length) {
      throw new Error(
        `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(p)}" sem colunas, ou com coluna repetida`,
      );
    }
    if (p.papel === "dc360_app" && p.privilegio === "UPDATE") {
      const tambem = colunasComUpdate.filter((c) => c.tabela === p.tabela);
      if (tambem.length) {
        throw new Error(
          `PRIVILEGIOS_DE_COLUNA: "${chaveDoGrupo(p)}" também está em COLUNAS_COM_UPDATE_DO_APP ` +
            `(${tambem.map((c) => c.coluna).join(", ")}): o UPDATE por coluna de uma tabela mora num lugar só`,
        );
      }
    }
  }
  const privilegiosDeColunaAchatados: ColunaComPrivilegio[] = [
    ...colunasComUpdate.map((c) => ({
      tabela: c.tabela,
      coluna: c.coluna,
      papel: "dc360_app" as const,
      privilegio: "UPDATE" as const,
      etapa: c.etapa,
    })),
    ...privilegiosDeColuna.flatMap((p) =>
      p.colunas.map((coluna) => ({
        tabela: p.tabela,
        coluna,
        papel: p.papel,
        privilegio: p.privilegio,
        etapa: p.etapa,
      })),
    ),
  ];

  return {
    funcoes,
    excecoes,
    colunasComUpdate,
    privilegiosDeColuna,
    privilegiosDeColunaAchatados,
    colunasProibidas,
    chavesParaGlobais: lista(
      "CHAVES_PARA_GLOBAIS",
      (c) => c.chavesParaGlobais,
      (k) => `${k.tabela}.${k.restricao}`,
    ),
    preparos: lista(
      "PREPAROS",
      (c) => c.preparos,
      (p) => p.tabela,
    ),
    semProvaComportamental: lista(
      "SEM_PROVA_COMPORTAMENTAL",
      (c) => c.semProvaComportamental,
      (s) => s.tabela,
    ),
    policiesRestritivas: lista(
      "POLICIES_RESTRITIVAS",
      (c) => c.policiesRestritivas,
      (p) => `${p.tabela}.${p.policy}`,
    ),
    visoesSemInvoker: lista(
      "VISOES_SEM_INVOKER",
      (c) => c.visoesSemInvoker,
      (v) => v.visao,
    ),
    tiposProprios: lista(
      "TIPOS_PROPRIOS",
      (c) => c.tiposProprios,
      (t) => t.tipo,
    ),
    sequencias: lista(
      "SEQUENCIAS_DO_PRODUTO",
      (c) => c.sequencias,
      (s) => s.sequencia,
    ),
    leiturasDeExtensao: lista(
      "LEITURAS_DE_EXTENSAO",
      (c) => c.leiturasDeExtensao,
      (l) => `${l.extensao}:${l.relacao}:${l.papel}`,
    ),
  };
}

const JUNTADO = juntarCatalogo(CONTRIBUICOES_DO_CATALOGO, COLUNAS_PROIBIDAS_DO_PORTAO);

/** Toda função `SECURITY DEFINER` do banco, por assinatura. O teto `<= 27` morreu aqui. */
export const FUNCOES_PRIVILEGIADAS: readonly FuncaoPrivilegiada[] = JUNTADO.funcoes;

/** Toda tabela que dispensa algum invariante do portão, com o que dispensa e o que mantém. */
export const EXCECOES_AO_ISOLAMENTO: readonly ExcecaoAoIsolamento[] = JUNTADO.excecoes;

/** O UPDATE por coluna do papel de aplicação, por nome. */
export const COLUNAS_COM_UPDATE_DO_APP: readonly ColunaComUpdate[] = JUNTADO.colunasComUpdate;

/**
 * Parte 0G: TODO privilégio por coluna (INSERT, SELECT, UPDATE) de `dc360_app`
 * e `dc360_console`, achatado coluna a coluna (os grupos de
 * `privilegiosDeColuna` mais `COLUNAS_COM_UPDATE_DO_APP`).
 */
export const PRIVILEGIOS_DE_COLUNA: readonly ColunaComPrivilegio[] =
  JUNTADO.privilegiosDeColunaAchatados;
/** Parte 0G: as chaves estrangeiras sem `organizacao_id` para tabela global, por nome. */
export const CHAVES_PARA_GLOBAIS: readonly ChaveParaTabelaGlobal[] = JUNTADO.chavesParaGlobais;
/** Correção 1 da 0G: as colunas proibidas (as do portão mais as das etapas). */
export const COLUNAS_PROIBIDAS: readonly ColunaProibida[] = JUNTADO.colunasProibidas;
export { COLUNAS_PROIBIDAS_DO_PORTAO };

/** Parte 0D: como a fábrica da prova comportamental monta a linha de cada tabela que precisa. */
export const PREPAROS: readonly PreparoDeTabela[] = JUNTADO.preparos;
/** Parte 0D: tabela que a prova comportamental não consegue semear, com o motivo. */
export const SEM_PROVA_COMPORTAMENTAL: readonly TabelaSemProvaComportamental[] =
  JUNTADO.semProvaComportamental;
/** Parte 0D: policy RESTRICTIVE, por nome (o padrão é PERMISSIVE). */
export const POLICIES_RESTRITIVAS: readonly PolicyRestritiva[] = JUNTADO.policiesRestritivas;
/** Parte 0D: visão lida por papel do produto que não roda como quem consulta. */
export const VISOES_SEM_INVOKER: readonly VisaoSemInvoker[] = JUNTADO.visoesSemInvoker;
/** Parte 0D: tipo próprio, com a finalidade. */
export const TIPOS_PROPRIOS: readonly TipoProprio[] = JUNTADO.tiposProprios;
/** Parte 0D: sequência, com os privilégios efetivos de cada papel do produto. */
export const SEQUENCIAS_DO_PRODUTO: readonly SequenciaDoProduto[] = JUNTADO.sequencias;
/** Parte 0D: relação de extensão que um papel do produto lê. */
export const LEITURAS_DE_EXTENSAO: readonly LeituraDeExtensao[] = JUNTADO.leiturasDeExtensao;

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
