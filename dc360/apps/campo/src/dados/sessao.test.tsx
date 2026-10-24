import { render, act } from "@testing-library/react-native";
import { ProvedorDeSessao, useSessao } from "./sessao";

/**
 * O provedor de sessão visto pela fronteira que importa: a da FILA.
 *
 * A fila de sincronização é memoizada (`obterFila` guarda a primeira que
 * cria) e, junto com ela, fica guardada a primeira função `obterToken` que
 * recebeu. Este teste imita exatamente isso: captura `obterToken` uma vez, na
 * primeira renderização, e depois só usa a cópia capturada, como o transporte
 * de `@dc360/campo` faz durante o dia inteiro de plantão.
 *
 * O defeito que estes testes travam: com as credenciais em estado do React, a
 * função capturada ficava presa nas credenciais iniciais e reapresentava, a
 * cada envio, um token de renovação já rotacionado. A API lê reapresentação
 * como roubo e derruba todas as sessões do agente. Como o token de acesso
 * derrubado continua sendo aceito até vencer, a perda só aparecia quinze
 * minutos depois, com a fila inteira parada em 401.
 */

const mockCofre = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "quando-desbloqueado",
  getItemAsync: jest.fn(async (chave: string) => mockCofre.get(chave) ?? null),
  setItemAsync: jest.fn(async (chave: string, valor: string) => { mockCofre.set(chave, valor); }),
  deleteItemAsync: jest.fn(async (chave: string) => { mockCofre.delete(chave); }),
}));

/** Renovações vistas pelo "servidor", na ordem, com o token apresentado. */
const renovacoesRecebidas: string[] = [];
let proximaRenovacao = 1;

/** Quanto tempo de vida o próximo token de acesso emitido vai ter. */
let vidaDoAcessoMs = 30_000;

function tokenDeAcesso(): string {
  const emBase64Url = (texto: string) =>
    btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const carga = { sub: "agente", exp: Math.floor((Date.now() + vidaDoAcessoMs) / 1000) };
  return [
    emBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    emBase64Url(JSON.stringify(carga)),
    "assinatura-de-mentira",
  ].join(".");
}

jest.mock("./api", () => ({
  entrar: jest.fn(async () => ({
    credenciais: { acesso: mockApoio.tokenDeAcesso(), renovacao: "r" + String(mockApoio.proxima()) },
    identidade: {
      usuarioId: "11111111-1111-4111-8111-111111111111",
      nome: "Agente de teste",
      papel: "agente",
      organizacaoNome: "Defesa Civil de Teste",
      municipio: "Teste",
      uf: "SP",
    },
  })),
  renovar: jest.fn(async (renovacao: string) => {
    mockApoio.registrarRenovacao(renovacao);
    // Uma volta pelo laço de eventos, como uma requisição de verdade: é o que
    // dá chance de duas renovações concorrentes se cruzarem.
    await new Promise((r) => setTimeout(r, 0));
    return { acesso: mockApoio.tokenDeAcesso(), renovacao: "r" + String(mockApoio.proxima()) };
  }),
  sair: jest.fn(async () => undefined),
}));

/*
  `jest.mock` é içado para o topo do arquivo, antes das declarações acima, e
  por isso a fábrica do mock não pode fechar sobre elas diretamente. Este
  objeto é o desvio: ele é lido só quando o mock roda, já com tudo definido.
*/
const mockApoio = {
  tokenDeAcesso: () => tokenDeAcesso(),
  proxima: () => { const n = proximaRenovacao; proximaRenovacao += 1; return n; },
  registrarRenovacao: (r: string) => { renovacoesRecebidas.push(r); },
};

type Sessao = ReturnType<typeof useSessao>;

let obterTokenCapturado: Sessao["obterToken"] | null = null;
let sessaoAtual: Sessao | null = null;
let renderizacoes = 0;

function Sonda() {
  const sessao = useSessao();
  sessaoAtual = sessao;
  renderizacoes += 1;
  /*
    Captura depois da entrada, e não na primeira renderização, porque é assim
    que acontece de verdade: `obterFila` só é chamada dentro do grupo de rotas
    do agente, que só monta com sessão aberta. Capturar antes da entrada
    esconderia o defeito atrás de um "credenciais nulas".
  */
  if (sessao.identidade) obterTokenCapturado ??= sessao.obterToken;
  return null;
}

