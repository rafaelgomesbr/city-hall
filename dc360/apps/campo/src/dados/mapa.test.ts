import { Linking, Platform } from "react-native";
import { abrirNoMapa, enderecosDoMapa } from "./mapa";

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
