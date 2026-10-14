---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E07
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, MIGRATION, TENANT]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: PASS. A falha da rodada 1 (GET e HEAD com efeito escapando da cadeia e do papel) está consertada e o teste que a pegou morde. Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/`.

| Critério (bloco E07 e falha da rodada 1) | Resultado | Evidência |
| --- | --- | --- |
| Administrador, a própria pessoa, reuso de refresh e troca de senha encerram a cadeia: o token pré-renovação recebe 401 `sessao_encerrada` ao escrever | PASS | `familia-da-sessao.test.ts` (8 casos da cadeia) verde dentro de `01-vigencia.txt` (126 de 126) |
| **Rodada 1:** o mesmo token pré-renovação com cadeia encerrada recebe 401 `sessao_encerrada` também no `GET`/`HEAD` de termo de interdição, termo de desinterdição, laudo (HTML e PDF) e CSV | PASS | `get-com-efeito.test.ts`, sonda "cadeia encerrada depois da renovação", 14 pedidos, nada gravado; varredura própria: 7 rotas GET marcadas e 51 de escrita, estado "cadeia" (`06-varredura.cadeia.*`, `07-escrita.cadeia.*`) |
| **Rodada 1:** papel rebaixado: `GET`/`HEAD` com efeito dão 401 `nao_autenticado` (não 200) | PASS | sonda "papel rebaixado" do mesmo arquivo; varredura própria no estado "rebaixada" |
| Papel rebaixado: 401 `nao_autenticado`, depois `/auth/renovar` traz o papel novo e a escrita do papel novo passa; ex-coordenador renovado não despacha (403 `sem_permissao`) | PASS | `familia-da-sessao.test.ts` "Papel alterado", 7 casos verdes |
| A troca de papel não revoga sessões (decisão registrada) | PASS | caso "a troca de papel NÃO revoga as sessões" verde |
| Renovação normal: token antigo escreve até vencer, o novo também; várias rotações seguidas caem juntas ao encerrar a cadeia | PASS | casos "várias rotações seguidas" e `vigencia-na-escrita.test.ts` linha 188 |
| A família é por login: encerrar a cadeia de um aparelho não derruba a de outro login | PASS | caso verde; mutação abaixo |
| Senha provisória: no prazo troca; vencida no meio: trocar e renovar dão 401 `sessao_encerrada`; o serviço recusa por si | PASS | `familia-da-sessao.test.ts`, 4 casos; `senha-provisoria.test.ts` verde (8 arquivos, 126 de 126) |
| Isolamento: coordenador de A rebaixado não vê nada de B (404); coordenador de B com papel mudado não ganha nada em A | PASS | 2 casos verdes |
| Zero `skip` | PASS | nenhum `skip`, `xit` ou `todo` em `apps/api/test` |
| `/auth/encerrar-sessoes` com o token anterior à renovação não derruba a cadeia de quem pediu | PASS | último caso de `get-com-efeito.test.ts` |

## Evidência

- `npx vitest run` de `get-com-efeito`, `vigencia-na-escrita`, `familia-da-sessao`, `codigos-de-erro`, `acesso-suspenso`, `sessoes-da-conta`, `superficie` e `senha-provisoria`: 126 de 126 (`01-vigencia.txt`). `npm run test:api` completo: 1299 de 1299 (`22-test-api-completo.txt`). E2E (`node scripts/e2e-api.mjs`, Chromium): 279 de 279, seção 24 ("Papel alterado com a tela aberta") verde, zero erro de console (`23-e2e-api.txt`).
- Provas de que o teste morde (mutação em `src`, vermelho, `git restore`, árvore limpa conferida):
  - `vigencia.ts`: remover a cláusula `EXISTS ... familia_id` (a sessão rotacionada volta a valer sempre): 8 vermelhos, a sonda da cadeia em GET e HEAD e os 7 casos da cadeia de `familia-da-sessao.test.ts` (`03-mut-rotacionada-sempre-viva.txt`).
  - `vigencia.ts`: desligar a conferência do papel: 5 vermelhos em 3 arquivos (`05-mut-sem-papel.txt`).
  - `servidor.ts`: voltar ao critério "só pelo método" (tirar a marca da rota): 5 vermelhos, as 4 sondas e a lista comportamental (`02-mut-sem-comEfeito.txt`).
  - `servidor.ts`: tirar PATCH, depois PUT, depois DELETE: 1 vermelho cada (`25-mut-*.txt`).
- Varredura própria, quatro estados da conta (desativada, rebaixada, encerrada, cadeia encerrada depois de renovar), duas passadas: 7 rotas GET marcadas mais as não marcadas em GET e HEAD, e 51 rotas de escrita. Hash de todas as tabelas antes e depois de cada chamada. Escrita: 51 de 51 recusadas com o código esperado, nada mudou. GET: ver E04.

## Cenários positivos

- Renovação normal, rotação e escrita com o token antigo e o novo; senha provisória no prazo troca; escrita do papel novo passa depois da renovação.

## Cenários negativos

- Cadeia encerrada por administrador, por quem pede "encerrar as outras", por "sair", por reuso de refresh e por troca de senha: o token anterior à renovação cai em escrita e, nas rotas GET com efeito, também no GET e no HEAD.
- Papel rebaixado e promovido (papel maior no banco que no token) pedem renovação; o token velho não vale como o papel novo.
- Sessão encerrada vence papel diferente (quem foi rebaixado E derrubado entra de novo).

## Tentativas de reprovar

1. GET e HEAD com efeito sob cadeia encerrada e papel rebaixado (o furo da rodada 1): coberto e fechado, por teste e por varredura própria em todas as rotas.
2. Variantes de URL para escapar da marca da rota (barra final, `%`, maiúsculas, `;`, `?_method`, cabeçalhos de override): nenhuma 200 com conta desativada (`20-variantes.txt`, 89 respostas 403 e 68 respostas 404).
3. Famílias cruzadas: o teste "a família é por login" prova que a cadeia de um login não vale pela sessão viva de outro.
4. Senha provisória vencida: tentei trocar a senha e renovar pela rota, e o serviço de `trocarSenha` direto; 401 `sessao_encerrada` nos três.
5. Procurei a janela entre `revogar_sessao` e `abrir_sessao` na renovação: está documentada como limite conhecido (`PENDENCIAS.md`); não consegui provocá-la em teste determinístico.
6. Tentei achar escrita fora da vigência: nenhuma das 51 rotas de escrita escapa em nenhum dos quatro estados.

## Achados

**BLOQUEIA:** nenhum nesta etapa.

**CORRIGE ANTES DE CRESCER**

1. A janela de alguns milissegundos entre `revogar_sessao` (antiga) e `abrir_sessao` (nova) da renovação deixa a família sem sessão viva: uma escrita com o token antigo nessa janela leva 401 `sessao_encerrada` e a fila do campo tem de manter o item (E06). Documentado em `apps/api/PENDENCIAS.md`; a correção é renovar numa transação só (F03-E02). Dono: F03-E02.
2. `GET /ocorrencias/:id` e `GET /busca` continuam fora da cadeia e do papel (só leitura, gravam `ocorrencia_consultas` com o papel velho). Dono: F03-E03. Ver E04, achado 2.

**ANOTADO**

3. O achado documental da E04 (comentário de `suspensao.ts`) não afeta o contrato da E07.

## Não verificado

- A migração 047 em Postgres 17 e `migrar --conferir` em banco existente: só PGlite aqui, mais o `test:isolamento` do gatekeeper (327 passam, 3 pulados) e o CI.
- Concorrência real de duas renovações simultâneas com o mesmo token em Postgres (o caso H1 existe em `vigencia-na-escrita.test.ts` e passa em PGlite, que serializa).
- Firefox e WebKit na seção 24 do e2e.
- Aparelho de campo recebendo o 401 `nao_autenticado` de papel alterado (E06, outro validador).
- Sondas "antes e depois" para o Rafael: substituídas por mutação e execução (seção 4 de `28`).

## Risco residual

- Leitura pura segue pela assinatura do token até 15 minutos: um rebaixado ainda lê com o papel velho nas rotas que só leem (F03-E03).
- A janela do achado 1 em carga alta.

## Motivo do humano

Nenhum.
