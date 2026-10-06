-- =====================================================================
-- 047: familia da sessao. A sessao rotacionada so vale enquanto a CADEIA
--      de renovacao dela esta viva.
--
-- O DEFEITO (V2-F00-E07). Renovar revoga a sessao antiga com o motivo
-- `rotacionada na renovacao` e abre outra. `auth/vigencia.ts` contava como
-- viva TODA sessao revogada por esse motivo, para o token de acesso emitido
-- nela poder escrever pelos seus quinze minutos (a fila do aparelho pode estar
-- no meio de um envio). So que a sessao rotacionada ja esta revogada: quando
-- a cadeia e encerrada por quem administra, pela propria pessoa, por reuso de
-- token ou por troca de senha, quem cai e a sessao NOVA, e a antiga continuava
-- "viva" na leitura. O token de acesso anterior a renovacao seguia escrevendo
-- ate completar os quinze minutos, depois de a conta ter sido derrubada.
--
-- A CORRECAO. Cada login abre uma FAMILIA, e as sessoes de uma cadeia de
-- renovacao compartilham o `familia_id`. A sessao rotacionada so vale se a
-- familia dela ainda tem sessao de pe (`revogada_em IS NULL`). Os encerramentos
-- continuam atingindo so a sessao viva, como sempre atingiram, e isso
-- basta: encerrar a viva da cadeia derruba a cadeia inteira.
--
-- O QUE MUDA E O QUE NAO MUDA
--
--   - `sessoes.familia_id`: coluna tecnica, sem dado pessoal. Sessoes que ja
--     existem ganham familia propria (`familia_id = id`): no maximo um token
--     de acesso antigo cai no deploy e o cliente renova.
--   - `abrir_sessao` ganha um setimo parametro, OPCIONAL: a familia a herdar.
--     Sem ele, a sessao abre familia nova (login). Com ele, so aceita uma
--     familia que ja existe, do MESMO usuario e do MESMO municipio: a funcao e
--     SECURITY DEFINER e nao pode virar uma forma de enfiar uma sessao na
--     familia de outra pessoa. A assinatura antiga e REMOVIDA em vez de
--     ficar ao lado da nova, porque duas versoes da mesma funcao somariam uma
--     ao teto de funcoes SECURITY DEFINER de `db/test/isolamento.test.ts` (27),
--     que nao muda. O DROP leva as permissoes junto, entao o REVOKE e o GRANT
--     sao repetidos abaixo, com a mesma regra da 002.
--   - A recusa de municipio suspenso (038) e preservada tal e qual.
--   - Nenhuma policy nova: `sessoes_isolamento` (002) ja cobre a coluna.
--
-- Migracao aplicada nunca e editada (`HistoricoAlterado`): reverter a funcao
-- e uma migracao nova. Reverter so o codigo deixa a coluna sem uso.
-- =====================================================================

ALTER TABLE sessoes ADD COLUMN familia_id uuid;

-- A migracao roda com o papel de setup (superusuario, BYPASSRLS): a policy de
-- `sessoes` nao a alcanca. Cada sessao que ja existe e a raiz da propria
-- familia.
UPDATE sessoes SET familia_id = id WHERE familia_id IS NULL;

-- Daqui em diante, qualquer INSERT que nao diga a familia abre uma nova: e o
-- que um login e. So a renovacao informa a familia, e o faz por `abrir_sessao`.
ALTER TABLE sessoes ALTER COLUMN familia_id SET DEFAULT gen_random_uuid();
ALTER TABLE sessoes ALTER COLUMN familia_id SET NOT NULL;

COMMENT ON COLUMN sessoes.familia_id IS
  'Identifica a cadeia de renovacao. Cada login abre uma familia nova (o id da primeira sessao) e cada renovacao a herda. A sessao rotacionada so vale para a escrita enquanto a familia tem sessao nao revogada.';

-- A pergunta que a vigencia faz em toda escrita com token de sessao rotacionada:
-- "esta familia ainda tem sessao de pe?". Parcial, porque so as vivas importam
-- e sao uma fracao pequena da tabela.
CREATE INDEX sessoes_familia_viva_idx ON sessoes (familia_id) WHERE revogada_em IS NULL;

-- ---------------------------------------------------------------------
-- abrir_sessao com a familia opcional.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS abrir_sessao(uuid, uuid, text, interval, text, text);

CREATE FUNCTION abrir_sessao(
  p_organizacao_id uuid,
  p_usuario_id uuid,
  p_token_hash text,
  p_duracao interval,
  p_user_agent text,
  p_ip text,
  p_familia_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_suspenso timestamptz;
BEGIN
  SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id;
  IF v_suspenso IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC367',
      MESSAGE = 'O acesso deste municipio esta suspenso pelo fornecedor.',
      DETAIL  = format('Suspenso desde %s. Nenhuma sessao nova abre ate a reativacao.', v_suspenso);
  END IF;

  -- Herdar familia so da familia que existe, do mesmo usuario e do mesmo
  -- municipio. A mensagem nao diz qual das tres condicoes falhou.
  IF p_familia_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sessoes
     WHERE familia_id = p_familia_id
       AND usuario_id = p_usuario_id
       AND organizacao_id = p_organizacao_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC369',
      MESSAGE = 'A familia de sessao informada nao existe para este usuario.';
  END IF;

  INSERT INTO sessoes (id, organizacao_id, usuario_id, token_hash, expira_em, user_agent, ip, familia_id)
  VALUES (v_id, p_organizacao_id, p_usuario_id, p_token_hash, now() + p_duracao,
          left(coalesce(p_user_agent, ''), 400), nullif(p_ip, '')::inet,
          coalesce(p_familia_id, v_id));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text, uuid) TO dc360_app;
