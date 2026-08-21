-- =====================================================================
-- 001: base multi-tenant com Row Level Security forcada.
--
-- Decisao registrada em docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md
-- secao 4.3: banco unico, schema unico, coluna organizacao_id, RLS ativada
-- E FORCADA. Filtro na aplicacao depende de o desenvolvedor lembrar em cada
-- query; RLS nega no banco mesmo quando a aplicacao erra. Em auditoria isso
-- e prova, nao promessa.
--
-- A politica le current_setting('app.organizacao_atual'), que a aplicacao
-- define com SET LOCAL no inicio de cada transacao, sempre a partir do token
-- ja verificado, NUNCA a partir de parametro de requisicao.
-- =====================================================================

-- gen_random_uuid() e nucleo do Postgres desde a versao 13: nao precisa
-- de pgcrypto, e uma extensao a menos para justificar em auditoria.

-- ---------------------------------------------------------------------
-- Papel de aplicacao: nao e superuser e nao e dono das tabelas, senao o
-- RLS seria ignorado. Toda conexao da API usa este papel.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_app') THEN
    CREATE ROLE dc360_app NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- Helper: organizacao do contexto da transacao.
-- STABLE e nao SECURITY DEFINER de proposito: nao deve poder ser usada
-- para escalar privilegio, so para ler o contexto ja definido.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_organizacao_atual() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.organizacao_atual', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- Organizacoes: a raiz do tenant. Nao leva organizacao_id, ela mesma e a
-- organizacao; a politica compara com o proprio id.
-- ---------------------------------------------------------------------
CREATE TABLE organizacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL CHECK (length(trim(nome)) > 0),
  municipio     text NOT NULL CHECK (length(trim(municipio)) > 0),
  uf            char(2) NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes FORCE ROW LEVEL SECURITY;

CREATE POLICY organizacoes_isolamento ON organizacoes
  USING (id = app_organizacao_atual())
  WITH CHECK (id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Equipes
-- ---------------------------------------------------------------------
CREATE TABLE equipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  nome            text NOT NULL CHECK (length(trim(nome)) > 0),
  especialidade   text,
  ativa           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, nome)
);

CREATE INDEX equipes_org_idx ON equipes (organizacao_id);
ALTER TABLE equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipes FORCE ROW LEVEL SECURITY;

CREATE POLICY equipes_isolamento ON equipes
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  nome            text NOT NULL CHECK (length(trim(nome)) > 0),
  matricula       text NOT NULL,
  email           text NOT NULL,
  papel           text NOT NULL CHECK (papel IN ('coordenador','operador','agente_campo','administrador')),
  equipe_id       uuid REFERENCES equipes(id) ON DELETE SET NULL,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, matricula),
  UNIQUE (organizacao_id, email)
);

CREATE INDEX usuarios_org_idx ON usuarios (organizacao_id);
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;

CREATE POLICY usuarios_isolamento ON usuarios
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Sequencia de protocolo por organizacao e ano.
-- Gerar na aplicacao abriria corrida entre dois operadores registrando ao
-- mesmo tempo; aqui a linha e travada dentro da transacao.
-- ---------------------------------------------------------------------
CREATE TABLE protocolo_sequencias (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  ano             integer NOT NULL,
  ultimo          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organizacao_id, ano)
);

ALTER TABLE protocolo_sequencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_sequencias FORCE ROW LEVEL SECURITY;

CREATE POLICY protocolo_sequencias_isolamento ON protocolo_sequencias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE OR REPLACE FUNCTION proximo_protocolo(p_ano integer)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid := app_organizacao_atual();
  v_seq integer;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'app.organizacao_atual nao definido na transacao';
  END IF;

  INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo)
  VALUES (v_org, p_ano, 1)
  ON CONFLICT (organizacao_id, ano)
  DO UPDATE SET ultimo = protocolo_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  IF v_seq > 999999 THEN
    RAISE EXCEPTION 'Sequencial de protocolo estourou seis digitos no ano %', p_ano;
  END IF;

  RETURN lpad(v_seq::text, 6, '0') || '/' || p_ano::text;
