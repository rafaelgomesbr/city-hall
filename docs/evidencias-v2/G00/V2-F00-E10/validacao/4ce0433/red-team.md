---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente igual ao do relatório da E07 desta rodada: PostgreSQL 17.6 real, cluster próprio (porta 55877), worktree próprio do SHA `4ce0433` com as 51 migrações, API em processo sobre `bancoPostgres` real (`SET LOCAL ROLE dc360_app`), recuperação ligada com notificador que guarda a mensagem, sonda própria `$V/sondas/sonda-red-team-r5.test.ts` (`$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L01-red-team`). Sem grampo; gatilhos de registro (sem espera) para saber a ordem de confirmação.

1. Teste positivo decisivo da rodada 4 ("o link redefine a senha; a nova entra e a antiga não") contra a troca em voo da sessão que o link derruba. PASS. 120 disputas sem grampo link contra troca do invasor, nas duas ordens: 0 sobrevivente. Com o link primeiro, 60 de 60 com o link 200, a senha do link valendo e a troca recusada (401); com a troca primeiro, 29 em que o link confirmou no meio e a troca foi recusada, e 31 em que a troca confirmou antes e o link respondeu 401 às claras (morto pela troca). Com o `servico.ts` de `bb0f654`, 16 de 30 sobreviventes (`$V/saidas/10-sonda-conserto.resumo.txt`, `$V/saidas/20-mutacao-servico-bb0f654.resumo.txt`).
2. Link emitido ANTES de cada mudança e usado depois (link pedido pela rota `POST /auth/recuperar`, token tirado da mensagem): troca pela própria pessoa, redefinição por quem administra, desativação, desativação seguida de reativação e outro link usado: o link antigo responde 401 `sessao_encerrada` nos cinco, o hash não muda e a senha da mudança vale. Sem a 051 (pasta de migrações sem ela), quatro dos cinco passam com 200 e trocam a senha (o de "outro link usado" já era coberto pela 005) (`$V/saidas/21-mutacao-sem-051.resumo.txt`).
3. Corrida entre o USO do link e a mudança, atraso de 0 a 500 ms e lado sorteados, 60 por mudança e por ordem: redefinição por quem administra, troca pela própria pessoa, desativação: 360 disputas, 0 link sobrevivente (o link gravando depois da mudança, ou a senha do link valendo depois de a mudança responder 200, ou conta reativa), 0 erro 500, 0 impasse. Sem a 051: 45 de 90 com o link sobrevivendo.
4. Testes de autorização e isolamento: o link só redefine a conta dele (`consumir_recuperacao` grava pelo `usuario_id` da linha do link); quem administra de outro município não alcança a conta (404, relatório da E09). Não sondei a resposta neutra de `/auth/recuperar` para email de outro município (ver Não verificado).

## Evidência

- Testes do repositório no SHA, em Postgres 17.6 real (`renovacao-contra-encerramento`, `recuperacao-morre-com-a-credencial`, `id-da-propria-conta`): código 0, 73 de 73 (`$V/saidas/00-testes-do-repo-no-sha.txt`).
- Sonda sobre o conserto (`SONDA_RODADAS=60`): código 0 (`$V/saidas/10-sonda-conserto.txt`, `.jsonl`, `.resumo.txt`).
- Corrida da EMISSÃO do link contra a desativação, 240 rodadas: código 1, achado 2 abaixo (`$V/saidas/11-emissao.txt`, `.jsonl`).
- Mutação sem a 051: código 1 (`$V/saidas/21-mutacao-sem-051.txt`, `.resumo.txt`).
- Mutação A da E07 (troca de `bb0f654`): código 1 (`$V/saidas/20-mutacao-servico-bb0f654.resumo.txt`).
- `$V/saidas/postgres.log`: nenhum `deadlock detected` em nenhuma execução.

## Cenários positivos

- Link usado sem disputa: 200, a senha do link entra, as sessões caem.
- Link usado antes da redefinição por quem administra: 60 de 60 com os dois 200 e a temporária valendo no fim (ordem serial "link, depois redefinição").
- Link usado antes da desativação: 27 de 60 com o link 200 e a conta desativada no fim.
- O que não é credencial (falha de login, edição do cadastro com o mesmo email, reativação) não mata o link: caso do repositório, verde.

