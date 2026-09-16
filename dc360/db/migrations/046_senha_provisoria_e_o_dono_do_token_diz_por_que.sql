-- =====================================================================
-- 046: senha provisoria com prazo, e o dono do token diz POR QUE o token
--      nao vale mais.
--
-- Duas correcoes de revisao de seguranca (15/09/2026). Nenhuma tabela nova,
-- nenhuma policy nova, nenhuma funcao privilegiada A MAIS: as quatro que
-- mudam aqui ja existiam e sao recriadas com a mesma assinatura de entrada
-- e uma coluna a mais na saida (`credenciais_para_login`, `sessao_por_token`,
-- `dono_do_token`) ou com uma coluna a mais na escrita
-- (`provisionar_municipio`). O teto de funcoes SECURITY DEFINER de
-- `db/test/isolamento.test.ts` continua o mesmo.
--
-- =====================================================================
-- 1. `usuarios.senha_provisoria_ate`
--
-- O DEFEITO. A senha temporaria que quem administra sorteia
-- (`POST /usuarios/:id/redefinir-senha`) e a senha inicial do administrador
-- criado pelo console (`provisionar_municipio`, migracao 036) nao expiravam
-- e nao obrigavam a troca. Quem recebia era ORIENTADO a trocar, e nada o
-- obrigava: uma senha ditada por telefone, anotada num papel na recepcao,
-- valia para sempre como senha comum. O comentario da propria rota chamava
-- isso de pendencia e nomeava esta coluna.
--
-- O DESENHO. A coluna e um PRAZO, e nao um booleano, porque as duas
-- perguntas que a API faz sao de tempo:
--
--   - `senha_provisoria_ate IS NOT NULL` e ainda no futuro: a senha entra,
--     mas a sessao que nasce dela so alcanca `/auth/trocar-senha` (e sair).
--     Toda outra rota responde 403 `troca_de_senha_obrigatoria`, e o painel
--     leva a pessoa para a troca. Trocar a senha ZERA a coluna.
--   - `senha_provisoria_ate` no PASSADO: a senha provisoria venceu sem ser
--     trocada, e o login e recusado com a mesma resposta generica de senha
--     errada. Quem administra sorteia outra. Setenta e duas horas: o tempo
--     de a pessoa receber a senha, chegar ao trabalho e entrar, com folga de
--     fim de semana, e curto o bastante para a senha do papel nao valer na
--     semana seguinte.
--
-- NULL e "senha escolhida pela propria pessoa", que e o estado de toda conta
-- existente: a migracao nao carimba ninguem. Uma senha temporaria sorteada
-- ANTES desta migracao continua valendo como senha comum, e isso e dito em
-- vez de escondido: carimbar as contas existentes exigiria saber quais
-- senhas foram sorteadas, e o banco guarda so o hash.
--
-- Quem escreve a coluna: `provisionar_municipio` (abaixo), a rota de
-- redefinicao (`rotas/administracao.ts`) e o comando de linha
-- (`apps/api/src/provisionar.ts`). Quem a zera: `auth/servico.ts#trocarSenha`
-- e `consumir_recuperacao` (o link de email tambem e escolha da propria
-- pessoa, e o UPDATE abaixo cuida disso sem recriar aquela funcao).
--
-- =====================================================================
-- 2. `dono_do_token` devolve o MOTIVO, e nao so o dono
--
-- O DEFEITO, provado contra a API em memoria. A renovacao trata todo token de
-- renovacao que `sessao_por_token` nao devolve como REUSO (sinal classico de
-- token roubado) e derruba TODAS as sessoes do dono. So que `sessao_por_token`
-- tambem nao devolve token EXPIRADO, e `dono_do_token` devolvia o dono "mesmo
-- que revogada ou expirada". Resultado: o aparelho de campo que ficou
-- quinze dias sem sinal apresentava o token vencido, e a API derrubava o
-- painel da coordenacao, o celular reserva e tudo o mais daquela pessoa, por
-- um token que ninguem roubou. O mesmo acontecia com a sessao que a propria
-- pessoa encerrou em "Minha conta" e um aparelho antigo tentou renovar.
--
-- A CORRECAO e dar a `derrubarSePossivelReuso` a informacao que faltava: o
-- motivo da revogacao e o vencimento. Reuso de verdade e SO o token que foi
-- rotacionado na renovacao (`motivo_revogacao = 'rotacionada na renovacao'`)
-- e reapareceu: esse e o unico caso em que o legitimo e o atacante alternam.
-- Expirado, encerrado pelo proprio usuario, derrubado por quem administra ou
-- por troca de senha respondem 401 e nada mais.
--
-- A FORMA continua estreita: entra o hash, sai o dono e tres carimbos. Nada
-- de nome, papel, municipio ou hash. Um uuid de usuario e o motivo de uma
-- revogacao so sao uteis para quem ja tinha o token.
-- =====================================================================

