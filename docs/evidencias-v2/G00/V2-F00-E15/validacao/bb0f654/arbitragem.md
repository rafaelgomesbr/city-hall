---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

**Conflito arbitrado.** `testes.md` (FAIL) contra `qa.md`, `seguranca-aplicacao.md` e `red-team.md` (PASS). `privacidade-lgpd.md` não existia quando esta arbitragem foi escrita. Ponto em disputa: o caso "o botão de confirmar é o de perigo, porque o ato apaga" (`dc360/apps/campo/src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx:185`) não confere o tipo do botão, e trocar `destrutiva: true` por `destrutiva: false` na ação "Sair da conta" de `perfil.tsx` não derruba nenhum teste.

**Decisão da arbitragem: FAIL para a etapa.** Não é decisão de produto (o bloco já decidiu que o botão é o destrutivo), então não cabe BLOCKED para Rafael; e o achado não pode ser rebaixado porque é critério nomeado no bloco, em etapa de risco alto, cuja única prova automatizada é nominal.

Critérios que decidem, com o texto exato:

1. Bloco da etapa, "O que deve ser implementado", item Mobile: "o diálogo "Sair da conta?" conta também os rascunhos (`listarRascunhos`, `dados/rascunho.ts`) e as fotos deles, diz que sair apaga, com singular e plural, **usa o botão destrutivo** e, sem rascunho nem fila, volta à frase curta".
2. Bloco da etapa, "Testes positivos": "**os 7 casos passam**". O caso de `:185` é um dos 7 (os 6 do arquivo do diálogo mais 1 da tela da vistoria). Ele passa, mas não afirma o que o nome promete: confere só `accessibilityLabel === "Sair da conta"`, `accessibilityViewIsModal` e `mockSair` não chamado (linhas 194 a 196). O comentário das linhas 192 e 193 diz que `destrutiva` "vira o tipo `perigo` do botão"; nenhuma linha confere.
3. Política, `28`, seção 8, nível E1: "prova automatizada reproduzível; em risco alto e crítico, inclui a prova de que o teste morde". E, na mesma seção: "**Nenhum PASS sem evidência compatível** com a natureza e o nível de prova exigido. Quando E1 ou E2 forem possíveis para o critério, E3a não pode ser usado para evitá-los." E1 é possível e barato aqui (`dc360/apps/campo/src/ui/dialogo.test.tsx:245` já mede `backgroundColor` contra `temaClaro.perigoFundo` no componente). Logo, a leitura de `perfil.tsx:1477` (E3a) não substitui o E1 que falta.
4. Política, `28`, seção 7: "FAIL: a prova mostrou defeito". O defeito provado é do entregável de teste da etapa (o caso que a etapa existe para tornar verde declara uma garantia que não dá), não do comportamento: o produto hoje está certo.

**O comportamento de hoje.** Certo. `perfil.tsx:1477` tem `destrutiva: true` na ação "Sair da conta", e `dc360/apps/campo/src/ui/Dialogo.tsx:415` desenha `tipo={acao.destrutiva ? "perigo" : "primario"}`. O mapeamento `destrutiva` para `perigo` está preso no nível do componente (`dialogo.test.tsx:239` a `245`); a LIGAÇÃO do Perfil a esse mapeamento não está presa por nada. O tipo de `PropsDoDialogo` (`Dialogo.tsx:149` e `154`) também não pega: `destrutiva: false` com `recusa` presente casa com o segundo ramo da união.

**Outra prova que prenderia.** Nenhuma. Não há captura do diálogo (o RESUMO inicial registra que o Expo não renderiza no ambiente do implementador e que "NÃO há captura do diálogo"); não há snapshot no app (`toMatchSnapshot` e `toMatchInlineSnapshot` sem ocorrência em `src/`); nenhum portão de design ou script fora de `src/` confere `destrutiva` no Perfil. A única prova que veria o botão é a E4 do bloco ("Rafael faz os dois fluxos num aparelho disponível"), ainda pendente, e E4 não substitui E1 quando E1 é possível.

**Os PASS contradizem ou não cobriram?** Não cobriram. Nenhum deles aplicou mutação ao botão:
- `qa.md:26` marca PASS a linha "DoD: diálogo conta rascunhos, singular e plural, botão destrutivo, frase curta sem nada" com uma única mutação, a que ignora os rascunhos (`43-e15-mut-dialogo-sem-rascunhos.txt`). Ela não exercita o botão.
- `red-team.md:21` marca PASS a linha que inclui "botão destrutivo" com as mutações M1 (o diálogo deixa de ler os rascunhos) e M4 (disco que falha vira frase curta). Nenhuma toca `destrutiva`.
- `seguranca-aplicacao.md` não menciona o botão.
Os três confiaram no nome do caso. A prova de `testes.md` é reproduzível e eu a reproduzi (abaixo); não há prova em sentido contrário.

