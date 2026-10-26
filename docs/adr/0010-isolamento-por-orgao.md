# ADR 0010: isolamento por órgão dentro do município, com o órgão como contexto e nunca como tenant

- **Data da decisão:** 26/10/2026 (registro escrito, V2-F04-E01). As decisões de
  origem são a D-08, a D-18, a D-23 e a D-24 do Rafael
  (`docs/roadmap-v2/01-decisoes-e-principios.md`).
- **Situação:** PROPOSTA, correções 1 e 2 aplicadas (primeira e segunda
  rodadas da segunda leitura de segurança). Aceite pendente do Rafael (H116),
  que depende do aceite da ADR 0009 (H97), e nova rodada da segunda leitura
  sobre esta redação antes do aceite. Até o aceite, o código da F04 segue esta proposta como premissa
  (plano de execução da F04, seção 1, E01). Nenhum usuário de órgão com dado
  real entra no sistema antes do G04.
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
- `trilha_eventos.origem` só aceita `campo` e `escritorio` (001, linha 308), e
  `autor_papel` só aceita os quatro papéis de servidor (001, linha 307);
  `trilha_eventos.tipo` é texto livre, sem CHECK. A política de INSERT da
  trilha e a de `avisos` conferem só o município.
- O gatilho `providencia_respondida_toca_o_sino` (018) é `AFTER UPDATE`: o
  aviso nasce ao fim do próprio UPDATE de `providencias`, ANTES de qualquer
  comando seguinte da mesma rota. A chave do aviso é `providencia:<id>`, e o
  gatilho usa `ON CONFLICT DO NOTHING`: quem gravar antes uma linha com essa
  chave engole o aviso verdadeiro.
- O número do ofício sai de `proximo_oficio` (017), que trava a linha de
  `oficio_sequencias` do município e do ano até o fim da transação. A
  eliminação do município (038) apaga as filhas antes dos pais, inclusive
  `oficio_sequencias`, `avisos` e `trilha_eventos` antes de `providencias`, e
  nesta árvore não trava a linha do município antes do primeiro DELETE (a ADR
  0009, decisão 7, manda a F03 travar).
- O documento do ofício (`oficios/documento.ts`) é o mesmo na impressão pela
  Defesa Civil e no link, e imprime, além da ocorrência, os textos livres
  `providencias.descricao`, `providencias.responsavel` e `oficios.observacoes`
  (por volta da linha 131).
- Há GET que escreve além do sino: `GET /ocorrencias/:id`, a busca e os
  documentos gravam `ocorrencia_consultas`; o CSV grava `exportacoes`; os
  documentos de vistoria gravam `documento_emitido` na trilha
  (`registrarEmissao`), e `GET .../termo-de-interdicao` muda o ESTADO da
  ocorrência (`marcarInterditada`, em `trilha.ts`).
- `interesse_municipio` (011) é anterior ao município: sem `organizacao_id`,
  com INSERT do `dc360_app` por policy `WITH CHECK (true)` e sem SELECT, para o
  formulário público, que roda sem token, sem município e sem ator.
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

### O que a segunda leitura de segurança mudou (correção 1)

A primeira redação passou pela segunda leitura de segurança (Codex, somente
leitura), com nove achados, três deles bloqueando o aceite. Os nove foram
conferidos contra as migrações e o código deste SHA, e os nove procedem. A
tabela achado a achado está em
`docs/evidencias-v2/G04/V2-F04-E01/correcao-1/RESUMO.md`. Esta redação
acrescenta:

- **os fatos do encaminhamento são gravados pelo banco** (decisão 17, nova): o
  `dc360_app` nunca grava evento de transição, espelho na trilha da ocorrência
  nem aviso do encaminhamento, sob ator nenhum. Um gatilho grava o evento da
  transição a partir da própria mudança de estado, e do evento nascem, pelo
  banco, o espelho e o aviso, presos a ele por chave composta. Com isso a
  classe E deixa de existir: o ator de órgão não insere em `trilha_eventos` nem
  em `avisos`, que passam à classe D;
- **a ordem efetiva dos escritores e o protocolo com a eliminação** (decisão
  14, refeita): todo caminho do encaminhamento toma a linha do município (N1)
  em `FOR SHARE` antes de qualquer outra trava e relê o município; a sequência
  de ofícios ganha nível próprio; a linha do encaminhamento é travada sem
  conflitar com as chaves estrangeiras das filhas; o aviso deixa de nascer
  antes do evento;
- **o modelo de divulgação cobre os textos livres** (decisão 5, ampliada): os
  textos livres de `providencias` e de `oficios` nunca chegam ao órgão; o que a
  Defesa Civil escreve para ele entra no dossiê ou nos eventos visíveis a ele,
  com regra e retenção; os legados não levam texto livre;
- **a matriz de escrita da classe B** (decisão 3): na F04 o ator de órgão não
  escreve em `usuarios` nem em `orgao_vinculos`, e a lista do que ele escreve
  é fechada;
- **a categoria anterior ao município** (decisão 3) para `interesse_municipio`,
  que nega todo ator autenticado sem quebrar o formulário público, e a regra de
  uma classificação por tabela, inclusive essa;
- **executor técnico separado do autor do acontecimento** no evento do link
  (decisões 8 e 12): só `abrir_oficio` grava o evento `visualizado` de autor
  `link`, preso ao envio e à versão exibida;
- **as exceções de GET separadas por natureza** (decisão 11): registro de
  acesso, consumo de capacidade (o link) e ato administrativo por GET legado,
  cada rota com todas as tabelas e efeitos, e um teste que acusa também a
  escrita revertida;
- **a ordem das conferências na rota escolhida** (decisões 6 e 13): recusas que
  não dependem do recurso podem vir antes da busca, iguais para todo id;
- **como cada policy da classe A compõe com as existentes** (decisão 2) e a
  verificação das funções privilegiadas chamando cada uma sob ator de órgão
  (decisão 15).

### O que a segunda rodada mudou (correção 2)

A segunda rodada da mesma leitura, sobre a correção 1, deu sete dos nove
achados por fechados, dois por parciais, e trouxe dois pontos novos que
bloqueiam e duas dívidas. A tabela item a item está em
`docs/evidencias-v2/G04/V2-F04-E01/correcao-2/RESUMO.md`. Esta redação
acrescenta:

- **o órgão toma N1 por uma função estreita** (decisão 14, item 2a): o
  Postgres aplica ao `SELECT ... FOR SHARE` o `USING` das policies de UPDATE,
  e a classe C nega UPDATE ao órgão, então a guarda direta da correção 1
  devolvia zero linhas ao ator de órgão. A guarda passa a ser
  `travar_municipio_para_escrita()`, SECURITY DEFINER sem parâmetro, que só
  trava em `FOR SHARE` a linha do município do contexto, não devolve dado e
  não escreve; o UPDATE de `organizacoes` continua negado ao órgão. A regra
  foi demonstrada num Postgres 16 descartável (evidência da correção 2);
- **cada transição tem o seu evento e a sua versão do dossiê** (decisão 17,
  item 2, refeito): o evento `enviado` e o `reenviado` nascem da transição, e
  não mais da inserção do dossiê; cada fato gerado leva o número do fato da
  linha (`fato_seq`), e a conferência adiada compara cada transição com o seu
  evento, em vez de contar; a versão do dossiê só confirma se exatamente um
  evento gerado a declarar;
- **a chave `encaminhamento_evento:` é reservada** (decisão 17, itens 3 e 4):
  INSERT direto em `avisos` com a referência ao evento ou com o prefixo é
  recusado, o aviso gerado é coerente por CHECK, e o gerador nunca usa `ON
  CONFLICT DO NOTHING` nessa chave;
- **consistência**: o negativo do UPDATE sem efeito passa a ser "sem mudança
  no estado nem nas colunas mapeadas"; a criação deixa de emitir ofício na
  mesma transação (decisão 14, item 5); o 429 entra na comparação de status,
  corpo e cabeçalhos (decisão 13, item 2); a proibição geral do 403 remete à
  exceção da decisão 13.

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
decisões 8 a 16 fixam o que as lições acima exigem, e a 17 (correção 1) fixa
quem grava os fatos do encaminhamento. As alternativas descartadas estão no
fim.

### 1. O usuário de órgão nunca consulta `ocorrencias`

- O órgão lê o ENCAMINHAMENTO (a linha de `providencias`, expandida na E02) e o
  DOSSIÊ (`encaminhamento_dossies`, E04), e mais nada da ocorrência. Nenhuma
  tabela filha da ocorrência (`vistorias`, `evidencias`, `trilha_eventos`,
  `vistoria_orgaos_indicados`, `ocorrencia_consultas` e as outras) é lida pelo
  ator de órgão: todas são classe D (decisão 3), `trilha_eventos` inclusive. O
  espelho do ato do órgão na trilha é gravado pelo banco (decisão 17), nunca
  pelo ator de órgão.
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
- O espelho do ato do órgão na trilha da ocorrência nasce do evento, pelo banco
  (decisão 17); a rota do órgão não chama `registrarEvento`.

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
  | `encaminhamento_eventos` | servidor, sistema; órgão nas do próprio órgão com `visivel_ao_orgao` | só os tipos de inserção direta de cada ator (decisão 17): órgão, `visualizado` nas do próprio órgão; sistema, `lembrete` e `escalonado`; servidor, nenhum na F04. Evento de transição e fato de linha só pelo banco | ninguém (append-only, ADR 0002) |
  | `encaminhamento_dossies` | servidor, sistema; órgão nas do próprio órgão | servidor | servidor e sistema, só `campos_sensiveis` (retenção da F05-E09); órgão nunca |
  | `oficios` | servidor, sistema; órgão nas do próprio órgão | servidor | ninguém (017) |

- **Contexto ausente é zero linhas.** Sem ator, `app_ator_tipo()` é nulo e o
  `IN` não é verdadeiro; sem vínculo, `app_orgao_vigente()` é nula e a igualdade
  não é verdadeira. **`IS NULL` sobre contexto é proibido em toda policy de
  órgão**, e `OR true` também: nenhuma policy abre por falta de contexto. A
  única exceção nomeada é a RESTRICTIVE da categoria anterior ao município
  (decisão 3), em que o `IS NULL` fecha em vez de abrir; a E06 a reconhece pelo
  nome e pelo texto exato. A E06 confere isso no catálogo e prova que acusa uma
  policy plantada com cada um.
- **A lista de atores é positiva.** Toda condição sobre o ator escreve quem PODE
  (`IN ('servidor', 'sistema')`), nunca quem não pode (`<> 'usuario_orgao'`).
  Assim um tipo de ator novo (o cidadão da F15, por exemplo) nasce negado em
  todas as tabelas, e cada uma que ele precisar ganha a classe dele na ADR dele.
- **Servidor e sistema veem o município inteiro, como hoje**, menos o que o
  sigilo da ocorrência já tira do servidor (decisão 7, item b).
- Para escrever, a policy só deixa passar o que é do próprio órgão; o que o
  órgão PODE mudar dentro da linha dele é a matriz coluna por ator (decisão 8) e
  a máquina de estados (decisão 9), as duas no banco.
- **Como a classe A compõe com as policies que já existem (correção 1).** No
  Postgres, as PERMISSIVE aplicáveis a um comando se combinam por OU e as
  RESTRICTIVE por E, e sem nenhuma PERMISSIVE o comando não alcança linha. Por
  isso:
  1. **As permissivas por município ficam como estão** (`providencias_leitura`,
     `providencias_insercao` e `providencias_atualizacao` da 034;
     `oficios_leitura` e `oficios_insercao` da 017) e continuam sendo a única
     fonte de acesso. **O ramo do órgão nunca entra numa PERMISSIVE**: uma
     permissiva nova "do órgão" somaria acesso, por OU, ao acesso municipal que
     já existe, e não restringiria nada.
  2. **A condição da classe A é uma RESTRICTIVE `TO dc360_app` por comando**,
     com o ramo do órgão só nos comandos que a tabela acima dá ao órgão e só com
     o primeiro ramo nos outros. No UPDATE, a RESTRICTIVE tem `USING` E `WITH
     CHECK` com a mesma expressão: o `USING` limita as linhas que o UPDATE
     alcança (encaminhamento de outro órgão: zero linhas, igual ao
     inexistente), e o `WITH CHECK` limita a linha resultante (mover a linha
     para outro órgão é recusado, além de ser coluna que nenhum ator muda,
     decisão 14). INSERT tem só `WITH CHECK`; SELECT, só `USING`.
  3. **Tabela nova da classe A** (`encaminhamento_eventos`,
     `encaminhamento_dossies`, `avisos_do_orgao`) nasce com as PERMISSIVE por
     município, por comando, e com a RESTRICTIVE da classe A; uma RESTRICTIVE
     sozinha não dá acesso a ninguém.
  4. **A RESTRICTIVE de sigilo da 062 entra por E** com a da classe A, e por
     isso tem o ramo do órgão escrito nela (decisão 7, b); sem ele, o sigilo
     negaria ao órgão o encaminhamento de ocorrência restrita.
  5. **Teste por comando** na E05, para cada tabela da classe A e cada ator
     (Maria, João, Rita, sem ator): SELECT, INSERT, UPDATE (linha alheia no
     `USING`: zero linhas; linha própria levada a outro órgão no `WITH CHECK`:
     recusa) e DELETE (recusado a todos, fora o `DELETE` nomeado que já
     existir). A E06 confere no catálogo que nenhuma PERMISSIVE de tabela da
     classe A cita `app_orgao_vigente` e que cada comando tem a RESTRICTIVE.

