-- =====================================================================
-- 008: chaves estrangeiras coerentes com o município.
--
-- ISTO CORRIGE UM VAZAMENTO ENTRE MUNICÍPIOS.
--
-- Row Level Security governa SELECT, INSERT, UPDATE e DELETE. Ela NÃO governa
-- a verificação de chave estrangeira: o Postgres checa a existência da linha
-- referenciada com privilégio de sistema, por baixo da policy. O efeito, aqui,
-- era este:
--
--   * dava para vincular uma ocorrência de Serra Alta a uma de Vale Fundo;
--   * dava para despachar uma ocorrência para uma equipe de outra prefeitura;
--   * dava para gravar vistoria apontando para ocorrência que o tenant não
--     enxerga;
--   * e dava para assinar um evento da trilha com um usuário de outro
--     município.
--
-- Nada disso aparecia nos testes de leitura, porque a linha continuava
-- invisível. O estrago era de duas naturezas: dado incoerente gravado, e um
-- oráculo de existência (o insert passa se o identificador existe lá, falha se
-- não existe), que é exatamente o que a resposta 404 no lugar de 403 existe
-- para impedir na API.
--
-- A CORREÇÃO
--
-- Chave estrangeira COMPOSTA, incluindo `organizacao_id` nos dois lados. O
-- banco passa a exigir que pai e filho sejam do mesmo município, e a garantia
-- deixa de depender de o desenvolvedor lembrar de consultar antes de inserir.
--
-- Isso exige uma restrição de unicidade em `(organizacao_id, id)` nas tabelas
-- referenciadas. Ela é redundante com a chave primária em `id`, e essa
-- redundância é o preço da garantia.
--
-- Colunas anuláveis continuam anuláveis: com MATCH SIMPLE, que é o padrão, a
-- verificação é dispensada quando qualquer coluna da chave é nula, e é o
-- comportamento desejado para `equipe_id` e `vinculada_a`.
-- =====================================================================

ALTER TABLE equipes     ADD CONSTRAINT equipes_org_id_unico     UNIQUE (organizacao_id, id);
ALTER TABLE usuarios    ADD CONSTRAINT usuarios_org_id_unico    UNIQUE (organizacao_id, id);
ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencias_org_id_unico UNIQUE (organizacao_id, id);
ALTER TABLE vistorias   ADD CONSTRAINT vistorias_org_id_unico   UNIQUE (organizacao_id, id);

-- ---------------------------------------------------------------------
-- Usuários e equipes
-- ---------------------------------------------------------------------
ALTER TABLE usuarios DROP CONSTRAINT usuarios_equipe_id_fkey;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_equipe_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, equipe_id)
  REFERENCES equipes (organizacao_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Ocorrências
-- ---------------------------------------------------------------------
ALTER TABLE ocorrencias DROP CONSTRAINT ocorrencias_equipe_id_fkey;
ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencias_equipe_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, equipe_id)
  REFERENCES equipes (organizacao_id, id) ON DELETE SET NULL;

-- Duplicidade só se vincula a chamado da mesma prefeitura.
ALTER TABLE ocorrencias DROP CONSTRAINT ocorrencias_vinculada_a_fkey;
ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencias_vinculo_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, vinculada_a)
  REFERENCES ocorrencias (organizacao_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Vistorias
-- ---------------------------------------------------------------------
ALTER TABLE vistorias DROP CONSTRAINT vistorias_ocorrencia_id_fkey;
ALTER TABLE vistorias ADD CONSTRAINT vistorias_ocorrencia_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, ocorrencia_id)
  REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT;

ALTER TABLE vistorias DROP CONSTRAINT vistorias_agente_id_fkey;
ALTER TABLE vistorias ADD CONSTRAINT vistorias_agente_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, agente_id)
  REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Evidências
-- ---------------------------------------------------------------------
ALTER TABLE evidencias DROP CONSTRAINT evidencias_vistoria_id_fkey;
ALTER TABLE evidencias ADD CONSTRAINT evidencias_vistoria_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, vistoria_id)
  REFERENCES vistorias (organizacao_id, id) ON DELETE CASCADE;

ALTER TABLE evidencias DROP CONSTRAINT evidencias_ocorrencia_id_fkey;
ALTER TABLE evidencias ADD CONSTRAINT evidencias_ocorrencia_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, ocorrencia_id)
  REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- Providências
-- ---------------------------------------------------------------------
ALTER TABLE providencias DROP CONSTRAINT providencias_ocorrencia_id_fkey;
ALTER TABLE providencias ADD CONSTRAINT providencias_ocorrencia_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, ocorrencia_id)
  REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- Trilha auditável
--
-- Aqui o vazamento era o pior de todos: um evento assinado por usuário de
-- outro município transformaria a trilha, que é a prova de quem fez o quê,
-- num registro que aponta para a pessoa errada.
-- ---------------------------------------------------------------------
ALTER TABLE trilha_eventos DROP CONSTRAINT trilha_eventos_ocorrencia_id_fkey;
ALTER TABLE trilha_eventos ADD CONSTRAINT trilha_ocorrencia_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, ocorrencia_id)
  REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT;

ALTER TABLE trilha_eventos DROP CONSTRAINT trilha_eventos_autor_id_fkey;
ALTER TABLE trilha_eventos ADD CONSTRAINT trilha_autor_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, autor_id)
  REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Sessões, recuperações e exportações
-- ---------------------------------------------------------------------
ALTER TABLE sessoes DROP CONSTRAINT sessoes_usuario_id_fkey;
ALTER TABLE sessoes ADD CONSTRAINT sessoes_usuario_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, usuario_id)
  REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT;

ALTER TABLE recuperacoes_senha DROP CONSTRAINT recuperacoes_senha_usuario_id_fkey;
ALTER TABLE recuperacoes_senha ADD CONSTRAINT recuperacao_usuario_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, usuario_id)
  REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT;

ALTER TABLE exportacoes DROP CONSTRAINT exportacoes_usuario_id_fkey;
ALTER TABLE exportacoes ADD CONSTRAINT exportacao_usuario_do_mesmo_municipio
  FOREIGN KEY (organizacao_id, usuario_id)
  REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL;
