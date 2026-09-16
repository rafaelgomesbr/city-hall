import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SenhaTemporaria } from "../src/paginas/Usuarios";

/**
 * Redefinir a senha e derrubar as sessões de outra pessoa, e sair dos
 * próprios outros aparelhos, EXISTEM NA TELA.
 *
 * O DEFEITO: as três rotas estavam prontas na API, com teste verde, e as
 * três funções estavam em `http.ts`, `local.ts` e `repositorio.ts`. Nenhuma
 * página as chamava. Com a recuperação por email desligada, que é como o
 * piloto roda, "esqueci a senha" não tinha saída nenhuma pelo painel: quem
 * administra lia "procure quem administra o município" e não tinha o botão.
 *
 * O QUE ESTE ARQUIVO COBRA:
 *
 * 1. Em Usuários, por linha, "Redefinir senha" e "Encerrar sessões", cada um
 *    atrás de `ConfirmarAcao` (os dois derrubam o acesso de alguém agora, e
 *    a senha antiga não volta), e só para quem o POSTO deixa administrar,
 *    pela MESMA função da tela, nunca por uma cópia da regra.
 * 2. A senha temporária aparece UMA vez, em fonte tabular, com botão de
 *    copiar e a frase que diz que ela não volta: o servidor guarda só o
 *    hash, e nem ele consegue mostrá-la de novo.
 * 3. Em Minha conta, "Encerrar minhas outras sessões", atrás de
 *    `ConfirmarAcao`, dizendo que esta continua aberta.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (relativo: string) => readFileSync(join(SRC, relativo), "utf8");

/** O corpo de uma função nomeada, a partir do nome. */
function corpoDe(codigo: string, nome: string): string {
  const inicio = codigo.search(new RegExp(`(?:async\\s+)?function\\s+${nome}\\s*\\(`));
  if (inicio === -1) return "";
  const chave = codigo.indexOf("{", codigo.indexOf(")", inicio));
  let profundidade = 0;
  for (let i = chave; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidade++;
    else if (codigo[i] === "}") {
      profundidade--;
      if (profundidade === 0) return codigo.slice(inicio, i + 1);
    }
  }
  return codigo.slice(inicio);
}

describe("Usuários: redefinir senha e encerrar sessões de outra pessoa", () => {
  const usuarios = fonte("paginas/Usuarios.tsx");

  it("os dois botões existem, por linha, e chamam a camada de dados", () => {
    expect(usuarios).toContain("redefinirSenhaDeUsuario(");
    expect(usuarios).toContain("encerrarSessoesDeUsuario(");
    expect(usuarios).toMatch(/>\s*Redefinir senha\s*</);
    expect(usuarios).toMatch(/>\s*Encerrar sessões\s*</);
  });

  it("cada um pergunta antes, com o nome da pessoa no botão, e é destrutivo", () => {
    for (const componente of ["BotaoRedefinirSenha", "BotaoEncerrarSessoes"]) {
      const corpo = corpoDe(usuarios, componente);
      expect(corpo, `${componente} não existe em Usuarios.tsx`).not.toBe("");
      expect(corpo, `${componente} grava sem perguntar`).toContain("<ConfirmarAcao");
      expect(corpo).toMatch(/rotuloDaAcao=\{`[^`]*\$\{[^}]*nome[^}]*\}[^`]*`\}/);
      expect(corpo, `${componente}: derrubar o acesso de alguém é destrutivo`).toContain("destrutiva");
    }
  });

  it("só quem o posto deixa administrar vê os botões, pela função da tela e não por cópia da regra", () => {
    // A regra é `motivoParaNaoAdministrar`, que embrulha `podeGerirPapel`.
    // Outra frente está mudando a comparação de posto; a tela não a repete.
    expect(usuarios).toMatch(/motivoParaNaoAdministrar\(sessao\.papel, u\)/);
    expect(usuarios).not.toMatch(/POSTO\[/);
    // E ninguém redefine a própria senha por aqui: o servidor recusa
    // (`autoredefinicao`), e oferecer o botão seria construir a recusa.
    expect(corpoDe(usuarios, "BotaoRedefinirSenha")).toMatch(/usuarioId/);
  });

  it("a senha temporária aparece uma vez, copiável, com a frase de que não volta", () => {
    const html = renderToStaticMarkup(h(SenhaTemporaria, {
      resultado: {
        senhaTemporaria: "corvo-lento-praia-42",
        sessoesEncerradas: 2,
        mensagem: "Senha temporária de Diego Nakamura Alves. Ela aparece uma única vez.",
      },
      aoFechar: () => {},
    }));
    expect(html).toMatch(/<[^>]*class="[^"]*mono[^"]*"[^>]*>corvo-lento-praia-42</);
    expect(html).toMatch(/anote agora/i);
    expect(html).toMatch(/n[ãa]o aparece de novo/i);
    expect(html).toMatch(/<button[^>]*>[^<]*Copiar/);
    // A mensagem do servidor (validade, troca obrigatória) chega inteira.
    expect(html).toContain("Diego Nakamura Alves");
    // Duas sessões caíram junto, e a tela diz isso.
    expect(html).toMatch(/2 sess[õo]es/);
    // Ícone e texto: nada só por cor.
    expect(html).toMatch(/aviso--alerta[^>]*>\s*<svg/);
  });

  it("depois de encerrar as sessões, a tela confirma com um Toast", () => {
    expect(usuarios).toMatch(/[Ss]ess[õo]es de \$\{[^}]+\} encerradas|sessões encerradas/);
  });

  it("no modo de demonstração os botões não aparecem, e a tela diz por quê", () => {
    // Igual à troca de senha em Minha conta: sem senha e sem token não há o
    // que redefinir nem derrubar, e fingir seria pior que dizer.
    expect(usuarios).toMatch(/MODO === "api"[\s\S]{0,300}BotaoRedefinirSenha/);
    expect(usuarios).toMatch(/MODO === "local"[\s\S]{0,600}(escolha de perfil|sem senha)/);
  });
});

describe("Minha conta: encerrar minhas outras sessões", () => {
  const conta = fonte("paginas/MinhaConta.tsx");

  it("o botão existe, chama a camada de dados e pergunta antes", () => {
    expect(conta).toContain("encerrarMinhasSessoes(");
    expect(conta).toMatch(/Encerrar minhas outras sessões/);
    const corpo = corpoDe(conta, "MinhasOutrasSessoes");
    expect(corpo, "MinhasOutrasSessoes não existe em MinhaConta.tsx").not.toBe("");
    expect(corpo).toContain("<ConfirmarAcao");
    // A frase que importa: ESTA sessão continua aberta.
    expect(corpo).toMatch(/[Ee]sta (sess[ãa]o )?continua aberta/);
  });

  it("no modo de demonstração o cartão explica em vez de oferecer", () => {
    expect(corpoDe(conta, "MinhasOutrasSessoes")).toMatch(/MODO === "local"/);
  });
});
