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
    bundleIdentifier: "br.gov.dc360.campo",
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
      // Sem exceção de transporte: tudo trafega por https.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: "br.gov.dc360.campo",
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
