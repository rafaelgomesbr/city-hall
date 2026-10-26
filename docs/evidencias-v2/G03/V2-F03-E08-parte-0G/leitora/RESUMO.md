# V2-F03-E08: o portão confere a leitora de `origens_de_conta` por lista permitida (ADR 0009, correção 6)

Ramo `trab/f03-juncao-lote1b`, base `798e279f` (a junção da correção 6 da ADR 0009). Feito pelo integrador do lote 1 da F03, com autorização do orquestrador para mudar o portão nesta junção (item 6 do RESUMO da correção 6). Commit próprio, antes da junção da 1B. Risco CRÍTICO: é o portão da regra número um. Implementador: Claude Opus 5.5.

## Fatos

**Ponto de partida.** A correção 6 da ADR 0009 (`348e21af`) decidiu que o verificador adiado da origem do `pessoa_id` é uma função LEITORA separada, `conferir_origem_da_conta()`, e que a garantia de que ela só lê vem do corpo conferido por LISTA PERMITIDA, falhando fechado, e não de enumerar efeitos (a sexta revisão mostrou que contadores sempre deixam um efeito de fora: `pg_notify`, trava consultiva, `set_config`, sequência). A sétima leitura (Codex) pediu restringir os tipos declarados na leitora a uma lista nominal e preservar os literais na normalização.

**O que mudou (só `dc360/db/test/` e `vitest.config.ts`, mais as contagens):**

- `catalogo/leitora.ts` (novo): `simbolosDoCorpo` (tira comentários e espaços, PRESERVA os literais e junta os adjacentes; identificador entre aspas, literal com prefixo e texto entre cifrões reprovam) e `conferirCorpoDaLeitora` (a lista permitida da decisão 1, condição 3): `DECLARE` só com `uuid`, `text` ou `xid8` e sem valor inicial; `SELECT apelido.col, ... INTO var, ... FROM public.<origens_de_conta | pessoas> apelido WHERE ... [LIMIT 1]` com o filtro pela chave da própria conta ou da própria transação, destinos de `INTO` só variáveis declaradas, e só `[NOT] EXISTS (SELECT 1 FROM public.usuarios x WHERE ...)` dentro da condição; `IF ... THEN ... END IF` sem `ELSE`; `RAISE EXCEPTION USING <opção> = '<literal>'`; `RETURN NULL` e `RETURN NEW`. Na condição: variáveis, `FOUND`, `TG_*`, `NEW.col`, colunas dos apelidos, literais, `'literal'::regclass` (a única conversão), `=`, `<>`, `AND`, `OR`, `NOT`, `IS [NOT] [DISTINCT FROM] NULL`, e só `pg_current_xact_id()` e `coalesce`. Todo o resto reprova.
- `catalogo/tipos.ts`: `FuncaoPrivilegiada.leOrigemDeConta?: "verificador"`.
- `catalogo/conferir-objetos.ts`: `conferirQuemCitaOrigensDeConta` aceita a leitora declarada como quem cita a tabela (e reprova a marca de leitora que sobrou); `conferirLeitoraDeOrigem` (nova): no máximo uma leitora, nunca escritora; existe, `SECURITY DEFINER`, função de gatilho em PL/pgSQL, `proconfig` exatamente `search_path=pg_catalog, public, pg_temp`, sem EXECUTE de `dc360_app`, `dc360_console` ou PUBLIC, declarada com `executavelPor: []` e `gatilhoEm: ["usuarios"]`, disparada só por gatilho `AFTER INSERT` de `public.usuarios`; o corpo pela lista permitida; e RAMO VERIFICADOR EM FUNÇÃO ESCRITORA (função com `gravaOrigemDeConta` disparada por `AFTER INSERT`) reprova.
- `catalogo/index.ts`: exporta o que é novo.
- `isolamento.test.ts`: 1 caso (`conferirLeitoraDeOrigem` sobre o catálogo juntado).
- `catalogo-nominal.test.ts`: 6 casos, a sonda 25.
- `vitest.config.ts` do banco: `testTimeout` de 30 s para 120 s (DV-67): as sondas 12 e 19 e a varredura de privilégio por coluna passaram de 30 s com o `npm test` inteiro carregando a máquina, e passam sozinhas em 5 a 12 s.
- `scripts/baseline.mjs` (chave `V2-F03-E08-leitora-de-origem`, 7), `README.md` (711 para 718 no banco; 4944 para 4951 em `npm test`), `docs/COLOCAR-DE-PE.md` (6967 para 6974).

