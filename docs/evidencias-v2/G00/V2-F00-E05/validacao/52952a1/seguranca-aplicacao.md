---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
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

Foco da dimensão: o catálogo de códigos (401 `nao_autenticado`, 401 `sessao_encerrada`, 403 `conta_desativada`) coerente entre API, painel e app. A rodada 2 foi PASS; o diff desde então toca `auth/servico.ts`, `sessoes.ts`, `vigencia.ts` e `suspensao.ts` (E07/E22), então reexecutei.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Catálogo no shared com os seis códigos, status, ação e mensagem; código fora da lista recusado | PASS | `packages/shared/test/codigos-de-erro.test.ts` 10/10 (`60-shared-codigos.txt`) |
| API emite exatamente o catálogo (token vencido 401 `nao_autenticado`, sessão encerrada 401 `sessao_encerrada`, conta desativada 403 `conta_desativada`) | PASS | `apps/api/test/codigos-de-erro.test.ts` verde (`01-suites-alvo-pglite.txt`); sonda A5/E08 (`20-...`, `54-...`): sem token 401 `nao_autenticado`, conta desativada 403 `conta_desativada` |
| Nenhuma ocorrência do código literal `sessao` (só `sessao_encerrada`) | PASS | `grep 'erro: "sessao"'` em `apps/api/src` e `packages/shared/src`: só uma menção, em comentário de `codigos-de-erro.ts:113` |
| Painel trata `sessao_encerrada` como sessão morta e `conta_desativada` com aviso próprio | PASS | `apps/web/src/dados/http.ts:2,106-108` lê `CODIGOS_DE_ERRO_DE_ACESSO` e `ehCodigoDeErroDeAcesso`; renovação recusada por conta desativada vira motivo `conta_desativada` |
| App de campo distingue os três pelo catálogo | PASS | `packages/campo/src/transporte.ts:86-97`: 401 → `sessao_encerrada`, `acaoParaOCodigo === "parar_e_avisar"` → `conta_desativada` |
| `/auth/entrar` mantém recusa genérica (resistência a enumeração) | PASS | `auth/servico.ts:287-320`: email inexistente, senha errada, conta inativa e bloqueio saem com a mesma `MENSAGEM_GENERICA` e mesmo tempo (`gastarTempoEquivalente`) |
| Isolamento: conta desativada do A tentando B recebe `conta_desativada` sem confirmar B; 404 de outro município não muda | PASS | sonda A5 e E08 (`20-...`, `54-...`); `test:isolamento` do validador de banco (345/3) |

## Evidência
- `01-suites-alvo-pglite.txt`: `codigos-de-erro.test.ts` (API) entre as 12 suítes verdes.
- `60-shared-codigos.txt`: catálogo do shared 10/10.
- `20-e07-sonda-login-e-bordas.txt` (bloco A5) e `54-e08-sonda-agente.txt`: respostas reais com os três códigos.
- Mutação ME da E04 (`41-mutacao-ME`) derruba `codigos-de-erro.test.ts` junto: o catálogo está preso ao comportamento.
- Saídas em `$SP/val/seguranca-aplicacao/`.

## Cenários positivos
- Os três códigos emitidos e lidos pelos três clientes; `/auth/entrar` genérico.

## Cenários negativos
- `/auth/entrar` com conta desativada: recusa genérica, igual a e-mail inexistente (`servico.ts:287-321`).
- Código fora do catálogo reprova o teste de catálogo (`60-shared-codigos.txt`).

## Tentativas de reprovar
1. Procurei o código literal `sessao` sobrevivente em `src`: só em comentário.
2. Conferi se o diff E07/E22 trocou algum código: `codigos-de-erro.test.ts` (API) e o teste do shared seguem verdes.
3. Procurei divergência entre o que a API emite e o que painel/app leem: os três importam o mesmo `CODIGOS_DE_ERRO_DE_ACESSO` do shared; nenhuma string de código hardcoded fora dele.
4. Testei corpo vazio nas rotas de auth (bloco F de `20-...`): vira 500 (ver Achados), não um código do catálogo errado.

## Achados
**ANOTADO**
1. Corpo JSON vazio em `POST /auth/entrar`, `/auth/renovar`, `/auth/sair`, `/auth/trocar-senha` responde 500 `erro_interno` em vez de 400/422. Não vaza interno (mensagem genérica + id). Já anotado pela rodada 2 (achado 4), dono F02-E03. Fora do escopo da E05.
2. A frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da mensagem do catálogo para `sessao_encerrada`. Já anotado pela rodada 1 (QA). Conteúdo de produto, não de segurança.

## Não verificado
- As três frases mostradas ao usuário (conteúdo de produto): pendência humana registrada (Rafael lê e aprova). Fora da verificação por execução.
- Capturas das telas (dimensão UX/A11Y).

## Risco residual
- Nenhum de segurança de aplicação nesta etapa; o catálogo está coerente e preso por teste nos três clientes.

## Motivo do humano
A aprovação do texto das três frases é conteúdo de produto; só uma pessoa decide se a redação está adequada (pendência já registrada, não bloqueia por execução).
