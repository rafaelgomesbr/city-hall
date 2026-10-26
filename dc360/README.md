# Defesa Civil Operacional 360, produto real

Esta pasta (`dc360/`) é o produto de verdade, autorizado em 21/08/2026. Ela não tem nada a
ver com o protótipo em `mockup/`, que continua sendo HTML puro e descartável. As proibições da Fase 0 (nada de framework, nada de npm, nada de
build) valem lá, não aqui.

## O que já está de pé

| Pacote | O que é | Situação |
| --- | --- | --- |
| `packages/shared` | Vocabulário do domínio, máquina de estados e esquemas Zod, compartilhados entre web, aplicativo de campo e API | Pronto, 435 testes do pacote compartilhado passando |
| `db` | Migrações PostgreSQL com RLS forçada, aplicador de migrações e o teste de isolamento CA-06 | Pronto, 718 testes do banco passando |
| `apps/web` | Painel do coordenador em React, Vite e TypeScript, em dois modos: banco na própria aba, ou HTTP contra a API em `/v1`. `VITE_API_URL` continua sendo só a origem, com ou sem barra final; publicar a API antes do painel | Pronto, 824 testes de fonte do painel mais 70 verificações no navegador no modo local e 258 contra a API (contadas no código, uma por `ok(` no início de linha; a execução imprime mais, porque verificação dentro de laço conta a cada volta). |
| `apps/api` | API HTTP: autenticação com recuperação de senha, isolamento por token, sincronização idempotente, evidência fotográfica e documentos oficiais | Pronta, 2312 testes da API (os 13 de TLS do banco exigem `openssl` no PATH, e sem ele a suíte reprova em vez de pular) |
| `packages/campo` | Motor de sincronização offline: fila persistente, espera entre tentativas, idempotência, persistência em SQLite | Pronto, 283 testes de unidade do motor de campo e 17 de integração contra a API |
| `apps/campo` | Aplicativo do agente em React Native com Expo: coleta offline, câmera, GPS, assinatura, fila de envio, configuração das duas lojas | Relatado como instalado em iPhone (compilação nativa, 08/09/2026, com três vistorias coletadas), mas **sem artefato de aparelho físico arquivado**: nenhuma foto, vídeo ou registro de iPhone ou de Android de verdade está no repositório, e a prova fica para a V2-F14-E12. Há capturas e relato de emulador Android das validações de E06, E15 e E16 (ver `apps/campo/LEIA-ME.md`), que não substituem o aparelho. TypeScript limpo com o cache `.expo/types` em dia e 2023 testes do aplicativo passando. O `expo-doctor` deu 21 de 21 em 2026-10-13 (depois de subir seis pacotes do Expo um patch atrás), **20 de 21 na manhã de 2026-10-14** (o Expo publicou cinco patches novos: `expo`, `expo-constants`, `expo-linking`, `expo-notifications` e `expo-router`) e **21 de 21 de novo no mesmo dia**, depois da correção 4 da E19, que subiu esses cinco. A deriva voltou em 2026-10-18 (20 de 21, com `expo` e `expo-router` um patch atrás) e fechou em 21 de 21 no mesmo dia, com a correção 5 da E19. Premissa: o Rafael decidiu atualizar os seis pacotes de 2026-10-13 (D1), não estes cinco; o coordenador aplicou o mesmo tratamento por analogia e a confirmação dele está pendente. O resultado depende do dia e do registro do Expo (pendência 17 de `apps/campo/PENDENCIAS.md`). O `npm run auditar` fecha conforme a política do CP-03: a árvore do aplicativo ainda tem avisos de ferramenta do Expo, aceitos um a um com motivo, dono e prazo (2027-01-05) em `scripts/auditar-excecoes.mjs`. Ver `apps/campo/LEIA-ME.md` e `apps/campo/LOJAS.md` |
| `apps/console` | Console do fornecedor: processo separado, com segundo fator obrigatório, que lê saúde de uso agregada de todos os municípios, cadastra prefeitura, suspende o acesso e agenda a eliminação de município, e não lê dado de cidadão | Pronto, 379 testes do console do fornecedor passando. Ver "O console do fornecedor", mais abaixo |

## Os dois modos do painel

O mesmo painel roda de duas formas, e a escolha é de configuração, não de
código de tela. Nenhuma página sabe qual está ativa: as duas implementações
cumprem a mesma porta em `src/dados/`.

| | Modo local (sem `VITE_API_URL`) | Modo API (com `VITE_API_URL`) |
| --- | --- | --- |
| Banco | Postgres em WebAssembly, na própria aba | Postgres do servidor, via HTTP |
| Entrada | Escolha de perfil, sem senha | Email e senha, com bloqueio por tentativa |
| Para que serve | Demonstrar num notebook de prefeitura sem instalar nada | O caminho de produção |
| Isolamento | RLS, dentro da aba | RLS, no servidor, fora do alcance do navegador |

O modo local não é maquete: são as mesmas migrações, o mesmo RLS e a mesma
semente que a API usa. O que ele não tem é autenticação, e a tela diz isso em
voz alta em vez de fingir que tem.

## A decisão que explica o resto: o banco é real desde o primeiro dia

O painel web não fala com nenhum dado falso em memória. Ele executa
as migrações de `db/migrations/` (todas, na ordem), os mesmos arquivos que vão para o servidor, dentro de
um PostgreSQL 16 compilado para WebAssembly (PGlite) que roda na própria aba e
persiste em IndexedDB.

Isso não é um truque de demonstração, é uma escolha de risco. O problema mais
caro deste produto é dado de uma prefeitura aparecer na tela de outra. Se o
isolamento fosse simulado agora e implementado depois, a primeira vez que ele
seria testado de verdade seria em produção. Do jeito que está, toda consulta da
aplicação já passa pelo mesmo contrato que a API vai cumprir:

```
BEGIN;
SET LOCAL ROLE dc360_app;                                  -- não é superusuário, não é dono
SELECT set_config('app.organizacao_atual', $1, true);      -- vem do token, nunca da requisição
...
COMMIT;
```

Se alguém esquecer o `WHERE organizacao_id = ...` numa consulta, o banco
continua devolvendo só o município certo, porque a policy nega. Trocar PGlite
por um Postgres gerenciado é trocar a origem da conexão em `src/dados/banco.ts`,
não as regras: elas já estão no banco.

### Por que tudo passa por `db.transaction()`

`SET LOCAL` pertence à CONEXÃO, não à chamada. Numa versão anterior deste
código, `comoApp` emitia `BEGIN`, `SET LOCAL` e `COMMIT` como comandos soltos.
Como o PGlite tem uma conexão só e solta o mutex entre comandos, duas chamadas
concorrentes (o `Promise.all` do painel, por exemplo) entrelaçavam:

```
A: BEGIN
B: BEGIN                   (aninhado, o Postgres só avisa)
A: set_config(org = A)
B: set_config(org = B)     <- sobrescreve o contexto de A
A: SELECT ...              <- roda com o contexto de B
B: COMMIT                  <- encerra a transação que A achava ser dela
A: SELECT ...              <- fora de transação, de volta ao superusuário
```

Os dois desfechos foram reproduzidos: dado de um município aparecendo para
outro, e o papel voltando de `dc360_app` para `postgres`, que ignora RLS.
`db.transaction()` retém o mutex do início ao fim do bloco, o que torna o par
`SET LOCAL` mais consulta indivisível. Os testes do bloco "Isolamento sob concorrência na mesma conexão", em
`db/test/isolamento.test.ts`, cobrem exatamente esse caso, e reprovam se alguém
trocar de volta.

Num servidor com pool, cada requisição tem a sua conexão e o problema não
existe. A regra que fica: **uma conexão nunca é compartilhada entre dois
contextos de tenant ao mesmo tempo.**

## Garantias que o banco impõe, não a tela

- Toda tabela de negócio tem `ENABLE` e `FORCE ROW LEVEL SECURITY`, com policy
  em `organizacao_id = app_organizacao_atual()`.
- `trilha_eventos` tem policy de SELECT e de INSERT, e nenhuma de UPDATE ou
  DELETE. Com RLS forçada, a ausência nega: a trilha é append-only para a aplicação
  e para quem administra. As duas exceções são funções do banco, definidas nas
  migrações: a minimização por prazo (043) troca o nome do assinante dentro do
  evento `vistoria` por "removido por prazo", e a eliminação do município (038)
  apaga o município inteiro, trilha inclusa, depois de sete dias de arrependimento.
- Encerrar ocorrência sem motivo é recusado por CHECK constraint.
- Marcar vulnerabilidade sem descrever é recusado por CHECK constraint.
- Protocolo é único por município e ano, gerado por
  `proximo_protocolo(ano)` dentro da transação, com a linha da sequência
  travada. Dois operadores registrando ao mesmo tempo não recebem o mesmo
  número, e dois municípios podem ter `000001/2026` sem colidir.
- Chave de arquivo no storage precisa começar com `tenant/{organizacao_id}/`,
  por CHECK constraint. É a segunda barreira de isolamento junto do RLS.
- Reenvio da mesma coleta de campo é recusado pela unicidade de
  `(organizacao_id, idempotency_key)`.

## A API (`apps/api`)

Fastify com TypeScript. Ela existe para que o aplicativo de campo tenha com
quem falar, e para que a regra de isolamento passe a valer também do lado do
servidor, não só dentro da aba do navegador.

### A versão no caminho: `/v1` e o espelho sem prefixo (V2-F02-E01)

Toda rota de negócio existe sob `/v1` (o contrato novo) e, enquanto houver
aplicativo instalado que não sabe da versão, também sem prefixo: o espelho
legado. As duas cópias nascem da MESMA função, `registrarRotasDeNegocio`
(`apps/api/src/servidor.ts`), então rota nova existe nos dois lados ou em
lado nenhum; `apps/api/test/versao-v1.test.ts` confere a paridade pelas rotas
que o Fastify de fato registrou. Toda resposta do espelho carrega `Deprecation`,
`Sunset` (a data de `ESPELHO_LEGADO_ATE`, hoje provisória e só um aviso: nada
deixa de responder nela) e `Link` com `rel="successor-version"` para o mesmo
caminho sob `/v1`. A política de depreciação (V2-F02-E08) é
`docs/POLITICA-DE-VERSOES-DA-API.md` e a retirada do espelho é da V2-F28-E11.

Dois controles de versão do aplicativo vivem na API, ambos DESLIGADOS por padrão
e com rollback por configuração, sem novo deploy de código:

- **Versão mínima por aplicativo (V2-F02-E06).** O aplicativo informa
  `X-App-Version: campo/1.4.0`. Com `VERSAO_MINIMA_CAMPO` ou
  `VERSAO_MINIMA_CIDADAO` preenchida (`maior.menor.correção`, vazia é sem
  mínimo), `/v1` responde `426 { erro: "versao_do_aplicativo_antiga", mensagem,
  versaoMinima }` ao aplicativo abaixo do mínimo, ANTES de autenticar, e o
  contrato (`apps/api/openapi/v1.json`) declara o cabeçalho opcional
  `x-app-version` e esse 426 em toda operação de `/v1`, menos a da versão
  mínima, que nunca é recusada. Cabeçalho
  ausente é aceito e contado em log `info`; malformado é ignorado, nunca 500.
  `GET /v1/aplicativos/:aplicativo/versao-minima` informa o mínimo sem token e sem
  dado de município (só existe em `/v1`, `ROTAS_SO_NO_V1`).
- **Medição e encerramento do espelho (V2-F02-E08).** Cada pedido ao espelho vira
  uma linha de log `info` (`evento: "uso_do_espelho"`, método, modelo da rota e
  versão, sem usuário, município, IP, token, corpo nem consulta). Com
  `ESPELHO_LEGADO_ENCERRADO=sim` (padrão `nao`, só a V2-F28-E11 liga) e depois do
  fim do dia de `ESPELHO_LEGADO_ATE`, o espelho responde `426` com `Link` para
  `/v1`; antes disso, ou com a chave em `nao`, atende com os cabeçalhos.

Ficam sem prefixo, e a razão de cada uma está em `ROTAS_FORA_DO_PREFIXO`
(`apps/api/src/versao-v1.ts`): `GET /saude` (sonda de infraestrutura),
`GET` e `PUT /armazenamento/objeto` (URL assinada, e a assinatura cobre o
caminho) e `GET /publico/oficio/:token` (endereço que vive em e-mail já
enviado). `POST /publico/interesse` vai a `/v1`. Senha provisória, redação do
segredo no log, marca da fila do campo e limitador valem nos dois prefixos; o
balde do limitador é um só por rota, para o limite do login não dobrar pela
escolha do prefixo.

### O contrato OpenAPI do `/v1` (V2-F02-E04)

O contrato da API tem um registro único de rotas (`apps/api/src/contrato/rotas.ts`,
com as entradas em `contrato/grupos/*.ts`, um arquivo por grupo) e dele sai o
documento OpenAPI 3.1 `apps/api/openapi/v1.json`, gerado dos esquemas Zod
(`z.toJSONSchema`, sem dependência nova). Esse arquivo é DERIVADO: nunca se edita
à mão, regera-se com `npm run openapi --workspace @dc360/api`, e
`apps/api/test/openapi.test.ts` reprova a diferença entre ele e o gerado. O mesmo
teste confere, pelas rotas que o Fastify de fato registrou, que toda rota sob
`/v1` tem entrada e toda entrada tem rota. Toda rota sob `/v1` tem entrada e resposta descrita (96
operações, nenhuma com `x-resposta-pendente`); a lista `pendentes` dos grupos
está vazia e o teto é 0. Rota nova entra com `resposta`. O JSON Schema não expressa `refine` e `superRefine`
(por exemplo, `tipo: "outro"` exige `tipoDescricao`), então o documento anota
cada regra dessas em `x-regras-adicionais`, na operação e no esquema do corpo, e
o teste reprova esquema refinado sem a anotação; corpo opcional sai com
`required: false`. O documento não é rota e não é servido; descreve o
`/v1` e não o espelho legado.

**O aplicativo de campo em `/v1` (V2-F02-E02 e E03, parte 2B).** O
`extra.apiUrl` (e os perfis do `eas.json`) continua sendo só a origem; o
`apps/campo/src/dados/api.ts` acrescenta `/v1` no código, e é essa base que
as chamadas e a fila (`transporteHttp`) recebem. As telas de entrada e de
perfil mostram a origem. URL assinada devolvida pela API é usada como veio.
A fila passou a ler a categoria do catálogo (`packages/shared/src/erros.ts`),
mas só dentro do status, e o comportamento ficou o de antes: nenhum item é
descartado, o 401 renova uma vez só, e o 409 `autor_divergente` continua
bloqueando só o item. Ordem de implantação: a API com `/v1` primeiro, o
aplicativo depois; o aplicativo já instalado segue no espelho.

**A versão do cliente em todo pedido (V2-F02-E06, parte 3B).** O aplicativo de
campo manda `X-App-Version: campo/<versão>` (a do `expoConfig.version`) em
todo pedido à API, inclusive os da fila: o transporte de `packages/campo`
recebe a versão por parâmetro e segue sem depender do Expo. O PUT na URL
assinada não leva o cabeçalho. O painel manda `painel/desconhecido` só para
observabilidade: nenhuma variável do Vite carrega hoje o número do build. Na
fila, o 426 `versao_do_aplicativo_antiga` entra na classe de falha da conta
desativada: a fila pausa, todo item fica guardado como `pendente`, nada vira
bloqueado e, enquanto a última resposta da fila foi 426, o token é pedido SEM
renovação antecipada (o 426 vem antes da autenticação; só o 401 renova, uma vez,
e a primeira resposta que não seja 426 devolve a renovação ao normal; as
chamadas do aplicativo fora da fila não têm essa suspensão e seguem o piso de um
minuto entre tentativas); a pausa fala pelas frases que já existiam
(faixa, aviso e cartão), sem tela nova (a tela "atualize o aplicativo" é da
V2-F14-E08). No painel, o 426 chega como qualquer erro, com a frase do corpo.
O cabeçalho é só aditivo e exige `x-app-version` nos cabeçalhos permitidos do
CORS da API antes de o painel publicado mandá-lo.

### De onde vem o município, e de onde nunca vem

O identificador da organização sai do JWT verificado, e vai direto para o
`SET LOCAL`. Nunca de cabeçalho, nunca de parâmetro de rota, nunca do corpo.
Existe um teste que fixa isso: ele cadastra um usuário mandando
`organizacaoId` do OUTRO município no corpo da requisição, e confere no banco
que o registro nasceu no município do token. O campo é simplesmente ignorado,
porque a rota nem o lê.

Consultar ocorrência de outro município devolve **404, não 403**. Um 403
confirmaria que o registro existe, e confirmar existência já é vazamento.

### Autenticação

| Peça | Escolha | Por quê |
| --- | --- | --- |
| Senha | scrypt do `node:crypto`, N=2^17, r=8, p=1 (cerca de 128 MB por verificação; o hash guarda o N usado, então senha derivada antes com N=2^16 continua valendo) | Aprovado no ASVS 4.0 (2.4.1), sem dependência nova e sem módulo nativo para compilar |
| Token de acesso | JWT HS256, 15 minutos por padrão (`ACESSO_MINUTOS`, teto de 60) | Na LEITURA PURA (GET e HEAD de rota que só lê), verificado só pela assinatura: conta, papel e sessão NÃO são consultados, então conta desativada ainda lê até o token vencer (a F03-E03 fecha a leitura). Na ESCRITA, que é todo método que não é GET nem HEAD MAIS as rotas GET marcadas com `ROTA_GET_COM_EFEITO` e o HEAD delas (laudo, termo de interdição, termo de desinterdição e PDFs, `GET /relatorios/ocorrencias.csv` e `GET /avisos`, porque praticam um ato ou mudam dado do município; o dossiê e a busca, que só gravam o registro da própria leitura, seguem como leitura até a F03-E03; a lista é fixada por `apps/api/test/get-com-efeito.test.ts`), uma consulta ao banco confere, junto com a suspensão do município, se a conta está ativa, se o papel é o do token, se a sessão do token não foi encerrada e se a senha provisória não venceu: falhando, responde no pedido seguinte 401 `sessao_encerrada` (sessão encerrada ou senha provisória vencida), 401 `nao_autenticado` (papel diferente do token: o cliente renova e repete, e a renovação já traz o papel novo) ou 403 `conta_desativada` (conta desativada), ver os códigos abaixo (`auth/vigencia.ts`, religada em V2-F00-E04, códigos separados em V2-F00-E05, papel e cadeia da sessão em V2-F00-E07) |
| Token de renovação | 32 bytes opacos, guardado só como hash | Revogável, e vazamento do banco não devolve sessão utilizável |
| Rotação | A cada renovação | Reúso de token gasto é sintoma de roubo: derruba todas as sessões do usuário |
| Cadeia da sessão | `sessoes.familia_id`: cada login abre uma família e cada renovação a herda (migração 047) | O token de acesso emitido ANTES de uma renovação segue valendo por seus 15 minutos (a fila do aparelho pode estar no meio de um envio), mas só enquanto a família tem sessão de pé: encerrar a cadeia (quem administra, a própria pessoa, sair, reuso de token, troca de senha) derruba também o token anterior à renovação. A renovação é UMA transação sob uma trava consultiva por pessoa (`travar_sessoes_do_usuario`, migração 049), que todo encerramento em massa também toma, inclusive a suspensão do município pelo console: sem isso, o encerramento no mesmo instante da renovação deixava uma sessão de pé. O login, que não tem família, lê a suspensão do município com `FOR SHARE` (migração 050), pelo mesmo motivo, e depois toma a mesma trava da pessoa e relê a senha e a conta antes de a sessão existir: se a senha foi trocada ou redefinida, ou a conta desativada, enquanto o scrypt rodava, a sessão volta atrás e a resposta é a recusa genérica (V2-F00-E07, correção 3; a ordem é linha do município, depois trava, para não fechar ciclo com a suspensão) |
| Força bruta | Limite por endereço (10 por 5 min) e bloqueio por conta (5 falhas, 15 min) | Um trata o atacante que vem de um lugar, o outro trata a conta martelada de muitos |
| Enumeração de conta | Resposta idêntica e tempo equivalente para email inexistente | Senão a API vira lista de emails da prefeitura |
| Recuperação de senha | Link de uso único, 30 minutos, guardado só como hash, entregue por um notificador injetável. `POST /auth/recuperar` responde 202 igual para email que existe, que não existe e que passou do teto de `RECUPERACAO_POR_EMAIL_HORA` por hora; o envio sai depois da resposta e a falha do provedor vai para o log sem o link. `GET /auth/recuperacao` diz só se está ligada (V2-F00-E10). O link pendente morre com toda mudança de senha e com a desativação, por gatilho no banco, e a conta desativada não troca a senha pelo link (migração 051, V2-F00-E10, correção 3). Produção desligada até o CP-19 (`fly.toml`) | Esquecer a senha não pode virar chamado para o suporte, nem "manda a senha no WhatsApp". Esperar o provedor dentro do pedido, ou deixá-lo falhar só para quem tem conta, entregaria quais emails existem pelo relógio e pelo status |
| Troca de senha | Exige a senha atual, e derruba as outras sessões, preservando a cadeia de onde a pessoa trocou (também com o token de antes de uma renovação). A gravação só vale se nada mudou desde a conferência: na transação que grava, a troca segura a linha da pessoa, toma a trava dela e relê a conta, a sessão, o prazo da provisória e o hash; mudou, recusa (403 `conta_desativada`, 401 `sessao_encerrada` ou a mesma recusa da senha atual errada) (V2-F00-E07, correção 4) | Aparelho esquecido desbloqueado na mesa vira conta sequestrada em dois cliques. E quem tinha a senha antiga e uma sessão, com a troca em voo, desfazia a redefinição por quem administra, o link do email, a desativação ou a troca pela própria pessoa que confirmasse no meio, e ficava com uma senha dele, definitiva |
| Sessões e redefinição pelo painel (V2-F00-E09) | Em Usuários, quem administra redefine a senha (`POST /usuarios/:id/redefinir-senha`, senha temporária mostrada UMA vez, 72 horas) e encerra as sessões (`POST /usuarios/:id/encerrar-sessoes`) de quem está abaixo do posto dele, nunca da própria conta. Em Minha conta, a pessoa vê as sessões vivas (`GET /auth/sessoes`: quando entrou, até quando vale, o aparelho em uma frase e a marca "Esta sessão") e encerra as outras. `GET /usuarios/:id/sessoes` (ação `gerenciar_usuarios`, posto e 404 como nas outras duas) devolve só a quantidade e as datas | Com a recuperação por e-mail desligada, "esqueci a senha" e "perdi o celular" não tinham saída pelo painel. Nenhuma das leituras entrega IP nem o texto do user-agent (IDN-29 do REL:06); o modo de demonstração explica em vez de oferecer, porque lá não há senha nem token |
| Segunda etapa | Código de seis dígitos do aplicativo de autenticação (TOTP), com segredo guardado cifrado, chave fora do banco | O administrador é o teto do município (ADR 0006): a conta dele estava protegida por senha e mais nada. SMS foi recusado (troca de chip, custo por mensagem, e depende da operadora justamente no dia do temporal) |

