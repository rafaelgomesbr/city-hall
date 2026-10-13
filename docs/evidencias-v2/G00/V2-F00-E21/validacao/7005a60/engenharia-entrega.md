---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E21
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados
- CI como prova de execução em Linux: run 37739535524 do SHA, 9 de 9 jobs verdes, artefato por job com `00-contexto.txt`, retenção de 30 dias, redação de segredo antes de publicar (`ci-artefatos.sh redigir`); varredura dos artefatos: zero segredo.
- `banco-tls.test.ts` e `ocorrencia-encerramento.test.ts` verdes no job Linux "Testes, tipos e scripts" (log lido pelo qa); `produto/05-suite-completa.txt` fecha sem falha.
- `.gitattributes` em vigor, `i/crlf` zero (qa).

## Evidência
Run 37739535524, evento push, headSha 7005a60, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (lido em `gh run view --json jobs`). Artefatos baixados com `gh run download` (um por job, `<job>-7005a60...`, 3 a 9 arquivos cada, com `00-contexto.txt`). Varredura de JWT, Bearer, ghp_ e URL com senha nos artefatos: zero ocorrência. Workflow: `|| true` só em `npm audit --json` de evidência (comentado; o passo decisório `npm run auditar` vem antes e sem ele), cópia do log do preview, limpeza de docker e `kill` do trap; nenhum `continue-on-error` (as duas menções são comentários que o proíbem). O único `set +e` é o do passo do baseline (abaixo).

Passo "Roteiro da linha de base" de `.github/workflows/verificar.yml`: faz `set +e +o pipefail`, captura `PIPESTATUS[0]` e só reprova se o código não for 0 nem 1, se faltar RESUMO.md, INDEX.md ou resultados.json, ou se o número de resultados não bater com o de passos. Código 1 (divergente) vira `::warning` e o job fica VERDE. Log do job 113186786148: "o baseline saiu com código 1" e o aviso logo depois. RESUMO.md do artefato: 16 de 19 "confere", 3 divergentes (test-scripts obtido 213 esperado 206; auditar e expo-doctor verdes onde se esperava falha). Isto é desenho declarado em comentário do job (a avaliação é do validador, pelo RESUMO), com anotação visível, e não engolimento acidental: código 2, arquivo faltando e contagem errada reprovam. Logo NÃO é falso verde de CI no sentido de falha escondida. Mas job verde não prova que o roteiro confere, e hoje uma das três divergências é defeito do próprio roteiro (contador sem `scripts/auditar.test.mjs`, 7 testes, entrado em e2d4aec).

Decisão (a) para a E21: o passo de baseline é desenho documentado e com `::warning`; a divergência espúria vem do contador de `baseline.mjs` (E01), não de falha do workflow nem de arquivo da E21. Não é FAIL da E21.

## Cenários positivos
Jobs verdes com artefato; `if: always()` em redigir e publicar; `if-no-files-found: error`.

## Cenários negativos
O workflow reprova no baseline se o roteiro quebra (código 2), se faltam arquivos ou se a contagem de passos diverge.

## Tentativas de reprovar
Procurei `continue-on-error` (nenhum), `|| true` em passo decisório (nenhum), jobs pulados (baseline e restore rodaram porque a mensagem de 7005a60 traz `[ci completo]`; ambos success) e artefatos vazios ou expirados (todos presentes, 3 a 9 arquivos).

## Achados
1. anotado: `baseline` termina verde com 3 passos divergentes (um espúrio); depois de consertar o contador (E01), considerar reprovar em divergência.
2. anotado: o job `aplicativo` desliga a checagem de versões do `expo-doctor` por decisão documentada; a cobertura vem do baseline.

## Não verificado
Árvore CRLF dentro do Linux (o checkout do CI é LF). `npm run verificar` completo no Windows. Jobs `restore` e `implantavel` fora do escopo desta etapa.

## Risco residual
Baixo.

## Motivo do humano
Não aplicável.
