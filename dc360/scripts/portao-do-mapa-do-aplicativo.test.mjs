/**
 * O MAPA DO APLICATIVO, verificado por máquina.
 *
 * Este é o irmão de `apps/web/test/mapa-e-coordenada.test.ts`, que guarda o
 * mapa do painel desde 13/09/2026. A razão dele vale igual aqui e o conteúdo
 * não se transporta inteiro, porque o painel fala com o Google por JavaScript
 * e o aplicativo fala por SDK nativo: o que é perigoso de cada lado é
 * diferente, e copiar as regras do painel deixaria um portão que reprova coisa
 * que este código nem consegue escrever e passa pelo que ele consegue.
 *
 * ## O que está em jogo, e não é dinheiro
 *
 * `docs/SUBPROCESSADORES.md` seção 2.3 promete ao município, por escrito, que
 * "nome, contato, endereço, protocolo, relato, fotografia, assinatura e
 * descrição de vulnerabilidade não saem do Brasil". A coordenada sai, e é a
 * única coisa que sai, e a seção 2.2 diz isso com todas as letras.
 *
 * Geocodificação é a maneira mais fácil de quebrar essa promessa sem perceber:
 * transformar endereço em ponto manda o ENDEREÇO para fora, e transformar
 * ponto em endereço traz de volta um endereço que o Google passou a conhecer.
 * Nenhuma das duas resolve problema que este produto tenha, porque a
 * coordenada já está gravada: ela veio do aparelho do agente ou do link que o
 * solicitante mandou. Seria pagar para reaprender o que já se sabe, mandando
 * junto o dado que a promessa protege.
 *
 * ## A regra que o painel NÃO tem, e este precisa
 *
 * `PROVIDER_GOOGLE` nos dois lados. No iOS, um `MapView` sem provedor cai no
 * Apple Maps, que não aceita paleta própria: o estilo gerado dos nossos tokens
 * é jogado fora e a tela desenha um mapa da Apple dentro de um produto que não
 * é da Apple. E ele falha para o lado que não avisa: o mapa abre, fica bonito,
 * e ninguém recebe erro nenhum. Foi por isso que o provedor virou regra de
 * portão em vez de convenção.
 *
 * ## Por que mora em `scripts/`
 *
 * A mesma razão de `fonte-do-aplicativo.mjs` e de `entitlements-do-ios.test.mjs`:
 * o pacote do aplicativo roda em `jest-expo`, sem tipos de Node, sem `node:fs`
 * e sem `__dirname`, e varredura de arquivo precisa dos três.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  RAIZ_DO_APP, RAIZ_DO_REPO, arquivosDeFonte, nomeCurto, semComentarios,
} from "./fonte-do-aplicativo.mjs";

const APP_CONFIG = join(RAIZ_DO_REPO, "apps", "campo", "app.config.ts");

/**
 * O que reprova, e por quê.
 *
 * A lista é de IDENTIFICADOR e de endereço de serviço, e não de palavra solta:
 * é assim que cada uma dessas coisas se chama de dentro do código. Um nome
 * novo que não esteja aqui passa, e é por isso que existe também a regra de
 * superfície declarada: `src/ui/mapa/estilo-do-google.ts` escreve o tipo do
 * estilo à mão, em vez de importar a superfície inteira da biblioteca, então
 * quem precisar de algo fora dela tem que escrever primeiro e a revisão vê.
 */
