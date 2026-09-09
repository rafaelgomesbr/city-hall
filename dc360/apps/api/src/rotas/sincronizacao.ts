import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chaveDeStorage, envelopeSincronizacaoSchema } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";

/**
 * Teto de 200 de proposito: o aparelho manda o que tem guardado, e uma lista
 * sem limite viraria caminho barato para varrer identificadores.
 *
 * Este numero e combinado com o aplicativo: `TETO_DE_RECONCILIACAO` em
 * `apps/campo/src/dados/api.ts` corta a lista no mesmo 200 antes de enviar. Se
 * os dois divergirem, quem paga e o aparelho que ficou muito tempo fora, que e
 * o que tem mais ids guardados e o que mais precisa da reconciliacao: ele leva
 * 422 e perde a explicacao inteira, em vez de perder o excedente.
 */
export const TETO_DE_RECONCILIACAO = 200;

const reconciliacaoSchema = z.object({
  conhecidas: z.array(z.string().uuid()).max(TETO_DE_RECONCILIACAO),
});

/**
 * Quantas tarefas cabem numa resposta de `/pendencias`.
 *
 * Escolhido para caber no 3G do morro, e nao para caber no banco. O numero
 * casa com o teto da reconciliacao de proposito: o aparelho guarda no maximo
 * esta quantidade de tarefas, entao perguntar por elas depois nunca estoura o
 * outro teto.
 */
const TETO_DE_PENDENCIAS = 200;

/**
 * Recepção da coleta feita em campo.
 *
 * Esta é a rota que decide se o produto funciona no mundo real. O agente
 * coleta sem sinal, o aparelho guarda na fila, e o envio acontece quando a
 * rede volta, muitas vezes já dentro do carro, com a conexão indo e vindo. A
 * consequência prática é que a MESMA coleta chega mais de uma vez, e um laudo
 * duplicado numa vistoria de interdição é problema jurídico, não estético.
 *
 * A defesa é a chave de idempotência gerada no aparelho, com unicidade por
 * município garantida no banco. Reenvio não vira registro novo: a API
 * reconhece a chave e devolve o resultado da primeira vez, com 200 em vez de
 * 201. O aparelho não precisa saber se foi o primeiro envio ou o quinto.
 */
