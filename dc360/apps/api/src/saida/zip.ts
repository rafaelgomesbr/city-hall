import { deflateRawSync } from "node:zlib";

/**
 * Escritor de ZIP, feito aqui e não trazido de uma biblioteca.
 *
 * A razão não é gosto: `npm audit --omit=dev` precisa fechar em zero, e a
 * família de bibliotecas de compactação em JavaScript é justamente a que mais
 * publica aviso de travessia de diretório e de estouro de memória. O que este
 * arquivo precisa fazer cabe em duas estruturas do formato (cabeçalho local e
 * diretório central), e escrevê-las é menos risco do que carregar uma
 * dependência de runtime a mais num produto que guarda dado de cidadão.
 *
 * Duas propriedades governam o desenho:
 *
 * 1. **Sai como fluxo, não como um Buffer.** A saída de um município grande é
 *    dezenas de milhares de fotografias. Montar o pacote inteiro na memória do
 *    processo derrubaria o servidor no dia em que o município pedisse para
 *    sair, que é o pior dia possível para o servidor cair: é o dia em que ele
 *    está provando que não aprisiona ninguém.
 *
 * 2. **ZIP64 quando precisa, e só quando precisa.** Um pacote acima de 4 GB
 *    (ou com mais de 65535 arquivos) não cabe nos campos de 32 bits do formato
 *    clássico. Escrever ZIP64 sempre resolveria isso e criaria outro problema:
 *    ferramenta velha de prefeitura recusa o arquivo inteiro. Então o pacote
 *    pequeno sai clássico, legível em qualquer lugar, e só o grande usa a
 *    extensão.
 */

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_FIM_ZIP64 = 0x06064b50;
const ASSINATURA_LOCALIZADOR_ZIP64 = 0x07064b50;

/** Bit 11 do campo de bandeiras: o nome do arquivo está em UTF-8. */
const BANDEIRA_UTF8 = 0x0800;

const METODO_ARMAZENADO = 0;
const METODO_DEFLATE = 8;

/** O teto dos campos de 32 bits do formato clássico. */
const TETO_32_BITS = 0xffffffff;
const TETO_16_BITS = 0xffff;

export type EntradaZip = {
  /** Caminho dentro do pacote, com barras. Nunca começa com barra. */
  caminho: string;
  conteudo: Uint8Array;
  /**
   * Comprimir ou guardar como está.
   *
   * Texto (CSV, JSON, HTML) comprime muito e vale a pena. Fotografia já é
   * JPEG: passar o deflate nela gasta processador para crescer alguns bytes.
   */
  comprimir?: boolean;
  modificadoEm?: Date;
};

export type OpcoesZip = {
  /**
   * A partir de qual valor um campo precisa de ZIP64.
   *
   * Existe para o teste conseguir exercitar o caminho ZIP64 sem gerar quatro
   * gigabytes de dados. Um caminho que nunca roda em teste é um caminho que
   * ninguém sabe se funciona, e este só rodaria no pacote de saída de um
   * município grande, ou seja, exatamente onde não dá para descobrir defeito.
   */
  tetoDe32Bits?: number;
};

