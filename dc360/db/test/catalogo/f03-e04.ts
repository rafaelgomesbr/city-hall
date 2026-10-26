/**
 * Contribuição da etapa V2-F03-E04 ao catálogo nominal do portão de isolamento.
 *
 * VAZIA DE PROPÓSITO, E CONFERIDA: a migração 053 (domínio de papel e o papel
 * `usuario_orgao`) não cria função privilegiada, não abre exceção ao isolamento
 * e não concede UPDATE por coluna. O que ela cria é:
 *
 *   - três domínios (`papel_de_conta`, `papel_de_autor_administrativo`,
 *     `tipo_de_ator`), que não são objeto do catálogo;
 *   - a troca do tipo de quatro colunas de papel para esses domínios, sem mexer
 *     em ACL de coluna, em RLS, em policy ou em grant de tabela;
 *   - a origem `portal` no CHECK de `trilha_eventos.origem`;
 *   - o gatilho `usuarios_papel_nao_se_converte`, função SECURITY INVOKER
 *     (`usuarios_papel_nao_se_converte()`), que o catálogo de funções
 *     privilegiadas não lista por não ser `SECURITY DEFINER`.
 *
 * A prova de que nada disso entrou no catálogo está em
 * `db/test/dominio-de-papel.test.ts` (o conjunto de `SECURITY DEFINER`, a ACL de
 * coluna, a RLS e as policies ficam idênticos antes e depois da 053) e no
 * próprio portão: `isolamento.test.ts` e `catalogo-nominal.test.ts` continuam
 * verdes sem entrada nova. Se uma correção futura desta etapa precisar de função
 * `SECURITY DEFINER`, exceção ou coluna com UPDATE, a entrada nasce AQUI, e só
 * aqui.
 *
 * Regra de preenchimento (ADR 0009, decisão 3): toda função `SECURITY DEFINER`
 * nova entra em `funcoes` com nome, motivo e como confere o tenant; toda tabela
 * sem `organizacao_id` ou sem policy amarrada ao contexto entra em `excecoes`
 * por nome próprio, com a trava que a prende; todo UPDATE por coluna entra em
 * `colunasComUpdate`. Sem a entrada, o portão reprova. Veja `tipos.ts`.
 */
import type { ContribuicaoDoCatalogo, PreparoDeTabela, TipoProprio } from "./tipos.js";

/*
  Junção do lote 1 da F03. A parte 1A nasceu ANTES do portão comportamental da
  parte 0D, e por isso declarava só listas vazias. O portão novo exige duas
  declarações que a 053 cria a obrigação de fazer, e sem afrouxar o portão:

  1. Os três domínios (`papel_de_conta`, `papel_de_autor_administrativo`,
     `tipo_de_ator`) são tipos próprios no esquema `public` e entram em
     `tiposProprios`, cada um com a finalidade.
  2. A fábrica genérica da prova comportamental não sabe montar uma coluna de
     domínio com lista de valores: as quatro colunas que passaram para domínio
     (`usuarios.papel`, `trilha_eventos.autor_papel`,
     `trilha_administrativa.autor_papel`, `ocorrencia_consultas.usuario_papel`)
     entram em `preparos`, com um valor que o domínio aceita.
*/
const POR_QUE_NAO_VAZA =
  "É só um vocabulário fixo de papéis e de tipos de ator, o mesmo em todo município: nenhum valor traz dado de município nem de pessoa.";

const preparos: readonly PreparoDeTabela[] = [
  {
    tabela: "usuarios",
    colunas: { papel: "'coordenador'" },
    etapa: "V2-F03-E04",
    motivo:
      "A coluna `papel` passou a ser do domínio `papel_de_conta` (053), que só aceita a lista de papéis; o gerador genérico não sabe escolher um valor dela.",
  },
  {
    tabela: "trilha_eventos",
    colunas: { autor_papel: "'coordenador'" },
    etapa: "V2-F03-E04",
    motivo:
      "A coluna `autor_papel` passou a ser do domínio `papel_de_conta` (053); o gerador genérico não sabe escolher um valor dela.",
  },
  {
    tabela: "trilha_administrativa",
    colunas: { autor_papel: "'administrador'" },
    etapa: "V2-F03-E04",
    motivo:
      "A coluna `autor_papel` passou a ser do domínio `papel_de_autor_administrativo` (053); o gerador genérico não sabe escolher um valor dela.",
  },
  {
    tabela: "ocorrencia_consultas",
    colunas: { usuario_papel: "'coordenador'" },
    etapa: "V2-F03-E04",
    motivo:
      "A coluna `usuario_papel` passou a ser do domínio `papel_de_conta` (053); o gerador genérico não sabe escolher um valor dela.",
  },
];

const tiposProprios: readonly TipoProprio[] = [
  {
    tipo: "papel_de_conta",
    etapa: "V2-F03-E04",
    motivo: `Domínio do papel de uma conta no município (os quatro papéis de servidor e \`usuario_orgao\`). ${POR_QUE_NAO_VAZA}`,
  },
  {
    tipo: "papel_de_autor_administrativo",
    etapa: "V2-F03-E04",
    motivo: `Domínio de quem pratica um ato administrativo (os papéis de conta mais \`operador_da_plataforma\`). ${POR_QUE_NAO_VAZA}`,
  },
  {
    tipo: "tipo_de_ator",
    etapa: "V2-F03-E04",
    motivo: `Domínio do tipo de ator de um ato (servidor, usuario_orgao ou sistema); nenhuma coluna o usa ainda. ${POR_QUE_NAO_VAZA}`,
  },
];

export const CATALOGO_F03_E04: ContribuicaoDoCatalogo = {
  funcoes: [],
  excecoes: [],
  colunasComUpdate: [],
  preparos,
  tiposProprios,
};