END;
$$;

-- ---------------------------------------------------------------------
-- Ocorrencias
-- ---------------------------------------------------------------------
CREATE TABLE ocorrencias (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id              uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  protocolo                   text NOT NULL,
  tipo                        text NOT NULL CHECK (tipo IN (
                                'deslizamento','inundacao','alagamento','enxurrada',
                                'vendaval','granizo','colapso_edificacao','incendio_urbano')),
  status                      text NOT NULL DEFAULT 'registrada' CHECK (status IN (
                                'rascunho','registrada','triagem','em_campo',
                                'vistoria_concluida','providencia_pendente','encerrada')),
  severidade                  text CHECK (severidade IN ('baixa','media','alta','critica')),
  vulnerabilidade_presente    boolean NOT NULL DEFAULT false,
  vulnerabilidade_descricao   text,
  endereco                    text NOT NULL CHECK (length(trim(endereco)) > 0),
  latitude                    double precision,
  longitude                   double precision,
  solicitante_nome            text NOT NULL,
  solicitante_contato         text,
  canal_entrada               text NOT NULL CHECK (canal_entrada IN (
                                'telefone','whatsapp','presencial','oficio','outro')),
  descricao                   text NOT NULL,
  equipe_id                   uuid REFERENCES equipes(id) ON DELETE SET NULL,
  vinculada_a                 uuid REFERENCES ocorrencias(id) ON DELETE SET NULL,
  prazo_em                    timestamptz,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  encerrado_em                timestamptz,
  motivo_encerramento         text,

  -- Protocolo unico dentro da organizacao: dois municipios podem ter o
  -- mesmo numero sem colidir, que e o comportamento correto.
  UNIQUE (organizacao_id, protocolo),

  -- Encerramento exige motivo. A regra vive no banco porque ela e a
  -- garantia de auditoria, nao uma validacao de formulario.
  CONSTRAINT encerramento_exige_motivo CHECK (
    status <> 'encerrada'
    OR (motivo_encerramento IS NOT NULL AND length(trim(motivo_encerramento)) > 0)
  ),
  CONSTRAINT encerramento_exige_data CHECK (
    status <> 'encerrada' OR encerrado_em IS NOT NULL
  ),
  CONSTRAINT vulnerabilidade_exige_descricao CHECK (
    NOT vulnerabilidade_presente
    OR (vulnerabilidade_descricao IS NOT NULL AND length(trim(vulnerabilidade_descricao)) > 0)
  )
);

CREATE INDEX ocorrencias_org_idx ON ocorrencias (organizacao_id);
CREATE INDEX ocorrencias_org_status_idx ON ocorrencias (organizacao_id, status);
CREATE INDEX ocorrencias_org_prazo_idx ON ocorrencias (organizacao_id, prazo_em)
  WHERE status NOT IN ('encerrada','rascunho');

ALTER TABLE ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias FORCE ROW LEVEL SECURITY;

CREATE POLICY ocorrencias_isolamento ON ocorrencias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Vistorias
-- ---------------------------------------------------------------------
CREATE TABLE vistorias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id        uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id         uuid NOT NULL REFERENCES ocorrencias(id) ON DELETE RESTRICT,
  agente_id             uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  checklist             jsonb NOT NULL,
  gps_precisao_metros   double precision,
  assinante_nome        text NOT NULL,
  assinatura_chave      text,
  observacoes           text,
  -- Duas marcas de tempo: coleta no aparelho e chegada no servidor. O laudo
  -- mostra as duas quando diferem, que e o caso de toda coleta offline.
  coletada_em           timestamptz NOT NULL,
  sincronizada_em       timestamptz NOT NULL DEFAULT now(),
  -- Chave gerada no aparelho: e o que impede duplicar quando o agente
  -- reenvia a mesma coleta depois de falha de rede.
  idempotency_key       uuid NOT NULL,
  UNIQUE (organizacao_id, idempotency_key)
);

