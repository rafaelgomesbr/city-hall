-- =====================================================================
-- 005: recuperação e troca de senha.
--
-- Sem isto, esquecer a senha é chamado para o suporte, e o suporte de um
-- sistema municipal é uma pessoa só. Pior: a saída informal vira "manda a
-- senha nova no WhatsApp", que é o caminho mais curto para uma credencial
-- vazar.
--
-- Régua: OWASP ASVS 4.0 nível 2, seção 2.5 (recuperação de credencial).
-- =====================================================================

CREATE TABLE recuperacoes_senha (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  -- Guardamos o hash, nunca o token. Vazamento do banco não devolve link
  -- utilizável, pelo mesmo motivo que não se guarda senha em claro.
  token_hash      text NOT NULL UNIQUE,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  expira_em       timestamptz NOT NULL,
  usada_em        timestamptz,
  ip              inet
);

CREATE INDEX recuperacoes_usuario_idx ON recuperacoes_senha (organizacao_id, usuario_id);
CREATE INDEX recuperacoes_expira_idx ON recuperacoes_senha (expira_em) WHERE usada_em IS NULL;

ALTER TABLE recuperacoes_senha ENABLE ROW LEVEL SECURITY;
ALTER TABLE recuperacoes_senha FORCE ROW LEVEL SECURITY;

CREATE POLICY recuperacoes_isolamento ON recuperacoes_senha
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Abre uma recuperação a partir do email.

  Roda antes de existir contexto de tenant, como o login, e pelo mesmo motivo é
  uma função nomeada e estreita em vez de uma exceção geral ao RLS.

  Devolve o nome e o email de quem pediu, para o servidor conseguir enviar a
  mensagem. Isso NÃO é vazamento: quem chama é a API, e a resposta que chega ao
  cliente é sempre a mesma, exista a conta ou não.

  Recuperações anteriores do mesmo usuário são invalidadas: dois links vivos ao
  mesmo tempo dobram a janela de ataque sem ajudar ninguém.
*/
CREATE OR REPLACE FUNCTION abrir_recuperacao(
  p_email text,
  p_token_hash text,
  p_duracao interval,
  p_ip text
)
RETURNS TABLE (usuario_id uuid, nome text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_usuario FROM usuarios u
   WHERE lower(u.email) = lower(p_email) AND u.ativo;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE recuperacoes_senha
     SET usada_em = now()
   WHERE recuperacoes_senha.usuario_id = v_usuario.id AND usada_em IS NULL;

  INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em, ip)
  VALUES (v_usuario.organizacao_id, v_usuario.id, p_token_hash,
          now() + p_duracao, nullif(p_ip, '')::inet);

  RETURN QUERY SELECT v_usuario.id, v_usuario.nome, v_usuario.email;
END;
$$;

/*
  Consome o link e troca a senha, numa operação só.

  Junto de propósito: separar em "valida o token" e depois "grava a senha"
  abriria uma janela em que o mesmo link serve duas vezes, e é justamente essa
  a falha que um atacante com o link procura.

  Trocar a senha derruba TODAS as sessões do usuário. Se a recuperação foi
  pedida porque alguém invadiu a conta, deixar as sessões antigas vivas
  entregaria a conta de volta ao invasor.
*/
CREATE OR REPLACE FUNCTION consumir_recuperacao(p_token_hash text, p_senha_hash text)
RETURNS TABLE (usuario_id uuid, organizacao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec recuperacoes_senha%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE recuperacoes_senha SET usada_em = now() WHERE id = v_rec.id;

  UPDATE usuarios
     SET senha_hash = p_senha_hash,
         falhas_login = 0,
         bloqueado_ate = NULL
   WHERE id = v_rec.usuario_id;

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha redefinida'
   WHERE sessoes.usuario_id = v_rec.usuario_id AND revogada_em IS NULL;

  RETURN QUERY SELECT v_rec.usuario_id, v_rec.organizacao_id;
END;
$$;

/*
  Troca de senha por quem já está autenticado.

  A senha atual é conferida na aplicação (é lá que vive o algoritmo de
  derivação), então esta função recebe o hash novo já pronto e só grava. Ela
  também derruba as outras sessões: trocar a senha e continuar com cinco
  aparelhos logados esvazia o sentido da troca.
*/
CREATE OR REPLACE FUNCTION trocar_senha(
  p_usuario_id uuid,
  p_senha_hash text,
  p_sessao_preservada uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE usuarios
     SET senha_hash = p_senha_hash, falhas_login = 0, bloqueado_ate = NULL
   WHERE id = p_usuario_id;

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha trocada pelo proprio usuario'
   WHERE sessoes.usuario_id = p_usuario_id
     AND revogada_em IS NULL
     AND (p_sessao_preservada IS NULL OR id <> p_sessao_preservada);
END;
$$;

REVOKE ALL ON FUNCTION abrir_recuperacao(text, text, interval, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION consumir_recuperacao(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION trocar_senha(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION abrir_recuperacao(text, text, interval, text) TO dc360_app;
GRANT EXECUTE ON FUNCTION consumir_recuperacao(text, text) TO dc360_app;
GRANT EXECUTE ON FUNCTION trocar_senha(uuid, text, uuid) TO dc360_app;

GRANT SELECT, INSERT, UPDATE ON recuperacoes_senha TO dc360_app;
