-- =====================================================================
-- 024: a prova passa a ter autor, data plausivel e equipe conferida.
--
-- Tres defeitos da MESMA familia, a pior deste produto: o documento oficial
-- mente, ou a prova que o sustenta nao tem dono. Os tres foram reproduzidos
-- contra o servidor de teste antes desta migracao existir.
--
-- -------------------------------------------------------------------
-- 1. Anexar evidencia nao deixava rastro, e o banco nao guardava quem anexou
-- -------------------------------------------------------------------
--
-- `POST /evidencias/autorizar-envio` e `POST /evidencias/confirmar-envio` sao
-- as duas unicas escritas do produto que nao passavam por `registrarEvento`, e
-- `evidencias` era a unica tabela de conteudo sem coluna de autor. A
-- identidade do agente estava em maos na rota, vinda do token, e era
-- descartada.
--
-- O tamanho do buraco vem de onde a foto termina: ela entra no laudo e no
-- termo de interdicao, que sao pecas de processo administrativo. O produto
-- registra ate quem ABRIU um laudo (`registrarConsulta`), e nao registrava
-- quem acrescentou PROVA a ele. Era a escrita mais barata do sistema para
-- introduzir prova num dossie alheio sem deixar rastro.
--
-- A coluna aceita NULO, e isso nao e descuido: as linhas que ja estao no banco
-- foram gravadas antes de existir autor, e inventar um dono para elas seria
-- exatamente o tipo de mentira que esta migracao existe para impedir. Nulo
-- aqui significa "gravada antes de o sistema perguntar quem anexou", e o
-- documento nao imprime autor nenhum nesse caso.
--
-- -------------------------------------------------------------------
-- 2. A data de captura da foto era declarada pelo cliente, sem limite
-- -------------------------------------------------------------------
--
-- `capturada_em` chegava como `z.string().datetime()` e a coluna so tinha NOT
-- NULL. Reproduzido: foto com captura em 2019 aceita numa ocorrencia aberta
-- hoje, e o laudo imprimindo "Capturada em 05/01/2019" embaixo da imagem. Data
-- no futuro passava igual.
--
-- O campo irmao ja tinha defesa: a migracao 009 instalou
-- `coletada_em_plausivel` em `vistorias.coletada_em` exatamente por isto, com
-- folga de 12 horas para relogio trocado, que ela mesma diz ser rotina em
-- campo. Os dois campos saem impressos no MESMO documento, um como data do ato
-- e outro como data do registro fotografico, e so um deles era conferido.
--
-- A restricao aqui e a mesma daquela, deliberadamente: nao tenta adivinhar a
-- hora certa, so recusa o que nao pode ser verdade.
--
-- -------------------------------------------------------------------
-- 3. Qualquer agente registrava vistoria em qualquer ocorrencia do municipio
-- -------------------------------------------------------------------
--
-- Reproduzido: ocorrencia despachada para a Equipe Bravo, o agente da Equipe
-- Alfa NAO a enxerga em `GET /sincronizacao/pendencias`, e ainda assim
-- `POST /sincronizacao/vistoria` respondia 201, o status virava
-- `vistoria_concluida` (a tarefa sumia da fila da equipe que de fato foi ao
-- local) e a coordenacao emitia o termo de interdicao com o nome dele.
--
-- POR QUE ACEITAR E MARCAR, EM VEZ DE RECUSAR. Recusar com 4xx e o que parece
-- certo e e pior: `packages/campo/src/transporte.ts` transforma toda resposta
-- 4xx de `/sincronizacao/vistoria` em `FalhaPermanente`, e nao existe tela no
-- aplicativo para corrigir item bloqueado. Uma coleta legitima cairia nessa
-- recusa (o agente trocou de equipe entre a coleta e o envio, ou a coordenacao
-- redespachou a ocorrencia enquanto ele subia o morro) e morreria na fila do
-- aparelho, com a vistoria daquela familia dentro. Perder coleta de campo e
-- pior do que receber coleta que precisa de conferencia.
--
-- Entao a coleta entra, e o servidor grava as DUAS equipes: a que estava
-- designada e a do agente, no momento do recebimento. A divergencia deixa de
-- ser invisivel e passa a ser um fato gravado, que a trilha registra e o
-- documento imprime. As duas colunas guardam o fato bruto, e a divergencia e
-- DERIVADA delas em vez de virar um `boolean`: booleano gravado a parte
-- envelhece errado no dia em que alguem corrigir uma das pontas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem anexou a evidencia
-- ---------------------------------------------------------------------

ALTER TABLE evidencias
  ADD COLUMN IF NOT EXISTS anexada_por uuid;

