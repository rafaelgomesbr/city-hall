import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";
import type { Aviso, RespostaDeAvisos } from "../dados/repositorio";

/**
 * As decisões do sino, fora do React.
 *
 * Elas moram aqui porque o defeito que este recurso pode causar não é visual,
 * é de comportamento repetido: uma consulta a cada trinta segundos, por pessoa
 * logada, o dia inteiro. Um erro de decisão aqui não aparece em nenhuma tela,
 * ele aparece na conta do servidor e no olho de quem está tentando ler a fila
 * enquanto a lista se redesenha por baixo.
 *
 * O DEFEITO CENTRAL, dito com todas as letras: o dono do produto já relatou
 * nesta operação uma faixa de estado que piscava a cada quinze segundos. Uma
 * lista que se redesenha inteira a cada consulta é a mesma coisa, com um
 * agravante: o sino fica no topo, ao lado da busca, e o coordenador está com
 * o rádio na mão. Por isso a regra desta camada é simples de enunciar e é o
 * que os testes cobram: SE A RESPOSTA NÃO TROUXER NADA NOVO, NADA MUDA.
 * Nada, incluindo a identidade do objeto que o React compara.
 */

/**
 * Trinta segundos entre consultas.
 *
 * É o intervalo que a rota do sino assume nos próprios comentários (a margem
 * de commit de dez segundos foi dimensionada para ele), então mudar este
 * número aqui sem mexer lá desalinha os dois lados.
 */
export const INTERVALO_MS = 30_000;

/**
 * A espera curta quando a resposta veio cortada pelo teto.
 *
 * `truncada` é o servidor dizendo "há mais, e o cursor aponta para onde".
 * Esperar os trinta segundos normais faria um painel atrasado (o que ficou
 * fechado o fim de semana) levar meia hora para alcançar o presente. Um
 * segundo entre as voltas drena a fila em poucos passos sem virar rajada.
 */
export const ATRASO_DE_CONTINUACAO_MS = 1_000;

/**
 * Teto da espera quando o servidor está fora.
 *
 * Sem recuo, um servidor caído recebe uma consulta a cada trinta segundos de
 * cada painel aberto no município, para sempre, e todas falhando. O sino é o
 * recurso menos crítico do produto: ele é o primeiro que deve sair da frente
 * quando as coisas apertam, não o último.
 */
export const TETO_DE_ESPERA_MS = 5 * 60_000;

/**
 * Quantos avisos a lista guarda na memória da aba.
 *
 * A contagem de não lidos NÃO sai daqui, ela vem do servidor: é por isso que
 * cortar a lista é honesto. O número continua dizendo a verdade sobre quanto
 * falta mesmo quando a lista mostra menos, e a tela diz que está mostrando um
 * recorte em vez de deixar a pessoa concluir sozinha que viu tudo.
 */
export const TETO_NA_TELA = 50;

/**
 * Onde o número do selo vira "+".
 *
 * Três dígitos não cabem no selo sem esticar o cabeçalho, e a diferença entre
 * 118 e 137 não muda decisão nenhuma de quem coordena: as duas querem dizer
 * "a fila acumulou". O número exato continua escrito por extenso dentro do
 * painel, onde há espaço.
 */
export const TETO_DO_SELO = 99;

export type EstadoDoSino = {
  /** Do mais novo para o mais antigo, que é a ordem em que a tela lê. */
  itens: readonly Aviso[];
  naoLidos: number;
  /** A contagem bateu no teto do servidor: o número é um piso, não o total. */
  naoLidosTruncado: boolean;
  /** A lista deixou avisos antigos de fora por causa de `TETO_NA_TELA`. */
  listaCortada: boolean;
};

export const ESTADO_INICIAL: EstadoDoSino = {
  itens: [],
  naoLidos: 0,
  naoLidosTruncado: false,
  listaCortada: false,
};

/**
 * Mais novo primeiro, com o identificador desempatando.
 *
 * O desempate não é enfeite: uma sincronização traz várias vistorias na mesma
 * transação e todas recebem o mesmo `now()`. Sem ele a ordem entre empatados é
 * indefinida, e indefinida quer dizer que ela pode mudar entre duas
 * renderizações do mesmo conteúdo, que é piscar por outro caminho.
 */
function maisNovoPrimeiro(a: Aviso, b: Aviso): number {
  const instante = Date.parse(b.criadoEm) - Date.parse(a.criadoEm);
  if (instante !== 0) return instante;
  return b.id.localeCompare(a.id);
}

