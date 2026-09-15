import { useEffect } from "react";
import { Text, View } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

/**
 * A PERGUNTA DE SAIR DA VISTORIA, compartilhada entre a barra e o sino.
 *
 * A barra promete perguntar antes de sair de vistoria começada. O sino do
 * cabeçalho também é uma saída (leva aos avisos), e um sino que saísse sem
 * perguntar quebraria a promessa na mesma tela. As duas saídas perguntam pela
 * mesma guarda, e este arquivo prova a guarda pelo lado do sino: o lado da
 * barra está em `__tests__/menu-de-vidro-e-transicoes.test.tsx`.
 *
 * E prova a razão estrutural de a guarda existir como provedor: quando ela
 * pergunta (muda de estado), os filhos dela NÃO são redesenhados. É isso que
 * permite pôr a guarda entre o layout das abas e o navegador sem reabrir a
 * aba escura.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "light",
}));

const mockEmpurrar = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockEmpurrar(...args) },
}));

jest.mock("./useReducaoDeMovimento", () => ({ useReducaoDeMovimento: () => false }));

let mockTemRascunho = false;
let mockDiscoQuebrado = false;
const mockLerRascunho = jest.fn(async (ocorrenciaId: string) => {
  if (mockDiscoQuebrado) throw new Error("disco recusou a leitura");
  return mockTemRascunho ? { ocorrenciaId } : null;
});
jest.mock("../dados/rascunho", () => ({
  lerRascunho: (id: string) => mockLerRascunho(id),
}));

jest.mock("../dados/banco-local", () => ({
  bancoLocal: async () => { throw new Error("o sino não abre o banco"); },
}));
jest.mock("../dados/avisos", () => {
  const real = jest.requireActual("../dados/avisos") as typeof import("../dados/avisos");
  return {
    textoDoCracha: real.textoDoCracha,
    fraseDoSino: real.fraseDoSino,
    useContagemDeAvisos: () => ({ porLer: 2, truncado: false, lida: true }),
  };
});

import {
  GuardaDeSaidaDaVistoria, ROTA_DA_VISTORIA, haVistoriaComecada, useGuardaDeSaida,
  type RotaAberta,
} from "./GuardaDeSaidaDaVistoria";
import { Sino } from "./Sino";

const ID = "3f1c6c4e-0a1b-4c2d-8e3f-000000000001";
const NA_VISTORIA: RotaAberta = { name: ROTA_DA_VISTORIA, params: { id: ID } };

/** O papel da barra: dizer à guarda onde o agente está. */
function Registrador({ rota }: { rota: RotaAberta }) {
  const guarda = useGuardaDeSaida();
  useEffect(() => { guarda.registrarRotaAberta(rota); }, [guarda, rota]);
  return null;
}

/** Um filho que conta quantas vezes foi desenhado: é o `<Tabs>` de mentira. */
let renderizacoesDoFilho = 0;
function FilhoContado() {
  renderizacoesDoFilho += 1;
  return <View><Text>navegador</Text></View>;
}

type Tela = Awaited<ReturnType<typeof render>>;

async function montar(rota: RotaAberta): Promise<Tela> {
  let tela: Tela | null = null;
  const arvore = (
    <GuardaDeSaidaDaVistoria>
      <Registrador rota={rota} />
      <FilhoContado />
      <Sino />
    </GuardaDeSaidaDaVistoria>
  );
  await act(async () => { tela = (await render(arvore)) as Tela; });
  if (!tela) throw new Error("a guarda não montou");
  return tela;
}

beforeEach(() => {
  mockTemRascunho = false;
  mockDiscoQuebrado = false;
  mockEmpurrar.mockClear();
  mockLerRascunho.mockClear();
  renderizacoesDoFilho = 0;
});

