import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import type { Config } from "../config.js";

/**
 * Registro e revogação do aparelho que recebe notificação.
 *
 * O que a rota guarda é a FICHA de push, o identificador que a Apple e o
 * Google dão ao aplicativo instalado. Ela não é credencial de acesso ao
 * sistema, e mesmo assim é material perigoso: quem tem a ficha escreve na tela
 * bloqueada de um agente de Defesa Civil, e uma ordem falsa de evacuação
 * escrita ali tira gente de casa de madrugada. Por isso a ficha nunca volta
 * numa resposta, nunca entra em log e nunca aparece em listagem.
 *
 * O usuário vem do token verificado, e a ficha vem do corpo. Não existe
 * parâmetro de município aqui, nem de usuário: registrar aparelho para outra
 * pessoa não é um caso de uso, é um ataque.
 */

const registroSchema = z.object({
  plataforma: z.enum(["ios", "android"], {
    errorMap: () => ({ message: "Plataforma precisa ser ios ou android" }),
  }),
  /**
   * O teto acompanha o do banco. A ficha da Apple tem 64 caracteres
   * hexadecimais e a do Google passa de 150, mas nenhuma das duas tem tamanho
   * prometido em contrato, então o limite é folgado de propósito.
   */
  ficha: z.string().min(1, "Informe a ficha do aparelho").max(4096),
});

const revogacaoSchema = z.object({
  ficha: z.string().min(1).max(4096),
});

/*
  Push desligado RECUSA, em vez de aceitar e guardar.

  Mesma decisão, e mesma forma, da recuperação de senha desligada em
  `rotas/autenticacao.ts`: 503 porque o serviço existe e está indisponível por
  escolha de quem implantou, e a mensagem diz o que está acontecendo em vez de
  só dizer que falhou.

  O defeito que isso evita é o da rota que aceita: o aplicativo guardaria a
  ficha, o servidor guardaria a ficha, ninguém receberia notificação nenhuma, e
  não haveria nada na tela que dissesse isso. Foi exatamente o que aconteceu
  com a recuperação de senha, que respondia "enviamos um link" sem enviar nada,
  em produção, por semanas.
*/
const RESPOSTA_DESLIGADA = {
  erro: "push_desligado",
  mensagem:
    "A notificação por push está desligada neste servidor. O aplicativo continua "
    + "funcionando normalmente, e as tarefas aparecem quando ele é aberto.",
} as const;

const RESPOSTA_SEM_ANDROID = {
  erro: "push_android_desligado",
  mensagem:
    "A notificação por push para Android ainda não está ligada neste servidor. "
    + "O aplicativo continua funcionando, e as tarefas aparecem quando ele é aberto.",
} as const;

