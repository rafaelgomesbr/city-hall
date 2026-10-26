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
 * A parte 0G acrescenta as formas que a ADR 0009 pedia e o portão não sabia
 * dizer: privilégio por coluna de INSERT, SELECT e UPDATE, por tabela e papel
 * (`PrivilegioDeColuna`); a tabela sem município com regime próprio, `global`
 * ou `protegida`, com o destino na eliminação de município provado
 * (`RegimeSemMunicipio`); a chave estrangeira sem `organizacao_id` só para
 * tabela `global` e só por nome (`ChaveParaTabelaGlobal`); e a função de
 * gatilho privilegiada sem EXECUTE de ninguém, presa às tabelas declaradas e
 * conferindo a que a disparou (`gatilhoEm`).
 *
 * A correção 1 da 0G fecha o que a auditoria de cobertura achou aberto: a
 * redefinição de privilégio por coluna só encolhe (`ampliacao` declarada à
 * parte) e há `ColunaProibida`; a redefinição de exceção preserva o regime; o
 * destino na eliminação é provado com COMMIT, âncora e outro município
 * (`semearOutroMunicipio`, `compartilhar`); a função de gatilho declara os
 * `gatilhos` e é provada recusando fora da tabela; e a chave para a global
 * declara `colunasReferenciadas`.
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
  /**
   * LISTA NOMINAL do corpo (parte 0D, correção 2 da ADR 0009): o corpo de uma
   * função privilegiada não contém DDL (`ALTER`, `CREATE`, `DROP`, `TRUNCATE`,
   * `GRANT`, `REVOKE`, `DISABLE TRIGGER`), não mexe em
   * `session_replication_role` (nem no corpo nem no `SET` da função) e só
   * aceita `EXECUTE` de texto montado na forma `EXECUTE format('<DML
   * constante>', ...)`, com o modelo começando por SELECT, INSERT, UPDATE ou
   * DELETE e só `%I`, `%L` ou `%%` dentro dele (o `format('DELETE FROM %I
   * ...')` da 038). Fora disso a função precisa deste campo, com o porquê; e o
   * campo sem nada que o justifique no corpo reprova (isenção que sobrou).
   */
  readonly corpoForaDoModelo?: string;
  /**
   * A marca "recusada depois da liberação" (decisão 1 da ADR 0009, correção
   * 2): função do CAMINHO ANTIGO, cujo contrato supõe uma conta por pessoa, e
   * que a migração da liberação (064, E16) faz recusar pela marca de
   * liberação. Hoje só a forma é conferida (ver `conferirMarcaDeLiberacao`):
   * antes da liberação a função continua executável pelo papel de aplicação;
   * depois dela, não. Uma redefinição não tira a marca.
   */
  readonly recusadaDepoisDaLiberacao?: true;
  /**
   * Quem grava a ORIGEM de uma conta em `origens_de_conta` (decisão 1 da ADR
   * 0009, correção 3): só a função do gatilho criador (`criador`) e
   * `aceitar_convite` (`aceite`) podem citar a tabela no corpo. CONFERIDO
   * (`conferirQuemCitaOrigensDeConta`): função do banco que cita a tabela sem
   * esta marca reprova; `aceite` só em `aceitar_convite`; cada marca em uma
   * função só; marca em função que não cita a tabela reprova.
   */
  readonly gravaOrigemDeConta?: "criador" | "aceite";
  /**
   * FUNÇÃO DE GATILHO privilegiada (retorna `trigger`), parte 0G. Obrigatório
   * (e só aceito) quando a função retorna `trigger`: as tabelas cujos gatilhos
   * a chamam, como o catálogo nominal escreve o nome (nu em `public`).
   *
   * O caminho que isto fecha: com EXECUTE na função e TEMP no banco, o
   * `dc360_app` criava uma tabela temporária com o MESMO NOME de uma tabela real
   * (`pg_temp.usuarios`), anexava a ela o gatilho privilegiado e o fazia gravar
   * em tabela protegida como o dono. Por isso, CONFERIDO
   * (`conferirGatilhosPrivilegiados`): os gatilhos do banco que chamam a função
   * estão exatamente nestas tabelas; o corpo confere a tabela que disparou por
   * `TG_RELID` (ou por `TG_TABLE_SCHEMA` e `TG_TABLE_NAME` juntos) e cita cada
   * uma delas; e `executavelPor` é VAZIO, porque quem executa função de gatilho
   * é o gatilho, não o papel (nenhum papel do produto, nem PUBLIC, tem EXECUTE).
   */
  readonly gatilhoEm?: readonly string[];
  /**
   * OS GATILHOS que chamam a função de gatilho privilegiada, um por um
   * (correção 1 da parte 0G, item 7 da auditoria de cobertura). Obrigatório
   * (e só aceito) junto de `gatilhoEm`: as tabelas destes gatilhos são
   * exatamente as de `gatilhoEm`. CONFERIDO (`conferirDisparoDosGatilhos`)
   * contra `pg_trigger`, nos dois sentidos: o mesmo conjunto de gatilhos (por
   * tabela e nome), e de cada um o momento, o nível, os eventos, as colunas
   * do `UPDATE OF`, a condição `WHEN` e o adiamento; e todo gatilho
   * HABILITADO (`tgenabled` `O` ou `A`: nem desabilitado, nem só para réplica).
   * Sem isso, uma migração desabilitava o gatilho, o deixava só para réplica
   * ou mudava o evento e a condição, e `gatilhoEm` continuava batendo.
   */
  readonly gatilhos?: readonly GatilhoDeclarado[];
  /**
   * A LINHA REAL da prova da recusa fora da tabela (correção 2 da parte 0G,
   * dívida do item 6). SQL rodado como dono, numa transação desfeita, com
   * `:org` trocado por um município novo criado ali, que põe pelo menos uma
   * linha de verdade em cada tabela de `gatilhoEm` (pelo caminho de produção,
   * com os gatilhos reais disparando, e por isso com as chaves ancoradas nas
   * tabelas que a função pode alcançar). Obrigatório junto de `gatilhoEm` no
   * catálogo juntado (`conferirDeclaracoesCompletas`). Sem ela, com a tabela
   * vazia, a prova só tinha a linha nula, e uma escrita feita antes da recusa
   * e chaveada por `NEW` não mudava linha nenhuma e passava.
   */
  readonly semearParaProva?: string;
}

