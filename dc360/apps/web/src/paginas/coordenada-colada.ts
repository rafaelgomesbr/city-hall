import { lerLocalizacao, type Coordenada, type LeituraDeLocalizacao } from "@dc360/shared";

/**
 * O que o coordenador realmente cola no campo de localização.
 *
 * `packages/shared/src/localizacao.ts` já lê link do Google Maps, `geo:` do
 * Android e o par com PONTO decimal. Este módulo não refaz nada disso: ele
 * cobre os três formatos que sobravam, e que chegam pelo WhatsApp o dia
 * inteiro num município brasileiro.
 *
 * 1. VÍRGULA DECIMAL. É o separador decimal do Brasil, é o que o Excel da
 *    prefeitura exporta e é o que sai do teclado numérico do celular em
 *    português. O leitor compartilhado exige ponto, então "-27,5762 -48,5389"
 *    caía em "não reconheci coordenada nisso": o produto recusava justamente a
 *    forma que a pessoa tinha na mão.
 * 2. GRAU, MINUTO E SEGUNDO. É o que o Google Earth copia, o que aparece em
 *    laudo antigo e o que o GPS de mão da própria Defesa Civil imprime.
 * 3. GRAU DECIMAL com o símbolo de grau colado ("-27.5762°").
 *
 * A entrada continua passando ANTES pelo leitor compartilhado, e só o que ele
 * recusa chega aqui. Assim link e `geo:` continuam sendo lidos por um lugar
 * só, e a caixa do Brasil, a detecção de latitude e longitude trocadas e a
 * regra de coordenada válida continuam morando lá, sem cópia que envelhece
 * em separado: o que este módulo produz é devolvido ao leitor compartilhado
 * em forma canônica, para ser julgado pelas mesmas regras.
 */

/**
 * Casas decimais que o painel guarda e mostra.
 *
 * Seis casas são cerca de dez centímetros, que já é mais fino do que qualquer
 * GPS de celular acerta debaixo de chuva. Quinze casas não são precisão, são
 * o resto binário do `Number` impresso na tela, e imprimir isso convida o
 * coordenador a confiar em dígito que nunca mediu nada. O laudo e a minuta já
 * imprimem seis (`laudo.ts` e `minuta.ts`), então este é também o número que
 * faz a tela e o documento dizerem a MESMA coisa.
 */
export const CASAS_DE_COORDENADA = 6;

/**
 * A leitura recusada de propósito, que o leitor compartilhado não tem.
 *
 * Ver `candidatasDoTextoColado`: quando o mesmo texto admite mais de um par
 * de números, escolher um seria fincar o alfinete numa rua que ninguém
 * indicou. Um ponto errado no mapa é pior do que ponto nenhum, porque manda a
 * equipe para o endereço errado com a confiança de quem viu no sistema.
 */
export type LeituraColada =
  | LeituraDeLocalizacao
  | { tipo: "ambigua"; leituras: readonly Coordenada[] };

/** A forma que o leitor compartilhado sabe ler, e o teto de casas aplicado. */
function canonica(c: Coordenada): string {
  return `${c.lat.toFixed(CASAS_DE_COORDENADA)},${c.lng.toFixed(CASAS_DE_COORDENADA)}`;
}

export function arredondarCoordenada(c: Coordenada): Coordenada {
  return {
    lat: Number(c.lat.toFixed(CASAS_DE_COORDENADA)),
    lng: Number(c.lng.toFixed(CASAS_DE_COORDENADA)),
  };
}

/*
  O teto vale para TUDO que sai daqui, inclusive para o que o leitor
  compartilhado leu sozinho.

  Sem isto, a coordenada de um link do Google (que vem com treze casas) seria
  gravada inteira e a coordenada digitada à mão seria gravada com seis, e a
  mesma tela passaria a mostrar duas precisões diferentes para o mesmo tipo de
  dado, dependendo de como ele entrou.
*/
function comTeto(leitura: LeituraDeLocalizacao): LeituraDeLocalizacao {
  if (leitura.tipo === "coordenada") {
    return { tipo: "coordenada", coordenada: arredondarCoordenada(leitura.coordenada) };
  }
  if (leitura.tipo === "invertida") {
    return {
      tipo: "invertida",
      coordenada: arredondarCoordenada(leitura.coordenada),
      sugestao: arredondarCoordenada(leitura.sugestao),
    };
  }
  return leitura;
}

