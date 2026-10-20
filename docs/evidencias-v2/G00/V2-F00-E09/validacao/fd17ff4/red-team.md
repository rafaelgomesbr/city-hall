---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

API em processo contra PostgreSQL 17.6 REAL (semente, derrubado no fim); suítes na CÓPIA de `fd17ff4`. Nada do repositório editado. A correção 5 mexeu em foco e e-mail das telas de senha do painel (`foco.ts`, `usar-foco.ts`, `Entrar.tsx`, `MinhaConta.tsx`); a lógica de autorização das rotas (`administracao.ts`, `autenticacao.ts`) não mudou. Ataquei as rotas por HTTP real.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Coordenador/admin de A pede redefinir/listar sessões de B: 404 | HTTP real (Rita admin A -> usuário de B): redefinir 404, encerrar-sessoes 404, `GET sessoes` 404 | PASS |
| A API recusa autoredefinição/autoencerramento (422) | HTTP real (Rita -> própria conta): 422 `autoredefinicao` | PASS |
| Agente chama as três rotas: 403 `sem_permissao` | HTTP real (Diego): redefinir 403, `GET sessoes` 403 | PASS |
| Id de outro município com maiúsculas e hífens codificados não escapa | HTTP real: UPPER -> 404; `%2D` no próprio id -> 422; `%2D` em id de B -> 404 | PASS |
| 8 casos de `seguranca-da-conta`; `GET /auth/sessoes` marca a atual | `sessoes-da-conta.test.ts` verde (`20-suites-seg.txt`) | PASS |

## Evidência

- Ataques HTTP vivos: redefinir-senha Rita->B (lower) 404, (UPPER) 404, (self) 422; `%2D` self 422, `%2D` B 404; encerrar-sessoes Rita->B 404, self 422; `GET /usuarios/:id/sessoes` Rita->B 404, Diego->B 403. Corpos: B = `{"erro":"nao_encontrado",...}`; self = `{"erro":"autoredefinicao",...}`.
- `SCRATCH/val-red-team/saidas/20-suites-seg.txt`: `sessoes-da-conta` entre as 10 suítes, código 0.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`.

## Cenários positivos

- Admin redefine/encerra sessões de usuário do próprio município (coberto pela suíte verde; o 404 cross-tenant e o 422 self confirmam que o caminho legítimo é o que sobra).

## Cenários negativos

- Id de outro município (minúsculas, maiúsculas, hífen `%2D`): 404 em todas as formas; própria conta em qualquer caixa/encoding: 422 (IDOR por normalização de caixa, que reprovou rodada 4, segue fechado).
- Agente nas três rotas: 403.

## Tentativas de reprovar

1. IDOR por caixa/encoding do próprio id para escapar da trava de autorredefinição: `toLowerCase()` + `uuid()` do zod normalizam; self sempre 422, inclusive com `%2D`.
2. Cross-municipality por maiúsculas/hífen codificado para ler ou derrubar sessão de outra organização: 404 em todas; RLS + o 404 (nunca 403) não confirmam existência.
3. Senha atual errada repetida em `/auth/trocar-senha` (MinhaConta): 8 de 8 = 401 `credenciais`, mensagem única; sem lockout dedicado (anotado na E07), bounded pelo teto global por usuário. Pré-existente, não do diff.
4. Enumeração por status/corpo: B e self devolvem corpos distintos mas ambos sem revelar existência em outro município (B = genérico `nao_encontrado`).

## Achados

- **anotado.** Sem lockout por conta em `/auth/trocar-senha` (ver E07); bounded pelo teto global. Pré-existente.

## Não verificado

- A listagem `GET /usuarios/:id/sessoes` não expor IP de terceiros por HTTP vivo: confiei na suíte verde (a semente não deixa sessão de B pronta para a sonda direta de campos).
- As telas, as seis frases, a senha única e o foco (UX, acessibilidade, validação humana) e o leitor de tela.
- Diferença de tempo entre 404/422/403 como canal lateral: não medi (status e corpo já não revelam existência cross-tenant).

## Risco residual

Baixo. A autorização das rotas não mudou e os ataques por caixa/encoding/cross-tenant batem em 404/422/403 corretos.

## Motivo do humano

Não se aplica a esta dimensão; o fluxo no painel e as frases são validação humana e UX.
