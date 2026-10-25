import { z } from "zod";

/**
 * O CATÁLOGO COMPLETO DOS CÓDIGOS DE ERRO DA API, com categoria, e o esquema da
 * resposta de erro (V2-F02-E03).
 *
 * ## O que já existia e o que isto acrescenta
 *
 * `codigos-de-erro.ts` cobre só os erros de ACESSO (401 e 403), com a AÇÃO que
 * o cliente executa. Este arquivo generaliza: TODO `erro` que a API devolve
 * está aqui, com o status HTTP e uma CATEGORIA, que responde a uma pergunta só:
 * "o que fazer com isto?". As cinco categorias existem para que nenhuma ponta
 * volte a decidir pelo status (o aplicativo lia todo 401 como sessão morta, o
 * painel renovava em qualquer 401) ou pelo texto da mensagem.
 *
 * Nenhum código mudou de nome ao entrar aqui. Os 404 continuam mistos
 * (`nao_encontrado` e `nao_encontrada`): clientes instalados já os leem assim,
 * e o contrato é o texto do código, não a gramática dele.
 *
 * ## As cinco categorias
 *
 * - `renovar`: o cliente resolve sozinho, sem incomodar a pessoa. Pede
 *   credencial ou endereço novo e repete o pedido UMA vez (token vencido, URL
 *   assinada vencida).
 * - `reentrar`: a pessoa precisa provar quem é de novo (entrar, trocar a senha
 *   provisória, usar a conta certa). O que está guardado no aparelho fica.
 * - `corrigir`: o pedido tem um problema que a pessoa pode consertar (campo
 *   inválido, nome repetido, foto ainda por enviar). Repetir igual não adianta;
 *   mudar o que foi enviado, sim.
 * - `aguardar`: o problema não é do pedido nem da pessoa. Repetir o MESMO
 *   pedido mais tarde pode dar certo (servidor indisponível, limite de uso,
 *   recurso desligado, prazo que ainda não venceu).
 * - `permanente`: repetir o mesmo pedido nunca dá certo, e a pessoa não tem o
 *   que mudar nele (recurso inexistente, ato já feito, perfil sem permissão,
 *   conta desativada). Para de tentar e mostra a mensagem.
 *
 * O `status` registrado é o que a rota escreve hoje. Os clientes de campo já
 * instalados leem status e `erro`; nenhum dos dois muda. A categoria é
 * ADITIVA: vem do catálogo (e, no futuro, também no corpo, em `categoria`).
 *
 * ## Recurso de outro município
 *
 * Não tem código próprio, de propósito: a resposta é 404 `nao_encontrada` ou
 * `nao_encontrado`, igual à de um recurso que não existe. Um 403 confirmaria
 * que o registro existe.
 *
 * ## O que é reservado
 *
 * `CODIGOS_RESERVADOS` guarda os códigos que etapas futuras emitirão. Ficam
 * FORA de `CODIGOS_DE_ERRO` para que a varredura da API ("todo código do
 * catálogo é emitido por alguém") continue exigindo emissor real: quando a
 * etapa dona passar a emitir o código, ele muda de lista no mesmo commit.
 */

export const CATEGORIAS_DE_ERRO = [
  "renovar",
  "reentrar",
  "corrigir",
  "aguardar",
  "permanente",
] as const;

export type CategoriaDeErro = (typeof CATEGORIAS_DE_ERRO)[number];

/** O que cada categoria manda fazer, em uma frase, para a tabela e para quem lê o código. */
export const DESCRICAO_DAS_CATEGORIAS: Readonly<Record<CategoriaDeErro, string>> = {
  renovar:
    "O cliente pede credencial ou endereço novo e repete o pedido uma vez, sem incomodar a pessoa.",
  reentrar: "A pessoa precisa provar quem é de novo; o que está guardado no aparelho fica.",
  corrigir: "A pessoa muda o que enviou (ou a escolha) e envia de novo; repetir igual não adianta.",
  aguardar: "Repetir o mesmo pedido mais tarde pode dar certo; o problema não é do pedido.",
  permanente: "Repetir o mesmo pedido nunca dá certo; para de tentar e mostra a mensagem.",
};

