-- =====================================================================
-- 037: o expurgo por retencao de `notificacoes_enviadas` deixa de depender
--      de o dono das tabelas ignorar RLS.
--
-- `varrer_prazos` (migracao 016) faz, por dentro:
--
--   DELETE FROM notificacoes_enviadas WHERE enviada_em < now() - p_retencao;
--
-- e `notificacoes_enviadas` tem `FORCE ROW LEVEL SECURITY` com policies so de
-- SELECT e de UPDATE. Sem policy de DELETE, o comando nao enxerga linha
-- nenhuma: ele nao estoura, VOLTA DIZENDO ZERO. Um expurgo por retencao que
-- apaga zero em silencio e dado pessoal guardado alem do prazo, com um
-- documento afirmando que ele foi removido.
--
-- ## Por que isto nao e um incidente na producao de hoje, e mesmo assim entra
--
-- Nesta instalacao as tabelas pertencem a `postgres`, que tem BYPASSRLS, entao
-- o expurgo funciona. Conferido no catalogo em 14/09/2026:
--
--   notificacoes_enviadas | dono postgres | forcada true | dono_ignora_rls true
--
-- Ou seja: o que faz o expurgo funcionar hoje e um atributo do PAPEL, que nao
-- esta escrito em lugar nenhum do produto e que qualquer instalacao pode nao
-- ter. O `CLAUDE.md` manda o papel de aplicacao nao ser dono nem superusuario,
-- e nao diz nada sobre o dono, entao uma instalacao correta segundo o proprio
-- documento pode nascer sem BYPASSRLS. E o sintoma seria o pior que existe:
-- nada quebra, nada aparece em log, e o dado fica.
--
-- ## O piso de 30 dias, e por que ele nao troca um silencio por outro
--
-- A policy precisa de uma condicao de idade escrita AQUI, senao ela vira
-- licenca para apagar qualquer notificacao (o modelo e a `avisos_expurgo` da
-- migracao 018, que faz exatamente isto). Mas condicao de idade fixa numa
-- policy contra um prazo que vem por parametro reabre o mesmo silencio: com
-- retencao configurada abaixo do piso, as linhas entre os dois numeros ficam,
-- caladas.
--
-- Por isso o piso entra em DOIS lugares: aqui, e como recusa explicita em
-- `apps/api/src/push/varredor.ts`, que rejeita retencao menor que 30 dias
-- nomeando esta migracao. Uma barreira sozinha seria a que produz silencio.
-- =====================================================================

/*
  So DELETE, e so o que passou do piso. As policies de SELECT e de UPDATE da
  016 continuam valendo e nao sao tocadas: INSERT continua sem policy, que e o
  jeito de o produto dizer que quem escreve notificacao enviada e o varredor,
  por dentro da funcao, e nao a aplicacao.
*/
CREATE POLICY notificacoes_expurgo ON notificacoes_enviadas FOR DELETE
  USING (
    organizacao_id = app_organizacao_atual()
    AND enviada_em < now() - interval '30 days'
  );

COMMENT ON TABLE notificacoes_enviadas IS
  'Aviso ja enviado a um aparelho. Apagavel SOMENTE pelo expurgo por retencao, '
  'e so passados 30 dias (policy notificacoes_expurgo, migracao 037). O prazo '
  'de verdade e o parametro de varrer_prazos, hoje 90 dias; os 30 daqui sao o '
  'piso que impede a policy de virar licenca para apagar o que e recente.';
