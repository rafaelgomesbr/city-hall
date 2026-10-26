import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  MOTIVO_RECLASSIFICAR,
  ORIGENS_DA_TRIAGEM,
  PRAZO_PADRAO_HORAS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  aberturaOcorrenciaSchema,
  correcaoDeCoordenadaSchema,
  despachoSchema,
  desinterdicaoSchema, encerramentoSchema,
  estadoTerminal,
  precisaReclassificar,
  providenciaSchema,
  respostaProvidenciaSchema,
  transicaoPermitida,
  triagemSchema,
  type StatusOcorrencia,
  anoNoFuso, fusoDoEstado,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarEvento } from "../trilha.js";
import { registrarConsulta } from "../privacidade/consulta.js";
import { semOQueSoODossieEntrega } from "../privacidade/lista.js";
import { enderecoDoCliente } from "../rede.js";
import { eRecorteDoAgente, recorteDoAgente } from "./recorte-do-agente.js";

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

export const consultaSchema = z.object({
  busca: z.string().max(200).optional(),
  status: z.enum([...STATUS_OCORRENCIA, "todas", "ativas"]).default("ativas"),
  severidade: z.enum([...SEVERIDADES, "todas"]).default("todas"),
  atrasadas: bandeiraSchema,
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/** A consulta de possíveis duplicidades (`GET /duplicidades/consulta`). */
export const consultaDeDuplicidadesSchema = z.object({
  tipo: z.string().min(1),
  endereco: z.string().min(1).max(400),
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

export const consultaMapaSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(TETO_DO_MAPA).default(TETO_DO_MAPA),
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
export const providenciaComOrgaoSchema = providenciaSchema.extend({
  orgaoId: z.string().uuid("Órgão inválido").optional(),
});

/**
 * Lê o status atual e recusa transição que a máquina de estados não permite.
 *
 * A ocorrência é lida DENTRO da transação, com o RLS já aplicado: se o
 * identificador for de outro município, nenhuma linha volta, e a resposta é a
 * mesma que para um identificador inexistente. Não existe forma de descobrir
 * que um protocolo existe em outra prefeitura.
 *
 * `FOR UPDATE`, e o UPDATE que vem depois confere o estado de partida (ver
 * `mudarStatus`). Sem os dois, duas abas encerrando ao mesmo tempo liam
 * `em_campo` as duas, gravavam `encerrada` as duas e a trilha ganhava DOIS
 * eventos de encerramento, numa tabela sem policy de UPDATE nem de DELETE. A
 * trava faz a segunda aba esperar a primeira e ler `encerrada`, que
 * `estadoTerminal` recusa com 409. O `AND status = $de` do UPDATE é a segunda
 * camada, para o dia em que alguém escrever uma leitura sem a trava.
 *
 * `origens`, quando vem, estreita a tabela: a rota só aceita partir dali. A
 * triagem usa isto, porque a tabela inteira inclui `em_campo -> triagem`, que
 * é a aresta da devolução de tarefa e não pode ser percorrida por quem
 * classifica (ver `ORIGENS_DA_TRIAGEM` no pacote compartilhado).
 */
async function exigirTransicao(
  c: Consulta,
  id: string,
  para: StatusOcorrencia,
  origens?: readonly StatusOcorrencia[],
): Promise<StatusOcorrencia> {
  const r = await c.query<{ status: StatusOcorrencia }>(
    "SELECT status FROM ocorrencias WHERE id = $1 FOR UPDATE",
    [id],
  );
  const de = r.rows[0]?.status;
  if (!de) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
  if (origens && !origens.includes(de)) {
    throw new RegraDeNegocio(
      "transicao_invalida",
      `Não é possível ir de "${de}" para "${para}" por aqui.`
      + (de === "em_campo" && para === "triagem"
        ? " Uma ocorrência em campo só volta para a triagem pela devolução de "
          + "tarefa, feita pela equipe, com motivo."
        : ""),
    );
  }
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

/**
 * O UPDATE de status, condicionado ao estado que `exigirTransicao` leu.
 *
 * Cada rota escreve as suas colunas (`extra` é o resto do SET, com os
 * parâmetros a partir de `$4`), e esta função põe o que todas precisam e
 * nenhuma tinha: `AND status = $2` no WHERE, e a conferência de que UMA linha
 * mudou. Zero linhas significa que o estado mudou entre a leitura e a
 * escrita, e a resposta é 409 em vez de gravar um evento sobre um estado que
 * já não existe.
 *
 * Com o `FOR UPDATE` da leitura isto não acontece na mesma transação; a
 * conferência é a segunda camada, e custa uma comparação.
 */
async function mudarStatus(
  c: Consulta,
  id: string,
  de: StatusOcorrencia,
  para: StatusOcorrencia,
  extra: { set: string; params: readonly unknown[] } = { set: "", params: [] },
): Promise<void> {
  const r = await c.query<{ id: string }>(
    `UPDATE ocorrencias SET status = $3${extra.set}
      WHERE id = $1 AND status = $2
      RETURNING id`,
    [id, de, para, ...extra.params],
  );
  if (r.rows.length === 0) {
    throw new RegraDeNegocio(
      "estado_mudou",
      `A ocorrência deixou de estar em "${de}" enquanto este pedido era processado. `
      + "Recarregue a tela e confira o estado atual.",
      409,
    );
  }
}

/**
 * Uma linha de `GET /ocorrencias/devolvidas`.
 *
 * SEM a observação, de propósito: ela é texto livre escrito pelo agente na rua
 * e pode nomear um morador. Uma rota de lista a entregaria inteira, do
 * município todo, a cada carregamento de tela e sem registro de consulta.
 * `tem_observacao` existe para a tela poder dizer que há texto a ler sem
 * entregar o texto; quem precisa dele abre a ocorrência, e aquela rota
 * registra a consulta.
 */
type DevolvidaEsperandoDecisao = {
  id: string;
  protocolo: string;
  endereco: string;
  status: string;
  severidade: string | null;
  prazo_em: string | null;
  devolvida_em: string;
  devolvida_por_nome: string | null;
  motivo: string;
  tem_observacao: boolean;
};

/** O índice único parcial da migração 052: a corrida na criação cai nele. */
const INDICE_DA_CHAVE_DE_CRIACAO = "ocorrencias_chave_de_criacao";

/**
 * A violação de unicidade da chave de criação, e só ela. Qualquer outro 23505
 * (o protocolo, por exemplo) continua sendo erro de verdade.
 */
function ehConflitoDaChaveDeCriacao(erro: unknown): boolean {
  const e = erro as { code?: string; constraint?: string; message?: string };
  if (e?.code !== "23505") return false;
  return e.constraint === INDICE_DA_CHAVE_DE_CRIACAO
    || String(e.message ?? "").includes(INDICE_DA_CHAVE_DE_CRIACAO);
}

/** O chamado já criado com esta chave neste município, se houver. */
async function chamadoDaChave(
  c: Consulta,
  organizacaoId: string,
  chave: string,
): Promise<{ id: string; protocolo: string } | null> {
  const r = await c.query<{ id: string; protocolo: string }>(
    "SELECT id, protocolo FROM ocorrencias WHERE organizacao_id = $1 AND chave_de_criacao = $2",
    [organizacaoId, chave],
  );
  return r.rows[0] ?? null;
}

export async function rotasOcorrencias(
  app: FastifyInstance,
  { banco, despertarPush }: {
    banco: Banco;
    /**
     * Acorda a varredura de push. Ausente com `PUSH_ATIVO=nao`. Só o
     * despacho chama, e só depois do commit: ver o comentário lá.
     */
    despertarPush?: () => void;
  },
): Promise<void> {
  /**
   * As ocorrências que voltaram do campo sem vistoria e ainda esperam decisão.
   *
   * ## Por que uma rota, e não uma coluna a mais na lista
   *
   * Devolver tira a ocorrência de `em_campo` e a devolve para `triagem`, e isso
   * apaga informação na tela: ela passa a aparecer como "Em triagem" no meio
   * das que nunca saíram. Quem despacha precisa ver a diferença, porque a
   * decisão é outra: uma nunca foi tentada, a outra já falhou uma vez e o
   * motivo diz o que mudar.
   *
   * Separada da lista paginada de propósito. São poucos casos, eles somem
   * quando a decisão sai, e o painel precisa deles inteiros para contar quantos
   * são, enquanto a lista de ocorrências é paginada no servidor desde o T5. Uma
   * coluna a mais lá obrigaria a peneirar no navegador aquilo que o servidor
   * pagina, que é o defeito exato que aquela lista já corrigiu uma vez.
   *
   * ## Por que ela NÃO devolve a observação do agente
   *
   * `observacao` é texto livre escrito na rua e pode nomear um morador ou
   * descrever a saúde de quem mora na casa. Uma rota de LISTA que a devolvesse
   * entregaria o texto de todas as devoluções do município de uma vez, a cada
   * carregamento de tela, sem registro de consulta: seria a versão nova do
   * resíduo que o T11 declarou sobre `GET /ocorrencias`.
   *
   * Sai o MOTIVO, que é de lista fechada e não é dado pessoal, mais
   * `tem_observacao`, para a tela poder dizer que há texto a ler sem entregar o
   * texto. Quem precisa dele abre a ocorrência, e aquela rota registra a
   * consulta, que é o desenho que o T11 deixou pronto.
   *
   * ## Permissão
   *
   * `despachar_equipe`, porque a decisão que esta lista pede é despachar de
   * novo. O agente de campo não tem essa permissão, e não deveria: a lista
   * inteira do município por uma porta lateral é justamente a visão que ele não
   * tem em lugar nenhum do produto.
   */
  app.get("/devolvidas", async (req) => {
    const quem = await autorizar(app, req, "despachar_equipe");

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<DevolvidaEsperandoDecisao>(
        `SELECT o.id, o.protocolo, o.endereco, o.status, o.severidade,
                o.prazo_em,
                d.decidida_em AS devolvida_em,
                u.nome        AS devolvida_por_nome,
                d.motivo,
                (d.observacao IS NOT NULL) AS tem_observacao
           FROM ocorrencias o
           JOIN LATERAL (
             /*
                A devolução MAIS RECENTE, e só ela. Uma ocorrência pode ter sido
                devolvida por duas equipes em dias diferentes, e a tela mostra
                uma linha: mostrar a primeira diria o motivo que já foi tratado.
             */
             SELECT dd.decidida_em, dd.motivo, dd.observacao, dd.devolvida_por
               FROM devolucoes_de_tarefa dd
              WHERE dd.ocorrencia_id = o.id
              ORDER BY dd.decidida_em DESC, dd.id DESC
              LIMIT 1
           ) d ON true
           LEFT JOIN usuarios u ON u.id = d.devolvida_por
          WHERE o.status = 'triagem'
          ORDER BY o.prazo_em NULLS LAST, o.id`,
      );
      /*
        `status = 'triagem'` é o que faz o aviso sumir sozinho quando a
        coordenação despacha de novo, sem ninguém marcar nada como lido. Aviso
        que fica depois de resolvido ensina a ignorar aviso.

        `LEFT JOIN` em `usuarios` porque a conta de quem devolveu pode ter sido
        desativada desde então, e a linha precisa continuar aparecendo: o fato
        de a equipe não ter chegado ao imóvel não depende de o agente ainda
        trabalhar ali.
      */
      return { itens: r.rows };
    });
  });

  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const f = consultaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];
      let ordemDeRelevancia = "";

      /*
        O agente de campo vê a equipe dele, e mais nada. O recorte entra ANTES
        de qualquer filtro e vale para a contagem e para a página, que saem do
        mesmo `onde`: ver `recorte-do-agente.ts`.
      */
      const recorte = recorteDoAgente(quem, "o", params);
      if (recorte) condicoes.push(recorte);

      /*
        O filtro de texto usa a MESMA normalização e a MESMA tolerância a erro
        da caixa de busca do painel (`GET /busca`, migração 041): o termo e a
        chave de busca da linha atravessam `normalizar_busca`, e `casa_busca`
        aceita substring e parecido por trigramas. "Servidao Boa Esperansa"
        acha "Servidão Boa Esperança" aqui também. Antes era `LIKE` em caixa
        baixa, que não tolerava acento nem letra trocada.

        A chave de busca não carrega o relato (`descricao`), de propósito: ele
        nomeia terceiros e descreve saúde, e não entra no índice de trigramas.
        Como a lista sempre procurou nele, ele continua entrando aqui, por
        substring normalizada, sem o parecido: parecido num relato de trezentas
        palavras é ruído.

        O termo é normalizado uma vez, no banco, e vai pronto como parâmetro:
        a chave de cada linha já está normalizada na coluna gerada.
      */
      if (f.busca?.trim()) {
        const n = await c.query<{ termo: string }>(
          "SELECT normalizar_busca($1) AS termo", [f.busca.trim()],
        );
        const termo = n.rows[0]!.termo;
        if (termo.length > 0) {
          params.push(termo);
          const p = `$${params.length}`;
          condicoes.push(
            `(casa_busca(o.busca, ${p})
              OR normalizar_busca(o.descricao) LIKE ('%' || ${p} || '%'))`,
          );
          /*
            Com filtro de texto, a relevância manda primeiro: quem digitou o
            protocolo inteiro quer aquela linha no topo, e não os protocolos
            vizinhos que se parecem com ele (que a tolerância traz de
            propósito) espalhados pela ordem de severidade. Sem filtro, a
            ordem continua a de sempre.
          */
          ordemDeRelevancia = `pontuar_busca(o.busca, ${p}) DESC,`;
        }
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
            ${ordemDeRelevancia}
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

      /*
        Contato, relato e descrição de vulnerabilidade NÃO saem na lista, para
        papel nenhum. A tabela do painel não os desenha, e devolvê-los em lote
        era ler dado de pessoa do município inteiro sem registro de consulta.
        Quem precisa deles abre o dossiê (`GET /:id`), que registra. Ver
        `privacidade/lista.ts`.
      */
      return {
        itens: itens.rows.map(semOQueSoODossieEntrega),
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
      // O agente vê o mapa da equipe dele, e os três números contam só ela.
      // Ver `recorte-do-agente.ts`.
      const paramsDaContagem: unknown[] = [];
      const recorteDaContagem = eRecorteDoAgente(quem, "o", paramsDaContagem);
      const contagem = await c.query<{ com: string; sem: string }>(
        `SELECT
           count(*) FILTER (WHERE o.latitude IS NOT NULL AND o.longitude IS NOT NULL)::text AS com,
           count(*) FILTER (WHERE o.latitude IS NULL OR o.longitude IS NULL)::text AS sem
           FROM ocorrencias o
          WHERE o.status NOT IN ('encerrada','rascunho')${recorteDaContagem}`,
        paramsDaContagem,
      );

      const params: unknown[] = [f.porPagina, (f.pagina - 1) * f.porPagina];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const itens = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.status, o.severidade, o.endereco,
                o.latitude, o.longitude
           FROM ocorrencias o
          WHERE o.status NOT IN ('encerrada','rascunho')
            AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL${recorte}
          ORDER BY
            CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                              WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
            o.criado_em DESC,
            o.id
          LIMIT $1 OFFSET $2`,
        params,
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
      /*
        Para o agente de campo, o dossiê de outra equipe NÃO EXISTE: mesmo 404
        de identificador inventado ou de outro município, e sem registro de
        consulta, porque a consulta não aconteceu. Ver `recorte-do-agente.ts`.
      */
      const params: unknown[] = [id];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const ocorrencia = await c.query(
        `SELECT o.*, e.nome AS equipe_nome
           FROM ocorrencias o LEFT JOIN equipes e ON e.id = o.equipe_id
          WHERE o.id = $1${recorte}`,
        params,
      );
      if (!ocorrencia.rows[0]) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      const [trilha, vistoria, providencias, vinculada, vinculadas, devolucao] = await Promise.all([
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
        /*
          A devolução mais recente, COM a observação em texto livre.

          É aqui que o texto sai, e não na lista nem na trilha, e os três
          lugares são decisões separadas:

          - Na TRILHA ele nunca entra. Ela é append-only, sem policy de UPDATE
            nem de DELETE, então o texto ficaria permanente e imune ao prazo de
            retenção que o município fixa como controlador. A rota de
            sincronização grava só o motivo e o identificador da devolução.
          - Na LISTA `/devolvidas` ele não sai. Ela entregaria o texto de todas
            as devoluções do município a cada carregamento de tela, sem
            registro de consulta.
          - AQUI ele sai, porque esta rota é o dossiê de UMA ocorrência e
            registra a consulta logo abaixo, que é exatamente o desenho que o
            T11 deixou pronto para dado de cidadão.

          A mais recente, e só ela: duas equipes podem ter devolvido em dias
          diferentes, e a tela mostra uma linha. Mostrar a primeira diria o
          motivo que já foi tratado.
        */
        c.query(
          `SELECT d.decidida_em, d.motivo, d.observacao, d.observacao_removida_em,
                  d.prazo_em, u.nome AS devolvida_por_nome
             FROM devolucoes_de_tarefa d
             LEFT JOIN usuarios u ON u.id = d.devolvida_por
            WHERE d.ocorrencia_id = $1
            ORDER BY d.decidida_em DESC, d.id DESC
            LIMIT 1`,
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
        /**
         * A última devolução do campo, quando houve. Só aqui ela vem com o
         * texto livre do agente, e o porquê está na consulta acima.
         *
         * `observacao_removida_em` preenchido significa que o texto foi
         * descartado pela minimização por prazo (migração 029), e não que não
         * existiu: a tela precisa dessa diferença para não dizer "sem
         * observação" sobre uma frase que o município descartou de propósito.
         */
        devolucao: devolucao.rows[0] ?? null,
      };
    });
  });

  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "abrir_ocorrencia");
    const dados = aberturaOcorrenciaSchema.parse(req.body);
    const chave = dados.chaveDeCriacao;

    /*
      IDEMPOTÊNCIA DA CRIAÇÃO (V2-F02-E07).

      Com `chaveDeCriacao`, repetir o pedido (toque duplo, reenvio sob sinal
      ruim) devolve o chamado que já nasceu, com o MESMO `id` e `protocolo` e
      status 200, sem gerar protocolo: número de protocolo consumido não volta.
      Sem chave, o comportamento é o de sempre, um chamado por pedido.

      A leitura pela chave vem ANTES de `proximo_protocolo`. Na corrida (dois
      pedidos com a mesma chave ao mesmo tempo, os dois sem achar nada), o
      segundo INSERT cai no índice único `ocorrencias_chave_de_criacao`
      (23505). Como o `proximo_protocolo` roda na MESMA transação, ela volta
      inteira e a sequência não é consumida; a rota então relê pela chave e
      devolve o chamado que ganhou. A chave vale só dentro do município do
      token (a leitura e o índice levam `organizacao_id`): a de A não colide com
      a de B e não revela nada a B.
    */
    type Aberta = { id: string; protocolo: string; jaExistia: boolean };
    const abrir = async (c: Consulta): Promise<Aberta> => {
      if (chave) {
        const achado = await chamadoDaChave(c, quem.organizacaoId, chave);
        if (achado) return { ...achado, jaExistia: true };
      }

      // O protocolo sai do banco, dentro da transação, com a linha da
      // sequência travada. Gerar na aplicação abriria corrida entre dois
      // operadores registrando ao mesmo tempo.
      const org = await c.query<{ uf: string | null }>(
        "SELECT uf FROM organizacoes WHERE id = $1",
        [quem.organizacaoId],
      );
      const p = await c.query<{ proximo: string }>(
        "SELECT proximo_protocolo($1) AS proximo",
        [anoNoFuso(new Date(), fusoDoEstado(org.rows[0]?.uf))],
      );
      const protocolo = p.rows[0]!.proximo;

      const r = await c.query<{ id: string; protocolo: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, tipo_descricao, status, endereco,
            ponto_referencia, latitude, longitude,
            solicitante_nome, solicitante_contato, canal_entrada, descricao, vinculada_a,
            chave_de_criacao)
         VALUES ($1,$2,$3,$4,'registrada',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
          chave ?? null,
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
      return { ...nova, jaExistia: false };
    };

    let criada: Aberta;
    try {
      criada = await banco.comTenant(quem.organizacaoId, abrir);
    } catch (erro) {
      if (!chave || !ehConflitoDaChaveDeCriacao(erro)) throw erro;
      // Perdeu a corrida: a transação do INSERT já voltou. Relê e devolve.
      criada = await banco.comTenant(quem.organizacaoId, async (c): Promise<Aberta> => {
        const achado = await chamadoDaChave(c, quem.organizacaoId, chave);
        if (!achado) throw erro;
        return { ...achado, jaExistia: true };
      });
    }

    if (criada.jaExistia) {
      req.log.info(
        { ocorrenciaId: criada.id },
        "abertura repetida com a mesma chave de criacao: devolvido o chamado existente",
      );
    }
    return resposta
      .code(criada.jaExistia ? 200 : 201)
      .send({ id: criada.id, protocolo: criada.protocolo });
  });

  /** Possíveis duplicidades: mesmo tipo, ativa, nas últimas 48 horas. */
  app.get("/duplicidades/consulta", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const q = consultaDeDuplicidadesSchema.parse(req.query);

    const termo = q.endereco.split(",")[0]?.trim().toLowerCase() ?? "";
    if (termo.length < 4) return { itens: [] };

    return banco.comTenant(quem.organizacaoId, async (c) => {
      // O agente não abre ocorrência, e esta consulta também não lhe mostra
      // endereço de fora da equipe dele. Ver `recorte-do-agente.ts`.
      const params: unknown[] = [q.tipo, `%${termo}%`];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.endereco, o.criado_em, o.status FROM ocorrencias o
          WHERE o.tipo = $1 AND o.status NOT IN ('encerrada','rascunho')
            AND o.criado_em > now() - interval '48 hours'
            AND lower(o.endereco) LIKE $2${recorte}
          ORDER BY o.criado_em DESC LIMIT 10`,
        params,
      );
      return { itens: r.rows };
    });
  });

  app.post("/:id/triagem", async (req) => {
    const quem = await autorizar(app, req, "classificar_triagem");
    const { id } = idSchema.parse(req.params);
    const t = triagemSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        SÓ de `registrada` e de `triagem`. A tabela inteira de transições
        inclui `em_campo -> triagem`, que é a aresta da devolução de tarefa, e
        esta rota a percorria: classificava uma ocorrência em campo, o status
        voltava sem limpar a equipe nem registrar devolução, e o aparelho dizia
        ao agente que a tarefa tinha sido "devolvida". Reproduzido pelo revisor.
      */
      const de = await exigirTransicao(c, id, "triagem", ORIGENS_DA_TRIAGEM);

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
      await mudarStatus(c, id, de, "triagem", {
        set: `, severidade = $4,
                vulnerabilidade_presente = $5, vulnerabilidade_descricao = $6,
                prazo_em = criado_em + ($7 || ' hours')::interval,
                tipo = $8,
                tipo_descricao = CASE WHEN $8 = 'outro' THEN tipo_descricao ELSE NULL END`,
        params: [
          t.severidade, t.vulnerabilidadePresente,
          t.vulnerabilidadeDescricao ?? null, String(PRAZO_PADRAO_HORAS[t.severidade]),
          tipoNovo,
        ],
      });
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

    const aparelhosAvisados = await banco.comTenant(quem.organizacaoId, async (c) => {
      const de = await exigirTransicao(c, id, "em_campo");

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
      await mudarStatus(c, id, de, "em_campo", { set: ", equipe_id = $4", params: [d.equipeId] });
      await registrarEvento(c, quem, id, "despacho", {
        equipe: encontrada.nome,
        prazoHoras: d.prazoHoras,
        instrucoes: d.instrucoes ?? null,
      });

      /*
        O AVISO DE TAREFA NOVA NASCE AQUI, na mesma transacao do despacho.

        O pedido, na letra de quem paga (15/09/2026): o celular do agente de
        campo deve obrigatoriamente ser notificado, vibrado ou sonoro, de que
        recebeu uma nova ocorrencia, com som caracteristico. O som e a carga ja
        existiam (`push/mensagem.ts`); o que faltava era ALGUEM produzir o
        aviso, e o unico lugar em que ele pode nascer e o despacho, porque e o
        despacho que decide qual equipe vai.

        ENFILEIRA, NAO ENVIA. Esta rota responde ao coordenador em
        milissegundos e a Apple e o Google respondem quando querem: provedor
        fora do ar nao pode segurar o despacho, e o processo caindo entre o
        despacho e o envio nao pode perder o aviso. Uma linha `tarefa_nova` em
        estado `pendente` por aparelho vivo de cada usuario ativo da equipe,
        dentro da MESMA transacao: ou o despacho e o aviso entram juntos, ou
        nenhum entra. Quem envia e a varredura de avisos (`push/varredor.ts`),
        na rodada seguinte, com a trava, a idempotencia e o tratamento de
        ficha morta que o prazo ja tinha.

        REDESPACHO: a unicidade `notificacao_unica_por_aparelho` (migracao
        016) faz o `ON CONFLICT DO NOTHING`. Mesma equipe de novo (clique
        duplo, F5, segunda aba) nao gera segunda linha; outra equipe gera
        linha para os aparelhos dela, que sao outros. A equipe responsavel e
        conferida DE NOVO na hora do envio (migracao 042): se a tarefa mudar
        de equipe antes da rodada, a equipe antiga nao recebe.

        Tudo sob RLS: `usuarios` e `aparelhos` so mostram os deste municipio,
        e a policy de INSERT da 042 so aceita o carimbo do municipio do
        contexto, `tarefa_nova` e `pendente`. A organizacao vem do token, por
        `comTenant`, e de mais lugar nenhum.

        Equipe sem aparelho registrado: zero linhas, e o despacho segue. O
        aviso e consequencia do despacho, nao condicao dele.
      */
      const enfileirados = await c.query<{ id: string }>(
        `INSERT INTO notificacoes_enviadas
           (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho, tentativas)
         SELECT ap.organizacao_id, ap.id, $1, 'tarefa_nova', 'pendente', 0
           FROM usuarios u
           JOIN aparelhos ap
             ON ap.organizacao_id = u.organizacao_id
            AND ap.usuario_id = u.id
            AND ap.revogado_em IS NULL
          WHERE u.equipe_id = $2 AND u.ativo
         ON CONFLICT ON CONSTRAINT notificacao_unica_por_aparelho DO NOTHING
         RETURNING id`,
        [id, d.equipeId],
      );
      return enfileirados.rows.length;
    });

    /*
      Quantos aparelhos o despacho alcancou, e so isso. Sem ficha, sem nome de
      agente, sem endereco: e o numero que o suporte precisa quando o
      coordenador diz "despachei e ninguem foi avisado", e ele e zero
      exatamente quando a equipe nao tem aparelho registrado, que e a causa
      mais comum dessa frase. Fica fora da transacao para nao registrar um
      numero que um ROLLBACK desfaria.
    */
    req.log.info(
      { ocorrencia: id, aparelhos: aparelhosAvisados },
      "despacho enfileirou o aviso de tarefa nova",
    );

    /*
      ACORDA O VARREDOR, DEPOIS DO COMMIT. Antes daqui o aviso esperava o
      relogio de cinco minutos (`push/varredor.ts`), e cinco minutos entre
      "a coordenacao decidiu" e "o telefone tocou" e o tempo em que a equipe
      sai da base sem saber. Depois do commit, e nao dentro da transacao:
      uma rodada acordada antes nao enxergaria a linha ainda, e voltaria a
      esperar o relogio. A varredura coalesce pedidos e nunca roda em
      paralelo consigo mesma. Sem aparelho na equipe nao ha o que acordar.
    */
    if (aparelhosAvisados > 0) despertarPush?.();

    return { status: "em_campo" };
  });

  app.post("/:id/providencia", async (req) => {
    const quem = await autorizar(app, req, "encaminhar_providencia");
    const { id } = idSchema.parse(req.params);
    const p = providenciaComOrgaoSchema.parse(req.body);

    const destino = await banco.comTenant(quem.organizacaoId, async (c) => {
      const de = await exigirTransicao(c, id, "providencia_pendente");

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
      await mudarStatus(c, id, de, "providencia_pendente");
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

    const desfecho = await banco.comTenant(quem.organizacaoId, async (c) => {
      const de = await exigirTransicao(c, id, "encerrada");

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

      /*
        Interdição ainda de pé é RECUSADA, e não só avisada: encerrar com a
        casa interditada fecharia o processo com uma família fora de casa e
        sem ninguém obrigado a levantar a interdição um dia (depois de
        encerrada, a ocorrência não recebe mais ato: `POST /:id/desinterdicao`
        e o termo de interdição como ATO já recusam `estadoTerminal`). A
        providência sem resposta continua só avisando, porque a secretaria às
        vezes nunca responde e travar o encerramento faria a fila do
        coordenador crescer para sempre; a interdição é diferente, porque quem
        pode levantá-la é a própria coordenação, agora, num ato de segundos.
      */
      const interdicao = await c.query<{ ativa: boolean }>(
        `SELECT (interditada_em IS NOT NULL AND desinterditada_em IS NULL) AS ativa
           FROM ocorrencias WHERE id = $1`,
        [id],
      );
      const interdicaoAtiva = interdicao.rows[0]?.ativa === true;
      if (interdicaoAtiva) {
        throw new RegraDeNegocio(
          "interdicao_ativa",
          "Esta ocorrência está interditada. Levante a interdição antes de encerrar.",
          409,
        );
      }

      await mudarStatus(c, id, de, "encerrada", {
        set: ", encerrado_em = now(), motivo_encerramento = $4",
        params: [e.motivo],
      });
      await registrarEvento(c, quem, id, "encerramento", {
        motivo: e.motivo,
        providenciasSemResposta: abertas.rows.map((p) => p.orgao_destino),
        interdicaoAtiva,
      });

      return {
        providenciasSemResposta: abertas.rows.map((p) => p.orgao_destino),
        interdicaoAtiva,
      };
    });

    return { status: "encerrada", ...desfecho };
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
        status: StatusOcorrencia;
        interditada_em: string | null; desinterditada_em: string | null;
      }>(
        `SELECT status, interditada_em, desinterditada_em FROM ocorrencias
          WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const alvo = atual.rows[0];
      // 404, e não 403: recurso de outro município não se confirma.
      if (!alvo) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);

      /*
        Encerrada não recebe ato, e levantar interdição é ato: muda o estado
        do imóvel e entra na trilha como fato novo. A correção de coordenada já
        recusava o estado terminal e esta rota não, então o processo fechado
        continuava recebendo levantamento. O encerramento avisa quando a
        interdição ainda está de pé (`interdicaoAtiva` na resposta e no
        evento) justamente para o levantamento vir antes de fechar.
      */
      if (estadoTerminal(alvo.status)) {
        throw new RegraDeNegocio(
          "ocorrencia_encerrada",
          "Esta ocorrência está encerrada e não recebe ato novo. A interdição "
          + "precisa ser levantada antes do encerramento.",
          409,
        );
      }

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
   * Corrigir a coordenada de uma ocorrência ABERTA.
   *
   * O DEFEITO QUE ELA FECHA: o alfinete cai no lugar errado e não havia como
   * mover. Endereço ditado por telefone com alguém apavorado do outro lado,
   * geocodificação que erra a quadra, coordenada digitada torto, ou chamado
   * aberto sem ponto nenhum e o ponto descoberto depois. A equipe saía para
   * vistoriar o lugar errado, e a única saída do coordenador era abrir OUTRO
   * protocolo para o mesmo evento só para poder digitar o ponto certo: duas
   * ocorrências onde existe uma casa, e nenhuma das duas contando a história
   * inteira.
   *
   * Cada recusa desta rota, e o motivo de cada uma:
   *
   * 1. **`abrir_ocorrencia` antes de tocar no banco.** É a mesma competência
   *    que informa a localização quando o chamado entra: quem registra o
   *    chamado é quem erra o ponto e é quem precisa poder corrigi-lo, senão a
   *    correção depende de achar a coordenação no meio de um temporal e o
   *    caminho fácil volta a ser abrir protocolo novo. O agente de campo fica
   *    de fora (ele só tem `registrar_vistoria`), e é o desenho certo: o
   *    canal dele para dizer onde a casa fica é a vistoria, com o GPS do
   *    aparelho, e não a edição do registro do escritório.
   * 2. **A organização vem do token verificado**, como em toda rota daqui. A
   *    leitura roda sob RLS, então ocorrência de outro município simplesmente
   *    não existe daqui e a resposta é 404. Nunca 403: um 403 confirmaria que
   *    aquele identificador existe em alguma prefeitura.
   * 3. **Ocorrência encerrada não muda de lugar.** O portão é `estadoTerminal`
   *    e não uma lista de status escrita à mão: os estados que aceitam a
   *    correção são todos os que ainda têm saída na máquina de estados, e
   *    amanhã, se um estado novo entrar, ele não vai precisar ser lembrado
   *    aqui. Encerrada é peça de processo: o laudo já saiu com a coordenada
   *    impressa, e mexer no ponto depois faria o documento assinado divergir
   *    do banco sem que nada avisasse. Encerrada se corrige por evento novo.
   * 4. **A trilha registra ANTES, DEPOIS e o motivo.** Ela não tem policy de
   *    UPDATE nem de DELETE: gravar só o valor novo apagaria a única
   *    informação capaz de responder, meses depois, por que o papel diz um
   *    ponto e a tela diz outro. Coordenada que muda sem rastro é reescrever
   *    histórico com outro nome.
   *
   * A DECISÃO SOBRE VISTORIA JÁ CONCLUÍDA, escrita porque não pode ficar
   * implícita: a correção CONTINUA valendo depois da vistoria, e continua
   * valendo depois de um laudo ter sido emitido. Recusar ali seria devolver o
   * coordenador ao protocolo duplicado justamente no caso mais grave, que é o
   * do imóvel interditado no endereço errado. O que a rota faz em vez de
   * recusar é deixar a divergência VISÍVEL: o evento anota o status em que a
   * ocorrência estava e se um documento oficial já tinha saído com o ponto
   * anterior, porque o laudo é gerado sob demanda (não fica guardado) e a
   * reimpressão vai sair com o ponto novo, diferente do papel que já está
   * dentro do processo. Quem comparar os dois encontra a explicação na trilha.
   *
   * E ela NÃO toca na coordenada da vistoria. Aquele é o GPS que o aparelho
   * mediu no local, um fato de outro autor e de outro momento; sobrescrevê-lo
   * poria no laudo, no campo do que foi medido em campo, um número que
   * aparelho nenhum mediu.
   */
  app.post("/:id/coordenada", async (req) => {
    const quem = await autorizar(app, req, "abrir_ocorrencia");
    const { id } = idSchema.parse(req.params);
    // A faixa e o teto de seis casas vêm do esquema COMPARTILHADO, o mesmo que
    // o painel usa: regra de coordenada válida que só existe no formulário não
    // existe, porque o formulário não é a única porta desta coluna.
    const correcao = correcaoDeCoordenadaSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        `FOR UPDATE` pelo mesmo motivo da desinterdição: duas pessoas
        corrigindo o mesmo ponto ao mesmo tempo leem o valor antigo antes de
        qualquer uma escrever, e a trilha ganharia dois eventos dizendo, os
        dois, que o ponto anterior era o da abertura. O segundo estaria
        mentindo, e a trilha não se corrige.
      */
      const atual = await c.query<{
        status: StatusOcorrencia; latitude: number | null; longitude: number | null;
      }>(
        "SELECT status, latitude, longitude FROM ocorrencias WHERE id = $1 FOR UPDATE",
        [id],
      );
      const alvo = atual.rows[0];
      // 404, e não 403: recurso de outro município não se confirma.
      if (!alvo) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);

      if (estadoTerminal(alvo.status)) {
        throw new RegraDeNegocio(
          "ocorrencia_encerrada",
          "Esta ocorrência está encerrada, e o laudo assinado aponta para a "
          + "coordenada que está gravada. Registre a correção como ocorrência "
          + "nova, vinculada a esta.",
          409,
        );
      }

      /*
        Se um documento oficial já saiu, isso entra no evento.

        A emissão é gravada na trilha (`documento_emitido`), então a pergunta
        tem resposta aqui dentro, na mesma transação. Ela não muda o desfecho:
        muda o que a trilha consegue explicar depois, e é a diferença entre "o
        papel do processo diverge do sistema, ninguém sabe por quê" e "o ponto
        foi corrigido em tal dia, por tal pessoa, por tal motivo, e o termo
        tinha saído antes disso".
      */
      const emitidos = await c.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM trilha_eventos
          WHERE ocorrencia_id = $1 AND tipo = 'documento_emitido'`,
        [id],
      );
      const documentoJaEmitido = Number(emitidos.rows[0]!.total) > 0;

      const anterior = alvo.latitude !== null && alvo.longitude !== null
        ? { lat: alvo.latitude, lng: alvo.longitude }
        : null;

      await c.query(
        "UPDATE ocorrencias SET latitude = $2, longitude = $3 WHERE id = $1",
        [id, correcao.coordenada.lat, correcao.coordenada.lng],
      );

      await registrarEvento(c, quem, id, "correcao_de_coordenada", {
        motivo: correcao.motivo,
        /*
          `anterior` é `null` quando a ocorrência nasceu sem ponto, e isso é
          informação, não ausência dela: "não tinha coordenada e passou a ter"
          é um fato diferente de "o ponto estava na quadra de baixo".
        */
        anterior,
        nova: correcao.coordenada,
        statusNaCorrecao: alvo.status,
        documentoJaEmitido,
      });

      return { coordenada: correcao.coordenada, anterior, documentoJaEmitido };
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
      // Para o agente, só os imóveis da equipe dele. Ver `recorte-do-agente.ts`.
      const params: unknown[] = [];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
                o.ponto_referencia, o.interditada_em,
                u.nome AS interditada_por_nome
           FROM ocorrencias o
           LEFT JOIN usuarios u ON u.id = o.interditada_por
          WHERE o.interditada_em IS NOT NULL AND o.desinterditada_em IS NULL${recorte}
          ORDER BY o.interditada_em`,
        params,
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
      // O agente não encaminha providência e não vê as do município: só as
      // das ocorrências da equipe dele. Ver `recorte-do-agente.ts`.
      const params: unknown[] = [];
      const recorte = eRecorteDoAgente(quem, "o", params);
      const r = await c.query(
        `SELECT p.id, p.orgao_destino, p.descricao, p.responsavel,
                p.prazo_em, p.encaminhada_em,
                o.id AS ocorrencia_id, o.protocolo, o.endereco, o.status
           FROM providencias p JOIN ocorrencias o ON o.id = p.ocorrencia_id
          WHERE p.respondida_em IS NULL${recorte}
          ORDER BY p.prazo_em`,
        params,
      );
      return { itens: r.rows };
    });
  });

  app.get("/indicadores/painel", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        Os números do agente são os da equipe dele: o recorte vale para as
        ocorrências e para as providências, que são contadas pela ocorrência a
        que pertencem. O mesmo `recorte-do-agente.ts` da lista, para o
        indicador clicado levar a uma lista que conte a mesma coisa.
      */
      const params: unknown[] = [];
      const recorte = recorteDoAgente(quem, "o", params);
      const onde = recorte ? `WHERE ${recorte}` : "";
      // O mesmo recorte, com o alias da subconsulta das providências.
      const recorteDasProvidencias = recorteDoAgente(quem, "o2", params);
      const ondeDasProvidencias = recorteDasProvidencias ? `WHERE ${recorteDasProvidencias}` : "";
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
           (SELECT count(*) FROM providencias p
             WHERE p.respondida_em IS NULL
               AND p.ocorrencia_id IN (SELECT o2.id FROM ocorrencias o2 ${ondeDasProvidencias}))::int
             AS providencias_abertas,
           (SELECT count(*) FROM providencias p
             WHERE p.respondida_em IS NULL AND p.prazo_em < now()
               AND p.ocorrencia_id IN (SELECT o2.id FROM ocorrencias o2 ${ondeDasProvidencias}))::int
             AS providencias_vencidas
         FROM ocorrencias o ${onde}`,
        params,
      );
      return r.rows[0];
    });
  });
}
