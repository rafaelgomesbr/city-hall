import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ROTULO_MOTIVO_DE_DEVOLUCAO,
  chaveDeStorage, devolucaoDeTarefaSchema, envelopeSincronizacaoSchema,
  transicaoPermitida,
  type MotivoDeDevolucao, type OrgaoIndicado, type StatusOcorrencia,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar, type Identidade } from "../servidor.js";
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
 * A folga de relogio da devolucao, e o piso de datas.
 *
 * Copia deliberada de `coletada_em_plausivel` (migracao 009) e da conferencia
 * que `rotas/evidencias.ts` faz sobre a data da foto: as doze horas para frente
 * cobrem fuso trocado e relogio adiantado, que sao rotina em campo, e o piso de
 * 2020 recusa a data que existe para sumir de recorte por periodo da auditoria.
 *
 * Ela NAO e o portao do prazo, e confundir as duas coisas seria o defeito. Quem
 * decide se a tarefa venceu e `now()` do servidor, comparado com `prazo_em`
 * dentro da transacao. Esta conferencia existe para o instante que a TRILHA vai
 * imprimir ser plausivel.
 *
 * E existe aqui, e nao so no banco, pela razao que a migracao 024 escreveu: a
 * mesma regra esta em `decidida_em_plausivel` (migracao 028), e sem a
 * conferencia na rota o aparelho com a data de amanha recebia 500 vindo de um
 * CHECK, ou seja, "erro inesperado, informe o codigo ao suporte" para um
 * problema que a pessoa resolve acertando o relogio do proprio telefone.
 */
const FOLGA_DE_RELOGIO_MS = 12 * 60 * 60 * 1000;
const PISO_DE_DECISAO = Date.parse("2020-01-01T00:00:00Z");

function decisaoPlausivel(iso: string): boolean {
  const instante = Date.parse(iso);
  return Number.isFinite(instante)
    && instante > PISO_DE_DECISAO
    && instante < Date.now() + FOLGA_DE_RELOGIO_MS;
}

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
 * Grava a tentativa recusada por autor divergente, em transação PRÓPRIA.
 *
 * Separada de propósito, e a separação é a peça que faz o registro existir: a
 * recusa termina em exceção, e exceção derruba a transação da rota inteira. Um
 * `registrarEvento` lá dentro seria desfeito pelo ROLLBACK junto com a vistoria
 * que não entrou, e o produto afirmaria registrar uma tentativa que ele não
 * registra, que é pior do que não registrar nada.
 *
 * A ocorrência é CONFERIDA sob RLS antes do INSERT. Sem essa consulta, um
 * envelope apontando para ocorrência de outro município (ou para um id
 * inventado) bateria na chave estrangeira e viraria 500: a recusa deixaria de
 * ser recusa e viraria erro de servidor, justamente no caminho que mais
 * interessa a quem está tentando forjar autoria. Sem ocorrência visível não há
 * onde pendurar o evento, então fica o aviso no log e a recusa acontece do
 * mesmo jeito.
 *
 * O evento se REPETE a cada tentativa, e isso é informação e não ruído: cada
 * linha é uma tentativa de gravar vistoria com autor que não é o do token, e
 * quem audita precisa contar quantas foram, não saber que houve alguma.
 */
async function registrarTentativaRecusada(
  banco: Banco,
  quem: Identidade,
  ocorrenciaId: string,
  log: { warn: (dados: unknown, mensagem: string) => void },
  escrever: (c: Consulta) => Promise<void>,
): Promise<void> {
  await banco.comTenant(quem.organizacaoId, async (c) => {
    const alvo = await c.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE id = $1",
      [ocorrenciaId],
    );
    if (!alvo.rows[0]) {
      log.warn(
        { ocorrenciaId, usuarioId: quem.usuarioId },
        "envio com autor divergente apontando para ocorrencia que este municipio nao enxerga",
      );
      return;
    }
    await escrever(c);
  });
}

