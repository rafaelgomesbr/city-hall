# V2-F00-E15: sair da conta avisa o que apaga; GPS abaixo de 0,5 m conclui

Data: 2026-10-07. Executada sem commit. Etapa de DEFEITO REAL: os 7 testes
vermelhos estavam certos e quem mudou foi o código do app. Nenhuma asserção dos
7 foi afrouxada (a única linha de teste alterada neles está explicada abaixo).

## O que foi feito

**CMP-52, sair da conta com vistoria começada.**

- `apps/campo/src/app/(agente)/perfil.tsx`: o Perfil deixou de ler
  `fila.resumo()` uma vez na montagem e passou a assinar a fila por
  `useResumoDaFila`. No toque em "Sair da conta" ele lê `listarRascunhos` e só
  então abre o diálogo; se o disco não responder, o diálogo avisa do mesmo
  jeito. O botão de confirmar continua o destrutivo (`destrutiva: true`).
- `apps/campo/src/dados/aviso-da-saida.ts` (novo): o texto do diálogo. Conta as
  vistorias começadas, diz se há fotos e assinatura, diz que **sair apaga**,
  com singular e plural; o que se apaga vem antes do que fica guardado (a fila,
  que a saída não apaga); sem rascunho e sem fila volta à frase curta. Também
  corrige "1 coletas ainda não enviadas" para o singular. Todas as frases em
  `saidas/06-texto-do-dialogo-de-saida.txt`.
- `apps/campo/src/dados/resumo-da-fila.ts`: o gancho reassinava a fila a cada
  função ou objeto novo da sessão, e a reassinatura devolve o resumo do instante
  da assinatura. Com o Perfil assinando, isso prendia o chip no número velho
  (era o motivo de "quando a fila esvazia, o chip some" continuar vermelho
  depois da troca). Agora só a pessoa (`usuarioId`) decide reassinar. As
  funções continuam passando DIRETO para `obterFila`, sem embrulho: a fila
  guarda as da primeira chamada para sempre e elas são a fonte da autoria.
- `apps/campo/src/dados/banco-local.ts`: o comentário que afirmava que o
  diálogo contava rascunhos (e não contava) passou a dizer a verdade e onde
  está a prova. A REGRA de apagar não mudou.

**CMP-33, precisão de GPS abaixo de meio metro.**

- `apps/campo/src/dados/precisao-do-gps.ts` (novo): `precisaoDoGpsEmMetros`,
  `Math.max(1, Math.round(accuracy))`; ausente, `NaN`, zero ou negativo grava
  `null`, como antes. Usado em `vistoria/[id].tsx`.
- `vistoria/[id].tsx`: "Precisão de 1 metro" no singular. O teste da etapa
  exigia o texto exato "Precisão de 1 metros"; a asserção foi trocada para
  "Precisão de 1 metro", continua exata, e a troca está comentada no teste.
  Com o piso, "1" virou a leitura do GPS bom, e "1 metros" é texto mal escrito
  pelo portão visual. PREMISSA registrada no STATUS.