const PROIBIDAS = [
  {
    nome: "Geocoding do Google",
    padrao: /\bGeocoder\b|maps\/api\/geocode/i,
    porque: "cobrada por requisição, e manda o endereço da família para fora do país",
  },
  {
    nome: "geocodificação do expo-location",
    /*
      A regra que o painel não tem, e a mais provável de ser escrita aqui por
      engano, justamente porque parece inofensiva: `expo-location` JÁ está
      instalado (o aplicativo lê a coordenada do GPS no momento da vistoria), e
      `geocodeAsync` e `reverseGeocodeAsync` estão ao lado da chamada que o
      código usa todo dia. Elas entregam ao serviço de geocodificação da
      plataforma exatamente o dado que a seção 2.3 promete que fica no Brasil.
    */
    padrao: /\b(?:reverseGeocodeAsync|geocodeAsync)\b/,
    porque:
      "manda endereço ou coordenada ao serviço de geocodificação da plataforma. "
      + "A coordenada do produto já está gravada, e o endereço é justamente o que "
      + "`docs/SUBPROCESSADORES.md` seção 2.3 promete que não sai do Brasil",
  },
  {
    nome: "Places",
    /*
      `AutocompleteService`, e NÃO `Autocomplete` solto. A primeira versão desta
      linha copiou a do painel com o nome encurtado e reprovou `ui/Campo.tsx`
      duas vezes, nas duas linhas em que ele repassa `autoComplete` ao
      `TextInput` do React Native, que é a dica de preenchimento do TECLADO do
      aparelho e não tem nada a ver com o Google. Foi o próprio caso de
      varredura que pegou, e ele fica registrado aqui porque é o modo de falha
      típico de um portão de texto: reprovar código inocente ensina a pessoa a
      afrouxar a regra, e uma regra afrouxada não volta a apertar sozinha.
    */
    padrao: /\bPlacesService\b|\bAutocompleteService\b|maps\/api\/place/i,
    porque: "cobrada por requisição, e o produto não procura estabelecimento nenhum",
  },
  {
    nome: "Directions",
    padrao: /maps\/api\/directions|\bMapViewDirections\b/i,
    porque:
      "navegação própria são anos de trabalho, o aplicativo de mapas do aparelho "
      + "faz melhor e já tem as regiões baixadas, e `abrirNoMapa` entrega a ele",
  },
  {
    nome: "biblioteca extra no carregador",
    padrao: /libraries\s*[=:]/i,
    porque: "é por `libraries=` que `places` entra, e uma vez carregada ela cobra",
  },
  {
    nome: "chave do Google escrita no código",
    /*
      `AIza` é o prefixo de toda chave de navegador e de aplicativo do Google.
      A chave precisa entrar pelo `app.config.ts`, lendo `DC360_MAPS_CHAVE` do
      ambiente, senão ela vira a chave do fornecedor dentro do binário de todas
      as prefeituras, que é o defeito que o painel já corrigiu uma vez.
    */
    padrao: /\bAIza[0-9A-Za-z_-]{10,}/,
    porque:
      "a chave entra por `DC360_MAPS_CHAVE` no `app.config.ts`, e o município "
      + "autoriza por `GET /configuracao`. Escrita no código, ela é a chave do "
      + "fornecedor pagando o mapa de todas as prefeituras",
  },
];

function varrer() {
  const achados = [];
  for (const caminho of arquivosDeFonte(RAIZ_DO_APP, { somenteProduto: false })) {
    const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");
    linhas.forEach((linha, i) => {
      for (const regra of PROIBIDAS) {
        if (regra.padrao.test(linha)) {
          achados.push(`${nomeCurto(caminho)}:${i + 1} [${regra.nome}] porque: ${regra.porque}`);
        }
      }
    });
  }
  return achados;
}

test("a varredura enxerga os arquivos de verdade", () => {
  /*
    Sem esta âncora, um caminho errado faria a varredura passar vazia e o
    portão viraria decoração. É a mesma âncora do portão do painel, e ela já
    salvou uma varredura cega neste repositório: `tocaveis()` chegou a enxergar
    zero elementos no aplicativo inteiro, e quem acusou foi a contagem.
  */
  const arquivos = arquivosDeFonte(RAIZ_DO_APP, { somenteProduto: false }).map(nomeCurto);
  assert.ok(arquivos.length > 30, `a varredura achou só ${arquivos.length} arquivos`);
  assert.ok(arquivos.includes("dados/mapa.ts"), "não achou dados/mapa.ts");
  assert.ok(arquivos.includes("ui/mapa/MapaDoImovel.tsx"), "não achou ui/mapa/MapaDoImovel.tsx");
  assert.ok(
    arquivos.includes("ui/mapa/estilo-do-google.ts"),
    "não achou ui/mapa/estilo-do-google.ts",
  );
});

