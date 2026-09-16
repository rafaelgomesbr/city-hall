import { ROTULO_PAPEL, podeGerirPapel, type Papel } from "@dc360/shared";

/**
 * As decisões da tela de usuários que não dependem de React.
 *
 * Mesma razão de `ocorrencia-regras.ts`: condição escondida num `&&` no JSX
 * não tem como ser exercitada, e este painel não roda em navegador de teste.
 * Como função pura, cada regra tem teste que roda em milissegundos, e o modo
 * de demonstração aplica a MESMA função, para a reunião com a prefeitura não
 * mostrar um botão que o produto real recusa.
 *
 * Nada aqui é controle de acesso. Quem impede é `exigirPostoParaGerir` e a
 * recusa de email na API; a tela apenas não oferece o que vai ser negado.
 */

/**
 * Por que a pessoa da sessão NÃO administra a conta alvo, ou `null` quando
 * administra.
 *
 * A regra é a de `podeGerirPapel`: abaixo do próprio posto, e o administrador
 * também sobre o próprio posto (ADR 0006). O texto sai no `title` do botão
 * desabilitado, porque botão apagado sem explicação vira chamado de suporte.
 */
export function motivoParaNaoAdministrar(
  quem: Papel,
  alvo: { papel: Papel },
): string | null {
  if (podeGerirPapel(quem, alvo.papel)) return null;
  const rotulo = ROTULO_PAPEL[alvo.papel].toLowerCase();
  return alvo.papel === quem
    ? `Conta de ${rotulo}, o mesmo posto que o seu: só o administrador do município a administra`
    : `Conta de ${rotulo}, acima do seu posto: só o administrador do município a administra`;
}

/**
 * Se o campo de email pode ser alterado no formulário.
 *
 * Ao CADASTRAR, qualquer um que administre usuários digita o email, porque a
 * conta não existe ainda. Ao CORRIGIR, trocar o email de outra pessoa é ato
 * do administrador: o email é a identidade de login, e trocá-lo é o primeiro
 * passo da tomada de conta. A API recusa com `email_so_por_administrador`.
 */
export function podeTrocarEmail(quem: Papel, editando: boolean): boolean {
  return !editando || quem === "administrador";
}

/** A frase que acompanha o campo travado, para a pessoa saber a quem pedir. */
export const DICA_DO_EMAIL_TRAVADO =
  "Só o administrador do município troca o email de outra pessoa.";
