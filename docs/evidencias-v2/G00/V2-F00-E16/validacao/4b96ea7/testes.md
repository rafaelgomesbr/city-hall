---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **FAIL**. A tela de vistoria está bem coberta (12 de 12 mutações mortas, e os dois "corrigir antes de crescer" da rodada 1 agora mordem). O que reprova é o par `evidencia-no-disco.ts` e seu teste: o dublê de `File` declara `copy(): void` síncrono, a biblioteca real tem `copy(): Promise<void>`, e por isso a suíte inteira fica verde enquanto, no Android, toda foto é recusada com "o arquivo saiu vazio" (achado do QA no emulador). Pior: o teste do repositório reprova se alguém aplicar o conserto certo.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/testes/` (abreviada `testes/`; índice em `testes/00-INDICE-DE-MUTACOES.txt`, entradas G1 a G12 e P-*).

| Critério | Resultado |
| --- | --- |
| frase da vistoria guardada sem "aplicativo fechado" | PASS (G11 morre) |
| nenhuma promessa de segundo plano na interface | **PASS parcial**: o portão pega 1 de 4 variantes reais que plantei (achado 3) |
| o primeiro toque age; a rolagem conhece o teclado | PASS como propriedade (G1, G2 morrem); o nome do teste promete mais do que a asserção prova |
| a câmera reserva a área segura | PASS (G3 morre; valor calculado com inset injetado) |
| tarjas de câmera e de localização com o botão que chama `Linking.openSettings`; falha que não é de permissão não ganha o botão | PASS (G5 morre com 4 reprovações) |
| `Linking.openSettings` rejeitando não estoura (rodada 1) | PASS (G4 morre: o caso usa rejeição real e `unhandledRejection`) |
| fallback de `FotoNaoGuardada` (rodada 1) | PASS (G6 e G7 morrem) |
| foto vazia mostra "Tire a foto de novo" | PASS na frase; **FAIL na causa**: o dublê não tem o contrato da biblioteca (achado 1) |
| dublês reproduzem o contrato da dependência | **FAIL** em `evidencia-no-disco.test.ts` (achado 1) |

## Evidência

Comandos em `dc360/apps/campo` com `npm run build:shared` antes (código 0, `testes/00-build-shared.txt`):

- Lote de 5 arquivos (`vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `evidencia-no-disco`, `fila-como-produto`, `pausa-da-fila`, `falha-de-atualizacao`): 137 de 137 (`testes/80-e16-base.txt`).
- Lote randomizado de 21 arquivos, 3 vezes: os arquivos da E16 passam em todas (`testes/110-app-lote-randomizado-3x.txt`).
- Contrato real do `expo-file-system` 57.0.7, lido por mim em `apps/campo/node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt`: `AsyncFunction("copy")` (Promise), `Function("copySync")` (síncrona), `Function("delete")`, `Function("bytesSync")` e `Property("size")` síncronos, `AsyncFunction("bytes")`. O arquivo `foto-do-agente.ts` do mesmo aplicativo faz `await new File(foto.uri).copy(destino)` e o teste dele (`foto-do-agente.test.ts:53`) declara `async copy(...): Promise<void>`: o projeto conhece o contrato; só `evidencia-no-disco.ts` e o seu teste o ignoram.
- **Sonda com dublê fiel, fora do repositório** (`testes/dobles/expo-file-system-fiel.js`: `copy` devolve Promise e só materializa o arquivo depois de ceder o laço de eventos; `copySync` síncrona; `size` zero para arquivo inexistente, como a documentação diz; configuração `testes/jest.sonda.config.js` com `moduleNameMapper`; teste em `testes/sonda/foto-contra-dublê-fiel.test.ts`; nada gravado em `apps/campo`):
  - Código atual: **vermelho**, `guardarFotoNoAparelho` lança "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). Tire a foto de novo." para uma foto de 812 345 bytes (`testes/10-sonda-dublê-fiel-estado-atual-VERMELHO.txt`). É o defeito do emulador, reproduzido em Node.
  - Com `copy(` trocado por `copySync(` em `evidencia-no-disco.ts` (a correção que o QA usou; mutação temporária, `git restore` depois): a mesma sonda fica **verde** (`testes/11-sonda-dublê-fiel-com-copySync-VERDE.txt`).
  - Com a mesma troca, o **teste do repositório** (`evidencia-no-disco.test.ts`) reprova 4 de 16: "é copiada do cache para o diretório de documentos", "declara o tamanho do arquivo que ficou", "o tamanho vem dos bytes de verdade" e "duas fotos no mesmo milissegundo não viram uma só" (`testes/12-teste-do-repo-com-copySync-VERMELHO.txt`). Ou seja, o teste atual **trava o uso errado da API** e obriga o autor do conserto a reescrevê-lo.
  - Disco cheio com o dublê fiel (`copy` rejeita a Promise): a rejeição solta derruba o processo do Node com `Error: ENOSPC` não tratado (`testes/14-sonda-dubleFiel-disco-cheio-estado-atual.txt`). O teste do repositório "a cópia recusada pelo sistema sai em português" usa `copy` que **lança de forma síncrona** (`mockRecusaCopiar`), caminho que a biblioteca real nunca produz; o `try/catch` de `guardarFotoNoAparelho` só protege esse caminho impossível.
