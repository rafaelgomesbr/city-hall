-- =====================================================================
-- 018: o sino de avisos do painel.
--
-- O QUE FALTAVA. A vistoria chega do campo, o prazo vence, a secretaria
-- responde a providencia, e nada disso aparece para quem esta com o painel
-- aberto. O coordenador so descobre recarregando a tela e comparando de
-- cabeca com o que ele viu ha dez minutos. Na pratica ele nao compara, e o
-- fato passa.
--
-- A migracao 016 resolveu o mesmo problema para quem esta NA RUA, por push. O
-- sino resolve para quem esta NA MESA, e os dois canais nao se substituem:
-- push alcanca a equipe despachada e nao alcanca a coordenacao, que nao tem
-- aparelho registrado nem esta esperando notificacao no telefone.
--
-- =====================================================================
-- POR QUE SAO DUAS TABELAS, e essa e a decisao central deste arquivo.
--
-- O caminho obvio e uma coluna `lido boolean` dentro do proprio aviso. Ele
-- tem um defeito que so aparece com mais de uma pessoa na sala, que e o caso
-- normal de uma coordenadoria:
--
--   O mesmo fato e visto por varias pessoas. Com `lido` no aviso, a PRIMEIRA
--   pessoa que abre o sino apaga o aviso de TODO MUNDO. O coordenador que
--   estava no telefone volta para a tela e o sino esta limpo, sem que nada
--   tenha acontecido com ele. E o defeito classico deste recurso, e ele e
--   silencioso: nao existe erro, nao existe log, e a pessoa nao tem como
--   saber que perdeu alguma coisa.
--
-- Por isso o fato e o que-foi-lido moram em tabelas separadas. `avisos` e uma
-- linha por acontecimento, do municipio. `avisos_lidos` e uma linha por
-- pessoa por acontecimento, e cada um le no seu tempo.
--
-- =====================================================================
-- O QUE O AVISO NAO CARREGA, e isto e regra e nao esquecimento.
--
-- Nada de nome de solicitante, contato, relato, endereco ou descricao de
-- vulnerabilidade. O sino e a superficie mais lida do produto (uma consulta a
-- cada trinta segundos, por pessoa logada, o dia inteiro), e ele nao precisa
-- de nada disso para cumprir a funcao dele, que e levar a pessoa ate a
-- ocorrencia. O que ele carrega e o tipo do fato, para qual ocorrencia, e
-- quando. O protocolo entra na leitura, por juncao, e protocolo nao identifica
-- pessoa.
--
-- A mesma regra ja vale para a notificacao de push da migracao 016, e vale
-- aqui pelo mesmo motivo: dado pessoal so aparece onde ele e necessario para
-- o trabalho, e o sino nao e esse lugar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- avisos: o fato, uma linha por acontecimento.
-- ---------------------------------------------------------------------
CREATE TABLE avisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,

  tipo            text NOT NULL CHECK (tipo IN (
                    -- A vistoria do campo chegou ao servidor.
                    'vistoria_recebida',
                    -- O prazo de atendimento passou e a ocorrencia continua aberta.
                    'prazo_vencido',
                    -- O orgao destinatario respondeu a providencia encaminhada.
                    'providencia_respondida'
                  )),

  ocorrencia_id   uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  /*
    Complemento curto para a frase do sino, e NUNCA dado pessoal.

    O teto de 200 caracteres nao e estetico: e o que impede alguem, um dia, de
    colar aqui o relato do solicitante "porque ajuda o coordenador a decidir".
    Ajudaria mesmo, e transformaria a consulta mais frequente do produto num
    despejo de dado pessoal a cada trinta segundos.
  */
  detalhe         text CHECK (
                    detalhe IS NULL OR length(trim(detalhe)) BETWEEN 1 AND 200
                  ),

  /*
    A CHAVE DO FATO, e ela e o que impede o sino de tocar duas vezes pelo
    mesmo acontecimento.

    Ela nao e uma chave estrangeira porque o fato vem de tabelas diferentes
    (uma vistoria, uma providencia, um prazo), e uma referencia polimorfica
    nao existe no Postgres sem gambiarra. O que existe e um texto estavel,
    montado por quem emite: 'vistoria:<uuid>', 'providencia:<uuid>',
    'prazo:<uuid da ocorrencia>:<instante do vencimento>'.

    O instante entra na chave do prazo de proposito: se a coordenacao esticar
    o prazo e ele vencer de novo, e fato novo e o sino toca de novo. Fosse so
    o id da ocorrencia, o segundo vencimento seria engolido em silencio, que e
    justamente o que nao pode acontecer com prazo.
  */
  chave_do_fato   text NOT NULL CHECK (length(trim(chave_do_fato)) BETWEEN 1 AND 200),

  CONSTRAINT aviso_unico_por_fato UNIQUE (organizacao_id, chave_do_fato),

  -- Redundante com a chave primaria, e e o preco da chave estrangeira
  -- composta que a migracao 008 estabeleceu como regra da casa.
  CONSTRAINT avisos_org_id_unico UNIQUE (organizacao_id, id),

  CONSTRAINT avisos_ocorrencia_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, ocorrencia_id)
    REFERENCES ocorrencias (organizacao_id, id) ON DELETE RESTRICT
);

