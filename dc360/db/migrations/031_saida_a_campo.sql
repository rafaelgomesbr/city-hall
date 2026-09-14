-- =====================================================================
-- 031: a saida a campo, e o retorno que ninguem confirmou.
--
-- A MAIOR DISTANCIA ENTRE O QUE O PRODUTO SABE E O QUE ELE FAZ.
--
-- O vocabulario deste produto reconhece, por escrito, desde a migracao 028,
-- que o agente entra em lugar que oferece risco a integridade fisica dele:
-- `risco_para_a_equipe` e um dos seis motivos de devolucao de tarefa. Ou seja,
-- o produto ja tem uma palavra para "nao entrei porque era perigoso", e nao
-- tinha uma unica linha de codigo para o caso de ele ter entrado.
--
-- O agente sobe um morro sozinho, sem sinal, para vistoriar um talude que
-- acabou de escorregar. Ate aqui: ninguem sabia que ele tinha subido, ninguem
-- sabia quando ele deveria descer, e se ele nao descesse nada no sistema
-- mudaria de cor.
--
-- =====================================================================
-- O QUE ESTA MIGRACAO PROMETE, E O QUE ELA RECUSA PROMETER
-- =====================================================================
--
-- Esta e a decisao central do arquivo, e ela e de responsabilidade
-- institucional antes de ser de banco de dados.
--
-- UM BOTAO DE APOIO QUE ACIONA ALGUEM QUE NAO EXISTE E PIOR DO QUE BOTAO
-- NENHUM, porque cria expectativa de socorro. Este produto nao tem central de
-- monitoramento 24 horas, nao tem contrato com servico de emergencia, nao tem
-- deteccao de queda e nao tem como fazer um aparelho sem sinal pedir socorro.
-- Prometer qualquer uma dessas coisas seria a pior coisa que este produto pode
-- fazer, porque a pessoa confiaria nela no dia em que ela nao funcionasse.
--
-- ENTAO O QUE ELE PROMETE E SO ISTO, e isto ele cumpre:
--
--   1. O agente declara, ANTES de subir e COM SINAL, para onde vai e em
--      quanto tempo pretende voltar.
--   2. O relogio que conta e o do SERVIDOR, nunca o do aparelho.
--   3. Se o retorno nao for confirmado ate o prazo, a saida fica VENCIDA e
--      aparece na tela de quem coordena, e no sino que a coordenacao ja olha.
--   4. O que a coordenacao fez a respeito entra na trilha, com nome e hora.
--
-- E O QUE ELE NAO PROMETE, dito nas telas e em `docs/GUIA-DO-COORDENADOR.md`:
--
--   * Nao e botao de panico. Nao existe SOS.
--   * Nao detecta queda, nem imobilidade, nem ausencia de movimento.
--   * Nao aciona ninguem sozinho. Nao liga para bombeiro, nao manda mensagem,
--     nao acorda ninguem.
--   * Se ninguem estiver com o painel aberto, ninguem e avisado. O municipio
--     precisa definir quem fica de olho, e o produto diz isso em voz alta em
--     vez de fingir que resolve.
--   * "Vencida" NAO quer dizer "em perigo". Quer dizer exatamente: ninguem
--      teve noticia dele desde o prazo que ele mesmo declarou. A frase da tela
--      diz isso e nada alem disso.
--
-- A ASSIMETRIA CRUEL, escrita aqui porque ela e o desenho inteiro: o aparelho
-- sem sinal nao consegue pedir socorro. Nenhum software muda isso. Por isso a
-- parte que funciona de verdade e a que acontece ANTES, na base, com sinal:
-- declarar para onde vai e quando volta. E por isso declarar a saida EXIGE
-- sinal, e a rota recusa fila: declaracao guardada no aparelho e declaracao
-- que ninguem recebeu, e ela daria ao agente a sensacao de estar coberto
-- exatamente quando ele nao esta.
--
-- =====================================================================
-- POR QUE UMA TABELA, e nao so eventos na trilha
-- =====================================================================
--
-- Pelas mesmas duas razoes da migracao 028, e uma terceira que so existe aqui.
--
--   1. IDEMPOTENCIA. `trilha_eventos` nao tem chave de idempotencia e nao pode
--      ter unicidade sobre coluna que ela nao tem. A declaracao sai de um
--      aparelho com sinal ruim: o pedido vai, o servidor grava, a resposta se
--      perde, e o aparelho repete. Sem chave, o agente ficaria com duas saidas
--      abertas e a coordenacao com duas linhas para a mesma ida.
--
--   2. A PERGUNTA E UMA LISTA. "Quem esta em campo agora, e quem estourou o
--      prazo" nao sai de texto dentro de `jsonb`. Mesma razao das migracoes
--      020 e 028.
--
--   3. O ESTADO PRECISA SER CONSULTAVEL AGORA, e nao reconstruido. A trilha
--      guarda o que aconteceu; esta tabela guarda quem esta la fora NESTE
--      minuto. Reconstruir isso varrendo eventos a cada trinta segundos, na
--      tela que a coordenacao deixa aberta o dia inteiro, seria pagar caro por
--      uma resposta que uma linha da tabela ja da.
--
-- =====================================================================
-- UMA SAIDA ABERTA POR AGENTE, e essa restricao e do banco
-- =====================================================================
--
-- "Onde ele esta agora" tem UMA resposta. Duas saidas abertas do mesmo agente
-- transformariam a tela de coordenacao numa adivinhacao, e o vencimento da
-- primeira apontaria para um endereco que ele ja deixou. O indice unico
-- parcial la embaixo recusa a segunda, e a rota traduz a recusa numa frase que
-- diz o que fazer (confirmar o retorno da anterior).
--
-- =====================================================================
-- SAIDA NAO SE APAGA, SE ENCERRA COM DESFECHO
-- =====================================================================
--
-- Regra da casa, e aqui ela tem um motivo a mais: esta tabela e a prova de que
-- o municipio reagiu, ou nao reagiu, a um alerta sobre a seguranca do proprio
-- servidor. Uma saida vencida que alguem pudesse apagar seria a unica coisa
-- que o produto grava sobre esse assunto, apagavel justamente por quem teria
-- interesse em apaga-la. Sem policy de DELETE, e o UPDATE limitado por coluna.
-- =====================================================================