export function lerLocalizacaoColada(texto: string): LeituraColada {
  const direta = lerLocalizacao(texto);
  if (direta.tipo !== "nao_reconhecido") return comTeto(direta);

  /** As duas leituras que carregam um ponto. As outras não chegam aqui. */
  type LeituraComPonto = Extract<LeituraDeLocalizacao, { coordenada: Coordenada }>;
  const distintas = new Map<string, LeituraComPonto>();
  for (const candidata of candidatasDoTextoColado(texto)) {
    /*
      A candidata volta para o leitor compartilhado em vez de ser aprovada
      aqui. É ele que sabe o que é coordenada válida, o que cai fora do Brasil
      e o que é latitude trocada com longitude, e duplicar esse julgamento
      criaria duas respostas possíveis para o mesmo ponto conforme o formato
      em que ele foi colado.
    */
    const lida = lerLocalizacao(canonica(candidata));
    if (lida.tipo !== "coordenada" && lida.tipo !== "invertida") continue;
    distintas.set(canonica(lida.coordenada), lida);
  }

  const leituras = [...distintas.values()];
  if (leituras.length === 0) return { tipo: "nao_reconhecido" };
  if (leituras.length === 1) return comTeto(leituras[0]!);
  return { tipo: "ambigua", leituras: leituras.map((l) => arredondarCoordenada(l.coordenada)) };
}

/* ============================================================
   Grau, minuto e segundo
   ============================================================ */

/**
 * Um componente em grau, com minuto, segundo e hemisfério opcionais.
 *
 * O grau aceita casa decimal para cobrir "-27.5762°" e "-27,5762°", que é
 * grau decimal com o símbolo colado: o leitor compartilhado recusa esses dois
 * porque o símbolo quebra a ancoragem dele.
 *
 * As letras aceitas são as quatro em português (N, S, L, O) e as duas em
 * inglês que aparecem quando o aparelho está configurado em outro idioma
 * (E, W). Sem O e W a leitura do Google Earth brasileiro entraria com a
 * longitude positiva, ou seja, do outro lado do planeta.
 */
const COMPONENTE_GMS =
  String.raw`([+-]?\d{1,3}(?:[.,]\d+)?)\s*[°º]` +
  String.raw`(?:\s*(\d{1,2}(?:[.,]\d+)?)\s*['′’])?` +
  String.raw`(?:\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|''))?` +
  String.raw`\s*([NSLOEWnsloew])?`;

const GMS = new RegExp(`${COMPONENTE_GMS}[\\s,;/]*${COMPONENTE_GMS}`);

type Componente = { valor: number; eixo: "lat" | "lng" | null };

function comoNumero(texto: string | undefined): number {
  return texto === undefined ? 0 : Number(texto.replace(",", "."));
}

function componente(
  grau: string, minuto: string | undefined, segundo: string | undefined, letra: string | undefined,
): Componente {
  const modulo = Math.abs(comoNumero(grau)) + comoNumero(minuto) / 60 + comoNumero(segundo) / 3600;
  const inicial = (letra ?? "").toUpperCase();

  /*
    Quando há letra, ela MANDA, inclusive sobre o sinal.

    "27°S" com um menos na frente é a pessoa dizendo sul duas vezes, e ler
    isso como norte por causa do sinal jogaria o ponto para o outro hemisfério.
    A letra também é a única coisa que diz qual dos dois números é a latitude:
    o Google Earth em inglês imprime longitude primeiro em alguns formatos.
  */
  const negativo = inicial === ""
    ? grau.trim().startsWith("-")
    : inicial === "S" || inicial === "O" || inicial === "W";
  const eixo = inicial === ""
    ? null
    : inicial === "N" || inicial === "S" ? "lat" : "lng";

  return { valor: negativo ? -modulo : modulo, eixo };
}

function candidatasEmGrauMinutoSegundo(texto: string): Coordenada[] {
  const casou = GMS.exec(texto);
  if (!casou) return [];

  const primeiro = componente(casou[1]!, casou[2], casou[3], casou[4]);
  const segundo = componente(casou[5]!, casou[6], casou[7], casou[8]);

  if (primeiro.eixo === "lng" && segundo.eixo === "lat") {
    return [{ lat: segundo.valor, lng: primeiro.valor }];
  }
  return [{ lat: primeiro.valor, lng: segundo.valor }];
}

