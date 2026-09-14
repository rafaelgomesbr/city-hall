/**
 * A ORDEM DO DIA, medida.
 *
 * O que estes casos defendem é o CRITÉRIO, e não a aparência dele: em que
 * ordem o agente vai trabalhar e o que a tela tem direito de afirmar sobre a
 * escolha. Cada caso abaixo foi escrito para reprovar contra a ordenação que
 * existia antes desta frente (`prazo_em IS NULL, prazo_em`, e mais nada), e
 * quase todos reprovam com a lista EXATAMENTE INVERTIDA, que é o sinal de que
 * eles estão medindo a regra nova e não concordando com a velha por acaso.
 *
 * Nenhum caso compara número de ponto flutuante com tolerância. A distância
 * aparece por ORDEM e por TEXTO, que é como ela chega ao agente, e não por
 * valor aproximado: uma tolerância maior que o defeito é um teste que passa
 * verde por cima de um erro, e esta onda já achou um desses.
 */

import type { Severidade } from "@dc360/shared";

import { ordemDoDia, faixaDePrazo, type TarefaDoDia } from "./ordem-do-dia";

const AGORA = new Date("2026-09-14T12:00:00.000Z").getTime();
const HORA = 3_600_000;

/** A base da equipe, em Florianópolis. Todo o resto é medido a partir daqui. */
const AQUI = { latitude: -27.595378, longitude: -48.548050 };

/** Um grau de latitude são cerca de 111 km, então isto é um deslocamento em metros. */
function aMetros(metros: number) {
  return { latitude: AQUI.latitude + metros / 111_000, longitude: AQUI.longitude };
}

function tarefa(parcial: Partial<TarefaDoDia> & { id: string }): TarefaDoDia {
  return {
    protocolo: `000${parcial.id}/2026`,
    severidade: "media" as Severidade,
    prazo_em: new Date(AGORA + 9 * HORA).toISOString(),
    latitude: null,
    longitude: null,
    ...parcial,
  };
}

const SEM_COLETA: ReadonlySet<string> = new Set<string>();

function ordenar(
  tarefas: TarefaDoDia[],
  { de = null as { latitude: number; longitude: number } | null, jaColetadas = SEM_COLETA } = {},
) {
  return ordemDoDia(tarefas, { agora: AGORA, de, jaColetadas });
}

/** Os identificadores, na ordem. É assim que cada caso afirma o que afirma. */
function ids(resultado: { ordenadas: TarefaDoDia[] }): string[] {
  return resultado.ordenadas.map((t) => t.id);
}

