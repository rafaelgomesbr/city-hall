-- =====================================================================
-- 007: registro de exportação.
--
-- Um CSV de ocorrências carrega nome, contato e relato de cidadãos. Ele sai
-- do sistema e passa a viver num pen drive, num email, numa pasta compartilhada.
--
-- A Lei 13.709/2018 exige que o tratamento de dado pessoal seja registrado, e
-- exportação é tratamento. Sem esta tabela, a pergunta "quem tirou a base de
-- dados do município em março?" não tem resposta, e é exatamente ela que
-- aparece quando um dado vaza.
--
-- A trilha por ocorrência não serve aqui: uma exportação não pertence a uma
-- ocorrência, ela atravessa muitas.
-- =====================================================================

CREATE TABLE exportacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome    text NOT NULL,
  tipo            text NOT NULL,
  -- Os filtros usados: sem eles não dá para saber QUAL recorte saiu.
  filtros         jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_registros integer NOT NULL,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  ip              inet
);

CREATE INDEX exportacoes_org_idx ON exportacoes (organizacao_id, criada_em DESC);

ALTER TABLE exportacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exportacoes FORCE ROW LEVEL SECURITY;

-- Sem policy de UPDATE nem DELETE: com RLS forçada, a ausência nega. O
-- registro de quem exportou é append-only pelo mesmo motivo que a trilha.
CREATE POLICY exportacoes_leitura ON exportacoes FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY exportacoes_insercao ON exportacoes FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());

GRANT SELECT, INSERT ON exportacoes TO dc360_app;