- Mutações (`apps/campo/src`, `git restore` depois de cada, árvore limpa; script `testes/e16-muts.mjs`, saídas `testes/m-G*.txt`, resumos `testes/81-...txt` e `testes/82-...txt`): 12 de 12 mortas. G1 `keyboardShouldPersistTaps` removido (1); G2 `automaticallyAdjustKeyboardInsets` removido (1); G3 câmera sem a área segura (1); G4 `openSettings` sem `catch` (1); G5 botão de ajustes em toda tarja (4); G6 a tela engole a frase da foto (4); G7 fallback da foto genérico (2); G8 foto de zero bytes passa (1); G9 sempre lê os bytes em vez do `size` (1); G10 o erro nativo em inglês vaza (1); G11 a vistoria guardada promete "sozinha, mesmo com o aplicativo fechado" (1); G12 sem a cópia (4).
- Portão de segundo plano (`dc360/scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`): 4 de 4 no código atual (`testes/90-portao-base.txt`). Plantei na fila zerada de `fila.tsx` quatro frases (mutação real, `git restore` depois de cada), saída em `testes/91-portao-variantes-por-mutacao-real.txt`: "Vai sair assim que houver sinal." reprova (controle); **"Mesmo sem abrir o app, a coleta sobe.", "O envio roda no background." e "O envio segue mesmo se você fechar o aplicativo." passam com código 0**.

## Cenários positivos

Tarja de câmera e de localização com o botão; câmera em tela cheia acima da barra do sistema; foto com frase de disco cheio; precisão de GPS no singular; frase de vistoria guardada com a condição verdadeira.

## Cenários negativos

Falha que não é de permissão não ganha o botão (G5); o botão não sobrevive à falha seguinte; erro sem mensagem e valor que nem é `Error` caem no fallback certo (G6, G7); a câmera que não disparou continua com a frase genérica; `Linking.openSettings` rejeitando não vira rejeição solta (G4).

## Tentativas de reprovar

1. Procurei o dublê que não reproduz o contrato da dependência: achei em `evidencia-no-disco.test.ts` (`copy` síncrono, `size` nulo em vez de zero, falha síncrona em vez de Promise rejeitada). Reprovou.
2. Procurei o teste que trava o comportamento errado: o de `copy` (acima).
3. Procurei a ligação entre `fotografar` e o `guardarFotoNoAparelho` **real**: o teste da tela (`vistoria-o-teclado...`) substitui `../dados/evidencia-no-disco` por inteiro (`guardarFotoNoAparelho: () => mockGuardarFoto()`), e o teste do módulo substitui `expo-file-system`. Cada camada é verde contra um dublê que concorda com o dublê da outra e discorda da biblioteca. Nenhum teste faz `fotografar` produzir "Fotografias (1)" com o módulo real.
4. Procurei a frase de segundo plano que o portão deixa passar: 3 de 4 passam (acima). O próprio cabeçalho do portão reconhece o limite (lista fechada de expressões).
5. Procurei o teste cujo nome promete mais que a asserção: "o primeiro toque fora do campo AGE" confere a propriedade `keyboardShouldPersistTaps`, e "a rolagem sabe a altura do teclado" confere `automaticallyAdjustKeyboardInsets`, que só vale no iOS (o próprio código diz que no Android quem faz é o sistema). Não há teste de teclado no Android; é limite do jest e do emulador, já registrado, anoto.
6. Espera fixa e relógio: o caso de `Linking.openSettings` rejeitando espera 20 ms reais para o laço entregar a rejeição; é curto e deliberado, e não falhou em 4 rodadas (o lote de 137 e as 3 randomizadas). Sem `waitFor` frágil.

