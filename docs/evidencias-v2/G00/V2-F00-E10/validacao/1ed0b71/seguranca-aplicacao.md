---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Árvore principal (HEAD `5044e7a`, produto idêntico a `1ed0b71`). Postgres 17.6 descartável do validador (binários de `SCRATCH/pg17`, `initdb` próprio, porta 55931, só 127.0.0.1, `log_lock_waits=on`, `deadlock_timeout=200ms`), derrubado e apagado no fim.

- **FAIL da rodada 4 (troca de senha em voo contra o link)**: minha sonda N4, 20 rodadas em Postgres real com a sessão do "invasor" (senha antiga) trocando a senha ao mesmo tempo que o link é usado: 20 de 20 com `troca=401 link=200`, a senha do link entra, a do invasor e a antiga não; nunca dois 200, nunca 500. PASS.
- **Links pendentes invalidados em troca, redefinição e desativação (migração 051)**: `recuperacao-morre-com-a-credencial.test.ts` 7 de 7 verdes; sonda N5 em Postgres real: desativação simultânea ao link, 20 de 20 `des=200 link=401`, ninguém entra com a senha do link, e o link não ressuscita depois de reativar; redefinição por quem administra simultânea ao link, 20 de 20 `adm=200 link=200` em ordem serial (a temporária entra, a do link não), sem 500 nem impasse. PASS.
- **Link de credencial antiga (anterior à 051)**: banco levado até a 050 com `psql`, semeado, dois links pendentes gravados, 051 aplicada por cima: os dois continuam pendentes; depois a troca do hash de uma pessoa e a desativação da outra marcam `usada_em` nos dois. PASS.
- **Testes negativos da etapa** (link duas vezes, vencido, inventado, e-mail inexistente): sonda N2, segundo uso, token inventado e link vencido respondem o mesmo 401 com o mesmo corpo; o link de uma pessoa não toca o hash de outra. PASS.
- **Enumeração e isolamento** ("e-mail de conta do município B pedido pela tela do A tem resposta idêntica à de inexistente"): sonda N1, cinco pedidos (conta existente de Serra Alta, conta de Vale Fundo, inexistente, conta desativada, e-mail em maiúsculas): todos 202, corpo idêntico, mesmo conjunto de cabeçalhos (fora `date`, identificador da requisição e contadores do limitador). A conta desativada não recebe mensagem. PASS.
- **Produção desligada**: `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; `carregarConfig` em produção (com URL do banco exigindo TLS) recusa `RECUPERACAO_ATIVA=sim` sem notificador e recusa `NOTIFICADOR_ARQUIVO`. PASS.
- **Token fora da URL e Referer**: `vercel.json:24-25` `Referrer-Policy: no-referrer`; `RecuperarSenha.tsx:372` `history.replaceState` sem a query. Leitura (E3a), a tela é de outra dimensão.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/seguranca-aplicacao/`:

- `e10-testes.txt`: `renovacao-contra-encerramento.test.ts`, `recuperacao-morre-com-a-credencial.test.ts`, `recuperacao.test.ts`, `recuperacao-sem-oraculo.test.ts`, `recuperacao-desligada.test.ts` com `DC360_POSTGRES_DE_PROVA` (URL de conexão do cluster descartável): 5 arquivos, 92 de 92, nenhum pulado, código 0. Inclui os casos 12, 22, 29, 32, 33 e 34 em Postgres real.
- `zz-sonda-seg-e10.test.ts` (a sonda, copiada para `apps/api/test/` só durante a execução e apagada) e `e10-sonda.txt` (N1 a N5; N5 reprovou por falta de link por causa do teto `RECUPERACAO_POR_EMAIL_HORA`, que a sonda esgotou: é o teto funcionando) e `e10-sonda-n5.txt` (N5 sozinho, 20 rodadas de cada disputa, verde, código 0).
- `e10-link-pre-051.txt`: o banco na 050, os links, a 051 por cima, e o antes e depois de `usada_em`.
- `e10-config.txt`: as três configurações de produção e a recusa de cada uma.
- `test-api.txt`: `npm run test:api` completo em Postgres real, 106 arquivos, 1624 de 1624, código 0.

## Cenários positivos

- O link redefine; a senha nova entra e a antiga não (controle de `recuperacao-morre-com-a-credencial.test.ts` e N2).
- O link de outra pessoa (Jonas) redefine só a senha dele.
- Conta reativada depois da desativação entra normalmente; só o link morto continua morto.

## Cenários negativos

- Segundo uso, token inventado e link vencido: mesmo 401 `sessao_encerrada`, mesma frase ("Este link de redefinição não vale mais. Peça um novo.").
- Mesmo link em dois pedidos simultâneos (N3, 20 rodadas): exatamente um 200 e um 401 em todas.
- Link contra troca, contra desativação e contra redefinição por quem administra, simultâneos: nenhuma resposta 500, nenhum par de vencedores incoerente.
- E-mail de outro município, inexistente e desativado: resposta idêntica à da conta existente.

## Tentativas de reprovar

- Disputa do FAIL da rodada 4 sem grampo nem trava de prova, só pedidos simultâneos pela API real, 20 vezes: o link nunca perde para a troca em voo.
- Uso duplo simultâneo do mesmo link para tentar duas senhas: nunca dois 200.
- Desativar no mesmo instante do link para tentar deixar a conta desativada com a senha do link: o link sempre perdeu, e a conta desativada não entra.
- Link anterior à migração 051 sobrevivendo à mudança de credencial: morre.
- Distinguir conta existente de inexistente ou de outro município por status, corpo ou cabeçalho: não distinguiu. O tempo não foi medido nesta rodada (ver Não verificado).
- Ligar a recuperação em produção com o notificador de arquivo: a configuração recusa.

## Achados

1. **anotado.** Com a sonda, o teto `RECUPERACAO_POR_EMAIL_HORA` (60 no teste) foi atingido e o pedido seguinte respondeu 202 igual, sem enviar mensagem. É o desenho documentado (resposta neutra), registro só porque quem testa em sequência pode ler como falha do envio.
2. **anotado.** A disputa link contra desativação deu sempre a desativação primeiro (o link deriva o hash antes de tocar o banco). A ordem inversa não apareceu em 20 rodadas pela API; ela é coberta pelo caso de "link vivo numa conta desativada" e pela conferência de `ativo` em `consumir_recuperacao`, que a mutação M2 do implementador mostrou morder.

## Não verificado

- Tempo de resposta do pedido com conta e sem conta (oráculo de tempo): não medido nesta rodada; a rodada 4 registrou 0,09 ms de mediana.
- A tela `RecuperarSenha.tsx` no navegador e o e2e do painel (`test:e2e:api`): outras dimensões.
- CI do SHA: ausente (H32).
- Provedor de e-mail real: desligado até o CP-19.

## Risco residual

A recuperação segue desligada em produção. Ligada, o link morre com toda mudança de credencial e com a desativação, e as disputas que derrubaram a rodada 4 ficaram seriais em Postgres real. Fica o risco escrito em `apps/api/PENDENCIAS.md` (item 6 da seção da E10): o gatilho da 051 roda sob RLS forçada com o papel de quem atualiza `usuarios`; um caminho futuro sem município no contexto marcaria zero links sem erro.

## Motivo do humano

A etapa pede que Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada (`fly.toml` e as variáveis do ambiente real). Só ele tem acesso ao ambiente de produção para confirmar o valor efetivo da variável lá.