/**
 * Junta a resposta ao que já está na tela, e devolve O MESMO OBJETO quando
 * nada mudou.
 *
 * A identidade preservada é a correção inteira, não um detalhe de desempenho.
 * `setEstado` com o mesmo objeto faz o React desistir da renderização; com um
 * objeto novo equivalente, ele renderiza de novo, refaz a lista, e quem estava
 * com o ponteiro sobre um item ou com o foco dentro do painel perde os dois, a
 * cada trinta segundos, para sempre. Como a resposta vazia é o caso NORMAL
 * (quase toda consulta de um dia de trabalho vem sem nada), o caminho que
 * preserva a identidade é o caminho comum, e não a exceção.
 *
 * A lista de itens é preservada separadamente do resto: quando só a contagem
 * muda (alguém do plantão leu um aviso em outro computador), a lista não é
 * reconstruída.
 */
export function mesclarAvisos(atual: EstadoDoSino, resposta: RespostaDeAvisos): EstadoDoSino {
  const porId = new Map(atual.itens.map((a) => [a.id, a] as const));
  let mudouALista = false;

  for (const chegou of resposta.itens) {
    const anterior = porId.get(chegou.id);
    if (!anterior) {
      porId.set(chegou.id, chegou);
      mudouALista = true;
      continue;
    }
    /*
      O mesmo aviso pode voltar: a continuação de uma resposta cortada
      reentrega o item do cursor, e uma consulta repetida depois de falha
      reentrega a janela inteira. Sem esta comparação, o repetido entraria como
      novo e a lista ganharia linhas duplicadas do mesmo fato.

      Só a marca de leitura muda com o tempo, e ela muda por fora: a mesma
      pessoa em outro computador, ou o próprio painel depois de marcar.
    */
    if (anterior.lido !== chegou.lido) {
      porId.set(chegou.id, { ...anterior, lido: chegou.lido });
      mudouALista = true;
    }
  }

  const mudouAContagem = resposta.naoLidos !== atual.naoLidos
    || resposta.naoLidosTruncado !== atual.naoLidosTruncado;

  if (!mudouALista && !mudouAContagem) return atual;

  const ordenados = [...porId.values()].sort(maisNovoPrimeiro);
  const itens = mudouALista ? ordenados.slice(0, TETO_NA_TELA) : atual.itens;

  return {
    itens,
    naoLidos: resposta.naoLidos,
    naoLidosTruncado: resposta.naoLidosTruncado,
    listaCortada: mudouALista
      ? ordenados.length > TETO_NA_TELA || atual.listaCortada
      : atual.listaCortada,
  };
}

/**
 * Marca como lidos, na tela, os avisos que o servidor acabou de aceitar.
 *
 * A contagem é ajustada aqui e não esperada da próxima consulta porque a
 * próxima consulta pode levar trinta segundos, e um selo que continua dizendo
 * "3" depois de a pessoa ter marcado os três é a tela contradizendo o que
 * acabou de acontecer.
 *
 * COM A CONTAGEM TRUNCADA, O NÚMERO NÃO SE MEXE. Truncada quer dizer "pelo
 * menos quinhentos", e subtrair de um piso produz um número que parece exato e
 * não é: marcar dez de "500+" mostraria "490", afirmando um total que ninguém
 * contou. Enquanto o piso valer, quem corrige é a consulta seguinte.
 */
export function marcarLidosNoEstado(
  atual: EstadoDoSino,
  ids: readonly string[],
): EstadoDoSino {
  const alvo = new Set(ids);
  const quantosEstavamNaoLidos = atual.itens
    .filter((a) => alvo.has(a.id) && !a.lido).length;
  if (quantosEstavamNaoLidos === 0) return atual;

  return {
    ...atual,
    itens: atual.itens.map((a) => (alvo.has(a.id) && !a.lido ? { ...a, lido: true } : a)),
    naoLidos: atual.naoLidosTruncado
      ? atual.naoLidos
      : Math.max(0, atual.naoLidos - quantosEstavamNaoLidos),
  };
}

/**
 * A aba escondida não pergunta nada.
 *
 * O coordenador deixa o painel aberto o dia inteiro numa aba de fundo. A trinta
 * segundos por consulta, isso são 2880 requisições por dia por pessoa, por
 * nada: ninguém está olhando o sino, e o que ele acumular enquanto a aba
 * estiver escondida chega de uma vez quando ela voltar, porque o cursor não se
 * perde. O teto de requisição do servidor é curto, e gastar assim é gastar com
 * a tela que ninguém está lendo.
 *
 * `emVoo` é a segunda metade: um servidor lento não pode acumular consultas
 * empilhadas, senão a resposta atrasada de uma volta antiga chega depois da
 * nova e faz o cursor andar para trás.
 */
export function deveConsultar({ escondida, emVoo }: {
  escondida: boolean;
  emVoo: boolean;
}): boolean {
  return !escondida && !emVoo;
}

