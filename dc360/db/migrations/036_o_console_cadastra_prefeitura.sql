-- =====================================================================
-- 036: o console do fornecedor passa a CRIAR municipio, sem ganhar o
--      direito de LER municipio nenhum.
--
-- O PROBLEMA
--
-- Cadastrar uma prefeitura nova so existia como comando de linha
-- (`apps/api/src/provisionar.ts`), rodado com a credencial de DONO do banco,
-- a mesma que aplica migracao. Quem opera o produto precisa abrir um terminal
-- com a chave mais poderosa do sistema na mao para fazer o ato mais comum do
-- comeco de um contrato. A ADR 0008 ja ensinou o que acontece com lacuna de
-- ferramenta: ela nao elimina a operacao, empurra a operacao para o caminho
-- mais perigoso.
--
-- O QUE NAO DA PARA FAZER, E POR QUE
--
-- A saida obvia seria dar INSERT em `organizacoes` e `usuarios` ao papel
-- `dc360_console`. Isso quebra a decisao 3 da ADR 0008 pela raiz: privilegio
-- de tabela nao se divide em "so escrever". Com INSERT em `usuarios`, o
-- console cria um administrador dentro de um municipio que ja existe e entra
-- no painel dele; com INSERT em `organizacoes` e RLS amarrada ao contexto,
-- ainda sobra o `has_table_privilege` que o portao universal de
-- `db/test/isolamento.test.ts` cobra em SEIS caminhos. Nao e uma regra que
-- da para contornar com jeitinho: e a regra numero um do produto.
--
-- O DESENHO
--
-- Uma funcao `SECURITY DEFINER`, dona = dono das tabelas, com EXECUTE
-- concedido SO a `dc360_console`. O papel do console continua sem um unico
-- privilegio em tabela de negocio; o que ele ganha e o direito de executar UM
-- ato fechado, que faz exatamente tres escritas e devolve exatamente dois
-- identificadores.
--
-- POR QUE ELA NAO E UMA PORTA DE LEITURA
--
-- Esta e a pergunta que a excecao precisa responder, e ela se responde pela
-- forma da funcao, nao pela boa intencao de quem a escreveu:
--
--   1. A saida sao dois `uuid`: o do municipio criado e o do administrador
--      criado. Nao ha como devolver linha de tabela nenhuma.
--   2. Todo parametro e VALOR A SER GRAVADO, nenhum e filtro de consulta. Nao
--      existe parametro que escolha municipio, nem que escolha coluna, nem
--      que entre em `EXECUTE` de texto montado.
--   3. O unico `SELECT` do corpo e a recusa de duplicata, e ele olha para o
--      municipio e a UF que quem chama acabou de DIGITAR. O console ja tem
--      `SELECT` em `organizacoes` desde a migracao 023 (decisao 3 da ADR
--      0008, para a tela conseguir dizer de que prefeitura esta falando),
--      entao esse ramo nao entrega um dado a mais do que ele ja podia listar.
--   4. O corpo nao nomeia tabela de negocio nenhuma alem das tres que ele
--      escreve. Nada de `ocorrencias`, `vistorias`, `evidencias`, `sessoes`.
--
-- Os quatro pontos sao COBRADOS por caso de teste no bloco "A porta de criar
-- municipio" de `db/test/isolamento.test.ts`, que e o irmao obrigatorio da
-- excecao aberta na assercao universal.
--
-- POR QUE A LINHA ESPELHO ENTRA AQUI DENTRO
--
-- Pela mesma razao da migracao 025: o ato e o registro do ato precisam ser a
-- mesma transacao. Se o registro ficasse do lado de fora, existiria um caminho
-- que cria municipio sem registrar, e registro que pode ser esquecido nao e
-- registro. O municipio nasce podendo ler, na trilha dele, quem o criou.
--
-- POR QUE ELA NAO FAZ `SET ROLE dc360_app`, E A 025 FAZ
--
-- Porque o Postgres nao deixa, e a recusa e explicita:
--
--   ERROR: cannot set parameter "role" within security-definer function
--
-- Dentro de uma funcao `SECURITY DEFINER` o servidor esta em mudanca local de
-- identidade, e trocar de papel ali e proibido. Mesmo que fosse permitido, nao
-- funcionaria: `SET ROLE` e conferido contra o USUARIO DE SESSAO, que aqui e o
-- login do console, e esse login nao e membro de `dc360_app` (e nao pode ser:
-- filiacao de papel e o caminho numero 3 do portao universal).
--
-- Entao a linha espelho e gravada pelo proprio definidor, que e o dono das
-- tabelas. Em toda implantacao deste produto o dono e o papel que aplica
-- migracao e e isento de RLS (superusuario ou BYPASSRLS): e ele quem semeia,
-- migra e provisiona desde a primeira versao. Se um dia nao for, a insercao e
-- recusada, a transacao inteira volta atras e NENHUM municipio nasce pela
-- metade; o bloco de excecao la embaixo troca o erro cru do Postgres por uma
-- frase que diz o que fazer.
--
-- A SENHA NAO CHEGA AQUI EM TEXTO CLARO
--
-- O parametro e `p_senha_hash`, e a funcao RECUSA o que nao tiver o formato de
-- hash do produto (o nome do algoritmo, os parametros, o sal e o resumo,
-- separados por cifrao). A derivacao continua sendo a do
-- `apps/api/src/auth/senha.ts`, feita no processo do console antes da chamada.
-- A recusa nao e preciosismo: sem ela, um dia alguem passa a senha digitada no
-- lugar do hash, o banco aceita, e o municipio nasce com a senha do
-- administrador em texto claro dentro de `usuarios`, onde ela fica para
-- sempre. Com a recusa, esse erro morre na primeira chamada.
-- =====================================================================

