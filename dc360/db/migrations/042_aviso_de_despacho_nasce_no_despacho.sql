-- =====================================================================
-- 042: o aviso de tarefa nova nasce no despacho, e a porta de INSERT que a
--      migracao 016 deixou fechada de proposito abre aqui, estreita.
--
-- O PEDIDO, NA LETRA DE QUEM PAGA (15/09/2026)
--
-- "O principal aqui, o celular do usuario agente de campo, deve
-- obrigatoriamente ser notificado, vibrado ou sonoro, que ele recebeu uma
-- nova ocorrencia, com som caracteristico."
--
-- O QUE FALTAVA. O som e a carga do aviso de tarefa nova existiam
-- (`apps/api/src/push/mensagem.ts`, `apns.ts`, `fcm.ts`), e o servidor NUNCA
-- produzia `tarefa_nova`. O unico push que saia era `prazo_vencendo`, pelo
-- relogio. A rota `POST /ocorrencias/:id/despacho` gravava o despacho e o
-- evento na trilha e nao enfileirava aviso nenhum. A propria 016 tinha deixado
-- escrito, antes do GRANT: "Quando o aviso de tarefa nova entrar (ele nasce no
-- despacho, dentro do contexto do municipio), quem o escrever concede o INSERT
-- na propria migracao, de forma deliberada." Esta e essa migracao.
--
-- =====================================================================
-- O DESENHO, EM UMA FRASE
--
-- O despacho ENFILEIRA (uma linha `tarefa_nova` em estado `pendente` por
-- aparelho vivo de cada usuario ativo da equipe, dentro da MESMA transacao que
-- grava o despacho e o evento na trilha), e o relogio ENVIA (a funcao
-- `varrer_tarefas_novas`, abaixo, reivindica as pendentes na mesma rodada, sob
-- a mesma trava e com o mesmo tratamento de ficha morta do aviso de prazo).
--
-- Por que nao enviar direto da rota, ja que a rota sabe tudo? Porque a rota
-- responde ao coordenador em milissegundos e a Apple e o Google respondem
-- quando querem. Um provedor fora do ar nao pode segurar o despacho, e o
-- despacho nao pode ser "gravado" e o aviso perdido quando o processo cai
-- entre uma coisa e outra. Linha no banco, na mesma transacao, e a unica forma
-- de "despachou, entao avisa" ser verdade mesmo com o processo morrendo no
-- meio: ou os dois entram, ou nenhum.
--
-- =====================================================================
-- O ESTADO INICIAL: `pendente`, E NAO `enviando`
--
-- `enviando` (016) e o estado REIVINDICADO: um processo esta falando com a
-- Apple ou com o Google agora, e o varredor so o retoma depois da espera (dez
-- minutos por padrao), porque antes disso pode ser so lentidao. Se o despacho
-- inserisse em `enviando`, todo aviso de despacho esperaria dez minutos para
-- sair, o que e o oposto do pedido.
--
-- `pendente` diz outra coisa: ninguem tentou ainda. A rodada seguinte (cinco
-- minutos, no pior caso) reivindica sem esperar nada. E `tentativas` passa a
-- aceitar zero, porque zero e o numero honesto de tentativas de uma linha que
-- ninguem tentou; a restricao amarra os dois, pendente se e somente se zero
-- tentativas, para o estado nao mentir nem por escrita futura.
--
-- =====================================================================
-- A UNICIDADE: A DA 016 BASTA, E O CUSTO ESTA ESCRITO
--
-- `notificacao_unica_por_aparelho` e `(organizacao_id, aparelho_id,
-- ocorrencia_id, tipo)`. Para `tarefa_nova` isso significa: um aparelho recebe
-- o aviso de uma ocorrencia UMA vez. Redespachar para a mesma equipe (clique
-- duplo, F5, segunda aba) cai no `ON CONFLICT DO NOTHING` da rota e nao gera
-- segunda linha. Redespachar para OUTRA equipe gera linha para os aparelhos da
-- equipe nova, que sao outros.
--
-- O custo aceito, por extenso: uma ocorrencia que vai da equipe Alfa para a
-- Bravo e VOLTA para a Alfa nao avisa a Alfa de novo, e uma tarefa devolvida
-- pela equipe (028) e redespachada para a mesma equipe tambem nao. Nos dois
-- casos a equipe ja foi avisada daquela ocorrencia uma vez, e o aplicativo a
-- mostra na lista. Trocar a chave por uma que conte despachos exigiria coluna
-- nova e mudaria a restricao de que `varrer_prazos` depende pelo nome; fica
-- como limitacao declarada, nao como surpresa.
--
-- =====================================================================
-- A PORTA E ESTREITA EM TRES DIRECOES
--
-- 1. Isolamento: a policy de INSERT exige o carimbo do municipio do contexto,
--    e as duas chaves estrangeiras compostas da 016 exigem que aparelho e
--    ocorrencia sejam desse mesmo municipio. RLS nao confere para onde a linha
--    aponta; a chave composta confere.
-- 2. Forma: a aplicacao SO ENFILEIRA. A policy aceita `tarefa_nova` em
--    `pendente` e mais nada. `entregue` escrito pela aplicacao seria ela
--    respondendo "voce foi avisado as 14h32" sem ter avisado ninguem, e essa
--    e a resposta que o suporte da ao agente. Aviso de prazo continua nascendo
--    so dentro de `varrer_prazos`, como antes.
-- 3. Nada de UPDATE ou DELETE novo: a policy de UPDATE da 016 continua sendo a
--    unica forma de registrar desfecho, e a de DELETE da 037 continua sendo so
--    o expurgo por idade.
--
-- =====================================================================
-- O QUE FICA `pendente` E NUNCA SAI, E POR QUE ISSO NAO E DEFEITO
--
-- A rodada so reivindica a pendente cujo aparelho continua vivo, cujo usuario
-- continua ativo E NA EQUIPE RESPONSAVEL HOJE, e cuja ocorrencia continua
-- aberta. E a regra da 016 ("a equipe responsavel hoje, conferida a cada
-- varredura"), pelo mesmo motivo: sem ela, a equipe que perdeu a tarefa para
-- outra nos minutos entre o despacho e a rodada receberia "a sua equipe
-- recebeu uma tarefa" sobre uma tarefa que ja nao e dela.
--
-- A pendente que nao passa nesse filtro fica `pendente`, sem desfecho, ate o
-- expurgo por idade da 016 (noventa dias). Nao ha estado "cancelada" porque
-- ninguem a cancelou: se o aparelho voltar a ser registrado e a equipe ainda
-- for a responsavel, ela sai. O indice parcial abaixo mantem essa fila pequena
-- e barata de varrer: a linha sai do indice quando vira `entregue` ou
-- `ficha_invalida`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O estado `pendente`, e zero tentativas para ele.
-- ---------------------------------------------------------------------
ALTER TABLE notificacoes_enviadas
  DROP CONSTRAINT notificacoes_enviadas_desfecho_check;

ALTER TABLE notificacoes_enviadas
  ADD CONSTRAINT notificacoes_enviadas_desfecho_check
  CHECK (desfecho IN ('pendente','enviando','entregue','falha','ficha_invalida'));

ALTER TABLE notificacoes_enviadas
  DROP CONSTRAINT notificacoes_enviadas_tentativas_check;

-- Pendente se e somente se zero tentativas. O caminho do prazo (016) continua
-- nascendo em `enviando` com uma tentativa, e a reivindicacao soma uma.
ALTER TABLE notificacoes_enviadas
  ADD CONSTRAINT notificacoes_enviadas_tentativas_check
  CHECK (tentativas >= 0 AND ((tentativas = 0) = (desfecho = 'pendente')));

COMMENT ON COLUMN notificacoes_enviadas.desfecho IS
  'pendente: enfileirada pelo despacho, ninguem tentou (042). enviando: reivindicada, '
  'em conversa com a Apple ou o Google. entregue, falha, ficha_invalida: o que o '
  'provedor respondeu.';

-- ---------------------------------------------------------------------
-- 2. A porta de INSERT, comando a comando, como as 032 a 034 fixaram.
--    Nunca `FOR ALL`. Sem policy nova de UPDATE nem de DELETE.
-- ---------------------------------------------------------------------
CREATE POLICY notificacoes_insercao ON notificacoes_enviadas
  FOR INSERT
  WITH CHECK (
    organizacao_id = app_organizacao_atual()
    AND tipo = 'tarefa_nova'
    AND desfecho = 'pendente'
  );

GRANT INSERT ON notificacoes_enviadas TO dc360_app;

-- ---------------------------------------------------------------------
-- 3. A fila do despacho, do tamanho da pergunta que a rodada faz.
-- ---------------------------------------------------------------------
CREATE INDEX notificacoes_tarefa_nova_a_enviar_idx
  ON notificacoes_enviadas (enviada_em)
  WHERE tipo = 'tarefa_nova' AND desfecho IN ('pendente','enviando','falha');

-- ---------------------------------------------------------------------
-- 4. A rodada que reivindica e devolve as pendentes.
--
-- Privilegiada pela mesma razao de `varrer_prazos` (016): o relogio roda sem
-- ninguem logado, entao nao ha municipio no contexto e o papel de aplicacao
-- nao enxergaria uma linha sequer. Mesma forma: sem municipio de parametro,
-- sem filtro escolhido por quem chama, sem dado de pessoa na saida. Esta
-- devolve MENOS que a irma: nem protocolo nem endereco, porque a notificacao
-- nao os leva (ver `mensagem.ts`, "severidade vai, protocolo e endereco nao")
-- e o que a funcao nao devolve nao tem como vazar.
--
-- `SET row_security = off`, como as funcoes da 038 e da 039: se o dono das
-- tabelas nao tiver BYPASSRLS, a escrita que seria filtrada em silencio vira
-- erro (armadilha da 037), e um erro aparece no log do varredor.
--
-- REIVINDICA E DEVOLVE NA MESMA CHAMADA, como a 016: o UPDATE marca `enviando`
-- ANTES de qualquer conversa com a Apple, e so devolve o que marcou. O
-- `FOR UPDATE SKIP LOCKED` fecha a fresta que sobra quando a trava de processo
-- cai (ver `trava.ts`): duas rodadas simultaneas nao reivindicam a mesma linha.
--
-- NAO EXPURGA: o expurgo por idade continua dentro de `varrer_prazos`, que
-- roda na mesma rodada. Dois expurgos por rodada seriam o mesmo DELETE duas
-- vezes.
-- ---------------------------------------------------------------------
CREATE FUNCTION varrer_tarefas_novas(
  p_espera              interval,
  p_tentativas_maximas  integer,
  p_teto                integer
)
RETURNS TABLE (
  notificacao_id  uuid,
  organizacao_id  uuid,
  aparelho_id     uuid,
  ficha           text,
  plataforma      text,
  ocorrencia_id   uuid,
  severidade      text,
  prazo_em        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  WITH alvos AS (
    SELECT n.id
      FROM notificacoes_enviadas n
      JOIN aparelhos ap
        ON ap.organizacao_id = n.organizacao_id
       AND ap.id = n.aparelho_id
       AND ap.revogado_em IS NULL
      /*
        A equipe RESPONSAVEL HOJE, conferida na rodada e nao so no despacho.
        Quem saiu da equipe, foi desativado, ou cuja equipe perdeu a tarefa
        para outra, deixa de casar com este JOIN e nao recebe.
      */
      JOIN usuarios u
        ON u.organizacao_id = ap.organizacao_id
       AND u.id = ap.usuario_id
       AND u.ativo
      JOIN ocorrencias o
        ON o.organizacao_id = n.organizacao_id
       AND o.id = n.ocorrencia_id
       AND o.equipe_id = u.equipe_id
       AND o.status NOT IN ('encerrada','rascunho')
     WHERE n.tipo = 'tarefa_nova'
       AND (
         n.desfecho = 'pendente'
         /*
           Quando reenviar, e quando nunca reenviar: a mesma regra da 016.
           `entregue` e `ficha_invalida` nunca voltam; `enviando` (o processo
           caiu no meio) e `falha` (o provedor recusou naquele instante)
           voltam depois da espera, ate o teto de tentativas.
         */
         OR (n.desfecho IN ('enviando','falha')
             AND n.enviada_em < now() - p_espera
             AND n.tentativas < p_tentativas_maximas)
       )
     ORDER BY n.enviada_em
     -- Teto por rodada, pelo mesmo motivo da 016: uma noite de temporal com
     -- dezenas de despachos nao vira uma rajada num laco so.
     LIMIT p_teto
       FOR UPDATE OF n SKIP LOCKED
  ),
  reivindicadas AS (
    UPDATE notificacoes_enviadas n
       SET desfecho   = 'enviando',
           enviada_em = now(),
           tentativas = n.tentativas + 1,
           detalhe    = NULL
      FROM alvos
     WHERE n.id = alvos.id
    RETURNING n.id, n.organizacao_id, n.aparelho_id, n.ocorrencia_id
  )
  SELECT r.id, r.organizacao_id, r.aparelho_id,
         ap.ficha, ap.plataforma, r.ocorrencia_id,
         o.severidade, o.prazo_em
    FROM reivindicadas r
    JOIN aparelhos ap ON ap.id = r.aparelho_id
    JOIN ocorrencias o ON o.id = r.ocorrencia_id;
$$;

-- A funcao e a unica porta, entao PUBLIC nao a executa. Mesma regra da 002.
REVOKE ALL ON FUNCTION varrer_tarefas_novas(interval, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION varrer_tarefas_novas(interval, integer, integer) TO dc360_app;

COMMENT ON FUNCTION varrer_tarefas_novas(interval, integer, integer) IS
  'Reivindica (marca enviando) e devolve os avisos de tarefa nova pendentes, ou '
  'falhos ja passada a espera, cujo aparelho esta vivo e cuja equipe ainda e a '
  'responsavel. Sem municipio de parametro; roda no relogio, sem ninguem logado.';
