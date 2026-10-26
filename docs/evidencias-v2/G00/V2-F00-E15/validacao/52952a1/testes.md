---
validador: testes (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão testes. O código da etapa não mudou desde `4b96ea7` (o único diff em `vistoria/[id].tsx` é da E16: `await guardarFotoNoAparelho` e `SobreOVisor`). Reexecutei no SHA: os testes de "sair não apaga vistoria", de "Entrar de novo preserva o rascunho" e do piso de GPS mordem. As três mutações sobreviventes da rodada 2 (E2, E8, E9) continuam vivas: nenhum teste foi escrito para elas. Mantenho a classificação "corrige antes de crescer" que o veredito da rodada 2 deu, mas E8 é a mais próxima do objetivo da etapa e deveria ser a primeira.

Base: `$SP/val/testes/` (prefixo `e15-`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| 7 testes da etapa e os vizinhos verdes, independentes da ordem | PASS | 9 arquivos (`dialogo-na-conta-com-vistoria-comecada`, `dialogo-na-conta`, `aviso-da-saida`, `precisao-do-gps`, `vistoria-sessao-vencida-preserva-o-rascunho`, `vistoria-ainda-nao-baixada`, `sair-e-entrar-nao-perde-a-coleta`, `logout-nao-apaga-prova`, `vistoria-o-teclado-a-camera-e-o-que-ela-promete`), `--randomize` sementes 1 a 5: 66 de 66 (`e15-01-...`) |
| precisão 0,3 vira 1 (piso de GPS) | morde | `Math.max(1, ...)` tirado de `precisao-do-gps.ts`: 3 reprovam (`e15-10-...`) |
| a tela usa o piso | morde | a tela volta a `Math.round(accuracy)` direto: 1 reprova (`e15-11-...`) |
| o esquema recusa 0 e negativo sem afrouxar `positive()`, com mensagem em português | morde | `positive()` trocado por `nonnegative()` em `packages/shared/src/schemas.ts:369`: 3 de 11 reprovam em `precisao-do-gps.test.ts` e `mensagens-em-portugues.test.ts` (`e15-21-...`; base 11 de 11 em `e15-20-...`) |
| "Entrar de novo" (sessão vencida) não apaga nada (correção 1, FAIL da rodada 1) | morde | a tela da vistoria passa a chamar `sair` no lugar de `encerrarSessaoVencida`: 3 reprovam (`e15-12-...`), com sessão, banco e rascunho reais em `vistoria-sessao-vencida-preserva-o-rascunho` |
| R2 E8: disco ilegível ao perguntar a saída tratado como "nada a perder" | AINDA ABERTO | `perfil.tsx:471` `setRascunhosNaSaida(null)` trocado por `contarRascunhos([])`: 66 de 66 verdes (`e15-13-...`) |
| R2 E9: diálogo deixa de contar os itens bloqueados da fila | AINDA ABERTO | `+ resumoDaFila.bloqueados` tirado de `perfil.tsx:352`: 66 de 66 (`e15-14-...`) |
| R2 E2: `acolherNoAparelho` apaga com dono nulo | AINDA ABERTO | `dono !== null &&` tirado de `banco-local.ts`: 66 de 66 (`e15-15-...`) |
| dublês fiéis | PASS, com a ressalva da rodada 2 | os testes com sessão real usam `node:sqlite` por trás do dublê de `expo-sqlite` (o `runAsync` não devolve `{ changes, lastInsertRowId }`, nada depende disso); o disco de arquivos é um conjunto de nomes com `delete()` e `list()` síncronos, como no módulo real |

## Evidência

- `cd dc360/apps/campo && npx jest --ci --randomize --seed=N <9 arquivos>`, N de 1 a 5: código 0, 66 de 66. `$SP/val/testes/e15-01-lote-5-sementes.txt`.
- `cd dc360/packages/shared && npx vitest run test/precisao-do-gps.test.ts test/mensagens-em-portugues.test.ts`: 11 de 11 (`e15-20`), com a mutação 3 reprovam (`e15-21`).
- Cada mutação desfeita com `git restore src`, `git status --porcelain src` vazio depois de cada uma.

## Cenários positivos

- A mesma pessoa entra de novo e reencontra checklist, observações, assinatura e foto (`vistoria-sessao-vencida-preserva-o-rascunho`).
- Precisão 12,4 vira 12; precisão ausente continua `null`.

## Cenários negativos

- A saída explícita do Perfil continua apagando (controle do mesmo arquivo).
- Precisão 0 e negativa recusadas pelo esquema com frase em português.
- Outro agente que entra no aparelho começa limpo (`sair-e-entrar-nao-perde-a-coleta`, que a mutação E1 da rodada 2 derrubava; não refiz essa mutação porque o arquivo e o código não mudaram).

## Tentativas de reprovar

1. Desfiz o piso de GPS em duas camadas (função e tela) e afrouxei o esquema: as três mordem.
2. Fiz "Entrar de novo" chamar `sair`: morde com os módulos reais.
3. Reapliquei E2, E8 e E9 da rodada 2: as três continuam verdes. E8 é a de mais peso: com o disco ilegível, o diálogo diria "nada a perder" e a saída apagaria a vistoria começada sem aviso, que é exatamente o defeito que a etapa existe para impedir. Hoje o código está certo (o ramo `null` mostra "Não deu para conferir se há vistoria começada"), mas nada impede a regressão.

## Achados

### CORRIGE ANTES DE CRESCER

1. **E8 sem teste, herdado da rodada 2.** Reprodução: `e15-13-E8-disco-ilegivel.txt`. Teste a escrever: `listarRascunhos` rejeita ao abrir o diálogo de saída e a tela traz "Não deu para conferir se há vistoria começada". Dono: E15. Prioridade maior entre os três, pelo motivo acima.
2. **E9 sem teste, herdado.** Nenhum caso do diálogo usa item `bloqueado`. Dono: E15.
3. **E2 sem teste, herdado.** Dono nulo não deveria apagar. Ligado à pendência de piloto da arbitragem da rodada 2 (`acolherNoAparelho` falha aberto), dono F14-E02.

### ANOTADO

- Os testes de tela do Perfil usam dublês de `useSessao` e de `obterFila` (módulos do próprio aplicativo); o arquivo com sessão real é o contrapeso.

## Não verificado

- Os dois fluxos em aparelho (sair com vistoria começada; GPS abaixo de 0,5 m sem 422): fora desta dimensão, sem emulador Android; pendência humana e E2 de outras dimensões.
- A mutação E1 e as de limpeza do logout (E3 a E7 da rodada 2) não foram refeitas: os arquivos não mudaram e a rodada 2 as matou.

## Risco residual

Médio-baixo: o comportamento de hoje está guardado nos pontos centrais; três ramos de borda dependem só de leitura de código.

## Motivo do humano

Nenhum para esta dimensão.
