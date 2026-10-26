/**
 * Contribuição da etapa V2-F03-E11 ao catálogo nominal do portão de isolamento.
 *
 * VAZIO de propósito: é o andaime da parte 0B (plano da F03, lote 0). Quem
 * preenche é a parte 4A do plano (`docs/roadmap-v2/retomada/plano-f03.md`),
 * junto da migração 059_segundo_fator_na_pessoa.sql, e só este arquivo: `isolamento.test.ts`, `base.ts` e
 * os arquivos das outras etapas ficam congelados para ela.
 *
 * O que entra aqui: o segundo fator na pessoa: tabelas e funções do segundo fator e dos códigos de recuperação, cada uma por nome próprio e com a trava própria declarada.
 *
 * Regra de preenchimento (ADR 0009, decisão 3): toda função `SECURITY DEFINER`
 * nova entra em `funcoes` com nome, motivo e como confere o tenant; toda tabela
 * sem `organizacao_id` ou sem policy amarrada ao contexto entra em `excecoes`
 * por nome próprio, com a trava que a prende; todo UPDATE por coluna entra em
 * `colunasComUpdate`. Sem a entrada, o portão reprova. Veja `tipos.ts`.
 */
import type { ContribuicaoDoCatalogo } from "./tipos.js";

export const CATALOGO_F03_E11: ContribuicaoDoCatalogo = {
  funcoes: [],
  excecoes: [],
  colunasComUpdate: [],
};
