import { act, render } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo" } } },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("./PortaExpo", () => ({ portaExpo: null }));

jest.mock("./convite", () => ({
  jaConvidou: jest.fn(async () => true),
  marcarConvidado: jest.fn(async () => undefined),
}));

jest.mock("./ficha-do-aparelho", () => ({
  guardarFicha: jest.fn(async () => undefined),
  fichaGuardada: jest.fn(async () => null),
  esquecerFicha: jest.fn(async () => undefined),
}));

jest.mock("../dados/api", () => ({
  ...jest.requireActual("../dados/api"),
  registrarAparelho: jest.fn(async () => undefined),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    carregando: false,
    identidade: mockOrganizacao === null ? null : {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: mockOrganizacao,
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
    obterToken: async () => "token-de-mentira",
    entrar: async () => undefined,
    sair: async () => undefined,
  }),
}));

/*
  A camada de dados, dublada: o que interessa aqui é a LIGAÇÃO. O gancho de
  "tarefa nova chegou" tem prova própria em `dados/tarefa-nova-avisa.test.ts`;
  este arquivo prova que o provedor está ouvindo o gancho e o que ele faz com o
  que ouve.
*/
type TarefaNova = { id: string; severidade: string | null };
let mockOuvinte: ((novas: readonly TarefaNova[]) => void) | null = null;
const mockMarcarVistas = jest.fn(async (_ids: readonly string[]) => undefined);

jest.mock("../dados/pendencias", () => ({
  aoChegarTarefaNova: (ouvinte: (novas: readonly TarefaNova[]) => void) => {
    mockOuvinte = ouvinte;
    return () => { if (mockOuvinte === ouvinte) mockOuvinte = null; };
  },
  marcarTarefasVistas: (ids: readonly string[]) => mockMarcarVistas(ids),
}));

const mockTatil = jest.fn((_momento: string) => undefined);
jest.mock("../ui/retornoTatil", () => ({
  retornoTatil: (momento: string) => mockTatil(momento),
}));

let mockOrganizacao: string | null = null;

import { router } from "expo-router";
import { criarDuploDePorta } from "./duplo-de-porta";
import { ProvedorDePush } from "./ProvedorDePush";

/**
 * A tarefa nova avisa com o aplicativo ABERTO: som, faixa e vibração.
 *
 * O push cobre o aplicativo fechado. Aberto, quem descobre o despacho é a
 * atualização periódica da lista, e o que ela descobre precisa virar o MESMO
 * aviso que viria pela Apple ou pelo Google: mesmo texto genérico, mesmo som
 * característico, mesmo canal do Android, mais o retorno tátil, porque o
 * telefone pode estar na mão sem ninguém olhando para a tela.
 *
 * O que fica provado aqui, e por quê:
 *
 * 1. O provedor escuta o gancho da camada de dados e dispara um aviso LOCAL
 *    por tarefa nova, pela porta (que é o mesmo caminho testável do resto da
 *    notificação; ver `porta.ts`).
 * 2. O aviso local carrega o dado no formato do push, então tocar nele passa
 *    por `decidirAviso` e abre a vistoria certa.
 * 3. Sem sessão não há aviso local: sem município não há como carimbar o dado,
 *    e sem carimbo a terceira barreira não teria o que examinar.
 * 4. O que o push já contou é marcado como visto, para a atualização seguinte
 *    não tocar de novo pelo mesmo despacho.
 */

const MUNICIPIO_A = "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa";
const MUNICIPIO_B = "7b2d5e8a-1c3d-4e5f-9a0b-bbbbbbbbbbbb";
const OCORRENCIA = "11111111-2222-3333-4444-555555555555";

function avisoDe(organizacaoId: string, tipo = "tarefa_nova") {
  return {
    data: { tipo, organizacaoId, ocorrenciaId: OCORRENCIA, severidade: "baixa" },
    body: null,
  };
}

beforeEach(() => {
  mockOrganizacao = MUNICIPIO_A;
  mockOuvinte = null;
  mockMarcarVistas.mockClear();
  mockTatil.mockClear();
  (router.push as jest.Mock).mockClear();
});

async function montar(duplo: ReturnType<typeof criarDuploDePorta>): Promise<void> {
  await act(async () => {
    render(<ProvedorDePush porta={duplo.porta}>{null}</ProvedorDePush>);
  });
  await act(async () => {});
}

/** A camada de dados descobriu tarefa nova na atualização da lista. */
async function chegar(novas: TarefaNova[]): Promise<void> {
  if (!mockOuvinte) throw new Error("o provedor não está ouvindo a camada de dados");
  const ouvinte = mockOuvinte;
  await act(async () => { ouvinte(novas); });
  await act(async () => {});
}

