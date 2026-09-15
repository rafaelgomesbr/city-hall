import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Pendencia } from "../dados/api";
import { salvarRascunho } from "../dados/rascunho";
import { temaEscuro } from "../ui/tokens";
import TelaDeVistoria from "../app/(agente)/vistoria/[id]";

/**
 * "Necessário acionar outro órgão: sim", e o coordenador não sabe quem.
 *
 * O laudo chegava à coordenação afirmando que alguém precisa ser acionado e
 * calando o nome. A primeira providência do coordenador virava um telefonema
 * para o agente, feito horas depois, com ele já em outra ocorrência ou fora do
 * turno, para perguntar uma coisa que estava clara no barranco no minuto da
 * vistoria. A informação existia; faltava lugar para escrever.
 *
 * O que estes casos travam, e a ordem é a da rua:
 *
 * 1. A seleção nasce colada no item que a produziu, e só depois do "sim".
 * 2. O catálogo vem do DISCO. A tela de vistoria não toca na rede em lugar
 *    nenhum, e é isso que faz a vistoria funcionar no alto do morro.
 * 3. Sem catálogo (aparelho novo, que nunca sincronizou), o campo livre sozinho
 *    conclui a vistoria. Nenhuma vistoria pode ficar impossível por falta de um
 *    cadastro, e este é o caso mais importante do arquivo.
 * 4. Trocar a resposta para "não" apaga a indicação, então passa por pergunta.
 * 5. O que foi indicado chega à minuta que o agente lê em voz alta na porta, e
 *    ao envelope que sobe para o servidor.
 *
 * O arquivo mora em `__tests__` e não ao lado da tela porque tudo dentro de
 * `src/app` vira ROTA no Expo: um teste ali seria uma tela navegável dentro do
 * aplicativo publicado.
 */

/* ============================================================
   O aparelho, de mentira
   ============================================================ */

jest.mock("expo-router", () => {
  const navegacao = { setOptions: jest.fn() };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true,
    },
    useLocalSearchParams: () => ({ id: "oc-1" }),
    useNavigation: () => navegacao,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111",
}));

jest.mock("expo-file-system", () => ({
  File: class { size = 1024; constructor(_uri: string) {} },
}));

jest.mock("../dados/api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));
/*
  O REAL, com só `abrirNoMapa` dublado.

  A fábrica devolvia um objeto com uma chave só, e isso APAGAVA o módulo
  inteiro: `MapaDoImovel` e `useMapaDoMunicipio`, que a tela de vistoria passou
  a usar no cartão de localização, leem `chaveDoMapaDoBuild`,
  `decidirModoDoMapa` e `PRAZO_DO_MAPA_MS` do mesmo arquivo, e a tela morria
  com "não é uma função" longe da causa.

  Dublado continua só o que abre o aplicativo de mapas do SISTEMA, que é o
  único ponto deste módulo que sai do processo.
*/
jest.mock("../dados/mapa", () => ({
  ...jest.requireActual("../dados/mapa"),
  abrirNoMapa: jest.fn(),
}));

const OCORRENCIA: Pendencia = {
  id: "oc-1",
  protocolo: "2026/000123",
  tipo: "deslizamento",
  severidade: "alta",
  endereco: "Servidão do Morro, 45",
  ponto_referencia: null,
  latitude: -27.595378,
  longitude: -48.548050,
  descricao: "Barranco escorregou sobre os fundos da casa.",
  solicitante_nome: "Maria de exemplo",
  solicitante_contato: null,
  vulnerabilidade_presente: false,
  vulnerabilidade_descricao: null,
  prazo_em: null,
  criado_em: "2026-09-09T09:00:00.000Z",
};

const BOMBEIROS = { id: "org-1", nome: "Corpo de Bombeiros", sigla: "CBM" };
const ENERGIA = { id: "org-2", nome: "Concessionária de energia", sigla: null };

/** O catálogo que este aparelho tem no disco. Cada caso ajusta o que precisa. */
let mockCatalogo: Array<{ id: string; nome: string; sigla: string | null }> = [];
const mockOrgaosGuardados = jest.fn(async () => mockCatalogo);

jest.mock("../dados/pendencias", () => ({
  pendenciaGuardada: async () => OCORRENCIA,
  orgaosGuardados: () => mockOrgaosGuardados(),
}));

jest.mock("../dados/coletas", () => ({
  coletaDe: async () => null,
  marcarColetada: jest.fn(async () => {}),
  arquivarColeta: jest.fn(async () => {}),
}));

const mockEnfileirar = jest.fn(async (..._args: unknown[]) => ({}));
/* A fila precisa ser o MESMO objeto a cada chamada: uma fila nova viraria
   estado novo, que viraria renderização nova, que abriria a fila de novo. */
const mockFila = { enfileirar: (...args: unknown[]) => mockEnfileirar(...args) };
jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    obterToken: async () => "token-de-mentira",
    identidade: {
      nome: "Agente de teste", matricula: "0001",
      organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
  }),
}));

