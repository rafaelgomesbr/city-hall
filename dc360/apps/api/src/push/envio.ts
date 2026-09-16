import type { Notificacao } from "./mensagem.js";

/**
 * A porta única por onde a notificação sai deste servidor.
 *
 * Existe uma indireção aqui pelo mesmo motivo que existe o `Notificador` da
 * recuperação de senha: um teste que precisasse falar com a Apple de verdade
 * nunca seria rodado, e um envio de verdade para o telefone de alguém, sem a
 * metade aplicativo pronta, é barulho sem valor.
 */

export type Plataforma = "ios" | "android";

/**
 * Com qual das duas APNs o aparelho fala. O vocabulário é o de
 * `APNS_AMBIENTE` (`config.ts`), e não o da Apple (`sandbox`/`production`),
 * para a coluna do banco, a variável do servidor e o campo do aplicativo
 * dizerem a mesma palavra. Ver a migração 044.
 */
export type AmbienteApns = "producao" | "teste";
export const AMBIENTES_APNS = ["producao", "teste"] as const;

export type Alvo = {
  ficha: string;
  plataforma: Plataforma;
  /**
   * Só faz diferença no iOS. Ausente vale `producao`, que é o padrão da
   * coluna e o ambiente do binário de loja.
   */
  ambiente?: AmbienteApns;
};

/**
 * Os três desfechos possíveis, e cada um leva a uma ação diferente:
 *
 *   entregue        a Apple ou o Google aceitou. Nunca mais mandar esta.
 *   falha           recusa do instante (rede fora, serviço fora, limite de
 *                   taxa). O varredor tenta de novo depois da espera.
 *   ficha_invalida  o aparelho não existe mais do outro lado. Reinstalar o
 *                   aplicativo troca a ficha, e a antiga morre. O varredor
 *                   REVOGA o aparelho, porque insistir nela é gastar tentativa
 *                   contra um destino que não vai voltar.
 */
export type DesfechoDoEnvio = {
  desfecho: "entregue" | "falha" | "ficha_invalida";
  detalhe: string | null;
};

export type ProvedorDePush = {
  enviar(ficha: string, notificacao: Notificacao): Promise<DesfechoDoEnvio>;
  /**
   * Confere a credencial SEM enviar nada. A partida chama isto para falhar
   * alto com um `.p8` colado pela metade, em vez de subir e descobrir horas
   * depois, na primeira rodada com alvo, que cem por cento das notificações
   * caem em `falha`. Opcional porque um duplo de teste não tem o que conferir.
   */
  validar?(): Promise<void>;
};

/**
 * Os provedores da Apple, um por ambiente.
 *
 * A Apple tem dois serviços de push que não se falam, e qual vale é decidido
 * pelo `aps-environment` com que o BINÁRIO foi assinado: o que sai do Xcode
 * fala com o sandbox, o que sai do TestFlight e da loja fala com produção.
 * Com um provedor só, o aparelho do ambiente errado recebe `BadDeviceToken`,
 * que significa "este aparelho não existe mais", e o varredor o REVOGA.
 * Dois provedores, e a linha de `aparelhos` diz qual (migração 044).
 */
export type ProvedoresApns = Partial<Record<AmbienteApns, ProvedorDePush>>;

export type EnvioDePush = (alvo: Alvo, notificacao: Notificacao) => Promise<DesfechoDoEnvio>;

/**
 * Tira a ficha de qualquer texto que vá para o banco ou para o log.
 *
 * O caminho da APNs carrega a ficha na própria URL (`/3/device/<ficha>`), e a
 * mensagem de erro de rede do Node repete a URL inteira. Sem esta limpeza, um
 * provedor fora do ar escreveria a ficha de push de cada agente na coluna
 * `detalhe`, que é a coluna que o suporte abre para responder pergunta de
 * usuário, e no log, que é lido por mais gente e guardado por mais tempo do
 * que qualquer um imagina. Quem tem a ficha escreve na tela bloqueada de um
 * agente de Defesa Civil.
 */
export function semAFicha(texto: string, ficha: string): string {
  if (ficha.length < 4) return texto;
  return texto.split(ficha).join("[ficha]");
}

const TETO_DO_DETALHE = 300;

/**
 * Junta os dois provedores e garante a regra que vale para os dois: falha de
 * envio NÃO sobe como exceção.
 *
 * Uma notificação que não sai não pode derrubar o varredor no meio da lista,
 * deixando sem aviso todo mundo que vinha depois na fila, e muito menos pode
 * derrubar a requisição que originou o aviso. O erro vira desfecho, o desfecho
 * vira linha no banco, e a varredura seguinte tenta de novo.
 */
export function criarEnvio(
  provedores: {
    /**
     * Um provedor só vale para todo aparelho iOS, seja qual for o ambiente
     * dele (é como os testes montam, e como um servidor de um ambiente só
     * pode montar). O par roteia pela coluna.
     */
    apple?: ProvedorDePush | ProvedoresApns;
    google?: ProvedorDePush;
  },
): EnvioDePush {
  return async (alvo, notificacao) => {
    const provedor = alvo.plataforma === "ios"
      ? provedorDaApple(provedores.apple, alvo.ambiente ?? "producao")
      : provedores.google;

    if (!provedor) {
      const qual = alvo.plataforma === "ios" ? `ios (${alvo.ambiente ?? "producao"})` : alvo.plataforma;
      return {
        desfecho: "falha",
        detalhe: `provedor de ${qual} nao esta configurado neste servidor`,
      };
    }

    try {
      const resultado = await provedor.enviar(alvo.ficha, notificacao);
      return {
        desfecho: resultado.desfecho,
        detalhe: resultado.detalhe
          ? semAFicha(resultado.detalhe, alvo.ficha).slice(0, TETO_DO_DETALHE)
          : null,
      };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      return {
        desfecho: "falha",
        detalhe: semAFicha(mensagem, alvo.ficha).slice(0, TETO_DO_DETALHE),
      };
    }
  };
}

function provedorDaApple(
  apple: ProvedorDePush | ProvedoresApns | undefined,
  ambiente: AmbienteApns,
): ProvedorDePush | undefined {
  if (!apple) return undefined;
  if ("enviar" in apple && typeof apple.enviar === "function") return apple as ProvedorDePush;
  return (apple as ProvedoresApns)[ambiente];
}
