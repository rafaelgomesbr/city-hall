// Demonstracao (correcao 2 da ADR 0010, novo 1): a policy de UPDATE vale para
// SELECT ... FOR SHARE, e uma funcao SECURITY DEFINER estreita toma a guarda
// sem abrir o UPDATE. Roda em PGlite (Postgres 16 em processo), um banco
// descartavel em memoria. Nao faz parte do produto.
// Como rodar: de dentro de `dc360/`, depois de `npm ci --ignore-scripts`,
//   node ../docs/evidencias-v2/G04/V2-F04-E01/correcao-2/demo-for-share.mjs
// O pacote e resolvido a partir da pasta atual (o `node_modules` do dc360).
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const requerer = createRequire(pathToFileURL(process.cwd() + "/").href);
const { PGlite } = await import(pathToFileURL(requerer.resolve("@electric-sql/pglite")).href);

const db = new PGlite();
const linhas = [];
const log = (s) => { linhas.push(s); };

async function q(sql, rotulo) {
  log(`\n-- ${rotulo}`);
  log(sql.trim());
  try {
    const rs = await db.exec(sql);
    const r = rs[rs.length - 1];
    log(`=> ${r.rows.length} linha(s): ${JSON.stringify(r.rows)}${r.affectedRows !== undefined ? ` | afetadas: ${r.affectedRows}` : ""}`);
    return r;
  } catch (e) {
    log(`=> ERRO ${e.code ?? ""}: ${e.message}`);
    return null;
  }
}

await q("SELECT version()", "versao do servidor");
await q(`
CREATE TABLE organizacoes (id int PRIMARY KEY, nome text, eliminada_em timestamptz);
INSERT INTO organizacoes VALUES (1, 'Municipio A', NULL), (2, 'Municipio B', NULL), (3, 'Municipio C', now());
ALTER TABLE organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes FORCE ROW LEVEL SECURITY;
CREATE ROLE dc360_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT SELECT, UPDATE ON organizacoes TO dc360_app;
CREATE FUNCTION app_organizacao_atual() RETURNS int LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.organizacao_id', true), '')::int $$;
CREATE FUNCTION app_ator_tipo() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.ator_tipo', true), '') $$;
-- permissivas por municipio, como as da 034
CREATE POLICY organizacoes_leitura ON organizacoes FOR SELECT USING (id = app_organizacao_atual());
CREATE POLICY organizacoes_atualizacao ON organizacoes FOR UPDATE
  USING (id = app_organizacao_atual()) WITH CHECK (id = app_organizacao_atual());
-- RESTRICTIVE da classe C: o ator de orgao le e nunca escreve
CREATE POLICY organizacoes_orgao_nao_escreve ON organizacoes AS RESTRICTIVE FOR UPDATE TO dc360_app
  USING (id = app_organizacao_atual() AND app_ator_tipo() IN ('servidor', 'sistema'))
  WITH CHECK (id = app_organizacao_atual() AND app_ator_tipo() IN ('servidor', 'sistema'));
`, "montagem: organizacoes com RLS forcada, permissivas por municipio e a RESTRICTIVE de UPDATE da classe C");

await q(`
CREATE FUNCTION travar_municipio_para_escrita() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  PERFORM 1 FROM organizacoes
   WHERE id = app_organizacao_atual() AND eliminada_em IS NULL
     FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'municipio do contexto inexistente ou eliminado';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION travar_municipio_para_escrita() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travar_municipio_para_escrita() TO dc360_app;
`, "a funcao estreita: sem parametro, so o municipio do contexto, so FOR SHARE, nada devolvido");

// 1. ator de orgao, municipio A
await q("SET app.organizacao_id = '1'; SET app.ator_tipo = 'usuario_orgao'; SET ROLE dc360_app;", "ator de orgao (Maria) no municipio A, como dc360_app");
await q("SELECT id, nome FROM organizacoes", "1a. leitura comum: a classe C deixa ler");
await q("SELECT id FROM organizacoes WHERE id = 1 AND eliminada_em IS NULL FOR SHARE", "1b. a guarda N1 direta da correcao 1: FOR SHARE");
await q("SELECT id FROM organizacoes WHERE id = 1 FOR KEY SHARE", "1c. nem a trava mais fraca passa: FOR KEY SHARE");
await q("UPDATE organizacoes SET nome = 'alterado' WHERE id = 1", "1d. UPDATE pelo orgao: zero linhas");
await q("BEGIN", "1e. a funcao, dentro de uma transacao");
await q("SELECT travar_municipio_para_escrita()", "1e. o orgao toma a guarda pela funcao");
await q("RESET ROLE", "volta ao dono so para olhar a marca de trava das linhas (xmax)");
await q("SELECT id, (xmax::text = pg_current_xact_id()::text) AS travada_por_esta_transacao FROM organizacoes ORDER BY id", "1f. so a linha do municipio A ficou travada por esta transacao; B e C nao");
await q("SET ROLE dc360_app", "de novo como dc360_app, ainda ator de orgao");
await q("UPDATE organizacoes SET nome = 'alterado' WHERE id = 1", "1g. com a guarda na mao, o orgao continua sem alterar o municipio");
await q("ROLLBACK", "fim da transacao");
await q("RESET ROLE", "");
await q("SELECT nome FROM organizacoes WHERE id = 1", "1h. o nome do municipio A nao mudou");

// 2. servidor
await q("SET app.organizacao_id = '1'; SET app.ator_tipo = 'servidor'; SET ROLE dc360_app;", "servidor no municipio A");
await q("SELECT id FROM organizacoes WHERE id = 1 FOR SHARE", "2a. para o servidor, o FOR SHARE direto passa (a RESTRICTIVE o aceita)");
await q("RESET ROLE", "");

// 3. municipio eliminado e contexto ausente
await q("SET app.organizacao_id = '3'; SET app.ator_tipo = 'usuario_orgao'; SET ROLE dc360_app;", "ator de orgao num municipio eliminado (C)");
await q("SELECT travar_municipio_para_escrita()", "3a. municipio eliminado: recusa, sem escrever");
await q("RESET ROLE; RESET app.organizacao_id; SET app.ator_tipo = 'usuario_orgao'; SET ROLE dc360_app;", "sem municipio no contexto");
await q("SELECT travar_municipio_para_escrita()", "3b. contexto ausente: recusa");
await q("RESET ROLE", "");
await q(`SELECT p.oid::regprocedure AS assinatura, p.prosecdef AS security_definer, p.proconfig, p.proacl::text AS acl
  FROM pg_proc p WHERE p.proname = 'travar_municipio_para_escrita'`, "4. catalogo: assinatura, SECURITY DEFINER, configuracao e ACL exata");

console.log(linhas.join("\n"));
await db.close();
