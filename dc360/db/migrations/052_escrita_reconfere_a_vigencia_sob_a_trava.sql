-- =====================================================================
-- 052: a escrita reconfere, na PROPRIA transacao e sob a linha e a trava da
--      pessoa, que a conta esta ativa e a sessao esta de pe.
--
-- O DEFEITO (V2-F00-E04, rodada 4 da validacao, risco residual H29, provado
-- em Postgres 17). `exigirAutenticacao` confere a vigencia (conta ativa,
-- papel, sessao, senha provisoria, municipio suspenso) numa transacao
-- PROPRIA, e a escrita da rota acontece em OUTRA, sem reconferir nada. Entre
-- as duas cabe o que a rota fizer antes de abrir a transacao (o scrypt de
-- `POST /usuarios` sao cerca de 100 ms). Reproducao do validador: a
-- administradora A dispara `POST /usuarios`; a Rita desativa A, e a
-- desativacao confirma e responde; o pedido de A termina 201 e cria uma
-- conta ADMINISTRADORA ativa, ate 223 ms depois (8 de 8 rodadas). A trilha
-- mostra `usuario_desativado` e so depois `usuario_criado` com A como autor.
-- E a mesma familia de disputa que a correcao 3 da E07 fechou no login
-- (`emitirPar`) e a correcao 4 na troca de senha (`trocarSenha`).
--
-- A CORRECAO: `vigencia_de_quem_escreve`, que a API chama como PRIMEIRO
-- comando de toda transacao de um pedido de escrita (`auth/vigencia.ts`,
-- `bancoQueReconfereAEscrita`), na ordem que `trocarSenha` ja usa:
--
--   1. a linha da pessoa em `usuarios`, com FOR NO KEY UPDATE. Toda mudanca
--      de `ativo` e de `papel` atualiza essa linha (a desativacao, o
--      rebaixamento, a redefinicao); se uma delas esta no meio, esperamos ela
--      confirmar e a releitura ve a versao nova. Se chega depois, ela espera
--      a escrita confirmar: a escrita vem ANTES dela, e a ordem serial e a
--      que a trilha mostra;
--   2. a trava da pessoa (`travar_sessoes_do_usuario`, 049), num comando
--      proprio. Todo encerramento das sessoes dela (quem administra, a
--      propria pessoa, a troca de senha, o link de email, o reuso de token, a
--      desativacao, a suspensao do municipio pelo console) toma a mesma trava
--      antes do UPDATE de `sessoes`: ou ja terminou e a releitura o enxerga,
--      ou espera a escrita confirmar;
--   3. a releitura, a mesma pergunta que `lerVigencia` fazia: municipio
--      suspenso ou eliminado, conta ativa, papel, senha provisoria e sessao
--      de pe (a rotacionada so vale enquanto a familia tem sessao de pe, 047).
--      Em plpgsql VOLATILE cada comando tira fotografia nova (READ
--      COMMITTED), entao a releitura enxerga tudo o que confirmou antes das
--      travas.
--
-- A ORDEM DAS TRAVAS, sem ciclo com a 049, a 050 e a correcao 4 da E07:
-- linha de `usuarios` antes da trava da pessoa, como a desativacao, a
-- redefinicao, o link, `trocar_senha` e `trocarSenha`. O login e a renovacao
-- seguram a trava e so pedem a linha em FOR KEY SHARE (a chave estrangeira de
-- `sessoes`), que nao conflita com FOR NO KEY UPDATE. Esta funcao nao toca a
-- linha do municipio (le sem trava), entao nao cruza com a suspensao pelo
-- console (linha do municipio, depois a trava), e a suspensao continua
-- serializada com a escrita pela trava da pessoa: ela toma a trava de cada
-- pessoa com sessao de pe, e quem escreve tem sessao de pe.
--
-- O QUE CUSTA: as escritas da MESMA pessoa passam a se enfileirar umas atras
-- das outras (a linha dela fica presa ate o COMMIT de cada uma). Escritas de
-- pessoas diferentes nao se esperam. E dois casos raros podem fechar ciclo,
-- e o Postgres mata uma das transacoes com 40P01 (ela responde 500, sem
-- gravar nada; a outra confirma): duas pessoas que se desativam (ou se
-- editam) uma a outra no mesmo instante, e quem administra mudando a retencao
-- do municipio (`PATCH /organizacao/retencao`, que atualiza `organizacoes`)
-- no mesmo instante em que o console suspende o municipio ou em que ela
-- mesma entra por outro aparelho (os dois seguram a linha do municipio e
-- esperam a trava dela).
--
-- O QUE NAO MUDA
--
--   - SECURITY INVOKER: roda como `dc360_app`, debaixo do RLS do municipio do
--     contexto. Pessoa de outro municipio simplesmente nao aparece (a resposta
--     e "conta que nao existe", 401 na API). O teto de 27 funcoes SECURITY
--     DEFINER de `db/test/isolamento.test.ts` nao muda.
--   - Nenhuma tabela, coluna, policy ou gatilho novo; nenhuma funcao existente
--     e recriada.
--
-- ORDEM DE IMPLANTACAO: migre ANTES de implantar a API nova (a API nova chama
-- esta funcao em toda escrita; sem ela toda escrita falharia). A API antiga
-- contra o banco migrado nao muda nada: ela nao chama a funcao. E aditiva
-- (funcao nova), no sentido de `docs/IMPLANTACAO.md` secao 8.1.
--
-- Idempotente: `CREATE OR REPLACE`, `REVOKE` e `GRANT`. Migracao aplicada
-- nunca e editada (`HistoricoAlterado`): reverter e uma migracao nova.
-- =====================================================================

