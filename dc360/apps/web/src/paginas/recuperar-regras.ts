/**
 * As frases e as regras das duas telas de "esqueci a senha", fora do React.
 *
 * Moram aqui, e não dentro dos componentes, por dois motivos. O primeiro é que
 * texto de recuperação de senha é o texto mais sensível do painel (uma frase a
 * mais e a tela vira um verificador de quais emails existem), então ele precisa
 * poder ser lido e testado em um lugar só. O segundo é que a decisão de "qual
 * frase para qual falha" é regra, e regra testada não depende de navegador.
 *
 * Duas escolhas que valem registro:
 *
 * 1. **Uma frase só para link que não vale mais.** Vencido, já usado, trocado
 *    por um pedido mais novo e inventado voltam do servidor com a MESMA
 *    resposta (de propósito: distinguir faria o servidor dizer quais links já
 *    existiram). A tela não tem o que distinguir, então não finge: uma frase
 *    que cobre os três e manda pedir outro.
 * 2. **A mensagem do servidor não é a frase da tela.** O servidor responde em
 *    português, mas a tela fala por conta própria nos casos que decidem o que a
 *    pessoa faz em seguida. Assim a frase não muda sem o teste avisar, e uma
 *    resposta estranha de um proxy no meio do caminho nunca chega ao leitor.
 */

/** O que a falha de um pedido significa para a tela. */
export type FalhaDaRecuperacao =
  | "desligada"
  | "link-invalido"
  | "excesso"
  | "rede"
  | "recusada"
  | "outra";

/**
 * Lê a falha por FORMA e não por `instanceof`: `ErroDaApi` e `SemConexao` só
 * existem no modo com servidor, e esta função precisa valer nos dois modos
 * (e sem importar o transporte, que arrasta o resto do painel).
 */
export function classificarFalha(erro: unknown): FalhaDaRecuperacao {
  if (typeof erro !== "object" || erro === null) return "outra";
  const { name, status, codigo } = erro as { name?: unknown; status?: unknown; codigo?: unknown };
  if (name === "SemConexao") return "rede";
  if (status === 503 && codigo === "recuperacao_desligada") return "desligada";
  if (status === 401) return "link-invalido";
  if (status === 429) return "excesso";
  if (status === 422) return "recusada";
  return "outra";
}

export const MINIMO_DE_CARACTERES = 12;
/** O mesmo teto do servidor (`senhaSchema`): um gerenciador de senhas passa de 100 sem esforço. */
export const MAXIMO_DE_CARACTERES = 200;

