-- =====================================================================
-- 023: o resumo que o municipio ESCREVE, e o console que so LE.
--
-- Implementa a ADR 0008
-- (docs/adr/0008-console-do-fornecedor-sem-credencial-que-ve-dois-municipios.md),
-- que foi escrita ANTES desta migracao de proposito.
--
-- O PORQUE, em uma frase: responder "o municipio esta usando?" exigia abrir
-- uma sessao na producao com a credencial de dono, que ignora RLS. Cada
-- pergunta de rotina passava a exigir a mao na chave mais poderosa do sistema,
-- e o padrao ja se repetiu neste produto: toda lacuna de ferramenta vira um
-- UPDATE manual em producao.
--
-- =====================================================================
-- A DIRECAO DO DADO E O PONTO INTEIRO.
--
-- Uma versao anterior do plano mandava o console "consultar as metricas de
-- cada municipio". Isso exige exatamente a credencial que nao pode existir:
-- uma conexao que enxerga dado de mais de uma prefeitura. O teste daquele
-- desenho ficaria verde e falso.
--
-- Aqui a seta se inverte. Cada municipio escreve o proprio resumo, dentro da
-- propria transacao, com o papel de aplicacao de sempre e debaixo do mesmo RLS
-- de sempre. `resumir_municipio()` NAO e SECURITY DEFINER: ela roda com os
-- privilegios de quem chama, entao as contagens que ela faz enxergam
-- exatamente as linhas que aquele municipio enxergaria, e nem uma a mais. Nao
-- existe caminho, nem por engano de codigo, para um municipio resumir o
-- vizinho. E por isso que o teto de funcoes SECURITY DEFINER continua em 14:
-- esta migracao nao abriu porta nenhuma na parede do RLS.
--
-- =====================================================================
-- O QUE PODE ENTRAR AQUI, E O QUE NAO PODE.
--
-- Pode: contagem, soma, mediana, marca de tempo, identificador da organizacao.
--
-- Nao pode, e a regra e dura: nome, contato, endereco, coordenada, protocolo,
-- relato, descricao de vulnerabilidade, matricula. Nada que identifique pessoa
-- ou imovel. A defesa nao e so a boa intencao de quem escreve a proxima
-- migracao: as colunas sao de tipo numerico, de data ou booleanas, e o unico
-- uuid permitido e o da organizacao. Nao cabe endereco dentro de um integer.
-- O portao `db/test/isolamento.test.ts` varre o CATALOGO e reprova se aparecer
-- coluna de texto, de jsonb ou um segundo uuid em qualquer relacao que o
-- console consiga ler.
--
-- Consequencia aceita e escrita na ADR: o console nunca responde "o que houve
-- na ocorrencia 000123". Ele responde "entraram 41 chamados, 8 estao
-- atrasados". Para a primeira pergunta existe telefone com o administrador do
-- municipio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Papel do console.
--
-- NOLOGIN pelo mesmo motivo de `dc360_app` (migracao 001): quem se conecta e
-- um papel de login criado pelo operador, que recebe este por concessao, e
-- assim a senha nao mora na migracao.
--
-- NOINHERIT e deliberado: se um dia alguem conceder outro papel a este, o
-- privilegio nao passa a valer sozinho, sem ninguem pedir. Nao e a defesa
-- principal (o portao de privilegio no teste e), e sim a segunda tranca na
-- mesma porta.
--
-- Sem BYPASSRLS, sem SUPERUSER, sem CREATEROLE: um papel de leitura de numero
-- agregado que pudesse ignorar RLS seria a credencial proibida com outro nome.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dc360_console') THEN
    CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS
                              NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- metricas_municipio: uma linha por municipio por dia.
