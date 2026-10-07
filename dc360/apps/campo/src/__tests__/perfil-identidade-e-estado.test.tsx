import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * "Minha conta": identidade não é estado, e toque no sistema tem retorno.
 *
 * A tela era nove pares rótulo/valor idênticos. "Conexão agora: Com sinal, por
 * WIFI" tinha exatamente o mesmo desenho de "Nome: Rafael Gomes", e as duas
 * coisas são opostas: uma é quem assina o laudo e não muda; a outra muda
 * sozinha e às vezes pede ação. Junto disso, três defeitos menores que só
 * aparecem em uso: a leitura da fila se anunciava com a palavra "conferindo"
 * no meio de uma coluna de valores, os dois botões que chamam o sistema não
 * mudavam nada na tela ao serem tocados, e sem sessão a aba inteira era uma
 * folha em branco.
 *
 * Todos os casos abaixo REPROVAM na versão anterior desta tela.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo.
 */

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


/** Quantas coletas o aparelho diz ter esperando. Cada caso ajusta. */
let mockPendentes = 0;
/** A leitura da fila que NÃO responde, que é o estado de carregamento real. */
let mockFilaPendurada = false;
jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: () => (mockFilaPendurada
      ? new Promise(() => {})
      : Promise.resolve({
        pendentes: mockPendentes, enviando: 0, bloqueados: 0, confirmados: 0,
      })),
    /*
      O Perfil assina a fila (V2-F00-E15). A fila de verdade avisa quem assina
      na hora; a pendurada é a que ainda não avisou ninguém.
    */
    assinar: (ouvinte: (r: unknown) => void) => {
      if (!mockFilaPendurada) {
        ouvinte({ pendentes: mockPendentes, enviando: 0, bloqueados: 0, confirmados: 0 });
      }
      return () => undefined;
    },
  }),
}));

/** A sessão pode não existir: é o caso que devolvia uma aba em branco. */
let mockIdentidade: Record<string, string> | null = null;
jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: jest.fn(async () => {}),
    obterToken: async () => "token-de-mentira",
    lerIdentidade: () => mockIdentidade,
    identidade: mockIdentidade,
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "Wi-Fi" }),
}));

import { router } from "expo-router";
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

const IDENTIDADE = {
  nome: "Agente de teste",
  papel: "agente_campo",
  matricula: "0001",
  organizacaoNome: "Defesa Civil de Teste",
  municipio: "Teste",
  uf: "SC",
};

const pedirPermissao = jest.fn(async () => undefined);
const abrirAjustes = jest.fn(async () => undefined);

function push(permissao: EstadoDaPermissao): EstadoDoPush {
  return { permissao, registro: null, pedirPermissao, abrirAjustes };
}

/**
 * O provedor de push que muda de estado por dentro, e não por `rerender`.
 *
 * `rerender` seria o caminho óbvio, e ele tem um efeito colateral nesta versão
 * da biblioteca: depois de usá-lo, o `screen` global dos casos SEGUINTES volta
 * nulo, e eles reprovam com "elemento não encontrado" numa tela que na verdade
 * nunca foi procurada. Guardar o estado aqui dentro é o que o provedor de
 * verdade faz, e mantém cada caso independente do anterior.
 */
let trocarPermissao: ((novo: EstadoDaPermissao) => void) | null = null;

function Cenario({ inicial }: { inicial: EstadoDaPermissao }) {
  const [permissao, setPermissao] = useState<EstadoDaPermissao>(inicial);
  trocarPermissao = setPermissao;
  return (
    <ProvedorDeTema>
      <ContextoDePush.Provider value={push(permissao)}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>
  );
}

async function abrirATela(permissao: EstadoDaPermissao = "concedida"): Promise<void> {
  await render(<Cenario inicial={permissao} />);
  await act(async () => {});
}

/** O provedor percebendo a resposta que a caixa do sistema acabou de dar. */
async function oSistemaRespondeu(novo: EstadoDaPermissao): Promise<void> {
  await act(async () => { trocarPermissao?.(novo); });
}

async function tocar(elemento: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await fireEvent.press(elemento);
  await act(async () => {});
}

beforeEach(() => {
  mockPendentes = 0;
  mockFilaPendurada = false;
  mockIdentidade = IDENTIDADE;
  pedirPermissao.mockClear();
  abrirAjustes.mockClear();
  (router.replace as jest.Mock).mockClear();
});

