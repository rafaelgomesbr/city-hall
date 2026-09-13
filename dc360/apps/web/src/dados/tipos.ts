/**
 * Os tipos que as páginas conhecem.
 *
 * Ficam separados porque existem duas implementações da mesma porta, uma
 * falando com o Postgres da própria aba e outra falando HTTP com a API, e as
 * duas precisam prometer exatamente a mesma coisa. Se os tipos morassem numa
 * delas, a outra viraria a "secundária" e as duas divergiriam com o tempo.
 */
import type {
  Papel, Severidade, StatusOcorrencia, TipoCobrade, TipoDeEntrada, Origem,
} from "@dc360/shared";

export type Sessao = {
  organizacaoId: string;
  organizacaoNome: string;
  municipio: string;
  uf: string;
  usuarioId: string;
  usuarioNome: string;
  papel: Papel;
};

export type LinhaOcorrencia = {
  id: string;
  protocolo: string;
  /*
    `TipoDeEntrada` e nao `TipoCobrade`, e a diferenca e um defeito que estava
    aberto: a abertura aceita "outro" desde a migracao 019, e as duas rotas de
    leitura devolvem `SELECT o.*`, entao "outro" CHEGA aqui. Enquanto o tipo
    declarado prometia so os oito da COBRADE, o compilador liberava
    `if (o.tipo === "deslizamento") ... else` sobre uma promessa que o banco
    nao faz, e nenhuma tela era obrigada a tratar o chamado que ainda espera
    classificacao.
  */
  tipo: TipoDeEntrada;
  /**
   * O que o solicitante contou, enquanto o tipo for "outro" e so enquanto for.
   *
   * Sem esta coluna na tela, quem faz a triagem precisa classificar sem ler o
   * relato que motivou o "outro", que e exatamente a classificacao no escuro
   * que a migracao 019 existe para evitar.
   */
  tipo_descricao: string | null;
  status: StatusOcorrencia;
  severidade: Severidade | null;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  solicitante_nome: string;
  solicitante_contato: string | null;
  canal_entrada: string;
  descricao: string;
  vulnerabilidade_presente: boolean;
  vulnerabilidade_descricao: string | null;
  equipe_id: string | null;
  equipe_nome: string | null;
  prazo_em: string | null;
  criado_em: string;
  encerrado_em: string | null;
  motivo_encerramento: string | null;
  /** Interdição, quando existe. Ver a migração 014: ela tem começo e fim. */
  interditada_em: string | null;
  desinterditada_em: string | null;
  desinterdicao_motivo: string | null;
};

/**
 * O que volta depois de corrigir a coordenada de uma ocorrência aberta.
 *
 * O ponto ANTERIOR volta junto porque a tela precisa poder dizer o que mudou,
 * e não só que mudou: quem acabou de mover o alfinete quer conferir que moveu
 * de onde achava que estava. `anterior` é nulo quando a ocorrência tinha sido
 * aberta sem ponto nenhum, que é fato diferente de ponto errado.
 *
 * `documentoJaEmitido` existe porque o laudo é gerado sob demanda e nunca
 * guardado: se um documento oficial já saiu com o ponto antigo, a reimpressão
 * vai divergir do papel que já está dentro do processo, e quem corrigiu
 * precisa saber disso na hora, não numa audiência.
 */
export type CorrecaoAplicada = {
  coordenada: { lat: number; lng: number };
  anterior: { lat: number; lng: number } | null;
  documentoJaEmitido: boolean;
};

export type LinhaEvento = {
  id: string;
  tipo: string;
  autor_nome: string;
  autor_papel: Papel;
  origem: Origem;
  ocorrido_em: string;
  registrado_em: string;
  detalhe: Record<string, unknown> | null;
};

export type LinhaEquipe = {
  id: string;
  nome: string;
  especialidade: string | null;
  ativa: boolean;
  em_atendimento: number;
};

export type LinhaUsuario = {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  papel: Papel;
  equipe_id: string | null;
  equipe_nome: string | null;
  ativo: boolean;
};

