---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente e convenções como no relatório da E04 desta rodada (Postgres 17.10 descartável, API do SHA com `dc360_api`, saídas em `$SP/val/red-team/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| 403 `conta_desativada` na escrita com token vivo | PASS | varredura da E04, `e04/estado-desativada.*`: 67 de 67 escritas, corpo com `conta_desativada` |
| 401 `sessao_encerrada` para sessão encerrada, cadeia encerrada e provisória vencida | PASS | `estado-sessao-encerrada`, `estado-cadeia-encerrada-token-rotacionado`, `estado-provisoria-vencida`: 67 de 67 cada |
| 401 `nao_autenticado` para papel diferente do token | PASS | `estado-papel-rebaixado`: 67 de 67 |
| Município suspenso responde a suspensão antes da conta | PASS | `estado-suspenso-*`; e `vigencia-na-escrita` verde |
| Renovar de conta desativada pelo endpoint real: 403 | PASS | `codigos-de-erro.test.ts` verde em `01-suites-alvo-pglite.txt`; defeito da rodada 1 NÃO MORDE |
| `/auth/entrar` com conta desativada: recusa genérica | PASS | caso de `codigos-de-erro.test.ts` verde; leitura de `entrar` (`servico.ts` 276 a 320): mesma `MENSAGEM_GENERICA` e mesmo código `credenciais` para senha errada, conta inativa e e-mail inexistente |
| Conta desativada de A contra recurso de B não confirma nada sobre B | PASS | vigência roda antes do handler: na varredura, laudo e escrita respondem `conta_desativada` sem consultar a ocorrência; com conta vigente, B dá 404 (`40-e08-agente-e-cruzamento.txt`) |
| Catálogo: só códigos do catálogo na conferência de acesso | PASS com ressalva | `CODIGOS_DE_ERRO_DE_ACESSO` tem os seis; `FalhaAutenticacao` ainda emite `credenciais`, `bloqueado` e `senha_provisoria_vencida`, que são de entrada e troca de senha, fora do catálogo de acesso por desenho; o painel (`apps/web/src/dados/http.ts`, `sessaoMorta`) só derruba a sessão por código do catálogo com o status do catálogo |
| O teste morde | PASS | M8 e M9 abaixo |

Achado do banco desta rodada ("quem perde a trava para a desativação recebe 401 `sessao_encerrada`"): CONFIRMADO POR LEITURA, não reexecutado por mim. Em `apps/api/src/auth/servico.ts`, `renovar` lê `sessao_por_token` (conta ativa) antes da trava; se a desativação confirma no meio, `revogar_sessao` devolve 0, a função devolve `null` e o ramo `sessaoNova === null` lança `FalhaAutenticacao("sessao_encerrada")` sem chamar `tratarTokenRecusado`. A reprodução determinística do banco (5 de 5, mesmo token reapresentado leva 403) está em `$SP/val/banco-de-dados/96-e05-renovacao-perde-para-desativacao.txt`, que li.

Procurei outros caminhos com código errado:
- Renovar com conta desativada E município suspenso: a renovação responde `conta_desativada` (o ramo `!sessao.ativo` e `tratarTokenRecusado` vêm antes da suspensão), enquanto a escrita responde `acesso_suspenso` primeiro. Ordem diferente entre os dois caminhos; nenhum critério da etapa fixa a ordem na renovação. Anotado.
- Desafio de segundo fator vencido e link de redefinição inválido saem como 401 `sessao_encerrada` sem sessão; o painel trata (`mandouToken`) e não derruba ninguém. Não é defeito.
- 401 `credenciais` de `/auth/trocar-senha` (senha atual errada) faz o painel renovar e repetir uma vez (o ramo do 401 em `chamar`), sem derrubar a sessão. Custo: uma rotação e um scrypt a mais por erro de digitação. Anotado.

## Evidência

- `01-suites-alvo-pglite.txt` (inclui `codigos-de-erro`, `vigencia-na-escrita`, `get-com-efeito`, `senha-provisoria`), código 0.
- `10-e04-estados.txt`, `11-e04-analise.txt`, `e04/`: varredura em Postgres 17.
- Mutações (restauradas com `git restore`; `git status --porcelain` depois só com os relatórios):
  - M8 `50-*`: sem a linha `if (vigencia.contaDesativada) throw new ContaDesativada()`: 7 de 45 vermelhos.
  - M9 `51-*`: renovar ignora o retorno `conta_desativada` de `tratarTokenRecusado`: 4 de 22 vermelhos em `codigos-de-erro.test.ts`.

## Cenários positivos

Cada estado devolve o código do catálogo com o status do catálogo; conta reativada volta a `sessao_encerrada` na renovação antiga (suíte).

## Cenários negativos

Token desconhecido e token de conta ativa encerrada saem iguais na renovação; entrar não distingue conta desativada.

## Tentativas de reprovar

1. Sete estados de conta contra todas as rotas: nenhum código fora do esperado.
2. Ordem suspensão e conta na renovação: diferente da escrita (anotado).
3. Códigos fora do catálogo vindos de rota autenticada: só `credenciais` na troca de senha, tratado pelo painel sem derrubar.
4. Renovação no meio de uma desativação: confirmado o código errado por leitura (achado 1).

## Achados

1. CORRIGE ANTES DE CRESCER (dono E07, `apps/api/src/auth/servico.ts`, ramo `sessaoNova === null` de `renovar`): renovação que perde a trava para a desativação responde 401 `sessao_encerrada` em vez de 403 `conta_desativada`. Não reprova a E05: fora da janela de milissegundos o código é o certo, a reapresentação do mesmo token já recebe 403, e nenhum par é emitido. Conserto: chamar `tratarTokenRecusado(hash)` nesse ramo.
2. ANOTADO: na renovação a conta desativada vem antes da suspensão; na escrita, a suspensão vem antes.
3. ANOTADO: 401 `credenciais` da troca de senha provoca uma renovação inútil no painel.

## Não verificado

- Reprodução própria, por concorrência, do achado 1: não executei; a prova é a do validador de banco e a leitura do código.
- Telas do painel e do aplicativo (UX e acessibilidade).

## Risco residual

Janela estreita em que a pessoa desativada lê "entre de novo" no painel.

## Motivo do humano

Não se aplica.
