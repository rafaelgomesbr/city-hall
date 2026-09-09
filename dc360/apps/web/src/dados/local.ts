import {
  MOTIVO_RECLASSIFICAR,
  PRAZO_PADRAO_HORAS,
  exigirPermissao,
  exigirPostoParaGerir,
  estadoTerminal,
  precisaReclassificar,
  transicaoPermitida,
  type Origem,
  type Papel,
  type StatusOcorrencia,
  type TipoDeEntrada,
  type AberturaOcorrencia,
  type Despacho,
  type Encerramento,
  type InteresseMunicipio,
  type Providencia,
  type Triagem,
} from "@dc360/shared";
import { comoApp, semTenant, type Contexto } from "./banco";
import type {
  ColegaDeEquipe, ContaDisponivel, FiltroOcorrencias, FiltroTrilha, Indicadores,
  LinhaEquipe, LinhaEvento, LinhaOcorrencia, LinhaProvidencia, LinhaUsuario,
  LinhaVistoria, MeuTrabalho, PaginaDeOcorrencias, PontoNoMapa, PontosDoMapa,
  Sessao, TarefaDesignada, TipoDeDocumento, VistoriaConcluida,
  AberturaDeOficio, CursorDeAvisos, DadosDoOrgao, EnvioDeOficio, LinhaOficio,
  LinhaOrgao, OficioDetalhado, RespostaDeAvisos, ResultadoDeEnvio,
  AtivacaoSegundoFator, ResultadoDeEntrada, SegundoFatorLigado, SituacaoSegundoFator,
} from "./tipos";

/**
 * Camada de acesso a dado. Toda função aqui recebe a sessão e nunca a
 * organização como parâmetro solto vindo da tela: a organização sai do
 * contexto autenticado, e é ela que vai para o SET LOCAL do RLS.
 *
 * Toda função de ESCRITA começa por `exigirPermissao`. A tela também esconde o
 * que o papel não pode fazer, mas esconder não é impedir: um `if` de
 * renderização se contorna com o console aberto. A checagem fica aqui, no
 * ponto por onde a escrita obrigatoriamente passa, e vem da mesma tabela do
 * pacote compartilhado que a tela consulta para decidir o que desenhar.
 *
 * Quando a API HTTP existir, é este arquivo que troca de implementação, e ela
 * herda o mesmo `exigirPermissao` em vez de precisar redescobrir a regra.
 */

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const MODO = "local" as const;

export async function vinculosDaOcorrencia(
  s: Sessao,
  id: string,
): Promise<{ vinculadaA: unknown; vinculadas: unknown[] }> {
  return comoApp(s.organizacaoId, async (db) => {
    const pai = await db.query(
      `SELECT o.id, o.protocolo, o.status, o.endereco, o.criado_em
         FROM ocorrencias o JOIN ocorrencias filha ON filha.vinculada_a = o.id
        WHERE filha.id = $1`,
      [id],
    );
    const filhas = await db.query(
      `SELECT id, protocolo, status, endereco, criado_em
         FROM ocorrencias WHERE vinculada_a = $1 ORDER BY criado_em`,
      [id],
    );
    return { vinculadaA: pai.rows[0] ?? null, vinculadas: filhas.rows };
  });
}

export async function providenciasPendentes(s: Sessao): Promise<unknown[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query(
      `SELECT p.id, p.orgao_destino, p.descricao, p.responsavel,
              p.prazo_em, p.encaminhada_em,
              o.id AS ocorrencia_id, o.protocolo, o.endereco, o.status
         FROM providencias p JOIN ocorrencias o ON o.id = p.ocorrencia_id
        WHERE p.respondida_em IS NULL
        ORDER BY p.prazo_em`,
    );
    return r.rows;
  });
}

/**
 * Os imóveis interditados, no modo local.
 *
 * Mesma consulta da API, pelo mesmo motivo de sempre: as duas implementações
 * da porta precisam prometer a mesma coisa, senão a tela passa a depender de
 * qual delas está ativa. A deriva entre os dois modos já mordeu este produto
 * nove vezes, e uma delas era a triagem deixando de registrar a
 * vulnerabilidade na trilha só de um lado.
 */
export async function imoveisInterditados(s: Sessao): Promise<unknown[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query(
      `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
              o.ponto_referencia, o.interditada_em,
              u.nome AS interditada_por_nome
         FROM ocorrencias o
         LEFT JOIN usuarios u ON u.id = o.interditada_por
        WHERE o.interditada_em IS NOT NULL AND o.desinterditada_em IS NULL
        ORDER BY o.interditada_em`,
    );
    return r.rows;
  });
}

export async function levantarInterdicao(
  s: Sessao, id: string, motivo: string,
): Promise<void> {
  /*
    Levantar interdição é escrita, e escrita começa por permissão.

    Esta era a ÚNICA das dezoito escritas deste arquivo que ia direto para o
    banco, e o comentário do cabeçalho afirmava o contrário. A rota equivalente
    da API sempre conferiu (`autorizar(app, req, "levantar_interdicao")`), então
    o modo de demonstração estava mais permissivo que o produto, que é a
    direção errada de divergir: quem demonstra descobre um caminho que não
    existe no ambiente real.

    A tela já escondia o formulário para quem não pode, mas esconder o botão
    não é controle de acesso, e este arquivo é chamado direto do console do
    navegador na demonstração.

    E o ato em si não é pequeno: levantar interdição autoriza uma família a
    voltar para dentro de uma casa que foi considerada insegura.
  */
  exigirPermissao(s.papel, "levantar_interdicao");
  await comoApp(s.organizacaoId, async (db) => {
    const atual = await db.query<{
      interditada_em: string | null; desinterditada_em: string | null;
    }>("SELECT interditada_em, desinterditada_em FROM ocorrencias WHERE id = $1", [id]);
    const alvo = atual.rows[0];
    if (!alvo?.interditada_em) throw new Error("Este imóvel não está interditado.");
    if (alvo.desinterditada_em) throw new Error("A interdição deste imóvel já foi levantada.");

    await db.query(
      `UPDATE ocorrencias
          SET desinterditada_em = now(), desinterditada_por = $2,
              desinterdicao_motivo = $3
        WHERE id = $1`,
      [id, s.usuarioId, motivo.trim()],
    );
    await registrarEvento(db, s, id, "desinterdicao", {
      motivo: motivo.trim(),
      interditadaEm: alvo.interditada_em,
    });
  });
}

/**
 * O trabalho do agente de campo, no modo local.
 *
 * Mesma consulta que a API faz, pelo mesmo motivo de sempre: as duas
 * implementações da porta precisam prometer a mesma coisa, senão a tela passa
 * a depender de qual delas está ativa.
 */
/**
 * Quantas vistorias concluidas a tela traz de uma vez.
 *
 * Espelha o teto da rota da API de proposito: os dois modos precisam cortar no
 * mesmo lugar, senao a demonstracao mostra uma lista que o produto real nao
 * mostra.
 */
const TETO_DE_CONCLUIDAS = 50;

