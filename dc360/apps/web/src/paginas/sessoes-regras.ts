/**
 * As frases das telas de sessões e de redefinição de senha, fora do React.
 *
 * Mesma razão de `usuarios-regras.ts`: frase montada dentro do JSX, com
 * plural e caso de zero, não tem como ser exercitada, e é justamente nela que
 * mora o erro de português que a pessoa lê na hora em que está decidindo se
 * derruba um acesso. Como função pura, cada caso (nenhuma, uma, várias) tem
 * teste que roda em milissegundos.
 *
 * Nenhuma frase aqui supõe o gênero de quem é citado: o nome vem da lista e a
 * pessoa pode ser qualquer uma.
 */

/** "1 sessão" ou "3 sessões". */
export function sessoes(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? "sessão" : "sessões"}`;
}

/**
 * O que a confirmação de "Encerrar sessões" diz sobre a outra pessoa, ANTES de
 * derrubar: quantas estão abertas e desde quando a mais recente.
 *
 * `ultimaEntrada` já vem formatada, porque formatar data é da tela e esta
 * função fica pura. Nulo quando a leitura ainda não chegou ou falhou, e aí a
 * confirmação não afirma nada que não sabe.
 */
export function fraseDasSessoesAbertas(
  nome: string,
  quantidade: number | null,
  ultimaEntrada: string | null,
): string {
  if (quantidade === null) return "";
  if (quantidade === 0) return `${nome} não tem sessão aberta agora.`;
  const desde = ultimaEntrada ? `, a mais recente iniciada em ${ultimaEntrada}` : "";
  return quantidade === 1
    ? `${nome} tem 1 sessão aberta${desde}.`
    : `${nome} tem ${quantidade} sessões abertas${desde}.`;
}

/** Na janela da senha temporária: quantas sessões caíram junto com a senha antiga. */
export function fraseDasSessoesQueCairam(quantidade: number): string {
  if (quantidade === 0) return "Esta conta não tinha nenhuma sessão aberta.";
  if (quantidade === 1) return "1 sessão aberta desta conta foi encerrada.";
  return `${quantidade} sessões abertas desta conta foram encerradas.`;
}

/** O que o botão de "Minha conta" repete: o ato com o objeto dentro, nunca "OK". */
export function rotuloDeEncerrarOutras(quantidade: number): string {
  return quantidade === 1 ? "Encerrar a outra sessão" : `Encerrar as outras ${quantidade} sessões`;
}

/** A confirmação, depois de encerrar as outras da própria conta. */
export function fraseDeOutrasEncerradas(quantidade: number): string {
  if (quantidade === 0) return "Nenhuma outra sessão estava aberta. Esta continua aberta.";
  const encerradas = quantidade === 1 ? "A outra sessão foi encerrada" : `As outras ${quantidade} sessões foram encerradas`;
  return `${encerradas}. Esta continua aberta.`;
}

/** O que a lista de "Minha conta" diz quando só existe a sessão atual. */
export const SO_ESTA_SESSAO =
  "Esta é a única sessão aberta na sua conta. Quando você entrar em outro navegador ou aparelho, "
  + "ele passa a aparecer aqui.";
