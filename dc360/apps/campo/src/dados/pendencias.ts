import {
  baixarMeuTrabalho, baixarPendencias, type MeuTrabalho, type Pendencia,
} from "./api";
import { bancoLocal } from "./banco-local";

/**
 * A lista de tarefas, guardada no aparelho.
 *
 * O agente baixa na base, com sinal, e trabalha em cima disso o dia inteiro.
 * Sem cópia local, subir o morro significaria uma lista vazia e nenhuma
 * vistoria possível, que é o oposto do que este aplicativo existe para
 * resolver.
 *
 * A substituição é **completa e numa transação só**. Atualizar linha a linha
 * deixaria, se o processo morresse no meio, metade da lista de hoje e metade
 * da de ontem, sem ninguém saber qual é qual. Numa transação, ou a lista nova
 * inteira entra, ou a antiga inteira permanece, e as duas servem para
 * trabalhar.
 */

const MARCA_ULTIMA_BAIXA = "pendencias.baixadas_em";

export async function pendenciasGuardadas(): Promise<Pendencia[]> {
  const db = await bancoLocal();
  const linhas = await db.getAllAsync<{ conteudo: string }>(
    // Prazo mais próximo primeiro, e o sem prazo por último: a ordem da tela é
    // a ordem da urgência, não a de chegada.
    "SELECT conteudo FROM pendencias ORDER BY prazo_em IS NULL, prazo_em",
  );
  const lidas: Pendencia[] = [];
  for (const l of linhas) {
    try { lidas.push(JSON.parse(l.conteudo) as Pendencia); } catch { /* ignora ilegível */ }
  }
  return lidas;
}

/** Quando a lista foi baixada pela última vez, para a tela poder dizer. */
export async function baixadasEm(): Promise<string | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_ULTIMA_BAIXA],
  );
  return linha?.valor ?? null;
}

/**
 * Busca no servidor e substitui a cópia local.
 *
 * Devolve a lista que vale agora, venha ela da rede ou do disco. Quem chama
 * não precisa saber de onde veio: precisa saber se está velha, e para isso
 * existe `baixadasEm`.
 */
export async function atualizarPendencias(token: string): Promise<Pendencia[]> {
  const recebidas = await baixarPendencias(token);
  const db = await bancoLocal();
  const agora = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM pendencias");
    for (const p of recebidas) {
      await db.runAsync(
        "INSERT INTO pendencias (id, conteudo, prazo_em) VALUES (?, ?, ?)",
        [p.id, JSON.stringify(p), p.prazo_em],
      );
    }
    await db.runAsync(
      `INSERT INTO marcas (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [MARCA_ULTIMA_BAIXA, agora],
    );
  });

  return pendenciasGuardadas();
}

/** Uma tarefa específica, do disco. Serve para abrir a vistoria sem sinal. */
export async function pendenciaGuardada(id: string): Promise<Pendencia | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ conteudo: string }>(
    "SELECT conteudo FROM pendencias WHERE id = ?", [id],
  );
  if (!linha) return null;
  try { return JSON.parse(linha.conteudo) as Pendencia; } catch { return null; }
}

/**
 * A equipe do agente, guardada no disco.
 *
 * Mesma razão de tudo o mais aqui: a tela precisa abrir no alto do morro. Sem
 * cópia local, "Minha equipe" seria uma tela que só existe na base, ou seja,
 * exatamente onde ninguém precisa dela.
 *
 * Guarda o objeto inteiro num registro só, em `marcas`, porque ele é pequeno,
 * é lido de uma vez e nunca é consultado por parte.
 */
const MARCA_MEU_TRABALHO = "meu_trabalho";
const MARCA_MEU_TRABALHO_EM = "meu_trabalho_em";

export async function guardarMeuTrabalho(dados: MeuTrabalho): Promise<void> {
  const db = await bancoLocal();
  const agora = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO marcas (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [MARCA_MEU_TRABALHO, JSON.stringify(dados)],
    );
    await db.runAsync(
      `INSERT INTO marcas (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [MARCA_MEU_TRABALHO_EM, agora],
    );
  });
}

export async function meuTrabalhoGuardado(): Promise<
  { dados: MeuTrabalho; baixadoEm: string } | null
> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_MEU_TRABALHO],
  );
  if (!linha) return null;
  const quando = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_MEU_TRABALHO_EM],
  );
  return {
    dados: JSON.parse(linha.valor) as MeuTrabalho,
    baixadoEm: quando?.valor ?? new Date(0).toISOString(),
  };
}

/** Busca na rede e guarda. Devolve o que guardou. */
export async function atualizarMeuTrabalho(token: string): Promise<MeuTrabalho> {
  const dados = await baixarMeuTrabalho(token);
  await guardarMeuTrabalho(dados);
  return dados;
}