test("nenhum arquivo do aplicativo chama geocodificação, Places ou Directions", () => {
  const achados = varrer();
  assert.deepEqual(
    achados, [],
    "o aplicativo passou a chamar serviço do Google que ele não precisa, e que leva "
    + "para fora do país dado que `docs/SUBPROCESSADORES.md` promete que fica aqui:\n"
    + achados.join("\n"),
  );
});

test("as próprias regras pegam o que deveriam pegar", () => {
  /*
    O caso que prova a varredura. Sem ele, uma expressão regular escrita errada
    daria verde para sempre, e ninguém descobriria: um portão que nunca viu o
    que ele proíbe não sabe se sabe reconhecê-lo.
  */
  const casos = [
    "const g = new google.maps.Geocoder();",
    "const [lugar] = await Location.reverseGeocodeAsync(ponto);",
    "const [ponto] = await Location.geocodeAsync(endereco);",
    "new google.maps.places.PlacesService(mapa);",
    "new google.maps.places.AutocompleteService();",
    'const url = "https://maps.googleapis.com/maps/api/directions/json";',
    'script.src = base + "&libraries=places";',
    'const chave = "AIzaSyB1cQwErTyUiOpAsDfGhJkL";',
  ];
  for (const caso of casos) {
    assert.ok(
      PROIBIDAS.some((r) => r.padrao.test(caso)),
      `nenhuma regra pega: ${caso}`,
    );
  }
});

test("a limpeza apaga comentário e texto de tela, e mais nada", () => {
  /*
    Sem isto o portão teria o pior incentivo possível: reprovaria o comentário
    que EXPLICA por que geocodificação está proibida, e o jeito de deixar verde
    seria apagar a explicação. Metade dos arquivos deste aplicativo tem
    parágrafos contando o defeito que a linha abaixo conserta.
  */
  const fonte = [
    "// nada de reverseGeocodeAsync aqui",
    'const aviso = "não usamos Geocoder";',
    "const real = new Geocoder();",
  ].join("\n");
  const limpo = semComentarios(fonte).split("\n");
  assert.ok(!limpo[0].includes("reverseGeocodeAsync"), "não apagou o comentário");
  assert.ok(limpo[2].includes("new Geocoder()"), "apagou código de verdade");
  assert.equal(limpo.length, 3, "a contagem de linhas mudou");
});

test("todo MapView do aplicativo pede o provedor Google, explicitamente", () => {
  /*
    NO iOS, `MapView` sem `provider` cai no Apple Maps, que não aceita paleta
    própria: o estilo gerado dos nossos tokens é ignorado, a tela desenha um
    mapa que não é o do produto, e ninguém recebe erro nenhum. Falha para o
    lado que não avisa, e é por isso que é regra de portão.
  */
  const semProvedor = [];
  for (const caminho of arquivosDeFonte(RAIZ_DO_APP, { somenteProduto: true })) {
    const fonte = semComentarios(readFileSync(caminho, "utf8"));
    for (const casou of fonte.matchAll(/<MapView(?![A-Za-z])([\s\S]{0,1200}?)(?:\/>|>)/g)) {
      if (!/provider\s*=\s*\{\s*PROVIDER_GOOGLE\s*\}/.test(casou[1])) {
        const linha = fonte.slice(0, casou.index).split("\n").length;
        semProvedor.push(`${nomeCurto(caminho)}:${linha}`);
      }
    }
  }
  assert.deepEqual(
    semProvedor, [],
    "MapView sem `provider={PROVIDER_GOOGLE}`. No iOS isso cai no Apple Maps em "
    + "silêncio, com o estilo dos nossos tokens jogado fora:\n" + semProvedor.join("\n"),
  );
});

test("a regra do provedor pega um MapView sem ele", () => {
  /*
    O irmão do caso acima, pelo mesmo motivo do caso das expressões regulares:
    uma varredura que nunca viu o defeito não prova que sabe enxergá-lo. Os dois
    textos abaixo são o mesmo elemento, com e sem o provedor.
  */
  const comProvedor = "<MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} />";
  const semProvedor = "<MapView style={{ flex: 1 }} />";
  const pega = (fonte) => [...fonte.matchAll(/<MapView(?![A-Za-z])([\s\S]{0,1200}?)(?:\/>|>)/g)]
    .filter((c) => !/provider\s*=\s*\{\s*PROVIDER_GOOGLE\s*\}/.test(c[1])).length;
  assert.equal(pega(comProvedor), 0, "acusou um MapView que declara o provedor");
  assert.equal(pega(semProvedor), 1, "deixou passar um MapView sem provedor");
});

