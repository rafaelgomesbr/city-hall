import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  chaveDeStorage, envelopeSincronizacaoSchema, type OrgaoIndicado,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarEvento } from "../trilha.js";

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
 * Quantos orgaos do catalogo descem para o aparelho junto com as tarefas.
 *
 * Existe como amarra e nao como paginacao: catalogo de orgao e cadastro
 * estrutural de um municipio (bombeiros, concessionaria de energia, obras,
 * saude, assistencia social), e ele vive na casa das dezenas. Duzentos e um
 * numero que nao alcanca nenhum municipio real, e serve para o dia em que uma
 * importacao errada encher a tabela: o aparelho no 3G do morro nao pode baixar
 * o estrago junto com a lista de trabalho.
 *
 * O corte NAO e calado, e nao e calado no lugar certo: quando ele acontece, o
 * servidor registra aviso no log. O agente nao tem o que fazer com essa
 * informacao em campo (o campo livre da tela conclui a vistoria de qualquer
 * jeito), e quem precisa agir e a coordenacao, que e quem limpa o cadastro.
 */
const TETO_DO_CATALOGO = 200;

/**
 * Grava quem a vistoria mandou acionar, na MESMA transacao da vistoria.
 *
 * Ate aqui esta lista chegava no envelope, passava pelo Zod e era descartada
 * por falta de tabela. O laudo dizia "Necessario acionar outro orgao: SIM" e
 * calava QUAL, que era exatamente a reclamacao que originou o item.
 *
 * Roda dentro do `comTenant` da vistoria de proposito: se a gravacao dos
 * orgaos falhar, a vistoria inteira volta atras. Meia vistoria e pior que
 * nenhuma, porque ela parece completa: o laudo sairia afirmando que ha orgao a
 * acionar, com a lista vazia, e ninguem saberia que a lista existiu.
 *
 * O identificador do catalogo e CONFERIDO sob RLS antes de virar coluna, e o
 * que nao resolve vira campo livre em vez de derrubar o envelope. As duas
 * metades dessa decisao importam:
 *
 *   * Conferir e o que impede o INSERT de bater na chave estrangeira composta e
 *     virar 500. A chave continua la, e continua sendo a garantia estrutural
 *     (ver migracao 020); esta consulta e o que faz a garantia nunca precisar
 *     ser acionada por dado que chegou pela rede.
 *   * Nao derrubar e o que salva a manha de trabalho do agente. Uma coleta
 *     recusada volta para a fila do aparelho e e reenviada, e recebe a mesma
 *     recusa para sempre: nao existe tela para corrigir item bloqueado. O nome
 *     do orgao viaja sempre no envelope, entao o laudo continua dizendo quem
 *     acionar mesmo quando o identificador nao serve para contagem.
 */
