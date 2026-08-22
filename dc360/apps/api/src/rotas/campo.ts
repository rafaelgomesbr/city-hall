import type { FastifyInstance } from "fastify";
import type { Banco } from "../banco/tipos.js";
import { autorizar } from "../servidor.js";

/**
 * O que o agente de campo precisa ver, que não é o painel do coordenador.
 *
 * Até aqui o agente entrava no sistema e caía na mesma tela do coordenador:
 * a fila do município inteiro, o mapa da cidade, a tabela densa de todas as
 * ocorrências. Nada disso é o trabalho dele, e nada do trabalho dele estava em
 * lugar nenhum. Ele não via quais chamados eram da sua equipe, nem o que já
 * tinha terminado, nem quem eram os colegas de equipe.
 *
 * Esta rota devolve as três coisas de uma vez, porque as três aparecem juntas
 * numa tela só e pedir três requisições para montar uma tela é desperdício em
 * aparelho com sinal ruim.
 *
 * Continua valendo o de sempre: o município vem do token, e a equipe vem do
 * cadastro do próprio usuário. Nada aqui aceita parâmetro de quem chama.
 */
export async function rotasCampo(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.get("/meu-trabalho", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const eu = await c.query<{ equipe_id: string | null; equipe_nome: string | null;
        equipe_especialidade: string | null; equipe_ativa: boolean | null }>(
        `SELECT u.equipe_id, e.nome AS equipe_nome,
                e.especialidade AS equipe_especialidade, e.ativa AS equipe_ativa
           FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id
          WHERE u.id = $1`,
        [quem.usuarioId],
      );
      const meu = eu.rows[0];

      /*
        Agente sem equipe é situação real, não erro: acabou de ser cadastrado e
        ninguém o alocou ainda. A tela precisa saber disso para dizer o que
        fazer, em vez de mostrar uma lista vazia que parece um dia tranquilo.
      */
      if (!meu?.equipe_id) {
        return {
          equipe: null,
          colegas: [],
          designadas: [],
          concluidas: [],
        };
      }

      const colegas = await c.query(
        `SELECT id, nome, papel, ativo
           FROM usuarios
          WHERE equipe_id = $1 AND ativo = true
          ORDER BY nome`,
        [meu.equipe_id],
      );

      // Designadas: o que a equipe tem em campo agora, mais urgente primeiro.
      const designadas = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
                o.latitude, o.longitude, o.descricao,
                o.solicitante_nome, o.solicitante_contato,
                o.vulnerabilidade_presente, o.vulnerabilidade_descricao,
                o.prazo_em, o.criado_em
           FROM ocorrencias o
          WHERE o.equipe_id = $1 AND o.status = 'em_campo'
          ORDER BY o.prazo_em NULLS LAST, o.criado_em`,
        [meu.equipe_id],
      );

      /*
        Concluídas: as vistorias que ESTE agente assinou, não as da equipe.
        É o registro do trabalho dele, e é o que responde "o que eu já
        terminei". A dupla marca de tempo vem junto porque é ela que mostra o
        que foi coletado sem sinal e sincronizado depois.
      */
      const concluidas = await c.query(
        `SELECT v.id, v.coletada_em, v.sincronizada_em, v.gps_precisao_metros,
                v.assinante_nome,
                o.id AS ocorrencia_id, o.protocolo, o.tipo, o.severidade,
                o.status, o.endereco
           FROM vistorias v JOIN ocorrencias o ON o.id = v.ocorrencia_id
          WHERE v.agente_id = $1
          ORDER BY v.coletada_em DESC
          LIMIT 50`,
        [quem.usuarioId],
      );

      return {
        equipe: {
          id: meu.equipe_id,
          nome: meu.equipe_nome,
          especialidade: meu.equipe_especialidade,
          ativa: meu.equipe_ativa,
        },
        colegas: colegas.rows,
        designadas: designadas.rows,
        concluidas: concluidas.rows,
      };
    });
  });
}
