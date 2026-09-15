import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { JS_DO_CONSOLE, PAGINA_DO_CONSOLE } from "../src/pagina.js";

/**
 * A tela do console responde ao clique, e este arquivo é o portão disso.
 *
 * TRÊS DEFEITOS NASCERAM JUNTOS, e os três tinham a mesma forma: o operador
 * clica e nada acontece.
 *
 *   1. Não havia indicação de espera em etapa nenhuma da porta. A conferência
 *      de senha gasta uma derivação `scrypt` de cerca de 128 MB, que é rápida
 *      no notebook de quem desenvolve e de outra ordem numa máquina pequena de
 *      servidor. Botão que não trava, rótulo que não muda, `aria-busy` que não
 *      existe: o operador clica de novo, e agora são duas derivações.
 *   2. O `fetch` não tinha `try`/`catch`. Com o servidor reiniciando, clicar em
 *      "Continuar" produzia uma promessa rejeitada no console do navegador e
 *      efeito visível NENHUM na tela.
 *   3. Depois que o desafio da primeira etapa expirava, o formulário do código
 *      ficava na tela recusando para sempre, sem caminho de volta, até alguém
 *      pensar em recarregar a página. Quem está no plantão não pensa em
 *      recarregar a página: conclui que o console quebrou.
 *
 * POR QUE UM DOM DE MENTIRA E NÃO UMA AFIRMAÇÃO SOBRE O TEXTO DO SCRIPT: um
 * teste que procurasse "aria-busy" dentro da string do JS passaria verde com o
 * atributo sendo escrito no elemento errado, na hora errada, ou nunca desfeito.
 * O que precisa ser verdade é COMPORTAMENTO: no instante em que a chamada está
 * pendurada, o botão está travado; quando ela volta, ele destrava. Isso só se
 * mede executando o script.
 *
 * O DOM daqui é minúsculo de propósito, e cobre exatamente o que a página usa:
 * busca por identificador, criação de elemento, texto, `hidden`, `disabled`,
 * atributo, classe e foco. Ele tem uma virtude que um DOM de verdade não teria:
 * quando o script pede um identificador que o HTML não tem, ele ANOTA em vez de
 * devolver nulo em silêncio, e existe um caso abaixo que reprova por isso. Numa
 * página que sai em três strings separadas, HTML e script saindo de sincronia é
 * o defeito mais fácil de cometer.
 */

/* Elementos que não têm conteúdo próprio, para a leitura do texto inicial. */
const SEM_CONTEUDO = new Set([
  "input", "textarea", "br", "meta", "link", "img", "use", "path", "circle", "rect", "hr",
]);

/** O texto de dentro de um elemento, sem as etiquetas de dentro dele. */
function textoDeDentro(html: string, tag: string, inicio: number): string {
  if (SEM_CONTEUDO.has(tag)) return "";
  const busca = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
  busca.lastIndex = inicio;
  let profundidade = 1;
  let achado: RegExpExecArray | null;
  while ((achado = busca.exec(html)) !== null) {
    profundidade += achado[0]!.startsWith("</") ? -1 : 1;
    if (profundidade === 0) {
      return html.slice(inicio, achado.index)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return "";
}

type Molde = { id: string; tag: string; oculto: boolean; texto: string; classe: string };

/** Lê do HTML todo elemento com identificador, com o estado inicial dele. */
function moldes(html: string): Molde[] {
  const achados: Molde[] = [];
  const re = /<([a-zA-Z][\w-]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1]!.toLowerCase();
    const atributos = `${m[2] ?? ""} ${m[4] ?? ""}`;
    achados.push({
      id: m[3]!,
      tag,
      oculto: /\bhidden\b/.test(atributos),
      texto: textoDeDentro(html, tag, re.lastIndex),
      classe: /\bclass="([^"]*)"/.exec(atributos)?.[1] ?? "",
    });
  }
  return achados;
}

class No {
  tag: string;
  id = "";
  hidden = false;
  disabled = false;
  className = "";
  value = "";
  filhos: No[] = [];
  atributos: Record<string, string> = {};
  ouvintes: Record<string, ((evento: unknown) => unknown)[]> = {};
  focos = 0;
  resets = 0;
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    contains: (c: string) => boolean;
  };

  private texto = "";

  constructor(tag: string) {
    this.tag = tag;
    this.classList = {
      add: (c) => {
        const atuais = this.classes();
        if (!atuais.includes(c)) this.className = [...atuais, c].join(" ");
      },
      remove: (c) => {
        this.className = this.classes().filter((x) => x !== c).join(" ");
      },
      contains: (c) => this.classes().includes(c),
    };
  }

  classes(): string[] {
    return this.className.split(/\s+/).filter(Boolean);
  }

  get textContent(): string {
    return this.texto + this.filhos.map((f) => f.textContent).join("");
  }

  set textContent(valor: unknown) {
    this.texto = valor === null || valor === undefined ? "" : String(valor);
    this.filhos = [];
  }

  appendChild(filho: No): No {
    this.filhos.push(filho);
    return filho;
  }

  setAttribute(nome: string, valor: unknown): void {
    this.atributos[nome] = String(valor);
    if (nome === "class") this.className = String(valor);
  }

  getAttribute(nome: string): string | null {
    return this.atributos[nome] ?? null;
  }

  removeAttribute(nome: string): void {
    delete this.atributos[nome];
  }

  addEventListener(tipo: string, fn: (evento: unknown) => unknown): void {
    (this.ouvintes[tipo] ??= []).push(fn);
  }

  focus(): void {
    this.focos += 1;
  }

  /* O formulário de cadastro chama `reset()`. Aqui basta não explodir e
     registrar que foi chamado: o teste do cadastro confere o efeito pelo que a
     tela mostra, e não pelo estado interno do formulário. */
  reset(): void {
    this.resets += 1;
  }

  /** Um descendente cuja etiqueta e cujo texto batem, para achar botão em linha de tabela. */
  achar(tag: string, texto: string): No | null {
    for (const filho of this.filhos) {
      if (filho.tag === tag && filho.textContent.includes(texto)) return filho;
      const dentro = filho.achar(tag, texto);
      if (dentro) return dentro;
    }
    return null;
  }

  /** Todos os descendentes com a etiqueta. */
  todos(tag: string): No[] {
    const achados: No[] = [];
    for (const filho of this.filhos) {
      if (filho.tag === tag) achados.push(filho);
      achados.push(...filho.todos(tag));
    }
    return achados;
  }

  /** Dispara um evento num nó qualquer, com o objeto de evento dado. */
  disparar(tipo: string, evento: Record<string, unknown> = {}): Promise<unknown> {
    const ouvintes = this.ouvintes[tipo] ?? [];
    if (ouvintes.length === 0) {
      throw new Error(`nada escuta "${tipo}" em <${this.tag}>: o clique não faz nada`);
    }
    return Promise.all(ouvintes.map((fn) => fn({ preventDefault() {}, ...evento })));
  }
}

type Adiado = {
  caminho: string;
  opcoes: Record<string, unknown> | undefined;
  resolver: (r: unknown) => void;
  recusar: (e: unknown) => void;
};

/** Uma resposta de servidor, como o `fetch` a entrega. */
function resposta(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo };
}

type Tela = {
  pegar: (id: string) => No;
  faltantes: string[];
  chamadas: Adiado[];
  ultima: () => Adiado;
  guardados: { chave: string; valor: string }[];
  disparar: (id: string, tipo: string) => Promise<unknown>;
  passo: () => Promise<void>;
};

/**
 * Monta a página e executa o script dela, do mesmo jeito que o navegador faria.
 *
 * O `fetch` daqui não responde sozinho: cada chamada fica PENDURADA até o caso
 * de teste resolvê-la à mão. É isso que permite afirmar o que a tela mostra
 * durante a espera, que é justamente o que faltava.
 */