- `packages/shared/src/schemas.ts`: o campo virou `gpsPrecisaoMetrosSchema`,
  exportado, com a MESMA regra (`z.number().positive().nullable()`). A frase em
  português já existia (mapa global de `mensagens-do-zod.ts`, "Precisa ser
  maior que 0"); nada foi afrouxado. App antigo que mande 0 continua recusado.

**Testes novos (26).** App: `dados/aviso-da-saida.test.ts` (10),
`dados/precisao-do-gps.test.ts` (5, inclui passar cada valor gravado pelo
esquema do servidor), `dados/sair-e-entrar-nao-perde-a-coleta.test.ts` (5, banco
SQLite real do Node). Shared: `test/precisao-do-gps.test.ts` (3). API:
`test/precisao-do-gps-na-sincronizacao.test.ts` (3, pela rota
`POST /sincronizacao/vistoria`).

**Dublês atualizados (9 arquivos de teste do Perfil).** Os dublês de
`../dados/fila` só tinham `resumo`; ganharam `assinar`, que avisa o ouvinte na
hora como a fila de verdade (`perfil-identidade-e-estado`: a fila "pendurada"
não avisa). `ui/dialogo-na-conta.test.tsx` ganhou o dublê de
`listarRascunhos` vazio. Nenhuma asserção desses arquivos mudou. Um deles
(`perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx`) é da E14; só
recebeu as linhas do dublê.

## O que não se perde (a prova pedida)

`dados/sair-e-entrar-nao-perde-a-coleta.test.ts`, sobre SQLite real:

- a MESMA pessoa que entra de novo reencontra a vistoria começada, com
  checklist, foto e assinatura no disco, e a fila byte a byte igual;
- OUTRA pessoa recebe o aparelho limpo (`acolherNoAparelho` apaga o rascunho e
  as provas dele), MAS o item da fila da primeira continua intacto, no estado
  `pendente`, com a assinatura dele no disco;
- a saída explícita apaga o rascunho (o que o diálogo agora diz) e mais nada da
  coleta: fila e arquivo da fila ficam.

Regra de 2026-10-05 (E06, item pendente nunca vira bloqueado por sessão):
motor offline 187 de 187, inclusive `test/pausa-de-sessao.test.ts`; "Entrar de
novo" (sessão vencida) continua sem chamar `sair`
(`a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` verde).

Sonda (`saidas/03-sonda-sem-o-conserto.txt`): com `DELETE FROM
fila_sincronizacao` posto no logout, `acolherNoAparelho` apagando sempre e o
GPS sem o piso, 6 dos 10 casos novos reprovam, cada um nomeando o que perdeu.
Arquivos restaurados, SHA-256 conferido.

## Resultados medidos

- Os dois arquivos da etapa, ANTES: 17 testes, 14 falhas (7 da E15, 7 da E16;
  `saidas/01-...`, causa das 6 do diálogo: `fila.resumo is not a function`,
  porque o teste já assinava).
- Jest inteiro do app, DEPOIS: 1857 testes, 7 falhas, 127 suítes (era 1837
  com 14). As 7 são exatamente as da E16 (frase de envio, 2 de teclado, área
  segura, 2 de ajustes, foto vazia).
- Typecheck do app: os mesmos 2 erros do cache `.expo` (E21), conferidos por
  LISTA e não só por contagem (`saidas/04-...`).
- Motor offline: 9 arquivos, 187 testes, 0 falhas.
- Shared: 165 testes, 1 falha, a do travessão (E20), só as linhas
  pré-existentes.
- API (`npm run test:api`, antes do arquivo novo): 1234 testes, 1221 passam, 13
  pulados (`banco-tls`, E21), 0 falhas. Arquivo novo isolado: 3 de 3
  (`saidas/05-...`: 201 para o 1, 201 para nulo, 422 com
  `vistoria.gpsPrecisaoMetros: Precisa ser maior que 0` para o 0).
- `node --test scripts/baseline.test.mjs`: 16 de 16.
- Linha de base pelo roteiro, depois de tudo (`saidas/baseline-depois/`,
  `--so=typecheck,teste-shared,teste-campo-pacote,teste-api,teste-campo-app,test-campo`):
  6 de 6 conferem com os esperados novos do `baseline.mjs` (shared +3, API +3,
  app +20 e -7 falhas). Nessa rodada a API completa, já com o arquivo novo,
  deu 1237 testes, 1224 passam, 13 pulados, 0 falhas; `test:campo` para no
  typecheck pelos 2 erros do cache `.expo`, como esperado.

## Limitações e pendências

- O app (Expo) não renderiza neste ambiente: NÃO há captura do diálogo. A
  prova de interface é o texto que a tela desenha no teste de componente e o
  arquivo `saidas/06-...`. Foto de aparelho: validação humana pendente
  (LEIA-ME do app, passo 8; a prova física é a F14-E12).
- Validação humana: Rafael faz os dois fluxos num aparelho (vistoria começada
  e "Sair da conta"; GPS simulado abaixo de 0,5 m concluindo sem 422) e aprova
  as frases do diálogo.
- Não feito, por ordem da etapa: preservar o rascunho depois de sair (CP-24,
  F14-E02), criptografia local (F14-E04), os 7 da E16.
- Achado fora do escopo: o laudo (`packages/shared/src/minuta.ts`) e o cartão
  de vistoria concluída do Perfil escrevem "N metros" sem singular; com o piso,
  "1 metros" fica comum. Em `apps/campo/PENDENCIAS.md`, item 15.
- `npm run test:isolamento` não foi rodado: a etapa não toca banco,
  autorização nem código da API (só um teste novo da API).