export async function meuTrabalhoDeCampo(s: Sessao): Promise<MeuTrabalho> {
  return comoApp(s.organizacaoId, async (db) => {
    const eu = await db.query<{
      equipe_id: string | null; equipe_nome: string | null;
      equipe_especialidade: string | null; equipe_ativa: boolean | null;
    }>(
      `SELECT u.equipe_id, e.nome AS equipe_nome,
              e.especialidade AS equipe_especialidade, e.ativa AS equipe_ativa
         FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id
        WHERE u.id = $1`,
      [s.usuarioId],
    );
    const meu = eu.rows[0];
    if (!meu?.equipe_id) {
      return {
        equipe: null, colegas: [], designadas: [], concluidas: [],
        totalConcluidas: 0, tetoDeConcluidas: TETO_DE_CONCLUIDAS,
      };
    }

    const colegas = await db.query<ColegaDeEquipe>(
      "SELECT id, nome, papel, ativo FROM usuarios WHERE equipe_id = $1 AND ativo = true ORDER BY nome",
      [meu.equipe_id],
    );
    const designadas = await db.query<TarefaDesignada>(
      `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
              o.latitude, o.longitude, o.descricao,
              o.solicitante_nome, o.solicitante_contato,
              o.vulnerabilidade_presente, o.vulnerabilidade_descricao,
              o.prazo_em, o.criado_em
         FROM ocorrencias o
        WHERE o.equipe_id = $1 AND o.status = 'em_campo'
        ORDER BY o.prazo_em NULLS LAST, o.criado_em`,
      [meu.equipe_id],
    );
    const concluidas = await db.query<VistoriaConcluida>(
      `SELECT v.id, v.coletada_em, v.sincronizada_em, v.gps_precisao_metros,
              v.assinante_nome,
              o.id AS ocorrencia_id, o.protocolo, o.tipo, o.severidade,
              o.status, o.endereco
         FROM vistorias v JOIN ocorrencias o ON o.id = v.ocorrencia_id
        WHERE v.agente_id = $1
        ORDER BY v.coletada_em DESC
        LIMIT $2`,
      [s.usuarioId, TETO_DE_CONCLUIDAS],
    );
    /* O total de verdade, separado do teto: ver o comentario de MeuTrabalho em
       dados/tipos.ts para o defeito que isto acaba. */
    const total = await db.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM vistorias WHERE agente_id = $1",
      [s.usuarioId],
    );

    return {
      equipe: {
        id: meu.equipe_id, nome: meu.equipe_nome,
        especialidade: meu.equipe_especialidade, ativa: meu.equipe_ativa,
      },
      colegas: colegas.rows,
      designadas: designadas.rows,
      concluidas: concluidas.rows,
      totalConcluidas: Number(total.rows[0]?.total ?? 0),
      tetoDeConcluidas: TETO_DE_CONCLUIDAS,
    };
  });
}

/*
  DAQUI PARA BAIXO ESTÃO OS DEGRAUS DO MODO DE DEMONSTRAÇÃO.

  São as funções que existem só para as duas implementações terem a MESMA
  superfície, e que recusam em vez de fingir. Todas declaram os mesmos
  parâmetros da ponta HTTP, inclusive os que ignoram, e isso não é enfeite:
  enquanto elas declaravam zero parâmetro, as duas implementações divergiam
  sem nada reprovar, e a tela que passasse a mandar um argumento novo
  continuava compilando contra um degrau que jamais o receberia. O portão que
  confere isso é `test/paridade-dos-modos.test.ts`.
*/

/**
 * Evidência fotográfica depende de armazenamento, que só existe com servidor.
 * Devolver lista vazia é o retrato honesto do modo local: não há foto, e a
 * tela diz isso em vez de inventar imagem de exemplo.
 */
export async function listarEvidencias(
  _s: Sessao,
  _ocorrenciaId: string,
): Promise<never[]> {
  return [];
}

export async function registrarInteresse(_dados: InteresseMunicipio): Promise<string> {
  throw new Error(
    "O formulário de interesse exige a API. Este painel está em modo de demonstração.",
  );
}

export async function pedirRecuperacao(_email: string): Promise<string> {
  throw new Error("A recuperação de senha exige a API. Este painel está em modo local.");
}

export async function redefinirSenha(_token: string, _senha: string): Promise<string> {
  throw new Error("A recuperação de senha exige a API. Este painel está em modo local.");
}

/**
 * No modo local não existe senha para trocar: a entrada é por escolha de
 * perfil, sem autenticação. Dizer isso é melhor que oferecer um formulário que
 * não muda nada.
 */
export async function trocarSenha(_senhaAtual: string, _senha: string): Promise<string> {
  throw new Error(
    "Trocar senha exige a API. Neste painel a entrada é por escolha de perfil, sem senha.",
  );
}

/**
 * Redefinir a senha de outra pessoa recusa pelo mesmo motivo que trocar a
 * própria: aqui não há senha nenhuma para redefinir, a entrada é escolha de
 * perfil. Sortear uma senha temporária que ninguém vai usar seria pior que
 * recusar, porque quem administra sairia da demonstração acreditando que
 * distribuiu credencial.
 */
export async function redefinirSenhaDeUsuario(_id: string): Promise<never> {
  throw new Error(
    "Redefinir a senha de outra pessoa exige a API. Neste painel a entrada é " +
    "por escolha de perfil, sem senha.",
  );
}

/**
 * Encerrar sessão de outra pessoa recusa porque não existe sessão para
 * derrubar: no modo de demonstração a entrada não emite token, e o que a tela
 * chama de sessão vive só nesta aba. Responder "duas sessões encerradas" seria
 * inventar um efeito de segurança que não aconteceu.
 */
export async function encerrarSessoesDeUsuario(_id: string): Promise<never> {
  throw new Error(
    "Encerrar as sessões de outra pessoa exige a API. Este painel está em modo local.",
  );
}

/** Mesmo motivo: sem servidor não há sessão em outro aparelho para encerrar. */
export async function encerrarMinhasSessoes(): Promise<never> {
  throw new Error(
    "Encerrar as suas outras sessões exige a API. Neste painel a entrada vale " +
    "só nesta aba.",
  );
}

/**
 * A trilha e os relatórios existem no banco local, mas a tela de auditoria
 * consulta a API porque é lá que a consulta filtrada vive. No modo local a
 * página avisa em vez de mostrar meia funcionalidade.
 */
export async function consultarTrilha(
  _s: Sessao,
  _filtro: FiltroTrilha = {},
): Promise<never> {
  throw new Error("A auditoria consolidada exige a API. Este painel está em modo local.");
}

export async function tiposDeEvento(_s: Sessao): Promise<never[]> {
  return [];
}

export async function resumoDoPeriodo(
  _s: Sessao,
  _periodo: { de?: string; ate?: string } = {},
): Promise<never> {
  throw new Error("Os relatórios exigem a API. Este painel está em modo local.");
}

export async function baixarCsvDeOcorrencias(
  _s: Sessao,
  _periodo: { de?: string; ate?: string; status?: string } = {},
): Promise<never> {
  throw new Error("A exportação exige a API. Este painel está em modo local.");
}

/**
 * O documento oficial é gerado pelo servidor de propósito: ele precisa sair
 * igual no navegador, na impressora e no PDF anexado ao processo. Sem API não
 * há documento, e dizer isso é melhor que gerar uma versão parecida que
 * divergiria da oficial.
 */
export async function abrirDocumento(
  _s: Sessao,
  _ocorrenciaId: string,
  _tipo: TipoDeDocumento,
): Promise<string> {
  throw new Error("O documento oficial é gerado pelo servidor. Este painel está em modo local.");
}

/**
 * Sem servidor não há sessão para revogar: sair é esquecer o que estava na
 * aba. A função existe para as duas implementações terem a mesma forma.
 */
export async function encerrarSessao(): Promise<void> {
  /* nada a revogar no modo local */
}

/**
 * Entrar com senha exige a API. No modo local a entrada é a escolha de
 * perfil, e fingir uma verificação de senha aqui seria pior que não ter:
 * daria a impressão de que existe autenticação onde não existe.
 */
export async function entrarComSenha(
  _email: string, _senha: string,
): Promise<ResultadoDeEntrada> {
  throw new Error("Entrada por senha exige a API. Este painel está em modo local.");
}

/**
 * A verificação em duas etapas, e por que ela recusa aqui.
 *
 * É a mesma recusa da troca de senha, pela mesma razão, e vale escrever para
 * não parecer buraco: a segunda etapa é a segunda METADE de uma autenticação,
 * e no modo de demonstração não existe a primeira. Um código de seis dígitos
 * pedido depois de uma escolha de perfil não protegeria nada, e ensinaria a
 * quem assiste à demonstração que o recurso é enfeite de tela.
 *
 * O que a demonstração mostra sobre o assunto é a verdade: que o recurso
 * existe no ambiente real, ligado por município, e que ali ele exige o
 * aplicativo de autenticação.
 */
