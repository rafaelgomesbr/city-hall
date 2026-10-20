---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`. O produto em `dc360/` é idêntico entre `1ed0b71` e o HEAD `5044e7a` (`git diff --quiet 1ed0b71 HEAD -- dc360`, código 0). As regressões rodaram na árvore principal; as mutações rodaram num `git worktree` destacado em `1ed0b71` (`$V/wt`, já removido), com `node_modules` por link para a árvore principal e os `dist` copiados, para não tocar a árvore que outros validadores usam.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: "7 testes verdes" (6 do diálogo, 1 do teclado e GPS) | `npx jest --verbose` dos arquivos da etapa: `$V/e15-arquivos-da-etapa.txt` (58 de 58) e `$V/e15-teclado.txt` (17 de 17, inclui "abaixo de meio metro vira 1, e não zero" com "Precisão de 1 metro") | PASS |
| Diálogo conta rascunhos e fotos, diz que sair apaga, singular e plural | casos do diálogo verdes; mutações R1 (Perfil não lê `listarRascunhos`: 4 reprovam) e A1 (rascunho sempre no singular: 2 reprovam) | PASS |
| Botão destrutivo (motivo do FAIL da rodada 4) | mutação D1 (`destrutiva: false` na ação "Sair da conta"): reprova "o botão de confirmar é o de perigo, porque o ato apaga" (`$V/mut/D1.txt`) | PASS |
| Sem rascunho e sem fila: frase curta, sem "apaga" (negativo) | mutação A3 (frase curta passa a falar em apagar): 4 reprovam | PASS |
| Perfil assina a fila por `useResumoDaFila`: chip e aviso somem quando a fila esvazia sem trocar de aba | mutação P1 (assinatura só lê o primeiro resumo): 7 reprovam, entre eles "quando a fila esvazia, o chip e o aviso de esperar somem" e "o diálogo de saída conta a fila de AGORA" | PASS |
| GPS: `Math.max(1, Math.round(accuracy))`; 0,3 vira 1; 12,4 vira 12 | mutação G1 (sem o piso): reprovam os testes do app e "todo valor que o aparelho grava passa no esquema do servidor"; mutação G2 (a tela volta ao `Math.round` cru): 1 reprova; sonda do helper `$V/sonda-precisao-app.txt` (0,3 e 0,49 e 0,5 dão 1; 12,4 dá 12; 1e-9 dá 1) | PASS |
| Precisão ausente grava `null` (negativo) | mutação G3 (ausente vira 1): 2 reprovam; sonda: `null`, `undefined`, `NaN`, `Infinity`, 0 e negativo dão `null` | PASS |
| Esquema recusa 0 e negativo em português, sem afrouxar `positive()` (negativo) | mutação Z1 (`nonnegative`): 3 reprovam no shared; Z2 (mensagem de `too_small` volta ao zod): 4 reprovam (`$V/mut-shared-resumo.txt`); sonda `$V/sonda-gps.txt`: 0, -0, -1 recusados com "Precisa ser maior que 0"; na API, `test/precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 dentro do `test:api` | PASS |
| "Entrar de novo" (sessão vencida) não apaga nada (negativo) | mutação V1 (sessão vencida passa a apagar): 7 reprovam; V2 (faixa da vistoria volta a chamar `sair()`): 3 reprovam | PASS |
| Isolamento: outro agente entra pelo login real e `acolherNoAparelho` limpa (motivo do FAIL da rodada 5) | `src/__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`, 11 casos verdes; mutação S9b (sem a chamada e sem o import, `tsc` 0): 5 reprovam; S9c (a chamada trocada por `marcarDonoDosDadosLocais`, `tsc` 0, variante que a correção não listou): 3 reprovam | PASS |
| `entrar` limpa ANTES de abrir a sessão | M1 (sem `await`), M2 (depois de `setIdentidade`) e M6 (variante nova: credencial gravada no cofre antes da limpeza): cada uma reprova "a limpeza que demora segura a entrada" | PASS |
| A saída tira a credencial e a identidade do cofre | S2 (`sair` mantém a credencial): 1 reprova; S6 (sessão vencida mantém a credencial): 1 reprova | PASS |
| A saída explícita continua apagando (regra mantida) | S3 (variante com `tsc` 0: `sair` sem `apagarDadosLocais`): reprova "contraste: a saída explícita ... continua apagando" | PASS |
| A mesma pessoa reencontra a vistoria | caso "contraste: a Ana que entra de novo ... reencontra tudo" e os dois de `vistoria-sessao-vencida-preserva-o-rascunho`, todos verdes; V1 os derruba | PASS |
| Comentário de `banco-local.ts` verdadeiro | lido em `dc360/apps/campo/src/dados/banco-local.ts:263-297`: diz que o diálogo lê `listarRascunhos`, cita `avisoDaSaida` e os testes, e que a regra de apagar não mudou; confere com `perfil.tsx:470-477` | PASS |
| Regressão obrigatória | `npm run test:campo`, `npm run test --workspace @dc360/shared`, `npm run test:api`, todos código 0 | PASS |
| E2E em aparelho e validação humana (E4 explícito) | não há emulador nem aparelho nesta máquina | pendência humana |

