import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CorpoDaBusca, type PropsCorpoDaBusca } from "../src/componentes/BuscaGlobal";
import {
  ATRASO_DA_BUSCA_MS, decidirTeclaDaBusca, ehAtalhoDeFoco, fraseDeEstado, idDaOpcao,
  rotuloDoAtalho,
} from "../src/busca/combobox";
import { achatar, type OpcaoDaLista } from "../src/busca/registros";
import type { ItemDoIndice } from "../src/busca/indice";
import type { GrupoDeBusca } from "../src/dados/tipos";

/**
 * A CAIXA DE COMANDO DO TOPO, PROVADA SEM NAVEGADOR.
 *
 * O painel não tem DOM na suíte rápida (ver `test/modal.test.ts`), então o
 * que se prova aqui é o que está escrito como decisão e como marcação:
 *
 * - a máquina de estados do teclado é a função que diz o que cada tecla faz
 *   com a lista aberta ou fechada, com item ativo ou sem. É ela que garante o
 *   contrato do pedido: seta move, Enter abre o selecionado, Enter SEM
 *   selecionado mantém o caminho antigo (a lista com `?busca=`), Esc fecha,
 *   Tab sai;
 * - a amarração ARIA de combobox (`role`, `aria-expanded`, `aria-controls`,
 *   `aria-activedescendant`, `listbox` com `option`) é marcação, e marcação
 *   se lê no HTML renderizado no servidor;
 * - os três estados desenhados (buscando, nada encontrado, sem sinal) e a
 *   frase do `aria-live` são texto, e texto se lê.
 *
 * O que NÃO é provado aqui, dito em voz alta: que o navegador de fato leve o
 * foco no Ctrl+K, que o clique fora feche, que o leitor de tela anuncie o item
 * ativo. Isso é o roteiro de navegador (`test/fluxo.e2e.mjs`) e teste com
 * pessoa. Os testes de "a caixa usa o próprio núcleo" existem pelo buraco
 * conhecido: função pura certa que ninguém chama passa em tudo e não faz nada.
 */

const COMPONENTES = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "componentes");
const FONTE = readFileSync(join(COMPONENTES, "BuscaGlobal.tsx"), "utf8");
const FONTE_ESTRUTURA = readFileSync(join(COMPONENTES, "Estrutura.tsx"), "utf8");

describe("Teclado da caixa de comando", () => {
  const fechada = { aberta: false, ativo: null, total: 0, temTexto: true };
  const aberta = { aberta: true, ativo: null, total: 3, temTexto: true };

  it("seta para baixo abre a lista fechada, e depois anda por ela", () => {
    expect(decidirTeclaDaBusca({ ...fechada, tecla: "ArrowDown" })).toEqual({ acao: "abrir" });
    expect(decidirTeclaDaBusca({ ...aberta, tecla: "ArrowDown" })).toEqual({ acao: "mover", ativo: 0 });
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 0, tecla: "ArrowDown" })).toEqual({ acao: "mover", ativo: 1 });
  });

  it("nas pontas, as setas dão a volta em vez de travar", () => {
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 2, tecla: "ArrowDown" })).toEqual({ acao: "mover", ativo: 0 });
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 0, tecla: "ArrowUp" })).toEqual({ acao: "mover", ativo: 2 });
    // Sem ativo, seta para cima começa pelo fim.
    expect(decidirTeclaDaBusca({ ...aberta, tecla: "ArrowUp" })).toEqual({ acao: "mover", ativo: 2 });
  });

  it("Home e End vão direto às pontas", () => {
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 1, tecla: "Home" })).toEqual({ acao: "mover", ativo: 0 });
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 1, tecla: "End" })).toEqual({ acao: "mover", ativo: 2 });
  });

  it("Enter com item ativo escolhe o item", () => {
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 1, tecla: "Enter" })).toEqual({ acao: "escolher", indice: 1 });
  });

  it("Enter SEM item ativo mantém o caminho de sempre: a lista com ?busca=", () => {
    /*
      Este é o contrato com quem já usa a caixa como era: digita o protocolo,
      dá Enter, cai na lista filtrada. Selecionar o primeiro item sozinho
      quebraria isso, e por isso a lista nasce sem item ativo.
    */
    expect(decidirTeclaDaBusca({ ...aberta, tecla: "Enter" })).toEqual({ acao: "enviar" });
    expect(decidirTeclaDaBusca({ ...fechada, tecla: "Enter" })).toEqual({ acao: "enviar" });
  });

  it("Escape fecha a lista aberta, e limpa a caixa quando já está fechada", () => {
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 1, tecla: "Escape" })).toEqual({ acao: "fechar" });
    expect(decidirTeclaDaBusca({ ...fechada, tecla: "Escape" })).toEqual({ acao: "limpar" });
    expect(decidirTeclaDaBusca({ ...fechada, temTexto: false, tecla: "Escape" })).toEqual({ acao: "seguir" });
  });

  it("Tab sai da caixa fechando a lista, sem prender o foco", () => {
    // Isto é um menu suspenso, não uma janela: o Tab segue para o sino.
    expect(decidirTeclaDaBusca({ ...aberta, ativo: 1, tecla: "Tab" })).toEqual({ acao: "fechar" });
    expect(decidirTeclaDaBusca({ ...fechada, tecla: "Tab" })).toEqual({ acao: "seguir" });
  });

  it("as outras teclas seguem, senão não dá para digitar", () => {
    expect(decidirTeclaDaBusca({ ...aberta, tecla: "a" })).toEqual({ acao: "seguir" });
    expect(decidirTeclaDaBusca({ ...aberta, tecla: "Backspace" })).toEqual({ acao: "seguir" });
  });

  it("lista aberta e vazia não tem para onde mover", () => {
    expect(decidirTeclaDaBusca({ ...aberta, total: 0, tecla: "ArrowDown" })).toEqual({ acao: "seguir" });
  });
});

