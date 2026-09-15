import { Linking, Platform } from "react-native";

/*
  `enderecoDaApi()` lê `extra.apiUrl` no momento em que o módulo carrega, e sem
  este dublê ele sai VAZIO no jest: `buscarAutorizacaoDoMapa` devolveria vazio
  antes de chegar ao `fetch`, e os casos da autorização mediriam o dublê em vez
  de medirem a função.
*/
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { apiUrl: "https://api.exemplo.test", mapaChaveDoBuild: "do-binario" },
    },
  },
}));
/*
  A área de transferência é módulo NATIVO: no jest não existe nada por trás
  dela. O dublê devolve a promessa que o módulo devolve, para os casos poderem
  medir o que foi copiado e o que acontece quando o aparelho recusa.
*/
const mockCopiar = jest.fn<Promise<boolean>, [string]>();
jest.mock("expo-clipboard", () => ({
  setStringAsync: (texto: string) => mockCopiar(texto),
}));

import {
  abrirNoMapa, buscarAutorizacaoDoMapa, coordenadaEmTexto, copiarCoordenada,
  enderecosDoMapa, escolherChaveDoBuild, esquecerAutorizacaoDoMapa,
} from "./mapa";

/**
 * O que estes testes protegem: o pino cair na casa certa, e o botão fazer
 * alguma coisa.
 *
 * Três defeitos, todos invisíveis para quem testa na mesa:
 *
 * 1. `geo:LAT,LNG` sem o `?q=` com rótulo faz vários aplicativos de mapas do
 *    Android apenas centralizarem o mapa, sem pino. De dentro do carro, mapa
 *    centralizado sem pino é idêntico a mapa aberto no lugar errado.
 * 2. `encodeURIComponent` não escapa parênteses, e o parêntese é o delimitador
 *    do rótulo no esquema `geo:`. Endereço com "(fundos)" quebrava a URL.
 * 3. `canOpenURL` antes de abrir. No Android 11 em diante ele responde `false`
 *    para esquema não declarado em `<queries>`, e no iOS para esquema fora de
 *    `LSApplicationQueriesSchemes`. O botão ficaria mudo num aparelho com o
 *    aplicativo de mapas instalado e funcionando.
 *
 * A plataforma entra em `enderecosDoMapa` como argumento, e não lida de
 * `Platform` lá dentro, justamente para os dois formatos serem verificáveis
 * aqui sem simulador nem aparelho.
 */

const LAT = -27.595378;
const LNG = -48.548050;
const NA_WEB = "https://www.google.com/maps/search/?api=1&query=-27.595378,-48.548050";

describe("o endereço entregue ao aplicativo de mapas", () => {
  it("no iOS pede ROTA de carro até o destino, e não um ponto para olhar", () => {
    const [preferido] = enderecosDoMapa("ios", LAT, LNG, "Rua das Palmeiras, 120");
    expect(preferido).toBe(
      "http://maps.apple.com/?daddr=-27.595378,-48.548050&dirflg=d",
    );
  });

  it("no Android manda o q com rótulo, senão o mapa centraliza sem fincar pino", () => {
    const [preferido] = enderecosDoMapa("android", LAT, LNG, "Rua das Palmeiras, 120");
    expect(preferido).toBe(
      "geo:-27.595378,-48.548050?q=-27.595378,-48.548050(Rua%20das%20Palmeiras%2C%20120)",
    );
  });

  it("escapa o parêntese do endereço, que é o delimitador do próprio rótulo", () => {
    // O padrão vazio existe só para o tipo: lista sem primeiro item reprova
    // nas duas asserções abaixo do mesmo jeito.
    const [preferido = ""] = enderecosDoMapa("android", LAT, LNG, "Servidão do Morro (fundos)");
    expect(preferido).toContain("%28fundos%29");
    // O grupo do rótulo abre e fecha uma vez só. Parêntese de dentro do
    // endereço fechando o grupo cedo é exatamente o defeito.
    expect(preferido.match(/[()]/g)).toEqual(["(", ")"]);
  });

  it("sem rótulo não deixa um par de parênteses vazio na URL", () => {
    const [preferido] = enderecosDoMapa("android", LAT, LNG, "   ");
    expect(preferido).toBe("geo:-27.595378,-48.548050?q=-27.595378,-48.548050");
  });

  it("as duas plataformas terminam no https, que sempre tem quem atenda", () => {
    expect(enderecosDoMapa("ios", LAT, LNG, "Casa").at(-1)).toBe(NA_WEB);
    expect(enderecosDoMapa("android", LAT, LNG, "Casa").at(-1)).toBe(NA_WEB);
  });

  it("coordenada minúscula não vira notação científica dentro da URL", () => {
    // `String(0.0000001)` é "1e-7", e isso iria inteiro para a URL.
    const [preferido] = enderecosDoMapa("ios", 0.0000001, -48.5, "Casa");
    expect(preferido).not.toContain("e-");
    expect(preferido).toContain("daddr=0.000000,-48.500000");
  });

  it("corta o lixo de ponto flutuante da coordenada", () => {
    const [preferido] = enderecosDoMapa("ios", 1.1 + 2.2, -48.5, "Casa");
    expect(preferido).toContain("daddr=3.300000,-48.500000");
  });
});