describe("degrau 1: o grupo de urgência manda em tudo", () => {
  /*
    O caso que separa esta ordem da anterior. Pela ordem antiga (só prazo), a
    vencida sai na frente sempre, e a crítica com folga fica para depois. É
    exatamente a decisão que o produto recusa: chegar dentro do prazo numa casa
    que caiu não é cumprir prazo.
  */
  it("severidade crítica com folga de prazo passa na frente de uma vencida de severidade média", () => {
    const resultado = ordenar([
      tarefa({ id: "1", severidade: "media", prazo_em: new Date(AGORA - 30 * HORA).toISOString() }),
      tarefa({ id: "2", severidade: "critica", prazo_em: new Date(AGORA + 40 * HORA).toISOString() }),
    ]);

    expect(ids(resultado)).toEqual(["2", "1"]);
    expect(resultado.sugerida?.id).toBe("2");
  });

  it("severidade alta entra no mesmo grupo da crítica, e as duas passam na frente do prazo apertado", () => {
    const resultado = ordenar([
      tarefa({ id: "apertada", severidade: "baixa", prazo_em: new Date(AGORA + HORA).toISOString() }),
      tarefa({ id: "alta", severidade: "alta", prazo_em: new Date(AGORA + 50 * HORA).toISOString() }),
    ]);

    expect(ids(resultado)).toEqual(["alta", "apertada"]);
  });

  /*
    O prazo apertado é o MESMO limiar que o cartão já usa para pintar o prazo de
    vermelho (`quantoFalta(...).atrasado`, quatro horas). Duas fronteiras de
    turno diferentes seriam a tela dizendo "apertado" sobre uma tarefa que a
    ordem tratou como tranquila.
  */
  it("vencendo dentro do turno já é prazo apertado, e passa na frente da programada", () => {
    const resultado = ordenar([
      tarefa({ id: "programada", severidade: "media", prazo_em: new Date(AGORA + 20 * HORA).toISOString() }),
      tarefa({ id: "no-turno", severidade: "media", prazo_em: new Date(AGORA + 3 * HORA).toISOString() }),
    ]);

    expect(ids(resultado)).toEqual(["no-turno", "programada"]);
  });

  it("a tarefa que este aparelho já coletou vai para o FIM, mesmo crítica e vencida", () => {
    const jaColetadas = new Set(["feita"]);
    const resultado = ordenar(
      [
        tarefa({ id: "feita", severidade: "critica", prazo_em: new Date(AGORA - 50 * HORA).toISOString() }),
        tarefa({ id: "por-fazer", severidade: "baixa", prazo_em: new Date(AGORA + 60 * HORA).toISOString() }),
      ],
      { jaColetadas },
    );

    expect(ids(resultado)).toEqual(["por-fazer", "feita"]);
    /* E ela continua na lista: sair daqui seria perder de vista trabalho que o
       servidor não recebeu. */
    expect(resultado.ordenadas).toHaveLength(2);
  });

  it("quando tudo já foi coletado, o motivo diz que falta sinal, e não manda subir de novo", () => {
    const resultado = ordenar(
      [tarefa({ id: "feita", severidade: "critica" })],
      { jaColetadas: new Set(["feita"]) },
    );

    expect(resultado.motivo).toContain("sinal");
    expect(resultado.motivo).not.toContain("severidade");
  });
});

describe("degrau 2: a faixa de prazo é o turno, e não o minuto", () => {
  /*
    Este é o caso que faz a proximidade existir de verdade. Se a faixa fosse o
    instante exato, duas tarefas separadas por duas horas nunca empatariam, a
    distância nunca decidiria nada e o degrau 3 seria decoração.
  */
  it("duas tarefas do mesmo turno empatam no prazo, e aí a distância decide", () => {
    const resultado = ordenar(
      [
        tarefa({
          id: "perto",
          prazo_em: new Date(AGORA + 11 * HORA).toISOString(),
          ...aMetros(300),
        }),
        tarefa({
          id: "longe",
          prazo_em: new Date(AGORA + 10 * HORA).toISOString(),
          ...aMetros(9_000),
        }),
      ],
      { de: AQUI },
    );

    /* Pela ordem antiga (prazo exato) a de 10h sairia primeiro. */
    expect(ids(resultado)).toEqual(["perto", "longe"]);
  });

  it("turnos diferentes NÃO empatam: o prazo continua mandando na distância", () => {
    const resultado = ordenar(
      [
        tarefa({
          id: "perto-e-folgada",
          prazo_em: new Date(AGORA + 30 * HORA).toISOString(),
          ...aMetros(100),
        }),
        tarefa({
          id: "longe-e-cedo",
          prazo_em: new Date(AGORA + 6 * HORA).toISOString(),
          ...aMetros(12_000),
        }),
      ],
      { de: AQUI },
    );

    expect(ids(resultado)).toEqual(["longe-e-cedo", "perto-e-folgada"]);
  });

  it("sem prazo vai para o fim do grupo, que é o que o disco já fazia", () => {
    const resultado = ordenar([
      tarefa({ id: "sem-prazo", prazo_em: null }),
      tarefa({ id: "com-prazo", prazo_em: new Date(AGORA + 40 * HORA).toISOString() }),
    ]);

    expect(ids(resultado)).toEqual(["com-prazo", "sem-prazo"]);
  });

  /*
    A armadilha que este caso fecha: com `Infinity` nas duas chaves, a
    subtração do comparador vira `NaN`, e comparador que devolve `NaN` não
    estoura nem avisa. Ele deixa a lista quase ordenada, de um jeito que muda
    conforme o tamanho do vetor, que é a forma mais cara possível do defeito.
  */
  it("duas tarefas sem prazo nenhum continuam numa ordem estável e previsível", () => {
    const a = tarefa({ id: "a", protocolo: "000100/2026", prazo_em: null });
    const b = tarefa({ id: "b", protocolo: "000200/2026", prazo_em: null });

    expect(ids(ordenar([a, b]))).toEqual(["a", "b"]);
    expect(ids(ordenar([b, a]))).toEqual(["a", "b"]);
  });
});