describe("O atalho de teclado", () => {
  it("Ctrl+K e Cmd+K focam a caixa, e mais nada foca", () => {
    expect(ehAtalhoDeFoco({ tecla: "k", ctrl: true, meta: false, alt: false })).toBe(true);
    expect(ehAtalhoDeFoco({ tecla: "K", ctrl: false, meta: true, alt: false })).toBe(true);
    expect(ehAtalhoDeFoco({ tecla: "k", ctrl: false, meta: false, alt: false })).toBe(false);
    expect(ehAtalhoDeFoco({ tecla: "k", ctrl: true, meta: false, alt: true })).toBe(false);
    expect(ehAtalhoDeFoco({ tecla: "j", ctrl: true, meta: false, alt: false })).toBe(false);
  });

  it("a dica escrita na caixa fala a língua do teclado da máquina", () => {
    expect(rotuloDoAtalho("MacIntel")).toBe("⌘ K");
    expect(rotuloDoAtalho("Win32")).toBe("Ctrl K");
    expect(rotuloDoAtalho("Linux x86_64")).toBe("Ctrl K");
    // Sem navegador (renderização no servidor) a dica é a mais comum.
    expect(rotuloDoAtalho("")).toBe("Ctrl K");
  });
});

describe("A frase do aria-live", () => {
  it("conta os resultados, e diz quando ainda está buscando ou quando não achou", () => {
    expect(fraseDeEstado({ consulta: "ocorr", total: 3, situacao: "ok" })).toBe("3 resultados");
    expect(fraseDeEstado({ consulta: "ocorr", total: 1, situacao: "ok" })).toBe("1 resultado");
    expect(fraseDeEstado({ consulta: "ocorr", total: 2, situacao: "buscando" }))
      .toBe("2 resultados, buscando no servidor");
    expect(fraseDeEstado({ consulta: "xyz", total: 0, situacao: "ok" })).toBe("Nada encontrado para xyz");
    expect(fraseDeEstado({ consulta: "xyz", total: 0, situacao: "falhou" }))
      .toBe("Sem sinal com o servidor. Nada encontrado para xyz");
    expect(fraseDeEstado({ consulta: "x", total: 0, situacao: "ocioso" })).toBe("");
  });

  it("o atraso depois da última tecla é o do pedido", () => {
    expect(ATRASO_DA_BUSCA_MS).toBe(200);
  });
});

/* ------------------------------------------------------------------------ */

const PAGINA_OCORRENCIAS: ItemDoIndice = {
  id: "pagina:/ocorrencias", rotulo: "Ocorrências", detalhe: "Página",
  sinonimos: ["chamado"], destino: { tipo: "rota", para: "/ocorrencias" },
};
const ACAO_SAIR: ItemDoIndice = {
  id: "acao:sair", rotulo: "Sair", detalhe: "Encerrar a sessão",
  sinonimos: ["sair da conta"], destino: { tipo: "acao", acao: "sair" }, icone: "sair",
};

