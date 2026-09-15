import {
  JANELA_DO_MES_MS, JANELA_DA_SEMANA_MS,
  concluidasNaJanela, concluidasPorDia, concluidasPorMes, tempoMedioAteAVistoria,
  tempoEmPalavras,
} from "./numeros-do-agente";

/**
 * Os números do agente, contados no aparelho a partir do que já desce.
 *
 * A fonte é a lista de concluídas de `GET /campo/meu-trabalho`, que o servidor
 * corta em cinquenta. Por isso todo número daqui é sobre UMA JANELA e diz
 * quando é um piso: contar "no mês" numa lista cortada pode ficar abaixo da
 * verdade, e a tela precisa poder dizer "50+" em vez de afirmar 50.
 *
 * As datas de referência são fixas: teste que depende de `new Date()` passa
 * ou reprova conforme o dia em que é rodado.
 */

/** Uma quarta-feira ao meio-dia, para "hoje" ter dia e semana bem definidos. */
const AGORA = new Date("2026-09-16T12:00:00.000Z");

function concluida(diasAtras: number, extras: Partial<{ despachada_em: string | null }> = {}) {
  const coletada = new Date(AGORA.getTime() - diasAtras * 24 * 60 * 60 * 1000);
  return {
    coletada_em: coletada.toISOString(),
    despachada_em: extras.despachada_em === undefined
      ? new Date(coletada.getTime() - 2 * 60 * 60 * 1000).toISOString()
      : extras.despachada_em,
  };
}

