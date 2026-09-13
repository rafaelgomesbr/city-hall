-- =====================================================================
-- 029: a minimizacao por prazo passa a alcancar a observacao que o agente
-- escreve ao devolver uma tarefa vencida.
--
-- O BURACO QUE ESTA MIGRACAO FECHA foi achado na integracao da migracao 028, e
-- ele anulava metade da minimizacao deste produto.
--
-- `devolucoes_de_tarefa.observacao` e texto livre, digitado pelo agente na
-- rua, e o produto nao tem como saber o que ela diz. Na pratica ela vai dizer
-- coisas como "moradora Dona Marta pediu para voltar as 18h" ou "casa com
-- idosa acamada": nome de pessoa e condicao de saude, exatamente os dois dados
-- que a migracao 021 existe para descartar quando vence o prazo que o
-- municipio fixou como controlador.
--
-- Sem isto, a varredura apagava o nome do solicitante em `ocorrencias` e
-- deixava a mesma pessoa nomeada numa linha de devolucao ao lado, para sempre.
-- O municipio cumpriria a propria politica so na tabela que alguem lembrou de
-- cobrir.
--
-- DUAS COISAS QUE ESTA MIGRACAO NAO FAZ, e as duas sao de proposito:
--
--   1. Nao toca no MOTIVO. Ele e de lista fechada, nao e frase sobre ninguem,
--      e apagar junto apagaria o ato administrativo de que uma equipe nao
--      conseguiu chegar naquele imovel.
--   2. Nao mexe na trilha. `trilha_eventos` e append-only, e por isso a rota
--      de devolucao nunca grava a observacao la: o texto livre vive so nesta
--      tabela, que e onde ele pode ser descartado no prazo. Se algum dia ele
--      voltar a entrar na trilha, esta migracao vira teatro.
-- =====================================================================

/*
  A coluna marcadora, pela mesma razao da 021: `NULL` nao distingue "nao tinha
  observacao" de "foi descartada no prazo", e o segundo precisa ser
  demonstravel numa auditoria.
*/
ALTER TABLE devolucoes_de_tarefa
  ADD COLUMN IF NOT EXISTS observacao_removida_em timestamptz;

COMMENT ON COLUMN devolucoes_de_tarefa.observacao_removida_em IS
  'Quando a observacao em texto livre foi descartada pela minimizacao por prazo. Nulo significa que ela nunca foi descartada, e nao que nunca existiu.';

/*
  O papel de aplicacao precisa poder ATUALIZAR estas duas colunas, e so elas.

  A funcao e SECURITY DEFINER e roda com os privilegios do dono, entao ela
  passaria sem isto. A concessao existe para o caso oposto, que e o que o
  portao CA-06 cobra: privilegio por COLUNA e a forma de deixar claro, no
  catalogo, que o produto nao pode reescrever motivo, prazo nem autoria de uma
  devolucao ja gravada. Mesma decisao da migracao 017 com `oficio_envios`.
*/
GRANT UPDATE (observacao, observacao_removida_em) ON devolucoes_de_tarefa TO dc360_app;

