-- =====================================================================
-- 020: os orgaos que a vistoria indica, que o servidor coletava e jogava fora.
--
-- O DEFEITO. `vistoria.orgaosParaAcionar` ja viaja no envelope de
-- sincronizacao, o Zod ja o valida, a tela do aparelho ja o coleta com o
-- catalogo do municipio no disco. A rota `POST /sincronizacao/vistoria` NAO
-- gravava, porque nao existia tabela. O agente marcava no barranco quais
-- orgaos precisam ser acionados, o aplicativo mandava, e o servidor descartava
-- em silencio.
--
-- O efeito no papel era o de sempre: o laudo chegava a coordenacao dizendo
-- "Necessario acionar outro orgao: SIM" e nao dizia QUAL. A primeira
-- providencia do coordenador virava um telefonema para o agente, horas depois,
-- com ele em outra ocorrencia ou fora do turno, para perguntar uma coisa que
-- estava obvia no local no minuto da vistoria. Era exatamente a reclamacao que
-- originou o desdobramento do item, e ela sobrevivia a ele.
--
-- -------------------------------------------------------------------
-- POR QUE UMA LINHA POR ORGAO, e nao um campo dentro do checklist
-- -------------------------------------------------------------------
--
-- O checklist ja e `jsonb` na vistoria, e enfiar a lista la dentro seria uma
-- linha de codigo em vez de uma migracao. Custaria a unica coisa que este dado
-- existe para produzir: "quantas vezes acionamos os bombeiros neste semestre"
-- e a conta que sustenta conversa de orcamento com o prefeito, e ela nao sai
-- de texto dentro de JSON sem alguem escrever uma consulta que ninguem revisa.
-- Uma linha por orgao, com chave para o catalogo, e o que torna a conta
-- trivial e correta.
--
-- -------------------------------------------------------------------
-- POR QUE `orgao_id` E ANULAVEL, e por que o nome viaja sempre
-- -------------------------------------------------------------------
--
-- `orgao_id` nulo NAO e dado faltando: e o campo livre, e ele governa o
-- produto inteiro. O catalogo do municipio desce para o aparelho junto com a
-- lista de tarefas e e lido do disco, nunca da rede. Um aparelho novo, que
-- nunca sincronizou, tem catalogo vazio, e se a indicacao dependesse so do
-- catalogo um item OBRIGATORIO do checklist travaria a conclusao da vistoria
-- justamente sem sinal, que e a condicao normal de trabalho deste aplicativo.
-- Nenhuma vistoria pode ficar impossivel por falta de um cadastro.
--
-- O `nome` e NOT NULL mesmo quando ha `orgao_id`, e isso nao e redundancia. O
-- laudo e peca de processo e precisa continuar legivel daqui a cinco anos,
-- depois de o orgao ter sido desativado, renomeado ou fundido com outro.
-- Guardar so o identificador transformaria o laudo antigo numa consulta que
-- pode nao achar mais nada.
--
-- -------------------------------------------------------------------
-- POR QUE AS DUAS CHAVES ESTRANGEIRAS SAO COMPOSTAS
-- -------------------------------------------------------------------
--
-- Mesma razao das migracoes 008 e 017, e ela nao envelhece: Row Level Security
-- governa SELECT, INSERT, UPDATE e DELETE, e NAO governa a verificacao de
-- chave estrangeira. O Postgres confere a existencia da linha referenciada com
-- privilegio de sistema, por baixo da policy. Uma chave simples
-- `orgao_id -> orgaos(id)` deixaria uma vistoria de Serra Alta indicar um
-- orgao de Vale Fundo, o RLS nao veria nada de errado porque nunca chega a ser
-- consultado, e o laudo de um municipio sairia nomeando o cadastro do outro.
-- Pior: o INSERT passa se o identificador existe la e falha se nao existe, que
-- e um oraculo de existencia sobre o cadastro do vizinho, exatamente o que a
-- resposta 404 no lugar de 403 existe para impedir na API.
-- =====================================================================

CREATE TABLE vistoria_orgaos_indicados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  vistoria_id     uuid NOT NULL,

  /* Nulo e o campo livre: o agente digitou o nome. Ver o cabecalho. */
  orgao_id        uuid,
  nome            text NOT NULL CHECK (length(trim(nome)) > 0),

  /*
    A ordem em que o agente escolheu, preservada para o laudo sair na mesma
    sequencia em que a minuta foi lida em voz alta na porta da casa. Sem ela a
    ordem e a que o banco devolver, e os dois documentos passam a listar as
    mesmas coisas em ordens diferentes, o que num papel assinado parece
    divergencia mesmo quando nao e.
  */
  ordem           integer NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vistoria_orgaos_indicados_org_id_unico UNIQUE (organizacao_id, id),

  CONSTRAINT indicacao_vistoria_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, vistoria_id)
    REFERENCES vistorias (organizacao_id, id) ON DELETE CASCADE,

  CONSTRAINT indicacao_orgao_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, orgao_id)
    REFERENCES orgaos (organizacao_id, id) ON DELETE RESTRICT,

  /*
    O mesmo orgao do catalogo nao entra duas vezes na mesma vistoria.

    Sem isto, um envelope reenviado com a lista repetida faria o laudo imprimir
    "Corpo de Bombeiros" duas vezes e a conta de acionamentos contar duas. NULL
    e distinto de NULL no Postgres, entao a restricao alcanca exatamente as
    linhas do catalogo e deixa o campo livre em paz, que e o comportamento
    desejado: dois textos livres diferentes sao duas indicacoes diferentes.
  */
  CONSTRAINT orgao_do_catalogo_uma_vez_por_vistoria
    UNIQUE (organizacao_id, vistoria_id, orgao_id)
);

CREATE INDEX vistoria_orgaos_indicados_vistoria_idx
  ON vistoria_orgaos_indicados (organizacao_id, vistoria_id);

/*
  O indice que serve a conta de orcamento: quantas vezes cada orgao do catalogo
  foi indicado. Parcial porque a linha de campo livre nao tem orgao e nao entra
  em contagem por cadastro.
*/
CREATE INDEX vistoria_orgaos_indicados_orgao_idx
  ON vistoria_orgaos_indicados (organizacao_id, orgao_id)
  WHERE orgao_id IS NOT NULL;

ALTER TABLE vistoria_orgaos_indicados ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_orgaos_indicados FORCE ROW LEVEL SECURITY;

CREATE POLICY vistoria_orgaos_indicados_isolamento ON vistoria_orgaos_indicados
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  SELECT e INSERT, e mais nada, pelo mesmo motivo da trilha.

  Isto e coleta de campo: o que o agente respondeu no local, naquele minuto,
  embaixo da assinatura do morador. Correcao nao se faz reescrevendo o que ele
  disse, se faz com vistoria nova, que e como o resto deste produto ja trata a
  vistoria. Sem UPDATE e sem DELETE, nem a aplicacao consegue mudar de ideia
  sobre um laudo ja emitido.
*/
GRANT SELECT, INSERT ON vistoria_orgaos_indicados TO dc360_app;