describe("o sino pergunta pela mesma guarda que a barra", () => {
  it("na vistoria começada, tocar no sino pergunta em vez de sair", async () => {
    mockTemRascunho = true;
    const tela = await montar(NA_VISTORIA);

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });

    expect(tela.getByTestId("dialogo-de-sair-da-vistoria")).toBeTruthy();
    expect(mockEmpurrar).not.toHaveBeenCalled();
    /* A pergunta é sobre a ocorrência aberta, e não sobre qualquer rascunho. */
    expect(mockLerRascunho).toHaveBeenCalledWith(ID);
  });

  it("confirmar leva aos avisos, e o botão diz o destino", async () => {
    mockTemRascunho = true;
    const tela = await montar(NA_VISTORIA);

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });
    const acao = tela.getByTestId("dialogo-acao");
    expect(JSON.stringify(acao.props.accessibilityLabel ?? "")).toContain("Avisos");
    await act(async () => { fireEvent.press(acao); });

    expect(mockEmpurrar).toHaveBeenCalledWith("/(agente)/avisos");
  });

  it("recusar mantém o agente na vistoria", async () => {
    mockTemRascunho = true;
    const tela = await montar(NA_VISTORIA);

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });
    await act(async () => { fireEvent.press(tela.getByTestId("dialogo-recusa")); });

    expect(mockEmpurrar).not.toHaveBeenCalled();
    expect(tela.queryByTestId("dialogo-de-sair-da-vistoria")).toBeNull();
  });

  it("vistoria aberta e não preenchida não pergunta: o sino sai na hora", async () => {
    mockTemRascunho = false;
    const tela = await montar(NA_VISTORIA);

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });

    expect(tela.queryByTestId("dialogo-de-sair-da-vistoria")).toBeNull();
    expect(mockEmpurrar).toHaveBeenCalledWith("/(agente)/avisos");
  });

  it("fora da vistoria, o disco nem é consultado", async () => {
    mockTemRascunho = true;
    const tela = await montar({ name: "index" });

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });

    expect(mockLerRascunho).not.toHaveBeenCalled();
    expect(mockEmpurrar).toHaveBeenCalledWith("/(agente)/avisos");
  });

  /*
    Sem provedor (uma tela fora das abas, ou o sino montado sozinho), ninguém
    pergunta e a saída segue: a guarda ausente não pode prender o sino.
  */
  it("sem a guarda montada, o sino segue direto", async () => {
    mockTemRascunho = true;
    let tela: Tela | null = null;
    await act(async () => { tela = (await render(<Sino />)) as Tela; });

    await act(async () => { fireEvent.press((tela as Tela).getByTestId("sino")); });

    expect(mockEmpurrar).toHaveBeenCalledWith("/(agente)/avisos");
  });
});

describe("a guarda pergunta sem redesenhar quem está dentro dela", () => {
  /*
    A razão estrutural: a guarda fica entre o layout das abas e o navegador,
    e "estou perguntando" é estado. Se esse estado redesenhasse os filhos, o
    navegador seria redesenhado no meio de uma transição e a aba escura
    voltaria pela porta da guarda.
  */
  it("abrir a pergunta não redesenha os filhos do provedor", async () => {
    mockTemRascunho = true;
    const tela = await montar(NA_VISTORIA);
    expect(renderizacoesDoFilho).toBe(1);

    await act(async () => { fireEvent.press(tela.getByTestId("sino")); });
    expect(tela.getByTestId("dialogo-de-sair-da-vistoria")).toBeTruthy();

    expect(renderizacoesDoFilho).toBe(1);
  });
});

describe("o que conta como vistoria começada", () => {
  it("só a rota da vistoria, com identificador e com rascunho no disco", async () => {
    mockTemRascunho = true;
    expect(await haVistoriaComecada(NA_VISTORIA)).toBe(true);
    expect(await haVistoriaComecada({ name: "fila" })).toBe(false);
    expect(await haVistoriaComecada({ name: ROTA_DA_VISTORIA })).toBe(false);
    expect(await haVistoriaComecada(null)).toBe(false);
  });

  it("vistoria aberta sem rascunho não conta como começada", async () => {
    mockTemRascunho = false;
    expect(await haVistoriaComecada(NA_VISTORIA)).toBe(false);
  });

  /*
    Disco recusando leitura não pode PRENDER o agente na tela: o pior caso de
    deixar passar é uma saída sem pergunta, com o rascunho intacto no disco.
  */
  it("disco que recusa a leitura deixa sair, em vez de prender", async () => {
    mockTemRascunho = true;
    mockDiscoQuebrado = true;
    expect(await haVistoriaComecada(NA_VISTORIA)).toBe(false);
  });
});
