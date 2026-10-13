---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Critérios da etapa (seção E05 de `03-fase-00-estabilizacao.md`) e a prova de cada um.

1. Token vencido responde 401 `nao_autenticado`: PASS. `apps/api/test/codigos-de-erro.test.ts` verde (16 casos) e a sonda própria. Token adulterado e ausente também.
2. Sessão encerrada por administrador responde 401 `sessao_encerrada`: PASS. Sonda própria: `POST /usuarios/:id/encerrar-sessoes` e depois escrita com o token antigo deu `401 {"erro":"sessao_encerrada"}`.
3. Conta desativada responde 403 `conta_desativada`: PASS apenas enquanto o token de acesso está vivo (até 15 minutos). Ver achado 1 para o caminho de renovação.
4. `/auth/renovar` de conta desativada responde `conta_desativada`: FAIL pelo caminho real do produto. Ver achado 1.
5. Teste compara o catálogo do shared com o que o servidor emite: PASS. `codigos-de-erro.test.ts` (leitor de fonte) e `packages/shared/test/codigos-de-erro.test.ts` (10 casos) verdes.
6. `/auth/entrar` com conta desativada mantém a recusa genérica: PASS. Sonda própria: conta desativada, senha errada e e-mail inexistente deram o mesmo `401 {"erro":"credenciais","mensagem":"Email ou senha inválidos."}`, corpo idêntico byte a byte.
7. Isolamento: token de conta desativada do município A escrevendo em ocorrência do município B: PASS. A ocorrência real de B e um UUID inexistente deram a MESMA resposta (`403 conta_desativada`, nada sobre B). Conta ativa de A em ocorrência real de B: `404 nao_encontrada`, corpo idêntico ao de UUID inexistente.
8. Painel mostra frases diferentes para cada código: PASS. E2E seção 23 (11 OK) e capturas `capturas/entrada-{expirou,encerrada,desativada}-*`. Conferi `entrada-desativada-390-claro.png`: frase própria, ícone mais texto, manda procurar a coordenação.
9. App mostra frases diferentes: PASS por teste de componente (`pausa-da-fila.ts`, `fila-pausada-pela-sessao.test.tsx`, `falha-de-atualizacao.test.ts`), `npm run test:campo` 1861 de 1861. Sem aparelho nem emulador nesta rodada (ver Não verificado).
10. Nenhuma ocorrência do texto `sessao` como código: PASS. `ehCodigoDeErroDeAcesso("sessao")` é falso; sonda de leitura do servidor não achou emissão do código velho.
11. Catálogo completo (pedido pela rodada): o catálogo TEM `troca_de_senha_obrigatoria` (403, ação `trocar_a_senha`), `acesso_suspenso` e `sem_permissao`. O servidor emite `troca_de_senha_obrigatoria` (sonda: escrita com senha temporária deu 403 com esse código). Quem LÊ: o painel trata pelo fluxo de entrada (`senha-provisoria-regras.ts`), não pelo catálogo. O app só tem frase em `apps/campo/src/dados/api.ts` (`mensagemAmigavel`); a fila (`packages/campo/src/transporte.ts:81`) só reconhece `parar_e_avisar` e `entrar_de_novo`, então o 403 `troca_de_senha_obrigatoria` vira `FalhaPermanente` e o item fica `bloqueado` (`fila.ts`, `tratarFalha`). Confirma o que os outros validadores acharam. Achado 2.

## Evidência

- `npm run build:shared`: saída 0.
- API, 6 arquivos (`codigos-de-erro`, `vigencia-na-escrita`, `senha-provisoria`, `sessoes-da-conta`, `senha-e-sessoes`, `familia-da-sessao`): 100 de 100, saída 0. Arquivo: `scratchpad/api-e05-e09.txt`.
- Web inteiro (`vitest run`): 43 arquivos, 643 de 643, saída 0 (inclui `sessao-e-entrada.test.ts` 27). `scratchpad/web.txt`.
- `npm run test:campo`: 127 suítes, 1861 de 1861, saída 0. `scratchpad/campo.txt`.
- `npm run test:e2e:api` (Chromium, API e painel novos, Postgres local): 271 OK, 0 falha, zero erro de console, saída 0. Seção 23 inteira OK. `scratchpad/e2e-api.txt`.
- `npm run test:scripts`: 213, 209 passam, 0 falham, 4 pulados, saída 0.
- Sonda própria (arquivo temporário em `apps/api/test`, rodado e APAGADO; `git status --porcelain` limpo fora de `validacao/`): `scratchpad/sonda.txt`.
- CI 37739535524 em `gh run view`: sucesso, SHA `7005a60`, 9 de 9 jobs verdes.
- Capturas lidas: `capturas/entrada-desativada-390-claro.png`.

## Cenários positivos

- 401 `nao_autenticado` com token vencido, adulterado e ausente.
- 401 `sessao_encerrada` depois de o administrador encerrar as sessões (escrita e renovação).
- 403 `conta_desativada` na escrita, depois de desativar pelo endpoint real `PATCH /usuarios/:id/situacao`.
- Reativar e entrar de novo volta a funcionar.

## Cenários negativos

- Entrada: conta desativada, senha errada e e-mail inexistente indistinguíveis (status e corpo).
- Isolamento: conta ativa de A em ocorrência de B recebe 404 igual ao de id inexistente; conta desativada de A recebe o mesmo 403 para ocorrência de B real e inexistente (nada confirma B).
- Leitura com token vivo de conta desativada responde 200 (limitação declarada no RESUMO, F03-E03). Confirmei: `GET /ocorrencias?status=ativas` deu 200 depois de desativada. Não é achado novo.

