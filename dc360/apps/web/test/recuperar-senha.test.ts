import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TelaDaRedefinicao, TelaDoPedido } from "../src/paginas/RecuperarSenha";
import type { PropsDaRedefinicao, PropsDoPedido } from "../src/paginas/RecuperarSenha";
import {
  FRASES, MAXIMO_DE_CARACTERES, MINIMO_DE_CARACTERES, classificarFalha,
  fraseDaFalhaDaRedefinicao, fraseDaFalhaDoPedido, validarEmailDoPedido, validarSenhaNova,
} from "../src/paginas/recuperar-regras";
import { ehTelaInterna } from "../src/seo/indexacao";

/**
 * V2-F00-E10: as duas telas de "esqueci a senha", estado por estado.
 *
 * `fluxo-api.e2e.mjs` (seção 14) cobre o caminho feliz contra a API de verdade
 * e a seção 27 os casos de borda no navegador. O que este arquivo acrescenta é
 * o que o e2e não alcança barato: CADA estado da tela desenhado sozinho
 * (carregando, desligada, enviado, erro de campo, falha de rede, excesso de
 * pedidos, link que não vale mais, senhas diferentes, senha curta, sucesso) e
 * as regras de qual frase vale para qual falha.
 *
 * O português é conferido aqui porque é a frase de uma tela de recuperação que
 * erra em silêncio: ela é lida por quem acabou de perder o acesso.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (relativo: string) => readFileSync(join(SRC, relativo), "utf8");

// Montado pelo codigo para o arquivo nao conter o caractere que o proprio portao de conteudo varre.
const TRAVESSAO = String.fromCharCode(0x2014);

const PEDIDO: PropsDoPedido = {
  fase: "formulario", email: "", enviando: false, erroDoCampo: null, falha: null,
  aoMudarEmail: () => {}, aoEnviar: () => {}, aoPedirDeNovo: () => {},
};
const REDEFINICAO: PropsDaRedefinicao = {
  fase: "formulario", senha: "", repetida: "", salvando: false, erroDeSenha: null, falha: null,
  aoMudarSenha: () => {}, aoMudarRepetida: () => {}, aoEnviar: () => {},
};

const pedido = (p: Partial<PropsDoPedido> = {}) =>
  renderToStaticMarkup(h(TelaDoPedido, { ...PEDIDO, ...p }));
const redefinicao = (p: Partial<PropsDaRedefinicao> = {}) =>
  renderToStaticMarkup(h(TelaDaRedefinicao, { ...REDEFINICAO, ...p }));

/** O texto visível: sem tags, com as entidades que o React escapa desfeitas. */
function texto(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

describe("Qual frase vale para qual falha", () => {
  const falha = (status: number, codigo = "erro") => ({ name: "ErroDaApi", status, codigo });

  it("503 recuperacao_desligada troca a tela inteira por 'procure quem administra'", () => {
    expect(classificarFalha(falha(503, "recuperacao_desligada"))).toBe("desligada");
    // 503 sem o código não é "desligada": é o servidor fora do ar.
    expect(classificarFalha(falha(503, "indisponivel"))).toBe("outra");
  });

  it("401 é link que não vale mais, 429 é excesso, 422 é senha recusada, falta de rede é rede", () => {
    expect(classificarFalha(falha(401, "sessao_encerrada"))).toBe("link-invalido");
    expect(classificarFalha(falha(429, "excesso_de_requisicoes"))).toBe("excesso");
    expect(classificarFalha(falha(422, "dados_invalidos"))).toBe("recusada");
    expect(classificarFalha({ name: "SemConexao", message: "Sem conexão com o servidor." })).toBe("rede");
    expect(classificarFalha(falha(500, "erro_interno"))).toBe("outra");
    expect(classificarFalha("texto solto")).toBe("outra");
    expect(classificarFalha(null)).toBe("outra");
  });

  it("a falha de rede usa a frase própria dela, e as outras usam a da tela", () => {
    const rede = { name: "SemConexao", message: "Sem conexão com o servidor. Verifique o sinal e tente de novo." };
    expect(fraseDaFalhaDoPedido(rede)).toBe(rede.message);
    expect(fraseDaFalhaDoPedido(falha(429))).toBe(FRASES.pedidoExcesso);
    expect(fraseDaFalhaDoPedido(falha(500))).toBe(FRASES.pedidoFalhou);
    expect(fraseDaFalhaDaRedefinicao(rede)).toBe(rede.message);
    expect(fraseDaFalhaDaRedefinicao(falha(429))).toBe(FRASES.novaExcesso);
    expect(fraseDaFalhaDaRedefinicao(falha(422))).toBe(FRASES.novaRecusada);
    expect(fraseDaFalhaDaRedefinicao(falha(500))).toBe(FRASES.novaFalhou);
  });

  it("a mensagem do servidor nunca vai para a tela: ela pode vir de um proxy no meio do caminho", () => {
    const estranha = { name: "ErroDaApi", status: 500, codigo: "x", message: "<html>502 Bad Gateway</html>" };
    expect(fraseDaFalhaDoPedido(estranha)).not.toContain("Bad Gateway");
    expect(fraseDaFalhaDaRedefinicao(estranha)).not.toContain("Bad Gateway");
  });
});

describe("As conferências de digitação", () => {
  it("email: vazio e formato torto são recusados, com a frase que diz o que digitar", () => {
    expect(validarEmailDoPedido("")).toBe("Informe o seu email funcional.");
    expect(validarEmailDoPedido("   ")).toBe("Informe o seu email funcional.");
    expect(validarEmailDoPedido("helena")).toBe("Informe um email completo, como nome@orgao.gov.br.");
    expect(validarEmailDoPedido("helena@")).not.toBeNull();
    expect(validarEmailDoPedido("helena@serraalta")).not.toBeNull();
    expect(validarEmailDoPedido("helena coutinho@serraalta.gov.br")).not.toBeNull();
    expect(validarEmailDoPedido("  helena.coutinho@serraalta.exemplo.gov.br  ")).toBeNull();
  });

  it("senha nova: vazia, curta, longa e diferente da repetição, cada erro no campo certo", () => {
    expect(validarSenhaNova("", "")).toEqual({ campo: "nova", texto: "Digite a nova senha." });
    expect(validarSenhaNova("curta", "curta")).toEqual({
      campo: "nova", texto: "A senha precisa de pelo menos 12 caracteres.",
    });
    expect(validarSenhaNova("a".repeat(MINIMO_DE_CARACTERES - 1), "a".repeat(MINIMO_DE_CARACTERES - 1))?.campo)
      .toBe("nova");
    expect(validarSenhaNova("a".repeat(MAXIMO_DE_CARACTERES + 1), "a".repeat(MAXIMO_DE_CARACTERES + 1)))
      .toEqual({ campo: "nova", texto: "A senha pode ter no máximo 200 caracteres." });
    expect(validarSenhaNova("senha-nova-bem-longa", "senha-nova-bem-longo")).toEqual({
      campo: "repetida", texto: "As duas senhas precisam ser iguais.",
    });
  });

  it("os limites passam: 12 e 200 caracteres iguais nos dois campos são aceitos", () => {
    expect(validarSenhaNova("a".repeat(MINIMO_DE_CARACTERES), "a".repeat(MINIMO_DE_CARACTERES))).toBeNull();
    expect(validarSenhaNova("a".repeat(MAXIMO_DE_CARACTERES), "a".repeat(MAXIMO_DE_CARACTERES))).toBeNull();
  });

  it("sem regra de composição: senha longa só de letras minúsculas passa", () => {
    expect(validarSenhaNova("quatro palavras soltas aqui", "quatro palavras soltas aqui")).toBeNull();
  });
});

describe("Tela de pedir o link, estado por estado", () => {
  it("normal: um campo de email com rótulo, dica, e o botão que diz o ato", () => {
    const html = pedido();
    expect(html).toContain('<label for="recuperar-email">Email funcional</label>');
    expect(html).toContain('type="email"');
    expect(html).toMatch(/autocomplete="email"/i);
    expect(texto(html)).toContain(FRASES.pedidoDica);
    expect(texto(html)).toContain("Enviar link de redefinição");
    expect(html).not.toContain("disabled");
  });

  it("vazio com erro: o campo é marcado inválido e a frase diz o que digitar", () => {
    const html = pedido({ erroDoCampo: FRASES.pedidoEmailVazio });
    expect(html).toContain('aria-invalid="true"');
    expect(texto(html)).toContain("Informe o seu email funcional.");
    // O erro vem antes da dica na leitura (ver `Campo`).
    expect(html).toMatch(/aria-describedby="recuperar-email-erro recuperar-email-dica"/);
  });

  it("carregando o pedido: o botão diz Enviando, fica desligado e o formulário avisa que está ocupado", () => {
    const html = pedido({ enviando: true, email: "alguem@exemplo.gov.br" });
    expect(texto(html)).toContain("Enviando");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("verificando se a recuperação está ligada: anuncia por role=status, sem formulário", () => {
    const html = pedido({ fase: "verificando" });
    expect(html).toContain('role="status"');
    expect(texto(html)).toContain("Conferindo se a recuperação por email está ligada");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("falha de envio: aviso de perigo com role=alert e o formulário continua para tentar de novo", () => {
    const html = pedido({ falha: FRASES.pedidoExcesso, email: "a@b.gov.br" });
    expect(html).toContain('role="alert"');
    expect(texto(html)).toContain("Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.");
    expect(html).toContain("<form");
  });

  it("enviado: a frase neutra, o apoio e o botão de pedir de novo", () => {
    const html = pedido({ fase: "enviado" });
    const t = texto(html);
    expect(html).toContain("aviso--sucesso");
    expect(t).toContain("Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.");
    expect(t).toContain("caixa de spam");
    expect(t).toContain("funciona uma vez só");
    expect(t).toContain("Pedir de novo");
    expect(html).not.toContain("<input");
  });

  it("a frase de 'enviado' não diz se a conta existe: nada de 'encontrado', 'cadastrado' sem condicional", () => {
    const t = texto(pedido({ fase: "enviado" }));
    expect(t).not.toMatch(/não encontr|não existe|não está cadastr|enviamos o link para/i);
    expect(t).toMatch(/^.*Se existir conta/);
  });

  it("desligada: manda procurar quem administra e aponta o botão Redefinir senha da lista de Usuários", () => {
    const html = pedido({ fase: "desligada" });
    const t = texto(html);
    expect(t).toContain("A recuperação de senha por email não está ligada neste município.");
    expect(t).toContain("Procure a pessoa que administra o sistema");
    expect(t).toContain("lista de Usuários");
    expect(t).toContain("Redefinir senha");
    expect(t).toContain("senha temporária");
    expect(html).toContain('<ol class="passos">');
    expect((html.match(/<li>/g) ?? []).length).toBe(FRASES.desligadaPassos.length);
    // Ligada no servidor ou não, nenhum formulário de email nesse estado.
    expect(html).not.toContain("<input");
    expect(html).toContain("aviso--alerta");
  });

  it("modo de demonstração: explica e não deixa enviar", () => {
    const html = pedido({ fase: "local" });
    expect(texto(html)).toContain("modo de demonstração");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("a saída da tela é um link comum (recarrega), e nunca o Link do roteador", () => {
    for (const html of [pedido(), pedido({ fase: "desligada" }), pedido({ fase: "enviado" })]) {
      expect(html).toContain('<a href="/entrar">Voltar para a entrada</a>');
    }
    expect(fonte("paginas/RecuperarSenha.tsx")).not.toMatch(/import[^;]*\bLink\b[^;]*react-router/);
  });
});

describe("Tela de definir a senha nova, estado por estado", () => {
  it("normal: dois campos de senha com autocomplete new-password e o botão que diz o ato", () => {
    const html = redefinicao();
    expect(html).toContain('<label for="nova-senha">Nova senha</label>');
    expect(html).toContain('<label for="repetir-senha">Repita a nova senha</label>');
    expect((html.match(/autocomplete="new-password"/gi) ?? []).length).toBe(2);
    expect((html.match(/type="password"/g) ?? []).length).toBe(2);
    expect(texto(html)).toContain("Mínimo de 12 caracteres");
    expect(texto(html)).toContain("Definir nova senha");
  });

  it("senha curta: o erro fica na senha nova, e só nela", () => {
    const html = redefinicao({ erroDeSenha: { campo: "nova", texto: FRASES.novaCurta } });
    expect(texto(html)).toContain("A senha precisa de pelo menos 12 caracteres.");
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/id="nova-senha"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="nova-senha"/);
  });

  it("senhas diferentes: o erro fica na repetição, e só nela", () => {
    const html = redefinicao({ erroDeSenha: { campo: "repetida", texto: FRASES.repetidaDiferente } });
    expect(texto(html)).toContain("As duas senhas precisam ser iguais.");
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/id="repetir-senha"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="repetir-senha"/);
  });

  it("carregando: o botão diz Salvando e fica desligado", () => {
    const html = redefinicao({ salvando: true });
    expect(texto(html)).toContain("Salvando");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("falha de rede ou de servidor: aviso de perigo acima do botão, campos sem erro", () => {
    const html = redefinicao({ falha: FRASES.novaFalhou });
    expect(html).toContain('role="alert"');
    expect(texto(html)).toContain("Não foi possível redefinir a senha agora. Tente de novo em instantes.");
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("link que não vale mais (vencido, usado ou trocado): UMA frase, e o caminho de pedir outro", () => {
    const html = redefinicao({ fase: "link-invalido" });
    const t = texto(html);
    expect(t).toContain("Este link de redefinição não vale mais.");
    expect(t).toContain("vencido");
    expect(t).toContain("já ter sido usado");
    expect(t).toContain("Peça um novo link.");
    expect(html).toContain('href="/recuperar-senha"');
    expect(t).toContain("Pedir um novo link");
    expect(html).not.toContain("<input");
  });

  it("endereço sem link (vazio): diz que o link veio incompleto e oferece pedir outro", () => {
    const html = redefinicao({ fase: "sem-link" });
    expect(texto(html)).toContain("Este endereço não traz um link de redefinição.");
    expect(html).toContain('href="/recuperar-senha"');
    expect(html).not.toContain("<input");
  });

  it("recuperação desligada: as mesmas instruções da tela de pedir, sem formulário", () => {
    const html = redefinicao({ fase: "desligada" });
    expect(texto(html)).toContain("Procure a pessoa que administra o sistema");
    expect(html).not.toContain("<input");
  });

  it("sucesso: confirma com role=status e oferece o botão Entrar, sem prometer ida automática", () => {
    const html = redefinicao({ fase: "pronto" });
    expect(html).toContain("aviso--sucesso");
    // A confirmação é anunciada pelo leitor de tela como região de status.
    expect(html).toMatch(/class="aviso aviso--sucesso" role="status"/);
    expect(texto(html)).toContain("Senha redefinida. Entre com a nova senha.");
    // V2-F00-E10, correção 2: a tela não leva ninguém a lugar nenhum por conta própria (WCAG 2.2.1).
    expect(texto(html)).not.toMatch(/será levad|em instantes|redirecion/i);
    expect(html).not.toMatch(/http-equiv="refresh"/i);
    expect(texto(html)).toContain(FRASES.novaProntaBotao);
    expect(FRASES.novaProntaBotao).toMatch(/^Entrar/);
    // O título da tela não continua pedindo "Escolha uma senha" depois de a senha ser trocada.
    expect(texto(html)).toContain("Sua senha foi alterada");
    expect(texto(html)).not.toContain("Escolha uma senha para sua conta");
    expect(html).toContain('href="/entrar"');
    expect(html).not.toContain("<input");
  });
});

describe("O link de uso único não fica na barra de endereço", () => {
  const codigo = fonte("paginas/RecuperarSenha.tsx");

  it("o token é lido uma vez para o estado e a barra de endereço é limpa com history.replaceState", () => {
    expect(codigo).toMatch(/useState\(\(\) => params\.get\("token"\) \?\? ""\)/);
    expect(codigo).toContain("window.history.replaceState(window.history.state, \"\", window.location.pathname)");
  });

  it("depois do sucesso a ida para a entrada é um link de navegação completa, para a política de referenciador não seguir a pessoa", () => {
    // O botão é um `<a href="/entrar">`: o navegador recarrega a página e o roteador não participa.
    expect(codigo).toMatch(/<a className="botao botao--primario entrada__acao" href="\/entrar">\s*\{FRASES\.novaProntaBotao\}/);
    expect(codigo).not.toMatch(/useNavigate/);
  });

  it("a página que carrega o link não é indexada: o cabeçalho X-Robots-Tag cobre as duas rotas", () => {
    // A marca no HTML não serve aqui: `seo.test.ts` define "rota pública" como a que fica fora de
    // <Protegida>, e `/redefinir-senha` fica. O robô é barrado no cabeçalho (ver o bloco do vercel.json abaixo).
    expect(ehTelaInterna("/redefinir-senha")).toBe(false);
  });
});

describe("A confirmação da senha nova não some por tempo (WCAG 2.2.1)", () => {
  /** O código sem comentários: a explicação da regra cita o que ela proíbe. */
  const semComentarios = fonte("paginas/RecuperarSenha.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("a tela de redefinição não tem relógio nem navegação por código: nada leva a pessoa embora sozinho", () => {
    for (const proibido of [
      /setTimeout\s*\(/, /setInterval\s*\(/, /requestAnimationFrame\s*\(/,
      /location\.(assign|replace|href)/, /useNavigate/, /<Navigate\b/, /http-equiv/i,
    ]) {
      expect(semComentarios, `RecuperarSenha.tsx contém ${proibido}`).not.toMatch(proibido);
    }
  });

  it("não sobrou a constante de espera que alimentava o redirecionamento", () => {
    expect(fonte("paginas/RecuperarSenha.tsx")).not.toContain("ESPERA_ATE_A_ENTRADA");
  });
});

describe("Referrer-Policy no painel", () => {
  const vercel = JSON.parse(readFileSync(join(AQUI, "..", "..", "..", "vercel.json"), "utf8")) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const valor = (bloco: { headers: Array<{ key: string; value: string }> }, chave: string) =>
    bloco.headers.find((c) => c.key.toLowerCase() === chave.toLowerCase())?.value;

  it("as duas telas de recuperação são servidas com Referrer-Policy: no-referrer e X-Robots-Tag: noindex", () => {
    const bloco = vercel.headers.find((b) => /redefinir-senha/.test(b.source));
    expect(bloco, "falta o bloco de headers das telas de recuperação").toBeDefined();
    expect(bloco!.source).toContain("recuperar-senha");
    expect(valor(bloco!, "Referrer-Policy")).toBe("no-referrer");
    expect(valor(bloco!, "X-Robots-Tag")).toBe("noindex");
  });

  it("nenhum bloco global põe no-referrer: a chave do Google Maps é restrita por referenciador HTTP", () => {
    // `no-referrer` no painel inteiro faria o Google recusar a chave (RefererNotAllowedMapError) e o
    // mapa cairia no plano esquemático em todo município com Maps ligado. A política vale só onde há
    // credencial na URL. Ver docs/COLOCAR-DE-PE.md (MAPS_KEY) e docs/LIGAR-O-EMAIL.md.
    for (const bloco of vercel.headers) {
      if (/redefinir-senha|recuperar-senha/.test(bloco.source)) continue;
      expect(valor(bloco, "Referrer-Policy"), bloco.source).not.toBe("no-referrer");
    }
  });
});

describe("O texto das duas telas", () => {
  const todas = [
    ...Object.values(FRASES).flatMap((v) => (Array.isArray(v) ? v : [v])).map(String),
    pedido(), pedido({ fase: "desligada" }), pedido({ fase: "enviado" }),
    redefinicao(), redefinicao({ fase: "link-invalido" }), redefinicao({ fase: "pronto" }),
  ];

  it("nenhuma frase tem travessão", () => {
    for (const t of todas) expect(t).not.toContain(TRAVESSAO);
  });

  it("nenhuma frase supõe o gênero de quem lê nem de quem administra", () => {
    // "ele" aparece duas vezes, falando do email e do link, e não de uma pessoa.
    const texto0 = Object.values(FRASES).flatMap((v) => (Array.isArray(v) ? v : [v])).join("\n");
    expect(texto0).not.toMatch(/\b(o administrador|a administradora|o coordenador|a coordenadora|dele|dela|ela)\b/i);
  });

  it("português com acento: nenhuma das palavras que já saíram sem acento", () => {
    const texto0 = Object.values(FRASES).flatMap((v) => (Array.isArray(v) ? v : [v])).join("\n");
    for (const errada of ["redefinicao", "recuperacao", "nao vale", "Peca ", "municipio", "senha ja", "sessao"]) {
      expect(texto0, errada).not.toContain(errada);
    }
  });

  it("rótulo de botão não é vago: nenhum é só 'OK', 'Enviar' ou 'Sim'", () => {
    for (const r of [FRASES.pedidoBotao, FRASES.novaBotao, FRASES.pedirNovoLink, FRASES.novaProntaBotao, FRASES.pedidoDeNovo]) {
      expect(r.split(" ").length, r).toBeGreaterThan(1);
    }
  });

  it("o rótulo do campo diz o que digitar", () => {
    expect(FRASES.pedidoRotulo).toBe("Email funcional");
    expect(FRASES.pedidoDica).toMatch(/email da sua conta/i);
  });
});
