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
    /*
      Pelo CÓDIGO, e antes de todo status: a suspensão chega como 403 na
      entrada e como 503 nas rotas da fila, e nos dois casos a pessoa que
      resolve é a mesma. Sem isto, o 403 caía na frase do perfil ("fale com a
      coordenação para ajustar o seu cadastro"), que manda duas pessoas
      procurarem um defeito de cadastro que não existe.
    */
    if (this.codigo === "acesso_suspenso") {
      return (
        "O acesso da sua prefeitura ao sistema foi suspenso pelo fornecedor. "
        + "Tentar entrar outra vez não resolve: procure quem administra o contrato "
        + "na prefeitura. O que você já coletou continua guardado no aparelho."
      );
    }
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
  /**
   * O município da sessão, e ele NÃO é para a tela: nenhuma tela mostra UUID.
   *
   * Ele existe porque é a terceira barreira contra o aviso de push de outro
   * município (ver `push/aviso.ts`). A ficha de push é única por APARELHO
   * FÍSICO e a unicidade no banco é por município, então a mesma ficha pode
   * ficar viva em duas prefeituras e um aviso da A pode alcançar um aparelho
   * logado na B. Comparar este campo com o `organizacaoId` do aviso é o que
   * fecha esse buraco, e sem ele o aplicativo não tem como fazer a comparação.
   *
   * Vem do token verificado no servidor, via resposta de `/auth/entrar`, e de
   * lugar nenhum mais.
   */
  organizacaoId: string;
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
      organizacaoId: string;
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
      organizacaoId: r.usuario.organizacaoId,
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

/**
 * Revoga no servidor. Esquecer o token só do lado de cá deixaria a sessão viva.
 *
 * A FICHA VAI JUNTO, e mandá-la é obrigação do aplicativo, não gentileza. A
 * rota `/auth/sair` cala a notificação daquele telefone quando recebe a ficha,
 * e não tem como descobri-la sozinha: ela conhece a sessão, e a sessão não sabe
 * de qual dos aparelhos daquela pessoa o pedido está vindo.
 *
 * Sem isto, o aparelho de quem saiu continua recebendo tarefa de uma equipe da
 * qual ele não faz mais parte. Num telefone de plantão que passa de turno em
 * turno, isso é vazamento de dado operacional: o agente do turno da noite
 * recebe, na tela bloqueada, o aviso de prazo da equipe do turno da manhã.
 *
 * Ela é opcional no tipo porque o aparelho pode legitimamente não ter ficha
 * (permissão negada, build sem push). Nesse caso não há o que calar.
 */
export async function sair(renovacao: string, ficha?: string | null): Promise<void> {
  await chamar("/auth/sair", {
    metodo: "POST",
    corpo: ficha ? { renovacao, ficha } : { renovacao },
  }).catch(() => undefined);
}

/* ========================================================================
   O aparelho que recebe notificação
   ======================================================================== */

export type PlataformaDoAparelho = "ios" | "android";

/**
 * Registra, ou atualiza, a ficha de push deste aparelho.
 *
 * Reenviar a mesma ficha ATUALIZA e não duplica (a rota tem `ON CONFLICT`), e é
 * por isso que o aplicativo pode chamar isto a cada entrada sem medo: é assim
 * que ele descobre que a ficha mudou, e é assim que o telefone de plantão que
 * trocou de mão passa a receber a tarefa da equipe de quem está com ele agora.
 *
 * O município e o usuário NÃO viajam aqui. Eles saem do token verificado, no
 * servidor. Mandar qualquer um dos dois no corpo seria oferecer ao aplicativo
 * um jeito de registrar aparelho no nome de outra pessoa.
 */
