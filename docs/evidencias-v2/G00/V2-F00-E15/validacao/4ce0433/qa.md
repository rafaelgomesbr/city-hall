---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2, E4]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Todos os comandos rodaram no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`) ou num worktree meu destacado em `4ce0433` (`scratchpad/val/L14-qa-campo/wt`), com `node_modules` por link e os pacotes `@dc360/*` apontando para o próprio worktree (dist recompilado ali), para que cada mutação valesse para o jest do app, o vitest do pacote e a API.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes | `npm run test:campo` (saída `01`): tipos limpos, 134 suítes, 1932 de 1932, "A leitura do código e o jest concordam: 1932 casos", código 0 | PASS |
| Positivo: "2 vistorias começadas" no plural; uma só no singular sem foto | casos do `dialogo-na-conta-com-vistoria-comecada.test.tsx`; mutação A1 (plural quebrado) e R1 (não lê os rascunhos) reprovam | PASS, morde |
| DoD: o diálogo conta rascunhos | mutação R1 (`contarRascunhos([])` no toque): 4 casos reprovam no jest inteiro (4 de 1932) | PASS, morde |
| Mobile: o diálogo usa o botão destrutivo (motivo da rodada 4) | mutação D1 (`destrutiva: false` em `perfil.tsx`, a da rodada 4): jest INTEIRO 1 falha em 1932 ("o botão de confirmar é o de perigo, porque o ato apaga"); D2 (`Dialogo` sempre `primario`) e D3 (perigo vira `secundario`): 2 reprovam cada | PASS, morde (conserto da rodada 4 confirmado) |
| E8 da rodada 4: disco ilegível não vira "nada a perder" | mutação R2 (`catch` grava `contarRascunhos([])`): 2 reprovam ("o disco não responde", "o disco respondeu zero e na segunda pergunta falha") | PASS, morde |
| Positivo: chip e aviso somem quando a fila esvazia sem trocar de aba; diálogo conta a fila de agora | casos "a fila lida ao vivo" verdes no jest inteiro | PASS |
| Positivo: precisão 0,3 vira 1 e 12,4 vira 12 | mutação G1 (sem `Math.max(1, ...)`): 3 reprovam (tela e unidade); G3 (tela grava `Math.round` cru): 3 reprovam | PASS, morde |
| Negativo: precisão ausente grava `null` | mutação G2 (ausente vira 0): 3 reprovam | PASS, morde |
| Negativo: esquema recusa 0 e negativo com mensagem em português, sem afrouxar `positive()` | mutação S1 (`nonnegative()`): 3 de 185 reprovam no `shared`; S1b contra a rota real: "o 0 de aplicativo antigo continua recusado, com o campo nomeado e a frase em português" reprova; sem mutação, `precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 (saída `03`) | PASS, morde |
| Negativo: "Entrar de novo" (sessão vencida) continua sem apagar | mutação B3 (`encerrarSessaoVencida` passa a chamar `apagarDadosLocais`): 2 reprovam em `vistoria-sessao-vencida-preserva-o-rascunho` | PASS, morde |
| Negativo: sem rascunho e sem fila o diálogo não fala em apagar | caso "sem vistoria começada e sem fila" verde; confere `apaga` ausente | PASS |
| Autorização e isolamento: outro agente entra, `acolherNoAparelho` limpa; a mesma pessoa reencontra | mutação B2 (`acolherNoAparelho` não apaga): "o Bruno entra: o rascunho da Ana é limpo" reprova | PASS, morde |
| Fila offline não se perde na saída (critério sem risco aceito) | mutação B1 (`DELETE FROM fila_sincronizacao` no logout): 5 reprovam (`sair-e-entrar-nao-perde-a-coleta`, `logout-nao-apaga-prova`) | PASS, morde |
| DoD: comentário de `banco-local.ts` verdadeiro | lido em `apps/campo/src/dados/banco-local.ts:263-297`: diz que o diálogo conta rascunhos via `avisoDaSaida`, e a mutação R1 prova que conta; nada mais afirmado que o código não faça | PASS |
| Texto "Precisão de 1 metro" (singular) | mutação T1 (sempre "metros"): 1 reprova | PASS, morde |
| Regressão obrigatória `test:campo`, `test --workspace @dc360/shared`, `test:api` | `01` código 0 (1932); `06` 17 arquivos, 185 de 185, código 0; `04` 104 arquivos, 1451 aprovados e 34 pulados, código 0 | PASS |
| E2E no aparelho ou emulador | NÃO executado (ver Não verificado) | humano |
| DoD: itens de integridade do campo do G00 marcados | só no gate | n/a nesta dimensão |

## Evidência

Diretório: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L14-qa-campo/saidas/`.

- `01-test-campo.txt`: `npm run test:campo` (pasta `dc360`), código 0, 134 suítes, 1932 de 1932.
- `03-api-campo-integracao.txt`: `npx vitest run test/campo-integracao.test.ts test/evidencia-so-do-autor.test.ts test/precisao-do-gps-na-sincronizacao.test.ts`, 31 de 31, código 0.
- `04-test-api.txt`: `npm run test:api`, 104 arquivos, 1451 aprovados, 34 pulados, código 0.
- `06-shared.txt`: `npm run test --workspace @dc360/shared`, 185 de 185, código 0.
- `05-portoes-do-app.txt`: os quatro portões do app, 48 de 48, código 0.
- `mut/E15-*.txt` e `mut/RESUMO.txt`: cada mutação com o diff aplicado, a saída do runner e o código; restauradas com `git checkout` no worktree. Roteiro: `lote-e15.sh` e `mut.sh` no diretório de trabalho.
- `10-hoje-lista-e-mapa-isolado.txt`: ver Achados.

## Cenários positivos

- Diálogo com 2 rascunhos (um com foto e assinatura): plural, "com fotos", "sair apaga"; com 1 sem foto: singular, sem "com fotos".
- Fila esvazia com o Perfil montado: chip e aviso somem, "Nenhuma" aparece; diálogo conta a fila de agora (1, não 3).
- `precisaoDoGpsEmMetros`: 0,3 vira 1; 12,4 vira 12; cada valor gravado passa no esquema do servidor; a rota aceita 1 e nulo (201).
- A mesma pessoa que sai pela sessão vencida e entra de novo reencontra checklist, foto e assinatura (SQLite real do Node).

## Cenários negativos

- Disco ilegível no toque (primeira e segunda pergunta): o diálogo avisa "Não deu para conferir..." e não repete a frase curta.
- Esquema e rota: 0 recusado com 422 e `vistoria.gpsPrecisaoMetros: Precisa ser maior que 0`; a mutação que aceita 0 é pega pelo shared (3) e pela rota (1).
- Precisão ausente, `NaN`, zero ou negativa grava `null` (G2 morde).
- Outro agente no aparelho: o rascunho do primeiro é limpo, a fila dele fica intacta e pendente (B2 e B1 mordem).
- "Entrar de novo" não chama `apagarDadosLocais` (B3 morde).

## Tentativas de reprovar

Catorze mutações realistas no código de produção, cada uma desfeita depois; todas reprovaram ao menos um teste (MORDEU):

| Id | Mutação | Resultado |
| --- | --- | --- |
| D1 | `destrutiva: false` na ação "Sair da conta" (`perfil.tsx`), a mutação que a rodada 4 provou verde | jest inteiro: 1 falha em 1932 |
| D2 | `Dialogo.tsx` desenha sempre `primario` | 2 falhas |
| D3 | `Dialogo.tsx` desenha a ação destrutiva como `secundario` | 2 falhas |
| R1 | toque não lê `listarRascunhos` | 4 falhas em 1932 |
| R2 | `catch` do toque grava zero vistorias | 2 falhas |
| G1 | sem o piso de 1 metro | 3 falhas em 1932 |
| G2 | precisão ausente grava 0 | 3 falhas em 1932 |
| G3 | tela grava `Math.round(accuracy)` sem a função | 3 falhas |
| B1 | logout apaga `fila_sincronizacao` | 5 falhas em 1932 |
| B2 | `acolherNoAparelho` não apaga para outra pessoa | 2 falhas em 1932 |
| B3 | sessão vencida passa a apagar o dado local | 2 falhas em 1932 |
| A1 | "vistorias começadas" vira "vistoria começadas" | 2 falhas |
| T1 | "Precisão de 1 metros" | 1 falha |
| S1 / S1b | esquema `nonnegative()` (shared e rota real com dist recompilado) | 3 falhas no shared, 1 na API |

Também procurei frase de produto mal escrita no diálogo (`aviso-da-saida.ts`, todas as combinações): nenhuma achada. Tentei o E2E no Simulador de iOS (ver Não verificado).

## Achados

- **Anotado (fora do escopo da etapa, instabilidade):** `src/__tests__/hoje-lista-e-mapa.test.tsx`, caso "a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma", reprovou em duas rodadas do jest com a máquina carregada (mutações B2 e G3, que não tocam essa tela: recebeu `["longe", "perto"]`), e passou isolado duas vezes (`10-...`, 19 de 19). Ordem da lista sensível a carga; não é desta etapa e não decide critério dela.
- **Anotado:** a frase da fila no diálogo diz que as coletas não enviadas "voltam a subir quando você entrar de novo, com sinal", e conta também as `bloqueadas`, que não sobem sozinhas (precisam de "Tentar de novo"). Imprecisão menor, já de antes desta correção; registro para quem mexer no texto.

## Não verificado

- **E2E e E4** (começar vistoria, tocar em "Sair da conta" e ver o diálogo; concluir com GPS abaixo de 0,5 m sem 422, no aparelho ou emulador): não há emulador Android nesta máquina. O Simulador de iOS existe (iPhone 17 Pro, iOS 26.5, com um build de depuração do app de 15/10), mas não há como dirigir a interface: sem `idb` nem `maestro`, e `osascript` responde `UI elements enabled = false` (sem permissão de acessibilidade). Sem tocar na tela, o fluxo não é executável por mim. Fica com Rafael (F14-E12).
- Não refiz capturas: a prova da cor do botão é o estilo renderizado contra o `Botao` de referência no mesmo tema (teste), não pixel.

## Risco residual

O diálogo e o piso de GPS estão presos por testes que mordem as mutações realistas, inclusive a da rodada 4. O que fica é o comportamento no aparelho real (renderização, leitor de tela, GPS de verdade) e a aprovação das frases, ambos humanos.

## Motivo do humano

Rafael precisa fazer os dois fluxos num aparelho (diálogo de saída com vistoria começada; conclusão com GPS abaixo de meio metro) e aprovar as frases do diálogo e o "Precisão de 1 metro": é critério E4 explícito da etapa e texto de produto, e nenhum simulador pôde ser dirigido aqui.
