import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Perfil from "../app/(agente)/perfil";
import type { MeuTrabalho } from "../dados/api";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";
import { contarPreenchidos } from "../ui/regua";
import { temaEscuro } from "../ui/tokens";

/**
 * A tela da equipe dizia as coisas certas, todas em cinza.
 *
 * Ela era texto empilhado: dois `Txt` por colega, sem inicial e sem papel
 * destacado, e CINCO `Txt` por vistoria concluída, então cinco itens
 * produziam vinte e cinco linhas de pesos quase iguais.
 *
 * O pior caso é o que mais importa, e é o primeiro caso deste arquivo:
 * "coletada sem sinal e enviada depois" é a prova de que o offline funciona,
 * dita justamente para quem mais precisa acreditar nele, e era a QUINTA linha
 * cinza de um bloco de cinco linhas cinzas, com exatamente o mesmo tamanho e a
 * mesma cor do endereço logo acima.
 *
 * E o cartão "você não está em uma equipe" era um título com dois parágrafos e
 * NENHUMA ação, num aplicativo em que a tela abre do disco: quem acabou de ser
 * incluído numa equipe pelo painel não tinha como pedir a releitura, e o
 * caminho era fechar e reabrir o aplicativo.
 *
 * Todos os casos abaixo REPROVAM na versão anterior desta tela.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

let mockGuardado: { dados: MeuTrabalho; baixadoEm: string } | null = null;
const mockBuscar = jest.fn();
jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: jest.fn(async () => mockGuardado),
  atualizarMeuTrabalho: jest.fn(() => mockBuscar()),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    identidade: { usuarioId: "u1", nome: "Agente", matricula: "123" },
    obterToken: async () => "token-de-teste",
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));

/*
  O resto da tela fundida, dublado no mínimo.

  Cada uma destas peças (endereço da API, fila, sino, tema, push) tem suíte
  própria, e trazê-las de verdade para cá faria este arquivo reprovar por
  motivos que não são o dele.
*/
const SINO_VAZIO = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {},
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
  }),
}));