export async function conferirSegundoFator(
  _desafio: string, _codigo: string,
): Promise<ResultadoDeEntrada> {
  throw new Error(
    "A verificação em duas etapas exige a API. Neste painel a entrada é por "
    + "escolha de perfil, sem senha.",
  );
}

/**
 * Esta NÃO recusa, e a diferença é deliberada: a pergunta "como está a
 * verificação desta conta" tem uma resposta verdadeira no modo local, que é
 * "este servidor não oferece o recurso". Devolvê-la deixa a tela de conta
 * abrir e explicar; levantar erro faria a tela mostrar uma falha vermelha
 * para uma pergunta que foi respondida.
 */
export async function situacaoSegundoFator(): Promise<SituacaoSegundoFator> {
  return { ativo: false, pendente: false, exigido: false, codigosRestantes: 0, disponivel: false };
}

export async function iniciarSegundoFator(_desafio?: string): Promise<AtivacaoSegundoFator> {
  throw new Error(
    "Ligar a verificação em duas etapas exige a API. Este painel está em modo local.",
  );
}

export async function confirmarSegundoFator(
  _codigo: string, _desafio?: string,
): Promise<SegundoFatorLigado> {
  throw new Error(
    "Ligar a verificação em duas etapas exige a API. Este painel está em modo local.",
  );
}

export async function desativarSegundoFator(_senhaAtual: string): Promise<string> {
  throw new Error(
    "Desligar a verificação em duas etapas exige a API. Este painel está em modo local.",
  );
}

/**
 * Lista de contas para entrar. Roda fora do contexto de tenant porque é o
 * passo anterior a ter um: é o único lugar do sistema que enxerga mais de
 * uma organização, e no produto real vira o provedor de identidade.
 */
