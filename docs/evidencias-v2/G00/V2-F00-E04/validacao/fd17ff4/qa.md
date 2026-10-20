---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). O diff `1ed0b71..fd17ff4` toca o caminho da etapa em `apps/api/src/servidor.ts` (construtor de `RegraDeNegocio` passa a recusar status que não seja inteiro de 400 a 599), `apps/api/src/auth/suspensao.ts` (`AcessoSuspenso` só aceita 403 ou 503) e a guarda de códigos de erro; o bloco da vigência em `exigirAutenticacao` (linhas 537 a 546) não mudou.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Positivo: conta ativa escreve (200) | PASS | `vigencia-na-escrita.test.ts` 13 de 13 (`SAIDAS/e04-02-verde-depois.txt`) |
| Negativo: conta desativada, papel rebaixado, sessão encerrada por administrador recebem 401 ao escrever; quem encerra "as outras" mantém a sua | PASS | mesmo arquivo, e mutação M1 (abaixo) derruba exatamente esses casos |
| Município suspenso com conta desativada responde a suspensão primeiro; `sid` de outra pessoa nega | PASS | casos de borda verdes; reprovam sob M1 |
| Senha provisória vem do banco na escrita | PASS | caso verde; reprova sob M2 |
| Isolamento: B contra ocorrência de A segue 404; `test:isolamento` verde | PASS | caso "a organização continua vindo do token ... (404)" verde; db 345 mais 3 pulados (`bl1/03-teste-db.txt`) |
| Zero `skip` em vigência | PASS | portão de skip: 0 incondicionais (`bl3/03-test-scripts.txt`); o arquivo não tem `skip` |
| Regressão: `test:api`, `superficie.test.ts`, `test:e2e:api` | PASS | API 1685 mais 34 pulados (PGlite) e 1719 de 1719 com Postgres 17.6 real; `superficie` mais vigência 22 de 22 (`SAIDAS/e04-01-verde-antes.txt`); `e2e-api` 288 e 197 em Chromium e Firefox |
| E2E: desativar no painel e o próximo POST falha | PASS | seção 23b de `fluxo-api.e2e.mjs` ("a coordenacao desativa o Marcos pelo painel", seguida da troca de senha dele, um POST, que leva à tela de entrada com "sua conta foi desativada"), dentro do "Passou: 288 Falhou: 0" |
| Comentários batem com o código | PASS | bloco de `servidor.ts:515-546` descreve a conferência ligada e o histórico; "DESLIGADO NESTA IMPLANTAÇÃO" não aparece no código (`git grep`, só na auditoria histórica) |
| Prova de que o teste morde | PASS | M1, M2 e M3 abaixo |

## Evidência

- M1, vigência desligada como em b4439ac (`if (escrita)` vira `if (false && escrita)`, `SAIDAS/e04-M1.diff`): `npx vitest run --root apps/api test/vigencia-na-escrita.test.ts` código 1, 7 de 13 reprovam (desativada, rebaixado, encerradas, leitura com escrita negada, suspenso com desativada, `sid` alheio, senha provisória) (`SAIDAS/e04-M1-vermelho.txt`). `git restore`.
- M2, senha provisória só pelo token (linha `senhaProvisoria = vigencia.senhaProvisoriaAte !== null` removida, `SAIDAS/e04-M2.diff`): código 1, 1 de 13 reprova (`SAIDAS/e04-M2-vermelho.txt`). `git restore`.
- M3, escrita só por método (sem `comEfeito`, `SAIDAS/e04-M3.diff`): suíte inteira da API código 1, 6 reprovam em `get-com-efeito.test.ts` (5) e `acesso-suspenso.test.ts` (1) (`SAIDAS/e04-M3-vermelho.txt`). `git restore`.
- Depois de restaurar: vigência 13 de 13, código 0 (`SAIDAS/e04-02-verde-depois.txt`); `git status --porcelain` vazio.
- `DC360_POSTGRES_DE_PROVA=<cluster descartável local, porta 55871> npm run test:api`: código 0, 1719 de 1719 (`SAIDAS/e04-03-test-api-postgres-real.txt`). Cluster desligado ao fim.
- `e2e-api` em Chromium (`bl5/03-e2e-api.txt`) e Firefox (`SAIDAS/e2e-api-firefox.txt`), códigos 0.
- CI run 39420436042: 9 de 9 `success`.

## Cenários positivos

- Conta ativa escreve; o token antigo depois da renovação continua escrevendo pelos 15 minutos ("rotação não é expulsão"); leitura com token vivo segue 200.

## Cenários negativos

- Conta desativada, papel rebaixado, sessão encerrada por administrador, `sid` de outra pessoa: 401 na escrita.
- Município suspenso com conta desativada: 403 de suspensão antes.
- Município B contra ocorrência de A: 404, não 403.

## Tentativas de reprovar

1. Desfiz o conserto (M1) e vi vermelho, restaurei e vi verde; repeti com a senha provisória (M2) e com a metade "rota com efeito" da decisão de escrita (M3). As três mordem.
2. Procurei se a mudança do diff em `AcessoSuspenso` (que agora lança `TypeError` fora de 403 e 503) podia transformar a recusa da vigência em 500: os três lugares que a constroem passam 403 fixo ou `statusDaSuspensao`, que só vale 403 ou 503 (`servidor.ts:496`, `vigencia.ts:165`, `suspensao.ts:165`).
3. Procurei o mesmo para `RegraDeNegocio` com status não inteiro: nenhum caso da API reprovou em 1719 casos com o construtor novo, inclusive com Postgres real.
4. Rodei o bloco de corrida de renovação contra encerramento em Postgres real (pulado no PGlite): verde, então a trava comum por pessoa não regrediu com a vigência ligada.

## Achados

- Nenhum que bloqueie.
- **Anotado (já registrado na etapa).** A vigência vale só na escrita; leitura e o registro da própria leitura (`ocorrencia_consultas`) seguem fora até a F03-E03.

## Não verificado

- A janela da escrita em voo (escrita que passou pela vigência e confirma depois da desativação) não foi medida por mim; é risco residual registrado para a F03-E03.
- Leitura pura com token de conta desativada (fora do escopo).
- Logs dos jobs do CI (exigem token); só o estado `success`.
- Node 22 localmente (rodei em 24.15.0).

## Risco residual

Até a F03-E03, um token vivo de conta desativada continua lendo por até 15 minutos, como a etapa declara.

## Motivo do humano

Não se aplica a este SHA: a sonda antes e depois é reproduzida pelas mutações M1 e M2 acima, com o comando registrado para o Rafael repetir.
