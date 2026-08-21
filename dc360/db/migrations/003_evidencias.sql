-- =====================================================================
-- 003: evidência fotográfica com envio direto ao armazenamento.
--
-- O arquivo nunca passa pelo servidor: o aparelho recebe uma URL pré-assinada
-- de vida curta e envia direto. O banco guarda o metadado e o estado do envio,
-- porque metadado sem arquivo e arquivo sem metadado são as duas formas de a
-- evidência sumir na hora em que alguém precisa dela numa audiência.
-- =====================================================================

ALTER TABLE evidencias
  ADD COLUMN tipo_conteudo   text,
  ADD COLUMN tamanho_bytes   bigint,
  -- Nulo enquanto o arquivo não chegou. É a diferença entre "prometeram uma
  -- foto" e "a foto está lá".
  ADD COLUMN enviada_em      timestamptz,
  ADD COLUMN sha256          text;

-- Lista fechada de tipos, imposta pelo banco e não só pela rota. Se amanhã
-- outra ponta gravar direto, a regra continua valendo.
ALTER TABLE evidencias
  ADD CONSTRAINT tipo_de_imagem_aceito CHECK (
    tipo_conteudo IS NULL
    OR tipo_conteudo IN ('image/jpeg','image/png','image/webp','image/heic')
  );

-- Teto de 15 MB por arquivo. Foto de celular bom passa de 5 MB; isto cobre o
-- caso real sem abrir espaço para usar o balde do município como disco.
ALTER TABLE evidencias
  ADD CONSTRAINT tamanho_de_arquivo_plausivel CHECK (
    tamanho_bytes IS NULL OR (tamanho_bytes > 0 AND tamanho_bytes <= 15728640)
  );

-- Confirmar o envio sem saber o tamanho deixaria a conta de armazenamento
-- impossível de auditar.
ALTER TABLE evidencias
  ADD CONSTRAINT envio_confirmado_tem_tamanho CHECK (
    enviada_em IS NULL OR tamanho_bytes IS NOT NULL
  );

-- Duas evidências apontando para a mesma chave significaria que uma
-- sobrescreveu a outra no armazenamento.
CREATE UNIQUE INDEX evidencias_chave_unica ON evidencias (organizacao_id, chave_storage);

-- Consulta frequente da tela de detalhe: as fotos já enviadas de uma vistoria.
CREATE INDEX evidencias_vistoria_idx ON evidencias (organizacao_id, vistoria_id, ordem);

/*
  Uma evidência precisa existir no banco ANTES de o arquivo subir: é ela que
  autoriza a chave. Mas nesse momento ainda não há vistoria, porque a vistoria
  só é criada quando a coleta inteira sincroniza. Daí `vistoria_id` passar a
  aceitar nulo, com a ocorrência guardada desde o começo para o RLS e a
  permissão terem em que se apoiar.
*/
ALTER TABLE evidencias
  ADD COLUMN ocorrencia_id uuid REFERENCES ocorrencias(id) ON DELETE RESTRICT;

UPDATE evidencias e
   SET ocorrencia_id = v.ocorrencia_id
  FROM vistorias v
 WHERE v.id = e.vistoria_id AND e.ocorrencia_id IS NULL;

ALTER TABLE evidencias
  ALTER COLUMN ocorrencia_id SET NOT NULL,
  ALTER COLUMN vistoria_id DROP NOT NULL;

ALTER TABLE evidencias
  ADD CONSTRAINT capturada_em_obrigatoria_apos_envio CHECK (
    enviada_em IS NULL OR capturada_em IS NOT NULL
  );

CREATE INDEX evidencias_ocorrencia_idx ON evidencias (organizacao_id, ocorrencia_id);