function montarTela(): Tela {
  const registro = new Map<string, No>();
  for (const molde of moldes(PAGINA_DO_CONSOLE)) {
    const no = new No(molde.tag);
    no.id = molde.id;
    no.hidden = molde.oculto;
    no.textContent = molde.texto;
    no.className = molde.classe;
    registro.set(molde.id, no);
  }

  const faltantes: string[] = [];
  const chamadas: Adiado[] = [];
  const guardados: { chave: string; valor: string }[] = [];
  const armazem = new Map<string, string>();

  const documento = {
    documentElement: new No("html"),
    getElementById(id: string) {
      const no = registro.get(id);
      if (!no) {
        faltantes.push(id);
        return null;
      }
      return no;
    },
    createElement: (tag: string) => new No(tag),
    createElementNS: (_ns: string, tag: string) => new No(tag),
  };

  const janela = {
    localStorage: {
      getItem: (chave: string) => armazem.get(chave) ?? null,
      setItem: (chave: string, valor: string) => {
        guardados.push({ chave, valor: String(valor) });
        armazem.set(chave, String(valor));
      },
      removeItem: (chave: string) => armazem.delete(chave),
    },
    matchMedia: () => ({ matches: false }),
  };

  const contexto = createContext({
    document: documento,
    window: janela,
    console,
    fetch: (caminho: string, opcoes?: Record<string, unknown>) =>
      new Promise((resolver, recusar) => {
        chamadas.push({ caminho, opcoes, resolver, recusar });
      }),
  });

  runInContext(JS_DO_CONSOLE, contexto);

  return {
    pegar(id: string): No {
      const no = registro.get(id);
      if (!no) throw new Error(`o HTML da página não tem o elemento "${id}"`);
      return no;
    },
    faltantes,
    chamadas,
    ultima: () => chamadas[chamadas.length - 1]!,
    guardados,
    disparar(id: string, tipo: string) {
      const no = registro.get(id);
      if (!no) throw new Error(`o HTML da página não tem o elemento "${id}"`);
      const ouvintes = no.ouvintes[tipo] ?? [];
      if (ouvintes.length === 0) {
        throw new Error(`nada escuta "${tipo}" em "${id}": o clique não faz nada`);
      }
      return Promise.all(ouvintes.map((fn) => fn({ preventDefault() {} })));
    },
    /* Deixa a fila de microtarefas andar até o próximo `await` do script. */
    async passo() {
      for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
    },
  };
}

/** Faz a porta inteira, das duas etapas, e para com o painel carregado. */
async function entrar(
  tela: Tela,
  email = "coordenacao@fornecedor.com.br",
  papel: "dono" | "operador" = "dono",
  municipios: unknown[] = [],
) {
  tela.pegar("email").value = email;
  tela.pegar("senha").value = "uma senha qualquer";
  const primeira = tela.disparar("forma-senha", "submit");
  await tela.passo();
  tela.ultima().resolver(resposta({ desafio: "desafio-de-teste", falta: "codigo" }));
  await primeira;

  tela.pegar("codigo").value = "123456";
  const segunda = tela.disparar("forma-codigo", "submit");
  await tela.passo();
  tela.ultima().resolver(resposta({ token: "token-de-teste", operador: email, papel }));
  await tela.passo();
  /* A entrada bem-sucedida já pede os números, e esta é a chamada de /municipios. */
  tela.ultima().resolver(resposta({ municipios }));
  await segunda;
}

const SERRA_ALTA = {
  organizacao_id: "11111111-1111-4111-8111-111111111111",
  municipio: "Serra Alta", uf: "MG", sem_escrita_recente: false, horas_desde_a_escrita: 2,
  ocorrencias_abertas: 4, ocorrencias_atrasadas: 1,
  acesso_suspenso_em: null, suspensao_motivo: null,
  eliminacao_agendada_para: null, eliminada_em: null,
};

/** A linha de Serra Alta na tabela, achada pelo nome, e não pela posição. */
function linhaDe(tela: Tela, municipio: string): No {
  const linha = tela.pegar("linhas").filhos.find((l) => l.textContent.includes(municipio));
  if (!linha) throw new Error(`${municipio} não está na tabela`);
  return linha;
}

/** O corpo enviado na última chamada, já analisado. */
function corpoDaUltima(tela: Tela): Record<string, unknown> {
  return JSON.parse(String(tela.ultima().opcoes?.["body"] ?? "{}")) as Record<string, unknown>;
}

let tela: Tela;

beforeEach(() => {
  tela = montarTela();
});

describe("O script e o HTML da pagina falam da mesma tela", () => {
  it("o script nao pede nenhum elemento que o HTML nao tem", () => {
    /*
      A página sai em três strings separadas (HTML, CSS e script), e nada no
      compilador liga uma à outra. Um identificador renomeado no HTML e esquecido
      no script não quebra o build: ele quebra a tela, em produção, no clique.
    */
    expect(
      tela.faltantes,
      `o script pediu elemento que o HTML nao tem: ${tela.faltantes.join(", ")}`,
    ).toEqual([]);
  });

  it("a tela abre na porta, com o painel e o cadastro fora do caminho", () => {
    expect(tela.pegar("porta").hidden).toBe(false);
    expect(tela.pegar("painel").hidden).toBe(true);
    expect(tela.pegar("cadastro").hidden).toBe(true);
    expect(tela.pegar("forma-codigo").hidden, "a segunda etapa abre antes da primeira")
      .toBe(true);
  });
});

describe("A primeira etapa da porta mostra que esta trabalhando", () => {
  it("enquanto a senha esta sendo conferida, o botao trava, avisa e marca aria-busy", async () => {
    /*
      Cada tentativa gasta uma derivação scrypt de cerca de 128 MB. Numa máquina
      pequena de servidor isso são segundos, e segundos sem sinal nenhum na tela
      são indistinguíveis de um botão quebrado.
    */
    const botao = tela.pegar("continuar");
    const rotulo = tela.pegar("continuar-texto");
    const antes = rotulo.textContent;

    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();

    expect(botao.disabled, "o botao aceita um segundo clique enquanto o primeiro roda")
      .toBe(true);
    expect(botao.getAttribute("aria-busy"), "quem ouve a tela nao soube da espera")
      .toBe("true");
    expect(
      rotulo.textContent,
      "o rotulo do botao nao mudou: a tela nao diz o que esta acontecendo",
    ).not.toBe(antes);

    tela.ultima().resolver(resposta({ desafio: "d" }));
    await promessa;

    expect(botao.disabled, "o botao ficou travado depois da resposta").toBe(false);
    expect(botao.getAttribute("aria-busy")).toBe("false");
    expect(rotulo.textContent, "o rotulo nao voltou ao que era").toBe(antes);
  });

  it("com o servidor fora do ar, clicar em Continuar diz alguma coisa e devolve o botao", async () => {
    /*
      O caso que não produzia efeito visível NENHUM: `fetch` rejeita quando o
      processo está reiniciando, e sem `try`/`catch` a promessa morria sozinha.
      A tela ficava exatamente como estava, e o operador clicava de novo.
    */
    const botao = tela.pegar("continuar");
    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;

    expect(tela.pegar("recado").hidden, "a tela nao mostrou recado nenhum").toBe(false);
    expect(
      tela.pegar("recado-texto").textContent.length,
      "o recado apareceu vazio: continua sem dizer nada",
    ).toBeGreaterThan(0);
    expect(botao.disabled, "o botao ficou travado para sempre").toBe(false);
  });

  it("senha recusada mostra a mensagem do servidor e deixa o operador tentar de novo", async () => {
    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().resolver(
      resposta({ erro: "credenciais_invalidas", mensagem: "Email ou senha incorretos." }, false),
    );
    await promessa;

    expect(tela.pegar("recado-texto").textContent).toBe("Email ou senha incorretos.");
    expect(tela.pegar("forma-senha").hidden, "a tela avancou com a senha recusada").toBe(false);
    expect(tela.pegar("continuar").disabled).toBe(false);
  });

  it("com a senha certa, a tela vai para a segunda etapa e diz de quem e o codigo", async () => {
    tela.pegar("email").value = "coordenacao@fornecedor.com.br";
    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ desafio: "d", falta: "codigo" }));
    await promessa;

    expect(tela.pegar("forma-senha").hidden).toBe(true);
    expect(tela.pegar("forma-codigo").hidden).toBe(false);
    expect(tela.pegar("codigo-de-quem").textContent).toBe("coordenacao@fornecedor.com.br");
    expect(tela.pegar("codigo").focos, "o cursor nao foi para o campo do codigo")
      .toBeGreaterThan(0);
  });
});