describe("abrirNoMapa", () => {
  let abrir: jest.SpyInstance;
  let perguntar: jest.SpyInstance;

  beforeEach(() => {
    /*
      `mockReset` explícito, e não só `restoreAllMocks` no fim.

      `Linking` é uma instância, e o método vive no protótipo dela: espiar
      define uma propriedade própria, e a restauração não devolve o objeto ao
      estado anterior de forma confiável. Sem o reset, o segundo teste começa
      contando as chamadas do primeiro, e a contagem de tentativas (que é
      justamente o que estes testes verificam) passa a medir outra coisa.
    */
    abrir = jest.spyOn(Linking, "openURL");
    abrir.mockReset();
    abrir.mockResolvedValue(true);

    perguntar = jest.spyOn(Linking, "canOpenURL");
    perguntar.mockReset();
    perguntar.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("abre o esquema da plataforma sem perguntar antes se o aparelho sabe abrir", async () => {
    await expect(abrirNoMapa(LAT, LNG, "Rua das Palmeiras, 120")).resolves.toBe(true);

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith(
      enderecosDoMapa(Platform.OS, LAT, LNG, "Rua das Palmeiras, 120")[0],
    );
    // A armadilha: `canOpenURL` responde `false` para esquema não declarado no
    // manifesto (Android 11+) ou no Info.plist (iOS), e o botão ficaria mudo.
    expect(perguntar).not.toHaveBeenCalled();
  });

  it("cai no navegador quando nenhum aplicativo atende o esquema", async () => {
    abrir.mockRejectedValueOnce(new Error("No Activity found to handle Intent"));

    await expect(abrirNoMapa(LAT, LNG, "Rua das Palmeiras, 120")).resolves.toBe(true);

    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir).toHaveBeenLastCalledWith(NA_WEB);
  });

  it("devolve falso quando nem o navegador atende, para a tela poder avisar", async () => {
    abrir.mockRejectedValue(new Error("sem quem atenda"));

    await expect(abrirNoMapa(LAT, LNG, "Rua das Palmeiras, 120")).resolves.toBe(false);
  });

  it("não abre nada com coordenada faltando, para não fincar pino em lugar arbitrário", async () => {
    await expect(abrirNoMapa(Number.NaN, LNG, "Casa")).resolves.toBe(false);
    expect(abrir).not.toHaveBeenCalled();
  });
});

/* ============================================================
   A autorização do município, e a memória dela
   ============================================================ */

/**
 * A MEMÓRIA DA AUTORIZAÇÃO, que ninguém provava.
 *
 * `buscarAutorizacaoDoMapa` guarda a resposta numa variável de módulo, para a
 * sessão inteira do aplicativo, e `esquecerAutorizacaoDoMapa` existe, segundo o
 * comentário dela, "para o teste conseguir provar a memória". Nenhum caso
 * provava: a memória aparecia só como limpeza de `beforeEach` no teste do
 * gancho, e uma memória que ninguém exercita é uma memória que ninguém sabe se
 * guarda a coisa certa.
 *
 * O que importa aqui não é a economia de requisição. É o FRACASSO guardado: o
 * comentário do `catch` diz, com todas as letras, que guardar o fracasso faria
 * "o agente que subiu o morro sem sinal de manhã continuar no plano esquemático
 * à tarde, de volta ao escritório, com sinal cheio". Esse esquecimento só existe
 * no `catch`, e o servidor que RESPONDE mal não passa por ele.
 */
describe("a autorização do município, perguntada ao servidor", () => {
  const respostaBoa = { ok: true, json: async () => ({ mapaAutorizado: true, chaveDoMapa: "a-chave" }) };

  beforeEach(() => { esquecerAutorizacaoDoMapa(); });
  afterEach(() => { esquecerAutorizacaoDoMapa(); });

  it("pergunta UMA vez por sessão, e não a cada tela que desenha mapa", async () => {
    const chamada = jest.fn(async () => respostaBoa);
    (globalThis as { fetch: unknown }).fetch = chamada;

    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    /*
      Quatro telas desenham mapa e a lista remonta a cada foco, a cada sinal que
      volta e a cada 60 s. Sem a memória, cada remontagem gasta uma requisição
      ao servidor da prefeitura, pelo 3G do morro, para reler um campo que não
      muda durante o dia.
    */
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it("servidor que respondeu ERRO não fica guardado: com sinal de volta, pergunta de novo", async () => {
    /*
      O caso do morro. A API da prefeitura acorda fria e devolve 502, ou o token
      expirou e ela devolve 401, ou o portal cativo do wi-fi da prefeitura
      devolve uma página HTML com 200 que não é JSON. Nos três a resposta certa
      no instante é a mesma (não mande coordenada nenhuma para fora), e nos três
      a pergunta precisa poder ser refeita: o agente que desce o morro à tarde
      não pode continuar sem o mapa de ruas por causa de uma resposta ruim de
      manhã, sem nada na tela explicando por quê.
    */
    const chamada = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce(respostaBoa);
    (globalThis as { fetch: unknown }).fetch = chamada;

    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("corpo que não é JSON também não fica guardado", async () => {
    const chamada = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("<html>"); } })
      .mockResolvedValueOnce(respostaBoa);
    (globalThis as { fetch: unknown }).fetch = chamada;

    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
  });

  it("município que respondeu NÃO fica guardado: é escolha dele, e não falha", async () => {
    /*
      O outro lado, e ele precisa estar escrito: `mapaAutorizado: false` com
      200 é o município dizendo "não autorizo", e isso não muda durante o dia.
      Perguntar de novo a cada remontagem seria gastar a janela de sinal para
      reouvir um "não".
    */
    const chamada = jest.fn(async () => ({
      ok: true, json: async () => ({ mapaAutorizado: false, chaveDoMapa: "" }),
    }));
    (globalThis as { fetch: unknown }).fetch = chamada;

    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
    expect(chamada).toHaveBeenCalledTimes(1);
  });
});

describe("a chave do build, quando iOS e Android têm chaves diferentes", () => {
  /*
    O console do Google pede UM tipo de restrição por chave: em "Restrições do
    aplicativo" as opções são botão de rádio, não caixa de seleção. Quer dizer
    que uma chave restrita a Apps iOS NÃO funciona no Android, e vice-versa.

    Enquanto o aplicativo usava uma variável só para as duas plataformas, a
    escolha real era entre "uma chave sem restrição nenhuma" (que qualquer um
    gasta no cartão de quem publicou) e "uma das duas plataformas sem mapa". As
    duas são ruins, e a segunda é silenciosa: sem chave o iOS ignora
    `PROVIDER_GOOGLE` e o Apple Maps desenha no lugar.

    `extra` é um objeto só, compartilhado pelas duas plataformas dentro do
    mesmo manifesto, então quem escolhe é o aparelho, em tempo de execução.
  */
  it("no iPhone vale a chave do iPhone", () => {
    expect(
      escolherChaveDoBuild({ ios: "chave-do-iphone", android: "chave-do-android" }, "ios"),
    ).toBe("chave-do-iphone");
  });

  it("no Android vale a chave do Android", () => {
    expect(
      escolherChaveDoBuild({ ios: "chave-do-iphone", android: "chave-do-android" }, "android"),
    ).toBe("chave-do-android");
  });

  /*
    Uma plataforma com chave e a outra sem é estado legítimo, e é exatamente o
    de hoje: existe chave de iOS e não existe build Android. A que não tem
    precisa responder VAZIO, que é o que faz `decidirModoDoMapa` recusar o modo
    Google em vez de mandar o SDK tentar com uma chave que não é dele.
  */
  it("a plataforma sem chave responde vazio, e não a chave da outra", () => {
    expect(escolherChaveDoBuild({ ios: "só-iphone", android: "" }, "android")).toBe("");
  });

  /*
    Compatibilidade com o formato anterior, e ela não é cortesia: um aplicativo
    já instalado continua lendo o `extra` que foi assado no binário dele, e
    esse `extra` é uma string. Sem este caminho, toda instalação existente
    passaria a achar que não tem chave.
  */
  it("o formato antigo, de uma chave só, continua valendo para as duas", () => {
    expect(escolherChaveDoBuild("chave-única", "ios")).toBe("chave-única");
    expect(escolherChaveDoBuild("chave-única", "android")).toBe("chave-única");
  });

  it("sem nada em extra, responde vazio em vez de estourar", () => {
    expect(escolherChaveDoBuild(undefined, "ios")).toBe("");
    expect(escolherChaveDoBuild({ ios: 7 }, "ios")).toBe("");
  });
});

/* ============================================================
   Copiar a coordenada
   ============================================================ */

describe("copiar a coordenada", () => {
  beforeEach(() => { mockCopiar.mockClear(); mockCopiar.mockResolvedValue(true); });

  /*
    O formato é o MESMO que a tarja de erro já imprime quando nenhum aplicativo
    de mapas atende, e é o que o Google Maps, o Apple Maps e o Waze aceitam
    quando alguém cola no campo de busca: latitude, vírgula, espaço, longitude,
    seis casas em cada. Dois formatos para a mesma coordenada, na mesma tela,
    seria o agente ditando um por rádio e colando o outro.
  */
  it("o texto tem seis casas, vírgula e espaço", () => {
    expect(coordenadaEmTexto(-27.595378, -48.54805)).toBe("-27.595378, -48.548050");
  });

  it("nada de notação científica nem de lixo de ponto flutuante", () => {
    expect(coordenadaEmTexto(0.0000001, 3.3000000000000003))
      .toBe("0.000000, 3.300000");
  });

  it("copia exatamente esse texto para a área de transferência", async () => {
    expect(await copiarCoordenada(-27.595378, -48.54805)).toBe(true);
    expect(mockCopiar).toHaveBeenCalledWith("-27.595378, -48.548050");
  });

  /*
    Coordenada ausente não vira texto. Sem esta guarda o agente copiaria
    "NaN, NaN", colaria no aplicativo de mapas, e o mapa abriria em algum lugar
    arbitrário: o mesmo desfecho que `abrirNoMapa` já recusa na entrada.
  */
  it("coordenada inválida não copia nada", async () => {
    expect(await copiarCoordenada(Number.NaN, -48.5)).toBe(false);
    expect(mockCopiar).not.toHaveBeenCalled();
  });

  /*
    O módulo nativo pode recusar (área de transferência bloqueada por política
    de aparelho gerenciado, por exemplo). A tela precisa poder dizer que não
    deu, e não fingir que deu.
  */
  it("recusa do aparelho vira `false`, e não exceção solta", async () => {
    mockCopiar.mockRejectedValue(new Error("sem área de transferência"));
    expect(await copiarCoordenada(-27.595378, -48.54805)).toBe(false);
  });
});