CREATE FUNCTION provisionar_municipio(
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
  /*
    TUDO QUE RECUSA VEM ANTES DE TUDO QUE ESCREVE.

    Recusar no meio deixaria a organizacao criada e o municipio pela metade,
    dependendo de quem chama lembrar de desfazer. A transacao cobriria, mas
    "a transacao cobre" e a frase que antecede a descoberta de que alguem
    chamou sem transacao.
  */
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

  /*
    O hash, e nao a senha. Ver o cabecalho: sem esta recusa, o dia em que
    alguem passar a senha digitada no lugar do hash termina com a senha do
    administrador em texto claro dentro de `usuarios`.

    O piso de tamanho existe porque o nome do algoritmo sozinho tambem passaria:
    o formato do produto tem seis campos separados por cifrao (algoritmo, N, r,
    p, sal e resumo, os dois ultimos em base64url) e nao desce de oitenta
    caracteres.

    A conferencia e por `split_part` e nao por `LIKE`, e isso evita escrever
    neste arquivo um pedaco de texto com a cara de um hash de senha. Nao e
    preciosismo: as migracoes viajam dentro do pacote de saida do municipio
    (`docs/SAIDA-DE-MUNICIPIO.md`), e esse pacote e varrido byte a byte atras de
    qualquer coisa parecida com segredo. Um exemplo em comentario reprovaria
    aquela varredura, e afrouxar a varredura para caber um comentario seria a
    troca errada.
  */
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

  /*
    Duplicata: a recusa ACONTECE ANTES DE QUALQUER ESCRITA e diz qual ja
    existe, porque "ja existe" sem dizer qual manda a pessoa procurar sozinha
    na lista. Comparacao sem caixa dos dois lados: "serra alta" e "Serra Alta"
    sao a mesma prefeitura, e dois cadastros dela seriam dois bancos de dados
    invisiveis um para o outro.

    A mensagem devolve o nome COMO ESTA GRAVADO, e nao como foi digitado: quem
    digitou "serra alta" precisa enxergar "Serra Alta" para reconhecer o
    cadastro que ja existe, e repetir de volta o que a pessoa digitou esconde
    justamente a diferenca que ela precisa ver.
  */
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
    'administrador', fixo e nao parametro. O primeiro usuario de um municipio
    precisa ser o teto dele (ADR 0006): nascer abaixo disso deixaria o
    municipio sem ninguem capaz de criar o proximo usuario, e a saida seria
    outra vez o banco de producao aberto na mao.
  */
  BEGIN
    INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
    VALUES (organizacao_id, v_nome, v_matricula, v_email, 'administrador', p_senha_hash)
    RETURNING id INTO usuario_id;
  EXCEPTION WHEN unique_violation THEN
    /*
      SO a restricao do email, conferida pelo nome, e as outras seguem cruas.

      A organizacao acabou de nascer, entao hoje as unicidades por municipio
      (matricula e email dentro da organizacao) nao tem com o que colidir, e a
      unica que pode disparar aqui e a global. Traduzir TODA unique_violation
      como "email repetido" seria escrever uma mensagem que um dia vira mentira,
      e mensagem de erro que mente custa mais caro que mensagem crua.

      O email de login e unico no PRODUTO INTEIRO, e nao dentro do municipio
      (`usuarios_email_global_idx`, migracao 002): na hora do login ainda nao se
      sabe o municipio, e dois usuarios com o mesmo email em prefeituras
      diferentes tornariam a resposta ambigua.

      Sem esta traducao, quem cadastra recebe "duplicate key value violates
      unique constraint" e nao tem como saber qual dos campos repetiu.

      A mensagem NAO diz em qual municipio aquele email ja tem conta. Quem
      cadastra ja pode listar os municipios (concessao da migracao 023), mas
      nao pode saber quem trabalha em cada um: isso e dado de pessoa, e a
      decisao 2 da ADR 0008 e explicita de que ele nao passa pelo console.
    */
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
       /*
         O "depois" descreve o que nasceu, para a auditoria nao precisar cruzar
         com o cadastro atual, que pode ter mudado desde entao.

         NUNCA a senha inicial, nem o hash dela. A migracao 010 ja escreveu essa
         regra: a trilha e append-only, e uma senha que entrasse aqui nao sairia
         mais, nem por correcao.
       */
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
    /*
      Ver o cabecalho. O erro cru do Postgres aqui ("new row violates row-level
      security policy") mandaria a pessoa procurar defeito no lugar errado.
    */
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

COMMENT ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text) IS
  'Cria um municipio e o primeiro administrador dele, com a linha de nascimento na trilha, numa transacao so. Devolve apenas os dois identificadores. E a UNICA escrita que o papel dc360_console alcanca, e ela nao le nada.';

-- ---------------------------------------------------------------------
-- Quem executa
-- ---------------------------------------------------------------------
--
-- `REVOKE ... FROM PUBLIC` primeiro, e nao por higiene: o privilegio PADRAO do
-- Postgres para funcao e EXECUTE para PUBLIC. Sem esta linha, a funcao nasceria
-- executavel por todo papel conectado, inclusive pelo papel de aplicacao de
-- qualquer municipio, e um municipio conseguiria criar outro municipio.
REVOKE ALL ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text) FROM PUBLIC;

-- E SO o console. `dc360_app` fica de fora de proposito: criar prefeitura nao e
-- ato de municipio nenhum, e uma falha de autorizacao no painel de uma
-- prefeitura nao pode alcancar esta porta.
GRANT EXECUTE ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)
  TO dc360_console;