**Atenuantes considerados e por que não rebaixam.** (a) `destrutiva: true` já existia antes da etapa (`afde25c` e o commit de origem `5ecdf4c` têm a mesma linha), então não houve conserto a desfazer. Mas o bloco põe o item em "O que deve ser implementado", e o caso de `:185` é um dos 7 que a etapa assume como prova; a falha é a etapa declarar o critério provado por um teste que não o prova. (b) O DoD não repete "botão destrutivo". Mas o DoD exige "7 testes verdes", e o campo "Testes positivos" diz "os 7 casos passam": um caso cujo assunto não é afirmado não morde, e em risco alto isso não é E1. (c) Com D1 o texto ainda diz "sair apaga", então não há perda de dado nova (não é item 5 da seção 7). Isso define a severidade (baixa no produto), não o veredito: critério do bloco sem prova compatível não vira PASS.

**E8, E9 e E2 (citados por `testes.md`).** Nenhum deles é, sozinho, critério do bloco sem teste:
- E8 (o `catch` de `perguntarSaida`, `perfil.tsx:471`, grava `contarRascunhos([])` em vez de `null`): implementa a premissa (c) registrada no STATUS ("se o disco falhar, o diálogo diz que não deu para conferir e que sair apaga toda vistoria não concluída"). É código novo desta etapa e está no centro do objetivo, mas é premissa do implementador, não texto do bloco; a função está presa (mutação A1 de `testes.md`, e M4 de `red-team.md`), a ligação da tela não. Reproduzi: vivo. Classificação: corrige antes de crescer, e recomendo que entre no mesmo conserto, porque o FAIL já reabre a etapa e é o mesmo diálogo.
- E9 (tirar `+ resumoDaFila.bloqueados` de `perfil.tsx:352`): comportamento anterior à etapa (`afde25c`, linha 452, já somava os bloqueados), coberto só pela premissa (d), que diz que a fila contada "é a mesma de antes". O bloco não pede nada sobre a fila além de assiná-la ao vivo (preso pela mutação R1). Classificação: corrige antes de crescer.
- E2 (tirar `dono !== null &&` de `banco-local.ts:257`): regra de `acolherNoAparelho` anterior à etapa (`afde25c`, linha 254). O bloco diz "a etapa só avisa, não muda a regra", e os dois casos do campo "Testes de autorização e isolamento" (outro agente limpa, a mesma pessoa reencontra) mordem (mutação I1). Classificação: anotado, com dono F14-E02, junto da pendência de piloto de falha aberta de `acolherNoAparelho`.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/arbitragem-E15/`. Árvore do HEAD `0290af5` (só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`).

| Passo | Comando (em `dc360/apps/campo`) | Código | Resultado | Saída |
| --- | --- | --- | --- | --- |
| D1 aplicada | troca exata, por script Python, de `destrutiva: true` para `destrutiva: false` só na ação "Sair da conta" de `src/app/(agente)/perfil.tsx` | n/a | 1 linha alterada (`git diff --stat`) | `d1-diff.txt` |
| D1, lote do Perfil e do diálogo | `npx jest --ci` sobre os 8 arquivos que citam "Sair da conta" ou o aviso (`dialogo-na-conta-com-vistoria-comecada`, `dialogo-na-conta`, `aviso-da-saida`, `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha`, `a-sessao-vencida-nao-apaga-a-vistoria`, `vistoria-como-produto`, `logout-cala-o-aparelho`, `a-sessao-que-terminou-nao-e-falta-de-sinal`) | 0 | 8 suítes, 96 de 96 verdes | `d1-lote-perfil.txt` |
| D1, jest inteiro | `npx jest --ci` | 0 | 134 suítes, 1927 de 1927 verdes | `d1-jest-inteiro.txt` |
| D1, tipos | `npx tsc --noEmit` | 0 | sem erro | `d1-tsc.txt` |
| D1 desfeita | `git restore "dc360/apps/campo/src/app/(agente)/perfil.tsx"` | 0 | `git status` só com as pastas `validacao/bb0f654/` não rastreadas; `perfil.tsx:1477` de volta a `destrutiva: true` | n/a |
| E8 aplicada | troca exata de `setRascunhosNaSaida(null);` por `setRascunhosNaSaida(contarRascunhos([]));` em `perfil.tsx:471` | n/a | 1 linha | n/a |
| E8, jest inteiro | `npx jest --ci` | 0 | 134 suítes, 1927 de 1927 verdes | `e8-jest-inteiro.txt` |
| E8 desfeita | `git restore` do mesmo arquivo | 0 | `git status` limpo como acima | n/a |
| Histórico | `git log --follow` do teste; `git show afde25c:` e `5ecdf4c:` de `perfil.tsx` e `banco-local.ts` | 0 | o caso de `:185` é idêntico desde `5ecdf4c`; `destrutiva: true`, a soma dos bloqueados e `dono !== null &&` existiam antes da etapa | n/a |
| Outros portões | `grep` de `destrutiva` em `dc360` fora de `apps/campo/src/app`; `grep` de snapshot em `src/` | 0 | nenhum portão ou snapshot prende a ligação do Perfil | n/a |

Arquivos gerados e ignorados pelo git (cache do jest) podem ter mudado; nenhum arquivo rastreado ficou alterado.

