-- =====================================================================
-- 017: o catalogo de orgaos, o oficio numerado e o link de uso unico.
--
-- Tres defeitos, e os tres tem a mesma raiz: o produto sabia encaminhar uma
-- providencia e nao sabia dizer PARA QUEM, com que numero, nem provar que a
-- coisa chegou.
--
-- -------------------------------------------------------------------
-- 1. O destino da providencia era texto livre
-- -------------------------------------------------------------------
--
-- `providencias.orgao_destino` nasceu como `text NOT NULL` sem nenhuma
-- amarra. Quem encaminha digita. O efeito ja e visivel em qualquer base com
-- algumas semanas de uso: "Corpo de Bombeiros", "Bombeiros", "CBMSC" e
-- "corpo de bombeiros" sao quatro destinos diferentes para o banco, e nenhum
-- relatorio de "quantas providencias foram para os bombeiros neste semestre"
-- sai certo. E esse relatorio e exatamente o que sustenta a conversa com o
-- prefeito no fim do ano.
--
-- O catalogo resolve isso, e traz junto o que o texto livre nunca teve: o
-- email do orgao, que e o que permite o encaminhamento sair do caderno.
--
-- POR QUE A CHAVE ESTRANGEIRA E COMPOSTA, e por que isso nao e preciosismo:
--
-- Row Level Security governa SELECT, INSERT, UPDATE e DELETE. Ela NAO governa
-- a verificacao de chave estrangeira: o Postgres confere a existencia da linha
-- referenciada com privilegio de sistema, por baixo da policy. Uma chave
-- simples `orgao_id -> orgaos(id)` deixaria uma providencia de Serra Alta
-- apontar para um orgao de Vale Fundo, e o RLS nao veria nada de errado,
-- porque nunca chega a ser consultado. A integridade referencial roda por
-- dentro, e por isso a chave composta `(organizacao_id, orgao_id)` referindo
-- `(organizacao_id, id)` E A UNICA COISA QUE IMPEDE O VAZAMENTO AQUI. Mesma
-- decisao, e mesma razao, da migracao 008.
--
-- A coluna de texto NAO SAI. Ela deixa de ser o destino e passa a ser o
-- registro do que foi escrito na epoca: se alguem renomear o orgao no
-- catalogo depois, o oficio ja emitido continua dizendo o nome que ele
-- realmente levou.
--
-- ORGAO NAO SE APAGA, SE DESATIVA. Ele assina oficio ja emitido e aparece na
-- trilha. Apagar a linha apagaria junto a resposta para "para quem foi este
-- oficio", que e a pergunta de auditoria.
--
-- -------------------------------------------------------------------
-- 2. O oficio nao tinha numero
-- -------------------------------------------------------------------
--
-- Documento oficial sem numeracao propria nao entra em processo
-- administrativo e nao da para cobrar depois ("o oficio 000012/2026 de
-- 14/03"). A sequencia espelha `protocolo_sequencias` e a funcao
-- `proximo_protocolo` da migracao 001, de proposito e pela mesma razao:
-- sequencia GLOBAL vazaria volume entre municipios (a numeracao de um
-- municipio pequeno saltaria de acordo com o movimento do vizinho, e isso e
-- informacao de negocio de outra prefeitura), e gerar o numero na aplicacao
-- abriria corrida entre duas emissoes simultaneas, com DOIS DOCUMENTOS
-- OFICIAIS DIFERENTES CARREGANDO A MESMA IDENTIFICACAO. Aqui a linha da
-- sequencia e travada dentro da transacao que grava o oficio.
--
-- -------------------------------------------------------------------
-- 3. O email levaria o oficio inteiro, e isso e o problema de privacidade
-- -------------------------------------------------------------------
--
-- O oficio carrega o endereco do imovel, o nome de quem pediu socorro e, com
-- frequencia, a descricao da vulnerabilidade social da familia. Email sai do
-- nosso controle no instante em que e entregue: fica na caixa de quem
-- recebeu, no servidor do provedor dele, e em qualquer encaminhamento que ele
-- fizer, para sempre, sem que o municipio consiga revogar nada.
--
-- Entao o email leva o NUMERO, o municipio, o tipo da ocorrencia e um endereco
-- de uso unico. O dado sensivel fica aqui e so aparece para quem abre o link.
--
-- USO UNICO DE VERDADE, e a garantia e do banco, nao da aplicacao: a segunda
-- abertura e recusada por INDICE UNICO PARCIAL sobre a tabela de aberturas,
-- que e append-only. Nao existe "marcar como usado" que a aplicacao possa
-- esquecer de fazer, e nao existe UPDATE que desmarque.
--
-- E isso e o que transforma o vazamento em ALARME: se o link ja tiver sido
-- aberto quando o destinatario legitimo clicar, alguem no caminho abriu antes
-- dele, e as duas pessoas ficam sabendo. Sem uso unico, o mesmo vazamento
-- seria silencioso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catalogo de orgaos, por municipio
-- ---------------------------------------------------------------------
CREATE TABLE orgaos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  nome                text NOT NULL CHECK (length(trim(nome)) > 0),
  sigla               text CHECK (sigla IS NULL OR length(trim(sigla)) > 0),

  -- O email e opcional porque orgao existe antes de alguem descobrir o
  -- endereco certo, e uma providencia encaminhada por telefone continua
  -- valendo. Sem email, o oficio e emitido e impresso, e o envio recusa.
  email               text,
  telefone            text,

  ativo               boolean NOT NULL DEFAULT true,
  desativado_em       timestamptz,
  motivo_desativacao  text,
  criado_em           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orgaos_org_id_unico UNIQUE (organizacao_id, id),

  /*
    Desativar sem motivo e desativar sem ninguem conseguir explicar depois por
    que aquele orgao sumiu da lista de destinos. Mesma regra do encerramento
    de ocorrencia e da revogacao de aparelho.
  */
  CONSTRAINT desativacao_de_orgao_exige_motivo CHECK (
    ativo
    OR (motivo_desativacao IS NOT NULL AND length(trim(motivo_desativacao)) > 0)
  ),

  /*
    A situacao e a data andam juntas. Sem isto, `ativo = false` com
    `desativado_em` nulo produz um orgao desativado sem data, e "desde quando
    este orgao parou de receber oficio" vira pergunta sem resposta.
  */
  CONSTRAINT situacao_do_orgao_coerente CHECK (ativo = (desativado_em IS NULL)),

  /*
    Peneira grossa de proposito: recusa o que nao pode ser endereco de email
    (sem arroba, com espaco, sem ponto no dominio) e nao tenta validar o resto.
    A validacao completa de email nao existe, e a que importa aqui e a lista
    fechada de dominios do envio, mais abaixo.
  */
  CONSTRAINT orgao_email_plausivel CHECK (
    email IS NULL
    OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

/*
  Unicidade INSENSIVEL A CAIXA E A ESPACO, e e ela que faz o catalogo valer
  alguma coisa.

  `UNIQUE (organizacao_id, nome)` deixaria "Corpo de Bombeiros" e
  "corpo de bombeiros " conviverem, que e metade do defeito que esta migracao
  existe para consertar.
*/
CREATE UNIQUE INDEX orgaos_nome_unico_no_municipio
  ON orgaos (organizacao_id, lower(trim(nome)));

CREATE UNIQUE INDEX orgaos_sigla_unica_no_municipio
  ON orgaos (organizacao_id, upper(trim(sigla)))
  WHERE sigla IS NOT NULL;

CREATE INDEX orgaos_ativos_idx ON orgaos (organizacao_id) WHERE ativo;

ALTER TABLE orgaos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgaos FORCE ROW LEVEL SECURITY;

CREATE POLICY orgaos_isolamento ON orgaos
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

COMMENT ON TABLE orgaos IS
  'Destinos de providencia do municipio. Nao se apaga, se desativa com motivo: '
  'o orgao aparece em oficio ja emitido e na trilha.';

-- ---------------------------------------------------------------------
-- Providencias passam a apontar para o catalogo
-- ---------------------------------------------------------------------
ALTER TABLE providencias ADD COLUMN orgao_id uuid;

/*
  Migracao do texto livre que ja existe, um orgao por municipio.

  `DISTINCT ON` com a chave em minusculas e sem espaco nas pontas junta
  "Bombeiros" e "bombeiros " numa linha so. O `ORDER BY` decide qual grafia
  fica no catalogo, e escolhe a primeira em ordem alfabetica: qualquer criterio
  aqui e arbitrario, entao o que importa e ser DETERMINISTICO, para dois bancos
  que rodem esta migracao chegarem ao mesmo catalogo.
*/
INSERT INTO orgaos (organizacao_id, nome)
SELECT DISTINCT ON (p.organizacao_id, lower(trim(p.orgao_destino)))
       p.organizacao_id, trim(p.orgao_destino)
  FROM providencias p
 WHERE trim(coalesce(p.orgao_destino, '')) <> ''
 ORDER BY p.organizacao_id, lower(trim(p.orgao_destino)), trim(p.orgao_destino);

UPDATE providencias p
   SET orgao_id = o.id
  FROM orgaos o
 WHERE o.organizacao_id = p.organizacao_id
   AND lower(trim(o.nome)) = lower(trim(p.orgao_destino));

/*
  Sobra o caso do texto vazio.

  A coluna e `NOT NULL` desde a 001, mas nunca teve CHECK de comprimento, entao
  string vazia cabia. Ela vira um orgao NOMEADO E DESATIVADO, e nao um
  `orgao_id` nulo: nulo faria a chave composta ser dispensada (MATCH SIMPLE
  ignora a checagem quando qualquer coluna da chave e nula), que e justamente a
  protecao que esta migracao esta instalando. Desativado porque ninguem deve
  poder encaminhar coisa nova para ele.
*/
INSERT INTO orgaos (organizacao_id, nome, ativo, desativado_em, motivo_desativacao)
SELECT DISTINCT p.organizacao_id,
       'Destino nao identificado',
       false, now(),
       'Providencia anterior ao catalogo de orgaos, gravada sem destino escrito'
  FROM providencias p
 WHERE p.orgao_id IS NULL;

UPDATE providencias p
   SET orgao_id = o.id
  FROM orgaos o
 WHERE p.orgao_id IS NULL
   AND o.organizacao_id = p.organizacao_id
   AND o.nome = 'Destino nao identificado';

ALTER TABLE providencias ALTER COLUMN orgao_id SET NOT NULL;

-- O preco da chave composta, igual ao da migracao 008: unicidade redundante
-- com a chave primaria nas tabelas referenciadas.
ALTER TABLE providencias
  ADD CONSTRAINT providencias_org_id_unico UNIQUE (organizacao_id, id);

ALTER TABLE providencias
  ADD CONSTRAINT providencia_orgao_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, orgao_id)
  REFERENCES orgaos (organizacao_id, id) ON DELETE RESTRICT;

CREATE INDEX providencias_orgao_idx ON providencias (organizacao_id, orgao_id);

COMMENT ON COLUMN providencias.orgao_destino IS
  'O nome do orgao COMO FOI ESCRITO na epoca do encaminhamento. Nao e mais o '
  'destino (esse e orgao_id): e o registro historico, que continua valendo se '
  'o orgao for renomeado no catalogo depois.';

/*
  A rede de seguranca: nenhuma providencia nasce fora do catalogo.

  A rota nova manda `orgao_id`. Este gatilho existe para todo o resto: a
  semente de desenvolvimento, um script de importacao, uma rota futura escrita
  as pressas. Sem ele, `orgao_id NOT NULL` quebraria esses caminhos, e a saida
  facil seria voltar a coluna para nula, o que desligaria a chave composta e
  reabriria o vazamento entre municipios.

  Texto livre que nao esta no catalogo vira ENTRADA NOVA no catalogo, e nao
  erro: um destino escrito a mao continua sendo um destino de verdade, e agora
  ele fica visivel numa lista onde alguem consegue corrigir ou desativar. O que
  ele NAO consegue mais e existir quatro vezes com a mesma grafia em caixas
  diferentes.
*/
CREATE OR REPLACE FUNCTION providencia_amarra_no_catalogo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_nome text := trim(coalesce(NEW.orgao_destino, ''));
  v_id   uuid;
BEGIN
  IF NEW.orgao_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'providencia sem destino: informe orgao_id ou orgao_destino'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT o.id INTO v_id
    FROM orgaos o
   WHERE o.organizacao_id = NEW.organizacao_id
     AND lower(trim(o.nome)) = lower(v_nome)
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO orgaos (organizacao_id, nome)
    VALUES (NEW.organizacao_id, v_nome)
    RETURNING id INTO v_id;
  END IF;

  NEW.orgao_id := v_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER providencia_amarra_no_catalogo
  BEFORE INSERT OR UPDATE ON providencias
  FOR EACH ROW EXECUTE FUNCTION providencia_amarra_no_catalogo();

-- ---------------------------------------------------------------------
-- Sequencia de oficio, por municipio e por ano
--
-- Copia deliberada de `protocolo_sequencias` e `proximo_protocolo` (migracao
-- 001). Duas sequencias separadas, e nao uma compartilhada: protocolo e o
-- numero do CHAMADO e oficio e o numero do DOCUMENTO. Juntar os dois faria o
-- numero do oficio pular de acordo com o movimento de atendimento, e o
-- primeiro oficio do ano poderia sair como 000437/2026.
-- ---------------------------------------------------------------------
CREATE TABLE oficio_sequencias (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  ano             integer NOT NULL,
  ultimo          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organizacao_id, ano)
);

