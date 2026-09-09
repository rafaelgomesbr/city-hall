import { bancoLocal } from "../dados/banco-local";

/**
 * A memória de que o convite de notificação já foi mostrado.
 *
 * Precisa sobreviver ao aplicativo ser fechado, senão o convite volta a cada
 * abertura. Convite que volta sempre é o que ensina a pessoa a tocar "Agora
 * não" por reflexo, e no iOS o reflexo custa caro: basta ela errar uma vez e
 * tocar na caixa do SISTEMA, e a recusa é definitiva.
 *
 * Mora na tabela `marcas` do banco local, e não no cofre, por dois motivos. Não
 * é segredo: é uma preferência de tela. E `apagarDadosLocais()` limpa `marcas`
 * no logout, o que é o comportamento certo num aparelho de plantão que passa de
 * turno em turno: o próximo agente merece o convite, porque a decisão do
 * anterior de adiar não era dele. O que NÃO volta é a resposta dada à caixa do
 * sistema, que pertence ao aplicativo instalado e não à sessão, e é por isso que
 * `proximoPasso` continua respondendo "nada" para quem já recusou de verdade.
 */

const MARCA = "push.convite_mostrado";

export async function jaConvidou(): Promise<boolean> {
  try {
    const db = await bancoLocal();
    const linha = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM marcas WHERE chave = ?", [MARCA],
    );
    return linha?.valor === "1";
  } catch {
    /*
      Banco indisponível responde "já convidou", e não "ainda não".

      Errar para este lado deixa alguém sem o convite, e essa pessoa continua
      podendo ligar os avisos por "Minha conta". Errar para o outro lado abriria
      o convite a cada abertura enquanto o banco estivesse ruim, que é
      exatamente a insistência que este arquivo existe para impedir.
    */
    return true;
  }
}

export async function marcarConvidado(): Promise<void> {
  try {
    const db = await bancoLocal();
    await db.runAsync(
      `INSERT INTO marcas (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [MARCA, "1"],
    );
  } catch {
    /* Sem a marca o convite reaparece na próxima abertura. Não custa trabalho. */
  }
}