export type EntradaDoCatalogoDeErros = {
  /** O status HTTP que a rota escreve. */
  readonly status: number;
  /** Outros status com que o MESMO código também sai (ex.: `acesso_suspenso` é 503 na fila). */
  readonly tambemSai?: readonly number[];
  readonly categoria: CategoriaDeErro;
  /** O nome curto do que houve. A frase completa é da rota e pode mudar sem aviso. */
  readonly titulo: string;
};

/**
 * Os códigos que a API emite hoje (levantados em `apps/api/src`), agrupados por
 * assunto. A ordem dos grupos é a de leitura; a tabela gerada ordena por código.
 */
export const CODIGOS_DE_ERRO = {
  /* ---- Acesso: autenticação, vigência e permissão (de `codigos-de-erro.ts`) ---- */
  nao_autenticado: {
    status: 401,
    categoria: "renovar",
    titulo: "Token ausente, inválido ou vencido",
  },
  sessao_encerrada: {
    status: 401,
    categoria: "reentrar",
    titulo: "Sessão encerrada ou cadastro alterado",
  },
  conta_desativada: { status: 403, categoria: "permanente", titulo: "Conta desativada" },
  acesso_suspenso: {
    status: 403,
    tambemSai: [503],
    categoria: "aguardar",
    titulo: "Acesso do município suspenso pelo fornecedor",
  },
  troca_de_senha_obrigatoria: {
    status: 403,
    categoria: "reentrar",
    titulo: "Senha provisória: definir a senha",
  },
  sem_permissao: {
    status: 403,
    categoria: "permanente",
    titulo: "Perfil sem permissão para a ação",
  },
  posto_insuficiente: {
    status: 403,
    categoria: "permanente",
    titulo: "Perfil não administra esta conta",
  },
  posto_insuficiente_para_dado_pessoal: {
    status: 403,
    categoria: "permanente",
    titulo: "Exportação com dado pessoal é de quem administra",
  },
  email_so_por_administrador: {
    status: 403,
    categoria: "permanente",
    titulo: "Troca de email é de quem administra",
  },
  assinatura: {
    status: 403,
    categoria: "renovar",
    titulo: "Endereço assinado de arquivo ausente, adulterado ou vencido",
  },

  /* ---- Entrada (e-mail e senha) ---- */
  credenciais: { status: 401, categoria: "reentrar", titulo: "E-mail ou senha não conferem" },
  senha_provisoria_vencida: {
    status: 401,
    categoria: "permanente",
    titulo: "Senha provisória vencida",
  },
  bloqueado: { status: 429, categoria: "aguardar", titulo: "Tentativas de entrada demais" },

  /* ---- Segundo fator ---- */
  segundo_fator_desligado: {
    status: 503,
    categoria: "aguardar",
    titulo: "Segundo fator desligado neste servidor",
  },
  segundo_fator_ilegivel: {
    status: 503,
    categoria: "aguardar",
    titulo: "Segredo do segundo fator ilegível",
  },
  segundo_fator_ja_ativo: {
    status: 409,
    categoria: "permanente",
    titulo: "Segundo fator já está ativo",
  },
  segundo_fator_nao_esta_ativo: {
    status: 409,
    categoria: "permanente",
    titulo: "Segundo fator não está ativo",
  },
  ativacao_nao_iniciada: {
    status: 409,
    categoria: "corrigir",
    titulo: "Não há ativação do segundo fator em andamento",
  },
  codigo_invalido: {
    status: 422,
    categoria: "corrigir",
    titulo: "Código do segundo fator não confere",
  },
  senha_nao_confere: { status: 422, categoria: "corrigir", titulo: "Senha informada não confere" },
  conta_nao_encontrada: { status: 404, categoria: "permanente", titulo: "Conta não encontrada" },

  /* ---- Forma do pedido e infraestrutura ---- */
  dados_invalidos: {
    status: 422,
    categoria: "corrigir",
    titulo: "Campos do pedido precisam ser corrigidos",
  },
  corpo_invalido: {
    status: 400,
    tambemSai: [413, 415],
    categoria: "corrigir",
    titulo: "Corpo do pedido ilegível, grande demais ou de tipo não aceito",
  },
  corpo_vazio: { status: 400, categoria: "corrigir", titulo: "Nenhum conteúdo recebido" },
  tipo_recusado: { status: 415, categoria: "corrigir", titulo: "Tipo de arquivo não aceito" },
  excesso_de_requisicoes: { status: 429, categoria: "aguardar", titulo: "Requisições demais" },
  erro_interno: { status: 500, categoria: "aguardar", titulo: "Erro inesperado do servidor" },
  desvio_do_catalogo_de_erro: {
    status: 500,
    categoria: "aguardar",
    titulo: "Resposta de acesso fora do catálogo (só em teste)",
  },
  nao_encontrado: {
    status: 404,
    categoria: "permanente",
    titulo: "Rota ou recurso não encontrado",
  },
  nao_encontrada: { status: 404, categoria: "permanente", titulo: "Recurso não encontrado" },

  /* ---- Recursos desligados ou indisponíveis neste servidor ---- */
  caminho_desligado: { status: 503, categoria: "aguardar", titulo: "Caminho por ruas desligado" },
  caminho_indisponivel: {
    status: 502,
    categoria: "aguardar",
    titulo: "Caminho por ruas indisponível agora",
  },
  push_desligado: { status: 503, categoria: "aguardar", titulo: "Notificação por push desligada" },
  push_android_desligado: {
    status: 503,
    categoria: "aguardar",
    titulo: "Push para Android desligado",
  },
  envio_desligado: {
    status: 503,
    categoria: "aguardar",
    titulo: "Envio de ofício por email desligado",
  },
  recuperacao_desligada: {
    status: 503,
    categoria: "aguardar",
    titulo: "Recuperação de senha por email desligada",
  },
  envio_falhou: {
    status: 502,
    categoria: "aguardar",
    titulo: "Provedor de email não entregou o envio",
  },
  nao_resolveu: {
    status: 502,
    categoria: "aguardar",
    titulo: "Serviço de mapa não resolveu o link",
  },
  pdf_indisponivel: { status: 503, categoria: "aguardar", titulo: "Geração de PDF indisponível" },
  armazenamento_indisponivel: {
    status: 503,
    categoria: "aguardar",
    titulo: "Armazenamento de arquivos indisponível",
  },
  teto_de_armazenamento: {
    status: 507,
    categoria: "aguardar",
    titulo: "Teto de armazenamento do município atingido",
  },

  /* ---- Arquivos e evidências ---- */
  objeto_ja_existe: {
    status: 412,
    categoria: "permanente",
    titulo: "Já existe arquivo nesta chave",
  },
  arquivo_ausente: {
    status: 409,
    categoria: "corrigir",
    titulo: "O arquivo não chegou ao armazenamento",
  },
  arquivo_grande_demais: {
    status: 409,
    categoria: "corrigir",
    titulo: "Arquivo maior que o limite",
  },
  tamanho_divergente: {
    status: 409,
    categoria: "corrigir",
    titulo: "Tamanho do arquivo difere do declarado",
  },
  hash_divergente: {
    status: 409,
    categoria: "corrigir",
    titulo: "Conteúdo do arquivo difere do declarado",
  },
  envio_pendente: {
    status: 409,
    categoria: "aguardar",
    titulo: "Arquivo ainda não terminou de subir",
  },
  chave_fora_do_lugar: {
    status: 422,
    categoria: "corrigir",
    titulo: "Chave de arquivo fora do lugar esperado",
  },
  data_implausivel: {
    status: 422,
    categoria: "corrigir",
    titulo: "Data do registro não é plausível",
  },
  evidencia_ja_vinculada: {
    status: 409,
    categoria: "corrigir",
    titulo: "Fotografia já vinculada a outro registro",
  },
  evidencia_de_outro_agente: {
    status: 409,
    categoria: "corrigir",
    titulo: "Fotografia de outro agente",
  },

  /* ---- Autoria e relógio do aparelho ---- */
  autor_divergente: {
    status: 409,
    categoria: "reentrar",
    titulo: "Registro feito por outra pessoa",
  },
  relogio_do_aparelho: {
    status: 409,
    categoria: "corrigir",
    titulo: "Data e hora do aparelho fora do horário real",
  },

  /* ---- Ocorrência, estado e interdição ---- */
  estado_mudou: {
    status: 409,
    categoria: "corrigir",
    titulo: "O estado mudou enquanto o pedido era feito",
  },
  transicao_invalida: {
    status: 409,
    categoria: "permanente",
    titulo: "Transição de estado não permitida",
  },
  ja_no_estado_final: {
    status: 409,
    categoria: "permanente",
    titulo: "Ocorrência já está encerrada",
  },
  ja_encerrada: { status: 409, categoria: "permanente", titulo: "Registro já encerrado" },
  ocorrencia_encerrada: {
    status: 409,
    categoria: "permanente",
    titulo: "Ocorrência encerrada não aceita o ato",
  },
  tipo_a_classificar: {
    status: 409,
    categoria: "corrigir",
    titulo: "Tipo da ocorrência ainda a classificar",
  },
  interdicao_ativa: {
    status: 409,
    categoria: "permanente",
    titulo: "Ocorrência interditada: levantar antes de encerrar",
  },
  nao_interditada: {
    status: 409,
    categoria: "permanente",
    titulo: "Ocorrência não está interditada",
  },
  ja_desinterditada: { status: 409, categoria: "permanente", titulo: "Interdição já levantada" },

  /* ---- Documentos ---- */
  sem_vistoria: {
    status: 409,
    categoria: "permanente",
    titulo: "Ocorrência sem vistoria concluída",
  },
  sem_despacho: { status: 409, categoria: "permanente", titulo: "Ocorrência ainda não despachada" },
  interdicao_nao_indicada: {
    status: 409,
    categoria: "permanente",
    titulo: "A vistoria não indicou interdição",
  },
  nao_desinterditada: {
    status: 409,
    categoria: "permanente",
    titulo: "Não houve interdição levantada",
  },

  /* ---- Saída a campo e tarefas ---- */
  saida_ja_aberta: {
    status: 409,
    categoria: "permanente",
    titulo: "Já há uma saída a campo aberta",
  },
  status_nao_permite: {
    status: 409,
    categoria: "permanente",
    titulo: "A tarefa não está mais em campo",
  },
  vistoria_ja_concluida: {
    status: 409,
    categoria: "permanente",
    titulo: "Vistoria já registrada por outra pessoa da equipe",
  },
  tarefa_no_prazo: { status: 409, categoria: "aguardar", titulo: "Tarefa ainda dentro do prazo" },

  /* ---- Equipe, órgão e providência ---- */
  equipe_inexistente: { status: 404, categoria: "corrigir", titulo: "Equipe informada não existe" },
  equipe_inativa: {
    status: 409,
    categoria: "corrigir",
    titulo: "Equipe informada está desativada",
  },
  orgao_nao_encontrado: {
    status: 404,
    categoria: "corrigir",
    titulo: "Órgão informado não existe",
  },
  orgao_desativado: {
    status: 409,
    categoria: "corrigir",
    titulo: "Órgão informado está desativado",
  },
  orgao_repetido: { status: 409, categoria: "corrigir", titulo: "Já existe órgão com este nome" },
  ja_ativo: { status: 409, categoria: "permanente", titulo: "Órgão já está ativo" },
  ja_desativado: { status: 409, categoria: "permanente", titulo: "Órgão já está desativado" },
  ja_respondida: { status: 409, categoria: "permanente", titulo: "Providência já tem resposta" },

  /* ---- Ofício ---- */
  ja_emitido: { status: 409, categoria: "permanente", titulo: "Ofício já emitido" },
  orgao_sem_email: { status: 409, categoria: "corrigir", titulo: "Órgão sem email cadastrado" },
  dominio_nao_autorizado: {
    status: 422,
    categoria: "corrigir",
    titulo: "Domínio de email não autorizado",
  },
  teto_de_envios: {
    status: 409,
    categoria: "permanente",
    titulo: "Limite de envios do ofício atingido",
  },

  /* ---- Administração de usuários e equipes ---- */
  nome_repetido: { status: 409, categoria: "corrigir", titulo: "Já existe registro com este nome" },
  usuario_repetido: {
    status: 409,
    categoria: "corrigir",
    titulo: "Já existe usuário com este email",
  },
  autodesativacao: {
    status: 422,
    categoria: "permanente",
    titulo: "Ninguém desativa a própria conta",
  },
  autoredefinicao: {
    status: 422,
    categoria: "permanente",
    titulo: "Ninguém redefine a própria senha por aqui",
  },
  autoencerramento: {
    status: 422,
    categoria: "permanente",
    titulo: "Ninguém encerra a própria sessão por aqui",
  },
  ultimo_administrador: {
    status: 422,
    categoria: "permanente",
    titulo: "Município precisa de ao menos um administrador",
  },
  vulnerabilidade_depois_do_nome: {
    status: 422,
    categoria: "corrigir",
    titulo: "Prazo da vulnerabilidade maior que o do nome do solicitante",
  },

  /* ---- Mapa e exportação ---- */
  link_nao_aceito: { status: 422, categoria: "corrigir", titulo: "Link de mapa não aceito" },
  sem_ponto: { status: 422, categoria: "corrigir", titulo: "Link de mapa sem ponto reconhecível" },
  recorte_grande_demais: {
    status: 409,
    categoria: "corrigir",
    titulo: "Recorte da exportação grande demais",
  },
} as const satisfies Record<string, EntradaDoCatalogoDeErros>;

