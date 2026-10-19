---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: autenticação e sessão revogada (seção 7 de 28, item 2 da lista que não admite risco aceito); o conserto é único para E07, E09 e E10
---

## Critérios verificados

Conflito arbitrado: `qa.md` (FAIL, a redefinição pelo link perde para uma troca de senha em voo da sessão que ela derruba) contra `red-team.md` e `seguranca-aplicacao.md` (PASS, com os achados de link pendente rebaixados para "corrige antes de crescer", com o argumento de que não quebram critério escrito e de que a recuperação está desligada em produção). Observação de partida: os dois PASS não sondaram a disputa do QA. Os achados deles são outro defeito (o link pendente sobrevive a mudanças posteriores, em sequência, sem disputa). Por isso o conflito não é "dois validadores olharam o mesmo cenário e discordaram", e sim "o QA provou um cenário que os outros não tentaram". Arbitro o cenário do QA pela prova e pelo texto da etapa, e dou parecer sobre os achados rebaixados.

Critério que decide (bloco da etapa, `docs/roadmap-v2/03-fase-00-estabilizacao.md:292`, campo "Testes positivos"), texto exato:

> "pedido responde 202 neutro; o link do arquivo de teste redefine a senha; a nova entra e a antiga não (seção 14 do e2e)"

Critérios que o acompanham:

- Objetivo: "\"esqueci a senha\" funciona de ponta a ponta no painel e na API com o notificador de teste, e a produção permanece desligada até o CP-19."
- Definition of Done: "fluxo provado ponta a ponta com notificador de teste; estados da tela testados; produção comprovadamente desligada; item \"recuperação\" do G00 marcado."
- FATO do implementador que a etapa reapresenta como provado: "redefinir derruba todas as sessões".
- Seção 7 de `28`, lista do que não admite risco aceito, item 2: "autenticação, autorização e vigência (`exigirPermissao`, sessão revogada, conta desativada)".

Decisão por pergunta do gatekeeper:

1. **A etapa promete que o link redefine a senha e derruba as sessões?** Sim. O positivo diz, com todas as letras, que o link redefine e que "a nova entra e a antiga não". Na disputa reproduzida, o link responde 200 (a tela diria "Senha redefinida. Entre com a nova senha."), a senha nova escolhida pelo link NÃO entra (401) e entra uma senha que não é a nova (a escolhida pela sessão que o link derrubou). A sessão é marcada como derrubada ("senha redefinida"), mas o efeito que ela tinha em curso grava depois da revogação e vence: é escrita de sessão revogada, que é exatamente a "sessão revogada" do item 2. O critério falha.
2. **A recuperação desligada em produção muda o veredito?** Não. "Produção comprovadamente desligada" é UM critério da DoD, não uma mitigação que dispensa os outros. O objetivo da etapa é que o fluxo "funciona de ponta a ponta [...] com o notificador de teste": a configuração em que o critério é avaliado é justamente a ligada. Usar "não roda em produção hoje" para passar um critério de autenticação que falhou é aceitar o risco por outro nome, e a seção 7 diz que autenticação e sessão revogada não admitem risco aceito. Além disso, a raiz não está desligada: o mesmo `trocarSenha` atende hoje a redefinição por quem administra (E09), que está ligada em produção.
3. **A causa estar em código da E07 muda de quem é o FAIL?** Não muda o veredito da E10. O veredito julga o critério da etapa contra o SHA, e o critério da E10 falha do mesmo jeito, seja qual for o arquivo do defeito. O que a origem muda é o conserto: é um só (em `trocarSenha` e `trocar_senha`) e fecha E07, E09 e E10 juntas, com um caso de disputa no teste de cada uma. A E10 volta a ser validada depois do conserto, sem trabalho próprio além do caso de teste.
4. **Depende de decisão de escopo de produto (BLOCKED para Rafael)?** Não. Os dois controles em sequência (abaixo) mostram que, em QUALQUER ordem serial, vale a senha do link: link primeiro, a troca seguinte recusa com 401 `sessao_encerrada`; troca primeiro, o link seguinte redefine e a senha do link entra. O resultado da disputa (as duas respostas 200 e a senha da sessão derrubada valendo) não corresponde a nenhuma ordem serial. Não é escolha de "quem chega por último ganha", é perda de serialização numa operação de credencial (conferir numa transação, gravar em outra). Defeito técnico, sem decisão de produto a tomar.