async function gravarOrgaosIndicados(
  c: Consulta,
  organizacaoId: string,
  vistoriaId: string,
  indicados: readonly OrgaoIndicado[],
): Promise<void> {
  if (indicados.length === 0) return;

  const pedidos = [...new Set(
    indicados.map((o) => o.orgaoId).filter((id): id is string => id !== null),
  )];
  const doCatalogo = pedidos.length > 0
    ? await c.query<{ id: string }>(
        "SELECT id FROM orgaos WHERE id = ANY($1::uuid[])",
        [pedidos],
      )
    : { rows: [] };
  const conhecidos = new Set(doCatalogo.rows.map((l) => l.id));

  for (const [ordem, o] of indicados.entries()) {
    /*
      Orgao DESATIVADO continua sendo aceito, e isso e escolha.

      O catalogo do aparelho pode ter meses, e a coleta e mais velha que a
      desativacao. Recusar aqui reescreveria a historia: a vistoria daquele dia
      indicou aquele orgao, e era ele que atendia a competencia na epoca. Quem
      decide para onde encaminhar HOJE e a providencia, que le o catalogo vigente.
    */
    const orgaoId = o.orgaoId !== null && conhecidos.has(o.orgaoId) ? o.orgaoId : null;
    await c.query(
      `INSERT INTO vistoria_orgaos_indicados
         (organizacao_id, vistoria_id, orgao_id, nome, ordem)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organizacao_id, vistoria_id, orgao_id) DO NOTHING`,
      [organizacaoId, vistoriaId, orgaoId, o.nome, ordem],
    );
  }
}

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

    const recebida = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Chave já vista: devolve o que foi gravado antes e não toca em nada.
      const anterior = await c.query<{ id: string }>(
        "SELECT id FROM vistorias WHERE idempotency_key = $1",
        [envelope.idempotencyKey],
      );
      if (anterior.rows[0]) {
        return { vistoriaId: anterior.rows[0].id, jaExistia: true, foraDaEquipe: false };
      }

      const ocorrencia = await c.query<{ id: string; status: string; equipe_id: string | null }>(
        "SELECT id, status, equipe_id FROM ocorrencias WHERE id = $1",
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

      /*
        A CONFERÊNCIA DE EQUIPE, que até aqui não existia.

        Reproduzido: ocorrência despachada para a Equipe Bravo; o agente Diego,
        da Equipe Alfa, NÃO a enxerga em `GET /sincronizacao/pendencias`, e
        ainda assim esta rota respondia 201, o status virava
        `vistoria_concluida` (a tarefa sumia da fila da equipe que de fato foi
        ao local) e a coordenação emitia o termo de interdição assinado com o
        nome dele. É o caminho mais curto entre uma conta de agente
        comprometida e um ato administrativo com brasão.

        POR QUE ACEITAR E MARCAR, EM VEZ DE RECUSAR. Recusar é o que parece
        certo e é pior. `packages/campo/src/transporte.ts` transforma toda
        resposta 4xx desta rota em `FalhaPermanente`, e não existe tela no
        aplicativo para desbloquear item recusado: a coleta morre na fila do
        aparelho, com a vistoria daquela família dentro. E o caso legítimo é
        comum: o agente trocou de equipe entre coletar e enviar, ou a
        coordenação redespachou a ocorrência enquanto ele subia o morro. Trocar
        "qualquer agente registra em qualquer ocorrência" por "coleta de campo
        se perde em silêncio" é trocar um defeito por outro pior.

        Então a coleta entra e a divergência vira FATO GRAVADO, em três lugares
        que ninguém precisa ir procurar: as duas equipes ficam na vistoria
        (migração 024), a trilha ganha um evento próprio, e o laudo e o termo
        imprimem o aviso na cara de quem vai assinar.

        A equipe do agente é lida agora, do banco, e não do token: o token pode
        ter sido emitido antes da troca de equipe, e o que vale é a lotação de
        hoje.
      */
      const lotacao = await c.query<{ equipe_id: string | null }>(
        "SELECT equipe_id FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      const equipeDoAgente = lotacao.rows[0]?.equipe_id ?? null;
      /*
        Só há designação a violar quando houve despacho. Ocorrência sem equipe
        designada não produz aviso, senão o documento treinaria quem lê a
        ignorar o aviso justamente quando ele importa.
      */
      const foraDaEquipe = alvo.equipe_id !== null && alvo.equipe_id !== equipeDoAgente;

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
            desalojados, desabrigados, feridos, desaparecidos, obitos,
            equipe_designada_id, equipe_do_agente_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
          alvo.equipe_id, equipeDoAgente,
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
        return { vistoriaId: jaGravada.id, jaExistia: true, foraDaEquipe: false };
      }

      const novaId = inserida.rows[0].id;

      await gravarOrgaosIndicados(c, quem.organizacaoId, novaId, v.orgaosParaAcionar ?? []);

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
              latitude, longitude, capturada_em, ordem, anexada_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (organizacao_id, chave_storage) DO NOTHING`,
          [
            quem.organizacaoId, envelope.ocorrenciaId, novaId, chave, foto.legenda ?? null,
            foto.coordenada?.lat ?? null, foto.coordenada?.lng ?? null,
            foto.capturadaEm, ordem, quem.usuarioId,
          ],
        );
      }

      /*
        A tarefa só é dada por concluída quando quem coletou é a equipe
        designada.

        Esta era a metade mais cara do defeito: a coleta de fora empurrava o
        status para `vistoria_concluida` e a ocorrência SUMIA de
        `GET /sincronizacao/pendencias` da equipe que de fato tinha ido ao
        local, sem lápide e sem aviso (o aparelho apaga e reescreve a lista
        inteira). A equipe designada perdia a tarefa da tela por um envio que
        não foi dela.

        Mantendo `em_campo`, a coleta divergente entra e fica registrada, a fila
        da equipe designada continua intacta, e quem decide o que fazer é a
        coordenação, que é quem tem tela para isso.
      */
      if (alvo.status === "em_campo" && !foraDaEquipe) {
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

      /*
        O evento da divergência é SEPARADO do evento de vistoria, e não um campo
        dentro dele. A auditoria precisa conseguir listar "que vistorias
        entraram por agente de fora da equipe designada" sem escrever consulta
        dentro de JSON, que é a mesma razão da migração 020 para os órgãos.

        Origem `campo` porque o ato aconteceu no aparelho, não no escritório.
      */
      if (foraDaEquipe) {
        await registrarEvento(
          c, quem, envelope.ocorrenciaId, "vistoria_fora_da_equipe",
          {
            vistoriaId: novaId,
            equipeDesignadaId: alvo.equipe_id,
            equipeDoAgenteId: equipeDoAgente,
          },
          "campo",
        );
      }

      return { vistoriaId: novaId, jaExistia: false, foraDaEquipe };
    });

    return resposta.code(recebida.jaExistia ? 200 : 201).send({
      vistoriaId: recebida.vistoriaId,
      duplicada: recebida.jaExistia,
      /*
        O aparelho não trata este campo hoje, e ele sai assim mesmo: quem
        coletou é a única pessoa que consegue explicar a divergência enquanto
        ela é fresca, e a tela do aplicativo vai poder dizer a ela que a coleta
        entrou e foi sinalizada. Enquanto isso não existe, o campo é inerte e
        não muda o desfecho do envio, que continua sendo sucesso.
      */
      foraDaEquipeDesignada: recebida.foraDaEquipe,
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

      /*
        O CATALOGO DE ORGAOS DESCE JUNTO, e nao numa chamada propria.

        Sem ele, todo aparelho ficava com catalogo vazio e todo agente concluia
        a vistoria pelo campo livre. O aplicativo tem o caminho de catalogo
        vazio e ele funciona, mas era por acidente: o catalogo do municipio
        simplesmente nunca chegava ao aparelho, e as indicacoes saiam todas sem
        identificador, o que apaga a conta de "quantas vezes acionamos os
        bombeiros" antes mesmo de ela existir.

        Na MESMA resposta porque uma segunda chamada teria uma segunda chance de
        falhar, e falharia onde nao pode: o aparelho que baixou a lista de manha
        e nao baixou o catalogo sobe o morro com um item OBRIGATORIO do
        checklist sem resposta possivel. O aplicativo grava os dois numa
        transacao so (`apps/campo/src/dados/pendencias.ts`), entao ou entram os
        dois, ou continua valendo o par que ja estava no disco.

        Somente os ATIVOS: orgao desativado nao pode voltar a ser oferecido em
        tela nova. As indicacoes antigas continuam gravadas apontando para ele,
        que e outra pergunta e tem outra resposta (ver migracao 020).
      */
      const catalogo = await c.query<{ id: string; nome: string; sigla: string | null }>(
        `SELECT id, nome, sigla FROM orgaos WHERE ativo ORDER BY nome, id LIMIT $1`,
        [TETO_DO_CATALOGO + 1],
      );
      if (catalogo.rows.length > TETO_DO_CATALOGO) {
        req.log.warn(
          { teto: TETO_DO_CATALOGO },
          "catalogo de orgaos do municipio passou do teto e desceu cortado para o aparelho",
        );
      }

      return {
        itens: truncada ? r.rows.slice(0, TETO_DE_PENDENCIAS) : r.rows,
        teto: TETO_DE_PENDENCIAS,
        truncada,
        orgaos: catalogo.rows.slice(0, TETO_DO_CATALOGO),
      };
    });
  });
}
