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

const TEMPO_LIMITE_MS = 20_000;

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; token?: string | null } = {},
): Promise<T> {
  if (!BASE) {
    throw new Error(
      "Endereço da API não configurado neste aplicativo. " +
      "Ele é definido no momento da compilação, em app.config.ts.",
    );
  }

  const cancelador = new AbortController();
  const relogio = setTimeout(() => cancelador.abort(), TEMPO_LIMITE_MS);

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
      id: string; nome: string; papel: Papel;
      organizacaoNome: string; municipio: string; uf: string;
    };
  }>("/auth/entrar", { metodo: "POST", corpo: { email, senha } });

  return {
    credenciais: { acesso: r.acesso, renovacao: r.renovacao },
    identidade: {
      usuarioId: r.usuario.id,
      nome: r.usuario.nome,
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
  latitude: number | null;
  longitude: number | null;
  descricao: string;
  solicitante_nome: string;
  solicitante_contato: string | null;
  vulnerabilidade_presente: boolean;
  vulnerabilidade_descricao: string | null;
  prazo_em: string | null;
};

/**
 * As ocorrências despachadas para a equipe do agente.
 *
 * É esta chamada que precisa acontecer ANTES de subir o morro. O que ela
 * trouxer fica guardado no aparelho; o que ela não trouxer não existe lá em
 * cima, e por isso a tela insiste tanto em sincronizar antes de sair.
 */
export async function baixarPendencias(token: string): Promise<Pendencia[]> {
  const r = await chamar<{ itens: Pendencia[] }>("/sincronizacao/pendencias", { token });
  return r.itens;
}
