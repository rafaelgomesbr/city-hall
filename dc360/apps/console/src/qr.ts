/**
 * O código QR do segundo fator de um operador do console.
 *
 * CÓPIA DE `apps/web/src/componentes/qr.ts`, e não importação, por uma razão
 * de empacotamento e não de gosto: a imagem de produção do console
 * (`Dockerfile.console`) copia `apps/api` e `apps/console` para dentro do
 * contêiner, e NÃO copia `apps/web`. Um import de lá compilaria na máquina de
 * quem desenvolve e quebraria o build da imagem. A folha de tokens desta tela
 * é copiada do painel pela mesma razão (ver `pagina.ts`).
 *
 * A cópia tem PORTÃO: `test/o-qr-e-o-do-produto.test.ts` compara este arquivo
 * com o original, byte a byte a partir deste cabeçalho, e reprova quando um
 * dos dois mudar sem o outro. Assim as duas cópias não envelhecem em ritmos
 * diferentes, que é o defeito clássico de código copiado. Quem corrigir o QR
 * corrige LÁ e traz para cá; este arquivo não se edita à mão.
 *
 * POR QUE O CONSOLE PRECISA DISTO: a política de segurança de conteúdo deste
 * processo é `img-src 'self' data:`, e não existe serviço de imagem de QR que
 * passe por ela, nem deveria: o endereço `otpauth://` carrega o segredo do
 * segundo fator de uma conta que enxerga todos os municípios, e mandá-lo a um
 * serviço de terceiro para virar imagem seria entregar o segredo. O desenho
 * sai como matriz de 0 e 1 na resposta da rota, e a tela desenha os
 * quadradinhos em SVG (ver `pagina.ts`).
 *
 * O texto abaixo deste cabeçalho é o do painel, inclusive os comentários que
 * falam da "tela de ativação": lá é a ativação do administrador; aqui é a
 * criação de um operador. O algoritmo é o mesmo.
 */

export type MatrizQr = {
  /** Lado do desenho, em módulos (os quadradinhos). */
  tamanho: number;
  /** `true` é módulo escuro. Linha, depois coluna. */
  modulos: boolean[][];
  versao: number;
};

/* ==========================================================================
   As tabelas da norma, e só elas
   ========================================================================== */

/** Total de códigos (bytes do desenho) por versão, no nível L. */
const TOTAL_DE_CODIGOS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292];

/** Blocos e códigos de correção por bloco, no nível L. Versões 1 a 9. */
const BLOCOS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2];
const CORRECAO_POR_BLOCO = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30];

/** Centros dos padrões de alinhamento, por versão. */
const ALINHAMENTO: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46],
];

const VERSAO_MAXIMA = 9;

/** Quantos bytes de conteúdo cabem em cada versão, já descontado o cabeçalho. */
function capacidade(versao: number): number {
  const dados = TOTAL_DE_CODIGOS[versao]! - BLOCOS[versao]! * CORRECAO_POR_BLOCO[versao]!;
  // Quatro bits de modo mais oito de tamanho: dois bytes de cabeçalho.
  return dados - 2;
}

export const CAPACIDADE_MAXIMA = capacidade(VERSAO_MAXIMA);

export class TextoLongoDemais extends Error {
  constructor(bytes: number) {
    super(
      `O endereço tem ${bytes} bytes e o código QR desta tela cabe ${CAPACIDADE_MAXIMA}.`,
    );
    this.name = "TextoLongoDemais";
  }
}

/* ==========================================================================
   Aritmética de Galois, que é o que a correção de erro usa
   ========================================================================== */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function tabelasDeGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // 0x11D é o polinômio primitivo que a norma fixa para o corpo de 256.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/** O polinômio gerador de grau `grau`: produto de (x menos alfa elevado a i). */
