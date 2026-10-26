---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Os 7 vermelhos da etapa, o diálogo que conta rascunhos e fotos, o piso de 1 m do GPS e a regra de isolamento entre agentes (`acolherNoAparelho`): a suíte da etapa (aviso-da-saida, precisao-do-gps, dialogo-na-conta*, vistoria-o-teclado..., vistoria-ainda-nao-baixada, sair-e-entrar-nao-perde-a-coleta, sessao) roda verde e MORDE (ver Evidência, mutações M1 a M10).
- Objetivo da etapa ("o agente deixa de perder vistoria começada ao sair da conta sem ser avisado") e DoD "comentário de `banco-local.ts` verdadeiro": NÃO atendidos no caminho da tela da vistoria (Achado 1). O comentário em `banco-local.ts:196-198` afirma "A sessão vencida deixou de apagar o disco (`encerrarSessaoVencida`)", o que é falso nesta tela.
- Fronteira da regra "Entrar de novo (sessão vencida) continua sem apagar nada" (teste negativo da etapa): verdadeira na lista de tarefas e na fila, falsa na tela da vistoria.

## Evidência

1. Prova por execução do Achado 1. Teste temporário `src/ui/tmp-validador-e15.test.tsx` (apagado): `ProvedorDeSessao` REAL, `banco-local` e `rascunho` REAIS sobre `node:sqlite`, tabela `fila_sincronizacao` presente (para a limpeza de arquivos agir de verdade), tela REAL `TelaDeVistoria`, API simulada com 401. Estado: Ana logada, rascunho da vistoria A (checklist, 1 foto, assinatura) no disco, abre a tarefa B ainda não baixada, "Baixar" dá 401, "Sua sessão terminou", toca "Sair e entrar de novo".
   - Caminho da tela (A): `RESULTADO-A rascunhos= 0 disco= []`. O rascunho, a foto e a assinatura foram apagados. Sem diálogo.
   - Caminho `encerrarSessaoVencida` (B): `RESULTADO-B rascunhos= 1 disco= [foto..., assinatura...]`. Tudo preservado.
   - Com `[id].tsx` trocado temporariamente para `encerrarSessaoVencida` (linhas 800 e 1414): A fica `rascunhos= 1` com os dois arquivos no disco (verde), e `vistoria-ainda-nao-baixada` FALHA em `expect(mockSair).toHaveBeenCalledTimes(1)` (linha 244). Ou seja, o teste existente TRAVA o comportamento errado e reprova o conserto. Arquivo restaurado com `git restore`.
2. Mutação da suíte (cada uma aplicada, rodada em 55 a 60 testes dos arquivos da etapa, restaurada com `git restore`); todas morderam:
   - M1 remover `Math.max(1, ...)`: 3 testes falham. M2 `<= 0` para `< 0` (zero deixa de ser null): 1 falha.
   - M3 Perfil não conta rascunhos: 2 falham. M4 plural vira singular: 2 falham. M5 frase da fila some do aviso: 5 falham.
   - M6 tela usa `Math.round` cru no GPS: 1 falha. M7 `acolherNoAparelho` nunca apaga: 1 falha.
   - M8 `apagarDadosLocais` não apaga rascunhos: 2 falham. M9 `apagarDadosLocais` apaga a fila: 2 falham.
   - M10 Perfil congela o resumo da fila (volta a "ler uma vez"): 2 falham.
   (Uma primeira tentativa de M10 era inválida por import faltando e foi descartada.)
3. Fim: `git status --porcelain` mostra só pastas `validacao/`.

## Cenários positivos

Diálogo no plural e no singular, com fotos e assinatura, chip e aviso que somem quando a fila esvazia, 0,3 vira 1 e 12,4 vira 12, mesma pessoa reencontra a vistoria (`sair-e-entrar-nao-perde-a-coleta`), tudo verde.

## Cenários negativos

Sem rascunho e sem fila o diálogo não fala em apagar (coberto, M3 e M5 mordem). Precisão ausente grava null (M2 morde). Outro agente recebe aparelho limpo e a fila fica intacta (M7 e M9 mordem). O negativo "Entrar de novo não apaga" na TELA DA VISTORIA não existe na suíte, e é onde o defeito mora.

