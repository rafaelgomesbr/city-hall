import type { EscritaDoConsole, LeituraDoConsole } from "./banco.js";
import { derivarSenha, gerarSenhaTemporaria } from "../../api/src/auth/senha.js";

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

/* ======================================================================
   Restaurar o acesso do administrador (migração 054, decisão H06 B)
   ====================================================================== */

/**
 * O CAMINHO DE SUPORTE, e por que ele existe.
 *
 * Enquanto a recuperação de senha por email estiver desligada em produção, o
 * administrador ÚNICO de um município que perde a senha não tem saída pelo
 * painel: quem redefine senha de outra pessoa é quem administra, e não há
 * outra pessoa. O dono do console, depois de verificar a identidade de quem
 * pede por canal verificado (`docs/IMPLANTACAO.md`, seção 6.5), sorteia aqui
 * uma senha temporária para aquele administrador.
 *
 * A SENHA É SORTEADA AQUI E NUNCA É GRAVADA, como a senha inicial do
 * cadastro (`cadastro.ts`): a mesma `gerarSenhaTemporaria` da redefinição pelo
 * painel, a derivação `scrypt` do produto antes de abrir a transação, e o que
 * vai ao banco é o hash. A senha em texto claro sai desta função uma vez, até a
 * tela do dono, e acabou. Não vai para o log, nem para a trilha, nem para o
 * registro do console.
 *
 * QUEM DECIDE É O BANCO. A função `console_restaurar_acesso_do_administrador`
 * recusa quem não é dono (42501), motivo curto e senha não derivada (DC361),
 * município inexistente e conta que não seja de administrador ativo DAQUELE
 * município (DC364, com a mesma frase para outro município, outro papel e
 * conta desativada), município suspenso e o teto de três por município em
 * vinte e quatro horas (DC365). A rota e a tela repetem o que for barato
 * repetir para apontar o erro no campo certo, e nada além disso.
 */
export const CHAMADA_DE_RESTAURACAO =
  "SELECT usuario_id, sessoes_encerradas, senha_provisoria_ate " +
  "FROM console_restaurar_acesso_do_administrador($1, $2, $3, $4)";

export type AcessoRestaurado = {
  usuarioId: string;
  sessoesEncerradas: number;
  /** Até quando a senha temporária vale para entrar (72 h, como no painel). */
  senhaProvisoriaAte: string;
  /** Mostrada UMA vez ao dono do console. Não fica guardada em lugar nenhum. */
  senhaTemporaria: string;
};

export async function restaurarAcessoDoAdministrador(
  escrita: EscritaDoConsole,
  operador: string,
  organizacaoId: string,
  emailDoAdministrador: string,
  motivo: string,
): Promise<AcessoRestaurado> {
  const senhaTemporaria = gerarSenhaTemporaria();
  /*
    A derivação ANTES da transação, como no cadastro e na rota do painel:
    cerca de 128 MB e uma fração de segundo de scrypt, e com a transação
    aberta a linha do município ficaria travada esse tempo todo (a função
    trava a linha para contar o teto, e o login do município espera por ela).
  */
  const hash = await derivarSenha(senhaTemporaria);

  const linhas = await escrita.executar<{
    usuario_id: string;
    sessoes_encerradas: number;
    senha_provisoria_ate: string | Date;
  }>(CHAMADA_DE_RESTAURACAO, [organizacaoId, emailDoAdministrador, hash, motivo], operador);

  const r = linhas[0];
  if (!r) {
    // Não deve acontecer: a função devolve uma linha ou levanta erro. Se
    // acontecer, é defeito, e mostrar a senha de uma conta que não mudou
    // mandaria o dono ditar uma senha que não entra.
    throw new Error("O banco não devolveu a restauração.");
  }

  return {
    usuarioId: r.usuario_id,
    sessoesEncerradas: Number(r.sessoes_encerradas),
    senhaProvisoriaAte: new Date(r.senha_provisoria_ate).toISOString(),
    senhaTemporaria,
  };
}

/** Uma linha do registro de restaurações, como a tela do dono mostra. */
export type RestauracaoRegistrada = {
  registrado_em: string;
  operador_email: string;
  motivo: string;
  sessoes_encerradas: number;
  senha_provisoria_ate: string;
};

/**
 * As últimas restaurações de um município, para o dono ver antes de restaurar
 * de novo. Pedido de restauração repetido em poucos dias é sinal de alguém
 * tentando pelo telefone o que não conseguiu antes.
 *
 * A policy da 054 só deixa o DONO ler; um operador comum recebe lista vazia
 * do banco mesmo que uma rota esqueça o gancho.
 */
export async function restauracoesDoMunicipio(
  leitura: LeituraDoConsole,
  organizacaoId: string,
  operador: string,
): Promise<RestauracaoRegistrada[]> {
  return leitura.ler<RestauracaoRegistrada>(
    `SELECT registrado_em, operador_email, motivo, sessoes_encerradas, senha_provisoria_ate
       FROM restauracoes_de_acesso
      WHERE organizacao_id = $1
      ORDER BY registrado_em DESC
      LIMIT 20`,
    [organizacaoId],
    operador,
  );
}