--
-- Sem coluna `id`, como `avisos_lidos` (018) e `segundo_fator` (022): a
-- identidade da linha E o par (municipio, dia). Uma chave sintetica so criaria
-- a possibilidade de duas linhas dizendo numeros diferentes sobre o mesmo dia,
-- e "qual das duas vale" nao e pergunta que se queira fazer olhando para um
-- painel de operacao.
--
-- O dia e calculado no fuso do servidor, e nao no fuso do municipio. Para a
-- pergunta que este resumo responde ("esta havendo movimento?") a diferenca de
-- algumas horas na virada nao muda a resposta, e um fuso por municipio seria
-- dado novo a manter para ganhar precisao que ninguem vai usar.
-- ---------------------------------------------------------------------
CREATE TABLE metricas_municipio (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  dia             date NOT NULL,

  -- Movimento do dia.
  ocorrencias_registradas   integer NOT NULL DEFAULT 0 CHECK (ocorrencias_registradas >= 0),
  ocorrencias_encerradas    integer NOT NULL DEFAULT 0 CHECK (ocorrencias_encerradas >= 0),
  vistorias_recebidas       integer NOT NULL DEFAULT 0 CHECK (vistorias_recebidas >= 0),
  oficios_emitidos          integer NOT NULL DEFAULT 0 CHECK (oficios_emitidos >= 0),

  -- Retrato do momento da escrita, e nao do dia: "quantas estao abertas AGORA"
  -- e a pergunta que o coordenador do fornecedor faz ao telefone.
  ocorrencias_abertas       integer NOT NULL DEFAULT 0 CHECK (ocorrencias_abertas >= 0),
  ocorrencias_atrasadas     integer NOT NULL DEFAULT 0 CHECK (ocorrencias_atrasadas >= 0),

  -- "Alguem esta com problema?" da ADR 0008: aparelho que nao aparece ha dias
  -- e fila de sincronizacao parada do lado de la.
  usuarios_ativos           integer NOT NULL DEFAULT 0 CHECK (usuarios_ativos >= 0),
  aparelhos_ativos          integer NOT NULL DEFAULT 0 CHECK (aparelhos_ativos >= 0),
  aparelhos_sem_aparecer    integer NOT NULL DEFAULT 0 CHECK (aparelhos_sem_aparecer >= 0),

  /*
    Mediana, e nao media, porque uma unica vistoria feita tres dias depois
    (agente que sincronizou tarde) desloca a media inteira e faz o console
    acusar problema onde nao ha. Nulo quando nenhuma ocorrencia do dia recebeu
    vistoria: nulo aqui e "nao ha o que medir", e zero seria mentira.
  */
  minutos_ate_vistoria_mediana integer CHECK (minutos_ate_vistoria_mediana >= 0),

  /*
    A MARCA DE TEMPO DA ULTIMA ESCRITA, e ela e obrigatoria.

    A ADR 0008 assume por escrito o defeito que ela evita: metrica escrita pelo
    municipio pode faltar se o municipio estiver quebrado, e ai o console
    mostraria silencio, que e indistinguivel de "ninguem usou hoje". Com esta
    coluna, e com a visao `console_situacao_dos_municipios` logo abaixo, a
    ausencia de escrita recente vira um SINAL na tela, e nao uma linha vazia.
  */
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organizacao_id, dia)
);

COMMENT ON TABLE metricas_municipio IS
  'Resumo agregado que cada municipio escreve sobre si mesmo, para o console '
  'do fornecedor ler (ADR 0008). So contagem, mediana e marca de tempo: nada '
  'que identifique pessoa ou imovel entra aqui.';

ALTER TABLE metricas_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE metricas_municipio FORCE ROW LEVEL SECURITY;

/*
  O municipio escreve e le o proprio resumo, pela regra de sempre.

  Sem policy de DELETE: o expurgo por idade ainda nao existe (ver
  `db/PENDENCIAS.md`), e enquanto nao existir e melhor que ninguem apague nada
  do que uma rota poder apagar a serie historica de um municipio inteiro com um
  DELETE sem clausula.
*/
CREATE POLICY metricas_do_proprio_municipio ON metricas_municipio
  FOR SELECT TO dc360_app
  USING (organizacao_id = app_organizacao_atual());

CREATE POLICY metricas_escrita_do_proprio_municipio ON metricas_municipio
  FOR INSERT TO dc360_app
  WITH CHECK (organizacao_id = app_organizacao_atual());

CREATE POLICY metricas_correcao_do_proprio_municipio ON metricas_municipio
  FOR UPDATE TO dc360_app
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  A UNICA policy do produto que le linha de mais de um municipio, e ela existe
  aqui e em `organizacoes` porque a tabela toda foi desenhada para nao ter o
  que vazar: contagem, mediana e marca de tempo.

  `USING (true)` e proposital e nao e descuido. Amarra-la ao contexto do
  municipio seria fingir isolamento onde a leitura cruzada e o requisito. O que
  a mantem estreita nao e a expressao, sao duas outras coisas, as duas
  conferidas em `db/test/isolamento.test.ts`:

    1. o papel `dc360_console` nao tem privilegio em nenhuma outra tabela, por
       nenhum caminho (concessao direta, coluna, heranca, PUBLIC, visao ou
       funcao SECURITY DEFINER);
    2. toda relacao que ele consegue ler so tem coluna de numero, data ou
       booleano, conferido no catalogo.

  Se alguem escrever uma policy `TO dc360_console` em outra tabela, ela nao
  ganha efeito nenhum sem uma concessao, e a concessao reprova no portao.
