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
  encerrarSessao,
  listarOcorrencias,
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
  encerrarOcorrencia,
  indicadores,
  listarEquipes,
  criarEquipe,
  atualizarEquipe,
  listarUsuarios,
  criarUsuario,
  alternarUsuarioAtivo,
  abrirDocumento,
  listarEvidencias,
  pedirRecuperacao,
  redefinirSenha,
} = impl;

export { ErroDaApi } from "./http";

export type {
  ContaDisponivel,
  FiltroOcorrencias,
  Indicadores,
  LinhaEquipe,
  LinhaEvento,
  LinhaEvidencia,
  LinhaOcorrencia,
  LinhaProvidencia,
  LinhaUsuario,
  LinhaVistoria,
  Sessao,
} from "./tipos";
