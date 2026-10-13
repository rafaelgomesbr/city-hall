---
validador: qa
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
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

1. Pedido responde 202 neutro: PASS. Sonda própria: e-mail existente, inexistente, em maiúsculas, e de conta de OUTRO município deram o mesmo `202 {"mensagem":"Se existir conta com esse email, enviamos um link..."}`, corpo idêntico byte a byte.
2. O link do notificador de teste redefine a senha; a nova entra e a antiga não: PASS. Sonda (`NOTIFICADOR` em memória) e e2e seção 27.
3. Link de uso único: PASS. Segundo uso: `401 {"erro":"sessao_encerrada","mensagem":"Este link de redefinição não vale mais. Peça um novo."}`; corpo idêntico ao de token inventado e ao de link vencido.
4. Link expira: PASS. Forcei `expira_em` para o passado no banco: mesma recusa, mesmo corpo.
5. Pedido novo invalida o link anterior: PASS (link antigo deu 401, o novo redefiniu).
6. Token de uma conta não serve a outra: PASS. O link do Jonas redefiniu só o Jonas; a senha do Diego continuou valendo.
7. Token só existe como hash no banco: PASS. Nenhum `token_hash` igual a um token entregue.
8. Senha curta (validação no servidor): 422 e o link NÃO é consumido (o mesmo link redefiniu em seguida).
9. Produção desligada, com a variável: PASS. Segundo servidor com `RECUPERACAO_ATIVA=nao` e notificador espião: cinco pedidos (existente, inexistente, de outro município, maiúsculas) deram o MESMO `503 recuperacao_desligada`, mesmo corpo; zero mensagens no espião; zero linhas em `recuperacoes_senha`; `/auth/redefinir` com token qualquer deu 503; `GET /auth/recuperacao` deu `{"ativa":false}`. Nenhuma rota revela se a conta existe.
10. Produção comprovadamente desligada pela configuração: PASS. `fly.toml` linha 67 tem `RECUPERACAO_ATIVA = "nao"` e não declara `EMAIL_ATIVO` (padrão `nao`). Mutação: troquei para `"sim"` e `recuperacao-em-producao.test.ts` reprovou ("o fly.toml declara RECUPERACAO_ATIVA = nao"); desfeito com `git restore`. `carregarConfig` em produção: `RECUPERACAO_ATIVA=sim` com `EMAIL_ATIVO=nao` recusa; sem provedor recusa; `NOTIFICADOR_ARQUIVO` recusa mesmo com recuperação desligada e mesmo combinado com e-mail ligado; `"SIM"` maiúsculo recusa.
11. `Referrer-Policy: no-referrer` no painel: PASS com escopo restrito. `vercel.json` aplica ao caminho `/(recuperar-senha|redefinir-senha)`, junto de `X-Robots-Tag: noindex`, coberto por `recuperar-senha.test.ts` (37 casos). A etapa pede "no painel"; as duas páginas que carregam o token são as que importam.
12. Token sai da barra de endereço (`history.replaceState`): PASS no e2e seção 27 ("o token sai da barra de endereco assim que a tela o le" e "a tela continua funcionando").
13. Estados da tela: PASS no e2e 27: pedido (em branco, torto, neutro, desligada, 503 no pedido, 429, sem rede) e definição (link incompleto, curta, diferentes, sucesso, link usado, link inventado, com sessão aberta sem derrubá-la). Seção 27 tem 31 OK.
14. Resposta uniforme também sob teto por hora: a rota devolve 202 também quando o teto por e-mail estoura (`recuperacao-sem-oraculo.test.ts`, 6 arquivos de API verdes).

## Evidência

- `npm run build:shared`, saída 0.
- API: `recuperacao`, `recuperacao-desligada`, `recuperacao-em-producao`, `recuperacao-sem-oraculo`, `config`, `superficie`: 70 de 70, saída 0 (`scratchpad/api-e10.txt`).
- Web: 43 arquivos, 643 de 643, saída 0, inclui `recuperar-senha.test.ts` (37) e `recuperar-senha-e-sessao.test.ts` (3) (`scratchpad/web.txt`).
- `npm run test:e2e:api` (Chromium): 271 OK, 0 falha, zero erro de console, saída 0; seção 27 inteira (`scratchpad/e2e-api.txt`).
- `npm run test:scripts`: 213, 0 falhas, 4 pulados, saída 0.
- Sonda própria (arquivo temporário rodado e apagado) em `scratchpad/sonda.txt` e `sonda2.txt`; mutação do `fly.toml` desfeita (`git status --porcelain` só mostra `validacao/`).
- CI 37739535524: sucesso, SHA `7005a60`, 9 de 9.