function gerador(grau: number): number[] {
  let g = [1];
  for (let i = 0; i < grau; i++) {
    const proximo = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      // A ordem dos coeficientes é DECRESCENTE: `g[0]` é o de maior grau, e é
      // sempre 1. Escrito ao contrário (multiplicando o índice de baixo), o
      // polinômio sai espelhado, a correção de erro fica errada em todo byte,
      // e o desenho continua parecendo um código QR perfeito: nenhum leitor
      // abre, e não há nada na tela que diga por quê.
      proximo[j] = (proximo[j]! ^ g[j]!);
      proximo[j + 1] = (proximo[j + 1]! ^ multiplicar(g[j]!, EXP[i]!));
    }
    g = proximo;
  }
  return g;
}

/** Os códigos de correção de um bloco: resto da divisão polinomial. */
export function correcaoDeErro(dados: readonly number[], quantidade: number): number[] {
  const g = gerador(quantidade);
  const resto = new Array<number>(quantidade).fill(0);

  for (const byte of dados) {
    const fator = byte ^ resto[0]!;
    resto.shift();
    resto.push(0);
    if (fator !== 0) {
      for (let i = 0; i < quantidade; i++) {
        resto[i] = resto[i]! ^ multiplicar(g[i + 1]!, fator);
      }
    }
  }
  return resto;
}

/* ==========================================================================
   As duas palavras de verificação BCH, calculadas e não copiadas
   ========================================================================== */

/**
 * Divisão binária de polinômio, que é o que os dois cálculos BCH abaixo usam.
 *
 * Eles aparecem como tabela de quarenta linhas em quase toda implementação, e
 * tabela copiada é onde mora o erro que ninguém acha: um dígito trocado numa
 * linha faz o desenho falhar só com uma máscara específica, ou só numa versão,
 * e o sintoma é "às vezes o telefone não lê".
 */
function restoBinario(valor: number, gerador: number, bitsDoGerador: number): number {
  let resto = valor;
  for (let i = bitsDoGerador - 1; i >= 0; i--) {
    if (resto & (1 << (i + bitsDoGerador - 1))) {
      resto ^= gerador << i;
    }
  }
  return resto;
}

/**
 * Os quinze bits que dizem ao leitor o nível de correção e a máscara.
 *
 * Cinco bits de conteúdo (dois de nível, três de máscara), dez de verificação
 * BCH(15,5) com gerador 0x537, e no fim um ou-exclusivo com 0x5412 fixado pela
 * norma. Esse último passo existe para que o padrão nunca fique todo claro,
 * que confundiria o leitor com uma região vazia.
 */
export function bitsDeFormato(mascara: number): number {
  // Nível L é `01`. Os três bits seguintes são a máscara.
  const conteudo = (0b01 << 3) | mascara;
  const bch = restoBinario(conteudo << 10, 0x537, 11);
  return ((conteudo << 10) | bch) ^ 0x5412;
}

/** Os dezoito bits da versão, presentes só da versão 7 em diante. */
export function bitsDeVersao(versao: number): number {
  const bch = restoBinario(versao << 12, 0x1f25, 13);
  return (versao << 12) | bch;
}

/* ==========================================================================
   O desenho
   ========================================================================== */

type Grade = {
  tamanho: number;
  modulos: boolean[][];
  /** Onde a norma manda desenhar, e onde os dados não podem entrar. */
  reservado: boolean[][];
};

function grade(versao: number): Grade {
  const tamanho = 17 + 4 * versao;
  const vazio = () =>
    Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false));
  return { tamanho, modulos: vazio(), reservado: vazio() };
}

function desenharQuadrado(
  g: Grade, linha: number, coluna: number, lado: number,
  pinta: (i: number, j: number) => boolean,
): void {
  for (let i = 0; i < lado; i++) {
    for (let j = 0; j < lado; j++) {
      const l = linha + i;
      const c = coluna + j;
      if (l < 0 || c < 0 || l >= g.tamanho || c >= g.tamanho) continue;
      g.modulos[l]![c] = pinta(i, j);
      g.reservado[l]![c] = true;
    }
  }
}