describe("na semana e no mês", () => {
  it("as janelas são sete e trinta dias, contados para trás", () => {
    expect(JANELA_DA_SEMANA_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(JANELA_DO_MES_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("conta só o que caiu dentro da janela", () => {
    const lista = [concluida(0), concluida(3), concluida(6.9), concluida(8), concluida(29), concluida(31)];
    expect(concluidasNaJanela(lista, JANELA_DA_SEMANA_MS, AGORA, 50)).toEqual({ total: 3, piso: false });
    expect(concluidasNaJanela(lista, JANELA_DO_MES_MS, AGORA, 50)).toEqual({ total: 5, piso: false });
  });

  it("vira piso quando a lista bateu no teto e a mais antiga ainda está na janela", () => {
    /*
      Cinquenta concluídas, todas nos últimos dez dias. O servidor cortou em
      cinquenta, então pode haver mais dentro da janela do mês: o número é um
      piso, e a tela escreve "50+". Na semana o mesmo: a mais antiga da lista
      (dia 9,8) está fora dos sete dias, então ali o número é exato.
    */
    const lista = Array.from({ length: 50 }, (_, i) => concluida(i * 0.2));
    expect(concluidasNaJanela(lista, JANELA_DO_MES_MS, AGORA, 50)).toEqual({ total: 50, piso: true });
    expect(concluidasNaJanela(lista, JANELA_DA_SEMANA_MS, AGORA, 50).piso).toBe(false);
  });

  it("lista vazia é zero, e não piso", () => {
    expect(concluidasNaJanela([], JANELA_DO_MES_MS, AGORA, 50)).toEqual({ total: 0, piso: false });
  });
});

describe("os últimos sete dias, dia a dia", () => {
  it("devolve sete barras, da mais antiga para hoje, com o dia da semana", () => {
    const barras = concluidasPorDia([concluida(0), concluida(0), concluida(2), concluida(9)], AGORA);
    expect(barras).toHaveLength(7);
    expect(barras.map((b) => b.valor)).toEqual([0, 0, 0, 0, 1, 0, 2]);
    /* Quarta-feira é hoje, então a última barra é "qua" e a primeira é "qui". */
    expect(barras[6]?.rotulo).toBe("qua");
    expect(barras[0]?.rotulo).toBe("qui");
  });

  it("a fala de cada barra diz o dia por extenso e quantas foram", () => {
    const barras = concluidasPorDia([concluida(0), concluida(0)], AGORA);
    expect(barras[6]?.descricao).toBe("Hoje, quarta-feira: 2 vistorias concluídas");
    expect(barras[5]?.descricao).toBe("Terça-feira: nenhuma vistoria concluída");
  });

  it("conta pelo dia LOCAL da coleta, e não pelo dia em UTC", () => {
    /*
      Uma vistoria coletada às 22h de terça no Brasil é 01h de quarta em UTC.
      Para o agente ela foi terça. A conta usa o fuso do aparelho, que em
      teste é o da máquina: o caso monta a data já no fuso local.
    */
    const terca = new Date(AGORA);
    terca.setDate(terca.getDate() - 1);
    terca.setHours(22, 0, 0, 0);
    const barras = concluidasPorDia([{ coletada_em: terca.toISOString(), despachada_em: null }], AGORA);
    expect(barras[5]?.valor).toBe(1);
    expect(barras[6]?.valor).toBe(0);
  });
});

describe("os últimos seis meses", () => {
  it("devolve seis barras, do mais antigo ao atual, com a inicial do mês", () => {
    const barras = concluidasPorMes([concluida(0), concluida(20), concluida(40), concluida(200)], AGORA);
    expect(barras).toHaveLength(6);
    /* Setembro é o atual: abril, maio, junho, julho, agosto, setembro. */
    expect(barras.map((b) => b.rotulo)).toEqual(["abr", "mai", "jun", "jul", "ago", "set"]);
    expect(barras[5]?.valor).toBe(1);
    expect(barras[4]?.valor).toBe(2);
    expect(barras[0]?.valor).toBe(0);
  });

  it("a fala diz o mês por extenso", () => {
    const barras = concluidasPorMes([concluida(0)], AGORA);
    expect(barras[5]?.descricao).toBe("Setembro: 1 vistoria concluída");
  });
});

describe("tempo médio entre o despacho e a vistoria", () => {
  it("é a média das que têm despacho, em milissegundos", () => {
    const lista = [
      concluida(1), // 2 horas
      { ...concluida(2), despachada_em: new Date(AGORA.getTime() - 2 * 86_400_000 - 4 * 3_600_000).toISOString() }, // 4 horas
      concluida(3, { despachada_em: null }), // sem despacho: fica de fora
    ];
    expect(tempoMedioAteAVistoria(lista)).toBe(3 * 60 * 60 * 1000);
  });

  it("sem nenhuma com despacho, não inventa média", () => {
    expect(tempoMedioAteAVistoria([concluida(1, { despachada_em: null })])).toBeNull();
    expect(tempoMedioAteAVistoria([])).toBeNull();
  });

  it("despacho depois da coleta (relógio do aparelho atrasado) não vira tempo negativo", () => {
    const depois = { ...concluida(1), despachada_em: new Date(AGORA.getTime() - 86_400_000 + 3_600_000).toISOString() };
    expect(tempoMedioAteAVistoria([depois])).toBe(0);
  });
});

describe("tempo em palavras", () => {
  it("fala em minutos, horas ou dias, pelo que cabe", () => {
    expect(tempoEmPalavras(45 * 60 * 1000)).toEqual({ valor: "45", unidade: "minutos" });
    expect(tempoEmPalavras(3 * 60 * 60 * 1000)).toEqual({ valor: "3", unidade: "horas" });
    expect(tempoEmPalavras(3.6 * 60 * 60 * 1000)).toEqual({ valor: "3,6", unidade: "horas" });
    expect(tempoEmPalavras(2 * 24 * 60 * 60 * 1000)).toEqual({ valor: "2", unidade: "dias" });
    expect(tempoEmPalavras(60 * 60 * 1000)).toEqual({ valor: "1", unidade: "hora" });
    expect(tempoEmPalavras(0)).toEqual({ valor: "0", unidade: "minutos" });
  });
});
