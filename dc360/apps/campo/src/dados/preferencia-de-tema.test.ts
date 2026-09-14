/**
 * A preferência de tema: onde ela mora, e o que o logout NÃO pode levar junto.
 *
 * Duas coisas se provam aqui, e as duas vêm do pedido que criou o alternador.
 *
 * 1. **Ela sobrevive ao logout.** O aparelho de plantão passa de turno em
 *    turno, e `apagarDadosLocais()` limpa dado de cidadão de propósito. Se a
 *    preferência fosse junto, o agente que escolheu "sempre claro" por causa do
 *    sol no morro voltaria ao tema do sistema toda manhã, depois de cada saída
 *    da conta. Escolha que não sobrevive ao logout é escolha que ninguém faz
 *    duas vezes.
 * 2. **Ela NÃO mora no cofre.** O cofre guarda o token que dá acesso ao dado
 *    das famílias do município; cor de tela não é segredo, e ocupar o Keychain
 *    com ela confunde as duas coisas. Aqui isso é travado por um cofre que
 *    ESTOURA se alguém o chamar.
 *
 * O caso do logout reprova das duas formas que importam: com a preferência
 * guardada na tabela `marcas` (que é o depósito vizinho, e que o logout limpa
 * com razão), e com `preferencias` acrescentada à lista de `DELETE`. A linha
 * que confere `marcas` vazia está ali para provar que a limpeza de fato RODOU:
 * sem ela, o caso passaria verde num logout que não apagou nada.
 */

import { DatabaseSync } from "node:sqlite";

let mockBanco: DatabaseSync | null = null;

/* A fábrica de `jest.mock` é içada para o topo do arquivo e não enxerga nada
   de fora, nem o `DatabaseSync` importado: só nomes que começam com `mock`.
   Por isso a abertura passa por aqui, como em `logout-nao-apaga-prova`. */
function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, params: unknown[] = []) {
        return db.prepare(sql).get(...params) ?? null;
      },
    };
  },
}));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class { name = ""; delete(): void { /* nada no disco nestes casos */ } },
  Directory: class { list(): unknown[] { return []; } },
}));

/**
 * O cofre que não pode ser chamado.
 *
 * Preferência de tela no Keychain não protege nada e transforma o cofre num
 * depósito de coisa comum. Um `jest.mock` que estoura é o que faz essa decisão
 * valer no dia em que alguém achar mais prático guardar tudo no mesmo lugar.
 */
jest.mock("expo-secure-store", () => ({
  setItemAsync: () => { throw new Error("o tema não vai para o cofre"); },
  getItemAsync: () => { throw new Error("o tema não vai para o cofre"); },
  deleteItemAsync: () => { throw new Error("o tema não vai para o cofre"); },
}));

import { apagarDadosLocais, bancoLocal, esquecerConexao } from "./banco-local";
import {
  PREFERENCIA_PADRAO, guardarPreferenciaDeTema, lerPreferenciaDeTema,
} from "./preferencia-de-tema";

beforeEach(() => {
  mockBanco = null;
  esquecerConexao();
});

describe("onde a escolha de tema mora", () => {
  it("sem nada escolhido, a resposta é acompanhar o sistema", async () => {
    expect(await lerPreferenciaDeTema()).toBe("sistema");
    expect(PREFERENCIA_PADRAO).toBe("sistema");
  });

  it("guarda e devolve a escolha, na tabela de preferências e não no cofre", async () => {
    await guardarPreferenciaDeTema("claro");

    expect(await lerPreferenciaDeTema()).toBe("claro");

    /*
      A linha é conferida no lugar em que ela precisa estar. Sem isto o caso
      passaria com a escolha guardada em qualquer canto, inclusive num que o
      logout apaga, e o caso de baixo é que descobriria o problema, um arquivo
      depois.
    */
    const db = await bancoLocal();
    const linha = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM preferencias WHERE chave = ?", ["tema"],
    );
    expect(linha?.valor).toBe("claro");
  });

  it("troca de escolha sem criar uma segunda linha", async () => {
    await guardarPreferenciaDeTema("claro");
    await guardarPreferenciaDeTema("escuro");

    expect(await lerPreferenciaDeTema()).toBe("escuro");

    const db = await bancoLocal();
    const linhas = await db.getAllAsync<{ valor: string }>(
      "SELECT valor FROM preferencias", [],
    );
    expect(linhas).toHaveLength(1);
  });

  it("valor irreconhecível não impede o aplicativo de abrir: responde o padrão", async () => {
    /*
      Acontece de verdade num aparelho que voltou de uma versão de teste: o
      valor guardado é de um tema que não existe mais. Ele não pode estourar na
      abertura, que é onde esta leitura é esperada.
    */
    const db = await bancoLocal();
    await db.runAsync(
      "INSERT INTO preferencias (chave, valor) VALUES (?, ?)", ["tema", "sepia"],
    );

    expect(await lerPreferenciaDeTema()).toBe("sistema");
  });
});

describe("o logout no aparelho de plantão", () => {
  /*
    A fila é criada pelo motor de sincronização, e não pelo esquema daqui. No
    aparelho ela sempre existe quando alguém sai da conta; sem ela, a limpeza
    dos arquivos de prova cai no ramo de "não deu para conferir" e o caso
    passaria a provar outra coisa.
  */
  beforeEach(async () => {
    const db = await bancoLocal();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS fila_sincronizacao (
        chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL
      );
    `);
  });

  it("apaga o dado do turno e NÃO apaga a escolha de tema", async () => {
    await guardarPreferenciaDeTema("claro");

    const db = await bancoLocal();
    /*
      Uma marca da sessão, que o logout TEM que levar. Ela é o controle deste
      caso: prova que a limpeza rodou, e impede o verde de um logout que não
      apagou coisa nenhuma.
    */
    await db.runAsync(
      "INSERT INTO marcas (chave, valor) VALUES (?, ?)", ["push.convite_mostrado", "1"],
    );

    await apagarDadosLocais();

    const depois = await bancoLocal();
    const marcas = await depois.getAllAsync<{ chave: string }>("SELECT chave FROM marcas", []);
    expect(marcas).toHaveLength(0);

    expect(await lerPreferenciaDeTema()).toBe("claro");
  });

  it("a escolha continua de pé para quem entrar depois, sem reescolher", async () => {
    await guardarPreferenciaDeTema("escuro");
    await apagarDadosLocais();

    /* A próxima abertura reabre a conexão do zero, como no aparelho. */
    esquecerConexao();

    expect(await lerPreferenciaDeTema()).toBe("escuro");
  });
});
