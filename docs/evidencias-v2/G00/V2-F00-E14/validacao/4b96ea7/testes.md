---
validador: testes
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

Veredito na primeira linha: **PASS**. Os três arquivos da etapa não mudaram desde a rodada 1 (`git diff 7005a60..4b96ea7` nesses caminhos é vazio), e as mutações que importam continuam sendo mortas. Os limites do caso de deriva já apontados na rodada 1 seguem de pé, anotados.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/testes/` (abreviada `testes/`; índice em `testes/00-INDICE-DE-MUTACOES.txt`, entradas B1 a B8).

| Critério | Resultado |
| --- | --- |
| os 6 testes (2 de frase, 4 de logout) verdes | PASS (lote de 5 arquivos, 49 de 49, `testes/60-e14-base.txt`) |
| a frase da sessão encerrada exige "Entrar de novo" e "Nada é apagado" e recusa instruir "Sair da conta" | PASS (B4: 2 reprovam; B5: 2 reprovam) |
| o dublê completo faz os 4 casos de logout exercitarem o `sessao.tsx` real | PASS (B1: 5 reprovam) |
| o caso de deriva reprova se `sessao.tsx` importar um nome que o dublê não tem | PASS no caso de um nome a mais no import existente (B2 reprova); **sobrevive** no segundo import (B3) |
| nenhum arquivo de produto alterado; decisão registrada | PASS (`saidas/08` lista 3 arquivos de teste; registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção E14, com `index.tsx:1222` conferido por mim) |
| `logout-nao-apaga-prova.test.ts` segue verde | PASS (dentro do lote de 49) |

## Evidência

- `cd dc360/apps/campo && npx jest` em `push/logout-cala-o-aparelho`, `a-sessao-que-terminou-nao-e-falta-de-sinal`, `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha`, `falha-de-atualizacao` e `logout-nao-apaga-prova`: 5 suítes, 49 de 49.
- Lote de 21 arquivos do app com `jest --randomize`, 3 vezes (`testes/110-app-lote-randomizado-3x.txt`): os três arquivos da E14 passam em todas; o único arquivo que reprova é de outra etapa (`troca-de-conta-com-pedido-em-voo`, relatório da E06).
- Mutações, uma por vez, `git restore` depois de cada (script `testes/e14-muts.mjs`, saídas `testes/m-B*.txt`):
  - B1 dublê sem `acolherNoAparelho`: **morta** (5 reprovam: o caso de deriva e os 4 de logout).
  - B2 `sessao.tsx` importa um nome a mais no mesmo import (`esquecerConexao`): **morta** pelo caso de deriva (1 reprova, nomeando o nome).
  - B3 o mesmo nome num segundo `import { ... } from "./banco-local"`: **SOBREVIVE** (49 de 49). O caso de deriva lê só a primeira declaração.
  - B4 `falha-de-atualizacao.ts` volta a mandar `Toque em "Sair da conta"`: **morta** (os dois arquivos de frase reprovam).
  - B5 some o `Nada é apagado:`: **morta** (os dois reprovam).
  - B6 o dublê de `acolherNoAparelho` devolve `{ apagou: true }`: sobrevive, e é equivalente: os 4 casos de logout falam da mesma pessoa entrando e não leem esse retorno.
  - B7 acrescenta `Ou use "Sair da conta".` ao detalhe: **morta** no diálogo da lista (`a-sessao-que-terminou-nao-e-falta-de-sinal`, 1 reprova), e o teste do Perfil sozinho não a pega (o negativo dele é `/toque em "Sair da conta"/i`, estreito).
  - B8 `type ResultadoQualquer` dentro do import: reprova, mas **por falso positivo**: o caso de deriva trata o tipo como nome faltando no dublê.

## Cenários positivos

Frase vigente nas duas telas, logout com ficha, esquecimento da ficha, município guardado, mesma pessoa reencontra a vistoria (`logout-nao-apaga-prova`).

## Cenários negativos

Diálogo da lista e Perfil não instruem o verbo que apaga (B4, B7); dublê incompleto reprova com o nome (B1, B2); import de tipo dentro do import não passa em silêncio, ainda que pelo motivo errado (B8).

## Tentativas de reprovar

- Teste que trava comportamento errado: a instrução "Entrar de novo" é a que o código manda (conferi `index.tsx:1217-1235`: o botão chama `encerrarSessaoVencida`, não `sair`), e o commit `5ecdf4c` existe. Reescrever os dois testes não esconde defeito: o produto é a verdade nos seis casos, com registro.
- Asserção que nunca falha: B4 e B5 derrubam as de frase; B1 derruba as do logout.
- Negativo estreito: achei (B7, Perfil), coberto pelo diálogo da lista.
- Caso de deriva que passa por acaso: achei o segundo import (B3). A garantia que o cabeçalho do teste promete ("se amanhã o `sessao.tsx` importar um quarto, a falha diz o nome") só vale para o primeiro `import { ... } from "./banco-local"`.
- Ordem e repetição: lote randomizado 3 vezes, verde; sem relógio, sem espera fixa.
- Dublê que não reproduz o contrato: `acolherNoAparelho` devolve `{ apagou: false }` e `marcarDonoDosDadosLocais` devolve `undefined`, como a função real; o disco real tem prova própria em `logout-nao-apaga-prova.test.ts`. O dublê é de módulo do próprio aplicativo, aceito pelo registro porque o banco de verdade aparece nos testes da E15.

## Achados

- Anotado: o caso de deriva só enxerga a primeira declaração `import { ... } from "./banco-local"` (B3) e acusa `type X` inline como nome faltando (B8). Falha ruidosa no segundo, silenciosa no primeiro. Mesmo achado da rodada 1; não houve mudança.
- Anotado: o negativo do Perfil só recusa a frase antiga exata (B7).
- Anotado: dublê de módulo interno (`banco-local`), aceito pelo registro.

## Não verificado

- Leitura humana das frases finais da sessão encerrada (texto de produto, o bloco pede Rafael).
- Renderização em aparelho: o Expo não renderiza no ambiente de teste; a prova é teste de componente. A prova em aparelho é da F14-E12.

## Risco residual

Baixo: só teste mudou, e os dois consertos de dublê e de frase mordem. O ponto cego do caso de deriva só aparece se alguém dividir o import de `banco-local` em duas linhas e esquecer o dublê, e aí os 4 casos de logout falham com `is not a function`, que é a mensagem confusa que o caso de deriva queria evitar.

## Motivo do humano

O bloco da etapa pede que o Rafael leia as frases finais da sessão encerrada: clareza de texto só uma pessoa julga.
