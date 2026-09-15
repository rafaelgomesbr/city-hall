import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chaveDeStorage } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { ROTA_DA_FILA_DO_CAMPO, RegraDeNegocio, autorizar } from "../servidor.js";
import {
  TAMANHO_MAXIMO_BYTES, TIPOS_ACEITOS, type Armazenamento,
} from "../armazenamento/tipos.js";
import { registrarEvento } from "../trilha.js";
import {
  frasePorTetoEstourado, lerUso, resumirUso, type UsoDeArmazenamento,
} from "../armazenamento/uso.js";

/**
 * Ciclo de vida de uma evidência fotográfica.
 *
 *   1. O aparelho pede autorização para enviar, dizendo tipo e tamanho.
 *   2. O servidor confere permissão e dono da ocorrência, DECIDE a chave e
 *      devolve uma URL pré-assinada de vida curta.
 *   3. O aparelho envia os bytes direto para o armazenamento.
 *   4. O aparelho confirma; o servidor verifica que o objeto existe e com que
 *      tamanho, e só então marca a evidência como enviada.
 *
 * O passo 4 não é burocracia. Sem ele, um metadado fica no banco apontando
 * para arquivo que nunca chegou, e a falta só aparece meses depois, quando
 * alguém abre o laudo numa audiência.
 */

/**
 * A folga de relógio, em milissegundos, e o piso de datas.
 *
 * Cópia deliberada de `coletada_em_plausivel` (migração 009), que instalou
 * exatamente esta regra no campo IRMÃO desta foto. `vistorias.coletada_em` e
 * `evidencias.capturada_em` saem impressos no MESMO documento, um como data do
 * ato e outro como data do registro fotográfico, e só o primeiro era conferido.
 *
 * Sem limite nenhum, o posto mais baixo do sistema data uma foto para 2019 e
 * ela sai no laudo como "Capturada em 05/01/2019" embaixo da imagem, ou some
 * de qualquer recorte por período da auditoria sem nunca ter sido apagada. Data
 * no futuro passava igual.
 *
 * As doze horas para frente não são desleixo: relógio trocado, fuso errado e
 * aparelho sem sinal por horas são rotina em campo, e recusar uma evidência
 * legítima em dia de temporal é pior do que aceitar uma hora imprecisa. Quem
 * resolve a precisão é `enviada_em`, que é do servidor e ninguém escolhe.
 *
 * A mesma regra está no banco (migração 024). Aqui ela existe para a resposta
 * ser 422 com explicação, e não 500 vindo de uma restrição de CHECK.
 */
const FOLGA_DE_RELOGIO_MS = 12 * 60 * 60 * 1000;
const PISO_DE_CAPTURA = Date.parse("2020-01-01T00:00:00Z");

function capturaPlausivel(iso: string): boolean {
  const instante = Date.parse(iso);
  return Number.isFinite(instante)
    && instante > PISO_DE_CAPTURA
    && instante < Date.now() + FOLGA_DE_RELOGIO_MS;
}

const pedidoSchema = z.object({
  ocorrenciaId: z.string().uuid(),
  /**
   * Gerada no aparelho no momento da captura. Pedir autorização duas vezes
   * para a mesma foto é o caso comum, não a exceção: o sinal cai entre
   * autorizar e enviar, a URL vence esperando a rede, o aplicativo é fechado
   * no meio. Sem a chave, cada tentativa deixaria uma linha órfã.
   */
  idempotencyKey: z.string().uuid().optional(),
  nomeArquivo: z.string().min(1).max(200),
  tipoConteudo: z.enum(TIPOS_ACEITOS),
  tamanhoBytes: z.number().int().positive().max(TAMANHO_MAXIMO_BYTES),
  legenda: z.string().max(300).optional(),
  capturadaEm: z.string().datetime().refine(capturaPlausivel, {
    message:
      "A data de captura não é plausível: precisa ser posterior a 2020 e não "
      + "pode estar a mais de doze horas no futuro.",
  }),
  coordenada: z.object({ lat: z.number(), lng: z.number() }).optional(),
  ordem: z.number().int().min(0).max(200).default(0),
});

