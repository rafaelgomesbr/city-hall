---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: PostgreSQL 17.6 real (binários de `SCRATCH/pg17`, só lidos e executados), `initdb` próprio, porta 55931 só em 127.0.0.1, `log_lock_waits=on`, `deadlock_timeout=200ms`, `max_connections=200`. API em processo (`construirServidor` sobre `bancoPostgres` real) e as suítes do repositório com `DC360_POSTGRES_DE_PROVA` apontando para o cluster. Node v24.15.0 (o `.nvmrc` pede 22; nada divergiu por isso). Cluster parado e porta liberada no fim.

- "Sessão rotacionada só vale enquanto a cadeia vive" e o item que REPROVOU na rodada 4 (troca de senha em voo com a senha antiga desfazendo redefinição, troca ou desativação concorrente): PASS. Suíte `renovacao-contra-encerramento.test.ts` verde em Postgres real, inclusive os 34 casos do bloco de Postgres real (disputas seguradas nas duas ordens). Minha sonda própria, sem grampo, 100 disputas (5 reações x 20), 0 sobrevivente e 0 erro 500 (`SCRATCH/validadores/red-team/saidas/10-sonda-r6.txt`). Prova de que morde: mutação desfazendo a releitura sob a trava em `trocarSenha` (`servico.ts`), 36 de 60 sobreviventes na mesma sonda (`saidas/11-mutacao.txt`); arquivo restaurado (`git diff` vazio).
- Senha provisória vencida nem escreve nem troca: coberto por `senha-provisoria.test.ts` e pelos casos 17/27 do bloco de Postgres real, verdes.
- Papel alterado: o token velho leva 401 `nao_autenticado`, renova e o papel novo vale; `familia-da-sessao.test.ts` verde.
- Reúso de refresh: token gasto reapresentado = 401 e a cadeia inteira cai (minha sonda: `novoRenova=401`, 0 sessão viva).
- Isolamento: escrita cruzando município = 404 `nao_encontrada`, nunca 403 (minha sonda).

## Evidência

- `npx vitest run` de 16 arquivos de autenticação e campo em Postgres real: código 0, 447 de 447, 0 pulado (`SCRATCH/validadores/red-team/saidas/00-testes-do-repo-no-sha.txt`).
- Sonda própria `zzz-red-team-r6` (criada em `apps/api/test`, rodada e apagada; árvore conferida limpa): código 0, 100 disputas sem grampo (`saidas/10-sonda-r6.txt`).
- Mutação da releitura sob a trava: código 1, 36 sobreviventes (`saidas/11-mutacao.txt`). Restaurado por cópia de segurança.

## Cenários positivos

- Renovação normal: o token de antes da renovação escreve durante e depois (casos do bloco de Postgres real, verdes).
- Reação primeiro (redefinição, link, desativação, troca pela própria pessoa, encerrar): a troca do invasor é recusada com o código do caso em 100% das rodadas em que a reação terminou antes.

## Cenários negativos

- Troca do invasor em voo vs cada reação, sem grampo, lado e atraso (0 a 40 ms) sorteados: quando a reação respondeu 200, a senha do invasor nunca passou a valer (0 em 100). Desativação reativada no teste: a senha do invasor segue sem entrar.
- Escrita em ocorrência de Vale Fundo com token de Serra Alta: 404.

## Tentativas de reprovar

- 100 disputas sem grampo nas cinco reações, procurando a senha do invasor valendo depois de uma reação 200: nenhuma.
- Mutação desfazendo a guarda de sessão/hash: reapareceram 36 sobreviventes, confirmando que a sonda morde.
- `/auth/sair` com token de renovação JÁ rotacionado: respondeu 204 e NÃO encerrou a cadeia (a sessão renovada ainda renova=200 e escreve=200). Ver Achados.
- Reúso de refresh: derrubou a cadeia inteira.

## Achados

- Anotado (continua desde a rodada 3, lido no código e medido aqui): `/auth/sair` com token já rotacionado responde 204 sem encerrar a cadeia viva. Não é critério da DoD da E07 (as três sondas) e não vaza dado nem papel; é falha de eficácia do logout por token velho. Reprodução: entrar, renovar, `POST /auth/sair` com o token antigo; a sessão renovada segue escrevendo.
- Anotado: na troca concorrente pela própria pessoa, vence quem grava primeiro (ordem serial válida, não sobrescrita silenciosa). Já declarado.

## Não verificado

- Segundo fator emitido antes da troca de senha: não fiz sonda própria; confiei na suíte `segundo-fator.test.ts` do repositório, verde em Postgres real (não uso os PASS da rodada 5 como prova, uso a execução de agora).
- Postgres 16 (o do job `implantavel`) e Postgres 17.6 em concorrência de muitas conexões além das 100 disputas: não exercitei volume maior.
- Run do CI do SHA: ausente (H32).
- Expurgo de IP/user-agent e lista de revogação: fora do escopo da etapa.

## Risco residual

Baixo para o critério. A garantia depende de toda mudança de credencial, `ativo` e sessão tomar a linha de `usuarios` antes da trava da pessoa (049/050); nenhuma reação nova foi introduzida nesta rodada. O anotado do `/auth/sair` rotacionado persiste e merece conserto antes de crescer.

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado localmente.
