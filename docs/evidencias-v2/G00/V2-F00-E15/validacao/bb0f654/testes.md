---
validador: testes (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **FAIL** na dimensão testes. Um critério explícito do bloco ("o diálogo 'Sair da conta?' ... usa o botão destrutivo") não tem teste que morda: o caso que leva esse nome, "o botão de confirmar é o de perigo, porque o ato apaga" (`apps/campo/src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx:185`, um dos 7 vermelhos que a etapa existe para fechar), não confere o tipo do botão. Trocar `destrutiva: true` por `destrutiva: false` na ação do diálogo de saída (`apps/campo/src/app/(agente)/perfil.tsx`, perto da linha 1477) deixa o lote da etapa verde (66 de 66), o jest INTEIRO do aplicativo verde (1927 de 1927) e o typecheck limpo. O comportamento de hoje está certo (a ação é `destrutiva: true`, que vira `tipo="perigo"` em `ui/Dialogo.tsx:415`); o defeito é a prova: em etapa de risco alto, critério sem mordida não é E1.

Os demais critérios mordem: piso de GPS (função e tela), esquema que recusa 0 e negativo, "Entrar de novo" que não apaga, contagem e frase do diálogo (singular, plural, "apaga"), e o isolamento entre agentes no mesmo aparelho. Continuam vivas, como na rodada 3, as mutações E8 (disco ilegível tratado como "nada a perder"), E9 e E2.

Saídas em `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/testes-E06-E14-E15-E16-E18/`. Mutações por `$V/mutar.py` (troca exata, roda, `git restore`, confere `git status` vazio).

| Critério | Teste que prende | Mutação | Resultado |
| --- | --- | --- | --- |
| **o diálogo usa o botão destrutivo** | nominalmente "o botão de confirmar é o de perigo, porque o ato apaga"; na prática nenhum | D1: `destrutiva: false` na ação "Sair da conta" de `perfil.tsx` | **vivo**: lote 66 de 66 (`e15-16`), jest inteiro 1927 de 1927 (`e15-18`), `tsc --noEmit` código 0 (`e15-23`) |
| diz que sair apaga | `aviso-da-saida.test.ts`, `dialogo-na-conta-com-vistoria-comecada` | A3: a frase de 1 vistoria deixa de dizer "Sair apaga" | morde: 2 reprovam (`e15-22`) |
| singular e plural | idem | A2: `uma = n !== 1` | morde: 5 reprovam (`e15-21`) |
| disco ilegível avisa do mesmo jeito (na função) | `aviso-da-saida.test.ts` | A1: `avisoDaSaida` trata `null` como nada | morde: 1 reprova (`e15-20`) |
| disco ilegível avisa do mesmo jeito (na tela) | nenhum | E8: o `catch` de `perguntarSaida` grava `contarRascunhos([])` no lugar de `null` | **vivo**: lote 66 de 66 (`e15-13`), jest inteiro 1927 de 1927 (`e15-19`) |
| o diálogo conta os itens recusados da fila | nenhum | E9: tira `+ resumoDaFila.bloqueados` | **vivo**: 66 de 66 (`e15-14`) |
| a fila é assinada, não lida uma vez | "quando a fila esvazia, o chip e o aviso de esperar somem sem trocar de aba" | R1: `useState(useResumoDaFila())[0]` congela o primeiro valor | morde: 3 reprovam (`e15-17`) |
| precisão 0,3 vira 1, 12,4 vira 12 | `precisao-do-gps.test.ts`, caso da tela | G1: tira `Math.max(1, ...)` | morde: 3 reprovam (`e15-10`) |
| a tela usa o piso | "abaixo de meio metro vira 1, e não zero" | G2: a tela volta a `Math.round(accuracy)` | morde: 1 reprova (`e15-11`) |
| o esquema recusa 0 e negativo, com mensagem em português, sem afrouxar `positive()` | `packages/shared/test/precisao-do-gps.test.ts`, `mensagens-em-portugues.test.ts` | Z1: `positive()` vira `nonnegative()` | morde: 3 de 11 reprovam (`e15-31`; base 11 de 11 em `e15-30`) |
| "Entrar de novo" (sessão vencida) não apaga nada (correção 1) | `vistoria-sessao-vencida-preserva-o-rascunho` (sessão, banco e rascunho reais) | S1: a tela chama `sair` no lugar de `encerrarSessaoVencida` | morde: 3 reprovam (`e15-12`) |
| outro agente entra e `acolherNoAparelho` limpa | `sair-e-entrar-nao-perde-a-coleta` (SQLite real) | I1: `acolherNoAparelho` nunca apaga | morde: 1 reprova (`e15-24`) |
| dono nulo não deveria apagar | nenhum | E2: tira `dono !== null &&` | **vivo**: 66 de 66 (`e15-15`) |
| API devolve 201 para 1 e para nulo, 422 em português para 0 | `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` | execução | PASS: 3 de 3 (`e15-32`) |

## Evidência

- Lote de 9 arquivos (lista em `$V/lote-e15.txt`): `cd dc360/apps/campo && npx jest --ci --randomize --seed=N`, N = 4, 8, 13: código 0, 66 de 66 em cada (`$V/e15-01-lote-semente-*.txt`).
- Jest inteiro e `npm run test:campo`: código 0, 1927 de 1927, tipos limpos (`$V/00-jest-app-completo.txt`, `$V/00-test-campo.txt`).
- Shared: `cd dc360/packages/shared && npx vitest run test/precisao-do-gps.test.ts test/mensagens-em-portugues.test.ts`: 11 de 11 (`$V/e15-30`).
- API: `npm run test:api` inteiro, 1326 aprovados, 20 pulados, 1 falha conhecida do LibreSSL (`$V/00-test-api-completo.txt`); arquivo de GPS isolado 3 de 3 (`$V/e15-32`).
- Motor: 223 de 223, 3 vezes (`$V/e06-01-*`).
- Mutações: `$V/e15-10` a `e15-24` e `e15-31`.
- Portão T42: `node scripts/portao-de-skip.mjs` código 0.

## Cenários positivos

- A mesma pessoa entra de novo e reencontra checklist, observações, assinatura e foto (`vistoria-sessao-vencida-preserva-o-rascunho`).
- "2 vistorias começadas" no plural e uma só no singular sem foto; precisão 12,4 vira 12.

## Cenários negativos

- Sem rascunho e sem fila o diálogo não fala em apagar (caso existente, verde; A1 e A3 provam que a função de texto está presa).
- Precisão ausente grava `null`; 0 e negativo recusados pelo esquema com frase em português (Z1).
- A saída explícita do Perfil continua apagando (controle de `vistoria-sessao-vencida-preserva-o-rascunho`).

## Tentativas de reprovar

1. **Desliguei o botão destrutivo (D1).** O caso que se chama "o botão de confirmar é o de perigo" confere só `accessibilityLabel === "Sair da conta"`, `accessibilityViewIsModal` e que `sair` não foi chamado (linhas 191 a 196); o comentário dele diz que `destrutiva` "vira o tipo `perigo` do botão", mas nenhuma linha confere isso. A mutação não é equivalente: `Dialogo.tsx:415` desenha `tipo={acao.destrutiva ? "perigo" : "primario"}`, que muda a cor e o desenho do botão. O tipo de `PropsDoDialogo` também não pega (`destrutiva: false` com `recusa` presente casa com o segundo ramo da união). Resultado: verde em todo lugar.
2. Desfiz o piso de GPS em duas camadas e afrouxei o esquema: mordem.
3. Fiz "Entrar de novo" chamar `sair`: morde, com os módulos reais.
4. Desliguei a limpeza entre agentes (I1): morde.
5. Reapliquei E8, E9 e E2 da rodada 3: continuam verdes. E8 é a de mais peso: com o disco ilegível, o diálogo diria "Você vai precisar de sinal e da sua senha" (nada a perder) e a confirmação apagaria a vistoria começada sem aviso, que é o defeito CMP-52 que a etapa existe para impedir. O código de hoje está certo (`perfil.tsx:471`, `setRascunhosNaSaida(null)`), mas nada impede a regressão.
6. Ordem aleatória em 3 sementes: verde.

## Achados

### FAIL (bloqueia nesta dimensão)

1. **Critério "usa o botão destrutivo" sem teste que morda; o caso que leva esse nome é falso.** Reprodução: `$V/e15-16-D1-botao-nao-destrutivo.txt` (lote), `$V/e15-18-D1-botao-nao-destrutivo-jest-inteiro.txt`, `$V/e15-23-D1-typecheck.txt`. Conserto mínimo: no caso `dialogo-na-conta-com-vistoria-comecada.test.tsx:185`, exigir que o botão `dialogo-acao` seja o de perigo (por exemplo, comparar o fundo renderizado com o token de perigo do tema, como `vistoria-camera-legivel-sobre-o-visor.test.tsx` já mede estilo real, ou expor o tipo do `Botao` de forma inspecionável) e provar que D1 o derruba. Dono: E15.

### CORRIGE ANTES DE CRESCER

2. **E8 sem teste** (herdado da rodada 3, ainda vivo). Reprodução: `$V/e15-13-E8-disco-ilegivel-vira-nada.txt` e `e15-19`. Teste a escrever: `listarRascunhos` rejeita ao tocar em "Sair da conta" e o diálogo traz "Não deu para conferir se há vistoria começada". Recomendo entrar no mesmo conserto do item 1, porque é o mesmo diálogo e o modo de falha é o do objetivo da etapa. Dono: E15.
3. **E9 sem teste** (herdado): nenhum caso do diálogo usa item `bloqueado`. Reprodução: `e15-14`. Dono: E15.
4. **E2 sem teste** (herdado): dono nulo apagaria o rascunho de quem entra. Reprodução: `e15-15`. Ligado à pendência de piloto de `acolherNoAparelho` (dono F14-E02).

### ANOTADO

- Os testes de tela do Perfil usam dublês de `useSessao` e de `obterFila`; o arquivo com sessão e banco reais é o contrapeso para a parte de "Entrar de novo", não para o diálogo de saída.

## Não verificado

- Os dois fluxos em aparelho (sair com vistoria começada; GPS abaixo de 0,5 m concluindo sem 422): não há emulador Android nesta máquina nem build de desenvolvimento para o Simulador de iOS; fora desta dimensão, pendência humana E4 do bloco.
- Não reconstruí o pacote `shared` com a mutação Z1 para rodar a rota da API com o esquema afrouxado; a mordida do esquema foi provada no próprio pacote.
- O CI do SHA não foi lido.
- Não escrevi o teste que falta para D1 nem para E8; só provei que as mutações sobrevivem.

## Risco residual

Médio. O comportamento de hoje está certo em todos os pontos que conferi, e os pontos centrais (piso de GPS, esquema, "Entrar de novo" sem apagar, limpeza entre agentes, texto do diálogo) estão presos. Mas o diálogo de saída, que é o ato que apaga coleta, tem dois ramos protegidos só por leitura de código: o botão de perigo (D1) e o disco ilegível (E8). Qualquer refatoração do Perfil pode desfazê-los sem um vermelho.

## Motivo do humano

Nenhum para esta dimensão.
