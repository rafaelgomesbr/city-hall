# V2-F01-E18, correção da revisão 1: o --desfazer passa a ser fail-closed

## O achado

`motivoParaNaoDesfazer` (`dc360/db/src/desfazer.ts`) recusava só o que RECONHECIA
como produção: `AMBIENTE_DC360=prod`, `NODE_ENV=production` ou a identidade
conhecida do banco de PROD na URL. Uma cópia de PROD restaurada num projeto novo,
com outra referência, não é reconhecida por nenhuma dessas três coisas: bastava
a URL dela numa máquina sem variável nenhuma e o `npm run migrar -- --desfazer`
apagava dado de município real. A guarda do `--semear` já era fail-closed; a do
`--desfazer`, que apaga, era mais frouxa.

## O que mudou

`dc360/db/src/desfazer.ts`, `motivoParaNaoDesfazer`: só desfaz em

1. **banco descartável**: sem `DATABASE_URL` (o Postgres em WebAssembly) ou host
   que é a própria máquina (`localhost`, `127.0.0.1`, `::1`) ou um serviço do
   Docker (um rótulo, sem ponto), as mesmas funções da guarda do `--semear`
   (`hostEhDescartavel` e `segmentosDaUrl`, agora exportadas); ou
2. **HML declarado**: `AMBIENTE_DC360=hml` e `IDENTIDADE_DO_BANCO` com a
   referência do projeto de HML constando, por segmento, no usuário ou no host da
   URL. A identidade declarada não pode ser genérica (nome de papel, pedaço de
   host do provedor, região, menos de 8 caracteres; lista `IDENTIDADES_GENERICAS`,
   conferida por teste contra as listas da API), nem a de PROD.

Recusa o resto, sem repetir a URL nem a referência: banco hospedado sem a
declaração de HML (inclusive o PROD restaurado num projeto novo),
`AMBIENTE_DC360=prod`, `NODE_ENV=production` fora do HML declarado (o runtime do
Fly de HML também é `production`, por isso o HML declarado passa), URL que não dá
para analisar e URL com a identidade de um banco de PRODUÇÃO (também quando o
host é loopback, o túnel para o banco de verdade).

Documentação: `docs/runbooks/migracao.md` e `docs/runbooks/rollback.md` descrevem
a regra nova.

## Prova

`db/test/desfazer-migracao.test.ts` (+10): o PROD restaurado num projeto novo,
sem variável nenhuma, em `dev` e em `NODE_ENV=development`, recusa sem tocar no
banco (executor que falha se encostado) e sem repetir senha nem referência; hml
sem identidade ou com a de outro banco recusa; identidade de HML genérica não
libera mesmo constando na URL; HML com a referência certa passa (também com
`NODE_ENV=production`); identidade de HML igual à de PROD, ou URL de PROD com o
HML declarado, recusa como PRODUÇÃO; `prod` recusa sempre; URL ilegível recusa;
descartável com identidade de PROD no usuário recusa; as listas genéricas cobrem
as da API; e o comando de verdade (`tsx src/cli.ts --desfazer`) sai com código 1
sem conectar. O caso "homologação e desenvolvimento podem desfazer" virou "banco
descartável pode desfazer" (o que mudou foi a regra, de propósito).

Saídas em `saidas/`: o arquivo de teste (01), `test:scripts` com `CI=true` (02),
lint, teto, formato, números, linha de base e regras de conteúdo (03), typecheck
(04), resumo de `npm test` (05) e `npm run test:isolamento` (06).

## Limites declarados

- Em HML, quem declara `AMBIENTE_DC360=hml` e uma referência específica que
  consta na URL é tratado como HML: a guarda não tem de onde saber qual é a
  referência verdadeira de HML antes do CP-05 (`ambientes.json` ainda tem
  `identidadeDoBanco: null` para HML). Quando o CP-05 preencher a matriz, vale
  fazer o desfazer conferi-la; hoje a declaração é do operador.
- Não foi executado contra um banco hospedado de verdade.