export async function contasDisponiveis(): Promise<ContaDisponivel[]> {
  return semTenant(async (db) => {
    const r = await db.query<ContaDisponivel>(
      `SELECT u.id AS usuario_id, u.nome AS usuario_nome, u.papel, u.email,
              o.id AS organizacao_id, o.nome AS organizacao_nome, o.municipio, o.uf
         FROM usuarios u
         JOIN organizacoes o ON o.id = u.organizacao_id
        WHERE u.ativo
        ORDER BY o.municipio, u.papel`,
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------

/**
 * O que conta como atrasada, escrito uma vez só neste modo também.
 *
 * Espelha `condicaoAtrasada` de `apps/api/src/rotas/ocorrencias.ts`. As duas
 * implementações desta porta precisam devolver o MESMO número: se a
 * demonstração conta atrasadas de um jeito e o produto de outro, a reunião
 * com a prefeitura mostra uma tela que o servidor não sustenta.
 *
 * Rascunho fica de fora por ser chamado que ninguém assumiu, e prazo nulo é
 * ocorrência esperando triagem: nenhum dos dois está atrasado.
 */
const ATRASADA = `o.status NOT IN ('encerrada','rascunho')
                  AND o.prazo_em IS NOT NULL AND o.prazo_em < now()`;

/** O mesmo teto de pontos por página que a rota do mapa aplica. */
const TETO_DO_MAPA = 200;

/**
 * Uma página da lista, com o total de todas as que casam com o filtro.
 *
 * O total vem de uma contagem própria, sobre o MESMO `WHERE`, e não do tamanho
 * do recorte. É ele que permite à tela dizer que está mostrando vinte de
 * duzentas em vez de deixar o coordenador achar que viu tudo.
 */
export async function listarPaginaDeOcorrencias(
  s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<PaginaDeOcorrencias> {
  const pagina = Math.max(1, Math.trunc(filtro.pagina ?? 1));
  const porPagina = Math.max(1, Math.trunc(filtro.porPagina ?? 100));

  return comoApp(s.organizacaoId, async (db) => {
    const condicoes: string[] = [];
    const params: unknown[] = [];

    if (filtro.busca?.trim()) {
      params.push(`%${filtro.busca.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      condicoes.push(
        `(lower(o.protocolo) LIKE ${p} OR lower(o.endereco) LIKE ${p}
          OR lower(o.solicitante_nome) LIKE ${p} OR lower(o.descricao) LIKE ${p})`,
      );
    }
    if (filtro.status && filtro.status !== "todas") {
      if (filtro.status === "ativas") {
        condicoes.push("o.status NOT IN ('encerrada','rascunho')");
      } else {
        params.push(filtro.status);
        condicoes.push(`o.status = $${params.length}`);
      }
    }
    if (filtro.severidade && filtro.severidade !== "todas") {
      params.push(filtro.severidade);
      condicoes.push(`o.severidade = $${params.length}`);
    }
    if (filtro.atrasadas) condicoes.push(`(${ATRASADA})`);

    const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

    const contagem = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ocorrencias o ${onde}`,
      params,
    );

    params.push(porPagina, (pagina - 1) * porPagina);
    const r = await db.query<LinhaOcorrencia>(
      `SELECT o.*, e.nome AS equipe_nome
         FROM ocorrencias o
         LEFT JOIN equipes e ON e.id = o.equipe_id
         ${onde}
        ORDER BY
          CASE WHEN o.status IN ('encerrada','rascunho') THEN 1 ELSE 0 END,
          CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                            WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
          o.criado_em DESC,
          o.id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      itens: r.rows,
      total: Number(contagem.rows[0]!.total),
      pagina,
      porPagina,
    };
  });
}

/**
 * Só as linhas da primeira página, para quem mostra um topo de fila curto e
 * já sabe disso (o painel mostra seis).
 */
export async function listarOcorrencias(
  s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<LinhaOcorrencia[]> {
  const r = await listarPaginaDeOcorrencias(s, filtro);
  return r.itens;
}

/**
 * Os pontos do mapa e, junto, quantos existem.
 *
 * A ordem é por severidade porque existe teto: se ele cortar, o que fica de
 * fora é o menos grave, nunca a crítica.
 */
export async function pontosDoMapa(s: Sessao, pagina = 1): Promise<PontosDoMapa> {
  const p = Math.max(1, Math.trunc(pagina));
  return comoApp(s.organizacaoId, async (db) => {
    const contagem = await db.query<{ com: string; sem: string }>(
      `SELECT
         count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::text AS com,
         count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::text AS sem
         FROM ocorrencias WHERE status NOT IN ('encerrada','rascunho')`,
    );
    const r = await db.query<PontoNoMapa>(
      `SELECT id, protocolo, tipo, status, severidade, endereco, latitude, longitude
         FROM ocorrencias
        WHERE status NOT IN ('encerrada','rascunho')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY
          CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                          WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
          criado_em DESC,
          id
        LIMIT $1 OFFSET $2`,
      [TETO_DO_MAPA, (p - 1) * TETO_DO_MAPA],
    );
    return {
      itens: r.rows,
      total: Number(contagem.rows[0]!.com),
      semCoordenada: Number(contagem.rows[0]!.sem),
      pagina: p,
      porPagina: TETO_DO_MAPA,
    };
  });
}

export async function buscarOcorrencia(s: Sessao, id: string): Promise<LinhaOcorrencia | null> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaOcorrencia>(
      `SELECT o.*, e.nome AS equipe_nome
         FROM ocorrencias o
         LEFT JOIN equipes e ON e.id = o.equipe_id
        WHERE o.id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  });
}

export async function trilhaDaOcorrencia(s: Sessao, id: string): Promise<LinhaEvento[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaEvento>(
      `SELECT id, tipo, autor_nome, autor_papel, origem, ocorrido_em, registrado_em, detalhe
         FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY ocorrido_em ASC`,
      [id],
    );
    return r.rows;
  });
}

export async function vistoriaDaOcorrencia(s: Sessao, id: string): Promise<LinhaVistoria | null> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaVistoria>(
      `SELECT v.id, v.checklist, v.gps_precisao_metros, v.assinante_nome, v.observacoes,
              v.coletada_em, v.sincronizada_em, u.nome AS agente_nome
         FROM vistorias v
         LEFT JOIN usuarios u ON u.id = v.agente_id
        WHERE v.ocorrencia_id = $1
        ORDER BY v.coletada_em DESC LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  });
}

export async function providenciasDaOcorrencia(s: Sessao, id: string): Promise<LinhaProvidencia[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaProvidencia>(
      `SELECT id, orgao_destino, descricao, responsavel, prazo_em, encaminhada_em, respondida_em
         FROM providencias WHERE ocorrencia_id = $1 ORDER BY encaminhada_em DESC`,
      [id],
    );
    return r.rows;
  });
}

/** Duplicidade provável: mesmo tipo, ainda ativa, aberta nas últimas 48 horas. */
export async function possiveisDuplicidades(
  s: Sessao,
  /*
    `TipoDeEntrada` porque a checagem roda na ABERTURA, e a abertura aceita
    "outro". Enquanto aqui só coubessem os oito da COBRADE, a tela de registro
    não conseguiria nem perguntar por duplicidade de um chamado a classificar,
    e dois telefonemas sobre a mesma árvore caída virariam dois protocolos.
  */
  tipo: TipoDeEntrada,
  endereco: string,
): Promise<LinhaOcorrencia[]> {
  const termo = endereco.trim().split(",")[0]?.trim().toLowerCase() ?? "";
  if (termo.length < 4) return [];
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaOcorrencia>(
      `SELECT o.*, NULL::text AS equipe_nome FROM ocorrencias o
        WHERE o.tipo = $1
          AND o.status NOT IN ('encerrada','rascunho')
          AND o.criado_em > now() - interval '48 hours'
          AND lower(o.endereco) LIKE $2
        ORDER BY o.criado_em DESC`,
      [tipo, `%${termo}%`],
    );
    return r.rows;
  });
}

async function registrarEvento(
  db: Contexto,
  s: Sessao,
  ocorrenciaId: string,
  tipo: string,
  detalhe: unknown,
  origem: Origem = "escritorio",
): Promise<void> {
  await db.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)`,
    [s.organizacaoId, ocorrenciaId, tipo, s.usuarioId, s.usuarioNome, s.papel, origem, JSON.stringify(detalhe)],
  );
}

export async function abrirOcorrencia(s: Sessao, dados: AberturaOcorrencia): Promise<string> {
  exigirPermissao(s.papel, "abrir_ocorrencia");
  return comoApp(s.organizacaoId, async (db) => {
    const p = await db.query<{ proximo_protocolo: string }>(
      "SELECT proximo_protocolo($1) AS proximo_protocolo",
      [new Date().getFullYear()],
    );
    const protocolo = p.rows[0]!.proximo_protocolo;

    /*
      A descricao SO acompanha "outro", palavra por palavra como a rota HTTP
      faz, e as duas restricoes da migracao 019 recusam qualquer outro arranjo:
      "outro" mudo e descricao pendurada em tipo da COBRADE. Sem esta linha o
      modo de demonstracao morria no INSERT com SQLSTATE 23514 na frente de
      quem estivesse assistindo, porque a coluna simplesmente nao era escrita.
    */
    const tipoDescricao = precisaReclassificar(dados.tipo)
      ? dados.tipoDescricao?.trim() ?? null
      : null;

    const r = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, tipo_descricao, status, endereco,
          ponto_referencia, latitude, longitude,
          solicitante_nome, solicitante_contato, canal_entrada, descricao, vinculada_a)
       VALUES ($1,$2,$3,$4,'registrada',$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        s.organizacaoId, protocolo, dados.tipo, tipoDescricao, dados.endereco,
        dados.pontoReferencia?.trim() || null,
        dados.coordenada?.lat ?? null, dados.coordenada?.lng ?? null,
        dados.solicitanteNome, dados.solicitanteContato ?? null,
        dados.canalEntrada, dados.descricao, dados.vinculadaA ?? null,
      ],
    );
    const id = r.rows[0]!.id;
    await registrarEvento(db, s, id, "registro", {
      protocolo,
      canal: dados.canalEntrada,
      vinculadaA: dados.vinculadaA ?? null,
      tipo: dados.tipo,
      /*
        O texto vai para a trilha ALEM da coluna, porque a reclassificacao na
        triagem apaga a coluna (tipo da COBRADE nao guarda descricao). Sem esta
        copia, o relato que o solicitante fez ao telefone desapareceria no
        instante da classificacao, e ninguem mais conseguiria conferir se a
        decisao tecnica correspondia ao que a pessoa contou.
      */
      tipoDescricao,
    });
    return id;
  });
}

/**
 * Toda mudança de status passa por aqui, e por `transicaoPermitida`. A regra
 * do fluxo mora no pacote compartilhado, então a mesma checagem vale no app
 * de campo e no servidor: não é validação de tela.
 */
async function exigirTransicao(
  db: Contexto,
  id: string,
  para: StatusOcorrencia,
): Promise<StatusOcorrencia> {
  const atual = await db.query<{ status: StatusOcorrencia }>(
    "SELECT status FROM ocorrencias WHERE id = $1",
    [id],
  );
  const de = atual.rows[0]?.status;
  if (!de) throw new Error("Ocorrência não encontrada nesta organização");
  if (de === para) {
    // Mesma regra da API, palavra por palavra: repetir um passo é legítimo,
    // repetir um desfecho é clique duplicado, e o segundo evento fica gravado
    // numa trilha que não se corrige. Os dois modos precisam produzir a MESMA
    // trilha, porque ela é a peça que sai como prova.
    if (estadoTerminal(de)) {
      throw new Error("Essa ocorrência já está encerrada. Nada foi alterado.");
    }
    return de;
  }
  if (!transicaoPermitida(de, para)) {
    throw new Error(`Transição não permitida: de ${de} para ${para}`);
  }
  return de;
}

export async function classificarNaTriagem(s: Sessao, id: string, t: Triagem): Promise<void> {
  exigirPermissao(s.papel, "classificar_triagem");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "triagem");

    /*
      A RECLASSIFICACAO, que este modo coletava e jogava fora.

      `triagemSchema.tipo` chegava aqui e o UPDATE nao o mencionava: quem
      classificasse um chamado "outro" no modo de demonstracao via a tela
      confirmar e o chamado continuava "outro" no banco, para descobrir isso no
      despacho, recusado, sem nenhuma pista de que a escolha se perdeu.

      O tipo anterior e lido ANTES do UPDATE porque e ele que vai para a
      trilha: "reclassificado de outro para deslizamento" e um fato do
      processo, e a coluna so guarda o estado de agora.
    */
    const antes = await db.query<{ tipo: TipoDeEntrada; tipo_descricao: string | null }>(
      "SELECT tipo, tipo_descricao FROM ocorrencias WHERE id = $1",
      [id],
    );
    const anterior = antes.rows[0]!;
    const tipoNovo = t.tipo ?? anterior.tipo;

    /*
      `tipo_descricao` e zerada junto com a reclassificacao, e a restricao
      `tipo_da_cobrade_nao_guarda_descricao` (migracao 019) recusaria o UPDATE
      se ela ficasse. O texto nao se perde: foi para a trilha no registro e vai
      de novo no evento abaixo, que e append-only. O que deixa de existir e um
      campo livre pendurado num registro ja classificado, que vira lixeira de
      anotacao paralela justamente porque ninguem mais o le.
    */
    await db.query(
      `UPDATE ocorrencias
          SET status = 'triagem', severidade = $2,
              vulnerabilidade_presente = $3, vulnerabilidade_descricao = $4,
              prazo_em = criado_em + ($5 || ' hours')::interval,
              tipo = $6,
              tipo_descricao = CASE WHEN $6 = 'outro' THEN tipo_descricao ELSE NULL END
        WHERE id = $1`,
      [
        id, t.severidade, t.vulnerabilidadePresente,
        t.vulnerabilidadeDescricao ?? null, String(PRAZO_PADRAO_HORAS[t.severidade]),
        tipoNovo,
      ],
    );
    await registrarEvento(db, s, id, "triagem", {
      severidade: t.severidade,
      vulnerabilidade: t.vulnerabilidadePresente ? t.vulnerabilidadeDescricao : null,
      prazoHoras: PRAZO_PADRAO_HORAS[t.severidade],
      tipo: tipoNovo,
      ...(tipoNovo !== anterior.tipo
        ? {
            tipoAnterior: anterior.tipo,
            /*
              O relato que motivou a classificacao, guardado no mesmo evento que
              a classificacao. Depois deste UPDATE ele nao existe mais em coluna
              nenhuma, e quem auditar precisa ler os dois lado a lado para saber
              se a decisao tecnica correspondia ao que a pessoa contou.
            */
            tipoDescricaoAnterior: anterior.tipo_descricao,
          }
        : {}),
    });
  });
}

