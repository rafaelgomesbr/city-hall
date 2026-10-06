/**
 * O "aparelho" de uma sessão, em uma frase curta, a partir do user-agent.
 *
 * POR QUE RESUMIR, E NÃO MOSTRAR O TEXTO: o user-agent completo é uma linha de
 * 100 a 300 caracteres que identifica a máquina quase individualmente (versão
 * exata do navegador, do sistema e do motor), e a tela de sessões não precisa
 * disso para cumprir o único trabalho dela: a pessoa reconhecer "este é o meu
 * celular, aquele é o computador da recepção que eu esqueci aberto". Dado a
 * menos que sai do servidor é dado a menos que vaza (IDN-29 do REL:06).
 *
 * O IP não passa por aqui nem sai em rota nenhuma de sessão: ele continua
 * guardado só para investigação.
 *
 * A lista é de propósito curta e conservadora. User-agent é texto livre que o
 * cliente escreve como quiser, então o que não bate com nenhum padrão conhecido
 * vira "Aparelho não identificado" em vez de um palpite.
 */

const APLICATIVO_DE_CAMPO = "Aplicativo de campo";
const NAO_IDENTIFICADO = "Aparelho não identificado";

/**
 * O navegador, do mais específico para o mais genérico: o Edge e o Opera
 * também dizem "Chrome", e o Chrome também diz "Safari".
 */
function navegadorDe(ua: string): string | null {
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bOPR\//.test(ua)) return "Opera";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "Firefox";
  // "HeadlessChrome" é o Chrome sem janela (testes automatizados): é o mesmo navegador.
  if (/(?:\b|Headless)Chrome\/|\bCriOS\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "Safari";
  return null;
}

/** O sistema. Android antes de Linux, porque o user-agent do Android diz os dois. */
function sistemaDe(ua: string): string | null {
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/\biPhone\b|\biPad\b|\biPod\b/.test(ua)) return "iOS";
  if (/\bWindows\b/.test(ua)) return "Windows";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS";
  if (/\bCrOS\b/.test(ua)) return "ChromeOS";
  if (/\bLinux\b|\bX11\b/.test(ua)) return "Linux";
  return null;
}

/**
 * O app de campo fala por uma biblioteca de rede nativa (OkHttp no Android,
 * CFNetwork no iOS) ou pelo identificador do Expo, e nunca por um navegador.
 */
function ehOAplicativo(ua: string): boolean {
  return /\bokhttp\//i.test(ua) || /\bCFNetwork\//.test(ua) || /\bExpo\b/i.test(ua)
    || /\bdc360-campo\b/i.test(ua);
}

export function resumirAparelho(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").trim();
  if (ua === "") return NAO_IDENTIFICADO;
  if (ehOAplicativo(ua)) return APLICATIVO_DE_CAMPO;

  const navegador = navegadorDe(ua);
  const sistema = sistemaDe(ua);
  if (navegador && sistema) return `${navegador} em ${sistema}`;
  if (navegador) return navegador;
  if (sistema) return `Aparelho com ${sistema}`;
  return NAO_IDENTIFICADO;
}
