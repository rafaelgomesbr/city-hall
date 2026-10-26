---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [DB, MIGRATION, RLS, TENANT, INFRA, DOC]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: cluster PostgreSQL 18.3 descartável meu (`initdb` no scratchpad, porta 55491, senhas aleatórias, apagado no fim), bancos `prova_r2_origem`, `prova_r2_restaurado` e `prova_r2_existente`, todos apagados (`DROP DATABASE ... WITH (FORCE)`, depois o cluster parado e a pasta removida). A porta 4002 não recebeu conexão. A prova em dois clusters e em Postgres 17 não foi repetida (o job `restore` do CI a faz, lido pela engenharia: 17.11, 48 migrações, 27 conferências). Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/banco/`.

1. As 48 migrações do zero, provisionado como o job `implantavel` mais `GRANT CREATE ON DATABASE`: código 0, "Aplicadas: 001 ... 048" (`01`). `--conferir`: "Esquema em dia." (`02`). Segunda execução: "Nada a fazer: 48" (`03`). Semente aplicada (`04`). PASS.
2. RLS ativada E forçada: 35 de 36 tabelas do `public`; a única fora é `schema_migracoes` (catálogo do aplicador, sem dado de município). Toda tabela de negócio tem policy (`05`). PASS.
3. Trilha append-only: `trilha_eventos` e `trilha_administrativa` só com policy INSERT e SELECT; 0 policy de UPDATE, DELETE ou ALL; `dc360_app` só com INSERT e SELECT de privilégio (`05`). UPDATE e DELETE como aplicação: recusados (`06`). PASS.
4. Dono das tabelas: as 37 relações do `public` são de `dc360_setup`; `dc360_app` e `dc360_api` NOSUPERUSER, NOBYPASSRLS, sem dono de nada; `dc360_console` sem login (`05`). PASS.
5. Como `dc360_api` assumindo `dc360_app` (`scripts/restore/isolamento-afirmado.sql`, código 0, `06`): sem contexto, 31 tabelas lidas com 0 linha; contexto de A, 30 tabelas com `organizacao_id`, 47 linhas de A e 0 fora de A; espelho de B; UPDATE cruzado de A em B alcança 0 linha. PASS.
6. Restore no mesmo cluster (só para conferir o que a 047 e a 048 trazem): `pg_dump --format=custom --schema=public --extension=pg_trgm`, banco novo sem o `public` de fábrica, `pg_restore --exit-on-error` código 0, mais o terceiro remédio (`GRANT USAGE ON SCHEMA public TO PUBLIC`; os outros dois são de papel e já existiam no cluster). No restaurado: 35 de 36 com RLS forçada, 48 linhas em `schema_migracoes`, `dono_do_token` com `usuario_ativo` e ACL só `dc360_setup` e `dc360_app`, `abrir_sessao` de 7 argumentos com a mesma ACL, `sessoes_familia_viva_idx` presente, 27 funções privilegiadas, 0 policy de UPDATE ou DELETE na trilha, `isolamento-afirmado.sql` código 0 (139 linhas de A, 0 fora), `--conferir` "Esquema em dia." (`16`, `17`, `18`). PASS.
7. `RESTORE-DO-BANCO.md` e as 48: o documento ainda diz "47 migrações" no título e no corpo, mas declara de forma explícita (linhas 21 e 22) que a 048 recria só `dono_do_token`, que o job `restore` do CI a aplica e que a prova local não foi repetida. Não afirma o que o código não faz. Os três remédios do passo 6 (linhas 197 a 201) batem com `scripts/ensaiar-restore.sh` (linhas 256 a 259). PASS, com o achado 1.
8. CA-06 morde (risco alto): `npm run test:isolamento` base 327 aprovados, 3 pulados, código 0 (`19`). Mutações, cada uma numa `db/migrations/049_prova_r2_mutacao.sql` temporária, apagada logo depois:
   - `ALTER TABLE equipes NO FORCE ROW LEVEL SECURITY`: 1 falha, "toda tabela do esquema tem RLS ativada E forçada" (`20`);
   - policy de leitura de `sessoes` trocada por `USING (true)`: 1 falha, "toda tabela de negócio tem policy amarrada na organização do contexto" (`21`);
   - policy de UPDATE e `GRANT UPDATE` em `trilha_eventos`: 3 falhas em 2 arquivos (`22`);
   - `dono_do_token` sem `search_path` e com EXECUTE a PUBLIC: 4 falhas (`23`);
   - depois de apagar a 049: 327 aprovados, 3 pulados, código 0 (`24`). PASS.

## Evidência

`01` a `06`, `16` a `24` (lista acima). O dump (dado sintético) ficou numa pasta com permissão 700 e foi apagado; nenhum dump arquivado.

## Cenários positivos

48 migrações do zero e sobre banco existente (046 com sessões, `26`, `27`), restore com os três remédios, isolamento afirmado nos dois bancos.

## Cenários negativos

Sem contexto, 0 linha; contexto de A, 0 de B; UPDATE e DELETE na trilha recusados; quatro mutações de RLS, policy, trilha e função privilegiada derrubam o CA-06.

## Tentativas de reprovar

- Procurar tabela de negócio sem RLS forçada, sem policy ou com dono da aplicação: nenhuma.
- Procurar policy de UPDATE ou DELETE na trilha, na origem e no restaurado: nenhuma.
- Conferir se a 048 e a 047 sobrevivem ao dump (ACL, índice parcial, assinatura): sobrevivem.
- Tirar o FORCE, abrir uma policy, abrir a trilha, afrouxar uma função privilegiada: o CA-06 pega todas.
- Alargar a saída de `dono_do_token` mantendo grants e `search_path`: o CA-06 NÃO pega (ver E05, achado 1). Não é critério da E25.
- Editar a 048 aplicada e rodar `--conferir`: diz "Esquema em dia." (achado 2).

## Achados

1. ANOTADO (já levantado por QA e engenharia nesta rodada): `dc360/docs/RESTORE-DO-BANCO.md` continua com "47 migrações" no título e nos passos (linhas 1, 19, 120, 279) e com Postgres 17 e Linux em "Não provado", enquanto o job `restore` do CI os prova com 48. O texto é honesto sobre a 048, mas quem segue o roteiro vê 48 aplicadas e lê 47.
2. ANOTADO (pré-existente): o roteiro usa `npm run migrar -- --conferir` como conferência do banco restaurado; ele só compara nomes de migração pendente (`db/src/migrar.ts:260`), não as impressões nem o catálogo. Com a 048 editada ou com a função revertida à mão, diz "Esquema em dia." (`10`, `09`). Quem confere o histórico de verdade no roteiro é o `diff` das impressões de `schema_migracoes` (passo 6), não o `--conferir`.

## Não verificado

- Postgres 17 e 16 locais (não existem nesta máquina): 17.11 só pelo job `restore` do CI, que não executei.
- Restore entre dois clusters, papéis criados do zero no destino e os três negativos do roteiro: não repetidos (prova da rodada 1 e do CI).
- API apontada para a cópia restaurada: não repetida aqui; a API do SHA rodou contra a origem (`/saude` com `ultimaMigracao` 048, login, pacote).
- Segunda pessoa seguindo o roteiro: substituída pela emenda D-30 na rodada 1.

## Risco residual

Baixo para o banco: o esquema de 48 migrações aplica do zero, restaura, mantém RLS forçada, trilha append-only e donos, e o portão CA-06 morde. Fica a defasagem do texto do roteiro (achado 1) e a fraqueza do `--conferir` como conferência (achado 2).

## Motivo do humano

Não se aplica.
