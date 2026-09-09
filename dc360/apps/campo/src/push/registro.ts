import { ErroDaApi, SemSinal, type PlataformaDoAparelho } from "../dados/api";
import type { PortaDePush } from "./porta";

/**
 * Registrar a ficha depois do login, e o que fazer com cada jeito de falhar.
 *
 * O registro acontece DEPOIS da entrada, e nunca antes, por dois motivos que se
 * somam: a rota exige token verificado (é dele que sai o município e o usuário
 * da linha), e pedir a ficha ao sistema antes de a permissão existir devolve
 * nada de qualquer forma.
 *
 * O valor deste arquivo está menos no caminho feliz e mais na classificação das
 * falhas. Três coisas muito diferentes podem dar errado aqui, e tratar as três
 * como "erro" produziria o pior comportamento possível para quem está na rua:
 * um alarme vermelho sobre uma coisa a respeito da qual o agente não pode fazer
 * absolutamente nada.
 */

export type DesfechoDoRegistro =
  /** Deu certo: o servidor vai conseguir avisar este aparelho. */
  | "registrado"
  /** Este aparelho não tem ficha. Permissão negada, emulador, build sem push. */
  | "sem_ficha"
  /** O servidor respondeu 503: o push está desligado neste município. */
  | "push_desligado"
  /** Não deu para falar com o servidor agora. */
  | "sem_sinal"
  /** Qualquer outra coisa. */
  | "falhou";

/**
 * Traduz a falha em desfecho.
 *
 * `push_desligado` e `push_android_desligado` são os dois códigos que a rota de
 * aparelhos usa para o 503, e os dois significam a mesma coisa para quem está
 * segurando o telefone: este servidor não manda notificação, e não há o que
 * fazer a respeito. **Não é erro, e não pode alarmar.** A rota responde assim
 * de propósito, em vez de aceitar e guardar em silêncio, exatamente para que o
 * aplicativo possa saber e ficar quieto; se ela aceitasse, o agente esperaria
 * um aviso que nunca vem.
 *
 * Sinal é o caso comum e barato: o agente entrou na base com sinal ruim. A
 * próxima entrada registra, e enquanto isso as tarefas continuam aparecendo
 * quando ele abre o aplicativo, que é como o produto funciona desde sempre.
 */
export function classificarFalha(erro: unknown): DesfechoDoRegistro {
  if (erro instanceof SemSinal) return "sem_sinal";
  if (erro instanceof ErroDaApi) {
    if (erro.codigo === "push_desligado" || erro.codigo === "push_android_desligado") {
      return "push_desligado";
    }
    if (erro.status >= 500) return "sem_sinal";
  }
  return "falhou";
}

/**
 * Se o desfecho merece aparecer para o agente.
 *
 * Só `falhou`. Os outros três são estados normais do mundo: aparelho sem push,
 * servidor sem push, e sinal ruim. Nenhum deles tem ação do lado do agente, e
 * mostrar aviso sobre coisa sem ação é como se ensina alguém a ignorar aviso,
 * inclusive o aviso de prazo que este aplicativo existe para dar.
 *
 * E mesmo `falhou` não vira alarme vermelho na tela de tarefas: ele aparece em
 * "Minha conta", onde quem foi procurar quer saber.
 */
export function mereceContar(desfecho: DesfechoDoRegistro): boolean {
  return desfecho === "falhou";
}

/**
 * A plataforma que a rota aceita, ou nada.
 *
 * A rota conhece `ios` e `android` e recusa o resto com 422. Mandar "web" de um
 * ambiente que não é aparelho gastaria uma ida à rede para receber um erro que
 * já dava para prever aqui.
 */
export function plataformaAceita(
  plataforma: PortaDePush["plataforma"],
): PlataformaDoAparelho | null {
  return plataforma === "ios" || plataforma === "android" ? plataforma : null;
}

export type FerramentasDeRegistro = {
  porta: PortaDePush;
  /** Fala com `POST /aparelhos`. Recebe o token já resolvido por quem chama. */
  registrar(plataforma: PlataformaDoAparelho, ficha: string): Promise<void>;
  /** Guarda a ficha no cofre, para o logout conseguir mandá-la. */
  guardarFicha(ficha: string): Promise<void>;
};

/**
 * Pede a ficha ao sistema, registra no servidor e guarda a cópia local.
 *
 * A ORDEM importa: a cópia local é gravada ANTES da ida à rede. Se fosse
 * depois, a entrada feita com sinal ruim terminaria sem ficha guardada, e o
 * logout daquele plantão iria embora sem ter o que mandar, deixando o aparelho
 * recebendo tarefa de quem já saiu. Guardar cedo custa uma linha no cofre de um
 * aparelho que talvez nunca receba nada; guardar tarde custa o vazamento.
 */
export async function registrarEsteAparelho(
  f: FerramentasDeRegistro,
): Promise<DesfechoDoRegistro> {
  const plataforma = plataformaAceita(f.porta.plataforma);
  if (!plataforma) return "sem_ficha";

  let ficha: string | null = null;
  try {
    ficha = await f.porta.obterFicha();
  } catch {
    // Sistema sem provisionamento de push levanta em vez de devolver nulo. Para
    // quem está na rua os dois casos são o mesmo: este aparelho não recebe.
    return "sem_ficha";
  }
  if (!ficha) return "sem_ficha";

  await f.guardarFicha(ficha);

  try {
    await f.registrar(plataforma, ficha);
    return "registrado";
  } catch (erro: unknown) {
    return classificarFalha(erro);
  }
}
