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
import type { ContribuicaoDoCatalogo } from "./tipos.js";

export const CATALOGO_F03_E04: ContribuicaoDoCatalogo = {
  funcoes: [],
  excecoes: [],
  colunasComUpdate: [],
};
