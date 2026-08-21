-- =====================================================================
-- 002: autenticação.
--
-- Duas coisas acontecem antes de existir contexto de tenant: descobrir de
-- qual município é quem está entrando, e validar um token de renovação. As
-- duas precisam ler tabelas que o RLS protege, e não dá para "desligar o RLS
-- só nessa hora" sem abrir um buraco permanente.
--
-- A saída é uma superfície mínima e nomeada: duas funções SECURITY DEFINER,
-- cada uma respondendo exatamente uma pergunta, sem aceitar filtro livre e
-- sem devolver mais do que a autenticação precisa. Fora delas, o papel de
-- aplicação continua sem enxergar nada sem contexto.
--
-- Régua: OWASP ASVS 4.0 nível 2 (seções 2.1 senhas, 2.2 resistência a força
-- bruta, 3.x sessão).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Credenciais e bloqueio por tentativa
-- ---------------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN senha_hash     text,
  ADD COLUMN falhas_login   integer NOT NULL DEFAULT 0,
  ADD COLUMN bloqueado_ate  timestamptz,
  ADD COLUMN ultimo_acesso  timestamptz;

-- Email é a identidade de login e precisa ser único no sistema inteiro, não
-- só dentro do município: na hora do login ainda não se sabe o município, e
-- dois usuários com o mesmo email em prefeituras diferentes tornariam a
-- resposta ambígua.
CREATE UNIQUE INDEX usuarios_email_global_idx ON usuarios (lower(email));

-- ---------------------------------------------------------------------
-- Sessões: um registro por token de renovação emitido.
--
-- Guardamos o HASH do token, nunca o token. Vazamento do banco não devolve
-- sessão utilizável, pelo mesmo motivo que não se guarda senha em claro.
-- ---------------------------------------------------------------------
CREATE TABLE sessoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  token_hash      text NOT NULL UNIQUE,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  expira_em       timestamptz NOT NULL,
  revogada_em     timestamptz,
  motivo_revogacao text,
  user_agent      text,
  ip              inet
);

CREATE INDEX sessoes_usuario_idx ON sessoes (organizacao_id, usuario_id);
CREATE INDEX sessoes_expira_idx ON sessoes (expira_em) WHERE revogada_em IS NULL;

ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes FORCE ROW LEVEL SECURITY;

