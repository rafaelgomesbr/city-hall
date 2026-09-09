-- =====================================================================
-- 016: aparelho de push, e o aviso de prazo que sai para ele.
--
-- O QUE FALTAVA. O prazo de uma vistoria vence e ninguem fica sabendo. O
-- coordenador so descobre quando abre a tela, e o agente que esta na rua nao
-- abre tela nenhuma: ele esta dirigindo, ou embaixo de chuva, com o telefone
-- no bolso. O unico canal que alcanca alguem nessa situacao e a notificacao na
-- tela bloqueada.
--
-- O envio vai DIRETO para a Apple e para o Google, sem intermediario, por
-- decisao do dono do produto em 09/09/2026. Duas tabelas sustentam isso: uma
-- diz para qual aparelho mandar, a outra diz o que ja foi mandado.
--
-- =====================================================================
-- A ARMADILHA DE ISOLAMENTO DESTA MIGRACAO, e ela e o ponto que precisa ser
-- lido antes de qualquer outra coisa aqui.
--
-- A ficha de push (o token que a Apple e o Google entregam ao aplicativo) e
-- unica por instalacao do aplicativo no aparelho fisico. Ela nao sabe o que e
-- municipio. Isso poe duas escolhas em conflito direto:
--
--   UNIQUE (ficha), global. Resolve a entrega duplicada, e VAZA EXISTENCIA
--   ENTRE MUNICIPIOS: quando o mesmo aparelho e registrado por dois
--   municipios, o segundo INSERT falha, e a mensagem de erro do Postgres diz
--   que aquela ficha ja existe. Quem registrou passa a saber que aquele
--   aparelho ja esta cadastrado em outro lugar. E o mesmo vazamento que a
--   resposta 404 no lugar de 403 existe para impedir na API, e a ADR 0001
--   proibe, so que pela porta do banco.
--
--   UNIQUE (organizacao_id, ficha). Nao vaza nada, e aceita que a mesma ficha
--   fique viva em dois municipios ao mesmo tempo.
--
-- A ESCOLHA E A SEGUNDA, e o defeito que estamos aceitando e este, escrito por
-- extenso porque ele nao e teorico:
--
--   Um aparelho registrado em Serra Alta e depois usado em Vale Fundo continua
--   recebendo aviso das duas prefeituras. A Apple e o Google vao entregar as
--   duas notificacoes no mesmo aparelho, porque para eles e o mesmo destino.
--   Pior que o barulho: o DADO da notificacao de Serra Alta (protocolo,
--   endereco) chega a um aparelho que hoje esta na mao de quem trabalha para
--   Vale Fundo.
--
-- POR QUE MESMO ASSIM. Porque fechar isso exigiria uma funcao privilegiada que
-- ESCREVE em linha de outro municipio (revogar a ficha onde quer que ela
-- esteja), e uma funcao dessas contradiz a regra numero um do produto de um
-- jeito permanente, para corrigir um caso que tem tres barreiras mais baratas
-- antes dele. Vazar existencia, por outro lado, e defeito imediato e sem
-- barreira nenhuma.
--
-- AS TRES BARREIRAS QUE SOBRAM NO LUGAR, e nenhuma delas e privilegiada:
--
--   1. Sair do aplicativo revoga a ficha daquele aparelho (ver
--      `apps/api/src/rotas/autenticacao.ts`, rota `/auth/sair`). Este e o
--      caminho normal, e ele fecha o caso normal.
--   2. Quando a Apple ou o Google responde que a ficha morreu, o varredor
--      revoga o aparelho. Reinstalar o aplicativo troca a ficha, entao a
--      antiga morre sozinha e some dos dois municipios.
--   3. A notificacao carrega o identificador do municipio no dado, e o
--      aplicativo DESCARTA a que nao for do municipio em que a pessoa esta
--      logada. Esta e a barreira que fecha o vazamento de dado descrito acima,
--      e ela e obrigacao da metade aplicativo. Sem ela, o defeito aceito aqui
--      deixa de ser barulho e vira vazamento.
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aparelhos: qual telefone pertence a quem, e para onde mandar.
--
-- Um servidor pode ter mais de um aparelho (o telefone da prefeitura e o
-- proprio), e um aparelho pode trocar de dono dentro do mesmo municipio,
-- porque telefone de plantao passa de mao. Por isso a chave natural aqui e
-- (municipio, ficha), e nao (municipio, usuario).
--
-- Aparelho nao se apaga, se revoga com motivo: a tabela de notificacoes
-- enviadas aponta para ele, e apagar a linha apagaria junto a resposta para
-- "eu recebi esse aviso?", que e a pergunta que o suporte precisa responder.
-- ---------------------------------------------------------------------
CREATE TABLE aparelhos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id        uuid NOT NULL,
  plataforma        text NOT NULL CHECK (plataforma IN ('ios','android')),

  -- A ficha e o token de push. Nao e segredo de autenticacao, mas quem a tem
  -- consegue escrever na tela bloqueada de um agente de Defesa Civil, entao
  -- ela nao aparece em log, nem em resposta de rota, nem em `detalhe` de
  -- notificacao. O teto de 4096 e folga: a ficha da Apple tem 64 caracteres
  -- hexadecimais e a do Google passa de 150, e nenhuma das duas tem tamanho
  -- prometido em contrato.
  ficha             text NOT NULL CHECK (length(trim(ficha)) BETWEEN 1 AND 4096),

  criado_em         timestamptz NOT NULL DEFAULT now(),
  -- Ultima vez que o aplicativo confirmou esta ficha. Serve para o dia em que
  -- alguem precisar limpar aparelho que sumiu sem revogar.
  visto_em          timestamptz NOT NULL DEFAULT now(),
  revogado_em       timestamptz,
  motivo_revogacao  text,

  -- Ver a armadilha de isolamento no topo: a unicidade e POR MUNICIPIO, de
  -- proposito, e o custo esta escrito la.
  CONSTRAINT aparelhos_ficha_unica_no_municipio UNIQUE (organizacao_id, ficha),

  -- Redundante com a chave primaria, e e o preco da chave estrangeira
  -- composta que a migracao 008 estabeleceu como regra da casa.
  CONSTRAINT aparelhos_org_id_unico UNIQUE (organizacao_id, id),

  CONSTRAINT aparelhos_usuario_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, usuario_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT,

  -- Revogacao sem motivo e revogacao que ninguem consegue explicar depois.
  -- Mesma regra do encerramento de ocorrencia, pelo mesmo motivo.
  CONSTRAINT revogacao_de_aparelho_exige_motivo CHECK (
    revogado_em IS NULL
    OR (motivo_revogacao IS NOT NULL AND length(trim(motivo_revogacao)) > 0)
  )
);