/*
  O rascunho é substituído por inteiro: o módulo de verdade abre o banco do
  aparelho, e o que estes casos verificam é o que a tela PEDE ao disco.
*/
let mockRascunhoGuardado: Record<string, unknown> | null = null;
jest.mock("../dados/rascunho", () => ({
  lerRascunho: jest.fn(async () => mockRascunhoGuardado),
  salvarRascunho: jest.fn(async () => {}),
  descartarRascunho: jest.fn(async () => {}),
  rascunhoNovo: (ocorrenciaId: string, protocolo: string, idempotencyKey: string) => ({
    ocorrenciaId, protocolo, idempotencyKey,
    checklist: {}, orgaosParaAcionar: [], fotos: [],
    gpsPrecisaoMetros: null, coordenada: null,
    assinanteNome: "", assinaturaUri: null, observacoes: "", pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:00:00.000Z",
  }),
}));

/* ============================================================
   Utilidades
   ============================================================ */

/** O último rascunho que a tela mandou gravar. Ela grava a cada toque. */
function ultimoGravado(): Record<string, unknown> {
  const chamadas = jest.mocked(salvarRascunho).mock.calls;
  return chamadas.at(-1)?.[0] as unknown as Record<string, unknown>;
}

async function abrirATela(): Promise<void> {
  /*
    `await` no `render`, e ele não é decorativo: sem ele, `screen` não chega a
    ser preenchido e toda busca desta suíte falha com "render function has not
    been called", que parece defeito da tela e é defeito do teste.
  */
  await render(<TelaDeVistoria />);
  await screen.findByText("Checklist técnico");
}

async function tocar(texto: string): Promise<void> {
  await fireEvent.press(screen.getByText(texto));
  await act(async () => {});
}

/** Responde o item do checklist que se desdobra. */
async function responderAcionarOrgao(resposta: "Sim" | "Não"): Promise<void> {
  await fireEvent.press(
    screen.getByLabelText(`Necessário acionar outro órgão: ${resposta}`),
  );
  await act(async () => {});
}

/** Responde todo o resto do que a conclusão exige, menos os órgãos. */
async function preencherORestoDaVistoria(): Promise<void> {
  mockRascunhoGuardado = {
    ocorrenciaId: "oc-1",
    protocolo: "2026/000123",
    idempotencyKey: "chave-da-coleta",
    checklist: {
      risco_iminente: true,
      evacuacao_necessaria: true,
      interdicao_indicada: true,
      acionar_outro_orgao: true,
    },
    orgaosParaAcionar: [],
    fotos: [{
      idempotencyKey: "foto-1",
      uriLocal: "file:///foto-1.jpg",
      nomeArquivo: "vistoria-2026-000123-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 1024,
      capturadaEm: "2026-09-09T12:10:00.000Z",
      ordem: 0,
    }],
    gpsPrecisaoMetros: 8,
    coordenada: { lat: -27.595378, lng: -48.548050 },
    assinanteNome: "Maria de exemplo",
    assinaturaUri: "file:///assinatura.png",
    observacoes: "",
    pessoas: {},
    coletadaEm: "2026-09-09T12:00:00.000Z",
    atualizadoEm: "2026-09-09T12:20:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogo = [];
  mockRascunhoGuardado = null;
});