ALTER TABLE oficio_sequencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficio_sequencias FORCE ROW LEVEL SECURITY;

CREATE POLICY oficio_sequencias_isolamento ON oficio_sequencias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE OR REPLACE FUNCTION proximo_oficio(p_ano integer)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid := app_organizacao_atual();
  v_seq integer;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'app.organizacao_atual nao definido na transacao';
  END IF;

  /*
    O `INSERT ... ON CONFLICT DO UPDATE` trava a linha da sequencia ate o fim
    da transacao. E por isso que a reserva do numero precisa acontecer DENTRO
    da transacao que grava o oficio: duas emissoes simultaneas serializam
    aqui, e a segunda so recebe o numero depois que a primeira gravou. Chamar
    isto fora da transacao devolveria o mesmo numero para as duas, e dois
    documentos oficiais diferentes passariam a ter a mesma identificacao.
  */
  INSERT INTO oficio_sequencias (organizacao_id, ano, ultimo)
  VALUES (v_org, p_ano, 1)
  ON CONFLICT (organizacao_id, ano)
  DO UPDATE SET ultimo = oficio_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  IF v_seq > 999999 THEN
    RAISE EXCEPTION 'Sequencial de oficio estourou seis digitos no ano %', p_ano;
  END IF;

  RETURN lpad(v_seq::text, 6, '0') || '/' || p_ano::text;
