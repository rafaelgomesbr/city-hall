/**
 * Contribuição da etapa V2-F03-E09 ao catálogo nominal do portão de isolamento.
 *
 * VAZIO de propósito: é o andaime da parte 0B (plano da F03, lote 0). Quem
 * preenche é a parte 2C do plano (`docs/roadmap-v2/retomada/plano-f03.md`),
 * junto da migração 056_email_unico_entre_pessoas_ativas.sql, e só este arquivo: `isolamento.test.ts`, `base.ts` e
 * os arquivos das outras etapas ficam congelados para ela.
 *
 * O que entra aqui: o gatilho `pessoa_acompanha_as_contas` e a redefinição de `credenciais_da_pessoa` (esta com `redefine: true`, a entrada original vem da parte 1B, arquivo `f03-e15.ts`).
 *
 * Regra de preenchimento (ADR 0009, decisão 3): toda função `SECURITY DEFINER`
 * nova entra em `funcoes` com nome, motivo e como confere o tenant; toda tabela
 * sem `organizacao_id` ou sem policy amarrada ao contexto entra em `excecoes`
 * por nome próprio, com a trava que a prende; todo UPDATE por coluna entra em
 * `colunasComUpdate`. Sem a entrada, o portão reprova. Veja `tipos.ts`.
 */
import type { ContribuicaoDoCatalogo } from "./tipos.js";

export const CATALOGO_F03_E09: ContribuicaoDoCatalogo = {
  funcoes: [],
  excecoes: [],
  colunasComUpdate: [],
};
