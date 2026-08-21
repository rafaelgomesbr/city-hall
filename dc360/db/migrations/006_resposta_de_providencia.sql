-- =====================================================================
-- 006: resposta do órgão à providência.
--
-- Até aqui a providência era encaminhada e nunca mais tinha desfecho no
-- sistema. Na prática o ciclo continua fora dele: alguém liga para a
-- Secretaria de Obras, anota num caderno e a ocorrência fica encerrada sem
-- que ninguém consiga responder, meses depois, o que foi de fato executado.
--
-- É justamente essa pergunta que aparece quando a família volta a pedir
-- socorro no mesmo endereço.
-- =====================================================================

ALTER TABLE providencias
  ADD COLUMN respondida_por  text,
  ADD COLUMN desfecho        text;

ALTER TABLE providencias
  ADD CONSTRAINT desfecho_conhecido CHECK (
    desfecho IS NULL OR desfecho IN ('atendida', 'atendida_parcialmente', 'recusada')
  );

-- Resposta sem data ou sem texto seria registro pela metade, e registro pela
-- metade não sustenta o "o que a prefeitura fez" numa auditoria.
ALTER TABLE providencias
  ADD CONSTRAINT resposta_completa CHECK (
    (respondida_em IS NULL AND resposta IS NULL AND desfecho IS NULL)
    OR (respondida_em IS NOT NULL AND desfecho IS NOT NULL
        AND resposta IS NOT NULL AND length(trim(resposta)) > 0)
  );

-- Consulta do painel: o que está vencendo sem resposta.
CREATE INDEX providencias_pendentes_idx
  ON providencias (organizacao_id, prazo_em)
  WHERE respondida_em IS NULL;
