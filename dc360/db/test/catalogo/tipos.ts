/**
 * Os tipos do CATÁLOGO NOMINAL do portão de isolamento (V2-F03-E08, parte 0B).
 *
 * Até a F03 o portão (`db/test/isolamento.test.ts`) limitava as funções
 * `SECURITY DEFINER` por um TETO numérico (`<= 27`) e isentava tabelas por dois
 * conjuntos de nomes soltos dentro do arquivo (`SEM_TENANT` e
 * `SEM_POLICY_DE_TENANT`). Teto numérico deixa passar a função errada que
 * ocupa a vaga de outra, e o conjunto solto não guarda o motivo de ninguém. A
 * ADR 0009 (decisão 3, item 4) troca os dois por listas NOMINAIS, conferidas
 * nos dois sentidos contra o catálogo do banco:
 *
 *   - `FUNCOES_PRIVILEGIADAS`: cada função `SECURITY DEFINER`, com nome,
 *     motivo e como ela confere o tenant. Função no banco fora da lista
 *     reprova; entrada na lista sem função no banco reprova.
 *   - `EXCECOES_AO_ISOLAMENTO`: cada tabela sem `organizacao_id` ou sem policy
 *     amarrada ao contexto do município, com motivo e a trava que a prende no
 *     lugar. Tabela sem a coluna fora da lista reprova; entrada na lista que o
 *     banco não confirma (tabela inexistente, ou exceção de que a tabela não
 *     precisa) também.
 *   - `COLUNAS_COM_UPDATE_DO_APP`: o privilégio de UPDATE por coluna que o
 *     papel de aplicação tem, também por nome.
 *
 * Quem cria função, exceção ou coluna com UPDATE na F03 escreve a entrada no
 * arquivo da PRÓPRIA etapa (`f03-eNN.ts`), nunca em `isolamento.test.ts`: o
 * portão fica congelado depois desta parte, e o que muda a cada etapa é o
 * catálogo, onde a entrada nova aparece na revisão com nome e motivo.
 */

/** Os dois papéis do produto a quem uma função privilegiada pode ser concedida. */
export type PapelDoBanco = "dc360_app" | "dc360_console";

/**
 * Como a função decide DE QUAL município está falando. Cada valor é uma
 * resposta diferente, e nenhuma é "não importa":
 *
 *   - `contexto`: roda debaixo do município do contexto (`app_organizacao_atual()`)
 *     e só alcança o que é dele.
 *   - `antes_do_tenant`: roda antes de existir contexto de município (login,
 *     recuperação, renovação, link de uso único). A chave apresentada (e-mail,
 *     hash do token, hash do link) é o único caminho até a organização.
 *   - `relogio`: roda sem ninguém logado, sobre todos os municípios, por
 *     desenho, e a forma dela (sem parâmetro de município, sem filtro livre,
 *     sem dado de pessoa na saída) é o que a mantém estreita.
 *   - `console`: executada pelo console do fornecedor, que não é município; o
 *     que a prende é o operador da sessão (e, nas de eliminação, o dono do
 *     console), não um contexto de município.
 *   - `ainda_nao_confere`: DÍVIDA DECLARADA. A função age sobre um uuid sem
 *     conferir o município do contexto. Exige `corrigidaEm` (a etapa que paga)
 *     e some da lista de dívida quando a etapa a redefine.
 */
export type ConferenciaDoTenant =
  "contexto" | "antes_do_tenant" | "relogio" | "console" | "ainda_nao_confere";

export interface FuncaoPrivilegiada {
  /** `proname`, exatamente como está no catálogo do banco. */
  readonly nome: string;
  /**
   * `pg_get_function_identity_arguments`, exatamente como o catálogo devolve.
   * A chave da função é o par nome + argumentos: sem isso, uma sobrecarga
   * nova de uma função listada passaria pelo nome da irmã.
   */
  readonly argumentos: string;
  /** A migração que fixou a forma atual da função (3 dígitos). */
  readonly migracao: string;
  /** Quem cria a entrada: `base` (antes da F03) ou a etapa, como `V2-F03-E15`. */
  readonly etapa: string;
  /** A quem o `EXECUTE` é concedido, e a mais ninguém (nem `PUBLIC`). */
  readonly executavelPor: readonly PapelDoBanco[];
  /** Por que esta função precisa ser privilegiada e não pode rodar sob o RLS. */
  readonly motivo: string;
  readonly tenant: ConferenciaDoTenant;
  /** Como, concretamente, a função fica presa ao município certo. */
  readonly confere: string;
  /** Obrigatório (e só aceito) quando `tenant` é `ainda_nao_confere`. */
  readonly corrigidaEm?: string;
  /**
   * Uma etapa posterior que REDEFINE uma função já catalogada (nova migração,
   * nova forma de conferir o tenant) declara `redefine: true`: a entrada dela
   * substitui a da etapa anterior. Sem a marca, a mesma função em dois
   * arquivos é erro, para ninguém substituir a entrada de outro sem dizer.
   */
  readonly redefine?: true;
}

export interface ExcecaoAoIsolamento {
  readonly tabela: string;
  /** A tabela não tem a coluna `organizacao_id` (obrigatória). */
  readonly semOrganizacaoId: boolean;
  /**
   * A tabela não tem policy do produto amarrada ao contexto do município
   * (`app_organizacao_atual()`). Só `interesse_municipio` hoje: existe ANTES de
   * qualquer município.
   */
  readonly semPolicyDeTenant: boolean;
  readonly etapa: string;
  readonly motivo: string;
  /** O que prende a tabela no lugar da coluna e da policy que ela não tem. */
  readonly trava: string;
  readonly redefine?: true;
}

export interface ColunaComUpdate {
  readonly tabela: string;
  readonly coluna: string;
  readonly migracao: string;
  readonly etapa: string;
  /** Por que este UPDATE é por coluna e não na tabela inteira. */
  readonly motivo: string;
}

/** O que cada etapa acrescenta ao catálogo. Listas vazias são válidas. */
export interface ContribuicaoDoCatalogo {
  readonly funcoes: readonly FuncaoPrivilegiada[];
  readonly excecoes: readonly ExcecaoAoIsolamento[];
  readonly colunasComUpdate: readonly ColunaComUpdate[];
}
