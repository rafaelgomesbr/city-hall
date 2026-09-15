import { act, render, screen } from "@testing-library/react-native";

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

/*
  A porta de verdade fala com o `expo-notifications`, que não existe fora do
  aparelho. Ela é substituída aqui pelo duplo, que é exatamente o ponto: a
  decisão que interessa não mora nela.
*/
jest.mock("./PortaExpo", () => ({ portaExpo: null }));

jest.mock("./convite", () => ({
  jaConvidou: jest.fn(async () => mockJaConvidou),
  marcarConvidado: jest.fn(async () => { mockJaConvidou = true; }),
}));

jest.mock("./ficha-do-aparelho", () => ({
  guardarFicha: jest.fn(async (f: string) => { mockFichasGuardadas.push(f); }),
  fichaGuardada: jest.fn(async () => mockFichasGuardadas.at(-1) ?? null),
  esquecerFicha: jest.fn(async () => undefined),
}));

jest.mock("../dados/api", () => ({
  ...jest.requireActual("../dados/api"),
  registrarAparelho: jest.fn(async (token: string, plataforma: string, ficha: string) => {
    mockRegistrosNoServidor.push({ token, plataforma, ficha });
  }),
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

let mockJaConvidou = false;
let mockOrganizacao: string | null = null;
const mockFichasGuardadas: string[] = [];
const mockRegistrosNoServidor: { token: string; plataforma: string; ficha: string }[] = [];

import { router } from "expo-router";
import { criarDuploDePorta } from "./duplo-de-porta";
import { ProvedorDePush } from "./ProvedorDePush";

/**
 * O aplicativo como TERCEIRA BARREIRA contra o aviso de outro município.
 *
 * `aviso.test.ts` prova a regra; este arquivo prova que ela está LIGADA nos
 * três lugares em que o aplicativo tem voz, e que estar ligada significa nada
 * acontecer:
 *
 * 1. O aviso que chega com o aplicativo aberto não é apresentado, não toca e
 *    não soma no contador do ícone.
 * 2. O toque num aviso de outro município não abre tela nenhuma.
 * 3. O que o sistema já desenhou sozinho, enquanto o aplicativo estava fechado,
 *    é retirado da bandeja quando ele abre.
 *
 * O terceiro ponto merece explicação, porque é o mais fácil de escrever errado:
 * um aviso que chega com o aplicativo FECHADO é desenhado pelo sistema
 * operacional antes de qualquer código nosso rodar, e não existe jeito de
 * impedir isso do lado do aplicativo. O que dá para fazer é o que está aqui:
 * fechar a janela assim que houver oportunidade. A vitrine é genérica de
 * propósito (ver `push/mensagem.ts` na API), então o que fica exposto nesse
 * intervalo é a existência de um aviso, e não o conteúdo dele.
 */

const MUNICIPIO_A = "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa";
const MUNICIPIO_B = "7b2d5e8a-1c3d-4e5f-9a0b-bbbbbbbbbbbb";

function avisoDe(organizacaoId: string, severidade?: string, tipo = "tarefa_nova") {
  return {
    data: {
      tipo,
      organizacaoId,
      ocorrenciaId: `ocorrencia-de-${organizacaoId}`,
      ...(severidade ? { severidade } : {}),
    },
    body: null,
  };
}

beforeEach(() => {
  mockJaConvidou = false;
  mockOrganizacao = MUNICIPIO_A;
  mockFichasGuardadas.length = 0;
  mockRegistrosNoServidor.length = 0;
  (router.push as jest.Mock).mockClear();
});

async function montar(duplo: ReturnType<typeof criarDuploDePorta>): Promise<void> {
  await act(async () => {
    render(<ProvedorDePush porta={duplo.porta}>{null}</ProvedorDePush>);
  });
  // Os efeitos do provedor são assíncronos (consultar permissão, varrer a
  // bandeja). Sem esta volta, o teste afirmaria sobre um provedor que ainda não
  // terminou de nascer.
  await act(async () => {});
}

it("não apresenta, não toca e não conta o aviso de outro município", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  expect(duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_B, "critica")))
    .toEqual({ mostrar: false, som: false });
});

it("apresenta o aviso do município da sessão", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  expect(duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_A, "alta")))
    .toEqual({ mostrar: true, som: true });
});

/*
  O despacho toca com o aplicativo aberto em QUALQUER severidade (decisão de
  15/09/2026, ver `canais.ts`): aqui quem apresenta é o nosso código, e o
  tratador de primeiro plano precisa da mesma régua do canal do Android, senão
  o mesmo aviso toca fechado e cala aberto.
*/
it("toca e mostra a tarefa nova de severidade baixa com o aplicativo aberto", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  expect(duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_A, "baixa")))
    .toEqual({ mostrar: true, som: true });
});

/*
  O prazo continua calado na severidade baixa: prazo é relógio, e relógio de
  severidade baixa tocando às três da manhã é o que ensina a calar tudo.
*/
it("cala o prazo de severidade baixa, mesmo sendo do município certo", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  expect(duplo.chegarComOAplicativoAberto(avisoDe(MUNICIPIO_A, "baixa", "prazo_vencendo")))
    .toEqual({ mostrar: true, som: false });
});

it("não abre tela nenhuma quando o agente toca num aviso de outro município", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  await act(async () => {
    duplo.tocarEm({ identificador: "n-de-B", bruto: avisoDe(MUNICIPIO_B) });
  });

  expect(router.push).not.toHaveBeenCalled();
  expect(duplo.registro.removidosDaBandeja).toContain("n-de-B");
});

