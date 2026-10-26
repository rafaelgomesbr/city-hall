# V2-F00-E04, correção 1: a vigência vale para GET que escreve

Corrige o que a validação de 7005a60 provou reprovado (VEREDITO.md, `validacao/7005a60/red-team.md`, `arbitragem.md`, `seguranca-aplicacao.md`). Cobre também o que a E07 e a E22 herdaram da mesma causa (ver `../../V2-F00-E07/correcao-1/RESUMO.md` e `../../V2-F00-E22/correcao-1/RESUMO.md`).

## Fatos

### O defeito, conferido no código antes de mexer

`dc360/apps/api/src/servidor.ts` (`exigirAutenticacao`) decidia "isto escreve" por `req.method !== "GET" && req.method !== "HEAD"`. Mas existem GET que escrevem: o termo de interdição interdita o imóvel e grava `documento_emitido`, o CSV grava `exportacoes`. Com conta desativada, papel rebaixado ou sessão encerrada (inclusive cadeia encerrada depois de renovar) esses GET e os HEAD deles passavam sem conferir nada. O teste novo reproduziu isso: 7 dos 10 casos reprovaram antes do conserto (`01-teste-novo-ANTES-do-conserto.txt`).

### O conserto

1. `servidor.ts`: nova configuração de rota `comEfeito` (tipo `FastifyContextConfig`) e a constante exportada `ROTA_GET_COM_EFEITO = { config: { comEfeito: true } }`. Escrita passou a ser `método diferente de GET e HEAD` OU `req.routeOptions.config.comEfeito === true`. O HEAD que o Fastify cria sozinho herda a configuração do GET (provado pelas sondas, que fazem GET e HEAD).
2. Rotas GET marcadas (6 caminhos, mais as variantes com barra final): `GET /documentos/:id/laudo`, `/laudo.pdf`, `/termo-de-interdicao`, `/termo-de-interdicao.pdf`, `/termo-de-desinterdicao`; `GET /relatorios/ocorrencias.csv`; `GET /avisos` (e `/avisos/`). Arquivos: `rotas/documentos.ts`, `rotas/prestacao-de-contas.ts`, `rotas/avisos.ts`.
3. `auth/sessoes.ts` (`encerrarSessoes`): `preservarSessaoId` passou a preservar a CADEIA (`familia_id`) da sessão, e não só a linha. Era o achado da E07: `/auth/encerrar-sessoes` com o token anterior à renovação derrubava a própria cadeia de quem pediu, e a mensagem dizia "Esta continua aberta".
4. `apps/web/src/dados/http.ts`: ao receber 401 e renovar, o cliente agora cancela o corpo do 401 antes de repetir. Sem isso, com `GET /avisos` conferindo a vigência, a tela que abre com um token de papel desatualizado (401, renova, repete) deixava o primeiro pedido "em andamento" no navegador e o `networkidle` do roteiro de ponta a ponta estourava 30 s (`13-diagnostico-do-e2e-que-travava.txt`). Foi achado pela regressão obrigatória, não previsto.
5. Documentação corrigida para dizer o que o código faz: comentários de `auth/vigencia.ts` e de `servidor.ts`, `apps/api/PENDENCIAS.md` (seção da vigência, seção do `GET /avisos`, item 2 de "Sessões no painel" que deixa de ser pendência), `dc360/README.md` (linha do token de acesso). Números de testes atualizados em `dc360/README.md` e `dc360/docs/COLOCAR-DE-PE.md` (`npm run conferir:numeros` fecha), e `dc360/scripts/baseline.mjs` (E04: total 4 para 14 na tabela de mudanças do `teste-api`; `node --test scripts/baseline.test.mjs` passa).

### Varredura das rotas GET (55 entradas em `printRoutes`, 46 rotas distintas)

Método: (a) leitura de todo `app.get` em `src/rotas/*.ts` e `servidor.ts` procurando escrita no corpo (INSERT, UPDATE, DELETE, `registrarEmissao`, `registrarEvento`, `registrarAtoAdministrativo`, `registrarConsulta`, `marcarInterditada`) e em quem o corpo chama (`responder`, `responderPdf`, `efetivarEmissao`); (b) o teste `get-com-efeito.test.ts` confere pelo comportamento, com a conta desativada, que a lista de rotas que respondem `conta_desativada` é exatamente a lista explícita `COM_EFEITO`.