export type CodigoDeErro = keyof typeof CODIGOS_DE_ERRO;

/**
 * Os códigos que etapas futuras emitirão. Não valem como código emitido hoje:
 * o catálogo da API não os conta, e a varredura que exige emissor real não os
 * enxerga. Quando a etapa dona passa a emitir, o código vai para `CODIGOS_DE_ERRO`
 * no mesmo commit.
 */
export const CODIGOS_RESERVADOS = {
  /** V2-F02-E07: a chave de idempotência já pertence a outro registro. */
  chave_ja_usada_em_outro_registro: {
    status: 409,
    categoria: "permanente",
    titulo: "Chave de idempotência já usada em outro registro",
  },
  /** V2-F02-E08: o aplicativo está abaixo da versão mínima aceita (426). */
  versao_do_aplicativo_antiga: {
    status: 426,
    categoria: "permanente",
    titulo: "Versão do aplicativo abaixo da mínima aceita",
  },
  /** F11, cidadão: o cabeçalho de versão é obrigatório no modo público (426). */
  versao_do_aplicativo_ausente: {
    status: 426,
    categoria: "permanente",
    titulo: "Versão do aplicativo ausente ou malformada",
  },
} as const satisfies Record<string, EntradaDoCatalogoDeErros>;

export type CodigoReservado = keyof typeof CODIGOS_RESERVADOS;

