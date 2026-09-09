import Constants from "expo-constants";
import type { Papel, Severidade, TipoCobrade } from "@dc360/shared";

/**
 * O que o aplicativo pede à API além de sincronizar.
 *
 * Sincronizar é responsabilidade de `@dc360/campo`, que já trata idempotência,
 * espera entre tentativas e classificação de erro. Aqui ficam só as chamadas
 * que acontecem COM sinal e cujo fracasso não precisa de fila: entrar, sair e
 * baixar o que trabalhar depois.
 *
 * A distinção importa. Uma coleta que falha ao subir precisa esperar e tentar
 * de novo, porque perdê-la significa refazer a vistoria. Uma lista de tarefas
 * que falha ao baixar só precisa dizer "sem sinal, mostrando o que já tinha".
 */

const BASE = String(
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "",
).replace(/\/$/, "");

export function enderecoDaApi(): string {
  return BASE;
}

/** Erro que o aplicativo sabe explicar, separado de falha de rede. */
export class ErroDaApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaApi";
  }

  /**
   * O que dizer para quem está na rua, e não o que o servidor respondeu.
   *
   * A mensagem da API é escrita para o painel, onde há um coordenador sentado
   * que pode ligar para alguém. Aqui quem lê está em pé, no barranco, e
   * precisa saber uma coisa só: o que fazer agora. Cada caso abaixo termina
   * numa ação.
   */
  mensagemAmigavel(): string {
    if (this.status === 401) {
      return "Email ou senha não conferem. Confira e tente de novo.";
    }
    if (this.codigo === "bloqueado" || this.status === 429) {
      return (
        "A conta está bloqueada por tentativas seguidas de senha errada. " +
        "Espere alguns minutos, ou peça à coordenação para liberar."
      );
    }
    if (this.status === 403) {
      return (
        "Este perfil não pode registrar vistoria. Fale com a coordenação " +
        "do seu município para ajustar o seu cadastro."
      );
    }
    if (this.status >= 500) {
      return "O servidor da prefeitura não respondeu. Tente de novo em alguns minutos.";
    }
    return this.message;
  }
}

/**
 * Falha de rede traduzida.
 *
 * Sem isto o agente vê "Network request failed", em inglês, no meio do
 * barranco. A frase precisa dizer duas coisas: que o problema é o sinal, e que
 * o que ele fez continua guardado.
 */
export class SemSinal extends Error {
  constructor() {
    super("Sem sinal agora. O que você já registrou continua guardado no aparelho.");
    this.name = "SemSinal";
  }
}

/**
 * Tempo limite de quem não pode desistir: entrar, sair, baixar o que trabalhar.
 *
 * Vinte segundos é longo de propósito. Numa borda de cobertura o aperto de mão
 * do TLS sozinho já leva alguns segundos, e desistir cedo de uma dessas
 * chamadas custa ao agente subir o morro sem a lista de ocorrências.
 */
const TEMPO_LIMITE_MS = 20_000;

/**
 * Tempo limite de chamada de CONFORTO, que é outra coisa.
 *
 * Baixar "minha equipe" não decide plantão nenhum: se falhar, a tela mostra a
 * cópia que já estava no aparelho, e o agente segue trabalhando. Só que essa
 * chamada acontece com o agente parado olhando para uma tela de espera, e a
 * espera dura o tempo limite inteiro. Vinte segundos de tela parada é o que
 * produziu o relato do "spinner pendurado para sempre": tempo demais para
 * alguém em pé na rua, que a essa altura já concluiu que o aplicativo travou e
 * já o matou.
 *
 * Oito segundos entrega o mesmo resultado, com o fracasso chegando enquanto a
 * pessoa ainda está olhando. Envio de coleta continua com os vinte: lá,
 * desistir cedo significa refazer vistoria.
 */
const TEMPO_LIMITE_CONFORTO_MS = 8_000;