/**
 * CRC-32 (polinômio do IEEE 802.3), que o formato exige por entrada.
 *
 * É o que permite ao descompactador dizer "este arquivo veio corrompido" em
 * vez de entregar bytes trocados em silêncio. Num pacote que é prova
 * documental de ato administrativo, entregar em silêncio é o desfecho ruim.
 */
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[i] = c >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i += 1) {
    c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Data e hora no formato do MS-DOS, que é o que o ZIP guarda.
 *
 * Segundos com resolução de dois em dois e ano a partir de 1980, porque foi
 * assim que o formato nasceu. Data anterior a 1980 é achatada para 1980: o
 * campo não a representa, e escrever um número negativo produziria um pacote
 * que algumas ferramentas recusam.
 */
function dataDos(d: Date): { hora: number; data: number } {
  const ano = Math.max(1980, d.getFullYear());
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type EntradaEscrita = {
  nome: Buffer;
  crc: number;
  metodo: number;
  tamanhoComprimido: number;
  tamanhoOriginal: number;
  deslocamento: number;
  hora: number;
  data: number;
};

/**
 * Recebe as entradas uma a uma e devolve os pedaços do pacote na ordem.
 *
 * O consumidor típico é `Readable.from(fluxoZip(...))` numa resposta HTTP: a
 * fotografia atravessa o processo e é esquecida, em vez de ficar acumulada até
 * o fim.
 */
export async function* fluxoZip(
  entradas: AsyncIterable<EntradaZip>,
  opcoes: OpcoesZip = {},
): AsyncGenerator<Buffer> {
  const teto32 = opcoes.tetoDe32Bits ?? TETO_32_BITS;
  const escritas: EntradaEscrita[] = [];
  let deslocamento = 0;
  const vistos = new Set<string>();

  for await (const entrada of entradas) {
    const caminho = normalizarCaminho(entrada.caminho);
    /*
      Nome repetido é defeito e não detalhe: o descompactador sobrescreve o
      primeiro pelo segundo em silêncio, e o município recebe um pacote com
      menos arquivos do que o índice promete, sem nada avisando.
    */
    if (vistos.has(caminho)) {
      throw new Error(`Caminho repetido no pacote: ${caminho}`);
    }
    vistos.add(caminho);

    const nome = Buffer.from(caminho, "utf8");
    const original = Buffer.from(
      entrada.conteudo.buffer, entrada.conteudo.byteOffset, entrada.conteudo.byteLength,
    );
    const comprimir = entrada.comprimir ?? true;
    const corpo = comprimir ? deflateRawSync(original) : original;
    /*
      Comprimir e ficar maior acontece com arquivo já comprimido (JPEG, PNG).
      Guardar o menor dos dois evita que o pacote fique maior por causa da
      tentativa.
    */
    const usarDeflate = comprimir && corpo.length < original.length;
    const conteudoFinal = usarDeflate ? corpo : original;

    const { hora, data } = dataDos(entrada.modificadoEm ?? new Date());
    const crc = crc32(original);

    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(ASSINATURA_LOCAL, 0);
    // 20 = "2.0", que é a versão que introduziu o deflate. Nenhuma entrada
    // individual passa de 4 GB neste produto (o teto por fotografia é 15 MB),
    // então o cabeçalho local nunca precisa de ZIP64.
    cabecalho.writeUInt16LE(20, 4);
    cabecalho.writeUInt16LE(BANDEIRA_UTF8, 6);
    cabecalho.writeUInt16LE(usarDeflate ? METODO_DEFLATE : METODO_ARMAZENADO, 8);
    cabecalho.writeUInt16LE(hora, 10);
    cabecalho.writeUInt16LE(data, 12);
    cabecalho.writeUInt32LE(crc, 14);
    cabecalho.writeUInt32LE(conteudoFinal.length, 18);
    cabecalho.writeUInt32LE(original.length, 22);
    cabecalho.writeUInt16LE(nome.length, 26);
    cabecalho.writeUInt16LE(0, 28);

    escritas.push({
      nome,
      crc,
      metodo: usarDeflate ? METODO_DEFLATE : METODO_ARMAZENADO,
      tamanhoComprimido: conteudoFinal.length,
      tamanhoOriginal: original.length,
      deslocamento,
      hora,
      data,
    });

    yield cabecalho;
    yield nome;
    yield conteudoFinal;
    deslocamento += cabecalho.length + nome.length + conteudoFinal.length;
  }

  const inicioDoDiretorio = deslocamento;
  let tamanhoDoDiretorio = 0;

  for (const e of escritas) {
    /*
      Os três campos que podem estourar 32 bits, na ordem exata que o formato
      exige dentro do campo extra 0x0001: tamanho original, tamanho comprimido
      e deslocamento. Trocar a ordem produz um pacote que abre em algumas
      ferramentas e não em outras, que é o pior desfecho possível para um
      arquivo de saída definitiva.
    */
    const extras: bigint[] = [];
    const original = e.tamanhoOriginal > teto32 ? TETO_32_BITS : e.tamanhoOriginal;
    const comprimido = e.tamanhoComprimido > teto32 ? TETO_32_BITS : e.tamanhoComprimido;
    const desloc = e.deslocamento > teto32 ? TETO_32_BITS : e.deslocamento;
    if (original === TETO_32_BITS) extras.push(BigInt(e.tamanhoOriginal));
    if (comprimido === TETO_32_BITS) extras.push(BigInt(e.tamanhoComprimido));
    if (desloc === TETO_32_BITS) extras.push(BigInt(e.deslocamento));

    const extra = Buffer.alloc(extras.length > 0 ? 4 + extras.length * 8 : 0);
    if (extras.length > 0) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(extras.length * 8, 2);
      extras.forEach((v, i) => extra.writeBigUInt64LE(v, 4 + i * 8));
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ASSINATURA_CENTRAL, 0);
    // Byte alto 3 = UNIX, byte baixo = versão. Fica em 45 quando há ZIP64,
    // porque é a versão que descreve a extensão.
    central.writeUInt16LE((3 << 8) | (extras.length > 0 ? 45 : 20), 4);
    central.writeUInt16LE(extras.length > 0 ? 45 : 20, 6);
    central.writeUInt16LE(BANDEIRA_UTF8, 8);
    central.writeUInt16LE(e.metodo, 10);
    central.writeUInt16LE(e.hora, 12);
    central.writeUInt16LE(e.data, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(comprimido, 20);
    central.writeUInt32LE(original, 24);
    central.writeUInt16LE(e.nome.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    // 0o644 nos bits altos: sem isto o arquivo sai sem permissão de leitura em
    // alguns descompactadores de Linux, e o município recebe uma pasta que ele
    // não consegue abrir.
    central.writeUInt32LE(0o644 << 16, 38);
    central.writeUInt32LE(desloc, 42);

    yield central;
    yield e.nome;
    if (extra.length > 0) yield extra;
    tamanhoDoDiretorio += central.length + e.nome.length + extra.length;
  }

  const precisaZip64 =
    escritas.length > TETO_16_BITS
    || inicioDoDiretorio > teto32
    || tamanhoDoDiretorio > teto32;

  if (precisaZip64) {
    const fim64 = Buffer.alloc(56);
    fim64.writeUInt32LE(ASSINATURA_FIM_ZIP64, 0);
    // O tamanho declarado exclui os 12 primeiros bytes (assinatura e o próprio
    // campo), por definição do formato.
    fim64.writeBigUInt64LE(BigInt(44), 4);
    fim64.writeUInt16LE((3 << 8) | 45, 12);
    fim64.writeUInt16LE(45, 14);
    fim64.writeUInt32LE(0, 16);
    fim64.writeUInt32LE(0, 20);
    fim64.writeBigUInt64LE(BigInt(escritas.length), 24);
    fim64.writeBigUInt64LE(BigInt(escritas.length), 32);
    fim64.writeBigUInt64LE(BigInt(tamanhoDoDiretorio), 40);
    fim64.writeBigUInt64LE(BigInt(inicioDoDiretorio), 48);
    yield fim64;

    const localizador = Buffer.alloc(20);
    localizador.writeUInt32LE(ASSINATURA_LOCALIZADOR_ZIP64, 0);
    localizador.writeUInt32LE(0, 4);
    localizador.writeBigUInt64LE(BigInt(inicioDoDiretorio + tamanhoDoDiretorio), 8);
    localizador.writeUInt32LE(1, 16);
    yield localizador;
  }

  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(ASSINATURA_FIM, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(Math.min(escritas.length, TETO_16_BITS), 8);
  fim.writeUInt16LE(Math.min(escritas.length, TETO_16_BITS), 10);
  fim.writeUInt32LE(tamanhoDoDiretorio > teto32 ? TETO_32_BITS : tamanhoDoDiretorio, 12);
  fim.writeUInt32LE(inicioDoDiretorio > teto32 ? TETO_32_BITS : inicioDoDiretorio, 16);
  fim.writeUInt16LE(0, 20);
  yield fim;
}

/**
 * Impede que um nome vindo do banco escape da pasta do pacote.
 *
 * O nome do arquivo de evidência é derivado da chave de armazenamento, que já
 * nasce higienizada. Isto é a segunda tranca, e ela existe porque a primeira
 * está em outro pacote: `../../../etc/passwd` dentro de um ZIP é a travessia de
 * diretório clássica, e quem paga é o computador da prefeitura que extrai o
 * pacote, não este servidor.
 */
export function normalizarCaminho(bruto: string): string {
  const partes = bruto
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p !== "" && p !== "." && p !== "..")
    .map((p) => p.replace(/[\\:*?"<>|]/g, "_"));
  if (partes.length === 0) throw new Error("Caminho vazio no pacote");
  return partes.join("/");
}