CREATE TABLE saidas_a_campo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,

  /*
    A saida e sempre PARA uma ocorrencia despachada a equipe do agente.

    Amarrar ao protocolo e o que da endereco, ponto de referencia, severidade e
    coordenada de graca: a coordenacao que ve a saida vencida ja sabe para onde
    olhar, sem esta tabela copiar nada. Ronda de monitoramento sem ocorrencia
    aberta nao cabe aqui hoje, e isso esta anotado como pergunta ao dono do
    produto em vez de resolvido por conta propria.
  */
  ocorrencia_id   uuid NOT NULL,

  /*
    Quem saiu. Conferido pela rota contra o dono do token verificado, pelo
    mesmo motivo de `vistorias.agente_id` e de `devolucoes_de_tarefa`: o
    aparelho de plantao e compartilhado entre turnos, e portao de cliente nao e
    controle de acesso. Aqui o erro seria pior que um laudo com autor errado: a
    coordenacao procuraria a pessoa errada no morro errado.
  */
  agente_id       uuid NOT NULL,

  /*
    A equipe do agente no instante da saida, copiada no ato.

    Copiada, e nao lida por juncao, porque a lotacao muda: o agente realocado
    na semana seguinte faria a saida de ontem parecer ter sido de outra equipe,
    e a pergunta "quem estava respondendo por ele naquele dia" deixaria de ter
    resposta. Nula e situacao real: agente recem cadastrado e sem equipe
    continua podendo declarar que subiu o morro, e a seguranca dele nao pode
    depender de alguem ter lembrado de aloca-lo.
  */
  equipe_id       uuid,

  /*
    SOZINHO, e esta coluna e a unica aqui que muda a leitura de quem coordena.

    Trabalhador isolado e a categoria inteira de risco de que este recurso
    trata. Uma saida vencida de quem foi acompanhado e um aborrecimento; uma
    saida vencida de quem foi sozinho e a situacao que a literatura da area
    chama de lone worker, e e ela que justifica a coordenacao largar o que esta
    fazendo. A tela ordena por isso, e nunca comunica isso so por cor.
  */
  sozinho         boolean NOT NULL,

  /*
    Quanto tempo ele disse que ia demorar, em minutos, como ele escolheu.

    Guardado alem do prazo calculado porque o prazo muda com prorrogacao e este
    numero nao: e a estimativa original, e e ela que diz, depois, se o agente
    subestima sistematicamente o morro. Piso de quinze minutos porque abaixo
    disso o aviso chegaria antes de ele terminar de estacionar. Teto de oito
    horas porque uma saida e um turno de trabalho, e um numero maior que isso
    e dedo escorregando, nao jornada.
  */
  duracao_minutos integer NOT NULL CHECK (duracao_minutos BETWEEN 15 AND 480),

  /*
    Quando o dedo tocou, NO APARELHO, e ela NAO DECIDE NADA.

    Existe pela mesma razao das duas marcas de tempo do laudo: a trilha precisa
    conseguir mostrar as duas quando elas diferirem. Quem decide o prazo e
    `registrada_em` mais a duracao, calculado pelo Postgres na transacao.
  */
  declarada_em    timestamptz NOT NULL,
  registrada_em   timestamptz NOT NULL DEFAULT now(),

  /*
    O PRAZO, e ele e calculado pelo SERVIDOR na rota (`now() + duracao`).

    Relogio de aparelho e ajustavel, erra sozinho e atravessa fuso, e este
    produto ja decidiu isso tres vezes (coleta tardia no T2, devolucao vencida
    na migracao 028, prazo de atendimento na 016). Aqui o custo de errar e de
    outra ordem: um relogio adiantado em duas horas faria o alerta de um agente
    desaparecido sair duas horas depois do que deveria.

    `retorno_previsto_inicial` nao muda nunca. `retorno_previsto_em` e o prazo
    corrente, que a prorrogacao empurra. Os dois existem porque "ele disse duas
    horas e ja prorrogou tres vezes" e uma informacao diferente de "ele disse
    oito horas", e a tela precisa conseguir distinguir as duas.
  */
  retorno_previsto_inicial timestamptz NOT NULL,
  retorno_previsto_em      timestamptz NOT NULL,

  /*
    Quantas vezes ele empurrou o prazo.

    Prorrogar precisa existir, senao todo servico que demora mais que o
    previsto vira alarme falso, e alarme falso repetido e o unico jeito
    conhecido de matar este recurso de vez: a coordenacao aprende a ignorar a
    tela. E precisa ser CONTADO, senao prorrogar vira um jeito silencioso de
    manter uma saida aberta para sempre.
  */
  prorrogacoes    integer NOT NULL DEFAULT 0 CHECK (prorrogacoes >= 0),

  /*
    O FIM DA SAIDA, sempre com desfecho, e os desfechos sao lista fechada
    porque cada um descreve um ATO diferente de uma pessoa diferente.

      retorno_confirmado    o proprio agente disse que voltou. E o caminho
                            normal, e o unico que o agente escreve.
      contato_estabelecido  a coordenacao falou com ele (radio, telefone, outra
                            equipe) e ele esta bem.
      retorno_a_base        ele voltou e nao confirmou no aplicativo. Acontece:
                            bateria, aparelho no bolso, fim de turno.
      apoio_acionado        a coordenacao acionou apoio. E o desfecho que o
                            produto existe para tornar registravel, e por isso
                            ele EXIGE dizer o que foi acionado.
      registro_indevido     a saida foi declarada por engano.

    Encerrar nao apaga: a linha fica, com quem encerrou e quando.
  */
  encerrada_em    timestamptz,
  encerrada_por   uuid,
  desfecho        text CHECK (desfecho IN (
                    'retorno_confirmado',
                    'contato_estabelecido',
                    'retorno_a_base',
                    'apoio_acionado',
                    'registro_indevido'
                  )),

  /*
    O QUE FOI FEITO, em texto livre, e o teto e curto de proposito.

    Ela descreve o ATO DA COORDENACAO sobre a seguranca de um servidor
    ("acionei o Corpo de Bombeiros as 11h20", "falei com o Marcos pelo radio").
    O sujeito dela e agente publico no exercicio da funcao, e nao morador, e e
    por isso que a minimizacao por prazo das migracoes 021 e 029 NAO alcanca
    esta coluna: aquela varredura existe para descartar dado de cidadao no
    prazo que o municipio fixou, e esta linha e a prova de que o municipio
    reagiu (ou nao reagiu) a um alerta sobre o proprio trabalhador. Prova
    disso nao vence junto com o nome de quem ligou reclamando de uma
    infiltracao: reclamacao trabalhista tem prazo proprio e mais longo.

    O que sustenta essa decisao e a coluna ser curta e a tela dizer, no rotulo,
    que aqui se escreve o que foi feito e nunca dado do morador. Se um dia isto
    virar campo onde se conta a historia da familia, a decisao acima deixa de
    valer e esta coluna precisa entrar na varredura.
  */
  observacao      text CHECK (
                    observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 300
                  ),

  idempotency_key uuid NOT NULL,

  /*
    O ENCERRAMENTO E INTEIRO OU NAO EXISTE.

    Sem esta restricao, um UPDATE pela metade produziria a pior linha possivel:
    uma saida com hora de encerramento e sem desfecho aparece como resolvida na
    tela e nao diz o que houve, que e exatamente a linha que alguem vai
    procurar depois de um acidente.
  */
  CONSTRAINT encerramento_de_saida_e_inteiro CHECK (
    (encerrada_em IS NULL AND encerrada_por IS NULL AND desfecho IS NULL)
    OR (encerrada_em IS NOT NULL AND encerrada_por IS NOT NULL AND desfecho IS NOT NULL)
  ),

  /*
    "Acionei apoio" sem dizer qual apoio e a frase que nao ajuda ninguem seis
    meses depois. Mesma familia de regra do encerramento de ocorrencia sem
    motivo e da revogacao de aparelho sem motivo.
  */
  CONSTRAINT apoio_acionado_exige_observacao CHECK (
    desfecho IS DISTINCT FROM 'apoio_acionado'
    OR (observacao IS NOT NULL AND length(trim(observacao)) > 0)
  ),

  /*
    O prazo corrente nunca anda para tras do inicial: prorrogar so empurra. Sem
    isto, um pedido de prorrogacao com numero negativo encurtaria o prazo de
    seguranca de alguem que esta no morro, e o efeito seria o alerta sair mais
    cedo (chato) ou a saida nascer ja vencida (pior, porque vira ruido).
  */
  CONSTRAINT prorrogacao_nao_encurta CHECK (
    retorno_previsto_em >= retorno_previsto_inicial
  ),

  -- Redundante com a chave primaria, e e o preco da chave estrangeira composta
  -- que a migracao 008 estabeleceu como regra da casa.
  CONSTRAINT saidas_a_campo_org_id_unico UNIQUE (organizacao_id, id),

  /*
    A defesa contra o reenvio. Por municipio, como a da vistoria e a da
    devolucao: a chave nasce no aparelho, e aparelho de um municipio nao colide
    com o de outro nem deve poder descobrir que colidiu.
  */
  CONSTRAINT saida_idempotente UNIQUE (organizacao_id, idempotency_key),

  CONSTRAINT saida_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT,

  CONSTRAINT saida_agente_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, agente_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT,

  CONSTRAINT saida_encerrada_por_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, encerrada_por)
    REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT,

  CONSTRAINT saida_equipe_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, equipe_id)
    REFERENCES equipes (organizacao_id, id) ON DELETE RESTRICT
);

