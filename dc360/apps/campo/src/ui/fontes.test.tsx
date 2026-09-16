/**
 * A tipografia do produto, e o que acontece quando ela não carrega.
 *
 * `CLAUDE.md` fixa Work Sans no corpo e Roboto Mono em protocolo e matrícula.
 * O painel carrega as duas; o aplicativo não carregava nenhuma e desenhava
 * tudo com a fonte do sistema, então o coordenador e o agente olhavam para o
 * mesmo chamado em dois produtos diferentes.
 *
 * O caso que este arquivo trava não é o do sucesso, é o do FRACASSO. Fonte é
 * enfeite; coleta de vistoria não é. Um aplicativo que fica preso na tela de
 * abertura porque um `.ttf` não abriu é um aplicativo que perdeu o plantão por
 * causa de uma questão estética, e o sintoma (tela de abertura eterna, sem
 * erro em lugar nenhum) é exatamente o que faz alguém matar o aplicativo no
 * meio do morro.
 */

import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

let mockCarregadas = false;
let mockErro: unknown = null;
jest.mock("expo-font", () => ({
  __esModule: true,
  useFonts: () => [mockCarregadas, mockErro],
}));

import { ProvedorDeFontes, decidirAbertura, TETO_DE_ESPERA_DA_FONTE_MS } from "./fontes";
import { Aviso, Txt, ProvedorDeTema } from "./componentes";
import { ARQUIVOS_DE_FONTE, FAMILIA_POR_PESO, PILHA_DO_SISTEMA, familiaDoTexto } from "./tipografia";
import { peso } from "./tokens";

beforeEach(() => {
  mockCarregadas = false;
  mockErro = null;
  jest.useRealTimers();
});

describe("a decisão de abrir", () => {
  it("com as fontes carregadas, abre e usa a identidade do produto", () => {
    const estado = decidirAbertura({ carregadas: true, erro: null, estourouOTeto: false });
    expect(estado).toEqual({ liberado: true, prontas: true, naReserva: false });
  });

  /*
    O desfecho que importa. `useFonts` devolve o erro e o aplicativo SEGUE, com
    a reserva do sistema. Travar aqui trocaria uma tela feia por um aplicativo
    que não abre.
  */
  it("com o carregamento falhando, abre mesmo assim e declara a reserva", () => {
    const estado = decidirAbertura({ carregadas: false, erro: new Error("ttf ilegível"), estourouOTeto: false });
    expect(estado.liberado).toBe(true);
    expect(estado.prontas).toBe(false);
    expect(estado.naReserva).toBe(true);
  });

  /*
    A terceira saída, que não é redundante: `useFonts` promete resolver em
    carregado ou em erro, e essa promessa é do módulo nativo. Um módulo que não
    responde deixa as duas bandeiras em falso para sempre, e o desfecho é a
    abertura eterna, sem nada para alguém investigar.
  */
  it("sem resposta nenhuma, o teto de tempo abre o aplicativo", () => {
    const estado = decidirAbertura({ carregadas: false, erro: null, estourouOTeto: true });
    expect(estado.liberado).toBe(true);
    expect(estado.naReserva).toBe(true);
  });

  it("enquanto a resposta não chega e o teto não estourou, a abertura espera", () => {
    const estado = decidirAbertura({ carregadas: false, erro: null, estourouOTeto: false });
    expect(estado.liberado).toBe(false);
  });

  /*
    A carga que termina no mesmo quadro em que o teto estoura está PRONTA.
    Anunciar reserva ali faria o aplicativo se declarar degradado estando
    inteiro, e o texto sairia na fonte do sistema com os arquivos registrados.
  */
  it("fonte que chega junto com o teto não é reserva", () => {
    const estado = decidirAbertura({ carregadas: true, erro: null, estourouOTeto: true });
    expect(estado.naReserva).toBe(false);
    expect(estado.prontas).toBe(true);
  });

  it("o teto é curto o bastante para não virar tela travada", () => {
    // Os arquivos são locais: o caso normal termina em dezenas de
    // milissegundos. Este número existe para o aparelho velho na primeira
    // abertura, não para o caso normal.
    expect(TETO_DE_ESPERA_DA_FONTE_MS).toBeLessThanOrEqual(3_000);
  });
});

