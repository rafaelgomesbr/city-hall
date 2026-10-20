---
validador: testes
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

`$V` abaixo é `SCRATCH/validadores/testes` (SCRATCH é o scratchpad desta validação). Árvore principal no HEAD `5044e7a`, que só difere de `1ed0b71` em `STATUS.md` e `ESTADO-ATUAL.md`; `dc360/` é o do SHA. Toda mutação foi aplicada por `$V/mutar.sh` (aplica, roda, `git restore`, confere o arquivo limpo); cada saída `$V/mut-*.txt` começa com o diff da mutação.

| Campo do bloco | Onde está o teste | Rodou no SHA | Morde? |
| --- | --- | --- | --- |
| Positivo: 401 `nao_autenticado` renova UMA vez e envia | `packages/campo/test/pausa-de-sessao.test.ts:135`, `:544`; `apps/api/test/campo-integracao.test.ts:596` (API real) | verde 2x | sim: m03 (repete com o mesmo token) 2 vermelhos; a02 (`renovarJa` ignorado no app) 8 vermelhos |
| Positivo: depois de entrar de novo sobe sem duplicar (mesma chave) | `pausa-de-sessao.test.ts:149`, `:362`, `:389`; `campo-integracao.test.ts:455`, `:491`, `:521` | verde 2x | sim: m06 (fila sem ramo de sessão) 28 vermelhos no motor e i02b 5 vermelhos contra a API real |
| Negativo: 401 `sessao_encerrada` e 403 `conta_desativada` deixam tudo `pendente`, zero `bloqueado`, tentativas iguais, dreno parado | `pausa-de-sessao.test.ts:314` (por motivo), `:340`; `pausa-por-senha-provisoria.test.ts` (matriz 13 linhas x 4 rotas) | verde 2x | sim: m01 6, m07 (pausa conta tentativa) 16, m04 2 vermelhos |
| Negativo: sem token vira `FalhaDeSessao`, não `FalhaPermanente` | `pausa-de-sessao.test.ts:265`, `:595`; `fila.test.ts` | verde 2x | sim: m02 3 vermelhos |
| Negativo: 403 `sem_permissao` ainda bloqueia | `pausa-de-sessao.test.ts:249`, `:631`; `campo-integracao.test.ts:645` | verde 2x | sim: m05 (403 `sem_permissao` vira pausa) 4 vermelhos |
| Autorização: B desativado, A entra: os itens do B esperam o autor e não sobem com a sessão do A | `pausa-de-sessao.test.ts:484`, `:513` | verde 2x | sim: m12 (dreno aceita item de outro autor) 1 vermelho; m13 (pausa vale para qualquer um) 2 vermelhos |
| Autorização: desativar entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica | `campo-integracao.test.ts:455` (API real, PGlite) | verde 2x | sim: i01 (motor recompilado com 403 permanente) reprova exatamente este caso |
| Risco de segurança: renovação forçada é uma, com piso, sem laço | `pausa-de-sessao.test.ts:162`, `:177`; `campo-integracao.test.ts:627`; testes de `dados/token.ts` | verde | sim: a01 (sem piso de 60 s) 4 vermelhos; m03 2 vermelhos |
| Correção 3: "Enviar agora", fila, vistoria e aviso de saída sem promessa de sinal com a fila pausada | `__tests__/enviar-agora-com-a-fila-pausada.test.tsx`, `ui/fila-pausada-nao-promete-sinal.test.tsx`, `__tests__/vistoria-guardada-com-a-fila-pausada.test.tsx`, `dados/aviso-da-saida.test.ts` | verde 2x e 3x embaralhado | sim: a10 3, a11 3, a12 (Descartar na pausada) 4, a14 3, a15 10 vermelhos |
| Correção 3b: pausa velha cai ao entrar de novo | motor `test/pausa-velha.test.ts` (7); app `ui/pausa-cai-ao-entrar-de-novo.test.tsx`, `__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` | verde 2x | sim: m08 5, m09 (geração lida na resposta e não no pedido) 1, a05 (login não sobe a geração) 1, a06 (fila do app sem a geração) 1 vermelho |
| Correção 3b: Perfil com a fila pausada (aviso e chip) | `ui/dialogo-na-conta.test.tsx` | verde 2x | sim: a07 (chip) 3, a08 (aviso) 6 vermelhos |
| Correção 3b: acesso suspenso em "Enviar agora" | `enviar-agora-com-a-fila-pausada.test.tsx` | verde 2x | sim: a09 1 vermelho |
| Frase da conta desativada | `dados/pausa-da-fila.test.ts`, `faixa-de-sincronizacao.test.tsx` | verde | sim: a13 2 vermelhos |
| Regressão obrigatória | pacote campo, `test:campo`, `test:api`, `campo-integracao.test.ts` | todos verdes, cada um 2x | n/a |
| E2E no emulador | não há emulador nem aparelho nesta máquina | não rodado | pendência humana E4 |

