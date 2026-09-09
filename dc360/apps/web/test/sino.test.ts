import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PainelDeAvisos } from "../src/componentes/Sino";
import {
  ATRASO_DE_CONTINUACAO_MS, ESTADO_INICIAL, INTERVALO_MS, TETO_DE_ESPERA_MS,
  TETO_NA_TELA, complementoDoAviso, deveConsultar, fraseDoAviso,
  marcarLidosNoEstado, mesclarAvisos, proximoAtrasoMs, rotuloDoSino, seloDoSino,
  type EstadoDoSino,
} from "../src/componentes/sino-regras";
import type { Aviso, RespostaDeAvisos } from "../src/dados/tipos";

/**
 * O SINO, E O DEFEITO QUE ELE PODE CAUSAR SEM NINGUÉM PERCEBER.
 *
 * Este recurso consulta o servidor a cada trinta segundos, por pessoa logada, o
 * dia inteiro. Ele erra de dois jeitos, e nenhum dos dois aparece como erro:
 *
 * 1. **redesenhando a tela quando nada mudou.** O dono do produto já relatou
 *    nesta operação uma faixa de estado piscando a cada quinze segundos. Uma
 *    lista que se reconstrói a cada consulta é a mesma coisa, no topo da tela,
 *    com o coordenador tentando ler a fila. A resposta VAZIA é o caso normal de
 *    um dia de trabalho, então o caminho que preserva a identidade do estado é
 *    o caminho comum, e é ele que os testes daqui cobram;
 * 2. **consultando o que ninguém está olhando.** Aba de fundo aberta o dia
 *    inteiro são 2880 requisições por dia por pessoa, por nada, contra um teto
 *    de requisição que o turno anterior acabou de apertar.
 *
 * O resto do arquivo é sobre não perder aviso: cursor que veio do servidor,
 * ordem que não sorteia empate, e leitura que só acontece quando alguém diz que
 * leu.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FONTE_SINO = readFileSync(join(RAIZ, "componentes", "Sino.tsx"), "utf8");

function aviso(sobrescreve: Partial<Aviso> & { id: string }): Aviso {
  return {
    tipo: "vistoria_recebida",
    ocorrenciaId: "00000000-0000-4000-8000-00000000aaaa",
    protocolo: "000123/2026",
    criadoEm: "2026-09-08T10:00:00.000Z",
    detalhe: null,
    lido: false,
    ...sobrescreve,
  };
}

function resposta(sobrescreve: Partial<RespostaDeAvisos> = {}): RespostaDeAvisos {
  return {
    ate: "2026-09-08T12:00:00.000Z",
    ateId: null,
    itens: [],
    teto: 200,
    truncada: false,
    naoLidos: 0,
    naoLidosTruncado: false,
    ...sobrescreve,
  };
}

describe("A resposta que não traz nada novo não mexe na tela", () => {
  it("devolve o MESMO objeto, e não um objeto igual", () => {
    /*
      Esta é a correção inteira, e ela é uma identidade, não um conteúdo.
      `setEstado` com o mesmo objeto faz o React desistir da renderização; com
      um objeto novo equivalente, ele renderiza, refaz a lista, e quem estava
      com o ponteiro sobre um item ou com o foco dentro do painel perde os dois,
      a cada trinta segundos, para sempre.
    */
    const atual: EstadoDoSino = {
      itens: [aviso({ id: "a" })],
      naoLidos: 1,
      naoLidosTruncado: false,
      listaCortada: false,
    };
    const depois = mesclarAvisos(atual, resposta({ naoLidos: 1 }));
    expect(depois, "objeto novo com o mesmo conteúdo já é redesenho").toBe(atual);
  });

  it("a lista repetida pelo servidor não vira item novo", () => {
    /*
      O mesmo aviso volta com frequência: a continuação de uma resposta cortada
      reentrega o item do cursor, e uma consulta repetida depois de falha
      reentrega a janela inteira. Sem a comparação por identificador, o repetido
      entraria de novo e a lista ganharia linhas duplicadas do mesmo fato.
    */
    const atual = mesclarAvisos(ESTADO_INICIAL, resposta({
      itens: [aviso({ id: "a" })], naoLidos: 1,
    }));
    const depois = mesclarAvisos(atual, resposta({
      itens: [aviso({ id: "a" })], naoLidos: 1,
    }));
    expect(depois).toBe(atual);
    expect(depois.itens).toHaveLength(1);
  });

  it("quando só a contagem muda, a lista não é reconstruída", () => {
    // Alguém do plantão leu um aviso em outro computador: o número cai, e as
    // linhas na tela continuam sendo exatamente as mesmas linhas.
    const atual = mesclarAvisos(ESTADO_INICIAL, resposta({
      itens: [aviso({ id: "a" })], naoLidos: 4,
    }));
    const depois = mesclarAvisos(atual, resposta({ naoLidos: 3 }));
    expect(depois).not.toBe(atual);
    expect(depois.naoLidos).toBe(3);
    expect(depois.itens, "a lista mudou de identidade sem ter mudado").toBe(atual.itens);
  });
});

