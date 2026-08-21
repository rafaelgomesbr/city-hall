import type {
  AberturaOcorrencia, Despacho, Encerramento, Papel, Providencia, Triagem,
} from "@dc360/shared";
import type {
  ContaDisponivel, FiltroOcorrencias, Indicadores, LinhaEquipe, LinhaEvento,
  FiltroTrilha, LinhaEvidencia, LinhaOcorrencia, LinhaProvidencia, LinhaTrilha,
  LinhaUsuario, LinhaVistoria, ResumoPeriodo, Sessao,
} from "./tipos";

/**
 * A mesma porta da camada local, agora falando HTTP com a API.
 *
 * Aqui o painel deixa de ter privilégio nenhum: ele manda um token e recebe o
 * que aquele token alcança. O isolamento entre municípios continua sendo
 * imposto pelo mesmo `SET LOCAL` de sempre, só que agora do lado do servidor,
 * onde ninguém com o console do navegador aberto chega.
 */

const BASE = String(import.meta.env["VITE_API_URL"] ?? "").replace(/\/$/, "");
const CHAVE_TOKENS = "dc360:tokens";

type Tokens = { acesso: string; renovacao: string };

function lerTokens(): Tokens | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_TOKENS);
    return bruto ? (JSON.parse(bruto) as Tokens) : null;
  } catch {
    return null;
  }
}

function guardarTokens(tokens: Tokens | null): void {
  try {
    if (tokens) sessionStorage.setItem(CHAVE_TOKENS, JSON.stringify(tokens));
    else sessionStorage.removeItem(CHAVE_TOKENS);
  } catch {
    /* modo privado: a sessão só não sobrevive ao recarregar */
  }
}

export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos: Array<{ campo: string; mensagem: string }>;

  constructor(status: number, corpo: Record<string, unknown>) {
    super(String(corpo["mensagem"] ?? "Não foi possível concluir a operação."));
    this.name = "ErroDaApi";
    this.status = status;
    this.codigo = String(corpo["erro"] ?? "erro");
    this.campos = Array.isArray(corpo["campos"])
      ? (corpo["campos"] as Array<{ campo: string; mensagem: string }>)
      : [];
  }
}

/**
 * Uma única renovação em voo por vez.
 *
 * Uma tela abre várias chamadas de uma vez. Se o token acabou de expirar,
 * todas recebem 401 juntas, e sem esta trava todas tentariam renovar. Como a
 * renovação é rotativa, a segunda chegaria com um token já gasto, o servidor
 * leria isso como reúso (sintoma de roubo) e derrubaria a sessão inteira. O
 * usuário seria deslogado exatamente por usar o sistema normalmente.
 */
let renovacaoEmVoo: Promise<boolean> | null = null;

