import type {
  AberturaOcorrencia, CorrecaoDeCoordenada, Despacho, Encerramento,
  InteresseMunicipio, Papel, Providencia, Triagem,
} from "@dc360/shared";
import type {
  ContaDisponivel, CorrecaoAplicada, FiltroOcorrencias, Indicadores, LinhaEquipe, LinhaEvento,
  FiltroTrilha, LinhaEvidencia, LinhaOcorrencia, LinhaProvidencia, LinhaTrilha,
  ImovelInterditado, LinhaUsuario, LinhaVistoria, MeuTrabalho, MinhasSessoes,
  PaginaDeOcorrencias, PontosDoMapa, ProvidenciaPendente,
  ResumoPeriodo, SenhaRedefinida, SessoesDeOutrem,
  Sessao, TipoDeDocumento, VinculoOcorrencia,
  CursorDeAvisos, DadosDoOrgao, LinhaOficio, LinhaOrgao, OficioDetalhado,
  RespostaDeAvisos, ResultadoDeEnvio,
  AtivacaoSegundoFator, ResultadoDeEntrada, SegundoFatorLigado, SituacaoSegundoFator,
  ConfiguracaoDoPainel, DevolucaoDaOcorrencia, DevolucaoPendente,
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

/**
 * Erro de rede vira frase que a pessoa entende.
 *
 * Quando o `fetch` não alcança o servidor, ele lança `TypeError: Failed to
 * fetch`, em inglês e sem dizer o que fazer. Essa mensagem chegava crua à
 * tela. Para um agente numa área de risco, onde o sinal cai, é justamente a
 * mensagem que mais aparece, e ela precisa dizer duas coisas: que o problema é
 * a conexão e não o dado que ele digitou, e que nada foi gravado.
 */
export class SemConexao extends Error {
  constructor() {
    super(
      "Sem conexão com o servidor. O que você preencheu não foi enviado. " +
      "Verifique o sinal e tente de novo.",
    );
    this.name = "SemConexao";
  }
}

async function comRedeTraduzida(chamada: () => Promise<Response>): Promise<Response> {
  try {
    return await chamada();
  } catch (erro) {
    // `TypeError` é o que todo navegador lança quando a requisição não sai:
    // sem rede, DNS falhando, servidor fora, CORS barrando.
    if (erro instanceof TypeError) throw new SemConexao();
    throw erro;
  }
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; repetiu?: boolean } = {},
): Promise<T> {
  const tokens = lerTokens();
  const cabecalhos: Record<string, string> = { accept: "application/json" };
  if (opcoes.corpo !== undefined) cabecalhos["content-type"] = "application/json";
  if (tokens) cabecalhos["authorization"] = `Bearer ${tokens.acesso}`;

  const resposta = await comRedeTraduzida(() => fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  }));

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

type RespostaDeEntrada = {
  acesso?: string;
  renovacao?: string;
  usuario?: {
    id: string; nome: string; papel: Papel;
    organizacaoId: string; organizacaoNome: string; municipio: string; uf: string;
  };
  codigosDeRecuperacaoRestantes?: number;
  entrouComCodigoDeRecuperacao?: boolean;
  segundoFator?: "codigo" | "ativacao";
  desafio?: string;
  expiraEm?: number;
  mensagem?: string;
};

/**
 * Traduz a resposta da entrada, que tem DOIS desfechos desde o segundo fator.
 *
 * O token só é guardado no desfecho que traz sessão. Guardar qualquer coisa no
 * outro seria repetir, do lado do navegador, o erro que o servidor não comete:
 * o desafio não é credencial de acesso a nada.
 */
