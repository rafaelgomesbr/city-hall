import type { Consulta } from "../banco/tipos.js";
import type { Identidade } from "../servidor.js";

/**
 * Registra QUEM leu dado de cidadão, sobre qual ocorrência e para quê.
 *
 * O BURACO QUE ISTO FECHA: exportação deixava rastro desde a migração 007, e
 * leitura não deixava nenhum. O produto sabia dizer quem tirou a base do
 * município em março e não sabia dizer quem abriu o dossiê de uma família
 * específica, que é a pergunta mais provável que a autoridade nacional faz
 * quando um dado vaza, e a única que o titular consegue formular sozinho.
 *
 * REGISTRA O ACESSO, NUNCA O DADO. A linha leva identificadores e nada de
 * conteúdo. Se ela carregasse o nome lido, ou o contato, ou a descrição de
 * vulnerabilidade, o registro de acesso seria uma SEGUNDA cópia do dado
 * sensível, com a mesma exposição do original, lida por mais gente (auditoria e
 * suporte leem registro de acesso) e sem a mesma retenção, porque prova de
 * acesso não se minimiza. O produto teria inventado um vazamento novo para
 * poder investigar vazamento.
 *
 * =====================================================================
 * O CRITÉRIO DE O QUE SE REGISTRA, que é a decisão de projeto deste arquivo.
 *
 * Registra-se a leitura que CONCENTRA dado de pessoa numa ocorrência
 * identificada:
 *
 *   `GET /ocorrencias/:id`  o dossiê: nome, contato, relato, endereço,
 *                           descrição de vulnerabilidade e a trilha inteira,
 *                           numa resposta só, sobre uma família.
 *   os documentos oficiais  o laudo e os termos, que são a mesma concentração
 *                           em forma de papel que sai da tela e vai para um
 *                           processo.
 *
 * NÃO se registra a LISTAGEM (`GET /ocorrencias`, o mapa, o painel, a fila do
 * agente). Duas razões, e a segunda importa mais que a primeira:
 *
 *   1. VOLUME. A lista é a tela inicial do painel e é recarregada o dia
 *      inteiro, por todo mundo. Registrar cada carga produziria milhões de
 *      linhas por município por ano, e a tabela que existe para responder
 *      "quem viu os dados dessa família?" ficaria impossível de ler
 *      justamente por excesso de resposta. Registro que ninguém consegue ler
 *      não é registro.
 *   2. GRANULARIDADE. A pergunta é sobre uma família, e uma listagem não é
 *      sobre nenhuma: ela é a fila de trabalho do município. Uma linha
 *      dizendo "fulano abriu a fila às 8h" não ajuda a responder nada.
 *
 * O RESÍDUO, dito em voz alta porque ele existe: a listagem hoje devolve as
 * colunas do solicitante junto (ela seleciona a ocorrência inteira), então é
 * possível ler nome e contato em lote sem deixar linha aqui. Estreitar as
 * colunas da listagem é a correção certa e ela mexe no painel, que é de outra
 * frente; está anotada como pendência. Enquanto isso, o que a listagem NÃO
 * entrega é o que só o detalhe entrega: a descrição de vulnerabilidade social,
 * o contato e a trilha, e esses três são o que faz o dossiê ser dossiê.
 * =====================================================================
 */

/** O que foi lido. Lista fechada, igual à do CHECK da migração 021 (e da 041). */
export type RecursoConsultado =
  | "ocorrencia_detalhe"
  | "laudo"
  | "termo_de_interdicao"
  | "termo_de_desinterdicao"
  /*
    A busca do painel, SÓ quando a ocorrência entrou no resultado porque o
    nome do solicitante casou com o termo: é a leitura que associa uma pessoa
    a um endereço. Casar por protocolo ou endereço não registra, pelo mesmo
    critério da listagem acima. Ver `rotas/busca.ts`.
  */
  | "busca";

/**
 * Para quê. Declarada pela ROTA, e nunca digitada por quem consulta.
 *
 * Campo livre preenchido a cada clique viraria "consulta" para todo mundo em
 * uma semana, e a coluna passaria a não dizer nada enquanto parecesse dizer. A
 * rota, ao contrário, sabe com certeza para que aquela leitura serve.
 *
 * A exceção é a exportação de nível completo, cuja justificativa É escrita à
 * mão porque ali quem exporta está tirando dado pessoal de milhares de pessoas
 * de uma vez, num arquivo que o sistema não consegue mais alcançar. Ela mora
 * em `exportacoes.justificativa`, e não aqui, porque uma exportação atravessa
 * muitas ocorrências e não pertence a nenhuma.
 */
export type FinalidadeDaConsulta = "atendimento" | "emissao_de_documento";

/**
 * Grava a linha, na MESMA transação da leitura.
 *
 * Fora da transação, uma falha entre a leitura e o registro entregaria o dossiê
 * e não deixaria rastro, que é exatamente o caso sobre o qual alguém pergunta
 * depois. Dentro dela, ou os dois acontecem ou nenhum.
 */
export async function registrarConsulta(
  c: Consulta,
  quem: Identidade,
  alvo: {
    ocorrenciaId: string;
    recurso: RecursoConsultado;
    finalidade: FinalidadeDaConsulta;
    ip?: string | null;
  },
): Promise<void> {
  await c.query(
    `INSERT INTO ocorrencia_consultas
       (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel,
        recurso, finalidade, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      quem.organizacaoId, alvo.ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
      alvo.recurso, alvo.finalidade, alvo.ip || null,
    ],
  );
}