export const LISTA_DE_CODIGOS_DE_ERRO = Object.keys(CODIGOS_DE_ERRO) as readonly CodigoDeErro[];

/** Se o texto é um código emitido hoje pela API. Reservado dá `false`. */
export function ehCodigoDeErro(valor: unknown): valor is CodigoDeErro {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(CODIGOS_DE_ERRO, valor);
}

export function ehCodigoReservado(valor: unknown): valor is CodigoReservado {
  return (
    typeof valor === "string" && Object.prototype.hasOwnProperty.call(CODIGOS_RESERVADOS, valor)
  );
}

export function ehCategoriaDeErro(valor: unknown): valor is CategoriaDeErro {
  return typeof valor === "string" && (CATEGORIAS_DE_ERRO as readonly string[]).includes(valor);
}

/** A categoria do código (emitido ou reservado), ou `null` se ele não é do catálogo. */
export function categoriaDoCodigo(valor: unknown): CategoriaDeErro | null {
  if (ehCodigoDeErro(valor)) return CODIGOS_DE_ERRO[valor].categoria;
  if (ehCodigoReservado(valor)) return CODIGOS_RESERVADOS[valor].categoria;
  return null;
}

/**
 * Plano B para o cliente que recebeu um código que ele não conhece (servidor
 * mais novo que o aplicativo): 429 e 5xx esperam; 4xx comum não se repete;
 * 401 fica sem resposta, porque 401 sem código conhecido não diz se é token
 * vencido ou sessão morta, e adivinhar foi o defeito que esta tabela encerra.
 */
