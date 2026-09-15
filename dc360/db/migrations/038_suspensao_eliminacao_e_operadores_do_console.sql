-- =====================================================================
-- 038: suspender o acesso de um municipio, eliminar um municipio com prazo
--      de arrependimento, e os operadores do console saindo da configuracao
--      do processo para o banco.
--
-- O PEDIDO, NA LETRA DO DONO
--
-- "No gestao tem que existir um botao que exige autenticacao e os carambas,
-- pra apagar uma prefeitura por completo, eliminar pra sempre da face da terra
-- ela e tudo que existe, e outro botao so pra desativar o acesso. E no gestao
-- tem que existir uma area de usuarios, pra eu, o primeiro admin, conseguir
-- trocar minha senha e gerar novos usuarios que vao ficar abaixo; eles jamais
-- podem ter o poder sobre a primeira conta."
--
-- Decisoes tomadas com ele: eliminacao com PRAZO DE ARREPENDIMENTO DE SETE
-- DIAS (suspende na hora, apaga depois, com cancelamento durante o prazo);
-- operadores abaixo do dono veem numeros e cadastram prefeitura, e so o dono
-- desativa, elimina e gerencia usuarios.
--
-- =====================================================================
-- A REGRA QUE ORGANIZA O DESENHO INTEIRO
--
-- O console so escreve INTENCAO. Quem executa o irreversivel e o relogio da
-- API, guardado pelo estado no banco.
--
-- O console suspende, agenda e cancela, por quatro funcoes privilegiadas que
-- exigem que o operador da sessao seja o dono. Passado o prazo, o relogio da
-- API (papel `dc360_app`, sem municipio no contexto, como `varrer_prazos` e
-- `municipios_a_resumir`) apaga as linhas, purga as fotografias do lado de la
-- (o console NAO pode ter credencial de armazenamento, pela ADR 0008) e
-- remove o municipio. Cada fase fica num livro que SOBREVIVE ao apagamento:
-- `eliminacoes_de_municipio` guarda o id, o nome e a UF SEM chave estrangeira
-- para `organizacoes`, de proposito, porque a organizacao vai sumir e o livro
-- fica.
--
-- O relogio nao confia so no livro. Para apagar, ele exige DUAS marcas: a
-- linha do livro vencida e nao cancelada, E a organizacao marcada como
-- suspensa e agendada. A segunda marca so a funcao privilegiada escreve (o
-- console nao tem UPDATE em `organizacoes`), entao uma linha escrita no livro
-- por fora da funcao nao apaga nada. E isso que a frase "guardado pelo estado
-- no banco" quer dizer.
--
-- =====================================================================
-- AS TRES ARMADILHAS QUE JA MORDERAM ESTE REPOSITORIO, E COMO ESTA
-- MIGRACAO PASSA POR ELAS
--
-- 1. `FORCE ROW LEVEL SECURITY` vale para o dono das tabelas, e nenhuma
--    tabela de negocio tem policy de DELETE (032, 033, 034). Uma funcao
--    SECURITY DEFINER que faca `DELETE FROM ocorrencias` apaga ZERO linha sem
--    estourar quando o dono nao tem `BYPASSRLS`. Em producao o dono e
--    `postgres` e tem, mas isso e atributo do papel, nao do produto (037).
--
--    A resposta aqui tem duas camadas. A primeira e `SET row_security = off`
--    na definicao das funcoes que apagam: com essa opcao, uma consulta que
--    SERIA filtrada por policy vira ERRO ("query would be affected by
--    row-level security policy for table ..."), em vez de devolver zero em
--    silencio; para um dono com `BYPASSRLS` a opcao nao muda nada. A segunda
--    e a conferencia depois de cada DELETE: a funcao conta o que restou
--    daquela organizacao na tabela e levanta erro nomeando a tabela se restou
--    alguma coisa. Apagamento pela metade e silencioso e o pior desfecho
--    possivel desta feature, e as duas camadas existem para ele ser
--    impossivel de dois jeitos.
--
-- 2. A ORDEM DE APAGAMENTO. Ha dezenas de chaves estrangeiras compostas
--    `(organizacao_id, id)`, varias `RESTRICT`. A ordem abaixo foi descoberta
--    pelo catalogo (`pg_constraint`, contype 'f', ordenacao topologica com
--    filho antes de pai, sem distinguir RESTRICT de CASCADE de SET NULL, para
--    nao depender do tipo da acao) e esta escrita por extenso dentro da
--    funcao, em camadas: primeiro quem ninguem referencia, por ultimo
--    `equipes`, que todo mundo referencia. A lista e conferida contra o
--    catalogo ANTES de apagar qualquer coisa: uma tabela com `organizacao_id`
--    que nao esteja na lista faz a funcao recusar, nomeando a tabela.
--
-- 3. A varredura universal de `db/test/isolamento.test.ts` reprova tabela
--    nova que o console le, funcao SECURITY DEFINER nova, e o console com
--    mais que SELECT. Cada excecao entra la NARRADA, com caso-irmao provando
--    o limite, em `db/test/eliminacao-de-municipio.test.ts`.
--
-- =====================================================================
-- POR QUE OS OPERADORES SAEM DA CONFIGURACAO E VEM PARA O BANCO
--
-- `apps/console/src/operadores.ts` explica por que as contas do console
-- moravam em `CONSOLE_OPERADORES`: o papel do console nao tinha escrita em
-- lugar nenhum, e uma tabela de operadores exigiria dar escrita a ele. O
-- preco, escrito la: criar operador exige implantar de novo, e o passo do
-- TOTP ja usado vive na memoria do processo, o que obriga o console a rodar
-- numa maquina so.
--
-- O pedido do dono ("area de usuarios", "trocar minha senha", "gerar novos
-- usuarios") nao cabe em configuracao. A tabela entra, e a escrita que o
-- console ganha e SO NELA e no livro, e nao em tabela de negocio nenhuma. A
-- decisao 3 da ADR 0008 continua de pe: o papel `dc360_console` segue sem um
-- privilegio sequer em tabela que guarde dado de cidadao.
--
-- A primeira conta (o dono) e semeada pelo proprio console na partida, a
-- partir de `CONSOLE_OPERADORES`, e SO enquanto a tabela estiver vazia: a
-- policy de INSERT tem um ramo para isso e ele fecha na primeira linha. Nao
-- e preciso a credencial de dono do banco para o console nascer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As colunas novas em `organizacoes`: o estado que guarda o relogio.
-- ---------------------------------------------------------------------

ALTER TABLE organizacoes
  ADD COLUMN acesso_suspenso_em        timestamptz,
  ADD COLUMN suspensao_motivo          text,
  ADD COLUMN eliminacao_agendada_para  timestamptz,
  ADD COLUMN eliminada_em              timestamptz,
  ADD COLUMN armazenamento_purgado_em  timestamptz;

/*
  As fases so acontecem nesta ordem, e o banco cobra a ordem:
  suspensa -> agendada -> banco apagado -> armazenamento purgado (e ai a linha
  some). Uma organizacao "eliminada" que nunca foi agendada, ou "purgada" sem
  ter sido apagada, e um estado que nenhuma tela sabe mostrar.
*/
ALTER TABLE organizacoes
  ADD CONSTRAINT suspensao_com_motivo CHECK (
    (acesso_suspenso_em IS NULL) = (suspensao_motivo IS NULL)
  ),
  ADD CONSTRAINT eliminacao_exige_suspensao CHECK (
    eliminacao_agendada_para IS NULL OR acesso_suspenso_em IS NOT NULL
  ),
  ADD CONSTRAINT banco_apagado_exige_agendamento CHECK (
    eliminada_em IS NULL OR eliminacao_agendada_para IS NOT NULL
  ),
  ADD CONSTRAINT purga_depois_do_banco CHECK (
    armazenamento_purgado_em IS NULL OR eliminada_em IS NOT NULL
  );

COMMENT ON COLUMN organizacoes.acesso_suspenso_em IS
  'Quando o fornecedor suspendeu o acesso. Enquanto preenchido, nenhuma sessao '
  'nova abre (abrir_sessao recusa) e as existentes foram revogadas. So o '
  'console escreve, pela funcao console_suspender_municipio.';
COMMENT ON COLUMN organizacoes.eliminacao_agendada_para IS
  'O fim do prazo de arrependimento de sete dias. Preenchido, junto com a '
  'linha do livro, e o que autoriza o relogio da API a apagar.';
COMMENT ON COLUMN organizacoes.eliminada_em IS
  'As linhas filhas ja foram apagadas. A linha da organizacao fica ate o '
  'armazenamento ser purgado, para a API saber qual prefixo purgar.';
COMMENT ON COLUMN organizacoes.armazenamento_purgado_em IS
  'Marcada por concluir_eliminacao um instante antes de a linha ser apagada.';

/*
  O PAPEL DE APLICACAO NAO TOCA NESSAS CINCO COLUNAS.

  `dc360_app` tem UPDATE em `organizacoes` (nome, retencao, ponto de
  referencia). Sem este gatilho, uma falha de autorizacao no painel de um
  municipio suspenso escreveria `acesso_suspenso_em = NULL` e o municipio
  voltaria a entrar; ou escreveria `eliminada_em` e faria o relogio purgar o
  armazenamento de um municipio vivo. Mesmo molde de
  `teto_nao_se_altera_pela_aplicacao` (035): o gatilho olha para quem esta
  escrevendo, e a aplicacao recebe "permissao negada" com o motivo.
*/
CREATE FUNCTION suspensao_e_eliminacao_sao_do_fornecedor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'dc360_app' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.acesso_suspenso_em IS NOT NULL OR NEW.suspensao_motivo IS NOT NULL
       OR NEW.eliminacao_agendada_para IS NOT NULL OR NEW.eliminada_em IS NOT NULL
       OR NEW.armazenamento_purgado_em IS NOT NULL THEN
      RAISE EXCEPTION
        'suspensao e eliminacao de municipio sao atos do fornecedor, e nao se escrevem pela aplicacao'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.acesso_suspenso_em       IS DISTINCT FROM OLD.acesso_suspenso_em
     OR NEW.suspensao_motivo         IS DISTINCT FROM OLD.suspensao_motivo
     OR NEW.eliminacao_agendada_para IS DISTINCT FROM OLD.eliminacao_agendada_para
     OR NEW.eliminada_em             IS DISTINCT FROM OLD.eliminada_em
     OR NEW.armazenamento_purgado_em IS DISTINCT FROM OLD.armazenamento_purgado_em THEN
    RAISE EXCEPTION
      'suspensao e eliminacao de municipio sao atos do fornecedor, e nao se alteram pela aplicacao'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER suspensao_nao_se_altera_pela_aplicacao
  BEFORE INSERT OR UPDATE ON organizacoes
  FOR EACH ROW EXECUTE FUNCTION suspensao_e_eliminacao_sao_do_fornecedor();

-- ---------------------------------------------------------------------
-- 2. Os operadores do console.
-- ---------------------------------------------------------------------

CREATE TABLE console_operadores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  /*
    O hash do produto, e nunca a senha. Mesma recusa de `provisionar_municipio`
    (036), pelo mesmo motivo: o dia em que alguem passar a senha digitada no
    lugar do hash nao pode terminar com a senha do dono do console em texto
    claro numa tabela.
  */
  senha_hash      text NOT NULL,
  CONSTRAINT senha_chega_derivada CHECK (
    split_part(senha_hash, '$', 1) = 'scrypt' AND length(senha_hash) >= 80
  ),

  /*
    O envelope cifrado do segredo do TOTP, como em `segundo_fator` (022):
    'v1.<vetor>.<selo>.<texto cifrado>', cifrado com a chave do processo do
    console e amarrado ao email pelo contexto `console:<email>`
    (`apps/console/src/operadores.ts`). Obrigatorio: conta de console sem
    segundo fator nao e conta em transicao, e conta que entraria so com senha
    (decisao 4 da ADR 0008).
  */
  segundo_fator   text NOT NULL,
  CONSTRAINT segundo_fator_vem_cifrado CHECK (segundo_fator LIKE 'v1.%'),

  papel           text NOT NULL CHECK (papel IN ('dono', 'operador')),
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  /*
    Nulo SO para o dono. Todo operador nasce pela mao de alguem, e esse alguem
    e o dono: e a unica resposta que existe para "quem criou esta conta".
  */
  criado_por      uuid REFERENCES console_operadores(id) ON DELETE RESTRICT,
  CONSTRAINT operador_tem_criador CHECK ((papel = 'dono') = (criado_por IS NULL)),

  /*
    O console nunca fica sem dono ativo, pelo mesmo motivo que o municipio
    nunca fica sem administrador ativo (ADR 0006): sem ele, ninguem cria o
    proximo operador, e a saida seria o banco aberto na mao.
  */
  CONSTRAINT dono_sempre_ativo CHECK (papel <> 'dono' OR ativo),

  falhas_login    integer NOT NULL DEFAULT 0 CHECK (falhas_login >= 0),
  bloqueado_ate   timestamptz,

  /*
    O passo do TOTP ja usado, que sai da memoria do processo e vem para o
    banco. Com ele na memoria, reiniciar o processo esquecia o passo queimado
    e o console tinha que rodar numa maquina so. Mesma coluna, mesmo motivo de
    `segundo_fator.ultimo_passo` (022).
  */
  ultimo_passo_totp bigint
);

CREATE UNIQUE INDEX console_operadores_email_idx ON console_operadores (lower(email));

/*
  EXATAMENTE UM DONO. O indice unico parcial e quem diz isso, e nao a policy:
  a policy vale para o papel do console, o indice vale ate para o dono do
  banco. A primeira conta nasce na PARTIDA do console, com a tabela vazia (ver
  a policy de INSERT): e a unica hora em que uma linha `dono` entra por ali, e
  depois dela nem o dono cria outro dono.
*/
CREATE UNIQUE INDEX console_operadores_um_dono_idx
  ON console_operadores ((papel)) WHERE papel = 'dono';

COMMENT ON TABLE console_operadores IS
  'Quem entra no console do fornecedor. Um dono, que gerencia os demais e e o '
  'unico que suspende, agenda e cancela eliminacao; operadores abaixo dele, '
  'que veem numeros e cadastram prefeitura. Operador se desativa, nao se apaga.';

/*
  Papel, criador e data de criacao nao mudam depois de gravados, nem pela mao
  do dono. Sem isto, o dono promoveria um operador a dono (e o indice unico
  nao impediria se ele se rebaixasse antes), ou um operador se promoveria na
  propria linha, que a policy deixa ele editar.
*/
CREATE FUNCTION operador_do_console_nao_muda_de_papel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.papel <> OLD.papel THEN
    RAISE EXCEPTION 'o papel de um operador do console nao muda: crie outra conta'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por OR NEW.criado_em <> OLD.criado_em THEN
    RAISE EXCEPTION 'criado_por e criado_em de um operador do console nao se reescrevem'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER papel_de_operador_do_console_nao_muda
  BEFORE UPDATE ON console_operadores
  FOR EACH ROW EXECUTE FUNCTION operador_do_console_nao_muda_de_papel();

/*
  O operador do contexto, no molde de `app_organizacao_atual()` (001): STABLE
  e sem SECURITY DEFINER, so le a variavel que o console declarou com
  `SET LOCAL` depois de verificar a sessao. Antes de haver sessao (no login),
  o console declara o id da linha que achou pelo email, para gravar a
  tentativa nela: a policy de UPDATE so alcanca a propria linha.
*/
CREATE FUNCTION console_operador_atual() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(current_setting('app.console_operador', true), '')::uuid;
$$;

/*
  "O operador do contexto e um dono ativo": a pergunta que as policies e as
  quatro funcoes do console fazem.

  SECURITY INVOKER e plpgsql, de proposito. Uma policy que consultasse a
  propria tabela numa subconsulta cairia na deteccao de recursao do Postgres;
  chamada de dentro de uma funcao plpgsql (que nunca e embutida no plano da
  consulta de fora), a leitura roda como consulta propria, com a policy de
  SELECT do console (todas as linhas), e nao recorre. Ela nao escala nada: le
  o que o console ja le.
*/
CREATE FUNCTION console_operador_e_dono() RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM console_operadores
     WHERE id = console_operador_atual() AND papel = 'dono' AND ativo
  );
