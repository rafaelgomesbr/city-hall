# V2-F01-E09: contratos de ambiente DEV, HML e PROD (matriz de variáveis, validação na subida, `.env.example`)

## Fatos

**O que mudou (tudo em `dc360/`):**

- `apps/api/src/ambiente.ts` (novo): as funções puras do contrato, usadas pela API e pelo console. `resolverAmbiente`
  lê `AMBIENTE_DC360` (`dev`, `hml`, `prod`) e a confere com `NODE_ENV`; `identidadeConstaNaUrlDoBanco` compara por
  segmento (usuário ou host); `hostNoDominio`, `problemaNoDominio` (recusa domínio compartilhado do provedor) e
  `problemaNaOrigem` (o formato que o navegador manda).
- `apps/api/src/config.ts`: quatro variáveis novas, todas não secretas (`AMBIENTE_DC360`, `IDENTIDADE_DO_BANCO`,
  `DOMINIO_DO_AMBIENTE`, `EMAIL_DOMINIOS_DE_TESTE`) e `ambiente` e `dominiosDeEmailDeTeste` no retorno de
  `carregarConfig`. Regras: `AMBIENTE_DC360` obrigatória com `NODE_ENV=production`; `dev` em produção e `prod` fora
  dela recusam; em `hml` e `prod` a identidade precisa constar no usuário ou no host da `DATABASE_URL`
  (HML com a URL de PROD recusa, e o contrário também); `URL_PAINEL` e cada item de `ORIGENS_PERMITIDAS` ficam sob
  `DOMINIO_DO_AMBIENTE`; `MARCA_DAGUA` vazia recusa em HML; e-mail ligado em HML exige `EMAIL_DOMINIOS_DE_TESTE`; a
  lista é proibida em PROD. As mensagens são em português e nenhuma repete a URL do banco.
- `apps/api/src/auth/dominios-de-teste.ts` (novo) e `apps/api/src/index.ts`: o notificador é embrulhado por
  `soParaDominiosDeTeste`, que recusa, antes de chamar o provedor, destinatário fora da lista (igualdade exata do
  domínio). Sem lista, devolve o notificador como está.
- `apps/console/src/config.ts`: `AMBIENTE_DC360` e `CONSOLE_IDENTIDADE_DO_BANCO`, com a mesma trava sobre a
  `CONSOLE_DATABASE_URL`. `AMBIENTE_DC360` fica sem o prefixo `CONSOLE_` de propósito (é rótulo, não segredo).
- `fly.toml` e `fly.console.toml`: as linhas novas no `[env]` (PROD: `prod`, a referência do projeto Supabase que
  `docs/IMPLANTACAO.md` já traz, e `dc360-painel-web.vercel.app`, que `docs/VERCEL-PAINEL.md` registra como o painel de
  PROD e que a E10 usa como origem de PROD).
- `scripts/ambientes.json` (novo): a matriz, por app, variável e ambiente (`obrigatoria`, `opcional`, `proibida`),
  com onde mora (`env` ou `segredo`) e o valor fixo das não secretas. Nunca guarda segredo.
- `scripts/conferir-ambiente.mjs` (novo): sem argumento, confere o repositório contra a matriz (cobertura do
  `config.ts`, tomls, identidades e domínios distintos, Node 22, Postgres 17); com `--ambiente --app`, compara os
  NOMES de `fly secrets list` com a coluna do ambiente. Só nomes: valor e resumo são descartados antes de qualquer saída.
- `scripts/conferir-ambiente.test.mjs` (novo, 42 casos).
- `.env.example` dos três workspaces (API, console e campo), `docs/AMBIENTES.md` (novo), notas em `docs/LEIA-ME.md`,
  `docs/IMPLANTACAO.md`, `docs/VERCEL-PAINEL.md` e `docs/COLOCAR-DE-PE.md`.
