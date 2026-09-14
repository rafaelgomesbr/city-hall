import { bancoLocal } from "./banco-local";

/**
 * O tema que o agente escolheu, guardado no aparelho.
 *
 * ## Por que não no cofre
 *
 * A sessão mora em `expo-secure-store` porque o token dá acesso ao dado de
 * risco das famílias do município inteiro. Isto aqui é a cor da tela. Pôr uma
 * preferência de tela no Keychain não a protege de nada e faz o contrário do
 * que parece: transforma o cofre num depósito de coisa comum, e no dia em que
 * alguém precisar auditar o que o aplicativo guarda como segredo, a resposta
 * deixa de ser curta. Segredo e preferência são duas naturezas, e o lugar de
 * cada uma diz qual é qual.
 *
 * Mora no banco local, na tabela `preferencias`, pela mesma razão que o convite
 * de notificação mora em `marcas` (`push/convite.ts`): é o depósito comum do
 * aparelho, já aberto, já compartilhado por uma conexão só. A diferença entre
 * as duas tabelas é o logout, e ela está escrita em `banco-local.ts`.
 *
 * ## Por que três valores e não dois
 *
 * "Acompanhar o sistema" é um estado de verdade, e não a ausência de escolha.
 * Com dois valores, quem estava satisfeito com o automático (que é a maioria, e
 * é o padrão) seria obrigado a escolher um lado para sempre na primeira vez que
 * encostasse no alternador, e não teria como voltar atrás: "claro" e "escuro"
 * não somam "o que o sistema disser".
 */

const CHAVE = "tema";

export type PreferenciaDeTema = "sistema" | "claro" | "escuro";

/** O que vale quando ninguém escolheu nada, e quando a leitura não deu certo. */
export const PREFERENCIA_PADRAO: PreferenciaDeTema = "sistema";

function ehPreferencia(valor: string): valor is PreferenciaDeTema {
  return valor === "sistema" || valor === "claro" || valor === "escuro";
}

/**
 * Lê a preferência guardada. NUNCA estoura e NUNCA fica pendurada por muito
 * tempo: a abertura do aplicativo espera por esta leitura (ver `_layout.tsx`),
 * e uma promessa que não volta seria a tela de abertura pendurada para sempre,
 * que é o pior defeito possível num aplicativo que abre no alto do morro.
 *
 * Valor irreconhecível (aparelho que voltou de uma versão futura, escrita
 * corrompida) responde o padrão, e não estoura: um tema que não existe mais não
 * pode impedir o aplicativo de abrir.
 */
export async function lerPreferenciaDeTema(): Promise<PreferenciaDeTema> {
  try {
    const db = await bancoLocal();
    const linha = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM preferencias WHERE chave = ?", [CHAVE],
    );
    if (linha && ehPreferencia(linha.valor)) return linha.valor;
    return PREFERENCIA_PADRAO;
  } catch {
    return PREFERENCIA_PADRAO;
  }
}

/**
 * Guarda a escolha. A tela NÃO espera por isto: quem troca o tema vê a troca no
 * mesmo quadro, e a escrita acontece atrás. Se ela falhar, o agente continua
 * com o tema que pediu nesta sessão e reescolhe na próxima abertura, que é um
 * aborrecimento pequeno perto de um toque que demora a responder.
 */
export async function guardarPreferenciaDeTema(
  preferencia: PreferenciaDeTema,
): Promise<void> {
  try {
    const db = await bancoLocal();
    await db.runAsync(
      `INSERT INTO preferencias (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [CHAVE, preferencia],
    );
  } catch {
    /* Ver o parágrafo acima: sem a escrita, a escolha vale só até fechar. */
  }
}
