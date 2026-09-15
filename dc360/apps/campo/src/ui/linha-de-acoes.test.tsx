import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { View } from "react-native";

import {
  Aviso, Botao, LinhaDeAcoes, ProvedorDeTema,
  cabemLadoALado, larguraDoRotulo, larguraNecessariaDoBotao, varianteQueCabe,
} from "./componentes";
import { espaco, fonte, icone, temaClaro, toque } from "./tokens";

/**
 * O PAR DE BOTÕES QUE NÃO CABIA, E O RÓTULO QUE QUEBRAVA DENTRO DELE.
 *
 * A reclamação de quem paga, na letra: "tem uns btns bagunçados, confirmar
 * assinatura zuado, btn com o texto quebrado dentro", e "tem um btn ver o que
 * falta lá embaixo também, bugado pra caralho, torto".
 *
 * Os três defeitos, cada um com a causa medida:
 *
 * 1. **"Confirmar assinatura" quebrava em duas linhas.** Em `ui/Assinatura.tsx`
 *    ele tinha `flex: 2` contra o `flex: 1` do "Limpar", dentro de um `Cartao`
 *    que come 32 pontos de recuo, dentro de um `ScrollView` que come outros 32.
 *    Sobravam cerca de 177 pontos úteis para vinte e um caracteres. Como o
 *    `Botao` usa `minHeight` e não `height`, ele CRESCIA em altura e ficava
 *    mais alto que o vizinho: dois botões lado a lado com alturas diferentes.
 * 2. **O `Botao` não tinha nenhuma proteção contra texto que não cabe.** Sem
 *    número de linhas, sem redução de fonte, sem largura mínima. Qualquer
 *    rótulo longo dentro de um alvo estreito quebrava, e nada reprovava.
 * 3. **A ação do `Aviso` não se alinhava com borda nenhuma.** Ela morava dentro
 *    da coluna de texto, que começa depois do ícone de largura fixa mais o
 *    `gap`, ou seja, 32 pontos para dentro; e ainda levava `alignSelf:
 *    "flex-start"` com um `paddingHorizontal` menor que o dos outros botões.
 *
 * E havia TRÊS convenções diferentes no código para pôr dois botões numa
 * linha: `View` com `flex:1` em volta, `estilo={{flex:1}}` no próprio botão, e
 * `flex` dentro de um `Tocavel` desenhado à mão. `LinhaDeAcoes` existe para
 * substituir as três por uma, com a regra escrita em vez de decidida por tela.
 */

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

/** Diz ao componente qual largura ele recebeu, que é o que o `onLayout` faz no aparelho. */
async function medir(testID: string, largura: number) {
  await act(async () => {
    fireEvent(screen.getByTestId(testID), "layout", {
      nativeEvent: { layout: { width: largura, height: toque, x: 0, y: 0 } },
    });
  });
}

/** O estilo de um elemento, com os arranjos aninhados do React Native achatados. */
function estiloDe(testID: string): Record<string, unknown> {
  return Object.assign({}, ...[screen.getByTestId(testID).props.style].flat(9));
}

/*
  A largura de um `Cartao` dentro do `ScrollView` da vistoria, num aparelho de
  390 pontos: 390 menos 32 do recuo da rolagem menos 32 do recuo do cartão. É a
  medida exata em que o defeito relatado acontece.
*/
const DENTRO_DO_CARTAO = 326;

/* ============================================================
   1. A régua: quanto um rótulo ocupa
   ============================================================ */

describe("a largura estimada de um rótulo", () => {
  it("cresce com o texto e com o tamanho da fonte", () => {
    expect(larguraDoRotulo("Limpar", fonte.corpo))
      .toBeLessThan(larguraDoRotulo("Confirmar assinatura", fonte.corpo));
    expect(larguraDoRotulo("Confirmar assinatura", fonte.corpoP))
      .toBeLessThan(larguraDoRotulo("Confirmar assinatura", fonte.corpo));
  });

  /*
    A estimativa não precisa ser exata, precisa ser HONESTA na faixa em que
    decide. "Confirmar assinatura" em Work Sans SemiBold de 16 mede perto de
    163 pontos no aparelho; uma régua que dissesse 100 poria o botão numa linha
    onde ele não cabe, e é exatamente esse o defeito que ela existe para pegar.
  */
  it("fica perto do que a fonte do produto desenha de verdade", () => {
    const medido = larguraDoRotulo("Confirmar assinatura", fonte.corpo);
    expect(medido).toBeGreaterThan(140);
    expect(medido).toBeLessThan(190);
  });

  it("o `m` é mais largo que o `i`, senão a régua não mede letra nenhuma", () => {
    expect(larguraDoRotulo("mmmm", fonte.corpo))
      .toBeGreaterThan(larguraDoRotulo("iiii", fonte.corpo) * 2);
  });

  it("texto vazio não ocupa nada", () => {
    expect(larguraDoRotulo("", fonte.corpo)).toBe(0);
  });
});

