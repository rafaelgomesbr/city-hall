/**
 * A LEGENDA DE MODO NÃO PODE MENTIR NEM POR UM INSTANTE, E A TELA DO MAPA É
 * ONDE ELA MAIS APARECE.
 *
 * A tela de vistoria pagou por isto primeiro e escreveu vinte e cinco linhas
 * explicando: `useMapaDoMunicipio` trata token `null` como RESPOSTA ("sem
 * token não há mapa do Google"), e não como espera. Montar o gancho antes de a
 * sessão responder faz a tela AFIRMAR, em voz alta e por escrito, "o seu
 * município optou por não enviar coordenada ao Google (...) nenhuma informação
 * sai daqui", e trocar pelo mapa do Google um instante depois.
 *
 * Isso não é piscada de interface. A legenda de modo é a promessa da seção 2.2
 * do `SUBPROCESSADORES.md` virada tela: é por ela que o encarregado de dados do
 * município confere, olhando, se a coordenada das famílias está saindo dali.
 * Uma legenda que se desmente já disse uma coisa falsa, e a pessoa que ela
 * enganou é justamente a que tem competência para reclamar.
 *
 * A tela de vistoria evita isso montando o mapa só depois de o token estar
 * lido. A lente de mapa da tela "Hoje" fazia o contrário, e este arquivo foi o
 * que travou a correção lá. A lente virou TELA (`app/(agente)/mapa.tsx`), e o
 * subsistema do token migrou com ela: o par `tokenDoMapa`/`tokenLido` agora
 * mora na tela do mapa, e este arquivo migrou junto, porque o que ele guarda
 * não é a tela, é a promessa.
 *
 * Mora em arquivo próprio, e não junto do resto dos casos do mapa, porque aqui
 * a leitura do token precisa ficar PENDURADA de propósito: é o único jeito de
 * observar o quadro em que a tela ainda não sabe a resposta, e um dublê que
 * pendura afetaria todos os outros casos daquele arquivo.
 */

import { act, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => {
  const { useEffect } = require("react") as typeof import("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (retorno: () => void) => { useEffect(retorno, [retorno]); },
  };
});

jest.mock("expo-crypto", () => ({
  randomUUID: () => "99999999-9999-4999-8999-999999999999",
}));

jest.mock("expo-location", () => ({
  __esModule: true,
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  getLastKnownPositionAsync: async () => null,
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  Accuracy: { High: 4 },
}));

jest.mock("../dados/api", () => ({
  SemSinal: class SemSinal extends Error {},
  enderecoDaApi: () => "",
}));

let mockTarefas: Pendencia[] = [];
jest.mock("../dados/pendencias", () => ({
  pendenciasGuardadas: jest.fn(async () => mockTarefas),
  baixadasEm: jest.fn(async () => new Date().toISOString()),
  atualizarPendencias: jest.fn(async () => mockTarefas),
  tetoAtingido: jest.fn(async () => null),
  esquecerPendencia: jest.fn(async () => {}),
}));

const SEM_RASCUNHOS: never[] = [];
const SEM_COLETAS: never[] = [];
const SEM_ITENS: never[] = [];
jest.mock("../dados/rascunho", () => ({ listarRascunhos: jest.fn(async () => SEM_RASCUNHOS) }));
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => SEM_COLETAS),
  marcarEnviada: jest.fn(async () => {}),
}));
/* Objeto ESTÁVEL: um novo a cada leitura troca a identidade que os efeitos
   observam, e a tela relê o disco para sempre. */
const mockFila = {
  itens: async () => SEM_ITENS,
  assinar: () => () => {},
  drenar: jest.fn(async () => ({})),
  enfileirarDevolucao: jest.fn(),
};
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "wifi" }),
}));

/*
  A LEITURA DO TOKEN QUE FICA PENDURADA.

  `soltarOToken` é quem responde, e até alguém chamar, a sessão está no estado
  em que toda sessão real está por alguns milissegundos: lendo o disco. Este
  aplicativo trabalha num morro com 10% de bateria, onde "alguns
  milissegundos" é um número otimista.
*/
let soltarOToken: (valor: string | null) => void = () => undefined;
/*
  A sessão é um objeto ESTÁVEL, e isso não é enfeite: `useSessao` devolvendo
  objeto novo a cada renderização troca a identidade de `obterToken`, e os
  efeitos que dependem dela voltam a rodar em toda renderização. Com a leitura
  pendurada, o que era convergente vira laço infinito, e o teste morre por
  tempo esgotado em vez de medir alguma coisa.
*/
const mockSessao = {
  obterToken: () => new Promise<string | null>((resolve) => { soltarOToken = resolve; }),
  lerIdentidade: () => null,
  identidade: { nome: "Ana Ribeiro", municipio: "Serra Alta", uf: "SC" },
};
jest.mock("../dados/sessao", () => ({ useSessao: () => mockSessao }));

import Mapa from "../app/(agente)/mapa";

const AQUI = { latitude: -27.595378, longitude: -48.548050 };

function tarefa(): Pendencia {
  return {
    id: "1",
    protocolo: "000471/2026",
    tipo: "deslizamento",
    severidade: "media",
    endereco: "Servidão do Morro, 45",
    ponto_referencia: null,
    latitude: AQUI.latitude,
    longitude: AQUI.longitude,
    descricao: "Barranco escorregou sobre os fundos da casa.",
    solicitante_nome: "Maria de exemplo",
    solicitante_contato: null,
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    prazo_em: null,
    criado_em: new Date().toISOString(),
  } as Pendencia;
}

/** A frase que a tela NÃO pode dizer antes de saber a resposta. */
const A_PROMESSA = /optou por não enviar coordenada ao Google/;

async function abrirNoMapa(): Promise<void> {
  await render(<Mapa />);
  await act(async () => {});
}

beforeEach(() => {
  mockTarefas = [tarefa()];
  soltarOToken = () => undefined;
});

describe("enquanto a sessão não respondeu", () => {
  it("a tela não afirma para onde a coordenada vai, nem para onde ela não vai", async () => {
    await abrirNoMapa();
    expect(screen.queryByText(A_PROMESSA)).toBeNull();
  });

  it("ela diz que está vendo, que é a verdade naquele instante", async () => {
    await abrirNoMapa();
    expect(screen.getByText(/Vendo como o seu município configurou o mapa/)).toBeTruthy();
  });

  /*
    E a espera é SÓ DO MAPA: a lista de tarefas da tela continua desenhada, com
    protocolo, prazo e o caminho para a vistoria. Uma tela inteira parada
    esperando a resposta de um servidor seria o oposto do produto, que abre do
    disco e não depende de sinal.
  */
  it("a lista da tela continua de pé, e a espera é só do mapa", async () => {
    await abrirNoMapa();
    expect(screen.getByTestId("lista-do-mapa")).toBeTruthy();
    expect(screen.getByTestId("escolher-1")).toBeTruthy();
  });
});

describe("depois de a sessão responder", () => {
  /*
    Aqui a resposta é honesta, e por isso pode ser dita: sem base de API, a
    busca de autorização devolve vazio sem tocar na rede, e o município de fato
    não autorizou. A diferença entre este caso e o de cima é toda a correção:
    dizer depois de saber, em vez de dizer e corrigir.
  */
  it("aí sim ela diz em que modo está", async () => {
    await abrirNoMapa();
    await act(async () => { soltarOToken("token-de-mentira"); });
    await act(async () => {});

    expect(screen.getByText(A_PROMESSA)).toBeTruthy();
  });
});
