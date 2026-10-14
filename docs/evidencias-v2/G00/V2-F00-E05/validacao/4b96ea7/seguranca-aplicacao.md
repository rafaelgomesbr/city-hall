---
validador: seguranca-aplicacao
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

Veredito na primeira linha: **PASS** para a dimensão segurança de aplicação. O foco foi o que os códigos novos (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`) e a migração 048 revelam a quem NÃO tem credencial, e se a 048 amplia o que o papel de aplicação lê. Não encontrei oráculo de enumeração nem de estado. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| `/auth/entrar` com conta desativada dá a recusa genérica, igual à de senha errada e de e-mail inexistente | PASS | sonda `4x-e05-oraculo.txt`: quatro combinações (desativada+senha certa, desativada+errada, inexistente, ativa+errada) devolvem o MESMO status e corpo (401 `credenciais`, "Email ou senha inválidos.") |
| `/auth/recuperar` não distingue desativada, ativa e inexistente | PASS | mesma sonda: três respostas idênticas |
| `/auth/renovar`: quem não tem token conhecido não aprende o estado da conta | PASS | token inventado e token conhecido de conta ATIVA com sessão encerrada: 401 `sessao_encerrada`, mesmo corpo. Só quem apresenta token conhecido de conta desativada recebe 403 `conta_desativada` |
| Token de acesso vivo de conta desativada de A escrevendo em ocorrência de B não confirma nada sobre B | PASS | mesma sonda: ocorrência real e UUID inexistente dão ambos 403 `conta_desativada`; com token vigente, ocorrência de outro município dá 404 `nao_encontrada` |
| Catálogo do shared bate com o que o servidor emite; código fora do catálogo reprova | PASS | `codigos-de-erro.test.ts` (22 casos) e `packages/shared/test/codigos-de-erro.test.ts` verdes |
| A migração 048 não amplia o que o papel de aplicação lê | PASS | leitura do SQL abaixo; teste de isolamento do gatekeeper verde (teto de 27 funções `SECURITY DEFINER` intacto) |
| `conta_desativada` não vira 401 nem some atrás de `sessao_encerrada` na renovação (FAIL da rodada 1) | PASS | seis casos "Renovar depois de desativar PELO ENDPOINT real" verdes e mutação m05 abaixo |

## Evidência

- `10-api-auth.txt`: `codigos-de-erro.test.ts`, `enumeracao-pelo-bloqueio.test.ts`, `senha-provisoria.test.ts`, `superficie.test.ts` e mais oito arquivos, 12 de 12, 131 testes.
- Sonda própria `e05-oraculo.test.ts` (`4x-e05-oraculo.txt`): desativação e encerramento feitos pelos endpoints reais (`PATCH /usuarios/:id/situacao`, `POST /usuarios/:id/encerrar-sessoes`).
- Leitura de `db/migrations/048_dono_do_token_diz_se_a_conta_esta_ativa.sql`: a função `dono_do_token(text)` continua `SECURITY DEFINER`, `search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` só a `dc360_app`. A saída ganha UMA coluna booleana (`usuario_ativo`). A entrada é o HASH de um token de 256 bits, então a coluna só serve a quem já conhece o token. Token desconhecido não devolve linha. Não há tabela, policy nem função privilegiada nova.
- Prova de que o teste morde: **m05** (`servico.ts`, `tratarTokenRecusado` sem o ramo `usuario_ativo === false`): 5 vermelhos em `codigos-de-erro.test.ts` e `api.test.ts` (74 casos), restaurado com `git restore`, árvore limpa (`seg/m05-sem-conta-desativada-na-renovacao.txt`).

## Cenários positivos

- Pessoa desativada pelo painel que renova depois dos 15 minutos recebe 403 `conta_desativada` (e não 401), e as sessões continuam revogadas (idempotente).
- Reativada, o mesmo token de renovação passa a responder 401 `sessao_encerrada`, e entrar funciona.
- Token vencido responde 401 `nao_autenticado`; sessão encerrada por quem administra, 401 `sessao_encerrada`.

## Cenários negativos

- Sem token, token lixo e JWT `alg: none`: 401 `nao_autenticado`, independente do estado de qualquer conta (cobertura da rodada 1, e `superficie.test.ts` verde).
- Nenhum corpo de erro de acesso carrega id, organização, nome, e-mail ou estrutura interna.
- Município suspenso com conta desativada: a suspensão responde primeiro.

## Tentativas de reprovar

1. Tentei usar `/auth/entrar`, `/auth/recuperar` e `/auth/renovar` como oráculo do estado da conta com credencial nenhuma: as respostas são idênticas (sonda acima).
2. Tentei fazer o 403 `conta_desativada` confirmar a existência de recurso de outro município: o código sai antes da rota, igual para ocorrência real e inexistente; com a conta vigente o recurso alheio é 404.
3. Procurei a 048 como ampliação de leitura: a função não ganha parâmetro nem junta nome, papel, município ou e-mail. Um chamador precisa do hash de um token válido.
4. Procurei efeito colateral exploratório do caminho novo de `tratarTokenRecusado`: quem apresenta token conhecido de conta desativada dispara `revogar_sessoes_do_usuario`, que é idempotente e só atinge o dono do token; quem apresenta token rotacionado de conta ativa derruba a família (reúso), como já era.
5. Corpo malformado (JSON truncado) e corpo de 2 MB em `/auth/entrar`: respondem 500 `erro_interno`, não 400 nem 413 (`4x-erros.txt`). Isso não vaza dado, mas desvia do contrato de códigos (achado 2).
6. Mutação m05 (acima): confirma que o ramo da 048 é coberto por teste.

## Achados

**ANOTADO**

1. A frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da frase do catálogo para `sessao_encerrada` ("Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente."). O implementador já registrou. Sem efeito de segurança; o código é o mesmo.
2. Requisição com corpo JSON inválido ou acima de `bodyLimit` vira `500 erro_interno` com log de erro e pilha (rotas `/auth/entrar`, `/auth/recuperar`). Já anotado na rodada 1; dono F02-E03 (esquema de erro único).
3. A pessoa que apresenta um token de renovação conhecido aprende que a conta foi desativada, por desenho (a etapa declara). Não é oráculo para quem não o tem.

## Não verificado

- Postgres real: usei PGlite; a 048 foi aplicada em PGlite e, pelo gatekeeper, no Postgres local 18.3 (`test:isolamento`). Não rodei a migração no Postgres 17 do job `restore`.
- Diferença de tempo entre token desconhecido e token conhecido de conta desativada (o segundo faz uma revogação a mais): só é observável por quem tem o token, e não medi em banco real.
- Conta com segundo fator ativo nos três códigos.
- As frases mostradas ao usuário e as capturas (conteúdo de produto, UX).

## Risco residual

- Leitura com token vivo de conta desativada segue 200 até o token vencer (F03-E03).
- 500 em corpo inválido gera ruído de log e pode disparar alarme por taxa de 500 sob tráfego hostil (F02-E03).

## Motivo do humano

Nenhum para esta dimensão. As três frases são conteúdo de produto e já constam como pendência do Rafael nos relatórios de UX e QA.
