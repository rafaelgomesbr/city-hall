-- =====================================================================
-- 039: codigos de recuperacao de senha para os operadores do console do
--      fornecedor, inclusive o dono.
--
-- O PEDIDO, NA LETRA DO DONO
--
-- "Faz a recuperacao de senha para mim, ate para eu resetar a minha senha."
--
-- O dono e o teto do console: ninguem acima dele redefine a senha dele, e o
-- produto nao tem provedor de email para mandar um link (a recuperacao do
-- municipio, na 005, manda link; o console nao tem por onde). A resposta e a
-- mesma que a 022 deu para quem perdeu o telefone do segundo fator: CODIGOS
-- DE RECUPERACAO, gerados uma vez, mostrados uma vez, guardados como hash,
-- cada um valido uma vez.
--
-- Decisao tomada com ele: USAR UM CODIGO REDEFINE A SENHA E TROCA O SEGUNDO
-- FATOR. A recuperacao existe para o dia em que o telefone foi perdido junto
-- com a senha; redefinir so a senha e deixar o segundo fator antigo seria
-- trancar a pessoa do lado de fora com a chave nova na mao. O console gera o
-- envelope novo (ele tem a chave do processo, o banco nao) e passa os dois
-- hashes para a funcao de consumir.
--
-- =====================================================================
-- O QUE FICA GUARDADO, E COMO
--
-- O hash do CODIGO entra no MESMO formato do hash da senha (scrypt, seis
-- campos separados por cifrao), e nao como SHA-256 como na 022. A escolha e
-- deliberada, e o motivo e um so: o console reaproveita a conferencia de
-- senha que ja tem (`apps/console/src/operadores.ts`), um caminho de codigo
-- em vez de dois, e o banco cobra a mesma forma que ja cobra em `senha_hash`
-- (036, 038). O preco e uma derivacao cara por codigo vivo a cada tentativa,
-- e ele cabe: recuperar senha do console e ato raro, de um punhado de
-- pessoas, e nao o login diario de todo servidor de todo municipio, que foi o
-- que fez a 022 escolher o resumo barato.
--
-- =====================================================================
-- AS DUAS ARMADILHAS DA 038, E COMO ESTA MIGRACAO PASSA POR ELAS
--
-- 1. A funcao de consumir escreve SEM contexto de operador (quem perdeu a
--    senha nao tem sessao) e como dono das tabelas, em `console_operadores` e
--    na tabela nova, ambas com RLS forcada e policies so `TO dc360_console`.
--    Um dono sem `BYPASSRLS` nao casa policy nenhuma e alcancaria ZERO linha
--    em silencio (037). Aqui o desfecho seria "senha redefinida" com a senha
--    velha no lugar e o codigo ainda vivo: a pessoa acha que resolveu, e quem
--    tinha a senha velha continua entrando. As tres funcoes levam
--    `SET row_security = off` (a escrita que SERIA filtrada vira erro), e as
--    duas que escrevem traduzem o erro e conferem a contagem depois de cada
--    escrita, no molde da 038.
--
-- 2. A varredura universal de `db/test/isolamento.test.ts` reprova tabela
--    nova que o console le, funcao SECURITY DEFINER nova (o teto estava em
--    23) e funcao sem contexto que devolve hash. Cada excecao entra la
--    NARRADA, com caso-irmao em `db/test/recuperacao-do-console.test.ts`.
--
-- E o gatilho da 038 que torna `papel`, `criado_por` e `criado_em` imutaveis
-- continua valendo por baixo da funcao de consumir: ela so toca senha, segundo
-- fator, teto de tentativas e passo do TOTP, e o caso-irmao cobra que os tres
-- campos guardados pelo gatilho saem iguais.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A tabela.
-- ---------------------------------------------------------------------