END;
$$;

/*
  "Ainda nao ha operador nenhum": a pergunta que a semeadura do dono faz.
  Mesma forma e mesmo motivo de `console_operador_e_dono()`: plpgsql para nao
  ser embutida na policy e cair na deteccao de recursao.
*/
CREATE FUNCTION console_sem_operadores() RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM console_operadores);
END;
$$;

ALTER TABLE console_operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_operadores FORCE ROW LEVEL SECURITY;

/*
  COMANDO A COMANDO, nunca `FOR ALL` (032). Sem policy de DELETE: operador se
  desativa, nao se apaga, porque ele assina o livro de eliminacoes com o email
  e aparece na trilha dos municipios que suspendeu.

  SELECT: todas as linhas. O login acontece sem operador no contexto e precisa
  achar a linha pelo email; e a tela de usuarios do dono lista todo mundo.
*/
CREATE POLICY console_operadores_leitura ON console_operadores
  FOR SELECT TO dc360_console
  USING (true);

/*
  INSERT, em dois ramos que nao se cruzam:

    - `operador`: so o dono, e a linha nasce assinada por ele (`criado_por` e
      o operador do contexto, e nao um valor livre);
    - `dono`: SO COM A TABELA VAZIA, e sem contexto nenhum. E a partida do
      console semeando a primeira conta a partir de `CONSOLE_OPERADORES`, uma
      vez. Com um operador que seja na tabela, este ramo fecha para sempre:
      nem o dono cria outro dono (o indice unico parcial diz o mesmo, para o
      dono do banco). A alternativa era semear pela credencial de dono do
      banco, que e exatamente o caminho que a ADR 0008 chama de perigoso.

  Um operador nunca passa por nenhum dos dois ramos: ele nao e dono, e a
  tabela nao esta vazia enquanto ele existir.
*/
CREATE POLICY console_operadores_insercao ON console_operadores
  FOR INSERT TO dc360_console
  WITH CHECK (
    (papel = 'operador' AND criado_por = console_operador_atual() AND console_operador_e_dono())
    OR
    (papel = 'dono' AND console_sem_operadores())
  );

