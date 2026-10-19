---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: seção 7 item 3 de 28 (vazamento de dado pessoal, sem risco aceito), fora do critério da etapa: acolherNoAparelho continua falhando aberto entre pessoas, reproduzido de novo em bb0f654, e o bloco da F14-E02 ainda não pede falha fechada
---
## Critérios verificados

| Critério da etapa | Resultado | Prova |
| --- | --- | --- |
| O diálogo "Sair da conta?" conta rascunhos e fotos, singular e plural, botão destrutivo; sem nada, frase curta | PASS | `dialogo-na-conta-com-vistoria-comecada.test.tsx`, `aviso-da-saida.test.ts`, `dialogo-na-conta.test.tsx` verdes (saída `08`); mutação M1 (o diálogo deixa de ler os rascunhos) reprova 2 casos e M4 (disco que falha vira frase curta) reprova 1 (saída `09`). |
| Sair da conta não apaga vistoria começada sem avisar (nenhum outro caminho chama `sair()`) | PASS | Busca em `apps/campo/src` fora de teste: `sair()` só em `perfil.tsx:1479`, atrás do diálogo; `apagarDadosLocais` só em `sair()` e em `acolherNoAparelho`. M3 (faixa da vistoria volta a chamar `sair`) reprova 3 casos. |
| "Entrar de novo" (sessão vencida) continua sem apagar nada | PASS | `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` e `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` verdes; M3 e M6 mordem. |
| `gpsPrecisaoMetros` = `Math.max(1, Math.round(accuracy))`; ausente ou inválida grava nulo | PASS | Sonda com 18 entradas (saída `11`); M2 (sem o piso) reprova 3 casos. |
| O esquema recusa 0 e negativo (`positive()` não afrouxado), mensagem em português na API | PASS | M7 (`nonnegative()`) reprova 2 casos do shared (saída `10`); pela API real, 0 dá 422 (saída `12`). |
| Outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida); a mesma pessoa reencontra | PASS no caminho normal; falha aberta no caminho de erro (achado 1, anterior à etapa) | `sair-e-entrar-nao-perde-a-coleta.test.ts` verde; M5 reprova; sonda de falha de disco (saída `13`). |
| Regressão: `npm run test:campo` | PASS | 134 suítes, 1927 de 1927, tipos limpos, código 0 (saída `14`). |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E09-E10-E13-E15/`:

- `08-jest-e15.txt`: `npx jest` (em `apps/campo`) nos 9 arquivos da etapa e da correção 1 (lista em `e15-testes.txt`), código 0, 65 de 65.
- `09-mutacoes-e15.txt`: seis mutações no app, cada uma aplicada, testada e desfeita por `git restore`, com o diff de cada uma e o `git status` vazio no fim:
  - M1 `perfil.tsx`: `contarRascunhos([])` no lugar de `listarRascunhos()`: 2 de 6 falham;
  - M2 `precisao-do-gps.ts`: sem `Math.max(1, ...)`: 3 de 22 falham;
  - M3 `vistoria/[id].tsx`: `sair` no lugar de `encerrarSessaoVencida`: 3 de 13 falham;
  - M4 `aviso-da-saida.ts`: disco que falha devolve nada: 1 de 16 falha;
  - M5 `banco-local.ts`: `acolherNoAparelho` nunca apaga: 1 de 5 falha ("o Bruno entra: o rascunho da Ana é limpo");
  - M6 `sessao.tsx`: `sair()` sem `apagarDadosLocais()`: 1 de 9 falha.
- `10-mutacao-esquema.txt`: M7 em `packages/shared/src/schemas.ts` (`positive` para `nonnegative`): 2 de 3 falham; restaurado, 3 de 3.
- `11-sonda-gps.txt`: `precisaoDoGpsEmMetros` real contra 18 entradas e o esquema real.
- `12-sonda-gps-api.txt`: `POST /sincronizacao/vistoria` na API real com PostgreSQL 17.6 próprio, corpo cru com `0.3`, `1e999`, `5e-324` e `0`.
- `13-sonda-acolher-falha-aberta.txt`: caso temporário acrescentado ao fim de `sair-e-entrar-nao-perde-a-coleta.test.ts` (SQLite real do Node), rodado sozinho e desfeito por `git restore` (`git status` vazio registrado na saída).
- `14-test-campo.txt`: `npm run test:campo`, código 0.

## Cenários positivos

- Precisão 0,3, 0,49, 0,5, 0,51, 1 e 1,49 gravam 1; 12,4 grava 12; tudo passa pelo esquema do servidor.
- A mesma pessoa que entra de novo reencontra checklist, foto e assinatura; a fila fica byte a byte igual.
- "Entrar de novo" na faixa da vistoria leva a `/entrar` e o rascunho continua.

## Cenários negativos

- Precisão 0, -0, -3, NaN, Infinity, -Infinity, nula, ausente e texto gravam nulo no app.
- Pela API, `gpsPrecisaoMetros: 0` responde 422 com o campo nomeado.
- Sem rascunho e sem fila, o diálogo usa a frase curta; com o disco falhando, avisa que sair apaga toda vistoria não concluída.

## Tentativas de reprovar

1. **Caminho que apaga sem diálogo.** Procurei todo chamador de `sair()` e `apagarDadosLocais()` no app (fora de testes): um só `sair()`, o do diálogo; nenhum apagamento por conta desativada, 401 ou 403. Não reprovou.
2. **O diálogo conta menos do que a saída apaga.** `apagarDadosLocais` apaga `rascunhos`, `pendencias` (lista de tarefas baixada, rebaixável), `marcas`, `coletas` (lápides) e arquivos de prova fora da fila; o único trabalho não recuperável entre eles é o rascunho e as provas dele, que o diálogo conta no instante do toque. A tela da vistoria grava a cada mudança (`alterar` chama `salvarRascunho`), então não há vistoria só em memória escapando da contagem. Exceção pequena: `listarRascunhos` ignora linha ilegível (JSON quebrado), que não entra na conta e é apagada calada (achado 3). Não reprovou o critério.
3. **Vazar a vistoria para a próxima conta no mesmo aparelho (REPROVOU como achado, fora do critério).** Com o `DELETE FROM rascunhos` falhando ("database or disk is full"), `acolherNoAparelho(BRUNO)` devolve `apagou: true`, marca o Bruno como dono e o rascunho da Ana continua visível a ele, com observação, coordenada e nome de quem assinou (saída `13`). `apagarDadosLocais` engole o erro (`try` com `console.warn`) e `acolherNoAparelho` segue como se tivesse limpado.
4. **Burlar o piso de precisão.** No app, nenhuma entrada passa abaixo de 1 ou chega como 0 (Infinity e NaN viram nulo). No servidor, o piso não existe: `0.3`, `5e-324` e `1e999` (que o `JSON.parse` transforma em Infinity) são aceitos com 201 e gravados como `0.3`, `5e-324` e `Infinity` (saída `12`), e o laudo escreve `${n} metros`. Só um cliente forjado faz isso (o app não manda), e só para a própria vistoria. Anotado (achado 2); o critério da etapa é "sem afrouxar o `positive()`", e ele não afrouxou.
5. **Os testes não mordem.** Sete mutações, todas pegas.

## Achados

1. **Bloqueio de piloto, fora do critério da etapa (seção 7 item 3, sem risco aceito).** `acolherNoAparelho` (`apps/campo/src/dados/banco-local.ts:255`) falha aberto: limpeza que falha no meio devolve `apagou: true`, troca o dono e deixa o rascunho do agente anterior (texto do morador, coordenada, nome) para o seguinte. Reproduzido em bb0f654 pela saída `13`. É o mesmo achado da rodada 3; o bloco da V2-F14-E02 (`docs/roadmap-v2/10-campo-reinspecao.md`) ainda pede só confirmação e testes com SQLite em memória, sem falha fechada nem injeção de falha de disco. Não é critério da E15 (a etapa diz "a etapa só avisa, não muda a regra" e "regra mantida", e a regra não piorou), mas precisa de dono e de bloco que o cubra antes do piloto.
2. **Anotado.** O esquema `gpsPrecisaoMetrosSchema` (`packages/shared/src/schemas.ts:369`) aceita Infinity e valores abaixo de 1 vindos de cliente que não é o app; falta `.finite()` e, se o piso for regra de negócio, ele mora só no app (contra "regra de negócio mora no banco e no pacote compartilhado").
3. **Anotado.** `listarRascunhos` (`apps/campo/src/dados/rascunho.ts:175`) descarta linha ilegível sem contá-la; o diálogo diz "nada a perder" e a saída a apaga. O dado já era ilegível para o app.

## Não verificado

- Aparelho físico e emulador: o app Expo não renderiza neste ambiente; os dois fluxos de aparelho da etapa (vistoria começada e "Sair da conta"; GPS simulado abaixo de 0,5 m concluindo sem 422) não foram feitos. A prova é de componente com SQLite real do Node e da API real.
- Disco real do Android (fotos e assinaturas são nomes num conjunto simulado nos testes).
- O texto do diálogo lido por pessoa (frases) é de outra dimensão.
- Run do CI não lido.

## Risco residual

No que a etapa promete (avisar antes de apagar, não apagar em "Entrar de novo", GPS excelente concluindo), a prova é forte e morde. Fica o vazamento entre pessoas no caminho de erro do acolhimento (achado 1), que não é desta etapa e não admite risco aceito.

## Motivo do humano

Aparelho físico: a etapa pede os dois fluxos num aparelho (seção 4 de `28`, aparelho físico), e o app não roda aqui. Rafael faz: começar uma vistoria, tirar foto, tocar em "Sair da conta" e conferir que o diálogo lista o que será apagado; e concluir uma vistoria com GPS simulado abaixo de 0,5 m sem recusa do servidor.
