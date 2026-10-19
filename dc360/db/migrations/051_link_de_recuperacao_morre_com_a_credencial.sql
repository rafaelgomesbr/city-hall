-- =====================================================================
-- 051: o link de recuperacao pendente morre com toda mudanca de senha e com
--      a desativacao da conta, e `consumir_recuperacao` confere a conta
--      ativa.
--
-- O DEFEITO (V2-F00-E10, rodada 4 da validacao, sobre bb0f654). So
-- `abrir_recuperacao` (pedido novo) e `consumir_recuperacao` marcavam
-- `usada_em`. A redefinicao por quem administra, a troca de senha pela
-- propria pessoa e a desativacao nao tocavam `recuperacoes_senha`:
--
--   1. quem administra redefine a senha porque suspeita de invasao, e quem
--      tinha um link vivo (ate `RECUPERACAO_MINUTOS`) desfazia a redefinicao
--      com ele;
--   2. quem troca a propria senha porque desconfia de vazamento continuava
--      exposto ao link ja enviado;
--   3. `consumir_recuperacao` nao conferia `usuarios.ativo`: a senha da conta
--      desativada era trocada por quem tinha o link e passava a valer na
--      reativacao.
--
-- A CORRECAO, em duas pecas:
--
--   1. Um gatilho em `usuarios` (`recuperacoes_morrem_com_a_credencial`):
--      toda mudanca de `senha_hash`, e toda desativacao (ativo de verdadeiro
--      para falso), marca `usada_em` nos links pendentes da pessoa, na MESMA
--      transacao da mudanca. E a mesma marca que `abrir_recuperacao` ja usa
--      para invalidar o link anterior quando um novo e pedido (005): o link
--      invalidado e o link usado se recusam igual, com a mesma mensagem, e a
--      trilha de "quem pediu e quando" continua na tabela (034). A regra mora
--      no banco: vale para a rota de quem administra, para `trocar_senha`,
--      para `consumir_recuperacao` (os outros links pendentes da pessoa) e
--      para qualquer caminho que um dia mude a senha ou desative a conta.
--      A funcao do gatilho e comum (SECURITY INVOKER): roda com o papel de
--      quem atualizou `usuarios`, que nas rotas e `dc360_app` com o
--      municipio no contexto (a policy de UPDATE de `recuperacoes_senha`, 034,
--      deixa marcar os links do proprio municipio), e dentro das funcoes
--      SECURITY DEFINER e o dono. O teto de 27 funcoes SECURITY DEFINER de
--      `db/test/isolamento.test.ts` nao muda.
--   2. `consumir_recuperacao` recriada com a mesma assinatura (o GRANT fica):
--      a linha da pessoa em `usuarios` primeiro (FOR NO KEY UPDATE), depois a
--      linha do link (FOR UPDATE, relida), e so entao as gravacoes. Conta
--      desativada: o link e gasto e nada mais muda (a resposta e a do link que
--      nao vale mais, sem dizer por que).
--
-- A ORDEM DAS TRAVAS, para nao haver impasse (deadlock). Com o gatilho, quem
-- muda a senha ou desativa a conta segura a linha de `usuarios` e DEPOIS as
-- linhas dos links. A 005 e a 049 faziam `consumir_recuperacao` segurar a
-- linha do link primeiro e a de `usuarios` depois: o link consumido no mesmo
-- instante de uma redefinicao por quem administra fecharia ciclo (o link
-- espera a linha da pessoa, a redefinicao espera a linha do link) e o
-- Postgres mataria uma das duas com 40P01. Agora a ordem e uma so em todo
-- caminho: linha de `usuarios`, linhas de `recuperacoes_senha`, trava da
-- pessoa (049). `abrir_recuperacao` nao segura a linha de `usuarios` (a chave
-- estrangeira so pede FOR KEY SHARE, que nao conflita com FOR NO KEY UPDATE),
-- entao nunca espera quem segura a linha da pessoa. O caso 32 do bloco de
-- Postgres real de `apps/api/test/renovacao-contra-encerramento.test.ts`
-- segura o link dentro desta funcao e mede.
--
-- O QUE NAO MUDA: nenhuma tabela, coluna, policy ou funcao SECURITY DEFINER
-- nova. A reativacao nao ressuscita link nenhum. Trocar papel, nome, foto ou
-- os contadores de falha de login nao toca os links.
--
-- ORDEM DE IMPLANTACAO: indiferente. A API nao muda por causa desta
-- migracao; o banco passa a recusar os links que deveriam ter morrido.
--
-- Idempotente: `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, `REVOKE` e
-- `GRANT`. Migracao aplicada nunca e editada: reverter e uma migracao nova.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O gatilho.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invalidar_recuperacoes_pendentes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE recuperacoes_senha
     SET usada_em = now()
   WHERE recuperacoes_senha.usuario_id = NEW.id
     AND usada_em IS NULL;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION invalidar_recuperacoes_pendentes() IS
  'Gatilho de usuarios (migracao 051): toda mudanca de senha e toda desativacao marcam usada_em nos links de recuperacao pendentes da pessoa.';

REVOKE ALL ON FUNCTION invalidar_recuperacoes_pendentes() FROM PUBLIC;

DROP TRIGGER IF EXISTS recuperacoes_morrem_com_a_credencial ON usuarios;
CREATE TRIGGER recuperacoes_morrem_com_a_credencial
  AFTER UPDATE OF senha_hash, ativo ON usuarios
  FOR EACH ROW
  WHEN (OLD.senha_hash IS DISTINCT FROM NEW.senha_hash OR (OLD.ativo AND NOT NEW.ativo))
  EXECUTE FUNCTION invalidar_recuperacoes_pendentes();

-- ---------------------------------------------------------------------
-- 2. consumir_recuperacao: a linha da pessoa primeiro, e a conta ativa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION consumir_recuperacao(p_token_hash text, p_senha_hash text)
RETURNS TABLE (usuario_id uuid, organizacao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario uuid;
  v_ativo   boolean;
  v_rec     recuperacoes_senha%ROWTYPE;
BEGIN
  -- De quem e o link, sem travar nada ainda.
  SELECT r.usuario_id INTO v_usuario FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A linha da pessoa ANTES da linha do link (a ordem do cabecalho). Se uma
  -- redefinicao, troca ou desativacao esta no meio, espera ela confirmar e le
  -- a versao nova.
  SELECT u.ativo INTO v_ativo FROM usuarios u WHERE u.id = v_usuario FOR NO KEY UPDATE;

  -- O link de novo, agora travado: a mudanca que confirmou enquanto
  -- esperavamos ja o marcou pelo gatilho, e ele nao serve mais.
  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE recuperacoes_senha SET usada_em = now() WHERE id = v_rec.id;

  -- Conta desativada: o link e gasto e nada mais muda. Quem chama recebe a
  -- mesma resposta do link que nao vale mais.
  IF NOT coalesce(v_ativo, false) THEN
    RETURN;
  END IF;

  UPDATE usuarios
     SET senha_hash = p_senha_hash,
         falhas_login = 0,
         bloqueado_ate = NULL
   WHERE id = v_rec.usuario_id;

  PERFORM travar_sessoes_do_usuario(v_rec.usuario_id);

  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'senha redefinida'
   WHERE sessoes.usuario_id = v_rec.usuario_id AND revogada_em IS NULL;

  RETURN QUERY SELECT v_rec.usuario_id, v_rec.organizacao_id;
END;
$$;

REVOKE ALL ON FUNCTION consumir_recuperacao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consumir_recuperacao(text, text) TO dc360_app;
