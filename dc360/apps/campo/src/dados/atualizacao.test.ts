import {
  INTERVALO_APOS_FALHA_MS,
  INTERVALO_PADRAO_MS,
  LIMITE_DE_ALERTA_MS,
  deveAtualizar,
  idadeEmPalavras,
  listaEnvelheceu,
} from "./atualizacao";

/**
 * A regra que impede o aplicativo de inundar a rede.
 *
 * O aplicativo só buscava tarefa nova na montagem da tela, então a coordenação
 * despachava e o agente não ficava sabendo. Agora quatro coisas pedem
 * atualização (foco, volta do segundo plano, volta do sinal e um relógio), e
 * todas passam por `deveAtualizar`.
 *
 * O risco de fazer isso errado é concreto e está escrito no código antigo:
 * numa área de sombra o sinal pisca a cada segundo, e um aplicativo que
 * atualiza a cada piscada gasta a bateria e o dado do agente num dia de
 * plantão. Estes casos existem para provar que ele não faz isso.
 */

const BASE = 1_700_000_000_000;
const comSinal = { ultimaTentativa: null, ultimaDeuCerto: true, emVoo: false, temSinal: true };

describe("deveAtualizar", () => {
  it("busca na primeira vez, quando nunca tentou", () => {
    expect(deveAtualizar(comSinal, BASE)).toBe(true);
  });

  it("não busca sem sinal, por mais velha que a lista esteja", () => {
    expect(deveAtualizar(
      { ...comSinal, temSinal: false, ultimaTentativa: BASE - 10 * 60_000 },
      BASE,
    )).toBe(false);
  });

  it("não busca com outra busca em voo", () => {
    expect(deveAtualizar({ ...comSinal, emVoo: true }, BASE)).toBe(false);
  });

  it("não busca de novo enquanto a lista é recente", () => {
    expect(deveAtualizar(
      { ...comSinal, ultimaTentativa: BASE - 5_000 },
      BASE,
    )).toBe(false);
  });

  it("busca depois do intervalo", () => {
    expect(deveAtualizar(
      { ...comSinal, ultimaTentativa: BASE - INTERVALO_PADRAO_MS },
      BASE,
    )).toBe(true);
  });

  it("espera menos depois de falhar, porque falhar não é ter a lista", () => {
    const apenasDepoisDaFalha = { ...comSinal, ultimaDeuCerto: false };
    expect(deveAtualizar(
      { ...apenasDepoisDaFalha, ultimaTentativa: BASE - (INTERVALO_APOS_FALHA_MS - 1) },
      BASE,
    )).toBe(false);
    expect(deveAtualizar(
      { ...apenasDepoisDaFalha, ultimaTentativa: BASE - INTERVALO_APOS_FALHA_MS },
      BASE,
    )).toBe(true);
  });

  it("sinal piscando cem vezes em um minuto produz no máximo uma busca", () => {
    // É o cenário da área de sombra, e é a razão de esta regra existir.
    let ultimaTentativa: number | null = null;
    let buscas = 0;

    for (let i = 0; i < 100; i += 1) {
      const agora = BASE + i * 600; // cem eventos em um minuto
      const temSinal = i % 2 === 0; // piscando
      if (deveAtualizar({ ultimaTentativa, ultimaDeuCerto: true, emVoo: false, temSinal }, agora)) {
        buscas += 1;
        ultimaTentativa = agora;
      }
    }

    expect(buscas).toBe(1);
  });
});

describe("idadeEmPalavras", () => {
  const agora = new Date(BASE);
  const atras = (ms: number) => new Date(BASE - ms);

  it("diz há instantes no primeiro minuto e meio", () => {
    expect(idadeEmPalavras(atras(30_000), agora)).toBe("há instantes");
  });

  it("conta em minutos, depois em horas, depois em dias", () => {
    expect(idadeEmPalavras(atras(5 * 60_000), agora)).toBe("há 5 min");
    expect(idadeEmPalavras(atras(60 * 60_000), agora)).toBe("há 1 hora");
    expect(idadeEmPalavras(atras(5 * 3_600_000), agora)).toBe("há 5 horas");
    expect(idadeEmPalavras(atras(26 * 3_600_000), agora)).toBe("ontem");
    expect(idadeEmPalavras(atras(3 * 24 * 3_600_000), agora)).toBe("há 3 dias");
  });

  it("nunca diz que a lista veio do futuro", () => {
    // Relógio de aparelho de campo anda para trás mais do que se imagina.
    expect(idadeEmPalavras(new Date(BASE + 60_000), agora)).toBe("há instantes");
  });

  it("diz que ainda não baixou quando nunca baixou", () => {
    expect(idadeEmPalavras(null, agora)).toBe("ainda não baixada");
  });
});

describe("listaEnvelheceu", () => {
  it("avisa a partir de meia hora, que é o tempo da base até o morro", () => {
    const agora = new Date(BASE);
    expect(listaEnvelheceu(new Date(BASE - (LIMITE_DE_ALERTA_MS - 1)), agora)).toBe(false);
    expect(listaEnvelheceu(new Date(BASE - LIMITE_DE_ALERTA_MS), agora)).toBe(true);
  });

  it("lista que nunca baixou conta como velha", () => {
    expect(listaEnvelheceu(null, new Date(BASE))).toBe(true);
  });
});
