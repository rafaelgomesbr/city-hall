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
 * Os textos de permissão do iOS ficam AQUI, num lugar só, e são passados às
 * opções dos plugins.
 *
 * O motivo é um defeito real que estava neste arquivo. `createPermissionsPlugin`
 * do `@expo/config-plugins` resolve cada chave como
 * `opção do plugin || ios.infoPlist || texto padrão em inglês`, então a opção do
 * plugin SEMPRE ganha de `ios.infoPlist`. O texto longo de câmera escrito em
 * `ios.infoPlist` nunca chegava ao binário: o que ia era a frase curta passada
 * ao `expo-camera`. Com uma constante só, os dois lados não têm como divergir.
 *
 * A régua destes textos: dizem O QUE o aplicativo faz com a permissão, para que
 * serve o dado e para onde ele vai. Nada de "para melhorar sua experiência", que
 * a Apple recusa, e nada que o código não faça, que é declaração falsa.
 */
const TEXTO_CAMERA =
  "O aplicativo usa a câmera para fotografar o imóvel durante a vistoria "
  + "técnica, e, se você quiser, para a sua foto de perfil. As fotos de vistoria "
  + "ficam guardadas neste aparelho e são enviadas à Defesa Civil do município "
  + "quando houver sinal.";

/**
 * A galeria, e o que o texto promete: UMA foto, escolhida por você.
 *
 * O seletor de foto abre fora do processo do aplicativo nas duas plataformas
 * (Photo Picker no Android, o seletor do sistema no iOS), e só a imagem tocada
 * chega aqui. O aplicativo nunca pede a permissão de biblioteca inteira: ver
 * `src/dados/foto-do-agente.ts`. O texto existe porque a Apple exige a chave
 * no binário quando o seletor é usado, e ele diz exatamente o que acontece.
 */
const TEXTO_GALERIA =
  "O aplicativo abre a galeria só quando você escolhe uma foto de perfil, e "
  + "recebe apenas a imagem escolhida, recortada e reduzida. Ela aparece ao lado "
  + "do seu nome para a sua equipe e a coordenação, e você pode trocá-la ou "
  + "removê-la quando quiser.";

/*
  Duas leituras, e as duas nomeadas: o GPS é ligado só no toque da vistoria;
  a lista e o mapa usam a última posição que o aparelho já tinha, sem ligar o
  rádio, para ordenar as tarefas e traçar o caminho quando o agente pede. A
  frase acompanha `docs/DECLARACAO-NAS-LOJAS.md` 1.1 e 1.4.
*/
const TEXTO_LOCALIZACAO =
  "O aplicativo lê a coordenada do local no momento em que o agente registra a "
  + "vistoria, para que o laudo técnico prove onde ela foi feita, e usa a última "
  + "posição conhecida do aparelho para ordenar as tarefas por distância e, se o "
  + "agente pedir, traçar o caminho. Tudo com o aplicativo aberto, e nunca em "
  + "segundo plano.";

/**
 * Contador de build, exigido pelas duas lojas e independente da versão.
 *
 * Sobe a cada envio, mesmo que a versão não mude, porque as lojas recusam
 * receber duas vezes o mesmo número. O EAS pode cuidar disso sozinho
 * (`autoIncrement` em eas.json), e é assim que está configurado.
 */
const BUILD = 1;