export async function despacharEquipe(s: Sessao, id: string, d: Despacho): Promise<void> {
  exigirPermissao(s.papel, "despachar_equipe");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "em_campo");

    /*
      O PORTAO DA RECLASSIFICACAO, o mesmo que a rota HTTP impoe. "outro" nao
      sobrevive ao despacho: a taxonomia COBRADE existe para o dado do
      municipio conversar com o sistema nacional, e um chamado que fica "outro"
      para sempre e dado perdido, porque depois que a equipe sai ninguem volta
      para classificar.

      A checagem existe AQUI, e nao so na restricao
      `tipo_a_classificar_nao_passa_do_despacho` da migracao 019, pelo mesmo
      motivo da API: sem ela o coordenador leria o texto cru de um erro de
      constraint do Postgres, no meio de uma demonstracao, em vez da frase que
      diz o que fazer. O modo de demonstracao precisa recusar pela MESMA razao
      e com a MESMA frase, senao ele ensina um fluxo que o produto real nao
      tem.
    */
    const classificacao = await db.query<{ tipo: TipoDeEntrada }>(
      "SELECT tipo FROM ocorrencias WHERE id = $1",
      [id],
    );
    if (precisaReclassificar(classificacao.rows[0]!.tipo)) {
      throw new Error(MOTIVO_RECLASSIFICAR);
    }

    const equipe = await db.query<{ nome: string }>("SELECT nome FROM equipes WHERE id = $1", [d.equipeId]);
    if (!equipe.rows[0]) throw new Error("Equipe não encontrada nesta organização");
    await db.query(
      `UPDATE ocorrencias
          SET status = 'em_campo', equipe_id = $2,
              prazo_em = now() + ($3 || ' hours')::interval
        WHERE id = $1`,
      [id, d.equipeId, String(d.prazoHoras)],
    );
    await registrarEvento(db, s, id, "despacho", {
      equipe: equipe.rows[0].nome,
      prazoHoras: d.prazoHoras,
      instrucoes: d.instrucoes ?? null,
    });
  });
}

/**
 * Encaminha, com o destino saindo do catálogo quando ele existe.
 *
 * O nome é COPIADO para `orgao_destino` mesmo quando o identificador vem
 * junto, e isso não é redundância: `orgao_destino` é o registro do destino que
 * este encaminhamento realmente levou, e ele precisa continuar valendo se o
 * órgão for renomeado no catálogo depois. Sem o identificador, um gatilho do
 * banco amarra a providência ao catálogo pelo nome (migração 017).
 */
