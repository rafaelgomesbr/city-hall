# V2-F01-E09, correção da revisão 1: IDENTIDADE_DO_BANCO genérica não anula mais a trava de ambiente cruzado

## O achado

A trava de ambiente cruzado compara `IDENTIDADE_DO_BANCO` com os segmentos do
usuário e do host da `DATABASE_URL`. Qualquer palavra servia: `dc360_api` (o papel
da aplicação, primeiro segmento do usuário na URL de TODOS os ambientes),
`pooler`, `supabase`, `aws-0-sa-east-1` (o host do pooler, o mesmo em HML e PROD)
ou uma palavra curta. Com uma identidade assim a URL de PROD colada no HML
"constava", a partida passava, e o HML falava com a base dos municípios, que é
exatamente o defeito que a trava existe para impedir.

## O que mudou

- `dc360/apps/api/src/ambiente.ts`: `problemaNaIdentidadeDoBanco` (e as listas
  `PAPEIS_DE_BANCO`, `SEGMENTOS_GENERICOS_DE_HOST`, `TAMANHO_MINIMO_DA_IDENTIDADE`).
  Recusa, com mensagem em português que diz o porquê e o que usar no lugar:
  nome de papel de banco (e qualquer `dc360_*`), pedaço de host do provedor
  (`pooler`, `supabase`, região como `sa-east-1`, `aws-0-sa-east-1`, rótulos dos
  domínios compartilhados) e identidade com menos de 8 caracteres. A referência
  do Supabase tem 20, e a marcadora `a-definir-no-cp-05` continua passando por
  esta regra (a partida de HML recusa por outro motivo, de propósito).
- `dc360/apps/api/src/config.ts` (`IDENTIDADE_DO_BANCO`) e
  `dc360/apps/console/src/config.ts` (`CONSOLE_IDENTIDADE_DO_BANCO`): a partida de
  HML e PROD chama a regra antes de comparar com a URL e recusa sem repetir a URL.
- `dc360/scripts/conferir-ambiente.mjs`: a mesma regra (listas iguais às da API,
  conferidas por teste) aplicada à matriz `ambientes.json` e ao `[env]` dos
  `fly*.toml`, para a identidade genérica reprovar também no repositório.
- `dc360/docs/AMBIENTES.md`: nova linha na tabela de mensagens.
- Fixtures de teste que usavam identidades curtas (`dc360`, `exemplo`, `projeto`,
  `localhost`) passaram a usar uma referência de projeto, e a URL delas a contê-la
  (`dc360_api.refprodxxxxxxxx`), sem mudar a contagem.

## Prova

- `apps/api/test/contrato-de-ambiente.test.ts` (+3): identidades recusadas com o
  motivo certo em HML e PROD; o caso em que a URL de PROD colada no HML
  "constava" na identidade `dc360_api` agora recusa, sem repetir a senha; a
  referência real continua aceita.
- `apps/console/test/contrato-de-ambiente.test.ts` (+1): o mesmo para o console.
- `scripts/conferir-ambiente.test.mjs` (+4, 46 no total): listas iguais às da
  API; a função recusa papel, host, região e palavra curta e aceita referência;
  a matriz reprova; os dois `fly*.toml` de PROD reprovam.
- `scripts/baseline.mjs`, README e COLOCAR-DE-PE com as contagens novas
  (`npm run conferir:numeros` verde).

Saídas em `saidas/`: o arquivo de teste (01), `test:scripts` com `CI=true` (02),
lint, teto, formato, números, linha de base e regras de conteúdo (03), typecheck
(04) e o resumo de `npm test` com os seis pacotes (05).

## Limites declarados

- A regra recusa o genérico que conhece (papéis, host do provedor, curto). Uma
  palavra comum de 8 ou mais caracteres que apareça em todas as URLs e não esteja
  na lista passaria. A defesa final continua sendo declarar a referência inteira
  do projeto, e a matriz do CP-05 fixa HML e PROD diferentes.
- O `fly.hml.toml` segue com o marcador `a-definir-no-cp-05` até o CP-05.
