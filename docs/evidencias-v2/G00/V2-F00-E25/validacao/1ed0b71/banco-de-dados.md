---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Ambiente, todo meu: PostgreSQL 17.6 real (`SCRATCH/pg17/pgsql/bin`, a versão maior da produção), clusters descartáveis em `SCRATCH/validadores/banco-de-dados/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`), 127.0.0.1, autenticação por confiança: origem na porta 56471, destino em 56472 (cluster separado), negativos em 56473, e dois clusters novos (56474 e 56475) para o ensaio do repositório. Papéis da origem como o job `implantavel`. Nenhum dump arquivado: os dumps ficaram em `SCRATCH/.../banco-de-dados/dump/`, apagada no fim. Saídas em `SCRATCH/validadores/banco-de-dados/saidas/`.

| Critério (dimensão banco) | Prova | Resultado |
| --- | --- | --- |
| Origem com todas as migrações e a semente | `04-migrar-do-zero.txt`, `21-origem-semear.txt` | 51 aplicadas, `--conferir` "Esquema em dia.", semente gravada |
| Dump `--format=custom --schema=public --extension=pg_trgm` e restore com `--exit-on-error` | `22-dump-e-restore.txt` | `pg_dump` código 0 (377.393 bytes), papéis criados ANTES no destino (`dc360_setup`, `dc360_api`, e pelo setup `dc360_app` e `dc360_console` com os atributos da 023), banco de `template0` sem o `public` de fábrica, `pg_restore --exit-on-error` como `dc360_setup`: código 0 |
| Linhas por tabela iguais, por `diff` | `23-comparar-origem.txt`, `23-comparar-restaurado.txt`, `24-diff-origem-x-restaurado.txt` | as 36 tabelas, contagem gerada do catálogo: idênticas |
| Impressões de `schema_migracoes` | idem | 51 linhas, md5 de cada linha e md5 agregado `187fe73b...ef5a` iguais nos dois lados; `migrar` no restaurado: "Nada a fazer: 51" (o aplicador confere a soma de cada arquivo contra o banco) |
| RLS ativada E forçada em todas as tabelas de negócio, por `pg_class` | `26-restaurado-resumo-catalogo.txt`, `23-...` | 36 tabelas `relkind = 'r'`: 35 com `relrowsecurity` e `relforcerowsecurity` verdadeiros; a única sem é `schema_migracoes` (catálogo de versões, igual na origem). A visão `console_situacao_dos_municipios` manteve `security_invoker=true` e ACL só para `dc360_console` |
| Policies, funções, índices, grants, donos | `23-...`, `24-...`, `26-...` | 94 policies (nome, tabela, comando, papéis, md5 de USING e WITH CHECK), 83 funções (assinatura, dono, `prosecdef`, `proconfig`, ACL, md5 do corpo; 27 SECURITY DEFINER), 137 índices (4 `gin_trgm_ops`), gatilhos, `pg_trgm` 1.6 com dono `dc360_setup`, grants de tabela e de coluna por papel, ACL do `public` e pertencimentos com SET de `dc360_app`: iguais. Única linha do diff: a restrição `oficio_envios.provedor_id_plausivel`, com os parênteses reagrupados pelo Postgres ao reler; sem parênteses o md5 é o mesmo (`da7cb6c4...`) |
| Donos e papel de aplicação | `23-...`, `27-...` | as 36 tabelas com dono `dc360_setup`; `dc360_app` e `dc360_api` sem superusuário e sem BYPASSRLS, nenhuma tabela deles |
| Como `dc360_app` no restaurado: 0 linha sem contexto | `27-isolamento-restaurado-como-dc360_app.txt` | 31 tabelas lidas, 4 com leitura negada, 0 linha visível |
| 0 de outro município | idem | contexto de Serra Alta e de Vale Fundo: 30 tabelas com `organizacao_id` lidas, 0 linha do outro, 0 organização alheia; 8 ocorrências de Serra Alta, 0 de Vale Fundo; UPDATE em ocorrência de Vale Fundo com contexto de Serra Alta: `UPDATE 0` |
| UPDATE e DELETE na trilha negados | idem | `UPDATE` e `DELETE` em `trilha_eventos` (inclusive na linha do próprio município) e em `trilha_administrativa`: `permission denied`; DELETE em `ocorrencias`, `usuarios` e `sessoes`: `permission denied` (registro não se apaga) |
| Origem e cópia se comportam igual | `28-isolamento-origem-como-dc360_app.txt` | a mesma sonda na origem: saída idêntica à do restaurado (diff vazio) |
| `migrar --conferir` na cópia | `29-migrar-conferir-restaurado.txt` | "Esquema em dia.", código 0 |
| Testes negativos | `30-negativos-do-restore.txt` | destino sem `dc360_console`: código 1, `role "dc360_console" does not exist` na policy `console_codigos_insercao`; dump sem `--extension`: código 1, `operator class "public.gin_trgm_ops" does not exist` em `equipes_busca_idx`; controle no mesmo cluster com o dump certo: código 0 e 35 tabelas forçadas |
| O roteiro do repositório (o que o CI roda) | `34-ensaiar-restore.txt` e pasta `34-ensaiar-restore/` | `scripts/ensaiar-restore.sh` em dois clusters 17.6 novos, com `dist` recompilado do SHA (`33-build.txt`): "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam"; inclui a API apontada para a cópia (`/saude` 200 com `banco: ok` e `ultimaMigracao` 051, login, lista, detalhe, 404 do outro município, busca com `pg_trgm`) |
| `npm run test:isolamento` (CA-06) na árvore | `01-test-isolamento.txt` | 345 aprovados, 3 pulados, código 0 |

