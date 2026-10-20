---
validador: testes (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-testes`. Execução numa CÓPIA de `fd17ff4` (`git archive`), `node_modules` por link simbólico com `@dc360/*` apontando para os pacotes da cópia. Mutações por `$V/bin/mutar.sh` e, nas do pacote compartilhado contra a API, por `$V/bin/mutar-shared.sh` (recompila `@dc360/shared` antes e depois, porque a API lê o `dist`). Cada mutação: aplicar, rodar, restaurar por `git show fd17ff4:<arquivo>`, conferir por `cmp`. A cópia final é idêntica a uma extração limpa do SHA. Os arquivos da etapa não mudaram entre `1ed0b71` e `fd17ff4`.

Risco alto: prova de mordida por critério.

| Campo do bloco | Teste | Rodou no SHA | Mutação que o morde |
| --- | --- | --- | --- |
| Positivo: "2 vistorias começadas" no plural, uma só no singular sem foto | `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`, `dados/aviso-da-saida.test.ts` | verde | d02 (`uma = n >= 1`, plural vira singular) 2 vermelhos |
| Positivo: o diálogo conta os rascunhos lidos no toque | `dialogo-na-conta-com-vistoria-comecada.test.tsx` | verde | d01 (`listarRascunhos` trocado por lista vazia) 4 |
| Positivo: chip e aviso de esperar somem quando a fila esvazia sem trocar de aba (`useResumoDaFila`) | `dialogo-na-conta-com-vistoria-comecada.test.tsx`, `ui/dialogo-na-conta.test.tsx` | verde | d04 (resumo congelado na montagem, a leitura única de antes) 16 |
| Positivo: botão destrutivo | `dialogo-na-conta-com-vistoria-comecada.test.tsx` | verde | d03 (`destrutiva: false` em "Sair da conta") 1 |
| Positivo: precisão 0,3 vira 1 e 12,4 vira 12 | `dados/precisao-do-gps.test.ts`, `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` | verde | g01 (sem `Math.max(1, ...)`) 3 |
| Negativo: sem rascunho e sem fila o diálogo não fala em apagar | `aviso-da-saida.test.ts`, os dois de diálogo | verde | d05 (frase curta vira "Sair apaga a vistoria...") 6 |
| Negativo: precisão ausente grava `null` | `precisao-do-gps.test.ts`, vistoria | verde | g02 (sem a guarda de ausente) 2 |
| Negativo: o esquema recusa 0 e negativo, com mensagem em português | `packages/shared/test/mensagens-em-portugues.test.ts`, `precisao-do-gps.test.ts` do shared; `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` (resposta do servidor) | verde | s01 (`positive` vira `nonnegative`) 3 no shared e 1 contra a API; s02 (mensagem do `too_small` numérico em inglês) 4 no shared e 1 contra a API |
| Negativo: "Entrar de novo" (sessão vencida) continua sem apagar nada | `__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`, `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` | verde | v01 (`encerrarSessaoVencida` passa a chamar `apagarDadosLocais`) 7 |
| Isolamento: outro agente entra com o rascunho do primeiro, `acolherNoAparelho` limpa | `dados/sair-e-entrar-nao-perde-a-coleta.test.ts`, `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (pelo `entrar` real) | verde | c01 (nunca limpa) 4; c03 (`entrar` sem acolher) 5 |
| Isolamento: a mesma pessoa reencontra a vistoria | os mesmos dois, e `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` | verde | c02 (limpa até para a mesma pessoa) 4 |
| DoD: 7 testes verdes | 6 em `dialogo-na-conta-com-vistoria-comecada.test.tsx` e 1 em `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` | verde (68 de 68 nos seis arquivos, `$V/15-e15-e16-arquivos.txt`) | ver acima |
| DoD: comentário de `banco-local.ts` verdadeiro | leitura: o comentário de `apagarDadosLocais` diz que o Perfil lê `listarRascunhos` no toque e o texto vem de `avisoDaSaida`, o que bate com `perfil.tsx` (`perguntarSaida`) | E3a (comentário não é executável) | n/a |
| Regressão: `test:campo`, `test --workspace @dc360/shared`, `test:api` | | verdes | n/a |
| E2E no aparelho ou emulador | sem emulador nem aparelho | não rodado | pendência humana (E4 da etapa) |

## Evidência

- `npm run test:campo`: tipos limpos, 139 suítes, 1997 de 1997, contagem conferida, código 0 (`$V/05-test-campo-1.txt`).
- Seis arquivos da etapa com `--verbose`: 68 de 68, código 0 (`$V/15-e15-e16-arquivos.txt`), com os casos "abaixo de meio metro vira 1, e não zero", "a leitura comum continua arredondada ao metro" e "aparelho que não informa a precisão grava nulo".
- `npx vitest run` em `packages/shared`: 18 arquivos, 223 de 223, código 0 (`$V/18-shared.txt`).
- `npm run test:api`: 1685 passaram, 34 pulados por ambiente (`renovacao-contra-encerramento`), código 0 (`$V/02-test-api-1.txt`); `precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 de novo isolado (`$V/17-api-arquivos-das-etapas.txt`).
- Mutações: `$V/mut/e15-d01.txt` a `e15-d05.txt`, `e15-g01.txt`, `e15-g02.txt`, `e15-s01.txt`, `e15-s02.txt`, `e15-s01-api.txt`, `e15-s02-api.txt`, `e15-c01.txt` a `e15-c03.txt`, `e15-v01.txt`. Todas reprovam; no jest inteiro, 1997 casos em cada, e só os ligados à mutação falharam.
- Política T42: 0 problemas, 0 skips incondicionais (`$V/04-portao-de-skip.txt`).
- CI, run 39420436042 (sobre `55209ab`, registro em cima de `fd17ff4`): "Suíte completa" (shared e API) no job "Testes, tipos e scripts" e "Testes do aplicativo" e "test:campo" no job "Aplicativo de campo", todos `success`, com `pipefail` (`$V/03-ci-jobs.txt`). Log não lido (exige token).

## Cenários positivos

- O diálogo de saída conta as vistorias começadas no toque, com singular, plural, fotos e assinatura, e usa o botão de perigo.
- O Perfil acompanha a fila ao vivo.
- GPS abaixo de 0,5 m grava 1 e o servidor aceita; leitura comum segue arredondada.

## Cenários negativos

- Sem rascunho e sem fila, a frase curta, sem falar em apagar.
- Precisão ausente grava `null`; 0 e negativo são recusados pelo esquema com frase em português, também na resposta do servidor.
- Sessão vencida não apaga nada; outro agente que entra no aparelho começa limpo; a mesma pessoa reencontra o rascunho.

## Tentativas de reprovar

- Congelei o resumo da fila do Perfil na montagem (a forma exata do defeito CMP-52): 16 casos reprovam.
- Fiz o diálogo ignorar o disco: 4 reprovam. Tirei o perigo do botão: 1 reprova (o caso do D1 da rodada 4 continua de pé).
- Afrouxei o esquema para `nonnegative` e traduzi a mensagem para o inglês: reprovam no pacote compartilhado E na resposta da API real (o teste da API lê o `dist`, por isso recompilei o shared na cópia antes e depois).
- Três formas de quebrar `acolherNoAparelho` (nunca limpa, sempre limpa, não chamada pelo `entrar`): todas reprovam.
- Conferi se o diff `1ed0b71..fd17ff4` enfraqueceu algo que esta etapa usa: não tocou nenhum arquivo dela; as contagens do `baseline.mjs` só subiram.

## Achados

- anotado: o botão destrutivo é preso por um caso só (d03 derruba 1). Morde, e é o caso consertado na rodada 4.
- anotado: o critério "comentário de `banco-local.ts` verdadeiro" é conferido só por leitura (E3a): não há como prendê-lo por teste, e a leitura confirma que o comentário descreve o que `perfil.tsx` faz.

Nenhum achado bloqueia.

## Não verificado

- E2E no aparelho ou emulador (diálogo listando o que vai ser apagado; conclusão com GPS simulado abaixo de 0,5 m sem 422 no aparelho): não há emulador nem aparelho. A resposta do servidor foi provada pela API real em teste, não pelo aparelho.
- Apagamento físico de arquivos no disco do aparelho e o chaveiro: só aparelho prova.
- Log do CI (exige token). Node 24 local; o CI (Node 22) passou.

## Risco residual

Os sete casos e os critérios positivos, negativos e de isolamento estão presos por testes que reprovam com cada mutação. O risco que sobra é o do aparelho real (disco, chaveiro, GPS do sistema), que é o E4 e a F14-E12.

## Motivo do humano

O bloco pede que o Rafael faça os dois fluxos num aparelho (sair com vistoria começada; concluir com GPS excelente). E4 não é produzido por agente, e esta máquina não tem emulador nem aparelho.
