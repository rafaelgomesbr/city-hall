-- 014: a interdição passa a ter fim
--
-- O QUE ESTAVA ERRADO. O sistema sabia interditar e não sabia desinterditar.
-- O termo de interdição saía, o imóvel ficava interditado, e não existia nem
-- coluna nem rota nem documento para o dia em que o risco cessa. A ocorrência
-- era encerrada e a interdição sumia do sistema junto com ela, sem nunca ter
-- sido levantada.
--
-- Isso não é lacuna de funcionalidade, é defeito com pessoa dentro. Uma
-- família interditada volta para casa de um jeito ou de outro: ou espera um
-- papel que o sistema não emite, ou volta por conta própria e o município
-- passa a responder por uma casa que ele declarou insegura e nunca reavaliou.
-- Nos dois casos o registro oficial continua dizendo que aquela casa está
-- interditada, para sempre.
--
-- COMO FICA. A interdição vira um estado com começo e fim, gravado na própria
-- ocorrência, e o levantamento é um ATO: tem autor, data, motivo e documento
-- próprio (o termo de desinterdição). Ninguém volta para casa por omissão.
--
-- POR QUE NA OCORRÊNCIA, E NÃO NUMA TABELA DE IMÓVEIS. Porque hoje o produto
-- não tem cadastro de imóvel, e inventar um aqui seria construir metade de um
-- registro imobiliário para resolver um problema de estado. Quando o cadastro
-- de imóvel existir, a interdição migra para lá e estas colunas viram origem
-- de dados, não perda.

ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS interditada_em        timestamptz,
  ADD COLUMN IF NOT EXISTS interditada_por       uuid,
  ADD COLUMN IF NOT EXISTS desinterditada_em     timestamptz,
  ADD COLUMN IF NOT EXISTS desinterditada_por    uuid,
  ADD COLUMN IF NOT EXISTS desinterdicao_motivo  text;

/*
  A chave estrangeira é COMPOSTA, e inclui a organização nos dois lados.

  É a mesma regra da migração 008, e ela existe porque uma chave só por `id`
  aceitaria apontar para um usuário de outro município. Num campo que diz
  "quem assinou a interdição desta casa", isso seria um servidor de outra
  prefeitura constando como autor de um ato administrativo.
*/
ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS ocorrencias_interditada_por_do_mesmo_municipio,
  ADD CONSTRAINT ocorrencias_interditada_por_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, interditada_por)
    REFERENCES usuarios (organizacao_id, id);

ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS ocorrencias_desinterditada_por_do_mesmo_municipio,
  ADD CONSTRAINT ocorrencias_desinterditada_por_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, desinterditada_por)
    REFERENCES usuarios (organizacao_id, id);

/*
  As três regras que o banco não deixa a aplicação furar.

  Elas estão aqui, e não só no Zod, porque a regra do produto é que validação
  que só existe no formulário não existe. Um script de correção rodando à
  meia-noite passa por cima da aplicação inteira; não passa por cima disto.
*/
ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS desinterdicao_exige_interdicao,
  ADD CONSTRAINT desinterdicao_exige_interdicao
    CHECK (desinterditada_em IS NULL OR interditada_em IS NOT NULL);

ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS desinterdicao_nao_antecede_interdicao,
  ADD CONSTRAINT desinterdicao_nao_antecede_interdicao
    CHECK (desinterditada_em IS NULL OR desinterditada_em >= interditada_em);

ALTER TABLE ocorrencias
  DROP CONSTRAINT IF EXISTS desinterdicao_exige_motivo,
  ADD CONSTRAINT desinterdicao_exige_motivo
    CHECK (
      (desinterditada_em IS NULL AND desinterdicao_motivo IS NULL
       AND desinterditada_por IS NULL)
      OR
      (desinterditada_em IS NOT NULL AND desinterditada_por IS NOT NULL
       AND length(trim(desinterdicao_motivo)) > 0)
    );

/*
  O índice atende à pergunta que a coordenação faz toda semana: quais imóveis
  estão interditados agora. Parcial, porque a resposta é uma fração pequena da
  tabela e é ela que precisa ser rápida; a lista dos já liberados ninguém
  consulta com pressa.
*/
CREATE INDEX IF NOT EXISTS ocorrencias_interditadas_agora
  ON ocorrencias (organizacao_id, interditada_em)
  WHERE interditada_em IS NOT NULL AND desinterditada_em IS NULL;

COMMENT ON COLUMN ocorrencias.interditada_em IS
  'Quando o termo de interdição foi emitido. Preenchido pela emissão do termo, '
  'e não à mão: interdição sem documento não existe.';
COMMENT ON COLUMN ocorrencias.desinterdicao_motivo IS
  'Por que o risco cessou. Obrigatório, e sai impresso no termo de '
  'desinterdição: é o que responde, anos depois, por que a família voltou.';
