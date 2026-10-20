---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [AUTH, API, DB, MIGRATION, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: o mesmo do relatório da E07 (worktree descartável em `4ce0433`, PostgreSQL 17.6 real, porta 55871, apagados no fim). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/a749c2d6-f207-483e-8a7b-380fcd3f5d28/scratchpad/rt1/saidas/`.

- Motivo da rodada 4 (a redefinição pelo link perde para a troca em voo; "o link redefine a senha; a nova entra e a antiga não"): CONSERTADO pela correção 4 da E07. Os casos 12 e 22 (o link confirma no meio da troca e a troca é recusada) e 29 (a troca segura a linha, o link espera e responde 401 às claras) estão verdes em PG 17.6 (`01`, `31` a `33`). Com o `servico.ts` de `bb0f654`, 12, 22 e 29 ficam vermelhos (`10`).
- Links pendentes que sobrevivem à troca, à redefinição ou à desativação (o grupo "corrige antes de crescer" da rodada 4): CONSERTADO pela migração 051 (gatilho `recuperacoes_morrem_com_a_credencial` e `consumir_recuperacao` conferindo `ativo`). `recuperacao-morre-com-a-credencial.test.ts` 7 de 7 (`01`). Tirei o gatilho da 051 no worktree e 4 ficaram vermelhos (redefinição, troca, dois links, 29) (`21`). Restaurado.
- O mesmo link duas vezes, token inventado, email inexistente e conta de outro município com resposta neutra: verde em `recuperacao.test.ts` (`01`).

## Evidência

- `01-testes-auth-pg17.txt`: 10 arquivos, 195 de 195, código 0.
- `21-mutacao-E10-sem-gatilho-VERMELHO.txt`: `DROP TRIGGER` e `CREATE TRIGGER` removidos da cópia da 051 no worktree (cada banco do teste nasce das migrações em disco), `recuperacao-morre-com-a-credencial` mais o arquivo da corrida: código 1, 4 falhas e 56 aprovados. `git restore`, worktree limpo.
- `31` a `33`: os dois arquivos restaurados, 60 de 60 em três rodadas.
- `pg.log`: 0 impasse em todas as execuções, inclusive o caso 32 (link e redefinição no mesmo instante).

## Cenários positivos

- Controle: o link redefine, a senha nova entra e a antiga não.
- Falha de login, edição do cadastro e reativação não matam o link (caso do arquivo novo).

## Cenários negativos

- Link pendente depois da redefinição, da troca e da desativação: 401, hash intacto.
- Link vivo numa conta desativada: recusado e gasto.
- Dois links pendentes: usar um mata o outro.
- Email de outro município: a mesma resposta de email inexistente.

## Tentativas de reprovar

- Desfiz o gatilho: o teste morde.
- Procurei um caminho que muda a senha ou `ativo` sem passar pelo gatilho: todos os UPDATE de `usuarios` (API, 002, 005, 049, 051) passam pelas colunas que o gatilho observa. O console não atualiza `usuarios`.
- Li a ordem das travas da 051 contra a troca da correção 4 e contra `abrir_recuperacao`: nenhum ciclo, e nenhum impasse no log.
- Li `abrir_recuperacao` (005) contra a desativação concorrente: ver Achados.
- Procurei o que deveria matar o link e não está no gatilho: ver Achados.

## Achados

- corrige antes de crescer (bloqueia o CP-19): trocar o email da conta (`PATCH /usuarios/:id`, `administracao.ts:365`) não mata o link pendente. O gatilho observa só `senha_hash` e `ativo`, e o arquivo novo afirma que "edição do cadastro" não mata o link. O email é o canal da recuperação: se ele foi corrigido porque estava errado ou comprometido, o link já mandado para o endereço antigo continua valendo até vencer. Encontrado na leitura, sem medição. Para reproduzir: pedir o link, trocar o email pela rota de quem administra, consumir o link (deve responder 200 hoje).
- anotado: `abrir_recuperacao` lê `ativo` sem travar a linha e insere o link, enquanto a desativação concorrente marca só os links que já enxerga. Um link pedido no mesmo instante da desativação pode nascer pendente numa conta desativada. `consumir_recuperacao` recusa e gasta esse link enquanto a conta está desativada, então o resto é só a reativação dentro do prazo do link. Encontrado na leitura, sem medição.
- Nenhum achado que bloqueia esta etapa. A produção segue com `RECUPERACAO_ATIVA=nao` até o CP-19.

## Não verificado

- Os dois achados acima não foram medidos.
- Não rodei a suíte web (`recuperar-senha.test.ts`), o e2e da seção 14 nem o teste de configuração de produção: são tela e configuração, fora desta dimensão.
- Não rodei sonda própria de disputas com tempo sorteado entre o link e a troca. A prova é a das disputas seguradas do repositório (12, 22, 29, 32), mais a mutação.
- Postgres 16 e o run do CI não foram vistos.

## Risco residual

O link morre com toda mudança de senha e com a desativação. Sobram a troca de email (Achados) e a janela estreita de `abrir_recuperacao` contra a desativação, as duas só com a recuperação ligada.

## Motivo do humano

Não se aplica.
