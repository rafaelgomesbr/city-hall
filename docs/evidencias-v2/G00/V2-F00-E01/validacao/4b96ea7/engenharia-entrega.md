---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E01
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
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

- O defeito da rodada 1 (roteiro esperava 206 casos em `test:scripts` e rodavam 213; saía 1 numa árvore verde): CONSERTADO. No Linux do CI o roteiro saiu com código 0 e 19 de 19 passos "confere" (`baseline/RESUMO.md` do artefato: "Conferem: 19 de 19. Divergentes sem explicação: 0. Divergentes explicadas: 0"). `test-scripts` no CI: 243 casos, 239 ok, 0 falhas, 4 pulados, igual ao esperado do roteiro.
- O job "Linha de base (baseline.mjs) em Linux" não trata mais divergência como aviso: PASS. Código 3 (divergência sem explicação), código 2 ou outro, arquivo faltando, contagem de passos errada e "código 1 com passo divergente no `resultados.json`" fazem o job sair 1. Só o código 1 de divergência NOMEADA vira `::warning`, e hoje não há nenhuma nomeada (a V-DEP-4 fechou).
- O conferidor `conferirContagensDoRoteiro` (lido por `conferir:numeros`) morde: PASS (mordidas abaixo).
- Prova de máquina limpa em Linux (`npm ci` das duas árvores): PASS, passos `instalar` e `instalar-campo` do artefato (código 0, 5 s e 20 s).
- Procedimento de reprodução (`COMO-REPRODUZIR.md`, DoD "segunda pessoa obtém o mesmo resultado"): FAIL. O texto descreve um resultado que o roteiro já não produz (ver achado 1).
- Sem segredo nos artefatos: PASS (INDEX.md do artefato bate com o SHA-256 recalculado de `RESUMO.md`; o roteiro redige a própria saída).

## Evidência

Run 38445527075, evento push, sobre `c9895e9`, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (`gh run view --json jobs`). `git diff 4b96ea7..c9895e9` toca só `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`, `docs/roadmap-v2/ESTADO-ATUAL.md` e `docs/roadmap-v2/STATUS.md`, todos da lista permitida da seção 6 de `28`: o produto é o do candidato. Job "Linha de base (baseline.mjs) em Linux" (115462784085) success; log: "o baseline saiu com código 0". Artefato `baseline-c9895e9...` baixado em `scratchpad/eng/art/` (RESUMO.md, INDEX.md, resultados.json, 19 saídas). Conferido: E2E do painel "Passou: 70 Falhou: 0", E2E da API "Passou: 279" e "Passou: 50", `expo-doctor` "21/21 checks passed", `conferir-numeros` "24 afirmações" e "o roteiro espera o mesmo total de casos que a árvore tem, nas oito suítes". `grep continue-on-error` em `.github/workflows/`: só dois comentários que o proíbem; os nove `|| true` são de coleta de log, limpeza, `kill` e dos JSON de evidência do `npm audit` (o passo decisório `auditar` vem antes, sem ele).

Local (Windows, Git Bash): `npm run test:scripts` 243 casos, 239 ok, 0 falhas, 4 pulados, código 0 (`scratchpad/eng/out/test-scripts-local.txt`). `node scripts/baseline.mjs --so-listar` lista 19 passos. `.nvmrc` com `22`.

## Cenários positivos

CI Linux: 19 de 19 "confere", código 0, INDEX.md com SHA-256 coerente. Local: `baseline.mjs --sem-instalar --so=teste-shared` saiu 0 e "confere" (`out/e01-shared-base2.txt`). A saída do roteiro completo do gatekeeper (17 de 17, `scratchpad/baseline/RESUMO.md`) concorda com o CI.

## Cenários negativos

