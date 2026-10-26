import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decidirTecla } from "../src/componentes/Modal";
import { haModalAberto, registrarModalAberto } from "../src/componentes/modais-abertos";

/**
 * A janela da senha temporária só fecha pelo botão dela (H05 e H26, decisões do
 * Rafael em 2026-10-26).
 *
 * A senha sai UMA vez: o servidor guarda só o hash. Quem fecha a janela sem ter
 * copiado ou anotado perde a única cópia, e o administrador tem de redefinir de
 * novo (o que derruba as sessões da pessoa outra vez). Por isso a janela não
 * fecha por clique fora (já era assim) e, desde esta decisão, também não fecha
 * por Esc. As demais janelas do painel continuam fechando por Esc.
 *
 * O que se prova aqui é a decisão de teclado e a ligação dela com a tela. O Esc
 * de verdade no navegador (com o foco no painel e com o foco no `<body>`) está
 * em `layout-estreito.e2e.mjs`, seção 8.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const lerFonte = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");
const USUARIOS = lerFonte("paginas", "Usuarios.tsx");
const MODAL = lerFonte("componentes", "Modal.tsx");

const paradas = ["copiar", "anotei"];

describe("O Esc na janela que não pode fechar por ele (H05)", () => {
  it("por padrão o Esc fecha, como em toda janela do painel", () => {
    expect(decidirTecla({ tecla: "Escape", comShift: false, focaveis: paradas, ativo: "copiar" }))
      .toEqual({ acao: "fechar" });
  });

  it("com fecharComEscape falso o Esc não fecha: a tecla segue e nada acontece", () => {
    expect(decidirTecla({
      tecla: "Escape", comShift: false, focaveis: paradas, ativo: "copiar", fecharComEscape: false,
    })).toEqual({ acao: "seguir" });
    // Com o foco fora da janela (no `<body>`) também não.
    expect(decidirTecla({
      tecla: "Escape", comShift: false, focaveis: paradas, ativo: null, fecharComEscape: false,
    })).toEqual({ acao: "seguir" });
  });

  it("a armadilha de foco continua inteira na janela que recusa o Esc", () => {
    const mover = (ativo: string, comShift: boolean) => decidirTecla({
      tecla: "Tab", comShift, focaveis: paradas, ativo, fecharComEscape: false,
    });
    expect(mover("anotei", false)).toEqual({ acao: "mover", alvo: "copiar" });
    expect(mover("copiar", true)).toEqual({ acao: "mover", alvo: "anotei" });
  });

  it("o Esc recusado vale também para o ouvinte do documento, e o Modal recebe a opção com padrão verdadeiro", () => {
    expect(MODAL).toContain("fecharComEscape = true");
    expect(MODAL).toContain("fecharComEscape?: boolean;");
    expect(MODAL).toContain("fecharComEscapeAtual.current = fecharComEscape;");
    expect(MODAL).toContain("tratarTecla(evento, painel.current, aoFecharAtual.current, fecharComEscapeAtual.current)");
    expect(MODAL).toContain("tratarTecla(evento, painel.current, aoFechar, fecharComEscape)");
  });

  it("só a janela da senha temporária recusa o Esc: as confirmações e o resto do painel continuam fechando", () => {
    const aSenha = USUARIOS.slice(USUARIOS.indexOf('titulo="Senha temporária"') - 200, USUARIOS.indexOf('titulo="Senha temporária"') + 400);
    expect(aSenha).toContain("fecharComEscape={false}");
    expect(aSenha).toContain("fecharAoClicarFora={false}");
    expect(aSenha).toContain("mostrarBotaoFechar={false}");
    // Nenhum outro uso do Modal ou da confirmação pede para recusar o Esc.
    const outros = [
      lerFonte("componentes", "ConfirmarAcao.tsx"),
      lerFonte("paginas", "Ocorrencia.tsx"),
      lerFonte("paginas", "MinhaConta.tsx"),
    ].join("\n");
    expect(outros).not.toContain("fecharComEscape");
    expect(USUARIOS.match(/fecharComEscape=\{false\}/g)?.length).toBe(1);
  });

  it("a única saída da janela é o botão que diz que a senha foi anotada", () => {
    expect(USUARIOS).toMatch(/<button type="button" className="botao botao--primario" onClick=\{aoFechar\}>\s+Já anotei a senha/);
  });
});

describe("O aviso passageiro não cobre a janela da senha temporária (H26)", () => {
  const TOAST = lerFonte("componentes", "Toast.tsx");

  it("a janela aberta avisa o contador, e o contador volta a zero quando ela fecha", () => {
    expect(haModalAberto()).toBe(false);
    const desfazer = registrarModalAberto();
    expect(haModalAberto()).toBe(true);
    desfazer();
    expect(haModalAberto()).toBe(false);
  });

  it("o Modal registra a abertura ANTES de interditar o fundo, e libera ao fechar", () => {
    const registro = MODAL.indexOf("const liberarAvisos = registrarModalAberto();");
    expect(registro).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(MODAL.indexOf("const restaurar = interditarFundo("));
    expect(MODAL).toContain("liberarAvisos();");
  });

  it("com janela aberta o aviso não é desenhado, então não há texto dele para receber o toque, e o relógio para", () => {
    expect(TOAST).toContain("const esperandoJanela = useHaModalAberto();");
    expect(TOAST).toMatch(/if \(esperandoJanela\) return null;/);
    expect(TOAST).toContain("duracaoComPausa(duracao, interagindo || esperandoJanela)");
  });

  it("a tela de Usuários mantém o aviso montado enquanto a janela está aberta (ele espera, não se perde)", () => {
    expect(USUARIOS).toMatch(/\{aviso && <Toast tom="sucesso" mensagem=\{aviso\} aoFechar=\{\(\) => setAviso\(null\)\} \/>\}/);
  });
});