function padroesDeFuncao(g: Grade, versao: number): void {
  // Os três olhos, com a borda clara de separação: 8 por 8 reservados.
  const olho = (linha: number, coluna: number) => {
    desenharQuadrado(g, linha - 1, coluna - 1, 9, (i, j) => {
      const li = i - 1;
      const cj = j - 1;
      if (li < 0 || cj < 0 || li > 6 || cj > 6) return false;
      const borda = li === 0 || li === 6 || cj === 0 || cj === 6;
      const centro = li >= 2 && li <= 4 && cj >= 2 && cj <= 4;
      return borda || centro;
    });
  };
  olho(0, 0);
  olho(0, g.tamanho - 7);
  olho(g.tamanho - 7, 0);

  // As duas réguas: linha e coluna 6, alternando, ligando os olhos.
  for (let i = 8; i < g.tamanho - 8; i++) {
    const escuro = i % 2 === 0;
    g.modulos[6]![i] = escuro;
    g.reservado[6]![i] = true;
    g.modulos[i]![6] = escuro;
    g.reservado[i]![6] = true;
  }

  // Os alinhamentos, que dizem ao leitor o quanto a imagem está torta. Os que
  // cairiam em cima de um olho não são desenhados.
  const centros = ALINHAMENTO[versao]!;
  for (const linha of centros) {
    for (const coluna of centros) {
      const emCimaDeOlho =
        (linha <= 8 && coluna <= 8) ||
        (linha <= 8 && coluna >= g.tamanho - 9) ||
        (linha >= g.tamanho - 9 && coluna <= 8);
      if (emCimaDeOlho) continue;
      desenharQuadrado(g, linha - 2, coluna - 2, 5, (i, j) => {
        const li = i - 2;
        const cj = j - 2;
        return Math.max(Math.abs(li), Math.abs(cj)) !== 1;
      });
    }
  }

  // O módulo escuro fixo, que a norma manda existir e nunca explica.
  g.modulos[4 * versao + 9]![8] = true;
  g.reservado[4 * versao + 9]![8] = true;

  // As duas faixas de formato ficam reservadas desde já: os dados não passam
  // por elas, e o valor só é escrito depois de a máscara ser escolhida.
  for (let i = 0; i < 9; i++) {
    if (!g.reservado[8]![i]) g.reservado[8]![i] = true;
    if (!g.reservado[i]![8]) g.reservado[i]![8] = true;
  }
  for (let i = 0; i < 8; i++) g.reservado[8]![g.tamanho - 1 - i] = true;
  for (let i = 0; i < 7; i++) g.reservado[g.tamanho - 1 - i]![8] = true;

  if (versao >= 7) {
    for (let i = 0; i < 18; i++) {
      const linha = Math.floor(i / 3);
      const coluna = g.tamanho - 11 + (i % 3);
      g.reservado[linha]![coluna] = true;
      g.reservado[coluna]![linha] = true;
    }
  }
}