## Cenários positivos

Pedido, link, redefinição, entrada com a senha nova; isolamento por conta; pedido novo substitui o anterior.

## Cenários negativos

Link usado duas vezes, vencido, inventado (mesma resposta); senha curta; e-mail inexistente e de outro município (mesma resposta); recuperação desligada (503 uniforme, sem e-mail, sem linha no banco); produção com `RECUPERACAO_ATIVA=sim` sem `EMAIL_ATIVO=sim` não sobe; `NOTIFICADOR_ARQUIVO` em produção não sobe. Conta desativada: pedido dá 202 sem envio, e um link pendente consumido depois da desativação troca a senha mas a entrada continua recusada.

## Tentativas de reprovar

1. Enumeração por mensagem e status: 4 variações de e-mail, mesma resposta.
2. Enumeração por tempo: 24 pares existente contra inexistente, em base nova e abaixo do teto por e-mail, três rodadas: medianas 3,52 contra 3,26 ms, 3,35 contra 3,13 ms, 3,36 contra 3,03 ms. Diferença de cerca de 0,3 ms, dentro do ruído do PGlite em memória. Meu primeiro teste de tempo estava contaminado pelo teto por e-mail (a conta existente passou a responder cedo depois de 5 pedidos, o que inverteu a diferença); refeito com amostras limpas.
3. Link duas vezes, vencido, inventado, de outra conta, de pedido substituído.
4. Desligar a variável e martelar com e-mails existentes: nenhum envio, nenhuma linha gravada.
5. Mutação do `fly.toml` para `sim`: o teste reprova (teste morde).
6. Link pendente de conta que depois foi desativada: a senha troca, a entrada continua negada (vigência segura o resto).

## Achados

1. ANOTADO. Caminho de existente faz escrita no banco (`UPDATE` mais `INSERT` em `abrir_recuperacao`) e a de inexistente só um `SELECT`; em Postgres real com `fsync` isso pode virar diferença mensurável por quem mede muitas amostras. No PGlite não apareceu. Mitigação existente: envio fora do pedido, teto por e-mail, limite por IP. Com produção desligada o risco é nulo hoje; reavaliar no CP-19.
2. ANOTADO. `recuperacao-em-producao.test.ts`, caso "a partida de produção com o que o fly.toml declara sobe", monta a configuração por um construtor (`producao()`) e não pelo texto do `fly.toml`, então não reprova sozinho se o arquivo mudar (reprova o outro caso, que lê o arquivo). Há cobertura, só redundante.
3. ANOTADO. Redefinição por link para conta que foi desativada depois do pedido grava o hash novo. Sem efeito prático (entrada negada), mas `consumir_recuperacao` poderia recusar conta inativa.
4. ANOTADO. `Referrer-Policy` só nas duas rotas de recuperação, não em todo o painel. Suficiente para o risco descrito, mas a etapa fala em "painel".

## Não verificado

- Envio real por provedor (Resend): sem chave nem domínio, é do CP-19. O que a produção faz quando ligada não foi exercitado além da configuração.
- Variável injetada por `fly secrets` que sobrescreva o `[env]` do `fly.toml`: só dá para conferir no ambiente do Fly.
- Cabeçalho `Referrer-Policy` servido de fato pela Vercel: conferi o `vercel.json` e o teste, não uma resposta HTTP real.
- Medição de tempo em Postgres real e por rede.
- Fluxo com `NOTIFICADOR_ARQUIVO` à mão (o e2e usa o arquivo; não abri o arquivo na mão).
- Firefox, WebKit, mobile real, leitor de tela, zoom 200% (A11Y e UX são validadores próprios).
- Capturas dos 90 arquivos: não abri nenhuma nesta etapa.

## Risco residual

- CP-19 aberto: ligar `RECUPERACAO_ATIVA` e `EMAIL_ATIVO` em produção continua bloqueado e a configuração impede. Quando ligar, repetir o teste de enumeração por tempo contra Postgres real e rever o link na query com provedor.
- O aviso "Se existir conta..." é neutro, mas o 503 da produção desligada é igual para todos (sem oráculo).

## Motivo do humano

Portão visual com Rafael obrigatório (tela pública), e a validação humana pedida na etapa: ele faz o fluxo com o notificador de arquivo e confere que a produção segue desligada. Só ele aprova o texto das frases da tela.
