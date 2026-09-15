/**
 * O pontuador da busca: como uma consulta digitada casa com um item.
 *
 * Escrito aqui, sem dependência, por duas razões que o produto já assumiu: o
 * `npm audit` fecha em zero e cada dependência é dívida, e a régua de
 * "quantos erros de digitação são tolerados" precisa poder ser lida por quem
 * chega, e não descoberta dentro de uma biblioteca.
 *
 * A ordem de força, da maior para a menor: igual, prefixo, prefixo de
 * palavra, trecho, distância de edição. Sinônimo declarado pelo item entra
 * na mesma régua que o rótulo. Tudo sem acento e sem caixa.
 *
 * A distância é Damerau-Levenshtein na forma restrita (alinhamento ótimo de
 * cadeias): troca, falta, sobra e transposição de vizinhos custam um erro
 * cada. O TETO é proporcional ao que foi digitado: 1 erro até 5 letras, 2 até
 * 10, 3 acima. E zero abaixo de 3 letras, porque um erro em duas letras é
 * metade da palavra, e isso não é tolerância, é ruído.
 */

/** Sem acento, sem caixa, espaços juntos. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A mesma normalização, guardando de onde cada letra veio.
 *
 * `mapa[i]` é a posição, no texto original, da letra `i` do texto
 * normalizado. É o que permite marcar "Órgão" quando a pessoa digitou
 * "orgao": o casamento acontece no texto sem acento, o destaque é desenhado
 * no texto com acento.
 */
function normalizarComMapa(texto: string): { texto: string; mapa: number[] } {
  let saida = "";
  const mapa: number[] = [];
  let ultimoFoiEspaco = true;
  for (let i = 0; i < texto.length; i++) {
    const letra = texto[i]!.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (letra === "") continue;
    if (/\s/.test(letra)) {
      if (ultimoFoiEspaco) continue;
      saida += " ";
      mapa.push(i);
      ultimoFoiEspaco = true;
      continue;
    }
    saida += letra;
    mapa.push(i);
    ultimoFoiEspaco = false;
  }
  if (saida.endsWith(" ")) { saida = saida.slice(0, -1); mapa.pop(); }
  return { texto: saida, mapa };
}

/** Quantos erros de digitação são tolerados para uma consulta deste tamanho. */
export function tetoDeErros(tamanho: number): number {
  if (tamanho < 3) return 0;
  if (tamanho <= 5) return 1;
  if (tamanho <= 10) return 2;
  return 3;
}

/**
 * Damerau-Levenshtein (alinhamento ótimo de cadeias), com saída antecipada.
 *
 * Quando `teto` é dado e uma linha inteira da matriz já passou dele, o
 * resultado não vai mais caber, e a conta para ali: numa lista de centenas de
 * registros, é isso que mantém a busca instantânea a cada tecla.
 */
export function distanciaDeEdicao(a: string, b: string, teto = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let duasAtras: number[] = new Array<number>(m + 1).fill(0);
  let anterior: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  let atual: number[] = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    atual[0] = i;
    let menorDaLinha = i;
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(
        anterior[j]! + 1,        // sobra
        atual[j - 1]! + 1,       // falta
        anterior[j - 1]! + custo, // troca
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, duasAtras[j - 2]! + 1); // transposição
      }
      atual[j] = valor;
      if (valor < menorDaLinha) menorDaLinha = valor;
    }
    if (menorDaLinha > teto) return teto + 1;
    [duasAtras, anterior, atual] = [anterior, atual, duasAtras];
  }
  return anterior[m]!;
}

/** Palavras de ligação que não contam numa consulta de várias palavras. */
const LIGACAO = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "pra", "com"]);

function palavrasDe(texto: string): string[] {
  return texto.split(" ").filter((p) => p.length > 0);
}

/** Palavras que importam: tira as de ligação, a menos que só haja elas. */
function palavrasQueContam(texto: string): string[] {
  const todas = palavrasDe(texto);
  const fortes = todas.filter((p) => !LIGACAO.has(p));
  return fortes.length > 0 ? fortes : todas;
}

const PESO = {
  igual: 1,
  prefixo: 0.9,
  prefixoDePalavra: 0.85,
  trecho: 0.7,
  /** Ponto de partida do casamento por erro; cada erro tira um degrau. */
  erro: 0.6,
  degrauPorErro: 0.1,
  /** Consulta de várias palavras casada palavra a palavra. */
  porPalavras: 0.8,
  /**
   * Desempate: quanto do termo a consulta cobre. "ocorencia" casa
   * "Ocorrências" e "Registrar ocorrência" com o mesmo erro, e o termo mais
   * curto é o mais específico. Menor que qualquer degrau acima, de
   * propósito: nunca troca a ordem entre categorias.
   */
  cobertura: 0.04,
} as const;

function bonusDeCobertura(consulta: string, termo: string): number {
  return PESO.cobertura * Math.min(1, consulta.length / Math.max(1, termo.length));
}

/**
 * A menor distância entre a consulta e uma palavra, contando também o
 * PREFIXO da palavra do tamanho da consulta: "ocorencia" está a um erro de
 * "ocorrencia", e o "s" do plural não pode virar o segundo erro.
 */
function menorDistancia(consulta: string, palavra: string, teto: number): number {
  let melhor = distanciaDeEdicao(consulta, palavra, teto);
  if (palavra.length > consulta.length) {
    for (const corte of [consulta.length, consulta.length + 1]) {
      const d = distanciaDeEdicao(consulta, palavra.slice(0, corte), teto);
      if (d < melhor) melhor = d;
    }
  }
  return melhor;
}