/** Um gatilho de uma função de gatilho privilegiada, como o banco o tem (correção 1 da 0G). */
export interface GatilhoDeclarado {
  /** A tabela, como o catálogo escreve o nome (nu em `public`). */
  readonly tabela: string;
  /** `pg_trigger.tgname`. */
  readonly nome: string;
  readonly momento: "BEFORE" | "AFTER" | "INSTEAD OF";
  readonly nivel: "ROW" | "STATEMENT";
  /** Os eventos, em qualquer ordem (a conferência ordena). */
  readonly eventos: readonly ("INSERT" | "UPDATE" | "DELETE" | "TRUNCATE")[];
  /** As colunas de `UPDATE OF`, na ordem em que o banco as guarda; ausente quando não há. */
  readonly colunasDoUpdate?: readonly string[];
  /**
   * A condição `WHEN`, exatamente como `pg_get_triggerdef` a escreve, sem o
   * `WHEN (` e o `)` de fora; ausente quando não há.
   */
  readonly quando?: string;
  /** Gatilho de restrição adiável: `INITIALLY DEFERRED` ou `INITIALLY IMMEDIATE`; ausente quando não é adiável. */
  readonly adiado?: "INITIALLY DEFERRED" | "INITIALLY IMMEDIATE";
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
  /**
   * TABELA SEM MUNICÍPIO com regime próprio (parte 0G): `global` (a `pessoas`
   * da ADR 0009, a única espécie que pode ser ALVO de chave estrangeira sem
   * `organizacao_id`, e só pelas chaves de `chavesParaGlobais`) ou `protegida`
   * (a `origens_de_conta`: registro que nenhum papel do produto alcança). Ver
   * `RegimeSemMunicipio`. Opcional: sem ele, a exceção é a de sempre, e não
   * pode ser alvo de chave estrangeira.
   */
  readonly semMunicipio?: RegimeSemMunicipio;
}

