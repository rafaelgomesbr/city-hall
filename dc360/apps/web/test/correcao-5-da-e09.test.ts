import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { focarPrimeiroInvalido, type NoFocavel } from "../src/componentes/foco";
import { lerFonte } from "./ler-fonte";

/**
 * Os dois achados da rodada 6 da V2-F00-E09 (validador de UX, FAIL), na parte
 * que roda sem navegador. A prova no navegador, nos três motores, está em
 * `test/layout-estreito.e2e.mjs` (seção 10 para o foco, seção 12 para o email
 * na janela); aqui ficam as causas, na fonte, e a REGRA que impede o email solto
 * de voltar a qualquer tela.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (...partes: string[]) => lerFonte(join(SRC, ...partes));

function arquivosTsx(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

/**
 * Procura, no texto de uma tela, um endereço de email escrito solto no JSX
 * (`{alvo.email}`, `{x.destinatario_email}`): é o que o `EmailQuebravel` existe
 * para substituir. Atributo (`email={u.email}`, `value={email}`) não conta: o `=`
 * antes da chave o distingue de texto, e `{ email }` com espaço é desestruturação
 * de TypeScript, não JSX.
 */
export function emailsSoltosNoJsx(texto: string): string[] {
  return [...texto.matchAll(/(?<![=\w])\{[\w.?]*(?:\bemail|destinatario_email)\}/g)].map((m) => m[0]);
}

describe("Achado 2: nenhum email aparece solto em tela do painel", () => {
  it("o detector acha o email solto, e é por isso que o teste abaixo morde", () => {
    // O texto que a janela "Redefinir senha" tinha ANTES da correção 5.
    expect(emailsSoltosNoJsx('<span className="mono">{alvo.matricula}</span>, {alvo.email},{" "}'))
      .toEqual(["{alvo.email}"]);
    expect(emailsSoltosNoJsx("Tentativa {t.tentativa} para {t.destinatario_email}, por"))
      .toEqual(["{t.destinatario_email}"]);
    // O que NÃO é texto de tela: atributo e componente.
    expect(emailsSoltosNoJsx("<EmailQuebravel email={alvo.email} />")).toEqual([]);
    expect(emailsSoltosNoJsx('<input value={email} onChange={(e) => setEmail(e.target.value)} />')).toEqual([]);
  });

  it("em nenhum .tsx do painel há email escrito solto no JSX", () => {
    const soltos = arquivosTsx(SRC).flatMap((arquivo) =>
      emailsSoltosNoJsx(lerFonte(arquivo)).map((achado) => `${arquivo.replace(SRC, "src")}: ${achado}`));
    expect(soltos).toEqual([]);
  });

  it("as janelas Redefinir senha e Desativar usuário usam o EmailQuebravel", () => {
    const usuarios = fonte("paginas", "Usuarios.tsx");
    expect(usuarios).toContain("<EmailQuebravel email={alvo.email} />");
    expect(usuarios).toContain("<EmailQuebravel email={aDesativar.email} />");
  });

  it("a tentativa de envio do ofício também, dentro de um <span> só (a linha é flex)", () => {
    const ocorrencia = fonte("paginas", "Ocorrencia.tsx");
    expect(ocorrencia).toContain("<EmailQuebravel email={tentativa.destinatario_email} />");
    const li = ocorrencia.slice(ocorrencia.indexOf('<li key={tentativa.id} className="oficio__linha">'));
    expect(li.indexOf("<span>")).toBeGreaterThan(-1);
    expect(li.indexOf("<span>")).toBeLessThan(li.indexOf("<EmailQuebravel"));
    expect(li.indexOf("</span>")).toBeGreaterThan(li.indexOf("<EmailQuebravel"));
    expect(fonte("estilos", "app.css")).toMatch(/\.oficio__linha > span \{ (?:min-width: 0; )?overflow-wrap: break-word; word-break: normal; \}/);
  });

  it("a regra da dica da janela deixou de cortar em qualquer lugar (anywhere ignora o <wbr>)", () => {
    const css = fonte("estilos", "app.css");
    expect(css).toMatch(/\.modal__painel \.campo__dica \{ overflow-wrap: break-word; word-break: normal; \}/);
    expect(css).not.toMatch(/\.modal__painel \.campo__dica \{[^}]*anywhere/);
  });
});

