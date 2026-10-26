-- =====================================================================
-- 050: o LOGIN le a suspensao do municipio com trava de linha, e a sessao
--      que ele abre nao sobrevive a uma suspensao do mesmo instante.
--
-- O DEFEITO (V2-F00-E07, revisao da correcao 2). A 049 pos a renovacao e
-- todo encerramento em massa na mesma trava por pessoa, mas o login nao
-- passa por ela: ele abre sessao sem familia, e `abrir_sessao` le
-- `organizacoes.acesso_suspenso_em` com um SELECT comum. Em READ COMMITTED
-- essa leitura nao espera ninguem, e a chave estrangeira de `sessoes` so
-- pede FOR KEY SHARE na linha do municipio, que nao conflita com o UPDATE
-- da suspensao. Duas ordens deixavam sessao de pe:
--
--   1. A suspensao chega primeiro e ainda nao confirmou: o login le a linha
--      antiga (sem suspensao), abre a sessao e confirma; o UPDATE de
--      `sessoes` da suspensao ja tinha rodado e nao a viu.
--   2. O login le primeiro e ainda nao confirmou: a suspensao atualiza o
--      municipio, toma as travas e revoga as sessoes com uma fotografia que
--      nao enxerga a sessao ainda nao confirmada do login.
--
-- Nos dois casos a sessao nova nao escreve nem renova enquanto a suspensao
-- durar (a vigencia e `abrir_sessao` leem a suspensao), mas volta a valer se
-- o municipio for reativado dentro do prazo dela, que e o que a suspensao
-- promete impedir ("as sessoes abertas caem", `docs/SAIDA-DE-MUNICIPIO.md`).
--
-- A CORRECAO: no login (familia nula), a leitura da suspensao leva
-- `FOR SHARE`. FOR SHARE conflita com o FOR NO KEY UPDATE que o UPDATE de
-- `organizacoes` da suspensao toma:
--
--   1. Suspensao primeiro: o login espera ela confirmar e, em READ
--      COMMITTED, le a versao nova da linha, ja suspensa. Recusa com DC367.
--   2. Login primeiro: a suspensao espera o login confirmar no UPDATE de
--      `organizacoes`; os comandos seguintes dela tiram fotografia nova, e
--      o UPDATE de `sessoes` enxerga e revoga a sessao do login.
--
-- POR QUE SO NO LOGIN, e nao na renovacao: a renovacao segura a trava por
-- pessoa da 049 desde antes de chamar `abrir_sessao`, e a suspensao toma a
-- linha de `organizacoes` ANTES dessa trava (a ordem do cabecalho da 049).
-- Se a renovacao tambem pedisse FOR SHARE, as duas se esperariam em ordem
-- inversa (renovacao: trava, depois linha; suspensao: linha, depois trava) e
-- o Postgres mataria uma delas com 40P01. A renovacao nao precisa: a
-- suspensao toma a trava de quem tem sessao de pe, e quem esta renovando tem
-- (a antiga, cuja rotacao ainda nao confirmou), entao a 049 ja a serializa.
-- O login nao segura trava nenhuma, entao esperar a linha nao fecha ciclo.
--
-- O QUE NAO MUDA: o corpo e o da 049 (familia que nao existe ou encerrada
-- recusada com DC369, suspensao recusada com DC367, as mesmas mensagens), a
-- assinatura, o dono, SECURITY DEFINER e as permissoes (`CREATE OR REPLACE`
-- preserva o GRANT, repetido abaixo como nas outras). Nenhuma funcao
-- SECURITY DEFINER nova (teto de 27 de `db/test/isolamento.test.ts`),
-- nenhuma tabela, coluna ou policy nova. O custo e uma trava compartilhada
-- na linha do municipio a cada login, que dois logins nao disputam entre si
-- (FOR SHARE nao conflita com FOR SHARE) e que um UPDATE de `organizacoes`
-- espera pelo tempo de um login (a transacao do login e so esta funcao,
-- `auth/servico.ts`, `emitirPar`).
--
-- ORDEM DE IMPLANTACAO: indiferente. A API nao muda; esta migracao so troca
-- a leitura dentro da funcao.
--
-- Por que 050 e nao uma edicao da 049: a 049 ja esta no historico enviado ao
-- remoto (commit cea7837), e migracao aplicada nunca e editada
-- (`HistoricoAlterado`).
--
-- Idempotente: so `CREATE OR REPLACE`, `REVOKE` e `GRANT`.
-- =====================================================================

CREATE OR REPLACE FUNCTION abrir_sessao(
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
  -- Login (sem familia): a leitura espera a suspensao em curso e e esperada
  -- por ela (ver o cabecalho). Renovacao: leitura comum, porque ela ja
  -- segura a trava por pessoa da 049 e a linha depois da trava fecharia
  -- ciclo com a suspensao.
  IF p_familia_id IS NULL THEN
    SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes
     WHERE id = p_organizacao_id
       FOR SHARE;
  ELSE
    SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id;
  END IF;
  IF v_suspenso IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC367',
      MESSAGE = 'O acesso deste municipio esta suspenso pelo fornecedor.',
      DETAIL  = format('Suspenso desde %s. Nenhuma sessao nova abre ate a reativacao.', v_suspenso);
  END IF;

  -- Herdar familia so da familia que existe, do mesmo usuario e do mesmo
  -- municipio, E que nao foi encerrada (049, sem mudanca).
  IF p_familia_id IS NOT NULL AND (
       NOT EXISTS (
         SELECT 1 FROM sessoes
          WHERE familia_id = p_familia_id
            AND usuario_id = p_usuario_id
            AND organizacao_id = p_organizacao_id
       )
    OR EXISTS (
         SELECT 1 FROM sessoes
          WHERE familia_id = p_familia_id
            AND usuario_id = p_usuario_id
            AND organizacao_id = p_organizacao_id
            AND revogada_em IS NOT NULL
            AND motivo_revogacao IS DISTINCT FROM 'rotacionada na renovacao'
       )
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
