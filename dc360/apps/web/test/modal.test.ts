import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CorpoDoModal, decidirTecla, deveFecharPeloFundo, interditarFundo, Modal, proximoFoco,
  type ElementoInterditavel,
} from "../src/componentes/Modal";
import { aparenciaDaConfirmacao, rotuloVago } from "../src/componentes/ConfirmarAcao";

/**
 * A janela modal, provada sem navegador.
 *
 * O painel não tem ambiente de DOM na suíte rápida (nada de jsdom, e o
 * navegador de verdade só aparece nos `*.e2e.mjs`, que exigem servidor de
 * pé). Isso não impede provar o que importa aqui, desde que o comportamento
 * esteja escrito como decisão e não como efeito colateral:
 *
 * - a armadilha de foco é a função que diz PARA ONDE o Tab vai. Ela é
 *   circular ou não é, e isso se vê em três linhas de teste;
 * - a interdição do fundo é a função que marca e desmarca atributos. Ela é
 *   exercitada com elementos de mentira que só sabem responder por atributo;
 * - a amarração de acessibilidade (`role`, `aria-modal`, `aria-labelledby`) é
 *   marcação, e marcação se lê no HTML renderizado no servidor.
 *
 * O que NÃO é provado aqui, e por isso está dito em voz alta: que o navegador
 * de fato leve o foco, que `inert` esteja implementado no navegador da
 * prefeitura, e que o leitor de tela anuncie o título. Isso é teste com
 * pessoa e com leitor de tela, e não tem substituto automático.
 *
 * Os testes de "a janela usa o próprio núcleo" existem por um buraco
 * conhecido: função pura correta que ninguém chama passa em todos os testes
 * de função pura e não faz nada na tela.
 */

const COMPONENTES = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "componentes");
const FONTE_MODAL = readFileSync(join(COMPONENTES, "Modal.tsx"), "utf8");
const FONTE_CONFIRMAR = readFileSync(join(COMPONENTES, "ConfirmarAcao.tsx"), "utf8");

/** Elemento de mentira: só sabe o que a interdição precisa saber. */
function elementoFalso(jaMarcado: Record<string, string> = {}) {
  const atributos = new Map(Object.entries(jaMarcado));
  const elemento: ElementoInterditavel & { atributos: Map<string, string> } = {
    atributos,
    hasAttribute: (nome) => atributos.has(nome),
    setAttribute: (nome, valor) => { atributos.set(nome, valor); },
    removeAttribute: (nome) => { atributos.delete(nome); },
  };
  return elemento;
}

describe("Armadilha de foco", () => {
  const paradas = ["cancelar", "confirmar", "fechar"];

  it("do último, o Tab volta para o primeiro", () => {
    /*
      Esta é a armadilha inteira. Sem a volta, o Tab sai da janela pela borda
      de baixo e segue para a página atrás, que continua desenhada na tela: a
      pessoa passa a operar controles que não vê.
    */
    expect(proximoFoco(paradas, "fechar", false)).toBe("cancelar");
  });

  it("do primeiro, o Shift+Tab volta para o último", () => {
    expect(proximoFoco(paradas, "cancelar", true)).toBe("fechar");
  });

  it("no meio, anda um passo para cada lado", () => {
    expect(proximoFoco(paradas, "confirmar", false)).toBe("fechar");
    expect(proximoFoco(paradas, "confirmar", true)).toBe("cancelar");
  });

  it("foco que escapou da janela é trazido de volta", () => {
    // Acontece de verdade: clique no fundo, ou o botão que tinha o foco
    // sumiu. O foco fica no `<body>`, que não está na lista.
    expect(proximoFoco(paradas, "corpo-da-pagina", false)).toBe("cancelar");
    expect(proximoFoco(paradas, null, false)).toBe("cancelar");
    expect(proximoFoco(paradas, null, true)).toBe("fechar");
  });

  it("janela sem nada focável não tem para onde mandar", () => {
    expect(proximoFoco([], null, false)).toBeNull();
  });
});

describe("Teclado da janela", () => {
  const focaveis = ["a", "b"];

  it("Escape fecha", () => {
    expect(decidirTecla({ tecla: "Escape", comShift: false, focaveis, ativo: "a" }))
      .toEqual({ acao: "fechar" });
  });

  it("Tab move dentro, e o navegador não move junto", () => {
    expect(decidirTecla({ tecla: "Tab", comShift: false, focaveis, ativo: "b" }))
      .toEqual({ acao: "mover", alvo: "a" });
    expect(decidirTecla({ tecla: "Tab", comShift: true, focaveis, ativo: "a" }))
      .toEqual({ acao: "mover", alvo: "b" });
  });

  it("Tab sem destino segura o foco em vez de deixar vazar", () => {
    /*
      Janela em que tudo está `disabled` durante a gravação. Deixar o Tab
      seguir seria abrir um caminho para a página de trás justamente no
      instante em que a gravação está no ar.
    */
    expect(decidirTecla({ tecla: "Tab", comShift: false, focaveis: [], ativo: null }))
      .toEqual({ acao: "prender" });
  });

  it("as outras teclas seguem, senão não dá para digitar dentro da janela", () => {
    expect(decidirTecla({ tecla: "a", comShift: false, focaveis, ativo: "a" }))
      .toEqual({ acao: "seguir" });
    expect(decidirTecla({ tecla: "Enter", comShift: false, focaveis, ativo: "a" }))
      .toEqual({ acao: "seguir" });
  });
});

