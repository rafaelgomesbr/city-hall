import { act, render, screen } from "@testing-library/react-native";

/**
 * O NÚMERO DO TRABALHO CONCLUÍDO, e ele estava errado desde que a rota nasceu.
 *
 * `GET /campo/meu-trabalho` manda `totalConcluidas` e `tetoDeConcluidas` desde
 * o primeiro dia, com o defeito documentado em detalhe no próprio servidor
 * (`apps/api/src/rotas/campo.ts`), e o tipo do aplicativo não declarava nenhum
 * dos dois: a tela imprimia o TAMANHO DA LISTA como se fosse a contagem.
 *
 * A lista corta em cinquenta, o que é certo, porque ninguém lê mais que isso
 * numa tela de resumo. O que estava errado é a consequência: **o agente que
 * assinou 62 vistorias numa temporada de chuva lia "50"**, e as doze mais
 * antigas não apareciam em lugar nenhum, sem rodapé, sem aviso e sem "ver
 * mais". Se ele precisasse mostrar que vistoriou aquele imóvel em janeiro, a
 * tela AFIRMAVA que ele nunca vistoriou. É o registro do trabalho dele, e é o
 * que ele leva quando o ato for questionado.
 *
 * Junto vêm `gps_precisao_metros` e `assinante_nome`, que o SQL da rota já
 * trazia e o tipo não expunha: eles chegavam no aparelho e eram descartados na
 * fronteira do TypeScript. Os dois respondem à mesma pergunta que o número
 * responde, meses depois: o que esta vistoria prova.
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
  router: { push: jest.fn(), replace: jest.fn() },
}));

/*
  `../dados/api` NÃO é dublado aqui, ao contrário das outras suítes desta tela,
  e é de propósito: `normalizarMeuTrabalho` é metade da correção que este
  arquivo prova, e dublá-la deixaria o caso do registro velho no disco passando
  verde sobre uma função que ninguém executou.
*/
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0", extra: { apiUrl: "https://api.exemplo" } } },
}));

const SINO_VAZIO = {
  itens: [], cursor: null, naoLidos: 0, naoLidosTruncado: false,
  lidosPendentes: [], baixadoEm: null,
};

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
  }),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    sair: jest.fn(async () => undefined),
    obterToken: async () => "token-de-teste",
    lerIdentidade: () => null,
    identidade: {
      usuarioId: "u1",
      nome: "Agente de teste",
      matricula: "0001",
      papel: "agente_campo",
      organizacaoId: "org-1",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SC",
    },
  }),
}));

jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: true, tipo: "celular" }),
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

/** O que o disco devolve. Cada caso monta o seu. */
let mockGuardado: { dados: unknown; baixadoEm: string } | null = null;
jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: async () => mockGuardado,
  atualizarMeuTrabalho: async () => { throw new Error("sem rede nesta suite"); },
}));

import Perfil from "../app/(agente)/perfil";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

const COLETADA_EM = "2026-09-10T13:00:00.000Z";

/** Uma vistoria concluída. `atraso` em minutos entre coletar e sincronizar. */
function concluida(numero: number, por: Record<string, unknown> = {}) {
  const atrasoEmMinutos = 30;
  return {
    id: `v${numero}`,
    ocorrencia_id: `o${numero}`,
    protocolo: `0001${String(numero).padStart(2, "0")}/2026`,
    tipo: "deslizamento" as const,
    severidade: "alta" as const,
    status: "vistoriada",
    endereco: `Rua das Flores, ${numero}`,
    coletada_em: COLETADA_EM,
    sincronizada_em: new Date(
      new Date(COLETADA_EM).getTime() + atrasoEmMinutos * 60_000,
    ).toISOString(),
    gps_precisao_metros: null,
    assinante_nome: null,
    ...por,
  };
}