/*
  UMA SAIDA ABERTA POR AGENTE, imposta pelo banco.

  Indice unico PARCIAL, e o parcial e a peca inteira: a restricao vale sobre as
  saidas em aberto e nao alcanca o historico, senao o agente so poderia subir o
  morro uma vez na vida.

  A rota traduz a recusa. Sem tradutor, o agente na base receberia um erro de
  restricao de banco no lugar da frase que resolve o problema dele, que e
  confirmar o retorno da saida anterior.
*/
CREATE UNIQUE INDEX saida_aberta_unica_por_agente
  ON saidas_a_campo (organizacao_id, agente_id)
  WHERE encerrada_em IS NULL;

/*
  A CONSULTA QUE A TELA DA COORDENACAO FAZ, e ela e sempre a mesma: "o que
  esta aberto neste municipio, mais vencido primeiro". O indice parcial e do
  tamanho exato dessa pergunta, e ele e o mesmo que a materializacao do aviso
  no sino usa, a cada trinta segundos, por pessoa logada.
*/
CREATE INDEX saidas_abertas_idx
  ON saidas_a_campo (organizacao_id, retorno_previsto_em)
  WHERE encerrada_em IS NULL;

-- A pergunta do aparelho ao abrir ("eu tenho saida aberta?") e por agente.
CREATE INDEX saidas_por_agente_idx
  ON saidas_a_campo (organizacao_id, agente_id, registrada_em DESC);

