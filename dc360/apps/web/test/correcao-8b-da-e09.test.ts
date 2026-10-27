import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { aoFecharDaConfirmacao } from "../src/componentes/ConfirmarAcao";
import { lerFonte } from "./ler-fonte";

/**
 * Os achados da rodada 10 da V2-F00-E09 que a correção 8b conserta: (1) durante
 * a gravação, o Esc e o clique no fundo fechavam a janela de confirmação
 * (só o "Cancelar" estava travado) e o erro do servidor caía numa janela
 * fechada; (2) e (3) as frases das janelas fixavam "15 minutos" (a API aceita
 * até 60) e "mostrando consultas", e "Desativar usuário" ainda dizia que as
 * sessões "caem". A prova no navegador está em `layout-estreito.e2e.mjs`,
 * seção 15 (C).
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const semQuebras = (texto: string) => texto.replace(/\s+/g, " ");
const fonte = (...partes: string[]) => lerFonte(join(SRC, ...partes));

describe("Achado 1: gravando, o Esc e o clique no fundo não fecham a janela de confirmação", () => {
  it("ocupado: a saída da janela não faz nada e o cancelamento não é chamado", () => {
    const aoCancelar = vi.fn();
    const aoFechar = aoFecharDaConfirmacao(true, aoCancelar);
    aoFechar();
    expect(aoCancelar).not.toHaveBeenCalled();
  });

  it("livre: a saída da janela é o cancelamento", () => {
    const aoCancelar = vi.fn();
    aoFecharDaConfirmacao(false, aoCancelar)();
    expect(aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("o erro do servidor devolve o controle: ocupado volta a falso e a saída volta a valer", () => {
    const aoCancelar = vi.fn();
    aoFecharDaConfirmacao(true, aoCancelar)();
    aoFecharDaConfirmacao(false, aoCancelar)();
    expect(aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("a ConfirmarAcao entrega ao Modal a saída travada, e não o aoCancelar direto", () => {
    const confirmar = fonte("componentes", "ConfirmarAcao.tsx");
    expect(confirmar).toContain("aoFechar={aoFecharDaConfirmacao(ocupado, aoCancelar)}");
    expect(confirmar).not.toMatch(/aoFechar=\{aoCancelar\}/);
  });
});

describe("Achados 2 e 3: as frases não fixam o número de minutos nem dizem que as sessões caem", () => {
  const usuarios = semQuebras(fonte("paginas", "Usuarios.tsx"));
  const conta = semQuebras(fonte("paginas", "MinhaConta.tsx"));
  const honesta = "nenhuma consulta nova é atendida";

  it("nenhuma das telas fixa '15 minutos' nem diz 'mostrando consultas'", () => {
    for (const texto of [usuarios, conta]) {
      expect(texto).not.toContain("15 minutos");
      expect(texto).not.toContain("mostrando consultas");
    }
  });

  it("'Desativar usuário' não diz que as sessões caem e usa a frase honesta", () => {
    const janela = usuarios.slice(usuarios.indexOf('titulo="Desativar usuário"'));
    const trecho = janela.slice(0, janela.indexOf("rotuloDaAcao"));
    expect(trecho).not.toContain("as sessões dela caem");
    // V2-F03-E03: a leitura também cai na hora, então a frase da "janela de alguns minutos" saiu.
    expect(trecho).toContain("renovar a sessão, gravar e consultar são recusados na hora");
    expect(trecho).not.toContain("alguns minutos");
  });

  it("'Encerrar sessões' e 'Encerrar minhas outras sessões' dizem que nenhuma consulta nova é atendida", () => {
    expect(usuarios.split(honesta)).toHaveLength(2); // só "Encerrar sessões": 1 ocorrência
    expect(conta).toContain(honesta);
  });

  it("nenhuma tela promete 'alguns minutos' de leitura depois do corte (V2-F03-E03)", () => {
    for (const texto of [usuarios, conta]) {
      expect(texto).not.toContain("continuar consultando");
      expect(texto).not.toContain("alguns minutos");
    }
  });
});

describe("A prova no navegador existe", () => {
  it("a seção 15 do layout-estreito aperta Esc e clica no fundo enquanto grava", () => {
    const e2e = fonte("..", "test", "layout-estreito.e2e.mjs");
    expect(e2e).toContain("enquanto grava, o Esc não fecha a janela");
    expect(e2e).toContain("enquanto grava, o clique no fundo não fecha a janela");
  });
});