describe("a largura que um botão inteiro precisa", () => {
  it("soma o recuo horizontal dos dois lados ao rótulo", () => {
    expect(larguraNecessariaDoBotao({ titulo: "Limpar" }, fonte.corpo))
      .toBeCloseTo(larguraDoRotulo("Limpar", fonte.corpo) + espaco.e4 * 2, 5);
  });

  it("o ícone e o espaço dele entram na conta", () => {
    const sem = larguraNecessariaDoBotao({ titulo: "Abrir no mapa" }, fonte.corpo);
    const com = larguraNecessariaDoBotao(
      { titulo: "Abrir no mapa", comIcone: true }, fonte.corpo,
    );
    expect(com - sem).toBeCloseTo(icone.rotulo + espaco.e2, 5);
  });
});

/* ============================================================
   2. A regra escrita: dois na linha só quando os dois cabem
   ============================================================ */

describe("dois botões na mesma linha", () => {
  it("'Limpar' e 'Confirmar assinatura' NÃO cabem, então empilham", () => {
    expect(cabemLadoALado(
      { titulo: "Limpar" },
      { titulo: "Confirmar assinatura" },
      DENTRO_DO_CARTAO,
    )).toBe(false);
  });

  it("dois rótulos curtos cabem", () => {
    expect(cabemLadoALado(
      { titulo: "Corrigir" },
      { titulo: "Concluir vistoria" },
      358,
    )).toBe(true);
  });

  /*
    A regra é sobre OS DOIS. Um rótulo curto ao lado de um que não cabe continua
    sendo uma linha que não cabe, porque os dois dividem a largura em metades
    iguais: é isso que o `flex: 1` de cada lado faz.
  */
  it("um só que não cabe já derruba a linha inteira", () => {
    expect(cabemLadoALado(
      { titulo: "Ok" },
      { titulo: "Voltar para a lista de tarefas de hoje" },
      DENTRO_DO_CARTAO,
    )).toBe(false);
  });

  /*
    A largura ainda não medida é ZERO, e zero empilha. É o lado seguro: uma
    linha que nasce em pé e vira coluna mostraria, por um quadro, dois rótulos
    partidos ao meio; uma coluna que vira linha mostra, por um quadro, dois
    botões inteiros.
  */
  it("sem largura medida ainda, empilha", () => {
    expect(cabemLadoALado({ titulo: "Sim" }, { titulo: "Não" }, 0)).toBe(false);
  });

  it("a mesma dupla cabe num aparelho largo e não cabe num estreito", () => {
    const mapa = { titulo: "Abrir no mapa", comIcone: true } as const;
    const sair = { titulo: "Salvar e sair" } as const;
    expect(cabemLadoALado(mapa, sair, 366)).toBe(true);
    expect(cabemLadoALado(mapa, sair, DENTRO_DO_CARTAO)).toBe(false);
  });
});

/* ============================================================
   3. A peça: `LinhaDeAcoes`
   ============================================================ */

describe("LinhaDeAcoes", () => {
  const ASSINATURA = [
    { titulo: "Limpar", onPress: () => {}, tipo: "secundario" as const, testID: "um" },
    { titulo: "Confirmar assinatura", onPress: () => {}, testID: "dois" },
  ] as const;

  const MINUTA = [
    { titulo: "Corrigir", onPress: () => {}, tipo: "secundario" as const, testID: "um" },
    { titulo: "Concluir vistoria", onPress: () => {}, testID: "dois" },
  ] as const;

  it("empilha quando os dois rótulos não cabem lado a lado", async () => {
    await montar(<LinhaDeAcoes testID="par" acoes={ASSINATURA} />);
    await medir("par", DENTRO_DO_CARTAO);
    expect(estiloDe("par").flexDirection).toBe("column");
  });

  it("põe os dois na mesma linha quando os dois cabem", async () => {
    await montar(<LinhaDeAcoes testID="par" acoes={MINUTA} />);
    await medir("par", 358);
    expect(estiloDe("par").flexDirection).toBe("row");
  });

  /*
    Empilhados, os dois ocupam a largura inteira, e é por isso que eles ficam
    alinhados: quem empilha e deixa cada botão com a largura do próprio texto
    produz duas bordas diferentes, uma embaixo da outra, que é a definição de
    torto.
  */
  it("empilhado, nenhum dos dois leva `flex`", async () => {
    await montar(<LinhaDeAcoes testID="par" acoes={ASSINATURA} />);
    await medir("par", DENTRO_DO_CARTAO);
    expect(estiloDe("um").flex).toBeUndefined();
    expect(estiloDe("dois").flex).toBeUndefined();
  });

  it("em linha, os dois dividem a largura em partes iguais", async () => {
    await montar(<LinhaDeAcoes testID="par" acoes={MINUTA} />);
    await medir("par", 358);
    expect(estiloDe("um").flex).toBe(1);
    expect(estiloDe("dois").flex).toBe(1);
  });

  it("cada ação continua chamando o que foi pedido", async () => {
    const toques: string[] = [];
    await montar(
      <LinhaDeAcoes
        testID="par"
        acoes={[
          { titulo: "Limpar", onPress: () => toques.push("limpou"), tipo: "secundario" },
          { titulo: "Confirmar assinatura", onPress: () => toques.push("confirmou") },
        ]}
      />,
    );
    await act(async () => { fireEvent.press(screen.getByText("Confirmar assinatura")); });
    expect(toques).toEqual(["confirmou"]);
  });

  it("carregando e desabilitado atravessam até o botão", async () => {
    await montar(
      <LinhaDeAcoes
        testID="par"
        acoes={[
          { titulo: "Limpar", onPress: () => {}, tipo: "secundario", desabilitado: true, testID: "um" },
          { titulo: "Confirmar assinatura", onPress: () => {}, carregando: true, testID: "dois" },
        ]}
      />,
    );
    expect(screen.getByTestId("um").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("dois").props.accessibilityState.busy).toBe(true);
  });
});