-- O varredor busca sempre por "aparelhos vivos deste usuario", e nunca pelos
-- revogados: o indice parcial e do tamanho da pergunta que existe.
CREATE INDEX aparelhos_vivos_idx ON aparelhos (organizacao_id, usuario_id)
  WHERE revogado_em IS NULL;

ALTER TABLE aparelhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aparelhos FORCE ROW LEVEL SECURITY;

CREATE POLICY aparelhos_isolamento ON aparelhos
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

COMMENT ON COLUMN aparelhos.ficha IS
  'Token de push da Apple ou do Google. Nao sai em log nem em resposta de rota: '
  'quem tem a ficha escreve na tela bloqueada de um agente.';

-- ---------------------------------------------------------------------
-- Notificacoes enviadas: o que ja saiu, para nao sair de novo.
--
-- Duas funcoes, e as duas justificam a tabela sozinhas:
--
--   1. IDEMPOTENCIA. Reiniciar o processo, ou subir uma segunda maquina no
--      Fly, nao pode remandar o que ja foi mandado. A unicidade por
--      (municipio, aparelho, ocorrencia, tipo) e o que garante isso, e ela
--      esta no banco porque memoria de processo nao sobrevive a deploy.
--   2. SUPORTE. "Voce recebeu o aviso as 14h32" e a unica resposta util
--      quando o agente diz que nao foi avisado. Sem registro, a conversa vira
--      a palavra de um contra a do outro.
--
-- O `detalhe` guarda o que o provedor respondeu (codigo e razao), e NADA mais.
-- Nunca a ficha, nunca o texto da notificacao, nunca nome de pessoa: esta
-- tabela vira consulta de suporte, e consulta de suporte e lida por mais gente
-- do que o resto do banco.
-- ---------------------------------------------------------------------
CREATE TABLE notificacoes_enviadas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  aparelho_id     uuid NOT NULL,
  ocorrencia_id   uuid NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('tarefa_nova','prazo_vencendo')),
  enviada_em      timestamptz NOT NULL DEFAULT now(),

  -- `enviando` e o estado reivindicado antes de falar com a Apple ou com o
  -- Google. Ele existe porque a ordem correta e reivindicar primeiro e enviar
  -- depois: na ordem inversa, o processo que morre entre o envio e o registro
  -- manda tudo de novo ao subir. O preco da ordem correta e a linha que fica
  -- presa em `enviando` quando o processo morre no meio, e o varredor a
  -- retoma pela regra de espera (ver a funcao mais abaixo).
  desfecho        text NOT NULL DEFAULT 'enviando'
                  CHECK (desfecho IN ('enviando','entregue','falha','ficha_invalida')),
  detalhe         text,
  tentativas      integer NOT NULL DEFAULT 1 CHECK (tentativas > 0),

  -- O coracao da idempotencia. Uma notificacao por aparelho, por ocorrencia,
  -- por tipo.
  CONSTRAINT notificacao_unica_por_aparelho
    UNIQUE (organizacao_id, aparelho_id, ocorrencia_id, tipo),

  CONSTRAINT notificacao_aparelho_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, aparelho_id)
    REFERENCES aparelhos (organizacao_id, id) ON DELETE RESTRICT,

  CONSTRAINT notificacao_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT
);