async function chamar<T>(
  caminho: string,
  opcoes: {
    metodo?: string; corpo?: unknown; token?: string | null;
    /** Teto próprio, para chamada cujo fracasso é barato. Padrão: o dos vinte. */
    tempoLimiteMs?: number;
  } = {},
): Promise<T> {
  if (!BASE) {
    throw new Error(
      "Endereço da API não configurado neste aplicativo. " +
      "Ele é definido no momento da compilação, em app.config.ts.",
    );
  }

  const cancelador = new AbortController();
  const relogio = setTimeout(
    () => cancelador.abort(),
    opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS,
  );

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      signal: cancelador.signal,
      headers: {
        accept: "application/json",
        ...(opcoes.corpo === undefined ? {} : { "content-type": "application/json" }),
        ...(opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {}),
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    });
  } catch {
    // Aborto por tempo e rede caída chegam aqui do mesmo jeito, e para quem
    // está em campo são a mesma coisa: não saiu.
    throw new SemSinal();
  } finally {
    clearTimeout(relogio);
  }

  if (resposta.status === 204) return undefined as T;

  const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) {
    throw new ErroDaApi(
      resposta.status,
      String(corpo["erro"] ?? "erro"),
      String(corpo["mensagem"] ?? "Não foi possível concluir a operação."),
    );
  }
  return corpo as T;
}

/* ========================================================================
   Entrada
   ======================================================================== */

export type Identidade = {
  usuarioId: string;
  nome: string;
  /** Sai impressa em todo documento que o agente assina. Ver migração 013. */
  matricula: string;
  papel: Papel;
  organizacaoNome: string;
  municipio: string;
  uf: string;
};

export type Credenciais = { acesso: string; renovacao: string };

export async function entrar(
  email: string,
  senha: string,
): Promise<{ credenciais: Credenciais; identidade: Identidade }> {
  const r = await chamar<{
    acesso: string; renovacao: string;
    usuario: {
      id: string; nome: string; matricula: string; papel: Papel;
      organizacaoNome: string; municipio: string; uf: string;
    };
  }>("/auth/entrar", { metodo: "POST", corpo: { email, senha } });

  return {
    credenciais: { acesso: r.acesso, renovacao: r.renovacao },
    identidade: {
      usuarioId: r.usuario.id,
      nome: r.usuario.nome,
      matricula: r.usuario.matricula,
      papel: r.usuario.papel,
      organizacaoNome: r.usuario.organizacaoNome,
      municipio: r.usuario.municipio,
      uf: r.usuario.uf,
    },
  };
}

export async function renovar(renovacao: string): Promise<Credenciais> {
  const r = await chamar<{ acesso: string; renovacao: string }>("/auth/renovar", {
    metodo: "POST", corpo: { renovacao },
  });
  return { acesso: r.acesso, renovacao: r.renovacao };
}

/** Revoga no servidor. Esquecer o token só do lado de cá deixaria a sessão viva. */
export async function sair(renovacao: string): Promise<void> {
  await chamar("/auth/sair", { metodo: "POST", corpo: { renovacao } }).catch(() => undefined);
}

/* ========================================================================
   O que baixar para trabalhar offline
   ======================================================================== */

export type Pendencia = {
  id: string;
  protocolo: string;
  tipo: TipoCobrade;
  severidade: Severidade | null;
  endereco: string;
  /** Como chegar, em linguagem de quem mora ali. Ver a migração 012. */
  ponto_referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  descricao: string;
  solicitante_nome: string;
  solicitante_contato: string | null;
  vulnerabilidade_presente: boolean;
  vulnerabilidade_descricao: string | null;
  prazo_em: string | null;
  /** Abertura do chamado. Sai impressa na minuta e no laudo. */
  criado_em: string;
};

/**
 * As ocorrências despachadas para a equipe do agente.
 *
 * É esta chamada que precisa acontecer ANTES de subir o morro. O que ela
 * trouxer fica guardado no aparelho; o que ela não trouxer não existe lá em
 * cima, e por isso a tela insiste tanto em sincronizar antes de sair.
 */
export type ListaDePendencias = {
  itens: Pendencia[];
  /** Quantas cabem numa resposta. */
  teto: number;
  /** Havia mais do que coube. */
  truncada: boolean;
};

export async function baixarPendencias(token: string): Promise<ListaDePendencias> {
  /*
    `teto` e `truncada` NÃO podem ser descartados aqui, e é por isso que esta
    função devolve o envelope em vez da lista crua.

    A rota corta em 200 tarefas para não fazer o aparelho baixar tudo no 3G do
    morro. Se o cliente jogasse fora a marca de corte, o agente veria uma lista
    aparentemente completa e subiria confiando nela, e as tarefas que ficaram de
    fora simplesmente não existiriam para ele. Teto calado é o defeito; o
    tamanho do teto não é.

    O padrão de `truncada` é falso e o de `teto` é o tamanho recebido: servidor
    antigo, que ainda não manda os dois campos, se comporta como antes em vez de
    fazer a tela mentir para o outro lado.
  */
  const r = await chamar<{ itens: Pendencia[]; teto?: number; truncada?: boolean }>(
    "/sincronizacao/pendencias", { token },
  );
  return {
    itens: r.itens,
    teto: r.teto ?? r.itens.length,
    truncada: r.truncada ?? false,
  };
}

