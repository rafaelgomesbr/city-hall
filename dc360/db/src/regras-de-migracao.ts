import type { Migracao } from "./migrar.js";

/**
 * Regras que toda migração nova obedece (V2-F01-E18).
 *
 * ## A regra
 *
 * Toda migração nova traz a volta: `db/migrations/desfazer/NNN_nome.sql`, com
 * o mesmo nome do arquivo que ela desfaz. Quando a volta não existe de
 * verdade (apagar coluna com dado, por exemplo), a migração declara isso no
 * topo do próprio arquivo, em vez de omitir:
 *
 *     -- IRREVERSIVEL: <motivo>; aprovado por <nome>; <AAAA-MM-DD>
 *
 * Omitir não vale. O desfazer só roda fora de produção (ver `desfazer.ts`); em
 * produção o caminho de volta é migração aditiva ou restaurar a cópia.
 *
 * ## Quem fica de fora, e por que a lista é explícita
 *
 * As migrações que já existiam quando a regra nasceu (001 a 051) NÃO têm volta
 * e não ganham uma agora: escrever o desfazer de uma migração que já rodou em
 * produção, sem poder ensaiá-lo contra o estado dela, é inventar uma volta que
 * ninguém provou. Elas estão na lista abaixo, escrita por extenso. Uma regra
 * "tudo de 052 em diante" seria derrubada por um arquivo novo com número velho;
 * com a lista, qualquer arquivo que não esteja nela é migração nova, tenha o
 * número que tiver. A lista só pode crescer por decisão explícita, e o teste
 * confere que cada nome dela ainda existe.
 *
 * Esta é a decisão do Roadmap V2 (F01-E18) ajustada ao repositório: o plano foi
 * escrito com 46 migrações e a regra valendo "depois da 046"; a 047 a 051 já
 * existiam quando a etapa foi implementada e entram na lista de isenção.
 */
export const MIGRACOES_ISENTAS_DE_DESFAZER: readonly string[] = [
  "001_base.sql",
  "002_autenticacao.sql",
  "003_evidencias.sql",
  "004_evidencia_idempotente.sql",
  "005_recuperacao_de_senha.sql",
  "006_resposta_de_providencia.sql",
  "007_registro_de_exportacao.sql",
  "008_chaves_coerentes_por_municipio.sql",
  "009_assinatura_data_e_emissao.sql",
  "010_trilha_administrativa.sql",
  "011_interesse_de_municipio.sql",
  "012_ponto_de_referencia.sql",
  "013_matricula_no_login.sql",
  "014_interdicao_tem_fim.sql",
  "015_pessoas_atingidas.sql",
  "016_aparelho_e_aviso_de_prazo.sql",
  "017_orgaos_oficio_e_email.sql",
  "018_sino_de_avisos.sql",
  "019_tipo_a_classificar.sql",
  "020_orgaos_indicados_na_vistoria.sql",
  "021_minimizacao_e_registro_de_consulta.sql",
  "022_segundo_fator.sql",
  "023_metricas_do_municipio.sql",
  "024_prova_tem_autor_e_equipe.sql",
  "025_provisionar_deixa_linha_espelho.sql",
  "026_relogio_do_resumo.sql",
  "027_recibo_do_provedor_de_email.sql",
  "028_devolucao_de_tarefa_vencida.sql",
  "029_minimizacao_alcanca_a_devolucao.sql",
  "030_prova_perdida_e_ponto_da_vistoria.sql",
  "031_saida_a_campo.sql",
  "032_prova_que_nao_se_apaga_e_prorrogacao_idempotente.sql",
  "033_as_outras_duas_que_prometiam_append_only.sql",
  "034_as_tabelas_centrais_tambem_nao_se_apagam.sql",
  "035_teto_e_objeto_orfao.sql",
  "036_o_console_cadastra_prefeitura.sql",
  "037_o_expurgo_de_notificacao_nao_depende_de_bypassrls.sql",
  "038_suspensao_eliminacao_e_operadores_do_console.sql",
  "039_codigos_de_recuperacao_do_console.sql",
  "040_foto_do_agente.sql",
  "041_busca_com_tolerancia_a_erro.sql",
  "042_aviso_de_despacho_nasce_no_despacho.sql",
  "043_minimizacao_alcanca_relato_vistoria_e_trilha.sql",
  "044_ambiente_da_apns_por_aparelho.sql",
  "045_varredura_de_prazo_sem_bypassrls_e_a_foto_no_teto.sql",
  "046_senha_provisoria_e_o_dono_do_token_diz_por_que.sql",
  "047_familia_da_sessao.sql",
  "048_dono_do_token_diz_se_a_conta_esta_ativa.sql",
  "049_renovacao_e_encerramento_na_mesma_trava.sql",
  "050_login_e_suspensao_na_mesma_linha.sql",
  "051_link_de_recuperacao_morre_com_a_credencial.sql",
];

const NOME_VALIDO = /^(\d{3})_[a-z0-9_]+\.sql$/;

export type Desfazer = {
  /** Mesmo nome da migração que ele desfaz. */
  versao: string;
  sql: string;
};

export type Irreversivel = { motivo: string; aprovadoPor: string; data: string };