describe("Interdição da página de trás", () => {
  it("marca inert e aria-hidden, que são dois caminhos diferentes", () => {
    const fundo = elementoFalso();
    interditarFundo([fundo]);
    expect(fundo.atributos.get("inert")).toBe("");
    expect(fundo.atributos.get("aria-hidden")).toBe("true");
  });

  it("desfaz ao fechar, senão a página fica morta depois da janela", () => {
    const fundo = elementoFalso();
    const restaurar = interditarFundo([fundo]);
    restaurar();
    expect(fundo.atributos.has("inert")).toBe(false);
    expect(fundo.atributos.has("aria-hidden")).toBe(false);
  });

  it("não desmarca o que não foi ela que marcou", () => {
    /*
      Duas janelas em sequência, ou conteúdo que o próprio painel escondia:
      desmarcar às cegas revela ao fechar a janela algo que estava escondido
      de propósito, e ninguém liga uma coisa à outra depois.
    */
    const jaEscondido = elementoFalso({ "aria-hidden": "true" });
    const restaurar = interditarFundo([jaEscondido]);
    restaurar();
    expect(jaEscondido.atributos.get("aria-hidden")).toBe("true");
    expect(jaEscondido.atributos.has("inert")).toBe(false);
  });
});

describe("Clique fora", () => {
  it("fecha quando é permitido e o clique foi no fundo", () => {
    expect(deveFecharPeloFundo(true, true)).toBe(true);
  });

  it("não fecha quando o clique nasceu dentro da janela", () => {
    // Selecionar texto dentro e soltar o mouse sobre o fundo é clique fora
    // para quem só olha o alvo do evento.
    expect(deveFecharPeloFundo(true, false)).toBe(false);
  });

  it("não fecha quando a janela proíbe", () => {
    expect(deveFecharPeloFundo(false, true)).toBe(false);
  });
});

describe("Amarração de acessibilidade da janela", () => {
  function renderizar(descricao?: string) {
    return renderToStaticMarkup(
      h(CorpoDoModal, {
        tituloId: "t1",
        descricaoId: "d1",
        titulo: "Encerrar ocorrência",
        descricao,
        aoFechar: () => {},
        fecharAoClicarFora: true,
        mostrarBotaoFechar: true,
      }),
    );
  }

  it("declara diálogo modal e diz o próprio nome", () => {
    const html = renderizar();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="t1"');
    // O `id` do título precisa EXISTIR: apontar para nada anuncia
    // "diálogo, em branco", que é pior do que não apontar.
    expect(html).toMatch(/<h2[^>]*id="t1"[^>]*>Encerrar ocorrência<\/h2>/);
  });

  it("a consequência é ligada por aria-describedby quando existe", () => {
    const html = renderizar("Não tem desfazer.");
    expect(html).toContain('aria-describedby="d1"');
    expect(html).toMatch(/id="d1"[^>]*>Não tem desfazer\./);
  });

  it("sem consequência, não aponta para um id que não existe", () => {
    expect(renderizar()).not.toContain("aria-describedby");
  });

  it("o painel recebe foco mesmo sem nada focável dentro", () => {
    expect(renderizar()).toMatch(/class="modal__painel"[\s\S]*?tabindex="-1"/);
  });
});

describe("A janela fora do navegador", () => {
  /*
    A suíte deste painel monta telas inteiras com `renderToStaticMarkup`, em
    Node, sem `document` (ver `test/ocorrencia-ver-tambem.test.ts`). Uma tela
    que apenas TENHA uma confirmação, mesmo fechada, passaria a derrubar o
    teste de outra pessoa com "document is not defined", e o erro apareceria
    longe daqui. Janela modal é interação: fora do navegador, o certo é não
    existir.
  */
  function abrir(aberto: boolean) {
    return renderToStaticMarkup(
      h(Modal, { aberto, titulo: "Encerrar ocorrência", aoFechar: () => {} }),
    );
  }

  it("fechada, não desenha nada e não pede DOM", () => {
    expect(abrir(false)).toBe("");
  });

  it("aberta sem navegador, não derruba a tela que a contém", () => {
    expect(() => abrir(true)).not.toThrow();
  });
});

