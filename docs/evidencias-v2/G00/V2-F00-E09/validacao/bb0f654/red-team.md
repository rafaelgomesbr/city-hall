---
validador: red-team (general-purpose com o papel da dimensão)
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
humano_necessario: nao
escalar: seção 7 item 2 de 28 (autenticação e autorização, sem risco aceito): a recusa de autoredefinição e de autoencerramento é contornada com o UUID em maiúsculas; e a redefinição por quem administra é desfeita por troca de senha em voo
---
## Critérios verificados

| Critério da etapa | Resultado | Prova |
| --- | --- | --- |
| Testes negativos: "a API recusa `autoredefinicao` e `autoencerramento` (422)" | **FAIL** | Com o UUID da própria conta em maiúsculas as duas rotas respondem 200 (saída `01`, seção E09.B). |
| Autorização e isolamento: coordenador de A contra usuário de B, 404; `GET /usuarios/:id/sessoes` de B com token de A, 404 | PASS | 404 nas três rotas, corpo idêntico ao de id inexistente (saída `01`, E09.A). |
| Agente (e operador) nas três rotas: 403 `sem_permissao` | PASS | Saída `01`, E09.C (6 de 6). |
| `GET /usuarios/:id/sessoes` de posto acima: 403 `posto_insuficiente` | PASS | Coordenadora contra administradora nas três rotas: 403 (E09.B). |
| Administrador redefine a senha e o login com a temporária exige a troca; sessões caem | PASS | E09.D: renovação antiga 401, escrita antiga 401, senha antiga 401, sessão da temporária recebe 403 em `GET /usuarios`. |
| `GET /auth/sessoes` marca a atual, sem IP e sem user-agent | PASS | E09.D: chaves só `aparelho, atual, entrouEm, validaAte`; o IP de origem do pedido e a palavra "Mozilla" não aparecem; uma só `atual`. |
| "Encerrar as outras" mantém a de onde se clicou | PASS no caminho sequencial; quebra sob disputa (achado 3) | E09.H. |
| Regressão da correção 3 da E07 (`emitirPar` relê o hash sob a trava) nos fluxos da etapa | PASS | Login com a temporária e com a senha nova funcionam (E09.D); `renovacao-contra-encerramento.test.ts` com o bloco de Postgres real LIGADO (sem pulo) verde (saída `02`). |

## Evidência

