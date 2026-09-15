import type { EscritaDoConsole, LeituraDoConsole } from "./banco.js";

/**
 * As duas ações perigosas por município, e a leitura que as precede.
 *
 * O PEDIDO DO DONO, NA LETRA: "um botão que exige autenticação e os carambas,
 * pra apagar uma prefeitura por completo, eliminar pra sempre da face da terra
 * ela e tudo que existe, e outro botão só pra desativar o acesso". As decisões
 * tomadas com ele: a eliminação tem PRAZO DE ARREPENDIMENTO de sete dias
 * (suspende na hora, apaga depois, com cancelamento durante o prazo), e só o
 * dono desativa e elimina.
 *
 * O QUE ESTE ARQUIVO FAZ: chama quatro funções do banco (migração 038), cada
 * uma com o operador na transação. As funções recusam com
 * `insufficient_privilege` quem não é dono ativo, e é ISSO o controle de
 * acesso: a tela esconde o botão para operador, a rota responde 403 antes de
 * chegar aqui, e o banco recusa por baixo dos dois. Três camadas, e a que vale
 * é a de baixo.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ, e isto é uma decisão: apagar. `eliminar` AGENDA.
 * Quem executa o apagamento, sete dias depois, é o relógio da API, guardado
 * pelo estado do banco (`eliminacao_agendada_para` no passado e
 * `eliminada_em` nulo). O console não tem `DELETE` em tabela nenhuma, e um
 * console que apagasse na hora não teria prazo de arrependimento nenhum.
 *
 * TODO valor viaja como parâmetro do driver, pela mesma razão de sempre:
 * injeção num processo que fala com o banco de todas as prefeituras não se
 * mede pelo que a rota pretendia fazer.
 */

/** O estado de acesso de um município, como a lista e as ações leem. */
export type EstadoDoMunicipio = {
  id: string;
  nome: string;
  municipio: string;
  uf: string;
  acesso_suspenso_em: string | null;
  suspensao_motivo: string | null;
  eliminacao_agendada_para: string | null;
  eliminada_em: string | null;
};

/**
 * Um município pelo identificador, com o estado de acesso dele.
 *
 * Só `organizacoes`, que o console lê desde a migração 023. Serve para a rota
 * responder 404 antes de chamar função nenhuma (a resposta de "isso não é um
 * município" não deve depender de mensagem de erro do Postgres) e para a rota
 * de eliminar conferir o NOME EXATO digitado contra o cadastrado.
 */
export async function municipioPorId(
  leitura: LeituraDoConsole,
  id: string,
  operador: string,
): Promise<EstadoDoMunicipio | null> {
  const linhas = await leitura.ler<EstadoDoMunicipio>(
    `SELECT id, nome, municipio, uf,
            acesso_suspenso_em, suspensao_motivo, eliminacao_agendada_para, eliminada_em
       FROM organizacoes
      WHERE id = $1`,
    [id],
    operador,
  );
  return linhas[0] ?? null;
}

/**
 * Os códigos com que o banco recusa, e o que cada um vira na rota.
 *
 * `42501` é `insufficient_privilege`, o SQLSTATE padrão do Postgres: é o que as
 * quatro funções levantam para quem não é dono ativo. Na rota ele vira 403,
 * e é a prova de que o banco decidiu, e não a tela.
 *
 * `DC36x` é a convenção do produto para recusa escrita À MÃO, para gente ler
 * (a migração 036 começou com `DC360` a `DC363`). São as únicas mensagens de
 * banco que o console deixa sair na resposta: elas não vêm do Postgres, vêm de
 * quem escreveu a migração pensando em quem vai ler a tela. Qualquer outro erro
 * cai no tratador geral, que registra o detalhe e responde que falhou.
 */
export const SEM_PODER = "42501";

export function recusaEscritaParaGente(codigo: unknown): boolean {
  return typeof codigo === "string" && /^DC36\d$/.test(codigo);
}

export const CHAMADAS = {
  suspender: "SELECT console_suspender_municipio($1, $2)",
  reativar: "SELECT console_reativar_municipio($1)",
  agendarEliminacao: "SELECT console_agendar_eliminacao($1, $2)",
  cancelarEliminacao: "SELECT console_cancelar_eliminacao($1)",
} as const;

export function suspenderMunicipio(
  escrita: EscritaDoConsole, operador: string, organizacaoId: string, motivo: string,
): Promise<unknown> {
  return escrita.executar(CHAMADAS.suspender, [organizacaoId, motivo], operador);
}

export function reativarMunicipio(
  escrita: EscritaDoConsole, operador: string, organizacaoId: string,
): Promise<unknown> {
  return escrita.executar(CHAMADAS.reativar, [organizacaoId], operador);
}

export function agendarEliminacao(
  escrita: EscritaDoConsole, operador: string, organizacaoId: string, motivo: string,
): Promise<unknown> {
  return escrita.executar(CHAMADAS.agendarEliminacao, [organizacaoId, motivo], operador);
}

export function cancelarEliminacao(
  escrita: EscritaDoConsole, operador: string, organizacaoId: string,
): Promise<unknown> {
  return escrita.executar(CHAMADAS.cancelarEliminacao, [organizacaoId], operador);
}