/** Quanto uma consulta já normalizada casa com um termo já normalizado. */
function pontuarTermo(consulta: string, termo: string): number {
  if (consulta === termo) return PESO.igual;
  const bonus = bonusDeCobertura(consulta, termo);
  if (termo.startsWith(consulta)) return PESO.prefixo + bonus;
  const palavrasDoTermo = palavrasDe(termo);
  if (palavrasDoTermo.some((p) => p.startsWith(consulta))) return PESO.prefixoDePalavra + bonus;
  if (termo.includes(consulta)) return PESO.trecho + bonus;

  const teto = tetoDeErros(consulta.length);
  if (teto > 0) {
    // Contra o termo inteiro e contra cada palavra dele: "eqipe" precisa achar
    // "Equipe Alfa" pela palavra, e "ocorencias" achar "Ocorrências" inteira.
    let melhor = Infinity;
    for (const candidato of [termo, ...palavrasDoTermo]) {
      const d = menorDistancia(consulta, candidato, teto);
      if (d < melhor) melhor = d;
    }
    if (melhor <= teto) return PESO.erro - (melhor - 1) * PESO.degrauPorErro + bonus;
  }

  // Várias palavras: cada uma que conta precisa casar com alguma do termo.
  const palavrasDaConsulta = palavrasQueContam(consulta);
  if (palavrasDaConsulta.length > 1) {
    let soma = 0;
    for (const palavra of palavrasDaConsulta) {
      let melhor = 0;
      for (const doTermo of palavrasDoTermo) {
        const p = pontuarPalavra(palavra, doTermo);
        if (p > melhor) melhor = p;
      }
      if (melhor === 0) return 0;
      soma += melhor;
    }
    return (soma / palavrasDaConsulta.length) * PESO.porPalavras;
  }
  return 0;
}

/** Uma palavra da consulta contra uma palavra do termo. Nunca recursa em frase. */
function pontuarPalavra(palavra: string, doTermo: string): number {
  if (palavra === doTermo) return PESO.igual;
  if (doTermo.startsWith(palavra)) return PESO.prefixo;
  if (doTermo.includes(palavra)) return PESO.trecho;
  const teto = tetoDeErros(palavra.length);
  if (teto === 0) return 0;
  const d = menorDistancia(palavra, doTermo, teto);
  return d <= teto ? PESO.erro - (d - 1) * PESO.degrauPorErro : 0;
}

export type Pontuavel = { rotulo: string; sinonimos: readonly string[] };

/**
 * A pontuação de um item para uma consulta, entre 0 (não casa) e 1 (igual).
 *
 * O rótulo e cada sinônimo entram na mesma régua, e vale o melhor. Consulta
 * com menos de duas letras não pontua: não há nada para casar.
 */
export function pontuar(consulta: string, item: Pontuavel): number {
  const q = normalizar(consulta);
  if (q.length < 2) return 0;
  let melhor = 0;
  for (const termo of [item.rotulo, ...item.sinonimos]) {
    const p = pontuarTermo(q, normalizar(termo));
    if (p > melhor) melhor = p;
    if (melhor >= PESO.igual) break;
  }
  return melhor;
}

export type Segmento = { texto: string; marcado: boolean };

/**
 * O rótulo repartido em pedaços, com o trecho que casou marcado.
 *
 * Primeiro o trecho literal (consulta como substring do rótulo sem acento);
 * se não houver, a primeira palavra do rótulo que fique dentro do teto de
 * erros, marcada inteira. Sem casamento, o rótulo inteiro sem marca: a tela
 * mostra o item do mesmo jeito, só sem destaque. Isso acontece quando quem
 * casou foi um sinônimo, e é honesto: não há trecho do rótulo para marcar.
 */
export function destacar(rotulo: string, consulta: string): Segmento[] {
  const q = normalizar(consulta);
  const { texto, mapa } = normalizarComMapa(rotulo);
  if (q.length === 0 || texto.length === 0) return [{ texto: rotulo, marcado: false }];

  let inicio = texto.indexOf(q);
  let fim = inicio === -1 ? -1 : inicio + q.length;

  if (inicio === -1) {
    const teto = tetoDeErros(q.length);
    if (teto > 0) {
      let cursor = 0;
      for (const palavra of texto.split(" ")) {
        if (palavra.length > 0 && menorDistancia(q, palavra, teto) <= teto) {
          inicio = cursor;
          fim = cursor + palavra.length;
          break;
        }
        cursor += palavra.length + 1;
      }
    }
  }
  if (inicio === -1) return [{ texto: rotulo, marcado: false }];

  // Do índice normalizado para o original: o começo é direto; o fim é a
  // posição da última letra casada mais um, para incluir o acento combinado
  // que a normalização apagou.
  const de = mapa[inicio]!;
  const ultima = mapa[fim - 1]!;
  let ate = ultima + 1;
  while (ate < rotulo.length && /^[\u0300-\u036f]$/.test(rotulo[ate]!)) ate++;

  const segmentos: Segmento[] = [];
  if (de > 0) segmentos.push({ texto: rotulo.slice(0, de), marcado: false });
  segmentos.push({ texto: rotulo.slice(de, ate), marcado: true });
  if (ate < rotulo.length) segmentos.push({ texto: rotulo.slice(ate), marcado: false });
  return segmentos;
}
