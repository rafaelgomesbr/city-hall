---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, LGPD, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `SCRATCH/validadores/qa-r6/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`). Árvore principal em `5044e7a`, produto idêntico a `1ed0b71`.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 8 casos de `seguranca-da-conta.test.ts` verdes | atende | dentro de `12-test-web.txt` (688 de 688, 45 arquivos, código 0) |
| Administrador redefine a senha de um operador e o login com a temporária exige a troca | atende | `34-sonda-e09-temporaria.txt`: redefinição 200 com `senhaTemporaria`; a sessão antiga não renova (401 `sessao_encerrada`); entrar com a temporária devolve `trocaDeSenhaObrigatoria: true`; escrita 403 `troca_de_senha_obrigatoria`; troca 200; a definitiva entra. E2e seção 26 |
| `GET /auth/sessoes` marca a sessão atual, sem IP e sem user-agent completo | atende | `33-sonda-e09-api.txt`: exatamente uma com `atual: true`, `aparelho: "Chrome em macOS"`, nenhum trecho do user-agent enviado nem IP no corpo |
| Encerrar "as outras" mantém a de onde se clicou | atende | `33-...`: a sessão de onde se clicou renova (200), a outra 401 `sessao_encerrada`; e2e seção 26 (segundo navegador cai, a tela continua) |
| Negativo: coordenador não vê os botões em usuário de posto igual ou maior | atende | e2e seção 26 ("a coordenadora ve os botoes em operador e agente, e em mais ninguem"); `apps/api/test/posto-abaixo-do-seu.test.ts` 7 de 7 (`10`) e `usuarios-regras.test.ts` e `sessoes-e-senha-temporaria.test.ts` do web verdes (`12`) |
| Negativo: a API recusa `autoredefinicao` e `autoencerramento` (422), inclusive com o id escrito de outro jeito (o FAIL da rodada 4) | atende | `33-...`: id próprio em maiúsculas, caixa mista e com hífens codificados: 422 com o código da recusa nas três rotas (inclusive `autodesativacao`); entre chaves, sem hífens, `urn:uuid:`, com espaço: nunca 200; a conta intacta (segunda sessão viva, senha igual). Mordida: sem a normalização, 6 de 13 casos de `id-da-propria-conta.test.ts` reprovam (`22-mutacao-e09-sem-normalizar.txt`), restaurado com `git restore` |
| Negativo: `GET /usuarios/:id/sessoes` de posto acima responde 403 `posto_insuficiente` | atende | `33-...`: coordenadora pede sessões da administradora e tenta redefinir a senha dela, 403 `posto_insuficiente` nos dois |
| Isolamento: coordenador de A pede redefinir senha de usuário de B: 404; `GET /usuarios/:id/sessoes` de B com token de A: 404 | atende | `33-...`: coordenador de Vale Fundo sobre usuário de Serra Alta, 404 nas três rotas, corpo idêntico ao de id inexistente |
| Autorização: agente chama as três rotas: 403 `sem_permissao` | atende | `33-...`: agente e operadora, 403 `sem_permissao` em `GET /usuarios/:id/sessoes`, `redefinir-senha` e `encerrar-sessoes`; e2e seção 26 |
| A troca de senha em voo não vence a redefinição por quem administra (FAIL da rodada 4) | atende | `20-corrida-postgres17.txt`, Postgres 17.6 real (`DC360_POSTGRES_DE_PROVA`, cluster descartável): casos 7, 11, 21 e 28 de `renovacao-contra-encerramento.test.ts` verdes, 60 de 60, nenhum pulado |
| Correção 4 (arbitragem da rodada 5: frase da senha atual, aviso sobre a janela, email quebrado) | atende | `layout-estreito.e2e.mjs` 149 de 149, zero erro de console (`40-e2e-api-chromium.txt`); mordida da frase: com o texto antigo sem acento, 2 de 21 reprovam (`23-mutacao-e09-c4-frase-sem-acento.txt`), restaurado |
| Regressão obrigatória | atende | web 688 (`12`); `test:api` 1590 aprovados, 34 pulados, código 0 (`10`); `superficie.test.ts` 9 de 9 e `paridade-dos-modos.test.ts` 10 de 10 dentro das suítes |
| E2E: administradora redefine a senha da agente, a agente entra com a temporária, troca, a sessão antiga cai; "encerrar minhas outras sessões" derruba um segundo navegador | atende | `40-...` seção 26, 49 verificações OK |
| DoD: botões e listagem nos dois modos; nenhuma rota nova sem permissão | atende | `paridade-dos-modos.test.ts` verde; as duas rotas novas recusam sem token e com papel errado (`33`, e a prova dinâmica de E05 no `test:api`) |
| Validação humana (Rafael faz o fluxo e confere a frase da senha única) | pendente | fora do alcance do validador |

