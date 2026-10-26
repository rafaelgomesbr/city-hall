---
validador: seguranca-aplicacao
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
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Árvore principal (HEAD `5044e7a`, produto idêntico a `1ed0b71`). Toda mutação foi feita em `apps/campo/src` e desfeita com `git restore src`; `git status --short src` vazio depois de cada uma.

- **Isolamento entre agentes no mesmo aparelho** ("outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa"), o FAIL da rodada 5: agora provado pelo login real. `src/__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (11 casos no arquivo; o resumo da correção 3 diz 10) usa `ProvedorDeSessao`, `banco-local` e `rascunho` reais sobre o SQLite do Node. A mutação exata do FAIL (S9b: tirar `await acolherNoAparelho(r.identidade.usuarioId);` de `entrar` e o nome do `import`) deixa o `tsc` em 0 e reprova 5 casos no jest INTEIRO do aplicativo (antes: 0). PASS.
- **Credencial no cofre** (achado 2 da rodada 5): os casos do cofre reprovam quando `guardar(chave, null)` deixa de apagar (mutação V2 abaixo, 2 reprovam) e quando a credencial é gravada no cofre antes de a limpeza do aparelho terminar (V1, 1 reprova). `sessao.tsx` grava com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; nenhum token fora do `expo-secure-store` (busca por `AsyncStorage`, `setItemAsync` e `localStorage` em `src`, fora testes: só o cofre e a ficha do push no cofre). PASS.
- **"Entrar de novo" (sessão vencida) não apaga; a mesma pessoa reencontra a vistoria; "Sair da conta" apaga**: `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` e `sair-e-entrar-nao-perde-a-coleta.test.ts` verdes. PASS.
- **Diálogo de saída avisa e usa o botão destrutivo** (FAIL da rodada 4): `dialogo-na-conta-com-vistoria-comecada.test.tsx` verde; a mordida da correção 2 não foi repetida por mim (a dimensão aqui é o isolamento e a credencial).
- **Precisão do GPS**: `src/dados/precisao-do-gps.ts:18` `Math.max(1, Math.round(precisao))`; `gpsPrecisaoMetrosSchema` do pacote construído recusa 0 e -1 com "Precisa ser maior que 0" e aceita 0,3, 1, 12 e nulo. PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/seguranca-aplicacao/`:

- `e15-base.txt`: `npx jest` dos quatro arquivos da etapa (login de outra pessoa, sair e entrar, sessão vencida preserva o rascunho, diálogo): 4 suítes, 31 de 31, código 0.
- `e15-mut/V1-cofre-antes-da-limpeza.txt`, `V2-guardar-null-grava.txt`, `V3-compara-tamanho.txt`, `V4-engole-erro-da-limpeza.txt`: minhas mutações contra o arquivo novo (tabela em "Tentativas de reprovar").
- `e15-mut/S9b-tsc.txt` (código 0) e `e15-mut/S9b-jest-inteiro.txt` (`npx jest` do aplicativo inteiro com S9b: 5 reprovam, 1974 passam, código 1).
- `test-campo.txt`: `npm run test:campo` sem mutação, 139 suítes, 1997 de 1997, "A leitura do código e o jest concordam: 1997 casos", código 0.
- `test-shared.txt`: `npm run test --workspace @dc360/shared`, 223 de 223, código 0.
- `test-api.txt`: `npm run test:api` em Postgres real, 1624 de 1624, código 0.
- `e15-gps.txt`: a sonda do esquema da precisão.

## Cenários positivos

- A mesma pessoa que volta depois da sessão vencida reencontra rascunho, foto e assinatura.
- O agente que entra num aparelho vazio, ou sem dono marcado, entra e passa a ser o dono.

## Cenários negativos

- Outra pessoa entra depois da sessão vencida da Ana: rascunho, foto e assinatura dela somem antes de a identidade do Bruno aparecer; o item da fila da Ana fica intacto.
- Outra pessoa entra depois do "Sair da conta": nada da Ana.
- Depois de "Sair da conta" e da sessão vencida, nenhuma chave da Ana fica no cofre.
- Precisão 0 e negativa: recusadas pelo esquema com frase em português.

## Tentativas de reprovar

| Mutação (minha, desfeita com `git restore`) | O que simula | Arquivo novo |
| --- | --- | --- |
| S9b (a do FAIL da rodada 5), no jest inteiro | login refatorado que perde a limpeza | 5 de 1979 reprovam (antes 0); `tsc` 0 |
| V1: credencial e identidade gravadas no cofre ANTES de `acolherNoAparelho` | o dono novo no cofre enquanto o disco ainda tem o turno anterior | 1 de 11 reprova |
| V2: `guardar(chave, null)` sem o ramo que apaga (grava o texto `null`) | a saída que deixa a chave no cofre | 2 de 11 reprovam |
| V3: troca de dono decidida pelo tamanho do identificador (UUIDs têm o mesmo tamanho) | comparação de dono enfraquecida | 3 de 11 reprovam |
| V4: `acolherNoAparelho(...).catch(() => ({ apagou: false }))` em `entrar` | falha aberta da limpeza no login | 0 de 11 reprovam |

V4 não morde, e não é defeito desta etapa: `apagarDadosLocais` já isola e registra as falhas de cada passo, então a limpeza não lança e o `catch` é equivalente; a falha aberta de `acolherNoAparelho` é o bloqueio de piloto já registrado na rodada 4 com dono na F14-E02.

## Achados

1. **anotado (herdado, fora do critério).** Falha aberta da limpeza: se apagar o banco local falha no meio, a entrada segue, o dono novo é carimbado e o resto do turno anterior fica (mutação V4 equivalente ao código de hoje). Registrado na rodada 4 como bloqueio de piloto, dono F14-E02, decisão de Rafael.
2. **anotado (herdado).** `gpsPrecisaoMetrosSchema` aceita `Infinity` (`e15-gps.txt`); o laudo imprimiria "Infinity metros". Anterior à etapa.
3. **anotado.** O arquivo `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` tem 11 casos e o resumo da correção 3 diz 10. A contagem total bate (`test:campo` concorda em 1997); é só o texto do resumo.

## Não verificado

- Aparelho ou emulador: não há nesta máquina. O cofre (`expo-secure-store`), o disco de arquivos e o SQLite nativo são simulados no teste: a garantia do chaveiro do Android e do iOS (a chave sai de fato, a proteção `WHEN_UNLOCKED_THIS_DEVICE_ONLY` vale no aparelho) não foi observada.
- Resíduo físico depois de apagar (WAL do SQLite, cache da câmera): registrado em `apps/campo/PENDENCIAS.md`, fora da etapa.
- A mordida do botão de perigo e do E8 (correção 2): não repeti; é da dimensão de testes.
- CI do SHA: ausente (H32).

## Risco residual

No código, a troca de pessoa no aparelho limpa antes de a nova identidade existir, e a saída tira a credencial do cofre; as duas coisas agora têm teste que morde no login real. Fica a falha aberta da limpeza (F14-E02) e o comportamento real do chaveiro, que só se vê no aparelho.

## Motivo do humano

Só num aparelho real dá para confirmar que o chaveiro do sistema apaga a credencial ao sair e que outro agente, entrando no mesmo telefone, não vê o rascunho do anterior. A etapa também pede que Rafael faça os dois fluxos (vistoria começada e "Sair da conta"; GPS abaixo de 0,5 m concluindo sem 422) num aparelho disponível.
