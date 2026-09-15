/**
 * O SOM DE DESPACHO, conferido por máquina.
 *
 * O pedido, na letra de quem paga: o celular do agente de campo deve
 * obrigatoriamente ser notificado, vibrado ou sonoro, de que recebeu uma nova
 * ocorrência, com som característico. O som é `apps/campo/assets/sons/despacho.wav`,
 * gerado por `gerar-som-de-despacho.mjs` e versionado no repositório.
 *
 * ## O que este portão trava, e por que cada régua existe
 *
 * As duas lojas são exigentes com o arquivo de som, e as duas falham CALADAS
 * quando ele está fora da régua: a notificação chega, o texto aparece, e o som
 * que toca é o padrão do sistema (ou nenhum). Ninguém vê erro em lugar nenhum.
 *
 * - **iOS**: som de notificação precisa ser Linear PCM (ou IMA4, µLaw, aLaw) em
 *   `aiff`, `wav` ou `caf`, com até 30 segundos. Fora disso o sistema toca o
 *   som padrão sem avisar.
 * - **Android**: o arquivo é copiado para `res/raw` pelo plugin do
 *   `expo-notifications`, e o nome vira identificador de recurso, então ele
 *   precisa ser nome válido de recurso (minúsculas, sem hífen). `wav` é aceito.
 * - **Entre 0,8 s e 1,5 s**: curto o bastante para não virar alarme, longo o
 *   bastante para ser ouvido no bolso, na rua. Uma nota só com 200 ms some no
 *   barulho; cinco segundos de sino é o que faz alguém calar o aplicativo.
 * - **Mono, 44,1 kHz, 16 bits**: o formato mais simples que as duas plataformas
 *   tocam sem conversão. Estéreo dobra o tamanho para um alto-falante só.
 *
 * ## Por que o arquivo é comparado byte a byte com a saída do roteiro
 *
 * O `.wav` é versionado (o plugin do Expo o lê do disco no `prebuild`, e o
 * roteiro não roda ali). Se alguém mudar o roteiro e esquecer de gerar de
 * novo, o repositório passa a ter dois sons: o que o código descreve e o que
 * o aparelho toca. Este caso reprova nesse dia, e a correção é uma linha:
 * `node scripts/gerar-som-de-despacho.mjs`.
 *
 * ## Por que mora em `scripts/`
 *
 * Mesma razão dos outros portões do aplicativo (`entitlements-do-ios.test.mjs`,
 * `abertura-do-aplicativo.test.mjs`): isto lê arquivo, e o pacote do aplicativo
 * roda em `jest-expo`, sem `node:fs`.
 *
 * ## O que ele NÃO prova, dito na cara
 *
 * Que o som toca num aparelho, e como ele soa. O cabeçalho estar certo é
 * condição necessária, não suficiente: o `prebuild` precisa copiar o arquivo
 * para os projetos nativos, e só o telefone na mão diz se o toque é ouvido.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ARQUIVO = join(RAIZ, "apps", "campo", "assets", "sons", "despacho.wav");

/*
  A RÉGUA fica escrita AQUI, e não importada do roteiro. Se o teste lesse as
  constantes do gerador, mudar o gerador para estéreo a 22 kHz mudaria a régua
  junto, e o portão passaria a afirmar "o arquivo é o que o arquivo é".
*/
const REGUA = {
  formato: 1,          // PCM linear, sem compressão
  canais: 1,           // mono
  taxa: 44_100,        // Hz
  bits: 16,
  duracaoMinimaS: 0.8,
  duracaoMaximaS: 1.5,
};

/**
 * Lê o cabeçalho de um WAV canônico (RIFF, `fmt ` de 16 bytes, `data`).
 *
 * Deliberadamente estrito: só aceita o layout de 44 bytes que o roteiro
 * escreve. Um WAV com pedaço `LIST` no meio, ou `fmt ` estendido, é um WAV
 * que não saiu do roteiro, e é isso que o portão quer saber.
 */
export function lerCabecalhoDoWav(bytes) {
  if (bytes.length < 44) throw new Error(`arquivo com ${bytes.length} bytes: menor que um cabeçalho de WAV`);
  const texto = (de, ate) => bytes.toString("ascii", de, ate);
  if (texto(0, 4) !== "RIFF") throw new Error("não começa com RIFF");
  if (texto(8, 12) !== "WAVE") throw new Error("não é WAVE");
  if (texto(12, 16) !== "fmt ") throw new Error("o primeiro pedaço não é `fmt `");
  const tamanhoDoFmt = bytes.readUInt32LE(16);
  if (tamanhoDoFmt !== 16) throw new Error(`\`fmt \` com ${tamanhoDoFmt} bytes: esperava 16 (PCM simples)`);
  if (texto(36, 40) !== "data") throw new Error("o segundo pedaço não é `data`");

  const cabecalho = {
    tamanhoRiff: bytes.readUInt32LE(4),
    formato: bytes.readUInt16LE(20),
    canais: bytes.readUInt16LE(22),
    taxa: bytes.readUInt32LE(24),
    bytesPorSegundo: bytes.readUInt32LE(28),
    alinhamento: bytes.readUInt16LE(32),
    bits: bytes.readUInt16LE(34),
    tamanhoDosDados: bytes.readUInt32LE(40),
  };
  cabecalho.duracaoS = cabecalho.tamanhoDosDados / cabecalho.bytesPorSegundo;
  return cabecalho;
}

