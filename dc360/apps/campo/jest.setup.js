/**
 * O teto de tempo de um caso, e por que ele nao e o padrao de 5 s.
 *
 * Em 12/09/2026 o portao inteiro (`npm run verificar`) reprovou 7 casos deste
 * pacote com "Exceeded timeout of 5000 ms". Rodando so este pacote, na mesma
 * arvore e no mesmo minuto, os 308 passaram. A diferenca era carga: o portao
 * roda seis pacotes em sequencia, e as suites daqui montam arvore de React
 * Native de verdade em cima de um SQLite dublado, o que leva de 11 a 13
 * segundos POR ARQUIVO numa maquina ocupada.
 *
 * Isso nao e detalhe de conforto. Suite que reprova quando a maquina esta
 * ocupada e suite que a pessoa aprende a rodar de novo ate passar, e dai a
 * ignorar. O portao deste projeto so serve para alguma coisa se a reprovacao
 * dele significar defeito.
 *
 * O numero abaixo e o mesmo criterio ja usado em `apps/api/vitest.config.ts`:
 * generoso o suficiente para a maquina ocupada, e ainda muito abaixo de
 * qualquer espera de verdade, entao um caso que TRAVOU continua reprovando em
 * vez de pendurar a execucao. Nenhum caso aqui espera relogio real: os que
 * lidam com tempo usam temporizador falso.
 */
jest.setTimeout(30_000);

/**
 * A area segura do aparelho, dublada para a suite inteira.
 *
 * `Dialogo` passou a ler `useSafeAreaInsets` para prender a folha abaixo do
 * relogio do aparelho, e `Dialogo` e primitiva de `src/ui`: ele esta em toda
 * tela que pergunta antes de agir, e portanto em dezenas de suites que nunca
 * montaram um `SafeAreaProvider`. O hook de verdade ESTOURA sem provedor, o que
 * e o comportamento certo no aplicativo (provedor ausente e defeito) e o errado
 * na suite (cada arquivo teria que repetir o mesmo dublê).
 *
 * O dublê e o que a propria biblioteca publica para isto: devolve zero em
 * tudo quando nao ha provedor, e respeita um `SafeAreaProvider` com
 * `initialMetrics` quando a suite monta um. A suite que precisa de margens
 * proprias (`dialogo.test.tsx`, as do menu e da entrada) continua declarando o
 * seu `jest.mock` do modulo, e o dela vence: o do arquivo de teste e registrado
 * depois deste.
 */
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default);