## Tentativas de reprovar

- Executei o caminho que a suíte não cobre (tela da vistoria com 401 e rascunho de outra vistoria no disco): reprovou (Achado 1).
- Dez mutações em precisão, aviso, Perfil, apagamento, isolamento e fila: todas detectadas.
- Procurei teste que passa por acaso: o dublê de `useSessao` de `vistoria-ainda-nao-baixada` nem define `encerrarSessaoVencida`, então o teste só consegue exigir `sair`. Não achei outro teste da etapa passando por acaso.

## Achados

1. BLOQUEIA. `dc360/apps/campo/src/app/(agente)/vistoria/[id].tsx:1413-1415` (`sairEEntrarDeNovo`) chama `sair()`, que apaga rascunho, fotos e assinatura sem aviso. Contradiz o OBJETIVO ("deixa de perder vistoria começada ... sem ser avisado") e o comentário de `banco-local.ts` que a DoD exige verdadeiro; contradiz a própria regra do bloco "Entrar de novo (sessão vencida) continua sem apagar nada". É o mesmo CMP-52 que `index.tsx` e `fila.tsx` já resolveram com `encerrarSessaoVencida`. Reprodução na Evidência 1.
   - Seção 7 de `28`, item 5 ("perda ou duplicação de dado do campo (fila offline)"): o rascunho não é item da fila, mas é dado de coleta do campo ainda não enviado e a perda é silenciosa. Considero que cai no espírito do item 5 e, portanto, não admite risco aceito; a decisão de enquadramento é do gatekeeper. Mesmo fora do item 5, é falha da DoD desta etapa, e o dono do conserto é a E15 (o arquivo está na lista de "arquivos prováveis").
2. BLOQUEIA (mesma causa). `src/__tests__/vistoria-ainda-nao-baixada.test.tsx:227-246` exige `sair` e o dublê não tem `encerrarSessaoVencida`: o teste trava o comportamento errado e quebra com o conserto. Precisa ser reescrito junto com a correção, com um teste de caso real (rascunho no disco que sobrevive ao toque), não só com dublê.
3. Corrige antes de crescer. O dublê de `useSessao` em vários testes de tela esconde a diferença entre `sair` e `encerrarSessaoVencida`: nenhum teste de tela usa a sessão real. Sugestão: manter um teste de componente com sessão e banco reais por tela que oferece o ato (lista, fila, vistoria), como o do Evidência 1.
4. Anotado. `apagarDadosLocais` também leva `pendencias` e `coletas`; o diálogo só fala em vistoria começada (não é trabalho não enviado).

## Não verificado

- Dispositivo real ou emulador: o app não renderiza aqui; só teste de componente com sessão e SQLite reais. Capturas do diálogo, leitor de tela e contraste (QA, UX, acessibilidade).
- Fotos reais: `apagarDadosLocais` foi exercido com `expo-file-system` simulado (nomes de arquivo), não com o disco do Android.
- Revisão LGPD e o fluxo de GPS real abaixo de 0,5 m e a resposta do servidor (a prova da API foi do QA).
- Flakiness: rodei cada conjunto uma vez; não repeti para detectar instabilidade.
- Suíte completa `test:campo` e CI (9 de 9 verdes, run 37739535524) não foram reexecutados por mim.

## Risco residual

Enquanto o Achado 1 existir, o agente que perde a sessão ao abrir uma tarefa recém-despachada e toca no botão que a tela oferece perde a vistoria começada, sem aviso, no morro.

## Motivo do humano

Rafael decide o enquadramento do Achado 1 (item 5 da seção 7 de `28`) e faz o fluxo em aparelho previsto na etapa.

Alterações no repositório por mim: teste temporário `src/ui/tmp-validador-e15.test.tsx` e mutações em `perfil.tsx`, `vistoria/[id].tsx`, `banco-local.ts`, `aviso-da-saida.ts`, `precisao-do-gps.ts`, todos apagados ou restaurados por `git restore`.
