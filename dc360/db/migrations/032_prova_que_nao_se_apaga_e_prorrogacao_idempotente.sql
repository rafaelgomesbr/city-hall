-- =====================================================================
-- 032: a ausencia de policy que as migracoes 030 e 031 prometeram e nao
--      escreveram, e a chave de prorrogacao que a rota pedia e jogava fora.
--
-- Duas correcoes de revisao adversarial. Elas entram numa migracao NOVA, e nao
-- como edicao da 030 e da 031, pela regra que o proprio aplicador impoe
-- (`HistoricoAlterado` em `db/src/migrar.ts`): migracao ja commitada nao se
-- reescreve, senao o banco de quem ja rodou diverge do de producao em silencio.
--
-- ---------------------------------------------------------------------
-- PARTE 1: APPEND-ONLY E A AUSENCIA DE POLICY, E NAO A AUSENCIA DE GRANT
-- ---------------------------------------------------------------------
--
-- `CREATE POLICY` sem clausula `FOR` vale `FOR ALL`. Escrita assim, a policy
-- autoriza SELECT, INSERT, UPDATE **e DELETE**, e a unica coisa que impede o
-- apagamento passa a ser a concessao. E UMA barreira, nao duas.
--
-- As duas migracoes anteriores prometeram, por escrito, a barreira dupla:
--
--   030: "SELECT e INSERT, e mais nada, pelo mesmo motivo da trilha e dos
--         orgaos indicados. Uma declaracao de prova ausente num documento
--         oficial nao se apaga"
--   031: "SEM DELETE, em lugar nenhum. Nao ha policy e nao ha concessao: as
--         duas ausencias negam."
--
-- As duas frases eram falsas, e promessa de portao e mais perigosa que portao
-- nenhum, porque quem le para de conferir. `trilha_eventos`, `avisos_lidos` e
-- `oficio_aberturas` fazem o certo desde sempre: declaram a policy comando a
-- comando, e o comando sem policy e negado pelo Postgres para todo mundo,
-- inclusive para quem ganhar `GRANT DELETE` amanha.
--
-- O CENARIO CONCRETO, e ele e banal: uma migracao futura escreve `GRANT DELETE`
-- por engano, ou o mais comum de todos, um `GRANT ALL ON ALL TABLES IN SCHEMA
-- public TO dc360_app` num script de conveniencia. Na trilha isso nao muda
-- nada. Em `saidas_a_campo` passaria a apagar a unica linha que o produto
-- guarda sobre a seguranca de um servidor (a saida vencida de quem nao desceu
-- do morro, apagavel justamente por quem teria interesse em apaga-la), e em
-- `vistoria_evidencias_perdidas` passaria a apagar a declaracao de prova
-- ausente de um laudo, devolvendo ao documento a aparencia de completo.
--
-- O par de policies abaixo e o mesmo isolamento de antes, so que recortado por
-- comando. Nada do que a aplicacao faz hoje muda: ela le e insere nas duas
-- tabelas, e atualiza as seis colunas de `saidas_a_campo` que a 031 concedeu.
--
-- ---------------------------------------------------------------------
-- PARTE 2: A CHAVE DE PRORROGACAO, QUE VINHA E ERA DESCARTADA
-- ---------------------------------------------------------------------
--
-- `prorrogacaoDeSaidaSchema` EXIGE `idempotencyKey` desde o primeiro dia, e a
-- rota nunca a leu. Contrato que pede chave de idempotencia promete
-- deduplicacao, e o aparelho manda a chave porque acredita na promessa.
--
-- Prorrogar e o unico ato deste recurso praticado do alto do morro, com o pior
-- sinal do dia: o pedido vai, o servidor grava, a resposta se perde, o aparelho
-- repete. E a MESMA corrida que a declaracao da saida trata com `ON CONFLICT`,
-- na rota ao lado. Repetida, ela produzia duas coisas que nao se desfazem:
--
--   1. `prorrogacoes` contado em dobro. A 031 diz por escrito que este numero
--      precisa ser contado "senao prorrogar vira um jeito silencioso de manter
--      uma saida aberta para sempre". Contado errado, o agente que empurrou o
--      prazo uma vez aparece para a coordenacao como quem empurrou duas, e a
--      leitura de "ele esta demorando muito mais do que disse" sai errada justo
--      na tela que decide se alguem vai atras dele.
--   2. Dois eventos `saida_a_campo_prorrogada` na trilha para um ato so. A
--      trilha e append-only: esse segundo evento nao sai mais.
--
-- A COLUNA GUARDA A ULTIMA CHAVE, e nao um livro de chaves, e o limite esta
-- dito aqui em vez de escondido: ela dedupe o REENVIO, que e o unico caso real
-- (a repeticao chega em seguida, porque a resposta se perdeu). Uma chave
-- reutilizada depois de outra prorrogacao ter entrado no meio nao e deduplicada,
-- e nao precisa ser: o aparelho sorteia uma chave por pedido. Um livro de
-- chaves seria uma tabela a mais para cobrir um caso que nao existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 1
-- ---------------------------------------------------------------------
DROP POLICY vistoria_evidencias_perdidas_isolamento ON vistoria_evidencias_perdidas;

CREATE POLICY vistoria_evidencias_perdidas_leitura ON vistoria_evidencias_perdidas
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY vistoria_evidencias_perdidas_insercao ON vistoria_evidencias_perdidas
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

-- Sem policy de UPDATE e sem policy de DELETE: com RLS forcada, a ausencia
-- nega, e nega ate para quem tiver a concessao. Correcao de coleta e vistoria
-- nova, como em todo o resto deste produto.

DROP POLICY saidas_a_campo_isolamento ON saidas_a_campo;

CREATE POLICY saidas_a_campo_leitura ON saidas_a_campo
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY saidas_a_campo_insercao ON saidas_a_campo
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  O UPDATE continua existindo, porque a prorrogacao e o encerramento precisam
  dele. O que ele NAO alcanca continua sendo definido por privilegio de coluna
  (a 031 concede seis, mais a desta migracao): quem saiu, para onde, quando, se
  estava sozinho, a duracao declarada e o prazo inicial nao mudam nunca.

  `USING` e `WITH CHECK` com a mesma condicao: a linha precisa ser do municipio
  do contexto antes e depois da escrita, senao um UPDATE poderia empurrar a
  linha para fora da propria parede.
*/
CREATE POLICY saidas_a_campo_atualizacao ON saidas_a_campo
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- Sem policy de DELETE, e agora e verdade: ver o cabecalho.

-- ---------------------------------------------------------------------
-- Parte 2
-- ---------------------------------------------------------------------
ALTER TABLE saidas_a_campo ADD COLUMN prorrogacao_key uuid;

COMMENT ON COLUMN saidas_a_campo.prorrogacao_key IS
  'A chave da ultima prorrogacao aceita. Existe para o reenvio do mesmo pedido '
  '(resposta perdida no sinal ruim do morro) nao contar duas vezes nem escrever '
  'dois eventos numa trilha que nao se corrige.';

GRANT UPDATE (prorrogacao_key) ON saidas_a_campo TO dc360_app;
