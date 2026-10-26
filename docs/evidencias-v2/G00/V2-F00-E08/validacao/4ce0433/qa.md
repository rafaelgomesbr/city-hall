---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Comandos rodados por mim no SHA `4ce0433` (árvore principal em `3ce67c7`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem) ou num worktree meu destacado em `4ce0433`. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L13-qa/saidas/` (abaixo, `saidas/`). A correção 4 não tocou esta etapa (`git diff bb0f654..4ce0433` não mexe em `oficios.ts`, `avisos.ts`, `permissoes.ts` nem em `Ocorrencia.tsx` no que é da E08): a validação é de regressão e de prova reexecutada.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Positivo: operador, coordenador e administrador listam e abrem ofício (200) | PASS | `leitura-do-agente-oficios-e-avisos.test.ts` 14 de 14 e `orgaos-e-oficio.test.ts` 24 de 24 no `test:api` (`saidas/reg-01-test-api.txt`); e2e 25 "a administradora abre a mesma ficha (200)" e "o operador abre o mesmo dossie e continua vendo o cartao de oficios" |
| Positivo: sino do coordenador com a mesma contagem; agente lista os avisos da equipe dele | PASS | `sino-de-avisos.test.ts` 19 de 19; e2e 25 "todo aviso do agente e de ocorrencia da equipe dele" |
| Negativo: agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | PASS | vitest; e2e 25 nos dois motores; sonda HTTP `sondas/sonda-agente-http.mjs` contra a API real: "FECHA GET /oficios -> 403 sem_permissao", "FECHA GET /oficios/:id -> 403 sem_permissao", código 0 (`saidas/e08-01-sonda-http.txt`) |
| Negativo: agente sem equipe: lista de avisos vazia e `naoLidos` 0 | PASS | caso do vitest (14 de 14) |
| Autorização e isolamento: Bravo não vê nem conta aviso da Alfa; coordenador de B abre ofício de A: 404 | PASS | vitest (oráculo calculado no banco; 404 de outro município); e2e 25 "o numero de nao lidos do agente e o da lista dele, nao o do municipio" |
| Ação nova no shared, não `if` de papel | PASS | `packages/shared/src/permissoes.ts` (`consultar_oficio` em operador, coordenador e administrador, não no agente); `permissoes.test.ts` 16 de 16 |
| Frontend esconde Ofícios de quem não tem a ação | PASS | `Ocorrencia.tsx:164,179,807` usa `podeExecutar`; e2e 25 "o agente abre o dossie da propria equipe, sem faixa de erro" e "o cartao de oficios nem aparece para ele" |
| Regressão: `npm run test:api` | PASS | 1451 aprovados, 34 pulados (Postgres real, `renovacao-contra-encerramento.test.ts`), código 0 |
| Regressão: `npm run test --workspace @dc360/shared` | PASS | 185 de 185, código 0 |
| Regressão: `npm run test:isolamento` | PASS | 345 e 3 pulados, código 0 |
| Regressão: `apps/api/test/superficie.test.ts` | PASS | 9 de 9 |
| Regressão: `npm run test:e2e:api` | PASS | roteiro completo, Chromium e Firefox: "Passou: 288 Falhou: 0" e geometria 64 de 64, zero erro de console, código 0 nos dois (`saidas/e2e-01-api-chromium.txt`, `saidas/e2e-02-api-firefox.txt`); seção 25 com 14 de 14 em cada motor |
| DoD: pendência da escrita em GET registrada | PASS | `apps/api/PENDENCIAS.md:26` e seção da linha 246 |
| Documentação | PASS | linha "Consultar os ofícios de encaminhamento" em `docs/PAPEIS_E_RESPONSABILIDADES.md` e na tabela gerada do README, presas por `permissoes-no-readme.test.ts` (10 de 10) |

## Evidência

- `npm run test:api`: código 0 (`saidas/reg-01-test-api.txt`).
- `npm run test --workspace @dc360/shared`, `npm run test:isolamento`, `npm run test:console`, `npm run test --workspace @dc360/web` (669 de 669): código 0 (`saidas/reg-0*.txt`).
- `node scripts/e2e-api.mjs chromium` e `node scripts/e2e-api.mjs firefox` no worktree: código 0 nos dois.
- API real subida no worktree (porta 3791, banco em memória semeado) e `BASE_API=http://127.0.0.1:3791 node docs/evidencias-v2/G00/V2-F00-E08/sondas/sonda-agente-http.mjs`: código 0, "RESULTADO: fechado". A API foi derrubada em seguida.
- Mutações no worktree (`mutacoes/generico.mjs`), cada uma restaurada, saídas em `saidas/e08-mutacoes/`.

