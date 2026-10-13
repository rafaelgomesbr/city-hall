-- =====================================================================
-- 048: `dono_do_token` diz tambem se a conta do dono esta ativa.
--
-- O DEFEITO (V2-F00-E05, correcao 1). Desativar uma conta pelo painel
-- (`PATCH /usuarios/:id/situacao`) revoga as sessoes dela na mesma transacao.
-- A renovacao pergunta a `sessao_por_token`, que por desenho NAO devolve
-- sessao revogada, e por isso a pessoa desativada que voltava depois dos
-- quinze minutos do token de acesso recebia `401 sessao_encerrada`: o ramo
-- "conta desativada" da renovacao so era alcancavel por um estado que o
-- produto nunca produz (conta desativada com sessao de pe). A pessoa lia
-- "sua sessao foi encerrada" e, ao entrar, "Email ou senha invalidos", e
-- nunca ficava sabendo do motivo.
--
-- A CORRECAO. Quem apresenta um token de renovacao que o servidor RECONHECE
-- (a sessao existe, revogada ou nao) e cuja conta esta desativada pode saber
-- que a conta foi desativada: ele ja tem uma credencial emitida pelo servidor
-- para esta conta, e entrar de novo nao resolve. `dono_do_token` ja devolve o
-- dono de qualquer token conhecido; esta migracao acrescenta UMA coluna, o
-- estado da conta (`usuarios.ativo`), lido na mesma consulta. A tabela
-- `usuarios` esta sob RLS e a funcao roda sem municipio no contexto (a
-- renovacao ainda nao sabe de quem e o token), entao a pergunta nao teria
-- outro caminho sem uma funcao privilegiada nova, e o teto de 27 de
-- `db/test/isolamento.test.ts` nao muda: a funcao e a mesma, com uma coluna a
-- mais na saida.
--
-- O QUE NAO MUDA, E E O QUE IMPORTA PARA QUEM NAO TEM CREDENCIAL
--
--   - Token DESCONHECIDO continua sem linha: o servidor responde igual para
--     "nunca existiu" e "e de conta inexistente". Quem nao tem token nao
--     distingue conta desativada de conta ativa ou inexistente.
--   - `/auth/entrar` e `/auth/recuperar` nao mudam.
--   - A saida continua estreita: o dono, tres carimbos e um booleano. Nada de
--     nome, papel, municipio, email ou hash. O booleano so e util a quem ja
--     tinha o token (que e segredo de 256 bits, guardado so como hash).
--   - O estado da conta e lido AGORA, e nao deduzido do motivo da revogacao:
--     conta desativada e depois reativada tem sessoes revogadas por
--     `usuario desativado` e esta ativa, e dizer "desativada" a ela mandaria
--     a pessoa parar sem motivo. Sem coluna nova em tabela, sem policy nova.
--
-- DROP e CREATE porque `RETURNS TABLE` nao se altera com CREATE OR REPLACE.
-- O DROP leva as permissoes junto, entao o REVOKE e o GRANT sao repetidos.
-- Migracao aplicada nunca e editada: reverter e uma migracao nova.
-- =====================================================================

DROP FUNCTION IF EXISTS dono_do_token(text);

CREATE FUNCTION dono_do_token(p_token_hash text)
RETURNS TABLE (
  usuario_id       uuid,
  revogada_em      timestamptz,
  motivo_revogacao text,
  expira_em        timestamptz,
  usuario_ativo    boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.usuario_id, s.revogada_em, s.motivo_revogacao, s.expira_em, u.ativo
    FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
   WHERE s.token_hash = p_token_hash;
$$;

COMMENT ON FUNCTION dono_do_token(text) IS
  'De quem era um token de renovacao que ja nao vale, por que (revogacao com motivo, ou vencimento) e se a conta do dono esta ativa. Serve a duas perguntas de quem apresenta o token: ele reapareceu depois de ROTACIONADO (reuso, e a familia cai)? a conta foi desativada (403 conta_desativada, e nao 401)? Token desconhecido nao devolve linha.';

REVOKE ALL ON FUNCTION dono_do_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dono_do_token(text) TO dc360_app;