**Sabotagens (sonda 25, sempre rodam; saída em `saidas/01-portao.txt`):**

| Caso | O que faz | Resultado |
| --- | --- | --- |
| 25.1 | a leitora da E15 (o mesmo corpo da 054), com `--`, `/* */`, `;` e `PERFORM pg_notify(...)` DENTRO de literal | passa; os literais ficam intactos e os adjacentes viram um |
| 25.2 | as sete sabotagens da correção 6, uma por vez: `PERFORM pg_notify`, `PERFORM pg_advisory_lock(1)`, `PERFORM set_config`, `PERFORM nextval`, chamada a função auxiliar que escreve, marca temporária inserida e apagada, e a mesma escrita num bloco `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END` | as sete reprovam ("comando não permitido na leitora") |
| 25.3 | escrita disfarçada e o que o conferidor não reconhece: `SELECT` com função no filtro, de `usuarios`, sem o filtro da própria conta; `INTO NEW.col`; tipo `public.sonda_tipo` ou `jsonb`; valor inicial; `RAISE` com `||`, `format` ou `NOTICE`; conversão `::sonda_tipo`; `lower(...)`; operador `~~`; atribuição; `ELSE`; `EXECUTE`; texto entre cifrões; identificador entre aspas; `E'...'`; `RETURN OLD` | todos reprovam |
| 25.4 | no banco, a leitora na forma certa (e o catálogo sem leitora) | passa |
| 25.5 | `proconfig` diferente ou vazio; sem `SECURITY DEFINER`; `GRANT EXECUTE` ao app; corpo sabotado | reprova cada um |
| 25.6 | duas leitoras; leitora que também é escritora (e o ramo verificador em função escritora); leitora disparada por `AFTER UPDATE`; `gatilhoEm` fora de `usuarios`; leitora que não existe | reprova cada um |

Contra a leitora REAL da 054, as sete sabotagens (antes e depois) estão na evidência da junção da E15 (`docs/evidencias-v2/G03/V2-F03-E15/juncao-lote1/sabotagens/`), que mostra também quais delas nenhum outro caso do portão pega sem a lista permitida.

**Portões (deste commit, de `dc360/`):** `typecheck` do banco verde; `isolamento.test.ts`, `catalogo-nominal.test.ts` e `portao-comportamental.test.ts`: 357 de 357 (`saidas/01-portao.txt`); `conferir:numeros` verde. Os portões inteiros rodaram depois da junção da 1B (evidência da E15).

## Justificativa

- **Lista permitida, e não lista proibida.** O que a sexta revisão achou foram efeitos que ninguém tinha listado; uma lista proibida teria o mesmo defeito. A falha fechada inclui o inofensivo que o conferidor não reconhece: quem precisar de construção nova muda o portão, revisado.
- **Tipos nominais.** Com as variáveis só em `uuid`, `text` ou `xid8`, e o `search_path` começando por `pg_catalog`, nenhuma conversão ou operador definido por usuário é alcançado por variável. O que sobra (operador ou conversão do usuário aplicado a coluna ou literal sem aparecer no corpo) exige DDL fora de migração revisada e fica registrado como dívida (DV-72).
- **Ramo verificador em escritora.** Pelo disparo no banco (`AFTER INSERT`), e não pelo texto: é o que distingue o verificador do criador (`BEFORE INSERT`) e da remoção da marca (`AFTER DELETE`).

## Limitações

- A conferência é sintática sobre o `prosrc`; o PL/pgSQL só valida o corpo ao executar. Um corpo que passa na lista e não compila falha na primeira conta inserida (falha fechada).
- O filtro pela chave da própria conta é conferido por presença na condição; uma condição com `OR` que o neutralize passaria nesse ponto, mas continua só leitura (nenhum efeito sai da lista permitida).

## Para o orquestrador

- Linha do STATUS: dentro da linha da E08 (o portão da leitora, feito na junção do lote 1).
- Dívida nova: DV-72 (tipos e operadores implícitos). Pendência humana: nenhuma.