## Evidência

- `npm run test --workspace @dc360/web`: código 0, 688 de 688 (`12-test-web.txt`).
- `npm run test:api`: código 0, 1590 aprovados, 34 pulados (`10-test-api.txt`); `id-da-propria-conta.test.ts` 13, `sessoes-da-conta.test.ts` 27, `superficie.test.ts` 9.
- `DC360_POSTGRES_DE_PROVA=<URL de conexão do cluster descartável> npx vitest run test/renovacao-contra-encerramento.test.ts test/recuperacao-morre-com-a-credencial.test.ts`: código 0, 60 de 60 (`20-corrida-postgres17.txt`; Postgres 17.6 em 127.0.0.1:55871, derrubado e apagado no fim).
- `npm run test:e2e:api` (Chromium): código 0, 288 e 149 aprovadas, zero erro de console (`40-e2e-api-chromium.txt`).
- Sondas HTTP contra API própria (PGlite, porta 3795): `33-sonda-e09-api.txt` (40 de 40) e `34-sonda-e09-temporaria.txt`. Scripts: `sonda-e09.mjs`, `sonda-e09-temporaria.mjs`.
- Mutações restauradas com `git restore` e conferidas com `git diff --stat` vazio: `22` (normalização do id) e `23` (frase sem acento).

## Cenários positivos

- Redefinição por quem administra: temporária uma vez, sessões da pessoa caem, login com a temporária só alcança a troca (`34`, e2e 26).
- Encerrar as próprias outras sessões mantém a atual (`33`, e2e 26).
- Administradora lê as sessões de outra pessoa: só id, quantidade e datas (`{"id":..., "sessoesAbertas":3, "ultimaEntradaEm":..., "validaAte":...}`, `33`).
- O id de outra pessoa em maiúsculas continua valendo para a redefinição (caso de `id-da-propria-conta.test.ts`, verde).

## Cenários negativos

- Sete formas do próprio id nas três rotas sobre a própria conta: nenhuma 200 (`33`).
- Município alheio: 404 idêntico ao inexistente nas três rotas (`33`).
- Posto acima: 403 `posto_insuficiente` (`33`).
- Agente e operadora: 403 `sem_permissao` nas três rotas (`33`).
- Corrida da troca em voo contra a redefinição, em Postgres real (`20`).

## Tentativas de reprovar

1. Variações do identificador além das do implementador: hífens codificados como `%2D` em maiúsculas (o roteador decodifica e o esquema normaliza: 422 `autoredefinicao`), `urn:uuid:`, chaves, sem hífens, espaço codificado. Nenhuma passou.
2. Procurei outra recusa sobre a própria conta comparando texto: `grep` de `=== quem.usuarioId` e `!== quem.usuarioId` em `apps/api/src/rotas`. Só as três de `administracao.ts` recusam ato sobre si mesmo, e as três usam o id normalizado pelo `idSchema`; as demais recusam autor divergente (falham para o lado seguro).
3. Tentei ver IP ou user-agent na listagem mandando user-agents com marcadores próprios (`navegador-A`, `navegador-B`): nenhum aparece no corpo.
4. Encerrar as outras e conferir que a sessão atual sobrevive pela renovação (não só pela tela).
5. Mordida dos consertos: desfiz a normalização (6 vermelhos) e a frase acentuada (2 vermelhos).

## Achados

1. **anotado.** A administradora lê pelo `GET /usuarios/:id/sessoes` a data da última entrada de outra pessoa (`ultimaEntradaEm`); é o que a etapa pede ("só quantidade e datas"), registrado para a dimensão LGPD.
2. **anotado.** A frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da do catálogo; herdado de E05, não afeta esta etapa.

Nenhum achado que bloqueia.

## Não verificado

- Só Chromium no e2e; Firefox e WebKit não rodados nesta validação.
- Leitor de tela real (anúncio do aviso por `role=status`): só pelo atributo, no e2e.
- A corrida em Postgres 16 (o do CI): rodei em 17.6; CI ausente (H32).
- Não refiz as capturas de tela; o portão visual é das dimensões UX e acessibilidade.

## Risco residual

A senha temporária continua conhecida por quem a sorteou durante 72 horas (IDN-18, declarado em `PENDENCIAS.md`). A proteção contra agir sobre a própria conta depende do esquema do id em `administracao.ts`; rota nova com recusa sobre si mesma fora desse arquivo precisaria repetir a normalização.

## Motivo do humano

A etapa pede que Rafael faça o fluxo no painel e confira a frase da senha única e as confirmações (conteúdo de produto); isso não é verificável por execução.
