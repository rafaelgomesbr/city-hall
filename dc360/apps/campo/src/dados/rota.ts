import { enderecoDaApi } from "./api";
import { cabecalhoDaVersao } from "./versao-do-aplicativo";
import { bancoLocal } from "./banco-local";
import { distanciaEmTexto, type Ponto } from "./mapa";

/**
 * O CAMINHO POR RUAS, do lado do aparelho.
 *
 * ## O que este arquivo faz, e o que ele nunca faz
 *
 * Ele pede o caminho à API DO PRODUTO (`POST /rota`), decodifica a linha que
 * volta, escreve a frase ("cerca de 14 min de carro, 4,2 km") e guarda o
 * resultado por tarefa no aparelho. Ele NUNCA fala com o Google: a chave que o
 * binário carrega é restrita a Apps iOS ou Android e o Google a recusa por
 * HTTP; a chave que serve para HTTP é segredo de servidor e nunca chega aqui.
 * `scripts/portao-do-mapa-do-aplicativo.test.mjs` reprova `routes.googleapis.com`
 * em qualquer fonte do aplicativo, e este arquivo é o primeiro que ele lê.
 *
 * ## Quando ele roda: no toque, e só no toque
 *
 * O reclame de quem paga pedia rota e tempo "como se fosse um GPS". O que foi
 * decidido com ele, com o custo na mesa, é que o caminho é pedido quando o
 * agente toca em "Ver o caminho", uma vez por tarefa, e nunca sozinho: cada
 * pedido manda a posição do agente para fora do país (ver
 * `docs/SUBPROCESSADORES.md` seção 2.2), e isso é uma decisão dele, não do
 * aplicativo. A tela chama `verOCaminho` no toque, e em nenhum outro lugar.
 *
 * ## O que fica guardado, e onde
 *
 * Na tabela `marcas` do banco local, uma linha por tarefa. `marcas` morre no
 * logout de propósito (ver `apagarDadosLocais`), e o caminho mora lá POR ISSO:
 * ele carrega a coordenada do imóvel de uma família e a posição do agente do
 * turno, e o aparelho de plantão passa de mão em mão.
 */

/**
 * Quanto tempo o caminho guardado vale. O mesmo teto da cache do servidor:
 * rua interditada de manhã está livre à tarde, e a estimativa envelhece.
 */
export const VALIDADE_DO_CAMINHO_MS = 24 * 60 * 60 * 1000;

/**
 * Casas decimais da ORIGEM para decidir se o guardado ainda serve. Três é
 * cerca de 111 metros: o GPS oscilando dez metros no carro parado não pode
 * custar um pedido novo, e o agente que andou um quarteirão precisa de outro
 * caminho. É a mesma régua da cache do servidor, de propósito.
 */
const CASAS_DA_ORIGEM = 3;

const PRAZO_DO_PEDIDO_MS = 12_000;

const PREFIXO_DA_MARCA = "rota.";

/** O caminho já decodificado, pronto para a tela desenhar e dizer. */
export type Caminho = {
  duracaoSegundos: number;
  distanciaMetros: number;
  pontos: Ponto[];
};

/**
 * Por que o caminho não veio, com a frase para o botão.
 *
 * Três motivos e não um "erro", porque a resposta certa do agente é diferente
 * em cada um: sem sinal ele espera o sinal; município que não ligou, não
 * adianta esperar nem tentar de novo; falha do servidor, tentar de novo mais
 * tarde. Nos três, a distância e o rumo em linha reta continuam na tela.
 */
export type MotivoDaIndisponibilidade = "sem-sinal" | "municipio-nao-ligou" | "falhou";

export class CaminhoIndisponivel extends Error {
  readonly motivo: MotivoDaIndisponibilidade;
  constructor(motivo: MotivoDaIndisponibilidade) {
    super(FRASE_DA_INDISPONIBILIDADE[motivo]);
    this.name = "CaminhoIndisponivel";
    this.motivo = motivo;
  }
}

/**
 * As frases, escritas uma vez. A tela mostra `message` e não escolhe texto
 * por conta própria: duas redações para o mesmo fato divergem na primeira
 * edição.
 */
export const FRASE_DA_INDISPONIBILIDADE: Record<MotivoDaIndisponibilidade, string> = {
  "sem-sinal":
    "Sem sinal para pedir o caminho. A distância e o rumo em linha reta continuam valendo.",
  "municipio-nao-ligou":
    "O seu município não ligou o caminho por ruas. A distância e o rumo em linha reta "
    + "continuam valendo.",
  falhou:
    "Não deu para traçar o caminho agora. A distância e o rumo em linha reta continuam valendo.",
};

/* ========================================================================
   A polilinha do Google
   ======================================================================== */

