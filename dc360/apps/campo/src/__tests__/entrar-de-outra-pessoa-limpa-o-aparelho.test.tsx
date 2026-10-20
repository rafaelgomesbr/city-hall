/**
 * Quem ENTRA depois não vê o dado de quem saiu, provado pelo caminho real do
 * login, e a saída que tira a credencial do cofre (V2-F00-E15, correção 3).
 *
 * O achado da rodada 5: o critério da etapa ("outro agente entra no aparelho
 * com o rascunho do primeiro: `acolherNoAparelho` limpa") só era provado no
 * nível da função (`dados/sair-e-entrar-nao-perde-a-coleta.test.ts` chama
 * `acolherNoAparelho(BRUNO)` direto). Tirar a chamada, e o import, de `entrar`
 * em `dados/sessao.tsx` deixava o jest inteiro verde, e o agente seguinte
 * lia a vistoria começada do anterior, com o nome da moradora que assinou. Um
 * teste que troca o ato ("entrar no aparelho") pela chamada da função não tem
 * como ver o ato faltar.
 *
 * Aqui o ato é o de verdade: o `ProvedorDeSessao`, o banco local (SQLite do
 * Node) e o rascunho são os reais, e a pessoa entra por `entrar`. Só ficam
 * simulados o cofre do aparelho (um mapa), a rede (o login responde conforme o
 * e-mail), o disco de arquivos (um conjunto de nomes) e as bibliotecas nativas.
 *
 * A segunda metade cobre o cofre: "Sair da conta" e a sessão vencida têm de
 * tirar a credencial (token de renovação) e a identidade do armazenamento
 * seguro. Num aparelho de plantão, com a saída sem sinal, o servidor nem fica
 * sabendo; se o token ficasse no chaveiro, o próximo a pegar o aparelho teria
 * a sessão de quem saiu.
 *
 * Mora em `__tests__` e não ao lado da tela porque tudo dentro de `src/app`
 * vira ROTA no Expo; o harness é o de `vistoria-sessao-vencida-preserva-o-rascunho`.
 */

import { DatabaseSync } from "node:sqlite";
import { act, render } from "@testing-library/react-native";

let mockBanco: DatabaseSync | null = null;
/**
 * Quando armado, a limpeza do banco (`DELETE FROM rascunhos`) fica esperando o
 * teste soltar: simula o aparelho lento que apaga devagar, para provar a ORDEM
 * em que `entrar` limpa e abre a sessão.
 */
let mockPortaoDaLimpeza: Promise<void> | null = null;

function mockAbrir(): DatabaseSync {
  mockBanco ??= new DatabaseSync(":memory:");
  return mockBanco;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const db = mockAbrir();
    return {
      async execAsync(sql: string) {
        if (mockPortaoDaLimpeza && sql.includes("DELETE FROM rascunhos")) await mockPortaoDaLimpeza;
        db.exec(sql);
      },
      async runAsync(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
      async getAllAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params); },
      async getFirstAsync(sql: string, params: unknown[] = []) { return db.prepare(sql).get(...params) ?? null; },
    };
  },
}));

/** O diretório de documentos do aparelho, com o que cada teste põe nele. */
const mockNoDisco = new Set<string>();
jest.mock("expo-file-system", () => {
  class Arquivo {
    name: string;
    size = 0;
    constructor(nomeOuUri: string) { this.name = nomeOuUri.split("/").pop() ?? nomeOuUri; }
    delete(): void { mockNoDisco.delete(this.name); }
  }
  return {
    Paths: { document: "file:///documentos" },
    File: Arquivo,
    Directory: class { list() { return [...mockNoDisco].map((n) => new Arquivo(n)); } },
  };
});

