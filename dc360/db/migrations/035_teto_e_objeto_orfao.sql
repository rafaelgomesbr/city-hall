-- =====================================================================
-- 035: o teto de armazenamento por municipio, e o objeto orfao.
--
-- OS NUMEROS QUE EXPLICAM ESTA MIGRACAO, medidos na producao:
--
--   O BANCO NAO CRESCE. Uma ocorrencia com vida completa (registro, triagem,
--   despacho, vistoria, laudo, providencias, trilha) custa cerca de 8 KB. Um
--   municipio com 2.000 atendimentos por ano gasta 16 MB por ano. Em dez anos
--   de contrato isso e um pendrive.
--
--   O QUE CRESCE SAO AS FOTOGRAFIAS, e elas nao estao aqui: vao para
--   armazenamento de objeto. Seis fotos de 2 MB por vistoria dao 12 MB por
--   vistoria, e os mesmos 2.000 atendimentos viram cerca de 24 GB por ano.
--   Tres ordens de grandeza acima do banco.
--
-- Duas ausencias nasciam disso, e as duas sao resolvidas aqui.
--
-- =====================================================================
-- 1. NAO HAVIA TETO POR MUNICIPIO.
--
-- Um municipio podia consumir sem limite, e a fatura e do fornecedor. Nao ha
-- malicia nenhuma no caminho que produz isso: um temporal de tres dias com
-- quarenta vistorias por dia, cameras melhores no aparelho novo, e a conta do
-- mes dobra sem ninguem ter feito nada errado.
--
-- DE QUEM E A DECISAO DO NUMERO, e aqui esta o INVERSO da migracao 021.
--
-- O prazo de retencao e do MUNICIPIO, porque o municipio e o CONTROLADOR do
-- dado: escolher por ele o dia em que um dado de cidadao e destruido seria o
-- operador decidindo no lugar do controlador. O teto de armazenamento e do
-- FORNECEDOR, porque a fatura e dele: um teto que o proprio limitado levanta
-- nao e teto, e um municipio que pudesse levanta-lo levantaria, com razao,
-- toda vez que a foto de uma vistoria fosse recusada.
--
-- Por isso a coluna fica em `organizacoes` (por municipio, como o contrato) e
-- `dc360_app` NAO recebe UPDATE nela. Quem a escreve e o operador da
-- plataforma, com a credencial de dono, pela mesma porta que provisiona
-- municipio e aplica migracao. Nenhuma rota do produto tem como toca-la, nem
-- hoje nem na rota que alguem escrever no ano que vem.
--
-- NULO E O PADRAO, e quer dizer "sem teto". E o estado de todos os municipios
-- no dia em que isto entra: ninguem acorda com o balde fechado por causa de
-- uma migracao.
--
-- =====================================================================
-- 2. NAO HAVIA VARREDURA DE OBJETO ORFAO.
--
-- Foto que subiu e cujo envelope nunca chegou fica no armazenamento para
-- sempre. Isso e custo, e e coisa pior que custo: e imagem do imovel de um
-- cidadao guardada sem nenhum registro que a justifique, ou seja, dado pessoal
-- sem finalidade, exatamente o que a minimizacao da migracao 021 existe para
-- impedir do outro lado da parede.
--
-- O QUE UM ORFAO NAO E: "objeto que nao esta na tabela agora". As fotos sobem
-- ANTES do envelope da vistoria, de proposito, para o laudo nunca apontar para
-- arquivo que nao existe. Existe portanto uma janela LEGITIMA em que o objeto
-- ja esta la e o registro ainda nao fechou, e ela pode durar dias: o agente
-- coleta no morro sem sinal, o aparelho guarda, e o envio sai quando a rede
-- volta. Uma varredura ingenua apagaria a foto da vistoria que esta
-- acontecendo agora.
--
-- A janela de graca mora no codigo da varredura (`orfaos.ts`), esta escrita
-- la, e e de trinta dias. O criterio, dito por extenso: o objeto so entra na
-- lista quando esta no armazenamento ha mais de trinta dias E o municipio dono
-- do prefixo nao tem nenhuma linha viva de evidencia apontando para ele.
--
-- E A VARREDURA NAO APAGA. Ela escreve nesta tabela e relata. O argumento
-- inteiro esta em `docs/ARMAZENAMENTO.md`; o resumo e que apagar e
-- irreversivel, que todo modo conhecido de o criterio errar (listagem
-- incompleta, restauracao de copia, defeito no prefixo, municipio ilegivel)
-- erra para o mesmo lado, e que guardar um orfao um mes a mais custa centavos
-- enquanto apagar uma fotografia de interdicao custa um ato administrativo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- O teto, por municipio
-- ---------------------------------------------------------------------
ALTER TABLE organizacoes
  ADD COLUMN IF NOT EXISTS teto_armazenamento_bytes bigint;

