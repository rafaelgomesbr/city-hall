-- =====================================================================
-- 027: o oficio passa a guardar o RECIBO que o provedor de email devolve.
--
-- O DEFEITO QUE ESTA MIGRACAO FECHA aparece meses depois do envio, numa
-- conversa que nao tem como terminar. O orgao diz que nao recebeu o oficio.
-- O municipio abre a tela do oficio e le `desfecho = entregue`, escrito pelo
-- proprio sistema, com base em nada mais do que "a chamada HTTP nao deu erro".
-- Palavra contra palavra, e a palavra do municipio vale menos, porque e ele
-- quem tem interesse no assunto.
--
-- Provedor transacional devolve um identificador da mensagem aceita. Com ele
-- guardado, a resposta deixa de ser opiniao: o municipio abre o painel do
-- provedor, procura aquele identificador e le o que aconteceu com a mensagem
-- depois que ela saiu daqui (entregue, recusada pelo servidor do destino,
-- parada na caixa de spam). Sem ele, essa consulta nao tem por onde comecar,
-- porque o painel do provedor lista milhares de mensagens por dia.
--
-- POR QUE COLUNA NOVA, E NAO `detalhe`.
--
-- `detalhe` ja existe e tem dono declarado na 017: "o que o provedor
-- respondeu, e nada mais", e na pratica ela so e preenchida quando o envio
-- FALHA, com um pedaco de texto livre truncado em 500 caracteres. Enfiar o
-- identificador ali significaria procurar recibo com LIKE dentro de mensagem
-- de erro, o que e exatamente o tipo de consulta que funciona ate o dia em que
-- o provedor muda o texto do erro. Identificador e chave de busca, entao ele
-- tem coluna propria, com indice.
--
-- POR QUE ELA E ANULAVEL, E CONTINUA SENDO.
--
-- Tres casos legitimos deixam a coluna vazia, e nenhum deles e erro:
--
--   1. As linhas que ja existem no banco, enviadas antes desta migracao.
--   2. Envio que falhou: nao houve mensagem aceita, logo nao ha recibo.
--   3. Canal que nao devolve identificador (o notificador de log e o de
--      arquivo, usados fora de producao).
--
-- Obrigatoria, ela transformaria qualquer um dos tres em erro de banco no meio
-- do registro do desfecho, e o registro do desfecho e justamente a parte que
-- nao pode falhar: e ele que conta a verdade sobre a tentativa.
-- =====================================================================

ALTER TABLE oficio_envios
  ADD COLUMN provedor_id text
    CONSTRAINT provedor_id_plausivel CHECK (
      provedor_id IS NULL
      OR (length(provedor_id) BETWEEN 1 AND 200 AND provedor_id !~ '[[:space:]]')
    );

COMMENT ON COLUMN oficio_envios.provedor_id IS
  'Identificador que o provedor de email devolveu ao aceitar a mensagem. '
  'Nulo quando o envio falhou, quando o canal nao devolve identificador, ou '
  'nas linhas anteriores a migracao 027. NUNCA carrega o token do link.';

/*
  O teto de 200 caracteres e o "sem espaco em branco" nao sao decoracao.

  Esta coluna e escrita a partir do corpo de uma resposta HTTP de terceiro. Se
  um dia o provedor devolver, no lugar do identificador, um pedaco de HTML de
  pagina de erro ou o eco do pedido inteiro, a checagem recusa a gravacao em
  vez de aceitar texto arbitrario numa coluna que o suporte le e cola em
  ticket. O identificador de um provedor transacional e um UUID ou um token
  curto: 200 caracteres sobram, e espaco em branco nunca aparece nele.

  E a razao mais importante: o eco do pedido inteiro carregaria o LINK DE USO
  UNICO do oficio, que e credencial viva por 72 horas e da acesso ao dossie de
  uma familia. Esta coluna e lida pelo suporte e sai no pacote de saida do
  municipio. Um CHECK e uma barreira mais dificil de esquecer do que uma
  validacao em TypeScript que alguem refatora.
*/

-- Procurar pelo recibo e a consulta que esta coluna existe para permitir: o
-- suporte recebe o identificador numa pergunta ("o provedor diz que a mensagem
-- X foi recusada, de quem era?") e precisa chegar no oficio. Sem indice isso
-- passa a tabela inteira. Parcial porque a maioria esmagadora das linhas ou
-- ainda nao tem recibo ou falhou, e indice de nulo nao serve para nada.
CREATE INDEX oficio_envios_provedor_id_idx
  ON oficio_envios (organizacao_id, provedor_id)
  WHERE provedor_id IS NOT NULL;

/*
  A CONCESSAO, e por que ela e por COLUNA.

  A 017 decidiu que o papel de aplicacao INSERE e LE a linha inteira de
  `oficio_envios`, mas so pode ATUALIZAR `desfecho` e `detalhe`. A razao vale
  igual aqui: tudo o mais na linha (para quem foi, quando, quem pediu, o hash
  do token, quando expira) e registro do ato e nao pode ser reescrito depois
  por uma rota nova que alguem escreva sem lembrar disto.

  `provedor_id` entra na mesma lista pela mesma porta, e nao por GRANT UPDATE
  na tabela: o recibo chega DEPOIS da linha existir (a linha nasce antes da
  chamada ao provedor, de proposito, para que a tentativa exista mesmo se o
  processo morrer no meio), entao ele precisa de UPDATE. Uma coluna, nomeada,
  e nao a tabela.
*/
GRANT UPDATE (provedor_id) ON oficio_envios TO dc360_app;