/* ============================================================
   4. O botão que protege o próprio rótulo
   ============================================================ */

describe("o rótulo do botão", () => {
  it("nunca passa de uma linha", async () => {
    await montar(<Botao titulo="Confirmar assinatura" onPress={() => {}} testID="b" />);
    expect(screen.getByText("Confirmar assinatura").props.numberOfLines).toBe(1);
  });

  /*
    A redução é de um DEGRAU da escala, e não de um número escolhido na hora.
    `tokens.ts` recusa um 17 entre o 16 e o 18 com a razão escrita ("três
    tamanhos dentro de dois pontos produzem a tela em que tudo tem o mesmo
    peso"), e a mesma razão vale entre o 16 e o 14. O piso é
    `fonteMinimaDeInteracao`, que é o que este produto declara para o texto que
    se TOCA, e rótulo de botão é o texto que mais se toca no aplicativo.
  */
  it("a redução é do `corpo` para o `corpoP`, e para aí", () => {
    expect(varianteQueCabe("Confirmar assinatura", 400)).toBe("corpo");
    expect(varianteQueCabe("Confirmar assinatura", 120)).toBe("corpoP");
    expect(varianteQueCabe("Confirmar assinatura", 10)).toBe("corpoP");
  });

  it("largura ainda não medida não encolhe nada", () => {
    expect(varianteQueCabe("Confirmar assinatura", 0)).toBe("corpo");
  });

  /*
    A régua erra para os dois lados em até uns 8%, e o botão que dimensiona pela
    própria palavra é justamente onde o disponível ENCOSTA no necessário. Sem a
    folga, todo botão desse formato (o "Por que não aqui?" do perfil, o ato do
    aviso da lista de tarefas) encolheria para 14 sem nenhum motivo.
  */
  it("não encolhe por causa do erro da própria régua", () => {
    const naMedida = larguraDoRotulo("Tentar de novo", fonte.corpo);
    expect(varianteQueCabe("Tentar de novo", naMedida)).toBe("corpo");
    expect(varianteQueCabe("Tentar de novo", naMedida * 0.95)).toBe("corpo");
  });

  /*
    A medida é do RÓTULO e não do botão, e é por isso que o teste mede
    `b-rotulo`. Medir o botão e descontar o recuo erra em todo botão que
    sobrescreve o recuo, e o produto tem dois desses.
  */
  it("encolhe de verdade quando sobra pouco espaço para o texto", async () => {
    await montar(<Botao titulo="Confirmar assinatura" onPress={() => {}} testID="b" />);
    await medir("b-rotulo", 120);
    expect(screen.getByText("Confirmar assinatura").props.style.fontSize).toBe(fonte.corpoP);
  });

  it("não encolhe quando o texto tem espaço de sobra", async () => {
    await montar(<Botao titulo="Confirmar assinatura" onPress={() => {}} testID="b" />);
    await medir("b-rotulo", 288);
    expect(screen.getByText("Confirmar assinatura").props.style.fontSize).toBe(fonte.corpo);
  });

  /*
    Cortado na tela, o rótulo continua INTEIRO para quem ouve. É o que a
    `descricao` já fazia, e é o que precisa continuar valendo agora que o texto
    desenhado pode terminar em reticências.
  */
  it("cortado na tela, continua inteiro no leitor de tela", async () => {
    await montar(
      <Botao
        titulo="Confirmar assinatura"
        descricao="Confirmar a assinatura de quem estava no local"
        onPress={() => {}}
        testID="b"
      />,
    );
    await medir("b-rotulo", 60);
    expect(screen.getByLabelText("Confirmar a assinatura de quem estava no local")).toBeTruthy();
  });

  it("sem `descricao`, o rótulo inteiro é o que o leitor de tela recebe", async () => {
    await montar(<Botao titulo="Confirmar assinatura" onPress={() => {}} testID="b" />);
    await medir("b-rotulo", 60);
    expect(screen.getByLabelText("Confirmar assinatura")).toBeTruthy();
  });

  it("o alvo continua em 52, encolhendo ou não", async () => {
    await montar(<Botao titulo="Confirmar assinatura" onPress={() => {}} testID="b" />);
    await medir("b-rotulo", 60);
    expect(estiloDe("b").minHeight).toBe(toque);
  });

  it("aceita um ícone antes do rótulo, e o rótulo continua escrito", async () => {
    await montar(
      <Botao
        titulo="Abrir no mapa"
        onPress={() => {}}
        testID="b"
        icone={(cor) => <View testID="desenho" style={{ backgroundColor: cor }} />}
      />,
    );
    expect(screen.getByTestId("desenho")).toBeTruthy();
    expect(screen.getByText("Abrir no mapa")).toBeTruthy();
  });

  /*
    O ícone recebe a cor do texto do botão, como o `simbolo` do `Chip`: uma
    segunda cópia do mapa de cores fora daqui é o dia em que o tom muda e o
    desenho fica com a cor antiga, sem nada acusar.
  */
  it("o ícone recebe a cor do texto do botão", async () => {
    const cores: string[] = [];
    await montar(
      <Botao
        titulo="Abrir no mapa"
        onPress={() => {}}
        tipo="secundario"
        icone={(cor) => { cores.push(cor); return <View />; }}
      />,
    );
    expect(cores).toHaveLength(1);
    expect(cores[0]).toBe(temaClaro.texto);
  });
});

