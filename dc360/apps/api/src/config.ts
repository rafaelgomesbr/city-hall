import { z } from "zod";

/**
 * Configuração vem do ambiente e é validada na partida.
 *
 * Falhar no boot quando falta segredo é deliberado: um servidor que sobe com
 * chave padrão é pior que um servidor que não sobe, porque parece funcionar.
 */
/**
 * Trata variável vazia como variável ausente, nos campos opcionais.
 *
 * `VAR=` num arquivo .env não apaga a variável: ela chega como string vazia.
 * Sem isto, seguir o `.env.example` ao pé da letra (ele manda DEIXAR VAZIO o
 * NOTIFICADOR_ARQUIVO) derruba a partida com "String must contain at least 1
 * character", que não diz a ninguém o que fazer. O defeito nunca apareceu
 * porque no compose e na PaaS a variável não existe, em vez de existir vazia.
 *
 * Só vale onde ausente e vazio querem dizer a mesma coisa. NÃO se aplica ao
 * MARCA_DAGUA, onde apagar o valor é um ato deliberado que desliga o carimbo,
 * e virar "ausente" traria o carimbo de volta em silêncio.
 */
function vazioEhAusente<T extends z.ZodTypeAny>(esquema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), esquema);
}

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().default("127.0.0.1"),

  /** Ausente em desenvolvimento e em teste: aí o banco sobe em WebAssembly. */
  DATABASE_URL: vazioEhAusente(z.string().url().optional()),

  /**
   * Carimbo impresso em todo documento oficial.
   *
   * O padrão MARCA, e desmarcar exige ato deliberado: `MARCA_DAGUA=` vazio.
   * A regra já foi o contrário, ligada ao ambiente, e o contrário estava
   * errado de um jeito específico: `NODE_ENV === "production" ? undefined :
   * "DOCUMENTO DE VALIDAÇÃO"` desligava o carimbo exatamente no ambiente onde
   * o piloto roda. Ou seja, durante toda a validação com município real, o
   * laudo de teste saía indistinguível de um laudo verdadeiro, e não havia
   * variável nenhuma para corrigir isso.
   *
   * Um documento a mais com carimbo é um constrangimento. Um documento a menos
   * é uma peça anexada a processo por engano.
   */
  MARCA_DAGUA: z.string().default("DOCUMENTO DE VALIDAÇÃO"),

  /**
   * Para onde sai o link de redefinição de senha.
   *
   * Vazias, o servidor cai no notificador que só anuncia no log. Isso é
   * aceitável em desenvolvimento e inaceitável em produção, e a checagem lá
   * embaixo recusa subir sem elas: até aqui, produção escrevia o link de uso
   * único em `console.log`, por fora do `redact`, e a rota respondia
   * "enviamos o link" sem enviar nada.
   */
  NOTIFICADOR_URL: vazioEhAusente(z.string().url().optional()),
  NOTIFICADOR_CHAVE: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Canal de teste: grava a mensagem inteira, com o link, neste arquivo.
   *
   * Só existe para a suíte de ponta a ponta contra a API conseguir conferir a
   * recuperação de senha sem que o link volte a sair no log do servidor. A
   * checagem lá embaixo DERRUBA A PARTIDA se isto vier preenchido em produção:
   * um arquivo com link de redefinição de qualquer conta é credencial em texto
   * puro esperando para ser lida.
   */
  NOTIFICADOR_ARQUIVO: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Desliga a recuperação de senha por email, de propósito.
   *
   * Enquanto não houver provedor, isto é mais honesto que uma tela que promete
   * um email que não sai: a rota recusa e manda procurar quem administra o
   * município, que consegue redefinir a senha de qualquer jeito. Precisa ser
   * declarado, porque produção não sobe com a recuperação nem ligada sem
   * destino nem desligada sem alguém ter decidido.
   */
  RECUPERACAO_ATIVA: z.enum(["sim", "nao"]).default("sim"),

  /**
   * Liga o envio de email de verdade, e é a mesma classe de decisão do
   * `PUSH_ATIVO`: desligado por padrão, e ligar é ato deliberado.
   *
   * O buraco que ele fecha é específico. `NOTIFICADOR_URL` e
   * `NOTIFICADOR_CHAVE` existem desde a migração da recuperação de senha, a
   * partida em produção RECUSA subir sem elas com a recuperação ligada, e
   * NENHUM código jamais as leu: não havia cliente HTTP. O servidor conferia a
   * configuração de um provedor com o qual nunca falava, e a mensagem ia para
   * o `notificadorDeLog`. Por isso a recuperação está em `nao` na produção de
   * hoje: não por decisão de produto, por falta de cliente.
   *
   * Com `nao`, a rota que dependeria de email RECUSA dizendo que o recurso
   * está desligado, em vez de responder que mandou. Prometer email que não sai
   * foi um defeito real deste produto, confirmado contra a produção, e é o
   * defeito que esta variável existe para não repetir no ofício.
   */
  EMAIL_ATIVO: z.enum(["sim", "nao"]).default("nao"),

  /**
   * Remetente que o provedor deve usar, quando ele exige um.
   *
   * Opcional porque provedor nenhum é igual: alguns amarram o remetente à
   * chave e recusam receber outro. Fica aqui, e não fixo no código, porque o
   * endereço tem que ser de um domínio que a prefeitura controla, senão a
   * mensagem cai em spam ou é recusada na entrada do órgão destinatário.
   */
  EMAIL_REMETENTE: vazioEhAusente(z.string().email().optional()),

  /**
   * Por quantas horas vale o link de uso único do ofício.
   *
   * Setenta e duas horas por padrão: um ofício enviado na sexta à noite
   * precisa continuar abrindo na segunda de manhã. Menos que isso transforma
   * fim de semana em link morto, e a recepção do órgão liga pedindo reenvio.
   * O teto de trinta dias existe porque link de uso único que vive um semestre
   * é, na prática, link permanente.
   */
  OFICIO_LINK_HORAS: z.coerce.number().int().min(1).max(720).default(72),

  /**
   * Quantas vezes o mesmo ofício pode ser enviado, contando a primeira vez.
   *
   * O teto existe porque cada envio cria um link de uso único novo para o
   * mesmo dossiê. Sem teto, um botão de "reenviar" clicado em série espalha
   * dezenas de endereços vivos para o mesmo conteúdo, e basta um deles vazar.
   * Três cobre o caso real (foi para a caixa de spam, a pessoa mudou de setor)
   * sem virar torneira aberta. O banco guarda um teto absoluto de vinte, que
   * vale mesmo se esta regra sumir.
   */
  OFICIO_MAX_ENVIOS: z.coerce.number().int().min(1).max(20).default(3),

  /**
   * Chave de assinatura dos tokens de acesso. Mínimo de 32 bytes de entropia.
   * Em produção é obrigatória; sem ela o processo não sobe.
   */
  JWT_SEGREDO: vazioEhAusente(z.string().min(32).optional()),

  /**
   * Desliga a notificação por push, de propósito, e é a mesma classe de
   * decisão do `RECUPERACAO_ATIVA` acima.
   *
   * Enquanto a metade aplicativo não existir, ligar isto seria montar um
   * varredor que manda notificação para lugar nenhum e uma rota de registro
   * que aceita ficha de aparelho que nunca vai receber nada. Com `nao`, o
   * varredor NÃO SOBE e as rotas de aparelho recusam dizendo isso.
   *
   * Precisa ser declarado porque as duas metades sobem em turnos diferentes:
   * o dia em que o aplicativo passar a registrar aparelho é o dia em que
   * alguém troca isto para `sim`, e não um dia antes.
   */
  PUSH_ATIVO: z.enum(["sim", "nao"]).default("nao"),

  /**
   * Quantos minutos antes de o prazo vencer o aviso sai.
   *
   * Uma hora por padrão: tempo de o agente sair de onde está e chegar. Menos
   * que isso vira aviso que chega junto com o vencimento, que não serve para
   * agir; muito mais vira aviso que a pessoa esquece antes da hora.
   */
  PUSH_JANELA_MINUTOS: z.coerce.number().int().min(5).max(1440).default(60),

  /**
   * Credenciais de envio DIRETO para a Apple e para o Google.
   *
   * O serviço de push da Expo foi recusado pelo dono do produto em 09/09/2026:
   * a instalação é nativa e não fazia sentido o servidor depender de um
   * terceiro que a instalação não usa. O ganho é concreto para o laudo de
   * proteção de dados, porque a ficha do aparelho e o texto da notificação
   * deixam de passar por mais um servidor estrangeiro.
   *
   * `APNS_CHAVE` é o CAMINHO do arquivo `.p8`, e o arquivo nunca entra no
   * repositório. O conteúdo dele é lido uma vez, na partida, e vive só na
   * memória do processo: ele assina notificação para QUALQUER aplicativo do
   * time, então quem o obtém escreve na tela bloqueada de um agente de Defesa
   * Civil, e uma ordem falsa de evacuação escrita ali é dano na rua.
   */
  APNS_KEY_ID: vazioEhAusente(z.string().min(1).optional()),
  APNS_TEAM_ID: vazioEhAusente(z.string().min(1).optional()),
  APNS_CHAVE: vazioEhAusente(z.string().min(1).optional()),
  APNS_BUNDLE: vazioEhAusente(z.string().min(1).optional()),
  /** Caminho do JSON da conta de serviço do Firebase. Só o Android usa. */
  FCM_CONTA_SERVICO: vazioEhAusente(z.string().min(1).optional()),

  /** Origens permitidas, separadas por vírgula. Em produção não pode ser "*". */
  ORIGENS_PERMITIDAS: z.string().default("http://localhost:5173"),

  ACESSO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
  RENOVACAO_DIAS: z.coerce.number().int().min(1).max(90).default(14),
  MAX_FALHAS_LOGIN: z.coerce.number().int().min(3).max(20).default(5),
  BLOQUEIO_MINUTOS: z.coerce.number().int().min(1).max(1440).default(15),
  /** Tentativas de login por endereço, na janela de 5 minutos. */
  LOGIN_POR_IP: z.coerce.number().int().min(1).max(10_000).default(10),

  /**
   * Armazenamento de evidência. Ausentes em desenvolvimento: aí a própria API
   * guarda os bytes em memória, com URL assinada e expirando do mesmo jeito.
   */
  S3_ENDPOINT: vazioEhAusente(z.string().url().optional()),
  S3_BALDE: vazioEhAusente(z.string().min(1).optional()),
  S3_REGIAO: z.string().min(1).default("auto"),
  S3_CHAVE_ID: vazioEhAusente(z.string().min(1).optional()),
  S3_CHAVE_SECRETA: vazioEhAusente(z.string().min(1).optional()),
  /** Endereço público desta API, para montar a URL do armazenamento local. */
  URL_PUBLICA: z.string().url().default("http://127.0.0.1:3333"),
  /** Endereço público do painel, para montar o link de redefinição de senha. */
  URL_PAINEL: z.string().url().default("http://localhost:5173"),
  RECUPERACAO_MINUTOS: z.coerce.number().int().min(5).max(120).default(30),
});