function lerEntrada(r: RespostaDeEntrada): ResultadoDeEntrada {
  if (r.segundoFator && r.desafio) {
    return {
      tipo: "segundo-fator",
      desafio: {
        segundoFator: r.segundoFator,
        desafio: r.desafio,
        expiraEm: r.expiraEm ?? 0,
        mensagem: r.mensagem ?? "",
      },
    };
  }

  guardarTokens({ acesso: r.acesso!, renovacao: r.renovacao! });
  const u = r.usuario!;
  return {
    tipo: "sessao",
    sessao: {
      organizacaoId: u.organizacaoId,
      organizacaoNome: u.organizacaoNome,
      municipio: u.municipio,
      uf: u.uf,
      usuarioId: u.id,
      usuarioNome: u.nome,
      papel: u.papel,
    },
    ...(r.codigosDeRecuperacaoRestantes !== undefined
      ? { codigosDeRecuperacaoRestantes: r.codigosDeRecuperacaoRestantes }
      : {}),
    ...(r.entrouComCodigoDeRecuperacao !== undefined
      ? { entrouComCodigoDeRecuperacao: r.entrouComCodigoDeRecuperacao }
      : {}),
  };
}

export async function entrarComSenha(email: string, senha: string): Promise<ResultadoDeEntrada> {
  return lerEntrada(await chamar<RespostaDeEntrada>(
    "/auth/entrar", { metodo: "POST", corpo: { email, senha } },
  ));
}

/**
 * A segunda etapa da entrada: os seis dígitos, ou um código de recuperação.
 *
 * O mesmo campo aceita os dois de propósito, e o servidor decide qual é: quem
 * perdeu o telefone está com pressa, e um segundo formulário escondido atrás
 * de um link é o formulário que ninguém acha no momento em que precisa.
 */
export async function conferirSegundoFator(
  desafio: string, codigo: string,
): Promise<ResultadoDeEntrada> {
  return lerEntrada(await chamar<RespostaDeEntrada>(
    "/auth/segundo-fator", { metodo: "POST", corpo: { desafio, codigo } },
  ));
}

/** Como está a verificação em duas etapas de quem está usando o painel. */
export async function situacaoSegundoFator(): Promise<SituacaoSegundoFator> {
  return chamar<SituacaoSegundoFator>("/segundo-fator");
}

/**
 * Começa a ativação e devolve o segredo, uma vez.
 *
 * `desafio` vem preenchido no caminho em que a pessoa ainda não tem sessão: o
 * administrador que o município obriga a ligar a verificação antes de entrar.
 */
export async function iniciarSegundoFator(desafio?: string): Promise<AtivacaoSegundoFator> {
  return chamar<AtivacaoSegundoFator>("/segundo-fator/iniciar", {
    metodo: "POST", corpo: desafio ? { desafio } : {},
  });
}

/**
 * Confirma a ativação com um código de verdade, e devolve os códigos de
 * recuperação, que aparecem uma única vez: o servidor guarda só o resumo
 * deles, então nem ele consegue mostrá-los outra vez.
 */
export async function confirmarSegundoFator(
  codigo: string, desafio?: string,
): Promise<SegundoFatorLigado> {
  const r = await chamar<{
    codigosDeRecuperacao: string[];
    mensagem: string;
    sessao?: {
      acesso: string; renovacao: string;
      usuario: {
        id: string; nome: string; papel: Papel;
        organizacaoId: string; organizacaoNome: string; municipio: string; uf: string;
      };
    };
  }>("/segundo-fator/confirmar", {
    metodo: "POST", corpo: { codigo, ...(desafio ? { desafio } : {}) },
  });

  if (!r.sessao) return { codigosDeRecuperacao: r.codigosDeRecuperacao, mensagem: r.mensagem };

  const lida = lerEntrada(r.sessao as RespostaDeEntrada);
  return {
    codigosDeRecuperacao: r.codigosDeRecuperacao,
    mensagem: r.mensagem,
    ...(lida.tipo === "sessao" ? { sessao: lida.sessao } : {}),
  };
}

/** Desligar exige a senha atual: ver `rotas/segundo-fator.ts` para o porquê. */
export async function desativarSegundoFator(senhaAtual: string): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/segundo-fator/desativar", {
    metodo: "POST", corpo: { senhaAtual },
  });
  return r.mensagem;
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

