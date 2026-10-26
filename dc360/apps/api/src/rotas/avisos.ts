import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import { eRecorteDoAgente } from "./recorte-do-agente.js";
import { ROTA_GET_COM_EFEITO } from "../servidor.js";

/**
 * O sino de avisos do painel, do lado servidor.
 *
 * O painel pergunta "o que mudou desde X" de tempos em tempos, e esta rota
 * responde. Duas coisas nesta rota parecem detalhe e são a razão dela existir
 * como está: de onde sai o X, e o que acontece quando a resposta não cabe.
 */

/**
 * Quantos avisos cabem numa resposta.
 *
 * Duzentos porque é muito mais do que uma coordenadoria produz entre duas
 * consultas (a janela normal é de trinta segundos), e ainda assim é um teto:
 * uma noite de temporal, ou um painel que ficou fechado o fim de semana
 * inteiro, produzem lotes que não podem virar uma resposta sem tamanho.
 */
export const TETO_DE_AVISOS = 200;

/**
 * Teto da CONTAGEM de não lidos, que é separado do teto da lista.
 *
 * A contagem existe justamente para sobreviver ao corte da lista: quando a
 * lista trunca, o número continua dizendo quanto ficou para trás. Mas contar
 * sem teto é varrer a tabela inteira a cada trinta segundos, então ela também
 * tem limite, e a resposta diz quando o alcançou. "500+" é uma informação
 * honesta; "500" quando são mil não é.
 */
export const TETO_DA_CONTAGEM = 500;

/**
 * Retenção de aviso, em dias.
 *
 * O número de verdade mora na policy `avisos_expurgo` da migração 018, que é
 * o que o banco obriga. Este aqui é a cópia que a rota usa para pedir só o que
 * ela pode levar, e um teste compara os dois: se divergirem, o teste quebra
 * antes de a divergência virar comportamento.
 */
export const RETENCAO_DE_AVISOS_DIAS = 60;

/**
 * Quantos avisos velhos cada consulta do sino carrega para fora.
 *
 * O expurgo pega carona na consulta porque não existe onde mais: um relógio
 * separado precisaria enxergar todos os municípios, e enxergar todos os
 * municípios exige função privilegiada, que é a exceção mais cara deste
 * produto (ver o comentário grande na rota de leitura).
 *
 * O lote é pequeno de propósito. Sendo o sino consultado a cada trinta
 * segundos por pessoa logada, quinhentas linhas por consulta drenam qualquer
 * acúmulo em poucos minutos, e nenhuma consulta paga uma remoção grande. Sem
 * o lote, o primeiro acesso depois de meses de acúmulo travaria a tela de
 * quem abriu o painel.
 */
const LOTE_DE_EXPURGO = 500;

/**
 * Quantos prazos vencidos cada consulta materializa.
 *
 * Mesmo raciocínio do lote de expurgo, e a consulta só olha o que ainda não
 * virou aviso, então o lote seguinte pega o pedaço seguinte em vez de repetir
 * o mesmo. Sem esse cuidado, um município com mais prazos vencidos que o lote
 * ficaria para sempre com os últimos da fila invisíveis: o `ON CONFLICT`
 * engoliria os mesmos de novo a cada rodada e os outros nunca entrariam.
 */
const LOTE_DE_PRAZOS = 200;

/**
 * A margem entre o relógio do banco e o corte da resposta, em segundos.
 *
 * ESTE É O DEFEITO MENOS ÓBVIO DESTA ROTA, e ele engole aviso em silêncio.
 *
 * `criado_em` recebe `now()`, que no Postgres é o instante em que a transação
 * COMEÇOU, não o instante em que ela terminou. Uma sincronização de vistoria
 * que começa às 10h00m00s e só confirma às 10h00m04s grava um aviso carimbado
 * com 10h00m00s que ninguém enxerga antes das 10h00m04s.
 *
 * Sem margem, uma consulta às 10h00m01s devolveria "até 10h00m01s" sem ver o
 * aviso (ele ainda não confirmou), e a consulta seguinte perguntaria "o que
 * mudou depois de 10h00m01s", que já é depois do carimbo dele. O aviso fica
 * gravado no banco e nunca aparece no sino de ninguém, sem erro, sem log e sem
 * nada na tela que sugira que faltou alguma coisa.
 *
 * A margem corta a resposta um pouco atrás do relógio, e a consulta seguinte
 * cobre o pedaço que ficou. O preço é o aviso aparecer alguns segundos depois,
 * que numa janela de trinta segundos não muda nada para ninguém.
 *
 * O QUE ELA NÃO COBRE, dito claramente: uma transação que demore mais que esta
 * margem entre começar e confirmar continua podendo ser pulada. Dez segundos
 * é folgado para tudo que este produto escreve hoje, e se um dia existir uma
 * escrita mais lenta que isso, é este número que precisa subir.
 */