#### Catálogo completo de erros e categoria (V2-F02-E03)

`packages/shared/src/erros.ts` generaliza o catálogo de acesso abaixo para TODO
código que a API devolve (95 hoje), com o status e uma categoria que diz o que
fazer: `renovar` (o cliente pede credencial nova e repete uma vez), `reentrar`
(a pessoa entra de novo), `corrigir` (muda o que enviou), `aguardar` (repetir
mais tarde pode dar certo) e `permanente` (repetir nunca dá certo). Nenhum
código mudou de nome (os 404 continuam mistos: `nao_encontrado` e
`nao_encontrada`), e o status e o campo `erro` das respostas não mudam. O corpo
tem a forma `erroDaApiSchema` (`{ erro, mensagem, campos?, requisicao?,
categoria? }`), aberta a campos novos. `CODIGOS_RESERVADOS` guarda os códigos
que etapas seguintes emitirão (`versao_do_aplicativo_ausente`;
`chave_ja_usada_em_outro_registro` passou à lista emitida na V2-F02-E07 e
`versao_do_aplicativo_antiga`, na V2-F02-E06), fora da lista
emitida de propósito. `RegraDeNegocio` recebe o código TIPADO pelo catálogo (texto
fora dele não compila), e em `NODE_ENV=test` o tratador de erros da API lança
para código fora do catálogo em qualquer status (a guarda de acesso, abaixo,
só vê 401 e 403); fora de teste essa conferência não existe, qualquer que seja a
opção, e a resposta sai normal, sem vazar caminho interno. Os erros que o próprio Fastify escreve antes de qualquer rota
(endereço malformado, parâmetro de rota acima de 100 caracteres) saem na mesma
forma, em português e sem repetir o caminho pedido (`url_invalida` 400,
`parametro_longo_demais` 414; `frameworkErrors`, DV-36).
`apps/api/test/catalogo-de-erros.test.ts` confere o catálogo contra tudo o que
`apps/api/src` emite, pela árvore sintática, nos dois sentidos (código emitido
fora do catálogo reprova; código do catálogo que ninguém emite reprova, a não
ser que seja reservado), reprova todo envio `.code(N).send(...)` com N a partir de 400 cujo `erro` não seja literal do catálogo ou cujo corpo não seja `{ erro, mensagem, ... }` (exceções nomeadas no teste), prova a recusa em compilação chamando o compilador, e
prova que `PATCH /orgaos/<id de outro município>` é 404 e nunca 403.
`packages/shared/test/catalogo-de-erros.test.ts` prende a forma do catálogo, e
`varredura-de-esquemas.test.ts` prende as armadilhas do Zod 4 (`.default()`
dentro de `.optional()`, `z.record` com chaves de enum, `Date` em objeto só de
opcionais).

#### Criação idempotente do chamado e chave de foto (V2-F02-E07)

`POST /ocorrencias` aceita `chaveDeCriacao` (uuid, opcional). Repetir o pedido
com a mesma chave devolve 200 com o mesmo `id` e `protocolo`, sem gerar
protocolo (o primeiro pedido devolve 201); sem chave, cada pedido continua
sendo um chamado. A chave vale só dentro do município do token (índice único
parcial `ocorrencias_chave_de_criacao`, migração 052): a mesma chave em dois
municípios cria um chamado em cada. Na corrida, o segundo pedido cai no índice
(23505), a transação inteira volta (a sequência do protocolo não é consumida) e
a rota relê e devolve. O formulário do painel gera o uuid ao abrir e o manda em
todo reenvio. Em `/evidencias/autorizar-envio`, a chave de foto que já é de
OUTRA ocorrência responde 409 `chave_ja_usada_em_outro_registro` em vez de
devolver a evidência da primeira; o campo instalado gera um uuid por foto, então
não recebe esse 409 em uso normal. O padrão e o que ficou aberto estão em
`apps/api/PENDENCIAS.md`.

#### Códigos de erro de acesso

**Modelo de ameaça da guarda** (V2-F02-E03, DV-02; D-31, item 2 de
`docs/roadmap-v2/28-execucao-e-validacao.md`): a guarda é defesa em
profundidade contra ERRO DE PROGRAMAÇÃO numa rota e contra o que um cliente
externo consegue provocar. Cobre o que uma rota escreve por engano com valores
comuns (texto, número, `Buffer`, fluxo, `Response`); desde a DV-01 cada valor de
cabeçalho é lido uma vez, e a guarda confere o texto que o Node vai escrever.
NÃO cobre código hostil dentro da própria rota ou do repositório (monkey-patch
do `ServerResponse`, `Proxy`, escrita no socket): isso é código malicioso no
repositório, e quem o pega é a revisão de código e o CI. Nenhuma frase deste
README quer dizer "nenhum 401 ou 403 sai fora do catálogo" sem esta ressalva.

O cliente decide o que fazer pelo código, e não pela frase: o texto muda, o
código não. A lista mora em `packages/shared/src/codigos-de-erro.ts`, que o
servidor, o painel e o aplicativo importam. O catálogo cobre os erros de ACESSO
(autenticação, vigência e permissão): toda resposta 401 ou 403 do servidor tem
código nele, salvo pelos caminhos que a guarda não vê (escrita direta no socket
e afins, listados em "O que a guarda NÃO vê", abaixo). Quem GARANTE isto é uma
guarda em tempo de execução; dois testes apontam o defeito antes, e nenhum deles
é garantia sozinho:

- **Guarda em tempo de execução** (`apps/api/src/guarda-de-codigos-de-erro.ts`, e
  a cópia em `apps/console/src/` com o contrato do console): um `onRequest`
  instalado antes de qualquer plugin e rota troca, na resposta do Node de cada
  pedido, `writeHead`, `write` e `end` por versões que seguram o cabeçalho e o
  corpo de toda resposta 401 ou 403 (fora HEAD) até o fim e só então escrevem. Os
  ganchos do Fastify, o tratador de erro, o 404, o tratador de reserva que escreve
  sozinho, `hijack` e `raw` terminam todos nesses três métodos. O corpo tem de ser
  JSON com UMA chave `erro` (repetida é recusada) do catálogo (ou da entrada) e o
  status do catálogo; corpo acima de 64 KiB é desvio. Fora disso, em teste ela
  vira 500 `desvio_do_catalogo_de_erro` e o caso (ou o `afterAll`) que passou por
  ali reprova (`test/guarda-falha-alto.ts`, carregado em toda a suíte); fora de
  teste ela sai com o código genérico do catálogo para o status (401
  `nao_autenticado`, 403 `sem_permissao`) e o desvio vai para o log com o método,
  a rota e o código que tentou sair, este só se tiver a forma de um código
  (`^[a-z_]{1,64}$`; o resto vira um marcador, para não gravar e-mail ou CPF).
  `apps/api/test/guarda-de-codigos-de-erro.test.ts` planta como rotas quinze
  das dezesseis formas que a varredura não lia (todas menos a M08, a escrita
  direta no socket, que a guarda não vê; ver "O que a guarda NÃO vê", abaixo)
  e os dezesseis escapes que a revisão achou na primeira versão da guarda (um
  `onSend`), e prova os dois modos.
- **Varredura do código-fonte** (`apps/api/test/codigos-de-erro.test.ts`, árvore
  sintática do TypeScript, na API, no pacote compartilhado e no console do
  fornecedor). É HEURÍSTICA, a primeira linha: a lista do que ela não lê não é
  fechada, e a cada regra nova a revisão achou a forma seguinte. Reprova resposta
  401 ou 403, ou de status que o texto não resolve,
  com código fora do catálogo e da lista da entrada. Lê `send({ erro })` literal
  ou por constante (só um `const` não exportado com objeto literal, resolvido pelo
  escopo, e que no arquivo só é lido: `let`, `var`, parâmetro homônimo,
  exportação, escrita em campo, passar a uma função ou apelidar deixam o corpo sem
  leitura, e isso reprova), `new RegraDeNegocio(...)` e `new FalhaAutenticacao(...)`
  (inclusive com outro nome de importação ou por `import * as`), o `super(...)` de
  qualquer subclasse delas, classe de erro com `codigo` literal, atribuído no
  construtor, por getter ou por propriedade de parâmetro, o tratador global e a
  recusa `{ status, corpo: { erro } }` do console. Formas que ela reconhece como
  ilegíveis, e reprova: `.code(...)` fora de uma cadeia com `send`, 401 ou 403 sem `erro`,
  corpo que não resolve (inclusive texto, com status calculado), `{ erro: "x",
  ...extra }` com spread depois de `erro`, `erro` por getter, setter ou método,
  escrita em `erro` ou `corpo` de qualquer objeto (ponto, colchete, operador
  composto, `delete`, `++`, desestruturação), colchete com chave literal nos nomes
  que ela lê com ponto (`resposta["code"](403)`, `["send"]`), chamada por chave
  calculada (`resposta[m](403)`), `.send` sem ser chamado, `.call`, `.apply` e
  `.bind` (salvo `Object.prototype.hasOwnProperty.call`), chave calculada que não
  resolve a um `const` de texto, texto com `FST_` (forja o código do Fastify cujo
  status o tratador repassa), `Object.setPrototypeOf`, `Object.create`,
  `__proto__` e `extends` de expressão (forjam a classe de um erro), `toJSON`, o
  serializador da resposta, `eval`, `Function`, `.redirect(url, status)` fora de
  3xx, `statusCode`/`status` escritos à mão (propriedade, abreviação, método,
  acessor, chave computada, colchete, operador composto, `Object.defineProperty`),
  `Object.assign`, `.raw`, `.hijack()`, `.writeHead()`, ganchos `onSend` que
  recebem o corpo ou que enviam resposta ou lançam erro de negócio, argumentos
  espalhados em `new RegraDeNegocio(...)`, `status` declarado em classe de erro,
  classe de erro guardada em variável ou passada a `Reflect.construct`, código
  calculado, classe nova com `codigo` calculado, qualquer `Reflect`, atribuição ao
  `codigo` de um erro fora do construtor, reatribuição do parâmetro do tratador
  global. Só passam os repasses conferidos
  à mão e listados no teste, cada um com o porquê e preso à origem conferida (o
  `erro` do tratador global é o parâmetro do `setErrorHandler`; o status do
  `corpo_invalido` vem de `doLeitorDeCorpo.statusCode`). Reprova ainda código do
  catálogo emitido com status diferente do escrito e código do catálogo que
  nenhum ponto do servidor emite.
- **Prova dinâmica** (`apps/api/test/prova-dinamica-dos-codigos-de-erro.test.ts`),
  que é a SEGUNDA linha, depois da varredura: sobe o servidor, lê as rotas que ELE
  registrou (a árvore do Fastify concatenada, a mesma leitura de
  `superficie.test.ts`) e pede cada uma, com 12 perfis em estados negativos (sem
  token, token lixo, vencido, de outra assinatura, perfil errado, conta
  desativada, senha provisória, município suspenso, município de fora). Cada
  pedido sai de um endereço de rede distinto, para não esbarrar no limitador de
  300 por minuto (que continua ligado no resto da suíte), e o teste exige zero
  429. Exige que o número de pares método + caminho pedidos seja o de pares
  registrados (conferido por uma segunda contagem da árvore), que nenhum pedido
  caia fora das rotas, e que todo 401 e todo 403 traga um `erro` do catálogo ou
  da entrada com o status do catálogo. O que ela EXERCITA de verdade, medido e
  com piso declarado no teste (rodar com `SAIDA_ALCANCE=arquivo.json` grava a
  matriz status por rota e por perfil): dos 114 pares, 112 chegam ao handler com
  algum perfil (status que não é 401, 403 nem 429), 48 recebem 2xx de algum
  perfil, e **66 nunca recebem 2xx de perfil nenhum** (só 422, 404, 409 ou 503
  além das recusas de acesso), isto é, o corpo mínimo que a prova manda não leva
  esses handlers até o fim e a autorização DELES é exercitada só até a validação;
  2 (as do armazenamento local, que autenticam pela assinatura da URL) só recebem
  403 `assinatura`. Por perfil, as rotas que chegam ao handler: sem token, token
  lixo, vencido e de outra assinatura 10 cada (as públicas), coordenador 93,
  agente 62, operador 61, administrador 100, conta desativada 47, senha
  provisória 49, coordenador de outro município 96, município suspenso 54. Ou
  seja, a prova dinâmica NÃO é "todas as rotas com todos os perfis até o fim": a
  garantia de que nenhuma recusa de acesso sai fora do catálogo é a guarda em
  tempo de execução (o primeiro item desta lista). A varredura do fonte é a
  primeira linha dos testes, heurística, e a prova dinâmica é a segunda: ela
  fecha o que o texto esconde só onde chega, com os perfis e os corpos mínimos
  que usa. Nenhuma das duas é garantia sozinha.
- **Execução por código** (no mesmo arquivo da varredura): cada um dos dez códigos sai do servidor real, por
  requisição, com o status do catálogo (e a frase do catálogo onde a rota usa a
  padrão).

A guarda decide pelo status que o Node escreve (`statusCode | 0`: `403.5` e
`"403"` saem 403) e lê a linha de status nos bytes que a resposta manda ao socket
(`_writeRaw` e `_flushOutput` da instância), então a cabeça gravada por baixo de
`writeHead` (`_storeHeader`, `_header` reescrito) também é conferida. Ela também
confere o CORPO contra a moldura que a cabeça declarou (correção 6): toda resposta
sai com `strictContentLength` ligado e a guarda conta os bytes de cada pedaço
(texto, Buffer ou fluxo) contra o `content-length`, então nenhum byte além do
declarado sai, nem pela API pública do Fastify (`header("content-length", "2")`
com um fluxo maior) nem por baixo; com `chunked`, os pedaços são lidos e nada sai
depois do terminador; `transfer-encoding` que não termina em `chunked`, ou corpo
sem moldura, fecha a conexão no fim; `content-length` junto de
`transfer-encoding` troca a resposta inteira. Excesso é desvio, sai só o que
cabia e a conexão fecha. O caminho do desvio não lança (o trailer, que o Node
recusa junto de `content-length`, sai da resposta trocada).

O status 1xx como resposta FINAL (`reply.code(102).send(...)`, `code(101)`,
`writeHead(103)` ou `statusCode = 102` antes do `end`) fazia o Node escrever só a
linha provisória e dar a resposta por terminada, e o cliente lia a resposta do
pedido SEGUINTE da conexão como a deste. Desde a correção 7 isso é desvio, HEAD
inclusive, e sai 500 nos dois modos (`desvio_do_catalogo_de_erro` em teste;
fora de teste, `erro_interno` na API e `falha_interna` no console). O 101
escrito por baixo, que a porta dos bytes lê como cabeça final, também vira 500,
e a resposta que termina só com cabeça provisória, sem a final, fecha a conexão.
Os 1xx legítimos (`writeContinue`, `writeProcessing`, `writeEarlyHints`) não
passam por `writeHead` e seguem intactos. Também na correção 7: quando o `end`
do Node lança no meio (o `content-length` estrito que não bate com o corpo de um
401 ou 403 do catálogo), o socket ficava arrolhado e o cliente ficava sem
resposta até o tempo esgotar; a guarda o desarrolha e manda a resposta do
desvio. O que os testes da guarda provam (por socket cru com dois pedidos em
pipeline, nos dois modos, rodados em Node 22 e em Node 24): na API, cada forma dos
relatórios da rodada 7 (fluxo do Node, `Response` e `ReadableStream` da web com
`content-length` menor que o corpo ou `0`, 403 do catálogo com `content-length`
errado, `transfer-encoding: identity`, `reply.trailer`, `addTrailers`,
`writeHead(403)` mais `flushHeaders` e 1xx final) não leva código fora do
catálogo ao fio e não dessincroniza a conexão, e os casos de trailer vigiam
exceção não tratada; no console, as mesmas formas, menos `transfer-encoding:
identity` e `writeHead(403)` mais `flushHeaders`, que não têm caso no teste
dele (`apps/console/test/guarda-de-codigos-de-erro.test.ts`). O proxy da borda
diante dessas formas não foi medido.

As Early Hints (correção 7b): o Node 22, que é o de produção, não confere o valor
de `writeEarlyHints`, e CR ou LF nele põe uma cabeça HTTP inteira no fio (o Node
24 recusa). A guarda aplica a regra do Node 24 nas duas versões: nome que não é
token, ou valor com caractere de controle, lança `ERR_INVALID_CHAR` antes de
qualquer byte sair, e a rota responde o 500 do tratador de erro. O 103 legítimo
antes de um 403 do catálogo passa intacto (caso na API e no console), e a porta
dos bytes continua de segunda rede.

O que a guarda NÃO vê: escrita direta no SOCKET, que não passa pela resposta do
Node. Isso inclui `req.socket.end("HTTP/1.1 403 ...")`, o mesmo socket por
`.connection` ou `.client` (no pedido ou na resposta), e um ouvinte nos eventos do
servidor HTTP que entregam o socket ou o pedido antes do Fastify
(`app.server.on("connection", (s) => s.end("HTTP/1.1 403 ..."))`, e `request`,
`upgrade`, `secureConnection`, `clientError`, por `on`, `once`, `addListener` ou
`prependListener`). Contra isso NÃO há garantia em tempo de execução: só a
varredura do fonte, que é heurística, reprova esses nomes e esses ouvintes (e a
desestruturação de `socket`, `connection` e `client`). A guarda também não vê o
método do protótipo da resposta chamado por fora da instância (`.call`, `.apply`,
`Reflect`), que a varredura reprova. Corpo MENOR que o `content-length`
declarado, em resposta que não é 401 nem 403, derruba a conexão sem resposta: o
cliente vê a conexão cair, não uma resposta trocada. E nenhuma
linha prende código no mesmo processo que troque, antes de a guarda carregar, as
primitivas que ela usa para decidir (ela guarda as suas na carga e, ao decidir, só
usa essas cópias: trocar `JSON`, `includes` ou `hasOwnProperty` depois não a
engana, e o teste prova), nem o que troque o próprio Node ou o registrador de log.
Fora do escopo: erros de outros status (404, 409, 422, 429,
5xx) e os códigos de regra de negócio, que são da V2-F02-E03; o texto da frase que
cada rota devolve fora dos casos de execução; e o que cada cliente faz com o
código (isso é dos testes do painel e do aplicativo). Até a V2-F00-E05 os três
primeiros eram um só, `401 sessao`, e o cliente não distinguia token vencido de
conta desativada.

| Código | Status | O que o cliente faz | Quando sai |
| --- | --- | --- | --- |
| `nao_autenticado` | 401 | Pede token novo com o de renovação e repete o pedido uma vez | Token vencido, adulterado ou ausente; e, na escrita, papel gravado diferente do papel do token (a renovação devolve o token com o papel novo) |
| `sessao_encerrada` | 401 | Pede para entrar de novo; o que está no aparelho continua lá | Sessão encerrada por alguém (a própria pessoa, quem administra, troca de senha, reuso de token), inclusive o token de acesso anterior a uma renovação quando a cadeia foi encerrada; conta que deixou de existir; senha provisória vencida (que também não se troca nem se renova) |
| `conta_desativada` | 403 | Para de tentar, mantém o que há no aparelho e manda procurar a coordenação | Conta desativada: na escrita com token vivo e em `/auth/renovar` |
| `acesso_suspenso` | 403 (503 nas rotas da fila) | Espera: quem resolve é quem administra o contrato | Município suspenso pelo fornecedor |
| `troca_de_senha_obrigatoria` | 403 | Leva à troca de senha | Sessão nascida de senha provisória |
| `sem_permissao` | 403 | Nada a repetir | O perfil não pode fazer isto |
| `posto_insuficiente` | 403 | Nada a repetir | A pessoa administra usuários, mas não aquela conta (de posto acima do dela; de posto igual, para quem não é administrador). É 403 e não 404 porque a conta é do próprio município |
| `posto_insuficiente_para_dado_pessoal` | 403 | Nada a repetir | Exportação com dados pessoais por quem não administra o município |
| `email_so_por_administrador` | 403 | Nada a repetir | Troca do email de outra pessoa por quem não é administrador |
| `assinatura` | 403 | Nada a repetir | URL assinada de envio ou de download de arquivo sem assinatura, adulterada ou vencida (não há sessão: a assinatura é a credencial) |

Três regras que não mudam com os códigos:

- **Recurso de outro município é 404, nunca 403.** Um 403 confirmaria que o
  registro existe. `conta_desativada` é 403 porque a conta desativada é a do
  próprio usuário autenticado, e a vigência é conferida antes de qualquer
  consulta ao recurso: a resposta é a mesma para uma ocorrência do próprio
  município, de outro município ou que não existe.
- **A entrada não conta nada sobre a conta.** `/auth/entrar` com conta
  desativada responde a mesma recusa genérica da senha errada e do e-mail
  inexistente, com o mesmo status e a mesma frase.
- **Conta desativada vem antes de sessão encerrada.** Desativar a conta encerra
  as sessões dela; se a ordem fosse outra, o cliente leria `sessao_encerrada` e
  mandaria entrar de novo, que não resolve.

O código antigo `sessao` deixou de existir. Os da **entrada** (`credenciais` 401,
`senha_provisoria_vencida` 401, `bloqueado` 429) ficam numa lista própria,
`CODIGOS_DA_ENTRADA`, fora do catálogo de acesso: respondem a outra pergunta e o
cliente nunca os lê como sessão morta. O console do fornecedor (`apps/console`) é
outro processo, com contrato de erro próprio, e o teste o varre contra a lista
dele. O esquema de erro único da API, com o catálogo inteiro (validação, regra de
negócio, conflito), é da V2-F02-E03, que generaliza esta tabela.

Um caso fora da tabela, porque não é de acesso: pedido cujo corpo o Fastify não
consegue ler (JSON vazio com `content-type: application/json`, JSON torto, corpo
grande demais, tipo de conteúdo que nenhuma rota aceita) responde o 4xx do próprio
Fastify (400, 413 ou 415) com `erro: "corpo_invalido"` e uma frase em português, e
não mais 500 com "informe o código ao suporte" (V2-F00-E07, correção 3;
`apps/api/test/corpo-ilegivel.test.ts`).