/**
 * O regime de uma tabela SEM MUNICÍPIO que o portão aceita por nome (parte
 * 0G). As duas espécies MANTÊM, conferido no banco: RLS ativada e forçada;
 * NENHUM privilégio de `dc360_app`, `dc360_console` ou PUBLIC, de tabela ou de
 * coluna, nem SELECT (os `grants` declarados são vazios e o banco confirma);
 * NENHUMA policy, de papel nenhum; e nenhum DELETE. Dispensam
 * `organizacao_id` e a policy de contexto, e só isso (o resto é cobrado).
 *
 *   - `global`: a linha vale em todo município (a pessoa). É o único alvo
 *     aceito de chave estrangeira sem `organizacao_id`, e só pelas chaves
 *     declaradas em `chavesParaGlobais`.
 *   - `protegida`: registro que nenhum papel do produto lê nem escreve (só
 *     função privilegiada nomeada). Não é alvo de chave estrangeira.
 *
 * Nas DUAS, o destino na ELIMINAÇÃO DE MUNICÍPIO é declarado e PROVADO
 * (`naEliminacao`): o portão cria um município, semeia, executa a eliminação
 * de verdade (`executar_eliminacoes_vencidas` e `concluir_eliminacao`, numa
 * transação desfeita no fim) e confere se as linhas ligadas ao município
 * ficaram ou sumiram, como o catálogo diz.
 */
export interface RegimeSemMunicipio {
  readonly especie: "global" | "protegida";
  readonly naEliminacao: DestinoNaEliminacao;
}

export interface DestinoNaEliminacao {
  /**
   * `fica`: as linhas ligadas ao município sobrevivem à eliminação; `some`:
   * saem com ele. A prova (correção 1 da 0G) roda num banco DESCARTÁVEL, cópia
   * do banco do portão, com COMMIT de verdade em cada passo (semeadura, fase 1
   * e fase 2 em transações separadas, como o relógio faz, as duas fases como
   * `dc360_app`), então gatilho `DEFERRABLE INITIALLY DEFERRED` dispara; as
   * chaves listadas existem na tabela e na coluna declaradas ANTES da
   * eliminação (âncora); e as linhas do OUTRO município (`semearOutroMunicipio`)
   * e toda linha da tabela fora do município eliminado ficam intactas, valor
   * por valor.
   */
  readonly destino: "fica" | "some";
  /** Por que esse destino, e quem cuida da linha depois. Tamanho mínimo conferido. */
  readonly porque: string;
  /**
   * SQL rodado como DONO, num município novo e recém-semeado, ANTES da
   * eliminação, que devolve numa coluna chamada `chave` o valor de `coluna`
   * das linhas desta tabela ligadas ao município. `:org` vira o uuid do
   * município (literal). Precisa devolver ao menos uma linha: prova vazia
   * reprova.
   */
  readonly linhasDoMunicipio: string;
  /** A coluna da tabela comparada com `chave` depois da eliminação. */
  readonly coluna: string;
  /**
   * SQL rodado como DONO logo depois de criar o município (`:org`), para que
   * existam linhas desta tabela ligadas a ele (por exemplo, uma conta em
   * `usuarios`, que o gatilho criador liga a uma pessoa nova).
   */
  readonly semear: string;
  /**
   * SQL rodado como DONO para semear o OUTRO município da prova (`:org` vira
   * o uuid DELE), que não é eliminado (correção 1 da 0G, item 5). Obrigatório
   * na junção do catálogo: um gatilho de eliminação com `DELETE` sem filtro
   * apagava as linhas do município da prova JUNTO com as de todo outro, e o
   * destino `some` passava. `linhasDoMunicipio` com o outro município precisa
   * achar linhas, e elas (e toda linha da tabela fora do município eliminado)
   * ficam iguais, valor por valor.
   */
  readonly semearOutroMunicipio?: string;
  /**
   * Quando couber (depois da liberação da segunda conta, 064): SQL rodado como
   * DONO, depois das duas semeaduras, que faz uma linha desta tabela ficar
   * COMPARTILHADA entre o município da prova (`:org`) e o outro (`:outra`),
   * como a pessoa com conta nos dois. A linha compartilhada nunca some com a
   * eliminação de um deles, qualquer que seja o destino.
   */
  readonly compartilhar?: string;
}