const CABECALHO =
  /^--\s*IRREVERSIVEL:\s*([^;\s][^;]*?)\s*;\s*aprovado por\s+([^;\s][^;]*?)\s*;\s*(\d{4}-\d{2}-\d{2})$/;

/**
 * Lê o cabeçalho de irreversibilidade das linhas de comentário do TOPO do
 * arquivo. Devolve `null` quando não há, e `"malformado"` quando há uma linha
 * que começa com `IRREVERSIVEL` mas não traz motivo, aprovador e data ISO
 * válida: declarar pela metade é o mesmo que não declarar.
 */
export function cabecalhoIrreversivel(sql: string): Irreversivel | "malformado" | null {
  for (const linha of sql.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (limpa === "") continue;
    if (!limpa.startsWith("--")) break;
    if (!/^--\s*IRREVERSIVEL/i.test(limpa)) continue;

    const m = CABECALHO.exec(limpa);
    if (!m) return "malformado";
    const motivo = m[1] ?? "";
    const aprovadoPor = m[2] ?? "";
    const data = m[3] ?? "";
    const d = new Date(`${data}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return "malformado";
    return { motivo, aprovadoPor, data };
  }
  return null;
}

export type EntradaDasRegras = {
  migracoes: readonly Migracao[];
  desfazeres: readonly Desfazer[];
  isentas?: readonly string[];
};

function numeroDe(nome: string): number {
  const m = NOME_VALIDO.exec(nome);
  return m ? Number(m[1]) : Number.NaN;
}

/** Devolve as violações, uma frase cada. Lista vazia significa que está tudo certo. */
export function conferirRegrasDeMigracao({
  migracoes,
  desfazeres,
  isentas = MIGRACOES_ISENTAS_DE_DESFAZER,
}: EntradaDasRegras): string[] {
  const problemas: string[] = [];
  const nomes = new Set(migracoes.map((m) => m.versao));
  const isentasSet = new Set(isentas);

  // Nome e número.
  const porNumero = new Map<string, string[]>();
  for (const { versao } of migracoes) {
    const m = NOME_VALIDO.exec(versao);
    if (!m) {
      problemas.push(`${versao}: nome fora do padrão NNN_nome_em_minusculas.sql`);
      continue;
    }
    const numero = m[1] ?? "";
    porNumero.set(numero, [...(porNumero.get(numero) ?? []), versao]);
  }
  for (const [numero, arquivos] of porNumero) {
    if (arquivos.length > 1) {
      problemas.push(`número ${numero} repetido: ${[...arquivos].sort().join(", ")}`);
    }
  }

  // A lista de isenção não pode apontar para o que sumiu.
  for (const nome of isentas) {
    if (!nomes.has(nome)) {
      problemas.push(
        `${nome}: está na lista de isentas, mas o arquivo não existe mais (migração não se apaga)`,
      );
    }
  }

  const ultimaIsenta = Math.max(0, ...isentas.map(numeroDe).filter((n) => !Number.isNaN(n)));

  // Desfazer sem migração, vazio ou repetido.
  const desfazeresPorNome = new Map<string, Desfazer>();
  for (const d of desfazeres) {
    if (!nomes.has(d.versao)) {
      problemas.push(`desfazer/${d.versao}: não há migração com esse nome`);
    }
    if (d.sql.replace(/--.*$/gm, "").trim() === "") {
      problemas.push(`desfazer/${d.versao}: está vazio (só comentário não desfaz nada)`);
    }
    if (desfazeresPorNome.has(d.versao)) problemas.push(`desfazer/${d.versao}: repetido`);
    desfazeresPorNome.set(d.versao, d);
  }

  // A regra em si, para toda migração que não está na lista de isentas.
  for (const m of migracoes) {
    if (isentasSet.has(m.versao)) continue;

    const numero = numeroDe(m.versao);
    if (!Number.isNaN(numero) && numero <= ultimaIsenta) {
      problemas.push(
        `${m.versao}: migração nova com número ${String(numero).padStart(3, "0")}, que não passa da ` +
          `última isenta (${String(ultimaIsenta).padStart(3, "0")}); aplicada fora de ordem, ela ` +
          "não rodaria depois das que já estão em produção",
      );
    }

    const cabecalho = cabecalhoIrreversivel(m.sql);
    const temDesfazer = desfazeresPorNome.has(m.versao);
    if (cabecalho === "malformado") {
      problemas.push(
        `${m.versao}: cabeçalho IRREVERSIVEL incompleto; o formato é ` +
          "'-- IRREVERSIVEL: motivo; aprovado por NOME; AAAA-MM-DD'",
      );
    } else if (cabecalho && temDesfazer) {
      problemas.push(
        `${m.versao}: declara IRREVERSIVEL e também tem desfazer/${m.versao}; fique com um só`,
      );
    } else if (!cabecalho && !temDesfazer) {
      problemas.push(
        `${m.versao}: migração nova sem desfazer/${m.versao} e sem cabeçalho ` +
          "'-- IRREVERSIVEL: motivo; aprovado por NOME; AAAA-MM-DD'",
      );
    }
  }

  return problemas;
}
