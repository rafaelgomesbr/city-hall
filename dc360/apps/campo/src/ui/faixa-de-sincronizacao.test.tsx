/**
 * A faixa de sincronização, e o clímax da fila esvaziando.
 *
 * Dois defeitos que estes testes travam, e nenhum dos dois é estético:
 *
 * 1. **Comemorar toda hora.** Se o clímax disparasse sempre que a faixa
 *    aparecesse em "tudo sincronizado", ele rodaria a cada abertura do
 *    aplicativo com a fila já vazia, e a cada renderização. Comemoração que
 *    acontece o tempo todo deixa de significar coisa nenhuma, e a única coisa
 *    que ela ainda comunicaria seria movimento gratuito na tela de quem está
 *    tentando ler a lista de tarefas.
 * 2. **Animar quem pediu para não animar.** Quem liga a redução de movimento no
 *    sistema quase nunca liga por gosto: liga porque animação dá enjoo. Este
 *    aplicativo põe essa pessoa em pé num barranco, na chuva.
 */

import { AccessibilityInfo, Animated } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

import { ProvedorDeTema } from "./componentes";
import { FaixaDeSincronizacao, decidirFaixa, type EstadoDaFaixa } from "./FaixaDeSincronizacao";
import { temaEscuro } from "./tokens";

const ESTADOS: Record<EstadoDaFaixa["chave"], EstadoDaFaixa> = {
  sem_sinal: {
    chave: "sem_sinal", fundo: "#FEF3C7", cor: "#92400E", sinalTexto: "!",
    titulo: "Sem sinal", detalhe: "Salvando neste aparelho",
  },
  enviando: {
    chave: "enviando", fundo: "#F1F5F9", cor: "#14191D", sinalTexto: "↑",
    titulo: "Enviando", detalhe: "2 na fila",
  },
  esperando: {
    chave: "esperando", fundo: "#F1F5F9", cor: "#14191D", sinalTexto: "↑",
    titulo: "Com sinal", detalhe: "2 esperando envio",
  },
  /*
    O estado do aparelho de plantão compartilhado: existe coleta guardada aqui
    que a sessão aberta não pode enviar, porque o laudo sai com o nome de quem
    fez a vistoria. Ele existe para que "Tudo sincronizado" nunca apareça com
    uma vistoria parada no aparelho.
  */
  aguardando_autor: {
    chave: "aguardando_autor", fundo: "#FEF3C7", cor: "#92400E", sinalTexto: "⏸",
    titulo: "Coleta de outro agente no aparelho",
    detalhe: "1 coleta espera quem a fez entrar",
  },
  /*
    A coleta que o servidor recusou e espera o dedo do agente. Existe pelo
    mesmo motivo do estado acima: em 15/09/2026 a vistoria 000009/2026 parou
    na fila por 422 e a faixa do topo ficou verde, "Tudo sincronizado, nada
    pendente no aparelho", com a coleta parada a um toque dali.
  */
  precisa_de_correcao: {
    chave: "precisa_de_correcao", fundo: "#FDEBEB", cor: "#C92A2A", sinalTexto: "!",
    titulo: "Precisa de correção", detalhe: "1 coleta precisa de correção",
  },
  sincronizado: {
    chave: "sincronizado", fundo: "#DCFCE7", cor: "#14532D", sinalTexto: "✓",
    titulo: "Tudo sincronizado", detalhe: "Nada pendente no aparelho",
  },
};

/*
  A sequência é espionada em vez de o valor animado ser lido. O que se quer
  provar é "houve clímax" ou "não houve", e `Animated.sequence` é a assinatura
  exata do clímax: o movimento de troca comum usa `timing` sozinho.
*/
let sequencias: number;
let redutorLigado: boolean;

beforeEach(() => {
  sequencias = 0;
  redutorLigado = false;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(redutorLigado));
  jest.spyOn(AccessibilityInfo, "addEventListener")
    .mockReturnValue({ remove: () => undefined } as never);
  jest.spyOn(Animated, "sequence").mockImplementation(() => {
    sequencias += 1;
    return { start: (fim?: (r: { finished: boolean }) => void) => fim?.({ finished: true }),
      stop: () => undefined, reset: () => undefined,
      _startNativeLoop: () => undefined, _isUsingNativeDriver: () => true } as never;
  });
});

afterEach(() => { jest.restoreAllMocks(); });

function faixa(chave: EstadoDaFaixa["chave"], bloqueados = 0) {
  return (
    <ProvedorDeTema>
      <FaixaDeSincronizacao
        estado={ESTADOS[chave]} bloqueados={bloqueados} aoTocar={() => undefined} />
    </ProvedorDeTema>
  );
}

