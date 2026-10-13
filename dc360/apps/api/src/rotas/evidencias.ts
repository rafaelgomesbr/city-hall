import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chaveDeStorage, pedidoDeEvidenciaSchema } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import {
  ROTA_DA_FILA_DO_CAMPO, RegraDeNegocio, autorizar, type Identidade,
} from "../servidor.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import { registrarEvento } from "../trilha.js";
import {
  frasePorTetoEstourado, lerUso, resumirUso, type UsoDeArmazenamento,
} from "../armazenamento/uso.js";
import { eRecorteDoAgente } from "./recorte-do-agente.js";

/**
 * Ciclo de vida de uma evidência fotográfica.
 *
 *   1. O aparelho pede autorização para enviar, dizendo tipo e tamanho.
 *   2. O servidor confere permissão e dono da ocorrência, DECIDE a chave e
 *      devolve uma URL pré-assinada de vida curta.
 *   3. O aparelho envia os bytes direto para o armazenamento.
 *   4. O aparelho confirma; o servidor LÊ o objeto que chegou, confere o
 *      tamanho, calcula a soma SHA-256 ele mesmo, e só então marca a
 *      evidência como enviada, com a soma que ele mediu.
 *
 * O passo 4 não é burocracia. Sem ele, um metadado fica no banco apontando
 * para arquivo que nunca chegou, e a falta só aparece meses depois, quando
 * alguém abre o laudo numa audiência.
 *
 * E o objeto é ESCRITO UMA VEZ SÓ: a autorização do passo 2 carrega
 * `if-none-match: *` assinado, então o armazenamento recusa qualquer PUT
 * numa chave que já tem objeto. É o que fecha a janela entre a confirmação e
 * o vencimento da URL de escrita (ver `armazenamento/tipos.ts`).
 */

/**
 * O esquema do pedido MUDOU DE ENDEREÇO em 15/09/2026, e o motivo é a vistoria
 * 000009/2026: o aparelho concluiu a coleta, a fila pediu a autorização da
 * fotografia três vezes e esta rota respondeu 422 três vezes (`tamanhoBytes:
 * 0`, porque o `size` do `expo-file-system` veio zerado e o aplicativo mandou
 * o zero adiante). O agente viu "Alguns campos precisam ser corrigidos" numa
 * fila sem botão de corrigir, porque a regra só existia aqui.
 *
 * Agora ela mora em `@dc360/shared` (`pedidoDeEvidenciaSchema`), com a folga
 * de relógio, o piso de datas, a lista de tipos e o teto por arquivo, e o
 * aparelho confere o MESMO esquema antes de enfileirar. As mensagens são em
 * português nas duas pontas. Esta rota continua respondendo 422 com `campos`
 * pelo tratador de `servidor.ts`, como sempre respondeu.
 */
const pedidoSchema = pedidoDeEvidenciaSchema;

const confirmacaoSchema = z.object({
  evidenciaId: z.string().uuid(),
  /**
   * Opcional, e NUNCA gravado como veio. Quando o aparelho declara a soma,
   * ela é comparada com a que o servidor calculou dos bytes que chegaram, e
   * divergência recusa a confirmação. O que vai para o banco e para a trilha
   * é sempre a soma medida aqui.
   */
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Informe o sha256 em hexadecimal").optional(),
});

/** A linha de `evidencias` que ainda espera os bytes. */
type EvidenciaPendente = {
  id: string; ocorrencia_id: string; chave_storage: string; tamanho_bytes: string | null;
};

/**
 * A recusa de quem não é o autor da coleta a que a foto pertence.
 *
 * A MESMA `autor_divergente` (409) que a vistoria e a devolução já respondem
 * (`rotas/sincronizacao.ts`), pelo que o aplicativo faz com ela: 409 cai em
 * falha permanente e o item espera a conta de quem fez a coleta. Existe aqui
 * porque a fila do aparelho atravessa a troca de turno, e a foto do agente da
 * manhã podia ser autorizada ou confirmada com o token do agente da noite. A
 * trilha é append-only: `evidencia_anexada` gravada com o autor errado não tem
 * correção possível depois (V2-F00-E06, correção 1).
 */
function autorDivergente(): RegraDeNegocio {
  return new RegraDeNegocio(
    "autor_divergente",
    "Esta foto foi feita por outro agente. Entre neste aparelho com a conta de "
    + "quem fez a vistoria para poder enviá-la.",
    409,
  );
}

