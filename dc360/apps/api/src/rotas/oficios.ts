import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Banco, Consulta } from "../banco/tipos.js";
import type { Config } from "../config.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { gerarTokenRenovacao, hashDoToken } from "../auth/tokens.js";
import type { Notificador } from "../auth/notificador.js";
import { enderecoDoCliente } from "../rede.js";
import {
  mensagemDeOficio, oficioDeEncaminhamento, type DadosDoOficio,
} from "../oficios/documento.js";
import { escapar } from "../documentos/folha.js";
import { registrarEvento } from "../trilha.js";

/**
 * O ofício de encaminhamento: emitir, enviar e abrir.
 *
 * Três decisões desta rota valem estar escritas, porque as três protegem
 * pessoas e nenhuma delas é óbvia lendo o código:
 *
 * 1. **O número é reservado DENTRO da transação que grava o ofício.**
 *    `proximo_oficio` trava a linha da sequência do município até o commit.
 *    Reservar fora, ou ler o último e somar um na aplicação, faria duas
 *    emissões simultâneas receberem o mesmo número, e dois documentos oficiais
 *    diferentes passariam a ter a mesma identificação, um deles na mão do
 *    Corpo de Bombeiros e o outro na de outra secretaria.
 *
 * 2. **O email não leva o ofício, leva o número e um link de uso único.** Ver
 *    `oficios/documento.ts` para a fronteira. O dado sensível não viaja.
 *
 * 3. **A tentativa é registrada ANTES da chamada ao provedor**, e o desfecho
 *    depois. Tentativa que não fica registrada é a que ninguém consegue
 *    investigar, e "mandamos, não chegou" é uma conversa que só termina com
 *    registro de quem mandou, quando, para qual endereço e o que o provedor
 *    respondeu. Inclusive quando falha, principalmente quando falha.
 */

const idSchema = z.object({ id: z.string().uuid() });

const emissaoSchema = z.object({
  providenciaId: z.string().uuid("Identificador de providência inválido"),
  observacoes: z.string().trim().max(2000).optional(),
});

const envioSchema = z.object({
  /*
    Endereço alternativo, e ele é OPCIONAL de propósito.

    O padrão é o email cadastrado no órgão, que é o caminho seguro e o que a
    tela usa. O campo existe porque a realidade tem o setor específico ("o
    plantão do batalhão é outro endereço"), e sem ele a saída informal seria
    reencaminhar o email à mão, com o link de uso único, por fora do sistema.

    Ele NÃO é uma porta para endereço arbitrário: o domínio precisa estar no
    catálogo do próprio município, e quem garante isso é o banco. Ver a
    migração 017.
  */
  destinatario: z.string().trim().email("Informe um email válido").max(320).optional(),
});

type LinhaDoOficio = {
  id: string;
  numero: string;
  ano: number;
  observacoes: string | null;
  emitido_em: string;
  emitido_por_nome: string;
  ocorrencia_id: string;
  providencia_id: string;
  orgao_id: string;
};

/** Traduz a violação da lista fechada de domínios do banco. */
function ehDominioRecusado(erro: unknown): boolean {
  return /nao pertence a nenhum orgao ativo/i.test(String((erro as Error)?.message ?? ""));
}

function ehDuplicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: string }).code;
  if (codigo === "23505") return true;
  return /duplicate key|unique constraint/i.test(String((erro as Error)?.message ?? ""));
}

/**
 * Reúne tudo o que o documento imprime, dentro do contexto do município.
 *
 * Uma consulta por tabela, e não um `join` só, porque a ausência de qualquer
 * uma delas é um erro diferente: ofício inexistente é 404, e providência
 * apagada seria defeito nosso. O `join` devolveria zero linhas nos dois casos
 * e a rota não saberia o que dizer.
 */