describe("Achado 1: o foco depois do erro é levado depois do commit, e não por requestAnimationFrame", () => {
  it("o hook roda a ação em useLayoutEffect, atrás de um contador que muda junto dos outros setState", () => {
    const hook = fonte("componentes", "usar-foco.ts");
    expect(hook).toContain("export function useFocoDepoisDeRenderizar(");
    expect(hook).toMatch(/useLayoutEffect\(\(\) => \{\s+if \(pedidos > 0\) acaoAtual\.current\(\);\s+\}, \[pedidos\]\);/);
    expect(hook).toContain("setPedidos((n) => n + 1)");
    // O defeito era o quadro de animação: o hook não pode voltar a depender dele.
    expect(hook.replace(/\/\*\*[\s\S]*?\*\//g, "")).not.toMatch(/requestAnimationFrame|depoisDePintar/);
  });

  it("Minha conta e a senha provisória usam o hook, e nenhuma das duas pede o foco por rAF", () => {
    const conta = fonte("paginas", "MinhaConta.tsx");
    const entrar = fonte("paginas", "Entrar.tsx");
    for (const [nome, texto] of [["MinhaConta.tsx", conta], ["Entrar.tsx", entrar]] as const) {
      expect(texto, nome).toContain("useFocoDepoisDeRenderizar(");
      expect(texto, nome).not.toContain("depoisDePintar");
    }
    // As duas saídas de Minha conta (conferência da tela e 401 do servidor).
    expect(conta.match(/focarCampoInvalido\(\);/g)?.length).toBe(2);
    // As duas saídas da senha provisória (conferência da tela e recusa do servidor).
    expect(entrar.match(/levarOFocoAoErro\(\);/g)?.length).toBe(2);
  });

  it("o pedido de foco do catch fica no mesmo bloco síncrono dos setState (mesmo lote)", () => {
    const conta = fonte("paginas", "MinhaConta.tsx");
    const captura = conta.slice(conta.indexOf("} catch (e: unknown) {"), conta.indexOf("} finally {"));
    expect(captura).toMatch(/setErrosDeCampo\(\{ atual: daSenha \}\);\s+focarCampoInvalido\(\);/);
    expect(captura).not.toContain("await");
  });
});

describe("Achado 3 (visto nas capturas): o campo focado não fica atrás do topo de duas linhas", () => {
  it("em tela de celular o scroll-padding-top cobre as duas linhas do topo, e o de cima segue para o topo de uma linha", () => {
    // Correção 6: a folga do topo é MEDIDA (`usar-bordas-fixas.ts`), em qualquer largura; sem medida (tela pública) é só o respiro.
    const css = fonte("estilos", "app.css");
    expect(css).toMatch(/scroll-padding-top: var\(--topo-fixo-folga, var\(--ds-sp-3\)\);/);
    expect(fonte("componentes", "Estrutura.tsx")).toMatch(/useBordasFixas\(topoRef, barraRef, Boolean\(sessao\)\);/);
    // E o rótulo, uns 32 px acima do campo, também fica à vista: a margem vale para os controles do `Campo` (desde a correção 6, em qualquer largura).
    expect(css).toMatch(/\.campo input, \.campo select, \.campo textarea \{ scroll-margin-top: calc\(var\(--ds-sp-5\) \+ var\(--ds-sp-3\)\); \}/);
  });
});

describe("Achado 3, no WebKit: o foco leva o nó à vista pelo scrollIntoView", () => {
  it("foca sem o scroll do próprio focus() e rola com `nearest`, que respeita scroll-padding e scroll-margin nos três motores", () => {
    // O `focus()` sozinho deixou o campo e o rótulo atrás do topo fixo no WebKit (rótulo a 94 px, topo até 129 px).
    const chamadas: string[] = [];
    const no: NoFocavel = {
      focus: (opcoes) => { chamadas.push(`focus ${JSON.stringify(opcoes)}`); },
      scrollIntoView: (opcoes) => { chamadas.push(`scrollIntoView ${JSON.stringify(opcoes)}`); },
    };
    expect(focarPrimeiroInvalido({ querySelector: () => no })).toBe(true);
    expect(chamadas).toEqual(['focus {"preventScroll":true}', 'scrollIntoView {"block":"nearest"}']);
  });

  it("um nó que só sabe focar (como os do teste de foco) continua funcionando", () => {
    let focou = false;
    expect(focarPrimeiroInvalido({ querySelector: () => ({ focus: () => { focou = true; } }) })).toBe(true);
    expect(focou).toBe(true);
  });
});