async function renovar(): Promise<boolean> {
  if (renovacaoEmVoo) return renovacaoEmVoo;

  renovacaoEmVoo = (async () => {
    const tokens = lerTokens();
    if (!tokens) return false;
    try {
      const r = await fetch(`${BASE}/auth/renovar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ renovacao: tokens.renovacao }),
      });
      if (!r.ok) {
        guardarTokens(null);
        return false;
      }
      const corpo = await r.json();
      guardarTokens({ acesso: corpo.acesso, renovacao: corpo.renovacao });
      return true;
    } catch {
      return false;
    } finally {
      renovacaoEmVoo = null;
    }
  })();

  return renovacaoEmVoo;
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; repetiu?: boolean } = {},
): Promise<T> {
  const tokens = lerTokens();
  const cabecalhos: Record<string, string> = { accept: "application/json" };
  if (opcoes.corpo !== undefined) cabecalhos["content-type"] = "application/json";
  if (tokens) cabecalhos["authorization"] = `Bearer ${tokens.acesso}`;

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });

  // 401 uma vez significa "o token de acesso venceu": renova e repete. 401 de
  // novo significa que a sessão acabou de verdade, e aí não adianta insistir.
  if (resposta.status === 401 && !opcoes.repetiu && lerTokens()) {
    if (await renovar()) {
      return chamar<T>(caminho, { ...opcoes, repetiu: true });
    }
  }

  if (resposta.status === 204) return undefined as T;

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroDaApi(resposta.status, corpo);
  return corpo as T;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const MODO = "api" as const;

/**
 * Em modo API não existe lista de contas: escolher perfil sem senha é o
 * atalho do modo local, e oferecer isso aqui seria contradizer a autenticação.
 */
export async function contasDisponiveis(): Promise<ContaDisponivel[]> {
  return [];
}

export async function entrarComSenha(email: string, senha: string): Promise<Sessao> {
  const r = await chamar<{
    acesso: string;
    renovacao: string;
    usuario: {
      id: string; nome: string; papel: Papel;
      organizacaoId: string; organizacaoNome: string; municipio: string; uf: string;
    };
  }>("/auth/entrar", { metodo: "POST", corpo: { email, senha } });

  guardarTokens({ acesso: r.acesso, renovacao: r.renovacao });

  return {
    organizacaoId: r.usuario.organizacaoId,
    organizacaoNome: r.usuario.organizacaoNome,
    municipio: r.usuario.municipio,
    uf: r.usuario.uf,
    usuarioId: r.usuario.id,
    usuarioNome: r.usuario.nome,
    papel: r.usuario.papel,
  };
}

/** Revoga a sessão no servidor. Sem isso, sair só esqueceria o token localmente. */
export async function encerrarSessao(): Promise<void> {
  const tokens = lerTokens();
  guardarTokens(null);
  if (!tokens) return;
  await fetch(`${BASE}/auth/sair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ renovacao: tokens.renovacao }),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Ocorrências
//
// A sessão continua na assinatura, mesmo sem ser usada para montar a chamada:
// quem manda no município aqui é o token. O parâmetro fica para as páginas
// não precisarem saber com qual implementação estão falando.
// ---------------------------------------------------------------------------

function consulta(filtro: FiltroOcorrencias): string {
  const p = new URLSearchParams();
  if (filtro.busca?.trim()) p.set("busca", filtro.busca.trim());
  if (filtro.status) p.set("status", filtro.status);
  if (filtro.severidade) p.set("severidade", filtro.severidade);
  p.set("porPagina", "100");
  return p.toString();
}

export async function listarOcorrencias(
  _s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<LinhaOcorrencia[]> {
  const r = await chamar<{ itens: LinhaOcorrencia[] }>(`/ocorrencias?${consulta(filtro)}`);
  return r.itens;
}

type Detalhe = {
  ocorrencia: LinhaOcorrencia;
  trilha: LinhaEvento[];
  vistoria: LinhaVistoria | null;
  providencias: LinhaProvidencia[];
};

/**
 * A API devolve ocorrência, trilha, vistoria e providências numa resposta só.
 * As quatro funções abaixo existiam separadas na camada local; aqui elas
 * compartilham uma busca, para o detalhe não virar quatro viagens de rede.
 */
const cacheDetalhe = new Map<string, Promise<Detalhe>>();

function detalhe(id: string): Promise<Detalhe> {
  const pendente = cacheDetalhe.get(id);
  if (pendente) return pendente;
  const promessa = chamar<Detalhe>(`/ocorrencias/${id}`).finally(() => {
    // O cache dura só o instante em que as quatro chamadas da tela coincidem.
    setTimeout(() => cacheDetalhe.delete(id), 0);
  });
  cacheDetalhe.set(id, promessa);
  return promessa;
}

export async function buscarOcorrencia(_s: Sessao, id: string): Promise<LinhaOcorrencia | null> {
  try {
    return (await detalhe(id)).ocorrencia;
  } catch (erro) {
    if (erro instanceof ErroDaApi && erro.status === 404) return null;
    throw erro;
  }
}

export async function trilhaDaOcorrencia(_s: Sessao, id: string): Promise<LinhaEvento[]> {
  return (await detalhe(id)).trilha;
}

export async function vistoriaDaOcorrencia(_s: Sessao, id: string): Promise<LinhaVistoria | null> {
  return (await detalhe(id)).vistoria;
}

export async function providenciasDaOcorrencia(
  _s: Sessao,
  id: string,
): Promise<LinhaProvidencia[]> {
  return (await detalhe(id)).providencias;
}

export async function possiveisDuplicidades(
  _s: Sessao,
  tipo: string,
  endereco: string,
): Promise<LinhaOcorrencia[]> {
  const p = new URLSearchParams({ tipo, endereco });
  const r = await chamar<{ itens: LinhaOcorrencia[] }>(`/ocorrencias/duplicidades/consulta?${p}`);
  return r.itens;
}

export async function abrirOcorrencia(_s: Sessao, dados: AberturaOcorrencia): Promise<string> {
  const r = await chamar<{ id: string }>("/ocorrencias", { metodo: "POST", corpo: dados });
  return r.id;
}

export async function classificarNaTriagem(_s: Sessao, id: string, t: Triagem): Promise<void> {
  await chamar(`/ocorrencias/${id}/triagem`, { metodo: "POST", corpo: t });
}

export async function despacharEquipe(_s: Sessao, id: string, d: Despacho): Promise<void> {
  await chamar(`/ocorrencias/${id}/despacho`, { metodo: "POST", corpo: d });
}

export async function encaminharProvidencia(
  _s: Sessao,
  id: string,
  p: Providencia,
): Promise<void> {
  await chamar(`/ocorrencias/${id}/providencia`, { metodo: "POST", corpo: p });
}

export async function encerrarOcorrencia(
  _s: Sessao,
  id: string,
  e: Encerramento,
): Promise<void> {
  await chamar(`/ocorrencias/${id}/encerramento`, { metodo: "POST", corpo: e });
}

export async function responderProvidencia(
  _s: Sessao,
  ocorrenciaId: string,
  providenciaId: string,
  resposta: { desfecho: string; resposta: string; respondidaPor: string },
): Promise<void> {
  await chamar(`/ocorrencias/${ocorrenciaId}/providencia/${providenciaId}/resposta`, {
    metodo: "POST", corpo: resposta,
  });
}

export async function indicadores(_s: Sessao): Promise<Indicadores> {
  return chamar<Indicadores>("/ocorrencias/indicadores/painel");
}

// ---------------------------------------------------------------------------
// Equipes e usuários
// ---------------------------------------------------------------------------

export async function listarEquipes(_s: Sessao): Promise<LinhaEquipe[]> {
  const r = await chamar<{ itens: LinhaEquipe[] }>("/equipes");
  return r.itens;
}

export async function criarEquipe(
  _s: Sessao,
  nome: string,
  especialidade: string,
): Promise<void> {
  await chamar("/equipes", {
    metodo: "POST",
    corpo: { nome, especialidade: especialidade || null, ativa: true },
  });
}

export async function atualizarEquipe(
  _s: Sessao, id: string, nome: string, especialidade: string, ativa: boolean,
): Promise<void> {
  await chamar(`/equipes/${id}`, {
    metodo: "PATCH",
    corpo: { nome, especialidade: especialidade || null, ativa },
  });
}

export async function listarUsuarios(_s: Sessao): Promise<LinhaUsuario[]> {
  const r = await chamar<{ itens: LinhaUsuario[] }>("/usuarios");
  return r.itens;
}

export async function criarUsuario(
  _s: Sessao,
  dados: { nome: string; matricula: string; email: string; papel: Papel; equipeId: string | null; senha?: string },
): Promise<void> {
  await chamar("/usuarios", {
    metodo: "POST",
    corpo: {
      nome: dados.nome, matricula: dados.matricula, email: dados.email,
      papel: dados.papel, equipeId: dados.equipeId, senha: dados.senha,
    },
  });
}

export async function alternarUsuarioAtivo(
  _s: Sessao,
  id: string,
  ativo: boolean,
): Promise<void> {
  await chamar(`/usuarios/${id}/situacao`, { metodo: "PATCH", corpo: { ativo } });
}

/**
 * Baixa um documento oficial e devolve um endereço que o navegador consegue
 * abrir numa aba.
 *
 * Não dá para simplesmente apontar o navegador para a rota: ela exige o token
 * no cabeçalho, e uma navegação comum não o envia. Colocar o token na URL
 * resolveria e seria pior: ele acabaria no histórico, no log do servidor e no
 * link que alguém copia e cola.
 */
export async function abrirDocumento(
  _s: Sessao,
  ocorrenciaId: string,
  tipo: "laudo" | "termo-de-interdicao" | "laudo.pdf" | "termo-de-interdicao.pdf",
): Promise<string> {
  const tokens = lerTokens();
  const resposta = await fetch(`${BASE}/documentos/${ocorrenciaId}/${tipo}`, {
    headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroDaApi(resposta.status, corpo);
  }
  return URL.createObjectURL(await resposta.blob());
}

export async function listarEvidencias(
  _s: Sessao,
  ocorrenciaId: string,
): Promise<LinhaEvidencia[]> {
  const r = await chamar<{ itens: LinhaEvidencia[] }>(`/evidencias/ocorrencia/${ocorrenciaId}`);
  return r.itens;
}

export async function pedirRecuperacao(email: string): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/auth/recuperar", {
    metodo: "POST", corpo: { email },
  });
  return r.mensagem;
}

export async function redefinirSenha(token: string, senha: string): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/auth/redefinir", {
    metodo: "POST", corpo: { token, senha },
  });
  return r.mensagem;
}

