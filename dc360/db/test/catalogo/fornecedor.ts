/**
 * As policies das tabelas DO FORNECEDOR, cláusula a cláusula (V2-F03-E08,
 * parte 0D, item 4 da auditoria de cobertura da parte 0B).
 *
 * O bloco `DO_FORNECEDOR` de `isolamento.test.ts` cobrava que cada policy de
 * escrita CONTIVESSE a guarda nomeada, e lia `qual` e `with_check` juntos num
 * texto só. Duas portas ficavam abertas: `console_operador_e_dono() OR true`
 * contém a guarda e libera tudo; e uma guarda correta no USING escondia um
 * WITH CHECK irrestrito no UPDATE. Aqui cada policy é declarada INTEIRA, com o
 * texto exato que o Postgres devolve (`pg_get_expr`, como `pg_policies` o
 * mostra) para o USING e para o WITH CHECK, separados, mais o comando, o papel
 * e o modo. Qualquer mudança de texto reprova até alguém reescrever a entrada
 * aqui, e reescrever esta lista é decisão que aparece na revisão.
 *
 * Só a BASE congelada escreve aqui (como `doFornecedor` no catálogo): uma
 * etapa que precise de policy nova numa tabela do fornecedor muda o portão,
 * revisada como tal. As tentativas reais (operador sem autorização lendo e
 * escrevendo) estão no bloco "O fornecedor, cláusula a cláusula" do portão.
 */
export interface PolicyDoFornecedor {
  readonly tabela: string;
  readonly policy: string;
  readonly comando: "SELECT" | "INSERT" | "UPDATE";
  readonly papel: "dc360_console";
  readonly modo: "PERMISSIVE";
  /** O USING, exatamente como `pg_policies.qual`; `null` quando não há. */
  readonly using: string | null;
  /** O WITH CHECK, exatamente como `pg_policies.with_check`; `null` quando não há. */
  readonly withCheck: string | null;
}

export const POLICIES_DO_FORNECEDOR: readonly PolicyDoFornecedor[] = [
  {
    tabela: "console_codigos_de_recuperacao",
    policy: "console_codigos_insercao",
    comando: "INSERT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: null,
    withCheck: "(operador_id = console_operador_atual())",
  },
  {
    tabela: "console_codigos_de_recuperacao",
    policy: "console_codigos_leitura",
    comando: "SELECT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: "(operador_id = console_operador_atual())",
    withCheck: null,
  },
  {
    tabela: "console_operadores",
    policy: "console_operadores_atualizacao",
    comando: "UPDATE",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using:
      "((id = console_operador_atual()) OR ((papel = 'operador'::text) AND console_operador_e_dono()))",
    withCheck:
      "((id = console_operador_atual()) OR ((papel = 'operador'::text) AND console_operador_e_dono()))",
  },
  {
    tabela: "console_operadores",
    policy: "console_operadores_insercao",
    comando: "INSERT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: null,
    withCheck:
      "(((papel = 'operador'::text) AND (criado_por = console_operador_atual()) AND " +
      "console_operador_e_dono()) OR ((papel = 'dono'::text) AND console_sem_operadores()))",
  },
  {
    tabela: "console_operadores",
    policy: "console_operadores_leitura",
    comando: "SELECT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: "true",
    withCheck: null,
  },
  {
    tabela: "eliminacoes_de_municipio",
    policy: "eliminacoes_cancelamento_do_console",
    comando: "UPDATE",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: "(console_operador_e_dono() AND (banco_apagado_em IS NULL))",
    withCheck:
      "(console_operador_e_dono() AND (banco_apagado_em IS NULL) AND (cancelada_em IS NOT NULL))",
  },
  {
    tabela: "eliminacoes_de_municipio",
    policy: "eliminacoes_insercao_do_console",
    comando: "INSERT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: null,
    withCheck:
      "(console_operador_e_dono() AND (cancelada_em IS NULL) AND (banco_apagado_em IS NULL) AND " +
      "(armazenamento_purgado_em IS NULL) AND (concluida_em IS NULL) AND (solicitada_em <= now()))",
  },
  {
    tabela: "eliminacoes_de_municipio",
    policy: "eliminacoes_leitura_do_console",
    comando: "SELECT",
    papel: "dc360_console",
    modo: "PERMISSIVE",
    using: "true",
    withCheck: null,
  },
];
