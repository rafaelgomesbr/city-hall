-- Volta da 053 (V2-F03-E04): devolve as quatro colunas ao CHECK solto, tira
-- a origem `portal` e o gatilho, e apaga os tres dominios.
-- So roda fora de producao (ver `db/src/desfazer.ts`).
--
-- RECUSA, em vez de apagar ou reescrever historico, se ja existir conta
-- `usuario_orgao`, autor `usuario_orgao` na trilha ou origem `portal`: esse
-- dado nao cabe nos CHECKs antigos, e tabela de trilha nao se corrige.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE papel = 'usuario_orgao')
     OR EXISTS (SELECT 1 FROM trilha_eventos WHERE autor_papel = 'usuario_orgao' OR origem = 'portal')
     OR EXISTS (SELECT 1 FROM trilha_administrativa WHERE autor_papel = 'usuario_orgao')
     OR EXISTS (SELECT 1 FROM ocorrencia_consultas WHERE usuario_papel = 'usuario_orgao') THEN
    RAISE EXCEPTION
      'desfazer 053 recusado: ja existe dado com papel usuario_orgao ou origem portal, que os CHECKs antigos nao aceitam';
  END IF;
END
$$;

DROP TRIGGER usuarios_papel_nao_se_converte ON usuarios;
DROP FUNCTION usuarios_papel_nao_se_converte();

ALTER TABLE trilha_eventos
  DROP CONSTRAINT trilha_eventos_origem_check;
ALTER TABLE trilha_eventos
  ADD CONSTRAINT trilha_eventos_origem_check
  CHECK (origem IN ('campo', 'escritorio'));

ALTER TABLE usuarios
  ALTER COLUMN papel TYPE text;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('coordenador', 'operador', 'agente_campo', 'administrador'));

ALTER TABLE trilha_eventos
  ALTER COLUMN autor_papel TYPE text;
ALTER TABLE trilha_eventos
  ADD CONSTRAINT trilha_eventos_autor_papel_check
  CHECK (autor_papel IN ('coordenador', 'operador', 'agente_campo', 'administrador'));

ALTER TABLE ocorrencia_consultas
  ALTER COLUMN usuario_papel TYPE text;
ALTER TABLE ocorrencia_consultas
  ADD CONSTRAINT ocorrencia_consultas_usuario_papel_check
  CHECK (usuario_papel IN ('coordenador', 'operador', 'agente_campo', 'administrador'));

ALTER TABLE trilha_administrativa
  ALTER COLUMN autor_papel TYPE text;
ALTER TABLE trilha_administrativa
  ADD CONSTRAINT trilha_administrativa_autor_papel_check
  CHECK (autor_papel IN (
    'coordenador',
    'operador',
    'agente_campo',
    'administrador',
    'operador_da_plataforma'
  ));

COMMENT ON COLUMN trilha_administrativa.autor_papel IS
  'Papel de quem praticou o ato. Os quatro primeiros valores sao papeis do produto; operador_da_plataforma nao e papel de conta nenhuma e existe so para nomear quem provisionou o municipio.';

DROP DOMAIN tipo_de_ator;
DROP DOMAIN papel_de_autor_administrativo;
DROP DOMAIN papel_de_conta;