const MARGEM_DE_COMMIT_SEGUNDOS = 10;

export const consultaSchema = z.object({
  /**
   * O instante devolvido pela resposta ANTERIOR, ecoado sem alteração.
   *
   * Ausente na primeira carga, e aí a rota devolve os mais antigos até o teto
   * e vai andando para a frente. Nunca é para o cliente montar este valor com
   * o relógio dele: ver o comentário da rota.
   */
  desde: z.string().datetime({ offset: true }).optional(),
  /**
   * O companheiro de `desde`, ecoado de `ateId`.
   *
   * Só vem preenchido quando a resposta anterior cortou no teto, e aí o cursor
   * é o PAR (instante, id) do último aviso entregue, e não um instante solto.
   *
   * Sem o id, um corte que caísse no meio de avisos gravados no mesmo instante
   * perderia os do lado de fora: a pergunta seguinte usa `criado_em > desde`, e
   * os empatados com o último entregue não são maiores que ele. E instante
   * empatado não é exceção aqui, é rotina: uma sincronização traz várias
   * vistorias na mesma transação e todas recebem o mesmo `now()`.
   */
  desdeId: z.string().uuid().optional(),
});

export const leituraSchema = z.object({
  /*
    A pessoa marca como lido o que ela RECEBEU, e a lista dos identificadores
    é como ela diz isso. Não existe "marcar tudo como lido até tal hora", e a
    ausência é decisão: com um marco de tempo, o clique em "limpar" apagaria
    também o que o teto cortou e a pessoa nunca viu. Só some do sino o que
    passou pelos olhos de alguém.
  */
  ids: z.array(z.string().uuid()).min(1).max(TETO_DE_AVISOS),
});

type LinhaDeAviso = {
  id: string;
  tipo: string;
  ocorrencia_id: string;
  protocolo: string;
  criado_em: Date | string;
  detalhe: string | null;
  lido: boolean;
};

