/**
 * A RÉGUA DA HIERARQUIA, medida.
 *
 * `hierarquia.ts` escreve a linguagem visual da identidade 2.0 em cinco regras.
 * Este arquivo mede o que dá para medir sem montar tela, e é o irmão pobre do
 * portão de design, que mede o mesmo contra a fonte de todas as telas.
 *
 * Três dos casos aqui REPROVAM na árvore anterior a 14/09/2026, e é por isso
 * que eles existem:
 *
 * - a escala tinha `corpoG` (17) entre `corpo` (16) e `h3` (18), e o caso dos
 *   degraus visíveis reprova com os três lá dentro;
 * - `fonteMinimaDeInteracao` se chamava `fonteMinima` e não tinha um único uso
 *   no produto, só em teste, então o caso que exige o piso vivo dentro da régua
 *   nem compilava;
 * - `gradienteDeDestaque` não existia, e o aplicativo nunca usou a folga que
 *   `CLAUDE.md` autoriza desde 2026-08-20.
 */

import {
  atrasoEmCascata, degrau, PAPEL_PROTAGONISTA, SALTO_MINIMO_DE_ESCALA,
  type NivelDeHierarquia,
} from "./hierarquia";
import {
  cascata, fonte, fonteMinimaDeInteracao, gradienteDeDestaque, linha, peso, rastreio,
  temaClaro, temaEscuro,
} from "./tokens";

const NIVEIS: NivelDeHierarquia[] = ["numero", "rotulo", "titulo", "interacao", "apoio"];

/* ============================================================
   A escala, e o degrau que precisa ser VISTO
   ============================================================ */

describe("a escala tipográfica", () => {
  /*
    O caso que aposenta `corpoG`, e ele reprova na árvore anterior.

    A escala declarava oito degraus: 32, 26, 21, 18, 17, 16, 14, 12. Três deles
    cabiam dentro de dois pontos, bem no meio, que é onde vive o texto que a
    pessoa de fato lê. Hierarquia por escala precisa que o degrau seja
    percebido; um ponto de diferença não é um degrau, é ruído com nome.

    A régua é DOIS pontos e não "algum", porque dois é o menor salto que sobra
    na escala depois da correção (`corpo` 16 para `corpoP` 14).
  */
  it("nenhum degrau está a menos de dois pontos do vizinho", () => {
    const tamanhos = [...new Set(Object.values(fonte))].sort((a, b) => a - b);
    const colados: string[] = [];
    for (let i = 1; i < tamanhos.length; i++) {
      const salto = tamanhos[i]! - tamanhos[i - 1]!;
      if (salto < 2) colados.push(`${tamanhos[i - 1]} e ${tamanhos[i]}`);
    }
    expect(colados).toEqual([]);
  });

  it("cada tamanho tem a sua altura de linha, e nenhuma sobra", () => {
    // Degrau apagado sem apagar a altura dele deixa um token órfão que o portão
    // de design pega, e um valor que ninguém consegue pedir.
    expect(Object.keys(linha).sort()).toEqual(Object.keys(fonte).sort());
  });
});

/* ============================================================
   H1, H2 e H3
   ============================================================ */

describe("a régua da hierarquia", () => {
  it("todo papel declarado tem degrau, e nenhum degrau sobra", () => {
    for (const nivel of NIVEIS) expect(degrau(nivel)).toBeTruthy();
    expect(NIVEIS).toContain(PAPEL_PROTAGONISTA);
  });

  /*
    H3, refeita como conta. "Hierarquia forte" é uma frase; o dobro é um
    número. Abaixo do dobro a diferença existe no arquivo e some no aparelho,
    com sol na tela e o telefone a meio metro do rosto.
  */
  it("o protagonista é pelo menos o dobro do apoio", () => {
    const protagonista = degrau(PAPEL_PROTAGONISTA).fonte;
    expect(protagonista / degrau("apoio").fonte).toBeGreaterThanOrEqual(SALTO_MINIMO_DE_ESCALA);
    expect(protagonista / degrau("interacao").fonte).toBeGreaterThanOrEqual(SALTO_MINIMO_DE_ESCALA);
  });

  /*
    H2: o rótulo NÃO compete com o número. Ele é menor, mais apagado e em caixa
    alta, e as três coisas juntas são o que faz o olho ler o número primeiro.
    Só o tamanho não bastaria: dois textos escuros, um grande e um pequeno,
    continuam sendo dois blocos disputando.
  */
  it("o rótulo do número é menor, discreto e em caixa alta", () => {
    const rotulo = degrau("rotulo");
    const numero = degrau("numero");
    expect(rotulo.fonte).toBeLessThan(numero.fonte);
    expect(rotulo.discreto).toBe(true);
    expect(rotulo.maiuscula).toBe(true);
    expect(numero.discreto).toBe(false);
    expect(numero.maiuscula).toBe(false);
  });

  /*
    A dívida 9.3 virada dado. O piso de 14 governa o que se TOCA, e o texto de
    apoio continua podendo ser legenda (12). Enquanto isso foi uma frase em
    `tokens.ts`, ela autorizava as duas leituras, e duas frentes construíram
    duas pílulas diferentes.
  */
  it("o piso de 14 governa a interação, e o apoio continua podendo ser legenda", () => {
    expect(degrau("interacao").fonte).toBeGreaterThanOrEqual(fonteMinimaDeInteracao);
    expect(degrau("apoio").fonte).toBeLessThan(fonteMinimaDeInteracao);
    expect(degrau("apoio").fonte).toBe(fonte.legenda);
  });

  /*
    O rastreio é correção ótica das DUAS PONTAS da escala, e não enfeite. O
    número grande fecha, o rótulo pequeno em maiúscula abre, e o texto de
    leitura não leva nenhum: a fonte já foi desenhada para o tamanho dele.
  */
  it("o rastreio aperta o número grande, abre o rótulo e não toca no texto de leitura", () => {
    expect(degrau("numero").rastreio).toBe(rastreio.numeroGrande);
    expect(degrau("numero").rastreio!).toBeLessThan(0);
    expect(degrau("rotulo").rastreio).toBe(rastreio.rotuloDiscreto);
    expect(degrau("rotulo").rastreio!).toBeGreaterThan(0);
    expect(degrau("titulo").rastreio).toBeUndefined();
    expect(degrau("apoio").rastreio).toBeUndefined();
  });

  it("os pesos saem do token, e nenhum papel pede um arquivo de fonte que não existe", () => {
    const existentes = Object.values(peso);
    for (const nivel of NIVEIS) expect(existentes).toContain(degrau(nivel).peso);
  });
});

