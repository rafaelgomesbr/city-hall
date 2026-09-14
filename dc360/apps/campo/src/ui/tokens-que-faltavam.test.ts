/**
 * Os tokens que não existiam, e o que cada um impede de voltar a acontecer.
 *
 * O levantamento deste aplicativo mediu uma adesão a token quase total: 26
 * valores soltos em 3747 linhas. O que sobrava era literal POR FALTA DE ONDE
 * MORAR. Não havia token de elevação (uma sombra escrita à mão no aplicativo
 * inteiro), de easing (quatro curvas escolhidas dentro do componente), de peso
 * de fonte, de largura de borda, de opacidade, de tamanho de ícone nem de anel
 * de foco.
 *
 * O caso mais caro é o da ELEVAÇÃO, e ele tem um defeito clássico embutido:
 * sombra preta em fundo escuro não aparece. Uma escala copiada do tema claro
 * entrega, no escuro, três níveis indistinguíveis, e ninguém percebe porque
 * capturas de tela de revisão saem no tema claro.
 */

import {
  borda, easing, elevacao, foco, fonteMinima, fonte, icone, movimento, opacidade, peso,
  temaClaro, temaEscuro, type NivelDeElevacao,
} from "./tokens";

const NIVEIS: NivelDeElevacao[] = ["cartao", "flutuante", "folha"];

describe("elevação", () => {
  it("a escala sobe: cada nível projeta mais longe que o anterior", () => {
    for (const tema of [temaClaro, temaEscuro]) {
      const escala = elevacao(tema);
      for (let i = 1; i < NIVEIS.length; i++) {
        const acima = escala[NIVEIS[i]!]!;
        const abaixo = escala[NIVEIS[i - 1]!]!;
        expect(acima.shadowRadius).toBeGreaterThan(abaixo.shadowRadius);
        expect(acima.shadowOffset.height).toBeGreaterThan(abaixo.shadowOffset.height);
        // O Android ignora as quatro propriedades de sombra e lê só esta: uma
        // escala que subisse só na sombra seria plana no aparelho de campo.
        expect(acima.elevation).toBeGreaterThan(abaixo.elevation);
      }
    }
  });

  /*
    O defeito que este caso trava: escrever UMA escala de sombra e usá-la nos
    dois temas. Sobre `#101519`, uma sombra preta a 10% simplesmente não
    existe. O painel já resolve isso redefinindo `--ds-shadow-1/2/3` no bloco
    do tema escuro, e o aplicativo copia daquele arquivo.
  */
  it("no tema escuro a sombra é muito mais opaca, senão ela não existe", () => {
    for (const nivel of NIVEIS) {
      const claro = elevacao(temaClaro)[nivel];
      const escuro = elevacao(temaEscuro)[nivel];
      expect(escuro.shadowOpacity).toBeGreaterThan(claro.shadowOpacity);
      // Mais que o dobro, e não "um pouquinho mais": a diferença entre os dois
      // temas é de ordem de grandeza, não de ajuste fino.
      expect(escuro.shadowOpacity).toBeGreaterThan(claro.shadowOpacity * 2);
    }
  });

  /*
    A segunda metade da resposta. Mesmo a 60%, sombra preta sobre fundo quase
    preto é um degradê que ninguém enxerga na rua. No escuro quem carrega a
    elevação é a superfície clareando, e a sombra fica como reforço.
  */
  it("no tema escuro a peça elevada clareia, e não depende só da sombra", () => {
    const escuro = elevacao(temaEscuro);
    expect(escuro.flutuante.backgroundColor).toBe(temaEscuro.superficie2);
    expect(escuro.folha.backgroundColor).toBe(temaEscuro.superficie2);
    // E ela precisa ser mais clara que o chão da página, senão não há camada.
    expect(escuro.flutuante.backgroundColor).not.toBe(temaEscuro.fundo);
  });

  it("no tema claro a sombra é a tinta da paleta, e no escuro é preto puro", () => {
    // Preto puro sobre neutro claro lê como sujeira; sobre `#101519` é a única
    // cor que ainda escurece alguma coisa.
    expect(elevacao(temaClaro).cartao.shadowColor).not.toBe("#000000");
    expect(elevacao(temaEscuro).cartao.shadowColor).toBe("#000000");
  });

  it("o estilo sai completo e espalhável, com fundo, contorno e sombra", () => {
    // Espalhar metade produz o cartão invisível que este token existe para
    // evitar: fundo sem contorno no escuro, ou contorno sem fundo no claro.
    const nivel = elevacao(temaClaro).cartao;
    expect(nivel.backgroundColor).toBeTruthy();
    expect(nivel.borderColor).toBeTruthy();
    expect(nivel.borderWidth).toBe(borda.fio);
  });
});

