import type { ExpoConfig } from "expo/config";

/**
 * Configuração do aplicativo de campo.
 *
 * Este arquivo é o que as duas lojas leem. Cada bloco abaixo corresponde a
 * uma pergunta que a Google ou a Apple faz na revisão, e a resposta está aqui
 * em vez de num campo de formulário que alguém preenche na pressa.
 *
 * **Distribuição.** O aplicativo é de uso interno do agente de campo, não do
 * cidadão. Na Apple isso significa uma escolha explícita entre a App Store
 * pública e o Apple Business Manager (distribuição privada, sem loja aberta);
 * na Google, entre publicação aberta e teste fechado ou interno. A decisão é
 * comercial e está registrada em LOJAS.md, não aqui.
 *
 * **Permissões.** Câmera e localização precisam de texto de justificativa em
 * português, e a Apple recusa binário sem eles. Os textos abaixo dizem o que
 * o aplicativo faz com cada permissão, e não "para melhorar sua experiência".
 */

/** Versão do que o usuário vê. Muda quando a funcionalidade muda. */
const VERSAO = "0.1.0";

/**
 * Contador de build, exigido pelas duas lojas e independente da versão.
 *
 * Sobe a cada envio, mesmo que a versão não mude, porque as lojas recusam
 * receber duas vezes o mesmo número. O EAS pode cuidar disso sozinho
 * (`autoIncrement` em eas.json), e é assim que está configurado.
 */
const BUILD = 1;

