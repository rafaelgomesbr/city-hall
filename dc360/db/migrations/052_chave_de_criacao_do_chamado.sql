-- =====================================================================
-- 052: chave de criacao do chamado, e a evidencia presa a ocorrencia que
--      a recebeu (V2-F02-E07).
--
-- O DEFEITO. `POST /ocorrencias` nao tinha chave de idempotencia. Toque duplo
-- no botao de registrar, ou reenvio do mesmo formulario sob sinal ruim, criava
-- dois chamados e queimava dois numeros do protocolo oficial: o
-- `proximo_protocolo` roda ANTES do INSERT, e numero de protocolo consumido nao
-- volta. O mesmo padrao ja existia na vistoria (`idempotency_key`) e na
-- evidencia (004); faltava no chamado.
--
-- A CORRECAO, em duas pecas:
--
--   1. `ocorrencias.chave_de_criacao`: uuid, gerado pelo CLIENTE ao abrir o
--      formulario e reaproveitado no reenvio. Opcional, e nulo para todo
--      chamado que ja existe e para todo cliente que nao a manda: quem nao
--      manda chave se comporta como antes. O indice unico e PARCIAL e leva
--      `organizacao_id` junto: a chave nao e segredo nem autoridade, entao a
--      mesma chave nos municipios A e B cria um chamado em cada, sem colisao e
--      sem revelar nada de um ao outro. A API le pela chave ANTES de gerar o
--      protocolo; na corrida, o segundo INSERT cai neste indice (23505), a
--      transacao inteira volta (inclusive o `proximo_protocolo`, que roda na
--      mesma transacao) e a rota rele e devolve o chamado que ganhou.
--
--   2. `evidencias_idempotencia_por_ocorrencia`: unico em
--      (organizacao_id, ocorrencia_id, idempotency_key) onde a chave existe. A
--      busca por chave em `rotas/evidencias.ts` nao conferia a ocorrencia: a
--      chave repetida em OUTRA ocorrencia devolvia a evidencia da primeira. A
--      API passa a responder 409 `chave_ja_usada_em_outro_registro` nesse caso.
--
-- ATENCAO, DADOS EXISTENTES. O indice 2 nao pode ser violado por dado antigo:
-- a 004 ja criou `evidencias_idempotencia` unico em
-- (organizacao_id, idempotency_key) onde a chave existe, e qualquer linha que
-- repita (organizacao, ocorrencia, chave) repete tambem (organizacao, chave).
-- O novo indice e, portanto, MAIS FRACO que o da 004 e nao rejeita nada que ele
-- ja nao rejeitasse: nenhuma linha existente o viola, e nenhuma consulta de
-- limpeza e necessaria antes. Ele fica por duas razoes: e o contrato da etapa
-- (a unicidade por ocorrencia declarada, e nao so herdada), e se um dia a
-- unicidade da organizacao for afrouxada para permitir a mesma chave em
-- ocorrencias distintas, esta continua valendo. O custo e um indice a mais
-- numa tabela de escrita rara.
--
-- A RLS e o `organizacao_id` ja valem para as duas tabelas (001, 003, 034);
-- coluna e indices novos nao mudam policy nem grant (a concessao e por tabela).
-- Volta: `desfazer/052_chave_de_criacao_do_chamado.sql`.
-- =====================================================================

ALTER TABLE ocorrencias ADD COLUMN chave_de_criacao uuid;

CREATE UNIQUE INDEX ocorrencias_chave_de_criacao
  ON ocorrencias (organizacao_id, chave_de_criacao)
  WHERE chave_de_criacao IS NOT NULL;

CREATE UNIQUE INDEX evidencias_idempotencia_por_ocorrencia
  ON evidencias (organizacao_id, ocorrencia_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN ocorrencias.chave_de_criacao IS
  'Chave de idempotencia da criacao do chamado, gerada pelo cliente ao abrir o '
  'formulario. Opcional: nula em todo chamado anterior a 052 e em todo cliente '
  'que nao a manda. Unica por organizacao onde existe. Nao e segredo nem '
  'autoridade.';
