---
validador: testes (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-testes`. Tudo rodou numa CÓPIA de `fd17ff4` (`git archive fd17ff4 | tar -x -C $V/arvore`), com `node_modules` montado por links simbólicos para os pacotes externos e `@dc360/*` apontando para os pacotes DA CÓPIA (um link direto para o `node_modules` da árvore faria `@dc360/campo` resolver para a árvore principal e a mutação no motor não chegaria à API nem ao aplicativo). Cada mutação foi aplicada por `$V/bin/mutar.sh` (troca exata de texto, com recusa se o trecho não aparecer exatamente uma vez), rodada, restaurada por `git show fd17ff4:<arquivo>` e conferida por `cmp`; quando a mutação era no motor e o teste consumia o `dist`, o pacote foi recompilado antes e depois. Cada `$V/mut/<id>.txt` começa com o diff da mutação. Ao final, a cópia foi comparada com uma extração limpa do SHA (`diff -rq`, sem `node_modules` e `dist`): idêntica.

O código e os testes desta etapa não mudaram entre `1ed0b71` e `fd17ff4` (`git diff --stat 1ed0b71..fd17ff4` sobre `packages/campo`, `apps/campo`, `campo-integracao.test.ts`: vazio; `packages/shared/src/codigos-de-erro.ts` mudou só em comentário, conferido linha a linha). A prova abaixo foi refeita neste SHA.

| Campo do bloco | Teste | Rodou no SHA | Mutação que o morde |
| --- | --- | --- | --- |
| Positivo: 401 `nao_autenticado` renova UMA vez e envia | `packages/campo/test/pausa-de-sessao.test.ts`; `apps/api/test/campo-integracao.test.ts` (API real) | verde, 2x | m03b (sem renovação) 6 vermelhos no motor e 2 contra a API real (i-m03b); a02 (`renovarJa` ignorado no app) 8 vermelhos no jest |
| Positivo: depois de entrar de novo sobe sem duplicar (mesma chave) | `pausa-de-sessao.test.ts`, `pausa-velha.test.ts`; `campo-integracao.test.ts` | verde | m09 (fila sem o ramo de sessão) 28 vermelhos; m12 (pausa velha não cai) 5 |
| Negativo: 401 `sessao_encerrada` e 403 `conta_desativada` deixam tudo `pendente`, zero `bloqueado`, tentativas iguais, dreno parado | `pausa-de-sessao.test.ts`, `pausa-por-senha-provisoria.test.ts` | verde | m01 (401 permanente) 15 no motor e 4 contra a API real; m04 (403 `conta_desativada` permanente) 6 e 1 contra a API real; m07 (pausa conta tentativa) 16; m08 (dreno não para) 3 |
| Negativo: sem token vira `FalhaDeSessao`, não `FalhaPermanente` | `pausa-de-sessao.test.ts`, `fila.test.ts` | verde | m02 3 vermelhos |
| Negativo: 403 `sem_permissao` ainda bloqueia | `pausa-de-sessao.test.ts`; `campo-integracao.test.ts` ("papel sem permissão continua BLOQUEANDO") | verde | m05 (`sem_permissao` vira pausa) 4 no motor e 2 contra a API real |
| Autorização: B desativado, A entra: os itens do B esperam o autor e não sobem com a sessão do A | `pausa-de-sessao.test.ts` (autoria), `pausa-por-senha-provisoria.test.ts` (corridas) | verde | m10 (filtro de autoria desligado) 1; m10c (conferência por chamada desligada) 1; m10b (as duas camadas) 8; m11 (pausa atribuída a quem está logado) 2; m13 (pausa vale para qualquer um) 2 |
| Autorização: desativar entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica | `campo-integracao.test.ts` (API real, PGlite) | verde, 2x | i-m04 reprova exatamente "conta desativada entre enfileirar e drenar" |
| Risco: renovação forçada é uma, com piso, sem laço | `pausa-de-sessao.test.ts`; `campo-integracao.test.ts` ("a fila PAUSA, sem laço"); testes de `dados/token.ts` | verde | m03 (repete com o mesmo token) 2 no motor; a01 (sem piso de 60 s) 4; a03 (sem trava em voo) 3; a06 (conta desativada na renovação não lança) 5 |
| Compatibilidade: `acesso_suspenso` temporário, `troca_de_senha_obrigatoria` pausa | `pausa-por-senha-provisoria.test.ts` | verde | m14 2; m15 4 |
| Mobile: frase "suas coletas continuam guardadas neste aparelho, procure a coordenação" | `dados/falha-de-atualizacao.test.ts`, `dados/pausa-da-fila.test.ts`, faixa | verde | a04 1; a05 (código não reconhecido) 1; a08 (faixa) 2 |
| Mobile: coleta pausada sem "Descartar" | `ui/fila-pausada-pela-sessao.test.tsx` e afins | verde | a07 (`podeDescartar` sempre) 4 |
| Regressão obrigatória | pacote campo, `test:campo`, `test:api`, `campo-integracao.test.ts` | todos verdes | n/a |
| E2E no emulador e frase no aparelho | sem emulador nem aparelho nesta máquina | não rodado | pendência humana (E4 da etapa) |

## Evidência

- `npx vitest run` em `packages/campo`, 2x: 11 arquivos, 238 de 238, código 0 (`$V/01-pacote-campo-1.txt`, `$V/16-pacote-campo-2.txt`).
- `npm run test:api`: 106 arquivos, 1685 passaram, 34 pulados, código 0 (`$V/02-test-api-1.txt`). Os 34 pulados são todos de `renovacao-contra-encerramento.test.ts` (pulo por ambiente, pede Postgres real; o CI os roda no job "A API sobe contra Postgres real", passo 13, `success`).
- `campo-integracao.test.ts` 17 de 17 dentro do `test:api` e de novo isolado, junto com `evidencia-so-do-autor`, `cors-do-envio-de-evidencia` e `precisao-do-gps-na-sincronizacao`: 39 de 39, código 0 (`$V/17-api-arquivos-das-etapas.txt`).
- `npm run test:campo`: tipos limpos, 139 suítes, 1997 de 1997, "A leitura do código e o jest concordam: 1997 casos", código 0 (`$V/05-test-campo-1.txt`). Cada uma das 40 execuções do jest inteiro sob mutação (todas as etapas) teve 1997 casos, e só falharam os casos ligados à mutação.
- Mutações: `$V/mut/e06-m01.txt` a `e06-m15.txt`, `e06-m10b.txt`, `e06-m10c.txt` (motor), `e06-i-m01`, `e06-i-m03b`, `e06-i-m04`, `e06-i-m05`, `e06-i-m10b` (motor recompilado contra a API real), `e06-a01` a `e06-a08` (aplicativo, jest inteiro). Especificações das trocas em `$V/spec/`.
- Política T42 (`scripts/portao-de-skip.mjs`, `varrerArvore`): 683 arquivos, 0 problemas, 0 skips incondicionais; por ambiente só em `renovacao-contra-encerramento`, `db/test/busca`, `entitlements-do-ios` e `som-de-despacho` (`$V/04-portao-de-skip.txt`). Busca por `.skip`, `.only`, `.todo`, `xit`, `fit` em `apps/campo/src`, `packages/campo`, `campo-integracao.test.ts`: nada.
- CI, run 39420436042 (sobre `55209ab`, que só difere de `fd17ff4` em `STATUS.md` e `ESTADO-ATUAL.md`, conferido por `git diff --stat`): 9 de 9 jobs `success`, passo a passo (`$V/03-ci-jobs.txt`). As suítes desta etapa estão em `.github/workflows/verificar.yml` e rodaram: "Suíte completa" (`npm test`, inclui `packages/campo` e `apps/api`) no job "Testes, tipos e scripts"; "Testes do aplicativo" e "Comando da raiz que mede o aplicativo (test:campo)" no job "Aplicativo de campo"; todos `success`. Os jobs usam `shell: bash` (liga `pipefail`), então o `| tee` não esconde código de saída. Log e artefato exigem token: não lidos; a lista dos 9 artefatos foi lida (`$V/03b-ci-artefatos.txt`).
- Node 24.15.0 local (o `.nvmrc` pede 22); o CI roda Node 22 e ficou verde.

## Cenários positivos

- 401 `nao_autenticado` com token renovável: renova uma vez, repete com a mesma chave de idempotência e sobe, no motor e contra a API real.
- Conta reativada e nova entrada: a coleta pausada sobe uma vez só (contra a API real).

## Cenários negativos

- 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria`, sem token: item `pendente`, tentativas iguais, zero `bloqueado`, dreno parado.
- 403 `sem_permissao` continua bloqueando (motor e API real).
- Item de outro autor não sobe com a sessão de quem está no aparelho; cada camada da autoria (filtro e conferência por chamada) tem teste próprio que reprova sem ela.

## Tentativas de reprovar

- Procurei enfraquecimento nos testes compartilhados alterados entre `1ed0b71` e `fd17ff4`: as linhas removidas em `apps/api/test/varredura-de-erros.ts` foram trocadas por versões mais estritas (`.client` somado a `.socket`/`.connection`; status literal conferido); `correcao-4-da-e09.test.ts` trocou uma asserção de outra etapa; `baseline.mjs` só SUBIU contagens (E19 28 para 54, E21 26 para 36, console 274 para 286, `e2e-api` 149 para 197). Nenhum teste desta etapa foi movido para `skip`, nenhuma contagem esperada caiu.
- Desliguei uma camada de autoria por vez para achar a que nenhum teste cobria: cada uma derruba exatamente 1 caso (m10, m10c). As duas juntas, 8.
- Rodei as mutações de autoria contra a API real (i-m10b): 17 de 17 seguem verdes, porque o servidor recusa por conta própria (`autor_divergente` e o autor tirado do token). A propriedade "o item do B nem sai do aparelho" é provada só no motor; ver Achados.
- Tirei o piso, a trava e o `renovarJa` do `token.ts` do aplicativo, um por vez: todos reprovam.

## Achados

- anotado: a defesa em profundidade da autoria na fila tem UM caso por camada (m10 e m10c derrubam 1 caso cada). Morde, mas é fino: um ajuste que mude esse caso deixa a camada sem guarda. Reprodução: `$V/mut/e06-m10.txt`, `$V/mut/e06-m10c.txt`.
- anotado: contra a API real, desligar as duas camadas de autoria do motor não reprova nada (`$V/mut/e06-i-m10b.txt`): a integração prova a recusa do servidor, não a do aparelho. Não é falso verde dos critérios (o critério de autoria é provado no motor, m10b com 8 vermelhos), mas o nome "integração" não deve ser lido como prova das duas pontas.

Nenhum achado bloqueia.

## Não verificado

- E2E no emulador (desativar o agente no painel durante a coleta, ver a frase e a coleta subir depois da reativação): não há emulador nem aparelho nesta máquina. Fica para o E4 da etapa.
- Leitura do log e dos artefatos do CI (exigem token): conferi só a situação dos jobs e passos e a lista dos artefatos pela API pública.
- Comportamento sob Node 22 local: rodei em Node 24; o CI (Node 22) é a referência e passou.

## Risco residual

O motor e o aplicativo estão presos por testes que mordem em cada critério, inclusive contra a API real nos casos de 401, 403 e renovação. O que resta é o que só o aparelho mostra (a tela com a frase, a fila real no SQLite do sistema) e a finura de um caso por camada de autoria.

## Motivo do humano

O bloco exige E2E no emulador e que o Rafael veja a frase no aparelho e o item preservado (E4). Um agente não produz E4, e esta máquina não tem emulador nem aparelho.
