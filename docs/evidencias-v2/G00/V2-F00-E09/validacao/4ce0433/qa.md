---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Execução nesta sessão, worktree destacado em `4ce0433`, API real (`npx tsx src/index.ts`) sobre Postgres 17.6 descartável com os papéis do job `implantavel`, e o painel em Playwright. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L04-qa/out/` (abaixo, `out/`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Critério decisivo da rodada 4, defeito 1: o próprio id em outra caixa burla a recusa sobre a própria conta | `scripts/sonda-criterios.mjs` (`out/11`, linhas `[E09]`), API real e Postgres 17.6; `id-da-propria-conta.test.ts` 13 de 13 (`out/05`) | redefinir-senha e encerrar-sessoes com o próprio id em minúsculas, MAIÚSCULAS e caixa mista: 422 `autoredefinicao` e 422 `autoencerramento`, sem temporária; desativar: 422 nas três; cinco formatos alternativos (chaves, sem hífens, `urn:uuid:`, espaço, quebra de linha): 422, nunca 200; a administradora continua entrando e com a sessão de pé. CONSERTADO |
| Critério decisivo da rodada 4, defeito 2: a redefinição por quem administra perde para uma troca em voo | `scripts/sonda-troca-em-voo.mjs`, cenário redefinição: 25 rodadas sorteadas (`out/10`, `out/12`) e 20 com a redefinição inteira dentro da janela da troca (`out/13`, `out/14`) | 45 de 45 sem defeito; nas 24 em que a redefinição coube dentro da troca, a troca foi recusada (401 `sessao_encerrada`), a temporária entrou e a senha do invasor não. Controle com o `trocarSenha` de `bb0f654`: 8 de 8 com defeito (`out/22`). CONSERTADO |
| Positivo: os 8 casos de `seguranca-da-conta.test.ts` | `npm run test --workspace @dc360/web` (`out/06`) | 8 de 8; suíte do painel 44 arquivos, 669 de 669, código 0 |
| Positivo: administrador redefine a senha de um operador e o login com a temporária exige a troca | `out/11`; e2e seção 26 (`out/15`, `out/20`) | 200 com a temporária; a sessão antiga cai; escrita com a temporária 403 `troca_de_senha_obrigatoria`; a senha anterior não entra; no painel a tela pede a senha nova antes de qualquer outra |
| Positivo: `GET /auth/sessoes` marca a sessão atual | `out/11`; e2e seção 26 | 3 sessões, exatamente uma com `atual: true`; campos `entrouEm`, `validaAte`, `aparelho`, `atual`, sem IP e sem user-agent |
| Positivo: encerrar "as outras" mantém a de onde se clicou | `out/11`; e2e seção 26 ("encerrar minhas outras sessões" derruba um segundo navegador) | a de onde se clicou renova; as outras duas 401; no painel o segundo navegador cai e o token dele leva 401 `sessao_encerrada` |
| Negativo: coordenador não vê os botões em posto igual ou maior | `posto-abaixo-do-seu.test.ts` 7 de 7 (`out/05`); e2e seção 26; `out/11` | botões só em operador e agente; a API recusa a coordenadora sobre a administradora (403 `posto_insuficiente` em redefinir e encerrar) e sobre outra coordenadora (403) |
| Negativo: a API recusa `autoredefinicao` e `autoencerramento` (422) | `out/11` | 422 nas três caixas |
| Negativo: `GET /usuarios/:id/sessoes` de posto acima | `out/11` | 403 `posto_insuficiente` |
| Isolamento: A pede redefinir a senha de usuária de B | `out/11` | 404 (também com o id de B em maiúsculas, e pela coordenadora de A); a usuária de B continua entrando |
| Isolamento: `GET /usuarios/:id/sessoes` de B com token de A | `out/11` | 404; encerrar as sessões de B com token de A também 404 |
| Autorização: agente chama as três rotas | `out/11`; e2e seção 26 | 403 `sem_permissao` nas três |
| DoD: nenhuma rota nova sem permissão | `superficie.test.ts` 9 de 9 (`out/01`, `out/05`); sondas sem token | `GET /auth/sessoes`, `GET /usuarios/:id/sessoes` e `POST .../redefinir-senha` sem token ou com token adulterado: 401 |
| DoD: botões e listagem funcionando nos dois modos | modo API: e2e seção 26 em Chromium e Firefox; modo local: painel construído sem `VITE_API_URL` e servido na 4794, sonda Playwright `sonda-qa-modo-local.mjs` (`out/19`, captura `out/19-modo-local-minha-conta.png`); `paridade-dos-modos.test.ts` 10 de 10 (`out/06`) | no modo local, Usuários mostra o aviso que explica e nenhum botão Redefinir ou Encerrar; Minha conta explica no cartão "Minhas sessões" sem lista nem botão; zero erro de console |
| Regressão obrigatória | `npm run test:api` (`out/01`: 1451 aprovados, 34 pulados por ambiente, 0 falha); `npm run test --workspace @dc360/web` (`out/06`); `superficie.test.ts`; `paridade-dos-modos.test.ts` | todos verdes, código 0 |
| E2E: a administradora redefine a senha da agente, ela entra com a temporária, troca, e a sessão antiga cai; encerrar as outras derruba um segundo navegador | `node scripts/e2e-api-qa.mjs chromium` e `firefox` (cópia do roteiro com portas 3793 e 4793) (`out/15`, `out/20`) | seção 26: 50 conferências verdes por motor; suíte 288 e geometria 64, 0 falha, zero erro de console |

## Evidência

- `out/11-sonda-criterios-pg17.txt`: `API=http://127.0.0.1:3791 node scripts/sonda-criterios.mjs`, 40 conferências da E09, 0 falha, código 0.
- `out/10`, `out/12`, `out/13`, `out/14`: sonda da troca em voo, código 0; `out/22`: a mesma contra a API mutante, código 1 (o controle).
- `out/05-auth-postgres-real.txt`: 16 arquivos de autenticação com Postgres real, 291 de 291, código 0.
- `out/06-test-web.txt`, `out/01-test-api.txt`: código 0.
- `out/15-e2e-api-chromium.txt`, `out/20-e2e-api-firefox.txt`: código 0.
- `out/18-build-local.txt`, `out/19-sonda-modo-local.txt`: código 0.

