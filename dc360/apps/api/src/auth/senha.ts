import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// `promisify` perde a sobrecarga que aceita opções, e sem opções o scrypt
// roda com N = 16384, bem abaixo do que o ASVS pede. Daí o invólucro tipado.
function scryptAsync(
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, tamanho, opcoes, (erro, chave) => {
      if (erro) rejeitar(erro);
      else resolver(chave);
    });
  });
}

/**
 * Derivação de senha com scrypt.
 *
 * scrypt em vez de bcrypt ou argon2 por três razões concretas: está na lista
 * aprovada do OWASP ASVS 4.0 (2.4.3), vem no `node:crypto` (nenhuma
 * dependência nova, nenhum módulo nativo para compilar em cada servidor) e é
 * duro contra hardware dedicado por exigir memória, não só CPU.
 *
 * Parâmetros: N = 2^17, r = 8, p = 1, cerca de 128 MB por verificação. O
 * OWASP subiu o piso recomendado de 2^16 para 2^17: o comentário antigo dizia
 * "é o que o ASVS pede como piso" e envelheceu quando a régua externa se
 * moveu. Senhas já derivadas com N antigo continuam válidas: o formato guarda
 * o N usado e a verificação lê o N do próprio hash, então só as novas usam o
 * teto mais alto.
 */
const N = 131_072;
const R = 8;
const P = 1;
const BYTES_CHAVE = 32;
const BYTES_SAL = 16;
// O padrão do Node recusaria N=2^16 por exceder o limite de memória.
const MEMORIA_MAXIMA = 160 * 1024 * 1024;

const PREFIXO = "scrypt";

/** Formato armazenado: scrypt$N$r$p$sal$hash, tudo em base64url. */
export async function derivarSenha(senha: string): Promise<string> {
  const sal = randomBytes(BYTES_SAL);
  const chave = await scryptAsync(senha.normalize("NFKC"), sal, BYTES_CHAVE, {
    N, r: R, p: P, maxmem: MEMORIA_MAXIMA,
  });
  return [
    PREFIXO, N, R, P,
    sal.toString("base64url"),
    chave.toString("base64url"),
  ].join("$");
}

/**
 * Confere a senha contra o hash armazenado.
 *
 * A comparação usa `timingSafeEqual`: comparar com `===` vaza, pelo tempo de
 * resposta, quantos bytes iniciais bateram, e isso é suficiente para descobrir
 * o hash byte a byte.
 */
export async function conferirSenha(senha: string, armazenado: string | null): Promise<boolean> {
  if (!armazenado) return false;

  const partes = armazenado.split("$");
  if (partes.length !== 6 || partes[0] !== PREFIXO) return false;

  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let sal: Buffer;
  let esperado: Buffer;
  try {
    sal = Buffer.from(partes[4]!, "base64url");
    esperado = Buffer.from(partes[5]!, "base64url");
  } catch {
    return false;
  }
  if (esperado.length !== BYTES_CHAVE) return false;

  const calculado = await scryptAsync(senha.normalize("NFKC"), sal, esperado.length, {
    N: n, r, p, maxmem: MEMORIA_MAXIMA,
  });

  return timingSafeEqual(calculado, esperado);
}

/**
 * Trabalho equivalente ao de uma verificação real, para quando o email não
 * existe. Sem isso, a diferença de tempo entre "email desconhecido" e "senha
 * errada" entrega quais emails estão cadastrados.
 */
export async function gastarTempoEquivalente(): Promise<void> {
  await scryptAsync("senha-inexistente", randomBytes(BYTES_SAL), BYTES_CHAVE, {
    N, r: R, p: P, maxmem: MEMORIA_MAXIMA,
  });
}
