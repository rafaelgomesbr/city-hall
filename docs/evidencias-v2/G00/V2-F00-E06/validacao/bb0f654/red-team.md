---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

## Critérios verificados

1. 401 `sessao_encerrada` e 403 `conta_desativada` deixam todos os itens `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado (`paradaPor`).
2. Sem token vira `FalhaDeSessao` e não `FalhaPermanente`, sem sair pela rede.
3. Depois de reativar e entrar de novo, os itens pausados sobem sem duplicar (mesma chave de idempotência).
4. 403 `sem_permissao` continua bloqueando.
5. A renovação forçada não vira laço contra servidor que disse não.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E04-E05-E06-E08/`.

- `sonda-e06.mjs`, saída `saida-e06.txt` (`FALHAS: 0`): o MOTOR REAL da fila (`criarFilaDeSincronizacao`, `transporteHttp` e `depositoSobreChaveValor` do `dist` de `@dc360/campo`) contra a API real em PostgreSQL 17.6, com desativação, reativação e encerramento feitos pelas rotas reais do painel (`PATCH /usuarios/:id/situacao`, `POST /usuarios/:id/encerrar-sessoes`). O `buscar` do transporte foi embrulhado para contar pedidos e para disparar a desativação no meio do dreno. O obtentor de token imita o aplicativo: renova uma vez quando o transporte pede e lê o 403 `conta_desativada` da renovação.
- Testes sem mutação: `t-campo-base.txt` (pacote do campo, 10 arquivos, 223 de 223), `t-app-base.txt` (jest do aplicativo: token, falha de atualização, pausa da fila, `obterFila` única, fila pausada, faixa ligada à fila real, troca de conta com pedido em voo: 7 suítes, 80 de 80), `t-api-base.txt` (`campo-integracao.test.ts` e `evidencia-so-do-autor.test.ts` entre os 107 de 107).
- Mutações M7, M8 e M9 (`m7.txt`, `m8.txt`, `m9.txt`), desfeitas com `git restore`.

## Cenários positivos

- S1: depois de reativar e entrar de novo, as 3 coletas sobem (enviados 3), o banco tem 3 vistorias com as 3 chaves, e o dreno seguinte não reenvia nada.
- S4: sessão encerrada por quem administra; depois da nova entrada, a coleta sobe uma vez.
- S6: coordenadora enviando vistoria recebe 403 `sem_permissao` e o item fica `bloqueado` (por desenho), sem `paradaPor`.

## Cenários negativos

- S1, conta desativada pela rota do painel com 3 coletas na fila: `paradaPor=conta_desativada`, bloqueados 0, enviados 0, itens `pendente/0` x 3, `resumo.pausadaPor=conta_desativada`, UM pedido de rede (o primeiro envio, que recebeu o 403), nada no banco. Mais 5 drenos: 1 pedido por dreno (6 no total), itens continuam `pendente/0`: nenhum laço, nenhuma tentativa contada.
- S2, desativação NO MEIO do dreno, logo depois do primeiro envio confirmado: enviados 1, `paradaPor=conta_desativada`, bloqueados 0, itens `confirmado/1, pendente/0, pendente/0`; depois da reativação sobem os 2 restantes e o banco fica com exatamente 3 vistorias.
- S3, o servidor grava, a resposta se perde (simulada) e a conta é desativada antes do reenvio: o item fica `pendente` (falha temporária, adiado); passado o recuo, o dreno com a conta desativada pausa com `conta_desativada` sem bloquear; depois de reativar, o reenvio é reconhecido como duplicado (duplicados 1), o item vira `confirmado` e o banco tem UMA vistoria com a chave.
- S4, sessões encerradas por quem administra: `paradaPor=sessao_encerrada`, item `pendente/0`.
- S5, sem token: `paradaPor=sessao_encerrada`, zero pedidos de rede, item `pendente`.

## Tentativas de reprovar

1. Fazer a fila apagar ou bloquear coleta de conta desativada (S1, S2): zero bloqueado e zero tentativa contada.
2. Fazer a fila duplicar coleta (S2 com corte no meio, S3 com resposta perdida e reenvio depois da reativação): nenhuma vistoria duplicada no banco.
3. Fazer a fila continuar enviando ou entrar em laço contra o servidor (S1 com 6 drenos): um pedido por dreno, nenhum envio aceito.
4. Fazer o 403 da renovação passar por falha comum: o obtentor real do aplicativo (`token.ts`) foi mordido (M9 abaixo).
5. Mordida, cada uma desfeita com `git restore`:
   - M7, `transporte.ts` classificando 403 `parar_e_avisar` como `FalhaPermanente`: 6 casos reprovam em `pausa-de-sessao.test.ts` e `pausa-por-senha-provisoria.test.ts` (`m7.txt`).
   - M8, `fila.ts` deixando de tratar `FalhaDeSessao` como pausa: 23 casos reprovam (`m8.txt`).
   - M9, `apps/campo/src/dados/token.ts` deixando de reconhecer a recusa 403 `conta_desativada` da renovação: 5 de 21 reprovam (`m9.txt`).

## Achados

1. Nenhum defeito provado nos critérios desta etapa.
2. **Anotado (por desenho, já registrado em `apps/campo/PENDENCIAS.md`):** 403 `sem_permissao` continua bloqueando o item; rebaixar o papel do agente com coleta na fila bloqueia em vez de pausar. Fora dos três códigos da etapa.

## Não verificado

- Aparelho físico e emulador: não há emulador Android no Mac e o Expo não renderiza no ambiente do agente. A frase na faixa, o cartão "Guardada" e a ausência de "Descartar" na tela real não foram vistos; a prova de tela é só teste de componente (verde) e a do motor é a sonda acima.
- O laço de fundo do aplicativo (espera de 60 s com a fila pausada) e o SQLite real do aparelho: a sonda usou a loja em memória do pacote; o SQLite em memória do Node só aparece nos testes do aplicativo.
- O caminho da foto (autorizar, bytes, confirmar) com a conta desativada no meio: a sonda enviou vistoria sem foto; o caso da foto está nos testes `evidencia-so-do-autor.test.ts` e `pausa-por-senha-provisoria.test.ts`, verdes.
- O run do CI do SHA.

## Risco residual

O comportamento da tela no aparelho depende de validação humana. Um falso 401 (renovação recusada por falta de sinal) pausa a fila até a próxima volta do laço, sem tocar no item (declarado pelo implementador, não reproduzido aqui).

## Motivo do humano

Aparelho físico ou emulador (seção 4 de `28`): ver, no aparelho, a frase de conta desativada na faixa e no cartão, nos dois temas e em 390 de largura, e a coleta preservada que sobe depois da reativação com nova entrada. Isso não é executável neste ambiente.
