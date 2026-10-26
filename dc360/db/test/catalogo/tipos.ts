/**
 * Os tipos do CATÁLOGO NOMINAL do portão de isolamento (V2-F03-E08, parte 0B).
 *
 * Até a F03 o portão (`db/test/isolamento.test.ts`) limitava as funções
 * `SECURITY DEFINER` por um TETO numérico (`<= 27`) e isentava tabelas por dois
 * conjuntos de nomes soltos dentro do arquivo (`SEM_TENANT` e
 * `SEM_POLICY_DE_TENANT`). Teto numérico deixa passar a função errada que
 * ocupa a vaga de outra, e o conjunto solto não guarda o motivo de ninguém. A
 * ADR 0009 (decisão 3, item 4, e o requisito do catálogo da parte 0B) troca os
 * dois por listas NOMINAIS, conferidas nos dois sentidos contra o catálogo do
 * banco:
 *
 *   - `FUNCOES_PRIVILEGIADAS`: cada função `SECURITY DEFINER`, pela assinatura
 *     completa (esquema, nome e tipos dos argumentos, a forma de
 *     `oid::regprocedure`), com motivo, como confere o tenant, a lista exata de
 *     papéis com EXECUTE e o teste comportamental que a exercita. Função no
 *     banco fora da lista reprova; entrada na lista sem função no banco reprova.
 *   - `EXCECOES_AO_ISOLAMENTO`: cada tabela que dispensa algum invariante do
 *     portão, dizendo QUAIS dispensa e QUAIS mantém, com os grants efetivos
 *     papel por papel. O portão confere no banco cada invariante mantido, e não
 *     só o que a tabela dispensa: estar na lista nunca é dispensa geral.
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
 *     e só alcança o que é dele. CONFERIDO: o corpo da função tem de chamar
 *     `app_organizacao_atual`.
 *   - `antes_do_tenant`: roda antes de existir contexto de município (login,
 *     recuperação, renovação, link de uso único). A chave apresentada (e-mail,
 *     hash do token, hash do link) é o único caminho até a organização.
 *   - `relogio`: roda sem ninguém logado, sobre todos os municípios, por
 *     desenho, e a forma dela (sem filtro livre, sem dado de pessoa na saída)
 *     é o que a mantém estreita.
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
   * A CHAVE da função: esquema, nome e tipos dos argumentos de entrada, sem
   * espaço, como `public.trocar_senha(uuid,text,uuid)` (a forma de
   * `oid::regprocedure` com o esquema sempre escrito). Sem os tipos, uma
   * sobrecarga nova de uma função listada passaria pelo nome da irmã; sem o
   * esquema, uma função de mesmo nome noutro esquema também.
   */
  readonly assinatura: string;
  /** A migração que fixou a forma atual da função (3 dígitos). CONFERIDA: é a última que a cria. */
  readonly migracao: string;
  /** Quem cria a entrada: `base` (antes da F03) ou a etapa do arquivo, como `V2-F03-E15`. */
  readonly etapa: string;
  /** A quem o `EXECUTE` é concedido, e a mais ninguém (nem `PUBLIC`, nem com opção de concessão). */
  readonly executavelPor: readonly PapelDoBanco[];
  /** Por que esta função precisa ser privilegiada e não pode rodar sob o RLS. */
  readonly motivo: string;
  readonly tenant: ConferenciaDoTenant;
  /** Como, concretamente, a função fica presa ao município certo. */
  readonly confere: string;
  /** Obrigatório (e só aceito) quando `tenant` é `ainda_nao_confere`. */
  readonly corrigidaEm?: string;
  /**
   * O teste comportamental que chama a função (caminho a partir de `dc360/`).
   * CONFERIDO: o arquivo existe e chama a função pelo nome. Quando não há
   * (ainda), `semProva` diz por quê, e a falta fica à vista na revisão.
   */
  readonly provas?: readonly string[];
  readonly semProva?: string;
  /**
   * Uma etapa posterior que REDEFINE uma função já catalogada (nova migração,
   * nova forma de conferir o tenant) declara `redefine: true`: a entrada dela
   * substitui a da etapa anterior. CONFERIDO: a migração dela é maior que a da
   * entrada substituída e contém `CREATE OR REPLACE FUNCTION` da função. Sem a
   * marca, a mesma função em dois arquivos é erro.
   */
  readonly redefine?: true;
}

