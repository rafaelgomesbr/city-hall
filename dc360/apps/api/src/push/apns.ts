import { connect, constants, type ClientHttp2Session } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import type { DesfechoDoEnvio, ProvedorDePush } from "./envio.js";
import { toqueDoAviso, type Notificacao } from "./mensagem.js";

/**
 * Envio direto para a APNs, a notificação da Apple.
 *
 * A CHAVE `.p8` É O ATIVO MAIS PERIGOSO DESTE SERVIDOR, e é por isso que este
 * arquivo tem mais regra do que código. Ela não é a chave de um aplicativo: ela
 * assina notificação para QUALQUER aplicativo do time de desenvolvimento. Quem
 * a obtém escreve na tela bloqueada de um agente de Defesa Civil, e uma ordem
 * falsa de evacuação escrita ali é dano real na rua, com pessoas saindo de casa
 * de madrugada.
 *
 * As três regras que decorrem disso, e que este arquivo cumpre:
 *
 *   1. A chave é lida do disco UMA VEZ, na partida (ver `index.ts`), e chega
 *      aqui já como texto. Este módulo nunca abre arquivo, nunca recebe
 *      caminho, e nunca coloca o conteúdo dela em mensagem de erro: o que sai
 *      de erro daqui nomeia o problema, não o material.
 *   2. O token JWT é REAPROVEITADO. A Apple recusa quem gera um por
 *      requisição, com `TooManyProviderTokenUpdates`, e recusa quem usa um
 *      token com mais de uma hora, com `ExpiredProviderToken`. Os dois lados
 *      são armadilha, e o meio termo está nas constantes abaixo.
 *   3. Falha de envio não sobe como exceção para quem chamou: ela vira
 *      desfecho. Ver `envio.ts`.
 */

export type CredenciaisApns = {
  /** Identificador da chave, os dez caracteres do nome do arquivo `.p8`. */
  keyId: string;
  /** Identificador do time no portal da Apple. */
  teamId: string;
  /** O `bundle` do aplicativo, que vira o `apns-topic`. */
  bundle: string;
  /**
   * Conteúdo do `.p8`, já lido do disco. É texto, e não caminho, de propósito:
   * assim existe um lugar só, na partida, que toca o disco, e este módulo não
   * tem como espalhar leitura de segredo pelo código.
   */
  chavePem: string;
};

export type RespostaDoProvedor = { status: number; corpo: string };

export type TransporteApns = (pedido: {
  caminho: string;
  cabecalhos: Record<string, string>;
  corpo: string;
}) => Promise<RespostaDoProvedor>;

/**
 * A Apple invalida token com mais de uma hora. Renovar aos cinquenta minutos
 * deixa dez minutos de folga para relógio fora de sincronia e para a rodada de
 * envio que começou antes da virada.
 */
const RENOVAR_APOS_SEGUNDOS = 50 * 60;

/** Endereço de produção da APNs. O de teste é `api.sandbox.push.apple.com`. */
export const APNS_PRODUCAO = "https://api.push.apple.com";
export const APNS_TESTE = "https://api.sandbox.push.apple.com";

/**
 * Recusas que significam "este aparelho não existe mais", e não "tente de
 * novo". Insistir nelas é gastar tentativa contra um destino que não volta:
 * reinstalar o aplicativo troca a ficha, e a antiga morre para sempre.
 */
const FICHA_MORTA = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

