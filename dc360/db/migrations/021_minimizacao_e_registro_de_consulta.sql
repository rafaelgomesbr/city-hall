-- =====================================================================
-- 021: retencao por minimizacao, e o registro de quem consultou dado de
-- cidadao.
--
-- DUAS PERGUNTAS QUE O PRODUTO NAO SABIA RESPONDER, e as duas sao feitas pela
-- autoridade nacional de protecao de dados na primeira conversa:
--
--   "por quanto tempo voces guardam o nome de quem ligou?"
--       Ate aqui: para sempre. O `docs/PRIVACIDADE.md` ja prometia
--       minimizacao por prazo, e nao existia uma linha de codigo que a
--       executasse. Documento que promete o que o sistema nao faz e pior que
--       documento nenhum, porque vira declaracao falsa assinada.
--
--   "quem viu os dados dessa familia?"
--       Ate aqui: ninguem sabe. Exportacao ja deixava rastro desde a migracao
--       007; LEITURA nao deixava nenhum. E leitura e o caminho comum: o
--       dossie de uma familia e aberto na tela dezenas de vezes por semana, e
--       nada no banco registrava por quem.
--
-- =====================================================================
-- O ARGUMENTO DA MINIMIZACAO, e ele decide o que fica e o que sai.
--
-- O ENDERECO E ATRIBUTO DO IMOVEL vistoriado e do ato praticado sobre ele. Ele
-- e o objeto do laudo, o objeto da interdicao e o objeto do oficio que foi ao
-- Corpo de Bombeiros. Apagar o endereco apagaria o proprio ato administrativo,
-- que e permanente e do qual o municipio presta contas.
--
-- O NOME E ATRIBUTO DA PESSOA QUE LIGOU. Ele existe para retornar a ela, para
-- avisar da vistoria e para avisar da interdicao. Encerrado o atendimento e
-- vencido o prazo que o municipio fixou, ele deixou de ser necessario, e
-- manter dado pessoal depois que ele deixou de ser necessario e acumulo sem
-- finalidade: exatamente o que a minimizacao existe para impedir.
--
-- Por isso o corte e este, e nao um "apagar a ocorrencia":
--   FICAM   protocolo, endereco, tipo, severidade, o relato do que aconteceu,
--           a decisao tecnica, o laudo, a trilha e o registro de quem acessou.
--   SAEM    nome do solicitante, contato do solicitante e a descricao de
--           vulnerabilidade social.
--
-- A DESCRICAO DE VULNERABILIDADE SAI JUNTO, E NUNCA DEPOIS. Ela e o dado mais
-- sensivel do produto (revela condicao de saude, deficiencia, gestacao,
-- idade), e seria absurdo o sistema descartar o nome de quem ligou e continuar
-- guardando a frase que descreve a doenca de quem mora na casa. Duas defesas
-- garantem a ordem: a restricao abaixo proibe configurar prazo de
-- vulnerabilidade MAIOR que o do solicitante, e a varredura, quando o prazo de
-- vulnerabilidade nao esta configurado, usa o do solicitante como teto.
--
-- MARCADOR, E NAO NULL. `NULL` nao distingue "nunca teve" de "foi removido por
-- prazo", e o segundo precisa ser demonstravel numa auditoria: o municipio
-- tem que conseguir provar que descartou, e nao que nunca coletou. Por isso o
-- nome vira um texto fixo e conhecido, e uma coluna de data carimba quando a
-- remocao aconteceu.
--
-- EVENTO NA TRILHA POR REMOCAO. Sem ele, minimizacao e perda de dado sao
-- indistinguiveis: as duas produzem uma ocorrencia sem nome. Com ele, a
-- trilha da propria ocorrencia diz que o descarte foi ato do sistema, em que
-- dia, e sobre quais campos.
--
-- O PRAZO E DECISAO DO MUNICIPIO, porque o municipio e o CONTROLADOR. O
-- fornecedor entrega o mecanismo, nunca o numero. Por isso ele e coluna de
-- `organizacoes` e nao constante de codigo, e por isso o padrao e NULO:
-- municipio que ainda nao decidiu nao perde nada, a varredura simplesmente
-- pula. Escolher um numero por ele seria o operador decidindo, no lugar do
-- controlador, o dia em que um dado de cidadao e destruido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- O prazo, por municipio
-- ---------------------------------------------------------------------
ALTER TABLE organizacoes
  ADD COLUMN IF NOT EXISTS retencao_solicitante_dias     integer,
  ADD COLUMN IF NOT EXISTS retencao_vulnerabilidade_dias integer;