## Cenários negativos

- Link emitido antes de troca, redefinição, desativação, desativação mais reativação e outro link: 5 de 5 recusados (401).
- Mudança primeiro e link no meio: redefinição 60 de 60 com o link 401; troca pela própria pessoa 37 com o link 401 (e 23 em que o link venceu e a troca da pessoa, com a sessão derrubada pelo link, foi recusada com 401); desativação 60 de 60 com o link 401 e a conta desativada.

## Tentativas de reprovar

- Corrida de uso contra mudança em volume, nas duas ordens: nada sobreviveu.
- Link antigo contra cada mudança, inclusive desativar e reativar: morto.
- Corrida da EMISSÃO do link (`abrir_recuperacao`, a mesma função da rota) contra a desativação, atraso de 0 a 15 ms, metade das rodadas com um link anterior pendente: 11 de 240 deixaram um link pendente numa conta desativada, e nas 11, reativada a conta, o link redefiniu a senha (200). Ver achado 2.
- Troca do email pelo administrador com link pendente: o link continua valendo. Ver achado 1.
- Desfiz a 051 e o conserto da troca: a sonda acusou nos dois.

## Achados

1. Corrige antes de crescer (bloqueia o CP-19): o link pendente sobrevive à TROCA DO EMAIL da conta. Reprodução (`$V/saidas/10-sonda-conserto.jsonl`, linha `link-seq` com `troca_de_email_pelo_admin`): link pedido por `POST /auth/recuperar` para o email da Helena; a administradora troca o email dela por `PATCH /usuarios/:id`; o link antigo responde 200 e redefine a senha. O gatilho da 051 só olha `senha_hash` e `ativo`. Trocar o email é a reação típica a "a caixa de correio foi tomada", e o link já entregue na caixa tomada continua dando a conta a quem a tomou por até `RECUPERACAO_MINUTOS`; depois da troca, essa pessoa não consegue pedir outro, então é capacidade que o atacante não teria de outro jeito. O caso do repositório "edição do cadastro não mata o link" edita sem mudar o email, então não cobre isso. Não reprova a etapa: o email não é credencial nos critérios da E10, nem item do motivo da rodada 4, e a produção roda com a recuperação desligada; mas a correção (incluir `email` no gatilho, ou conferir o email do link no consumo) tem de entrar antes de ligar a recuperação.
2. Anotado: a emissão do link concorrente com a desativação escapa do gatilho. `abrir_recuperacao` lê `ativo` sem trava, e o INSERT que confirma depois do UPDATE do gatilho não é visto por ele: 11 de 240 rodadas com link pendente numa conta desativada que vale depois da reativação (`$V/saidas/11-emissao.jsonl`). `consumir_recuperacao` recusa enquanto a conta está desativada. Impacto prático nulo hoje: quem recebe esse link é quem lê a caixa da pessoa, e depois da reativação essa mesma pessoa pode pedir um link novo; o resultado só não é serializável. Conserto barato, se quiserem: `abrir_recuperacao` ler `ativo` com `FOR KEY SHARE`/`FOR SHARE` na linha da pessoa.
3. Anotado (já declarado pelo implementador): a troca pela própria pessoa com sessão e senha atual mata o link que a pessoa acabou de pedir.

## Não verificado

- Tela `RecuperarSenha.tsx`, `Referrer-Policy` e a trava de produção (`fly.toml`, `config.ts`): fora do foco red-team desta rodada; outras dimensões.
- Resposta neutra para email de outro município e para email inexistente: não sondada aqui.
- O caminho do gatilho com papel sem BYPASSRLS e sem município no contexto (item 6 de `PENDENCIAS.md` da E10): lido, não exercitado; nos caminhos de hoje o gatilho roda como `dc360_app` com o município ou como o dono com BYPASSRLS.
- Postgres 16 e o run do CI do SHA. Node 24.15 em vez do 22.

## Risco residual

Médio para o CP-19, baixo para a etapa: com a recuperação desligada em produção, os dois achados não têm superfície hoje; o achado 1 abre tomada de conta no dia em que a recuperação for ligada, se ninguém o fechar antes.

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado.