describe("A segunda etapa tem espera e tem caminho de volta", () => {
  async function chegarNoCodigo() {
    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ desafio: "d", falta: "codigo" }));
    await promessa;
  }

  it("enquanto o codigo esta sendo conferido, o botao de entrar trava e avisa", async () => {
    await chegarNoCodigo();
    const botao = tela.pegar("entrar");
    const rotulo = tela.pegar("entrar-texto");
    const antes = rotulo.textContent;

    const promessa = tela.disparar("forma-codigo", "submit");
    await tela.passo();

    expect(botao.disabled).toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(rotulo.textContent).not.toBe(antes);

    tela.ultima().resolver(resposta({ token: "t", operador: "a@b.c" }));
    await tela.passo();
    tela.ultima().resolver(resposta({ municipios: [] }));
    await promessa;

    expect(botao.disabled).toBe(false);
    expect(rotulo.textContent).toBe(antes);
  });

  it("com o servidor fora do ar na segunda etapa, a tela tambem diz", async () => {
    await chegarNoCodigo();
    const promessa = tela.disparar("forma-codigo", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;

    expect(tela.pegar("recado").hidden).toBe(false);
    expect(tela.pegar("recado-texto").textContent.length).toBeGreaterThan(0);
    expect(tela.pegar("entrar").disabled).toBe(false);
  });

  it("desafio expirado devolve a tela para a senha, sem ninguem recarregar a pagina", async () => {
    /*
      O beco sem saída: o desafio expira em minutos, e quem digitasse o código
      depois disso recebia "a tentativa de entrada expirou" para sempre, no
      mesmo formulário, sem nenhum caminho de volta.
    */
    await chegarNoCodigo();
    const promessa = tela.disparar("forma-codigo", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      erro: "desafio_invalido",
      mensagem: "A tentativa de entrada expirou. Comece de novo.",
    }, false));
    await promessa;

    expect(
      tela.pegar("forma-codigo").hidden,
      "a tela ficou presa no formulario do codigo, que ja nao tem como dar certo",
    ).toBe(true);
    expect(tela.pegar("forma-senha").hidden, "o formulario da senha nao voltou").toBe(false);
    expect(tela.pegar("recado-texto").textContent).toContain("expirou");
  });

  it("codigo errado NAO devolve a tela para a senha: o desafio ainda vale", async () => {
    /*
      A outra metade do caso de cima, e ela importa: quem errou um dígito não
      pode ser mandado de volta para digitar a senha inteira de novo, porque o
      desafio dele continua valendo.
    */
    await chegarNoCodigo();
    const promessa = tela.disparar("forma-codigo", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      erro: "codigo_invalido", mensagem: "Código incorreto ou já usado.",
    }, false));
    await promessa;

    expect(tela.pegar("forma-codigo").hidden).toBe(false);
    expect(tela.pegar("forma-senha").hidden).toBe(true);
    expect(tela.pegar("recado-texto").textContent).toContain("incorreto");
  });

  it("existe um caminho de volta para a senha mesmo sem erro nenhum", async () => {
    await chegarNoCodigo();
    await tela.disparar("voltar-para-senha", "click");

    expect(tela.pegar("forma-senha").hidden).toBe(false);
    expect(tela.pegar("forma-codigo").hidden).toBe(true);
    expect(tela.pegar("codigo").value, "o codigo digitado ficou na tela").toBe("");
  });
});

describe("A tabela de municipios mostra que esta carregando", () => {
  it("antes dos numeros chegarem, a tabela mostra esqueleto e se declara ocupada", async () => {
    /*
      Sem isso, a tabela fica vazia por um tempo que parece erro, e o estado
      vazio de verdade ("nenhum município cadastrado") fica indistinguível de
      "ainda estou buscando". São coisas diferentes e precisam parecer
      diferentes.
    */
    const promessa = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ desafio: "d" }));
    await promessa;

    const segunda = tela.disparar("forma-codigo", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ token: "t", operador: "a@b.c" }));
    await tela.passo();

    const corpoDaTabela = tela.pegar("linhas");
    expect(
      corpoDaTabela.filhos.length,
      "a tabela ficou vazia enquanto os numeros nao chegavam",
    ).toBeGreaterThan(0);
    expect(
      tela.pegar("rolagem").getAttribute("aria-busy"),
      "quem ouve a tela nao soube que ela esta carregando",
    ).toBe("true");
    const primeira = corpoDaTabela.filhos[0]!;
    const primeiraCelula = primeira.filhos[0]!.filhos[0]!;
    expect(primeiraCelula.className).toContain("esqueleto");

    tela.ultima().resolver(resposta({ municipios: [] }));
    await segunda;

    expect(tela.pegar("rolagem").getAttribute("aria-busy")).toBe("false");
    expect(corpoDaTabela.filhos.length, "o esqueleto ficou na tela depois da resposta").toBe(0);
  });

  it("sem municipio nenhum, aparece o estado vazio desenhado", async () => {
    await entrar(tela);
    expect(tela.pegar("vazio").hidden).toBe(false);
    expect(tela.pegar("linhas").filhos.length).toBe(0);
  });

  it("com municipios, o resumo conta o que a tabela mostra", async () => {
    tela.pegar("email").value = "a@b.c";
    const primeira = tela.disparar("forma-senha", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ desafio: "d" }));
    await primeira;
    const segunda = tela.disparar("forma-codigo", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ token: "t", operador: "a@b.c" }));
    await tela.passo();
    tela.ultima().resolver(resposta({
      municipios: [
        {
          municipio: "Serra Alta", uf: "MG", sem_escrita_recente: true,
          horas_desde_a_escrita: 51, ocorrencias_abertas: 4, ocorrencias_atrasadas: 2,
        },
        {
          municipio: "Vale do Norte", uf: "MG", sem_escrita_recente: false,
          horas_desde_a_escrita: 2, ocorrencias_abertas: 1, ocorrencias_atrasadas: 0,
        },
      ],
    }));
    await segunda;

    expect(tela.pegar("vazio").hidden).toBe(true);
    expect(tela.pegar("linhas").filhos.length).toBe(2);
    expect(tela.pegar("kpi-municipios").textContent).toBe("2");
    expect(tela.pegar("kpi-calados").textContent).toBe("1");
    expect(tela.pegar("kpi-abertas").textContent).toBe("5");
    expect(tela.pegar("kpi-atrasadas").textContent).toBe("2");

    /*
      O alarme NUNCA é só cor: o cartão acende E a nota embaixo muda de frase, e
      a célula do município calado traz a palavra "calado" junto do marcador.
    */
    expect(tela.pegar("cartao-calados").classList.contains("acesa")).toBe(true);
    expect(tela.pegar("kpi-calados-nota").textContent).not.toBe("Sem escrita recente");
    expect(tela.pegar("linhas").filhos[0]!.textContent).toContain("calado");
    expect(tela.pegar("linhas").filhos[1]!.textContent).toContain("em dia");
  });

  it("com o servidor fora do ar na busca dos numeros, a tela diz e nao derruba a sessao", async () => {
    await entrar(tela);
    const promessa = tela.disparar("atualizar", "click");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await tela.passo();
    await promessa;

    expect(tela.pegar("recado-painel").hidden).toBe(false);
    expect(
      tela.pegar("painel").hidden,
      "uma queda de rede expulsou o operador do console",
    ).toBe(false);
    expect(tela.pegar("atualizar").disabled).toBe(false);
  });

  it("sessao vencida devolve a tela para a porta, com o recado", async () => {
    await entrar(tela);
    const promessa = tela.disparar("atualizar", "click");
    await tela.passo();
    tela.ultima().resolver(resposta({ erro: "sem_sessao" }, false));
    await tela.passo();
    await promessa;

    expect(tela.pegar("porta").hidden).toBe(false);
    expect(tela.pegar("painel").hidden).toBe(true);
    expect(tela.pegar("forma-senha").hidden, "voltou para a porta no formulario errado")
      .toBe(false);
    expect(tela.pegar("recado-texto").textContent).toContain("sessão");
  });
});

describe("A senha inicial da prefeitura vive na tela e em mais lugar nenhum", () => {
  async function cadastrar(): Promise<string> {
    await entrar(tela);
    await tela.disparar("abrir-cadastro", "click");
    tela.pegar("municipio").value = "Serra Alta";
    tela.pegar("uf").value = "mg";
    tela.pegar("nome-admin").value = "Rita Nogueira";
    const promessa = tela.disparar("forma-cadastro", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      senhaInicial: "senha-sorteada-pelo-servidor",
      organizacaoId: "11111111-1111-4111-8111-111111111111",
      usuarioId: "22222222-2222-4222-8222-222222222222",
    }, true));
    await promessa;
    return "senha-sorteada-pelo-servidor";
  }

  it("enquanto a prefeitura esta sendo criada, o botao trava e avisa", async () => {
    await entrar(tela);
    await tela.disparar("abrir-cadastro", "click");
    const botao = tela.pegar("criar");
    const rotulo = tela.pegar("criar-texto");
    const antes = rotulo.textContent;

    const promessa = tela.disparar("forma-cadastro", "submit");
    await tela.passo();
    expect(botao.disabled).toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(rotulo.textContent).not.toBe(antes);

    tela.ultima().resolver(resposta({
      senhaInicial: "x", organizacaoId: "o", usuarioId: "u",
    }));
    await promessa;
    expect(botao.disabled).toBe(false);
    expect(rotulo.textContent).toBe(antes);
  });

  it("com o servidor fora do ar, o cadastro diz e nao some com o formulario", async () => {
    await entrar(tela);
    await tela.disparar("abrir-cadastro", "click");
    const promessa = tela.disparar("forma-cadastro", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;

    expect(tela.pegar("recado-cadastro").hidden).toBe(false);
    expect(tela.pegar("forma-cadastro").hidden).toBe(false);
    expect(tela.pegar("entregue").hidden, "mostrou a tela de sucesso sem ter criado nada")
      .toBe(true);
  });

  it("a senha aparece uma vez, e nao passa por armazenamento nenhum do navegador", async () => {
    const senha = await cadastrar();

    expect(tela.pegar("senha-inicial").textContent).toBe(senha);
    expect(tela.pegar("entregue").hidden).toBe(false);

    /*
      O único valor que este console guarda no navegador é o nome do tema. Nem
      a senha inicial, nem o token de sessão: quem fecha a aba fecha a sessão, e
      a senha existe só na cabeça e no papel de quem cadastrou.
    */
    const escritos = tela.guardados.map((g) => `${g.chave}=${g.valor}`).join(" | ");
    expect(escritos, "a senha inicial foi parar no armazenamento do navegador")
      .not.toContain(senha);
    expect(escritos, "o token de sessao foi parar no armazenamento do navegador")
      .not.toContain("token-de-teste");
    for (const guardado of tela.guardados) {
      expect(
        guardado.chave,
        `o console guardou "${guardado.chave}" no navegador, e so o tema pode ficar la`,
      ).toContain("tema");
    }
  });

  it("concluir apaga a senha da tela e volta aos municipios", async () => {
    const senha = await cadastrar();
    await tela.disparar("concluir", "click");
    await tela.passo();

    expect(tela.pegar("senha-inicial").textContent, "a senha ficou no documento").toBe("");
    expect(tela.pegar("senha-inicial").textContent).not.toContain(senha);
    expect(tela.pegar("id-municipio").textContent).toBe("");
    expect(tela.pegar("cadastro").hidden).toBe(true);
    expect(tela.pegar("painel").hidden).toBe(false);
  });

  it("sair apaga a senha, o email de quem entrou e a tabela", async () => {
    await cadastrar();
    await tela.disparar("sair", "click");

    expect(tela.pegar("senha-inicial").textContent).toBe("");
    expect(tela.pegar("quem-email").textContent).toBe("");
    expect(tela.pegar("linhas").filhos.length).toBe(0);
    expect(tela.pegar("porta").hidden).toBe(false);
    expect(tela.pegar("forma-senha").hidden, "saiu para a segunda etapa da porta").toBe(false);
  });
});

