-- =====================================================================
-- 028: a tarefa vencida que o agente devolve para a coordenacao.
--
-- O DEFEITO, que nao e de codigo e sim de ausencia: o agente sobe o morro, a
-- tarefa VENCE e ele nao consegue vistoriar. Nao localizou o endereco, nao
-- havia ninguem, o portao estava trancado, o barranco continuava cedendo e
-- entrar era risco para a equipe. O produto nao tinha o que fazer com isso. A
-- ocorrencia ficava `em_campo` para sempre, na tela de quem ja tinha
-- desistido dela, e a coordenacao so descobria por telefonema, se descobrisse.
--
-- Os dois desfechos que ja existiam sao ambos falsos aqui. Concluir a vistoria
-- seria mentira gravada, e e dela que nasce o laudo. Encerrar seria pior: a
-- casa continua precisando de vistoria, e encerrar por nao ter ido e
-- exatamente o "a prefeitura nao fez nada" que este produto existe para tornar
-- impossivel de acontecer em silencio.
--
-- -------------------------------------------------------------------
-- POR QUE UMA TABELA, e nao so um evento na trilha
-- -------------------------------------------------------------------
--
-- A trilha guarda o fato, e ela continua guardando. O que ela nao consegue
-- guardar e a IDEMPOTENCIA: `trilha_eventos` nao tem chave de idempotencia e
-- nao pode ter restricao de unicidade sobre uma coluna que ela nao tem. E a
-- devolucao chega pela fila do aparelho, que e a mesma fila da vistoria, com a
-- mesma conexao indo e vindo dentro do carro: o MESMO pedido chega mais de uma
-- vez, por definicao.
--
-- Sem unicidade por chave, o reenvio gravaria um segundo evento numa trilha
-- append-only (que por definicao nao se corrige) e, pior, o item ficaria preso
-- no aparelho: a segunda tentativa encontraria a ocorrencia ja em `triagem`,
-- receberia recusa, e a fila repetiria a recusa para sempre. Vistoria salva no
-- servidor e presa no aparelho ja aconteceu uma vez aqui (ver a nota do T5 em
-- `rotas/sincronizacao.ts`), e a correcao foi exatamente esta: chave unica,
-- `ON CONFLICT DO NOTHING RETURNING` e releitura.
--
-- A tabela guarda tambem o que a trilha guardaria em JSON e ninguem consegue
-- consultar sem escrever SQL dentro de `jsonb`: qual equipe perdeu o prazo,
-- qual era o prazo e qual o motivo. A pergunta que a coordenacao faz depois de
-- um mes de chuva e uma lista ("quais tarefas voltaram, de que equipe, por que
-- motivo"), e lista nao sai de texto dentro de JSON. Mesma razao da migracao
-- 020 para os orgaos indicados.
--
-- -------------------------------------------------------------------
-- POR QUE `prazo_em` E COPIADO PARA CA
-- -------------------------------------------------------------------
--
-- A devolucao so e permitida depois que o prazo VENCEU, e quem decide isso e o
-- relogio do servidor. Copiar o prazo para a linha e o que torna a condicao
-- auditavel depois: sem ela, uma triagem posterior que recalcule `prazo_em`
-- faria a devolucao de ontem parecer ter acontecido dentro do prazo, e nao
-- existiria forma de saber qual era o prazo no minuto do ato.
--
-- O que esta migracao NAO faz e mexer em `ocorrencias.prazo_em`. Devolver nao
-- zera o relogio: a ocorrencia volta para `triagem` com o mesmo prazo vencido,
-- continua contando como atrasada no painel, e o atraso continua a vista. Ver
-- a nota do T2 no despacho, que corrigiu o mesmo defeito por outro caminho.
--
-- -------------------------------------------------------------------
-- POR QUE SELECT E INSERT, E MAIS NADA
-- -------------------------------------------------------------------
--
-- Mesma razao da trilha e da migracao 020: isto e declaracao de campo. O
-- agente disse, naquele minuto, por que nao deu. Corrigir nao se faz
-- reescrevendo o que ele disse; se faz com despacho novo, que e o proximo
-- passo natural da ocorrencia que acabou de voltar para a triagem.
-- =====================================================================

CREATE TABLE devolucoes_de_tarefa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  ocorrencia_id   uuid NOT NULL,

  /*
    Quem devolveu. Conferido pela rota contra o dono do token verificado, pelo
    mesmo motivo de `vistorias.agente_id`: o aparelho de plantao e compartilhado
    entre turnos, e portao de cliente nao e controle de acesso.
  */
  devolvida_por   uuid NOT NULL,

  /*
    A equipe a quem a tarefa estava despachada no instante da devolucao.

    NOT NULL porque so ha tarefa a devolver onde houve despacho, e e por esta
    coluna que a reconciliacao descobre, depois, que a ocorrencia que sumiu da
    lista do agente foi devolvida pela equipe DELE. Sem ela, a ocorrencia
    devolvida (que fica com `equipe_id` nulo) seria indistinguivel de uma que
    nunca foi dele, e o aparelho receberia silencio.
  */
  equipe_id       uuid NOT NULL,

  motivo          text NOT NULL CHECK (motivo IN (
                    'endereco_nao_localizado','morador_ausente','acesso_impedido',
                    'risco_para_a_equipe','fora_da_area_da_equipe','outro')),
  observacao      text,

  /*
    O prazo que foi perdido, copiado no ato. Ver o cabecalho.
  */
  prazo_em        timestamptz NOT NULL,

  /*
    Quando o dedo tocou, no aparelho, e NAO decide nada: quem decide se a
    tarefa venceu e `now()` do servidor, na rota. Esta coluna existe para a
    trilha poder mostrar as duas marcas de tempo, como o laudo ja faz com a
    coleta: devolucao decidida sem sinal e enviada horas depois e o normal.
  */
  decidida_em     timestamptz NOT NULL,
  registrada_em   timestamptz NOT NULL DEFAULT now(),

  idempotency_key uuid NOT NULL,

  CONSTRAINT devolucoes_de_tarefa_org_id_unico UNIQUE (organizacao_id, id),

  /*
    A defesa contra o reenvio da fila. Por municipio, como a da vistoria: a
    chave nasce no aparelho, e aparelho de um municipio nao colide com o de
    outro nem deve poder descobrir que colidiu.
  */
  CONSTRAINT devolucao_idempotente UNIQUE (organizacao_id, idempotency_key),

  /*
    As tres chaves estrangeiras sao COMPOSTAS, e a razao nao envelhece (ver as
    migracoes 008, 017, 020 e 024): Row Level Security governa SELECT, INSERT,
    UPDATE e DELETE, e NAO governa a verificacao de chave estrangeira. O
    Postgres confere a existencia da linha referenciada com privilegio de
    sistema, por baixo da policy. Uma chave simples deixaria uma devolucao de
    Serra Alta constar feita por um agente de Vale Fundo, e o RLS nao veria
    nada de errado porque nunca chega a ser consultado. Pior: o INSERT passa se
    o identificador existe la e falha se nao existe, que e um oraculo de
    existencia sobre o cadastro do vizinho, exatamente o que a resposta 404 no
    lugar de 403 existe para impedir na API.

    Sem ON DELETE em usuario e equipe: neste produto nenhum dos dois se apaga,
    os dois se desativam, justamente porque assinam ato e aparecem na trilha.
  */
  CONSTRAINT devolucao_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE CASCADE,

  CONSTRAINT devolucao_autor_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, devolvida_por)
    REFERENCES usuarios (organizacao_id, id),

  CONSTRAINT devolucao_equipe_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, equipe_id)
    REFERENCES equipes (organizacao_id, id),

  /*
    A MESMA regra do `devolucaoDeTarefaSchema`, no banco.

    "Regra de negocio mora no banco e no pacote compartilhado, nao na tela": se
    a validacao so existe no formulario, ela nao existe. "Outro" sozinho nao
    responde nada para quem vai decidir o que fazer com a ocorrencia, e e
    justamente o motivo que qualquer escrita futura por um caminho novo
    escolheria por ser o mais facil de preencher.

    Dez caracteres e o mesmo piso do Zod. Nao mede qualidade de redacao nenhuma:
    recusa o campo vazio e o "ok" com cara de resposta.
  */
  CONSTRAINT motivo_outro_exige_observacao CHECK (
    motivo <> 'outro'
    OR (observacao IS NOT NULL AND length(trim(observacao)) >= 10)
  ),

  /*
    Copia deliberada de `coletada_em_plausivel` (migracao 009) e de
    `capturada_em_plausivel` (migracao 024), inclusive na folga.

    As doze horas para frente cobrem relogio trocado e fuso errado, que sao
    rotina em campo. O que elas NAO fazem e abrir caminho para burlar o prazo:
    esta coluna nao decide nada, e o aparelho com relogio adiantado continua
    recebendo recusa da rota, que compara `ocorrencias.prazo_em` com `now()` do
    servidor. A restricao existe para o instante que a trilha vai imprimir ser
    plausivel, e nao para julgar precisao.
  */
  CONSTRAINT decidida_em_plausivel CHECK (
    decidida_em > timestamptz '2020-01-01'
    AND decidida_em < now() + interval '12 hours'
  )
);

