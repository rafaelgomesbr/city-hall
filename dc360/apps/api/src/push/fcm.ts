import { SignJWT, importPKCS8 } from "jose";
import type { DesfechoDoEnvio, ProvedorDePush } from "./envio.js";
import { semExtensao, toqueDoAviso, validadeDoAviso, type Notificacao } from "./mensagem.js";

/**
 * Envio direto para a FCM, a notificação do Google.
 *
 * Vale aqui a mesma regra da Apple, e pelo mesmo motivo: a conta de serviço do
 * Firebase autoriza mandar notificação para QUALQUER aparelho do projeto. Ela
 * é lida uma vez, na partida, e o conteúdo nunca vai para log nem para
 * mensagem de erro.
 *
 * A diferença técnica em relação à Apple é o caminho da credencial. A Apple
 * aceita o JWT assinado direto; o Google exige trocar o JWT por um token de
 * acesso de vida curta, numa chamada a mais. O token trocado também é
 * reaproveitado, pela mesma razão de sempre: uma troca por notificação
 * transformaria uma rajada de avisos numa rajada de autenticações.
 *
 * ESTE CAMINHO FOI EXERCITADO CONTRA O GOOGLE em 13/09/2026, por
 * `scripts/conferir-push.mjs`: com a conta de serviço de verdade e uma ficha
 * de aparelho deliberadamente falsa, a FCM respondeu `404 UNREGISTERED`, que
 * é a resposta de quem aceitou a credencial e não achou o aparelho. O que
 * continua sem prova é a metade que exige um telefone: a notificação chegando
 * à tela de um aparelho registrado. O que os testes cobrem é a montagem, o
 * reaproveitamento do token e a leitura da resposta, com duplo de teste no
 * lugar da rede.
 */

export type ContaDeServico = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type Buscar = (url: string, opcoes: {
  method: string;
  headers: Record<string, string>;
  body: string;
  /**
   * Existe para o `fetch` real conseguir DERRUBAR a conexão no estouro do
   * tempo, e não só desistir de esperar por ela. Duplo de teste ignora.
   */
  signal?: AbortSignal;
}) => Promise<{ status: number; text(): Promise<string> }>;

const ESCOPO = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI_PADRAO = "https://oauth2.googleapis.com/token";
const ENVIO_BASE = "https://fcm.googleapis.com/v1/projects";

/** Folga antes de o token de acesso expirar. Um minuto cobre a rodada em voo. */
const FOLGA_SEGUNDOS = 60;

/**
 * Teto por chamada ao Google, nos MESMOS dez segundos do caminho da Apple.
 *
 * O DEFEITO QUE ISTO FECHA foi reproduzido e é do tipo que não acende nenhuma
 * luz. O `fetch` global do Node NÃO tem tempo limite: se o servidor do outro
 * lado aceita a conexão e para de responder, que é o modo de falha comum de
 * rede móvel e de balanceador saturado, o `await` simplesmente nunca retorna.
 *
 * O que isso custa não é uma notificação. O varredor segura uma trava de aviso
 * do Postgres durante a rodada e só a solta no `finally`; com o `await` preso
 * para sempre, o `finally` nunca roda, a trava nunca é solta, e a OUTRA
 * máquina do Fly desiste de todas as rodadas seguintes. O aviso de prazo para
 * de sair do produto inteiro, nas duas máquinas, sem uma linha de log, sem
 * falha de health check e sem alerta, até alguém reimplantar por outro motivo.
 *
 * Vale para as DUAS chamadas: a troca do token de acesso e o envio. A troca é
 * a mais perigosa das duas, porque ela acontece uma vez e prende a rodada
 * inteira antes de a primeira notificação sequer ser tentada.
 */
const TEMPO_LIMITE_PADRAO_MS = 10_000;

/**
 * Põe teto de tempo em qualquer `Buscar`, inclusive num duplo de teste.
 *
 * Duas defesas, e as duas precisam existir. O `signal` faz o `fetch` real
 * abortar a conexão, liberando o socket; a corrida com o temporizador garante
 * que a promessa RESOLVA mesmo quando quem está do outro lado ignora o sinal,
 * que é o caso de qualquer implementação que não seja o `fetch`.
 *
 * `unref()` no temporizador porque um relógio vivo segura o processo em pé no
 * encerramento, e o deploy passaria a esperar o tempo limite para trocar de
 * versão.
 */
export function comTempoLimite(buscar: Buscar, tempoLimiteMs: number): Buscar {
  return async (url, opcoes) => {
    const controle = new AbortController();
    let estourou: (() => void) | null = null;
    const relogio = setTimeout(() => {
      controle.abort();
      estourou?.();
    }, tempoLimiteMs);
    if (typeof relogio.unref === "function") relogio.unref();

    const limite = new Promise<never>((_, rejeitar) => {
      estourou = () => rejeitar(new Error(
        `o Google nao respondeu no tempo limite de ${tempoLimiteMs} ms`,
      ));
    });

    try {
      return await Promise.race([buscar(url, { ...opcoes, signal: controle.signal }), limite]);
    } finally {
      clearTimeout(relogio);
    }
  };
}