-- A consulta do sino e sempre "o que aconteceu neste municipio depois de tal
-- instante", e o expurgo e "o que aconteceu neste municipio antes de tal
-- instante". As duas cabem no mesmo indice.
CREATE INDEX avisos_org_criado_idx ON avisos (organizacao_id, criado_em DESC);

ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos FORCE ROW LEVEL SECURITY;

CREATE POLICY avisos_leitura ON avisos FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY avisos_insercao ON avisos FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  NAO EXISTE POLICY DE UPDATE, e a ausencia e a decisao.

  Aviso e fato acontecido. Fato nao se corrige, entra outro. E a mesma regra
  da trilha de auditoria (migracao 001), pelo mesmo motivo: se uma rota
  pudesse reescrever o aviso, "prazo vencido" viraria "prazo em dia" sem que
  nada no banco registrasse a troca.
*/

/*
  RETENCAO: SESSENTA DIAS, e ela e uma POLICY, nao uma promessa.

  Aviso velho e lixo, e lixo que custa caro: esta e a tabela consultada a cada
  trinta segundos por pessoa logada, o dia inteiro. Sem prazo de descarte ela
  cresce para sempre e a consulta do sino fica mais lenta a cada mes,
  justamente na tela que mais roda.

  POR QUE SESSENTA DIAS:

    * O aviso e PONTEIRO, nao registro. O acontecimento em si continua na
      ocorrencia, na vistoria, na providencia e na trilha de auditoria, que e
      append-only e nao se apaga. Expurgar aviso nao apaga historia nenhuma, e
      por isso a regra "registro nao se apaga, se encerra com motivo" nao se
      aplica aqui: nao ha registro de negocio sendo apagado.
    * Sessenta dias cobre com folga a maior ausencia normal de um servidor (um
      mes de ferias), entao quem volta ainda encontra o que aconteceu.
    * Guardar por mais tempo seria manter, sem finalidade declarada, o registro
      de qual servidor leu qual aviso e quando. Isso e dado de comportamento de
      pessoa, e o produto nao promete guardar isso.
    * E folgadissimo em relacao a janela do sino (trinta segundos), entao nao
      ha como o expurgo apagar algo que o sino ainda ia entregar.

  POR QUE A REGRA VIVE NA POLICY E NAO SO NO CODIGO DA ROTA.

  A migracao 016 pos o expurgo dentro de uma funcao privilegiada, e ali isso
  fazia sentido porque o varredor roda sem municipio no contexto. Aqui nao ha
  varredor: quem apaga e a propria rota do sino, dentro do municipio dela.

  Se o direito de apagar fosse simplesmente concedido, a rota poderia apagar
  qualquer aviso, e "expurgo por idade" viraria uma frase de documento que nada
  obriga. Com a idade DENTRO da policy, o banco recusa: um `DELETE FROM avisos`
  sem clausula nenhuma apaga exatamente os vencidos e nem toca no resto. A
  regra de retencao passa a ser inquebravel por codigo de aplicacao, que e o
  que a regra da casa quer dizer com "regra de negocio mora no banco".

  Se este numero mudar, ele muda AQUI, e o teste de API que compara a constante
  da rota com o texto desta policy quebra ate os dois voltarem a concordar.
*/
CREATE POLICY avisos_expurgo ON avisos FOR DELETE
  USING (
    organizacao_id = app_organizacao_atual()
    AND criado_em < now() - interval '60 days'
  );