/**
 * Uma tarefa que sumiu da lista, e o motivo.
 *
 * `desfecho` é o campo para a tela, e `status` é o fato cru registrado na
 * ocorrência. Os dois vêm porque servem a coisas diferentes: a tela mostra o
 * desfecho, e a decisão de apagar a lápide da coleta compara o status, que não
 * ganha nuance nova quando alguém melhorar o texto do desfecho.
 */
export type SaidaDeLista = {
  id: string;
  protocolo: string;
  status: string;
  motivo: string | null;
  saiuEm: string | null;
  desfecho: "concluida" | "encerrada" | "outra_equipe" | "devolvida";
};

/**
 * Teto de ids por pergunta, igual ao do servidor.
 *
 * O `reconciliacaoSchema` da rota recusa mais que isto, e recusar vira erro
 * 422 que derrubaria a reconciliação inteira do aparelho que ficou muito tempo
 * fora, que é exatamente o aparelho que mais precisa dela.
 */
export const TETO_DE_RECONCILIACAO = 200;

/**
 * Por que a tarefa sumiu da lista.
 *
 * A rota existe desde o turno anterior, com teste, e NINGUÉM a chamava: o
 * único vestígio dela no aplicativo era um comentário. Enquanto isso o agente
 * continuava vendo tarefa desaparecer sem explicação, e as lápides de coleta
 * (`coletas`) nunca eram apagadas, porque é a confirmação do servidor que as
 * apaga. Sem esta chamada, aquela tabela cresce por todo o tempo de vida do
 * aparelho e a defesa contra vistoria duplicada nunca solta a ocorrência.
 *
 * Teto de conforto no tempo, e não o de envio: fracassar aqui não perde
 * trabalho nenhum, só adia a explicação até a próxima atualização.
 */
export async function reconciliarPendencias(
  token: string,
  conhecidas: readonly string[],
): Promise<SaidaDeLista[]> {
  if (conhecidas.length === 0) return [];
  const r = await chamar<{ saidas: SaidaDeLista[] }>("/sincronizacao/pendencias/reconciliar", {
    token,
    metodo: "POST",
    corpo: { conhecidas: conhecidas.slice(0, TETO_DE_RECONCILIACAO) },
    tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
  return r.saidas;
}

export type Colega = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
};

export type Equipe = {
  id: string;
  nome: string;
  especialidade: string | null;
  ativa: boolean;
};

export type VistoriaConcluida = {
  id: string;
  ocorrencia_id: string;
  protocolo: string;
  tipo: TipoCobrade;
  severidade: Severidade | null;
  status: string;
  endereco: string;
  coletada_em: string;
  sincronizada_em: string;
};

export type MeuTrabalho = {
  equipe: Equipe | null;
  colegas: Colega[];
  concluidas: VistoriaConcluida[];
};

/**
 * Quem é a minha equipe, e o que eu já concluí.
 *
 * Esta rota existia na API desde que o painel do coordenador ganhou a tela
 * "Meu trabalho", e o aplicativo nunca a chamou. O agente via a lista do que
 * falta fazer e nada do resto: não sabia de que equipe fazia parte, quem eram
 * os colegas, nem o que ele mesmo já tinha entregado.
 *
 * De propósito, o aplicativo consome só `equipe`, `colegas` e `concluidas`. O
 * campo `designadas` que a rota também devolve fica de fora, e a razão é dura:
 * ele vem da REDE, enquanto a lista de tarefas do aplicativo vem do DISCO. Se
 * a tela de equipe mostrasse tarefas da rede, o agente veria ali uma vistoria
 * que a tela de tarefas não abre sem sinal. Duas listas com o mesmo nome e
 * conteúdos diferentes é como se destrói a confiança num aplicativo de campo.
 */
export async function baixarMeuTrabalho(token: string): Promise<MeuTrabalho> {
  // Teto curto, e a razão está em `TEMPO_LIMITE_CONFORTO_MS`: esta é a única
  // chamada do aplicativo que o agente espera olhando para uma tela parada,
  // e é a única cujo fracasso não custa nada além de mostrar a cópia antiga.
  return chamar<MeuTrabalho>("/campo/meu-trabalho", {
    token, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}