/**
 * Quanto esperar até a próxima pergunta.
 *
 * Falha vem antes de tudo: com o servidor fora, continuar no ritmo normal
 * transforma cada painel aberto num pinguinho de carga sobre um servidor que
 * já está mal.
 */
export function proximoAtrasoMs({ truncada, falhasSeguidas }: {
  truncada: boolean;
  falhasSeguidas: number;
}): number {
  if (falhasSeguidas > 0) {
    const dobrado = INTERVALO_MS * 2 ** (falhasSeguidas - 1);
    return Math.min(dobrado, TETO_DE_ESPERA_MS);
  }
  return truncada ? ATRASO_DE_CONTINUACAO_MS : INTERVALO_MS;
}

/**
 * A frase de cada tipo de aviso.
 *
 * O tipo é uma lista fechada no banco (migração 018), e o painel não é quem
 * decide o que entra nela. O caso desconhecido devolve uma frase genérica em
 * vez de nada, e essa é a decisão que importa aqui: um tipo novo criado no
 * servidor antes de o painel aprender a palavra faria o sino contar avisos que
 * a lista mostra como linhas em branco, e linha em branco não leva ninguém a
 * lugar nenhum. Impreciso ainda é clicável.
 */
const FRASES: Record<string, string> = {
  vistoria_recebida: "Vistoria recebida do campo",
  prazo_vencido: "Prazo de atendimento vencido",
  providencia_respondida: "Órgão respondeu a providência",
  /*
    A FRASE DIZ O FATO, E NUNCA A INTERPRETAÇÃO DELE.

    Não é "agente em perigo", porque o produto não sabe disso: ele sabe que o
    prazo que o próprio agente declarou passou e ninguém confirmou o retorno.
    Pode ser um talude cedendo e pode ser bateria acabada. Uma frase que
    afirmasse perigo produziria pânico em toda saída terminada com o telefone
    descarregado, e a coordenação aprenderia a ignorar o sino, que é a única
    forma conhecida de quebrar este recurso de vez.
  */
  retorno_nao_confirmado: "Agente não confirmou o retorno de campo",
};

export function fraseDoAviso(tipo: string): string {
  return FRASES[tipo] ?? "Atualização na ocorrência";
}

/**
 * O complemento curto, quando ele diz alguma coisa.
 *
 * Hoje só o prazo vencido carrega detalhe, e o que ele carrega é a severidade
 * crua da ocorrência. Traduzir aqui evita mostrar "critica" sem acento no meio
 * de uma tela em português, e o `null` cobre a ocorrência sem classificação,
 * que existe (prazo nasce na triagem, mas o banco aceita severidade nula).
 */
export function complementoDoAviso(aviso: { tipo: string; detalhe: string | null }): string | null {
  const detalhe = aviso.detalhe?.trim();
  if (!detalhe) return null;
  /*
    O detalhe de uma saída sem retorno é 'sozinho' ou 'acompanhado', e ele vira
    frase aqui. Trabalhar sozinho é a categoria inteira de risco de que aquele
    aviso trata, e é o que decide se quem leu larga o que está fazendo.
  */
  if (aviso.tipo === "retorno_nao_confirmado") {
    if (detalhe === "sozinho") return "Foi sozinho";
    if (detalhe === "acompanhado") return "Foi acompanhado";
    return detalhe;
  }
  if (aviso.tipo !== "prazo_vencido") return detalhe;
  const rotulo = ROTULO_SEVERIDADE[detalhe as Severidade];
  return rotulo ? `Severidade ${rotulo.toLowerCase()}` : detalhe;
}

/** O que o selo do sino mostra. Vazio quando não há nada por ler. */
export function seloDoSino(naoLidos: number, truncado: boolean): string {
  if (naoLidos <= 0) return "";
  if (truncado || naoLidos > TETO_DO_SELO) return `${TETO_DO_SELO}+`;
  return String(naoLidos);
}

/**
 * O nome do botão para quem não enxerga o selo.
 *
 * O selo é um número solto ao lado de um sino: para o leitor de tela, ele é
 * "12", sem dizer doze do quê. A regra da casa é nunca comunicar estado só por
 * cor, e aqui vale a irmã dela: nunca comunicar estado só por desenho.
 */
export function rotuloDoSino(naoLidos: number, truncado: boolean): string {
  if (naoLidos <= 0) return "Avisos, nenhum por ler";
  const quantidade = truncado
    ? `mais de ${naoLidos}`
    : String(naoLidos);
  return naoLidos === 1 && !truncado
    ? "Avisos, 1 por ler"
    : `Avisos, ${quantidade} por ler`;
}