export type LinhaVistoria = {
  id: string;
  checklist: Array<{ chave: string; resposta: boolean }>;
  gps_precisao_metros: number | null;
  assinante_nome: string;
  observacoes: string | null;
  coletada_em: string;
  sincronizada_em: string;
  agente_nome: string | null;
};

export type LinhaProvidencia = {
  id: string;
  orgao_destino: string;
  descricao: string;
  responsavel: string;
  prazo_em: string;
  encaminhada_em: string;
  respondida_em: string | null;
  resposta: string | null;
  desfecho: string | null;
  respondida_por: string | null;
};

export type ContaDisponivel = {
  usuario_id: string;
  usuario_nome: string;
  papel: Papel;
  email: string;
  organizacao_id: string;
  organizacao_nome: string;
  municipio: string;
  uf: string;
};

export type FiltroOcorrencias = {
  busca?: string;
  status?: StatusOcorrencia | "todas" | "ativas";
  severidade?: Severidade | "todas";
  /**
   * Só as vencidas.
   *
   * Mora aqui, e não numa peneira depois da resposta, porque peneirar no
   * navegador só alcança a página que já desceu: com vinte linhas na mão e
   * trinta atrasadas na cidade, "só atrasadas" mostrava as que couberam e o
   * rodapé contava essas.
   */
  atrasadas?: boolean;
  pagina?: number;
  porPagina?: number;
};

/**
 * Uma página da lista com o total de verdade ao lado.
 *
 * O total é o que separa "estas são as ocorrências" de "estas são as
 * ocorrências que couberam". Toda tela que desenha um recorte precisa dele
 * para poder dizer na cara do usuário quantas ficaram de fora.
 */