*/
CREATE POLICY metricas_leitura_do_console ON metricas_municipio
  FOR SELECT TO dc360_console
  USING (true);

/*
  O cadastro de organizacoes, pela mesma razao: sem ele o console teria uma
  lista de uuid e nenhuma forma de dizer de que prefeitura esta falando. E o
  segundo e ultimo lugar onde o console enxerga mais de um municipio, e esta
  nomeado na decisao 3 da ADR 0008.
*/
CREATE POLICY organizacoes_leitura_do_console ON organizacoes
  FOR SELECT TO dc360_console
  USING (true);

-- ---------------------------------------------------------------------
-- resumir_municipio(): a escrita, feita pelo proprio municipio.
--
-- SECURITY INVOKER (o padrao, escrito aqui so para quem le nao precisar
-- lembrar): as contagens rodam com os privilegios e o contexto de quem chama,
-- entao cada uma delas enxerga apenas as linhas daquele municipio. Um erro de
-- clausula nesta funcao nao pode produzir o numero do vizinho, porque as
-- linhas do vizinho nao estao la para serem contadas.
--
-- Sem contexto de municipio, `app_organizacao_atual()` devolve nulo e o INSERT
-- morre no NOT NULL: chamar isto de um relogio, sem token, nao escreve nada,
-- e essa e a resposta certa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resumir_municipio(p_dia date DEFAULT current_date)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO metricas_municipio (
    organizacao_id, dia,
    ocorrencias_registradas, ocorrencias_encerradas,
    vistorias_recebidas, oficios_emitidos,
    ocorrencias_abertas, ocorrencias_atrasadas,
    usuarios_ativos, aparelhos_ativos, aparelhos_sem_aparecer,
    minutos_ate_vistoria_mediana, atualizado_em)
  SELECT
    app_organizacao_atual(),
    p_dia,
    (SELECT count(*) FROM ocorrencias WHERE criado_em::date = p_dia),
    (SELECT count(*) FROM ocorrencias WHERE encerrado_em::date = p_dia),
    (SELECT count(*) FROM vistorias WHERE sincronizada_em::date = p_dia),
    (SELECT count(*) FROM oficios WHERE emitido_em::date = p_dia),
    (SELECT count(*) FROM ocorrencias WHERE status <> 'encerrada'),
    (SELECT count(*) FROM ocorrencias
      WHERE status <> 'encerrada' AND prazo_em IS NOT NULL AND prazo_em < now()),
    (SELECT count(*) FROM usuarios WHERE ativo),
    (SELECT count(*) FROM aparelhos WHERE revogado_em IS NULL),
    /*
      Dois dias, e nao um: o agente que passou a quinta-feira em campo com o
      aparelho no bolso e sincronizou na manha de sexta nao e problema nenhum,
      e um console que gritasse por isso seria desligado na primeira semana.
    */
    (SELECT count(*) FROM aparelhos
      WHERE revogado_em IS NULL AND visto_em < now() - interval '2 days'),
    (SELECT (percentile_cont(0.5) WITHIN GROUP (
               ORDER BY GREATEST(0, EXTRACT(epoch FROM (v.primeira - o.criado_em)) / 60)
             ))::integer
       FROM ocorrencias o
       JOIN LATERAL (
         SELECT min(vi.coletada_em) AS primeira FROM vistorias vi WHERE vi.ocorrencia_id = o.id
       ) v ON v.primeira IS NOT NULL
      WHERE o.criado_em::date = p_dia),
    now()
  ON CONFLICT (organizacao_id, dia) DO UPDATE SET
    ocorrencias_registradas      = EXCLUDED.ocorrencias_registradas,
    ocorrencias_encerradas       = EXCLUDED.ocorrencias_encerradas,
    vistorias_recebidas          = EXCLUDED.vistorias_recebidas,
    oficios_emitidos             = EXCLUDED.oficios_emitidos,
    ocorrencias_abertas          = EXCLUDED.ocorrencias_abertas,
    ocorrencias_atrasadas        = EXCLUDED.ocorrencias_atrasadas,
    usuarios_ativos              = EXCLUDED.usuarios_ativos,
    aparelhos_ativos             = EXCLUDED.aparelhos_ativos,
    aparelhos_sem_aparecer       = EXCLUDED.aparelhos_sem_aparecer,
    minutos_ate_vistoria_mediana = EXCLUDED.minutos_ate_vistoria_mediana,
    atualizado_em                = now();
