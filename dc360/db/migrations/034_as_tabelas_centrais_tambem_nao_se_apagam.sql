-- =====================================================================
-- 034: o mesmo defeito das 032 e 033, agora nas tabelas centrais, as que
--      guardam a prova que o municipio leva para uma audiencia.
--
-- `CREATE POLICY` sem clausula `FOR` vale `FOR ALL`, ou seja, autoriza SELECT,
-- INSERT, UPDATE **e DELETE**. Escrita assim, a unica coisa que impede o
-- apagamento e a ausencia de `GRANT DELETE`, e ai a barreira e UMA. As 032 e
-- 033 corrigiram quatro tabelas (`vistoria_evidencias_perdidas`,
-- `saidas_a_campo`, `vistoria_orgaos_indicados` e `devolucoes_de_tarefa`) e
-- deixaram anotado que o defeito e mais velho que elas: veio da 001, e toda
-- migracao seguinte que criou tabela repetiu a forma.
--
-- Esta migracao fecha as dezesseis que sobraram, e elas sao as do meio do
-- produto: `ocorrencias`, `vistorias`, `evidencias`, `providencias`, mais o
-- cadastro (`organizacoes`, `usuarios`, `equipes`, `orgaos`), as sequencias
-- que numeram documento oficial (`protocolo_sequencias`, `oficio_sequencias`),
-- as credenciais (`sessoes`, `recuperacoes_senha`, `segundo_fator`,
-- `segundo_fator_recuperacao`) e o rastro de envio de oficio
-- (`oficio_envios`), mais o cadastro de aparelho (`aparelhos`).
--
-- ---------------------------------------------------------------------
-- A DIFERENCA PARA AS 032 E 033, E ELA E O CUIDADO DESTA MIGRACAO
-- ---------------------------------------------------------------------
--
-- As quatro tabelas de la eram append-only: recortar em `FOR SELECT` e
-- `FOR INSERT` bastava. Estas NAO sao. Ocorrencia muda de status, laudo e
-- emitido, coordenada errada e corrigida, sessao e revogada, orgao e
-- desativado com motivo, sequencia de protocolo e incrementada. Tirar o UPDATE
-- daqui quebraria o produto inteiro.
--
-- Entao o recorte e outro: `FOR SELECT` + `FOR INSERT` + `FOR UPDATE`, com a
-- MESMA expressao de isolamento que a policy `ALL` tinha, e nunca `FOR ALL`.
-- O que some e so o DELETE, que nenhuma delas jamais usou.
--
-- `USING` e `WITH CHECK` com a mesma condicao no UPDATE, como na 032: a linha
-- precisa ser do municipio do contexto antes e depois da escrita, senao um
-- UPDATE poderia empurrar a linha para fora da propria parede.
--
-- ---------------------------------------------------------------------
-- O QUE FOI CONFERIDO ANTES DE APERTAR, porque apertar cedo derruba caminho
-- ---------------------------------------------------------------------
--
-- 1. Nenhuma destas dezesseis tabelas e alvo de `DELETE` em lugar nenhum do
--    codigo. A varredura por `DELETE FROM` em `apps/api/src`, `apps/web/src`,
--    `packages/`, `db/src`, `db/seeds` e nas proprias migracoes devolve tres
--    ocorrencias, e nenhuma delas e destas tabelas:
--      - `avisos`, em `apps/api/src/rotas/avisos.ts`, que tem policy
--        `FOR DELETE` propria e deliberada (018), com a idade minima DENTRO da
--        policy;
--      - `notificacoes_enviadas`, no expurgo por retencao da 016;
--      - a fila local em SQLite do aplicativo de campo, que nao e este banco.
--
-- 2. Nenhuma delas tem `GRANT DELETE` para papel nenhum. As concessoes sao
--    `SELECT, INSERT, UPDATE` (001, 002, 005, 016, 017, 022) ou mais estreitas
--    ainda, por coluna (`oficio_envios`, nas 017 e 027).
--
-- 3. Nenhuma das policies substituidas e usada por papel que nao seja o de
--    aplicacao: todas as dezesseis foram criadas sem clausula `TO`, entao
--    valem para PUBLIC, e o unico outro papel do banco e o
--    `dc360_console`, que tem privilegio em duas tabelas so
--    (`metricas_municipio` e `organizacoes`) e le pelas policies proprias
--    dele, criadas na 023 com `FOR SELECT TO dc360_console`, que esta migracao
--    nao toca. `organizacoes` e a unica tabela desta lista onde as duas
--    convivem, e continuam convivendo igual.
--
-- ---------------------------------------------------------------------
-- O CENARIO CONCRETO, o mesmo das 032 e 033, agora com o estrago maior
-- ---------------------------------------------------------------------
--
-- Uma migracao futura escreve `GRANT DELETE` por engano, ou o mais banal de
-- todos, `GRANT ALL ON ALL TABLES IN SCHEMA public TO dc360_app` num script de
-- conveniencia. Com policy `ALL`, no dia seguinte:
--
--   - `ocorrencias` some, e some com a trilha dela apontando para um protocolo
--     que nao existe mais. A trilha e append-only e continua la, orfa: o
--     municipio fica com a prova de que houve um chamado e sem o chamado.
--   - `vistorias` e `evidencias` somem, e o laudo assinado pela moradora fica
--     sem a foto que ele descreve. Numa audiencia, a foto ausente nao e
--     neutra: ela vira a palavra do municipio contra a do morador.
--   - `protocolo_sequencias` some, e o contador volta a zero. O proximo
--     registro reusa um numero de protocolo ja entregue por escrito a um
--     cidadao, e dois processos diferentes passam a ter o mesmo numero.
--   - `sessoes` some, e "de qual aparelho essa conta entrou" deixa de ter
--     resposta justamente quando alguem precisa investigar um acesso indevido.
--
-- NADA MUDA para a aplicacao: ela le, insere e atualiza estas tabelas, e as
-- policies novas dizem exatamente o que a antiga dizia para esses tres
-- comandos. O que muda e o que acontece no dia em que a concessao mudar por
-- engano.
--
-- Migracao nova, e nao edicao das que criaram as tabelas, pela regra do
-- proprio aplicador (`HistoricoAlterado` em `db/src/migrar.ts`): migracao ja
-- commitada nao se reescreve, senao o banco de quem ja rodou diverge do de
-- producao em silencio.
--
-- FICAM DE FORA, e cada uma por um motivo escrito:
--   - `trilha_eventos`, `trilha_administrativa`, `exportacoes`, `oficios`,
--     `oficio_aberturas`, `avisos_lidos`, `ocorrencia_consultas`,
--     `metricas_municipio` e `notificacoes_enviadas`: ja nasceram recortadas
--     por comando;
--   - as quatro das 032 e 033: ja corrigidas;
--   - `avisos`: tem policy `FOR DELETE` DELIBERADA (018), com o limite de
--     idade dentro da propria policy, e o produto apaga aviso velho por ali;
--   - `interesse_municipio`: policy `FOR INSERT` so, e a tabela e anterior ao
--     municipio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 001: o nucleo
-- ---------------------------------------------------------------------