describe("O que chega de novo entra em ordem e sem buraco", () => {
  it("o mais novo fica no topo, e o empate é desfeito pelo identificador", () => {
    /*
      Empate de instante não é exceção, é rotina: uma sincronização traz várias
      vistorias na mesma transação e todas recebem o mesmo `now()`. Sem
      desempate, a ordem entre elas é indefinida, e indefinida quer dizer que
      pode mudar entre duas renderizações do mesmo conteúdo, que é piscar por
      outro caminho.
    */
    const estado = mesclarAvisos(ESTADO_INICIAL, resposta({
      itens: [
        aviso({ id: "b", criadoEm: "2026-09-08T10:00:00.000Z" }),
        aviso({ id: "c", criadoEm: "2026-09-08T10:00:00.000Z" }),
        aviso({ id: "a", criadoEm: "2026-09-08T11:00:00.000Z" }),
      ],
      naoLidos: 3,
    }));
    expect(estado.itens.map((a) => a.id)).toEqual(["a", "c", "b"]);
  });

  it("a marca de leitura vinda do servidor alcança um item que já estava na lista", () => {
    // Marcado em outro computador: sem isto, a linha continuaria com o botão
    // "Marcar como lido" sobre um aviso que já foi lido.
    const atual = mesclarAvisos(ESTADO_INICIAL, resposta({
      itens: [aviso({ id: "a" })], naoLidos: 1,
    }));
    const depois = mesclarAvisos(atual, resposta({
      itens: [aviso({ id: "a", lido: true })], naoLidos: 0,
    }));
    expect(depois.itens[0]?.lido).toBe(true);
    expect(depois.naoLidos).toBe(0);
  });

  it("a lista para de crescer no teto, e diz que parou", () => {
    /*
      A contagem NÃO sai da lista, ela vem do servidor, e é isso que torna o
      corte honesto: o número continua dizendo quanto falta mesmo quando a
      lista mostra menos.
    */
    const muitos = Array.from({ length: TETO_NA_TELA + 10 }, (_, i) => aviso({
      id: `id-${String(i).padStart(3, "0")}`,
      criadoEm: new Date(Date.UTC(2026, 8, 8, 10, i)).toISOString(),
    }));
    const estado = mesclarAvisos(ESTADO_INICIAL, resposta({
      itens: muitos, naoLidos: muitos.length,
    }));
    expect(estado.itens).toHaveLength(TETO_NA_TELA);
    expect(estado.listaCortada).toBe(true);
    expect(estado.naoLidos).toBe(muitos.length);
    // O corte tira os mais ANTIGOS, nunca os mais recentes.
    expect(estado.itens[0]?.id).toBe(`id-${String(muitos.length - 1).padStart(3, "0")}`);
  });
});