it("abre a vistoria quando o agente toca num aviso do município dele", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  await act(async () => {
    duplo.tocarEm({ identificador: "n-de-A", bruto: avisoDe(MUNICIPIO_A) });
  });

  expect(router.push).toHaveBeenCalledWith({
    pathname: "/(agente)/vistoria/[id]",
    params: { id: `ocorrencia-de-${MUNICIPIO_A}` },
  });
});

it("limpa da bandeja o que era de outro município, e deixa o que é da sessão", async () => {
  const duplo = criarDuploDePorta({
    permissao: "concedida",
    bandeja: [
      { identificador: "veio-de-B", bruto: avisoDe(MUNICIPIO_B) },
      { identificador: "veio-de-A", bruto: avisoDe(MUNICIPIO_A) },
    ],
  });
  await montar(duplo);

  expect(duplo.naBandeja()).toEqual(["veio-de-A"]);
});

/*
  Sem sessão nada é legítimo. É o que fecha o buraco do logout feito sem sinal:
  `/auth/sair` não chegou ao servidor, a ficha continua registrada lá, e o
  aparelho continua recebendo tarefa da equipe de quem já saiu.
*/
it("limpa a bandeja inteira quando ninguém está logado neste aparelho", async () => {
  mockOrganizacao = null;
  const duplo = criarDuploDePorta({
    permissao: "concedida",
    bandeja: [
      { identificador: "veio-de-A", bruto: avisoDe(MUNICIPIO_A) },
      { identificador: "veio-de-B", bruto: avisoDe(MUNICIPIO_B) },
    ],
  });
  await montar(duplo);

  expect(duplo.naBandeja()).toEqual([]);
});

it("abre a tarefa do aviso que acordou o aplicativo do zero", async () => {
  const duplo = criarDuploDePorta({
    permissao: "concedida",
    aberturaAFrio: { identificador: "abriu", bruto: avisoDe(MUNICIPIO_A) },
  });
  await montar(duplo);

  expect(router.push).toHaveBeenCalledWith({
    pathname: "/(agente)/vistoria/[id]",
    params: { id: `ocorrencia-de-${MUNICIPIO_A}` },
  });
});

it("não abre nada quando o aviso que acordou o aplicativo era de outro município", async () => {
  const duplo = criarDuploDePorta({
    permissao: "concedida",
    aberturaAFrio: { identificador: "abriu-errado", bruto: avisoDe(MUNICIPIO_B) },
  });
  await montar(duplo);

  expect(router.push).not.toHaveBeenCalled();
});

/* ========================================================================
   O momento do pedido de permissão
   ======================================================================== */

it("NÃO pede permissão antes do primeiro login", async () => {
  mockOrganizacao = null;
  const duplo = criarDuploDePorta({ permissao: "nao_perguntada" });
  await montar(duplo);

  expect(screen.queryByTestId("convite-de-aviso")).toBeNull();
  expect(duplo.registro.perguntasAoSistema).toBe(0);
});

/*
  O convite é uma tela NOSSA, e ele vem antes da caixa do sistema. No iOS a
  caixa aparece uma vez por instalação: gastá-la com alguém que ainda não
  entendeu o produto é condenar aquele aparelho a nunca mais receber aviso de
  prazo, sem que ninguém descubra.
*/
it("convida depois do login, e só depois disso fala com o sistema", async () => {
  const duplo = criarDuploDePorta({ permissao: "nao_perguntada" });
  await montar(duplo);

  expect(screen.getByTestId("convite-de-aviso")).toBeTruthy();
  expect(duplo.registro.perguntasAoSistema).toBe(0);
});

it("não convida de novo quem já foi convidado neste aparelho", async () => {
  mockJaConvidou = true;
  const duplo = criarDuploDePorta({ permissao: "nao_perguntada" });
  await montar(duplo);

  expect(screen.queryByTestId("convite-de-aviso")).toBeNull();
});

it("não convida quem já recusou: para esse caso o caminho são os ajustes", async () => {
  const duplo = criarDuploDePorta({ permissao: "negada" });
  await montar(duplo);

  expect(screen.queryByTestId("convite-de-aviso")).toBeNull();
  expect(duplo.registro.perguntasAoSistema).toBe(0);
});

/* ========================================================================
   O registro da ficha
   ======================================================================== */

it("registra a ficha deste aparelho depois do login, com permissão concedida", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida", ficha: "ficha-do-plantao" });
  await montar(duplo);

  expect(mockRegistrosNoServidor).toEqual([
    { token: "token-de-mentira", plataforma: "android", ficha: "ficha-do-plantao" },
  ]);
  // Guardada no cofre, porque é ela que o logout precisa mandar ao servidor
  // para calar este telefone. Ver `ficha-do-aparelho.ts`.
  expect(mockFichasGuardadas).toEqual(["ficha-do-plantao"]);
});

it("não pede ficha ao sistema enquanto a permissão não foi concedida", async () => {
  const duplo = criarDuploDePorta({ permissao: "negada" });
  await montar(duplo);

  expect(duplo.registro.fichasPedidas).toBe(0);
  expect(mockRegistrosNoServidor).toEqual([]);
});

it("cria os três canais do Android antes de qualquer aviso chegar, o de despacho primeiro", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);

  expect(duplo.registro.canaisCriados).toEqual([
    "dc360.despacho.v1", "dc360.urgencia.v1", "dc360.comum.v1",
  ]);
});