/*
  Faixa de sanidade, e nao piso de politica.

  O teto de cem anos existe porque `make_interval` recebe este numero e um
  valor absurdo viraria erro de execucao dentro da varredura, no meio da
  noite, sem ninguem olhando. O piso de um dia existe pelo mesmo motivo que o
  teto de contagem de pessoas da migracao 015: dedo escorregando em campo
  numerico.

  NAO existe piso de politica de proposito. Um municipio que decidir descartar
  em trinta dias esta decidindo por MAIS privacidade, e nao por menos, e nao
  cabe ao fornecedor impedir o controlador de proteger melhor o proprio
  cidadao. O que protege contra o numero errado nao e uma faixa estreita: e a
  rota que exige `gerenciar_organizacao` (so o administrador do municipio) e
  grava a mudanca na trilha administrativa, com valor anterior e novo.
*/
ALTER TABLE organizacoes
  DROP CONSTRAINT IF EXISTS retencao_em_faixa_plausivel,
  ADD CONSTRAINT retencao_em_faixa_plausivel CHECK (
    (retencao_solicitante_dias     IS NULL OR retencao_solicitante_dias     BETWEEN 1 AND 36500)
    AND
    (retencao_vulnerabilidade_dias IS NULL OR retencao_vulnerabilidade_dias BETWEEN 1 AND 36500)
  );

/*
  A ORDEM, no banco.

  Sem esta restricao, um municipio poderia configurar noventa dias para o nome
  e cinco anos para a vulnerabilidade, e o sistema passaria quatro anos e nove
  meses guardando "morador acamado, dependente de oxigenio" numa ocorrencia
  que ja nao tem nome nem contato. Guardar o dado sensivel MAIS tempo que o
  identificador comum e o contrario do que a minimizacao quer dizer.
*/
ALTER TABLE organizacoes
  DROP CONSTRAINT IF EXISTS vulnerabilidade_nao_sai_depois_do_nome,
  ADD CONSTRAINT vulnerabilidade_nao_sai_depois_do_nome CHECK (
    retencao_vulnerabilidade_dias IS NULL
    OR retencao_solicitante_dias IS NULL
    OR retencao_vulnerabilidade_dias <= retencao_solicitante_dias
  );

COMMENT ON COLUMN organizacoes.retencao_solicitante_dias IS
  'Dias, contados do ENCERRAMENTO da ocorrencia, ate o nome e o contato do '
  'solicitante virarem marcador de removido por prazo. NULO significa que o '
  'municipio ainda nao decidiu, e entao nada e removido.';

COMMENT ON COLUMN organizacoes.retencao_vulnerabilidade_dias IS
  'Idem, para a descricao de vulnerabilidade social. Nunca maior que o do '
  'solicitante. Nulo com o do solicitante preenchido faz a descricao sair '
  'JUNTO com o nome, nunca depois.';

-- ---------------------------------------------------------------------
-- O marcador na ocorrencia
-- ---------------------------------------------------------------------
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS solicitante_removido_em     timestamptz,
  ADD COLUMN IF NOT EXISTS vulnerabilidade_removida_em timestamptz;

/*
  O texto do marcador mora no banco, aqui, e a aplicacao o repete em
  `apps/api/src/privacidade/minimizacao.ts`. A restricao abaixo e o que impede
  os dois de divergirem em silencio: qualquer caminho que carimbe a data e
  escreva outro nome e recusado pelo Postgres.

  Repare que a checagem tambem exige contato NULO. Sem isso, um caminho futuro
  poderia marcar a ocorrencia como minimizada e deixar o telefone da pessoa na
  linha, e o marcador passaria a afirmar uma coisa que nao aconteceu.
*/
ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS marcador_de_remocao_e_coerente,
  ADD CONSTRAINT marcador_de_remocao_e_coerente CHECK (
    solicitante_removido_em IS NULL
    OR (solicitante_nome = 'removido por prazo' AND solicitante_contato IS NULL)
  );