async function reunirOficio(
  c: Consulta,
  organizacaoId: string,
  oficioId: string,
): Promise<DadosDoOficio & { oficio: DadosDoOficio["oficio"] & LinhaDoOficio }> {
  const oficio = await c.query<LinhaDoOficio>(
    `SELECT id, numero, ano, observacoes, emitido_em, emitido_por_nome,
            ocorrencia_id, providencia_id, orgao_id
       FROM oficios WHERE id = $1`,
    [oficioId],
  );
  // 404 e não 403: ofício de outro município não se confirma.
  if (!oficio.rows[0]) {
    throw new RegraDeNegocio("nao_encontrado", "Ofício não encontrado.", 404);
  }
  const o = oficio.rows[0];

  const organizacao = await c.query<DadosDoOficio["organizacao"]>(
    "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1",
    [organizacaoId],
  );
  const orgao = await c.query<DadosDoOficio["orgao"]>(
    "SELECT nome, sigla FROM orgaos WHERE id = $1",
    [o.orgao_id],
  );
  const ocorrencia = await c.query<DadosDoOficio["ocorrencia"]>(
    `SELECT protocolo, tipo, endereco, ponto_referencia, descricao, solicitante_nome,
            severidade, vulnerabilidade_presente, vulnerabilidade_descricao, interditada_em
       FROM ocorrencias WHERE id = $1`,
    [o.ocorrencia_id],
  );
  const providencia = await c.query<DadosDoOficio["providencia"]>(
    `SELECT descricao, responsavel, prazo_em, encaminhada_em
       FROM providencias WHERE id = $1`,
    [o.providencia_id],
  );

  return {
    organizacao: organizacao.rows[0]!,
    orgao: orgao.rows[0]!,
    oficio: { ...o },
    ocorrencia: ocorrencia.rows[0]!,
    providencia: providencia.rows[0]!,
  };
}

/** Página curta para quando o link não entrega o documento. */
function paginaDeRecusa(titulo: string, explicacao: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    background: #E9EDF1; color: #14191D; margin: 0; padding: 40px 20px;
  }
  main {
    background: #fff; max-width: 560px; margin: 0 auto; padding: 32px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(16,21,25,0.12);
  }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { line-height: 1.5; margin: 0 0 12px; }
</style>
</head>
<body>
<main>
  <h1>${escapar(titulo)}</h1>
  <p>${escapar(explicacao)}</p>