export const FRASES = {
  // ---- Pedir o link ----
  pedidoTitulo: "Redefinir senha",
  pedidoSubtitulo: "Informe o email com que você entra no sistema",
  pedidoRotulo: "Email funcional",
  pedidoDica: "O email da sua conta. Se ele estiver cadastrado, o link chega nessa caixa de entrada.",
  pedidoBotao: "Enviar link de redefinição",
  pedidoBotaoEnviando: "Enviando",
  pedidoVerificando: "Conferindo se a recuperação por email está ligada",
  pedidoEmailVazio: "Informe o seu email funcional.",
  pedidoEmailInvalido: "Informe um email completo, como nome@orgao.gov.br.",
  pedidoLocal:
    "A recuperação de senha exige o servidor. Este painel está em modo de demonstração, sem email nem contas.",
  /**
   * A resposta do pedido. É a MESMA para email que existe, que não existe e
   * que passou do teto de pedidos por hora: a tela não conhece a diferença e
   * não pode inventar uma.
   */
  pedidoEnviado:
    "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.",
  pedidoEnviadoApoio:
    "Não chegou? Olhe também a caixa de spam e espere alguns minutos. O link vale por pouco "
    + "tempo e funciona uma vez só. Se digitou o email errado, peça de novo.",
  pedidoDeNovo: "Pedir de novo",
  pedidoExcesso: "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.",
  pedidoFalhou: "Não foi possível enviar o pedido agora. Tente de novo em instantes.",

  // ---- Sem email: o caminho de quem administra ----
  desligadaSubtitulo: "A recuperação por email não está ligada",
  desligadaAviso: "A recuperação de senha por email não está ligada neste município.",
  desligadaIntroducao:
    "Quem administra o sistema na sua Defesa Civil redefine a sua senha por dentro, sem email. Faça assim:",
  desligadaPassos: [
    "Procure a pessoa que administra o sistema (coordenação ou administração) e peça a redefinição da sua senha.",
    "Essa pessoa abre a lista de Usuários, encontra o seu nome e usa o botão Redefinir senha.",
    "O sistema mostra uma senha temporária uma única vez, e quem administra a entrega a você.",
    "Entre com a senha temporária. O sistema pede que você escolha uma senha nova logo na primeira entrada.",
  ],

  // ---- Definir a senha nova ----
  novaTitulo: "Nova senha",
  novaSubtitulo: "Escolha uma senha para sua conta",
  novaRotulo: "Nova senha",
  novaDica:
    "Mínimo de 12 caracteres. Sem exigência de símbolo ou número: regra de composição só "
    + "produz senha pior e mais difícil de lembrar.",
  repetirRotulo: "Repita a nova senha",
  novaBotao: "Definir nova senha",
  novaBotaoSalvando: "Salvando",
  novaVazia: "Digite a nova senha.",
  novaCurta: `A senha precisa de pelo menos ${MINIMO_DE_CARACTERES} caracteres.`,
  novaLonga: `A senha pode ter no máximo ${MAXIMO_DE_CARACTERES} caracteres.`,
  repetidaDiferente: "As duas senhas precisam ser iguais.",
  novaRecusada: `A senha não foi aceita. Use de ${MINIMO_DE_CARACTERES} a ${MAXIMO_DE_CARACTERES} caracteres.`,
  novaExcesso: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
  novaFalhou: "Não foi possível redefinir a senha agora. Tente de novo em instantes.",
  novaProntaSubtitulo: "Sua senha foi alterada",
  novaPronta: "Senha redefinida. Entre com a nova senha.",
  novaProntaApoio: "Você será levado para a entrada em instantes.",
  novaProntaBotao: "Ir para a entrada",

  // ---- Link que não serve ----
  semLinkSubtitulo: "Link incompleto",
  semLink:
    "Este endereço não traz um link de redefinição. Abra o link completo que chegou no seu email, "
    + "ou peça um novo.",
  linkInvalidoSubtitulo: "Este link não vale mais",
  linkInvalido:
    "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido "
    + "trocado por um pedido mais novo. Peça um novo link.",
  pedirNovoLink: "Pedir um novo link",

  voltar: "Voltar para a entrada",
} as const;

/** Formato mínimo de email: o servidor é quem confere de verdade. */
const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmailDoPedido(email: string): string | null {
  const limpo = email.trim();
  if (limpo === "") return FRASES.pedidoEmailVazio;
  if (!FORMATO_DE_EMAIL.test(limpo)) return FRASES.pedidoEmailInvalido;
  return null;
}

/**
 * Cada erro vai para o campo que o causou: o tamanho para a senha nova, a
 * divergência para a repetição. Repetir o texto nos dois campos faria o leitor
 * de tela anunciar duas vezes o mesmo problema.
 */
export type ErroDaSenhaNova = { campo: "nova" | "repetida"; texto: string };

export function validarSenhaNova(senha: string, repetida: string): ErroDaSenhaNova | null {
  if (senha === "") return { campo: "nova", texto: FRASES.novaVazia };
  if (senha.length < MINIMO_DE_CARACTERES) return { campo: "nova", texto: FRASES.novaCurta };
  if (senha.length > MAXIMO_DE_CARACTERES) return { campo: "nova", texto: FRASES.novaLonga };
  if (senha !== repetida) return { campo: "repetida", texto: FRASES.repetidaDiferente };
  return null;
}

/** A frase do pedido quando o envio falha por algo que não é o formulário. */
export function fraseDaFalhaDoPedido(erro: unknown): string {
  switch (classificarFalha(erro)) {
    case "rede": return (erro as Error).message;
    case "excesso": return FRASES.pedidoExcesso;
    default: return FRASES.pedidoFalhou;
  }
}

/** A frase da redefinição quando a falha não troca a tela inteira. */
export function fraseDaFalhaDaRedefinicao(erro: unknown): string {
  switch (classificarFalha(erro)) {
    case "rede": return (erro as Error).message;
    case "excesso": return FRASES.novaExcesso;
    case "recusada": return FRASES.novaRecusada;
    default: return FRASES.novaFalhou;
  }
}
