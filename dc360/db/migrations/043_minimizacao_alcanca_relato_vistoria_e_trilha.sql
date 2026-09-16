-- =====================================================================
-- 043: a minimizacao por prazo passa a alcancar o relato do solicitante, a
--      observacao do agente na vistoria, e o nome do assinante que a trilha
--      guardava dentro do evento `vistoria`.
--
-- O ACHADO, provado por sondagem contra a API real (15/09/2026): com prazo de
-- um dia e `minimizar_por_prazo(100)`, `solicitante_nome` virava "removido
-- por prazo" e a MESMA pessoa continuava nomeada em tres lugares:
--
--   `ocorrencias.descricao`       "Dona Marilda ligou dizendo que o talude..."
--   `vistorias.observacoes`       "moradora Marilda presente; filho Carlos
--                                  acamado"
--   `trilha_eventos.detalhe`      {"assinante": "Marilda Souza Prado"} no
--                                  evento `vistoria`, gravado pela rota de
--                                  sincronizacao
--
-- O laudo reimpresso depois do prazo trazia nome e condicao de saude da
-- familia. A 021 escreveu que o relato FICA ("o relato do que aconteceu" na
-- lista do que permanece), e a 029 escreveu que texto livre nunca entra na
-- trilha ("se algum dia ele voltar a entrar na trilha, esta migracao vira
-- teatro"). A primeira decisao estava errada e a segunda foi descumprida pela
-- rota. Esta migracao corrige as duas no banco; a rota deixa de gravar o nome
-- na mesma data, por outra frente.
--
-- =====================================================================
-- A DECISAO, campo a campo
--
-- `ocorrencias.descricao` SAI. A 021 chamou o relato de "registro do que
-- aconteceu" e o manteve. Mas o relato e texto livre ditado por telefone, e
-- na pratica ele diz quem ligou, quem mora na casa e o que essa pessoa tem:
-- e a mesma especie de texto que a 029 ja manda descartar na devolucao de
-- tarefa. O que o ato administrativo precisa guardar do relato ja esta em
-- colunas proprias: tipo (COBRADE), severidade, endereco, coordenada,
-- vulnerabilidade presente (a marca, nao a descricao), e a decisao tecnica da
-- vistoria. O relato em si e o dado da pessoa, e sai no mesmo prazo do resto.
--
-- `vistorias.observacoes` SAI, pela mesma razao: texto livre digitado pelo
-- agente na rua, e o produto nao tem como saber o que ele diz. O checklist,
-- as contagens, os orgaos indicados e a coordenada sao o registro do ato e
-- ficam.
--
-- `vistorias.assinante_nome` FICA. E o nome de quem deu ciencia do ato de
-- interdicao. A ciencia e parte do ato, o ato e permanente, e
-- `docs/PRIVACIDADE.md` declara essa excecao com todas as letras. Um termo de
-- interdicao sem o nome de quem foi cientificado e um ato sem ciencia
-- comprovada, e isso anula o proprio ato.
--
-- OS DOIS PRIMEIROS SAEM NO PRAZO MAIS CURTO dos dois configurados, como a
-- observacao da devolucao (029): o texto pode descrever condicao de saude, e
-- portanto segue o prazo da vulnerabilidade quando ele existe, e o do
-- solicitante como teto quando nao existe. As duas garantias sao herdadas da
-- 021: a restricao do banco proibe prazo de vulnerabilidade maior que o do
-- solicitante, e sem prazo de vulnerabilidade vale o do solicitante.
--
-- MARCADOR E NAO NULO, pelo argumento da 021: `NULL` nao distingue "nunca
-- teve" de "foi descartado no prazo", e o segundo precisa ser demonstravel.
-- `descricao` e `NOT NULL` de todo modo. Cada coluna ganha a data do
-- descarte, e uma restricao amarra o marcador a data, como
-- `marcador_de_remocao_e_coerente`.
--
-- =====================================================================
-- A TRILHA, e por que esta migracao a reescreve, uma unica vez e por um
-- unico caminho
--
-- A rota de sincronizacao gravou, em todo evento `vistoria` ate 15/09/2026,
-- `detalhe->>'assinante'` com o nome de quem assinou a ciencia. A trilha e
-- append-only (001), e por isso o nome gravado ali ficaria para sempre, lido
-- pela tela de auditoria de todo servidor do municipio, mesmo depois de a
-- ocorrencia ter sido minimizada.
--
-- Havia duas saidas, e as duas foram pesadas:
--
--   (a) a politica declarar que nomes ja gravados na trilha antes de
--       15/09/2026 permanecem. E honesto, e e o que se faria com um documento
--       oficial emitido. Mas a trilha nao e documento emitido: e registro
--       interno, ninguem de fora tem copia dela, e o nome ali e uma SEGUNDA
--       copia do que `vistorias.assinante_nome` ja guarda pela excecao
--       declarada. Copia sem finalidade propria e exatamente o que a
--       minimizacao existe para impedir.
--
--   (b) redigir. Trocar o valor de `detalhe->>'assinante'` pelo marcador nos
--       eventos `vistoria` das ocorrencias que a varredura minimiza, na mesma
--       transacao, e registrar no evento de minimizacao quantos eventos foram
--       redigidos. E o que esta migracao faz.
--
-- Redigir nao e reescrever historico. O evento continua existindo, com autor,
-- data, origem, fotos e precisao do GPS intactos; a unica coisa que muda e um
-- valor que nunca deveria ter entrado ali, e a propria trilha diz que mudou,
-- quando, e por que (o evento `minimizacao_por_prazo` da mesma ocorrencia).
-- Quem precisa saber quem assinou a ciencia continua lendo
-- `vistorias.assinante_nome`, que e onde esse dado tem finalidade.
--
-- O UNICO CAMINHO que reescreve a trilha e esta funcao, como dono das tabelas.
-- Nao nasce policy de UPDATE em `trilha_eventos` para papel nenhum: para a
-- aplicacao ela continua append-only, e o portao de `isolamento.test.ts`
-- continua cobrando isso. A funcao e a mesma que ja tinha a unica outra
-- escrita "de sistema" no banco, e ganha as duas guardas das 038 e 039:
--
--   1. `SET row_security = off`. Com um dono sem BYPASSRLS, uma escrita que
--      SERIA filtrada por policy (e a trilha nao tem policy de UPDATE para
--      ninguem) vira erro em vez de zero em silencio. Sem esta guarda, e o
--      teste provou antes de escrever esta migracao, a varredura inteira
--      devolvia sucesso com todas as linhas no lugar num dono sem BYPASSRLS:
--      a minimizacao da 021 ja dependia disso sem dizer.
--   2. Conferencia de contagem: a instrucao conta quantos eventos DEVERIAM
--      ser redigidos e quantos FORAM, por ocorrencia, e estoura se diferem.
--      Um UPDATE que alcanca menos linhas do que devia e sinal de gatilho ou
--      regra barrando o dono, e o evento de minimizacao nao pode afirmar
--      "redigido" com o nome ainda la.
--
-- CONSEQUENCIA PARA O QUE JA FOI MINIMIZADO: uma ocorrencia que a 021 ou a
-- 029 ja minimizaram volta a entrar na varredura UMA vez, para o relato, a
-- observacao da vistoria e a trilha sairem, e ganha um segundo evento de
-- minimizacao dizendo o que saiu desta vez. Isso e o comportamento certo:
-- dois eventos, cada um dizendo a verdade da sua data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As colunas marcadoras e as restricoes que amarram marcador a data
-- ---------------------------------------------------------------------

ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS descricao_removida_em timestamptz;

ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS marcador_de_relato_e_coerente,
  ADD CONSTRAINT marcador_de_relato_e_coerente CHECK (
    descricao_removida_em IS NULL OR descricao = 'removido por prazo'
  );

COMMENT ON COLUMN ocorrencias.descricao_removida_em IS
  'Quando o relato do solicitante virou o marcador de removido por prazo. Nulo '
  'significa que o relato na linha e o relato de verdade.';

ALTER TABLE vistorias
  ADD COLUMN IF NOT EXISTS observacoes_removidas_em timestamptz;

ALTER TABLE vistorias
  DROP CONSTRAINT IF EXISTS marcador_de_observacoes_e_coerente,
  ADD CONSTRAINT marcador_de_observacoes_e_coerente CHECK (
    observacoes_removidas_em IS NULL OR observacoes = 'removido por prazo'
  );

COMMENT ON COLUMN vistorias.observacoes_removidas_em IS
  'Quando a observacao em texto livre do agente virou o marcador de removido '
  'por prazo. Nulo significa que ela nunca foi descartada, e nao que nunca '
  'existiu.';

COMMENT ON COLUMN vistorias.assinante_nome IS
  'Quem deu ciencia do ato no local. FICA depois da minimizacao por prazo, de '
  'proposito: a ciencia e parte do ato de interdicao, e o ato e permanente. '
  'Excecao declarada em docs/PRIVACIDADE.md.';

/*
  Nenhum GRANT novo: o papel de aplicacao ja tem UPDATE na tabela inteira de
  `ocorrencias` e de `vistorias` (001), e a funcao roda como dono. Em
  `trilha_eventos` continua SELECT e INSERT, e mais nada.
*/

-- ---------------------------------------------------------------------
-- 2. A funcao, reescrita inteira
-- ---------------------------------------------------------------------
--
-- `CREATE OR REPLACE`, pela razao da 029: uma funcao nao se emenda, e o corpo
-- inteiro aqui e o que torna esta migracao legivel sozinha. O que mudou em
-- relacao a 029 esta marcado nos comentarios das CTEs `prazos`,
-- `observacoes_de_vistoria`, `a_redigir` e `redigidos`, e no laco que
-- devolve o resultado.
--
-- A FORMA MUDOU DE `RETURN QUERY` PARA UM LACO, e o motivo e a guarda 2 do
-- cabecalho: a conferencia de contagem precisa ler o que a instrucao devolveu
-- (quantos eventos deviam ser redigidos, quantos foram) antes de a funcao
-- terminar, e `RETURN QUERY` nao da acesso a isso. Continua sendo UMA
-- instrucao que remove, redige e registra na trilha, na mesma transacao: o
-- argumento da 021 ("ou as duas acontecem, ou nenhuma") esta intacto.
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
SET row_security = off
AS $$
DECLARE
  v_linha record;
BEGIN
  BEGIN
    FOR v_linha IN
    WITH prazos AS (
      /*
        OS DOIS RELOGIOS, calculados uma vez por ocorrencia encerrada.

        `venceu_nome` e o prazo do solicitante: governa o que identifica a
        pessoa que ligou (nome, contato) e o nome que a trilha guardava.

        `venceu_texto` e o MAIS CURTO dos dois: o proprio prazo da
        vulnerabilidade quando existe, OU o do solicitante. Governa tudo que e
        texto livre e pode descrever saude: a descricao de vulnerabilidade, o
        relato, a observacao da vistoria e a observacao da devolucao. O
        segundo ramo e o que garante "junto, nunca depois" para o municipio
        que configurou so o prazo do nome (021).
      */
      SELECT
        o.id                          AS alvo,
        o.organizacao_id              AS org,
        o.encerrado_em                AS encerrada,
        o.solicitante_removido_em,
        o.vulnerabilidade_descricao,
        o.descricao_removida_em,
        (
          g.retencao_solicitante_dias IS NOT NULL
          AND o.encerrado_em < now() - make_interval(days => g.retencao_solicitante_dias)
        ) AS venceu_nome,
        (
          (g.retencao_vulnerabilidade_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_vulnerabilidade_dias))
          OR
          (g.retencao_solicitante_dias IS NOT NULL
           AND o.encerrado_em < now() - make_interval(days => g.retencao_solicitante_dias))
        ) AS venceu_texto
      FROM ocorrencias o
      JOIN organizacoes g ON g.id = o.organizacao_id
      WHERE o.encerrado_em IS NOT NULL
        AND (g.retencao_solicitante_dias IS NOT NULL
             OR g.retencao_vulnerabilidade_dias IS NOT NULL)
    ),
    candidatas AS (
      /*
        CADA CONDICAO TEM A SUA GUARDA DE "AINDA HA O QUE REMOVER", e ela nao
        e detalhe (029): sem a guarda, uma ocorrencia ja minimizada voltaria a
        entrar em `devidas` a cada rodada e ganharia um evento de minimizacao
        por passada, numa trilha que nao se apaga.
      */
      SELECT
        p.alvo, p.org, p.encerrada,
        (p.venceu_nome  AND p.solicitante_removido_em IS NULL)      AS tira_solicitante,
        (p.venceu_texto AND p.vulnerabilidade_descricao IS NOT NULL) AS tira_vulnerabilidade,
        -- O RELATO (043). A guarda e a coluna marcadora, como a do solicitante.
        (p.venceu_texto AND p.descricao_removida_em IS NULL)         AS tira_descricao,
        -- A observacao da devolucao de tarefa (029).
        (
          p.venceu_texto
          AND EXISTS (
            SELECT 1 FROM devolucoes_de_tarefa t
             WHERE t.ocorrencia_id = p.alvo
               AND t.observacao IS NOT NULL
               AND t.observacao_removida_em IS NULL
          )
        ) AS tira_observacao,
        /*
          A OBSERVACAO DA VISTORIA (043). So entra quando havia texto: uma
          vistoria sem observacao nao ganha marcador, porque marcador onde
          nunca houve texto seria a trilha afirmando um descarte que nao
          aconteceu.
        */
        (
          p.venceu_texto
          AND EXISTS (
            SELECT 1 FROM vistorias v
             WHERE v.organizacao_id = p.org
               AND v.ocorrencia_id = p.alvo
               AND v.observacoes IS NOT NULL
               AND v.observacoes_removidas_em IS NULL
          )
        ) AS tira_observacoes_de_vistoria,
        /*
          O NOME NA TRILHA (043). Segue o relogio do NOME, nao o do texto:
          e identificador, como `solicitante_nome`. A guarda e o proprio
          valor: evento cujo `assinante` ja e o marcador nao conta. Eventos
          sem a chave, ou com ela nula, nunca contam: redigir nao inventa
          historico.
        */
        (
          p.venceu_nome
          AND EXISTS (
            SELECT 1 FROM trilha_eventos e
             WHERE e.organizacao_id = p.org
               AND e.ocorrencia_id = p.alvo
               AND e.tipo = 'vistoria'
               AND jsonb_typeof(e.detalhe -> 'assinante') = 'string'
               AND e.detalhe ->> 'assinante' <> 'removido por prazo'
          )
        ) AS tira_assinante_da_trilha
      FROM prazos p
    ),
    devidas AS (
      SELECT * FROM candidatas
       WHERE tira_solicitante OR tira_vulnerabilidade OR tira_descricao
          OR tira_observacao OR tira_observacoes_de_vistoria OR tira_assinante_da_trilha
       -- A mais antiga primeiro: e a que esta ha mais tempo em desacordo com
       -- a decisao do municipio.
       ORDER BY encerrada
       -- Teto por rodada, pela razao da 021: a primeira rodada de um municipio
       -- com anos de historico nao pode virar uma transacao gigante sobre a
       -- tabela mais consultada do produto.
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
                                                ELSE o.vulnerabilidade_removida_em END,
             descricao = CASE WHEN d.tira_descricao
                              THEN 'removido por prazo'
                              ELSE o.descricao END,
             descricao_removida_em = CASE WHEN d.tira_descricao
                                          THEN now()
                                          ELSE o.descricao_removida_em END
        FROM devidas d
       WHERE o.id = d.alvo
      RETURNING
        o.id             AS oc,
        o.organizacao_id AS org,
        array_remove(ARRAY[
          CASE WHEN d.tira_solicitante     THEN 'solicitante_nome'          END,
          CASE WHEN d.tira_solicitante     THEN 'solicitante_contato'       END,
          CASE WHEN d.tira_vulnerabilidade THEN 'vulnerabilidade_descricao' END,
          CASE WHEN d.tira_descricao       THEN 'descricao'                 END
        ]::text[], NULL) AS campos
    ),
    /* A observacao da devolucao de tarefa, como na 029. */
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
    com_observacao AS (
      SELECT DISTINCT oc FROM observacoes
    ),
    /*
      A OBSERVACAO DA VISTORIA (043). Uma ocorrencia pode ter mais de uma
      vistoria (re-vistoria e o caminho normal de toda interdicao), e todas as
      que tem texto saem; o DISTINCT abaixo e o que impede a juncao de
      multiplicar o evento pelo numero de vistorias.
    */
    observacoes_de_vistoria AS (
      UPDATE vistorias v
         SET observacoes = 'removido por prazo',
             observacoes_removidas_em = now()
        FROM devidas d
       WHERE v.organizacao_id = d.org
         AND v.ocorrencia_id = d.alvo
         AND v.observacoes IS NOT NULL
         AND v.observacoes_removidas_em IS NULL
         AND d.tira_observacoes_de_vistoria
      RETURNING v.ocorrencia_id AS oc
    ),
    com_observacao_de_vistoria AS (
      SELECT DISTINCT oc FROM observacoes_de_vistoria
    ),
    /*
      A TRILHA (043), em duas CTEs de proposito.

      `a_redigir` e a lista do que DEVE mudar, decidida pela leitura.
      `redigidos` e o que MUDOU, devolvido pelo UPDATE. As duas saem do mesmo
      instantaneo, e a diferenca entre elas e a guarda 2 do cabecalho:
      conferida no laco, abaixo, por ocorrencia.

      A escrita troca UM valor e nada mais: `||` sobre jsonb substitui a chave
      `assinante` e preserva `fotos`, `gpsPrecisaoMetros` e o que mais o
      evento tiver. O marcador e o mesmo texto do resto do banco, para a tela
      de auditoria mostrar "assinante: removido por prazo" sem aprender nada
      novo.
    */
    a_redigir AS (
      SELECT e.id, e.ocorrencia_id AS oc
        FROM trilha_eventos e
        JOIN devidas d ON d.org = e.organizacao_id AND d.alvo = e.ocorrencia_id
       WHERE d.tira_assinante_da_trilha
         AND e.tipo = 'vistoria'
         AND jsonb_typeof(e.detalhe -> 'assinante') = 'string'
         AND e.detalhe ->> 'assinante' <> 'removido por prazo'
    ),
    redigidos AS (
      UPDATE trilha_eventos e
         SET detalhe = e.detalhe || jsonb_build_object('assinante', 'removido por prazo')
        FROM a_redigir a
       WHERE e.id = a.id
      RETURNING e.ocorrencia_id AS oc
    ),
    conferencia AS (
      SELECT oc, count(*)::integer AS eventos FROM a_redigir GROUP BY oc
    ),
    com_redacao AS (
      SELECT oc, count(*)::integer AS eventos FROM redigidos GROUP BY oc
    ),
    /*
      O RESULTADO, montado uma vez: o que sai para a trilha e o que a funcao
      devolve e a mesma lista, escrita num lugar so.
    */
    resultado AS (
      SELECT r.org, r.oc,
             r.campos
               || CASE WHEN c.oc IS NOT NULL THEN ARRAY['devolucao_observacao']::text[]     ELSE ARRAY[]::text[] END
               || CASE WHEN s.oc IS NOT NULL THEN ARRAY['vistoria_observacoes']::text[]     ELSE ARRAY[]::text[] END
               || CASE WHEN x.oc IS NOT NULL THEN ARRAY['trilha_vistoria_assinante']::text[] ELSE ARRAY[]::text[] END
               AS campos,
             coalesce(f.eventos, 0) AS eventos_a_redigir,
             coalesce(x.eventos, 0) AS eventos_redigidos
        FROM removidas r
        LEFT JOIN com_observacao             c ON c.oc = r.oc
        LEFT JOIN com_observacao_de_vistoria s ON s.oc = r.oc
        LEFT JOIN conferencia                f ON f.oc = r.oc
        LEFT JOIN com_redacao                x ON x.oc = r.oc
    ),
    /*
      O registro na trilha, na mesma instrucao (021). O `detalhe` diz QUAIS
      campos sairam e QUANTOS eventos foram redigidos, e nunca o que
      continham. `autor_papel` e `administrador` pela razao da 021: a decisao
      de prazo e do administrador do municipio, e `autor_nome` diz por
      extenso que a execucao foi automatica.
    */
    registro AS (
      INSERT INTO trilha_eventos
        (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
         origem, ocorrido_em, detalhe)
      SELECT x.org, x.oc, 'minimizacao_por_prazo', NULL,
             'Minimizacao por prazo (execucao automatica)', 'administrador',
             'escritorio', now(),
             jsonb_build_object('campos', to_jsonb(x.campos))
               || CASE WHEN x.eventos_redigidos > 0
                       THEN jsonb_build_object('trilha_eventos_redigidos', x.eventos_redigidos)
                       ELSE '{}'::jsonb END
        FROM resultado x
      RETURNING 1
    )
    SELECT x.org, x.oc, x.campos, x.eventos_a_redigir, x.eventos_redigidos
      FROM resultado x
    LOOP
      /*
        A guarda 2 do cabecalho. Se o UPDATE alcancou menos eventos do que a
        leitura listou, algo (gatilho, regra) barrou o dono, e o evento de
        minimizacao acabou de afirmar uma redacao que nao aconteceu. A
        excecao desfaz a transacao inteira: nenhuma linha desta rodada muda.
      */
      IF v_linha.eventos_a_redigir <> v_linha.eventos_redigidos THEN
        RAISE EXCEPTION USING
          ERRCODE = 'DC368',
          MESSAGE = format('A minimizacao parou: era para redigir %s evento(s) da trilha de uma ocorrencia e o banco redigiu %s. Nada foi alterado.',
                           v_linha.eventos_a_redigir, v_linha.eventos_redigidos),
          DETAIL  = 'A transacao inteira volta atras. Um UPDATE que nao alcanca as linhas e sinal de '
                    'gatilho, regra ou policy barrando o dono das tabelas em trilha_eventos; '
                    'investigue antes de tentar de novo.';
      END IF;

      municipio        := v_linha.org;
      ocorrencia       := v_linha.oc;
      campos_removidos := v_linha.campos;
      RETURN NEXT;
    END LOOP;

  EXCEPTION WHEN insufficient_privilege THEN
    /*
      A guarda 1 do cabecalho. Com `row_security = off`, o Postgres levanta
      este erro quando o dono das tabelas NAO e isento de RLS e a instrucao
      seria filtrada por policy. Sem isto, a varredura devolvia zero linha em
      silencio e o log dizia "nada a fazer" com os nomes todos no lugar. A
      traducao diz o que houve.
    */
    RAISE EXCEPTION USING
      ERRCODE = 'DC368',
      MESSAGE = 'A minimizacao por prazo parou: o dono das tabelas foi barrado pela seguranca '
                'em nivel de linha, porque nao tem BYPASSRLS. Nada foi alterado.',
      DETAIL  = 'A transacao inteira volta atras. Esta funcao escreve com os privilegios do dono '
                'das tabelas (inclusive a redacao da trilha, que nao tem policy de UPDATE para '
                'ninguem); sem BYPASSRLS o UPDATE alcancaria zero linha em silencio, e por isso '
                'ela prefere estourar. De BYPASSRLS ao papel que e dono das tabelas '
                '(docs/COLOCAR-DE-PE.md) e rode de novo.';
  END;

  RETURN;