/*
  A chave estrangeira e COMPOSTA, e a razao e a mesma das migracoes 008, 014,
  017 e 020: Row Level Security governa SELECT, INSERT, UPDATE e DELETE, e NAO
  governa a verificacao de chave estrangeira. O Postgres confere a existencia
  da linha referenciada com privilegio de sistema, por baixo da policy. Uma
  chave simples `anexada_por -> usuarios(id)` deixaria uma evidencia de Serra
  Alta constar anexada por um servidor de Vale Fundo, e o RLS nao veria nada de
  errado porque nunca chega a ser consultado. Num campo que responde "quem
  colocou esta foto no processo", isso e a assinatura de outra prefeitura.

  Sem ON DELETE: usuario nao se apaga neste produto, se desativa, justamente
  porque assina laudo e aparece na trilha.
*/
ALTER TABLE evidencias
  DROP CONSTRAINT IF EXISTS evidencias_anexada_por_do_mesmo_municipio,
  ADD CONSTRAINT evidencias_anexada_por_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, anexada_por)
    REFERENCES usuarios (organizacao_id, id);

COMMENT ON COLUMN evidencias.anexada_por IS
  'Quem pediu a autorizacao de envio, vindo do token verificado. NULO nas '
  'linhas gravadas antes desta coluna existir: e "nao registrado", nunca '
  '"ninguem".';

-- ---------------------------------------------------------------------
-- 2. Data de captura plausivel
-- ---------------------------------------------------------------------
--
-- Copia deliberada de `coletada_em_plausivel` (migracao 009), inclusive na
-- folga: 12 horas para frente cobrem fuso trocado e relogio adiantado, que sao
-- rotina em campo, e o piso de 2020 recusa a data que existe para sumir de
-- recorte por periodo da auditoria.
--
-- NOT VALID, e so por causa das linhas que JA estao no banco. Ao contrario da
-- migracao 009, que pos em NULL as chaves de assinatura fora do padrao, aqui
-- nao existe valor verdadeiro para colocar no lugar: a coluna e NOT NULL e
-- ninguem sabe quando aquela foto foi tirada. As alternativas eram inventar
-- uma data (mentira gravada) ou deixar a migracao derrubar o deploy da propria
-- correcao. NOT VALID nao afrouxa nada daqui para frente: o Postgres aplica a
-- restricao em todo INSERT e em todo UPDATE, e a rota recusa antes disso, com
-- 422 em vez de 500.
ALTER TABLE evidencias
  DROP CONSTRAINT IF EXISTS capturada_em_plausivel,
  ADD CONSTRAINT capturada_em_plausivel CHECK (
    capturada_em > timestamptz '2020-01-01'
    AND capturada_em < now() + interval '12 hours'
  ) NOT VALID;

COMMENT ON CONSTRAINT capturada_em_plausivel ON evidencias IS
  'A data que sai impressa embaixo da foto no laudo vem daqui. Grosseira de '
  'proposito, igual a coletada_em_plausivel da migracao 009: recusa o '
  'impossivel, nao julga a precisao.';

-- ---------------------------------------------------------------------
-- 3. As duas equipes da vistoria
-- ---------------------------------------------------------------------

ALTER TABLE vistorias
  ADD COLUMN IF NOT EXISTS equipe_designada_id uuid,
  ADD COLUMN IF NOT EXISTS equipe_do_agente_id uuid;

ALTER TABLE vistorias
  DROP CONSTRAINT IF EXISTS vistorias_equipe_designada_do_mesmo_municipio,
  ADD CONSTRAINT vistorias_equipe_designada_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, equipe_designada_id)
    REFERENCES equipes (organizacao_id, id);

ALTER TABLE vistorias
  DROP CONSTRAINT IF EXISTS vistorias_equipe_do_agente_do_mesmo_municipio,
  ADD CONSTRAINT vistorias_equipe_do_agente_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, equipe_do_agente_id)
    REFERENCES equipes (organizacao_id, id);

/*
  A pergunta que a coordenacao vai fazer: quais vistorias entraram por agente
  de fora da equipe designada. Parcial porque a resposta e uma fracao pequena
  da tabela, e porque so ha divergencia quando houve designacao: coleta em
  ocorrencia sem equipe designada nao viola designacao nenhuma.
*/
CREATE INDEX IF NOT EXISTS vistorias_fora_da_equipe_designada
  ON vistorias (organizacao_id, sincronizada_em)
  WHERE equipe_designada_id IS NOT NULL
    AND equipe_do_agente_id IS DISTINCT FROM equipe_designada_id;

COMMENT ON COLUMN vistorias.equipe_designada_id IS
  'A equipe a quem a ocorrencia estava despachada quando o servidor recebeu a '
  'coleta. Nula quando nao havia despacho, e ai nao ha designacao a violar.';
COMMENT ON COLUMN vistorias.equipe_do_agente_id IS
  'A equipe do agente no momento do recebimento. Diferente da designada, a '
  'coleta entra assim mesmo e o fato fica gravado: recusar mataria a coleta '
  'legitima de quem trocou de equipe entre a coleta e o envio.';
