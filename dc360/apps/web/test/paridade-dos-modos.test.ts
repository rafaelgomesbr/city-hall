import { describe, expect, it } from "vitest";
import * as api from "../src/dados/http";
import * as local from "../src/dados/local";
import * as repositorio from "../src/dados/repositorio";

/**
 * O portão que impede os dois modos do painel de divergirem em silêncio.
 *
 * O painel roda contra duas implementações da mesma porta (ADR 0003):
 * `src/dados/http.ts`, que fala com a API, e `src/dados/local.ts`, o Postgres
 * em WebAssembly da própria aba, que é o modo em que o produto é demonstrado
 * para a prefeitura. `src/dados/repositorio.ts` escolhe uma das duas, e
 * nenhuma página sabe qual está ativa.
 *
 * O DEFEITO QUE ISTO ATACA não é hipotético, é o caminho que a funcionalidade
 * nova percorre sozinha: ela entra pelo `http.ts`, porque é lá que a rota
 * existe, ninguém lembra do `local.ts`, e a demonstração passa a não ter o
 * recurso que acabou de ser mostrado no ambiente real. Quando o esquecimento é
 * de PARÂMETRO em vez de função inteira, é pior: a chamada continua
 * compilando, o modo local ignora o argumento calado, e a divergência só
 * aparece na reunião.
 *
 * A comparação é sobre os objetos importados de verdade, não sobre o texto dos
 * arquivos: `Function.length` é a aridade que o motor enxerga, e não há
 * expressão regular que a leia sem errar em parâmetro com valor padrão.
 *
 * Divergência DELIBERADA é legítima (o modo local não tem senha de verdade,
 * então recusa), mas ela entra nas listas abaixo com o motivo escrito ao lado.
 * Lista de exceção com motivo é documentação. Sem motivo, é tapete: por isso o
 * próprio motivo é conferido, e uma exceção que deixou de ser verdade reprova
 * junto com as outras.
 */

type Excecao = { readonly nome: string; readonly motivo: string };

/**
 * Nomes que existem só na ponta HTTP, de propósito.
 *
 * Os dois são tipos de erro, não funcionalidade. Uma implementação que não
 * usa rede não tem como levantá-los, e criar cópias inertes no modo local
 * seria fabricar simetria falsa: a página escreveria `catch` para um erro que
 * nunca chega.
 */
const SO_NA_API: readonly Excecao[] = [
  {
    nome: "ErroDaApi",
    motivo:
      "É a classe do erro que só o transporte HTTP levanta, com status e "
      + "campos vindos do servidor. O `repositorio.ts` a reexporta direto de "
      + "`./http` para as páginas fazerem `instanceof` nos dois modos; no modo "
      + "local ela simplesmente nunca é lançada.",
  },
  {
    nome: "SemConexao",
    motivo:
      "Traduz a falha de rede do `fetch` para uma frase que diz que nada foi "
      + "gravado. Onde não há rede não existe esse erro, e o banco da própria "
      + "aba nunca fica fora do ar.",
  },
];

/** Nomes que existiriam só no modo de demonstração. Hoje não há nenhum. */
const SO_NO_LOCAL: readonly Excecao[] = [];

/**
 * Funções presentes nos dois modos com aridade declarada diferente.
 *
 * Deve ficar vazia. Um degrau que recusa continua declarando os mesmos
 * parâmetros da ponta HTTP, mesmo ignorando todos: é a declaração que faz o
 * compilador reclamar quando a tela passa a mandar um argumento novo.
 */
const ARIDADE_DIVERGENTE: readonly Excecao[] = [];

const MOTIVO_MINIMO = 40;

type Superficie = Record<string, unknown>;

const superficieApi = api as unknown as Superficie;
const superficieLocal = local as unknown as Superficie;

function nomes(m: Superficie): string[] {
  return Object.keys(m).sort();
}

function comuns(): string[] {
  return nomes(superficieApi).filter((n) => n in superficieLocal);
}

function aridade(valor: unknown): number | null {
  return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).length : null;
}

function listar(nomesDaLista: readonly Excecao[]): string[] {
  return nomesDaLista.map((e) => e.nome);
}

