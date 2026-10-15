---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** no nível E1, com a prova em aparelho em "Não verificado". O defeito que reprovou a rodada 2 (toda foto recusada como "o arquivo saiu vazio" por `copy` assíncrona sem espera) está consertado, o contrato do módulo instalado confirma a premissa do conserto e o teste de tela com o módulo real morde exatamente com a frase do defeito. Os outros dois consertos mínimos da rodada 2 (contraste sobre o visor; "tentando sozinha") também mordem.

| Critério (bloco e rodadas 1 e 2) | Resultado | Prova |
| --- | --- | --- |
| contrato real de `expo-file-system` instalado | CONFIRMADO | versão 57.0.7: `NativeFileSystem.types.d.ts:53` `copy(...): Promise<void>` e `:57` `copySync(...): void`; `ios/FileSystemModule.swift:230` `AsyncFunction("copy")`; `android/.../FileSystemModule.kt:203` `AsyncFunction("copy") Coroutine` |
| rodada 2 (BLOQUEIA): foto recusada por medir antes da cópia | CONSERTADO, morde | `evidencia-no-disco.ts:61` `await new File(uriDaCamera).copy(destino)` dentro do `try`; chamador `vistoria/[id].tsx` faz `await guardarFotoNoAparelho`. Sem o `await`: `vistoria-a-foto-com-o-disco-fiel` reprova mostrando "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). Tire a foto de novo." e `evidencia-no-disco.test.ts` derruba o processo com rejeição solta (`51-mutE16-sem-await-VERMELHO.txt`) |
| dublê fiel ao contrato | PASS | o dublê do teste tem `copy` assíncrona (destino só existe depois) e `copySync` síncrona; o teste de tela usa o `evidencia-no-disco` REAL |
| foto vazia não deixa arquivo órfão | PASS, morde | sem `apagarFotoDoAparelho` no ramo de tamanho zero: "o arquivo vazio que a cópia deixou é apagado antes de a recusa subir" reprova (`52-mutE16-visor-e-orfao-VERMELHO.txt`) |
| rodada 2 (acessibilidade): "Voltar sem fotografar" 1,19:1 sobre o visor | CONSERTADO, morde | sem `SobreOVisor`: o caso do tema claro reprova (`52-mutE16-visor-e-orfao-VERMELHO.txt`) |
| rodada 2: "vai continuar tentando sozinha" | CONSERTADO | `fila.tsx` com "enquanto o aplicativo estiver aberto"; `dialogo-na-fila` e `fila-como-produto` verdes |
| frase da vistoria guardada sem "aplicativo fechado"; nenhuma promessa de segundo plano na interface | PASS | portão 15 de 15; varredura manual mais larga que o portão (`54-varredura-bruta.txt`): nenhuma promessa visível; o que sobra são comentários |
| primeiro toque fora do campo age; tarjas de câmera e localização com "Abrir os ajustes do aparelho"; recusa de abrir ajustes não estoura | PASS, morde | `keyboardShouldPersistTaps="never"` e `openSettings` desligado: 4 de 17 reprovam (`55-mutE16-teclado-ajustes-VERMELHO.txt`) |
| foto vazia mostra "Tire a foto de novo"; falha que não é de permissão sem botão de ajustes | PASS | `vistoria-o-teclado-a-camera-e-o-que-ela-promete` 17 de 17 |
| portões do app verdes | PASS | `node --test scripts/portao-*.test.mjs`: 79 de 79 (`12-portoes.txt`) |

## Evidência