export type Config = z.infer<typeof esquema> & {
  jwtSegredo: Uint8Array;
  origens: string[];
};

export function carregarConfig(ambiente: NodeJS.ProcessEnv = process.env): Config {
  const analisado = esquema.safeParse(ambiente);
  if (!analisado.success) {
    const problemas = analisado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuração inválida: ${problemas}`);
  }
  const c = analisado.data;

  /*
    Push ligado exige credencial de verdade, e a checagem vale em TODO
    ambiente, não só em produção.

    A razão é a mesma que derrubou a recuperação de senha ligada sem destino: o
    servidor sobe, o aplicativo registra o aparelho, o varredor roda, e nada
    chega a lugar nenhum. Ninguém percebe pelo lado de cá, porque a única
    evidência de sucesso é uma notificação aparecendo num telefone que está no
    bolso de outra pessoa.

    Fora de produção a checagem serve a outra coisa: quem ligar o push na
    própria máquina para experimentar descobre na hora que falta credencial,
    em vez de descobrir depois de meia hora achando que o varredor está mudo
    por outro motivo.

    O Google fica de fora da exigência de propósito: a instalação de hoje é o
    aplicativo do iPhone, e exigir a conta de serviço do Firebase impediria o
    piloto de subir por causa de uma plataforma que ainda não existe. O que
    fecha esse buraco é a rota de registro, que recusa aparelho Android
    enquanto `FCM_CONTA_SERVICO` estiver ausente, em vez de aceitar a ficha e
    guardar um aparelho que nunca receberia nada.
  */
  if (c.PUSH_ATIVO === "sim") {
    const faltando = (
      [
        ["APNS_KEY_ID", c.APNS_KEY_ID],
        ["APNS_TEAM_ID", c.APNS_TEAM_ID],
        ["APNS_CHAVE", c.APNS_CHAVE],
        ["APNS_BUNDLE", c.APNS_BUNDLE],
      ] as const
    ).filter(([, valor]) => !valor).map(([nome]) => nome);

    if (faltando.length > 0) {
      throw new Error(
        `A notificação por push está ligada e não tem como assinar o envio: falta ${faltando.join(", ")}. ` +
        "Preencha, ou desligue com PUSH_ATIVO=nao. Sem isso o servidor sobe, o " +
        "aplicativo registra o aparelho, o varredor roda e nenhuma notificação " +
        "chega, e o único lugar onde isso apareceria é o telefone que está no " +
        "bolso de outra pessoa.",
      );
    }
  }

  /*
    Email ligado exige destino de verdade, e a checagem vale em TODO ambiente,
    pelo mesmo motivo do `PUSH_ATIVO` acima.

    Quem liga o envio na própria máquina para experimentar descobre na hora que
    falta o endereço do provedor, em vez de descobrir depois de meia hora
    achando que o ofício não chegou por outro motivo.
  */
  if (c.EMAIL_ATIVO === "sim" && (!c.NOTIFICADOR_URL || !c.NOTIFICADOR_CHAVE)) {
    throw new Error(
      "O envio de email está ligado e não tem para onde mandar: defina "
      + "NOTIFICADOR_URL e NOTIFICADOR_CHAVE, ou desligue com EMAIL_ATIVO=nao. "
      + "Sem isso o servidor sobe, a rota responde que enviou, e nenhuma "
      + "mensagem sai deste processo.",
    );
  }

  if (c.NODE_ENV === "production") {
    if (!c.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória em produção");
    if (!c.JWT_SEGREDO) throw new Error("JWT_SEGREDO é obrigatória em produção");
    if (c.NOTIFICADOR_ARQUIVO) {
      throw new Error(
        "NOTIFICADOR_ARQUIVO é canal de teste e não pode existir em produção: "
        + "ele grava o link de redefinição de senha em texto puro, e esse link "
        + "assume qualquer conta de qualquer município enquanto estiver vivo.",
      );
    }
    /*
      Recuperação de senha ligada exige destino de verdade.

      Sem esta checagem, produção caía no `notificadorDeLog` e a recuperação
      respondia 202 "enviamos um link" sem enviar nada, enquanto escrevia a
      credencial de uso único no log do servidor. Duas falhas na mesma linha:
      uma promessa falsa ao usuário e um segredo vivo em texto puro.

      Desligar é decisão legítima e explícita: `RECUPERACAO_ATIVA=nao`, e a
      tela passa a mandar procurar quem administra o município.
    */
    if (c.RECUPERACAO_ATIVA === "sim" && (!c.NOTIFICADOR_URL || !c.NOTIFICADOR_CHAVE)) {
      throw new Error(
        "A recuperação de senha está ligada e não tem por onde sair. Defina "
        + "NOTIFICADOR_URL e NOTIFICADOR_CHAVE, ou desligue com "
        + "RECUPERACAO_ATIVA=nao. Sem isso o link de redefinição iria para o "
        + "log do servidor, em texto puro, e nenhum email seria enviado.",
      );
    }
    /*
      E ter as variáveis preenchidas não basta: alguém precisa FALAR com o
      provedor.

      Este é o buraco que ficou aberto por semanas. A checagem acima existia,
      passava, e mesmo assim nenhum email saía, porque o servidor não tinha
      cliente HTTP nenhum: `NOTIFICADOR_URL` era conferida e nunca usada, e a
      mensagem caía no `notificadorDeLog`, que escreve o link de uso único em
      texto puro por fora do `redact`. Duas falhas na mesma linha, e a
      configuração parecia correta nas duas.

      Com `EMAIL_ATIVO=sim` o cliente de verdade é montado na partida (ver
      `index.ts`). Sem ele, a recuperação em produção precisa estar desligada,
      e aí a tela manda procurar quem administra o município, que é o único
      caminho que de fato funciona nesse estado.
    */
    if (c.RECUPERACAO_ATIVA === "sim" && c.EMAIL_ATIVO !== "sim") {
      throw new Error(
        "A recuperação de senha está ligada com EMAIL_ATIVO=nao: as variáveis "
        + "do provedor estão preenchidas, mas nada neste processo fala com ele, "
        + "então o link de redefinição iria para o log do servidor em vez da "
        + "caixa de entrada de quem pediu. Ligue com EMAIL_ATIVO=sim, ou "
        + "desligue a recuperação com RECUPERACAO_ATIVA=nao.",
      );
    }
    if (c.ORIGENS_PERMITIDAS.includes("*")) {
      throw new Error("ORIGENS_PERMITIDAS não pode conter curinga em produção");
    }
    // Guardar evidência na memória do processo em produção significaria perder
    // toda foto de vistoria no primeiro reinício.
    if (!c.S3_ENDPOINT || !c.S3_BALDE || !c.S3_CHAVE_ID || !c.S3_CHAVE_SECRETA) {
      throw new Error(
        "Armazenamento de evidência é obrigatório em produção: " +
        "defina S3_ENDPOINT, S3_BALDE, S3_CHAVE_ID e S3_CHAVE_SECRETA",
      );
    }

    /*
      Endereço apontando para localhost em produção é a pior categoria de
      defeito de configuração: silenciosa. O servidor sobe, responde, e só o
      destinatário descobre, sozinho, que o link não abre.

      URL_PAINEL vira o link de redefinição de senha que chega por email.
      URL_PUBLICA vira o endereço de onde o aparelho busca a foto de vistoria.
      Nenhum dos dois tem valor padrão que faça sentido fora da máquina de
      quem desenvolve, então em produção os dois são obrigatórios e explícitos.
    */
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
      ["ORIGENS_PERMITIDAS", c.ORIGENS_PERMITIDAS],
    ] as const) {
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(valor)) {
        throw new Error(
          `${nome} aponta para a máquina local em produção (${valor}). ` +
          "Defina o endereço real: um link para localhost chega quebrado a " +
          "quem recebe, e ninguém percebe pelo lado de cá.",
        );
      }
    }

    // HTTPS não é preferência: token de sessão e foto de vistoria viajam aí.
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
    ] as const) {
      if (!valor.startsWith("https://")) {
        throw new Error(`${nome} precisa ser https em produção (${valor})`);
      }
    }
  }

  // Fora de produção, um segredo efêmero por processo: reiniciar invalida os
  // tokens, que é o comportamento correto para um ambiente descartável.
  const segredo = c.JWT_SEGREDO ?? crypto.randomUUID() + crypto.randomUUID();

  return {
    ...c,
    jwtSegredo: new TextEncoder().encode(segredo),
    origens: c.ORIGENS_PERMITIDAS.split(",").map((o) => o.trim()).filter(Boolean),
  };
}