/* A leitura da redução de movimento é uma promessa: sem deixá-la chegar, ela
   cairia no meio da primeira asserção e o teste ficaria intermitente. */
async function montar(chave: EstadoDaFaixa["chave"], bloqueados = 0) {
  /*
    O `render` vai DENTRO do `act`, e não antes dele. Fora, o `act` vazio
    seguinte se sobrepõe ao que a própria biblioteca já abriu para a
    renderização, e o React reclama de chamadas sobrepostas: a partir da
    segunda montagem do arquivo, a árvore não é mais encontrada.
  */
  let tela!: Awaited<ReturnType<typeof render>>;
  await act(async () => { tela = await render(faixa(chave, bloqueados)); });
  return tela;
}

async function trocarPara(tela: Awaited<ReturnType<typeof render>>, chave: EstadoDaFaixa["chave"]) {
  await act(async () => { await tela.rerender(faixa(chave)); });
}

describe("o que a faixa diz", () => {
  it("mostra título, detalhe e símbolo, porque cor sozinha não comunica", async () => {
    await montar("sem_sinal");
    expect(screen.getByText("Sem sinal")).toBeTruthy();
    expect(screen.getByText("Salvando neste aparelho")).toBeTruthy();
    expect(screen.getByText("!")).toBeTruthy();
  });

  it("acrescenta os bloqueados ao detalhe, para o agente saber que há o que resolver", async () => {
    await montar("esperando", 3);
    expect(screen.getByText(/3 com problema/)).toBeTruthy();
  });

  /*
    O detalhe desenhado ganha ", N com problema" e o rótulo falado não ganhava:
    quem ouve a tela recebia "Tudo sincronizado. Nada pendente no aparelho." com
    uma coleta travada no aparelho.

    O próprio arquivo já diz por que isso é grave: "Tudo sincronizado com uma
    coleta parada no aparelho é a pior frase que este produto pode exibir". Ela
    era exibida para quem enxerga e DITA para quem não enxerga, que é o mesmo
    defeito com um agravante.
  */
  it("o rótulo falado também conta os que estão com problema", async () => {
    await montar("sincronizado", 1);
    const barra = screen.getByTestId("faixa-de-sincronizacao");
    expect(barra.props.accessibilityLabel).toMatch(/1 com problema/);
  });

  it("sem nenhum bloqueado, o rótulo falado não inventa problema", async () => {
    await montar("sincronizado");
    const barra = screen.getByTestId("faixa-de-sincronizacao");
    expect(barra.props.accessibilityLabel).not.toMatch(/problema/);
  });

  it("é um botão, e o rótulo falado diz para onde leva", async () => {
    await montar("sincronizado");
    const barra = screen.getByTestId("faixa-de-sincronizacao");
    expect(barra.props.accessibilityRole).toBe("button");
    expect(barra.props.accessibilityLabel).toMatch(/fila de envio/);
  });
});

