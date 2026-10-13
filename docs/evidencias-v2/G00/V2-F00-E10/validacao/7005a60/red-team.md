---
validador: red-team
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
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

Com a recuperação LIGADA (notificador de teste em memória e em arquivo):

1. Enumeração por mensagem e status: e-mail existente, em caixa alta, de outro município e inexistente deram o mesmo `202` e o mesmo corpo. Formatos inválidos (espaços nas pontas, CRLF com `Bcc:`, `%` como curinga) deram 422 de validação e nenhum envio: sem injeção de cabeçalho e sem curinga LIKE (a busca é por `lower(email) = lower(...)`).
2. Enumeração por tempo: 150 rodadas intercaladas por tipo, contas distintas a cada rodada (a primeira tentativa do QA e a minha reusaram o e-mail e caíram no teto por e-mail): existente mediana 1,79 ms e média 2,11; inexistente 1,82 e 1,87; desativada 1,61 e 1,83. Indistinguível em PGlite.
3. Reuso: duas redefinições simultâneas com o mesmo token: uma `200`, a outra `401 sessao_encerrada "Este link de redefinição não vale mais"`, e só uma das duas senhas passou a valer. Segunda tentativa com o mesmo token, token inventado: mesmo `401` e mesma frase. Token vazio e token em lista: 422.
4. Expiração: depois de forçar `expira_em` ao passado, o link responde o mesmo `401`.
5. Efeito colateral certo: redefinir derruba a sessão antiga (renovação com refresh antigo: 401; escrita com acesso antigo: 401).
6. Token no log: com `destinoDeLog` coletando 50 linhas do servidor (inclusive duas de `/auth/redefinir`), nem o token do link nem a senha nova aparecem; a linha registra só método, caminho, host e IP. O corpo do pedido é redigido (`req.body.token`, `senha`).
7. Cabeçalho Host forjado: o link do e-mail sempre começa com `URL_PAINEL` da configuração (`https://painel.exemplo.gov.br`), com `Host: evil.example`, com `X-Forwarded-Host` e `X-Forwarded-Proto`, e com `Origin` e `Referer` hostis. O código monta o link de `config.URL_PAINEL` e nunca lê o Host; em produção `URL_PAINEL` precisa ser https (recusa de `http://` comprovada).
8. Token na URL e no Referer, no navegador real (Chromium, painel do SHA contra a API com `NOTIFICADOR_ARQUIVO`): ao abrir o link, a barra de endereço fica em `/redefinir-senha` sem o token e a pilha de histórico tem 2 entradas. O fluxo termina com "Sua senha foi alterada" e o mesmo link reaberto mostra "Este link não vale mais". Durante o carregamento, 3 requisições AO PRÓPRIO HOST (documento, JS, CSS) levam o token no `Referer` ou na URL; nenhuma sai para outro host (único host contatado: o do painel). O `Referrer-Policy: no-referrer` de `vercel.json` cobre isso na Vercel, não testado aqui.
9. Limite de taxa: o sexto pedido da hora para o mesmo e-mail (cinco já tinham passado, inclusive com Host forjado e caixa alta) seguiu devolvendo `202` com o mesmo corpo e não gerou mensagem. O teto vale igual para e-mail existente e inexistente.
10. Com a recuperação DESLIGADA (`RECUPERACAO_ATIVA=nao`, segundo servidor, notificador espião): `/auth/recuperar` com e-mail existente e inexistente: o mesmo `503 recuperacao_desligada`; `/auth/redefinir` com token qualquer e com corpo vazio: o mesmo `503`; `GET /auth/recuperacao`: `{"ativa":false}` sem dado de conta; `GET /auth/recuperar` e barra final: 404; zero mensagens no espião e zero linhas novas em `recuperacoes_senha`. Corpo inválido em `/auth/recuperar` dá 422 antes do 503, o que só informa o formato do campo.
11. Produção: `carregarConfig` com `RECUPERACAO_ATIVA` AUSENTE (o padrão do schema é `sim`) recusa a partida; `nao` sobe; `SIM` maiúsculo recusa; `sim` com `EMAIL_ATIVO=sim` e sem provedor recusa; `nao` com `NOTIFICADOR_ARQUIVO` recusa; `URL_PAINEL` http recusa. `fly.toml:67` tem `RECUPERACAO_ATIVA = "nao"` e nenhum outro arquivo de implantação (compose, Dockerfiles, `fly.console.toml`, workflow) a liga.

## Evidência

- API: `scratchpad/rt-api2.txt` (blocos "E10 ...", rodada limpa), `scratchpad/rt-api3.txt` (blocos "E10-OFF ..."), `npx vitest run test/zz-redteam-tmp.test.ts -t E10` e `-t DESLIGADA`, saída 0.
- Navegador: `scratchpad/rt-e10.mjs` (saída no relato acima), API real em `tsx src/index.ts` na porta 3777 com `NOTIFICADOR_ARQUIVO` em `scratchpad/notif.txt`, painel do SHA construído em `scratchpad/web-dist`.
- Arquivos temporários apagados; servidores encerrados; `git status --porcelain` só mostra `validacao/`.

## Cenários positivos

Pedido, link, redefinição, entrada com a nova senha (via QA); no navegador, o fluxo do link até "Sua senha foi alterada".

## Cenários negativos

Itens 1 a 11.

## Tentativas de reprovar

1. Oráculo de existência por status, corpo, tempo (150 rodadas) e por e-mail de outro município: nenhum.
2. Injeção de cabeçalho de e-mail e curinga no campo de e-mail: barrada na validação.
3. Corrida de duas redefinições com o mesmo token: uma vence.
4. Link com Host forjado: o link não muda.
5. Token no log do servidor: não está.
6. Ligar a recuperação em produção por omissão de variável: a partida recusa.
7. Procurar rota que responda diferente com a recuperação desligada: todas uniformes.

## Achados

1. anotado. O teto de 5 pedidos por hora por e-mail é contado em memória por processo e cada pedido novo invalida o link anterior. Um atacante que conheça o e-mail da vítima pode manter a vítima sem link utilizável (envia 5 por hora) e enche a caixa dela com até 5 mensagens por hora; com mais de uma instância o teto multiplica. Hoje inofensivo (produção desligada); reavaliar no CP-19.
2. anotado. Durante o carregamento, o token vai no `Referer` das três primeiras requisições ao mesmo host, antes do `replaceState`. Sem terceiros envolvidos; o `no-referrer` de `vercel.json` cobre. A regra do `vercel.json` casa só `/recuperar-senha` e `/redefinir-senha` sem barra final; não verifiquei o comportamento da Vercel com barra final.
3. anotado. `consumir_recuperacao` aceita conta desativada (grava o hash; a entrada segue recusada) e o pedido de recuperação já ignora conta inativa. Sem efeito prático.
4. anotado. Tempo só medido em PGlite; em Postgres real o caminho do e-mail existente (UPDATE e INSERT) faz escrita e o do inexistente só leitura. Medir de novo no CP-19.

## Não verificado

- Envio real por provedor (Resend) e conteúdo HTML/cabeçalhos finais.
- Variável injetada por `fly secrets` que sobrescreva o `[env]`.
- Cabeçalho `Referrer-Policy` servido de fato pela Vercel.
- Conta com segundo fator ativo passando pelo link de redefinição.
- Postgres 17 e medição de tempo com rede.

## Risco residual

Produção desligada e a configuração impede ligar sem provedor. Ao ligar, valem os achados 1 e 4.

## Motivo do humano

Não se aplica à dimensão red-team. O fluxo com notificador de arquivo e a confirmação de produção desligada, pedidos pela etapa, são do Rafael.