$$;

COMMENT ON FUNCTION resumir_municipio(date) IS
  'Escreve o resumo agregado do municipio do contexto. Roda como quem chama, '
  'debaixo do RLS, entao nao alcanca linha de outro municipio.';

-- ---------------------------------------------------------------------
-- console_situacao_dos_municipios: a visao em que o silencio aparece.
--
-- Aqui mora a consequencia ruim assumida na ADR 0008: se a escrita da metrica
-- falhar, o console mostraria silencio, e silencio e indistinguivel de
-- "ninguem usou hoje". Uma consulta direta a `metricas_municipio` produziria
-- exatamente esse engano: o municipio quebrado simplesmente NAO APARECE na
-- lista, e ninguem sente falta do que nao esta la.
--
-- A visao parte de `organizacoes`, nao das metricas. Todo municipio aparece,
-- sempre, e quem nao escreveu aparece com `sem_escrita_recente` verdadeiro. A
-- ausencia deixa de ser uma linha faltando e vira uma linha dizendo que falta.
--
-- `security_invoker` e o que impede esta visao de virar a porta dos fundos:
-- sem ele, a visao roda com os privilegios do DONO das tabelas, que e
-- superusuario e ignora RLS. Bastaria alguem acrescentar uma juncao com
-- `ocorrencias` aqui para o console passar a ler dado de cidadao de todas as
-- prefeituras, sem tocar em nenhuma concessao. Com `security_invoker`, uma
-- juncao dessas responde "permissao negada" para o console, porque ele nao tem
-- concessao na tabela nova.
--
-- Nao expoe nome nem municipio de proposito: o console junta com
-- `organizacoes`, onde ele ja tem SELECT. Assim esta visao continua sendo so
-- numero, e o portao que varre o catalogo pode cobrar isso dela sem excecao.
-- ---------------------------------------------------------------------
CREATE VIEW console_situacao_dos_municipios
WITH (security_invoker = true) AS
SELECT
  o.id AS organizacao_id,
  m.dia,
  m.ocorrencias_registradas,
  m.ocorrencias_encerradas,
  m.vistorias_recebidas,
  m.oficios_emitidos,
  m.ocorrencias_abertas,
  m.ocorrencias_atrasadas,
  m.usuarios_ativos,
  m.aparelhos_ativos,
  m.aparelhos_sem_aparecer,
  m.minutos_ate_vistoria_mediana,
  m.atualizado_em,
  /*
    Trinta e seis horas, e nao vinte e quatro: a escrita e diaria, e uma janela
    justa de um dia acusaria todo municipio cuja rotina rodou algumas horas mais
    tarde. Alarme que toca sozinho todo dia e alarme que ninguem olha.
  */
  (m.atualizado_em IS NULL OR m.atualizado_em < now() - interval '36 hours')
    AS sem_escrita_recente,
  EXTRACT(epoch FROM (now() - m.atualizado_em)) / 3600 AS horas_desde_a_escrita
FROM organizacoes o
LEFT JOIN LATERAL (
  SELECT * FROM metricas_municipio mm
   WHERE mm.organizacao_id = o.id
   ORDER BY mm.dia DESC
   LIMIT 1
) m ON true;

COMMENT ON VIEW console_situacao_dos_municipios IS
  'Uma linha por municipio, inclusive os que nao escreveram: a ausencia de '
  'escrita recente vira sinal em vez de linha faltando (ADR 0008).';

-- ---------------------------------------------------------------------
-- Privilegios.
--
-- O papel de aplicacao escreve e corrige o proprio resumo. Sem DELETE, pelo
-- motivo escrito junto das policies.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON metricas_municipio TO dc360_app;

REVOKE ALL ON FUNCTION resumir_municipio(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resumir_municipio(date) TO dc360_app;

/*
  E so isto que o console recebe, no banco inteiro. A decisao 3 da ADR 0008 diz
  "nada em nenhuma outra tabela", e o portao de privilegio de
  `db/test/isolamento.test.ts` transforma essa frase em assercao universal: ela
  vale para a tabela que alguem criar amanha sem lembrar desta migracao.
*/
GRANT USAGE ON SCHEMA public TO dc360_console;
GRANT SELECT ON metricas_municipio TO dc360_console;
GRANT SELECT ON organizacoes TO dc360_console;
GRANT SELECT ON console_situacao_dos_municipios TO dc360_console;