- Mutação 1: `BASE_DO_TESTE_SHARED.total` de 149 para 150 em `scripts/baseline.mjs`; `--so=teste-shared` saiu 3, passo "divergente: total: obtido 168, esperado 169" (`out/e01-shared-mut.txt`). `git restore`, verde de novo.
- Mutação 2: `codigoDeSaida` devolvendo 1 em vez de 3 para passo divergente; `node --test scripts/baseline.test.mjs` ficou vermelho em "o código de saída separa tudo confere (0), só explicada (1) e sem explicação (3)" (25 de 26; `out/e01-mut-codigo-de-saida.txt`). `git restore`, 26 de 26.
- Mutação 3: acrescentei `test("sonda...", () => {})` ao fim de `scripts/baseline.test.mjs`; `npm run conferir:numeros` saiu 1 com "test-scripts (npm run test:scripts): o roteiro (scripts/baseline.mjs) espera 243 casos e a árvore tem 244 (+1)" e o nome da tabela a atualizar (`out/e01-mut-caso-a-mais.txt`). `git restore`.
- Ocorrência real de mordida: um arquivo de teste não rastreado do outro validador (`packages/campo/test/zz-qa-sonda.test.ts`, 13 casos) fez o mesmo `conferir:numeros` reprovar com "teste-campo-pacote ... espera 223 casos e a árvore tem 236 (+13)" e nove frases de documento (`out/e01-conferir-numeros-base.txt`). Não é defeito do repositório: o arquivo não é do commit.

## Tentativas de reprovar

1. Procurei engolimento de código de saída no job (`set +e`, `|| true`, `continue-on-error`, código 1 aceito): o único `set +e` é o do passo do roteiro, que captura `PIPESTATUS[0]` e depois trata 3, outros e divergente no JSON. Não achei brecha.
2. Procurei suíte fora da conferência: `conferirContagensDoRoteiro` reprova passo com total sem medida e medida sem passo, e o teste novo confere que todo passo com total aparece em `conferir-numeros.mjs`. Não achei suíte escapando.
3. Procurei diferença entre o que o roteiro espera e o que o CI mede: nenhuma (243 e 243, 70, 279 e 50).
4. Procurei texto que ainda descreva a linha vermelha ou uma divergência que não existe: achei (achado 1).
5. Rodei `--so=teste-shared` sem mutação e deu código 3 uma vez: o caso `regras-de-conteudo` estourou 5 s sob a carga do outro validador (instabilidade conhecida, nomeada no registro da E03). Repetido, saiu 0.

## Achados

1. BLOQUEIA (documental, correção de minutos; o mecanismo está certo). `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` linhas 65 a 67 e 78 dizem que o `expo-doctor` dá 20 de 21 como divergência explicada V-DEP-4, que "uma árvore verde e rede disponível dão código 1" e que "código 0 só volta quando os seis patches do Expo forem aplicados". Os patches foram aplicados (E19, correção 2) e o roteiro sai 0 com 19 de 19 no CI e 17 de 17 local. `dc360/README.md:1173` repete: "Hoje a única divergência explicada é o `expo-doctor` (V-DEP-4)". A segunda pessoa do DoD seguiria o procedimento e obteria 0 onde o texto promete 1. Reprodução: comparar essas linhas com `baseline/RESUMO.md` do artefato. Remédio: reescrever os dois trechos para "código 0, 19 de 19; nenhuma divergência explicada hoje".
2. Anotado: os passos `audit-raiz` e `audit-campo` esperam `codigo: "falha"`, que aceita qualquer código diferente de zero. Sem rede o `npm audit` também sai 1, e o passo "confere" sem ter auditado nada. É o mesmo vício de fail-open do achado 1 da E19.
3. Anotado: os totais dos dois E2E (70, 279 e 50) só se conferem rodando o roteiro, que no CI é opcional (`[ci completo]`); o `conferir:numeros` não os alcança. O texto da etapa já diz isso.
4. Anotado: o job só roda com `[ci completo]`, `workflow_dispatch` ou `schedule`; os dois últimos só valem depois que o workflow chegar a master. Desenho declarado.

## Não verificado

Execução local completa dos 19 passos (proibida aqui: `npm ci`, banco e E2E; vale o Linux do CI e a saída do gatekeeper). Segunda máquina, macOS. Passo do Firefox da API (fora do roteiro, D-4).

## Risco residual

Documento de reprodução desatualizado leva a segunda pessoa a duvidar de um resultado certo; `audit` cru passa por "confere" sem rede.

## Motivo do humano

Não aplicável.
