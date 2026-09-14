/**
 * A primitiva de campo, que não existia.
 *
 * Duas coisas se resolvem aqui, e as duas foram medidas no código.
 *
 * **A cópia.** As mesmas oito propriedades de estilo estavam escritas à mão em
 * `entrar.tsx` e em `vistoria/[id].tsx`, e há sete `TextInput` crus no
 * aplicativo. Estilo copiado não é feio, é frágil: o dia em que o raio da
 * caixa mudar, ele muda em um dos dois lugares.
 *
 * **O foco invisível.** A borda em repouso e a borda com o cursor dentro eram
 * a MESMA borda. Num formulário de vistoria com nove campos, rolado dois mil
 * pontos, o agente não tinha como saber onde o teclado ia escrever.
 *
 * E há a parte que o React Native não dá de graça. No navegador a amarração é
 * `htmlFor`, `aria-describedby` e `aria-invalid`; aqui NENHUM dos três existe.
 * Então o que lá é atributo aqui precisa entrar no texto falado, senão o
 * estado de erro passa a ser comunicado só pela borda vermelha, que é
 * exatamente o que este produto se proibiu de fazer.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, TextInput } from "react-native";

import { Campo, CampoDeTexto, dicaFalada, rotuloFalado } from "./Campo";
import { ProvedorDeTema } from "./componentes";
import { borda, foco, temaClaro, toque } from "./tokens";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

beforeEach(() => { mockEsquema = "light"; });

async function montar(no: React.ReactNode) {
  await act(async () => { await render(<ProvedorDeTema>{no}</ProvedorDeTema>); });
}

function estiloDe(testID: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;
}

describe("o que o leitor de tela ouve", () => {
  /*
    "Obrigatório" marca a exceção ao contrário do painel: numa vistoria a
    maioria dos campos é obrigatória, e anunciar a palavra em todos ensinaria o
    ouvinte a ignorá-la.
  */
  it("o rótulo fala o opcional, e cala o obrigatório", () => {
    expect(rotuloFalado({ rotulo: "Matrícula" })).toBe("Matrícula");
    expect(rotuloFalado({ rotulo: "Observação", opcional: true })).toBe("Observação, opcional");
  });

  /*
    O React Native não tem `aria-invalid`, e `accessibilityState` não tem campo
    para inválido. Sem isto, a borda vermelha seria a ÚNICA pista de que aquele
    é o campo do problema, e ela não existe para quem não vê cor.
  */
  it("o rótulo diz que o campo está com erro, porque não existe aria-invalid", () => {
    expect(rotuloFalado({ rotulo: "Matrícula", temErro: true })).toBe("Matrícula, com erro");
  });

  it("a dica fala o erro ANTES da ajuda", () => {
    // A ordem da fala é a ordem da correção: quem está consertando precisa
    // ouvir o que impede o envio, e não o texto de apoio que já ouviu.
    expect(dicaFalada({ erro: "Diga o motivo", ajuda: "Fica na trilha" }))
      .toBe("Diga o motivo. Fica na trilha");
  });

  it("sem erro e sem ajuda, não inventa dica vazia", () => {
    expect(dicaFalada({})).toBeUndefined();
  });

  it("o campo montado recebe as duas, sem ninguém escrever à mão", async () => {
    await montar(
      <CampoDeTexto
        testID="matricula" rotulo="Matrícula" valor="" aoMudar={() => undefined}
        erro="Campo obrigatório" ajuda="A que está no crachá"
      />,
    );
    const campo = screen.getByTestId("matricula");
    expect(campo.props.accessibilityLabel).toBe("Matrícula, com erro");
    expect(campo.props.accessibilityHint).toBe("Campo obrigatório. A que está no crachá");
  });
});

describe("o estado de foco, que era invisível", () => {
  it("em repouso a borda é o fio normal", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    expect(estiloDe("email")["borderWidth"]).toBe(borda.fio);
    /*
      `bordaControle`, e não `borda`. A asserção aqui afirmava a segunda, e foi
      reescrita: o portão de acessibilidade mediu `borda` sobre o cartão em
      1.30:1, contra os 3:1 que a WCAG 1.4.11 pede para o que identifica um
      componente de interação. Essa borda é a única coisa dizendo onde o campo
      começa, então ela é controle, não decoração. Ver o comentário em
      `tokens.ts`, no token.
    */
    expect(estiloDe("email")["borderColor"]).toBe(temaClaro.bordaControle);
  });

  /*
    Espessura E cor, e não só cor: espessura sobrevive ao daltonismo e ao sol
    batendo na tela, que é a situação normal deste aplicativo.
  */
  it("com o cursor dentro, a borda engrossa e muda de cor", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("email"), "focus"); });
    expect(estiloDe("email")["borderWidth"]).toBe(borda.enfase);
    expect(estiloDe("email")["borderColor"]).toBe(temaClaro.destaque);
  });

  it("ao sair, a borda volta ao repouso", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    await act(async () => { fireEvent(screen.getByTestId("email"), "focus"); });
    await act(async () => { fireEvent(screen.getByTestId("email"), "blur"); });
    expect(estiloDe("email")["borderWidth"]).toBe(borda.fio);
  });

  /*
    O anel mora FORA do controle, num irmão posicionado por cima. Engrossar a
    borda do próprio campo moveria o texto de dentro a cada foco, e texto que
    pula quando o cursor entra é pior do que foco nenhum.
  */
  it("o anel de foco é desenhado com a cor e a folga do token", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    const anel = estiloDe("email-anel-de-foco");
    expect(anel["borderColor"]).toBe(temaClaro.anelDeFoco);
    expect(anel["borderWidth"]).toBe(foco.largura);
    expect(anel["top"]).toBe(-(foco.folga + foco.largura));
  });
});

