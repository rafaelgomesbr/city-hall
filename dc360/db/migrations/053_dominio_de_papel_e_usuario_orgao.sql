-- =====================================================================
-- 053: dominio de papel no banco e o papel `usuario_orgao` (V2-F03-E04).
--
-- O DEFEITO. O papel de uma conta era escrito em QUATRO CHECKs soltos, cada um
-- com a sua copia da lista: `usuarios.papel` (001), `trilha_eventos.autor_papel`
-- (001), `trilha_administrativa.autor_papel` (010, refeito na 025 com
-- `operador_da_plataforma`) e `ocorrencia_consultas.usuario_papel` (021). Papel
-- novo exigia achar e refazer quatro CHECKs, e nada garantia que as quatro
-- listas continuassem iguais. Pior: duas dessas tabelas sao APPEND-ONLY. Se o
-- portal gravar um ato na trilha com um papel que o CHECK nao conhece, o INSERT
-- falha, e linha de trilha que nao entra nao se corrige depois (correcao entra
-- como evento novo, e ele tambem falharia).
--
-- A CORRECAO, em quatro pecas:
--
--   1. TRES DOMINIOS, um lugar para cada lista:
--        papel_de_conta                 os quatro papeis de servidor mais
--                                       `usuario_orgao`;
--        papel_de_autor_administrativo  os mesmos cinco mais
--                                       `operador_da_plataforma` (quem
--                                       provisiona o municipio nao e conta de
--                                       municipio nenhum; so a trilha
--                                       administrativa o nomeia);
--        tipo_de_ator                   `servidor`, `usuario_orgao`, `sistema`.
--                                       Nenhuma coluna o usa AINDA: a E06
--                                       (contexto do ator) e quem o usa, e ele
--                                       nasce aqui para que o banco e o shared
--                                       falem a mesma lingua desde ja.
--      Papel novo no futuro e `ALTER DOMAIN ... DROP CONSTRAINT / ADD
--      CONSTRAINT` em UM lugar, e o teste `papeis-batem-com-o-banco` cobra que
--      o shared (`PAPEIS`) e o banco continuem iguais.
--
--   2. AS QUATRO COLUNAS passam a ter o dominio e perdem o CHECK solto:
--        usuarios.papel                       papel_de_conta
--        trilha_eventos.autor_papel           papel_de_conta
--        ocorrencia_consultas.usuario_papel   papel_de_conta
--        trilha_administrativa.autor_papel    papel_de_autor_administrativo
--      Os CHECKs antigos caem pelo nome. As colunas continuam NOT NULL, e os
--      privilegios por coluna (GRANT UPDATE (papel, ...) em `usuarios`)
--      continuam como estavam: trocar o tipo nao mexe em ACL de coluna.
--
--   3. `trilha_eventos.origem` ganha `portal`. A coluna continua `text` com
--      CHECK (e nao vira dominio): nao e papel, e a lista tem outro dono (o
--      lugar de onde o ato partiu). O portal do orgao externo (F11) grava aqui.
--
--   4. O GATILHO `usuarios_papel_nao_se_converte`: nenhum UPDATE de
--      `usuarios.papel` troca `usuario_orgao` por papel de servidor, nem o
--      contrario (ADR 0009, decisao 5). A API ja responde 409
--      `papel_nao_se_converte` antes de chegar aqui; o gatilho e a trava de
--      baixo, que vale para quem escrever SQL por fora da API (migracao,
--      console, teste, mao de alguem). A conta `usuario_orgao` nasce SO por
--      convite (E10) e nunca vira servidor: servidor e conta de quem trabalha
--      para o municipio, `usuario_orgao` e de quem representa outro orgao, e
--      misturar as duas e como o recorte de leitura dessa conta
--      (E14, lista positiva) deixaria de ser positivo.
--      E um gatilho SECURITY INVOKER e nao e funcao privilegiada: nao entra no
--      catalogo do portao. Nao ha INSERT guardado aqui: nascer como
--      `usuario_orgao` e legitimo (e o caminho do convite), e quem decide QUEM
--      pode nascer assim e a E10.
--
-- O QUE NAO MUDA. `usuario_orgao` nao ganha permissao nenhuma (E04 e F04-E08),
-- nao loga (a API responde credenciais invalidas ate o G03) e nenhuma policy,
-- grant ou funcao SECURITY DEFINER e criada ou alterada. O isolamento entre
-- municipios segue exatamente como estava.
--
-- ATENCAO, REESCRITA DE TABELA. Trocar `text` por um dominio COM restricao
-- obriga o PostgreSQL a reescrever a tabela e a conferir cada linha contra o
-- dominio, sob ACCESS EXCLUSIVE. A reescrita NAO dispara gatilho de linha, nao
-- reabre privilegio e nao conta como UPDATE: as tabelas append-only
-- (`trilha_eventos`, `trilha_administrativa`, `ocorrencia_consultas`) seguem sem
-- policy de UPDATE e DELETE. As quatro tabelas sao pequenas hoje (milhares de
-- linhas na maior). Em municipio grande, rodar fora do horario do plantao.
-- DADOS EXISTENTES: toda linha tem um dos quatro papeis antigos (era o CHECK),
-- que o dominio aceita; nenhuma precisa de limpeza antes.
--
-- Volta: `desfazer/053_dominio_de_papel_e_usuario_orgao.sql`. Ela RECUSA com
-- mensagem clara se ja existir linha `usuario_orgao` ou origem `portal`, em vez
-- de apagar ou reescrever historico.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Os dominios
-- ---------------------------------------------------------------------

