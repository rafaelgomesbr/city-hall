/**
 * Contribuição da etapa V2-F03-E15 ao catálogo nominal do portão de isolamento.
 *
 * VAZIO de propósito: é o andaime da parte 0B (plano da F03, lote 0). Quem
 * preenche é a parte 1B do plano (`docs/roadmap-v2/retomada/plano-f03.md`),
 * junto da migração 054_pessoas_e_conta_no_municipio.sql, e só este arquivo: `isolamento.test.ts`, `base.ts` e
 * os arquivos das outras etapas ficam congelados para ela.
 *
 * O que entra aqui: a tabela `pessoas` como EXCEÇÃO NOMEADA (`semOrganizacaoId: true`, RLS forçada, sem policy, sem grant ao `dc360_app`, as quatro travas da decisão 3 da ADR 0009) e as funções `vigencia_da_sessao` e `credenciais_da_pessoa`, mais o inventário das funções que leem ou gravam a credencial.
 *
 * Regra de preenchimento (ADR 0009, decisão 3): toda função `SECURITY DEFINER`
 * nova entra em `funcoes` com nome, motivo e como confere o tenant; toda tabela
 * sem `organizacao_id` ou sem policy amarrada ao contexto entra em `excecoes`
 * por nome próprio, com a trava que a prende; todo UPDATE por coluna entra em
 * `colunasComUpdate`. Sem a entrada, o portão reprova. Veja `tipos.ts`.
 */
import type { ContribuicaoDoCatalogo } from "./tipos.js";

export const CATALOGO_F03_E15: ContribuicaoDoCatalogo = {
  funcoes: [],
  excecoes: [],
  colunasComUpdate: [],
};
