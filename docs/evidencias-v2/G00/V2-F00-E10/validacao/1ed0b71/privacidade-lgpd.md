---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Critério da etapa (campo "Impacto LGPD"): "o e-mail do servidor é tratado só para enviar o link; o notificador de teste grava em arquivo local e `config.ts` o recusa em produção". Mais "resposta uniforme impede enumeração" e "produção desligada evita link em log". Testes de autorização e isolamento: pedido com e-mail do município B tem resposta idêntica à de e-mail inexistente; token de uma conta não serve a outra.

Inventário dos dados pessoais tocados:

| Dado | Nasce | Fica | Quem lê | Prazo |
| --- | --- | --- | --- | --- |
| e-mail digitado no pedido | corpo de `POST /auth/recuperar` | em memória do processo só como hash para o teto por pedido (`cabeNoTetoDoEmail`, `auth/servico.ts:250`); no banco, nada além do que já está em `usuarios` | ninguém | vida do processo |
| nome e e-mail do servidor (destinatário) | `abrir_recuperacao` (migração 005) | corpo da mensagem enviada ao notificador; nunca no log (`semOsEnderecos`, `auth/notificador.ts:153`) | o provedor de e-mail, quando ligado | decide o provedor |
| token do link | gerado no servidor | banco só como hash (43 caracteres base64url, `recuperacoes_senha.token_hash`); texto puro só no e-mail e na URL do link | quem recebe o e-mail | 30 min por padrão, uso único |
| `recuperacoes_senha.ip` | `enderecoDoCliente(req)` | tabela `recuperacoes_senha` | investigação; fora do pacote de saída | sem expurgo hoje (V2-F05-E12) |
| senha nova | corpo de `POST /auth/redefinir` | só o hash (scrypt) em `usuarios` | ninguém | vida da conta |

Fluxo: pedido (202 neutro) > `abrir_recuperacao` invalida o link anterior, grava hash+IP > envio DEPOIS da resposta (`enviarSemEsperar`, `servico.ts:279`) > link `/redefinir-senha?token=` no painel > o painel lê o token uma vez, tira da barra (`RecuperarSenha.tsx:372`, `history.replaceState`) > `POST /auth/redefinir` sem sessão > `consumir_recuperacao` gasta o link, troca o hash e derruba as sessões. Migração 051: o link morre em toda mudança de senha e desativação.

Controles com prova:
- Produção desligada: `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; `config.ts:720` recusa `RECUPERACAO_ATIVA=sim` sem notificador real; `recuperacao-em-producao.test.ts` e `recuperacao-desligada.test.ts` verdes no SHA.
- Cabeçalhos do painel: `vercel.json:21` `/(recuperar-senha|redefinir-senha)` com `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex`.
- Notificador de log não imprime corpo nem link; mostra destinatário encoberto (`notificador.ts:54-73`).

## Evidência

- API, 12 arquivos, 187 testes, código 0, incluindo `recuperacao`, `recuperacao-desligada`, `recuperacao-em-producao`, `recuperacao-sem-oraculo` (15), `recuperacao-morre-com-a-credencial` (7): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/api-e09-e10-e11.txt`. Painel, 112 testes verdes (`recuperar-senha`, `recuperar-senha-e-sessao` entre eles): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/web-testes.txt`.
- Sonda de API (PGlite, API completa, notificador que guarda a mensagem e coletor do log; saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/e09e10/`):
  - Enumeração: `e10-oraculo.json`. Pedido para e-mail existente do município A, existente em maiúsculas, existente do município B, conta desativada, e-mail inexistente, domínio conhecido com usuário inexistente e conta de município suspenso: os sete dão 202, mesmo corpo e mesmos cabeçalhos (descontado só `x-ratelimit-remaining`, que é contador): 7 de 7 idênticos ao de e-mail inexistente.
  - Tempo: `e10-tempo.json`: mediana 1,1 ms para existente e 1,2 a 1,8 ms para inexistente (o envio roda depois da resposta). Sem diferença que um atacante use.
  - Log: `e10-log-achados.txt` e `e10-log2-achados.txt` (log bruto em `e10-log-bruto.txt` e `e10-log2-bruto.txt`): nem o token, nem o e-mail, nem "redefinir-senha", nem a senha nova, nem o token inventado, nem o e-mail inválido aparecem no log nem no console.
  - Banco: `e10-banco-recuperacoes.json`: `token_hash` de 43 caracteres, IP gravado, nenhum token em texto puro.
  - Uso do link: `e10-redefinir.json`: 1º uso 200; mesmo link de novo, token inventado: 401 com a MESMA frase ("Este link de redefinição não vale mais. Peça um novo."), sem distinguir vencido, usado ou inexistente; corpo inválido: 422 sem eco do token nem da senha.
  - E-mail enviado: `e10-emails-enviados.json` (token redigido na evidência): só nome, link e minutos de validade; sem IP, sem município, sem dado de ocorrência. Quando a mesma pessoa pede duas vezes, só o último link vale (o primeiro deu 401 na primeira tentativa da sonda, comportamento esperado de `abrir_recuperacao`).