COMMENT ON TABLE avisos IS
  'O fato, uma linha por acontecimento do municipio. Quem leu o que fica em '
  'avisos_lidos, de proposito: coluna lido aqui faria a primeira pessoa a ler '
  'apagar o sino de todo mundo.';

COMMENT ON COLUMN avisos.detalhe IS
  'Complemento curto para a frase do sino. Nunca dado pessoal: nem nome, nem '
  'contato, nem endereco, nem relato.';

-- ---------------------------------------------------------------------
-- avisos_lidos: quem leu o que, e quando.
--
-- Nao tem coluna `id`, e nao precisa: a identidade da linha E o par
-- (pessoa, aviso). Uma chave sintetica aqui so criaria a possibilidade de
-- duas linhas dizendo a mesma coisa.
-- ---------------------------------------------------------------------
CREATE TABLE avisos_lidos (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL,
  aviso_id        uuid NOT NULL,
  lido_em         timestamptz NOT NULL DEFAULT now(),

  -- A ordem das colunas e a pergunta que a tabela responde: "o que EU ja li".
  -- Com o usuario antes do aviso, essa pergunta e um prefixo do indice.
  PRIMARY KEY (organizacao_id, usuario_id, aviso_id),

  CONSTRAINT lido_usuario_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, usuario_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT,

  /*
    CASCADE, e aqui ele e correto: quando o aviso e expurgado por idade, a
    marca de leitura dele perde o objeto e nao significa mais nada. Deixar a
    marca orfa seria guardar "fulano leu alguma coisa em tal dia" depois de a
    coisa ter sido descartada, que e exatamente o registro de comportamento
    sem finalidade que a retencao existe para nao acumular.
  */
  CONSTRAINT lido_aviso_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, aviso_id)
    REFERENCES avisos (organizacao_id, id) ON DELETE CASCADE
);

-- Sem este indice o expurgo de um aviso varre a tabela inteira de leituras
-- para achar o que cascatear, e o expurgo roda junto com a consulta do sino.
CREATE INDEX avisos_lidos_por_aviso_idx ON avisos_lidos (organizacao_id, aviso_id);

ALTER TABLE avisos_lidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos_lidos FORCE ROW LEVEL SECURITY;

/*
  A policy separa por MUNICIPIO, e a rota separa por PESSOA.

  Nao existe `app.usuario_atual` neste banco, so `app.organizacao_atual`, entao
  o RLS nao tem como distinguir uma pessoa da outra dentro do mesmo municipio.
  Quem faz esse recorte e a consulta da rota, sempre com o usuario do token
  verificado. E aceitavel porque o que vaza no pior caso e "o colega ja viu
  este aviso", dentro da mesma coordenadoria, e nao dado de cidadao.
*/
CREATE POLICY avisos_lidos_leitura ON avisos_lidos FOR SELECT
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY avisos_lidos_insercao ON avisos_lidos FOR INSERT
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  NEM UPDATE NEM DELETE, e as duas ausencias sao decisao.

  Ler nao se desfaz: "marcar como nao lido" seria um recurso de conforto que
  custaria a unica garantia util aqui, que e a de que o sino de cada um conta a
  historia do que aquela pessoa realmente viu.

  E a marca nao se apaga por rota: ela some quando o aviso some, por idade, e
  por mais nenhum caminho. Sem isso, alguem que quisesse esconder que foi
  avisado de um prazo vencido teria por onde.
