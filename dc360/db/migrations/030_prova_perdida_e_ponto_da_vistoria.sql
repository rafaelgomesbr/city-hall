-- =====================================================================
-- 030: a prova que se perdeu antes de subir, e o ponto onde o agente esteve.
--
-- Duas coisas que o aparelho sabia e o banco nao tinha onde guardar. Elas
-- entram na mesma migracao porque saem da mesma coleta e do mesmo envelope.
--
-- -------------------------------------------------------------------
-- PARTE 1: A FOTO QUE O SISTEMA OPERACIONAL APAGOU
-- -------------------------------------------------------------------
--
-- As fotos sobem ANTES do envelope, de proposito: o laudo nao pode apontar
-- para arquivo que ainda nao existe. A consequencia era real e nao
-- hipotetica: se o sistema operacional apagou um arquivo do cache (e cache e,
-- por definicao, o que ele apaga sozinho quando o armazenamento aperta), a
-- leitura dos bytes falhava e o ENVELOPE INTEIRO nunca saia. Checklist, GPS,
-- assinatura, observacoes, orgaos a acionar: uma manha de trabalho no morro
-- destruida porque o iPhone liberou espaco.
--
-- A saida NAO podia ser subir calado sem a foto. Um laudo que parece completo
-- e nao e, e pior do que um laudo que nao sai: quem le um registro fotografico
-- com tres fotos nao tem como saber que havia cinco. Entao a coleta passa a
-- subir, e a PERDA sobe declarada, vira linha no laudo e evento na trilha.
--
-- POR QUE UMA TABELA, e nao um jsonb dentro da vistoria: mesma razao da
-- migracao 020. A pergunta que este dado existe para responder e uma lista
-- ("quais vistorias deste municipio entraram com prova faltando", "isto esta
-- acontecendo em qual aparelho"), e ela nao sai de dentro de JSON sem alguem
-- escrever consulta que ninguem revisa. E ela e a pergunta de quem decide
-- trocar o aparelho do plantao.
--
-- POR QUE SEM UPDATE E SEM DELETE: mesma razao dos orgaos indicados. Isto e
-- coleta de campo, e declaracao de prova ausente num documento oficial. Nao se
-- corrige reescrevendo o que o agente declarou; corrige-se com vistoria nova.
--
-- -------------------------------------------------------------------
-- PARTE 2: ONDE O AGENTE REALMENTE ESTEVE
-- -------------------------------------------------------------------
--
-- O aparelho capturava a coordenada da vistoria e guardava so para si: do
-- envelope subia apenas `gps_precisao_metros`, ou seja, a QUALIDADE de uma
-- medida cujo VALOR ficava no celular, e o ponto viajava apenas como metadado
-- de cada foto.
--
-- Isso importa porque o alfinete que o operador colou durante a ligacao, com o
-- telefone no ombro, e o ponto onde o imovel esta divergem o tempo todo, e o
-- agente e a fonte mais confiavel dessa informacao e era o unico que nao
-- conseguia reporta-la.
--
-- A coluna e da VISTORIA e nao da ocorrencia, e essa e a decisao inteira:
-- gravar onde o agente esteve e um fato daquela ida; mudar o ponto da
-- ocorrencia e outro ato, com motivo escrito e evento proprio
-- (`correcao_de_coordenada`). Ver o comentario da rota de sincronizacao.
--
-- -------------------------------------------------------------------
-- PARTE 3: O TETO DE SEIS CASAS DECIMAIS, AGORA NO BANCO
-- -------------------------------------------------------------------
--
-- O teto existia no painel (que arredondava o texto colado) e no esquema da
-- correcao de coordenada. Toda outra porta gravava o que viesse, e o caminho
-- do aparelho e justamente o que devolve os quinze digitos do `Number`: o GPS
-- do celular entrega `-22.41038299999999`. A MESMA COLUNA guardava seis casas
-- quando o dado vinha do painel e quinze quando vinha do morro, e as duas
-- telas mostravam aparencias de precisao diferentes para o mesmo tipo de dado,
-- o que sugere que uma das duas foi medida melhor.
--
-- Seis casas sao cerca de dez centimetros, mais fino do que qualquer GPS de
-- celular acerta debaixo de chuva. Os digitos seguintes sao resto binario, e
-- imprimi-los num laudo com brasao convida quem le a confiar em digito que
-- nunca mediu nada.
--
-- O CHECK mora aqui, e nao so no Zod, pela regra de sempre deste produto:
-- validacao que so existe no esquema da aplicacao e validacao que a proxima
-- rota esquece. As linhas que ja estao no banco sao arredondadas antes, senao
-- a restricao nao entra; o deslocamento maximo e de dez centimetros, e ele
-- acontece dentro da margem de erro do proprio aparelho que mediu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 2: o ponto da vistoria
-- ---------------------------------------------------------------------
ALTER TABLE vistorias ADD COLUMN latitude  double precision;
ALTER TABLE vistorias ADD COLUMN longitude double precision;

/*
  A faixa, e ela nao e preciosismo de tipo. `double precision` nao sabe o que e
  um meridiano: latitude 190 entraria em silencio e so apareceria como um pino
  no meio do nada, meses depois, num mapa que ninguem confere.
*/
ALTER TABLE vistorias ADD CONSTRAINT vistoria_coordenada_na_faixa CHECK (
  (latitude  IS NULL OR (latitude  >= -90  AND latitude  <= 90))
  AND
  (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

/*
  Latitude sem longitude nao e meio ponto, e meio dado: ele nao desenha nada no
  mapa e nao diz nada no laudo, e existir permitiria a uma rota gravar metade e
  ninguem perceber ate alguem procurar o pino.
*/
ALTER TABLE vistorias ADD CONSTRAINT vistoria_coordenada_inteira CHECK (
  (latitude IS NULL) = (longitude IS NULL)
);

-- ---------------------------------------------------------------------
-- Parte 1: a prova capturada que nao pode ser recuperada do aparelho
-- ---------------------------------------------------------------------
CREATE TABLE vistoria_evidencias_perdidas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  vistoria_id     uuid NOT NULL,

  /*
    A chave que o aparelho cunhou para o arquivo na captura. E o NOME do que se
    perdeu: sem ela, dois envios da mesma coleta contariam a mesma perda duas
    vezes, e nada distinguiria "perdi a foto 2" de "perdi outra foto".

    `text` e nao `uuid` porque a assinatura usa `<chave-da-coleta>-assinatura`,
    que e a forma ja gravada em aparelho hoje. Exigir uuid aqui recusaria
    justamente a perda da assinatura, que e a mais grave das duas.
  */
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),

  /*
    Fotografia ou assinatura. A distincao nao e catalogacao: quando o arquivo
    que some e o traco da moradora, `assinatura_chave` chega nula e o laudo
    imprime uma LINHA DE ASSINATURA EM BRANCO, indistinguivel de uma vistoria
    em que ninguem assinou. Sem esta coluna, a lacuna mais grave do documento
    seria a unica que ele nao saberia nomear.
  */
  papel           text NOT NULL CHECK (papel IN ('foto', 'assinatura')),

  /*
    Prova que o registro EXISTIU e quando. E o que permite a quem le o laudo
    daqui a um ano dizer "havia uma fotografia das 09:42 e ela nao esta aqui",
    em vez de supor que o agente nao fotografou.
  */
  capturada_em    timestamptz NOT NULL,

  /*
    O metadado que SOBREVIVEU ao arquivo: legenda e coordenada vivem no
    rascunho e na fila, nao dentro da imagem. E a diferenca entre o laudo dizer
    "uma fotografia se perdeu" e dizer "a fotografia da trinca na parede dos
    fundos, capturada naquele ponto, se perdeu". Jogar fora o que restou por
    ser pouco seria destruir a unica coisa que ainda da para conferir em campo.
  */
  legenda         text,
  latitude        double precision,
  longitude       double precision,

  /* A ordem em que a captura aconteceu, para o laudo listar as perdas na mesma
     sequencia do registro fotografico. */
  ordem           integer NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vistoria_evidencias_perdidas_org_id_unico UNIQUE (organizacao_id, id),

  /*
    Chave estrangeira COMPOSTA, pela razao das migracoes 008, 017 e 020, que
    nao envelhece: Row Level Security governa SELECT, INSERT, UPDATE e DELETE,
    e NAO governa a verificacao de chave estrangeira. Uma chave simples
    deixaria uma perda de Serra Alta pendurada numa vistoria de Vale Fundo, e o
    INSERT que passa quando o identificador existe la e falha quando nao existe
    e um oraculo de existencia sobre o banco do vizinho.
  */
  CONSTRAINT perda_vistoria_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, vistoria_id)
    REFERENCES vistorias (organizacao_id, id) ON DELETE CASCADE,

  /*
    A mesma perda nao entra duas vezes na mesma vistoria.

    Sem isto, o reenvio do mesmo envelope (que e rotina: o aparelho desiste por
    tempo esgotado e repete) faria o laudo declarar a mesma fotografia perdida
    duas vezes, e a contagem de prova ausente do municipio contar em dobro.
  */
  CONSTRAINT perda_uma_vez_por_vistoria
    UNIQUE (organizacao_id, vistoria_id, idempotency_key),

  CONSTRAINT perda_coordenada_na_faixa CHECK (
    (latitude  IS NULL OR (latitude  >= -90  AND latitude  <= 90))
    AND
    (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
  ),
  CONSTRAINT perda_coordenada_inteira CHECK (
    (latitude IS NULL) = (longitude IS NULL)
  )
);

CREATE INDEX vistoria_evidencias_perdidas_vistoria_idx
  ON vistoria_evidencias_perdidas (organizacao_id, vistoria_id);

ALTER TABLE vistoria_evidencias_perdidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_evidencias_perdidas FORCE ROW LEVEL SECURITY;

CREATE POLICY vistoria_evidencias_perdidas_isolamento ON vistoria_evidencias_perdidas
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  SELECT e INSERT, e mais nada, pelo mesmo motivo da trilha e dos orgaos
  indicados. Uma declaracao de prova ausente num documento oficial nao se
  apaga: se ela estiver errada, o caminho e vistoria nova, que e como este
  produto ja trata toda correcao de coleta.
*/
GRANT SELECT, INSERT ON vistoria_evidencias_perdidas TO dc360_app;

-- ---------------------------------------------------------------------
-- Parte 3: o teto de seis casas, nas tres colunas que guardam ponto
-- ---------------------------------------------------------------------

/*
  Arredonda o que ja esta gravado ANTES de criar a restricao.

  Sem isto a migracao falha no primeiro banco que ja tem dado, que inclui a
  producao e o modo local do painel (que persiste em IndexedDB). O deslocamento
  maximo e de dez centimetros, dentro da margem de erro do aparelho que mediu.
*/
UPDATE ocorrencias
   SET latitude  = round(latitude::numeric,  6)::double precision,
       longitude = round(longitude::numeric, 6)::double precision
 WHERE latitude IS NOT NULL OR longitude IS NOT NULL;

UPDATE evidencias
   SET latitude  = round(latitude::numeric,  6)::double precision,
       longitude = round(longitude::numeric, 6)::double precision
 WHERE latitude IS NOT NULL OR longitude IS NOT NULL;

ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencia_coordenada_em_seis_casas CHECK (
  (latitude  IS NULL OR latitude  = round(latitude::numeric,  6)::double precision)
  AND
  (longitude IS NULL OR longitude = round(longitude::numeric, 6)::double precision)
);

ALTER TABLE evidencias ADD CONSTRAINT evidencia_coordenada_em_seis_casas CHECK (
  (latitude  IS NULL OR latitude  = round(latitude::numeric,  6)::double precision)
  AND
  (longitude IS NULL OR longitude = round(longitude::numeric, 6)::double precision)
);

ALTER TABLE vistorias ADD CONSTRAINT vistoria_coordenada_em_seis_casas CHECK (
  (latitude  IS NULL OR latitude  = round(latitude::numeric,  6)::double precision)
  AND
  (longitude IS NULL OR longitude = round(longitude::numeric, 6)::double precision)
);

ALTER TABLE vistoria_evidencias_perdidas
  ADD CONSTRAINT perda_coordenada_em_seis_casas CHECK (
    (latitude  IS NULL OR latitude  = round(latitude::numeric,  6)::double precision)
    AND
    (longitude IS NULL OR longitude = round(longitude::numeric, 6)::double precision)
  );