describe("Marcar como lido", () => {
  const comTres: EstadoDoSino = {
    itens: [aviso({ id: "a" }), aviso({ id: "b" }), aviso({ id: "c", lido: true })],
    naoLidos: 2,
    naoLidosTruncado: false,
    listaCortada: false,
  };

  it("desce o número na hora, sem esperar a próxima consulta", () => {
    // Trinta segundos com o selo dizendo "2" depois de a pessoa ter marcado os
    // dois é a tela contradizendo o que acabou de acontecer.
    const depois = marcarLidosNoEstado(comTres, ["a"]);
    expect(depois.naoLidos).toBe(1);
    expect(depois.itens.find((i) => i.id === "a")?.lido).toBe(true);
  });

  it("marcar o que já estava lido não mexe em nada", () => {
    expect(marcarLidosNoEstado(comTres, ["c"])).toBe(comTres);
  });

  it("com a contagem truncada, o número NÃO é subtraído", () => {
    /*
      Truncada quer dizer "pelo menos quinhentos". Subtrair de um piso produz um
      número que parece exato e não é: marcar dez de "500+" mostraria "490",
      afirmando um total que ninguém contou.
    */
    const piso: EstadoDoSino = { ...comTres, naoLidos: 500, naoLidosTruncado: true };
    const depois = marcarLidosNoEstado(piso, ["a", "b"]);
    expect(depois.naoLidos).toBe(500);
    expect(depois.naoLidosTruncado).toBe(true);
    expect(depois.itens.filter((i) => !i.lido)).toHaveLength(0);
  });
});

describe("Quando perguntar, e quando calar", () => {
  it("aba escondida não consulta", () => {
    /*
      O coordenador deixa o painel aberto o dia inteiro numa aba de fundo. A
      trinta segundos por consulta, são 2880 requisições por dia por pessoa,
      por nada.
    */
    expect(deveConsultar({ escondida: true, emVoo: false })).toBe(false);
    expect(deveConsultar({ escondida: false, emVoo: false })).toBe(true);
  });

  it("consulta em voo não vira consulta empilhada", () => {
    // Servidor lento com consultas empilhadas faz a resposta atrasada de uma
    // volta antiga chegar depois da nova e empurrar o cursor para trás.
    expect(deveConsultar({ escondida: false, emVoo: true })).toBe(false);
  });

  it("o ritmo normal é o intervalo, e a resposta cortada volta logo", () => {
    expect(proximoAtrasoMs({ truncada: false, falhasSeguidas: 0 })).toBe(INTERVALO_MS);
    expect(proximoAtrasoMs({ truncada: true, falhasSeguidas: 0 }))
      .toBe(ATRASO_DE_CONTINUACAO_MS);
  });

  it("com o servidor fora, a espera dobra até um teto", () => {
    /*
      Sem recuo, um servidor caído recebe uma consulta a cada trinta segundos de
      cada painel aberto no município, todas falhando. O sino é o recurso menos
      crítico do produto: ele é o primeiro que sai da frente quando aperta.
    */
    const um = proximoAtrasoMs({ truncada: false, falhasSeguidas: 1 });
    const dois = proximoAtrasoMs({ truncada: false, falhasSeguidas: 2 });
    expect(dois).toBeGreaterThan(um);
    expect(proximoAtrasoMs({ truncada: false, falhasSeguidas: 20 })).toBe(TETO_DE_ESPERA_MS);
    // A falha não pode ser confundida com continuação: truncada junto de falha
    // não pode devolver a espera curta, senão o painel martela o servidor caído.
    expect(proximoAtrasoMs({ truncada: true, falhasSeguidas: 3 }))
      .toBeGreaterThan(ATRASO_DE_CONTINUACAO_MS);
  });
});

