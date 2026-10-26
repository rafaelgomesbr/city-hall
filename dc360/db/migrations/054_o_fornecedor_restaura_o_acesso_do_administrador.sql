-- =====================================================================
-- 054: o fornecedor restaura o acesso do administrador de um municipio
--      (decisao H06 B do Rafael, 26/10/2026).
--
-- O PROBLEMA
--
-- Enquanto a recuperacao de senha por email estiver desligada em producao
-- (`RECUPERACAO_ATIVA=nao`, ainda sem dominio de envio), o administrador
-- UNICO de um municipio que perde a senha nao tem saida: quem redefine senha
-- de outra pessoa no painel e quem administra (`POST
-- /usuarios/:id/redefinir-senha`), e a rota recusa a propria pessoa. Com um
-- administrador so, nao ha "outra pessoa". A saida que sobrava era o dono do
-- banco abrir `psql` na producao, que e exatamente o caminho perigoso que a
-- ADR 0008 existe para fechar.
--
-- A DECISAO: um CAMINHO DE SUPORTE no console do fornecedor. O dono do console,
-- depois de verificar a identidade de quem pede por canal verificado
-- (procedimento em `docs/IMPLANTACAO.md`, secao 6.5), sorteia uma senha
-- temporaria para o administrador daquele municipio. E a MESMA senha
-- provisoria da redefinicao pelo painel (046): vale setenta e duas horas para
-- entrar, e a sessao que nasce dela so alcanca a troca de senha.
--
-- =====================================================================
-- O QUE A FUNCAO GARANTE, NO BANCO E NAO SO NA TELA
--
--   1. Quem chama e o DONO ativo do console (`console_operador_e_dono()`),
--      como as quatro acoes perigosas da 038. Operador comum recebe
--      `insufficient_privilege`, mesmo que alguem escreva uma rota sem o
--      gancho de dono.
--   2. O motivo e obrigatorio e ESCRITO: dez caracteres no minimo, e nao um
--      "x". Ele vai para a trilha do municipio, onde o proprio municipio le
--      quem do fornecedor mexeu na conta do administrador dele, e por que.
--   3. A senha chega DERIVADA. Mesma recusa de `provisionar_municipio` (036):
--      o dia em que alguem passar a senha digitada no lugar do hash nao pode
--      terminar com ela em texto claro em `usuarios`.
--   4. O municipio existe, nao foi eliminado e NAO esta suspenso. Suspenso,
--      ninguem entra (`abrir_sessao`, 038 e 050), e uma senha de setenta e
--      duas horas sorteada durante a suspensao venceria antes da reativacao.
--   5. CONFERENCIA EXPLICITA DO MUNICIPIO E DO PAPEL. A conta e procurada
--      pelo email DENTRO do municipio indicado (`organizacao_id = p_org`), e
--      so serve se o papel for `administrador` e a conta estiver ativa.
--      Conta de outro municipio, conta inexistente, conta de outro papel e
--      conta desativada recebem a MESMA mensagem: a funcao nao confirma ao
--      console que um email existe em outro municipio, nem qual papel uma
--      pessoa tem. O `DETAIL` diz qual conferencia falhou, para o teste e
--      para quem depura no banco, e o console nao o repassa a tela.
--   6. Um TETO por municipio: no maximo tres restauracoes em vinte e quatro
--      horas. Restaurar e ato de raro em raro; uma sessao de dono roubada
--      que tentasse sortear senha para todo administrador de todo municipio
--      esbarra aqui alem do teto por endereco da rota.
--   7. Escreve, numa transacao so: a senha provisoria (com o mesmo prazo de
--      72 h da rota do painel, e zerando o castigo de tentativas), o
--      encerramento de TODAS as sessoes da pessoa (com a trava por pessoa da
--      049, num comando anterior ao UPDATE), a linha na trilha administrativa
--      do municipio e a linha no registro do console. Os links de
--      recuperacao pendentes morrem pelo gatilho da 051, que ja olha a troca
--      de `senha_hash`.
--
-- O QUE A FUNCAO NAO FAZ, e cada ausencia e decisao:
--
--   - Nao mexe no SEGUNDO FATOR. Quem ativou o aplicativo de autenticacao
--     continua precisando dele (ou de um codigo de recuperacao do proprio
--     painel) para entrar. Uma senha ditada por telefone a um impostor,
--     sozinha, nao abre a conta de quem tem segundo fator; resetar o segundo
--     fator pelo suporte seria o dobro do poder e fica fora desta decisao.
--   - Nao devolve nome, email, matricula nem nada da pessoa: devolve o id da
--     conta, quantas sessoes cairam e ate quando a senha vale. A senha em
--     texto claro nunca passa por aqui; o console sorteia, deriva e mostra
--     uma vez.
--   - Nao grava a senha nem o hash na trilha nem no registro (regra da 010).
--
-- =====================================================================
-- A ORDEM DAS TRAVAS (049 e 050), para nao haver impasse
--
--   linha de `organizacoes` (FOR NO KEY UPDATE) -> linha de `usuarios` (FOR NO
--   KEY UPDATE) -> trava por pessoa -> UPDATE de `sessoes`.
--
-- E a ordem da suspensao (linha do municipio, depois as travas) e a regra da
-- 049 (quem atualiza `usuarios` o faz ANTES da trava). FOR NO KEY UPDATE, e
-- nao FOR UPDATE, na linha da pessoa: a renovacao segura a trava e insere em
-- `sessoes`, e a chave estrangeira pede FOR KEY SHARE na linha da pessoa; FOR
-- UPDATE conflitaria com ela e fecharia ciclo, NO KEY UPDATE nao conflita. A
-- linha do municipio leva NO KEY UPDATE para duas restauracoes do mesmo
-- municipio se enfileirarem antes de contar o teto, e para a suspensao e o
-- login (FOR SHARE, 050) esperarem pelo tempo desta funcao, que nao deriva
-- senha por dentro (o console deriva antes de abrir a transacao).
--
-- =====================================================================
-- O REGISTRO DO CONSOLE: `restauracoes_de_acesso`
--
-- Uma tabela do FORNECEDOR, append-only por ausencia de policy e de concessao
-- de INSERT, UPDATE e DELETE: so a funcao escreve, e ninguem reescreve. O
-- dono do console le (policy amarrada a `console_operador_e_dono()`), para
-- ver quem restaurou o que e quando antes de restaurar de novo. Nenhum outro
-- papel le, e o papel de aplicacao nao tem privilegio nela.
--
-- Ela carrega `organizacao_id` com chave estrangeira para `organizacoes` e,
-- ao contrario do livro de eliminacoes, NAO sobrevive ao municipio: entra na
-- ordem de apagamento (camada 0, ninguem a referencia), junto da linha da
-- trilha administrativa que a acompanha. O motivo e texto livre escrito pelo
-- fornecedor e pode citar a pessoa; guardar isso depois que o municipio saiu
-- seria reter dado sem finalidade. O rastro de log do console (sem motivo,
-- sem senha) e o que sobra do lado do fornecedor.
--
-- Ela NAO carrega o id da conta restaurada: a pergunta do fornecedor e "quem
-- de nos agiu em qual municipio, quando e por que", e a de "qual conta" esta
-- na trilha do proprio municipio, que o console nao le (ADR 0008).
--
-- =====================================================================
-- O QUE MUDA NOS PORTOES
--
--   - Uma funcao SECURITY DEFINER nova: o teto de `db/test/isolamento.test.ts`
--     sobe de 27 para 28, narrado la, e a funcao entra na lista do que o
--     console executa.
--   - Uma tabela nova do fornecedor, com uma concessao (SELECT ao console),
--     narrada nos blocos de tabelas do fornecedor e de privilegio.
--   - `ordem_de_apagamento_por_municipio()` ganha a tabela nova na camada 0.
--
-- Aditiva: uma tabela nova, uma funcao nova, e a recriacao da lista de ordem
-- com um nome a mais (`CREATE OR REPLACE`, mesma assinatura, IMMUTABLE como
-- antes). Nenhuma coluna existente muda, nenhuma policy existente muda.
-- ORDEM DE IMPLANTACAO: migre ANTES de implantar o console novo (o console
-- novo chama a funcao). A API nao muda. O console antigo contra o banco
-- migrado continua funcionando, so sem o botao.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O registro do console.
-- ---------------------------------------------------------------------

