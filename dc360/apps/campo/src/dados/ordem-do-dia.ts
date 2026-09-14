import { quantoFalta } from "@dc360/campo";
import type { Severidade } from "@dc360/shared";

import { distanciaEmMetros, distanciaEmTexto, type Ponto } from "./mapa";

/**
 * A ORDEM DO DIA: o que o agente faz agora, e por quê.
 *
 * Até aqui a lista de tarefas saía do disco ordenada por
 * `prazo_em IS NULL, prazo_em` (`src/dados/pendencias.ts`), e mais nada. Isso
 * responde "qual vence primeiro", que é uma pergunta de coordenação. A
 * pergunta de quem está com o aparelho na mão, de pé numa rua de morro, é
 * outra: **para onde eu vou agora.** As duas respostas divergem todo dia,
 * porque prazo é uma linha no banco e o agente atravessa a cidade a pé.
 *
 * ## Por que a regra mora aqui, e não dentro da tela
 *
 * `CLAUDE.md` já manda: regra de negócio não mora no formulário. E esta em
 * particular decide o que uma pessoa vai fazer nas próximas horas, o que quer
 * dizer que ela precisa ser LIDA por quem revisa e MEDIDA por um teste, sem
 * montar árvore de React Native para descobrir em que ordem dois cartões
 * saíram. Em `src/app` ela também não caberia: tudo lá vira rota no Expo.
 *
 * ## O critério, e a razão de cada degrau
 *
 * O desenho é de CLASSES, e não de nota somada. Nota somada é o erro clássico
 * aqui: com pesos, duas tarefas perto uma da outra empurram juntas uma tarefa
 * crítica para baixo, e ninguém consegue explicar depois por que o aplicativo
 * mandou o agente na rua errada. Com classes, a frase que explica a ordem cabe
 * numa linha, e nenhuma quantidade de proximidade compra uma posição acima de
 * risco a vida.
 *
 * **Degrau 1, o grupo de urgência.** Quatro, nesta ordem:
 *
 * 1. `risco_a_vida`: severidade **crítica ou alta**. É o cadastro da própria
 *    ocorrência dizendo que há gente em perigo. Prazo não muda isso: um
 *    deslizamento crítico com folga de prazo continua sendo um deslizamento
 *    crítico, e chegar dentro do prazo numa casa que caiu não é cumprir prazo.
 * 2. `prazo_apertado`: prazo **vencido ou vencendo dentro do turno**. A
 *    fronteira do turno é a mesma que `quantoFalta` já usa para acender o
 *    vermelho (quatro horas), e é a mesma conta, e não uma segunda que diverge
 *    da primeira no dia em que alguém mexer numa só.
 * 3. `programada`: o resto, que é o trabalho normal do dia.
 * 4. `ja_coletada`: a tarefa que este aparelho **já vistoriou** e ainda não
 *    conseguiu enviar. Ela vai para o fim, e não sai da lista, porque sair
 *    seria perder de vista trabalho que o servidor não recebeu (ver o
 *    comentário de `esquecerPendencia` na tela). O que falta nela não é ir
 *    lá, é sinal, e mandar o agente subir de novo o mesmo morro é o defeito
 *    mais caro que esta lista já teve.
 *
 * **Degrau 2, a faixa de prazo.** Dentro do grupo, quem vence antes vem antes,
 * mas em BLOCOS de quatro horas e não no minuto. Duas vistorias que vencem às
 * 18h e às 20h são, para quem está na rua, a mesma urgência: tratar a de 18h
 * como mais urgente por causa de duas horas é o que faz o agente cruzar a
 * cidade duas vezes. O bloco é o mesmo tamanho do turno do degrau anterior.
 *
 * A fronteira do bloco é arbitrária em qualquer desenho possível (duas tarefas
 * separadas por dois minutos podem cair em blocos diferentes). O que importa é
 * que ela é a MESMA para todas as tarefas e não se move entre duas leituras da
 * mesma tela, senão a lista se remexeria sozinha debaixo do dedo, que é
 * exatamente o defeito que esta tela inteira existe para não ter.
 *
 * Esse "não se move" é do RELÓGIO, e não do instante em que alguém olhou: o
 * bloco sai de `Math.floor(prazo / janela)`, em blocos fixos de quatro horas, e
 * não de `(prazo - agora)`. Contado a partir de agora, a fronteira deslizava um
 * segundo por segundo, e como o relógio desta tela avança de trinta em trinta
 * segundos a lista se reordenava sozinha entre duas leituras idênticas do
 * disco. Ver `faixaDePrazo`, que carrega a conta e a razão.
 *
 * O que MUDA com o relógio, e deve mudar, é o GRUPO: uma tarefa que entra nas
 * quatro horas finais ficou mesmo mais urgente, e subir é a regra funcionando.
 *
 * **Degrau 3, a distância.** E só aqui. Proximidade nunca decide o que é mais
 * GRAVE: ela decide a ordem entre tarefas que a instituição já considera
 * igualmente urgentes. É o único uso dela que se defende numa auditoria, e é o
 * uso que economiza as pernas do agente, que é o ponto.
 *
 * **Degrau 4 e 5, o desempate final.** O prazo exato e depois o protocolo.
 * Existem para a ordem ser TOTAL e DETERMINÍSTICA: duas leituras seguidas do
 * mesmo disco precisam produzir exatamente a mesma lista, senão a tela
 * reconstrói cartões à toa e o item que o agente está lendo escorrega.
 *
 * ## O caso sem GPS, que é o comum
 *
 * O agente entra no elevador, entra na mata, entra no aparelho velho que
 * demora dois minutos para fixar. **Sem posição, o degrau 3 simplesmente não
 * acontece**, e a ordem cai para prazo exato e protocolo, que é o
 * comportamento que a lista sempre teve. Nada é inventado: a tela não estima
 * distância, não aponta seta e não escreve "a mais perto" numa frase que ela
 * não pode provar.
 *
 * O mesmo vale por tarefa: uma ocorrência sem coordenada cadastrada não
 * compete no degrau da distância, porque não dá para dizer que ela é perto.
 * Ela fica depois das que se sabe medir, dentro do mesmo grupo e da mesma
 * faixa de prazo, e a sugestão do dia nunca a apresenta com uma distância.
 */