-- O expurgo por idade varre por `enviada_em`, e sem indice ele passaria a
-- tabela inteira a cada varredura.
CREATE INDEX notificacoes_enviadas_idade_idx ON notificacoes_enviadas (enviada_em);

ALTER TABLE notificacoes_enviadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes_enviadas FORCE ROW LEVEL SECURITY;

CREATE POLICY notificacoes_leitura ON notificacoes_enviadas FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY notificacoes_atualizacao ON notificacoes_enviadas FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  RETENCAO, decidida aqui: NOVENTA DIAS.

  Esta tabela cresce por multiplicacao, nao por soma: um municipio com trinta
  agentes e dez ocorrencias com prazo por dia gera trezentas linhas por dia,
  todo dia, para sempre. Sem prazo de descarte, em um ano ela e a maior tabela
  do banco e nao serve a ninguem.

  Noventa dias e o numero porque ele e maior que a unica pergunta que a tabela
  responde depois do fato ("recebi ou nao recebi aquele aviso?"), que na
  pratica e feita no mesmo dia ou na mesma semana, e porque guardar por mais
  tempo seria manter um registro de quem foi avisado sobre qual ocorrencia sem
  nenhuma finalidade declarada, que e exatamente o que a politica de
  privacidade promete nao fazer.

  A janela tem que continuar MUITO maior que a janela de aviso (uma hora, por
  padrao). Se um dia alguem baixar a retencao para perto da janela, a linha
  expurgada volta a ser reivindicada e o aviso sai duas vezes.

  NAO EXISTE POLICY DE DELETE, e isso e deliberado: nenhuma requisicao apaga
  linha daqui. O expurgo acontece dentro da funcao de varredura logo abaixo,
  que e a unica porta, e ele e por IDADE, nunca por escolha de quem chama.
