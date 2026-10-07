import { podeExecutar, type Papel } from "@dc360/shared";
import type { MotivoDaSessaoMorta } from "../dados/tipos";

/**
 * As regras da entrada, fora do React, para serem provadas sem navegador.
 *
 * Três coisas moram aqui, e cada uma existiu antes como decisão espalhada
 * pela tela ou pelo `App`:
 *
 * 1. **Onde cada papel cai ao entrar.** O agente de campo não tem uma ação
 *    sequer no painel do coordenador: ele não tria, não despacha, não
 *    encaminha e não encerra. Mandá-lo para lá era mostrar a fila do
 *    município inteiro para quem só precisa saber o que é da equipe dele
 *    hoje. A regra vivia em `App.tsx` e a tela de entrada não a usava: ela
 *    mandava todo mundo para `/painel`, cego.
 *
 * 2. **O caminho de volta.** Quem abre `/ocorrencias/<id>` sem sessão (o link
 *    que chegou pelo WhatsApp do plantão, a aba reaberta de manhã) passa por
 *    `/entrar` e precisa CHEGAR ao dossiê, não ao painel. E quem foi
 *    derrubado por sessão expirada no meio de uma tela precisa voltar para a
 *    mesma tela. O caminho viaja no estado da navegação, que é interno ao
 *    painel; ainda assim ele é conferido, porque a regra custa três linhas e
 *    fecha de vez a porta de um destino externo.
 *
 * 3. **Vazio é erro de campo.** A entrada em produção aceitava email e senha
 *    vazios, mandava para o servidor e devolvia "Alguns campos precisam ser
 *    corrigidos" sem marcar campo nenhum. O servidor está certo em recusar;
 *    a tela é que não deveria ter perguntado.
 */

export function telaInicial(papel: Papel | undefined): string {
  if (!papel) return "/entrar";
  return podeExecutar(papel, "registrar_vistoria") ? "/meu-trabalho" : "/painel";
}

/** Por que a pessoa está na tela de entrada, quando há um porquê a dizer. */
export type MotivoDaEntrada = MotivoDaSessaoMorta;

const MOTIVOS: ReadonlySet<unknown> = new Set<MotivoDaEntrada>(["expirou", "encerrada", "desativada"]);

export type EstadoDaEntrada = {
  motivo: MotivoDaEntrada | null;
  /** Rota interna para onde voltar depois de entrar, ou nenhuma. */
  voltarPara: string | null;
};

/**
 * Só rota interna do painel: começa com uma barra e não com duas (`//host`
 * é endereço absoluto sem esquema para o navegador), e nunca a própria tela
 * de entrada, que viraria um laço.
 *
 * A raiz (`/`) também não vale como caminho de volta, e isso era um defeito
 * de entrada: quem digitava só o domínio chegava a `/`, era mandado para
 * `/entrar` com `voltarPara: "/"`, e depois de entrar voltava para `/`, que
 * não tinha tela nenhuma. O painel respondia "Esta página não existe" logo
 * depois do login. Devolvendo `null`, `destinoDepoisDeEntrar` cai na tela do
 * papel, que é o destino certo de quem não pediu lugar nenhum.
 */
function rotaInterna(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  if (valor === "/" || valor.startsWith("/?") || valor.startsWith("/#")) return null;
  if (valor === "/entrar" || valor.startsWith("/entrar?")) return null;
  return valor;
}

/**
 * O caminho de volta que a rota protegida guarda, ou nenhum.
 *
 * Sair de propósito não deixa caminho de volta, e isso era um defeito: o clique
 * em "Sair" também dispara o redirecionamento da rota protegida (a tela ainda
 * está montada quando a sessão some), então a tela abandonada ficava guardada
 * na navegação. Quem entrasse em seguida naquele navegador caía nela, e não na
 * tela do próprio papel: outra pessoa, em outro papel, na tela da anterior.
 *
 * Sessão que cai sozinha é o caso oposto: ali o caminho de volta é justamente o
 * que devolve a pessoa ao trabalho interrompido.
 *
 * A regra fica aqui, e não dentro do componente, para ser provada sem
 * navegador.
 */
export function caminhoDeVolta(saidaVoluntaria: boolean, caminho: string): string | null {
  return saidaVoluntaria ? null : caminho;
}

/** Lê o `state` da navegação com desconfiança: ele é `unknown` por contrato. */
export function estadoDaEntrada(state: unknown): EstadoDaEntrada {
  if (!state || typeof state !== "object") return { motivo: null, voltarPara: null };
  const bruto = state as Record<string, unknown>;
  return {
    motivo: MOTIVOS.has(bruto["motivo"]) ? (bruto["motivo"] as MotivoDaEntrada) : null,
    voltarPara: rotaInterna(bruto["voltarPara"]),
  };
}

/** Para onde ir depois de entrar: de volta para onde estava, ou para a tela do papel. */
export function destinoDepoisDeEntrar(
  estado: { voltarPara?: unknown } | null,
  papel: Papel,
): string {
  return rotaInterna(estado?.voltarPara) ?? telaInicial(papel);
}

export type EntradaConferida =
  | { ok: true; dados: { email: string; senha: string } }
  | { ok: false; erros: Record<string, string> };

/**
 * Vazio não sai da tela. O formato do email e o tamanho da senha continuam
 * sendo do servidor, que responde 422 com `campos`, e a tela casa esses
 * campos do mesmo jeito que as outras telas fazem.
 */
export function conferirEntrada(campos: { email: string; senha: string }): EntradaConferida {
  const email = campos.email.trim();
  const erros: Record<string, string> = {};
  if (!email) erros["email"] = "Informe o email funcional";
  if (!campos.senha) erros["senha"] = "Informe a senha";
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { email, senha: campos.senha } };
}
