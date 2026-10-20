---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Árvore em `5044e7a` (produto idêntico a `1ed0b71`). Node v24.15.0. SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 6 testes verdes | PASS | os três arquivos da etapa mais os irmãos (`a-sessao-vencida-nao-apaga-a-vistoria`, `logout-nao-apaga-prova`, `falha-de-atualizacao`): 6 suítes, 52 de 52, código 0 (`SCRATCH/r6-campo-seis-arquivos.txt`) |
| `falha-de-atualizacao.test.ts` segue verde | PASS | idem |
| O dublê completo faz os 4 casos de logout exercitarem o `sessao.tsx` real | PASS | os 4 casos verdes; sem `acolherNoAparelho` no dublê os 4 reprovam (S1) |
| Negativo: a frase da sessão encerrada não instrui "Sair da conta" | PASS | S2: com "Toque em \"Sair da conta\"" posto em `falha-de-atualizacao.ts`, os 2 casos de frase reprovam (2 falhas em 13) |
| Negativo: dublê sem `acolherNoAparelho` faz o caso de deriva reprovar | PASS | S1: o caso de deriva reprova com `["acolherNoAparelho"]` |
| Autorização e isolamento: `logout-nao-apaga-prova.test.ts` segue verde | PASS | dentro das 6 suítes acima |
| Decisão registrada com evidência | PASS | `docs/DECISOES-DE-TESTE-DA-FASE-00.md:55` e seção "campo: sessão encerrada e logout (E14)" na linha 72 |
| Nenhum arquivo de produto alterado pela etapa | PASS | `apps/campo/src/dados/falha-de-atualizacao.ts` sem mudança em `bb0f654..1ed0b71`; a frase vigente está em `falha-de-atualizacao.ts:164-170`. `dados/sessao.tsx` mudou no diff, mas pela correção da E06 (`novaGeracaoDaSessao`), não por esta etapa |
| Regressão obrigatória | PASS | `npm run test:campo` código 0, typecheck limpo, 139 suítes, 1997 de 1997 (`SCRATCH/r6-test-campo.txt`); `npm run test --workspace @dc360/campo` código 0, 11 arquivos, 238 de 238 (`SCRATCH/r6-test-motor-campo.txt`) |

## Evidência

- `npx jest` nos seis arquivos, código 0: `SCRATCH/r6-campo-seis-arquivos.txt`.
- `npm run test:campo`, código 0, "A leitura do código e o jest concordam: 1997 casos": `SCRATCH/r6-test-campo.txt`.
- `npm run test --workspace @dc360/campo`, código 0: `SCRATCH/r6-test-motor-campo.txt`.
- `npm run typecheck` (inclui `@dc360/campo`), código 0: `SCRATCH/r6-typecheck.txt`.
- Mutações (feitas e desfeitas com `git restore`, árvore conferida limpa): `SCRATCH/r6-mutacao-e14-s1-duble.txt`, `r6-mutacao-e14-s2-frase.txt`, `r6-mutacao-e14-s3-segundo-import.txt`.

## Cenários positivos

- A sessão encerrada mostra "Toque em \"Entrar de novo\"" e "Nada é apagado" na tela e no aviso do Perfil.
- Os 4 casos de logout (ficha mandada junto, aparelho sem ficha, ficha esquecida depois, município guardado) passam com o `sessao.tsx` real.
- O caso de deriva lista os nomes importados de `./banco-local` e confere todos no dublê.

## Cenários negativos

- S1: dublê sem `acolherNoAparelho`: 5 de 5 do arquivo reprovam, e o de deriva aponta o nome que falta.
- S2: frase antiga ("Sair da conta") na sessão encerrada: os 2 casos de frase reprovam.
- A outra frase que cita "Sair da conta" (`falha-de-atualizacao.ts:220`) é a de acesso suspenso e diz que sair "não resolve"; não é instrução e não é a sessão encerrada.

## Tentativas de reprovar

- S1 e S2 acima, os dois mordem.
- S3: acrescentei em `dados/sessao.tsx` um SEGUNDO `import { donoDosDadosLocais } from "./banco-local"` (nome que o dublê não tem). O caso de deriva continua verde, 5 de 5 (achado 1). Restaurado.
- Regressão pelo diff `bb0f654..1ed0b71`: `sessao.tsx` ganhou o import de `./geracao-da-sessao` e `perfil.tsx`, `index.tsx` e `fila.tsx` mudaram (correções da E06). Rodei os três arquivos da etapa, os irmãos e o jest inteiro: tudo verde, e as frases vigentes continuam as exigidas.

## Achados

1. Corrige antes de crescer (herdado da rodada 4, continua): o caso de deriva só lê o PRIMEIRO `import { ... } from "./banco-local"` de `sessao.tsx` (`logout-cala-o-aparelho.test.tsx:183`, `RegExp.exec` sem laço). Reprodução: `SCRATCH/r6-mutacao-e14-s3-segundo-import.txt`. Hoje há um import só, e um nome novo usado no caminho do logout ainda faria os 4 casos reprovarem por `TypeError`; o buraco vale para nome importado e não exercitado. Não viola o critério da etapa.

## Não verificado

- O texto desenhado num aparelho ou emulador: não há nenhum nesta máquina; a prova é o texto que o teste de componente desenha (a etapa diz que a prova em aparelho é a F14-E12).
- CI do SHA: ausente (H32). Node 22 do `.nvmrc`: rodado em Node 24.15.0.

## Risco residual

Baixo. Os testes reescritos prendem a decisão vigente e mordem quando a frase antiga ou o dublê velho voltam. Fica o ponto cego do caso de deriva com um segundo import.

## Motivo do humano

A etapa pede que Rafael leia as frases finais da sessão encerrada. Julgar se o texto é claro para um agente de campo é decisão de produto dele.
