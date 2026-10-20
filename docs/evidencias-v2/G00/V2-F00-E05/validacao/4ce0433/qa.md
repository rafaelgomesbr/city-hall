---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Todos os comandos foram rodados por mim no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`) ou num worktree meu destacado em `4ce0433` (sparse, só `dc360/`, `node_modules` por link simbólico). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L13-qa/saidas/` (abaixo, `saidas/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Positivo: token vencido responde 401 `nao_autenticado` | PASS | `codigos-de-erro.test.ts` 116 de 116 (`saidas/e05-01-catalogo-e-dinamica.txt`) |
| Positivo: sessão encerrada por administrador responde 401 `sessao_encerrada` | PASS | idem, describe "Renovar depois de desativar PELO ENDPOINT real" e casos de emissão; e2e seção 23 "sessao encerrada leva a tela de entrada" (`saidas/e2e-01-api-chromium.txt`) |
| Positivo: conta desativada responde 403 `conta_desativada` | PASS | idem; e2e 23 e 23c "token vencido + conta desativada leva a tela de entrada ... diz que a conta foi desativada" |
| Positivo: teste compara o catálogo do shared com o que o servidor emite | PASS | varredura (116 casos) e prova dinâmica (1 caso, 114 pares, 12 perfis), 117 de 117 |
| Negativo: `/auth/entrar` com conta desativada mantém a recusa genérica | PASS | caso "conta desativada com a senha CERTA recebe a mesma recusa da senha errada e do e-mail inexistente"; e2e 23 "a entrada continua com a recusa generica" |
| Negativo: código fora do catálogo reprova o teste de catálogo | PASS com achado | 9 mutações minhas nas formas naturais reprovam (abaixo); 4 formas que escondem o código pelo texto passam (achado A1, dentro da classe declarada como não presa) |
| Autorização e isolamento: conta desativada de A escrevendo em ocorrência de B recebe `conta_desativada` sem confirmar B; 404 de outro município não muda | PASS | casos "Isolamento: a conta desativada não confirma nada sobre outro município" (dois) no `test:api` (`saidas/reg-01-test-api.txt`) |
| Regressão: `npm run test:api` | PASS | 104 arquivos, 1451 aprovados, 34 pulados (todos em `renovacao-contra-encerramento.test.ts`, que pede Postgres real), código 0 |
| Regressão: `npm run test:isolamento` | PASS | 345 aprovados, 3 pulados, código 0 (`saidas/reg-03-isolamento.txt`) |
| Regressão: `npm run test --workspace @dc360/web` | PASS | 44 arquivos, 669 de 669, código 0 (`saidas/reg-02-test-web.txt`) |
| Regressão: `npm run test:campo` | PASS | 1932 de 1932, código 0 (`saidas/reg-03-test-campo.txt`); pacote do campo 231 de 231 |
| Regressão: `apps/api/test/superficie.test.ts` | PASS | 9 de 9 dentro do `test:api` |
| E2E: desativar um usuário e ver a próxima chamada dele levar à entrada com a frase certa | PASS | `node scripts/e2e-api.mjs chromium` no worktree: "Passou: 288 Falhou: 0", geometria 64 de 64, código 0, seção 23 inteira OK (`saidas/e2e-01-api-chromium.txt`); em Firefox, "Passou: 288 Falhou: 0", 64 de 64, código 0, seção 23 OK (`saidas/e2e-02-api-firefox.txt`) |
| DoD: nenhuma ocorrência do texto `sessao` como código | PASS | grep em `apps`, `packages`, `db`, `scripts`: só o discriminador `tipo: "sessao"` do resultado da entrada no painel e os testes que provam que `sessao` não é do catálogo |
| DoD: catálogo no shared | PASS | `packages/shared/src/codigos-de-erro.ts`, 10 códigos, testes do shared 185 de 185 |

## Evidência

- `npx vitest run test/codigos-de-erro.test.ts test/prova-dinamica-dos-codigos-de-erro.test.ts` (apps/api): código 0, 117 de 117. `saidas/e05-01-catalogo-e-dinamica.txt`.
- `npm run test:api`: código 0. `saidas/reg-01-test-api.txt`.
- `npm run test --workspace @dc360/web`: código 0. `saidas/reg-02-test-web.txt`.
- `npm run test --workspace @dc360/shared` 185 de 185, `@dc360/campo` 231 de 231, `npm run test:campo` 1932 de 1932, `npm run test:console` 259 de 259, `npm run test:isolamento` 345 e 3 pulados: todos código 0. `saidas/reg-03-*.txt`.
- `node scripts/e2e-api.mjs chromium` (worktree, portas 3691 e 4691): código 0. `saidas/e2e-01-api-chromium.txt`.
- Mutações: `mutacoes/rodar.mjs` e `mutacoes/runtime.mjs` no diretório de trabalho; saídas por mutação em `saidas/e05-mutacoes/` (`00-RESULTADOS.txt`, `01-RESULTADOS-runtime.txt`). O arquivo mutado foi sempre restaurado; `git status` do worktree limpo depois de cada rodada.
- Varredura do fonte real pelas formas que escapam: `saidas/e05-02-homonimos-no-fonte-real.txt` (0 achados).
- Typecheck da API com as quatro formas que escapam aplicadas juntas: código 0 (`saidas/e05-03-typecheck-com-E1-E4.txt`), ou seja, o CI também não as pegaria pelo tipo.

## Cenários positivos

- Os três códigos novos saem do servidor real com o status do catálogo, inclusive a renovação de conta desativada pelo endpoint real (403 repetível, sem par novo) e o token já rotacionado.
- Os dez códigos do catálogo são emitidos por requisição; os quatro códigos que a rodada 4 achou fora da lista (`posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador`, `assinatura`) estão no catálogo e saem do servidor com a frase do catálogo.
- Painel: e2e seção 23 mostra "Sua sessão foi encerrada" e "Sua conta foi desativada" na tela de entrada, token apagado, aviso de perigo na desativada.

## Cenários negativos

Mutações que escrevi, uma de cada vez, no handler `POST /orgaos` do worktree, atrás de um cabeçalho que a prova dinâmica não manda (para isolar a varredura):

| Mutação | Varredura | Leitura |
| --- | --- | --- |
| S1 `resposta.code(403).send({ erro: "fora_do_catalogo" })` | reprova (1 falha cita o código) | morde |
| S2 `throw new RegraDeNegocio("fora_do_catalogo", "x", 403)` | reprova | morde |
| S3 `resposta.code(401).send({ erro: "token_vencido" })` | reprova | morde |
| S4b subclasse local de `RegraDeNegocio` com `super("fora_do_catalogo", "x", 403)` | reprova | morde |
| S5 auxiliar `negarSonda(resposta, "fora_do_catalogo")` com o código por parâmetro | reprova (código calculado) | morde |
| S6 status condicional `code(cond ? 200 : 403)` | reprova | morde |
| S7 `resposta.code(403)?.send(...)` | reprova | morde |
| E5 `resposta.code(403).send.call(resposta, {...})` | reprova (`.code` órfão) | morde |
| D1 constante mutada, alcançável sem token, em `GET /orgaos` | a prova dinâmica reprova ("GET /orgaos como semToken: 401 fora_do_catalogo") | morde pela segunda linha |

`/auth/entrar` com conta desativada: mesma recusa da senha errada e do e-mail inexistente (caso da suíte e e2e 23).

## Tentativas de reprovar

1. A rota nova com código fora do catálogo pedida pelo gatekeeper: as formas diretas (`send({erro})` literal, `RegraDeNegocio` 403, `FalhaAutenticacao`, subclasse, auxiliar, status calculado) reprovam. O defeito decisivo da rodada 4 está consertado.
2. Quatro formas que ESCAPAM das duas guardas quando a resposta só sai num estado que a prova dinâmica não cria (comprovado em execução: a mesma rota responde `403 {"erro":"fora_do_catalogo"}` e as duas suítes ficam verdes, `saidas/e05-mutacoes/*.runtime.txt`):
   - E1: `const corpo = { erro: "sem_permissao" }; corpo.erro = "fora_do_catalogo"; return resposta.code(403).send(corpo);` A varredura resolve a constante pelo inicializador e não vê a mutação de `.erro` (só vigia atribuição a `.codigo`).
   - E2: o mesmo com `let` reatribuído a um objeto novo.
   - E3: `const corpo = { erro: "fora_do_catalogo" }` logo acima de `send(corpo)`, com outra `const corpo = { erro: "sem_permissao" }` em outra função do mesmo arquivo. O mapa de constantes da varredura (`varredura-de-erros.ts`, `coletar`) é por arquivo e sem escopo: o último homônimo vence, e a emissão é lida como `sem_permissao`.
   - E4: `resposta["code"](403)["send"]({ erro: "fora_do_catalogo" })`. Acesso por colchete não é cadeia nem `.code` órfão para a varredura.
   As quatro passam no typecheck da API.
3. Procurei essas quatro formas no fonte real (API, shared, console): 0 ocorrências. Hoje nenhuma recusa sai fora do catálogo por esses caminhos.
4. Procurei o código antigo `sessao` como código de erro: não existe.
5. Conferi se a frase do README e do cabeçalho do catálogo cobre o que achei: o parágrafo "O que NENHUM deles prende" declara "uma recusa que só sai com um corpo ou um estado que os perfis da prova dinâmica não criam E que o texto esconde", e as quatro formas cabem aí. Mas duas frases do mesmo texto ficam inexatas: "Lê `send({ erro })` literal ou por constante" (E1 a E3 são lidas ERRADO, não deixam de ser lidas) e "O que ela não consegue ler, ela reprova" (E4 não é lida e não reprova).

## Achados

- A1 (corrige antes de crescer): a varredura do catálogo aceita como do catálogo uma resposta 403 com código fora dele nas formas E1 a E4 acima, e a prova dinâmica não as alcança quando o estado não é criado pelos 12 perfis. Reprodução: aplicar o trecho E3 em `apps/api/src/rotas/orgaos.ts` (saída `saidas/e05-mutacoes/E3-constante-sombreada-por-homonimo.varredura.txt`, 116 de 116, e `.runtime.txt`, `403 {"erro":"fora_do_catalogo"}`). Conserto barato: resolver a constante pela declaração em escopo (há `resolverDeclaracao` no mesmo arquivo), reprovar atribuição a `.erro` e `send`/`code` por colchete, e ajustar as duas frases do README e do cabeçalho. Não decide o critério: a classe está declarada como não presa e o fonte real não usa nenhuma das formas.
- A2 (anotado): a frase do 401 de `/auth/renovar` difere da frase padrão do catálogo, já anotada em rodadas anteriores; fora do que esta correção prometeu.

Motivo do veredito da rodada 4, item a item:
- "403 `posto_insuficiente` e outros fora do catálogo": CONSERTADO. Os quatro entraram no catálogo com status 403 e ação `nenhuma`; casos de execução por requisição passam; os clientes caem onde já caíam (painel 669 de 669, pacote do campo 231 de 231).
- "o teste de catálogo não morde código novo em `send({erro})` e em `RegraDeNegocio` com 403": CONSERTADO nas formas naturais (S1 a S7, E5 reprovam; D1 reprovado pela prova dinâmica). Resta o achado A1, em formas que escondem o código pelo texto.
- "desmente `README.md:146` e o cabeçalho do catálogo": CONSERTADO em grande parte. O README (agora a seção "Códigos de erro de acesso", linhas 145 a 252) e o cabeçalho dizem o que cada guarda prende e o que nenhuma prende, com os números da prova dinâmica (114 pares, 112, 48, 66, 2), que o piso do próprio teste confere e que passou. As duas frases citadas em A1 ainda prometem um pouco mais do que a varredura faz.

## Não verificado

- App de campo em aparelho ou emulador (a etapa não pede; o jest do app passou).
- CI do SHA: ausente nesta sessão (gh sem login), não é a evidência mínima de QA.
- O texto das três frases da tela de entrada como conteúdo de produto: é validação humana.

## Risco residual

Uma rota futura que monte o corpo do 403 por constante mutada, homônima ou por colchete passa pelas duas guardas sem aviso, e o cliente leria o código como erro comum (ação `nenhuma`), o que é o comportamento seguro para código desconhecido. O impacto é perda de contrato, não vazamento. A leitura com token vivo de conta desativada continua por até 15 minutos (F03-E03), declarada.

## Motivo do humano

A etapa pede que Rafael leia e aprove as três frases mostradas ao usuário na tela de entrada (sessão expirada, encerrada e conta desativada): é conteúdo de produto, e nenhum teste decide se a frase é a certa.