## Evidência

- `01-test-isolamento.txt` (código 0); `04-` e `21-` (origem); `22-dump-e-restore.txt` (dump 0, restore 0); `ferramentas/comparar.sql` rodada nos dois lados como superusuário: `23-comparar-origem.txt`, `23-comparar-restaurado.txt`, `24-diff-origem-x-restaurado.txt` (uma linha, a da restrição), `25-restricao-*.txt`; `26-restaurado-resumo-catalogo.txt`; `ferramentas/isolamento-restaurado.sql` como `dc360_api` com `SET ROLE dc360_app`: `27-` e `28-`; `29-` (`--conferir` 0 e `migrar` 0); `30-` (negativos 1 e 1, controle 0); `32-mordida-das-conferencias.txt`; `33-build.txt` (0); `34-ensaiar-restore.txt` (código 0).

## Cenários positivos

- Restore sem erro com `--exit-on-error`, contagens e impressões iguais, 35 tabelas com RLS ativada e forçada, `migrar --conferir` em dia, API sobre a cópia com `/saude` 200 (pelo `ensaiar-restore.sh`).

## Cenários negativos

- Sem `dc360_console` o restore para (código 1); sem `pg_trgm` no dump o restore para no índice de trigramas (código 1).
- `dc360_app` sem contexto: 0 linha; com contexto de um município: 0 linha do outro; escrita cruzada: 0 linha; UPDATE e DELETE na trilha: negados.

## Tentativas de reprovar

1. Mordida da comparação (`32-`): no banco de controle tirei o FORCE de `ocorrencias` (`ALTER TABLE ... NO FORCE ROW LEVEL SECURITY`); a comparação de catálogo acusa a linha `ocorrencias|t|f`. Tirei a RLS (`DISABLE`): a sonda de isolamento acusa 2 linhas de Vale Fundo no contexto de Serra Alta e 8 no inverso, e a contagem de ocorrências sobe para 10. As conferências mordem.
2. Procurei policy de UPDATE, DELETE ou ALL nas trilhas no restaurado: só INSERT e SELECT (comparação idêntica à origem).
3. Conferi a visão (o caminho 5 da varredura de privilégio): manteve `security_invoker=true` depois do restore.
4. Comparei o comportamento de isolamento da origem e da cópia linha a linha (diff vazio), não só a estrutura.
5. Rodei o restore no Postgres 17.6, e não no 18 que a etapa usou na primeira prova.

## Achados

1. Anotado: a seção 1 da minha sonda de isolamento só percorre tabelas com `relrowsecurity` verdadeiro, então uma tabela com a RLS desligada sairia da contagem "sem contexto" (vi isso na mordida 2: 30 tabelas lidas em vez de 31). Não afeta o veredito: a comparação de catálogo e a seção 2 acusaram a mesma mutação. Registro para quem reaproveitar a sonda.
2. Anotado: `dc360/docs/RESTORE-DO-BANCO.md` diz "as 50 migrações" nas linhas 65 e 521, como fato datado da prova de 2026-10-19; o marcador de contagem da linha 25 já diz 51 e confere. O restore aqui foi das 51.

Nenhum achado bloqueia.

## Não verificado

- Origem Supabase (papéis do provedor, `sslmode`) e máquina limpa de verdade: não refeitos; a máquina tem Node e dependências instalados.
- Linux e Windows (Git Bash) seguindo o documento: não executados; o documento em si não foi seguido passo a passo por mim (rodei comandos equivalentes e o `ensaiar-restore.sh`).
- Postgres 16 do CI e o run do CI (ausente, H32).
- Validação humana pedida pela etapa: uma segunda pessoa seguir o roteiro.

## Risco residual

Baixo no banco: estrutura, dados, RLS forçada, policies, funções, grants e donos sobrevivem ao restore e o isolamento se comporta igual. O risco que sobra é de operação (provedor real, outra plataforma, pessoa que não escreveu o sistema), fora do que esta dimensão prova.

## Motivo do humano

A Definition of Done da etapa pede o roteiro repetido por uma segunda pessoa (ou o Rafael noutra máquina limpa). Isso não se prova por agente: depende de alguém que não escreveu o sistema seguir `RESTORE-DO-BANCO.md` do zero.