- Navegador real (Chromium via Playwright, painel construído do SHA em servidor local meu, API de mentira que registra pedidos; `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/sonda-web/web-resultado.json`, capturas em `docs/evidencias-v2/G00/V2-F00-E10/validacao/1ed0b71/capturas/web-redefinir-1280.png`, `web-redefinir-depois-do-envio-1280.png`, `web-redefinir-recarregada-1280.png`): abrindo `/redefinir-senha?token=<marcador>`, a URL passa a `/redefinir-senha` sem query, o marcador não aparece no DOM, nem em localStorage ou sessionStorage, nenhuma requisição subsequente leva o marcador no Referer, e o único pedido de rede com o marcador é o próprio carregamento do documento e o corpo do `POST /auth/redefinir` (sem sessão, sem cabeçalho de autorização). Recarregar a página mostra "Link incompleto".

## Cenários positivos

Pedido 202; link do notificador redefine a senha uma vez; nova entra (suítes `recuperacao.test.ts` e `recuperacao-morre-com-a-credencial.test.ts`); `GET /auth/recuperacao` devolve só `{ativa}` sem token.

## Cenários negativos

Isolamento e enumeração executados: município B e conta desativada e município suspenso respondem igual ao inexistente. Link usado duas vezes: 401; vencido e inventado: 401 igual; link de uma conta não serve a outra (token só existe como hash por conta; suíte `recuperacao.test.ts`). Produção `RECUPERACAO_ATIVA=sim` sem notificador não sobe (`recuperacao-em-producao.test.ts`).

## Tentativas de reprovar

1. Mutação em `auth/servico.ts` (troquei `semOsEnderecos(...)` por texto bruto; restaurado com `git restore` e `cmp`): `recuperacao-sem-oraculo` reprova 1 caso ("a falha do provedor vai para o log, sem o link e sem o email de quem pediu"), 28 verdes (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-log-e10.txt`). O teste morde.
2. Procurei o oráculo por existência: status, corpo, cabeçalhos, tempo; por conta desativada; por município suspenso; por caixa do e-mail: nenhum.
3. Procurei vazamento de token e senha por log (requisição normal, 401, 422): nenhum.
4. Procurei o token no navegador (barra, histórico atual, DOM, storage, Referer, requisições): só no pedido do documento e no corpo do POST.
5. Tentei o teto por e-mail para martelar uma caixa: 5 por hora por hash do e-mail, igual para quem existe e quem não existe (`recuperacao-sem-oraculo.test.ts`, verde).

## Achados

- anotado: `recuperacoes_senha.ip` (e `ip`/`user_agent` de `sessoes`) sem expurgo; dono V2-F05-E12. Linhas usadas e vencidas continuam na tabela com o IP.
- anotado: o pedido do documento `/redefinir-senha?token=...` carrega o token na URL e portanto aparece no registro de acesso da hospedagem estática (Vercel), fora do alcance do código. Mitigação existente: uso único, 30 min, e invalidação por mudança de senha; fica como risco residual a revisar no CP-19.
- anotado: o log operacional grava `remoteAddress` de todo pedido, inclusive de `/auth/recuperar`; sem prazo de retenção definido.
- anotado: ligar o envio real (CP-19) faz o e-mail e o nome do servidor trafegarem para um subprocessador (Resend, `notificadorHttp`). Hoje desligado em produção.

## Não verificado

- Envio real de e-mail e conteúdo no provedor (CP-19 aberto, produção desligada).
- O cabeçalho \`Referrer-Policy: no-referrer\` servido de fato pela Vercel: meu servidor local o emulou conforme \`vercel.json\`, então só a configuração foi lida (\`vercel.json:21\`), e o efeito sem Referer no navegador foi provado porque a URL já sai da barra antes de qualquer saída. O Referer do documento em si não foi provado na Vercel.
- Registro de acesso da Vercel e do Fly (sem acesso): não sei se a query string é retida e por quanto tempo.
- Postgres 17 real: a prova usa PGlite; a corrida do link com a troca de senha e a migração 051 em banco real são das dimensões QA e banco.
- Leitor de tela e fluxo humano da tela (UX e acessibilidade); fluxo de Rafael com o notificador de arquivo (pendência humana da etapa).
- Base legal do tratamento do e-mail, papel do provedor (operador) e cláusulas contratuais: profissional.

## Risco residual

Token do link na URL do pedido do documento (registro da hospedagem); IP sem expurgo até a V2-F05-E12; dependência de subprocessador quando o CP-19 ligar o envio.

## Motivo do humano

Antes de ligar `RECUPERACAO_ATIVA` e `EMAIL_ATIVO` em produção (CP-19), um profissional precisa decidir a base legal, o papel do provedor de e-mail como operador, o contrato e o prazo de retenção do IP e do log. Hoje a produção está desligada e provada por teste; a decisão não bloqueia esta etapa.