Tudo produzido nesta sessão, no SHA bb0f654 (árvore em 0290af5, que só difere em STATUS e ESTADO-ATUAL), saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E09-E10-E13-E15/`:

- Cluster PostgreSQL 17.6 próprio (binários do scratchpad, porta 55479, só TCP local, autenticação local sem senha), banco descartável por execução com as 50 migrações e a semente; a API real (`construirServidor`, `bancoPostgres`, que faz `SET LOCAL ROLE dc360_app` e portanto aplica o RLS) exercitada por `app.inject`.
- `sonda-api.mts` (roteiro meu, fora do repositório), rodado com o `tsx` do repositório a partir de `dc360/apps/api`: saída `01-sonda-api.txt`, código 0, 39 conferências OK, 2 FALHA, 6 ACHADO.
- `DC360_POSTGRES_DE_PROVA=<cluster acima> npx vitest run` em `dc360/apps/api` com `sessoes-da-conta`, `senha-e-sessoes`, `posto-abaixo-do-seu`, `recuperacao*` (4 arquivos), `superficie`, `senha-provisoria`, `renovacao-contra-encerramento`, `config`: saída `02-vitest-api-etapas.txt`, código 0, 11 arquivos, 159 de 159, nenhum pulado.
- `npm run test --workspace @dc360/web`: saída `04-vitest-web.txt`, código 0, 44 arquivos, 665 de 665 (inclui os 8 de `seguranca-da-conta.test.ts` e `paridade-dos-modos.test.ts`).

## Cenários positivos

- Administradora (Rita, Serra Alta) redefine a senha do agente: 200 com a senha temporária, `cache-control: no-store`; as duas sessões do agente caem (renovação 401, escrita 401); a senha antiga é recusada.
- O agente entra com a temporária: a sessão só alcança a troca (`GET /usuarios` 403); troca a senha (200); a nova entra; a temporária não entra mais.
- `GET /usuarios/:id/sessoes` devolve só `id, sessoesAbertas, ultimaEntradaEm, validaAte` (2 sessões abertas, contagem certa).
- `GET /auth/sessoes`: "Aparelho com iOS" e "Chrome em Windows", uma linha `atual`.

## Cenários negativos

- Serra Alta contra Vale Fundo nas três rotas: 404 com corpo idêntico ao de UUID inexistente; a conta de Vale Fundo continua entrando com a senha dela.
- Coordenadora contra administradora: 403 `posto_insuficiente` nas três rotas. Coordenadora contra a própria conta (mesmo em maiúsculas): 403 `posto_insuficiente`.
- Agente e operador nas três rotas: 403 `sem_permissao` (6 de 6).
- Autoação com o UUID como o token traz (minúsculas): 422 `autoredefinicao` e 422 `autoencerramento`.
- IDN-18 (quem sorteou conhece a temporária): a administradora entra como o agente com a temporária ANTES dele; quando o agente troca a senha, a sessão dela cai (renovação 401, escrita 401).

## Tentativas de reprovar

1. **UUID em maiúsculas na rota de autoação (REPROVOU).** `POST /usuarios/11111111-1111-4111-8111-0000000000D4/redefinir-senha` com o token da própria administradora: 200 e a senha temporária. A rota compara `id === quem.usuarioId` como texto (`apps/api/src/rotas/administracao.ts:437` e `:560`); o Zod aceita UUID em maiúsculas e o Postgres compara `uuid` sem distinguir caixa, então a comparação falha e o UPDATE acha a própria linha. Cadeia completa medida: sessão da administradora deixada aberta, quem senta pede a própria redefinição em maiúsculas, recebe a temporária, entra com ela, troca para uma senha dele (200) e passa a operar como administradora (`GET /usuarios` 200); a sessão legítima em outro aparelho cai (401) e a senha antiga deixa de entrar. A trilha registra `senha_redefinida` com autor e alvo iguais. É exatamente a escalada que o comentário da rota diz impedir ("uma sessão esquecida aberta na recepção redefine a senha de quem administra sem precisar saber a senha antiga"). O mesmo em `encerrar-sessoes`: 200, `sessoesEncerradas: 2`, e a própria sessão de onde se clicou cai (renovação 401). `GET /usuarios/<própria em maiúsculas>/sessoes` também responde 200 (leitura da própria contagem, sem dano).
2. **Troca de senha em voo contra a redefinição por quem administra (REPROVOU, 5 de 5).** A sessão de quem tem a senha pede `/auth/trocar-senha`; 15 ms depois a administradora redefine. A redefinição confirma e responde 200 com a temporária (cerca de 257 ms); a troca confirma depois (cerca de 466 ms) e grava a senha dela por cima. Resultado: a temporária entregue por quem administra não entra (401) e a senha escolhida pela sessão antiga entra (200). `trocarSenha` (`auth/servico.ts`) lê o hash numa transação, gasta dois scrypt e chama `trocar_senha` em outra, sem reler o hash sob a trava: é a mesma janela que a correção 3 da E07 fechou no login, aberta aqui. O caso 7 de `renovacao-contra-encerramento.test.ts` disputa exatamente essas duas rotas e só confere que não há impasse e que a sessão cai; não confere qual senha vale no fim.
3. **Sessão expulsa terminando uma troca em voo (REPROVOU, 5 de 5).** O dono aperta "encerrar minhas outras sessões" (200, 1 encerrada) enquanto a outra sessão tem uma troca em voo: a troca da sessão já expulsa responde 200, a senha dela passa a valer e a sessão do dono, de onde ele clicou, cai (renovação 401). A vigência foi conferida na entrada do pedido, antes da expulsão.
4. Senha temporária reaproveitada depois da troca: recusada (401). Sessão aberta com a temporária por quem a sorteou, depois da troca do dono: cai. Não reprovou.
5. Enumeração entre municípios pelo status ou pelo corpo nas três rotas (404 contra 404 de id inexistente, corpos byte a byte iguais): não reprovou.
6. Regressão da correção 3 da E07 nos fluxos desta etapa (login com temporária, login depois da troca, renovação, escrita): não reprovou; bloco de Postgres real da disputa verde.

## Achados

1. **FAIL (critério da etapa; seção 7 item 2, sem risco aceito).** Autoredefinição e autoencerramento contornados com o UUID em maiúsculas. Reprodução: entrar como `rita.lopes@serraalta.exemplo.gov.br` e chamar `POST /usuarios/11111111-1111-4111-8111-0000000000D4/redefinir-senha` (200 com `senhaTemporaria`) ou `.../encerrar-sessoes` (200). Saída `01`, seção E09.B, linhas FALHA e ACHADO E09.B2. Conserto provável: comparar com o id normalizado (minúsculas) ou, melhor, recusar pelo banco (`WHERE id = $1` e conferir `id <> quem` na mesma consulta), e um caso de teste com o id em maiúsculas nas duas rotas. O mesmo padrão `id === quem.usuarioId` existe em `PATCH /usuarios/:id/situacao` (`administracao.ts:207`, autodesativação), não sondado aqui.
2. **Corrige antes de crescer (seção 7 item 2).** A redefinição por quem administra, já confirmada e respondida com a temporária, é desfeita por uma troca de senha em voo (5 de 5, saída `01`, E09.F). Quem mantém pedidos de troca em sequência (sabe a senha atual e cada senha nova que escolhe) sobrevive à redefinição, que é o remédio da etapa ("quem administra devolve acesso"). Conserto provável: `trocar_senha` (ou `trocarSenha`) relê o hash depois da trava e recusa se não for mais o que o scrypt conferiu, como `emitirPar` faz desde a correção 3 da E07.
3. **Corrige antes de crescer.** Mesma raiz: a troca em voo de uma sessão recém-expulsa conclui e derruba a sessão de quem clicou em "encerrar minhas outras sessões" (5 de 5, E09.H). Não amplia o que já pode quem sabe a senha, mas desmente a promessa "esta sessão continua aberta" sob disputa.

## Não verificado

- O painel (botões, `SenhaTemporaria`, `MinhasOutrasSessoes`) não foi exercitado em navegador nesta dimensão: a régua do red-team é a API, e a tela não é controle de acesso. As 665 conferências do vitest do painel passaram.
- `PATCH /usuarios/:id/situacao` com o id em maiúsculas (autodesativação): mesmo padrão de código, não executado.
- Postgres de produção e CI: o run do CI não foi lido.

## Risco residual

Enquanto o achado 1 estiver aberto, qualquer pessoa diante de uma sessão de administrador aberta toma a conta da administradora em quatro pedidos, sem saber a senha, e expulsa a dona de todos os aparelhos. Os achados 2 e 3 exigem quem já conhece a senha atual e pedidos em voo; o 2 anula o remédio de quem administra contra um invasor ativo.

## Motivo do humano

Nenhum para esta dimensão: os três achados são provados por execução e o conserto é técnico. A validação humana da etapa (frases e fluxo no painel) é de outras dimensões.