CREATE TABLE restauracoes_de_acesso (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id        uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,

  /*
    Quem do fornecedor agiu. O id SEM chave estrangeira para
    `console_operadores` (o portao de chaves de `isolamento.test.ts` so isenta
    as duas referencias da 038 e da 039, por nome) e o email COPIADO, como
    `eliminacoes_de_municipio.solicitada_por_email`: a linha precisa continuar
    dizendo quem foi mesmo que a conta do operador mude de email depois.
  */
  operador_id           uuid NOT NULL,
  operador_email        text NOT NULL CHECK (length(trim(operador_email)) > 0),

  motivo                text NOT NULL CHECK (length(trim(motivo)) >= 10),
  sessoes_encerradas    integer NOT NULL CHECK (sessoes_encerradas >= 0),
  senha_provisoria_ate  timestamptz NOT NULL,
  registrado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX restauracoes_de_acesso_org_data_idx
  ON restauracoes_de_acesso (organizacao_id, registrado_em DESC);

COMMENT ON TABLE restauracoes_de_acesso IS
  'O registro do console das restauracoes de acesso de administrador (migracao 054, decisao H06 B). Uma linha por ato: municipio, operador do fornecedor, motivo, sessoes encerradas e prazo da senha provisoria. Nunca a senha nem o hash. So a funcao console_restaurar_acesso_do_administrador escreve; so o dono do console le; ninguem altera nem apaga, a nao ser a eliminacao do municipio.';

ALTER TABLE restauracoes_de_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE restauracoes_de_acesso FORCE ROW LEVEL SECURITY;

/*
  SO LEITURA, e so do dono. Sem policy de INSERT, UPDATE ou DELETE e sem a
  concessao correspondente: a unica escrita e a da funcao, como dona das
  tabelas e com `row_security = off` (se a dona nao for isenta de RLS, o
  INSERT estoura em vez de sumir, armadilha 1 da 038).
*/
CREATE POLICY restauracoes_leitura_do_dono ON restauracoes_de_acesso
  FOR SELECT TO dc360_console
  USING (console_operador_e_dono());

-- ---------------------------------------------------------------------
-- 2. A funcao.
-- ---------------------------------------------------------------------

CREATE FUNCTION console_restaurar_acesso_do_administrador(
  p_org        uuid,
  p_email      text,
  p_senha_hash text,
  p_motivo     text,
  OUT usuario_id           uuid,
  OUT sessoes_encerradas   integer,
  OUT senha_provisoria_ate timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_motivo     text := trim(coalesce(p_motivo, ''));
  v_email      text := lower(trim(coalesce(p_email, '')));
  v_operador   text;
  v_nome_org   text;
  v_suspenso   timestamptz;
  v_recentes   integer;
  v_id         uuid;
  v_nome       text;
  v_papel      text;
  v_ativo      boolean;
  v_alterados  integer;
BEGIN
  -- Tudo que recusa vem antes de tudo que escreve (036).
  IF NOT console_operador_e_dono() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'So o dono do console restaura o acesso do administrador de um municipio.',
      DETAIL  = 'O operador da sessao nao e o dono, ou nao ha operador no contexto.';
  END IF;

  IF length(v_motivo) < 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Restaurar o acesso exige motivo escrito, com pelo menos 10 caracteres.',
      DETAIL  = 'O motivo vai para a trilha do municipio, que e onde ele le quem do fornecedor '
                'mexeu na conta do administrador dele, e por que.';
  END IF;

  IF p_senha_hash IS NULL
     OR split_part(p_senha_hash, '$', 1) <> 'scrypt'
     OR length(p_senha_hash) < 80 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'A senha temporaria precisa chegar ja derivada.',
      DETAIL  = 'Esperado o hash do produto. Senha em texto claro nao entra no banco em lugar nenhum.';
  END IF;

  SELECT email INTO v_operador FROM console_operadores WHERE id = console_operador_atual();

  /*
    A linha do municipio, travada: duas restauracoes do mesmo municipio se
    enfileiram aqui antes de contar o teto, e a suspensao espera (ver o
    cabecalho, a ordem das travas).
  */
  SELECT o.municipio || '/' || o.uf, o.acesso_suspenso_em
    INTO v_nome_org, v_suspenso
    FROM organizacoes o
   WHERE o.id = p_org AND o.eliminada_em IS NULL
     FOR NO KEY UPDATE;
  IF v_nome_org IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = format('Nao ha municipio ativo com o id %s.', p_org);
  END IF;

  IF v_suspenso IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('O acesso do municipio %s esta suspenso. Reative o acesso antes de restaurar o administrador.', v_nome_org),
      DETAIL  = 'Suspenso, ninguem entra, e a senha provisoria de 72 horas venceria antes da reativacao.';
  END IF;

  SELECT count(*) INTO v_recentes
    FROM restauracoes_de_acesso r
   WHERE r.organizacao_id = p_org AND r.registrado_em > now() - interval '24 hours';
  IF v_recentes >= 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('O municipio %s ja teve 3 restauracoes de acesso nas ultimas 24 horas.', v_nome_org),
      DETAIL  = 'O teto existe para uma sessao de dono roubada nao sortear senha em serie. '
                'Confira o registro de restauracoes antes de insistir.';
  END IF;

  /*
    A CONFERENCIA DO MUNICIPIO E DO PAPEL, explicita. O email e unico no
    produto inteiro (002), e a busca e pelo email DENTRO do municipio
    indicado: conta de outro municipio nao aparece, e recebe a mesma resposta
    de conta que nao existe.
  */
  SELECT u.id, u.nome, u.papel, u.ativo
    INTO v_id, v_nome, v_papel, v_ativo
    FROM usuarios u
   WHERE u.organizacao_id = p_org AND lower(u.email) = v_email
     FOR NO KEY UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = 'Nao ha administrador ativo com este email neste municipio.',
      DETAIL  = 'nenhuma conta com este email neste municipio';
  END IF;
  IF v_papel <> 'administrador' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = 'Nao ha administrador ativo com este email neste municipio.',
      DETAIL  = 'a conta existe neste municipio e o papel dela nao e administrador';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = 'Nao ha administrador ativo com este email neste municipio.',
      DETAIL  = 'a conta de administrador esta desativada';
  END IF;

  /*
    A senha provisoria, com o prazo NO MESMO UPDATE que o hash: o gatilho da
    046 zera o prazo em toda troca de hash que nao carimbe um junto. Setenta
    e duas horas, como `POST /usuarios/:id/redefinir-senha`. O castigo de
    tentativas zera, como la: o administrador que errou a senha velha cinco
    vezes nao fica preso fora com a senha nova na mao.
  */
  UPDATE usuarios u
     SET senha_hash = p_senha_hash, falhas_login = 0, bloqueado_ate = NULL,
         senha_provisoria_ate = now() + interval '72 hours'
   WHERE u.id = v_id AND u.organizacao_id = p_org
  RETURNING u.senha_provisoria_ate INTO senha_provisoria_ate;
  GET DIAGNOSTICS v_alterados = ROW_COUNT;
  IF v_alterados <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC366',
      MESSAGE = 'A restauracao nao conseguiu gravar a senha provisoria.',
      DETAIL  = 'A transacao inteira volta atras. Um UPDATE que nao alcanca a linha e sinal de '
                'gatilho, regra ou policy barrando o dono das tabelas.';
  END IF;

  /*
    Todas as sessoes da pessoa caem. A trava por pessoa (049) num comando
    ANTERIOR ao UPDATE: uma renovacao no meio enxerga o encerramento, ou e
    enxergada por ele.
  */
  PERFORM travar_sessoes_do_usuario(v_id);
  UPDATE sessoes s
     SET revogada_em = now(), motivo_revogacao = 'acesso restaurado pelo fornecedor'
   WHERE s.usuario_id = v_id AND s.organizacao_id = p_org AND s.revogada_em IS NULL;
  GET DIAGNOSTICS sessoes_encerradas = ROW_COUNT;

  /* Na trilha do municipio: quem do fornecedor, quando, por que. Nunca a senha. */
  INSERT INTO trilha_administrativa
    (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome, depois)
  VALUES
    (p_org, NULL, v_operador, 'operador_da_plataforma',
     'acesso_do_administrador_restaurado_pelo_fornecedor', 'usuario', v_id, v_nome,
     jsonb_build_object(
       'motivo', v_motivo,
       'sessoes_encerradas', sessoes_encerradas,
       'senha_provisoria_ate', senha_provisoria_ate,
       'origem', 'console_do_fornecedor'));

  /* No registro do console. */
  INSERT INTO restauracoes_de_acesso
    (organizacao_id, operador_id, operador_email, motivo, sessoes_encerradas, senha_provisoria_ate)
  VALUES
    (p_org, console_operador_atual(), v_operador, v_motivo, sessoes_encerradas, senha_provisoria_ate);

  usuario_id := v_id;
END;
$$;

COMMENT ON FUNCTION console_restaurar_acesso_do_administrador(uuid, text, text, text) IS
  'Caminho de suporte (H06 B): o dono do console grava senha provisoria de 72 h para o administrador ATIVO do municipio indicado, encontrado pelo email dentro daquele municipio, encerra todas as sessoes dele e registra o ato na trilha do municipio e em restauracoes_de_acesso. Exige motivo de 10 caracteres, recusa municipio suspenso e passa de 3 por municipio em 24 h. Nunca mexe no segundo fator. Devolve o id da conta, as sessoes encerradas e o prazo.';

-- ---------------------------------------------------------------------
-- 3. A ordem de apagamento ganha o registro novo, na camada 0.
--
-- A mesma lista da 038, com um nome a mais. `restauracoes_de_acesso` aponta
-- so para `organizacoes`, e ninguem aponta para ela: camada 0. Sem isto,
-- `executar_eliminacoes_vencidas` recusaria eliminar qualquer municipio
-- (tabela com organizacao_id sem lugar na ordem), que e o portao funcionando.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ordem_de_apagamento_por_municipio()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- camada 0
    'avisos_lidos', 'devolucoes_de_tarefa', 'exportacoes', 'metricas_municipio',
    'notificacoes_enviadas', 'objetos_orfaos', 'ocorrencia_consultas', 'oficio_aberturas',
    'oficio_sequencias', 'protocolo_sequencias', 'recuperacoes_senha', 'restauracoes_de_acesso',
    'saidas_a_campo', 'segundo_fator_recuperacao', 'sessoes', 'trilha_administrativa',
    'trilha_eventos', 'vistoria_evidencias_perdidas', 'vistoria_orgaos_indicados',
    -- camada 1
    'avisos', 'aparelhos', 'evidencias', 'oficio_envios', 'segundo_fator',
    -- camada 2
    'oficios',
    -- camada 3
    'providencias',
    -- camada 4
    'orgaos', 'vistorias',
    -- camada 5
    'ocorrencias',
    -- camada 6
    'usuarios',
    -- camada 7
    'equipes'
  ]
$$;

-- ---------------------------------------------------------------------
-- 4. Quem alcanca o que.
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION console_restaurar_acesso_do_administrador(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_restaurar_acesso_do_administrador(uuid, text, text, text)
  TO dc360_console;

REVOKE ALL ON restauracoes_de_acesso FROM PUBLIC;
GRANT SELECT ON restauracoes_de_acesso TO dc360_console;