async function registrarRecusaPorAutorDivergente(
  banco: Banco,
  quem: Identidade,
  envelope: { ocorrenciaId: string; idempotencyKey: string; coletadaPor?: string },
  log: { warn: (dados: unknown, mensagem: string) => void },
): Promise<void> {
  await registrarTentativaRecusada(banco, quem, envelope.ocorrenciaId, log, (c) =>
    registrarEvento(
      c, quem, envelope.ocorrenciaId, "vistoria_recusada_autor_divergente",
      {
        /*
          Os dois lados da divergência, nomeados: `declarado` é o que o
          aparelho afirmou, e o autor do evento (que `registrarEvento` tira da
          identidade) é quem apresentou o token. Guardar só um dos dois deixaria
          a auditoria com metade da frase.
        */
        coletadaPorDeclarado: envelope.coletadaPor ?? null,
        idempotencyKey: envelope.idempotencyKey,
      },
      "campo",
    ));
}

/**
 * O mesmo, para a devolução de tarefa.
 *
 * TIPO DE EVENTO PRÓPRIO, e não o da vistoria, apesar de o caminho ser
 * idêntico. O rótulo daquele afirma que houve envio de vistoria, e aqui não
 * houve vistoria nenhuma: a trilha é a tela que alguém abre para provar o que
 * aconteceu, e reaproveitar o rótulo escreveria uma frase falsa numa linha de
 * prova. Quem auditar tentativa de forjar autoria procura os DOIS tipos, e essa
 * é a única coisa que a separação custa.
 *
 * Repete o `registrarEvento` literal em vez de receber o tipo por parâmetro, e
 * isso também é deliberado: `test/eventos-tem-rotulo.test.ts` descobre os
 * eventos lendo a POSIÇÃO do literal na chamada. Tipo vindo de variável some da
 * varredura, e o portão que garante rótulo em português deixaria de enxergar
 * justamente o evento novo.
 */
