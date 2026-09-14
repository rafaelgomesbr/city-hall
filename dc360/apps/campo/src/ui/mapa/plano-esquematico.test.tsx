import { act, render, screen } from "@testing-library/react-native";

import { ProvedorDeTema } from "../componentes";
import { PlanoEsquematico } from "./PlanoEsquematico";

/**
 * O MAPA DE QUANDO NÃO HÁ SINAL, e ele não é um consolo.
 *
 * O ladrilho nativo tem cache OPORTUNISTA: guarda o que já foi baixado e mais
 * nada. O trecho do morro que o agente nunca abriu COM sinal abre cinza, e é
 * exatamente ali que este aplicativo trabalha.
 *
 * Os casos abaixo protegem três coisas, e nenhuma delas é estética:
 *
 * 1. **A informação sai também em palavra.** Quem ouve a tela não vê seta
 *    nenhuma, e a regra da casa é que nada se comunica só por forma ou só por
 *    cor. A distância e o rumo precisam estar escritos.
 * 2. **Sem GPS, o desenho não inventa direção.** Uma seta apontando para cima
 *    "porque é o padrão" manda o agente andar para o norte por engano.
 * 3. **A tela diz que o desenho não é escala.** O raio é fixo: dois pontos a
 *    80 metros e dois a 3 km desenham igual. O olho acredita no desenho antes
 *    de ler o número, então o desenho precisa desmentir a si mesmo por escrito.
 */

const IMOVEL = { latitude: -27.585378, longitude: -48.548050 };
const AGENTE_AO_SUL = { latitude: -27.595378, longitude: -48.548050 };

/*
  `await render` dentro de `act`, que é como o resto deste pacote monta árvore.

  `render` desta versão da biblioteca devolve promessa, e chamar sem esperar
  deixa `screen` sem árvore nenhuma: as consultas respondem "render function
  has not been called", que parece defeito do componente e é do teste.
*/
async function desenhar(agente: typeof AGENTE_AO_SUL | null): Promise<void> {
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <PlanoEsquematico imovel={IMOVEL} agente={agente} />
      </ProvedorDeTema>,
    );
  });
}

describe("O plano esquemático diz, e não só desenha", () => {
  it("com GPS, escreve a distância e o rumo por extenso", async () => {
    await desenhar(AGENTE_AO_SUL);
    expect(
      screen.getByText("O imóvel fica a 1,1 km a norte de onde você está."),
    ).toBeTruthy();
  });

  it("escreve também a sigla e o ângulo, em fonte tabular", async () => {
    /*
      O par sigla mais ângulo é para quem confere com uma bússola na mão, e
      sai em Roboto Mono pela mesma razão do protocolo: dígito que se dita por
      rádio precisa ser inconfundível.
    */
    await desenhar(AGENTE_AO_SUL);
    expect(screen.getByText("1,1 km · rumo N (0°)")).toBeTruthy();
  });

  it("sem GPS, não inventa direção nenhuma, nem em palavra nem em traço", async () => {
    /*
      O TRAÇO é conferido junto com o texto, e a razão está colada na reversão
      que pegou isto: com `?? 0` no lugar de `?? null`, a seta passava a ser
      desenhada apontando para o norte sem GPS nenhum, e a versão anterior
      destes casos continuava verde porque só lia as frases. Uma seta apontando
      para o norte "porque é o padrão" manda o agente andar para o lado errado
      do morro, e um teste que não olha o desenho não sabe disso.
    */
    await desenhar(null);
    expect(screen.getByText(/o aparelho está procurando o GPS/)).toBeTruthy();
    expect(screen.queryByText(/rumo/)).toBeNull();
    expect(screen.queryByTestId("plano-seta")).toBeNull();
    expect(screen.queryByTestId("plano-agente")).toBeNull();
    // O imóvel continua marcado: é o único ponto que o aparelho conhece.
    expect(screen.getByTestId("plano-imovel")).toBeTruthy();
  });

  it("dentro da margem de erro do GPS, diz que chegou em vez de apontar", async () => {
    await desenhar({ latitude: IMOVEL.latitude + 0.00005, longitude: IMOVEL.longitude });
    expect(screen.getByText(/Você está no ponto informado/)).toBeTruthy();
    expect(screen.queryByText(/rumo/)).toBeNull();
  });

  it("avisa que o desenho mostra direção, e NÃO distância", async () => {
    /*
      A frase é o desmentido do próprio desenho, e é por isso que ela é um caso
      de teste e não um detalhe de texto: apagá-la transforma um diagrama
      honesto num mapa que mente de graça.
    */
    await desenhar(AGENTE_AO_SUL);
    expect(
      screen.getByText("O topo do desenho é o norte. O desenho mostra a direção, não a distância."),
    ).toBeTruthy();
  });

  it("quem ouve a tela recebe a mesma informação do desenho", async () => {
    await desenhar(AGENTE_AO_SUL);
    const desenho = screen.getByLabelText(
      "Plano esquemático. O imóvel fica a 1,1 km a norte de onde você está.",
    );
    expect(desenho).toBeTruthy();
  });

  it("com GPS, desenha a seta e o ponto do agente", async () => {
    /*
      O par do caso acima. Os dois juntos são o que prova que o desenho MUDA
      com o que o aparelho sabe: um só deles passaria com um componente que
      sempre desenha, ou com um que nunca desenha.
    */
    await desenhar(AGENTE_AO_SUL);
    expect(screen.getByTestId("plano-seta")).toBeTruthy();
    expect(screen.getByTestId("plano-agente")).toBeTruthy();
    expect(screen.getByTestId("plano-imovel")).toBeTruthy();
  });

  it("a seta aponta para o rumo calculado, e não para um lado fixo", async () => {
    /*
      O ângulo desenhado É o rumo: virar o corpo até a seta apontar para a
      frente é uma instrução que funciona, e só funciona se a geometria for
      verdade. Com o agente ao SUL do imóvel, a ponta da seta precisa estar
      ACIMA do centro do desenho, porque o topo é o norte.
    */
    await desenhar(AGENTE_AO_SUL);
    const seta = screen.getByTestId("plano-seta");
    expect(Number(seta.props.y2)).toBeLessThan(Number(seta.props.y1));
    expect(Number(seta.props.x2)).toBeCloseTo(Number(seta.props.x1), 4);
  });
});
