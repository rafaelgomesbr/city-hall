import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PAPEIS, POSTO, ROTULO_CANAL, ROTULO_PAPEL, ROTULO_SEVERIDADE, ROTULO_STATUS,
  ROTULO_TIPO_COBRADE, dataHoraNoFuso, dataNoFuso, fusoDoEstado, montarCsv, numeroDoTexto,
  type CanalEntrada, type Papel, type Severidade, type StatusOcorrencia,
  type TipoDeEntrada,
} from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { ROTA_GET_COM_EFEITO, RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { enderecoDoCliente } from "../rede.js";

/**
 * Prestação de contas: trilha de auditoria e exportação.
 *
 * Um órgão público responde três perguntas o tempo todo, e nenhuma delas cabe
 * na tela de uma ocorrência isolada:
 *
 *   "quem alterou este registro, e quando?"        -> trilha
 *   "o que a Defesa Civil fez no primeiro semestre?" -> exportação
 *   "quantos chamados vieram daquele bairro?"        -> exportação
 *
 * A trilha é a mesma tabela append-only que o resto do sistema alimenta. Não
 * existe uma "trilha de auditoria" separada que alguém precise lembrar de
 * escrever: ela é o subproduto de cada transição, gravada na mesma transação
 * que a mudança.
 */

export const filtroTrilhaSchema = z.object({
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  autor: z.string().max(200).optional(),
  papel: z.enum(PAPEIS).optional(),
  tipo: z.string().max(60).optional(),
  protocolo: z.string().max(20).optional(),
  pagina: numeroDoTexto(z.number().int().min(1)).default(1),
  porPagina: numeroDoTexto(z.number().int().min(1).max(200)).default(50),
});

export const filtroExportacaoSchema = z.object({
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  status: z.string().max(30).optional(),
});

/**
 * A exportação passa a ter dois níveis, e o padrão é o que NÃO leva pessoa.
 *
 * O DEFEITO QUE ISTO CORRIGE: até aqui existia um botão só, e ele produzia um
 * arquivo com nome, contato, relato e marca de vulnerabilidade de todas as
 * famílias atendidas. Quem queria responder ao Tribunal de Contas quantos
 * chamados houve por bairro levava, no mesmo arquivo, a lista de quem ligou
 * para a Defesa Civil. Esse arquivo sai do sistema e passa a viver num pen
 * drive, num anexo de email e numa pasta compartilhada, e nada consegue
 * trazê-lo de volta.
 *
 * O BÁSICO ATENDE A PRESTAÇÃO DE CONTAS INTEIRA: protocolo, tipo, severidade,
 * endereço, datas, situação, tempos e providências. Nada do que a câmara, o
 * Tribunal de Contas ou o Ministério Público perguntam exige o nome de quem
 * ligou.
 *
 * O COMPLETO NÃO É O PADRÃO, e essa é a decisão inteira: quem exporta tudo por
 * engano já vazou, e o engano é o caso comum, não o raro. Para chegar nele
 * são necessárias três coisas ao mesmo tempo, e nenhuma delas é um clique
 * distraído: posto de administrador, justificativa escrita e um recorte que
 * caiba no teto.
 */
export const nivelDaExportacaoSchema = z.object({
  nivel: z.enum(["basico", "completo"]).default("basico"),
  /*
    O mínimo de vinte caracteres não é burocracia. Sem ele, o campo vira "ok" e
    o registro passa a existir sem informar nada, o que é pior do que não
    existir: dá a aparência de controle sem o controle. Vinte caracteres
    obrigam uma frase, e uma frase é o que alguém lê quando pergunta por que
    aquele arquivo saiu. O mesmo mínimo está no CHECK da migração 021, para
    valer também para qualquer caminho futuro que insira em `exportacoes`.
  */
  justificativa: z.string().trim().min(20, "Escreva por que os dados pessoais precisam sair.")
    .max(500).optional(),
}).refine((v) => v.nivel !== "completo" || Boolean(v.justificativa), {
  path: ["justificativa"],
  message:
    "A exportação com dados pessoais exige justificativa escrita. "
    + "Ela fica no registro de exportações e na trilha administrativa.",
});

/**
 * Teto de linhas do nível completo.
 *
 * Ele não protege o servidor: protege a pessoa. Uma exportação com dado
 * pessoal precisa ser um RECORTE que alguém consegue justificar, e "a base
 * inteira desde 2026" não é recorte. O teto transforma a pergunta "por que
 * você exportou isso?" numa que tem resposta possível.
 *
 * Estourar RECUSA em vez de cortar. Um arquivo truncado em silêncio é pior que
 * uma recusa: ele parece completo, alguém o anexa a um processo, e as
 * ocorrências que ficaram de fora somem sem nenhum sinal.
 */
const TETO_DA_EXPORTACAO_COMPLETA = 5000;

export const filtroConsultasSchema = z.object({
  ocorrencia: z.string().uuid().optional(),
  usuario: z.string().uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * O segundo portão do nível completo: o POSTO MÁXIMO do município.
 *
 * POR QUE POSTO, E NÃO A MESMA PERMISSÃO DE SEMPRE. `exportar_dados` é a
 * permissão da prestação de contas, e a prestação de contas inteira se faz com
 * o nível básico. Se o completo herdasse dela, todo mundo que exporta um
 * relatório de rotina teria, no mesmo botão, a base de nomes das famílias
 * atendidas, e o "não pode ser o padrão" viraria só um texto de tela.
 *
 * O administrador é o teto do município (ver `POSTO`, no pacote compartilhado):
 * acima dele só existe quem provisiona o município, que nem é papel de
 * aplicação. Quem tira nome, contato e descrição de vulnerabilidade do sistema
 * responde pessoalmente por isso perante o encarregado, e essa
 * responsabilidade pertence ao mesmo lugar onde termina a administração das
 * contas.
 *
 * 403 e não 404: o recurso é do próprio município da pessoa, ela só não tem
 * posto para ele. O 404 existe para não revelar recurso de OUTRO município, e
 * não é o caso aqui.
 */
function exigirPostoParaDadoPessoal(papel: Papel): void {
  if (POSTO[papel] < POSTO.administrador) {
    throw new RegraDeNegocio(
      "posto_insuficiente_para_dado_pessoal",
      "A exportação com dados pessoais é de quem administra o município. "
      + "Use a exportação sem dados pessoais, ou peça a quem administra.",
      403,
    );
  }
}

/**
 * Data que o Excel entende, e não a que o JavaScript imprime.
 *
 * O valor vinha do banco como `Date` e era concatenado direto na célula, o que
 * produz `Sat Aug 22 2026 01:49:16 GMT-0300 (Horário Padrão de Brasília)`.
 * Excel e LibreOffice tratam isso como TEXTO: a coluna não ordena, não filtra
 * por período e não entra em fórmula.
 *
 * Isso não é detalhe de formatação. Este arquivo é a peça que vai ao Tribunal
 * de Contas e ao Ministério Público, e a primeira coisa que alguém faz com ele
 * é ordenar por data.
 *
 * `dd/MM/yyyy HH:mm` é o formato que o Excel em português reconhece sozinho,
 * sem assistente de importação.
 *
 * O fuso é o do MUNICÍPIO (V2-F02-E09), e é obrigatório, sem valor padrão:
 * antes saía o do processo, que em contêiner é UTC, e uma ocorrência das 22h
 * de Brasília ia para a planilha com a data do dia seguinte.
 */
function dataParaPlanilha(valor: string | Date | null, fuso: string): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return dataHoraNoFuso(d, fuso);
}

export async function rotasPrestacaoDeContas(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  /**
   * Trilha do município inteiro, filtrável.
   *
   * Sob RLS como tudo o mais: a trilha de um município não é alcançável de
   * outro, nem por quem administra.
   */
  app.get("/trilha", async (req) => {
    const quem = await autorizar(app, req, "consultar_trilha");
    const f = filtroTrilhaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];

      /*
        O recorte por período usa `registrado_em`, a hora do SERVIDOR, e não
        `ocorrido_em`, que é declarada pelo aparelho.

        `ocorrido_em` continua sendo exibido, porque é a hora em que o ato
        aconteceu de verdade no barranco, e o laudo depende dela. Mas ela é
        declaração, não fato: quem a escolhe é o relógio de um celular que pode
        estar com o fuso trocado, ajustado à mão, ou nas mãos de quem tem
        motivo para datar uma vistoria dentro de um prazo que já estourou.

        Filtrar por ela permitia uma coisa que a trilha append-only existe para
        impedir: um evento datado em 2019 sumia de qualquer recorte por mês sem
        nunca ter sido apagado. A auditoria continuava íntegra e continuava
        cega. `registrado_em` é `now()` do banco, ninguém escolhe.
      */
      if (f.de) { params.push(f.de); condicoes.push(`t.registrado_em >= $${params.length}`); }
      if (f.ate) { params.push(f.ate); condicoes.push(`t.registrado_em <= $${params.length}`); }
      if (f.autor?.trim()) {
        params.push(`%${f.autor.trim().toLowerCase()}%`);
        condicoes.push(`lower(t.autor_nome) LIKE $${params.length}`);
      }
      if (f.papel) { params.push(f.papel); condicoes.push(`t.autor_papel = $${params.length}`); }
      if (f.tipo) { params.push(f.tipo); condicoes.push(`t.tipo = $${params.length}`); }
      if (f.protocolo?.trim()) {
        params.push(`%${f.protocolo.trim()}%`);
        condicoes.push(`o.protocolo LIKE $${params.length}`);
      }

      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const total = await c.query<{ total: string }>(
        `SELECT count(*)::text AS total
           FROM trilha_eventos t JOIN ocorrencias o ON o.id = t.ocorrencia_id ${onde}`,
        params,
      );

      params.push(f.porPagina, (f.pagina - 1) * f.porPagina);
      const itens = await c.query(
        `SELECT t.id, t.tipo, t.autor_nome, t.autor_papel, t.origem,
                t.ocorrido_em, t.registrado_em, t.detalhe,
                o.id AS ocorrencia_id, o.protocolo, o.endereco
           FROM trilha_eventos t JOIN ocorrencias o ON o.id = t.ocorrencia_id
           ${onde}
          ORDER BY t.registrado_em DESC
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

  /** Os tipos de evento que existem, para a tela montar o filtro. */
  app.get("/trilha/tipos", async (req) => {
    const quem = await autorizar(app, req, "consultar_trilha");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{ tipo: string; total: string }>(
        `SELECT tipo, count(*)::text AS total FROM trilha_eventos
          GROUP BY tipo ORDER BY tipo`,
      );
      return { itens: r.rows.map((l) => ({ tipo: l.tipo, total: Number(l.total) })) };
    });
  });

  type LinhaExportacao = {
    protocolo: string;
    /*
      `TipoDeEntrada` e nao `TipoCobrade`: a exportacao le o banco, e desde a
      migracao 019 o banco guarda tambem a marca de "ainda nao classificado".
      Declarar so os oito da COBRADE fazia o tipo prometer uma coisa que a
      consulta nao garante, e o rotulo cairia no `?? l.tipo` imprimindo a
      chave crua do banco dentro de um relatorio que vai para a camara.
    */
    tipo: TipoDeEntrada;
    status: StatusOcorrencia;
    severidade: Severidade | null;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
    canal_entrada: string;
    vulnerabilidade_presente: boolean;
    equipe_nome: string | null;
    criado_em: string;
    prazo_em: string | null;
    encerrado_em: string | null;
    motivo_encerramento: string | null;
    horas_ate_vistoria: string | null;
    horas_ate_encerramento: string | null;
    providencias: string;
    providencias_sem_resposta: string;
    /*
      As quatro colunas do nivel COMPLETO. Sao opcionais no tipo porque a
      consulta do nivel basico simplesmente nao as pede: elas nao chegam a sair
      do banco, e nao e a montagem do CSV que as esconde depois. Filtrar
      no fim seria a versao fragil da mesma ideia, porque a primeira alteracao
      distraida na montagem devolveria as colunas ao arquivo.
    */
    solicitante_nome?: string;
    solicitante_contato?: string | null;
    vulnerabilidade_descricao?: string | null;
    descricao?: string;
  };

  /**
   * Exportação em CSV, em dois níveis.
   *
   * Colunas escolhidas para responder o que perguntam a uma Defesa Civil, e
   * não para espelhar o banco: quanto tempo levou até a vistoria, quanto até
   * encerrar, quantas providências ficaram sem resposta. Exportar o esquema
   * cru daria um arquivo que ninguém consegue ler numa reunião.
   *
   * O PADRÃO É O BÁSICO, que não leva pessoa nenhuma. O relato também fica de
   * fora dele, e essa é a decisão menos óbvia daqui: relato é texto livre
   * ditado por telefone, e no meio dele vêm nome de vizinho, telefone de
   * parente e condição de saúde de quem mora na casa. Não existe como
   * minimizar um campo assim, então ele acompanha o nível que já é tratado
   * como dado pessoal.
   *
   * A montagem passa por `montarCsv` do pacote compartilhado, que neutraliza
   * célula começando com `=`. O relato vem do que um cidadão dita por
   * telefone, e sem isso a planilha da prefeitura vira vetor de execução na
   * máquina de quem a abre.
   */
  app.get("/relatorios/ocorrencias.csv", ROTA_GET_COM_EFEITO, async (req, resposta) => {
    const quem = await autorizar(app, req, "exportar_dados");
    const f = filtroExportacaoSchema.parse(req.query);
    const n = nivelDaExportacaoSchema.parse(req.query);
    const completo = n.nivel === "completo";

    /*
      O portão do dado pessoal, ANTES de tocar no banco.

      `exportar_dados` continua sendo a permissão de prestação de contas, e ela
      dá o nível básico, que é o que coordenador e administrador usam para
      responder à câmara. Ela NÃO dá o nível completo, e é isso que impede o
      caminho fácil: com uma permissão só, qualquer relatório de rotina
      carregaria a base de nomes junto.
    */
    if (completo) exigirPostoParaDadoPessoal(quem.papel);

    /*
      O fuso do município sai da UF cadastrada da organização do TOKEN, lida na
      mesma transação da exportação. Nada vem da requisição.
    */
    let ufDoMunicipio: string | null = null;
    const linhas = await banco.comTenant(quem.organizacaoId, async (c) => {
      const org = await c.query<{ uf: string | null }>(
        "SELECT uf FROM organizacoes WHERE id = $1",
        [quem.organizacaoId],
      );
      ufDoMunicipio = org.rows[0]?.uf ?? null;
      const condicoes: string[] = [];
      const params: unknown[] = [];
      if (f.de) { params.push(f.de); condicoes.push(`o.criado_em >= $${params.length}`); }
      if (f.ate) { params.push(f.ate); condicoes.push(`o.criado_em <= $${params.length}`); }
      if (f.status && f.status !== "todas") {
        params.push(f.status);
        condicoes.push(`o.status = $${params.length}`);
      }
      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      /*
        As colunas de pessoa entram na CONSULTA só no nível completo. Ver o
        comentário do tipo acima: esconder na montagem seria a versão frágil.

        `solicitante_nome` pode vir como o marcador de "removido por prazo"
        (migração 021), e isso é o comportamento certo: a planilha mostra que o
        município cumpriu a retenção, em vez de uma célula vazia que não
        distingue descarte de dado que nunca existiu.
      */
      const colunasDePessoa = completo
        ? `, o.solicitante_nome, o.solicitante_contato,
             o.vulnerabilidade_descricao, o.descricao`
        : "";

      /*
        O teto pede uma linha a MAIS do que o permitido, de propósito: é assim
        que dá para distinguir "coube" de "estourou" sem uma segunda consulta
        de contagem, que leria a mesma tabela duas vezes para responder a
        mesma pergunta.
      */
      const teto = completo ? `\n          LIMIT ${TETO_DA_EXPORTACAO_COMPLETA + 1}` : "";

      const r = await c.query<LinhaExportacao>(
        `SELECT o.protocolo, o.tipo, o.status, o.severidade, o.endereco,
                o.latitude, o.longitude, o.canal_entrada,
                o.vulnerabilidade_presente, e.nome AS equipe_nome,
                o.criado_em, o.prazo_em, o.encerrado_em, o.motivo_encerramento,
                round(extract(epoch FROM (v.coletada_em - o.criado_em)) / 3600.0, 1)::text
                  AS horas_ate_vistoria,
                round(extract(epoch FROM (o.encerrado_em - o.criado_em)) / 3600.0, 1)::text
                  AS horas_ate_encerramento,
                coalesce(p.total, '0') AS providencias,
                coalesce(p.abertas, '0') AS providencias_sem_resposta
                ${colunasDePessoa}
           FROM ocorrencias o
           LEFT JOIN equipes e ON e.id = o.equipe_id
           LEFT JOIN LATERAL (
             SELECT v2.coletada_em FROM vistorias v2
              WHERE v2.ocorrencia_id = o.id ORDER BY v2.coletada_em LIMIT 1
           ) v ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::text AS total,
                    count(*) FILTER (WHERE respondida_em IS NULL)::text AS abertas
               FROM providencias p2 WHERE p2.ocorrencia_id = o.id
           ) p ON true
           ${onde}
          ORDER BY o.criado_em${teto}`,
        params,
      );

      if (completo && r.rows.length > TETO_DA_EXPORTACAO_COMPLETA) {
        throw new RegraDeNegocio(
          "recorte_grande_demais",
          `Esse recorte passa de ${TETO_DA_EXPORTACAO_COMPLETA} ocorrências. `
          + "Exportação com dados pessoais precisa ser um recorte justificável: "
          + "estreite o período ou a situação, ou use a exportação sem dados pessoais.",
          409,
        );
      }

      /*
        A exportação é registrada na MESMA transação que a leitura.

        Um CSV de ocorrências sai do sistema para viver num pen drive ou num
        email. Registrar quem levou qual recorte, em que nível e por quê é o
        que permite responder "quem tirou a base em março?", pergunta que só
        aparece depois que um dado vaza.

        O nível e a justificativa vão junto porque sem eles o registro não
        distingue o relatório de rotina da retirada da base de nomes, que são
        coisas de gravidade completamente diferente. O CHECK da migração 021
        recusa nível completo sem justificativa, então este par não tem como
        ficar pela metade nem por caminho futuro.
      */
      await c.query(
        `INSERT INTO exportacoes
           (organizacao_id, usuario_id, usuario_nome, tipo, filtros, total_registros,
            ip, nivel, justificativa)
         VALUES ($1,$2,$3,'ocorrencias_csv',$4,$5,$6,$7,$8)`,
        [
          quem.organizacaoId, quem.usuarioId, quem.nome,
          JSON.stringify({ de: f.de ?? null, ate: f.ate ?? null, status: f.status ?? null }),
          r.rows.length,
          enderecoDoCliente(req) || null,
          n.nivel,
          completo ? n.justificativa! : null,
        ],
      );

      /*
        O nível completo entra TAMBÉM na trilha administrativa, e o básico não.

        Não é redundância com o registro acima. `exportacoes` é a lista
        especializada, que alguém abre quando já está investigando; a trilha
        administrativa é onde a corregedoria e a chefia olham para saber o que
        de excepcional aconteceu no mês, ao lado de "promoveram uma conta" e
        "desativaram um órgão". Tirar a base de nomes de cidadãos do sistema
        pertence a essa lista, e exportar o resumo do trimestre não pertence:
        pôr as duas ali faria a mais grave desaparecer no meio da rotina.

        A justificativa viaja junto do ato, e não num lugar que alguém precise
        cruzar depois.
      */
      if (completo) {
        const org = await c.query<{ nome: string }>(
          "SELECT nome FROM organizacoes WHERE id = $1",
          [quem.organizacaoId],
        );
        await registrarAtoAdministrativo(c, quem, {
          acao: "exportacao_com_dado_pessoal",
          alvoTipo: "organizacao",
          alvoId: quem.organizacaoId,
          alvoNome: org.rows[0]?.nome ?? "município",
          depois: {
            justificativa: n.justificativa,
            totalRegistros: r.rows.length,
            filtros: { de: f.de ?? null, ate: f.ate ?? null, status: f.status ?? null },
          },
        });
      }

      return r.rows;
    });

    const fuso = fusoDoEstado(ufDoMunicipio);
    const csv = montarCsv(
      [
        "Protocolo", "Tipo (COBRADE)", "Situação", "Severidade", "Endereço",
        "Latitude", "Longitude", "Canal de entrada",
        "Vulnerabilidade social", "Equipe", "Registrada em", "Prazo",
        "Encerrada em", "Motivo do encerramento",
        "Horas até a vistoria", "Horas até o encerramento",
        "Providências", "Providências sem resposta",
        ...(completo
          ? ["Solicitante", "Contato do solicitante", "Vulnerabilidade (descrição)", "Relato"]
          : []),
      ],
      linhas.map((l) => [
        l.protocolo,
        ROTULO_TIPO_COBRADE[l.tipo] ?? l.tipo,
        ROTULO_STATUS[l.status] ?? l.status,
        l.severidade ? ROTULO_SEVERIDADE[l.severidade] : "não classificada",
        l.endereco,
        l.latitude, l.longitude,
        ROTULO_CANAL[l.canal_entrada as CanalEntrada] ?? l.canal_entrada,
        l.vulnerabilidade_presente ? "sim" : "não",
        l.equipe_nome ?? "",
        dataParaPlanilha(l.criado_em, fuso),
        dataParaPlanilha(l.prazo_em, fuso),
        dataParaPlanilha(l.encerrado_em, fuso),
        l.motivo_encerramento ?? "",
        l.horas_ate_vistoria ?? "", l.horas_ate_encerramento ?? "",
        l.providencias, l.providencias_sem_resposta,
        ...(completo
          ? [
              l.solicitante_nome ?? "",
              l.solicitante_contato ?? "",
              l.vulnerabilidade_descricao ?? "",
              l.descricao ?? "",
            ]
          : []),
      ]),
    );

    const hoje = dataNoFuso(new Date(), fuso);
    /*
      O NOME DO ARQUIVO DIZ O QUE ELE CARREGA.

      Os dois níveis produzem planilhas parecidas na tela, e a de dados
      pessoais vai parar na mesma pasta de downloads da outra. "ocorrencias-
      2026-09-09.csv" duas vezes é o caminho mais curto para alguém anexar a
      errada num email para fora da prefeitura, e o arquivo já não tem volta.
    */
    const nome = completo
      ? `ocorrencias-com-dados-pessoais-${hoje}.csv`
      : `ocorrencias-${hoje}.csv`;
    return resposta
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${nome}"`)
      .send(csv);
  });

  /**
   * Números do período, para a conversa com a chefia.
   *
   * Tempo MEDIANO e não médio: uma ocorrência que ficou seis meses aberta por
   * causa de uma obra puxa a média e faz o serviço parecer pior do que é. A
   * mediana descreve o atendimento típico, que é o que a pergunta quer saber.
   */
  app.get("/relatorios/resumo", async (req) => {
    const quem = await autorizar(app, req, "exportar_dados");
    const f = filtroExportacaoSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];
      if (f.de) { params.push(f.de); condicoes.push(`o.criado_em >= $${params.length}`); }
      if (f.ate) { params.push(f.ate); condicoes.push(`o.criado_em <= $${params.length}`); }
      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const geral = await c.query<{
        total: string; encerradas: string; criticas: string; com_vulnerabilidade: string;
        mediana_ate_encerrar: string | null;
      }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE o.status = 'encerrada')::text AS encerradas,
                count(*) FILTER (WHERE o.severidade = 'critica')::text AS criticas,
                count(*) FILTER (WHERE o.vulnerabilidade_presente)::text AS com_vulnerabilidade,
                round(percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY extract(epoch FROM (o.encerrado_em - o.criado_em)) / 3600.0
                )::numeric, 1)::text AS mediana_ate_encerrar
           FROM ocorrencias o ${onde}`,
        params,
      );

      const porTipo = await c.query<{ tipo: TipoDeEntrada; total: string }>(
        `SELECT o.tipo, count(*)::text AS total FROM ocorrencias o ${onde}
          GROUP BY o.tipo ORDER BY count(*) DESC`,
        params,
      );

      const porBairro = await c.query<{ trecho: string; total: string }>(
        `SELECT trim(split_part(o.endereco, ',', 3)) AS trecho, count(*)::text AS total
           FROM ocorrencias o ${onde}
          GROUP BY trecho HAVING trim(split_part(o.endereco, ',', 3)) <> ''
          ORDER BY count(*) DESC LIMIT 10`,
        params,
      );

      const linha = geral.rows[0]!;
      return {
        total: Number(linha.total),
        encerradas: Number(linha.encerradas),
        criticas: Number(linha.criticas),
        comVulnerabilidade: Number(linha.com_vulnerabilidade),
        medianaHorasAteEncerrar: linha.mediana_ate_encerrar
          ? Number(linha.mediana_ate_encerrar)
          : null,
        porTipo: porTipo.rows.map((l) => ({
          tipo: l.tipo,
          rotulo: ROTULO_TIPO_COBRADE[l.tipo] ?? l.tipo,
          total: Number(l.total),
        })),
        porBairro: porBairro.rows.map((l) => ({ bairro: l.trecho, total: Number(l.total) })),
      };
    });
  });

  /** Quem exportou o quê, e quando. É o que a LGPD chama de registro de operações. */
  app.get("/relatorios/exportacoes", async (req) => {
    const quem = await autorizar(app, req, "consultar_trilha");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        id: string; usuario_nome: string; tipo: string;
        filtros: Record<string, unknown>; total_registros: number; criada_em: string;
      }>(
        `SELECT id, usuario_nome, tipo, filtros, total_registros, criada_em
           FROM exportacoes ORDER BY criada_em DESC LIMIT 200`,
      );
      return { itens: r.rows };
    });
  });

  /**
   * Quem consultou dado de cidadão, e sobre qual ocorrência.
   *
   * Esta rota existe porque um registro que ninguém consegue ler é um registro
   * que não responde nada. A pergunta que ela atende é a da autoridade
   * nacional e a do próprio titular: "quem viu os dados dessa família?". Com o
   * filtro por servidor ela também responde a da corregedoria: "o que essa
   * pessoa andou consultando?".
   *
   * Sob `consultar_trilha`, que é a mesma permissão da auditoria: quem lê o
   * registro de acesso está fazendo auditoria, e o registro de acesso, lido em
   * série, descreve o comportamento de servidores identificados. Não é
   * material de tela de rotina.
   */
  app.get("/relatorios/consultas", async (req) => {
    const quem = await autorizar(app, req, "consultar_trilha");
    const f = filtroConsultasSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];
      if (f.ocorrencia) {
        params.push(f.ocorrencia);
        condicoes.push(`k.ocorrencia_id = $${params.length}`);
      }
      if (f.usuario) {
        params.push(f.usuario);
        condicoes.push(`k.usuario_id = $${params.length}`);
      }
      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const total = await c.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM ocorrencia_consultas k ${onde}`,
        params,
      );

      params.push(f.porPagina, (f.pagina - 1) * f.porPagina);
      const itens = await c.query(
        `SELECT k.id, k.usuario_nome, k.usuario_papel, k.recurso, k.finalidade,
                k.consultada_em, k.ocorrencia_id, o.protocolo
           FROM ocorrencia_consultas k
           JOIN ocorrencias o ON o.id = k.ocorrencia_id
           ${onde}
          ORDER BY k.consultada_em DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      /*
        O endereço de rede de quem consultou NÃO sai daqui, e a ausência é
        deliberada. Ele fica gravado, porque é o que distingue "abriu da
        prefeitura" de "abriu de casa às três da manhã" numa investigação, e
        ele é entregue por quem administra o banco a quem estiver investigando.
        Numa tela de auditoria de uso diário ele seria vigilância de servidor
        público, que não é a finalidade desta tabela.
      */
      return {
        itens: itens.rows,
        total: Number(total.rows[0]!.total),
        pagina: f.pagina,
        porPagina: f.porPagina,
      };
    });
  });

  void ROTULO_PAPEL;
}
