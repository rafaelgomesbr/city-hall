-- =====================================================================
-- 026: o relogio descobre PARA QUEM chamar o resumo da migracao 023.
--
-- O DEFEITO QUE ESTA MIGRACAO FECHA e o mais barato de cometer e o mais caro
-- de descobrir: a migracao 023 criou `resumir_municipio()`, a tabela de
-- metricas, a visao do console e o papel de leitura, e NINGUEM chamava a
-- funcao. Com isso a tabela ficava vazia para sempre, a visao respondia
-- `sem_escrita_recente` para todo mundo, e o console inteiro seria uma tela
-- bonita afirmando que nenhum municipio usa o produto. Nada disso quebraria
-- teste nenhum, porque nada estava errado: estava apenas desligado.
--
-- =====================================================================
-- POR QUE PRECISA DE UMA FUNCAO PRIVILEGIADA, E POR QUE ELA E TAO ESTREITA.
--
-- `resumir_municipio()` e SECURITY INVOKER de proposito (ver 023): ela conta
-- debaixo do RLS de quem chama, entao quem a chama precisa JA ESTAR no
-- contexto de um municipio. Ou seja, para escrever o resumo de sete
-- prefeituras o relogio precisa abrir sete transacoes, uma por municipio.
--
-- E ai aparece o problema: o relogio roda sem ninguem logado. Nao existe
-- token, nao existe municipio no contexto, e o papel de aplicacao sem contexto
-- nao enxerga uma linha sequer de `organizacoes` (a policy da 001 e
-- `id = app_organizacao_atual()`, que sem contexto e nula). O relogio nao teria
-- nem como descobrir QUAIS municipios existem.
--
-- E exatamente a situacao de `minimizar_por_prazo` (021) e de `varrer_prazos`
-- (016), e a saida e a mesma: uma funcao privilegiada, estreita, que responde
-- UMA pergunta. A alternativa seria a aplicacao carregar a lista por fora do
-- RLS, que e a mesma porta com o cadeado do lado de dentro.
--
-- O TAMANHO DA PORTA, e e por isso que ela e menor que as outras duas:
--
--   1. A saida e `setof uuid`, e mais nada. Nem nome de coordenadoria, nem
--      municipio, nem UF. Quem a executa recebe identificadores e nao aprende
--      de que prefeitura eles sao: para isso teria que ler `organizacoes`, e
--      ler `organizacoes` continua exigindo contexto.
--   2. Ela NAO aceita municipio de parametro. O unico parametro e um intervalo
--      de frescor, que nao consegue apontar para prefeitura nenhuma. Uma
--      funcao privilegiada que aceita "de qual municipio" e uma funcao que
--      alguem vai chamar com o municipio do vizinho.
--   3. Ela nao alcanca tabela de negocio nenhuma: le `organizacoes` e a tabela
--      de metricas, que e a mesma dupla que a ADR 0008 ja permite ao console.
--
-- E o que ela NAO faz, que e o ponto inteiro: ela nao escreve o resumo. Quem
-- escreve continua sendo o proprio municipio, com o papel de aplicacao,
-- debaixo do RLS, chamando `resumir_municipio()` dentro do contexto dele. Esta
-- funcao so diz a quem bater na porta.
-- =====================================================================

/*
  STABLE e nao VOLATILE: ela so le. Marcar volatil impediria o planejador de
  reaproveitar o resultado dentro da mesma consulta e, pior, esconderia de quem
  ler o catalogo que esta e uma funcao de leitura.

  `p_frescor` sem valor padrao, de proposito. Padrao aqui seria uma decisao de
  operacao escondida no esquema: quem chama tem que dizer, em codigo revisavel,
  de quanto em quanto tempo o resumo dele envelhece. O relogio da API passa o
  intervalo dele, e o teste passa o dele.
*/
CREATE OR REPLACE FUNCTION municipios_a_resumir(p_frescor interval)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT o.id
    FROM organizacoes o
    LEFT JOIN metricas_municipio m
           ON m.organizacao_id = o.id
          AND m.dia = current_date
   WHERE m.atualizado_em IS NULL
      OR m.atualizado_em < now() - p_frescor
   ORDER BY o.id
$$;

COMMENT ON FUNCTION municipios_a_resumir(interval) IS
  'Diz ao relogio quais municipios estao sem resumo fresco de hoje. Devolve so '
  'identificador: quem escreve o resumo continua sendo o proprio municipio, '
  'com o papel de aplicacao e debaixo do RLS (ADR 0008).';

/*
  O padrao do Postgres para funcao e EXECUTE para PUBLIC, e PUBLIC alcanca
  tambem o papel do console. Sem este REVOKE, uma funcao privilegiada que le
  `organizacoes` ficaria executavel por um papel que a ADR 0008 manda nao ter
  privilegio em lugar nenhum alem das tres relacoes nomeadas. O portao de
  `db/test/isolamento.test.ts` reprova essa combinacao, e ela nao deveria
  precisar do portao para nao acontecer.
*/
REVOKE ALL ON FUNCTION municipios_a_resumir(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION municipios_a_resumir(interval) TO dc360_app;
