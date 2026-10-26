-- =====================================================================
-- 053: indice das reservas de envio AINDA ABERTAS de cada pessoa.
--
-- O ACHADO (V2-F00-E06, validacao de 4b96ea7 e seguintes, pendencia H04,
-- decidido pelo Rafael em 26/10/2026: o teto passa a valer tambem POR
-- PESSOA). `POST /evidencias/autorizar-envio` reserva os bytes declarados no
-- teto do municipio no instante em que a linha de `evidencias` nasce, antes de
-- o arquivo subir. Um token de agente fazia cerca de 104 a 138 reservas de
-- 15 MB (o teto por arquivo) em cerca de 3 s, sem subir byte nenhum, e com
-- isso ocupava a margem inteira de um municipio de 1 GiB: os colegas passavam
-- a receber 507 e a fila do aparelho deles parava de drenar por ate 30 dias,
-- ate a varredura de objeto orfao dar as reservas por abandonadas. Desativar
-- a conta dele nao liberava nada.
--
-- A REGRA mora na rota (`apps/api/src/rotas/evidencias.ts`), na MESMA
-- transacao que cria a reserva, e o numero e configuracao da API
-- (`RESERVA_DE_ENVIO_POR_PESSOA_MB`, `apps/api/src/config.ts`, padrao de
-- 90 MB, a conta esta la): a soma dos
-- bytes das reservas abertas da pessoa (`enviada_em` e `abandonada_em` nulos,
-- `anexada_por` dela) mais a nova nao passa do teto por pessoa. Esta migracao
-- so da a essa soma um indice parcial: ela roda a cada foto autorizada, e sem
-- indice percorreria todas as evidencias do municipio para achar as poucas
-- linhas abertas de uma pessoa.
--
-- POR QUE PARCIAL: reserva aberta e estado de passagem (a foto sobe segundos
-- depois, ou a varredura a abandona em 30 dias). O indice guarda so essas
-- linhas, e fica pequeno para sempre, enquanto `evidencias` cresce.
--
-- O QUE NAO MUDA: nenhuma tabela, coluna, policy, funcao ou gatilho. O RLS de
-- `evidencias` continua decidindo o que a soma enxerga (so o municipio do
-- contexto).
--
-- ORDEM DE IMPLANTACAO: indiferente. A API nova funciona sem o indice (so
-- mais devagar), e a API antiga ignora o indice. Aditiva no sentido de
-- `docs/IMPLANTACAO.md` secao 8.1. O `CREATE INDEX` comum (sem CONCURRENTLY,
-- porque o aplicador roda cada arquivo numa transacao) segura escrita em
-- `evidencias` pelo tempo de varrer a tabela uma vez (a tabela guarda so os
-- metadados das fotos, nao os bytes).
--
-- Idempotente: `IF NOT EXISTS`. Migracao aplicada nunca e editada.
-- =====================================================================

CREATE INDEX IF NOT EXISTS evidencias_reservas_abertas_por_pessoa
  ON evidencias (organizacao_id, anexada_por)
  WHERE enviada_em IS NULL AND abandonada_em IS NULL;

COMMENT ON INDEX evidencias_reservas_abertas_por_pessoa IS
  'Reservas de envio ainda abertas (sem arquivo confirmado e nao abandonadas), por pessoa: a soma do teto por pessoa de POST /evidencias/autorizar-envio (migracao 053, pendencia H04).';
