---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
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

Veredito: PASS para a dimensão QA/API. A frase mostrada ao usuário e as capturas são de UX (outra dimensão). Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/`.

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Token vencido responde 401 `nao_autenticado` | PASS | `codigos-de-erro.test.ts` e probe própria (token adulterado: 401 `nao_autenticado`) |
| Sessão encerrada por administrador responde 401 `sessao_encerrada` | PASS | `01-vigencia.txt` e `codigos-de-erro.test.ts` |
| Conta desativada responde 403 `conta_desativada` na escrita com token vivo | PASS | `21-e05.json`: `escrita_token_vivo` 403 `conta_desativada` |
| **Rodada 1:** desativar pela rota real e depois renovar devolve 403 `conta_desativada` | PASS | probe própria: `PATCH /usuarios/:id/situacao` 200, sessões vivas 0, depois `POST /auth/renovar` dos DOIS aparelhos do Diego responde 403 `conta_desativada` com a frase do catálogo, sem par novo (`21-e05.json`) |
| `/auth/entrar` intacta (desativada, inexistente e senha errada: mesmo status e mesmo corpo) | PASS | `21-e05.json`: `entrar_corpos_iguais` true (401 `credenciais`, "Email ou senha inválidos.") |
| `POST /auth/recuperar` intacta | PASS | 202 igual para conta desativada e e-mail inexistente (`recuperar` true) |
| Migração 048 não abre enumeração | PASS | análise e probes abaixo |
| 404 entre municípios intacto, e conta desativada de A não revela nada de B | PASS | `desativadaA_em_B_proprio_inexistente`: 403 `conta_desativada` para recurso de B, de A e inexistente (iguais); coordenador de B contra ocorrência de A: 404 `nao_encontrada`, igual ao inexistente |
| Catálogo do shared bate com o que o servidor emite; código fora do catálogo reprova | PASS | `codigos-de-erro.test.ts` 22 de 22 (inclui o leitor de fonte que reprova código novo e o nome `sessao`) |
| Nenhuma ocorrência de `erro: "sessao"` | PASS | caso "ninguém escreve `erro: "sessao"` à mão" verde |

## Evidência

- `npx vitest run test/codigos-de-erro.test.ts` dentro dos 8 arquivos de `01-vigencia.txt`: 126 de 126. `npm run test:api` completo 1299 de 1299 (`22-test-api-completo.txt`). E2E contra API e painel reais: 279 de 279 mais 50 de 50, seção 23 verde (`23-e2e-api.txt`).
- Prova de que o teste morde: em `src/auth/servico.ts` trocar `if (dono && dono.usuario_ativo === false)` por `if (false && ...)` (volta ao defeito da rodada 1) deixa 5 casos vermelhos: 4 de `codigos-de-erro.test.ts` ("desativada pelo painel", "token já rotacionado", "NEGATIVO: token desconhecido...", "depois do 403, entrar...") e "desativar usuário derruba as sessões dele na hora" de `api.test.ts`; `git restore` e verde de novo (`08-mut-e05.txt`).
- Probe própria independente do teste do implementador: `scratchpad/qa-api/sondas-temporarias/zz-qa-e05.test.ts` (semente de Serra Alta e Vale Fundo, dois aparelhos do mesmo agente, desativação pela rota do produto, nada por `UPDATE` na conta alvo).

## Cenários positivos

- Aparelho 1 e aparelho 2 do mesmo agente desativado: ambos 403 `conta_desativada`, repetível, sem par novo e com as sessões continuando revogadas.
- Conta desativada e reativada: a renovação antiga volta a ser `sessao_encerrada` e entrar funciona (`codigos-de-erro.test.ts`, verde).
- Token já rotacionado, apresentado depois da desativação: 403 `conta_desativada` (verde).

## Cenários negativos

- Token de renovação desconhecido (43 letras `a`) e curto (`x`): 401 `sessao_encerrada`.
- Token de conta ATIVA que saiu (`POST /auth/sair`): 401 `sessao_encerrada` com corpo IDÊNTICO ao do token desconhecido (`corpo_igual_desconhecido_vs_sair` true). O corpo da desativada difere (403), como o projeto decidiu: só quem apresenta um token reconhecido sabe.
- Sessão encerrada por administrador sem desativar: continua 401 `sessao_encerrada` (verde).
- `/auth/entrar` com a senha CERTA de conta desativada: recusa genérica, idêntica à do e-mail inexistente e à da senha errada.

## Tentativas de reprovar

1. Enumeração por quem NÃO tem token: tentei distinguir conta desativada de inexistente e de ativa por `/auth/entrar` (corpo e status idênticos nos três), por `/auth/recuperar` (202 idêntico), e por `/auth/renovar` com token que o servidor não conhece (idêntico, `sessao_encerrada`). Sem credencial, nada distingue.
2. Enumeração por quem tem token: só distingue a própria conta. A função `dono_do_token` (migração 048) é chamada pelo hash do token (segredo de 256 bits guardado só como hash), devolve uma linha só se o hash existe, e a coluna nova (`usuario_ativo`) é só o booleano da conta DONA daquele token. Saída continua estreita (usuário, três carimbos, booleano): nada de nome, papel, município ou e-mail. Token de outro município não devolve dado a quem não o tem. `REVOKE ALL FROM PUBLIC` e `GRANT` só a `dc360_app` repetidos depois do `DROP`.
3. Teto de funções `SECURITY DEFINER`: a 048 não acrescenta função (redefine a existente); `test:isolamento` do gatekeeper (327 passam, 3 pulados) cobre o teto.
4. Isolamento: conta desativada do município A escrevendo em ocorrência do B, do A e inexistente devolve a mesma coisa nas três (403 `conta_desativada`), sem confirmar existência de nada de B.
5. Ordem das respostas: desativada + sessões revogadas não pode sair como `sessao_encerrada`: coberto pelo teste "conta desativada com as sessões TAMBÉM encerradas continua conta_desativada" (verde).
6. Mutação que remove o ramo novo da renovação (acima): o teste morde.

## Achados

**BLOQUEIA:** nenhum.

**CORRIGE ANTES DE CRESCER**

1. Na renovação, o ramo `conta_desativada` vem ANTES da conferência de suspensão do município (a sessão já está revogada, o caminho nem chega a `exigirAcessoAtivo`). Município suspenso mais conta desativada: o token de acesso vivo recebe `acesso_suspenso` (suspensão primeiro, testado em `vigencia-na-escrita.test.ts`), mas a renovação recebe `conta_desativada`. Inconsistência de precedência, sem vazamento. Não reproduzi por execução (ver "Não verificado"); leitura de `servico.ts` linhas 620 a 641. Dono: implementador da E05.

**ANOTADO**

2. A frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da do catálogo ("Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente."). O código é o contrato; o implementador já anotou.
3. O app de campo lê a recusa só no pedido forçado do transporte da fila (`renovarJa`); telas que chamam `obterToken()` sem isso seguem como antes. Dono: E06.

## Não verificado

- A migração 048 em Postgres 17 e no job `restore` (só o CI); no Postgres local 18, `test:isolamento` do gatekeeper (327 passam).
- Município suspenso mais conta desativada na renovação (achado 1): não executei.
- Tempo de resposta dos três caminhos de renovação (token desconhecido, conhecido de conta desativada, conhecido de conta ativa): não medi canal de tempo.
- O aplicativo de campo (jest `token.test.ts` e pacote do campo): fora do meu escopo de execução nesta rodada.
- Frases e capturas das três telas (UX).

## Risco residual

- Um token de renovação roubado revela se a conta está desativada. Equivale ao que o ladrão já obtém usando o token, e o booleano só sai para quem o possui.
- A fila do aparelho depende da E06 para tratar o 403 sem descartar itens.

## Motivo do humano

Nenhum que a dimensão QA exija. A leitura das três frases pelo Rafael, prevista no bloco, é conteúdo de produto e fica com a dimensão UX.
