import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ROTULO_PAPEL,
  ROTULO_STATUS,
  ROTULO_TIPO_COBRADE,
  podeExecutar,
  type Papel,
  type StatusOcorrencia,
  type TipoDeEntrada,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import type { Identidade } from "../servidor.js";
import { registrarConsulta } from "../privacidade/consulta.js";
import { enderecoDoCliente } from "../rede.js";

/**
 * `GET /busca?q=`: a caixa de busca do painel, pelo lado dos REGISTROS.
 *
 * O PEDIDO, NA LETRA DE QUEM PAGA: "esse input tem que conseguir indexar
 * praticamente qualquer registro e qualquer funcionalidade dela com
 * tolerância a erro". As funcionalidades (telas, atalhos) são do painel e
 * moram no navegador. Os registros passam por aqui: ocorrências, usuários,
 * equipes e órgãos, num pedido só, porque a caixa é uma só e dispara a cada
 * tecla.
 *
 * ## Onde mora a tolerância a erro
 *
 * No banco, na migração 041, e não aqui: `normalizar_busca` (caixa, acento,
 * pontuação), `casa_busca` (o predicado) e `pontuar_busca` (a ordem), sobre
 * a coluna gerada `busca` de cada tabela. Esta rota escreve o mesmo SQL para
 * os quatro tipos e não sabe se o Postgres por baixo tem `pg_trgm` ou está
 * no caminho de SQL puro; a migração explica os dois.
 *
 * ## Visibilidade por papel: a MESMA regra da rota de lista de cada tipo
 *
 * Nenhuma permissão nova. Cada grupo obedece ao que a lista daquele tipo já
 * obedece, e é conferido AQUI, no servidor, antes de tocar no banco:
 *
 *   ocorrencia  `GET /ocorrencias` é para qualquer conta; mas o agente de
 *               campo, que no produto inteiro só vê a própria fila, aqui
 *               também só acha o que `GET /campo/meu-trabalho` devolve: as
 *               da equipe dele que estão em campo. Agente sem equipe não
 *               recebe o grupo, como `/meu-trabalho` devolve vazio.
 *   usuario     `GET /usuarios` exige `gerenciar_usuarios`; sem ela, o grupo
 *               não existe na resposta. Esconder o grupo na tela não seria
 *               controle.
 *   equipe      `GET /equipes` é para qualquer conta.
 *   orgao       `GET /orgaos` é para qualquer conta, e por padrão só os
 *               ativos; a busca segue o padrão.
 *
 * ## Registro de consulta, e por que SÓ quando casou pelo nome
 *
 * A resposta traz protocolo, endereço, tipo e status: o que a lista e o mapa
 * já entregam a cada carregamento de tela, sem registrar (o critério está em
 * `privacidade/consulta.ts`: registra-se a leitura que CONCENTRA dado de
 * pessoa numa ocorrência identificada, e listagem não é sobre ninguém).
 *
 * O que a busca faz A MAIS é casar pelo NOME DO SOLICITANTE. Quem digita
 * "marilda" e recebe "Rua das Acácias, 245" acabou de ler onde a Marilda
 * mora, e isso é dado de pessoa concentrado numa ocorrência identificada.
 * Por isso a linha em `ocorrencia_consultas` (recurso `busca`) é gravada para
 * cada ocorrência devolvida CUJO NOME casou, e para nenhuma outra. Registrar
 * todas as devolvidas a cada tecla produziria as "milhões de linhas por
 * município" que aquele arquivo explica por que não registrar.
 *
 * O TERMO NÃO É GRAVADO, em lugar nenhum: a tabela não tem coluna para ele
 * (migração 021, "registra o acesso, nunca o dado"), e a barra de endereço
 * já sai do log com a query string redigida (ver `servidor.ts`). Um termo de
 * busca é, no caso comum, o nome de uma pessoa.
 *
 * ## Teto próprio
 *
 * Sessenta por minuto por pessoa, com 429, separado do teto global de 300:
 * a caixa dispara a cada tecla, e um painel com a busca travada num laço
 * (ou um script) não pode consumir o balde que a sincronização de campo
 * usa. A chave é a mesma do limitador global (o `sub` do token verificado;
 * ver `rede.ts`).
 */

/** Itens por grupo. É o `teto` da resposta, para o painel saber que cortou. */
export const TETO_POR_GRUPO = 8;