END;
$$;

-- ---------------------------------------------------------------------
-- O oficio
-- ---------------------------------------------------------------------
CREATE TABLE oficios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id     uuid NOT NULL,
  providencia_id    uuid NOT NULL,
  orgao_id          uuid NOT NULL,
  numero            text NOT NULL CHECK (numero ~ '^[0-9]{6}/[0-9]{4}$'),
  ano               integer NOT NULL,
  -- Texto que a coordenacao acrescenta ao corpo do oficio. O resto do
  -- documento e montado a partir da ocorrencia e da providencia, na hora de
  -- imprimir, pela mesma razao do laudo: um documento guardado em cache seria
  -- a versao errada com cara de definitiva.
  observacoes       text,
  emitido_em        timestamptz NOT NULL DEFAULT now(),
  emitido_por       uuid,
  emitido_por_nome  text NOT NULL CHECK (length(trim(emitido_por_nome)) > 0),

  CONSTRAINT oficios_numero_unico_no_municipio UNIQUE (organizacao_id, numero),

  /*
    Um oficio por providencia.

    Reenvio nao cria oficio novo: cria tentativa nova sobre o mesmo numero. Sem
    esta unicidade, clicar duas vezes em "emitir" queimaria dois numeros da
    sequencia do municipio para o mesmo encaminhamento, e o orgao receberia
    dois documentos oficiais pedindo a mesma coisa.
  */
  CONSTRAINT oficios_um_por_providencia UNIQUE (organizacao_id, providencia_id),
  CONSTRAINT oficios_org_id_unico UNIQUE (organizacao_id, id),

  CONSTRAINT oficio_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT,
  CONSTRAINT oficio_providencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, providencia_id)
    REFERENCES providencias (organizacao_id, id) ON DELETE RESTRICT,
  CONSTRAINT oficio_orgao_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, orgao_id)
    REFERENCES orgaos (organizacao_id, id) ON DELETE RESTRICT,
  CONSTRAINT oficio_emissor_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, emitido_por)
    REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL
);