/*
  A descricao de vulnerabilidade some, e a MARCA de que havia vulnerabilidade
  fica.

  `vulnerabilidade_presente` nao e dado sensivel por si: e a justificativa de
  prioridade daquele atendimento, parte do ato administrativo, e sem ela a
  auditoria nao consegue explicar por que aquele chamado passou na frente. O
  que revela saude, deficiencia ou gestacao e a DESCRICAO, e e ela que sai.

  Por isso a restricao original da migracao 001 (`vulnerabilidade_exige_
  descricao`) precisa aprender um terceiro caso: presente, sem descricao,
  PORQUE foi removida por prazo. Sem esta troca, a varredura nao conseguiria
  limpar uma unica linha marcada como vulneravel, e a promessa mais importante
  da politica de privacidade seria a unica que o banco impediria de cumprir.
*/
ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS vulnerabilidade_exige_descricao,
  ADD CONSTRAINT vulnerabilidade_exige_descricao CHECK (
    NOT vulnerabilidade_presente
    OR (vulnerabilidade_descricao IS NOT NULL AND length(trim(vulnerabilidade_descricao)) > 0)
    OR vulnerabilidade_removida_em IS NOT NULL
  );

ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS marcador_de_vulnerabilidade_e_coerente,
  ADD CONSTRAINT marcador_de_vulnerabilidade_e_coerente CHECK (
    vulnerabilidade_removida_em IS NULL OR vulnerabilidade_descricao IS NULL
  );

-- A varredura procura sempre por "encerradas ha mais de X e ainda nao
-- minimizadas". Sem indice ela passaria a tabela inteira de todos os
-- municipios a cada rodada, e ela roda para sempre.
CREATE INDEX IF NOT EXISTS ocorrencias_a_minimizar_idx
  ON ocorrencias (encerrado_em)
  WHERE encerrado_em IS NOT NULL AND solicitante_removido_em IS NULL;

COMMENT ON COLUMN ocorrencias.solicitante_removido_em IS
  'Quando o nome e o contato viraram marcador de removido por prazo. Nulo '
  'significa que nao foram removidos, e o nome na linha e o nome de verdade.';

