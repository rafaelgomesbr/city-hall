---
validador: testes (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

`$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-testes`. Execução numa CÓPIA de `fd17ff4` (`git archive`), com `node_modules` por link simbólico e `@dc360/*` apontando para os pacotes da cópia; mutações por `$V/bin/mutar.sh` (aplica, roda o jest inteiro do aplicativo, restaura por `git show fd17ff4:<arquivo>`, confere por `cmp`). A cópia final é idêntica a uma extração limpa do SHA. Os arquivos da etapa não mudaram entre `1ed0b71` e `fd17ff4`.

| Campo do bloco | Teste | Rodou no SHA | Mutação que o morde |
| --- | --- | --- | --- |
| Positivo: os 6 testes passam | `__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx` (frase), `__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx` (frase), `push/logout-cala-o-aparelho.test.tsx` (4 de logout) | verde (49 de 49 nos cinco arquivos, `$V/14-e14-arquivos.txt`) | ver as linhas abaixo |
| Positivo: texto vigente ("Entrar de novo", "Nada é apagado") | os dois arquivos de frase | verde | t01 (frase troca "Entrar de novo" por "Sair da conta") 3 vermelhos; t02 (sem "Nada é apagado") 2 |
| Negativo: a frase não instrui "Sair da conta" (`queryByText ... toBeNull`) | os dois arquivos de frase | verde | t01: as duas negativas reprovam junto com a positiva |
| Positivo: `falha-de-atualizacao.test.ts` segue verde | `dados/falha-de-atualizacao.test.ts` | verde | (regressão; o arquivo também reprova em t01 e nas mutações da E06) |
| Positivo: dublê completo faz os 4 de logout exercitarem o `sessao.tsx` real | `push/logout-cala-o-aparelho.test.tsx` | verde | t04 (`sair` manda a ficha nula ao servidor) 1; t05 (`sair` não esquece a ficha) 1 |
| Negativo: dublê sem um nome que `sessao.tsx` importa de `banco-local` faz o caso de deriva reprovar | "o dublê do banco local acompanha tudo o que sessao.tsx importa dele" | verde | t03 (`sessao.tsx` passa a importar `contarRascunhosNoDisco`) 1 vermelho, exatamente o caso de deriva |
| Autorização: mesma pessoa reencontra a vistoria, outro agente começa limpo | o bloco cita `dados/logout-nao-apaga-prova.test.ts`; quem prova é `dados/sair-e-entrar-nao-perde-a-coleta.test.ts` e `__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` | verde | mutações da E15 em `acolherNoAparelho`: c01 (nunca limpa) 4, c02 (limpa até a mesma pessoa) 4, c03 (`entrar` sem acolher) 5; nenhuma delas reprova `logout-nao-apaga-prova.test.ts` (ver Achados) |
| Regressão: `npm run test:campo`, pacote campo | | verdes | n/a |
| DoD: vermelhos de texto e de dublê do G00 zerados | jest do app 1997 de 1997, 0 falhas | verde | n/a |

## Evidência

- `npm run test:campo` na cópia: tipos limpos, 139 suítes, 1997 de 1997, contagem conferida, código 0 (`$V/05-test-campo-1.txt`).
- Os cinco arquivos da etapa com `--verbose`: 49 de 49, código 0 (`$V/14-e14-arquivos.txt`).
- Pacote do motor: 238 de 238, 2x (`$V/01-pacote-campo-1.txt`, `$V/16-pacote-campo-2.txt`).
- Mutações: `$V/mut/e14-t01.txt` a `e14-t05.txt` (jest inteiro, 1997 casos em cada; só os casos ligados à mutação falharam). As de isolamento: `$V/mut/e15-c01.txt`, `e15-c02.txt`, `e15-c03.txt`.
- Política T42: 683 arquivos, 0 problemas, 0 skips incondicionais (`$V/04-portao-de-skip.txt`); nenhum `skip`, `only` ou `todo` em `apps/campo/src`.
- CI, run 39420436042 (sobre `55209ab`, só registro em cima de `fd17ff4`): job "Aplicativo de campo", passos "Testes do aplicativo" e "Comando da raiz que mede o aplicativo (test:campo)" com `success`; `shell: bash` com `pipefail` no job (`$V/03-ci-jobs.txt`). Log não lido (exige token).

## Cenários positivos

- A sessão encerrada manda "Entrar de novo" e promete "Nada é apagado", na faixa e no Perfil.
- Os quatro casos de logout rodam o `sessao.tsx` real com o dublê completo: a ficha vai ao servidor, é esquecida depois, o município da sessão é guardado.

## Cenários negativos

- A frase da sessão encerrada não instrui "Sair da conta" (a tela do Perfil tem esse botão, e a negativa procura a instrução, não o rótulo).
- Um nome novo importado de `banco-local` sem par no dublê reprova o caso de deriva.

## Tentativas de reprovar

- Troquei a instrução da frase para "Sair da conta": as negativas e a positiva reprovam (t01).
- Fiz `sessao.tsx` importar um nome que o dublê não tem: o caso de deriva reprova sozinho (t03), sem depender de o nome ser chamado.
- Quebrei `sair()` de dois jeitos (ficha nula, ficha não esquecida): cada um reprova um caso de logout (t04, t05), o que prova que o dublê não esvazia o `sessao.tsx`.
- Conferi se o diff `1ed0b71..fd17ff4` tocou algum teste desta etapa ou afrouxou contagem: não tocou; as contagens de `baseline.mjs` só subiram.

## Achados

- anotado: o campo "Testes de autorização e isolamento" do bloco cita `src/dados/logout-nao-apaga-prova.test.ts` como prova de "mesma pessoa reencontra a vistoria, outro agente começa limpo". Esse arquivo testa outra coisa (o logout não apaga foto e assinatura que a fila ainda usa) e não reprova com nenhuma das três mutações de `acolherNoAparelho` (c01, c02, c03). A propriedade está provada, e morde, em `sair-e-entrar-nao-perde-a-coleta.test.ts` e `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx`. Não bloqueia; o nome no bloco engana quem for conferir.

## Não verificado

- A frase na tela do aparelho (a prova em aparelho é F14-E12 e a leitura das frases é do Rafael).
- "Nenhum arquivo de produto alterado": a E14 entrou no commit em lote `99390e0` (E11 a E25), então não dá para isolar o diff só dela; os três arquivos que ela reescreveu são de teste. Isso é da dimensão de Especificação.
- Log do CI (exige token).

## Risco residual

Baixo na dimensão Testes: as frases e o dublê estão presos por casos que reprovam com cada mutação relevante. Resta a leitura humana das frases.

## Motivo do humano

O bloco pede que o Rafael leia as frases finais da sessão encerrada (validação humana de texto de produto). Agente não produz essa aprovação.