### 3. Negação RESTRICTIVE nas demais tabelas (classes B, C, D, "sem alcance" e "anterior ao município")

Toda tabela de negócio que não é da classe A recebe, por comando, uma policy
RESTRICTIVE `TO dc360_app` que nega o ator de órgão, na forma do item a da
decisão 7. `TO dc360_app` para não alcançar as policies do console
(`dc360_console`, ADR 0008). As classes:

| Classe | Tabelas (lista inicial; a E06 fecha a lista nominal) | O que o ator de órgão faz |
| --- | --- | --- |
| B, a conta própria | `usuarios`, `sessoes`, `orgao_vinculos` e as tabelas da conta que a 059 da F03 deixa com grant ao `dc360_app`; `avisos_do_orgao_lidos` (E11) | lê só as linhas da própria conta (`app_ator_id()`); escreve só o que a matriz de escrita abaixo lista |
| C, leitura do catálogo | `orgaos`, `categorias_de_demanda`, `organizacoes` (`id = app_organizacao_atual()`), `orgao_competencias` (E15) | lê; nunca escreve; nem trava linha por comando (a trava por `FOR SHARE` passa pela policy de UPDATE): a guarda N1 da linha do município é tomada só pela função da decisão 14, item 2a |
| D, todas as outras | `ocorrencias` e todas as filhas, `trilha_eventos` e `avisos` (correção 1: a antiga classe E), `equipes`, `exportacoes`, `trilha_administrativa`, `aparelhos`, `oficio_envios`, `oficio_aberturas`, `oficio_sequencias` e o resto | nada: `app_ator_tipo() IN ('servidor', 'sistema')` |
| sem alcance | as tabelas sem nenhum grant ao `dc360_app` (`pessoas`, `origens_de_conta`, as tabelas da pessoa da E11 e da E19, as do console) | nada, porque o papel de aplicação não as toca |
| anterior ao município | `interesse_municipio` (011), e só ela | nada; ver abaixo |

- **A classe E deixou de existir (correção 1).** A primeira redação dava ao
  ator de órgão INSERT limitado em `trilha_eventos` e `avisos`. A condição
  conferia município, autor e ocorrência, mas não o TIPO nem a correspondência
  com uma transição de verdade: o órgão poderia gravar na trilha um fato
  reservado à Defesa Civil, ou gravar antes da resposta o aviso com a chave
  legítima `providencia:<id>`, e o gatilho da 018 engoliria o aviso verdadeiro
  no `ON CONFLICT DO NOTHING`. Agora o ator de órgão não insere em nenhuma das
  duas: o espelho e o aviso nascem do evento, pelo banco (decisão 17).
- **A chave estrangeira como oráculo.** A verificação de chave estrangeira do
  Postgres não passa pela RLS: um INSERT com uma chave qualquer distinguiria
  "não existe" de "existe e não é seu". Por isso o ator de órgão só grava em
  tabela que ele lê (classe A e a própria linha da classe B), sempre com a
  chave tripla ou amarrada no `WITH CHECK` (que o Postgres confere antes da
  chave estrangeira), e o caso alheio e o inexistente são recusados do mesmo
  jeito (decisão 13).
- **Matriz de escrita da classe B (correção 1).** "Só a própria linha" não
  basta para escrita: uma policy de UPDATE que confira só município e
  `usuario_id = app_ator_id()` deixaria a conta trocar o órgão ou o papel do
  próprio vínculo, e o vínculo trocado seria reconhecido por
  `app_orgao_vigente()`. A matriz é fechada e positiva:

  | Tabela | O que o ator de órgão escreve |
  | --- | --- |
  | `orgao_vinculos` | nada: nem INSERT, nem UPDATE de órgão, papel, início, fim ou qualquer outra coluna, nem na própria linha |
  | `usuarios` | nada: nenhum campo da própria conta, e em especial nenhum que decida acesso (`papel`, `ativo`, `organizacao_id`, `equipe_id`, `pessoa_id`, credencial, e-mail) |
  | `sessoes` | nada por comando; as sessões são escritas pelos caminhos de autenticação da F03, que rodam antes do ator ou como função declarada `propria` (decisão 15) |
  | demais tabelas da conta com grant (059) | nada por comando; só pelas funções da F03 declaradas `propria` |
  | `avisos_do_orgao_lidos` (E11) | INSERT da marca de leitura da própria conta, de aviso do próprio órgão vigente |

  A RESTRICTIVE de INSERT e de UPDATE dessas tabelas é `app_ator_tipo() IN
  ('servidor', 'sistema')`, menos a de INSERT de `avisos_do_orgao_lidos`. O
  vínculo é criado, mudado e encerrado pela Defesa Civil (F03-E05), nunca pela
  própria conta. Uma etapa que precise de escrita pessoal nova escreve a linha
  nesta matriz por nota de revisão, com a coluna exata e o teste, antes do
  código. **Teste da E05, direto no banco:** Maria (executora da Obras)
  tentando `UPDATE orgao_vinculos SET papel = 'gestor'`, `SET orgao_id =
  <Saúde>`, `SET fim = NULL` num vínculo encerrado, e `INSERT` de vínculo novo
  para a própria conta com a Saúde, e `UPDATE usuarios SET papel`, `ativo` ou
  `organizacao_id` na própria conta: tudo recusado, e `app_orgao_vigente()` com
  `orgao_atual` da Saúde continua nula.
- **A categoria anterior ao município (correção 1).** `interesse_municipio`
  não pertence a município, não tem `organizacao_id`, tem INSERT do
  `dc360_app` (policy `interesse_escrita`, `WITH CHECK (true)`) e nenhum
  SELECT; quem escreve é o formulário público, sem token, sem município e sem
  ator. Não é "sem alcance" (tem grant) nem classe D (a forma da decisão 7, a,
  exige `organizacao_id`). A categoria é nominal, com uma tabela só, e mantém a
  exceção do catálogo de hoje (`EXCECOES_AO_ISOLAMENTO`, entrada da base): a
  policy de INSERT existente fica, e a E05 acrescenta uma RESTRICTIVE `TO
  dc360_app` de INSERT com `app_organizacao_atual() IS NULL AND
  app_ator_tipo() IS NULL`. É o único `IS NULL` sobre contexto admitido numa
  policy, e ali ele FECHA: o pedido só é gravado fora de qualquer contexto, e
  todo ator autenticado, de órgão ou servidor, é recusado; o formulário público
  continua funcionando, porque roda sem contexto. A E05 prova os dois lados (o
  formulário grava; Maria e Rita, com contexto, recebem recusa) e que
  `interesse_recente` (SECURITY DEFINER, `antes_do_ator`) responde igual com e
  sem ator (decisão 15).
- **Uma classificação por tabela.** A E06 descobre pelo catálogo do Postgres
  TODA tabela do esquema `public` (relações comuns e particionadas) e confere
  que cada uma tem exatamente uma classificação entre A, B, C, D, "sem alcance"
  e "anterior ao município": tabela sem classificação reprova, tabela com duas
  reprova, entrada da lista sem tabela reprova. As tabelas anteriores ao
  município e as do console entram nessa conta como as outras.
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
- **Os textos livres entram no modelo de divulgação (correção 1).** Texto livre
  pode carregar contato, relato ou informação interna, e saiu do controle do
  dossiê se for impresso direto da coluna. A regra:
  1. **Só dois canais levam texto livre ao órgão.** (a) O DOSSIÊ: o texto do
     que se pede (`pedido`, obrigatório) e as observações da coordenação
     (`observacoes_da_coordenacao`, opcional) passam a ser campos de
     `CAMPOS_DO_DOSSIE` (E04), de categoria própria, "texto livre dirigido ao
     órgão": entram no snapshot, ficam em `campos_sensiveis` (a coluna sujeita
     à retenção da F05-E09, CP-10), aparecem na tela de composição com o aviso
     de que vão ao órgão, e o evento `enviado` registra as chaves, nunca os
     valores. (b) OS EVENTOS VISÍVEIS AO ÓRGÃO: o texto da rodada que a Defesa
     Civil ou o órgão escreve na conversa (resposta, motivo da devolução,
     pergunta e resposta de esclarecimento, pedido de complemento, motivo do
     cancelamento), em chaves do `detalhe` fixadas por tipo de evento numa
     lista de inclusão (`EVENTOS_DO_ENCAMINHAMENTO`, decisão 17), conferida no
     banco; a tela da Defesa Civil avisa que o texto vai ao órgão.
  2. **Os textos livres de `providencias` e de `oficios` nunca chegam ao órgão
     direto da coluna.** `providencias.descricao`, `responsavel`,
     `orgao_destino`, `resposta` e `respondida_por`, e `oficios.observacoes`,
     não estão na lista de inclusão da resposta da família do órgão (E08) nem
     na página do link (E12), e o documento do ofício, em QUALQUER rota (a
     impressão pela Defesa Civil e o link), é montado do dossiê e dos eventos
     visíveis, sem essas colunas. A coluna `oficios.observacoes` continua
     gravada como registro interno da Defesa Civil; a observação que deve ir
     ao órgão é o campo do dossiê. A leitura dessas colunas pela RLS da classe
     A é a exceção declarada da linha de `providencias` (decisão 16).
  3. **Legados.** A versão 1 de origem `migracao` do dossiê (E04) copia só o
     mínimo fixo (protocolo, tipo COBRADE, endereço) e NÃO copia texto livre
     de coluna nenhuma: o texto antigo foi escrito sem esta regra e pode
     carregar o que ela proíbe. Encaminhamento legado aberto fica marcado
     "pedido em revisão": ele só volta ao órgão (reenvio do link, portal)
     depois de a Defesa Civil compor a versão 2, revendo o texto; até lá, a
     página do link de um envio legado ainda válido mostra o mínimo e a nota
     de que a Defesa Civil vai reenviar. A E04 arquiva a contagem dos legados
     abertos e o painel os lista (H novo, a numerar).
  4. **Retenção.** Os textos de (a) seguem a retenção de `campos_sensiveis`;
     os de (b), em evento append-only, seguem a minimização por evento que a
     F05-E09 decidir junto do CP-10 (pedido de escopo registrado para o
     orquestrador). Até ela, nenhum dado real de órgão entra (G04).

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
  403 só existe em dois casos (correção 1, decisão 13, item 2): a ação que o
  papel no órgão não permite (leitor aceitando), decidida ANTES da busca e
  igual para todo id, exista ou não, seja de quem for; ou o item do próprio
  órgão, já achado sob o ator, atribuído a outro executor (cenário 8 da E13).
  Nenhum dos dois depende de dado fora do órgão.

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