CREATE TABLE console_codigos_de_recuperacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    RESTRICT, como toda chave deste banco: operador com codigo nao se apaga,
    e ele ja nao se apagava (038): se desativa. O codigo gasto fica na linha
    dele para o livro contar.
  */
  operador_id   uuid NOT NULL REFERENCES console_operadores(id) ON DELETE RESTRICT,

  /*
    O hash do codigo, e nunca o codigo. Mesma cobranca de `senha_chega_derivada`
    (038) e pelo mesmo motivo: o dia em que alguem gravar o codigo digitado no
    lugar do hash nao pode terminar com a chave de recuperacao do dono do
    console em texto claro numa tabela. Conferido por `split_part` e nao por
    `LIKE`, para nao escrever neste arquivo nada com a cara de um hash (036).
  */
  codigo_hash   text NOT NULL,
  CONSTRAINT codigo_chega_derivado CHECK (
    split_part(codigo_hash, '$', 1) = 'scrypt' AND length(codigo_hash) >= 80
  ),

  criado_em     timestamptz NOT NULL DEFAULT now(),

  /*
    Gasto: pela pessoa, recuperando a senha; ou em bloco, quando ela gerou
    codigos novos (`console_renovar_codigos` marca os anteriores). Nao ha
    coluna separada para o segundo caso, de proposito: para a pergunta que
    importa ("este codigo ainda vale?") as duas respostas sao a mesma.
  */
  usado_em      timestamptz
);

-- A pergunta e sempre "quais codigos deste operador ainda valem" (022).
CREATE INDEX console_codigos_vivos_idx
  ON console_codigos_de_recuperacao (operador_id)
  WHERE usado_em IS NULL;

COMMENT ON TABLE console_codigos_de_recuperacao IS
  'Codigos de recuperacao de senha dos operadores do console, guardados como '
  'hash no formato da senha. Cada um vale uma vez; usar um redefine a senha E '
  'o segundo fator. Gerar codigos novos marca os antigos como usados, nao os '
  'apaga: codigo gasto fica, para o livro contar.';

ALTER TABLE console_codigos_de_recuperacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_codigos_de_recuperacao FORCE ROW LEVEL SECURITY;

/*
  COMANDO A COMANDO, nunca `FOR ALL` (032), e amarradas ao OPERADOR DA SESSAO,
  que e o `app_organizacao_atual()` deste lado da casa: cada operador ve e
  escreve os PROPRIOS codigos, e mais nenhum. Aqui a guarda nao e "e o dono"
  como nas duas tabelas da 038, porque gerar os proprios codigos e ato de
  qualquer operador autenticado, e ver os do outro nao e ato de ninguem, nem
  do dono. Sem contexto (o login, a recuperacao), a tabela e vazia e nao
  aceita linha.

  Sem policy de UPDATE: marcar um codigo como usado e ato de funcao, que roda
  sem contexto de operador (quem recupera nao tem sessao) e por isso nao
  poderia ser policy. Sem policy de DELETE: codigo gasto fica, marcado como
  gasto, pela razao da 022 ("usei tres" e "alguem usou tres por mim" precisam
  ser distinguiveis).
*/
CREATE POLICY console_codigos_leitura ON console_codigos_de_recuperacao
  FOR SELECT TO dc360_console
  USING (operador_id = console_operador_atual());

CREATE POLICY console_codigos_insercao ON console_codigos_de_recuperacao
  FOR INSERT TO dc360_console
  WITH CHECK (operador_id = console_operador_atual());

-- ---------------------------------------------------------------------
-- 2. Gerar: com sessao. Marca os anteriores como usados e insere os novos.
--
-- SECURITY DEFINER porque marcar os anteriores e um UPDATE, e o console nao
-- tem UPDATE nesta tabela (nem pode ter: com ele, uma sessao comprometida
-- desmarcaria um codigo gasto). Exige o operador da sessao, ativo.
-- ---------------------------------------------------------------------