/**
 * Lê a conta de serviço a partir do texto do arquivo JSON.
 *
 * Separado do provedor de propósito: assim a partida falha alto, com uma
 * mensagem que diz o que fazer, em vez de o primeiro envio falhar meia hora
 * depois com "cannot read property of undefined".
 */
export function lerContaDeServico(conteudo: string, caminho: string): ContaDeServico {
  let analisado: unknown;
  try {
    analisado = JSON.parse(conteudo);
  } catch {
    throw new Error(
      `O arquivo de conta de serviço do Firebase em ${caminho} não é um JSON válido. ` +
      "Ele é o que sai de Configurações do projeto, Contas de serviço, Gerar nova chave privada.",
    );
  }
  const conta = analisado as Partial<ContaDeServico>;
  for (const campo of ["project_id", "client_email", "private_key"] as const) {
    if (typeof conta[campo] !== "string" || conta[campo]!.length === 0) {
      throw new Error(
        `O arquivo de conta de serviço do Firebase em ${caminho} não tem o campo ${campo}. ` +
        "Confira se não é o `google-services.json`, que é outro arquivo e não serve para enviar.",
      );
    }
  }
  return conta as ContaDeServico;
}

export function criarProvedorFcm(
  conta: ContaDeServico,
  opcoes: { buscar?: Buscar; agora?: () => number; tempoLimiteMs?: number } = {},
): ProvedorDePush {
  const agora = opcoes.agora ?? (() => Date.now());
  /*
    O teto envolve TAMBÉM o `buscar` injetado, e não só o `fetch` global.

    Se ele valesse apenas no caminho de produção, a única forma de exercitar a
    defesa seria uma chamada de verdade ao Google, ou seja, ela nunca seria
    exercitada, e uma defesa que nenhum teste roda é uma defesa que mente sobre
    existir. É a mesma razão pela qual o `redact` do log deixou de ser
    desligado em teste.
  */
  const buscar = comTempoLimite(
    opcoes.buscar ?? ((url, o) => fetch(url, o)),
    opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS,
  );
  const tokenUri = conta.token_uri ?? TOKEN_URI_PADRAO;

  // Em fechamento léxico, como na APNs: não existe propriedade para um
  // `console.log` derramar.
  let chaveImportada: Awaited<ReturnType<typeof importPKCS8>> | null = null;
  let acesso: string | null = null;
  let acessoExpiraEm = 0;

  /** Importa a chave uma vez. `validar()` chama na partida; o envio, se ela não tiver chamado. */
  async function chave(): Promise<Awaited<ReturnType<typeof importPKCS8>>> {
    if (chaveImportada) return chaveImportada;
    try {
      chaveImportada = await importPKCS8(conta.private_key, "RS256");
    } catch {
      // A exceção original é engolida pela mesma razão que na APNs: ela vem
      // de biblioteca de terceiro e pode citar o material da chave.
      throw new Error(
        "A chave privada da conta de serviço do Firebase (FCM_CONTA_SERVICO) não é válida. " +
        "Gere outra em Configurações do projeto, Contas de serviço.",
      );
    }
    return chaveImportada;
  }

  async function tokenDeAcesso(): Promise<string> {
    const segundos = Math.floor(agora() / 1000);
    if (acesso && segundos < acessoExpiraEm - FOLGA_SEGUNDOS) return acesso;

    const chaveImportadaAgora = await chave();

    const afirmacao = await new SignJWT({ scope: ESCOPO })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(conta.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(segundos)
      .setExpirationTime(segundos + 3600)
      .sign(chaveImportadaAgora);

    const resposta = await buscar(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: afirmacao,
      }).toString(),
    });

    const corpo = await resposta.text();
    if (resposta.status !== 200) {
      // O corpo NÃO entra na mensagem: numa troca de credencial, o que volta
      // do outro lado costuma repetir parte do que foi enviado.
      throw new Error(`o Google recusou a conta de serviço (${resposta.status})`);
    }

    const dados = JSON.parse(corpo) as { access_token?: string; expires_in?: number };
    if (!dados.access_token) throw new Error("o Google nao devolveu token de acesso");

    acesso = dados.access_token;
    acessoExpiraEm = segundos + (dados.expires_in ?? 3600);
    return acesso;
  }

  return {
    // Só a chave. A troca pelo token de acesso fica para o primeiro envio,
    // porque ela é uma chamada de rede, e partida não pode depender de rede.
    async validar() {
      await chave();
    },

    async enviar(ficha: string, notificacao: Notificacao): Promise<DesfechoDoEnvio> {
      const autorizacao = await tokenDeAcesso();

      /*
        DESPACHO TOCA SEMPRE, NO CANAL DE DESPACHO; PRAZO VAI POR SEVERIDADE.
        A regra mora em `toqueDoAviso` (`mensagem.ts`), junto com o porquê, e
        é a mesma da APNs. Aqui só se traduz para o vocabulário do Google.
      */
      const toque = toqueDoAviso(notificacao);

      const resposta = await buscar(`${ENVIO_BASE}/${conta.project_id}/messages:send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${autorizacao}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: ficha,
            // `notification` é a vitrine, `data` é o detalhe que só o
            // aplicativo lê. Ver `mensagem.ts`.
            notification: { title: notificacao.titulo, body: notificacao.corpo },
            /*
              O CANAL VAI EM DOIS LUGARES, e os dois são necessários.

              O aplicativo declara três canais (despacho, urgência e comum), e
              quem escolhe entre eles é a MENSAGEM, não o aplicativo. Só que
              quem DESENHA a notificação no Android muda conforme o estado do
              aplicativo, e cada desenhista lê o canal de um lugar:

              - Aplicativo aberto: o `expo-notifications` desenha, e lê
                `remoteMessage.notification?.channelId ?: remoteMessage.data["channelId"]`.
              - Aplicativo fechado ou em segundo plano: o SDK do Firebase
                desenha, antes de qualquer código nosso rodar, e lê
                `android.notification.channel_id`.

              Na ausência do que cada um lê, os dois jogam tudo no canal
              padrão do manifesto, que é o silencioso. Ou seja, sem QUALQUER
              uma das duas linhas o despacho chega mudo em metade dos casos, e
              ninguém vê erro em lugar nenhum.

              Os nomes casam com os declarados em apps/campo. Se um dia
              divergirem, o Android cai no canal padrão em silêncio, então
              existe teste comparando os dois lados.
            */
            data: {
              ...notificacao.dados,
              channelId: toque.canal,
            },
            android: {
              /*
                `priority: high` é a prioridade de ENTREGA: acorda o aparelho
                em economia de bateria para a mensagem chegar agora. Vale para
                todo aviso, como já valia.
              */
              priority: "high",
              /*
                Por quanto tempo o Google guarda a mensagem para um aparelho
                fora do ar. Sem declarar, são quatro semanas: um despacho de
                segunda entregue na quarta seguinte, sobre uma tarefa que já
                foi feita por outro, é o que ensina o agente a ignorar o
                canal. A regra é a mesma da Apple e mora em `validadeDoAviso`;
                o formato é o do Google, segundos com o sufixo.
              */
              ttl: `${Math.max(0, validadeDoAviso(notificacao, agora()) - Math.floor(agora() / 1000))}s`,
              notification: {
                channel_id: toque.canal,
                /*
                  `sound` e `notification_priority` só no despacho. No
                  Android 8 em diante o canal decide som e importância, e
                  estes dois campos são o que vale em aparelho anterior ao 8
                  e o que documenta a intenção na própria mensagem. O som é
                  o nome do recurso em `res/raw`, sem extensão: o Firebase
                  procura `despacho`, não `despacho.wav`.
                */
                ...(toque.som && toque.som !== "default"
                  ? { sound: semExtensao(toque.som) }
                  : {}),
                ...(toque.canal === "dc360.despacho.v1"
                  ? { notification_priority: "PRIORITY_MAX" }
                  : {}),
              },
            },
          },
        }),
      });

      const corpo = await resposta.text();
      if (resposta.status === 200) return { desfecho: "entregue", detalhe: null };

      const codigo = codigoDoGoogle(corpo);
      /*
        SÓ `UNREGISTERED` e `NOT_FOUND` revogam o aparelho.

        `INVALID_ARGUMENT` fica de fora de propósito, porque ele tanto significa
        "essa ficha está malformada" quanto "o corpo que você mandou está
        errado". Tratar o segundo caso como ficha morta faria um defeito nosso
        de montagem de payload revogar, em silêncio e de uma vez, o aparelho de
        todos os agentes de todos os municípios.
      */
      const morta = codigo === "UNREGISTERED" || codigo === "NOT_FOUND";
      return {
        desfecho: morta ? "ficha_invalida" : "falha",
        detalhe: `fcm ${resposta.status}${codigo ? ` ${codigo}` : ""}`,
      };
    },
  };
}

/** O erro do Google vem em `error.status` e, quando específico, em `details`. */
function codigoDoGoogle(corpo: string): string | null {
  if (!corpo) return null;
  try {
    const analisado = JSON.parse(corpo) as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    };
    const detalhado = analisado.error?.details?.find((d) => typeof d.errorCode === "string");
    return detalhado?.errorCode ?? analisado.error?.status ?? null;
  } catch {
    return null;
  }
}