/** O fluxo de bits: modo, tamanho, conteúdo, terminador e enchimento. */
function bitsDoConteudo(bytes: Uint8Array, versao: number): number[] {
  const bits: number[] = [];
  const empurrar = (valor: number, quantos: number) => {
    for (let i = quantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  empurrar(0b0100, 4);          // modo de bytes
  empurrar(bytes.length, 8);    // tamanho, oito bits até a versão 9
  for (const b of bytes) empurrar(b, 8);

  const dados = TOTAL_DE_CODIGOS[versao]! - BLOCOS[versao]! * CORRECAO_POR_BLOCO[versao]!;
  const teto = dados * 8;

  // Terminador de até quatro bits, e depois o que falta para fechar o byte.
  for (let i = 0; i < 4 && bits.length < teto; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // Enchimento alternado, fixado pela norma. Não é aleatório de propósito: um
  // enchimento que variasse mudaria o desenho a cada geração do mesmo texto.
  const enchimento = [0xec, 0x11];
  let i = 0;
  while (bits.length < teto) {
    empurrar(enchimento[i % 2]!, 8);
    i++;
  }
  return bits;
}

/** Bytes de dados e de correção, entrelaçados na ordem que o leitor espera. */
function codigosEntrelacados(bits: number[], versao: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let valor = 0;
    for (let j = 0; j < 8; j++) valor = (valor << 1) | bits[i + j]!;
    bytes.push(valor);
  }

  const quantidadeDeBlocos = BLOCOS[versao]!;
  const porBloco = bytes.length / quantidadeDeBlocos;
  const blocosDeDados: number[][] = [];
  const blocosDeCorrecao: number[][] = [];

  for (let b = 0; b < quantidadeDeBlocos; b++) {
    const bloco = bytes.slice(b * porBloco, (b + 1) * porBloco);
    blocosDeDados.push(bloco);
    blocosDeCorrecao.push(correcaoDeErro(bloco, CORRECAO_POR_BLOCO[versao]!));
  }

  /*
    O entrelaçamento é o que faz a correção de erro valer para um borrão: sem
    ele, um dedo cobrindo um canto apagaria um bloco inteiro, que é mais do que
    aquele bloco consegue recuperar. Com ele, o mesmo borrão tira alguns bytes
    de cada bloco, e todos se recuperam.
  */
  const saida: number[] = [];
  for (let i = 0; i < porBloco; i++) {
    for (const bloco of blocosDeDados) saida.push(bloco[i]!);
  }
  for (let i = 0; i < CORRECAO_POR_BLOCO[versao]!; i++) {
    for (const bloco of blocosDeCorrecao) saida.push(bloco[i]!);
  }
  return saida;
}

/** Preenche o desenho em ziguezague, de baixo para cima, da direita para a esquerda. */
function colocarDados(g: Grade, codigos: number[]): void {
  let indice = 0;
  let subindo = true;

  for (let coluna = g.tamanho - 1; coluna > 0; coluna -= 2) {
    // A coluna 6 é a régua vertical: ela não entra na contagem dos pares.
    if (coluna === 6) coluna--;

    for (let passo = 0; passo < g.tamanho; passo++) {
      const linha = subindo ? g.tamanho - 1 - passo : passo;
      for (const c of [coluna, coluna - 1]) {
        if (g.reservado[linha]![c]) continue;
        const byte = codigos[indice >> 3];
        // Módulo sobrando no fim fica claro, que é o que a norma manda.
        const bit = byte === undefined ? 0 : (byte >> (7 - (indice & 7))) & 1;
        g.modulos[linha]![c] = bit === 1;
        indice++;
      }
    }
    subindo = !subindo;
  }
}

const MASCARAS: Array<(i: number, j: number) => boolean> = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function aplicarMascara(g: Grade, mascara: number): Grade {
  const copia: Grade = {
    tamanho: g.tamanho,
    modulos: g.modulos.map((l) => [...l]),
    reservado: g.reservado,
  };
  for (let i = 0; i < g.tamanho; i++) {
    for (let j = 0; j < g.tamanho; j++) {
      if (g.reservado[i]![j]) continue;
      if (MASCARAS[mascara]!(i, j)) copia.modulos[i]![j] = !copia.modulos[i]![j];
    }
  }
  return copia;
}

/**
 * A nota de cada máscara, pelas quatro regras da norma. Ganha a menor.
 *
 * As regras existem para que o desenho não pareça, em nenhum pedaço, com os
 * padrões que o leitor usa para se orientar: faixa longa de uma cor só, bloco
 * maciço, algo parecido com um olho no meio dos dados, e claro e escuro muito
 * desequilibrados.
 */
function nota(g: Grade): number {
  const n = g.tamanho;
  const m = g.modulos;
  let total = 0;

  const contarFaixas = (ler: (a: number, b: number) => boolean) => {
    for (let a = 0; a < n; a++) {
      let corrente = 1;
      for (let b = 1; b < n; b++) {
        if (ler(a, b) === ler(a, b - 1)) {
          corrente++;
          if (corrente === 5) total += 3;
          else if (corrente > 5) total += 1;
        } else {
          corrente = 1;
        }
      }
    }
  };
  contarFaixas((a, b) => m[a]![b]!);
  contarFaixas((a, b) => m[b]![a]!);

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const c = m[i]![j]!;
      if (c === m[i]![j + 1] && c === m[i + 1]![j] && c === m[i + 1]![j + 1]) total += 3;
    }
  }

  const PADRAO = [true, false, true, true, true, false, true];
  const claros = [false, false, false, false];
  const procurar = (ler: (a: number, b: number) => boolean) => {
    const alvo1 = [...PADRAO, ...claros];
    const alvo2 = [...claros, ...PADRAO];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 11 <= n; b++) {
        const janela = Array.from({ length: 11 }, (_, k) => ler(a, b + k));
        if (janela.every((v, k) => v === alvo1[k]) || janela.every((v, k) => v === alvo2[k])) {
          total += 40;
        }
      }
    }
  };
  procurar((a, b) => m[a]![b]!);
  procurar((a, b) => m[b]![a]!);

  const escuros = m.flat().filter(Boolean).length;
  const proporcao = (escuros * 100) / (n * n);
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

  return total;
}