## Cenários positivos

- Redefinição pelo painel e pela API, temporária no formato ditável, mostrada uma vez, em fonte tabular, com a troca exigida no primeiro acesso (e2e seção 26).
- Listagem das próprias sessões com a marca "esta", e encerramento das outras preservando a atual.
- Coordenadora gerindo operador: lê as sessões dele (200, só quantidade e datas: `sessoesAbertas`, `ultimaEntradaEm`, `validaAte`).
- Modo local explica em vez de oferecer.

## Cenários negativos

- Própria conta em três caixas e cinco formatos alternativos: sempre recusado, conta intacta.
- Posto igual ou maior: 403 `posto_insuficiente`.
- Outro município: 404, nunca 403, também com o id em maiúsculas.
- Agente: 403 `sem_permissao` nas três rotas.
- Sem token ou token adulterado: 401.

## Tentativas de reprovar

1. Repeti o ataque da rodada 4 (próprio id em maiúsculas e caixa mista) nas três rotas contra a API real: recusado. Tentei também os formatos que o Postgres aceita como uuid e o zod não (chaves, sem hífens, `urn:uuid:`, espaço, quebra de linha): todos 422.
2. Id de OUTRO município em maiúsculas, para ver se a normalização abriria a porta ao contrário: 404.
3. Redefinição contra troca em voo da sessão derrubada: 45 rodadas, 0 defeito; o controle com o código antigo reprova 8 de 8, então a sonda enxerga o defeito.
4. Procurei IP ou user-agent no corpo de `GET /auth/sessoes` e de `GET /usuarios/:id/sessoes`: não há.
5. Modo local: procurei os botões que não deveriam existir e erro de console: nenhum.

## Achados

- anotado: a sonda de modo local é só em Chromium; a de modo API rodou em Chromium e Firefox.
- anotado: nenhum defeito novo achado nesta dimensão.

## Não verificado

- Leitor de tela e zoom de 200 por cento (dimensão de acessibilidade).
- Auditoria visual das telas (dimensão de UX); só abri o painel no que o fluxo precisava.
- Postgres 16 e o run do CI (ausente).

## Risco residual

Baixo. A normalização vale para as rotas que usam `idSchema` de `administracao.ts`; uma rota futura com recusa sobre a própria conta e outro esquema de id precisaria repetir a regra. A senha temporária é conhecida por quem a sorteou (IDN-18, registrado em `PENDENCIAS.md`).

## Motivo do humano

A etapa pede que o Rafael faça o fluxo no painel e confira a frase da senha única e as confirmações: é texto de produto e julgamento de clareza, que só o dono do produto pode aprovar. O veredito técnico não depende disso.