- `.node-version` (novo, `22`), `engines.node` de `package.json` e do `package-lock.json` em `>=22 <23`, README.
- `compose.yaml`: `postgis/postgis:17-3.5` (era 16-3.4) nos dois serviços, e `AMBIENTE_DC360: dev` na API.
- ORIGENS_PERMITIDAS endurecido (nota da F01-E10): em produção cada item precisa ser só `https://host`; recusa
  curinga, `http://`, barra final, caminho, consulta, usuário, porta padrão escrita, host em maiúsculas, texto que não
  é URL e lista vazia. O mesmo valor não vale em HML e PROD porque cada item precisa ficar sob o domínio do seu ambiente
  e a matriz proíbe domínios iguais ou aninhados.

**Testes** (saídas em `saidas/`):

- `apps/api/test/contrato-de-ambiente.test.ts` (novo, 50 casos) e `apps/api/test/dominios-de-teste.test.ts` (novo, 10):
  positivos (prod e hml partem, dev parte sem nada), negativos (produção sem `AMBIENTE_DC360`, `dev` em produção,
  HML com a `DATABASE_URL` de PROD, identidade por segmento, domínio compartilhado, URL_PAINEL e origens de outro
  ambiente, as onze formas de origem inválida, `MARCA_DAGUA` vazia em HML, e-mail sem lista, filtro proibido em PROD,
  e-mail de HML fora da lista recusado, esquema sem variável de organização) e a prova de que o `[env]` do `fly.toml`
  de verdade sobe com segredos de mentira, e não sobe com o banco de outro ambiente ou sem o `AMBIENTE_DC360`.
- `apps/console/test/contrato-de-ambiente.test.ts` (novo, 20 casos): o mesmo para o console, com o `fly.console.toml`.
- Os helpers de produção de `config.test.ts`, `banco-tls.test.ts`, `log.test.ts`, `recuperacao-em-producao.test.ts`
  (API) e `subir-em-producao.test.ts` e `superficie.test.ts` (console) ganharam as declarações novas, sem mudar contagem.
- Prova de mordida (`saidas/10-prova-de-mordida.txt`): seis travas removidas do fonte, uma de cada vez, cada uma
  derruba os casos esperados (5, 3, 8, 4, 1 e 3 reprovações); restaurado, 60 de 60.
- Contagens: `baseline.mjs` ganhou `V2-F01-E09: 42` (scripts) e `V2-F01-E09: { total: 60 }` (API), o passo do console
  foi de 307 para 327, e README e `COLOCAR-DE-PE.md` foram ajustados (1717 para 1777, 307 para 327, 3568 para 3648,
  5565 para 5645). `conferir:numeros` verde.

**Resultados dos portões:** ver `saidas/01` a `09` (typecheck, `npm test` da API, `npm run test:console`,
`conferir-ambiente.test.mjs`, `test:scripts`, `regras-de-conteudo`, `conferir:numeros`, `baseline.test.mjs`,
`conferir-ambiente` sobre o repositório).

## Limitações e o que NÃO foi provado

- **PROD ainda não sobe com as variáveis novas, por prova.** A prova é com segredos de mentira coerentes com o `[env]`.
  Que a `DATABASE_URL` real da API traz a referência `bppklrxxwjshxvkvwirw` no usuário ou no host, que a
  `CONSOLE_DATABASE_URL` real também a traz, e que `URL_PAINEL` e `ORIGENS_PERMITIDAS` reais são
  `https://dc360-painel-web.vercel.app` sem barra final: nada disto se vê de fora (são segredos do Fly), e é o que o
  Rafael confere (pendência abaixo). Se algum não bater, o deploy novo recusa subir e o release anterior segue no ar.
- A coluna de PROD da matriz foi escrita a partir do `fly.toml`, dos comentários dele e dos documentos, e não de um
  `fly secrets list` (sem login aqui). Pendência humana abaixo.
- `compose.yaml` com Postgres 17: não foi executado (sem Docker nesta máquina; o compose nunca teve registro de
  execução). A tag `17-3.5` é a imagem publicada do PostGIS 3.5 sobre Postgres 17, por conhecimento, não por `docker pull`.
- A trava de identidade compara o texto da URL com a declaração do `[env]`. Ela pega a credencial de outro ambiente
  colada no lugar errado; não impede alguém que edite as DUAS coisas (identidade e URL) para o ambiente errado. Esse caso
  é do `conferir-ambiente` (identidades de HML e PROD distintas no repositório) e da revisão de PR.