const config: ExpoConfig = {
  name: "Defesa Civil 360",
  slug: "dc360-campo",
  scheme: "dc360",
  version: VERSAO,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  primaryColor: "#5B21B6",

  icon: "./assets/icone.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#101519",
  },

  assetBundlePatterns: ["**/*"],

  ios: {
    // Identificador definitivo. Trocar depois de publicar significa outro
    // aplicativo na loja, sem herdar avaliações nem instalações.
    bundleIdentifier: "com.solerte.dc360.campo",
    buildNumber: String(BUILD),
    supportsTablet: true,
    // O agente trabalha na rua, quase sempre em pé, com uma mão. Deitado não
    // acrescenta nada e complica a captura de assinatura.
    requireFullScreen: false,
    infoPlist: {
      NSCameraUsageDescription:
        "O aplicativo usa a câmera para registrar as fotografias da vistoria " +
        "técnica no local da ocorrência. As fotos ficam guardadas no aparelho " +
        "e são enviadas à Defesa Civil do município quando houver sinal.",
      NSLocationWhenInUseUsageDescription:
        "O aplicativo registra a coordenada do local da vistoria para que o " +
        "laudo técnico indique onde ela foi feita. A localização é usada " +
        "apenas durante a vistoria, e nunca em segundo plano.",
      NSPhotoLibraryAddUsageDescription:
        "As fotografias da vistoria podem ser salvas no aparelho para servirem " +
        "de cópia até a sincronização com a Defesa Civil terminar.",
      /*
        Sem exceção de transporte: tudo trafega por https.

        A única folga é para desenvolvimento em rede local, e ela precisa ser
        pedida de propósito (DC360_DEV_LOCAL=1). Serve para o caso de instalar
        o aplicativo num aparelho pelo cabo e falar com a API rodando no Mac,
        que atende em http num endereço 10.x ou 192.168.x. Sem isso a tela de
        entrada gira e não explica, porque o sistema corta a conexão antes de
        ela sair do aparelho.

        NSAllowsLocalNetworking libera SOMENTE nome .local e IP de faixa
        privada. Endereço público continua exigindo https, então um build
        gerado com esta folga ligada por engano não passa a aceitar servidor
        qualquer na internet. Ainda assim, build de loja sai sem a variável.
      */
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        ...(process.env["DC360_DEV_LOCAL"] === "1"
          ? { NSAllowsLocalNetworking: true }
          : {}),
      },
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: "com.solerte.dc360.campo",

    /*
      Arquivo do Firebase, exigido pelo FCM para a notificação chegar no
      Android. Projeto `defesa-civil-360`, criado em 09/09/2026.

      Fica rastreado no git de propósito: o EAS constrói a partir do
      repositório, e arquivo ignorado não chega no worker. Ele não é segredo,
      todo o conteúdo sai de um APK publicado com um descompactador. Ver a
      justificativa inteira em `.gitignore`.
    */
    googleServicesFile: "./google-services.json",
    versionCode: BUILD,
    adaptiveIcon: {
      foregroundImage: "./assets/icone-adaptativo.png",
      backgroundColor: "#101519",
    },
    /*
      Lista fechada e curta. Toda permissão a mais é uma pergunta a mais na
      revisão da Play Store e uma razão a mais para o servidor público
      desconfiar. Não pedimos armazenamento externo, contatos, telefone nem
      localização em segundo plano.
    */
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
    ],
    blockedPermissions: [
      // O expo-camera pede gravação de áudio por padrão. O aplicativo não
      // grava som, e pedir microfone num app de vistoria é o tipo de coisa
      // que trava uma revisão.
      "android.permission.RECORD_AUDIO",
    ],
    // Backup automático do Android copiaria o banco local, com vistoria ainda
    // não sincronizada, para a conta Google do agente.
    allowBackup: false,
  },

  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    [
      "expo-camera",
      {
        cameraPermission:
          "O aplicativo usa a câmera para registrar as fotografias da vistoria técnica.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "O aplicativo registra a coordenada do local da vistoria no laudo técnico.",
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        backgroundColor: "#101519",
        imageWidth: 180,
      },
    ],
    [
      "expo-notifications",
      {
        /*
          A cor do aviso na bandeja do Android. Mesma violeta da marca, e ela
          NÃO comunica severidade: quem faz isso é o canal (som ou silêncio) e o
          texto. A regra da casa vale aqui igual, e cor de marca nunca diz risco.
        */
        color: "#5B21B6",

        /*
          O canal em que cai o aviso que chega SEM `channelId` no dado da
          mensagem, e a escolha do silencioso é deliberada.

          O Android roteia por `data["channelId"]`; enquanto o servidor não o
          enviar, tudo cai neste padrão. Das duas maneiras de errar, esta é a
          barata: um aviso que espera o agente abrir o aplicativo custa atraso,
          e um aviso de severidade baixa tocando às três da manhã custa o
          aplicativo inteiro silenciado nos ajustes, para sempre, inclusive o de
          severidade crítica. O raciocínio completo está em `src/push/canais.ts`.

          O valor é cópia literal de `CANAL_COMUM`, e existe teste que reprova
          se os dois divergirem: este arquivo é lido pelo Expo antes de qualquer
          TypeScript nosso, então importar a constante daqui não é possível.
        */
        defaultChannel: "dc360.comum.v1",

        /*
          O `aps-environment` do iOS, decidido pelo perfil do build e não à mão.

          Escrito à mão, ele erra na direção que não avisa: um binário de loja
          assinado com `development` é aceito pela App Store, instala, registra
          a ficha, e simplesmente nunca recebe notificação nenhuma, porque a
          ficha é de um ambiente e o servidor fala com o outro. Ninguém descobre
          pelo aplicativo: o agente conclui que o produto não avisa.

          `EAS_BUILD_PROFILE` é posto pelo próprio EAS durante o build, então o
          perfil `producao` de `eas.json` já responde por isto sem ninguém
          precisar lembrar.
        */
        mode: process.env["EAS_BUILD_PROFILE"] === "producao" ? "production" : "development",
      },
    ],
  ],

  experiments: { typedRoutes: true },

  extra: {
    /*
      Endereço da API, por ambiente de build. Fica em `extra` e não numa
      constante no código porque muda entre a prefeitura A e a prefeitura B, e
      trocar endereço não pode exigir recompilar à mão.

      Sem valor padrão de produção de propósito: um binário que sai da fábrica
      apontando para o servidor de alguém é acidente esperando acontecer.
    */
    apiUrl: process.env["DC360_API_URL"] ?? "http://localhost:3333",
    eas: { projectId: process.env["EAS_PROJECT_ID"] ?? "" },
  },
};

export default config;
