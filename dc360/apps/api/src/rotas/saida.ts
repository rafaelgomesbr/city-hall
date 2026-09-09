import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { exigirPermissao } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import { autorizar } from "../servidor.js";
import { enderecoDoCliente } from "../rede.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { montarPacoteDeSaida } from "../saida/pacote.js";
import { fluxoZip } from "../saida/zip.js";

/**
 * Saída de município: o pacote com tudo que é do município, em formato aberto.
 *
 * O procedimento inteiro está em `docs/SAIDA-DE-MUNICIPIO.md`. Esta rota é o
 * passo 3 dele (extração), e existe porque a resposta a "e se um dia eu quiser
 * sair?" precisa ser um botão, e não um chamado para o suporte que leva dias.
 *
 * Duas coisas que esta rota NÃO faz, de propósito:
 *
 * 1. **Não apaga nada.** A eliminação só acontece depois de o município
 *    declarar que recebeu e conferiu, e ela não é ato de software: é ato
 *    contratual, com declaração escrita. Um botão que exportasse e apagasse na
 *    mesma chamada apagaria contra o calendário em vez de contra a
 *    confirmação, que é exatamente o erro que já destruiu dado de gente em
 *    outros produtos.
 * 2. **Não corta o acesso.** O sistema continua no ar durante todo o processo.
 *    Uma Defesa Civil sem sistema é uma Defesa Civil às cegas, e cortar na
 *    data do pedido seria punição.
 */
export async function rotasSaida(
  app: FastifyInstance,
  { banco, armazenamento, marcaDagua }: {
    banco: Banco;
    armazenamento: Armazenamento;
    marcaDagua?: string;
  },
): Promise<void> {
  app.post("/pacote.zip", async (req, resposta) => {
    /*
      DUAS permissões, e não uma, e a segunda é a que fecha o buraco.

      `exportar_dados` diz que a pessoa tira relatório, e coordenador tem essa
      permissão: é ela que gera o CSV do semestre para a câmara. Mas a saída de
      município é outra categoria de ato. Ela concentra, num arquivo só, a base
      inteira de cidadãos atendidos: nome, contato, endereço, descrição de
      vulnerabilidade social, fotografia da casa e assinatura do morador. É o
      pior arquivo do produto para vazar.

      `gerenciar_organizacao` é a permissão que só o administrador tem, e é a
      única do catálogo que significa "ato sobre o município inteiro". Exigir as
      duas deixa escrito no código o que o documento promete: saída é ato de
      quem administra o município, não de quem tira relatório.

      As duas são conferidas ANTES de qualquer consulta ao banco.
    */
    const quem = await autorizar(app, req, "exportar_dados");
    exigirPermissao(quem.papel, "gerenciar_organizacao");

    const agora = new Date();

    /*
      O registro vem ANTES do primeiro byte, e não depois.

      Um pacote de saída pode levar minutos e o cliente pode desistir no meio.
      Registrar no fim significaria que a extração interrompida (que já leu a
      base inteira e pode ter chegado ao disco de quem pediu) não deixa rastro
      nenhum. Registrar antes pode marcar uma extração que falhou, e esse é o
      erro barato: a trilha diz que alguém PEDIU a base completa, que é a
      pergunta que aparece quando um dado vaza.

      As duas escritas na mesma transação: o registro de exportação (LGPD,
      registro de operação de tratamento) e a trilha administrativa (quem
      praticou o ato). Uma sem a outra deixaria a resposta pela metade.
    */
    const { municipio, uf } = await banco.comTenant(quem.organizacaoId, async (c) => {
      const org = await c.query<{ nome: string; municipio: string; uf: string }>(
        "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1",
        [quem.organizacaoId],
      );
      const linha = org.rows[0] ?? { nome: "", municipio: "municipio", uf: "" };

      const totalOcorrencias = await c.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM ocorrencias",
      );

      /*
        Nível COMPLETO, sempre, e justificativa fixa.

        O pacote de saída leva nome, contato, descrição de vulnerabilidade,
        fotografia e assinatura. Registrá-lo como `basico` seria mentir no
        próprio registro que existe para responder à autoridade nacional, e a
        mentira ficaria escrita no lugar onde ela mais custa. A justificativa é
        fixa porque a finalidade também é: não há recorte a explicar, o motivo é
        o contrato, e ele é o mesmo em toda saída.
      */
      await c.query(
        `INSERT INTO exportacoes
           (organizacao_id, usuario_id, usuario_nome, tipo, filtros, total_registros, ip,
            nivel, justificativa)
         VALUES ($1,$2,$3,'saida_de_municipio',$4,$5,$6,'completo',$7)`,
        [
          quem.organizacaoId, quem.usuarioId, quem.nome,
          JSON.stringify({ escopo: "pacote completo de saída", pedidoEm: agora.toISOString() }),
          Number(totalOcorrencias.rows[0]?.total ?? 0),
          enderecoDoCliente(req) || null,
          "Saída de município: entrega da base completa ao controlador, conforme a "
          + "cláusula de reversibilidade do contrato. Nada é apagado antes da "
          + "conferência do município.",
        ],
      );

      await registrarAtoAdministrativo(c, quem, {
        acao: "saida_de_municipio_exportada",
        alvoTipo: "organizacao",
        alvoId: quem.organizacaoId,
        alvoNome: linha.nome,
        depois: {
          pedidoEm: agora.toISOString(),
          ocorrencias: Number(totalOcorrencias.rows[0]?.total ?? 0),
          nadaFoiApagado: true,
        },
      });

      return linha;
    });

    req.log.info(
      { organizacao: quem.organizacaoId, por: quem.usuarioId },
      "pacote de saída de município solicitado",
    );

    const dia = agora.toISOString().slice(0, 10);
    const arquivo = `saida-${municipio.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${uf.toLowerCase()}-${dia}.zip`;

    const pacote = montarPacoteDeSaida({
      banco, armazenamento,
      organizacaoId: quem.organizacaoId,
      emitidoPor: `${quem.nome} (${quem.papel})`,
      ...(marcaDagua ? { marcaDagua } : {}),
      agora,
    });

    /*
      Resposta em fluxo, sem `content-length`.

      Não dá para saber o tamanho antes de montar, e montar antes para saber
      significaria segurar o pacote inteiro na memória do processo. Um município
      com dez mil vistorias derrubaria o servidor no dia em que pedisse para
      sair, que é o pior dia possível para o servidor cair: é o dia em que ele
      está provando que não aprisiona ninguém.
    */
    return resposta
      .type("application/zip")
      .header("content-disposition", `attachment; filename="${arquivo}"`)
      .send(Readable.from(fluxoZip(pacote)));
  });
}