/*
  `organizacoes` e a raiz do tenant, entao a condicao dela e sobre `id`, e nao
  sobre `organizacao_id`. Apagar a linha da organizacao seria apagar o
  municipio inteiro por efeito cascata, que e o pior desfecho possivel deste
  banco. Municipio que sai leva a copia e e desativado, conforme
  `docs/SAIDA-DE-MUNICIPIO.md`, e a saida nao e um DELETE.
*/
DROP POLICY organizacoes_isolamento ON organizacoes;

CREATE POLICY organizacoes_leitura ON organizacoes
  FOR SELECT USING (id = app_organizacao_atual());

CREATE POLICY organizacoes_insercao ON organizacoes
  FOR INSERT WITH CHECK (id = app_organizacao_atual());

CREATE POLICY organizacoes_atualizacao ON organizacoes
  FOR UPDATE
  USING (id = app_organizacao_atual())
  WITH CHECK (id = app_organizacao_atual());

/*
  Equipe nao se apaga, se desativa: ela assina devolucao de tarefa e aparece
  na trilha. Apagada, a devolucao guardada em `devolucoes_de_tarefa` (que a
  033 tornou de verdade append-only) passa a apontar para uma equipe que
  ninguem consegue nomear.
*/
DROP POLICY equipes_isolamento ON equipes;

