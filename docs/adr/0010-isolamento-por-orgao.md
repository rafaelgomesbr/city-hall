# ADR 0010: isolamento por órgão dentro do município, com o órgão como contexto e nunca como tenant

- **Data da decisão:** 26/10/2026 (registro escrito, V2-F04-E01). As decisões de
  origem são a D-08, a D-18, a D-23 e a D-24 do Rafael
  (`docs/roadmap-v2/01-decisoes-e-principios.md`).
- **Situação:** PROPOSTA. Aceite pendente do Rafael (H116), que depende do aceite
  da ADR 0009 (H97), e segunda leitura de segurança de outra família de modelo
  antes do aceite. Até o aceite, o código da F04 segue esta proposta como
  premissa (plano de execução da F04, seção 1, E01). Nenhum usuário de órgão com
  dado real entra no sistema antes do G04.
- **Depende de:** ADR 0001, ADR 0002, ADR 0009 (proposta)
- **Estende:** ADR 0001 (o isolamento no banco passa a valer também entre órgãos
  de um mesmo município, sem criar um segundo tenant)
- **Complementa:** ADR 0006 (o administrador continua sendo o teto do município,
  e o órgão fica dentro dele) e ADR 0008 (a visão do console continua sendo
  exceção nomeada do console, e não serve de modelo para o órgão)
- **Escopo:** `dc360/` (o produto real). Não se aplica ao protótipo em `mockup/`.

## Contexto

### Como é hoje (árvore `v2/f03` em `8e29684`)

Hoje **nada no banco separa um órgão de outro dentro do município**, porque
nenhum usuário de órgão entra no sistema: a providência sai por ofício e a
resposta volta por telefone, digitada pelo operador.

- `providencias` (migração 001, linha 274; destino no catálogo pela 017) não tem
  estado: "respondida" é `respondida_em` preenchido. `respondida_por` é texto
  livre. O papel de aplicação tem `UPDATE` na TABELA inteira (001, linhas 330 a
  333), e as policies de leitura, inserção e atualização (034, linhas 251 a 261)
  são só por município.
- Dois gatilhos rodam em `providencias` com os direitos de quem escreve:
  `providencia_amarra_no_catalogo` (017, `BEFORE INSERT OR UPDATE`) resolve o
  órgão pelo nome e, se não o acha, INSERE uma linha em `orgaos`;
  `providencia_respondida_toca_o_sino` (018, `AFTER UPDATE`) insere em `avisos`
  quando `respondida_em` passa de nulo a preenchido.
- `oficios` (017) tem policies de leitura e inserção só por município, sem
  `UPDATE` nem `DELETE`. O documento do ofício é montado na hora a partir da
  ocorrência (`apps/api/src/oficios/documento.ts`, por volta da linha 115) e
  imprime o nome do solicitante, a descrição e a vulnerabilidade a quem abrir o
  link de uso único (`abrir_oficio`, SECURITY DEFINER, 017).
- `avisos` (018) prende todo aviso a uma ocorrência (`ocorrencia_id NOT NULL`),
  e o tipo é conferido por `avisos_tipo_check` (redefinido na 031). O `GET
  /avisos` ESCREVE: materializa avisos de prazo ao ser aberto
  (`apps/api/src/rotas/avisos.ts`, linhas 209, 293 e 364, marcado
  `ROTA_GET_COM_EFEITO`).
- `trilha_eventos.origem` só aceita `campo` e `escritorio` (001, linha 308).
- `ACOES` (`packages/shared/src/permissoes.ts`) não tem ação de encaminhamento.
  O operador tem `responder_providencia` e `consultar_oficio`; só coordenador e
  administrador têm `encaminhar_providencia`.
- O portão (`dc360/db/test/isolamento.test.ts`) exige que TODA expressão de
  policy do produto contenha `app_organizacao_atual`, proíbe policy `ALL` nas
  tabelas que não se apagam e só aceita `DELETE` em policy nomeada; o catálogo
  nominal (`dc360/db/test/catalogo/`) lista as funções `SECURITY DEFINER` por
  assinatura completa, as exceções ao isolamento com o que dispensam e o que
  mantêm, e as colunas com `UPDATE` do papel de aplicação. Nada nele conhece
  órgão.

### O que a F03 entrega e esta ADR usa

Proposto pela ADR 0009 e construído na F03, ainda não juntado neste SHA: o papel
de conta `usuario_orgao` (E04); `orgao_vinculos`, o vínculo temporal da conta
com um órgão do mesmo município, com papel no órgão (`gestor`, `executor`,
`leitor`), início e fim (E05, migração 055); o contexto do ator no banco,
`app_ator_tipo()`, `app_ator_id()` (a conta), `app_pessoa_id()`,
`app_ator_papel()` e `app_orgao_atual()`, STABLE e sem SECURITY DEFINER (E06,
057); a plateia `dc360-portal` para conta `usuario_orgao` (E07); o manifesto
rota por ação com negação por padrão (E12); o recorte em lista positiva (E14);
as tabelas da pessoa sem grant ao `dc360_app` (E15 e 059); o sigilo da
ocorrência por policy RESTRICTIVE em `ocorrencias` e nas filhas (E21, 062); e as
listas nominais `FUNCOES_PRIVILEGIADAS` e `EXCECOES_AO_ISOLAMENTO` (parte 0B).

### Por que muda

A D-08 traz o órgão, inclusive o externo (concessionária, órgão estadual,
bombeiros), para dentro do sistema, com conta e vínculo em cada município. O
CA-06 prova o isolamento entre municípios; dentro de um município, Obras e Saúde
leriam tudo uma da outra, e a ocorrência inteira de cada uma. A saída óbvia, uma
condição de órgão com `OR app_orgao_atual() IS NULL` para não quebrar os
servidores, é fail-open: contexto esquecido vira acesso a tudo (REL:05 H.05;
BZ-D:SEC-43; BZ-D:AUT-38). A ADR 0009 (decisão 4) deixou esse isolamento para
esta.

### O que a ADR 0009 ensinou, e esta ADR aplica desde a primeira redação

A ADR 0009 passou por três rodadas de revisão de segurança. Cinco lições valem
aqui inteiras, e cada uma tem decisão própria abaixo:

1. **Nada que um órgão ou município observe pode depender de dado fora dele**:
   status, corpo, cabeçalho, tempo da resposta e todo efeito que ele consiga ler
   depois (decisão 13).
2. **Toda escrita fica na ordem de travas da ADR 0009**, e o encaminhamento diz
   em que nível entra (decisão 14).
3. **Toda exceção ao isolamento declara o que dispensa e o que mantém** (decisão
   16).
4. **Toda função privilegiada é conhecida por assinatura completa e ACL exata**,
   e diz o que faz diante do ator de órgão (decisão 15).
5. **Nenhuma marca de origem que o `dc360_app` consiga definir decide acesso**:
   a marca `em_nome_do_orgao` e a autoria dos eventos são derivadas do ator pelo
   banco, nunca recebidas (decisão 8).

## Decisão

**O tenant continua sendo só o município. Dentro dele, o usuário de órgão alcança
o encaminhamento do próprio órgão, o dossiê que a Defesa Civil compôs para ele e
mais nada. O banco nega o resto por policy, com o ator lido do contexto e o
vínculo reconferido em cada consulta, e nada que um órgão observe depende de
dado de outro órgão ou de outro município.**

As decisões 1 a 5 são os itens (a) a (e) da etapa V2-F04-E01
(`docs/roadmap-v2/05-api-identidade-autorizacao.md`), as "cinco decisões" que o
G04 cobra. A 6 é o esclarecimento que o G04 também cobra. A 7 traz as seis
decisões de desenho que o plano da F04 pediu fixadas antes da E05 (a a f). As
decisões 8 a 16 fixam o que as lições acima exigem. As alternativas descartadas
estão no fim.

### 1. O usuário de órgão nunca consulta `ocorrencias`

- O órgão lê o ENCAMINHAMENTO (a linha de `providencias`, expandida na E02) e o
  DOSSIÊ (`encaminhamento_dossies`, E04), e mais nada da ocorrência. Nenhuma
  tabela filha da ocorrência (`vistorias`, `evidencias`, `trilha_eventos`,
  `vistoria_orgaos_indicados`, `ocorrencia_consultas` e as outras) é lida pelo
  ator de órgão: todas são classe D (decisão 3), menos `trilha_eventos`, que é
  classe E (só INSERT, sem leitura).