CREATE DOMAIN papel_de_conta AS text
  CONSTRAINT papel_de_conta_valido CHECK (
    VALUE IN ('coordenador', 'operador', 'agente_campo', 'administrador', 'usuario_orgao')
  );

COMMENT ON DOMAIN papel_de_conta IS
  'Papel de uma CONTA no municipio. Os quatro primeiros sao de servidor; usuario_orgao e o papel generico de quem representa outro orgao (nasce so por convite, sem permissao de servidor, nunca se converte). Espelhado em PAPEIS (packages/shared/src/dominio.ts); o teste papeis-batem-com-o-banco confere.';

CREATE DOMAIN papel_de_autor_administrativo AS text
  CONSTRAINT papel_de_autor_administrativo_valido CHECK (
    VALUE IN (
      'coordenador', 'operador', 'agente_campo', 'administrador', 'usuario_orgao',
      -- Nao e papel de conta: nomeia quem provisionou o municipio (025).
      'operador_da_plataforma'
    )
  );

COMMENT ON DOMAIN papel_de_autor_administrativo IS
  'Quem praticou um ato administrativo: qualquer papel de conta, mais operador_da_plataforma (quem provisiona o municipio, que nao e conta de municipio nenhum).';

CREATE DOMAIN tipo_de_ator AS text
  CONSTRAINT tipo_de_ator_valido CHECK (VALUE IN ('servidor', 'usuario_orgao', 'sistema'));

COMMENT ON DOMAIN tipo_de_ator IS
  'Que tipo de ator pratica um ato: servidor (conta de servidor do municipio), usuario_orgao (conta de orgao externo) ou sistema (relogio e trabalhadores). Nenhuma coluna o usa ainda: a E06 (contexto do ator) o liga.';

-- ---------------------------------------------------------------------
-- 2. As quatro colunas: o CHECK solto cai, o dominio entra
-- ---------------------------------------------------------------------

ALTER TABLE usuarios
  DROP CONSTRAINT usuarios_papel_check;
ALTER TABLE usuarios
  ALTER COLUMN papel TYPE papel_de_conta;

ALTER TABLE trilha_eventos
  DROP CONSTRAINT trilha_eventos_autor_papel_check;
ALTER TABLE trilha_eventos
  ALTER COLUMN autor_papel TYPE papel_de_conta;

ALTER TABLE ocorrencia_consultas
  DROP CONSTRAINT ocorrencia_consultas_usuario_papel_check;
ALTER TABLE ocorrencia_consultas
  ALTER COLUMN usuario_papel TYPE papel_de_conta;

ALTER TABLE trilha_administrativa
  DROP CONSTRAINT trilha_administrativa_autor_papel_check;
ALTER TABLE trilha_administrativa
  ALTER COLUMN autor_papel TYPE papel_de_autor_administrativo;

COMMENT ON COLUMN trilha_administrativa.autor_papel IS
  'Papel de quem praticou o ato (dominio papel_de_autor_administrativo). Os cinco primeiros valores sao papeis de conta; operador_da_plataforma nao e papel de conta nenhuma e existe so para nomear quem provisionou o municipio.';

-- ---------------------------------------------------------------------
-- 3. A origem `portal` na trilha de eventos
-- ---------------------------------------------------------------------

ALTER TABLE trilha_eventos
  DROP CONSTRAINT trilha_eventos_origem_check;
ALTER TABLE trilha_eventos
  ADD CONSTRAINT trilha_eventos_origem_check
  CHECK (origem IN ('campo', 'escritorio', 'portal'));

-- ---------------------------------------------------------------------
-- 4. O gatilho: usuario_orgao e papel de servidor nao se convertem
-- ---------------------------------------------------------------------

CREATE FUNCTION usuarios_papel_nao_se_converte() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.papel = 'usuario_orgao') IS DISTINCT FROM (NEW.papel = 'usuario_orgao') THEN
    RAISE EXCEPTION 'papel_nao_se_converte: conta de usuario_orgao e conta de servidor nao se convertem'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'papel_nao_se_converte',
            TABLE = 'usuarios',
            COLUMN = 'papel';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION usuarios_papel_nao_se_converte() IS
  'Recusa todo UPDATE de usuarios.papel que troque usuario_orgao por papel de servidor ou o contrario (ADR 0009, decisao 5). A API responde 409 papel_nao_se_converte antes; este gatilho vale para quem escrever SQL por fora dela.';

CREATE TRIGGER usuarios_papel_nao_se_converte
  BEFORE UPDATE OF papel ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION usuarios_papel_nao_se_converte();
