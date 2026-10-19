import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmailQuebravel, pedacosDoEmail } from "../src/componentes/EmailQuebravel";
import { haModalAberto, registrarModalAberto } from "../src/componentes/modais-abertos";
import {
  FRASE_DA_SENHA_ATUAL_ERRADA, erroDaSenhaAtual,
} from "../src/paginas/senha-provisoria-regras";
import { ErroDaApi } from "../src/dados/http";
import { lerFonte } from "./ler-fonte";

/**
 * Os três defeitos da arbitragem da rodada 5 da V2-F00-E09, na parte que roda
 * sem navegador. A prova de geometria e de toque (o aviso por cima da janela, o
 * email no meio da palavra, a frase na tela) está em
 * `test/layout-estreito.e2e.mjs`, seções 8, 9 e 10, e este arquivo guarda a
 * causa de cada um.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = (...partes: string[]) => lerFonte(join(AQUI, "..", "src", ...partes));

describe("Defeito 1: a frase da senha atual errada nomeia o campo da tela", () => {
  const erroDeCredencial = new ErroDaApi(401, {
    erro: "credenciais", mensagem: "A senha atual não confere. Confira e digite de novo.",
  });

  it("em Minha conta fala da senha que a pessoa usa hoje, e na tela da provisória fala da provisória", () => {
    expect(erroDaSenhaAtual(erroDeCredencial, "minha-conta"))
      .toBe("A senha que você usa hoje não confere. Confira e digite de novo.");
    expect(erroDaSenhaAtual(erroDeCredencial, "senha-provisoria"))
      .toBe("A senha provisória que você recebeu não confere. Confira como ela foi anotada e digite de novo.");
  });

  it("os nomes dos campos nas frases são os nomes que a tela dá a eles", () => {
    // Frase que cita um campo que não existe na tela é o defeito de origem.
    expect(fonte("paginas", "MinhaConta.tsx")).toContain('rotulo="Senha que você usa hoje"');
    expect(fonte("paginas", "Entrar.tsx")).toContain('rotulo="Senha provisória que você recebeu"');
    expect(FRASE_DA_SENHA_ATUAL_ERRADA["minha-conta"]).toContain("senha que você usa hoje");
    expect(FRASE_DA_SENHA_ATUAL_ERRADA["senha-provisoria"]).toContain("senha provisória que você recebeu");
  });

  it("toda frase tem acento onde o português pede e diz o que fazer", () => {
    for (const frase of Object.values(FRASE_DA_SENHA_ATUAL_ERRADA)) {
      expect(frase).toContain("não confere");
      expect(frase).toMatch(/digite de novo\.$/);
      expect(frase).not.toMatch(/\bnao\b/);
    }
  });

  it("só o código `credenciais` é reconhecido: outro erro segue com a frase do servidor", () => {
    expect(erroDaSenhaAtual(new ErroDaApi(422, { erro: "validacao", mensagem: "x" }), "minha-conta")).toBeNull();
    expect(erroDaSenhaAtual(new ErroDaApi(500, { mensagem: "caiu" }), "senha-provisoria")).toBeNull();
    expect(erroDaSenhaAtual(new Error("rede"), "minha-conta")).toBeNull();
    expect(erroDaSenhaAtual("texto", "minha-conta")).toBeNull();
    expect(erroDaSenhaAtual(null, "minha-conta")).toBeNull();
  });

  it("as duas telas usam a função, e põem a frase no campo da senha atual (não no aviso de cima)", () => {
    const conta = fonte("paginas", "MinhaConta.tsx");
    expect(conta).toContain('erroDaSenhaAtual(e, "minha-conta")');
    expect(conta).toMatch(/if \(daSenha\) setErrosDeCampo\(\{ atual: daSenha \}\)/);
    const entrar = fonte("paginas", "Entrar.tsx");
    expect(entrar).toContain('erroDaSenhaAtual(e, "senha-provisoria")');
    expect(entrar).toMatch(/setErrosDeCampo\(\{ atual: daSenha \}\)/);
  });
});

describe("Defeito 2: com janela aberta o aviso passageiro espera", () => {
  it("o contador sobe e desce, e o desfazer só vale uma vez", () => {
    expect(haModalAberto()).toBe(false);
    const a = registrarModalAberto();
    const b = registrarModalAberto();
    expect(haModalAberto()).toBe(true);
    a();
    a(); // repetido: não pode descontar a janela do outro
    expect(haModalAberto(), "o desfazer repetido fechou a janela do vizinho").toBe(true);
    b();
    expect(haModalAberto()).toBe(false);
  });

  it("a janela se registra ao abrir e se solta ao fechar", () => {
    const modal = fonte("componentes", "Modal.tsx");
    expect(modal).toContain("const liberarAvisos = registrarModalAberto();");
    // A liberação mora na limpeza do mesmo efeito que abriu a janela.
    expect(modal).toMatch(/return \(\) => \{\s+restaurar\(\);\s+hospedeiro\.remove\(\);\s+liberarAvisos\(\);/);
  });

  it("o aviso não é desenhado nem corre enquanto há janela, e a pausa do ponteiro é zerada", () => {
    const toast = fonte("componentes", "Toast.tsx");
    expect(toast).toContain("const esperandoJanela = useHaModalAberto();");
    expect(toast).toMatch(/if \(esperandoJanela\) return null;/);
    expect(toast).toContain("duracaoComPausa(duracao, interagindo || esperandoJanela)");
    expect(toast).toMatch(/if \(esperandoJanela\) setInteragindo\(false\)/);
    // O `return null` vem DEPOIS dos hooks: antes dele seria hook condicional.
    expect(toast.indexOf("if (esperandoJanela) return null;"))
      .toBeGreaterThan(toast.indexOf("duracaoComPausa(duracao, interagindo || esperandoJanela)"));
  });
});

describe("Defeito 3: o email quebra só depois do @ e dos pontos", () => {
  const EMAILS = [
    "diego.alves@serraalta.exemplo.gov.br",
    "helena.coutinho@serraalta.exemplo.gov.br",
    "rita.lopes@serraalta.exemplo.gov.br",
    "sem-arroba",
    "a@b.c",
  ];

  it("os pedaços, juntos, dão o email de volta, sem perder nem acrescentar caractere", () => {
    for (const email of EMAILS) expect(pedacosDoEmail(email).join(""), email).toBe(email);
  });

  it("todo pedaço, menos o último, termina em @ ou em ponto, e o fim do endereço anda junto", () => {
    for (const email of EMAILS) {
      const pedacos = pedacosDoEmail(email);
      for (const p of pedacos.slice(0, -1)) expect(p, `${email}: "${p}"`).toMatch(/[@.]$/);
    }
    expect(pedacosDoEmail("diego.alves@serraalta.exemplo.gov.br"))
      .toEqual(["diego.", "alves@", "serraalta.", "exemplo.", "gov.br"]);
    expect(pedacosDoEmail("a@b.c")).toEqual(["a@", "b.c"]);
  });

  it("o componente põe <wbr> entre os pedaços e nenhum caractere a mais", () => {
    const html = renderToStaticMarkup(h(EmailQuebravel, { email: "rita.lopes@serraalta.exemplo.gov.br" }));
    expect(html).toBe("rita.<wbr/>lopes@<wbr/>serraalta.<wbr/>exemplo.<wbr/>gov.br");
    expect(html.replace(/<wbr\/>/g, "")).toBe("rita.lopes@serraalta.exemplo.gov.br");
  });

  it("a coluna Pessoa usa o componente e a regra de CSS que desliga a quebra em qualquer lugar", () => {
    expect(fonte("paginas", "Usuarios.tsx"))
      .toContain('<div className="tabela__secundario tabela__secundario--email"><EmailQuebravel email={u.email} /></div>');
    const css = fonte("estilos", "app.css");
    expect(css).toMatch(/\.tabela__secundario--email \{ overflow-wrap: normal; word-break: normal; \}/);
    // A regra nova vem DEPOIS da regra-mãe (`anywhere`), senão a ordem a desfaz.
    expect(css.indexOf(".tabela__secundario--email {"))
      .toBeGreaterThan(css.indexOf(".tabela__secundario { color"));
  });
});
