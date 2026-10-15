---
validador: qa (agente general-purpose com o papel da dimensão)
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

Veredito: **PASS**. A etapa só reescreve testes; nenhum dos arquivos dela, nem o código de produto que eles exercitam (`falha-de-atualizacao.ts`, `sessao.tsx`, `banco-local.ts`), mudou em `4b96ea7..52952a1` (`git log` vazio para esses caminhos). Reexecutei as duas mutações das rodadas 1 e 2 neste SHA e as duas mordem.

Base: `$SP/val/qa/`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| os 2 testes de frase exigem "Entrar de novo" e "Nada é apagado" e recusam instruir "Sair da conta" | PASS | `30-jest-e14.txt`; mutação b abaixo |
| o dublê de `banco-local` em `logout-cala-o-aparelho.test.tsx` tem `acolherNoAparelho` e `marcarDonoDosDadosLocais`; os 4 casos exercitam o `sessao.tsx` real | PASS | `30-jest-e14.txt` |
| caso de deriva reprova se `sessao.tsx` importar nome que o dublê não tem | PASS | mutação a abaixo |
| `falha-de-atualizacao.test.ts` e `logout-nao-apaga-prova.test.ts` verdes | PASS | `30-jest-e14.txt` |
| nenhum arquivo de produto alterado pela etapa; nenhum teste apagado | PASS | diff dos caminhos da etapa vazio desde a rodada 2; rodadas 1 e 2 já conferiram contra `afde25c` |
| regressão: `npm run test:campo` e `npm run test --workspace @dc360/campo` | PASS | 1927 de 1927 e 223 de 223 |

Defeitos das rodadas anteriores: nenhum (PASS nas duas). A anotação da rodada 2 (`falha-de-atualizacao.test.ts` não fixa a frase de `comoContarAFalha`) continua verdadeira: na mutação b só os 2 testes da etapa reprovam, o irmão segue verde.

## Evidência

- `npx jest` nos 3 arquivos da etapa mais `falha-de-atualizacao.test.ts` e `logout-nao-apaga-prova.test.ts`: 5 suítes, 49 de 49 (`30-jest-e14.txt`).
- `npm run test:campo`: tipos limpos, 134 suítes, 1927 de 1927, código 0 (`11-test-campo.txt`); `npx jest` em `apps/campo`: 1927 de 1927 (`13-npx-jest-app.txt`); pacote do motor 223 de 223 (`10-pacote-campo.txt`); portões do app 79 de 79 (`12-portoes.txt`).
- Mutação a: apaguei a linha `acolherNoAparelho: jest.fn(...)` do dublê: 5 de 5 reprovam, inclusive "o dublê do banco local acompanha tudo o que sessao.tsx importa dele" (`31-mutE14a-VERMELHO.txt`). `git restore`.
- Mutação b: em `falha-de-atualizacao.ts:167` a frase volta a mandar tocar em "Sair da conta": 2 reprovam, 38 passam (`32-mutE14b-VERMELHO.txt`). `git restore`; `git status --porcelain` só com as pastas `validacao/52952a1/`.

## Cenários positivos

Os 6 testes da etapa passam; os 4 de logout percorrem `marcarDonoDosDadosLocais` e `acolherNoAparelho` do `sessao.tsx` real.

## Cenários negativos

- A frase da sessão encerrada não instrui "Sair da conta" (mutação b reprova os dois).
- Dublê sem um nome importado por `sessao.tsx`: o caso de deriva reprova (mutação a).

## Tentativas de reprovar

- Conferi se a correção 2 da E06 (frases novas de pausa em `pausa-da-fila.ts` e `ordem-do-dia.ts`) mexeu nas frases que estes testes fixam: não mexeu; os testes seguem verdes e a mutação b ainda morde.
- Rodei a suíte inteira do app duas vezes (pelo `test:campo` e por `npx jest`): nenhum vermelho escondido.
- Procurei afrouxamento novo: os arquivos da etapa não mudaram desde a rodada 2.

## Achados

### BLOQUEIA

Nenhum.

### CORRIGE ANTES DE CRESCER

Nenhum.

### ANOTADO

- `falha-de-atualizacao.test.ts` (o teste irmão) não fixa a frase de `comoContarAFalha`; quem pega a regressão são os dois testes da etapa (igual à rodada 2).

## Não verificado

- A frase renderizada em aparelho: a própria etapa diz que a prova em aparelho é da F14-E12 (E2 não se aplica).
- Fidelidade do dublê de `banco-local` ao formato do retorno real (o caso de deriva confere nomes, não formas).

## Risco residual

Baixo. As duas proteções contra reescrever teste para ficar verde (frase e deriva do dublê) mordem neste SHA.

## Motivo do humano

Não há: as frases finais da sessão encerrada foram aprovadas por instrução (D7, seção 9).
