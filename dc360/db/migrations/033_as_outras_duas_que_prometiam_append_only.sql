-- =====================================================================
-- 033: as outras duas tabelas que prometiam append-only por extenso e
--      entregavam uma barreira so.
--
-- A 032 consertou `vistoria_evidencias_perdidas` e `saidas_a_campo`. A mesma
-- revisao deixou anotado que o defeito e mais velho que elas: a 020 e a 028
-- foram escritas do mesmo jeito, com `CREATE POLICY` sem clausula `FOR`, que
-- vale `FOR ALL`, e as duas prometem SELECT e INSERT no comentario logo abaixo
-- da policy.
--
--   020: "SELECT e INSERT, e mais nada, pelo mesmo motivo da trilha. Isto e
--         coleta de campo: o que o agente respondeu no local, naquele minuto,
--         embaixo da assinatura do morador."
--   028: "SELECT e INSERT, e mais nada. Ver o cabecalho: isto e declaracao de
--         campo, e correcao se faz com despacho novo, nao reescrevendo o que o
--         agente disse."
--
-- As duas frases eram falsas pelo mesmo motivo, e nenhuma das duas tabelas e
-- pequena: `vistoria_orgaos_indicados` guarda o que o laudo imprime como
-- "acionar a Secretaria de Obras", e `devolucoes_de_tarefa` guarda a recusa
-- institucional de subir o morro, com motivo escrito e o nome de quem assinou.
-- E ela a linha que responde "por que ninguem foi la" numa auditoria.
--
-- O CENARIO CONCRETO, e ele nao e hipotetico: uma migracao futura escreve
-- `GRANT DELETE`, ou o mais banal de todos, `GRANT ALL ON ALL TABLES IN SCHEMA
-- public TO dc360_app` num script de conveniencia. Com policy `ALL` as linhas
-- passam a ser apagaveis, justamente por quem teria interesse em apaga-las.
--
-- Migracao nova e nao edicao das duas, pela regra do proprio aplicador
-- (`HistoricoAlterado` em `db/src/migrar.ts`): migracao ja commitada nao se
-- reescreve. E a 020 ja esta aplicada em producao, o que torna a edicao
-- impossivel de qualquer forma.
--
-- NADA MUDA para a aplicacao: a concessao ja era `SELECT, INSERT` nas duas, e
-- as policies novas dizem exatamente a mesma coisa que a antiga dizia para
-- esses dois comandos. O que muda e o que acontece no dia em que a concessao
-- mudar por engano.
-- =====================================================================

DROP POLICY vistoria_orgaos_indicados_isolamento ON vistoria_orgaos_indicados;

CREATE POLICY vistoria_orgaos_indicados_leitura ON vistoria_orgaos_indicados
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY vistoria_orgaos_indicados_insercao ON vistoria_orgaos_indicados
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

DROP POLICY devolucoes_de_tarefa_isolamento ON devolucoes_de_tarefa;

CREATE POLICY devolucoes_de_tarefa_leitura ON devolucoes_de_tarefa
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY devolucoes_de_tarefa_insercao ON devolucoes_de_tarefa
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A DEPENDENCIA NAO ESCRITA QUE A MESMA REVISAO ACHOU, registrada aqui porque
  nao da para escreve-la nas migracoes que ja foram commitadas.

  A parte 3 da 030 roda um `UPDATE` que arredonda coordenadas antes de criar o
  CHECK de seis casas, e ele roda contra tabela com `FORCE ROW LEVEL SECURITY`
  e sem contexto de municipio. Com dono NAO superusuario, esse `UPDATE` alcanca
  zero linha e a migracao morre dizendo que o CHECK foi violado por alguma
  linha, que e a mensagem que manda procurar no lugar errado.

  Em producao isso nao acontece porque `docs/COLOCAR-DE-PE.md` manda migrar com
  papel de setup com `BYPASSRLS`. Em PGlite tambem nao, porque la quem roda e
  superusuario. Ou seja: o caminho que falha e justamente o que nenhum dos dois
  exercita. A 009 tem a mesma forma, e quem escrever a proxima migracao com
  `UPDATE` em massa precisa saber disso antes, e nao depois.
*/