export async function encaminharProvidencia(
  s: Sessao,
  id: string,
  p: Providencia & { orgaoId?: string },
): Promise<void> {
  exigirPermissao(s.papel, "encaminhar_providencia");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "providencia_pendente");

    let orgaoId: string | null = null;
    let nomeDoDestino = p.orgaoDestino;
    if (p.orgaoId) {
      const orgao = await db.query<{ nome: string; ativo: boolean }>(
        "SELECT nome, ativo FROM orgaos WHERE id = $1", [p.orgaoId],
      );
      // A leitura roda com o RLS aplicado, então órgão de outro município
      // simplesmente não volta, e a resposta é a mesma de um identificador
      // que nunca existiu: recurso de outro município não se confirma.
      if (!orgao.rows[0]) throw new Error("Órgão não encontrado.");
      if (!orgao.rows[0].ativo) {
        throw new Error(
          `${orgao.rows[0].nome} está desativado no catálogo deste município. `
          + "Escolha outro destino, ou reative o órgão.",
        );
      }
      orgaoId = p.orgaoId;
      nomeDoDestino = orgao.rows[0].nome;
    }

    await db.query(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval)`,
      [
        s.organizacaoId, id, orgaoId, nomeDoDestino,
        p.descricao, p.responsavel, String(p.prazoHoras),
      ],
    );
    await db.query("UPDATE ocorrencias SET status = 'providencia_pendente' WHERE id = $1", [id]);
    await registrarEvento(db, s, id, "providencia", {
      orgao: nomeDoDestino,
      responsavel: p.responsavel,
      prazoHoras: p.prazoHoras,
    });
  });
}

export async function encerrarOcorrencia(s: Sessao, id: string, e: Encerramento): Promise<void> {
  exigirPermissao(s.papel, "encerrar_ocorrencia");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "encerrada");
    await db.query(
      `UPDATE ocorrencias
          SET status = 'encerrada', encerrado_em = now(), motivo_encerramento = $2
        WHERE id = $1`,
      [id, e.motivo],
    );
    await registrarEvento(db, s, id, "encerramento", { motivo: e.motivo });
  });
}

export async function responderProvidencia(
  s: Sessao,
  ocorrenciaId: string,
  providenciaId: string,
  r: { desfecho: string; resposta: string; respondidaPor: string },
): Promise<void> {
  exigirPermissao(s.papel, "responder_providencia");
  await comoApp(s.organizacaoId, async (db) => {
    const atual = await db.query<{ respondida_em: string | null; orgao_destino: string }>(
      "SELECT respondida_em, orgao_destino FROM providencias WHERE id = $1 AND ocorrencia_id = $2",
      [providenciaId, ocorrenciaId],
    );
    const alvo = atual.rows[0];
    if (!alvo) throw new Error("Providência não encontrada.");
    if (alvo.respondida_em) {
      throw new Error("Essa providência já tem resposta registrada.");
    }
    await db.query(
      `UPDATE providencias
          SET respondida_em = now(), resposta = $2, desfecho = $3, respondida_por = $4
        WHERE id = $1`,
      [providenciaId, r.resposta, r.desfecho, r.respondidaPor],
    );
    await registrarEvento(db, s, ocorrenciaId, "resposta_providencia", {
      orgao: alvo.orgao_destino, desfecho: r.desfecho, respondidaPor: r.respondidaPor,
    });
  });
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function indicadores(s: Sessao): Promise<Indicadores> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<Indicadores>(
      // O `atrasadas` daqui é a MESMA expressão que a lista usa com o filtro
      // ligado. Clicar no indicador precisa levar a uma lista que conte a
      // mesma coisa que o número clicado.
      `SELECT
         count(*) FILTER (WHERE o.status NOT IN ('encerrada','rascunho'))::int AS na_fila,
         count(*) FILTER (WHERE o.status = 'em_campo')::int AS em_campo,
         count(*) FILTER (WHERE ${ATRASADA})::int AS atrasadas,
         count(*) FILTER (WHERE o.status = 'encerrada'
                            AND o.encerrado_em > now() - interval '7 days')::int AS encerradas_7d,
         count(*) FILTER (WHERE o.status NOT IN ('encerrada','rascunho')
                            AND o.severidade = 'critica')::int AS criticas,
         /*
           As duas de providência FALTAVAM aqui, e a falta era silenciosa.

           ATENÇÃO: este bloco está DENTRO de um template literal, então crase
           aqui fecha a string. Sem crase.

           A consulta tipada é asserção de tipo, não verificação: o
           TypeScript aceitou a consulta com cinco colunas contra um tipo de
           sete, e a tela leu ausente com padrao zero, e imprimiu ZERO. O resultado era
           o painel dizendo "Providências vencidas: 0" com o cartão logo abaixo
           mostrando as mesmas providências marcadas como vencidas, na mesma
           tela, na demonstração que o produto usa para vender.

           A expressão é a MESMA da rota de indicadores da API, e
           precisa continuar sendo: dois lugares contando a mesma coisa de
           jeitos diferentes é o defeito que o comentário do atrasadas, logo
           acima, já existe para evitar.
         */
         (SELECT count(*) FROM providencias
           WHERE respondida_em IS NULL)::int AS providencias_abertas,
         (SELECT count(*) FROM providencias
           WHERE respondida_em IS NULL AND prazo_em < now())::int
           AS providencias_vencidas
       FROM ocorrencias o`,
    );
    return r.rows[0]!;
  });
}

// ---------------------------------------------------------------------------
// Equipes e usuários
// ---------------------------------------------------------------------------

export async function listarEquipes(s: Sessao): Promise<LinhaEquipe[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaEquipe>(
      `SELECT e.id, e.nome, e.especialidade, e.ativa,
              (SELECT count(*) FROM ocorrencias o
                WHERE o.equipe_id = e.id AND o.status NOT IN ('encerrada','rascunho'))::int
              AS em_atendimento
         FROM equipes e ORDER BY e.nome`,
    );
    return r.rows;
  });
}

export async function criarEquipe(s: Sessao, nome: string, especialidade: string): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  await comoApp(s.organizacaoId, async (db) => {
    await db.query(
      "INSERT INTO equipes (organizacao_id, nome, especialidade) VALUES ($1,$2,$3)",
      [s.organizacaoId, nome.trim(), especialidade.trim() || null],
    );
  });
}

export async function atualizarEquipe(
  s: Sessao, id: string, nome: string, especialidade: string, ativa: boolean,
): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  await comoApp(s.organizacaoId, async (db) => {
    await db.query(
      "UPDATE equipes SET nome = $2, especialidade = $3, ativa = $4 WHERE id = $1",
      [id, nome.trim(), especialidade.trim() || null, ativa],
    );
  });
}

export async function listarUsuarios(s: Sessao): Promise<LinhaUsuario[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaUsuario>(
      `SELECT u.id, u.nome, u.matricula, u.email, u.papel, u.equipe_id, u.ativo,
              e.nome AS equipe_nome
         FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id
        ORDER BY u.nome`,
    );
    return r.rows;
  });
}

export async function criarUsuario(
  s: Sessao,
  dados: { nome: string; matricula: string; email: string; papel: Papel; equipeId: string | null },
): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_usuarios");
  // Posto além da permissão: quem administra usuários não administra qualquer
  // usuário. A regra é a mesma da API, e não pode valer só de um lado.
  exigirPostoParaGerir(s.papel, dados.papel);
  await comoApp(s.organizacaoId, async (db) => {
    await db.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [s.organizacaoId, dados.nome.trim(), dados.matricula.trim(), dados.email.trim(), dados.papel, dados.equipeId],
    );
  });
}

/** Corrigir cadastro sem desativar e recriar, que partiria o histórico em duas contas. */
export async function atualizarUsuario(
  s: Sessao,
  id: string,
  dados: { nome: string; matricula: string; email: string; papel: Papel; equipeId: string | null },
): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_usuarios");
  exigirPostoParaGerir(s.papel, dados.papel);
  await comoApp(s.organizacaoId, async (db) => {
    const alvo = await db.query<{ papel: Papel; ativo: boolean }>(
      "SELECT papel, ativo FROM usuarios WHERE id = $1", [id],
    );
    const atual = alvo.rows[0];
    if (!atual) throw new Error("Usuário não encontrado neste município");
    exigirPostoParaGerir(s.papel, atual.papel);
    await exigirQueSobreAdministrador(db, id, atual, dados.papel !== "administrador");

    await db.query(
      `UPDATE usuarios
          SET nome = $2, matricula = $3, email = $4, papel = $5, equipe_id = $6
        WHERE id = $1`,
      [id, dados.nome.trim(), dados.matricula.trim(), dados.email.trim().toLowerCase(),
       dados.papel, dados.equipeId],
    );
  });
}

/**
 * O município não pode ficar sem quem o administra.
 *
 * Vale para desativar e para rebaixar, porque as duas coisas produzem o mesmo
 * resultado: ninguém capaz de criar usuário, e saída só por SQL na mão.
 */
async function exigirQueSobreAdministrador(
  db: Contexto,
  id: string,
  atual: { papel: Papel; ativo: boolean },
  vaiPerderOPosto: boolean,
): Promise<void> {
  if (!vaiPerderOPosto || atual.papel !== "administrador" || !atual.ativo) return;
  const restantes = await db.query<{ quantos: string }>(
    "SELECT count(*) AS quantos FROM usuarios WHERE papel = 'administrador' AND ativo = true AND id <> $1",
    [id],
  );
  if (Number(restantes.rows[0]?.quantos ?? 0) === 0) {
    throw new Error(
      "Este é o último administrador ativo do município. Promova outra pessoa " +
      "a administrador antes de mexer nesta conta.",
    );
  }
}

/**
 * Usuário não é apagado: é desativado. Ele assina laudo e aparece na trilha,
 * e a trilha precisa continuar apontando para alguém depois do fato.
 */
export async function alternarUsuarioAtivo(s: Sessao, id: string, ativo: boolean): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_usuarios");
  if (id === s.usuarioId && !ativo) {
    throw new Error("Você não pode desativar a própria conta.");
  }
  await comoApp(s.organizacaoId, async (db) => {
    const alvo = await db.query<{ papel: Papel; ativo: boolean }>(
      "SELECT papel, ativo FROM usuarios WHERE id = $1", [id],
    );
    const atual = alvo.rows[0];
    if (!atual) throw new Error("Usuário não encontrado neste município");
    exigirPostoParaGerir(s.papel, atual.papel);
    await exigirQueSobreAdministrador(db, id, atual, !ativo);

    await db.query("UPDATE usuarios SET ativo = $2 WHERE id = $1", [id, ativo]);
  });
}

// ---------------------------------------------------------------------------
// Sino de avisos
//
// As tabelas e os gatilhos da migração 018 valem aqui igual: o modo de
// demonstração roda as mesmas migrações. O que muda é onde a consulta mora, e
// por isso ela é reescrita aqui em vez de ser importada da API: os dois lados
// falam com bancos diferentes, e um pacote comum entre painel e servidor
// arrastaria o Fastify para dentro do navegador.
// ---------------------------------------------------------------------------

/**
 * A margem entre o relógio do banco e o corte da resposta, em segundos.
 *
 * O mesmo número da rota da API, e pela mesma razão: `criado_em` recebe
 * `now()`, que no Postgres é o instante em que a transação COMEÇOU. Uma
 * gravação que começa às 10h00m00s e confirma às 10h00m04s deixa um aviso
 * carimbado antes de ele existir para quem lê. Sem a margem, a consulta
 * seguinte pergunta por um instante posterior ao carimbo dele e o aviso nunca
 * aparece no sino de ninguém.
 */
const MARGEM_DE_COMMIT_SEGUNDOS = 10;

/** Os mesmos tetos da rota, para que os dois modos cortem no mesmo lugar. */
const TETO_DE_AVISOS = 200;
const TETO_DA_CONTAGEM = 500;
const RETENCAO_DE_AVISOS_DIAS = 60;
const LOTE_DE_PRAZOS = 200;

export async function avisosDesde(
  s: Sessao,
  cursor: CursorDeAvisos | null,
): Promise<RespostaDeAvisos> {
  return comoApp(s.organizacaoId, async (db) => {
    const marco = await db.query<{ ate: string }>(
      "SELECT (now() - ($1 || ' seconds')::interval)::text AS ate",
      [String(MARGEM_DE_COMMIT_SEGUNDOS)],
    );
    const ate = marco.rows[0]!.ate;

    /*
      Cursor adiante do relógio do banco é descartado, e vira primeira carga.

      Nenhum `ate` emitido daqui é maior que o `now()` daqui, então um `desde`
      no futuro só pode ter sido inventado. Aceitá-lo faria a resposta vir
      vazia e o cursor avançar assim mesmo: tudo o que estava gravado antes
      ficaria atrás dele e não voltaria em pergunta nenhuma.
    */
    const noFuturo = cursor !== null
      && Date.parse(cursor.desde) > Date.parse(ate);
    const desde = noFuturo ? null : cursor?.desde ?? null;
    const desdeId = desde === null ? null : cursor?.desdeId ?? null;

    /*
      O prazo vencido é o único fato do sino que nenhuma escrita dispara: ele
      acontece pela passagem do tempo. Os outros dois nascem de gatilho.

      `NOT EXISTS` antes do lote, e não só o `ON CONFLICT`: com o lote aplicado
      sobre a lista inteira, os mesmos primeiros seriam escolhidos toda vez,
      engolidos pelo conflito, e os que sobrassem nunca entrariam.
    */
    await db.query(
      `WITH vencidos AS (
         SELECT o.organizacao_id AS org,
                o.id             AS ocorrencia,
                o.severidade     AS severidade,
                o.prazo_em       AS prazo,
                'prazo:' || o.id::text || ':'
                  || trunc(extract(epoch FROM o.prazo_em))::text AS chave
           FROM ocorrencias o
          WHERE o.prazo_em IS NOT NULL
            AND o.prazo_em <= now()
            AND o.prazo_em > now() - ($1 || ' days')::interval
            AND o.status NOT IN ('encerrada','rascunho','vistoria_concluida')
       )
       INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, detalhe)
       SELECT v.org, 'prazo_vencido', v.ocorrencia, v.chave, v.severidade
         FROM vencidos v
        WHERE NOT EXISTS (
                SELECT 1 FROM avisos a
                 WHERE a.organizacao_id = v.org AND a.chave_do_fato = v.chave
              )
        ORDER BY v.prazo DESC
        LIMIT $2
       ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING`,
      [String(RETENCAO_DE_AVISOS_DIAS), LOTE_DE_PRAZOS],
    );

    /*
      A ORDEM É CRESCENTE, e é a única em que o corte não perde nada. Cortando
      o fim de uma lista decrescente, quem fica de fora são os mais antigos, e
      o cursor devolvido aponta para a frente deles: eles ficariam contados no
      número do sino e inalcançáveis pela lista, para sempre.
    */
    const lista = await db.query<{
      id: string; tipo: string; ocorrencia_id: string; protocolo: string;
      criado_em: string; detalhe: string | null; lido: boolean;
    }>(
      `SELECT a.id, a.tipo, a.ocorrencia_id, a.criado_em::text AS criado_em, a.detalhe,
              o.protocolo,
              (l.usuario_id IS NOT NULL) AS lido
         FROM avisos a
         JOIN ocorrencias o
           ON o.organizacao_id = a.organizacao_id AND o.id = a.ocorrencia_id
         LEFT JOIN avisos_lidos l
           ON l.organizacao_id = a.organizacao_id
          AND l.aviso_id = a.id
          AND l.usuario_id = $1
        WHERE a.criado_em <= $2::timestamptz
          AND ($3::timestamptz IS NULL OR a.criado_em > $3::timestamptz
               OR ($4::uuid IS NOT NULL
                   AND a.criado_em = $3::timestamptz AND a.id > $4::uuid))
        ORDER BY a.criado_em, a.id
        LIMIT $5`,
      [s.usuarioId, ate, desde, desdeId, TETO_DE_AVISOS + 1],
    );

    const truncada = lista.rows.length > TETO_DE_AVISOS;
    const entregues = truncada ? lista.rows.slice(0, TETO_DE_AVISOS) : lista.rows;
    /*
      O cursor de uma resposta cortada é o ÚLTIMO AVISO ENTREGUE, e não o
      relógio: devolver o relógio diria "você viu tudo até agora" logo depois
      de ter deixado avisos de fora, e a pergunta seguinte pularia justamente
      eles.
    */
    const ultimo = entregues[entregues.length - 1];

    const contagem = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM (
           SELECT 1
             FROM avisos a
             LEFT JOIN avisos_lidos l
               ON l.organizacao_id = a.organizacao_id
              AND l.aviso_id = a.id
              AND l.usuario_id = $1
            WHERE l.usuario_id IS NULL
              AND a.criado_em <= $2::timestamptz
            LIMIT $3
         ) AS amostra`,
      [s.usuarioId, ate, TETO_DA_CONTAGEM + 1],
    );
    const contados = Number(contagem.rows[0]?.n ?? 0);

    return {
      ate: truncada && ultimo ? ultimo.criado_em : ate,
      ateId: truncada && ultimo ? ultimo.id : null,
      itens: entregues.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        ocorrenciaId: a.ocorrencia_id,
        protocolo: a.protocolo,
        criadoEm: a.criado_em,
        detalhe: a.detalhe,
        lido: a.lido,
      })),
      teto: TETO_DE_AVISOS,
      truncada,
      naoLidos: Math.min(contados, TETO_DA_CONTAGEM),
      naoLidosTruncado: contados > TETO_DA_CONTAGEM,
    };
  });
}