export function criarProvedorApns(
  credenciais: CredenciaisApns,
  opcoes: {
    transporte?: TransporteApns;
    urlBase?: string;
    /** Injeção de relógio, para o teste conseguir atravessar a hora. */
    agora?: () => number;
  } = {},
): ProvedorDePush {
  const agora = opcoes.agora ?? (() => Date.now());
  const transporte = opcoes.transporte
    ?? transporteApnsHttp2(opcoes.urlBase ?? APNS_PRODUCAO);

  /*
    Chave importada e token ficam em fechamento léxico, e não em campo de
    objeto exportado: não há como um `console.log(provedor)` derramar a chave
    privada no log do servidor, porque não existe propriedade para imprimir.
  */
  let chaveImportada: Awaited<ReturnType<typeof importPKCS8>> | null = null;
  let token: string | null = null;
  let tokenEmitidoEm = 0;

  async function tokenDeProvedor(): Promise<string> {
    const segundos = Math.floor(agora() / 1000);
    if (token && segundos - tokenEmitidoEm < RENOVAR_APOS_SEGUNDOS) return token;

    if (!chaveImportada) {
      try {
        chaveImportada = await importPKCS8(credenciais.chavePem, "ES256");
      } catch {
        /*
          A exceção original é engolida de propósito. Ela vem de biblioteca de
          terceiro, e biblioteca de terceiro que tropeça em material
          criptográfico às vezes cita o material na mensagem. Este erro sobe
          na partida, para o arranque falhar alto, e o que ele diz é o que se
          pode fazer a respeito.
        */
        throw new Error(
          "A chave de push da Apple (APNS_CHAVE) não é uma chave ES256 válida. " +
          "Confira se o arquivo é o `.p8` baixado do portal da Apple, inteiro, " +
          "com as linhas BEGIN e END PRIVATE KEY.",
        );
      }
    }

    token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: credenciais.keyId })
      .setIssuer(credenciais.teamId)
      .setIssuedAt(segundos)
      .sign(chaveImportada);
    tokenEmitidoEm = segundos;
    return token;
  }

  return {
    async enviar(ficha: string, notificacao: Notificacao): Promise<DesfechoDoEnvio> {
      const autorizacao = await tokenDeProvedor();

      /*
        A vitrine vai em `aps.alert`, e é o que a Apple mostra na tela
        bloqueada. O detalhe vai ao lado, fora do `aps`, e é o que só o
        aplicativo lê. Ver `mensagem.ts` para por que a separação existe.
      */
      /*
        DESPACHO TOCA SEMPRE, COM O SOM DE DESPACHO; PRAZO TOCA POR SEVERIDADE.

        A regra mora em `toqueDoAviso` (`mensagem.ts`), junto com o porquê, e
        é a mesma que o FCM aplica. Aqui só se traduz para o vocabulário da
        Apple: `aps.sound` é o nome do arquivo no bundle do aplicativo
        (declarado em `apps/campo/app.config.ts`), `"default"` é o som do
        sistema, e a ausência da chave é silêncio.
      */
      const toque = toqueDoAviso(notificacao);

      const corpo = JSON.stringify({
        aps: {
          alert: { title: notificacao.titulo, body: notificacao.corpo },
          ...(toque.som ? { sound: toque.som } : {}),
          /*
            `interruption-level` é o que faz a notificação furar o Foco e o Não
            Perturbe do iOS. `time-sensitive` para o que é urgente (todo
            despacho, e o prazo alto ou crítico), e o padrão `active` para o
            resto. Sem isso, o agente com Foco ligado no plantão noturno não vê
            o aviso.

            `time-sensitive` só vale com o direito
            `com.apple.developer.usernotifications.time-sensitive` no binário
            (`apps/campo/app.config.ts`, `ios.entitlements`). Sem o direito a
            Apple entrega e o iOS rebaixa para `active` em silêncio.
          */
          "interruption-level": toque.urgente ? "time-sensitive" : "active",
        },
        ...notificacao.dados,
      });

      const resposta = await transporte({
        caminho: `/3/device/${ficha}`,
        cabecalhos: {
          authorization: `bearer ${autorizacao}`,
          "apns-topic": credenciais.bundle,
          "apns-push-type": "alert",
          // Prioridade 10 entrega na hora. Aviso de prazo de vistoria é o caso
          // em que isso se justifica: chegar meia hora depois é não chegar.
          "apns-priority": "10",
          "content-type": "application/json",
        },
        corpo,
      });

      if (resposta.status === 200) return { desfecho: "entregue", detalhe: null };

      const razao = razaoDaApple(resposta.corpo);
      const morta = resposta.status === 410 || (razao !== null && FICHA_MORTA.has(razao));
      return {
        desfecho: morta ? "ficha_invalida" : "falha",
        detalhe: `apns ${resposta.status}${razao ? ` ${razao}` : ""}`,
      };
    },
  };
}

/** A Apple responde `{"reason":"BadDeviceToken"}`. Corpo vazio no sucesso. */
function razaoDaApple(corpo: string): string | null {
  if (!corpo) return null;
  try {
    const analisado: unknown = JSON.parse(corpo);
    const razao = (analisado as { reason?: unknown }).reason;
    return typeof razao === "string" ? razao : null;
  } catch {
    // Corpo que não é JSON é caso de proxy no meio do caminho respondendo por
    // conta própria. O status já diz o suficiente.
    return null;
  }
}

/**
 * A APNs SÓ FALA HTTP/2, e é por isso que este transporte não usa `fetch`.
 *
 * O `fetch` do Node fala HTTP/1.1, e contra a Apple ele nem chega a errar de
 * um jeito compreensível. Daí `node:http2`, com a sessão reaproveitada entre
 * envios: abrir conexão nova por notificação é o que faz o envio em rajada,
 * numa noite de temporal, virar centenas de negociações de TLS seguidas.
 *
 * ESTE CAMINHO NÃO FOI EXERCITADO CONTRA A APPLE, e a limitação é deliberada:
 * enquanto a metade aplicativo não existir, mandar notificação de verdade para
 * um telefone seria barulho sem valor. Os testes usam duplo de teste, e o que
 * está provado é a montagem do token, o reaproveitamento dele e a leitura da
 * resposta.
 */
export function transporteApnsHttp2(
  urlBase: string,
  opcoes: { tempoLimiteMs?: number } = {},
): TransporteApns {
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? 10_000;
  let sessao: ClientHttp2Session | null = null;

  function sessaoViva(): ClientHttp2Session {
    if (sessao && !sessao.closed && !sessao.destroyed) return sessao;
    const nova = connect(urlBase);
    /*
      Sem este ouvinte, um erro de socket na sessão HTTP/2 vira exceção não
      tratada e DERRUBA O PROCESSO INTEIRO. A API cairia por causa de uma
      instabilidade de rede com a Apple, no meio de uma noite de chuva, e o
      agente em campo perderia a sincronização da vistoria por causa de uma
      notificação que não saiu.
    */
    nova.on("error", () => { sessao = null; });
    nova.on("close", () => { sessao = null; });
    sessao = nova;
    return nova;
  }

  return (pedido) => new Promise<RespostaDoProvedor>((resolver, rejeitar) => {
    let requisicao;
    try {
      requisicao = sessaoViva().request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: pedido.caminho,
        ...pedido.cabecalhos,
      });
    } catch (erro) {
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
      return;
    }

    let status = 0;
    let corpo = "";
    requisicao.setTimeout(tempoLimiteMs, () => {
      requisicao.close(constants.NGHTTP2_CANCEL);
      rejeitar(new Error("a APNs nao respondeu no tempo limite"));
    });
    requisicao.on("response", (cabecalhos) => {
      status = Number(cabecalhos[constants.HTTP2_HEADER_STATUS] ?? 0);
    });
    requisicao.setEncoding("utf8");
    requisicao.on("data", (parte: string) => { corpo += parte; });
    requisicao.on("end", () => resolver({ status, corpo }));
    requisicao.on("error", (erro) => rejeitar(erro));
    requisicao.end(pedido.corpo);
  });
}
