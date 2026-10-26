---
validador: testes (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Veredito: **PASS** na dimensão testes. Os seis testes reescritos e o caso de deriva estão verdes em ordem aleatória e mordem: a frase antiga de volta, a frase sem "Nada é apagado", a frase com "Sair da conta" acrescentada e o dublê sem `acolherNoAparelho` derrubam os casos certos. Nenhum arquivo da etapa nem `dados/sessao.tsx`, `dados/banco-local.ts` e `dados/falha-de-atualizacao.ts` mudou desde a rodada 3 (`git diff --stat 52952a1..bb0f654 -- dc360/apps/campo/src` vazio). O achado "corrige antes de crescer" das rodadas anteriores (o caso de deriva lê só o primeiro `import`) continua vivo e foi reproduzido de novo.

Saídas em `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/testes-E06-E14-E15-E16-E18/`. Mutações por `$V/mutar.py` (troca exata, roda, `git restore`, confere `git status` vazio).

| Critério | Teste que prende | Mutação | Resultado |
| --- | --- | --- | --- |
| a frase vigente manda "Entrar de novo" (V-CAM-01 e 02) | `a-sessao-que-terminou-nao-e-falta-de-sinal` ("o ⓘ ensina o caminho de volta"), `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha` ("e ensina o caminho de volta"), mais `a-sessao-vencida-nao-apaga-a-vistoria` | M1: `Toque em "Entrar de novo"` vira `Toque em "Sair da conta"` em `falha-de-atualizacao.ts` | morde: 3 de 52 reprovam (`e14-10`) |
| a frase promete "Nada é apagado" | os dois reescritos | M2: tira "Nada é apagado:" | morde: 2 reprovam (`e14-11`) |
| NEGATIVO: a frase não instrui "Sair da conta" (`not.toMatch`) | os dois reescritos e o irmão | M3: mantém "Entrar de novo" e ACRESCENTA `(ou toque em "Sair da conta")` | morde: 3 reprovam (`e14-12`); o positivo continuaria verde, então é o negativo que pega |
| dublê completo faz os 4 casos de logout exercitarem o `sessao.tsx` real (V-CAM-03 a 06) | `logout-cala-o-aparelho.test.tsx` | M4: tira `acolherNoAparelho` do dublê | morde: os 4 de logout e o de deriva reprovam (`e14-13`) |
| caso de deriva reprova se `sessao.tsx` importar de `banco-local` um nome que o dublê não tem | caso de deriva | M5: segundo `import { donoDosDadosLocais } from "./banco-local"` em `sessao.tsx` | **vivo**: 52 de 52 (`e14-14`) |
| `falha-de-atualizacao.test.ts` e `logout-nao-apaga-prova.test.ts` seguem verdes | os próprios | ordem aleatória | PASS: 52 de 52 em 3 sementes |
| dublê fiel ao contrato | leitura | `banco-local.ts:231,255,298`: `marcarDonoDosDadosLocais` e `apagarDadosLocais` `Promise<void>`, `acolherNoAparelho` `Promise<{ apagou: boolean }>`; o dublê devolve `undefined` e `{ apagou: false }`; `sessao.tsx:4` importa exatamente os três | PASS |

## Evidência

- Lote de 6 arquivos (os 3 da etapa, `falha-de-atualizacao`, `logout-nao-apaga-prova` e o irmão `a-sessao-vencida-nao-apaga-a-vistoria`; lista em `$V/lote-e14.txt`): `cd dc360/apps/campo && npx jest --ci --randomize --seed=N`, N = 2, 5, 9: código 0, 52 de 52 em cada (`$V/e14-01-lote-semente-*.txt`).
- Jest inteiro do aplicativo e `npm run test:campo`: código 0, 1927 de 1927, tipos limpos, contagem confere (`$V/00-jest-app-completo.txt`, `$V/00-test-campo.txt`).
- Motor (regressão obrigatória): `npx vitest run` em `packages/campo`, 223 de 223, 3 vezes (`$V/e06-01-*`).
- Mutações: `$V/e14-10` a `e14-14`, cada uma com "restaurado: True" no fim.
- Portão T42: `node scripts/portao-de-skip.mjs` código 0; nenhum `.only` ou `.skip` nos arquivos da etapa.

## Cenários positivos

- As duas telas mostram `Toque em "Entrar de novo"` e "Nada é apagado".
- Os 4 casos de logout passam pelo `sessao.tsx` real com o dublê completo.

## Cenários negativos

- A forma antiga ("Sair da conta") reprova nas duas telas reescritas, e também quando é ACRESCENTADA ao lado da forma certa (M3).
- O dublê incompleto reprova com o nome do que falta.

## Tentativas de reprovar

1. Frase antiga de volta, frase sem a promessa e frase mista: as três reprovam (M1, M2, M3).
2. Dublê sem `acolherNoAparelho`: reprova (M4).
3. Segundo `import` de `banco-local` em `sessao.tsx` com um nome que o dublê não tem: passa (M5). O caso de deriva usa `exec` uma vez e só lê o primeiro `import { ... } from "./banco-local"`; também não vê `import * as` nem `import` padrão. Se o nome novo for chamado no login, os 4 casos de logout reprovariam com "is not a function", que é exatamente a mensagem confusa que o caso de deriva veio evitar.
4. Ordem aleatória em 3 sementes: verde.

## Achados

### CORRIGE ANTES DE CRESCER

1. **O caso de deriva lê só o primeiro `import` de `./banco-local`** (herdado das rodadas 1, 2 e 3, ainda vivo). Reprodução: `$V/e14-14-M5-segundo-import-de-banco-local.txt`. Conserto: `matchAll` sobre a fonte e unir os nomes de todos os `import` do módulo (e reprovar `import * as`). Dono: E14.

### ANOTADO

- O negativo confere a ausência de "Sair da conta"; uma variante sem o verbo exato ("Saia e entre de novo") passaria pelo negativo, mas não pelo positivo, que exige "Entrar de novo".

## Não verificado

- Prova em aparelho: o bloco diz "E2E: Não se aplica" (F14-E12).
- Leitura humana das frases finais: pendência humana registrada no bloco.
- O CI do SHA não foi lido.

## Risco residual

Baixo. Só testes mudaram na etapa, eles mordem nos pontos que importam, e o único buraco é de manutenção (deriva futura do dublê), não de comportamento.

## Motivo do humano

Nenhum para esta dimensão.