## Achados

### BLOQUEIA

1. **O dublê de `File` em `evidencia-no-disco.test.ts` não reproduz o contrato do `expo-file-system`, a suíte fica verde com o defeito de produção e reprova o conserto certo.** Arquivo: `apps/campo/src/dados/evidencia-no-disco.test.ts:49` (`copy(destino: { uri: string }): void`) contra `FileSystemModule.kt` (`AsyncFunction("copy")`). Reprodução: as quatro sondas acima. Corrige o produto (`await` na cópia, ou `copySync`) e o teste junto: o dublê precisa ter `copy` assíncrono que só materializa o arquivo depois de um tick, `copySync` síncrono, `size` zero (e não nulo) para arquivo inexistente, e a falha de disco cheio como Promise rejeitada. Teste a escrever: o que está em `testes/sonda/foto-contra-dublê-fiel.test.ts`. Dono: E16. Perda de dado do campo (item 5 da seção 7 de `28`): o agente não consegue anexar a foto exigida pelo checklist; não admite risco aceito. A causa anterior à E16 (`.copy(` vem do commit `2c4e488`, segundo o QA da rodada 2), mas a E16 adicionou o `try/catch`, a frase "arquivo saiu vazio" na tarja e o teste de cópia recusada, todos sobre o contrato errado.

### CORRIGE ANTES DE CRESCER

2. Não existe teste que ligue `fotografar` ao `guardarFotoNoAparelho` real com um dublê fiel de `File`. Um teste de integração pequeno (câmera devolve URI de cache, dublê assíncrono, esperado "Fotografias (1)" e rascunho com `tamanhoBytes` do arquivo copiado) teria pego o defeito do emulador.
3. O portão de segundo plano deixa passar três promessas reais (variantes acima). A DoD ("nenhuma promessa de segundo plano na interface") só está garantida para as frases que o portão conhece; vale incluir "background", "mesmo sem abrir", "fechar o aplicativo" e "segundo-plano" na lista, ou trocar o portão por uma lista de frases permitidas na fila e na vistoria guardada.
4. O teste de cópia recusada passa por um caminho que a biblioteca real não produz (falha síncrona). Some ao conserto do achado 1.

### ANOTADO

- Os testes de teclado conferem propriedades do `ScrollView`, não comportamento (limite do jest); só `automaticallyAdjustKeyboardInsets` é iOS.
- A frase do `catch` do `copy` ("o armazenamento pode estar cheio") assume que toda falha de cópia é disco cheio; com `copy` assíncrono e `await`, será preciso decidir se a rejeição chega com a mesma frase.

## Não verificado

- Emulador e aparelho: fora da minha dimensão (o QA da rodada 2 reproduziu o defeito no emulador e exercitou as tarjas); teclado do Android e do iPhone, área segura do iPhone e permissão do iOS não são reproduzíveis aqui e seguem como pendência humana.
- `npm run test:campo` completo (129 suítes) não foi repetido por mim; o lote randomizado cobre 21 arquivos.
- O texto de loja da permissão da câmera (`app.config.ts`, "quando houver sinal") é de outra dimensão e já está anotado pelo implementador.

## Risco residual

Alto até o achado 1 ser corrigido: sem a correção, e com um teste que reprova a correção, o próximo a mexer em `evidencia-no-disco.ts` vai "consertar" o teste de volta para o dublê síncrono.

## Motivo do humano

Nenhum para esta dimensão: tudo foi executado. A prova em iPhone e Android real continua com o Rafael (pendência humana da etapa).