/*
  Faixa de sanidade, e nao politica, como em 021.

  O piso de 1 GB existe porque um teto menor que isso e menor que uma semana de
  temporal: ele nao limitaria custo, produziria recusa de foto no primeiro dia
  de chuva. O teto de 100 TB existe para dedo escorregando em campo numerico
  nao fixar um numero que nunca seria atingido e faria a coluna parecer
  configurada quando na pratica esta desligada.
*/
ALTER TABLE organizacoes
  DROP CONSTRAINT IF EXISTS teto_de_armazenamento_plausivel,
  ADD CONSTRAINT teto_de_armazenamento_plausivel CHECK (
    teto_armazenamento_bytes IS NULL
    OR teto_armazenamento_bytes BETWEEN 1073741824 AND 109951162777600
  );

COMMENT ON COLUMN organizacoes.teto_armazenamento_bytes IS
  'Teto de armazenamento de evidencia fotografica deste municipio, em bytes. '
  'Decisao do FORNECEDOR e nao do municipio, porque a fatura e do fornecedor: '
  'o papel de aplicacao e impedido de escrever aqui por gatilho. NULO significa '
  'sem teto, que e o estado de quem ainda nao tem numero no contrato.';

/*
  QUEM NAO PODE MEXER NO PROPRIO TETO, imposto pelo banco.

  `dc360_app` tem UPDATE em `organizacoes` desde a migracao 001, porque o
  administrador do municipio edita nome, UF e os prazos de retencao. Esta coluna
  precisa ficar de fora, e a garantia nao pode ser "nenhuma rota expoe o campo":
  a rota que expoe por engano e escrita daqui a um ano, por quem nao leu esta
  migracao, e nada quebra.

  POR QUE GATILHO E NAO PRIVILEGIO DE COLUNA. Tirar o UPDATE da tabela e
  devolve-lo coluna a coluna funcionaria hoje e quebraria amanha: toda coluna
  nova de `organizacoes` nasceria sem concessao, e o sintoma seria uma rota de
  outra frente falhando com erro de permissao sem nenhuma relacao aparente com
  armazenamento. O gatilho nomeia exatamente a coluna que ele protege.
*/
CREATE OR REPLACE FUNCTION teto_e_do_fornecedor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.teto_armazenamento_bytes IS DISTINCT FROM OLD.teto_armazenamento_bytes
     AND current_user = 'dc360_app' THEN
    RAISE EXCEPTION
      'o teto de armazenamento e do contrato, e nao se altera pela aplicacao'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teto_nao_se_altera_pela_aplicacao ON organizacoes;
CREATE TRIGGER teto_nao_se_altera_pela_aplicacao
  BEFORE UPDATE ON organizacoes
  FOR EACH ROW EXECUTE FUNCTION teto_e_do_fornecedor();

-- ---------------------------------------------------------------------
-- Quando a autorizacao nasceu, e quando ela foi dada por perdida
-- ---------------------------------------------------------------------