describe("degrau 3: a distância decide entre iguais, e nunca acima deles", () => {
  it("proximidade NÃO compra posição acima de risco a vida", () => {
    const resultado = ordenar(
      [
        tarefa({ id: "perto-e-leve", severidade: "baixa", ...aMetros(50) }),
        tarefa({ id: "longe-e-critica", severidade: "critica", ...aMetros(15_000) }),
      ],
      { de: AQUI },
    );

    expect(ids(resultado)).toEqual(["longe-e-critica", "perto-e-leve"]);
  });

  it("a tarefa SEM coordenada cadastrada não disputa a distância, e cai depois da que se mede", () => {
    const resultado = ordenar(
      [
        tarefa({ id: "sem-coordenada", latitude: null, longitude: null }),
        tarefa({ id: "longe", ...aMetros(20_000) }),
      ],
      { de: AQUI },
    );

    expect(ids(resultado)).toEqual(["longe", "sem-coordenada"]);
  });

  /*
    Coordenada zerada é ausência de coordenada, e não um ponto no golfo da
    Guiné a nove mil quilômetros daqui. Sem isto, a tarefa sem endereço
    geográfico apareceria como a MAIS LONGE de todas, que é uma afirmação que o
    aplicativo não tem como sustentar.
  */
  it("coordenada zerada conta como ausente, e não como a ilha nula", () => {
    const resultado = ordenar(
      [
        tarefa({ id: "zerada", latitude: 0, longitude: 0 }),
        tarefa({ id: "medida", ...aMetros(20_000) }),
      ],
      { de: AQUI },
    );

    expect(ids(resultado)).toEqual(["medida", "zerada"]);
    expect(resultado.motivo).toContain("de você");
  });

  /*
    E A MESMA REGRA VALE PARA O PONTO DO AGENTE, que é o lado que faltava.

    A coordenada zerada da tarefa já era tratada como ausência. A do AGENTE não
    era, e é ela que aparece no aparelho de verdade: `getLastKnownPositionAsync`
    devolve 0,0 em aparelho que ainda não fixou, em emulador e em aparelho
    barato com o rádio recém-ligado. Dali, todas as tarefas de um município
    brasileiro ficam a seis mil quilômetros, e o que sobra na ordenação é qual
    delas está alguns metros mais perto do golfo da Guiné, que é o INVERSO da
    ordem certa quando o município fica ao sul e a leste.

    O caso é duplo de propósito: a ordem precisa cair no prazo (como se não
    houvesse posição nenhuma) E a tela precisa continuar dizendo que não mediu
    caminho. Só a primeira metade passaria verde com a distância zerada.
  */
  it("a posição zerada do aparelho conta como ausência, e não como a ilha nula", () => {
    /*
      As duas vencem no MESMO bloco de turno (10h e 11h), então a distância é
      quem decide entre elas, e as duas coordenadas estão ao norte da base: da
      ilha nula, quem está mais ao norte é quem está mais perto do equador, ou
      seja, a ordem sai INVERTIDA em relação à do prazo. É essa inversão que faz
      o caso saber reprovar em vez de concordar por acaso.
    */
    const entrada = () => [
      tarefa({
        id: "vizinha",
        protocolo: "000100/2026",
        prazo_em: new Date(AGORA + 10 * HORA).toISOString(),
        ...aMetros(300),
      }),
      tarefa({
        id: "ao-norte",
        protocolo: "000900/2026",
        prazo_em: new Date(AGORA + 11 * HORA).toISOString(),
        ...aMetros(9_000),
      }),
    ];

    const daIlhaNula = ordenar(entrada(), { de: { latitude: 0, longitude: 0 } });

    expect(ids(ordenar(entrada()))).toEqual(["vizinha", "ao-norte"]);

    /* A mesma ordem de quem não tem posição: prazo exato, e nada mais. */
    expect(ids(daIlhaNula)).toEqual(ids(ordenar(entrada())));
    expect(daIlhaNula.usouDistancia).toBe(false);
    expect(daIlhaNula.motivo).not.toContain("de você");
    expect(daIlhaNula.lugares.every((l) => l.distanciaM === null)).toBe(true);
  });

  /*
    Posição ilegível é o mesmo caso, e o estrago é maior.

    Com `NaN` nas coordenadas do agente, toda distância vira `NaN`, e aí duas
    coisas acontecem juntas: o comparador passa a devolver `NaN` (porque
    `NaN !== NaN` é verdadeiro, e a subtração seguinte não é número nenhum), e o
    motor deixa a lista QUASE ordenada, de um jeito que muda com o tamanho do
    vetor. É o mesmo defeito que `DEPOIS_DE_TODOS` existe para evitar do outro
    lado, entrando pela porta da frente.

    E a tela ainda afirmava ter medido: `usouDistancia` verdadeiro tira o aviso
    de "não considerou distância" e a frase sai com "a distância desconhecida de
    você", que é uma medida que ninguém fez apresentada como medida.
  */
  it("posição ilegível não vira distância, e não faz o comparador devolver NaN", () => {
    const entrada = () => [
      tarefa({ id: "a", protocolo: "000300/2026", ...aMetros(5_000) }),
      tarefa({ id: "b", protocolo: "000100/2026", ...aMetros(800) }),
      tarefa({ id: "c", protocolo: "000200/2026", ...aMetros(2_000) }),
    ];

    const ilegivel = ordenar(entrada(), { de: { latitude: Number.NaN, longitude: Number.NaN } });

    expect(ids(ilegivel)).toEqual(ids(ordenar(entrada())));
    expect(ilegivel.usouDistancia).toBe(false);
    expect(ilegivel.motivo).not.toContain("desconhecida");
  });
});

