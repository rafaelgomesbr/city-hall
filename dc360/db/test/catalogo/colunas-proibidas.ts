/**
 * As COLUNAS PROIBIDAS do portão de isolamento (V2-F03-E08, correção 1 da
 * parte 0G, item 1 da auditoria de cobertura).
 *
 * A ADR 0009 (decisão 1, passo 3 da P-04) e o plano da F03 (5A, migração 061)
 * dizem o que a E08 faz com `usuarios`: tira o privilégio de TABELA de INSERT e
 * UPDATE e concede por coluna numa lista positiva SEM a credencial, o e-mail e
 * o `pessoa_id`, e as colunas antigas de credencial ficam sem SELECT. Uma
 * redefinição que encolhe a lista é conferida na junção (só encolhe, salvo
 * ampliação declarada); esta lista é a outra metade: o que, a partir da 061,
 * nenhum papel do produto nem PUBLIC tem, de tabela ou de coluna, e que o
 * catálogo nunca aceita de volta, nem por ampliação declarada.
 *
 * A lista mora AQUI, e não no arquivo de uma etapa, para que nenhuma etapa a
 * encolha editando o próprio arquivo: tirar uma proibição é mudar o portão,
 * revisado como tal. Uma etapa pode ACRESCENTAR proibição no arquivo dela
 * (`colunasProibidas`). Antes da migração `desdeMigracao` existir, só a forma
 * é conferida (hoje o papel de aplicação ainda grava a credencial em
 * `usuarios`, pela redefinição de senha da F00-E09 espelhada na pessoa).
 *
 * A credencial é a do inventário da E15
 * (`docs/evidencias-v2/G03/V2-F03-E15/inventario-da-credencial.md`):
 * `senha_hash`, `falhas_login`, `bloqueado_ate` e `senha_provisoria_ate`.
 */
import type { ColunaProibida } from "./tipos.js";

const ETAPA = "V2-F03-E08";
const DESDE = "061";

const CREDENCIAL = ["senha_hash", "falhas_login", "bloqueado_ate", "senha_provisoria_ate"];

export const COLUNAS_PROIBIDAS_DO_PORTAO: readonly ColunaProibida[] = [
  {
    tabela: "usuarios",
    colunas: [...CREDENCIAL, "email", "pessoa_id"],
    privilegios: ["INSERT", "UPDATE"],
    desdeMigracao: DESDE,
    etapa: ETAPA,
    motivo:
      "Passo 3 da P-04 (ADR 0009, decisão 1; plano da F03, 5A): a credencial e o e-mail passam a " +
      "ser gravados só em `pessoas`, por função nomeada, e quem grava `pessoa_id` escolhe a pessoa " +
      "global a que a conta se liga. Nenhum papel do produto escreve essas colunas da conta.",
  },
  {
    tabela: "usuarios",
    colunas: CREDENCIAL,
    privilegios: ["SELECT"],
    desdeMigracao: DESDE,
    etapa: ETAPA,
    motivo:
      "Passo 3 da P-04: as colunas antigas de credencial da conta ficam esvaziadas e sem SELECT, " +
      "para que nenhuma leitura volte a tomar a conta como fonte da credencial da pessoa.",
  },
];
