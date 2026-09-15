import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { apagarFotosLocais } from "./foto-do-agente";

/**
 * A conexão única com o banco local do aparelho.
 *
 * Existe porque três módulos escrevem no mesmo arquivo, e antes cada um abria
 * a própria conexão: `rascunho.ts` grava a vistoria a cada toque, `fila.ts`
 * cuida do envio, e `pendencias.ts` troca a lista inteira de tarefas dentro de
 * uma transação. Com conexões separadas, o SQLite trata cada uma como um
 * processo concorrente disputando o mesmo arquivo.
 *
 * O defeito que isso causava foi visto em aparelho, e só em aparelho:
 *
 *   Error: Call to function 'NativeStatement.runAsync' has been rejected.
 *
 * O momento exato é o pior possível. O sinal volta, `pendencias.ts` abre uma
 * transação para trocar a lista de tarefas, e o agente, que está no meio da
 * vistoria, toca em qualquer coisa que grave o rascunho. A segunda escrita
 * bate no bloqueio da primeira e é recusada NA HORA, porque o SQLite não
 * espera por padrão. A promessa não era tratada em lugar nenhum, então em
 * desenvolvimento aparece uma tarja vermelha e, num binário de produção, o
 * toque simplesmente não grava e ninguém fica sabendo.
 *
 * Nada disso aparecia na suíte: os testes injetam um banco falso, que não tem
 * bloqueio nenhum. É bug de concorrência real, e concorrência real exige
 * aparelho real.
 *
 * As duas defesas, e as duas importam:
 *
 * 1. Uma conexão só. Dentro da mesma conexão o SQLite serializa as escritas em
 *    vez de recusá-las.
 * 2. `busy_timeout`. Ainda existe concorrência de fora (o processo de
 *    sincronização em segundo plano), e sem isto qualquer disputa vira erro
 *    imediato. Cinco segundos é muito mais do que qualquer escrita daqui leva,
 *    e é muito menos do que o agente levaria para desistir e refazer a
 *    vistoria.
 */

let conexao: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Os arquivos de prova que o aplicativo grava no diretório de documentos.
 *
 * Assinatura da moradora e foto da vistoria. Os dois nascem no cache do
 * sistema (o quadro de assinatura e a câmera devolvem caminho de cache) e são
 * copiados para cá justamente porque o sistema apaga cache sem avisar quando o
 * armazenamento aperta, e a coleta pode passar horas no aparelho antes de
 * sincronizar.
 */
const EVIDENCIA_NO_DISCO = /^(assinatura-\d+\.png|foto-\d+-\d+\.jpg)$/;

