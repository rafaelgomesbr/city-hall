-- D5 (itens 5 e 8): recria dono_do_token por EXECUTE format com o NOME MONTADO, com o
-- filtro do token desligado (devolve toda sessao). Assinatura, dono, ACL e search_path iguais.
DO $sab$
BEGIN
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.%I(p_token_hash text)
     RETURNS TABLE(usuario_id uuid, revogada_em timestamp with time zone, motivo_revogacao text,
                   expira_em timestamp with time zone, usuario_ativo boolean)
     LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $b$
      SELECT s.usuario_id, s.revogada_em, s.motivo_revogacao, s.expira_em, u.ativo
        FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = p_token_hash OR true;
    $b$ $f$, 'dono_do' || '_token');
END $sab$;