// ---------------------------------------------------------------------------
// Prestação de contas
// ---------------------------------------------------------------------------

export async function consultarTrilha(
  _s: Sessao,
  filtro: FiltroTrilha = {},
): Promise<{ itens: LinhaTrilha[]; total: number; pagina: number; porPagina: number }> {
  const p = new URLSearchParams();
  if (filtro.autor?.trim()) p.set("autor", filtro.autor.trim());
  if (filtro.tipo) p.set("tipo", filtro.tipo);
  if (filtro.protocolo?.trim()) p.set("protocolo", filtro.protocolo.trim());
  p.set("pagina", String(filtro.pagina ?? 1));
  p.set("porPagina", "25");
  return chamar(`/trilha?${p.toString()}`);
}

export async function tiposDeEvento(
  _s: Sessao,
): Promise<Array<{ tipo: string; total: number }>> {
  const r = await chamar<{ itens: Array<{ tipo: string; total: number }> }>("/trilha/tipos");
  return r.itens;
}

export async function resumoDoPeriodo(
  _s: Sessao,
  periodo: { de?: string; ate?: string } = {},
): Promise<ResumoPeriodo> {
  const p = new URLSearchParams();
  if (periodo.de) p.set("de", periodo.de);
  if (periodo.ate) p.set("ate", periodo.ate);
  return chamar<ResumoPeriodo>(`/relatorios/resumo?${p.toString()}`);
}

/**
 * Baixa o CSV com o token e entrega um endereço local para o navegador salvar.
 *
 * Apontar um link direto para a rota não funcionaria: ela exige o token no
 * cabeçalho, e navegação comum não o envia. Pôr o token na URL resolveria e
 * seria pior, porque ele acabaria no histórico e no log do servidor.
 */
export async function baixarCsvDeOcorrencias(
  _s: Sessao,
  periodo: { de?: string; ate?: string; status?: string } = {},
): Promise<{ url: string; nome: string }> {
  const p = new URLSearchParams();
  if (periodo.de) p.set("de", periodo.de);
  if (periodo.ate) p.set("ate", periodo.ate);
  if (periodo.status) p.set("status", periodo.status);

  const tokens = lerTokens();
  const resposta = await fetch(`${BASE}/relatorios/ocorrencias.csv?${p.toString()}`, {
    headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
  });
  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, await resposta.json().catch(() => ({})));
  }
  return {
    url: URL.createObjectURL(await resposta.blob()),
    nome: `ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
