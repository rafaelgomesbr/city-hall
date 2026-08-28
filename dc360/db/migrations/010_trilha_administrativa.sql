-- =====================================================================
-- 010: a trilha dos atos administrativos.
--
-- Até aqui, promover uma conta, rebaixar, desativar, criar equipe ou trocar o
-- papel de alguém NÃO DEIXAVA RASTRO NENHUM. Cinco rotas de escrita em
-- `rotas/administracao.ts`, e nenhuma chamada ao registro de eventos.
--
-- O efeito prático, e é o que o red team apontou: um coordenador promove uma
-- conta descartável, usa, rebaixa e desativa, e o sistema não tem como
-- responder "quem deu esse acesso". Isso não é uma falha de execução, é a
-- ausência de detecção que transforma qualquer outra falha num incidente que
-- não se investiga.
--
-- POR QUE UMA TABELA NOVA, E NÃO A TRILHA QUE JÁ EXISTE
--
-- `trilha_eventos.ocorrencia_id` é `NOT NULL`. A tabela foi desenhada em volta
-- da ocorrência, e isso está certo para o que ela registra. Um ato
-- administrativo não tem ocorrência: ele acontece sobre um usuário ou sobre
-- uma equipe. Afrouxar a coluna para aceitar nulo enfraqueceria a garantia da
-- trilha operacional para acomodar um caso que não é dela.
--
-- A migração 007 já resolveu um caso igual desta forma, criando `exportacoes`
-- em vez de forçar o registro de exportação dentro da trilha. Este arquivo
-- segue a mesma decisão.
--
-- APPEND-ONLY PELO MESMO MECANISMO
--
-- Sem policy de UPDATE e sem policy de DELETE. Não é gatilho, não é regra de
-- aplicação: é ausência de permissão. Correção entra como evento novo, e nem
-- quem administra o município reescreve o que aconteceu.
-- =====================================================================

CREATE TABLE trilha_administrativa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,

  -- Quem fez. `autor_id` pode ficar nulo se a conta for apagada um dia, e por
  -- isso nome e papel são copiados no momento do ato: a trilha precisa
  -- continuar legível mesmo que o cadastro mude depois.
  autor_id        uuid,
  autor_nome      text NOT NULL,
  autor_papel     text NOT NULL CHECK (
    autor_papel IN ('coordenador','operador','agente_campo','administrador')
  ),

  -- O que aconteceu. Texto e não enum, pela mesma razão de `trilha_eventos`:
  -- acrescentar um tipo de ato não pode exigir migração destrutiva.
  acao            text NOT NULL,

  -- Sobre quem ou sobre o quê.
  alvo_tipo       text NOT NULL CHECK (alvo_tipo IN ('usuario','equipe','organizacao')),
  alvo_id         uuid,
  alvo_nome       text NOT NULL,

  /*
    Antes e depois, para o ato que muda alguma coisa.

    Guardar os dois é o que permite responder "quem transformou este operador
    em coordenador", que é a pergunta de uma investigação real. Guardar só o
    depois exigiria reconstruir o histórico lendo todos os eventos anteriores,
    e a reconstrução falha justamente quando o registro está incompleto.

    NUNCA guardar senha, hash de senha, nem token. O que entra aqui é papel,
    equipe, situação e nome.
  */
  antes           jsonb,
  depois          jsonb,

  registrado_em   timestamptz NOT NULL DEFAULT now(),

  /*
    Chave estrangeira COMPOSTA, incluindo o município.

    O portão CA-06 recusou a versão simples, e com razão: a verificação de
    chave estrangeira roda ABAIXO da policy de RLS, com privilégio de sistema.
    Uma referência só por `id` deixaria assinar um ato administrativo de um
    município com um usuário de outro, e o oráculo de existência que vem junto
    foi exatamente o que a migração 008 existiu para fechar.
  */
  CONSTRAINT trilha_adm_autor_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, autor_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE SET NULL
);

CREATE INDEX trilha_adm_org_data_idx
  ON trilha_administrativa (organizacao_id, registrado_em DESC);

-- Para a pergunta "o que aconteceu com esta conta", que é a segunda mais
-- frequente numa investigação.
CREATE INDEX trilha_adm_alvo_idx
  ON trilha_administrativa (organizacao_id, alvo_tipo, alvo_id, registrado_em DESC);

ALTER TABLE trilha_administrativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE trilha_administrativa FORCE ROW LEVEL SECURITY;

CREATE POLICY trilha_adm_leitura ON trilha_administrativa
  FOR SELECT TO dc360_app
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY trilha_adm_escrita ON trilha_administrativa
  FOR INSERT TO dc360_app
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- Nenhuma policy de UPDATE, nenhuma de DELETE. É isto que torna a tabela
-- append-only, e é por ausência que a garantia vale.

GRANT SELECT, INSERT ON trilha_administrativa TO dc360_app;

COMMENT ON TABLE trilha_administrativa IS
  'Atos administrativos (usuário, equipe, organização). Append-only por ausência de policy de UPDATE e DELETE, igual à trilha operacional.';
