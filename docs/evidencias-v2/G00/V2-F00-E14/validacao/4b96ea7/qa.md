---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E14
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**. A etapa só reescreve testes; confirmei que nenhum foi afrouxado e que os dois negativos e o caso de deriva mordem.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-campo/` (abreviada como `qa-campo/`).

| Critério | Resultado |
| --- | --- |
| os 2 testes de frase passam a exigir "Entrar de novo" e "Nada é apagado" e recusam instruir "Sair da conta" | PASS |
| o dublê de `banco-local` em `logout-cala-o-aparelho.test.tsx` ganha `acolherNoAparelho` e `marcarDonoDosDadosLocais`; os 4 casos exercitam o `sessao.tsx` real | PASS |
| caso de deriva falha se `sessao.tsx` importar nome que o dublê não tem | PASS |
| `falha-de-atualizacao.test.ts` e `logout-nao-apaga-prova.test.ts` seguem verdes | PASS |
| nenhum arquivo de produto alterado pela etapa | PASS (ver tentativas) |
| nenhum teste apagado ou afrouxado | PASS |

## Evidência

- `cd dc360/apps/campo && npx jest` nos 3 arquivos da etapa mais `falha-de-atualizacao.test.ts` e `logout-nao-apaga-prova.test.ts`: 5 suítes, 49 de 49 (`qa-campo/80-jest-e14.txt`).
- `npm run test:campo` (mesmo SHA): 129 suítes, 1903 de 1903, tipos limpos (`qa-campo/90-test-campo.txt`).
- `npm run test --workspace @dc360/campo`: 223 de 223 (`qa-campo/10-pacote-campo.txt`).
- `git diff afde25c..4b96ea7` nos 3 arquivos: li linha a linha. Cada expectativa trocada ficou igual ou mais estrita; as afirmações dos casos de logout não mudaram, só o dublê.
- Mutação a (dublê sem `acolherNoAparelho`): 5 de 5 reprovam, entre eles o caso de deriva (`qa-campo/81-mutE14a.txt`); `git restore` e verde de novo.
- Mutação b (a frase da sessão encerrada em `falha-de-atualizacao.ts:167` volta a mandar "Sair da conta"): os 2 testes da etapa reprovam (2 de 40 no conjunto; `qa-campo/82-mutE14b.txt`); `git restore` e verde de novo.

## Cenários positivos

Os 6 testes da etapa passam com a árvore do SHA; `logout-cala-o-aparelho` exercita `marcarDonoDosDadosLocais` e `acolherNoAparelho` reais do `sessao.tsx`.

## Cenários negativos

- A frase da sessão encerrada não instrui "Sair da conta" (`queryByText` nulo no diálogo e no Perfil): confirmado pela mutação b.
- Dublê sem um nome que `sessao.tsx` importa de `banco-local`: o caso de deriva reprova e nomeia a falta (mutação a). O caso lê a fonte de `sessao.tsx` e reprova se o import deixar de casar, em vez de passar por não ter achado nada.

## Tentativas de reprovar

- Procurei afrouxamento: comparei o diff dos três arquivos contra `afde25c`; nenhum `expect` foi removido sem substituto mais estrito, nenhum caso virou `skip` ou `todo`.
- Procurei produto alterado pela etapa: o diff do lote em `falha-de-atualizacao.ts` e `sessao.tsx` vem das E06 e E15 (frases de pausa, `encerrarSessaoVencida`), não da E14. Os três testes da E14 não importam nada que a E14 tenha mudado.
- Tentei enganar o caso de deriva: com o dublê completo e o `sessao.tsx` real o caso passa; com um nome a menos reprova (mutação a). O limite dele é o mesmo de todo teste de fonte: import por `import * as` ou renomeado em outra linha não é visto, mas o `expect(importacao).not.toBeNull()` reprova se o formato mudar.
- Procurei a frase velha no produto: "Sair da conta" aparece como rótulo do botão do Perfil e do diálogo de saída, nunca como instrução na frase da sessão.

## Achados

### BLOQUEIA

Nenhum.

### CORRIGE ANTES DE CRESCER

Nenhum.

### ANOTADO

- `falha-de-atualizacao.test.ts` (o "teste irmão") não fixa a frase de `comoContarAFalha`: com a frase trocada por "Sair da conta" ele continua verde; quem pega são os dois testes da etapa. Registrado, sem ação.

## Não verificado

- A frase renderizada no aparelho: a prova de aparelho é da F14-E12 (a etapa diz não se aplicar E2).
- O dublê fiel ao `banco-local` real em tempo de execução (só a lista de nomes é conferida, não o formato do retorno).

## Risco residual

Baixo. Teste que reescreve para ficar verde é como defeito se esconde; aqui a decisão de 2026-09-15 está no código e nos dois testes de frase, e os dois negativos mordem.

## Motivo do humano

Rafael lê as frases finais da sessão encerrada ("Toque em Entrar de novo", "Nada é apagado"): texto de produto, que a etapa reserva a ele.
