---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E01
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados
- Roteiro reproduzível e "mesmos números": FAIL parcial. Em Linux limpo (CI) o roteiro saiu 1 com a árvore verde porque `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` em `dc360/scripts/baseline.mjs` soma 206 e `test:scripts` executa 213 (artefato `produto`, `06-test-scripts.txt`, `# tests 213`).
- Prova de execução em Linux (emenda D-30): job "Linha de base (baseline.mjs) em Linux" verde; artefato `baseline-7005a60...` existe e traz RESUMO.md, INDEX.md, resultados.json e as saídas dos 19 passos. 16 de 19 conferem.
- `auditar` e `expo-doctor` ficaram verdes onde o roteiro espera falha (`baseline/17-expo-doctor.txt`: 21/21). Expectativa obsoleta e sem explicação escrita no repositório.
- Sem segredo nos artefatos.

## Evidência
Run 37739535524, evento push, headSha 7005a60, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (lido em `gh run view --json jobs`). Artefatos baixados com `gh run download` (um por job, `<job>-7005a60...`, 3 a 9 arquivos cada, com `00-contexto.txt`). Varredura de JWT, Bearer, ghp_ e URL com senha nos artefatos: zero ocorrência. Workflow: `|| true` só em `npm audit --json` de evidência (comentado; o passo decisório `npm run auditar` vem antes e sem ele), cópia do log do preview, limpeza de docker e `kill` do trap; nenhum `continue-on-error` (as duas menções são comentários que o proíbem). O único `set +e` é o do passo do baseline (abaixo).

Passo "Roteiro da linha de base" de `.github/workflows/verificar.yml`: faz `set +e +o pipefail`, captura `PIPESTATUS[0]` e só reprova se o código não for 0 nem 1, se faltar RESUMO.md, INDEX.md ou resultados.json, ou se o número de resultados não bater com o de passos. Código 1 (divergente) vira `::warning` e o job fica VERDE. Log do job 113186786148: "o baseline saiu com código 1" e o aviso logo depois. RESUMO.md do artefato: 16 de 19 "confere", 3 divergentes (test-scripts obtido 213 esperado 206; auditar e expo-doctor verdes onde se esperava falha). Isto é desenho declarado em comentário do job (a avaliação é do validador, pelo RESUMO), com anotação visível, e não engolimento acidental: código 2, arquivo faltando e contagem errada reprovam. Logo NÃO é falso verde de CI no sentido de falha escondida. Mas job verde não prova que o roteiro confere, e hoje uma das três divergências é defeito do próprio roteiro (contador sem `scripts/auditar.test.mjs`, 7 testes, entrado em e2d4aec).

Decisão (a): o job não engole a falha por acidente (comentário e `::warning` declaram o desenho). O defeito está no roteiro (contador esquecido), que é entrega da E01. A promessa da etapa ("repete e obtém os mesmos números") e o comentário "número esquecido reprova" não se cumprem no SHA.

## Cenários positivos
16 de 19 passos "confere" no Linux; o passo do workflow compara 19 passos de `--so-listar` com 19 resultados.

## Cenários negativos
Código 2, arquivo ausente e contagem de passos diferente reprovam o job (lido no workflow). Divergência de passo não reprova, por desenho.

## Tentativas de reprovar
Procurei `|| true`, `continue-on-error` e saída engolida em todos os jobs: só o `set +e` do baseline, deliberado. Procurei segredo e caminho de usuário nos artefatos: nenhum. Cruzei o RESUMO do Linux com o `# tests` do job produto: o 213 é o real, o 206 é que está errado. Não alterei arquivo do repositório.

## Achados
1. corrige antes de crescer (reprova a etapa): `baseline.mjs` espera 206 em `test:scripts` e são 213 (falta `scripts/auditar.test.mjs`, 7). Reprodução: RESUMO do artefato baseline, linha test-scripts; local: `cd dc360 && node scripts/baseline.mjs --sem-instalar --so=test-scripts --saida=<pasta>`.
2. corrige antes de crescer: expectativas de `auditar` (falha) e `expo-doctor` ("20/21") obsoletas depois da E19; `COMO-REPRODUZIR.md` ainda descreve a linha vermelha de 2026-09-30 (concorda com o qa).
3. anotado: o job baseline fica verde com divergência; com ruído próprio do roteiro, o aviso é fácil de ignorar. Depois de consertar o contador, considerar reprovar o job em divergência.

## Não verificado
`npm ci` em máquina limpa própria (proibido aqui; vale o Linux do CI). Execução local completa dos 19 passos (35 a 50 min). macOS.

## Risco residual
Divergência espúria acostuma o leitor a ignorar o RESUMO.

## Motivo do humano
Não aplicável.
