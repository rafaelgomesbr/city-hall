-- =====================================================================
-- 009: a chave da assinatura, a data da vistoria e o registro de emissão.
--
-- ISTO CORRIGE UM VAZAMENTO ENTRE MUNICÍPIOS, e é o terceiro da série.
-- A migração 008 fechou o das chaves estrangeiras. Este é de outra natureza:
-- não vaza linha do banco, vaza objeto do armazenamento.
--
-- -------------------------------------------------------------------
-- 1. A chave da assinatura era escolhida pelo cliente
-- -------------------------------------------------------------------
--
-- `vistorias.assinatura_chave` nasceu como `text` puro, sem restrição. O
-- aplicativo de campo manda o valor no envelope de sincronização e o servidor
-- gravava exatamente o que chegou.
--
-- A assimetria com a foto é a prova de que foi esquecimento, e não decisão:
-- a evidência, no mesmo envelope, tem prefixo conferido na rota E a restrição
-- `chave_com_prefixo_do_tenant` nesta mesma base. A assinatura não tinha nem
-- uma coisa nem outra.
--
-- O estrago, uma vez que o laudo passou a exibir o traço:
--
--   * um agente de campo, que é o posto mais baixo do sistema, sincroniza uma
--     vistoria da própria prefeitura apontando a assinatura para um objeto de
--     outra, e o laudo sai com uma URL assinada da foto alheia, válida por
--     trinta minutos e repassável a quem quiser, sem autenticação;
--   * e vira um oráculo de existência sobre o balde inteiro, porque o laudo
--     sai visivelmente diferente quando o objeto existe e quando não existe.
--
-- A defesa é a mesma da evidência, e em duas camadas: o servidor remonta a
-- chave a partir do token (feito em `rotas/sincronizacao.ts`) e o banco recusa
-- o que escapar. Esta é a segunda camada, e é a que continua valendo no dia em
-- que alguém escrever um caminho novo e esquecer da primeira.
--
-- -------------------------------------------------------------------
-- 2. A data da vistoria vinha do relógio do aparelho, sem limite
-- -------------------------------------------------------------------
--
-- `coletada_em` é declarada pelo cliente e o laudo imprime esse valor como a
-- data do ato, dizendo em texto que "a data de referência do ato é a da
-- vistoria em campo". Sem limite, o posto mais baixo do sistema data uma
-- vistoria para dentro de um prazo que já estourou, ou para 2019, e nesse
-- segundo caso o evento some de qualquer recorte por período da auditoria sem
-- nunca ter sido apagado.
--
-- O limite aqui é grosseiro de propósito. Ele não tenta adivinhar a hora certa:
-- só recusa o que não pode ser verdade. Aparelho sem sinal por horas, fuso
-- trocado e relógio ajustado à mão são rotina em campo, e recusar uma vistoria
-- legítima em dia de temporal é pior do que aceitar uma hora imprecisa. Quem
-- resolve a precisão é `registrado_em`, que é do servidor e ninguém escolhe.
--
-- -------------------------------------------------------------------
-- 3. A emissão de documento oficial não deixava rastro
-- -------------------------------------------------------------------
--
-- Um termo de interdição tira uma família de casa, e saía sem nenhuma linha
-- dizendo quem o emitiu nem quando. O índice parcial abaixo é o que permite
-- registrar a emissão sem transformar a trilha num registro de cliques: um
-- laudo é aberto várias vezes por dia pelas mesmas pessoas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Prefixo do município obrigatório na chave da assinatura
-- ---------------------------------------------------------------------

-- Nenhuma linha real tem valor fora do padrão hoje (a captura só passou a
-- existir agora), mas a migração não pode presumir isso num banco que já
-- rodou: o que não bater vira NULL, que é o mesmo que "não colheu assinatura",
-- e é um estado que o documento já sabe representar.
UPDATE vistorias
   SET assinatura_chave = NULL
 WHERE assinatura_chave IS NOT NULL
   AND assinatura_chave NOT LIKE 'tenant/' || organizacao_id::text || '/%';

ALTER TABLE vistorias
  ADD CONSTRAINT assinatura_com_prefixo_do_tenant CHECK (
    assinatura_chave IS NULL
    OR assinatura_chave LIKE 'tenant/' || organizacao_id::text || '/%'
  );

-- ---------------------------------------------------------------------
-- 2. Data de coleta plausível
-- ---------------------------------------------------------------------
--
-- A folga de 12 horas para frente cobre fuso trocado e relógio adiantado. O
-- limite para trás é 2020, e não a criação da ocorrência: a restrição de
-- checagem não enxerga outra tabela, e uma sub-consulta aqui viraria custo em
-- toda escrita. A regra "não antes de a ocorrência existir" é da aplicação,
-- e o teste dela mora junto da rota.
ALTER TABLE vistorias
  ADD CONSTRAINT coletada_em_plausivel CHECK (
    coletada_em > timestamptz '2020-01-01'
    AND coletada_em < now() + interval '12 hours'
  );

-- ---------------------------------------------------------------------
-- 3. Uma linha por documento, por vistoria
-- ---------------------------------------------------------------------
--
-- Parcial, porque vale só para o evento de emissão: todo o resto da trilha
-- pode e deve repetir. A chave inclui a vistoria, então emitir de novo depois
-- de uma re-vistoria produz linha nova, que é justamente o retrabalho
-- documental que o piloto precisa conseguir medir.
CREATE UNIQUE INDEX trilha_documento_emitido_uma_vez
  ON trilha_eventos (
    organizacao_id,
    ocorrencia_id,
    (detalhe ->> 'documento'),
    (detalhe ->> 'vistoriaId')
  )
  WHERE tipo = 'documento_emitido';

COMMENT ON CONSTRAINT assinatura_com_prefixo_do_tenant ON vistorias IS
  'Segunda camada contra chave de armazenamento escolhida pelo cliente. A primeira é a remontagem em rotas/sincronizacao.ts.';

COMMENT ON CONSTRAINT coletada_em_plausivel ON vistorias IS
  'A data do ato no laudo vem daqui. Grosseira de propósito: recusa o impossível, não julga a precisão.';
