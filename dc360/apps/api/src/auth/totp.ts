import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * O código de seis dígitos do aplicativo de autenticação (RFC 6238).
 *
 * Implementado aqui, e não trazido de uma biblioteca, por dois motivos que
 * valem mais que a economia de trinta linhas: o algoritmo inteiro é um HMAC
 * mais uma truncagem (está todo neste arquivo, e cabe numa revisão), e a régua
 * de segurança da casa diz que dependência com vulnerabilidade conhecida em
 * runtime é bug, não pendência. Cada pacote a mais no caminho da autenticação
 * é um mantenedor a mais em quem confiar para sempre.
 *
 * PARÂMETROS FIXOS: SHA-1, passo de 30 segundos, 6 dígitos. Não são
 * configuráveis de propósito. É o que todo aplicativo de autenticação lê sem
 * perguntar (Google Authenticator, 1Password, Authy, Bitwarden), e um município
 * que precisasse explicar ao servidor como configurar "período" e "algoritmo"
 * no aplicativo já teria perdido a pessoa no meio do caminho.
 *
 * SHA-1 aqui NÃO é o SHA-1 quebrado das manchetes. O que caiu foi resistência
 * a COLISÃO, que é irrelevante para HMAC: o ataque de colisão exige escolher
 * as duas mensagens, e aqui a mensagem é um contador de tempo. HMAC-SHA-1
 * continua sendo o que a RFC 6238 especifica e o que os aplicativos
 * implementam.
 */

const PASSO_SEGUNDOS = 30;
const DIGITOS = 6;

/**
 * A tolerância, em passos, para cada lado.
 *
 * UM, e não mais. Cada passo a mais multiplica por três o número de códigos
 * válidos ao mesmo tempo e estica a janela em que um código lido por cima do
 * ombro continua servindo. Um passo cobre o relógio do telefone atrasado
 * alguns segundos e a pessoa que digita devagar, que são os dois casos reais;
 * quem tem o relógio errado em minutos precisa corrigir o relógio, e o
 * aplicativo de autenticação avisa isso sozinho.
 */
const TOLERANCIA_EM_PASSOS = 1;

/* ==========================================================================
   Base32, que é o alfabeto em que os aplicativos leem o segredo
   ========================================================================== */

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Codificar(bytes: Buffer): string {
  let bits = 0;
  let acumulado = 0;
  let saida = "";
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(acumulado << (5 - bits)) & 31];
  // Sem o preenchimento com "=" de propósito: aplicativo de autenticação
  // nenhum o espera, e o sinal de igual quebra a URI do código QR.
  return saida;
}

