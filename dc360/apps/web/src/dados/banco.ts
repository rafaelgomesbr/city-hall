import { PGlite } from "@electric-sql/pglite";
import type { Transaction } from "@electric-sql/pglite";
import sementeDesenvolvimento from "../../../../db/seeds/desenvolvimento.sql?raw";
/*
  A semente que só o modo de demonstração aplica, depois da compartilhada.

  Ela vive aqui dentro, e não em `db/seeds/`, porque aquela pasta é da API
  também: um caso semeado lá apareceria nos testes do servidor e nas contagens
  deles. Este arquivo mostra uma tarefa devolvida do campo, que é o tipo de
  caso que faz um coordenador reconhecer o produto, e a demonstração é peça de
  venda. Ver o próprio arquivo para o porquê de cada linha.
*/
import sementeDaDemonstracao from "./semente-da-demonstracao.sql?raw";

/**
 * TODAS as migrações, descobertas em vez de listadas.
 *
 * Isto era uma lista de dois `import` com um comentário ao lado dizendo "as
 * mesmas migrações que rodam no servidor, na mesma ordem". Eram duas de nove,
 * e o comentário escondeu o defeito por sete migrações seguidas.
 *
 * O estrago não era teórico. `responderProvidencia` escreve em `desfecho` e
 * `respondida_por`, colunas que nascem na 006: responder uma providência no
 * modo de demonstração falhava com "coluna não existe", na frente de quem
 * estivesse assistindo. E sem a 008 o modo local não tinha a chave estrangeira
 * composta, ou seja, a garantia de isolamento que o README descreve por três
 * parágrafos não valia justamente no modo em que a demonstração roda.
 *
 * `import.meta.glob` com `eager` resolve em tempo de build: o Vite embute o
 * conteúdo de cada arquivo no bundle, sem rede. A migração 010 entra sozinha,
 * e é isso que faz esta correção durar.
 */