/** As reprovações, todas de uma vez: quem corrige quer a lista inteira. */
export function conferirRegua(cabecalho, tamanhoDoArquivo) {
  const problemas = [];
  if (cabecalho.formato !== REGUA.formato) problemas.push(`formato ${cabecalho.formato}: o iOS só aceita PCM linear (1)`);
  if (cabecalho.canais !== REGUA.canais) problemas.push(`${cabecalho.canais} canais: o som de notificação é mono`);
  if (cabecalho.taxa !== REGUA.taxa) problemas.push(`${cabecalho.taxa} Hz: a régua é ${REGUA.taxa}`);
  if (cabecalho.bits !== REGUA.bits) problemas.push(`${cabecalho.bits} bits: a régua é ${REGUA.bits}`);
  if (cabecalho.duracaoS < REGUA.duracaoMinimaS) problemas.push(`${cabecalho.duracaoS.toFixed(3)} s: curto demais para ser ouvido no bolso (mínimo ${REGUA.duracaoMinimaS} s)`);
  if (cabecalho.duracaoS > REGUA.duracaoMaximaS) problemas.push(`${cabecalho.duracaoS.toFixed(3)} s: isso é alarme, não toque (máximo ${REGUA.duracaoMaximaS} s)`);
  if (cabecalho.bytesPorSegundo !== cabecalho.taxa * cabecalho.canais * (cabecalho.bits / 8)) problemas.push("bytes por segundo não batem com taxa, canais e bits");
  if (cabecalho.alinhamento !== cabecalho.canais * (cabecalho.bits / 8)) problemas.push("alinhamento de bloco não bate com canais e bits");
  if (cabecalho.tamanhoRiff !== tamanhoDoArquivo - 8) problemas.push("o tamanho RIFF não bate com o tamanho do arquivo");
  if (cabecalho.tamanhoDosDados !== tamanhoDoArquivo - 44) problemas.push("o tamanho de `data` não bate com o tamanho do arquivo");
  return problemas;
}

/** Amostras de 16 bits, para olhar o conteúdo e não só o cabeçalho. */
function amostras(bytes) {
  const lidas = [];
  for (let i = 44; i + 1 < bytes.length; i += 2) lidas.push(bytes.readInt16LE(i));
  return lidas;
}

test("o som de despacho existe no repositório", () => {
  assert.ok(
    existsSync(ARQUIVO),
    `${ARQUIVO} não existe. Sem ele o plugin do expo-notifications falha no prebuild ` +
    "(iOS) ou copia nada (Android), e o despacho chega com o som padrão do sistema, " +
    "que não é o característico que o pedido exige. Gere: node scripts/gerar-som-de-despacho.mjs",
  );
});

test("o cabeçalho do som está dentro da régua das duas lojas", { skip: !existsSync(ARQUIVO) && "sem o arquivo" }, () => {
  const bytes = readFileSync(ARQUIVO);
  const cabecalho = lerCabecalhoDoWav(bytes);
  const problemas = conferirRegua(cabecalho, bytes.length);
  assert.deepEqual(problemas, [], `despacho.wav fora da régua:\n  ${problemas.join("\n  ")}`);
});

test("o arquivo versionado é exatamente o que o roteiro gera hoje", { skip: !existsSync(ARQUIVO) && "sem o arquivo" }, async () => {
  /*
    Duas coisas de uma vez: o roteiro é determinístico (a mesma chamada, o
    mesmo byte), e ninguém mudou o roteiro sem gerar de novo. Se isto reprovar,
    rode `node scripts/gerar-som-de-despacho.mjs` e confira o diff.

    Importado aqui dentro, e não no topo: sem o roteiro, o caso de cima é o
    que deve reprovar, com a mensagem que diz o que fazer, e não o carregador
    de módulos do Node com um rastro de pilha.
  */
  const { gerarSomDeDespacho } = await import("./gerar-som-de-despacho.mjs");
  const gerado = gerarSomDeDespacho();
  const segundaVez = gerarSomDeDespacho();
  assert.ok(gerado.equals(segundaVez), "duas execuções do roteiro produziram bytes diferentes: ele deixou de ser determinístico");
  assert.ok(
    readFileSync(ARQUIVO).equals(gerado),
    "despacho.wav no disco difere do que o roteiro gera. Gere de novo: node scripts/gerar-som-de-despacho.mjs",
  );
});