export async function marcarAvisosLidos(
  s: Sessao,
  ids: readonly string[],
): Promise<{ marcados: number }> {
  if (ids.length === 0) return { marcados: 0 };
  return comoApp(s.organizacaoId, async (db) => {
    /*
      A inserção passa POR DENTRO de `avisos`, e não direto pela lista
      recebida: identificador de outro município não casa com nenhuma linha
      visível e some sem resposta, em vez de bater na chave estrangeira e
      contar, pelo erro, que aquele aviso existe em algum lugar.
    */
    const r = await db.query<{ aviso_id: string }>(
      `INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id)
       SELECT a.organizacao_id, $1, a.id
         FROM avisos a
        WHERE a.id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING
       RETURNING aviso_id`,
      [s.usuarioId, [...ids]],
    );
    return { marcados: r.rows.length };
  });
}

// ---------------------------------------------------------------------------
// Catálogo de órgãos
// ---------------------------------------------------------------------------

export async function listarOrgaos(s: Sessao, incluirInativos = false): Promise<LinhaOrgao[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaOrgao>(
      `SELECT o.id, o.nome, o.sigla, o.email, o.telefone, o.ativo,
              o.desativado_em::text AS desativado_em, o.motivo_desativacao,
              (SELECT count(*) FROM providencias p WHERE p.orgao_id = o.id)::int
                AS providencias,
              (SELECT count(*) FROM providencias p
                WHERE p.orgao_id = o.id AND p.respondida_em IS NULL)::int
                AS abertas
         FROM orgaos o
        WHERE ($1 OR o.ativo)
        ORDER BY o.ativo DESC, o.nome`,
      [incluirInativos],
    );
    return r.rows;
  });
}

export async function criarOrgao(s: Sessao, dados: DadosDoOrgao): Promise<{ id: string }> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO orgaos (organizacao_id, nome, sigla, email, telefone)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        s.organizacaoId, dados.nome.trim(),
        dados.sigla?.trim() || null,
        dados.email?.trim().toLowerCase() || null,
        dados.telefone?.trim() || null,
      ],
    );
    return r.rows[0]!;
  });
}