/*
  UPDATE: a propria linha, OU o atual e dono E a linha alvo e operador.

  E aqui que mora a frase "eles jamais podem ter o poder sobre a primeira
  conta": um operador nunca seleciona a linha do dono, entao um UPDATE dele
  contra o dono volta dizendo que alterou zero. USING e WITH CHECK iguais,
  para a linha nao poder ser empurrada para fora do alcance de quem a alterou.
*/
CREATE POLICY console_operadores_atualizacao ON console_operadores
  FOR UPDATE TO dc360_console
  USING (id = console_operador_atual() OR (papel = 'operador' AND console_operador_e_dono()))
  WITH CHECK (id = console_operador_atual() OR (papel = 'operador' AND console_operador_e_dono()));

-- ---------------------------------------------------------------------
-- 3. O livro de eliminacoes.
-- ---------------------------------------------------------------------

CREATE TABLE eliminacoes_de_municipio (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    SEM chave estrangeira, de proposito: a organizacao vai sumir e o livro
    fica. Nome e UF sao copiados no agendamento pelo mesmo motivo. O portao de
    chaves estrangeiras de `isolamento.test.ts` nao cobra esta tabela porque
    ela nao tem chave nenhuma, e o caso-irmao em
    `eliminacao-de-municipio.test.ts` cobra que continue nao tendo.
  */
  organizacao_id            uuid NOT NULL,
  municipio_nome            text NOT NULL CHECK (length(trim(municipio_nome)) > 0),
  uf                        text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),

  solicitada_em             timestamptz NOT NULL DEFAULT now(),
  executar_em               timestamptz NOT NULL,
  solicitada_por_email      text NOT NULL,
  motivo                    text NOT NULL CHECK (length(trim(motivo)) > 0),

  cancelada_em              timestamptz,
  cancelada_por_email       text,

  banco_apagado_em          timestamptz,
  /* Quantas linhas de cada tabela foram apagadas: {"ocorrencias": 41, ...}. */
  contagens                 jsonb,
  armazenamento_purgado_em  timestamptz,
  concluida_em              timestamptz,

  /*
    O PRAZO DE ARREPENDIMENTO E DO BANCO, e nao so da funcao. Uma linha
    escrita por fora da funcao (o console tem INSERT aqui, ver a policy) nao
    encurta os sete dias.
  */
  CONSTRAINT prazo_de_arrependimento_de_sete_dias CHECK (
    executar_em >= solicitada_em + interval '7 days'
  ),
  CONSTRAINT cancelamento_e_inteiro CHECK (
    (cancelada_em IS NULL) = (cancelada_por_email IS NULL)
  ),
  /* Cancelada e executada sao desfechos que se excluem. */
  CONSTRAINT cancelada_ou_apagada_nunca_as_duas CHECK (
    cancelada_em IS NULL OR banco_apagado_em IS NULL
  ),
  CONSTRAINT contagens_vem_com_o_apagamento CHECK (
    (banco_apagado_em IS NULL) = (contagens IS NULL)
  ),
  CONSTRAINT purga_depois_do_banco CHECK (
    armazenamento_purgado_em IS NULL OR banco_apagado_em IS NOT NULL
  ),
  CONSTRAINT conclusao_depois_da_purga CHECK (
    concluida_em IS NULL OR armazenamento_purgado_em IS NOT NULL
  )
);

