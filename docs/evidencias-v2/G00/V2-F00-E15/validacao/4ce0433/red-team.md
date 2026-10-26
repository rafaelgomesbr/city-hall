---
validador: red-team
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
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L10-red-team/` (abaixo, `$W`). Tudo rodou no worktree `$W/wt` (`git worktree add --detach` em `4ce0433`, `node_modules` por link); toda mutação foi restaurada com SHA-256 conferido.

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 7 testes verdes; diálogo conta rascunhos | OK | os 7 arquivos da etapa: 7 suítes, 44 de 44 (`$W/saidas/e15-00-testes-da-etapa.txt`); jest inteiro do app 134 suítes, 1932 de 1932, código 0 (`$W/saidas/e15-03-jest-app-inteiro.txt`) |
| O diálogo usa o botão destrutivo, e o teste prova (risco alto: o teste morde) | OK | mutação D1 (`destrutiva: false` na ação "Sair da conta" de `perfil.tsx`): 1 reprova, 43 passam (`$W/saidas/e15-mut-D1_destrutiva_false.txt`) |
| Disco ilegível avisa e não diz "nada a perder" (E8 da rodada 4) | OK | mutação E8 (o `catch` de `perguntarSaida` grava "zero vistorias"): 2 reprovam (`$W/saidas/e15-mut-E8_catch_conta_zero.txt`) |
| Sem rascunho e sem fila o diálogo não fala em apagar | OK | caso verde do arquivo do diálogo; mutação X1 (diálogo ignora os rascunhos): 4 reprovam |
| "Entrar de novo" (sessão vencida) continua sem apagar | OK | mutação X7 (a sessão vencida passa a apagar o disco): 2 reprovam |
| Isolamento: outro agente entra com o rascunho do primeiro, `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria | OK | sonda S1, S2, S3 sobre SQLite real (`$W/saidas/e15-sonda-aparelho.txt`); mutação X3 (a troca de pessoa não apaga): 1 reprova |
| A saída explícita apaga o rascunho e mais nada da coleta (a fila fica) | OK | mutações X2 (sair não apaga), X4 (sair apaga a fila) e X5 (sair não apaga o rascunho): 1, 2 e 3 reprovações |
| GPS: precisão 0,3 vira 1; ausente grava nulo; o servidor recusa 0 em português | OK | mutação X6 (sem o piso): 2 reprovam; API `precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 (`$W/saidas/e15-02-api-precisao.txt`) |
| Motor offline preservado | OK | `packages/campo`: 10 arquivos, 231 de 231 (`$W/saidas/e15-01-motor-offline.txt`) |
| Fluxo no aparelho e frases (E4) | NÃO VERIFICADO | o app Expo não roda aqui; é validação humana |

Itens do "Motivo do veredito" da rodada 4:

1. O caso "o botão de confirmar é o de perigo" não conferia o tipo do botão (D1 ficava verde): **consertado**. Reproduzi a mutação da rodada 4 e o caso reprova agora (`$W/saidas/e15-mut-D1_destrutiva_false.txt`, "1 failed, 43 passed").
2. E8 sem teste: **consertado**. A mutação reprova 2 casos (disco que falha na primeira pergunta e na segunda).

## Evidência

- `$W/saidas/e15-00-testes-da-etapa.txt`: `npx jest` nos 7 arquivos (`ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`, `dados/aviso-da-saida.test.ts`, `dados/precisao-do-gps.test.ts`, `dados/sair-e-entrar-nao-perde-a-coleta.test.ts`, `__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`, `__tests__/a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`, `ui/dialogo-na-conta.test.tsx`), código 0.
- `$W/scripts/mutar-e15.mjs` e `$W/saidas/e15-mut-*.txt`: dez mutações, cada uma com o trecho trocado, a saída do jest e "restaurado: sim (sha256 igual)". Resumo: D1 1 falha; E8 2; X1 4; X2 1; X3 1; X4 2; X5 3; X6 2; X7 2; X8 0 (ver Achados 2).
- `$W/scripts/sonda-e15-aparelho.test.ts` (copiado ao worktree só para rodar, apagado depois) e `$W/saidas/e15-sonda-aparelho.txt`: o estado do banco local e do disco depois de cada troca de conta, com o harness de SQLite real da etapa.
- `$W/saidas/e15-01-motor-offline.txt`, `$W/saidas/e15-02-api-precisao.txt`, `$W/saidas/e15-03-jest-app-inteiro.txt`.
- Busca de quem apaga o disco no app (`grep` em `apps/campo/src`, sem testes): só `perfil.tsx:1479` chama `sair()` (pelo diálogo) e só `sessao.tsx:185` chama `acolherNoAparelho`; `conta_desativada` e sessão encerrada não levam a apagamento.

## Cenários positivos

- A mesma pessoa que sai pelo Perfil e entra de novo: rascunho apagado (o diálogo avisa), fila com 1 item, byte a byte igual, sem duplicar (S3).
- A sessão vence, outra pessoa entra e depois a primeira volta: a fila da primeira continua com 1 item, o arquivo de prova dela continua no disco (S2).

## Cenários negativos

- S1, Ana sai pelo Perfil e Bruno entra: depois da saída, `rascunhos`, `pendencias` (endereço e nome do solicitante), `coletas` (lápides) e a marca do dono zerados, foto e assinatura do rascunho apagadas do disco; Bruno lê zero rascunhos. Sobra só o item da fila da Ana (autor Ana) e a assinatura que ele usa.
- S2, sessão da Ana vence e Bruno entra: `apagou=true`, rascunho, pendências e lápides apagados antes de a sessão do Bruno abrir.
- Conta desativada: nenhum caminho do app chama `sair()` ou `apagarDadosLocais` por causa de `conta_desativada` (busca acima); o rascunho fica até outra pessoa entrar, como no S2.

## Tentativas de reprovar

1. Repeti as mutações D1 e E8 da rodada 4: ambas mordem.
2. Oito mutações minhas sobre a regra de apagar, o diálogo e o GPS (X1 a X8): sete mordem.
3. Troca de conta com vistoria começada, nas três ordens (saída explícita, sessão vencida, volta da primeira pessoa), em SQLite real: nada da conta anterior fica legível como rascunho, pendência ou lápide; nada da fila se perde ou duplica.
4. Marca do dono perdida (S4): o Bruno lê o rascunho da Ana (protocolo, nome da moradora que assinou, observação) e as pendências dela. É a falha aberta de `acolherNoAparelho`, já registrada fora da etapa (Achados 1).
5. Procurei outro chamador de `sair()` ou `apagarDadosLocais` que pulasse o diálogo: não há.

## Achados

1. **anotado** (fora da etapa, já registrado sem risco aceito como bloqueio de piloto, dono F14-E02, desde a rodada 2; reconfirmado aqui com execução). Se a marca do dono não existir (escrita que falhou em silêncio em `marcarDonoDosDadosLocais`, leitura que falhou em `donoDosDadosLocais`), `acolherNoAparelho` não apaga e a pessoa seguinte lê a vistoria começada da anterior, com o nome de quem assinou e a observação (`$W/saidas/e15-sonda-aparelho.txt`, linhas S4). A E15 não mudou essa regra e o bloco da etapa manda não mudar.
2. **anotado**. Tirar `marcarDonoDosDadosLocais` de `encerrarSessaoVencida` (mutação X8) fica verde nos 44 casos da etapa. Hoje é redundante (a marca já nasce no login e na sessão restaurada), mas é a segunda chance do Achado 1 e nada a prende.
3. **anotado** (desenho anterior à etapa, fora do escopo). Depois que a Ana sai, o Bruno vê na fila os envios dela ("Envios de outro agente", "Coletada por Ana...", com o protocolo) e pode descartá-los com confirmação dupla (`fila.tsx:1358`, `packages/campo/src/fila.ts:1371`). É a decisão documentada para o agente que nunca volta; a retenção desses itens e arquivos está em `apps/campo/PENDENCIAS.md` (achados de LGPD 1 a 5, donos F05-E09 e F14-E02). Para conta desativada, isso significa que a coleta concluída da pessoa desativada fica no aparelho sem sair até ela ser reativada e entrar ali, ou até alguém descartá-la.

## Não verificado

- Os dois fluxos no aparelho ou emulador (vistoria começada e "Sair da conta"; GPS abaixo de 0,5 m concluindo sem 422) e a aparência do botão de perigo na tela: o app Expo não roda neste ambiente. O botão é provado pelo estilo desenhado no teste de componente, comparado com a referência de perigo do mesmo tema.
- Disco real do Android (arquivos de foto e assinatura são nomes num conjunto simulado no harness), WAL do SQLite e cache da câmera.
- Run do CI do SHA (ausente nesta sessão).

## Risco residual

Dentro da etapa, baixo: o diálogo diz o que apaga, o botão é o de perigo e os testes mordem. Fora dela, o maior risco do aparelho compartilhado continua sendo a falha aberta de `acolherNoAparelho` (Achado 1), registrada para antes do piloto.

## Motivo do humano

A etapa pede E4: Rafael precisa fazer os dois fluxos num aparelho (começar vistoria e tocar em "Sair da conta", conferindo que o diálogo lista o que vai ser apagado e que o botão é o vermelho de perigo; concluir vistoria com GPS simulado abaixo de 0,5 m sem 422) e aprovar as frases do diálogo. Nenhum agente renderizou o app aqui, então a aparência real do diálogo só uma pessoa com o aparelho confere.