-- ---------------------------------------------------------------------
-- Quem consultou dado de cidadao
--
-- REGISTRA O ACESSO, NUNCA O DADO. Nao ha coluna de conteudo aqui, e a
-- ausencia e a decisao inteira: uma linha que carregasse o nome consultado, o
-- contato ou a descricao de vulnerabilidade seria uma SEGUNDA copia do dado
-- sensivel, com a mesma exposicao do original, lida por mais gente (auditoria
-- e suporte leem registro de acesso) e SEM a retencao do original, porque
-- registro de acesso e prova e prova nao se minimiza. O produto teria
-- inventado um vazamento novo para poder investigar vazamento.
--
-- O QUE FICA E O SUFICIENTE PARA A PERGUNTA: quem, quando, qual recurso, sobre
-- qual ocorrencia e com que finalidade declarada. Com isso o municipio
-- responde "quem viu os dados dessa familia?" e "o que este servidor andou
-- consultando?", que sao as duas perguntas reais.
--
-- APPEND-ONLY pelo mesmo mecanismo da trilha: ausencia de policy de UPDATE e
-- de DELETE. Um registro de acesso que quem acessou consegue apagar nao e
-- registro de acesso.
-- ---------------------------------------------------------------------
CREATE TABLE ocorrencia_consultas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id   uuid NOT NULL,

  -- Quem. `usuario_id` pode ficar nulo se a conta for apagada um dia, e por
  -- isso nome e papel sao copiados no instante do acesso, como na trilha
  -- administrativa: o registro precisa continuar legivel depois.
  usuario_id      uuid,
  usuario_nome    text NOT NULL CHECK (length(trim(usuario_nome)) > 0),
  usuario_papel   text NOT NULL CHECK (
                    usuario_papel IN ('coordenador','operador','agente_campo','administrador')
                  ),

  /*
    QUAL RECURSO, e a lista e fechada de proposito.

    Ela e curta porque o criterio de o que se registra e curto (ver o
    comentario de `registrarConsulta` na aplicacao): entram as leituras que
    CONCENTRAM dado de pessoa, e nao toda leitura. Lista fechada tambem e o
    que impede alguem, um dia, de escrever aqui o caminho cru da requisicao,
    que carrega parametro de busca e portanto dado de cidadao.
  */
  recurso         text NOT NULL CHECK (recurso IN (
                    'ocorrencia_detalhe',
                    'laudo',
                    'termo_de_interdicao',
                    'termo_de_desinterdicao'
                  )),

  /*
    A FINALIDADE, declarada pela ROTA e nao digitada por quem consulta.

    Campo livre preenchido pelo usuario a cada clique seria preenchido com
    "consulta" por todo mundo em uma semana, e a coluna passaria a nao dizer
    nada enquanto parecesse dizer. A rota, ao contrario, sabe com certeza para
    que aquela leitura serve: abrir o dossie no atendimento e uma finalidade,
    emitir documento oficial e outra.

    A excecao e a exportacao de nivel completo, cuja finalidade E escrita a
    mao. Ela nao mora aqui: mora em `exportacoes.justificativa`, mais abaixo,
    porque exportacao atravessa muitas ocorrencias e nao pertence a nenhuma.
  */
  finalidade      text NOT NULL CHECK (finalidade IN (
                    'atendimento',
                    'emissao_de_documento'
                  )),

  consultada_em   timestamptz NOT NULL DEFAULT now(),
  ip              inet,

  CONSTRAINT consulta_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT,

  CONSTRAINT consulta_usuario_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, usuario_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL
);

-- "Quem viu os dados dessa familia?", que e a pergunta da autoridade nacional.
CREATE INDEX ocorrencia_consultas_por_ocorrencia_idx
  ON ocorrencia_consultas (organizacao_id, ocorrencia_id, consultada_em DESC);

-- "O que este servidor andou consultando?", que e a pergunta da corregedoria.
CREATE INDEX ocorrencia_consultas_por_usuario_idx
  ON ocorrencia_consultas (organizacao_id, usuario_id, consultada_em DESC);

ALTER TABLE ocorrencia_consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencia_consultas FORCE ROW LEVEL SECURITY;

CREATE POLICY ocorrencia_consultas_leitura ON ocorrencia_consultas FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY ocorrencia_consultas_insercao ON ocorrencia_consultas FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- Sem policy de UPDATE e sem policy de DELETE. Com RLS forcada, a ausencia
-- nega a operacao, inclusive para quem administra o municipio.

GRANT SELECT, INSERT ON ocorrencia_consultas TO dc360_app;

COMMENT ON TABLE ocorrencia_consultas IS
  'Quem leu dado de cidadao, quando, qual recurso e com que finalidade. '
  'Registra o ACESSO e nunca o dado lido: conteudo aqui seria uma segunda '
  'copia do dado sensivel, sem a retencao do original.';

