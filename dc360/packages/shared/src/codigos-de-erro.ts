/**
 * O CATÁLOGO DOS CÓDIGOS DE ERRO DE ACESSO, numa fonte só.
 *
 * ## Por que isto existe
 *
 * Com a vigência religada na escrita (V2-F00-E04), conta desativada, papel
 * rebaixado e sessão encerrada passaram a recusar o pedido. Os três saíam como
 * o mesmo `401 sessao`, e cada ponta lia o 401 do seu jeito: o painel só
 * reconhecia `nao_autenticado` como sessão morta, o aplicativo de campo lia
 * QUALQUER 401 como "sua sessão terminou", e a fila trata 401 e 403 como falha
 * permanente. Conta desativada era indistinguível de token vencido, e as três
 * situações pedem ações opostas:
 *
 * - token vencido: renova sozinho e repete o pedido, a pessoa nem percebe;
 * - sessão encerrada: a pessoa entra de novo, e o que já estava no aparelho
 *   continua lá;
 * - conta desativada: entrar de novo NÃO resolve. Para de insistir, guarda o
 *   que há e manda procurar a coordenação.
 *
 * O código é o contrato. O texto da mensagem é de quem lê (muda sem aviso); o
 * `erro` do corpo, não. Quem decide o que fazer decide por ele, e por isso a
 * lista mora aqui, no pacote que o servidor, o painel e o aplicativo importam,
 * e não escrita três vezes. O `apps/api/test/codigos-de-erro.test.ts` confere
 * que o servidor emite exatamente isto: código novo no servidor sem entrar
 * aqui reprova.
 *
 * ## O que a F02-E03 herda
 *
 * Isto cobre só os erros de ACESSO (autenticação, vigência e permissão). O
 * esquema de erro único da API, com o catálogo inteiro (validação, regra de
 * negócio, conflito), é da V2-F02-E03, que generaliza esta tabela.
 *
 * ## Recurso de outro município
 *
 * Não tem código aqui, de propósito: a resposta é 404 `nao_encontrado`, nunca
 * 403. Um 403 confirmaria que o registro existe, e confirmar existência já é
 * vazamento. `conta_desativada` é 403 porque a conta desativada é a DO PRÓPRIO
 * usuário autenticado, não um recurso alheio.
 */

/** O que o cliente faz ao receber o código. É a coluna que importa. */
export type AcaoDoCliente =
  /** Pede um token novo com o de renovação e repete o pedido UMA vez. */
  | "renovar_e_repetir"
  /** Pede para entrar de novo; o que está guardado no aparelho fica. */
  | "entrar_de_novo"
  /** Para de tentar, mantém o que há no aparelho e manda procurar a coordenação. */
  | "parar_e_avisar"
  /** Espera: o problema não é desta pessoa nem se resolve com ela. */
  | "aguardar_o_contrato"
  /** Leva à troca de senha, que é o que destrava a sessão. */
  | "trocar_a_senha"
  /** Nada a repetir: o perfil não tem permissão para isto. */
  | "nenhuma";

export type EntradaDoCatalogo = {
  /** O status HTTP. `acesso_suspenso` também sai como 503 nas rotas da fila. */
  readonly status: 401 | 403;
  readonly acao: AcaoDoCliente;
  /** A mensagem padrão, em português, para quem usa o sistema. Rota pode detalhar. */
  readonly mensagem: string;
};

export const CODIGOS_DE_ERRO_DE_ACESSO = {
  nao_autenticado: {
    status: 401,
    acao: "renovar_e_repetir",
    mensagem: "Token inválido ou expirado.",
  },
  sessao_encerrada: {
    status: 401,
    acao: "entrar_de_novo",
    mensagem: "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente.",
  },
  conta_desativada: {
    status: 403,
    acao: "parar_e_avisar",
    mensagem:
      "Sua conta foi desativada. Procure a coordenação do seu município: "
      + "o que você já registrou continua guardado.",
  },
  acesso_suspenso: {
    status: 403,
    acao: "aguardar_o_contrato",
    mensagem:
      "O acesso deste município ao sistema foi suspenso pelo fornecedor. "
      + "Procure quem administra o contrato na sua prefeitura.",
  },
  troca_de_senha_obrigatoria: {
    status: 403,
    acao: "trocar_a_senha",
    mensagem:
      "Você entrou com uma senha provisória. Defina a sua senha em Minha conta "
      + "antes de continuar.",
  },
  sem_permissao: {
    status: 403,
    acao: "nenhuma",
    // Mensagem padrão: cada rota diz qual ação o perfil não pode fazer.
    mensagem: "Seu perfil não tem permissão para esta ação.",
  },
} as const satisfies Record<string, EntradaDoCatalogo>;

export type CodigoDeErroDeAcesso = keyof typeof CODIGOS_DE_ERRO_DE_ACESSO;

/** Os códigos do catálogo, na ordem em que estão escritos acima. */
export const LISTA_DE_CODIGOS_DE_ERRO_DE_ACESSO = Object.keys(
  CODIGOS_DE_ERRO_DE_ACESSO,
) as readonly CodigoDeErroDeAcesso[];

/**
 * Se o texto é um código do catálogo. Serve ao cliente que recebe `erro` como
 * texto solto do corpo: `"sessao"` (o código que existiu até a V2-F00-E05) e
 * qualquer outro fora da lista dão `false`, e quem recebe `false` trata como
 * erro comum, nunca como sessão morta.
 */
export function ehCodigoDeErroDeAcesso(valor: unknown): valor is CodigoDeErroDeAcesso {
  return typeof valor === "string"
    && Object.prototype.hasOwnProperty.call(CODIGOS_DE_ERRO_DE_ACESSO, valor);
}

/** O que o cliente faz com o código, ou `null` quando ele não é do catálogo. */
export function acaoParaOCodigo(valor: unknown): AcaoDoCliente | null {
  return ehCodigoDeErroDeAcesso(valor) ? CODIGOS_DE_ERRO_DE_ACESSO[valor].acao : null;
}
