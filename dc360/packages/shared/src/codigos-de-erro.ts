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
 * e não escrita três vezes.
 *
 * ## O que os testes prendem, exatamente
 *
 * São dois, e um não substitui o outro.
 *
 * 1. `apps/api/test/codigos-de-erro.test.ts` lê o código-fonte (a API, o pacote
 *    compartilhado e o console do fornecedor) pela árvore sintática do
 *    TypeScript e reprova nestes casos:
 *
 *    - TODA resposta de erro de acesso, isto é, de status 401 ou 403, ou de
 *      status que o texto não resolve, carrega um código deste catálogo ou da
 *      lista da entrada (`CODIGOS_DA_ENTRADA`, abaixo). Formas de emitir que a
 *      varredura LÊ: `send({ erro })` literal ou por constante, em qualquer
 *      cadeia de `code`/`status`; `new RegraDeNegocio(codigo, ..., status)`,
 *      `new FalhaAutenticacao(codigo, ...)`, inclusive com outro nome de
 *      importação ou por espaço de nomes (`import * as`); o `super(...)` de
 *      qualquer subclasse delas, em qualquer arquivo; classe de erro com
 *      `codigo` literal na declaração, atribuído no construtor, por getter ou
 *      por propriedade de parâmetro; o tratador global; e a recusa
 *      `{ status, corpo: { erro } }` do console.
 *    - O que a varredura NÃO consegue ler, ela REPROVA em vez de deixar passar:
 *      `.code(...)` ou `.status(...)` fora de uma cadeia com `send` (o corpo
 *      iria num `return`), 401 ou 403 sem `erro`, corpo que não resolve (inclusive
 *      texto, com status calculado), `{ erro: "x", ...extra }` com o spread
 *      depois de `erro` (só passa o spread de objeto literal sem `erro`),
 *      `statusCode` ou `status` escritos à mão por qualquer forma (propriedade,
 *      chave computada, colchete, `Object.defineProperty`), `Object.assign`,
 *      `httpErrors`, `createError`, `.raw`, `.hijack()` e `.writeHead()`
 *      (escrita direta na resposta do Node), ganchos `onSend` que recebem o
 *      corpo ou qualquer gancho que envia resposta ou lança erro de negócio,
 *      `new RegraDeNegocio(...args)` com argumentos espalhados, `status`
 *      declarado em classe de erro (em subclasse, qualquer um), uso de uma
 *      classe de erro de negócio fora de `new`, `extends`, `instanceof`,
 *      importação e tipo (guardada em variável, `Reflect.construct`), código
 *      calculado, classe nova com `codigo` calculado, e par `{ status, corpo }`
 *      com corpo abreviado ou que não resolve, qualquer `Reflect`, atribuição ao
 *      `codigo` de um erro fora do construtor, e reatribuição do parâmetro do
 *      tratador global. Só passam os repasses conferidos
 *      à mão e listados no teste, cada um com o porquê, e cada um preso à
 *      ORIGEM do que foi conferido (o `erro` do tratador global é o parâmetro
 *      do `setErrorHandler`, e não um homônimo sombreado; o status do
 *      `corpo_invalido` vem de `doLeitorDeCorpo.statusCode`, e não de qualquer
 *      expressão).
 *    - Código deste catálogo emitido com status diferente do escrito aqui
 *      reprova (`acesso_suspenso` também pode ser 503, nas rotas da fila).
 *    - Código deste catálogo que nenhum ponto do servidor emite reprova: a
 *      lista não carrega código morto.
 *    - Cada um dos dez códigos sai do servidor real, por requisição, com o
 *      status escrito aqui (e com a mensagem escrita aqui, nos casos em que a
 *      rota usa a frase padrão).
 *
 * 2. `apps/api/test/prova-dinamica-dos-codigos-de-erro.test.ts` é a SEGUNDA
 *    linha, depois da varredura. Sobe o servidor e pede cada rota que ele
 *    registrou (a lista é a da árvore do Fastify concatenada por
 *    `superficie-registrada.ts`, a mesma de `superficie.test.ts` e do contrato do
 *    painel), com 12 perfis em estados negativos (sem token, token lixo, vencido,
 *    de outra assinatura, perfil errado, conta desativada, senha provisória,
 *    município suspenso, município de fora). Cada pedido sai de um endereço de
 *    rede distinto, para não esbarrar no limitador por endereço, e o teste exige
 *    zero 429. Exige que o número de pares método + caminho pedidos seja o de
 *    registrados (segunda contagem da árvore), que nenhum pedido caia fora das
 *    rotas e que todo 401 e todo 403 traga um `erro` deste catálogo ou da
 *    entrada E o status do catálogo para aquele código. Mede e declara o que
 *    exercita: dos 114 pares, 112 chegam ao handler com algum perfil, 48
 *    recebem 2xx, 66 NUNCA recebem 2xx de perfil nenhum (só 422, 404, 409 ou 503
 *    além das recusas de acesso: a autorização deles é exercitada só até a
 *    validação) e 2 (o armazenamento local, autenticado pela assinatura da URL)
 *    só recebem 403 `assinatura`. Não é, portanto, "todas as rotas, com cada
 *    perfil, até o fim": é o que fecha o que o texto esconde apenas onde chega.
 *
 * O que NENHUM dos dois prende, para ninguém ler mais do que está escrito: uma
 * recusa que só sai com um corpo ou um estado que os perfis do teste dinâmico
 * não criam E que o texto esconde (código montado por dado externo, classe
 * definida fora das pastas varridas, `Object.assign` num erro, resposta de um
 * plugin de terceiros); os erros de outros status (404, 409, 422, 429, 5xx) e os
 * códigos de regra de negócio, que são da V2-F02-E03; o TEXTO da mensagem que
 * cada rota devolve, fora dos casos de execução; e o que cada cliente faz com o
 * código (isso é dos testes do painel e do aplicativo, que também leem este
 * catálogo).
 *
 * ## O que a F02-E03 herda
 *
 * Isto cobre só os erros de ACESSO (autenticação, vigência e permissão), o que
 * inclui a recusa de permissão por posto (`posto_insuficiente`,
 * `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador`) e a URL
 * assinada que não vale (`assinatura`). O esquema de erro único da API, com o
 * catálogo inteiro (validação, regra de negócio, conflito), é da V2-F02-E03,
 * que generaliza esta tabela.
 *
 * ## O console do fornecedor
 *
 * `apps/console` é outro processo, com a própria sessão e o próprio contrato de
 * erro (`sem_sessao`, `so_o_dono`, ...), e as páginas dele leem esses códigos.
 * Não usa este catálogo e o painel e o aplicativo nunca falam com ele. O teste
 * o varre mesmo assim, contra uma lista própria, para que um 401 ou 403 novo
 * dele também não nasça sem revisão.
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
  /*
    As três recusas de permissão por posto. São 403 e não 404: o recurso é do
    próprio município da pessoa, ela só não tem posto para ele. O 404 existe
    para não revelar recurso de OUTRO município, e este não é o caso.
  */
  posto_insuficiente: {
    status: 403,
    acao: "nenhuma",
    // A rota diz de qual perfil é a conta (`PostoInsuficiente`).
    mensagem: "Seu perfil não administra esta conta. Peça a quem administra o município.",
  },
  posto_insuficiente_para_dado_pessoal: {
    status: 403,
    acao: "nenhuma",
    mensagem:
      "A exportação com dados pessoais é de quem administra o município. "
      + "Use a exportação sem dados pessoais, ou peça a quem administra.",
  },
  email_so_por_administrador: {
    status: 403,
    acao: "nenhuma",
    mensagem:
      "Trocar o email de outra pessoa é ato de quem administra o município. "
      + "Peça ao administrador.",
  },
  /*
    A URL assinada de envio e de download de arquivo que não vale: assinatura
    ausente, adulterada ou vencida. Não há sessão aqui (a assinatura é a
    credencial), então nunca é "entre de novo". A rota diz o motivo.
  */
  assinatura: {
    status: 403,
    acao: "nenhuma",
    mensagem: "O endereço deste arquivo é inválido ou venceu. Abra a tela de novo para receber outro.",
  },
} as const satisfies Record<string, EntradaDoCatalogo>;

