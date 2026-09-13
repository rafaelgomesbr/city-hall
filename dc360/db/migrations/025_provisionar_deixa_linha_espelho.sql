-- =====================================================================
-- 025: o município passa a poder ler, na trilha dele, o próprio nascimento.
--
-- O PROBLEMA
--
-- Provisionar é o único ato deste produto praticado por quem não é do
-- município: um operador da plataforma, com a credencial de dono do banco, a
-- mesma que aplica migração. Até aqui esse ato deixava rastro em um lugar só,
-- o log do servidor, que é exatamente o lugar que o município não pode ler.
--
-- Do lado de dentro, a organização simplesmente aparecia. Nenhuma resposta
-- para "quem criou isto, quando, e a mando de quem", que é a primeira
-- pergunta de uma auditoria e a primeira pergunta de um município que
-- desconfia. Pior: como a trilha administrativa é append-only e começa vazia,
-- o primeiro evento da história de um município era sempre um ato de alguém
-- de dentro, dando a impressão de que a organização sempre existiu.
--
-- POR QUE UMA LINHA E NÃO UMA TABELA NOVA
--
-- `trilha_administrativa` (migração 010) já foi desenhada para atos que não
-- têm ocorrência, e já previa `alvo_tipo = 'organizacao'`. Falta uma coisa
-- só: o autor do ato não é usuário de município nenhum, e a restrição de
-- `autor_papel` só admite os quatro papéis do produto.
--
-- O QUE ESTA MIGRAÇÃO FAZ, E O QUE ELA NÃO FAZ
--
-- Ela admite `operador_da_plataforma` em `trilha_administrativa.autor_papel`,
-- e mais nada.
--
-- `operador_da_plataforma` NÃO é um papel do produto. Ele não existe em
-- `usuarios.papel`, não aparece em `PAPEIS` no pacote compartilhado, não
-- concede permissão nenhuma e não pode ser atribuído a conta de ninguém: a
-- restrição de `usuarios.papel` continua exatamente como estava, de propósito,
-- e é o que impede este valor de virar uma quinta patente por acidente. Ele é
-- vocabulário de REGISTRO, para a trilha conseguir nomear com honestidade um
-- ator que existe e que não é do município.
--
-- Escrever `administrador` no lugar dele, com o nome do operador em
-- `autor_nome`, teria sido mais barato e seria mentira: diria que a conta
-- administradora recém-criada criou a si mesma, e diria isso justamente na
-- linha que existe para ser confiável.
--
-- A ESCRITA CONTINUA PASSANDO PELA PAREDE
--
-- Nenhuma policy nova, nenhum privilégio novo. Quem provisiona tem a
-- credencial de dono, e com `FORCE ROW LEVEL SECURITY` o dono também é barrado
-- por ausência de policy. Por isso o provisionamento assume o papel de
-- aplicação e declara `app.organizacao_atual` para gravar esta linha, como
-- qualquer tela do produto faria. É deliberado: um erro de `organizacao_id`
-- não coloca o nascimento de um município dentro da trilha de outro, porque a
-- policy de inserção recusa antes.
-- =====================================================================

ALTER TABLE trilha_administrativa
  DROP CONSTRAINT trilha_administrativa_autor_papel_check;

ALTER TABLE trilha_administrativa
  ADD CONSTRAINT trilha_administrativa_autor_papel_check
  CHECK (autor_papel IN (
    'coordenador',
    'operador',
    'agente_campo',
    'administrador',
    -- Não é papel do produto. Ver o cabeçalho: existe para a trilha poder
    -- nomear quem provisionou o município, que não é usuário de município
    -- nenhum.
    'operador_da_plataforma'
  ));

COMMENT ON COLUMN trilha_administrativa.autor_papel IS
  'Papel de quem praticou o ato. Os quatro primeiros valores são papéis do produto; operador_da_plataforma não é papel de conta nenhuma e existe só para nomear quem provisionou o município.';

-- ---------------------------------------------------------------------
-- O direito de ASSUMIR o papel de aplicação, para quem provisiona
-- ---------------------------------------------------------------------
--
-- Isto foi achado contra o banco de produção, e sem ele a linha espelho
-- funcionaria em teste e quebraria na primeira prefeitura de verdade.
--
-- Do Postgres 16 em diante, ser MEMBRO de um papel e poder ASSUMI-LO são duas
-- coisas separadas. Em produção (Supabase, Postgres 17.6) o papel que aplica
-- migração e provisiona é `postgres`, e o catálogo respondia:
--
--   pg_has_role('postgres','dc360_app','MEMBER') = true
--   pg_has_role('postgres','dc360_app','USAGE')  = false
--
-- Ou seja: membro sim, `SET ROLE dc360_app` não. E o `dc360_api` podia, porque
-- a receita de implantação já mandava conceder com `WITH SET TRUE` para ele.
--
-- Por que o teste não pegaria: em PGlite quem roda é superusuário, e
-- superusuário assume qualquer papel. O caminho exercitado no teste existia só
-- no teste, que é a forma mais cara de defeito deste produto.
--
-- A concessão é para o DONO DAS TABELAS, perguntado ao catálogo, e não para
-- `CURRENT_USER`.
--
-- Parece a mesma coisa e não é: quem aplica a migração nem sempre é quem
-- provisiona. Uma ferramenta de painel, um roteiro de integração contínua ou
-- um papel administrativo emprestado aplicam o esquema e vão embora, e a
-- concessão teria ido para eles, deixando quem provisiona de fora. O dono das
-- tabelas é estável: é ele que existe desde a primeira migração e é com ele
-- que se provisiona.
--
-- Ela não amplia poder nenhum, porque o dono já tem BYPASSRLS: ele podia gravar
-- em qualquer município antes desta linha, e continua podendo. O que ela
-- permite é o contrário, ele se REBAIXAR ao papel de aplicação para gravar a
-- linha espelho sob a mesma parede que vale para o produto inteiro.
DO $$
DECLARE
  dono text;
BEGIN
  SELECT tableowner INTO dono FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'trilha_administrativa';

  IF dono IS NULL THEN
    RAISE EXCEPTION 'trilha_administrativa nao existe: a migracao 010 nao rodou';
  END IF;

  -- `WITH SET TRUE` e' o que separa ser MEMBRO de poder ASSUMIR, do Postgres 16
  -- em diante. Sem ele a concessao existe e o `SET ROLE` continua recusado, que
  -- foi exatamente o estado encontrado na producao.
  EXECUTE format('GRANT dc360_app TO %I WITH SET TRUE', dono);
END $$;
