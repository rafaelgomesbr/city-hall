---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` na árvore principal (HEAD `5044e7a`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Postgres 17.6 real, cluster descartável meu em 127.0.0.1:55931, derrubado e apagado no fim; a API usa `SET LOCAL ROLE dc360_app` com RLS forçada. Saídas em `SCRATCH/validadores/seguranca-aplicacao/`.

1. Conta desativada não escreve: 403 `conta_desativada` na escrita e no GET com efeito (CSV), nada gravado em `exportacoes` (sonda 08); `get-com-efeito.test.ts` varre toda rota POST, PATCH, PUT e DELETE fora de `SEM_TOKEN` com a conta desativada (verde, saída 19).
2. Papel rebaixado não escreve com o papel do token: 401 `nao_autenticado` (08; `vigencia-na-escrita.test.ts` 13 de 13, saída 01).
3. Sessão encerrada por quem administra não escreve: 401 `sessao_encerrada`, inclusive no `GET /avisos` com efeito (08); a de quem clicou em "Minha conta" sobrevive (`vigencia-na-escrita`).
4. Zero `skip` em vigência: `vigencia-na-escrita.test.ts` roda 13 casos, nenhum pulado; `npm run test:api` inteiro com `DC360_POSTGRES_DE_PROVA` (106 arquivos, 1624 de 1624, zero pulado, saída 20).
5. B contra A continua 404 com a vigência ligada: sonda 08 (ler, escrever coordenada, despachar: 404 `nao_encontrada`, igual ao id aleatório).
6. A vigência morde: duas mutações minhas em `apps/api/src/servidor.ts` (09 e 10, ver Tentativas).
7. Regressão: `npm run test:isolamento` 345 aprovados e 3 pulados (21); `superficie.test.ts` verde (19).

## Evidência

- `08-sonda-negativas-pg17.txt`: sonda própria `zz-sonda-negativas-r6.test.ts` (cópia em SCRATCH; esteve em `apps/api/test/` só durante a execução), 3 de 3 verdes, com cada pedido e resposta registrados.
- `09-MUTACAO-E04-sem-exigirVigencia.txt`: `exigirVigencia` trocado por `void exigirVigencia` em `servidor.ts`; `vigencia-na-escrita`, `get-com-efeito`, `familia-da-sessao` e a minha sonda: 24 vermelhos de 46. Restaurado, `shasum -c` OK.
- `10-MUTACAO-E04-sem-comEfeito.txt`: a escrita decidida só pelo método (sem `config.comEfeito`): 7 vermelhos de 33 (as quatro sondas dos GET que escrevem, a lista comportamental, o 403 do município suspenso no GET com efeito e a minha sonda). Restaurado.
- `19-guarda-codigos-e-autz.txt`: 11 arquivos, 361 de 361 (`get-com-efeito`, `acesso-suspenso`, `superficie`, guarda e catálogo, entre outros).
- `20-test-api-completo.txt`, `21-test-isolamento.txt`.

## Cenários positivos

- Conta ativa escreve: "Helena ativa escreve: 200" (08).
- Rebaixada a operador renova e o papel novo vale: renovação 200 com `papel: operador` (08).
- Leitura com token vivo continua (decisão declarada, F03-E03): caso "o token de acesso continua LENDO até vencer" verde.

## Cenários negativos

Todos em Postgres 17.6 real, pela rota (08):
- desativada escreve: 403 `conta_desativada`; GET `/relatorios/ocorrencias.csv`: 403, `exportacoes` inalterada; renova: 403 `conta_desativada`;
- token de antes da desativação, conta reativada: 401 `sessao_encerrada`;
- rebaixada com token velho despacha: 401 `nao_autenticado`; renovada despacha: 403 `sem_permissao`;
- sessão encerrada por quem administra escreve: 401 `sessao_encerrada`; `GET /avisos`: 401;
- coordenador de B lê, escreve e despacha em ocorrência de A: 404, idêntico ao id aleatório; abre ocorrência mandando `x-organizacao-id`, `organizacao_id` na consulta e `organizacaoId` no corpo apontando A: 201 e a ocorrência nasceu em B (organização só do token).

## Tentativas de reprovar

- Desliguei `exigirVigencia` (09): 24 testes reprovam, inclusive a varredura de PATCH, PUT e DELETE com conta desativada; a suíte morde.
- Tirei a marca `comEfeito` da decisão de escrita (10): as sondas dos GET que escrevem reprovam; a decisão por rota é presa por teste.
- Tentei passar a organização por cabeçalho, consulta e corpo (08): ignorada.
- Conferi que o diff `bb0f654..1ed0b71` em `servidor.ts` não tocou a decisão da vigência: só instala a guarda de códigos de erro (antes das rotas) e reescreve o comentário de `/saude`. A guarda só age em 401 e 403, preserva o status e, fora de teste, troca corpo fora do catálogo pelo genérico do mesmo status; em teste vira 500, e a suíte inteira passa nela (20), então nenhum código de vigência exercitado é reescrito.

## Achados

- Anotado (continua da rodada 4, risco residual já levado ao Rafael): a vigência é conferida antes da transação de escrita; uma escrita que já passou pela conferência pode confirmar logo depois da desativação. Não medido de novo aqui.
- Anotado (continua): `HEAD /ocorrencias/:id` e o dossiê gravam o registro de consulta sem vigência (decisão da F03-E03).
- Nenhum achado bloqueia.

## Não verificado

- O E2E do painel ("desativar um usuário e ver o próximo POST falhar") não foi rodado por mim em navegador; o mesmo efeito foi provado pela rota real (08).
- `npm run test:e2e:api` não rodado.
- Postgres 16 do CI não rodado; CI do SHA ausente (H32).
- A janela de escrita em voo depois da desativação (anotado acima) não foi remedida.

## Risco residual

Vigência só na escrita até a F03-E03 (leitura com token vivo por até 15 minutos) e a janela de escrita em voo depois da desativação. Ambos já registrados.

## Motivo do humano

não se aplica
