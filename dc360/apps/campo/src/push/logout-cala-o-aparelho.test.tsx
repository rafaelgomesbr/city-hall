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

/*
  O DUBLÊ DO BANCO LOCAL, COMPLETO.

  Até a V2-F00-E14 ele tinha só `apagarDadosLocais`, e os quatro casos deste
  arquivo morriam com "acolherNoAparelho is not a function": em 15/09/2026
  (commit 5ecdf4c) `dados/sessao.tsx` passou a chamar também
  `acolherNoAparelho` (no login) e `marcarDonoDosDadosLocais` (no login e na
  retomada da sessão guardada), e o dublê ficou para trás. Nenhuma afirmação
  deste arquivo mudou: o que mudou foi o dublê, para que os casos voltem a
  exercitar o `sessao.tsx` real. O caso de deriva no fim do arquivo impede que
  isto se repita em silêncio.

  `acolherNoAparelho` devolve `{ apagou: false }` porque o caso provado aqui é
  a MESMA pessoa entrando no aparelho: nada é apagado. O apagamento ao trocar
  de agente tem prova própria em `dados/logout-nao-apaga-prova.test.ts`.
*/
jest.mock("../dados/banco-local", () => ({
  apagarDadosLocais: jest.fn(async () => undefined),
  acolherNoAparelho: jest.fn(async () => ({ apagou: false })),
  marcarDonoDosDadosLocais: jest.fn(async () => undefined),
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

/*
  O `fs` e o `path` vêm por `jest.requireActual`, tipados à mão no mínimo que
  o caso de deriva usa, e não por `import "node:fs"`: o `tsconfig` do
  aplicativo não carrega os tipos do Node (o código dele roda no telefone), e
  acrescentá-los por causa de um teste deixaria o código de tela enxergar uma
  API que no aparelho não existe. O `__dirname` existe no jest e é declarado
  aqui pelo mesmo motivo.
*/
declare const __dirname: string;
const { readFileSync } = jest.requireActual("fs") as {
  readFileSync(caminho: string, codificacao: "utf8"): string;
};
const { join } = jest.requireActual("path") as { join(...partes: string[]): string };

import * as bancoLocalDublado from "../dados/banco-local";
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

/*
  O CASO DE DERIVA. Ele não prova o produto: prova o dublê acima.

  Dublê incompleto não reprova dizendo "falta um nome no dublê". Ele reprova
  dizendo "acolherNoAparelho is not a function" no meio de um caso que fala de
  notificação, e foi isso que manteve estes quatro casos vermelhos por três
  semanas: a mensagem apontava para o lugar errado. Este caso lê o que
  `dados/sessao.tsx` importa de `./banco-local` e confere que o dublê oferece
  cada nome. Se amanhã o `sessao.tsx` importar um quarto, a falha diz o nome.

  Lê a FONTE em vez de usar uma lista escrita à mão aqui, porque uma lista
  escrita à mão envelhece exatamente como o dublê envelheceu.
*/
it("o dublê do banco local acompanha tudo o que sessao.tsx importa dele", () => {
  const fonte = readFileSync(join(__dirname, "../dados/sessao.tsx"), "utf8");
  const importacao = /import\s*\{([^}]+)\}\s*from\s*["']\.\/banco-local["']/.exec(fonte);

  /* Se o import deixar de existir ou mudar de forma, isto reprova em vez de
     passar por não ter encontrado nada: um casamento vazio não é um acerto. */
  expect(importacao).not.toBeNull();

  const nomesUsados = ((importacao as RegExpExecArray)[1] ?? "")
    .split(",")
    .map((n) => (n.trim().split(/\s+as\s+/)[0] ?? "").trim())
    .filter((n) => n.length > 0);

  expect(nomesUsados.length).toBeGreaterThan(0);

  const dubleDoBanco = bancoLocalDublado as unknown as Record<string, unknown>;
  const faltando = nomesUsados.filter((n) => typeof dubleDoBanco[n] !== "function");
  expect(faltando).toEqual([]);
});
