# V2-F02-E06, parte 3A: X-App-Version, versão mínima por aplicativo e resposta 426 (API)

## Fatos

**Base:** `origin/v2/f02` em `41af9f79` (lote 2 inteiro juntado). Ramo `trab/f02-3a-e06-e08-api`. Esta parte é só a API e o
pacote compartilhado; o envio do cabeçalho pelo aplicativo de campo e pelo painel e a fila do campo diante do 426 são a parte
3B. Sem migração (a F03 conta com a 053 em diante).

**Shared** (`packages/shared/src/versao.ts`, antes vazio):

- `lerVersao` lê `maior.menor.correção` (até nove dígitos por parte), ignora pré-lançamento e build (`1.4.0-beta.2` vale
  `1.4.0`) e devolve `null` para o que não tem a forma.
- `compararVersoes(a, b)` devolve `-1 | 0 | 1`, ou `null` se alguma das duas não se lê (quem decide recusar trata o `null` e
  nunca recusa por ele).
- `lerCabecalhoDeVersao` lê `campo/1.4.0`, `cidadao/2.0.1` e `painel/<build>`; ausente, vazio, com forma errada, repetido ou de
  aplicativo desconhecido volta `null`. `estaAbaixoDoMinimo` só devolve `true` para versão numérica declarada claramente abaixo
  de um mínimo que se lê.
- `versao_do_aplicativo_antiga` saiu de `CODIGOS_RESERVADOS` e entrou em `CODIGOS_DE_ERRO` (426, `permanente`, o status e a
  categoria que já estavam reservados). `versao_do_aplicativo_ausente` FICA reservado: a API não recusa cabeçalho ausente
  (a obrigatoriedade no modo público do cidadão é da F11).

**API:**

- `config.ts`: `VERSAO_MINIMA_CAMPO` e `VERSAO_MINIMA_CIDADAO`, vazias por padrão (sem mínimo; vazio no ambiente vale ausente).
  Valor fora de `maior.menor.correção` derruba a partida: um mínimo digitado errado que desligasse a recusa em silêncio seria
  pior que não ter mínimo.
- `versao-do-aplicativo.ts` (novo): `hookDeVersaoNoV1`, o `onRequest` registrado SÓ no escopo `/v1` (`servidor.ts`). Lê
  `X-App-Version`, compara com o mínimo do aplicativo declarado e responde
  `426 { erro: "versao_do_aplicativo_antiga", mensagem, versaoMinima }` ANTES de autenticar e de validar o corpo. Cabeçalho
  ausente: aceito e contado em log `info` (`evento: "versao_do_aplicativo"`, `situacao: "ausente"`, modelo da rota). Ilegível,
  repetido ou de aplicativo desconhecido: ignorado, contado como `ilegivel`, sem repetir o texto recebido e sem 500. O painel
  (`painel/<build>`) nunca é recusado. Cada aplicativo é comparado só com o seu mínimo.
- `rotas/aplicativos.ts` (novo): `GET /v1/aplicativos/:aplicativo/versao-minima` (`campo` ou `cidadao`), pública, devolve
  `{ aplicativo, versaoMinima }` (`null` sem mínimo). Fica de fora da recusa por versão (é por ela que o aplicativo velho
  descobre o que instalar) e só existe em `/v1`: declarada em `ROTAS_SO_NO_V1` (`versao-v1.ts`), registrada no bloco
  `if (!espelho)` e isenta de token em `SEM_TOKEN` com a razão. Aplicativo sem mínimo (`painel`) ou desconhecido: 404
  `nao_encontrado`.
- CORS: `allowedHeaders` ganhou `x-app-version` (lista nominal, sem curinga). O teste `cors-do-envio-de-evidencia.test.ts`,
  que trava a lista exata, foi atualizado.
- Contrato: grupo novo `contrato/grupos/aplicativos.ts` (`nova: true`, com `resposta`), registrado em `rotas.ts`; o
  `openapi/v1.json` foi regerado por `npm run openapi --workspace @dc360/api`, sem edição à mão. Nenhum outro grupo foi tocado.
- Varreduras do lote 2 ajustadas ao que é novo: a lista de chaves permitidas no corpo de erro ganhou `versaoMinima`
  (`test/varredura-de-envios.ts`; o catálogo do shared já dizia que o corpo é aberto); `ehSemToken` aceita a chave escrita
  com `/v1` para a rota que só existe lá. O gancho `onRequest` de `servidor.ts` é inline e só delega, porque a varredura de
  ganchos reprova `send` dentro do callback (esconderia um 401 ou 403 fora do catálogo); o 426 sai de
  `versao-do-aplicativo.ts`, com `erro` literal do catálogo.

**Isolamento.** O cabeçalho é declarado pelo cliente e nada aqui lê token, usuário ou município. O 426 sai igual para o token
de A, o de B e nenhum token, e para um id real ou falso (o corpo não confirma que o recurso existe). Com versão aceita, o token
de B contra recurso de A segue 404 `nao_encontrada`.

**Compatibilidade com o campo instalado.** Sem o cabeçalho tudo segue (aceito e contado); mínimo vazio desliga a recusa; o
espelho sem prefixo e `/saude` não têm a recusa; status e `erro` existentes não mudam. Rollback: esvaziar
`VERSAO_MINIMA_*`.

## Testes

- `packages/shared/test/versao.test.ts`, 16 casos novos, e 1 em `catalogo-de-erros.test.ts` (a saída da reserva).
- `apps/api/test/versao-do-aplicativo.test.ts`, 41 casos novos: versão igual ou acima passa; pré-lançamento não conta; o painel
  nunca é recusado; mínimo de cada aplicativo; mínimo vazio; rota pública com e sem mínimo e com versão velha; CORS; 426 em
  `POST /v1/sincronizacao/vistoria`, em login com corpo vazio e sem token (antes do 401 e da validação); 12 formas de cabeçalho
  malformado mais o repetido, todas 200, nunca 500; ausente contado em log sem usuário, município, token, endereço nem e-mail;
  mesmo corpo para qualquer município e id; token de B contra recurso de A, 404; rota só em `/v1`; configuração.
- `captura-do-426.txt`: saída de `app.inject` contra o servidor montado, com o 426 e os casos vizinhos. O roteiro que a gera é
  `roteiro-da-captura.mts` (rode de `dc360/apps/api` com `npx tsx`).

## Justificativa

- O 426 vive num `onRequest` do escopo `/v1` e não num `preHandler`: precisa vir antes da autenticação, que é por rota, e antes
  da validação do corpo.
- O painel e qualquer build não numérica passam sempre: o cabeçalho serve à observação, e recusar por um texto que a API não
  consegue comparar seria inventar regra.
- A mensagem do 426 cita a versão mínima; `versaoMinima` também vai estruturada para a tela de atualização (F14-E08).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E06: IMPLEMENTADA na API e no shared (parte 3A); falta a parte 3B (campo e painel
  enviam X-App-Version; a fila do campo guarda o item diante do 426) para fechar a etapa.`
- **Dívidas pagas:** nenhuma da lista.
- **Pendências humanas:** os valores de `VERSAO_MINIMA_CAMPO` e `VERSAO_MINIMA_CIDADAO` (decisão do Rafael, com as versões
  publicadas); validação do Rafael subindo a API com mínimo alto e vendo o 426 num `curl`.
- **Risco:** o roteiro manual "simulador do campo com mínimo acima da versão: a fila não perde item" depende da parte 3B.
