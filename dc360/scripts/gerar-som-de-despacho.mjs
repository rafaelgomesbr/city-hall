#!/usr/bin/env node
/**
 * Gera o SOM DE DESPACHO: `apps/campo/assets/sons/despacho.wav`.
 *
 * O pedido, na letra de quem paga: o celular do agente de campo deve
 * obrigatoriamente ser notificado, vibrado ou sonoro, de que recebeu uma nova
 * ocorrência, com som característico. "Característico" quer dizer que o agente
 * reconhece o despacho de olhos fechados, no bolso, no meio do barulho de
 * caminhão, sem confundir com o WhatsApp nem com o aviso de prazo, que continua
 * tocando o som padrão do sistema.
 *
 * ## Por que gerar por código, e não gravar um arquivo
 *
 * Pela mesma razão de `apps/campo/scripts/gerar-icones.mjs`: um binário
 * commitado envelhece em silêncio e ninguém sabe de onde ele veio. Aqui o som
 * está DESCRITO (duas notas, um intervalo, um envelope), e o arquivo é a
 * consequência. Quem quiser trocar o toque muda três constantes e roda de
 * novo. Sem dependência nova: são funções trigonométricas e um cabeçalho de
 * 44 bytes.
 *
 * ## O toque, e por que ele é assim
 *
 * Um sino de duas notas com decaimento, e não um alarme:
 *
 * - **Sol5 (784 Hz) e depois Dó6 (1046,5 Hz)**: uma quarta justa ascendente,
 *   que é o intervalo de "atenção, chegou algo" (é o mesmo da campainha e do
 *   toque de embarque), sem a tensão de um trítono nem a insistência de um
 *   bipe repetido. Sobe, não desce: uma coisa boa chegou, não uma coisa ruim.
 * - **Timbre de sino**: fundamental mais a oitava (menor) e a décima segunda
 *   (menor ainda). Sem os parciais a nota é um "bip" de relógio de pulso; com
 *   parciais demais vira sirene. Três é o que soa a metal e continua limpo em
 *   alto-falante de telefone barato.
 * - **Ataque de 8 ms e decaimento exponencial**: sem ataque, a onda começa num
 *   valor não nulo e o alto-falante estala. Sem decaimento, a nota corta seca e
 *   clica. A cauda dos últimos 60 ms é forçada a zero pelo mesmo motivo.
 * - **1,2 s no total**: curto o bastante para não ser alarme, longo o bastante
 *   para atravessar o bolso. Ver a régua em `som-de-despacho.test.mjs`.
 * - **Pico a -2 dBFS**: alto sem recortar no conversor de aparelho de entrada.
 *
 * ## Determinismo
 *
 * O mesmo arquivo a cada execução, byte a byte, e existe portão que confere
 * (`som-de-despacho.test.mjs`). Nenhuma fonte de aleatoriedade, nenhum relógio,
 * nenhuma dependência de plataforma além de `Math.sin` e `Math.exp` com
 * argumentos fixos.
 *
 * ## O que este roteiro NÃO faz
 *
 * Não põe o arquivo no binário. Quem faz isso é o plugin do `expo-notifications`
 * no `prebuild` (copia para `ios/<projeto>/despacho.wav` e para
 * `android/app/src/main/res/raw/despacho.wav`), a partir do caminho declarado
 * em `apps/campo/app.config.ts` (`sounds`). Depois de gerar, o `prebuild`
 * precisa rodar.
 *
 * Rodar (de dentro de `dc360`):
 *   node scripts/gerar-som-de-despacho.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DESTINO = join(RAIZ, "apps", "campo", "assets", "sons", "despacho.wav");

/* A régua do formato. A mesma que o portão confere, escrita lá também. */
const TAXA_HZ = 44_100;
const CANAIS = 1;
const BITS = 16;

