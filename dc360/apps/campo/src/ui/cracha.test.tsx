/**
 * O CRACHÁ NUMÉRICO, que saiu de dentro da barra de abas para ter um dono só.
 *
 * Ele nasceu em `ui/BarraDeAbas.tsx`, sem exportação, porque a barra era o
 * único lugar que desenhava número sobre ícone. O sino do cabeçalho passou a
 * ser o segundo, e dois desenhos do mesmo crachá em dois arquivos é como o
 * número da fila e o número dos avisos passam a ter tamanhos diferentes no
 * mesmo aparelho sem ninguém ter decidido isso.
 *
 * O que estes casos travam:
 *
 * 1. **O número aparece, com a cor que o chamador decidiu.** A cor é SEMÂNTICA
 *    e mora onde a contagem é feita (a fila fica vermelha quando há item com
 *    problema; o sino é âmbar porque conta outra coisa), e o crachá não a
 *    escolhe.
 * 2. **Ele é mudo para o leitor de tela.** Quem fala é o tocável inteiro, e o
 *    número já está dentro da frase dele ("Avisos, 3 por ler"). Um crachá que
 *    falasse poria "3" solto entre o rótulo e o próximo elemento.
 * 3. **Ele não tem altura fixa.** Com a fonte grande do sistema o número
 *    cresce, e uma caixa fixa o cortaria pela metade justamente para quem
 *    aumentou a fonte por precisar dela.
 */

import { act, render, screen } from "@testing-library/react-native";

import { Cracha } from "./Cracha";
import { ProvedorDeTema } from "./componentes";
import { raio } from "./tokens";

async function desenhar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

/*
  O crachá é ESCONDIDO do leitor de tela de propósito (ver o caso 2), e a
  biblioteca de teste, por padrão, não enxerga o que o leitor não enxerga. As
  buscas abaixo pedem para ver o escondido, porque o que se mede aqui é o
  desenho, e o desenho existe para o olho.
*/
const escondido = { includeHiddenElements: true };
const porTexto = (texto: string) => screen.getByText(texto, escondido);
const porId = (id: string) => screen.getByTestId(id, escondido);

describe("o crachá", () => {
  it("mostra o texto que recebe, pintado com as cores do chamador", async () => {
    await desenhar(<Cracha testID="cracha" texto="3" fundo="#123456" cor="#FEDCBA" />);

    expect(porTexto("3")).toBeTruthy();
    const caixa = porId("cracha");
    expect(caixa.props.style.backgroundColor).toBe("#123456");
    expect(porTexto("3").props.style.color).toBe("#FEDCBA");
  });

  it("é mudo para o leitor de tela: quem fala é o tocável que o carrega", async () => {
    await desenhar(<Cracha testID="cracha" texto="3" fundo="#123456" cor="#FEDCBA" />);

    const caixa = porId("cracha");
    expect(caixa.props.accessibilityElementsHidden).toBe(true);
    expect(caixa.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("é uma pílula sem altura fixa, para a fonte grande do sistema não cortar o número", async () => {
    await desenhar(<Cracha testID="cracha" texto="500+" fundo="#123456" cor="#FEDCBA" />);

    const estilo = porId("cracha").props.style;
    expect(estilo.borderRadius).toBe(raio.pilula);
    expect(estilo.height).toBeUndefined();
    expect(estilo.minHeight).toBeGreaterThan(0);
    expect(estilo.minWidth).toBeGreaterThan(0);
  });

  it("fica sobre o canto do ícone, e não ao lado dele", async () => {
    /* Ao lado, ele empurraria o rótulo e mudaria a largura da coluna toda vez
       que a fila passasse de um dígito para dois. */
    await desenhar(<Cracha testID="cracha" texto="12" fundo="#123456" cor="#FEDCBA" />);

    const estilo = porId("cracha").props.style;
    expect(estilo.position).toBe("absolute");
    expect(estilo.top).toBeLessThan(0);
    expect(estilo.left).toBeGreaterThan(0);
  });
});