- O preflight de origem negada ainda devolve `access-control-allow-credentials: true` e `allow-methods` (nota da E10:
  dá para devolver 204 puro). É código de `servidor.ts`, fora dos arquivos desta etapa; não foi feito.
- O Postgres do CI continua 16 (E08).

## Justificativa

A trava de ambiente cruzado fica na PARTIDA, e não no código de negócio, porque o defeito que ela evita é uma
configuração válida no lugar errado: nenhuma outra validação enxerga. A identidade e o domínio são declarações NÃO
secretas no `[env]` versionado, e não segredos, para que o repositório consiga provar que HML e PROD declaram valores
diferentes; um valor secreto só se confere no Fly. A comparação por segmento (e não por trecho) evita que a referência
`abc` aceite o projeto `xabcx`. O domínio compartilhado do provedor é recusado como `DOMINIO_DO_AMBIENTE` porque o
painel de PROD também termina em `vercel.app`: um sufixo que é de todo mundo não separa ambiente. O filtro de e-mail de
HML recusa por igualdade exata do domínio e não repete o endereço na mensagem, porque a mensagem vai para coluna de
banco e log. A organização não aparece em nenhuma variável: um teste lê o esquema e reprova nome com `ORGANIZACAO`,
`MUNICIPIO` ou `TENANT`.

## Para o orquestrador

**Linha do STATUS sugerida:**

`| V2-F01-E09 | Contratos de ambiente DEV, HML e PROD (matriz de variáveis, validação na subida, .env.example) | M | P0 | IMPLEMENTADA | candidato <SHA> (ramo v2/f01) | Matriz scripts/ambientes.json; AMBIENTE_DC360, IDENTIDADE_DO_BANCO e DOMINIO_DO_AMBIENTE obrigatórias em hml e prod; HML com a DATABASE_URL de PROD recusa; filtro de e-mail de HML; ORIGENS_PERMITIDAS endurecido (nota da E10); conferir-ambiente (repositório e nomes de fly secrets list); Node 22 e Postgres 17 no compose. Pendente humano: conferir PROD antes do deploy. |`

**Conflitos prováveis na integração com o lote** (arquivos que outras etapas também tocam): `scripts/baseline.mjs`
(três tabelas e a linha do passo do console), `README.md` e `docs/COLOCAR-DE-PE.md` (os totais de testes, que o
`conferir:numeros` recalcula: refazer a soma depois de juntar), `CHANGELOG.md` (seção "Não lançado") e
`apps/api/src/index.ts` (só o trecho do notificador).

**Pendências humanas (o que o Rafael faz fora do repositório):**

1. Conferir a coluna de PROD contra o Fly, SEM imprimir valor:
   `cd dc360 && node scripts/conferir-ambiente.mjs --ambiente=prod --app=api` e o mesmo com `--app=console`. Deve sair 0.
   Se aparecer `FALTA`, `SOBRA`, `LUGAR` ou `DESCONHECIDO`, a matriz ou o Fly está errado: corrigir um dos dois.
2. Conferir que a `DATABASE_URL` da API e a `CONSOLE_DATABASE_URL` do console trazem `bppklrxxwjshxvkvwirw` no usuário
   ou no host (o usuário esperado é `dc360_api.<referência>` e `dc360_console_login.<referência>`), e que `URL_PAINEL` e
   `ORIGENS_PERMITIDAS` são `https://dc360-painel-web.vercel.app`, sem barra final.
3. `fly deploy` da API (`cd dc360 && fly deploy -a defesa-civil`) e do console (`fly deploy -c fly.console.toml`) com as
   variáveis novas, em primeiro plano. Conferir `/saude` nos dois depois, e o preflight com `if-none-match` em
   `access-control-allow-headers` (a API de PROD é anterior à F00-E18; nota da E10).
4. Se a imagem `postgis/postgis:17-3.5` for aceita, subir o `compose.yaml` uma vez (nunca foi executado).
5. Quando a E11 criar HML: preencher `appsNoFly`, `identidadeDoBanco` e `dominio` de HML em `scripts/ambientes.json`
   (a matriz já tem a coluna de HML, e `conferir-ambiente` reprova se a identidade de HML for igual à de PROD).
