/**
 * Por onde sai um aviso para uma pessoa.
 *
 * É uma porta, e não um cliente de email direto, por duas razões práticas: o
 * provedor ainda não foi escolhido (e a escolha tem implicação de custo e de
 * residência de dado), e um teste que precisasse de servidor de email nunca
 * seria rodado.
 *
 * O que NÃO passa por aqui: senha em claro, token de sessão, dado de saúde ou
 * qualquer coisa sobre a ocorrência. Uma mensagem de recuperação leva um link
 * de uso único e nada mais, porque email trafega e repousa fora do controle
 * do município.
 */
export type Mensagem = {
  para: string;
  nome: string;
  assunto: string;
  corpo: string;
};

export type Notificador = {
  enviar(mensagem: Mensagem): Promise<void>;
};

/**
 * Implementação de desenvolvimento: escreve no log do servidor.
 *
 * Em produção a configuração exige um notificador de verdade; subir sem ele
 * faria a recuperação responder "enviamos o link" sem enviar nada, que é pior
 * do que não ter recuperação.
 */
export function notificadorDeLog(
  registrar: (mensagem: string) => void = console.log,
): Notificador {
  return {
    async enviar(m) {
      registrar(
        `[notificacao] para=${m.para} assunto="${m.assunto}"\n${m.corpo}`,
      );
    },
  };
}

export function mensagemDeRecuperacao(
  nome: string,
  email: string,
  link: string,
  minutos: number,
): Mensagem {
  return {
    para: email,
    nome,
    assunto: "Redefinição de senha, Defesa Civil Operacional 360",
    corpo:
      `Olá, ${nome}.\n\n` +
      `Alguém pediu a redefinição da sua senha. Se foi você, use o link abaixo. ` +
      `Ele vale por ${minutos} minutos e funciona uma vez só.\n\n` +
      `${link}\n\n` +
      `Se não foi você, ignore esta mensagem: sua senha continua a mesma e ` +
      `nenhuma sessão foi encerrada.\n`,
  };
}