## Cenários positivos

- Quem tem `consultar_oficio` lê lista e ficha com o conteúdo de sempre (e-mail do órgão e IP de abertura voltam a quem consulta, no vitest).
- O operador continua vendo o cartão de ofícios no dossiê (e2e 25, dois motores).
- O sino da coordenação continua com o município inteiro.

## Cenários negativos

Mutações que fiz, cada uma contra `leitura-do-agente-oficios-e-avisos.test.ts`, `sino-de-avisos.test.ts` e `orgaos-e-oficio.test.ts`:

| Mutação | Resultado | Como reprova |
| --- | --- | --- |
| M1 `GET /oficios` volta a `exigirAutenticacao` | 2 falhas | "expected 200 to be 403" com o corpo do ofício |
| M2 `GET /oficios/:id` volta a `exigirAutenticacao` | 2 falhas | "expected 200 to be 403" e "expected 404 to be 403" |
| M3b contagem de não lidos sem o recorte | 2 falhas | "expected 6 to be 3", "expected 6 to be +0" |
| M4b lista de avisos sem o recorte | 5 falhas | "expected [...] to not include <aviso de outra equipe>" |
| M5b `POST /avisos/lidos` sem o recorte | 1 falha | "expected 2 to be +0" |
| M6 shared concede `consultar_oficio` ao agente | 2 falhas em `permissoes.test.ts` | "expected true to be false" |

As primeiras versões de M3 a M5 (apagando só o trecho SQL) davam 500 por número de parâmetros, e não serviam de prova; refiz trocando a chamada do recorte por texto vazio, e aí a falha é por asserção. Todas mordem pela asserção do vazamento.

## Tentativas de reprovar

1. Procurei outra porta de leitura de ofício para o agente: `GET /oficios/:id/documento` exige `emitir_documento`; `POST /oficios/:id/envio` exige `encaminhar_providencia`. Fechadas.
2. Achei `GET /documentos/validar/:codigo` (`rotas/documentos.ts:877`), só com autenticação: dado o identificador de 12 caracteres impresso no papel, devolve número, protocolo, id da ocorrência e quem emitiu o ofício, de qualquer equipe. Precisa do identificador do documento físico e não devolve e-mail, observações nem IP; fora do escopo da etapa (manifesto rota x ação, F03-E12). Anotado.
3. A sonda HTTP na minha subida ficou vazia na parte do sino ("0 de 0", o município semeado não tinha aviso no instante); não serve de prova para avisos, e por isso a prova do sino é o vitest com oráculo (14 de 14) e a seção 25 do e2e, que exigem aviso de outra equipe existindo para a administradora e ausente para o agente.
4. Conferi que a correção 4 da F00 não alterou as rotas e a ação da etapa (diff `bb0f654..4ce0433`), e que a nova tabela de permissões de `PAPEIS_E_RESPONSABILIDADES.md` diz "Consultar os ofícios de encaminhamento: sim, não, sim, sim", igual ao código (teste da tabela verde).

## Achados

- Anotado: `GET /documentos/validar/:codigo` confirma número e protocolo de ofício ao agente que tenha o identificador impresso (item 2 acima). Dono sugerido: F03-E12.
- Anotado (já declarado pela etapa): `GET /orgaos` entrega o e-mail de cada órgão ao agente; a escrita dentro de `GET /avisos` continua (F07-E03, F04-E11).

Motivo do veredito da rodada 4: PASS das quatro dimensões; o único item pendente era o E4 visual do Rafael (jornada nova da seção 25). Nada a consertar pela correção 4, e nada regrediu: e2e 25 verde nos dois motores, mutações mordem.

## Não verificado

- O olhar humano das capturas da seção 25 (E4 visual) e a sonda antes e depois vista pelo Rafael: validação humana.
- CI do SHA: ausente nesta sessão (gh sem login).
- App de campo em aparelho (a etapa não muda o contrato do app; jest do app 1932 de 1932).

## Risco residual

Leitura continua pela assinatura do token até a F03-E03: um coordenador rebaixado a agente lê ofício por até 15 minutos. A rota de validação do item 2 é uma confirmação estreita que depende do papel impresso.

## Motivo do humano

A etapa pede que Rafael veja a sonda do agente antes (200 com o e-mail do órgão) e depois (403), e o gatilho visual da rodada 4 pede que ele veja as capturas da jornada da seção 25. Isso é aceite de produto, não reproduzível por teste.
