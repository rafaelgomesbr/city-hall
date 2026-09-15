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
 * ## O caminho por ruas, e o ÚNICO lugar onde ele pode ser pedido
 *
 * Desde 15/09/2026 o produto traça o caminho por ruas a pedido do agente
 * ("Ver o caminho", na tela do mapa). A chamada ao Google acontece na API do
 * produto, em `apps/api/src/rotas/rota.ts`, com uma chave de servidor que
 * nunca sai de lá: a do aplicativo é restrita a Apps iOS ou Android e o Google
 * a recusa por HTTP. Por isso a regra de Directions/Routes ficou com DUAS
 * varreduras: no aplicativo ela continua proibida em qualquer arquivo, e na
 * API ela é permitida naquele arquivo e reprovada em qualquer outro. O
 * caso-irmão prova que o portão morde fora dele.
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
import { join, relative, sep } from "node:path";

import {
  RAIZ_DO_APP, RAIZ_DO_REPO, arquivosDeFonte, nomeCurto, semComentarios,
} from "./fonte-do-aplicativo.mjs";

const APP_CONFIG = join(RAIZ_DO_REPO, "apps", "campo", "app.config.ts");

/** As fontes da API, produto e teste. */
const FONTES_DA_API = [
  join(RAIZ_DO_REPO, "apps", "api", "src"),
  join(RAIZ_DO_REPO, "apps", "api", "test"),
];

/**
 * O único arquivo do repositório que pode citar Directions ou Routes do
 * Google. A chave de servidor mora na configuração dele, a máscara de campos
 * é fechada, a cache é memória e nenhuma coordenada é registrada: tudo isso
 * é medido em `apps/api/test/rota.test.ts`, e o portão aqui só garante que
 * não existe um SEGUNDO lugar chamando o Google sem aquelas medidas.
 */
export const UNICO_LUGAR_DO_CAMINHO = join(RAIZ_DO_REPO, "apps", "api", "src", "rotas", "rota.ts");

/** Caminho relativo à raiz do repositório, para as mensagens da API. */
function nomeNoRepo(caminho) {
  return relative(RAIZ_DO_REPO, caminho).split(sep).join("/");
}

/**
 * A regra do caminho por ruas, separada porque ela é a única com dois
 * alcances: proibida no aplicativo inteiro, e permitida num arquivo só da API.
 *
 * `computeRoutes` e `routes.googleapis.com` são a Routes API (v2), e
 * `maps/api/directions` é a Directions antiga, que o Google pôs em manutenção:
 * as duas entram porque trocar uma pela outra não muda o que sai do país.
 */
export const REGRA_DO_CAMINHO = {
  nome: "Directions ou Routes do Google",
  padrao: /maps\/api\/directions|\bMapViewDirections\b|routes\.googleapis\.com|computeRoutes/i,
  porque:
    "o caminho por ruas manda a posição do agente para fora do país, e só pode "
    + "ser pedido de um lugar: `apps/api/src/rotas/rota.ts`, com a chave de "
    + "servidor que nunca sai de lá, a máscara de campos fechada e a cache que "
    + "não registra coordenada. No aplicativo, a chave do binário nem serve para "
    + "HTTP, e `abrirNoMapa` entrega ao aplicativo de mapas do aparelho",
};

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
  REGRA_DO_CAMINHO,
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

/**
 * A varredura da API, só com a regra do caminho, e só fora do arquivo dele.
 *
 * Recebe a lista de arquivos e o leitor para o caso-irmão conseguir provar que
 * ela morde: um portão que só é rodado contra a árvore de verdade nunca viu o
 * defeito que ele proíbe, e não sabe se sabe reconhecê-lo.
 */
export function varrerCaminhoNaApi(arquivos, ler = (caminho) => readFileSync(caminho, "utf8")) {
  const achados = [];
  for (const caminho of arquivos) {
    if (caminho === UNICO_LUGAR_DO_CAMINHO) continue;
    const linhas = semComentarios(ler(caminho)).split("\n");
    linhas.forEach((linha, i) => {
      if (REGRA_DO_CAMINHO.padrao.test(linha)) {
        achados.push(`${nomeNoRepo(caminho)}:${i + 1} [${REGRA_DO_CAMINHO.nome}] porque: ${REGRA_DO_CAMINHO.porque}`);
      }
    });
  }
  return achados;
}

test("nenhum arquivo do aplicativo chama geocodificação, Places ou Directions", () => {
  const achados = varrer();
  assert.deepEqual(
    achados, [],
    "o aplicativo passou a chamar serviço do Google que ele não precisa, e que leva "
    + "para fora do país dado que `docs/SUBPROCESSADORES.md` promete que fica aqui:\n"
    + achados.join("\n"),
  );
});