describe("O que cada aviso diz", () => {
  it("os três tipos do banco têm frase própria", () => {
    expect(fraseDoAviso("vistoria_recebida")).toMatch(/vistoria/i);
    expect(fraseDoAviso("prazo_vencido")).toMatch(/prazo/i);
    expect(fraseDoAviso("providencia_respondida")).toMatch(/provid[êe]ncia/i);
  });

  it("tipo desconhecido não vira linha em branco", () => {
    /*
      A lista de tipos é fechada no banco, e o painel não é quem decide o que
      entra nela. Um tipo criado no servidor antes de o painel aprender a
      palavra faria o sino contar avisos que a lista mostra como linhas vazias,
      e linha vazia não leva ninguém a lugar nenhum. Impreciso ainda é clicável.
    */
    const frase = fraseDoAviso("interdicao_levantada");
    expect(frase.trim().length).toBeGreaterThan(0);
  });

  it("a severidade do prazo vencido é dita em português", () => {
    expect(complementoDoAviso({ tipo: "prazo_vencido", detalhe: "critica" }))
      .toMatch(/severidade/i);
    expect(complementoDoAviso({ tipo: "prazo_vencido", detalhe: "critica" }))
      .not.toContain("critica");
    // Ocorrência sem classificação não inventa complemento.
    expect(complementoDoAviso({ tipo: "prazo_vencido", detalhe: null })).toBeNull();
  });

  it("o selo vira mais quando o número não cabe, e o rótulo diz do quê", () => {
    expect(seloDoSino(0, false)).toBe("");
    expect(seloDoSino(7, false)).toBe("7");
    expect(seloDoSino(500, true)).toContain("+");
    expect(seloDoSino(120, false)).toContain("+");

    /*
      O selo sozinho, para o leitor de tela, seria "12" sem dizer doze do quê. A
      regra da casa é nunca comunicar estado só por cor, e aqui vale a irmã
      dela: nunca comunicar estado só por desenho.
    */
    expect(rotuloDoSino(0, false)).toMatch(/nenhum/i);
    expect(rotuloDoSino(1, false)).toMatch(/1 por ler/);
    expect(rotuloDoSino(12, false)).toMatch(/12 por ler/);
    expect(rotuloDoSino(500, true)).toMatch(/mais de 500/);
  });
});

describe("O painel desenhado", () => {
  function html(estado: EstadoDoSino, extras: { falhou?: boolean; marcando?: boolean } = {}) {
    return renderToStaticMarkup(
      h(
        MemoryRouter,
        null,
        h(PainelDeAvisos, {
          estado,
          falhou: extras.falhou ?? false,
          marcando: extras.marcando ?? false,
          aoMarcar: () => {},
          aoFechar: () => {},
          aoNavegar: () => {},
        }),
      ),
    );
  }

  it("cada aviso leva à ocorrência dele", () => {
    const saida = html({
      itens: [aviso({ id: "a", ocorrenciaId: "abc", protocolo: "000123/2026" })],
      naoLidos: 1, naoLidosTruncado: false, listaCortada: false,
    });
    expect(saida).toContain('href="/ocorrencias/abc"');
    expect(saida).toContain("000123/2026");
  });

  it("o não lido é dito com palavra, e não só com a faixa colorida", () => {
    const saida = html({
      itens: [aviso({ id: "a" })],
      naoLidos: 1, naoLidosTruncado: false, listaCortada: false,
    });
    expect(saida).toContain("Marcar como lido");
    const lido = html({
      itens: [aviso({ id: "a", lido: true })],
      naoLidos: 0, naoLidosTruncado: false, listaCortada: false,
    });
    expect(lido).toContain("Lido");
  });

  it("o estado vazio diz o que apareceria ali", () => {
    // "Nada novo" sozinho é ambíguo entre "não aconteceu nada" e "isto não
    // funciona", e ambiguidade num recurso passivo faz desconfiar do resto.
    const saida = html(ESTADO_INICIAL);
    expect(saida).toMatch(/vistoria/i);
    expect(saida).toMatch(/prazo/i);
  });

  it("quando o sino conta mais do que a lista mostra, ele diz isso", () => {
    /*
      Sem esta frase, a pessoa marca tudo o que está na tela, vê o selo
      continuar aceso e conclui que o sino está quebrado.
    */
    const saida = html({
      itens: [aviso({ id: "a" })],
      naoLidos: 500, naoLidosTruncado: true, listaCortada: true,
    });
    expect(saida).toMatch(/mais de/i);
    expect(saida).toContain("500");
  });

  it("a falha da consulta não apaga a lista que já estava na tela", () => {
    const saida = html(
      { itens: [aviso({ id: "a" })], naoLidos: 1, naoLidosTruncado: false, listaCortada: false },
      { falhou: true },
    );
    expect(saida).toContain("000123/2026");
    expect(saida).toMatch(/servidor/i);
  });
});

