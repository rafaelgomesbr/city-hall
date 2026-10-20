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
 * ## O que garante, e o que só ajuda
 *
 * A GARANTIA é uma guarda em tempo de execução, não um teste do texto
 * (V2-F00-E05, correção 3). Uma varredura estática do fonte nunca fecha a
 * classe: a cada regra nova, a revisão achou a forma seguinte (dezesseis de uma
 * vez: `code(200).code(403)`, `e[campo] = "x"`, `Object` apelidado, `onSend` nas
 * opções da rota, `JSON.stringify` trocado, `Proxy`, arquivo `.mts`...).
 *
 * 0. `apps/api/src/guarda-de-codigos-de-erro.ts` (e a cópia do console, com o
 *    contrato dele) confere a resposta na resposta do Node: um `onRequest`
 *    instalado antes de qualquer plugin e rota troca `writeHead`, `write` e
 *    `end` daquela resposta por versões que seguram toda resposta 401 ou 403
 *    (fora HEAD) até o fim e conferem o corpo inteiro antes de escrever. Os
 *    ganchos, o tratador de erro, o 404, o tratador de reserva do Fastify,
 *    `hijack` e `raw` terminam nesses três métodos. A primeira versão era um
 *    `onSend`, e a revisão passou por ela de três jeitos (`onSend` acrescentado
 *    depois por um `onRoute` de plugin, 404 de plugin trocado por 403, e o
 *    tratador de reserva escrevendo direto na resposta do Node). "401 ou 403" é
 *    o status que o Node ESCREVE, `statusCode | 0`, e não o pedido: `403.5`,
 *    `"403"` e `4294967699` saem 403 no fio, e status que não é número inteiro
 *    de 100 a 599 e vira 401 ou 403 é desvio mesmo com o corpo certo (correção
 *    4). O corpo tem de ser JSON com UMA chave `erro` (repetida é recusada)
 *    deste catálogo (ou da lista da entrada) e o status que o catálogo dá a
 *    ele. Fora disso, em TESTE
 *    a resposta vira 500 `desvio_do_catalogo_de_erro` e o caso (ou o
 *    `afterAll`) que passou por ali reprova (`test/guarda-falha-alto.ts`, em
 *    todo arquivo da suíte); FORA de teste ela sai com o código genérico do
 *    catálogo para o status (401 `nao_autenticado`, 403 `sem_permissao`, com a
 *    frase deste catálogo) e o desvio vai para o log com o método, a rota e o
 *    código visto só se ele tiver a forma de um código (`^[a-z_]{1,64}$`).
 *    `apps/api/test/guarda-de-codigos-de-erro.test.ts` planta como rotas as
 *    dezesseis formas que a varredura não lia e os escapes da primeira guarda,
 *    e prova os dois modos.
 *
 * Os testes abaixo são as linhas ANTERIORES, que apontam o defeito antes de ele
 * chegar à guarda, e nenhum dos dois é garantia sozinho.
 *
 * 1. `apps/api/test/codigos-de-erro.test.ts` lê o código-fonte (a API, o pacote
 *    compartilhado e o console do fornecedor) pela árvore sintática do
 *    TypeScript. É HEURÍSTICA: lê as formas que conhece e tenta reprovar o que
 *    não sabe ler, mas a lista do que ela não lê não é fechada. Reprova nestes
 *    casos:
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
 *    - O corpo por constante (`send(RESPOSTA_X)`) só é lido quando o nome
 *      resolve, pelo escopo, a um `const` não exportado com objeto literal, e
 *      todo outro uso dele no arquivo é leitura (`X.campo`, `...X`, outro
 *      `send(X)`, `typeof X`). `let`, `var`, parâmetro homônimo, exportação,
 *      escrita em campo, passar a uma função ou apelidar deixam o corpo sem
 *      leitura, e corpo sem leitura numa resposta de acesso reprova.
 *    - Formas que ela reconhece como ilegíveis, e reprova:
 *      `.code(...)` ou `.status(...)` fora de uma cadeia com `send` (o corpo
 *      iria num `return`), 401 ou 403 sem `erro`, corpo que não resolve (inclusive
 *      texto, com status calculado), `{ erro: "x", ...extra }` com o spread
 *      depois de `erro` (só passa o spread de objeto literal sem `erro`), `erro`
 *      do corpo por getter, setter ou método, escrita em `erro` ou `corpo` de
 *      qualquer objeto (ponto, colchete, operador composto, `delete`, `++`,
 *      desestruturação), colchete com chave literal nos nomes que ela lê com
 *      ponto (`resposta["code"](403)`, `["send"]`, `["erro"]`...), chamada por
 *      chave calculada (`resposta[m](403)`), `.send` usado sem ser chamado,
 *      `.call`, `.apply` e `.bind` (salvo `Object.prototype.hasOwnProperty.call`),
 *      chave calculada que não resolve a um `const` de texto, em objeto ou
 *      classe, texto com `FST_` (forja o código do Fastify cujo status o
 *      tratador repassa), `Object.setPrototypeOf`, `Object.create`, `__proto__`
 *      e `extends` de expressão que não é nome (forjam a classe de um erro),
 *      `toJSON`, `setReplySerializer`, `setSerializerCompiler`,
 *      `.serializer(...)`, `eval` e `Function`, `.redirect(url, status)` fora de
 *      3xx, `statusCode` ou `status` escritos à mão por qualquer forma
 *      (propriedade, abreviação, método, acessor, chave computada, colchete,
 *      operador composto, `Object.defineProperty`), `Object.assign`,
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
 * A guarda também lê a linha de status nos BYTES que a resposta manda ao socket
 * (`_writeRaw` e `_flushOutput` da instância): a cabeça gravada por baixo de
 * `writeHead` (`_storeHeader`, `_header` reescrito, `_writeRaw` com a cabeça
 * pronta) com 401 ou 403 que ela não conferiu troca a resposta inteira pela do
 * desvio (correção 4b).
 *
 * O que a guarda NÃO vê, para ninguém ler mais do que está escrito: escrita
 * direta no SOCKET, que não passa pela resposta do Node. Isso inclui
 * `req.socket.end("HTTP/1.1 403 ...")` (o M08 da revisão), o mesmo socket por
 * `.connection` ou `.client`, e um ouvinte nos eventos do servidor HTTP que
 * entregam o socket ou o pedido (`app.server.on("connection", ...)`, `request`,
 * `upgrade`, `secureConnection`, `clientError`); contra isso não há garantia em
 * tempo de execução, só a varredura (correção 4c). Também não vê o método do protótipo da
 * resposta chamado por fora da instância (`.call`, `.apply`, `Reflect`). O
 * corpo além da moldura que a cabeça declarou (`content-length`, `chunked`)
 * saiu desta lista na correção 6: a guarda liga `strictContentLength`, conta o
 * corpo e não deixa sair byte além do declarado. O status 1xx como resposta
 * final (`reply.code(102)`), que fazia o cliente ler a resposta do pedido
 * seguinte da conexão como a deste, é desvio desde a correção 7 e sai 500; a
 * resposta que termina só com cabeça provisória fecha a conexão; e o 401 ou 403
 * do catálogo com `content-length` que não bate sai como a resposta do desvio
 * (o socket arrolhado pelo `end` do Node é desarrolhado). Os testes da guarda
 * provam cada forma da rodada 7 por socket cru em pipeline, nos dois modos; o
 * proxy da borda não foi medido. A varredura proíbe os dois
 * caminhos que restam (`.socket`, `.connection`, `.client`, ouvinte de
 * `connection`, `request` e afins no servidor, `.call`, `.apply`,
 * `.bind`, `Reflect`, nome interno da resposta do Node como `_writeRaw`,
 * `_header` e `outputData`, chave calculada na resposta, desestruturação de
 * `raw` e `socket`), mas é heurística. Nenhuma das três linhas prende código
 * no mesmo processo que troque, ANTES de a guarda carregar, as primitivas que
 * ela usa para decidir (ela as guarda na carga e, ao decidir, só usa essas
 * cópias, então `JSON`, `includes` ou `hasOwnProperty` trocados depois não a
 * enganam, e o teste dela prova), nem o que troque o próprio Node ou o
 * registrador de log. Fora do
 * escopo: os erros de outros status (404, 409, 422, 429, 5xx) e os
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
 * Não usa este catálogo e o painel e o aplicativo nunca falam com ele. A lista
 * própria dele mora em `apps/console/src/guarda-de-codigos-de-erro.ts`: a guarda
 * do console confere cada resposta 401 ou 403 contra ela (com os mesmos dois
 * modos), e a varredura o lê contra a mesma lista.
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
