-- =====================================================================
-- O que só o MODO DE DEMONSTRAÇÃO semeia, depois da semente compartilhada.
--
-- `db/seeds/desenvolvimento.sql` roda também na API quando ela sobe sem banco
-- externo, e é dela que saem as contagens dos testes do servidor. Este arquivo
-- roda só no painel em modo local, logo depois dela, e acrescenta um caso que
-- a demonstração precisa mostrar: uma tarefa devolvida do campo.
--
-- Por que isso vale um arquivo: a demonstração é peça de venda, e coordenador
-- de Defesa Civil reconhece o produto pelo que ele já viu acontecer. "A equipe
-- subiu o morro, não achou o endereço e devolveu, e o sistema me diz o que
-- fazer com isso" é a frase que faz a tela deixar de ser bonita e passar a ser
-- verdadeira. Tela só com caso perfeito não convence quem trabalha.
--
-- O que é escrito aqui é o MESMO que a rota de devolução escreve
-- (`apps/api/src/rotas/sincronizacao.ts`): a linha em `devolucoes_de_tarefa`,
-- o evento na trilha com o mesmo `detalhe`, e a ocorrência de volta em
-- `triagem` sem equipe e com o prazo vencido intacto. Semear diferente daria
-- uma demonstração que não se parece com o produto.
--
-- Dados fictícios, como o resto da semente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 000472/2026, Avenida Beira Rio: despachada, prazo vencido, devolvida.
--
-- A ocorrência já nasce em `triagem` e sem equipe na semente compartilhada,
-- que é exatamente onde uma devolução deixa o registro. Falta o que conta a
-- história: o prazo VENCIDO (devolver só é possível depois de vencer, e
-- devolver não reabre prazo nenhum) e os registros do ato.
-- ---------------------------------------------------------------------
UPDATE ocorrencias
   SET prazo_em = now() - interval '2 hours'
 WHERE id = '11111111-1111-4111-8111-0000000000c2';

-- A linha da devolução, que é o que a coordenação consulta em lista, e o ÚNICO
-- lugar onde a observação em texto livre fica guardada. A equipe é a que perdeu
-- a tarefa, e ela continua registrada aqui mesmo depois de a ocorrência ficar
-- sem equipe: sem isso ninguém saberia quem foi até lá.
--
-- O `id` é fixo em vez de sorteado porque o evento da trilha, logo abaixo,
-- aponta para ele. É assim que a rota de verdade escreve: quem auditar depois
-- do prazo de retenção vê que houve devolução, por quê, e segue o identificador
-- até aqui, que é onde o texto pode ter sido descartado.
INSERT INTO devolucoes_de_tarefa (
  id, organizacao_id, ocorrencia_id, devolvida_por, equipe_id,
  motivo, observacao, prazo_em, decidida_em, idempotency_key
) VALUES (
  '11111111-1111-4111-8111-0000000000b2',
  '11111111-1111-4111-8111-000000000001',
  '11111111-1111-4111-8111-0000000000c2',
  '11111111-1111-4111-8111-0000000000d3',
  '11111111-1111-4111-8111-0000000000e2',
  'endereco_nao_localizado',
  'Numeração da avenida salta do 1120 para o 1210. Nenhum morador soube '
  || 'indicar o 1180, e o ponto do mapa cai do outro lado do rio.',
  now() - interval '2 hours',
  now() - interval '90 minutes',
  '11111111-1111-4111-8111-0000000000b1'
);

INSERT INTO trilha_eventos (
  organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
  origem, ocorrido_em, detalhe
) VALUES
  -- O despacho que aconteceu antes. Sem ele, a linha do tempo diria que a
  -- ocorrência foi devolvida sem nunca ter sido mandada para ninguém, que é
  -- uma história impossível.
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-0000000000c2',
   'despacho', '11111111-1111-4111-8111-0000000000d1',
   'Helena Vasques Coutinho', 'coordenador', 'escritorio',
   now() - interval '5 hours' - interval '30 minutes',
   '{"equipe":"Equipe Bravo"}'::jsonb),

  -- A devolução. O motivo é o do endereço não localizado de propósito: é ele
  -- que amarra os dois recursos na demonstração, porque a saída que o painel
  -- oferece para este motivo é corrigir a coordenada, no cartão logo abaixo.
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-0000000000c2',
   'devolucao_de_tarefa', '11111111-1111-4111-8111-0000000000d3',
   'Diego Nakamura Alves', 'agente_campo', 'campo',
   now() - interval '90 minutes',
   jsonb_build_object(
     'motivo', 'endereco_nao_localizado',
     'motivoRotulo', 'Não localizei o endereço',
     -- QUE houve observação, e não qual foi, que é exatamente o que a rota
     -- grava. `trilha_eventos` não tem policy de UPDATE nem de DELETE: o texto
     -- escrito na rua nomeia morador e descreve condição de saúde, e gravá-lo
     -- aqui o tornaria permanente, fora do alcance do prazo de retenção que o
     -- município fixa como controlador. Semear diferente da rota daria uma
     -- demonstração que não se parece com o produto, que é o defeito que este
     -- arquivo inteiro existe para não cometer.
     'temObservacao', true,
     'devolucaoId', '11111111-1111-4111-8111-0000000000b2',
     'equipeId', '11111111-1111-4111-8111-0000000000e2',
     -- Data em jsonb sai em ISO 8601 com fuso, que é o que a tela lê.
     'prazoEm', (now() - interval '2 hours')::timestamptz,
     'statusAnterior', 'em_campo'
   ));