## Evidência

- `npx vitest run` em `packages/campo`, 2x: 11 arquivos, 238 de 238, código 0 (`$V/e06-01-pacote-campo-1.txt`, `-2.txt`); 3x com `--sequence.shuffle` (sementes 1, 2, 3): 238 de 238 (`$V/e06-06-pacote-embaralhado-*.txt`).
- `npm run test:campo`, 2x: tipos limpos, 139 suítes, 1997 de 1997, "a leitura do código e o jest concordam: 1997 casos", código 0 (`$V/geral-01-test-campo-1.txt`, `geral-02-test-campo-2.txt`).
- 15 arquivos de tela e dados da etapa no jest do app, 2x: 194 de 194 (`$V/e06-04-app-arquivos-*.txt`); 3x com `--randomize` (sementes 11, 12, 13): 194 de 194 (`$V/e06-05-app-embaralhado-*.txt`).
- `npx vitest run test/campo-integracao.test.ts test/evidencia-so-do-autor.test.ts` em `apps/api`, 2x: 28 de 28, código 0 (`$V/e06-02-api-integracao-*.txt`).
- `npm run test:api`, 2x: 106 arquivos, 1590 passaram, 34 pulados, código 0 (`$V/geral-03-test-api-1.txt`, `geral-06-test-api-2.txt`). Os 34 pulados são todos de `renovacao-contra-encerramento.test.ts` (pedem `DC360_POSTGRES_DE_PROVA`), fora desta etapa.
- Mutações: `$V/mut-e06-m01` a `m13` (motor), `$V/mut-e06-a01` a `a15` (aplicativo, jest inteiro), `$V/mut-e06-i01`, `i02b` (motor recompilado contra a API real), `i03`, `i04` (F5 e F6 contra o jest inteiro do app). `i02` não chegou a rodar (o `tsc` recusou a forma da mutação) e foi refeita como `i02b`.
- Política T42: varredura de `scripts/portao-de-skip.mjs` sobre 681 arquivos, 0 problemas, 0 skips incondicionais; skips por ambiente só em `renovacao-contra-encerramento`, `db/test/busca`, `entitlements-do-ios` e `som-de-despacho` (`$V/geral-05-portao-de-skip.txt`). Nenhum `skip`, `only`, `todo`, `xit` ou `fit` em `apps/campo/src` nem em `packages/campo/test`. Nenhum condicional de ambiente nos arquivos da etapa.
- Node v24.15.0 (o `.nvmrc` pede 22): nenhuma divergência observada.

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e o item sobe uma vez, contra o motor e contra a API real.
- Conta reativada e sessão nova: a coleta sobe uma vez, com a mesma chave de idempotência (`campo-integracao.test.ts:455`, `:491`, `:521`).
- A pausa cai quando a pessoa entra de novo, sem esperar envio (motor e aplicativo com a fila real).

## Cenários negativos

