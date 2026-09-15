import type { FastifyInstance } from "fastify";
import type { Banco } from "../banco/tipos.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import { autorizar } from "../servidor.js";

/**
 * Quantas vistorias concluidas a tela de "meu trabalho" traz de uma vez.
 *
 * Cinquenta e o que cabe numa tela de resumo. O total de verdade vai junto na
 * resposta, para a tela dizer quantas existem em vez de imprimir este numero
 * como se fosse a contagem.
 */
const TETO_DE_CONCLUIDAS = 50;

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
/**
 * A janela de "no mês" dos números do agente: trinta dias, e não o mês do
 * calendário. No dia 2 o mês do calendário teria dois dias e o número diria
 * quase nada; trinta dias para trás responde a mesma pergunta em qualquer
 * dia. O aplicativo usa a MESMA janela para o que ele conta sozinho.
 */
const JANELA_DO_MES = "30 days";

export async function rotasCampo(
  app: FastifyInstance,
  { banco, armazenamento }: { banco: Banco; armazenamento: Armazenamento },
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

      /*
        O colega vem com DUAS coisas a mais desde a foto de perfil (migração
        040), e as duas são para a tela da equipe ter cara de equipe:

        - `foto_chave`, que vira URL assinada ABAIXO, fora da transação. A
          chave crua nunca sai: quem a tem monta caminho de armazenamento.
        - `em_campo`: tem saída a campo ABERTA agora (`saidas_a_campo` com
          `encerrada_em` nulo). É o que a coordenação já vê em
          `GET /saida-a-campo`, que o agente não pode chamar
          (`acompanhar_saida_a_campo` é permissão de quem fica na mesa). Aqui
          ele recebe só o booleano dos colegas da própria equipe, sem prazo,
          sem protocolo e sem "sozinho": o que a equipe precisa saber é quem
          está no morro, e não o que a coordenação precisa decidir.
      */
      const colegas = await c.query<{
        id: string; nome: string; papel: string; ativo: boolean;
        foto_chave: string | null; em_campo: boolean;
      }>(
        `SELECT u.id, u.nome, u.papel, u.ativo, u.foto_chave,
                EXISTS (
                  SELECT 1 FROM saidas_a_campo s
                   WHERE s.agente_id = u.id AND s.encerrada_em IS NULL
                ) AS em_campo
           FROM usuarios u
          WHERE u.equipe_id = $1 AND u.ativo = true
          ORDER BY u.nome`,
        [meu.equipe_id],
      );

      // Designadas: o que a equipe tem em campo agora, mais urgente primeiro.
      const designadas = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
                o.ponto_referencia,
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
      /*
        O TETO SAI JUNTO COM O TOTAL DE VERDADE, e essa e a correcao.

        A lista corta em cinquenta, o que e certo: ninguem le mais que isso numa
        tela de resumo. O que estava errado era a tela imprimir o TAMANHO DA
        LISTA como se fosse a contagem. Um agente que assinou sessenta e duas
        vistorias numa temporada de chuva lia "Vistorias que eu conclui (50)", e
        as doze mais antigas nao apareciam em lugar nenhum: sem rodape, sem
        aviso, sem "ver mais". Se ele precisasse mostrar que vistoriou aquele
        imovel em janeiro, a tela AFIRMAVA que ele nunca vistoriou.

        E o registro do trabalho dele, e e o que ele leva quando o ato for
        questionado. Contar errado ali nao e detalhe de interface.
      */
      const totalConcluidas = await c.query<{ total: string }>(
        "SELECT count(*)::int AS total FROM vistorias WHERE agente_id = $1",
        [quem.usuarioId],
      );

      /*
        `despachada_em` é o ÚLTIMO despacho da ocorrência anterior à coleta,
        lido da trilha, que é onde o despacho mora (a ocorrência não guarda a
        hora dele). É o que deixa a tela do agente dizer "tempo médio entre o
        despacho e a vistoria" com o dado que já desce, em vez de uma rota nova.
        Nula quando a trilha não tem despacho antes da coleta (dado semeado
        antes da trilha existir), e a tela pula a vistoria na média.
      */
      const concluidas = await c.query(
        `SELECT v.id, v.coletada_em, v.sincronizada_em, v.gps_precisao_metros,
                v.assinante_nome,
                o.id AS ocorrencia_id, o.protocolo, o.tipo, o.severidade,
                o.status, o.endereco,
                (SELECT max(t.ocorrido_em) FROM trilha_eventos t
                  WHERE t.ocorrencia_id = o.id AND t.tipo = 'despacho'
                    AND t.ocorrido_em <= v.coletada_em) AS despachada_em
           FROM vistorias v JOIN ocorrencias o ON o.id = v.ocorrencia_id
          WHERE v.agente_id = $1
          ORDER BY v.coletada_em DESC
          LIMIT $2`,
        [quem.usuarioId, TETO_DE_CONCLUIDAS],
      );

      /*
        Quantas tarefas ESTE agente devolveu nos últimos trinta dias. Contado
        aqui, e não no aparelho, porque o aparelho só guarda a devolução
        enquanto ela espera envio: confirmada, ela sai da fila, e um número
        contado ali seria quase sempre zero.
      */
      const devolvidas = await c.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM devolucoes_de_tarefa
          WHERE devolvida_por = $1 AND registrada_em >= now() - $2::interval`,
        [quem.usuarioId, JANELA_DO_MES],
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
        /* O total de verdade, para a tela nunca mais imprimir o teto no lugar
           dele. `truncada` existe para a tela poder DIZER que cortou. */
        totalConcluidas: Number(totalConcluidas.rows[0]?.total ?? 0),
        tetoDeConcluidas: TETO_DE_CONCLUIDAS,
        devolvidasNoMes: Number(devolvidas.rows[0]?.total ?? 0),
      };
    }).then(async (resposta) => {
      /*
        As URLs assinadas nascem FORA da transação, como em
        `GET /evidencias/ocorrencia/:id`: assinar é conta local e barata, mas
        não é motivo para segurar a conexão do município.
      */
      const colegas = await Promise.all(resposta.colegas.map(async (c) => {
        const { foto_chave, em_campo, ...resto } = c as {
          id: string; nome: string; papel: string; ativo: boolean;
          foto_chave?: string | null; em_campo?: boolean;
        };
        return {
          ...resto,
          fotoUrl: foto_chave ? await armazenamento.urlParaLer(foto_chave) : null,
          emCampo: Boolean(em_campo),
        };
      }));
      return { ...resposta, colegas };
    });
  });
}
