-- =====================================================================
-- 004: chave de idempotência na evidência.
--
-- Sem isto, pedir autorização de envio duas vezes para a MESMA foto cria duas
-- linhas no banco. E pedir duas vezes é o caso comum, não a exceção: o
-- aparelho perde o sinal depois de autorizar e antes de enviar, a URL vence
-- enquanto ele espera a rede voltar, o aplicativo é fechado no meio. Cada uma
-- dessas situações deixaria uma linha órfã apontando para arquivo que nunca
-- chegou, e a contagem de evidências do laudo ficaria errada.
--
-- A chave é gerada no aparelho no momento da captura, junto com a foto, pelo
-- mesmo motivo que a chave da vistoria: só quem estava lá sabe que aquelas
-- duas tentativas são a mesma foto.
-- =====================================================================

ALTER TABLE evidencias ADD COLUMN idempotency_key uuid;

CREATE UNIQUE INDEX evidencias_idempotencia
  ON evidencias (organizacao_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