export function categoriaPadraoDoStatus(status: number): CategoriaDeErro | null {
  if (status === 429 || status >= 500) return "aguardar";
  if (status === 401) return null;
  if (status >= 400) return "permanente";
  return null;
}

/**
 * A categoria de um corpo de erro. Ordem: a `categoria` que o servidor mandou
 * (campo aditivo, quando existir), depois o catálogo pelo `erro`, depois o plano
 * B pelo status quando ele é informado. `null` quando nada decide.
 */
export function categoriaDoErro(corpo: unknown, status?: number): CategoriaDeErro | null {
  if (typeof corpo === "object" && corpo !== null) {
    const { categoria, erro } = corpo as { categoria?: unknown; erro?: unknown };
    if (ehCategoriaDeErro(categoria)) return categoria;
    const doCatalogo = categoriaDoCodigo(erro);
    if (doCatalogo) return doCatalogo;
  }
  return status === undefined ? null : categoriaPadraoDoStatus(status);
}

/**
 * O CORPO DE TODA RESPOSTA DE ERRO DA API.
 *
 * `{ erro, mensagem, campos?, requisicao?, categoria? }`. Só `erro` e
 * `mensagem` são sempre presentes. `campos` vem no 422 e nas regras que apontam
 * campo; `requisicao` vem no 500; `categoria` é o espaço reservado para o
 * servidor repetir a categoria do catálogo.
 *
 * Duas decisões que não são óbvias:
 *
 * - `erro` é texto, e não a enumeração do catálogo. O cliente instalado fala
 *   com servidor mais novo, e um código que ele não conhece não pode reprovar o
 *   corpo inteiro e esconder a `mensagem`. Quem quer saber se o código é
 *   conhecido usa `ehCodigoDeErro`.
 * - O objeto é ABERTO (`looseObject`): campo novo é sempre aditivo, e a 426 já
 *   prevista carrega `versaoMinima`. Cliente que valida com este esquema não
 *   rejeita campo que ainda não existe.
 */