export type PaginaDeOcorrencias = {
  itens: LinhaOcorrencia[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Um ponto do mapa: o mínimo que o desenho precisa.
 *
 * Deliberadamente mais estreito que `LinhaOcorrencia`. Uma tela que carrega a
 * cidade inteira de uma vez não tem por que trazer junto o telefone do
 * solicitante, o relato e a descrição de vulnerabilidade social.
 */
export type PontoNoMapa = {
  id: string;
  protocolo: string;
  /*
    Tambem `TipoDeEntrada`: o mapa desenha as ativas, e "outro" vive nos dois
    primeiros estados do fluxo, que sao ativos. Um chamado a classificar com
    coordenada aparece no mapa antes de qualquer triagem.
  */
  tipo: TipoDeEntrada;
  status: StatusOcorrencia;
  severidade: Severidade | null;
  endereco: string;
  latitude: number;
  longitude: number;
};

export type PontosDoMapa = {
  itens: PontoNoMapa[];
  /** Ativas COM coordenada. É o universo do mapa. */
  total: number;
  /** Ativas sem coordenada: existem, e nenhum desenho as mostra. */
  semCoordenada: number;
  pagina: number;
  porPagina: number;
};

export type Indicadores = {
  na_fila: number;
  em_campo: number;
  atrasadas: number;
  encerradas_7d: number;
  criticas: number;
  providencias_abertas: number;
  providencias_vencidas: number;
};

/** Uma ocorrência apontada por, ou apontando para, outra. */
export type VinculoOcorrencia = {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  endereco: string;
  criado_em: string;
};

/**
 * Um imóvel interditado que ainda não foi liberado.
 *
 * A lista que isto alimenta existe pelo mesmo motivo que a de providências
 * vencidas: para que "tem família fora de casa há quatro meses" seja um fato
 * na tela, e não uma descoberta quando alguém reclama.
 */
export type ImovelInterditado = {
  id: string;
  protocolo: string;
  tipo: TipoCobrade;
  severidade: Severidade | null;
  status: StatusOcorrencia;
  endereco: string;
  ponto_referencia: string | null;
  interditada_em: string;
  interditada_por_nome: string | null;
};

export type ProvidenciaPendente = {
  id: string;
  orgao_destino: string;
  descricao: string;
  responsavel: string;
  prazo_em: string;
  encaminhada_em: string;
  ocorrencia_id: string;
  protocolo: string;
  endereco: string;
  status: StatusOcorrencia;
};

/** Como o painel está conversando com o banco nesta execução. */
export type Modo = "local" | "api";

export type LinhaEvidencia = {
  id: string;
  legenda: string | null;
  capturadaEm: string;
  ordem: number;
  tipoConteudo: string;
  tamanhoBytes: number;
  /** Assinada e de vida curta: nunca existe endereço público para evidência. */
  url: string;
};

export type LinhaTrilha = {
  id: string;
  tipo: string;
  autor_nome: string;
  autor_papel: Papel;
  origem: Origem;
  ocorrido_em: string;
  registrado_em: string;
  detalhe: Record<string, unknown> | null;
  ocorrencia_id: string;
  protocolo: string;
  endereco: string;
};

export type ResumoPeriodo = {
  total: number;
  encerradas: number;
  criticas: number;
  comVulnerabilidade: number;
  medianaHorasAteEncerrar: number | null;
  porTipo: Array<{ tipo: string; rotulo: string; total: number }>;
  porBairro: Array<{ bairro: string; total: number }>;
};

export type FiltroTrilha = {
  autor?: string;
  tipo?: string;
  protocolo?: string;
  pagina?: number;
};

/* ==========================================================================
   O trabalho do agente de campo
   ========================================================================== */

export type EquipeDoAgente = {
  id: string;
  nome: string | null;
  especialidade: string | null;
  ativa: boolean | null;
};

export type ColegaDeEquipe = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
};

export type TarefaDesignada = {
  id: string;
  protocolo: string;
  tipo: TipoCobrade;
  severidade: Severidade | null;
  status: StatusOcorrencia;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  descricao: string;
  solicitante_nome: string;
  solicitante_contato: string | null;
  vulnerabilidade_presente: boolean;
  vulnerabilidade_descricao: string | null;
  prazo_em: string | null;
  criado_em: string;
};

export type VistoriaConcluida = {
  id: string;
  coletada_em: string;
  sincronizada_em: string;
  gps_precisao_metros: number | null;
  assinante_nome: string;
  ocorrencia_id: string;
  protocolo: string;
  tipo: TipoCobrade;
  severidade: Severidade | null;
  status: StatusOcorrencia;
  endereco: string;
};

export type MeuTrabalho = {
  equipe: EquipeDoAgente | null;
  colegas: ColegaDeEquipe[];
  designadas: TarefaDesignada[];
  concluidas: VistoriaConcluida[];
  /**
   * Quantas o agente concluiu DE VERDADE, e o teto que a lista acima respeita.
   *
   * Os dois existem porque a tela imprimia o tamanho da lista como se fosse a
   * contagem. Um agente com sessenta e duas vistorias lia "Vistorias que eu
   * concluí (50)", e as doze mais antigas não apareciam em lugar nenhum: se ele
   * precisasse mostrar que vistoriou aquele imóvel em janeiro, a tela AFIRMAVA
   * que ele nunca vistoriou.
   */
  totalConcluidas: number;
  tetoDeConcluidas: number;
};

/**
 * Os documentos oficiais que o servidor sabe emitir.
 *
 * A lista vive aqui, e não dentro de uma das duas implementações, porque as
 * duas precisam dela: enquanto ela morava só no arquivo HTTP, o modo de
 * demonstração não tinha como declarar a mesma assinatura, e a divergência
 * entre os dois modos passava despercebida.
 */
export type TipoDeDocumento =
  | "laudo"
  | "termo-de-interdicao"
  | "termo-de-desinterdicao"
  | "laudo.pdf"
  | "termo-de-interdicao.pdf";

/**
 * O que volta ao redefinir a senha de outra pessoa.
 *
 * A senha em claro vem UMA vez, e só aqui: com o envio de email desligado, é
 * por este campo que ela chega em quem administra para ser ditada por
 * telefone. Guardar isso em estado que sobrevive à tela seria transformar a
 * exceção em vazamento.
 */
export type SenhaRedefinida = {
  senhaTemporaria: string;
  sessoesEncerradas: number;
  mensagem: string;
};

/** O que volta ao derrubar as sessões de outra pessoa, sem tocar na senha. */
export type SessoesDeOutrem = {
  id: string;
  sessoesEncerradas: number;
};

/** O que volta ao sair de todos os outros aparelhos, preservando este. */
export type MinhasSessoes = {
  sessoesEncerradas: number;
  mensagem: string;
};

// ---------------------------------------------------------------------------
// Verificação em duas etapas
// ---------------------------------------------------------------------------

/**
 * O que a entrada devolve quando a senha conferiu e a sessão NÃO nasceu.
 *
 * O painel precisa distinguir os dois desfechos porque as telas são
 * diferentes: `codigo` pede os seis dígitos, `ativacao` é o administrador que
 * o município obriga a ligar a verificação antes de entrar. Em nenhum dos dois
 * existe token de acesso ainda, e é por isso que o `desafio` viaja: ele não
 * abre rota nenhuma, só a segunda etapa.
 */
export type DesafioDeEntrada = {
  segundoFator: "codigo" | "ativacao";
  desafio: string;
  expiraEm: number;
  mensagem: string;
};

export type ResultadoDeEntrada =
  | { tipo: "sessao"; sessao: Sessao; codigosDeRecuperacaoRestantes?: number;
      entrouComCodigoDeRecuperacao?: boolean }
  | { tipo: "segundo-fator"; desafio: DesafioDeEntrada };

/** Como está a verificação em duas etapas da conta de quem está usando. */
export type SituacaoSegundoFator = {
  ativo: boolean;
  pendente: boolean;
  exigido: boolean;
  codigosRestantes: number;
  /** Falso quando o servidor está com o recurso desligado. */
  disponivel: boolean;
};

/** O que a tela mostra uma vez, e nunca mais: o segredo e o endereço do código QR. */
export type AtivacaoSegundoFator = {
  segredo: string;
  uri: string;
  mensagem: string;
};

/**
 * O fim da ativação: os códigos de recuperação, que aparecem uma vez só.
 *
 * `sessao` só vem preenchida quando quem ligou ainda não tinha sessão, que é o
 * caso do administrador obrigado a ligar para entrar.
 */
export type SegundoFatorLigado = {
  codigosDeRecuperacao: string[];
  sessao?: Sessao;
  mensagem: string;
};

// ---------------------------------------------------------------------------
// Sino de avisos
// ---------------------------------------------------------------------------

/**
 * Um fato do município que o sino mostra.
 *
 * O que ele NÃO carrega é regra do banco (migração 018) e vale igual aqui:
 * nada de nome de solicitante, contato, endereço, relato ou descrição de
 * vulnerabilidade. O sino é a superfície mais consultada do produto, uma vez
 * a cada trinta segundos por pessoa logada, e o caminho para o dado pessoal é
 * a ocorrência, onde as permissões valem.
 */
export type Aviso = {
  id: string;
  tipo: string;
  ocorrenciaId: string;
  protocolo: string;
  criadoEm: string;
  detalhe: string | null;
  lido: boolean;
};

/**
 * O par que a próxima pergunta devolve ao servidor, sem alterar nada.
 *
 * O painel NUNCA monta este valor com o relógio dele. O relógio do computador
 * da coordenadoria não é o do servidor, e um marco adiantado faz a janela
 * seguinte começar no futuro: tudo que acontecer nesse intervalo cai fora e
 * não volta em pergunta nenhuma. Aviso repetido é chato, aviso pulado é o que
 * dói, porque nada na tela diz que faltou alguma coisa.
 */
export type CursorDeAvisos = {
  desde: string;
  /** Só vem preenchido quando a resposta anterior foi cortada pelo teto. */
  desdeId: string | null;
};

export type RespostaDeAvisos = {
  ate: string;
  ateId: string | null;
  itens: Aviso[];
  teto: number;
  /** A resposta bateu no teto: há mais para buscar, e o cursor diz onde. */
  truncada: boolean;
  naoLidos: number;
  /** A contagem bateu no próprio teto: o número é um piso, não o total. */
  naoLidosTruncado: boolean;
};

// ---------------------------------------------------------------------------
// Catálogo de órgãos
// ---------------------------------------------------------------------------

/**
 * Um órgão de destino do município.
 *
 * `providencias` e `abertas` vêm junto porque é o que torna a desativação uma
 * decisão informada: tirar da lista um órgão com trinta encaminhamentos em
 * aberto é diferente de tirar um que nunca foi usado, e a tela não tem como
 * saber a diferença sozinha.
 */
export type LinhaOrgao = {
  id: string;
  nome: string;
  sigla: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  desativado_em: string | null;
  motivo_desativacao: string | null;
  providencias: number;
  abertas: number;
};

/** O que o formulário de órgão manda, nos dois modos. */
export type DadosDoOrgao = {
  nome: string;
  sigla?: string;
  email?: string;
  telefone?: string;
};

// ---------------------------------------------------------------------------
// Ofício
// ---------------------------------------------------------------------------

/** Uma tentativa de envio, com o desfecho que ela teve. */
export type EnvioDeOficio = {
  id: string;
  tentativa: number;
  destinatario_email: string;
  solicitado_em: string;
  solicitado_por_nome: string;
  desfecho: string;
  detalhe: string | null;
  expira_em: string;
};

/** Uma abertura do link de uso único, inclusive a recusada. */
export type AberturaDeOficio = {
  envio_id: string;
  resultado: string;
  registrado_em: string;
};

export type LinhaOficio = {
  id: string;
  numero: string;
  emitido_em: string;
  emitido_por_nome: string;
  providencia_id: string;
  orgao_nome: string;
  orgao_sigla: string | null;
  envios: number;
  ultimo_envio: string | null;
  aberto_em: string | null;
};

/**
 * A ficha do ofício: as tentativas e as aberturas.
 *
 * É a tela que responde "mandamos ou não, e alguém abriu". Ela não traz o
 * token do link nem o hash dele, e a razão é do servidor: devolver isso
 * transformaria uma leitura corriqueira num caminho para reconstruir o
 * endereço fora do controle da rota pública, que é onde o uso único é cobrado.
 */
export type OficioDetalhado = {
  id: string;
  numero: string;
  observacoes: string | null;
  emitido_em: string;
  emitido_por_nome: string;
  providencia_id: string;
  orgao_nome: string;
  orgao_sigla: string | null;
  orgao_email: string | null;
  envios: EnvioDeOficio[];
  aberturas: AberturaDeOficio[];
};

/**
 * O recibo do envio.
 *
 * O endereço volta encoberto de propósito, e é o servidor que encobre: esta
 * resposta entra no log do navegador, e a tela só precisa confirmar para onde
 * foi, não repetir o endereço inteiro.
 */
export type ResultadoDeEnvio = {
  tentativa: number;
  destinatario: string;
  expiraEmHoras: number;
  restantes: number;
};

/**
 * O que o painel precisa saber do ambiente onde ele está rodando.
 *
 * Existe porque o painel é UM build estático servindo TODOS os municípios.
 * Tudo o que ele souber em tempo de build, ele sabe igual para todo mundo, e
 * isso está certo para a cor do botão e errado para uma chave de mapa que
 * alguém paga: o Google cobra por carregamento, e a chave assada no build
 * seria a do fornecedor pagando o mapa de todas as prefeituras.
 */
export type ConfiguracaoDoPainel = {
  /**
   * Vazia é resposta legítima, e é o padrão.
   *
   * Sem chave o painel desenha o plano esquemático, com as mesmas coordenadas
   * em escala e sem nenhum contato com o Google. É o modo que
   * `docs/SUBPROCESSADORES.md` seção 2.2 promete ao município que recusar o
   * envio, e é também o que sobra quando a prefeitura está sem internet. Por
   * isso o campo é string vazia e não `null`: quem consome não precisa de dois
   * jeitos de dizer "não tem".
   */
  chaveDoMapa: string;
};
