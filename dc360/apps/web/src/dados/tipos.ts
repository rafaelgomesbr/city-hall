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
};

export type Indicadores = {
  na_fila: number;
  em_campo: number;
  atrasadas: number;
  encerradas_7d: number;
  criticas: number;
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
