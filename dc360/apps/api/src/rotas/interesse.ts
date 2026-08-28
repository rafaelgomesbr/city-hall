import type { FastifyInstance } from "fastify";
import { interesseMunicipioSchema } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";

/**
 * O formulário público de interesse.
 *
 * É a ÚNICA rota de escrita do produto sem autenticação, e por isso ela é a
 * que mais precisa explicar o que faz e o que deliberadamente não faz.
 *
 * O QUE ELA FAZ: grava um pedido de contato. Nome, cargo, email, telefone,
 * município e porte de quem procurou.
 *
 * O QUE ELA NÃO FAZ: criar município, criar conta, dar acesso a coisa nenhuma.
 * Provisionar continua sendo ato deliberado por linha de comando, com
 * credencial de dono do banco. Um formulário público que criasse ambiente
 * seria um formulário público que cria banco de dados para quem quiser.
 *
 * As três defesas, porque sem token não existe isolamento por município:
 *
 * 1. O papel de aplicação tem INSERT e não tem SELECT (migração 011). Quem
 *    escreve por aqui não lê o que os outros escreveram.
 * 2. Limite de taxa por IP, o mesmo do resto da API.
 * 3. Uma janela de seis horas por email, conferida aqui. Não é segurança, é
 *    higiene: impede o clique duplo virar duas linhas e um robô simples encher
 *    a tabela.
 *
 * A resposta é SEMPRE a mesma, tenha o pedido sido gravado agora ou recusado
 * pela janela. Dizer "você já pediu" transformaria a rota num verificador de
 * quais emails já procuraram o produto.
 */
export async function rotasInteresse(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.post("/interesse", async (req, resposta) => {
    const dados = interesseMunicipioSchema.parse(req.body);

    await banco.semTenant(async (c) => {
      /*
        A janela vem de uma função, e não de uma consulta direta.

        O papel de aplicação insere e NÃO lê esta tabela, que é a defesa
        principal da rota. `interesse_recente` responde só um booleano, com
        `SECURITY DEFINER` e `search_path` fixo. Ver a migração 011.

        O índice único também não serviria: `date_trunc` sobre `timestamptz`
        depende do fuso da sessão e o Postgres recusa indexar isso.
      */
      const recente = await c.query<{ recente: boolean }>(
        "SELECT interesse_recente($1) AS recente", [dados.email],
      );
      if (recente.rows[0]?.recente) return;

      await c.query(
        `INSERT INTO interesse_municipio
           (nome, cargo, email, telefone, municipio, uf, orgao,
            faixa_populacao, quantos_agentes, mensagem, origem, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          dados.nome.trim(),
          dados.cargo?.trim() || null,
          dados.email.trim().toLowerCase(),
          dados.telefone?.trim() || null,
          dados.municipio.trim(),
          dados.uf.toUpperCase(),
          dados.orgao?.trim() || null,
          dados.faixaPopulacao ?? null,
          dados.quantosAgentes ?? null,
          dados.mensagem?.trim() || null,
          dados.origem?.trim() || null,
          req.ip,
        ],
      );
    });

    // Mesma resposta nos dois caminhos, de propósito.
    return resposta.code(202).send({
      recebido: true,
      mensagem:
        "Pedido recebido. Alguém entra em contato pelo email informado, "
        + "normalmente em um dia útil.",
    });
  });

  /*
    Não existe rota de LEITURA aqui, e a ausência é a decisão.

    Ler os pedidos é trabalho de quem opera a plataforma, e o produto não tem
    (nem deve ter) um papel acima do administrador do município: a ADR 0006
    recusa o super-administrador justamente porque uma conta capaz de ver dois
    municípios transformaria o isolamento em promessa.

    Enquanto não existir um nível de plataforma separado, a leitura é pelo
    banco, com credencial de dono. É desconfortável de propósito: melhor
    desconfortável e honesto do que uma rota "só para mim" que amanhã alguém
    descobre.
  */
}
