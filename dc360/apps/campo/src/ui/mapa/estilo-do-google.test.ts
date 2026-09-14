import { temaClaro, temaEscuro, violeta } from "../tokens";
import { estiloDoGoogle } from "./estilo-do-google";

/**
 * O ESTILO DO MAPA SAI DOS NOSSOS TOKENS, e este arquivo é o portão disso.
 *
 * O caminho fácil é abrir o gerador de estilos do Google, escolher cores num
 * seletor e colar o JSON. O resultado seria umas vinte cores em hexadecimal
 * escritas à mão, que não trocam com o tema e não acompanham a paleta.
 *
 * `scripts/portao-design-do-aplicativo.test.mjs` já reprova hexadecimal solto
 * em componente, então metade disso ele pega. A outra metade não: nada lá
 * impede alguém de montar o estilo inteiro com `tema.destaque`, que é token e
 * é a cor de MARCA. Um mapa roxo passaria naquele portão e mataria a
 * severidade dos pinos, que é a informação que o mapa existe para carregar.
 *
 * Os casos abaixo cobrem os dois lados: cada cor precisa ser um valor que o
 * tema declara, e nenhuma delas pode ser a violeta.
 */

const OS_DOIS_TEMAS = [
  { nome: "claro", tema: temaClaro },
  { nome: "escuro", tema: temaEscuro },
] as const;

/** Toda cor que sai do estilo, achatada em lista. */
function coresDo(tema: typeof temaClaro): string[] {
  return estiloDoGoogle(tema)
    .flatMap((regra) => regra.stylers)
    .map((styler) => styler["color"])
    .filter((valor): valor is string => typeof valor === "string");
}

describe("Nenhuma cor do mapa é inventada", () => {
  it.each(OS_DOIS_TEMAS)("no tema $nome, toda cor é um valor do próprio tema", ({ tema }) => {
    const doTema = new Set(Object.values(tema).filter((v) => typeof v === "string"));
    /*
      Lista e não booleano: quando isto reprovar, a mensagem do jest mostra
      QUAL cor entrou, e quem conserta não precisa procurar. Um `toBe(false)`
      diria só que existe alguma.
    */
    const foraDoTema = coresDo(tema).filter((cor) => !doTema.has(cor));
    expect(foraDoTema).toEqual([]);
  });

  it.each(OS_DOIS_TEMAS)("no tema $nome, a cor de MARCA não desenha território", ({ tema }) => {
    /*
      A violeta é do produto, não do território. Um mapa de base pintado com
      ela briga com o marcador de severidade, que é o que precisa ser visto
      primeiro, de relance, com o telefone na mão e a chuva na tela. E a regra
      da casa proíbe a cor de marca comunicar severidade: aqui ela a apagaria.
    */
    const daMarca = new Set<string>(Object.values(violeta));
    const roxas = coresDo(tema).filter((cor) => daMarca.has(cor));
    expect(roxas).toEqual([]);
  });

  it("os dois temas produzem mapas diferentes", () => {
    /*
      O caso que reprova se alguém ignorar o argumento e devolver um estilo
      fixo. Sem ele, um estilo escrito só para o tema claro passaria em todos
      os outros casos deste arquivo, e o mapa do tema escuro sairia branco no
      meio de uma tela preta, que é a coisa mais visível que um aplicativo de
      campo pode fazer errado às onze da noite, no morro.
    */
    expect(coresDo(temaClaro)).not.toEqual(coresDo(temaEscuro));
  });

  it("nenhuma cor vem vazia, o que o SDK leria como preto", () => {
    for (const { tema } of OS_DOIS_TEMAS) {
      for (const cor of coresDo(tema)) expect(cor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("O que o mapa mostra é o que o trabalho precisa", () => {
  it("o rótulo tem tinta E halo, senão o nome da rua some na quadra escura", () => {
    /*
      O halo é a cor do fundo desenhada por trás do texto. Sem ele o nome da
      rua desaparece exatamente onde a malha é mais densa, que é o centro, e é
      o único lugar onde ele é indispensável.
    */
    const regras = estiloDoGoogle(temaEscuro);
    const tinta = regras.find((r) => r.elementType === "labels.text.fill");
    const halo = regras.find((r) => r.elementType === "labels.text.stroke");
    expect(tinta?.stylers[0]?.["color"]).toBe(temaEscuro.texto);
    expect(halo?.stylers[0]?.["color"]).toBe(temaEscuro.fundo);
  });

  it("ponto comercial e transporte público saem, e o parque fica", () => {
    /*
      O agente procura UMA casa, e cada pictograma de padaria é uma coisa a
      mais a descartar com o olho. O parque fica porque ele é massa no
      território e serve de referência ("a casa é depois da praça"): apagá-lo
      deixaria um buraco sem explicação no desenho.
    */
    const regras = estiloDoGoogle(temaClaro);
    const desligado = (tipo: string) => regras.some(
      (r) => r.featureType === tipo && r.stylers.some((s) => s["visibility"] === "off"),
    );
    expect(desligado("poi")).toBe(true);
    expect(desligado("transit")).toBe(true);
    /* O parque continua PINTADO: é referência de orientação, e não ruído. */
    expect(
      regras.some((r) => r.featureType === "poi.park" && r.stylers.some((s) => "color" in s)),
    ).toBe(true);
  });

  it("a via tem preenchimento E contorno, senão ela some no tema claro", () => {
    /*
      No tema claro a rua é a cor de cartão sobre um terreno quase da mesma
      cor. Sem o contorno, a malha viária desaparece, e um mapa sem ruas não é
      mapa: é uma mancha clara com dois pinos.
    */
    const regras = estiloDoGoogle(temaClaro);
    const preenchimento = regras.find(
      (r) => r.featureType === "road" && r.elementType === "geometry.fill",
    );
    const contorno = regras.find(
      (r) => r.featureType === "road" && r.elementType === "geometry.stroke",
    );
    expect(preenchimento?.stylers[0]?.["color"]).toBe(temaClaro.superficie);
    expect(contorno?.stylers[0]?.["color"]).toBe(temaClaro.borda);
    expect(preenchimento?.stylers[0]?.["color"]).not.toBe(contorno?.stylers[0]?.["color"]);
  });

  it("o ícone de rodovia do Google sai, porque ele vem na paleta dele", () => {
    // Seta, faixa e brasão são desenhados pelo Google saturados, e
    // reapareceriam como as únicas manchas coloridas de uma tela neutra.
    const regras = estiloDoGoogle(temaClaro);
    expect(regras.some(
      (r) => r.featureType === "road" && r.elementType === "labels.icon"
        && r.stylers.some((s) => s["visibility"] === "off"),
    )).toBe(true);
  });
});
