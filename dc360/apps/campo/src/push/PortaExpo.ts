import { Linking, Platform } from "react-native";
import * as Notificacoes from "expo-notifications";

import type { AvisoLocal } from "./aviso-local";
import { type DefinicaoDeCanal } from "./canais";
import type { EstadoDaPermissao } from "./permissao";
import type { Apresentacao, AvisoBruto, PortaDePush } from "./porta";

/**
 * A porta de verdade, sobre o `expo-notifications`.
 *
 * Este arquivo é DE PROPÓSITO o mais burro do diretório: cada função é uma
 * chamada ao módulo nativo e nenhuma decisão de negócio mora aqui. Ele é o
 * único pedaço da notificação que não roda no jest (o módulo nativo não existe
 * fora do aparelho), então tudo o que puder ser decidido fora dele foi decidido
 * fora dele. Onde não há decisão, não há defeito escondido.
 *
 * A regra prática para revisar este arquivo: se alguém acrescentar aqui um
 * `if` sobre município, severidade ou sessão, está no lugar errado. Município é
 * em `aviso.ts`, severidade é em `canais.ts`, sessão é no provedor.
 */

/**
 * O dado bruto, montado a partir dos DOIS lugares onde ele pode estar.
 *
 * `content.data` é o que o `expo-notifications` normaliza, e o gatilho guarda a
 * carga original como o servidor da loja a entregou: no iOS o objeto inteiro do
 * APNs (com `aps` e o detalhe ao lado dele), no Android a mensagem remota do
 * FCM. Os dois são passados adiante e `lerAviso` procura nos dois.
 *
 * Ler só um dos lados foi considerado e descartado: seria escolher uma das
 * lojas para ter a terceira barreira e deixar a outra sem, e o aparelho que
 * fica sem a barreira é justamente o que vaza aviso de outro município.
 */
function bruteza(notificacao: Notificacoes.Notification): unknown {
  const gatilho = notificacao.request.trigger as
    | { payload?: unknown; remoteMessage?: { data?: unknown } }
    | null;
  return {
    data: notificacao.request.content.data,
    body: gatilho?.payload ?? gatilho?.remoteMessage?.data ?? null,
  };
}

function comoAvisoBruto(notificacao: Notificacoes.Notification): AvisoBruto {
  return { identificador: notificacao.request.identifier, bruto: bruteza(notificacao) };
}

/**
 * Traduz a resposta do sistema para os quatro estados que o produto conhece.
 *
 * `granted` primeiro, e não `status === "granted"`, porque no iOS existe
 * autorização provisória: ela concede a entrega silenciosa sem nunca ter
 * mostrado caixa nenhuma, e `status` volta como `undetermined`. Lida pelo
 * `status`, essa pessoa receberia o convite deste aplicativo para ligar uma
 * coisa que já está ligada.
 */
function traduzirPermissao(r: Notificacoes.NotificationPermissionsStatus): EstadoDaPermissao {
  if (r.granted) return "concedida";
  if (r.status === "undetermined") return "nao_perguntada";
  return "negada";
}

const IMPORTANCIA: Record<DefinicaoDeCanal["importancia"], Notificacoes.AndroidImportance> = {
  /*
    MAX para o despacho, e só para ele: é a insistência de uma chamada
    telefônica, que a régua do próprio Android reserva ao que exige resposta
    imediata da pessoa. Uma equipe sendo mandada a campo é isso. O prazo não é.
  */
  maxima: Notificacoes.AndroidImportance.MAX,
  /*
    HIGH para o prazo urgente: toca, vibra e mostra o aviso por cima da tela,
    sem a insistência de chamada.
  */
  alta: Notificacoes.AndroidImportance.HIGH,
  /*
    LOW e não DEFAULT. DEFAULT toca. LOW é o degrau que entrega a notificação na
    aba, sem som e sem interromper, que é exatamente o que "canal comum" quer
    dizer. Escrever DEFAULT aqui faria a severidade baixa tocar de madrugada, que
    é o defeito inteiro que a separação em canais existe para evitar.
  */
  baixa: Notificacoes.AndroidImportance.LOW,
};