/*
  UMA eliminacao ativa por municipio. "Ja ha eliminacao agendada" e regra do
  banco, por indice, e nao so uma recusa dentro da funcao.
*/
CREATE UNIQUE INDEX eliminacoes_uma_ativa_por_municipio
  ON eliminacoes_de_municipio (organizacao_id)
  WHERE cancelada_em IS NULL AND concluida_em IS NULL;

CREATE INDEX eliminacoes_vencidas_idx
  ON eliminacoes_de_municipio (executar_em)
  WHERE cancelada_em IS NULL AND banco_apagado_em IS NULL;

COMMENT ON TABLE eliminacoes_de_municipio IS
  'O livro de eliminacoes: uma linha por pedido, com as fases (agendada, '
  'cancelada, banco apagado, armazenamento purgado, concluida). Sem chave '
  'estrangeira para organizacoes, porque a organizacao some e o livro fica.';

ALTER TABLE eliminacoes_de_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliminacoes_de_municipio FORCE ROW LEVEL SECURITY;

CREATE POLICY eliminacoes_leitura_do_console ON eliminacoes_de_municipio
  FOR SELECT TO dc360_console
  USING (true);

/*
  INSERT pelo console: so o dono, so uma linha recem-nascida (nenhuma fase
  preenchida), e com o prazo inteiro. A funcao `console_agendar_eliminacao` e
  o caminho normal; esta policy e o que vale para quem escrever por fora dela.
  Lembrando que a linha sozinha nao aciona o relogio: ele exige a marca na
  organizacao, que so a funcao escreve.
*/
CREATE POLICY eliminacoes_insercao_do_console ON eliminacoes_de_municipio
  FOR INSERT TO dc360_console
  WITH CHECK (
    console_operador_e_dono()
    AND cancelada_em IS NULL AND banco_apagado_em IS NULL
    AND armazenamento_purgado_em IS NULL AND concluida_em IS NULL
    AND solicitada_em <= now()
  );

/*
  UPDATE pelo console: so o dono, so linha ainda nao apagada, e so ENTRANDO no
  estado cancelado. Descancelar por UPDATE rearmaria o relogio sem passar por
  funcao nenhuma. As colunas alcancadas sao as duas de cancelamento, por
  privilegio de coluna (ver a concessao no fim).
*/
CREATE POLICY eliminacoes_cancelamento_do_console ON eliminacoes_de_municipio
  FOR UPDATE TO dc360_console
  USING (console_operador_e_dono() AND banco_apagado_em IS NULL)
  WITH CHECK (console_operador_e_dono() AND banco_apagado_em IS NULL AND cancelada_em IS NOT NULL);

-- Sem policy de DELETE, e sem concessao: o livro nao se apaga.

-- ---------------------------------------------------------------------
-- 4. As quatro funcoes do console: suspender, reativar, agendar, cancelar.
--
-- Todas SECURITY DEFINER (o console nao tem UPDATE em `organizacoes` nem em
-- `sessoes`, nem INSERT em `trilha_administrativa`, e nao pode ter), todas
-- com `search_path` fixo, todas exigindo que o operador do contexto seja um
-- dono ativo, e todas com `SET row_security = off`: se o dono das tabelas
-- nao for isento de RLS, a escrita ESTOURA em vez de alcancar zero linha
-- (armadilha 1 do cabecalho).
--
-- Cada uma grava uma linha na trilha administrativa do municipio, como
-- `provisionar_municipio` (036): o municipio le, na propria trilha, quem o
-- suspendeu e por que. A linha vai junto quando o municipio e eliminado, e
-- ai o que sobra e o livro.
-- ---------------------------------------------------------------------