- 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria` e falta de token: item `pendente`, tentativas iguais, zero `bloqueado`, dreno parado, nas quatro rotas da fila.
- 403 `sem_permissao` continua bloqueando (motor e API real).
- Isolamento entre agentes no aparelho: itens do B não sobem com a sessão do A, e a pausa do B não aparece para o A.
- Recusa de pedido feito com a credencial velha não pausa a credencial nova (m09 morde).

## Tentativas de reprovar

- 13 mutações no motor: 11 reprovam a suíte do pacote; 2 sobrevivem (m10, F5: `devolverAoEstadoAnterior` sem a guarda do dreno cancelado; m11, F6: `tratarFalha` sem a guarda do item `confirmado`). Recompilei o motor com F5 e com F6 e rodei o jest inteiro do aplicativo: 1997 de 1997 nos dois (`i03`, `i04`). O efeito sem as guardas é estado local errado, sem perda nem duplicação no servidor (a chave de idempotência segura).
- 15 mutações no aplicativo: 13 reprovam o jest inteiro; 2 sobrevivem (a03, A12: o pedido comum de token passa a lançar com a conta desativada; a04, A9: o laço de fundo volta a 15 s com a fila pausada).
- Mutações do motor recompilado contra a API real: i01 e i02b reprovam (`campo-integracao.test.ts`).
- Ordem: `campo-integracao.test.ts` com `--sequence.shuffle` reprova em 2 de 3 sementes, sempre no caso anterior à etapa "o coordenador consegue ver a foto que o agente enviou" (`$V/e06-03-integracao-embaralhada-*.txt`). Os casos da E06 passam em todas as ordens. As suítes do app e do motor passam embaralhadas.
- Composição da 3b: a mutação a05 (login sem subir a geração) só é pega por `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (`$V/mut-e06-a05b-detalhe.txt`); `pausa-cai-ao-entrar-de-novo.test.tsx` sobe a geração direto. A cadeia login, geração e pausa fica coberta em duas metades que mordem cada uma.

## Achados

### CORRIGE ANTES DE CRESCER

1. **F5 e F6 continuam sem teste** (herdado da rodada 4). Reprodução: `$V/mut-e06-m10-F5-dreno-cancelado-devolve.txt`, `m11`, `i03`, `i04`. Dono: E06.
2. **A9 e A12 continuam sem teste** (herdado da rodada 4). Reprodução: `$V/mut-e06-a04-A9-laco-15s-pausado.txt`, `a03`. O laço contra o servidor continua impedido pelo piso de 60 s e pela renovação única (a01 e m03 mordem); A9 só alonga a espera com a fila pausada. Dono: E06.
3. **`campo-integracao.test.ts` depende da ordem** (caso anterior à etapa, herdado). Reprodução: `$V/e06-03-integracao-embaralhada-1.txt`. Vermelho falso se a ordem mudar, não verde falso. Dono: quem tocar o arquivo, ou F01-E03.

### ANOTADO

- O achado 1 da rodada 4 (tarja de "Enviar agora" manda esperar sinal com a fila pausada) está consertado e preso por teste que morde (a10, a11, a09).

## Não verificado

- E2E do bloco (desativar o agente no painel durante uma coleta e ver a frase no aparelho, depois a coleta subir com nova entrada): não há emulador Android nem aparelho nesta máquina. Pendência humana E4.
- Frase de produto da conta desativada, da sessão encerrada e da senha provisória: aprovação do Rafael, fora desta dimensão.
- Comportamento do cofre e do SQLite nativos: os testes usam SQLite do Node e cofre simulado.
- CI do SHA: ausente (H32); a prova aqui é a execução local.
- Não escrevi os testes que faltam para F5, F6, A9 e A12; só provei que as mutações sobrevivem.

## Risco residual

O núcleo da etapa (classificação dos três códigos, item preservado, dreno parado, renovação única com piso, autoria) é preso por testes que mordem no motor, no aplicativo e contra a API real. O que sobra sem teste (F5, F6, A9, A12) produz estado local errado ou espera mais curta, não perda nem duplicação. A prova em aparelho continua inexistente.

## Motivo do humano

O E2E do bloco e a validação humana pedem o aparelho ou o emulador: Rafael vê a frase da conta desativada e a coleta preservada, e a coleta sobe depois da reativação. Esta máquina não tem emulador nem aparelho.