function escreverFormato(g: Grade, mascara: number): void {
  const formato = bitsDeFormato(mascara);
  const bit = (k: number) => ((formato >> k) & 1) === 1;
  const n = g.tamanho;

  for (let i = 0; i < 6; i++) g.modulos[8]![i] = bit(14 - i);
  g.modulos[8]![7] = bit(8);
  g.modulos[8]![8] = bit(7);
  g.modulos[7]![8] = bit(6);
  for (let i = 0; i < 6; i++) g.modulos[i]![8] = bit(i);

  for (let i = 0; i < 7; i++) g.modulos[n - 1 - i]![8] = bit(14 - i);
  for (let i = 0; i < 8; i++) g.modulos[8]![n - 8 + i] = bit(7 - i);
}

function escreverVersao(g: Grade, versao: number): void {
  if (versao < 7) return;
  const bits = bitsDeVersao(versao);
  for (let i = 0; i < 18; i++) {
    const valor = ((bits >> i) & 1) === 1;
    const linha = Math.floor(i / 3);
    const coluna = g.tamanho - 11 + (i % 3);
    g.modulos[linha]![coluna] = valor;
    g.modulos[coluna]![linha] = valor;
  }
}

/**
 * O desenho pronto, para o endereço `otpauth://` da ativação.
 *
 * Levanta `TextoLongoDemais` em vez de desenhar um código que nenhum leitor
 * abre: quem chama mostra o segredo para digitar à mão, que é o caminho que
 * funciona sempre, inclusive num computador sem câmera nenhuma, que é a
 * recepção de metade das Defesas Civis municipais.
 */
export function matrizQr(texto: string): MatrizQr {
  const bytes = new TextEncoder().encode(texto);

  let versao = 1;
  while (versao <= VERSAO_MAXIMA && capacidade(versao) < bytes.length) versao++;
  if (versao > VERSAO_MAXIMA) throw new TextoLongoDemais(bytes.length);

  const base = grade(versao);
  padroesDeFuncao(base, versao);
  colocarDados(base, codigosEntrelacados(bitsDoConteudo(bytes, versao), versao));

  let melhor: Grade | null = null;
  let melhorNota = Number.POSITIVE_INFINITY;
  for (let mascara = 0; mascara < 8; mascara++) {
    const candidato = aplicarMascara(base, mascara);
    escreverFormato(candidato, mascara);
    escreverVersao(candidato, versao);
    const notaDele = nota(candidato);
    if (notaDele < melhorNota) {
      melhorNota = notaDele;
      melhor = candidato;
    }
  }

  return { tamanho: melhor!.tamanho, modulos: melhor!.modulos, versao };
}