ALTER TABLE usuarios ADD COLUMN senha_provisoria_ate timestamptz;

COMMENT ON COLUMN usuarios.senha_provisoria_ate IS
  'Ate quando a senha provisoria (sorteada por quem administra ou pelo console) vale para entrar. Preenchida, a sessao so alcanca a troca de senha; vencida, o login e recusado. NULL: senha escolhida pela propria pessoa.';

-- ---------------------------------------------------------------------
-- O login e a renovacao passam a saber se a senha e provisoria.
--
-- DROP e CREATE, como a 013 fez para a matricula: `RETURNS TABLE` nao se
-- altera com CREATE OR REPLACE. O DROP leva as permissoes junto, entao o
-- REVOKE e o GRANT sao repetidos abaixo.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS credenciais_para_login(text);

CREATE FUNCTION credenciais_para_login(p_email text)
RETURNS TABLE (
  usuario_id      uuid,
  organizacao_id  uuid,
  nome            text,
  matricula       text,
  papel           text,
  senha_hash      text,
  ativo           boolean,
  bloqueado_ate   timestamptz,
  senha_provisoria_ate timestamptz,
  organizacao_nome text,
  municipio       text,
  uf              char(2)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.organizacao_id, u.nome, u.matricula, u.papel, u.senha_hash,
         u.ativo, u.bloqueado_ate, u.senha_provisoria_ate,
         o.nome, o.municipio, o.uf
    FROM usuarios u
    JOIN organizacoes o ON o.id = u.organizacao_id
   WHERE lower(u.email) = lower(p_email);
$$;

REVOKE ALL ON FUNCTION credenciais_para_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credenciais_para_login(text) TO dc360_app;

DROP FUNCTION IF EXISTS sessao_por_token(text);

CREATE FUNCTION sessao_por_token(p_token_hash text)
RETURNS TABLE (
  sessao_id       uuid,
  organizacao_id  uuid,
  usuario_id      uuid,
  nome            text,
  matricula       text,
  papel           text,
  ativo           boolean,
  senha_provisoria_ate timestamptz,
  organizacao_nome text,
  municipio       text,
  uf              char(2)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.organizacao_id, s.usuario_id, u.nome, u.matricula, u.papel,
         u.ativo, u.senha_provisoria_ate, o.nome, o.municipio, o.uf
    FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN organizacoes o ON o.id = s.organizacao_id
   WHERE s.token_hash = p_token_hash
     AND s.revogada_em IS NULL
     AND s.expira_em > now();
$$;

REVOKE ALL ON FUNCTION sessao_por_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sessao_por_token(text) TO dc360_app;

-- ---------------------------------------------------------------------
-- A senha que a pessoa escolhe pelo link de email nao e provisoria.
--
-- `consumir_recuperacao` (005) grava o hash novo e derruba as sessoes; ela
-- nao conhece a coluna nova e nao precisa ser recriada por causa dela: um
-- gatilho pequeno, SECURITY INVOKER, zera o prazo sempre que o hash da senha
-- muda por qualquer caminho que nao tenha acabado de o carimbar. A regra
-- "senha trocada pela pessoa deixa de ser provisoria" mora no banco, e vale
-- para a rota de troca, para o link de recuperacao e para qualquer UPDATE
-- que alguem escreva amanha. O carimbo da senha sorteada vem no MESMO UPDATE
-- que troca o hash (`senha_provisoria_ate = now() + ...`), e esse o gatilho
-- deixa passar: ele so zera quando o UPDATE mudou o hash e NAO mexeu no prazo.
-- ---------------------------------------------------------------------

CREATE FUNCTION senha_trocada_deixa_de_ser_provisoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.senha_hash IS DISTINCT FROM OLD.senha_hash
     AND NEW.senha_provisoria_ate IS NOT DISTINCT FROM OLD.senha_provisoria_ate THEN
    NEW.senha_provisoria_ate := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuarios_senha_trocada_deixa_de_ser_provisoria
  BEFORE UPDATE OF senha_hash ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION senha_trocada_deixa_de_ser_provisoria();

-- ---------------------------------------------------------------------
-- O dono do token, com o motivo.
--
-- Ver o cabecalho, secao 2. A assinatura de entrada e a mesma; a saida vira
-- uma linha com quatro colunas. `DROP` porque o tipo de retorno muda.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS dono_do_token(text);

CREATE FUNCTION dono_do_token(p_token_hash text)
RETURNS TABLE (
  usuario_id       uuid,
  revogada_em      timestamptz,
  motivo_revogacao text,
  expira_em        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.usuario_id, s.revogada_em, s.motivo_revogacao, s.expira_em
    FROM sessoes s
   WHERE s.token_hash = p_token_hash;
$$;

COMMENT ON FUNCTION dono_do_token(text) IS
  'De quem era um token de renovacao que ja nao vale, e por que: revogacao (com motivo) ou vencimento. Serve a uma pergunta so: o token reapareceu depois de ROTACIONADO (reuso, e a familia cai) ou so venceu (401 e nada mais)?';

REVOKE ALL ON FUNCTION dono_do_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dono_do_token(text) TO dc360_app;

-- ---------------------------------------------------------------------
-- O administrador criado pelo console nasce com senha provisoria de 72 h.
--
-- A funcao inteira e repetida porque CREATE OR REPLACE substitui o corpo por
-- inteiro. A UNICA diferenca em relacao a 036 e a coluna
-- `senha_provisoria_ate` no INSERT de `usuarios`. A forma que
-- `db/test/isolamento.test.ts` cobra (dois OUT, nenhum EXECUTE, um SELECT so,
-- nenhuma tabela de negocio alem das tres que ela escreve) continua a mesma.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION provisionar_municipio(
  p_orgao      text,
  p_municipio  text,
  p_uf         text,
  p_nome       text,
  p_matricula  text,
  p_email      text,
  p_senha_hash text,
  p_operador   text,
  OUT organizacao_id uuid,
  OUT usuario_id     uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_orgao     text := trim(p_orgao);
  v_municipio text := trim(p_municipio);
  v_uf        text := upper(trim(p_uf));
  v_nome      text := trim(p_nome);
  v_matricula text := trim(p_matricula);
  v_email     text := lower(trim(p_email));
  v_operador  text := trim(p_operador);
  v_existente uuid;
  v_ja_cadastrado text;
  v_restricao text;
BEGIN
  -- Tudo que recusa vem antes de tudo que escreve. Ver a migracao 036.
  IF v_operador = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Faltou dizer quem esta cadastrando esta prefeitura.',
      DETAIL  = 'O municipio recebe uma linha na trilha dele com o nome de quem o '
                'criou, e essa linha e a unica resposta que ele tem para "quem criou isto".';
  END IF;

  IF v_orgao = '' OR v_municipio = '' OR v_nome = '' OR v_matricula = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Orgao, municipio, nome e matricula do administrador sao obrigatorios.';
  END IF;

  IF v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = format('UF invalida: %L. A UF tem duas letras.', p_uf);
  END IF;

  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Email do administrador invalido.',
      DETAIL  = 'E por ele que a pessoa recebe recuperacao de senha: um email errado '
                'aqui produz um municipio cujo unico administrador nao consegue voltar a entrar.';
  END IF;

  -- O hash, e nao a senha. Ver a migracao 036 para a razao do formato.
  IF p_senha_hash IS NULL
     OR split_part(p_senha_hash, '$', 1) <> 'scrypt'
     OR length(p_senha_hash) < 80 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'A senha inicial precisa chegar ja derivada.',
      DETAIL  = 'Esperado o hash do produto, com algoritmo, parametros, sal e resumo '
                'separados por cifrao. Senha em texto claro nao entra no banco em '
                'lugar nenhum, nem por esta porta.';
  END IF;

  -- Duplicata: antes de qualquer escrita, dizendo qual ja existe.
  SELECT id, municipio || '/' || uf INTO v_existente, v_ja_cadastrado
    FROM organizacoes
   WHERE lower(municipio) = lower(v_municipio) AND upper(uf) = v_uf;

  IF v_existente IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC360',
      MESSAGE = format('Ja existe municipio cadastrado como %s (id %s).',
                       v_ja_cadastrado, v_existente),
      DETAIL  = 'Cadastrar de novo criaria um segundo, com os dados do primeiro '
                'invisiveis para ele.';
  END IF;

  INSERT INTO organizacoes (nome, municipio, uf)
  VALUES (v_orgao, v_municipio, v_uf)
  RETURNING id INTO organizacao_id;

  /*
    'administrador', fixo (ADR 0006), e a SENHA INICIAL E PROVISORIA: vale
    setenta e duas horas para entrar, e a primeira sessao so alcanca a troca
    de senha. E a diferenca desta versao para a da 036.
  */
  BEGIN
    INSERT INTO usuarios
      (organizacao_id, nome, matricula, email, papel, senha_hash, senha_provisoria_ate)
    VALUES
      (organizacao_id, v_nome, v_matricula, v_email, 'administrador', p_senha_hash,
       now() + interval '72 hours')
    RETURNING id INTO usuario_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    IF v_restricao <> 'usuarios_email_global_idx' THEN
      RAISE;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'DC363',
      MESSAGE = format('Ja existe conta com o email %s neste produto.', v_email),
      DETAIL  = 'O email e a identidade de login e vale para o produto inteiro, nao '
                'so para um municipio. Use outro endereco para o primeiro '
                'administrador desta prefeitura.';
  END;

  BEGIN
    INSERT INTO trilha_administrativa
      (organizacao_id, autor_id, autor_nome, autor_papel,
       acao, alvo_tipo, alvo_id, alvo_nome, antes, depois)
    VALUES
      (organizacao_id, NULL, v_operador, 'operador_da_plataforma',
       'municipio_provisionado', 'organizacao', organizacao_id,
       v_municipio || '/' || v_uf, NULL,
       jsonb_build_object(
         'orgao', v_orgao,
         'municipio', v_municipio,
         'uf', v_uf,
         'origem', 'console_do_fornecedor',
         'administrador', jsonb_build_object(
           'id', usuario_id,
           'nome', v_nome,
           'matricula', v_matricula,
           'email', v_email,
           'papel', 'administrador'
         )
       ));
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC362',
      MESSAGE = 'O dono das tabelas foi barrado pela seguranca em nivel de linha ao '
                'gravar a linha de nascimento do municipio na trilha.',
      DETAIL  = 'Nenhum municipio foi criado: a transacao inteira volta atras. Neste '
                'banco o dono das tabelas nao e isento de RLS, e esta funcao supoe que '
                'ele e. Use o comando de linha (npm run provisionar), que grava essa '
                'linha assumindo dc360_app, e trate isto como defeito a corrigir.';
  END;
END $$;

-- CREATE OR REPLACE preserva a ACL da 036 (REVOKE de PUBLIC, EXECUTE so ao
-- console). Repetido mesmo assim, porque ACL que depende de "preserva" e ACL
-- que ninguem confere.
REVOKE ALL ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)
  TO dc360_console;
