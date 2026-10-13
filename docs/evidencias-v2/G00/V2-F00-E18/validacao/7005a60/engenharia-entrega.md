---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- Job "Fluxo ponta a ponta no navegador" (113186786562) verde; artefato `navegador-7005a60...` com `04-e2e-local-chromium.txt` (Passou 70, Falhou 0), `05-e2e-local-firefox.txt` (70/0) e `06-e2e-contra-a-api.txt` (Passou 271, Falhou 0). Os três e2e do DoD rodaram em Linux no SHA.
- Passos de e2e sem `|| true`; Firefox e API rodam com `!cancelled()` para trazer todas as saídas.
- Sem segredo nos artefatos.

## Evidência
Run 37739535524, evento push, headSha 7005a60, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (lido em `gh run view --json jobs`). Artefatos baixados com `gh run download` (um por job, `<job>-7005a60...`, 3 a 9 arquivos cada, com `00-contexto.txt`). Varredura de JWT, Bearer, ghp_ e URL com senha nos artefatos: zero ocorrência. Workflow: `|| true` só em `npm audit --json` de evidência (comentado; o passo decisório `npm run auditar` vem antes e sem ele), cópia do log do preview, limpeza de docker e `kill` do trap; nenhum `continue-on-error` (as duas menções são comentários que o proíbem). O único `set +e` é o do passo do baseline (abaixo).

## Cenários positivos
Preflight e upload da seção 13 passam no CI (271/0).

## Cenários negativos
Cobertos pelo qa (mutações do CORS mortas).

## Tentativas de reprovar
Procurei o motor Firefox da API no workflow: o CI só roda `test:e2e:api` em Chromium (o bloco pede só isso). Procurei registro da instabilidade do qa em `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` (R6) e na evidência da E18: não há.

## Achados
Decisão (d): a política (28, linha 156) manda PASS com achado "instável" quando passa na repetição (3 de 3 depois da falha), e a R6 exige registrar a instabilidade com causa provável e etapa que a trata. Não está registrada. Não é T42 de skip (nenhum teste foi pulado). Classificação: corrige antes de crescer. Registrar em R6 a falha `NS_ERROR_CONNECTION_REFUSED` do `test:e2e:api -- firefox` no Windows (1 de 4, seção 23, `abrirComoMarcos`), com a causa como hipótese até alguém medir. O RESUMO da etapa afirma Firefox 271/0 sem mencionar repetição. Não bloqueia: o CI do SHA não roda esse motor e o Chromium está estável.

## Não verificado
Firefox da API em Linux (o CI não roda). WebKit. CORS do S3 real (F06-E15).

## Risco residual
Intermitência não registrada no Firefox do Windows.

## Motivo do humano
Conferência visual do upload de foto na seção 13, pedida pelo bloco.