/*
  `autorizada_em` nao existia, e sem ela nao ha como medir a janela de graca.

  `capturada_em` vem do relogio do APARELHO e tem doze horas de folga de
  proposito (migracao 024): relogio trocado e fuso errado sao rotina em campo.
  Medir prazo de descarte por ela deixaria a decisao de apagar uma fotografia
  dependendo do relogio de um telefone. Esta coluna e do relogio do SERVIDOR,
  como `enviada_em`.

  O padrao carimba `now()` nas linhas que ja existem, e a direcao disso e a
  segura: toda evidencia anterior a esta migracao nasce com idade zero, ou seja,
  NENHUMA delas pode ser listada como orfa nos trinta dias seguintes a
  implantacao. O preco e uma espera de um mes; a alternativa (inventar uma data
  antiga) faria a primeira varredura propor o descarte do historico inteiro.
*/
ALTER TABLE evidencias
  ADD COLUMN IF NOT EXISTS autorizada_em timestamptz NOT NULL DEFAULT now();

/*
  A RESERVA QUE NUNCA VIROU BYTE.

  O outro lado do orfao, e ele nao custa armazenamento: a linha que autorizou um
  envio que nunca aconteceu. Ela nao e lixo no balde, e RESERVA no teto, porque
  `tamanho_bytes` ja foi declarado na autorizacao e ja conta. Sem marcar essas
  linhas, um municipio que perdeu cem envios por sinal ruim ficaria devendo cem
  fotografias que nao existem em lugar nenhum.

  MARCAR, E NAO APAGAR, pela regra do produto: registro nao se apaga, se encerra
  com motivo. A linha continua, com a data e o motivo, e a autorizacao pode
  ressuscitar se o mesmo envio for retomado com a mesma chave de idempotencia,
  que e o que a rota faz.
*/
ALTER TABLE evidencias
  ADD COLUMN IF NOT EXISTS abandonada_em     timestamptz,
  ADD COLUMN IF NOT EXISTS abandono_motivo   text;

/*
  Evidencia CONFIRMADA nunca e abandonada.

  Confirmada quer dizer que o servidor perguntou ao armazenamento, o objeto
  estava la e o tamanho batia: e prova entregue, e aparece no laudo. Sem esta
  restricao, um defeito na varredura poderia tirar do teto (e da conta de
  auditoria) uma fotografia que esta impressa num termo de interdicao.
*/
ALTER TABLE evidencias
  DROP CONSTRAINT IF EXISTS abandono_so_antes_do_envio,
  ADD CONSTRAINT abandono_so_antes_do_envio CHECK (
    abandonada_em IS NULL OR enviada_em IS NULL
  );

ALTER TABLE evidencias
  DROP CONSTRAINT IF EXISTS abandono_tem_motivo,
  ADD CONSTRAINT abandono_tem_motivo CHECK (
    abandonada_em IS NULL
    OR (abandono_motivo IS NOT NULL AND length(trim(abandono_motivo)) BETWEEN 1 AND 300)
  );

COMMENT ON COLUMN evidencias.autorizada_em IS
  'Relogio do SERVIDOR no instante da autorizacao de envio. E por ela que a '
  'janela de graca da varredura de orfao e medida, e nunca por capturada_em, '
  'que vem do relogio do aparelho.';

COMMENT ON COLUMN evidencias.abandonada_em IS
  'Autorizacao dada por perdida: o arquivo nunca chegou e o prazo passou. Para '
  'de consumir o teto do municipio. A linha permanece, com motivo.';

/*
  O indice da conta do teto.

  A pergunta e "quanto este municipio esta ocupando", feita a cada autorizacao
  de envio, ou seja, seis vezes por vistoria. `INCLUDE (tamanho_bytes)` permite
  responder so pelo indice, e o filtro parcial tira do caminho justamente as
  linhas que nao contam.
*/
CREATE INDEX IF NOT EXISTS evidencias_uso_idx
  ON evidencias (organizacao_id) INCLUDE (tamanho_bytes)
  WHERE abandonada_em IS NULL;

-- A varredura pergunta por chave, dentro do municipio.
CREATE INDEX IF NOT EXISTS evidencias_chave_viva_idx
  ON evidencias (organizacao_id, chave_storage)
  WHERE abandonada_em IS NULL;

