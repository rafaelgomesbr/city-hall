import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PAPEIS, ROTULO_CANAL, ROTULO_PAPEL, ROTULO_SEVERIDADE, ROTULO_STATUS,
  ROTULO_TIPO_COBRADE, montarCsv,
  type CanalEntrada, type Severidade, type StatusOcorrencia, type TipoCobrade,
} from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { autorizar } from "../servidor.js";
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

const filtroTrilhaSchema = z.object({
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  autor: z.string().max(200).optional(),
  papel: z.enum(PAPEIS).optional(),
  tipo: z.string().max(60).optional(),
  protocolo: z.string().max(20).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

const filtroExportacaoSchema = z.object({
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  status: z.string().max(30).optional(),
});

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
 */
function dataParaPlanilha(valor: string | Date | null): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`
    + ` ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
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
    tipo: TipoCobrade;
    status: StatusOcorrencia;
    severidade: Severidade | null;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
    canal_entrada: string;
    solicitante_nome: string;
    descricao: string;
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
  };

  /**
   * Exportação em CSV.
   *
   * Colunas escolhidas para responder o que perguntam a uma Defesa Civil, e
   * não para espelhar o banco: quanto tempo levou até a vistoria, quanto até
   * encerrar, quantas providências ficaram sem resposta. Exportar o esquema
   * cru daria um arquivo que ninguém consegue ler numa reunião.
   *
   * A montagem passa por `montarCsv` do pacote compartilhado, que neutraliza
   * célula começando com `=`. O relato vem do que um cidadão dita por
   * telefone, e sem isso a planilha da prefeitura vira vetor de execução na
   * máquina de quem a abre.
   */
  app.get("/relatorios/ocorrencias.csv", async (req, resposta) => {
    const quem = await autorizar(app, req, "exportar_dados");
    const f = filtroExportacaoSchema.parse(req.query);

    const linhas = await banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];
      if (f.de) { params.push(f.de); condicoes.push(`o.criado_em >= $${params.length}`); }
      if (f.ate) { params.push(f.ate); condicoes.push(`o.criado_em <= $${params.length}`); }
      if (f.status && f.status !== "todas") {
        params.push(f.status);
        condicoes.push(`o.status = $${params.length}`);
      }
      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const r = await c.query<LinhaExportacao>(
        `SELECT o.protocolo, o.tipo, o.status, o.severidade, o.endereco,
                o.latitude, o.longitude, o.canal_entrada, o.solicitante_nome,
                o.descricao, o.vulnerabilidade_presente, e.nome AS equipe_nome,
                o.criado_em, o.prazo_em, o.encerrado_em, o.motivo_encerramento,
                round(extract(epoch FROM (v.coletada_em - o.criado_em)) / 3600.0, 1)::text
                  AS horas_ate_vistoria,
                round(extract(epoch FROM (o.encerrado_em - o.criado_em)) / 3600.0, 1)::text
                  AS horas_ate_encerramento,
                coalesce(p.total, '0') AS providencias,
                coalesce(p.abertas, '0') AS providencias_sem_resposta
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
          ORDER BY o.criado_em`,
        params,
      );
      /*
        A exportação é registrada na MESMA transação que a leitura.

        Um CSV de ocorrências carrega nome, contato e relato de cidadãos, e sai
        do sistema para viver num pen drive ou num email. Registrar quem levou
        qual recorte é o que permite responder "quem tirou a base em março?",
        pergunta que só aparece depois que um dado vaza.
      */
      await c.query(
        `INSERT INTO exportacoes
           (organizacao_id, usuario_id, usuario_nome, tipo, filtros, total_registros, ip)
         VALUES ($1,$2,$3,'ocorrencias_csv',$4,$5,$6)`,
        [
          quem.organizacaoId, quem.usuarioId, quem.nome,
          JSON.stringify({ de: f.de ?? null, ate: f.ate ?? null, status: f.status ?? null }),
          r.rows.length,
          enderecoDoCliente(req) || null,
        ],
      );

      return r.rows;
    });

    const csv = montarCsv(
      [
        "Protocolo", "Tipo (COBRADE)", "Situação", "Severidade", "Endereço",
        "Latitude", "Longitude", "Canal de entrada", "Solicitante",
        "Vulnerabilidade social", "Relato", "Equipe", "Registrada em", "Prazo",
        "Encerrada em", "Motivo do encerramento",
        "Horas até a vistoria", "Horas até o encerramento",
        "Providências", "Providências sem resposta",
      ],
      linhas.map((l) => [
        l.protocolo,
        ROTULO_TIPO_COBRADE[l.tipo] ?? l.tipo,
        ROTULO_STATUS[l.status] ?? l.status,
        l.severidade ? ROTULO_SEVERIDADE[l.severidade] : "não classificada",
        l.endereco,
        l.latitude, l.longitude,
        ROTULO_CANAL[l.canal_entrada as CanalEntrada] ?? l.canal_entrada,
        l.solicitante_nome,
        l.vulnerabilidade_presente ? "sim" : "não",
        l.descricao,
        l.equipe_nome ?? "",
        dataParaPlanilha(l.criado_em),
        dataParaPlanilha(l.prazo_em),
        dataParaPlanilha(l.encerrado_em),
        l.motivo_encerramento ?? "",
        l.horas_ate_vistoria ?? "", l.horas_ate_encerramento ?? "",
        l.providencias, l.providencias_sem_resposta,
      ]),
    );

    const hoje = new Date().toISOString().slice(0, 10);
    return resposta
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="ocorrencias-${hoje}.csv"`)
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

      const porTipo = await c.query<{ tipo: TipoCobrade; total: string }>(
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

  void ROTULO_PAPEL;
}
