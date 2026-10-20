---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` na árvore principal (HEAD `5044e7a`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Saídas em `SCRATCH/validadores/seguranca-aplicacao/`.

1. Renovação única com piso, sem laço contra servidor que disse não: `transporte.ts` (`pedir`) renova UMA vez no 401 `nao_autenticado`, não gasta a renovação no 401 de ação `entrar_de_novo` (`sessao_encerrada`) e não repete quando o token devolvido é o mesmo; `apps/campo/src/dados/token.ts` mantém a trava e o piso de 60 s também para `renovarJa`. Mutações minhas mordem (15, 16, 17).
2. 401 `sessao_encerrada` e 403 `conta_desativada` deixam itens `pendente`, sem tentativa contada, dreno parado; 403 `sem_permissao` continua bloqueando: pacote do campo 238 de 238 (12).
3. Autoria da fila: item de outro autor espera o autor; foto com `coletadaPor` diferente do token responde 409 `autor_divergente`, antes de ler o banco (não vira oráculo); confirmação só por quem autorizou; outro município 404: `evidencia-so-do-autor.test.ts` e `campo-integracao.test.ts` (motor real contra a API real), 28 de 28 (13); mutação minha morde (18).
4. Desativar o agente entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica no aparelho: `campo-integracao.test.ts` (13).
5. Diff desde a rodada 4 (correção 3b, `packages/campo/src/fila.ts`): a pausa guarda a "geração" da credencial e cai quando a pessoa entra de novo. Conferido que isso não abre laço: sem pausa, o próximo dreno faz no máximo UMA tentativa com a credencial nova, e a recusa repõe a pausa com a geração atual; a conferência de autoria por item (`transporteDoItem`) independe da pausa.
6. Regressão: `npm run test:api` 1624 de 1624 (20); token e fila do aplicativo, 19 de 19 (14).

## Evidência

- `12-pacote-campo.txt`: `npm run test --workspace @dc360/campo`, código 0, 11 arquivos, 238 de 238.
- `13-api-campo-integracao-e-autoria.txt`: código 0, 28 de 28.
- `14-app-campo-token-fila.txt`: `npx jest src/dados/token.test.ts src/dados/fila` em `apps/campo`, 19 de 19.
- `15-MUTACAO-E06-token-sem-piso.txt`: `token.ts` ignorando o piso quando `renovarJa`: 3 de 19 reprovam ("respeita o piso: duas forçadas seguidas fazem UMA renovação", "lembra a recusa dentro do piso", "entrar de novo apaga a recusa"). Restaurado.
- `16-MUTACAO-E06-transporte-repete-com-o-mesmo-token.txt`: `transporte.ts` sem `novo === token`: 2 de 238 reprovam ("se a renovação devolve o MESMO token, nem repete o pedido"; "token recusado e renovação que não muda nada: a fila pausa e o item fica"). Restaurado.
- `17-MUTACAO-E06-sessao-encerrada-gasta-renovacao.txt`: sem o atalho de `entrar_de_novo`: 2 de 238 reprovam ("401 sessao_encerrada: não gasta a renovação"). Restaurado.
- `18-MUTACAO-E06-autoria-da-foto.txt`: `evidencias.ts` sem a conferência de `coletadaPor`: 3 de 28 reprovam, inclusive "a conta troca com a foto em voo: o servidor recusa o autor errado e a trilha não ganha uma foto que ninguém fez". Restaurado.
- Ao fim, `git status` sem mudança rastreada.

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e envia; token vencido de verdade renova e sobe sem pausar; depois de entrar de novo os itens sobem sem duplicar (mesma chave de idempotência): casos de `campo-integracao.test.ts` e do pacote (12, 13).

## Cenários negativos

- Renovação recusada ou dentro do piso: a fila pausa, sem segundo pedido (mutação 16 prova que o teste pega a repetição).
- 401 `sessao_encerrada`: nenhuma renovação gasta (mutação 17).
- Duas renovações forçadas seguidas: uma só chega ao servidor (mutação 15).
- Autor declarado diferente do token: 409 `autor_divergente`, nada reservado, sem oráculo por existência (mutação 18).
- Agente A no aparelho depois da desativação de B: itens de B não sobem com a sessão de A (casos de autoria do pacote, 12).

## Tentativas de reprovar

- Quatro mutações próprias nos três pontos de risco da etapa (piso, repetição com o mesmo token, gasto da renovação no fim de linha, autoria da foto): todas reprovam testes por asserção.
- Li a correção 3b procurando um caminho em que a pausa caída pela geração nova reabra o laço: não achei; a pausa nova nasce com a geração atual e o laço de fundo espera 60 s enquanto pausado.
- O diff `4ce0433..1ed0b71` em `transporte.ts` é só acentuação de mensagens; nenhuma decisão mudou.

## Achados

- Anotado (continua, registrado): o "Descartar" aparece para coleta de outro autor no aparelho.
- Anotado (continua): a recusa de foto por autor divergente só deixa aviso no log, sem evento na trilha.
- Nenhum achado bloqueia a dimensão.

## Não verificado

- Não há emulador Android nem aparelho nesta máquina: o E2E "desativar o agente no painel durante uma coleta e ver a frase no aparelho, nada descartado, sobe depois da reativação" não foi executado. A propriedade de segurança foi provada pelo motor real contra a API real; o comportamento no aparelho fica humano.
- `npm run test:campo` inteiro (jest completo do aplicativo, cerca de 2000 casos) não rodado; só os arquivos de token e fila.
- CI do SHA ausente (H32).

## Risco residual

A renovação única depende de `obterToken` devolver o mesmo token quando não renovou; está preso por teste no aplicativo e no transporte. O comportamento real em aparelho (tempo, relógio do aparelho, sinal intermitente) não foi visto.

## Motivo do humano

O critério E2E da etapa pede ver, no emulador ou aparelho, a fila parar sem descartar nada quando o agente é desativado e subir uma vez depois da reativação. Esta máquina não tem emulador nem aparelho; só uma pessoa com o aparelho pode conferir.