CREATE FUNCTION console_suspender_municipio(p_org uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_motivo    text := trim(p_motivo);
  v_email     text;
  v_nome      text;
  v_ja_estava timestamptz;
  v_revogadas integer;
BEGIN
  IF NOT console_operador_e_dono() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'So o dono do console suspende o acesso de um municipio.',
      DETAIL  = 'O operador da sessao nao e o dono, ou nao ha operador no contexto.';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Suspender exige motivo.',
      DETAIL  = 'O motivo vai para a trilha do municipio e para a tela de quem for reativar.';
  END IF;

  SELECT email INTO v_email FROM console_operadores WHERE id = console_operador_atual();

  SELECT municipio || '/' || uf, acesso_suspenso_em INTO v_nome, v_ja_estava
    FROM organizacoes WHERE id = p_org AND eliminada_em IS NULL;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = format('Nao ha municipio ativo com o id %s.', p_org);
  END IF;

  /*
    Idempotente: suspender de novo mantem a data original e atualiza o motivo.
    `console_agendar_eliminacao` chama esta funcao, e o municipio pode ja
    estar suspenso quando o dono decide eliminar.
  */
  UPDATE organizacoes
     SET acesso_suspenso_em = COALESCE(acesso_suspenso_em, now()),
         suspensao_motivo   = v_motivo
   WHERE id = p_org;

  /*
    Revoga TODAS as sessoes do municipio, para ninguem continuar renovando
    token. Mesma escrita de `revogar_sessoes_do_usuario` (002), so que pela
    organizacao inteira. `abrir_sessao` recusa sessao nova enquanto a
    suspensao durar (ver a parte 6).
  */
  UPDATE sessoes
     SET revogada_em = now(), motivo_revogacao = 'acesso suspenso pelo fornecedor'
   WHERE organizacao_id = p_org AND revogada_em IS NULL;
  GET DIAGNOSTICS v_revogadas = ROW_COUNT;

  IF v_ja_estava IS NULL THEN
    INSERT INTO trilha_administrativa
      (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome, depois)
    VALUES
      (p_org, NULL, v_email, 'operador_da_plataforma', 'acesso_suspenso_pelo_fornecedor',
       'organizacao', p_org, v_nome,
       jsonb_build_object('motivo', v_motivo, 'sessoes_revogadas', v_revogadas));
  END IF;

  RETURN v_revogadas;
END;
$$;

COMMENT ON FUNCTION console_suspender_municipio(uuid, text) IS
  'Suspende o acesso de um municipio e revoga todas as sessoes dele. So o dono do console. Devolve quantas sessoes cairam.';

CREATE FUNCTION console_reativar_municipio(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_email   text;
  v_nome    text;
  v_estava  timestamptz;
  v_motivo  text;
  v_agendada timestamptz;
BEGIN
  IF NOT console_operador_e_dono() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'So o dono do console reativa o acesso de um municipio.';
  END IF;

  SELECT email INTO v_email FROM console_operadores WHERE id = console_operador_atual();

  SELECT municipio || '/' || uf, acesso_suspenso_em, suspensao_motivo, eliminacao_agendada_para
    INTO v_nome, v_estava, v_motivo, v_agendada
    FROM organizacoes WHERE id = p_org AND eliminada_em IS NULL;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = format('Nao ha municipio ativo com o id %s.', p_org);
  END IF;

  /*
    Reativar com eliminacao pendente daria acesso a um municipio que vai ser
    apagado em dias, e apagaria dado que alguem acabou de escrever. Cancelar a
    eliminacao e ato separado, e vem antes.
  */
  IF v_agendada IS NOT NULL OR EXISTS (
       SELECT 1 FROM eliminacoes_de_municipio
        WHERE organizacao_id = p_org AND cancelada_em IS NULL AND concluida_em IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('O municipio %s tem eliminacao agendada e nao cancelada.', v_nome),
      DETAIL  = 'Cancele a eliminacao primeiro; reativar o acesso e o ato seguinte.';
  END IF;

  IF v_estava IS NULL THEN
    RETURN; -- nao estava suspenso: nada a fazer, e nada a registrar.
  END IF;

  UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = p_org;

  INSERT INTO trilha_administrativa
    (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome, antes)
  VALUES
    (p_org, NULL, v_email, 'operador_da_plataforma', 'acesso_reativado_pelo_fornecedor',
     'organizacao', p_org, v_nome,
     jsonb_build_object('suspenso_em', v_estava, 'motivo', v_motivo));
END;
$$;

COMMENT ON FUNCTION console_reativar_municipio(uuid) IS
  'Limpa a suspensao de um municipio. Recusa se houver eliminacao agendada e nao cancelada. So o dono do console.';

CREATE FUNCTION console_agendar_eliminacao(p_org uuid, p_motivo text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_motivo     text := trim(p_motivo);
  v_email      text;
  v_municipio  text;
  v_uf         text;
  v_agendada   timestamptz;
  v_executar   timestamptz;
BEGIN
  IF NOT console_operador_e_dono() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'So o dono do console agenda a eliminacao de um municipio.';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Agendar a eliminacao exige motivo.',
      DETAIL  = 'O motivo fica no livro de eliminacoes, que sobrevive ao municipio.';
  END IF;

  SELECT email INTO v_email FROM console_operadores WHERE id = console_operador_atual();

  SELECT municipio, uf, eliminacao_agendada_para INTO v_municipio, v_uf, v_agendada
    FROM organizacoes WHERE id = p_org AND eliminada_em IS NULL;
  IF v_municipio IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = format('Nao ha municipio ativo com o id %s.', p_org);
  END IF;

  IF v_agendada IS NOT NULL OR EXISTS (
       SELECT 1 FROM eliminacoes_de_municipio
        WHERE organizacao_id = p_org AND cancelada_em IS NULL AND concluida_em IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('O municipio %s/%s ja tem eliminacao agendada.', v_municipio, v_uf),
      DETAIL  = 'Para mudar o motivo ou o prazo, cancele e agende de novo.';
  END IF;

  /* Suspende na hora, com a mesma funcao do botao de suspender. */
  PERFORM console_suspender_municipio(p_org, v_motivo);

  v_executar := now() + interval '7 days';

  INSERT INTO eliminacoes_de_municipio
    (organizacao_id, municipio_nome, uf, solicitada_em, executar_em, solicitada_por_email, motivo)
  VALUES
    (p_org, v_municipio, v_uf, now(), v_executar, v_email, v_motivo);

  UPDATE organizacoes SET eliminacao_agendada_para = v_executar WHERE id = p_org;

  /*
    `clock_timestamp()` e nao o padrao `now()`: a linha de suspensao acabou de
    ser gravada nesta mesma transacao, e `now()` e o instante da transacao.
    Com o mesmo carimbo nas duas, a trilha do municipio nao saberia dizer que
    a suspensao veio antes do agendamento, e ela veio.
  */
  INSERT INTO trilha_administrativa
    (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome, depois,
     registrado_em)
  VALUES
    (p_org, NULL, v_email, 'operador_da_plataforma', 'eliminacao_agendada_pelo_fornecedor',
     'organizacao', p_org, v_municipio || '/' || v_uf,
     jsonb_build_object('executar_em', v_executar, 'motivo', v_motivo),
     clock_timestamp());

  RETURN v_executar;
END;
$$;

COMMENT ON FUNCTION console_agendar_eliminacao(uuid, text) IS
  'Suspende o municipio e escreve no livro de eliminacoes com prazo de sete dias. So o dono do console. Devolve quando o relogio vai apagar.';

CREATE FUNCTION console_cancelar_eliminacao(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_email      text;
  v_nome       text;
  v_eliminada  timestamptz;
  v_no_livro   integer;
  v_na_org     integer;
BEGIN
  IF NOT console_operador_e_dono() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'So o dono do console cancela a eliminacao de um municipio.';
  END IF;

  SELECT email INTO v_email FROM console_operadores WHERE id = console_operador_atual();

  SELECT municipio || '/' || uf, eliminada_em INTO v_nome, v_eliminada
    FROM organizacoes WHERE id = p_org;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC364',
      MESSAGE = format('Nao ha municipio com o id %s.', p_org);
  END IF;
  IF v_eliminada IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('Tarde demais: o banco do municipio %s ja foi apagado em %s.', v_nome, v_eliminada),
      DETAIL  = 'O prazo de arrependimento venceu e o relogio ja executou. Nao ha o que cancelar.';
  END IF;

  UPDATE eliminacoes_de_municipio
     SET cancelada_em = now(), cancelada_por_email = v_email
   WHERE organizacao_id = p_org AND cancelada_em IS NULL AND banco_apagado_em IS NULL;
  GET DIAGNOSTICS v_no_livro = ROW_COUNT;

  UPDATE organizacoes SET eliminacao_agendada_para = NULL
   WHERE id = p_org AND eliminacao_agendada_para IS NOT NULL;
  GET DIAGNOSTICS v_na_org = ROW_COUNT;

  IF v_no_livro = 0 AND v_na_org = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = format('Nao ha eliminacao agendada para o municipio %s.', v_nome);
  END IF;

  /*
    NAO reativa o acesso: reativar e ato separado, com botao proprio. Um dono
    que cancelou a eliminacao por engano de municipio nao quer, por tabela,
    reabrir o acesso de quem estava suspenso por outro motivo.
  */
  INSERT INTO trilha_administrativa
    (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome)
  VALUES
    (p_org, NULL, v_email, 'operador_da_plataforma', 'eliminacao_cancelada_pelo_fornecedor',
     'organizacao', p_org, v_nome);
END;
$$;

COMMENT ON FUNCTION console_cancelar_eliminacao(uuid) IS
  'Marca a eliminacao como cancelada e limpa a marca da organizacao. NAO reativa o acesso. So o dono do console.';

-- ---------------------------------------------------------------------
-- 5. O relogio da API: executar o que venceu, e concluir depois da purga.
--
-- Estas duas NAO consultam operador nenhum. So o estado. Rodam como
-- `varrer_prazos` (016) e `municipios_a_resumir` (026): papel de aplicacao,
-- sem token, sem municipio no contexto.
-- ---------------------------------------------------------------------

/*
  A ORDEM DE APAGAMENTO, num lugar so.

  Ela e usada por DUAS funcoes: `executar_eliminacoes_vencidas`, que apaga o
  municipio inteiro, e `concluir_eliminacao`, que varre o que ENTROU na janela
  entre as fases antes de apagar a linha da organizacao (o relogio do resumo,
  por exemplo, escreve `metricas_municipio` a cada 15 minutos, e uma metrica
  escrita ali travaria a conclusao na chave estrangeira para sempre). Duas
  copias da lista e como uma envelhece quando alguem acrescentar tabela.

  Descoberta por ordenacao topologica das chaves estrangeiras no catalogo, com
  filho antes de pai, sem distinguir RESTRICT, CASCADE e SET NULL. IMMUTABLE e
  SECURITY INVOKER: e uma constante, nao um privilegio.
*/
CREATE FUNCTION ordem_de_apagamento_por_municipio()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- camada 0
    'avisos_lidos', 'devolucoes_de_tarefa', 'exportacoes', 'metricas_municipio',
    'notificacoes_enviadas', 'objetos_orfaos', 'ocorrencia_consultas', 'oficio_aberturas',
    'oficio_sequencias', 'protocolo_sequencias', 'recuperacoes_senha', 'saidas_a_campo',
    'segundo_fator_recuperacao', 'sessoes', 'trilha_administrativa', 'trilha_eventos',
    'vistoria_evidencias_perdidas', 'vistoria_orgaos_indicados',
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

CREATE FUNCTION executar_eliminacoes_vencidas()
RETURNS TABLE (organizacao_id uuid, prefixo_do_armazenamento text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  /*
    A ORDEM DE APAGAMENTO, descoberta pelo catalogo (cabecalho, armadilha 2)
    e escrita por extenso. Filho antes de pai, em camadas:

      camada 0: quem ninguem referencia;
      camada 1: avisos (avisos_lidos ja saiu), aparelhos (notificacoes ja
                sairam), evidencias (objetos_orfaos ja saiu), oficio_envios
                (oficio_aberturas ja saiu), segundo_fator (a recuperacao ja
                saiu);
      camada 2: oficios (envios e aberturas ja sairam);
      camada 3: providencias (oficios ja saiu);
      camada 4: orgaos (providencias, oficios e indicacoes ja sairam) e
                vistorias (evidencias, perdidas e indicacoes ja sairam);
      camada 5: ocorrencias (tudo que aponta para ela ja saiu; a
                auto-referencia `vinculada_a` e SET NULL e some no mesmo
                comando);
      camada 6: usuarios (tudo que assina com usuario ja saiu);
      camada 7: equipes.

    A lista e conferida contra o catalogo antes do primeiro DELETE.
  */
  c_ordem CONSTANT text[] := ordem_de_apagamento_por_municipio();
  v_fora_da_ordem text;
  v_livro         record;
  v_tabela        text;
  v_apagadas      bigint;
  v_restantes     bigint;
  v_contagens     jsonb;
  v_marcadas      integer;
BEGIN
  /*
    TUDO QUE RECUSA VEM ANTES DE TUDO QUE APAGA (036). Uma tabela com
    `organizacao_id` que nao tenha lugar na ordem e uma tabela que ficaria com
    as linhas do municipio depois de a organizacao sumir, ou que travaria o
    apagamento no meio por chave estrangeira. Nos dois casos a resposta certa
    e nao comecar.
  */
  SELECT string_agg(c.table_name, ', ' ORDER BY c.table_name) INTO v_fora_da_ordem
    FROM information_schema.columns c
    JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
   WHERE c.table_schema = 'public' AND c.column_name = 'organizacao_id'
     AND k.relkind IN ('r', 'p')
     AND c.table_name <> 'eliminacoes_de_municipio'
     AND c.table_name <> ALL (c_ordem);
  IF v_fora_da_ordem IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC366',
      MESSAGE = format('Ha tabela com organizacao_id sem lugar na ordem de eliminacao: %s.', v_fora_da_ordem),
      DETAIL  = 'Nada foi apagado. Acrescente a tabela a ordem em executar_eliminacoes_vencidas '
                '(migracao nova) antes de eliminar qualquer municipio.';
  END IF;

  v_tabela := 'eliminacoes_de_municipio';
  BEGIN
    /*
      RETOMADA, e ela e idempotente.

      O relogio faz tres fases (apagar o banco, purgar o armazenamento,
      concluir), e entre a primeira e a terceira o processo pode reiniciar:
      deploy, maquina do Fly trocada, ou a OUTRA maquina ter pego a rodada
      anterior. Se esta funcao devolvesse cada municipio uma vez so, uma purga
      interrompida ficaria esquecida: banco apagado, fotografias no
      armazenamento para sempre, que e dado pessoal sem dono.

      Entao quem ja teve o banco apagado e ainda nao teve o armazenamento
      purgado e devolvido de novo, em toda rodada, ate `concluir_eliminacao`
      marcar a purga. Nao ha nada mais a apagar aqui; o livro nao e tocado.

      Este laco vem ANTES do que apaga, de proposito: assim um municipio
      apagado nesta mesma rodada nao aparece duas vezes na saida.
    */
    v_tabela := 'organizacoes';
    FOR v_livro IN
      SELECT o.id AS org
        FROM organizacoes o
       WHERE o.eliminada_em IS NOT NULL
         AND o.armazenamento_purgado_em IS NULL
       ORDER BY o.eliminada_em
    LOOP
      organizacao_id := v_livro.org;
      prefixo_do_armazenamento := 'tenant/' || v_livro.org::text || '/';
      RETURN NEXT;
    END LOOP;
    FOR v_livro IN
      SELECT e.id AS livro_id, e.organizacao_id AS org
        FROM eliminacoes_de_municipio e
        JOIN organizacoes o ON o.id = e.organizacao_id
       WHERE e.executar_em <= now()
         AND e.cancelada_em IS NULL
         AND e.banco_apagado_em IS NULL
         /* A segunda marca: so a funcao privilegiada do console escreve. */
         AND o.eliminacao_agendada_para IS NOT NULL
         AND o.eliminacao_agendada_para <= now()
         AND o.acesso_suspenso_em IS NOT NULL
         AND o.eliminada_em IS NULL
       ORDER BY e.executar_em
         FOR UPDATE OF e SKIP LOCKED
    LOOP
      v_contagens := '{}'::jsonb;

      FOREACH v_tabela IN ARRAY c_ordem LOOP
        /*
          `format('%I')` sobre uma lista CONSTANTE escrita acima: nenhum
          parametro chega a este texto, e o nome e citado como identificador.
          Trinta DELETEs estaticos diriam a mesma coisa em trinta vezes o
          espaco, e a conferencia de "restou zero" ficaria repetida trinta
          vezes tambem.
        */
        EXECUTE format('DELETE FROM %I WHERE organizacao_id = $1', v_tabela) USING v_livro.org;
        GET DIAGNOSTICS v_apagadas = ROW_COUNT;

        EXECUTE format('SELECT count(*) FROM %I WHERE organizacao_id = $1', v_tabela)
           INTO v_restantes USING v_livro.org;
        IF v_restantes > 0 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'DC366',
            MESSAGE = format('A eliminacao do municipio %s parou: restaram %s linha(s) em %s depois do DELETE.',
                             v_livro.org, v_restantes, v_tabela),
            DETAIL  = 'A transacao inteira volta atras: nenhuma linha deste municipio foi apagada. '
                      'Um DELETE que nao alcanca as linhas e sinal de gatilho, regra ou policy '
                      'barrando o dono das tabelas; investigue antes de tentar de novo.';
        END IF;

        v_contagens := v_contagens || jsonb_build_object(v_tabela, v_apagadas);
      END LOOP;

      v_tabela := 'eliminacoes_de_municipio';
      UPDATE eliminacoes_de_municipio
         SET banco_apagado_em = now(), contagens = v_contagens
       WHERE id = v_livro.livro_id;

      v_tabela := 'organizacoes';
      UPDATE organizacoes SET eliminada_em = now() WHERE id = v_livro.org;
      GET DIAGNOSTICS v_marcadas = ROW_COUNT;
      IF v_marcadas <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'DC366',
          MESSAGE = format('A eliminacao do municipio %s apagou as linhas e nao conseguiu marcar a organizacao.', v_livro.org),
          DETAIL  = 'A transacao inteira volta atras.';
      END IF;

      organizacao_id := v_livro.org;
      prefixo_do_armazenamento := 'tenant/' || v_livro.org::text || '/';
      RETURN NEXT;
    END LOOP;

  EXCEPTION WHEN insufficient_privilege THEN
    /*
      Armadilha 1 do cabecalho. Com `row_security = off`, o Postgres levanta
      este erro quando o dono das tabelas NAO e isento de RLS e uma consulta
      seria filtrada por policy. A mensagem crua ("query would be affected by
      row-level security policy") manda procurar no lugar errado, e a
      traducao diz o que houve e onde parou.
    */
    RAISE EXCEPTION USING
      ERRCODE = 'DC366',
      MESSAGE = format('A eliminacao parou na tabela %s: o dono das tabelas foi barrado pela seguranca '
                       'em nivel de linha, porque nao tem BYPASSRLS. Nenhuma linha foi apagada.', v_tabela),
      DETAIL  = 'A transacao inteira volta atras. Esta funcao apaga com os privilegios do dono das '
                'tabelas; sem BYPASSRLS o DELETE alcancaria zero linha em silencio, e por isso ela '
                'prefere estourar. De BYPASSRLS ao papel que e dono das tabelas '
                '(docs/COLOCAR-DE-PE.md) e rode de novo.';
  END;

  RETURN;
END;
$$;

COMMENT ON FUNCTION executar_eliminacoes_vencidas() IS
  'O relogio da API: para cada eliminacao vencida e nao cancelada, com a organizacao marcada, apaga todas as linhas do municipio na ordem das chaves estrangeiras, confere que restou zero, grava as contagens no livro e marca eliminada_em. Devolve o prefixo do armazenamento a purgar. A linha de organizacoes fica ate concluir_eliminacao.';

CREATE FUNCTION concluir_eliminacao(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_eliminada timestamptz;
  v_apagadas  integer;
  v_tabela    text := 'organizacoes';
  v_sobras    jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    SELECT eliminada_em INTO v_eliminada FROM organizacoes WHERE id = p_org;
    IF v_eliminada IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC365',
        MESSAGE = format('O municipio %s nao esta com o banco apagado (eliminada_em nulo, ou nao encontrado): nada a concluir.', p_org),
        DETAIL  = 'concluir_eliminacao so age depois de executar_eliminacoes_vencidas ter apagado as linhas.';
    END IF;

    /*
      AS SOBRAS DA JANELA ENTRE AS FASES.

      Entre "banco apagado" e agora passaram minutos, e nesse tempo a
      organizacao ainda existia: o relogio do resumo escreve
      `metricas_municipio` a cada 15 minutos para toda organizacao viva, e uma
      metrica que entrasse aqui faria o DELETE de `organizacoes` bater na
      chave estrangeira (ON DELETE RESTRICT) em toda rodada, para sempre, com
      o municipio eliminado e nunca concluido. `municipios_a_resumir` deixou
      de devolver quem tem `eliminada_em` (primeira defesa); esta varredura e
      a segunda, para o dia em que outra rotina fizer o mesmo.

      O que sobrou e contado no livro, chave `sobras_na_conclusao`, porque
      linha que apareceu depois do apagamento e informacao: diz qual rotina
      ainda escreve para municipio eliminado.
    */
    FOREACH v_tabela IN ARRAY ordem_de_apagamento_por_municipio() LOOP
      EXECUTE format('DELETE FROM %I WHERE organizacao_id = $1', v_tabela) USING p_org;
      GET DIAGNOSTICS v_apagadas = ROW_COUNT;
      IF v_apagadas > 0 THEN
        v_sobras := v_sobras || jsonb_build_object(v_tabela, v_apagadas);
      END IF;
    END LOOP;

    v_tabela := 'organizacoes';
    UPDATE organizacoes SET armazenamento_purgado_em = now() WHERE id = p_org;

    v_tabela := 'eliminacoes_de_municipio';
    UPDATE eliminacoes_de_municipio
       SET armazenamento_purgado_em = now(), concluida_em = now(),
           contagens = CASE WHEN v_sobras = '{}'::jsonb THEN contagens
                            ELSE contagens || jsonb_build_object('sobras_na_conclusao', v_sobras) END
     WHERE organizacao_id = p_org AND banco_apagado_em IS NOT NULL AND concluida_em IS NULL;

    v_tabela := 'organizacoes';
    DELETE FROM organizacoes WHERE id = p_org;
    GET DIAGNOSTICS v_apagadas = ROW_COUNT;
    IF v_apagadas <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'DC366',
        MESSAGE = format('A conclusao da eliminacao do municipio %s nao conseguiu apagar a linha de organizacoes.', p_org),
        DETAIL  = 'A transacao inteira volta atras.';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC366',
      MESSAGE = format('A conclusao parou na tabela %s: o dono das tabelas foi barrado pela seguranca '
                       'em nivel de linha, porque nao tem BYPASSRLS. Nada foi alterado.', v_tabela),
      DETAIL  = 'Ver executar_eliminacoes_vencidas: mesma causa, mesma saida.';
  END;
END;
$$;

COMMENT ON FUNCTION concluir_eliminacao(uuid) IS
  'A ultima fase, chamada pela API depois de purgar o armazenamento: marca armazenamento_purgado_em na organizacao e no livro, apaga a linha de organizacoes e marca concluida_em. So age se eliminada_em estiver preenchido.';

/*
  A rota /saude da API diz se o relogio tem trabalho ("ha eliminacao agendada?
  quantas? quantas vencidas?"), e o papel de aplicacao nao enxerga uma linha
  de `organizacoes` sem municipio no contexto. Contar exige uma funcao
  privilegiada, e ela devolve SO dois numeros: nenhum nome, nenhum id. Conta
  a marca da organizacao (a segunda chave do relogio), que fica ate
  `concluir_eliminacao` apagar a linha; entao "vencida" inclui o municipio
  com o banco ja apagado e o armazenamento ainda por purgar, que e trabalho
  pendente de verdade.
*/
CREATE FUNCTION eliminacoes_pendentes()
RETURNS TABLE (agendadas bigint, vencidas bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT count(*) FILTER (WHERE eliminacao_agendada_para IS NOT NULL),
         count(*) FILTER (WHERE eliminacao_agendada_para IS NOT NULL
                            AND eliminacao_agendada_para <= now())
    FROM organizacoes;
$$;

COMMENT ON FUNCTION eliminacoes_pendentes() IS
  'Quantas eliminacoes estao agendadas e quantas ja venceram, para a rota de saude da API. So numeros.';

-- ---------------------------------------------------------------------
-- 6. Municipio suspenso nao abre sessao nova.
--
-- Revogar as sessoes derruba quem esta dentro; sem esta recusa, a pessoa
-- derrubada entraria de novo com a senha de sempre, e o botao "desativar o
-- acesso" seria so um "faca login de novo". A regra mora no banco, na mesma
-- funcao que abre a sessao, e nao numa condicao na rota. Mesma assinatura da
-- 002: quem chama nao muda.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abrir_sessao(
  p_organizacao_id uuid,
  p_usuario_id uuid,
  p_token_hash text,
  p_duracao interval,
  p_user_agent text,
  p_ip text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_suspenso timestamptz;
BEGIN
  SELECT acesso_suspenso_em INTO v_suspenso FROM organizacoes WHERE id = p_organizacao_id;
  IF v_suspenso IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC367',
      MESSAGE = 'O acesso deste municipio esta suspenso pelo fornecedor.',
      DETAIL  = format('Suspenso desde %s. Nenhuma sessao nova abre ate a reativacao.', v_suspenso);
  END IF;

  INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, user_agent, ip)
  VALUES (p_organizacao_id, p_usuario_id, p_token_hash, now() + p_duracao,
          left(coalesce(p_user_agent, ''), 400), nullif(p_ip, '')::inet)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Quem alcanca o que.
--
-- `REVOKE ... FROM PUBLIC` primeiro, em toda funcao: o padrao do Postgres e
-- EXECUTE para PUBLIC, e PUBLIC alcanca o papel de aplicacao de qualquer
-- municipio, que nao pode suspender ninguem, e o papel do console, que nao
-- pode apagar ninguem.
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION console_operador_atual() FROM PUBLIC;
REVOKE ALL ON FUNCTION console_operador_e_dono() FROM PUBLIC;
REVOKE ALL ON FUNCTION console_sem_operadores() FROM PUBLIC;
REVOKE ALL ON FUNCTION eliminacoes_pendentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION console_suspender_municipio(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_reativar_municipio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_agendar_eliminacao(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_cancelar_eliminacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION executar_eliminacoes_vencidas() FROM PUBLIC;
REVOKE ALL ON FUNCTION concluir_eliminacao(uuid) FROM PUBLIC;

/*
  O console: a tabela dele, o livro (leitura, agendamento e SO as duas colunas
  de cancelamento), as duas funcoes de contexto e os quatro atos. Nenhum outro
  papel ve `console_operadores`: a excecao esta narrada no portao universal de
  `isolamento.test.ts`, como a de `metricas_municipio`.
*/
GRANT SELECT, INSERT, UPDATE ON console_operadores TO dc360_console;
GRANT SELECT, INSERT ON eliminacoes_de_municipio TO dc360_console;
GRANT UPDATE (cancelada_em, cancelada_por_email) ON eliminacoes_de_municipio TO dc360_console;
GRANT EXECUTE ON FUNCTION console_operador_atual() TO dc360_console;
GRANT EXECUTE ON FUNCTION console_operador_e_dono() TO dc360_console;
GRANT EXECUTE ON FUNCTION console_sem_operadores() TO dc360_console;
GRANT EXECUTE ON FUNCTION console_suspender_municipio(uuid, text) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_reativar_municipio(uuid) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_agendar_eliminacao(uuid, text) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_cancelar_eliminacao(uuid) TO dc360_console;

/*
  O relogio da API: as duas funcoes, e NENHUM privilegio direto nas duas
  tabelas. `dc360_app` continua sem DELETE em tabela nenhuma alem de `avisos`
  (018): o que ele ganha e o direito de executar um ato fechado, que so age no
  que esta vencido, nao cancelado e marcado na organizacao.
*/
GRANT EXECUTE ON FUNCTION executar_eliminacoes_vencidas() TO dc360_app;
GRANT EXECUTE ON FUNCTION concluir_eliminacao(uuid) TO dc360_app;
GRANT EXECUTE ON FUNCTION eliminacoes_pendentes() TO dc360_app;

-- ---------------------------------------------------------------------
-- O relogio do resumo nao enxerga municipio eliminado
-- ---------------------------------------------------------------------
--
-- `municipios_a_resumir` (026) devolvia toda organizacao com metrica velha.
-- Entre "banco apagado" e "concluido" a organizacao ainda existe, e o resumo
-- escreveria para ela: o numero que sairia e "zero de tudo", que no console e
-- indistinguivel de "municipio calado", e a linha nova em `metricas_municipio`
-- travaria a conclusao na chave estrangeira. Mesma assinatura, um filtro a
-- mais. E a primeira defesa da corrida; a segunda esta em `concluir_eliminacao`.
CREATE OR REPLACE FUNCTION municipios_a_resumir(p_frescor interval)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT o.id
    FROM organizacoes o
    LEFT JOIN metricas_municipio m
           ON m.organizacao_id = o.id
          AND m.dia = current_date
   WHERE o.eliminada_em IS NULL
     AND (m.atualizado_em IS NULL
      OR m.atualizado_em < now() - p_frescor)
   ORDER BY o.id
$$;