async function registrarRecusaDeDevolucaoPorAutorDivergente(
  banco: Banco,
  quem: Identidade,
  pedido: { ocorrenciaId: string; idempotencyKey: string; devolvidaPor: string },
  log: { warn: (dados: unknown, mensagem: string) => void },
): Promise<void> {
  await registrarTentativaRecusada(banco, quem, pedido.ocorrenciaId, log, (c) =>
    registrarEvento(
      c, quem, pedido.ocorrenciaId, "devolucao_recusada_autor_divergente",
      {
        devolvidaPorDeclarado: pedido.devolvidaPor,
        idempotencyKey: pedido.idempotencyKey,
      },
      "campo",
    ));
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

    /*
      O PORTÃO DE AUTORIA DA COLETA, do lado do servidor.

      O aplicativo já não envia coleta de outro agente (`prontos`, em
      `packages/campo/src/fila.ts`), e portão de cliente não é controle de
      acesso: binário adulterado, ou um defeito futuro naquele filtro, volta a
      subir a coleta da agente da manhã com a credencial do agente da noite, e o
      servidor aceitava sem piscar. O laudo e a trilha atribuiriam a vistoria a
      quem nunca esteve no local, contra a minuta que a moradora ouviu antes de
      assinar, e a trilha é append-only: esse autor nunca seria corrigido.

      VEM ANTES DE QUALQUER LEITURA DE OCORRÊNCIA, e antes da idempotência.

      * Antes da leitura porque a comparação não toca no banco: ela não depende
        de a ocorrência existir, então não devolve desfecho diferente conforme
        exista ou não. É o que impede a recusa de virar oráculo de existência,
        pela mesma razão que faz esta API responder 404 e nunca 403 para
        recurso de outro município.
      * Antes da idempotência porque o reenvio de uma coleta JÁ gravada, agora
        com credencial de outra pessoa, receberia 200 com o recibo da vistoria.
        Confirmar a coleta para quem não a fez é o começo do mesmo problema, só
        que em silêncio.

      O código e o status são escolhidos pelo que o aplicativo faz com eles: 409
      cai em `FalhaPermanente` no transporte, e a fila marca o item como
      `bloqueado`, que é o único estado parado com saída pela tela (reenviar e
      descartar). Arquivar seria errado (a coleta tem destino, e ela é
      verdadeira) e temporário seria pior (o aparelho repetiria para sempre uma
      recusa que só a troca de conta resolve).
    */
    if (envelope.coletadaPor && envelope.coletadaPor !== quem.usuarioId) {
      await registrarRecusaPorAutorDivergente(banco, quem, envelope, req.log);
      throw new RegraDeNegocio(
        "autor_divergente",
        "Esta coleta foi feita por outro agente. Entre neste aparelho com a conta "
        + "de quem fez a vistoria para poder enviá-la.",
        409,
      );
    }

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
   * A tarefa VENCIDA que o agente devolve para a coordenação sem ter vistoriado.
   *
   * ## O que acontece, e o que não acontece
   *
   * A ocorrência volta para `triagem`, que é de onde o despacho sai, e a equipe
   * é limpa: ela deixou de ser daquela equipe. A ocorrência NÃO é encerrada e
   * nada é apagado, porque a casa continua precisando de vistoria. O que muda
   * de dono é a decisão, que volta para quem despacha.
   *
   * `prazo_em` NÃO É TOCADO, e essa é a linha mais fácil de escrever errado
   * aqui. O prazo é da ocorrência e não do despacho (o T2 corrigiu exatamente
   * isso, ver a nota no despacho em `rotas/ocorrencias.ts`): zerar o relógio na
   * devolução tiraria a ocorrência do indicador de atrasadas do painel e o
   * atraso sumiria da tela justamente no minuto em que ele deixou de ser um
   * risco de atraso e virou um fato.
   *
   * ## Ela segue o desenho de `POST /sincronizacao/vistoria`, e não por simetria
   *
   * Quem chama é a MESMA fila do mesmo aparelho, com a mesma conexão indo e
   * vindo dentro do carro. Então: idempotência por chave do aparelho, com
   * `ON CONFLICT DO NOTHING RETURNING` mais releitura (ver a nota do T5 sobre a
   * corrida, na rota de vistoria: consulta seguida de inserção deixava o item
   * preso no aparelho PARA SEMPRE), e conferência de autoria contra o dono do
   * token antes de qualquer leitura de ocorrência.
   *
   * ## Onde ela é DIFERENTE da vistoria, e por quê
   *
   * A vistoria de agente de fora da equipe designada é aceita e marcada,
   * porque recusar destruiria uma coleta de campo verdadeira, feita no morro,
   * que não existe em nenhum outro lugar. Aqui a recusa não destrói nada: uma
   * devolução recusada é uma INTENÇÃO perdida, não uma prova. E aceitá-la seria
   * deixar um agente tirar da fila de OUTRA equipe uma tarefa que ele não tem,
   * limpando a designação dela. Então ocorrência de outra equipe responde 404,
   * que é a mesma resposta de ocorrência de outro município: 403 confirmaria
   * que existe.
   */
  app.post("/devolucao", async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const d = devolucaoDeTarefaSchema.parse(req.body);

    /*
      O PORTÃO DE AUTORIA, na mesma posição da rota de vistoria e pelas mesmas
      duas razões: antes de qualquer leitura de ocorrência, para a recusa não
      virar oráculo de existência, e antes da idempotência, porque devolver o
      recibo de uma devolução a quem não a fez é confirmar o ato de outra pessoa
      para quem apresentou credencial alheia.

      Aqui o campo é OBRIGATÓRIO no esquema, diferente de `coletadaPor`: ele
      nasce hoje, então não existe aparelho em campo com devolução gravada sem
      autor, e não há coleta antiga para destruir com um 422 permanente.
    */
    if (d.devolvidaPor !== quem.usuarioId) {
      await registrarRecusaDeDevolucaoPorAutorDivergente(banco, quem, d, req.log);
      throw new RegraDeNegocio(
        "autor_divergente",
        "Esta devolução foi registrada por outro agente. Entre neste aparelho com "
        + "a conta de quem devolveu a tarefa para poder enviá-la.",
        409,
      );
    }

    /*
      O RELÓGIO DO APARELHO, conferido antes de tocar no banco.

      `decididaEm` não decide nada (quem decide o prazo é o servidor), e ainda
      assim ele é impresso na trilha, então uma data impossível viraria uma
      linha de prova impossível. O banco já recusa por CHECK; sem esta
      conferência, a recusa chegava ao agente como 500 e a frase "erro
      inesperado, informe o código ao suporte", para um problema que ele resolve
      acertando o relógio do próprio telefone.

      A recusa é nomeada de propósito: o aplicativo bloqueia o item e mostra a
      mensagem, e quem lê precisa entender que não é a devolução que está
      errada, é a hora do aparelho.
    */
    if (!decisaoPlausivel(d.decididaEm)) {
      throw new RegraDeNegocio(
        "relogio_do_aparelho",
        "A data deste aparelho está muito fora do horário real, e a devolução "
        + "precisa registrar quando ela foi decidida. Acerte a data e a hora do "
        + "aparelho e envie de novo.",
      );
    }

    const feita = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Chave já vista: devolve o que foi gravado antes e não toca em nada.
      const anterior = await c.query<{ id: string }>(
        "SELECT id FROM devolucoes_de_tarefa WHERE idempotency_key = $1",
        [d.idempotencyKey],
      );
      if (anterior.rows[0]) {
        return { devolucaoId: anterior.rows[0].id, jaExistia: true };
      }

      /*
        A ocorrência é lida sob RLS, e `vencida` é calculada pelo BANCO.

        O relógio que decide é o do servidor, e ele decide aqui dentro, na mesma
        transação da escrita. Comparar em TypeScript com `Date.now()` seria o
        relógio do processo da API, que é outro relógio: com duas máquinas
        atrás de um balanceador, a mesma devolução passaria numa e seria
        recusada na outra.
      */
      const ocorrencia = await c.query<{
        id: string; status: string; equipe_id: string | null;
        prazo_em: string | null; vencida: boolean;
      }>(
        `SELECT id, status, equipe_id, prazo_em,
                (prazo_em IS NOT NULL AND prazo_em < now()) AS vencida
           FROM ocorrencias WHERE id = $1`,
        [d.ocorrenciaId],
      );
      const alvo = ocorrencia.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      /*
        A equipe do agente é lida do BANCO e não do token, como na vistoria: o
        token pode ter sido emitido antes de uma troca de equipe, e o que vale é
        a lotação de hoje.
      */
      const lotacao = await c.query<{ equipe_id: string | null }>(
        "SELECT equipe_id FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      const equipeDoAgente = lotacao.rows[0]?.equipe_id ?? null;

      /*
        JÁ DEVOLVIDA POR UM COLEGA DA MESMA EQUIPE, e este é o caso que não pode
        virar erro assustador.

        Dois agentes da mesma equipe vão ao mesmo endereço no mesmo dia, os dois
        devolvem, e a segunda devolução chega com a ocorrência já em `triagem` e
        já sem equipe. Tratado como reenvio de fila, que é o que ele é do ponto
        de vista do aparelho: a tarefa saiu da lista, o item some, e ninguém
        recebe uma recusa vermelha por ter feito a coisa certa.
        `duplicada: true` diz a verdade sem alarmar.

        VEM ANTES DO PORTÃO DE EQUIPE de propósito, porque a devolução do colega
        já limpou `equipe_id` e o portão responderia 404, que no aplicativo é
        falha permanente: o item ficaria bloqueado na fila de quem acertou.

        A consulta é amarrada à equipe do PRÓPRIO agente, então ela não conta
        nada a ninguém sobre ocorrência de outra equipe: para quem não é da
        equipe, ela não acha nada e o 404 acontece igual.
      */
      if (equipeDoAgente && alvo.status !== "em_campo") {
        const doColega = await c.query<{ id: string }>(
          `SELECT id FROM devolucoes_de_tarefa
            WHERE ocorrencia_id = $1 AND equipe_id = $2
            ORDER BY registrada_em DESC, id
            LIMIT 1`,
          [d.ocorrenciaId, equipeDoAgente],
        );
        if (doColega.rows[0]) {
          return { devolucaoId: doColega.rows[0].id, jaExistia: true };
        }
      }

      /*
        O PORTÃO DE EQUIPE. Só devolve quem é da equipe para a qual a ocorrência
        foi despachada, e a resposta para todo o resto é 404: ocorrência de
        outra equipe e ocorrência de outro município ficam indistinguíveis de
        identificador que nunca existiu. A comparação exige equipe designada de
        verdade, senão um agente sem lotação (`null`) devolveria ocorrência sem
        despacho pela coincidência de dois nulos.
      */
      if (!alvo.equipe_id || alvo.equipe_id !== equipeDoAgente) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      /*
        O status, caso a caso, porque cada um pede uma frase diferente de quem
        está na rua com o telefone na mão:

        * `vistoria_concluida`: alguém da equipe já foi e já registrou. Devolver
          apagaria a designação de uma tarefa que foi CUMPRIDA.
        * `encerrada`: a coordenação já tirou a ocorrência de circulação, e
          `encerrada` é terminal na máquina de estados.
        * qualquer outro: a ocorrência não está em campo, e o que houve é o
          aparelho trabalhando com uma lista velha.
      */
      if (alvo.status === "vistoria_concluida") {
        throw new RegraDeNegocio(
          "vistoria_ja_concluida",
          "Essa vistoria já foi registrada por alguém da sua equipe, então a tarefa "
          + "não precisa mais ser devolvida.",
        );
      }
      if (alvo.status === "encerrada") {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa ocorrência já foi encerrada pela coordenação.",
        );
      }
      if (alvo.status !== "em_campo") {
        throw new RegraDeNegocio(
          "status_nao_permite",
          "Essa tarefa não está mais em campo. Atualize a lista para ver o que mudou.",
        );
      }

      /*
        O PORTÃO DO PRAZO, e a resposta ao aparelho com o relógio adiantado.

        Sem a trava, um dia ruim vira uma lista limpa: o agente devolve tudo às
        oito da manhã e a coordenação descobre ao meio-dia. Vencida é o ponto em
        que o produto já falhou e a informação de que ninguém foi lá vale mais
        do que a tarefa continuar parada.

        RELÓGIO ADIANTADO: o aparelho pode mandar `decididaEm` no futuro e a
        tela dele pode mostrar a tarefa como vencida, porque o aplicativo compara
        `prazo_em` com o relógio LOCAL. Nada disso atravessa: quem compara aqui é
        o Postgres, com `now()` da transação, e `decididaEm` só vai para a
        trilha. O agente recebe uma recusa que diz o que aconteceu em vez de um
        erro genérico, e a mensagem nomeia o relógio do aparelho, que é a única
        coisa que ele pode corrigir.

        A recusa é 4xx, então o aplicativo marca o item como bloqueado, com
        saída pela tela (reenviar e descartar). É o comportamento certo: repetir
        sozinho não adiantaria enquanto o prazo não vence, e depois que ele
        vencer o reenviar da tela resolve numa tocada.
      */
      if (!alvo.vencida) {
        throw new RegraDeNegocio(
          "tarefa_no_prazo",
          "Essa tarefa ainda não venceu, então ela continua com a sua equipe. "
          + "Devolver só é possível depois do prazo, e quem conta o prazo é o "
          + "relógio do servidor: se o aparelho mostra outra hora, é o relógio "
          + "dele que está adiantado.",
        );
      }

      const inserida = await c.query<{ id: string }>(
        `INSERT INTO devolucoes_de_tarefa
           (organizacao_id, ocorrencia_id, devolvida_por, equipe_id,
            motivo, observacao, prazo_em, decidida_em, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (organizacao_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          quem.organizacaoId, d.ocorrenciaId, quem.usuarioId, alvo.equipe_id,
          d.motivo, d.observacao ?? null, alvo.prazo_em, d.decididaEm, d.idempotencyKey,
        ],
      );
      /*
        Nenhuma linha voltou significa que a chave JÁ ESTAVA no banco, gravada
        entre a consulta lá em cima e este INSERT. É a mesma corrida da vistoria,
        e pelo mesmo motivo: o aparelho desiste por tempo esgotado e repete o
        envio enquanto o servidor ainda processa o primeiro, e os dois passam
        pela consulta sem achar nada. Antes da correção do T5, o segundo envio
        batia na unicidade, virava 500, e o item ficava preso na fila PARA
        SEMPRE, porque a fila reenviaria e receberia o mesmo erro.
      */
      if (!inserida.rows[0]) {
        const concorrente = await c.query<{ id: string }>(
          "SELECT id FROM devolucoes_de_tarefa WHERE idempotency_key = $1",
          [d.idempotencyKey],
        );
        const jaGravada = concorrente.rows[0];
        /*
          Sem linha aqui, a unicidade recusou por outro motivo que não a chave,
          e engolir isso esconderia defeito de verdade. Erra alto e ruidoso.
        */
        if (!jaGravada) {
          throw new Error(
            "INSERT de devolução não gravou e a chave de idempotência não está no banco. "
            + "Restrição de unicidade inesperada.",
          );
        }
        return { devolucaoId: jaGravada.id, jaExistia: true };
      }

      /*
        A transição para trás, a limpeza da equipe e a trilha, na MESMA
        transação do INSERT acima. Meia devolução é pior que nenhuma: uma
        ocorrência que voltasse para a triagem sem evento na trilha seria uma
        tarefa que a equipe perdeu sem ninguém conseguir dizer quem devolveu, e
        a trilha não tem policy de UPDATE para consertar depois.

        `prazo_em` fica de fora do UPDATE de propósito. Ver o cabeçalho.

        E quem AUTORIZA a transição é a máquina de estados, não este arquivo.
        As recusas por status lá em cima existem para a FRASE que o agente lê:
        "já foi vistoriada" e "já foi encerrada" pedem reações diferentes. Quem
        decide se a aresta existe é `TRANSICOES_PERMITIDAS`, no pacote
        compartilhado, e é lá que está escrito por que uma aresta para trás é
        aceitável justamente aqui, numa máquina que é toda para frente.

        Sem esta linha, a regra moraria na rota: o dia em que alguém tirasse a
        aresta do domínio (achando que ela é só declaração), esta rota
        continuaria empurrando a ocorrência para `triagem` por UPDATE direto, e
        o painel em modo local, que passa por `transicaoPermitida`, recusaria a
        mesma mudança. Duas pontas com regras diferentes sobre o mesmo registro.
      */
      if (!transicaoPermitida(alvo.status as StatusOcorrencia, "triagem")) {
        throw new RegraDeNegocio(
          "transicao_invalida",
          `Não é possível devolver uma ocorrência em "${alvo.status}".`,
        );
      }
      await c.query(
        "UPDATE ocorrencias SET status = 'triagem', equipe_id = NULL WHERE id = $1",
        [d.ocorrenciaId],
      );

      /**
       * Duas marcas de tempo, como no evento de vistoria: `ocorrido_em` é a
       * hora em que o dedo tocou no aparelho e `registrado_em` é a do servidor.
       * As duas diferem em toda devolução decidida sem sinal, e mostrar só a
       * segunda faria a trilha afirmar que o agente desistiu na hora em que o
       * sinal voltou.
       *
       * O detalhe leva TUDO o que a coordenação vai querer meses depois, porque
       * a trilha é a única memória disto que sobrevive a um redespacho: o
       * motivo em chave e em português, a observação escrita na chuva, a equipe
       * que perdeu a tarefa e o prazo que já estava vencido. Sem o prazo aqui,
       * uma triagem nova que recalcule `prazo_em` apagaria a razão pela qual a
       * devolução foi permitida.
       */
      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'devolucao_de_tarefa',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, d.ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
          d.decididaEm,
          /*
            A OBSERVAÇÃO EM TEXTO LIVRE NÃO ENTRA AQUI, e isto não é economia
            de bytes.

            `trilha_eventos` é append-only por projeto, sem policy de UPDATE
            nem de DELETE: o que entra não sai mais, por caminho nenhum, nem
            por ato do administrador do município. A observação é escrita pelo
            agente, na rua, em texto livre, e na prática vai dizer coisas como
            "moradora Dona Marta pediu para voltar às 18h" ou "casa com idosa
            acamada": nome de pessoa e condição de saúde, que são exatamente os
            dois dados que a migração 021 existe para descartar quando vence o
            prazo que o município fixou como controlador.

            Gravá-la aqui tornaria aquele texto PERMANENTE. A minimização
            passaria a apagar o nome do solicitante em `ocorrencias` enquanto a
            mesma pessoa continuaria nomeada numa linha de trilha ao lado, e o
            município não teria como cumprir a própria política.

            A migração 021 já enfrentou isto e decidiu igual, com todas as
            letras: gravar o valor "transformaria a trilha, que é append-only e
            permanente, no lugar onde o dado removido continua".

            O que fica: o motivo, que é de LISTA FECHADA e portanto não é dado
            pessoal, e o identificador da devolução. Quem precisa do texto
            segue o identificador até `devolucoes_de_tarefa`, que é onde ele
            pode ser descartado no prazo. Quem auditar depois do prazo vê que
            houve devolução, por quê, e que o texto foi descartado, que é
            exatamente a informação correta.
          */
          JSON.stringify({
            motivo: d.motivo,
            motivoRotulo: ROTULO_MOTIVO_DE_DEVOLUCAO[d.motivo],
            temObservacao: Boolean(d.observacao),
            devolucaoId: inserida.rows[0].id,
            equipeId: alvo.equipe_id,
            prazoEm: alvo.prazo_em,
            statusAnterior: alvo.status,
          }),
        ],
      );

      return { devolucaoId: inserida.rows[0].id, jaExistia: false };
    });

    return resposta.code(feita.jaExistia ? 200 : 201).send({
      devolucaoId: feita.devolucaoId,
      duplicada: feita.jaExistia,
      /*
        Para onde a ocorrência foi. O aparelho não precisa disto para apagar o
        item, e ele sai assim mesmo: é o que permite a tela dizer "voltou para a
        coordenação" em vez de só sumir, que é a diferença entre devolver e
        descartar na cabeça de quem apertou o botão.
      */
      status: "triagem",
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
        Tres portas, e so tres:

        1. A ocorrencia continua sendo da equipe do agente. E o caso comum:
           encerrada ou vistoria ja concluida.
        2. A ocorrencia mudou de equipe, e o agente tinha coletado nela. Sem
           isso, quem estava no meio de uma vistoria quando a coordenacao
           trocou a equipe recebe silencio.
        3. A ocorrencia foi DEVOLVIDA pela equipe do agente (`POST /devolucao`).

        A terceira porta e a correcao de um buraco que a devolucao abriria, e o
        desfecho `"devolvida"` logo abaixo existia antes dela sem nunca poder
        acontecer: devolver limpa `equipe_id`, entao a primeira porta
        (`equipe_id IS NOT DISTINCT FROM` a equipe do agente) deixava de casar e
        a tarefa sumia da tela do aparelho SEM EXPLICACAO, que e exatamente o
        defeito que esta rota inteira existe para fechar. E ela nao afrouxa o
        isolamento: a busca e amarrada a equipe do proprio agente, entao
        devolucao de outra equipe continua invisivel daqui.

        Fora dessas tres, a ocorrencia NAO aparece na resposta, e id de outra
        equipe fica indistinguivel de id que nunca existiu. Essa e a linha que
        impede a rota de virar oraculo de status.
      */
      const r = await c.query<{
        id: string; protocolo: string; status: string;
        motivo_encerramento: string | null; encerrado_em: string | null;
        equipe_id: string | null;
        devolvida_em: string | null; devolucao_motivo: MotivoDeDevolucao | null;
      }>(
        `SELECT o.id, o.protocolo, o.status, o.motivo_encerramento, o.encerrado_em,
                o.equipe_id, d.registrada_em AS devolvida_em, d.motivo AS devolucao_motivo
           FROM ocorrencias o
           LEFT JOIN LATERAL (
             SELECT dv.registrada_em, dv.motivo
               FROM devolucoes_de_tarefa dv
              WHERE dv.ocorrencia_id = o.id
                AND dv.equipe_id IS NOT DISTINCT FROM $3::uuid
              ORDER BY dv.registrada_em DESC, dv.id
              LIMIT 1
           ) d ON true
          WHERE o.id = ANY($1::uuid[])
            AND (
              o.equipe_id IS NOT DISTINCT FROM $3::uuid
              OR EXISTS (
                SELECT 1 FROM vistorias v
                 WHERE v.ocorrencia_id = o.id AND v.agente_id = $2
              )
              OR d.registrada_em IS NOT NULL
            )`,
        [sumiram, quem.usuarioId, equipeDoAgente],
      );

      return {
        saidas: r.rows.map((o) => ({
          id: o.id,
          protocolo: o.protocolo,
          /*
            O motivo, e para a devolução ele vem do rótulo em português do
            catálogo fechado. Sem isto o agente cuja tarefa um colega devolveu
            leria apenas que ela saiu, e o motivo ("não havia ninguém no local")
            é justamente o que evita os dois subirem o mesmo morro amanhã.
          */
          motivo: o.motivo_encerramento
            ?? (o.devolucao_motivo ? ROTULO_MOTIVO_DE_DEVOLUCAO[o.devolucao_motivo] : null),
          saiuEm: o.encerrado_em ?? o.devolvida_em,
          /*
            O motivo em linguagem de quem está na rua. O status cru não serve:
            "vistoria_concluida" e "encerrada" pedem reações opostas do agente,
            e uma delas não é alarme nenhum.

            A devolução é conferida pela EXISTÊNCIA do registro mais a equipe
            já limpa, e não pelo status: uma ocorrência devolvida e redespachada
            para outra equipe está em `em_campo` com outra equipe, e o que o
            agente precisa saber nesse caso é "passou para outra equipe", que é
            o desfecho certo e não o de ontem.
          */
          desfecho: o.status === "vistoria_concluida"
            ? "concluida"
            : o.status === "encerrada"
              ? "encerrada"
              : o.devolvida_em !== null && o.equipe_id === null
                ? "devolvida"
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
