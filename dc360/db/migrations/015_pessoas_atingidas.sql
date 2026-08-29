-- 015: quantas pessoas, e em que situação
--
-- O QUE FALTAVA. O produto registrava o imóvel e não registrava as pessoas. O
-- laudo descrevia a trinca na parede e não dizia quantos moradores saíram de
-- casa, nem quantos precisaram de abrigo público. Toda comunicação oficial de
-- desastre no Brasil começa por esses números, e o coordenador que precisava
-- deles ia contar no WhatsApp da equipe.
--
-- A DISTINÇÃO QUE O PRODUTO PRECISAVA APRENDER, e que é o motivo desta
-- migração existir separada de um simples "quantos afetados":
--
--   DESALOJADO   saiu de casa e tem para onde ir. Vai para a casa de um
--                parente, de um vizinho, alugado. O município registra e
--                acompanha.
--   DESABRIGADO  saiu de casa e NÃO tem para onde ir. Depende de abrigo
--                público. É o município que precisa dar teto, colchão e
--                comida, hoje, e por isso este número é o que muda a operação
--                da noite.
--
-- Somar os dois num campo só é o erro clássico, e ele custa exatamente a
-- informação que decide se alguém precisa abrir escola às dez da noite.
--
-- Nenhum destes é obrigatório, e nenhum tem valor padrão zero. A diferença
-- entre "não contei" e "contei e deu zero" é real: a primeira é uma vistoria
-- incompleta, a segunda é uma casa em que ninguém precisou sair. Zero por
-- omissão transformaria toda vistoria antiga numa afirmação falsa.
--
-- POR QUE NA VISTORIA, E NÃO NA OCORRÊNCIA. Porque contagem é OBSERVAÇÃO, com
-- data e autor, e não fato permanente. No dia da chuva são quatro
-- desabrigados; três dias depois, dois voltaram. Guardar na ocorrência
-- obrigaria a sobrescrever o número do primeiro dia, e é justamente a série
-- que responde "quanto tempo essa família ficou fora".

ALTER TABLE vistorias
  ADD COLUMN IF NOT EXISTS desalojados    integer,
  ADD COLUMN IF NOT EXISTS desabrigados   integer,
  ADD COLUMN IF NOT EXISTS feridos        integer,
  ADD COLUMN IF NOT EXISTS desaparecidos  integer,
  ADD COLUMN IF NOT EXISTS obitos         integer;

/*
  Os limites são do banco, e não só do formulário.

  O teto de 100 mil não é desconfiança da realidade: é a defesa contra o dedo
  escorregando no teclado numérico de um celular, no escuro, com luva. Um
  laudo dizendo "42000000 desabrigados" num município de vinte mil habitantes
  é o tipo de erro que ninguém revisa e que sai impresso.
*/
ALTER TABLE vistorias
  DROP CONSTRAINT IF EXISTS vistorias_contagem_plausivel,
  ADD CONSTRAINT vistorias_contagem_plausivel CHECK (
    (desalojados   IS NULL OR (desalojados   >= 0 AND desalojados   <= 100000)) AND
    (desabrigados  IS NULL OR (desabrigados  >= 0 AND desabrigados  <= 100000)) AND
    (feridos       IS NULL OR (feridos       >= 0 AND feridos       <= 100000)) AND
    (desaparecidos IS NULL OR (desaparecidos >= 0 AND desaparecidos <= 100000)) AND
    (obitos        IS NULL OR (obitos        >= 0 AND obitos        <= 100000))
  );

COMMENT ON COLUMN vistorias.desalojados IS
  'Saíram de casa e têm para onde ir. NULL significa não contado, e não zero.';
COMMENT ON COLUMN vistorias.desabrigados IS
  'Saíram de casa e dependem de abrigo público. É o número que decide se o '
  'município precisa abrir abrigo hoje. NULL significa não contado, e não zero.';