</main>
</body>
</html>`;
}

export async function rotasOficios(
  app: FastifyInstance,
  { banco, config, notificador, marcaDagua }: {
    banco: Banco;
    config: Config;
    notificador: Notificador;
    marcaDagua?: string;
  },
): Promise<void> {
  /**
   * A lista de ofícios do município (ou de uma ocorrência).
   *
   * `consultar_oficio` ANTES de abrir transação, e não só `exigirAutenticacao`:
   * a rota já foi autenticada-e-nada-mais, e com o token de um agente de campo
   * (o papel cujo aparelho cai e é emprestado) devolvia número, órgão e
   * observações de ofício de ocorrência de QUALQUER equipe. O 403 aqui é da
   * AÇÃO, igual para qualquer ofício que exista ou não, e por isso não
   * confirma nada: o agente nem chega a perguntar por um registro. Recurso de
   * outro município continua 404, porque o RLS não o mostra a ninguém.
   */
  app.get("/", async (req) => {
    const quem = await autorizar(app, req, "consultar_oficio");
    const { ocorrenciaId } = z.object({
      ocorrenciaId: z.string().uuid().optional(),
    }).parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT f.id, f.numero, f.emitido_em, f.emitido_por_nome, f.ocorrencia_id,
                f.providencia_id, g.nome AS orgao_nome, g.sigla AS orgao_sigla,
                (SELECT count(*) FROM oficio_envios e WHERE e.oficio_id = f.id)::int
                  AS envios,
                (SELECT max(e.solicitado_em) FROM oficio_envios e
                  WHERE e.oficio_id = f.id AND e.desfecho = 'entregue') AS ultimo_envio,
                (SELECT max(a.registrado_em) FROM oficio_aberturas a
                  WHERE a.oficio_id = f.id AND a.resultado = 'entregue') AS aberto_em
           FROM oficios f JOIN orgaos g ON g.id = f.orgao_id
          WHERE ($1::uuid IS NULL OR f.ocorrencia_id = $1)
          ORDER BY f.emitido_em DESC`,
        [ocorrenciaId ?? null],
      );
      return { itens: r.rows };
    });
  });

  /**
   * A ficha do ofício: as tentativas de envio e as aberturas do link.
   *
   * É a tela que responde "mandamos ou não, e alguém abriu". Ela NÃO devolve
   * o token nem o hash dele: quem quer o documento pede o documento, na rota
   * abaixo, com permissão. Devolver o hash aqui transformaria uma leitura
   * corriqueira num caminho para reconstruir o link fora do controle da rota
   * pública, que é onde o uso único é cobrado.
   */
  app.get("/:id", async (req) => {
    // A permissão vem ANTES do `idSchema`: com a ordem inversa, um id malformado
    // responderia 422 ao agente e um bem formado 403, e a diferença diria que o
    // agente chegou a ler o corpo do pedido. O 403 é a primeira e única resposta.
    const quem = await autorizar(app, req, "consultar_oficio");
    const { id } = idSchema.parse(req.params);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const oficio = await c.query(
        `SELECT f.id, f.numero, f.observacoes, f.emitido_em, f.emitido_por_nome,
                f.ocorrencia_id, f.providencia_id,
                g.nome AS orgao_nome, g.sigla AS orgao_sigla, g.email AS orgao_email
           FROM oficios f JOIN orgaos g ON g.id = f.orgao_id
          WHERE f.id = $1`,
        [id],
      );
      if (!oficio.rows[0]) {
        throw new RegraDeNegocio("nao_encontrado", "Ofício não encontrado.", 404);
      }

      const envios = await c.query(
        // `provedor_id` volta junto de propósito: é o número que o município
        // leva ao painel do provedor quando o órgão diz que não recebeu. Sem
        // ele na tela, a única forma de responder seria abrir uma sessão no
        // banco de produção, que é o caminho que este produto evita.
        `SELECT id, tentativa, destinatario_email, solicitado_em, solicitado_por_nome,
                desfecho, detalhe, provedor_id, expira_em
           FROM oficio_envios WHERE oficio_id = $1 ORDER BY tentativa`,
        [id],
      );
      const aberturas = await c.query(
        `SELECT envio_id, resultado, registrado_em, host(ip) AS ip
           FROM oficio_aberturas WHERE oficio_id = $1 ORDER BY registrado_em`,
        [id],
      );

      return { ...oficio.rows[0], envios: envios.rows, aberturas: aberturas.rows };
    });
  });

  /**
   * Emitir é queimar um número da sequência do município, e por isso é ato de
   * quem emite documento oficial, e não de quem só abre chamado.
   */
  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "emitir_documento");
    const dados = emissaoSchema.parse(req.body);

    try {
      const criado = await banco.comTenant(quem.organizacaoId, async (c) => {
        const providencia = await c.query<{
          ocorrencia_id: string; orgao_id: string; orgao_nome: string;
        }>(
          `SELECT p.ocorrencia_id, p.orgao_id, g.nome AS orgao_nome
             FROM providencias p JOIN orgaos g ON g.id = p.orgao_id
            WHERE p.id = $1`,
          [dados.providenciaId],
        );
        if (!providencia.rows[0]) {
          throw new RegraDeNegocio("nao_encontrada", "Providência não encontrada.", 404);
        }
        const ocorrenciaId = providencia.rows[0].ocorrencia_id;

        /*
          O ano vem do relógio do BANCO, e não do processo.

          Um servidor com fuso errado emitiria, em 31 de dezembro, um ofício
          numerado no ano seguinte, e a sequência do ano novo começaria em dois.
          O mesmo relógio que carimba `emitido_em` decide o ano do número.
        */
        const ano = await c.query<{ ano: number }>(
          "SELECT extract(year from now())::int AS ano",
        );

        // Reservado DENTRO desta transação: ver o comentário no topo.
        const numero = await c.query<{ numero: string }>(
          "SELECT proximo_oficio($1) AS numero",
          [ano.rows[0]!.ano],
        );

        const r = await c.query<{ id: string; numero: string }>(
          `INSERT INTO oficios
             (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano,
              observacoes, emitido_por, emitido_por_nome)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, numero`,
          [
            quem.organizacaoId, ocorrenciaId, dados.providenciaId,
            providencia.rows[0].orgao_id, numero.rows[0]!.numero, ano.rows[0]!.ano,
            dados.observacoes || null, quem.usuarioId, `${quem.nome} (${quem.papel})`,
          ],
        );

        /*
          O ofício entra na TRILHA DA OCORRÊNCIA, na mesma transação que queima
          o número. Até aqui não entrava: o produto emitia um documento oficial
          numerado, com o cabeçalho da prefeitura, e a tela que alguém abre para
          provar o que aconteceu não sabia que ele existia. "A prefeitura não
          fez nada" ficava sem a resposta que o ofício é. Reproduzido pelo
          revisor de integridade.

          Número e órgão, que é o que identifica o ato. O texto do ofício não
          vai: ele é o dossiê, e a trilha não é lugar de dossiê.
        */
        await registrarEvento(c, quem, ocorrenciaId, "oficio_emitido", {
          numero: r.rows[0]!.numero,
          orgao: providencia.rows[0].orgao_nome,
          providenciaId: dados.providenciaId,
        });
        return r.rows[0]!;
      });

      return resposta.code(201).send(criado);
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        /*
          Um ofício por providência. O segundo clique não queima outro número:
          o órgão receberia dois documentos oficiais pedindo a mesma coisa, e o
          coordenador não teria como saber qual dos dois cobrar depois.
        */
        const existente = await banco.comTenant(quem.organizacaoId, async (c) => {
          const r = await c.query<{ id: string; numero: string }>(
            "SELECT id, numero FROM oficios WHERE providencia_id = $1",
            [dados.providenciaId],
          );
          return r.rows[0] ?? null;
        });
        throw new RegraDeNegocio(
          "ja_emitido",
          `Essa providência já tem o ofício ${existente?.numero ?? "emitido"}. `
          + "Reenvie esse, em vez de emitir outro.",
        );
      }
      throw erro;
    }
  });

  app.get("/:id/documento", async (req, resposta) => {
    const quem = await autorizar(app, req, "emitir_documento");
    const { id } = idSchema.parse(req.params);

    const dados = await banco.comTenant(quem.organizacaoId, (c) =>
      reunirOficio(c, quem.organizacaoId, id));

    return resposta.type("text/html; charset=utf-8").send(
      oficioDeEncaminhamento({ ...dados, ...(marcaDagua ? { marcaDagua } : {}) }),
    );
  });

  /**
   * Envia, ou reenvia, o ofício por email.
   *
   * Permissão de encaminhar providência, e não só de emitir documento: emitir
   * produz um papel dentro do município, enviar coloca um endereço de uso
   * único para o dossiê de uma família dentro da caixa de entrada de outro
   * órgão. São dois atos, e o segundo é o que sai do prédio.
   */
  app.post("/:id/envio", async (req, resposta) => {
    const quem = await autorizar(app, req, "encaminhar_providencia");
    const { id } = idSchema.parse(req.params);
    const dados = envioSchema.parse(req.body ?? {});

    /*
      A recusa vem ANTES de tocar no banco, e a ordem é a decisão.

      Com o envio desligado nada foi tentado, então registrar uma tentativa
      seria inventar um fato. E a resposta diz que o recurso está desligado, em
      vez de responder 202 "enviamos": prometer email que não sai foi um
      defeito real deste produto, confirmado contra a produção, e ele não vai
      se repetir aqui.
    */
    if (config.EMAIL_ATIVO !== "sim") {
      return resposta.code(503).send({
        erro: "envio_desligado",
        mensagem:
          "O envio de ofício por email está desligado neste servidor. "
          + "Imprima o ofício e encaminhe pelo canal de sempre, ou peça a quem "
          + "administra o sistema para ligar o envio.",
      });
    }

    const token = gerarTokenRenovacao();

    // Passo 1: reserva a tentativa e o link, numa transação sua. O commit
    // acontece antes de falarmos com o provedor, senão uma falha de rede
    // desfaria justamente o registro da tentativa que falhou.
    const preparado = await banco.comTenant(quem.organizacaoId, async (c) => {
      const oficio = await c.query<{
        id: string; numero: string; ocorrencia_id: string;
        orgao_nome: string; orgao_email: string | null; orgao_ativo: boolean;
      }>(
        `SELECT f.id, f.numero, f.ocorrencia_id,
                g.nome AS orgao_nome, g.email AS orgao_email, g.ativo AS orgao_ativo
           FROM oficios f JOIN orgaos g ON g.id = f.orgao_id
          WHERE f.id = $1`,
        [id],
      );
      if (!oficio.rows[0]) {
        throw new RegraDeNegocio("nao_encontrado", "Ofício não encontrado.", 404);
      }
      const f = oficio.rows[0];

      if (!f.orgao_ativo) {
        throw new RegraDeNegocio(
          "orgao_desativado",
          `${f.orgao_nome} está desativado no catálogo deste município e não `
          + "recebe encaminhamento novo. Reative o órgão, ou encaminhe para outro.",
        );
      }

      const destino = dados.destinatario?.toLowerCase() ?? f.orgao_email;
      if (!destino) {
        throw new RegraDeNegocio(
          "orgao_sem_email",
          `${f.orgao_nome} não tem email cadastrado. Cadastre o endereço no `
          + "catálogo de órgãos, ou imprima o ofício e encaminhe pelo canal de sempre.",
        );
      }

      const contagem = await c.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM oficio_envios WHERE oficio_id = $1",
        [id],
      );
      const tentativa = contagem.rows[0]!.n + 1;
      if (tentativa > config.OFICIO_MAX_ENVIOS) {
        /*
          Cada envio cria um link de uso único novo para o mesmo dossiê. Sem
          teto, um botão de reenviar clicado em série espalha dezenas de
          endereços vivos para o mesmo conteúdo, e basta um deles vazar.
        */
        throw new RegraDeNegocio(
          "teto_de_envios",
          `Este ofício já foi enviado ${config.OFICIO_MAX_ENVIOS} vezes, que é o `
          + "limite. Cada envio cria um endereço novo para o mesmo documento. "
          + "Fale com o órgão por telefone, ou emita um ofício novo se algo mudou.",
        );
      }

      const contexto = await c.query<{
        municipio: string; uf: string; tipo: string;
      }>(
        `SELECT o.municipio, o.uf, oc.tipo
           FROM organizacoes o, ocorrencias oc
          WHERE o.id = $1 AND oc.id = $2`,
        [quem.organizacaoId, f.ocorrencia_id],
      );

      const envio = await c.query<{ id: string }>(
        `INSERT INTO oficio_envios
           (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
            expira_em, solicitado_por, solicitado_por_nome)
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval, $7,$8)
         RETURNING id`,
        [
          quem.organizacaoId, id, tentativa, destino, hashDoToken(token),
          String(config.OFICIO_LINK_HORAS), quem.usuarioId, `${quem.nome} (${quem.papel})`,
        ],
      );

      return {
        envioId: envio.rows[0]!.id,
        tentativa,
        destino,
        numero: f.numero,
        orgaoNome: f.orgao_nome,
        ocorrenciaId: f.ocorrencia_id,
        contexto: contexto.rows[0]!,
      };
    }).catch((erro: unknown) => {
      if (ehDominioRecusado(erro)) {
        /*
          A lista fechada de domínios, recusada pelo banco e traduzida aqui.

          Sem ela, quem tem login no painel usa o sistema como encaminhador:
          manda o link do dossiê de uma família para o endereço que quiser, com
          o cabeçalho da prefeitura em cima do documento.
        */
        throw new RegraDeNegocio(
          "dominio_nao_autorizado",
          "Esse endereço não pertence a nenhum órgão ativo deste município. "
          + "O ofício só vai para domínio que esteja cadastrado no catálogo de "
          + "órgãos, e isso é o que impede o sistema de virar encaminhador para "
          + "endereço qualquer.",
          422,
        );
      }
      throw erro;
    });

    // Passo 2: fora de transação. O provedor é uma rede, e rede demora.
    const link = `${config.URL_PUBLICA.replace(/\/$/, "")}/publico/oficio/`
      + encodeURIComponent(token);

    let falha: string | null = null;
    /*
      O recibo do provedor, guardado junto do desfecho.

      Sem ele, "o provedor aceitou" é a afirmação de quem tem interesse no
      assunto, e nada mais. Com ele, o município leva o identificador ao painel
      do provedor e lê o que aconteceu com a mensagem depois que ela saiu
      daqui. Fica `null` quando o envio falhou (não houve mensagem aceita) e
      quando o canal não devolve identificador, que são os dois casos que a
      coluna anulável da migração 027 previu.
    */
    let idNoProvedor: string | null = null;
    try {
      const recibo = await notificador.enviar(mensagemDeOficio({
        para: preparado.destino,
        orgaoNome: preparado.orgaoNome,
        numero: preparado.numero,
        municipio: preparado.contexto.municipio,
        uf: preparado.contexto.uf,
        tipoOcorrencia: preparado.contexto.tipo as never,
        link,
        horas: config.OFICIO_LINK_HORAS,
        reenvio: preparado.tentativa > 1,
      }));
      idNoProvedor = recibo.idNoProvedor;
    } catch (erro) {
      falha = erro instanceof Error ? erro.message : String(erro);
    }

    // Passo 3: o desfecho, sempre, inclusive quando falhou.
    await banco.comTenant(quem.organizacaoId, async (c) => {
      await c.query(
        "UPDATE oficio_envios SET desfecho = $2, detalhe = $3, provedor_id = $4 WHERE id = $1",
        [
          preparado.envioId,
          falha ? "falha" : "entregue",
          falha ? falha.slice(0, 500) : null,
          idNoProvedor,
        ],
      );

      /*
        O envio ACEITO entra na trilha da ocorrência, junto do desfecho. Só o
        aceito: um evento "ofício enviado" para uma mensagem que o provedor
        recusou seria a trilha afirmando um envio que não aconteceu. A tentativa
        que falhou continua na ficha do ofício, com o que o provedor respondeu.

        O destinatário é institucional por construção (o banco só aceita
        domínio de órgão ativo do catálogo), e a tentativa diz qual dos envios
        foi este quando o órgão disser que não recebeu.
      */
      if (!falha) {
        await registrarEvento(c, quem, preparado.ocorrenciaId, "oficio_enviado", {
          numero: preparado.numero,
          orgao: preparado.orgaoNome,
          destinatario: preparado.destino,
          tentativa: preparado.tentativa,
        });
      }
    });

    if (falha) {
      req.log.error({ oficio: id, tentativa: preparado.tentativa }, "envio de oficio falhou");
      throw new RegraDeNegocio(
        "envio_falhou",
        "O provedor de email não aceitou a mensagem. A tentativa ficou "
        + "registrada neste ofício. Tente de novo em alguns minutos, ou imprima "
        + "o ofício e encaminhe pelo canal de sempre.",
        502,
      );
    }

    return resposta.code(202).send({
      tentativa: preparado.tentativa,
      // O endereço volta encoberto: esta resposta entra em log de navegador e
      // a tela só precisa confirmar para onde foi, não repetir o endereço.
      destinatario: preparado.destino.replace(/^(.)[^@]*(@.*)$/, "$1***$2"),
      expiraEmHoras: config.OFICIO_LINK_HORAS,
      restantes: config.OFICIO_MAX_ENVIOS - preparado.tentativa,
    });
  });
}

