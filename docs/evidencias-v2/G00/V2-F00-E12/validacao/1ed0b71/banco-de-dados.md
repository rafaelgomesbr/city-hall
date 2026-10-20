---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo desta dimensão na E12: o que o montador do pacote (`dc360/apps/api/src/saida/pacote.ts`) lê do banco e se essa leitura respeita o isolamento. `pacote.ts` não mudou desde `bb0f654` (`git diff bb0f654..1ed0b71 -- dc360/apps/api/src/saida` vazio). Ambiente: PostgreSQL 17.6 real, clusters descartáveis em `SCRATCH/validadores/banco-de-dados/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`), banco restaurado das 51 migrações com a semente. Saídas em `SCRATCH/validadores/banco-de-dados/saidas/`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| A consulta do pacote junta as duas equipes como a rota (`equipes ed` e `equipes ea`) | leitura de `pacote.ts:524-543`, `41-mutacao-e12-sem-nomes-das-equipes.txt` | as duas junções e os dois nomes estão lá; sem eles, 3 casos de `saida-de-municipio.test.ts` ficam vermelhos |
| Toda leitura do pacote é feita sob o município, pelo papel de aplicação | leitura de `pacote.ts:475` | uma transação `banco.comTenant(organizacaoId, ...)` (que faz `SET LOCAL ROLE dc360_app` e o `set_config` do município); nenhuma consulta tem filtro próprio de município: o isolamento é só da RLS forçada, então é ela que precisa segurar |
| O ZIP do município A não contém nome de equipe do B | `36-sonda-e12-pacote-sob-rls.txt` | como `dc360_app` com o contexto de Serra Alta, a consulta de vistorias com as duas junções: 0 vistoria alheia, 0 equipe alheia; `equipes` visíveis 3 (Alfa, Bravo, Charlie), 0 de Vale Fundo; `evidencias` alheias 0 |
| Referência cruzada impossível no próprio banco | `36-...` | `vistorias_equipe_designada_do_mesmo_municipio` e `vistorias_equipe_do_agente_do_mesmo_municipio` são chaves estrangeiras compostas `(organizacao_id, equipe_*_id)`; até o superusuário é recusado ao apontar vistoria de Serra Alta para equipe de Vale Fundo; `perda_vistoria_do_mesmo_municipio` idem para as evidências perdidas |
| `npm run test:isolamento` verde | `01-test-isolamento.txt` | 345 aprovados, 3 pulados, código 0 |
| Regressão da API | `40-test-api.txt` | `saida-de-municipio.test.ts` 37 de 37; `npm run test:api` 1590 aprovados, 34 pulados (bloco de Postgres real da E07), código 0 |

## Evidência

- `01-test-isolamento.txt` (0), `36-sonda-e12-pacote-sob-rls.txt` (0, `ferramentas/sonda-e12.sql`, como superusuário para o catálogo e a tentativa de FK cruzada, e com `SET ROLE dc360_app` mais o contexto para as consultas do pacote), `40-test-api.txt` (0), `41-mutacao-e12-sem-nomes-das-equipes.txt` (1), e, para a RLS do banco restaurado em geral, `27-isolamento-restaurado-como-dc360_app.txt`.

## Cenários positivos

- Contexto de Serra Alta: as consultas do pacote enxergam as vistorias e as três equipes de Serra Alta.

## Cenários negativos

- Nada de Vale Fundo aparece nas mesmas consultas com o contexto de Serra Alta; a FK composta recusa a referência cruzada.

## Tentativas de reprovar

1. Mutação: troquei `ed.nome AS equipe_designada_nome, ea.nome AS equipe_do_agente_nome` por dois `NULL` em `pacote.ts`: 3 vermelhos (o aviso de equipe divergente some do laudo do pacote) (`41-`). Restaurado com `git restore`.
2. Tentei apontar uma vistoria para equipe de outro município como superusuário: recusado pela FK composta.
3. Mordida da RLS em geral (no banco de controle do restore, `32-mordida-das-conferencias.txt`): sem a RLS em `ocorrencias`, a mesma forma de consulta sem filtro passa a devolver linhas do outro município. É por isso que a RLS forçada é a garantia do pacote, e ela está ativada e forçada nas 35 tabelas (`26-restaurado-resumo-catalogo.txt`).

## Achados

Nenhum. Anotado: o pacote não tem filtro próprio de município em nenhuma consulta e depende só da RLS forçada; está correto pelo desenho do projeto, e qualquer tabela nova incluída em `TABELAS_DA_SAIDA` sem RLS forçada vazaria no ZIP (o CA-06 é quem pega isso).

## Não verificado

- O conteúdo dos documentos (laudo e termo) e a comparação rota x pacote: dimensão de especificação e QA.
- Pacote gerado contra Postgres real pela rota HTTP: medi as consultas, não o ZIP inteiro em Postgres 17.6.
- Run do CI (ausente).

## Risco residual

Baixo: o montador lê sob RLS forçada, com FK composta impedindo referência cruzada.

## Motivo do humano

não se aplica
