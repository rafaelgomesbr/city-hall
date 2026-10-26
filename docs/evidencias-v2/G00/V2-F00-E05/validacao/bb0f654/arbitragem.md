---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Conflito arbitrado: `qa.md` (FAIL) contra `seguranca-aplicacao.md`, `red-team.md` e `banco-de-dados.md` (PASS), rodada 4, todos em `bb0f654`. Árvore em `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`. Pasta das saídas: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/arbitragem-E05/` (abreviada como `$A`).

Critérios que decidem, com o texto exato do bloco da etapa (`docs/roadmap-v2/03-fase-00-estabilizacao.md:139`):

1. **Testes negativos:** "código fora do catálogo reprova o teste de catálogo." Resultado: **violado.** Hoje o servidor emite um 403 de permissão fora do catálogo e o teste está verde; sob mutação, um código novo emitido por literal ou por `RegraDeNegocio` com 403 também passa, inclusive o nome antigo `sessao`.
2. **Testes positivos (parte final):** "teste compara o catálogo do shared com o que o servidor emite." Resultado: **cumprido só em parte.** O teste compara os seis códigos do catálogo com respostas reais (mutação M4 morde), mas não compara o que o servidor emite fora dele: o leitor de fonte só olha `new FalhaAutenticacao("...")` e `readonly codigo = "..." as const`.
3. **Documentação escrita pela etapa** (`dc360/README.md:146` e cabeçalho de `dc360/packages/shared/src/codigos-de-erro.ts:22-25`, ambos de `5d6bc57`, 2026-10-06, commit que entregou a E05): "`apps/api/test/codigos-de-erro.test.ts` confere que o servidor emite exatamente ela (código novo fora da lista reprova)" e "confere que o servidor emite exatamente isto: código novo no servidor sem entrar aqui reprova". Resultado: **desmentida pelo código e pela mutação.** Pela regra aplicada nesta fase (VEREDITO das etapas E12 e E22, rodadas 1 a 3), documentação desmentida pelo código é FAIL da etapa que a escreveu.

Escopo, lido no texto da etapa e no próprio catálogo:

- O bloco da etapa lista seis códigos no catálogo, entre eles `sem_permissao` (403, recusa de permissão). O cabeçalho do catálogo define o próprio escopo: "Isto cobre só os erros de ACESSO (autenticação, vigência e permissão)". A premissa registrada (f) do STATUS diz "o catálogo cobre só os erros de acesso".
- `posto_insuficiente` (`dc360/apps/api/src/servidor.ts:609-611`, classe `PostoInsuficiente`) é recusa de PERMISSÃO: a pessoa gere usuários, mas não aquele usuário. É erro de acesso pela definição que a própria etapa escreveu. O código é anterior à etapa (`d1da562`, 2026-08-22), mas a etapa o deixou fora do catálogo sem lista de exclusão e afirmou que nada fica fora.
- A decisão não depende de escopo de produto: mesmo que `posto_insuficiente` fosse classificado como fora do catálogo por decisão, a frase "código novo no servidor sem entrar aqui reprova" continuaria falsa (mutações M1 e M2). Por isso não é BLOCKED para Rafael.
- O critério é de autorização com origem BZ-F:P0-SEG: está na lista da seção 7 de `28` (item 2) e não admite RISCO ACEITO.

Os PASS: `red-team.md` e `banco-de-dados.md` não olharam este ponto (só rodaram o arquivo de teste verde e mutações na vigência). `seguranca-aplicacao.md` afirma o contrário ("Tentativas de reprovar", item 4: "varri todas as rotas em todos os estados; nenhum 401 ou 403 com código fora da lista"), e essa afirmação é refutada pela execução abaixo (`posto-abaixo-do-seu.test.ts` verde exigindo `posto_insuficiente` em 403). Nenhum PASS traz prova que contradiga o FAIL.

## Evidência

Todos os comandos rodados em `dc360/apps/api` sobre a árvore de `0290af5`:

- `npx vitest run test/codigos-de-erro.test.ts` sem mutação: código 0, 22 de 22 (`$A/01-catalogo-base.txt`).
- Enumeração por `grep` de `code(401)`, `code(403)`, `new FalhaAutenticacao(`, `readonly codigo =` e de `RegraDeNegocio(...)` com 401 ou 403 em `apps/api/src`. Códigos emitidos com 401 ou 403:
  - do catálogo: `nao_autenticado` (`servidor.ts:563`, `auth/vigencia.ts:175`), `sessao_encerrada` (`auth/vigencia.ts:172`, `auth/servico.ts:468`, `:793`, `:824`, `:914`, `:1053`, `:1090`), `conta_desativada` (`auth/conta-desativada.ts:20`), `acesso_suspenso` (`auth/suspensao.ts:147`), `troca_de_senha_obrigatoria` (`servidor.ts:913`), `sem_permissao` (`servidor.ts:594`);
  - da entrada (lista `DA_ENTRADA` do teste): `credenciais`, `senha_provisoria_vencida` (`bloqueado` sai 429);
  - fora do catálogo e de qualquer lista: `posto_insuficiente` 403 (`servidor.ts:610`, permissão por posto), `posto_insuficiente_para_dado_pessoal` 403 (`rotas/prestacao-de-contas.ts:131-136`, `RegraDeNegocio`, permissão por posto), `email_so_por_administrador` 403 (`rotas/administracao.ts:329-334`, `RegraDeNegocio`, permissão por papel), `assinatura` 403 (`rotas/armazenamento-local.ts:30`, `:71`, URL assinada sem token). Os quatro são anteriores à etapa (`git blame`: 2026-08-21 a 2026-09-15).
- Prova comportamental de que `posto_insuficiente` sai do servidor: `npx vitest run test/posto-abaixo-do-seu.test.ts`, código 0, 7 de 7 (`$A/06-posto-emitido.txt`); `api.test.ts:990`, `:1020`, `:1039` exigem o mesmo código.
- Mutações (cada uma aplicada com `sed`, rodada e desfeita com `git restore`; `git status --short -- apps packages` vazio ao fim):
  - M1 (a do QA): `servidor.ts`, `send({ erro: "posto_insuficiente"` passou a `send({ erro: "inativo"`: código 0, **22 de 22 verdes** (`$A/02-M1-posto-vira-inativo.txt`).
  - M2: `rotas/administracao.ts`, o código do 403 `"email_so_por_administrador"` passou a `"sessao"` (o nome antigo que o teste diz não voltar): código 0, **22 de 22 verdes** (`$A/03-M2-regra403-vira-sessao.txt`).
  - M3: `auth/vigencia.ts`, `new FalhaAutenticacao("nao_autenticado"` passou a `"token_vencido"`: código 1, 2 reprovam, entre eles o leitor de fonte (`$A/04-M3-falhaautenticacao-nova.txt`).
  - M4: `servidor.ts:563`, `erro: "nao_autenticado"` passou a `"token_invalido"`: código 1, 1 reprova (positivo do token vencido) (`$A/05-M4-literal-401-novo.txt`).

## Cenários positivos

- Os seis códigos do catálogo saem do servidor real com o status prometido e o teste morde quando um deles muda de nome (M3 e M4). Esta parte do critério positivo está cumprida, e o FAIL do QA não a contesta.
- O leitor de fonte pega código novo declarado por `FalhaAutenticacao` ou por `readonly codigo = "..." as const` (M3).

## Cenários negativos

- Código fora do catálogo emitido por literal em `send({ erro })`: teste verde (M1). Critério negativo violado.
- Código fora do catálogo emitido por `RegraDeNegocio(..., 403)`: teste verde, mesmo com o texto `sessao` (M2). O cabeçalho do teste ("`sessao` (o nome antigo) não volta") também não se sustenta para esse caminho: a guarda só procura o literal `erro: "sessao"`.
- Estado atual, sem mutação: quatro códigos 403 fora do catálogo e de qualquer lista explícita, dois deles de permissão por posto, com o teste de catálogo verde.

## Tentativas de reprovar

Tentativas de reprovar o FAIL do QA (isto é, de mostrar que os PASS tinham razão):

1. Procurei se a etapa restringe o catálogo aos seis códigos nomeados de forma que `posto_insuficiente` ficasse legitimamente fora: o bloco lista seis códigos, mas o critério negativo é genérico ("código fora do catálogo"), e o catálogo se define como "autenticação, vigência e permissão". Não há lista de exclusão para permissão por posto; a única exclusão é `DA_ENTRADA` (três códigos da entrada).
2. Procurei decisão registrada que tire `posto_insuficiente` do catálogo: a premissa (f) só diz que o catálogo cobre erros de acesso, o que o inclui.
3. Procurei se algum PASS trouxe prova contrária: `seguranca-aplicacao.md` afirma varredura sem achado, mas não cita saída que a sustente, e o `grep` e `posto-abaixo-do-seu.test.ts` a refutam. `red-team.md` e `banco-de-dados.md` não trataram o ponto.
4. Conferi se o achado do QA dependia de uma mutação artificial: não; o estado atual já emite `posto_insuficiente`, e a mutação só mostra que o portão não reagiria a mais um código.
5. Conferi se o defeito é só de documentação (o que permitiria rebaixar): não; o critério negativo da etapa é sobre o teste, e o teste não reprova. A documentação agrava porque promete o que o teste não faz.
6. Conferi se a autoria da frase é de outra etapa: `git blame` atribui `README.md:146` e `codigos-de-erro.ts:22-25` a `5d6bc57`, e o texto cita "Até a V2-F00-E05"; a seção é da E05.

## Achados

1. **FAIL (critério negativo da etapa; documentação da etapa desmentida).** O teste de catálogo não reprova código fora do catálogo emitido por `send({ erro: "..." })` com 401 ou 403 nem por `RegraDeNegocio` com 401 ou 403; hoje `posto_insuficiente` (403, permissão) sai fora do catálogo com o teste verde. Severidade para o usuário hoje: baixa (o painel e o aplicativo tratam `posto_insuficiente` como erro comum, que é o certo). Severidade para a etapa: reprova, porque é o critério negativo escrito e a documentação que a etapa escreveu afirma o contrário; o catálogo é o contrato que E06, E07 e F02-E03 herdam. Conserto mínimo, sem implementá-lo aqui:
   - Portão: tornar a conferência abrangente para 401 e 403. Opção A (preferível): comportamental, um gancho `onSend` no servidor de teste que registre o `erro` de toda resposta 401 e 403 produzida pela suíte da API e um caso que exija catálogo ou lista explícita. Opção B: ampliar o leitor de fonte para `code(401|403).send({ erro: "..." })` e `new RegraDeNegocio("...", ..., 401|403)`, com casos de mordida para os dois padrões (incluindo o texto `sessao`).
   - Classificação: `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal` e `email_so_por_administrador` entram no catálogo ou numa lista explícita no teste, com o motivo de cada um; `assinatura` (URL assinada, sem token) idem.
   - Documentação: `README.md:146` e o cabeçalho de `codigos-de-erro.ts` passam a dizer exatamente o que o portão cobre.
   - Prova: a mutação M1 e a M2 devem reprovar depois do conserto.
2. **Não arbitrado, só confirmado (não estava em conflito):** o achado 2 do QA, `dc360/docs/GUIA-DO-COORDENADOR.md:162-163` (de `5d6bc57`), "ou por uma troca de papel", contradiz o comportamento atual descrito no próprio README (papel diferente dá `nao_autenticado` e a renovação resolve). Conserto mínimo: tirar a expressão. Entra junto na correção.

## Não verificado

- O run do CI (39143791434) não foi lido.
- Não reexecutei a suíte inteira da API nem o e2e; reexecutei só o arquivo do catálogo, `posto-abaixo-do-seu.test.ts` e as quatro mutações. Os demais critérios da etapa (os três códigos, entrada genérica, isolamento) não estavam em conflito e não foram rearbitrados.
- Não verifiquei por execução que `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura` saem em algum teste; a afirmação sobre eles é por leitura do código.
- `acessibilidade.md` e `ux.md` desta rodada não existiam quando arbitrei e não foram considerados.

## Risco residual

- Enquanto o portão não cobrir os dois caminhos de emissão, um código de acesso novo pode chegar ao painel, ao aplicativo e à fila sem passar pelo catálogo, e o cliente o trataria como erro comum (nunca como sessão morta, o que limita o dano).
- Coordenador que leia o guia esperará que rebaixar alguém o mande à tela de entrada.

## Motivo do humano

Nenhum para a arbitragem: a decisão se apoia em execução e no texto da etapa, e o conserto não depende de decisão de produto (qualquer classificação de `posto_insuficiente` exige o mesmo portão e a mesma correção de texto). A validação E4 da etapa (Rafael ler e aprovar as três frases da tela de entrada) continua pendente como já registrado, sem relação com este conflito.