test("a chave do mapa vem do ambiente, e não escrita no app.config.ts", () => {
  /*
    O mesmo portão que o painel tem contra `vercel.json` voltar a preencher a
    variável de build, e pela mesma razão: um valor ali é a chave do
    FORNECEDOR, e ela passaria a pagar o mapa de todas as prefeituras. Aqui o
    valor entra por `DC360_MAPS_CHAVE`, que é posta por quem compila o
    aplicativo daquele município.
  */
  const config = readFileSync(APP_CONFIG, "utf8");
  assert.match(
    semComentarios(config), /process\.env\["DC360_MAPS_CHAVE"\]/,
    "app.config.ts deixou de ler a chave do mapa do ambiente",
  );
  assert.ok(
    !/\bAIza[0-9A-Za-z_-]{10,}/.test(semComentarios(config)),
    "há uma chave do Google escrita dentro do app.config.ts",
  );
});

test("a chave vai para as DUAS plataformas, e da mesma constante", () => {
  /*
    O modo de falha que este caso fecha é assimétrico e silencioso.

    Passando a chave só em `androidGoogleMapsApiKey`, o Android desenha o mapa
    do Google e o iOS NÃO: sem `iosGoogleMapsApiKey` o plugin não acrescenta o
    pod `react-native-maps/Google` ao Podfile, e aí `PROVIDER_GOOGLE` é
    ignorado e o Apple Maps desenha no lugar, com o estilo gerado dos nossos
    tokens jogado fora e sem erro nenhum. Quem testa no Android vê tudo certo.

    E as duas precisam sair da MESMA constante. Dois lugares dizendo a mesma
    coisa é como um deles envelhece em silêncio, que é literalmente o defeito
    já registrado neste arquivo com os dois textos de câmera (o longo em
    `ios.infoPlist` e o curto na opção do plugin, com a opção sempre ganhando).
  */
  const config = semComentarios(readFileSync(APP_CONFIG, "utf8"));
  for (const chave of ["androidGoogleMapsApiKey", "iosGoogleMapsApiKey"]) {
    assert.match(
      config, new RegExp(`${chave}:\\s*CHAVE_DO_MAPA\\b`),
      `${chave} não sai de CHAVE_DO_MAPA no app.config.ts. Uma das duas `
      + "plataformas ficou sem mapa do Google, e no iOS isso vira Apple Maps em silêncio.",
    );
  }
});

/* ============================================================
   A biblioteca do mapa, que tem histórico de quebrar a compilação
   ============================================================ */

/**
 * O plugin de configuração precisa CARREGAR, e este é o defeito nomeado.
 *
 * `react-native-maps` quebrou o `prebuild` no SDK 55 e no 56 (issues 5843 e
 * 5927 do projeto): o plugin dele importa de
 * `@expo/config-plugins/build/android/Manifest`, um caminho INTERNO do pacote,
 * e o dia em que aquele pacote deixou de ser içado para a raiz de
 * `node_modules` o `prebuild` passou a morrer antes de escrever o projeto
 * nativo. O contorno conhecido é declarar `@expo/config-plugins` como
 * dependência direta do aplicativo.
 *
 * No SDK 57 deste repositório a quebra NÃO se reproduz, e por isso a
 * dependência direta não foi acrescentada: remédio para doença que não existe é
 * mais uma versão para alguém manter. O que fica no lugar dela é este caso, que
 * custa milissegundos e descobre a quebra na suíte em vez de descobri-la no
 * meio de um `prebuild`, onde a mensagem é um `MODULE_NOT_FOUND` dentro de
 * `node_modules` e a conclusão fácil é que o aplicativo está quebrado.
 */
