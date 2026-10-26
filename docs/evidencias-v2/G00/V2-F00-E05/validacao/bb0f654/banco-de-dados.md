---
validador: banco-de-dados (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

Dimensão banco de dados da E05 sobre `bb0f654`, em PostgreSQL REAL (17.6, versão maior de produção), e não só no PGlite dos testes:

1. Cada código de erro sai do ramo certo do banco: token vencido (401 `nao_autenticado`), sessão revogada por quem administra (401 `sessao_encerrada`), família encerrada por reuso de token rotacionado (401 `sessao_encerrada`), papel alterado no banco (401 `nao_autenticado`, e a renovação devolve o papel novo), município suspenso (403 `acesso_suspenso`), conta desativada pela rota do produto (403 `conta_desativada` na escrita e na renovação): PASS.
2. O 403 da renovação vem da coluna `usuario_ativo` de `dono_do_token` (migração 048), lida agora da conta: PASS, com prova de mordida.
3. Nenhuma resposta vaza existência de recurso de outro município: 404 de outro município igual ao de id inexistente; conta desativada de A escrevendo em B recebe a mesma resposta que para um id inexistente: PASS.
4. `/auth/entrar` com conta desativada continua com a recusa genérica, igual à senha errada e ao e-mail inexistente: PASS.
5. Migração 048 aplica em PostgreSQL 17 e chega íntegra a um restore (corpo, dono, `SECURITY DEFINER`, `search_path` e ACL iguais): PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/banco-de-dados-E05-E12-E25/` (abaixo `<val>`).

- Ambiente: clone limpo de `bb0f654` (`<val>/clone-zsh`), `npm ci` e build de shared, db e api; dois clusters PostgreSQL 17.6 novos (binários oficiais da EDB, SHA-256 conferido), origem com as 50 migrações e a semente, restaurada na segunda pelo roteiro da E25; API compilada (`node apps/api/dist/index.js`) com o login restrito `dc360_api` contra o banco restaurado e segredo JWT aleatório da rodada.
- Sonda HTTP: `<val>/ferramentas/sonda-e05.mjs`, saída `<val>/execucao-sonda/04-sonda-e05.txt`: 32 conferências OK e 1 com 429 (ver Tentativas, item 6); a conferência que deu 429 foi refeita depois da janela e deu 200 (`<val>/execucao-sonda/07-mordida-e12-e-login-e05.txt`).
- Mordida da 048: `<val>/ferramentas/mordida-e05.mjs`, saída `<val>/execucao-sonda/09-mordida-e05.txt`.
- Testes do repositório no clone: `npx vitest run test/codigos-de-erro.test.ts test/saida-de-municipio.test.ts` em `apps/api`: 2 arquivos, 59 de 59 (22 de `codigos-de-erro`), `<val>/execucao-sonda/08-vitest-e05-e12.txt`.
- Integridade da 048 depois do restore: diff de estrutura origem contra cópia vazio (md5 do corpo, dono, `prosecdef`, `proconfig` e ACL de cada função), e de novo vazio depois da mutação desfeita.

## Cenários positivos

- Token vivo da coordenadora de Serra Alta escreve (`POST /ocorrencias/{c1}/coordenada`): 200.
- Renovação: 200; o token de acesso da sessão rotacionada continua escrevendo (200) enquanto a família tem sessão de pé; no banco, as sessões ficam "viva, rotacionada na renovacao, viva".
- Papel trocado no banco para `operador`: a escrita com o token antigo dá 401 `nao_autenticado`; a renovação dá 200 e o token novo traz `papel: operador`.
- Reativada: a renovação antiga volta a 401 `sessao_encerrada` e entrar dá 200.

## Cenários negativos

Todos contra a API real em PostgreSQL 17.6:

| Situação | Resposta |
| --- | --- |
| Token assinado com o segredo certo e `exp` no passado, escrita e leitura | 401 `nao_autenticado` |
| Reuso do token de renovação já rotacionado | 401 `sessao_encerrada`; depois disso o acesso da sessão nova e o da rotacionada dão 401 `sessao_encerrada` (a família caiu) |
| Sessões encerradas pela administradora (`POST /usuarios/:id/encerrar-sessoes`) | escrita 401 `sessao_encerrada`; renovação 401 `sessao_encerrada`, corpo idêntico ao de um token de renovação desconhecido |
| Município suspenso (`acesso_suspenso_em` preenchido) | 403 `acesso_suspenso` |
| Conta desativada pela rota (`PATCH /usuarios/:id/situacao`) | no banco `ativo = f` e 0 sessões vivas; escrita com token vivo 403 `conta_desativada`; renovação 403 `conta_desativada`, repetível; token vencido dela 401 `nao_autenticado` (o cliente renova e recebe o 403) |
| Conta desativada de A escrevendo em ocorrência de B | 403 `conta_desativada`, corpo idêntico ao da escrita num id que não existe |
| Token vivo de A em ocorrência de B, escrita e leitura | 404 `nao_encontrada`, corpo idêntico ao de id inexistente |
| Entrar com a senha CERTA em conta desativada | 401 `credenciais` "Email ou senha inválidos.", idêntico à senha errada e ao e-mail inexistente |

## Tentativas de reprovar

1. Fiz o caminho que o teste antigo não fazia: desativar pela ROTA do produto (que revoga as sessões na mesma transação) e só depois renovar. Deu 403 `conta_desativada`, não 401.
2. Mordida da 048 em PostgreSQL real: troquei, como `dc360_setup`, o corpo de `dono_do_token` para devolver `usuario_ativo` sempre verdadeiro; a renovação da conta desativada caiu para 401 `sessao_encerrada`. Repus o corpo da 048: voltou a 403 `conta_desativada`. O diff de estrutura contra a origem saiu vazio depois, então a função ficou idêntica à migração.
3. Procurei vazamento de existência entre municípios nas três respostas que dependem de estado: 404 de B contra id aleatório (escrita e leitura), 403 de conta desativada contra B e contra id aleatório, renovação encerrada contra token desconhecido. Comparei o corpo inteiro, byte a byte: iguais nos três pares.
4. Procurei a ordem errada da vigência: conta desativada sai como `conta_desativada` mesmo com as sessões revogadas (a ordem inversa daria `sessao_encerrada`); papel alterado com sessão de pé sai `nao_autenticado`, não `sessao_encerrada`.
5. Conferi o que `dono_do_token` entrega: só dono, três carimbos e o booleano; token desconhecido não devolve linha (o corpo da renovação é o mesmo do encerrado). A função é `SECURITY DEFINER` com `search_path` fixo, `EXECUTE` só para `dc360_app`, dono `dc360_setup`, e o teto de 27 funções `SECURITY DEFINER` continua 27 no restaurado.
6. O único vermelho da sonda foi o último login (429 `excesso_de_requisicoes`): é o limite de 10 entradas por endereço em 5 minutos, que a própria sonda estourou. Refeito depois da janela: 200. Não é defeito da etapa.

## Achados

- Anotado (já conhecido, fora desta etapa): a mensagem do 401 de `/auth/renovar` é "Sessão expirada. Entre novamente.", diferente da mensagem de `sessao_encerrada` no catálogo ("Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente."), que a escrita usa. O código (`erro`) é o mesmo; o próprio RESUMO da correção 1 registra isso como achado do QA. Reprodução: `<val>/execucao-sonda/04-sonda-e05.txt`, seção 5.

Nenhum achado que quebre critério da etapa.

## Não verificado

- PostgreSQL 16 (job `implantavel` do CI) e 17.11 (job `restore`): só rodei 17.6. O run do CI não foi lido.
- O lado do cliente (painel e app reagindo a cada código, frases e capturas): é de outras dimensões; aqui só o servidor e o banco.
- Concorrência entre desativar e renovar ao mesmo tempo (a trava por pessoa é da E07, migração 049): não estressei.
- Tempo de resposta diferente entre token desconhecido e token de conta desativada: não medido (só observável por quem tem o token, como a etapa declara).

## Risco residual

Baixo. O que resta é a leitura com token vivo de conta desativada (200 por até 15 minutos), limitação declarada pela etapa e empurrada para a F03-E03, e a diferença de texto do 401 da renovação.

## Motivo do humano

Nenhum nesta dimensão: tudo o que o banco e a API respondem foi verificado por execução. A aprovação das frases mostradas ao usuário é texto de produto e pertence às dimensões de UX e ao Rafael, não a esta.
