# V2-F02-E08: política de depreciação, contador de uso do espelho e encerramento por chave

## Fatos

**Base:** a E06 parte 3A, no mesmo ramo (`trab/f02-3a-e06-e08-api`), partindo de `origin/v2/f02` em `41af9f79`. Sem migração:
o contador é uma linha de log estruturado, não uma tabela (a F03 conta com a 053 em diante).

**Texto da política:** `dc360/docs/POLITICA-DE-VERSOES-DA-API.md`, trazido do rascunho revisado de
`origin/trab/f02-3d-politica` e atualizado: os marcadores "PENDENTE (E06, lote seguinte)" e "PENDENTE (E08, lote seguinte)"
viraram a descrição do que ficou implementado, com as regras exatas. As PROPOSTAS e as PENDÊNCIAS do Rafael (aviso mínimo de 90
dias, rotina de revisão mensal, data de início do `Deprecation`, mínimos de cada aplicativo, data do fim do espelho, H86) ficaram
como estavam: este texto não decide nenhuma delas.

**Contador de uso** (`versao-do-aplicativo.ts`, `hookDoEspelho`, `onRequest` do escopo do espelho em `servidor.ts`): cada pedido
ao espelho gera uma linha `info` com `evento: "uso_do_espelho"`, `metodo`, `rota` (o MODELO da rota, como `/ocorrencias/:id`,
nunca o identificador real), `aplicativo` e `versao`. Sem cabeçalho: `aplicativo: "ausente"`. Cabeçalho ilegível ou de aplicativo
desconhecido: `aplicativo: "ilegivel"`, sem repetir o valor. A linha usa o logger da aplicação e não o da requisição: não leva
usuário, município, token, endereço IP, corpo, consulta nem o `reqId`. Conta também o pedido sem token (401) e o recusado pela
validação. Não conta `/v1` nem a infraestrutura sem prefixo (`/saude`, `/armazenamento/objeto`, `/publico/oficio/:token`).

**Encerramento** (`ESPELHO_LEGADO_ENCERRADO`, `sim` ou `nao`, padrão `nao`): com `sim` E depois das 23:59:59 UTC do dia de
`ESPELHO_LEGADO_ATE` (o mesmo instante do `Sunset`), o espelho responde
`426 { erro: "versao_do_aplicativo_antiga", mensagem }` com `Link: </v1/...>; rel="successor-version"` (mais `Deprecation` e
`Sunset`, que o `onSend` do espelho já acrescenta a toda resposta). Vem antes da autenticação e da validação do corpo, vale para
toda rota do espelho (escrita inclusive) e é igual para todo município. Data futura ou chave `nao`: atende normal, com os
cabeçalhos. `/v1` e a infraestrutura sem prefixo ficam de fora.

**Partida** (`carregarConfig`): data inválida (formato errado ou dia que não existe) ou VAZIA já derrubava a partida em qualquer
ambiente, produção inclusive (o esquema de `ESPELHO_LEGADO_ATE` é uma data validada; provado em produção por teste). O que a
etapa acrescentou: `ESPELHO_LEGADO_ENCERRADO=sim` sem `ESPELHO_LEGADO_ATE` escrita no ambiente também derruba a partida, porque
o padrão `2027-12-31` é provisório e a política diz que ele não vale como decisão de encerrar. Não tornei `ESPELHO_LEGADO_ATE`
obrigatória em produção em geral: o `fly.toml` de produção não a declara, e exigi-la quebraria o deploy atual sem ganho (a
chave de encerramento nasce desligada).

**Variáveis** (`config.ts`, `.env.example`, `docs/COLOCAR-DE-PE.md`, `scripts/ambientes.json`, README):
`ESPELHO_LEGADO_ENCERRADO` (E08), `VERSAO_MINIMA_CAMPO` e `VERSAO_MINIMA_CIDADAO` (E06), todas opcionais.

## Testes

`apps/api/test/versao-v1.test.ts` ganhou 19 casos:

- Encerramento (10): 426 com a data no passado e a chave ligada, com `Link`, `Deprecation` e `Sunset`; antes da autenticação e da
  validação (sem token, token adulterado, login com corpo vazio); o mesmo corpo para o token de A, o de B e nenhum, e para id real
  ou falso; toda rota, de escrita inclusive, e o `Link` sem a query string; `/v1` segue atendendo; token de B contra recurso de A em
  `/v1` segue 404; a infraestrutura sem prefixo fica fora; data futura com a chave ligada atende com os cabeçalhos; chave em `nao`
  com data passada atende; o dia de `ESPELHO_LEGADO_ATE` vale inteiro (23:59:59 UTC não encerra, 00:00:00 do dia seguinte sim).