export async function rotasAparelhos(
  app: FastifyInstance,
  { banco, config }: { banco: Banco; config: Config },
): Promise<void> {
  const desligado = config.PUSH_ATIVO === "nao";
  const semAndroid = !config.FCM_CONTA_SERVICO;

  /**
   * Registra, ou atualiza, o aparelho de quem está logado.
   *
   * NÃO PASSA POR `exigirPermissao`, e a razão é a mesma de `/auth/trocar-senha`
   * e `/auth/encerrar-sessoes`: este é um ato da pessoa sobre a própria conta,
   * não um ato sobre o acervo do município. A tabela de permissões responde
   * "quem classifica triagem, quem despacha equipe, quem encerra ocorrência", e
   * nenhuma dessas perguntas é esta. Exigir uma permissão de negócio aqui
   * significaria escolher um papel arbitrário e, com isso, impedir algum papel
   * legítimo de receber aviso.
   *
   * O que substitui a permissão é a estreiteza: a linha nasce carimbada com o
   * município e o usuário do token verificado, e não existe caminho para
   * carimbar outro. Ver a pendência registrada no teste, para o caso de a casa
   * preferir uma ação explícita no pacote compartilhado.
   */
  app.post("/", async (req, resposta) => {
    /*
      A autenticação vem ANTES da checagem de desligado, e a ordem é decisão.

      Ao contrário da recuperação de senha, que é pública por natureza, aqui
      quem pergunta já deveria ter token. Responder 503 a quem não tem
      transformaria a rota num jeito de descobrir, de fora, qual município
      ligou o push e qual não ligou. Não é o segredo mais valioso do mundo, e
      também não é informação que estranho precise ter.
    */
    const quem = await app.exigirAutenticacao(req);
    if (desligado) return resposta.code(503).send(RESPOSTA_DESLIGADA);

    const dados = registroSchema.parse(req.body);

    if (dados.plataforma === "android" && semAndroid) {
      /*
        Recusar é melhor que aceitar e nunca entregar. Sem a conta de serviço
        do Firebase, um aparelho Android registrado vira destino permanente de
        tentativa fracassada: o varredor gastaria as cinco tentativas em cada
        aviso, e o agente ficaria sem saber por que nunca chega nada.
      */
      return resposta.code(503).send(RESPOSTA_SEM_ANDROID);
    }

    const id = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{ id: string }>(
        /*
          Registrar a mesma ficha de novo ATUALIZA, e não duplica.

          O aplicativo reenvia a ficha a cada abertura, porque é assim que ele
          descobre que ela mudou. Sem o `ON CONFLICT`, cada abertura viraria uma
          linha, e o agente receberia a mesma notificação uma vez por abertura
          de aplicativo que ele já fez na vida.

          `usuario_id` é atualizado de propósito: telefone de plantão passa de
          mão dentro da prefeitura. Se a linha continuasse no nome do agente
          anterior, o aparelho seguiria recebendo tarefa da equipe DELE, que é
          vazamento de dado operacional para quem não está mais naquela equipe.

          A revogação é desfeita pelo mesmo motivo: quem sai e entra de novo no
          aplicativo está pedindo para voltar a receber.
        */
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT aparelhos_ficha_unica_no_municipio DO UPDATE
            SET usuario_id       = EXCLUDED.usuario_id,
                plataforma       = EXCLUDED.plataforma,
                visto_em         = now(),
                revogado_em      = NULL,
                motivo_revogacao = NULL
         RETURNING id`,
        [quem.organizacaoId, quem.usuarioId, dados.plataforma, dados.ficha],
      );
      return r.rows[0]!.id;
    });

    // A ficha NÃO volta na resposta. O que volta é o identificador da linha,
    // que serve para o suporte cruzar com `notificacoes_enviadas` quando
    // alguém perguntar se recebeu.
    return resposta.code(200).send({ id, registrado: true });
  });

  /**
   * Revoga o aparelho de quem está logado.
   *
   * Responde 204 mesmo quando não havia nada para revogar, pelo mesmo motivo
   * que `/auth/sair`: dizer "essa ficha não estava registrada" transformaria a
   * rota num verificador de fichas alheias, e não ajudaria em nada quem
   * legitimamente quer parar de receber.
   *
   * O `usuario_id` no filtro é o que impede um agente de revogar o aparelho do
   * colega e deixá-lo sem aviso de prazo na noite de temporal.
   */
  app.post("/revogar", async (req, resposta) => {
    // Autenticação antes do desligado, pela mesma razão da rota acima.
    const quem = await app.exigirAutenticacao(req);
    if (desligado) return resposta.code(503).send(RESPOSTA_DESLIGADA);

    const { ficha } = revogacaoSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, (c) =>
      c.query(
        `UPDATE aparelhos
            SET revogado_em = now(),
                motivo_revogacao = 'revogado pelo proprio usuario'
          WHERE ficha = $1 AND usuario_id = $2 AND revogado_em IS NULL`,
        [ficha, quem.usuarioId],
      ),
    );

    return resposta.code(204).send();
  });
}