## Evidência

- `npm run test:campo` (pasta `dc360`): código 0, 139 suítes, 1997 de 1997, "A leitura do código e o jest concordam: 1997 casos", tipos limpos. `$V/r-test-campo.txt`.
- `npm run test --workspace @dc360/shared`: código 0, 18 arquivos, 223 de 223. `$V/r-test-shared.txt`.
- `npm run test --workspace @dc360/campo` (motor offline, preservado): código 0, 238 de 238. `$V/r-test-pkg-campo.txt`.
- `npm run test:api`: código 0, 106 arquivos, 1590 aprovados e 34 pulados (todos em `renovacao-contra-encerramento.test.ts`, que pede `DC360_POSTGRES_DE_PROVA`; não é desta etapa). `$V/r-test-api.txt`.
- `npm test` completo (inclui console, web e db): código 0. `$V/r-npm-test.txt`.
- Linha de base do worktree antes das mutações: jest 1997 de 1997, `tsc` 0 (`$V/wt-base-jest.txt`, `$V/wt-base-tsc.txt`).
- Mutações do app: roteiro `$V/scripts/mutar.mjs` (aplica, roda `tsc` e o jest INTEIRO do app, restaura com `git checkout` no worktree e confere `git status` limpo), lista em `$V/muts-e15.json` e `$V/muts-e15b.json`, resumo em `$V/mut-e15-resumo.txt`, saída bruta de cada uma em `$V/mut/<id>.txt` (com o diff aplicado).
- Mutações do shared: `$V/muts-shared.json`, `$V/mut-shared-resumo.txt`.
- Sondas: `$V/sonda-gps.txt` (esquema real do `dist`), `$V/sonda-precisao-app.txt` (helper do app).

## Cenários positivos

- 2 vistorias começadas com foto e assinatura: plural e "fotos e assinatura"; 1 sem anexo: singular sem prometer foto.
- Precisão 0,3 grava 1; 12,4 grava 12; o servidor aceita 1, 12 e nulo.
- A Ana sai pela sessão vencida e volta: rascunho, foto e assinatura continuam.
- O Bruno entra depois da Ana (pela sessão vencida ou pelo "Sair da conta"): aparelho limpo, dono do disco passa a ser o Bruno, item da fila da Ana intacto e `pendente`.

## Cenários negativos

- Sem rascunho e sem fila: o diálogo não fala em apagar (A3 morde).
- Disco que não responde: o diálogo avisa do mesmo jeito e não repete "zero" da pergunta anterior (R1 morde os dois casos).
- Precisão ausente, `NaN`, `Infinity`, 0 e negativo: `null` no app (G3 morde).
- Esquema: 0, -0, -1 recusados com frase em português (Z1, Z2 mordem); texto "1" recusado.
- "Entrar de novo" não apaga (V1, V2 mordem).
- Isolamento entre agentes: o Bruno não lê nada da Ana pelo login real (S9b, S9c mordem); enquanto a limpeza não termina, nem identidade nem credencial do Bruno aparecem (M1, M2, M6 mordem).
- Cofre: depois de `sair` e de `encerrarSessaoVencida`, nenhuma chave com o token ou o id da Ana (S2, S6 mordem).

## Tentativas de reprovar

