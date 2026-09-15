-- =====================================================================
-- 041: a busca do painel, com tolerancia a erro, do lado do banco.
--
-- O PEDIDO, NA LETRA DE QUEM PAGA
--
-- "esse input tem que conseguir indexar praticamente qualquer registro e
-- qualquer funcionalidade dela com tolerancia a erro"
--
-- Os registros sao desta migracao e da rota `GET /busca`. As funcionalidades
-- sao do painel e nao passam pelo banco.
--
-- =====================================================================
-- O QUE O PGLITE SUPORTA, E O QUE A PRODUCAO SUPORTA (conferido antes de
-- escrever uma linha, em 15/09/2026, PGlite 0.2.17, Postgres 16 em WASM)
--
-- PGlite `new PGlite()` sem opcoes, que e o que TODO teste deste repositorio
-- usa (`isolamento.test.ts`, `carga.test.ts`, `apps/api/src/banco/memoria.ts`,
-- a API sem `DATABASE_URL`, o painel em modo local no navegador):
--   * `pg_available_extensions` lista SO `plpgsql`;
--   * `CREATE EXTENSION IF NOT EXISTS pg_trgm` FALHA com "extension pg_trgm
--     is not available", e o mesmo vale para `fuzzystrmatch` e `unaccent`.
--
-- PGlite `new PGlite({ extensions: { pg_trgm } })`, com a extensao passada
-- no construtor a partir de `@electric-sql/pglite/contrib/pg_trgm`:
--   * `CREATE EXTENSION pg_trgm` funciona, `similarity`, `word_similarity`,
--     os operadores `%` e `<%` e o indice `USING gin (... gin_trgm_ops)`
--     funcionam. E o que `db/test/busca.test.ts` e
--     `apps/api/test/busca.test.ts` usam no sabor "com pg_trgm".
--
-- Producao (Supabase, Postgres 15 ou mais novo): `pg_trgm` esta disponivel e
-- e extensao CONFIAVEL desde o Postgres 13, entao o papel de setup a instala
-- sem ser superusuario. `unaccent` tambem existe la, e mesmo assim NAO e
-- usada: a normalizacao abaixo e `translate()` com tabela explicita, para o
-- termo digitado e a chave gravada atravessarem a MESMA funcao em qualquer
-- ambiente, inclusive no navegador.
--
-- A CONSEQUENCIA, dita de frente: esta migracao tem DOIS CAMINHOS, e escolhe
-- em tempo de aplicacao pelo que `pg_available_extensions` responde.
--   * Com `pg_trgm`: extensao criada, `casa_busca` e `pontuar_busca` usam
--     `<%` e `word_similarity`, e cada tabela buscavel ganha um indice GIN de
--     trigramas sobre a chave de busca.
--   * Sem `pg_trgm`: as mesmas duas funcoes existem com a mesma assinatura,
--     e a tolerancia a erro e feita em SQL puro por `cobertura_de_trigramas`
--     (a fracao dos trigramas do termo que aparece na chave). Sem indice de
--     trigramas. E mais lento, e e o caminho do navegador e do teste comum,
--     nunca o da producao.
-- A rota nao sabe qual dos dois esta em vigor, e nao precisa saber: ela chama
-- as tres funcoes pelo nome e le a coluna `busca`. Migracao com caminho
-- condicional nao e o ideal; a alternativa era um `CREATE EXTENSION` seco que
-- quebraria todos os testes existentes e o painel em modo local.
--
-- =====================================================================
-- A CHAVE DE BUSCA E COLUNA GERADA, E NAO EXPRESSAO CALCULADA NA HORA
--
-- A primeira versao desta migracao indexava `normalizar_busca(coluna)` como
-- expressao, sem coluna nova. Medido no PGlite, 10 mil linhas e quatro
-- colunas: um segundo POR BUSCA quando o planejador escolhia o indice do
-- municipio e filtrava o resto (que e a escolha certa numa prefeitura, onde
-- "as linhas do meu municipio" ja e recorte pequeno), porque `translate` com
-- tabela de 48 caracteres mais `regexp_replace` custam dezenas de
-- microssegundos por linha por coluna, e a busca dispara a cada tecla.
--
-- Com a chave gerada e gravada (`GENERATED ALWAYS AS ... STORED`), a mesma
-- busca cai para um digito de milissegundos: o banco normaliza UMA vez, na
-- escrita, e a consulta compara texto pronto. A coluna acompanha a origem
-- sozinha, inclusive a minimizacao por prazo (migracao 021): quando o nome do
-- solicitante vira 'removido por prazo', ele sai da chave na mesma
-- instrucao, sem gatilho e sem a aplicacao lembrar de nada.
--
-- O QUE ENTRA NA CHAVE, tabela a tabela, e o que fica de fora:
--   ocorrencias  protocolo, endereco, ponto de referencia, nome do
--                solicitante.
--                FORA: `solicitante_contato`. O telefone e o dado que a
--                minimizacao remove primeiro, e buscar por ele transformaria
--                a caixa de busca num oraculo de "este numero esta na base?".
--                Quem precisa achar por telefone abre a ocorrencia pelo
--                protocolo, que a pessoa que ligou anotou. FORA tambem
--                `descricao` e `vulnerabilidade_descricao`: relato livre
--                nomeia terceiros e descreve saude, e uma busca de
--                "praticamente qualquer registro" nao e desculpa para
--                percorrer isso a cada tecla. A lista `GET /ocorrencias?busca=`
--                continua olhando `descricao`, por substring, como fazia.
--   usuarios     nome, matricula, email.
--   equipes      nome.
--   orgaos       nome, sigla.
--
-- =====================================================================
-- A PONTUACAO, escrita uma vez so, em `pontuar_busca`
--
--   1.0  chave igual ao termo
--   0.9  chave comeca pelo termo (o protocolo vem primeiro na chave, entao
--        "00012" acha "000123/2026" por aqui)
--   0.8  o termo comeca no inicio de uma palavra da chave ("bombeiro" em
--        "corpo de bombeiros")
--   0.7  o termo aparece em qualquer lugar da chave
--   ate 0.6  parecido por trigramas ("esperansa" e "esperanca"), que e o
--        ultimo degrau de proposito: parecido nunca passa na frente de igual.
--
-- `casa_busca` e o predicado do WHERE, e e uma funcao SQL de uma expressao so
-- para o planejador INLINAR: e assim que os operadores `~~` e `<%` chegam ao
-- planejador e o indice GIN pode atende-los. Se um dia ela virar plpgsql,
-- SECURITY DEFINER ou STRICT (OR e construcao nao estrita), o indice
-- continua existindo e para de ser usado. `db/test/busca.test.ts` cobra isso
-- pelo EXPLAIN.
--
-- =====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
--
-- Nao muda policy, nao cria funcao SECURITY DEFINER, nao toca no papel de
-- aplicacao. A chave de busca e coluna comum de tabela com RLS ativada e
-- forcada, entao a busca de um municipio nao enxerga a chave do outro pelo
-- mesmo mecanismo que nao enxerga o resto da linha. As funcoes daqui sao
-- INVOKER, puras, e nao leem tabela nenhuma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A normalizacao, sem `unaccent`
--
-- Caixa baixa, acento e cedilha trocados por tabela explicita (os do
-- portugues, mais os poucos que aparecem em nome de gente: `ñ`, trema, os
-- graves), e tudo que nao e letra ASCII nem digito vira UM espaco, com as
-- pontas aparadas. Isso engole `%`, `_` e `\`, entao o termo normalizado
-- nunca precisa de escape para virar padrao de LIKE.
--
-- A ordem importa: `translate` ANTES de `lower`, porque `lower` em locale C
-- (que e o do PGlite) nao baixa caixa de letra acentuada. Com as maiusculas
-- acentuadas na tabela, `lower` so precisa cuidar de ASCII.
--
-- STRICT: nulo entra, nulo sai. E IMMUTABLE de verdade: `translate`, `lower`,
-- `regexp_replace` e `btrim` sao imutaveis, e e isso que permite a coluna
-- gerada e o indice.
-- ---------------------------------------------------------------------
CREATE FUNCTION normalizar_busca(texto text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(texto,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

COMMENT ON FUNCTION normalizar_busca(text) IS
  'Caixa baixa, sem acento, sem pontuacao, sem espaco sobrando. E a funcao '
  'que a chave de busca de cada tabela e o termo digitado atravessam.';

-- ---------------------------------------------------------------------
-- A tolerancia a erro em SQL puro, para onde `pg_trgm` nao existe
--
-- Fracao dos trigramas do TERMO que aparecem na chave, com o mesmo espirito
-- de `word_similarity` (o termo e um pedaco da chave, e nao o contrario). E
-- uma aproximacao: `pg_trgm` extrai trigramas palavra a palavra, com dois
-- espacos antes e um depois; aqui a string inteira ganha as bordas. Para o
-- caso de uso, "esperansa" achar "esperanca", os dois dao o mesmo veredito.
--
-- Custa um `generate_series` por linha avaliada, e por isso e o caminho do
-- teste e do navegador, e nao o da producao. O cabecalho diz isso.
-- ---------------------------------------------------------------------
CREATE FUNCTION cobertura_de_trigramas(termo text, alvo text) RETURNS real
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 0::real
           ELSE (count(*) FILTER (WHERE strpos(' ' || alvo || ' ', t) > 0))::real
                / count(*)::real
         END
    FROM (
      SELECT DISTINCT substr('  ' || termo || ' ', i, 3) AS t
        FROM generate_series(1, length(termo) + 1) AS i
    ) AS trigramas
$$;

-- ---------------------------------------------------------------------
-- O predicado e a pontuacao, no sabor SEM `pg_trgm`.
--
-- Os dois recebem a chave JA normalizada e o termo JA normalizado. Quem
-- chama normaliza o termo uma vez (`SELECT normalizar_busca($1)`) e usa o
-- resultado como parametro comum; a chave ja esta normalizada na coluna.
--
-- `casa_busca` NAO e STRICT de proposito: OR e construcao nao estrita, e uma
-- funcao STRICT com OR dentro deixa de ser inlinavel. Com chave nula (nao
-- acontece: a coluna gerada nunca e nula) o resultado seria nulo, que o WHERE
-- trata como falso.
--
-- STABLE, e nao IMMUTABLE, porque no sabor com `pg_trgm` o operador `<%`
-- depende do parametro `pg_trgm.word_similarity_threshold` e e STABLE; a
-- funcao nao pode se declarar mais imutavel do que o que ela contem, senao
-- o planejador se recusa a inlina-la. O sabor sem extensao segue a mesma
-- declaracao para a rota nao ver diferenca.
-- ---------------------------------------------------------------------
CREATE FUNCTION casa_busca(chave text, termo text) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT chave LIKE ('%' || termo || '%')
      OR cobertura_de_trigramas(termo, chave) >= 0.6
$$;

CREATE FUNCTION pontuar_busca(chave text, termo text) RETURNS real
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT (CASE
    WHEN chave = termo                                THEN 1.0
    WHEN chave LIKE (termo || '%')                    THEN 0.9
    WHEN (' ' || chave) LIKE ('% ' || termo || '%')   THEN 0.8
    WHEN chave LIKE ('%' || termo || '%')             THEN 0.7
    ELSE cobertura_de_trigramas(termo, chave) * 0.6
  END)::real
$$;

COMMENT ON FUNCTION casa_busca(text, text) IS
  'O predicado da busca: substring normalizada OU parecido por trigramas. '
  'Recebe chave e termo ja normalizados por normalizar_busca.';
COMMENT ON FUNCTION pontuar_busca(text, text) IS
  'A pontuacao da busca: igual 1.0 > prefixo 0.9 > inicio de palavra 0.8 > '
  'substring 0.7 > parecido ate 0.6. Recebe chave e termo ja normalizados.';

-- ---------------------------------------------------------------------
-- A chave de busca, gerada pelo banco, em cada tabela buscavel
-- ---------------------------------------------------------------------
ALTER TABLE ocorrencias ADD COLUMN busca text
  GENERATED ALWAYS AS (normalizar_busca(
    protocolo || ' ' || endereco || ' ' || coalesce(ponto_referencia, '') || ' ' || solicitante_nome
  )) STORED;

ALTER TABLE usuarios ADD COLUMN busca text
  GENERATED ALWAYS AS (normalizar_busca(nome || ' ' || matricula || ' ' || email)) STORED;

ALTER TABLE equipes ADD COLUMN busca text
  GENERATED ALWAYS AS (normalizar_busca(nome)) STORED;

ALTER TABLE orgaos ADD COLUMN busca text
  GENERATED ALWAYS AS (normalizar_busca(nome || ' ' || coalesce(sigla, ''))) STORED;

COMMENT ON COLUMN ocorrencias.busca IS
  'Chave de busca gerada: protocolo, endereco, ponto de referencia e nome do '
  'solicitante, normalizados. Sem contato e sem relato, de proposito. '
  'Acompanha a minimizacao por prazo sozinha.';
COMMENT ON COLUMN usuarios.busca IS
  'Chave de busca gerada: nome, matricula e email, normalizados.';
COMMENT ON COLUMN equipes.busca IS
  'Chave de busca gerada: o nome, normalizado.';
COMMENT ON COLUMN orgaos.busca IS
  'Chave de busca gerada: nome e sigla, normalizados.';

-- ---------------------------------------------------------------------
-- O registro de consulta aprende o recurso `busca`
--
-- A rota de busca devolve endereco e protocolo, que a lista e o mapa ja
-- entregam sem registrar. O que ela faz a mais e casar pelo NOME do
-- solicitante: quem digita "marilda" e recebe "Rua das Acacias, 245" acabou
-- de ler onde a Marilda mora, e isso e a leitura que concentra dado de pessoa
-- numa ocorrencia identificada, o criterio de `privacidade/consulta.ts`. A
-- rota registra SO nesse caso, uma linha por ocorrencia devolvida, com o
-- recurso abaixo. O termo digitado nao e gravado: a tabela nao tem coluna
-- para ele, e a ausencia e a decisao (migracao 021).
-- ---------------------------------------------------------------------
ALTER TABLE ocorrencia_consultas
  DROP CONSTRAINT ocorrencia_consultas_recurso_check,
  ADD CONSTRAINT ocorrencia_consultas_recurso_check CHECK (recurso IN (
    'ocorrencia_detalhe',
    'laudo',
    'termo_de_interdicao',
    'termo_de_desinterdicao',
    'busca'
  ));

-- ---------------------------------------------------------------------
-- O sabor COM `pg_trgm`: extensao, funcoes trocadas e indices
--
-- Tudo dentro de um bloco condicional, pelo motivo do cabecalho: o mesmo
-- arquivo precisa aplicar num Postgres com a extensao e num sem ela, e uma
-- migracao que ja rodou nao se edita (o aplicador confere a impressao).
--
-- `CREATE OR REPLACE` mantem assinatura, volatilidade e comentario das
-- funcoes; so o corpo muda. `<%` e `word_similarity` sao de `pg_trgm` 1.3
-- em diante (Postgres 9.6), e a producao esta bem alem disso.
--
-- O operador `<%` compara com `pg_trgm.word_similarity_threshold`, cujo
-- padrao e 0.6, o mesmo limiar do sabor sem extensao. Nao e fixado por
-- `SET` aqui porque a funcao inlinavel nao pode carregar `SET` (funcao com
-- `proconfig` nao inlina), e fixa-lo na sessao da API quebraria no sabor sem
-- extensao. Fica o padrao, e fica dito.
-- ---------------------------------------------------------------------
DO $bloco$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    RAISE NOTICE 'pg_trgm indisponivel neste Postgres: a busca segue em SQL puro, sem indice de trigramas';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE OR REPLACE FUNCTION casa_busca(chave text, termo text) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $f$
    SELECT chave LIKE ('%' || termo || '%')
        OR termo <% chave
  $f$;

  CREATE OR REPLACE FUNCTION pontuar_busca(chave text, termo text) RETURNS real
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $f$
    SELECT (CASE
      WHEN chave = termo                                THEN 1.0
      WHEN chave LIKE (termo || '%')                    THEN 0.9
      WHEN (' ' || chave) LIKE ('% ' || termo || '%')   THEN 0.8
      WHEN chave LIKE ('%' || termo || '%')             THEN 0.7
      ELSE word_similarity(termo, chave) * 0.6
    END)::real
  $f$;

  /*
    GIN de trigramas sobre a chave. Atende `~~` (o LIKE de substring) e `<%`
    (o parecido), que sao exatamente os dois operadores de `casa_busca`. Um
    indice por tabela, sobre a chave inteira, e nao um por coluna de origem:
    a chave ja e a concatenacao, e a rota pergunta a ela.
  */
  CREATE INDEX ocorrencias_busca_idx ON ocorrencias USING gin (busca gin_trgm_ops);
  CREATE INDEX usuarios_busca_idx    ON usuarios    USING gin (busca gin_trgm_ops);
  CREATE INDEX equipes_busca_idx     ON equipes     USING gin (busca gin_trgm_ops);
  CREATE INDEX orgaos_busca_idx      ON orgaos      USING gin (busca gin_trgm_ops);
END
$bloco$;
