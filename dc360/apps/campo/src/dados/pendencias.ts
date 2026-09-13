import {
  baixarMeuTrabalho, baixarPendencias, reconciliarPendencias,
  TETO_DE_RECONCILIACAO, type MeuTrabalho, type OrgaoDoCatalogo, type Pendencia,
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
/**
 * Vazio quando a lista veio inteira; o tamanho do teto quando foi cortada.
 *
 * Guardar o TETO e não um booleano é o que permite a tela dizer o número em vez
 * de dizer "tem mais", que é a diferença entre um aviso e um susto.
 */
const MARCA_LISTA_TRUNCADA = "pendencias.teto_atingido";

/**
 * O catálogo de órgãos do município, no disco do aparelho.
 *
 * Isto NÃO é otimização, é a condição para um item obrigatório do checklist
 * poder ser respondido. "Necessário acionar outro órgão: sim" pede o nome de
 * quem acionar, e a tela que perguntasse isso à rede travaria a vistoria
 * justamente sem sinal, que é a condição normal de trabalho deste aplicativo e
 * o princípio que governa o produto inteiro.
 *
 * Mora em `marcas`, num registro só, pela mesma razão de "meu trabalho": é
 * pequeno, é lido inteiro de uma vez para montar a lista de seleção, e nunca é
 * consultado por parte. Uma tabela própria com índice serviria a uma consulta
 * que não existe.
 *
 * Some no logout junto com o resto de `marcas`, e isso é obrigatório e não
 * efeito colateral: o aparelho de plantão passa de turno em turno, às vezes
 * entre municípios diferentes, e catálogo é cadastro de um município só.
 */
const MARCA_CATALOGO_ORGAOS = "orgaos.catalogo";

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

/**
 * O catálogo de órgãos que este aparelho tem, lido do DISCO.
 *
 * Nunca da rede, e nem sequer com a rede como plano B: a tela de vistoria não
 * toca na rede em lugar nenhum, porque tentar e falhar no alto do morro gasta
 * bateria e ensina o agente a desconfiar de uma coleta que está perfeitamente
 * guardada.
 *
 * Devolve lista vazia quando não há catálogo, e a tela precisa saber lidar com
 * isso sem travar: aparelho novo, que nunca sincronizou, é o caso mais comum de
 * lista vazia, e ali o campo livre sozinho tem que bastar para concluir.
 */
export async function orgaosGuardados(): Promise<OrgaoDoCatalogo[]> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_CATALOGO_ORGAOS],
  );
  if (!linha) return [];
  try {
    const lido = JSON.parse(linha.valor) as OrgaoDoCatalogo[];
    return Array.isArray(lido) ? lido : [];
  } catch {
    // Registro ilegível não pode impedir a vistoria: sem catálogo, o campo
    // livre continua concluindo a coleta, que é o caminho do aparelho novo.
    return [];
  }
}

/**
 * O teto, quando a última baixa foi cortada. Nulo quando veio inteira.
 *
 * A tela PRECISA usar isto. Sem o aviso, o agente vê uma lista aparentemente
 * completa, sobe o morro confiando nela, e as tarefas que ficaram de fora
 * simplesmente não existem para ele. Cortar é aceitável; calar não é.
 */
export async function tetoAtingido(): Promise<number | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_LISTA_TRUNCADA],
  );
  const valor = linha?.valor ?? "";
  return valor === "" ? null : Number(valor);
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
  const lista = await baixarPendencias(token);
  const recebidas = lista.itens;
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
    /*
      A marca de corte é gravada junto, na MESMA transação da lista.

      Junto porque ela descreve a lista que acabou de entrar: guardada fora da
      transação, uma falha no meio deixaria a lista nova com o aviso da antiga,
      ou o contrário, e o aviso passaria a mentir sobre a lista que está na
      tela. O aparelho é lido offline, e o aviso é a única coisa que separa
      "estas são todas as suas tarefas" de "estas são as primeiras 200".
    */
    await db.runAsync(
      `INSERT INTO marcas (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [MARCA_LISTA_TRUNCADA, lista.truncada ? String(lista.teto) : ""],
    );
    /*
      O catálogo entra na MESMA transação da lista de tarefas, e isso é a regra
      inteira do item 2 desta mudança.

      Junto porque as duas coisas servem à mesma vistoria: a tarefa sem o
      catálogo é uma tela que pergunta "qual órgão?" e não tem o que oferecer, e
      o catálogo sem a tarefa não serve a nada. Numa transação só, ou o aparelho
      fica com o par novo, ou continua com o par velho, e os dois pares servem
      para trabalhar. Gravar fora deixaria a janela em que existe um sem o outro,
      e essa janela cai justamente no aparelho que perdeu o sinal no meio da
      sincronização, que é o aparelho que mais precisa dos dois.

      `null` NÃO apaga: é servidor que não mandou o campo, e o catálogo que já
      está no disco continua valendo. Apagar ali faria a sincronização, que
      existe para trazer, ser a coisa que leva embora.

      A pergunta é `Array.isArray` e não `!== null` de propósito: qualquer coisa
      que não seja uma lista (campo ausente, nulo, um objeto vindo de um servidor
      mais novo) significa "não sei dizer", e a resposta a "não sei" é deixar o
      disco como está. Com a comparação estrita, um `undefined` chegava até o
      `JSON.stringify` e a gravação estourava DENTRO da transação, derrubando
      junto a lista de tarefas que já tinha entrado.
    */
    if (Array.isArray(lista.orgaos)) {
      await db.runAsync(
        `INSERT INTO marcas (chave, valor) VALUES (?, ?)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
        [MARCA_CATALOGO_ORGAOS, JSON.stringify(lista.orgaos)],
      );
    }
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

/**
 * Tira uma tarefa da cópia local, e só depois de o SERVIDOR confirmar.
 *
 * Existe por causa da devolução. Entre o toque e a confirmação, quem esconde a
 * tarefa da lista é o item na fila: enquanto ele existir, a tarefa está fora
 * dali e continua guardada no aparelho, que é a promessa do produto inteiro.
 * Depois da confirmação o item some da fila (confirmado fica visível um tempo e
 * sai), e aí a linha aqui voltaria a aparecer na lista, sem explicação nenhuma,
 * até a próxima baixa com sinal. Esta função é o que fecha essa janela.
 *
 * NÃO é para uso fora desse caso. Apagar tarefa por decisão do aparelho é como
 * se perde trabalho: a lista local é a única coisa que o agente tem no morro, e
 * ela é reescrita inteira, com transação, por `atualizarPendencias`.
 */
export async function esquecerPendencia(ocorrenciaId: string): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync("DELETE FROM pendencias WHERE id = ?", [ocorrenciaId]);
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
 * `devolvida` ganhou um segundo significado em 13/09/2026, e a regra daqui não
 * muda: agora a devolução pode ter sido deste agente, feita neste aparelho. Nem
 * por isso a lápide pode cair, e a razão é a mesma de antes: devolver significa
 * que a vistoria não aconteceu, e uma lápide só existe onde ela aconteceu. Na
 * prática os dois não convivem, porque a tela e a fila recusam devolver tarefa
 * que tem coleta guardada neste aparelho (ver `impedimentoParaDevolver`), mas a
 * regra aqui não depende disso para estar certa.
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
