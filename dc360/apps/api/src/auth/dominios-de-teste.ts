import type { Mensagem, Notificador } from "./notificador.js";

/**
 * O domínio de um endereço de e-mail, em minúsculas, ou `null` quando não há
 * `@` ou nada depois dele.
 *
 * Usa o ÚLTIMO `@`: a parte local pode conter `@` entre aspas, e o domínio é o
 * que vem depois do último.
 */
export function dominioDoEmail(endereco: string): string | null {
  const i = endereco.lastIndexOf("@");
  if (i < 0) return null;
  const dominio = endereco
    .slice(i + 1)
    .trim()
    .toLowerCase();
  return dominio === "" ? null : dominio;
}

/**
 * Limita o envio de e-mail aos domínios de teste da homologação.
 *
 * HML tem dado sintético, mas as portas de saída são de verdade: o ofício vai
 * para o e-mail do órgão cadastrado, e a recuperação de senha para o e-mail da
 * conta. Se alguém cadastrar um endereço real em HML, a mensagem de teste
 * chegaria a uma pessoa ou a um órgão que não sabe que é teste. Este filtro
 * recusa ANTES de chamar o provedor.
 *
 * Compara o domínio por igualdade EXATA com a lista: `teste.exemplo.com.br`
 * não autoriza `exemplo.com.br` nem `outro.teste.exemplo.com.br`. Quem quiser
 * um subdomínio o lista.
 *
 * A recusa é uma exceção, e as duas rotas que enviam já a tratam como falha de
 * envio (o ofício grava `falha` na tentativa; a recuperação responde igual para
 * conta existente e inexistente). A mensagem NÃO repete o endereço inteiro:
 * e-mail é dado pessoal, e ela vai parar em coluna de banco e em log. Diz só o
 * domínio.
 *
 * Lista vazia devolve o notificador original: sem filtro configurado, nada a
 * limitar. A configuração (`config.ts`) é quem obriga a lista existir em HML
 * com e-mail ligado.
 */
export function soParaDominiosDeTeste(
  notificador: Notificador,
  dominiosPermitidos: readonly string[],
): Notificador {
  if (dominiosPermitidos.length === 0) return notificador;
  const permitidos = new Set(dominiosPermitidos.map((d) => d.toLowerCase()));
  return {
    async enviar(mensagem: Mensagem) {
      const dominio = dominioDoEmail(mensagem.para);
      if (dominio === null || !permitidos.has(dominio)) {
        throw new Error(
          `Envio recusado: o domínio ${dominio ?? "(ilegível)"} não está em ` +
            "EMAIL_DOMINIOS_DE_TESTE. Este ambiente é de homologação e só envia " +
            "e-mail aos domínios de teste.",
        );
      }
      return notificador.enviar(mensagem);
    },
  };
}
