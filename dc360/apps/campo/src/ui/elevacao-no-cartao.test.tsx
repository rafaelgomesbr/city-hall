/**
 * A ELEVAÇÃO CHEGA À TELA, e não só ao arquivo de tokens.
 *
 * Este arquivo nasceu de uma mutação feita numa revisão adversarial: trocando o
 * `...elevacao(tema).cartao` do `Cartao` por um `backgroundColor` solto, ou
 * seja, apagando do produto inteiro a sombra, o contorno e a superfície elevada
 * de TODOS os cartões, os 780 testes do aplicativo continuavam verdes.
 *
 * A escala de elevação tinha seis casos, e todos os seis mediam a FUNÇÃO:
 * quantos níveis existem, se a sombra do escuro é mais opaca, se a cor da
 * sombra troca com o tema. Nenhum media o único lugar onde ela vira pixel. Um
 * token perfeitamente testado que ninguém aplica desenha exatamente nada, e
 * essa é a diferença entre o aplicativo que o Rafa reprovou ("tá muito só
 * texto") e o que a onda entregou.
 *
 * O portão de design também não pegaria: ele proíbe valor LITERAL, e trocar um
 * token por outro token não escreve literal nenhum.
 *
 * ## Por que o teste é sobre as CHAVES, e não sobre um número
 *
 * A declaração de `elevacao` em `tokens.ts` diz, com todas as letras, que o que
 * sai de lá é um estilo completo e que "espalhar metade produziria exatamente o
 * cartão invisível que este bloco existe para evitar". A razão é o tema escuro:
 * lá quem carrega a elevação é a SUPERFÍCIE (a peça elevada clareia) e a sombra
 * é reforço, então levar só a sombra deixa a peça achatada e levar só o fundo a
 * deixa sem separação. Meio estilo é o defeito, e é ele que precisa reprovar.
 *
 * As duas reversões foram executadas: com o estilo inteiro trocado por um fundo
 * solto, e com metade dele (só as três propriedades de sombra), os dois casos de
 * tema reprovam.
 */

import { StyleSheet, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

let mockEsquema: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockEsquema,
}));

import { Cartao, ProvedorDeTema } from "./componentes";
import { elevacao, temaClaro, temaEscuro, type Tema } from "./tokens";

beforeEach(() => { mockEsquema = "light"; });

async function montarCartao() {
  await act(async () => {
    await render(
      <ProvedorDeTema>
        <Cartao>
          {/* design-system: excecao, aqui não existe provedor de fonte e o que
              se mede é a caixa e não o texto. */}
          <Text testID="dentro">conteúdo</Text>
        </Cartao>
      </ProvedorDeTema>,
    );
  });
  const caixa = screen.getByTestId("dentro").parent;
  if (!caixa) throw new Error("o cartão sumiu da árvore");
  return StyleSheet.flatten(caixa.props.style) as Record<string, unknown>;
}

const OS_DOIS_TEMAS: Array<{ nome: "light" | "dark"; tema: Tema }> = [
  { nome: "light", tema: temaClaro },
  { nome: "dark", tema: temaEscuro },
];

describe("o cartão carrega a elevação inteira, nos dois temas", () => {
  it.each(OS_DOIS_TEMAS)("no tema $nome", async ({ nome, tema }) => {
    mockEsquema = nome;
    const estilo = await montarCartao();
    const esperado = elevacao(tema).cartao as unknown as Record<string, unknown>;

    /*
      Chave a chave, e não `toMatchObject` do objeto inteiro: a mensagem de
      falha precisa dizer QUAL propriedade ficou para trás, porque "meio estilo"
      é o modo de falha que este arquivo existe para pegar, e ele some numa
      comparação de objeto grande.
    */
    for (const chave of Object.keys(esperado)) {
      expect({ [chave]: estilo[chave] }).toEqual({ [chave]: esperado[chave] });
    }
  });
});

describe("a elevação é diferente nos dois temas, senão medir um mediria o outro", () => {
  /*
    Sem este caso, um `elevacao()` que ignorasse o tema passaria nos dois casos
    acima, e eles pareceriam duas provas quando seriam a mesma prova duas vezes.
    A diferença que importa é a superfície: no escuro a peça elevada clareia, e
    é isso que separa camada quando a sombra preta não aparece.
  */
  it("a superfície e a opacidade da sombra não são as mesmas nos dois", () => {
    const claro = elevacao(temaClaro).cartao;
    const escuro = elevacao(temaEscuro).cartao;
    expect(claro.backgroundColor).not.toBe(escuro.backgroundColor);
    expect(claro.shadowOpacity).not.toBe(escuro.shadowOpacity);
  });
});
