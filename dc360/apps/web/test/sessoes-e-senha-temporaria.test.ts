import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import * as local from "../src/dados/local";
import { SenhaTemporaria } from "../src/paginas/Usuarios";
import {
  SO_ESTA_SESSAO, fraseDasSessoesAbertas, fraseDasSessoesQueCairam, fraseDeOutrasEncerradas,
  rotuloDeEncerrarOutras, sessoes,
} from "../src/paginas/sessoes-regras";

/**
 * V2-F00-E09: as frases das telas de sessões e a janela da senha temporária,
 * nos casos que `seguranca-da-conta.test.ts` (que lê o código-fonte) não
 * alcança: zero, uma e várias sessões, o modo de demonstração recusando com
 * explicação, e a janela da senha em cada contagem.
 *
 * O português é conferido aqui porque é a frase de plural e de zero que erra em
 * silêncio, e é ela que a pessoa lê na hora de derrubar um acesso.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = (relativo: string) => readFileSync(join(AQUI, "..", "src", relativo), "utf8");

// Montado pelo codigo para o arquivo nao conter o caractere que o proprio portao de conteudo varre.
const TRAVESSAO = String.fromCharCode(0x2014);

describe("As frases das telas de sessões", () => {
  it("plural: 1 sessão, 2 sessões", () => {
    expect(sessoes(1)).toBe("1 sessão");
    expect(sessoes(2)).toBe("2 sessões");
    expect(sessoes(0)).toBe("0 sessões");
  });

  it("a confirmação de encerrar diz quantas estão abertas, e nada quando ainda não sabe", () => {
    expect(fraseDasSessoesAbertas("Diego Alves", null, null)).toBe("");
    expect(fraseDasSessoesAbertas("Diego Alves", 0, null)).toBe("Diego Alves não tem sessão aberta agora.");
    expect(fraseDasSessoesAbertas("Diego Alves", 1, "05/10/2026 14:30"))
      .toBe("Diego Alves tem 1 sessão aberta, a mais recente iniciada em 05/10/2026 14:30.");
    expect(fraseDasSessoesAbertas("Diego Alves", 3, "05/10/2026 14:30"))
      .toBe("Diego Alves tem 3 sessões abertas, a mais recente iniciada em 05/10/2026 14:30.");
    // Sem data (a leitura trouxe a quantidade e nada mais), a frase não inventa uma.
    expect(fraseDasSessoesAbertas("Diego Alves", 2, null)).toBe("Diego Alves tem 2 sessões abertas.");
  });

  it("na janela da senha: nenhuma, uma e várias sessões derrubadas", () => {
    expect(fraseDasSessoesQueCairam(0)).toBe("Esta conta não tinha nenhuma sessão aberta.");
    expect(fraseDasSessoesQueCairam(1)).toBe("1 sessão aberta desta conta foi encerrada.");
    expect(fraseDasSessoesQueCairam(4)).toBe("4 sessões abertas desta conta foram encerradas.");
  });

  it("em Minha conta: o botão repete o ato com o objeto, e a confirmação diz que esta continua", () => {
    expect(rotuloDeEncerrarOutras(1)).toBe("Encerrar a outra sessão");
    expect(rotuloDeEncerrarOutras(2)).toBe("Encerrar as outras 2 sessões");
    expect(fraseDeOutrasEncerradas(0)).toBe("Nenhuma outra sessão estava aberta. Esta continua aberta.");
    expect(fraseDeOutrasEncerradas(1)).toBe("A outra sessão foi encerrada. Esta continua aberta.");
    expect(fraseDeOutrasEncerradas(3)).toBe("As outras 3 sessões foram encerradas. Esta continua aberta.");
  });

  it("nenhuma frase tem travessão nem supõe o gênero de quem é citado", () => {
    const todas = [
      fraseDasSessoesAbertas("Pessoa", 0, null), fraseDasSessoesAbertas("Pessoa", 1, "x"),
      fraseDasSessoesAbertas("Pessoa", 2, "x"), fraseDasSessoesQueCairam(0),
      fraseDasSessoesQueCairam(1), fraseDasSessoesQueCairam(2), rotuloDeEncerrarOutras(1),
      rotuloDeEncerrarOutras(2), fraseDeOutrasEncerradas(0), fraseDeOutrasEncerradas(1),
      fraseDeOutrasEncerradas(2), SO_ESTA_SESSAO,
    ].join("\n");
    expect(todas).not.toContain(TRAVESSAO);
    // "ele" aparece uma vez, falando do aparelho ("ele passa a aparecer aqui"), e não de uma pessoa.
    expect(todas.replace("ele passa a aparecer aqui", "")).not.toMatch(/\b(ele|ela|dele|dela)\b/i);
  });

  it("rótulo de botão não é vago: nenhum é só 'OK', 'Sim' ou 'Confirmar'", () => {
    for (const r of [rotuloDeEncerrarOutras(1), rotuloDeEncerrarOutras(5)]) {
      expect(r).toMatch(/Encerrar/);
      expect(r.split(" ").length).toBeGreaterThan(2);
    }
  });
});

describe("A janela da senha temporária", () => {
  const base = {
    senhaTemporaria: "corvo-lento-praia",
    mensagem: "Senha temporária de Rita Lopes. Ela aparece uma única vez.",
  };
  const montar = (sessoesEncerradas: number) =>
    renderToStaticMarkup(h(SenhaTemporaria, {
      resultado: { ...base, sessoesEncerradas },
      aoFechar: () => {},
    }));

  it("diz quantas sessões caíram, em cada contagem", () => {
    expect(montar(0)).toContain("Esta conta não tinha nenhuma sessão aberta.");
    expect(montar(1)).toContain("1 sessão aberta desta conta foi encerrada.");
    expect(montar(3)).toContain("3 sessões abertas desta conta foram encerradas.");
  });

  it("tem os dois botões, cada um com o que faz escrito, e a saída não é 'OK'", () => {
    const html = montar(1);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Copiar senha<\/button>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Já anotei a senha<\/button>/);
    expect(html).not.toMatch(/>\s*OK\s*</);
  });

  it("o anúncio de 'copiada' tem região viva desde o início, para o leitor de tela anunciar a mudança", () => {
    expect(montar(1)).toMatch(/<p[^>]*role="status"[^>]*aria-live="polite"[^>]*>/);
  });

  it("a senha vai em fonte tabular, sem ficar escondida do leitor de tela", () => {
    const html = montar(1);
    expect(html).toMatch(/class="senha-temporaria__valor mono"[^>]*>corvo-lento-praia</);
    expect(html).not.toMatch(/aria-hidden="true"[^>]*>corvo-lento-praia/);
  });
});

describe("O modo de demonstração explica em vez de oferecer", () => {
  it.each([
    ["listarMinhasSessoes", () => local.listarMinhasSessoes()],
    ["sessoesDeUsuario", () => local.sessoesDeUsuario("qualquer-id")],
    ["redefinirSenhaDeUsuario", () => local.redefinirSenhaDeUsuario("qualquer-id")],
    ["encerrarSessoesDeUsuario", () => local.encerrarSessoesDeUsuario("qualquer-id")],
    ["encerrarMinhasSessoes", () => local.encerrarMinhasSessoes()],
  ])("%s recusa dizendo que exige a API, sem fingir efeito", async (_nome, chamar) => {
    const erro = await chamar().then(() => null, (e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/exige a API/);
    expect((erro as Error).message).not.toContain(TRAVESSAO);
  });
});

describe("As telas não oferecem o que a API recusa", () => {
  const usuarios = fonte("paginas/Usuarios.tsx");

  it("os dois botões de linha só aparecem em quem não é a própria conta, no modo com servidor", () => {
    expect(usuarios).toMatch(
      /MODO === "api"\s*&& motivoParaNaoAdministrar\(sessao\.papel, u\) === null\s*&& u\.id !== sessao\.usuarioId/,
    );
  });

  it("a janela da senha não fecha por clique fora nem tem o 'Fechar' do canto", () => {
    expect(usuarios).toMatch(/<Modal[\s\S]{0,400}fecharAoClicarFora=\{false\}[\s\S]{0,200}mostrarBotaoFechar=\{false\}/);
  });

  it("a senha não é gravada em lugar nenhum além do estado da página", () => {
    for (const arquivo of ["paginas/Usuarios.tsx", "dados/http.ts"]) {
      const codigo = fonte(arquivo);
      expect(codigo, arquivo).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*senhaTemporaria/);
    }
  });
});