CREATE INDEX oficios_ocorrencia_idx ON oficios (organizacao_id, ocorrencia_id);

ALTER TABLE oficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficios FORCE ROW LEVEL SECURITY;

CREATE POLICY oficios_leitura ON oficios FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

/*
  Sem policy de UPDATE e sem policy de DELETE, pela mesma razao da trilha.

  Um oficio emitido tem numero de documento oficial. Se o numero, o orgao ou a
  providencia pudessem ser trocados depois, o numero deixaria de identificar
  coisa nenhuma: o oficio 000012/2026 que o Corpo de Bombeiros tem na mao seria
  outro documento no nosso banco. Errou? Emite outro, e o primeiro continua
  existindo, que e como papel timbrado funciona.
*/
CREATE POLICY oficios_insercao ON oficios FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- As tentativas de envio, uma linha por tentativa
--
-- INCLUSIVE AS QUE FALHARAM, e essa e a parte que importa: tentativa que nao
-- fica registrada e a que ninguem consegue investigar. "Mandamos, nao chegou"
-- e uma conversa que so termina com registro de quem mandou, quando, para
-- qual endereco e o que o provedor respondeu.
--
-- A linha e criada ANTES da chamada ao provedor, com desfecho `enviando`, e
-- atualizada depois. A ordem inversa (chamar e depois registrar) perde a
-- tentativa inteira quando o processo morre no meio, que e exatamente a
-- tentativa sobre a qual alguem vai perguntar. O preco desta ordem e a linha
-- que fica parada em `enviando` quando o processo morre, e ela conta a
-- verdade: desfecho desconhecido.
--
-- Cada tentativa carrega o SEU link. Reenviar nao reaproveita o endereco
-- anterior, porque o anterior provavelmente ja foi aberto (e por isso o
-- destinatario pediu de novo).
-- ---------------------------------------------------------------------
CREATE TABLE oficio_envios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id        uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  oficio_id             uuid NOT NULL,
  tentativa             integer NOT NULL,
  destinatario_email    text NOT NULL,

  -- Guardamos o hash, nunca o token, pelo mesmo motivo de
  -- `recuperacoes_senha`: vazamento do banco nao devolve link utilizavel.
  token_hash            text NOT NULL UNIQUE,
  expira_em             timestamptz NOT NULL,

  solicitado_em         timestamptz NOT NULL DEFAULT now(),
  solicitado_por        uuid,
  solicitado_por_nome   text NOT NULL CHECK (length(trim(solicitado_por_nome)) > 0),

  desfecho              text NOT NULL DEFAULT 'enviando'
                        CHECK (desfecho IN ('enviando','entregue','falha')),
  -- O que o provedor respondeu, e nada mais. NUNCA o corpo da mensagem, que
  -- carrega o link de uso unico, e nunca o token.
  detalhe               text,

  /*
    Teto de seguranca do BANCO, e nao o teto de negocio.

    O teto de reenvio que o produto aplica e configuravel e mora na aplicacao,
    porque tres tentativas podem ser pouco num municipio e demais em outro.
    Este aqui e o limite absoluto: um laco com defeito, ou um cliente HTTP
    repetindo em loop, para de gerar link de uso unico para o mesmo oficio
    depois de vinte tentativas, mesmo que a regra da aplicacao tenha sumido.
  */
  CONSTRAINT tentativa_dentro_do_teto CHECK (tentativa BETWEEN 1 AND 20),

  CONSTRAINT envio_unico_por_tentativa UNIQUE (organizacao_id, oficio_id, tentativa),
  CONSTRAINT oficio_envios_org_id_unico UNIQUE (organizacao_id, id),

  CONSTRAINT envio_oficio_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, oficio_id)
    REFERENCES oficios (organizacao_id, id) ON DELETE RESTRICT,
  CONSTRAINT envio_solicitante_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, solicitado_por)
    REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL,

  CONSTRAINT envio_email_plausivel CHECK (
    destinatario_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

-- A abertura do link procura pelo hash, e sem indice isso passaria a tabela
-- inteira a cada clique de destinatario.
CREATE INDEX oficio_envios_oficio_idx ON oficio_envios (organizacao_id, oficio_id);

ALTER TABLE oficio_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficio_envios FORCE ROW LEVEL SECURITY;

CREATE POLICY oficio_envios_isolamento ON oficio_envios
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  LISTA FECHADA DE DOMINIOS, e ela mora no banco.

  Sem isto, quem tiver acesso ao painel usa o sistema como encaminhador: manda
  um oficio com o cabecalho da prefeitura, e um link para o dossie de uma
  familia em risco, para o endereco que quiser. O painel nao precisa nem estar
  comprometido, basta um servidor mal intencionado com login legitimo.

  A regra mora aqui, e nao so na rota, porque rota nova alguem escreve; esta
  checagem vale para qualquer caminho que insira em `oficio_envios`, hoje e
  depois.

  So dominio de orgao ATIVO do proprio municipio. Orgao desativado nao recebe
  encaminhamento novo, e um dominio que sobreviveu a desativacao seria
  exatamente o buraco pelo qual essa regra escaparia.
*/
CREATE OR REPLACE FUNCTION envio_so_para_dominio_do_catalogo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_dominio text := lower(split_part(NEW.destinatario_email, '@', 2));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM orgaos o
     WHERE o.organizacao_id = NEW.organizacao_id
       AND o.ativo
       AND o.email IS NOT NULL
       AND lower(split_part(o.email, '@', 2)) = v_dominio
  ) THEN
    RAISE EXCEPTION
      'o dominio % nao pertence a nenhum orgao ativo deste municipio', v_dominio
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER envio_so_para_dominio_do_catalogo
  BEFORE INSERT OR UPDATE OF destinatario_email ON oficio_envios
  FOR EACH ROW EXECUTE FUNCTION envio_so_para_dominio_do_catalogo();