describe("Os dois temas, com alternancia visivel no topo", () => {
  it("o botao do tema troca o tema e diz o que ele faz", () => {
    const raiz = new No("html");
    void raiz;
    const botao = tela.pegar("tema");
    const rotulo = tela.pegar("tema-rotulo");

    expect(botao.getAttribute("aria-pressed")).toBe("false");
    const antes = rotulo.textContent;

    void tela.disparar("tema", "click");
    expect(botao.getAttribute("aria-pressed"), "o botao nao contou que o tema mudou")
      .toBe("true");
    expect(
      rotulo.textContent,
      "o rotulo do botao nao mudou: ele continua prometendo o tema em que a tela ja esta",
    ).not.toBe(antes);

    void tela.disparar("tema", "click");
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    expect(rotulo.textContent).toBe(antes);
  });

  it("o tema escolhido e a unica coisa que fica guardada", () => {
    void tela.disparar("tema", "click");
    expect(tela.guardados.length).toBe(1);
    expect(tela.guardados[0]!.chave).toContain("tema");
    expect(tela.guardados[0]!.valor).toBe("escuro");
  });
});

/* ==========================================================================
   As duas ações perigosas por município, e o diálogo do produto
   ========================================================================== */

describe("O operador comum ve numeros e cadastra, e nao ve as acoes do dono", () => {
  it("para o operador, nem a coluna de acoes nem a area de usuarios aparecem", async () => {
    await entrar(tela, "plantao@fornecedor.com.br", "operador", [SERRA_ALTA]);
    expect(tela.pegar("ir-usuarios").hidden, "o operador ve o atalho de usuarios").toBe(true);
    expect(tela.pegar("th-acoes").hidden, "a coluna de acoes apareceu para o operador").toBe(true);
    const linha = linhaDe(tela, "Serra Alta");
    expect(linha.achar("button", "Eliminar"), "o operador ve o botao de eliminar").toBeNull();
    expect(linha.achar("button", "Desativar"), "o operador ve o botao de desativar").toBeNull();
    // Mas cadastra prefeitura e troca a propria senha.
    expect(tela.pegar("abrir-cadastro").hidden).toBe(false);
    expect(tela.pegar("ir-senha").hidden).toBe(false);
  });

  it("para o dono, a coluna de acoes existe e cada linha tem os dois botoes", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    expect(tela.pegar("ir-usuarios").hidden).toBe(false);
    expect(tela.pegar("th-acoes").hidden).toBe(false);
    const linha = linhaDe(tela, "Serra Alta");
    expect(linha.achar("button", "Desativar acesso")).not.toBeNull();
    expect(linha.achar("button", "Eliminar")).not.toBeNull();
    expect(linha.textContent, "o estado de acesso nao tem palavra").toContain("ativo");
  });
});

describe("Desativar o acesso e reativar, pelo dialogo do produto", () => {
  it("desativar abre o dialogo com motivo, e o botao de agir repete o verbo com o nome da prefeitura", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    const botao = linhaDe(tela, "Serra Alta").achar("button", "Desativar acesso")!;
    await botao.disparar("click");

    expect(tela.pegar("dialogo").hidden, "o dialogo nao abriu").toBe(false);
    expect(tela.pegar("dialogo-titulo").textContent).toContain("Serra Alta");
    expect(tela.pegar("dialogo-campo-motivo").hidden, "o dialogo nao pede motivo").toBe(false);
    expect(tela.pegar("dialogo-agir-texto").textContent).toContain("Desativar o acesso de Serra Alta");
    /* O resto da pagina fica inerte enquanto a pergunta esta aberta. */
    expect(tela.pegar("principal").getAttribute("inert"), "a pagina atras continua viva").not.toBeNull();
    expect(tela.pegar("dialogo-cartao").focos, "o foco nao entrou no dialogo").toBeGreaterThan(0);
  });

  it("sem motivo, o dialogo nao manda nada e diz o que falta", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    await linhaDe(tela, "Serra Alta").achar("button", "Desativar acesso")!.disparar("click");
    const antes = tela.chamadas.length;
    tela.pegar("dialogo-motivo").value = "   ";
    await tela.disparar("forma-dialogo", "submit");
    expect(tela.chamadas.length, "mandou suspender sem motivo").toBe(antes);
    expect(tela.pegar("recado-dialogo").hidden).toBe(false);
  });

  it("com motivo, manda o pedido certo, trava o botao enquanto espera, fecha e recarrega", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    await linhaDe(tela, "Serra Alta").achar("button", "Desativar acesso")!.disparar("click");
    tela.pegar("dialogo-motivo").value = "Inadimplência";
    const promessa = tela.disparar("forma-dialogo", "submit");
    await tela.passo();

    expect(tela.ultima().caminho).toBe(`/municipios/${SERRA_ALTA.organizacao_id}/suspender`);
    expect(corpoDaUltima(tela)["motivo"]).toBe("Inadimplência");
    expect(tela.pegar("dialogo-agir").disabled, "o botao aceita um segundo clique").toBe(true);
    expect(tela.pegar("dialogo-agir").getAttribute("aria-busy")).toBe("true");

    tela.ultima().resolver(resposta({ municipio: {} }));
    await tela.passo();
    /* Recarrega a lista, e a linha volta dizendo que esta suspensa. */
    expect(tela.ultima().caminho).toBe("/municipios");
    tela.ultima().resolver(resposta({ municipios: [{
      ...SERRA_ALTA, acesso_suspenso_em: "2026-09-15T12:00:00Z", suspensao_motivo: "Inadimplência",
    }] }));
    await promessa;
    await tela.passo();

    expect(tela.pegar("dialogo").hidden, "o dialogo ficou aberto depois de agir").toBe(true);
    expect(tela.pegar("principal").getAttribute("inert"), "a pagina continuou inerte").toBeNull();
    const linha = linhaDe(tela, "Serra Alta");
    expect(linha.textContent).toContain("suspenso desde");
    expect(linha.textContent).toContain("Inadimplência");
    expect(linha.achar("button", "Reativar"), "sem botao de reativar na linha suspensa").not.toBeNull();
    expect(linha.achar("button", "Desativar acesso")).toBeNull();
  });

  it("com o servidor fora do ar, o dialogo diz e continua aberto", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    await linhaDe(tela, "Serra Alta").achar("button", "Desativar acesso")!.disparar("click");
    tela.pegar("dialogo-motivo").value = "Teste";
    const promessa = tela.disparar("forma-dialogo", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;

    expect(tela.pegar("dialogo").hidden).toBe(false);
    expect(tela.pegar("recado-dialogo").hidden).toBe(false);
    expect(tela.pegar("recado-dialogo-texto").textContent.length).toBeGreaterThan(0);
    expect(tela.pegar("dialogo-agir").disabled).toBe(false);
  });

  it("recusar fecha sem mandar nada, e Escape tambem", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [SERRA_ALTA]);
    const botao = linhaDe(tela, "Serra Alta").achar("button", "Desativar acesso")!;
    await botao.disparar("click");
    const antes = tela.chamadas.length;
    await tela.disparar("dialogo-recusar", "click");
    expect(tela.pegar("dialogo").hidden).toBe(true);
    expect(tela.chamadas.length).toBe(antes);
    expect(botao.focos, "o foco nao voltou para quem abriu o dialogo").toBeGreaterThan(0);

    await botao.disparar("click");
    expect(tela.pegar("dialogo").hidden).toBe(false);
    await tela.pegar("dialogo-cartao").disparar("keydown", { key: "Escape" });
    expect(tela.pegar("dialogo").hidden, "Escape nao fechou o dialogo").toBe(true);
  });

  it("reativar pede confirmacao sem motivo, e manda o pedido certo", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono", [{
      ...SERRA_ALTA, acesso_suspenso_em: "2026-09-15T12:00:00Z", suspensao_motivo: "Inadimplência",
    }]);
    await linhaDe(tela, "Serra Alta").achar("button", "Reativar")!.disparar("click");
    expect(tela.pegar("dialogo-campo-motivo").hidden, "reativar pediu motivo").toBe(true);
    expect(tela.pegar("dialogo-agir-texto").textContent).toContain("Reativar o acesso de Serra Alta");
    const promessa = tela.disparar("forma-dialogo", "submit");
    await tela.passo();
    expect(tela.ultima().caminho).toBe(`/municipios/${SERRA_ALTA.organizacao_id}/reativar`);
    tela.ultima().resolver(resposta({ municipio: {} }));
    await tela.passo();
    tela.ultima().resolver(resposta({ municipios: [SERRA_ALTA] }));
    await promessa;
  });
});