/** Buscas por minuto por pessoa. */
export const BUSCAS_POR_MINUTO = 60;

export const consultaSchema = z.object({
  q: z.string().trim().min(2, "Digite pelo menos 2 caracteres.").max(100, "No máximo 100 caracteres."),
});

type ItemDeOcorrencia = {
  id: string;
  protocolo: string;
  titulo: string;
  detalhe: string;
  severidade: string | null;
  status: string;
  pontuacao: number;
};

type ItemComum = {
  id: string;
  titulo: string;
  detalhe: string;
  pontuacao: number;
};

type Grupo =
  | { tipo: "ocorrencia"; itens: ItemDeOcorrencia[] }
  | { tipo: "usuario" | "equipe" | "orgao"; itens: ItemComum[] };

type LinhaDeOcorrencia = {
  id: string;
  protocolo: string;
  endereco: string;
  tipo: string;
  status: string;
  severidade: string | null;
  pontuacao: number;
  /** O nome do solicitante casou com o termo: é o que decide o registro de consulta. */
  por_solicitante: boolean;
};

/**
 * "Deslizamento, em campo": tipo e status pelos rótulos do pacote
 * compartilhado, nunca o valor cru. O status vai em caixa baixa porque vem
 * depois da vírgula.
 */
function detalheDaOcorrencia(tipo: string, status: string): string {
  const rotuloTipo = ROTULO_TIPO_COBRADE[tipo as TipoDeEntrada] ?? tipo;
  const rotuloStatus = ROTULO_STATUS[status as StatusOcorrencia] ?? status;
  return `${rotuloTipo}, ${rotuloStatus.charAt(0).toLowerCase()}${rotuloStatus.slice(1)}`;
}

/**
 * As ocorrências, com o recorte do agente de campo quando for o caso.
 *
 * O `por_solicitante` é calculado só sobre as linhas que sobraram depois do
 * LIMIT (a subconsulta corta antes), então custa no máximo `TETO_POR_GRUPO`
 * normalizações por busca, e não uma por linha do município.
 */
async function buscarOcorrencias(
  c: Consulta,
  quem: Identidade,
  termo: string,
): Promise<LinhaDeOcorrencia[] | null> {
  const recorte: string[] = [];
  const params: unknown[] = [termo, TETO_POR_GRUPO];

  if (quem.papel === "agente_campo") {
    // A equipe vem do CADASTRO do próprio usuário, nunca de parâmetro.
    const eu = await c.query<{ equipe_id: string | null }>(
      "SELECT equipe_id FROM usuarios WHERE id = $1",
      [quem.usuarioId],
    );
    const equipeId = eu.rows[0]?.equipe_id;
    if (!equipeId) return null;
    params.push(equipeId);
    recorte.push(`AND o.status = 'em_campo' AND o.equipe_id = $${params.length}`);
  }

  const r = await c.query<LinhaDeOcorrencia>(
    `SELECT x.id, x.protocolo, x.endereco, x.tipo, x.status, x.severidade, x.pontuacao,
            casa_busca(normalizar_busca(x.solicitante_nome), $1) AS por_solicitante
       FROM (
         SELECT o.id, o.protocolo, o.endereco, o.tipo, o.status, o.severidade,
                o.solicitante_nome, o.criado_em, pontuar_busca(o.busca, $1) AS pontuacao
           FROM ocorrencias o
          WHERE casa_busca(o.busca, $1) ${recorte.join(" ")}
          ORDER BY pontuacao DESC, o.criado_em DESC, o.id
          LIMIT $2
       ) x
      -- A mesma ordem de dentro, repetida: a ordem de uma subconsulta não é
      -- promessa do SQL, e o desempate precisa ser o mesmo nas duas.
      ORDER BY x.pontuacao DESC, x.criado_em DESC, x.id`,
    params,
  );
  return r.rows;
}

