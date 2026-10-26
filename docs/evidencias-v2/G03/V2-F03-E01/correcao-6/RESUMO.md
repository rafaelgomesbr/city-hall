# V2-F03-E01, correção 6: verificador adiado como leitora separada conferida por lista permitida

**Base:** `origin/trab/f03-0a-e01-adr` em `eb15163d` (correção 5). Só documento: a ADR 0009 e esta pasta. Nenhum
código, migração, teste ou `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o
`plano-f03.md` não foram tocados. Situação da ADR continua PROPOSTA. A proposta de redação do CLAUDE.md não mudou:
vale a da correção 2.

**Entrada:** sexta rodada da revisão de segurança sobre `eb15163d` (Codex, somente leitura, com fontes oficiais do
PostgreSQL 16 e 17). NOTA: os contadores da transação contam a escrita desfeita (confirmado em
`AtEOSubXact_PgStat_Relations`). Dois IMPEDE: (a) efeito que nenhum contador vê num ramo da função compartilhada
(`pg_notify`, trava consultiva de sessão, `set_config`); (b) observadores incompletos (`setval` com `is_called`,
valor de sequência em cache, `pg_catalog` fora de `*_user_tables`, tabela criada e apagada entre as leituras). DÍVIDA:
protocolo da medição no `COMMIT` (descarga pela conexão produtora, leitura sem fotografia antiga).

## O que mudou, e por quê é estrutural

| # | Ponto | O que mudou | Onde na ADR |
| --- | --- | --- | --- |
| a, b | Prova por comportamento não fecha porque exige enumerar efeitos | O verificador passa a ser OBRIGATORIAMENTE uma função LEITORA separada, `conferir_origem_da_conta()`; a opção "ramo da função do criador" sai. A garantia é o corpo conferido por LISTA PERMITIDA sobre o `prosrc` normalizado, falhando fechado: só declarações, `SELECT ... INTO` em formas nominais com tabela qualificada e filtro pela chave da própria conta (ou da própria transação, no gatilho de comando), `IF` com comparações, `RAISE EXCEPTION` com SQLSTATE fixo e literais, `RETURN NULL`/`NEW`, e só `pg_current_xact_id()` e `coalesce` como funções. `search_path` fixo em `pg_catalog, public, pg_temp`. Tudo fora disso reprova, inclusive o inofensivo não reconhecido | Decisão 1, "Quem pode LER a marca" (condições 1 a 4, reescritas); decisão 8 (catálogo); consequências E15; testes 0B, E15 e E10; proibido; alternativas; contexto, estado e aceite, onde isto vive |
| contadores | Ficam | Prova ADICIONAL, comportamental, com `is_called` acrescentado ao lado de `last_value`; o que eles não veem é o que a lista permitida tira do alcance da função | Decisão 1, "Os contadores de escrita ficam como prova ADICIONAL" |
| dívida | Medição no `COMMIT` | Obrigação de implementação: descarga pela conexão que escreveu antes de a leitura começar, `pg_stat_clear_snapshot()` na conexão que lê, banco de prova sem outra sessão, e a sabotagem mostrando que a medida enxerga a escrita | Decisão 1, mesmo bloco |
| sabotagens | Novas | Leitora com `pg_notify`, `pg_advisory_lock`, `set_config`, `nextval`, chamada a função auxiliar que escreve, marca temporária inserida e apagada, e a mesma escrita em bloco `EXCEPTION`: todas reprovam pela lista permitida (as que escrevem em tabela, também pelos contadores) | Testes 0B (e E15 contra a cadeia real) |

A eliminação (`some`, correção 4), que a quinta rodada deu como fechada, não mudou: a remoção da marca continua na
função do gatilho criador (`AFTER DELETE`), que é escritora e depois desta correção não verifica nada.

## Especificação para a junção da 1B (E15)

**Função leitora (nova, na 054):**

```
CREATE FUNCTION conferir_origem_da_conta() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
```

- Corpo só com as construções da lista permitida (decisão 1, condição 3). Na E15, os comandos são:
  1. `IF TG_RELID IS DISTINCT FROM 'public.usuarios'::regclass OR TG_OP <> 'INSERT' OR NOT ((TG_NAME =
     'usuarios_origem_da_pessoa' AND TG_WHEN = 'AFTER' AND TG_LEVEL = 'ROW') OR (TG_NAME =
     'usuarios_nenhuma_pessoa_sem_conta' AND TG_WHEN = 'AFTER' AND TG_LEVEL = 'STATEMENT')) THEN RAISE EXCEPTION
     USING ERRCODE = 'insufficient_privilege', MESSAGE = '<literal>'; END IF;`
  2. ramo de comando: `SELECT o.usuario_id INTO v_orfa FROM public.origens_de_conta o WHERE o.transacao =
     pg_current_xact_id() AND o.origem = 'criador' AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id =
     o.usuario_id) LIMIT 1;` e, se `FOUND`, o `RAISE EXCEPTION` constante de hoje (23514, `CONSTRAINT =
     'usuarios_origem_da_pessoa'`); `RETURN NULL`;
  3. ramo de linha: `SELECT o.pessoa_id, o.origem, o.transacao INTO v_pessoa, v_origem, v_transacao FROM
     public.origens_de_conta o WHERE o.usuario_id = NEW.id;` e `SELECT p.id INTO v_existe FROM public.pessoas p WHERE
     p.id = NEW.pessoa_id;`, depois um `IF` com `NOT FOUND`/nulos, `v_transacao IS DISTINCT FROM
     pg_current_xact_id()`, `v_pessoa IS DISTINCT FROM NEW.pessoa_id`, `v_origem <> 'criador'` e a pessoa ausente, e
     o `RAISE EXCEPTION` constante de hoje (23514); `RETURN NULL`.
- As mensagens e o `DETAIL` só com literais (sem `||`, sem `format`). O `DETAIL` de hoje, feito de literais
  adjacentes, passa se o conferidor normalizar a concatenação implícita de literais; se não, vira um literal só.
- `REVOKE ALL ON FUNCTION conferir_origem_da_conta() FROM PUBLIC`, sem GRANT a papel nenhum.

**Gatilhos (na 054):** `usuarios_origem_da_pessoa` (constraint trigger `AFTER INSERT`, `DEFERRABLE INITIALLY
DEFERRED`, `FOR EACH ROW`) e `usuarios_nenhuma_pessoa_sem_conta` (`AFTER INSERT FOR EACH STATEMENT`) passam a
`EXECUTE FUNCTION conferir_origem_da_conta()`.

**`conta_ganha_pessoa` (na 054):** fica só com o `BEFORE INSERT` (`usuarios_ganha_pessoa`: cria a pessoa e grava
`criador`) e o `AFTER DELETE` da correção 4 (tira só `WHERE usuario_id = OLD.id`); a lista de `TG_NAME`, `TG_WHEN` e
`TG_LEVEL` aceitos muda para esses dois; os ramos `AFTER INSERT` (linha e comando) saem dela.

**Também na 054** (da correção 4, sem mudança): trava de permanência de `origens_de_conta` com DELETE só de marca cuja
conta não existe, falhando fechado; cabeçalho (itens 6, 7, C4 e c) e `COMMENT ON TABLE` e `COMMENT ON FUNCTION`
atualizados para a leitora e o destino `some`.

**Catálogo `dc360/db/test/catalogo/f03-e15.ts`:**
- entrada nova em `FUNCOES_PRIVILEGIADAS` para `public.conferir_origem_da_conta()`, com `executavelPor: []`,
  `gatilhoEm: ["usuarios"]`, `gatilhos` declarando os dois gatilhos acima (momento, nível, evento, adiamento), motivo
  e prova, e a marca de leitora (campo novo do tipo, por exemplo `leOrigemDeConta: "verificador"`);
- a entrada de `conta_ganha_pessoa` continua `gravaOrigemDeConta: "criador"`, com `gatilhos` trocados para o `BEFORE
  INSERT` e o `AFTER DELETE`;
- `origens_de_conta` com `semMunicipio: { especie: "protegida", naEliminacao: { destino: "some", ...,
  semearOutroMunicipio } }` (correção 4);
- se a lista nominal de quem cita `pessoas` (em `pessoas.test.ts`, a varredura de `prosrc`) for por nome, a leitora
  entra nela com o motivo "confere que a pessoa da conta existe, sem ler coluna nenhuma além do id".

**Portão (extensão, do dono do portão: a mesma via da 0G, ou a junção se o orquestrador autorizar tocar o portão):**
`tipos.ts` ganha o campo de leitora; `conferirQuemCitaOrigensDeConta` aceita a leitora declarada (no máximo uma) e
reprova ramo verificador em função escritora; conferência nova da LISTA PERMITIDA sobre o `prosrc` normalizado da
leitora, que reconhece só as construções da decisão 1 (condição 3) e reprova o resto; `proconfig` conferido com
`search_path=pg_catalog, public, pg_temp`.

**Testes em `dc360/db/test/pessoas.test.ts` (substituem o D2 das correções 4 e 5):**
1. no catálogo do banco: os dois gatilhos de conferência apontam para `conferir_origem_da_conta`, e nenhum gatilho
   `AFTER INSERT` de `usuarios` aponta para `conta_ganha_pessoa`;
2. a leitora real passa na lista permitida;
3. prova adicional por contadores dentro da transação: `INSERT INTO usuarios` sem `pessoa_id` como `dc360_app`;
   `SAVEPOINT antes_do_adiado`; ler como dono `SELECT relname, n_tup_ins, n_tup_upd, n_tup_del FROM
   pg_stat_xact_user_tables ORDER BY relname` e `SELECT schemaname, sequencename, last_value, is_called FROM
   pg_sequences ORDER BY 1, 2` (no PostgreSQL de prova; no PGlite, a forma equivalente que ele expuser);
   `SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE`; ler de novo; iguais. O mesmo nos caminhos que recusam que a
   suíte já monta (no mínimo o `BEFORE INSERT` de teste posterior ao criador que troca o `pessoa_id`), voltando ao
   ponto de salvamento antes da segunda leitura;
4. prova adicional na confirmação: a conexão que escreve faz `COMMIT`, chama `pg_stat_force_next_flush()` e força a
   descarga (por exemplo, um comando seguinte na mesma conexão) antes de a outra conexão ler; a conexão que lê chama
   `pg_stat_clear_snapshot()` antes de cada leitura de `pg_stat_user_tables`; diferença exata `usuarios` +1,
   `pessoas` +1, `origens_de_conta` +1 em inserção, zero atualização e remoção, nenhuma outra tabela; e a sabotagem do
   item 5 mostrando que a medida enxerga a escrita. Se o ambiente não der essa medida de forma estável, registrar e
   seguir: a garantia é a lista permitida, e a medição no `COMMIT` fica como pendência da etapa;
5. sabotagens, com saída "antes" (portão sem a lista permitida, ou com a leitora original) e "depois" (reprova), uma
   leitora sabotada por vez: `PERFORM pg_notify('x', NEW.id::text)`; `PERFORM pg_advisory_lock(1)`; `PERFORM
   set_config('dc360.x', 'y', false)`; `PERFORM nextval('<uma sequência>')`; chamada a uma função auxiliar do dono que
   faz `INSERT` numa tabela; `INSERT INTO public.origens_de_conta (...) VALUES (gen_random_uuid(),
   gen_random_uuid(), 'criador', pg_current_xact_id())` seguido do `DELETE` da mesma linha; e a mesma escrita dentro
   de `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END`. Todas reprovam na lista permitida; as duas últimas e a da
   função auxiliar reprovam também nos contadores.

A E10 (3C, 058) redefine a leitora acrescentando só a forma de leitura do convite da marca (`FROM
public.convites_de_vinculo WHERE id = v_convite`) e a aceitação da origem `aceite`, e repete os itens 2, 3 e 5 com a
marca `aceite`.

## Para o orquestrador

**H97.** O aceite vale para a ADR corrigida em `<SHA do commit da correção 6>` (correção 6, depois da sexta rodada da
revisão de segurança) e para a proposta de redação do CLAUDE.md da correção 2, que continua valendo.

**Plano (`plano-f03.md`, NÃO editei).** Linha 1B do bloco `origens_de_conta`: "o verificador adiado é a função leitora
separada `conferir_origem_da_conta()`, com corpo por lista permitida e `search_path` fixo; `conta_ganha_pessoa` fica
com o `BEFORE INSERT` e o `AFTER DELETE` (correção 6)". Linha 0B e 0D: "a conferência da leitora por lista permitida,
falhando fechado, com as sabotagens da correção 6, e os contadores como prova adicional". Linha 3C: "a 058 acrescenta
à leitora só a leitura do convite da marca".

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`; o único reprovado admitido é o EPERM de symlink do Windows (DV-46).
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz, depois das linhas novas no `INDEX.md` da etapa.
- `dc360/node_modules` apagado depois dos portões.
