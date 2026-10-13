---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- `test:scripts` e `conferir:numeros` em Linux: artefato `produto`, `06-test-scripts.txt` (`# tests 213 / # pass 209 / # fail 0 / # skipped 4`) e `07-conferir-numeros.txt` ("Afirmações conferidas: 24", "Todos os números da documentação batem com a realidade"). Os 4 pulados são de ambiente (sem pasta ios/), não marca T42.
- Windows: ver `qa.md` (saída 0, mesmos números 213/209/0/4).
- Mutações e caso 22 conferidos pelo qa; reexecutei a sonda de caixa (abaixo).

## Evidência
Run 37739535524, evento push, headSha 7005a60, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (lido em `gh run view --json jobs`). Artefatos baixados com `gh run download` (um por job, `<job>-7005a60...`, 3 a 9 arquivos cada, com `00-contexto.txt`). Varredura de JWT, Bearer, ghp_ e URL com senha nos artefatos: zero ocorrência. Workflow: `|| true` só em `npm audit --json` de evidência (comentado; o passo decisório `npm run auditar` vem antes e sem ele), cópia do log do preview, limpeza de docker e `kill` do trap; nenhum `continue-on-error` (as duas menções são comentários que o proíbem). O único `set +e` é o do passo do baseline (abaixo).
Job relevante: "Testes, tipos e scripts" (113186786281), verde. Passos sem `|| true`, `pipefail` ligado por `shell: bash`.

## Cenários positivos
Suíte de scripts verde em Linux e Windows com a mesma contagem.

## Cenários negativos
`razaoParaRecusarAPasta(resolve("C:/Projetos/city-hall/dc360/copias"))` recusa ("está dentro do repositório ... viraria histórico de git para sempre").

## Tentativas de reprovar
`razaoParaRecusarAPasta(resolve("c:/projetos/city-hall/dc360/copias"))` devolve `null` e `C:/Users/Rfasg/onedrive/x` devolve `null` no Windows (reproduzido por mim, importando o módulo). Confirma o achado 1 do qa.

## Achados
1. corrige antes de crescer (LGPD): comparação com distinção de caixa em `razaoParaRecusarAPasta` (`dc360/scripts/copiar-producao.mjs:111`); no Windows o dump de produção pode ser aceito em pasta do repositório ou da nuvem digitada em outra caixa. Não bloqueia a etapa: o código é anterior e o bloco pede portabilidade de comando.
2. anotado: o roteiro de baseline reporta 206 contra 213 (E01, achado 1); não é defeito da E17.

## Não verificado
Saída de Linux em `saidas/` da etapa (está só no artefato do CI). Os dois comandos na máquina do Rafael.

## Risco residual
Risco LGPD condicionado a digitar o caminho em outra caixa.

## Motivo do humano
O bloco pede que o Rafael rode os dois comandos na máquina dele.
