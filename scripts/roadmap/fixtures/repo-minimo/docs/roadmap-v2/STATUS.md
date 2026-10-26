# STATUS MINIMO DE FIXTURE

Arquivo de teste. Tem a mesma forma do STATUS real, em tamanho de brinquedo: tres fases, uma delas fora da ordem numerica.

## 1. ONDE ESTAMOS

- Fase do trabalho: fixture.

## 5. ORDEM DE EXECUCAO DAS FASES

| Ordem | Fase | Nome | Gate | Arquivo |
| --- | --- | --- | --- | --- |
| 1 | F00 | Estabilizacao de brinquedo | G00 | 03-fase-00-minima.md |
| 2 | F02 | Segunda na ordem, terceira no numero | G02 | 04-fases-01-e-02-minimas.md |
| 3 | F01 | Terceira na ordem | G01 | 04-fases-01-e-02-minimas.md |

## 6. FASES E GATES

| Ordem | Fase | Nome | Gate | Etapas | Concluidas | Status do gate |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | F00 | Estabilizacao de brinquedo | G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |
| 2 | F02 | Segunda na ordem, terceira no numero | G02 SEGUNDO GATE | 1 | 0 | NÃO INICIADO |
| 3 | F01 | Terceira na ordem | G01 TERCEIRO GATE | 1 | 0 | NÃO INICIADO |

## 7. CHECKPOINTS (decisoes humanas)

| CP | Assunto | Quem decide | Status | Resposta ou observacao |
| --- | --- | --- | --- | --- |
| CP-01 | Capacidade e custo | Rafael | DECIDIDO | uma pessoa |
| CP-03 | Politica de audit | Rafael | ABERTO |  |
| CP-19 | E-mail de producao | Rafael | PARCIAL | falta o provedor |

## 8. ETAPAS (status por etapa)

### F00 Estabilizacao de brinquedo (gate G00)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | EM ANDAMENTO | Implementada e medida; falta validação humana (Rafael ve a sonda). Evidencia: `docs/evidencias-v2/G00/V2-F00-E01/` |
| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |  |
| V2-F00-E03 | Audit conforme politica | M | P0 | PENDENTE | Depende do CP-03. Comando `npm run auditar \| tail` fica como esta |

### F02 Segunda na ordem, terceira no numero (gate G02)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F02-E01 | Contrato da API v1 | M | P0 | PENDENTE |  |

### F01 Terceira na ordem (gate G01)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F01-E01 | Fundacao de CI | S | P1 | PENDENTE |  |

## 10. DIARIO

| Data | Evento | Quem |
| --- | --- | --- |
| 2026-10-07 | Fixture criada, commit `abc1234` citado de proposito (nao existe) | teste |
