-- =====================================================================
-- 045: a varredura de prazo estoura em vez de calar quando o dono nao tem
--      BYPASSRLS, e a foto de perfil passa a contar no teto de armazenamento.
--
-- Duas correcoes de revisao (15/09/2026), sem tabela nova, sem funcao
-- privilegiada nova e sem policy nova.
--
-- =====================================================================
-- 1. `varrer_prazos` (016) ganha `SET row_security = off`
--
-- O QUE A 037 CONSERTOU, E O QUE ELA DEIXOU ABERTO. A 037 escreveu a policy
-- de DELETE que faltava em `notificacoes_enviadas`, amarrada em
-- `organizacao_id = app_organizacao_atual()` mais o piso de trinta dias. So
-- que `varrer_prazos` roda SEM municipio no contexto (e o relogio, nao uma
-- requisicao), entao `app_organizacao_atual()` devolve NULL dentro dela e a
-- policy nao casa linha nenhuma. O INSERT de `prazo_vencendo` da mesma funcao
-- le `ocorrencias`, `usuarios` e `aparelhos`, todas com RLS forcada e policy
-- amarrada ao contexto: sem contexto, o SELECT devolve zero e o INSERT insere
-- zero. Nenhum dos dois estoura.
--
-- Em producao isso nao aparece porque o dono das tabelas e `postgres`, que tem
-- BYPASSRLS, e uma funcao SECURITY DEFINER roda como o dono. A 037 disse isso
-- por extenso, e disse tambem que e atributo do PAPEL, nao do produto: uma
-- instalacao com dono sem BYPASSRLS teria expurgo apagando zero e aviso de
-- prazo saindo para ninguem, os dois em silencio, sem uma linha de log.
--
-- O QUE `SET row_security = off` FAZ, E O QUE ELE NAO FAZ. Com a opcao
-- desligada, o Postgres LEVANTA ERRO ("query would be affected by row-level
-- security policy for table ...", SQLSTATE 42501) em vez de aplicar a policy
-- em silencio, e so quando quem executa NAO e isento de RLS. Para o dono com
-- BYPASSRLS nada muda. Ou seja: esta migracao nao faz a funcao funcionar num
-- dono sem BYPASSRLS. Ela faz a instalacao errada FALHAR ALTO, na primeira
-- rodada do relogio, com o nome da tabela no log da API
-- (`apps/api/src/push/varredor.ts` registra a mensagem do erro). E o mesmo
-- desenho das 038, 039, 042 e 043, e o que o produto exige do dono continua
-- escrito em `docs/COLOCAR-DE-PE.md`: BYPASSRLS no papel de setup.
--
-- Fazer a funcao ESCREVER com dono sem BYPASSRLS exigiria policy que abrisse
-- `ocorrencias`, `usuarios`, `aparelhos` e `notificacoes_enviadas` sem
-- contexto de municipio, que e reimplementar BYPASSRLS por policy contra a
-- regra numero um do produto. Nao entra.
--
-- `ALTER FUNCTION` e nao `CREATE OR REPLACE`, de proposito: a opcao compoe com
-- qualquer migracao que reescreva o corpo da funcao, e nao disputa com ela.
-- Quem reescrever `varrer_prazos` um dia precisa repetir o SET, porque
-- `CREATE OR REPLACE` troca a configuracao inteira; o teste
-- `db/test/varredura-de-prazo-sem-bypassrls.test.ts` cobra a opcao no catalogo
-- e reprova a reescrita que a esquecer.
--
-- =====================================================================
-- 2. `usuarios.foto_bytes`, e a foto na soma do teto
--
-- A 040 guardou a CHAVE da foto de perfil e nada mais. Dois efeitos que a
-- revisao apontou:
--
--   * `situacao_de_armazenamento` (035) soma so `evidencias.tamanho_bytes`.
--     A foto de perfil ocupa o mesmo balde do municipio e nao contava, e a
--     rota `POST /usuarios/eu/foto/autorizar-envio` autorizava sem perguntar
--     ao teto. Uma equipe inteira trocando de foto num municipio no limite
--     passaria por cima do teto sem aviso nenhum.
--   * a varredura de objeto orfao (`apps/api/src/armazenamento/orfaos.ts`)
--     so conhecia `evidencias`: passados trinta dias, toda foto de perfil
--     virava candidata `objeto_sem_linha`, e um descarte autorizado por essa
--     lista apagaria o rosto de todo agente do municipio. A correcao dessa
--     metade e na aplicacao; a coluna daqui e o que a metade do teto precisa.
--
-- `foto_bytes` e o tamanho do objeto no armazenamento, escrito pela rota na
-- confirmacao (`PUT /usuarios/eu/foto`), lido do proprio armazenamento
-- (`descrever`), nunca do que o cliente declarou. Nulo com chave e a foto
-- confirmada ANTES desta migracao: o banco nao tem como saber o tamanho dela,
-- e inventar seria contar errado. Ela conta zero ate a pessoa trocar de foto,
-- e isso esta escrito em `docs/ARMAZENAMENTO.md`. Bytes sem chave e proibido
-- pela restricao: nao existe "tamanho de foto que nao existe".
--
-- A soma entra na MESMA funcao do teto, pela mesma razao da 035: uma decisao
-- so, para a rota e para o gatilho. E o gatilho `foto_cabe_no_teto` e a
-- segunda barreira, como `evidencia_cabe_no_teto`: qualquer caminho que escreva
-- `foto_bytes` amanha nasce debaixo do mesmo teto. O que ele conta como novo e
-- a DIFERENCA para o valor anterior, porque trocar a foto apaga a anterior do
-- balde (ver o cabecalho de `apps/api/src/rotas/usuarios-eu.ts`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A varredura de prazo estoura em vez de calar
-- ---------------------------------------------------------------------

ALTER FUNCTION varrer_prazos(interval, interval, integer, integer, interval)
  SET row_security = off;

COMMENT ON FUNCTION varrer_prazos(interval, interval, integer, integer, interval) IS
  'A varredura de aviso de prazo (016) com o expurgo por retencao (037). Roda '
  'sem municipio no contexto, como dono das tabelas e com row_security '
  'desligado (045): num dono sem BYPASSRLS ela estoura nomeando a tabela, em '
  'vez de expurgar zero e avisar ninguem em silencio.';

-- ---------------------------------------------------------------------
-- 2. A foto de perfil conta no teto
-- ---------------------------------------------------------------------

ALTER TABLE usuarios ADD COLUMN foto_bytes bigint;

ALTER TABLE usuarios
  ADD CONSTRAINT foto_bytes_so_com_foto CHECK (
    foto_bytes IS NULL
    OR (foto_chave IS NOT NULL AND foto_bytes >= 0)
  );

COMMENT ON COLUMN usuarios.foto_bytes IS
  'Tamanho da foto de perfil no armazenamento, lido do proprio armazenamento '
  'na confirmacao. Conta no teto do municipio (situacao_de_armazenamento). '
  'Nulo com chave e foto confirmada antes da migracao 045: conta zero ate a '
  'pessoa trocar de foto.';

/*
  A conta, com a foto dentro.

  Mesma forma, mesma decisao, mesmas situacoes da 035. O que muda e UMA
  parcela na soma: as fotos de perfil vivas do municipio. SECURITY INVOKER
  continua: a soma enxerga so as linhas de `usuarios` do municipio do contexto,
  por RLS, entao nao ha como somar o rosto do vizinho.

  O corpo inteiro e copiado, e nao emendado, pela mesma razao da 029: uma
  funcao se le sozinha, no arquivo em que esta.
*/
CREATE OR REPLACE FUNCTION situacao_de_armazenamento(bytes_novos bigint DEFAULT 0)
RETURNS TABLE (
  bytes_usados bigint,
  teto_bytes   bigint,
  margem_bytes bigint,
  situacao     text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH conta AS (
    SELECT
      (SELECT coalesce(sum(e.tamanho_bytes), 0)::bigint
         FROM evidencias e
        WHERE e.abandonada_em IS NULL)
      + (SELECT coalesce(sum(u.foto_bytes), 0)::bigint
           FROM usuarios u
          WHERE u.foto_chave IS NOT NULL)
      + greatest(coalesce(bytes_novos, 0), 0) AS usados,
      (SELECT o.teto_armazenamento_bytes
         FROM organizacoes o
        WHERE o.id = app_organizacao_atual()) AS teto
  )
  SELECT
    conta.usados,
    conta.teto,
    (conta.teto * 3) / 2,
    CASE
      WHEN conta.teto IS NULL              THEN 'sem_teto'
      WHEN conta.usados > (conta.teto * 3) / 2 THEN 'recusado'
      WHEN conta.usados > conta.teto       THEN 'acima_do_teto'
      WHEN conta.usados * 10 >= conta.teto * 8 THEN 'aviso'
      ELSE 'normal'
    END
  FROM conta;
$$;

-- `CREATE OR REPLACE` preserva a ACL; as duas linhas ficam para a regra estar
-- escrita onde a funcao esta, como na 035.
REVOKE ALL ON FUNCTION situacao_de_armazenamento(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION situacao_de_armazenamento(bigint) TO dc360_app;

COMMENT ON FUNCTION situacao_de_armazenamento(bigint) IS
  'Quanto este municipio ocupa (evidencias vivas mais fotos de perfil vivas), '
  'qual o teto do contrato e o que fazer a respeito. SECURITY INVOKER: soma '
  'debaixo do RLS de quem chama.';

/*
  O gatilho, segunda barreira da foto.

  Dispara so quando `foto_bytes` muda para um valor nao nulo, e o que ele
  apresenta como "novo" e a diferenca para o valor anterior: a foto que esta
  sendo trocada sai do balde, entao trocar uma foto de 90 KB por uma de 100 KB
  custa 10 KB, e nao 100. Mesmo codigo de erro da 035 (`disk_full`), pela
  mesma razao: o erro diz a verdade para qualquer ferramenta que o leia.
*/
CREATE OR REPLACE FUNCTION foto_cabe_no_teto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  s text;
BEGIN
  SELECT situacao INTO s
    FROM situacao_de_armazenamento(
      greatest(NEW.foto_bytes - coalesce(OLD.foto_bytes, 0), 0)
    );

  IF s = 'recusado' THEN
    RAISE EXCEPTION
      'armazenamento do municipio acima do teto contratado e da margem'
      USING ERRCODE = '53100';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foto_dentro_do_teto ON usuarios;
CREATE TRIGGER foto_dentro_do_teto
  BEFORE UPDATE OF foto_bytes ON usuarios
  FOR EACH ROW
  WHEN (NEW.foto_bytes IS NOT NULL AND NEW.foto_bytes IS DISTINCT FROM OLD.foto_bytes)
  EXECUTE FUNCTION foto_cabe_no_teto();
