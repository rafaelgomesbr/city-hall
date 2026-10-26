---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho 9 (risco residual): falha aberta provada da limpeza entre pessoas, item 3 da seção 7 se ocorrer
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**, com um defeito real provado por injeção de falha (achado 1), anterior à etapa e fora do escopo dela ("a etapa só avisa, não muda a regra"), que não pode ser tratado como risco aceito. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| Sem falha, outro agente que entra recebe o aparelho limpo; a mesma pessoa reencontra o rascunho | PASS (controle da sonda e `sair-e-entrar-nao-perde-a-coleta.test.ts`) |
| Pista 2: com falha do SQLite na troca de pessoa, o agente B vê o rascunho do agente A? | **SIM** (achado 1) |
| O rascunho de A é apagado sem aviso? | Sim quando outra pessoa entra (regra mantida, decisão do CP-24); e, depois de uma falha, quando A volta (achado 1, caso F1) |
| "Entrar de novo" na vistoria não apaga | PASS (suítes do QA e de testes desta rodada) |

## Evidência

Sonda temporária com o SQLite real do Node (`node:sqlite`, o mesmo dublê de `sair-e-entrar-nao-perde-a-coleta.test.ts`) e os módulos reais `banco-local` e `rascunho`, criada em `apps/campo/src/dados/`, executada com `npx jest` e apagada em seguida (árvore conferida limpa). Saída `redteam/out-e15.txt`, 5 de 5 casos executados:

| Caso | Resultado |
| --- | --- |
| Controle, sem falha | Bruno vê 0 rascunhos |
| F1: a leitura da marca do dono falha uma vez (`SQLITE_BUSY`) | `apagou=false`; Bruno vê o rascunho da Ana (nome da moradora assinante, observações, coordenada); a marca passa a ser do Bruno, e no login seguinte dele, sem falha, continua vendo; quando a Ana volta, o rascunho é apagado sem aviso |
| F2: o apagamento falha uma vez (`SQLITE_FULL`) | `apagou=true`, mas Bruno vê o rascunho; a marca passa a ser do Bruno; persiste nos logins seguintes |
| F3: apagar e marcar falham (disco cheio) | Bruno vê o rascunho nesta sessão; a marca fica da Ana, então o próximo login dele limpa |
| F4: a marca da Ana não foi gravada no login dela | Bruno entra e vê o rascunho |

Causa (`apps/campo/src/dados/banco-local.ts`): `donoDosDadosLocais` devolve nulo quando a leitura falha, e nulo significa "não apague"; `apagarDadosLocais` engole o erro do `DELETE`; `acolherNoAparelho` marca o novo dono mesmo assim. Observação lateral do controle: quando a tabela da fila ainda não existe, os arquivos de foto e assinatura do rascunho NÃO são apagados (`arquivosAindaNaFila` devolve nulo e a limpeza preserva tudo), resíduo em disco sem caminho de leitura pelo app.

## Cenários positivos

- A mesma pessoa reencontra rascunho, foto e assinatura depois de "Entrar de novo".

## Cenários negativos

- Outra pessoa, sem falha: aparelho limpo e fila da primeira intacta.

## Tentativas de reprovar

1. Injetar falha em cada um dos três passos da troca de pessoa (ler o dono, apagar, marcar): os três vazam.
2. Procurar gatilho deliberado: disco cheio provocado por um colega é plausível em aparelho compartilhado, mas provavelmente também impede gravar a credencial e, portanto, a entrada; não provei esse caminho no aparelho.
3. Procurar outro login que pule `acolherNoAparelho`: só `entrar` em `sessao.tsx`; a sessão restaurada só marca o dono.

## Achados

**CORRIGE ANTES DE CRESCER (não admite RISCO ACEITO se ocorrer: item 3 da seção 7)**

1. **A limpeza entre pessoas falha aberta.** Qualquer falha do SQLite na troca de pessoa entrega a quem entra o rascunho de quem saiu (dado pessoal da moradora e da ocorrência), e nos casos F1 e F2 a marca de dono passa a ser de quem entrou, tornando o vazamento permanente. Exploração deliberada não provada (depende de falha transitória do banco). Correção curta: erro na leitura do dono conta como dono desconhecido com dado presente, e o aparelho apaga ou recusa a entrada; só marcar o novo dono se o apagamento terminou. Anterior à etapa (`acolherNoAparelho` vem de 5ecdf4c), mas a correção 1 da E15 aumentou a dependência dela (a faixa da vistoria passou a preservar o rascunho). Dono sugerido: correção curta já, ou F14-E02.

**ANOTADO**

2. `rascunhos` não tem coluna de autor: a separação depende só da marca.
3. Arquivos do rascunho ficam no disco quando a tabela da fila não existe (resíduo, F14-E04).

## Não verificado

- Emulador e aparelho: a prova é E1 com SQLite do Node e disco simulado; o comportamento real de `SQLITE_BUSY` e `SQLITE_FULL` no Android não foi medido.
- Se a entrada chega a abrir sessão com disco cheio (gravação no cofre).
- GPS abaixo de 0,5 m no emulador (QA).

## Risco residual

Vazamento entre agentes no aparelho compartilhado, condicionado a falha do SQLite e persistente depois dela.

## Motivo do humano

Decisão do Rafael sobre a prioridade do achado 1 e os fluxos em aparelho que a etapa já reserva (pendência E4 registrada pelo QA).