- A família de rotas do órgão (E08, `/v1/orgaos/:orgaoId/...`) nunca lê
  `ocorrencias`, nem sob outro ator: não existe na rota do órgão consulta feita
  como `servidor` ou `sistema` "só para buscar um campo". O que o órgão precisa
  saber da ocorrência está no dossiê, porque a Defesa Civil o pôs lá.
- A composição do dossiê lê a ocorrência, e por isso acontece só na rota da
  Defesa Civil, sob o ator dela (E04 e E08). É exceção declarada (decisão 16).
- A resposta da API ao órgão é lista de INCLUSÃO de campos (E08): nunca
  `ocorrenciaId`, nunca `parent_id`, nunca coluna da ocorrência. A coluna
  `providencias.ocorrencia_id` é legível no banco pela classe A (é um
  identificador opaco de uma linha que o órgão não alcança), e a API não a
  devolve; a E08 prova isso no contrato.
- O espelho do ato do órgão na trilha da ocorrência é INSERT sem leitura (classe
  E, `registrarEvento` sem `RETURNING`).

### 2. RLS por órgão só no domínio do encaminhamento (classe A), fail-closed

- **Classe A** são as tabelas que o órgão lê: `providencias`,
  `encaminhamento_eventos` (só as linhas com `visivel_ao_orgao`),
  `encaminhamento_dossies` e `oficios`; a E11 acrescenta `avisos_do_orgao`. A
  policy delas, para cada comando que existir, tem a forma:

  ```sql
  organizacao_id = app_organizacao_atual()
  AND (app_ator_tipo() IN ('servidor', 'sistema')
       OR orgao_id = (SELECT app_orgao_vigente()))
  ```

  O segundo ramo vale só onde a tabela abaixo dá o comando ao órgão; onde não
  dá, a policy daquele comando fica só com o primeiro ramo.

- **O que cada ator faz em cada tabela da classe A:**

  | Tabela | SELECT | INSERT | UPDATE |
  | --- | --- | --- | --- |
  | `providencias` | servidor, sistema; órgão nas do próprio órgão | servidor | servidor; órgão nas do próprio órgão, só nas colunas que a matriz coluna por ator lhe dá (decisão 8) |
  | `encaminhamento_eventos` | servidor, sistema; órgão nas do próprio órgão com `visivel_ao_orgao` | servidor, sistema; órgão nas do próprio órgão, com autor igual ao ator e `visivel_ao_orgao` verdadeiro | ninguém (append-only, ADR 0002) |
  | `encaminhamento_dossies` | servidor, sistema; órgão nas do próprio órgão | servidor | servidor e sistema, só `campos_sensiveis` (retenção da F05-E09); órgão nunca |
  | `oficios` | servidor, sistema; órgão nas do próprio órgão | servidor | ninguém (017) |

- **Contexto ausente é zero linhas.** Sem ator, `app_ator_tipo()` é nulo e o
  `IN` não é verdadeiro; sem vínculo, `app_orgao_vigente()` é nula e a igualdade
  não é verdadeira. **`IS NULL` é proibido em toda policy de órgão**, e `OR
  true` também: nenhuma policy abre por falta de contexto. A E06 confere isso no
  catálogo e prova que acusa uma policy plantada com cada um.
- **A lista de atores é positiva.** Toda condição sobre o ator escreve quem PODE
  (`IN ('servidor', 'sistema')`), nunca quem não pode (`<> 'usuario_orgao'`).
  Assim um tipo de ator novo (o cidadão da F15, por exemplo) nasce negado em
  todas as tabelas, e cada uma que ele precisar ganha a classe dele na ADR dele.
- **Servidor e sistema veem o município inteiro, como hoje**, menos o que o
  sigilo da ocorrência já tira do servidor (decisão 7, item b).
- Para escrever, a policy só deixa passar o que é do próprio órgão; o que o
  órgão PODE mudar dentro da linha dele é a matriz coluna por ator (decisão 8) e
  a máquina de estados (decisão 9), as duas no banco.

### 3. Negação RESTRICTIVE nas demais tabelas (classes B, C, D, E e "sem alcance")

Toda tabela de negócio que não é da classe A recebe, por comando, uma policy
RESTRICTIVE `TO dc360_app` que nega o ator de órgão, na forma do item a da
decisão 7. `TO dc360_app` para não alcançar as policies do console
(`dc360_console`, ADR 0008). As classes:

| Classe | Tabelas (lista inicial; a E06 fecha a lista nominal) | O que o ator de órgão faz |
| --- | --- | --- |
| B, a conta própria | `usuarios`, `sessoes`, `orgao_vinculos` e as tabelas da conta que a 059 da F03 deixa com grant ao `dc360_app`; `avisos_do_orgao_lidos` (E11) | só as linhas da própria conta (`app_ator_id()`); escrita só onde a etapa dona declarar |
| C, leitura do catálogo | `orgaos`, `categorias_de_demanda`, `organizacoes` (`id = app_organizacao_atual()`), `orgao_competencias` (E15) | lê; nunca escreve |
| D, todas as outras | `ocorrencias` e todas as filhas, `equipes`, `exportacoes`, `trilha_administrativa`, `aparelhos`, `oficio_envios`, `oficio_aberturas` e o resto | nada: `app_ator_tipo() IN ('servidor', 'sistema')` |
| E, só INSERT limitado | `trilha_eventos` e `avisos` | só INSERT, nas condições abaixo; sem SELECT, UPDATE nem DELETE |
| sem alcance | as tabelas sem nenhum grant ao `dc360_app` (`pessoas`, `origens_de_conta`, as tabelas da pessoa da E11 e da E19, as do console) | nada, porque o papel de aplicação não as toca |

- **Classe E, `trilha_eventos`:** INSERT do ator de órgão só com `origem =
  'portal'` (a E05 acrescenta o valor ao CHECK), `autor_id = app_ator_id()`,
  `autor_papel = 'usuario_orgao'` e `ocorrencia_id` de um encaminhamento do órgão
  vigente (conferido dentro do `WITH CHECK`, sob a RLS de `providencias`).
- **Classe E, `avisos`:** INSERT do ator de órgão só no tipo
  `providencia_respondida` a partir da E05 (o gatilho 018, decisão 7, item e) e
  nos tipos `encaminhamento_*` a partir da E11, e só com `ocorrencia_id` e
  `chave_do_fato` de um encaminhamento do órgão vigente, conferidos no `WITH
  CHECK`.
- **Por que o `WITH CHECK` amarra a chave ao encaminhamento do órgão:** a
  verificação de chave estrangeira do Postgres não passa pela RLS. Um INSERT do
  ator de órgão com um `ocorrencia_id` qualquer daria "violação de chave
  estrangeira" para ocorrência inexistente e sucesso para ocorrência existente
  de outro órgão: um oráculo de existência. Com a amarração, o `WITH CHECK` (que
  o Postgres confere antes da chave estrangeira) recusa os dois casos do mesmo
  jeito (decisão 13).
- **Policy de `orgao_vinculos` não consulta `orgao_vinculos`**, nem direta nem
  por `app_orgao_vigente()`: o Postgres recusa RLS recursiva, e a função da
  decisão 4 lê essa tabela. A policy da classe B ali usa só `app_ator_id()` e
  `app_organizacao_atual()`.
- **A lista do gestor.** Para atribuir `destinatario_id` (E08, CP-20), o gestor
  precisa ver os colegas do próprio órgão, e a classe B só lhe mostra a própria
  linha. A forma (policy de colega restrita ao órgão vigente e ao papel
  `gestor`, sem recursão, ou nome copiado no vínculo, ou função de leitura
  estreita na lista nominal) é decidida na E05 com teste; o que esta ADR fixa é
  o limite: o gestor vê os vínculos vigentes do órgão vigente e, das contas
  desses vínculos, só o que a E08 declarar por lista de inclusão; executor e
  leitor só a própria linha; ninguém vê conta fora do órgão vigente.

### 4. O vínculo é reconferido no banco por `app_orgao_vigente()`

- `app_orgao_vigente()` é SQL, STABLE, sem SECURITY DEFINER, sem parâmetro.
  Devolve `app_orgao_atual()` somente quando `app_ator_tipo()` é
  `usuario_orgao` E existe vínculo vigente de `app_ator_id()` (a CONTA) com
  aquele órgão, no município do contexto; em qualquer outro caso, nulo.
- Ela lê `orgao_vinculos` com os direitos de quem chama, sob a classe B (a
  própria linha), e por isso não precisa de privilégio. O `IS NULL` sobre
  contexto (`app_*() IS NULL`) é proibido também no corpo dela; o único `IS
  NULL` admitido ali é o que RESTRINGE (vínculo sem `fim`, por exemplo), e a E06
  confere o corpo.
