---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**, com itens de emulador em BLOQUEADO listados em "Não verificado" (a regra do bloco permite que o resto da etapa passe pelo teste de componente quando o emulador não alcança o critério). O defeito da rodada 1 (botão "Sair e entrar de novo" da faixa de sessão vencida na vistoria chamava `sair()` e apagava rascunho, foto e assinatura) está consertado e o teste que o pega morde.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-campo/` (abreviada como `qa-campo/`).

| Critério | Resultado |
| --- | --- |
| sessão vencida na tela da vistoria: "Entrar de novo" não apaga rascunho, foto nem assinatura (FAIL da rodada 1) | PASS (E1 com módulos reais, mutação) |
| o diálogo "Sair da conta?" conta fila, rascunhos e fotos, singular e plural, botão destrutivo, frase curta sem nada | PASS (E1; E2 parcial) |
| o Perfil assina a fila (chip e aviso somem quando a fila esvazia) | PASS (E1) |
| GPS: piso de 1 metro (0,3 vira 1, 12,4 vira 12), ausente continua `null` | PASS (E1, mutação) |
| servidor recusa 0 e negativo com mensagem em português, sem afrouxar `positive()` | PASS (E1, execução do esquema) |
| outro agente entra no aparelho: `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria | PASS (E1; E2: rascunho sobreviveu a fechar e abrir) |
| `sair()` só no diálogo do Perfil; nenhum outro chamador | PASS (leitura de `src/`) |

## Evidência

