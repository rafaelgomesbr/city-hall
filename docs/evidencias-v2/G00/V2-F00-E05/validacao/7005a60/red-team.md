---
validador: red-team
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo da dimensão: o que um atacante aprende com os três códigos (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`) e o que o corpo do erro entrega. O FAIL funcional do QA (renovação de conta desativada pelo endpoint real) não é refeito aqui; só o corroboro (item 5).

1. Anônimo distingue conta desativada de inexistente por código ou frase em `/auth/entrar`: NÃO distingue. Quatro combinações (desativada com senha certa, desativada com senha errada, inexistente, ativa com senha errada) deram `401 {"erro":"credenciais","mensagem":"Email ou senha inválidos."}`, corpo e content-type idênticos. A desativação foi feita por `PATCH /usuarios/:id/situacao`, o caminho do produto. Tempo (inject, PGlite, medianas): 368 ms desativada com senha certa (n=12), 349 ms desativada com senha errada (n=3), 355 ms inexistente (n=12), 372 ms ativa com senha errada (n=3). Diferença dentro do ruído.
2. Anônimo distingue pela recuperação: `POST /auth/recuperar` com desativada, ativa e inexistente: três `202` com o mesmo corpo.
3. Anônimo distingue pela renovação: `/auth/renovar` com token inventado e com o token de renovação de conta desativada pelo produto: o mesmo `401 sessao_encerrada "Sessão expirada. Entre novamente."`. O código `conta_desativada` só aparece para quem já apresenta token de acesso válido (assinado pelo servidor), como a etapa declara.
4. Sem token, token lixo (`a.b.c`) e JWT `alg none`: `401 nao_autenticado`, independente de qualquer estado de conta.
5. Corroboração do achado 1 do QA: com a conta desativada pelo endpoint real, `/auth/renovar` devolveu `401 sessao_encerrada`, não `conta_desativada`. Reproduzido por mim, mesmo resultado.
6. Corpo do erro não vaza dado interno: 401, 403, 404 e 422 trazem só `erro`, `mensagem` (e `campos` no 422, `requisicao` no 500). UUID malicioso na rota deu 422 de validação, sem eco de SQL. E-mail com NUL deu 422. Senha de 200000 caracteres deu 422 "Precisa ter no máximo 200 caracteres". Sem cabeçalho `server` nem `x-powered-by`. O 403 `conta_desativada` não carrega id, organização nem nome.

## Evidência

- Sonda própria em teste temporário de API (PGlite, duas organizações, `construirServidor` real): `scratchpad/rt-api.txt` (blocos "E05 ..."). Comando: `npx vitest run test/zz-redteam-tmp.test.ts` em `dc360/apps/api`. A primeira rodada acusou uma falha minha no bloco E10 (teto de 5 pedidos por e-mail estourado pelo meu próprio teste); os blocos E05 rodaram completos.
- Arquivo temporário apagado; `git status --porcelain` só mostra pastas `validacao/`.

## Cenários positivos

401 `nao_autenticado` sem token e com token inválido; 403 `conta_desativada` na escrita com token de acesso vivo depois de `PATCH /usuarios/:id/situacao`.

## Cenários negativos

Enumeração por entrada, recuperação, renovação e tempo (itens 1 a 3); corpo malformado, tipo errado, tamanho excessivo, NUL, UUID hostil (item 6). Isolamento entre municípios não refeito: o QA já provou 403 igual para ocorrência real de B e para UUID inexistente.

## Tentativas de reprovar

1. Procurei diferença de status, corpo, content-type e tempo entre conta desativada e inexistente em `/auth/entrar`: não achei.
2. Usei `/auth/recuperar` e `/auth/renovar` como oráculo do estado da conta: não funcionou.
3. Tentei extrair nome de tabela, SQL ou pilha pelo corpo dos erros com 12 entradas hostis: nada vazou.
4. JWT sem assinatura: recusado.
5. Tentei fazer o 403 `conta_desativada` confirmar existência de recurso de outro município: não refeito (ver Não verificado).

## Achados

1. anotado. JSON malformado em `POST /auth/entrar` (corpo `{"email":` com content-type JSON) responde `500 erro_interno`, quando é erro do cliente (400). O corpo não vaza nada, mas o log registra "erro nao tratado" e um alarme por taxa de 500 dispararia com tráfego hostil. Dono: F02-E03 (esquema de erro único).
2. anotado. Leitura com token vivo de conta desativada responde 200 (`GET /auth/eu`): limitação F03-E03 já declarada.
3. Orientação para quando o achado 1 do QA for corrigido: devolver `conta_desativada` a uma renovação revogada só é seguro se a decisão vier do motivo de revogação gravado (usuário desativado) e só para quem apresenta o token de renovação válido. `/auth/entrar` e `/auth/recuperar` não podem mudar.

## Não verificado

- Isolamento de `conta_desativada` contra ocorrência real de B (confiei no QA, que mediu).
- Postgres 17 e tempo em banco real com rede.
- Conta com segundo fator ativo nos três códigos.

## Risco residual

Tempo medido só em PGlite em memória, que não reproduz latência de disco nem de rede.

## Motivo do humano

Não se aplica à dimensão red-team. O portão visual e a leitura das frases continuam com o Rafael (ver relatório do QA).