| Rota GET | Escreve? | Decisão |
| --- | --- | --- |
| `/documentos/:id/laudo` e `.pdf` | sim: `documento_emitido` na trilha, acesso em `ocorrencia_consultas` | MARCADA |
| `/documentos/:id/termo-de-interdicao` e `.pdf` | sim: trilha, acesso e `ocorrencias.interditada_em` | MARCADA |
| `/documentos/:id/termo-de-desinterdicao` | sim: trilha e acesso | MARCADA |
| `/relatorios/ocorrencias.csv` | sim: `exportacoes` e, no nível completo, trilha administrativa | MARCADA |
| `/avisos` | sim: materializa avisos de prazo vencido e saídas sem retorno, expurga avisos com mais de 60 dias | MARCADA (muda dado do município) |
| `/ocorrencias/:id` (dossiê) | só `registrarConsulta`, o registro de que ele foi lido | NÃO marcada (decisão abaixo) |
| `/busca` | só `registrarConsulta`, quando o nome do solicitante casa | NÃO marcada (decisão abaixo) |
| `/documentos/validar/:codigo` | não (só lê a trilha) | leitura |
| `/oficios/:id/documento`, `/oficios`, `/oficios/:id` | não | leitura |
| `/publico/oficio/:token` | consome o link (`abrir_oficio`), mas é pública, sem token de acesso | fora da vigência por definição (em `SEM_TOKEN`) |
| `/armazenamento/objeto` | não (URL assinada) | fora (em `SEM_TOKEN`) |
| `/saude`, `/auth/recuperacao` | não | públicas |
| `/ocorrencias`, `/devolvidas`, `/mapa`, `/interditados`, `/duplicidades/consulta`, `/providencias/pendentes`, `/indicadores/painel` | não | leitura |
| `/trilha`, `/trilha/tipos`, `/relatorios/resumo`, `/relatorios/exportacoes`, `/relatorios/consultas` | não | leitura |
| `/saida-a-campo`, `/saida-a-campo/minha`, `/campo/meu-trabalho`, `/sincronizacao/pendencias` | não | leitura |
| `/evidencias/:id/url`, `/evidencias/ocorrencia/:id`, `/armazenamento/uso` | não | leitura |
| `/usuarios`, `/usuarios/:id/sessoes`, `/usuarios/eu`, `/equipes`, `/orgaos`, `/organizacao/retencao`, `/configuracao`, `/segundo-fator`, `/auth/eu`, `/auth/sessoes` | não | leitura |

Decisão sobre o dossiê e a busca (para a validação não reabrir por engano): o critério da marca é "o GET pratica um ato (emite documento, interdita, exporta) ou muda dado do município". `GET /ocorrencias/:id` e `GET /busca` também escrevem, mas só o registro de que foram lidos (`privacidade/consulta.ts`), que é a auditoria da própria leitura. Marcá-los foi tentado e reprovou dois testes existentes que fixam a decisão contrária (`acesso-suspenso.test.ts`, "leitura continua até o token vencer", e `familia-da-sessao.test.ts`, isolamento do coordenador rebaixado lendo o dossiê). Fazê-lo também antecipa a F03-E03 (vigência em toda leitura). Ficaram como leitura, registrado em `apps/api/PENDENCIAS.md`. O laudo e os termos continuam marcados porque emitir é um ato, e o acesso a eles é gravado junto.

`GET /avisos` decidido pela mesma regra: escreve dado do município (INSERT e DELETE em `avisos`), então é marcado. A pendência do `GET /avisos` escrever dentro de um GET continua da F07-E03 e da F04-E11; só a vigência passou a valer nele.

### Os testes

`dc360/apps/api/test/get-com-efeito.test.ts` (novo, 10 casos):

1. Controle: quem está vigente continua emitindo (termo interdita e grava, CSV grava `exportacoes`), o que prova que as "pegadas" enxergam escrita.
2. Quatro sondas (conta desativada, papel rebaixado, sessão encerrada por quem administra, cadeia encerrada depois da renovação com o token anterior à rotação), cada uma contra termo de interdição (HTML e PDF), laudo (HTML e PDF), termo de desinterdição, CSV básico e CSV completo, em GET e em HEAD (14 pedidos por sonda). Esperado: a MESMA resposta que um POST de escrita teria com o mesmo token (403 `conta_desativada`, 401 `nao_autenticado` ou 401 `sessao_encerrada`) e NADA gravado: contagens de `documento_emitido`, de toda a trilha, de `ocorrencia_consultas`, de `exportacoes` e `interditada_em` iguais antes e depois.
3. Lista explícita `COM_EFEITO`: sem entrada morta; e, com a conta desativada, o conjunto de GET que responde `conta_desativada` é igual à lista, nem mais nem menos.
4. Varredura do fonte de `src/rotas`: GET cujo corpo escreve (lista de padrões, sem contar comentários) exige `ROTA_GET_COM_EFEITO`; GET marcado que não escreve reprova. É heurística (um GET que escreve por helper de nome novo escapa), por isso a lista comportamental do item 3 é a prova principal.
5. Varredura de escrita com conta desativada: toda rota POST, PATCH, PUT e DELETE fora de `SEM_TOKEN` responde 403 `conta_desativada`, e contagens de trilha, ocorrências, usuários, equipes, órgãos e evidências não mudam. Âncora: a árvore precisa ter os quatro métodos. Este caso passa também antes do conserto (a escrita por método já era coberta pela E04 original); é a cobertura de PATCH, PUT e DELETE que a validação disse faltar.
6. `/auth/encerrar-sessoes` com o token anterior à renovação: encerra 1 (a outra pessoa) e a cadeia de quem pediu continua renovando.