test("na API, só `rotas/rota.ts` chama a Routes API do Google, e ele de fato chama", () => {
  /*
    As duas metades. A primeira: nenhum OUTRO arquivo da API cita o serviço,
    porque um segundo lugar seria um lugar sem a máscara de campos, sem a cache
    e, cedo ou tarde, com a coordenada num log. A segunda: o arquivo permitido
    existe e cita, senão a exceção é uma permissão pendurada esperando alguém
    criar um arquivo com aquele nome para outra coisa.
  */
  const arquivos = FONTES_DA_API.flatMap((pasta) => arquivosDeFonte(pasta, { somenteProduto: false }));
  assert.ok(arquivos.length > 30, `a varredura da API achou só ${arquivos.length} arquivos`);
  assert.ok(arquivos.includes(UNICO_LUGAR_DO_CAMINHO), "não achou apps/api/src/rotas/rota.ts");

  const achados = varrerCaminhoNaApi(arquivos);
  assert.deepEqual(
    achados, [],
    "a API passou a chamar Directions ou Routes fora de `rotas/rota.ts`:\n" + achados.join("\n"),
  );

  const oPermitido = semComentarios(readFileSync(UNICO_LUGAR_DO_CAMINHO, "utf8"));
  assert.match(
    oPermitido, /routes\.googleapis\.com\/directions\/v2:computeRoutes/,
    "o arquivo permitido não chama mais a Routes API: a exceção virou permissão pendurada",
  );
  assert.match(
    oPermitido, /X-Goog-FieldMask/,
    "o pedido ao Google perdeu a máscara de campos, e sem ela o Google cobra o nível mais caro",
  );
});

