import {
  baixarMeuTrabalho, baixarPendencias, reconciliarPendencias,
  TETO_DE_RECONCILIACAO, type MeuTrabalho, type Pendencia,
} from "./api";
import { bancoLocal } from "./banco-local";
import { esquecerColeta } from "./coletas";

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
  /*
    Os ids que este aparelho conhece são lidos ANTES da substituição.

    Depois dela a tarefa que sumiu já sumiu do disco, e não sobra o que
    perguntar ao servidor: a lista local é apagada e reescrita inteira. Ler
    antes é o que permite descobrir, logo em seguida, por que cada uma saiu.
  */
  const conhecidas = await idsConhecidos();
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

  /*
    A reconciliação vem DEPOIS, e o que ela devolve não pode derrubar a
    atualização que já entrou. Ela é conforto: explica o que sumiu e libera as
    lápides que o servidor já confirmou. Fracassar aqui adia a explicação até a
    próxima atualização, e não custa trabalho nenhum ao agente.

    Por isso o `catch` é vazio, e essa é uma decisão e não desleixo: propagar
    faria a lista nova, já gravada em disco, chegar à tela como erro de rede.
  */
  try {
    await aplicarReconciliacao(await reconciliarPendencias(token, conhecidas));
  } catch { /* explicação adiada, lista preservada */ }

  return pendenciasGuardadas();
}

/**
 * Os ids sobre os quais vale a pena perguntar ao servidor.
 *
 * Duas fontes, e a ORDEM entre elas importa por causa do teto de 200 da rota:
 *
 * 1. As lápides de coleta primeiro. Elas são o que impede vistoria duplicada e
 *    o que cresce sem limite se ninguém as apagar, e só a confirmação do
 *    servidor as apaga. Um aparelho que passou o mês fora tem lápide de sobra e
 *    tarefa de sobra, e cortar a lápide seria cortar justamente a que precisa
 *    de resposta.
 * 2. Depois as tarefas que o aparelho ainda acha que tem. Essas se resolvem
 *    sozinhas na próxima atualização, porque a lista é reescrita inteira.
 *
 * Sem repetição: id que está nas duas fontes é perguntado uma vez só, senão
 * metade do teto iria embora em duplicata.
 */
async function idsConhecidos(): Promise<string[]> {
  const db = await bancoLocal();
  const lapides = await db.getAllAsync<{ ocorrencia_id: string }>(
    "SELECT ocorrencia_id FROM coletas",
  );
  const tarefas = await db.getAllAsync<{ id: string }>("SELECT id FROM pendencias");
  const vistos = new Set<string>();
  for (const l of lapides) vistos.add(l.ocorrencia_id);
  for (const t of tarefas) vistos.add(t.id);
  return [...vistos].slice(0, TETO_DE_RECONCILIACAO);
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

/**
 * O que a reconciliação devolve sobre uma tarefa que sumiu da lista.
 *
 * Estruturalmente mínimo de propósito: o que interessa aqui é o par
 * `id` mais `status`, e amarrar este arquivo ao formato inteiro da resposta
 * criaria uma dependência que quebra a cada campo novo que a rota ganhar.
 */
export type SaidaReconciliada = { id: string; status: string };

/**
 * O servidor confirmando: a partir daqui a lápide da coleta não serve mais.
 *
 * A lápide (`coletas`) é o que impede a segunda vistoria enquanto a lista de
 * tarefas está velha, e ela precisa sair em algum momento, senão a tabela
 * cresce por todo o tempo de vida do aparelho. O momento certo é este, e só
 * este: `POST /sincronizacao/pendencias/reconciliar` responder que a ocorrência
 * saiu da lista COM vistoria concluída. Isso é o servidor dizendo que recebeu
 * a coleta, e a partir daí a defesa contra duplicata é dele, que reconhece a
 * chave de idempotência.
 *
 * Apagar por qualquer outro desfecho seria errado, e cada um por uma razão
 * diferente: `encerrada` e `devolvida` significam que a vistoria NÃO chegou, e
 * `outra_equipe` significa que ela mudou de dono. Nos três, a coleta que este
 * aparelho tem na fila continua sendo a única prova de que o agente esteve lá,
 * e a lápide continua sendo o que impede alguém de coletar de novo por cima.
 *
 * Compara o `status` cru, e não o `desfecho`: o desfecho é tradução para a tela
 * e pode ganhar nuance amanhã; o status é o fato registrado na ocorrência.
 */
export async function aplicarReconciliacao(
  saidas: readonly SaidaReconciliada[],
): Promise<void> {
  for (const s of saidas) {
    if (s.status === "vistoria_concluida") await esquecerColeta(s.id);
  }
}