/**
 * A CHAVE DO GOOGLE MAPS QUE VAI DENTRO DO BINÁRIO, e por que ela precisa
 * estar aqui apesar de existir `GET /configuracao`.
 *
 * O painel resolveu isto em tempo de execução, e por uma razão de conta a
 * pagar que está escrita em `apps/web/src/paginas/mapa-de-base.ts`: lá é UM
 * build estático servindo TODAS as prefeituras, então a chave assada seria a
 * do fornecedor pagando o mapa de todo mundo. Aqui a razão não se transporta,
 * e a diferença é técnica antes de ser comercial:
 *
 * 1. O SDK NATIVO NÃO ACEITA CHAVE EM TEMPO DE EXECUÇÃO. No Android ela é
 *    `com.google.android.geo.API_KEY` no manifesto; no iOS ela vira
 *    `GMSServices.provideAPIKey(...)` dentro do AppDelegate. As duas são
 *    escritas pelo plugin do `react-native-maps` durante o `prebuild`, e não
 *    existe chamada de JavaScript que as substitua depois.
 * 2. NO iOS ELA DECIDE ATÉ SE O SDK ENTRA NO BINÁRIO. Sem `iosGoogleMapsApiKey`
 *    o plugin não acrescenta o pod `react-native-maps/Google` ao Podfile, e aí
 *    `PROVIDER_GOOGLE` cai em silêncio no Apple Maps: a tela abre, desenha um
 *    mapa bonito, ignora o nosso estilo, e ninguém recebe erro nenhum. É o
 *    pior desfecho possível, porque parece certo.
 * 3. ESTE BINÁRIO JÁ É POR MUNICÍPIO. `DC360_API_URL`, logo abaixo em `extra`,
 *    também é de tempo de build, com o comentário dizendo que "muda entre a
 *    prefeitura A e a prefeitura B". Um aplicativo compilado para apontar para
 *    o servidor de um município só não é o build único do painel.
 *
 * O QUE CONTINUA VINDO DA API, e é o que o município controla: a AUTORIZAÇÃO.
 * `GET /configuracao` responde `chaveDoMapa`, e vazia quer dizer que aquele
 * município não aceita mandar coordenada para o Google. O aplicativo então
 * desenha o plano esquemático e não monta mapa nenhum, exatamente como
 * `docs/SUBPROCESSADORES.md` seção 2.2 promete. Ver `src/dados/mapa.ts`.
 *
 * Sem valor padrão, pelo mesmo motivo de `DC360_API_URL`: binário que sai da
 * fábrica gastando a chave de alguém é acidente esperando acontecer. Sem a
 * variável, o aplicativo compila sem o SDK do Google e trabalha no plano
 * esquemático, que é um modo inteiro e não uma degradação.
 *
 * Ela NÃO é segredo, e chamar de segredo seria teatro: chave de mapa viaja
 * dentro do APK e do IPA e sai de lá com um descompactador. Quem protege a
 * conta é a restrição da chave no console do Google (identificador do
 * aplicativo mais impressão digital do certificado, no Android; identificador
 * do pacote, no iOS), nunca o sigilo.
 */
const CHAVE_DO_MAPA = process.env["DC360_MAPS_CHAVE"]?.trim() ?? "";

/**
 * UMA CHAVE POR PLATAFORMA, e por que não dá para ser uma só.
 *
 * No console do Google, "Restrições do aplicativo" é botão de rádio e não
 * caixa de seleção: a chave é restrita a Apps iOS OU a Apps Android, nunca às
 * duas. Com uma variável só, a escolha real era entre publicar uma chave SEM
 * restrição nenhuma, que qualquer um gasta no cartão de quem publicou, e
 * deixar uma plataforma sem mapa em silêncio.
 *
 * `DC360_MAPS_CHAVE` continua valendo como reserva das duas, e isso não é
 * enfeite: é o que faz a máquina que já estava configurada continuar
 * compilando igual depois desta mudança.
 */
const CHAVE_DO_MAPA_IOS = process.env["DC360_MAPS_CHAVE_IOS"]?.trim() || CHAVE_DO_MAPA;
const CHAVE_DO_MAPA_ANDROID = process.env["DC360_MAPS_CHAVE_ANDROID"]?.trim() || CHAVE_DO_MAPA;

/**
 * A TELA DE ABERTURA, agora com os dois temas.
 *
 * O defeito, visto no aparelho: `backgroundColor` era `#101519` e mais nada.
 * Quem usa o telefone em modo claro, que é a maioria de quem trabalha na rua
 * com sol na tela, abria o aplicativo e via meio segundo de tela quase preta
 * antes de a interface clara aparecer. Não é detalhe de gosto: abertura que
 * não combina com o que vem depois parece defeito de carregamento, e é a
 * primeira coisa que o aplicativo mostra.
 *
 * Ele ficou mais visível depois que a abertura passou a segurar também o
 * carregamento das fontes (ver `src/app/_layout.tsx`): a tela que piscava
 * agora fica de pé o tempo suficiente para ser lida.
 *
 * As cores são as MESMAS de `src/ui/tokens.ts` (`temaClaro.fundo` é
 * `tinta.t50`, `temaEscuro.fundo` é `tinta.t950`), escritas aqui porque este
 * arquivo é lido pelo Expo antes de qualquer TypeScript nosso e não pode
 * importar o módulo de tokens. É a mesma razão já registrada no
 * `defaultChannel` do `expo-notifications`, mais abaixo.
 *
 * E as duas artes vêm SEM fundo, com o desenho recortado no conteúdo. A arte
 * antiga era uma tela inteira com o fundo escuro pintado dentro dela, o que
 * teria desenhado um retângulo escuro por cima do fundo claro declarado aqui,
 * e ainda encolhia o emblema a uns 40 pontos porque `imageWidth` vale para a
 * imagem toda. Ver `scripts/gerar-icones.mjs`.
 */