/** O que a ordem precisa saber de uma tarefa. Um subconjunto de `Pendencia`. */
export type TarefaDoDia = {
  id: string;
  protocolo: string;
  severidade: Severidade | null;
  prazo_em: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type GrupoDeUrgencia =
  | "risco_a_vida"
  | "prazo_apertado"
  | "programada"
  | "ja_coletada";

/** A ordem dos grupos, e ela é a regra. Índice menor sai primeiro. */
export const ORDEM_DOS_GRUPOS: readonly GrupoDeUrgencia[] = [
  "risco_a_vida",
  "prazo_apertado",
  "programada",
  "ja_coletada",
];

/**
 * As severidades que colocam a tarefa no primeiro grupo.
 *
 * Constante exportada, e não dois literais dentro de um `if`, porque o dia em
 * que o vocabulário da COBRADE ganhar um degrau esta linha é a que precisa ser
 * revista, e uma constante com nome é a que alguém encontra procurando.
 */
export const SEVERIDADES_DE_RISCO_A_VIDA: readonly Severidade[] = ["critica", "alta"];

/**
 * O tamanho do bloco de prazo, e do turno.
 *
 * Quatro horas, e o número não é escolhido aqui: é o mesmo que `quantoFalta`
 * usa para decidir quando o prazo passa a ser desenhado em vermelho. Duas
 * fronteiras de turno diferentes no mesmo produto seriam a tela dizendo
 * "apertado" sobre uma tarefa que a ordem tratou como tranquila.
 */
export const JANELA_DO_TURNO_MS = 4 * 60 * 60 * 1000;

export type LugarNaOrdem<T extends TarefaDoDia> = {
  tarefa: T;
  grupo: GrupoDeUrgencia;
  /** Metros até o agente, ou `null` quando não dá para medir. */
  distanciaM: number | null;
};

export type OrdemDoDia<T extends TarefaDoDia> = {
  /** A lista inteira, na ordem em que o agente deve trabalhar. */
  ordenadas: T[];
  /** O mesmo, com o grupo e a distância de cada uma, para a tela desenhar. */
  lugares: LugarNaOrdem<T>[];
  /** A primeira, ou `null` quando não há tarefa nenhuma. */
  sugerida: T | null;
  /** Por que ela é a primeira, em uma frase, sem afirmar o que não se mediu. */
  motivo: string;
  /**
   * A distância decidiu alguma coisa nesta ordem?
   *
   * Falso quando o aparelho não sabe onde o agente está, e é isso que a tela
   * precisa dizer em voz alta: uma ordem do dia que se apresenta como "por
   * urgência e proximidade" quando metade dela não foi medida é pior do que
   * uma lista sem ordem nenhuma, porque o agente confia nela.
   */
  usouDistancia: boolean;
};

export type ContextoDoDia = {
  /** O relógio do aparelho, em milissegundos. */
  agora: number;
  /** Onde o agente está, ou `null`, que é o caso comum. */
  de: Ponto | null;
  /** Ids das tarefas que este aparelho já coletou e ainda não enviou. */
  jaColetadas: ReadonlySet<string>;
};

function grupoDe(tarefa: TarefaDoDia, contexto: ContextoDoDia): GrupoDeUrgencia {
  if (contexto.jaColetadas.has(tarefa.id)) return "ja_coletada";
  if (tarefa.severidade !== null && SEVERIDADES_DE_RISCO_A_VIDA.includes(tarefa.severidade)) {
    return "risco_a_vida";
  }
  /* `atrasado` é vencido OU dentro do turno. Uma conta só: ver `prazo.ts`. */
  if (quantoFalta(tarefa.prazo_em, contexto.agora).atrasado) return "prazo_apertado";
  return "programada";
}

/**
 * UM PONTO QUE SERVE PARA MEDIR, ou `null`.
 *
 * `null` e não `{0,0}`: a ilha nula, no golfo da Guiné, fica a seis mil
 * quilômetros de qualquer município brasileiro, e um ponto zerado apareceria
 * como o mais LONGE de todos em vez de aparecer como o que ele é, que é a
 * ausência de ponto. O aplicativo já tem o mesmo cuidado no plano esquemático.
 *
 * A função é uma só, e vale para os DOIS lados da medida, que foi o defeito
 * consertado aqui: a coordenada da tarefa era filtrada e a do agente não.
 * A do agente é justamente a que chega suja no aparelho de verdade, porque
 * `getLastKnownPositionAsync` devolve 0,0 em aparelho que ainda não fixou, em
 * emulador e em aparelho barato com o rádio recém-ligado. Da ilha nula, a
 * ordenação por proximidade vira uma ordenação por latitude (quem está mais ao
 * norte fica mais perto do equador), o que num município ao sul sai INVERTIDO,
 * e a tela ainda escreve "a 6009,8 km de você" como se tivesse medido.
 *
 * Coordenada ilegível cai no mesmo lugar, e ali o estrago é pior: `NaN` na
 * origem faz toda distância virar `NaN`, e como `NaN !== NaN` o comparador
 * chega à subtração e devolve `NaN`. Comparador que devolve `NaN` não estoura e
 * não avisa: ele deixa a lista quase ordenada, de um jeito que muda com o
 * tamanho do vetor, que é a forma mais cara possível deste defeito.
 */
export function pontoQueSeMede(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Ponto | null {
  if (latitude === null || longitude === null) return null;
  if (latitude === undefined || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** O ponto da tarefa, quando ela tem um que sirva. Ver `pontoQueSeMede`. */
export function pontoDaTarefa(tarefa: TarefaDoDia): Ponto | null {
  return pontoQueSeMede(tarefa.latitude, tarefa.longitude);
}

/**
 * O valor de "depois de todo mundo", e por que ele não é `Infinity`.
 *
 * As duas chaves abaixo entram numa SUBTRAÇÃO dentro do comparador, e
 * `Infinity - Infinity` é `NaN`. Comparador que devolve `NaN` não reprova, não
 * avisa e não estoura: o motor simplesmente trata como zero em algumas
 * posições e deixa a lista quase ordenada, que é a forma mais cara possível
 * deste defeito. Um número finito grande subtrai como número.
 */
const DEPOIS_DE_TODOS = Number.MAX_SAFE_INTEGER;

/**
 * Em que bloco de turno o prazo cai, contado do bloco em que estamos.
 *
 * Negativo para o que já venceu, e quanto mais negativo mais antigo é o
 * atraso, que é justamente a ordem desejada. Sem prazo vai para o fim da fila
 * do grupo: é a mesma decisão que `prazo_em IS NULL` já tomava no disco.
 *
 * ## A FRONTEIRA É DO RELÓGIO, e não do instante em que alguém olhou
 *
 * Os dois `Math.floor` separados são a correção, e a diferença entre eles e um
 * `floor` da subtração não é cosmética.
 *
 * Contando `(quando - agora)` a fronteira desliza um segundo por segundo, e o
 * relógio desta tela avança de trinta em trinta segundos. Uma tarefa a
 * 4h00m10s do prazo cai sozinha para o bloco de baixo na leitura seguinte,
 * passa na frente da que estava empatada com ela, e a lista se reordena com o
 * dedo do agente em cima sem NADA ter mudado no disco. É exatamente o defeito
 * que esta tela inteira existe para não ter, entrando pela porta do relógio.
 *
 * Com os blocos presos ao relógio (blocos fixos de quatro horas, sempre nos
 * mesmos instantes), a DIFERENÇA entre duas tarefas deixa de depender de quando
 * alguém olhou: ela só muda se um prazo mudar. Quando o relógio cruza uma
 * fronteira, TODAS as tarefas descem um bloco juntas, e ordem não muda.
 *
 * O preço é o que o comentário do alto deste arquivo já aceitava por escrito:
 * duas tarefas separadas por dois minutos podem cair em blocos diferentes.
 * Isso vale em qualquer desenho de bloco, e é muito mais barato que uma lista
 * que se remexe sozinha.
 */
export function faixaDePrazo(prazoEm: string | null, agora: number): number {
  if (!prazoEm) return DEPOIS_DE_TODOS;
  const quando = new Date(prazoEm).getTime();
  if (!Number.isFinite(quando)) return DEPOIS_DE_TODOS;
  return Math.floor(quando / JANELA_DO_TURNO_MS) - Math.floor(agora / JANELA_DO_TURNO_MS);
}

/** O instante do prazo, para o desempate exato. Sem prazo vai para o fim. */
function instanteDoPrazo(prazoEm: string | null): number {
  if (!prazoEm) return DEPOIS_DE_TODOS;
  const quando = new Date(prazoEm).getTime();
  return Number.isFinite(quando) ? quando : DEPOIS_DE_TODOS;
}

export function ordemDoDia<T extends TarefaDoDia>(
  tarefas: readonly T[],
  contexto: ContextoDoDia,
): OrdemDoDia<T> {
  /*
    A origem passa pelo MESMO filtro da tarefa, e antes de qualquer conta. Ver
    `pontoQueSeMede`: uma origem zerada ou ilegível não é "onde o agente está",
    é o aparelho dizendo que ainda não sabe, e a resposta certa para isso é a
    mesma de não ter posição nenhuma.
  */
  const de = contexto.de ? pontoQueSeMede(contexto.de.latitude, contexto.de.longitude) : null;

  const lugares: LugarNaOrdem<T>[] = tarefas.map((tarefa) => {
    const ponto = pontoDaTarefa(tarefa);
    return {
      tarefa,
      grupo: grupoDe(tarefa, contexto),
      distanciaM: de && ponto ? distanciaEmMetros(de, ponto) : null,
    };
  });

  /*
    A ordenação é por CHAVES em sequência, e a primeira que difere decide.

    Escrita assim, e não como uma soma de pesos, porque é assim que ela se
    explica: "elas estão no mesmo grupo e na mesma faixa de prazo, então quem
    decidiu foi a distância" é uma frase que um coordenador entende e contesta.
    "A nota dela deu 7,4" não é.
  */
  const ordenadas = [...lugares].sort((a, b) => {
    const porGrupo = ORDEM_DOS_GRUPOS.indexOf(a.grupo) - ORDEM_DOS_GRUPOS.indexOf(b.grupo);
    if (porGrupo !== 0) return porGrupo;

    const porFaixa = faixaDePrazo(a.tarefa.prazo_em, contexto.agora)
      - faixaDePrazo(b.tarefa.prazo_em, contexto.agora);
    if (porFaixa !== 0) return porFaixa;

    /*
      Quem não tem distância medida não disputa este degrau: ela cai depois das
      que se sabe medir. Sem o aparelho saber onde está, `distanciaM` é nulo em
      TODAS, o degrau inteiro fica inerte e a ordem continua para o próximo, que
      é exatamente o comportamento que a lista sempre teve.
    */
    const semDistancia = Number(a.distanciaM === null) - Number(b.distanciaM === null);
    if (semDistancia !== 0) return semDistancia;
    if (a.distanciaM !== null && b.distanciaM !== null && a.distanciaM !== b.distanciaM) {
      return a.distanciaM - b.distanciaM;
    }

    const porPrazo = instanteDoPrazo(a.tarefa.prazo_em) - instanteDoPrazo(b.tarefa.prazo_em);
    if (porPrazo !== 0) return porPrazo;

    /* O último degrau existe para a ordem ser total: sem ele, duas tarefas
       empatadas trocariam de lugar entre duas leituras do mesmo disco. */
    return a.tarefa.protocolo.localeCompare(b.tarefa.protocolo, "pt-BR");
  });

  const primeira = ordenadas[0] ?? null;

  return {
    ordenadas: ordenadas.map((l) => l.tarefa),
    lugares: ordenadas,
    sugerida: primeira?.tarefa ?? null,
    motivo: primeira ? motivoDaSugerida(primeira, contexto) : "",
    /*
      A distância só "foi usada" quando o aparelho sabe onde está E alguma
      tarefa tinha coordenada. Com posição e nenhuma coordenada cadastrada, o
      degrau não decidiu nada, e dizer que decidiu seria a mesma mentira.
    */
    usouDistancia: de !== null && ordenadas.some((l) => l.distanciaM !== null),
  };
}

/**
 * A frase que explica a sugestão, montada só com o que foi medido.
 *
 * Ela descreve os FATOS da tarefa escolhida (severidade, prazo, distância), e
 * nunca faz comparação superlativa. "A mais perto de você" seria uma afirmação
 * sobre a lista inteira, e ela é falsa sempre que a tarefa ganhou a primeira
 * posição pela severidade tendo outra bem mais próxima logo abaixo. "A 400 m
 * de você" é verdade em qualquer ordem possível, e é a informação de que o
 * agente precisa para decidir se vai a pé.
 *
 * Sem GPS, o trecho da distância não existe. Não há reticências, não há
 * "calculando" e não há seta apontando para o norte: o que não foi medido não
 * aparece na frase.
 */
function motivoDaSugerida<T extends TarefaDoDia>(
  lugar: LugarNaOrdem<T>,
  contexto: ContextoDoDia,
): string {
  const partes: string[] = [];

  if (lugar.grupo === "ja_coletada") {
    /*
      Caso de borda que precisa de frase própria: se a PRIMEIRA da lista já foi
      coletada, então todas foram, e o agente não tem para onde ir. Mandá-lo
      subir de novo seria o pior desfecho possível desta tela.
    */
    return "Você já vistoriou tudo o que está nesta lista. O que falta é sinal para enviar.";
  }

  if (lugar.grupo === "risco_a_vida" && lugar.tarefa.severidade) {
    partes.push(lugar.tarefa.severidade === "critica" ? "severidade crítica" : "severidade alta");
  }

  const prazo = quantoFalta(lugar.tarefa.prazo_em, contexto.agora);
  if (lugar.tarefa.prazo_em) {
    /* O texto sai de `quantoFalta`, e não de uma segunda formatação: é a mesma
       frase que o cartão já mostra, e duas contas de prazo na mesma tela é o
       jeito mais rápido de a tela discordar de si mesma. */
    partes.push(
      prazo.vencido ? `prazo ${prazo.texto.toLowerCase()}` : prazo.texto.toLowerCase(),
    );
  }

  if (lugar.distanciaM !== null) {
    partes.push(`a ${distanciaEmTexto(lugar.distanciaM)} de você`);
  }

  if (partes.length === 0) {
    return "Nenhuma outra tarefa desta lista está mais urgente que esta.";
  }

  const frase = partes.join(", ");
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}
