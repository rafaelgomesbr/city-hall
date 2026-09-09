import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  MOTIVO_RECLASSIFICAR,
  PRAZO_PADRAO_HORAS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  aberturaOcorrenciaSchema,
  despachoSchema,
  desinterdicaoSchema, encerramentoSchema,
  estadoTerminal,
  precisaReclassificar,
  providenciaSchema,
  respostaProvidenciaSchema,
  transicaoPermitida,
  triagemSchema,
  type StatusOcorrencia,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarEvento } from "../trilha.js";
import { registrarConsulta } from "../privacidade/consulta.js";
import { enderecoDoCliente } from "../rede.js";

const idSchema = z.object({ id: z.string().uuid("Identificador inválido") });

/*
  Bandeira de filtro que chega pela barra de endereço.

  `z.coerce.boolean()` não serve: em JavaScript toda string não vazia é
  verdadeira, então "0" e "false" LIGARIAM o filtro. O link do painel é colado
  e editado à mão, e quem trocasse `atrasadas=1` por `atrasadas=0` para
  desligar continuaria vendo só as atrasadas, achando que aquilo era a fila
  inteira.
*/
const bandeiraSchema = z.enum(["0", "1", "true", "false"]).optional()
  .transform((v) => v === "1" || v === "true");

const consultaSchema = z.object({
  busca: z.string().max(200).optional(),
  status: z.enum([...STATUS_OCORRENCIA, "todas", "ativas"]).default("ativas"),
  severidade: z.enum([...SEVERIDADES, "todas"]).default("todas"),
  atrasadas: bandeiraSchema,
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * O que conta como atrasada, escrito uma vez só.
 *
 * O indicador do painel e o filtro da lista respondem à MESMA pergunta, e até
 * aqui só o painel a respondia no servidor: a lista filtrava no navegador, em
 * cima da página que já tinha baixado. Duas definições parecidas em lugares
 * diferentes divergem sempre, e essas duas já divergiam, porque a do navegador
 * tirava só 'encerrada' e deixava rascunho vencido entrar na conta. O painel
 * dizia trinta atrasadas, a lista mostrava outro número, e não existe jeito de
 * o coordenador saber qual das duas telas mentiu.
 *
 * Rascunho fica de fora por ser chamado que ninguém assumiu ainda, e prazo
 * nulo é ocorrência esperando triagem: nenhum dos dois está atrasado.
 */
function condicaoAtrasada(alias: string): string {
  return `${alias}.status NOT IN ('encerrada','rascunho')
          AND ${alias}.prazo_em IS NOT NULL AND ${alias}.prazo_em < now()`;
}

/**
 * Teto de pontos que o mapa desenha de uma vez.
 *
 * Existe porque desenhar mil marcadores num notebook de prefeitura trava a
 * aba, e não porque mil ocorrências sejam impossíveis: numa enxurrada elas
 * são o esperado. O teto só é aceitável acompanhado do total, que vai na
 * mesma resposta, para a tela poder dizer quantas existem e quantas estão
 * desenhadas. Teto que a tela não conta é o defeito; o tamanho dele não é.
 */
const TETO_DO_MAPA = 200;

const consultaMapaSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(TETO_DO_MAPA).default(TETO_DO_MAPA),
});

/**
 * Lê o status atual e recusa transição que a máquina de estados não permite.
 *
 * A ocorrência é lida DENTRO da transação, com o RLS já aplicado: se o
 * identificador for de outro município, nenhuma linha volta, e a resposta é a
 * mesma que para um identificador inexistente. Não existe forma de descobrir
 * que um protocolo existe em outra prefeitura.
 */
async function exigirTransicao(
  c: Consulta,
  id: string,
  para: StatusOcorrencia,
): Promise<StatusOcorrencia> {
  const r = await c.query<{ status: StatusOcorrencia }>(
    "SELECT status FROM ocorrencias WHERE id = $1",
    [id],
  );
  const de = r.rows[0]?.status;
  if (!de) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
  if (de === para) {
    /*
      Repetir um passo é diferente de repetir um desfecho.

      Reclassificar quem já está em triagem é rotina, e o evento novo diz uma
      verdade: a severidade mudou. Já encerrar quem já está encerrado é clique
      duplicado, e antes disto a rota seguia adiante e gravava um SEGUNDO
      evento de encerramento numa trilha append-only, que por definição não se
      corrige. O `disabled` no botão ajuda; ele não é controle, porque o
      segundo clique pode vir de outra aba, de um F5 ou de uma conexão lenta.
    */
    if (estadoTerminal(de)) {
      throw new RegraDeNegocio(
        "ja_no_estado_final",
        "Essa ocorrência já está encerrada. Nada foi alterado.",
        409,
      );
    }
    return de;
  }
  if (!transicaoPermitida(de, para)) {
    throw new RegraDeNegocio(
      "transicao_invalida",
      `Não é possível ir de "${de}" para "${para}".`,
    );
  }
  return de;
}

