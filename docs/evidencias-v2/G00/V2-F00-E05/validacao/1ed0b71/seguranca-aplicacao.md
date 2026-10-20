---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: BLOCKED
confianca: media
humano_necessario: nao
escalar: tentativa independente de escape da guarda em tempo de execução não executada nesta sessão; repetir com outro validador
---
## Critérios verificados

Validação na árvore principal (HEAD `5044e7a`, produto idêntico a `1ed0b71`), Node v24.15.0.

- **Os três códigos emitidos e testados; catálogo no shared; nenhuma ocorrência de `sessao` como código** (DoD): `npx vitest run test/guarda-de-codigos-de-erro.test.ts test/codigos-de-erro.test.ts test/prova-dinamica-dos-codigos-de-erro.test.ts` em `apps/api`, 243 de 243, código 0. Inclui `nao_autenticado`, `sessao_encerrada` e `conta_desativada` por requisição real (`app.inject`), a renovação depois de desativar pelo endpoint real e a entrada genérica. PASS no que foi executado.
- **Teste negativo da etapa, "código fora do catálogo reprova o teste de catálogo"**, e a promessa de `dc360/README.md:148-151` (toda resposta 401 ou 403 do servidor tem código do catálogo, garantida pela guarda): a guarda morde (abaixo) e os dezessete escapes arquivados pela revisão da correção 3 saem todos "pego" contra este SHA. NÃO executei uma tentativa independente e nova de produzir 401 ou 403 fora do catálogo que passe pela guarda (status não inteiro, `reply.raw`, `hijack`, erro de validação, plugins, console), que é o que o gatekeeper pediu para esta dimensão. Por isso o veredito é BLOCKED, e não PASS.
- **`/auth/entrar` com conta desativada continua genérica**: caso "conta desativada com a senha CERTA recebe a mesma recusa da senha errada e do e-mail inexistente", verde.
- **Isolamento**: caso do par de isolamento (conta desativada de A escrevendo em ocorrência de B recebe `conta_desativada` sem confirmar nada sobre B), verde; `npm run test:isolamento` 345 aprovados e 3 pulados, código 0.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/seguranca-aplicacao/`:

- `e05-api.txt`: as três suítes da API acima, 243 de 243, código 0.
- `e05-console.txt`: `apps/console`, `test/guarda-de-codigos-de-erro.test.ts`, 15 de 15, código 0.
- `e05-guarda-desligada.txt`: prova de mordida (linha `instalarGuardaDeAcesso(app, {` de `apps/api/src/servidor.ts:385` trocada por `if (false) instalarGuardaDeAcesso(app, {`): 54 reprovam e 17 passam de 71, código 1. Restaurado com `git restore apps/api/src/servidor.ts`; rodada de novo, 71 de 71.
- `e05-escapes-arquivados.txt`: o arquivo exato da revisão (`docs/evidencias-v2/G00/V2-F00-E05/correcao-3/scripts/zz-revisao-escape.test.ts`), copiado para `apps/api/test/` só durante a execução e apagado depois: e01, e02, e04 a e07 e e09 a e18 "pego" nos dois modos (500 `desvio_do_catalogo_de_erro` em teste; 401 `nao_autenticado` ou 403 `sem_permissao` em produção); e08 continua 500 `erro_interno`. Código 0.
- `isolamento.txt`: `npm run test:isolamento`, 14 arquivos, 345 aprovados e 3 pulados, código 0.
- `test-api.txt`: `npm run test:api` completo com `DC360_POSTGRES_DE_PROVA` apontando para o cluster descartável Postgres 17.6: 106 arquivos, 1624 de 1624, nenhum pulado, código 0 (o `setupFiles` de "falha alto" reprovaria qualquer desvio da guarda saído na suíte inteira).

## Cenários positivos

- Os dez códigos do catálogo saem do servidor real com o status do catálogo (casos de execução de `codigos-de-erro.test.ts`).
- A prova dinâmica percorre as rotas registradas com os 12 perfis e passa pela guarda em modo "falhar" sem desvio (verde dentro do `test:api`).

## Cenários negativos

- Token vencido: 401 `nao_autenticado`; sessão encerrada: 401 `sessao_encerrada`; conta desativada (inclusive desativada pelo endpoint real, com sessões revogadas): 403 `conta_desativada` (casos verdes).
- `/auth/entrar` de conta desativada com senha certa: mesma recusa genérica da senha errada.
- Conta desativada de A contra recurso de B: mesma resposta que em recurso inexistente.
- Na sonda da E12 desta mesma sessão (relatório da E12), administradora desativada com token vivo em `POST /saida/pacote.zip`: 403 `conta_desativada`; token lixo: 401 `nao_autenticado`.

## Tentativas de reprovar

- Desliguei a guarda: o teste dela reprova 54 de 71 (morde).
- Rodei contra este SHA os dezessete escapes que derrubaram a primeira versão da guarda (incluindo `onRoute` de plugin acrescentando `onSend` depois, `setNotFoundHandler` de plugin e `onSend` que lança duas vezes): todos pegos.
- Conferi que o README declara o que a guarda não vê (escrita no socket, método do protótipo chamado por fora da instância, troca de primitivas antes da carga), em `dc360/README.md` logo depois da lista das três linhas de defesa, e no cabeçalho de `apps/api/src/guarda-de-codigos-de-erro.ts`.
- NÃO fiz: plantar formas novas de resposta 401 ou 403 para tentar passar pela guarda (status não inteiro, `statusCode` alterado entre `writeHead` e `end`, `hijack` com escrita direta, erro do próprio Fastify, plugin de terceiro, console). Esta é a parte adversarial central pedida para a dimensão, e ficou sem execução nesta sessão.

## Achados

1. **anotado.** `dc360/README.md:150-151` diz "Quem GARANTE isto é uma guarda em tempo de execução", e o parágrafo da prova dinâmica, no mesmo bloco, diz "a garantia de que nenhuma recusa de acesso sai fora do catálogo vem primeiro da varredura do fonte". As duas frases atribuem a garantia a peças diferentes. Reprodução: ler as duas passagens da seção "Códigos de erro de acesso". Não muda o comportamento.
2. **anotado.** A promessa "toda resposta 401 ou 403" convive com exceções declaradas (socket, protótipo chamado por fora, primitivas trocadas antes da carga), que a varredura cobre só por heurística. Está escrito; registro para o árbitro decidir se a palavra "toda" é compatível com o critério.

Nenhum achado que bloqueia foi encontrado no que executei; o veredito é BLOCKED pela parte não executada, não por defeito provado.

## Não verificado

- A tentativa adversarial independente contra a guarda (ver "Tentativas de reprovar"): não executada. Precisa de outro validador.
- Run do CI do SHA: ausente (H32).
- Painel e aplicativo de campo diante dos códigos (UX, acessibilidade, E06): fora desta dimensão aqui; `npm run test:campo` passou nesta sessão (1997 de 1997) por causa da E15.
- Validação humana das três frases (Rafael).

## Risco residual

O que rodou mostra a guarda viva, mordendo e pegando todos os escapes conhecidos. O risco que sobra é o de sempre numa garantia desse tipo: uma forma ainda não pensada de escrever a resposta sem passar por `writeHead`, `write` e `end` da instância. A guarda admite duas por escrito. Até alguém procurar outras de forma independente neste SHA, a promessa do README não tem prova adversarial desta rodada.

## Motivo do humano

não se aplica