export async function atualizarOrgao(
  s: Sessao,
  id: string,
  dados: DadosDoOrgao,
): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  await comoApp(s.organizacaoId, async (db) => {
    await db.query(
      "UPDATE orgaos SET nome = $2, sigla = $3, email = $4, telefone = $5 WHERE id = $1",
      [
        id, dados.nome.trim(),
        dados.sigla?.trim() || null,
        dados.email?.trim().toLowerCase() || null,
        dados.telefone?.trim() || null,
      ],
    );
  });
}

/**
 * Órgão não se apaga, se desativa com motivo.
 *
 * A recusa de desativar duas vezes existe aqui e no servidor pelo mesmo
 * motivo: o segundo clique gravaria um ato dizendo que algo aconteceu quando
 * nada aconteceu, numa trilha que não tem policy de UPDATE nem de DELETE.
 */
export async function desativarOrgao(s: Sessao, id: string, motivo: string): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  await comoApp(s.organizacaoId, async (db) => {
    const atual = await db.query<{ ativo: boolean }>(
      "SELECT ativo FROM orgaos WHERE id = $1", [id],
    );
    if (!atual.rows[0]) throw new Error("Órgão não encontrado.");
    if (!atual.rows[0].ativo) {
      throw new Error("Esse órgão já está desativado. Nada foi alterado.");
    }
    await db.query(
      `UPDATE orgaos
          SET ativo = false, desativado_em = now(), motivo_desativacao = $2
        WHERE id = $1`,
      [id, motivo.trim()],
    );
  });
}

export async function reativarOrgao(s: Sessao, id: string): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_equipes");
  await comoApp(s.organizacaoId, async (db) => {
    const atual = await db.query<{ ativo: boolean }>(
      "SELECT ativo FROM orgaos WHERE id = $1", [id],
    );
    if (!atual.rows[0]) throw new Error("Órgão não encontrado.");
    if (atual.rows[0].ativo) throw new Error("Esse órgão já está ativo. Nada foi alterado.");
    await db.query(
      `UPDATE orgaos
          SET ativo = true, desativado_em = NULL, motivo_desativacao = NULL
        WHERE id = $1`,
      [id],
    );
  });
}

// ---------------------------------------------------------------------------
// Ofício
// ---------------------------------------------------------------------------

export async function listarOficios(s: Sessao, ocorrenciaId: string): Promise<LinhaOficio[]> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<LinhaOficio>(
      `SELECT f.id, f.numero, f.emitido_em::text AS emitido_em, f.emitido_por_nome,
              f.providencia_id, g.nome AS orgao_nome, g.sigla AS orgao_sigla,
              (SELECT count(*) FROM oficio_envios e WHERE e.oficio_id = f.id)::int
                AS envios,
              (SELECT max(e.solicitado_em)::text FROM oficio_envios e
                WHERE e.oficio_id = f.id AND e.desfecho = 'entregue') AS ultimo_envio,
              (SELECT max(a.registrado_em)::text FROM oficio_aberturas a
                WHERE a.oficio_id = f.id AND a.resultado = 'entregue') AS aberto_em
         FROM oficios f JOIN orgaos g ON g.id = f.orgao_id
        WHERE f.ocorrencia_id = $1
        ORDER BY f.emitido_em DESC`,
      [ocorrenciaId],
    );
    return r.rows;
  });
}

export async function detalharOficio(s: Sessao, id: string): Promise<OficioDetalhado> {
  return comoApp(s.organizacaoId, async (db) => {
    const oficio = await db.query<Omit<OficioDetalhado, "envios" | "aberturas">>(
      `SELECT f.id, f.numero, f.observacoes, f.emitido_em::text AS emitido_em,
              f.emitido_por_nome, f.providencia_id,
              g.nome AS orgao_nome, g.sigla AS orgao_sigla, g.email AS orgao_email
         FROM oficios f JOIN orgaos g ON g.id = f.orgao_id
        WHERE f.id = $1`,
      [id],
    );
    if (!oficio.rows[0]) throw new Error("Ofício não encontrado.");
    const envios = await db.query<EnvioDeOficio>(
      `SELECT id, tentativa, destinatario_email, solicitado_em::text AS solicitado_em,
              solicitado_por_nome, desfecho, detalhe, expira_em::text AS expira_em
         FROM oficio_envios WHERE oficio_id = $1 ORDER BY tentativa`,
      [id],
    );
    const aberturas = await db.query<AberturaDeOficio>(
      `SELECT envio_id, resultado, registrado_em::text AS registrado_em
         FROM oficio_aberturas WHERE oficio_id = $1 ORDER BY registrado_em`,
      [id],
    );
    return { ...oficio.rows[0], envios: envios.rows, aberturas: aberturas.rows };
  });
}

/**
 * Emitir queima um número da sequência do município.
 *
 * O ano sai do relógio do BANCO, e não do processo: um computador com fuso
 * errado emitiria, em 31 de dezembro, um ofício numerado no ano seguinte, e a
 * sequência do ano novo começaria em dois.
 */
export async function emitirOficio(
  s: Sessao,
  providenciaId: string,
  observacoes?: string,
): Promise<{ id: string; numero: string }> {
  exigirPermissao(s.papel, "emitir_documento");
  return comoApp(s.organizacaoId, async (db) => {
    const providencia = await db.query<{ ocorrencia_id: string; orgao_id: string }>(
      "SELECT ocorrencia_id, orgao_id FROM providencias WHERE id = $1",
      [providenciaId],
    );
    if (!providencia.rows[0]) throw new Error("Providência não encontrada.");

    const jaTem = await db.query<{ numero: string }>(
      "SELECT numero FROM oficios WHERE providencia_id = $1", [providenciaId],
    );
    if (jaTem.rows[0]) {
      /*
        Um ofício por providência. O segundo clique não queima outro número: o
        órgão receberia dois documentos oficiais pedindo a mesma coisa, e o
        coordenador não saberia qual dos dois cobrar depois.
      */
      throw new Error(
        `Essa providência já tem o ofício ${jaTem.rows[0].numero}. `
        + "Reenvie esse, em vez de emitir outro.",
      );
    }

    const ano = await db.query<{ ano: number }>("SELECT extract(year from now())::int AS ano");
    const numero = await db.query<{ numero: string }>(
      "SELECT proximo_oficio($1) AS numero", [ano.rows[0]!.ano],
    );

    const r = await db.query<{ id: string; numero: string }>(
      `INSERT INTO oficios
         (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano,
          observacoes, emitido_por, emitido_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, numero`,
      [
        s.organizacaoId, providencia.rows[0].ocorrencia_id, providenciaId,
        providencia.rows[0].orgao_id, numero.rows[0]!.numero, ano.rows[0]!.ano,
        observacoes?.trim() || null, s.usuarioId, `${s.usuarioNome} (${s.papel})`,
      ],
    );
    return r.rows[0]!;
  });
}

/**
 * O envio por email é do servidor, e a recusa aqui é honesta.
 *
 * Fingir um envio no modo de demonstração seria o pior desfecho possível: a
 * tela diria "enviado" e nada teria saído. Prometer email que não sai já foi
 * um defeito real deste produto, e não volta por conta de uma demonstração.
 */
export async function enviarOficio(
  _s: Sessao,
  _id: string,
  _destinatario?: string,
): Promise<ResultadoDeEnvio> {
  throw new Error(
    "O envio do ofício por email é feito pelo servidor. Este painel está em "
    + "modo local: imprima o ofício e encaminhe pelo canal de sempre.",
  );
}

/** Mesma razão do laudo: o documento é montado pelo servidor. */
export async function abrirOficio(_s: Sessao, _id: string): Promise<string> {
  throw new Error("O ofício é gerado pelo servidor. Este painel está em modo local.");
}