describe("Eliminar, com senha, codigo novo, nome exato e motivo, nessa ordem", () => {
  async function abrirEliminar(municipios: unknown[] = [SERRA_ALTA]) {
    await entrar(tela, "dona@fornecedor.com.br", "dono", municipios);
    await linhaDe(tela, "Serra Alta").achar("button", "Eliminar")!.disparar("click");
  }

  it("o modal tem os quatro campos nessa ordem, e o botao destrutivo repete o verbo com o nome", async () => {
    await abrirEliminar();
    expect(tela.pegar("dialogo-eliminar").hidden, "o modal de eliminar nao abriu").toBe(false);
    expect(tela.pegar("eliminar-titulo").textContent).toContain("Serra Alta");
    expect(tela.pegar("eliminar-agir-texto").textContent).toBe("Agendar a eliminação de Serra Alta");
    expect(tela.pegar("eliminar-agir").className, "o botao de eliminar nao e o tipo destrutivo")
      .toContain("botao-perigo");

    /* A ordem dos campos e a ordem em que o servidor confere. */
    const ordem = [...PAGINA_DO_CONSOLE.matchAll(/id="(eliminar-senha|eliminar-codigo|eliminar-nome|eliminar-motivo)"/g)]
      .map((m) => m[1]);
    expect(ordem).toEqual(["eliminar-senha", "eliminar-codigo", "eliminar-nome", "eliminar-motivo"]);
    expect(tela.pegar("principal").getAttribute("inert")).not.toBeNull();
  });

  it("nome diferente do exato nao manda nada, e diz", async () => {
    await abrirEliminar();
    const antes = tela.chamadas.length;
    tela.pegar("eliminar-senha").value = "senha";
    tela.pegar("eliminar-codigo").value = "123456";
    tela.pegar("eliminar-nome").value = "serra alta";
    tela.pegar("eliminar-motivo").value = "fim de contrato";
    await tela.disparar("forma-eliminar", "submit");
    expect(tela.chamadas.length, "mandou eliminar com o nome errado").toBe(antes);
    expect(tela.pegar("recado-eliminar").hidden).toBe(false);
    expect(tela.pegar("recado-eliminar-texto").textContent).toContain("exato");
  });

  it("com tudo preenchido, manda os quatro, trava o botao, e a linha passa a mostrar o prazo e o cancelar", async () => {
    await abrirEliminar();
    tela.pegar("eliminar-senha").value = "a-senha";
    tela.pegar("eliminar-codigo").value = "654321";
    tela.pegar("eliminar-nome").value = "Serra Alta";
    tela.pegar("eliminar-motivo").value = "fim de contrato";
    const promessa = tela.disparar("forma-eliminar", "submit");
    await tela.passo();

    expect(tela.ultima().caminho).toBe(`/municipios/${SERRA_ALTA.organizacao_id}/eliminar`);
    expect(corpoDaUltima(tela)).toEqual({
      senha: "a-senha", codigo: "654321", nome: "Serra Alta", motivo: "fim de contrato",
    });
    expect(tela.pegar("eliminar-agir").disabled).toBe(true);
    expect(tela.pegar("eliminar-agir").getAttribute("aria-busy")).toBe("true");

    const daqui7 = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    tela.ultima().resolver(resposta({ municipio: {}, eliminacao_agendada_para: daqui7 }));
    await tela.passo();
    expect(tela.ultima().caminho).toBe("/municipios");
    tela.ultima().resolver(resposta({ municipios: [{
      ...SERRA_ALTA, acesso_suspenso_em: new Date().toISOString(), suspensao_motivo: "fim de contrato",
      eliminacao_agendada_para: daqui7,
    }] }));
    await promessa;
    await tela.passo();

    expect(tela.pegar("dialogo-eliminar").hidden, "o modal ficou aberto").toBe(true);
    const linha = linhaDe(tela, "Serra Alta");
    expect(linha.textContent).toMatch(/eliminação em 7 dias/);
    expect(linha.textContent).toMatch(/dia \d{2}\/\d{2} às \d{2}:\d{2}/);
    expect(linha.achar("button", "Cancelar eliminação"), "o cancelar nao esta a vista").not.toBeNull();
    expect(linha.achar("button", "Eliminar"), "eliminar continua oferecido com a eliminacao agendada").toBeNull();
    expect(linha.achar("button", "Reativar"), "reativar oferecido com eliminacao agendada").toBeNull();

    /* A senha e o codigo nao ficam no formulario depois de agir. */
    expect(tela.pegar("eliminar-senha").value).toBe("");
    expect(tela.pegar("eliminar-codigo").value).toBe("");
  });

  it("codigo ja usado volta a mensagem do servidor, com o modal aberto e a senha apagada", async () => {
    await abrirEliminar();
    tela.pegar("eliminar-senha").value = "a-senha";
    tela.pegar("eliminar-codigo").value = "111111";
    tela.pegar("eliminar-nome").value = "Serra Alta";
    tela.pegar("eliminar-motivo").value = "x";
    const promessa = tela.disparar("forma-eliminar", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      erro: "codigo_invalido", mensagem: "Código incorreto ou já usado. Use um código novo, não o da entrada.",
    }, false));
    await promessa;
    expect(tela.pegar("dialogo-eliminar").hidden).toBe(false);
    expect(tela.pegar("recado-eliminar-texto").textContent).toContain("código novo");
    expect(tela.pegar("eliminar-agir").disabled).toBe(false);
    expect(tela.pegar("eliminar-codigo").value, "o codigo recusado ficou no campo").toBe("");
  });

  it("com o servidor fora do ar, o modal diz e devolve o botao", async () => {
    await abrirEliminar();
    tela.pegar("eliminar-senha").value = "a";
    tela.pegar("eliminar-codigo").value = "1";
    tela.pegar("eliminar-nome").value = "Serra Alta";
    tela.pegar("eliminar-motivo").value = "x";
    const promessa = tela.disparar("forma-eliminar", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;
    expect(tela.pegar("recado-eliminar").hidden).toBe(false);
    expect(tela.pegar("eliminar-agir").disabled).toBe(false);
  });

  it("cancelar a eliminacao pede confirmacao e manda o pedido certo", async () => {
    const daqui7 = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    await entrar(tela, "dona@fornecedor.com.br", "dono", [{
      ...SERRA_ALTA, acesso_suspenso_em: new Date().toISOString(), suspensao_motivo: "x",
      eliminacao_agendada_para: daqui7,
    }]);
    await linhaDe(tela, "Serra Alta").achar("button", "Cancelar eliminação")!.disparar("click");
    expect(tela.pegar("dialogo").hidden).toBe(false);
    expect(tela.pegar("dialogo-agir-texto").textContent).toContain("Cancelar a eliminação de Serra Alta");
    const promessa = tela.disparar("forma-dialogo", "submit");
    await tela.passo();
    expect(tela.ultima().caminho).toBe(`/municipios/${SERRA_ALTA.organizacao_id}/eliminacao/cancelar`);
    tela.ultima().resolver(resposta({ municipio: {} }));
    await tela.passo();
    tela.ultima().resolver(resposta({ municipios: [SERRA_ALTA] }));
    await promessa;
  });
});

/* ==========================================================================
   A área de usuários
   ========================================================================== */