/* ============================================================
   H5: a cascata
   ============================================================ */

describe("o atraso em cascata", () => {
  it("o primeiro item não espera nada", () => {
    expect(atrasoEmCascata(0)).toBe(0);
  });

  it("cada item espera um passo a mais que o anterior", () => {
    expect(atrasoEmCascata(1)).toBe(cascata.passo);
    expect(atrasoEmCascata(3)).toBe(cascata.passo * 3);
  });

  /*
    O teto é metade da decisão. Sem ele, o vigésimo item de uma fila esperaria
    oitocentos milissegundos, e o agente que desceu o morro para conferir se o
    trabalho subiu ficaria olhando uma tela que se monta devagar por decoração.
  */
  it("do teto em diante ninguém espera mais, e a lista longa não vira espera", () => {
    const noTeto = atrasoEmCascata(cascata.teto);
    expect(atrasoEmCascata(cascata.teto + 1)).toBe(noTeto);
    expect(atrasoEmCascata(400)).toBe(noTeto);
    // E o pior caso cabe dentro de um clímax: acima disso deixa de ser entrada.
    expect(noTeto).toBeLessThanOrEqual(300);
  });

  /*
    Índice torto devolve zero em vez de estourar. Quem desenha lista erra o
    índice em algum momento, e um item entrando fora do ritmo é infinitamente
    melhor que uma tela que não aparece.
  */
  it("índice torto não derruba a tela", () => {
    expect(atrasoEmCascata(-3)).toBe(0);
    expect(atrasoEmCascata(Number.NaN)).toBe(0);
    expect(atrasoEmCascata(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

/* ============================================================
   O gradiente, que é o único do aplicativo
   ============================================================ */

/** Luminância relativa da WCAG, escrita aqui porque teste de `apps/campo` não lê arquivo. */
function luminancia(hex: string): number {
  const d = hex.replace("#", "");
  const canal = (de: number) => {
    const s = parseInt(d.slice(de, de + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

function contraste(frente: string, fundo: string): number {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

describe("o gradiente de destaque", () => {
  it("os dois pontos são tokens do tema, e nenhum é cor inventada", () => {
    for (const tema of [temaClaro, temaEscuro]) {
      const doTema = new Set([tema.destaque, tema.destaqueEscuro]);
      for (const ponto of gradienteDeDestaque(tema)) expect(doTema.has(ponto)).toBe(true);
    }
  });

  /*
    A direção é a mesma nos dois temas, e é por isso que a ordem é decidida
    dentro da função. No claro, `destaqueEscuro` é o violeta 800, mais escuro
    que o 700; no escuro é o violeta 300, mais CLARO que o 400, porque no escuro
    o que dá ênfase é clarear. Quem chamasse com os dois na mesma ordem teria um
    botão sombreado para baixo num tema e para cima no outro, e ninguém
    descobriria sem trocar de tema com o botão na tela.
  */
  it("desce do mais claro para o mais escuro nos DOIS temas", () => {
    for (const tema of [temaClaro, temaEscuro]) {
      const [inicio, fim] = gradienteDeDestaque(tema);
      expect(luminancia(inicio)).toBeGreaterThan(luminancia(fim));
    }
  });

  /*
    E ele nunca piora o contraste do que está escrito em cima. O ponto que o
    gradiente acrescenta é sempre o MAIS contrastante dos dois, então o pior
    caso do botão com gradiente é o mesmo pior caso do botão chapado, que já
    passa em AA no portão de acessibilidade.
  */
  it("o texto em cima passa em AA contra as duas pontas, nos dois temas", () => {
    for (const tema of [temaClaro, temaEscuro]) {
      for (const ponto of gradienteDeDestaque(tema)) {
        expect(contraste(tema.sobreDestaque, ponto)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("a conta de contraste é a da WCAG, e não uma aproximação", () => {
    // Prova da própria fórmula: preto sobre branco é 21:1, e branco sobre
    // branco é 1:1. Sem isto, um erro na conta daria verde para sempre.
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contraste("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});