Trocar o papel de uma pessoa **não revoga as sessões dela** (decisão da
V2-F00-E07): a escrita seguinte com o token velho responde 401 `nao_autenticado`,
o cliente renova e repete sem a pessoa notar, e a renovação lê o papel do banco.
O painel atualiza o papel da tela com a resposta da renovação, e o menu passa a
mostrar só o que o papel novo tem. Revogar obrigaria a pessoa a entrar de novo,
com coleta de campo na fila, para receber o que a renovação já entrega.

Redefinir a senha derruba **todas** as sessões. Se a recuperação foi pedida
porque alguém invadiu a conta, deixar as sessões antigas vivas entregaria a
conta de volta ao invasor. E o banco valida o link e grava a senha nova numa
operação só: separar em "confere o token" e depois "grava" abriria uma janela
em que o mesmo link serve duas vezes.

O envio da mensagem passa por uma porta (`Notificador`), e não por um cliente de
email embutido na rota: um teste que precisasse de servidor de email nunca seria
rodado. Em desenvolvimento o notificador de log só anuncia que houve uma
notificação (nunca imprime o corpo, que carrega o link); quem precisa do link em
teste usa `NOTIFICADOR_ARQUIVO`, canal que a partida em produção recusa.

#### O cliente de email, e o defeito que ele já foi

Esta porta passou por dois estados errados, e o segundo é mais instrutivo que o
primeiro.

No primeiro, não havia implementação nenhuma. `NOTIFICADOR_URL` e
`NOTIFICADOR_CHAVE` existiam na configuração, a partida em produção recusava
subir sem elas com a recuperação ligada, e **nenhuma linha do servidor jamais
falou com provedor nenhum**. O produto conferia o endereço de um provedor com o
qual nunca falava.

No segundo, o cliente existia e montava o pedido com nomes de campo
**inventados**: `de`, `para`, `nome`, `assunto`, `texto`. Provedor de email
nenhum aceita esse formato. Ligar o recurso naquele estado teria produzido cem
por cento de recusa, ou seja, o cliente que existia para o email sair teria
impedido o email de sair. E nada quebraria: a configuração passava, o servidor
subia, e o sintoma apareceria uma mensagem de cada vez, na caixa de entrada que
nunca recebia nada.

Hoje o cliente fala o contrato publicado do **Resend**
(`POST https://api.resend.com/emails`, com `from`, `to`, `subject` e `text`), e
`apps/api/test/notificador-http.test.ts` confere o corpo campo a campo, além de
afirmar que os cinco nomes inventados **não** aparecem nele. Sem SDK, pela mesma
razão que a assinatura S3 é escrita à mão: o `npm audit --omit=dev` da raiz
precisa fechar em zero (o aplicativo de campo só passa com exceções nomeadas, ver
"Como testar").

Três decisões que vale registrar:

| Peça | Decisão | Por quê |
| --- | --- | --- |
| Remetente | `EMAIL_REMETENTE` passou a ser OBRIGATÓRIA com `EMAIL_ATIVO=sim` | O provedor trata `from` como obrigatório. Opcional queria dizer "configuração completa, servidor de pé, toda mensagem recusada" |
| Recibo | O identificador que o provedor devolve é guardado em `oficio_envios.provedor_id` (migração 027) | Sem ele, "o provedor aceitou" é palavra contra palavra no dia em que o órgão diz que não recebeu |
| 429 | É o ÚNICO 4xx que o cliente repete sozinho, duas vezes, respeitando o `retry-after` e com a mesma chave de idempotência | É o erro do dia de temporal, e o único que não diz nada sobre a mensagem. E a rota grava a tentativa ANTES de chamar o provedor: devolver o 429 para fora queimaria uma das três tentativas de reenvio do ofício sem nada ter saído |

A chave de idempotência não é enfeite: sem ela, um 429 sobre um pedido que na
verdade tinha passado faria o mesmo ofício sair duas vezes para o órgão, e
ofício duplicado numa interdição é problema jurídico.

O corpo da resposta do provedor passa por `semOsEnderecos` antes de virar
mensagem de erro, e agora leva junto o endereço do destinatário: o erro de
validação ecoa o campo recusado, e esse eco iria para o log do servidor e para a
coluna `detalhe` da tentativa, que o suporte lê.

Ligar isso em produção é procedimento, e está escrito em `docs/LIGAR-O-EMAIL.md`.

#### A segunda etapa, e o desfecho a mais na rota de entrar

`SEGUNDO_FATOR_ATIVO=sim` faz a rota de entrar ter **dois desfechos**: a sessão,
ou "falta o código". O estado intermediário viaja num **token de propósito
único**, com plateia própria (`dc360-desafio`), válido por cinco minutos, que
rota autenticada nenhuma aceita: reusar o token de acesso aqui seria dar acesso
antes da segunda etapa, porque quem tem o token não precisa da tela para nada.
Com o recurso ligado, o **administrador** que ainda não ligou a verificação não
recebe sessão: ele recebe um desafio que abre a ativação e mais nada. Exigência
que deixa entrar com um aviso é exigência de mentira.

| Peça | Decisão | Por quê |
| --- | --- | --- |
| Segredo | Cifrado em AES-256-GCM, amarrado ao município e à pessoa, chave em `SEGUNDO_FATOR_CHAVE` | Banco vazado não devolve segundo fator. A amarração impede copiar o envelope de uma linha para a do administrador |
| Janela | Um passo de tolerância para cada lado, e o passo usado fica queimado | Cada passo a mais triplica os códigos válidos ao mesmo tempo. Sem queimar, quem leu a tela por cima do ombro entra com o mesmo número |
| Teto | Contador próprio, separado do da senha | O da senha zera a cada acerto de senha: com um contador só, adivinhar seis dígitos teria tentativas infinitas |
| Códigos de recuperação | Oito, 80 bits cada, mostrados uma vez, guardados como resumo, cada um vale uma vez | Sem eles, telefone perdido vira SQL na produção com o papel que ignora o isolamento |
| Ativação | Confere um código ANTES de ligar | Relógio de telefone errado ou leitura que não guardou nada trancariam a pessoa do lado de fora |
| Desafio e senha trocada | O desafio leva uma impressão da senha conferida na primeira etapa (HMAC com o segredo de assinatura, campo `cr`), e a segunda etapa só abre sessão, ou liga o recurso, se a senha ainda for a mesma (V2-F00-E07, correção 3) | O desafio vale cinco minutos. Sem isto, quem tinha a senha antiga e o código abria sessão depois de uma troca ou redefinição feita nesse intervalo, ou ligava o segundo fator com o aparelho dele na conta de quem acabara de trocar a senha. Desafio emitido antes dessa versão não traz a impressão e é recusado como expirado |
| Desligar | Exige a senha atual, apaga o segredo e derruba os códigos | O painel esquecido aberto na recepção não desliga a proteção de ninguém |

O código QR da ativação é desenhado pelo próprio painel
(`apps/web/src/componentes/qr.ts`), sem dependência nova, pela mesma razão do
TOTP no servidor. O segredo aparece em texto ao lado dele: metade dos
computadores de recepção de Defesa Civil não tem câmera.

Login e renovação acontecem antes de existir contexto de tenant, então
precisam ler tabelas que o RLS protege. Em vez de abrir exceção geral, a
migração 002 cria funções `SECURITY DEFINER` estreitas: cada uma responde uma
pergunta, por igualdade, sem filtro livre, devolvendo só o necessário, com
`search_path` fixo e `EXECUTE` revogado de `PUBLIC`.

### Sincronização do campo

`POST /sincronizacao/vistoria` é a rota que decide se o produto funciona na
chuva. O agente coleta sem sinal e o envio sai quando a rede volta, muitas
vezes já no carro, com a conexão indo e vindo: a mesma coleta chega mais de
uma vez. Um laudo duplicado numa interdição é problema jurídico.

A chave de idempotência vem do aparelho e é única por município no banco.
Reenvio devolve o resultado da primeira vez, com 200 em vez de 201, e não cria
laudo nem evento novo. A chave de storage da foto é remontada no servidor a
partir da organização do token: aceitar a que o aparelho mandou permitiria
gravar evidência sob o prefixo de outra prefeitura.

#### Quem coletou não é quem enviou

O aparelho de plantão é compartilhado entre turnos, e isso quebrava a autoria da
vistoria. A agente da manhã coleta no morro sem sinal, lê a minuta em voz alta
COM O NOME DELA e a moradora assina no dedo. Ela sai da conta, e o aplicativo
promete (com razão) que a coleta continua guardada no aparelho. Às 19:00 o agente
da noite entra, a fila drena, e como o envelope não dizia autor nenhum o servidor
tirava o `agente_id` de quem apresentou o token. O laudo e a trilha passavam a
atribuir a vistoria a um servidor que nunca esteve no local, contra a minuta lida
em voz alta, e a trilha é append-only: esse autor nunca seria corrigido, só
comentado.

O aplicativo carimba o autor no item da fila e não envia coleta que não é de quem
está logado. Isso é portão de cliente, e **portão de cliente não é controle de
acesso**: binário adulterado ou defeito naquele filtro reproduz o laudo falso. O
envelope passou a carregar `coletadaPor`, e o servidor compara com o dono do
token verificado. Divergiu, recusa com 409 `autor_divergente`, e a tentativa
entra na trilha: tentar gravar vistoria com autor que não é o do token é
exatamente o que alguém vai querer auditar depois. O registro é escrito em
transação própria, senão o ROLLBACK da recusa o levaria junto.