- Ela usa a CONTA, nunca a pessoa: `app_pessoa_id()` não resolve vínculo. Uma
  pessoa com conta em A e em B, vinculada à "mesma" concessionária nos dois,
  tem dois órgãos diferentes (uma linha em cada município, decisão 6), e o token
  de A só alcança o vínculo da conta de A.
- O órgão da requisição vem da ROTA (`:orgaoId`) e vira `app.orgao_atual`; a API
  confere o vínculo antes (sem vínculo, 404, E08) e o banco confere de novo em
  cada consulta. Um `orgao_atual` forjado sem vínculo dá zero linhas. Um vínculo
  encerrado deixa de valer na transação seguinte.
- **O que esta camada protege, e o que não protege.** Como a organização (ADR
  0001), o ator é definido pela própria API, a partir do token verificado e da
  vigência (F03-E06). A RLS por órgão protege contra o erro da API (filtro
  esquecido, id trocado, órgão errado na rota), não contra a API comprometida,
  que poderia definir qualquer ator. É a mesma régua do isolamento entre
  municípios, e é por isso que o papel de banco próprio do portal fica como
  alternativa a reavaliar (fim do documento).
- `EXECUTE` exato: `dc360_app` (que precisa dela nas policies), sem `PUBLIC`;
  conferido no catálogo do órgão (E06).

### 5. Documento e arquivo do órgão nascem do dossiê

- Tudo o que o órgão recebe por escrito sai do dossiê: a tela do portal (F11),
  o documento do link do ofício durante a transição (E12, decisão 12) e qualquer
  PDF futuro para o órgão (F09 e F11). Nenhum deles lê `ocorrencias`.
- Os arquivos que o órgão vê são os anexos do próprio órgão (F06 e F11-E13) e
  os que a Defesa Civil incluir no dossiê. Nunca a URL de uma evidência da
  ocorrência: `GET /v1/evidencias/:id/url` e `/v1/evidencias/ocorrencia/:id`
  respondem 404 ao ator de órgão (cenário 4 da E13), e `evidencias` é classe D.

### 6. O órgão não é tenant, e a pessoa global não o altera

- O tenant continua sendo SÓ o município. O órgão é uma linha de `orgaos`
  DENTRO de um município; o órgão externo que atende vários municípios tem uma
  linha em cada um (F03-E17) e não existe catálogo global de órgãos.
- **A organização continua vindo só do token verificado** (CLAUDE.md, ADR
  0009, decisão 2). O órgão da rota nunca muda o município: o vínculo é da conta
  no município do token, com chave composta com o órgão do mesmo município
  (F03-E05), e um `:orgaoId` de outro município não tem vínculo e responde 404.
- **A pessoa global não muda nada disto.** O que a pessoa tem em outro
  município (conta, vínculo, órgão) nunca entra no contexto, nunca resolve
  vínculo (decisão 4) e nunca muda uma resposta (decisão 13). Não existe painel
  do órgão com encaminhamentos de vários municípios ao mesmo tempo: o
  engenheiro da concessionária troca de município (ADR 0009, decisão 2) e vê um
  de cada vez.
- **Recurso de outro órgão ou de outro município responde 404, nunca 403.** O
  403 só existe para o que o órgão já enxerga: ação que o papel no órgão não
  permite (leitor aceitando) ou item do próprio órgão atribuído a outro
  executor (cenário 8 da E13).

### 7. As seis decisões de desenho fixadas para a E05 (a a f)

**a) RESTRICTIVE diante da regra textual do portão (P-03).** O portão exige que
toda expressão de policy do produto contenha `app_organizacao_atual`, e uma
policy `TO dc360_app` é do produto. Por isso toda policy de órgão, inclusive a
RESTRICTIVE, repete `organizacao_id = app_organizacao_atual()` (em
`organizacoes`, `id = app_organizacao_atual()`), o que não muda o efeito. As
policies são por comando (SELECT, INSERT, UPDATE), nunca `ALL` nem `DELETE`.
Nas tabelas que já têm `DELETE` em policy nomeada (o expurgo do sino, por
exemplo), a permissiva de `DELETE` é redefinida com o MESMO nome exigindo ator
`servidor` ou `sistema`, e o portão continua vendo um `DELETE` só, com o nome
que ele conhece. A F04 nunca edita `isolamento.test.ts` nem
`desfazer-migracao.test.ts`; se a parte 0D ou a 5B da F03 ensinarem o portão a
tratar RESTRICTIVE, segue a regra delas, e esta decisão é reescrita por nota.

**b) Sigilo (CP-52) contra o dossiê (H123).** A 062 da F03 põe uma RESTRICTIVE
de sigilo em `ocorrencias` e nas filhas, `providencias` inclusive: a ocorrência
`restrito` só é vista por coordenador, administrador, quem abriu e a equipe
atribuída. O encaminhamento cruza isso, e a regra fica assim:

1. **Só compõe quem lê a restrita.** O dossiê é composto sob o ator da Defesa
   Civil e lê a ocorrência sob a RLS dela, sigilo incluído; a policy de INSERT
   de `providencias` para servidor exige que ele possa ver a ocorrência, para
   que um erro da API não crie encaminhamento de restrita sem a leitura.
2. **O dossiê enviado não herda o nível do lado do órgão.** O envio é o ato
   deliberado de mostrar ao órgão aquilo que a Defesa Civil escolheu, com
   justificativa nos campos sensíveis. O órgão destinatário lê o encaminhamento,
   o dossiê e os eventos visíveis do próprio órgão sem passar pelo sigilo; na
   RESTRICTIVE de sigilo de `providencias`, o ramo do órgão é exatamente a
   condição da classe A, e nada mais.
3. **Do lado dos servidores, o sigilo continua inteiro.** Eventos, dossiês e
   ofícios de encaminhamento de ocorrência restrita só são lidos por servidor
   que pode ver a ocorrência. Como `encaminhamento_eventos` e
   `encaminhamento_dossies` não têm `ocorrencia_id`, a RESTRICTIVE de sigilo
   delas confere pela linha do encaminhamento, e a lista de filhas do sigilo
   ganha as duas.
4. **Restringir depois do envio não recolhe o que foi enviado.** O órgão
   continua vendo o que já recebeu; um envio novo só por quem lê; a Defesa Civil
   pode cancelar o encaminhamento. A trilha registra a mudança de nível como
   hoje.

**c) A classe "sem alcance" para as tabelas da pessoa sem grant.** Uma tabela
que o `dc360_app` não toca não precisa de policy de órgão, e uma policy nela
seria enfeite que o teste confundiria com proteção. A classe "sem alcance" é
conferida no catálogo pelo que a define: nenhum grant de tabela nem de coluna ao
`dc360_app` nem a `PUBLIC`, e RLS ativada e forçada. Se um grant aparecer, a
classe reprova e a tabela precisa de uma classe de verdade.

**d) `app_orgao_vigente()` não consulta o termo (P-14).** O aceite versionado do
termo do órgão externo (CP-51, F03-E17 e F11-E24) é condição de uso do portal,
conferida na API antes da rota do órgão. Ele não entra na função: a função fica
com uma pergunta só (há vínculo vigente da conta com este órgão?), STABLE e
barata, sem ler mais uma tabela por linha avaliada. Consequência assumida: um
erro da API que pule o termo expõe só o que o vínculo já permite, nunca outro
órgão nem outro município.

**e) Gatilhos 017 e 018 sob o ator de órgão (P-15).**
`providencia_amarra_no_catalogo` (017) é restrito a INSERT, ou fica inerte
quando o destino não muda, na 070 (E07): ele nunca mais resolve órgão pelo nome
num UPDATE, e o órgão nunca dispara a inserção em `orgaos` (classe C, sem
escrita). `aviso_de_providencia_respondida` (018) roda com os direitos de quem
escreve e, sob o ator de órgão, insere em `avisos`: a E05 aceita esse INSERT
como classe E, só no tipo `providencia_respondida` e amarrado ao encaminhamento
do órgão (decisão 3). O `ON CONFLICT DO NOTHING` do gatilho é provado na E05 sob
o ator de órgão. A E11 acrescenta os tipos `encaminhamento_*` e decide se
aposenta o 018. A E05 acrescenta `portal` ao CHECK de `trilha_eventos.origem`.