export type CodigoDeErroDeAcesso = keyof typeof CODIGOS_DE_ERRO_DE_ACESSO;

/**
 * Os códigos da ENTRADA (e-mail e senha). Ficam FORA do catálogo de acesso de
 * propósito: respondem a outra pergunta ("a pessoa digitou certo?") e o cliente
 * nunca os lê como sessão morta. `ehCodigoDeErroDeAcesso("credenciais")` é
 * `false`, e é isso que impede senha errada na troca de senha de derrubar a
 * tela. Existem aqui para que o teste de catálogo saiba que a lista dos 401 e
 * dos 429 da entrada está fechada.
 */
export const CODIGOS_DA_ENTRADA = {
  /** E-mail ou senha que não conferem; a mesma resposta para conta inexistente ou desativada. */
  credenciais: { status: 401 },
  /** A senha provisória certa, mas vencida: só quem a tinha sabe, e pede outra. */
  senha_provisoria_vencida: { status: 401 },
  /** Tentativas demais; espera passar. */
  bloqueado: { status: 429 },
} as const satisfies Record<string, { readonly status: 401 | 429 }>;

export type CodigoDaEntrada = keyof typeof CODIGOS_DA_ENTRADA;

/** Se o texto é um código da entrada. Não é do catálogo de acesso. */
export function ehCodigoDaEntrada(valor: unknown): valor is CodigoDaEntrada {
  return typeof valor === "string"
    && Object.prototype.hasOwnProperty.call(CODIGOS_DA_ENTRADA, valor);
}

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
