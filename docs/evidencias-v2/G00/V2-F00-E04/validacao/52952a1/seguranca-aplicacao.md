---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
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

Reexecutei tudo neste SHA (PGlite para a API; Postgres 17.10 descartável na porta 55530 para a corrida). O FAIL documental da rodada 2 está consertado.

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Conta desativada, papel rebaixado e sessão encerrada não escrevem (POST/PATCH/PUT/DELETE) | PASS | `vigencia-na-escrita.test.ts`, `get-com-efeito.test.ts`, `acesso-suspenso.test.ts` verdes (`01-suites-alvo-pglite.txt`); mutação ME (sem `exigirVigencia`) derruba 33 de 85 (`41-mutacao-ME`) |
| GET/HEAD com efeito (laudo, termos, PDFs, CSV, `GET /avisos`) passam pela vigência | PASS | mutação MD (`\|\| comEfeito` virado `\|\| false`) derruba 6 de 30 (`40-mutacao-MD`) |
| Suspensão antes de conta desativada; 403 `acesso_suspenso` e 503 na fila | PASS | `acesso-suspenso.test.ts` verde; `exigirVigencia` confere suspensão primeiro (`auth/vigencia.ts:160-176`) |
| Isolamento: outro município 404, mesmo com vigência ligada | PASS | `test:isolamento` do validador de banco nesta rodada (345/3); sonda A5 (conta desativada do município A não vê B) |
| Zero `skip` em vigência | PASS | `grep` em `apps/api/test`: só menção em comentário; suítes sem `.skip` incondicional |
| **Comentários batem com o código (FAIL da rodada 2)** | **PASS** | li `auth/suspensao.ts:20-100` neste SHA: descreve escrita = método OU `ROTA_GET_COM_EFEITO`, GET com efeito e POST fora da fila em 403 `acesso_suspenso`, rotas `filaDoCampo` (todas POST) em 503, leitura pura sem conferência. Confere com `servidor.ts:516-528` e as rotas marcadas |

O defeito da rodada 2 (comentário de `suspensao.ts` dizia que `GET /avisos` seguia aceitando o token sem conferir vigência) NÃO morde mais: o texto reescrito na correção 2 (`3ceb15f`) descreve exatamente o que o código faz.

## Evidência

- `cd dc360 && npm run build:shared` código 0 (`00-build-shared.txt`).
- Suítes de vigência/escrita/suspensão: `01-suites-alvo-pglite.txt` (12 arquivos, 185 passam, 9 pulados por ambiente, 0 falha).
- Mutações (mudar `apps/api/src`, rodar, ver vermelho, `git restore`, árvore limpa):
  - MD `servidor.ts` sem `comEfeito`: 6 de 30 vermelhos (`40-mutacao-MD-sem-comEfeito.txt`, `40-mutacao-MD.diff`).
  - ME `servidor.ts` sem `exigirVigencia`: 33 de 85 vermelhos (`41-mutacao-ME-sem-exigirVigencia.txt`, `41-mutacao-ME.diff`).
- Sonda A5 (`20-e07-sonda-login-e-bordas.txt`): conta desativada com token vivo responde 403 `conta_desativada` na escrita e 403 na renovação (a leitura segue 200, dentro do escopo documentado, F03-E03).
- Todas as saídas em `$SP/val/seguranca-aplicacao/`.

## Cenários positivos
- Conta ativa escreve 200; a rotação não é expulsão (o token anterior à renovação escreve durante e depois dela): `renovacao-contra-encerramento.test.ts` caso 5 verde (`12-corrida-repo-pg17.txt`).

## Cenários negativos
- Conta desativada/sessão encerrada/papel rebaixado: 401/403 na escrita, banco intacto (suítes acima).
- Mutações MD e ME provam que o teste morde: sem a marca de efeito ou sem a chamada de vigência, a árvore fica vermelha.

## Tentativas de reprovar
1. Tentei fazer conta desativada escrever por GET com efeito: a mutação MD prova que só a marca segura; com a marca, 403.
2. Removi a conferência inteira (ME): 33 casos caem, confirmando que a vigência está de fato ligada na escrita.
3. Procurei divergência entre o comentário de `suspensao.ts` e o código (o FAIL da rodada 2): reli o arquivo linha a linha neste SHA; bate.
4. Sonda A5 em PGlite com conta desativada e token vivo: escrita 403, renovação 403; a única folga é a leitura, que o plano manda para a F03-E03.

## Achados
**ANOTADO**
1. Corpo JSON vazio em `POST /auth/sair`, `/auth/renovar`, `/auth/entrar` e `/auth/trocar-senha` responde 500 `erro_interno` (deveria ser 400/413), sem vazar interno (mensagem genérica + id da requisição). Já anotado pela rodada 2 (achado 4), dono F02-E03. Fora do escopo da E04. Reprodução em `20-e07-sonda-login-e-bordas.txt` (bloco F).
2. `GET /ocorrencias/:id` e `GET /busca` seguem fora da vigência (leitura que grava `ocorrencia_consultas`); conta desativada lê o dossiê por até 15 minutos. Decisão registrada do plano (vigência em leitura é F03-E03). Anotado.

## Não verificado
- Vigência em leitura pura (excluída pelo plano, F03-E03).
- Corrida entre `lerVigencia` e a escrita (duas transações): janela de milissegundos, não reproduzível por `inject`.
- Carga do custo de uma ida ao banco por GET marcado.

## Risco residual
- Leitura com token vivo (dossiê, busca, listas) segue válida por até 15 minutos depois de desativar a conta ou encerrar a sessão, até a F03-E03.

## Motivo do humano
Nenhum.
