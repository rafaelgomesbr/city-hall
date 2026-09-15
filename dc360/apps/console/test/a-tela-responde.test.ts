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
  "input", "br", "meta", "link", "img", "use", "path", "circle", "rect", "hr",
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

type Molde = { id: string; tag: string; oculto: boolean; texto: string };

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
async function entrar(tela: Tela, email = "coordenacao@fornecedor.com.br") {
  tela.pegar("email").value = email;
  tela.pegar("senha").value = "uma senha qualquer";
  const primeira = tela.disparar("forma-senha", "submit");
  await tela.passo();
  tela.ultima().resolver(resposta({ desafio: "desafio-de-teste", falta: "codigo" }));
  await primeira;

  tela.pegar("codigo").value = "123456";
  const segunda = tela.disparar("forma-codigo", "submit");
  await tela.passo();
  tela.ultima().resolver(resposta({ token: "token-de-teste", operador: email }));
  await tela.passo();
  /* A entrada bem-sucedida já pede os números, e esta é a chamada de /municipios. */
  tela.ultima().resolver(resposta({ municipios: [] }));
  await segunda;
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