O campo é **opcional**, e a razão tem data de validade escrita no esquema: há
aparelho em campo com coleta gravada antes dele, e a fila não reenvia o item
recusado por causa do dado (o botão "Tentar de novo" some; sobram "Esta coleta é
minha", a correção e o descarte, em `apps/campo/src/app/(agente)/fila.tsx`).
Obrigatório agora, essas coletas virariam 422 para sempre, e uma vistoria de
morro seria destruída por uma mudança de esquema. Ele
passa a obrigatório quando não restar coleta antiga em nenhum aparelho.

### Rodar

```bash
npm run dev:api     # sobe em http://127.0.0.1:3333
```

Sem `DATABASE_URL` ela sobe um Postgres em WebAssembly no próprio processo,
efêmero, só para desenvolver. Em produção a configuração recusa essa
combinação e exige `DATABASE_URL` e `JWT_SEGREDO`: um servidor que sobe com
chave padrão é pior que um que não sobe, porque parece funcionar.

Em produção a `DATABASE_URL` também precisa pedir verificação do certificado
do banco, ou seja, terminar em `?sslmode=verify-full`. Sem isso o pool não
monta a âncora de confiança e a conexão sobe cifrada e **não autenticada**,
que é uma combinação com cara de segura: quem estiver entre a API e o banco lê
e reescreve a base de todos os municípios, e o SCRAM não acusa nada, porque o
intermediário só retransmite o desafio e a resposta. O certificado raiz já vem
versionado em `db/provedores/`, então não há mais nada a configurar.

## O motor de sincronização offline (`packages/campo`)

É a parte difícil do aplicativo de campo, e está pronta e testada antes da
casca em Expo existir, porque é aqui que mora o risco. O agente coleta no
morro sem sinal e o envio acontece depois, muitas vezes já no carro, com a
conexão indo e vindo. Duas coisas não podem acontecer nesse trecho: perder uma
coleta feita no morro, e gravar o mesmo laudo duas vezes.

Decisões que o código toma, e por quê:

| Situação | O que a fila faz | Por quê |
| --- | --- | --- |
| Sem sinal | Guarda e agenda nova tentativa | A coleta já foi feita; refazer significa subir o morro de novo |
| Erro de rede no meio da fila | Para ali, não varre o resto | Rede caída não melhora no item seguinte, e insistir gasta bateria |
| 5xx ou 429 | Tenta de novo, com espera crescente | Servidor reinicia em deploy; insistir resolve |
| 400, 403 `sem_permissao`, 404, 409, 422 | Bloqueia na hora | Repetir não muda o resultado, só enche o log |
| 401 `nao_autenticado` | Pede UM token novo, repete o pedido uma vez; se falhar de novo, trata como sessão encerrada | Token vencido se resolve renovando; insistir sem limite estoura o limite de tentativas e bloqueia a conta de quem está trabalhando |
| 401 `sessao_encerrada` ou 403 `conta_desativada` | **Para a fila e mantém o item pendente**, sem contar tentativa e sem bloquear | O servidor não recusou a coleta, recusou quem manda. A vistoria feita no morro nunca vira "recusada" nem convida a descartar |
| Sem token no aparelho | O mesmo que `sessao_encerrada` | A pessoa não tem sessão aberta agora; a coleta não foi recusada |
| App morre no meio do envio | Reenvia com a MESMA chave | O servidor reconhece e devolve o recibo antigo em vez de gravar outro laudo |
| Dois drenos ao mesmo tempo | O segundo recusa começar | Wi-Fi de prefeitura reconecta sozinho e dispara sincronização em cima de outra |

Desde a V2-F00-E06 a fila distingue os códigos de acesso do catálogo
(`packages/shared/src/codigos-de-erro.ts`) pelo código, e não pelo status:
`FalhaDeSessao` (motivo `sessao_encerrada`, `conta_desativada` ou
`troca_de_senha_obrigatoria`; `acesso_suspenso` não entra aqui: é temporário, o item
fica pendente e a fila tenta de novo mais tarde) é diferente de
`FalhaPermanente` e de `FalhaTemporaria`. O dreno devolve `paradaPor`, o resumo
da fila devolve `pausadaPor`, e o aparelho mostra a frase de cada caso: sessão
encerrada, entre de novo; conta desativada, procure a coordenação. Em ambos a
coleta continua guardada e sobe com a mesma chave depois da nova entrada.
Detalhes e o que falta ver em aparelho: `apps/campo/PENDENCIAS.md`, item 14.

A espera entre tentativas cresce exponencialmente **com ruído**. Sem o
exponencial, um servidor fora do ar recebe uma tentativa por segundo de cada
aparelho em campo. Sem o ruído, todos os aparelhos que perderam sinal no mesmo
temporal voltam no mesmo instante e derrubam o servidor de novo justo na hora
em que ele está subindo.

A persistência é uma porta (`ChaveValor`), não um SQLite direto: no aparelho
é `expo-sqlite` (`packages/campo/src/deposito-sqlite.ts`), nos testes é um mapa. A lógica não muda.

## Evidência fotográfica

A foto é a prova de uma vistoria de interdição, e ela mostra a casa e a rua de
uma família em situação de risco. Duas regras vêm daí:

**O arquivo nunca passa pelo servidor.** O aparelho recebe uma URL
pré-assinada de vida curta e envia direto ao armazenamento. Passar dezenas de
fotos por dentro da API significaria pagar banda duas vezes e derrubar o
servidor no dia de temporal, que é quando o sistema precisa funcionar.

**Nunca existe URL pública.** Toda leitura é pré-assinada, curta, gerada só
depois de conferir permissão.

O ciclo tem quatro passos, e o quarto não é burocracia:

1. O aparelho pede autorização dizendo tipo e tamanho.
2. O servidor confere permissão e dono da ocorrência, **decide a chave** e
   devolve a URL. O cliente não escolhe onde grava: aceitar a chave proposta
   permitiria escrever sob o prefixo de outra prefeitura.
3. O aparelho envia os bytes.
4. O aparelho confirma, e o servidor **pergunta ao armazenamento** se o objeto
   existe e com que tamanho. Sem esse passo, um metadado fica apontando para
   arquivo que nunca chegou, e a falta aparece meses depois, numa audiência.

Tipo e tamanho entram na assinatura, então mandar diferente invalida a URL: o
limite deixa de depender da boa vontade do cliente. O banco impõe as mesmas
regras por CHECK, para valerem mesmo se outra ponta gravar direto.

### A assinatura

`src/armazenamento/assinatura.ts` implementa AWS Signature Version 4 sobre
`node:crypto`, sem o SDK da AWS: o SDK traz dezenas de pacotes transitivos
para uma conta que precisa fechar em zero no `npm audit --omit=dev` da raiz (o
que `npm run auditar` prende; o `npm audit` puro não fecha, ver "Como testar"), e o provedor
escolhido é S3-compatível, não a AWS (o levantamento apontava Cloudflare R2 por
causa do egress; o `fly.toml` de hoje usa o Supabase Storage por S3, ver
`docs/ARMAZENAMENTO.md`).

A correção não é opinião. O teste confere a saída contra o **vetor oficial da
AWS**, e ela bate byte a byte. Uma assinatura de 256 bits não coincide por
acaso.

Sem `S3_ENDPOINT` configurado, a própria API guarda os bytes em memória, com
URL assinada e expirando do mesmo jeito. A configuração recusa essa combinação
em produção: guardar evidência na memória do processo perderia toda foto no
primeiro reinício.

## Documentos oficiais

O servidor público julga o software pelo documento que ele produz, e um laudo
é peça de processo administrativo: ele pode acabar numa audiência. A API gera
`GET /documentos/:id/laudo` e `GET /documentos/:id/termo-de-interdicao` como
HTML pronto para impressão.

**Gerados no servidor, não montados na tela.** O mesmo laudo precisa sair
igual no navegador do coordenador, na impressora da recepção e no PDF anexado
ao processo. Montar em três lugares produziria três documentos com o mesmo
número de protocolo. O PDF (adiante) renderiza exatamente
estas páginas: o template é um só, versionado com o código.

Duas regras de conteúdo que não são estéticas:

- **As duas marcas de tempo aparecem sempre que diferem.** Coleta e
  sincronização em horários distintos é o normal de uma vistoria feita sem
  sinal. Mostrar só a segunda faria o documento afirmar que a vistoria
  aconteceu na hora em que o sinal voltou. O laudo diz qual é a data de
  referência do ato, e por que há duas.
- **Nenhuma norma além das autorizadas, e nenhum número de artigo.** Artigo
  errado num termo de interdição é motivo para anular o ato. Um teste varre o
  HTML procurando qualquer citação de lei ou decreto e reprova se aparecer
  algo fora da lista de `../docs/CONTEXTO.md`; outro reprova se aparecer a
  palavra "artigo" seguida de número.

Os dois saem também em PDF (`/documentos/:id/laudo.pdf`), renderizados do
**mesmo** HTML por Chromium sem interface. Gerados sob demanda e não guardados:
o laudo muda se uma foto for anexada depois, e um PDF em cache seria a versão
errada com cara de definitiva. Sem navegador instalado, a rota responde 503
dizendo para usar a versão para impressão, em vez de derrubar o pedido.

Enquanto o produto está em validação, todo documento sai com marca d'água. Um
laudo de demonstração indistinguível de um real acaba anexado a processo por
engano.

## Nada capturado fica invisível

Duas informações eram gravadas e nunca mostradas, o que deixava as duas
funcionalidades pela metade.

**O vínculo de duplicidade** agora aparece nos dois sentidos: o chamado novo
diz de quem é continuação, e o original avisa que há outros sobre o mesmo
evento, com a frase que importa junto (encerrar um não encerra os outros).
Sem isso, o coordenador encerraria o primeiro sem saber que há outro pendurado.

**As providências sem resposta** ganharam cartão próprio no painel e contagem
de vencidas. Elas somem da fila assim que a ocorrência é encerrada, e é
justamente aí que ficam esquecidas, então o cartão as mantém à vista mesmo
depois do encerramento, dizendo por escrito por que continuam ali.

O cartão fica **abaixo** da fila, e não acima: a fila é o que o coordenador
abre o painel para ver.

## O ciclo da providência se fecha

Encaminhar uma providência sem nunca registrar o desfecho é o que produz o "a
prefeitura não fez nada" seis meses depois, sem ninguém conseguir provar o
contrário. O órgão responde, e a resposta entra com desfecho de lista fechada
(atendida, atendida parcialmente, recusada), texto e quem respondeu.

- **A resposta não é editável.** Corrigir seria apagar o que o órgão disse. Se
  algo muda, encaminha-se uma providência nova.
- **Providência sem resposta não impede encerrar.** A secretaria às vezes
  nunca responde, e travar o encerramento faria a fila do coordenador crescer
  para sempre. Mas o encerramento devolve quais ficaram em aberto e registra
  isso na trilha, para ser decisão consciente e não esquecimento.

## Prestação de contas

Um órgão público responde três perguntas o tempo todo, e nenhuma cabe na tela
de uma ocorrência isolada: quem alterou este registro, o que a Defesa Civil fez
no semestre, e quantos chamados vieram daquele bairro.

**A trilha não é escrita à parte.** Ela é o subproduto de cada transição,
gravada na mesma transação da mudança. Se um evento falta, é porque a mudança
não aconteceu. A tela de auditoria filtra por autor, tipo de evento e
protocolo, e respeita o município como todo o resto.

**O resumo usa mediana, não média.** Uma ocorrência parada seis meses por causa
de uma obra puxa a média e faz o serviço parecer pior do que é. A mediana
descreve o atendimento típico, que é o que a pergunta quer saber.

### A planilha não pode virar arma contra quem a abre

Célula que começa com `=`, `+`, `-`, `@` ou tabulação é interpretada como
FÓRMULA pelo Excel e pelo LibreOffice. Num sistema onde o relato vem do que um
cidadão dita por telefone, basta alguém ditar um endereço que comece com `=`
para a planilha executar comando na máquina de quem a abriu. A vítima é o
servidor público, e ele nunca vai suspeitar do arquivo que a própria prefeitura
gerou.

`montarCsv` neutraliza isso prefixando a célula com apóstrofo, e um teste
percorre todas as células do arquivo exportado conferindo que nenhuma começa
com caractere executável. O arquivo também sai com marca de ordem de bytes e
ponto e vírgula, senão "Acácias" vira "AcÃ¡cias" e a planilha abre em uma
coluna só no Excel em português.

### Quem exportou fica registrado

O CSV de ocorrências no nível completo (só o administrador) carrega nome, contato e relato de cidadãos, e sai do
sistema para viver num pen drive ou num email. A Lei 13.709/2018 exige registro
do tratamento de dado pessoal, e exportação é tratamento. A tabela `exportacoes`
guarda quem levou, qual recorte e quantos registros, é append-only como a
trilha, e o registro acontece na mesma transação da leitura.

## O console do fornecedor (`apps/console`)

Três perguntas do dia a dia da operação não tinham resposta sem alguém abrir uma
sessão na produção com a `DATABASE_URL` na mão: o município está usando, alguém
está com problema, e há quanto tempo aquele município não dá sinal. Responder
isso com a credencial de dono do banco é o pior caminho possível, e não por
comodidade: **é a credencial que ignora RLS**, e nesta mesma operação ela já foi
usada uma vez para redefinir a senha de um administrador à mão.

A ADR 0006 tinha recusado o "painel de plataforma" por um motivo que continua de
pé: um papel que enxerga todos os municípios contradiz o isolamento, porque
bastaria um token vazado para alcançar todas as prefeituras de uma vez. A ADR
0008 muda a pergunta, não a conclusão: painel de plataforma e credencial que
enxerga todo mundo só são a mesma coisa **quando o painel lê as tabelas de
negócio**.

### A direção do dado é o desenho inteiro

O console não consulta os municípios. **Cada município escreve o próprio
resumo**, numa tabela de métricas, dentro da própria transação, com o mesmo papel
de aplicação de sempre e debaixo do mesmo RLS de sempre. O console só lê essa
tabela.

Quem faz a escrita acontecer é um relógio na API (`apps/api/src/metricas/`), que
sobe sempre, como a minimização por prazo e diferente do push. Ele abre **uma
transação por município** e chama `resumir_municipio()` lá dentro:

```
para cada id de municipios_a_resumir(frescor):     -- só identificadores
  comTenant(id):                                    -- SET LOCAL ROLE dc360_app
    SELECT resumir_municipio()                      -- SECURITY INVOKER, sob RLS
```

`resumir_municipio()` é `SECURITY INVOKER` de propósito: as contagens rodam com
os privilégios e o contexto de quem chama, então cada uma enxerga apenas as
linhas daquele município. Não existe erro de cláusula nessa função capaz de
produzir o número da prefeitura vizinha, porque as linhas da vizinha não estão lá
para serem contadas.

O que a métrica pode conter é contagem, mediana e marca de tempo. O que ela não
pode conter é regra dura: nome, contato, endereço, coordenada, protocolo, relato,
descrição de vulnerabilidade, matrícula. A defesa não é a boa intenção de quem
escrever a próxima migração: as colunas são numéricas, de data ou booleanas, o
único `uuid` permitido é o da organização, e o portão CA-06 varre o **catálogo**
reprovando qualquer coluna de texto, `jsonb` ou segundo `uuid` em relação que o
console consiga ler.

### O papel de banco do console não tem concessão em tabela de negócio

`dc360_console` tem `SELECT` na tabela de métricas, no cadastro de organizações e
na visão que junta as duas. Em tabela de negócio, é só isso: sem escrita, sem
sequência, sem `BYPASSRLS`. O que ele tem a mais, desde as migrações 036, 038 e
039, é por NOME e fica fora das tabelas de negócio: `EXECUTE` em funções
`SECURITY DEFINER` que fazem um ato fechado cada (cadastrar prefeitura,
suspender e reativar o acesso, agendar e cancelar a eliminação, e as do próprio
login do fornecedor), e escrita nas tabelas do fornecedor (`console_operadores`,
o livro `eliminacoes_de_municipio` e `console_codigos_de_recuperacao`). A lista
de exceções é nomeada em `db/test/isolamento.test.ts`: uma função nova
concedida ao console reprova o portão até alguém escrever o nome dela lá.

Isso não é lista conferida uma a uma, é **asserção universal** em
`db/test/isolamento.test.ts`: nenhum papel além do de aplicação e do dono tem
privilégio em tabela de negócio, por concessão direta, por privilégio de coluna,
por herança de papel, por `PUBLIC`, por visão, por função `SECURITY DEFINER`, e
por fim pelo próprio banco respondendo `has_table_privilege`. A lista a uma vale
para as tabelas de hoje; a asserção vale para a tabela que alguém criar amanhã
sem lembrar disto. O mesmo arquivo prova a outra metade conectando **como** o
console e tentando ler `ocorrencias`, `usuarios`, `evidencias` e `trilha_eventos`:
quem recusa é o Postgres, não uma condição em TypeScript.

A visão que ele lê é `security_invoker`, e isso não é detalhe: sem a opção, ela
rodaria com os privilégios do dono das tabelas e bastaria alguém acrescentar uma
junção com `ocorrencias` ali para o console passar a ler dado de cidadão de todas
as prefeituras, sem tocar em concessão nenhuma. Há um teste que cria duas visões
idênticas, uma com a opção e outra sem, e mostra a sem entregando o endereço.

### O silêncio é um sinal, e não uma linha faltando

Métrica escrita pelo município pode faltar se o município estiver quebrado, e aí
o console mostraria silêncio, que é indistinguível de "ninguém usou hoje". Uma
consulta direta à tabela de métricas produziria exatamente esse engano: o
município quebrado simplesmente não aparece na lista, e ninguém sente falta do
que não está lá.

Por isso o console lê uma **visão que parte de `organizacoes`**. Todo município
aparece sempre, e quem não escreveu aparece com `sem_escrita_recente` verdadeiro,
no topo da tabela, com a palavra "calado" junto do marcador, nunca só por cor.

### Aplicação separada, de verdade

Processo próprio, porta própria, conexão própria, segredo próprio, e **plateia
própria no token**. A separação não repousa no segredo: um teste emite os dois
tokens com a **mesma chave** e o mesmo conteúdo, trocando só a plateia, e mostra
cada lado recusando o do outro. Uma rota nova do produto nasce recusando token de
console, e uma rota nova do console nasce recusando token de município.

O console não tem CORS (a página é servida pelo próprio processo), não carrega a
`DATABASE_URL` do produto e não tem credencial de armazenamento, de push nem de
email. Ele TEM rotas de escrita, e elas são o que uma sessão do fornecedor
comprometida alcança: `POST /prefeituras` (cadastra prefeitura e o primeiro
administrador, por `provisionar_municipio`, migração 036), `POST
/municipios/:id/suspender` e `/reativar`, `POST /municipios/:id/eliminar` (agenda
a eliminação para daqui a sete dias e suspende na hora) e
`/eliminacao/cancelar`, mais as da própria conta (operadores, senha, códigos de
recuperação). Nenhuma delas lê dado de cidadão, e nenhuma apaga na hora: quem
executa a eliminação vencida é o relógio da API (`docs/SAIDA-DE-MUNICIPIO.md`,
capítulo 5). O banco é o MESMO Postgres dos municípios, com papel próprio, e não
um banco separado.

**Versão no endereço (V2-F02-E02).** A página do console pede tudo sob `/v1`
(`/v1/entrar`, `/v1/municipios`, `/v1/prefeituras` e as demais): um ponto único,
a função `pedir` em `apps/console/src/pagina.ts`, põe o prefixo. As rotas moram
numa função só (`registrarRotasDeNegocio`), registrada duas vezes: sob `/v1` e no
caminho sem prefixo, que fica como espelho para a página que alguém deixou aberta
antes da troca. `/saude`, a casca da página, os estáticos e as fontes não têm
versão. O teto de tentativas por endereço é UM por rota lógica, nos dois
prefixos (`apps/console/src/limite-por-rota.ts`): alternar o prefixo não dobra o
limite da porta. Ordem de implantação: o console novo serve as duas formas, então
não há ordem a respeitar entre o processo e a página (ela vem do mesmo processo).
O erro de validação sai em português, na forma `{ erro, mensagem, campos }`, com
o mapa de mensagens do pacote compartilhado (DV-38); a imagem do console passou a
levar `packages/shared/dist` por isso.

### O segundo fator não é opcional

No município o segundo fator é uma exigência que se liga, e existe um estado
legítimo de "conta ainda sem ele". No console esse estado não existe: a conta do
fornecedor é a única do sistema cujo comprometimento afeta mais de um município.

A exigência é cobrada na **partida**, e não no login: operador sem segredo de TOTP
derruba o processo, porque exigência que só aparece quando alguém tenta entrar
fica desligada nos meses em que ninguém entra. E a primeira etapa do login nunca
devolve sessão, só um desafio de plateia própria que rota de leitura nenhuma
aceita.

O TOTP é o do produto, literalmente: `apps/api/src/auth/totp.ts`, com o mesmo
passo queimado depois de usado e o mesmo `scrypt` para a senha. O console não tem
implementação própria de criptografia.

### Onde moram as contas

Em `console_operadores`, no banco, desde a migração 038. Até ela as contas
moravam na configuração do processo, porque o papel do console não escrevia em
tabela nenhuma; a 038 abriu ao console essa tabela, que não é de negócio (só
quem opera o fornecedor), sob policy: operador atualiza a própria linha, só o
dono cria e desativa. Tentativas falhadas, castigo e passo de TOTP já usado vão
para a linha do operador, então valem em qualquer processo e sobrevivem a
reinício. O dono cria operadores pela tela.

`CONSOLE_OPERADORES` virou a SEMENTE do dono: na partida, com a tabela vazia, a
conta da variável entra como dono, uma vez; depois disso a variável é ignorada,
com aviso no log (`apps/console/src/operadores.ts`).

```bash
# 1. Gerar a linha da semente do dono. O comando imprime; nada vai ao banco aqui.
CONSOLE_SEGUNDO_FATOR_CHAVE=... npm run provisionar --workspace @dc360/console \
  -- --email coordenacao@fornecedor.com.br

# 2. Subir. Ver apps/console/.env.example para as variáveis e o porquê de cada uma.
npm run dev:console      # http://127.0.0.1:3344
```


## As regras de conteúdo também

`CLAUDE.md` fixa duas que não são estilo e sim risco: nenhum travessão em texto
nenhum, e nenhuma norma além das que `docs/CONTEXTO.md` autoriza. Um número de
lei errado num termo de interdição é motivo para anular o ato, e um artigo
inventado num documento oficial é pior que nenhuma citação.

`packages/shared/test/regras-de-conteudo.test.ts` varre o código do sistema, o
protótipo e a documentação viva. Há uma isenção, e a razão dela importa:
`docs/referencia/` são documentos de **pesquisa**, e o trabalho deles é
justamente levantar normas. Várias que eles citam não estão na lista
autorizada, porque a lista governa o que o produto AFIRMA e não o que a
pesquisa investigou. Apagar citação de pesquisa para satisfazer um teste seria
destruir a evidência que sustentou a decisão.

Sobre artigo, a varredura é mais estreita e mais dura: nos geradores de
documento oficial, nenhum número de artigo passa. Comentário de código pode
falar de artigo; papel com o brasão do município, não.

Outra regra de conteúdo que roda no `npm test`: enquanto o aplicativo do agente não
declara a saída a campo (V2-F14-E01), nenhum texto do município promete que
alguém "acompanha quem está em campo" sem dizer que o recurso está em
construção. `packages/shared/test/ressalva-saida-a-campo.test.ts` confere
nove arquivos. Em seis (este README, privacidade, papéis, `docs/LEIA-ME.md` e
as duas apresentações), todo parágrafo, linha de tabela ou item de lista que
fala do assunto tem de trazer a ressalva (no README e na privacidade, as
linhas de tabela ficam de fora). Em quatro (os quadros de estado de
`SEGURANCA-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md`, `CARTAO-DO-AGENTE.md` e
deste README, que entra nas duas listas) o quadro tem de existir, trazer a
ressalva e dizer o que falta. O teste morde se a ressalva sair.

## O design system é verificado por máquina

`CLAUDE.md` diz que cor, sombra ou duração escritos direto no componente são
bug. Até agora isso dependia de um revisor humano olhar cada mudança, e revisor
humano não olha o diff das duas da manhã.

A razão da regra não é gosto: **cor literal não troca com o tema.** Ela fica
igual no claro e no escuro, e o resultado é texto ilegível num dos dois. Sombra
literal também não acompanha, e sombra clara sobre fundo escuro simplesmente
some. E cada valor solto é um lugar a mais para consertar quando a identidade
mudar, como já mudou uma vez aqui (laranja para violeta).

`apps/web/test/design-system.test.ts` varre o CSS e os estilos escritos dentro
dos componentes. Exceção deliberada é possível, escrevendo um comentário com o
marcador e a razão na linha de cima: assim ela é uma decisão registrada, e não
um valor que ninguém percebeu. O teste tem casos que provam as expressões
funcionando e não produzindo falso positivo ("a varredura pega o que deveria
pegar" e "a varredura não reclama do que está certo"), para não depender de o código
estar errado para descobrir que a varredura quebrou.

## Acessibilidade também deixou de depender de lembrança

`CLAUDE.md` exige contraste AA, navegação por teclado nos fluxos principais e
estado nunca comunicado só por cor. As três dependiam de um revisor humano
olhar cada tela, e o contraste em particular estava escrito como comentário
dentro de `tokens.css` ("8.98:1 sobre branco"). **Comentário não recalcula.**
Quem escurece um neutro seis meses depois não abre o comentário, e o texto
some sem nada reclamar.

`apps/web/test/acessibilidade.test.ts` calcula. Ele lê `tokens.css`, resolve as
cadeias de `var()`, achata a transparência dos selos sobre a superfície de
baixo (senão o número do tema escuro seria ficção, porque o selo tem 12% de
opacidade) e aplica a fórmula de luminância da WCAG a 21 pares de
frente e fundo, **nos dois temas**. Onde o alvo não é texto, o mínimo cai para
3:1, e a razão está escrita ao lado do par.

O resto da varredura pega o que dá para pegar na fonte: `onClick` pendurado em
elemento que o teclado não alcança (funciona com mouse, some no Tab), imagem
sem `alt`, `outline: none` sem devolver o anel de foco, e a ausência do atalho
de pular para o conteúdo. Exceção é possível com marcador e razão escrita, como
no portão do design system.

O que a varredura encontrou na primeira execução, e foi corrigido:

- **Não havia atalho para pular a navegação.** Quem usa teclado atravessava
  todos os itens da lateral (a navegação do código tem doze controles: dez
  destinos mais "Tema" e "Sair"; o administrador alcança onze, porque "Meu
  trabalho" é do agente) a cada troca de tela. Agora o primeiro Tab cai num
  atalho que aparece ao receber foco.
- **A foto ampliada era uma armadilha de teclado.** Abria sem levar o foco
  junto, não fechava com Escape, e ao fechar o foco voltava para o início da
  página em vez da miniatura. Os três estão corrigidos e verificados no
  navegador.

Seis mutações confirmaram que o portão morde: clarear um neutro, trocar o
violeta do tema escuro pelo do claro, remover um `alt`, remover o anel de foco,
remover o atalho e pendurar `onClick` numa `div`. As seis reprovaram.

O que ele **não** faz: não substitui teste com leitor de tela nem com pessoa
real. Ele calcula contraste sobre tokens, não sobre pixels renderizados, então
não vê texto sobre imagem nem sobreposição acidental. Substitui a lembrança de
um revisor, que era o que sustentava as regras antes.

## O aplicativo de campo passou a ter os mesmos portões

Os dois portões acima varriam `apps/web/src` e mais nada. O aplicativo não
tinha nenhum, e a diferença não era teórica: a tela de vistoria apagava
fotografia por um botão de 32 pontos, vinte abaixo da régua de 52 que o próprio
`apps/campo/src/ui/tokens.ts` declara, e a barra de abas escrevia `#000000` e
`#FFFFFF` à mão. As mesmas linhas, no painel, reprovariam.

Pior que isso, `tokens.ts` prometia por escrito um portão que ninguém tinha
escrito: dizia que os valores eram cópia de `apps/web/src/estilos/tokens.css` e
que "um teste reprova se divergirem". Promessa de portão é mais perigosa que
portão nenhum, porque quem lê para de conferir à mão.

Os três portões da tabela moram em `scripts/`, ao lado de
`entitlements-do-ios.test.mjs` e de outros portões do aplicativo
(`portao-densidade-do-aplicativo`, `portao-do-mapa-do-aplicativo`,
`portao-sem-promessa-de-segundo-plano-do-aplicativo`), e não dentro de
`apps/campo`. A razão é de ambiente: o pacote do aplicativo roda em `jest-expo`, que não tem os tipos de
Node, então varredura de arquivo lá dentro significaria empurrar `node:fs` e
`__dirname` para um pacote que não os tem. `npm run test:scripts` já os roda,
e ele está dentro de `npm run verificar`.

| Portão | O que ele cobra |
| --- | --- |
| `portao-design-do-aplicativo` | Cor, raio, duração, peso de fonte e sombra fora de token reprovam, e `Alert.alert` também, com escape nomeado que declara quantas linhas dispensa |
| `portao-acessibilidade-do-aplicativo` | Contraste AA calculado par a par nos dois temas, alvo de toque abaixo de 52 e tocável que o leitor de tela não sabe anunciar |
| `paridade-de-tokens-do-aplicativo` | A paridade prometida: primitiva é igualdade nos dois sentidos, semântico é igualdade por par mapeado, e onde as escalas divergem a divergência é declarada com razão |

Duas coisas valem registro, porque são o que separa portão de decoração.

A primeira é que a varredura apaga COMENTÁRIO antes de medir, e procura o
marcador de exceção na fonte com comentário. Metade dos arquivos do aplicativo
tem parágrafos contando o defeito que a linha abaixo conserta, e vários citam
`Alert.alert` e cores em hexadecimal pelo nome. Portão que pune quem explica
ensina a apagar a explicação.

A segunda é que toda exceção e toda pendência **sabem morrer**. A dispensa de
peso de fonte valia enquanto não existisse token de peso, e um caso reprova no
dia em que ele passar a existir. A pendência de contraste da borda de controle
(era 1.30:1 no claro e 1.33:1 no escuro, contra os 3:1 da WCAG 1.4.11) fechou:
hoje `PENDENTES` em `scripts/portao-acessibilidade-do-aplicativo.test.mjs` está
vazio e os dois pares da borda passam. O mecanismo continua: a pendência que
voltar a entrar na lista aparece na saída da execução e some obrigatoriamente
quando o número passar. Exceção temporária que ninguém poda é exceção
permanente.

A rodada de mutação reintroduziu cada defeito e viu cada portão morder com
mensagem precisa: alvo de 32, rótulo removido, os sete literais de design de
uma vez, primitiva fora por um dígito, primitiva que só existe de um lado,
neutro do tema escuro escurecido, e as duas declarações de dívida consertadas
por baixo.

## Quem manda em quem

`CLAUDE.md` divide o trabalho por papel, e a tabela de permissões diz o que
cada um FAZ. Faltava dizer quem manda em quem, e a ausência tinha uma
consequência concreta: **as listas de `coordenador` e `administrador` eram
idênticas item por item.** Eram dois nomes para a mesma coisa, ninguém era o
teto do município, e qualquer um desfazia o que o outro fez.

O posto resolve isso em `packages/shared/src/permissoes.ts`. Número maior manda
mais, e dele decorre uma regra só: **ninguém administra conta de posto acima do
seu, nem concede papel de posto acima do seu.**

| Papel | Posto | O que isso significa |
| --- | --- | --- |
| Agente de campo | 1 | Registra vistoria. Não administra ninguém. |
| Operador de plantão | 1 | Registra chamado e responde providência. Não administra ninguém. |
| Coordenador | 2 | Manda no fluxo operacional inteiro e administra equipes e usuários **abaixo dele**. |
| Administrador | 3 | Teto do município. Tudo o que o coordenador faz, mais alterar os dados do órgão, e é o único que administra outro administrador. |

O que a regra impede, imposto pelo servidor e não pela tela:

- o coordenador não cria administrador;
- o coordenador não desativa administrador;
- o coordenador não se promove a administrador pela edição;
- **o município não fica sem administrador ativo**, nem por desativação nem por
  rebaixamento (a conferência é por contagem sem trava: dois administradores, um
  desativando ou rebaixando o outro no mesmo instante, ainda podem furá-la, ver `apps/api/PENDENCIAS.md`).

A última merece explicação, porque parecia coberta e não estava. Existia a
regra de não desativar a própria conta, e ela dava a impressão de garantir o
resto. Não dava: nada impedia o penúltimo administrador de desativar o último.
O município ficaria sem ninguém capaz de criar usuário, e a única saída seria
SQL na mão no banco de produção.

### Acima do administrador não existe papel

Um usuário que enxergasse todos os municípios contradiria o isolamento, que é a
regra número um daqui: bastaria um token vazado para alcançar todas as
prefeituras de uma vez. Por isso **provisionar município é ato de operador da
plataforma**, e não de papel do município. Ele tem dois caminhos: a tela do
console do fornecedor (`POST /prefeituras`, pela função `provisionar_municipio`
da migração 036, sem a credencial de dono; ver "O console do fornecedor"), e a
linha de comando com a credencial de dono do banco, a mesma que aplica
migração:

```bash
DATABASE_URL=postgres://... npm run provisionar --   --municipio "Serra Alta" --uf MG   --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br   --operador "Seu nome, operação da plataforma"
```

Ele cria a organização e o primeiro administrador, sorteia a senha inicial e a
imprime uma única vez. Recusa provisionar o mesmo município duas vezes, porque
o segundo enxergaria zero dados do primeiro e o sintoma seria "o sistema perdeu
tudo", com tudo intacto do lado errado da parede.

Antes disso não havia porta nenhuma: `organizacoes` só era populada pela
semente de desenvolvimento ou por INSERT manual. Na prática o poder máximo do
produto era quem tinha a `DATABASE_URL`, e isso não estava escrito em lugar
nenhum.

## O agente de campo tem a tela dele

O agente entrava no sistema e caía no painel do coordenador: a fila do
município inteiro, o mapa da cidade, a tabela de todas as ocorrências. **Nenhuma
ação disponível**, porque o papel dele não tria, não despacha, não encaminha e
não encerra. Ele via tudo o que não é da conta dele e nada do que é.

`/meu-trabalho` responde as três perguntas que ele faz, na ordem em que faz:

1. **O que é meu agora?** As ocorrências despachadas para a equipe dele, prazo
   correndo, mais urgente primeiro.
2. **O que eu já terminei?** As vistorias que ele assinou, com as duas marcas de
   tempo, que é onde aparece o que foi coletado sem sinal.
3. **Quem é a minha equipe?** Nome, especialidade e colegas.

E a tela diz, em destaque, o que seria desastroso deixar implícito: **este
painel precisa de conexão.** O trabalho sem sinal é o do aplicativo de campo,
que guarda no aparelho e envia sozinho quando o sinal volta, com o aplicativo
aberto (não há envio em segundo plano). Um agente que
descobrisse isso no barranco perderia a vistoria inteira.

O menu dele também mudou: começa em "Meu trabalho" e não oferece painel nem a
tabela do município, pelo mesmo princípio de menor privilégio do resto do
sistema. E as telas de administração passaram a recusar pela rota, com uma
frase que diz o que fazer, em vez de mostrar o formulário inteiro e negar só no
envio.

## O agente que sobe o morro sozinho

> **Estado em 07/10/2026: recurso em construção, pela metade, e a metade que falta é a do agente.** A
> API (`apps/api/src/rotas/saida-a-campo.ts`, prefixo `/saida-a-campo`) e a tela
> da coordenação (`apps/web/src/paginas/QuemEstaEmCampo.tsx`) estão prontas e
> testadas. O aplicativo de campo **não chama** declarar, prorrogar, retorno nem
> `/minha`: só lê, na lista da equipe, se um colega tem saída aberta. Na prática
> nenhuma saída é declarada, a tela "Quem está em campo" fica vazia e nenhum
> prazo estourado aparece. A parte do aplicativo está planejada na V2-F14-E01,
> sem data. Tudo o que esta seção diz sobre o agente declarar é o desenho, não
> o que o aplicativo faz hoje (V2-F00-E24, decisão CP-02).

O vocabulário deste produto reconhece, por escrito e desde a migração 028, que o
agente entra em lugar que oferece risco à integridade física dele:
`risco_para_a_equipe` é um dos seis motivos de devolução de tarefa. E não havia
uma única linha de código para o caso de ele ter entrado. Era a maior distância
entre o que o produto SABE e o que ele FAZ.

**A pergunta que decidiu o desenho não é técnica: o que acontece quando ninguém
responde?** Um botão de apoio que aciona alguém que não existe é pior do que
botão nenhum, porque cria expectativa de socorro e a pessoa muda o comportamento
dela contando com uma resposta que não vem.

Então o produto promete só o que cumpre. No desenho (o servidor já cumpre a sua
parte, o aplicativo ainda não), o agente declara, **antes de subir e com
sinal**, para onde vai, em quanto tempo volta e se vai **sozinho**. O prazo é
carimbado pelo relógio do SERVIDOR. Se o retorno não for confirmado, a saída
aparece como prazo estourado na tela de quem coordena e no sino, e o que a
coordenação fez a respeito entra na trilha, com nome e hora.

E ele diz em voz alta, na tela e em `docs/SEGURANCA-DO-AGENTE.md`, o que não faz:
não é botão de pânico, não detecta queda, não sabe onde a pessoa está agora, não
aciona ninguém sozinho, e não avisa quem não estiver com o painel aberto.

### A assimetria que explica o resto

**O aparelho sem sinal não consegue pedir socorro**, e nenhum software muda isso.
A parte que funciona de verdade é a que acontece ANTES, na base, com sinal. Por
isso declarar a saída **não entra na fila de sincronização**, ao contrário de
tudo o mais que o aplicativo manda: a fila existe para não perder trabalho já
feito, e aqui não há trabalho a perder, há um aviso a entregar. Aviso guardado no
aparelho é aviso que ninguém recebeu, e ele daria ao agente a sensação de estar
coberto exatamente quando ele não está.

Confirmar o retorno exige sinal pela mesma razão, e o efeito parece defeito e é a
definição: **você voltou quando o sistema soube que você voltou.**

### Três decisões que separam isto de um alarme decorativo

| Peça | Decisão | Por quê |
| --- | --- | --- |
| O canal | O sino, e não push | O push sai de um relógio sem ninguém logado, e relógio sem contexto de município precisa de função `SECURITY DEFINER`. O teto é de 27 funções e hoje está cheio (27 de 27, contadas no catálogo depois de aplicar as migrações: 50 em 2026-10-15 e 51 em 2026-10-19, a 051 não acrescenta função privilegiada): o portão CA-06 (`db/test/isolamento.test.ts`) reprova a vigésima oitava. Cada subida do teto tem a razão escrita no próprio teste, e a mais recente foi justamente `varrer_tarefas_novas` (migração 042), que também é função de relógio. Não há vaga para gastar com um canal que o sino já cobre. O custo (só avisa quem está com o painel aberto) está escrito no guia, não disfarçado |
| Prorrogar | Existe, e é contado | Sem isso, todo serviço que demora mais que o previsto vira alarme falso, e alarme falso repetido é o único jeito conhecido de matar o recurso: a coordenação aprende a ignorar a tela. O novo prazo conta a partir de AGORA, senão uma saída vencida há duas horas continuaria vencida depois de prorrogada |
| "O agente confirmou o retorno" | A coordenação **não** consegue marcar isso | Quem diz "voltei" é quem voltou. Se ela pudesse, a linha afirmaria que o agente confirmou quando outra pessoa decidiu por ele, e é essa a linha que alguém vai ler depois de um acidente |

A palavra da tela é **"prazo estourado"**, nunca "em perigo": o produto sabe que
ninguém teve notícia dele desde o prazo, e não sabe se é um talude cedendo ou uma
bateria acabada. Afirmar perigo numa linha de prova seria afirmar o que ninguém
verificou.

## A superfície da API se defende sozinha

O erro que mais barato custa cometer e mais caro custa descobrir é banal:
alguém adiciona uma rota e esquece `exigirAutenticacao`. Nenhum teste de
funcionalidade pega isso, porque a rota funciona perfeitamente. Ela só funciona
para qualquer um.

`test/superficie.test.ts` lê a árvore de rotas **do servidor montado** e exige
token de todas. As exceções ficam numa lista curta, cada uma com a razão
escrita, e o teste reprova se uma isenção sobrar apontando para rota que já não
existe. É lista de exceções e não de regras de propósito: exceção alguém
revisa, regra alguém esquece.

Verificado adicionando uma rota sem autenticação de propósito: o teste a nomeia
na mensagem de falha.

## Autorização por papel

Quem pode o quê vive em `packages/shared/src/permissoes.ts`, e não numa
condicional de tela. A tela consulta a tabela para decidir o que desenhar; toda
função de escrita do repositório começa por `exigirPermissao`, porque esconder
um botão não impede nada de quem tem o console do navegador aberto. A
API importa a mesma função em vez de redescobrir a regra.

Esta tabela é conferida contra o código por
`packages/shared/test/permissoes-no-readme.test.ts`, que gera a tabela esperada
em memória a partir de `acoesDoPapel`, `ROTULO_ACAO` e `ROTULO_PAPEL` (o README
não é reescrito por script: quem altera as permissões cola a linha que a
mensagem de falha traz) e reprova se ela divergir do código: ação que falta, ação que sobra, papel sem linha, ordem trocada ou marcador
removido (a mensagem de falha traz a linha certa, para colar). Ela já mentiu antes
(a rodada 4 da validação achou `levantar_interdicao` fora dela, porque o teste
que esta frase prometia não existia): dizia que o administrador fazia "o
mesmo que o coordenador", o que deixou de ser verdade no dia em que o sistema
de postos entrou, e ninguém percebeu porque documentação não quebra build.

<!-- permissoes: gerado a partir de packages/shared/src/permissoes.ts -->

| Papel | Pode |
| --- | --- |
| Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |
| Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, consultar os ofícios de encaminhamento, acompanhar quem está em campo agora |
| Agente de campo | registrar vistoria |
| Administrador da organização | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |
| Usuário de órgão externo |  |

A última linha está vazia DE PROPÓSITO (V2-F03-E04, ADR 0009 decisão 5): o
`usuario_orgao` é o papel genérico de quem representa outro órgão no município,
com posto 1 e nenhuma ação de servidor. O que essa conta faz vem do vínculo com o
órgão e das ações do encaminhamento (F04), nunca desta tabela. Ela nasce só por
convite, nunca se converte de ou para papel de servidor (`PATCH /usuarios/:id`
responde 409 `papel_nao_se_converte`, e um gatilho do banco recusa o mesmo por
fora da API) e o login dela fica fechado até o G03 (responde credenciais
inválidas).

O administrador NÃO é um coordenador com outro nome. Ele é o único que altera
os dados do município, e o sistema de postos impede que qualquer pessoa
gerencie uma conta de posto acima do seu: coordenador não rebaixa
administrador, e ninguém se promove.

Consultar a trilha e exportar a base ficam com coordenação e administração: são
as ações que alcançam o município inteiro de uma vez. Emitir laudo e termo de
interdição entrou na mesma lista, e por motivo parecido: o documento reúne numa
página só o nome do solicitante, o endereço, a vulnerabilidade da família e todas
as fotos da casa (o contato não é impresso). Cada pedaço já circula em algum lugar; a concentração é que
muda a natureza da coisa.

O operador também registra a resposta de uma providência: é ele quem atende o
telefone quando a secretaria liga de volta. Continua sem decidir o fluxo.

**Ofício é leitura da coordenação e do plantão, e o agente de campo não a tem**
(`consultar_oficio`, V2-F00-E08). `GET /oficios` e `GET /oficios/:id` chamam
`exigirPermissao` antes de abrir transação: o agente recebe 403 `sem_permissao`,
igual para qualquer ofício, existindo ou não (a resposta não confirma nada). A
ficha do ofício traz o e-mail do órgão, as observações da coordenação e o IP de
quem abriu o link, e o aparelho do agente não usa ofício. Operador, coordenador
e administrador consultam; emitir continua sendo `emitir_documento` e enviar
continua sendo `encaminhar_providencia`. Ofício de outro município responde 404.

**O sino do agente é o da equipe dele.** `GET /avisos` aplica o mesmo recorte
das leituras de ocorrência (`recorte-do-agente.ts`) à lista e à contagem de não
lidos, e `POST /avisos/lidos` só marca o que o agente pode ver. Agente sem equipe
recebe lista vazia e contagem zero. Coordenação, operador e administração seguem
vendo o município inteiro. A rota continua ESCREVENDO dentro de um GET
(materializa prazos vencidos e saídas sem retorno, expurga avisos velhos), de
forma idempotente, em lote e só no município do token: ver `apps/api/PENDENCIAS.md`.

E ele **acompanha quem está em campo**, que é a única permissão concedida ao
posto mais baixo por uma razão que não é de fluxo. O valor inteiro daquele
recurso é alguém enxergar o prazo estourado, e quem está na sala às três da manhã
de uma noite de temporal é o operador de plantão. Restringir à coordenação seria
escolher a elegância da tabela contra a finalidade da coisa, e o custo do erro é
um agente no morro sem ninguém olhando.
Esse acompanhamento está em construção: a tela existe, mas o aplicativo do agente
ainda não declara a saída (V2-F14-E01, ver o quadro de estado da seção "O agente
que sobe o morro sozinho"), e por isso hoje ela fica vazia.

## Como rodar

Modo local, sem servidor nenhum:

```bash
cd dc360
npm install
npm run build --workspace @dc360/shared   # o app web importa o pacote compilado
npm run dev                               # painel em http://localhost:5173
```

Painel ligado à API, que é o caminho de produção:

```bash
# terminal 1
JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api

# terminal 2
VITE_API_URL=http://127.0.0.1:3333 npm run dev
```

Sem `DATABASE_URL`, a API sobe um Postgres em WebAssembly já semeado. A senha
de todas as contas de desenvolvimento é `defesa-civil-2026`.

Na primeira abertura o navegador baixa o Postgres em WebAssembly (cerca de
13 MB entre `.wasm` e `.data`) e semeia dois municípios fictícios, Serra Alta e
Vale Fundo. Isso leva alguns segundos. Depois disso o banco fica em IndexedDB e
a abertura é imediata.

Entre como **Helena Vasques Coutinho** (coordenadora de Serra Alta) para ver o
fluxo completo. Entre como **Aurélio Prates Machado** (Vale Fundo) para ver o
isolamento: nenhum protocolo, equipe ou usuário de Serra Alta aparece, e buscar
por um protocolo do outro município não devolve nada.

Para começar do zero no modo local, limpe o site nas ferramentas do navegador
(isso apaga o IndexedDB, onde o PGlite guarda o banco, e a marca da semente no
`localStorage`). No modo API, basta reiniciar o servidor: o banco efêmero
nasce semeado de novo.

## Como testar

A versão do Node é a 22. Os arquivos `.nvmrc` e `.node-version` a fixam (os dois
dizem `22`, para as ferramentas que leem um ou o outro), o CI e o `Dockerfile`
usam a mesma, e o campo `engines` do `package.json` pede `>=22 <23`. O npm só
avisa quando a versão não bate; quem roda outra major está fora do que foi medido. Há duas
árvores de dependência: a raiz (`dc360`) e `apps/campo`, que fica fora do
`workspaces` de propósito e tem lockfile próprio.

A ordem, do zero:

```bash
cd dc360
npm ci                          # raiz
(cd apps/campo && npm ci)       # aplicativo de campo, árvore própria
npm run typecheck               # compila shared, db e campo antes de checar os tipos
npm run test:isolamento         # o portão CA-06, rode este primeiro
npm run test:espacial           # PostGIS em Postgres real (só com DC360_POSTGRES_DE_PROVA; sem ele pula com aviso)
npm test                        # os demais testes de cada workspace
npm run test:scripts            # portões de design e de acessibilidade do aplicativo, entre outros
npm run test:campo              # tipos e testes do aplicativo de campo
npm run lint                    # ESLint nos dois lados (monorepo e aplicativo), baseline que só desce
npm run formato:conferir        # Prettier: o que já estava formatado continua, arquivo novo nasce formatado
npm run auditar                 # dependência vulnerável em runtime
npm run conferir:numeros        # os números que este README afirma contra a realidade
npm run test:e2e                # painel no navegador (precisa de Chromium e Firefox do Playwright)
npm run test:e2e:api            # painel contra a API
```

`npm run verificar` encadeia typecheck, `lint`, `lint:teto`, `formato:conferir`,
testes, `test:scripts`, `test:campo`, `auditar` e `conferir:numeros`. O CI roda esses passos em jobs separados
(`test:scripts` e `conferir:numeros` no job de testes, o `auditar` no job
`dependencias`, `test:campo` no job do aplicativo); a diferença é que o CI não
roda o `verificar` inteiro de uma vez, e sim cada passo no seu job. O CI chama
o portão do `auditar` direto pelo `node` (`node scripts/auditar.mjs`), e não
pelo `npm run`, para que nenhuma configuração do npm decida se ele roda; antes,
o job `dependencias` reprova se houver `.npmrc` versionado no repositório. O
job `windows` repete em `windows-latest` o `auditar` (também pelo `node`),
`test:scripts` e `conferir:numeros`.

**Portabilidade dos scripts.** `test:scripts` e `conferir:numeros` precisam
fechar verdes no Windows e no Linux (o job `windows` do CI os roda a cada
push), e os três casos que só reprovavam no
Windows ensinaram três regras para quem escrever um caso novo em `scripts/`:
chamar `npm` com `shell: process.platform === "win32"` (lá ele é `npm.cmd`, e
sem shell a chamada morre com ENOENT antes de rodar qualquer coisa); montar
caminho com `join` e `resolve` a partir da raiz da plataforma, e nunca com
texto POSIX literal, porque `resolve` transforma `/Users/x` em `C:\Users\x`; e
conferir uma decisão de configuração pelo que ela decide, e não pela escrita
literal de uma linha que pode mudar de forma sem mudar de sentido.

**Plataformas e o que depende da máquina (V2-F00-E21).** Três vermelhos que
eram da máquina, e não do código, foram fechados no próprio repositório:

- *Fim de linha.* O `.gitattributes` da raiz fixa LF no índice e no checkout
  para todo texto (`* text=auto eol=lf`), CRLF só para `.ps1`, `.bat` e `.cmd`, e marca imagem,
  fonte, PDF e dump como `binary`. Teste do painel que confere fonte lê com
  `apps/web/test/ler-fonte.ts`, que normaliza `\r\n`, porque árvore clonada
  antes do `.gitattributes` continua CRLF até ser renormalizada. Conferência:
  `git ls-files --eol` não pode mostrar nenhum `i/crlf`.
- *`OPENSSL_CONF`.* O instalador do driver ODBC do PostgreSQL no Windows deixa
  a variável apontando para um arquivo que não existe, e o `openssl req` de
  `apps/api/test/banco-tls.test.ts` caía. O gerador de certificado do teste
  (`apps/api/test/openssl-do-teste.ts`) tira a variável do ambiente do
  `openssl` só nesse caso e imprime o motivo; variável que aponta para arquivo
  existente é respeitada. O `openssl` vem do PATH; no Windows, quando o PATH
  não o tem (o caso do PowerShell), o teste o procura ao lado do `git` (Git for
  Windows). Sem `openssl` em lugar nenhum a suíte reprova dizendo o que
  instalar, em vez de pular. **No macOS o `openssl` do sistema é o LibreSSL**
  (3.3.6 medido em 2026-10-19), e o caso "respeita OPENSSL_CONF válido" de
  `apps/api/test/openssl-do-teste.test.ts` reprovava lá (medido em 2026-10-14):
  ele esperava que o autoassinado, sem a variável, saísse marcado como CA. Quem
  marca é o `openssl.cnf` padrão da máquina (`x509_extensions = v3_ca`), e não a
  família do `openssl`; o do macOS não manda, e com `v3_ca` o próprio LibreSSL
  marca. Foi uma falha do teste, não do produto (o produto não chama `openssl`;
  só a suíte de TLS do banco, para gerar o certificado do impostor). Consertado
  em 2026-10-19 (V-API-3 do registro da E03, seção 10): a asserção do `ca` sem
  configuração saiu, e a prova de que a configuração foi lida passou a ser um
  uso estendido de chave que ela pede (aparece com a variável válida, não
  aparece sem ela). O arquivo passa no LibreSSL do Mac e num OpenSSL 3.0.7
  osx-arm64. O caso do `OPENSSL_CONF` inexistente pressupõe que a instalação do
  `openssl` tenha o seu `openssl.cnf` padrão, como toda instalação normal tem.
- *Cache do Expo.* `npm run test:campo` apaga `apps/campo/.expo/types` quando o
  `router.d.ts` gerado ali não conhece alguma rota de `src/app` (ver
  `apps/campo/LEIA-ME.md`).

| Comando | Windows 11 com Git Bash (Node 22.17.0) | macOS (Node 24), 2026-10-14 | Linux |
| --- | --- | --- | --- |
| `npm run typecheck` | rodado em 2026-10-07, código 0 | código 0 (passo `typecheck` do roteiro) | CI, ver abaixo |
| `npm test` | rodado em 2026-10-07, código 0 | não rodado como comando único; cada pacote rodou no roteiro, ver a linha seguinte | CI, ver abaixo |
| `npm run test:api` (inclui `banco-tls`) | rodado em 2026-10-07, código 0, nenhum pulado; com e sem `OPENSSL_CONF` quebrado, no Git Bash e no PowerShell | 2026-10-14: código 1, 1 falha de ambiente (LibreSSL, ver "`OPENSSL_CONF`"); **2026-10-19, depois do conserto V-API-3: código 0**, nenhuma falha e 20 pulados por ambiente (o Postgres real, sem `DC360_POSTGRES_DE_PROVA`); depois das correções da E07 e da E10 do mesmo dia o total passou a 1485 casos (a E07 e a E10 e também a correção 3 da E09, que acrescentou 13), com 34 pulados pelo mesmo motivo e 0 falhas | CI, ver abaixo |
| `npm run test --workspace @dc360/web` | rodado em 2026-10-07, código 0, árvore CRLF | código 0 | CI, ver abaixo |
| `npm run test:campo` | rodado em 2026-10-07, código 0, com o cache velho presente e sem ele | código 0 | CI, ver abaixo |
| `npm run test:scripts` | rodado em 2026-10-07, código 0 | código 0, 260 de 260, 0 pulados (existe `apps/campo/ios/`) | CI, ver abaixo |
| `npm run test:isolamento` | rodado em 2026-10-07, código 0 | código 0 | CI, ver abaixo |

A coluna Linux ficou "não provado" até existir um run de verdade do CI, e agora
existe: o trabalho "Linha de base (baseline.mjs) em Linux" rodou o roteiro
inteiro (19 de 19 passos, código 0) no run 38445527075, do SHA `c9895e9`, que o
gatekeeper da V2-F00-E25 leu (`docs/evidencias-v2/G00/V2-F00-E25/VEREDITO.md`);
o mesmo run passou os demais trabalhos. Depois dele, o run 38618369218, do SHA
`7585801` (candidato `52952a1`, de 2026-10-15), repetiu o roteiro (19 de 19,
código 0) e fechou 9 de 9 trabalhos verdes, lido pelo gatekeeper em
`docs/evidencias-v2/G00/V2-F00-E22/VEREDITO.md`. Isso cobre o roteiro, não cada
comando da tabela um a um, e é anterior às correções 3 da E07 e da E12, à
correção 1 da E21 e à correção 1 da E25. Depois delas houve o run 39143791434
(2026-10-18, sobre o registro `ecaad76`, candidato `bb0f654`), 9 de 9 verdes
segundo o STATUS, que o gatekeeper da rodada 4 NÃO conseguiu ler (o `gh` estava
sem login); o run 39241470718 (2026-10-19, sobre o registro `766bc0a`,
candidato `4ce0433`), 9 de 9 verdes segundo o STATUS, com as correções de E03,
E05, E07, E09, E10, E15 e E25 posteriores ao anterior; o run 39366804765 (do
candidato `1ed0b71`, SHA do run `7644420`), cuja tentativa 1 o GitHub recusou
antes de começar, por faturamento (H32), e cuja tentativa 2 (2026-10-20, depois
de o repositório virar público) rodou 9 de 9 trabalhos verdes; e o run
39420436042 (2026-10-20, sobre o registro `55209ab`, candidato `fd17ff4`), 9 de
9 verdes, linha de base em Linux inclusive, lido pelo
gatekeeper da rodada 7 pela API pública do GitHub (`VEREDITO.md` da E22). As
correções posteriores a `fd17ff4` não estão nesse run; o run delas é o do
candidato seguinte, registrado no `VEREDITO.md` de cada etapa. A
coluna do macOS vem do roteiro rodado nesta máquina
(`docs/evidencias-v2/G00/V2-F00-E22/correcao-2/saidas/baseline/`). A evidência
da coluna do Windows está em `docs/evidencias-v2/G00/V2-F00-E21/`.

**O que prova Windows, e a condição hostil em Linux (correção 3 da E21).** A
coluna do Windows acima é a máquina do autor, e a validação não a aceita como
prova independente. Quem prova Windows no CI são dois jobs de
`.github/workflows/verificar.yml`, que rodam em push para `main`, `master` e
`v2/**` e em pull request: o `windows`, com o
`auditar`, `test:scripts` e `conferir:numeros` (ver "Portabilidade dos
scripts"), e o `plataformas`, para os três casos acima, em matriz
`windows-latest` e `ubuntu-24.04`, e publica o artefato
`plataformas-<sistema>-<sha>`. Ele faz o checkout com `core.autocrlf=true` e
roda os três casos sob a condição hostil de verdade, cada um depois de um
controle que reprova o job se a condição não se reproduzir: (1) `git ls-files
--eol` sem `i/crlf` e com CRLF no disco só onde o `.gitattributes` pede, depois
`apps/web/src` e `apps/web/test` gravados em CRLF (a árvore de antes do
`.gitattributes`) e a suíte do painel inteira sobre eles; (2) `OPENSSL_CONF`
apontando para o arquivo inexistente do driver ODBC, com o `openssl` cru
reprovando antes e `banco-tls.test.ts` mais `openssl-do-teste.test.ts` verdes
depois, no bash (Git Bash, no Windows) e, só no Windows, também no Windows
PowerShell 5.1; (3) o `router.d.ts` velho de `scripts/fixtures/router.d.ts.velho`
em `apps/campo/.expo/types`, com o `tsc` direto dando TS2345, o
`npm run test:campo` apagando o cache e passando, e o typecheck sem cache em
zero. Roda também o conferidor de índices de evidência sobre esse checkout. A
montagem e o controle das condições ficam em `scripts/ambiente-hostil.mjs`. O
`npm run verificar` inteiro no Windows continua sendo validação humana.

Os números de teste que este README e `docs/COLOCAR-DE-PE.md` afirmam mudam
sempre que uma etapa acrescenta caso, e `conferir:numeros` volta a reprovar
até alguém corrigir o texto. Isso é de propósito: o número velho é mentira
pequena, e o portão existe para ela não passar calada. Quem acrescenta teste
roda `conferir:numeros` antes de encerrar. A saída também lista os pulos que
`vitest list` não enumera (`describe.skip`, `it.skip`, e `runIf` ou `skipIf`
que avaliou falso), para a diferença entre a contagem afirmada e o total do
`vitest run` ter origem visível.

**Contrato mínimo painel x API (V2-F00-E23).** `apps/api/test/contrato-do-painel.test.ts`
lê `apps/web/src/dados/http.ts` como texto, tira de cada `chamar(` e `fetch(` o
método e o caminho (interpolação vira parâmetro, query sai) e exige que
`MÉTODO caminho` exista entre as rotas do servidor montado, lidas por
`printRoutes` com a mesma leitura de `superficie.test.ts`
(`apps/api/test/superficie-registrada.ts`), e não de uma lista copiada. Uma
âncora conta as chamadas por expressão regular e reprova se o extrator ler
menos do que contou, e os casos sintéticos provam que `POST /pacote.zip` (o
defeito da E11), método errado e parâmetro faltando reprovam. É a versão
mínima: só o painel e só a existência da rota. A V2-F02-E05 a generalizou (ver o
parágrafo seguinte); este arquivo segue valendo para o painel contra as rotas
com e sem `/v1`.

**Contrato cliente x rota (V2-F02-E05).** `apps/api/test/contrato-cliente-rota.test.ts`
faz o mesmo para os três clientes: o painel (`apps/web/src/dados/http.ts`), o
aplicativo de campo (`apps/campo/src/dados/api.ts`, `rota.ts`, `mapa.ts`,
`historico-da-casa.ts` e a fila offline `packages/campo/src/transporte.ts`) e o
console (o script que o próprio console serve, contra as rotas de
`apps/console/src/servidor.ts`). Lê cada cliente como texto, tira o método e o
caminho de cada chamada e confronta com as rotas `/v1` do servidor montado
(`apps/api/test/apoio/rotas.ts`, a mesma leitura de `superficie.test.ts`). Exige
que o caminho exista, que o método bata, que o corpo e a consulta casem com o
esquema do registro do contrato (`apps/api/src/contrato/`) quando o texto os
mostra, que pedido sem token mire só rota isenta, e que todo `fetch` passe por
`chamar` ou pela base: `fetch` solto reprova, salvo as duas URLs assinadas
declaradas. O que não dá para ler estaticamente (corpo que vem de variável,
consulta montada em tempo de execução) fica declarado no relatório, e as rotas
`/v1` sem cliente saem nele sem reprovar. Roda no job `produto` do CI por
`npm run test:api`. Com `RELATORIO_CONTRATO_CLIENTE_ROTA=<arquivo>` o relatório
é gravado (é assim que a evidência da etapa nasce). Limites em
`apps/api/PENDENCIAS.md`.

**O roteiro da linha de base.** Em 2026-09-30 a linha de base era vermelha de
propósito (a medição original segue arquivada em `docs/auditoria-v2/`), e a
fase F00 do Roadmap V2 (`docs/roadmap-v2/03-fase-00-estabilizacao.md`) a
consertou. Desde a correção 1 da V2-F00-E01, o roteiro espera o que a árvore
verde produz hoje. Para repetir a medição e arquivar a saída, sem segredo, em
qualquer máquina:

```bash
node scripts/baseline.mjs --so-listar   # mostra o roteiro, sem executar nada
node scripts/baseline.mjs               # roda tudo e arquiva em docs/evidencias-v2/G00/V2-F00-E01/saidas
```

Cada passo diz se o resultado "confere", se está "divergente-explicada" (um
achado nomeado, com o registro onde está descrito, e que só vale quando a saída
bate com a descrição inteira) ou "divergente" (sem explicação). O código de
saída é 0 (tudo confere), 1 (só divergência explicada) ou 3 (divergência sem
explicação, que reprova); 2 é o roteiro quebrado. Nenhum passo carrega hoje
uma divergência explicada. Na árvore validada de `4b96ea7` o roteiro conferiu
todos os passos com código 0 (17 de 17 com `--sem-instalar` no Windows, 19 de 19
no Linux do CI; o roteiro de hoje tem 20 passos, 18 sem instalar, porque a
correção 4 da E03 acrescentou o `e2e-firefox`; o run 39420436042, do candidato `fd17ff4`, lido pelo gatekeeper da rodada 7, rodou o roteiro de 20 passos com o job verde), e a deriva V-DEP-4 do `expo-doctor` foi fechada em 2026-10-13,
com a atualização dos patches do Expo. **Medido em 2026-10-14 num Mac (Node 24,
`--sem-instalar`): 15 de 17**, e as duas divergências são de ambiente, nenhuma
de teste de produto: `teste-api` (a falha do LibreSSL descrita acima, com 1319
casos impressos, 9 deles pulados por ambiente porque o bloco de Postgres real
só roda com `DC360_POSTGRES_DE_PROVA`) e `test-scripts` (existe `apps/campo/ios/`,
saída do `expo prebuild` desta máquina, então os casos que pulam sem ela
rodam e passam: 0 pulados contra 4 esperados). O `expo-doctor` deu 20 de 21 na
manhã desse dia (cinco patches novos do Expo) e **21 de 21 depois da correção 4
da E19**, no mesmo dia; a medição de 15 de 17 é a da árvore final, com ele já
verde (premissa e limites no item 17 de `apps/campo/PENDENCIAS.md`). As saídas
estão em `docs/evidencias-v2/G00/V2-F00-E22/correcao-2/` (medição da manhã, 14 de
17) e em `docs/evidencias-v2/G00/V2-F00-E19/correcao-4/saidas/linha-de-base-final/`
(árvore final, 15 de 17, com as 17 saídas brutas).
Desde 2026-10-19 o passo `teste-api` deixou de divergir num Mac: a falha do
LibreSSL era do teste e foi consertada (V-API-3, seção 10 do registro da E03).
A divergência de `teste-api` descrita acima é, portanto, a de 2026-10-14.
Os dois `npm audit` crus são os únicos passos esperados como "falha", e só
conferem se a saída trouxer o relatório (`# npm audit report`): `npm audit` que
sai diferente de zero porque o registro estava fora do ar não audita nada e
diverge. O total de casos que o roteiro espera de
cada suíte é conferido contra a árvore por `npm run conferir:numeros`:
acrescentar teste sem declarar a diferença em `scripts/baseline.mjs` reprova ali.
O passo a passo para uma segunda pessoa está em
`docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md`.

**Teste pulado tem regra (política T42).** Nenhum vermelho conhecido fica na base
sem saída: ou se conserta, ou se reescreve com registro, ou se pula com dono,
prazo e referência. Pular por ambiente (`it.runIf`, `skip` com condição e
motivo) é permitido e contado; pular de forma incondicional (`skip`, `xit`,
`todo`) exige a marca `// T42 dono=<nome> issue=<ref> ate=AAAA-MM-DD` na linha
acima, e `.only` nunca passa. O portão
`scripts/portao-de-skip.test.mjs` aplica isso dentro de `npm run test:scripts`
e imprime a contagem de skips por ambiente. A política inteira está em
`docs/POLITICA-DE-TESTE-VERMELHO.md`.

### Lint e formatação (V2-F01-E17)

O código nasceu sem ESLint nem Prettier. Ligar a régua e corrigir tudo de uma
vez geraria um diff que conflita com qualquer outra mudança, então os achados de
hoje ficam numa **baseline que só desce**, e o portão reprova o que é novo.

- **ESLint 9 com tipos** (`eslint.config.mjs`, regras em `eslint.base.mjs`):
  `no-floating-promises`, `no-misused-promises`, `await-thenable`,
  `react-hooks/exhaustive-deps`, `eval`, `new Function`, `any` explícito.
  Tudo é `error`. O aplicativo de campo tem configuração e baseline próprias
  (`apps/campo/eslint.config.mjs`), mas o ESLint e os plugins vêm da raiz: o
  lockfile do Expo não ganha dependência de lint. `npm run lint` roda os dois
  lados e reprova se `apps/campo/node_modules` não existir (sem ele o lint com
  tipos não mede nada). `npm run lint:campo` roda só o aplicativo.
- **Baseline do lint**: `eslint-suppressions.json` (monorepo) e
  `apps/campo/eslint-suppressions.json` (aplicativo), gerados por
  `eslint --suppress-all`. Achado novo reprova; supressão que já não é
  necessária também reprova (rode `npm run lint:podar`). Quem corrige um achado
  antigo tem de podar a baseline no mesmo PR.
- **Teto**: `lint-teto.json` é exatamente a soma das duas baselines
  (`npm run lint:teto`; folga ou falta reprova). Em pull request,
  `node scripts/lint-teto.mjs contra-base <sha-da-base>` reprova se o total, a
  contagem de uma regra, uma regra nova ou um arquivo na baseline de formatação
  subiu em relação ao ramo-base. Isso fecha o buraco que o ESLint sozinho deixa:
  regenerar a baseline com `--suppress-all` depois de introduzir um defeito.
  Depois de baixar a baseline: `node scripts/lint-teto.mjs atualizar` (recusa
  gravar se algo subiu).
- **Prettier** (`.prettierrc.json`, `.prettierignore`): `npm run formato:conferir`
  olha os arquivos versionados de código (`ts`, `tsx`, `js`, `mjs`, `cjs`,
  `css`). O que já estava mal formatado quando a etapa ligou o portão está em
  `formato-baseline.json` (só desce); todo o resto precisa estar formatado, e
  arquivo novo nasce formatado (`node scripts/formato-conferir.mjs --formatar`
  formata os que não estão na baseline). Formatar um arquivo da baseline obriga
  a tirá-lo dela (`--podar`). Reformatar tudo é UM PR à parte, cujo commit
  entra em `.git-blame-ignore-revs`.
- Comando para o git ignorar esse commit no `blame`, uma vez por clone:
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Implantação

### O primeiro município, do zero

Na ordem, e nenhum passo é opcional:

```bash
# 0. Papeis do banco. Provado contra PostgreSQL 18 real; sem isto a API sobe e
#    o login responde "credenciais invalidas" sem erro no log, e o diagnostico
#    leva horas. Sao TRES competencias, e a aplicacao usa a terceira:
#
#    - QUEM MIGRA E DONO DAS FUNCOES DE AUTENTICACAO: precisa de CREATEROLE (a
#      migracao 001 cria o papel dc360_app) e de BYPASSRLS. O BYPASSRLS nao e
#      luxo: credenciais_para_login e sessao_por_token sao SECURITY DEFINER e
#      rodam como o dono; a autenticacao e cross-tenant por natureza (nao se
#      sabe a organizacao antes de autenticar), e com RLS FORCADA o dono
#      tambem e filtrado pelas policies. Sem BYPASSRLS a funcao de login
#      devolve zero linhas.
#    - QUEM SERVE (a aplicacao): um login proprio, membro de dc360_app COM SET,
#      sem superusuario, sem BYPASSRLS, nao dono. E este que vai na DATABASE_URL
#      da API.
#
#    Em Postgres gerenciado (Neon, Supabase, RDS) o papel administrativo que o
#    provedor entrega ja tem CREATEROLE e BYPASSRLS: use-o como dono/setup.
#
#    CREATE ROLE dc360_setup LOGIN PASSWORD '...' CREATEROLE BYPASSRLS NOSUPERUSER;
#    CREATE ROLE dc360_api   LOGIN PASSWORD '...' NOSUPERUSER;
#    -- como dono do banco/schema (ou como o administrador do provedor):
#    ALTER SCHEMA public OWNER TO dc360_setup;
#    -- A migracao 041 cria a extensao pg_trgm. Ela e extensao confiavel, mas
#    -- "confiavel" exige o privilegio CREATE no BANCO, e um banco criado por
#    -- outro papel nao o da ao dc360_setup: sem esta linha a 041 para com
#    -- `permission denied to create extension "pg_trgm"`. Em Postgres
#    -- gerenciado o banco ja existe e o dono nao se troca, entao e conceder:
#    GRANT CREATE ON DATABASE dc360 TO dc360_setup;
#    -- depois de migrar (passo 2), o papel dc360_app ja existe:
#    GRANT dc360_app TO dc360_api WITH SET TRUE;

# 1. Ambiente. O modelo lista tudo, diz o que é obrigatório em produção e por quê.
cp apps/api/.env.example apps/api/.env && $EDITOR apps/api/.env

# 2. Esquema, com o papel de SETUP (CREATEROLE + BYPASSRLS).
DATABASE_URL=postgres://dc360_setup:...@host/dc360 npm run migrar

# 3. O município e o primeiro administrador, com o papel de SETUP (o provisionar
#    insere em organizacoes, que so o BYPASSRLS alcanca). Anote a senha que ele
#    imprime: ela não é guardada em texto claro e não aparece de novo.
DATABASE_URL=postgres://dc360_setup:...@host/dc360 npm run provisionar --   --municipio "Serra Alta" --uf MG   --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br   --operador "Seu nome, operação da plataforma"

# 4. Suba a API e o painel. A DATABASE_URL da API e a do papel de APLICACAO
#    (dc360_api), nunca a do setup: a API nao pode ter CREATEROLE nem BYPASSRLS.
#    E ela PRECISA terminar em ?sslmode=verify-full: a URL que o painel do
#    provedor oferece nao traz esse parametro, e sem ele a conexao com o banco
#    sobe cifrada e NAO autenticada, com a base de todos os municipios exposta
#    para leitura e escrita a quem estiver no meio do caminho. A ancora de
#    confianca ja vem versionada em db/provedores/, entao nao ha mais nada a
#    configurar, e a partida em producao recusa subir sem o parametro.
#    DATABASE_URL=postgres://dc360_api:...@host/dc360?sslmode=verify-full
```

O que a pessoa faz na primeira entrada, e é o passo que se esquece: abrir
**Minha conta**, pelo nome dela no topo do painel, e trocar a senha ditada por
telefone. A troca derruba as outras sessões e não depende de email (o cliente de
email existe, mas está desligado em produção até o CP-19).

A partir daí o administrador cria o resto do município pela tela de usuários.
Ele é o teto: ninguém acima dele existe como papel, e provisionar outro
município é de novo linha de comando, com a credencial de dono do banco. Ver
"Quem manda em quem".

### Aplicar migrações

```bash
DATABASE_URL=postgres://... npm run migrar             # aplica o que falta
DATABASE_URL=postgres://... npm run migrar -- --conferir  # só diz o que falta
```

O aplicador garante quatro coisas, e cada uma corresponde a um jeito de o
deploy quebrar:

| Garantia | O que ela evita |
| --- | --- |
| Cada migração roda uma vez | O segundo deploy tentando criar tabela que já existe |
| Sempre na ordem do nome | Uma migração alterando tabela que a seguinte ainda vai criar |
| Uma transação por migração | Esquema meio aplicado, num estado que ninguém sabe descrever |
| Histórico não se reescreve | Banco de produção divergindo em silêncio do repositório |

A última merece detalhe: se o conteúdo de uma migração já aplicada mudar, o
aplicador **para**. Editar uma migração que já rodou em produção significa que
o banco de lá e o daqui divergiram, e seguir em frente esconderia isso até uma
consulta falhar sem explicação. Reindentar não conta: o hash normaliza espaço
em branco, porque clonar o repositório no Windows troca LF por CRLF sozinho e
travar o deploy por isso seria alarme falso diário.

### A API recusa subir com esquema atrasado

Um processo servindo requisição contra um banco sem a coluna que o código
espera falha de um jeito difícil de diagnosticar: erro de SQL no meio de uma
rota, em produção, com o usuário na frente. O boot confere e sai com erro.
`GET /saude` reporta a última migração aplicada, para o balanceador saber se o
processo está pronto.

Migrar é passo **separado** do deploy, de propósito: dois contêineres subindo
juntos não podem migrar em paralelo.

### Contêiner

`Dockerfile` (a imagem da API), `Dockerfile.console` (a do console), `fly.toml`,
`fly.console.toml` e `compose.yaml` estão no repositório. O `Dockerfile` é a
imagem de produção: o `fly.toml` (`[build] dockerfile`) manda o `fly deploy`
construí-lo, e o próprio `Dockerfile` registra o 503 dos PDFs que a imagem deu em
produção: o Chromium estava nela, mas o pacote `playwright` não, porque estava
em `devDependencies` e a etapa `--omit=dev` não o instalava. O que não existe é prova arquivada: o CI não constrói
a imagem (o trabalho `implantavel` sobe a API direto no Node) e não há log de
build no repositório. Não há registro de execução do `compose.yaml`. Ver a
Parte 3 (item 3, "Servidor da API") de `docs/COLOCAR-DE-PE.md`.

## Como testar

```bash
npm test                    # 4951 testes em seis pacotes
npm run test:isolamento     # portão CA-06 e o aplicador de migrações: 718 testes do banco
npm run test:api            # 2312 testes da API
npm run test --workspace @dc360/campo   # 283 testes do motor de campo
npm run test:campo          # tipos e os 2023 testes do aplicativo de campo
npm run typecheck           # TypeScript estrito em todos os pacotes
npm run auditar             # runtime em zero; exceções do aplicativo nomeadas (CP-03)
```

**A política do `npm audit` (CP-03, decidido por Rafael em 2026-10-07).**
Dependência de execução com vulnerabilidade reprova, na raiz e no aplicativo
de campo (`npm run auditar`, que também roda no Windows; no CI, o job
`windows` o chama a cada push para `main`, `master` e `v2/**` e em pull request,
como `node scripts/auditar.mjs`). Na raiz,
o que sobra é só de desenvolvimento (`vitest`, `@vitest/mocker` e `tinypool`, que
pedem salto de versão maior) e aparece como aviso. No aplicativo, os avisos que chegam por
dentro do Expo (`brace-expansion`, `node-forge`, `shell-quote`,
`decode-uri-component` e a cópia do `zod` 3 que o `@expo/cli` carrega) estão em
`ACEITAS_NO_APLICATIVO`, cada um com motivo, dono e prazo de 2027-01-05; depois
do prazo o portão reprova até alguém reavaliar. (`braces` e `sprintf-js` saíram
da lista em 2026-10-24: o registro retirou as duas advisories.) A exceção do
`zod` tem `somenteEm: ["node_modules/expo/node_modules/"]`: ela só vale para a
cópia que o Expo carrega por dentro. O `zod` do próprio produto está na linha
4 (4.6.7, corrige a GHSA-mrhx-c7xc-m3w5, que na linha 3 não tem correção) e, se
voltasse a uma versão vulnerável, o portão reprovaria. O `npm audit fix` no aplicativo foi descartado porque
reembaralha a árvore do Expo; a saída definitiva é subir o SDK por inteiro, o
que exige novo binário nativo. `npm audit` puro continua listando esses avisos:
quem quer a resposta do portão roda `npm run auditar`. O portão nunca aprova sem
ter auditado: se o registro de avisos estiver fora do ar, ou o `npm audit`
devolver erro ou relatório sem contagem, na raiz ou no aplicativo, ele sai com
código 2 e diz em português que NÃO auditou (código 1 é "auditei e achei").

Antes de auditar, o portão confere a configuração do npm: lê o que o próprio npm
diz que carregou (`npm config list`: o npmrc embutido, o global, o do usuário, o
do projeto e as `npm_config_*` do ambiente), o `.npmrc` da raiz e o do aplicativo
direto do disco, e as `npm_config_*` do ambiente, e só aceita as chaves de
`CHAVES_PERMITIDAS` (`scripts/auditar-excecoes.mjs`): as que só mexem no terminal
(`loglevel`, `color`, `progress`, `fund`, `update-notifier`), as pastas `cache`
e `prefix`, a credencial do registro oficial, e as que toda chamada anula na
linha de comando, que vence configuração (`registry`, `offline`,
`prefer-offline`, `prefer-online`, `dry-run`, `package-lock`,
`package-lock-only`, `audit-level`, `json`). Qualquer outra chave, venha de onde
vier, faz o portão sair 2 com o nome dela e o arquivo de origem: a rodada 7 achou
`package-lock=false` num `.npmrc`, que faz o npm auditar a árvore ideal das
faixas do `package.json` em vez do lockfile, e o portão aprovava um lockfile com
runtime vulnerável. Por isso toda chamada passa `--package-lock=true`, e as
consultas reais `--package-lock-only=false`. As variáveis que o `npm run` exporta
para o script (`cache`, `prefix`, `userconfig`, `globalconfig`, `local-prefix` e
afins) e as de workspace saem do ambiente das chamadas. O escopo também não
depende de onde o comando é dado: as consultas da raiz rodam sempre NA raiz (e a
do aplicativo no aplicativo), e o npm tem de confirmar a pasta (`npm local
prefix`, comparado também com a máscara `***` que o npm 11 põe em trecho de
caminho com cara de UUID). Um `npm-shrinkwrap.json` na raiz, no aplicativo ou
num workspace faz o portão sair 2 antes de auditar: o npm o lê no lugar do
`package-lock.json`, e é o `package-lock.json` que o Dockerfile instala. `workspace`, `workspaces` e `include-workspace-root` não estão na lista,
e a bandeira `--workspaces=false` saiu na correção 8: com uma dependência direta
na raiz ela descarta do relatório tudo o que só os workspaces usam. O que ele
exige antes de aprovar: cada relatório diz quantas dependências olhou; as
advisories aceitas do aplicativo (por GHSA) e os pacotes aceitos de
desenvolvimento voltam DENTRO das próprias consultas (se uma some, a resposta foi
forjada no caminho ou a lista está velha, e o portão sai 2); o que a auditoria
completa acusa em pacote que o `package-lock.json` não marca como só de
desenvolvimento conta como runtime; e uma consulta de controle à parte (`lodash`
4.17.20, com o `.npmrc` de cada projeto) volta com a advisory conhecida. As
exceções do aplicativo casam pelo id da advisory e pela gravidade aceita:
advisory nova num pacote já aceito reprova, e advisory aceita que muda de
gravidade também. O prazo das exceções vale até o fim do dia escrito no fuso de
São Paulo. O que continua FORA do alcance: um `npm` falso no `PATH` (o portão
confia no programa que executa); um proxy de inspeção TLS que reescreve a
resposta tirando só a advisory nova e deixando as conhecidas (as variáveis de
proxy do sistema, como `HTTPS_PROXY`, não são configuração do npm e não passam
pela lista); o dia em que as duas listas de aceitas ficarem vazias (aí a única
prova é a consulta de controle à parte); e um `package-lock.json` adulterado
depois do CI (a prova que vale é a do CI, item 2 da seção 19 de `28`).

**A fronteira entre runtime e desenvolvimento é o grafo, não a marca `dev`
(DV-04).** O `npm ci --omit=dev` do Dockerfile NÃO obedece a marca `dev` do
lockfile igual em todo npm: com um pacote de runtime marcado `dev: true` à mão, o
npm 10.9.9 (o da imagem `node:22-bookworm-slim`) não o instala, e o npm 11 o
instala, porque recalcula quem é de desenvolvimento a partir das dependências
(provado por execução nas duas versões, `docs/evidencias-v2/G00/V2-F00-E19/divida-DV-04/`).
Por isso o portão decide runtime pelo que a árvore alcança (`nosDeRuntimeDoLockfile`
em `scripts/auditar-excecoes.mjs`): a partir da raiz e de cada workspace (o
Dockerfile instala `--workspaces --include-workspace-root`) segue só
`dependencies`, `optionalDependencies` e `peerDependencies`, resolvidas como o npm
resolve, e não `devDependencies`. O teste compara esse conjunto com o de
`npm ls --omit=dev --all` nos dois lockfiles do repositório e num projeto
sintético. Nó que o grafo alcança e o lockfile marca `dev: true` faz o portão
sair 1 e dizer o caminho, na raiz e no aplicativo de campo, ainda que a auditoria
volte limpa (é lockfile editado ou corrompido). A marca continua valendo no
sentido contrário, o conservador: nó sem `dev: true` conta como runtime mesmo que
o grafo não o alcance, porque o npm 10 o instalaria. Lockfile sem o mapa
`packages` (versão 1) ou com grafo vazio sai 2: não dá para calcular, e falta de
prova não é prova de ausência.

**Atualização de dependências e auditoria agendada (V2-F01-E06).** Dependência
chega como PR pequeno: o `.github/dependabot.yml` abre PR toda segunda-feira em
seis frentes (npm na raiz, npm no aplicativo de campo, ações do GitHub,
imagens do Docker, a imagem do banco do `compose.yaml` e o lockfile do gerador de
SBOM), sempre com os checks obrigatórios e **sem auto-merge**. No
aplicativo de campo, major e minor de `expo`, `react-native`,
`react-native-reanimated`, `react-native-worklets` e do resto da família do SDK
ficam ignorados, e o patch da família sobe só num PR em grupo: o SDK do Expo sobe
por inteiro, à mão, ou não sobe. O `.github/workflows/auditoria-semanal.yml`
roda `node scripts/auditar.mjs` toda segunda-feira (e sob demanda), para advisory
nova não esperar um commit; a agenda só vale a partir do ramo padrão. Os prazos
por gravidade e a regra de revisão estão em `docs/DEPENDENCIAS.md`; o que é
decisão do CP-03 e o que é proposta ainda sem decisão (os dias) está marcado lá.
`node --test scripts/dependabot.test.mjs` prende essas travas.

### O aplicativo de campo precisa de um comando próprio

`apps/campo` fica fora do `workspaces` de propósito (o motivo está em "O que
falta", mais abaixo), e o efeito colateral é que `npm test` na raiz não o
alcança: nada do que os seis workspaces somam (`packages/campo`, `packages/shared`, `apps/api`, `apps/console`, `apps/web` e `db`) vem do aplicativo. Por isso
existe `npm run test:campo`, que compila os pacotes compartilhados de que o
aplicativo depende, roda o TypeScript estrito dele e executa os testes.

Ele **falha** se `apps/campo/node_modules` não existir, em vez de pular calado.
Pular calado é como portão vira decoração, e a máquina sem as dependências
instaladas é justamente aquela em que o aplicativo nunca foi verificado. Quem
está mexendo só na API e não quer baixar o React Native tem escape, mas
precisa dizê-lo em voz alta:

```bash
npm ci --prefix apps/campo   # o caminho normal
DC360_SEM_APP=1 npm run test:campo   # ou pule, e veja escrito que pulou
```

Os números que este README afirma são conferidos por máquina:

```bash
npm run conferir:numeros
```

Ele pergunta ao vitest quais testes existem (`vitest list`, que enumera sem
executar), conta as verificações de navegador pelas chamadas de `ok(` nas
suítes de ponta a ponta, e exige que **todo número seguido de "teste" ou
"verificação" em qualquer markdown deste diretório** corresponda a uma
contagem real. Fica fora de `npm test` porque chama o vitest, e chamar o
vitest de dentro do vitest pendura o processo.

O aplicativo de campo é contado de outro jeito, e a diferença é honesta: ele
roda no jest, que não tem equivalente de `vitest list` (`--listTests` lista
arquivos, não casos), e conferir os números não deveria depender de instalar as dependências dele
(o trabalho "Testes, tipos e scripts" do CI as instala por outro motivo, para os
testes de `scripts/` que leem `apps/campo/node_modules`, mas o conferidor não
conta com isso). Então o script lê o código e conta
`it(` e `test(` abrindo linha, resolvendo `it.each` pela tabela para não
contar uma linha onde o jest conta duas. Quando não consegue resolver uma
tabela, ele **estoura** em vez de devolver um número menor.

Ler código é aposta, e aposta sem árbitro envelhece. O árbitro é o
`npm run test:campo`: ele pede o relatório JSON ao jest e cruza o número
executado com o número lido, no único comando que sabe que o aplicativo está
instalado. As duas contas divergiram na primeira versão (34 contra 42, três
`it.each` de dois temas cada) e o README teria afirmado um número falso.

Antes de tudo isso, o README não podia afirmar nenhum número conferível sobre
o aplicativo: a única linha que falava dele contava verificação do
`expo-doctor`, que não mede comportamento nenhum.

<!-- numeros: nao sao contagem -->
Ele existe porque a precisão deste documento é a única coisa que o torna útil,
e na primeira execução encontrou cinco números envelhecidos: a tabela do topo
dizia 29 testes de banco (eram 42), 83 da API (eram 123) e 7 de integração do
campo (eram 10); o bloco de comandos dizia 28 do motor de sincronização (eram
46); e o LEIA-ME do aplicativo dizia 34 de unidade (eram 46).

<!-- numeros: nao sao contagem -->
Uma armadilha da primeira versão vale registrar, porque é o tipo de coisa que
faz um portão passar verde sem verificar nada: a lista de isenções casava por
pedaço de texto, e a isenção `"2 testes"` casou dentro de `"242 testes"`,
desligando em silêncio a afirmação mais importante do documento. Isenção agora
é um marcador explícito na linha, nunca um trecho solto.

Fluxo ponta a ponta no navegador, modo local:

```bash
npm run build --workspace @dc360/web
cd apps/web && npx vite preview --port 4173 --strictPort   # deixe rodando
npm run test:e2e                                            # em outro terminal
MOTOR=firefox npm run test:e2e                              # e no Gecko
```

A variável `MOTOR` troca o motor do navegador (`chromium`, `firefox`,
`webkit`). As 70 verificações passam no Chromium, que é o motor do Chrome e do
Edge, e no Firefox. Sobre o WebKit, leia a seção seguinte antes de tentar.

### O modo local não serve para o Safari

Medido, não suposto: no motor do Safari o Postgres em WebAssembly com
persistência em IndexedDB leva **163 segundos** para abrir. Não trava, termina,
quase três minutos depois. No Chromium e no Firefox o mesmo banco abre em
poucos segundos.

Antes disso ser medido, o sintoma era uma tela de entrada parada para sempre em
"Preparando o banco de dados local", sem barra de progresso, sem erro e sem
nada para o usuário procurar. **A pior forma de falhar é a que não se
distingue de estar funcionando.**

O que mudou por causa disso, em `apps/web/src/dados/banco.ts`:

- **Teto de vinte segundos para o banco abrir.** Passou disso, a persistência é
  considerada indisponível e o banco sobe em memória, o que leva pouco mais de
  um segundo. A demonstração fica de pé em torno de vinte e um segundos em vez
  de cento e sessenta e três, ao custo de perder o dado ao fechar a aba.
- **A tela declara a troca.** Um aviso na entrada diz que este navegador não
  guardou o banco entre visitas e que o que for feito ali some. Sem o aviso,
  alguém cadastraria meia hora de dado numa demonstração e descobriria depois.
- **A semeadura ignora a marca do `localStorage` quando o banco é de memória.**
  A marca sobrevive ao recarregamento, o banco não; sem essa distinção a
  segunda visita abriria um banco vazio dizendo que já tinha sido semeado.
- **Prova de escrita na abertura.** Uma transação real, com o papel
  `dc360_app`, o contexto de organização e um INSERT numa tabela com RLS,
  desfeita por `rollback`. Um banco que sobe mas não aceita escrita passa a
  falhar na abertura, não no meio de um cadastro.
- **Nenhum teto por operação, de propósito.** O PGlite roda na thread
  principal: enquanto o WebAssembly trabalha, nenhum `setTimeout` dispara. Um
  teto ali não interromperia nada e, quando disparasse, acusaria de travada uma
  operação que ainda vai terminar. No Safari uma gravação leva mais de vinte
  segundos e conclui.

Mesmo com tudo isso, **o modo local no Safari é lento a ponto de parecer
travado** em cada escrita. Para Mac e iPad, use o painel ligado à API, onde o
banco é o do servidor e o navegador só desenha.

Fluxo ponta a ponta com a API, que é o caminho de produção:

```bash
npx playwright install chromium firefox   # na primeira vez
npm run test:e2e:api                      # Chromium
node scripts/e2e-api.mjs firefox          # e no Gecko
```

`scripts/e2e-api.mjs` sobe uma API nova na porta 3691 (o banco efêmero nasce
semeado, e a suíte confere contagens exatas, então ela não roda contra uma
instância suja), constrói o painel apontado para ela, serve na 4691, roda
`apps/web/test/fluxo-api.e2e.mjs` inteiro e derruba tudo no fim. Se uma das duas
portas já estiver ocupada ele recusa começar, em vez de falar com a instância
velha. O link de redefinição de senha chega pelo notificador de teste
(`NOTIFICADOR_ARQUIVO`), que a configuração recusa em produção.

Os três e2e de navegador fecham verdes desde a V2-F00-E18 (2026-10-07): o modo
local no Chromium e no Firefox e, contra a API, o arquivo inteiro de ponta a
ponta nos dois motores, sem cópia aparada. Antes disso a suíte contra a API
morria na seção 13, e as seções seguintes nunca tinham sido alcançadas juntas.

São 258 verificações no navegador que só existem neste caminho: entrada por senha, senha
errada recusada, token guardado sem a senha nem o hash, isolamento imposto
pelo servidor (inclusive abrindo a URL de outro município na mão), fluxo
gravando de verdade, dado criado numa sessão aparecendo em outro navegador,
papel recusado **mesmo chamando a API direto pelo console**, sair revogando a
sessão no servidor, cadastro com senha inicial seguido de entrada, e o laudo
oficial abrindo numa aba com protocolo, checklist e autoria corretos, e a foto
enviada pelo agente aparecendo na galeria do coordenador, e a recuperação de
senha do pedido até entrar com a senha nova, a trilha de auditoria filtrada, e
o CSV baixado e conferido célula a célula contra injeção de fórmula, e o pacote de saída baixado pelo botão do painel, aberto e conferido por dentro (soma SHA-256 de cada arquivo, só as linhas do município, nenhuma coluna que nunca sai).

As correções que vieram dessa suíte, e nenhuma apareceria em teste de servidor:
o CORS da API não permitia `PUT`, então o envio de bytes nem saía do
navegador; o `Cross-Origin-Resource-Policy` do helmet bloqueava a imagem
quando painel e API ficam em origens diferentes, que é o arranjo de produção;
e o CORS não liberava `if-none-match`, o cabeçalho da escrita única que a URL
de envio manda repetir, então o preflight reprovava e o PUT da foto acabava em
"Failed to fetch" (V2-F00-E18; liberado nome a nome, sem curinga e sem mexer na
lista de origens, travado por `apps/api/test/cors-do-envio-de-evidencia.test.ts`).
Com a suíte inteira enfim rodando, a mesma etapa achou mais um defeito de
produto: a checagem de duplicidade, primeiro passo de "Registrar e gerar
protocolo", dizia "Não foi possível carregar esta tela" quando o sinal caía, em
vez de dizer que o que a pessoa preencheu não foi enviado.

São 70 verificações no navegador: entrada, a busca global tolerante a erro, isolamento entre municípios visto dos dois lados,
geração de protocolo em sequência, triagem, despacho, encerramento com motivo
obrigatório, indicadores do painel reagindo às mudanças, cadastro de equipes e
usuários com recusa de duplicata, mapa, restrição de menu por papel, tema
escuro nas duas pontas (inclusive na tela de entrada) e persistência entre
recarregamentos, mais as garantias de acessibilidade: selo com ícone, marcador
de mapa com forma própria por severidade, erro de campo com `role="alert"` e
`aria-describedby`, e a navegação por teclado: o primeiro Tab caindo no atalho
de pular para o conteúdo, o atalho aparecendo ao receber foco e levando de fato
ao conteúdo, e todo item da lateral alcançável sem mouse. O teste também falha
se aparecer qualquer erro no console.

Na primeira vez: `npx playwright install chromium firefox`.

## RLS não cobre chave estrangeira

Este é o achado que mais custou a aparecer, e vale registrar por extenso.

Row Level Security governa `SELECT`, `INSERT`, `UPDATE` e `DELETE`. Ela **não**
governa a verificação de chave estrangeira: o Postgres confere a existência da
linha referenciada com privilégio de sistema, por baixo da policy. Na prática,
antes da migração 008 dava para:

- vincular uma ocorrência de Serra Alta a uma de Vale Fundo;
- despachar para uma equipe de outra prefeitura;
- gravar vistoria apontando para ocorrência que o município não enxerga;
- **assinar um evento da trilha com um servidor de outro município** , o pior
  dos casos, porque a trilha é a prova de quem fez o quê.

Nada disso aparecia em teste de leitura, porque a linha continuava invisível.
E o estrago tinha duas naturezas: dado incoerente gravado, e um oráculo de
existência (o insert passa se o identificador existe lá, falha se não existe),
que é exatamente o vazamento que a resposta 404 no lugar de 403 existe para
impedir na API, só que pela porta dos fundos.

**A correção é chave estrangeira composta**, com `organizacao_id` nos dois
lados. O banco passa a exigir que pai e filho sejam do mesmo município, e a
garantia deixa de depender de o desenvolvedor lembrar de consultar antes de
inserir. O custo é uma restrição de unicidade em `(organizacao_id, id)`,
redundante com a chave primária: é o preço da garantia.

Cinco testes do portão CA-06 cobrem isso, e foi verificado que os cinco
reprovam se a migração 008 for removida.

## O portão CA-06

`db/test/isolamento.test.ts` é o teste que bloqueia merge. Ele responde uma
pergunta só: com o contexto de um município, é possível ler, alterar ou criar
dado de outro?

**Ele descobre o que verificar, em vez de conferir uma lista.** A versão
anterior enumerava as tabelas à mão, e o efeito foi silencioso duas vezes:
`sessoes` (migração 002) e `exportacoes` (migração 007) ficaram fora do portão
até alguém lembrar de acrescentá-las. Um portão que depende de memória não é
portão.

Hoje ele pergunta ao banco e exige, de toda tabela que existir:

| Invariante | Por que ela é invariante |
| --- | --- |
| RLS ativada **e forçada** | Sem `FORCE`, o dono da tabela ignora a policy |
| Ao menos uma policy, e toda expressão citando `app_organizacao_atual()` | Uma policy `USING (true)` passaria no teste anterior e não isolaria nada |
| Coluna `organizacao_id` obrigatória | Sem ela não há em que a policy se apoiar |
| Toda referência entre tabelas de negócio inclui `organizacao_id` | Chave estrangeira roda por baixo do RLS; ver a seção acima |

E das funções `SECURITY DEFINER`, que são portas abertas na parede do RLS:

| Invariante | Por que |
| --- | --- |
| Todas fixam `search_path` | Sem isso, quem controla o search_path faz a função chamar código dele com privilégio de dono. É a escalada clássica, e não precisa de bug no SQL |
| Nenhuma executável por `PUBLIC` | O padrão do Postgres é conceder `EXECUTE` a PUBLIC: esquecer o `REVOKE` abre a função para qualquer papel conectado |
| No máximo 27 | Se o número disparar, alguém está resolvendo com privilégio o que deveria resolver com contexto. Começou em doze e subiu por razão escrita, uma a uma, no próprio teste (a última, de 26 para 27, foi `varrer_tarefas_novas`, migração 042) |
| `dc360_app` não é superusuário, não ignora RLS e não é dono de tabela | Se fosse, todo o resto viraria enfeite |

Verifiquei o portão contra migrações descuidadas de propósito: uma tabela nova
sem RLS, uma com RLS mas com chave estrangeira simples, e uma função
`SECURITY DEFINER` sem `search_path`. Cada uma reprova no teste que existe para
ela, sem ninguém precisar lembrar de nada.

Ele roda em PGlite justamente para não depender de Docker. O teste que protege o
isolamento não pode ser o que alguém pula porque a infraestrutura não subiu.

Detalhe que faz o teste valer alguma coisa: o superusuário do Postgres ignora
RLS. Por isso tudo que simula a aplicação roda com `SET LOCAL ROLE dc360_app`, o
mesmo papel sem privilégio que a API usará em produção.

## Integração contínua

`.github/workflows/verificar.yml` roda a cada push em `main`, `master` ou `v2/**`
e a cada pull request, em
trabalhos paralelos (os quatro principais abaixo, mais o pacote da demonstração,
que mora em `.github/workflows/demonstracao.yml` e só roda quando muda o protótipo; há ainda o de dependências,
`node scripts/auditar.mjs`, que antes recusa `.npmrc` versionado; o `windows`,
que repete o `auditar`, `test:scripts` e `conferir:numeros` em `windows-latest`;
o `plataformas`, com os três casos de ambiente da E21 em Windows e em Linux (ver
"O que prova Windows", na primeira seção "Como testar"); o da linha de base em Linux
(`baseline.mjs`), o do restore do banco e o de ferramentas do roadmap, que
também confere os `INDEX.md` da evidência com
`scripts/conferir-indices-de-evidencia.mjs`, e o das imagens Docker (`imagens`, V2-F01-E08): onze ao
todo no `verificar.yml`, doze execuções por
causa da matriz do `plataformas`; os
dois longos, linha de base e restore, hoje só rodam em push cujo commit traga
`[ci completo]`: o disparo manual e a agenda de segunda-feira estão escritos no
arquivo, mas só valem quando o `verificar.yml` chegar ao ramo padrão, e o de
`origin/master` ainda não os tem):

<!-- numeros: nao sao contagem -->
| Trabalho | O que ele impõe |
| --- | --- |
| Testes, tipos e scripts | TypeScript estrito, depois o portão CA-06 sozinho e antes da suíte, a suíte inteira, `test:scripts` e os números do README conferidos. A auditoria de dependência é o job `dependencias` (`node scripts/auditar.mjs`, o mesmo portão do `npm run auditar`, política do CP-03, ver "Como testar") |
| Fluxo no navegador | O painel de ponta a ponta no modo local, em Chromium e em Firefox, e contra a API em Chromium, Firefox e WebKit (`npm run test:e2e:api`, `node scripts/e2e-api.mjs firefox` e, no WebKit, só a geometria e o foco da tela estreita: `node scripts/e2e-api.mjs webkit --so-layout`, porque a suíte principal supõe que clicar num botão o foca e o WebKit não faz isso; os três rodam no CI desde a correção 5 da V2-F00-E09, porque o foco depois da senha errada falhava só no Firefox) |
| Pacote da demonstração (`demonstracao.yml`) | O zip montado, extraído e percorrido pelo roteiro de dez minutos nos dois motores. Só roda quando muda `mockup/**`, `scripts/**`, os três documentos que vão dentro do zip ou o `package-lock.json` (o Playwright vem dele); mudança só no produto não o dispara |
| A API sobe contra Postgres real | Migração, idempotência e `/saude` respondendo, com o papel restrito de aplicação, no Node puro e contra o Postgres 17 de serviço (o major de produção), agora com PostGIS 3.6 por digest, e o `npm run test:espacial` (`ST_Contains`, `ST_DWithin` e RLS forçada sobre `geography`) com `DC360_EXIGE_POSTGIS=1` |
| Imagens Docker (API e console) | `docker build` das duas imagens de produção com a base fixada por digest e `DC360_VERSAO` / `DC360_COMMIT` como argumentos de build; migração aplicada A PARTIR da imagem da API; a API e o console sobem da imagem, como `node`, e `/saude` responde 200 com `versao` e `commit` iguais aos do build; `chromium --version` dentro da imagem da API (sem ele o PDF do laudo é 503). As conferências são `scripts/smoke-das-imagens.mjs`, e o teste prova que root, falta de Chromium e versão trocada reprovam. Não recebe segredo e não publica imagem (E12); scan é a E20 e SBOM a E19 |
| Aplicativo de campo | `npm run test:campo` (TypeScript, os testes do aplicativo e a conferência de que o jest executou os casos que a leitura do código conta; é o que substituiu o `typecheck` e o `npm test` avulsos do job), árvore de dependência coerente, o `expo-doctor` (sem a checagem de versão de pacote, que depende do dia). A auditoria do aplicativo vai no job `dependencias` |

**Regras que todo workflow de `.github/workflows/` cumpre** (V2-F01-E02), conferidas
por `scripts/conferir-workflows.test.mjs`, que roda no `npm run test:scripts`:
`permissions: contents: read` no topo (o `GITHUB_TOKEN` só lê); `timeout-minutes`
em todo job; `runs-on` com versão (`ubuntu-24.04`, nunca `ubuntu-latest`; o
Windows fica em `windows-latest` de propósito, porque a prova de ambiente quer o
Windows do autor); toda `uses:` fixada por SHA de 40 caracteres, com a versão em
comentário (quem sobe a versão é o Dependabot); nenhum `pull_request_target`.
`cancel-in-progress` só em pull request: o run da `master` e o de cada SHA
candidato nunca são cancelados. Os navegadores do Playwright vêm de cache
(`~/.cache/ms-playwright`, chave presa ao `package-lock.json`). Workflow novo que
quebrar uma regra reprova esse teste, e os nomes dos quatro jobs exigidos pelo
ruleset da `master` também ficam presos nele.

**O CI roda tudo o que o `npm run verificar` roda** (V2-F01-E03). O mesmo teste lê
o script `verificar` do `package.json` e reprova se algum dos seus comandos
(`typecheck`, `npm test`, `test:scripts`, `test:campo`, `auditar`,
`conferir:numeros`) não aparecer em nenhum `run:` de nenhum workflow; portão novo
que fique só local reprova. O `auditar` pode aparecer como `npm run auditar` ou
como `node scripts/auditar.mjs` (o CI usa o `node` de propósito). Um `npm audit`
que decide o resultado, ou que usa `--audit-level`, também reprova; o único que
resta é o que guarda o relatório bruto como evidência, com `|| true`.
`test:scripts` roda no job `produto` com as duas árvores instaladas (o teste do
mapa do aplicativo lê `apps/campo/node_modules`) e `test:campo` no job
`aplicativo`.

O CA-06 roda separado e antes da suíte inteira de propósito (o TypeScript
estrito vem antes dele no job): isolamento entre municípios é a regra número
um, e se ela quebrar nada mais importa.

A tabela diz o que o arquivo manda rodar, e não um resultado: nenhuma rodada
do CI foi conferida por uma pessoa durante a F00 (é validação humana pendente
da V2-F00-E01); o gatekeeper leu o run 37739535524 do SHA 7005a60, com 9 jobs
verdes, depois o 38618369218 do SHA 7585801, também com 9 de 9, e o 39420436042 do SHA 55209ab (candidato fd17ff4), 9 de 9, na rodada 7, antes de existirem os jobs `windows` e `plataformas`. O CI decide dependência por `node scripts/auditar.mjs` (jobs `dependencias` e `windows`; é o mesmo portão do `npm run auditar`), e não por
`npm audit` puro; o `npm audit` puro ainda lista os avisos aceitos pelo CP-03,
e os relatórios brutos dele só são arquivados como evidência.

Na máquina, o mesmo se pede com `npm run verificar` (em `dc360/`) e
`scripts/conferir-demo.ps1` (na raiz do repositório, não em `dc360/`). O `verificar` inclui `npm run test:campo`: por um
bom tempo ele não incluía, e o aplicativo era medido só no runner. Portão que
existe apenas na integração contínua é portão que se descobre quebrado depois
do push, e a essa altura o conserto custa uma volta inteira.

`npm run test:scripts` fecha o círculo: são os testes dos próprios scripts de
portão, no executor embutido do node. Eles cobrem a regra (quando falhar,
quando pular, como contar) e também a fiação, que é onde o defeito estava: a
regra podia estar impecável e continuar sem ser chamada por comando nenhum.

### Varredura de segredos (gitleaks)

Segredo commitado por engano é barrado antes do merge. O workflow
`.github/workflows/segredos.yml` (job "Varredura de segredos") baixa o binário
oficial do gitleaks em versão fixa, confere o SHA-256 escrito no próprio
workflow e varre o histórico completo com `--redact`, de modo que um achado nunca
imprime o valor do segredo no log nem no relatório. Ele só lê o repositório e não
recebe nenhum segredo. A configuração é o `.gitleaks.toml` da raiz: parte das
regras padrão e só acrescenta exceções estreitas, cada uma com a razão escrita.
Exceção por caminho aponta um arquivo inteiro e uma regra; pasta inteira não
entra, e `scripts/politica-de-segredos.test.mjs` reprova caminho que deixou de
existir. Segredo real achado no histórico não vira exceção: é rotacionado (para o
`JWT_SEGREDO`, `scripts/rotacionar-segredo.mjs`) e só então o achado é tratado.

**Instalar o hook de pre-commit (opcional, por máquina).** Ele varre o que está em
stage antes de o commit existir. O CI é o portão que vale; o hook só adianta o
aviso.

```bash
# gitleaks 8.25 ou mais novo (brew install gitleaks, ou o binário do release oficial)
cd dc360
npm run preparar                   # git config core.hooksPath .githooks
git config --unset core.hooksPath  # para desligar
```

Sem o gitleaks instalado o hook apenas avisa e deixa o commit seguir. Atenção: o
`core.hooksPath` é configuração do repositório inteiro, e vale também para os
worktrees dele.
### Análise estática (SAST) e política de exceção

`.github/workflows/sast.yml` roda o Semgrep CE (versão fixa, `--metrics=off`, sem
login nem token: nenhum código sai do runner) a cada push em `main`, `master` ou
`v2/**` e a cada pull request. O job se chama `SAST (Semgrep)` e esse nome é
contrato com o ruleset do GitHub. Primeiro ele roda `semgrep --test` nas regras
próprias; só então varre `dc360/` com elas; por fim `dc360/scripts/sast-baseline.mjs`
compara o resultado com a baseline triada e **reprova só o achado novo de
severidade ERROR**, das regras próprias e das do registro (fixadas, abaixo).
Análise que não examinou arquivo nenhum não passa: o JSON do Semgrep precisa
trazer `paths.scanned` com pelo menos 30 arquivos (e 30 em `apps/api/src/`),
senão o portão reprova com código 2 (uma exclusão excessiva não vira falso verde).

O que roda, tudo versionado em `.semgrep/`:

- `regras/`: quatro regras próprias (em três arquivos), todas ERROR, que protegem a regra número um.
  (1) a organização lida de `body`, `params`, `query` ou cabeçalho em
  `apps/api/src` (acesso direto e fluxo até `comTenant`); (2) SQL montado por
  interpolação ou concatenação e entregue a `query(`; (3) o cabeçalho
  `Authorization` (ou todos os cabeçalhos) indo para log. Cada regra tem casos
  positivos (`ruleid`) e negativos (`ok`) em `test/`, rodados por `semgrep --test`.
- Regras do registro (TypeScript, Node, React e JWT), **FIXADAS e bloqueantes**
  (correção 1 da F01): o repositório é PÚBLICO, e as regras do registro são da
  Semgrep Rules License v1.0 (uso interno, sem redistribuição), então NENHUMA
  cópia delas mora aqui. Em vez dos pacotes móveis `p/...` (que mudam sem aviso e
  sem versão), o job baixa um commit EXATO de `semgrep/semgrep-rules`
  (`SEMGREP_RULES_SHA` no `sast.yml`, conferido por `git rev-parse` depois do
  download) e roda as pastas de TypeScript, Node, React e JWT dele (lista em
  `SEMGREP_RULES_PASTAS`). É uso, não redistribuição. ERROR novo reprova pelo
  mesmo mecanismo das regras próprias, contra `baseline-registro.json`. Subir o
  commit das regras é um PR próprio, com essa baseline refeita. A saída vai no
  artefato `sast-<sha>` (`04-registro.json`, `04-registro-scan.txt`,
  `05-baseline-registro.txt`).
- `baseline.json` e `baseline-registro.json`: os achados que já existiam quando o
  SAST entrou, **lidos um a um por uma pessoa**, cada um com classe
  (`falso-positivo`, `aceito` ou `defeito`), motivo, dono e prazo. `defeito` real
  aponta para `V2-F25-E01`, não some em silêncio. A impressão do achado é regra,
  arquivo, o TRECHO INTEIRO do achado (da linha em que começa à em que termina) e
  ordem entre iguais, sem número de linha: inserir código acima não reabre o
  achado, editar QUALQUER linha da consulta sim (antes só a primeira linha
  entrava, e uma mudança posterior numa consulta multilinha conservava o id).

**Política de exceção.** Achado novo se corrige no código. Se for falso positivo,
há dois caminhos, e os dois exigem motivo, dono e prazo:

1. `nosemgrep` no código, na mesma linha ou na linha de comentário logo acima:
   `// nosemgrep: <id-da-regra> -- motivo: <texto>; dono: <nome>; ate: AAAA-MM-DD`.
   O id da regra é obrigatório (supressão cega é proibida), o motivo tem pelo
   menos vinte caracteres e o prazo não passa de um ano.
2. Uma entrada nova na baseline (`node dc360/scripts/sast-baseline.mjs propor
   saida-do-semgrep.json` mostra as candidatas), com a classe e o motivo lidos
   por quem triou.

Exceção vencida reprova: `scripts/excecoes-de-seguranca.test.mjs` entra em
`npm run test:scripts` e olha todo `nosemgrep` do repositório e toda linha da
baseline contra a data de hoje. Renovar é decisão, com motivo novo; não é
trocar a data. Para rodar na máquina, instale o Semgrep CE na mesma versão do
workflow (`pipx install semgrep==1.136.0`) e, na raiz do repositório:

```
semgrep --test --metrics=off --config .semgrep/regras .semgrep/test
semgrep scan --metrics=off --config .semgrep/regras --json --output semgrep.json dc360
node dc360/scripts/sast-baseline.mjs conferir semgrep.json
# regras do registro, no commit fixado do workflow (clone raso do semgrep-rules):
semgrep scan --metrics=off --config <semgrep-rules>/typescript/lang --config <semgrep-rules>/javascript/node-crypto \
  <...as demais pastas de SEMGREP_RULES_PASTAS...> --json --output registro.json dc360
node dc360/scripts/sast-baseline.mjs conferir --baseline .semgrep/baseline-registro.json registro.json
```

O SAST não substitui o teste dinâmico de isolamento (`npm run test:isolamento`,
CA-06): a regra (1) é a versão estática dele, que pega o erro na revisão do PR,
antes de o teste ter a chance de não cobrir a rota nova. Ficam de fora desta
etapa: CodeQL, DAST, scan de contêiner e SBOM.

### Proteção da `master` (ruleset)

Nada entra na `master` sem pull request e sem os checks obrigatórios verdes, mesmo
com uma só pessoa contribuindo. A regra está versionada em
`.github/rulesets/master.json`, pronta para importar em Settings, Rules, Rulesets,
New ruleset, Import a ruleset. Ela exige:

- pull request com 0 aprovações (a auto-aprovação é o checklist de
  `.github/pull_request_template.md`; vira 1 aprovação com a segunda pessoa
  revisora, E16 e CP-07);
- os nove checks abaixo, pelo nome de exibição do job, com o branch atualizado;
- só merge por COMMIT DE MERGE (nunca squash nem rebase, decisão do Rafael na
  H09: os SHAs citados nos veredictos têm de continuar existindo na `master`),
  sem exigir histórico linear (a regra `required_linear_history` só admite
  squash ou rebase, por isso ela não existe aqui), sem force-push, sem exclusão
  e sem exceção para ninguém (`bypass_actors` vazio, administrador incluído).

Os checks são: `Testes, tipos e scripts`, `Dependências com vulnerabilidade conhecida
(auditar)`, `Ferramentas do roadmap e estado gerado`, `Fluxo ponta a ponta no
navegador`, `Aplicativo de campo`, `A API sobe contra
Postgres real`, `Imagens Docker (API e console)` (todos de `verificar.yml`), `Varredura de segredos` (`segredos.yml`)
e `SAST (Semgrep)` (`sast.yml`). Os nomes são contrato: o job `baseline`, o
`restore`, o `windows` e o `plataformas` não estão na lista (os dois primeiros
nem rodam em pull request; os outros dois são decisão do Rafael), e o `Pacote da
demonstração` também não, porque desde a F01-E02 só roda quando a demonstração
muda: check obrigatório que não reporta trava o merge.
`dc360/scripts/ruleset-master.test.mjs` reprova se algum nome do JSON deixar de
existir num workflow, e `.github/CODEOWNERS` nomeia o dono das migrações, da
autenticação da API e do `.github/`.

O ruleset não é aplicado por nenhum arquivo do repositório: ligá-lo é ação do
Rafael no GitHub, e só depois do merge da F00 na `master` (com ele ativo, o merge
da F00 também exigiria pull request). Para desfazer, desative o ruleset; o JSON o
recria.

## Versões, tags e changelog

Cada versão em produção precisa ter número, tag e changelog, para que dê para dizer
qual commit está no ar (V2-F01-E07). O produto tem **duas linhas de versão**, cada uma
com a sua tag:

| Linha | O que cobre | Onde o número mora | Tag |
| --- | --- | --- | --- |
| plataforma | API, painel, console do fornecedor, banco e pacotes compartilhados | `package.json` da raiz, igual em todo workspace e em `package-lock.json` | `vX.Y.Z` |
| campo | Aplicativo do agente | `VERSAO` de `apps/campo/app.config.ts`, com `apps/campo/package.json` e o lockfile do aplicativo acompanhando | `campo-vX.Y.Z` |

Antes da G28 a major é 0 (`0.y.z`). Migration ou contrato incompatível sobe o `y` e
zera o `z`; correção sobe o `z`. A 1.0.0 é decisão do Rafael na G28, e o script a
recusa. O `BUILD` do aplicativo é outra coisa: segue do EAS e não é tocado.

O `CHANGELOG.md` desta pasta é escrito à mão, em português, uma seção por versão e por
linha (`## plataforma 0.1.0 - 2026-10-24`), com a mais nova primeiro. Versão sem seção
reprova. O que ainda não saiu fica em "Não lançado".

`scripts/versao.mjs` cuida do número, sem script novo no `package.json`:

```bash
node scripts/versao.mjs conferir                    # todos os arquivos de cada linha no mesmo número, e a seção no CHANGELOG
node scripts/versao.mjs mostrar                     # imprime a versão de cada linha
node scripts/versao.mjs subir plataforma y          # 0.1.3 -> 0.2.0 em TODOS os workspaces e no lockfile (z para correção)
node scripts/versao.mjs subir campo 0.2.0           # também aceita o número explícito, desde que maior
node scripts/versao.mjs conferir-tag v0.2.0         # só valida o NOME e se bate com os arquivos
```

Subir a versão e escrever a seção do CHANGELOG andam juntos: `subir` troca os números e
avisa que falta a seção, e `conferir` reprova até ela existir. Editar um `package.json`
à mão, em um workspace só, também reprova. `versao.test.mjs` roda em `npm run test:scripts`,
inclusive `conferir` contra esta árvore, e é isso que segura as versões iguais no CI.

**O script nunca cria tag.** Tag é ato do dono do repositório (e, quando a E12 existir,
do workflow de promoção). Regras: a primeira tag (`v0.1.0` e `campo-v0.1.0`) vem depois
da E01 e nunca de forma retroativa, no commit que tem aquele número; tag não se atualiza
nem se apaga (um ruleset do GitHub para `v*` e `campo-v*` faz isso valer, e ligá-lo é ação
no GitHub, fora do repositório); o Release do GitHub leva as notas da seção do changelog, e
a E19 anexa o SBOM. Ficam fora desta etapa a atualização do
aplicativo sem loja (CP-24) e a promoção (E12).

### Versão e commit em `/saude`, e o rollback

`GET /saude`, da API e do console, devolve `versao` e `commit` da imagem que está de
pé (V2-F01-E08). Os dois valores são **argumentos de build** da imagem
(`DC360_VERSAO`, que o job `imagens` lê de `node scripts/versao.mjs mostrar`, e
`DC360_COMMIT`, o SHA de quem construiu); o `Dockerfile` e o `Dockerfile.console` os
gravam como variáveis de ambiente e `apps/api/src/versao-do-build.ts` os repete,
validando o formato (a rota é pública). Sem os argumentos a imagem constrói e diz
`desconhecida` / `desconhecido`; fora de uma imagem (`npm run dev`, os testes) também.
Hoje o `fly deploy` não passa os argumentos sozinho: a receita do deploy manual e o
rollback de cada frente (Fly, Vercel, EAS e banco) estão em
`docs/runbooks/rollback.md`, ainda **não ensaiado** (o ensaio é da E16).

## O que falta, e por quê

- **A prova do aplicativo de campo num aparelho.** Ele está inteiro em
  código: telas, coleta offline, câmera, GPS, assinatura no dedo, fila de
  envio, ícones e a configuração das duas lojas. Compila e passa nos testes do
  aplicativo; deu 21 de 21 no `expo-doctor` em 2026-10-13 (os seis patches do Expo foram
  aplicados então), 20 de 21 na manhã de 2026-10-14 (cinco patches novos) e
  21 de 21 de novo no mesmo dia, depois da correção 4 da E19 (pendência 17 de
  `apps/campo/PENDENCIAS.md`, com a premissa de que o Rafael ainda não confirmou
  a analogia com a D1 para esses cinco pacotes), 20 de 21 em 2026-10-18 (`expo` e
  `expo-router` um patch atrás) e 21 de 21 de novo no mesmo dia, depois da correção 5
  da E19, com a mesma premissa; passa no
  `npm run auditar` conforme o CP-03 (V2-F00-E19), que sai com código 2 e não
  aprova quando o registro de avisos está fora do ar. Há relato de uso em iPhone (08/09/2026), mas **nenhum artefato
  de aparelho físico está arquivado**, e relato não é prova (as capturas de
  emulador Android de E06, E15 e E16 estão listadas em `apps/campo/LEIA-ME.md`). O que falta é o que só o
  aparelho responde: como a câmera, o GPS e o traço na tela se comportam de
  verdade, e a prova de que o `expo-sqlite` guarda o que promete quando o
  aparelho fica sem sinal (V2-F14-E12).

  Essa última já tem 283 testes do motor de campo cobrindo a lógica fora do
  celular, inclusive retomada arquivo a arquivo.
  `apps/campo` fica **fora do `workspaces`** de propósito: o Expo traz quase
  seiscentos pacotes, e deixá-lo fora mantém rápido o `npm install` da raiz e
  desacopla o `npm audit` do produto do ciclo do React Native. Ele tem o
  próprio lockfile e a própria auditoria, que NÃO fecha em zero no `npm audit` puro
  (fecha em `npm run auditar`, com as exceções nomeadas do CP-03: cinco pacotes e sete advisories). O preço
  dessa separação é que nenhum comando da raiz o enxerga de graça: quem o
  alcança é `npm run test:campo`, e ele está dentro de `npm run verificar`.
- **Conta de desenvolvedor nas lojas.** `apps/campo/LOJAS.md` cobre Play
  Console e App Store Connect passo a passo, com os textos da ficha prontos e
  o formulário de segurança de dados respondido linha a linha. Dois itens têm
  prazo longo e independem de código: a verificação de identidade da
  organização na Google e o número D-U-N-S exigido pela Apple.
- **Conta no provedor de armazenamento.** O código está pronto e testado
  contra o vetor oficial da AWS, mas a varredura de órfãos (`ListObjectsV2`) nunca
  falou com o provedor de verdade (`docs/ARMAZENAMENTO.md`); o armazenamento de
  produção é o Supabase Storage por S3 (`fly.toml`).
- **Conta no provedor de email.** O provedor foi escolhido (Resend) e o cliente
  fala o contrato publicado dele, com teste conferindo o corpo do pedido campo
  a campo. O que falta é a conta: criar, verificar um domínio da prefeitura no
  DNS, gerar a chave de envio e preencher as variáveis. O passo a passo está em
  `docs/LIGAR-O-EMAIL.md`. Até isso acontecer, `EMAIL_ATIVO=nao` e
  `RECUPERACAO_ATIVA=nao`, e quem precisa trocar a senha troca por dentro, em
  "Minha conta", sem depender de email.
- **A assinatura no aparelho, provada em aparelho.** Os dois lados existem em
  código: o aplicativo de campo captura o traço com o dedo
  (`apps/campo/src/ui/Assinatura.tsx`, usado na tela de vistoria) e o envia na
  sincronização, e o documento lê a chave, confere se os bytes chegaram, assina
  uma URL de vida curta e desenha o traço acima da linha, no laudo e no termo.
  O que falta é o mesmo de todo o aplicativo: ver o traço feito num aparelho
  chegar ao laudo, com artefato arquivado.
- **Mapa cartográfico com chave em produção.** O mapa é o do Google (Maps
  JavaScript no painel, `react-native-maps` no aplicativo), com a chave servida
  em tempo de execução por `GET /configuracao`, e sem chave a tela cai no modo
  esquemático, que plota as coordenadas gravadas sobre um plano quadriculado
  sem requisição nenhuma ao Google (`apps/web/src/paginas/mapa-de-base.ts`).
  O que falta é decisão e conta, não código: cada município ligar a própria
  chave, com o custo por carregamento e o envio da coordenada ao Google que
  `docs/SUBPROCESSADORES.md` declara.
- **Armazenamento de evidência.** A regra de chave por tenant já está no banco;
  o bucket de produção é o Supabase Storage por S3 (`fly.toml`, `docs/ARMAZENAMENTO.md`).
  O levantamento apontava Cloudflare R2 por causa do egress; a troca de provedor
  é só configuração.
- **PostGIS.** A migração ainda não cria a extensão porque nada hoje faz
  consulta espacial. Entra quando entrar busca por raio ou por setor de risco.
  A infraestrutura de teste já existe (V2-F01-E21): o `compose.yaml` e o CI usam
  `postgis/postgis:17-3.6` por digest, e `npm run test:espacial` prova a extensão
  em Postgres real (`docs/AMBIENTES.md`, seção "PostGIS no CI e no ambiente local").
- **Desligar o segundo fator de OUTRA pessoa.** Hoje cada um cuida do próprio:
  quem administra redefine senha de terceiro, mas não desliga a verificação em
  duas etapas de ninguém. Para quem perdeu o telefone, a saída são os códigos
  de recuperação, e ela cobre o caso; para quem perdeu o telefone E os códigos,
  não há caminho pela tela. A rota é pequena (`exigirPermissao` mais
  `exigirPostoParaGerir`, como a redefinição de senha já faz), e ficou de fora
  deste turno de propósito: ela é uma porta para retirar a proteção de uma
  conta alheia, e merece o cuidado inteiro em vez do fim de um turno.
- **PDF em job assíncrono.** Hoje o PDF é gerado na própria requisição, o que
  serve para um laudo por vez. Quando alguém exportar a fila inteira, isso
  precisa virar fila com download por link, como o levantamento prevê. A porta
  `GeradorDePdf` já está no lugar para a troca.

## Onde estão as decisões

- Stack, multi-tenancy, protocolo offline e régua de segurança:
  `../docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md`
- Regras de trabalho e o que vale na raiz contra o que vale aqui:
  `../CLAUDE.md`