END;
$$;

-- A funcao e a unica porta, entao PUBLIC nao a executa. Mesma regra das
-- migracoes 002, 016 e 021. `CREATE OR REPLACE` preserva a ACL, e as duas
-- linhas abaixo existem para a regra ficar escrita onde a funcao esta.
REVOKE ALL ON FUNCTION minimizar_por_prazo(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION minimizar_por_prazo(integer) TO dc360_app;

COMMENT ON FUNCTION minimizar_por_prazo(integer) IS
  'A varredura de minimizacao por prazo (021, 029, 043). Para cada ocorrencia encerrada de municipio com prazo, vencido o prazo: nome e contato do solicitante, descricao de vulnerabilidade, relato, observacao da vistoria e observacao da devolucao viram marcador, e o nome do assinante gravado no detalhe do evento vistoria da trilha e redigido. Registra um evento minimizacao_por_prazo por ocorrencia, com os campos que sairam. Sem municipio nem prazo de parametro; roda como dono com row_security desligado e estoura (DC368) se o dono for barrado pela RLS ou se a redacao alcancar menos eventos do que devia.';

/*
  =====================================================================
  O QUE CONTINUA FORA DA MINIMIZACAO, dito aqui para nao virar promessa
  esquecida (a lista da 021 continua valendo; esta e a diferenca).

  `vistorias.assinante_nome`. FICA, e o motivo esta no cabecalho.

  `ocorrencias.tipo_descricao` (019). FICA por enquanto: e o que o
  solicitante relatou quando o chamado entrou sem classificacao, e some por
  regra do banco assim que a triagem classifica. Uma ocorrencia encerrada sem
  classificar e o unico caso em que ele sobrevive, e a decisao sobre ele nao
  foi tomada nesta migracao.

  `evidencias.legenda` e `providencias.descricao`/`resposta`. FICAM, e sao
  texto livre. A legenda da foto ("fachada da casa da Dona Marilda") e o
  texto da providencia podem nomear pessoa, e ninguem decidiu ainda. Estao
  listados em docs/PRIVACIDADE.md como orientacao operacional, nao como
  promessa de descarte.
  =====================================================================
*/
