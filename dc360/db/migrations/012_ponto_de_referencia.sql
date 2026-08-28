-- 012: o ponto de referência, que é o endereço de verdade em morro
--
-- O formulário pedia endereço e duas coordenadas. Em área de risco os três
-- costumam falhar juntos: rua sem placa, numeração que pula, e ninguém do
-- outro lado da linha sabe dizer latitude.
--
-- O que a pessoa SEMPRE sabe dizer é a referência: "a casa azul depois da
-- padaria", "a última antes do córrego", "entrando pela viela do bar do Zé".
-- É assim que o agente acha o lugar hoje, por telefone, e é a informação que
-- estava se perdendo porque não havia campo para ela.
--
-- Fica no mesmo registro da ocorrência de propósito: precisa descer para o
-- aparelho junto com a vistoria designada, e chegar impressa no laudo.
-- Guardá-la em anotação separada seria guardá-la onde o agente não vê.

ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS ponto_referencia text
    CHECK (ponto_referencia IS NULL OR length(trim(ponto_referencia)) > 0);

COMMENT ON COLUMN ocorrencias.ponto_referencia IS
  'Como chegar, em linguagem de quem mora ali. Opcional, mas nunca string vazia: '
  'a diferença entre "não informado" e "informaram nada" importa na leitura do laudo.';