CREATE POLICY equipes_leitura ON equipes
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY equipes_insercao ON equipes
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY equipes_atualizacao ON equipes
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Usuario se desativa, nunca some, e a regra ja esta escrita no CLAUDE.md pelo
  motivo que vale aqui: ele assina laudo e aparece na trilha. A trilha guarda o
  nome por copia, de proposito, mas o laudo aponta para o id: sem a linha, o
  documento passa a ser assinado por ninguem.
*/
DROP POLICY usuarios_isolamento ON usuarios;

CREATE POLICY usuarios_leitura ON usuarios
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY usuarios_insercao ON usuarios
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY usuarios_atualizacao ON usuarios
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A sequencia de protocolo e a unica linha que sabe qual foi o ultimo numero
  entregue. Apagada, o contador reinicia e o municipio emite de novo um
  protocolo que ja esta na mao de um cidadao. O UPDATE fica, porque incrementar
  e o que ela existe para fazer.
*/
DROP POLICY protocolo_sequencias_isolamento ON protocolo_sequencias;

CREATE POLICY protocolo_sequencias_leitura ON protocolo_sequencias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY protocolo_sequencias_insercao ON protocolo_sequencias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY protocolo_sequencias_atualizacao ON protocolo_sequencias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Ocorrencia nao se apaga, se encerra com motivo: e a regra numero dois deste
  produto, e ate agora ela dependia de nao existir concessao. O UPDATE continua
  inteiro, porque status muda, endereco se corrige e o encerramento e uma
  escrita nesta linha.
*/
DROP POLICY ocorrencias_isolamento ON ocorrencias;

CREATE POLICY ocorrencias_leitura ON ocorrencias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY ocorrencias_insercao ON ocorrencias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY ocorrencias_atualizacao ON ocorrencias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A vistoria e o que o agente viu no local, embaixo da assinatura do morador, e
  e a peca que o laudo transcreve. O UPDATE existe porque o laudo e emitido
  depois (data, emissor, assinatura) e porque coordenada de GPS ruim se
  corrige.
*/
DROP POLICY vistorias_isolamento ON vistorias;

CREATE POLICY vistorias_leitura ON vistorias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY vistorias_insercao ON vistorias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY vistorias_atualizacao ON vistorias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A evidencia e a foto. Apagar a linha desliga o laudo do arquivo no
  armazenamento, e o documento que diz "ver foto 3" fica com duas. A declaracao
  de foto PERDIDA ja e append-only desde a 032: seria incoerente proteger o
  registro da ausencia e deixar a presenca apagavel.
*/
DROP POLICY evidencias_isolamento ON evidencias;

CREATE POLICY evidencias_leitura ON evidencias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY evidencias_insercao ON evidencias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY evidencias_atualizacao ON evidencias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A providencia e o encaminhamento com prazo, e ela e a resposta a pergunta
  "o municipio avisou quem tinha que avisar". O oficio emitido aponta para ela
  com chave estrangeira; o UPDATE fica para a resposta do orgao chegar.
*/
DROP POLICY providencias_isolamento ON providencias;

CREATE POLICY providencias_leitura ON providencias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY providencias_insercao ON providencias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY providencias_atualizacao ON providencias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- 002 e 005: as credenciais de entrada
-- ---------------------------------------------------------------------

/*
  Sessao se revoga, e revogar ja e UPDATE (`revogar_sessao` e
  `revogar_sessoes_do_usuario`, na 002). Apagar a linha apagaria de qual
  aparelho e a que horas a conta entrou, que e a primeira pergunta de qualquer
  investigacao de acesso indevido, e apagaria junto o rastro de reuso de token
  que a 002 usa para derrubar familia de sessao roubada.
*/
DROP POLICY sessoes_isolamento ON sessoes;

CREATE POLICY sessoes_leitura ON sessoes
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY sessoes_insercao ON sessoes
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY sessoes_atualizacao ON sessoes
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A recuperacao de senha e consumida marcando `usada_em`, e nao sumindo: e
  assim que o produto recusa o segundo uso do mesmo link. Apagada, o link
  gasto volta a ser um link que ninguem conhece, e "quem pediu troca de senha
  desta conta, e quando" fica sem resposta.
*/
DROP POLICY recuperacoes_isolamento ON recuperacoes_senha;