## Cenários positivos

- Comportamento de hoje: a ação "Sair da conta" é `destrutiva: true` (`perfil.tsx:1477`) e o componente a desenha como `perigo` (`Dialogo.tsx:415`), o que `dialogo.test.tsx:245` prende no nível do componente.
- O texto do diálogo diz que sair apaga, no singular e no plural (mutações A2 e A3 de `testes.md` mordem; não as repeti porque não estão em disputa).

## Cenários negativos

- Com o botão rebaixado a primário (D1), nenhum teste do app reprova: 1927 de 1927, tipos limpos. O caso que se chama "o botão de confirmar é o de perigo" continua verde.
- Com o disco ilegível tratado como "nada a perder" na tela (E8), nenhum teste do app reprova: 1927 de 1927.

## Tentativas de reprovar

1. Procurei uma prova que prendesse D1 fora do arquivo do diálogo: os 8 arquivos que citam "Sair da conta" ou o aviso, o jest inteiro, o `tsc`, snapshots, portões de design em scripts, capturas na evidência. Nada prende.
2. Tentei reprovar o FAIL de `testes.md`: busquei nos três PASS uma mutação que tocasse `destrutiva` e mostrasse o contrário. Não há; QA e red-team marcaram o item com mutações que não exercitam o botão.
3. Tentei enquadrar o achado como fora da etapa (DoD sem "botão destrutivo", linha anterior à etapa). Não se sustenta: o item está no "O que deve ser implementado" e o caso está entre os 7 do campo "Testes positivos".
4. Tentei enquadrar como BLOCKED para Rafael: não depende de decisão de produto, o bloco já decide "usa o botão destrutivo".
5. Conferi se a mutação é equivalente (sem efeito observável): não é, `Dialogo.tsx:415` muda o tipo do botão, e o tipo muda cor e desenho (ver comentário de `Dialogo.tsx:44` a `50`).

## Achados

### FAIL (decide a etapa)

1. **Critério "usa o botão destrutivo" sem E1 que morda; o caso que leva esse nome é nominal.** Reprodução: `d1-lote-perfil.txt`, `d1-jest-inteiro.txt`, `d1-tsc.txt`. Severidade no produto: baixa (o comportamento está certo hoje e o texto continua dizendo "sair apaga"). Severidade no processo: bloqueante, porque é critério do bloco em etapa de risco alto e E1 é possível. Conserto mínimo (não implementado): no caso de `dialogo-na-conta-com-vistoria-comecada.test.tsx:185`, acrescentar a asserção de que o botão `dialogo-acao` é o de perigo (por exemplo, o fundo achatado igual a `temaEscuro.perigoFundo`, já que a suíte fixa o tema escuro, no mesmo molde de `dialogo.test.tsx:245`), e arquivar a mordida: com `destrutiva: false` em `perfil.tsx`, o caso reprova; restaurado, verde. Dono: E15.

### CORRIGE ANTES DE CRESCER

2. **E8: disco ilegível na tela sem teste.** Reprodução: `e8-jest-inteiro.txt`. Teste a escrever: `listarRascunhos` rejeita no toque em "Sair da conta" e o diálogo traz a frase de "não deu para conferir". Recomendo incluí-lo no mesmo conserto do item 1 (mesmo arquivo de teste, mesmo diálogo, e é o modo de falha do objetivo da etapa). Dono: E15.
3. **E9: nenhum caso do diálogo usa item `bloqueado` da fila.** Comportamento anterior à etapa, premissa (d). Dono: E15 ou quem tocar o diálogo de novo.

### ANOTADO

4. **E2: `acolherNoAparelho` com dono nulo sem teste.** Regra anterior à etapa, que o bloco manda não mudar. Dono: F14-E02, junto da pendência de piloto de falha aberta já registrada na rodada 3.

## Não verificado

- Não repeti as demais mutações de `testes.md` (A1 a A3, R1, G1, G2, Z1, S1, I1) nem E9 e E2: não estão em disputa, e E9 e E2 não decidem o veredito.
- Não li `privacidade-lgpd.md`, que não existia quando esta arbitragem foi escrita.
- O CI do SHA não foi lido.
- Os dois fluxos em aparelho (E4 do bloco) não foram feitos: sem emulador nem aparelho nesta sessão.
- Não escrevi o teste que falta; só provei que ele falta.

## Risco residual

Baixo no produto, médio no processo. Hoje o botão é o de perigo e o texto avisa que sair apaga. O risco é de regressão silenciosa: qualquer refatoração do Perfil pode rebaixar o botão (D1) ou fazer o disco ilegível parecer "nada a perder" (E8) sem um vermelho, e a etapa declara o primeiro provado por um caso que não o prova. O conserto é pequeno e cabe numa correção da própria etapa.

## Motivo do humano

Nenhum para a arbitragem: o critério já está decidido no bloco e a prova é automatizável. Continua aberta, fora desta arbitragem, a E4 do bloco ("Rafael faz os dois fluxos num aparelho disponível"), que deve incluir olhar o botão de perigo do diálogo "Sair da conta?" com vistoria começada.