describe("a tarefa nova que a atualização da lista trouxe", () => {
  it("vira um aviso local com o texto genérico, o som de despacho e o canal de despacho", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegar([{ id: OCORRENCIA, severidade: "baixa" }]);

    expect(duplo.registro.avisosLocais).toHaveLength(1);
    const aviso = duplo.registro.avisosLocais[0]!;
    expect(aviso.titulo).toBe("Nova tarefa");
    expect(aviso.corpo).toBe("A sua equipe recebeu uma tarefa. Abra o aplicativo para ver.");
    expect(aviso.som).toBe("despacho.wav");
    expect(aviso.canal).toBe("dc360.despacho.v1");
    expect(aviso.vibracao.length).toBeGreaterThan(0);
  });

  it("carrega o dado no formato do push, carimbado com o município da sessão", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegar([{ id: OCORRENCIA, severidade: "critica" }]);

    expect(duplo.registro.avisosLocais[0]!.dados).toEqual({
      tipo: "tarefa_nova",
      organizacaoId: MUNICIPIO_A,
      ocorrenciaId: OCORRENCIA,
      severidade: "critica",
    });
  });

  it("vibra uma vez por atualização, mesmo com várias tarefas de uma vez, e nunca com a forma de erro", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegar([
      { id: OCORRENCIA, severidade: "baixa" },
      { id: "22222222-2222-4222-8222-222222222222", severidade: null },
    ]);

    expect(duplo.registro.avisosLocais).toHaveLength(2);
    expect(mockTatil).toHaveBeenCalledTimes(1);
    expect(mockTatil).toHaveBeenCalledWith("chegou");
  });

  /*
    O aviso local passa pelo MESMO tratador de primeiro plano que o push, e
    ele precisa dizer sim: mostrar e tocar. Se o tratador olhasse só a
    severidade, a tarefa nova baixa seria mostrada sem som, e o pedido de
    "sonoro" morreria no último passo.
  */
  it("é apresentado com som pelo tratador de primeiro plano", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);
    await chegar([{ id: OCORRENCIA, severidade: "baixa" }]);

    const aviso = duplo.registro.avisosLocais[0]!;
    expect(duplo.chegarComOAplicativoAberto({ data: aviso.dados, body: null }))
      .toEqual({ mostrar: true, som: true });
  });

  it("tocado, abre a vistoria da ocorrência, como o push", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);
    await chegar([{ id: OCORRENCIA, severidade: "baixa" }]);

    const aviso = duplo.registro.avisosLocais[0]!;
    await act(async () => {
      duplo.tocarEm({ identificador: "local-1", bruto: { data: aviso.dados, body: null } });
    });

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(agente)/vistoria/[id]",
      params: { id: OCORRENCIA },
    });
  });

  it("não avisa nada quando ninguém está logado neste aparelho", async () => {
    mockOrganizacao = null;
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegar([{ id: OCORRENCIA, severidade: "baixa" }]);

    expect(duplo.registro.avisosLocais).toEqual([]);
    expect(mockTatil).not.toHaveBeenCalled();
  });

  it("uma lista vazia de novidades não toca nem vibra", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await chegar([]);

    expect(duplo.registro.avisosLocais).toEqual([]);
    expect(mockTatil).not.toHaveBeenCalled();
  });
});

describe("o que o push já contou não conta de novo", () => {
  it("a tarefa nova que chegou pelo push com o aplicativo aberto é marcada como vista", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_A));
    await act(async () => {});

    expect(mockMarcarVistas).toHaveBeenCalledWith([OCORRENCIA]);
  });

  it("a tarefa nova em que o agente tocou é marcada como vista", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    await act(async () => {
      duplo.tocarEm({ identificador: "n-de-A", bruto: avisoDe(MUNICIPIO_A) });
    });

    expect(mockMarcarVistas).toHaveBeenCalledWith([OCORRENCIA]);
  });

  it("a tarefa nova que já estava na bandeja quando o aplicativo abriu é marcada como vista", async () => {
    const duplo = criarDuploDePorta({
      permissao: "concedida",
      bandeja: [{ identificador: "na-bandeja", bruto: avisoDe(MUNICIPIO_A) }],
    });
    await montar(duplo);

    expect(mockMarcarVistas).toHaveBeenCalledWith([OCORRENCIA]);
  });

  it("o prazo vencendo NÃO é marcado: ele não é despacho, e não concorre com a lista", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_A, "prazo_vencendo"));
    await act(async () => {
      duplo.tocarEm({ identificador: "prazo", bruto: avisoDe(MUNICIPIO_A, "prazo_vencendo") });
    });

    expect(mockMarcarVistas).not.toHaveBeenCalled();
  });

  /*
    O aviso de outro município é descartado ANTES de qualquer marca: marcar
    como vista uma ocorrência de outra prefeitura registraria no disco deste
    aparelho um id que não é deste município, que é exatamente o que a
    terceira barreira existe para não deixar entrar.
  */
  it("a tarefa nova de outro município não é marcada como vista", async () => {
    const duplo = criarDuploDePorta({ permissao: "concedida" });
    await montar(duplo);

    duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_B));
    await act(async () => {
      duplo.tocarEm({ identificador: "n-de-B", bruto: avisoDe(MUNICIPIO_B) });
    });

    expect(mockMarcarVistas).not.toHaveBeenCalled();
  });
});