describe("o caso sem GPS, que é o comum", () => {
  /*
    O caso que este arquivo existe para não errar. A revisão desta onda achou um
    teste irmão que conferia só o TEXTO e passava com a seta apontando para o
    norte sem GPS nenhum. Aqui a prova é dupla: a ordem sem posição é a ordem de
    prazo, E a mesma entrada com posição produz uma ordem DIFERENTE. Se a
    função inventasse uma origem qualquer, a segunda metade continuaria
    passando e a primeira reprovaria.
  */
  const MESMA_ENTRADA = (): TarefaDoDia[] => [
    tarefa({
      id: "perto",
      protocolo: "000900/2026",
      prazo_em: new Date(AGORA + 11 * HORA).toISOString(),
      ...aMetros(300),
    }),
    tarefa({
      id: "longe",
      protocolo: "000100/2026",
      prazo_em: new Date(AGORA + 10 * HORA).toISOString(),
      ...aMetros(9_000),
    }),
  ];

  it("sem posição, a distância não decide nada e a ordem cai no prazo exato", () => {
    const semGps = ordenar(MESMA_ENTRADA());
    const comGps = ordenar(MESMA_ENTRADA(), { de: AQUI });

    expect(ids(semGps)).toEqual(["longe", "perto"]);
    expect(ids(comGps)).toEqual(["perto", "longe"]);
  });

  it("sem posição, o motivo não afirma distância nenhuma", () => {
    const semGps = ordenar(MESMA_ENTRADA());

    expect(semGps.usouDistancia).toBe(false);
    expect(semGps.motivo).not.toContain("de você");
    /* Nenhuma medida de distância, em nenhuma unidade. O `\b` é o que impede
       este caso de passar verde por causa do "em" de "Vence em". */
    expect(semGps.motivo).not.toMatch(/\d+\s?(m|km)\b/);
    /* O que ele AFIRMA continua verdadeiro e continua útil. */
    expect(semGps.motivo).toBe("Vence em 10h.");
  });

  it("com posição e nenhuma coordenada cadastrada, a distância também não foi usada", () => {
    const resultado = ordenar(
      [tarefa({ id: "sozinha", latitude: null, longitude: null })],
      { de: AQUI },
    );

    expect(resultado.usouDistancia).toBe(false);
    expect(resultado.motivo).not.toContain("de você");
  });
});