**e) Gatilhos 017 e 018 sob o ator de órgão (P-15, refeita na correção 1).**
`providencia_amarra_no_catalogo` (017) é restrito a INSERT, ou fica inerte
quando o destino não muda, na 070 (E07): ele nunca mais resolve órgão pelo nome
num UPDATE, e o órgão nunca dispara a inserção em `orgaos` (classe C, sem
escrita). **O gatilho `providencia_respondida_toca_o_sino` e a função
`aviso_de_providencia_respondida` (018) são aposentados na 070**, a mesma
migração que faz a resposta legada virar transição (E07, parte 2B), com
`desfazer/` que os recria: o aviso de resposta passa a nascer do evento
`respondido`, pelo banco (decisão 17), e o 018 nunca roda sob ator de órgão,
porque ele some antes da E05. Até a 070 a resposta legada só preenche
`respondida_em`, sem transição, e o 018 continua sendo o único autor do aviso;
depois dela só o gerador da decisão 17 é, e nenhum dos dois caminhos produz
aviso duplicado (teste da E07). Os valores `portal` em
`trilha_eventos.origem` e `usuario_orgao` em `trilha_eventos.autor_papel` (o
CHECK da 001, linha 307, que hoje não o aceita) entram na 068 (E03), que cria o
gerador do espelho, se a F03 ainda não tiver acrescentado o papel. A E11
acrescenta os tipos `encaminhamento_*` ao gerador; a decisão de aposentar o
018 deixa de ser dela.

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
  tem. Como o evento de transição é gravado pelo próprio banco (decisão 17), a
  marca, `autor_tipo`, `autor_id`, `autor_nome` e `autor_papel` são escritos
  por ele a partir de `app_ator_tipo()`, `app_ator_id()`, `app_ator_papel()` e
  da linha da conta do ator; no evento de inserção direta, um gatilho `BEFORE
  INSERT` os sobrescreve do mesmo jeito, e um valor recebido diferente do
  derivado é recusado. A marca não autoriza nada: quem autoriza é o papel
  conferido no banco. Ela só impede que o ato do servidor apareça como ato do
  órgão.
- **Executor técnico e autor do acontecimento (correção 1).** A regra acima
  ("autor igual ao ator do banco") vale para todo evento gravado sob um ator.
  O evento `visualizado` do link do ofício é a ÚNICA exceção: o acontecimento é
  a abertura do link por alguém sem conta, e o autor é `link`, sem `autor_id`.
  Ela é estreita assim: (1) o executor técnico é a função `abrir_oficio`
  (SECURITY DEFINER, decisão 12), e só ela grava esse evento, na mesma
  transação em que grava a abertura `entregue`; (2) o evento leva `envio_id`
  (chave composta com `oficio_envios`) e a versão do dossiê exibida, e o banco
  tem `CHECK ((autor_tipo = 'link') = (envio_id IS NOT NULL))` e unicidade de
  um evento por envio; (3) nenhuma policy do `dc360_app` aceita `autor_tipo =
  'link'`, sob ator nenhum: uma rota comum do órgão, do servidor ou do sistema
  não consegue produzir esse evento. O teste da E12 tenta o INSERT direto com
  `autor_tipo = 'link'` sob cada ator e recebe recusa.
- **Matriz coluna por ator.** Privilégio de coluna é do PAPEL DE BANCO, não do
  ator: o ator de órgão e o servidor são o mesmo `dc360_app`. Por isso "o órgão
  não altera a prioridade" (E14) não se faz com `GRANT`: um gatilho `BEFORE
  UPDATE` em `providencias` confere, por ator, quais colunas podem mudar. O ator
  de órgão muda só as colunas do aceite, da resposta e do pedido de
  esclarecimento, mais `destinatario_id` quando o papel no órgão é `gestor`;
  nunca `prazo_em`, `prioridade`, `categoria_id`, `orgao_id`, `descricao` nem as
  de cancelamento e conclusão. A lista vive no shared e é igual no banco por
  teste. Em `encaminhamento_dossies`, só servidor e sistema mudam
  `campos_sensiveis`. **`id`, `organizacao_id` e `orgao_id` de `providencias`
  são imutáveis para todo ator**, servidor inclusive (ficam fora do privilégio
  de coluna da 070, e o 017 deixa de resolver órgão no UPDATE): são as colunas
  das chaves que as filhas referenciam, e é por elas não mudarem que a trava do
  encaminhamento não conflita com as chaves estrangeiras (decisão 14).
  Reencaminhar cria encaminhamento novo (decisão 9).

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
  (E16). O `link` não muda estado: o `visualizado` dele é gravado por
  `abrir_oficio` (decisões 8 e 12). O leitor no órgão não muda estado nenhum.
  O evento de cada linha da tabela acima é gravado pelo banco, no mesmo
  comando da transição (decisão 17). A divisão fina entre `executor` e `gestor` dentro das
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
  origem `migracao` pela mesma lista, sem texto livre (decisão 5, correção 1).
- O texto do pedido e as observações da coordenação são campos do dossiê, de
  categoria "texto livre dirigido ao órgão" (decisão 5).
- O CP-09 decide o conteúdo definitivo. Até ele, a mecânica e o padrão
  conservador são testáveis, e o primeiro encaminhamento com dado real fica
  bloqueado (H133).

### 11. Nenhum GET escreve (P-13)

- **Nenhum GET materializa estado ou fato de negócio.** O sino deixa de ser
  materializado ao abrir: um relógio grava os avisos com `comTenantDoSistema`,
  município a município (E11); `GET /avisos` passa a só ler. A visualização do
  encaminhamento pelo órgão é `POST .../visualizacao` e grava no máximo um
  evento por usuário e estado.
- **Nenhuma rota GET da família autenticada do órgão escreve nada**, nem
  registro de acesso, nem trava, nem sequência: essa proibição é absoluta e não
  tem lista.
- **As exceções são separadas por natureza (correção 1)**, numa lista nominal
  fechada em que cada entrada declara a rota, TODAS as tabelas que ela escreve,
  o efeito de cada escrita e o motivo:

  | Natureza | O que é | Rotas neste SHA (a E11 fecha a lista) | Tabelas e efeitos permitidos |
  | --- | --- | --- | --- |
  | registro de acesso | grava que alguém consultou ou exportou; não muda o que nenhuma leitura futura devolve, fora o próprio registro | `GET /ocorrencias/:id`, a busca, os documentos de vistoria (laudo e termos, HTML e PDF): `ocorrencia_consultas`, INSERT; `GET /relatorios/ocorrencias.csv`: `exportacoes`, INSERT | só INSERT append-only na tabela declarada |
  | consumo de capacidade | a leitura gasta a capacidade que a autorizou: o próximo GET recebe outra resposta | `GET /publico/oficio/:token` (decisão 12) | `oficio_aberturas`, INSERT de toda tentativa (`entregue`, `recusado_ja_aberto`, `recusado_expirado`); `encaminhamento_eventos`, INSERT de um `visualizado` de autor `link` por envio, só com `entregue`; efeito: o segundo GET do mesmo link responde 410; tudo dentro de `abrir_oficio`. Nada mais |
  | ato administrativo por GET (legado) | a leitura pratica um ato que muda estado ou registra fato de negócio | os documentos de vistoria: `trilha_eventos`, INSERT idempotente de `documento_emitido` (`registrarEmissao`); `GET .../termo-de-interdicao` e o PDF dele: também UPDATE de `ocorrencias` (`marcarInterditada`) | só o declarado; nenhuma rota da família do órgão; a conversão em POST é de etapa fora da F04 (H novo, a numerar), e até ela a entrada fica nesta categoria, nomeada, sem passar por registro de acesso |

  O `GET /avisos` sai da lista na própria E11, que o faz parar de escrever.
- **O teste.** O `get-nao-escreve.test.ts` (E11) confere a lista nos dois
  sentidos: GET fora da lista que escreve reprova; GET da lista que escreve
  tabela ou efeito fora do declarado reprova; entrada sem rota reprova; GET da
  família autenticada do órgão que escreva qualquer coisa reprova. Ele não
  compara só o estado final das tabelas: captura todo comando que a rota emite
  e os contadores de escrita do Postgres por tabela, de modo que um INSERT
  revertido (por `ROLLBACK` ou por ponto de salvamento) e um par INSERT seguido
  de DELETE também reprovam. A E11 prova, com casos plantados, que o mecanismo
  escolhido acusa os dois. Nenhuma tabela de estado de negócio pode estar nas
  categorias de registro de acesso e de consumo de capacidade.
- "Reabre se um GET voltar a escrever" não admite risco aceito (H121), e a lista
  fechada é a forma de a regra valer para o código que já existe. Se o Rafael
  preferir a redação literal da E11 ("nenhum GET muda linha"), as rotas de
  documento e de CSV viram POST numa etapa própria, que não é da F04.

### 12. Ofício por link e D-05 (H125)

- Durante a transição até o portal (CP-22), o link de uso único continua (hash,
  prazo, uso único, 410 e 404, `abrir_oficio`). A página que ele abre mostra só
  o dossiê da versão vigente do encaminhamento, nunca `ocorrencias`; o campo
  sensível só aparece se o dossiê o incluiu; as observações da coordenação
  continuam, mas como campo do dossiê, nunca de `oficios.observacoes` (decisão
  5, correção 1). O mesmo vale para a impressão do ofício pela Defesa Civil: o
  documento é um só.
- **A D-05 diz que documento emitido é imutável. A página do link NÃO é o
  documento emitido:** é HTML montado na hora da abertura, como o ofício é hoje
  (017, "um documento guardado em cache seria a versão errada com cara de
  definitiva"). O registro do ofício (número, órgão, emissão, observações) já é
  imutável no banco, sem `UPDATE`. Para não haver mudança silenciosa, a página
  se identifica como visualização do encaminhamento, e o evento `visualizado`
  grava a versão do dossiê que foi mostrada. O documento emitido do ofício, com
  PDF, hash e versão do modelo, é da F09 (ADR 0013); quando existir, o link
  serve aquele documento ou deixa de existir, conforme o CP-22.
- **Quem grava, e em que ordem (correção 1).** A E12 redefine `abrir_oficio`
  numa migração própria: (1) lê o envio pelo hash, sem trava; (2) toma a linha
  do município do envio em `FOR SHARE` (N1, decisão 14), direto, dentro da
  própria função privilegiada, como o login da 050 (a função da guarda da
  decisão 14, item 2a, não serve aqui: o link roda antes de existir contexto,
  e o município sai do envio); (3) relê o envio com
  `FOR UPDATE` e confere que não mudou, respondendo como link desconhecido se
  ele sumiu (município eliminado entre a leitura e a trava); (4) grava a abertura
  com o resultado; (5) só com `entregue`, grava o evento `visualizado` de autor
  `link` (decisão 8), com `envio_id` e a versão vigente do dossiê, e devolve à
  rota o encaminhamento e essa versão. A rota NÃO escreve nada: lê, com
  `SET LOCAL` na organização devolvida e sob o ator `sistema`, a versão do
  dossiê que a função devolveu, e é essa versão que a página mostra, de modo
  que a versão gravada e a exibida são a mesma por construção. Link
  desconhecido não registra nada (017). O link é leitura: nenhuma resposta,
  nenhum estado de outro órgão, nenhuma lista. É a exceção nomeada de consumo
  de capacidade ao "nenhum GET escreve" (decisões 11 e 16).

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
2. **Ordem das conferências na rota (refeita na correção 1).** A regra
   escolhida é: **recusa que não depende do recurso pode sair antes da busca,
   desde que seja a mesma para todo id**. A sequência é:
   1. plateia e vigência (401);
   2. vínculo vigente com o órgão da ROTA (sem vínculo, 404; depende do órgão,
      nunca do encaminhamento);
   3. recusas independentes do recurso: a ação que o papel no órgão não
      permite (403, leitor aceitando), o corpo inválido (422), o limite de
      taxa por solicitante e por órgão (429). Cada uma depende só
      do ator, do papel, do corpo e da contagem do próprio solicitante, e por
      isso sai IGUAL para id do próprio órgão, de outro órgão, de outro
      município e inexistente;
   4. a leitura do recurso sob o ator (zero linhas, 404);
   5. só então as recusas que dependem do recurso (403 de atribuição a outro
      executor; 409 de estado, de devolução depois do aceite e de
      encerramento).

   O que fica proibido é qualquer resposta que DEPENDA do recurso antes do
   passo 4, e qualquer resposta do passo 3 que varie conforme o id. **Teste da
   E08 e da E13**, para cada rota do órgão com corpo ou ação: com os três ids
   (outro órgão, outro município, inexistente) e o id próprio, nos quatro
   casos (leitor tentando a ação: 403; corpo inválido: 422; limite de taxa
   esgotado: 429; ação e corpo válidos: 404 para os três ids alheios), o
   status, o corpo e os cabeçalhos são iguais entre os ids, fora os
   cabeçalhos que variam por requisição (data, identificador da requisição),
   que o teste lista por nome. No 429 (correção 2), os cabeçalhos do limite
   (espera para nova tentativa e os de cota, se houver) entram na comparação
   e não na lista dos variáveis: o teste fixa o relógio para eles não
   variarem com o tempo. O teste também confere que a contagem do limite
   avança igual para id próprio e alheio (o pedido que termina em 404 conta
   como o que termina em 200), para o 429 não chegar antes conforme o id.
3. **Escrita não é oráculo.** As chaves estrangeiras do domínio são triplas
   (`organizacao_id`, encaminhamento, `orgao_id`): evento com encaminhamento de
   outro órgão e evento com encaminhamento inexistente violam a mesma chave do
   mesmo jeito. O ator de órgão só grava em tabela que ele lê (decisão 3); não
   grava em `trilha_eventos` nem em `avisos` (decisão 17). A API traduz
   violação de chave estrangeira e de `WITH CHECK` do ator de órgão em 404,
   igual ao inexistente. Toda unicidade que o ator de órgão alcança inclui
   `orgao_id` ou só existe sobre linhas dele; `aviso_unico_por_fato` e as
   chaves da trilha ficam fora do alcance dele.
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

### 14. Onde o encaminhamento entra na ordem das travas da ADR 0009 (refeita na correção 1)

A ADR 0009 (decisão 7) ordena por níveis, de N1 (linha do município) a N9
(sessões), todo caminho que toca identidade. O encaminhamento usa o N1 dela e
acrescenta quatro níveis DEPOIS de N9:

| Nível | O que se trava | Como |
| --- | --- | --- |
| N1 | a linha do município em `organizacoes` (o mesmo N1 da ADR 0009) | `FOR SHARE` com releitura, tomado pela função `travar_municipio_para_escrita()` (item 2a, correção 2), que faz `SELECT ... WHERE id = app_organizacao_atual() AND eliminada_em IS NULL FOR SHARE`; zero linhas é recusa sem escrever. Só `abrir_oficio`, que já é privilegiada e roda antes do contexto, faz esse SELECT direto (decisão 12) |
| N10 | a linha do encaminhamento em `providencias` | UPDATE condicional que não muda coluna de chave (`WHERE id = $1 AND estado = $2`, com conferência de linhas afetadas) ou `SELECT ... FOR NO KEY UPDATE` antes; NUNCA `FOR UPDATE`; várias, em ordem crescente de id |
| N11 | a linha da sequência de ofícios do município e do ano (`oficio_sequencias`) | `proximo_oficio` (017), dentro da transação que grava o ofício |
| N12 | as linhas filhas do encaminhamento | INSERT em `encaminhamento_eventos`, `encaminhamento_dossies`, `oficios`, `oficio_envios` e `oficio_aberturas`; a única linha EXISTENTE travada neste nível é a do envio (`oficio_envios`, no link e no desfecho do envio), sempre antes dos INSERT do mesmo nível; fora isso, a única espera é a de índice único (`chave_de_criacao`, visualização por usuário e estado, um `visualizado` de link por envio, marco de lembrete, nível de escalonamento, um ofício por providência) |
| N13 | o que o banco grava a partir do evento | INSERT em `trilha_eventos`, `avisos` e `avisos_do_orgao` pelos gatilhos da decisão 17; INSERT em `orgaos` só no BEFORE INSERT da criação pela Defesa Civil (017, P-15) |

**As regras:**

1. As regras 1, 2, 4 e 7 da ADR 0009 valem aqui sem mudança: nunca tomar nível
   menor do que um já seguro; gatilho só desce para níveis maiores; leitura sem
   trava é livre; INSERT de linha nova não é trava de nível. Em N12 e N13 o
   que conta para a ordem é a espera de índice único; uma inserção cuja chave
   única contém o id de uma linha nascida na MESMA transação (a versão 1 do
   dossiê, o aviso `encaminhamento_evento:<id>` de um evento novo) não espera
   ninguém, porque nenhuma outra transação vê aquela linha antes da
   confirmação, e por isso não é nível segurado (correção 2).
2. **Todo caminho do encaminhamento toma N1 em `FOR SHARE` como a PRIMEIRA
   trava da transação**, chamando `travar_municipio_para_escrita()` (item 2a)
   como primeiro comando depois do contexto, e não toma nenhum nível de N2 a
   N9. Isto revê a regra da primeira redação ("não toma nenhum nível de N1 a
   N9"). `FOR SHARE` é compatível com ele mesmo (encaminhamentos do mesmo
   município não se esperam em N1) e conflita com o UPDATE da linha do
   município que a suspensão e a eliminação fazem em N1. Vínculo, conta e
   pessoa continuam lidos sem trava (regra 4 da ADR 0009), e o vínculo é
   reconferido dentro de cada comando por `app_orgao_vigente()`.

   **2a. Como o ator de órgão toma N1 sem poder alterar o município (correção
   2).** A guarda direta da correção 1 (`SELECT ... FOR SHARE` em
   `organizacoes` pelo `dc360_app`) não funciona para o ator de órgão. A
   regra do Postgres (documentação de `CREATE POLICY`, tabela das policies
   aplicadas por tipo de comando, linha `SELECT FOR UPDATE/SHARE`): um
   `SELECT` com cláusula de trava aplica à linha existente o `USING` das
   policies de SELECT E o `USING` das policies de UPDATE, e a cláusula de
   trava exige o privilégio de UPDATE. Isso vale para as quatro forças
   (`FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE`): a policy
   não enxerga a força pedida. Como a RESTRICTIVE de UPDATE da classe C nega
   o ator de órgão, o `FOR SHARE` dele devolve zero linhas, em silêncio, e a
   guarda recusaria toda operação legítima do órgão. Demonstrado num Postgres
   16 descartável, com RLS forçada, as permissivas da 034 e a RESTRICTIVE da
   classe C: leitura comum, uma linha; `FOR SHARE` e `FOR KEY SHARE`, zero;
   UPDATE, zero (`docs/evidencias-v2/G04/V2-F04-E01/correcao-2/demo-for-share.txt`).

   A forma escolhida é uma função privilegiada estreita, usada por TODO ator
   (servidor, sistema e órgão), para haver um caminho só:

   - assinatura completa `public.travar_municipio_para_escrita()`, `RETURNS
     void`, sem parâmetro, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET
     search_path = public, pg_temp` e `SET row_security = off` (a lição da
     038: dono sem `BYPASSRLS` vira erro, nunca zero linhas em silêncio);
   - corpo de um comando só: `PERFORM 1 FROM organizacoes WHERE id =
     app_organizacao_atual() AND eliminada_em IS NULL FOR SHARE`; sem linha
     (município eliminado ou contexto ausente), erro de código próprio (a E02
     escolhe o `DCnnn`), que a API traduz como a vigência traduz município
     eliminado, igual para todo id. Não devolve dado, não escreve, não recebe
     município: só alcança o do contexto, que vem do token;
   - ACL exata: `EXECUTE` só ao `dc360_app`, retirado de `PUBLIC`, sem opção
     de concessão; entra no catálogo da etapa que a cria (E02, `tenant:
     contexto`) e recebe a declaração `trava` diante do ator de órgão
     (decisão 15);
   - o UPDATE de `organizacoes` continua negado ao órgão pela classe C: a
     função dá ao órgão a trava compartilhada, e nada mais.

   **Testes dos dois limites.** E02, sob Rita: a função trava a linha do
   município A (uma segunda conexão com `SELECT ... FOR UPDATE NOWAIT` na
   linha de A recebe 55P03) e não a de B (`NOWAIT` em B passa); nada é
   escrito; ACL e corpo conferidos no catálogo. E05, sob Maria (Obras): a
   função trava A (o mesmo `NOWAIT` em A recebe 55P03) e, com a trava na
   mão, `UPDATE organizacoes` de Maria continua alcançando zero linhas e o
   nome do município não muda; a função não trava B; recusa município
   eliminado e contexto ausente; e o `SELECT ... FOR SHARE` direto de Maria
   devolve zero linhas, guardado como teste de regressão da regra do
   Postgres (se um dia passar, a classe C deixou de negar o UPDATE). A E08
   confere, capturando os comandos SQL de cada rota de escrita, que nenhuma
   rota faz `FOR SHARE` direto em `organizacoes` e que a função é o primeiro
   comando de todo caminho de escrita do encaminhamento.

   **Alternativa descartada: separar travar de alterar na própria policy**
   (`USING` da RESTRICTIVE de UPDATE aceitando o órgão, `WITH CHECK` o
   recusando). Como a policy não enxerga a força da trava, o mesmo `USING`
   deixaria o órgão tomar `FOR UPDATE` na linha do município, que conflita
   com o `FOR KEY SHARE` que todo INSERT de filha com chave para
   `organizacoes` toma, e com todo `FOR SHARE` de N1: um erro da API pararia
   o município inteiro. E o UPDATE do órgão chegaria a travar a linha antes
   de o `WITH CHECK` recusar. A função dá só a força `FOR SHARE`, só na linha
   do contexto.