describe("identidade não se desenha como estado", () => {
  it("o nome e o papel não têm rótulo: a tipografia diz o que eles são", async () => {
    await abrirATela();

    expect(screen.getByText("Agente de teste")).toBeTruthy();
    expect(screen.getByText("Agente de campo")).toBeTruthy();

    /*
      Os quatro rótulos de identidade saíram. Eles existiam só para fazer o
      bloco parecer uma tabela, e era essa aparência de tabela que igualava
      "Nome" a "Conexão agora".
    */
    for (const rotulo of ["Nome", "Perfil", "Órgão", "Município"]) {
      expect(screen.queryByText(rotulo)).toBeNull();
    }
  });

  it("o que MUDA continua com rótulo, porque ali o rótulo é a pergunta", async () => {
    await abrirATela();

    expect(screen.getByText("Conexão agora")).toBeTruthy();
    expect(screen.getByText("Coletas esperando envio")).toBeTruthy();
  });
});

describe("a leitura da fila", () => {
  it("se anuncia com indicador de verdade, e não com uma palavra minúscula", async () => {
    mockFilaPendurada = true;
    await abrirATela();

    expect(screen.getByLabelText("Conferindo as coletas guardadas neste aparelho"))
      .toBeTruthy();
    /* A palavra sozinha era indistinguível de um valor que fosse "conferindo". */
    expect(screen.queryByText("conferindo")).toBeNull();
  });

  it("coleta presa vira selo com símbolo, e não um número solto", async () => {
    mockPendentes = 3;
    await abrirATela();

    expect(screen.getByText("3 esperando")).toBeTruthy();
    expect(screen.getByLabelText("3 coletas esperam sinal para serem enviadas"))
      .toBeTruthy();
  });
});

describe("a troca de senha", () => {
  it("responde em cinco palavras, e guarda o porquê atrás de um toque", async () => {
    await abrirATela();

    expect(screen.getByText("Trocada no painel")).toBeTruthy();
    /*
      O parágrafo de 48 palavras ocupava um cartão inteiro, aberto para sempre,
      explicando por que uma coisa NÃO está nesta tela.
    */
    expect(screen.queryByText(/encerra as outras sessões/)).toBeNull();

    await tocar(screen.getByTestId("por-que-a-senha"));
    expect(screen.getByText(/encerra as outras sessões/)).toBeTruthy();
  });
});

describe("sem sessão", () => {
  it("a aba deixa de ser uma folha em branco e passa a ter saída", async () => {
    mockIdentidade = null;
    await abrirATela();

    expect(screen.getByText("Nenhuma conta aberta neste aparelho")).toBeTruthy();

    await tocar(screen.getByLabelText("Ir para a tela de entrar com email funcional e senha"));
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });
});

describe("os dois botões que chamam o sistema", () => {
  it("dizem que estão em voo enquanto o sistema não respondeu", async () => {
    let liberar: (() => void) | null = null;
    pedirPermissao.mockImplementationOnce(
      () => new Promise<undefined>((cumprir) => { liberar = () => cumprir(undefined); }),
    );
    await abrirATela("nao_perguntada");

    await tocar(screen.getByLabelText("Ligar os avisos"));

    const botao = screen.getByLabelText("Perguntando ao sistema");
    expect(botao.props.accessibilityState.disabled).toBe(true);

    await act(async () => { liberar?.(); });
  });

  it("confirmam o desfecho, lido do estado NOVO e não do estado do toque", async () => {
    await abrirATela("nao_perguntada");

    await tocar(screen.getByLabelText("Ligar os avisos"));
    /* O provedor atualiza a permissão depois que a caixa do sistema fecha. */
    await oSistemaRespondeu("concedida");

    expect(screen.getByText("Avisos ligados neste aparelho")).toBeTruthy();
  });

  it("a recusa do sistema vira frase com o caminho que ainda resta", async () => {
    await abrirATela("nao_perguntada");

    await tocar(screen.getByLabelText("Ligar os avisos"));
    await oSistemaRespondeu("negada");

    expect(screen.getByText("O sistema registrou o não")).toBeTruthy();
    expect(screen.getByLabelText(
      "Abrir os ajustes do sistema para ligar as notificações deste aplicativo",
    )).toBeTruthy();
  });

  it("abrir os ajustes avisa que este aplicativo só relê a permissão na abertura", async () => {
    await abrirATela("negada");

    await tocar(screen.getByLabelText(
      "Abrir os ajustes do sistema para ligar as notificações deste aplicativo",
    ));

    expect(abrirAjustes).toHaveBeenCalled();
    expect(screen.getByText("Os ajustes foram abertos")).toBeTruthy();
  });
});