CREATE INDEX vistorias_org_idx ON vistorias (organizacao_id);
CREATE INDEX vistorias_ocorrencia_idx ON vistorias (organizacao_id, ocorrencia_id);

ALTER TABLE vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistorias FORCE ROW LEVEL SECURITY;

CREATE POLICY vistorias_isolamento ON vistorias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Evidencias fotograficas. A chave de storage carrega o prefixo do tenant,
-- que e a segunda barreira de isolamento junto do RLS.
-- ---------------------------------------------------------------------
CREATE TABLE evidencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  vistoria_id     uuid NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
  chave_storage   text NOT NULL,
  legenda         text,
  latitude        double precision,
  longitude       double precision,
  capturada_em    timestamptz NOT NULL,
  ordem           integer NOT NULL DEFAULT 0,
  CONSTRAINT chave_com_prefixo_do_tenant CHECK (
    chave_storage LIKE ('tenant/' || organizacao_id::text || '/%')
  )
);

CREATE INDEX evidencias_org_idx ON evidencias (organizacao_id);
ALTER TABLE evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencias FORCE ROW LEVEL SECURITY;

CREATE POLICY evidencias_isolamento ON evidencias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Providencias
-- ---------------------------------------------------------------------
CREATE TABLE providencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id   uuid NOT NULL REFERENCES ocorrencias(id) ON DELETE RESTRICT,
  orgao_destino   text NOT NULL,
  descricao       text NOT NULL,
  responsavel     text NOT NULL,
  prazo_em        timestamptz NOT NULL,
  encaminhada_em  timestamptz NOT NULL DEFAULT now(),
  respondida_em   timestamptz,
  resposta        text
);

CREATE INDEX providencias_org_idx ON providencias (organizacao_id);
ALTER TABLE providencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE providencias FORCE ROW LEVEL SECURITY;

CREATE POLICY providencias_isolamento ON providencias
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Trilha auditavel. Append-only por design: sem UPDATE nem DELETE na
-- politica, entao nem a aplicacao consegue reescrever historico. Correcao
-- entra como evento novo.
-- ---------------------------------------------------------------------
CREATE TABLE trilha_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id   uuid NOT NULL REFERENCES ocorrencias(id) ON DELETE RESTRICT,
  tipo            text NOT NULL,
  autor_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_nome      text NOT NULL,
  autor_papel     text NOT NULL CHECK (autor_papel IN ('coordenador','operador','agente_campo','administrador')),
  origem          text NOT NULL CHECK (origem IN ('campo','escritorio')),
  ocorrido_em     timestamptz NOT NULL,
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  detalhe         jsonb
);

CREATE INDEX trilha_org_ocorrencia_idx ON trilha_eventos (organizacao_id, ocorrencia_id, ocorrido_em);
ALTER TABLE trilha_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trilha_eventos FORCE ROW LEVEL SECURITY;

CREATE POLICY trilha_leitura ON trilha_eventos FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY trilha_insercao ON trilha_eventos FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());
-- Sem policy de UPDATE e sem policy de DELETE: com RLS forcada, a ausencia
-- de politica nega a operacao. A trilha e append-only no banco.

-- ---------------------------------------------------------------------
-- Privilegios do papel de aplicacao
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO dc360_app;
GRANT SELECT, INSERT, UPDATE ON
  organizacoes, equipes, usuarios, ocorrencias, vistorias,
  evidencias, providencias, protocolo_sequencias
  TO dc360_app;
GRANT SELECT, INSERT ON trilha_eventos TO dc360_app;
GRANT EXECUTE ON FUNCTION app_organizacao_atual() TO dc360_app;
GRANT EXECUTE ON FUNCTION proximo_protocolo(integer) TO dc360_app;
