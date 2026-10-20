---
validador: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Arbitragem do conflito entre `seguranca-aplicacao.md` (FAIL, confiança média) e `red-team.md` (PASS, confiança alta), ambos sobre `4ce0433`, no critério de isolamento da etapa. Os dois relatórios foram lidos inteiros, e também o `VEREDITO.md` da E15 (rodadas 1 a 4). Execução própria num worktree destacado em `4ce0433` (`$A/wt`, onde `$A` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A02-arbitragem-e15`), com `node_modules` por link para a árvore principal. Nenhum arquivo da árvore principal foi tocado além deste relatório.

- **O critério em disputa existe na etapa e é dela.** Campo "Testes de autorização e isolamento" do bloco da V2-F00-E15 (`docs/roadmap-v2/03-fase-00-estabilizacao.md:462`): "outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida); a mesma pessoa reencontra a vistoria". O campo "Risco de segurança" diz qual é a regra: "quem entra depois não vê o dado de quem saiu". A etapa é de risco alto, e a seção 8 de `28` exige em risco alto prova de que o teste morde. Não é critério inventado: está escrito na etapa, com o ato ("outro agente entra no aparelho") e o resultado ("limpa").
- **O que o teste da etapa prova.** `apps/campo/src/dados/sair-e-entrar-nao-perde-a-coleta.test.ts`, caso "o Bruno entra: o rascunho da Ana é limpo" (linhas 178 a 190), chama `acolherNoAparelho(BRUNO)` direto. Ele prova que a função limpa quando é chamada; não prova que entrar no aparelho a chama. O cabeçalho do próprio arquivo diz que o propósito é que "nenhuma mudança futura" mova a regra "em silêncio".
- **Mutação da Segurança reproduzida (S9b, a realista).** Tirar `await acolherNoAparelho(r.identidade.usuarioId);` de `entrar` em `apps/campo/src/dados/sessao.tsx` e o nome dela do `import` (como faria uma refatoração do login): `tsc` do app código 0; jest INTEIRO do app 134 suítes, 1932 de 1932, código 0; `packages/campo` 10 arquivos, 231 de 231, código 0. Nenhum teste do repositório fica vermelho. Sob a mesma mutação, a sonda com o `ProvedorDeSessao`, o `banco-local` e o `rascunho` reais sobre SQLite do Node reprova: o Bruno entra por `entrar` e `listarRascunhos()` devolve o rascunho da Ana (protocolo, coordenada, observação, nome da moradora que assinou, foto e assinatura).
- **Mutação S9 crua (só a linha).** Jest inteiro 1932 de 1932 verde, como a Segurança disse. O `tsc` do app acusa `TS6133: 'acolherNoAparelho' is declared but its value is never read` (código 2), então o `npm run test:campo` pararia por acidente de import sem uso, não por teste. Basta tirar o import junto (S9b) para tudo ficar verde. Isso não é teste que morde.
- **O que é a mutação X3 do Red-team.** Lida em `scratchpad/val/L10-red-team/scripts/mutar-e15.mjs`: troca, DENTRO de `acolherNoAparelho` (`apps/campo/src/dados/banco-local.ts`), `const apagou = dono !== null && dono !== usuarioId;` por `const apagou = false && dono !== usuarioId;`. Não toca em `sessao.tsx` nem em `entrar`. Reproduzi X3 contra o jest INTEIRO: 1 falha em 1932, e a única suíte vermelha é `sair-e-entrar-nao-perde-a-coleta.test.ts` (o teste no nível da função). Nenhum teste que passa por `entrar` reprova com X3. A sonda do Red-team (`scripts/sonda-e15-aparelho.test.ts`) também chama `acolherNoAparelho` direto (linhas 174 a 192), nunca `entrar`. O PASS do Red-team prova a função, não o caminho real.
- **A outra metade do mesmo critério foi provada pelo caminho real.** "A mesma pessoa reencontra a vistoria" é provada com `entrar` do provedor real em `src/__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` (linhas 199 e 243). Só a metade que protege o dado de outra pessoa ficou sem prova no caminho de entrada. O único teste que passa por `entrar` com troca de conta, `src/push/logout-cala-o-aparelho.test.tsx`, usa dublê de `acolherNoAparelho` que devolve `{ apagou: false }` fixo e não pode morder.
- **O produto hoje está certo.** Sem mutação, a mesma sonda pelo provedor real passa (A1 e A2 verdes): o Bruno não vê nada da Ana e a Ana, voltando, reencontra. O defeito é de prova, não de comportamento.

## Evidência

Saídas em `$A/saidas/`:

- `S9-mutacao.diff` e `01-jest-app-inteiro-com-S9.txt`: S9 crua, `npx jest` em `dc360/apps/campo`, 134 suítes, 1932 de 1932, código 0.
- `02-tsc-app-com-S9.txt`: `npx tsc -p tsconfig.json --noEmit` com S9 crua, código 2, só o TS6133 do import sem uso.
- `S9b-mutacao.diff`, `03-tsc-app-com-S9b.txt` (código 0) e `04-jest-app-inteiro-com-S9b.txt` (134 suítes, 1932 de 1932, código 0).
- `05-packages-campo-com-S9b.txt`: `npx vitest run` em `dc360/packages/campo`, 10 arquivos, 231 de 231, código 0.
- `06-sonda-provedor-real-com-S9b.txt`: a sonda da Segurança (`scratchpad/val/L12-seguranca/sonda/zz-troca-de-conta-validador.test.tsx`, cópia em `$A/sonda/`), posta em `src/__tests__/` do worktree só para rodar e apagada depois, casos A1 e A2: A1 reprova (esperado 0 rascunhos, recebido 1, o da Ana), A2 passa, código 1.
- `07-sonda-provedor-real-sem-mutacao.txt`: a mesma sonda com `sessao.tsx` restaurado (SHA-256 `aaddd972...` igual ao original, `sha-original.txt`): A1 e A2 verdes, código 0.
- `08-jest-app-inteiro-com-X3.txt`: X3 do Red-team contra o jest inteiro, 1 falha em 1932, só em `sair-e-entrar-nao-perde-a-coleta.test.ts`, código 1. Restaurado com `git checkout` no worktree; `git status` do worktree sem arquivo rastreado alterado.

## Cenários positivos

- Sem mutação: o Bruno que entra pelo provedor real depois da sessão vencida da Ana recebe o aparelho sem o rascunho, a foto e a assinatura dela (sonda A1 verde).
- Sem mutação: a Ana que volta pelo provedor real reencontra a vistoria (sonda A2 verde; `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`).
- `acolherNoAparelho` chamada direto com outra pessoa limpa o rascunho e as provas e mantém a fila da autora (teste da etapa; morde com X3).

## Cenários negativos

- S9b (login sem `acolherNoAparelho`): o Bruno, recém-entrado, lê pelo `listarRascunhos` a vistoria começada da Ana, com dado pessoal da moradora (sonda A1 vermelha). Nenhum teste do repositório percebe (jest 1932 de 1932, tsc 0, `packages/campo` 231 de 231).
- X3 (a função não apaga): só o teste no nível da função percebe.

## Tentativas de reprovar

- Procurei, no app e no pacote, qualquer teste que passe por `entrar` do `ProvedorDeSessao` real com troca de pessoa e `banco-local` real: há só dois arquivos que chamam `entrar` real, um com a mesma pessoa (`vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`) e outro com `acolherNoAparelho` em dublê fixo (`logout-cala-o-aparelho.test.tsx`). Nenhum morde em S9b.
- Procurei portão estático (`dc360/scripts`, `scripts/`, `.github`) que exija a chamada no login: nenhum cita `acolherNoAparelho`. O caso de deriva de `logout-cala-o-aparelho.test.tsx` lê os imports de `sessao.tsx` para conferir o dublê; com o import retirado ele fica menos exigente e passa.
- Tentei a leitura favorável ao PASS: o campo de teste nomeia `acolherNoAparelho` como sujeito, a etapa "não muda a regra" e não tocou em `sessao.tsx` (o último commit nele é `5d6bc57`, E01 a E10), e o GAP-P1O-11 (`docs/roadmap-v2/17-rastreabilidade.md:693`, "troca de pessoa no aparelho sem teste") é da F14-E02. Não se sustenta: (a) o campo descreve o ato "outro agente entra no aparelho", e entrar no aparelho é `entrar`; um teste que troca o ato pela chamada da função não tem como ver o ato faltar; (b) "regra mantida" é proteção contra regressão, e o próprio teste diz que existe para que "nenhuma mudança futura" mova a regra; S9b é exatamente essa mudança e passa; (c) a etapa provou pelo caminho real a metade do critério que protege a coleta da própria pessoa e deixou só no nível da função a metade que protege o dado de outra pessoa; (d) o bloco da F14-E02 (`docs/roadmap-v2/10-campo-reinspecao.md:410-418`) pede testes de `acolherNoAparelho`, `marcarDonoDosDadosLocais` e `sair()`, e também não pede o caminho do login: se a E15 passar assim, a lacuna fica sem dono; (e) é critério de vazamento de dado de outra pessoa, item 3 da seção 7 de `28`, que não admite risco aceito.
- Conferi que o FAIL da Segurança não é a falha aberta já classificada na rodada 4 (marca do dono ausente ou limpeza que falha no meio, fora da E15, dono F14-E02): a mutação S9b deixa a função intacta e a marca do dono presente; o que falta é a prova de que o login a chama. São defeitos diferentes, e esta arbitragem não reabre a classificação daquele.

## Achados

**Decisão: FAIL na dimensão de segurança da V2-F00-E15. A Segurança está certa; o PASS do Red-team prova a função, não o critério.**

1. **bloqueia.** O critério de isolamento da etapa ("outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida)") não tem teste que morda no caminho real. Reprodução: no SHA `4ce0433`, em `dc360/apps/campo/src/dados/sessao.tsx`, apagar a linha `await acolherNoAparelho(r.identidade.usuarioId);` de `entrar` e o nome `acolherNoAparelho` do `import` da linha 4; rodar `npx tsc -p tsconfig.json --noEmit` e `npx jest` em `dc360/apps/campo` e `npx vitest run` em `dc360/packages/campo`: código 0 nos três (1932 de 1932 e 231 de 231). Com a mesma mudança, o agente seguinte que entra pelo login lê a vistoria começada do anterior (sonda A1). A mutação X3 do Red-team não exercita `entrar`: muda o corpo de `acolherNoAparelho` e só reprova o teste que chama a função direto. Em etapa de risco alto, critério de vazamento de dado de outra pessoa sem prova que morda não vira PASS nem admite risco aceito (seção 7, item 3, e seção 8 de `28`).

   **Conserto mínimo (só teste, nenhuma mudança de produto):** um caso no jest do app com o `ProvedorDeSessao`, o `banco-local` e o `rascunho` reais sobre SQLite do Node (o harness de `src/__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` já tem tudo): a Ana entra por `entrar`, deixa rascunho com foto e assinatura, a sessão vence (`encerrarSessaoVencida`), o Bruno entra por `entrar`; o caso confere que `listarRascunhos()` volta vazio, que a foto e a assinatura do rascunho saíram do disco e que o item da fila da Ana continua `pendente`. Arquivar a mordida: com a chamada e o import retirados de `entrar` (S9b) o caso reprova; restaurado, passa. Atualizar a contagem de casos que o `conferir:numeros` exigir.

2. **anotado.** A mutação S9 crua (só a linha) é pega pelo `tsc` do app (TS6133, import sem uso) dentro de `npm run test:campo`. Isso é acaso de configuração do compilador, não prova do comportamento, e some com S9b.

3. **anotado.** O comentário de `src/__tests__/a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` (linhas 14 e 15) aponta como prova do login um arquivo que não existe (`dados/sessao-vencida-nao-apaga.test.tsx`), já registrado no STATUS como achado da E15. Quando o caso do conserto existir, o comentário pode apontar para ele.

Itens do "Motivo do veredito" da rodada 4: o botão de perigo (D1) e o E8 estão consertados, pelo que os dois relatórios em disputa reproduziram e esta arbitragem não contesta. O FAIL desta arbitragem é outro defeito, da mesma classe (prova que não morde em risco alto).

## Não verificado

- Não refiz a sonda inteira da Segurança (casos C1 a C4, do cofre): rodei só A1 e A2, que são os do critério em disputa. Os achados de cofre (S2, S6, S10) ficam como a Segurança os classificou (corrige antes de crescer), fora desta arbitragem.
- Não rodei `npm run test:campo` pelo roteiro (que compila os pacotes e confere a contagem); rodei as partes dele (`tsc` e `jest`) direto no app. Não rodei `npm run test:api` nem o shared: não tocam no caminho em disputa.
- Aparelho ou emulador: o app Expo não roda aqui; `expo-sqlite`, `expo-secure-store` e o disco de arquivos são simulados na sonda e nos testes.
- A falha aberta de `acolherNoAparelho` (marca ausente, limpeza que falha no meio) não foi reavaliada: é classificação da rodada 4, fora da E15, dono F14-E02.

## Risco residual

Hoje o produto isola: quem entra depois não vê o rascunho de quem saiu. O que falta é a trava: o aparelho de plantão passa de turno em turno, e uma refatoração do login que perca uma linha passa por todas as suítes do repositório e deixa o agente seguinte ler endereço, coordenada, observação e nome da moradora do turno anterior. O conserto é um teste, de custo baixo, e não muda produto.

## Motivo do humano

A validação humana da etapa continua aberta e não é decidida por esta arbitragem: Rafael faz os dois fluxos num aparelho (vistoria começada e "Sair da conta", conferindo o diálogo e o botão de perigo; conclusão com GPS simulado abaixo de 0,5 m sem 422) e aprova as frases do diálogo e "Precisão de 1 metro". Só o aparelho mostra a tela real e o armazenamento nativo.