export const erroDaApiSchema = z.looseObject({
  erro: z.string().min(1, "O erro precisa de um código"),
  mensagem: z.string(),
  campos: z.array(z.object({ campo: z.string(), mensagem: z.string() })).optional(),
  requisicao: z.string().optional(),
  categoria: z.enum(CATEGORIAS_DE_ERRO).optional(),
});

export type ErroDaApi = z.infer<typeof erroDaApiSchema>;

/**
 * A tabela do catálogo em Markdown, ordenada por código, para a evidência e
 * para quem precisa ler a lista (a validação humana da E03 é essa leitura).
 */
export function tabelaDoCatalogoEmMarkdown(): string {
  const linha = (codigo: string, e: EntradaDoCatalogoDeErros, situacao: string): string => {
    const status = [e.status, ...(e.tambemSai ?? [])].join(" ou ");
    return `| \`${codigo}\` | ${status} | ${e.categoria} | ${e.titulo} | ${situacao} |`;
  };
  const emitidos = Object.entries(CODIGOS_DE_ERRO as Record<string, EntradaDoCatalogoDeErros>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, e]) => linha(codigo, e, "emitido"));
  const reservados = Object.entries(CODIGOS_RESERVADOS as Record<string, EntradaDoCatalogoDeErros>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, e]) => linha(codigo, e, "reservado"));
  return [
    "| Código | Status | Categoria | O que é | Situação |",
    "| --- | --- | --- | --- | --- |",
    ...emitidos,
    ...reservados,
  ].join("\n");
}
