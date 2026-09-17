/**
 * A porta pela qual as páginas falam com o banco.
 *
 * Existem duas implementações da mesma porta, e a escolha é de configuração,
 * não de código de tela:
 *
 * - `local`: Postgres em WebAssembly na própria aba, com as mesmas migrações
 *   e o mesmo RLS. Abre sem servidor nenhum, que é o que permite demonstrar o
 *   produto num notebook de prefeitura sem instalar nada.
 * - `api`: HTTP contra `apps/api`, com autenticação de verdade. É o caminho
 *   de produção, onde o painel não tem privilégio nenhum sobre o banco.
 *
 * Nenhuma página sabe qual das duas está ativa. Foi para isso que este módulo
 * foi desenhado como ponto único desde o começo.
 */
import * as local from "./local";
import * as api from "./http";

const usarApi = Boolean(import.meta.env["VITE_API_URL"]);

const impl = usarApi ? api : local;

export const MODO: "local" | "api" = usarApi ? "api" : "local";

export const {
  contasDisponiveis,
  entrarComSenha,
  conferirSegundoFator,
  situacaoSegundoFator,
  iniciarSegundoFator,
  confirmarSegundoFator,
  desativarSegundoFator,
  encerrarSessao,
  aoExpirar,
  listarOcorrencias,
  listarPaginaDeOcorrencias,
  pontosDoMapa,
  buscarOcorrencia,
  trilhaDaOcorrencia,
  vistoriaDaOcorrencia,
  providenciasDaOcorrencia,
  possiveisDuplicidades,
  abrirOcorrencia,
  classificarNaTriagem,
  despacharEquipe,
  encaminharProvidencia,
  responderProvidencia,
  vinculosDaOcorrencia,
  providenciasPendentes,
  devolucoesPendentes,
  devolucaoDaOcorrencia,
  imoveisInterditados,
  levantarInterdicao,
  corrigirCoordenada,
  meuTrabalhoDeCampo,
  encerrarOcorrencia,
  indicadores,
  listarEquipes,
  criarEquipe,
  atualizarEquipe,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  alternarUsuarioAtivo,
  redefinirSenhaDeUsuario,
  encerrarSessoesDeUsuario,
  abrirDocumento,
  listarEvidencias,
  pedirRecuperacao,
  registrarInteresse,
  redefinirSenha,
  trocarSenha,
  encerrarMinhasSessoes,
  consultarTrilha,
  tiposDeEvento,
  resumoDoPeriodo,
  baixarCsvDeOcorrencias,
  avisosDesde,
  configuracaoDoPainel,
  marcarAvisosLidos,
  listarOrgaos,
  criarOrgao,
  atualizarOrgao,
  desativarOrgao,
  reativarOrgao,
  listarOficios,
  detalharOficio,
  emitirOficio,
  enviarOficio,
  abrirOficio,
  quemEstaEmCampo,
  encerrarSaidaEmCampo,
  buscar,
  resolverLinkDeMapa,
  lerRetencaoDoMunicipio,
  salvarRetencaoDoMunicipio,
  baixarPacoteDeSaida,
} = impl;

export { ErroDaApi } from "./http";

/*
  Só o modo local tem persistência para perder. No modo API o dado mora no
  servidor, e a pergunta não faz sentido: a resposta é sempre não.
*/
export { bancoSemPersistencia } from "./banco";

export type {
  ContaDisponivel,
  FiltroOcorrencias,
  Indicadores,
  LinhaEquipe,
  LinhaEvento,
  FiltroTrilha,
  LinhaEvidencia,
  LinhaDaListaDeOcorrencias,
  LinhaOcorrencia,
  MinhasSessoes,
  PaginaDeOcorrencias,
  PontoNoMapa,
  PontosDoMapa,
  LinhaTrilha,
  ResumoPeriodo,
  LinhaProvidencia,
  ImovelInterditado,
  ProvidenciaPendente,
  DevolucaoPendente,
  DevolucaoDaOcorrencia,
  MeuTrabalho,
  TarefaDesignada,
  VistoriaConcluida,
  ColegaDeEquipe,
  EquipeDoAgente,
  VinculoOcorrencia,
  LinhaUsuario,
  LinhaVistoria,
  SenhaRedefinida,
  SessoesDeOutrem,
  TipoDeDocumento,
  Sessao,
  Aviso,
  CursorDeAvisos,
  RespostaDeAvisos,
  LinhaOrgao,
  DadosDoOrgao,
  LinhaOficio,
  OficioDetalhado,
  EnvioDeOficio,
  AberturaDeOficio,
  ResultadoDeEnvio,
  DesafioDeEntrada,
  ResultadoDeEntrada,
  SituacaoSegundoFator,
  AtivacaoSegundoFator,
  SegundoFatorLigado,
  ConfiguracaoDoPainel,
  QuemEstaEmCampo,
  SaidaEmCampo,
  GrupoDeBusca,
  RespostaDeBusca,
  ResultadoDeBusca,
  TipoDeResultado,
  PontoDoLinkDeMapa,
  PrazosDeRetencao,
  RetencaoDoMunicipio,
} from "./tipos";