export async function rotasAvisos(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  /**
   * O que mudou desde a última pergunta.
   *
   * ============================================================
   * O MARCO DE TEMPO SAI DO BANCO, E DE MAIS LUGAR NENHUM.
   * ============================================================
   *
   * A resposta carrega `ate`, e a próxima pergunta devolve esse mesmo valor em
   * `desde`. O cliente ecoa, nunca calcula.
   *
   * O caminho fácil seria o painel usar `new Date()` como marco, e ele quebra
   * de um jeito que ninguém descobre: o relógio do computador da coordenadoria
   * não é o relógio do servidor. Adiantado, a primeira pergunta já vem de um
   * instante no futuro, e tudo que acontecer até o relógio do servidor
   * alcançá-lo cai fora da janela e NUNCA MAIS ENTRA, porque a janela seguinte
   * começa depois dessa. Atrasado, o painel repete os mesmos avisos.
   *
   * Repetido é chato. Pulado é o que dói: o coordenador não fica sabendo que a
   * vistoria chegou, e não existe nada na tela dizendo que ele perdeu alguma
   * coisa. É uma falha silenciosa, e computador de prefeitura com relógio
   * torto não é hipótese remota.
   *
   * Por isso `ate` é calculado dentro da própria transação que lê os avisos, a
   * partir de `now()` do Postgres, e nunca a partir de nada que tenha chegado
   * na requisição.
   *
   * E não basta não CALCULAR o marco a partir do cliente: um `desde` inventado
   * também não pode entrar na consulta. Esta rota já afirmou, num comentário,
   * que um `desde` no futuro fazia "a resposta vir vazia, e só", e isso era
   * falso: com a janela vazia e o `ate` avançando assim mesmo, tudo o que
   * estava gravado antes ficava atrás do cursor seguinte e não voltava em
   * pergunta nenhuma. Um pedido torto apagava o sino inteiro em silêncio. Hoje
   * o cursor adiante do relógio do banco é descartado, e a consulta vira uma
   * primeira carga: custa uma volta, não custa histórico.
   *
   * ============================================================
   * ESTA ROTA ESCREVE, E ISSO É DECISÃO E NÃO DESCUIDO.
   * ============================================================
   *
   * Duas manutenções pequenas acontecem antes da leitura, na mesma transação:
   * materializar os prazos que venceram, e levar um lote de avisos vencidos
   * para fora.
   *
   * As duas precisam do município no contexto, e nada neste produto roda com
   * município no contexto sem alguém logado: é assim que o RLS funciona aqui.
   * Um relógio de servidor, como o do push, só enxerga município nenhum, e a
   * saída seria uma função `SECURITY DEFINER` a mais. O produto tem um teto
   * dessas (27, em `db/test/isolamento.test.ts`) e um portão que reprova a
   * seguinte, de propósito, porque cada uma é um buraco na parede do
   * isolamento. Gastar essa vaga com um
   * sino, que é o recurso menos crítico da lista, seria a troca errada.
   *
   * As duas escritas são idempotentes, limitadas por lote e restritas ao
   * município do token. Nenhuma delas depende do que veio na requisição.
   *
   * Como escreve, a rota leva `ROTA_GET_COM_EFEITO`: conta desativada, papel
   * rebaixado e sessão encerrada não materializam nem expurgam nada por aqui
   * (V2-F00-E04, correção 1). Quando a F07-E03 tirar a escrita de dentro do
   * GET, a marca sai junto.
   */
  app.get("/", ROTA_GET_COM_EFEITO, async (req) => {
    /*
      SEM `exigirPermissao`, e a razão é a mesma da rota de aparelhos.
      O sino não decide nada: ele mostra que um fato do próprio município
      aconteceu, e leva a pessoa até a ocorrência, onde as permissões de
      verdade valem. Não existe ação no pacote compartilhado que descreva
      "receber aviso", e escolher uma emprestada (`consultar_trilha`, digamos)
      deixaria operador e agente de campo sem sino nenhum sem que ninguém
      tivesse decidido isso. Ver a pendência anotada no teste.

      O que substitui a permissão é o que o aviso carrega: tipo, protocolo,
      instante e um complemento curto. Nome, contato, endereço, relato e
      descrição de vulnerabilidade não passam por aqui.

      MAS O PROTOCOLO E O TIPO DE FATO TAMBÉM SÃO DADO, e por isso o sino do
      AGENTE DE CAMPO é recortado à equipe dele (V2-F00-E08, AUT-13): o aparelho
      do agente cai e é emprestado, e o sino dele entregava o protocolo e o tipo
      de fato de ocorrência de toda equipe do município, enquanto a lista de
      ocorrências do mesmo token já respondia 404 a elas. O recorte é o MESMO
      de `recorte-do-agente.ts` (a equipe vem do cadastro do usuário, nunca do
      token), aplicado à lista E à contagem: um número de não lidos maior que a
      lista denunciaria os avisos que ela esconde. Coordenação, operador e
      administração seguem vendo o município inteiro: o sino é a fila de
      trabalho deles.
    */
    const quem = await app.exigirAutenticacao(req);
    const pedido = consultaSchema.parse(req.query ?? {});

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const marco = await c.query<{ ate: Date | string }>(
        "SELECT now() - ($1 || ' seconds')::interval AS ate",
        [String(MARGEM_DE_COMMIT_SEGUNDOS)],
      );
      const ate = marco.rows[0]!.ate;

      /*
        CURSOR QUE VEIO DO FUTURO NÃO É CURSOR, e por isso é descartado aqui.

        Nenhum `ate` que este servidor emitiu é maior que o `now()` dele, então
        um `desde` adiante do relógio do banco só pode ter sido inventado pelo
        cliente. Aceitá-lo é onde a promessa desta rota se rompia: a resposta
        vinha vazia (nada é maior que o futuro), e o `ate` da resposta avançava
        assim mesmo, então tudo que estava gravado antes daquele momento
        ficava atrás do cursor seguinte e nunca mais era entregue a ninguém.
        Um único pedido torto apagava o sino inteiro, em silêncio.

        Descartado, o pedido torto vira uma primeira carga: custa uma volta, e
        não custa histórico.
      */
      const noFuturo = pedido.desde !== undefined
        && Date.parse(pedido.desde) > new Date(ate).getTime();
      const desde = noFuturo ? undefined : pedido.desde;
      const desdeId = desde === undefined ? undefined : pedido.desdeId;

      /*
        O prazo que venceu é o único dos três fatos do sino que nenhuma escrita
        dispara: ele acontece pela passagem do tempo. Os outros dois nascem de
        gatilho no banco (migração 018), que é onde eles não têm como ser
        esquecidos por uma rota nova.

        `NOT EXISTS` antes do lote, e não só o `ON CONFLICT`: com o lote
        aplicado sobre a lista completa, os mesmos primeiros seriam escolhidos
        toda vez, engolidos pelo conflito, e os que sobrassem nunca entrariam.
        O `ON CONFLICT` continua ali para o caso de duas pessoas consultarem o
        sino no mesmo instante.
      */
      await c.query(
        `WITH vencidos AS (
           SELECT o.organizacao_id AS org,
                  o.id             AS ocorrencia,
                  o.severidade     AS severidade,
                  o.prazo_em       AS prazo,
                  'prazo:' || o.id::text || ':'
                    || trunc(extract(epoch FROM o.prazo_em))::text AS chave
             FROM ocorrencias o
            WHERE o.prazo_em IS NOT NULL
              AND o.prazo_em <= now()
              -- Nada além da retenção: subir o produto sobre um banco antigo
              -- não pode despejar meses de prazo vencido no sino de uma vez.
              AND o.prazo_em > now() - ($1 || ' days')::interval
              -- Encerrada, rascunho e vistoria concluída não têm prazo a
              -- vencer: o trabalho já saiu da fila de quem olha o sino.
              AND o.status NOT IN ('encerrada','rascunho','vistoria_concluida')
         )
         INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, detalhe)
         SELECT v.org, 'prazo_vencido', v.ocorrencia, v.chave, v.severidade
           FROM vencidos v
          WHERE NOT EXISTS (
                  SELECT 1 FROM avisos a
                   WHERE a.organizacao_id = v.org AND a.chave_do_fato = v.chave
                )
          ORDER BY v.prazo DESC
          LIMIT $2
         ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING`,
        [String(RETENCAO_DE_AVISOS_DIAS), LOTE_DE_PRAZOS],
      );

      /*
        ============================================================
        O AGENTE QUE NÃO CONFIRMOU O RETORNO (migração 031).
        ============================================================

        Segundo fato do sino que nenhuma escrita dispara: ele acontece pela
        passagem do tempo, exatamente como o prazo vencido logo acima, e por
        isso mora no mesmo lugar e pelo mesmo motivo. O push deste produto sai
        de um relógio sem ninguém logado, e relógio sem contexto de município
        precisa de função `SECURITY DEFINER`: o teto é de 27, hoje cheio (portão
        CA-06, em `db/test/isolamento.test.ts`), e o portão reprova a vigésima
        oitava.

        O QUE ISSO CUSTA, e está dito em voz alta no guia do coordenador em vez
        de disfarçado: o aviso só nasce quando alguém daquele município consulta
        o sino. Se ninguém estiver com o painel aberto, ninguém é avisado. Este
        produto não tem como acordar quem foi almoçar, e fingir que tem seria a
        promessa perigosa que este recurso inteiro existe para não fazer.

        `encerrada_em IS NULL` não é filtro de desempenho, é o que impede o
        alarme falso mais previsível daqui: o agente perde o sinal, volta dez
        minutos depois do prazo e confirma. Se ele confirmar antes de alguém
        abrir o sino, o aviso não chega a existir. Depois de existir ele fica,
        porque aviso é fato acontecido e a tabela não tem policy de UPDATE, e
        aí a tela de saídas conta o resto da história.

        Sem teto de retenção na cláusula, diferente do prazo vencido: uma saída
        aberta há sessenta dias é defeito grave e precisa aparecer, não ser
        varrida por idade. O `LOTE_DE_PRAZOS` continua limitando o tamanho da
        rodada.
      */
      await c.query(
        `WITH sem_retorno AS (
           SELECT s.organizacao_id AS org,
                  s.ocorrencia_id  AS ocorrencia,
                  s.retorno_previsto_em AS prazo,
                  /*
                    O instante do prazo entra na chave pela mesma razão que ele
                    entra na chave do prazo vencido: prorrogada, a saída pode
                    vencer de novo, e isso é fato novo. Fosse só o id da saída,
                    o segundo vencimento seria engolido em silêncio, e engolir
                    em silêncio é justamente o que não pode acontecer quando o
                    assunto é alguém que não desceu do morro.
                  */
                  'saida:' || s.id::text || ':'
                    || trunc(extract(epoch FROM s.retorno_previsto_em))::text AS chave,
                  /*
                    O detalhe do aviso é 'sozinho' ou 'acompanhado', e mais
                    nada. Nome do agente não entra: o sino é a consulta mais
                    frequente do produto, e a regra de que ele não carrega dado
                    de pessoa vale para o servidor também. O nome está na tela
                    de saídas, que é para onde o aviso leva.
                  */
                  CASE WHEN s.sozinho THEN 'sozinho' ELSE 'acompanhado' END AS detalhe
             FROM saidas_a_campo s
            WHERE s.encerrada_em IS NULL
              AND s.retorno_previsto_em <= now()
         )
         INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, detalhe)
         SELECT v.org, 'retorno_nao_confirmado', v.ocorrencia, v.chave, v.detalhe
           FROM sem_retorno v
          WHERE NOT EXISTS (
                  SELECT 1 FROM avisos a
                   WHERE a.organizacao_id = v.org AND a.chave_do_fato = v.chave
                )
          ORDER BY v.prazo ASC
          LIMIT $1
         ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING`,
        [LOTE_DE_PRAZOS],
      );

      /*
        A idade também está na policy `avisos_expurgo` (migração 018), então
        repeti-la aqui é redundância de propósito: se um dia alguém escrever um
        `DELETE` sem cláusula nesta tabela, o banco recusa apagar o que ainda
        vale. A cláusula daqui existe para quem lê o código entender o que a
        linha faz sem precisar abrir a migração.
      */
      await c.query(
        `DELETE FROM avisos
          WHERE id IN (
            SELECT id FROM avisos
             WHERE criado_em < now() - ($1 || ' days')::interval
             ORDER BY criado_em
             LIMIT $2
          )`,
        [String(RETENCAO_DE_AVISOS_DIAS), LOTE_DE_EXPURGO],
      );

      /*
        Uma linha a mais que o teto, para descobrir que há mais sem pagar um
        `count(*)` na mesma tabela. Mesmo recurso da lista de pendências do
        aplicativo de campo.

        O desempate por `id` não é enfeite: `criado_em` empata com facilidade
        aqui, porque uma sincronização traz várias vistorias na mesma transação
        e todas recebem o mesmo `now()`. Empate sem desempate é ordem
        indefinida, e com teto isso vira sorteio: o aviso que caiu fora agora
        pode ser outro na consulta seguinte, e algum deles não aparece nunca.
      */
      const paramsDaLista: unknown[] = [
        quem.usuarioId, ate, desde ?? null, desdeId ?? null, TETO_DE_AVISOS + 1,
      ];
      const recorteDaLista = eRecorteDoAgente(quem, "o", paramsDaLista);
      const lista = await c.query<LinhaDeAviso>(
        /*
          A ORDEM É CRESCENTE, e essa é a única em que o corte não perde nada.

          Ela já foi decrescente, para o sino abrir mostrando o mais recente, e
          o custo disso era invisível até a lista estourar o teto. Com o corte
          no fim de uma lista decrescente, quem fica de fora são os mais
          ANTIGOS da janela, e o cursor devolvido é sempre para a frente: a
          pergunta seguinte começa depois de tudo isso. Numa coordenadoria que
          gera algumas dezenas de avisos por dia, a primeira carga estourava o
          teto, e os que sobravam ficavam contados no número do sino e
          inalcançáveis pela lista, para sempre.

          Crescente, quem fica de fora do corte são os mais NOVOS, e eles são
          exatamente aonde o cursor seguinte aponta. O cliente pergunta de novo
          enquanto `truncada` for verdadeira e alcança o presente em poucas
          voltas, sem buraco.

          O preço é a primeira carga de um município atrasado começar pelo
          aviso mais antigo em vez do mais recente. É preço de tela, e o outro
          lado da moeda era perder aviso.
        */
        `SELECT a.id, a.tipo, a.ocorrencia_id, a.criado_em, a.detalhe,
                o.protocolo,
                (l.usuario_id IS NOT NULL) AS lido
           FROM avisos a
           JOIN ocorrencias o
             ON o.organizacao_id = a.organizacao_id AND o.id = a.ocorrencia_id
           LEFT JOIN avisos_lidos l
             ON l.organizacao_id = a.organizacao_id
            AND l.aviso_id = a.id
            AND l.usuario_id = $1
          WHERE a.criado_em <= $2::timestamptz
            AND ($3::timestamptz IS NULL OR a.criado_em > $3::timestamptz
                 OR ($4::uuid IS NOT NULL
                     AND a.criado_em = $3::timestamptz AND a.id > $4::uuid))
            ${recorteDaLista}
          ORDER BY a.criado_em, a.id
          LIMIT $5`,
        paramsDaLista,
      );

      const truncada = lista.rows.length > TETO_DE_AVISOS;
      const entregues = truncada ? lista.rows.slice(0, TETO_DE_AVISOS) : lista.rows;
      /*
        O CURSOR DE UMA RESPOSTA CORTADA É O ÚLTIMO AVISO ENTREGUE, e não o
        relógio.

        Devolver o relógio aqui seria dizer "você viu tudo até agora" logo
        depois de ter deixado avisos de fora, e a pergunta seguinte pularia
        justamente eles. Apontando para o último entregue, a continuação é
        exata: nem repete o que já saiu, nem passa por cima do que ficou.

        Vai com o `id` junto porque o instante empata: uma sincronização grava
        várias vistorias na mesma transação e todas ficam com o mesmo
        `criado_em`. Com o instante sozinho, o corte no meio de um empate
        deixaria os empatados restantes para trás do cursor.
      */
      const ultimo = entregues[entregues.length - 1];
      const cursor = truncada && ultimo ? ultimo.criado_em : ate;
      const cursorId = truncada && ultimo ? ultimo.id : null;

      const itens = entregues.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        ocorrenciaId: a.ocorrencia_id,
        protocolo: a.protocolo,
        criadoEm: a.criado_em,
        detalhe: a.detalhe,
        lido: a.lido,
      }));

      /*
        A contagem NÃO usa a janela do delta, e é isso que a torna útil.

        Ela conta tudo que esta pessoa ainda não leu, inclusive o que o teto
        acabou de cortar e o que veio antes da última pergunta. É o número que
        sobrevive ao corte: a lista pode estar truncada, e o sino continua
        dizendo a verdade sobre quanto falta.

        Passa pelo MESMO recorte da lista, e junta `ocorrencias` como ela faz:
        sem isso, o número do sino do agente incluiria os avisos de outras
        equipes que a lista não mostra, e a diferença entre os dois números
        seria um oráculo (quantos avisos existem fora do recorte dele).
      */
      const paramsDaContagem: unknown[] = [quem.usuarioId, ate, TETO_DA_CONTAGEM + 1];
      const recorteDaContagem = eRecorteDoAgente(quem, "o", paramsDaContagem);
      const contagem = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM (
             SELECT 1
               FROM avisos a
               JOIN ocorrencias o
                 ON o.organizacao_id = a.organizacao_id AND o.id = a.ocorrencia_id
               LEFT JOIN avisos_lidos l
                 ON l.organizacao_id = a.organizacao_id
                AND l.aviso_id = a.id
                AND l.usuario_id = $1
              WHERE l.usuario_id IS NULL
                AND a.criado_em <= $2::timestamptz
                ${recorteDaContagem}
              LIMIT $3
           ) AS amostra`,
        paramsDaContagem,
      );
      const contados = contagem.rows[0]!.n;
      const naoLidosTruncado = contados > TETO_DA_CONTAGEM;

      return {
        /*
          O valor que a próxima pergunta devolve em `desde`, sem alteração
          nenhuma. Ele sempre saiu do banco: ou é o relógio do servidor, ou é o
          `criado_em` do último aviso entregue quando a resposta foi cortada.
          Em nenhum dos dois casos ele passou pelo relógio de quem perguntou.
        */
        ate: cursor,
        /*
          Vai junto de `ate` em `desdeId` na pergunta seguinte, e só vem
          preenchido quando a resposta foi cortada. Nulo significa "o cursor é
          o relógio, não há empate a desfazer".
        */
        ateId: cursorId,
        itens,
        teto: TETO_DE_AVISOS,
        /*
          O teto calado faria o coordenador achar que viu tudo, que é o mesmo
          defeito do relógio torto por outro caminho. Cortar e dizer que cortou
          é a única forma honesta.

          Verdadeiro aqui também é instrução ao cliente: há mais para buscar, e
          `ate` mais `ateId` apontam exatamente para onde continuar. Perguntar
          de novo na hora, em vez de esperar os trinta segundos do relógio, é o
          que faz um painel atrasado alcançar o presente em poucas voltas.
        */
        truncada,
        naoLidos: naoLidosTruncado ? TETO_DA_CONTAGEM : contados,
        naoLidosTruncado,
      };
    });
  });

  /**
   * Marca como lidos os avisos que esta pessoa recebeu.
   *
   * A leitura é POR PESSOA, e é por isso que ela mora em tabela separada do
   * aviso. Com uma coluna `lido` dentro do aviso, a primeira pessoa da
   * coordenadoria a abrir o sino apagaria o sino de todos os colegas, e nada
   * na tela deles diria que alguma coisa passou.
   *
   * SEM `exigirPermissao`, pela mesma razão da rota acima e da rota de
   * aparelhos: isto é ato da pessoa sobre o próprio estado de leitura, não
   * sobre o acervo do município. O que substitui a permissão é a estreiteza da
   * escrita: a linha nasce carimbada com o município e o usuário do token
   * verificado, e não existe caminho para carimbar outro.
   */
  app.post("/lidos", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { ids } = leituraSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        O agente só marca o que ele PODE VER (o mesmo recorte do sino). Fora do
        recorte o aviso se comporta como se não existisse: `marcados: 0`, igual
        ao identificador de outro município. Sem isso, o "marcados: 1" confirmava
        ao agente que um aviso de outra equipe existe.
      */
      const paramsDeLidos: unknown[] = [quem.usuarioId, ids];
      const recorteDeLidos = eRecorteDoAgente(quem, "o", paramsDeLidos);
      /*
        A inserção passa POR DENTRO de `avisos`, e não direto pela lista de
        identificadores recebida. Dois motivos, e os dois importam:

        1. Identificador de outro município simplesmente não casa com nenhuma
           linha visível, então some sem resposta. Inserido direto, ele bateria
           na chave estrangeira e voltaria como erro de banco, e um erro de
           banco aqui contaria a quem perguntou que aquele aviso existe em
           algum lugar. Recurso de outro município não se confirma.
        2. `ON CONFLICT DO NOTHING` porque marcar duas vezes é o normal: o
           painel reenvia o que já estava marcado sempre que a lista recarrega.
      */
      const r = await c.query<{ aviso_id: string }>(
        `INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id)
         SELECT a.organizacao_id, $1, a.id
           FROM avisos a
           JOIN ocorrencias o
             ON o.organizacao_id = a.organizacao_id AND o.id = a.ocorrencia_id
          WHERE a.id = ANY($2::uuid[])
            ${recorteDeLidos}
         ON CONFLICT DO NOTHING
         RETURNING aviso_id`,
        paramsDeLidos,
      );

      // Quantos passaram a contar como lidos AGORA. O que já estava marcado
      // não entra, e isso é o que permite ao painel saber que não fez nada.
      return { marcados: r.rows.length };
    });
  });
}