describe("o clímax da fila esvaziando", () => {
  it("NÃO comemora ao abrir já sincronizado", async () => {
    // Abrir com a fila vazia não é a fila tendo esvaziado. Sem esta regra, a
    // comemoração viraria ruído de toda abertura do aplicativo.
    await montar("sincronizado");
    expect(sequencias).toBe(0);
  });

  it("NÃO comemora quando o estado é o mesmo entre renderizações", async () => {
    const tela = await montar("sincronizado");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
  });

  it("comemora quando ENVIANDO vira sincronizado", async () => {
    const tela = await montar("enviando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(1);
  });

  it("comemora quando ESPERANDO vira sincronizado", async () => {
    const tela = await montar("esperando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(1);
  });

  it("NÃO comemora quando SEM SINAL vira sincronizado", async () => {
    /*
      Sem sinal com a fila vazia virando "tudo sincronizado" é só o sinal
      voltando: nada foi enviado, porque não havia o que enviar. Comemorar aí
      seria comemorar que o telefone pegou rede.
    */
    const tela = await montar("sem_sinal");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
  });

  it("NÃO comemora em troca de estado que não termina em sincronizado", async () => {
    const tela = await montar("sem_sinal");
    await trocarPara(tela, "enviando");
    expect(sequencias).toBe(0);
  });
});

describe("redução de movimento", () => {
  it("com a chave ligada, a fila esvaziando NÃO anima, e a faixa continua dizendo tudo", async () => {
    redutorLigado = true;
    const tela = await montar("enviando");
    await trocarPara(tela, "sincronizado");
    expect(sequencias).toBe(0);
    expect(screen.getByText("Tudo sincronizado")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
  });
});

describe("o que a faixa promete", () => {
  /*
    A frase verde é a promessa central deste aplicativo para quem desceu o
    morro: "o que eu fiz já chegou". Ela precisa ser verdade sempre, e por isso
    tem teste próprio.
  */
  function faixa(entrada: Parameters<typeof decidirFaixa>[0]) {
    return decidirFaixa(entrada, temaEscuro);
  }

  it("NÃO diz 'Tudo sincronizado' com a coleta de outro agente parada no aparelho", async () => {
    /*
      O aparelho de plantão compartilhado: o agente da manhã coletou no morro e
      saiu da conta, o da noite entrou. A coleta dela não sobe, e não pode subir
      (o laudo sairia com o nome errado). Antes, com nada de próprio na fila, a
      faixa ficava verde dizendo "Nada pendente no aparelho".
    */
    const r = faixa({
      temSinal: true, pendentes: 0, bloqueados: 0, deOutroAutor: 1, sincronizando: false,
    });

    expect(r.chave).not.toBe("sincronizado");
    expect(r.titulo).toBe("Coleta de outro agente no aparelho");
    expect(r.detalhe).toBe("1 coleta espera quem a fez entrar");
    // Nada se comunica só por cor: o emblema muda junto com a palavra.
    expect(r.sinalTexto).not.toBe("✓");
  });

  it("com a fila realmente vazia, continua dizendo que está tudo certo", async () => {
    const r = faixa({
      temSinal: true, pendentes: 0, bloqueados: 0, deOutroAutor: 0, sincronizando: false,
    });
    expect(r.chave).toBe("sincronizado");
  });

  it("sem sinal, a falta de sinal vem antes de qualquer outra coisa", async () => {
    const r = faixa({
      temSinal: false, pendentes: 0, bloqueados: 0, deOutroAutor: 3, sincronizando: false,
    });
    expect(r.chave).toBe("sem_sinal");
  });

  it("NÃO diz 'Tudo sincronizado' com uma coleta parada por recusa do servidor", async () => {
    /*
      15/09/2026, com as capturas do dono: a vistoria 000009/2026 parou na
      fila por 422 ("Precisa de atenção") e a faixa do topo dizia, ao mesmo
      tempo, "Tudo sincronizado, nada pendente no aparelho". As duas frases
      estavam a um toque de distância, e a segunda era falsa.
    */
    const r = faixa({
      temSinal: true, pendentes: 0, bloqueados: 1, deOutroAutor: 0, sincronizando: false,
    });

    expect(r.chave).toBe("precisa_de_correcao");
    expect(r.titulo).toBe("Precisa de correção");
    expect(r.detalhe).toBe("1 coleta precisa de correção");
    expect(r.sinalTexto).not.toBe("✓");
    // O tom é o de perigo: é o único estado da faixa que pede o dedo do agente.
    expect(r.fundo).toBe(temaEscuro.perigoFundo);
    expect(r.cor).toBe(temaEscuro.perigoTexto);
  });

  it("no plural, a frase conta as coletas", async () => {
    const r = faixa({
      temSinal: true, pendentes: 0, bloqueados: 3, deOutroAutor: 0, sincronizando: false,
    });
    expect(r.detalhe).toBe("3 coletas precisam de correção");
  });

  it("com coleta esperando envio E coleta parada, a espera fala primeiro e a parada vai no sufixo", async () => {
    // A frase de espera continua a promessa que ela sempre foi; o sufixo
    // ", 1 com problema" já é o que a faixa desenhada acrescenta pelo número.
    const r = faixa({
      temSinal: true, pendentes: 2, bloqueados: 1, deOutroAutor: 0, sincronizando: false,
    });
    expect(r.chave).toBe("esperando");
  });
});

describe("a faixa desenhada com uma coleta parada", () => {
  it("não repete 'com problema' quando o estado já é o da correção", async () => {
    await montar("precisa_de_correcao", 1);
    expect(screen.getByText("1 coleta precisa de correção")).toBeTruthy();
    expect(screen.queryByText(/com problema/)).toBeNull();
    // E quem ouve a tela ouve a coleta parada e para onde o toque leva.
    const faixa = screen.getByTestId("faixa-de-sincronizacao");
    expect(faixa.props.accessibilityLabel).toContain("1 coleta precisa de correção");
    expect(faixa.props.accessibilityLabel).toContain("Toque para ver a fila de envio");
  });
});
