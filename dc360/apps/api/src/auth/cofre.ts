import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * O cofre do segredo do segundo fator.
 *
 * Existe por uma diferença que é fácil de perder de vista: senha e token de
 * sessão vão para o banco como RESUMO, e resumo basta porque o servidor nunca
 * precisa do valor original de volta. O segredo do TOTP é o contrário: para
 * conferir os seis dígitos, o servidor precisa do segredo INTEIRO, então
 * resumo não serve e o que resta é cifra.
 *
 * O que isso compra: um banco vazado (cópia de segurança perdida, credencial
 * de leitura exposta, disco fora de uso) não devolve segundo fator utilizável,
 * porque a chave não mora no banco. Ela vem de `SEGUNDO_FATOR_CHAVE`, que vive
 * no ambiente do processo, e o `config.ts` recusa subir com o recurso ligado e
 * a chave ausente.
 *
 * O que isso NÃO compra, dito para ninguém se enganar: quem invade o servidor
 * em execução tem o banco E a chave, e nesse cenário o segundo fator cai
 * junto. A cifra separa dois riscos que costumam ser tratados como um só, e
 * cobre o mais provável dos dois.
 */

/** AES-256-GCM: cifra e selo de autenticidade na mesma operação. */
const ALGORITMO = "aes-256-gcm";
const BYTES_CHAVE = 32;
/** Doze bytes é o tamanho nativo do GCM. Outro tamanho força reprocessamento. */
const BYTES_VETOR = 12;
const BYTES_SELO = 16;

/**
 * A versão vai no começo do envelope, e não é enfeite.
 *
 * O dia em que a cifra mudar (chave maior, outro algoritmo, outro formato), o
 * banco vai ter linhas dos dois tipos ao mesmo tempo, porque ninguém
 * reescreve segredo de todo mundo numa migração. Sem o prefixo, a única forma
 * de descobrir o formato seria adivinhar pelo tamanho.
 *
 * Ele também é o que o banco cobra no CHECK `segredo_vem_cifrado` (migração
 * 022): o segredo cru do TOTP é base32 e não começa por "v1.", então gravar
 * texto puro reprova no banco.
 */
const VERSAO = "v1";

export type Cofre = {
  /**
   * Cifra `texto`, amarrando o resultado a `contexto`.
   *
   * `contexto` entra como dado autenticado adicional, e ele é a defesa contra
   * o ataque que a cifra sozinha não cobre: com um envelope solto, quem
   * conseguisse ESCREVER no banco copiaria o próprio envelope para a linha do
   * administrador e passaria a gerar os códigos dele com o próprio aplicativo,
   * sem nunca decifrar nada. Amarrado ao município e à pessoa, o envelope
   * movido de linha não abre.
   */
  cifrar(texto: string, contexto: string): string;
  /** Devolve `null` quando o envelope não abre: chave errada, formato desconhecido, selo quebrado ou contexto trocado. */
  decifrar(envelope: string, contexto: string): string | null;
};

/**
 * Lê a chave do ambiente e devolve o cofre.
 *
 * Falha alto e cedo (na partida, não na primeira ativação) quando a chave tem
 * tamanho errado: chave curta aceita em silêncio seria uma cifra que parece
 * existir e protege menos do que anuncia.
 */
export function abrirCofre(chaveEmBase64: string): Cofre {
  let chave: Buffer;
  try {
    chave = Buffer.from(chaveEmBase64, "base64");
  } catch {
    chave = Buffer.alloc(0);
  }

  if (chave.length !== BYTES_CHAVE) {
    throw new Error(
      `SEGUNDO_FATOR_CHAVE precisa ter ${BYTES_CHAVE} bytes em base64 e tem ${chave.length}. `
      + "Gere com: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  return {
    cifrar(texto, contexto) {
      const vetor = randomBytes(BYTES_VETOR);
      const cifra = createCipheriv(ALGORITMO, chave, vetor);
      cifra.setAAD(Buffer.from(contexto, "utf8"));
      const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
      return [
        VERSAO,
        vetor.toString("base64url"),
        cifra.getAuthTag().toString("base64url"),
        corpo.toString("base64url"),
      ].join(".");
    },

    decifrar(envelope, contexto) {
      const partes = envelope.split(".");
      if (partes.length !== 4 || partes[0] !== VERSAO) return null;

      try {
        const vetor = Buffer.from(partes[1]!, "base64url");
        const selo = Buffer.from(partes[2]!, "base64url");
        const corpo = Buffer.from(partes[3]!, "base64url");
        if (vetor.length !== BYTES_VETOR || selo.length !== BYTES_SELO) return null;

        const decifra = createDecipheriv(ALGORITMO, chave, vetor);
        decifra.setAAD(Buffer.from(contexto, "utf8"));
        decifra.setAuthTag(selo);
        return Buffer.concat([decifra.update(corpo), decifra.final()]).toString("utf8");
      } catch {
        /*
          Devolve `null` em vez de propagar o erro do OpenSSL.

          Quem chama precisa decidir o que dizer à pessoa, e a mensagem crua
          ("Unsupported state or unable to authenticate data") não ajuda
          ninguém e ainda contaria ao atacante que o envelope existe e não
          abriu. O caso legítimo desta linha é a rotação da chave feita pela
          metade, e o comportamento certo lá é o mesmo: o segundo fator não
          confere, e a pessoa entra pelo código de recuperação.
        */
        return null;
      }
    },
  };
}