-- ---------------------------------------------------------------------
-- A exportacao ganha nivel e justificativa
--
-- POR QUE DOIS NIVEIS. Porque o arquivo que responde ao Tribunal de Contas e
-- a camara municipal ("quantos chamados, de que tipo, em quanto tempo, em que
-- bairro") nao precisa do nome de ninguem, e ate hoje saia com o nome de todo
-- mundo. Um CSV com nome, contato e marca de vulnerabilidade de milhares de
-- familias sai do sistema e passa a viver num pen drive, num anexo de email e
-- numa pasta compartilhada, e nada consegue traze-lo de volta.
--
-- O NIVEL COMPLETO NAO PODE SER O PADRAO: quem exporta tudo por engano ja
-- vazou, e o engano e o caso comum, nao o raro.
-- ---------------------------------------------------------------------
ALTER TABLE exportacoes
  ADD COLUMN IF NOT EXISTS nivel         text NOT NULL DEFAULT 'basico',
  ADD COLUMN IF NOT EXISTS justificativa text;

ALTER TABLE exportacoes
  DROP CONSTRAINT IF EXISTS exportacao_nivel_conhecido,
  ADD CONSTRAINT exportacao_nivel_conhecido CHECK (nivel IN ('basico','completo'));

/*
  JUSTIFICATIVA ESCRITA, exigida pelo BANCO e nao so pela rota.

  A regra vale para qualquer caminho que insira em `exportacoes`, hoje e
  depois: rota nova alguem escreve, e uma rota nova que exportasse dado
  pessoal sem justificativa seria exatamente o buraco pelo qual esta regra
  escaparia.

  O minimo de vinte caracteres nao e burocracia. Sem ele, o campo e preenchido
  com "ok" e o registro passa a existir sem informar nada, que e pior do que
  nao existir: da a aparencia de controle sem o controle. Vinte caracteres
  obrigam uma frase, e uma frase e o que a autoridade nacional le quando
  pergunta por que aquele arquivo saiu.
*/
ALTER TABLE exportacoes
  DROP CONSTRAINT IF EXISTS exportacao_completa_exige_justificativa,
  ADD CONSTRAINT exportacao_completa_exige_justificativa CHECK (
    nivel <> 'completo'
    OR (justificativa IS NOT NULL AND length(trim(justificativa)) >= 20)
  );

COMMENT ON COLUMN exportacoes.nivel IS
  'basico nao leva nome, contato nem vulnerabilidade; completo leva. O padrao '
  'e basico porque quem exporta dado pessoal por engano ja vazou.';

-- ---------------------------------------------------------------------
-- A varredura de minimizacao, em uma funcao so
--
-- POR QUE ELA E PRIVILEGIADA, pela mesma razao da migracao 016: ela roda sem
-- ninguem logado. Nao existe token, entao nao existe municipio no contexto, e
-- sem municipio no contexto o papel de aplicacao nao enxerga uma linha
-- sequer. A resposta e a mesma de sempre neste banco: uma porta nomeada e
-- estreita, em vez de uma excecao geral ao RLS.
--
-- O QUE ELA NAO FAZ, e cada "nao" e uma decisao:
--   * nao aceita municipio como parametro, entao nao vira porta para ler nem
--     para escrever em municipio escolhido por quem chama;
--   * nao aceita prazo como parametro. O prazo sai de `organizacoes`, que e
--     onde o controlador o escreveu. Se ele viesse de fora, quem chamasse a
--     funcao decidiria o dia da destruicao do dado, e o municipio deixaria de
--     ser o controlador de fato;
--   * nao toca em municipio com prazo nulo. Nao configurou, nao perde nada;
--   * nao toca em ocorrencia aberta. Enquanto o atendimento corre, o nome e o
--     contato continuam necessarios: e por eles que o orgao avisa a familia da
--     vistoria e da interdicao. O relogio comeca no ENCERRAMENTO;
--   * nao devolve nome, contato nem descricao de vulnerabilidade. Devolve o
--     que aconteceu, para o log dizer quantas linhas foram minimizadas sem
--     reproduzir o que foi apagado.
--
-- ELA REMOVE E REGISTRA NA MESMA INSTRUCAO, e isso e o ponto mais importante
-- do arquivo. Se o registro na trilha fosse uma segunda transacao, feita pela
-- aplicacao depois, um processo que morresse no meio deixaria dado removido
-- SEM rastro nenhum, que e indistinguivel de perda de dado. Aqui as duas
-- coisas sao a mesma transacao: ou as duas acontecem, ou nenhuma.
-- ---------------------------------------------------------------------
CREATE FUNCTION minimizar_por_prazo(p_teto integer)
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
      ) AS tira_vulnerabilidade
    FROM ocorrencias o
    JOIN organizacoes g ON g.id = o.organizacao_id
    WHERE o.encerrado_em IS NOT NULL
      AND (g.retencao_solicitante_dias IS NOT NULL
           OR g.retencao_vulnerabilidade_dias IS NOT NULL)
  ),
  devidas AS (
    SELECT * FROM candidatas
     WHERE tira_solicitante OR tira_vulnerabilidade
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
           jsonb_build_object('campos', to_jsonb(r.campos))
      FROM removidas r
    RETURNING 1
  )
  SELECT r.org, r.oc, r.campos FROM removidas r;