**f) O auxiliar de negação não é executável pela aplicação.**
`aplicar_negacao_ao_usuario_de_orgao(tabela)` monta e executa DDL (`CREATE
POLICY`). Ele existe só para migrações: não é SECURITY DEFINER; tem o `EXECUTE`
retirado de `PUBLIC` (que o Postgres concede por padrão a toda função) e não o
concede ao `dc360_app` nem ao `dc360_console`; recebe a tabela como `regclass`;
e só cria o conjunto fixo de RESTRICTIVE da classe D, por modelo constante. O
catálogo do órgão (E06) confere a ACL exata e prova que o `dc360_app` recebe
"permissão negada". Se a E05 preferir, o auxiliar é trocado por um modelo de
SQL em arquivo, testado pelo catálogo (nenhuma função no banco, nada a
conceder). As duas formas cumprem esta decisão; a função com `EXECUTE` de
`PUBLIC` não cumpre.

### 8. Quem age em nome de quem: P-12 e D-24

- **D-24 no encaminhamento:** as transições da Defesa Civil (criar, cancelar,
  concluir, pedir complemento, reenviar, reencaminhar, alterar prazo, cobrar,
  escalonar, responder esclarecimento) exigem a ação `gerir_encaminhamento`, só
  de coordenador e administrador (criar exige a ação de encaminhar, também só
  deles). O banco repete: o gatilho de transição (E03) confere
  `app_ator_papel()` contra a mesma lista, igual à do shared por teste.
- **`usuario_orgao` nunca faz transição da Defesa Civil**, nem com papel
  `gestor` no órgão.
- **P-12, resposta em nome do órgão.** Enquanto o órgão não usa o portal (até o
  CP-22), o servidor com `responder_providencia` (operador, coordenador,
  administrador) registra o aceite e a resposta EM NOME do órgão. O gatilho da
  E03 aceita o ator `servidor` nas transições do órgão só nessas duas, e só com
  a marca `em_nome_do_orgao`.
- **A marca não é parâmetro.** O banco a deriva do ator: evento de transição do
  órgão gravado sob ator `servidor` tem a marca, sob ator `usuario_orgao` não
  tem, e um valor diferente do derivado é recusado. Do mesmo jeito,
  `autor_tipo` e `autor_id` do evento são conferidos contra `app_ator_tipo()` e
  `app_ator_id()`, e `autor_nome` e `autor_papel` são cópia do que a vigência
  disse. A marca não autoriza nada: quem autoriza é o papel conferido no banco.
  Ela só impede que o ato do servidor apareça como ato do órgão.