export async function rotasOcorrencias(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const f = consultaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];

      if (f.busca?.trim()) {
        params.push(`%${f.busca.trim().toLowerCase()}%`);
        const p = `$${params.length}`;
        condicoes.push(
          `(lower(o.protocolo) LIKE ${p} OR lower(o.endereco) LIKE ${p}
            OR lower(o.solicitante_nome) LIKE ${p} OR lower(o.descricao) LIKE ${p})`,
        );
      }
      if (f.status === "ativas") {
        condicoes.push("o.status NOT IN ('encerrada','rascunho')");
      } else if (f.status !== "todas") {
        params.push(f.status);
        condicoes.push(`o.status = $${params.length}`);
      }
      if (f.severidade !== "todas") {
        params.push(f.severidade);
        condicoes.push(`o.severidade = $${params.length}`);
      }
      /*
        O filtro de atrasadas é do SERVIDOR, e a mesma expressão do indicador
        do painel. Filtrar no navegador só peneirava a página baixada: com o
        recorte de vinte linhas, "só atrasadas" mostrava as atrasadas QUE
        COUBERAM na primeira página, e o rodapé contava essas.
      */
      if (f.atrasadas) condicoes.push(`(${condicaoAtrasada("o")})`);

      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const total = await c.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM ocorrencias o ${onde}`,
        params,
      );

      params.push(f.porPagina, (f.pagina - 1) * f.porPagina);
      const itens = await c.query(
        `SELECT o.*, e.nome AS equipe_nome
           FROM ocorrencias o
           LEFT JOIN equipes e ON e.id = o.equipe_id
           ${onde}
          ORDER BY
            CASE WHEN o.status IN ('encerrada','rascunho') THEN 1 ELSE 0 END,
            CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                              WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
            o.criado_em DESC,
            -- Desempate estável. Sem ele, duas ocorrências com a mesma
            -- severidade e o mesmo instante de abertura (uma importação, um
            -- registro em lote) podem sair em ordem diferente a cada
            -- consulta, e aí a mesma linha aparece na página 1 e na 2
            -- enquanto outra não aparece em nenhuma.
            o.id
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return {
        itens: itens.rows,
        total: Number(total.rows[0]!.total),
        pagina: f.pagina,
        porPagina: f.porPagina,
      };
    });
  });

  /**
   * Os pontos que o mapa desenha, com o total ao lado.
   *
   * O mapa pedia a lista comum e desenhava o que viesse. O que vinha era uma
   * página, porque a lista sempre foi paginada e o painel pedia cem por
   * página: numa enxurrada com duzentas ocorrências ativas, o coordenador via
   * cem marcadores, metade da cidade, e nada na tela dizia que faltava
   * metade. Isso não é lentidão, é informação falsa numa tela de decisão.
   *
   * Por isso esta rota devolve três números além dos pontos: quantas ativas
   * têm coordenada (`total`), quantas ativas NÃO têm (`semCoordenada`, que
   * nunca aparecem no mapa em desenho nenhum) e o tamanho da página. A tela
   * tem com o que dizer a verdade inteira.
   *
   * A ordem é por severidade: se o teto cortar, o que fica de fora é o menos
   * grave, nunca a crítica.
   *
   * Ela também devolve MENOS colunas que a lista, de propósito. O mapa precisa
   * de protocolo, tipo, severidade, endereço e coordenada; relato do
   * solicitante, contato e descrição de vulnerabilidade social não têm o que
   * fazer numa tela que desenha a cidade inteira de uma vez.
   */
  app.get("/mapa", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const f = consultaMapaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const contagem = await c.query<{ com: string; sem: string }>(
        `SELECT
           count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::text AS com,
           count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::text AS sem
           FROM ocorrencias WHERE status NOT IN ('encerrada','rascunho')`,
      );

      const itens = await c.query(
        `SELECT id, protocolo, tipo, status, severidade, endereco, latitude, longitude
           FROM ocorrencias
          WHERE status NOT IN ('encerrada','rascunho')
            AND latitude IS NOT NULL AND longitude IS NOT NULL
          ORDER BY
            CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                            WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
            criado_em DESC,
            id
          LIMIT $1 OFFSET $2`,
        [f.porPagina, (f.pagina - 1) * f.porPagina],
      );

      return {
        itens: itens.rows,
        total: Number(contagem.rows[0]!.com),
        semCoordenada: Number(contagem.rows[0]!.sem),
        pagina: f.pagina,
        porPagina: f.porPagina,
      };
    });
  });

  app.get("/:id", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = idSchema.parse(req.params);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const ocorrencia = await c.query(
        `SELECT o.*, e.nome AS equipe_nome
           FROM ocorrencias o LEFT JOIN equipes e ON e.id = o.equipe_id
          WHERE o.id = $1`,
        [id],
      );
      if (!ocorrencia.rows[0]) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      const [trilha, vistoria, providencias, vinculada, vinculadas] = await Promise.all([
        c.query(
          `SELECT id, tipo, autor_nome, autor_papel, origem, ocorrido_em, registrado_em, detalhe
             FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY ocorrido_em`,
          [id],
        ),
        c.query(
          `SELECT v.*, u.nome AS agente_nome FROM vistorias v
             LEFT JOIN usuarios u ON u.id = v.agente_id
                        WHERE v.ocorrencia_id = $1
            ORDER BY v.sincronizada_em DESC, v.coletada_em DESC LIMIT 1`,
          [id],
        ),
        c.query(
          `SELECT * FROM providencias WHERE ocorrencia_id = $1 ORDER BY encaminhada_em DESC`,
          [id],
        ),
        /*
          O vínculo de duplicidade era capturado na abertura e nunca mostrado.
          Isso deixava a deteção de duplicidade pela metade: o operador
          escolhia vincular, e ninguém mais via a decisão. Nas duas direções,
          porque a pergunta "este chamado é o mesmo daquele?" aparece dos dois
          lados.
        */
        c.query(
          `SELECT o.id, o.protocolo, o.status, o.endereco, o.criado_em
             FROM ocorrencias o
             JOIN ocorrencias filha ON filha.vinculada_a = o.id
            WHERE filha.id = $1`,
          [id],
        ),
        c.query(
          `SELECT id, protocolo, status, endereco, criado_em
             FROM ocorrencias WHERE vinculada_a = $1 ORDER BY criado_em`,
          [id],
        ),
      ]);

      /*
        Quem abriu o dossiê fica registrado.

        Esta é a resposta que faltava para "quem viu os dados dessa família?".
        Ela vem DEPOIS da checagem de existência, de propósito: registrar uma
        ocorrência que não existe (ou que é de outro município, o que aqui dá
        no mesmo) transformaria a tabela num diário de tentativas de
        adivinhação de identificador, e daria a quem varre uma forma de encher
        o registro de acesso de um município sem nem saber se ele existe.

        Roda na mesma transação da leitura: ou o dossiê sai e a linha fica, ou
        nenhum dos dois acontece. Ver `privacidade/consulta.ts` para o critério
        de por que o detalhe registra e a listagem não.
      */
      await registrarConsulta(c, quem, {
        ocorrenciaId: id,
        recurso: "ocorrencia_detalhe",
        finalidade: "atendimento",
        ip: enderecoDoCliente(req),
      });

      return {
        ocorrencia: ocorrencia.rows[0],
        trilha: trilha.rows,
        vistoria: vistoria.rows[0] ?? null,
        providencias: providencias.rows,
        /** A ocorrência da qual esta é continuação, se houver. */
        vinculadaA: vinculada.rows[0] ?? null,
        /** As que foram registradas depois e apontam para esta. */
        vinculadas: vinculadas.rows,
      };
    });
  });

  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "abrir_ocorrencia");
    const dados = aberturaOcorrenciaSchema.parse(req.body);

    const criada = await banco.comTenant(quem.organizacaoId, async (c) => {
      // O protocolo sai do banco, dentro da transação, com a linha da
      // sequência travada. Gerar na aplicação abriria corrida entre dois
      // operadores registrando ao mesmo tempo.
      const p = await c.query<{ proximo: string }>(
        "SELECT proximo_protocolo($1) AS proximo",
        [new Date().getFullYear()],
      );
      const protocolo = p.rows[0]!.proximo;

      const r = await c.query<{ id: string; protocolo: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, tipo_descricao, status, endereco,
            ponto_referencia, latitude, longitude,
            solicitante_nome, solicitante_contato, canal_entrada, descricao, vinculada_a)
         VALUES ($1,$2,$3,$4,'registrada',$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id, protocolo`,
        [
          quem.organizacaoId, protocolo, dados.tipo,
          /*
            A descricao SO acompanha "outro", e o banco recusa o contrario
            (`tipo_da_cobrade_nao_guarda_descricao`, migracao 019).

            Sem este `precisaReclassificar` a rota mandaria adiante um texto que
            um cliente tivesse anexado a um tipo da COBRADE, e o chamado morreria
            no INSERT com 500. Descartar aqui e a resposta certa porque nesse
            caso o campo nao e informacao do chamado: e anotacao paralela sem
            lugar, e o formulario nem sequer o oferece quando ha tipo escolhido.
          */
          precisaReclassificar(dados.tipo) ? dados.tipoDescricao?.trim() ?? null : null,
          dados.endereco,
          dados.pontoReferencia?.trim() || null,
          dados.coordenada?.lat ?? null, dados.coordenada?.lng ?? null,
          dados.solicitanteNome, dados.solicitanteContato ?? null,
          dados.canalEntrada, dados.descricao, dados.vinculadaA ?? null,
        ],
      );
      const nova = r.rows[0]!;
      await registrarEvento(c, quem, nova.id, "registro", {
        protocolo: nova.protocolo,
        canal: dados.canalEntrada,
        vinculadaA: dados.vinculadaA ?? null,
        tipo: dados.tipo,
        /*
          O texto entra na trilha alem da coluna, e nao por capricho de
          registro: a reclassificacao na triagem LIMPA `tipo_descricao`, porque
          tipo da COBRADE nao guarda descricao. Sem esta copia na trilha, o que
          o solicitante relatou ao telefone desapareceria no instante em que
          alguem classificasse o chamado, e ninguem conseguiria mais conferir se
          a classificacao correspondia ao relato.
        */
        tipoDescricao: precisaReclassificar(dados.tipo)
          ? dados.tipoDescricao?.trim() ?? null
          : null,
      });
      return nova;
    });

    return resposta.code(201).send(criada);
  });

  /** Possíveis duplicidades: mesmo tipo, ativa, nas últimas 48 horas. */
  app.get("/duplicidades/consulta", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const q = z.object({
      tipo: z.string().min(1),
      endereco: z.string().min(1).max(400),
    }).parse(req.query);

    const termo = q.endereco.split(",")[0]?.trim().toLowerCase() ?? "";
    if (termo.length < 4) return { itens: [] };

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT id, protocolo, endereco, criado_em, status FROM ocorrencias
          WHERE tipo = $1 AND status NOT IN ('encerrada','rascunho')
            AND criado_em > now() - interval '48 hours'
            AND lower(endereco) LIKE $2
          ORDER BY criado_em DESC LIMIT 10`,
        [q.tipo, `%${termo}%`],
      );
      return { itens: r.rows };
    });
  });

  app.post("/:id/triagem", async (req) => {
    const quem = await autorizar(app, req, "classificar_triagem");
    const { id } = idSchema.parse(req.params);
    const t = triagemSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "triagem");

      /*
        A RECLASSIFICACAO, que era coletada e jogada fora.

        `triagemSchema.tipo` existia e esta rota nunca o gravava: o corpo
        passava pelo Zod, o campo era lido e o UPDATE nao o mencionava. Quem
        fizesse a triagem escolhia o tipo, via a tela confirmar, e o chamado
        continuava "outro" no banco, sem nenhum sinal de que a escolha se
        perdeu. Depois do despacho ninguem volta para conferir.

        O tipo anterior e lido ANTES do UPDATE porque e ele que vai para a
        trilha: "reclassificado de outro para deslizamento" e um fato do
        processo, e a trilha e o unico lugar onde ele cabe, ja que a coluna
        guarda so o estado de agora.
      */
      const antes = await c.query<{ tipo: string; tipo_descricao: string | null }>(
        "SELECT tipo, tipo_descricao FROM ocorrencias WHERE id = $1",
        [id],
      );
      const anterior = antes.rows[0]!;
      const tipoNovo = t.tipo ?? anterior.tipo;

      /*
        `tipo_descricao` e zerada junto com a reclassificacao, e a restricao
        `tipo_da_cobrade_nao_guarda_descricao` (migracao 019) recusaria o UPDATE
        se ela ficasse. O texto nao se perde: ele foi para a trilha no registro
        e vai de novo no evento abaixo, que e append-only. O que deixa de
        existir e um campo livre pendurado num registro ja classificado, que
        vira lixeira de anotacao paralela justamente porque ninguem mais o le.
      */
      await c.query(
        `UPDATE ocorrencias
            SET status = 'triagem', severidade = $2,
                vulnerabilidade_presente = $3, vulnerabilidade_descricao = $4,
                prazo_em = criado_em + ($5 || ' hours')::interval,
                tipo = $6,
                tipo_descricao = CASE WHEN $6 = 'outro' THEN tipo_descricao ELSE NULL END
          WHERE id = $1`,
        [id, t.severidade, t.vulnerabilidadePresente,
         t.vulnerabilidadeDescricao ?? null, String(PRAZO_PADRAO_HORAS[t.severidade]),
         tipoNovo],
      );
      await registrarEvento(c, quem, id, "triagem", {
        severidade: t.severidade,
        prazoHoras: PRAZO_PADRAO_HORAS[t.severidade],
        tipo: tipoNovo,
        ...(tipoNovo !== anterior.tipo
          ? {
              tipoAnterior: anterior.tipo,
              /*
                O relato que motivou a classificacao, guardado no mesmo evento
                que a classificacao. Depois deste UPDATE ele nao existe mais em
                coluna nenhuma, e quem auditar precisa poder ler os dois lado a
                lado para saber se a decisao tecnica correspondia ao que a
                pessoa contou ao telefone.
              */
              tipoDescricaoAnterior: anterior.tipo_descricao,
            }
          : {}),
      });
    });

    return { status: "triagem" };
  });

  app.post("/:id/despacho", async (req) => {
    const quem = await autorizar(app, req, "despachar_equipe");
    const { id } = idSchema.parse(req.params);
    const d = despachoSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "em_campo");

      /*
        O PORTAO DA RECLASSIFICACAO. "outro" nao sobrevive ao despacho.

        A taxonomia COBRADE existe para o dado do municipio conversar com o
        sistema nacional, e uma ocorrencia que fica "outro" para sempre e dado
        perdido. Sem este portao a marca de "ainda nao classificado" atravessa
        o fluxo inteiro: o agente coleta, o laudo sai com brasao e assinatura
        dizendo "Outro" no campo do tipo, e ninguem volta para classificar
        depois que a equipe ja foi.

        Aqui e no banco, e nao so aqui: a restricao
        `tipo_a_classificar_nao_passa_do_despacho` (migracao 019) recusa o mesmo
        UPDATE por outro caminho. Esta checagem existe para o coordenador ler
        uma frase que diz o que fazer, em vez de um 500 vindo de SQLSTATE 23514,
        e a do banco existe porque regra de negocio que so mora na rota nao vale
        para a escrita que alguem fizer amanha por um caminho novo.
      */
      const classificacao = await c.query<{ tipo: string }>(
        "SELECT tipo FROM ocorrencias WHERE id = $1",
        [id],
      );
      if (precisaReclassificar(classificacao.rows[0]!.tipo)) {
        throw new RegraDeNegocio("tipo_a_classificar", MOTIVO_RECLASSIFICAR, 409);
      }

      // A equipe é lida sob RLS: equipe de outro município simplesmente não
      // existe daqui, então não há como despachar para fora da prefeitura.
      const equipe = await c.query<{ nome: string; ativa: boolean }>(
        "SELECT nome, ativa FROM equipes WHERE id = $1",
        [d.equipeId],
      );
      const encontrada = equipe.rows[0];
      if (!encontrada) {
        throw new RegraDeNegocio("equipe_inexistente", "Equipe não encontrada.", 404);
      }
      if (!encontrada.ativa) {
        throw new RegraDeNegocio("equipe_inativa", "Essa equipe está desativada.");
      }
      /*
        O despacho NAO toca em `prazo_em`, e essa linha foi removida em
        09/09/2026 depois de um levantamento achar o defeito.

        Antes daqui saia `prazo_em = now() + prazoHoras`, e isso sobrescrevia o
        prazo que a triagem tinha calculado a partir da severidade. O efeito era
        silencioso e do pior tipo: uma critica aberta as 8h com prazo de 4 horas
        venceria as 12h; despachada as 14h com 24 horas, ela passava a vencer as
        14h do dia seguinte, e as duas horas de atraso SUMIAM do indicador de
        atrasadas do painel. Redespachar zerava de novo. O coordenador olhava um
        numero que dizia que estava tudo em dia.

        Pior ainda, a tela imprimia a regra que este UPDATE contradizia: "o
        prazo vem da severidade definida na triagem: critica em 4 horas, alta em
        24, media em 48 e baixa em 72".

        `d.prazoHoras` continua sendo informacao util, e continua registrado no
        evento da trilha logo abaixo: ele e o coordenador dizendo "cheguem la em
        N horas", que e outro prazo, e nao o prazo de atendimento da ocorrencia.
        Dar coluna propria a ele e trabalho da onda C do plano; o que nao podia
        continuar era um sobrescrever o outro.
      */
      await c.query(
        "UPDATE ocorrencias SET status = 'em_campo', equipe_id = $2 WHERE id = $1",
        [id, d.equipeId],
      );
      await registrarEvento(c, quem, id, "despacho", {
        equipe: encontrada.nome,
        prazoHoras: d.prazoHoras,
        instrucoes: d.instrucoes ?? null,
      });
    });

    return { status: "em_campo" };
  });

  /*
    O destino da providência passa a sair do CATÁLOGO (migração 017).

    `orgaoId` é opcional aqui, e a razão é de compatibilidade, não de gosto:
    uma tela ainda no ar manda só `orgaoDestino`, e recusar esse corpo tiraria
    o encaminhamento do ar no meio de uma chuva. Quando ele vem, o texto do
    catálogo é copiado para `orgao_destino`, que continua existindo como
    registro do nome que o encaminhamento realmente levou; quando não vem, um
    gatilho do banco resolve o nome contra o catálogo do próprio município, e
    cria a entrada se ela não existir. Nos dois caminhos a providência acaba
    amarrada ao catálogo, que é o que permite `orgao_id` ser NOT NULL e a chave
    estrangeira composta valer de verdade.

    O esquema do corpo é estendido AQUI, e não no pacote compartilhado, porque
    `providenciaSchema` é usado também pela tela: acrescentar um campo
    obrigatório lá quebraria o formulário antes de ele existir.
  */
  const providenciaComOrgaoSchema = providenciaSchema.extend({
    orgaoId: z.string().uuid("Órgão inválido").optional(),
  });

  app.post("/:id/providencia", async (req) => {
    const quem = await autorizar(app, req, "encaminhar_providencia");
    const { id } = idSchema.parse(req.params);
    const p = providenciaComOrgaoSchema.parse(req.body);

    const destino = await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "providencia_pendente");

      let orgaoId: string | null = null;
      let nomeDoDestino = p.orgaoDestino;

      if (p.orgaoId) {
        const orgao = await c.query<{ nome: string; ativo: boolean }>(
          "SELECT nome, ativo FROM orgaos WHERE id = $1",
          [p.orgaoId],
        );
        // 404 e não 403: órgão de outro município não se confirma. A leitura
        // roda com o RLS aplicado, então nenhuma linha volta nesse caso, e a
        // resposta é a mesma de um identificador que nunca existiu.
        if (!orgao.rows[0]) {
          throw new RegraDeNegocio("orgao_nao_encontrado", "Órgão não encontrado.", 404);
        }
        if (!orgao.rows[0].ativo) {
          throw new RegraDeNegocio(
            "orgao_desativado",
            `${orgao.rows[0].nome} está desativado no catálogo deste município. `
            + "Escolha outro destino, ou reative o órgão.",
          );
        }
        orgaoId = p.orgaoId;
        nomeDoDestino = orgao.rows[0].nome;
      }

      await c.query(
        `INSERT INTO providencias
           (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval)`,
        [
          quem.organizacaoId, id, orgaoId, nomeDoDestino,
          p.descricao, p.responsavel, String(p.prazoHoras),
        ],
      );
      await c.query("UPDATE ocorrencias SET status = 'providencia_pendente' WHERE id = $1", [id]);
      await registrarEvento(c, quem, id, "providencia", {
        orgao: nomeDoDestino,
        responsavel: p.responsavel,
        prazoHoras: p.prazoHoras,
      });
      return nomeDoDestino;
    });

    return { status: "providencia_pendente", orgaoDestino: destino };
  });

  /**
   * Registra o que o órgão respondeu.
   *
   * A providência fica no caminho do encerramento de propósito: encerrar uma
   * ocorrência cuja providência nunca teve desfecho é o que produz o "a
   * prefeitura não fez nada" seis meses depois, sem ninguém conseguir provar
   * o contrário.
   */
  app.post("/:id/providencia/:providenciaId/resposta", async (req) => {
    const quem = await autorizar(app, req, "responder_providencia");
    const { id, providenciaId } = z.object({
      id: z.string().uuid(),
      providenciaId: z.string().uuid(),
    }).parse(req.params);
    const r = respostaProvidenciaSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ respondida_em: string | null; orgao_destino: string }>(
        "SELECT respondida_em, orgao_destino FROM providencias WHERE id = $1 AND ocorrencia_id = $2",
        [providenciaId, id],
      );
      const alvo = atual.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Providência não encontrada.", 404);
      }
      if (alvo.respondida_em) {
        // Corrigir uma resposta não é sobrescrever: seria apagar o que o
        // órgão disse antes. Entra como providência nova, encaminhada de novo.
        throw new RegraDeNegocio(
          "ja_respondida",
          "Essa providência já tem resposta registrada. Encaminhe uma nova se algo mudou.",
        );
      }

      await c.query(
        `UPDATE providencias
            SET respondida_em = now(), resposta = $2, desfecho = $3, respondida_por = $4
          WHERE id = $1`,
        [providenciaId, r.resposta, r.desfecho, r.respondidaPor],
      );

      await registrarEvento(c, quem, id, "resposta_providencia", {
        orgao: alvo.orgao_destino,
        desfecho: r.desfecho,
        respondidaPor: r.respondidaPor,
      });
    });

    return { desfecho: r.desfecho };
  });

  app.post("/:id/encerramento", async (req) => {
    const quem = await autorizar(app, req, "encerrar_ocorrencia");
    const { id } = idSchema.parse(req.params);
    const e = encerramentoSchema.parse(req.body);

    const pendentes = await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "encerrada");

      /*
        Providência sem resposta não impede encerrar: a realidade da rua é que
        a secretaria às vezes nunca responde, e travar o encerramento faria a
        fila do coordenador crescer para sempre. Mas o fato entra na trilha e
        volta na resposta, para o encerramento ser uma decisão consciente e não
        um esquecimento.
      */
      const abertas = await c.query<{ orgao_destino: string }>(
        "SELECT orgao_destino FROM providencias WHERE ocorrencia_id = $1 AND respondida_em IS NULL",
        [id],
      );

      await c.query(
        `UPDATE ocorrencias SET status = 'encerrada', encerrado_em = now(),
                motivo_encerramento = $2 WHERE id = $1`,
        [id, e.motivo],
      );
      await registrarEvento(c, quem, id, "encerramento", {
        motivo: e.motivo,
        providenciasSemResposta: abertas.rows.map((p) => p.orgao_destino),
      });

      return abertas.rows.map((p) => p.orgao_destino);
    });

    return { status: "encerrada", providenciasSemResposta: pendentes };
  });

  /**
   * Levantar a interdição de um imóvel.
   *
   * O ato que faltava. O sistema sabia interditar (o termo é emitido, a
   * ocorrência fica marcada) e não sabia desinterditar: a casa constava
   * interditada para sempre, e a família voltava para casa sem papel nenhum ou
   * não voltava.
   *
   * Três recusas deliberadas nesta rota:
   *
   * 1. **Não levanta o que não foi interditado.** Sem isso, um clique errado
   *    gravaria um levantamento de interdição que nunca existiu, e o termo
   *    sairia afirmando que uma casa foi liberada de uma restrição imaginária.
   * 2. **Não levanta duas vezes.** O segundo levantamento seria um evento
   *    falso numa trilha que não tem policy de DELETE: não existe correção
   *    depois. É a mesma regra do encerramento duplicado.
   * 3. **Não aceita motivo curto.** O esquema exige quinze caracteres. Quem
   *    autoriza uma família a voltar para uma casa que o município declarou
   *    insegura deve conseguir escrever uma frase sobre o porquê.
   *
   * O que ela deliberadamente NÃO faz: exigir vistoria nova. Deveria, e a
   * norma de campo é essa, mas travar aqui deixaria imóveis interditados sem
   * saída no dia em que a equipe está afogada, que é justamente quando isso
   * acontece. O termo imprime o motivo por extenso, e "sem nova vistoria"
   * fica escrito nele se for o caso.
   */
  app.post("/:id/desinterdicao", async (req) => {
    const quem = await autorizar(app, req, "levantar_interdicao");
    const { id } = idSchema.parse(req.params);
    const d = desinterdicaoSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        `FOR UPDATE` porque duas coordenadoras clicando ao mesmo tempo é o
        cenário em que a checagem sem trava deixa passar os dois: as duas leem
        `desinterditada_em` nulo antes de qualquer uma escrever, e a trilha
        ganha dois levantamentos do mesmo imóvel.
      */
      const atual = await c.query<{
        interditada_em: string | null; desinterditada_em: string | null;
      }>(
        `SELECT interditada_em, desinterditada_em FROM ocorrencias
          WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const alvo = atual.rows[0];
      // 404, e não 403: recurso de outro município não se confirma.
      if (!alvo) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);

      if (!alvo.interditada_em) {
        throw new RegraDeNegocio(
          "nao_interditada",
          "Este imóvel não está interditado, então não há interdição a levantar.",
          409,
        );
      }
      if (alvo.desinterditada_em) {
        throw new RegraDeNegocio(
          "ja_desinterditada",
          "A interdição deste imóvel já foi levantada. Se o risco voltou, "
          + "registre uma vistoria nova e emita novo termo de interdição.",
          409,
        );
      }

      await c.query(
        `UPDATE ocorrencias
            SET desinterditada_em = now(), desinterditada_por = $2,
                desinterdicao_motivo = $3
          WHERE id = $1`,
        [id, quem.usuarioId, d.motivo.trim()],
      );
      await registrarEvento(c, quem, id, "desinterdicao", {
        motivo: d.motivo.trim(),
        interditadaEm: alvo.interditada_em,
      });

      return { status: "desinterditada" };
    });
  });

  /**
   * Os imóveis interditados agora.
   *
   * Esta lista existe pelo mesmo motivo que a de providências vencidas: para
   * que "tem gente fora de casa há quatro meses" seja um fato visível na tela,
   * e não uma descoberta quando alguém reclama. Ordenada pela mais antiga
   * primeiro, que é a que mais dói.
   */
  app.get("/interditados", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
                o.ponto_referencia, o.interditada_em,
                u.nome AS interditada_por_nome
           FROM ocorrencias o
           LEFT JOIN usuarios u ON u.id = o.interditada_por
          WHERE o.interditada_em IS NOT NULL AND o.desinterditada_em IS NULL
          ORDER BY o.interditada_em`,
      );
      return { itens: r.rows };
    });
  });

  /**
   * Providências que vencem sem resposta.
   *
   * Elas somem da fila do coordenador assim que a ocorrência é encerrada, e é
   * justamente aí que ficam esquecidas. Esta lista existe para que "a
   * secretaria não respondeu" seja um fato visível e não uma descoberta seis
   * meses depois.
   */
  app.get("/providencias/pendentes", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT p.id, p.orgao_destino, p.descricao, p.responsavel,
                p.prazo_em, p.encaminhada_em,
                o.id AS ocorrencia_id, o.protocolo, o.endereco, o.status
           FROM providencias p JOIN ocorrencias o ON o.id = p.ocorrencia_id
          WHERE p.respondida_em IS NULL
          ORDER BY p.prazo_em`,
      );
      return { itens: r.rows };
    });
  });

  app.get("/indicadores/painel", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        // O `atrasadas` daqui é a MESMA expressão que a lista usa quando o
        // filtro está ligado. Clicar no indicador precisa levar a uma lista
        // que conte a mesma coisa que o número clicado.
        `SELECT
           count(*) FILTER (WHERE o.status NOT IN ('encerrada','rascunho'))::int AS na_fila,
           count(*) FILTER (WHERE o.status = 'em_campo')::int AS em_campo,
           count(*) FILTER (WHERE ${condicaoAtrasada("o")})::int AS atrasadas,
           count(*) FILTER (WHERE o.status = 'encerrada'
                              AND o.encerrado_em > now() - interval '7 days')::int AS encerradas_7d,
           count(*) FILTER (WHERE o.status NOT IN ('encerrada','rascunho')
                              AND o.severidade = 'critica')::int AS criticas,
           (SELECT count(*) FROM providencias
             WHERE respondida_em IS NULL)::int AS providencias_abertas,
           (SELECT count(*) FROM providencias
             WHERE respondida_em IS NULL AND prazo_em < now())::int
             AS providencias_vencidas
         FROM ocorrencias o`,
      );
      return r.rows[0];
    });
  });
}