describe("Paridade entre o modo com servidor e o modo de demonstração", () => {
  it("as duas superfícies foram carregadas de verdade", () => {
    /*
      Âncora. Sem ela, um caminho de importação errado deixaria os dois lados
      vazios e o portão passaria dizendo que está tudo em paridade, que é
      exatamente o tipo de teste que dá permissão para o defeito voltar.
    */
    expect(nomes(superficieApi).length).toBeGreaterThanOrEqual(40);
    expect(nomes(superficieLocal).length).toBeGreaterThanOrEqual(40);
    expect(api.MODO).toBe("api");
    expect(local.MODO).toBe("local");
  });

  it("tudo que a ponta HTTP exporta existe no modo de demonstração", () => {
    const faltando = nomes(superficieApi).filter(
      (n) => !(n in superficieLocal) && !listar(SO_NA_API).includes(n),
    );
    expect(
      faltando,
      "estes nomes entraram em `dados/http.ts` e ninguém lembrou de "
      + "`dados/local.ts`. A demonstração que vai à prefeitura não tem o "
      + "recurso, e é ela que o Rafa usa para vender. Implemente o equivalente "
      + "no modo local (ou uma recusa honesta, como a troca de senha faz), ou "
      + "declare a divergência em SO_NA_API com o motivo.",
    ).toEqual([]);
  });

  it("tudo que o modo de demonstração exporta existe na ponta HTTP", () => {
    const faltando = nomes(superficieLocal).filter(
      (n) => !(n in superficieApi) && !listar(SO_NO_LOCAL).includes(n),
    );
    expect(
      faltando,
      "estes nomes existem só no modo de demonstração. O sentido é pior que o "
      + "contrário: a demonstração mostra um recurso que o ambiente real não "
      + "tem, e a prefeitura compra o que não vai receber.",
    ).toEqual([]);
  });

  it("os nomes comuns têm a mesma aridade nos dois modos", () => {
    const divergentes = comuns()
      .filter((n) => !listar(ARIDADE_DIVERGENTE).includes(n))
      .map((n) => ({
        nome: n,
        api: aridade(superficieApi[n]),
        local: aridade(superficieLocal[n]),
      }))
      .filter((d) => d.api !== d.local)
      .map((d) => `${d.nome}: http=${d.api} local=${d.local}`);

    expect(
      divergentes,
      "mesma função, número de parâmetros diferente. Quem chama passa "
      + "argumento que um dos lados joga fora sem avisar. Iguale a assinatura "
      + "declarada (o degrau que recusa também declara os parâmetros que "
      + "ignora, prefixados com `_`), lembrando que valor padrão reduz a "
      + "aridade: se um lado escreve `filtro = {}`, o outro escreve igual.",
    ).toEqual([]);
  });

  it("o que existe nos dois modos chega às páginas pelo repositório", () => {
    /*
      Terceira perna da paridade, e a que faltava para o conserto valer: uma
      função pode existir nas duas implementações e mesmo assim não alcançar
      tela nenhuma, porque `repositorio.ts` reexporta nome por nome. Foi assim
      que as rotas de senha e sessão ficaram prontas na API e invisíveis no
      painel.
    */
    const alcancaveis = new Set(Object.keys(repositorio));
    const presas = comuns().filter(
      (n) => typeof superficieApi[n] === "function" && !alcancaveis.has(n),
    );
    expect(
      presas,
      "existe nos dois modos e não sai de `dados/`: falta o nome na "
      + "reexportação de `repositorio.ts`, que é a única porta das páginas.",
    ).toEqual([]);
  });

  it("nenhuma exceção está sem motivo escrito", () => {
    const semMotivo = [...SO_NA_API, ...SO_NO_LOCAL, ...ARIDADE_DIVERGENTE]
      .filter((e) => e.motivo.trim().length < MOTIVO_MINIMO)
      .map((e) => e.nome);
    expect(
      semMotivo,
      "exceção sem motivo escrito não é decisão, é tapete: o próximo a ler "
      + "não tem como saber se a divergência foi pensada ou esquecida.",
    ).toEqual([]);
  });

  it("nenhuma exceção envelheceu", () => {
    /*
      Uma lista de exceção que ninguém revisa vira permissão permanente. Se o
      nome passou a existir dos dois lados, ou se a aridade voltou a bater, a
      exceção precisa sair da lista: enquanto ela ficar, o portão está
      desligado para aquele nome sem que ninguém perceba.
    */
    const zumbis: string[] = [];

    for (const e of SO_NA_API) {
      if (!(e.nome in superficieApi)) zumbis.push(`${e.nome}: sumiu de http.ts`);
      if (e.nome in superficieLocal) zumbis.push(`${e.nome}: já existe em local.ts`);
    }
    for (const e of SO_NO_LOCAL) {
      if (!(e.nome in superficieLocal)) zumbis.push(`${e.nome}: sumiu de local.ts`);
      if (e.nome in superficieApi) zumbis.push(`${e.nome}: já existe em http.ts`);
    }
    for (const e of ARIDADE_DIVERGENTE) {
      const a = aridade(superficieApi[e.nome]);
      const l = aridade(superficieLocal[e.nome]);
      if (a === l) zumbis.push(`${e.nome}: a aridade voltou a bater`);
    }

    expect(zumbis, "exceção que deixou de ser verdade. Tire da lista.").toEqual([]);
  });

  it("as rotas de senha e sessão chegaram aos dois modos", () => {
    /*
      Âncora nominal do que este turno ligou. As três rotas existiam na API com
      teste verde e nenhuma delas alcançava o painel. A regra geral acima já
      cobriria o caso, mas ela só reprova depois que alguém escreve a função em
      um dos lados: um nome esquecido nos DOIS lados passa despercebido por
      simetria. Estes nomes são citados por extenso para que o esquecimento
      simétrico também reprove.
    */
    for (const nome of [
      "redefinirSenhaDeUsuario",
      "encerrarSessoesDeUsuario",
      "encerrarMinhasSessoes",
    ]) {
      expect(typeof superficieApi[nome], `${nome} em http.ts`).toBe("function");
      expect(typeof superficieLocal[nome], `${nome} em local.ts`).toBe("function");
      expect(
        Object.keys(repositorio),
        `${nome} precisa sair de dados/ para a tela alcançar`,
      ).toContain(nome);
    }
  });
});