const ABERTURA = {
  imagemClara: "./assets/splash.png",
  imagemEscura: "./assets/splash-escuro.png",
  fundoClaro: "#F5F7F8",
  fundoEscuro: "#101519",
  /** Largura do emblema em pontos, agora que a arte é só o emblema. */
  larguraDaImagem: 180,
} as const;

const config: ExpoConfig = {
  name: "Defesa Civil 360",
  slug: "dc360-campo",
  scheme: "dc360",
  version: VERSAO,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  primaryColor: "#5B21B6",

  icon: "./assets/icone.png",
  /*
    Quem manda na abertura NATIVA é o plugin `expo-splash-screen`, lá embaixo.
    Este bloco é o campo legado, que sobrevive no manifesto e em ferramenta que
    lê a configuração sem rodar plugin. Os dois saem da mesma constante de
    propósito: enquanto existirem dois lugares dizendo a mesma coisa, eles
    precisam dizer a MESMA coisa, senão um deles envelhece em silêncio e o
    defeito só aparece no aparelho de alguém.
  */
  splash: {
    image: ABERTURA.imagemClara,
    resizeMode: "contain",
    backgroundColor: ABERTURA.fundoClaro,
    dark: {
      image: ABERTURA.imagemEscura,
      backgroundColor: ABERTURA.fundoEscuro,
    },
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
      /*
        Os textos de câmera e de localização NÃO ficam aqui: ficam nas opções
        dos plugins, porque é a opção do plugin que ganha na hora de escrever o
        Info.plist. Ver o comentário de `TEXTO_CAMERA` no topo.

        `NSPhotoLibraryAddUsageDescription` foi REMOVIDO. Ele prometia salvar a
        foto da vistoria na galeria do aparelho, e o aplicativo não faz isso:
        `expo-camera` devolve um caminho no cache e `evidencia-no-disco.ts`
        copia o arquivo para o diretório privado do aplicativo
        (`Paths.document`). Não existe `expo-media-library` no projeto e nada
        escreve na galeria. Chave de permissão para coisa que o aplicativo não
        faz é declaração falsa na revisão, e a Apple pergunta onde está o
        recurso que a justifica.
      */
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
      Lista curta. Toda permissão a mais é uma pergunta a mais na revisão da
      Play Store e uma razão a mais para o servidor público desconfiar. Não
      pedimos contatos, telefone nem localização em segundo plano.

      ESTA LISTA NÃO É O MANIFESTO INTEIRO, e a diferença já enganou este
      arquivo uma vez. O manifesto final é a soma desta lista com o que cada
      biblioteca declara sozinha, e o que sobra depois de `blockedPermissions`.
      O manifesto que o aparelho recebe pede também:

      - `POST_NOTIFICATIONS` e `RECEIVE_BOOT_COMPLETED`, do `expo-notifications`
        (`node_modules/expo-notifications/android/src/main/AndroidManifest.xml`);
      - `VIBRATE`, do modelo base do Expo, e ela é usada pelo canal de urgência.

      O conjunto conferido, e a maneira de conferir de novo depois de mexer
      aqui: `npx expo config --type introspect`, com a pasta `android/` ausente.
      A declaração das lojas fica em `../../docs/DECLARACAO-NAS-LOJAS.md`.
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
      /*
        Armazenamento externo, pedido pelo `expo-file-system`, e que este
        aplicativo não usa.

        O plugin dele acrescenta as duas por conta própria (ver
        `node_modules/expo-file-system/plugin/build/withFileSystem.js` e o
        `AndroidManifest.xml` da própria biblioteca, onde elas vêm com
        `maxSdkVersion="32"`). Sem estas linhas, o manifesto final pedia leitura
        e escrita no armazenamento compartilhado, e a ficha da Play Store
        mostrava isso para quem fosse instalar, embora o comentário logo acima
        prometesse o contrário.

        A prova de que não são necessárias: tudo o que este aplicativo grava vai
        para o diretório PRIVADO dele (`Paths.document`, em
        `dados/evidencia-no-disco.ts` e em `ui/Assinatura.tsx`) ou para o banco
        local do `expo-sqlite`. Diretório privado de aplicativo nunca exigiu
        permissão de armazenamento, em nenhuma versão do Android.
      */
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      /*
        "Aparecer sobre outros aplicativos", que vem do modelo de projeto do
        próprio Expo (o manifesto base em
        `@expo/config-plugins/build/plugins/withAndroidBaseMods.js` a traz sob
        um comentário que diz "OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT
        NEED"). Nenhuma tela deste aplicativo desenha por cima de outro, e esta
        é uma das permissões especiais que a Play Store destaca na ficha e
        questiona na revisão.

        `android.permission.VIBRATE`, que vem do mesmo modelo, FICA: o canal de
        urgência vibra de propósito (`vibrationPattern` em `push/PortaExpo.ts`),
        e é o que faz o aviso de severidade crítica ser percebido com o telefone
        no bolso, na chuva.
      */
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    // Backup automático do Android copiaria o banco local, com vistoria ainda
    // não sincronizada, para a conta Google do agente.
    allowBackup: false,
  },

  /*
    OS PLUGINS DE CONFIGURAÇÃO, e o que NÃO está aqui.

    A lista traz só os módulos nativos que precisam escrever no manifesto do
    Android ou no Info.plist do iOS. `expo-clipboard`, que entrou com a escolha
    de mapa da tela de vistoria ("copiar a coordenada"), fica DE FORA de
    propósito: ele não tem `app.plugin.js` (confira em
    `node_modules/expo-clipboard/`), não pede permissão em nenhuma das duas
    plataformas, e o autolinking do Expo o encontra sozinho pelo
    `expo-module.config.json`. Uma entrada aqui para ele seria uma linha que o
    Expo tentaria carregar e não acharia.

    O que ele EXIGE, e isso não é configuração: compilação nativa nova
    (`npx expo prebuild` mais um build), porque é módulo nativo e o binário que
    já está no aparelho não o contém.

    `expo-blur`, que entrou com o menu de vidro (`src/ui/BarraDeAbas.tsx`),
    está na MESMA situação: não tem `app.plugin.js` (confira em
    `node_modules/expo-blur/`), não pede permissão nenhuma, e o autolinking o
    encontra pelo `expo-module.config.json`. Também é módulo nativo, também
    exige `prebuild` e compilação nova, e o portão de `entitlements` precisa
    rodar DEPOIS do prebuild, pela razão escrita em `PENDENCIAS.md` (item 8).
  */
  plugins: [
    "expo-router",
    [
      "expo-secure-store",
      {
        /*
          Sem texto de Face ID, porque o aplicativo não usa Face ID.

          O plugin escreve `NSFaceIDUsageDescription` com um texto padrão em
          inglês quando ninguém diz nada, e ele aparecia no Info.plist gerado:
          "Allow $(PRODUCT_NAME) to access your Face ID biometric data." Isso é
          duas coisas ruins de uma vez: está em inglês numa ficha em português,
          e promete leitura de biometria que não existe. O cofre é usado com
          `keychainAccessible` apenas (ver `dados/sessao.tsx` e
          `push/ficha-do-aparelho.ts`), nunca com `requireAuthentication`, então
          o sistema jamais pede Face ID por nossa causa.

          `false` REMOVE a chave do Info.plist. Ver `applyPermissions` em
          `@expo/config-plugins`.
        */
        faceIDPermission: false,
      },
    ],
    "expo-sqlite",
    [
      "expo-camera",
      {
        cameraPermission: TEXTO_CAMERA,
        recordAudioAndroid: false,
        /*
          Sem texto de microfone, porque o aplicativo não grava som.

          No Android isso já estava resolvido (`recordAudioAndroid: false` mais
          `blockedPermissions`), mas no iOS o plugin continuava escrevendo
          `NSMicrophoneUsageDescription` com o padrão em inglês. O revisor da
          Apple lê a lista de permissões do binário: microfone declarado num
          aplicativo de vistoria é pergunta certa na revisão, e a resposta
          honesta é que ele não deveria estar ali.
        */
        microphonePermission: false,
      },
    ],
    [
      "expo-image-picker",
      {
        /*
          A foto de perfil do agente (câmera da frente ou galeria). O texto da
          câmera é o MESMO de `expo-camera`, de propósito: o Info.plist tem uma
          chave só para a câmera, e dois plugins escrevendo textos diferentes
          nela deixariam o último a rodar decidir o que a Apple lê.

          Sem microfone, pelo mesmo motivo do `expo-camera`: o aplicativo não
          grava som, e `false` bloqueia a permissão no Android e apaga a chave
          no iOS.
        */
        photosPermission: TEXTO_GALERIA,
        cameraPermission: TEXTO_CAMERA,
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: TEXTO_LOCALIZACAO,
        /*
          As três chaves abaixo saem do Info.plist, e essa é a correção mais
          importante deste arquivo.

          O aplicativo chama `requestForegroundPermissionsAsync` e nada mais
          (`src/app/(agente)/vistoria/[id].tsx`, na função `capturarGps`). Ele
          nunca pede autorização permanente e não tem nenhuma tarefa em segundo
          plano. Mesmo assim o plugin escrevia as duas chaves de "Always" e a de
          movimento, uma delas com o texto padrão em inglês.

          O custo disso não é cosmético. Chave de "Always" no binário é o que
          faz a Apple tratar o aplicativo como candidato a localização em
          segundo plano e o que faz o sistema oferecer "Sempre" na caixa de
          permissão, e a Google pede vídeo demonstrando o uso de quem declara
          segundo plano. Declarar o que não se usa é justamente a divergência
          entre o binário e o formulário que derruba submissão.

          `NSMotionUsageDescription` sai pelo mesmo motivo: nenhum código lê
          sensor de movimento.
        */
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: ABERTURA.imagemClara,
        backgroundColor: ABERTURA.fundoClaro,
        imageWidth: ABERTURA.larguraDaImagem,
        /*
          O bloco do tema escuro. Sem ele, `backgroundColor` vale para os dois
          e a abertura fica presa num modo só, que era exatamente o defeito:
          antes ela era escura sempre, agora seria clara sempre, o que é a
          mesma falha com a cor trocada.

          O aplicativo declara `userInterfaceStyle: "automatic"`, então o
          sistema escolhe qual dos dois mostrar, e a abertura passa a combinar
          com a primeira tela que vem depois dela.
        */
        dark: {
          image: ABERTURA.imagemEscura,
          backgroundColor: ABERTURA.fundoEscuro,
        },
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
    [
      "react-native-maps",
      {
        /*
          As duas chaves saem da MESMA constante, e passar `undefined` é o
          caminho deliberado de quem não tem chave: o plugin remove a
          `meta-data` do manifesto do Android e deixa o pod do Google fora do
          Podfile do iOS, em vez de escrever uma string vazia que o SDK tentaria
          usar e recusaria na primeira renderização.

          `|| undefined` e não `?? undefined`: string vazia precisa cair no
          mesmo caminho de "não tem", senão `DC360_MAPS_CHAVE=` no ambiente
          produziria um binário que declara chave e não tem nenhuma.
        */
        androidGoogleMapsApiKey: CHAVE_DO_MAPA_ANDROID || undefined,
        iosGoogleMapsApiKey: CHAVE_DO_MAPA_IOS || undefined,
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
    /*
      A MESMA chave, repetida aqui para o JavaScript conseguir PERGUNTAR se ela
      existe. Não é duplicação por descuido: é a única forma de o aplicativo
      saber, em tempo de execução, se o binário em que ele está rodando tem o
      SDK do Google dentro.

      Sem isto, o caso descrito no comentário de `CHAVE_DO_MAPA` acontece
      calado: binário compilado sem chave, município com chave configurada no
      servidor, `PROVIDER_GOOGLE` caindo no Apple Maps no iOS e em quadrado
      cinza no Android, e nenhuma parte do produto sabendo que aconteceu.
      `src/dados/mapa.ts` lê este campo e recusa o modo Google quando ele está
      vazio, desenhando o plano esquemático e DIZENDO por quê.

      Repetir o valor não expõe nada que o binário já não exponha: ela está no
      Info.plist e no AndroidManifest, que qualquer descompactador lê.
    */
    /*
      As DUAS chaves, e quem escolhe é o aparelho.

      `extra` é um objeto só, assado no manifesto e lido pelas duas
      plataformas, então mandar uma string aqui obrigaria o iPhone a acreditar
      na chave do Android. `escolherChaveDoBuild`, em `src/dados/mapa.ts`, lê
      `Platform.OS` e responde a que vale, e continua entendendo o formato
      antigo de string para não cegar aplicativo já instalado.
    */
    mapaChaveDoBuild: { ios: CHAVE_DO_MAPA_IOS, android: CHAVE_DO_MAPA_ANDROID },
    eas: { projectId: process.env["EAS_PROJECT_ID"] ?? "" },
  },
};

export default config;