*/

COMMENT ON TABLE avisos_lidos IS
  'Quem leu qual aviso, e quando. Separada de avisos porque o mesmo fato e '
  'visto por varias pessoas e cada uma le no seu tempo.';

-- ---------------------------------------------------------------------
-- Privilegios do papel de aplicacao.
--
-- DELETE em `avisos` esta concedido, e a idade que limita o que ele alcanca
-- esta na policy `avisos_expurgo` logo acima. Sem UPDATE em lugar nenhum:
-- aviso e fato, e leitura nao se desfaz.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON avisos TO dc360_app;
GRANT SELECT, INSERT ON avisos_lidos TO dc360_app;

-- ---------------------------------------------------------------------
-- De onde vem o fato: gatilhos, e nao chamadas espalhadas pelas rotas.
--
-- POR QUE GATILHO. Porque uma chamada na rota e uma chamada que a proxima
-- rota esquece. O fato "a vistoria chegou" acontece hoje pela rota de
-- sincronizacao e amanha pode acontecer por uma importacao, por um script de
-- correcao ou por uma segunda rota. Amarrado a tabela, o aviso nasce de
-- qualquer caminho que crie a vistoria, inclusive dos que ainda nao existem.
--
-- POR QUE NAO SAO `SECURITY DEFINER`. Porque elas nao precisam ser: rodam
-- dentro da transacao de quem escreveu, que ja tem o municipio no contexto.
-- Com isso a policy de insercao de `avisos` continua valendo, e um gatilho
-- nao vira porta para escrever aviso em municipio alheio. O produto tem doze
-- funcoes privilegiadas e um portao que reprova a decima terceira; gastar uma
-- vaga desse orcamento com algo que funciona sem privilegio seria desperdicio
-- de uma excecao que existe para o login.
--
-- O `prazo_vencido` nao esta aqui, e nao poderia estar: ele nao e disparado
-- por escrita nenhuma, e sim pela passagem do tempo. Quem o materializa e a
-- propria rota do sino, e o porque esta escrito em `apps/api/src/rotas/avisos.ts`.
-- ---------------------------------------------------------------------

CREATE FUNCTION aviso_de_vistoria_recebida() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  /*
    O fato e a CHEGADA da vistoria ao servidor, e por isso o gatilho e na
    insercao da vistoria e nao na mudanca de status da ocorrencia. Sao coisas
    diferentes: o agente pode sincronizar uma coleta feita ha horas, e o que
    interessa ao coordenador e que ela chegou agora.

    `DO NOTHING` no conflito porque reenvio da mesma coleta e o normal do
    trabalho offline. A vistoria em si ja tem a propria chave de idempotencia
    (migracao 004); esta e a defesa do sino, do lado dele.
  */
  INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
  VALUES (NEW.organizacao_id, 'vistoria_recebida', NEW.ocorrencia_id,
          'vistoria:' || NEW.id::text)
  ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER vistoria_toca_o_sino
  AFTER INSERT ON vistorias
  FOR EACH ROW EXECUTE FUNCTION aviso_de_vistoria_recebida();

CREATE FUNCTION aviso_de_providencia_respondida() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  /*
    So na TRANSICAO de sem resposta para com resposta. Sem esta condicao,
    qualquer correcao de texto na resposta ja registrada tocaria o sino de
    novo, e o coordenador aprenderia a ignorar o sino, que e a unica forma de
    quebrar este recurso de vez.
  */
  IF NEW.respondida_em IS NOT NULL AND OLD.respondida_em IS NULL THEN
    INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
    VALUES (NEW.organizacao_id, 'providencia_respondida', NEW.ocorrencia_id,
            'providencia:' || NEW.id::text)
    ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER providencia_respondida_toca_o_sino
  AFTER UPDATE ON providencias
  FOR EACH ROW EXECUTE FUNCTION aviso_de_providencia_respondida();