test("o som não estala nem estoura: começa e termina em silêncio, e o pico fica abaixo do teto", { skip: !existsSync(ARQUIVO) && "sem o arquivo" }, () => {
  const lidas = amostras(readFileSync(ARQUIVO));
  const pico = Math.max(...lidas.map(Math.abs));
  // Um som que toca a 32767 recorta no conversor barato de aparelho de entrada.
  assert.ok(pico < 32767 * 0.95, `pico em ${pico}: perto demais do teto, recorta em aparelho barato`);
  // E um som que ninguém ouve não cumpre o pedido.
  assert.ok(pico > 32767 * 0.3, `pico em ${pico}: baixo demais para ser ouvido no bolso`);
  // Envelope: sem ataque instantâneo (estalo) e sem corte seco no fim (clique).
  const primeira = Math.abs(lidas[0]);
  const ultima = Math.abs(lidas[lidas.length - 1]);
  assert.ok(primeira < 32767 * 0.01, `a primeira amostra é ${primeira}: o som começa com estalo`);
  assert.ok(ultima < 32767 * 0.01, `a última amostra é ${ultima}: o som termina com clique`);
});

/* ------------------------------------------------------------------------
   Os casos-irmãos: a régua MORDE.

   Um portão que só viu arquivo bom nunca provou que reprova arquivo ruim.
   Cada caso abaixo forja um WAV com um defeito só, e espera a reprovação
   nomeando esse defeito.
   ------------------------------------------------------------------------ */

/** Um WAV de mentira, só cabeçalho e zeros, com os campos que o caso pedir. */
function wavForjado({ formato = 1, canais = 1, taxa = 44_100, bits = 16, duracaoS = 1.0 }) {
  const bytesPorAmostra = bits / 8;
  const tamanhoDosDados = Math.round(duracaoS * taxa) * canais * bytesPorAmostra;
  const bytes = Buffer.alloc(44 + tamanhoDosDados);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + tamanhoDosDados, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(formato, 20);
  bytes.writeUInt16LE(canais, 22);
  bytes.writeUInt32LE(taxa, 24);
  bytes.writeUInt32LE(taxa * canais * bytesPorAmostra, 28);
  bytes.writeUInt16LE(canais * bytesPorAmostra, 32);
  bytes.writeUInt16LE(bits, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(tamanhoDosDados, 40);
  return bytes;
}

function reprovacoesDe(forjado) {
  return conferirRegua(lerCabecalhoDoWav(forjado), forjado.length);
}

test("a régua aceita um WAV forjado dentro dela (senão os casos abaixo não provam nada)", () => {
  assert.deepEqual(reprovacoesDe(wavForjado({})), []);
});

test("a régua reprova estéreo", () => {
  assert.match(reprovacoesDe(wavForjado({ canais: 2 })).join("\n"), /2 canais/);
});

test("a régua reprova 22 kHz", () => {
  assert.match(reprovacoesDe(wavForjado({ taxa: 22_050 })).join("\n"), /22050 Hz/);
});

test("a régua reprova 8 bits", () => {
  assert.match(reprovacoesDe(wavForjado({ bits: 8 })).join("\n"), /8 bits/);
});

test("a régua reprova formato comprimido", () => {
  // 3 é IEEE float; 85 é MP3 dentro de WAV. Nenhum dos dois toca no iOS.
  assert.match(reprovacoesDe(wavForjado({ formato: 3 })).join("\n"), /formato 3/);
});

test("a régua reprova o toque curto demais", () => {
  assert.match(reprovacoesDe(wavForjado({ duracaoS: 0.3 })).join("\n"), /curto demais/);
});

test("a régua reprova o toque longo demais", () => {
  assert.match(reprovacoesDe(wavForjado({ duracaoS: 2.0 })).join("\n"), /alarme/);
});

test("a régua reprova cabeçalho que mente sobre o tamanho", () => {
  const forjado = wavForjado({});
  forjado.writeUInt32LE(forjado.length, 4); // RIFF deveria ser tamanho - 8
  assert.match(reprovacoesDe(forjado).join("\n"), /tamanho RIFF/);
});

test("o leitor recusa o que não é WAV", () => {
  assert.throws(() => lerCabecalhoDoWav(Buffer.from("isto é um mp3, juro")), /menor que um cabeçalho|RIFF/);
  const quaseWav = wavForjado({});
  quaseWav.write("LIST", 12, "ascii");
  assert.throws(() => lerCabecalhoDoWav(quaseWav), /fmt/);
});
