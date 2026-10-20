---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Suíte na CÓPIA de `fd17ff4`. Nada do repositório editado. O filtro de redirecionamento aberto (`rotaInterna` em `entrar-regras.ts`) e o roteamento (`App.tsx`) NÃO mudaram entre `1ed0b71` e `fd17ff4` (`git diff` vazio nesses arquivos); o diff da E13 nesta rodada só mexe em foco/e-mail (E09). A etapa é reprovável por regressão no filtro, que ataquei.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | `sessao-e-entrada.test.ts` 31 de 31 (`30-e13-sessao.txt`) e leitura da fonte | PASS |
| Entrar partindo de `/` leva à tela do papel (não a "página não existe") | mesma suíte verde | PASS |
| Operador em `/usuarios` segue sem o formulário; rota índice sem sessão leva a `/entrar` | mesma suíte verde | PASS |
| Soma do painel em zero (com E09 e E21) | `npm run test --workspace @dc360/web` verde no CI | PASS (via CI) |

## Evidência

- `SCRATCH/val-red-team/saidas/30-e13-sessao.txt`: `sessao-e-entrada.test.ts`, 31 aprovados, código 0.
- Fonte `entrar-regras.ts:60-65`: `rotaInterna` rejeita não-string, o que não começa com `/`, `//`, `/`, `/?`, `/#`, `/entrar` e `/entrar?`.
- `git diff 1ed0b71..fd17ff4 -- apps/web/src/paginas/entrar-regras.ts apps/web/src/App.tsx`: vazio.
- CI: run 39420436042 sobre `55209ab`, job "Fluxo ponta a ponta no navegador" `success`.

## Cenários positivos

- `voltarPara` com rota interna válida (`/usuarios`) é preservada; sem `voltarPara` cai na tela inicial do papel.

## Cenários negativos

- `//outro.exemplo`, `https://outro.exemplo`, `/`, `/?x`, `/#x`, `/entrar`: `rotaInterna` devolve `null`, então `destinoDepoisDeEntrar` usa a tela do papel. Nenhum redireciona para fora.

## Tentativas de reprovar

1. Redirecionamento aberto por `//host`, esquema absoluto e `/entrar` (o risco que a etapa marca): barrados pelos três `if` de `rotaInterna` e provados pela suíte (31 verdes).
2. Regressão pelo diff: os arquivos do filtro e do roteamento não têm uma linha alterada desde a rodada 6 (PASS); só foco/e-mail mudaram.
3. `destinoDepoisDeEntrar` usa o valor como caminho interno do React Router (navigate), não como URL de redirect HTTP; um `/\x` seria tratado como caminho interno do SPA, não como host externo.

## Achados

- Nenhum. O filtro de redirecionamento não mudou e recusa as formas perigosas.

## Não verificado

- `MOTOR=firefox npm run test:e2e` e o e2e em Chromium na íntegra: dependem de Vite/porta (a outra sessão ocupa a 5811); cobertos pelo job de navegador do CI, verde.
- Zoom/teclado e as confirmações por `role=status` (acessibilidade e UX).

## Risco residual

Baixo. O único vetor de segurança da etapa (redirecionamento aberto) está inalterado e provado fechado.

## Motivo do humano

Não se aplica a esta dimensão; digitar o domínio e chegar à tela do papel é verificação de UX/humano.