CREATE FUNCTION console_renovar_codigos(p_hashes text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_operador  uuid := console_operador_atual();
  v_ativo     boolean;
  v_hash      text;
  v_inseridos integer;
BEGIN
  /*
    TUDO QUE RECUSA VEM ANTES DE TUDO QUE ESCREVE (036). E as recusas de
    contexto e de pedido ficam FORA do bloco que traduz `insufficient_privilege`
    logo abaixo, porque a primeira delas e um `insufficient_privilege` legitimo
    e nao pode ser confundida com a armadilha do dono sem BYPASSRLS.
  */
  IF v_operador IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Gerar codigos de recuperacao exige um operador na sessao.',
      DETAIL  = 'Nao ha operador no contexto. Os codigos sao gerados pelo proprio '
                'operador, autenticado; sem sessao, o caminho e a recuperacao.';
  END IF;

  IF p_hashes IS NULL OR cardinality(p_hashes) < 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Gerar codigos de recuperacao exige pelo menos quatro.',
      DETAIL  = 'Menos que isso e um jogo de codigos que acaba na segunda perda de '
                'telefone. O console gera oito; o piso do banco e quatro.';
  END IF;

  FOREACH v_hash IN ARRAY p_hashes LOOP
    IF v_hash IS NULL OR split_part(v_hash, '$', 1) <> 'scrypt' OR length(v_hash) < 80 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC361',
        MESSAGE = 'Os codigos de recuperacao precisam chegar ja derivados.',
        DETAIL  = 'Esperado, para cada um, o hash do produto, com algoritmo, parametros, '
                  'sal e resumo separados por cifrao. Codigo em texto claro nao entra '
                  'no banco em lugar nenhum, nem por esta porta.';
    END IF;
  END LOOP;

  /*
    Hash repetido na lista e defeito de quem chama (dois codigos iguais
    valeriam por um), e o banco nao o guardaria em silencio.
  */
  IF cardinality(p_hashes) <> (SELECT count(DISTINCT h) FROM unnest(p_hashes) AS h) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'A lista de codigos tem hash repetido.';
  END IF;

  BEGIN
    SELECT ativo INTO v_ativo FROM console_operadores WHERE id = v_operador;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC362',
      MESSAGE = 'O dono das tabelas foi barrado pela seguranca em nivel de linha ao ler '
                'console_operadores, porque nao tem BYPASSRLS. Nada foi gravado.',
      DETAIL  = 'Esta funcao le e escreve com os privilegios do dono das tabelas; sem '
                'BYPASSRLS ela alcancaria zero linha em silencio, e por isso prefere '
                'estourar. De BYPASSRLS ao papel que e dono das tabelas '
                '(docs/COLOCAR-DE-PE.md) e rode de novo.';
  END;

  IF NOT COALESCE(v_ativo, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Gerar codigos de recuperacao exige um operador ativo na sessao.',
      DETAIL  = 'O operador do contexto nao existe ou esta desativado.';
  END IF;

  BEGIN
    /*
      Os anteriores ficam, marcados: a tela pode dizer "voce gerou codigos em
      tal dia e gastou N", e ninguem confunde "renovei" com "alguem usou por
      mim". Primeira geracao alcanca zero linha aqui, e isso e normal.
    */
    UPDATE console_codigos_de_recuperacao
       SET usado_em = now()
     WHERE operador_id = v_operador AND usado_em IS NULL;

    INSERT INTO console_codigos_de_recuperacao (operador_id, codigo_hash)
    SELECT v_operador, h FROM unnest(p_hashes) AS h;
    GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC362',
      MESSAGE = 'O dono das tabelas foi barrado pela seguranca em nivel de linha ao '
                'gravar os codigos de recuperacao, porque nao tem BYPASSRLS. Nada foi gravado.',
      DETAIL  = 'A transacao inteira volta atras: nenhum codigo anterior foi marcado. Ver '
                'a mensagem da leitura acima: mesma causa, mesma saida.';
  END;

  IF v_inseridos <> cardinality(p_hashes) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC362',
      MESSAGE = format('Era para gravar %s codigos e o banco gravou %s. A transacao inteira volta atras.',
                       cardinality(p_hashes), v_inseridos);
  END IF;

  RETURN v_inseridos;
END;
$$;

COMMENT ON FUNCTION console_renovar_codigos(text[]) IS
  'Marca como usados todos os codigos vivos do operador da sessao e grava os novos, um por hash. Exige operador ativo no contexto e pelo menos quatro hashes derivados. Devolve quantos entraram.';

-- ---------------------------------------------------------------------
-- 3. Achar pelo email: SEM sessao. No molde de `credenciais_para_login` (002).
--
-- E a unica funcao do banco que devolve hash de credencial sem contexto, e o
-- que a mantem estreita e a forma dela: tres colunas (id do operador, id do
-- codigo, hash do CODIGO), e nada mais. Nem nome, nem papel, nem `senha_hash`.
-- Email que nao existe e operador desativado devolvem VAZIO, nunca erro: o
-- console nao pode revelar quem existe, entao "nao achei" e "achei mas esta
-- inativo" precisam ser indistinguiveis de fora.
-- ---------------------------------------------------------------------

CREATE FUNCTION console_recuperacao_por_email(p_email text)
RETURNS TABLE (operador_id uuid, codigo_id uuid, codigo_hash text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT o.id, c.id, c.codigo_hash
    FROM console_operadores o
    JOIN console_codigos_de_recuperacao c ON c.operador_id = o.id
   WHERE lower(o.email) = lower(trim(p_email))
     AND o.ativo
     AND c.usado_em IS NULL
   ORDER BY c.criado_em, c.id;
$$;

COMMENT ON FUNCTION console_recuperacao_por_email(text) IS
  'Os codigos de recuperacao ainda vivos do operador ATIVO com aquele email, para o console conferir o codigo digitado. Sem sessao. Email inexistente ou operador inativo devolvem vazio, nunca erro. So tres colunas: nem nome, nem papel, nem senha_hash.';

-- ---------------------------------------------------------------------
-- 4. Consumir: SEM sessao. Gasta o codigo, troca senha E segundo fator.
--
-- Derruba as sessoes sozinha: o token do console carrega um resumo de
-- `senha_hash` (`apps/console/src/tokens.ts`, `sv`), e o hash muda aqui.
-- ---------------------------------------------------------------------

CREATE FUNCTION console_consumir_recuperacao(
  p_codigo_id     uuid,
  p_senha_hash    text,
  p_segundo_fator text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_operador uuid;
  v_usado_em timestamptz;
  v_ativo    boolean;
  v_alvo     text := 'console_codigos_de_recuperacao';
  v_linhas   integer;
BEGIN
  /*
    O hash, e nao a senha; o envelope, e nao o segredo. Mesmas cobrancas de
    `senha_chega_derivada` e `segundo_fator_vem_cifrado` (038), feitas AQUI,
    antes de qualquer escrita, para a recusa vir com o nome do problema e nao
    com o nome de uma restricao de tabela.
  */
  IF p_senha_hash IS NULL
     OR split_part(p_senha_hash, '$', 1) <> 'scrypt'
     OR length(p_senha_hash) < 80 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'A senha nova precisa chegar ja derivada.',
      DETAIL  = 'Esperado o hash do produto, com algoritmo, parametros, sal e resumo '
                'separados por cifrao. Senha em texto claro nao entra no banco em '
                'lugar nenhum, nem por esta porta.';
  END IF;

  IF p_segundo_fator IS NULL OR p_segundo_fator NOT LIKE 'v1.%' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'O segundo fator novo precisa chegar cifrado.',
      DETAIL  = 'Esperado o envelope do cofre do console (v1.<vetor>.<selo>.<texto>). '
                'A recuperacao troca o segundo fator junto com a senha, e o segredo '
                'cru do TOTP nao entra no banco.';
  END IF;

  BEGIN
    SELECT c.operador_id, c.usado_em, o.ativo
      INTO v_operador, v_usado_em, v_ativo
      FROM console_codigos_de_recuperacao c
      JOIN console_operadores o ON o.id = c.operador_id
     WHERE c.id = p_codigo_id
       FOR UPDATE OF c;

    /*
      A MESMA mensagem para "nao existe" e "ja foi usado", de proposito: para
      quem esta do lado de fora tentando adivinhar, as duas sao a mesma
      resposta. Codigo de operador desativado tambem nao vale: a porta por
      email ja nao o devolve, e esta e a segunda linha, para o id guardado
      antes de a conta ser desativada.
    */
    IF v_operador IS NULL OR v_usado_em IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC365',
        MESSAGE = 'Este codigo de recuperacao nao vale.',
        DETAIL  = 'Nao existe ou ja foi usado. Cada codigo vale uma vez; se todos '
                  'foram gastos, nao ha recuperacao por este caminho.';
    END IF;
    IF NOT v_ativo THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC365',
        MESSAGE = 'Este codigo de recuperacao e de uma conta desativada.',
        DETAIL  = 'Conta desativada nao volta pela recuperacao de senha: quem a '
                  'desativou (o dono) e quem a reativa.';
    END IF;

    UPDATE console_codigos_de_recuperacao SET usado_em = now() WHERE id = p_codigo_id;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC362',
        MESSAGE = 'Era para marcar um codigo como usado e o banco marcou zero. Nada foi alterado.';
    END IF;

    /*
      Senha nova, segundo fator novo, teto de tentativas e passo do TOTP
      zerados: a conta nasce de novo, como se tivesse acabado de ser criada.
      `papel`, `criado_por` e `criado_em` nao sao tocados, e o gatilho da 038
      continua de guarda por baixo.
    */
    v_alvo := 'console_operadores';
    UPDATE console_operadores
       SET senha_hash        = p_senha_hash,
           segundo_fator     = p_segundo_fator,
           falhas_login      = 0,
           bloqueado_ate     = NULL,
           ultimo_passo_totp = NULL
     WHERE id = v_operador;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC362',
        MESSAGE = 'Era para redefinir a senha de um operador e o banco alterou zero. Nada foi alterado.';
    END IF;

  EXCEPTION WHEN insufficient_privilege THEN
    /*
      Armadilha 1 do cabecalho. Com `row_security = off`, o Postgres levanta
      este erro quando o dono das tabelas NAO e isento de RLS e a consulta
      seria filtrada por policy. Sem isto, a leitura acima devolveria "nao
      existe" e o UPDATE alcancaria zero: "senha redefinida" com a senha
      velha no lugar. A traducao diz o que houve e onde parou.
    */
    RAISE EXCEPTION USING
      ERRCODE = 'DC362',
      MESSAGE = format('A recuperacao parou em %s: o dono das tabelas foi barrado pela seguranca '
                       'em nivel de linha, porque nao tem BYPASSRLS. Nada foi alterado.', v_alvo),
      DETAIL  = 'A transacao inteira volta atras: o codigo continua vivo e a senha continua '
                'a antiga. Esta funcao escreve com os privilegios do dono das tabelas; sem '
                'BYPASSRLS o UPDATE alcancaria zero linha em silencio, e por isso ela '
                'prefere estourar. De BYPASSRLS ao papel que e dono das tabelas '
                '(docs/COLOCAR-DE-PE.md) e rode de novo.';
  END;
END;
$$;

COMMENT ON FUNCTION console_consumir_recuperacao(uuid, text, text) IS
  'Gasta o codigo de recuperacao (recusa com DC365 se nao existe, ja foi usado ou e de conta desativada), grava a senha nova e o envelope novo do segundo fator em console_operadores e zera falhas, bloqueio e passo do TOTP. Sem sessao. Derruba as sessoes porque o token carrega um resumo do senha_hash.';

-- ---------------------------------------------------------------------
-- 5. Quem alcanca o que.
--
-- `REVOKE ... FROM PUBLIC` primeiro (038): o padrao do Postgres e EXECUTE para
-- PUBLIC, e PUBLIC alcanca o papel de aplicacao de qualquer municipio, que nao
-- redefine senha de operador do console.
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION console_renovar_codigos(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_recuperacao_por_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_consumir_recuperacao(uuid, text, text) FROM PUBLIC;

/*
  O console: SELECT e INSERT na tabela (os proprios codigos, pela policy), e
  as tres funcoes. Nenhum UPDATE e nenhum DELETE diretos: marcar usado e ato
  de funcao, e codigo gasto nao se apaga. Nenhum outro papel alcanca a tabela:
  a excecao esta narrada no portao universal de `isolamento.test.ts`, como as
  das duas tabelas da 038.
*/
GRANT SELECT, INSERT ON console_codigos_de_recuperacao TO dc360_console;
GRANT EXECUTE ON FUNCTION console_renovar_codigos(text[]) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_recuperacao_por_email(text) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_consumir_recuperacao(uuid, text, text) TO dc360_console;