describe("A area de usuarios, so do dono", () => {
  async function abrirUsuarios(operadores: unknown[]) {
    await entrar(tela, "dona@fornecedor.com.br", "dono");
    const promessa = tela.disparar("ir-usuarios", "click");
    await tela.passo();
    expect(tela.ultima().caminho).toBe("/operadores");
    tela.ultima().resolver(resposta({ operadores }));
    await promessa;
    await tela.passo();
  }

  const DONA = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "dona@fornecedor.com.br",
    papel: "dono", ativo: true, criado_em: "2026-09-01T10:00:00Z",
  };
  const PLANTAO = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "plantao@fornecedor.com.br",
    papel: "operador", ativo: true, criado_em: "2026-09-10T10:00:00Z",
  };

  it("lista os operadores, e o dono nao tem botao de desativar", async () => {
    await abrirUsuarios([DONA, PLANTAO]);
    expect(tela.pegar("usuarios").hidden).toBe(false);
    expect(tela.pegar("painel").hidden).toBe(true);
    const linhas = tela.pegar("linhas-operadores").filhos;
    expect(linhas.length).toBe(2);
    const daDona = linhas.find((l) => l.textContent.includes("dona@"))!;
    const doPlantao = linhas.find((l) => l.textContent.includes("plantao@"))!;
    expect(daDona.textContent).toContain("dono");
    expect(daDona.achar("button", "Desativar"), "o dono ganhou botao de desativar").toBeNull();
    expect(doPlantao.achar("button", "Desativar")).not.toBeNull();
    expect(doPlantao.textContent).toContain("ativo");
  });

  it("criar operador mostra senha, segredo, endereco e o QR desenhado em SVG, uma vez", async () => {
    await abrirUsuarios([DONA]);
    tela.pegar("email-operador").value = "Novo@Fornecedor.com.br";
    const promessa = tela.disparar("forma-operador", "submit");
    await tela.passo();
    expect(tela.ultima().caminho).toBe("/operadores");
    expect(corpoDaUltima(tela)["email"]).toBe("Novo@Fornecedor.com.br");
    expect(tela.pegar("criar-operador").disabled).toBe(true);

    tela.ultima().resolver(resposta({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "novo@fornecedor.com.br",
      senhaInicial: "abcd-efgh-ijkm", segredo: "JBSWY3DPEHPK3PXP",
      endereco: "otpauth://totp/DC360%20Console:novo%40fornecedor.com.br?secret=JBSWY3DPEHPK3PXP",
      qr: { tamanho: 3, linhas: ["101", "010", "111"] },
    }));
    await tela.passo();
    /* Depois de criar, a lista e recarregada. */
    tela.ultima().resolver(resposta({ operadores: [DONA] }));
    await promessa;
    await tela.passo();

    expect(tela.pegar("operador-entregue").hidden).toBe(false);
    expect(tela.pegar("operador-senha").textContent).toBe("abcd-efgh-ijkm");
    expect(tela.pegar("operador-segredo").textContent).toContain("JBSW");
    expect(tela.pegar("operador-endereco").textContent).toContain("otpauth://");

    const svg = tela.pegar("operador-qr").filhos[0]!;
    expect(svg.tag).toBe("svg");
    const escuros = svg.todos("rect").filter((r) => r.getAttribute("class") === "qr__modulo");
    expect(escuros.length, "o QR nao desenhou os modulos escuros").toBe(6);

    const escritos = tela.guardados.map((g) => `${g.chave}=${g.valor}`).join(" | ");
    expect(escritos).not.toContain("abcd-efgh-ijkm");
    expect(escritos).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("concluir apaga senha, segredo e QR da tela", async () => {
    await abrirUsuarios([DONA]);
    const promessa = tela.disparar("forma-operador", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      id: "c", email: "novo@fornecedor.com.br", senhaInicial: "s", segredo: "JBSW",
      endereco: "otpauth://x", qr: null,
    }));
    await tela.passo();
    tela.ultima().resolver(resposta({ operadores: [DONA] }));
    await promessa;
    await tela.passo();
    /* Sem QR (endereco longo demais), a tela continua mostrando o segredo. */
    expect(tela.pegar("operador-qr").hidden).toBe(true);
    expect(tela.pegar("operador-segredo").textContent).toContain("JBSW");

    await tela.disparar("operador-concluir", "click");
    expect(tela.pegar("operador-senha").textContent).toBe("");
    expect(tela.pegar("operador-segredo").textContent).toBe("");
    expect(tela.pegar("operador-endereco").textContent).toBe("");
    expect(tela.pegar("operador-qr").filhos.length).toBe(0);
    expect(tela.pegar("operador-entregue").hidden).toBe(true);
  });

  it("desativar operador passa pelo dialogo e manda o pedido certo", async () => {
    await abrirUsuarios([DONA, PLANTAO]);
    const linha = tela.pegar("linhas-operadores").filhos.find((l) => l.textContent.includes("plantao@"))!;
    await linha.achar("button", "Desativar")!.disparar("click");
    expect(tela.pegar("dialogo").hidden).toBe(false);
    expect(tela.pegar("dialogo-agir-texto").textContent).toContain("Desativar plantao@fornecedor.com.br");
    const promessa = tela.disparar("forma-dialogo", "submit");
    await tela.passo();
    expect(tela.ultima().caminho).toBe(`/operadores/${PLANTAO.id}/desativar`);
    tela.ultima().resolver(resposta({ id: PLANTAO.id, ativo: false }));
    await tela.passo();
    tela.ultima().resolver(resposta({ operadores: [DONA, { ...PLANTAO, ativo: false }] }));
    await promessa;
    await tela.passo();
    const depois = tela.pegar("linhas-operadores").filhos.find((l) => l.textContent.includes("plantao@"))!;
    expect(depois.textContent).toContain("desativado");
    expect(depois.achar("button", "Desativar")).toBeNull();
  });

  it("sair apaga a credencial do operador criado e a lista", async () => {
    await abrirUsuarios([DONA]);
    const promessa = tela.disparar("forma-operador", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      id: "c", email: "n@f.br", senhaInicial: "segredo-da-senha", segredo: "SEGREDO",
      endereco: "otpauth://x", qr: null,
    }));
    await tela.passo();
    tela.ultima().resolver(resposta({ operadores: [DONA] }));
    await promessa;
    await tela.disparar("sair", "click");
    expect(tela.pegar("operador-senha").textContent).toBe("");
    expect(tela.pegar("operador-segredo").textContent).toBe("");
    expect(tela.pegar("linhas-operadores").filhos.length).toBe(0);
    expect(tela.pegar("usuarios").hidden).toBe(true);
  });
});

/* ==========================================================================
   A minha senha
   ========================================================================== */

describe("Trocar a minha senha", () => {
  async function abrirSenha() {
    await entrar(tela, "plantao@fornecedor.com.br", "operador");
    await tela.disparar("ir-senha", "click");
    expect(tela.pegar("minha-senha").hidden).toBe(false);
  }

  it("senhas novas diferentes entre si nao mandam nada, e dizem", async () => {
    await abrirSenha();
    const antes = tela.chamadas.length;
    tela.pegar("senha-atual").value = "atual";
    tela.pegar("codigo-troca").value = "123456";
    tela.pegar("senha-nova").value = "uma-senha-nova-comprida";
    tela.pegar("senha-nova-2").value = "outra-senha-nova-comprida";
    await tela.disparar("forma-senha-nova", "submit");
    expect(tela.chamadas.length).toBe(antes);
    expect(tela.pegar("recado-senha").hidden).toBe(false);
  });

  it("manda senha atual, codigo e senha nova, e troca o token da sessao pelo devolvido", async () => {
    await abrirSenha();
    tela.pegar("senha-atual").value = "atual";
    tela.pegar("codigo-troca").value = "123456";
    tela.pegar("senha-nova").value = "uma-senha-nova-comprida";
    tela.pegar("senha-nova-2").value = "uma-senha-nova-comprida";
    const promessa = tela.disparar("forma-senha-nova", "submit");
    await tela.passo();
    expect(tela.ultima().caminho).toBe("/senha");
    expect(corpoDaUltima(tela)).toEqual({
      senhaAtual: "atual", codigo: "123456", novaSenha: "uma-senha-nova-comprida",
    });
    expect(tela.pegar("trocar").disabled).toBe(true);
    tela.ultima().resolver(resposta({ token: "token-novo" }));
    await promessa;
    await tela.passo();

    expect(tela.pegar("senha-trocada").hidden, "a tela nao disse que trocou").toBe(false);
    expect(tela.pegar("senha-atual").value, "a senha atual ficou no campo").toBe("");
    expect(tela.pegar("senha-nova").value).toBe("");

    /* A proxima chamada ao servidor vai com o token NOVO: o antigo ja nao vale. */
    const volta = tela.disparar("voltar-da-senha", "click");
    await tela.passo();
    const cabecalhos = tela.ultima().opcoes?.["headers"] as Record<string, string>;
    expect(cabecalhos["authorization"]).toBe("Bearer token-novo");
    tela.ultima().resolver(resposta({ municipios: [] }));
    await volta;
  });

  it("senha atual errada mostra a mensagem do servidor e limpa o codigo", async () => {
    await abrirSenha();
    tela.pegar("senha-atual").value = "errada";
    tela.pegar("codigo-troca").value = "123456";
    tela.pegar("senha-nova").value = "uma-senha-nova-comprida";
    tela.pegar("senha-nova-2").value = "uma-senha-nova-comprida";
    const promessa = tela.disparar("forma-senha-nova", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ erro: "senha_incorreta", mensagem: "A senha atual não confere." }, false));
    await promessa;
    expect(tela.pegar("recado-senha-texto").textContent).toContain("não confere");
    expect(tela.pegar("codigo-troca").value).toBe("");
    expect(tela.pegar("trocar").disabled).toBe(false);
  });

  it("com o servidor fora do ar, a tela diz e devolve o botao", async () => {
    await abrirSenha();
    tela.pegar("senha-atual").value = "a";
    tela.pegar("codigo-troca").value = "1";
    tela.pegar("senha-nova").value = "uma-senha-nova-comprida";
    tela.pegar("senha-nova-2").value = "uma-senha-nova-comprida";
    const promessa = tela.disparar("forma-senha-nova", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;
    expect(tela.pegar("recado-senha").hidden).toBe(false);
    expect(tela.pegar("trocar").disabled).toBe(false);
  });
});