export async function rotasBusca(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  const teto = {
    config: {
      rateLimit: { max: BUSCAS_POR_MINUTO, timeWindow: "1 minute" },
    },
  };

  app.get("/", teto, async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { q } = consultaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        O termo atravessa a MESMA função que gerou a chave de cada linha, e
        atravessa uma vez só. O que sai daqui é o que vai nos parâmetros de
        todas as consultas abaixo e no `consulta` da resposta.
      */
      const n = await c.query<{ termo: string }>("SELECT normalizar_busca($1) AS termo", [q]);
      const termo = n.rows[0]!.termo;
      // "%%" passa no tamanho mínimo e vira nada: resposta vazia, não erro.
      if (termo.length < 2) return { consulta: termo, teto: TETO_POR_GRUPO, grupos: [] };

      const grupos: Grupo[] = [];

      const ocorrencias = await buscarOcorrencias(c, quem, termo);
      if (ocorrencias && ocorrencias.length > 0) {
        grupos.push({
          tipo: "ocorrencia",
          itens: ocorrencias.map((o) => ({
            id: o.id,
            protocolo: o.protocolo,
            titulo: o.endereco,
            detalhe: detalheDaOcorrencia(o.tipo, o.status),
            severidade: o.severidade,
            status: o.status,
            pontuacao: o.pontuacao,
          })),
        });
        /*
          Na mesma transação da leitura, como `GET /ocorrencias/:id`: ou a
          resposta sai e a linha fica, ou nenhum dos dois. Só para quem
          casou pelo nome; o porquê está no cabeçalho.
        */
        const ip = enderecoDoCliente(req);
        for (const o of ocorrencias.filter((x) => x.por_solicitante)) {
          await registrarConsulta(c, quem, {
            ocorrenciaId: o.id,
            recurso: "busca",
            finalidade: "atendimento",
            ip,
          });
        }
      }

      if (podeExecutar(quem.papel, "gerenciar_usuarios")) {
        const r = await c.query<{
          id: string; nome: string; matricula: string; papel: Papel; ativo: boolean; pontuacao: number;
        }>(
          `SELECT u.id, u.nome, u.matricula, u.papel, u.ativo, pontuar_busca(u.busca, $1) AS pontuacao
             FROM usuarios u
            WHERE casa_busca(u.busca, $1)
            ORDER BY pontuacao DESC, u.nome, u.id
            LIMIT $2`,
          [termo, TETO_POR_GRUPO],
        );
        if (r.rows.length > 0) {
          grupos.push({
            tipo: "usuario",
            itens: r.rows.map((u) => ({
              id: u.id,
              titulo: u.nome,
              detalhe: `${ROTULO_PAPEL[u.papel] ?? u.papel}, matrícula ${u.matricula}`
                + (u.ativo ? "" : ", conta desativada"),
              pontuacao: u.pontuacao,
            })),
          });
        }
      }

      const equipes = await c.query<{
        id: string; nome: string; ativa: boolean; pessoas: number; pontuacao: number;
      }>(
        `SELECT e.id, e.nome, e.ativa,
                (SELECT count(*) FROM usuarios u WHERE u.equipe_id = e.id AND u.ativo)::int AS pessoas,
                pontuar_busca(e.busca, $1) AS pontuacao
           FROM equipes e
          WHERE casa_busca(e.busca, $1)
          ORDER BY pontuacao DESC, e.nome, e.id
          LIMIT $2`,
        [termo, TETO_POR_GRUPO],
      );
      if (equipes.rows.length > 0) {
        grupos.push({
          tipo: "equipe",
          itens: equipes.rows.map((e) => ({
            id: e.id,
            titulo: e.nome,
            detalhe: `${e.pessoas} ${e.pessoas === 1 ? "pessoa" : "pessoas"}`
              + (e.ativa ? "" : ", desativada"),
            pontuacao: e.pontuacao,
          })),
        });
      }

      const orgaos = await c.query<{ id: string; nome: string; sigla: string | null; pontuacao: number }>(
        `SELECT o.id, o.nome, o.sigla, pontuar_busca(o.busca, $1) AS pontuacao
           FROM orgaos o
          WHERE o.ativo AND casa_busca(o.busca, $1)
          ORDER BY pontuacao DESC, o.nome, o.id
          LIMIT $2`,
        [termo, TETO_POR_GRUPO],
      );
      if (orgaos.rows.length > 0) {
        grupos.push({
          tipo: "orgao",
          itens: orgaos.rows.map((o) => ({
            id: o.id,
            titulo: o.nome,
            detalhe: o.sigla ?? "Órgão de destino",
            pontuacao: o.pontuacao,
          })),
        });
      }

      return { consulta: termo, teto: TETO_POR_GRUPO, grupos };
    });
  });
}
