---
arbitro: arquiteto-software
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
conflito: [qa, engenharia-entrega]
decisao: FAIL
confianca: alta
---
## Conflito

`qa.md` (PASS, confiança média) e `engenharia-entrega.md` (FAIL, confiança alta) descrevem o MESMO fato e divergem só na gravidade: no SHA validado, `dc360/scripts/baseline.mjs` espera 206 testes em `test:scripts` e a árvore executa 213, porque `scripts/auditar.test.mjs` (7 casos, entrado na E19) não está na tabela `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. O roteiro sai com código 1 numa árvore verde; o CI transforma o código 1 em `::warning` por desenho declarado, e o job fica verde. O QA classificou como "corrige antes de crescer" e manteve PASS; a engenharia de entrega reprovou.

## Prova reproduzida

Reprodução por leitura do código no SHA (HEAD 665b2be difere só em `docs/roadmap-v2/STATUS.md`). Esta sessão de arbitragem não tinha ferramenta de execução de comando; os números de execução vêm dos dois relatórios e do artefato do run 37739535524, e a leitura abaixo os explica sem lacuna.

1. `dc360/package.json:27`: `"test:scripts": "node --test \"scripts/*.test.mjs\""`. O glob apanha os 21 arquivos de `dc360/scripts/*.test.mjs`, inclusive `auditar.test.mjs`.
2. `dc360/scripts/auditar.test.mjs:67-103`: um `describe` com 7 casos `it(`.
3. `dc360/scripts/baseline.mjs:64`: `TESTES_DA_E01_EM_SCRIPTS = 16`; `:77-95`: tabela com E02 = 17, E17 = 1, E21 = 7, sem E19; `:403`: esperado `165 + 16 + 25 = 206`. Real: 206 + 7 = 213, como o `# tests 213` do artefato.
4. `dc360/scripts/baseline.mjs:72-75` promete: "O `baseline.test.mjs` confere as duas tabelas contra os arquivos, então número esquecido reprova." `dc360/scripts/baseline.test.mjs:167-170` só percorre `ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` (`baseline.mjs:98-100`, só a E02). Arquivo novo fora da tabela nunca é visto. Além disso o contador usa `/^test\(/gm`, que daria 0 para `auditar.test.mjs` (casos `it(` indentados dentro de `describe`). A garantia escrita é falsa por duas razões.
5. `dc360/scripts/baseline.mjs:411` e `:414`: `auditar` espera falha e `expo-doctor` espera "20/21"; desde a E19 os dois ficam verdes (artefato `17-expo-doctor.txt`: 21/21). São as outras duas divergências da rodada Linux, também sem explicação escrita no repositório.
6. `docs/evidencias-v2/G00/GUIA-DE-VALIDACAO-F00.md:414` também diz 206. Nenhum documento do repositório explica 213.

## Decisão e fundamento

FAIL. O conflito é de leitura do critério, não de fato, e o texto resolve:

- Gate G00, item "Baseline reproduzível": "a rodada final mostra todos os comandos verdes ou com divergência explicada". No SHA a rodada mostra 3 divergências e nenhuma explicada; uma delas é defeito do próprio roteiro, que é a entrega da E01.
- DoD da E01: "todo número do REL:01 3.4 reproduzido ou com divergência explicada". Mesma falha.
- Objetivo da E01: "repete ... e obtém os mesmos números". Quem repete hoje obtém "divergente" por erro de contabilidade, e a etapa existe para que "divergente" signifique defeito.
- O argumento do QA ("o mecanismo marca divergente e sai 1, não esconde") prova o teste negativo do bloco, que de fato passa. Ele não prova o critério do gate: a máquina sinalizar não é o mesmo que a divergência estar explicada.
- O CI tratar código 1 como aviso é desenho legítimo e a E01 proíbe mexer no CI; isso não torna o roteiro correto. Job verde não é prova do critério (seção 8 de `28`).
- Não é BLOCKED: nada depende de decisão do Rafael nem de ambiente indisponível; o conserto é mecânico e está no escopo da E01.

## Conserto mínimo no escopo

Tudo em `dc360/scripts/` e na evidência da E01, sem tocar no CI:

1. `baseline.mjs`: acrescentar `"V2-F00-E19": 7` em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` e `"V2-F00-E19": "auditar.test.mjs"` em `ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`.
2. `baseline.test.mjs`: tornar verdadeira a frase "número esquecido reprova": (a) o contador reconhece `test(` e `it(` com indentação; (b) um caso lista `scripts/*.test.mjs` no disco e reprova se houver arquivo que não está na base de 2026-09-30 nem na tabela de arquivos. Teste vermelho primeiro (no SHA atual ele reprova por `auditar.test.mjs`).
3. `baseline.mjs:411` e `:414`: `auditar` e `expo-doctor` passam a esperar código 0 (e "21/21"), com o comentário "verde desde a V2-F00-E19", no mesmo padrão das linhas 401 a 403. `audit-raiz` e `audit-campo` continuam esperando falha, com comentário citando a exceção do CP-03.
4. `COMO-REPRODUZIR.md` ("O que esperar") e `RESUMO.md` da E01: descrever a rodada atual (19 de 19 conferem) e a linha vermelha de 2026-09-30 como histórico; `GUIA-DE-VALIDACAO-F00.md:414` passa a 213.
5. Prova: nova rodada Linux do job "Linha de base" com 19 de 19 "confere" e código 0.