## Tentativas de reprovar

1. Desativei pelo endpoint real do produto e não por `UPDATE` direto (que é o que o teste do implementador faz) e depois chamei `/auth/renovar` com o token de renovação da pessoa desativada. Resultado: `401 {"erro":"sessao_encerrada","mensagem":"Sessão expirada. Entre novamente."}`, e não 403 `conta_desativada`. Quebrou o critério 4. Achado 1.
2. Tentei fazer a recusa de entrada vazar o estado da conta (desativada contra inexistente contra senha errada): não vazou.
3. Tentei fazer o 403 `conta_desativada` confirmar existência de recurso de B: não confirmou.
4. Tentei fazer o catálogo ficar incompleto: o teste de leitor de fonte e a inspeção mostram os seis códigos emitidos. Mas o app não honra `trocar_a_senha` (achado 2).
5. Mutação do contrato: não alterei código de produto nesta etapa.

## Achados

1. BLOQUEIA. `conta_desativada` não chega ao cliente depois que o token de acesso vence, justamente o caso para o qual o catálogo foi criado.
   - Reprodução: (a) entrar como operador de Serra Alta; (b) coordenação chama `PATCH /usuarios/:id/situacao {"ativo":false}`; (c) com o token de acesso ainda vivo a escrita dá `403 conta_desativada` (correto); (d) com o token de renovação do mesmo aparelho, `POST /auth/renovar` dá `401 sessao_encerrada` ("Sessão expirada. Entre novamente."); (e) `POST /auth/entrar` dá a recusa genérica "Email ou senha inválidos".
   - Esperado (critério da etapa): "`/auth/renovar` de conta desativada (`servico.ts:506`) responde `conta_desativada`", e o cliente "para e avisa".
   - Causa: `servico.ts` ramo `!sessao.ativo` (linha 627) só é alcançado quando a sessão não foi revogada, mas a desativação pelo produto chama `revogar_sessoes_do_usuario` (`administracao.ts:257`), e `sessao_por_token` não devolve sessão revogada, então cai em `if (!sessao)` (linha 622) e sai `sessao_encerrada`. O teste do implementador desativa por `UPDATE usuarios SET ativo=false` sem revogar sessões, estado que o produto nunca produz.
   - Dano: o agente de campo desativado que fica mais de 15 minutos sem sinal (o app é offline-first) volta, o app tenta renovar (ao receber o 401 do token vencido, `pedir` em `transporte.ts`), recebe `sessao_encerrada`, mostra "entre de novo", e ao entrar vê "Email ou senha inválidos". A pessoa nunca descobre que a conta foi desativada. É a mesma confusão que a etapa quer eliminar. O painel idem: aba parada mais de 15 minutos mostra "Sua sessão foi encerrada", não "Sua conta foi desativada". O E2E seção 23 só cobre a janela de 15 minutos.
   - Dono: V2-F00-E05. Falta teste que desative pelo caminho do produto e renove.
2. CORRIGE ANTES DE CRESCER. O catálogo declara `troca_de_senha_obrigatoria` com ação `trocar_a_senha`, e nenhum cliente a lê pelo catálogo. No app, a fila trata o 403 como recusa permanente: item `bloqueado` com opção de descartar uma coleta boa. Reprodução: entrar no app com senha provisória (a que a E09 agora entrega ao agente), coletar e sincronizar. Evidência: `packages/campo/src/transporte.ts:80-83` e `fila.ts` `tratarFalha`; teste `pausa-de-sessao.test.ts` só cobre `conta_desativada`, `sem_permissao` e 403 sem código. Dono principal: E06 e E07, mas o contrato do catálogo (E05) afirma uma ação que ninguém cumpre.
3. ANOTADO. `/auth/renovar` e o link de redefinição inválido usam o mesmo código `sessao_encerrada` para situações opostas (sessão da pessoa contra link de e-mail); o implementador contornou no painel com `mandouToken`. Reuso do código é dívida para a F02-E03.
4. ANOTADO. A mensagem de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da mensagem do catálogo para `sessao_encerrada` ("Sua sessão foi encerrada ou o seu cadastro mudou..."). O cliente decide pelo código, então não quebra, mas o corpo não é o do catálogo.

## Não verificado

- App de campo em aparelho ou emulador: o APK em `apps/campo/android/` é anterior às E06 a E16 e o Expo não renderiza aqui. Só teste de componente.
- Firefox e WebKit no e2e (rodei só Chromium; o CI roda o job de navegador).
- Postgres 17 (local é 18.3; o CI cobre).
- `npm run test:isolamento` não rodei: a etapa não mexeu em banco e o job do CI está verde. O isolamento exercitado foi o de API.
- Leitura de todas as 12 capturas: li uma (390 claro, desativada).

## Risco residual

- A janela de 15 minutos de leitura com token de conta desativada (F03-E03) segue aberta, declarada.
- Se o achado 1 for corrigido devolvendo `conta_desativada` a quem apresenta renovação já revogada, avaliar o vazamento de estado: a decisão deve ficar com a segurança.

## Motivo do humano

Portão visual com Rafael obrigatório (tela pública): ele precisa ler as três frases e aprovar. Mensagem é conteúdo de produto.
