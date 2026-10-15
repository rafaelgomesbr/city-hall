---
validador: testes (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS**. Os três arquivos reescritos pela etapa não mudaram desde `4b96ea7` (`git diff --stat 4b96ea7..52952a1` vazio para eles, para `dados/sessao.tsx`, `dados/banco-local.ts` e `dados/falha-de-atualizacao.ts`). Reexecutei tudo no SHA: verdes em ordem aleatória, e as reescritas continuam mordendo. O achado "corrige antes de crescer" das rodadas 1 e 2 (o caso de deriva lê só o primeiro `import` de `banco-local`) continua vivo.

Base: `$SP/val/testes/` (prefixo `e14-`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| os 6 testes passam; `falha-de-atualizacao.test.ts` segue verde; `logout-nao-apaga-prova` segue verde | PASS | 5 arquivos (`a-sessao-que-terminou-nao-e-falta-de-sinal`, `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha`, `logout-cala-o-aparelho`, `falha-de-atualizacao`, `logout-nao-apaga-prova`), `--randomize` sementes 1 a 5: 49 de 49 em todas (`e14-01-...`) |
| a frase da sessão encerrada não instrui "Sair da conta" (negativo) | morde | trocar "Entrar de novo" por "Sair da conta" em `falha-de-atualizacao.ts:167`: 2 reprovam, um em cada tela reescrita (`e14-04-M3-frase-sair-da-conta.txt`) |
| dublê sem `acolherNoAparelho` faz o caso de deriva reprovar | morde | linha do dublê removida: 5 reprovam (os 4 de logout e o de deriva) (`e14-02-...`) |
| dublê fiel ao contrato real de `banco-local` | PASS | `acolherNoAparelho(usuarioId): Promise<{ apagou: boolean }>` (o dublê devolve `{ apagou: false }`), `marcarDonoDosDadosLocais` e `apagarDadosLocais` `Promise<void>` (dublê `async () => undefined`), conferidos em `apps/campo/src/dados/banco-local.ts:231-298`; `sessao.tsx:4` importa exatamente esses três |
| rodadas 1 e 2: o caso de deriva só lê o primeiro `import` | AINDA ABERTO | um segundo `import { donoDosDadosLocais } from "./banco-local"` em `sessao.tsx`: 49 de 49 verdes (`e14-03-M2-segundo-import.txt`) |
| nenhum arquivo de produto alterado pela etapa | PASS | nada mudou nos arquivos da etapa desde a rodada 2 |

## Evidência

- `cd dc360/apps/campo && npx jest --ci --randomize --seed=N <5 arquivos>` com N de 1 a 5: código 0, 49 de 49. `$SP/val/testes/e14-01-cinco-arquivos-5-sementes.txt`.
- Mutações com `git restore src` depois de cada uma, `git status --porcelain src` vazio: `e14-02`, `e14-03`, `e14-04`.

## Cenários positivos

- Os 4 casos de logout exercitam o `sessao.tsx` real com o dublê completo.
- As duas telas mostram "Entrar de novo" e "Nada é apagado".

## Cenários negativos

- A forma antiga ("Sair da conta") reprova nas duas telas reescritas.
- Dublê incompleto reprova com o nome do que falta.

## Tentativas de reprovar

1. Frase antiga de volta no produto: 2 reprovam (as duas reescritas). `falha-de-atualizacao.test.ts` não reprova com essa troca (ele confere o motivo, não o verbo), o que não é defeito desta etapa.
2. Dublê sem `acolherNoAparelho`: reprova.
3. Segundo `import` de `banco-local` em `sessao.tsx`: passa (achado herdado). Se o nome novo fosse chamado no caminho do login, os 4 casos de logout reprovariam com "is not a function", que é a mensagem confusa que o caso de deriva quis evitar.
4. Ordem aleatória: verde em 5 sementes.

## Achados

### CORRIGE ANTES DE CRESCER

1. Herdado das rodadas 1 e 2, ainda vivo: o caso de deriva usa `exec` uma vez sobre a fonte e lê só o primeiro `import { ... } from "./banco-local"`. Reprodução: `e14-03-M2-segundo-import.txt`. Conserto: `matchAll` e unir os nomes de todos os `import` do módulo. Dono: E14.

### ANOTADO

- O negativo das telas confere a ausência de "Sair da conta"; uma variante sem o verbo exato (por exemplo "Saia e entre de novo") passaria pelo negativo, mas não pelo positivo, que exige "Entrar de novo".

## Não verificado

- Prova em aparelho: a etapa diz "E2E: Não se aplica" (F14-E12).
- Leitura humana das frases: pendência humana registrada (D7).

## Risco residual

Baixo. Só testes mudaram na etapa, e eles mordem nos dois pontos que importam.

## Motivo do humano

Nenhum para esta dimensão.