/** O nome do arquivo dentro do caminho, sem depender de `path` do Node. */
function nomeDoArquivo(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

/**
 * Quais arquivos de prova alguma coleta da fila ainda referencia.
 *
 * Devolve `null` quando não deu para saber, e quem chama trata isso como "não
 * apague nada". A escolha é deliberada e assimétrica: deixar um PNG a mais no
 * disco por um turno é um problema de privacidade pequeno e reversível no
 * próximo logout; apagar a assinatura de uma vistoria que ainda não subiu
 * destrói a prova de um ato administrativo que aconteceu, e não há como
 * refazer, porque a moradora assinou uma vez, no morro.
 */
async function arquivosAindaNaFila(
  db: SQLite.SQLiteDatabase,
): Promise<Set<string> | null> {
  try {
    const linhas = await db.getAllAsync<{ valor: string }>(
      "SELECT valor FROM fila_sincronizacao", [],
    );
    const nomes = new Set<string>();
    for (const linha of linhas) {
      try {
        const item = JSON.parse(linha.valor) as { fotos?: { uriLocal?: unknown }[] };
        for (const foto of item.fotos ?? []) {
          if (typeof foto.uriLocal === "string") nomes.add(nomeDoArquivo(foto.uriLocal));
        }
      } catch {
        // Um registro corrompido não pode impedir a limpeza do resto, e também
        // não pode ser lido: ele simplesmente não protege arquivo nenhum.
      }
    }
    return nomes;
  } catch (erro) {
    console.warn("Não deu para ler a fila antes de limpar os arquivos", erro);
    return null;
  }
}

async function abrirUmaVez(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("dc360-campo.db");

  /*
    WAL: leitura não bloqueia escrita. A tela lê o rascunho enquanto a fila
    escreve na mesma base, e sem isto uma das duas trava esperando a outra,
    em aparelho de entrada, no meio da coleta.
  */
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA busy_timeout = 5000;");

  /*
    Todo o esquema local, num lugar só.

    Antes cada módulo criava a própria tabela na própria conexão, o que
    funcionava mas espalhava o esquema por três arquivos e tornava impossível
    responder "o que existe neste banco" sem abrir os três.
  */
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rascunhos (
      ocorrencia_id TEXT PRIMARY KEY,
      conteudo      TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pendencias (
      id       TEXT PRIMARY KEY,
      conteudo TEXT NOT NULL,
      prazo_em TEXT
    );
    CREATE TABLE IF NOT EXISTS marcas (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    /*
      A lápide da coleta: uma linha por ocorrência já vistoriada NESTE
      aparelho, viva desde a conclusão até o servidor confirmar.

      Chave primária na ocorrência, e não na chave de idempotência, porque a
      pergunta que a tela faz é "esta ocorrência já foi coletada aqui?". Com a
      chave de idempotência no lugar da ocorrência, duas coletas da mesma
      ocorrência seriam duas linhas, que é justamente o estado que esta tabela
      existe para tornar impossível de acontecer por acidente.
    */
    CREATE TABLE IF NOT EXISTS coletas (
      ocorrencia_id   TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      protocolo       TEXT NOT NULL,
      coletada_em     TEXT NOT NULL,
      situacao        TEXT NOT NULL
    );
    /*
      A preferência de quem segura o aparelho, e ela é uma tabela SEPARADA de
      marcas por uma razão só: o logout.

      As duas guardam chave e valor, e a tentação de juntá-las é grande. O que
      as separa não é o formato, é o tempo de vida. A tabela marcas morre no
      logout de propósito (ver apagarDadosLocais): ela guarda o que a SESSÃO
      produziu, ou seja, dado de trabalho do turno que acabou, e no aparelho de
      plantão que passa de mão em mão isso precisa sumir. A tabela preferencias
      guarda o que a PESSOA escolheu sobre este telefone, e escolha de tela não
      é dado de cidadão nem de turno: quem sai da conta no fim do plantão e
      entra de novo na manhã seguinte não quer reescolher o tema.

      Duas tabelas é o que torna essa diferença impossível de perder de vista.
      Com uma só e uma lista de chaves poupadas no DELETE, a próxima chave
      nasceria do lado errado em silêncio.
    */
    CREATE TABLE IF NOT EXISTS preferencias (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  return db;
}

/**
 * A conexão, criada na primeira chamada e reusada em todas as outras.
 *
 * Guarda a PROMESSA, e não o banco já resolvido. A diferença importa: duas
 * chamadas simultâneas na montagem da tela receberiam `null` do cache e
 * abririam duas conexões, que é exatamente o problema que este arquivo existe
 * para resolver.
 */
export function bancoLocal(): Promise<SQLite.SQLiteDatabase> {
  conexao ??= abrirUmaVez();
  return conexao;
}

/** Só para teste e para o logout, que apaga a base inteira. */
export function esquecerConexao(): void {
  conexao = null;
}

/**
 * Apaga TODO dado local do aparelho: o banco e as assinaturas em disco.
 *
 * Chamado no logout. O aparelho de Defesa Civil de município pequeno é
 * compartilhado entre turnos, e o `sair()` limpava só as credenciais: o banco
 * seguia com o JSON integral das ocorrências (endereço, contato do cidadão,
 * descrição da vulnerabilidade de saúde da família) e os PNGs de assinatura
 * ficavam no disco para sempre, sem nada que os apagasse. O agente da noite
 * entrava com a própria conta e via o dado do turno do dia.
 *
 * Zera as tabelas em vez de derrubar o arquivo: o esquema fica de pé para o
 * próximo login, e o WAL não precisa recriar nada. Depois esquece a conexão,
 * para o próximo `bancoLocal()` reabrir limpo.
 *
 * Cada passo é isolado: uma assinatura que não apaga não pode impedir o banco
 * de ser limpo, e vice-versa. O que falha aqui é registrado, não engolido.
 */
export async function apagarDadosLocais(): Promise<void> {
  try {
    const db = await bancoLocal();
    /*
      `coletas` entra aqui junto com o resto, e não é detalhe: a lápide guarda
      protocolo e horário da vistoria que o agente do turno fez. Deixá-la de
      fora entregaria ao agente da noite, no mesmo aparelho compartilhado, a
      lista do que o colega do dia coletou, que é exatamente o vazamento que
      este bloco existe para impedir.
    */
    /*
      `fila_sincronizacao` NÃO entra nesta lista, e a ausência é a decisão mais
      importante deste arquivo.

      A fila guarda vistoria já feita no morro e ainda não entregue: apagá-la no
      logout mandaria o agente subir o morro de novo, e o diálogo de saída
      promete o contrário com todas as letras. A promessa vale.

      O que a promessa NÃO pode significar é a coleta subir com a credencial de
      quem entrar depois neste aparelho de plantão. O envelope não carrega autor:
      o servidor tira o `agente_id` de quem apresentou o token, e o laudo e a
      trilha (append-only) passariam a atribuir a vistoria a um servidor que
      nunca esteve no local, contra a minuta que foi lida em voz alta ali com
      outro nome. Quem impede isso é o carimbo de autor no próprio item da fila,
      em `packages/campo/src/fila.ts`: cada item lembra de quem é, e o dreno só
      envia o que for de quem está logado. Se um dia esta linha passar a apagar a
      fila, aquele carimbo perde o sentido junto.
    */
    /*
      `preferencias` também NÃO entra nesta lista, e pela razão oposta à da
      fila: ali o que se protege é prova de um ato administrativo, aqui é uma
      escolha de tela que nunca foi segredo de ninguém.

      O tema claro ou escuro é a única coisa desta tabela hoje, e ele pertence
      ao APARELHO e a quem o está segurando, não à sessão. Apagá-lo no logout
      devolveria o agente ao tema do sistema toda manhã, depois de ele ter
      escolhido o contrário exatamente porque o sistema erra: o telefone troca
      para o modo escuro no fim da tarde e o plantão da noite é justamente
      quando a tela precisa estar legível na mão molhada, sob a luz do
      caminhão. Escolha que não sobrevive ao logout é escolha que ninguém faz
      duas vezes.

      Não há dado de pessoa aqui, e não pode passar a haver: o que entrar nesta
      tabela sobrevive à troca de turno. Dado de cidadão vai para as tabelas
      acima, que são apagadas.
    */
    await db.execAsync(
      "DELETE FROM rascunhos; DELETE FROM pendencias; DELETE FROM marcas; DELETE FROM coletas;",
    );
  } catch (erro) {
    console.warn("Falha ao limpar o banco local no logout", erro);
  }

  /*
    Os arquivos de prova em disco, MENOS os que uma coleta na fila ainda usa.

    O bloco apagava toda `assinatura-<timestamp>.png` sem olhar a fila, e isso
    desmentia em silêncio a promessa do diálogo de saída. A sequência era esta:
    o agente coleta no morro, a moradora assina, ele sai da conta no fim do
    turno, o PNG é apagado, o item continua na fila apontando para um arquivo
    que não existe mais, e no próximo login o envio falha para sempre num
    arquivo inexistente. A vistoria inteira (checklist, GPS, observações,
    assinatura) morria por causa desta linha, sem nada na tela.

    Continua apagando o que NÃO está mais na fila, que é o caso comum: coleta já
    confirmada sai da fila e o arquivo dela vira lixo com dado de família dentro,
    num aparelho compartilhado entre turnos.
  */
  try {
    const emUso = await arquivosAindaNaFila(await bancoLocal());
    if (emUso === null) {
      console.warn("Arquivos de prova preservados: não deu para conferir a fila");
    } else {
      const dir = new Directory(Paths.document);
      for (const item of dir.list()) {
        if (item instanceof File
            && EVIDENCIA_NO_DISCO.test(item.name)
            && !emUso.has(item.name)) {
          item.delete();
        }
      }
    }
  } catch (erro) {
    console.warn("Falha ao apagar arquivos de prova no logout", erro);
  }

  /*
    A cópia local da foto de perfil sai junto, de quem for. Ela não está na
    fila (não é trabalho) e não é prova (é retrato), então não há nada a
    preservar: o aparelho é compartilhado entre turnos, e o rosto do agente da
    manhã não pertence ao da noite. Nunca estoura: ver `apagarFotosLocais`.
  */
  apagarFotosLocais();

  esquecerConexao();
}