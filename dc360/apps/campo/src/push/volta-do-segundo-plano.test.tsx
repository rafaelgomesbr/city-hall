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
  registrarAparelho: jest.fn(async (token: string, plataforma: string, ficha: string) => {
    mockRegistrosNoServidor.push({ token, plataforma, ficha });
  }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    carregando: false,
    identidade: {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
    obterToken: async () => "token-de-mentira",
    entrar: async () => undefined,
    sair: async () => undefined,
  }),
}));

const mockRegistrosNoServidor: { token: string; plataforma: string; ficha: string }[] = [];

import { AppState, type AppStateStatus } from "react-native";

import { criarDuploDePorta } from "./duplo-de-porta";
import { ProvedorDePush } from "./ProvedorDePush";
import { usePush } from "./contexto";
import type { EstadoDaPermissao } from "./permissao";

/**
 * O APLICATIVO PRECISA PERCEBER QUE A PERMISSÃO MUDOU ENQUANTO ELE ESTAVA FORA.
 *
 * Este arquivo existe por causa de uma frase que estava na tela de "Minha
 * conta", e que era verdade:
 *
 * > "Se você ligou a notificação por lá, feche e abra este aplicativo de novo
 * > para ele perceber."
 *
 * A sequência real é esta, e ela é o caminho normal e não a exceção. No iOS a
 * caixa de permissão do sistema aparece UMA vez por instalação; quem respondeu
 * "não" nunca mais a vê, e o único caminho de volta é os ajustes do aparelho.
 * A tela de conta oferece esse caminho, o agente vai lá, liga a notificação,
 * volta para o aplicativo, e encontra a mesma frase de antes dizendo que o
 * aviso está desligado. A leitura óbvia dele é que não funcionou.
 *
 * O pior não é a frase: é o REGISTRO DA FICHA. Ele só acontece depois da
 * permissão concedida, e enquanto o aplicativo não relê a permissão ele não
 * registra. O servidor continua sem nenhum aparelho para aquela pessoa, que é
 * indistinguível de "ela nunca instalou", e o aviso de prazo não sai. O agente
 * fez tudo certo, a tela diz que está desligado, e a coordenação não tem como
 * saber.
 *
 * O que conserta é escutar `AppState`. O provedor já consultava a permissão na
 * montagem e na troca de sessão, e essas são exatamente as duas ocasiões em
 * que ela NÃO muda por fora.
 */

let ouvinteDeEstado: ((estado: AppStateStatus) => void) | null = null;
let remocoes = 0;

function Sonda({ aoLer }: { aoLer: (p: EstadoDaPermissao) => void }) {
  aoLer(usePush().permissao);
  return null;
}

beforeEach(() => {
  mockRegistrosNoServidor.length = 0;
  ouvinteDeEstado = null;
  remocoes = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    tipo: string,
    ouvinte: (estado: AppStateStatus) => void,
  ) => {
    if (tipo === "change") ouvinteDeEstado = ouvinte;
    return { remove: () => { remocoes += 1; } };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => { jest.restoreAllMocks(); });

/** Monta o provedor e devolve o que a tela de conta estaria lendo. */
async function montar(duplo: ReturnType<typeof criarDuploDePorta>) {
  const lidas: EstadoDaPermissao[] = [];
  let arvore!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    arvore = await render(
      <ProvedorDePush porta={duplo.porta}>
        <Sonda aoLer={(p) => lidas.push(p)} />
      </ProvedorDePush>,
    );
  });
  return { lidas, arvore };
}

/** O agente saiu para os ajustes e voltou. */
async function voltarDoSegundoPlano() {
  if (!ouvinteDeEstado) throw new Error("o provedor não escuta a volta do segundo plano");
  const ouvinte = ouvinteDeEstado;
  await act(async () => { ouvinte("background"); });
  await act(async () => { ouvinte("active"); });
}