3. **O protocolo comum com a eliminação do município.** A eliminação toma N1
   por UPDATE ANTES do primeiro DELETE (ADR 0009, decisão 7, tabela "Por
   caminho"; a 038 desta árvore ainda não o faz, e a correção é da F03, E09).
   Com isso: se a eliminação chega primeiro, o caminho do encaminhamento espera
   em N1 sem segurar nada e, quando ela confirma, a releitura não acha o
   município e o caminho recusa sem escrever; se o caminho chega primeiro, a
   eliminação espera em N1 sem ter apagado nada. O ciclo que a revisão apontou
   (o caminho segura N10 e espera a unicidade de uma filha que a eliminação
   apagou sem confirmar, enquanto a eliminação espera N10) não se forma, porque
   a eliminação não apaga linha nenhuma enquanto houver caminho do
   encaminhamento em curso no município, e nenhum caminho começa enquanto ela
   estiver em curso. O mesmo vale para `oficio_sequencias` (N11), `avisos` e
   `trilha_eventos` (N13), que a eliminação apaga antes de `providencias`. A
   E05 confere por teste que a função de eliminação juntada toma N1 antes do
   primeiro DELETE; se não tomar, a E05 não junta antes da correção da F03.
4. **As travas implícitas de chave estrangeira não fecham ciclo.** O INSERT de
   uma filha toma `FOR KEY SHARE` na linha do encaminhamento e nas linhas pai
   (`organizacoes`, `usuarios`, `orgaos`). `FOR KEY SHARE` só conflita com `FOR
   UPDATE`, com `DELETE` e com UPDATE de coluna de chave. Por isso N10 é tomado
   por UPDATE que não muda coluna de chave ou por `FOR NO KEY UPDATE`, nunca por
   `FOR UPDATE`, e `id`, `organizacao_id` e `orgao_id` de `providencias` são
   imutáveis (decisão 8): a filha de um encaminhamento gravada por uma
   transação não espera a trava do encaminhamento segurada por outra, e
   vice-versa. Os caminhos de identidade usam `FOR SHARE` e UPDATE de colunas
   que não são chave (`ativo`, credencial, suspensão), que não conflitam com
   `FOR KEY SHARE`; `pessoa_id` é imutável (ADR 0009, decisão 1). O único
   `DELETE` dessas linhas é a eliminação, ordenada pela regra 3.
5. **A ordem efetiva de quem escreve, por caminho.** O gatilho `AFTER UPDATE`
   da 018 gravava o aviso ao fim do UPDATE, antes de a rota gravar o evento
   (N13 antes de N12). Ele é aposentado na 070 (decisão 7, e), e o aviso passa
   a nascer do evento (decisão 17). Em toda linha abaixo, N1 é a chamada de
   `travar_municipio_para_escrita()` (item 2a), fora a abertura do link, que
   trava dentro de `abrir_oficio`:

   | Caminho | Sequência |
   | --- | --- |
   | transição do órgão ou da Defesa Civil (aceite, resposta, devolução, esclarecimento pedido e respondido, complemento, conclusão, cancelamento) | N1; N10 pelo UPDATE condicional do estado, no qual rodam o `BEFORE` (matriz coluna por ator e transição válida) e o `AFTER` que grava o evento (N12); do evento, o gatilho grava espelho e aviso (N13) |
   | criação pela Defesa Civil | N1; INSERT da linha nova de `providencias` (o `BEFORE` do 017 pode inserir em `orgaos`, com espera só de unicidade do nome), cujo `AFTER INSERT` grava o evento `enviado` com `fato_seq` 1 e versão 1 (N12), e dele o espelho e o aviso (N13); INSERT da versão 1 do dossiê (N12, chave com o id nascido nesta transação, regra 1). **Sem ofício nesta transação (correção 2):** se a Defesa Civil pede o ofício junto, a rota confirma a criação e roda a emissão como caminho próprio, em transação nova, pela linha abaixo; uma falha na emissão deixa o encaminhamento criado sem ofício, estado legítimo, e a resposta diz isso. Assim N11 nunca é tomado depois de N13 |
   | emissão do ofício | N1; N10 (`FOR NO KEY UPDATE`, relendo o estado: encaminhamento cancelado ou concluído não recebe ofício); N11 (`proximo_oficio`); N12 (INSERT do ofício e do envio); N13 |
   | reenvio com dossiê novo | N1; N10 (`FOR NO KEY UPDATE`, relendo `devolvido`); N12 (INSERT da versão nova do dossiê, que não gera evento); UPDATE de `devolvido` para `enviado` na linha já travada em N10 (nenhuma trava nova), cujo `AFTER UPDATE` grava `reenviado` com o `fato_seq` e a versão nova (N12); N13 (correção 2: a versão vem antes da transição, para a sequência não voltar de N13 a N12) |
   | reenvio do link e desfecho do envio | N1; N12 (INSERT do envio, ou UPDATE de `desfecho` e `detalhe` na linha do envio) |
   | abertura do link (`abrir_oficio`, decisão 12) | leitura do envio sem trava; N1; N12 (`FOR UPDATE` e releitura do envio, INSERT da abertura e, com `entregue`, do evento); N13 só o que o mapeamento da decisão 17 declarar para esse evento |
   | visualização pelo órgão (`POST`) | N1; N12 (INSERT direto do evento; espera só de unicidade por usuário e estado) |
   | alteração de prazo, prioridade e atribuição | N1; N10 (UPDATE de uma coluna mapeada por comando, decisão 17, item 2), com o `AFTER` gravando o fato de linha (N12) e o que dele nasce (N13) |
   | recomposição do dossiê do legado "pedido em revisão" (decisão 17, item 2) | N1; N10 (`FOR NO KEY UPDATE`, relendo a marca); N12 (INSERT da versão nova); UPDATE que limpa a marca na linha já travada, cujo `AFTER` grava `dossie_recomposto` (N12); N13 |
   | relógios (lembrete da E10, escalonamento da E16, sino da E11) | como `sistema`, um encaminhamento por transação ou vários em ordem crescente de id: N1; N10 (`FOR NO KEY UPDATE`, relendo o estado: encaminhamento concluído na mesma hora não recebe lembrete); N12; N13 |

6. **Nenhum caminho de identidade toca N10 a N13**, fora a eliminação. O
   encerramento de um vínculo e a desativação de uma conta não mexem em
   encaminhamento: o efeito chega pela leitura da transação seguinte. Uma
   atribuição (`destinatario_id`) concorrente com o encerramento do vínculo do
   atribuído pode ficar apontando para quem perdeu o acesso; o atribuído não lê
   mais nada, e o gestor atribui de novo. É consequência assumida, não ciclo.
7. Cada migração da F04 que cria ou redefine um caminho de escrita cita, no
   cabeçalho, o caminho e o nível de cada comando, como a ADR 0009 pede às da
   F03; a que cria um gatilho escreve de que nível para qual ele desce.

**Testes concorrentes obrigatórios**, com duas conexões, a ordem forçada nos
dois sentidos e nenhum 40P01: aceite do órgão contra cancelamento pela Defesa
Civil (um vence, o outro recebe 409, o estado final é um dos dois); duas
respostas (E07: uma 200 e uma 409, o texto da primeira intacto); resposta do
órgão contra a desativação da conta do autor e contra o encerramento do vínculo
(E05); aceite contra a eliminação do município (E05); **chave idempotente
contra a eliminação** (E05): uma transação do encaminhamento que, já com N1,
grava uma filha de chave única (segunda visualização do mesmo usuário e
estado, segunda resposta, marco de lembrete) contra a eliminação do mesmo
município; se a eliminação vence, o caminho recusa sem escrever; se o caminho
vence, a eliminação apaga também o que ele gravou; **emissão de ofício** contra
transição do mesmo encaminhamento e contra outra emissão do município (E05:
N10 e N11); lembrete contra conclusão (E10).

### 15. Funções privilegiadas e o ator de órgão

- A RESTRICTIVE `TO dc360_app` não alcança o dono das funções. **Toda função
  SECURITY DEFINER executável pelo `dc360_app` é, por definição, uma porta em
  volta das classes da decisão 3**, e por isso cada uma precisa dizer o que faz
  diante do ator de órgão.
- O catálogo do órgão (E06) dá a cada entrada de `FUNCOES_PRIVILEGIADAS` (base,
  F03 e F04) uma declaração conferida por teste: `recusa` (a função confere
  `app_ator_tipo()` e recusa o ator de órgão; é o padrão para relógio e para o
  que é do servidor); `propria` (só alcança a conta ou a pessoa do próprio ator:
  vigência, autenticação, segundo fator); `antes_do_ator` (roda antes de
  existir ator: login, link de uso único, `interesse_recente`); ou `gatilho`
  (correção 1: função `RETURNS trigger`, que o Postgres só executa como
  gatilho, nunca por chamada direta; é a forma dos geradores da decisão 17);
  ou `trava` (correção 2: a função só toma a trava compartilhada da linha do
  município do contexto, não devolve dado e não escreve, e vale igual para
  todo ator; é a forma de `travar_municipio_para_escrita()`, decisão 14, item
  2a, e só ela a usa). Função sem declaração reprova.
- **A etiqueta não prova o limite (correção 1).** A E06 não confere só a
  declaração: CHAMA cada função de `FUNCOES_PRIVILEGIADAS` sob o ator de órgão
  (Maria, com o contexto completo da Obras), inclusive as `antes_do_ator`, e
  confere o resultado e os efeitos (linhas escritas por tabela, pelo mesmo
  mecanismo da decisão 11). `recusa`: erro, e nenhuma escrita. `propria`: só a
  linha da conta ou da pessoa de Maria, nada de outra conta, órgão ou
  município. `antes_do_ator`: o mesmo resultado e os mesmos efeitos que a
  chamada sem contexto, e nada do encaminhamento, da ocorrência ou de outro
  órgão a mais por haver ator. `gatilho`: a chamada direta falha; o
  comportamento é provado disparando o gatilho sob o ator de órgão (o
  gerador grava exatamente o evento, o espelho e o aviso que o mapeamento
  declara, com autor e tipo derivados). `trava`: a chamada não devolve dado
  e não escreve nada; a linha do município do contexto fica travada (uma
  segunda conexão com `FOR UPDATE NOWAIT` nela recebe 55P03) e a de outro
  município não; o UPDATE de `organizacoes` de Maria continua alcançando zero
  linhas; e o corpo, conferido no catálogo, é o único `SELECT ... FOR SHARE`
  da decisão 14, item 2a, sem parâmetro. Uma função nova sem o teste
  comportamental sob ator de órgão reprova o catálogo.
- Toda função privilegiada que a F04 criar (`travar_municipio_para_escrita()`
  na E02, `varrer_lembretes_de_encaminhamento()` na E10 e o que a E11 e a
  E16 precisarem) entra no catálogo da própria etapa
  (`catalogo/f04-eNN.ts`) pela assinatura completa, com motivo, tenant, a lista
  exata de papéis com `EXECUTE` (sem `PUBLIC`) e o teste comportamental, e
  segue as regras de corpo da ADR 0009 (decisão 8: sem DDL, sem
  `session_replication_role`). A de relógio não tem parâmetro de município,
  devolve só ids e marco, e recusa quando o ator não é `sistema`.
- `app_orgao_vigente()`, o gatilho que valida a transição e a matriz coluna por
  ator NÃO são SECURITY DEFINER: rodam com os direitos de quem escreve, sob a
  RLS dele. Os GERADORES da decisão 17 (o que grava, a partir da linha de
  `providencias`, o evento da criação, da transição e do fato de linha,
  `enviado` e `reenviado` inclusive, e o `reencaminhado`; e o que grava
  espelho e avisos a partir do evento) SÃO SECURITY
  DEFINER de gatilho, de propósito: é o que permite tirar do `dc360_app`, sob
  qualquer ator, o INSERT desses fatos. Cada um tem `search_path` fixo, monta
  todo valor a partir de `NEW`, `OLD`, das funções de contexto e de linhas
  relidas pelo próprio gerador, nunca de coluna livre que o chamador escreveu
  para isso, e entra no catálogo da etapa com a declaração `gatilho`.

### 16. As exceções declaradas, cada uma com o que dispensa e o que mantém

| Exceção | O que dispensa | O que mantém | Etapa dona |
| --- | --- | --- | --- |
| Catálogo de órgãos visível ao órgão (classe C; `catalogo-de-destinos` da E08, para sugerir destino na devolução) | o isolamento por órgão no catálogo: o órgão sabe que os outros órgãos do município existem | município; nenhuma escrita; a API devolve só id, nome e sigla; nada de encaminhamento de outro órgão | E05, E08 |
| Numeração sequencial do município (número do ofício, 017; protocolo da ocorrência no dossiê, 001) | a não dependência de volume: o salto entre dois números que o órgão recebe revela quantos documentos o município numerou no meio | destino, conteúdo, órgão e ocorrência dos outros; nenhuma leitura; nenhuma outra contagem | existente; registrado aqui |
| Resposta em nome do órgão por servidor (P-12) | "só o órgão age pelo órgão", nas transições `aceito` e `respondido` | autoria verdadeira (autor servidor, marca derivada do ator), D-24, papel com `responder_providencia` conferido no banco | E03, E08; fim no CP-22 |
| Composição do dossiê | "nada do encaminhamento lê `ocorrencias`" | só sob o ator da Defesa Civil, só na rota dela, só campos catalogados, sigilo aplicado na leitura | E04, E08 |
| O dossiê enviado não herda o sigilo (decisão 7, b) | o sigilo da ocorrência do lado do órgão destinatário | o sigilo do lado dos servidores; composição e envio novo só por quem lê a restrita | E05 |
| `GET /publico/oficio/:token` consome a capacidade do link (decisões 11 e 12) | "nenhum GET escreve" | uso único, hash, prazo, nada fora do dossiê, nenhuma lista, nenhuma resposta; só o que a tabela da decisão 11 declara (abertura, um `visualizado` de autor `link` por envio, o 410 seguinte), tudo gravado por `abrir_oficio`; a rota não escreve | E12; o fim do link é do CP-22 |
| Evento `visualizado` de autor `link` (decisão 8) | "o autor do evento é o ator do banco" | só `abrir_oficio` o grava, com `entregue`, preso ao envio e à versão exibida; nenhuma policy do `dc360_app` aceita `autor_tipo = 'link'` | E12 |
| GET que registra o próprio acesso (decisão 11) | "nenhum GET escreve" | só INSERT append-only na tabela de registro declarada; nenhuma rota da família do órgão | E11 (lista nominal) |
| Ato administrativo por GET, legado (documentos de vistoria; termo de interdição, decisão 11) | "nenhum GET escreve" e "nenhum GET materializa estado ou fato de negócio" | só as tabelas e efeitos declarados; nenhuma rota da família do órgão; nenhuma entrada nova nesta categoria | E11 registra; conversão em POST fora da F04 (H novo) |
| Categoria anterior ao município (`interesse_municipio`, decisão 3) | `organizacao_id` e a forma da decisão 7, a; o `IS NULL` sobre contexto | sem SELECT ao `dc360_app`; recusa a todo ator autenticado; uma tabela só | E05, E06 |
| Geradores SECURITY DEFINER de gatilho (decisão 17) | "o gatilho do encaminhamento roda com os direitos de quem escreve" | não são chamáveis diretamente; valores derivados de `NEW`, `OLD` e do contexto; declaração `gatilho` e teste sob ator de órgão (decisão 15) | E03, E04, E11 |
| Guarda N1 do ator de órgão por função (`travar_municipio_para_escrita()`, decisão 14, item 2a; correção 2) | a classe C, que nega ao ator de órgão a trava da linha de `organizacoes` (o `FOR SHARE` passa pela policy de UPDATE) | só a força `FOR SHARE`, só a linha do município do contexto, sem parâmetro, sem dado devolvido, sem escrita; o UPDATE de `organizacoes` continua negado ao órgão; ACL exata e declaração `trava` (decisão 15) | E02, E05, E06 |
| Aviso de escalonamento a órgão de nível acima (E16) | "o sino do órgão só fala do próprio órgão": o órgão do nível sabe que um encaminhamento de outro órgão venceu | nenhuma leitura do encaminhamento (404), nenhum dossiê, protocolo ou pessoa; só ponteiro, órgão de origem e rótulo do nível | E16 |
| Leitura da linha de `providencias` pelo órgão (classe A), com `ocorrencia_id` e os textos livres da Defesa Civil (`descricao`, `responsavel`, `orgao_destino`, `resposta` e `respondida_por` legados), e de `oficios` com `observacoes` | "o órgão não vê nada da ocorrência" e "texto livre só pelo dossiê e pelos eventos" (decisão 5), no nível da linha: privilégio de coluna é do papel de banco e não separa atores | o id é opaco; a API da família do órgão e a página do link não devolvem nenhuma dessas colunas (lista de inclusão, E08 e E12, provada no contrato); `ocorrencias` continua classe D | E05, E08, E12 |

Exceção que não está nesta tabela não existe. Uma etapa que precise de outra
escreve a linha nesta ADR por nota de revisão, com as três colunas, antes do
código.

### 17. Os fatos do encaminhamento são gravados pelo banco (correção 1; item 2 refeito na correção 2)

A primeira redação conferia quem grava e onde, mas não O QUE: um evento, um
espelho ou um aviso aceito pelo `WITH CHECK` podia afirmar um fato que não
aconteceu. A regra agora é que todo fato do encaminhamento que outra pessoa lê
como acontecido é gravado pelo banco a partir do acontecimento, na mesma
transação, e nunca recebido do `dc360_app`.

1. **Dois tipos de evento, numa tabela só** (`EVENTOS_DO_ENCAMINHAMENTO`, no
   shared, igual no banco por teste da E03), que diz para cada tipo: de onde
   ele nasce, quem pode produzi-lo, se é visível ao órgão, as chaves de texto
   admitidas no `detalhe` (lista de inclusão, decisão 5) e o que nasce dele
   (espelho na trilha, aviso, aviso do órgão):
   - **fatos gerados pelo banco**: toda transição da decisão 9 (a criação,
     com `enviado`, inclusive), todo fato de linha (prazo, prioridade,
     atribuição alterados; e `dossie_recomposto`, correção 2, item 2) e o
     `reencaminhado`, gravado no encaminhamento pai quando nasce o filho com
     `parent_id`. O `dc360_app` NUNCA os insere, sob ator nenhum, servidor
     inclusive;
   - **fatos de inserção direta**, numa lista positiva por ator: `usuario_orgao`
     só `visualizado` do próprio órgão; `sistema` só `lembrete` (E10) e
     `escalonado` (E16); `servidor` nenhum na F04. O `visualizado` de autor
     `link` é só de `abrir_oficio` (decisão 8). A RESTRICTIVE de INSERT de
     `encaminhamento_eventos` `TO dc360_app` é exatamente essa lista, e um
     gatilho `BEFORE INSERT` deriva autor, marca, visibilidade e, no
     `visualizado`, a versão vigente do dossiê, ignorando o que veio no
     comando.
2. **O evento nasce da transição, e cada transição tem o seu (refeito na
   correção 2).** A correção 1 fazia `enviado` e `reenviado` nascerem da
   inserção da versão do dossiê, conferindo só que a linha estava em
   `enviado`, e o gatilho adiado só conferia que toda mudança de estado tinha
   ganhado um evento. Isso deixava passar o contrário: uma versão adicional
   do dossiê num encaminhamento já em `enviado`, sem transição nenhuma,
   gerava um `reenviado` que nenhuma transição produziu, e uma conferência
   por contagem não separa transições repetidas na mesma transação nem
   impede reaproveitar evento antigo. A regra agora:
   - **Um gerador `AFTER INSERT OR UPDATE` em `providencias` grava todo
     evento gerado da linha.** Na criação, `enviado`. Numa mudança de estado,
     o tipo da tabela de transições para o par (estado anterior, estado
     novo), nunca do comando; `devolvido` para `enviado` dá `reenviado`.
     Numa mudança de coluna mapeada, o fato de linha. O texto da rodada
     (resposta, motivo, destino sugerido, pergunta e resposta de
     esclarecimento) chega no MESMO UPDATE, em colunas da linha do
     encaminhamento que a matriz coluna por ator libera só para aquela
     transição; o gerador o copia para o `detalhe` nas chaves que o tipo
     admite. A forma dessas colunas (uma por texto ou uma coluna de texto da
     transição com chaves fixas por tipo) é da E02 e da E03, com teste.
   - **Um fato por comando.** O `BEFORE UPDATE` recusa o comando que muda
     mais de um entre o estado e cada coluna mapeada (a Defesa Civil que
     muda prazo e prioridade manda dois UPDATE). Cada UPDATE gera, então,
     nenhum fato ou exatamente um.
   - **O número do fato.** `providencias` ganha `fato_seq` (inteiro, `NOT
     NULL`), escrito só pelo banco: o `BEFORE INSERT` o põe em 1, e o `BEFORE
     UPDATE` o faz `OLD.fato_seq + 1` quando o comando gera fato e
     `OLD.fato_seq` quando não, ignorando o valor recebido. O evento gerado
     leva o mesmo `fato_seq`, com unicidade `(organizacao_id, providencia_id,
     fato_seq)` entre os eventos que o têm. Transições repetidas na mesma
     transação (`aceito`, `respondido`, `aceito` por complemento,
     `respondido` de novo) têm números diferentes e eventos diferentes; um
     evento antigo tem número menor e não serve a uma transição nova.
   - **A versão do dossiê presa à transição.** `providencias` ganha
     `dossie_versao_vigente`, escrita só pelo banco: 1 na criação;
     `OLD.dossie_versao_vigente + 1` na transição `devolvido` para `enviado`
     e na recomposição do legado (abaixo); imutável em todo outro comando. O
     `enviado`, o `reenviado` e o `dossie_recomposto` levam `dossie_versao`
     igual à versão vigente nova, com unicidade de um evento desses três
     tipos por versão. A coluna `dossie_versao` do evento tem chave
     estrangeira composta `(organizacao_id, providencia_id, dossie_versao)`
     para `encaminhamento_dossies`, `DEFERRABLE INITIALLY DEFERRED`, porque na
     criação o evento nasce antes da versão 1; o `visualizado` também a usa,
     para a versão que o órgão viu (decisões 8 e 12), mas não declara
     versão nova. **A inserção da versão do dossiê não gera evento nenhum.**
     O `BEFORE INSERT` de `encaminhamento_dossies` exige versão sequencial
     (a maior existente do encaminhamento mais um), e um gatilho de
     restrição adiado exige, ao confirmar, exatamente um evento `enviado`,
     `reenviado` ou `dossie_recomposto` do mesmo encaminhamento com aquela
     versão. Versão adicional sem transição, portanto, não confirma e não
     produz `enviado` nem `reenviado`; transição para `enviado` sem a versão
     nova também não confirma, pela chave adiada do evento.
   - **A conferência adiada compara cada transição com o seu evento, sem
     contar.** O gatilho de restrição `AFTER INSERT OR UPDATE` em
     `providencias`, `DEFERRABLE INITIALLY DEFERRED`, `FOR EACH ROW`, só
     quando `fato_seq` mudou, dispara uma vez por comando que gerou fato, e
     o Postgres entrega a cada disparo adiado o `OLD` e o `NEW` do próprio
     comando, não os da linha no fim da transação. Ele confere que existe
     exatamente um evento daquele encaminhamento com `fato_seq =
     NEW.fato_seq`, do tipo que o par `OLD`/`NEW` exige e, quando o tipo
     declara versão, com `dossie_versao = NEW.dossie_versao_vigente`.
   - **Os demais eventos.** O `reencaminhado` nasce do INSERT do filho, no
     pai, preso ao filho por `encaminhamento_filho_id`, com unicidade de um
     por filho, sem `fato_seq`. Os de inserção direta (`visualizado`,
     `lembrete`, `escalonado`) e os de origem `migracao` têm `fato_seq`
     nulo. Um CHECK por tipo fixa quais colunas cada tipo exige e quais
     proíbe.
   - **Recomposição do legado.** O encaminhamento legado marcado "pedido em
     revisão" (decisão 5) é o único caso de versão nova sem transição de
     estado: o coordenador ou o administrador insere a versão 2 e, no
     comando seguinte, limpa a marca; o `BEFORE UPDATE` só avança a versão
     vigente nessa troca da marca, e o gerador grava o fato de linha
     `dossie_recomposto`, com a versão. Sem a marca, a versão só avança em
     `devolvido` para `enviado`.
3. **Espelho e aviso nascem do evento, presos a ele.** Um gerador `AFTER INSERT`
   em `encaminhamento_eventos` grava, conforme o mapeamento do tipo: o espelho
   em `trilha_eventos` (origem `portal` para ator de órgão, `escritorio` para
   servidor; autor do evento), o aviso em `avisos` e, a partir da E11, o aviso
   do órgão. `trilha_eventos` e `avisos` ganham a coluna
   `encaminhamento_evento_id`, com chave estrangeira composta
   (`organizacao_id`, `encaminhamento_evento_id`) para o evento; a chave do
   aviso passa a ser `encaminhamento_evento:<id>` (uma por rodada; os avisos
   antigos de chave `providencia:<id>` ficam como estão). O tipo do espelho e o
   do aviso vêm do mapeamento, nunca do comando. **A chave é reservada
   (correção 2).** Como a unicidade `aviso_unico_por_fato` é por município e
   chave, um aviso de tipo permitido gravado antes com
   `encaminhamento_evento:<id>` ocuparia a chave do aviso verdadeiro. Por
   isso: (a) o aviso gerado é coerente por CHECK na tabela: com
   `encaminhamento_evento_id` preenchido, `chave_do_fato =
   'encaminhamento_evento:' || encaminhamento_evento_id` e o tipo na lista
   dos tipos do mapeamento; com ela nula, a chave fora do prefixo
   (`NOT starts_with(chave_do_fato, 'encaminhamento_evento:')`, nunca `LIKE`,
   em que `_` casa qualquer caractere); (b) o INSERT direto do `dc360_app`
   exige `encaminhamento_evento_id` nulo e a chave fora do prefixo (item 4);
   (c) o gerador grava o aviso SEM `ON CONFLICT`: um conflito na chave
   reservada é erro, a transição inteira volta, e nunca confirma uma
   transição sem o aviso dela. O `DO NOTHING` da 018 não é repetido em
   gerador nenhum desta ADR.
4. **O que o `dc360_app` deixa de poder gravar, sob qualquer ator:** evento de
   transição ou de fato de linha; `visualizado` de autor `link`; linha de
   `trilha_eventos` com origem `portal` ou com `encaminhamento_evento_id`
   (RESTRICTIVE de INSERT `TO dc360_app` na 068); linha de `avisos` dos tipos
   `providencia_respondida` e `encaminhamento_*`, e linha de `avisos` de
   qualquer tipo com `encaminhamento_evento_id` preenchido ou com a chave no
   prefixo `encaminhamento_evento:` (RESTRICTIVE de INSERT `TO dc360_app`
   com a lista positiva dos tipos que a aplicação grava, a referência nula e
   a chave fora do prefixo, na 070, E07; o CHECK de coerência do item 3
   também na 070, e a lista de tipos dele redefinida na E11, quando entram
   os `encaminhamento_*`). O ator de órgão, além disso, não grava nada em
   `trilha_eventos` nem em `avisos` (classe D, decisão 3).
5. **Consequência para a rota.** A rota faz a transição por UPDATE condicional
   e não grava evento, espelho nem aviso; `encaminhamentos/eventos.ts` (E08)
   só grava os tipos de inserção direta. No reenvio e na recomposição, a rota
   insere a versão nova do dossiê ANTES do UPDATE (decisão 14, item 5); na
   criação, depois do INSERT do encaminhamento. O backfill de estado (067,
   com `fato_seq` e `dossie_versao_vigente` dos legados) e o de eventos de
   origem `migracao` (068) acontecem antes de os geradores e as
   conferências adiadas existirem, e nenhum aviso nem espelho nasce deles
   (teste da E03).
6. **Testes obrigatórios (E03 e E05).** Sob Maria (Obras): INSERT em
   `avisos` de `providencia_respondida` com a chave legítima `providencia:<id>`
   ou `encaminhamento_evento:<id>` de um encaminhamento dela, ANTES da
   resposta, recusado; depois, a resposta verdadeira grava o aviso uma vez,
   preso ao evento. INSERT em `trilha_eventos` de qualquer tipo (inclusive um
   reservado à Defesa Civil, como `documento_emitido`) recusado. INSERT em
   `encaminhamento_eventos` de tipo de transição (`respondido`, `aceito`,
   `concluido`) ou com `autor_tipo = 'link'` recusado, com o mesmo erro para
   encaminhamento próprio, de outro órgão e inexistente. Sob Rita (servidora),
   INSERT direto de evento de transição e de aviso `providencia_respondida`
   recusados. Toda transição da decisão 9, feita por UPDATE sob o ator certo,
   produz exatamente um evento do tipo da tabela, o espelho e o aviso do
   mapeamento, com autor e marca derivados; o mesmo UPDATE sem mudança no
   estado nem nas colunas mapeadas não produz nada (correção 2: um UPDATE
   que só muda prazo, prioridade ou atribuição produz o fato de linha, e não
   "nada").
7. **Testes da correlação (correção 2; E03 e E04).** (a) Versão adicional
   sem transição: com o encaminhamento em `enviado` e depois em `aceito`, o
   INSERT da versão seguinte do dossiê não confirma (gatilho adiado), e
   nenhum `enviado` nem `reenviado` existe a mais; versão fora de sequência
   é recusada no INSERT. (b) Múltiplas transições na mesma transação, com
   repetição: de `enviado`, numa transação só, sob o coordenador (P-12 nas
   transições do órgão), `aceito`, `respondido`, `aceito` (complemento) e
   `respondido` de novo produzem quatro eventos, com `fato_seq`
   consecutivos, o tipo de cada par e dois `respondido` distintos, cada um
   com o texto da sua rodada, e confirmam. (c) Transição `devolvido` para `enviado` sem a versão nova não
   confirma; com ela, grava um `reenviado` com a versão nova e confirma. (d)
   UPDATE que muda o estado e uma coluna mapeada juntos é recusado. (e)
   Recomposição sem a marca "pedido em revisão" é recusada; com ela, grava
   um `dossie_recomposto` e nenhum `reenviado`. (f) A conferência não é
   enfeite: num banco descartável, com o gerador trocado por um plantado
   que pula a segunda transição de (b), ou que grava o segundo `respondido`
   com o `fato_seq` do primeiro, ou que grava `reenviado` sem versão, a
   confirmação falha nos três casos.

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
| P-15 | gatilhos 017 e 018 sob o ator de órgão; `portal` na origem da trilha | NORMA, refeita na correção 1: o 018 de `providencias` é aposentado na 070, o aviso e o espelho nascem do evento pelo banco, e `portal` e `usuario_orgao` entram nos CHECK da trilha na 068 (decisões 7, e, e 17) |

## Consequências

### O que muda em cada etapa da F04

| Etapa | O que esta ADR exige dela |
| --- | --- |
| E02 | estados e colunas; `destinatario_id` com chave composta e gatilho que exige vínculo vigente no órgão do encaminhamento, lido sem trava (decisão 14); `UNIQUE (organizacao_id, id, orgao_id)` como alvo das chaves triplas; `chave_de_criacao` única por município, escrita só pela Defesa Civil; as colunas do texto da rodada que o gerador copia para o evento (decisão 17, item 2); `fato_seq` e `dossie_versao_vigente`, escritas só pelo banco (decisão 17, item 2, correção 2); a função `travar_municipio_para_escrita()` com assinatura completa, ACL exata e declaração `trava` no catálogo da etapa (decisão 14, item 2a); backfill de estado antes de existir gerador; nenhuma policy de órgão (até a E05 nenhum ambiente com dado real liga `PORTAL_ATIVO`) |
| E03 | tabela de transições com o ator e o papel de cada uma (decisão 9) e `EVENTOS_DO_ENCAMINHAMENTO` (decisão 17), iguais no shared e no banco; gatilho de validação com `app_ator_tipo()`, `app_ator_papel()` e o papel no órgão (leitor não transita); os geradores SECURITY DEFINER de gatilho (evento da criação, da transição e do fato de linha a partir de `providencias`, com `fato_seq` e, nos tipos que declaram versão, `dossie_versao`; espelho e aviso a partir do evento, sem `ON CONFLICT`), com a declaração `gatilho` no catálogo da etapa; um fato por comando no `BEFORE UPDATE`; o gatilho de restrição adiado por transição, que compara cada comando com o seu evento pelo `fato_seq` (decisão 17, item 2, correção 2); unicidade do `fato_seq` e de um evento de versão por versão; CHECK por tipo das colunas que cada evento exige e proíbe; `encaminhamento_evento_id` com chave composta em `trilha_eventos` e `avisos`; `portal` em `origem` e `usuario_orgao` em `autor_papel` da trilha, se a F03 não tiver feito; RESTRICTIVE de INSERT em `encaminhamento_eventos` (tipos de inserção direta por ator) e em `trilha_eventos` (nada de origem `portal` nem de evento ligado pelo `dc360_app`); autoria e marca `em_nome_do_orgao` derivadas do ator (decisão 8); `reencaminhado` nunca visível ao órgão (CHECK); chaves triplas; ordem de apagamento com os eventos depois de `avisos` e `trilha_eventos` |
| E04 | lista de inclusão e sensível só com justificativa (decisão 10); `pedido` e `observacoes_da_coordenacao` como "texto livre dirigido ao órgão" em `campos_sensiveis` (decisão 5); composição só sob o ator da Defesa Civil, com sigilo (decisão 7, b); `campos_sensiveis` atualizável só por servidor e sistema; a inserção da versão do dossiê não gera evento (correção 2): versão sequencial no `BEFORE INSERT`, gatilho de restrição adiado que exige exatamente um `enviado`, `reenviado` ou `dossie_recomposto` declarando a versão, e a chave estrangeira adiada do evento para a versão (decisão 17, item 2); a recomposição do legado com `dossie_recomposto`; versão 1 `migracao` sem texto livre, legados abertos marcados "pedido em revisão" e contados |
| E05 | classes A, B, C, D, "sem alcance" e "anterior ao município" (decisões 2 e 3), com a composição da classe A por comando, `USING` e `WITH CHECK`; matriz de escrita da classe B; `app_orgao_vigente()` (decisão 4); as seis decisões da decisão 7; sigilo dos dois lados; testes da decisão 17 sob ator de órgão; os dois limites de `travar_municipio_para_escrita()` sob Maria (decisão 14, item 2a); testes concorrentes da decisão 14, com a prova de que a eliminação juntada toma N1 antes do primeiro DELETE; o mecanismo de tempo da decisão 13, item 6, medido |
| E06 | catálogo do órgão: exatamente uma classificação para toda tabela descoberta no catálogo do Postgres, inclusive "sem alcance" e "anterior ao município"; policy de toda tabela com `orgao_id` com `app_orgao_vigente` ou `app_ator_tipo`, sem `IS NULL` sobre contexto (fora a RESTRICTIVE nomeada da categoria anterior ao município) nem `OR true`; nenhuma PERMISSIVE de classe A com o ramo do órgão, e a RESTRICTIVE em cada comando; corpo de `app_orgao_vigente()` sem `IS NULL` sobre contexto; ACL exata dela e do auxiliar de negação; declaração de cada função privilegiada e a chamada de cada uma sob ator de órgão, com resultado e efeitos (decisão 15); cada ramo acusado num banco descartável |
| E07 | privilégio de coluna sem `id`, `organizacao_id` e `orgao_id`; resposta imutável; matriz coluna por ator (decisão 8); 017 restrito a INSERT ou inerte; aposentadoria do 018 em `providencias` e RESTRICTIVE de INSERT em `avisos` com a lista positiva de tipos da aplicação, `encaminhamento_evento_id` nulo e a chave fora do prefixo `encaminhamento_evento:`; CHECK de coerência entre referência, chave e tipo do aviso gerado (decisões 7, e, e 17, itens 3 e 4, correção 2); resposta legada como transição |
| E08 | duas famílias de rota; ordem das conferências da decisão 13, item 2; 404 achado sob o ator do órgão; autoria do token e da vigência; `orgaoId` só da rota, conferido; transição só por UPDATE condicional, sem gravar evento, espelho ou aviso, e N1 por `travar_municipio_para_escrita()` antes de tudo, sem `FOR SHARE` direto em `organizacoes` (decisões 14 e 17); criação sem ofício na mesma transação e reenvio com a versão do dossiê antes do UPDATE (decisão 14, item 5, correção 2); resposta por lista de inclusão sem `ocorrenciaId`, `parent_id` nem os textos livres de `providencias` e `oficios` (decisão 5); D-24 e P-12; visualização por POST |
| E09 | busca do órgão sob a RLS, sem total que some outro órgão; ofícios, exportações e `GET /orgaos` fechados ao token do portal (P-06, P-07) |
| E10 | relógio como `sistema`; função privilegiada sem parâmetro de município, só ids e marco, recusando outro ator (decisão 15); N1 e N10 antes de gravar (decisão 14); `lembrete` como inserção direta do sistema e `prazo_alterado` como fato de linha gerado pelo banco (decisão 17) |
| E11 | sino do órgão (classe A) e lidos (classe B, única escrita pessoal do ator de órgão); tipos `encaminhamento_*` acrescentados ao mapeamento, ao gerador da decisão 17 (redefinição declarada no catálogo da etapa, ainda sem `ON CONFLICT`) e à lista de tipos do CHECK de coerência de `avisos` (decisão 17, item 3), nunca INSERT do órgão em `avisos`; `GET /avisos` deixa de escrever; `get-nao-escreve.test.ts` com as três naturezas, todas as tabelas e efeitos por rota e o mecanismo que acusa escrita revertida (decisão 11) |
| E12 | migração própria que redefine `abrir_oficio` (N1, releitura, evento `visualizado` de autor `link` com envio e versão); página do link e impressão do ofício pela Defesa Civil montadas do dossiê, sem os textos livres de `providencias` e `oficios`; a rota do link não escreve; D-05 conforme a decisão 12 |
| E13 | os dez cenários; status, corpo e cabeçalhos iguais entre ids nos quatro casos da decisão 13, item 2 (403 de papel, 422, 429 e 404), com a contagem do limite igual para id próprio e alheio; prova estrutural da mesma sequência de comandos e teste de tempo com margem (decisão 13, item 6); regra da ocorrência encerrada |
| E14 | prioridade só pela Defesa Civil, pela matriz coluna por ator e não por `GRANT` (decisão 8); `prioridade_alterada` como fato de linha gerado pelo banco |
| E15 | `orgao_competencias` classe C; competência só sugere e valida (CP-53, alternativa A como premissa); nada bloqueia a Defesa Civil |
| E16 | cadeia como dado do município (CP-53, alternativa C); aviso de escalonamento como exceção declarada (decisão 16); `escalonado` como inserção direta do sistema; destinatário lendo o encaminhamento: 404; `ESCALONAMENTO_AUTOMATICO=nao` |
| E17 | devolução só antes do aceite, no shared, no banco e na API (D-23) |

### Testes obrigatórios que a etapa responsável traz

| Etapa | Teste |
| --- | --- |
| E02 | sob Rita, `travar_municipio_para_escrita()` trava a linha do município A (segunda conexão com `FOR UPDATE NOWAIT` em A: 55P03) e não a de B; nada é escrito; recusa município eliminado e contexto ausente; ACL exata (só `dc360_app`, sem `PUBLIC`) e corpo conferidos no catálogo (decisão 14, item 2a) |
| E03 | evento direto com autor, marca ou visibilidade diferentes do derivado: o banco grava o derivado; leitor transitando recusado no banco; operador concluindo recusado no banco (D-24); `reencaminhado` visível ao órgão recusado; cada transição da decisão 9 gera exatamente um evento, o espelho e o aviso do mapeamento; UPDATE sem mudança no estado nem nas colunas mapeadas não gera nada; UPDATE que muda o estado e uma coluna mapeada juntos recusado; os testes da correlação da decisão 17, item 7, (b), (d) e (f); transição sem evento não confirma; backfill sem aviso nem espelho; servidor inserindo evento de transição ou espelho de origem `portal` recusado |
| E04 | os testes da correlação da decisão 17, item 7, (a), (c) e (e): versão adicional sem transição não confirma e não gera `enviado` nem `reenviado`; versão fora de sequência recusada; `devolvido` para `enviado` sem versão nova não confirma; recomposição só com a marca, gerando `dossie_recomposto` |
| E05 | Maria (Obras), João (Saúde), Ana (os dois) e Rita (servidora) no município A, mais o município B, com os casos positivos e negativos da etapa; os negativos da decisão 17 (aviso antes da resposta, evento de tipo reservado, trilha de qualquer tipo, `autor_tipo = 'link'`), com o mesmo erro para encaminhamento próprio, alheio e inexistente; autopromoção e troca de órgão no banco (decisão 3); o formulário público grava e todo ator autenticado é recusado em `interesse_municipio`; composição da classe A por comando, com `USING` e `WITH CHECK` (decisão 2); RESTRICTIVE de sigilo: Maria lê o encaminhamento de ocorrência restrita enviado à Obras, e o operador sem autoria não lê o dossiê dele; os testes concorrentes da decisão 14, com a chave idempotente contra a eliminação; os dois limites da guarda N1 sob Maria: a função trava A e, com a trava, o UPDATE de `organizacoes` alcança zero linhas e nada muda; a função não trava B; o `SELECT ... FOR SHARE` direto de Maria devolve zero linhas (regressão da regra do Postgres, decisão 14, item 2a) |
| E06 | tabela com `orgao_id` e policy só por município reprova; policy com `IS NULL` sobre contexto fora da RESTRICTIVE nomeada reprova; policy com `OR true` reprova; PERMISSIVE de classe A com o ramo do órgão reprova; comando de classe A sem RESTRICTIVE reprova; tabela sem classificação, ou com duas, reprova; entrada da lista sem tabela reprova; classe "sem alcance" com grant reprova; função privilegiada sem declaração reprova; função cujo comportamento sob ator de órgão difere da declaração reprova; `aplicar_negacao_ao_usuario_de_orgao` com `EXECUTE` de `PUBLIC` ou do `dc360_app` reprova |
| E07 | ator de órgão mudando `prioridade`, `prazo_em` ou `orgao_id` recusado pelo gatilho, com o privilégio de coluna presente; servidor mudando `orgao_id` recusado; resposta legada produz um aviso só, antes e depois da 070; `dc360_app` inserindo aviso `providencia_respondida` recusado; sob Rita e sob `sistema`, INSERT em `avisos` de tipo permitido com `encaminhamento_evento_id` preenchido ou com a chave `encaminhamento_evento:<id>` recusado; aviso incoerente (referência, chave e tipo) recusado pelo CHECK, inclusive como dono; num banco descartável, o aviso plantado como dono na chave do evento seguinte faz a transição falhar com erro de unicidade, e nunca confirmar sem o aviso |
| E11 | GET fora da lista nominal que escreve reprova; GET da lista que escreve tabela ou efeito não declarado reprova; GET da família autenticada do órgão que escreve qualquer coisa reprova; INSERT revertido e par INSERT e DELETE plantados num GET são acusados |
| E12 | INSERT direto com `autor_tipo = 'link'` recusado sob cada ator; a abertura `entregue` grava um `visualizado` só, com o envio e a versão que a página mostrou; segunda abertura: 410, sem evento novo; o documento, nas duas rotas, sem os textos livres de `providencias` e `oficios` |
| E13 | para cada rota do órgão: mesma sequência de comandos com id de outro órgão, de outro município e inexistente; status, corpo e cabeçalhos iguais entre ids no 403 de papel, no 422 de corpo, no 429 de taxa (cabeçalhos do limite comparados, relógio fixo, contagem igual para id próprio e alheio) e no 404; teste de tempo com margem no detalhe e no aceite |

### O que fica proibido

São as condições que reabrem o G04, mais as que esta ADR acrescenta:

- usuário de órgão lendo dado de outro órgão ou qualquer linha de
  `ocorrencias` ou das filhas dela;
- rota da família do órgão que leia como `servidor` ou `sistema` antes de
  decidir o 404, ou que leia `ocorrencias` sob qualquer ator;
- tabela com `orgao_id` sem policy de órgão fail-closed; tabela sem
  classificação, ou com duas; policy de órgão com `IS NULL` sobre contexto
  (fora a RESTRICTIVE nomeada da categoria anterior ao município) ou `OR
  true`; o ramo do órgão numa PERMISSIVE; condição de ator escrita como
  negação (`<> 'usuario_orgao'`) em vez de lista positiva;
- `usuario_orgao` escrevendo em `orgao_vinculos` ou em `usuarios`, ou em
  qualquer tabela da classe B fora da matriz de escrita (decisão 3);
- `dc360_app`, sob qualquer ator, gravando evento de transição ou de fato de
  linha, evento de autor `link`, espelho de origem `portal` ou aviso do
  encaminhamento; ator de órgão gravando em `trilha_eventos` ou em `avisos`
  (decisão 17);
- evento `enviado` ou `reenviado` nascido da inserção do dossiê; versão do
  dossiê que confirme sem exatamente um evento gerado que a declare;
  conferência de transição por contagem em vez de transição a transição;
  UPDATE que gere mais de um fato; `fato_seq` ou `dossie_versao_vigente`
  vindos do comando (decisão 17, item 2, correção 2);
- INSERT direto em `avisos` com `encaminhamento_evento_id` ou com a chave no
  prefixo `encaminhamento_evento:`; gerador de aviso com `ON CONFLICT DO
  NOTHING` (decisão 17, item 3, correção 2);
- texto livre de `providencias` ou de `oficios` chegando ao órgão fora do
  dossiê e dos eventos visíveis a ele; versão `migracao` do dossiê com texto
  livre (decisão 5);
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
- GET que escreva fora da lista nominal fechada da decisão 11, ou além das
  tabelas e efeitos declarados para ele, ou qualquer GET da família
  autenticada do órgão que escreva; entrada nova na categoria de ato
  administrativo por GET;
- resposta ao órgão (status, corpo, cabeçalho, tempo ou efeito) que dependa de
  dado de outro órgão ou município, fora das exceções da decisão 16; 403 onde o
  recurso é de outro órgão ou município, fora a exceção da decisão 13, item
  2 (o 403 de papel decidido antes da busca, igual para todo id, exista ou
  não o recurso e seja de quem for); recusa anterior à busca que varie
  conforme o id (decisão 13, item 2);
- organização vinda de outro lugar que não o token verificado; órgão como
  tenant; token com órgão; painel do órgão com vários municípios ao mesmo tempo;
- escalonamento que dê leitura a quem não é do órgão; devolução depois do
  aceite;
- exceção ao isolamento fora da tabela da decisão 16;
- caminho do encaminhamento que tome nível de N2 a N9 da ADR 0009, que escreva
  sem ter chamado `travar_municipio_para_escrita()` primeiro, que trave
  `organizacoes` por `FOR SHARE` direto, ou que trave a linha do
  encaminhamento com `FOR UPDATE`; criação que emita ofício na mesma
  transação; mudança de `id`, `organizacao_id` ou `orgao_id` de
  `providencias` (decisão 14);
- policy de `organizacoes` que deixe o ator de órgão travar a linha por
  comando (o `USING` de UPDATE aceitando o órgão), e a função da guarda com
  parâmetro, com dado devolvido, com escrita ou com `EXECUTE` de `PUBLIC`
  (decisão 14, item 2a).

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
  14, regra 6).