- **Matriz coluna por ator.** Privilégio de coluna é do PAPEL DE BANCO, não do
  ator: o ator de órgão e o servidor são o mesmo `dc360_app`. Por isso "o órgão
  não altera a prioridade" (E14) não se faz com `GRANT`: um gatilho `BEFORE
  UPDATE` em `providencias` confere, por ator, quais colunas podem mudar. O ator
  de órgão muda só as colunas do aceite, da resposta e do pedido de
  esclarecimento, mais `destinatario_id` quando o papel no órgão é `gestor`;
  nunca `prazo_em`, `prioridade`, `categoria_id`, `orgao_id`, `descricao` nem as
  de cancelamento e conclusão. A lista vive no shared e é igual no banco por
  teste. Em `encaminhamento_dossies`, só servidor e sistema mudam
  `campos_sensiveis`.

### 9. A máquina de estados do encaminhamento, com o ator de cada transição

Sete estados (E02): `enviado`, `aceito`, `aguardando_dc`, `respondido`,
`devolvido`, `concluido`, `cancelado`. `prazo_vencido` e `sem_aceite` são
derivados, nunca estados. A tabela vale igual no shared
(`TRANSICOES_DO_ENCAMINHAMENTO`, E03 parte shared) e no banco
(`transicoes_do_encaminhamento()` e o gatilho `encaminhamento_transicao_valida`,
E03), com teste que compara as duas:

| De | Para | Quem (ator e papel) | Evento |
| --- | --- | --- | --- |
| (novo) | `enviado` | servidor coordenador ou administrador | `enviado`, com o dossiê versão 1 |
| `enviado` | `aceito` | órgão, vínculo `executor` ou `gestor`; ou servidor com `responder_providencia`, com a marca (P-12) | `aceito` |
| `enviado` | `devolvido` | órgão, vínculo `executor` ou `gestor` (D-23: só antes do aceite) | `devolvido`, com motivo e destino sugerido do catálogo |
| `enviado` | `cancelado` | servidor coordenador ou administrador | `cancelado`, com motivo |
| `aceito` | `respondido` | órgão, vínculo `executor` ou `gestor`; ou servidor com `responder_providencia`, com a marca (P-12) | `respondido`, com a resposta da rodada no `detalhe` |
| `aceito` | `aguardando_dc` | órgão, vínculo `executor` ou `gestor` | `esclarecimento_solicitado` |
| `aceito` | `cancelado` | servidor coordenador ou administrador | `cancelado` |
| `aguardando_dc` | `aceito` | servidor coordenador ou administrador | `esclarecimento_respondido` |
| `aguardando_dc` | `cancelado` | servidor coordenador ou administrador | `cancelado` |
| `respondido` | `concluido` | servidor coordenador ou administrador | `concluido` |
| `respondido` | `aceito` | servidor coordenador ou administrador | `complemento_solicitado` |
| `devolvido` | `enviado` | servidor coordenador ou administrador | `reenviado`, com dossiê em versão nova |
| `devolvido` | `cancelado` | servidor coordenador ou administrador | `cancelado` |
| `concluido`, `cancelado` | nenhum | ninguém (terminais) | |

- O ator `sistema` não muda estado: grava `lembrete` (E10) e `escalonado`
  (E16). O `link` não muda estado: grava `visualizado` (E12). O leitor no órgão
  não muda estado nenhum. A divisão fina entre `executor` e `gestor` dentro das
  linhas do órgão é da E08 em `PERMISSOES_NO_ORGAO` (CP-20); a tabela acima é o
  teto que o banco confere.
- Devolver depois do aceite responde 409 `devolucao_so_antes_do_aceite` (D-23,
  já na E08 pela P-09; testes da E17); estado terminal responde 409
  `encaminhamento_encerrado` (E13); transição fora da tabela, 409
  `transicao_invalida`. Esses códigos só são devolvidos DEPOIS de a linha ter
  sido achada sob o ator do órgão (decisão 13): para encaminhamento de outro
  órgão, a resposta é 404 antes de qualquer conferência de estado.
- **Reencaminhar** cria um encaminhamento NOVO para outro órgão, com
  `parent_id`, dossiê próprio e evento `reencaminhado` invisível ao órgão que
  devolveu (CHECK no banco: esse tipo nunca é visível ao órgão). O órgão novo
  nunca vê a resposta do anterior, e o anterior nunca sabe para onde foi.
- **Ocorrência encerrada com encaminhamento aberto** (regra adotada na E13, a
  validar na F12-E02): o órgão ainda responde, a resposta entra como evento e
  não reabre a ocorrência; a Defesa Civil conclui.

### 10. O dossiê por lista de inclusão (CP-09, alternativa C como premissa)

- O dossiê é SNAPSHOT imutável, composto pela Defesa Civil no envio, por lista
  de INCLUSÃO (`CAMPOS_DO_DOSSIE`, E04 parte shared): campo fora do catálogo
  nunca é copiado. A minimização por lista de exclusão já vazou uma vez
  (`privacidade/lista.ts`) e não é usada aqui.
- **Premissa do CP-09, alternativa C:** mínimo fixo (protocolo, tipo COBRADE e
  endereço do local) mais o que a Defesa Civil marca caso a caso. Nome,
  contato, vulnerabilidade e descrição livre do relato são `sensivel` e só
  entram com justificativa escrita de no mínimo 20 caracteres, registrada no
  evento `enviado` pelas CHAVES dos campos, nunca pelos valores. O sensível fica
  em `campos_sensiveis`, coluna própria, nula por padrão, a única atualizável
  (retenção da F05-E09, CP-10).
- Reenvio cria versão nova; a anterior permanece. Legados ganham a versão 1 de
  origem `migracao` pela mesma lista.
- O CP-09 decide o conteúdo definitivo. Até ele, a mecânica e o padrão
  conservador são testáveis, e o primeiro encaminhamento com dado real fica
  bloqueado (H117).

### 11. Nenhum GET escreve (P-13)

- **Nenhum GET materializa estado ou fato de negócio.** O sino deixa de ser
  materializado ao abrir: um relógio grava os avisos com `comTenantDoSistema`,
  município a município (E11); `GET /avisos` passa a só ler. A visualização do
  encaminhamento pelo órgão é `POST .../visualizacao` e grava no máximo um
  evento por usuário e estado.
- **Nenhuma rota GET da família do órgão escreve nada**, nem registro de acesso.
- **GET que só registra o próprio acesso** (registro append-only de consulta, de
  emissão ou de exportação: os documentos e o CSV que hoje levam
  `ROTA_GET_COM_EFEITO`, e o link do ofício, decisão 12) fica numa lista
  nominal fechada, com rota, tabela de registro e motivo. O
  `get-nao-escreve.test.ts` (E11) confere a lista nos dois sentidos: GET fora da
  lista que muda linha reprova; GET da lista que muda linha fora da tabela
  declarada reprova; entrada sem rota reprova. Nenhuma tabela de estado de
  negócio pode estar na lista.
- "Reabre se um GET voltar a escrever" não admite risco aceito (H121), e a lista
  fechada é a forma de a regra valer para o código que já existe. Se o Rafael
  preferir a redação literal da E11 ("nenhum GET muda linha"), as rotas de
  documento e de CSV viram POST numa etapa própria, que não é da F04.

### 12. Ofício por link e D-05 (H125)

- Durante a transição até o portal (CP-22), o link de uso único continua (hash,
  prazo, uso único, 410 e 404, `abrir_oficio`). A página que ele abre mostra só
  o dossiê da versão vigente do encaminhamento, nunca `ocorrencias`; o campo
  sensível só aparece se o dossiê o incluiu; as observações da coordenação
  continuam (E12).
- **A D-05 diz que documento emitido é imutável. A página do link NÃO é o
  documento emitido:** é HTML montado na hora da abertura, como o ofício é hoje
  (017, "um documento guardado em cache seria a versão errada com cara de
  definitiva"). O registro do ofício (número, órgão, emissão, observações) já é
  imutável no banco, sem `UPDATE`. Para não haver mudança silenciosa, a página
  se identifica como visualização do encaminhamento, e o evento `visualizado`
  grava a versão do dossiê que foi mostrada. O documento emitido do ofício, com
  PDF, hash e versão do modelo, é da F09 (ADR 0013); quando existir, o link
  serve aquele documento ou deixa de existir, conforme o CP-22.
- A abertura grava o evento `visualizado` com `autor_tipo = 'link'` e sem autor,
  sob o ator `sistema`, na organização que `abrir_oficio` devolve. Link
  desconhecido não registra nada (017). O link é leitura: nenhuma resposta,
  nenhum estado de outro órgão, nenhuma lista. É a exceção nomeada ao "nenhum
  GET escreve" (decisão 16).

### 13. Não enumeração entre órgãos: status, corpo, cabeçalho, tempo e efeitos

**Nada que o órgão observe pode depender de dado de outro órgão ou de outro
município.** "Observar" tem o sentido da ADR 0009, decisão 3: status, corpo,
cabeçalhos, o tempo da resposta e todo efeito que ele consiga ler depois
(listas, contagens, totais, ordenação, sugestões, avisos, limites). Como isso é
cumprido:

1. **Achar o recurso é ler sob o ator do órgão.** A rota do órgão procura o
   encaminhamento pelo id sob a RLS do próprio ator; zero linhas é 404. Nunca
   uma leitura como `servidor` ou `sistema` para "ver se existe" e depois
   comparar o `orgao_id`. Id de outro órgão, id de outro município e id
   inexistente seguem exatamente a mesma sequência de comandos.
2. **Ordem das conferências na rota.** Plateia e vigência; vínculo vigente com
   o órgão da rota (sem vínculo, 404); conferências que não dependem do recurso
   (a ação no órgão, o corpo); a leitura do recurso sob o ator (404); e só então
   as que dependem dele (atribuição, estado, devolução depois do aceite).
   Nenhuma resposta diferente de 404 sai antes de o recurso ter sido achado sob
   o ator.
3. **Escrita não é oráculo.** As chaves estrangeiras do domínio são triplas
   (`organizacao_id`, encaminhamento, `orgao_id`): evento com encaminhamento de
   outro órgão e evento com encaminhamento inexistente violam a mesma chave do
   mesmo jeito. Toda chave que o ator de órgão grava para tabela que ele não lê
   é amarrada no `WITH CHECK` a um encaminhamento dele (decisão 3). A API
   traduz violação de chave estrangeira e de `WITH CHECK` do ator de órgão em
   404, igual ao inexistente. Toda unicidade que o ator de órgão alcança inclui
   `orgao_id` ou só existe sobre linhas dele.
4. **Contagens, totais, paginação, ordenação e busca** só sobre o que a RLS do
   órgão devolve (E09: o total devolvido a João nunca soma a Obras).
5. **Efeitos.** O que a Defesa Civil faz com o encaminhamento de outro órgão
   não muda nada que o órgão leia: reencaminhamento invisível ao devolvente,
   dossiê novo, `parent_id` fora do contrato. Limites de taxa são por
   solicitante e por órgão, nunca por encaminhamento no município inteiro.
6. **Tempo.** A prova principal é estrutural: a E13 captura a sequência de
   comandos SQL e confere que é a mesma para id de outro órgão, de outro
   município e inexistente, no detalhe, na lista e em cada ação. Há também um
   teste de tempo com margem declarada, no método da ADR 0009 (decisão 3), para
   o detalhe e para o aceite. Há um mecanismo conhecido a medir: o subselect
   `(SELECT app_orgao_vigente())` vira um parâmetro avaliado na primeira vez em
   que uma linha precisa da condição, então uma linha de outro órgão filtrada
   pela policy custa uma consulta a mais que um id inexistente. Se a diferença
   passar da margem, a E05 a neutraliza (por exemplo, forçando a avaliação em
   toda consulta da rota do órgão), e não a aceita como ruído. Passar no teste
   de tempo não é prova absoluta de ausência de canal temporal.
7. **Mensagens.** O 404 tem o mesmo corpo para todo caso, e nenhuma mensagem
   cita órgão, pessoa ou estado de recurso alheio.
8. **Exceções declaradas** (decisão 16): o catálogo de órgãos e a numeração
   sequencial do município.

### 14. Onde o encaminhamento entra na ordem das travas da ADR 0009

A ADR 0009 (decisão 7) ordena por níveis, de N1 (linha do município) a N9
(sessões), todo caminho que toca identidade. O encaminhamento entra DEPOIS de
todos eles:

| Nível | O que se trava | Como |
| --- | --- | --- |
| N10 | a linha do encaminhamento em `providencias` | UPDATE condicional (`WHERE id = $1 AND estado = ...`, com conferência de linhas afetadas) ou `FOR UPDATE` antes da transição; várias, em ordem crescente de id |
| N11 | as linhas filhas do encaminhamento | INSERT em `encaminhamento_eventos`, `encaminhamento_dossies` e `oficios`; a única espera é a de índice único (`chave_de_criacao`, visualização por usuário e estado, marco de lembrete, nível de escalonamento) |
| N12 | o que os gatilhos do encaminhamento escrevem | INSERT em `avisos`, `avisos_do_orgao` e `trilha_eventos`; INSERT em `orgaos` só no INSERT da Defesa Civil (017, P-15) |

**As regras:**

1. As regras 1, 2, 4 e 7 da ADR 0009 valem aqui sem mudança: nunca tomar nível
   menor do que um já seguro; gatilho só desce para níveis maiores; leitura sem
   trava é livre; INSERT de linha nova não é trava de nível.
2. **O caminho do encaminhamento não toma nenhum nível de N1 a N9.** Não trava
   município, pessoa, conta nem sessão. Lê o vínculo, a conta e a pessoa sem
   trava (regra 4 da ADR 0009), e o vínculo é reconferido dentro de cada
   comando por `app_orgao_vigente()`.
3. **As travas implícitas de chave estrangeira não fecham ciclo.** O INSERT e o
   UPDATE do encaminhamento tomam `FOR KEY SHARE` nas linhas pai
   (`organizacoes`, `usuarios`, `orgaos`). Esse modo só conflita com `DELETE` e
   com UPDATE de coluna de chave. Os caminhos de identidade usam `FOR SHARE` e
   UPDATE de colunas que não são chave (`ativo`, credencial, suspensão), que não
   conflitam com ele; `pessoa_id` é imutável (ADR 0009, decisão 1). O único
   `DELETE` dessas linhas é a eliminação do município, que segura N1, N2 e N8 e
   apaga as filhas antes dos pais: ela espera o encaminhamento em N10, e o
   encaminhamento não espera nada que ela segure. A eliminação continua sendo a
   única exceção declarada à regra 1, sem exceção nova.
4. **Nenhum caminho de identidade toca N10 a N12**, fora a eliminação. O
   encerramento de um vínculo e a desativação de uma conta não mexem em
   encaminhamento: o efeito chega pela leitura da transação seguinte. Uma
   atribuição (`destinatario_id`) concorrente com o encerramento do vínculo do
   atribuído pode ficar apontando para quem perdeu o acesso; o atribuído não lê
   mais nada, e o gestor atribui de novo. É consequência assumida, não ciclo.
5. **Os relógios** (lembrete da E10, escalonamento da E16, sino da E11) rodam
   como `sistema`, uma transação por encaminhamento ou vários em ordem
   crescente de id, tomando N10 e relendo o estado antes de gravar em N11 e N12:
   encaminhamento concluído na mesma hora não recebe lembrete.
6. Cada migração da F04 que cria ou redefine um caminho de escrita cita, no
   cabeçalho, o caminho e o nível de cada comando, como a ADR 0009 pede às da
   F03.

**Testes concorrentes obrigatórios**, com duas conexões, a ordem forçada nos
dois sentidos e nenhum 40P01: aceite do órgão contra cancelamento pela Defesa
Civil (um vence, o outro recebe 409, o estado final é um dos dois); duas
respostas (E07: uma 200 e uma 409, o texto da primeira intacto); resposta do
órgão contra a desativação da conta do autor e contra o encerramento do vínculo
(E05); aceite contra a eliminação do município (E05); lembrete contra conclusão
(E10).

### 15. Funções privilegiadas e o ator de órgão

- A RESTRICTIVE `TO dc360_app` não alcança o dono das funções. **Toda função
  SECURITY DEFINER executável pelo `dc360_app` é, por definição, uma porta em
  volta das classes da decisão 3**, e por isso cada uma precisa dizer o que faz
  diante do ator de órgão.
- O catálogo do órgão (E06) dá a cada entrada de `FUNCOES_PRIVILEGIADAS` (base,
  F03 e F04) uma declaração conferida por teste: `recusa` (a função confere
  `app_ator_tipo()` e recusa o ator de órgão; é o padrão para relógio e para o
  que é do servidor); `propria` (só alcança a conta ou a pessoa do próprio ator:
  vigência, autenticação, segundo fator); ou `antes_do_ator` (roda antes de
  existir ator: login, link de uso único). Função sem declaração reprova.
- Toda função privilegiada que a F04 criar (`varrer_lembretes_de_encaminhamento()`
  na E10 e o que a E11 e a E16 precisarem) entra no catálogo da própria etapa
  (`catalogo/f04-eNN.ts`) pela assinatura completa, com motivo, tenant, a lista
  exata de papéis com `EXECUTE` (sem `PUBLIC`) e o teste comportamental, e
  segue as regras de corpo da ADR 0009 (decisão 8: sem DDL, sem
  `session_replication_role`). A de relógio não tem parâmetro de município,
  devolve só ids e marco, e recusa quando o ator não é `sistema`.
- `app_orgao_vigente()`, o gatilho de transição, a matriz coluna por ator e o
  gatilho do sino do órgão NÃO são SECURITY DEFINER: rodam com os direitos de
  quem escreve, sob a RLS dele.

### 16. As exceções declaradas, cada uma com o que dispensa e o que mantém

| Exceção | O que dispensa | O que mantém | Etapa dona |
| --- | --- | --- | --- |
| Catálogo de órgãos visível ao órgão (classe C; `catalogo-de-destinos` da E08, para sugerir destino na devolução) | o isolamento por órgão no catálogo: o órgão sabe que os outros órgãos do município existem | município; nenhuma escrita; a API devolve só id, nome e sigla; nada de encaminhamento de outro órgão | E05, E08 |
| Numeração sequencial do município (número do ofício, 017; protocolo da ocorrência no dossiê, 001) | a não dependência de volume: o salto entre dois números que o órgão recebe revela quantos documentos o município numerou no meio | destino, conteúdo, órgão e ocorrência dos outros; nenhuma leitura; nenhuma outra contagem | existente; registrado aqui |
| Resposta em nome do órgão por servidor (P-12) | "só o órgão age pelo órgão", nas transições `aceito` e `respondido` | autoria verdadeira (autor servidor, marca derivada do ator), D-24, papel com `responder_providencia` conferido no banco | E03, E08; fim no CP-22 |
| Composição do dossiê | "nada do encaminhamento lê `ocorrencias`" | só sob o ator da Defesa Civil, só na rota dela, só campos catalogados, sigilo aplicado na leitura | E04, E08 |
| O dossiê enviado não herda o sigilo (decisão 7, b) | o sigilo da ocorrência do lado do órgão destinatário | o sigilo do lado dos servidores; composição e envio novo só por quem lê a restrita | E05 |
| `GET /publico/oficio/:token` escreve (decisão 12) | "nenhum GET escreve" | uso único, hash, prazo, nada fora do dossiê, nenhuma lista, nenhuma resposta; só a abertura e o evento `visualizado`, sob o ator `sistema` | E12; o fim do link é do CP-22 |
| GET que registra o próprio acesso (documentos e CSV, decisão 11) | "nenhum GET escreve" | só INSERT append-only na tabela de registro declarada; nenhuma rota da família do órgão | E11 (lista nominal) |
| Aviso de escalonamento a órgão de nível acima (E16) | "o sino do órgão só fala do próprio órgão": o órgão do nível sabe que um encaminhamento de outro órgão venceu | nenhuma leitura do encaminhamento (404), nenhum dossiê, protocolo ou pessoa; só ponteiro, órgão de origem e rótulo do nível | E16 |
| Leitura da linha de `providencias` com `ocorrencia_id` pelo órgão (classe A) | "o órgão não vê nada da ocorrência", no nível da linha | o id é opaco; a API não o devolve (lista de inclusão, E08); `ocorrencias` continua classe D | E05, E08 |

Exceção que não está nesta tabela não existe. Uma etapa que precise de outra
escreve a linha nesta ADR por nota de revisão, com as três colunas, antes do
código.

### Premissas do plano da F04 que esta ADR fixa como norma

| Premissa | O que diz | Aqui é |
| --- | --- | --- |
| P-01 | `v2/f04` nasce do `v2/f03` | ordem de trabalho |
| P-02 | migrações 067 a 077 provisórias | numeração, não norma |
| P-03 | a F04 não edita o portão; toda policy de órgão repete a organização; por comando; `DELETE` nomeado redefinido | NORMA (decisão 7, a) |
| P-04 | ordem de apagamento e saída redefinidas por uma parte por lote | ordem de trabalho |
| P-05 | módulos de rota novos, sem abrir `orgaos.ts` e `administracao.ts` | ordem de trabalho |
| P-06 | as duas famílias usam `dc360-portal` para o órgão; token do portal em rota do painel é a 401 da plateia | NORMA (H120) |
| P-07 | `/busca` só do painel; busca do órgão no `q` da família do órgão | NORMA na parte de alcance; redação da E09 a emendar (H120) |
| P-08 | `chave_de_criacao` nasce na E02, única por município | NORMA na parte de alcance: só a Defesa Civil cria, e a unicidade nunca é alcançável pelo órgão (decisão 13) |
| P-09 | a E08 já emite o 409 da devolução | ordem de trabalho |
| P-10 | partes do shared separadas | ordem de trabalho |
| P-11 | as chaves da F04 nascem fechadas e sem efeito | NORMA |
| P-12 | servidor responde em nome do órgão com a marca; `gerir_encaminhamento` só coordenação e administrador | NORMA (decisão 8; H119) |
| P-13 | nenhum GET escreve; sino por relógio | NORMA (decisão 11; H121) |
| P-14 | `app_orgao_vigente()` não confere o termo | NORMA (decisão 7, d) |
| P-15 | gatilhos 017 e 018 sob o ator de órgão; `portal` na origem da trilha | NORMA (decisão 7, e) |

## Consequências

### O que muda em cada etapa da F04

| Etapa | O que esta ADR exige dela |
| --- | --- |
| E02 | estados e colunas; `destinatario_id` com chave composta e gatilho que exige vínculo vigente no órgão do encaminhamento, lido sem trava (decisão 14); `UNIQUE (organizacao_id, id, orgao_id)` como alvo das chaves triplas; `chave_de_criacao` única por município, escrita só pela Defesa Civil; nenhuma policy nova (até a E05 nenhum ambiente com dado real liga `PORTAL_ATIVO`) |
| E03 | tabela de transições com o ator e o papel de cada uma (decisão 9), igual no shared e no banco; gatilho com `app_ator_tipo()`, `app_ator_papel()` e o papel no órgão (leitor não transita); autoria e marca `em_nome_do_orgao` derivadas do ator (decisão 8); `reencaminhado` nunca visível ao órgão (CHECK); chaves triplas |
| E04 | lista de inclusão e sensível só com justificativa (decisão 10); composição só sob o ator da Defesa Civil, com sigilo (decisão 7, b); `campos_sensiveis` atualizável só por servidor e sistema |
| E05 | classes A a E e "sem alcance" (decisões 2 e 3); `app_orgao_vigente()` (decisão 4); as seis decisões da decisão 7; `WITH CHECK` que amarra a chave ao encaminhamento do órgão; sigilo dos dois lados; testes concorrentes da decisão 14; o mecanismo de tempo da decisão 13, item 6, medido |
| E06 | catálogo do órgão: classe de cada tabela; policy de toda tabela com `orgao_id` com `app_orgao_vigente` ou `app_ator_tipo`, sem `IS NULL` nem `OR true`; corpo de `app_orgao_vigente()` sem `IS NULL` sobre contexto; ACL exata dela e do auxiliar de negação; declaração de cada função privilegiada diante do ator de órgão (decisão 15); cada ramo acusado num banco descartável |
| E07 | privilégio de coluna; resposta imutável; matriz coluna por ator (decisão 8); 017 restrito a INSERT ou inerte (P-15) |
| E08 | duas famílias de rota; 404 achado sob o ator do órgão, na ordem da decisão 13, item 2; autoria do token e da vigência; `orgaoId` só da rota, conferido; resposta por lista de inclusão sem `ocorrenciaId` nem `parent_id`; D-24 e P-12; visualização por POST |
| E09 | busca do órgão sob a RLS, sem total que some outro órgão; ofícios, exportações e `GET /orgaos` fechados ao token do portal (P-06, P-07) |
| E10 | relógio como `sistema`; função privilegiada sem parâmetro de município, só ids e marco, recusando outro ator (decisão 15); N10 antes de gravar (decisão 14) |
| E11 | sino do órgão (classe A) e lidos (classe B); `avisos` classe E com tipos `encaminhamento_*` amarrados; `GET /avisos` deixa de escrever; `get-nao-escreve.test.ts` com a lista nominal fechada (decisão 11) |
| E12 | página do link montada do dossiê vigente; evento `visualizado` sob `sistema` com a versão do dossiê mostrada; D-05 conforme a decisão 12 |
| E13 | os dez cenários; prova estrutural da mesma sequência de comandos e teste de tempo com margem (decisão 13, item 6); regra da ocorrência encerrada |
| E14 | prioridade só pela Defesa Civil, pela matriz coluna por ator e não por `GRANT` (decisão 8) |
| E15 | `orgao_competencias` classe C; competência só sugere e valida (CP-53, alternativa A como premissa); nada bloqueia a Defesa Civil |
| E16 | cadeia como dado do município (CP-53, alternativa C); aviso de escalonamento como exceção declarada (decisão 16); destinatário lendo o encaminhamento: 404; `ESCALONAMENTO_AUTOMATICO=nao` |
| E17 | devolução só antes do aceite, no shared, no banco e na API (D-23) |

### Testes obrigatórios que a etapa responsável traz

| Etapa | Teste |
| --- | --- |
| E03 | evento gravado sob ator `usuario_orgao` com a marca `em_nome_do_orgao`, ou sob `servidor` sem ela, recusado; `autor_id` diferente de `app_ator_id()` recusado; leitor transitando recusado no banco; operador concluindo recusado no banco (D-24); `reencaminhado` visível ao órgão recusado |
| E05 | Maria (Obras), João (Saúde), Ana (os dois) e Rita (servidora) no município A, mais o município B, com os casos positivos e negativos da etapa; INSERT de `trilha_eventos` e de `avisos` pelo ator de órgão com `ocorrencia_id` inexistente e com `ocorrencia_id` de ocorrência de outro órgão recusados com o MESMO erro; evento com encaminhamento de outro órgão e com encaminhamento inexistente recusados com o mesmo erro; o 018 disparado pela resposta do órgão grava o aviso uma vez; RESTRICTIVE de sigilo: Maria lê o encaminhamento de ocorrência restrita enviado à Obras, e o operador sem autoria não lê o dossiê dele; os testes concorrentes da decisão 14 |
| E06 | tabela com `orgao_id` e policy só por município reprova; policy com `IS NULL` reprova; policy com `OR true` reprova; tabela sem classe reprova; entrada da lista sem tabela reprova; classe "sem alcance" com grant reprova; função privilegiada sem declaração diante do ator de órgão reprova; `aplicar_negacao_ao_usuario_de_orgao` com `EXECUTE` de `PUBLIC` ou do `dc360_app` reprova |
| E07 | ator de órgão mudando `prioridade`, `prazo_em` ou `orgao_id` recusado pelo gatilho, com o privilégio de coluna presente |
| E11 | GET fora da lista nominal que muda linha reprova; GET da lista que muda tabela não declarada reprova |
| E13 | para cada rota do órgão: mesma sequência de comandos com id de outro órgão, de outro município e inexistente; teste de tempo com margem no detalhe e no aceite |

### O que fica proibido

São as condições que reabrem o G04, mais as que esta ADR acrescenta:

- usuário de órgão lendo dado de outro órgão ou qualquer linha de
  `ocorrencias` ou das filhas dela;
- rota da família do órgão que leia como `servidor` ou `sistema` antes de
  decidir o 404, ou que leia `ocorrencias` sob qualquer ator;
- tabela com `orgao_id` sem policy de órgão fail-closed; tabela de negócio sem
  classe; policy de órgão com `IS NULL` ou `OR true`; condição de ator escrita
  como negação (`<> 'usuario_orgao'`) em vez de lista positiva;
- `app_orgao_vigente()` SECURITY DEFINER, resolvendo vínculo pela pessoa, ou
  com `IS NULL` sobre contexto;
- policy de `orgao_vinculos` que consulte `orgao_vinculos`;
- função SECURITY DEFINER executável pelo `dc360_app` sem declaração diante do
  ator de órgão; o auxiliar de negação com `EXECUTE` de `PUBLIC` ou do
  `dc360_app`;
- marca `em_nome_do_orgao`, autoria ou `visivel_ao_orgao` de evento do órgão
  que o `dc360_app` consiga gravar diferente do que o banco deriva do ator;
- separação entre servidor e órgão feita por `GRANT` de coluna (que é do papel
  de banco, não do ator);
- `usuario_orgao` fazendo transição da Defesa Civil; operador fazendo transição
  da Defesa Civil;
- resposta de um encaminhamento sobrescrita;
- GET que escreva fora da lista nominal fechada da decisão 11, ou qualquer GET
  da família do órgão que escreva;
- resposta ao órgão (status, corpo, cabeçalho, tempo ou efeito) que dependa de
  dado de outro órgão ou município, fora das exceções da decisão 16; 403 onde o
  recurso é de outro órgão ou município;
- organização vinda de outro lugar que não o token verificado; órgão como
  tenant; token com órgão; painel do órgão com vários municípios ao mesmo tempo;
- escalonamento que dê leitura a quem não é do órgão; devolução depois do
  aceite;
- exceção ao isolamento fora da tabela da decisão 16;
- caminho do encaminhamento que tome nível de N1 a N9 da ADR 0009.

### Boas

- A regra número um do CLAUDE.md sai intacta: o tenant é o município, a
  organização vem do token, e o que muda é que, dentro do município, o banco
  passa a saber quem pede.
- A falta de contexto continua sendo falha segura em toda tabela: ator ausente,
  vínculo ausente ou órgão forjado são zero linhas.
- O órgão para de receber a ocorrência inteira por link (E12) e passa a receber
  o que a Defesa Civil escolheu, com justificativa para o sensível.
- A resposta deixa de ser texto livre digitado por quem atendeu o telefone:
  tem autor nominal, estado, evento e, quando é do servidor, a marca.
- Um tipo de ator novo nasce negado em todas as tabelas.

### Ruins, e assumidas

- **Mais policies e uma função a mais por consulta do órgão.** Cada tabela
  ganha RESTRICTIVE por comando, e cada consulta do órgão avalia
  `app_orgao_vigente()` uma vez. Medir com EXPLAIN na F24-E02.
- **A proteção é contra erro da API, não contra a API comprometida**, como a do
  município (decisão 4). Um papel de banco próprio do portal fecharia mais e
  custaria mais; fica para reavaliar.
- **O sigilo não acompanha o dossiê até o órgão** (decisão 7, b). Restringir
  depois do envio não recolhe o que foi enviado; a Defesa Civil cancela.
- **A numeração sequencial do município revela volume** ao órgão (decisão 16).
- **O operador continua respondendo em nome do órgão até o CP-22** (P-12), com a
  marca.
- **O termo do órgão externo é conferido só na API** (decisão 7, d).
- **O gestor precisa de uma forma estreita de ver os colegas do órgão** (decisão
  3), a decidir na E05 sem abrir `usuarios` além do órgão vigente.
- **Atribuição pode apontar para quem acabou de perder o vínculo** (decisão
  14, regra 4).
- **A regra "nenhum GET escreve" convive com uma lista nominal fechada** de GETs
  que registram o próprio acesso (decisão 11).
- **A página do link do ofício é montada na hora** e muda se a Defesa Civil
  reenviar com dossiê novo; o evento grava a versão mostrada (decisão 12).

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Órgão como sub-tenant (segunda variável de tenant em toda tabela) | Picaria o município em vários tenants, obrigaria os servidores a "trocar de órgão" para ver o município, e o órgão não tem dado próprio além do encaminhamento. A ADR 0009 já descartou o órgão como tenant (decisão 4). |
| Filtro só na aplicação (`WHERE orgao_id = ...` nas rotas) | Um filtro esquecido vaza, e "regra de negócio mora no banco" (CLAUDE.md). É exatamente o que o CA-06 impede entre municípios. |
| ACL por item (lista de quem vê cada encaminhamento) | Cresce por item, fica velha quando alguém entra ou sai do órgão, e o acesso deve seguir o vínculo. A atribuição nominal (CP-20) não é controle de acesso: dentro do órgão todos os vínculos veem, e a atribuição só decide quem age (403). |
| Visão `security_invoker` para o órgão (no lugar da RLS na tabela) | A regra sairia da tabela para um objeto que o portão não descobre, e a tabela continuaria aberta ao ator de órgão por qualquer outra consulta; sem `security_invoker` a visão passa por cima da RLS. A única visão do produto é a do console, exceção nomeada da ADR 0008, e não é modelo. |
| `OR app_orgao_atual() IS NULL` para não quebrar os servidores | Fail-open: contexto esquecido vira acesso a tudo (REL:05 H.05). Os servidores passam pelo ramo `app_ator_tipo() IN ('servidor', 'sistema')`. |
| Condição de ator como negação (`app_ator_tipo() <> 'usuario_orgao'`) | Ator nulo não passaria, mas um tipo novo (o cidadão) passaria em tudo. A lista positiva nega o desconhecido. |
| Acrescentar a condição de órgão em cada policy permissiva existente, em vez de RESTRICTIVE | Exigiria reescrever dezenas de policies, cada uma com chance de erro, e não protegeria a tabela nova que alguém criar sem lembrar desta ADR. A RESTRICTIVE é aditiva, e a classe obrigatória no catálogo (E06) pega a tabela nova. |
| Órgão no token | O órgão vem da rota e é conferido no banco; no token ele valeria quinze minutos depois de o vínculo acabar, que é o que a ADR 0009 proíbe para papel e vínculo. |
| `app_orgao_vigente()` SECURITY DEFINER | Leria vínculos passando por cima da RLS e aumentaria a lista de funções privilegiadas sem necessidade: a função comum lê a própria linha pela classe B. |
| Vínculo resolvido pela pessoa (`app_pessoa_id()`) | A pessoa tem vínculos em vários municípios; resolver por ela abriria o caminho para um vínculo de B valer com token de A. O vínculo é da conta. |
| O termo do órgão externo dentro de `app_orgao_vigente()` | Mais uma leitura por linha avaliada e uma pergunta a mais numa função que precisa ser simples; o termo é condição da API (decisão 7, d). |
| Marca `em_nome_do_orgao` recebida da API | Seria marca que o `dc360_app` define, a lição da ADR 0009. O banco a deriva do ator (decisão 8). |
| `GRANT` de coluna para separar o que o órgão e o servidor mudam | Privilégio é do papel de banco, e os dois são o mesmo `dc360_app`. A separação é o gatilho da matriz coluna por ator (decisão 8). |
| Papel de banco próprio do portal, já na F04 | Fecharia também a API comprometida, mas exige a decisão do CP-25 (hoje sobre a API pública), mais grants e funções para manter e o portão acomodando um terceiro papel. Fica para reavaliar quando o portal for processo separado (ADR 0014, F11-E01). |
| O órgão lendo a ocorrência "só nos campos do dossiê", por visão ou privilégio de coluna | Acesso ao dado vivo, que muda depois do envio, sem registro do que foi mostrado e sem a justificativa do sensível. O snapshot (decisão 10) é o que a Defesa Civil escolheu mostrar naquele momento. |
| Ofício por link lendo a ocorrência (como hoje) | Leva nome, descrição e vulnerabilidade a quem abrir o link (BZ-D:SEC-58). A página passa a ler o dossiê (decisão 12). |
| 403 para encaminhamento de outro órgão | Confirma que existe. É 404, como entre municípios. |
| Sino materializado ao abrir (`GET /avisos` como hoje) | GET que escreve: efeito de leitura que muda o que os outros veem. O relógio materializa (decisão 11). |
| Catálogo global de órgãos para o órgão externo | Ligaria municípios por uma tabela fora do tenant sem necessidade: o órgão externo tem uma linha em cada município (decisão 6). |
| Transferência direta entre secretarias, e unidade dentro do órgão | Fora da V2 (itens 25 e 26 de `docs/roadmap-v2/21-fora-da-v2.md`). A devolução com destino sugerido e o reencaminhamento pela Defesa Civil cobrem o caso. |

## Estado e aceite

- **Situação:** PROPOSTA.
- **Aceite do Rafael (H116):** depende do aceite da ADR 0009 (H97), porque esta
  usa a pessoa, a conta, o vínculo, o ator e a ordem de travas de lá. Com o
  aceite, a situação passa a "aceita, em vigor" com a data.
- **Segunda leitura de segurança** de outra família de modelo, somente leitura,
  antes do aceite, como a ADR 0009 teve. Se ela pedir correção, a correção
  entra nesta redação com seção própria no Contexto, como lá.
- **Decisões que esta ADR toma como premissa, com o dono:** CP-09 alternativa C
  (H117, Alyson e encarregado); CP-53 alternativa A para a competência e C para
  o escalonamento (H118, Alyson e município); P-12 e D-24 no encaminhamento
  (H119); redação da E09 e da E11 (H120); a E11 absorvendo o sino por relógio
  (H121); sigilo contra o dossiê (H123); D-05 contra o link do ofício (H125);
  CP-20 (atribuição e papéis no órgão, Alyson); CP-22 (o fim do link, Alyson);
  CP-51 (termo do órgão externo).
- **Registros previstos nesta ADR:** o que a E05 (Obras e Saúde), a E06
  (catálogo do órgão) e a E13 (cenários negativos e tempo) provarem entra como
  nota no fim, na consolidação da F04 (parte 6B), sem reescrever o texto acima.
  A referência cruzada na ADR 0009 é da mesma consolidação.

## Onde isto vive

- Decisões de origem: D-08, D-18, D-23 e D-24 em
  `docs/roadmap-v2/01-decisoes-e-principios.md`; esta ADR consta na seção 8 do
  mesmo arquivo como a 0010.
- Etapas: `docs/roadmap-v2/05-api-identidade-autorizacao.md`, V2-F04-E01 a E17
  e o G04.
- Checkpoints: CP-09, CP-20, CP-22, CP-51, CP-52 e CP-53 em
  `docs/roadmap-v2/18-checkpoints.md`.
- ADR de que esta depende: `docs/adr/0009-pessoa-global-com-conta-por-municipio.md`
  (pessoa, conta, vínculo, ator, ordem das travas, catálogo nominal).
- Portões: `dc360/db/test/isolamento.test.ts` e `dc360/db/test/catalogo/` (não
  editados pela F04), mais os testes que as etapas criam:
  `db/test/isolamento-por-orgao.test.ts` (E05),
  `db/test/isolamento-por-orgao-catalogo.test.ts` e
  `db/test/catalogo-do-orgao/` (E06),
  `db/test/encaminhamento-update-por-coluna.test.ts` (E07),
  `apps/api/test/get-nao-escreve.test.ts` (E11),
  `apps/api/test/oficio-so-leva-o-dossie.test.ts` (E12) e
  `apps/api/test/portal-cenarios-negativos.test.ts` (E13).
- Pessoas e papéis em linguagem de gente: `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`,
  com o texto proposto na evidência desta etapa
  (`docs/evidencias-v2/G04/V2-F04-E01/`), que entra na consolidação da F04.
