---
validador: testes (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão testes. Cada um dos sete critérios do bloco (frase sem "aplicativo fechado", primeiro toque que age, rolagem que conhece o teclado, área segura da câmera, ajustes na câmera e na localização, foto vazia com a frase certa) e os consertos das correções (cópia assíncrona com dublê fiel, limpeza de órfão, contraste sobre o visor, tarja como região viva) têm teste que morde. O código da etapa não mudou desde a rodada 3. Atenção à correção 5 da E19 (`bb0f654`), que subiu `expo` para 57.0.30 e `expo-router` para 57.0.28: conferi que o `expo-file-system` instalado continua 57.0.7 (`apps/campo/node_modules/expo-file-system/package.json`), então o contrato de `File.copy` assíncrona que o dublê fiel imita não mudou. Ficam dois achados "corrige antes de crescer", ambos reproduzidos nesta rodada: o dublê ainda reprova o conserto alternativo `copySync` (vermelho falso), e o portão de segundo plano ainda deixa passar promessa fora das classes dele.

Saídas em `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/testes-E06-E14-E15-E16-E18/`. Mutações por `$V/mutar.py` (troca exata, roda, `git restore`, confere `git status` vazio).

| Critério | Teste que prende | Mutação | Resultado |
| --- | --- | --- | --- |
| frase da vistoria guardada sem "aplicativo fechado" | "não promete envio com o aplicativo fechado" e o portão de segundo plano | T1: volta "sobe mesmo com o aplicativo fechado" em `vistoria/[id].tsx` | morde: 1 reprova no jest (`e16-27`) e 1 no portão (`e16-31`) |
| primeiro toque fora do campo age | "o primeiro toque fora do campo AGE" | K1: tira `keyboardShouldPersistTaps="handled"` | morde: 1 reprova (`e16-20`) |
| rolagem conhece a altura do teclado | "a rolagem sabe a altura do teclado" | K2: tira `automaticallyAdjustKeyboardInsets` | morde: 1 reprova (`e16-21`) |
| câmera reserva a área segura de baixo | "reserva a área segura de baixo" | SA: `paddingBottom` sem `margens.bottom` | morde: 1 reprova (`e16-22`) |
| falha que não é de permissão não ganha o botão | "o botão não sobrevive à falha seguinte" e vizinhos | P1: toda falha nasce com `abreAjustes: true` | morde: 4 reprovam (`e16-23`) |
| o botão chama `Linking.openSettings` | "de câmera: a tarja traz ... e o botão abre os ajustes" e o de localização | P2: o botão não faz nada | morde: 3 reprovam (`e16-24`) |
| localização negada ganha o mesmo botão | "de localização: a mesma tarja, o mesmo botão" | P3: localização negada usa `setErro` | morde: 2 reprovam (`e16-25`) |
| foto vazia mostra a frase de `guardarFotoNoAparelho` | "a tarja diz a frase certa" e os 2 de fallback | F1: o `catch` de `fotografar` sempre usa a genérica | morde: 4 reprovam (`e16-26`) |
| tarja lida por leitor de tela | "o botão dos ajustes tem nome ... e área de toque de 44" | A11Y: tira `accessibilityLiveRegion="assertive"` da tarja | morde: 1 reprova (`e16-28`) |
| a cópia é esperada antes de medir (correção 2) | `evidencia-no-disco.test.ts` (dublê assíncrono) | D1: `void ...copy(destino)` sem `await` | morde: a suíte reprova (uma delas morre por rejeição solta, 192 casos contados em vez de 212) (`e16-10`) |
| a tela espera `guardarFotoNoAparelho` | `vistoria-a-foto-com-o-disco-fiel` (módulo real, disco fiel) | D2: a tela não espera a Promise | morde: 1 reprova (`e16-11`) |
| contraste de "Voltar sem fotografar" sobre o visor | `vistoria-camera-legivel-sobre-o-visor` (estilo real medido) | D3: tira `SobreOVisor` | morde: 1 reprova (tema claro) (`e16-12`) |
| cópia pela metade não deixa órfão | `evidencia-no-disco.test.ts` | D4: tira a limpeza do `catch` | morde: 1 reprova (`e16-13`) |
| arquivo de tamanho 0 não deixa órfão | idem | D5: tira a limpeza do vazio | morde: 1 reprova (`e16-14`) |
| o teste não trava a implementação (conserto alternativo válido) | idem e o teste de tela | D6: `copySync(destino)` no lugar de `await copy(destino)` | **vermelho falso**: 2 reprovam (`e16-15`) |
| nenhuma promessa de segundo plano na interface (DoD) | portão `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` | plantio de "Assim que o sinal voltar, a coordenação recebe a vistoria." no arquivo real | **passa pelo portão**: 15 de 15 (`e16-32`) |

## Evidência

- Lote de 10 arquivos (lista em `$V/lote-e16.txt`): `cd dc360/apps/campo && npx jest --ci --randomize --seed=N`, N = 6, 10, 21: código 0, 212 de 212 em cada (`$V/e16-01-lote-semente-*.txt`).
- Jest inteiro e `npm run test:campo`: código 0, 1927 de 1927, tipos limpos, contagem confere (`$V/00-jest-app-completo.txt`, `$V/00-test-campo.txt`).
- Portões do aplicativo: `node --test` com os portões de acessibilidade, densidade, design e segundo plano: 48 de 48, código 0 (`$V/e16-30-portoes-do-app.txt`).
- Motor (regressão): 223 de 223, 3 vezes (`$V/e06-01-*`).
- Mutações: `$V/e16-10` a `e16-32`, cada uma com "restaurado: True".
- Portão T42: `node scripts/portao-de-skip.mjs` código 0.

## Cenários positivos

- Com o disco fiel, a foto é aceita: "Fotografias (1)", sem a tarja de arquivo vazio, e o rascunho guarda o caminho e o tamanho da cópia.
- Câmera e localização negadas: a tarja traz "Abrir os ajustes do aparelho" e o botão chama `Linking.openSettings`.

## Cenários negativos

- Falha que não é de permissão nasce sem o botão, e o botão não sobrevive à falha seguinte (P1).
- Câmera que não disparou mantém a frase genérica; cópia recusada pelo sistema sai em português; cópia pela metade e arquivo vazio são apagados.

## Tentativas de reprovar

1. 16 mutações, uma por critério ou conserto: 14 mordem, D6 dá vermelho falso, e o portão deixa passar uma promessa nova.
2. **Conserto alternativo `copySync` (D6).** O contrato instalado oferece `File.copySync`, e com ele a foto fica certa. Dois casos reprovam: "o pedaço que uma cópia interrompida deixou também é apagado" (o dublê só simula a cópia pela metade em `copy`) e o teste de tela, cujo dublê "fiel ao expo-file-system 57" não tem `copySync` e cai em "o armazenamento pode estar cheio". É vermelho falso, não verde falso: não esconde defeito, só trava a implementação.
3. **Promessa nova no arquivo real**: "Assim que o sinal voltar, a coordenação recebe a vistoria." plantada em `vistoria/[id].tsx` passa pelo portão (`e16-32`). A promessa antiga ("mesmo com o aplicativo fechado") reprova (`e16-31`). O critério da etapa é sobre o texto de hoje, que o portão e o caso de tela prendem; a lacuna é de cobertura futura.
4. Contrato do `expo-file-system` depois da correção 5 da E19: versão instalada 57.0.7, a mesma que a rodada 3 conferiu (`copy` assíncrona, `copySync` síncrona, `size` zero para arquivo inexistente).
5. Ordem aleatória em 3 sementes: verde.

## Achados

### CORRIGE ANTES DE CRESCER

1. **Dublês incompletos prendem a implementação a `copy` assíncrona** (herdado da rodada 3, ainda vivo). Reprodução: `$V/e16-15-D6-copySync-alternativo.txt`. Conserto: `copySync` no dublê de `vistoria-a-foto-com-o-disco-fiel.test.tsx` e a cópia pela metade também no `copySync` de `evidencia-no-disco.test.ts`. Dono: E16.
2. **Portão de segundo plano com lacuna por classe** (herdado): a retomada do sinal como gatilho ("assim que o sinal voltar, a coordenação recebe") não é reconhecida. Reprodução: `$V/e16-32-portao-com-promessa-nova.txt`. Dono: E16 (portão) ou F01-E03.

### ANOTADO

- O teste de 44 de altura confere `minHeight` do estilo do botão, não a área de toque medida; serve ao critério porque o `Botao` do aplicativo usa `minHeight` como alvo.

## Não verificado

- Teclado, área segura, Ajustes e foto aceita num aparelho ou emulador (E2 e E4): não há emulador Android nesta máquina e não há build de desenvolvimento para o Simulador de iOS; fora desta dimensão, pendência humana do bloco.
- Leitura do texto pelo React Native em tempo de execução (frase montada com valor de fora do arquivo): o portão não alcança, por desenho.
- O CI do SHA não foi lido.

## Risco residual

Médio-baixo. Os sete critérios e os consertos das correções estão presos por testes que mordem, inclusive o defeito de perda de foto, com dublê fiel ao contrato instalado. O que resta é rigidez de dublê (vermelho falso) e um portão heurístico com lacunas.

## Motivo do humano

Nenhum para esta dimensão.