const MIGRACOES = Object.entries(
  import.meta.glob("../../../../db/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).sort(([a], [b]) => a.localeCompare(b));

/**
 * O banco desta fase roda em PGlite: Postgres 16 compilado para WebAssembly,
 * dentro da própria aba, persistindo em IndexedDB.
 *
 * Isso não é um mock. É o mesmo arquivo de migração que vai para o servidor,
 * com as mesmas policies de Row Level Security forçadas, o mesmo papel de
 * aplicação sem privilégio e as mesmas restrições de integridade. Trocar por
 * um Postgres gerenciado depois é trocar a origem da conexão, não as regras:
 * elas já estão no banco, não na tela.
 */

let instancia: PGlite | null = null;
let iniciando: Promise<PGlite> | null = null;

/** O que as funções do repositório recebem para consultar dentro da transação. */
export type Contexto = Transaction;

/*
  A versão faz parte do nome do banco persistido, de propósito.

  O modo de demonstração decide se precisa migrar perguntando se a tabela
  `ocorrencias` existe. Enquanto ele aplicava só duas migrações, um navegador
  que já tinha o banco antigo responderia "existe" e pularia as sete
  migrações novas para sempre: a correção não chegaria em quem mais precisa
  dela, que é justamente quem já usou.

  Subir o número aposenta o banco anterior e o próximo abre do zero, semeado.
  Aqui isso não custa nada: o dado é fictício e a semente é a mesma que a API
  usa. Num banco de verdade seria inaceitável, e é por isso que este atalho
  vale só para o modo de demonstração.
*/
const CHAVE_PERSISTENCIA = "idb://dc360-v4";
const MARCA_SEMENTE = "dc360:semeado:v4";

/**
 * Teto para o banco ficar de pé. Existe por um número medido, não por
 * precaução.
 *
 * No motor do Safari, o Postgres em WebAssembly com persistência em IndexedDB
 * leva **163 segundos** para abrir. Não trava: termina, quase três minutos
 * depois, e nesse meio tempo a tela de entrada fica parada em "Preparando o
 * banco de dados local", sem barra, sem erro e sem nada para o usuário
 * procurar. No Chromium e no Firefox o mesmo banco abre em poucos segundos.
 *
 * Vinte segundos separa os dois mundos com folga larga. Quem passar disso cai
 * para memória e tem a demonstração funcionando em torno de vinte e um
 * segundos, em vez de cento e sessenta e três, ao custo de perder o dado ao
 * fechar a aba, que é uma troca boa e que a tela declara.
 */
const TETO_DE_ESPERA_MS = 20_000;

function comTeto<T>(promessa: Promise<T>, oQue: string): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => {
      rejeitar(new Error(`${oQue} não respondeu em ${TETO_DE_ESPERA_MS / 1000} segundos`));
    }, TETO_DE_ESPERA_MS);
    promessa.then(
      (v) => { clearTimeout(relogio); resolver(v); },
      (e: unknown) => { clearTimeout(relogio); rejeitar(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

/**
 * Abre o banco, e cai para a memória se a persistência travar.
 *
 * Perder a persistência custa o dado ao fechar a aba. Travar custa a
 * demonstração inteira. A troca é fácil, e a tela avisa o que aconteceu em vez
 * de fingir que está tudo normal.
 */
let persistenciaIndisponivel = false;

/** Se o banco desta aba esquece tudo ao fechar, e por quê. */
export function bancoSemPersistencia(): boolean {
  return persistenciaIndisponivel;
}

async function abrirPGlite(): Promise<PGlite> {
  let tentativa: PGlite | null = null;
  try {
    tentativa = new PGlite(CHAVE_PERSISTENCIA);
    await comTeto(tentativa.waitReady, "o banco local com persistência");
    return tentativa;
  } catch (erro) {
    /*
      Fecha a tentativa abandonada antes de abrir outra. Ela continua viva
      depois do teto, segurando um worker e o mesmo armazenamento, e duas
      instâncias do mesmo banco disputando o lugar é como uma falha de partida
      vira travamento em qualquer operação depois.
    */
    void tentativa?.close().catch(() => undefined);

    persistenciaIndisponivel = true;
    console.warn(
      "Persistência em IndexedDB indisponível neste navegador. O banco local " +
      "sobe em memória e o que for feito nesta aba some ao fechá-la.", erro,
    );
    const emMemoria = new PGlite();
    await comTeto(emMemoria.waitReady, "o banco local em memória");
    return emMemoria;
  }
}

/**
 * Escreve uma vez, pelo mesmo caminho da aplicação, e desfaz.
 *
 * O banco pode subir e mesmo assim não aceitar escrita: papel sem privilégio,
 * policy mal aplicada, migração pela metade. Descobrir isso na abertura custa
 * alguns milissegundos; descobrir no meio de um cadastro custa o cadastro.
 *
 * A prova usa o caminho real (transação, papel `dc360_app`, contexto de
 * organização e INSERT numa tabela com RLS) porque é essa combinação que a
 * aplicação usa, e desfaz tudo com `rollback` para não deixar rastro nem
 * consumir número de protocolo.
 */
async function provaDeEscrita(db: PGlite): Promise<void> {
  const org = await db.query<{ id: string }>("SELECT id FROM organizacoes LIMIT 1");
  const alvo = org.rows[0]?.id;
  if (!alvo) return;

  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [alvo]);
    // Chamar a função de protocolo não basta: ela não passa por policy de
    // RLS. A prova precisa ser a escrita de verdade, na tabela de verdade.
    await tx.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco,
          solicitante_nome, canal_entrada, descricao)
       VALUES ($1, $2, 'deslizamento', 'registrada', $3, $4, 'outro', $5)`,
      [
        alvo, `prova-de-escrita-${Date.now()}`, "Endereço de prova",
        "Prova de escrita", "Registro criado e desfeito na abertura do banco local.",
      ],
    );
    await tx.rollback();
  });
}

export async function banco(): Promise<PGlite> {
  if (instancia) return instancia;
  if (iniciando) return iniciando;

  iniciando = (async () => {
    const db = await abrirPGlite();

    const jaMigrado = await db.query<{ existe: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ocorrencias') AS existe",
    );

    if (!jaMigrado.rows[0]?.existe) {
      // As mesmas migrações que rodam no servidor, todas, na ordem do nome.
      for (const [caminho, sql] of MIGRACOES) {
        try {
          await db.exec(sql);
        } catch (erro) {
          // Falhar aqui em silêncio produziria um banco pela metade e uma tela
          // que quebra três cliques depois, longe da causa.
          throw new Error(
            `A migração ${caminho.split("/").pop()} não aplicou no banco local: `
            + `${erro instanceof Error ? erro.message : String(erro)}`,
          );
        }
      }
    }
    /*
      A marca de semeadura vive no localStorage, que SOBREVIVE mesmo quando o
      banco não sobrevive. Num banco em memória, consultar a marca deixaria a
      segunda visita com um banco vazio e uma tela sem nenhuma ocorrência: a
      marca diria "já semeado" sobre dado que não existe mais.
    */
    const precisaSemear = persistenciaIndisponivel || !localStorage.getItem(MARCA_SEMENTE);
    if (precisaSemear) {
      // E a mesma semente que a API usa quando sobe sem banco externo, para o
      // protocolo que aparece aqui ser o mesmo que a API devolveria.
      await db.exec(sementeDesenvolvimento);
      /*
        Depois da compartilhada, e nunca antes: ela mexe em ocorrência que a
        outra cria, e a ordem é o que faz a devolução ter um despacho antes
        dela na linha do tempo.
      */
      await db.exec(sementeDaDemonstracao);
      if (!persistenciaIndisponivel) {
        localStorage.setItem(MARCA_SEMENTE, new Date().toISOString());
      }
    }

    await comTeto(provaDeEscrita(db), "a primeira escrita no banco local");

    instancia = db;
    return db;
  })();

  /*
    Falhou, esquece a tentativa. Sem isto, a promessa rejeitada fica guardada
    em `iniciando` e toda chamada seguinte recebe o mesmo erro antigo, mesmo
    depois de o motivo ter passado.
  */
  iniciando.catch(() => { iniciando = null; });

  return iniciando;
}

/**
 * Toda leitura e escrita da aplicação passa por aqui.
 *
 * O contrato é o mesmo que a API vai cumprir em produção: abrir transação,
 * assumir o papel `dc360_app` (que não é superusuário e não é dono das
 * tabelas, senão o RLS seria ignorado) e definir a organização do contexto
 * com SET LOCAL, sempre a partir da sessão já autenticada, nunca de
 * parâmetro que veio da tela.
 *
 * Consequência prática: se alguém esquecer o `WHERE organizacao_id = ...`
 * numa consulta, o banco continua devolvendo só o município certo.
 */
export async function comoApp<T>(
  organizacaoId: string | null,
  execucao: (tx: Contexto) => Promise<T>,
): Promise<T> {
  const db = await banco();

  // `db.transaction()` e não BEGIN/COMMIT na mão: a diferença não é de estilo.
  //
  // PGlite tem UMA conexão, e `SET LOCAL` pertence à conexão, não à chamada.
  // Cada `db.exec` solto pega e solta o mutex interno da biblioteca por conta
  // própria, então duas chamadas concorrentes (o `Promise.all` do painel, por
  // exemplo) entrelaçam assim:
  //
  //   A: BEGIN
  //   B: BEGIN                   (aninhado, o Postgres só avisa)
  //   A: set_config(org = A)
  //   B: set_config(org = B)     <- sobrescreve o contexto de A
  //   A: SELECT ...              <- roda com o contexto de B
  //   B: COMMIT                  <- encerra a transação que A achava que era dela
  //   A: SELECT ...              <- agora fora de transação, de volta ao superusuário
  //
  // Os dois desfechos foram reproduzidos: dado de um município aparecendo para
  // outro, e o papel voltando de `dc360_app` para `postgres`, que ignora RLS.
  // `db.transaction()` retém o mutex do início ao fim do bloco, que é o que
  // torna o par SET LOCAL + consulta indivisível.
  /*
    Sem teto aqui, de propósito. O PGlite roda na thread principal, então
    enquanto o WebAssembly trabalha nenhum `setTimeout` dispara: um teto
    colocado neste ponto não interrompe nada e, quando chega a disparar,
    acusa de travada uma operação que ainda vai terminar. Medido no motor do
    Safari, onde uma gravação leva mais de vinte segundos e conclui. O teto
    fica só na abertura do banco, onde existe alternativa de verdade.
  */
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (organizacaoId) {
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacaoId]);
    }
    return execucao(tx);
  }) as Promise<T>;
}

/**
 * Consulta de infraestrutura, fora do contexto de tenant (a lista de contas da
 * tela de entrada). Também entra numa transação, pelo mesmo motivo: uma
 * consulta solta poderia cair dentro da transação de outra chamada.
 */
export async function semTenant<T>(execucao: (tx: Contexto) => Promise<T>): Promise<T> {
  const db = await banco();
  return db.transaction(async (tx) => execucao(tx)) as Promise<T>;
}

export async function recriarBanco(): Promise<void> {
  const db = await banco();
  await db.close();
  instancia = null;
  iniciando = null;
  localStorage.removeItem(MARCA_SEMENTE);
  indexedDB.deleteDatabase("/pglite/dc360");
}