describe("o motivo afirma só o que foi medido", () => {
  it("nomeia severidade, prazo e distância, nesta ordem, quando os três existem", () => {
    const resultado = ordenar(
      [tarefa({
        id: "1",
        severidade: "alta",
        prazo_em: new Date(AGORA - 3 * HORA).toISOString(),
        ...aMetros(400),
      })],
      { de: AQUI },
    );

    expect(resultado.motivo).toBe("Severidade alta, prazo vencido há 3h, a 401 m de você.");
    expect(resultado.usouDistancia).toBe(true);
  });

  /*
    Severidade média e baixa NÃO aparecem na frase. Elas não são o motivo de a
    tarefa estar no topo, e nomeá-las seria dar à ordem uma justificativa que
    ela não usou.
  */
  it("não nomeia severidade que não decidiu nada", () => {
    const resultado = ordenar([
      tarefa({ id: "1", severidade: "media", prazo_em: new Date(AGORA + 2 * HORA).toISOString() }),
    ]);

    expect(resultado.motivo).toBe("Vence em 2h00.");
  });

  it("sem severidade de risco, sem prazo e sem distância, ele diz o que sabe e nada mais", () => {
    const resultado = ordenar([tarefa({ id: "1", severidade: null, prazo_em: null })]);

    expect(resultado.motivo).toBe("Nenhuma outra tarefa desta lista está mais urgente que esta.");
  });

  it("lista vazia não tem sugestão nem motivo", () => {
    const resultado = ordenar([]);

    expect(resultado.sugerida).toBeNull();
    expect(resultado.motivo).toBe("");
  });
});

describe("a ordem é total, e duas leituras do mesmo disco produzem a mesma lista", () => {
  /*
    Isto não é zelo: a tela ancora a `FlatList` com `maintainVisibleContentPosition`
    e só troca o estado quando o conteúdo muda. Uma ordem que dependesse da
    ordem de ENTRADA faria a lista se remexer a cada leitura de disco, com o
    dedo do agente em cima dela.
  */
  it("a mesma entrada embaralhada devolve a mesma saída", () => {
    const entrada = [
      tarefa({ id: "a", protocolo: "000300/2026" }),
      tarefa({ id: "b", protocolo: "000100/2026" }),
      tarefa({ id: "c", protocolo: "000200/2026" }),
    ];

    const direta = ids(ordenar([...entrada]));
    const invertida = ids(ordenar([...entrada].reverse()));

    expect(direta).toEqual(["b", "c", "a"]);
    expect(invertida).toEqual(direta);
  });

  it("`lugares` acompanha `ordenadas`, item a item, com o grupo e a distância de cada uma", () => {
    const resultado = ordenar(
      [
        tarefa({ id: "critica", severidade: "critica", ...aMetros(1_000) }),
        tarefa({ id: "leve", severidade: "baixa", latitude: null, longitude: null }),
      ],
      { de: AQUI },
    );

    expect(resultado.lugares.map((l) => l.tarefa.id)).toEqual(ids(resultado));
    expect(resultado.lugares[0]?.grupo).toBe("risco_a_vida");
    expect(resultado.lugares[1]?.distanciaM).toBeNull();
  });
});