/**
 * Decodifica a polilinha no formato do Google, sem dependência.
 *
 * É o algoritmo público documentado em
 * developers.google.com/maps/documentation/utilities/polylinealgorithm, e ele
 * cabe em trinta linhas: cada coordenada é a DIFERENÇA para a anterior,
 * multiplicada por 1e5, em complemento de dois com o sinal no bit mais baixo,
 * cortada em pedaços de cinco bits com o sexto bit dizendo "tem mais", e cada
 * pedaço somado a 63 para virar um caractere imprimível. Uma biblioteca para
 * isto seria uma dependência a mais para auditar num aplicativo que a régua
 * de segurança manda manter com `npm audit` em zero.
 *
 * Texto cortado no meio (o servidor devolveu metade) NÃO estoura: o que der
 * para ler é lido, e o pedaço incompleto do fim é descartado em vez de virar
 * um ponto no meio do oceano.
 */
export function decodificarPolilinha(codificada: string): Ponto[] {
  const pontos: Ponto[] = [];
  let indice = 0;
  let latitude = 0;
  let longitude = 0;

  /** Lê um número, ou `null` se o texto acabou antes do último pedaço. */
  const lerProximo = (): number | null => {
    let resultado = 0;
    let deslocamento = 0;
    let pedaco: number;
    do {
      if (indice >= codificada.length) return null;
      pedaco = codificada.charCodeAt(indice++) - 63;
      resultado |= (pedaco & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (pedaco >= 0x20);
    /* O bit mais baixo é o sinal: ímpar é negativo, em complemento de um. */
    return (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);
  };

  while (indice < codificada.length) {
    const dLat = lerProximo();
    if (dLat === null) break;
    const dLng = lerProximo();
    if (dLng === null) break;
    latitude += dLat;
    longitude += dLng;
    pontos.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return pontos;
}

/* ========================================================================
   A frase
   ======================================================================== */

/**
 * "cerca de 14 min de carro, 4,2 km".
 *
 * Minutos inteiros, porque é a unidade de quem está no carro; abaixo de um
 * minuto, "menos de 1 min", que é a mesma honestidade de `distanciaEmTexto`
 * com os vinte metros. Acima de uma hora, horas e minutos, e os minutos só
 * quando há. "De carro" fica escrito porque o modo é `DRIVE`, e um agente a
 * pé olhando "14 min" acreditaria no número errado.
 *
 * A distância sai de `distanciaEmTexto`, a mesma régua da linha reta: duas
 * réguas para a mesma grandeza, na mesma tela, é o que faz "4,2 km" e
 * "4213 m" parecerem duas distâncias diferentes.
 */
export function fraseDoCaminho(caminho: Pick<Caminho, "duracaoSegundos" | "distanciaMetros">): string {
  const distancia = distanciaEmTexto(caminho.distanciaMetros);
  if (caminho.duracaoSegundos < 60) return `menos de 1 min de carro, ${distancia}`;
  const minutos = Math.round(caminho.duracaoSegundos / 60);
  if (minutos < 60) return `cerca de ${minutos} min de carro, ${distancia}`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  return `cerca de ${tempo} de carro, ${distancia}`;
}

/* ========================================================================
   O guardado por tarefa
   ======================================================================== */

type CaminhoGuardado = {
  origem: string;
  destino: string;
  pedidoEm: number;
  caminho: Caminho;
};

const marcaDaOrigem = (p: Ponto): string =>
  `${p.latitude.toFixed(CASAS_DA_ORIGEM)},${p.longitude.toFixed(CASAS_DA_ORIGEM)}`;
const marcaDoDestino = (p: Ponto): string => `${p.latitude},${p.longitude}`;

/**
 * O caminho guardado para esta tarefa, se ele ainda serve: mesma esquina de
 * origem, mesmo destino, menos de 24 horas. `null` em qualquer outro caso, e
 * também quando a leitura falha: um guardado que não dá para ler vale o mesmo
 * que nenhum, e a resposta é pedir de novo.
 */
export async function lerCaminhoGuardado(
  ocorrenciaId: string,
  origem: Ponto,
  destino: Ponto,
  agora: () => number = () => Date.now(),
): Promise<Caminho | null> {
  try {
    const db = await bancoLocal();
    const linha = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM marcas WHERE chave = ?", [PREFIXO_DA_MARCA + ocorrenciaId],
    );
    if (!linha) return null;
    const guardado = JSON.parse(linha.valor) as CaminhoGuardado;
    if (guardado.origem !== marcaDaOrigem(origem)) return null;
    if (guardado.destino !== marcaDoDestino(destino)) return null;
    if (agora() - guardado.pedidoEm >= VALIDADE_DO_CAMINHO_MS) return null;
    if (!Array.isArray(guardado.caminho?.pontos) || guardado.caminho.pontos.length < 2) return null;
    return guardado.caminho;
  } catch {
    return null;
  }
}

async function guardarCaminho(
  ocorrenciaId: string,
  origem: Ponto,
  destino: Ponto,
  caminho: Caminho,
  agora: () => number,
): Promise<void> {
  const guardado: CaminhoGuardado = {
    origem: marcaDaOrigem(origem),
    destino: marcaDoDestino(destino),
    pedidoEm: agora(),
    caminho,
  };
  try {
    const db = await bancoLocal();
    await db.runAsync(
      "INSERT OR REPLACE INTO marcas (chave, valor) VALUES (?, ?)",
      [PREFIXO_DA_MARCA + ocorrenciaId, JSON.stringify(guardado)],
    );
  } catch {
    /*
      Não guardar custa um pedido a mais da próxima vez. Estourar aqui custaria
      o caminho que acabou de chegar, que é a única coisa que o agente pediu.
    */
  }
}

/* ========================================================================
   O pedido à API do produto
   ======================================================================== */

/**
 * `POST /rota`, e por que mora aqui e não em `api.ts`: a mesma razão de
 * `buscarAutorizacaoDoMapa` em `mapa.ts`. O `chamar` genérico de `api.ts` não
 * é exportado, outras frentes estão naquele arquivo, e o que se perde (a
 * classificação fina de erro) não faz falta: os três desfechos que a tela
 * precisa distinguir estão escritos abaixo, e são só três.
 */
async function pedirCaminho(token: string, origem: Ponto, destino: Ponto): Promise<Caminho> {
  const base = enderecoDaApi().replace(/\/$/, "");
  if (!base) throw new CaminhoIndisponivel("falhou");

  const cancelador = new AbortController();
  const relogio = setTimeout(() => cancelador.abort(), PRAZO_DO_PEDIDO_MS);
  let resposta: Response;
  try {
    resposta = await fetch(`${base}/rota`, {
      method: "POST",
      signal: cancelador.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...cabecalhoDaVersao(),
      },
      body: JSON.stringify({ origem, destino }),
    });
  } catch {
    /*
      `fetch` só rejeita por rede: recusa de conexão, DNS, tempo esgotado pelo
      cancelador. Qualquer resposta do servidor, boa ou ruim, resolve. Então
      rejeição é "sem sinal", e a frase manda esperar o sinal.
    */
    throw new CaminhoIndisponivel("sem-sinal");
  } finally {
    clearTimeout(relogio);
  }

  if (resposta.status === 503) {
    /*
      503 é o servidor dizendo que existe e está desligado por escolha de quem
      implantou, como o push desligado. Tentar de novo não muda nada, e a
      frase precisa dizer isso para o agente não ficar tocando no botão.
    */
    throw new CaminhoIndisponivel("municipio-nao-ligou");
  }
  if (!resposta.ok) throw new CaminhoIndisponivel("falhou");

  let corpo: { duracaoSegundos?: unknown; distanciaMetros?: unknown; polilinha?: unknown };
  try {
    corpo = (await resposta.json()) as typeof corpo;
  } catch {
    throw new CaminhoIndisponivel("falhou");
  }
  if (
    typeof corpo.duracaoSegundos !== "number" || typeof corpo.distanciaMetros !== "number"
    || typeof corpo.polilinha !== "string"
  ) {
    throw new CaminhoIndisponivel("falhou");
  }
  const pontos = decodificarPolilinha(corpo.polilinha);
  /*
    Menos de dois pontos não é caminho: é uma resposta que o servidor deixou
    passar sem rota, e desenhar nada com a frase "cerca de 14 min" seria a
    tela afirmando um caminho que ela não tem.
  */
  if (pontos.length < 2) throw new CaminhoIndisponivel("falhou");
  return { duracaoSegundos: corpo.duracaoSegundos, distanciaMetros: corpo.distanciaMetros, pontos };
}

/**
 * O que o botão "Ver o caminho" chama, e a única porta de entrada deste
 * arquivo para a tela.
 *
 * Primeiro o guardado, depois a rede. `guardado: true` existe para a tela
 * poder dizer, se quiser, que aquele caminho é de mais cedo; hoje ela não
 * diz, e o campo fica porque o teste é quem prova que a rede não foi tocada.
 * Fracasso não é guardado, pela mesma razão da autorização do mapa: o agente
 * que pediu sem sinal de manhã precisa conseguir pedir de novo à tarde.
 */
export async function verOCaminho({ ocorrenciaId, token, origem, destino, agora = () => Date.now() }: {
  ocorrenciaId: string;
  token: string;
  origem: Ponto;
  destino: Ponto;
  agora?: () => number;
}): Promise<{ caminho: Caminho; guardado: boolean }> {
  const lembrado = await lerCaminhoGuardado(ocorrenciaId, origem, destino, agora);
  if (lembrado) return { caminho: lembrado, guardado: true };

  const caminho = await pedirCaminho(token, origem, destino);
  await guardarCaminho(ocorrenciaId, origem, destino, caminho, agora);
  return { caminho, guardado: false };
}