*/

-- ---------------------------------------------------------------------
-- Privilegios do papel de aplicacao.
--
-- Sem INSERT em `notificacoes_enviadas`, de proposito: a unica coisa que cria
-- linha ali e a funcao de varredura. Quando o aviso de tarefa nova entrar (ele
-- nasce no despacho, dentro do contexto do municipio), quem o escrever
-- concede o INSERT na propria migracao, de forma deliberada.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON aparelhos TO dc360_app;
GRANT SELECT, UPDATE ON notificacoes_enviadas TO dc360_app;

-- ---------------------------------------------------------------------
-- A varredura de prazo, em uma funcao so.
--
-- POR QUE ELA E PRIVILEGIADA, e por que isso nao e preguica.
--
-- O varredor roda sem ninguem logado. Nao existe token, entao nao existe
-- municipio no contexto, e sem municipio no contexto o papel de aplicacao nao
-- enxerga uma linha sequer: e assim que o RLS deste produto funciona. Ou seja,
-- o varredor nao tem como nem descobrir QUAIS municipios tem prazo vencendo.
-- E o mesmo problema do login, que tambem acontece antes de existir contexto,
-- e a resposta e a mesma da migracao 002: uma porta nomeada e estreita, em vez
-- de uma excecao geral ao RLS.
--
-- ELA REIVINDICA E DEVOLVE NA MESMA CHAMADA, e essa e a parte que da a
-- idempotencia. O INSERT com ON CONFLICT marca a notificacao como `enviando`
-- ANTES de qualquer conversa com a Apple, e so devolve as linhas que ele
-- conseguiu marcar. Duas maquinas do Fly chamando ao mesmo tempo: a primeira
-- marca, a segunda nao recebe nada para mandar. Nao substitui a trava de
-- processo (ver `apps/api/src/push/trava.ts`), e sim a sustenta por baixo,
-- porque trava de processo cai junto com o processo.
--
-- O QUE ELA NAO FAZ, e cada "nao" aqui e uma decisao:
--   * nao aceita municipio como parametro, entao nao vira porta para ler dado
--     de um municipio escolhido por quem chama;
--   * nao aceita filtro, nem ordenacao, nem intervalo aberto: a janela e um
--     intervalo a partir de agora, e nada mais;
--   * nao devolve nome de pessoa, contato, relato nem descricao de
--     vulnerabilidade. Devolve o que a notificacao precisa e o que o
--     aplicativo vai usar para abrir a tela certa;
--   * nao avisa de prazo JA VENCIDO. Aviso de prazo serve para dar tempo de
--     agir, e prazo vencido e assunto da tela do coordenador. Alem disso, e o
--     que impede um chamado velho e esquecido de voltar a notificar no dia em
--     que o expurgo apagar o registro antigo.
-- ---------------------------------------------------------------------
CREATE FUNCTION varrer_prazos(
  p_janela              interval,
  p_espera              interval,
  p_tentativas_maximas  integer,
  p_teto                integer,
  p_retencao            interval
)
RETURNS TABLE (
  notificacao_id  uuid,
  organizacao_id  uuid,
  aparelho_id     uuid,
  ficha           text,
  plataforma      text,
  ocorrencia_id   uuid,
  protocolo       text,
  endereco        text,
  severidade      text,
  prazo_em        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Expurgo por idade, na mesma passada. Fica aqui, e nao numa rotina
  -- separada, porque uma rotina separada e uma rotina que ninguem agenda: o
  -- prazo de retencao viraria promessa de documento sem nada que a cumpra.
  DELETE FROM notificacoes_enviadas WHERE enviada_em < now() - p_retencao;

  RETURN QUERY
  WITH alvos AS (
    SELECT DISTINCT
           o.organizacao_id AS org,
           o.id             AS ocorrencia,
           o.protocolo      AS protocolo,
           o.endereco       AS endereco,
           o.severidade     AS severidade,
           o.prazo_em       AS prazo,
           ap.id            AS aparelho,
           ap.ficha         AS ficha,
           ap.plataforma    AS plataforma
      FROM ocorrencias o
      /*
        A equipe RESPONSAVEL HOJE, e conferida a cada varredura.

        E aqui que "quem saiu da equipe para de receber tarefa da equipe"
        acontece de verdade: quem foi realocado, ou desativado, deixa de casar
        com este JOIN na varredura seguinte, sem ninguem precisar lembrar de
        limpar nada.
      */
      JOIN usuarios u
        ON u.organizacao_id = o.organizacao_id
       AND u.equipe_id = o.equipe_id
       AND u.ativo
      JOIN aparelhos ap
        ON ap.organizacao_id = u.organizacao_id
       AND ap.usuario_id = u.id
       AND ap.revogado_em IS NULL
     WHERE o.equipe_id IS NOT NULL
       AND o.prazo_em IS NOT NULL
       AND o.prazo_em > now()
       AND o.prazo_em <= now() + p_janela
       AND o.status NOT IN ('encerrada','rascunho')
     ORDER BY prazo
     -- Teto por varredura. Uma noite de temporal com o banco cheio de prazos
     -- nao pode virar uma rajada de milhares de envios num unico laco: o teto
     -- transforma isso em varias varreduras seguidas, que e o comportamento
     -- que a Apple e o Google esperam de quem envia.
     LIMIT p_teto
  ),
  reivindicadas AS (
    INSERT INTO notificacoes_enviadas
      (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho)
    SELECT org, aparelho, ocorrencia, 'prazo_vencendo', 'enviando' FROM alvos
    /*
      O conflito e apontado pelo NOME da restricao, e nao pela lista de
      colunas. Dentro de plpgsql, uma lista de colunas cujos nomes sao iguais
      aos das colunas de saida declaradas em RETURNS TABLE e exatamente o
      terreno em que o interpretador confunde variavel com coluna. Pelo nome da
      restricao nao ha o que confundir.
    */
    ON CONFLICT ON CONSTRAINT notificacao_unica_por_aparelho DO UPDATE
       SET desfecho   = 'enviando',
           enviada_em = now(),
           tentativas = notificacoes_enviadas.tentativas + 1,
           detalhe    = NULL
     /*
       Quando reenviar, e quando nunca reenviar.

       `entregue` e `ficha_invalida` estao fora: o primeiro ja chegou, e mandar
       de novo e o defeito que esta tabela existe para impedir; o segundo tem
       aparelho morto do outro lado.

       Sobram `enviando` (o processo caiu no meio) e `falha` (a Apple ou o
       Google recusou naquele instante). Os dois voltam depois da espera, ate o
       teto de tentativas. Sem o teto, um aparelho quebrado vira uma tentativa
       por varredura, para sempre.
     */
     WHERE notificacoes_enviadas.desfecho NOT IN ('entregue','ficha_invalida')
       AND notificacoes_enviadas.enviada_em < now() - p_espera
       AND notificacoes_enviadas.tentativas < p_tentativas_maximas
    RETURNING id, notificacoes_enviadas.organizacao_id,
              notificacoes_enviadas.aparelho_id, notificacoes_enviadas.ocorrencia_id
  )
  SELECT r.id, r.organizacao_id, r.aparelho_id,
         a.ficha, a.plataforma, r.ocorrencia_id,
         a.protocolo, a.endereco, a.severidade, a.prazo
    FROM reivindicadas r
    JOIN alvos a ON a.aparelho = r.aparelho_id AND a.ocorrencia = r.ocorrencia_id;
END;
$$;

-- A funcao e a unica porta, entao PUBLIC nao a executa. Mesma regra da
-- migracao 002.
REVOKE ALL ON FUNCTION varrer_prazos(interval, interval, integer, integer, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION varrer_prazos(interval, interval, integer, integer, interval) TO dc360_app;
