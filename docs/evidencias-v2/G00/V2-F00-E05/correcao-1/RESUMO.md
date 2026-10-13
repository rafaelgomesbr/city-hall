# V2-F00-E05, correção 1: a renovação de conta desativada diz `conta_desativada`

Base: `4fcc241`, ramo `v2/f00`. Motivo: rodada 1 reprovada (QA e UX, SHA `7005a60`).

## Fatos

**O defeito provado.** Desativar pelo painel (`PATCH /usuarios/:id/situacao`) revoga as sessões. `sessao_por_token` não devolve sessão revogada, então `/auth/renovar` caía em `sessao_encerrada` (401) e nunca chegava ao ramo `conta_desativada`. O teste anterior desativava por `UPDATE` direto, sem revogar.

**O que mudou.**

- Migração nova `dc360/db/migrations/048_dono_do_token_diz_se_a_conta_esta_ativa.sql`: `dono_do_token` ganha a coluna de saída `usuario_ativo` (lê `usuarios.ativo` na mesma consulta). Nenhuma coluna de tabela, nenhuma policy, nenhuma função privilegiada a mais (teto de 27 intacto). `usuarios` está sob RLS e a renovação ainda não sabe o município, então a leitura não tinha outro caminho sem função nova.
- `apps/api/src/auth/servico.ts`: `derrubarSePossivelReuso` virou `tratarTokenRecusado`. Quando `sessao_por_token` não aceita o token, uma única chamada a `dono_do_token` decide: dono reconhecido com `usuario_ativo === false` leva `403 conta_desativada` (e as sessões continuam sendo revogadas, de forma idempotente); reuso de token rotacionado continua derrubando a família; o resto é `401 sessao_encerrada`. Token desconhecido não devolve linha e sai exatamente como antes.
- Motivo gravado: NÃO foi preciso. A sessão já traz `motivo_revogacao = 'usuario desativado'`, mas o estado é lido AGORA da conta, porque conta desativada e depois reativada tem sessões com esse motivo e está ativa.
- App de campo, `apps/campo/src/dados/token.ts`: constatado que NÃO lia a recusa (o `catch` engolia o 403, devolvia o token vencido, o servidor respondia 401 `nao_autenticado` e a fila pausava como `sessao_encerrada`). O obtentor agora guarda o 403 `conta_desativada` e o pedido forçado do transporte (`renovarJa`) lança `FalhaDeSessao("conta_desativada")`. O pedido comum segue sem lançar. A recusa vale para o token de renovação que a provocou e é reavaliada a cada tentativa nova.
- Painel, `apps/web/src/dados/http.ts`: já lia o 403 da renovação (sem mudança de código). Coberto por `sessao-e-entrada.test.ts` (caso existente) e pela nova seção 23c do e2e.
- Documentação: `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (decisão registrada), `dc360/docs/COLOCAR-DE-PE.md` (migração 048 sem ordem obrigatória) e `dc360/docs/RESTORE-DO-BANCO.md`; números de `README.md`, `apps/campo/LEIA-ME.md` e `COLOCAR-DE-PE.md` atualizados; `scripts/baseline.mjs` ganhou as contagens esperadas (API +6, pacote do campo +1, app +6).

**Testes novos.**

- API, `codigos-de-erro.test.ts`, describe "Renovar depois de desativar PELO ENDPOINT real": seis casos. Desativa e reativa pelo endpoint (`PATCH /usuarios/:id/situacao`) e encerra por `POST /usuarios/:id/encerrar-sessoes`. Positivos: 403 sem par novo e repetível; token já rotacionado. Negativos: token desconhecido, de conta inexistente e de conta ativa encerrada por administrador saem com corpo idêntico (`sessao_encerrada`); encerrada sem desativar continua `sessao_encerrada`; desativada e reativada volta a `sessao_encerrada`; entrar continua com a recusa genérica, igual à de e-mail inexistente.
- API, `api.test.ts` "desativar usuário derruba as sessões dele na hora": a asserção `401` virou `403 conta_desativada` (registrada).
- App, `token.test.ts`: seis casos. Pacote do campo, `pausa-de-sessao.test.ts`: um caso (o obtentor lança, o envio para como `conta_desativada` sem repetir o pedido).
- E2E do painel, seção 23c de `fluxo-api.e2e.mjs`: reativa o Marcos, abre a sessão dele, a coordenação o desativa pelo botão, o token de acesso dele é vencido, e a próxima escrita leva à entrada com "Sua conta foi desativada".

**Mordem (vermelho antes, verde depois).** API: 4 de 22 casos de `codigos-de-erro.test.ts` reprovam antes (`saidas/01`), 22 de 22 passam depois (`saidas/04`); os outros 2 casos novos são guardas que já passavam (encerrada sem desativar, reativada). App: 5 de 19 reprovam antes (`saidas/02`), 19 de 19 depois (`saidas/05`); o caso do pacote do campo já passava antes porque o transporte já propaga a falha (é guarda). E2E: com o `servico.ts` antigo, 3 verificações da 23c reprovam (`saidas/03`: 276 aprovadas, 3 falhas); depois 279 de 279 (`saidas/12`).

**Regressão.** `npm run test:api` 1283 de 1283 (98 arquivos); `npm run test:isolamento` 327 aprovados e 3 pulados (inalterado); `npm run test --workspace @dc360/web` 643 de 643; `npm run test:campo` 1867 de 1867 (127 suítes) mais o pacote do campo; `npm run test:e2e:api` Passou 279, Falhou 0; `npm run typecheck` código 0; `npm run conferir:numeros` 24 conferidas, 0 divergência; portão de conteúdo verde; `npm run test:scripts` 213 testes, 0 falha. Na primeira rodada completa da API houve 1 falha (`api.test.ts`, a asserção `401` antiga), consertada e registrada (`saidas/08`).

**O que a pessoa desativada vê de ponta a ponta.**

1. Token de acesso ainda vivo (até 15 minutos): a escrita responde 403 `conta_desativada` (como antes).
2. Depois do vencimento, painel e app renovam: 403 `conta_desativada`. Painel: tela de entrada com "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." (capturas). App: a fila pausa como `conta_desativada`, com a frase própria do aparelho.
3. Tentando entrar com e-mail e senha: a recusa genérica "Email ou senha inválidos", igual à de e-mail inexistente (`/auth/entrar` não mudou). Quem não tem credencial nunca distingue conta desativada de inexistente.
4. Conta reativada: a renovação antiga responde `sessao_encerrada`, e entrar funciona.

**Capturas reais** (`capturas/`): tela de entrada depois de renovação recusada por conta desativada, 1280 e 390 px, tema claro e escuro (4 imagens), geradas pela seção 23c com API e painel reais. Nada cortado, desalinhado ou grudado; aviso em tom de perigo com ícone e texto.

**Limitações.**

- App de campo: provado por teste de componente e de módulo (jest e vitest) e pela integração com o transporte; não há captura de aparelho nem de emulador desta correção, e o app Expo não renderiza no ambiente do agente.
- A leitura da recusa no app vale só para o pedido forçado do transporte da fila; telas que chamam `obterToken()` sem `renovarJa` seguem como antes.
- Tempo de resposta: o caminho de token desconhecido faz uma consulta a `dono_do_token`, como já fazia; o de token conhecido de conta desativada faz uma a mais (revogação idempotente). A diferença só é observável por quem tem o token. Não foi medida.
- A migração 048 não foi aplicada em Postgres 17 nem no job `restore` (só pelo CI); foi aplicada em PGlite (API) e no Postgres local 18 (`test:isolamento`).
- Contra um banco sem a 048 o código novo não quebra e a renovação volta a `sessao_encerrada`.
- Frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") continua diferente da do catálogo (achado anotado pelo QA, fora desta correção).

## Justificativa

A regra da etapa é que o cliente leia o código e não adivinhe: conta desativada manda parar e procurar a coordenação, sessão encerrada manda entrar de novo. Sem a correção, o caso mais comum (agente offline por mais de 15 minutos, aba parada) caía no código errado e a pessoa lia duas frases erradas seguidas, que era exatamente a confusão que a etapa existe para eliminar.

Quem apresenta um refresh token que o servidor reconhece já tem uma credencial emitida para aquela conta, então dizer que a conta foi desativada não entrega nada a um anônimo. A decisão fica no estado ATUAL da conta e não no motivo da revogação, para não mandar parar quem foi reativado. Token desconhecido continua sem linha e sem distinção de tempo relevante, e entrar e recuperar não mudaram, que é o que o red-team exigiu.

A migração foi necessária e é mínima: uma coluna de saída numa função que já existia, sem política nova, sem coluna de tabela e sem subir o teto de funções privilegiadas. Preferi isso a gravar um motivo novo na sessão (coluna ou texto), porque o motivo não sabe de reativação. O código tolera o banco sem a 048, o que deixa a ordem de implantação livre.

No app, a correção do servidor sozinha não bastava: o obtentor engolia a recusa da renovação. Corrigi no ponto onde a informação se perde, mantendo o contrato de que o pedido comum não lança.