export async function registrarAparelho(
  token: string,
  plataforma: PlataformaDoAparelho,
  ficha: string,
): Promise<void> {
  // Teto de conforto: falhar aqui não perde trabalho nenhum, só adia o aviso
  // até a próxima entrada. Ver `TEMPO_LIMITE_CONFORTO_MS`.
  await chamar<{ id: string; registrado: boolean }>("/aparelhos", {
    token, metodo: "POST", corpo: { plataforma, ficha },
    tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}

/**
 * Para de receber neste aparelho, sem encerrar a sessão.
 *
 * Serve ao caso em que a pessoa desliga os avisos por escolha, e não por sair
 * da conta. Responde 204 mesmo quando não havia nada registrado, de propósito:
 * ver o comentário da rota.
 */
export async function revogarAparelho(token: string, ficha: string): Promise<void> {
  await chamar("/aparelhos/revogar", {
    token, metodo: "POST", corpo: { ficha },
    tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
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
 * Um órgão do catálogo do município, como ele desce para o aparelho.
 *
 * Enxuto de propósito: a tela de vistoria precisa mostrar o nome e devolver o
 * id, e mais nada. O email e o telefone do órgão ficam no servidor, que é quem
 * emite ofício, e trazê-los para cá espalharia contato oficial por dezenas de
 * aparelhos que passam de turno em turno sem nenhuma serventia em campo.
 */
export type OrgaoDoCatalogo = {
  id: string;
  nome: string;
  sigla: string | null;
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
  /**
   * O catálogo de órgãos do município, ou `null` quando o servidor não disse.
   *
   * `null` e lista vazia são coisas DIFERENTES, e confundir as duas apaga
   * cadastro bom. `null` é servidor que ainda não manda o campo: o aparelho
   * mantém o catálogo que já tem. Lista vazia é o município dizendo que não
   * cadastrou órgão nenhum, e aí o disco passa a refletir isso.
   *
   * Sem a distinção, toda sincronização contra um servidor antigo apagaria o
   * catálogo do aparelho, e o agente perderia a lista justamente por ter
   * sincronizado, que é o oposto do que sincronizar significa.
   */
  orgaos: OrgaoDoCatalogo[] | null;
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
  const r = await chamar<{
    itens: Pendencia[]; teto?: number; truncada?: boolean;
    orgaos?: OrgaoDoCatalogo[];
  }>("/sincronizacao/pendencias", { token });
  return {
    itens: r.itens,
    teto: r.teto ?? r.itens.length,
    truncada: r.truncada ?? false,
    /*
      O catálogo viaja JUNTO com as tarefas, e não numa chamada própria.

      Uma segunda chamada teria uma segunda chance de falhar, e ela falharia
      exatamente onde não pode: o aparelho que baixou a lista de manhã e não
      baixou o catálogo sobe o morro com um item obrigatório do checklist sem
      resposta possível. Na mesma resposta, ou vêm os dois, ou não veio nada e o
      disco continua como estava.
    */
    orgaos: r.orgaos ?? null,
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
  /**
   * A URL ASSINADA da foto de perfil, ou nula quando o colega não tem foto.
   *
   * Assinada e curta (minutos), como toda leitura de arquivo deste produto: a
   * cópia de "meu trabalho" que fica no disco carrega URLs que já venceram, e
   * o `Avatar` cai nas iniciais quando a imagem não carrega. É o preço de
   * nunca existir link público para o rosto de um servidor.
   */
  fotoUrl: string | null;
  /**
   * Tem saída a campo ABERTA agora, declarada por ele com sinal.
   *
   * É o que a coordenação vê em `GET /saida-a-campo`, reduzido ao booleano
   * dos colegas da própria equipe: quem está no morro, e nada sobre prazo,
   * protocolo ou "sozinho". Verdadeiro na cópia do disco quer dizer "estava
   * quando este aparelho baixou", e o rodapé da tela diz quando foi.
   */
  emCampo: boolean;
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
  /**
   * A precisão do GPS no momento da coleta, em metros.
   *
   * O SQL da rota já trazia esta coluna e o tipo daqui não a declarava, então
   * ela chegava no aparelho e era descartada na fronteira do TypeScript. Ela
   * importa porque é o que separa "o ponto é este" de "o ponto é por aqui": uma
   * vistoria coletada com 40 metros de erro embaixo de um talude é prova de
   * presença, não de localização, e quem precisa saber disso é o agente que vai
   * defender o próprio laudo.
   *
   * Nula quando o aparelho não soube dizer, que acontece de verdade em encosta
   * fechada.
   */
  gps_precisao_metros: number | null;
  /**
   * Quem assinou no local, pelo nome.
   *
   * Mesma história da precisão: o SQL trazia, o tipo não declarava. É o que
   * responde "quem estava na porta quando eu vistoriei aquela casa", meses
   * depois, e é o nome que sai impresso no laudo ao lado do traço.
   *
   * Nula quando a vistoria foi concluída sem assinatura, que o produto permite
   * (morador ausente, recusa de assinar).
   */
  assinante_nome: string | null;
  /**
   * Quando a coordenação despachou a ocorrência para a equipe, pela trilha.
   *
   * É o que permite à tela dizer "tempo médio entre o despacho e a vistoria"
   * sem rota nova. Nula quando a trilha não tem despacho anterior à coleta, e
   * ausente na cópia de disco gravada por versão anterior: os dois casos
   * ficam de fora da média em vez de puxá-la para lugar nenhum.
   */
  despachada_em?: string | null;
};

export type MeuTrabalho = {
  equipe: Equipe | null;
  colegas: Colega[];
  concluidas: VistoriaConcluida[];
  /**
   * Quantas vistorias este agente assinou, ao todo. NÃO é o tamanho da lista.
   *
   * O servidor manda este número desde que a rota foi escrita, com o defeito
   * dele documentado em detalhe em `apps/api/src/rotas/campo.ts`, e este tipo
   * não o declarava: a tela imprimia o tamanho da lista como se fosse a
   * contagem. **O agente que assinou 62 vistorias lia "50"**, e as doze mais
   * antigas não apareciam em lugar nenhum, sem rodapé, sem aviso e sem "ver
   * mais". Se ele precisasse mostrar que vistoriou aquele imóvel em janeiro, a
   * tela AFIRMAVA que ele nunca vistoriou.
   *
   * É o registro do trabalho dele, e é o que ele leva quando o ato for
   * questionado. Contar errado ali não é detalhe de interface.
   */
  totalConcluidas: number;
  /** Quantas cabem numa resposta, para a tela poder DIZER que cortou. */
  tetoDeConcluidas: number;
  /**
   * Quantas tarefas este agente devolveu nos últimos trinta dias.
   *
   * Contado no servidor, e não no aparelho: o aparelho só guarda a devolução
   * enquanto ela espera envio, e confirmada ela sai da fila. Um número contado
   * aqui seria quase sempre zero, e zero mentiroso é pior que número nenhum.
   */
  devolvidasNoMes: number;
};

/**
 * O envelope de "meu trabalho" com os campos que podem faltar já resolvidos.
 *
 * Existe porque o mesmo objeto chega por DOIS caminhos, e um deles é velho: a
 * rede (que hoje manda tudo) e o disco do aparelho (que pode ter sido gravado
 * por uma versão anterior deste aplicativo, quando os dois números nem eram
 * lidos). Sem normalizar os dois caminhos, o tipo prometeria `number` e a tela
 * receberia `undefined` do disco, imprimindo "NaN" ou nada para quem abriu o
 * aplicativo sem sinal, que é o caso em que ele mais precisa funcionar.
 *
 * Fica exportada, e não escondida dentro de `baixarMeuTrabalho`, exatamente
 * para a leitura do disco poder chamar a MESMA função. Duas normalizações
 * seriam duas regras, e a segunda não recebe o campo novo.
 *
 * O padrão de `totalConcluidas` é o tamanho da lista: servidor antigo, que
 * ainda não manda o campo, volta a se comportar como antes em vez de fazer a
 * tela mentir para o outro lado.
 *
 * **Resíduo declarado, e ele é do SERVIDOR:** o ramo "agente sem equipe" da
 * rota devolve `concluidas: []` e não devolve os dois números. Um agente
 * retirado da equipe depois de assinar vistoria vê zero aqui. A correção é do
 * lado de lá e está nomeada em `apps/campo/PENDENCIAS.md`.
 */
export function normalizarMeuTrabalho(bruto: {
  equipe: Equipe | null;
  colegas?: Array<Omit<Colega, "fotoUrl" | "emCampo"> & Partial<Pick<Colega, "fotoUrl" | "emCampo">>>;
  concluidas?: VistoriaConcluida[];
  totalConcluidas?: number;
  tetoDeConcluidas?: number;
  devolvidasNoMes?: number;
}): MeuTrabalho {
  const concluidas = bruto.concluidas ?? [];
  return {
    equipe: bruto.equipe,
    /*
      Foto e saída a campo chegaram depois: cópia de disco antiga e servidor
      antigo mandam o colega sem os dois, e a tela precisa de valor, não de
      `undefined`. Sem foto vira iniciais; sem saída vira "não está em campo",
      que é o único palpite honesto para um dado que não veio.
    */
    colegas: (bruto.colegas ?? []).map((c) => ({
      ...c, fotoUrl: c.fotoUrl ?? null, emCampo: c.emCampo ?? false,
    })),
    concluidas,
    totalConcluidas: bruto.totalConcluidas ?? concluidas.length,
    tetoDeConcluidas: bruto.tetoDeConcluidas ?? concluidas.length,
    devolvidasNoMes: bruto.devolvidasNoMes ?? 0,
  };
}

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
  const bruto = await chamar<Parameters<typeof normalizarMeuTrabalho>[0]>(
    "/campo/meu-trabalho",
    { token, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS },
  );
  return normalizarMeuTrabalho(bruto);
}

/* ========================================================================
   Quem sou eu, e a foto que eu mesmo escolhi
   ======================================================================== */

/**
 * O que `GET /usuarios/eu` devolve: o cadastro, e não o token.
 *
 * `fotoUrl` é assinada e vence em minutos, então ela não se guarda: quem quer
 * a foto no disco baixa os bytes na hora (ver `dados/foto-do-agente.ts`).
 */
export type QuemSouEu = {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  papel: Papel;
  fotoUrl: string | null;
};

export async function quemSouEu(token: string): Promise<QuemSouEu> {
  return chamar<QuemSouEu>("/usuarios/eu", { token, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS });
}

/** A autorização de envio da foto de perfil: onde e como subir os bytes. */
export type AutorizacaoDaFoto = {
  chave: string;
  url: string;
  cabecalhos: Record<string, string>;
  expiraEm: string;
};

/**
 * Pede ao servidor onde gravar a foto. O servidor decide a chave, sob o
 * prefixo do município e do próprio usuário, e o aplicativo nunca a propõe.
 */
export async function autorizarEnvioDaFoto(
  token: string,
  foto: { tipoConteudo: string; tamanhoBytes: number },
): Promise<AutorizacaoDaFoto> {
  return chamar<AutorizacaoDaFoto>("/usuarios/eu/foto/autorizar-envio", {
    token, metodo: "POST", corpo: foto, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}

/**
 * Confirma que a foto subiu. O servidor confere que o objeto existe sob a
 * chave dele, grava, e apaga a anterior. Devolve a URL assinada da nova.
 */
export async function confirmarFoto(token: string, chave: string): Promise<{ fotoUrl: string }> {
  return chamar<{ fotoUrl: string }>("/usuarios/eu/foto", {
    token, metodo: "PUT", corpo: { chave }, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}

/** Tira a foto de perfil. Responde 204 mesmo sem foto: remover o nada é o resultado pedido. */
export async function removerFoto(token: string): Promise<void> {
  await chamar("/usuarios/eu/foto", {
    token, metodo: "DELETE", tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}

/* ========================================================================
   O sino: o que aconteceu no município, quando o push não alcança
   ======================================================================== */

/**
 * Um aviso, como ele desce para o aparelho.
 *
 * O que ele NÃO carrega é a parte que importa, e está escrito na própria rota:
 * nome, contato, endereço, relato e descrição de vulnerabilidade não passam por
 * ali. O aviso é tipo, protocolo, instante e um complemento curto, e leva a
 * pessoa até a ocorrência, onde as permissões de verdade valem.
 */
export type AvisoDoCampo = {
  id: string;
  tipo: string;
  ocorrenciaId: string;
  protocolo: string;
  criadoEm: string;
  detalhe: string | null;
  lido: boolean;
};

/**
 * O cursor do sino, e ele é um PAR.
 *
 * Nunca é o aplicativo que monta este valor: ele é o eco exato do que a
 * resposta anterior devolveu em `ate` e `ateId`. A razão está escrita na rota,
 * e ela tem duas metades:
 *
 * 1. **O instante sai do banco.** O relógio do aparelho do agente não é o
 *    relógio do servidor. Adiantado, a primeira pergunta já viria de um
 *    instante no futuro e tudo que acontecesse até o servidor alcançá-lo cairia
 *    fora da janela para sempre.
 * 2. **O id acompanha o instante, e não é enfeite.** Uma sincronização grava
 *    várias vistorias na MESMA transação, e todas recebem o mesmo `now()`: o
 *    empate de instante aqui é rotina, não exceção. A consulta do servidor
 *    continua em `criado_em > desde OR (criado_em = desde AND id > desdeId)`;
 *    com o instante sozinho, um corte no meio de um empate deixaria os
 *    empatados restantes atrás do cursor, e eles não voltariam em pergunta
 *    nenhuma.
 *
 * `desdeId` é nulo quando o servidor não cortou a resposta: ali o cursor é o
 * relógio dele, e não há empate a desfazer.
 */
export type CursorDeAvisos = { desde: string; desdeId: string | null } | null;

export type RespostaDeAvisos = {
  /** O valor a ecoar em `desde` na próxima pergunta, sem alteração nenhuma. */
  ate: string;
  /** O companheiro de `ate`, preenchido só quando a resposta foi cortada. */
  ateId: string | null;
  itens: AvisoDoCampo[];
  teto: number;
  /** Há mais para buscar, e o cursor aponta para exatamente onde continuar. */
  truncada: boolean;
  naoLidos: number;
  /** A contagem bateu no teto do servidor: o número é um piso, não o total. */
  naoLidosTruncado: boolean;
};

/**
 * O que aconteceu no município desde a última pergunta.
 *
 * **A rota foi escrita SEM `exigirPermissao`, expressamente para o agente de
 * campo poder usá-la**, e o aplicativo nunca a chamou. O comentário dela diz
 * por quê: não existe ação no pacote compartilhado que descreva "receber
 * aviso", e emprestar uma (`consultar_trilha`, digamos) deixaria operador e
 * agente de campo sem sino nenhum sem que ninguém tivesse decidido isso.
 *
 * É o único canal que funciona quando o push não alcança, e o push hoje manda
 * dois tipos de aviso (`tarefa_nova` e `prazo_vencendo`) contra os quatro que
 * o sino carrega.
 *
 * Teto de conforto no tempo: falhar aqui não perde trabalho nenhum, e o agente
 * costuma estar olhando para a tela quando acontece.
 */
export async function baixarAvisos(
  token: string,
  cursor: CursorDeAvisos,
): Promise<RespostaDeAvisos> {
  /*
    A consulta é montada à mão, e não com `URLSearchParams`.

    O React Native traz um polyfill PARCIAL de `URL`, em que vários métodos de
    `URLSearchParams` estouram com "not implemented" no aparelho e funcionam no
    ambiente de teste, que roda sobre o Node. Um defeito que só aparece no
    telefone é exatamente o que este produto não pode ter no único canal que
    funciona quando o push não alcança.
  */
  const partes: string[] = [];
  if (cursor) {
    partes.push(`desde=${encodeURIComponent(cursor.desde)}`);
    /*
      O id só vai quando existe, e nunca como texto vazio: o esquema da rota
      pede um UUID, e uma cadeia vazia reprovaria a consulta inteira com 422.
      Sem o par completo o servidor não tem como desfazer o empate, então
      omitir aqui é omitir de propósito, no único caso em que não há empate.
    */
    if (cursor.desdeId) partes.push(`desdeId=${encodeURIComponent(cursor.desdeId)}`);
  }
  const consulta = partes.join("&");
  return chamar<RespostaDeAvisos>(`/avisos${consulta ? `?${consulta}` : ""}`, {
    token, tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}

/**
 * Marca como lidos os avisos que esta pessoa recebeu.
 *
 * A lista é de identificadores, e não um marco de tempo, e a ausência é
 * decisão do servidor: com um marco, um toque em "limpar" apagaria também o
 * que o teto cortou e ninguém viu. Só some do sino o que passou pelos olhos de
 * alguém.
 */
export async function marcarAvisosLidos(
  token: string,
  ids: readonly string[],
): Promise<{ marcados: number }> {
  return chamar<{ marcados: number }>("/avisos/lidos", {
    token, metodo: "POST", corpo: { ids: [...ids] },
    tempoLimiteMs: TEMPO_LIMITE_CONFORTO_MS,
  });
}