- Configuração (4): nasce em `nao`, só aceita `sim` ou `nao`, `sim` sem data escrita impede a partida, e em produção data inválida
  ou vazia impedem a partida e encerrar sem data escrita também.
- Contador (5): uma linha por uso com método, modelo da rota e versão; nenhum dado pessoal nem identificador (token, id da
  ocorrência, dois endereços IP, e-mail, senha, consulta e organização ausentes, e nenhuma chave de usuário, IP ou corpo na linha);
  ausente e ilegível sem repetir o valor; conta o 401 e o 422; não conta `/v1` nem a infraestrutura.
- `captura-do-426-do-espelho.txt`: saída de `app.inject` com o espelho encerrado (data de 2020, chave `sim`).

## Portões da árvore completa (E06 e E08)

Saídas arquivadas ao lado: `conferencias.txt`, `npm-test.txt`, `testes-da-etapa.txt`, `isolamento.txt`,
`regras-de-conteudo.txt`, `auditar.txt`, `test-scripts.txt`.

- `npm run typecheck` verde nos seis pacotes; `npm run lint` verde (monorepo e campo); `npm run lint:teto` em 431 (não sobe);
  `npm run formato:conferir` verde; `npm run conferir:numeros` verde; `node --test scripts/baseline.test.mjs` 29 de 29.
- Contagens: só a chave da etapa em `baseline.mjs` (api `V2-F02-E06-parte-3A` 41 e `V2-F02-E08` 19; shared `V2-F02-E06-parte-3A`
  17). Totais para esta árvore: shared 434, api 2101 (2135 com puladas e dinâmicas, igual ao `esperadoDoTesteApi()`), 4443 em seis
  pacotes e 6453 com o aplicativo (README e `COLOCAR-DE-PE.md`). O integrador recalcula na junção.
- `npm test`: campo 261 de 261; shared 433 de 434; api 2099 de 2135 (34 puladas); console 379 de 379; web 820 de 820; db 440 de
  454 (6 puladas). As 11 falhas são as aceitas pelo briefing: `regras-de-conteudo` 1 caso (EPERM em symlink, DV-46),
  `semear-homologacao` 2, `desfazer-migracao` 5 e `guarda-da-semente` 3.
- `npm run test:isolamento` (CA-06): `isolamento.test.ts` com 137 casos verdes.
- `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`: 9 de 10, o vermelho é o EPERM acima. O caso "nenhum travessão
  em texto nenhum" passa (os meus testes comparam com `String.fromCharCode(0x2014)`, sem o caractere no fonte).
- `node scripts/auditar.mjs`: runtime limpo; só as advisories aceitas do campo e de ferramentas de desenvolvimento, com dono e prazo.
- Não rodei `test:e2e:api` (o CI cobre).

## Justificativa

- O contador é log estruturado e não banco: o briefing proíbe migração e a política já o define assim ("log estruturado, nível
  info, sem usuário"). A agregação por rota e versão é da operação (reter o log e contá-lo no período); sem ela a medição
  existe e ninguém a lê, o que ficou em `apps/api/PENDENCIAS.md`.
- O gancho do espelho é do escopo do espelho e o limitador de taxa é do escopo raiz, que roda antes: um pedido barrado com 429 não
  chega ao gancho e não conta como uso. É intencional (ele não chegou à rota), mas o contador subestima o uso de quem é limitado.
- O 426 do espelho não leva `versaoMinima`: o espelho não fala de aplicativo, só de endereço. O aplicativo descobre o mínimo
  pela rota pública de `/v1`.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E08: IMPLEMENTADA (política escrita e atualizada, contador de uso do espelho, encerramento
  por ESPELHO_LEGADO_ENCERRADO; chave nasce nao). Data do fim do espelho segue PENDENTE do Rafael (H86): F28-E11 não executa sem ela.`
- **Dívidas pagas:** nenhuma da lista.
- **Pendências humanas:** o Rafael aprova o calendário do espelho (a data é provisória, `2027-12-31`), o aviso mínimo e a rotina de
  revisão propostos na política; e alguém da operação define onde o log `uso_do_espelho` é retido e agregado.
- **Risco (teste):** `versao-v1.test.ts` já tinha o caso "encerrar as próprias sessões também passa com a senha provisória" a cerca de
  5 s do teto padrão do vitest nesta máquina (4937 ms medidos com a máquina carregada); sob carga ele estoura e leva o caso seguinte
  junto (login falha). Passa com `--testTimeout=60000` e passou na rodada completa. É preexistente (esse caso não é meu); vale
  subir o tempo limite desse caso numa etapa que toque o arquivo.
- **Risco:** a recusa 426 do espelho está provada em teste e em `inject`, mas não foi exercida num ambiente real nem com um
  aplicativo instalado.
