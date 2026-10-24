-- =====================================================================
-- Instala o PostGIS num schema próprio (V2-F01-E22, decisão D-16).
--
-- Quem roda, e onde:
--
--   - Papel de SETUP (o mesmo que migra), NUNCA o papel de aplicação. A
--     aplicação (`dc360_api`, membro de `dc360_app`) não é superusuário nem
--     tem CREATE no banco, e por desenho recebe `permission denied` aqui.
--   - HML: a etapa V2-F01-E22 roda este arquivo, para provar que o plano do
--     provedor deixa o papel de setup criar a extensão. É o que o CP-44 pede
--     confirmar com o provedor.
--   - PROD: NÃO se roda este arquivo. Lá a extensão nasce na migration da
--     F32 (modelo espacial). Em PROD, antes da F32, só se consulta a
--     disponibilidade: `conferir-ambiente.mjs --extensoes --ambiente=prod`.
--
-- Por que num schema próprio (`extensions`) e nunca em `public`:
--
--   `public` é o schema que a API REST do provedor publica. A extensão cria
--   `spatial_ref_sys`, duas views e mais de mil funções; em `public`, tudo isso
--   vira rota para `anon`, `authenticated` e `service_role`. No schema
--   `extensions` (o padrão do Supabase) nada é publicado. Mesmo assim, o
--   `supabase-endurecer.sql` revoga os privilégios, porque o schema depende de
--   configuração do projeto e privilégio revogado não depende de configuração.
--
-- Ordem: este arquivo, depois `supabase-endurecer.sql` (que fecha o que a
-- extensão abre e dá a `dc360_app` o mínimo), depois
-- `node scripts/conferir-ambiente.mjs --extensoes`.
--
--   psql "$DATABASE_URL_SETUP" -v ON_ERROR_STOP=1 -f postgis.sql
--   psql "$DATABASE_URL_SETUP" -v ON_ERROR_STOP=1 -f supabase-endurecer.sql
--   DATABASE_URL_SETUP=... node scripts/conferir-ambiente.mjs --extensoes
--
-- Idempotente: pode rodar de novo. NÃO é migração do produto (não entra em
-- `db/migrations`), pelo mesmo motivo do `supabase-endurecer.sql`: nem todo
-- Postgres onde o produto roda aceita criar a extensão.
--
-- Rollback em HML: DROP EXTENSION postgis; (sem CASCADE: se alguma tabela usar
-- os tipos, o Postgres recusa, e isso é o que se quer).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Anote esta linha na tabela de versões por ambiente de `docs/AMBIENTES.md`.
SELECT extensions.postgis_version() AS postgis_version;