CREATE POLICY recuperacoes_leitura ON recuperacoes_senha
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY recuperacoes_insercao ON recuperacoes_senha
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY recuperacoes_atualizacao ON recuperacoes_senha
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- 016: o aparelho do agente
-- ---------------------------------------------------------------------

/*
  "Aparelho nao se apaga, se revoga" ja e frase de teste desde a 016, e ate
  agora quem a sustentava era so a ausencia de concessao. A notificacao enviada
  aponta para o aparelho: apagada a linha, a resposta de suporte a "esse aviso
  chegou no aparelho de quem" vai junto.
*/
DROP POLICY aparelhos_isolamento ON aparelhos;

CREATE POLICY aparelhos_leitura ON aparelhos
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY aparelhos_insercao ON aparelhos
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY aparelhos_atualizacao ON aparelhos
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- 017: o orgao, a sequencia do oficio e a tentativa de envio
-- ---------------------------------------------------------------------

/*
  Orgao nao se apaga, se desativa com motivo, e o CHECK
  `desativacao_de_orgao_exige_motivo` da 017 cobra o motivo. Apagado, todo
  oficio ja emitido para ele perde o destinatario, e o laudo que manda
  "acionar a Secretaria de Obras" passa a citar um cadastro que nao existe.
*/
DROP POLICY orgaos_isolamento ON orgaos;

CREATE POLICY orgaos_leitura ON orgaos
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY orgaos_insercao ON orgaos
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY orgaos_atualizacao ON orgaos
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Mesma razao da sequencia de protocolo, e aqui o numero reusado sai impresso
  em papel timbrado: o oficio 000012/2026 que o Corpo de Bombeiros tem na mao
  passaria a existir duas vezes, com dois conteudos.
*/
DROP POLICY oficio_sequencias_isolamento ON oficio_sequencias;

CREATE POLICY oficio_sequencias_leitura ON oficio_sequencias
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY oficio_sequencias_insercao ON oficio_sequencias
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY oficio_sequencias_atualizacao ON oficio_sequencias
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Uma linha por tentativa de envio: e o que responde "o municipio mandou o
  oficio, para qual endereco, e o provedor entregou". O UPDATE ja e estreito
  por privilegio de coluna (`desfecho` e `detalhe` na 017, `provedor_id` na
  027), e continua sendo. O que sai e a possibilidade de apagar a tentativa
  que deu errado, que e justamente a que alguem teria interesse em sumir.
*/
DROP POLICY oficio_envios_isolamento ON oficio_envios;

CREATE POLICY oficio_envios_leitura ON oficio_envios
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY oficio_envios_insercao ON oficio_envios
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY oficio_envios_atualizacao ON oficio_envios
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

-- ---------------------------------------------------------------------
-- 022: o segundo fator
-- ---------------------------------------------------------------------

/*
  A 022 escreveu, em comentario, "NAO EXISTE POLICY DE DELETE, e a ausencia e a
  decisao", e a policy era `ALL`. Desligar o segundo fator ja e UPDATE: apaga o
  segredo e marca `desativado_em`, e o CHECK `segredo_coerente_com_a_situacao`
  cobra o par. Apagar a linha responderia "esta conta nunca teve segundo
  fator", que e diferente de "foi desligado no dia tal".
*/
DROP POLICY segundo_fator_isolamento ON segundo_fator;

CREATE POLICY segundo_fator_leitura ON segundo_fator
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY segundo_fator_insercao ON segundo_fator
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY segundo_fator_atualizacao ON segundo_fator
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Codigo de recuperacao gasto e marcado (`usado_em`) ou derrubado em bloco
  (`invalidado_em`), e a 022 diz por escrito por que ele nao some: a frase da
  tela ("voce ainda tem N codigos") depende disso, e sem a linha ninguem
  distingue "eu usei tres" de "alguem usou tres por mim".
*/
DROP POLICY segundo_fator_recuperacao_isolamento ON segundo_fator_recuperacao;

CREATE POLICY segundo_fator_recuperacao_leitura ON segundo_fator_recuperacao
  FOR SELECT USING (organizacao_id = app_organizacao_atual());

CREATE POLICY segundo_fator_recuperacao_insercao ON segundo_fator_recuperacao
  FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY segundo_fator_recuperacao_atualizacao ON segundo_fator_recuperacao
  FOR UPDATE
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());