describe("erro, ajuda e alvo de toque", () => {
  it("o erro aparece na tela com marca própria, e não só em vermelho", async () => {
    await montar(
      <CampoDeTexto rotulo="Motivo" valor="" aoMudar={() => undefined} erro="Diga o motivo" />,
    );
    expect(screen.getByText("Diga o motivo")).toBeTruthy();
    // A mesma marca do `Aviso` de perigo: o erro tem forma, não só cor.
    expect(screen.getByText("×")).toBeTruthy();
  });

  it("a ajuda aparece, e não vira texto solto ao lado do campo", async () => {
    await montar(
      <CampoDeTexto rotulo="Matrícula" valor="" aoMudar={() => undefined} ajuda="A que está no crachá" />,
    );
    expect(screen.getByText("A que está no crachá")).toBeTruthy();
  });

  it("opcional diz isso no rótulo desenhado E na fala, de uma vez só", async () => {
    // As duas metades separadas divergem: rótulo dizendo "(opcional)" num
    // campo que a tela cobra, ou o contrário. Aqui saem da mesma propriedade.
    await montar(
      <CampoDeTexto testID="obs" rotulo="Observação" opcional valor="" aoMudar={() => undefined} />,
    );
    expect(screen.getByText("Observação (opcional)")).toBeTruthy();
    expect(screen.getByTestId("obs").props.accessibilityLabel).toBe("Observação, opcional");
  });

  /*
    A régua deste aplicativo é 52 e não 44: dedo em pé, na chuva, às vezes com
    luva. `vistoria/[id].tsx` tem hoje um alvo de 32 justamente porque cada
    tela mediu por conta própria.
  */
  it("o campo respeita o alvo mínimo de toque", async () => {
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    expect(estiloDe("email")["minHeight"]).toBeGreaterThanOrEqual(toque);
  });

  it("o campo de várias linhas é mais alto, e ancora o texto no topo", async () => {
    await montar(
      <CampoDeTexto testID="relato" rotulo="Relato" multilinhas valor="" aoMudar={() => undefined} />,
    );
    expect(estiloDe("relato")["minHeight"]).toBeGreaterThan(toque);
    expect(estiloDe("relato")["textAlignVertical"]).toBe("top");
  });
});

describe("a amarração chega no controle", () => {
  /*
    O conteúdo entra como FUNÇÃO, como no painel: assim não existe caminho para
    escrever o controle sem receber a amarração. Esquecer de espalhar
    `{...ligacoes}` é visível na hora, ao contrário de esquecer um atributo no
    meio de doze.
  */
  it("o estilo da caixa sai do token, e não é a tela que o escreve", async () => {
    await montar(
      <Campo rotulo="Livre">
        {(ligacoes) => <TextInput {...ligacoes} testID="livre" />}
      </Campo>,
    );
    const estilo = estiloDe("livre");
    expect(estilo["minHeight"]).toBe(toque);
    expect(estilo["borderRadius"]).toBeDefined();
    expect(estilo["backgroundColor"]).toBe(temaClaro.superficie);
  });

  it("funciona no tema escuro sem ninguém repetir a decisão", async () => {
    mockEsquema = "dark";
    await montar(<CampoDeTexto testID="email" rotulo="Email" valor="" aoMudar={() => undefined} />);
    // Cor literal não troca com o tema, e era isso que a cópia em duas telas
    // estava a um descuido de produzir.
    expect(estiloDe("email")["backgroundColor"]).not.toBe(temaClaro.superficie);
  });
});

/**
 * A correção automática precisa poder ser desligada, e o motivo é de campo.
 *
 * Perda declarada pela frente que migrou a tela de entrar: `autoCorrect` não
 * existia nesta primitiva, então o campo de email perdeu o `autoCorrect={false}`
 * que tinha antes. O contorno que sobrou é indireto: `autoComplete="email"`
 * desliga a correção no iOS, e o teclado de email a desliga no Android.
 *
 * Contorno indireto quebra quando o campo não é email. Este produto tem campo
 * de MATRÍCULA e de PROTOCOLO, que são cadeias sem significado em português: a
 * correção automática do teclado transforma "DC-0412" em outra coisa, e quem
 * digita na chuva não confere caractere a caractere. A propriedade existe no
 * `TextInput` desde sempre; o que faltava era ela atravessar a primitiva.
 *
 * Padrão LIGADO, como o do sistema: a maioria dos campos deste aplicativo é
 * texto em português (nome de quem assinou, observação do agente), e ali a
 * correção ajuda. Desligar é escolha de quem sabe que o campo não é prosa.
 */
describe("A correção automática do teclado", () => {
  it("atravessa a primitiva, para o campo que não é prosa poder desligar", async () => {
    await montar(
      <CampoDeTexto
        testID="matricula" rotulo="Matrícula" valor="" aoMudar={() => undefined}
        corrigirTexto={false}
      />,
    );
    expect(screen.getByTestId("matricula").props.autoCorrect).toBe(false);
  });

  it("sem ninguém pedir, fica como o sistema deixa", async () => {
    await montar(
      <CampoDeTexto testID="nome" rotulo="Nome" valor="" aoMudar={() => undefined} />,
    );
    expect(screen.getByTestId("nome").props.autoCorrect).toBeUndefined();
  });
});