/* ==========================================================================
   A recuperação de senha: os códigos em "Minha senha", e "Esqueci a senha"
   ========================================================================== */

describe("Codigos de recuperacao, em Minha senha", () => {
  const OITO = [
    "abcde-fghjk", "mnpqr-stuvw", "xyz23-45678", "9abcd-efghj",
    "kmnpq-rstuv", "wxyz2-34567", "89abc-defgh", "jkmnp-qrstu",
  ];

  /** Abre a tela e responde a pergunta "quantos restam" com o numero dado. */
  async function abrirComContagem(restantes: number) {
    await entrar(tela, "plantao@fornecedor.com.br", "operador");
    const abrir = tela.disparar("ir-senha", "click");
    await tela.passo();
    expect(tela.ultima().caminho, "abrir Minha senha nao perguntou quantos codigos restam")
      .toBe("/codigos-de-recuperacao");
    expect(tela.ultima().opcoes?.["method"]).toBe("GET");
    tela.ultima().resolver(resposta({ restantes }));
    await abrir;
    await tela.passo();
  }

  /* Devolve a promessa EMBRULHADA: uma funcao async que devolvesse a promessa
     crua a achataria, e o `await` esperaria o fetch que o caso ainda vai
     resolver a mao. */
  async function gerar(): Promise<{ promessa: Promise<unknown> }> {
    tela.pegar("codigos-senha").value = "a-senha-atual";
    tela.pegar("codigos-codigo").value = "123456";
    const promessa = tela.disparar("forma-codigos", "submit");
    await tela.passo();
    return { promessa };
  }

  it("ao abrir, diz quantos codigos restam, sem mostrar nenhum", async () => {
    await abrirComContagem(0);
    expect(tela.pegar("codigos-restantes").textContent).toContain("Nenhum");

    await tela.disparar("sair", "click");
    await abrirComContagem(3);
    expect(tela.pegar("codigos-restantes").textContent).toContain("3");
    expect(tela.pegar("lista-de-codigos").filhos.length, "a contagem mostrou codigo").toBe(0);
  });

  it("gerar exige senha e codigo antes de mandar qualquer coisa", async () => {
    await abrirComContagem(0);
    const antes = tela.chamadas.length;
    await tela.disparar("forma-codigos", "submit");
    expect(tela.chamadas.length, "mandou gerar sem senha nem codigo").toBe(antes);
    expect(tela.pegar("recado-codigos").hidden).toBe(false);
  });

  it("gerar manda senha e codigo, trava o botao, mostra os oito UMA vez com o aviso, e atualiza a contagem", async () => {
    await abrirComContagem(0);
    const botao = tela.pegar("gerar-codigos");
    const rotulo = tela.pegar("gerar-codigos-texto");
    const antes = rotulo.textContent;
    const { promessa } = await gerar();

    expect(tela.ultima().caminho).toBe("/codigos-de-recuperacao");
    expect(tela.ultima().opcoes?.["method"]).toBe("POST");
    expect(corpoDaUltima(tela)).toEqual({ senha: "a-senha-atual", codigo: "123456" });
    expect(botao.disabled, "o botao aceita um segundo clique").toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(rotulo.textContent).not.toBe(antes);

    tela.ultima().resolver(resposta({ codigos: OITO, restantes: 8 }));
    await promessa;
    await tela.passo();

    expect(botao.disabled).toBe(false);
    expect(rotulo.textContent).toBe(antes);
    expect(tela.pegar("codigos-entregues").hidden, "os codigos nao apareceram").toBe(false);
    expect(tela.pegar("forma-codigos").hidden, "o formulario ficou junto dos codigos").toBe(true);
    const itens = tela.pegar("lista-de-codigos").filhos;
    expect(itens.length).toBe(8);
    expect(itens.map((i) => i.textContent)).toEqual(OITO);
    expect(tela.pegar("codigos-restantes").textContent).toContain("8");
    /* A senha e o codigo digitados saem dos campos assim que o pedido volta. */
    expect(tela.pegar("codigos-senha").value).toBe("");
    expect(tela.pegar("codigos-codigo").value).toBe("");

    /* O aviso nunca e so cor: tem a palavra, e diz que gerar de novo invalida estes. */
    const aviso = [...PAGINA_DO_CONSOLE.matchAll(/<div id="codigos-entregues"[\s\S]*?<\/div>\s*<\/div>/g)]
      .map((m) => m[0]!)[0] ?? "";
    expect(aviso).toContain("<strong>Atenção:</strong>");
    expect(aviso.toLowerCase()).toContain("gerar de novo invalida estes");

    const escritos = tela.guardados.map((g) => `${g.chave}=${g.valor}`).join(" | ");
    for (const codigo of OITO) expect(escritos).not.toContain(codigo);
  });

  it("codigo recusado mostra a mensagem do servidor, limpa o codigo e mantem o formulario", async () => {
    await abrirComContagem(2);
    const { promessa } = await gerar();
    tela.ultima().resolver(resposta({
      erro: "codigo_invalido", mensagem: "Código incorreto ou já usado. Use um código novo, não o da entrada.",
    }, false));
    await promessa;
    expect(tela.pegar("recado-codigos-texto").textContent).toContain("código novo");
    expect(tela.pegar("codigos-codigo").value).toBe("");
    expect(tela.pegar("forma-codigos").hidden).toBe(false);
    expect(tela.pegar("codigos-entregues").hidden).toBe(true);
    expect(tela.pegar("gerar-codigos").disabled).toBe(false);
    expect(tela.pegar("codigos-restantes").textContent, "a recusa mexeu na contagem").toContain("2");
  });

  it("com o servidor fora do ar, a tela diz e devolve o botao", async () => {
    await abrirComContagem(0);
    const { promessa } = await gerar();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;
    expect(tela.pegar("recado-codigos").hidden).toBe(false);
    expect(tela.pegar("gerar-codigos").disabled).toBe(false);
  });

  it("concluir apaga os codigos da tela e devolve o formulario; sair tambem apaga", async () => {
    await abrirComContagem(0);
    const { promessa } = await gerar();
    tela.ultima().resolver(resposta({ codigos: OITO, restantes: 8 }));
    await promessa;
    await tela.passo();
    await tela.disparar("codigos-concluir", "click");
    expect(tela.pegar("lista-de-codigos").filhos.length, "os codigos ficaram no documento").toBe(0);
    expect(tela.pegar("codigos-entregues").hidden).toBe(true);
    expect(tela.pegar("forma-codigos").hidden).toBe(false);

    const segunda = await gerar();
    tela.ultima().resolver(resposta({ codigos: OITO, restantes: 8 }));
    await segunda.promessa;
    await tela.passo();
    expect(tela.pegar("lista-de-codigos").filhos.length).toBe(8);
    await tela.disparar("sair", "click");
    expect(tela.pegar("lista-de-codigos").filhos.length, "sair deixou os codigos no documento").toBe(0);
    expect(tela.pegar("codigos-restantes").textContent).toBe("");
  });

  it("criar operador mostra os oito codigos dele junto da senha, do segredo e do QR, e concluir apaga", async () => {
    await entrar(tela, "dona@fornecedor.com.br", "dono");
    const abrir = tela.disparar("ir-usuarios", "click");
    await tela.passo();
    tela.ultima().resolver(resposta({ operadores: [] }));
    await abrir;
    await tela.passo();

    const promessa = tela.disparar("forma-operador", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      id: "c", email: "novo@fornecedor.com.br", senhaInicial: "s", segredo: "JBSW",
      endereco: "otpauth://x", qr: null, codigos: OITO,
    }));
    await tela.passo();
    tela.ultima().resolver(resposta({ operadores: [] }));
    await promessa;
    await tela.passo();

    const itens = tela.pegar("operador-codigos").filhos;
    expect(itens.length, "os codigos do operador criado nao apareceram").toBe(8);
    expect(itens.map((i) => i.textContent)).toEqual(OITO);

    await tela.disparar("operador-concluir", "click");
    expect(tela.pegar("operador-codigos").filhos.length).toBe(0);
  });
});