describe("A janela usa o próprio núcleo", () => {
  /*
    Estes quatro não olham comportamento, olham ligação. Existem porque já
    aconteceu neste repositório: a regra certa, escrita, testada, e ninguém
    chamando. O teste de função pura fica verde e a tela continua quebrada.
  */

  it("o Tab da janela passa por decidirTecla", () => {
    expect(FONTE_MODAL).toMatch(/onKeyDown=|aoTeclar/);
    expect(FONTE_MODAL).toMatch(/decidirTecla</);
    expect(FONTE_MODAL).toContain("evento.preventDefault()");
  });

  it("a abertura interdita o fundo e a saída desfaz", () => {
    expect(FONTE_MODAL).toMatch(/const restaurar = interditarFundo\(/);
    expect(FONTE_MODAL).toMatch(/return \(\) => \{[\s\S]*restaurar\(\);/);
  });

  it("o foco de quem abriu é guardado antes da interdição", () => {
    /*
      A ordem é o conserto: `inert` num ancestral do elemento focado tira o
      foco dele na hora, então ler `document.activeElement` depois de
      interditar guardaria o `<body>`, e a devolução do foco viraria "voltar
      ao topo do documento".
    */
    const guarda = FONTE_MODAL.indexOf("const quemAbriu = document.activeElement");
    const interdicao = interdicaoEm(FONTE_MODAL);
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(interdicao);
  });

  it("a página é devolvida antes do foco, senão o foco não vai", () => {
    const limpeza = FONTE_MODAL.slice(FONTE_MODAL.indexOf("return () => {", interdicaoEm(FONTE_MODAL)));
    const restaurar = limpeza.indexOf("restaurar()");
    const volta = limpeza.indexOf("volta?.focus()");
    expect(restaurar).toBeGreaterThan(-1);
    expect(volta).toBeGreaterThan(restaurar);
  });
});

function interdicaoEm(fonte: string): number {
  return fonte.indexOf("const restaurar = interditarFundo(");
}

describe("Confirmação de ato irreversível", () => {
  it("ato destrutivo tem aparência destrutiva", () => {
    expect(aparenciaDaConfirmacao(true).classeDoBotao).toContain("botao--perigo");
    expect(aparenciaDaConfirmacao(false).classeDoBotao).toContain("botao--primario");
  });

  it("confirmação destrutiva não some por clique fora", () => {
    /*
      Clique fora é gesto acidental. Numa decisão comum ele é conveniência;
      na que não tem desfazer, ele apaga a pergunta do meio da leitura e a
      pessoa volta para a tela sem saber se a coisa aconteceu.
    */
    expect(aparenciaDaConfirmacao(true).fecharAoClicarFora).toBe(false);
    expect(aparenciaDaConfirmacao(false).fecharAoClicarFora).toBe(true);
  });

  it('o botão que repete o ato passa, o "OK" não', () => {
    expect(rotuloVago("Encerrar 000123/2026")).toBe(false);
    expect(rotuloVago("Desativar Ana Beatriz Souza")).toBe(false);
    expect(rotuloVago("OK")).toBe(true);
    expect(rotuloVago("Confirmar")).toBe(true);
    expect(rotuloVago("Sim, confirmar")).toBe(true);
    expect(rotuloVago("   ")).toBe(true);
    // Acento e caixa não podem ser jeito de escapar da regra.
    expect(rotuloVago("Não")).toBe(true);
    expect(rotuloVago("CONTINUAR")).toBe(true);
  });

  it("a janela de confirmação liga o que decidiu", () => {
    expect(FONTE_CONFIRMAR).toMatch(/aparenciaDaConfirmacao\(destrutiva\)/);
    expect(FONTE_CONFIRMAR).toMatch(/fecharAoClicarFora=\{fecharAoClicarFora\}/);
    expect(FONTE_CONFIRMAR).toMatch(/className=\{classeDoBotao\}/);
  });

  it("o foco inicial é o cancelar, e não o botão que executa", () => {
    /*
      A janela abre debaixo do dedo de quem acabou de teclar Enter. Com o foco
      no botão que executa, o segundo Enter grava o ato sem que ninguém tenha
      lido a frase.
    */
    expect(FONTE_CONFIRMAR).toMatch(/focoInicial=\{cancelar\}/);
    const rodape = FONTE_CONFIRMAR.slice(FONTE_CONFIRMAR.indexOf("rodape={"));
    const ondeCancela = rodape.indexOf("ref={cancelar}");
    const ondeConfirma = rodape.indexOf("onClick={aoConfirmar}");
    expect(ondeCancela).toBeGreaterThan(-1);
    expect(ondeConfirma).toBeGreaterThan(-1);
    // O ref do foco inicial está no botão de cancelar, que é o segundo.
    expect(ondeCancela).toBeGreaterThan(ondeConfirma);
    expect(rodape.slice(ondeConfirma, ondeCancela)).not.toContain("ref={cancelar}");
  });
});