export async function rotasSincronizacao(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.post("/vistoria", async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const envelope = envelopeSincronizacaoSchema.parse(req.body);

    const { vistoriaId, jaExistia } = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Chave já vista: devolve o que foi gravado antes e não toca em nada.
      const anterior = await c.query<{ id: string }>(
        "SELECT id FROM vistorias WHERE idempotency_key = $1",
        [envelope.idempotencyKey],
      );
      if (anterior.rows[0]) {
        return { vistoriaId: anterior.rows[0].id, jaExistia: true };
      }

      const ocorrencia = await c.query<{ id: string; status: string }>(
        "SELECT id, status FROM ocorrencias WHERE id = $1",
        [envelope.ocorrenciaId],
      );
      const alvo = ocorrencia.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }
      if (alvo.status === "encerrada") {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa ocorrência já foi encerrada e não aceita vistoria nova.",
        );
      }

      const v = envelope.vistoria;

      /**
       * A chave da assinatura nunca é aceita como veio.
       *
       * Este campo é o único do envelope que ia cru para o banco. A foto, no
       * mesmo envelope, já conferia o prefixo do município logo abaixo; a
       * assinatura não conferia nada, e a coluna era `text` puro. Enquanto o
       * traço era gravado e nunca lido, o campo era inerte. No dia em que o
       * laudo passou a exibi-lo, virou um caminho de leitura: bastava apontar
       * para um objeto de outra prefeitura e o documento saía com uma URL
       * assinada dela.
       *
       * A regra aqui é a mesma da foto, e mais estrita porque não existe
       * fluxo de envio antecipado de assinatura: o servidor remonta a chave a
       * partir do token e do nome do arquivo, sempre. O que o cliente escolhe
       * é, no máximo, o nome.
       */
      const assinaturaChave = v.assinaturaChave
        ? chaveDeStorage(
            quem.organizacaoId,
            envelope.ocorrenciaId,
            v.assinaturaChave.split("/").pop() ?? "assinatura.png",
          )
        : null;

      const inserida = await c.query<{ id: string }>(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros,
            assinante_nome, assinatura_chave, observacoes, coletada_em, idempotency_key,
            desalojados, desabrigados, feridos, desaparecidos, obitos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (organizacao_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          quem.organizacaoId, envelope.ocorrenciaId, quem.usuarioId,
          JSON.stringify(v.checklist), v.gpsPrecisaoMetros,
          v.assinanteNome, assinaturaChave, v.observacoes ?? null,
          v.coletadaEm, envelope.idempotencyKey,
          /*
            `?? null` e não `?? 0`. Ausente significa NÃO CONTADO, e é uma
            afirmação diferente de "contei e deu zero". Zero por omissão faria
            toda coleta de aplicativo antigo declarar que ninguém saiu de casa.
          */
          v.desalojados ?? null, v.desabrigados ?? null, v.feridos ?? null,
          v.desaparecidos ?? null, v.obitos ?? null,
        ],
      );
      /*
        Nenhuma linha voltou significa que a chave JÁ ESTAVA no banco, gravada
        entre a consulta lá em cima e este INSERT. Não é caso hipotético: o
        aparelho desiste por tempo esgotado e repete o envio enquanto o servidor
        ainda está processando o primeiro, e os dois passam pela consulta sem
        achar nada.

        Antes, o segundo envio batia na restrição de unicidade e virava erro
        500. O dado estava a salvo, mas o agente via falha numa coleta que já
        tinha sido gravada, e o item ficava preso na fila do aparelho PARA
        SEMPRE, porque a fila reenviaria e receberia o mesmo erro. Vistoria
        salva no servidor e presa no aparelho é a pior combinação possível:
        ninguém procura o que já chegou.

        `DO NOTHING` mais releitura transforma a corrida no mesmo desfecho do
        reenvio comum: a rota responde com a vistoria que existe e marca como
        duplicada. As evidências, nesta mesma rota, já faziam isso; a vistoria
        não fazia.
      */
      if (!inserida.rows[0]) {
        const concorrente = await c.query<{ id: string }>(
          "SELECT id FROM vistorias WHERE idempotency_key = $1",
          [envelope.idempotencyKey],
        );
        const jaGravada = concorrente.rows[0];
        /*
          Sem linha aqui, a unicidade recusou por outro motivo que não a chave,
          e engolir isso esconderia defeito de verdade. Erra alto e ruidoso.
        */
        if (!jaGravada) {
          throw new Error(
            "INSERT de vistoria não gravou e a chave de idempotência não está no banco. " +
            "Restrição de unicidade inesperada.",
          );
        }
        return { vistoriaId: jaGravada.id, jaExistia: true };
      }

      const novaId = inserida.rows[0].id;

      for (const [ordem, foto] of v.fotos.entries()) {
        /**
         * A foto pode ter subido antes, pelo fluxo de evidência: nesse caso a
         * linha já existe no banco, com `enviada_em` preenchido, e o que falta
         * é amarrá-la a esta vistoria.
         *
         * A chave só é aceita como veio se ela pertencer a ESTA organização e
         * a ESTA ocorrência. Qualquer outra coisa é remontada a partir do
         * nome, porque aceitar chave escolhida pelo cliente permitiria gravar
         * sob o prefixo de outra prefeitura.
         */
        const prefixoEsperado = `tenant/${quem.organizacaoId}/ocorrencias/${envelope.ocorrenciaId}/`;
        const jaEnviada = foto.chave.startsWith(prefixoEsperado);

        if (jaEnviada) {
          const vinculada = await c.query<{ id: string }>(
            `UPDATE evidencias SET vistoria_id = $1, ordem = $2, legenda = COALESCE($3, legenda)
              WHERE ocorrencia_id = $4 AND chave_storage = $5
              RETURNING id`,
            [novaId, ordem, foto.legenda ?? null, envelope.ocorrenciaId, foto.chave],
          );
          if (vinculada.rows[0]) continue;
          // Chave com o prefixo certo mas sem linha correspondente: o aparelho
          // inventou. Cai no caminho de baixo, que remonta uma chave nova.
        }

        const chave = chaveDeStorage(
          quem.organizacaoId,
          envelope.ocorrenciaId,
          foto.chave.split("/").pop() ?? `foto-${ordem + 1}.jpg`,
        );
        await c.query(
          `INSERT INTO evidencias
             (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda,
              latitude, longitude, capturada_em, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (organizacao_id, chave_storage) DO NOTHING`,
          [
            quem.organizacaoId, envelope.ocorrenciaId, novaId, chave, foto.legenda ?? null,
            foto.coordenada?.lat ?? null, foto.coordenada?.lng ?? null,
            foto.capturadaEm, ordem,
          ],
        );
      }

      if (alvo.status === "em_campo") {
        await c.query(
          "UPDATE ocorrencias SET status = 'vistoria_concluida' WHERE id = $1",
          [envelope.ocorrenciaId],
        );
      }

      /**
       * Duas marcas de tempo no evento, de propósito: `ocorrido_em` é a hora
       * da coleta no aparelho, `registrado_em` é o padrão do banco, a hora em
       * que o servidor recebeu. As duas diferem em toda coleta offline, e o
       * laudo precisa poder mostrar as duas para não parecer que a vistoria
       * foi feita na hora em que o sinal voltou.
       */
      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'vistoria',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, envelope.ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
          v.coletadaEm,
          JSON.stringify({
            fotos: v.fotos.length,
            gpsPrecisaoMetros: v.gpsPrecisaoMetros,
            assinante: v.assinanteNome,
          }),
        ],
      );

      return { vistoriaId: novaId, jaExistia: false };
    });

    return resposta.code(jaExistia ? 200 : 201).send({
      vistoriaId,
      duplicada: jaExistia,
    });
  });

  /**
   * Por que a tarefa sumiu da lista do agente.
   *
   * O aparelho apaga e reescreve a lista inteira a cada atualização
   * (`apps/campo/src/dados/pendencias.ts`), então uma ocorrência encerrada no
   * painel simplesmente DESAPARECE da tela do agente, sem lápide e sem aviso.
   * Se ele tinha uma vistoria em andamento naquela tarefa, o rascunho fica
   * órfão e invisível, e ao abrir o protocolo pelo caminho antigo ele recebe
   * "não está guardada neste aparelho, conecte-se e baixe de novo", que sugere
   * problema de download quando o que houve foi cancelamento.
   *
   * O aparelho manda os ids que conhece e recebe de volta o que saiu e por quê.
   * Escolhido em vez de janela de tempo fixa (que chuta quantos dias guardar, e
   * erra justamente no aparelho que ficou muito tempo fora) e em vez de cursor
   * de alteração (que exigiria coluna, gatilho e índice novos, e cai em
   * sincronização completa quando o cursor se perde).
   *
   * RESTRIÇÃO DE ISOLAMENTO, e ela não é opcional: só responde sobre ocorrência
   * da equipe do próprio agente. Sem isso a rota vira oráculo de status,
   * porque quem tem um id qualquer descobre em que pé está a ocorrência de
   * outra equipe. Município diferente já some no RLS, que é o comportamento
   * certo: indistinguível de id inexistente.
   */
  app.post("/pendencias/reconciliar", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const { conhecidas } = reconciliacaoSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const atuais = await c.query<{ id: string }>(
        `SELECT o.id
           FROM ocorrencias o
           JOIN usuarios u ON u.equipe_id = o.equipe_id
          WHERE u.id = $1 AND o.status = 'em_campo'`,
        [quem.usuarioId],
      );
      const ativos = new Set(atuais.rows.map((r) => r.id));
      const sumiram = conhecidas.filter((id: string) => !ativos.has(id));

      if (sumiram.length === 0) return { saidas: [] };

      /*
        A equipe é conferida contra a equipe ATUAL do agente, e o desfecho
        "passou para outra equipe" sai daí. A ocorrência que nunca foi da equipe
        dele simplesmente não aparece na resposta, e é assim que a rota deixa de
        ser oráculo: id desconhecido e id de outra equipe são indistinguíveis.
      */
      const minhaEquipe = await c.query<{ equipe_id: string | null }>(
        "SELECT equipe_id FROM usuarios WHERE id = $1", [quem.usuarioId],
      );
      const equipeDoAgente = minhaEquipe.rows[0]?.equipe_id ?? null;

      /*
        Duas portas, e so duas:

        1. A ocorrencia continua sendo da equipe do agente. E o caso comum:
           encerrada, devolvida para triagem, ou vistoria ja concluida.
        2. A ocorrencia mudou de equipe, e o agente tinha coletado nela. Sem
           isso, quem estava no meio de uma vistoria quando a coordenacao
           trocou a equipe recebe silencio.

        Fora dessas duas, a ocorrencia NAO aparece na resposta, e id de outra
        equipe fica indistinguivel de id que nunca existiu. Essa e a linha que
        impede a rota de virar oraculo de status.
      */
      const r = await c.query<{
        id: string; protocolo: string; status: string;
        motivo_encerramento: string | null; encerrado_em: string | null;
        equipe_id: string | null;
      }>(
        `SELECT o.id, o.protocolo, o.status, o.motivo_encerramento, o.encerrado_em,
                o.equipe_id
           FROM ocorrencias o
          WHERE o.id = ANY($1::uuid[])
            AND (
              o.equipe_id IS NOT DISTINCT FROM $3::uuid
              OR EXISTS (
                SELECT 1 FROM vistorias v
                 WHERE v.ocorrencia_id = o.id AND v.agente_id = $2
              )
            )`,
        [sumiram, quem.usuarioId, equipeDoAgente],
      );

      return {
        saidas: r.rows.map((o) => ({
          id: o.id,
          protocolo: o.protocolo,
          status: o.status,
          motivo: o.motivo_encerramento,
          saiuEm: o.encerrado_em,
          /*
            O motivo em linguagem de quem está na rua. O status cru não serve:
            "vistoria_concluida" e "encerrada" pedem reações opostas do agente,
            e uma delas não é alarme nenhum.
          */
          desfecho: o.status === "vistoria_concluida"
            ? "concluida"
            : o.status === "encerrada"
              ? "encerrada"
              : o.equipe_id !== equipeDoAgente
                ? "outra_equipe"
                : "devolvida",
        })),
      };
    });
  });

  /**
   * O que o aparelho precisa baixar para trabalhar sem sinal: as ocorrências
   * despachadas para as equipes do agente.
   *
   * A resposta é limitada, e DECLARA que limitou. Sem `LIMIT`, uma equipe com
   * muita ocorrência despachada baixava tudo de uma vez, e quem paga a conta é
   * o aparelho no 3G do morro, que é exatamente onde a lista precisa chegar.
   *
   * `truncada` existe porque calar seria pior que cortar: o agente veria uma
   * lista aparentemente completa e concluiria que as outras tarefas não são
   * dele. Com o aviso, o aplicativo pode dizer que há mais trabalho do que cabe
   * nesta lista, e a coordenação descobre que despachou demais para uma equipe
   * só, que é o problema de verdade por trás de uma lista estourada.
   */
  app.get("/pendencias", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        Uma linha a mais do que o teto, de propósito: é como a rota descobre que
        há mais sem pagar um `count(*)` na mesma tabela. A linha excedente é
        cortada antes de sair daqui.
      */
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.endereco,
                o.ponto_referencia, o.latitude, o.longitude,
                o.descricao, o.solicitante_nome, o.solicitante_contato,
                o.vulnerabilidade_presente, o.vulnerabilidade_descricao,
                o.prazo_em, o.criado_em
           FROM ocorrencias o
           JOIN usuarios u ON u.equipe_id = o.equipe_id
          WHERE u.id = $1 AND o.status = 'em_campo'
          ORDER BY o.prazo_em NULLS LAST, o.id
          LIMIT $2`,
        [quem.usuarioId, TETO_DE_PENDENCIAS + 1],
      );
      const truncada = r.rows.length > TETO_DE_PENDENCIAS;
      return {
        itens: truncada ? r.rows.slice(0, TETO_DE_PENDENCIAS) : r.rows,
        teto: TETO_DE_PENDENCIAS,
        truncada,
      };
    });
  });
}