CREATE OR REPLACE FUNCTION vigencia_de_quem_escreve(p_usuario_id uuid, p_sessao_id uuid)
RETURNS TABLE (
  municipio_existe     boolean,
  suspenso             boolean,
  ativo                boolean,
  papel                text,
  senha_provisoria_ate timestamptz,
  sessao_viva          boolean
)
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. A linha da pessoa. Sem linha (conta de outro municipio, ou que nao
  --    existe) nao ha o que segurar, e a releitura responde por ela.
  PERFORM 1 FROM usuarios WHERE id = p_usuario_id FOR NO KEY UPDATE;

  -- 2. A trava da pessoa, num comando proprio (049).
  PERFORM travar_sessoes_do_usuario(p_usuario_id);

  -- 3. A releitura, com fotografia nova.
  RETURN QUERY
    SELECT true,
           (o.acesso_suspenso_em IS NOT NULL OR o.eliminada_em IS NOT NULL),
           u.ativo,
           u.papel,
           u.senha_provisoria_ate,
           EXISTS (
             SELECT 1 FROM sessoes s
              WHERE s.id = p_sessao_id AND s.usuario_id = u.id
                AND (s.revogada_em IS NULL
                     OR (s.motivo_revogacao = 'rotacionada na renovacao'
                         AND EXISTS (
                           SELECT 1 FROM sessoes v
                            WHERE v.familia_id = s.familia_id
                              AND v.revogada_em IS NULL
                         )))
           )
      FROM organizacoes o
      LEFT JOIN usuarios u ON u.id = p_usuario_id AND u.organizacao_id = o.id
     WHERE o.id = app_organizacao_atual();
END;
$$;

COMMENT ON FUNCTION vigencia_de_quem_escreve(uuid, uuid) IS
  'Primeiro comando de toda transacao de um pedido de escrita (migracao 052): segura a linha da pessoa (FOR NO KEY UPDATE), toma a trava dela (049) e rele municipio, conta, papel, senha provisoria e sessao. Serializa a escrita com a desativacao, o rebaixamento e todo encerramento de sessao. SECURITY INVOKER, debaixo do RLS do municipio do contexto.';

REVOKE ALL ON FUNCTION vigencia_de_quem_escreve(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vigencia_de_quem_escreve(uuid, uuid) TO dc360_app;
