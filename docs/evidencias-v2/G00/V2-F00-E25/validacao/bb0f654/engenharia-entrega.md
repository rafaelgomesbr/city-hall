---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS com PostgreSQL 17.6, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

Ambiente local: este Mac NÃO tem PostgreSQL instalado (nenhum `psql`, `pg_dump` ou `initdb` no disco). Baixei o zip oficial da EDB `postgresql-17.6-1-osx-binaries.zip` para uma pasta própria do scratchpad; SHA-256 `5afb85f5d764176bb00a527cfc5dd9127b9f8efaa33f5a9afbedbf6ceb985fcc`, igual ao registrado em `correcao-1/saidas/15-origem-dos-binarios-postgresql.txt`. Dois servidores novos com `initdb` (portas 55741 e 55742, autenticação por senha, senha aleatória num arquivo do scratchpad, nunca impressa), sem socket Unix.

| Critério | Prova local (PG 17.6) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| Restore com `--exit-on-error` sem erro, das 50 migrações | `bash scripts/ensaiar-restore.sh` (a partir de `dc360/`, com `shared`, `db` e `api` recompilados no SHA): código 0, "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam" (`<V>/12-ensaiar-restore-stdout.txt`, `<V>/restore/`) | job `restore` com `postgres:17` em contêiner | local PASS; CI BLOCKED |
| Contagens e estrutura iguais (linhas, `schema_migracoes`, RLS ativada e forçada, `pg_trgm`) | conferências `linhas` (37 linhas) e `estrutura` com `diff` exato; 50 migrações; 0 tabela de negócio sem RLS forçada nos dois lados; nenhuma tabela com dono da aplicação; nenhuma policy de UPDATE ou DELETE na trilha | idem | local PASS |
| Negativos: sem `dc360_console` e sem `--extension=pg_trgm` o restore para | os dois reprovam e as mensagens citam `dc360_console` e `gin_trgm_ops` | idem | local PASS |
| Isolamento no restaurado (como `dc360_api` assumindo `dc360_app`) | "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM" na origem e no restaurado; o narrado é igual nos dois | idem | local PASS |
| API contra a cópia | `/saude` 200 com `banco: ok` e última migração 050; login de Serra Alta 200; lista com 6; detalhe 000471/2026; ocorrência de Vale Fundo com token de Serra Alta 404; busca por trigramas 200 | idem | local PASS |
| A conferência morde | mutante no roteiro: depois do restore, `ALTER TABLE ocorrencias NO FORCE ROW LEVEL SECURITY` no destino; em servidores novos o ensaio sai 1 com "FALHA estrutura: origem e restaurado DIFEREM" e o diff `negocio_sem_rls_forcada` 0 contra 1, `ocorrencias|t|t` contra `ocorrencias|t|f` (`<V>/13-mutante-restore.diff`, `<V>/13-mutante-restore-stdout.txt`); desfeito com `git restore` | n/a | PASS |
| Workflow tem o job do restore em PG 17 | lido: job `restore`, dois contêineres `postgres:17`, cliente 17 do repositório oficial, senha gerada e mascarada, `ensaiar-restore.sh` com `pipefail`, artefato `restore-<sha>` | execução e artefato | estrutura PASS; execução BLOCKED |
| Prova em Linux e no PG 17 de produção (17.6 do provedor) | PG 17.6 local, macOS | job `restore` | BLOCKED (Linux) |

## Evidência

- `<V>/11-build-shared-db-api.txt` (build dos três pacotes no SHA, código 0; os `dist` são ignorados pelo git e foram regravados).
- `<V>/12-ensaiar-restore-stdout.txt` e `<V>/restore/` (`01-versoes.txt`: pg_dump, pg_restore, psql e os dois servidores 17.6; `conferencias.txt` com 27 OK).
- `<V>/13-mutante-restore.diff` e `<V>/13-mutante-restore-stdout.txt`.
- Varredura das saídas: nenhuma URL com usuário e senha, nenhum literal de senha.
- Limpeza: os quatro servidores (dois do ensaio, dois do mutante) parados com `pg_ctl stop`; as pastas dos servidores e o arquivo de senha apagados; nenhuma porta 55741, 55742 ou 3741 escutando; o dump fica na pasta temporária do próprio roteiro, apagada na saída.

## Cenários positivos

- Ensaio inteiro verde no PG 17.6 com as 50 migrações, a semente, o isolamento e a API contra a cópia.

## Cenários negativos

- Restore sem `dc360_console`, dump sem `pg_trgm`: reprovam.
- RLS forçada perdida no destino: o diff de estrutura reprova.
- 404 entre municípios na API contra a cópia.

## Tentativas de reprovar

1. Mutante que tira o `FORCE ROW LEVEL SECURITY` de uma tabela da cópia: pego.
2. Li o roteiro procurando o caminho que passa sem conferir: os dois negativos aceitam reprovação por qualquer motivo (só avisam se a mensagem for outra), mas o positivo seguinte usaria o mesmo caminho e reprovaria; não achei falso verde.
3. Conferi que o roteiro recusa servidor sujo (papel `dc360_*` ou banco da prova já existentes) e que zera o ambiente do chamador (`PGPASSWORD`, `PGHOST`, `DATABASE_URL` e afins).
4. Conferi que `pg_dump` mais velho que o servidor é recusado com frase.

## Achados

- Nenhum que quebre critério da etapa.
- Anotado: o job `restore` só roda com `[ci completo]`, manual ou semanal; o SHA `bb0f654` não traz o marcador, e o run citado é o do registro `ecaad76` (difere só em STATUS e ESTADO-ATUAL).
- Anotado (ambiente): o disco do Mac estava em 100%; o ensaio coube, mas um clone limpo para a prova completa não coube.

## Não verificado

- O run do CI (job `restore` em Linux com `postgres:17`, artefato e as 27 conferências lá): não lido nesta sessão.
- O documento `dc360/docs/RESTORE-DO-BANCO.md` seguido à risca: é a dimensão QA e Banco; aqui foi o `ensaiar-restore.sh`, que o próprio documento diz não ser o texto.
- Máquina limpa (clone sem `node_modules`): o clone falhou por disco cheio; o ensaio rodou na árvore principal, com `node_modules` existente e `dist` recompilado.
- Origem Supabase, Windows e Linux.

## Risco residual

Baixo para o esquema e o isolamento da cópia (provados no 17.6 e com mutante). Médio para a prova formal da etapa, que pela política é o job do CI em Linux, não lido.

## Motivo do humano

Nenhum: o que falta é a leitura do run do CI pelo gatekeeper.