/* O toque. */
const DURACAO_S = 1.2;
const NOTAS = [
  { hz: 783.99, comecaEm: 0.0 },   // Sol5
  { hz: 1046.5, comecaEm: 0.3 },   // Dó6, uma quarta justa acima
];
/** Os parciais do sino: múltiplo da fundamental e peso relativo. */
const PARCIAIS = [
  { multiplo: 1, peso: 1.0 },
  { multiplo: 2, peso: 0.35 },
  { multiplo: 3, peso: 0.12 },
];
const ATAQUE_S = 0.008;
/** Constante de tempo do decaimento: a nota cai a 37% em 0,28 s. */
const DECAIMENTO_S = 0.28;
const CAUDA_S = 0.06;
/** Pico final, em fração do fundo de escala (0,8 é cerca de -2 dBFS). */
const PICO = 0.8;

/**
 * O envelope de uma nota em `t` segundos desde o começo dela.
 *
 * Ataque em cosseno levantado (sobe suave, sem estalo) e decaimento
 * exponencial (a forma natural de um sino parando de vibrar).
 */
function envelope(t) {
  if (t < 0) return 0;
  const ataque = t < ATAQUE_S ? 0.5 * (1 - Math.cos((Math.PI * t) / ATAQUE_S)) : 1;
  return ataque * Math.exp(-t / DECAIMENTO_S);
}

/** A amostra em ponto flutuante, antes de normalizar. */
function amostraEm(segundos) {
  let soma = 0;
  for (const nota of NOTAS) {
    const t = segundos - nota.comecaEm;
    if (t < 0) continue;
    const env = envelope(t);
    for (const parcial of PARCIAIS) {
      soma += parcial.peso * env * Math.sin(2 * Math.PI * nota.hz * parcial.multiplo * t);
    }
  }
  return soma;
}

/** Os últimos milissegundos vão a zero, para o fim do arquivo não clicar. */
function cauda(segundos) {
  const restante = DURACAO_S - segundos;
  if (restante >= CAUDA_S) return 1;
  return Math.max(0, restante / CAUDA_S);
}

/** O WAV inteiro, como `Buffer`. Puro: mesma entrada, mesmos bytes. */
export function gerarSomDeDespacho() {
  const total = Math.round(DURACAO_S * TAXA_HZ);
  const cruas = new Float64Array(total);
  let pico = 0;
  for (let i = 0; i < total; i++) {
    const segundos = i / TAXA_HZ;
    const valor = amostraEm(segundos) * cauda(segundos);
    cruas[i] = valor;
    pico = Math.max(pico, Math.abs(valor));
  }

  const bytesPorAmostra = BITS / 8;
  const tamanhoDosDados = total * CANAIS * bytesPorAmostra;
  const bytes = Buffer.alloc(44 + tamanhoDosDados);

  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + tamanhoDosDados, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);                                   // tamanho do `fmt `
  bytes.writeUInt16LE(1, 20);                                    // PCM linear
  bytes.writeUInt16LE(CANAIS, 22);
  bytes.writeUInt32LE(TAXA_HZ, 24);
  bytes.writeUInt32LE(TAXA_HZ * CANAIS * bytesPorAmostra, 28);   // bytes por segundo
  bytes.writeUInt16LE(CANAIS * bytesPorAmostra, 32);             // alinhamento de bloco
  bytes.writeUInt16LE(BITS, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(tamanhoDosDados, 40);

  const escala = (PICO * 32767) / pico;
  for (let i = 0; i < total; i++) {
    bytes.writeInt16LE(Math.round(cruas[i] * escala), 44 + i * bytesPorAmostra);
  }
  return bytes;
}

function principal() {
  mkdirSync(dirname(DESTINO), { recursive: true });
  const bytes = gerarSomDeDespacho();
  writeFileSync(DESTINO, bytes);
  console.log(`Som de despacho gerado: ${DESTINO} (${bytes.length} bytes, ${DURACAO_S} s, mono, ${TAXA_HZ} Hz, ${BITS} bits)`);
  console.log("Lembre do prebuild: é ele que copia o arquivo para os projetos nativos.");
}

/* Só executa quando chamado como programa; o portão importa `gerarSomDeDespacho`. */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  principal();
}