-- ---------------------------------------------------------------------
-- As aberturas do link: quem, quando, de qual endereco
--
-- APPEND-ONLY pelo mesmo mecanismo da trilha: ausencia de policy de UPDATE e
-- de DELETE, e nenhum privilegio de escrita para o papel de aplicacao. Quem
-- escreve aqui e so `abrir_oficio`, mais abaixo.
-- ---------------------------------------------------------------------
CREATE TABLE oficio_aberturas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  oficio_id           uuid NOT NULL,
  envio_id            uuid NOT NULL,

  resultado           text NOT NULL CHECK (resultado IN (
                        'entregue','recusado_ja_aberto','recusado_expirado')),
  registrado_em       timestamptz NOT NULL DEFAULT now(),
  ip                  inet,
  -- Cortado na aplicacao antes de chegar aqui. Serve para distinguir "abriu no
  -- celular" de "um robo passou no link", e nao para identificar pessoa.
  agente_do_navegador text,

  CONSTRAINT abertura_oficio_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, oficio_id)
    REFERENCES oficios (organizacao_id, id) ON DELETE RESTRICT,
  CONSTRAINT abertura_envio_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, envio_id)
    REFERENCES oficio_envios (organizacao_id, id) ON DELETE RESTRICT
);

/*
  O USO UNICO, garantido pelo banco.

  Uma unica abertura com resultado `entregue` por envio. A segunda tentativa de
  inserir uma esbarra no indice, e vira `recusado_ja_aberto`, que tambem fica
  registrado.

  Estar aqui, e nao num `IF ja_foi_aberto` da aplicacao, e o ponto: um `UPDATE
  ... SET aberto_em = now()` depende de a aplicacao lembrar de fazer, e nao
  sobrevive a duas aberturas simultaneas. Este indice sobrevive.
*/
CREATE UNIQUE INDEX oficio_link_abre_uma_vez
  ON oficio_aberturas (organizacao_id, envio_id)
  WHERE resultado = 'entregue';