-- ---------------------------------------------------------------------
-- A conta, e a decisao sobre ela, num lugar so
-- ---------------------------------------------------------------------

/*
  UMA funcao, e nao um numero repetido na rota e no gatilho.

  A rota precisa do numero para responder 507 com frase util, e o gatilho
  precisa da mesma decisao para a regra nao morar so na rota. Se cada um
  calculasse por conta propria, a divergencia apareceria como "a rota deixou
  passar e o banco recusou", em producao, com o agente na chuva.

  SECURITY INVOKER (o padrao, dito aqui porque importa): ela roda com o
  contexto e os privilegios de quem chama, entao a soma enxerga apenas as
  linhas daquele municipio, por RLS. Nao ha erro de clausula capaz de somar o
  balde do vizinho, porque as linhas do vizinho nao estao la para serem
  somadas. E o orcamento de funcoes SECURITY DEFINER deste produto esta em
  quinze de quinze, com o portao CA-06 reprovando a decima sexta: gastar a
  proxima aqui seria abrir buraco permanente no isolamento para responder uma
  soma.

  O QUE CADA SITUACAO QUER DIZER:

    sem_teto        o contrato nao fixou numero. Nada muda para ninguem.
    normal          abaixo do limiar de aviso.
    aviso           passou de 80% do teto. A rota avisa, e NAO recusa: quem
                    precisa agir e quem renegocia contrato, e ele esta na mesa
                    e nao no morro.
    acima_do_teto   passou de 100%. Continua NAO recusando. O teto contratado e
                    freio de mao: ele acende o aviso e entra no relatorio, e nao
                    arranca a vistoria da mao de quem ja subiu o barranco.
    recusado        passou da margem. Ai sim a autorizacao e negada, e a rota
                    responde com um status que a fila do aparelho trata como
                    TEMPORARIO, para a coleta sobreviver no aparelho e drenar
                    sozinha quando o teto for ampliado.

  A MARGEM E DE 50%, e o numero e uma escolha explicita. Ela existe para o
  balde nao virar infinito por omissao de quem devia ter renegociado, e precisa
  ser larga o bastante para cobrir o evento que justifica o estouro: uma semana
  de temporal com o dobro das vistorias de um mes normal. Metade do teto cobre
  isso com folga em qualquer contrato que nao esteja ja estourado no dia da
  assinatura.
*/
CREATE OR REPLACE FUNCTION situacao_de_armazenamento(bytes_novos bigint DEFAULT 0)
RETURNS TABLE (
  bytes_usados bigint,
  teto_bytes   bigint,
  margem_bytes bigint,
  situacao     text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH conta AS (
    SELECT
      (SELECT coalesce(sum(e.tamanho_bytes), 0)::bigint
         FROM evidencias e
        WHERE e.abandonada_em IS NULL) + greatest(coalesce(bytes_novos, 0), 0) AS usados,
      (SELECT o.teto_armazenamento_bytes
         FROM organizacoes o
        WHERE o.id = app_organizacao_atual()) AS teto
  )
  SELECT
    conta.usados,
    conta.teto,
    (conta.teto * 3) / 2,
    CASE
      WHEN conta.teto IS NULL              THEN 'sem_teto'
      WHEN conta.usados > (conta.teto * 3) / 2 THEN 'recusado'
      WHEN conta.usados > conta.teto       THEN 'acima_do_teto'
      WHEN conta.usados * 10 >= conta.teto * 8 THEN 'aviso'
      ELSE 'normal'
    END
  FROM conta;
$$;

/*
  O padrao do Postgres para funcao e EXECUTE para PUBLIC, e PUBLIC alcanca
  tambem o papel do console. Esta funcao e SECURITY INVOKER, entao PUBLIC nao
  ganharia privilegio nenhum por ela (ela some as linhas que quem chama JA pode
  ler, e o console nao pode ler `evidencias`). Mesmo assim o REVOKE entra, pela
  mesma higiene da migracao 026: a diferenca entre "nao abre buraco" e "nao
  aparece na lista de quem pode o que" e o que separa uma varredura de catalogo
  legivel de uma cheia de excecoes que alguem precisa lembrar de explicar.
*/
REVOKE ALL ON FUNCTION situacao_de_armazenamento(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION situacao_de_armazenamento(bigint) TO dc360_app;

COMMENT ON FUNCTION situacao_de_armazenamento(bigint) IS
  'Quanto este municipio ocupa, qual o teto do contrato e o que fazer a '
  'respeito. SECURITY INVOKER: soma debaixo do RLS de quem chama.';

/*
  O gatilho, que e a segunda barreira.

  A rota confere ANTES para poder responder com frase util e com o status certo.
  Este gatilho existe para a regra nao morar so na rota: qualquer caminho novo
  que escreva em `evidencias` nasce debaixo do mesmo teto, inclusive um script
  de importacao escrito as duas da manha.

  SQLSTATE 53100 e `disk_full` do proprio Postgres. Usar o codigo padrao em vez
  de inventar um faz o erro dizer a verdade para qualquer ferramenta que o leia.
*/
CREATE OR REPLACE FUNCTION evidencia_cabe_no_teto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  s text;
BEGIN
  SELECT situacao INTO s
    FROM situacao_de_armazenamento(coalesce(NEW.tamanho_bytes, 0));

  IF s = 'recusado' THEN
    RAISE EXCEPTION
      'armazenamento do municipio acima do teto contratado e da margem'
      USING ERRCODE = '53100';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidencia_dentro_do_teto ON evidencias;
CREATE TRIGGER evidencia_dentro_do_teto
  BEFORE INSERT ON evidencias
  FOR EACH ROW EXECUTE FUNCTION evidencia_cabe_no_teto();

-- ---------------------------------------------------------------------
-- A lista de objetos orfaos
-- ---------------------------------------------------------------------

/*
  Unicidade que faltava em `evidencias` para a chave estrangeira composta
  abaixo. Redundante com a chave primaria, e essa redundancia e o preco da
  garantia de que pai e filho sao do mesmo municipio (ver migracao 008).
*/
ALTER TABLE evidencias
  DROP CONSTRAINT IF EXISTS evidencias_org_id_unico,
  ADD CONSTRAINT evidencias_org_id_unico UNIQUE (organizacao_id, id);

CREATE TABLE objetos_orfaos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,

  /*
    A rodada que encontrou este objeto.

    Agrupar por rodada e o que torna o descarte um ato sobre uma LISTA
    CONFERIDA, e nao sobre "tudo que estiver marcado agora". Quem autoriza o
    descarte autoriza aquela lista, do dia em que ela foi lida; um objeto que
    entrou na lista depois disso nao esta coberto pela autorizacao e nao e
    tocado.
  */
  varredura_id    uuid NOT NULL,

  chave           text NOT NULL,
  tamanho_bytes   bigint NOT NULL CHECK (tamanho_bytes >= 0),

  /* Do armazenamento, quando ele sabe dizer. E a idade do objeto no balde. */
  modificado_em   timestamptz,

  especie         text NOT NULL CHECK (especie IN (
                    -- Existe linha de evidencia para esta chave, ela nunca foi
                    -- confirmada, e o prazo passou. E o caso comum: o PUT
                    -- chegou e a confirmacao nao.
                    'envio_nunca_confirmado',
                    -- Nao existe linha nenhuma. Nao deveria acontecer, e e
                    -- justamente por isso que ele e relatado em vez de
                    -- resolvido em silencio.
                    'objeto_sem_linha'
                  )),

  evidencia_id    uuid,

  visto_em        timestamptz NOT NULL DEFAULT now(),

  /*
    A DECISAO, que e de gente e nunca da varredura.

    Enquanto estas colunas estao nulas o objeto esta listado e intacto. Elas so
    sao escritas pelo caminho de descarte, que exige operador nomeado e motivo.
  */
  decidido_em     timestamptz,
  decidido_por    text,
  decisao         text CHECK (decisao IN ('descartado','mantido')),
  decisao_motivo  text,

  CONSTRAINT decisao_tem_autor_e_motivo CHECK (
    decidido_em IS NULL
    OR (
      decisao IS NOT NULL
      AND decidido_por IS NOT NULL AND length(trim(decidido_por)) BETWEEN 1 AND 200
      AND decisao_motivo IS NOT NULL AND length(trim(decisao_motivo)) BETWEEN 1 AND 500
    )
  ),

  /*
    A chave precisa ser do municipio da linha, pela mesma razao que a restricao
    de `evidencias`: a chave carrega o prefixo do tenant, e uma linha de orfao
    apontando para o prefixo de outra prefeitura seria uma lista de descarte
    capaz de apagar o balde do vizinho.
  */
  CONSTRAINT orfao_com_prefixo_do_tenant CHECK (
    chave LIKE ('tenant/' || organizacao_id::text || '/%')
  ),

  CONSTRAINT orfao_evidencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, evidencia_id)
    REFERENCES evidencias (organizacao_id, id) ON DELETE RESTRICT
);