/**
 * A rota que o destinatário abre, sem conta e sem token.
 *
 * Ela roda ANTES de existir contexto de município, como o login: quem clica é
 * uma pessoa do Corpo de Bombeiros. A organização NÃO vem do endereço nem de
 * cabeçalho nenhum, ela vem do banco, resolvida a partir do hash do link, e o
 * link é um segredo de 32 bytes que só existe dentro do email enviado. Depois
 * disso o documento é montado pelo caminho normal, com `SET LOCAL` naquela
 * organização.
 *
 * O que ela faz de diferente de tudo o mais no produto: consome. A abertura
 * bem sucedida acontece UMA vez, e a segunda é recusada e registrada. Ver
 * `abrir_oficio` na migração 017 para por que a garantia é do banco.
 */
export async function rotasOficioPublico(
  app: FastifyInstance,
  { banco, marcaDagua }: { banco: Banco; marcaDagua?: string },
): Promise<void> {
  app.get("/oficio/:token", async (req, resposta) => {
    const { token } = z.object({ token: z.string().min(1).max(400) }).parse(req.params);

    const abertura = await banco.semTenant(async (c) => {
      const r = await c.query<{
        resultado: string; oficio_id: string | null; organizacao_id: string | null;
      }>(
        "SELECT * FROM abrir_oficio($1,$2,$3)",
        [
          hashDoToken(token),
          enderecoDoCliente(req),
          // O agente do navegador entra cortado: serve para distinguir pessoa
          // de robô, e não para identificar quem abriu.
          String(req.headers["user-agent"] ?? "").slice(0, 200),
        ],
      );
      return r.rows[0]!;
    });

    if (abertura.resultado === "entregue") {
      const dados = await banco.comTenant(abertura.organizacao_id!, (c) =>
        reunirOficio(c, abertura.organizacao_id!, abertura.oficio_id!));
      return resposta.type("text/html; charset=utf-8").send(
        oficioDeEncaminhamento({ ...dados, ...(marcaDagua ? { marcaDagua } : {}) }),
      );
    }

    if (abertura.resultado === "ja_aberto") {
      /*
        410, e a mensagem conta o que aconteceu de propósito.

        Se o destinatário legítimo encontra o link já usado, alguém no caminho
        abriu antes dele: o provedor de email, um encaminhamento automático, ou
        quem tiver acesso à caixa. Esconder isso deixaria o vazamento
        silencioso, que é o pior desfecho possível. Dizer transforma o
        incidente em telefonema para a Defesa Civil no mesmo dia.
      */
      return resposta.code(410).type("text/html; charset=utf-8").send(paginaDeRecusa(
        "Este endereço já foi aberto",
        "O endereço do ofício abre uma vez só, e esta não é a primeira. Se você "
        + "não o abriu antes, alguém com acesso a esta mensagem abriu: avise a "
        + "Defesa Civil que enviou o ofício e peça o reenvio. A abertura anterior "
        + "e esta ficaram registradas, com data, hora e endereço de origem.",
      ));
    }

    if (abertura.resultado === "expirado") {
      return resposta.code(410).type("text/html; charset=utf-8").send(paginaDeRecusa(
        "Este endereço expirou",
        "O endereço do ofício tem prazo, e o dele venceu. Peça o reenvio à "
        + "Defesa Civil que emitiu o documento: o novo endereço chega por email "
        + "e vale a partir do envio.",
      ));
    }

    /*
      404 para link desconhecido, com a mesma cara de rota inexistente.

      Distinguir "não existe" de "existe em outro município" contaria a quem
      varre endereços que alguma coisa existe ali, que é exatamente a razão de
      o produto inteiro responder 404 no lugar de 403.
    */
    return resposta.code(404).type("text/html; charset=utf-8").send(paginaDeRecusa(
      "Endereço não encontrado",
      "Este endereço não corresponde a nenhum ofício. Confira se o link foi "
      + "copiado inteiro, e peça o reenvio à Defesa Civil que emitiu o documento.",
    ));
  });
}