describe("a faixa de prazo, sozinha", () => {
  it("o que vence dentro do turno é a faixa zero, e o turno seguinte é a um", () => {
    expect(faixaDePrazo(new Date(AGORA + 1 * HORA).toISOString(), AGORA)).toBe(0);
    expect(faixaDePrazo(new Date(AGORA + 5 * HORA).toISOString(), AGORA)).toBe(1);
  });

  it("o vencido é negativo, e quanto mais antigo o atraso, mais cedo ele sai", () => {
    const recente = faixaDePrazo(new Date(AGORA - 1 * HORA).toISOString(), AGORA);
    const antigo = faixaDePrazo(new Date(AGORA - 30 * HORA).toISOString(), AGORA);

    expect(recente).toBe(-1);
    expect(antigo).toBeLessThan(recente);
  });

  it("prazo ilegível não estoura: ele vai para o fim, como quem não tem prazo", () => {
    expect(faixaDePrazo("nao e uma data", AGORA)).toBe(faixaDePrazo(null, AGORA));
  });

  /*
    A FRONTEIRA DO BLOCO NÃO PODE DESLIZAR COM O RELÓGIO, e este é o caso que o
    arquivo prometia no comentário e não tinha.

    A promessa, na letra: a fronteira "é a MESMA para todas as tarefas e não se
    move entre duas leituras da mesma tela, senão a lista se remexeria sozinha
    debaixo do dedo, que é exatamente o defeito que esta tela inteira existe
    para não ter".

    Contando o bloco A PARTIR DE AGORA, a fronteira desliza um segundo por
    segundo, e o relógio da tela avança de trinta em trinta segundos. Uma tarefa
    que estava a 4h00m10s do prazo passa para o bloco de baixo sozinha, salta na
    frente da que estava empatada com ela e a lista se reordena com o dedo do
    agente em cima, sem nada ter mudado no disco.

    Com o bloco preso ao relógio (blocos fixos de quatro horas), a DIFERENÇA
    entre duas tarefas não depende mais de quando alguém olhou, e é só isso que
    o desempate precisa: quem vence no bloco anterior continua vindo antes,
    sempre, e ninguém troca de lugar por causa do tempo passando.
  */
  it("a diferença de faixa entre duas tarefas não muda com o relógio andando", () => {
    const antes = new Date(AGORA + 4 * HORA + 10_000).toISOString();
    const depois = new Date(AGORA + 5 * HORA).toISOString();

    const agora = faixaDePrazo(antes, AGORA) - faixaDePrazo(depois, AGORA);
    const trintaSegundosDepois =
      faixaDePrazo(antes, AGORA + 30_000) - faixaDePrazo(depois, AGORA + 30_000);

    expect(trintaSegundosDepois).toBe(agora);
  });

  it("duas leituras da mesma lista com trinta segundos de diferença dão a mesma ordem", () => {
    /*
      As duas estão longe do turno (oito e nove horas), então o GRUPO das duas é
      o mesmo nas duas leituras e não é ele que decide nada aqui. Isso é
      deliberado: o grupo MUDAR com o relógio é a regra funcionando (uma tarefa
      que entra no turno ficou mesmo mais urgente). O que não pode mudar é a
      faixa de desempate, que não é urgência nova, é aritmética de quando alguém
      olhou.
    */
    const tarefas = [
      /* Vence uma hora antes da outra, e está oito quilômetros mais longe. */
      tarefa({
        id: "vence-antes",
        protocolo: "000100/2026",
        prazo_em: new Date(AGORA + 8 * HORA + 10_000).toISOString(),
        ...aMetros(8_000),
      }),
      tarefa({
        id: "mais-perto",
        protocolo: "000200/2026",
        prazo_em: new Date(AGORA + 9 * HORA).toISOString(),
        ...aMetros(200),
      }),
    ];

    const leitura = (agora: number) =>
      ordemDoDia(tarefas, { agora, de: AQUI, jaColetadas: SEM_COLETA })
        .ordenadas.map((t) => t.id);

    expect(leitura(AGORA + 30_000)).toEqual(leitura(AGORA));
  });
});
