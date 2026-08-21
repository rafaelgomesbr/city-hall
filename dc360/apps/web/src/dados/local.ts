import {
  PRAZO_PADRAO_HORAS,
  exigirPermissao,
  transicaoPermitida,
  type Origem,
  type Papel,
  type StatusOcorrencia,
  type TipoCobrade,
  type AberturaOcorrencia,
  type Despacho,
  type Encerramento,
  type Providencia,
  type Triagem,
} from "@dc360/shared";
import { comoApp, semTenant, type Contexto } from "./banco";
import type {
  ContaDisponivel, FiltroOcorrencias, Indicadores, LinhaEquipe, LinhaEvento,
  LinhaOcorrencia, LinhaProvidencia, LinhaUsuario, LinhaVistoria, Sessao,
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

/**
 * O documento oficial é gerado pelo servidor de propósito: ele precisa sair
 * igual no navegador, na impressora e no PDF anexado ao processo. Sem API não
 * há documento, e dizer isso é melhor que gerar uma versão parecida que
 * divergiria da oficial.
 */
/**
 * Evidência fotográfica depende de armazenamento, que só existe com servidor.
 * Devolver lista vazia é o retrato honesto do modo local: não há foto, e a
 * tela diz isso em vez de inventar imagem de exemplo.
 */
export async function listarEvidencias(): Promise<never[]> {
  return [];
}

export async function pedirRecuperacao(): Promise<string> {
  throw new Error("A recuperação de senha exige a API. Este painel está em modo local.");
}

export async function redefinirSenha(): Promise<string> {
  throw new Error("A recuperação de senha exige a API. Este painel está em modo local.");
}

export async function abrirDocumento(): Promise<string> {
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
export async function entrarComSenha(_email: string, _senha: string): Promise<Sessao> {
  throw new Error("Entrada por senha exige a API. Este painel está em modo local.");
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

export async function listarOcorrencias(
  s: Sessao,
  filtro: FiltroOcorrencias = {},
): Promise<LinhaOcorrencia[]> {
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

    const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const r = await db.query<LinhaOcorrencia>(
      `SELECT o.*, e.nome AS equipe_nome
         FROM ocorrencias o
         LEFT JOIN equipes e ON e.id = o.equipe_id
         ${onde}
        ORDER BY
          CASE WHEN o.status IN ('encerrada','rascunho') THEN 1 ELSE 0 END,
          CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                            WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
          o.criado_em DESC`,
      params,
    );
    return r.rows;
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
  tipo: TipoCobrade,
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

    const r = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, latitude, longitude,
          solicitante_nome, solicitante_contato, canal_entrada, descricao, vinculada_a)
       VALUES ($1,$2,$3,'registrada',$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        s.organizacaoId, protocolo, dados.tipo, dados.endereco,
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
  if (de === para) return de;
  if (!transicaoPermitida(de, para)) {
    throw new Error(`Transição não permitida: de ${de} para ${para}`);
  }
  return de;
}

export async function classificarNaTriagem(s: Sessao, id: string, t: Triagem): Promise<void> {
  exigirPermissao(s.papel, "classificar_triagem");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "triagem");
    await db.query(
      `UPDATE ocorrencias
          SET status = 'triagem', severidade = $2,
              vulnerabilidade_presente = $3, vulnerabilidade_descricao = $4,
              prazo_em = criado_em + ($5 || ' hours')::interval
        WHERE id = $1`,
      [
        id, t.severidade, t.vulnerabilidadePresente,
        t.vulnerabilidadeDescricao ?? null, String(PRAZO_PADRAO_HORAS[t.severidade]),
      ],
    );
    await registrarEvento(db, s, id, "triagem", {
      severidade: t.severidade,
      vulnerabilidade: t.vulnerabilidadePresente ? t.vulnerabilidadeDescricao : null,
      prazoHoras: PRAZO_PADRAO_HORAS[t.severidade],
    });
  });
}

export async function despacharEquipe(s: Sessao, id: string, d: Despacho): Promise<void> {
  exigirPermissao(s.papel, "despachar_equipe");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "em_campo");
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

export async function encaminharProvidencia(s: Sessao, id: string, p: Providencia): Promise<void> {
  exigirPermissao(s.papel, "encaminhar_providencia");
  await comoApp(s.organizacaoId, async (db) => {
    await exigirTransicao(db, id, "providencia_pendente");
    await db.query(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval)`,
      [s.organizacaoId, id, p.orgaoDestino, p.descricao, p.responsavel, String(p.prazoHoras)],
    );
    await db.query("UPDATE ocorrencias SET status = 'providencia_pendente' WHERE id = $1", [id]);
    await registrarEvento(db, s, id, "providencia", {
      orgao: p.orgaoDestino,
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

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function indicadores(s: Sessao): Promise<Indicadores> {
  return comoApp(s.organizacaoId, async (db) => {
    const r = await db.query<Indicadores>(
      `SELECT
         count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho'))::int AS na_fila,
         count(*) FILTER (WHERE status = 'em_campo')::int AS em_campo,
         count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho')
                            AND prazo_em IS NOT NULL AND prazo_em < now())::int AS atrasadas,
         count(*) FILTER (WHERE status = 'encerrada'
                            AND encerrado_em > now() - interval '7 days')::int AS encerradas_7d,
         count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho')
                            AND severidade = 'critica')::int AS criticas
       FROM ocorrencias`,
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
  await comoApp(s.organizacaoId, async (db) => {
    await db.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [s.organizacaoId, dados.nome.trim(), dados.matricula.trim(), dados.email.trim(), dados.papel, dados.equipeId],
    );
  });
}

/**
 * Usuário não é apagado: é desativado. Ele assina laudo e aparece na trilha,
 * e a trilha precisa continuar apontando para alguém depois do fato.
 */
export async function alternarUsuarioAtivo(s: Sessao, id: string, ativo: boolean): Promise<void> {
  exigirPermissao(s.papel, "gerenciar_usuarios");
  await comoApp(s.organizacaoId, async (db) => {
    await db.query("UPDATE usuarios SET ativo = $2 WHERE id = $1", [id, ativo]);
  });
}
