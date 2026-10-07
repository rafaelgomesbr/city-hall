# V2-F00-E17: scripts e conferência de números

Data: 2026-10-07. Máquina: Windows 11, Node 22.17.0, npm 10.9.2. Nada commitado.

## O que foi feito

### Os três casos de `test:scripts` que só reprovavam no Windows

A numeração do roadmap (casos 19, 22 e 37) é da linha de base de 2026-09-30; hoje
os mesmos casos são o 35, o 38 e o 53 da saída (`saidas/01`), porque a E01 e a E02
acrescentaram testes antes deles.

| Caso | Causa | Conserto |
| --- | --- | --- |
| `comando-de-migracao.test.mjs:52` | `execFileSync("npm", ...)` sem shell: no Windows `npm` é `npm.cmd`, a chamada morria com ENOENT, o `catch` engolia o erro com saída vazia, e o caso dizia "não chegou a CONFERIR nada" | `shell: process.platform === "win32"`, a mesma invocação de `scripts/testar-campo.mjs:103`. Os argumentos são fixos e sem espaço |
| `copiar-producao.test.mjs:48` | caminhos POSIX literais (`/Users/alguem/...`); o `resolve` do código os transforma em `C:\Users\alguem\...`, que não começa pela raiz do repositório de mentira nem casa a Área de Trabalho, e a função devolvia `null` | os caminhos nascem de `parse(resolve(".")).root` com `join`. Os seis lugares recusados continuam recusados (repositório, a raiz dele, iCloud `Mobile Documents`, Dropbox, `Google Drive`, OneDrive, Área de Trabalho) e a pasta fora disso continua aceita. `copiar-producao.mjs` não mudou |
| `entitlements-do-ios.test.mjs:73` | a regex procurava a comparação com `EAS_BUILD_PROFILE` escrita dentro do `mode`; o `app.config.ts` passou a decidir uma vez em `PERFIL_DE_PRODUCAO` (linha 158) e ler a constante no `mode` (597) e no `extra.pushAmbiente` (642) | a conferência virou a função `problemasDaEscolhaDoAmbiente`, que exige as três pontas (de onde a constante nasce e os dois lugares que a leem) e reprova `mode` escrito à mão. Caso NOVO que prova isso contra três rascunhos estragados (mode à mão, constante sem o perfil, `pushAmbiente` à mão) |

Diff dos três testes e do `conferir-numeros.mjs`: `saidas/07-diff-dos-scripts.diff`.

### `conferir-numeros.mjs` passa a declarar o que a lista estática não enumera

`vitest list` não enumera caso dentro de `describe.skip`/`it.skip` nem `runIf`/`skipIf`
que avaliou falso na coleta (conferido: `db/test/busca.test.ts` lista 3 dos 6 casos
dos `runIf`, e o `vitest run` do banco dá `327 passed | 3 skipped (330)`). Foi isso que
fez a API ser lida com 1104 contra 1109 executados na linha de base (o `describe.skip`
da vigência, removido na E04). Em vez de contar caso dentro de bloco pulado (o que
exigiria ler a sintaxe), a saída agora repete o que o portão de skip da E02
(`varrerArvore`) acha nos pacotes do vitest: pulos incondicionais com marca T42 (hoje
0) e pontos de pulo por ambiente por arquivo (hoje 3, em `db/test/busca.test.ts`).
`scripts/` (node:test) e o aplicativo (jest, contado lendo o código, `it.skip`
incluso) ficam fora dessa lista porque não passam pelo `vitest list`. O pulo decidido
durante a execução (os 13 de `banco-tls.test.ts`, cujo `beforeAll` precisa de
`openssl`) aparece na lista e conta: API listada 1237 = executada 1237 (1224 passaram, 13 pulados).

### As afirmações corrigidas

O título da etapa fala em 13 afirmações; antes de mexer, `conferir:numeros` apontava
17 (`saidas/02`). Origem, medida contra a saída da E01
(`docs/evidencias-v2/G00/V2-F00-E01/saidas/11-conferir-numeros.txt`) e o `git diff`
das suítes de navegador:

- As 13 da linha de base continuam lá, só com as linhas deslocadas:
  `docs/COLOCAR-DE-PE.md:40` e `:288` (agora `:302`), `README.md:12` a `:17`, e
  `README.md:1103` a `:1107` (agora `:1188` a `:1192`).
- 4 novas, todas de verificação no navegador, nenhuma da E14:
  - E12 acrescentou 15 verificações a `apps/web/test/fluxo-api.e2e.mjs` (236 para 251):
    reprovou `README.md:1329` ("236 verificações no navegador").
  - E13 acrescentou 2 a `apps/web/test/fluxo.e2e.mjs` (68 para 70): reprovou o
    segundo número de `README.md:13` e as linhas `:1271` e `:1345` ("68 verificações").
- Achada à mão, fora das 17: `README.md:13` dizia "103 contra a API" (o valor da
  E01; hoje 251). O portão não a pegava porque a forma elidida "N contra a API" não
  casa a regex `AFIRMACAO` (exige "teste", "verificaç", "de integraç" ou "de unidade"
  depois do número). Corrigida; a lacuna da regex ficou registrada no STATUS seção 11.

Números escritos (todos medidos hoje por `vitest list`, contagem de `ok(` e leitura
dos casos do app): banco 327, painel 633, navegador 70 local e 251 contra a API, API
1237, motor de campo 187, aplicativo 1861, console 259, `npm test` 2808 em seis pacotes,
4669 somando o aplicativo. Duas frases deixaram de mentir além do número:
`COLOCAR-DE-PE.md:40` dizia "testes verdes" e "`npm audit` em zero", e agora diz que
durante a F00 nem todos estão verdes e o audit não está em zero, apontando para o
STATUS; `README.md:14` dizia "testes da API passando" e agora diz que os 13 de TLS
ficam pulados sem `openssl` no PATH. Diff: `saidas/08-diff-dos-documentos.diff`.

### A forma de afirmar números é sustentável?

Não do jeito de hoje, e a etapa não tem como resolver sozinha. Três fatos:

1. O mesmo número é afirmado em até três lugares (tabela do README, bloco "Como
   testar" do README e `COLOCAR-DE-PE.md`). Uma etapa que acrescenta um caso na API
   apodrece três linhas de uma vez.
2. Na F00, quase toda etapa acrescenta teste: as seis etapas de E11 a E16
   mudaram alguma contagem afirmada (API, painel, navegador, shared ou aplicativo). A E18 (CORS do PUT e e2e) vai mexer de novo no navegador contra
   a API. `conferir:numeros` vai voltar a ficar vermelho na etapa seguinte que
   acrescentar caso, e isso é o portão funcionando, não defeito dele.
3. Ninguém roda `conferir:numeros` sem lembrar: ele está em `npm run verificar`,
   mas fora do CI (ligá-lo é da F01-E03) e fora do protocolo de cada etapa.

O que coube na etapa: corrigir para o estado de agora, o passo `conferir-numeros` do
`baseline.mjs` passar a esperar verde (então divergir depois de uma etapa nova quer
dizer "faltou corrigir o número", e o comentário do passo diz isso), e a nota do
README pedir a quem acrescenta teste que rode a conferência antes de encerrar. O que
NÃO coube e ficou no STATUS seção 11 como proposta para Rafael: (a) o protocolo de
etapa (`00-README.md`) passar a mandar rodar `conferir:numeros` quando a etapa mexer
em teste; (b) afirmar cada contagem num lugar só (a tabela do README) e os outros
documentos remeterem a ela, o que reduz a correção de três linhas para uma; (c)
ligar `conferir:numeros` ao CI na F01-E03 junto com `test:scripts`; (d) ensinar a
`AFIRMACAO` a forma elidida "N contra a API".

## Resultados (números reais)

| Comando | Antes | Depois |
| --- | --- | --- |
| `npm run test:scripts` | 198 testes, 191 passaram, 3 falhas, 4 pulados, saída 1 (`saidas/01`) | 199 testes, 195 passaram, 0 falhas, 4 pulados, saída 0 (`saidas/03`) |
| `npm run conferir:numeros` | 5 conferidas, 17 que não batem, saída 1 (`saidas/02`) | 22 conferidas, 0 divergências, saída 0 (`saidas/04`) |
| sonda: rascunho com "1236 testes da API" | | reprova, 1 afirmação, saída 1 (`saidas/05`); rascunho apagado em seguida |
| `node --test scripts/baseline.test.mjs` | | 16 de 16 |
| `baseline.mjs --so=teste-shared,teste-campo-pacote,teste-console,test-scripts,conferir-numeros` | | 5 de 5 conferem (`saidas/baseline-depois/`) |
| `baseline.mjs --so=teste-campo-app` | | confere: jest do app 1861, 0 falhas (`saidas/baseline-depois-2/02`) |

Os 4 pulados de `test:scripts` são por ambiente (sem pasta `ios/`), como a etapa pede.
Os 199 são 165 da linha de base, 16 da E01, 17 da E02 e 1 desta etapa;
`TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` ganhou `"V2-F00-E17": 1` (fora da tabela de
arquivos, porque o arquivo já existia).

`npm test` (regressão da etapa, `saidas/06`): motor de campo 187 de 187; shared 165
com 1 falha (travessão, E20, pré-existente); API 1224 passaram e 13 pulados de 1237
(`banco-tls`, E21, pré-existente; o arquivo aparece como "1 failed" porque o
`beforeAll` cai sem `openssl`); console 259 de 259; painel 633 com 1 falha
(`ocorrencia-encerramento.test.ts`, CRLF, E21, pré-existente); banco 327 passaram e 3
pulados de 330, com 1 erro não tratado do vitest (`Timeout calling "onTaskUpdate"`)
que faz o comando sair com 1.

O banco foi rodado mais três vezes (`saidas/09`, `saidas/10`,
`saidas/baseline-depois-2/01`): duas com o mesmo erro de RPC do vitest e duas com o
caso `a varredura acusa cada um dos seis caminhos de privilegio` estourando os 60 s.
O arquivo do CA-06 sozinho fecha 137 de 137 em 22 s (`saidas/11`). Esta etapa não
tocou `db/` nem código de produto. A máquina estava carregada por um processo de
fora do repositório (um `ng serve` de outro projeto, ligado desde 2026-09-29, com
CPU em torno de 50%), que não foi encerrado porque não é deste trabalho. O mesmo
erro de RPC já tinha aparecido uma vez na E08 (`V2-F00-E08/saidas/07`). Leitura:
instabilidade de tempo sob carga, da mesma família de `dominio.test.ts` e
`resolver-link.test.ts`, e não regressão. Registrado no STATUS seção 11.

## Limitações e o que falta

- **Linux não foi provado.** Não há WSL nem Docker nesta máquina, e o CI ainda não
  roda `test:scripts` (F01-E03). A portabilidade está provada só no Windows. Por isso
  a etapa fica EM ANDAMENTO: falta Rafael (ou o CI, quando a F01-E03 ligar) rodar
  `npm run test:scripts` e `npm run conferir:numeros` num Linux ou macOS. O
  raciocínio para esperar verde lá: no caso 22 `parse(...).root` vira `/` e os
  caminhos voltam a ser os de antes; o caso 19 continua sem shell fora do Windows; o
  caso 37 não depende de sistema.
- Os itens "scripts vermelhos" e "números" do G00 não foram marcados: item de gate
  só se marca no próprio gate, e a E22 refaz a conferência no fechamento.
- `README.md:16` ainda diz "21 de 21 no `expo-doctor`" e "`npm audit` em zero" para
  o aplicativo, e a mesma linha diz "TypeScript limpo" com 2 erros do cache `.expo`
  hoje: não são contagem de teste, são das etapas E19 e E21, e ficaram registrados
  para elas.