async function abrirComOsDados(dados: unknown): Promise<void> {
  mockGuardado = { dados, baixadoEm: new Date().toISOString() };
  await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

/** O agente da temporada de chuva: 62 assinadas, 50 no aparelho. */
const CINQUENTA = Array.from({ length: 50 }, (_, i) => concluida(i));

describe("o agente que assinou 62 vistorias", () => {
  it("lê 62, e não o tamanho da lista que o servidor cortou", async () => {
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: CINQUENTA,
      totalConcluidas: 62,
      tetoDeConcluidas: 50,
    });

    /*
      O par número mais rótulo é UM elemento para quem ouve a tela: "62,
      vistorias concluídas". Lidos separados, o número vira um número solto no
      meio da tela e o rótulo vira uma palavra sem sujeito.
    */
    expect(screen.getByTestId("total-de-concluidas").props.accessibilityLabel)
      .toBe("62, vistorias concluídas");
    expect(screen.getByText("62")).toBeTruthy();
  });

  it("diz que o aparelho só tem as 50 últimas, em vez de deixar concluir que são todas", async () => {
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: CINQUENTA,
      totalConcluidas: 62,
      tetoDeConcluidas: 50,
    });

    /*
      Duas frases porque são dois cortes diferentes: um é da tela (dez de
      cinquenta) e o outro é do servidor (cinquenta de sessenta e duas). Sem o
      segundo, o agente continuaria sem saber que as doze mais antigas não estão
      neste telefone.
    */
    expect(screen.getByText(/Mostrando as 10 mais recentes de 62/)).toBeTruthy();
    expect(screen.getByText(/baixou as 50 últimas/)).toBeTruthy();
  });

  it("com tudo cabendo, não inventa rodapé nenhum", async () => {
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [concluida(1)],
      totalConcluidas: 1,
      tetoDeConcluidas: 50,
    });

    expect(screen.getByTestId("total-de-concluidas").props.accessibilityLabel)
      .toBe("1, vistoria concluída");
    expect(screen.queryByText(/Mostrando as/)).toBeNull();
  });
});

describe("registro gravado por uma versão anterior deste aplicativo", () => {
  it("não imprime vazio no lugar do número: cai no tamanho da lista", async () => {
    /*
      A tela abre do DISCO, e o disco pode ter sido escrito quando estes dois
      campos nem eram lidos. Sem normalizar a leitura do disco (e não só a da
      rede), o tipo prometeria `number` e a tela receberia `undefined` justamente
      no aparelho sem sinal, que é quando ela mais precisa funcionar.
    */
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [concluida(1), concluida(2)],
    });

    expect(screen.getByTestId("total-de-concluidas").props.accessibilityLabel)
      .toBe("2, vistorias concluídas");
  });
});

describe("o que a vistoria prova, e que o tipo descartava", () => {
  it("mostra quem assinou e com que precisão o GPS mediu", async () => {
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [concluida(1, {
        assinante_nome: "Maria Souza",
        gps_precisao_metros: 8.4,
      })],
      totalConcluidas: 1,
      tetoDeConcluidas: 50,
    });

    expect(screen.getByText("Assinada por Maria Souza")).toBeTruthy();
    /* Arredondado: "8.4 m" de precisão de GPS sugere uma exatidão que o
       aparelho não tem, e nenhuma decisão muda entre 8 e 8,4. */
    expect(screen.getByText("GPS 8 m")).toBeTruthy();
    expect(screen.getByLabelText("Precisão do GPS: 8 metros")).toBeTruthy();
  });

  it("vistoria sem assinatura e sem precisão não ganha etiqueta vazia", async () => {
    /* O produto permite concluir sem assinatura (morador ausente, recusa), e o
       GPS não fecha em encosta fechada. Nenhum dos dois é defeito. */
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [concluida(1)],
      totalConcluidas: 1,
      tetoDeConcluidas: 50,
    });

    expect(screen.queryByText(/Assinada por/)).toBeNull();
    expect(screen.queryByText(/^GPS /)).toBeNull();
  });
});

describe("a prova de que o offline funciona", () => {
  it("vira número grande com rótulo, e diz sobre quantas ele fala", async () => {
    /*
      Ela já foi a quinta linha cinza de um bloco de cinco linhas cinzas, e
      depois virou etiqueta com ícone dentro de cada item. Agora é peça: é a
      única coisa desta tela que o agente não sabia antes de abrir.
    */
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [
        concluida(1),
        concluida(2),
        {
          ...concluida(3),
          /* Coletada e sincronizada no mesmo minuto: foi feita na base. */
          sincronizada_em: COLETADA_EM,
        },
      ],
      totalConcluidas: 3,
      tetoDeConcluidas: 50,
    });

    expect(screen.getByTestId("coletadas-sem-sinal").props.accessibilityLabel)
      .toBe("2, coletadas sem sinal");
    /*
      O DENOMINADOR é dito, e ele não é o total: a marca de "sem sinal" só existe
      nas vistorias que o aparelho baixou. Afirmar a proporção sobre o total
      seria inventar um número que ninguém contou.
    */
    expect(screen.getByText(/Entre as 3 mais recentes/)).toBeTruthy();
  });

  it("some inteira quando não há nenhuma: o destaque não aponta para o nada", async () => {
    await abrirComOsDados({
      equipe: null,
      colegas: [],
      concluidas: [{ ...concluida(1), sincronizada_em: COLETADA_EM }],
      totalConcluidas: 1,
      tetoDeConcluidas: 50,
    });

    expect(screen.queryByTestId("coletadas-sem-sinal")).toBeNull();
  });
});
