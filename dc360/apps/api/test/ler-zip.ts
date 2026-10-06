import { inflateRawSync } from "node:zlib";

/**
 * Leitor de ZIP independente do escritor do produto (V2-F00-E11).
 *
 * O produto escreve o pacote sem biblioteca (`src/saida/zip.ts`). Conferir o
 * resultado com a mesma função que o escreveu não provaria nada: um erro de
 * deslocamento passaria nos dois lados. Este leitor parte do diretório
 * central, que é como todo descompactador de verdade lê um ZIP.
 *
 * É a mesma lógica de `saida-de-municipio.test.ts` (que a mantém no próprio
 * arquivo, de propósito, e não foi tocada nesta etapa), posta num módulo para
 * os testes novos a importarem. O e2e do painel (`.mjs`) tem leitor próprio.
 */

export function lerZip(bytes: Buffer): Map<string, Buffer> {
  let fim = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("não é um ZIP: fim do diretório central não encontrado");

  let total = bytes.readUInt16LE(fim + 10);
  let inicioDoDiretorio = bytes.readUInt32LE(fim + 16);

  // ZIP64: o localizador fica nos 20 bytes imediatamente antes do fim clássico.
  if (total === 0xffff || inicioDoDiretorio === 0xffffffff) {
    const localizador = fim - 20;
    if (bytes.readUInt32LE(localizador) !== 0x07064b50) {
      throw new Error("ZIP64 anunciado e localizador ausente");
    }
    const fim64 = Number(bytes.readBigUInt64LE(localizador + 8));
    if (bytes.readUInt32LE(fim64) !== 0x06064b50) {
      throw new Error("ZIP64: fim do diretório central não encontrado");
    }
    total = Number(bytes.readBigUInt64LE(fim64 + 32));
    inicioDoDiretorio = Number(bytes.readBigUInt64LE(fim64 + 48));
  }

  const arquivos = new Map<string, Buffer>();
  let p = inicioDoDiretorio;

  for (let n = 0; n < total; n += 1) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error("entrada central inválida");
    const metodo = bytes.readUInt16LE(p + 10);
    let comprimido = bytes.readUInt32LE(p + 20);
    let original = bytes.readUInt32LE(p + 24);
    const tamanhoNome = bytes.readUInt16LE(p + 28);
    const tamanhoExtra = bytes.readUInt16LE(p + 30);
    const tamanhoComentario = bytes.readUInt16LE(p + 32);
    let deslocamento = bytes.readUInt32LE(p + 42);
    const nome = bytes.subarray(p + 46, p + 46 + tamanhoNome).toString("utf8");

    if (original === 0xffffffff || comprimido === 0xffffffff || deslocamento === 0xffffffff) {
      const extra = bytes.subarray(p + 46 + tamanhoNome, p + 46 + tamanhoNome + tamanhoExtra);
      let q = 0;
      while (q + 4 <= extra.length) {
        const id = extra.readUInt16LE(q);
        const tam = extra.readUInt16LE(q + 2);
        if (id === 0x0001) {
          let r = q + 4;
          if (original === 0xffffffff) { original = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (comprimido === 0xffffffff) { comprimido = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (deslocamento === 0xffffffff) { deslocamento = Number(extra.readBigUInt64LE(r)); }
          break;
        }
        q += 4 + tam;
      }
    }

    const nomeLocal = bytes.readUInt16LE(deslocamento + 26);
    const extraLocal = bytes.readUInt16LE(deslocamento + 28);
    const inicio = deslocamento + 30 + nomeLocal + extraLocal;
    const cru = bytes.subarray(inicio, inicio + comprimido);
    const conteudo = metodo === 8 ? inflateRawSync(cru) : Buffer.from(cru);
    if (conteudo.length !== original) {
      throw new Error(`tamanho divergente em ${nome}: ${conteudo.length} != ${original}`);
    }
    arquivos.set(nome, conteudo);

    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return arquivos;
}
