import type { FastifyInstance } from "fastify";
import {
  encerramentoDeSaidaSchema,
  prorrogacaoDeSaidaSchema,
  retornoDeCampoSchema,
  ROTULO_DESFECHO_DE_SAIDA,
  saidaACampoSchema,
  type DesfechoDeSaida,
} from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { autorizar, RegraDeNegocio } from "../servidor.js";

/**
 * Segurança do agente que trabalha sozinho.
 *
 * =====================================================================
 * O QUE ESTAS ROTAS PROMETEM, E O QUE ELAS RECUSAM PROMETER
 * =====================================================================
 *
 * Este produto reconhece, por escrito e desde a migração 028, que o agente
 * entra em lugar que oferece risco à integridade física dele:
 * `risco_para_a_equipe` é um dos seis motivos de devolução de tarefa. E não
 * havia uma única linha de código para o caso de ele ter entrado.
 *
 * O que existe aqui é a versão mínima que é HONESTA. Um botão de apoio que
 * aciona alguém que não existe é pior do que botão nenhum, porque cria
 * expectativa de socorro: a pessoa muda o comportamento dela contando com uma
 * resposta que não vem. Este produto não tem central de monitoramento 24 horas,
 * não tem contrato com serviço de emergência, não detecta queda nem imobilidade
 * e não faz aparelho sem sinal falar.
 *
 * ENTÃO ELE PROMETE SÓ ISTO, e isto ele cumpre:
 *
 *   1. O agente declara, ANTES de subir e COM SINAL, para onde vai e em quanto
 *      tempo pretende voltar.
 *   2. O relógio que conta é o do SERVIDOR.
 *   3. Se o retorno não for confirmado até o prazo, o fato aparece na tela de
 *      quem coordena e no sino de avisos.
 *   4. O que a coordenação fez a respeito entra na trilha, com nome e hora.
 *
 * E NÃO PROMETE: não é botão de pânico, não detecta queda, não aciona ninguém
 * sozinho, e não avisa quem não estiver com o painel aberto. `docs/SEGURANCA-
 * DO-AGENTE.md` diz isso por extenso, e é ele que o município lê antes de
 * montar o procedimento dele.
 *
 * =====================================================================
 * POR QUE DECLARAR E CONFIRMAR EXIGEM SINAL, e isto é o desenho inteiro
 * =====================================================================
 *
 * O aparelho sem sinal não consegue pedir socorro. Nenhum software muda isso.
 * A parte que funciona de verdade é a que acontece ANTES, na base, com sinal:
 * dizer para onde vai e quando volta.
 *
 * Por isso a declaração NÃO entra na fila de sincronização do aplicativo, que é
 * a diferença mais importante entre estas rotas e `POST /sincronizacao/*`. A
 * fila existe para não perder trabalho já feito; aqui não há trabalho a perder,
 * há um aviso a entregar, e aviso guardado no aparelho é aviso que ninguém
 * recebeu. Pior: ele daria ao agente a sensação de estar coberto exatamente no
 * momento em que ele não está.
 *
 * A confirmação do retorno exige sinal pela mesma razão, e ela tem um efeito
 * que parece defeito e é a definição: **você voltou quando o sistema soube que
 * você voltou.** O agente que continua sem sinal continua aparecendo como quem
 * ninguém teve notícia, porque é exatamente isso que está acontecendo.
 *
 * =====================================================================
 * O QUE FICA DE FORA, E POR QUÊ
 * =====================================================================
 *
 * Nada disto é esquecimento, e cada "não" tem custo escrito:
 *
 *   * SEM PUSH PARA A COORDENAÇÃO. O push deste produto sai de um relógio que
 *     roda sem ninguém logado, e relógio sem contexto de município precisa de
 *     função `SECURITY DEFINER`. O teto é de 27, hoje cheio (portão CA-06, em
 *     `db/test/isolamento.test.ts`), e o portão reprova a vigésima oitava. O
 *     canal é o sino, que a coordenação
 *     já olha, e ele só toca para quem está com o painel aberto. Isso está
 *     dito em voz alta em vez de disfarçado.
 *   * SEM ESCALONAMENTO AUTOMÁTICO. Não existe "se ninguém encerrar em quinze
 *     minutos, ligue para fulano": o produto não disca, não manda mensagem e
 *     não acorda ninguém. Quem escala é gente, seguindo o procedimento que o
 *     município escreveu.
 *   * SEM LOCALIZAÇÃO CONTÍNUA DO AGENTE. Seguir o servidor pelo GPS o turno
 *     inteiro é vigilância de trabalhador, e é decisão do município e não do
 *     fornecedor. O que se guarda é para onde ele DISSE que ia.
 */

