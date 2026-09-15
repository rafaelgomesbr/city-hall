import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * O RETORNO TÁTIL, e por que uma dependência nova entrou para ter isto.
 *
 * A régua deste projeto para dependência nova está escrita em `ui/icones.tsx`,
 * e ela é alta: três traçados de SVG custam menos que um pacote novo com o
 * ciclo de versão dele, e o aplicativo já perdeu uma tarde por
 * incompatibilidade transitiva. `expo-haptics` entrou mesmo assim, e o
 * argumento é que ele não tem substituto escrito à mão:
 *
 * - O motor tátil é API NATIVA. Não dá para desenhar, como se desenhou o
 *   conjunto de ícones. Ou a ponte existe, ou o canal não existe.
 * - `Vibration` do React Native, que já está aqui e custaria zero, é o
 *   CONTRÁRIO do que se quer: no iOS ele dispara a vibração longa do aparelho
 *   inteiro. O pedido é discreto; a alternativa grátis é um susto.
 * - É módulo de primeira linha do mesmo SDK dos outros quatorze `expo-*` deste
 *   aplicativo, com o mesmo ciclo de versão. `npm audit` de runtime continuou
 *   em zero e o aplicativo não ganhou nenhuma advisory nova (oito antes, oito
 *   depois, as mesmas duas aceitas).
 * - O custo real não é a árvore de pacotes, é que módulo nativo exige
 *   `expo prebuild` e uma compilação nova antes de chegar ao aparelho. Essa
 *   compilação já é obrigatória nesta parte do roadmap, e a pasta `ios/` deste
 *   projeto é gerada e não versionada. Fica DECLARADO: a regeneração de `ios/`
 *   foi o que esvaziou o `entitlements` e quase matou o push uma vez, e por
 *   isso existe portão para aquele arquivo. Ele precisa passar depois do
 *   prebuild.
 *
 * ## O QUE VIBRA, E O QUE NUNCA VIBRA
 *
 * Quatro momentos com a mesma forma: algo que o agente fez terminou de dar
 * certo, e ele pode não estar olhando para a tela. Fotografia capturada,
 * assinatura confirmada, vistoria concluída, fila esvaziada.
 *
 * E um quinto, de forma diferente, que entrou em 15/09/2026: algo CHEGOU DE
 * FORA. A coordenação despachou uma ocorrência para a equipe, e o aplicativo
 * aberto descobriu isso na atualização da lista (ver `push/ProvedorDePush.tsx`).
 * É o único momento em que a discrição não é o pedido: o pedido é ser
 * sentido no bolso, e por isso ele é o toque mais pesado desta porta.
 *
 * **Erro não vibra. Sem exceção.** Vibrar quando algo dá errado é punição, não
 * informação: o aparelho pune a mão de quem já está tendo um problema, e o que
 * a pessoa aprende com isso é a desligar o retorno tátil inteiro, levando
 * junto os quatro momentos em que ele ajuda. Erro se diz com palavra na tela,
 * que é onde o agente consegue ler o que fazer a respeito.
 *
 * ## O AJUSTE DE ACESSIBILIDADE, e o achado que decidiu o código do Android
 *
 * No iOS, `impactAsync` e `notificationAsync` passam por `UIFeedbackGenerator`,
 * e o sistema suprime sozinho quando a pessoa desliga "Vibração do sistema".
 * Não há nada a perguntar.
 *
 * No Android é diferente, e a leitura do módulo mostrou o porquê: lá
 * `impactAsync` e `notificationAsync` chamam `Vibrator` DIRETO, que ignora a
 * preferência de retorno tátil do sistema. Quem desligou continuaria sentindo.
 * Só `performAndroidHapticsAsync` passa por `View.performHapticFeedback`, que é
 * o caminho que respeita o ajuste. Por isso este arquivo tem dois caminhos por
 * plataforma: não é capricho, é o único jeito de obedecer à pessoa nos dois
 * aparelhos.
 *
 * **Nada disto foi sentido num aparelho.** Os testes provam qual chamada sai
 * para qual momento e em qual plataforma; se o motor tátil responde, e como
 * ele responde, só o iPhone na mão diz.
 */

/** Os momentos que ganham retorno tátil, nomeados pelo que aconteceu. */
export type MomentoTatil =
  /** Algo curto pegou: a foto foi capturada, o traço foi aceito. */
  | "confirmado"
  /** Um trabalho terminou: a vistoria foi concluída, a fila zerou. */
  | "concluido"
  /** Algo chegou de fora: a coordenação despachou uma tarefa para a equipe. */
  | "chegou";

/**
 * Vibra, discreto, e NUNCA segura quem chamou.
 *
 * Sem `await` de propósito, e a função é síncrona para quem usa: o retorno
 * tátil é enfeite de confirmação, e esperar por ele atrasaria o ato que ele
 * está confirmando. Se a ponte nativa não existir (binário compilado antes
 * desta dependência entrar, que é exatamente o que está instalado no iPhone
 * hoje), a promessa rejeita e este arquivo engole: um aplicativo que quebra
 * por não conseguir vibrar seria pior do que um que não vibra.
 */
export function retornoTatil(momento: MomentoTatil): void {
  try {
    if (Platform.OS === "android") {
      /*
        `Confirm` e `Reject` são os dois nomes do vocabulário do Android, e só
        `Confirm` é usado aqui: `Reject` existe para o erro, e erro não vibra.
        `Long_Press` é o pulso mais longo do mesmo vocabulário, para o que
        chegou de fora, e continua passando pelo caminho que respeita o ajuste.
      */
      const tipo = momento === "concluido"
        ? Haptics.AndroidHaptics.Confirm
        : momento === "chegou"
          ? Haptics.AndroidHaptics.Long_Press
          : Haptics.AndroidHaptics.Context_Click;
      void Haptics.performAndroidHapticsAsync(tipo).catch(() => undefined);
      return;
    }

    /*
      `Light` para o que pegou: o pedido é discreto. `Success` para o fim de
      um trabalho, que é o único padrão do iOS com forma própria, dois toques,
      reconhecível sem olhar. `Heavy` para o que chegou de fora: é o único
      momento em que ser sentido no bolso é o pedido, e é um impacto, e não a
      forma `Warning` do sistema, porque `Warning` é a forma de "algo deu
      errado" e despacho não é erro.
    */
    const chamada = momento === "concluido"
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : momento === "chegou"
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void chamada.catch(() => undefined);
  } catch {
    /* Módulo ausente no binário instalado. Segue sem vibrar. */
  }
}
