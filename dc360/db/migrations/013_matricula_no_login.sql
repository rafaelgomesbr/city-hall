-- 013: a matrícula desce junto com a identidade
--
-- O laudo imprime "Matrícula" embaixo do nome do agente, porque é ela que
-- identifica um servidor público num documento que vai para processo. O
-- aplicativo de campo, que é onde a vistoria nasce, não a conhecia: o login
-- devolvia nome, papel e município, e mais nada.
--
-- Enquanto o laudo saía só do servidor isso passava despercebido. A minuta
-- montada no aparelho colocou o problema na tela: ou o agente lê para o
-- morador uma minuta sem a matrícula que o laudo vai imprimir, ou o aplicativo
-- passa a saber quem ele é por inteiro.
--
-- `CREATE OR REPLACE` não serve aqui: mudar a lista de colunas de retorno de
-- uma função que devolve TABLE exige derrubar a anterior. O `DROP` é seguro
-- porque a função é recriada na mesma transação da migração.

DROP FUNCTION IF EXISTS credenciais_para_login(text);

CREATE FUNCTION credenciais_para_login(p_email text)
RETURNS TABLE (
  usuario_id      uuid,
  organizacao_id  uuid,
  nome            text,
  matricula       text,
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
  SELECT u.id, u.organizacao_id, u.nome, u.matricula, u.papel, u.senha_hash,
         u.ativo, u.bloqueado_ate, o.nome, o.municipio, o.uf
    FROM usuarios u
    JOIN organizacoes o ON o.id = u.organizacao_id
   WHERE lower(u.email) = lower(p_email);
$$;

-- O DROP levou junto as permissões da função anterior. Sem estas duas linhas
-- o login para de funcionar para o papel de aplicação, que é a única coisa
-- que executa esta função em produção.
REVOKE ALL ON FUNCTION credenciais_para_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credenciais_para_login(text) TO dc360_app;

-- ---------------------------------------------------------------------
-- A renovação também precisa da matrícula.
--
-- O par de tokens é emitido por dois caminhos: o login, que lê
-- `credenciais_para_login`, e a renovação, que lê `sessao_por_token`. Os dois
-- devolvem a MESMA identidade ao cliente.
--
-- Se só o login soubesse a matrícula, o aplicativo a teria ao entrar e a
-- perderia na primeira renovação, algumas horas depois. O agente abriria a
-- minuta no meio do dia e a matrícula estaria em branco, sem nada na tela
-- explicando por quê. Um campo que existe às vezes é pior que um campo que
-- não existe.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS sessao_por_token(text);

CREATE FUNCTION sessao_por_token(p_token_hash text)
RETURNS TABLE (
  sessao_id       uuid,
  organizacao_id  uuid,
  usuario_id      uuid,
  nome            text,
  matricula       text,
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
  SELECT s.id, s.organizacao_id, s.usuario_id, u.nome, u.matricula, u.papel,
         u.ativo, o.nome, o.municipio, o.uf
    FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN organizacoes o ON o.id = s.organizacao_id
   WHERE s.token_hash = p_token_hash
     AND s.revogada_em IS NULL
     AND s.expira_em > now();
$$;

REVOKE ALL ON FUNCTION sessao_por_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sessao_por_token(text) TO dc360_app;