const GRUPOS: GrupoDeBusca[] = [
  {
    tipo: "ocorrencia",
    itens: [{
      id: "oc-1", protocolo: "000123/2026", titulo: "Servidão Boa Esperança, 148",
      detalhe: "Deslizamento, em campo", severidade: "alta", status: "em_campo", pontuacao: 0.83,
    }],
  },
  {
    tipo: "usuario",
    itens: [{ id: "us-1", titulo: "Joana da Silva Prado", detalhe: "Agente de campo, matrícula 0001", pontuacao: 0.9 }],
  },
];

function opcoes(): OpcaoDaLista[] {
  return achatar(
    [{ item: PAGINA_OCORRENCIAS, pontuacao: 0.9 }, { item: ACAO_SAIR, pontuacao: 0.5 }],
    GRUPOS,
  );
}

function renderizar(parcial: Partial<PropsCorpoDaBusca> = {}): string {
  const props: PropsCorpoDaBusca = {
    consulta: "ocorr",
    aberta: true,
    ativo: null,
    opcoes: opcoes(),
    situacao: "ok",
    atalho: "Ctrl K",
    iconeDe: () => h("svg", { "aria-hidden": true }),
    aoMudar: () => {},
    aoTeclar: () => {},
    aoEscolher: () => {},
    aoEnviar: () => {},
    aoFocar: () => {},
    ...parcial,
  };
  return renderToStaticMarkup(h(CorpoDaBusca, props));
}

describe("Achatar os grupos numa lista só", () => {
  it("os itens da interface vêm primeiro, sob 'Ir para', e cada registro sob o próprio grupo", () => {
    const lista = opcoes();
    expect(lista.map((o) => o.grupo)).toEqual(["Ir para", "Ir para", "Ocorrências", "Pessoas"]);
    expect(lista.map((o) => o.rotulo)).toEqual([
      "Ocorrências", "Sair", "Servidão Boa Esperança, 148", "Joana da Silva Prado",
    ]);
    // O id de cada opção é o que `aria-activedescendant` aponta.
    expect(lista.map((o) => o.id)).toEqual([0, 1, 2, 3].map(idDaOpcao));
  });
});