END;
$$;

-- A funcao e a unica porta, entao PUBLIC nao a executa. Mesma regra das
-- migracoes 002 e 016.
REVOKE ALL ON FUNCTION minimizar_por_prazo(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION minimizar_por_prazo(integer) TO dc360_app;

/*
  =====================================================================
  O QUE NAO ENTRA NA MINIMIZACAO, e por que. O banco cresceu, e cada tabela
  com dado de pessoa por perto precisou de uma decisao explicita, senao a
  proxima pessoa a ler isto vai supor que foram esquecidas.

  `oficio_aberturas` (IP de quem abriu o link do oficio). FICA, e este e o
  caso mais delicado da lista. Aquele IP nao e dado do cidadao atendido: e a
  PROVA de que o dossie daquela familia foi entregue a alguem fora da Defesa
  Civil, com data e hora. E exatamente a resposta para "com quem meus dados
  foram compartilhados?", que e um direito do titular. Apaga-lo junto com o
  nome do solicitante destruiria a prova do compartilhamento no mesmo dia em
  que o titular ganharia mais motivo para pedi-la.

  `ocorrencia_consultas` (esta migracao) e `exportacoes` (migracao 007). FICAM,
  pelo mesmo argumento: sao registro de ACESSO, nao copia do dado. Minimizar
  registro de acesso seria apagar a testemunha para proteger o segredo.

  `oficios.observacoes` e `oficio_envios.destinatario_email`. FICAM. O oficio
  emitido e documento oficial numerado, e o orgao destinatario tem uma copia
  dele em papel ou em email; alterar o nosso lado nao alteraria o dele, so
  faria as duas versoes divergirem. Por isso `oficios` nao tem nem policy de
  UPDATE (migracao 017). O endereco de destino, por sua vez, e institucional:
  o gatilho `envio_so_para_dominio_do_catalogo` garante que ele pertence a um
  orgao ativo do proprio municipio, e nunca a uma caixa pessoal.
  CONSEQUENCIA A DIZER EM VOZ ALTA: o municipio que escrever nome de cidadao
  no campo de observacoes do oficio esta escrevendo num documento permanente.
  Isso esta dito em `docs/PRIVACIDADE.md`.

  `aparelhos.ficha` (migracao 016). FICA. E dado do SERVIDOR e nao do cidadao,
  ela nao alcanca telefone nenhum depois de revogada (a Apple e o Google a
  recusam, e o varredor de push revoga sozinho), e o registro de qual aparelho
  recebeu qual aviso ja tem retencao propria de noventa dias.

  `avisos` e `avisos_lidos` (migracao 018). FICAM. Foram desenhadas para nao
  carregar dado de pessoa (o `detalhe` tem teto de 200 caracteres justamente
  para ninguem colar relato ali), apontam para a ocorrencia por identificador,
  e ja tem retencao propria de sessenta dias na policy de DELETE.

  `notificacoes_enviadas` (migracao 016). FICA, com a retencao de noventa dias
  que ja e executada dentro de `varrer_prazos`.

  FOTOGRAFIA DE VISTORIA. NAO ENTRA NESTA MIGRACAO, e a ausencia esta escrita
  aqui para nao virar promessa esquecida: remover foto exige apagar o objeto
  no armazenamento externo, que e outro subsistema e outra falha possivel (o
  objeto some e a linha fica, ou o contrario). `docs/PRIVACIDADE.md` foi
  corrigido para dizer que isso e PREVISTO e nao implantado, em vez de
  descrever como se ja funcionasse.
  =====================================================================
*/