export async function rotasEvidencias(
  app: FastifyInstance,
  { banco, armazenamento }: { banco: Banco; armazenamento: Armazenamento },
): Promise<void> {
  /**
   * A confirmação de verdade: lê os bytes, mede, marca e registra.
   *
   * ## Por que o servidor LÊ o objeto, em vez de perguntar o tamanho
   *
   * `sha256` era palavra do cliente. A rota gravava `COALESCE($2, sha256)`
   * com o que viesse no corpo, sem calcular nada, e a sondagem confirmou
   * sessenta e quatro zeros entrando no banco e na trilha como soma da
   * fotografia. Uma soma que ninguém conferiu não prova nada, e a coluna
   * existe para provar que os bytes do laudo são os bytes confirmados.
   *
   * As saídas eram três, e esta é a única que fecha hoje: (a) exigir a soma
   * na autorização e assiná-la no PUT (`x-amz-checksum-sha256`), que depende
   * de o aparelho calcular a soma antes de enfileirar, e ele ainda não faz;
   * (b) usar o ETag do HEAD, que num PUT simples é o MD5 do objeto, mas a
   * coluna é `sha256` e guardar MD5 nela seria mentir sobre o algoritmo; (c)
   * ler os bytes uma vez, aqui, e calcular. O custo de (c) é uma leitura por
   * foto na hora da confirmação (até 15 MB, nunca repetida, porque a
   * confirmação é idempotente), e no R2 a saída de dados não é cobrada. É a
   * segunda exceção documentada à regra "o arquivo nunca passa pelo servidor"
   * (`armazenamento/tipos.ts`), e sai no dia em que (a) existir.
   *
   * A leitura também substitui o HEAD: o tamanho conferido passa a ser o dos
   * bytes lidos, e não o `content-length` que o provedor pode omitir.
   *
   * ## De onde ela é chamada, e por que de dois lugares
   *
   * De `POST /confirmar-envio`, que é o caminho normal, e da REAUTORIZAÇÃO da
   * mesma chave em `POST /autorizar-envio`. O segundo existe por causa da
   * escrita única: com `if-none-match: *` assinado, o reenvio dos bytes
   * depois de a resposta do primeiro PUT se perder (rotina no 3G) responde
   * 412, e o aparelho trata 412 como falha permanente. Então, quando o
   * aparelho volta a pedir autorização para uma chave cujos bytes já estão no
   * armazenamento, o servidor confirma aqui e responde `jaEnviada`, que o
   * aparelho já sabe pular. Nenhum item para na fila por um reenvio de rotina.
   *
   * `falha` do armazenamento vira 503, e não 409: o aparelho trata 5xx como
   * temporário e tenta de novo, que é o certo para um provedor fora do ar. O
   * 409 de "arquivo ausente" que existia aqui para QUALQUER erro do HEAD
   * bloqueava a coleta por um 503 do provedor.
   */
  async function confirmarBytes(
    quem: Identidade,
    evidencia: EvidenciaPendente,
    sha256Declarado: string | null,
  ): Promise<"confirmada" | "ausente"> {
    const leitura = await armazenamento.baixar(evidencia.chave_storage);
    if (leitura.situacao === "ausente") return "ausente";
    if (leitura.situacao === "falha") {
      throw new RegraDeNegocio(
        "armazenamento_indisponivel",
        "Não foi possível conferir o arquivo no armazenamento agora. Tente de novo em instantes.",
        503,
      );
    }

    const esperado = Number(evidencia.tamanho_bytes);
    if (leitura.corpo.byteLength !== esperado) {
      throw new RegraDeNegocio(
        "tamanho_divergente",
        "O arquivo enviado não corresponde ao que foi autorizado.",
        409,
      );
    }

    const sha256 = createHash("sha256").update(leitura.corpo).digest("hex");
    if (sha256Declarado !== null && sha256Declarado !== sha256) {
      throw new RegraDeNegocio(
        "hash_divergente",
        "A soma de verificação informada não corresponde ao arquivo que chegou ao "
        + "armazenamento. Envie a foto de novo.",
        409,
      );
    }

    await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        O `WHERE enviada_em IS NULL` e o `RETURNING` não são zelo: eles são o
        que garante UM evento por evidência. A checagem de `enviada_em` antes
        de chegar aqui resolve o reenvio comum, e não resolve a corrida (o
        aparelho desiste por tempo esgotado e repete a confirmação enquanto a
        primeira ainda roda). As duas passariam pela leitura sem achar
        `enviada_em`, e a trilha, que não tem policy de DELETE, ficaria com
        duas linhas dizendo que a mesma foto foi anexada duas vezes.
      */
      const marcada = await c.query<{ id: string }>(
        `UPDATE evidencias
            SET enviada_em = now(), sha256 = $2
          WHERE id = $1 AND enviada_em IS NULL
        RETURNING id`,
        [evidencia.id, sha256],
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
        entra nenhum dos dois. A soma no detalhe é a MEDIDA, nunca a declarada.
      */
      await registrarEvento(
        c, quem, evidencia.ocorrencia_id, "evidencia_anexada",
        {
          evidenciaId: evidencia.id,
          tamanhoBytes: esperado,
          sha256,
        },
        quem.papel === "agente_campo" ? "campo" : "escritorio",
      );
    });

    return "confirmada";
  }

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

    /*
      O AUTOR DECLARADO CONFERE COM O TOKEN, e vem antes de qualquer leitura do
      banco, pelos mesmos motivos do portão da vistoria: a comparação não toca
      em nada que o município guarda, então não vira oráculo de existência (a
      ocorrência de outro município continua 404, e o 404 sai depois), e vem
      antes da idempotência porque a reautorização de uma foto já gravada, com
      a credencial de outra pessoa, devolveria a evidência dela.

      Opcional por causa do aparelho de versão anterior: sem o campo, o autor
      é quem apresentou o token, e a trilha diz a verdade sobre ele. O que o
      campo impede é a troca de conta no meio da fila escrever o nome errado.
    */
    if (dados.coletadaPor && dados.coletadaPor !== quem.usuarioId) {
      req.log.warn(
        { usuarioId: quem.usuarioId },
        "autorizacao de foto com autor declarado diferente do token",
      );
      throw autorDivergente();
    }

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
          id: string; ocorrencia_id: string; chave_storage: string; tamanho_bytes: string | null;
          enviada_em: string | null; abandonada_em: string | null; anexada_por: string | null;
        }>(
          `SELECT id, ocorrencia_id, chave_storage, tamanho_bytes, enviada_em, abandonada_em,
                  anexada_por
             FROM evidencias WHERE idempotency_key = $1`,
          [dados.idempotencyKey],
        );
        const achada = anterior.rows[0];
        if (achada) {
          /*
            A chave é de outra pessoa: nem devolve a evidência dela, nem a
            confirma em nome de quem pediu (o ramo `pendente` abaixo grava
            `evidencia_anexada` com o autor do TOKEN). `anexada_por` nulo é a
            linha de antes da migração 024, que não tinha dono: segue valendo.
          */
          if (achada.anexada_por !== null && achada.anexada_por !== quem.usuarioId) {
            throw autorDivergente();
          }
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
            /*
              Ainda sem `enviada_em`: os bytes PODEM já estar no armazenamento
              (a resposta do PUT se perdeu antes de o aparelho confirmar). A
              decisão fica para fora da transação, porque ela pede uma leitura
              de rede e transação não segura conexão esperando o provedor.
            */
            pendente: achada.enviada_em === null
              ? {
                id: achada.id, ocorrencia_id: achada.ocorrencia_id,
                chave_storage: achada.chave_storage, tamanho_bytes: achada.tamanho_bytes,
              } satisfies EvidenciaPendente
              : null,
          };
        }
      }

      // Sob RLS: ocorrência de outro município simplesmente não existe daqui.
      const ocorrencia = await c.query<{ id: string; status: string; abertura_ms: number }>(
        `SELECT id, status,
                floor(extract(epoch FROM criado_em) * 1000)::float8 AS abertura_ms
           FROM ocorrencias WHERE id = $1`,
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
        A DATA DA CAPTURA NÃO PODE SER ANTERIOR À ABERTURA DO CHAMADO.

        O esquema compartilhado confere o piso de 2020 e a folga de doze horas,
        e não tem como conferir isto: a abertura está no banco. A mesma regra
        vale para a coleta em `rotas/sincronizacao.ts`
        (`datasImplausiveisDaColeta`), e sem ela aqui uma foto datada de ontem
        entrava numa ocorrência aberta hoje, nunca se amarrava a vistoria
        nenhuma, e saía impressa no laudo na seção de fotografias anexadas ao
        protocolo com data anterior ao próprio chamado. Depois da conferência
        da ocorrência (o 404 de outro município sai antes) e antes da reserva
        do teto, porque foto recusada não reserva nada. Mesmo código e mesma
        forma (422 com `campos`) da coleta, para o aparelho tratar as duas
        recusas do mesmo jeito: corrigir, e não repetir.
      */
      if (Date.parse(dados.capturadaEm) < alvo.abertura_ms) {
        throw new RegraDeNegocio(
          "data_implausivel",
          "A data de captura é anterior à abertura deste chamado no sistema. Confira "
          + "a data e a hora do aparelho.",
          422,
          [{
            campo: "capturadaEm",
            mensagem: "A data de captura é anterior à abertura deste chamado no sistema, "
              + "e a fotografia não pode ter sido feita antes de o chamado existir. "
              + "Confira a data e a hora do aparelho.",
          }],
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

      return {
        evidenciaId: evidencia.rows[0]!.id, chave, jaEnviada: false, uso,
        pendente: null as EvidenciaPendente | null,
      };
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

    /*
      REAUTORIZAÇÃO com os bytes já no armazenamento: o servidor confirma aqui
      e responde como responde para foto já enviada.

      É o par da escrita única (ver `confirmarBytes`). Sem isto, o aparelho
      que perdeu a resposta do PUT pediria URL nova, faria o PUT de novo,
      receberia 412 do armazenamento e bloquearia a coleta por um reenvio de
      rotina. Com isto, o ciclo fecha no servidor, que é quem sabe se os bytes
      chegaram, e a URL de escrita nunca é reemitida para uma chave que já tem
      objeto. Se os bytes não estão lá, cai no caminho normal e a URL sai.
    */
    if (resultado.pendente) {
      const desfecho = await confirmarBytes(quem, resultado.pendente, null);
      if (desfecho === "confirmada") {
        return resposta.code(201).send({
          evidenciaId: resultado.evidenciaId,
          chave: resultado.chave,
          jaEnviada: true,
        });
      }
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
   * O servidor não acredita no cliente: ele lê o objeto do armazenamento,
   * confere o tamanho contra o autorizado e calcula a soma ele mesmo. Uma
   * soma declarada no corpo só serve para ser comparada. Ver `confirmarBytes`.
   */
  app.post("/confirmar-envio", ROTA_DA_FILA_DO_CAMPO, async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const dados = confirmacaoSchema.parse(req.body);

    const evidencia = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<EvidenciaPendente & {
        enviada_em: string | null; anexada_por: string | null;
      }>(
        `SELECT id, ocorrencia_id, chave_storage, tamanho_bytes, enviada_em, anexada_por
           FROM evidencias WHERE id = $1`,
        [dados.evidenciaId],
      );
      const achada = r.rows[0];
      if (!achada) throw new RegraDeNegocio("nao_encontrada", "Evidência não encontrada.", 404);
      return achada;
    });

    /*
      SÓ QUEM AUTORIZOU CONFIRMA, e vem antes do atalho de "já estava
      confirmada": a confirmação é o que escreve `evidencia_anexada` na trilha
      append-only, com o autor do token. Com a conta trocada no meio do envio, o
      token da pessoa que entrou depois gravava ali uma fotografia que ela nunca
      viu, e não há como corrigir a linha. Depois da leitura por RLS (a evidência
      de outro município já respondeu 404 acima), para a recusa não distinguir
      o que o município do token não enxerga. `anexada_por` nulo é a linha de
      antes da migração 024, que não tinha dono.
    */
    if (evidencia.anexada_por !== null && evidencia.anexada_por !== quem.usuarioId) {
      throw autorDivergente();
    }

    // Reconfirmar é inofensivo e acontece: o aparelho pode ter perdido a
    // resposta da primeira confirmação.
    if (evidencia.enviada_em) {
      return { evidenciaId: evidencia.id, confirmada: true, jaEstava: true };
    }

    const desfecho = await confirmarBytes(quem, evidencia, dados.sha256 ?? null);
    if (desfecho === "ausente") {
      throw new RegraDeNegocio(
        "arquivo_ausente",
        "O arquivo não chegou ao armazenamento. Tente enviar de novo.",
        409,
      );
    }

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
      /*
        Para o agente de campo, a foto de uma ocorrência de outra equipe NÃO
        EXISTE: 404 igual ao de identificador inventado. A foto mostra a casa
        e a rua de uma família, e o token do agente é o que anda pelo morro.
        Ver `recorte-do-agente.ts`.
      */
      const params: unknown[] = [id];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const r = await c.query<{ chave_storage: string; enviada_em: string | null }>(
        `SELECT ev.chave_storage, ev.enviada_em
           FROM evidencias ev JOIN ocorrencias o ON o.id = ev.ocorrencia_id
          WHERE ev.id = $1${recorte}`,
        params,
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
      // O agente vê as fotos da equipe dele. Ocorrência de outra equipe
      // devolve a mesma lista vazia de ocorrência inexistente. Ver
      // `recorte-do-agente.ts`.
      const params: unknown[] = [id];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const r = await c.query<{
        id: string; chave_storage: string; legenda: string | null;
        capturada_em: string; ordem: number; tipo_conteudo: string; tamanho_bytes: string;
      }>(
        `SELECT ev.id, ev.chave_storage, ev.legenda, ev.capturada_em, ev.ordem,
                ev.tipo_conteudo, ev.tamanho_bytes
           FROM evidencias ev JOIN ocorrencias o ON o.id = ev.ocorrencia_id
          WHERE ev.ocorrencia_id = $1 AND ev.enviada_em IS NOT NULL${recorte}
          ORDER BY ev.ordem, ev.capturada_em`,
        params,
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