### Números (cada saída está numerada nesta pasta)

| Teste | Antes do conserto | Depois |
| --- | --- | --- |
| `get-com-efeito.test.ts` (novo) | 7 reprovados e 3 aprovados de 10 (`01`) | 10 de 10 (`02`) |
| `npm run test:api` | 1267 testes (antes da correção, valor que a documentação afirmava) | 98 arquivos, 1277 de 1277 (`03`) |
| `superficie`, `vigencia-na-escrita`, `familia-da-sessao`, `acesso-suspenso`, `sessoes-da-conta` | n/a | 5 arquivos, 87 de 87 (`04`) |
| `npm run test:isolamento` | n/a | 12 arquivos, 327 aprovados e 3 pulados (os 3 de `db/test/busca.test.ts`, que já eram) de 330 (`05`) |
| `npm run test:e2e:api` | base sem o conserto da API: 271 aprovadas, 0 falhas (`07`) | 271 aprovadas, 0 falhas, zero erro de console (`06`) |
| `npm run typecheck` | n/a | limpo (`08`) |
| `npm run conferir:numeros` | 5 afirmações desatualizadas (a API passou a 1277, o total a 2861, o do aplicativo somado a 4722) | 24 de 24 batem (`09`) |
| Portão de conteúdo (`regras-de-conteudo.test.ts`) | n/a | 8 de 8 (`10`) |
| `npm run test --workspace @dc360/web` | n/a | 43 arquivos, 643 de 643 (`11`) |
| `node --test scripts/*.test.mjs` | n/a | 209 de 209 (`12`) |

Prova de que o teste morde: a saída `01` foi gerada com `git stash push -- dc360/apps/api/src` (código de `src/` sem o conserto, teste novo presente) e a `02` com o conserto de volta. Os 7 reprovados antes são as 4 sondas, a lista comportamental, a varredura do fonte e o `/auth/encerrar-sessoes`. Os 3 aprovados antes são o controle, a lista sem entrada morta e a varredura de escrita por método.

### Limitações e o que fica de fora

- Vigência em LEITURA pura (e o dossiê e a busca, que só gravam o registro da própria leitura) continua da F03-E03; conta desativada ainda lê até o token vencer nessas rotas. Dito em `PENDENCIAS.md` e no README.
- O teste de varredura do fonte é heurístico, como dito acima.
- O CSV foi sondado com a conta da coordenadora Helena, nos dois níveis (básico e completo com justificativa). Não há caso com a conta de quem administra no nível completo, que é o que também grava a trilha administrativa; a trava é a mesma, porque `exigirAutenticacao` (vigência) roda antes de `exigirPostoParaDadoPessoal` e de qualquer escrita.
- `docs/roadmap-v2/03-fase-00-estabilizacao.md` ainda diz, na descrição da E04, que `GET /avisos` segue fora da vigência até a F03-E03. É texto do plano e não foi alterado; o código e a documentação do produto já dizem o contrário.
- Nenhuma validação em aparelho; nada nesta correção toca o aplicativo de campo.

## Justificativa

A causa estava num único predicado: o método HTTP não é uma medida confiável de "isto escreve". A arbitragem em Opus indicou o conserto mínimo dentro do escopo da E04: marcar a rota, e não o método, e deixar a vigência da leitura pura para a F03-E03. A marca por configuração de rota é o mesmo mecanismo que o produto já usava (`filaDoCampo`), é lida em `req.routeOptions.config`, e o HEAD automático do Fastify a herda, o que fecha o caminho que o red team usou para evitar o GET.

A lista explícita conferida pelo comportamento existe porque uma regressão estrutural é mais provável do que uma regressão pontual: a próxima rota GET que emitir, exportar ou interditar vai ser escrita por alguém que não leu esta correção. Duas travas independentes (lista por comportamento e varredura do fonte) falham em lugares diferentes quando isso acontecer.

O dossiê e a busca ficaram de fora porque a única escrita deles é o registro de acesso à própria leitura. Tratá-los como ato mudaria o contrato de leitura que dois testes existentes fixaram de propósito, e é exatamente o que a F03-E03 vai decidir para a leitura inteira.

O ajuste do cliente do painel (`http.ts`) é pequeno e é consequência direta: com a vigência valendo no sino, a primeira tela de um coordenador com papel alterado passa a receber 401 em um GET de carga, o que o cliente já tratava, mas deixava o corpo do 401 sem consumir. Isso é um defeito do cliente que a F03-E03 exporia em toda leitura; corrigi-lo agora custa uma linha e mantém o `test:e2e:api` no mesmo 271 de antes.

A preservação da cadeia em `/auth/encerrar-sessoes` era pequena e clara (uma cláusula de SQL e um caso de teste), então foi corrigida em vez de registrada.