it("relê a permissão quando o aplicativo volta do segundo plano", async () => {
  const duplo = criarDuploDePorta({ permissao: "negada" });
  const { lidas } = await montar(duplo);
  expect(lidas.at(-1)).toBe("negada");

  /* A pessoa foi aos ajustes do sistema e ligou a notificação por lá. */
  duplo.definirPermissao("concedida");
  await voltarDoSegundoPlano();

  expect(lidas.at(-1)).toBe("concedida");
});

/*
  A metade que não aparece na tela, e que é a que faz o aviso chegar ou não.
  Sem a ficha registrada o servidor não tem para onde mandar, e o estado do
  servidor é o mesmo de quem nunca instalou o aplicativo.
*/
it("e registra a ficha que nunca foi registrada, porque a permissão não existia", async () => {
  const duplo = criarDuploDePorta({ permissao: "negada" });
  await montar(duplo);
  expect(mockRegistrosNoServidor).toEqual([]);

  duplo.definirPermissao("concedida");
  await voltarDoSegundoPlano();

  expect(mockRegistrosNoServidor).toHaveLength(1);
  expect(mockRegistrosNoServidor[0]?.ficha).toBe("ficha-deste-aparelho");
});

/*
  O caminho oposto, e ele também é real: quem DESLIGA a notificação nos ajustes
  precisa ver a tela dizer isso. Uma tela que continua afirmando "ligado" depois
  de a pessoa ter desligado é pior que uma desatualizada: ela contradiz o que a
  pessoa acabou de fazer com as próprias mãos.
*/
it("e percebe também quando a permissão foi RETIRADA nos ajustes", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  const { lidas } = await montar(duplo);
  expect(lidas.at(-1)).toBe("concedida");

  duplo.definirPermissao("negada");
  await voltarDoSegundoPlano();

  expect(lidas.at(-1)).toBe("negada");
});

/*
  A ficha é registrada UMA vez por município, e a volta do segundo plano não
  pode furar essa contagem. O agente tira o aplicativo da tela dezenas de vezes
  por plantão (atende o telefone, abre o mapa, tira uma foto pelo aplicativo da
  câmera), e uma requisição à API a cada volta seria consumo de dados e de
  bateria na rede móvel do morro, sem nada mudar do lado do servidor.
*/
it("não registra de novo a cada volta, porque o agente sai do aplicativo o tempo todo", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  await montar(duplo);
  expect(mockRegistrosNoServidor).toHaveLength(1);

  await voltarDoSegundoPlano();
  await voltarDoSegundoPlano();
  await voltarDoSegundoPlano();

  expect(mockRegistrosNoServidor).toHaveLength(1);
});

/*
  Ir para o segundo plano não é voltar. Sem esta distinção, o provedor
  consultaria o sistema também na SAÍDA, que é quando a permissão com certeza
  não mudou, e a consulta extra aconteceria toda vez que o agente troca de
  aplicativo.
*/
it("a ida para o segundo plano não dispara consulta nenhuma", async () => {
  const duplo = criarDuploDePorta({ permissao: "negada" });
  const { lidas } = await montar(duplo);
  const quantasAntes = lidas.length;

  if (!ouvinteDeEstado) throw new Error("o provedor não escuta a volta do segundo plano");
  const ouvinte = ouvinteDeEstado;
  duplo.definirPermissao("concedida");
  await act(async () => { ouvinte("background"); });
  await act(async () => { ouvinte("inactive"); });

  expect(lidas.slice(quantasAntes).every((p) => p === "negada")).toBe(true);
});

/*
  Ouvinte global que sobrevive ao desmonte é vazamento com consequência: o
  ouvinte antigo continua chamando `setPermissao` num componente que saiu da
  árvore, e no aparelho isso vira aviso no console que esconde defeito de
  verdade no meio dele.
*/
it("solta o ouvinte quando o provedor sai da árvore", async () => {
  const duplo = criarDuploDePorta({ permissao: "concedida" });
  const { arvore } = await montar(duplo);
  expect(remocoes).toBe(0);
  await act(async () => { arvore.unmount(); });
  expect(remocoes).toBe(1);
});