/* ============================================================
   5. A ação do aviso, que estava torta
   ============================================================ */

describe("a ação do aviso", () => {
  it("deixa de encolher até o próprio texto e usa o recuo dos outros botões", async () => {
    await montar(
      <Aviso tom="alerta" titulo="Faltam 3 itens para concluir" acao={{
        titulo: "Ver o que falta", onPress: () => {}, testID: "acao",
      }}>
        A lista está no alto desta tela.
      </Aviso>,
    );

    const estilo = estiloDe("acao");
    /*
      `alignSelf: "flex-start"` era metade do torto: ele fazia o botão encolher
      até o próprio texto, e aí a borda direita dele não coincidia com nada.
    */
    expect(estilo.alignSelf).toBeUndefined();
    /*
      E o recuo horizontal era `espaco.e3`, quatro pontos menor que o dos outros
      botões do produto. Dois botões vizinhos com recuos diferentes é a outra
      metade.
    */
    expect(estilo.paddingHorizontal).toBe(espaco.e4);
  });

  /*
    A coluna de texto começa depois do ícone de largura fixa mais o `gap`, ou
    seja, 32 pontos para dentro. Com a ação DENTRO dela, o botão herdava esse
    deslocamento, que é o que ninguém conseguia explicar olhando a tela.
  */
  it("a ação não é mais filha da coluna de texto do aviso", async () => {
    await montar(
      <Aviso tom="alerta" titulo="Falta 1 item" acao={{
        titulo: "Ver o que falta", onPress: () => {}, testID: "acao",
      }}>
        corpo do aviso
      </Aviso>,
    );
    /*
      A coluna de texto não tem `testID` e não vai ganhar um: ela é achada
      subindo UMA camada a partir do próprio corpo do aviso, que é o único
      filho que ela sempre tem.
    */
    const coluna = screen.getByText("corpo do aviso").parent!;
    expect(within(coluna).queryByTestId("acao")).toBeNull();
    expect(screen.getByTestId("acao")).toBeTruthy();
  });

  it("o aviso sem ação continua exatamente o que era", async () => {
    await montar(<Aviso tom="info">Nada a fazer aqui</Aviso>);
    expect(screen.getByText("Nada a fazer aqui")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a ação continua sendo tocável e continua chamando o que foi pedido", async () => {
    const toques: string[] = [];
    await montar(
      <Aviso tom="alerta" acao={{
        titulo: "Ver o que falta", onPress: () => toques.push("foi"), testID: "acao",
      }}>
        corpo
      </Aviso>,
    );
    await act(async () => { fireEvent.press(screen.getByTestId("acao")); });
    expect(toques).toEqual(["foi"]);
  });
});
