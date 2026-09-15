import type { LeituraDoConsole } from "./banco.js";

/**
 * As DUAS consultas de NÚMERO que o console faz no banco.
 *
 * Elas estão neste arquivo e não espalhadas pelas rotas de propósito: assim dá
 * para abrir um arquivo e ver, inteira, a superfície de métrica que o console
 * alcança no banco de todos os municípios. Uma consulta nova aqui é uma decisão
 * visível; a mesma consulta escrita dentro de uma rota passaria numa revisão
 * de diff. (A leitura de UM município pelo identificador, para as ações
 * perigosas, mora em `municipios.ts`, junto das ações; a de operadores, em
 * `operadores.ts`.)
 *
 * As duas leem apenas o que a ADR 0008 nomeia: a visão
 * `console_situacao_dos_municipios`, a tabela `metricas_municipio` e o cadastro
 * `organizacoes`. Qualquer junção com tabela de negócio aqui responderia
 * "permissão negada" no banco, porque o papel do console não tem concessão nela
 * e a visão é `security_invoker` (migração 023).
 *
 * MUNICÍPIO ELIMINADO NÃO APARECE. A linha continua no banco (o produto não
 * apaga, e o relógio da API é quem executa a eliminação), mas um município
 * que já foi eliminado não tem número para mostrar nem ação para receber, e
 * uma linha dele na tela seria um convite a reativar o que não existe mais.
 */

/** Uma linha da tela principal: um município, com o retrato de hoje. */
export type SituacaoDoMunicipio = {
  organizacao_id: string;
  nome: string;
  municipio: string;
  uf: string;
  dia: string | null;
  ocorrencias_registradas: number | null;
  ocorrencias_encerradas: number | null;
  vistorias_recebidas: number | null;
  oficios_emitidos: number | null;
  ocorrencias_abertas: number | null;
  ocorrencias_atrasadas: number | null;
  usuarios_ativos: number | null;
  aparelhos_ativos: number | null;
  aparelhos_sem_aparecer: number | null;
  minutos_ate_vistoria_mediana: number | null;
  atualizado_em: string | null;
  sem_escrita_recente: boolean;
  horas_desde_a_escrita: number | null;
  /*
    O estado de ACESSO do município (migração 038). Quatro colunas de
    `organizacoes`, todas de data ou de motivo escrito pelo dono do console:
    nenhuma identifica pessoa nem imóvel, e é por isso que elas cabem aqui.
    A tela mostra o estado com ícone e palavra, nunca só cor.
  */
  acesso_suspenso_em: string | null;
  suspensao_motivo: string | null;
  eliminacao_agendada_para: string | null;
  eliminada_em: string | null;
};

/**
 * Parte da VISÃO, e não da tabela de métricas, e essa escolha é a resposta à
 * consequência ruim que a ADR 0008 assume por escrito.
 *
 * Se a métrica falhar, uma consulta direta a `metricas_municipio` simplesmente
 * NÃO TRAZ o município quebrado, e ninguém sente falta do que não está lá. A
 * visão parte de `organizacoes`, então todo município aparece sempre, e quem
 * não escreveu aparece com `sem_escrita_recente` verdadeiro. A ausência deixa
 * de ser uma linha faltando e vira uma linha dizendo que falta.
 *
 * A junção com `organizacoes` acontece aqui, e não dentro da visão, porque a
 * visão foi desenhada para ser só número: é isso que permite ao portão de
 * catálogo do `db/test/isolamento.test.ts` cobrar dela que nenhuma coluna de
 * texto apareça, sem exceção.
 */
export function situacaoDosMunicipios(
  leitura: LeituraDoConsole,
): Promise<SituacaoDoMunicipio[]> {
  return leitura.ler<SituacaoDoMunicipio>(`
    SELECT s.organizacao_id,
           o.nome, o.municipio, o.uf,
           s.dia,
           s.ocorrencias_registradas, s.ocorrencias_encerradas,
           s.vistorias_recebidas, s.oficios_emitidos,
           s.ocorrencias_abertas, s.ocorrencias_atrasadas,
           s.usuarios_ativos, s.aparelhos_ativos, s.aparelhos_sem_aparecer,
           s.minutos_ate_vistoria_mediana,
           s.atualizado_em, s.sem_escrita_recente, s.horas_desde_a_escrita,
           o.acesso_suspenso_em, o.suspensao_motivo,
           o.eliminacao_agendada_para, o.eliminada_em
      FROM console_situacao_dos_municipios s
      JOIN organizacoes o ON o.id = s.organizacao_id
     WHERE o.eliminada_em IS NULL
     ORDER BY s.sem_escrita_recente DESC, o.municipio
  `);
}

export type DiaDoMunicipio = {
  dia: string;
  ocorrencias_registradas: number;
  ocorrencias_encerradas: number;
  vistorias_recebidas: number;
  oficios_emitidos: number;
  ocorrencias_abertas: number;
  ocorrencias_atrasadas: number;
  minutos_ate_vistoria_mediana: number | null;
};

/**
 * A série do município, para responder "está caindo ou é só hoje?".
 *
 * O identificador vai como PARÂMETRO do driver, e o número de dias também.
 * Interpolar qualquer um dos dois numa string seria injeção de SQL num processo
 * que fala com o banco de todas as prefeituras, e o fato de o papel dele ser
 * pobre não é consolo: pobre é o papel, e o dano de uma injeção não se mede
 * pelo que a rota pretendia ler.
 */
export function serieDoMunicipio(
  leitura: LeituraDoConsole,
  organizacaoId: string,
  dias: number,
): Promise<DiaDoMunicipio[]> {
  return leitura.ler<DiaDoMunicipio>(
    `SELECT dia,
            ocorrencias_registradas, ocorrencias_encerradas,
            vistorias_recebidas, oficios_emitidos,
            ocorrencias_abertas, ocorrencias_atrasadas,
            minutos_ate_vistoria_mediana
       FROM metricas_municipio
      WHERE organizacao_id = $1
        AND dia > current_date - $2::integer
      ORDER BY dia DESC`,
    [organizacaoId, dias],
  );
}