describe("easing", () => {
  it("são curvas de Bézier com quatro pontos, prontas para Easing.bezier", () => {
    for (const curva of [easing.entrada, easing.saida, easing.climax]) {
      expect(curva).toHaveLength(4);
      for (const ponto of curva) expect(typeof ponto).toBe("number");
    }
  });

  /*
    O nome é a intenção e não o formato. `easing.outQuad` obrigaria quem
    escreve a tela a saber de curva; `easing.entrada` só pede que ele saiba se
    o elemento está chegando ou indo embora, que é o que ele de fato sabe.
  */
  it("os nomes dizem o que a peça está fazendo, não o formato da curva", () => {
    expect(Object.keys(easing).sort()).toEqual(["climax", "entrada", "saida"]);
  });

  it("há uma curva para cada duração de movimento, e nenhuma sobrando", () => {
    // Duração e curva são a mesma decisão partida em dois números. Escalas de
    // tamanhos diferentes produzem a combinação que ninguém escolheu.
    expect(Object.keys(easing)).toHaveLength(Object.keys(movimento).length);
  });

  /*
    O clímax é a única que PASSA do alvo e volta, e é isso que separa "o estado
    mudou" de "conseguimos". Num Bézier, o segundo ponto de controle acima de 1
    é o excesso.
  */
  it("só o clímax passa do alvo", () => {
    expect(easing.climax[1]).toBeGreaterThan(1);
    expect(easing.entrada[1]).toBeLessThanOrEqual(1);
    expect(easing.saida[1]).toBeLessThanOrEqual(1);
  });
});

describe("peso de fonte", () => {
  /*
    Três e não nove. Peso sem arquivo de fonte embarcado é peso que o Android
    NÃO sintetiza: ele cai no mais próximo, em silêncio, e a hierarquia existe
    no simulador do iOS e some no aparelho de campo.
  */
  it("são três, e os três são valores que o React Native aceita", () => {
    expect(Object.keys(peso).sort()).toEqual(["forte", "negrito", "normal"]);
    for (const valor of Object.values(peso)) expect(valor).toMatch(/^[1-9]00$/);
  });

  it("os nomes são o papel na tela, e não o número", () => {
    expect(Object.keys(peso)).not.toContain("400");
    expect(Object.keys(peso)).not.toContain("bold");
  });
});

describe("borda, opacidade, ícone e foco", () => {
  it("a borda tem três larguras, e a de ênfase é mais grossa que o fio", () => {
    // O estado de foco e o de seleção mudam a ESPESSURA, e não só a cor:
    // espessura sobrevive ao daltonismo e ao sol na tela.
    expect(borda.enfase).toBeGreaterThan(borda.fio);
    expect(borda.marca).toBeGreaterThan(borda.enfase);
  });

  it("a opacidade só nomeia estado, e o inativo é bem mais apagado que o toque", () => {
    // Botão desabilitado que parece habilitado faz o agente tocar três vezes
    // achando que o aparelho travou.
    expect(opacidade.inativo).toBeLessThan(opacidade.aoToque);
    expect(Object.keys(opacidade).sort()).toEqual(["aoToque", "inativo", "veu"]);
  });

  /*
    O tamanho do ícone é decidido pelo lugar onde ele está, porque é o lugar
    que manda: ícone ao lado de um texto precisa caber na altura daquela linha
    sem empurrar a linha de base.
  */
  it("o ícone em linha cabe na menor fonte da interface", () => {
    expect(icone.inline).toBeGreaterThanOrEqual(fonte.legenda);
    expect(icone.rotulo).toBeGreaterThanOrEqual(fonteMinima);
    expect(icone.acao).toBeLessThan(icone.vazio);
  });

  it("o anel de foco tem folga, senão ele cola no contorno da peça", () => {
    // Sem a folga, anel e borda viram um traço grosso só, e o estado de foco
    // some justamente para quem tem baixa visão.
    expect(foco.folga).toBeGreaterThan(0);
    expect(foco.largura).toBeGreaterThanOrEqual(borda.enfase);
  });

  /*
    A cor do anel NÃO é `destaque`. No claro, `destaque` é violeta 700 porque
    ele é fundo de texto branco e precisa passar em AA; o anel é contorno, sem
    texto em cima, e o painel usa violeta 600 nele.
  */
  it("o anel de foco tem cor própria em cada tema", () => {
    expect(temaClaro.anelDeFoco).toBeTruthy();
    expect(temaEscuro.anelDeFoco).toBeTruthy();
    expect(temaClaro.anelDeFoco).not.toBe(temaEscuro.anelDeFoco);
    expect(temaClaro.anelDeFoco).not.toBe(temaClaro.destaque);
  });

  it("o tema diz qual dos dois ele é, e é isso que a elevação consulta", () => {
    expect(temaClaro.escuro).toBe(false);
    expect(temaEscuro.escuro).toBe(true);
  });
});