/** Devolve `null` para qualquer coisa que não seja base32 legível. */
export function base32Decodificar(texto: string): Buffer | null {
  // Espaço e minúscula entram porque a pessoa digita o segredo à mão quando a
  // câmera não lê o código QR, e o painel o mostra em grupos de quatro.
  const limpo = texto.replace(/[\s-]/g, "").toUpperCase();
  if (limpo.length === 0) return null;

  let bits = 0;
  let acumulado = 0;
  const bytes: number[] = [];
  for (const simbolo of limpo) {
    const valor = ALFABETO_BASE32.indexOf(simbolo);
    if (valor < 0) return null;
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/* ==========================================================================
   O segredo e o código
   ========================================================================== */

/**
 * Vinte bytes, que é o tamanho recomendado pela RFC 4226 para HMAC-SHA-1.
 *
 * Dá 32 símbolos em base32, que é o que a pessoa vai digitar à mão quando a
 * câmera do computador não ler o código QR. Mais que isso não acrescenta
 * segurança nenhuma (o HMAC já usa a chave inteira) e acrescenta erro de
 * digitação, que volta como chamado de suporte.
 */
export function gerarSegredoTotp(): string {
  return base32Codificar(randomBytes(20));
}

/** O passo de tempo corrente. É ele que fica queimado depois de usado. */
export function passoDe(agora: Date): number {
  return Math.floor(agora.getTime() / 1000 / PASSO_SEGUNDOS);
}

/**
 * O código de um passo, pelo algoritmo da RFC 4226 (truncagem dinâmica).
 *
 * O contador vai como oito bytes em ordem de rede. `BigInt` aqui não é
 * preciosismo: com deslocamento de 32 bits em número comum, o passo (que passa
 * de 57 milhões hoje) seria truncado, e o servidor calcularia códigos que
 * aplicativo nenhum gera.
 */
export function codigoTotp(segredo: Buffer, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));

  const resumo = createHmac("sha1", segredo).update(contador).digest();
  const deslocamento = resumo[resumo.length - 1]! & 0x0f;
  const binario =
    ((resumo[deslocamento]! & 0x7f) << 24) |
    ((resumo[deslocamento + 1]! & 0xff) << 16) |
    ((resumo[deslocamento + 2]! & 0xff) << 8) |
    (resumo[deslocamento + 3]! & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

/**
 * Confere o código digitado e devolve o passo que ele consumiu.
 *
 * `ultimoPasso` é o que impede o mesmo número de valer duas vezes: um código
 * de passo já usado (ou anterior a ele) é recusado mesmo estando dentro da
 * janela de tolerância. Sem isso, quem enxergou a tela por cima do ombro, ou
 * leu o print mandado no grupo do plantão, entra com o mesmo número enquanto a
 * janela não virar.
 *
 * A comparação é `timingSafeEqual` pelo mesmo motivo da senha: comparar com
 * `===` vaza pelo tempo quantos dígitos iniciais bateram, e são só seis.
 */
export function conferirTotp(
  segredo: Buffer,
  codigoDigitado: string,
  agora: Date,
  ultimoPasso: number | null,
): { passo: number } | null {
  const limpo = codigoDigitado.replace(/\D/g, "");
  if (limpo.length !== DIGITOS) return null;

  const atual = passoDe(agora);
  for (let d = -TOLERANCIA_EM_PASSOS; d <= TOLERANCIA_EM_PASSOS; d++) {
    const passo = atual + d;
    if (ultimoPasso !== null && passo <= ultimoPasso) continue;
    if (iguais(codigoTotp(segredo, passo), limpo)) return { passo };
  }
  return null;
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * O endereço que vira o código QR, no formato que os aplicativos leem.
 *
 * O rótulo carrega o email da pessoa porque é o que aparece na lista do
 * aplicativo dela, e quem trabalha em dois municípios (acontece, com servidor
 * cedido) precisa distinguir as duas entradas. O emissor entra duas vezes, no
 * rótulo e no parâmetro, porque aplicativo antigo lê um e aplicativo novo lê o
 * outro.
 */
export function uriDeAtivacao(
  segredo: string,
  conta: string,
  emissor: string,
): string {
  const rotulo = `${encodeURIComponent(emissor)}:${encodeURIComponent(conta)}`;
  const parametros = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}

/* ==========================================================================
   Códigos de recuperação
   ========================================================================== */

/**
 * O mesmo alfabeto ditável da senha temporária (`auth/senha.ts`): sem `l`,
 * `o`, `0` e `1`, porque este código vai ser copiado à mão para um papel
 * guardado na gaveta do coordenador, e `l` e `1` são o mesmo risco de leitura.
 *
 * São 32 símbolos, exatamente uma potência de dois, e o sorteio usa `byte & 31`
 * sobre bytes criptográficos: com alfabeto que não divide 256, o resto do
 * módulo tornaria os primeiros símbolos mais prováveis, e entropia anunciada
 * maior que a real é a definição de credencial fraca que parece forte.
 */
const ALFABETO_DITAVEL = "abcdefghijkmnpqrstuvwxyz23456789";
const SIMBOLOS_POR_GRUPO = 4;
const GRUPOS = 4;

/**
 * Quantos códigos são entregues de uma vez.
 *
 * Oito cobre a vida útil real (troca de telefone, telefone quebrado, telefone
 * esquecido em casa, telefone reiniciado de fábrica pela prefeitura) sem virar
 * uma lista tão longa que ninguém guarda. Menos que isso e a pessoa fica sem
 * saída no segundo aperto.
 */
export const CODIGOS_DE_RECUPERACAO = 8;

/**
 * Dezesseis símbolos, 80 bits, no formato `xxxx-xxxx-xxxx-xxxx`.
 *
 * O tamanho é o que permite guardar só o resumo SHA-256 sem sal, como o token
 * de sessão faz (migração 002): contra 80 bits sorteados não existe dicionário
 * nem força bruta, e derivação cara aqui custaria oito verificações de 128 MB
 * a cada tentativa de entrada, num caminho que roda enquanto alguém espera
 * para entrar no sistema no meio de um temporal.
 */
export function gerarCodigoDeRecuperacao(): string {
  const bytes = randomBytes(SIMBOLOS_POR_GRUPO * GRUPOS);
  const simbolos = Array.from(bytes, (b) => ALFABETO_DITAVEL[b & 31]!);
  const grupos: string[] = [];
  for (let i = 0; i < GRUPOS; i++) {
    grupos.push(simbolos.slice(i * SIMBOLOS_POR_GRUPO, (i + 1) * SIMBOLOS_POR_GRUPO).join(""));
  }
  return grupos.join("-");
}

/**
 * Tira hífen, espaço e maiúscula antes de comparar.
 *
 * Quem digita um código de papel escreve com espaço, sem hífen, ou em
 * maiúscula, e recusar por isso seria transformar a saída de emergência em
 * mais um obstáculo no pior momento possível. O que a normalização NÃO faz é
 * aceitar símbolo fora do alfabeto: aí é código errado mesmo.
 */
export function normalizarCodigoDeRecuperacao(codigo: string): string {
  return codigo.replace(/[\s-]/g, "").toLowerCase();
}

/** O que vai para o banco é sempre o resumo, nunca o código. */
export function resumoDoCodigo(codigo: string): string {
  return createHash("sha256")
    .update(normalizarCodigoDeRecuperacao(codigo))
    .digest("base64url");
}
