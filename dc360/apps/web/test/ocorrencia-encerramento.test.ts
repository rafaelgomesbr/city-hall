import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STATUS_OCORRENCIA, type StatusOcorrencia } from "@dc360/shared";
import {
  podeOferecerEncerramento, proximoPassoDoEncerramento, rotuloDoBotaoDeEncerrar,
} from "../src/paginas/ocorrencia-regras";
import { BlocoEncerramento } from "../src/paginas/Ocorrencia";

/**
 * O botão vermelho da tela de ocorrência.
 *
 * Este arquivo existe por dois defeitos que conviveram no mesmo bloco de JSX.
 *
 * O primeiro: o bloco "Encerrar ocorrência" tinha como única condição a
 * permissão e o "ainda não encerrada". Numa ocorrência recém registrada a
 * coluna esquerda desenhava, grudados, "Dados do chamado", "Classificar na
 * triagem" e "Encerrar ocorrência", com botão vermelho. Ninguém tinha pedido
 * para encerrar nada, e a primeira coisa oferecida a quem abre um chamado
 * novo era apagá-lo do fluxo.
 *
 * O segundo: não existia confirmação nenhuma. Não neste bloco, no painel
 * inteiro. A única barreira era um campo de motivo que o esquema
 * compartilhado aceita com um caractere, e o que está do outro lado é uma
 * transição terminal gravada numa trilha sem policy de UPDATE nem de DELETE.
 * Não existe desfazer: existe evento novo dizendo que o anterior foi engano.
 *
 * As regras são função pura em `ocorrencia-regras` justamente para poderem
 * ser exercitadas aqui. O que não dá para exercitar sem navegador (o segundo
 * toque de verdade) fica coberto pela conferência da fonte no fim do arquivo,
 * que é o que impede o `onEnviar` de voltar a ser chamado direto.
 */

const PAGINA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "paginas", "Ocorrencia.tsx");

describe("Quando o painel oferece o encerramento", () => {
  it("não oferece em ocorrência recém registrada", () => {
    expect(
      podeOferecerEncerramento("coordenador", "registrada"),
      "o encerramento voltou a aparecer colado na triagem, num caso em que a "
      + "única coisa conhecida é o telefonema",
    ).toBe(false);
  });

  it("não oferece em rascunho, e nunca em ocorrência já encerrada", () => {
    expect(podeOferecerEncerramento("coordenador", "rascunho")).toBe(false);
    // Encerrar de novo só produziria um segundo evento de encerramento, e a
    // trilha não tem como ser corrigida depois.
    expect(podeOferecerEncerramento("coordenador", "encerrada")).toBe(false);
  });

  it("oferece do resto do fluxo, porque encerrar continua sendo possível", () => {
    const oferecidos = STATUS_OCORRENCIA
      .filter((s: StatusOcorrencia) => podeOferecerEncerramento("coordenador", s));
    expect(oferecidos).toEqual(["triagem", "em_campo", "vistoria_concluida", "providencia_pendente"]);
  });

  it("permissão continua valendo antes de qualquer status", () => {
    // Esconder o botão não é controle de acesso (quem impede é o servidor),
    // mas oferecer a quem vai levar 403 é construir a recusa de propósito.
    for (const status of STATUS_OCORRENCIA) {
      expect(podeOferecerEncerramento("agente_campo", status)).toBe(false);
      expect(podeOferecerEncerramento("operador", status)).toBe(false);
    }
  });
});