/**
 * Os invariantes que o portão cobra de toda tabela de negócio. Uma exceção
 * reparte TODOS eles entre `dispensa` e `mantem`, sem sobra e sem repetição:
 *
 *   - `organizacao_id`: a coluna, obrigatória (NOT NULL);
 *   - `policy_de_contexto`: policy do produto amarrada a `app_organizacao_atual()`;
 *   - `rls_forcada`: RLS ativada E forçada (nunca se dispensa);
 *   - `grants_declarados`: os grants efetivos de tabela e de coluna de
 *     `dc360_app`, `dc360_console` e `PUBLIC` são EXATAMENTE os de `grants`
 *     (nunca se dispensa);
 *   - `fk_com_organizacao`: toda chave estrangeira da tabela para outra tabela
 *     que não `organizacoes` inclui `organizacao_id`;
 *   - `sem_delete`: nenhum papel do produto apaga (sem privilégio de DELETE ou
 *     TRUNCATE e sem policy DELETE ou ALL).
 */
export type Invariante =
  | "organizacao_id"
  | "policy_de_contexto"
  | "rls_forcada"
  | "grants_declarados"
  | "fk_com_organizacao"
  | "sem_delete";

export const INVARIANTES: readonly Invariante[] = [
  "organizacao_id",
  "policy_de_contexto",
  "rls_forcada",
  "grants_declarados",
  "fk_com_organizacao",
  "sem_delete",
];

/** Os invariantes que nenhuma exceção dispensa. */
export const INVARIANTES_QUE_NAO_SE_DISPENSAM: readonly Invariante[] = [
  "rls_forcada",
  "grants_declarados",
];

/** Os papéis cujos grants efetivos uma exceção declara, um por um. */
export type PapelComGrant = "dc360_app" | "dc360_console" | "PUBLIC";

/**
 * Os grants efetivos, papel por papel, como o banco os responde
 * (`has_table_privilege`), em ordem alfabética. Privilégio que o papel só tem
 * em alguma coluna aparece como `"UPDATE (coluna)"`.
 */
export type GrantsEfetivos = Readonly<Record<PapelComGrant, readonly string[]>>;

export interface ExcecaoAoIsolamento {
  readonly tabela: string;
  /** O que a tabela dispensa. Cada item é conferido: dispensa de que ela não precisa reprova. */
  readonly dispensa: readonly Invariante[];
  /** O que a tabela mantém. Cada item é conferido no banco. */
  readonly mantem: readonly Invariante[];
  readonly grants: GrantsEfetivos;
  /**
   * Tabela do CONSOLE DO FORNECEDOR (migrações 038 e 039): sem município, sem
   * policy de contexto, e presa pela regra própria do bloco `DO_FORNECEDOR` de
   * `isolamento.test.ts` (policies só do console, comando a comando, cada
   * escrita apoiada numa guarda nomeada). Só a BASE declara: uma etapa que
   * precise de tabela do fornecedor nova muda o portão, revisada como tal, e
   * não ganha a regra por dizer num arquivo de etapa (achado 1 do revisor).
   */
  readonly doFornecedor?: true;
  readonly etapa: string;
  readonly motivo: string;
  /** O que prende a tabela no lugar do que ela dispensa. */
  readonly trava: string;
  readonly redefine?: true;
}

export interface ColunaComUpdate {
  readonly tabela: string;
  readonly coluna: string;
  readonly migracao: string;
  readonly etapa: string;
  /** Por que este UPDATE é por coluna e não na tabela inteira. Tamanho mínimo conferido. */
  readonly motivo: string;
}

/** O que cada etapa acrescenta ao catálogo. Listas vazias são válidas. */
export interface ContribuicaoDoCatalogo {
  readonly funcoes: readonly FuncaoPrivilegiada[];
  readonly excecoes: readonly ExcecaoAoIsolamento[];
  readonly colunasComUpdate: readonly ColunaComUpdate[];
}