/* Uma linha por objeto por rodada: relistar nao duplica a lista. */
CREATE UNIQUE INDEX objetos_orfaos_unico
  ON objetos_orfaos (organizacao_id, varredura_id, chave);

/* A pergunta do descarte: o que esta nesta rodada e ainda nao foi decidido. */
CREATE INDEX objetos_orfaos_a_decidir_idx
  ON objetos_orfaos (organizacao_id, varredura_id)
  WHERE decidido_em IS NULL;

ALTER TABLE objetos_orfaos ENABLE ROW LEVEL SECURITY;
ALTER TABLE objetos_orfaos FORCE ROW LEVEL SECURITY;

/*
  COMANDO A COMANDO, e nao `FOR ALL`.

  `CREATE POLICY` sem clausula `FOR` vale `FOR ALL`, ou seja, autoriza tambem
  DELETE, e aí a unica barreira contra apagar a lista passa a ser a ausencia de
  concessao: UMA barreira em vez de duas. Foi o defeito que as migracoes 032,
  033 e 034 corrigiram em vinte tabelas, e esta nasceu com ele no mesmo dia.

  Aqui doi de um jeito proprio: esta tabela e a MEMORIA de que um arquivo foi
  declarado sem dono e descartado, com o nome de quem autorizou e o motivo
  escrito. Apagar a linha apaga o registro do descarte, e sobra um arquivo que
  sumiu sem ninguem ter respondido por isso.

  O UPDATE fica, e e por coluna (ver a concessao mais abaixo): a decisao sobre
  cada objeto e escrita depois da varredura, que e o ponto inteiro da tabela.
*/
CREATE POLICY objetos_orfaos_leitura ON objetos_orfaos
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY objetos_orfaos_insercao ON objetos_orfaos
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY objetos_orfaos_atualizacao ON objetos_orfaos
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  UPDATE POR COLUNA, e a lista de colunas e a regra.

  O que pode mudar depois de gravado e so o bloco da decisao. O que o objeto
  era, de que tamanho, de que especie e quando foi visto nao muda nunca: sem
  privilegio de coluna, um caminho novo poderia reescrever a especie de um
  objeto listado e fazer uma foto em uso parecer lixo.

  SEM DELETE, em lugar nenhum: nao ha policy e nao ha concessao, e as duas
  ausencias negam. A lista de objetos que alguem propos apagar e ela propria
  prova de um ato, e apagar a prova do descarte seria a unica coisa pior que o
  descarte errado.
*/
GRANT SELECT, INSERT ON objetos_orfaos TO dc360_app;
GRANT UPDATE (decidido_em, decidido_por, decisao, decisao_motivo)
  ON objetos_orfaos TO dc360_app;

COMMENT ON TABLE objetos_orfaos IS
  'Objetos do armazenamento que nenhum registro vivo justifica, propostos para '
  'descarte. A varredura apenas escreve aqui: ela nao apaga nada. O descarte e '
  'ato deliberado de operador da plataforma, com nome e motivo.';