-- ---------------------------------------------------------------------
-- A funcao, reescrita inteira
-- ---------------------------------------------------------------------
--
-- `CREATE OR REPLACE` e nao um `ALTER`: uma funcao nao se emenda, e copiar o
-- corpo inteiro da 021 aqui e o que torna esta migracao legivel sozinha daqui
-- a um ano. O que mudou em relacao a ela esta marcado no comentario da CTE
-- `observacoes`.
--
CREATE OR REPLACE FUNCTION minimizar_por_prazo(p_teto integer)
RETURNS TABLE (
  municipio        uuid,
  ocorrencia       uuid,
  campos_removidos text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidatas AS (
    SELECT
      o.id                AS alvo,
      o.organizacao_id    AS org,
      o.encerrado_em      AS encerrada,
      (
        g.retencao_solicitante_dias IS NOT NULL
        AND o.solicitante_removido_em IS NULL
        AND o.encerrado_em < now() - make_interval(days => g.retencao_solicitante_dias)
      ) AS tira_solicitante,
      (
        o.vulnerabilidade_descricao IS NOT NULL
        AND (
          /*
            O prazo proprio da vulnerabilidade, quando existe, OU o do
            solicitante. O segundo ramo e o que garante "junto, nunca depois":
            municipio que configurou so o prazo do nome tem a descricao
            sensivel saindo na mesma passada, sem precisar lembrar de
            configurar a segunda coluna.
          */
          (g.retencao_vulnerabilidade_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_vulnerabilidade_dias))
          OR
          (g.retencao_solicitante_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_solicitante_dias))
        )
      ) AS tira_vulnerabilidade,
      /*
        A CONDICAO DA OBSERVACAO DA DEVOLUCAO (migracao 029).

        Mesma regra de TEMPO que a vulnerabilidade, e sem a precondicao de
        CONTEUDO dela. `tira_vulnerabilidade` comeca exigindo
        `o.vulnerabilidade_descricao IS NOT NULL`, porque aquela condicao
        governa AQUELA coluna. A observacao da devolucao e de outra tabela e
        existe independente disso: uma ocorrencia sem descricao de
        vulnerabilidade nenhuma pode ter uma observacao dizendo "moradora Dona
        Marta pediu para voltar as 18h".

        Reusar a condicao inteira era o caminho obvio e estava errado, e o
        sintoma seria silencioso: a observacao ficaria para sempre em todas as
        ocorrencias sem vulnerabilidade registrada, que sao a maioria.

        O prazo continua sendo o MAIS CURTO dos dois, herdando as mesmas
        garantias: a restricao do banco proibe prazo de vulnerabilidade maior
        que o do solicitante, e sem prazo de vulnerabilidade configurado vale o
        do solicitante como teto.
      */
      (
        /*
          A GUARDA DE "AINDA HA O QUE REMOVER", e ela nao e detalhe.

          Cada condicao desta lista tem a sua: `tira_solicitante` exige
          `solicitante_removido_em IS NULL`, `tira_vulnerabilidade` exige a
          coluna preenchida. Sem a guarda aqui, uma ocorrencia ja minimizada
          continuaria satisfazendo a condicao de TEMPO para sempre, voltaria a
          entrar em `devidas` a cada rodada, e a funcao gravaria um evento de
          minimizacao por passada, sobre uma ocorrencia da qual nada mais sai.
          A trilha e append-only: esses eventos nao seriam removiveis, e a
          varredura viraria uma fabrica de ruido permanente na prova do
          municipio. Alem disso o teto por rodada seria consumido por
          ocorrencias ja resolvidas, e as que faltam nunca chegariam a vez.
        */
        EXISTS (
          SELECT 1 FROM devolucoes_de_tarefa t
           WHERE t.ocorrencia_id = o.id
             AND t.observacao IS NOT NULL
             AND t.observacao_removida_em IS NULL
        )
        AND (
          (g.retencao_vulnerabilidade_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_vulnerabilidade_dias))
          OR
          (g.retencao_solicitante_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_solicitante_dias))
        )
      ) AS tira_observacao
    FROM ocorrencias o
    JOIN organizacoes g ON g.id = o.organizacao_id
    WHERE o.encerrado_em IS NOT NULL
      AND (g.retencao_solicitante_dias IS NOT NULL
           OR g.retencao_vulnerabilidade_dias IS NOT NULL)
  ),
  devidas AS (
    SELECT * FROM candidatas
     WHERE tira_solicitante OR tira_vulnerabilidade OR tira_observacao
     -- A mais antiga primeiro: o dado que passou mais tempo alem do prazo e o
     -- que esta ha mais tempo em desacordo com a decisao do municipio.
     ORDER BY encerrada
     /*
        Teto por rodada, pelo mesmo motivo da varredura de prazo: um banco com
        anos de historico e um municipio que acabou de configurar o prazo pela
        primeira vez produziriam uma unica transacao gigante, segurando trava
        em milhares de linhas de `ocorrencias`, que e a tabela mais consultada
        do produto. Com teto, a mesma limpeza acontece em varias rodadas e
        ninguem na frente da tela percebe.
     */
     LIMIT p_teto
  ),
  removidas AS (
    UPDATE ocorrencias o
       SET solicitante_nome = CASE WHEN d.tira_solicitante
                                   THEN 'removido por prazo'
                                   ELSE o.solicitante_nome END,
           solicitante_contato = CASE WHEN d.tira_solicitante
                                      THEN NULL
                                      ELSE o.solicitante_contato END,
           solicitante_removido_em = CASE WHEN d.tira_solicitante
                                          THEN now()
                                          ELSE o.solicitante_removido_em END,
           vulnerabilidade_descricao = CASE WHEN d.tira_vulnerabilidade
                                            THEN NULL
                                            ELSE o.vulnerabilidade_descricao END,
           vulnerabilidade_removida_em = CASE WHEN d.tira_vulnerabilidade
                                              THEN now()
                                              ELSE o.vulnerabilidade_removida_em END
      FROM devidas d
     WHERE o.id = d.alvo
    RETURNING
      o.id             AS oc,
      o.organizacao_id AS org,
      array_remove(ARRAY[
        CASE WHEN d.tira_solicitante     THEN 'solicitante_nome'          END,
        CASE WHEN d.tira_solicitante     THEN 'solicitante_contato'       END,
        CASE WHEN d.tira_vulnerabilidade THEN 'vulnerabilidade_descricao' END
      ]::text[], NULL) AS campos
  ),
  /*
    A OBSERVACAO DA DEVOLUCAO DE TAREFA (migracao 028).

    Ela e texto livre digitado pelo agente na rua, e o produto nao tem como
    saber o que ela diz. Na pratica ela diz "moradora Dona Marta pediu para
    voltar as 18h" ou "casa com idosa acamada": nome de pessoa e condicao de
    saude, que sao os dois dados que esta funcao existe para descartar.

    Sem esta passada, o municipio apagaria o nome do solicitante em
    `ocorrencias` e continuaria guardando a mesma pessoa nomeada numa linha de
    devolucao ao lado, sem prazo nenhum. A politica do controlador valeria pela
    metade, e a metade que sobra e a que ninguem olha.

    AMARRADA EM `tira_vulnerabilidade`, e nao em `tira_solicitante`. Como o
    texto pode descrever condicao de saude, ele sai no prazo MAIS CURTO dos
    dois. A condicao acima ja garante as duas coisas que isso exige: a
    restricao do banco proibe prazo de vulnerabilidade maior que o do
    solicitante, e sem prazo de vulnerabilidade configurado vale o do
    solicitante como teto. Herdar a condicao herda as duas garantias sem
    repetir a regra num segundo lugar, onde ela envelheceria sozinha.

    MARCADOR E NAO NULO, por dois motivos que coincidem. O primeiro e o mesmo
    do nome do solicitante: `NULL` nao distingue "nao tinha observacao" de "a
    observacao foi descartada no prazo", e o segundo precisa ser demonstravel
    numa auditoria. O segundo vem do banco: a restricao
    `motivo_outro_exige_observacao` da migracao 028 recusa observacao vazia
    quando o motivo e "outro", entao anular quebraria a linha.

    O MOTIVO FICA. Ele e de lista fechada, nao e frase sobre ninguem, e apagar
    junto apagaria o ato administrativo: a coordenacao precisa continuar
    sabendo que uma equipe nao conseguiu chegar naquele imovel. Mesma decisao
    que esta funcao ja tomou com o endereco.

    O `LEFT JOIN` la embaixo existe porque a maioria das ocorrencias nao tem
    devolucao nenhuma, e um `JOIN` comum faria essas linhas sumirem do
    resultado e do evento de trilha: a minimizacao do nome do solicitante
    deixaria de ser registrada por causa de uma tabela que nao tem nada a ver
    com ela.
  */
  observacoes AS (
    UPDATE devolucoes_de_tarefa t
       SET observacao = 'removido por prazo',
           observacao_removida_em = now()
      FROM devidas v
     WHERE t.ocorrencia_id = v.alvo
       AND t.observacao IS NOT NULL
       AND t.observacao_removida_em IS NULL
       AND v.tira_observacao
    RETURNING t.ocorrencia_id AS oc
  ),

  /*
    Uma ocorrencia pode ter mais de uma devolucao (equipes diferentes tentaram
    e nenhuma conseguiu), e sem o DISTINCT a juncao abaixo multiplicaria a
    linha de resultado e o evento de trilha pelo numero de devolucoes.
  */
  com_observacao AS (
    SELECT DISTINCT oc FROM observacoes
  ),

  /*
    O registro na trilha, na mesma instrucao.

    Uma instrucao que altera dados dentro de `WITH` roda sempre e ate o fim,
    referenciada ou nao pela consulta principal: e isso que torna seguro o
    resultado sair de `removidas` e nao daqui.

    POR QUE `administrador` NO PAPEL DO AUTOR, e nao um papel novo de sistema.
    `autor_papel` so conhece os quatro papeis do produto, e a tela de auditoria
    traduz a coluna por esses quatro: um quinto valor sairia sem traducao
    justamente na tela que existe para PROVAR o que aconteceu. E a atribuicao
    nao e falsa: quem manda remover e a decisao de prazo do municipio, e essa
    decisao so o administrador consegue tomar (rota de retencao, permissao
    `gerenciar_organizacao`). `autor_id` fica NULO porque nao houve sessao de
    ninguem, e `autor_nome` diz por extenso que a execucao foi automatica, para
    quem le a trilha nao procurar uma pessoa que nao existe.

    O `detalhe` diz QUAIS campos sairam, e nunca o que eles continham. Registrar
    o valor antigo transformaria a trilha, que e append-only e permanente, no
    ultimo lugar do banco onde o dado descartado continuaria vivo.
  */
  registro AS (
    INSERT INTO trilha_eventos
      (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
       origem, ocorrido_em, detalhe)
    SELECT r.org, r.oc, 'minimizacao_por_prazo', NULL,
           'Minimizacao por prazo (execucao automatica)', 'administrador',
           'escritorio', now(),
           jsonb_build_object('campos', to_jsonb(
             r.campos || CASE WHEN c.oc IS NOT NULL
                              THEN ARRAY['devolucao_observacao']::text[]
                              ELSE ARRAY[]::text[] END))
      FROM removidas r
      LEFT JOIN com_observacao c ON c.oc = r.oc
    RETURNING 1
  )
  SELECT r.org, r.oc,
         r.campos || CASE WHEN c.oc IS NOT NULL
                          THEN ARRAY['devolucao_observacao']::text[]
                          ELSE ARRAY[]::text[] END
    FROM removidas r
    LEFT JOIN com_observacao c ON c.oc = r.oc;
END;
$$;

-- A funcao e a unica porta, entao PUBLIC nao a executa. Mesma regra das
-- migracoes 002 e 016.