describe("Os dois toques do encerramento", () => {
  it("o primeiro toque com motivo válido PERGUNTA, não grava", () => {
    const decisao = proximoPassoDoEncerramento("editando", "Risco afastado após a contenção");
    expect(
      decisao.tipo,
      "o primeiro toque no botão vermelho gravou o encerramento. Encerrada é "
      + "estado terminal e a trilha não aceita correção: um clique distraído "
      + "vira registro definitivo",
    ).toBe("perguntar");
  });

  it("o segundo toque grava, com o motivo já limpo de espaços", () => {
    const decisao = proximoPassoDoEncerramento("confirmando", "  Improcedente: alarme falso  ");
    expect(decisao).toEqual({ tipo: "gravar", motivo: "Improcedente: alarme falso" });
  });

  it("motivo vazio é recusado ANTES da pergunta, nos dois passos", () => {
    /*
      Perguntar "confirma?" para depois responder "faltou o motivo" faria a
      pessoa confirmar duas vezes o mesmo encerramento, e confirmação que se
      repete é confirmação que se aprende a clicar sem ler.
    */
    for (const passo of ["editando", "confirmando"] as const) {
      const decisao = proximoPassoDoEncerramento(passo, "   ");
      expect(decisao.tipo).toBe("erro");
      if (decisao.tipo === "erro") expect(decisao.mensagem).toMatch(/motivo/i);
    }
  });

  it("a confirmação diz qual protocolo está sendo encerrado", () => {
    // Quem coordena trabalha com várias ocorrências abertas em abas: um
    // "Confirmar" pelado não dá chance de perceber que a aba é a do caso errado.
    expect(rotuloDoBotaoDeEncerrar("editando", "2026-000123", false)).toBe("Encerrar ocorrência");
    expect(rotuloDoBotaoDeEncerrar("confirmando", "2026-000123", false))
      .toBe("Confirmar encerramento de 2026-000123");
    expect(rotuloDoBotaoDeEncerrar("confirmando", "2026-000123", true)).toBe("Encerrando");
  });
});

describe("O bloco desenhado na tela", () => {
  /**
   * Renderiza o bloco de verdade, sem navegador.
   *
   * `renderToStaticMarkup` dá o primeiro quadro, que é justamente o que
   * interessa aqui: o estado em que a pessoa chega ao botão.
   */
  function html(): string {
    return renderToStaticMarkup(
      createElement(BlocoEncerramento, {
        protocolo: "2026-000123",
        gravando: false,
        onEnviar: () => { throw new Error("não devia gravar ao renderizar"); },
      }),
    );
  }

  it("começa perguntando, e não já confirmando", () => {
    const saida = html();
    expect(saida).toContain("Encerrar ocorrência");
    expect(
      saida.includes("Confirmar encerramento"),
      "o bloco já nasce no passo de confirmação: o segundo toque viraria o primeiro",
    ).toBe(false);
  });

  it("o campo de motivo é anunciado como obrigatório", () => {
    expect(html()).toMatch(/<textarea[^>]*\brequired\b/);
  });

  it("a validação nativa do navegador fica desligada", () => {
    // `required` sem `noValidate` entrega a recusa para a bolha do navegador,
    // em texto que não é nosso, e a mensagem do esquema nunca aparece.
    expect(html()).toMatch(/<form[^>]*\bnovalidate\b/i);
  });
});

describe("A fiação entre a página e as regras", () => {
  function fonte(): string {
    return readFileSync(PAGINA, "utf8");
  }

  it("o bloco só é desenhado sob o portão de status", () => {
    expect(
      /const ofereceEncerramento = podeOferecerEncerramento\(sessao\.papel, o\.status\);/
        .test(fonte()),
      "a página voltou a decidir o encerramento por conta própria. A regra "
      + "mora em ocorrencia-regras para ter teste; condição solta no JSX não tem.",
    ).toBe(true);
    expect(fonte()).toMatch(/\{ofereceEncerramento && \(\s*<BlocoEncerramento/);
  });

  it("nada grava o encerramento fora do ramo de confirmação", () => {
    const inicio = fonte().indexOf("export function BlocoEncerramento");
    expect(inicio).toBeGreaterThan(0);
    // A chave que fecha a função é a única na coluna zero depois daqui.
    const bloco = fonte().slice(inicio, fonte().indexOf("\n}\n", inicio));

    expect(bloco).toMatch(/proximoPassoDoEncerramento\(passo, motivo\)/);
    // Uma chamada só, e ela vem depois do desvio de "perguntar".
    expect([...bloco.matchAll(/onEnviar\(/g)]).toHaveLength(1);
    expect(
      /decisao\.tipo === "perguntar"[\s\S]*?return;[\s\S]*?onEnviar\(/.test(bloco),
      "o onEnviar deixou de estar depois do desvio de confirmação: o primeiro "
      + "toque volta a gravar",
    ).toBe(true);
  });
});
