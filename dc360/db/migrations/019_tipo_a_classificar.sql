-- =====================================================================
-- 019: o tipo "outro", que o esquema aceitava e o banco recusava.
--
-- O DEFEITO, e ele estava aberto no meio do caminho.
--
-- `aberturaOcorrenciaSchema` passou a aceitar `tipo` igual a "outro", com uma
-- descricao obrigatoria junto (`tipoDescricao`). A restricao CHECK desta
-- tabela continuou com os oito nomes da COBRADE. O resultado era um chamado
-- que passava pelo Zod e morria no INSERT com SQLSTATE 23514: o operador de
-- plantao, com a pessoa na linha, recebia "erro inesperado, informe o codigo
-- ao suporte" em vez de uma frase dizendo o que corrigir.
--
-- E havia o segundo lado, pior porque silencioso: nao existia coluna para
-- `tipoDescricao`. O texto que o operador digitasse (a unica coisa que torna a
-- reclassificacao possivel na triagem) seria descartado sem aviso nenhum.
--
-- -------------------------------------------------------------------
-- POR QUE "outro" ENTRA NO BANCO E NAO ENTRA NA COBRADE
-- -------------------------------------------------------------------
--
-- A COBRADE e fechada e nao se inventa nome dentro dela. "outro" nao e uma
-- nona categoria: e a confissao de que a decisao tecnica ainda nao foi tomada.
--
-- Quem atende o telefone tem minutos e nao tem competencia tecnica para
-- separar enxurrada de alagamento. Obrigado a escolher um dos oito, ele
-- escolhe o menos errado, e isso nao produz dado incompleto, produz dado
-- FALSO: "vendaval, dez chamados", dos quais tres eram outra coisa, e um
-- numero que ninguem pode usar e que ninguem sabe que nao pode usar. A lacuna
-- e melhor que a mentira, porque a lacuna se ve.
--
-- -------------------------------------------------------------------
-- AS TRES RESTRICOES, e o que cada uma impede
-- -------------------------------------------------------------------
--
-- Elas seguem o padrao que ja existe nesta tabela para o encerramento
-- (`status <> 'encerrada' OR motivo_encerramento IS NOT NULL`) e para a
-- vulnerabilidade: a regra que garante coerencia mora no banco, porque no
-- banco ela vale para toda escrita, inclusive a que alguem fizer amanha por
-- um caminho que ainda nao existe.
--
--   1. "outro" EXIGE descricao. Sem ela, a triagem abre um chamado que diz
--      "Outro" e nada mais, e a decisao tecnica que a triagem existe para
--      tomar fica sem materia prima.
--
--   2. Tipo da COBRADE NAO pode ter descricao. Sem isto o campo vira lixeira
--      de anotacao paralela: um lugar livre dentro de um registro estruturado,
--      preenchido com o que nao coube em outro lugar, que ninguem le e que
--      ninguem sabe que existe. E o mesmo motivo de a coluna ser limpa na
--      reclassificacao (ver abaixo).
--
--   3. "outro" NAO PASSA DO DESPACHO. Esta e a regra de negocio de verdade, e
--      a razao dela e o sistema nacional: a taxonomia existe para o dado do
--      municipio conversar com o resto do pais, e uma ocorrencia que fica
--      "outro" para sempre e dado perdido. Sem este portao, "outro" atravessa
--      o fluxo inteiro ate o laudo, e o documento oficial sai com brasao,
--      assinatura e a palavra "Outro" no campo do tipo. Depois do despacho
--      ninguem volta para classificar.
--
-- ONDE O PORTAO TRAVA, e por que nao e na abertura nem na triagem:
--
--   * Na ABERTURA nao, porque recusar ali devolve o problema para quem esta ao
--     telefone com a pessoa, que e justamente quem nao sabe responder. Era
--     esse o estado anterior, e era ele que produzia a classificacao falsa.
--   * Na TRIAGEM nao, porque a triagem pode acontecer em duas etapas (severidade
--     agora, tipo quando alguem olhar a foto) e exigir tudo de uma vez faria a
--     classificacao apressada voltar pela outra porta.
--   * No DESPACHO sim: e o ultimo instante em que alguem olha o chamado inteiro
--     antes de a equipe sair, e e o primeiro estado a partir do qual existe
--     laudo. `precisaReclassificar`, no pacote compartilhado, e a mesma regra
--     dita para a tela e para a rota, com a frase que o coordenador le.
--
-- `encerrada` fica DE FORA do portao, e nao por descuido: um chamado
-- improcedente ("era poda de arvore, ja resolvido") e encerrado sem nunca ter
-- sido classificado, e obrigar uma classificacao COBRADE para poder encerrar
-- produziria exatamente o dado falso que esta migracao existe para acabar.
-- =====================================================================

ALTER TABLE ocorrencias ADD COLUMN tipo_descricao text;

COMMENT ON COLUMN ocorrencias.tipo_descricao IS
  'O que foi relatado, em poucas palavras, quando o chamado entrou como '
  '"outro". Existe somente enquanto o tipo for "outro": a reclassificacao na '
  'triagem limpa a coluna, e o texto continua legivel na trilha do evento.';

ALTER TABLE ocorrencias DROP CONSTRAINT ocorrencias_tipo_check;

ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencias_tipo_check CHECK (tipo IN (
  'deslizamento','inundacao','alagamento','enxurrada',
  'vendaval','granizo','colapso_edificacao','incendio_urbano',
  'outro'));

/*
  O piso de dez caracteres do `aberturaOcorrenciaSchema` NAO e repetido aqui,
  e a omissao e deliberada: e a mesma divisao de trabalho do motivo de
  desinterdicao, cujo minimo de quinze caracteres mora no Zod e cuja
  obrigatoriedade mora no banco. O que o banco garante e a COERENCIA (nao
  existe "outro" mudo, nem descricao orfa); a regua de qualidade do texto e do
  formulario, onde ela pode explicar ao operador o que falta.
*/
ALTER TABLE ocorrencias ADD CONSTRAINT tipo_a_classificar_exige_descricao CHECK (
  tipo <> 'outro'
  OR (tipo_descricao IS NOT NULL AND length(trim(tipo_descricao)) > 0)
);

ALTER TABLE ocorrencias ADD CONSTRAINT tipo_da_cobrade_nao_guarda_descricao CHECK (
  tipo = 'outro' OR tipo_descricao IS NULL
);

ALTER TABLE ocorrencias ADD CONSTRAINT tipo_a_classificar_nao_passa_do_despacho CHECK (
  tipo <> 'outro'
  OR status IN ('rascunho','registrada','triagem','encerrada')
);