- Suítes da etapa (8 arquivos: `evidencia-no-disco`, `vistoria-a-foto-com-o-disco-fiel`, `vistoria-camera-legivel-sobre-o-visor`, `vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `fila-como-produto`, `dialogo-na-fila`, `pausa-da-fila`, `falha-de-atualizacao`): 162 de 162 (`50-jest-e16.txt`).
- `npm run test:campo`: tipos limpos, 134 suítes, 1927 de 1927, código 0 (`11-test-campo.txt`); `npx jest`: 1927 de 1927 (`13-npx-jest-app.txt`); pacote do motor 223 de 223 (`10-pacote-campo.txt`); `npm run conferir:numeros`: 25 conferidas, 0 divergência, e o roteiro da linha de base espera os mesmos 1927 (`60-conferir-numeros.txt`).
- Mutações, todas restauradas com `git restore` (`git status --porcelain` depois só com as pastas `validacao/52952a1/`): `51` (sem `await`), `52` (sem `SobreOVisor` e sem apagar o órfão: 2 de 22 reprovam), `55` (teclado e ajustes: 4 de 17 reprovam).
- Portão contra frases novas (`portao-variantes.mjs`, `53-portao-variantes.txt`).

## Cenários positivos

- Foto com disco fiel: "Fotografias (1)", sem tarja, rascunho com o caminho do documento e o tamanho da cópia.
- Tarja de permissão negada com o botão que chama `Linking.openSettings`.

## Cenários negativos

- Cópia recusada pelo sistema (Promise rejeitada) sai em português e apaga o pedaço do arquivo.
- Falha que não é de permissão não ganha o botão de ajustes.
- Frases verdadeiras ("sobe quando o aplicativo estiver aberto e houver sinal", "Não feche o aplicativo antes de o envio terminar") passam no portão.

## Tentativas de reprovar

- Procurei outro uso assíncrono do `expo-file-system` sem `await` no app: `copy`, `move`, `text`, `bytes`, `base64` são `Promise`; os usos em `foto-do-agente.ts` (`await ...bytes()`, `await ...copy`) e `evidencia-no-disco.ts:229` (`return arquivo.bytes()` numa função que devolve a promessa) esperam. `create`, `write` e `delete` são síncronos no contrato.
- Procurei corrida nova criada pelo `await`: `fotografar` tem a trava `fotografando` antes do primeiro `await`, então dois toques não gravam duas fotos com a mesma ordem.
- Plantei 14 promessas novas fora do que a rodada anterior testou contra `promessasEm` do portão: 6 passam (achado 1). As 2 frases verdadeiras de controle passam, como devem.
- Tentei a prova em aparelho no Simulador de iOS (sem câmera): build e abertura do app, sem condução da interface (ver "Não verificado").

## Achados

### BLOQUEIA

Nenhum.

### CORRIGE ANTES DE CRESCER

1. **O portão de promessa de segundo plano ainda deixa passar promessas com verbo ou afastamento fora das classes dele.** Passam (`53-portao-variantes.txt`): "A coleta chega à coordenação mesmo com a tela apagada.", "Assim que o sinal voltar, a coordenação recebe a vistoria.", "A vistoria é despachada para o servidor quando a rede voltar.", "Mesmo desligado, o aparelho manda a vistoria depois.", "Quando houver rede, a vistoria vai embora para a coordenação.", "Seu trabalho já está a caminho da coordenação." Hoje nenhuma frase dessas existe no app (varredura manual), por isso não reprova a DoD; o risco é a próxima frase escrita passar. Sugestão: tratar "quando/assim que (o sinal|a rede|a conexão) voltar" e "recebe/manda/despacha/a caminho" como promessa que exige "aberto". Dono: E16 (portão) ou F01-E03.

### ANOTADO

2. O texto da permissão de câmera (`app.config.ts:39-43`, "quando houver sinal") continua sem a condição do aplicativo aberto; é declaração de loja, já anotado nas rodadas anteriores.

## Não verificado

- A foto aceita num aparelho de verdade: sem emulador Android; o Simulador de iOS não tem câmera e não pôde ser conduzido (sem `idb`, sem permissão de acessibilidade, inspetor do Hermes sem resposta). O build Debug do app passou e o app abriu contra uma API local (relatório de QA da E06). O contrato `AsyncFunction("copy")` é o mesmo no iOS e no Android, então a causa do defeito da rodada 2 valia para os dois, e o conserto também.
- Teclado real cobrindo o campo, área segura do iPhone, botão de ajustes abrindo os Ajustes no iOS, navegação por três botões no Android.

## Risco residual

Médio-baixo. O conserto da foto é o que o contrato manda e o teste de tela com o módulo real reproduz o defeito sem ele; falta só ver a foto aceita num aparelho. O portão de texto é melhor que o da rodada 2, mas ainda é heurístico.

## Motivo do humano

Rafael no iPhone (e em Android real quando houver): tirar a foto na vistoria e ver "Fotografias (1)", negar a câmera e tocar em "Abrir os ajustes do aparelho", digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque. As frases estão aprovadas por instrução (D7).
