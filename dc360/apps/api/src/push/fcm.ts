import { SignJWT, importPKCS8 } from "jose";
import type { DesfechoDoEnvio, ProvedorDePush } from "./envio.js";
import type { Notificacao } from "./mensagem.js";

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
 * ESTE CAMINHO NÃO FOI EXERCITADO CONTRA O GOOGLE. Enquanto a metade
 * aplicativo não existir, mandar notificação de verdade seria barulho sem
 * valor. O que os testes cobrem é a montagem, o reaproveitamento do token e a
 * leitura da resposta, com duplo de teste no lugar da rede.
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
}) => Promise<{ status: number; text(): Promise<string> }>;

const ESCOPO = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI_PADRAO = "https://oauth2.googleapis.com/token";
const ENVIO_BASE = "https://fcm.googleapis.com/v1/projects";

/** Folga antes de o token de acesso expirar. Um minuto cobre a rodada em voo. */
const FOLGA_SEGUNDOS = 60;

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
  opcoes: { buscar?: Buscar; agora?: () => number } = {},
): ProvedorDePush {
  const agora = opcoes.agora ?? (() => Date.now());
  const buscar = opcoes.buscar ?? ((url, o) => fetch(url, o));
  const tokenUri = conta.token_uri ?? TOKEN_URI_PADRAO;

  // Em fechamento léxico, como na APNs: não existe propriedade para um
  // `console.log` derramar.
  let chaveImportada: Awaited<ReturnType<typeof importPKCS8>> | null = null;
  let acesso: string | null = null;
  let acessoExpiraEm = 0;

  async function tokenDeAcesso(): Promise<string> {
    const segundos = Math.floor(agora() / 1000);
    if (acesso && segundos < acessoExpiraEm - FOLGA_SEGUNDOS) return acesso;

    if (!chaveImportada) {
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
    }

    const afirmacao = await new SignJWT({ scope: ESCOPO })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(conta.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(segundos)
      .setExpirationTime(segundos + 3600)
      .sign(chaveImportada);

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
    async enviar(ficha: string, notificacao: Notificacao): Promise<DesfechoDoEnvio> {
      const autorizacao = await tokenDeAcesso();

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
            data: notificacao.dados,
            android: { priority: "high" },
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