describe("os arquivos embarcados", () => {
  it("há um arquivo para cada peso das duas pilhas, e nenhum nome inventado", () => {
    // Pedir uma família que não foi registrada faz o Android estourar. Esta é
    // a amarração entre a tabela de pesos e os arquivos que existem de fato.
    for (const pilha of Object.values(FAMILIA_POR_PESO)) {
      for (const familia of Object.values(pilha)) {
        expect(Object.keys(ARQUIVOS_DE_FONTE)).toContain(familia);
      }
    }
  });

  it("cada peso do token tem família nas duas pilhas", () => {
    for (const valor of Object.values(peso)) {
      expect(FAMILIA_POR_PESO.texto[valor]).toBeTruthy();
      expect(FAMILIA_POR_PESO.mono[valor]).toBeTruthy();
    }
  });

  it("são Work Sans e Roboto Mono, que é o que o CLAUDE.md fixa", () => {
    const nomes = Object.keys(ARQUIVOS_DE_FONTE).join(" ");
    expect(nomes).toContain("WorkSans");
    expect(nomes).toContain("RobotoMono");
  });

  /*
    Nenhum arquivo baixado. O aplicativo é usado no morro, sem sinal, e um
    produto cuja tipografia depende de rede muda de cara justamente no dia de
    temporal.
  */
  it("os arquivos são locais, e não endereço de rede", () => {
    for (const arquivo of Object.values(ARQUIVOS_DE_FONTE)) {
      expect(typeof arquivo).not.toBe("string");
    }
  });
});

describe("a reserva declarada", () => {
  /*
    Reserva declarada e não `undefined`: se a identidade cair, o texto sai numa
    família escolhida por alguém, e dá para saber qual foi olhando o estilo.
  */
  it("tem nome por plataforma, e não é o silêncio do indefinido", () => {
    expect(PILHA_DO_SISTEMA.texto).toBeTruthy();
    expect(PILHA_DO_SISTEMA.mono).toBeTruthy();
  });

  it("sem as fontes prontas, o texto cai na pilha do sistema", () => {
    expect(familiaDoTexto({ fontesProntas: false })).toBe(PILHA_DO_SISTEMA.texto);
    expect(familiaDoTexto({ mono: true, fontesProntas: false })).toBe(PILHA_DO_SISTEMA.mono);
  });

  it("com as fontes prontas, o peso escolhe o ARQUIVO e não o fontWeight", () => {
    // O erro que esta linha impede: `fontFamily: "WorkSans"` com
    // `fontWeight: "700"`. No Android isso desenha o regular, em silêncio.
    expect(familiaDoTexto({ peso: peso.negrito, fontesProntas: true })).toBe("WorkSans-Bold");
    expect(familiaDoTexto({ peso: peso.forte, fontesProntas: true })).toBe("WorkSans-SemiBold");
    expect(familiaDoTexto({ mono: true, peso: peso.normal, fontesProntas: true })).toBe("RobotoMono-Regular");
  });
});

async function montar(no: React.ReactNode) {
  await act(async () => {
    await render(<ProvedorDeTema><ProvedorDeFontes>{no}</ProvedorDeFontes></ProvedorDeTema>);
  });
}

function familiaDe(texto: string): unknown {
  return StyleSheet.flatten(screen.getByText(texto).props.style).fontFamily;
}