/* ============================================================
   1. A seleção nasce da resposta
   ============================================================ */

describe("a seleção de órgãos", () => {
  it("não existe antes de o agente responder que sim", async () => {
    // Um formulário longo com uma seção sempre aberta ensina a rolar por cima
    // dela, e a pergunta que ninguém lê é a pergunta que ninguém responde.
    await abrirATela();

    expect(screen.queryByTestId("orgaos-para-acionar")).toBeNull();
  });

  it("abre no mesmo lugar da resposta", async () => {
    await abrirATela();
    await responderAcionarOrgao("Sim");

    expect(screen.getByTestId("orgaos-para-acionar")).toBeTruthy();
    expect(screen.getByText("Quais órgãos precisam ser acionados?")).toBeTruthy();
  });

  it("some quando a resposta volta a ser não", async () => {
    await abrirATela();
    await responderAcionarOrgao("Sim");
    await responderAcionarOrgao("Não");

    expect(screen.queryByTestId("orgaos-para-acionar")).toBeNull();
  });
});

/* ============================================================
   2. O catálogo vem do disco
   ============================================================ */

describe("o catálogo do município", () => {
  it("é lido do disco, e a tela não vai à rede por ele", async () => {
    /*
      A tela de vistoria não faz chamada nenhuma, de propósito: tentar e falhar
      no alto do morro gasta bateria e ensina o agente a desconfiar de uma coleta
      que está perfeitamente guardada. O catálogo desce antes, junto com a lista
      de tarefas.
    */
    mockCatalogo = [BOMBEIROS, ENERGIA];
    await abrirATela();
    await responderAcionarOrgao("Sim");

    expect(mockOrgaosGuardados).toHaveBeenCalled();
    expect(screen.getByText("Corpo de Bombeiros (CBM)")).toBeTruthy();
    expect(screen.getByText("Concessionária de energia")).toBeTruthy();
  });

  it("escolher um órgão grava no disco na hora, e guarda o id junto do nome", async () => {
    /*
      O id serve à contagem de "quantas providências foram para os bombeiros",
      que é a conta que sustenta conversa de orçamento. O nome viaja junto porque
      o laudo é documento de processo e precisa continuar legível depois de o
      órgão mudar de nome ou sair do cadastro.
    */
    mockCatalogo = [BOMBEIROS];
    await abrirATela();
    await responderAcionarOrgao("Sim");

    await fireEvent.press(screen.getByTestId("orgao-org-1"));
    await act(async () => {});

    expect(ultimoGravado()["orgaosParaAcionar"]).toEqual([
      { orgaoId: "org-1", nome: "Corpo de Bombeiros" },
    ]);
  });

  it("tocar de novo desmarca, porque o dedo erra em tela pequena", async () => {
    mockCatalogo = [BOMBEIROS];
    await abrirATela();
    await responderAcionarOrgao("Sim");

    await fireEvent.press(screen.getByTestId("orgao-org-1"));
    await act(async () => {});
    await fireEvent.press(screen.getByTestId("orgao-org-1"));
    await act(async () => {});

    expect(ultimoGravado()["orgaosParaAcionar"]).toEqual([]);
  });

  it("o nome digitado que já está no catálogo entra COMO o do catálogo", async () => {
    /*
      Sem isto, "Corpo de Bombeiros" apareceria duas vezes no mesmo laudo, uma
      com id e outra sem, e a conta de quantas vezes o município acionou os
      bombeiros contaria duas.
    */
    mockCatalogo = [BOMBEIROS];
    await abrirATela();
    await responderAcionarOrgao("Sim");

    await fireEvent.changeText(
      screen.getByTestId("orgao-outro-nome"), "  corpo de bombeiros ",
    );
    await tocar("Adicionar este órgão");

    expect(ultimoGravado()["orgaosParaAcionar"]).toEqual([
      { orgaoId: "org-1", nome: "Corpo de Bombeiros" },
    ]);
  });
});

/* ============================================================
   3. O aparelho sem catálogo, que é o caso que governa
   ============================================================ */