describe("O componente usa o próprio núcleo", () => {
  /*
    Buraco conhecido de teste de função pura: uma decisão correta que ninguém
    chama passa em todos os testes e não faz nada na tela. Estes casos leem a
    fonte porque o comportamento (relógio, aba escondida, cursor) só existe em
    navegador, e a suíte rápida não tem um.
  */

  it("a consulta passa por `deveConsultar` e olha `document.hidden`", () => {
    expect(FONTE_SINO).toContain("deveConsultar({ escondida: document.hidden");
  });

  it("o estado é atualizado por `mesclarAvisos`, e não montado à mão", () => {
    expect(FONTE_SINO).toMatch(/setEstado\(\(anterior\) => mesclarAvisos\(anterior, resposta\)\)/);
  });

  it("o cursor vem da resposta, e nunca do relógio da máquina", () => {
    /*
      O relógio do computador da coordenadoria não é o do servidor. Adiantado, a
      primeira pergunta já vem de um instante no futuro, e tudo que acontecer
      até o servidor alcançá-lo cai fora da janela e nunca mais entra. Aviso
      repetido é chato; aviso pulado é o que dói, e não há nada na tela dizendo
      que faltou.
    */
    expect(FONTE_SINO).toContain("cursor.current = { desde: resposta.ate, desdeId: resposta.ateId }");
    const laco = FONTE_SINO.slice(
      FONTE_SINO.indexOf("async function rodada"),
      FONTE_SINO.indexOf("function aoTrocarDeVisibilidade"),
    );
    expect(
      /new Date\(\)|Date\.now\(\)/.test(laco),
      "o laço de consulta leu o relógio da máquina para montar o cursor",
    ).toBe(false);
  });

  it("trocar de sessão zera o cursor e a lista", () => {
    /*
      A marca de leitura é por usuário, e o cursor é o ponto até onde AQUELA
      pessoa perguntou. Sem zerar, quem entra depois do colega, no mesmo
      computador, veria como lido o que o colega leu.
    */
    const efeito = FONTE_SINO.slice(FONTE_SINO.indexOf("useEffect(() => {"));
    const ateORodapeDoEfeito = efeito.slice(0, efeito.indexOf("async function rodada"));
    expect(ateORodapeDoEfeito).toContain("cursor.current = null");
    expect(ateORodapeDoEfeito).toContain("setEstado(ESTADO_INICIAL)");
    expect(FONTE_SINO, "o efeito precisa reagir à troca de sessão").toMatch(/\}, \[sessao\]\);/);
  });

  it("o relógio é cancelado quando o componente sai", () => {
    // Relógio de pé depois do desmonte dispara sobre uma tela que já não
    // existe, e o efeito aparece longe daqui.
    expect(FONTE_SINO).toContain("clearTimeout(relogio)");
    expect(FONTE_SINO).toContain('document.removeEventListener("visibilitychange"');
  });

  it("nada marca como lido sozinho", () => {
    /*
      Aviso que some ao abrir o painel, ou ao passar o mouse, é aviso que
      ninguém leu. A leitura só acontece por um controle que diz o que faz, e
      por isso `marcarAvisosLidos` só pode ser alcançado a partir da função que
      os botões chamam.
      */
    const chamadas = [...FONTE_SINO.matchAll(/marcarAvisosLidos\(/g)];
    expect(chamadas, "âncora: o painel ainda marca leitura em algum lugar").toHaveLength(1);

    const trecho = FONTE_SINO.slice(0, chamadas[0]!.index);
    const funcao = [...trecho.matchAll(/function ([A-Za-z0-9_$]+)\s*\(/g)].pop()?.[1];
    expect(funcao, "a marcação saiu da função explícita `marcar`").toBe("marcar");

    // E os dois gatilhos são botões, não abertura nem ponteiro.
    expect(FONTE_SINO).not.toMatch(/onMouseEnter|onMouseOver/);
    expect(FONTE_SINO).not.toMatch(/useEffect\([^)]*marcar\(/);
  });
});