test("o portão do caminho MORDE fora do arquivo permitido, e só fora dele", () => {
  /*
    O caso-irmão. Dois arquivos de mentira com a MESMA linha: o permitido e um
    outro qualquer da API. A varredura precisa acusar o segundo e só o segundo.
    Sem este caso, um `continue` escrito no lugar errado (pulando tudo em vez
    de pular o arquivo) daria verde para sempre.
  */
  const outro = join(RAIZ_DO_REPO, "apps", "api", "src", "rotas", "ocorrencias.ts");
  const linha = 'const url = "https://routes.googleapis.com/directions/v2:computeRoutes";';
  const ler = () => `import x from "y";\n${linha}\n`;

  const achados = varrerCaminhoNaApi([UNICO_LUGAR_DO_CAMINHO, outro], ler);
  assert.equal(achados.length, 1, `esperava um achado, veio: ${JSON.stringify(achados)}`);
  assert.match(achados[0], /^apps\/api\/src\/rotas\/ocorrencias\.ts:2 /);

  /* E a Directions antiga também é pega, no mesmo lugar. */
  const antiga = () => 'fetch("https://maps.googleapis.com/maps/api/directions/json");\n';
  assert.equal(varrerCaminhoNaApi([outro], antiga).length, 1);

  /* E um comentário citando o serviço, no arquivo errado, NÃO é achado. */
  const soComentario = () => "// a Routes API (computeRoutes) mora em rotas/rota.ts\n";
  assert.equal(varrerCaminhoNaApi([outro], soComentario).length, 0);
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
    'await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", opcoes);',
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

test("a limpeza apaga comentário, e o TEXTO LITERAL sobrevive inteiro", () => {
  /*
    Duas metades, e a segunda faltava.

    A primeira é o incentivo: sem apagar comentário, o portão reprovaria o
    parágrafo que EXPLICA por que geocodificação está proibida, e o jeito de
    deixar verde seria apagar a explicação. Metade dos arquivos deste aplicativo
    tem parágrafos contando o defeito que a linha abaixo conserta.

    A segunda é o contrário, e nada a defendia: texto literal PRECISA sobreviver
    à limpeza. Duas das regras de `PROIBIDAS` só existem dentro de aspas e em
    lugar nenhum mais, e o mesmo vale para a conferência do `app.config.ts`:
    `"https://maps.googleapis.com/maps/api/directions/json"` é uma string, e
    `"AIzaSy..."` é sempre uma string. Uma limpeza que esvaziasse o miolo das
    aspas deixaria essas três conferências cegas em silêncio, e o portão
    continuaria verde para sempre.

    O caso anterior tinha o título certo pela metade ("apaga comentário e texto
    de tela") e não olhava o texto de tela em asserção nenhuma. Ele passava com
    a limpeza preservando o literal E com ela apagando o literal, que são
    comportamentos opostos: um caso indiferente ao que o título dele promete.
  */
  const fonte = [
    "// nada de reverseGeocodeAsync aqui",
    "const real = new Geocoder();",
    'const url = "https://maps.googleapis.com/maps/api/directions/json";',
    'const chave = "AIzaSyB1cQwErTyUiOpAsDfGhJkL";',
    "/* AIzaSyNaoDeveriaSerVistaPorqueEComentario */",
  ].join("\n");
  const limpo = semComentarios(fonte).split("\n");

  assert.ok(!limpo[0].includes("reverseGeocodeAsync"), "não apagou o comentário de linha");
  assert.ok(!limpo[4].includes("AIza"), "não apagou o comentário de bloco");
  assert.ok(limpo[1].includes("new Geocoder()"), "apagou código de verdade");
  /*
    As duas linhas que sustentam três conferências deste arquivo. Se alguma
    delas sair vazia, a chave do fornecedor e a URL de serviço pago passam a
    entrar no aplicativo sem ninguém acusar.
  */
  assert.ok(
    limpo[2].includes("maps/api/directions"),
    "a limpeza esvaziou o texto literal, e as regras de URL do Google ficaram cegas",
  );
  assert.ok(
    limpo[3].includes("AIzaSyB1cQwErTyUiOpAsDfGhJkL"),
    "a limpeza esvaziou o texto literal, e a regra da chave do Google ficou cega",
  );
  assert.equal(limpo.length, 5, "a contagem de linhas mudou");
});

test("as regras pegam o que deveriam pegar DEPOIS da limpeza, e não só no texto cru", () => {
  /*
    O caso irmão do de cima, e ele fecha o buraco pelo outro lado.

    "As próprias regras pegam o que deveriam pegar" prova as expressões
    regulares contra o texto CRU. A varredura de verdade não vê texto cru: ela
    vê `semComentarios(arquivo)`. Entre uma coisa e outra cabe um portão que
    prova a régua e mede outra coisa, que é o modo de falha mais caro de todos,
    porque a régua provada dá a sensação de que está tudo coberto.
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
    const comoAVarreduraVe = semComentarios(caso);
    assert.ok(
      PROIBIDAS.some((r) => r.padrao.test(comoAVarreduraVe)),
      `a varredura não pega, depois da limpeza: ${caso}`,
    );
  }
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

test("cada plataforma tem a SUA chave, e nenhuma delas fica sem", () => {
  /*
    O modo de falha que este caso fecha é assimétrico e silencioso.

    Passando a chave só em `androidGoogleMapsApiKey`, o Android desenha o mapa
    do Google e o iOS NÃO: sem `iosGoogleMapsApiKey` o plugin não acrescenta o
    pod `react-native-maps/Google` ao Podfile, e aí `PROVIDER_GOOGLE` é
    ignorado e o Apple Maps desenha no lugar, com o estilo gerado dos nossos
    tokens jogado fora e sem erro nenhum. Quem testa no Android vê tudo certo.

    Até 14/09/2026 este caso exigia que as duas saíssem da MESMA constante, e a
    razão era boa: dois lugares dizendo a mesma coisa é como um deles envelhece
    em silêncio. O que mudou não foi a régua, foi o mundo: no console do Google
    "Restrições do aplicativo" é botão de rádio, então uma chave restrita a
    Apps iOS não funciona no Android. Uma constante só obrigava a escolher
    entre chave sem restrição nenhuma e uma plataforma sem mapa.

    O que continua travado é o que importava: cada plataforma sai de uma
    constante NOMEADA, e nenhuma das duas pode sumir ou virar valor escrito à
    mão ali dentro.
  */
  const config = semComentarios(readFileSync(APP_CONFIG, "utf8"));
  const porPlataforma = {
    iosGoogleMapsApiKey: "CHAVE_DO_MAPA_IOS",
    androidGoogleMapsApiKey: "CHAVE_DO_MAPA_ANDROID",
  };
  for (const [campo, constante] of Object.entries(porPlataforma)) {
    assert.match(
      config, new RegExp(`${campo}:\\s*${constante}\\b`),
      `${campo} não sai de ${constante} no app.config.ts. Uma das duas `
      + "plataformas ficou sem mapa do Google, e no iOS isso vira Apple Maps em silêncio.",
    );
    assert.match(
      config, new RegExp(`const ${constante}\\s*=`),
      `${constante} não é definida no app.config.ts`,
    );
  }

  /*
    E as duas constantes precisam nascer do AMBIENTE, direta ou indiretamente.
    Sem isto, `const CHAVE_DO_MAPA_IOS = "AIza..."` passaria pelo laço acima.
    O caso da chave escrita à mão, logo acima, pega o literal do Google; este
    pega o caminho mais chato, que é alguém amarrar a constante a outra coisa
    qualquer que não vem de quem compila.
  */
  for (const constante of Object.values(porPlataforma)) {
    assert.match(
      config,
      new RegExp(`const ${constante}\\s*=[^;]*(?:process\\.env|CHAVE_DO_MAPA\\b)`),
      `${constante} não sai do ambiente: uma chave amarrada dentro do `
      + "app.config.ts é a chave do fornecedor pagando o mapa de todas as prefeituras.",
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
