import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Avatar, TAMANHO_DO_AVATAR, iniciaisDe } from "./Avatar";
import { ProvedorDeTema } from "./componentes";
import { raio, toque } from "./tokens";

/**
 * O avatar: um círculo com a foto, ou com as iniciais quando não há foto.
 *
 * Ele nasceu da inicial que a tela de perfil já desenhava para cada colega
 * ("com dez nomes empilhados, a inicial é o que permite achar o colega
 * procurado sem ler a lista inteira"), e virou peça quando a foto entrou. O
 * que estes casos travam: as iniciais continuam sendo duas; a foto substitui
 * as iniciais e NÃO as esconde para sempre (uma URL assinada que venceu cai
 * de volta nas iniciais, em vez de num círculo vazio); e os três tamanhos são
 * os três combinados, com o do meio cabendo no alvo de toque.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

async function montar(elemento: React.ReactElement): Promise<void> {
  await render(<ProvedorDeTema>{elemento}</ProvedorDeTema>);
  await act(async () => {});
}

describe("as iniciais", () => {
  it("são a primeira letra do primeiro e do último nome", () => {
    expect(iniciaisDe("Maria Souza")).toBe("MS");
    expect(iniciaisDe("Diego Nakamura Alves")).toBe("DA");
    expect(iniciaisDe("Carlos")).toBe("C");
  });

  it("nome vazio vira interrogação, e não círculo em branco", () => {
    expect(iniciaisDe("")).toBe("?");
    expect(iniciaisDe("   ")).toBe("?");
  });
});

describe("sem foto", () => {
  it("desenha as iniciais, escondidas do leitor de tela porque o nome está ao lado", async () => {
    await montar(<Avatar nome="Maria Souza" fotoUri={null} tamanho="pequeno" />);
    expect(screen.queryByText("MS")).toBeNull();
    expect(screen.getByText("MS", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("com foto", () => {
  it("desenha a imagem no lugar das iniciais", async () => {
    await montar(<Avatar nome="Maria Souza" fotoUri="file:///foto.jpg" tamanho="medio" testID="avatar" />);
    const imagem = screen.getByTestId("avatar-foto", { includeHiddenElements: true });
    expect(imagem.props.source).toEqual({ uri: "file:///foto.jpg" });
    expect(screen.queryByText("MS", { includeHiddenElements: true })).toBeNull();
  });

  it("a imagem que não carrega devolve as iniciais, em vez de um círculo vazio", async () => {
    /*
      A URL assinada da cópia de disco já venceu quando o agente abre o perfil
      no morro. Um círculo vazio pareceria defeito; a inicial diz quem é.
    */
    await montar(<Avatar nome="Maria Souza" fotoUri="https://balde/venceu?assinatura=x" tamanho="medio" testID="avatar" />);
    const imagem = screen.getByTestId("avatar-foto", { includeHiddenElements: true });

    await act(async () => { fireEvent(imagem, "error"); });

    expect(screen.queryByTestId("avatar-foto", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("MS", { includeHiddenElements: true })).toBeTruthy();
  });

  it("quem pede fala, fala: a foto ganha rótulo com o nome", async () => {
    await montar(<Avatar nome="Maria Souza" fotoUri="file:///foto.jpg" tamanho="grande" falado />);
    expect(screen.getByLabelText("Foto de Maria Souza")).toBeTruthy();
  });
});

describe("os três tamanhos", () => {
  it("são círculos, e o do meio cabe no alvo de toque", async () => {
    expect(TAMANHO_DO_AVATAR.pequeno).toBeLessThan(TAMANHO_DO_AVATAR.medio);
    expect(TAMANHO_DO_AVATAR.medio).toBeLessThan(TAMANHO_DO_AVATAR.grande);
    expect(TAMANHO_DO_AVATAR.medio).toBe(toque);

    await montar(<Avatar nome="Maria Souza" fotoUri={null} tamanho="grande" testID="avatar" />);
    const estilo = StyleSheet.flatten(screen.getByTestId("avatar", { includeHiddenElements: true }).props.style);
    expect(estilo.width).toBe(TAMANHO_DO_AVATAR.grande);
    expect(estilo.height).toBe(TAMANHO_DO_AVATAR.grande);
    expect(estilo.borderRadius).toBe(raio.pilula);
  });
});
