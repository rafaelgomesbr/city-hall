---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2, E4]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: arbitragem, defeito de texto reproduzido em estado criado pela etapa (achado da rodada 3 com dono E06, não consertado)
---
## Critérios verificados

Comandos no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`); mutações num worktree meu destacado em `4ce0433`, com os pacotes `@dc360/*` apontando para o próprio worktree e o `dist` recompilado a cada mutação que a API ou o app consomem.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta | pacote do motor 231 de 231 (saída `02`); integração com a API real 17 de 17 (`03`); sonda própria contra a rota real do painel (`08`, abaixo) | PASS |
| Negativo: 401 `sessao_encerrada` e 403 `conta_desativada` deixam todos `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado | mutações F1 (pausa não para o dreno), F2 (pausa soma tentativa) e F3 (sem o ramo de sessão): 3, 16 e 23 de 231 reprovam; F3 contra a API real: 5 de 17 reprovam | PASS, morde |
| Negativo: sem token vira `FalhaDeSessao` e não `FalhaPermanente` | mutação T2: 3 reprovam | PASS, morde |
| Negativo: 403 `sem_permissao` ainda bloqueia | mutação T5 (ação `nenhuma` vira pausa): 12 reprovam, inclusive os quatro códigos de posto novos da correção 2 da E05 | PASS, morde |
| Positivo: 401 `nao_autenticado` renova uma vez e envia | mutação T4 (renova sem `renovarJa`): 6 reprovam; T8 (segunda renovação depois do segundo 401): 1 reprova; T3 (repete com o mesmo token): 2 reprovam no pacote | PASS, morde |
| Positivo: depois de entrar de novo, sobem sem duplicar, mesma chave de idempotência | mutação T7 (repetição com outra chave): 2 reprovam; sonda `08`: três coletas sobem uma vez cada, segundo dreno não envia nada | PASS, morde |
| Risco de segurança: renovação forçada é uma, com piso e trava, e a falha seguinte pausa | mutações A1 (`renovarJa` ignora o piso) e A2 (ignora a trava) em `apps/campo/src/dados/token.ts`: 3 e 1 reprovam; T6 (401 `sessao_encerrada` gasta a renovação): 2 reprovam | PASS, morde |
| Mobile: `falha-de-atualizacao.ts` ganha `conta-desativada` com "suas coletas continuam guardadas neste aparelho, procure a coordenação" | mutações A3 (frase sem a promessa) e A4 (código vira `outro`): 1 reprova cada no jest inteiro (1932) | PASS, morde |
| Autorização: item de outro autor espera o autor; pausa de B não aparece para A | mutações F4 (pausa de quem está logado) e F5 (sem conferência de autor por chamada): 2 e 1 reprovam | PASS, morde |
| `campo-integracao.test.ts`: desativar entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica | verde (`03`); mutação T1 contra a API real reprova o caso | PASS, morde |
| Objetivo: "a pessoa vê o que fazer" | REPROVADO num ponto: ver Achados (tarja de "Enviar agora" com a fila pausada) | FAIL |
| Regressão obrigatória: `test --workspace @dc360/campo`, `test:campo`, `test:api`, `campo-integracao` | `02` 231 de 231; `01` 1932 de 1932 com tipos limpos; `04` 104 arquivos, 1451 aprovados e 34 pulados; `03` 31 de 31; todos código 0 | PASS |
| E2E no emulador (desativar no painel com coleta na fila, ver a frase, reativar e ver subir) | metade de servidor provada por sonda E2 contra a API real (`08`); a tela no aparelho NÃO (ver Não verificado) | humano |
| DoD: frase aprovada; item "fila do campo" do G00 marcado | aprovação é do Rafael; item só no gate | humano / n/a |

O "Motivo do veredito" da rodada 4 desta etapa foi PASS, sem conserto pedido. Desde `bb0f654` o motor só mudou por tabela: a correção 2 da E05 pôs quatro códigos 403 de ação `nenhuma` no catálogo (`posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador`, `assinatura`) e a matriz de `pausa-por-senha-provisoria.test.ts` ganhou as quatro linhas: todos seguem recusa permanente, e a mutação T5 prova que a matriz pega a troca.

## Evidência

Diretório: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L14-qa-campo/saidas/`.

- `01-test-campo.txt`: `npm run test:campo`, código 0, 134 suítes, 1932 de 1932.
- `02-pacote-campo.txt`: `npm run test --workspace @dc360/campo`, 10 arquivos, 231 de 231, código 0.
- `03-api-campo-integracao.txt`: `campo-integracao`, `evidencia-so-do-autor` e `precisao-do-gps-na-sincronizacao`, 31 de 31, código 0.
- `04-test-api.txt`: `npm run test:api`, 1451 aprovados, 34 pulados, código 0.
- `08-sonda-desativacao-pela-rota.txt`: sonda própria (`zz-sonda-qa-campo.test.ts` no diretório de trabalho, rodada só no worktree), código 0.
- `09-repro-enviar-agora-fila-pausada.txt`: reprodução do achado (`zz-repro-enviar-agora-com-fila-pausada.test.tsx`, rodada num segundo worktree), código 1 de propósito.
- `mut/E06-*.txt` e `mut/RESUMO.txt`: 21 mutações (roteiro `lote-e06.sh`).

## Cenários positivos

- Sonda `08`, contra o servidor real numa porta efêmera com PGlite: agente com três coletas na fila; a coordenadora desativa a conta pela ROTA do painel (`PATCH /usuarios/:id/situacao`, que também derruba as sessões, e não o `UPDATE` direto que a suíte do implementador usa); três drenos seguidos param todos em `conta_desativada` (um pedido por dreno, zero renovação forçada, `pausadaPor: conta_desativada`); reativação pela mesma rota, nova entrada, um dreno envia as três (`enviados: 3`), uma vistoria por chave no banco, segundo dreno não envia nada.
- 401 `nao_autenticado` com token renovado: o item sobe uma vez, com a mesma chave.

## Cenários negativos

- Enquanto desativado: zero `bloqueado`, `tentativas` 0, nada no banco, e a entrada responde 401 `credenciais` (não revela a desativação).
- Reenfileirar a mesma chave com outro conteúdo depois do envio é recusado ("já está na fila de envio com outro conteúdo"), sem segunda vistoria.
- 403 `sem_permissao` e os quatro códigos de posto bloqueiam o item (T5 morde).
- Agente A no aparelho com itens de B desativado: os de B não saem com a sessão de A (F5 morde).

## Tentativas de reprovar

21 mutações no código de produção (motor, transporte, `token.ts`, `falha-de-atualizacao.ts`); 19 morderam. As duas que sobreviveram:

- F6 (`FalhaDeSessao` levada ao ramo de bloqueio de `tratarFalha`): equivalente, porque o `catch` do dreno trata `FalhaDeSessao` antes e esse ramo nunca é alcançado.
- T3api (repetir com o mesmo token) contra `campo-integracao`: sobrevive nessa suíte, mas morde no pacote (2 casos); cobertura existe.

E procurei o mesmo defeito de texto que a correção 2 consertou no cartão da tarefa, em outros pontos da lista de tarefas: achei um (abaixo).

## Achados

- **Bloqueia (defeito de texto em estado criado pela etapa):** com a fila PAUSADA (conta desativada, sessão encerrada ou senha provisória), tocar em "Enviar agora" no cartão da tarefa vencida com coleta guardada mostra a tarja "Ainda não deu para enviar" / "A coleta continua guardada no aparelho e sai quando o aplicativo estiver aberto e houver sinal." Sinal não resolve nenhum dos três casos: a conta desativada precisa da coordenação, a sessão encerrada precisa de "Entrar de novo", a senha provisória precisa da troca no painel. A tela contradiz a faixa do topo ("Conta desativada ... procure a coordenação") e o próprio cartão, que a correção 2 desta etapa consertou para não mandar esperar sinal com a fila pausada. Código: `apps/campo/src/app/(agente)/index.tsx`, `enviarAgora` (linhas 827 a 896): depois de `drenar()`, item `pendente` cai sempre no último `else`, sem ler `paradaPor` do resultado nem a `pausadaPor` que a tela já guarda. Reprodução E1 (`09-...`): cópia de `__tests__/devolver-tarefa-vencida.test.tsx` com `drenar` devolvendo `{ interrompido: true, paradaPor: <motivo> }` e o item `pendente` (o retorno real, provado pela sonda `08`); nos três motivos a tela desenha exatamente a frase acima. Foi achado da rodada 3 (`validacao/52952a1/qa.md`, achado 1, "Dono: E06") e continua igual; não está em `apps/campo/PENDENCIAS.md`. Nenhum dado se perde (o item fica pendente), mas a mensagem manda a pessoa fazer a coisa errada. Conserto mínimo: no `else`, quando `paradaPor` vier, usar a frase de `pausa-da-fila.ts` do motivo (a mesma do cartão) e um teste por motivo.

## Não verificado

- **E2E e E4 da tela** (desativar no painel, ver a frase no aparelho, reativar e ver subir): não há emulador Android. O Simulador de iOS existe (iPhone 17 Pro, iOS 26.5, build de depuração do app de 15/10 instalado), mas não há como dirigir a interface: sem `idb` nem `maestro`, e `osascript` responde `UI elements enabled = false`. A metade de servidor e motor foi feita em E2 pela sonda `08`; a tela só em E1.
- Não rodei `test:isolamento` (o gatekeeper já rodou no SHA: 345 aprovados, 3 pulados).

## Risco residual

O critério sem risco aceito (não perder nem duplicar coleta) está provado por testes que mordem e por sonda própria contra a rota real do painel. O risco que fica é de orientação: com a fila pausada, um ponto da lista ainda manda esperar sinal.

## Motivo do humano

Rafael precisa ver no aparelho a frase da conta desativada e da sessão encerrada, com a coleta preservada, e aprovar as frases (critério E4 explícito e texto de produto). Nenhum simulador pôde ser dirigido aqui.
