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

export type Alvo = { ficha: string; plataforma: Plataforma };

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
};

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
  provedores: { apple?: ProvedorDePush; google?: ProvedorDePush },
): EnvioDePush {
  return async (alvo, notificacao) => {
    const provedor = alvo.plataforma === "ios" ? provedores.apple : provedores.google;

    if (!provedor) {
      return {
        desfecho: "falha",
        detalhe: `provedor de ${alvo.plataforma} nao esta configurado neste servidor`,
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