/** O cofre do aparelho (Keychain/Keystore), que os testes de saída conferem. */
const mockCofre = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "quando-desbloqueado",
  getItemAsync: jest.fn(async (chave: string) => mockCofre.get(chave) ?? null),
  setItemAsync: jest.fn(async (chave: string, valor: string) => { mockCofre.set(chave, valor); }),
  deleteItemAsync: jest.fn(async (chave: string) => { mockCofre.delete(chave); }),
}));

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/* A rede: o login devolve a pessoa do e-mail, com credencial própria. */
jest.mock("../dados/api", () => {
  const pessoas: Record<string, { usuarioId: string; nome: string }> = {
    "ana@teste.gov.br": { usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Ana de exemplo" },
    "bruno@teste.gov.br": { usuarioId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nome: "Bruno de exemplo" },
  };
  return {
    enderecoDaApi: () => "https://api.exemplo",
    SemSinal: class SemSinal extends Error {},
    entrar: jest.fn(async (email: string) => {
      const p = pessoas[email]!;
      const quem = p.nome.split(" ")[0]!.toLowerCase();
      return {
        credenciais: { acesso: `acesso-${quem}`, renovacao: `renovacao-${quem}` },
        identidade: {
          usuarioId: p.usuarioId, nome: p.nome, papel: "agente_campo", matricula: "0001",
          organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
        },
      };
    }),
    renovar: jest.fn(async () => ({ acesso: "acesso-novo", renovacao: "renovacao-nova" })),
    sair: jest.fn(async () => undefined),
  };
});

import { ProvedorDeSessao, useSessao } from "../dados/sessao";
import { geracaoDaSessao } from "../dados/geracao-da-sessao";
import { bancoLocal, donoDosDadosLocais, esquecerConexao } from "../dados/banco-local";
import { listarRascunhos, salvarRascunho, type Rascunho } from "../dados/rascunho";

const FOTO = "foto-1759000000000-0.jpg";
const ASSINATURA = "assinatura-1759000000000.png";
const ASSINATURA_NA_FILA = "assinatura-1758000000000.png";

/** A vistoria COMEÇADA da Ana: checklist, uma foto, a assinatura da moradora. */
function rascunhoDaAna(): Rascunho {
  return {
    ocorrenciaId: "11111111-1111-4111-8111-111111111111",
    protocolo: "000471/2026",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    checklist: { risco_iminente: true },
    orgaosParaAcionar: [],
    fotos: [{ uriLocal: `file:///documentos/${FOTO}` }] as unknown as Rascunho["fotos"],
    gpsPrecisaoMetros: 1,
    coordenada: { lat: -27.5959, lng: -48.5489 },
    assinanteNome: "Moradora de exemplo",
    assinaturaUri: `file:///documentos/${ASSINATURA}`,
    assinaturaIdempotencyKey: null,
    observacoes: "Trinca na parede dos fundos.",
    pessoas: {},
    coletadaEm: "2026-10-07T09:00:00.000Z",
    atualizadoEm: "2026-10-07T09:00:00.000Z",
  };
}

/** O item da fila do motor offline, com o autor carimbado: nunca é apagado. */
const ITEM_DA_FILA = JSON.stringify({
  id: "coleta-1",
  estado: "pendente",
  autor: { usuarioId: ANA, nome: "Ana de exemplo" },
  fotos: [{ uriLocal: `file:///documentos/${ASSINATURA_NA_FILA}` }],
});

async function filaNoDisco(): Promise<{ chave: string; valor: string }[]> {
  const db = await bancoLocal();
  return db.getAllAsync<{ chave: string; valor: string }>(
    "SELECT chave, valor FROM fila_sincronizacao", [],
  );
}

/** A tabela da fila existe de verdade, para a limpeza de arquivos não avisar de falta dela. */
async function criarATabelaDaFila(): Promise<void> {
  const db = await bancoLocal();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS fila_sincronizacao (
      chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
  `);
}

type Sessao = ReturnType<typeof useSessao>;
let sessao: Sessao | null = null;
function Sonda() {
  sessao = useSessao();
  return null;
}

async function entrarComo(email: string): Promise<void> {
  await act(async () => { await sessao!.entrar(email, "senha"); });
}

/**
 * O turno da Ana pelo login real: ela entra, começa a vistoria (rascunho com
 * foto e assinatura) e tem uma coleta pendente na fila, com a assinatura dela
 * no disco.
 */
async function turnoDaAna(): Promise<void> {
  await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
  await entrarComo("ana@teste.gov.br");
  await criarATabelaDaFila();
  const db = await bancoLocal();
  await db.runAsync(
    "INSERT INTO fila_sincronizacao (chave, valor, atualizado_em) VALUES (?, ?, ?)",
    ["dc360:fila:coleta-1", ITEM_DA_FILA, "2026-10-07T08:00:00.000Z"],
  );
  await salvarRascunho(rascunhoDaAna());
  mockNoDisco.add(FOTO);
  mockNoDisco.add(ASSINATURA);
  mockNoDisco.add(ASSINATURA_NA_FILA);
  expect(await listarRascunhos()).toHaveLength(1);
}

/** O que o Bruno, recém-entrado, NÃO pode ver nem achar do turno da Ana. */
async function conferirQueOBrunoNaoViuNada(): Promise<void> {
  expect(sessao?.identidade?.usuarioId).toBe(BRUNO);
  expect(await listarRascunhos()).toEqual([]);
  expect(mockNoDisco.has(FOTO)).toBe(false);
  expect(mockNoDisco.has(ASSINATURA)).toBe(false);
  /* A coleta da Ana na fila é dela e fica: pendente, intacta, com a prova no disco. */
  expect(await filaNoDisco()).toEqual([{ chave: "dc360:fila:coleta-1", valor: ITEM_DA_FILA }]);
  expect(JSON.parse((await filaNoDisco())[0]!.valor).estado).toBe("pendente");
  expect(mockNoDisco.has(ASSINATURA_NA_FILA)).toBe(true);
  /* E o aparelho agora é do Bruno: o próximo a entrar é conferido contra ele. */
  expect(await donoDosDadosLocais()).toBe(BRUNO);
}

beforeEach(() => {
  mockBanco?.close();
  mockBanco = null;
  esquecerConexao();
  mockNoDisco.clear();
  mockCofre.clear();
  mockPortaoDaLimpeza = null;
  sessao = null;
});

describe("outra pessoa entra por `entrar` num aparelho com o turno da Ana, provedor e banco reais", () => {
  it("a sessão da Ana venceu: o Bruno entra e o aparelho vem sem rascunho, foto nem assinatura dela", async () => {
    await turnoDaAna();
    await act(async () => { await sessao!.encerrarSessaoVencida(); });
    /* Sessão vencida não apaga: o dado da Ana ainda está lá quando o Bruno chega. */
    expect(await listarRascunhos()).toHaveLength(1);

    await entrarComo("bruno@teste.gov.br");

    await conferirQueOBrunoNaoViuNada();
  });

  it("a Ana saiu pelo 'Sair da conta': o Bruno entra e também não vê nada dela", async () => {
    await turnoDaAna();
    await act(async () => { await sessao!.sair(); });

    await entrarComo("bruno@teste.gov.br");

    await conferirQueOBrunoNaoViuNada();
  });

  it("a limpeza que demora segura a entrada: o Bruno só aparece depois de o aparelho estar limpo", async () => {
    /*
      O comentário de `entrar` promete limpar ANTES de a sessão abrir, para a
      tela de tarefas nunca mostrar a lista do turno anterior. Duas
      refatorações quebram a promessa sem quebrar o resultado final: esquecer o
      `await` da limpeza, ou chamá-la depois de `setIdentidade`. Com o resultado
      final igual, só a ORDEM as distingue: aqui a limpeza fica presa e o teste
      olha o que o provedor já mostrou enquanto ela não termina.
    */
    await turnoDaAna();
    await act(async () => { await sessao!.encerrarSessaoVencida(); });

    let solta!: () => void;
    mockPortaoDaLimpeza = new Promise<void>((resolve) => { solta = resolve; });
    let entrada!: Promise<void>;
    await act(async () => {
      entrada = sessao!.entrar("bruno@teste.gov.br", "senha");
      await new Promise((r) => setTimeout(r, 25));
    });

    /* Limpeza presa: ninguém logado, nada do Bruno no cofre, dado da Ana ainda lá. */
    expect(sessao?.identidade).toBeNull();
    expect([...mockCofre.values()].join("\n")).not.toContain("bruno");

    await act(async () => { solta(); await entrada; });

    await conferirQueOBrunoNaoViuNada();
  });

  it("sem dono marcado no disco, quem entra não apaga a vistoria e passa a ser o dono", async () => {
    /*
      A regra escrita em `acolherNoAparelho`: "sem dono não apaga". É o
      aparelho atualizado de uma versão sem a marca, cuja vistoria começada não
      pode morrer por via das dúvidas. Entrar também é o ato que carimba o dono.
    */
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    await salvarRascunho(rascunhoDaAna());
    mockNoDisco.add(FOTO);
    mockNoDisco.add(ASSINATURA);
    expect(await donoDosDadosLocais()).toBeNull();

    await entrarComo("ana@teste.gov.br");

    expect(await listarRascunhos()).toHaveLength(1);
    expect([...mockNoDisco].sort()).toEqual([ASSINATURA, FOTO].sort());
    expect(await donoDosDadosLocais()).toBe(ANA);
  });

  it("a sessão vencida carimba a Ana como dona do disco, e o Bruno que entra depois limpa", async () => {
    /*
      A marca do dono pode faltar quando a sessão vence (aparelho atualizado,
      marca apagada). `encerrarSessaoVencida` a escreve de novo, e sem ela o
      Bruno entraria num disco sem dono, que não apaga.
    */
    await turnoDaAna();
    const db = await bancoLocal();
    await db.runAsync("DELETE FROM marcas", []);
    expect(await donoDosDadosLocais()).toBeNull();

    await act(async () => { await sessao!.encerrarSessaoVencida(); });

    expect(await donoDosDadosLocais()).toBe(ANA);
    await entrarComo("bruno@teste.gov.br");
    await conferirQueOBrunoNaoViuNada();
  });

  it("contraste: a Ana que entra de novo depois de a sessão vencer reencontra tudo", async () => {
    await turnoDaAna();
    await act(async () => { await sessao!.encerrarSessaoVencida(); });

    await entrarComo("ana@teste.gov.br");

    expect(sessao?.identidade?.usuarioId).toBe(ANA);
    const rascunhos = await listarRascunhos();
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0]?.observacoes).toBe("Trinca na parede dos fundos.");
    expect([...mockNoDisco].sort()).toEqual([ASSINATURA, ASSINATURA_NA_FILA, FOTO].sort());
  });
});

describe("a credencial e a identidade saem do cofre do aparelho", () => {
  /** Nada que seja da Ana pode sobrar em nenhuma chave do cofre. */
  function semRastroDaAna(): void {
    const tudo = [...mockCofre.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
    expect(tudo).not.toContain("renovacao-ana");
    expect(tudo).not.toContain("acesso-ana");
    expect(tudo).not.toContain(ANA);
  }
  /** Ninguém logado: as duas chaves da sessão não existem no cofre. */
  function cofreVazioDeSessao(): void {
    semRastroDaAna();
    expect(mockCofre.has("dc360.credenciais")).toBe(false);
    expect(mockCofre.has("dc360.identidade")).toBe(false);
  }

  it("ao entrar, o cofre guarda as duas coisas (a base da conferência das outras)", async () => {
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    await entrarComo("ana@teste.gov.br");

    expect(mockCofre.get("dc360.credenciais")).toContain("renovacao-ana");
    expect(mockCofre.get("dc360.identidade")).toContain(ANA);
  });

  it("'Sair da conta' tira a credencial e a identidade do cofre", async () => {
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    await entrarComo("ana@teste.gov.br");

    await act(async () => { await sessao!.sair(); });

    cofreVazioDeSessao();
  });

  it("a sessão vencida tira a credencial e a identidade do cofre, mesmo sem apagar o dado", async () => {
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    await entrarComo("ana@teste.gov.br");
    await salvarRascunho(rascunhoDaAna());

    await act(async () => { await sessao!.encerrarSessaoVencida(); });

    cofreVazioDeSessao();
    expect(await listarRascunhos()).toHaveLength(1);
  });

  it("depois da saída e da entrada do Bruno, o cofre guarda só o Bruno", async () => {
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    await entrarComo("ana@teste.gov.br");
    await act(async () => { await sessao!.sair(); });

    await entrarComo("bruno@teste.gov.br");

    semRastroDaAna();
    expect(mockCofre.get("dc360.credenciais")).toContain("renovacao-bruno");
    expect(mockCofre.get("dc360.identidade")).toContain(BRUNO);
  });
});

/*
  A pausa da fila cai quando a pessoa entra de novo (V2-F00-E06, correção 3):
  o login é quem sobe a geração da credencial que a fila compara.
*/
describe("a geração da credencial, que derruba a pausa velha da fila", () => {
  it("cada `entrar` bem-sucedido sobe a geração, mesmo sendo a mesma pessoa voltando", async () => {
    await act(async () => { render(<ProvedorDeSessao><Sonda /></ProvedorDeSessao>); });
    await criarATabelaDaFila();
    const antes = geracaoDaSessao();

    await entrarComo("ana@teste.gov.br");
    const aposPrimeira = geracaoDaSessao();
    await act(async () => { await sessao!.encerrarSessaoVencida(); });
    expect(geracaoDaSessao()).toBe(aposPrimeira); // sair não é entrar
    await entrarComo("ana@teste.gov.br");

    expect(aposPrimeira).toBe(antes + 1);
    expect(geracaoDaSessao()).toBe(antes + 2);
  });
});