/*
  A pergunta da reconciliacao, feita a cada sincronizacao do aparelho: esta
  ocorrencia que sumiu da minha lista foi devolvida pela minha equipe? Por
  municipio e ocorrencia, que e exatamente como ela e feita.
*/
CREATE INDEX devolucoes_de_tarefa_ocorrencia_idx
  ON devolucoes_de_tarefa (organizacao_id, ocorrencia_id);

/*
  A pergunta da coordenacao depois de um mes de chuva: quais tarefas voltaram,
  de que equipe, em que ordem. Mais recente primeiro, que e como a lista se le.
*/
CREATE INDEX devolucoes_de_tarefa_equipe_idx
  ON devolucoes_de_tarefa (organizacao_id, equipe_id, registrada_em DESC);

ALTER TABLE devolucoes_de_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE devolucoes_de_tarefa FORCE ROW LEVEL SECURITY;

CREATE POLICY devolucoes_de_tarefa_isolamento ON devolucoes_de_tarefa
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- SELECT e INSERT, e mais nada. Ver o cabecalho: isto e declaracao de campo, e
-- correcao se faz com despacho novo, nao reescrevendo o que o agente disse.
GRANT SELECT, INSERT ON devolucoes_de_tarefa TO dc360_app;

COMMENT ON TABLE devolucoes_de_tarefa IS
  'Tarefa vencida que o agente devolveu a coordenacao sem ter vistoriado. Nao '
  'encerra a ocorrencia: ela volta para triagem, com o prazo vencido intacto.';
COMMENT ON COLUMN devolucoes_de_tarefa.prazo_em IS
  'O prazo que ja estava vencido quando o servidor aceitou a devolucao, '
  'copiado no ato para a condicao continuar auditavel depois de uma triagem '
  'nova recalcular o prazo da ocorrencia.';
COMMENT ON COLUMN devolucoes_de_tarefa.decidida_em IS
  'Hora do aparelho, para a trilha. Nao decide nada: quem decide se a tarefa '
  'venceu e o relogio do servidor.';