- **A regra "nenhum GET escreve" convive com uma lista nominal fechada** de GETs
  que registram o próprio acesso, com o consumo do link e com os atos
  administrativos por GET legados, até a conversão deles em POST fora da F04
  (decisão 11).
- **Toda escrita do encaminhamento toma a linha do município em `FOR SHARE`**
  (decisão 14), pela função da guarda (item 2a). É o modo que o login já
  usa; a suspensão e a eliminação passam
  a esperar as escritas em curso do município, e a linha recebe mais travas
  compartilhadas. Medir na F24-E02, junto das policies.
- **Os geradores dos fatos são SECURITY DEFINER de gatilho** (decisão 17), e
  a guarda N1 é uma função SECURITY DEFINER (decisão 14, item 2a): três
  funções privilegiadas a mais no catálogo, em troca de tirar do `dc360_app` o
  INSERT de fato que outra pessoa lê como acontecido e de dar ao órgão a
  trava sem lhe dar o UPDATE do município.
- **Um fato por comando** (decisão 17, item 2): a Defesa Civil que muda prazo
  e prioridade de uma vez manda dois UPDATE, e cada um gera o seu fato. É o
  preço de a conferência adiada comparar comando a comando.
- **A criação com ofício vira duas transações** (decisão 14, item 5): se a
  emissão falhar depois da criação confirmada, o encaminhamento fica sem
  ofício, e a Defesa Civil emite de novo.
