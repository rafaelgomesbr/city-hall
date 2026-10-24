---
validador: testes (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo da rodada (D-31, item 4): a diferença `fd17ff4..60cbc2f` em `dc360/apps/campo`, que são 4 arquivos (`git diff --stat`): os três testes `hoje-lista-e-mapa`, `mapa-tela-dedicada` e `tarefas-em-sanfona` (commit `21fe639`, correção 3) e o `LEIA-ME.md` (commit `ae05a03`, da E21). Nenhum arquivo de produto do campo mudou. Entre `60cbc2f` e o HEAD só há arquivos em `docs/` (`git diff --name-only 60cbc2f..HEAD | grep -v '^docs/'` vazio), então o CI do run 39524190207 (sobre `c680f8d`) vale para o SHA.

1. A mudança dos testes é legítima: o auxiliar `tarefa()` calculava `Date.now() + 9h` por chamada; agora o prazo padrão é um instante único por caso (`prazoPadrao`, fixado no `beforeEach` de topo). Nenhuma asserção foi alterada (o diff só toca o auxiliar, o `beforeEach` e um comentário). VERIFICADO.
2. Tira a instabilidade sem enfraquecer o que o teste prova: o teste ainda morde (mutações abaixo). VERIFICADO.
3. Não esconde defeito de produto: a instabilidade era do teste. `ordemDoDia` desempata por grupo, faixa de prazo, distância, instante exato do prazo e protocolo, nessa ordem, por desenho documentado no próprio arquivo; é determinística para uma entrada dada. A faixa de prazo é por blocos fixos do relógio (`Math.floor(prazo / janela)`), e não por `(prazo - agora)`. A entrada instável (prazos a 1 ms) era artefato do auxiliar. O produto filtra 0,0 duas vezes (`pontoQueSeMede` na tela e na entrada de `ordemDoDia`). VERIFICADO por leitura e por reprodução determinística (abaixo).
4. O `LEIA-ME.md` diz só o que é verdade: o job `plataformas` existe (`.github/workflows/verificar.yml:674`, matriz Windows e Linux), `scripts/fixtures/router.d.ts.velho` existe e não contém `/avisos`, `/mapa`, `/perfil`, o passo "Caso 3, controle" exige `error TS2345` do `tsc` direto e o passo seguinte roda `npm run test:campo`; no run 39524190207 os passos 16, 17 e 18 do caso 3 estão `success` em ubuntu e windows. Imprecisão de redação: "a cada push" (ver Achados, A1). VERIFICADO, com ressalva menor.
5. Critério de DoD da E16 afetado: "7 testes verdes" e "vermelhos do campo do G00 zerados". Suíte completa do campo no SHA: 139 suítes, 1997 de 1997 (mesma contagem que o CI). VERIFICADO.

## Evidência

Tudo em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/testes-E16/` (cópia `git archive 60cbc2f` em `copia/`, com `node_modules` ligado por link simbólico, Node 24.15.0 local; CI em Node 22).

- CI: run 39524190207, 12 de 12 `success` pela API pública (`/actions/runs/39524190207/jobs`); job 118974893844 "Aplicativo de campo", todos os passos `success`, incluindo "TypeScript estrito", "Testes do aplicativo" e "Comando da raiz que mede o aplicativo (test:campo)".
- Os arquivos de teste da cópia são idênticos aos de `git show 60cbc2f:...` (conferido com `diff -q`).
- Três arquivos, 95 casos, 30 rodadas seguidas sem carga extra: 30 de 30 verdes (`estabilidade-30.txt`).
- Três arquivos com `--runInBand`, 10 processos `yes` ocupando a CPU (load average chegou a 25,75), 15 rodadas: 15 de 15 verdes (`carga-15.txt`).
- Suíte completa do campo (`npx jest --silent`): 139 suítes, 1997 de 1997 (`completo.txt`).
- Reprodução determinística do defeito antigo (sonda minha, independente da do implementador): `giro/`: injetei em `tarefa()` um laço que gira até o relógio virar de milissegundo (`while (Date.now() === t0) {}`), nas duas versões do arquivo. Versão ANTIGA (de `fd17ff4`): 1 reprovado, 94 verdes, o caso 0,0 recebe `["longe","perto"]` em vez de `["perto","longe"]`, com a asserção do aviso "não considerou distância" e a de ausência de distância PASSANDO (`giro-antigo.txt`); isso prova que o defeito é só o prazo em milissegundos, não a ilha nula. Versão NOVA: 95 de 95 (`giro-novo.txt`). Nenhum outro caso dos três arquivos dependia do milissegundo na versão antiga.
- Mordida do teste novo, mutações no produto na cópia, restauradas e conferidas com `diff -q` (`mut.sh`, `mut-*.txt`):
  - M1, remover `if (latitude === 0 && longitude === 0) return null;` de `pontoQueSeMede`: 3 reprovados, entre eles "a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma".
  - M2, inverter o desempate por protocolo em `ordemDoDia`: 5 reprovados, entre eles o caso 0,0 (prova que o protocolo é de fato quem decide agora, e que o teste enxerga isso).
  - M3, tirar o filtro da origem na entrada de `ordemDoDia` (a tela continua filtrando): 95 de 95 passam (sobrevive; ver Achados, A2).
- Mordida da guarda do auxiliar: apaguei a linha do `beforeEach` que fixa `prazoPadrao`: 19 de 19 casos reprovam com "tarefa() montada antes do beforeEach de topo" (`mut-M4-sem-prazoPadrao.txt`). A regra não envelhece em silêncio.
- Cobertura do padrão: `grep "Date.now() + 9 \* HORA"` só acha os três arquivos corrigidos. Os `prazo_em: new Date(Date.now() + ...)` explícitos que sobram nos três arquivos têm deslocamentos diferentes entre si (30 h, 40 h, -5 h, `9+5i` h) ou usam uma constante única (`VENCIDA`), então não há par "empatado por intenção" montado em duas chamadas. Não há `useFakeTimers` nem `setSystemTime` nos três arquivos, então fixar o prazo no `beforeEach` não muda a semântica de relógio de nenhum caso.
- O `diff-da-correcao.patch` arquivado coincide linha a linha com `git show 21fe639 -- dc360/apps/campo/src`.

## Cenários positivos

- Os três arquivos passam sem carga, com carga alta e em `--runInBand` (acima).
- O caso 0,0 passa com o relógio girando entre as duas montagens (o cenário que reprovava no CI).
- Suíte completa do campo passa com a contagem exata de 1997.
- Os passos do job `plataformas` que o `LEIA-ME` descreve passam em Windows e Linux no run.

## Cenários negativos

- Produto quebrado (M1: 0,0 deixa de ser filtrado): o caso 0,0 reprova com a frase certa de erro.
- Produto quebrado (M2: protocolo invertido): o caso 0,0 reprova.
- Teste mal montado (sem `prazoPadrao`): todos os casos do arquivo reprovam com mensagem explícita.
- Teste ANTIGO sob relógio girando: reprova de forma determinística (prova que a causa é a apontada).

## Tentativas de reprovar

1. Tentei achar defeito de produto escondido atrás da instabilidade: li `ordem-do-dia.ts` inteira (degraus, `faixaDePrazo`, `pontoQueSeMede`) e reproduzi a falha antiga de forma determinística; a falha só aparece na ordem final, com as outras duas asserções do caso passando, o que descarta que a ilha nula tenha ordenado a lista. Sem defeito de produto.
2. Tentei achar enfraquecimento da asserção: comparei o diff; as asserções do caso 0,0 (`getByText(/não considerou distância/)`, ausência de `\d+ (m|km)`, `toEqual(["perto","longe"])`) estão intactas. As mutações M1 e M2 mostram que continuam mordendo.
3. Tentei achar instabilidade remanescente: 30 rodadas limpas, 15 rodadas sob carga de CPU, relógio girando. Zero falhas. Procurei o mesmo padrão em outros arquivos de teste do campo: só os três tinham o auxiliar.
4. Tentei achar caso que dependesse do prazo por-tarefa distinto (fixar o prazo mudaria o sentido do teste): `Date.now()` explícitos diferem entre si ou usam constante; nenhum caso usa relógio falso; a suíte inteira passa.
5. Tentei fazer a guarda falhar em silêncio: removi o `beforeEach` e a guarda estourou em todos os casos.
6. Tentei achar mentira no `LEIA-ME.md`: conferi a existência do job, da fixture, da ausência das três rotas nela, do controle TS2345, da ordem controle/`test:campo` e do resultado no run. Achei uma imprecisão de redação (A1).
7. Tentei achar divergência entre o SHA e o HEAD: `60cbc2f..HEAD` só toca `docs/`.

## Achados

- A1 (DÍVIDA, não reprova). `LEIA-ME.md` diz que o job `plataformas` "prova isso a cada push". O gatilho é `push` em `main`, `master` e `v2/**`, mais `pull_request` (`verificar.yml:50-52`); um push em outro ramo (por exemplo `trab/*`) não roda o job. Texto levemente amplo, sem consequência para o usuário do produto. Classificação D-31: não viola critério escrito da DoD, não é alcançável por usuário, não está na lista da seção 7. Dívida de redação.
- A2 (INFORMATIVO, dívida, não reprova). A mutação M3 (tirar o filtro da origem 0,0 dentro de `ordemDoDia`) sobrevive nos três arquivos, porque a tela já filtra com `pontoQueSeMede` antes. O filtro de `ordemDoDia` é defesa em profundidade e existe um teste de unidade próprio (`src/dados/ordem-do-dia.test.ts`, fora do escopo desta rodada e não alterado por ela). Pré-existente, não relacionado à correção 3. Classificação D-31: não viola DoD da E16, não alcançável hoje (a tela filtra antes).
- A3 (INFORMATIVO). Os `act()` warnings no stderr do jest (ex.: `setDesenhado` em `componentes.tsx`) aparecem nas rodadas e são pré-existentes; não mudam o resultado e não são desta correção.
- Nenhum achado que reprove pelas condições (a), (b) ou (c) do item 1.

## Não verificado

- Node 22 (versão do CI): só rodei em Node 24.15.0. O CI em Node 22 está verde no run 39524190207, mas não reproduzi localmente em 22.
- Windows para os testes do campo: só o run do CI (job `plataformas`) cobre Windows; não rodei os três arquivos em Windows.
- Os logs completos do CI (exigem token): li só a lista de jobs e passos pela API pública, não o texto das saídas.
- O `npm run test:campo` da raiz (typecheck + jest + contagem) e os três portões `portao-*-do-aplicativo.test.mjs`: confiei no CI (job "Aplicativo de campo" e job de scripts verdes); rodei só o jest completo do campo. A prova de que o comando da raiz passa é o passo 9 do job 118974893844 com `success`.
- A validação humana no aparelho (iPhone e Android real) da E16 inteira: fora desta dimensão e já registrada como pendência humana na rodada 7. A parte de produto da E16 (a tela de vistoria, as tarjas, o botão de ajustes) não mudou nesta rodada e não foi reexecutada por mim além do jest completo.
- O índice `INDEX.md` de `correcao-3/` (SHA-256) e o conferidor de índices: é tarefa de outro validador/gatekeeper; não os conferi.
- Taxa natural de falha antes da correção em CI: não a medi (a sonda determinística substitui esse número).

## Risco residual

Baixo. A taxa natural do defeito antigo era de cerca de 1 em 40 a 1 em 200 execuções; a correção a elimina por construção (um instante único por caso), provada por reprodução determinística. Resta: (1) outro auxiliar de teste, em arquivo futuro, voltar a calcular `Date.now()` por tarefa (a guarda cobre só os três arquivos atuais); (2) a diferença de Node 22 e Windows, coberta pelo CI mas não por mim.

## Motivo do humano

Nenhum para esta dimensão e esta rodada. A pendência humana da E16 (conferência no aparelho físico) já está registrada desde a rodada 7 e não é afetada pela mudança de testes desta rodada.
