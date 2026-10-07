import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));
/*
  O que a fusão trouxe para esta tela, dublado no mínimo.

  "Minha conta" e "Minha equipe" viraram Perfil, então a tela agora também lê o
  trabalho concluído e o sino. Nenhum dos dois é o assunto daqui, e as suítes
  deles são outras.
*/
const SINO_VAZIO = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => null,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
}));

jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: SINO_VAZIO,
  avisosGuardados: async () => SINO_VAZIO,
  sincronizarAvisos: async () => SINO_VAZIO,
  marcarAvisosComoLidosNoAparelho: async () => SINO_VAZIO,
  fraseDoAviso: () => "Atualização na ocorrência",
  complementoDoAviso: () => null,
}));


jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
    /* O Perfil assina a fila (V2-F00-E15), e a fila de verdade avisa quem assina na hora. */
    assinar: (ouvinte: (r: unknown) => void) => {
      ouvinte({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 });
      return () => undefined;
    },
  }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: jest.fn(async () => {}),
    obterToken: async () => "token-de-mentira",
    identidade: {
      nome: "Agente de teste",
      papel: "agente_campo",
      matricula: "0001",
      organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

/*
  A tela passou a oferecer a escolha de tema (claro, escuro ou acompanhar o
  sistema), e com ela veio a exigência do `ProvedorDeTema` por cima: o alternador
  estoura fora dele de propósito, para um alternador sem provedor aparecer em
  quem escreve a tela e não em quem usa o aplicativo.

  O depósito da preferência é dublado para esta suíte não abrir banco nenhum. O
  caminho de verdade até o SQLite é provado em `dados/preferencia-de-tema.test.ts`,
  e o alternador em si em `__tests__/tema-a-escolha-do-agente.test.tsx`.
*/
jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

import Perfil from "../app/(agente)/perfil";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";
import type { EstadoDaPermissao } from "../push/permissao";
import type { DesfechoDoRegistro } from "../push/registro";

/**
 * O caminho de volta para quem já recusou a notificação.
 *
 * Existe por uma característica do iOS que não tem conserto pelo código: a
 * caixa de permissão do sistema aparece UMA vez por instalação e, depois de um
 * "não", ela nunca mais abre. Quem recusou fica sem aviso de prazo para sempre,
 * e nada dizia isso em lugar nenhum: nem o agente, nem a coordenação, nem o
 * servidor tinham como saber, porque do lado de lá a entrega continua sendo bem
 * sucedida. O agente conclui que o produto não avisa.
 *
 * O único caminho que de fato funciona são os ajustes do sistema, e ele fica
 * aqui, onde a pessoa procura quando quer, em vez de aparecer sozinho quando
 * ela não quer.
 */

const ajustesAbertos = jest.fn(async () => undefined);
const permissaoPedida = jest.fn(async () => undefined);

function abrirAConta(
  permissao: EstadoDaPermissao,
  registro: DesfechoDoRegistro | null = null,
): Promise<void> {
  const valor: EstadoDoPush = {
    permissao,
    registro,
    pedirPermissao: permissaoPedida,
    abrirAjustes: ajustesAbertos,
  };
  return act(async () => {
    render(
      <ProvedorDeTema>
        <ContextoDePush.Provider value={valor}>
          <Perfil />
        </ContextoDePush.Provider>
      </ProvedorDeTema>,
    );
  });
}

beforeEach(() => {
  ajustesAbertos.mockClear();
  permissaoPedida.mockClear();
});

it("mostra os ajustes do aparelho a quem recusou a notificação", async () => {
  await abrirAConta("negada");
  await act(async () => {});

  const botao = screen.getByText("Abrir os ajustes do aparelho");
  await act(async () => { fireEvent.press(botao); });

  expect(ajustesAbertos).toHaveBeenCalled();
});

it("diz, com todas as letras, que este aparelho não vai avisar", async () => {
  await abrirAConta("negada");
  await act(async () => {});

  expect(screen.getByText("Desligados")).toBeTruthy();
});

/*
  Quem nunca foi perguntado ganha o botão que faz a pergunta, e não o dos
  ajustes: mandar essa pessoa a uma tela do sistema é pior do que perguntar de
  dentro do aplicativo, onde ainda dá para explicar em uma frase para que serve.
*/
it("oferece ligar os avisos a quem ainda não foi perguntado", async () => {
  await abrirAConta("nao_perguntada");
  await act(async () => {});

  expect(screen.queryByText("Abrir os ajustes do aparelho")).toBeNull();
  await act(async () => { fireEvent.press(screen.getByText("Ligar os avisos")); });

  expect(permissaoPedida).toHaveBeenCalled();
});

it("não oferece nada a quem já concedeu", async () => {
  await abrirAConta("concedida");
  await act(async () => {});

  expect(screen.getByText("Ligados")).toBeTruthy();
  expect(screen.queryByText("Abrir os ajustes do aparelho")).toBeNull();
  expect(screen.queryByText("Ligar os avisos")).toBeNull();
});

/*
  Push desligado no servidor NÃO é defeito e não pode alarmar: o agente não tem
  o que fazer a respeito. A frase existe para ele não passar a semana achando
  que o aparelho dele está quebrado, e por isso ela é informativa e não de
  alerta.
*/
it("explica o push desligado no servidor sem alarmar o agente", async () => {
  await abrirAConta("concedida", "push_desligado");
  await act(async () => {});

  expect(screen.getByText(/ainda não ligou o envio de aviso neste servidor/)).toBeTruthy();
});

it("não escreve nada sobre o servidor quando o registro deu certo", async () => {
  await abrirAConta("concedida", "registrado");
  await act(async () => {});

  expect(screen.queryByText(/ainda não ligou o envio de aviso neste servidor/)).toBeNull();
  expect(screen.queryByText(/Não deu para registrar este aparelho/)).toBeNull();
});