ALTER TABLE saidas_a_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE saidas_a_campo FORCE ROW LEVEL SECURITY;

CREATE POLICY saidas_a_campo_isolamento ON saidas_a_campo
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  SELECT, INSERT e UPDATE POR COLUNA, e a lista de colunas e a regra.

  O que pode mudar depois de gravado: o prazo corrente e o contador (pela
  prorrogacao) e o bloco de encerramento. O que nunca muda: quem saiu, para
  onde, quando, se estava sozinho, a duracao declarada e o prazo inicial.
  Sem privilegio de coluna, uma rota nova poderia reescrever o prazo inicial de
  uma saida vencida e fazer o atraso desaparecer da tela sem deixar rastro.

  SEM DELETE, em lugar nenhum. Nao ha policy e nao ha concessao: as duas
  ausencias negam. Ver o cabecalho.
*/
GRANT SELECT, INSERT ON saidas_a_campo TO dc360_app;
GRANT UPDATE (retorno_previsto_em, prorrogacoes,
              encerrada_em, encerrada_por, desfecho, observacao)
  ON saidas_a_campo TO dc360_app;

COMMENT ON TABLE saidas_a_campo IS
  'Declaracao de ida a campo e de retorno previsto. Nao e botao de panico, nao '
  'detecta queda e nao aciona ninguem sozinho: ela poe o fato na frente de quem '
  'estiver com o painel aberto, e registra o que a coordenacao fez a respeito.';

