---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: autenticação e autorização (itens 2 da seção 7 de 28: não admite risco aceito)
---

## Critérios verificados

Matriz da Definition of Done e dos cinco campos de teste, por execução nesta sessão, no SHA bb0f654 (árvore em 0290af5; `dc360/` idêntico).

| Critério da etapa | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: 8 casos de `seguranca-da-conta.test.ts` verdes | vitest do painel (saída 02) | 8 de 8; painel 665 de 665 |
| DoD: botões e listagem nos dois modos | servidor: e2e seção 26 (Chromium e Firefox, 50 de 50 cada) e sonda no navegador (saídas 16 e 17); local: sonda 22 (sem botões, texto que explica) | verde |
| DoD: nenhuma rota nova sem permissão | `superficie.test.ts` 9 de 9; sonda 06: sem token, 401 nas três rotas de administração e em `GET /auth/sessoes` | verde |
| Positivo: administrador redefine a senha de um operador e o login com a temporária exige a troca | sonda 06, seção D; sonda no navegador (16 e 17) | verde no caminho sem disputa |
| Positivo: `GET /auth/sessoes` marca a sessão atual | sonda 06, seção F | exatamente uma `atual`, só `entrouEm`, `validaAte`, `aparelho`, `atual` |
| Positivo: encerrar "as outras" mantém a de onde se clicou | sonda 06 F (API) e sondas 16 e 17 (segundo navegador cai, este continua, foco na confirmação) | verde |
| **Negativo: a API recusa `autoredefinicao` e `autoencerramento` (422)** | **sonda 06, seção B** | **FALHA: com o próprio id em maiúsculas (ou com uma letra trocada de caixa) as duas rotas respondem 200 e agem sobre a própria conta** |
| Negativo: coordenador não vê os botões em posto igual ou maior | `posto-abaixo-do-seu.test.ts` 7 de 7; sondas 16 e 17 (coordenadora: 0 botões em administradora e em si, 2 em operador e agente) | verde |
| Negativo: `GET /usuarios/:id/sessoes` de posto acima: 403 `posto_insuficiente` | sonda 06 C | verde |
| Autorização e isolamento: coordenador de A pede redefinir de B: 404; `GET /usuarios/:id/sessoes` de B com token de A: 404; agente nas três rotas: 403 `sem_permissao` | sonda 06 C (também com id em maiúsculas: 404) | verde |
| Regressão obrigatória: web, `test:api`, `superficie`, `paridade-dos-modos` | saídas 01 e 02 | API 1326 aprovados, 1 falha conhecida da máquina (`openssl-do-teste`, LibreSSL), 20 pulados; web 665 de 665; superfície 9 de 9; paridade 10 de 10 |
| E2E: seção 26 (redefinir, entrar com a temporária, trocar, sessão antiga cai; encerrar as outras derruba o segundo navegador) | `node scripts/e2e-api.mjs chromium` e `firefox` (saídas 04 e 05) | 50 de 50 em cada motor, geometria 64 de 64, zero erro de console |
| **Objetivo: quem administra devolve acesso e derruba a sessão de outra pessoa** | **sonda 06, seção E** | **FALHA: uma troca de senha em voo pela sessão que a redefinição derruba vence a redefinição em 12 de 12 rodadas** |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E09-E10-E13/`:

- `00-build-shared.txt` (código 0); `01-test-api.txt` (`npm run test:api`: 101 arquivos, 1326 aprovados, 1 falha `openssl-do-teste`, 20 pulados; `sessoes-da-conta` 27 de 27, `senha-e-sessoes` 17 de 17, `senha-provisoria` 8 de 8, `posto-abaixo-do-seu` 7 de 7, `superficie` 9 de 9); `02-test-web.txt` (665 de 665, código 0); `03-test-isolamento.txt` (345 aprovados, 3 pulados, código 0).
- `04-e2e-api-chromium.txt`, `05-e2e-api-firefox.txt`: e2e contra a API real, código 0.
- `06-sonda-e09-api.txt`: `node sonda-e09-api.mjs` contra API própria (`npx tsx src/index.ts` na 3791, PGlite semeado, `NOTIFICADOR_ARQUIVO`), código 1, 6 FALHAS (4 da seção B, 1 da E, 1 da D que é limitação documentada, ver Achados).
- `07-sonda-e09-sessao-morta.txt`: o que o token de acesso de uma sessão encerrada ainda faz (leitura 200, escrita 401).
- `16-sonda-navegador-chromium.txt`, `17-sonda-navegador-firefox.txt`: Playwright contra a mesma API, 53 de 53 por motor (inclui as telas da E09).
- `19-mutacao-e09-guarda-422.txt`: com a guarda `id === quem.usuarioId` desligada nas duas rotas, `sessoes-da-conta` e `senha-e-sessoes` dão 4 falhas; restaurado com `git restore`. Prova que os testes mordem só o id EXATO.
- `22-sonda-modo-local.txt`: modo local sem os botões, nos dois motores.
- `18-indices-byte-a-byte.txt`: `INDEX.md` da E09, 257 linhas, 257 batem byte a byte no SHA e na árvore; `conferir-indices-de-evidencia.mjs` OK.
- Scripts das sondas na mesma pasta (`sonda-e09-api.mjs`, `sonda-e09-api-2.mjs`, `sonda-navegador.mjs`, `sonda-modo-local.mjs`).

## Cenários positivos

- Redefinição por quem administra: 200 com `senhaTemporaria` e `Cache-Control: no-store`; a sessão anterior do alvo não renova (401 `sessao_encerrada`); a senha antiga não entra; a temporária entra com `trocaDeSenhaObrigatoria: true`; outra rota com ela responde 403 `troca_de_senha_obrigatoria`; trocada, a temporária reaproveitada não entra (401) e a senha nova entra sem exigir troca.
- No painel (Chromium e Firefox): a linha da própria administradora não tem botões; a confirmação traz o nome no botão; Escape fecha e devolve o foco ao botão; a senha aparece uma vez, com a frase de que não aparece de novo; clique fora não fecha; "Já anotei a senha" a tira do DOM; a pessoa entra com a temporária, define a senha antes de qualquer tela e cai em `/painel`.
- Minha conta: lista com "Esta sessão" (ícone e texto), confirmação que diz que esta continua aberta, segundo navegador cai em `/entrar`, este continua em `/minha-conta`, foco na confirmação ("As outras N sessões foram encerradas. Esta continua aberta.").
- Conta desativada: a redefinição avisa que a conta não entra; a temporária não entra (401).

## Cenários negativos

- Agente nas três rotas: 403 `sem_permissao`. Coordenador de Vale Fundo nas três rotas sobre conta de Serra Alta: 404, também com o id em maiúsculas. Coordenadora sobre a administradora: 403 `posto_insuficiente`. Id inexistente: 404. Sem token: 401.
- Coordenadora sobre a própria conta com id em maiúsculas: 403 `posto_insuficiente` (o posto barra, porque coordenador só gere posto abaixo).
- Administradora sobre a própria conta com o id exato: 422 `autoredefinicao` e 422 `autoencerramento`.
- **Administradora sobre a própria conta com o id em maiúsculas ou em caixa mista: 200 nas duas rotas (FALHA).**
- **Troca de senha pela própria pessoa em voo durante a redefinição por quem administra: a redefinição responde 200 e não vale (FALHA).**

## Tentativas de reprovar

1. **Variações do identificador na recusa de agir sobre a própria conta.** `idSchema` é `z.string().uuid()` (aceita maiúsculas) e a guarda é comparação de cadeia `id === quem.usuarioId` (`apps/api/src/rotas/administracao.ts:437` e `:560`), enquanto o Postgres compara `uuid` sem caixa. Resultado (saída 06, seção B), com a administradora Rita:
   - `POST /usuarios/<id em MAIÚSCULAS>/encerrar-sessoes`: 200 `{"sessoesEncerradas":2}`; a segunda sessão dela e a sessão de onde clicou passam a responder 401 `sessao_encerrada` na renovação. Idem com uma só letra trocada de caixa.
   - `POST /usuarios/<id em MAIÚSCULAS>/redefinir-senha`: 200 com `senhaTemporaria`; a senha antiga dela deixa de entrar; ela entra com a temporária que sorteou para si e define uma senha nova sem nunca ter informado a senha atual. Idem em caixa mista.
   É exatamente a escalada que o comentário da rota diz fechar ("uma sessão esquecida aberta na recepção redefine a senha de quem administra sem precisar saber a senha antiga"): basta o token de uma sessão aberta da administradora e uma chamada com o id em maiúsculas. A mutação (saída 19) mostra que os testes só cobrem o id exato. O mesmo padrão existe em `PATCH /usuarios/:id/situacao` (`administracao.ts:207`, `autodesativacao`), fora do escopo desta etapa e não executado aqui (a semente tem uma só administradora, e a regra de último administrador barraria).
2. **Troca de senha em voo durante a redefinição por quem administra.** O operador entra com a senha K e chama `POST /auth/trocar-senha` (K para X); ao mesmo tempo, com atraso de 0 a 160 ms, a administradora chama `POST /usuarios/:id/redefinir-senha`. Em 12 de 12 rodadas (saída 06, seção E): a troca responde 200 (cerca de 475 ms), a redefinição responde 200 com a senha temporária T (cerca de 250 a 410 ms), a sessão de quem trocou foi derrubada (renovação 401), **mas T não entra (401) e X entra (200)**; o token de acesso que a troca devolve para a sessão derrubada ainda lê (`GET /auth/sessoes` 200). Causa, por leitura do código: `trocarSenha` (`apps/api/src/auth/servico.ts`, cerca da linha 1065) lê o hash numa transação, gasta dois scrypt e grava com `trocar_senha` (migração 049), que faz `UPDATE usuarios SET senha_hash` sem conferir que o hash ainda é o que foi conferido nem que a sessão preservada continua viva. É a mesma classe do defeito que a correção 3 da E07 fechou no login (`emitirPar` relê a credencial sob a trava), que não chegou à troca de senha. Consequência: quem tem a senha e uma sessão (o invasor que motivou a redefinição) e mantém uma troca em curso anula a redefinição de quem administra, que vê "200, senha temporária" e entrega ao dono uma senha que não funciona; o invasor fica com a conta. A sessão revogada não escreve depois da revogação (saída 07: escrita 401), mas a escrita que começou antes termina depois e vence.
3. Tentei encerrar sessões de outra pessoa sem posto, de outro município (id exato e em maiúsculas), com papel sem a permissão e sem token: todas recusadas como a etapa manda.
4. Tentei reaproveitar a senha temporária depois da troca (401) e entrar com a temporária em conta desativada (401).
5. Procurei regressão do diff `52952a1..bb0f654` (login sob `comTenant` com releitura da credencial, `cr` no desafio, tratamento de corpo ilegível): redefinir e entrar com a temporária, trocar, encerrar e listar sessões continuam verdes na sonda, nos e2e de dois motores e nas suítes.

## Achados

- **FAIL 1 (bloqueante, autorização):** recusa de `autoredefinicao` e `autoencerramento` contornada por caixa do id. Reprodução: `POST /usuarios/<próprio id em maiúsculas>/redefinir-senha` com o token de quem administra: 200 e senha temporária da própria conta; `.../encerrar-sessoes`: 200 e derruba inclusive a sessão de onde clicou. Saída 06, seção B. Critério quebrado: "a API recusa `autoredefinicao` e `autoencerramento` (422)". Não admite risco aceito (item 2 da seção 7 de `28`).
- **FAIL 2 (bloqueante, autenticação e sessão revogada):** a redefinição por quem administra perde para uma troca de senha em voo da sessão que ela derruba (12 de 12). Reprodução: saída 06, seção E, script `sonda-e09-api.mjs`. Critérios quebrados: o objetivo "quem administra devolve acesso e derruba sessão" e o positivo "redefine a senha e o login com a temporária exige a troca". Mesma raiz atinge a recuperação pelo link (relatório qa da E10). Não admite risco aceito (item 2).
- **Anotado (limitação documentada, não conta como falha da etapa):** o token de acesso de uma sessão revogada continua valendo para LEITURA até 15 minutos (`GET /auth/sessoes` 200 depois de a sessão cair; escrita 401). Está escrito em `rotas/administracao.ts` ("o token de acesso já emitido vale até expirar") e em `servidor.ts` ("na leitura vale a marca do token").

## Não verificado

- Postgres 17: as sondas usaram PGlite (a disputa do FAIL 2 depende do tempo do scrypt no Node e de um `UPDATE` incondicional, não do motor; ainda assim não medi em 17).
- 320 px e 768 px das telas da E09 só pelo e2e de geometria (64 de 64 em dois motores); zoom de 200 por cento e leitor de tela não verificados.
- Cópia da senha sem permissão de área de transferência (caminho de cópia à mão).
- WebKit nesta sessão.
- CI do SHA: não lido.

## Risco residual

Alto enquanto os dois FAIL não forem consertados: uma sessão aberta de quem administra basta para redefinir a própria senha sem a senha atual, e quem tem a senha de uma conta consegue anular, de forma repetível, a redefinição feita por quem administra. O resto da etapa (telas, listagem, posto, isolamento, permissões) está provado nos dois motores.

## Motivo do humano

A etapa pede validação humana: Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações (texto de produto, seção 4 de `28`). Não substitui o conserto dos dois FAIL, que é técnico e verificável por teste.