/**
 * Quantas linhas pedir quando quem chama não diz.
 *
 * O teto da rota é cem, e era isso que este arquivo pedia sempre. O problema
 * nunca foi o número: era ninguém olhar o `total` que vinha do lado dele.
 */
const POR_PAGINA_PADRAO = 100;

function consulta(filtro: FiltroOcorrencias): string {
  const p = new URLSearchParams();
  if (filtro.busca?.trim()) p.set("busca", filtro.busca.trim());
  if (filtro.status) p.set("status", filtro.status);
  if (filtro.severidade) p.set("severidade", filtro.severidade);
  // Só vai quando está ligado, e o servidor recusa qualquer outro valor.
  if (filtro.atrasadas) p.set("atrasadas", "1");
  p.set("pagina", String(filtro.pagina ?? 1));
  p.set("porPagina", String(filtro.porPagina ?? POR_PAGINA_PADRAO));
  return p.toString();
}

/**
 * Uma página da lista, com o total de todas as que casam com o filtro.
 *
 * Quem desenha lista ou mapa usa esta, nunca a de baixo: sem o `total` a tela
 * não tem como saber (nem como dizer) que está mostrando um recorte.
 */
export async function listarPaginaDeOcorrencias(
  _s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<PaginaDeOcorrencias> {
  return chamar<PaginaDeOcorrencias>(`/ocorrencias?${consulta(filtro)}`);
}

/**
 * Só as linhas da primeira página, para quem mostra um topo de fila curto e
 * já sabe disso (o painel mostra seis).
 */
export async function listarOcorrencias(
  _s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<LinhaOcorrencia[]> {
  const r = await listarPaginaDeOcorrencias(_s, filtro);
  return r.itens;
}

/**
 * Os pontos do mapa e, junto, quantos existem.
 *
 * O mapa pedia a lista comum e desenhava o que chegasse. Como a lista sempre
 * foi paginada, numa enxurrada com duzentas ativas ele desenhava cem e não
 * dizia nada: metade da cidade sumia de uma tela de decisão. Aqui vêm os três
 * números que faltavam, e a tela é obrigada a mostrá-los.
 */
export async function pontosDoMapa(
  _s: Sessao,
  pagina = 1,
): Promise<PontosDoMapa> {
  return chamar<PontosDoMapa>(`/ocorrencias/mapa?pagina=${pagina}`);
}

type Detalhe = {
  ocorrencia: LinhaOcorrencia;
  trilha: LinhaEvento[];
  vistoria: LinhaVistoria | null;
  providencias: LinhaProvidencia[];
  vinculadaA: VinculoOcorrencia | null;
  vinculadas: VinculoOcorrencia[];
  /**
   * A última devolução do campo, com o texto livre do agente, ou nada.
   *
   * O dossiê é o único lugar de onde esse texto sai, e ele sai aqui porque esta
   * rota registra quem consultou. A lista de devolvidas e o evento da trilha
   * não o carregam, e os porquês estão em `dados/tipos.ts`.
   */
  devolucao: DevolucaoDaOcorrencia | null;
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

/**
 * A última devolução desta ocorrência, com observação e marca de descarte.
 *
 * Vem do mesmo dossiê que a tela já pede, e não de uma rota própria: uma rota
 * de "observação da devolução" seria uma porta de leitura de dado pessoal com
 * registro de consulta próprio para inventar, quando a rota que a tela abre de
 * qualquer jeito já registra.
 *
 * `?? null` porque um servidor mais antigo simplesmente não traz o campo, e a
 * diferença entre "não veio" e "não houve devolução" não muda nada para quem
 * desenha a faixa: nos dois casos não há o que mostrar.
 */
export async function devolucaoDaOcorrencia(
  _s: Sessao,
  id: string,
): Promise<DevolucaoDaOcorrencia | null> {
  return (await detalhe(id)).devolucao ?? null;
}

export async function vinculosDaOcorrencia(
  _s: Sessao,
  id: string,
): Promise<{ vinculadaA: VinculoOcorrencia | null; vinculadas: VinculoOcorrencia[] }> {
  const d = await detalhe(id);
  return { vinculadaA: d.vinculadaA ?? null, vinculadas: d.vinculadas ?? [] };
}

/**
 * Tudo o que a tela do agente de campo mostra, numa requisição só.
 *
 * Uma só porque a tela é uma só, e porque quem abre isso costuma estar com
 * sinal ruim: três idas ao servidor para montar uma tela é desperdício onde
 * cada ida pode falhar.
 */
export async function meuTrabalhoDeCampo(_s: Sessao): Promise<MeuTrabalho> {
  return chamar<MeuTrabalho>("/campo/meu-trabalho");
}

export async function providenciasPendentes(_s: Sessao): Promise<ProvidenciaPendente[]> {
  const r = await chamar<{ itens: ProvidenciaPendente[] }>("/ocorrencias/providencias/pendentes");
  return r.itens;
}

/**
 * As ocorrências devolvidas pelo campo que ainda esperam decisão.
 *
 * SEM O TEXTO DA OBSERVAÇÃO, e isso é da rota, não desta função. Ela devolve
 * `tem_observacao`, um booleano, porque entregar o texto livre de todas as
 * devoluções do município a cada carregamento de tela seria espalhar nome de
 * morador e condição de saúde por uma consulta que nem registro de consulta
 * tem. Quem precisa ler abre a ocorrência, e lá a leitura fica registrada.
 *
 * Quem chama trata a falha por conta própria, e continua sendo deliberado: ver
 * o comentário em `Painel.tsx`, onde a razão está escrita por extenso agora que
 * a rota existe e um 404 deixou de ser o esperado.
 */
export async function devolucoesPendentes(_s: Sessao): Promise<DevolucaoPendente[]> {
  const r = await chamar<{ itens: DevolucaoPendente[] }>("/ocorrencias/devolvidas");
  return r.itens;
}

export async function imoveisInterditados(_s: Sessao): Promise<ImovelInterditado[]> {
  const r = await chamar<{ itens: ImovelInterditado[] }>("/ocorrencias/interditados");
  return r.itens;
}

export async function levantarInterdicao(
  _s: Sessao, id: string, motivo: string,
): Promise<void> {
  await chamar(`/ocorrencias/${id}/desinterdicao`, { metodo: "POST", corpo: { motivo } });
}

/**
 * Corrigir a coordenada de uma ocorrência aberta.
 *
 * A rota é `POST` e não `PATCH` porque isto é um ATO, não uma edição de campo:
 * ele exige motivo e deixa evento na trilha, como o levantamento de interdição
 * e o encerramento. As recusas todas são do servidor (permissão, município,
 * ocorrência encerrada, faixa da coordenada e teto de seis casas), e a tela
 * apenas evita fazer a pessoa digitar para levar um não no fim.
 */
export async function corrigirCoordenada(
  _s: Sessao, id: string, correcao: CorrecaoDeCoordenada,
): Promise<CorrecaoAplicada> {
  return chamar<CorrecaoAplicada>(`/ocorrencias/${id}/coordenada`, {
    metodo: "POST", corpo: correcao,
  });
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

/**
 * Encaminha, com o destino saindo do catálogo quando ele existe.
 *
 * `orgaoId` é OPCIONAL, e a compatibilidade é deliberada dos dois lados: um
 * município sem catálogo montado ainda precisa encaminhar no meio de uma
 * chuva. Sem o identificador, o banco resolve o nome contra o catálogo do
 * próprio município e cria a entrada se ela não existir (migração 017), então
 * os dois caminhos terminam amarrados ao catálogo.
 */
export async function encaminharProvidencia(
  _s: Sessao,
  id: string,
  p: Providencia & { orgaoId?: string },
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

/** Corrigir cadastro sem desativar e recriar. Senha fica de fora: é outro ato. */
export async function atualizarUsuario(
  _s: Sessao,
  id: string,
  dados: { nome: string; matricula: string; email: string; papel: Papel; equipeId: string | null },
): Promise<void> {
  await chamar(`/usuarios/${id}`, {
    metodo: "PATCH",
    corpo: {
      nome: dados.nome, matricula: dados.matricula, email: dados.email,
      papel: dados.papel, equipeId: dados.equipeId,
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
 * Redefinir a senha de OUTRA pessoa, para quem gerencia usuários.
 *
 * A senha temporária volta em texto na resposta e aparece uma vez só. Isso é
 * decisão do servidor, não descuido daqui: com o envio de email desligado não
 * existe outro canal, e quem administra vai ditá-la por telefone. Por isso
 * esta função devolve o corpo inteiro em vez de engolir a resposta: perder o
 * campo aqui significaria a conta ficar com uma senha que ninguém conhece.
 *
 * A rota recusa o próprio id (para a própria senha existe `trocarSenha`, que
 * exige a senha atual), e derruba junto as sessões do alvo, porque o caso que
 * motiva a redefinição é justamente a conta ter sido invadida.
 */
export async function redefinirSenhaDeUsuario(id: string): Promise<SenhaRedefinida> {
  return chamar<SenhaRedefinida>(`/usuarios/${id}/redefinir-senha`, { metodo: "POST" });
}

/**
 * Derrubar as sessões de outra pessoa sem mexer na senha.
 *
 * É o botão do celular perdido em área de risco: retira o acesso agora e
 * preserva a credencial de quem talvez volte ao trabalho em uma hora.
 */
export async function encerrarSessoesDeUsuario(id: string): Promise<SessoesDeOutrem> {
  return chamar<SessoesDeOutrem>(`/usuarios/${id}/encerrar-sessoes`, { metodo: "POST" });
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
  tipo: TipoDeDocumento,
): Promise<string> {
  const tokens = lerTokens();
  const resposta = await comRedeTraduzida(() =>
    fetch(`${BASE}/documentos/${ocorrenciaId}/${tipo}`, {
      headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
    }));
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

/**
 * O formulário público de interesse.
 *
 * Não passa por token e não devolve nada além da confirmação. A resposta é a
 * MESMA tenha o pedido sido gravado ou recusado pela janela de seis horas: se
 * a tela dissesse "você já pediu", ela viraria um verificador de quais
 * municípios já procuraram o produto.
 */
export async function registrarInteresse(dados: InteresseMunicipio): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/publico/interesse", {
    metodo: "POST", corpo: dados,
  });
  return r.mensagem;
}

export async function pedirRecuperacao(email: string): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/auth/recuperar", {
    metodo: "POST", corpo: { email },
  });
  return r.mensagem;
}

/**
 * Trocar a própria senha, estando dentro do sistema.
 *
 * Faltava, e a falta tinha uma consequência prática: o provisionamento de um
 * município novo entrega uma senha inicial sorteada, ditada por telefone, e
 * pede que ela seja trocada na primeira entrada. Sem esta tela não havia como.
 * O único caminho era pedir link de recuperação por email, que é o caminho de
 * quem esqueceu, não de quem quer trocar.
 */
export async function trocarSenha(senhaAtual: string, senha: string): Promise<string> {
  const r = await chamar<{ mensagem: string }>("/auth/trocar-senha", {
    metodo: "POST", corpo: { senhaAtual, senha },
  });
  return r.mensagem;
}

/**
 * Sair de todos os outros aparelhos, preservando este.
 *
 * Não pede a senha atual, e o servidor decidiu assim de propósito: trocar
 * senha CONCEDE acesso novo, encerrar sessão só RETIRA. Exigir credencial
 * para retirar acesso é o atrito que faz a pessoa desistir do botão no minuto
 * seguinte a perder o celular, que é o único minuto em que ele importa.
 */
export async function encerrarMinhasSessoes(): Promise<MinhasSessoes> {
  return chamar<MinhasSessoes>("/auth/encerrar-sessoes", { metodo: "POST" });
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
  const resposta = await comRedeTraduzida(() =>
    fetch(`${BASE}/relatorios/ocorrencias.csv?${p.toString()}`, {
      headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
    }));
  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, await resposta.json().catch(() => ({})));
  }
  return {
    url: URL.createObjectURL(await resposta.blob()),
    nome: `ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

// ---------------------------------------------------------------------------
// Sino de avisos
// ---------------------------------------------------------------------------

/**
 * O que mudou desde a última pergunta.
 *
 * O cursor é ECOADO, nunca calculado aqui. Ele saiu do relógio do banco na
 * resposta anterior, e é essa a razão de ele existir como parâmetro em vez de
 * a função montar um `new Date()`: o relógio da máquina da coordenadoria não
 * é o do servidor, e um marco adiantado faz a janela seguinte começar no
 * futuro. Tudo o que acontecesse até o servidor alcançar aquele instante
 * ficaria atrás do cursor e não voltaria em pergunta nenhuma, sem erro e sem
 * nada na tela dizendo que faltou um aviso.
 */
export async function avisosDesde(
  _s: Sessao,
  cursor: CursorDeAvisos | null,
): Promise<RespostaDeAvisos> {
  const p = new URLSearchParams();
  if (cursor) {
    p.set("desde", cursor.desde);
    // Só acompanha o instante quando a resposta anterior foi cortada: sem ele,
    // um corte no meio de avisos gravados no mesmo instante perderia os de
    // fora, porque `criado_em > desde` não alcança os empatados.
    if (cursor.desdeId) p.set("desdeId", cursor.desdeId);
  }
  const consulta = p.toString();
  return chamar<RespostaDeAvisos>(`/avisos${consulta ? `?${consulta}` : ""}`);
}

/**
 * Marca como lidos os avisos que esta pessoa recebeu.
 *
 * A lista é de identificadores, e não um marco de tempo, porque "marcar tudo
 * até agora" apagaria também o que o teto da resposta cortou e ninguém chegou
 * a ver. Só sai do sino o que passou pelos olhos de alguém.
 */
export async function marcarAvisosLidos(
  _s: Sessao,
  ids: readonly string[],
): Promise<{ marcados: number }> {
  return chamar<{ marcados: number }>("/avisos/lidos", {
    metodo: "POST",
    corpo: { ids },
  });
}

// ---------------------------------------------------------------------------
// Catálogo de órgãos
// ---------------------------------------------------------------------------

export async function listarOrgaos(
  _s: Sessao,
  incluirInativos = false,
): Promise<LinhaOrgao[]> {
  const r = await chamar<{ itens: LinhaOrgao[] }>(
    `/orgaos${incluirInativos ? "?incluirInativos=1" : ""}`,
  );
  return r.itens;
}

export async function criarOrgao(_s: Sessao, dados: DadosDoOrgao): Promise<{ id: string }> {
  return chamar<{ id: string }>("/orgaos", { metodo: "POST", corpo: dados });
}

export async function atualizarOrgao(
  _s: Sessao,
  id: string,
  dados: DadosDoOrgao,
): Promise<void> {
  await chamar<{ id: string }>(`/orgaos/${id}`, { metodo: "PATCH", corpo: dados });
}

/**
 * Órgão não se apaga, se desativa com motivo.
 *
 * A rota de exclusão não existe, e a ausência é a decisão: o órgão aparece em
 * ofício já emitido e na trilha de quem encaminhou o quê. Apagar a linha
 * apagaria a resposta para "para onde foi este ofício", que é a pergunta que
 * uma auditoria faz.
 */
export async function desativarOrgao(_s: Sessao, id: string, motivo: string): Promise<void> {
  await chamar<{ id: string }>(`/orgaos/${id}/desativacao`, {
    metodo: "POST",
    corpo: { motivo },
  });
}

export async function reativarOrgao(_s: Sessao, id: string): Promise<void> {
  await chamar<{ id: string }>(`/orgaos/${id}/reativacao`, { metodo: "POST" });
}

// ---------------------------------------------------------------------------
// Ofício
// ---------------------------------------------------------------------------

export async function listarOficios(
  _s: Sessao,
  ocorrenciaId: string,
): Promise<LinhaOficio[]> {
  const r = await chamar<{ itens: LinhaOficio[] }>(
    `/oficios?ocorrenciaId=${encodeURIComponent(ocorrenciaId)}`,
  );
  return r.itens;
}

export async function detalharOficio(_s: Sessao, id: string): Promise<OficioDetalhado> {
  return chamar<OficioDetalhado>(`/oficios/${id}`);
}

/**
 * Emitir queima um número da sequência do município, e por isso é ato de quem
 * emite documento oficial.
 *
 * Um ofício por providência: o segundo clique não queima outro número, e o
 * servidor devolve o número que já existe dentro da mensagem. O órgão receber
 * dois documentos oficiais pedindo a mesma coisa deixa o coordenador sem saber
 * qual dos dois cobrar depois.
 */
export async function emitirOficio(
  _s: Sessao,
  providenciaId: string,
  observacoes?: string,
): Promise<{ id: string; numero: string }> {
  return chamar<{ id: string; numero: string }>("/oficios", {
    metodo: "POST",
    corpo: { providenciaId, ...(observacoes ? { observacoes } : {}) },
  });
}

/**
 * Envia, ou reenvia, o ofício por email.
 *
 * Ato separado da emissão, e a separação não é burocracia: emitir produz um
 * papel dentro do município, enviar coloca um endereço de uso único para o
 * dossiê de uma família dentro da caixa de entrada de outro órgão.
 */
export async function enviarOficio(
  _s: Sessao,
  id: string,
  destinatario?: string,
): Promise<ResultadoDeEnvio> {
  return chamar<ResultadoDeEnvio>(`/oficios/${id}/envio`, {
    metodo: "POST",
    corpo: destinatario ? { destinatario } : {},
  });
}

/**
 * O documento do ofício, buscado com o token e entregue como endereço local.
 *
 * Mesma razão do laudo: apontar o navegador para a rota não funciona, porque
 * ela exige o token no cabeçalho e navegação comum não o envia. Pôr o token na
 * URL resolveria e seria pior, porque ele acabaria no histórico e no log.
 */
export async function abrirOficio(_s: Sessao, id: string): Promise<string> {
  const tokens = lerTokens();
  const resposta = await comRedeTraduzida(() =>
    fetch(`${BASE}/oficios/${id}/documento`, {
      headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
    }));
  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, await resposta.json().catch(() => ({})));
  }
  return URL.createObjectURL(await resposta.blob());
}

/**
 * A configuração do ambiente, perguntada ao servidor que serve este município.
 *
 * A chave do mapa vem DAQUI, e não de `import.meta.env`, e a razão é de conta
 * a pagar. `import.meta.env` é tempo de BUILD, e o painel é um build estático
 * só servindo todos os municípios: a chave assada ali seria a chave do
 * FORNECEDOR, cobrada no cartão dele, pagando o carregamento de mapa de todas
 * as prefeituras, porque o Google cobra por carregamento. Pela API, cada
 * implantação responde com a chave de quem paga por ela.
 *
 * A rota exige token, como toda rota desta API, e isso NÃO é o que protege a
 * chave: chave de navegador do Google é pública por construção e viaja no
 * JavaScript da página. Quem protege a conta é a restrição por referenciador
 * HTTP no console do Google. Ver `apps/api/src/rotas/configuracao.ts`.
 */
export async function configuracaoDoPainel(_s: Sessao): Promise<ConfiguracaoDoPainel> {
  return chamar<ConfiguracaoDoPainel>("/configuracao");
}
