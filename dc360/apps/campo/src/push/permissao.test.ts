import { frasesDoEstado, ofereceAjustes, proximoPasso, type EstadoDaPermissao } from "./permissao";

/**
 * Quando pedir permissão de notificação.
 *
 * No iOS a recusa é DEFINITIVA: a caixa do sistema aparece uma vez por
 * instalação e, depois de um "não", `requestPermissionsAsync` volta negada na
 * hora, sem desenhar nada. O único caminho de volta são os ajustes do sistema.
 *
 * Por isso o momento do pedido é a decisão mais cara desta parte do produto, e
 * o portão que estes casos travam é um só: **nunca antes do primeiro login**.
 * Pedir na primeira abertura é pedir a alguém que ainda não sabe o que está
 * autorizando, e o agente que recusa ali nunca mais recebe aviso de prazo, sem
 * que ninguém descubra, porque do lado do servidor a entrega continua sendo bem
 * sucedida.
 */

const TODOS: EstadoDaPermissao[] = ["concedida", "negada", "nao_perguntada", "indisponivel"];

it("NUNCA pergunta antes do primeiro login, em nenhum estado do sistema", () => {
  for (const estado of TODOS) {
    expect(proximoPasso({ estado, temSessao: false, jaConvidou: false })).toBe("nada");
    expect(proximoPasso({ estado, temSessao: false, jaConvidou: true })).toBe("nada");
  }
});

it("convida depois do primeiro login, quando o sistema ainda não perguntou", () => {
  expect(
    proximoPasso({ estado: "nao_perguntada", temSessao: true, jaConvidou: false }),
  ).toBe("convidar");
});

/*
  Convite mostrado é convite gasto. Repetir a cada abertura é o que ensina a
  pessoa a tocar "não" por reflexo, e no iOS basta ela errar uma vez tocando na
  caixa do SISTEMA para perder a permissão para sempre.
*/
it("não insiste: o convite acontece uma vez só", () => {
  expect(
    proximoPasso({ estado: "nao_perguntada", temSessao: true, jaConvidou: true }),
  ).toBe("nada");
});

/*
  Recusado NÃO vira convite. A caixa do sistema não abriria de novo, então o
  botão prometeria uma tela que não aparece, e a pessoa concluiria que o
  aplicativo está quebrado.
*/
it("não convida quem já recusou: para esse caso existe o caminho dos ajustes", () => {
  expect(proximoPasso({ estado: "negada", temSessao: true, jaConvidou: false })).toBe("nada");
  expect(ofereceAjustes("negada")).toBe(true);
});

it("não incomoda quem já concedeu nem quem não tem push neste aparelho", () => {
  expect(proximoPasso({ estado: "concedida", temSessao: true, jaConvidou: false })).toBe("nada");
  expect(proximoPasso({ estado: "indisponivel", temSessao: true, jaConvidou: false })).toBe("nada");
  expect(ofereceAjustes("concedida")).toBe(false);
  expect(ofereceAjustes("nao_perguntada")).toBe(false);
  expect(ofereceAjustes("indisponivel")).toBe(false);
});

/*
  Não receber push não é defeito do aplicativo, e chamar de erro faria o agente
  ligar para a coordenação por causa de uma escolha dele mesmo. As quatro frases
  precisam existir e nenhuma pode falar em erro ou falha.
*/
it("explica os quatro estados sem chamar nenhum deles de erro", () => {
  for (const estado of TODOS) {
    const { titulo, texto } = frasesDoEstado(estado);
    expect(titulo.length).toBeGreaterThan(0);
    expect(texto.length).toBeGreaterThan(20);
    expect(texto.toLowerCase()).not.toContain("erro");
    expect(texto.toLowerCase()).not.toContain("falha");
  }
});

/*
  Quem recusou precisa ler, na própria frase, qual é o caminho de volta: ele
  está nos ajustes do APARELHO, e não em lugar nenhum do aplicativo.
*/
it("diz a quem recusou onde fica o caminho de volta", () => {
  expect(frasesDoEstado("negada").texto.toLowerCase()).toContain("ajustes");
});