export const portaExpo: PortaDePush = {
  plataforma:
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "outra",

  async consultarPermissao(): Promise<EstadoDaPermissao> {
    try {
      return traduzirPermissao(await Notificacoes.getPermissionsAsync());
    } catch {
      return "indisponivel";
    }
  },

  async pedirPermissao(): Promise<EstadoDaPermissao> {
    try {
      return traduzirPermissao(
        await Notificacoes.requestPermissionsAsync({
          /*
            Sem `provisional`, sem `criticalAlert` e sem `announcement`. Alerta
            crítico exige direito concedido pela Apple caso a caso e fura o modo
            silencioso do aparelho: pedir sem ter o direito faz a chamada
            inteira falhar, e o agente ficaria sem nenhuma permissão em vez de
            ficar sem a especial.
          */
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        }),
      );
    } catch {
      return "indisponivel";
    }
  },

  async abrirAjustes(): Promise<void> {
    await Linking.openSettings().catch(() => undefined);
  },

  async prepararCanais(canais: readonly DefinicaoDeCanal[]): Promise<void> {
    if (Platform.OS !== "android") return;
    for (const canal of canais) {
      await Notificacoes.setNotificationChannelAsync(canal.id, {
        name: canal.nome,
        description: canal.descricao,
        importance: IMPORTANCIA[canal.importancia],
        /*
          `null` é silêncio de verdade no Android; `"default"` é o som do
          sistema; um nome de arquivo é resolvido em `res/raw` pelo próprio
          `expo-notifications` (ele tira a extensão). Quem decide é
          `canais.ts`; aqui só se traduz.
        */
        sound: canal.som,
        enableVibrate: canal.vibracao !== null,
        vibrationPattern: canal.vibracao ? [...canal.vibracao] : null,
        /*
          `bypassDnd` NÃO é passado, e a ausência é decisão: furar o "Não
          perturbe" é escolha da pessoa, nos ajustes do canal, e não do
          aplicativo. Ver `canais.ts`.
        */
        /*
          A vitrine já é genérica (ver `push/mensagem.ts` na API), então mostrar
          na tela bloqueada não entrega endereço de família nenhuma. Deixar
          `SECRET` esconderia justamente o aviso que existe para ser visto sem
          destravar o aparelho, no bolso, na chuva.
        */
        lockscreenVisibility: Notificacoes.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
      }).catch(() => undefined);
    }
  },

  async obterFicha(): Promise<string | null> {
    /*
      `getDevicePushTokenAsync`, e NUNCA `getExpoPushTokenAsync`.

      O segundo devolve a ficha do serviço de push da Expo, que é um
      intermediário a mais entre a Defesa Civil e o aparelho do agente. Este
      produto fala direto com a Apple e com o Google (ver `push/apns.ts` e
      `push/fcm.ts` na API), e `docs/SUBPROCESSADORES.md` lista exatamente esses
      dois. Trocar por aqui acrescentaria um subprocessador que não está no
      documento assinado, e a ficha nem seria entendida pelo servidor.
    */
    const ficha = await Notificacoes.getDevicePushTokenAsync();
    return typeof ficha.data === "string" && ficha.data !== "" ? ficha.data : null;
  },

  definirApresentacao(decidir: (bruto: unknown) => Apresentacao): void {
    Notificacoes.setNotificationHandler({
      handleNotification: async (notificacao) => {
        const decisao = decidir(bruteza(notificacao));
        return {
          shouldShowBanner: decisao.mostrar,
          shouldShowList: decisao.mostrar,
          shouldPlaySound: decisao.som,
          /*
            O contador do ícone acompanha a apresentação, e essa amarração é o
            que impede o descarte de vazar por outro caminho: um aviso de outro
            município que não aparece mas soma no contador contaria, ao agente
            de B, que existe trabalho em A. Ver `aviso.ts`.
          */
          shouldSetBadge: decisao.mostrar,
        };
      },
    });
  },

  async avisarLocalmente(aviso: AvisoLocal): Promise<void> {
    await Notificacoes.scheduleNotificationAsync({
      content: {
        title: aviso.titulo,
        body: aviso.corpo,
        data: aviso.dados,
        /*
          No iOS o som é o arquivo do bundle (o mesmo que o servidor pede no
          `aps`). No Android 8 em diante este campo é ignorado: quem decide o
          som é o canal, e o canal vai no gatilho abaixo. `vibrate` e
          `priority` são o mesmo caso: valem só em Android anterior ao 8, onde
          não existe canal, e no resto é o canal que manda.
        */
        sound: aviso.som,
        vibrate: [...aviso.vibracao],
        priority: Notificacoes.AndroidNotificationPriority.MAX,
        /*
          Sensível ao tempo, como o push de despacho. Só tem efeito com o
          direito `com.apple.developer.usernotifications.time-sensitive` no
          binário (ver `app.config.ts`); sem ele o iOS rebaixa para `active`.
        */
        interruptionLevel: "timeSensitive",
      },
      /*
        Gatilho nulo é "agora". No Android o gatilho carrega o canal, porque é
        assim que o `expo-notifications` escolhe em qual canal a notificação
        local entra; no iOS não existe canal e o objeto seria ignorado.
      */
      trigger: Platform.OS === "android" ? { channelId: aviso.canal } : null,
    }).catch(() => undefined);
  },

  aoTocar(ouvinte: (aviso: AvisoBruto) => void): () => void {
    const inscricao = Notificacoes.addNotificationResponseReceivedListener((resposta) => {
      ouvinte(comoAvisoBruto(resposta.notification));
    });
    return () => { inscricao.remove(); };
  },

  async avisoQueAbriuOAplicativo(): Promise<AvisoBruto | null> {
    const resposta = await Notificacoes.getLastNotificationResponseAsync().catch(() => null);
    return resposta ? comoAvisoBruto(resposta.notification) : null;
  },

  async listarNaBandeja(): Promise<AvisoBruto[]> {
    const presentes = await Notificacoes.getPresentedNotificationsAsync().catch(() => []);
    return presentes.map(comoAvisoBruto);
  },

  async removerDaBandeja(identificador: string): Promise<void> {
    await Notificacoes.dismissNotificationAsync(identificador).catch(() => undefined);
  },
};