describe("Esqueci a senha, na porta, sem sessao", () => {
  async function abrirRecuperacao(email = "dona@fornecedor.com.br") {
    tela.pegar("email").value = email;
    await tela.disparar("esqueci-senha", "click");
  }

  function preencher(codigo = "abcde-fghjk", senha = "uma-senha-nova-comprida", senha2 = senha) {
    tela.pegar("recuperar-codigo").value = codigo;
    tela.pegar("recuperar-senha").value = senha;
    tela.pegar("recuperar-senha-2").value = senha2;
  }

  it("o link abre o formulario de recuperacao no lugar do de senha, levando o email junto", async () => {
    await abrirRecuperacao();
    expect(tela.pegar("forma-recuperar").hidden, "o formulario de recuperar nao abriu").toBe(false);
    expect(tela.pegar("forma-senha").hidden, "os dois formularios ficaram na tela").toBe(true);
    expect(tela.pegar("forma-codigo").hidden).toBe(true);
    expect(tela.pegar("recuperar-email").value).toBe("dona@fornecedor.com.br");
    expect(tela.pegar("porta-titulo").textContent).not.toBe("Entrar no console");
    /* A tela diz o que vai acontecer: senha E segundo fator. */
    expect(tela.pegar("porta-apoio").textContent.toLowerCase()).toContain("segundo fator");
    expect(tela.pegar("recuperar-texto").textContent).toBe("Redefinir a senha e o segundo fator");
  });

  it("senha curta, senhas diferentes ou codigo em branco nao mandam nada, e dizem", async () => {
    await abrirRecuperacao();
    const antes = tela.chamadas.length;

    preencher("", "uma-senha-nova-comprida");
    await tela.disparar("forma-recuperar", "submit");
    expect(tela.chamadas.length).toBe(antes);
    expect(tela.pegar("recado").hidden).toBe(false);

    preencher("abcde-fghjk", "curta");
    await tela.disparar("forma-recuperar", "submit");
    expect(tela.chamadas.length).toBe(antes);
    expect(tela.pegar("recado-texto").textContent).toContain("12");

    preencher("abcde-fghjk", "uma-senha-nova-comprida", "outra-senha-nova-comprida");
    await tela.disparar("forma-recuperar", "submit");
    expect(tela.chamadas.length, "mandou recuperar com as senhas diferentes").toBe(antes);
    expect(tela.pegar("recuperar-senha-2").focos).toBeGreaterThan(0);
  });

  it("com tudo certo manda email, codigo e senha nova, trava o botao, e mostra o segredo e o QR novos uma vez", async () => {
    await abrirRecuperacao(" Dona@Fornecedor.com.br ");
    preencher();
    const botao = tela.pegar("recuperar");
    const rotulo = tela.pegar("recuperar-texto");
    const antes = rotulo.textContent;
    const promessa = tela.disparar("forma-recuperar", "submit");
    await tela.passo();

    expect(tela.ultima().caminho).toBe("/recuperar");
    expect(corpoDaUltima(tela)).toEqual({
      email: " Dona@Fornecedor.com.br ", codigo: "abcde-fghjk", novaSenha: "uma-senha-nova-comprida",
    });
    const cabecalhos = tela.ultima().opcoes?.["headers"] as Record<string, string>;
    expect(cabecalhos["authorization"], "a recuperacao mandou um token que nao existe").toBeUndefined();
    expect(botao.disabled).toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(rotulo.textContent).not.toBe(antes);

    tela.ultima().resolver(resposta({
      segredo: "JBSWY3DPEHPK3PXP",
      endereco: "otpauth://totp/DC360%20Console:dona%40fornecedor.com.br?secret=JBSWY3DPEHPK3PXP",
      qr: { tamanho: 3, linhas: ["101", "010", "111"] },
      restantes: 7,
    }));
    await promessa;
    await tela.passo();

    expect(botao.disabled).toBe(false);
    expect(rotulo.textContent).toBe(antes);
    expect(tela.pegar("recuperado").hidden, "a tela do segredo novo nao apareceu").toBe(false);
    expect(tela.pegar("forma-recuperar").hidden).toBe(true);
    expect(tela.pegar("recuperado-segredo").textContent).toContain("JBSW");
    expect(tela.pegar("recuperado-endereco").textContent).toContain("otpauth://");
    const svg = tela.pegar("recuperado-qr").filhos[0]!;
    expect(svg.tag).toBe("svg");
    expect(svg.todos("rect").filter((r) => r.getAttribute("class") === "qr__modulo").length).toBe(6);
    /* Os codigos que sobraram continuam valendo, e a tela diz quantos. */
    expect(tela.pegar("recuperado-restantes").textContent).toContain("7");
    expect(tela.pegar("recuperado-titulo").focos).toBeGreaterThan(0);

    /* Nada da recuperacao fica em campo nem em armazenamento. */
    expect(tela.pegar("recuperar-codigo").value).toBe("");
    expect(tela.pegar("recuperar-senha").value).toBe("");
    expect(tela.pegar("recuperar-senha-2").value).toBe("");
    const escritos = tela.guardados.map((g) => `${g.chave}=${g.valor}`).join(" | ");
    expect(escritos).not.toContain("JBSWY3DPEHPK3PXP");
    expect(escritos).not.toContain("uma-senha-nova-comprida");
  });

  it("a recusa generica mostra a mensagem do servidor e mantem o formulario", async () => {
    await abrirRecuperacao();
    preencher();
    const promessa = tela.disparar("forma-recuperar", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({
      erro: "recuperacao_invalida", mensagem: "Email ou código incorretos.",
    }, false));
    await promessa;
    expect(tela.pegar("recado-texto").textContent).toBe("Email ou código incorretos.");
    expect(tela.pegar("forma-recuperar").hidden).toBe(false);
    expect(tela.pegar("recuperado").hidden).toBe(true);
    expect(tela.pegar("recuperar").disabled).toBe(false);
  });

  it("com o servidor fora do ar, a tela diz e devolve o botao", async () => {
    await abrirRecuperacao();
    preencher();
    const promessa = tela.disparar("forma-recuperar", "submit");
    await tela.passo();
    tela.ultima().recusar(new TypeError("Failed to fetch"));
    await promessa;
    expect(tela.pegar("recado").hidden).toBe(false);
    expect(tela.pegar("recado-texto").textContent.length).toBeGreaterThan(0);
    expect(tela.pegar("recuperar").disabled).toBe(false);
  });

  it("Ir para a entrada apaga o segredo da tela e volta para a senha com o email preenchido", async () => {
    await abrirRecuperacao("dona@fornecedor.com.br");
    preencher();
    const promessa = tela.disparar("forma-recuperar", "submit");
    await tela.passo();
    tela.ultima().resolver(resposta({ segredo: "JBSW", endereco: "otpauth://x", qr: null, restantes: 7 }));
    await promessa;
    await tela.passo();
    expect(tela.pegar("recuperado-qr").hidden, "sem QR, a moldura vazia ficou na tela").toBe(true);

    await tela.disparar("recuperado-entrar", "click");
    expect(tela.pegar("recuperado").hidden).toBe(true);
    expect(tela.pegar("recuperado-segredo").textContent, "o segredo ficou no documento").toBe("");
    expect(tela.pegar("recuperado-endereco").textContent).toBe("");
    expect(tela.pegar("forma-senha").hidden).toBe(false);
    expect(tela.pegar("forma-recuperar").hidden).toBe(true);
    expect(tela.pegar("email").value).toBe("dona@fornecedor.com.br");
    expect(tela.pegar("senha").focos).toBeGreaterThan(0);
    expect(tela.pegar("porta-titulo").textContent).toBe("Entrar no console");
  });

  it("voltar sem recuperar devolve o formulario da senha, e a porta volta ao normal", async () => {
    await abrirRecuperacao();
    preencher();
    const antes = tela.chamadas.length;
    await tela.disparar("voltar-de-recuperar", "click");
    expect(tela.chamadas.length).toBe(antes);
    expect(tela.pegar("forma-senha").hidden).toBe(false);
    expect(tela.pegar("forma-recuperar").hidden).toBe(true);
    expect(tela.pegar("porta-titulo").textContent).toBe("Entrar no console");
    expect(tela.pegar("recuperar-senha").value, "a senha nova digitada ficou no campo").toBe("");
  });
});
