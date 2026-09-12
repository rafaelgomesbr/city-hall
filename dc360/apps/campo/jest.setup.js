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
