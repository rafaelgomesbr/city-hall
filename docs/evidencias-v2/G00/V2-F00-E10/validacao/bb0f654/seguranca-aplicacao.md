---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Régua: OWASP ASVS 4.0 nível 2, capítulo V2.5 (recuperação de credencial), V7 (log) e V14 (configuração).

1. Resposta uniforme no pedido (status, corpo, cabeçalhos e tempo) para e-mail de conta do município A, de conta do município B e inexistente. PASS.
2. Limite por e-mail (teto de 5 por hora, por hash do e-mail, sem distinguir caixa, contando e-mail inexistente) e limite por endereço (`LOGIN_POR_IP`, sem contorno por `X-Forwarded-For`), no pedido e na redefinição. PASS.
3. Link de uso único, com prazo, invalidado por pedido mais novo, e com a MESMA resposta para usado, vencido e inventado. PASS.
4. Token com entropia (32 bytes de `randomBytes`, base64url de 43 caracteres) guardado só como SHA-256 base64url; o token de uma conta não serve a outra. PASS.
5. O notificador de arquivo não vaza token em log e não sobe em produção; o notificador de log não imprime o corpo; o log do servidor não carrega token, link nem e-mail. PASS.
6. Recuperação desligada em produção de fato não responde: 503 no pedido e na redefinição (inclusive token aberto antes do desligamento, que não é consumido), nenhuma linha nova no banco, nenhuma mensagem, `GET /auth/recuperacao` com `ativa=false`; e a configuração de produção recusa as combinações perigosas. PASS.
7. Painel: token sai da barra de endereço (`history.replaceState`), pedidos de recuperação sem o token da sessão aberta, `Referrer-Policy: no-referrer` nas duas rotas em `vercel.json`. PASS por teste e inspeção; o cabeçalho servido pela Vercel não foi observado (ver Não verificado).

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E10-E12-E15/`.

- E1: `cd dc360/apps/api && npx vitest run test/recuperacao.test.ts test/recuperacao-desligada.test.ts test/recuperacao-em-producao.test.ts test/recuperacao-sem-oraculo.test.ts test/config.test.ts`, código 0, 61 de 61 (`e10-01-testes-recuperacao.txt`).
- E1: `cd dc360/apps/web && npx vitest run test/recuperar-senha.test.ts test/recuperar-senha-e-sessao.test.ts`, código 0, 50 de 50 (`e10-04-web.txt`).
- E2: sonda própria `sonda-e10.mts` (Fastify real sobre PGlite com o papel `dc360_app`, `app.inject`, coletor de log), rodada com `cd dc360/apps/api && npx tsx <sonda>`, código 0, 35 conferências OK (`e10-02-sonda.txt`).
- Mordida (E1, mutação feita, rodada e desfeita com `git restore`, árvore conferida limpa depois; suíte de recuperação 42 de 42 de novo em `e10-03-depois-de-restaurar.txt`):
  - M1, sem a trava de 503 em `/auth/redefinir` (`rotas/autenticacao.ts`): 1 falha ("recusa tambem a redefinicao, para token aberto antes do desligamento") (`e10-mut-M1-redefinir-sem-trava.txt`).
  - M2, sem `cabeNoTetoDoEmail` (`auth/servico.ts`): 2 falhas, o teto de 5 e a caixa (`e10-mut-M2-sem-teto-por-email.txt`).
  - M3, sem a recusa de `NOTIFICADOR_ARQUIVO` em produção (`config.ts`): 2 falhas (`e10-mut-M3-arquivo-em-producao.txt`).
  - M4, notificador de log imprimindo o corpo: 1 falha (`e10-mut-M4-log-com-corpo.txt`).
  - M5, token em claro no banco: 1 falha ("o banco guarda o hash do token e nunca o token") (`e10-mut-M5-token-em-claro.txt`).
  - M6, envio aguardado dentro do pedido: 3 falhas (provedor fora do ar, log, provedor lento) (`e10-mut-M6-envio-aguardado.txt`).
  - M7, sem `history.replaceState` em `RecuperarSenha.tsx`: 1 falha (`e10-mut-M7-sem-replaceState.txt`).
  - M8, `semSessao` ignorado em `dados/http.ts`: 2 falhas (`e10-mut-M8-token-da-sessao.txt`).
- Inspeção: `db/migrations/005_recuperacao_de_senha.sql` e `049_*.sql` (`consumir_recuperacao` com `FOR UPDATE` e `usada_em IS NULL AND expira_em > now()`), índice único global `usuarios_email_global_idx` (`002`), `auth/tokens.ts:281-295`, `auth/notificador.ts`, `config.ts:657-760`, `fly.toml:60-67`, `vercel.json` (bloco `/(recuperar-senha|redefinir-senha)`).

## Cenários positivos

- Pedido de conta existente: 202, mensagem enviada ao notificador, link para `URL_PAINEL/redefinir-senha?token=...`.
- Redefinição com o link: 200; a senha nova entra; a anterior e a tentada no segundo uso não entram.
- Produção com o que o `fly.toml` declara (`RECUPERACAO_ATIVA=nao`, sem `NOTIFICADOR_ARQUIVO`): a configuração sobe (sonda, bloco 4).

## Cenários negativos

- E-mail de Serra Alta, de Vale Fundo e inexistente: 202/202/202, corpo e `content-length` idênticos, mesmo conjunto de cabeçalhos (fora data e contadores do limitador).
- Oito pedidos para o mesmo e-mail, de oito endereços e alternando maiúscula: só 4 mensagens novas (somando o pedido anterior, 5 na hora), todos 202.
- `LOGIN_POR_IP=3`: quarto e quinto pedido 429 trocando `X-Forwarded-For`, em `/auth/recuperar` e em `/auth/redefinir` (força bruta de token barrada por endereço).
- Mesmo link duas vezes: 200 e 401; o 401 é byte a byte igual ao de token inventado e ao de link vencido (`expira_em` no passado) e ao de link trocado por pedido mais novo.
- Corpo inválido com token (senha curta, token de 343 caracteres, token também na query): o token não aparece no log; nenhum link nem e-mail de quem pediu no log.
- Recuperação desligada: 503 com corpo igual para e-mail existente e inexistente, 0 mensagens, nenhuma linha nova em `recuperacoes_senha`, token aberto antes recusado com 503 e com `usada_em` ainda nulo.
- Produção: `NOTIFICADOR_ARQUIVO` com espaços ou caminho recusa; `RECUPERACAO_ATIVA` omitida (padrão `sim`) sem provedor recusa; `RECUPERACAO_ATIVA=SIM` e `NODE_ENV=prod` recusados pelo enum.

## Tentativas de reprovar

- Oráculo por tempo: mediana de 25 pedidos de cada lado, existe 0,8 ms e inexistente 0,7 ms (PGlite, só indicativo; o envio sai depois da resposta, provado por M6). Não achei diferença explorável.
- Oráculo por cabeçalho: comparei o conjunto inteiro de cabeçalhos de resposta; iguais.
- Contorno do teto por caixa e por endereço: não contornou.
- Contorno do limitador por `X-Forwarded-For`: não contornou.
- Vazamento de token pelo caminho de erro do zod e pela query string: não vazou para o log.
- Fuga da trava de produção por valor em branco do `NOTIFICADOR_ARQUIVO` ou por `NODE_ENV` fora do enum: recusado nos dois.
- Token aberto antes de desligar a recuperação: não consome nem troca senha.
- Estados da conta depois do link (sonda, bloco 1b): o link continua trocando a senha depois de quem administra redefinir a senha pela E09 (admin 200, link 200), depois de a própria pessoa trocar a senha em Minha conta (200, link 200) e depois de a conta ser desativada (link 200, entrada 401). Ver achado A1.
- E-mail repetido em dois municípios para escolher a conta errada: impossível, índice único global por `lower(email)`.

## Achados

- **A1, corrige antes de crescer (médio, ASVS V2.5 e guia OWASP de recuperação de senha):** link de recuperação pendente não é invalidado quando a senha muda por outro caminho nem quando a conta é desativada. Reprodução: `sonda-e10.mts`, bloco 1b; pedir o link para Helena, Rita (administradora) redefine a senha dela por `POST /usuarios/:id/redefinir-senha` (200), e o link da Helena ainda redefine (200). O mesmo depois de `POST /auth/trocar-senha` pela própria pessoa (Diego: 200 e link 200), e com a conta desativada (Jonas: link 200, a senha e `falhas_login`/`bloqueado_ate` são regravados, a entrada continua 401). Efeito: quem administra redefine a senha justamente porque suspeita de comprometimento, e quem tiver um link vivo (até 30 minutos) retoma a conta. Exige posse de um link vivo, por isso não é crítico. Não é critério escrito da E10 (uso único e prazo valem). Conserto sugerido: `trocar_senha`, a redefinição por quem administra e a desativação marcam `recuperacoes_senha.usada_em`, e `consumir_recuperacao` confere `usuarios.ativo`. Dono provável: F03 (autenticação).
- **A2, anotado:** `notificadorDeArquivo` grava e-mail e link inteiros com o modo padrão do processo (`appendFile`, sem `mode`). Só existe fora de produção (provado pela recusa em `config.ts` e por M3); quem rodar em máquina compartilhada deixa um arquivo legível por outros usuários.
- **A3, anotado:** o teto por e-mail é em memória e por processo (já documentado em `apps/api/PENDENCIAS.md`).
- **A4, anotado:** o token viaja na URL do GET da página; `replaceState` limpa histórico e a política de referenciador fecha o vazamento para terceiros, mas o log de acesso da hospedagem do painel recebe a URL. Mitigado por uso único e prazo; não é defeito da etapa.

## Não verificado

- Corrida de uso único em PostgreSQL real: a sonda rodou em PGlite, que serializa; a garantia é o `SELECT ... FOR UPDATE` com `usada_em IS NULL` reavaliado (inspeção), não uma execução concorrente minha.
- O cabeçalho `Referrer-Policy: no-referrer` e o `X-Robots-Tag` servidos pela Vercel em produção (só o arquivo `vercel.json` e o teste que o lê).
- Tempo de resposta contra PostgreSQL real com rede (a medida foi em PGlite).
- Provedor de e-mail real (CP-19 adiado) e Firefox.
- O run do CI do SHA (não lido).

## Risco residual

A1 aberto: link vivo sobrevive à redefinição por quem administra, à troca pela própria pessoa e à desativação. Teto por e-mail por processo. Fora isso, a recuperação está sem oráculo, com token forte guardado como hash, uso único, prazo, log limpo e produção comprovadamente desligada.

## Motivo do humano

Ambiente externo inacessível: conferir, no primeiro deploy, que a Vercel serve `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` em `/recuperar-senha` e `/redefinir-senha` (inclusive com `?token=`). Nada mais desta dimensão depende de pessoa.