jest.mock("../dados/avisos", () => ({
  AVISOS_VAZIOS: SINO_VAZIO,
  avisosGuardados: async () => SINO_VAZIO,
  sincronizarAvisos: async () => SINO_VAZIO,
  marcarAvisosComoLidosNoAparelho: async () => SINO_VAZIO,
  fraseDoAviso: () => "Atualização na ocorrência",
  complementoDoAviso: () => null,
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

const COLETADA_EM = "2026-09-10T13:00:00.000Z";

function trabalho(por: Partial<MeuTrabalho> = {}): MeuTrabalho {
  return {
    equipe: { id: "e1", nome: "Equipe Alfa", especialidade: "Geotecnia", ativa: true },
    colegas: [
      { id: "u1", nome: "Agente", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false },
      { id: "u2", nome: "Maria Souza", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false },
    ],
    concluidas: [],
    totalConcluidas: (por.concluidas ?? []).length,
    tetoDeConcluidas: 50,
    devolvidasNoMes: 0,
    ...por,
  };
}

/** Uma vistoria concluída. `atraso` em minutos entre coletar e sincronizar. */
function concluida(atrasoEmMinutos: number) {
  return {
    id: "v1",
    ocorrencia_id: "o1",
    protocolo: "000123/2026",
    tipo: "deslizamento" as const,
    severidade: "alta" as const,
    status: "vistoriada",
    endereco: "Rua das Flores, 100",
    coletada_em: COLETADA_EM,
    sincronizada_em: new Date(
      new Date(COLETADA_EM).getTime() + atrasoEmMinutos * 60_000,
    ).toISOString(),
    gps_precisao_metros: null,
    assinante_nome: null,
  };
}

beforeEach(() => {
  mockGuardado = null;
  mockBuscar.mockReset();
});

/** Abre a tela com a cópia já no aparelho, que é o caminho normal em campo. */
async function abrirComOsDados(dados: MeuTrabalho): Promise<void> {
  mockGuardado = { dados, baixadoEm: new Date().toISOString() };
  mockBuscar.mockImplementation(async () => dados);
  await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

/** O estilo aplicado a um `Text`, achatado. */
function estiloDe(elemento: { props: { style?: unknown } }): Record<string, unknown> {
  const bruto = elemento.props.style;
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  return Object.assign({}, ...lista.filter(Boolean)) as Record<string, unknown>;
}

describe("a prova de que o offline funciona", () => {
  it("não é mais uma linha cinza igual às outras quatro", async () => {
    await abrirComOsDados(trabalho({ concluidas: [concluida(30)] }));

    const prova = screen.getByText(/Coletada sem sinal/);
    const endereco = screen.getByText("Rua das Flores, 100");

    /*
      A comparação é com o ENDEREÇO de propósito: os dois eram `legenda
      discreto`, mesma cor e mesmo tamanho, e a frase que prova o produto ficava
      indistinguível da linha menos importante do item.
    */
    expect(estiloDe(prova).color).not.toBe(estiloDe(endereco).color);
    expect(estiloDe(prova).fontSize).not.toBe(estiloDe(endereco).fontSize);
  });

  it("só aparece quando coletar e sincronizar aconteceram em momentos diferentes", async () => {
    await abrirComOsDados(trabalho({ concluidas: [concluida(0)] }));

    expect(screen.queryByText(/Coletada sem sinal/)).toBeNull();
  });
});

describe("os colegas", () => {
  it("ganham inicial e etiqueta de papel, em vez de duas linhas de texto", async () => {
    await abrirComOsDados(trabalho());

    /*
      Duas letras, porque uma equipe com dois "Carlos" viraria dois "C".
      `includeHiddenElements` porque a inicial é escondida do leitor de tela de
      propósito: o nome inteiro está do lado, e anunciar "M S" antes dele só
      faria a lista ser lida duas vezes.
    */
    expect(screen.getByText("MS", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Maria Souza")).toBeTruthy();
    expect(screen.getAllByLabelText("Agente de campo").length).toBe(2);
  });
});

describe("o cartão da equipe", () => {
  it("a contagem vira o título da lista que ela conta", async () => {
    await abrirComOsDados(trabalho());

    expect(screen.getByText("Integrantes ativos (2)")).toBeTruthy();
  });

  it("situação e especialidade viram etiqueta, com ícone e não só cor", async () => {
    await abrirComOsDados(trabalho());

    expect(screen.getByLabelText("Equipe ativa")).toBeTruthy();
    expect(screen.getByLabelText("Geotecnia")).toBeTruthy();
    /* "Situação: Ativa" tinha o desenho de "Especialidade: Geral", e só uma
       das duas muda o que o agente pode esperar do dia. */
    expect(screen.queryByText("Situação")).toBeNull();
  });

  it("a equipe inativa continua dizendo o que ainda dá para fazer", async () => {
    await abrirComOsDados(trabalho({
      equipe: { id: "e1", nome: "Equipe Alfa", especialidade: null, ativa: false },
    }));

    expect(screen.getByLabelText("Equipe inativa")).toBeTruthy();
    expect(screen.getByText("Esta equipe está inativa no cadastro")).toBeTruthy();
  });
});

describe("sem equipe", () => {
  it("deixa de ser um beco: há uma ação, e ela relê do servidor", async () => {
    await abrirComOsDados(trabalho({ equipe: null, colegas: [] }));
    mockBuscar.mockClear();

    await fireEvent.press(screen.getByTestId("procurar-equipe"));
    await act(async () => {});

    /*
      A tela abre do DISCO. Quem acabou de ser incluído numa equipe pelo painel
      precisa de uma releitura, e sem este botão o caminho era fechar e reabrir
      o aplicativo.
    */
    expect(mockBuscar).toHaveBeenCalledTimes(1);
  });
});

/**
 * A DENSIDADE VISUAL da tela, medida no que foi desenhado.
 *
 * Esta tela era a campeã de pílula preenchida do aplicativo, e por acumulação e
 * não por descuido: a situação da equipe (verde cheia em quase todo dia), a
 * especialidade, o papel de CADA colega (dez linhas, dez pílulas iguais) e, na
 * lista de concluídas, a prova do offline em verde cheio, até dez vezes. Cada
 * uma dessas decisões está certa sozinha, e a soma é a frase que abriu esta
 * frente: "extremamente poluída com textos coloridos pra todo lado".
 *
 * A régua está em `ui/regua.ts`, e a contagem abaixo é a mesma que
 * `scripts/portao-densidade-do-aplicativo.test.mjs` faz lendo a fonte. As duas
 * precisam existir: aquela varre todas as telas de uma vez e não sabe o que o
 * React Native desenha; esta sabe, porque olha a cor decidida.
 *
 * Os dois primeiros casos REPROVAM na versão anterior desta tela.
 */
describe("a régua do peso visual, na tela da equipe", () => {
  const preenchidos = () =>
    contarPreenchidos(screen.toJSON(), temaEscuro, (e) => StyleSheet.flatten(e as never));

  it("dez vistorias concluídas sem sinal não acendem dez blocos verdes", async () => {
    await abrirComOsDados(trabalho({
      concluidas: Array.from({ length: 10 }, (_, i) => ({
        ...concluida(30), id: `v${i}`, protocolo: `00012${i}/2026`,
      })),
    }));

    /*
      A prova do offline continua na tela, inteira: ícone de "sem sinal" mais a
      frase. O que saiu foi o retângulo verde atrás dela, dez vezes.
    */
    expect(screen.getAllByText(/Coletada sem sinal/)).toHaveLength(10);
    expect(preenchidos()).toEqual([]);
  });

  it("com a equipe inativa, sobra UM bloco preenchido, e é o que diz a consequência", async () => {
    await abrirComOsDados(trabalho({
      equipe: { id: "e1", nome: "Equipe Alfa", especialidade: "Geotecnia", ativa: false },
      concluidas: [concluida(30)],
    }));

    /*
      Antes eram dois: a pílula âmbar "Equipe inativa" e, logo abaixo, o aviso
      âmbar que explica o que ainda dá para fazer e manda avisar a coordenação.
      Pela R2 da régua, o fundo cheio fica com o segundo, que é o único dos dois
      que diz alguma coisa que o agente não sabia.
    */
    expect(preenchidos()).toEqual([temaEscuro.alertaFundo]);
    // E a pílula não sumiu: ela continua com ícone e palavra, sem fundo.
    expect(screen.getByLabelText("Equipe inativa")).toBeTruthy();
  });

  it("com tudo normal, a tela não tem bloco preenchido nenhum", async () => {
    /*
      O caso que dá sentido aos outros dois. O dia normal de um agente é uma
      equipe ativa e vistorias que subiram: se a tela acende alguma coisa nesse
      dia, o agente aprende que a cor não quer dizer nada, e no dia em que ela
      quiser dizer, ele não vai olhar.
    */
    await abrirComOsDados(trabalho({ concluidas: [concluida(30)] }));
    expect(preenchidos()).toEqual([]);
  });
});