describe("o aparelho que nunca sincronizou", () => {
  it("explica a lista vazia e diz que dá para concluir assim mesmo", async () => {
    // Sem a segunda metade da frase, o agente conclui que precisa de sinal e
    // desce o morro no meio da vistoria.
    await abrirATela();
    await responderAcionarOrgao("Sim");

    expect(screen.getByText(/ainda não foi baixada para este/)).toBeTruthy();
    expect(screen.getByTestId("orgao-outro-nome")).toBeTruthy();
  });

  it("o campo livre sozinho libera a conclusão da vistoria", async () => {
    /*
      É a regra que governa o produto inteiro: nenhuma vistoria pode ficar
      impossível por falta de um cadastro. Um item OBRIGATÓRIO do checklist sem
      resposta possível travaria o trabalho justamente sem sinal, que é a
      condição normal deste aplicativo.
    */
    await preencherORestoDaVistoria();
    await abrirATela();

    /*
      A pendência é lida no cartão de progresso, no alto da tela, e não mais
      numa frase corrida no fim da rolagem. O texto continua saindo de
      `faltaParaConcluir`, no pacote compartilhado, que é a única lista do que
      falta; o que mudou foi onde ela é desenhada e o caminho que cada linha
      passou a ter.
    */
    expect(screen.getByText(/dizer qual órgão/)).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("orgao-outro-nome"), "Companhia de saneamento",
    );
    await tocar("Adicionar este órgão");

    expect(screen.queryByText(/dizer qual órgão/)).toBeNull();
    expect(screen.getByLabelText("Revisar e concluir").props.accessibilityState.disabled)
      .toBe(false);
  });

  it("'Adicionar este órgão' é realce: é o ato que faz o item obrigatório andar", async () => {
    await abrirATela();
    await responderAcionarOrgao("Sim");

    const estilo = StyleSheet.flatten(screen.getByLabelText("Adicionar este órgão").props.style);
    expect(estilo.backgroundColor).toBe(temaEscuro.destaqueFundo);
  });

  it("nome curto demais não vira órgão", async () => {
    // Um toque acidental no teclado não pode escrever no laudo.
    await abrirATela();
    await responderAcionarOrgao("Sim");

    await fireEvent.changeText(screen.getByTestId("orgao-outro-nome"), "a");

    expect(
      screen.getByLabelText("Adicionar este órgão").props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("o que foi escrito à mão pode ser removido", async () => {
    // Nome com erro de digitação ficaria preso no rascunho até virar laudo.
    await abrirATela();
    await responderAcionarOrgao("Sim");
    await fireEvent.changeText(
      screen.getByTestId("orgao-outro-nome"), "Compania de saneamento",
    );
    await tocar("Adicionar este órgão");

    await fireEvent.press(screen.getByTestId("orgao-remover-0"));
    await act(async () => {});

    expect(ultimoGravado()["orgaosParaAcionar"]).toEqual([]);
  });
});

/* ============================================================
   4. A conclusão cobra o desdobramento
   ============================================================ */

describe("concluir a vistoria", () => {
  it("fica barrada enquanto o agente não disser quem acionar", async () => {
    /*
      Cobrar AQUI, e não no servidor: o agente ainda está no local e responde num
      toque. O servidor não pode recusar a coleta que já está guardada no
      aparelho, porque recusar ali marca o item como falha permanente na fila,
      não existe tela para corrigir, e a manhã de trabalho vai embora.
    */
    await preencherORestoDaVistoria();
    await abrirATela();

    expect(screen.getByText(/dizer qual órgão precisa ser acionado/)).toBeTruthy();
    expect(screen.getByLabelText("Revisar e concluir").props.accessibilityState.disabled)
      .toBe(true);
  });

  it("os órgãos entram na minuta que o agente lê em voz alta na porta", async () => {
    /*
      É ali que quem está presente ouve "vamos acionar a concessionária de
      energia" e corrige se estiver errado. Depois disso o laudo já é documento.
    */
    await preencherORestoDaVistoria();
    mockCatalogo = [ENERGIA];
    await abrirATela();

    await fireEvent.press(screen.getByTestId("orgao-org-2"));
    await act(async () => {});
    await tocar("Revisar e concluir");

    // O título casa sem diferenciar caixa: a folha da minuta imprime os títulos
    // de seção em maiúsculas, e prender o teste à caixa seria prendê-lo ao
    // desenho do documento em vez de ao conteúdo que o morador ouve.
    expect(screen.getByText(/Órgãos a acionar/i)).toBeTruthy();
    expect(screen.getAllByText("Concessionária de energia").length).toBeGreaterThan(0);
  });

  it("os órgãos sobem dentro do envelope da coleta", async () => {
    await preencherORestoDaVistoria();
    mockCatalogo = [ENERGIA];
    await abrirATela();

    await fireEvent.press(screen.getByTestId("orgao-org-2"));
    await act(async () => {});
    await tocar("Revisar e concluir");
    await tocar("Concluir vistoria");

    const envelope = mockEnfileirar.mock.calls[0]?.[0] as {
      vistoria: { orgaosParaAcionar?: unknown };
    };
    expect(envelope.vistoria.orgaosParaAcionar).toEqual([
      { orgaoId: "org-2", nome: "Concessionária de energia" },
    ]);
  });
});

/* ============================================================
   5. Trocar a resposta apaga trabalho, então pergunta
   ============================================================ */

describe("responder não depois de ter indicado órgãos", () => {
  async function indicarUmOrgao(): Promise<void> {
    mockCatalogo = [BOMBEIROS];
    await abrirATela();
    await responderAcionarOrgao("Sim");
    await fireEvent.press(screen.getByTestId("orgao-org-1"));
    await act(async () => {});
  }

  it("pergunta antes, em vez de apagar em silêncio", async () => {
    await indicarUmOrgao();
    await responderAcionarOrgao("Não");

    expect(screen.getByText("Apagar os órgãos indicados?")).toBeTruthy();
  });

  it("com a pergunta apenas ABERTA, nada foi apagado ainda", async () => {
    /*
      A diferença entre "o agente foi perguntado" e "o aplicativo já fez". Com o
      alerta do sistema isso era invisível: dava para provar que o alerta foi
      chamado, e não que o disco ficou parado esperando a resposta.
    */
    await indicarUmOrgao();
    const antes = ultimoGravado();

    await responderAcionarOrgao("Não");

    expect(ultimoGravado()).toBe(antes);
    expect(screen.getByTestId("orgaos-para-acionar")).toBeTruthy();
  });

  it("recusar mantém a resposta e a lista", async () => {
    await indicarUmOrgao();
    await responderAcionarOrgao("Não");

    await fireEvent.press(screen.getByTestId("dialogo-recusa"));
    await act(async () => {});

    expect(ultimoGravado()["orgaosParaAcionar"]).toEqual([
      { orgaoId: "org-1", nome: "Corpo de Bombeiros" },
    ]);
  });

  it("confirmar responde não E limpa a lista, na mesma gravação", async () => {
    /*
      As duas juntas, e não só a resposta: uma coleta que diz "não é necessário
      acionar outro órgão" e ainda lista os bombeiros é contradição dentro do
      mesmo documento, e o servidor recusa o envelope inteiro.
    */
    await indicarUmOrgao();
    await responderAcionarOrgao("Não");

    await fireEvent.press(screen.getByTestId("dialogo-acao"));
    await act(async () => {});

    const gravado = ultimoGravado();
    expect(gravado["orgaosParaAcionar"]).toEqual([]);
    expect((gravado["checklist"] as Record<string, boolean>)["acionar_outro_orgao"])
      .toBe(false);
  });

  it("responder não sem nada indicado não pergunta nada", async () => {
    // Pergunta que aparece quando não há o que perder ensina a responder sem
    // ler, e no dia em que ela for séria a resposta será a mesma.
    await abrirATela();
    await responderAcionarOrgao("Sim");
    await responderAcionarOrgao("Não");

    expect(screen.queryByText("Apagar os órgãos indicados?")).toBeNull();
  });
});