1. Repeti a mutação da arbitragem da rodada 5 (S9b: sem `acolherNoAparelho` e sem o import em `entrar`, `tsc` código 0): agora reprovam 5 casos do arquivo novo, contra 0 em `4ce0433`. O conserto segura.
2. Variante que a correção não listou (S9c): `entrar` chama `marcarDonoDosDadosLocais` no lugar de `acolherNoAparelho` (o aparelho fica marcado como do Bruno sem limpar), `tsc` 0. Reprovam 3 casos (sessão vencida, ordem e dono apagado).
3. Variante de ordem nova (M6): gravar a credencial do Bruno no cofre antes da limpeza. Reprova o caso do portão da limpeza (o cofre não pode conter "bruno" enquanto a limpeza está presa).
4. S3 com `tsc` limpo (`void apagarDadosLocais` no lugar da chamada em `sair`): o caso "Sair da conta e depois o Bruno entra" sozinho não pega (o `entrar` limpa de novo, limite que o próprio implementador declara), mas o controle de `vistoria-sessao-vencida-preserva-o-rascunho` reprova; a suíte inteira fica vermelha.
5. Botão de perigo: D1 reprova o caso do botão; a comparação é por estilo renderizado contra referências do mesmo tema.
6. GPS: retirar o piso, contornar o helper na tela, devolver 1 para ausente, afrouxar o esquema e trocar a mensagem: todas reprovam.
7. Leitura de uma vez da fila (P1, o defeito original de CMP-52): 7 reprovam.
8. Procurei outro chamador de `sair()` ou `apagarDadosLocais` fora do diálogo do Perfil: só `perfil.tsx` (ação do diálogo) e `acolherNoAparelho` (troca de pessoa), como a correção 1 descreve.

Nenhuma das 20 mutações do app e do shared sobreviveu.

## Achados

- anotado: numa das 20 rodadas inteiras do jest (mutação G1) um processo do jest morreu com `SIGSEGV` ("A jest worker process ... was terminated", `$V/mut/G1.txt`), e a suíte daquele processo não rodou (1994 em vez de 1997). As outras 23 rodadas inteiras (regressões, linha de base e as demais mutações) fecharam sem isso. Hipótese: Node 24.15 desta máquina contra o `.nvmrc` (22) com `node:sqlite`; não afeta o veredito, porque G1 reprovou nos testes de precisão de qualquer forma, mas uma queda de processo no CI apareceria como vermelho sem relação com o código.
- anotado (já registrado na rodada 4, fora da etapa): `gpsPrecisaoMetrosSchema` aceita `Infinity` (JSON `1e999`), confirmado em `$V/sonda-gps.txt`; e para `NaN` a mensagem em português sai "Era esperado um número, veio um número", frase sem sentido (só alcançável sem JSON, porque JSON não carrega `NaN`).
- anotado (fora da etapa, dono F14-E02, classificação da rodada 4 mantida): `acolherNoAparelho` falha aberto quando a leitura do dono ou a limpeza falham; não reavaliei.

Nenhum achado bloqueia.

## Não verificado

- Os dois fluxos em aparelho ou emulador (vistoria começada e "Sair da conta" com o diálogo real; GPS simulado abaixo de 0,5 m concluindo sem 422 no servidor real): não há emulador Android nem aparelho nesta máquina. `expo-sqlite`, `expo-secure-store` e o disco de arquivos são simulados nos testes; a garantia do chaveiro do iOS e do Keystore do Android não foi observada.
- A aparência do botão de perigo e das frases na tela real: só o estilo renderizado no teste de componente.
- Falha aberta de `acolherNoAparelho` (marca ausente, limpeza que falha no meio): fora da etapa.
- CI do SHA: ausente (H32).
- Os 34 casos pulados da API (Postgres real da renovação) não rodaram: não tocam a etapa.

## Risco residual

Os testes agora prendem o caminho real do login, a ordem da limpeza, o cofre e o botão de perigo, e mordem em todas as variantes tentadas. O que sobra é o que só o aparelho mostra: o armazenamento nativo apagando de verdade, o diálogo desenhado, e o GPS real. A falha aberta de `acolherNoAparelho` continua sendo bloqueio de piloto com dono F14-E02.

## Motivo do humano

A etapa tem E4 explícito: Rafael faz os dois fluxos num aparelho (vistoria começada e "Sair da conta", conferindo o diálogo, o botão de perigo e as frases; conclusão com GPS simulado abaixo de 0,5 m sem 422) e aprova as frases do diálogo e "Precisão de 1 metro". Só o aparelho mostra a tela real e o armazenamento nativo.
