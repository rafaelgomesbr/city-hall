import * as SecureStore from "expo-secure-store";

/**
 * A ficha de push deste aparelho, guardada no cofre.
 *
 * Ela é guardada por um motivo só, e é um motivo de segurança: **sair da conta
 * precisa conseguir mandar a ficha para o servidor**, e no instante do logout o
 * caminho curto (perguntar ao sistema operacional) pode não responder. Pedir a
 * ficha à Apple ou ao Google é uma ida à rede deles, e ela falha exatamente
 * onde o agente mais sai da conta: no fim do plantão, no aparelho, sem sinal.
 * Sem a cópia local, o logout iria embora sem ficha, o servidor não teria como
 * calar aquele telefone, e ele seguiria recebendo tarefa da equipe de quem
 * acabou de sair.
 *
 * Fica no cofre (`expo-secure-store`, Keychain no iOS e Keystore no Android) e
 * não em arquivo comum, pela mesma razão do token: quem tem a ficha escreve na
 * tela bloqueada de um agente de Defesa Civil, e uma ordem falsa de evacuação
 * escrita ali tira gente de casa de madrugada.
 *
 * Ela é APAGADA no logout, depois de usada. A ficha continua sendo do aparelho,
 * mas o direito de apresentá-la ao servidor era da sessão que acabou; quem
 * entrar depois pede a sua ao sistema e registra de novo, que é barato e
 * carimba a linha com o usuário certo.
 */

const CHAVE = "dc360.ficha_de_push";

export async function guardarFicha(ficha: string): Promise<void> {
  await SecureStore.setItemAsync(CHAVE, ficha, {
    // Mesma régua do token: sem biometria a cada leitura, porque isto é lido
    // no caminho do logout e pedir digital ali faria o agente desistir de sair.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
}

/**
 * A ficha guardada, ou nulo.
 *
 * Nunca levanta erro. Quem chama é o logout, e um logout que falha porque o
 * cofre não abriu prenderia o agente numa sessão que ele mandou encerrar, que
 * é pior do que o aparelho continuar recebendo aviso.
 */
export async function fichaGuardada(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE).catch(() => null);
}

export async function esquecerFicha(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE).catch(() => undefined);
}