type LinhaDeSaida = {
  id: string;
  ocorrencia_id: string;
  protocolo: string;
  endereco: string;
  severidade: string | null;
  agente_id: string;
  agente_nome: string;
  equipe_nome: string | null;
  sozinho: boolean;
  duracao_minutos: number;
  declarada_em: Date | string;
  registrada_em: Date | string;
  retorno_previsto_inicial: Date | string;
  retorno_previsto_em: Date | string;
  prorrogacoes: number;
  vencida: boolean;
  atraso_em_minutos: number;
};

/**
 * O que a tela e o aparelho recebem de uma saída.
 *
 * `vencida` e `atrasoEmMinutos` são calculados pelo BANCO, e não aqui, pelo
 * mesmo motivo de sempre: o relógio do processo da API é outro relógio, e com
 * duas máquinas atrás de um balanceador a mesma saída apareceria vencida numa e
 * em dia na outra. Calcular na TELA seria pior ainda, porque o computador da
 * recepção é o relógio menos confiável de todos.
 */
function daLinha(s: LinhaDeSaida) {
  return {
    id: s.id,
    ocorrenciaId: s.ocorrencia_id,
    protocolo: s.protocolo,
    endereco: s.endereco,
    severidade: s.severidade,
    agenteId: s.agente_id,
    agenteNome: s.agente_nome,
    equipeNome: s.equipe_nome,
    sozinho: s.sozinho,
    duracaoMinutos: s.duracao_minutos,
    declaradaEm: s.declarada_em,
    registradaEm: s.registrada_em,
    retornoPrevistoInicial: s.retorno_previsto_inicial,
    retornoPrevistoEm: s.retorno_previsto_em,
    prorrogacoes: s.prorrogacoes,
    vencida: s.vencida,
    atrasoEmMinutos: s.atraso_em_minutos,
  };
}

const COLUNAS_DA_SAIDA = `
  s.id, s.ocorrencia_id, s.agente_id, s.sozinho, s.duracao_minutos,
  s.declarada_em, s.registrada_em, s.retorno_previsto_inicial,
  s.retorno_previsto_em, s.prorrogacoes,
  o.protocolo, o.endereco, o.severidade,
  u.nome AS agente_nome, e.nome AS equipe_nome,
  (s.retorno_previsto_em < now()) AS vencida,
  GREATEST(0, floor(extract(epoch FROM (now() - s.retorno_previsto_em)) / 60))::int
    AS atraso_em_minutos
`;

const DE_ONDE = `
  FROM saidas_a_campo s
  JOIN ocorrencias o ON o.organizacao_id = s.organizacao_id AND o.id = s.ocorrencia_id
  JOIN usuarios u    ON u.organizacao_id = s.organizacao_id AND u.id = s.agente_id
  LEFT JOIN equipes e ON e.organizacao_id = s.organizacao_id AND e.id = s.equipe_id
`;