- **Encaminhamento legado aberto não volta ao órgão sem revisão** (decisão 5):
  a Defesa Civil recompõe o dossiê antes do reenvio, e o órgão vê só o mínimo
  enquanto isso.
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
| Classe E: INSERT do ator de órgão em `trilha_eventos` e `avisos`, amarrado ao encaminhamento no `WITH CHECK` (primeira redação) | Confere quem e onde, não o quê: aceitaria fato reservado à Defesa Civil e aviso antecipado que engole o verdadeiro (correção 1, achado 1). O banco grava o fato a partir do acontecimento (decisão 17). |
| A rota grava o evento e um gatilho adiado confere que ele bate com a transição | Deixaria tipo, autor e texto chegarem pelo comando e só depois conferidos, com mais caminhos de erro; gerar no banco elimina a classe inteira de fato forjado. O gatilho adiado fica só para conferir que nenhuma transição ficou sem evento. |
| Distinguir a escrita do gatilho da escrita direta por `pg_trigger_depth()` ou por uma variável de sessão na policy | Marca que o `dc360_app` alcança ou contorna: a variável ele define, e a profundidade de gatilho ele obtém por qualquer gatilho que escreva na mesma tabela. A lição da ADR 0009. |
| Eliminação provando que bloqueia os escritores sem trava comum (só pela ordem de apagamento) | A ordem filho antes de pai não basta: a eliminação apaga uma filha sem confirmar e espera o encaminhamento, enquanto o caminho segura o encaminhamento e espera a unicidade daquela filha (correção 1, achado 2). A trava comum em N1 fecha o caso para todo nível. |
| Buscar o recurso antes de toda recusa (inclusive papel e corpo) | Também não enumera, mas faz a rota ler o banco para pedido que já se sabe recusado e espalha a regra pela rota; as recusas que não dependem do recurso, iguais para todo id, são mais simples de provar (decisão 13, item 2). |
| Separar travar de alterar na policy de `organizacoes` (`USING` de UPDATE aceitando o órgão, `WITH CHECK` recusando) | A policy não enxerga a força da trava: o órgão poderia tomar `FOR UPDATE` na linha do município, que conflita com o `FOR KEY SHARE` de toda filha e com todo `FOR SHARE` de N1, e o UPDATE dele travaria a linha antes da recusa (correção 2; decisão 14, item 2a). |
| `enviado` e `reenviado` nascendo da inserção da versão do dossiê, com o estado conferido (correção 1) | Estar em `enviado` não prova a transição: uma versão adicional sem transição gerava `reenviado` (correção 2, novo 2). O evento nasce da transição, e a versão é presa a ele (decisão 17, item 2). |
| Gatilho adiado que conta eventos por mudança de estado na transação | Contagem não separa transições repetidas na mesma transação nem impede reaproveitar evento antigo, e não vê o evento a mais. O `fato_seq` liga cada comando ao seu evento, e o disparo adiado de cada comando confere o seu (decisão 17, item 2). |
| Copiar o texto livre legado para a versão `migracao` do dossiê | O texto antigo foi escrito sem a regra de divulgação e pode carregar contato, relato ou informação interna; copiá-lo seria divulgá-lo pelo caminho novo (decisão 5). |

