import type { LinhaOficio, LinhaProvidencia } from "../dados/repositorio";
import { formatarDataHora } from "../componentes/comuns";

/**
 * O que a tela diz sobre um ofício, decidido fora do JSX.
 *
 * Fica aqui porque a pergunta que o cartão responde ("mandamos ou não, e
 * alguém abriu") tem três estados parecidos que a tela precisa não confundir,
 * e confundir dois deles é o tipo de erro que só aparece na reunião em que o
 * órgão diz que nunca recebeu nada.
 */

export type TomDoEnvio = "neutro" | "info" | "sucesso" | "perigo";

export type EstadoDoEnvio = {
  tom: TomDoEnvio;
  /** A frase curta do selo. Sempre texto, nunca só cor. */
  rotulo: string;
  /** O que a frase curta não cabe dizer. */
  explicacao: string;
};

/**
 * O estado do envio por email, em três perguntas na ordem certa.
 *
 * A ordem importa e a distinção entre os estados é o ponto:
 *
 * - **nunca enviado** não é falha, é o normal de um ofício recém emitido, e
 *   também é o desfecho legítimo de um município que imprime e leva à mão;
 * - **tentado e não entregue** é o estado que precisa gritar. O provedor
 *   recusou, a tentativa está registrada, e ninguém do outro lado sabe que
 *   existe um ofício esperando;
 * - **entregue ao provedor não é lido por ninguém.** "Enviado" quer dizer que
 *   o servidor de email aceitou a mensagem, e mais nada. A única evidência de
 *   que alguém do órgão chegou ao documento é a ABERTURA do link de uso único,
 *   e por isso ela é dita separadamente, em vez de ser dissolvida num
 *   "enviado" verde que faz o coordenador parar de cobrar.
 */
export function estadoDoEnvio(oficio: {
  envios: number;
  ultimo_envio: string | null;
  aberto_em: string | null;
}): EstadoDoEnvio {
  if (oficio.envios === 0) {
    return {
      tom: "neutro",
      rotulo: "Não enviado por email",
      explicacao:
        "O ofício está emitido e pode ser impresso. Enquanto ninguém enviar, "
        + "o órgão não recebeu nada por este sistema.",
    };
  }
  if (oficio.ultimo_envio === null) {
    return {
      tom: "perigo",
      rotulo: "Nenhuma tentativa foi aceita",
      explicacao:
        `${oficio.envios === 1 ? "A tentativa ficou registrada" : `As ${oficio.envios} tentativas ficaram registradas`} `
        + "e o provedor de email não aceitou a mensagem. "
        + "Ninguém do órgão foi avisado: tente de novo, ou imprima o ofício e "
        + "encaminhe pelo canal de sempre.",
    };
  }
  if (oficio.aberto_em === null) {
    return {
      tom: "info",
      rotulo: `Enviado em ${formatarDataHora(oficio.ultimo_envio)}`,
      explicacao:
        "O provedor de email aceitou a mensagem, e isso não quer dizer que "
        + "alguém leu. O link de uso único ainda não foi aberto.",
    };
  }
  return {
    tom: "sucesso",
    rotulo: `Aberto pelo órgão em ${formatarDataHora(oficio.aberto_em)}`,
    explicacao:
      `Enviado em ${formatarDataHora(oficio.ultimo_envio)} e aberto no órgão de `
      + "destino. O link é de uso único: uma segunda abertura é recusada e fica "
      + "registrada.",
  };
}

/**
 * As providências que ainda podem gerar ofício.
 *
 * Um ofício por providência, e quem cobra isso é o banco. A tela esconde o
 * botão do que já tem, o que não é controle de acesso nenhum: é para o
 * coordenador não descobrir a regra por uma mensagem de erro depois de clicar.
 */
export function providenciasSemOficio(
  providencias: readonly LinhaProvidencia[],
  oficios: readonly LinhaOficio[],
): LinhaProvidencia[] {
  const jaTem = new Set(oficios.map((o) => o.providencia_id));
  return providencias.filter((p) => !jaTem.has(p.id));
}

/**
 * O rótulo do botão que confirma o envio.
 *
 * Ele repete o número e o órgão porque é a última chance de perceber que a
 * janela aberta não é a do ofício que se estava lendo, e porque o que este
 * botão faz sai do prédio: coloca um endereço de uso único para o dossiê de
 * uma família dentro da caixa de entrada de outro órgão.
 */
export function rotuloDoEnvio(oficio: { numero: string; orgao_nome: string } | null): string {
  if (!oficio) return "Enviar ofício";
  return `Enviar ${oficio.numero} para ${oficio.orgao_nome}`;
}

/**
 * O rótulo do botão que mostra ou esconde as tentativas de envio de um ofício.
 *
 * Era "Ver as {n} tentativa(s)" montado no JSX, e com uma tentativa só saía
 * "Ver as 1 tentativa" (correção 6 da V2-F00-E09, rodada 7: texto mal escrito
 * pelo portão visual). Uma tentativa é "a tentativa", sem número; mais de uma
 * leva o número e o plural, no artigo e no nome.
 */
export function rotuloDasTentativas(envios: number, abertas: boolean): string {
  const verbo = abertas ? "Esconder" : "Ver";
  return envios === 1 ? `${verbo} a tentativa` : `${verbo} as ${envios} tentativas`;
}