test("o plugin de configuração do react-native-maps carrega", () => {
  const plugin = join(RAIZ_DO_REPO, "apps", "campo", "node_modules", "react-native-maps", "app.plugin.js");
  if (!existsSync(plugin)) {
    /*
      Sem as dependências instaladas não há o que conferir, e reprovar onde não
      há nada a conferir ensina a ignorar a reprovação. É o mesmo critério já
      escrito em `entitlements-do-ios.test.mjs`. Quem cobra a instalação é
      `scripts/testar-campo.mjs`, que falha alto quando `node_modules` não existe.
    */
    return;
  }
  const exigir = createRequire(import.meta.url);
  assert.doesNotThrow(
    () => exigir(plugin),
    "o plugin do `react-native-maps` não carrega. É a quebra das issues 5843 e "
    + "5927: ele importa de `@expo/config-plugins/build/android/Manifest`, um "
    + "caminho interno, e o `prebuild` morre antes de escrever o projeto nativo. "
    + "O contorno é declarar `@expo/config-plugins` como dependência direta em "
    + "apps/campo/package.json.",
  );
});

/**
 * A biblioteca é distribuída em TypeScript cru, e quem a transforma é o
 * empacotador.
 *
 * O `main` de `react-native-maps` aponta para `src/index.ts`, e não para um
 * `dist` compilado. No jest isso quer dizer que ela precisa estar na lista de
 * exceções de `transformIgnorePatterns`, senão o pacote inteiro reprova com um
 * erro de sintaxe DENTRO de `node_modules`, que é o tipo de mensagem que manda
 * a pessoa procurar no lugar errado.
 */
test("react-native-maps está fixado numa versão e é transformado pelo jest", () => {
  const pacote = JSON.parse(
    readFileSync(join(RAIZ_DO_REPO, "apps", "campo", "package.json"), "utf8"),
  );
  const versao = pacote.dependencies?.["react-native-maps"];
  assert.ok(versao, "react-native-maps saiu das dependências do aplicativo");
  assert.match(
    versao, /^\d+\.\d+\.\d+$/,
    `react-native-maps precisa de versão exata, e está em ${versao}. Esta `
    + "biblioteca já quebrou o `prebuild` em duas versões do SDK (issues 5843 e "
    + "5927): um intervalo aqui deixa a próxima quebra entrar sozinha num `npm i`.",
  );
  assert.ok(
    pacote.jest?.transformIgnorePatterns?.some((p) => p.includes("react-native-maps")),
    "`react-native-maps` saiu de `transformIgnorePatterns`. O `main` dela é "
    + "`src/index.ts`, TypeScript cru: sem a exceção, o pacote inteiro reprova "
    + "com erro de sintaxe dentro de `node_modules`.",
  );
});

/**
 * O dublê comum existe, e é ele que permite as telas terem teste.
 *
 * A biblioteca de verdade chama `TurboModuleRegistry.getEnforcing("AirMapsModule")`
 * no momento do `import`, e `getEnforcing` existe para ESTOURAR quando o módulo
 * nativo não está presente: no jest nunca está. Sem o dublê em `__mocks__/`, que
 * o jest usa automaticamente, toda tela que desenhar mapa derruba a própria
 * suíte, com um erro dentro de `node_modules` que ninguém associa ao mapa.
 */
test("o dublê comum de react-native-maps está no lugar em que o jest o acha sozinho", () => {
  const dubleE = join(RAIZ_DO_REPO, "apps", "campo", "__mocks__", "react-native-maps.tsx");
  assert.ok(
    existsSync(dubleE),
    "sumiu `apps/campo/__mocks__/react-native-maps.tsx`. Ele precisa ficar ao lado "
    + "de `node_modules` para o jest usá-lo sem ninguém escrever `jest.mock`, e sem "
    + "ele toda tela que importar o mapa perde os testes que já tem.",
  );
  const fonte = semComentarios(readFileSync(dubleE, "utf8"));
  assert.match(
    fonte, /PROVIDER_GOOGLE\s*=\s*"google"/,
    "o dublê divergiu da biblioteca: `PROVIDER_GOOGLE` vale `\"google\"` em "
    + "`react-native-maps/src/ProviderConstants.ts`, e um dublê que diz outra coisa "
    + "faz o portão do provedor passar com o valor errado.",
  );
});