## Estado e aceite

- **Situação:** PROPOSTA, com as correções 1 e 2.
- **Aceite do Rafael (H116):** depende do aceite da ADR 0009 (H97), porque esta
  usa a pessoa, a conta, o vínculo, o ator e a ordem de travas de lá. Com o
  aceite, a situação passa a "aceita, em vigor" com a data.
- **Segunda leitura de segurança** de outra família de modelo, somente leitura,
  antes do aceite, como a ADR 0009 teve. A primeira rodada (nove achados, três
  bloqueando) entrou na correção 1, com seção própria no Contexto e a tabela
  achado a achado em `docs/evidencias-v2/G04/V2-F04-E01/correcao-1/`. A
  segunda rodada (dois pontos novos bloqueando e duas dívidas) entrou na
  correção 2, com a tabela item a item e a demonstração da regra do `FOR
  SHARE` em `docs/evidencias-v2/G04/V2-F04-E01/correcao-2/`. Uma nova rodada
  sobre esta redação vem antes do aceite; correção nova entra do mesmo
  jeito.
- **Decisões que esta ADR toma como premissa, com o dono:** CP-09 alternativa C
  (H133, Alyson e encarregado); CP-53 alternativa A para a competência e C para
  o escalonamento (H134, Alyson e município); P-12 e D-24 no encaminhamento
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