export async function rotasSaidaACampo(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  /**
   * Declarar que está indo.
   *
   * A permissão é `registrar_vistoria`, a mesma da devolução, porque quem vai a
   * campo é quem registra vistoria. Não existe ação nova para "sair", e
   * inventar uma deixaria a lista de permissões com um item que ninguém
   * consegue negar a ninguém sem impedir a pessoa de trabalhar.
   */
  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const d = saidaACampoSchema.parse(req.body);

    /*
      O PORTÃO DE AUTORIA, na mesma posição da rota de vistoria e da de
      devolução, e pelas mesmas duas razões: antes de qualquer leitura de
      ocorrência, para a recusa não virar oráculo de existência, e antes da
      idempotência, porque devolver o recibo de uma saída a quem não a declarou
      é confirmar o ato de outra pessoa para quem apresentou credencial alheia.

      Aqui ele tem uma terceira razão, que é a mais grave das três: uma saída
      com o agente errado faria a coordenação procurar a pessoa errada.
    */
    if (d.agenteId !== quem.usuarioId) {
      throw new RegraDeNegocio(
        "autor_divergente",
        "Esta saída foi declarada por outro agente. Entre neste aparelho com a "
        + "conta de quem vai a campo.",
        409,
      );
    }

    /*
      A MESMA RECUSA, quando a chave repetida é de OUTRA PESSOA.

      O portão acima confere o ENVELOPE, e é o caso do aparelho que mente sobre
      quem subiu. Faltava o caso oposto: o envelope diz a verdade sobre quem
      está com o aparelho, e a CHAVE é a de outra pessoa. O aparelho de plantão
      é compartilhado entre turnos e a chave nasce e fica guardada nele, então
      basta o item do turno anterior ser reenviado com o autor de agora (defeito
      de fila, binário adulterado, ou a mesma troca de turno que já produziu o
      laudo com autor errado) para a rota antiga responder 200 com a saída do
      colega. Duas coisas quebravam de uma vez:

      1. A resposta entregava protocolo, endereço, severidade, nome e equipe de
         uma ocorrência que o portão de equipe, trinta linhas abaixo nesta mesma
         rota, responderia 404 para este agente.
      2. O aparelho recebia `duplicada: true` com uma saída aberta e mostrava
         "você está marcado como em campo". O agente subia o morro achando que
         tinha declarado, e no servidor não havia saída nenhuma no nome dele:
         ninguém iria procurá-lo, porque prazo dele não existia.

      A recusa é a MESMA `autor_divergente` do portão de cima, de propósito: um
      erro novo aqui ("essa chave é de outro agente") confirmaria a existência
      da chave para quem a apresentou.
    */
    const recusarSeNaoForDele = (s: LinhaDeSaida): LinhaDeSaida => {
      if (s.agente_id !== quem.usuarioId) {
        throw new RegraDeNegocio(
          "autor_divergente",
          "Esta saída foi declarada por outro agente. Entre neste aparelho com a "
          + "conta de quem vai a campo.",
          409,
        );
      }
      return s;
    };

    const feita = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Chave já vista: devolve o que foi gravado antes e não toca em nada.
      const anterior = await c.query<LinhaDeSaida>(
        `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
          WHERE s.organizacao_id = $1 AND s.idempotency_key = $2`,
        [quem.organizacaoId, d.idempotencyKey],
      );
      if (anterior.rows[0]) {
        return { saida: recusarSeNaoForDele(anterior.rows[0]), jaExistia: true };
      }

      /*
        JÁ TEM UMA SAÍDA ABERTA, e esta recusa vem ANTES da leitura da
        ocorrência de propósito.

        "Onde ele está agora" tem UMA resposta. O índice único parcial da
        migração 031 recusa a segunda, e sem esta conferência a recusa chegaria
        como erro de restrição de banco, ou seja, como 500 e "erro inesperado,
        informe o código ao suporte", para um problema que ele resolve em uma
        tocada confirmando o retorno da anterior.

        A resposta devolve a saída aberta junto: é o que permite o aplicativo
        mostrar "você ainda está marcado como em campo desde as 09:12" em vez de
        só recusar.
      */
      const aberta = await c.query<LinhaDeSaida>(
        `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
          WHERE s.organizacao_id = $1 AND s.agente_id = $2 AND s.encerrada_em IS NULL`,
        [quem.organizacaoId, quem.usuarioId],
      );
      if (aberta.rows[0]) {
        throw new RegraDeNegocio(
          "saida_ja_aberta",
          "Você já está marcado como em campo. Confirme o retorno da saída "
          + "anterior antes de declarar outra.",
        );
      }

      /*
        A ocorrência é lida sob RLS. Ocorrência de outro município e ocorrência
        que nunca existiu respondem igual, e o 404 é a resposta de sempre: um
        403 confirmaria que o registro existe, e confirmar existência já é
        vazamento.
      */
      const oc = await c.query<{ id: string; status: string; equipe_id: string | null }>(
        "SELECT id, status, equipe_id FROM ocorrencias WHERE id = $1",
        [d.ocorrenciaId],
      );
      const alvo = oc.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      /*
        A equipe do agente sai do BANCO e não do token, como na vistoria e na
        devolução: o token pode ter sido emitido antes de uma troca de equipe, e
        o que vale é a lotação de hoje.
      */
      const lotacao = await c.query<{ equipe_id: string | null }>(
        "SELECT equipe_id FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      const equipeDoAgente = lotacao.rows[0]?.equipe_id ?? null;

      /*
        O PORTÃO DE EQUIPE, com a mesma resposta 404 da devolução: ocorrência de
        outra equipe fica indistinguível de identificador que nunca existiu. A
        comparação exige equipe designada de verdade, senão um agente sem
        lotação (`null`) declararia saída para ocorrência sem despacho pela
        coincidência de dois nulos.
      */
      if (!alvo.equipe_id || alvo.equipe_id !== equipeDoAgente) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      /*
        SÓ SE DECLARA SAÍDA PARA O QUE AINDA ESTÁ EM CAMPO.

        Ocorrência encerrada ou já vistoriada não tem ida a fazer, e uma saída
        declarada sobre ela encheria a tela da coordenação de linhas que não
        correspondem a ninguém no morro. Ruído nesta tela é o que a faz parar
        de ser olhada.
      */
      if (alvo.status !== "em_campo") {
        throw new RegraDeNegocio(
          "status_nao_permite",
          "Essa tarefa não está mais em campo. Atualize a lista para ver o que mudou.",
        );
      }

      /*
        O PRAZO É CALCULADO AQUI DENTRO, PELO POSTGRES.

        `now() + duração`, na mesma transação da escrita. Não passa por
        TypeScript, não passa pelo relógio do processo da API e nunca passa pelo
        relógio do aparelho. É a linha mais importante deste arquivo: um relógio
        adiantado em duas horas faria o alerta de um agente que não desceu sair
        duas horas depois do que deveria.
      */
      const inserida = await c.query<{ id: string }>(
        `INSERT INTO saidas_a_campo
           (organizacao_id, ocorrencia_id, agente_id, equipe_id, sozinho,
            duracao_minutos, declarada_em,
            retorno_previsto_inicial, retorno_previsto_em, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
                 now() + make_interval(mins => $6::int),
                 now() + make_interval(mins => $6::int),
                 $8)
         ON CONFLICT ON CONSTRAINT saida_idempotente DO NOTHING
         RETURNING id`,
        [
          quem.organizacaoId, d.ocorrenciaId, quem.usuarioId, equipeDoAgente,
          d.sozinho, d.duracaoMinutos, d.declaradaEm, d.idempotencyKey,
        ],
      );

      /*
        Nenhuma linha voltou significa que a chave JÁ ESTAVA no banco, gravada
        entre a consulta lá em cima e este INSERT. É a mesma corrida da vistoria
        e da devolução, pelo mesmo motivo: o aparelho desiste por tempo esgotado
        e repete enquanto o servidor ainda processa o primeiro.
      */
      if (!inserida.rows[0]) {
        const concorrente = await c.query<LinhaDeSaida>(
          `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
            WHERE s.organizacao_id = $1 AND s.idempotency_key = $2`,
          [quem.organizacaoId, d.idempotencyKey],
        );
        const jaGravada = concorrente.rows[0];
        if (!jaGravada) {
          throw new Error(
            "INSERT de saída a campo não gravou e a chave de idempotência não está "
            + "no banco. Restrição de unicidade inesperada.",
          );
        }
        return { saida: recusarSeNaoForDele(jaGravada), jaExistia: true };
      }

      const gravada = await c.query<LinhaDeSaida>(
        `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
          WHERE s.organizacao_id = $1 AND s.id = $2`,
        [quem.organizacaoId, inserida.rows[0].id],
      );
      const saida = gravada.rows[0]!;

      /*
        A trilha, na MESMA transação. Duas marcas de tempo, como no evento de
        vistoria e no de devolução: `ocorrido_em` é a hora do aparelho e
        `registrado_em` é a do servidor.

        O detalhe leva o PRAZO calculado pelo servidor, e não a duração sozinha:
        é ele que torna auditável, depois, a que horas a coordenação deveria ter
        começado a estranhar. Sem ele, uma prorrogação apagaria a única prova de
        qual era o combinado original, porque `retorno_previsto_em` anda.

        Nada de texto livre aqui, pela regra que a devolução já fixou: a trilha
        é append-only, e o que entra nela não sai mais por caminho nenhum.
      */
      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'saida_a_campo_declarada',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, d.ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
          d.declaradaEm,
          JSON.stringify({
            saidaId: saida.id,
            sozinho: d.sozinho,
            duracaoMinutos: d.duracaoMinutos,
            retornoPrevistoEm: saida.retorno_previsto_em,
            equipeId: equipeDoAgente,
          }),
        ],
      );

      return { saida, jaExistia: false };
    });

    return resposta.code(feita.jaExistia ? 200 : 201).send({
      saida: daLinha(feita.saida),
      duplicada: feita.jaExistia,
      /*
        A FRASE QUE O APARELHO MOSTRA, e ela sai do servidor de propósito.

        Ela é a única promessa que o produto faz ao agente sobre a segurança
        dele, e promessa não pode ficar escrita em três telas diferentes com
        três redações diferentes. Ela diz o que acontece, e não o que seria bom
        acontecer: quem olha, quando, e o que o produto NÃO faz.
      */
      aviso: "A coordenação vê que você saiu e vê o prazo. Se ninguém confirmar "
        + "o retorno até lá, sua saída aparece como prazo estourado no painel. "
        + "Isto não é botão de apoio: ninguém é acionado automaticamente.",
    });
  });

  /**
   * Empurrar o prazo.
   *
   * Sem isto, todo serviço que demora mais que o previsto vira alarme falso, e
   * alarme falso repetido é o único jeito conhecido de matar este recurso de
   * vez: a coordenação aprende a ignorar a tela.
   */
  app.post("/prorrogar", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const p = prorrogacaoDeSaidaSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        A saída é amarrada ao AGENTE DO TOKEN na própria cláusula, e não lida e
        depois conferida. Saída de colega responde "não encontrada" igual a
        identificador que nunca existiu, e o agente que só tem uma saída aberta
        não consegue, nem por engano, empurrar o prazo de segurança de outra
        pessoa que está no morro.
      */
      const alvo = await c.query<{ id: string; ocorrencia_id: string;
        retorno_previsto_em: Date | string; prorrogacoes: number;
        prorrogacao_key: string | null }>(
        `SELECT id, ocorrencia_id, retorno_previsto_em, prorrogacoes, prorrogacao_key
           FROM saidas_a_campo
          WHERE id = $1 AND agente_id = $2 AND encerrada_em IS NULL`,
        [p.saidaId, quem.usuarioId],
      );
      const saida = alvo.rows[0];
      if (!saida) {
        throw new RegraDeNegocio(
          "nao_encontrada",
          "Essa saída não está aberta neste sistema.",
          404,
        );
      }

      /*
        A CHAVE DE IDEMPOTÊNCIA, QUE O ESQUEMA EXIGIA E ESTA ROTA DESCARTAVA.

        Prorrogar é o único ato deste recurso praticado do alto do morro, com o
        pior sinal do dia: o pedido vai, o servidor grava, a resposta se perde, e
        o aparelho repete. É a MESMA corrida que a declaração da saída trata com
        `ON CONFLICT`, na rota acima. Repetida, ela contava `prorrogacoes` em
        dobro (e esse número é o que diz à coordenação se o agente está demorando
        muito mais do que disse) e escrevia DOIS eventos na trilha, que é
        append-only e não desfaz nenhum dos dois.

        A comparação é com a ÚLTIMA chave aceita, e o limite está dito na
        migração 032: ela dedupe o reenvio, que é o único caso real, porque a
        repetição chega logo em seguida e o aparelho sorteia uma chave por
        pedido.
      */
      if (saida.prorrogacao_key === p.idempotencyKey) {
        return {
          saidaId: saida.id,
          retornoPrevistoEm: saida.retorno_previsto_em,
          prorrogacoes: saida.prorrogacoes,
          duplicada: true,
        };
      }

      /*
        O NOVO PRAZO CONTA A PARTIR DE `now()`, E NÃO DO PRAZO ANTIGO.

        Esta é a decisão menos óbvia do arquivo, e o caminho intuitivo está
        errado. Somar ao prazo antigo faria uma saída já vencida há duas horas,
        prorrogada em trinta minutos, continuar vencida: o agente pediria mais
        tempo, o pedido seria aceito, e a tela continuaria acusando atraso.
        Contado de agora, "mais trinta minutos" quer dizer trinta minutos a
        partir de agora, que é o que quem apertou entendeu que estava pedindo.

        `GREATEST` garante o que o CHECK `prorrogacao_nao_encurta` cobra: uma
        prorrogação nunca encurta o prazo de segurança de alguém que está lá
        fora. Se o prazo antigo ainda for maior que o novo, ele fica.
      */
      /*
        `encerrada_em IS NULL` TAMBÉM AQUI, e não só na leitura acima.

        Entre a leitura e esta escrita cabe o encerramento pelo painel, e é a
        corrida real desta rota: a coordenação fala com o agente pelo rádio e
        encerra no mesmo segundo em que o aparelho dele reencontra sinal. Sem a
        cláusula, o UPDATE empurrava o prazo de uma saída JÁ ENCERRADA, e uma
        saída que foi encerrada com quarenta minutos de atraso passava a exibir
        prazo no futuro: o atraso sumia da linha que existe justamente para
        provar que o município demorou a reagir.
      */
      const atualizada = await c.query<{ retorno_previsto_em: Date | string;
        prorrogacoes: number }>(
        `UPDATE saidas_a_campo
            SET retorno_previsto_em = GREATEST(
                  retorno_previsto_em,
                  now() + make_interval(mins => $2::int)
                ),
                prorrogacoes = prorrogacoes + 1,
                prorrogacao_key = $3
          WHERE id = $1 AND encerrada_em IS NULL
        RETURNING retorno_previsto_em, prorrogacoes`,
        [p.saidaId, p.minutosAdicionais, p.idempotencyKey],
      );
      const nova = atualizada.rows[0];
      if (!nova) {
        /*
          Zero linhas significa que alguém encerrou a saída entre a leitura e
          esta escrita. Não há prazo a empurrar numa saída encerrada, e a mesma
          404 da leitura é a resposta: o aparelho para de insistir e a tela
          manda atualizar.
        */
        throw new RegraDeNegocio(
          "nao_encontrada",
          "Essa saída não está mais aberta neste sistema.",
          404,
        );
      }

      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'saida_a_campo_prorrogada',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, saida.ocorrencia_id, quem.usuarioId, quem.nome, quem.papel,
          p.pedidaEm,
          /*
            Os DOIS prazos, o de antes e o de agora. Sem o de antes, a trilha
            registraria que houve prorrogação e perderia de quanto ela foi, que
            é a única pergunta que alguém faz sobre isto depois.
          */
          JSON.stringify({
            saidaId: saida.id,
            minutosAdicionais: p.minutosAdicionais,
            prazoAnterior: saida.retorno_previsto_em,
            retornoPrevistoEm: nova.retorno_previsto_em,
            prorrogacoes: nova.prorrogacoes,
          }),
        ],
      );

      return {
        saidaId: saida.id,
        retornoPrevistoEm: nova.retorno_previsto_em,
        prorrogacoes: nova.prorrogacoes,
        duplicada: false,
      };
    });
  });

  /**
   * Confirmar o retorno.
   *
   * É o único desfecho que o próprio agente escreve, e a coordenação não
   * consegue escrevê-lo por ele: ver `DESFECHOS_DA_COORDENACAO` no pacote
   * compartilhado.
   */
  app.post("/retorno", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const r = retornoDeCampoSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const alvo = await c.query<{ id: string; ocorrencia_id: string;
        encerrada_em: Date | string | null; desfecho: string | null;
        retorno_previsto_em: Date | string }>(
        `SELECT id, ocorrencia_id, encerrada_em, desfecho, retorno_previsto_em
           FROM saidas_a_campo WHERE id = $1 AND agente_id = $2`,
        [r.saidaId, quem.usuarioId],
      );
      const saida = alvo.rows[0];
      if (!saida) {
        throw new RegraDeNegocio(
          "nao_encontrada",
          "Essa saída não existe neste sistema.",
          404,
        );
      }

      /*
        JÁ ENCERRADA NÃO É ERRO, e tratar como erro seria o defeito.

        O caso normal é este: o agente perde o sinal, o prazo estoura, a
        coordenação fala com ele pelo rádio e encerra a saída, e o aparelho dele
        só reencontra rede depois. Se a confirmação tardia virasse recusa
        vermelha, o agente receberia um erro por ter feito exatamente a coisa
        certa, e o item ficaria travado na tela dele.

        Devolve quem encerrou e com que desfecho, que é o que permite a tela
        dizer "a coordenação já registrou o seu retorno" em vez de fingir que
        acabou de gravar.
      */
      if (saida.encerrada_em) {
        return {
          saidaId: saida.id,
          encerradaEm: saida.encerrada_em,
          desfecho: saida.desfecho,
          duplicada: true,
        };
      }

      const fechada = await c.query<{ encerrada_em: Date | string }>(
        `UPDATE saidas_a_campo
            SET encerrada_em = now(), encerrada_por = $2, desfecho = 'retorno_confirmado'
          WHERE id = $1 AND encerrada_em IS NULL
        RETURNING encerrada_em`,
        [r.saidaId, quem.usuarioId],
      );
      /*
        Zero linhas aqui significa que alguém encerrou entre a leitura e o
        UPDATE, que é a corrida real desta rota: a coordenação encerra pelo
        painel no mesmo segundo em que o aparelho reencontra sinal. Não é erro,
        é o mesmo desfecho do caso acima, relido.
      */
      if (!fechada.rows[0]) {
        const agora = await c.query<{ encerrada_em: Date | string; desfecho: string }>(
          "SELECT encerrada_em, desfecho FROM saidas_a_campo WHERE id = $1",
          [r.saidaId],
        );
        const linha = agora.rows[0]!;
        return {
          saidaId: saida.id,
          encerradaEm: linha.encerrada_em,
          desfecho: linha.desfecho,
          duplicada: true,
        };
      }

      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'retorno_de_campo_confirmado',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, saida.ocorrencia_id, quem.usuarioId, quem.nome, quem.papel,
          r.confirmadoEm,
          /*
            `noPrazo` é calculado com o prazo do servidor contra o encerramento
            do servidor, e nunca com `confirmadoEm`, que é hora de aparelho. Um
            relógio atrasado faria a trilha afirmar que o agente voltou no prazo
            quando ele voltou três horas depois.
          */
          JSON.stringify({
            saidaId: saida.id,
            retornoPrevistoEm: saida.retorno_previsto_em,
            noPrazo: new Date(fechada.rows[0].encerrada_em).getTime()
              <= new Date(saida.retorno_previsto_em).getTime(),
          }),
        ],
      );

      return {
        saidaId: saida.id,
        encerradaEm: fechada.rows[0].encerrada_em,
        desfecho: "retorno_confirmado" as DesfechoDeSaida,
        duplicada: false,
      };
    });
  });

  /**
   * Quem está em campo agora, e quem estourou o prazo.
   *
   * A tela que a coordenação deixa aberta. Devolve só o que está ABERTO: saída
   * encerrada é história, e história mora na trilha da ocorrência. Uma lista que
   * misturasse as duas viraria um extrato que ninguém lê, e esta tela precisa
   * ser lida de relance.
   */
  app.get("/", async (req) => {
    const quem = await autorizar(app, req, "acompanhar_saida_a_campo");

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        A ORDEM É A LEITURA DA TELA, e ela é deliberada: vencidas primeiro, e
        dentro das vencidas quem foi SOZINHO antes de quem foi acompanhado.

        Trabalhar sozinho é a categoria inteira de risco de que isto trata. Uma
        saída vencida de quem foi acompanhado é um aborrecimento; uma de quem
        foi sozinho é a que justifica largar o que se está fazendo. Depois das
        vencidas, as que vencem primeiro.
      */
      const lista = await c.query<LinhaDeSaida>(
        `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
          WHERE s.encerrada_em IS NULL
          ORDER BY (s.retorno_previsto_em < now()) DESC,
                   (s.retorno_previsto_em < now() AND s.sozinho) DESC,
                   s.retorno_previsto_em ASC`,
      );

      const itens = lista.rows.map(daLinha);
      return {
        itens,
        emCampo: itens.length,
        vencidas: itens.filter((i) => i.vencida).length,
        /*
          O NÚMERO NÃO VEM SOZINHO, e esta frase acompanha ele até na tela.

          "3 em campo" com um selo vermelho ao lado pareceria um painel de
          monitoramento, e este produto não monitora ninguém: ele mostra o que
          foi declarado. Dizer isso junto do número é o que impede a
          coordenação de confiar num alarme que não existe.
        */
        limite: "Esta lista mostra o que os agentes declararam, e nada além "
          + "disso. O sistema não detecta queda, não sabe onde a pessoa está "
          + "agora e não aciona ninguém sozinho.",
      };
    });
  });

  /**
   * A coordenação encerra uma saída, dizendo o que houve.
   *
   * ESTE É O ATO QUE O RECURSO EXISTE PARA TORNAR REGISTRÁVEL. Sem ele, a única
   * coisa que o produto guardaria sobre a segurança de um servidor seria o
   * alerta, e a pergunta que uma apuração faz não é "houve alerta", é "o que
   * fizeram quando ele apareceu". Seis meses depois, "a prefeitura não fez
   * nada" passaria a valer para o próprio agente da prefeitura.
   */
  app.post("/encerrar", async (req) => {
    const quem = await autorizar(app, req, "acompanhar_saida_a_campo");
    const e = encerramentoDeSaidaSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const alvo = await c.query<{ id: string; ocorrencia_id: string; agente_id: string;
        encerrada_em: Date | string | null; retorno_previsto_em: Date | string }>(
        `SELECT id, ocorrencia_id, agente_id, encerrada_em, retorno_previsto_em
           FROM saidas_a_campo WHERE id = $1`,
        [e.saidaId],
      );
      const saida = alvo.rows[0];
      if (!saida) {
        throw new RegraDeNegocio(
          "nao_encontrada",
          "Essa saída não existe neste sistema.",
          404,
        );
      }
      /*
        JÁ ENCERRADA RECUSA, e aqui a recusa é a resposta certa, ao contrário da
        rota de retorno. Lá quem repetia era o aparelho drenando fila; aqui é
        uma pessoa clicando num botão numa tela, e deixar passar em silêncio
        produziria dois encerramentos para o mesmo fato, o segundo por cima do
        primeiro, num registro que existe para ser prova.
      */
      if (saida.encerrada_em) {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa saída já foi encerrada. Atualize a tela para ver por quem.",
        );
      }

      const fechada = await c.query<{ encerrada_em: Date | string }>(
        `UPDATE saidas_a_campo
            SET encerrada_em = now(), encerrada_por = $2,
                desfecho = $3, observacao = $4
          WHERE id = $1 AND encerrada_em IS NULL
        RETURNING encerrada_em`,
        [e.saidaId, quem.usuarioId, e.desfecho, e.observacao ?? null],
      );
      if (!fechada.rows[0]) {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa saída já foi encerrada. Atualize a tela para ver por quem.",
        );
      }

      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'saida_a_campo_encerrada',$3,$4,$5,'escritorio',now(),$6)`,
        [
          quem.organizacaoId, saida.ocorrencia_id, quem.usuarioId, quem.nome, quem.papel,
          /*
            O TEXTO NÃO ENTRA NA TRILHA, pela mesma regra da devolução: ela é
            append-only, e o que entra não sai por caminho nenhum. A observação
            fica em `saidas_a_campo`, que é onde ela pode ser lida por quem tem
            a permissão e onde ela cabe numa revisão, e a trilha guarda que
            houve texto e o ponteiro para achá-lo.

            O desfecho é de LISTA FECHADA, então ele não é frase sobre ninguém e
            entra inteiro, em chave e em português.
          */
          JSON.stringify({
            saidaId: saida.id,
            agenteId: saida.agente_id,
            desfecho: e.desfecho,
            desfechoRotulo: ROTULO_DESFECHO_DE_SAIDA[e.desfecho],
            temObservacao: Boolean(e.observacao),
            retornoPrevistoEm: saida.retorno_previsto_em,
            /*
              Estava vencida quando a coordenação encerrou? É a pergunta que uma
              apuração faz primeiro, e ela não se responde depois: `now()` de
              hoje não diz nada sobre o prazo de seis meses atrás sem alguém
              refazer a conta à mão.
            */
            estavaVencida: new Date(fechada.rows[0].encerrada_em).getTime()
              > new Date(saida.retorno_previsto_em).getTime(),
          }),
        ],
      );

      return {
        saidaId: saida.id,
        encerradaEm: fechada.rows[0].encerrada_em,
        desfecho: e.desfecho,
      };
    });
  });

  /**
   * A minha saída aberta, se houver.
   *
   * O aparelho pergunta isto ao abrir, e a resposta é o que impede o defeito
   * mais banal deste recurso: o agente declara a saída, o aplicativo é
   * reiniciado (bateria, atualização, sistema matando o processo), e ele volta
   * sem nenhuma indicação de que está marcado como em campo. Ele não confirma o
   * retorno, e a coordenação passa a ver um alerta de alguém que está na base.
   */
  app.get("/minha", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const aberta = await c.query<LinhaDeSaida>(
        `SELECT ${COLUNAS_DA_SAIDA} ${DE_ONDE}
          WHERE s.agente_id = $1 AND s.encerrada_em IS NULL`,
        [quem.usuarioId],
      );
      const saida = aberta.rows[0];
      return { saida: saida ? daLinha(saida) : null };
    });
  });
}