async function montarEEntrar(): Promise<void> {
  /*
    A montagem vai DENTRO de `act`. Com React 19, `render` solto só agenda o
    trabalho, e a segunda montagem do mesmo arquivo de teste nunca chega a
    renderizar: o teste passaria por acidente, sem componente nenhum na tela.
  */
  await act(async () => {
    render(
      <ProvedorDeSessao>
        <Sonda />
      </ProvedorDeSessao>,
    );
  });
  await act(async () => { await sessaoAtual?.entrar("agente@teste.gov.br", "senha"); });
}

let relogio = 1_700_000_000_000;

beforeEach(() => {
  mockCofre.clear();
  renovacoesRecebidas.length = 0;
  proximaRenovacao = 1;
  vidaDoAcessoMs = 30_000;
  obterTokenCapturado = null;
  sessaoAtual = null;
  renderizacoes = 0;
  relogio = 1_700_000_000_000;
  /*
    Relógio controlado por `Date.now`, e não por temporizador falso: o
    obtentor de token só consulta `Date.now`, e os `await` do teste continuam
    usando o laço de eventos de verdade, sem precisar de bombeamento manual.
  */
  jest.spyOn(Date, "now").mockImplementation(() => relogio);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ProvedorDeSessao", () => {
  it("cinco pedidos ao mesmo tempo emitem UMA renovação", async () => {
    await montarEEntrar();
    const obterToken = obterTokenCapturado;
    if (!obterToken) throw new Error("a sonda não capturou obterToken");

    let tokens: (string | null)[] = [];
    await act(async () => {
      tokens = await Promise.all([
        obterToken(), obterToken(), obterToken(), obterToken(), obterToken(),
      ]);
    });

    expect(renovacoesRecebidas).toEqual(["r1"]);
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).toBeTruthy();
  });

  it("a fila memoizada enxerga a credencial rotacionada, e nunca reapresenta a velha", async () => {
    await montarEEntrar();
    const obterToken = obterTokenCapturado;
    if (!obterToken) throw new Error("a sonda não capturou obterToken");

    await act(async () => { await obterToken(); });
    expect(renovacoesRecebidas).toEqual(["r1"]);

    // Passa o piso entre tentativas, e o token novo também está perto de
    // vencer, então a próxima chamada renova de novo.
    relogio += 61_000;
    await act(async () => { await obterToken(); });

    /*
      O ponto do teste. Reapresentar "r1" aqui é o que a API classifica como
      reúso de token e responde derrubando todas as sessões do agente.
    */
    expect(renovacoesRecebidas).toEqual(["r1", "r2"]);
  });

  it("token com folga não gera renovação nenhuma: sete pedidos, zero requisições", async () => {
    // Token recém-emitido, com os quinze minutos cheios.
    vidaDoAcessoMs = 15 * 60_000;
    await montarEEntrar();
    const obterToken = obterTokenCapturado;
    if (!obterToken) throw new Error("a sonda não capturou obterToken");

    const antes = renderizacoes;
    await act(async () => {
      // Uma vistoria com três fotos: o transporte pede o token sete vezes.
      for (let i = 0; i < 7; i += 1) await obterToken();
    });

    expect(renovacoesRecebidas).toEqual([]);
    // E nada disso re-renderiza o aplicativo inteiro: o token não é dado de
    // tela, e o provedor embrulha todas as rotas.
    expect(renderizacoes).toBe(antes);
  });

  it("obterToken continua sendo a mesma função depois de uma renovação", async () => {
    await montarEEntrar();
    const obterToken = obterTokenCapturado;
    if (!obterToken) throw new Error("a sonda não capturou obterToken");

    await act(async () => { await obterToken(); });

    /*
      É este contrato que a memoização de `obterFila` consome: a fila guarda a
      função uma vez e usa pelo resto do plantão. Se o provedor trocar de
      função a cada renovação, a fila fica com uma cópia obsoleta na mão.
    */
    expect(sessaoAtual?.obterToken).toBe(obterToken);
  });

  it("depois de sair, a função capturada devolve nulo em vez de token", async () => {
    vidaDoAcessoMs = 15 * 60_000;
    await montarEEntrar();
    const obterToken = obterTokenCapturado;
    if (!obterToken) throw new Error("a sonda não capturou obterToken");

    expect(await obterToken()).toBeTruthy();
    await act(async () => { await sessaoAtual?.sair(); });
    expect(await obterToken()).toBeNull();
  });
});
