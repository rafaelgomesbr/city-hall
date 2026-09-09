import { act, render } from "@testing-library/react-native";

/*
  Um cofre de mentira, mas de verdade o suficiente: as duas pontas desta prova
  (guardar a ficha no registro, lê-la no logout) usam o módulo real
  `ficha-do-aparelho.ts` e se encontram aqui dentro. Um duplo do próprio módulo
  provaria só que o teste chama o teste.
*/
const mockCofre = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "quando-desbloqueado",
  getItemAsync: jest.fn(async (chave: string) => mockCofre.get(chave) ?? null),
  setItemAsync: jest.fn(async (chave: string, valor: string) => { mockCofre.set(chave, valor); }),
  deleteItemAsync: jest.fn(async (chave: string) => { mockCofre.delete(chave); }),
}));

jest.mock("../dados/banco-local", () => ({
  apagarDadosLocais: jest.fn(async () => undefined),
}));

/** O que o servidor viu chegar em `POST /auth/sair`. */
const mockSaidasNoServidor: { renovacao: string; ficha: string | null | undefined }[] = [];

jest.mock("../dados/api", () => ({
  entrar: jest.fn(async () => ({
    credenciais: { acesso: "acesso.de.mentira", renovacao: "renovacao-1" },
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
  })),
  renovar: jest.fn(async () => ({ acesso: "a", renovacao: "r" })),
  sair: jest.fn(async (renovacao: string, ficha?: string | null) => {
    mockSaidasNoServidor.push({ renovacao, ficha });
  }),
}));

import { ProvedorDeSessao, useSessao } from "../dados/sessao";
import { fichaGuardada, guardarFicha } from "./ficha-do-aparelho";

/**
 * Sair da conta precisa CALAR ESTE TELEFONE, e isso é obrigação do aplicativo.
 *
 * `POST /auth/sair` revoga a notificação daquele aparelho quando recebe a
 * ficha, e não tem como descobri-la sozinho: o servidor conhece a sessão, e a
 * sessão não sabe de qual dos aparelhos daquela pessoa o pedido veio. Se o
 * aplicativo não mandar, ninguém manda.
 *
 * O que acontece sem isto não é incômodo, é vazamento de dado operacional: o
 * aparelho de quem saiu continua recebendo aviso de tarefa e de prazo de uma
 * equipe da qual a pessoa não faz mais parte. Num telefone de plantão que passa
 * de turno em turno, o agente da noite lê na tela bloqueada o aviso da equipe da
 * manhã.
 */

let sessaoAtual: ReturnType<typeof useSessao> | null = null;

function Sonda() {
  sessaoAtual = useSessao();
  return null;
}

beforeEach(() => {
  mockCofre.clear();
  mockSaidasNoServidor.length = 0;
  sessaoAtual = null;
});

async function entrarNoAplicativo(): Promise<void> {
  await act(async () => {
    render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>);
  });
  await act(async () => { await sessaoAtual?.entrar("agente@teste.gov.br", "senha"); });
}

it("manda a ficha deste aparelho junto com a saída", async () => {
  await entrarNoAplicativo();
  await act(async () => { await guardarFicha("ficha-do-plantao"); });

  await act(async () => { await sessaoAtual?.sair(); });

  expect(mockSaidasNoServidor).toEqual([
    { renovacao: "renovacao-1", ficha: "ficha-do-plantao" },
  ]);
});

/*
  Aparelho sem ficha é caso legítimo (permissão negada, build sem push), e a
  saída não pode depender dela: prender o agente numa sessão que ele mandou
  encerrar é pior do que não conseguir calar um telefone que não recebe nada.
*/
it("sai normalmente quando este aparelho nunca teve ficha", async () => {
  await entrarNoAplicativo();

  await act(async () => { await sessaoAtual?.sair(); });

  expect(mockSaidasNoServidor).toEqual([{ renovacao: "renovacao-1", ficha: null }]);
  expect(sessaoAtual?.identidade).toBeNull();
});

/*
  A ficha é esquecida DEPOIS de usada. Ela continua sendo do aparelho, mas o
  direito de apresentá-la ao servidor era da sessão que acabou: quem entrar
  depois pede a sua ao sistema e registra de novo, e é esse registro que carimba
  a linha com o usuário certo.
*/
it("esquece a ficha depois de mandá-la, para ela não sobreviver ao turno", async () => {
  await entrarNoAplicativo();
  await act(async () => { await guardarFicha("ficha-do-plantao"); });

  await act(async () => { await sessaoAtual?.sair(); });

  expect(await fichaGuardada()).toBeNull();
});

/*
  A sessão guarda o município, e ele não é para a tela: nenhuma tela mostra
  UUID. É com ele que a terceira barreira contra o aviso de outro município se
  fecha, e sem ele a comparação não teria com o que comparar.
*/
it("guarda o município da sessão, que é o que a barreira de push compara", async () => {
  await entrarNoAplicativo();

  expect(sessaoAtual?.identidade?.organizacaoId)
    .toBe("3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa");
});