describe("o texto na tela", () => {
  it("com as fontes carregadas, sai na família do produto", async () => {
    mockCarregadas = true;
    await montar(<Txt>Protocolo</Txt>);
    expect(familiaDe("Protocolo")).toBe("WorkSans-Regular");
  });

  it("com o carregamento falhando, a tela ainda desenha, na reserva", async () => {
    mockErro = new Error("ttf ilegível");
    await montar(<Txt>Protocolo</Txt>);
    // O texto EXISTE: é este o ponto. Um aplicativo em branco seria pior que
    // um aplicativo na fonte do sistema.
    expect(screen.getByText("Protocolo")).toBeTruthy();
    expect(familiaDe("Protocolo")).toBe(PILHA_DO_SISTEMA.texto);
  });

  /*
    Fora do provedor (teste de unidade, tela montada isolada) o padrão é a
    reserva, e não o estado pronto: pedir família não registrada estoura no
    Android, então errar para o lado da reserva é errar para o lado que abre.
  */
  it("fora do provedor, o padrão é a reserva e não um nome que não existe", async () => {
    await act(async () => { await render(<ProvedorDeTema><Txt>Solto</Txt></ProvedorDeTema>); });
    expect(familiaDe("Solto")).toBe(PILHA_DO_SISTEMA.texto);
  });

  it("o número tabular sai em Roboto Mono, que é o que o painel usa", async () => {
    mockCarregadas = true;
    await montar(<Txt mono>000123/2026</Txt>);
    expect(familiaDe("000123/2026")).toBe("RobotoMono-Regular");
  });

  /*
    Com uma família por peso, mandar `fontWeight` junto é o erro que some no
    simulador do iOS e aparece no Android do agente.
  */
  it("com a identidade registrada, o fontWeight não vai junto", async () => {
    mockCarregadas = true;
    await montar(<Txt variante="h2">Minhas tarefas</Txt>);
    const estilo = StyleSheet.flatten(screen.getByText("Minhas tarefas").props.style);
    expect(estilo.fontFamily).toBe("WorkSans-Bold");
    expect(estilo.fontWeight).toBeUndefined();
  });

  it("na reserva, o fontWeight volta, porque lá ele é a única hierarquia", async () => {
    mockErro = new Error("sem fonte");
    await montar(<Txt variante="h2">Minhas tarefas</Txt>);
    const estilo = StyleSheet.flatten(screen.getByText("Minhas tarefas").props.style);
    expect(estilo.fontWeight).toBe(peso.negrito);
  });
});

/**
 * O BURACO QUE A IDENTIDADE DEIXOU, e ele não estava numa tela.
 *
 * Quem resolve a família de fonte é o `Txt`, chamando `familiaDoTexto`. Quem
 * desenha com um `<Text>` cru fica DE FORA disso, sem erro e sem aviso: o React
 * Native simplesmente usa a fonte do sistema. Quando a tipografia do produto
 * entrou no aplicativo, três textos ficaram para trás, todos dentro de
 * `componentes.tsx`, e dois deles estavam no `Aviso`.
 *
 * O `Aviso` aparece 25 vezes no aplicativo. O efeito não é sutil e não é de
 * gosto: o cartão inteiro sai em Work Sans e o texto do aviso dentro dele sai
 * em San Francisco, com outro desenho de letra, outra largura e outra altura de
 * x, na mesma tela e a poucos pontos de distância. É o defeito que a
 * tipografia do produto foi embarcada para corrigir, sobrevivendo dentro da
 * peça que mais aparece.
 *
 * O terceiro era o `Selo`, e ele foi aposentado noutro achado desta mesma
 * revisão.
 */
describe("nenhuma peça do produto desenha fora da família", () => {
  it("o texto do aviso sai na fonte do produto, e não na do sistema", async () => {
    mockCarregadas = true;
    await montar(<Aviso tom="alerta">Sem sinal há duas horas</Aviso>);
    expect(familiaDe("Sem sinal há duas horas")).toBe("WorkSans-Regular");
  });

  it("o título do aviso também, e no peso dele", async () => {
    mockCarregadas = true;
    await montar(<Aviso tom="perigo" titulo="Coleta presa">O servidor recusou</Aviso>);
    expect(familiaDe("Coleta presa")).toBe("WorkSans-Bold");
  });

  /*
    O sinal é o "×" e o "!" que separam perigo de alerta sem depender de cor.
    Fora da família do produto ele herda o desenho do sistema, e o peso do traço
    dele deixa de casar com o do texto ao lado, que é a única coisa que faz os
    dois parecerem a mesma peça.
  */
  it("e o sinal, que é o segundo canal da gravidade", async () => {
    mockCarregadas = true;
    await montar(<Aviso tom="perigo">Sem sinal</Aviso>);
    expect(familiaDe("×")).toBe("WorkSans-Bold");
  });

  it("na reserva, os três caem na pilha do sistema junto com o resto", async () => {
    mockErro = new Error("sem fonte");
    await montar(<Aviso tom="perigo" titulo="Coleta presa">O servidor recusou</Aviso>);
    expect(familiaDe("O servidor recusou")).toBe(PILHA_DO_SISTEMA.texto);
    expect(familiaDe("Coleta presa")).toBe(PILHA_DO_SISTEMA.texto);
    expect(familiaDe("×")).toBe(PILHA_DO_SISTEMA.texto);
  });
});