CREATE INDEX oficio_aberturas_oficio_idx ON oficio_aberturas (organizacao_id, oficio_id);

ALTER TABLE oficio_aberturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficio_aberturas FORCE ROW LEVEL SECURITY;

CREATE POLICY oficio_aberturas_leitura ON oficio_aberturas FOR SELECT
  USING (organizacao_id = app_organizacao_atual());
-- Sem policy de INSERT, de UPDATE e de DELETE. Com RLS forcada, a ausencia de
-- policy nega a operacao para o papel de aplicacao.

/*
  Abre o link de uso unico, e registra a abertura, numa operacao so.

  Roda ANTES de existir contexto de tenant, como o login e a recuperacao de
  senha, e pela mesma razao e uma funcao nomeada e estreita em vez de uma
  excecao geral ao RLS: quem clica no link e uma pessoa do Corpo de Bombeiros,
  sem conta, sem token e sem municipio.

  Junto de proposito, como `consumir_recuperacao`: separar em "confere o link"
  e depois "registra a abertura" abriria uma janela em que o mesmo link serve
  duas vezes, que e justamente a falha que quem interceptou o email procura.
  O `FOR UPDATE` serializa duas aberturas simultaneas, e o indice unico parcial
  e a rede embaixo dele.

  A funcao NAO devolve o conteudo do oficio. Ela devolve o resultado e os
  identificadores; quem monta o documento e a rota, pelo caminho normal, com
  `SET LOCAL` na organizacao que veio daqui. Assim o dado sensivel continua
  saindo por um so lugar, e esta porta no RLS fica do tamanho da pergunta que
  ela responde.
*/
CREATE OR REPLACE FUNCTION abrir_oficio(
  p_token_hash text,
  p_ip text,
  p_agente text
)
RETURNS TABLE (resultado text, oficio_id uuid, organizacao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_envio oficio_envios%ROWTYPE;
BEGIN
  SELECT * INTO v_envio
    FROM oficio_envios e
   WHERE e.token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Link desconhecido nao registra nada: registrar daria a quem varre
    -- endereco uma forma de encher a tabela de aberturas de um municipio que
    -- ele nem sabe se existe.
    RETURN QUERY SELECT 'desconhecido'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_envio.expira_em <= now() THEN
    INSERT INTO oficio_aberturas
      (organizacao_id, oficio_id, envio_id, resultado, ip, agente_do_navegador)
    VALUES (v_envio.organizacao_id, v_envio.oficio_id, v_envio.id,
            'recusado_expirado', nullif(p_ip, '')::inet, nullif(p_agente, ''));
    RETURN QUERY SELECT 'expirado'::text, v_envio.oficio_id, v_envio.organizacao_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM oficio_aberturas a
     WHERE a.envio_id = v_envio.id AND a.resultado = 'entregue'
  ) THEN
    INSERT INTO oficio_aberturas
      (organizacao_id, oficio_id, envio_id, resultado, ip, agente_do_navegador)
    VALUES (v_envio.organizacao_id, v_envio.oficio_id, v_envio.id,
            'recusado_ja_aberto', nullif(p_ip, '')::inet, nullif(p_agente, ''));
    RETURN QUERY SELECT 'ja_aberto'::text, v_envio.oficio_id, v_envio.organizacao_id;
    RETURN;
  END IF;

  INSERT INTO oficio_aberturas
    (organizacao_id, oficio_id, envio_id, resultado, ip, agente_do_navegador)
  VALUES (v_envio.organizacao_id, v_envio.oficio_id, v_envio.id,
          'entregue', nullif(p_ip, '')::inet, nullif(p_agente, ''));

  RETURN QUERY SELECT 'entregue'::text, v_envio.oficio_id, v_envio.organizacao_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Privilegios do papel de aplicacao
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON orgaos TO dc360_app;
GRANT SELECT, INSERT, UPDATE ON oficio_sequencias TO dc360_app;
-- Sem UPDATE em `oficios`: documento oficial emitido nao se corrige, se
-- reemite. Ver a policy acima.
GRANT SELECT, INSERT ON oficios TO dc360_app;
/*
  Em `oficio_envios` o papel de aplicacao insere e le a linha inteira, e so
  ATUALIZA duas colunas: o desfecho e o detalhe do provedor.

  A restricao por coluna e o que impede um caminho futuro de esticar
  `expira_em` ou trocar `token_hash` numa tentativa ja gravada. Um link que a
  aplicacao consegue prorrogar nao expira de verdade, e um `token_hash`
  substituivel transforma uma tentativa antiga, ja registrada como enviada para
  um endereco, num link novo para outro. Precisa de mais um envio? Emite outra
  tentativa, que fica registrada, e o teto de reenvio conta.
*/
GRANT SELECT, INSERT ON oficio_envios TO dc360_app;
GRANT UPDATE (desfecho, detalhe) ON oficio_envios TO dc360_app;
-- Só leitura: quem escreve abertura e `abrir_oficio`, e mais ninguem.
GRANT SELECT ON oficio_aberturas TO dc360_app;

GRANT EXECUTE ON FUNCTION proximo_oficio(integer) TO dc360_app;

REVOKE ALL ON FUNCTION abrir_oficio(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abrir_oficio(text, text, text) TO dc360_app;

-- ---------------------------------------------------------------------
-- O catalogo de orgaos entra na trilha administrativa
--
-- Criar, editar e desativar orgao e da mesma familia de "promover conta" e
-- "desativar equipe": muda quem o municipio consegue acionar, e precisa
-- responder "quem fez isso". Sem acrescentar `orgao` a lista, a rota do
-- catalogo seria o unico caminho de escrita administrativa do produto sem
-- rastro, que e exatamente o buraco que a migracao 010 fechou nos outros.
-- ---------------------------------------------------------------------
ALTER TABLE trilha_administrativa
  DROP CONSTRAINT trilha_administrativa_alvo_tipo_check;

ALTER TABLE trilha_administrativa
  ADD CONSTRAINT trilha_administrativa_alvo_tipo_check
  CHECK (alvo_tipo IN ('usuario','equipe','organizacao','orgao'));