/* ============================================================
   Vírgula decimal, e a armadilha das três vírgulas
   ============================================================ */

/**
 * Só dígito, sinal e separador. Texto com letra não vira coordenada.
 *
 * Sem esta guarda, "Rua 15, 300" viraria o ponto (15, 300) na cara do
 * operador, e o número da casa acabaria plotado como longitude.
 */
const SO_NUMERO_E_SEPARADOR = /^[\d\s,.;+-]+$/;

/** Um número inteiro com sinal. A parte fracionária vem do grupo seguinte. */
const GRUPO = /[+-]?\d+/g;

/**
 * A REGRA DA VÍRGULA, decidida aqui e escrita por extenso.
 *
 * "-27,5762, -48,5389" tem três vírgulas e nenhuma delas se identifica: a
 * primeira e a terceira são decimais, a segunda separa o par. "-27,5762
 * -48,5389" tem duas vírgulas decimais e um espaço separando o par. Um
 * separador não diz o que é, então a regra não pergunta a ele: ela pergunta
 * ao RESULTADO.
 *
 * O texto é quebrado em grupos de dígitos e nos separadores entre eles. Cada
 * separador é testado como "o que parte o par", e a leitura só vale se sobrar
 * exatamente UM número de cada lado. Um número aceita no máximo um separador
 * decimal, esse separador precisa ser uma vírgula ou um ponto sozinhos (nunca
 * espaço, nunca ponto e vírgula, nunca vírgula seguida de espaço), e a parte
 * fracionária não pode ter sinal.
 *
 * Isso resolve os dois exemplos acima para o mesmo ponto, e resolve sozinho o
 * caso que parece ambíguo e não é: em "-27,5762, -48,5389" nenhuma outra
 * quebra sobrevive, porque as outras deixam três números de um lado.
 *
 * QUANDO SOBRA MAIS DE UMA LEITURA, O PAINEL RECUSA. "27,5,48" é ao mesmo
 * tempo (27; 5,48) e (27,5; 48), as duas com o mesmo direito. Escolher uma
 * seria o sistema fincando um alfinete numa rua que ninguém indicou, com a
 * autoridade de quem "leu do sistema". A tela mostra as duas e pede que a
 * pessoa aponte, que é o único jeito honesto de resolver. Na prática isso
 * quase só acontece sem sinal de menos: coordenada brasileira tem os dois
 * negativos, e o menos já desempata.
 */
function candidatasDecimais(texto: string): Coordenada[] {
  const limpo = texto.trim();
  if (!SO_NUMERO_E_SEPARADOR.test(limpo)) return [];

  const achados = [...limpo.matchAll(GRUPO)];
  const grupos = achados.map((a) => a[0]);
  const separadores = achados.slice(1).map((atual, i) => {
    const anterior = achados[i]!;
    return limpo.slice(anterior.index + anterior[0].length, atual.index);
  });

  const candidatas: Coordenada[] = [];
  for (let i = 0; i < separadores.length; i++) {
    if (!/[\s;,]/.test(separadores[i]!)) continue;
    const lat = numeroUnico(grupos.slice(0, i + 1), separadores.slice(0, i));
    const lng = numeroUnico(grupos.slice(i + 1), separadores.slice(i + 1));
    if (lat === null || lng === null) continue;
    candidatas.push({ lat, lng });
  }
  return candidatas;
}

/** Os grupos de um lado formam um número só, ou não formam nada. */
function numeroUnico(grupos: readonly string[], separadores: readonly string[]): number | null {
  if (grupos.length === 1) return Number(grupos[0]);
  if (grupos.length !== 2) return null;
  if (!/^[.,]$/.test(separadores[0] ?? "")) return null;
  // "-27,-48" não é um número com vírgula decimal: o sinal abre outro número.
  if (/^[+-]/.test(grupos[1]!)) return null;
  return Number(`${grupos[0]}.${grupos[1]}`);
}

/**
 * As leituras possíveis do texto colado, sem julgar se são pontos plausíveis.
 *
 * Grau, minuto e segundo vem primeiro porque o símbolo de grau é um marcador
 * que não aparece por acaso: quando ele está lá, a leitura é essa e não há o
 * que enumerar.
 */
export function candidatasDoTextoColado(texto: string): Coordenada[] {
  const emGraus = candidatasEmGrauMinutoSegundo(texto);
  if (emGraus.length > 0) return emGraus;
  return candidatasDecimais(texto);
}
