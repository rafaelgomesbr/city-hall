import { caixaDosPontos, projetarNoPlano } from "./pinos";

/**
 * A PROJEÇÃO DO DESENHO DE RESERVA, medida sem montar tela.
 *
 * O desenho não promete distância, e diz isso por escrito na própria tela. O
 * que ele promete é POSIÇÃO RELATIVA: quem está ao norte de quem, quem está a
 * leste de quem. É uma promessa curta, e é a única que o agente usa para montar
 * o roteiro sem sinal. Estes casos são o que impede ela de virar mentira.
 */

const FLORIPA = { latitude: -27.595378, longitude: -48.548050 };
const aoNorte = { latitude: -27.585378, longitude: -48.548050 };
const aLeste = { latitude: -27.595378, longitude: -48.538050 };

describe("a caixa que contém todos os pontos", () => {
  it("sem ponto nenhum não há caixa: é o que impede um desenho inventado", () => {
    expect(caixaDosPontos([])).toBeNull();
  });

  it("os limites são os pontos extremos, e não a média deles", () => {
    const caixa = caixaDosPontos([FLORIPA, aoNorte, aLeste]);
    expect(caixa).toEqual({
      minLat: FLORIPA.latitude,
      maxLat: aoNorte.latitude,
      minLng: FLORIPA.longitude,
      maxLng: aLeste.longitude,
    });
  });
});

describe("o norte é para cima, e o leste é para a direita", () => {
  /*
    O eixo vertical é INVERTIDO em relação à latitude, e é aqui que um sinal
    trocado passa despercebido: o desenho continua bonito, com os pinos em
    lugares plausíveis, e manda o agente para o lado oposto do morro.
  */
  it("quem tem latitude maior fica mais ACIMA no desenho", () => {
    const caixa = caixaDosPontos([FLORIPA, aoNorte])!;
    const sul = projetarNoPlano(FLORIPA, caixa);
    const norte = projetarNoPlano(aoNorte, caixa);

    expect(norte.y).toBeLessThan(sul.y);
  });

  it("quem tem longitude maior fica mais à DIREITA no desenho", () => {
    const caixa = caixaDosPontos([FLORIPA, aLeste])!;
    const oeste = projetarNoPlano(FLORIPA, caixa);
    const leste = projetarNoPlano(aLeste, caixa);

    expect(leste.x).toBeGreaterThan(oeste.x);
  });

  it("todo ponto cai dentro do desenho, com margem para o pino não ser cortado", () => {
    const caixa = caixaDosPontos([FLORIPA, aoNorte, aLeste])!;
    for (const ponto of [FLORIPA, aoNorte, aLeste]) {
      const onde = projetarNoPlano(ponto, caixa);
      expect(onde.x).toBeGreaterThan(0);
      expect(onde.x).toBeLessThan(1);
      expect(onde.y).toBeGreaterThan(0);
      expect(onde.y).toBeLessThan(1);
    }
  });
});

describe("eixo sem amplitude não vira divisão por zero", () => {
  /*
    Duas tarefas na MESMA latitude é o caso comum de uma rua só, e `NaN` num
    estilo do React Native não estoura: o elemento simplesmente não aparece. Um
    pino que some é o pior desfecho possível aqui, porque a tela continua
    parecendo certa.
  */
  it("todas na mesma latitude: o eixo vertical vira o meio", () => {
    const caixa = caixaDosPontos([FLORIPA, aLeste])!;
    expect(projetarNoPlano(FLORIPA, caixa).y).toBe(0.5);
    expect(Number.isNaN(projetarNoPlano(FLORIPA, caixa).y)).toBe(false);
  });

  it("um ponto só: os dois eixos viram o meio", () => {
    const caixa = caixaDosPontos([FLORIPA])!;
    expect(projetarNoPlano(FLORIPA, caixa)).toEqual({ x: 0.5, y: 0.5 });
  });
});