describe("Amarração ARIA da caixa de comando", () => {
  it("é um combobox que controla um listbox de options", () => {
    const html = renderizar({ ativo: 2 });
    expect(html).toMatch(/<input[^>]*role="combobox"/);
    expect(html).toMatch(/<input[^>]*aria-expanded="true"/);
    expect(html).toMatch(/<input[^>]*aria-controls="busca-global-lista"/);
    expect(html).toMatch(/<input[^>]*aria-autocomplete="list"/);
    expect(html).toMatch(/<input[^>]*aria-activedescendant="busca-global-opcao-2"/);
    expect(html).toMatch(/id="busca-global-lista"[^>]*role="listbox"|role="listbox"[^>]*id="busca-global-lista"/);
    expect([...html.matchAll(/role="option"/g)]).toHaveLength(4);
    // Só o ativo está selecionado, e o id dele existe de verdade.
    expect([...html.matchAll(/aria-selected="true"/g)]).toHaveLength(1);
    expect(html).toMatch(/id="busca-global-opcao-2"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="busca-global-opcao-2"/);
  });

  it("fechada, não aponta para uma lista que não existe", () => {
    const html = renderizar({ aberta: false });
    expect(html).toMatch(/<input[^>]*aria-expanded="false"/);
    expect(html).not.toContain("aria-controls=");
    expect(html).not.toContain("aria-activedescendant=");
    expect(html).not.toContain('role="listbox"');
  });

  it("sem item ativo, não aponta para um id que não existe", () => {
    expect(renderizar({ ativo: null })).not.toContain("aria-activedescendant=");
  });

  it("os grupos são nomeados, e o nome está escrito", () => {
    const html = renderizar();
    expect(html).toContain(">Ir para<");
    expect(html).toContain(">Ocorrências<");
    expect(html).toContain(">Pessoas<");
    expect([...html.matchAll(/role="group"/g)]).toHaveLength(3);
    expect(html).toMatch(/role="group"[^>]*aria-labelledby="busca-global-grupo-/);
  });

  it("o rótulo oculto é completo, o placeholder é curto, e a dica do atalho é texto", () => {
    const html = renderizar();
    expect(html).toMatch(/<label[^>]*class="oculto-visualmente"[^>]*for="busca-global"[^>]*>Buscar ocorrência, pessoa, equipe, órgão ou função do painel<\/label>/);
    expect(html).toMatch(/<input[^>]*id="busca-global"/);
    expect(html).toMatch(/<input[^>]*type="search"/);
    expect(html).toMatch(/<input[^>]*placeholder="Buscar registro ou função"/);
    expect(html).toMatch(/<kbd[^>]*>Ctrl K<\/kbd>/);
    // A dica é descrição do campo para o leitor de tela também.
    expect(html).toMatch(/<input[^>]*aria-describedby="busca-global-atalho"/);
    expect(html).toMatch(/<kbd[^>]*id="busca-global-atalho"/);
    // O navegador não pode sobrepor a própria lista de sugestões à nossa.
    // (O React 18 serializa `autoComplete` com a caixa original; HTML não
    // distingue caixa em nome de atributo.)
    expect(html).toMatch(/<input[^>]*autocomplete="off"/i);
  });
});

describe("O que cada resultado mostra", () => {
  it("o trecho casado vem marcado com <mark>", () => {
    const html = renderizar();
    expect(html).toMatch(/<mark[^>]*>Ocorr<\/mark>ências/);
  });

  it("a ocorrência traz o protocolo e o selo de severidade como está em comuns.tsx", () => {
    const html = renderizar();
    expect(html).toContain("000123/2026");
    expect(html).toMatch(/class="selo selo--alta"/);
    expect(html).toContain("Alta");
    expect(html).toContain("Deslizamento, em campo");
  });

  it("quem não é ocorrência não ganha selo", () => {
    const html = renderizar({ opcoes: achatar([], [GRUPOS[1]!]) });
    expect(html).not.toContain('class="selo');
    expect(html).toContain("Agente de campo, matrícula 0001");
  });

  it("todo resultado tem ícone do tipo", () => {
    const html = renderizar({ iconeDe: () => h("svg", { "data-icone": "sim" }) });
    expect([...html.matchAll(/data-icone="sim"/g)]).toHaveLength(4);
  });
});

describe("Os estados desenhados", () => {
  it("buscando", () => {
    const html = renderizar({ situacao: "buscando" });
    expect(html).toContain("Buscando");
  });

  it("nada encontrado, dizendo o quê", () => {
    const html = renderizar({ consulta: "xyz", opcoes: [], situacao: "ok" });
    expect(html).toContain("Nada encontrado para");
    expect(html).toContain("xyz");
  });

  it("sem sinal com o servidor, sem esconder o que a interface achou sozinha", () => {
    const html = renderizar({ situacao: "falhou" });
    expect(html).toContain("Sem sinal com o servidor");
    // Os itens locais continuam lá: a busca de função não depende de rede.
    expect(html).toContain(">Ir para<");
  });

  it("o aria-live conta os resultados em voz baixa", () => {
    const html = renderizar();
    expect(html).toMatch(/aria-live="polite"[^>]*>[^<]*4 resultados/);
  });
});

describe("A caixa usa o próprio núcleo", () => {
  it("as teclas passam por decidirTeclaDaBusca e o Enter escolhido não envia o formulário", () => {
    expect(FONTE).toMatch(/decidirTeclaDaBusca\(/);
    expect(FONTE).toContain("evento.preventDefault()");
  });

  it("a consulta ao servidor espera a última tecla e cancela a anterior", () => {
    /*
      Sem o cancelamento, a resposta de "ocor" pode chegar depois da de
      "ocorr" e sobrescrevê-la: a lista mostraria o resultado errado com a
      consulta certa na caixa.
    */
    expect(FONTE).toMatch(/setTimeout\([\s\S]*?ATRASO_DA_BUSCA_MS/);
    expect(FONTE).toMatch(/new AbortController\(\)/);
    expect(FONTE).toMatch(/controlador\.abort\(\)/);
    expect(FONTE).toMatch(/clearTimeout\(/);
  });

  it("o atalho global passa por ehAtalhoDeFoco e é desligado no desmonte", () => {
    expect(FONTE).toMatch(/ehAtalhoDeFoco\(/);
    expect(FONTE).toMatch(/document\.addEventListener\("keydown"/);
    expect(FONTE).toMatch(/document\.removeEventListener\("keydown"/);
  });

  it("o clique fora fecha, e o ouvinte sai junto com a lista", () => {
    expect(FONTE).toMatch(/document\.addEventListener\("mousedown"/);
    expect(FONTE).toMatch(/document\.removeEventListener\("mousedown"/);
  });

  it("a estrutura do painel usa a caixa de comando no lugar do formulário antigo", () => {
    expect(FONTE_ESTRUTURA).toMatch(/<BuscaGlobal\b/);
    expect(FONTE_ESTRUTURA).not.toContain('placeholder="Buscar protocolo, endereço ou solicitante"');
  });

  it("os resultados do servidor são filtrados pelo mesmo podeExecutar do menu", () => {
    expect(FONTE).toMatch(/gruposVisiveis\(/);
  });
});
