---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

API em processo contra PostgreSQL 17.6 REAL (cluster meu, derrubado no fim); suítes na CÓPIA de `fd17ff4`. Nada do repositório editado. Diff desde a rodada 6 que toca a etapa: só os novos TypeError de `RegraDeNegocio`/`AcessoSuspenso` e o catálogo (comentários); as funções de sessão (migração 047/049) e `vigencia.ts`/`servico.ts` NÃO mudaram.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Cadeia encerrada (admin/pessoa/reuso/troca) derruba o token pré-renovação; rotacionada só vale com família viva | `familia-da-sessao.test.ts` + `renovacao-contra-encerramento.test.ts` verdes (`20-suites-seg.txt`) | PASS |
| Senha provisória vencida nem escreve nem se troca (`senha-provisoria.test.ts:183`) | `senha-provisoria.test.ts` verde | PASS |
| Papel do banco diferente do token responde 401 `nao_autenticado` (renovar resolve) | mesma suíte verde | PASS |
| Isolamento: coordenador de A rebaixado segue sem ver B (404) | HTTP real: token de B em recurso de A = 404 | PASS |
| `trocar_senha`/`revogar_sessoes_do_usuario` (SECURITY DEFINER) não confere município: alcançável por fora? | varredura dos chamadores | não alcançável (achado) |

## Evidência

- `SCRATCH/val-red-team/saidas/20-suites-seg.txt`: `familia-da-sessao`, `renovacao-contra-encerramento`, `senha-provisoria`, `sessoes-da-conta` entre as 10 suítes, 460 aprovados, 34 pulados (Postgres real), código 0.
- Troca de senha com senha atual errada repetida (HTTP real, Helena): 8 de 8 respostas 401 `credenciais`, mensagem única (ver "Achados").
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`.
- Prova de que morde (`SCRATCH/val-red-team/saidas/60-mutacao-e07.txt`): na CÓPIA, a regra da cadeia em `auth/vigencia.ts` (a sessão rotacionada só vale se a família tem sessão com `revogada_em IS NULL`) foi trocada por `AND true`, ou seja, rotacionada sempre viva. `familia-da-sessao`, `vigencia-na-escrita` e `renovacao-contra-encerramento` ficaram VERMELHOS (11 reprovam, 2 de 3 arquivos, código 1). Restaurado, `cmp` idêntico ao SHA, VERDES (52 aprovados, 34 pulados do bloco de Postgres real, código 0).

## Cenários positivos

- Renovação normal: token antigo escreve até vencer e o novo também (bloco da vigência, suíte verde).

## Cenários negativos

- Senha atual errada repetida em `/auth/trocar-senha`: 401 constante, sem revelar nada; a senha provisória vencida vira 401 `sessao_encerrada` na troca e na renovação (suíte `senha-provisoria`).
- Token de B em recurso de A: 404.

## Tentativas de reprovar

1. Alcançar `trocar_senha`/`revogar_sessoes_do_usuario` por fora com id de outro município: todos os chamadores (`servico.ts`, `sessoes.ts`, `administracao.ts:268`) passam id derivado do token JÁ VERIFICADO (`identidade.usuarioId`, `sessao.usuario_id`) ou um id validado sob tenant ANTES (o `/usuarios/:id/situacao` lê a linha sob RLS e dá 404 cross-tenant antes de chamar `revogar_sessoes_do_usuario`). Não há caminho de requisição que entregue id cross-tenant a essas funções. Confirmado inalterado no diff.
2. Força bruta da senha atual em `/auth/trocar-senha`: sem lockout dedicado (achado anotado), limitada só ao teto global de 300/min por usuário autenticado. Pré-existente, não introduzida por este diff.
3. Reuso/encerramento da cadeia de sessão: coberto por `renovacao-contra-encerramento` (inclui o bloco de Postgres real, aqui pulado por PGlite; o CI roda em Postgres real) verde.
4. Desfiz a proteção central (a regra da família na vigência) numa cópia do SHA: o token de antes da renovação voltou a escrever depois da cadeia encerrada e 11 casos reprovaram; restaurado, verdes. O teste morde.

## Achados

- **anotado (não alcançável).** `trocar_senha` e `revogar_sessoes_do_usuario` são `SECURITY DEFINER` e não conferem `app.organizacao_atual`. Defesa em profundidade ausente, mas todo chamador passa id do token ou validado sob tenant; não alcançável pela API. Inalterado nesta rodada.
- **anotado.** `/auth/trocar-senha` não tem lockout por conta para senha atual errada; bounded pelo teto global por usuário. Pré-existente.

## Não verificado

- O bloco de Postgres real de `renovacao-contra-encerramento` (corrida da troca em voo sob concorrência) na minha execução: rodou em PGlite (34 pulados); o CI (Node 22, Postgres real) o exercita e está verde.
- `migrar --conferir` em Postgres real para a 047: a migração aplicou do zero no meu cluster (`02-migrar.txt`, 051 inclusive); não reaplichei sobre banco existente aqui.
- E2E do painel (rebaixar coordenador logado): validação humana.

## Risco residual

Baixo. As bordas da vigência passam no SHA e a função `SECURITY DEFINER` sem check de tenant segue inacessível de fora.

## Motivo do humano

Não se aplica: as sondas são por máquina. As três sondas antes/depois que o Rafael vê são validação humana.
