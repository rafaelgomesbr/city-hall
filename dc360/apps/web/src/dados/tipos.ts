/**
 * Os tipos que as páginas conhecem.
 *
 * Ficam separados porque existem duas implementações da mesma porta, uma
 * falando com o Postgres da própria aba e outra falando HTTP com a API, e as
 * duas precisam prometer exatamente a mesma coisa. Se os tipos morassem numa
 * delas, a outra viraria a "secundária" e as duas divergiriam com o tempo.
 */
import type { Papel, Severidade, StatusOcorrencia, TipoCobrade, Origem } from "@dc360/shared";

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
  tipo: TipoCobrade;
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
  tipo: TipoCobrade;
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
};
