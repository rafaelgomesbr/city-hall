---
validador: testes
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` é `SCRATCH/validadores/testes`. Mutações por `$V/mutar.sh` (aplica, roda o jest INTEIRO do aplicativo ou o portão indicado, `git restore`, confere o arquivo limpo). A E16 não tem commit novo desde a rodada 4, mas `vistoria/[id].tsx` foi tocado pela correção 3 e 3b da E06; por isso rodei tudo de novo neste SHA.

| Campo do bloco | Onde está o teste | Rodou no SHA | Morde? |
| --- | --- | --- | --- |
| Positivo: frase sem "aplicativo fechado" | `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`; portão `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` | verde 2x | sim: f1 2 vermelhos no jest e 1 no portão (g1) |
| Positivo: o primeiro toque fora do campo age | mesmo arquivo | verde 2x | sim: k1 (sem `keyboardShouldPersistTaps`) 1 vermelho |
| Positivo: a rolagem conhece a altura do teclado | mesmo arquivo | verde 2x | sim: k2 (sem `automaticallyAdjustKeyboardInsets`) 1 vermelho |
| Positivo: a câmera reserva a área segura | mesmo arquivo | verde 2x | sim: s1 (sem `margens.bottom`) 1 vermelho |
| Positivo: tarjas de câmera e localização com o botão que chama `Linking.openSettings` | mesmo arquivo | verde 2x | sim: a2 (permissão sem o botão) 5 vermelhos; a3 (sem o `catch`) 1 vermelho |
| Positivo: foto vazia mostra "Tire a foto de novo" | mesmo arquivo; `dados/evidencia-no-disco.test.ts`; `__tests__/vistoria-a-foto-com-o-disco-fiel.test.tsx` | verde 2x | sim: v1 (frase genérica) 4; c1 (cópia sem `await`) 1 vermelho e uma suíte derrubada |
| Negativo: falha que não é de permissão não ganha o botão | mesmo arquivo | verde | sim: a1 (botão em toda falha) 4 vermelhos |
| Negativo: a frase nova não promete segundo plano | arquivo da tela, `ui/fila-como-produto.test.tsx`, `ui/dialogo-na-fila.test.tsx`, portão | verde 2x | sim: f1, g1, g3 |
| Negativo: precisão ausente continua `null` | `dados/precisao-do-gps.test.ts` (E15) | verde | ver relatório da E15 |
| Contraste do "Voltar sem fotografar" (correção 2) | `__tests__/vistoria-camera-legivel-sobre-o-visor.test.tsx` | verde 2x | sim: o1 (sem `SobreOVisor`) 1 vermelho |
| Autorização e isolamento | bloco diz "Não se aplica" | n/a | n/a |
| Regressão: `test:campo` e os três portões do app | `test:campo`; portões de acessibilidade, densidade, design e o de segundo plano | `test:campo` 1997 de 1997 2x; portões 48 de 48 2x | n/a |
| E2E no aparelho | sem emulador nem aparelho | não rodado | pendência humana E4 |

## Evidência

- 6 arquivos da etapa no jest, 2x: 122 de 122, código 0 (`$V/e16-01-arquivos-1.txt`, `-2.txt`); embaralhados (sementes 21 e 22) com os da E14 e E15: verdes (`$V/e15-e16-04-embaralhado-*.txt`).
- `node --test` dos portões de acessibilidade, densidade, design e segundo plano, 2x: 48 de 48, 0 pulados, código 0 (`$V/e16-02-portoes-*.txt`). `npm run test:scripts` inteiro: 288 de 288, 0 pulados (`$V/geral-07-test-scripts.txt`).
- `npm run test:campo`, 2x: 1997 de 1997 (`$V/geral-01-*.txt`, `geral-02-*.txt`).
- Mutações: `$V/mut-e16-f1`, `k1`, `k2`, `s1`, `a1`, `a2`, `a3`, `v1`, `c1`, `o1`, `g1`, `g2`, `g2b`, `g3`, `d6`.
- T42: nenhum `skip`, `only`, `todo` ou condicional de ambiente nos arquivos da etapa nem nos portões; varredura limpa (`$V/geral-05-portao-de-skip.txt`).

## Cenários positivos

- Tela da vistoria guardada com a condição do aplicativo aberto; teclado e área segura pelas propriedades; botão de ajustes nas duas permissões; foto vazia com a frase certa e o arquivo órfão apagado; botão sobre o visor com contraste medido.

## Cenários negativos

- Falha que não é de permissão sem o botão de ajustes; câmera que não dispara mantém a frase genérica; o portão reprova a frase do aplicativo fechado e "chega à coordenação quando a rede voltar".

## Tentativas de reprovar

- 10 mutações de produto na tela e no disco: todas reprovam o jest inteiro.
- Achado da rodada 4, dublê que prende a implementação: troquei `await new File(...).copy(destino)` pelo conserto alternativo e correto `copySync(destino)` (`$V/mut-e16-d6-copySync-alternativo.txt`): 2 de 38 reprovam ("o pedaço que uma cópia interrompida deixou também é apagado" e "a foto é aceita: 'Fotografias (1)'"). Continua: o dublê de `vistoria-a-foto-com-o-disco-fiel.test.tsx` e o caso da cópia interrompida só conhecem `copy`.
- Achado da rodada 4, lacuna do portão por classe: plantei "sobe assim que o sinal voltar, e a coordenação recebe" na tela (`$V/mut-e16-g2-portao-promessa-pelo-sinal.txt`): o portão passa 15 de 15. Na mesma posição o jest reprova (g2b, porque o teste da tela exige a frase exata), então a lacuna é só do portão genérico.

## Achados

### CORRIGE ANTES DE CRESCER

1. **O dublê ainda reprova o conserto alternativo `copySync`** (herdado das rodadas 3 e 4). Reprodução: `$V/mut-e16-d6-copySync-alternativo.txt`. É vermelho falso contra um conserto certo, não verde falso. Dono: E16.
2. **O portão de segundo plano não reconhece a volta do sinal como gatilho de chegada** (herdado). Reprodução: `$V/mut-e16-g2-portao-promessa-pelo-sinal.txt`. A frase plantada na tela da vistoria é pega pelo jest; em outra tela sem teste de frase exata, passaria. Dono: E16 (portão) ou F01-E03.

### ANOTADO

- O alvo de 44 de altura é conferido pelo `minHeight` do estilo do botão, não pela área de toque medida no aparelho.

## Não verificado

- E2E do bloco no aparelho: negar a câmera e tocar no botão (abre os Ajustes); digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque; obturador acima da barra do sistema; foto aceita no Android. Sem emulador nem aparelho nesta máquina. Pendência humana E4.
- Leitura da tarja pelo leitor de tela do iOS (anotado pela acessibilidade na rodada 4).
- CI do SHA: ausente (H32).

## Risco residual

Cada critério da etapa tem teste que morde. O teclado e a área segura são provados pelas propriedades passadas ao React Native, não pelo comportamento do aparelho. As duas lacunas herdadas não escondem defeito hoje.

## Motivo do humano

O E2E e a validação humana do bloco pedem o iPhone (e Android real quando houver): Ajustes, teclado no primeiro toque, área segura e foto aceita. Esta máquina não tem emulador nem aparelho.