const confirmacaoSchema = z.object({
  evidenciaId: z.string().uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Informe o sha256 em hexadecimal").optional(),
});

export async function rotasEvidencias(
  app: FastifyInstance,
  { banco, armazenamento }: { banco: Banco; armazenamento: Armazenamento },
): Promise<void> {
  /**
   * Autoriza um envio.
   *
   * A chave é montada AQUI, a partir da organização do token. Aceitar a chave
   * que o cliente propõe permitiria gravar sob o prefixo de outra prefeitura,
   * ou sobrescrever a evidência de outra ocorrência. O nome do arquivo entra
   * só como sufixo, e higienizado.
   */
  // `ROTA_DA_FILA_DO_CAMPO`: com o município suspenso, a recusa sai como 503
  // para a fila do aparelho esperar em vez de bloquear a coleta. Ver
  // `auth/suspensao.ts`.
  app.post("/autorizar-envio", ROTA_DA_FILA_DO_CAMPO, async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const dados = pedidoSchema.parse(req.body);

    const resultado = await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        Já autorizada antes: devolve a MESMA linha. Uma URL pré-assinada vence
        em minutos, então reemitir é esperado; criar outra evidência não é.

        MAS SÓ ENQUANTO O ARQUIVO NÃO SUBIU. Este ramo devolvia URL DE ESCRITA
        também quando `enviada_em` já existia, e a revisão adversarial usou
        isso: o mesmo agente repete o pedido com a MESMA `idempotencyKey`
        semanas depois, recebe 201 com `jaEnviada: true`, a mesma
        `chave_storage` e uma autorização de escrita nova, e um PUT com bytes
        diferentes responde 200. O banco continua declarando o `tamanho_bytes` e
        o `sha256` antigos, `enviada_em` intacto, e a trilha não registra nada,
        porque nada mudou no banco. O laudo reimpresso serve os bytes NOVOS,
        com a mesma legenda e o mesmo número de foto.

        A foto é a única peça deste sistema que é prova material do ato. Trocar
        os bytes depois de confirmada não é editar um campo: é substituir a
        prova sem deixar rastro, e num documento que vai para processo.

        Não quebra o fluxo pretendido, e o comentário logo abaixo já dizia por
        quê: quando `jaEnviada` é verdadeiro o aparelho pula o envio dos bytes
        (`packages/campo/src/fila.ts`), então ele nunca usa a URL neste caso. O
        vencimento que justificava reemitir a URL só existe antes do envio.
      */
      if (dados.idempotencyKey) {
        const anterior = await c.query<{
          id: string; chave_storage: string; enviada_em: string | null;
          abandonada_em: string | null;
        }>(
          `SELECT id, chave_storage, enviada_em, abandonada_em
             FROM evidencias WHERE idempotency_key = $1`,
          [dados.idempotencyKey],
        );
        const achada = anterior.rows[0];
        if (achada) {
          /*
            RESSUSCITA a autorização que a varredura de órfão deu por perdida.

            A varredura marca `abandonada_em` numa autorização velha cujo arquivo
            nunca chegou, e o efeito dessa marca é parar de consumir o teto. Se o
            mesmo envio for retomado (o aparelho ficou meses sem sinal, a coleta
            continua lá, e o agente finalmente encontrou rede), a reserva volta a
            valer: sem isto, a foto subiria e o município a teria de graça, ou
            seja, a contabilidade do teto passaria a mentir para o lado que
            ninguém confere.
          */
          if (achada.abandonada_em) {
            await c.query(
              "UPDATE evidencias SET abandonada_em = NULL, abandono_motivo = NULL WHERE id = $1",
              [achada.id],
            );
          }
          return {
            evidenciaId: achada.id,
            chave: achada.chave_storage,
            jaEnviada: achada.enviada_em !== null,
            uso: null as UsoDeArmazenamento | null,
          };
        }
      }

      // Sob RLS: ocorrência de outro município simplesmente não existe daqui.
      const ocorrencia = await c.query<{ id: string; status: string }>(
        "SELECT id, status FROM ocorrencias WHERE id = $1",
        [dados.ocorrenciaId],
      );
      const alvo = ocorrencia.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }
      if (alvo.status === "encerrada") {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa ocorrência já foi encerrada e não aceita evidência nova.",
        );
      }

      /*
        O TETO, conferido na MESMA transação em que a linha nasce.

        Numa transação própria, a conta seria de um instante e a gravação de
        outro, e dois agentes enviando ao mesmo tempo passariam os dois por uma
        margem que só cabia um. Aqui a leitura e o INSERT compartilham a
        transação, e o gatilho da migração 035 é a barreira de baixo.

        E a recusa acontece ANTES de a linha existir: criar a evidência para
        depois negar a URL deixaria uma reserva consumindo teto por uma foto que
        o servidor acabou de recusar.

        DEPOIS da conferência da ocorrência, e não antes. Ocorrência de outro
        município responde 404, e esse 404 não pode virar 507: 507 diria que o
        município do token está cheio, o que é informação sobre ESTE município e
        não sobre o recurso pedido, e ainda faria a fila do aparelho insistir
        para sempre num pedido que nunca vai funcionar.
      */
      const uso = await lerUso(c, dados.tamanhoBytes);
      if (uso.situacao === "recusado") {
        /*
          507, e a escolha do status é do tamanho do produto.

          `packages/campo/src/transporte.ts` trata 5xx e 429 como falha
          TEMPORÁRIA e 4xx como permanente, e item permanente vira `bloqueado`
          na fila do aparelho. Não existe tela para desbloquear coleta recusada:
          um 4xx aqui prenderia a vistoria no telefone do agente até alguém
          apagá-la, e apagar é a única saída que o produto nunca quer oferecer
          para trabalho de campo.

          Com 507 a fila adia e insiste, sem teto de tentativas para falha
          temporária. A coleta sobrevive no aparelho e DRENA SOZINHA no dia em
          que a plataforma ampliar o teto, sem ninguém tocar no telefone de
          quem está na rua.
        */
        throw new RegraDeNegocio(
          "teto_de_armazenamento",
          frasePorTetoEstourado(),
          507,
        );
      }

      // Sufixo único: duas fotos com o mesmo nome no mesmo aparelho não podem
      // sobrescrever uma à outra, e `IMG_0001.jpg` se repete o tempo todo.
      const unico = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const nome = `${unico}-${dados.nomeArquivo}`;
      const chave = chaveDeStorage(quem.organizacaoId, dados.ocorrenciaId, nome);

      /*
        `anexada_por` vem do token verificado, como todo autor deste produto.

        A coluna não existia, e o identificador do usuário já estava em mãos
        aqui, vindo do token, e era descartado. `evidencias` era a única tabela
        de conteúdo sem dono, num sistema que registra até quem ABRIU um laudo.
        Ver a migração 024.
      */
      const evidencia = await c.query<{ id: string }>(
        `INSERT INTO evidencias
           (organizacao_id, ocorrencia_id, chave_storage, legenda, latitude, longitude,
            capturada_em, ordem, tipo_conteudo, tamanho_bytes, idempotency_key,
            anexada_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          quem.organizacaoId, dados.ocorrenciaId, chave, dados.legenda ?? null,
          dados.coordenada?.lat ?? null, dados.coordenada?.lng ?? null,
          dados.capturadaEm, dados.ordem, dados.tipoConteudo, dados.tamanhoBytes,
          dados.idempotencyKey ?? null, quem.usuarioId,
        ],
      );

      return { evidenciaId: evidencia.rows[0]!.id, chave, jaEnviada: false, uso };
    });

    /*
      O arquivo já está lá: a resposta sai SEM autorização de escrita.

      Emitir a URL e confiar que o aparelho não vai usá-la seria deixar a
      substituição de prova dependendo do bom comportamento do cliente. O
      aparelho já lê `jaEnviada` e pula o envio dos bytes, então o que sai daqui
      é exatamente o que ele usa: o identificador da evidência e a chave, para
      ele amarrar a foto ao envelope da vistoria.
    */
    if (resultado.jaEnviada) {
      return resposta.code(201).send({
        evidenciaId: resultado.evidenciaId,
        chave: resultado.chave,
        jaEnviada: true,
      });
    }

    const envio = await armazenamento.urlParaEnviar({
      chave: resultado.chave,
      tipoConteudo: dados.tipoConteudo,
      tamanhoBytes: dados.tamanhoBytes,
    });

    return resposta.code(201).send({
      evidenciaId: resultado.evidenciaId,
      chave: resultado.chave,
      jaEnviada: false,
      url: envio.url,
      cabecalhos: envio.cabecalhos,
      expiraEm: envio.expiraEm,
      /*
        A situação viaja junto da autorização, e não numa rota à parte.

        Quem precisa saber que o balde está enchendo é a coordenação, e ela não
        vai consultar uma tela nova por conta própria. Aqui o número chega
        carregado pelo caminho que já acontece seis vezes por vistoria, sem
        custar consulta nenhuma a mais: ele foi lido na mesma transação.
      */
      ...(resultado.uso ? { armazenamento: resumirUso(resultado.uso) } : {}),
    });
  });

  /**
   * Confirma que o arquivo chegou.
   *
   * O servidor não acredita no cliente: ele pergunta ao armazenamento se o
   * objeto existe e com que tamanho. Se o tamanho não bater com o que foi
   * autorizado, a confirmação é recusada.
   */
  app.post("/confirmar-envio", ROTA_DA_FILA_DO_CAMPO, async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const dados = confirmacaoSchema.parse(req.body);

    const evidencia = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        id: string; ocorrencia_id: string; chave_storage: string;
        tamanho_bytes: string; enviada_em: string | null;
      }>(
        `SELECT id, ocorrencia_id, chave_storage, tamanho_bytes, enviada_em
           FROM evidencias WHERE id = $1`,
        [dados.evidenciaId],
      );
      const achada = r.rows[0];
      if (!achada) throw new RegraDeNegocio("nao_encontrada", "Evidência não encontrada.", 404);
      return achada;
    });

    // Reconfirmar é inofensivo e acontece: o aparelho pode ter perdido a
    // resposta da primeira confirmação.
    if (evidencia.enviada_em) {
      return { evidenciaId: evidencia.id, confirmada: true, jaEstava: true };
    }

    const objeto = await armazenamento.descrever(evidencia.chave_storage);
    if (!objeto.existe) {
      throw new RegraDeNegocio(
        "arquivo_ausente",
        "O arquivo não chegou ao armazenamento. Tente enviar de novo.",
        409,
      );
    }

    const esperado = Number(evidencia.tamanho_bytes);
    if (objeto.tamanhoBytes !== null && objeto.tamanhoBytes !== esperado) {
      throw new RegraDeNegocio(
        "tamanho_divergente",
        "O arquivo enviado não corresponde ao que foi autorizado.",
        409,
      );
    }

    await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        O `WHERE enviada_em IS NULL` e o `RETURNING` não são zelo: eles são o
        que garante UM evento por evidência. A checagem lá em cima resolve o
        reenvio comum, e não resolve a corrida (o aparelho desiste por tempo
        esgotado e repete a confirmação enquanto a primeira ainda roda). As
        duas passariam pela leitura sem achar `enviada_em`, e a trilha, que não
        tem policy de DELETE, ficaria com duas linhas dizendo que a mesma foto
        foi anexada duas vezes.
      */
      const marcada = await c.query<{ id: string }>(
        `UPDATE evidencias
            SET enviada_em = now(), sha256 = COALESCE($2, sha256)
          WHERE id = $1 AND enviada_em IS NULL
        RETURNING id`,
        [dados.evidenciaId, dados.sha256 ?? null],
      );
      if (!marcada.rows[0]) return;

      /*
        ANEXAR PROVA ENTRA NA TRILHA, e até aqui não entrava.

        Esta rota e a de autorização eram as duas únicas escritas do produto
        que não chamavam `registrarEvento`. O sistema registrava quem ABRIU um
        laudo e não registrava quem acrescentou uma FOTO a ele, que é a peça
        que sai impressa no documento oficial. Era a escrita mais barata para
        introduzir prova num dossiê alheio sem deixar rastro.

        O evento nasce AQUI, e não na autorização, porque é aqui que a foto
        passa a existir para o resto do sistema: laudo, termo e tela de detalhe
        filtram por `enviada_em IS NOT NULL`. Uma autorização sem bytes não
        anexa nada, e um evento para ela treinaria quem lê a trilha a ignorar
        linhas que não significam nada.

        Na MESMA transação do UPDATE: ou a foto entra e o rastro entra, ou não
        entra nenhum dos dois.
      */
      await registrarEvento(
        c, quem, evidencia.ocorrencia_id, "evidencia_anexada",
        {
          evidenciaId: evidencia.id,
          tamanhoBytes: Number(evidencia.tamanho_bytes),
          sha256: dados.sha256 ?? null,
        },
        quem.papel === "agente_campo" ? "campo" : "escritorio",
      );
    });

    return { evidenciaId: evidencia.id, confirmada: true, jaEstava: false };
  });

  /**
   * Devolve uma URL de leitura, curta, só depois de conferir a permissão.
   *
   * Nunca existe URL pública: foto de vistoria mostra a casa e a rua de uma
   * família em situação de risco. Quem não tem acesso à ocorrência não recebe
   * link, e quem tem recebe um que vence em minutos.
   */
  app.get("/:id/url", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const evidencia = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{ chave_storage: string; enviada_em: string | null }>(
        "SELECT chave_storage, enviada_em FROM evidencias WHERE id = $1",
        [id],
      );
      return r.rows[0] ?? null;
    });

    if (!evidencia) {
      throw new RegraDeNegocio("nao_encontrada", "Evidência não encontrada.", 404);
    }
    if (!evidencia.enviada_em) {
      throw new RegraDeNegocio(
        "envio_pendente",
        "Essa foto ainda não terminou de subir.",
        409,
      );
    }

    return { url: await armazenamento.urlParaLer(evidencia.chave_storage) };
  });

  /** As evidências já enviadas de uma ocorrência, com URL de leitura em cada. */
  app.get("/ocorrencia/:id", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const linhas = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        id: string; chave_storage: string; legenda: string | null;
        capturada_em: string; ordem: number; tipo_conteudo: string; tamanho_bytes: string;
      }>(
        `SELECT id, chave_storage, legenda, capturada_em, ordem, tipo_conteudo, tamanho_bytes
           FROM evidencias
          WHERE ocorrencia_id = $1 AND enviada_em IS NOT NULL
          ORDER BY ordem, capturada_em`,
        [id],
      );
      return r.rows;
    });

    return {
      itens: await Promise.all(
        linhas.map(async (l) => ({
          id: l.id,
          legenda: l.legenda,
          capturadaEm: l.capturada_em,
          ordem: l.ordem,
          tipoConteudo: l.tipo_conteudo,
          tamanhoBytes: Number(l.tamanho_bytes),
          url: await armazenamento.urlParaLer(l.chave_storage),
        })),
      ),
    };
  });
}