Veredito da arbitragem: **FAIL para a etapa**, mantido o do QA.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/arbitragem-E10/`:

- Ambiente: cluster PostgreSQL 17.6 descartável criado com os binários das instruções comuns (`pg17/pgsql/bin`), só TCP local na porta 55491; banco novo com `aplicarMigracoes` e `carregarSemente` do repositório no SHA (árvore em `0290af5`, `dc360/` idêntico a `bb0f654`); a API construída por `construirServidor` com `bancoPostgres` (que faz `SET LOCAL ROLE dc360_app`), ouvindo em HTTP de verdade na porta 3891 e chamada por `fetch`; `carregarConfig` com `NODE_ENV=test` e sem `RECUPERACAO_ATIVA`, que assume o padrão `sim` como os testes (a saída imprime "RECUPERACAO_ATIVA efetiva: sim"); notificador injetado que guarda as mensagens (equivalente ao de arquivo; o link sai dele).
- `sonda-corrida-pg17.mts`, rodada com `cd dc360/apps/api && npx tsx <sonda>`: código 0, saída `01-corrida-pg17.txt`.
- `sonda-link-pendente-pg17.mts` (mesmo ambiente, só os cenários dos achados rebaixados): código 0, saída `02-link-pendente-pg17.txt`.
- Inspeção: `dc360/apps/api/src/auth/servico.ts`, `redefinirSenha` (linha 1040) e `trocarSenha` (linha 1065): a troca lê `senha_hash` em `comTenant`, confere com scrypt, deriva a nova com scrypt e só então chama `trocar_senha` em `semTenant`, outra transação. `dc360/db/migrations/049_renovacao_e_encerramento_na_mesma_trava.sql`: `trocar_senha` faz `UPDATE usuarios SET senha_hash` incondicional e só depois `travar_sessoes_do_usuario`; não relê o hash, não confere `ativo`, não confere que a sessão preservada está viva. `consumir_recuperacao` trava a linha do link (`FOR UPDATE`, `usada_em IS NULL AND expira_em > now()`), grava a senha e revoga todas as sessões.
- Cluster parado e `pgdata` apagado no fim; portas 3891 e 55491 sem processo ouvindo; `git status` igual ao do início (só as pastas `validacao/bb0f654/` não rastreadas, mais este arquivo).

## Cenários positivos

- Controle 1, link primeiro e troca depois, em sequência: redefinir 200; a troca com a senha antiga responde 401 `sessao_encerrada`; a senha do link entra (200); a da troca não (401).
- Controle 2, troca primeiro e link depois, em sequência: troca 200; redefinir 200; a senha do link entra (200); a da troca não (401); a renovação da sessão antiga 401.
- Os dois controles mostram o comportamento correto e o resultado que a etapa promete em qualquer ordem serial.

## Cenários negativos

- Disputa (contagem que decide): a sessão aberta com a senha K chama `POST /auth/trocar-senha` (K para X) e, com atraso de 0 a 220 ms (passos de 20 ms), `POST /auth/redefinir` com o link (para Y). **12 de 12 rodadas**: as duas respostas 200 (troca cerca de 466 ms, redefinição cerca de 239 ms); Y não entra (401); X entra (200); K não entra (401); a renovação da sessão derrubada 401; o token de acesso devolvido pela troca leva 401 numa escrita; o motivo gravado na sessão é "senha redefinida". Ou seja: a sessão foi derrubada pelo link, e mesmo assim a escrita que ela tinha em curso gravou a senha depois da revogação e anulou a redefinição.
- Reproduz, em PostgreSQL 17 e HTTP real, o que o QA mediu em PGlite (6 de 6).

## Tentativas de reprovar

Tentei reprovar o FAIL do QA (isto é, achar razão para rebaixá-lo):

1. **Artefato do PGlite?** Não: reproduzido em PostgreSQL 17.6 real, 12 de 12, com o papel `dc360_app`.
2. **Artefato de `app.inject` ou de servidor em memória?** Não: a API ouviu em HTTP e foi chamada por `fetch`.
3. **Janela estreita demais para importar?** Não: a troca leva cerca de 466 ms e a redefinição cerca de 239 ms; qualquer redefinição que confirme dentro do meio segundo da troca perde (todas as 12, de 0 a 220 ms de atraso). Quem tem a senha e uma sessão (o invasor, que é o motivo de existir a recuperação) mantém trocas encadeadas e tem sempre uma em voo; a seguinte já recusa (sessão revogada), mas a que estava em voo vence e ele sabe a senha que escolheu.
4. **É apenas "último a gravar vence", aceitável?** Não: em nenhuma ordem serial a senha da sessão vence (controles 1 e 2). O resultado só existe por perda de serialização.
5. **A tela ou outro critério compensaria?** Não: a resposta 200 do link leva a tela à confirmação "Senha redefinida. Entre com a nova senha.", e a pessoa recebe uma senha que não entra.
6. **Desligado em produção basta?** Não, pelos motivos da pergunta 2 em "Critérios verificados".

Tentei também reprovar os PASS nos achados que eles rebaixaram:

7. Link pendente contra a redefinição por quem administra, em sequência: a administradora redefine (200, temporária recebida); o link antigo redefine depois (200); a temporária não entra (401); a senha do link entra (200). Confirma o achado 1 do red-team e o A1 da segurança.
8. Link pendente contra a desativação, em sequência: desativar 200; o link antigo redefine a senha da conta desativada (200, hash gravado); a conta desativada não entra (401); reativar 200; na reativação vale a senha de quem tinha o link (200) e a anterior não (401). Confirma o achado 3 do red-team.

## Achados

1. **FAIL (bloqueante; seção 7, item 2, sem risco aceito): a redefinição pelo link perde para uma troca de senha em voo da sessão que ela derruba.** 12 de 12 em PostgreSQL 17 (`01-corrida-pg17.txt`). Quebra o positivo "o link do arquivo de teste redefine a senha; a nova entra e a antiga não" e o objetivo "funciona de ponta a ponta". Raiz: `trocarSenha` (`dc360/apps/api/src/auth/servico.ts`) confere numa transação e grava em outra por `trocar_senha` (migração 049), sem trava nem releitura. Mesma raiz dos FAIL da E07 e da E09 nesta rodada.
   Conserto mínimo (não implementado): a gravação da troca passa a ser condicional dentro da mesma transação, sob `travar_sessoes_do_usuario` tomado ANTES do `UPDATE` de `usuarios`: reler `senha_hash` e conferir que é o mesmo que o scrypt aceitou (ou uma versão da credencial), que a conta está ativa e que a sessão de quem pede (ou a família dela) continua viva, e recusar com 401 `sessao_encerrada` se algo mudou, como `emitirPar` já faz desde a correção 3 da E07. Teste: no bloco de PostgreSQL real, o caso "troca em voo contra o link" nas duas ordens, conferindo QUAL senha entra no fim (não só que a sessão caiu), na suíte de recuperação da E10; o mesmo caso contra a redefinição por quem administra fica na E09.
2. **Corrige antes de crescer, no mesmo conserto (achados 1 e 2 do red-team, A1 da segurança): o link pendente sobrevive à redefinição por quem administra e à troca pela própria pessoa.** Reproduzido em sequência (`02-link-pendente-pg17.txt`, item 7 acima). Concordo com o rebaixamento: o texto da E10 trata uso único, prazo, pedido novo e token inventado, e não diz que outra mudança de senha invalida o link; não há critério escrito quebrado. Fica como pré-condição do CP-19, como os dois validadores escreveram.
3. **Achado 3 do red-team (conta desativada): mantenho fora do FAIL desta etapa, mas NÃO pode ser tratado como risco aceito.** Reproduzido (`02-link-pendente-pg17.txt`, item 8): o link grava a senha de conta desativada, que passa a valer na reativação. A conta desativada não entra (a vigência de entrada segura), então nenhum critério escrito da E10 quebra hoje; mas o tema é "vigência, conta desativada" do item 2, e por isso a saída correta é consertar junto (custo marginal), não registrar como risco. Conserto mínimo dos achados 2 e 3: `trocar_senha`, a redefinição por quem administra e a desativação marcam `usada_em` nos links pendentes da pessoa, e `consumir_recuperacao` confere `usuarios.ativo` antes de gravar.

## Não verificado

- O run do CI do SHA (não lido nesta sessão).
- A disputa pela tela no navegador: a prova é na API; a tela só reflete a resposta 200 (confirmação de sucesso), o que basta para o critério.
- A disputa contra o caminho do segundo fator e da ativação de conta: não sondado.
- Os demais critérios da E10 (estados da tela, resposta uniforme, produção desligada, `Referrer-Policy`): não reexaminados nesta arbitragem; os três relatórios concordam neles e não estão em conflito.
- O cabeçalho servido pela Vercel e o envio real de e-mail (CP-19 adiado).

## Risco residual

Enquanto o conserto não entrar, quem tem a senha de uma conta e uma sessão aberta anula de forma repetível a recuperação pelo link (e, pela mesma raiz, a redefinição por quem administra da E09, que está ligada em produção). Com a produção em `RECUPERACAO_ATIVA = "nao"`, o caminho da E10 não está exposto hoje, mas isso não muda o veredito (seção 7, item 2). Depois do conserto, os achados 2 e 3 precisam estar fechados antes do CP-19.

## Motivo do humano

Nenhum para esta arbitragem: o FAIL é técnico, provado por execução, e não depende de decisão de produto (nenhuma ordem serial produz o resultado observado). A validação humana já prevista pela etapa (Rafael fazer o fluxo com o notificador de arquivo, conferir a produção desligada e ler as frases da tela pública) continua pendente e não é afetada por esta decisão.