/**
 * Chave estrangeira SEM `organizacao_id` para uma tabela `global` (parte 0G),
 * como `usuarios.pessoa_id -> pessoas(id)` da ADR 0009. Toda outra chave sem
 * `organizacao_id` continua reprovando no portão. CONFERIDO
 * (`conferirChavesEstrangeiras`), nos dois sentidos: a restrição existe com
 * estas colunas e este alvo; o alvo é exceção `global` no catálogo; ela não
 * inclui `organizacao_id` (declaração que sobra reprova); não apaga nem
 * altera em cascata (`ON DELETE`/`ON UPDATE` NO ACTION ou RESTRICT); e as
 * colunas dela não são graváveis (INSERT ou UPDATE, de tabela ou de coluna)
 * por `dc360_app`, `dc360_console` nem PUBLIC, porque quem informa o valor
 * escolhe a linha global a que a linha do município se liga.
 */
export interface ChaveParaTabelaGlobal {
  /** A tabela que referencia, como o catálogo escreve o nome. */
  readonly tabela: string;
  /** O nome da restrição (`pg_constraint.conname`). */
  readonly restricao: string;
  /** As colunas da chave, na ordem da restrição. */
  readonly colunas: readonly string[];
  /** A tabela global referenciada. */
  readonly alvo: string;
  /**
   * As colunas REFERENCIADAS no alvo (`pg_constraint.confkey`), na ordem da
   * restrição (correção 1 da 0G, item 8). Obrigatório na junção do catálogo;
   * sem ele (só nas sondas), a conferência exige a chave primária do alvo. A
   * restrição também precisa estar VALIDADA (`convalidated`): `NOT VALID`
   * deixa linhas antigas apontando para o nada.
   */
  readonly colunasReferenciadas?: readonly string[];
  readonly migracao: string;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/** Os privilégios que o catálogo aceita por COLUNA (parte 0G). REFERENCES por coluna nunca. */
export type PrivilegioPorColuna = "INSERT" | "SELECT" | "UPDATE";

/**
 * Privilégio de COLUNA, generalizado (parte 0G): INSERT, SELECT ou UPDATE,
 * por tabela e papel, com a lista das colunas. A chave é
 * `papel:tabela:privilegio`; uma etapa posterior que mude a lista (a E08
 * encolhendo a de `usuarios`) declara `redefine: true` com migração maior.
 *
 * CONFERIDO (`conferirPrivilegiosDeColuna`) contra o banco, nos dois
 * sentidos, por `information_schema.column_privileges` e pela ACL de cada
 * coluna (`pg_attribute.attacl`): nada a mais (privilégio de coluna de papel
 * do produto ou de PUBLIC fora da lista reprova, inclusive coluna a mais num
 * grupo declarado), nada a menos, nunca com opção de concessão; e a tabela
 * de um grupo declarado NÃO tem o mesmo privilégio de TABELA para o mesmo
 * papel (o de tabela cobre toda coluna, e a lista viraria enfeite).
 *
 * `colunasComUpdate` continua valendo (é o UPDATE do `dc360_app`, coluna a
 * coluna), e entra na mesma conferência; o mesmo grupo nos dois lugares é
 * erro na junção.
 */
export interface PrivilegioDeColuna {
  readonly tabela: string;
  readonly papel: PapelDoBanco;
  readonly privilegio: PrivilegioPorColuna;
  readonly colunas: readonly string[];
  readonly migracao: string;
  readonly etapa: string;
  /** Por que por coluna, e por que estas. Tamanho mínimo conferido. */
  readonly motivo: string;
  /**
   * Uma redefinição SÓ ENCOLHE a lista (correção 1 da 0G, item 1): coluna que
   * a entrada anterior não tinha só entra declarada aqui, com a justificativa,
   * e a junção compara o conjunto anterior com o novo (o que a redefinição
   * acrescenta é EXATAMENTE `ampliacao.colunas`). Só existe junto de
   * `redefine`, e nunca traz coluna de `COLUNAS_PROIBIDAS`.
   */
  readonly ampliacao?: { readonly colunas: readonly string[]; readonly justificativa: string };
  readonly redefine?: true;
}

/**
 * COLUNA PROIBIDA (correção 1 da 0G, item 1): o privilégio que nenhum papel do
 * produto (`dc360_app`, `dc360_console`) nem PUBLIC tem na coluna, de tabela ou
 * de coluna, a partir da migração `desdeMigracao` (a 061 da E08 para a
 * credencial, o e-mail e o `pessoa_id` de `usuarios`). Nunca se redefine nem
 * se tira por arquivo de etapa: a lista do portão mora em
 * `catalogo/colunas-proibidas.ts`, e uma etapa só ACRESCENTA proibição.
 *
 * CONFERIDO (`conferirColunasProibidas`) quando a migração `desdeMigracao`
 * existe no repositório: o catálogo não declara o privilégio na coluna
 * (grupo ou `colunasComUpdate`) e o banco não o concede (`has_column_privilege`,
 * que vê o privilégio de tabela e a herança). Antes dela, só a forma.
 */
export interface ColunaProibida {
  readonly tabela: string;
  readonly colunas: readonly string[];
  readonly privilegios: readonly PrivilegioPorColuna[];
  /** A migração (3 dígitos) a partir da qual a proibição vale. */
  readonly desdeMigracao: string;
  readonly etapa: string;
  readonly motivo: string;
}

/** Uma coluna com um privilégio de um papel: a forma achatada que a conferência compara. */
export interface ColunaComPrivilegio {
  readonly tabela: string;
  readonly coluna: string;
  readonly papel: PapelDoBanco;
  readonly privilegio: PrivilegioPorColuna;
  readonly etapa: string;
}

export interface ColunaComUpdate {
  readonly tabela: string;
  readonly coluna: string;
  readonly migracao: string;
  readonly etapa: string;
  /** Por que este UPDATE é por coluna e não na tabela inteira. Tamanho mínimo conferido. */
  readonly motivo: string;
}

/*
  ---------------------------------------------------------------------------
  O que a parte 0D acrescenta (prova comportamental e as lacunas da auditoria
  de cobertura). Todas as listas abaixo são OPCIONAIS na contribuição de uma
  etapa: quem não precisa não escreve nada, e cada uma é conferida nos dois
  sentidos (entrada que o banco não confirma, ou de que o banco não precisa,
  reprova).
  ---------------------------------------------------------------------------
*/

/**
 * Como a FÁBRICA GENÉRICA da prova comportamental monta uma linha da tabela,
 * quando a regra genérica não basta (um CHECK que ela não sabe satisfazer).
 * Cada coluna recebe uma expressão SQL; `:org` vira o município da linha
 * (literal uuid) e `:n` um número único da semeadura. CONFERIDO: a tabela e as
 * colunas existem, e sem o preparo a fábrica genérica de fato falha (preparo
 * desnecessário reprova).
 */
export interface PreparoDeTabela {
  readonly tabela: string;
  readonly colunas: Readonly<Record<string, string>>;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Tabela que a prova comportamental NÃO consegue semear nem com preparo. Fica
 * à vista, com motivo. CONFERIDO: a tabela existe e a fábrica de fato falha
 * nela (entrada que sobrou reprova).
 */
export interface TabelaSemProvaComportamental {
  readonly tabela: string;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Policy RESTRITIVA (`AS RESTRICTIVE`). O padrão de toda policy do produto é
 * PERMISSIVE; restritiva só por nome. CONFERIDO nos dois sentidos: policy
 * restritiva fora da lista reprova, e entrada que o banco tem como PERMISSIVE
 * (a restrição que virou autorização somada por OR) reprova.
 */
export interface PolicyRestritiva {
  readonly tabela: string;
  readonly policy: string;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Visão que algum papel do produto lê, que alcança tabela com RLS, e que NÃO
 * roda com os privilégios de quem consulta (`security_invoker`). Sem
 * `security_invoker` a visão lê como o DONO, e o RLS de quem consulta some.
 * Visão materializada não tem RLS nem `security_invoker`, e por isso também
 * só entra por aqui. CONFERIDO nos dois sentidos.
 */
export interface VisaoSemInvoker {
  readonly visao: string;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Tipo próprio no esquema `public` (enum, domínio, tipo composto avulso,
 * intervalo). Compartilhar um tipo genérico não é erro, mas um enum com
 * informação de município seria; por isso cada tipo entra com a finalidade.
 * CONFERIDO nos dois sentidos.
 */
export interface TipoProprio {
  readonly tipo: string;
  readonly etapa: string;
  /** A finalidade do tipo, e por que compartilhá-lo entre municípios não vaza nada. */
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Sequência no esquema `public`, com os privilégios efetivos (USAGE, SELECT,
 * UPDATE) de cada papel do produto. Sequência com privilégio é estado
 * compartilhado entre municípios. CONFERIDO nos dois sentidos, papel por papel.
 */
export interface SequenciaDoProduto {
  readonly sequencia: string;
  readonly grants: GrantsEfetivos;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/**
 * Relação de EXTENSÃO que um papel do produto lê (a `spatial_ref_sys` do
 * PostGIS, que o `supabase-endurecer.sql` dá ao papel de aplicação). Fora
 * disso, objeto de extensão só concede EXECUTE (função) e USAGE (tipo) a papel
 * do produto, nunca com opção de concessão, e nunca é dele. CONFERIDA quando a
 * extensão existe no banco; entrada de extensão que não está instalada não é
 * conferida (o PGlite não traz PostGIS: quem confere é a suíte espacial do CI).
 */
export interface LeituraDeExtensao {
  readonly extensao: string;
  /** A relação, como `regclass` a escreve (`extensions.spatial_ref_sys`). */
  readonly relacao: string;
  readonly papel: PapelDoBanco;
  readonly etapa: string;
  readonly motivo: string;
  readonly redefine?: true;
}

/** O que cada etapa acrescenta ao catálogo. Listas vazias são válidas. */
export interface ContribuicaoDoCatalogo {
  readonly funcoes: readonly FuncaoPrivilegiada[];
  readonly excecoes: readonly ExcecaoAoIsolamento[];
  readonly colunasComUpdate: readonly ColunaComUpdate[];
  readonly preparos?: readonly PreparoDeTabela[];
  readonly semProvaComportamental?: readonly TabelaSemProvaComportamental[];
  readonly policiesRestritivas?: readonly PolicyRestritiva[];
  readonly visoesSemInvoker?: readonly VisaoSemInvoker[];
  readonly tiposProprios?: readonly TipoProprio[];
  readonly sequencias?: readonly SequenciaDoProduto[];
  readonly leiturasDeExtensao?: readonly LeituraDeExtensao[];
  /** Parte 0G: privilégio de coluna de INSERT, SELECT ou UPDATE, por tabela e papel. */
  readonly privilegiosDeColuna?: readonly PrivilegioDeColuna[];
  /** Parte 0G: chave estrangeira sem `organizacao_id` para tabela `global`. */
  readonly chavesParaGlobais?: readonly ChaveParaTabelaGlobal[];
  /** Correção 1 da 0G: proibição a MAIS (uma etapa só acrescenta; a do portão está em `colunas-proibidas.ts`). */
  readonly colunasProibidas?: readonly ColunaProibida[];
}