- `cd dc360/apps/campo && npx jest` em 7 arquivos (`dialogo-na-conta-com-vistoria-comecada`, `vistoria-sessao-vencida-preserva-o-rascunho`, `vistoria-ainda-nao-baixada`, `a-sessao-vencida-nao-apaga-a-vistoria`, `vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `fila-como-produto`, `sair-e-entrar-nao-perde-a-coleta`): 109 de 109 (`qa-campo/83-jest-e15-e16.txt`).
- `npm run test:campo`: 129 suítes, 1903 de 1903, tipos limpos (`qa-campo/90-test-campo.txt`).
- Li `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`: usa `ProvedorDeSessao`, `banco-local` e `rascunho` reais sobre SQLite do Node, a tela real e 401 na baixa; só cofre, rede, nomes de arquivo e bibliotecas nativas são simulados. Afirma rascunho, foto e assinatura de pé depois do toque, a identidade nula, `router.replace("/entrar")`, a mesma pessoa reencontrando tudo e, como controle, `sair()` explícito ainda apagando.
- Mutação 1: na tela `vistoria/[id].tsx` o botão volta a chamar `sair()` no lugar de `encerrarSessaoVencida()`: 3 de 13 reprovam (`vistoria-sessao-vencida-preserva-o-rascunho` e `vistoria-ainda-nao-baixada`, `qa-campo/85-mutE15b.txt`); `git restore` e verde.
- Mutação 2: `precisaoDoGpsEmMetros` sem o `Math.max(1, ...)`: 3 de 22 reprovam (`precisao-do-gps.test.ts` e o caso da vistoria, `qa-campo/84-mutE15a.txt`); `git restore` e verde.
- Esquema executado a partir do `dist` do pacote comum (`qa-campo/gps.mjs`, saída em `qa-campo/86-gps-schema.txt`): 0 e -1 recusados com "Precisa ser maior que 0" (português); 0,3, 1 e 12 aceitos; `null` aceito; campo ausente recusado.
- Emulador (AVD `Medium_Phone_API_36.1`, APK debug do SHA): `qa-campo/capturas/E15-dialogo-sair-da-conta.png` mostra "Sair da conta?" com "Você tem 1 coleta ainda não enviada ... ela continua guardada no aparelho", botão "Sair da conta" e "Continuar conectado". `qa-campo/capturas/15-relancado.png` e a árvore de acessibilidade ("Vistoria começada") mostram o rascunho de pé depois de fechar o aplicativo à força e abri-lo de novo.

## Cenários positivos

- Teste de componente com sessão e banco reais: sessão vence na vistoria, "Entrar de novo" leva a `/entrar` e o disco fica como está; a mesma pessoa entra e reencontra checklist, observações, assinatura e foto.
- Emulador: rascunho sobrevive ao fechamento do aplicativo; diálogo de saída conta a coleta da fila.

## Cenários negativos

- Controle do próprio teste: `sair()` explícito (o do diálogo do Perfil) continua apagando, como manda a regra de aparelho compartilhado.
- Esquema: precisão 0 e negativa recusadas; ausente recusada; `0,49` do aparelho vira 1, nunca 0.
- `precisaoDoGpsEmMetros(0)`, negativo, `NaN` e `Infinity` devolvem `null` (leitura de `src/dados/precisao-do-gps.ts` e teste).

## Tentativas de reprovar

- Procurei outro `sair()` ou `apagarDadosLocais` que apagasse sem aviso: o único chamador de `sair()` é o diálogo do Perfil (`perfil.tsx`); `acolherNoAparelho` apaga quando outra pessoa entra (regra de isolamento mantida, registrada em `PENDENCIAS.md` com dono F14-E02).
- Desfiz o conserto da tela e o teste novo reprovou (mutação 1); desfiz o piso de GPS e dois testes reprovaram (mutação 2).
- Tentei o caminho de volta no emulador: fechar o aplicativo no meio da vistoria com checklist, foto e assinatura parciais e reabrir; o rascunho voltou ("Vistoria começada").
- Procurei diálogo que diga "não apaga" quando apaga: o texto de saída com fila diz que a coleta continua guardada; com rascunho o teste de componente exige "vai apagar" e a contagem. Não exerci o diálogo com rascunho no emulador (ver abaixo).

## Achados

### BLOQUEIA

Nenhum nesta etapa. O achado de foto vazia no Android (função da E16, `guardarFotoNoAparelho`) impede concluir vistoria no emulador; está no relatório da E16 e o remendo de QA que usei para seguir foi só local.

### CORRIGE ANTES DE CRESCER

1. As fotos de tentativas que o aplicativo rejeitou como "vazias" ficam no disco, sem registro, em `Paths.document` (5 JPEG de cerca de 13 KB no emulador depois de 5 tentativas), e só o logout as limpa. É dado de coleta sem dono no aparelho, em conflito com o que o diálogo e o `banco-local.ts` prometem. Nasce do achado da E16. Dono: E16 e F05-E10.

### ANOTADO

- A cobertura do Perfil com sessão real continua só por dublê de `sair` (limitação que o próprio implementador declarou).
- Coordenada com 6 casas, resíduo de WAL, fila sem prazo no aparelho: já anotados em `PENDENCIAS.md` com dono.

## Não verificado

- BLOQUEADO no emulador: sessão vencida na tela da vistoria (a faixa "Sua sessão terminou" com a tarefa ainda não baixada). Motivo: provocar 401 na baixa com tarefa não baixada exige estado que a semente local não oferece; coberto por teste de componente com módulos reais (E1).
- BLOQUEADO no emulador: diálogo de saída com rascunho e foto (plural e singular). Motivo: depois da conclusão da vistoria não restava tarefa para começar outro rascunho; coberto por `dialogo-na-conta-com-vistoria-comecada.test.tsx` (E1).
- BLOQUEADO no emulador: concluir vistoria com GPS abaixo de 0,5 m sem 422. Motivo: não injetei localização simulada; coberto pelo esquema executado e pelos testes.
- Outro agente entrando no aparelho com rascunho do primeiro, no emulador: só E1 (`sair-e-entrar-nao-perde-a-coleta.test.ts`).
- iPhone e aparelho físico.

## Risco residual

Médio-baixo. O teste que pega o defeito da rodada 1 usa módulos reais e morde. O risco que fica é de interface (texto do diálogo com rascunho visto só em teste de componente) e o da LGPD já listado nas pendências do implementador.

## Motivo do humano

Rafael faz os dois fluxos num aparelho físico (E4 da etapa): tocar em "Sair da conta" com vistoria começada e concluir com GPS excelente; e aprova a frase "Precisão de 1 metro" (texto de produto).
