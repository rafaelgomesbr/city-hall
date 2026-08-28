-- =====================================================================
-- 011: o município que pediu para conhecer.
--
-- Esta é a ÚNICA tabela do produto que não pertence a organização nenhuma, e
-- vale explicar por quê antes de qualquer outra coisa.
--
-- Todo o resto do banco existe dentro de um município: `organizacao_id`, RLS
-- habilitada e forçada, e o município vindo sempre do token. Aqui não há
-- token, não há município e não há usuário: quem preenche este formulário
-- ainda não é cliente, e é justamente por isso que está preenchendo.
--
-- A consequência é que o isolamento por RLS NÃO se aplica, e a proteção
-- precisa vir de outro lugar. Ela vem de três, e cada uma cobre uma falha da
-- outra:
--
-- 1. O papel de aplicação recebe INSERT e NÃO recebe SELECT. Quem escreve pela
--    rota pública não consegue ler o que os outros escreveram. Sem isso, um
--    formulário aberto na internet vira uma lista de contatos de servidores
--    públicos servida a quem pedir.
-- 2. Nenhuma rota autenticada expõe esta tabela. A leitura é do operador da
--    plataforma, pelo banco, com credencial de dono. É pouco confortável de
--    propósito: enquanto não existir um nível de acesso de plataforma (que o
--    produto deliberadamente não tem, ver ADR 0006), a saída honesta é não
--    inventar um meio-termo.
-- 3. O que se pede é o mínimo. Nome, cargo, email e telefone de quem procurou,
--    município e porte. Nada de CPF, nada de dado de cidadão, nada que crie
--    obrigação de titular antes de existir contrato.
--
-- E o que esta tabela NÃO faz: ela não cria município nenhum. Provisionar
-- continua sendo ato deliberado, por linha de comando, com credencial de dono.
-- Um formulário público que criasse ambiente seria um formulário público que
-- cria banco de dados para quem quiser.
-- =====================================================================

CREATE TABLE interesse_municipio (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem procurou.
  nome           text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 200),
  cargo          text CHECK (cargo IS NULL OR length(trim(cargo)) <= 200),
  email          text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telefone       text CHECK (telefone IS NULL OR length(trim(telefone)) <= 40),

  -- De onde.
  municipio      text NOT NULL CHECK (length(trim(municipio)) BETWEEN 2 AND 200),
  uf             char(2) NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  orgao          text CHECK (orgao IS NULL OR length(trim(orgao)) <= 200),

  /*
    Porte, e ele existe por uma razão comercial concreta: a faixa de preço do
    produto muda por número de habitantes, e perguntar isso agora evita a
    conversa que descobre no fim que o município não cabe na oferta.
  */
  faixa_populacao text CHECK (faixa_populacao IN (
    'ate_50_mil', 'de_50_a_200_mil', 'acima_de_200_mil', 'nao_sei'
  )),
  quantos_agentes integer CHECK (quantos_agentes IS NULL OR quantos_agentes BETWEEN 0 AND 999),

  mensagem       text CHECK (mensagem IS NULL OR length(mensagem) <= 2000),

  /*
    Contexto do pedido, para saber de onde vieram e conseguir responder a
    "aquele pessoal que preencheu depois da apresentação". `origem` é livre e
    curto; `ip` fica para conseguir barrar abuso.

    O IP é dado pessoal. Ele tem prazo de descarte declarado no comentário da
    coluna e entra na purga junto com o resto, pela mesma razão que `sessoes`
    e `recuperacoes_senha` entram.
  */
  origem         text CHECK (origem IS NULL OR length(origem) <= 100),
  ip             inet,

  recebido_em    timestamptz NOT NULL DEFAULT now(),

  /*
    O que aconteceu depois. Preenchido à mão por quem atende, e existe para o
    formulário não virar uma caixa de entrada que ninguém sabe se foi lida.
  */
  atendido_em    timestamptz,
  observacao     text CHECK (observacao IS NULL OR length(observacao) <= 2000)
);

CREATE INDEX interesse_recebido_idx ON interesse_municipio (recebido_em DESC);

/*
  A deduplicação NÃO é feita por índice, e a tentativa de fazer assim foi
  recusada pelo próprio banco. Vale registrar, porque é uma armadilha comum.

  A primeira versão indexava `(lower(email), date_trunc('hour', recebido_em))`.
  O Postgres recusa: `date_trunc` sobre `timestamptz` depende do fuso da
  sessão, e por isso não é imutável. Um índice que muda de valor conforme quem
  consulta não é índice, e o banco está certo em não deixar criar.

  Então a janela é conferida na rota, com uma consulta antes de inserir. O
  índice abaixo é só por email, e serve à consulta, não à unicidade: o mesmo
  município pode e deve conseguir procurar de novo daqui a um mês.
*/
CREATE INDEX interesse_email_idx ON interesse_municipio (lower(email), recebido_em DESC);

ALTER TABLE interesse_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE interesse_municipio FORCE ROW LEVEL SECURITY;

/*
  ESCREVER SIM, LER NÃO.

  O papel de aplicação insere e não enxerga. É esta assimetria que impede um
  formulário aberto na internet de virar uma lista de contatos de servidores
  públicos disponível a quem descobrir a rota. A leitura é do dono do banco.
*/
CREATE POLICY interesse_escrita ON interesse_municipio
  FOR INSERT TO dc360_app
  WITH CHECK (true);

GRANT INSERT ON interesse_municipio TO dc360_app;

/*
  A janela de seis horas, perguntada sem ler a tabela.

  O papel de aplicação insere e NÃO lê, de propósito. Mas a rota precisa saber
  se aquele email já pediu recentemente, senão o clique duplo vira duas linhas
  e um robô simples enche a tabela.

  `SECURITY DEFINER` porque roda com o papel que não enxerga a tabela. Três
  cuidados fazem dela uma porta e não um buraco, os mesmos das funções de
  autenticação da migração 002:

  1. Responde exatamente UMA pergunta, e devolve um booleano. Não aceita
     filtro livre, não devolve linha, não devolve contagem.
  2. `search_path` fixo, para não ser sequestrada por uma tabela plantada num
     esquema de busca anterior.
  3. Sem `EXECUTE` para `PUBLIC`: só o papel de aplicação chama.

  Ela vaza um bit ("este email pediu nas últimas seis horas") para quem já
  está dentro do servidor. A rota NÃO repassa esse bit: a resposta ao
  formulário é idêntica nos dois casos, senão a rota pública viraria um
  verificador de quais emails já procuraram o produto.
*/
CREATE FUNCTION interesse_recente(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM interesse_municipio
     WHERE lower(email) = lower(p_email)
       AND recebido_em > now() - interval '6 hours'
  );
$$;

REVOKE ALL ON FUNCTION interesse_recente(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION interesse_recente(text) TO dc360_app;

COMMENT ON TABLE interesse_municipio IS
  'Pedidos de contato vindos do formulário público. Não pertence a organização nenhuma e NÃO cria município: provisionar continua sendo ato deliberado por linha de comando.';

COMMENT ON COLUMN interesse_municipio.ip IS
  'Dado pessoal, guardado para barrar abuso. Descartar junto com o registro após o prazo de retenção definido com o jurídico.';
