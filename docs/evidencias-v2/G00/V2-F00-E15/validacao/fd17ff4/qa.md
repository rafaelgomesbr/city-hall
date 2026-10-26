---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e14-18`. O produto em `dc360/` é idêntico entre `fd17ff4` e o HEAD `55209ab` (`git diff --quiet fd17ff4 HEAD -- dc360`, código 0). O diff da rodada (`1ed0b71..fd17ff4`) não toca `dc360/apps/campo`, `dc360/packages/campo`, `packages/shared/src/schemas.ts` nem `mensagens-do-zod.ts` (`git diff --quiet`, código 0); toca a API (`servidor.ts`, `suspensao.ts`, guarda de códigos de erro), que é por onde o GPS corrigido chega ao servidor, então `test:api` foi rodado inteiro.

Prova de que o teste morde (risco alto): a edição foi feita numa CÓPIA de `fd17ff4`, não na árvore (`git archive fd17ff4 dc360 | tar -x -C $V/arv`, `node_modules` por link simbólico para a árvore principal, `dist` copiados; sem `git worktree`). O roteiro `$V/scripts/mutar.mjs` aplica cada troca, roda o jest dos 9 arquivos da etapa (ou o vitest do shared), restaura o arquivo e confere o SHA-256. Linha de base da cópia sem mutação: 79 de 79 (`$V/e15-base.txt`). No fim, a cópia foi comparada com um `git archive` novo de `fd17ff4` (`diff -rq`, idêntica fora `dist` e `tsbuildinfo`). Saber que a cópia testa o código dela, e não o da árvore, é o próprio resultado: as mutações ficam vermelhas e a restauração volta ao verde.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes (6 do diálogo, 1 do GPS) | `npm run test:campo` código 0, 139 suítes, 1997 de 1997 (`$V/r-test-campo.txt`); na cópia, 79 de 79 dos arquivos da etapa, inclusive "abaixo de meio metro vira 1, e não zero" nos dois arquivos | PASS |
| Diálogo conta rascunhos e fotos, diz que sair apaga | R1 (o Perfil não lê `listarRascunhos`): 4 reprovam, entre eles "diz quantas vistorias começadas serão apagadas" e "uma só, sem foto: singular" | PASS |
| Botão destrutivo | D1 (`destrutiva: false` em "Sair da conta"): reprova "o botão de confirmar é o de perigo, porque o ato apaga" | PASS |
| Negativo: sem rascunho nem fila, a frase curta não fala em apagar | A3 (a frase curta passa a dizer "Sair apaga..."): 2 reprovam (`aviso-da-saida.test.ts` e o caso de tela) | PASS |
| Perfil assina a fila por `useResumoDaFila`; chip e aviso somem sem trocar de aba | P1 (o gancho só aceita o primeiro resumo): reprovam "quando a fila esvazia, o chip e o aviso de esperar somem" e "o diálogo de saída conta a fila de AGORA" | PASS |
| GPS: `Math.max(1, Math.round(accuracy))` | G1 (sem o piso): 3 reprovam, inclusive "todo valor que o aparelho grava passa no esquema do servidor"; G2 (a tela contorna o helper com `Math.round` cru): 1 reprova | PASS |
| Negativo: precisão ausente grava `null` | G3 (ausente vira 1): 2 reprovam | PASS |
| Negativo: esquema recusa 0 e negativo em português, sem afrouxar `positive()` | Z1 (`nonnegative`): 2 de 3 do shared reprovam; Z2 (a mensagem de `too_small` em inglês): 2 reprovam; `test/precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 dentro do `test:api` (201 para 1 e nulo, 422 com a frase em português para 0) | PASS |
| Negativo: "Entrar de novo" (sessão vencida) não apaga | V1 (a sessão vencida passa a chamar `apagarDadosLocais`): 7 reprovam em dois arquivos | PASS |
| Isolamento: outro agente entra e `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria | S9b (sem a chamada e sem o nome no import): 5 reprovam em `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`; X1 (`acolherNoAparelho` nunca apaga): 4 reprovam, inclusive o caso do SQLite real; o contraste "a Ana que entra de novo ... reencontra tudo" verde na base e derrubado por V1 | PASS |
| Comentário de `banco-local.ts` verdadeiro | lido em `dc360/apps/campo/src/dados/banco-local.ts` (bloco antes de `acolherNoAparelho`): aponta `listarRascunhos` no diálogo e diz que a regra de apagar não mudou; confere com `perfil.tsx:465-477` (`perguntarSaida`) | PASS |
| Regressão obrigatória | `npm run test:campo` 0; `npm run test --workspace @dc360/shared` 18 arquivos, 223 de 223, código 0; `npm run test:api` 106 arquivos, 1685 aprovados e 34 pulados, código 0 | PASS |
| E2E no aparelho e validação humana (E4) | sem emulador nem aparelho nesta máquina | pendência humana |

## Evidência

- `npm run build:shared` código 0 (`$V/r-build-shared.txt`).
- `npm run test:campo` código 0 (`$V/r-test-campo.txt`).
- `npm run test --workspace @dc360/shared` código 0 (`$V/r-test-shared.txt`).
- `npm run test --workspace @dc360/campo` (motor offline, preservado) 238 de 238, código 0 (`$V/r-test-pkg-campo.txt`).
- `npm run test:api` código 0 (`$V/r-test-api.txt`); os 34 pulados são de `renovacao-contra-encerramento.test.ts`, que pede `DC360_POSTGRES_DE_PROVA`, fora da etapa.
- Mutações: `$V/muts-e15.json`, saída por mutação com a troca aplicada em `$V/mut-e15/<id>.txt`, resumo `$V/mut-e15/RESUMO.txt` (13 mutações).
- CI: run 39420436042, jobs "Aplicativo de campo" (118619736571) e "Testes, tipos e scripts" (118619736871, passo "Suíte completa", que inclui shared e API) em `success`.

## Cenários positivos

- 2 vistorias começadas com foto e assinatura: plural e as fotos junto; 1 sem anexo: singular, sem prometer foto.
- Precisão 0,3 grava 1; 12,4 grava 12; o servidor aceita 1 e nulo.
- A Ana sai pela sessão vencida e volta: rascunho, foto e assinatura continuam.

## Cenários negativos

- Sem rascunho e sem fila: o diálogo não fala em apagar (A3 morde).
- Precisão ausente: `null` (G3 morde). Esquema: 0 e negativo recusados em português (Z1 e Z2 mordem).
- "Entrar de novo" não apaga (V1 morde).
- Isolamento entre agentes no aparelho: o Bruno não lê nada da Ana pelo login real (S9b e X1 mordem).

## Tentativas de reprovar

1. Repeti as mutações que derrubaram rodadas anteriores (D1 da rodada 4, S9b da rodada 5): ambas reprovam no SHA atual.
2. Ataquei o defeito original de CMP-52 pela leitura de uma vez (P1) e pelo diálogo que não lê o disco (R1): reprovam.
3. Contornei o helper do GPS na própria tela (G2), em vez de mudar o helper: reprova.
4. Variante nova S9d: `acolherNoAparelho` chamado com o id de quem estava antes (`identidadeViva.current`) em vez de quem entra. Sobreviveu (79 de 79), e é mutante EQUIVALENTE: no momento de `entrar`, `sair` e `encerrarSessaoVencida` já zeraram `identidadeViva.current`, então a expressão sempre cai no id de quem entra. Não é furo de teste.
5. Afrouxei o esquema compartilhado (Z1) e troquei a frase (Z2): reprovam no shared, e o GPS do app passa pelo esquema real em "todo valor que o aparelho grava passa no esquema do servidor" (G1 o derruba).
6. Procurei regressão do diff da rodada: a API mudou em `RegraDeNegocio` (status tem de ser inteiro de 400 a 599) e na guarda de 401 e 403. A rota de sincronização responde 422 ao GPS 0 com a frase em português, e o arquivo da etapa na API segue 3 de 3.

## Achados

- anotado (fora da etapa, classificação das rodadas anteriores mantida, dono F14-E02): `acolherNoAparelho` falha aberto quando a leitura do dono ou a limpeza falham; não reavaliei.
- anotado: S9d é mutante equivalente (registrado para que um próximo validador não o conte como sobrevivente).

Nenhum achado bloqueia.

## Não verificado

- Os dois fluxos em aparelho ou emulador (vistoria começada e "Sair da conta" com o diálogo real; GPS simulado abaixo de 0,5 m concluindo sem 422 contra o servidor real): não há emulador Android nem aparelho. `expo-sqlite`, `expo-secure-store` e o disco de arquivos são simulados nos testes.
- A aparência do botão de perigo e das frases na tela real: só o estilo renderizado no teste de componente.
- Falha aberta de `acolherNoAparelho` (marca ausente, limpeza que falha no meio): fora da etapa.
- A suíte inteira do app com cada mutação: rodei o conjunto dos 9 arquivos da etapa por mutação, não as 139 suítes; a suíte inteira rodou sem mutação na árvore.
- Os logs dos jobs do CI (exigem token); li só as conclusões.

## Risco residual

O que sobra é o que só o aparelho mostra: o armazenamento nativo apagando de verdade, o diálogo desenhado e o GPS real. A falha aberta de `acolherNoAparelho` continua bloqueio de piloto com dono F14-E02.

## Motivo do humano

A etapa tem E4 explícito: o Rafael faz os dois fluxos num aparelho (vistoria começada e "Sair da conta", conferindo diálogo, botão de perigo e frases; conclusão com GPS abaixo de 0,5 m sem 422) e aprova "Precisão de 1 metro" e as frases do diálogo.