COMMENT ON COLUMN saidas_a_campo.retorno_previsto_em IS
  'Prazo corrente, calculado pelo relogio do SERVIDOR. Prorrogacao empurra, '
  'nunca encurta.';

COMMENT ON COLUMN saidas_a_campo.observacao IS
  'O que a coordenacao fez, e nunca dado do morador. Fora do alcance da '
  'minimizacao por prazo de proposito: ver o cabecalho desta migracao.';

-- ---------------------------------------------------------------------
-- O sino aprende uma palavra nova.
--
-- O canal ja existe e a coordenacao ja olha para ele. Criar um segundo canal
-- para esta finalidade seria pedir que a mesma pessoa vigiasse dois lugares, e
-- na pratica ela vigiaria o mais antigo.
--
-- POR QUE NAO E GATILHO, diferente de `vistoria_recebida` e de
-- `providencia_respondida`: nao existe escrita que dispare este fato. Ele
-- acontece pela PASSAGEM DO TEMPO, exatamente como `prazo_vencido`, e por isso
-- quem o materializa e a propria rota do sino, dentro do municipio de quem
-- perguntou, sem funcao privilegiada nenhuma. O orcamento de funcoes
-- `SECURITY DEFINER` deste produto esta em quinze de quinze, e o portao CA-06
-- reprova a decima sexta: gastar a proxima com isto seria abrir um buraco
-- permanente na parede do isolamento para resolver o que uma consulta ja
-- resolve.
--
-- O QUE ISSO CUSTA, dito em voz alta aqui e no guia do coordenador: o aviso so
-- nasce quando alguem daquele municipio consulta o sino. Se ninguem estiver
-- com o painel aberto, ninguem e avisado. Este produto nao tem como acordar
-- quem foi almocar, e fingir que tem seria a promessa perigosa que o cabecalho
-- recusa.
-- ---------------------------------------------------------------------
ALTER TABLE avisos DROP CONSTRAINT avisos_tipo_check;

ALTER TABLE avisos ADD CONSTRAINT avisos_tipo_check CHECK (tipo IN (
  'vistoria_recebida',
  'prazo_vencido',
  'providencia_respondida',
  /*
    O prazo de retorno de uma saida a campo passou e o sistema nao recebeu
    confirmacao. O nome do tipo diz o FATO e nao a interpretacao dele: nao e
    'agente_em_perigo' porque o produto nao sabe disso, e um nome que afirmasse
    perigo produziria panico em toda saida que terminou com o telefone sem
    bateria.
  */
  'retorno_nao_confirmado'
));

/*
  A CHAVE DO FATO deste aviso e 'saida:<uuid da saida>:<epoch do prazo>', e o
  prazo entra nela pela mesma razao que ele entra na chave do prazo vencido: se
  a saida for prorrogada e vencer de novo, e fato novo e o sino toca de novo.
  Fosse so o id da saida, o segundo vencimento seria engolido em silencio, que
  e justamente o que nao pode acontecer quando o assunto e alguem que nao
  desceu do morro.

  Ela nao precisa de coluna nem de restricao nova: `aviso_unico_por_fato` ja
  cobre, e o texto e montado por quem emite, como os outros tres.
*/
