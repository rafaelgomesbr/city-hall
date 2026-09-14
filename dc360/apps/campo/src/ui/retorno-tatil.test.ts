/**
 * A ponte com o motor tátil.
 *
 * Este arquivo prova QUAL chamada sai para qual momento, em qual plataforma, e
 * que o aplicativo não quebra quando ela falha. O que ele não prova, e não tem
 * como provar, é a vibração: motor tátil não existe em simulador de teste, e
 * se o aparelho realmente treme (e como treme) só o iPhone na mão diz.
 *
 * O caso do Android é o que justifica este arquivo existir separado, e ele saiu
 * da leitura do módulo, não de suposição: lá `impactAsync` e `notificationAsync`
 * chamam `Vibrator` DIRETO, e o `Vibrator` ignora a preferência de retorno
 * tátil do sistema. Quem desligou continuaria sentindo. Só
 * `performAndroidHapticsAsync` passa por `View.performHapticFeedback`, que é o
 * caminho que respeita o ajuste. Por isso o código tem dois caminhos, e por
 * isso existe um caso para cada um: se alguém "simplificar" para uma chamada
 * só, o Android volta a desobedecer a pessoa em silêncio.
 */

import { Platform } from "react-native";

const mockImpacto = jest.fn<Promise<void>, [string]>(async () => undefined);
const mockNotificacao = jest.fn<Promise<void>, [string]>(async () => undefined);
const mockAndroid = jest.fn<Promise<void>, [string]>(async () => undefined);

jest.mock("expo-haptics", () => ({
  impactAsync: (estilo: string) => mockImpacto(estilo),
  notificationAsync: (tipo: string) => mockNotificacao(tipo),
  performAndroidHapticsAsync: (tipo: string) => mockAndroid(tipo),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  AndroidHaptics: { Confirm: "confirm", Reject: "reject", Context_Click: "context-click" },
}));

import { retornoTatil } from "./retornoTatil";

const plataformaOriginal = Platform.OS;

function comPlataforma(qual: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: qual, configurable: true });
}

beforeEach(() => {
  mockImpacto.mockClear();
  mockNotificacao.mockClear();
  mockAndroid.mockClear();
  mockImpacto.mockResolvedValue(undefined);
  mockNotificacao.mockResolvedValue(undefined);
  mockAndroid.mockResolvedValue(undefined);
  comPlataforma("ios");
});

afterAll(() => { comPlataforma(plataformaOriginal as "ios" | "android"); });

describe("no iPhone", () => {
  it("o que pegou é um toque leve, e não médio nem pesado", async () => {
    retornoTatil("confirmado");
    await Promise.resolve();
    expect(mockImpacto).toHaveBeenCalledWith("light");
    expect(mockNotificacao).not.toHaveBeenCalled();
  });

  /*
    "Terminou" tem forma própria no iOS: dois toques, reconhecíveis sem olhar.
    Usar o mesmo toque curto da foto para a vistoria concluída diria que os
    dois fatos têm o mesmo tamanho, e eles não têm: um é uma foto, o outro é
    quarenta minutos de morro.
  */
  it("o que terminou usa a forma de sucesso do sistema", async () => {
    retornoTatil("concluido");
    await Promise.resolve();
    expect(mockNotificacao).toHaveBeenCalledWith("success");
    expect(mockImpacto).not.toHaveBeenCalled();
  });
});

describe("no Android", () => {
  /*
    O caminho que RESPEITA o ajuste de acessibilidade. `impactAsync` aqui
    vibraria por cima de quem desligou o retorno tátil no sistema.
  */
  it("passa pelo retorno tátil do sistema, e não pelo vibrador direto", async () => {
    comPlataforma("android");
    retornoTatil("concluido");
    await Promise.resolve();
    expect(mockAndroid).toHaveBeenCalledWith("confirm");
    expect(mockImpacto).not.toHaveBeenCalled();
    expect(mockNotificacao).not.toHaveBeenCalled();
  });

  it("o que pegou é o toque de contexto, mais curto que a confirmação", async () => {
    comPlataforma("android");
    retornoTatil("confirmado");
    await Promise.resolve();
    expect(mockAndroid).toHaveBeenCalledWith("context-click");
  });
});

describe("o que nunca sai daqui", () => {
  /*
    Não existe momento de erro nesta porta, e é de propósito: o tipo tem dois
    valores, e nenhum dos dois é "deu errado". Vibrar em erro é punir a mão de
    quem já está com um problema, e o que a pessoa aprende com isso é a
    desligar o retorno tátil inteiro. Este caso morre no dia em que alguém
    acrescentar um terceiro momento sem pensar nisso.
  */
  it("nenhum momento produz a forma de erro nem a de recusa", async () => {
    for (const momento of ["confirmado", "concluido"] as const) {
      retornoTatil(momento);
    }
    await Promise.resolve();
    expect(mockNotificacao).not.toHaveBeenCalledWith("error");
    expect(mockNotificacao).not.toHaveBeenCalledWith("warning");
    expect(mockAndroid).not.toHaveBeenCalledWith("reject");
  });
});

describe("quando o motor tátil não responde", () => {
  /*
    O aparelho que está na mão do Rafa hoje foi compilado ANTES de esta
    dependência existir, então a ponte nativa simplesmente não está lá. Um
    aplicativo que quebra por não conseguir vibrar seria muito pior do que um
    que não vibra.
  */
  it("a promessa rejeitada não vira erro para quem chamou", async () => {
    mockImpacto.mockRejectedValue(new Error("ExpoHaptics não encontrado"));
    expect(() => { retornoTatil("confirmado"); }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("a chamada que estoura na hora também não", () => {
    mockNotificacao.mockImplementation(() => { throw new Error("módulo ausente"); });
    expect(() => { retornoTatil("concluido"); }).not.toThrow();
  });

  /*
    E não espera. O retorno tátil confirma um ato; esperar por ele atrasaria o
    ato que ele confirma, e a régua desta frente diz que animação (e retorno)
    nunca segura o dedo.
  */
  it("devolve na hora: não é promessa, então ninguém consegue esperar por ela", () => {
    /* A ponte que nunca responde. Se `retornoTatil` devolvesse a promessa
       dela, bastaria um `await` distraído para a foto ficar presa esperando o
       aparelho vibrar. */
    mockImpacto.mockImplementation(() => new Promise<void>(() => undefined));
    const devolvido: unknown = retornoTatil("confirmado");
    expect(devolvido).toBeUndefined();
  });
});