CREATE POLICY sessoes_isolamento ON sessoes
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- Função de login.
--
-- SECURITY DEFINER porque roda antes de haver contexto de tenant. Três
-- cuidados que fazem dela uma porta e não um buraco:
--   1. `SET search_path = public, pg_temp` fixa a resolução de nomes. Sem
--      isso, quem controlasse o search_path poderia sequestrar as chamadas
--      internas da função, que roda com os privilégios do dono.
--   2. A busca é por igualdade de email, e nada mais. Não aceita filtro,
--      não aceita ordenação, não aceita limite: não dá para transformar em
--      enumeração da tabela.
--   3. Devolve só o que a autenticação precisa decidir. Nada de telefone,
--      matrícula ou qualquer outro dado do usuário.
--
-- Ela NÃO compara senha: a comparação acontece na aplicação, com o algoritmo
-- de derivação de chave, para o hash nunca precisar viajar como parâmetro de
-- consulta nem aparecer em log de banco.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credenciais_para_login(p_email text)
RETURNS TABLE (
  usuario_id      uuid,
  organizacao_id  uuid,
  nome            text,
  papel           text,
  senha_hash      text,
  ativo           boolean,
  bloqueado_ate   timestamptz,
  organizacao_nome text,
  municipio       text,
  uf              char(2)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.organizacao_id, u.nome, u.papel, u.senha_hash, u.ativo,
         u.bloqueado_ate, o.nome, o.municipio, o.uf
    FROM usuarios u
    JOIN organizacoes o ON o.id = u.organizacao_id
   WHERE lower(u.email) = lower(p_email);
$$;

-- ---------------------------------------------------------------------
-- Registro do resultado da tentativa.
--
-- O bloqueio é por conta e temporário, não permanente: bloqueio permanente
-- vira negação de serviço contra o próprio servidor público, que é quem
-- precisa do sistema justamente no dia de temporal.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_tentativa_login(
  p_usuario_id uuid,
  p_sucesso boolean,
  p_max_falhas integer,
  p_bloqueio interval
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_sucesso THEN
    UPDATE usuarios
       SET falhas_login = 0, bloqueado_ate = NULL, ultimo_acesso = now()
     WHERE id = p_usuario_id;
  ELSE
    UPDATE usuarios
       SET falhas_login = falhas_login + 1,
           bloqueado_ate = CASE
             WHEN falhas_login + 1 >= p_max_falhas THEN now() + p_bloqueio
             ELSE bloqueado_ate
           END
     WHERE id = p_usuario_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Consulta de sessão por hash do token de renovação, também antes de haver
-- contexto de tenant. Só devolve sessão viva: expirada ou revogada não volta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sessao_por_token(p_token_hash text)
RETURNS TABLE (
  sessao_id       uuid,
  organizacao_id  uuid,
  usuario_id      uuid,
  nome            text,
  papel           text,
  ativo           boolean,
  organizacao_nome text,
  municipio       text,
  uf              char(2)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.organizacao_id, s.usuario_id, u.nome, u.papel, u.ativo,
         o.nome, o.municipio, o.uf
    FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN organizacoes o ON o.id = s.organizacao_id
   WHERE s.token_hash = p_token_hash
     AND s.revogada_em IS NULL
     AND s.expira_em > now();
$$;

-- ---------------------------------------------------------------------
-- Criação e revogação de sessão, também fora do contexto de tenant: a
-- primeira acontece no login, e a revogação em cadeia precisa alcançar
-- sessões que o contexto atual talvez não enxergue.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abrir_sessao(
  p_organizacao_id uuid,
  p_usuario_id uuid,
  p_token_hash text,
  p_duracao interval,
  p_user_agent text,
  p_ip text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, user_agent, ip)
  VALUES (p_organizacao_id, p_usuario_id, p_token_hash, now() + p_duracao,
          left(coalesce(p_user_agent, ''), 400), nullif(p_ip, '')::inet)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION revogar_sessao(p_token_hash text, p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = p_motivo
   WHERE token_hash = p_token_hash AND revogada_em IS NULL;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

/*
  Reúso de token de renovação já usado é sinal clássico de token roubado: o
  legítimo e o atacante passam a alternar. A resposta correta não é recusar só
  aquela chamada, é derrubar a família inteira de sessões daquele usuário e
  obrigar a entrar de novo.
*/
CREATE OR REPLACE FUNCTION revogar_sessoes_do_usuario(p_usuario_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = p_motivo
   WHERE usuario_id = p_usuario_id AND revogada_em IS NULL;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

/*
  Reúso de token exige saber de quem era um token que NÃO está mais válido,
  e `sessao_por_token` de propósito não devolve esses. Esta função responde
  só isso: o dono, mesmo que a sessão esteja revogada ou expirada. Nada mais
  vaza, porque um uuid de usuário só é útil para quem já tinha o token.
*/
CREATE OR REPLACE FUNCTION dono_do_token(p_token_hash text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT usuario_id FROM sessoes WHERE token_hash = p_token_hash;
$$;

-- ---------------------------------------------------------------------
-- Privilégios: as funções são a única porta, então PUBLIC não executa
-- nenhuma delas. Só o papel de aplicação.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION credenciais_para_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_tentativa_login(uuid, boolean, integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION sessao_por_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revogar_sessao(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revogar_sessoes_do_usuario(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION dono_do_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION credenciais_para_login(text) TO dc360_app;
GRANT EXECUTE ON FUNCTION registrar_tentativa_login(uuid, boolean, integer, interval) TO dc360_app;
GRANT EXECUTE ON FUNCTION sessao_por_token(text) TO dc360_app;
GRANT EXECUTE ON FUNCTION abrir_sessao(uuid, uuid, text, interval, text, text) TO dc360_app;
GRANT EXECUTE ON FUNCTION revogar_sessao(text, text) TO dc360_app;
GRANT EXECUTE ON FUNCTION revogar_sessoes_do_usuario(uuid, text) TO dc360_app;
GRANT EXECUTE ON FUNCTION dono_do_token(text) TO dc360_app;

GRANT SELECT, INSERT, UPDATE ON sessoes TO dc360_app;
