import { randomUUID } from "node:crypto";

/**
 * Por onde sai um aviso para uma pessoa.
 *
 * É uma porta, e não um cliente de email direto, por duas razões práticas: o
 * provedor ainda não foi escolhido (e a escolha tem implicação de custo e de
 * residência de dado), e um teste que precisasse de servidor de email nunca
 * seria rodado.
 *
 * O que NÃO passa por aqui: senha em claro, token de sessão, dado de saúde ou
 * qualquer coisa sobre a ocorrência. Uma mensagem de recuperação leva um link
 * de uso único e nada mais, porque email trafega e repousa fora do controle
 * do município.
 */
export type Mensagem = {
  para: string;
  nome: string;
  assunto: string;
  corpo: string;
};

/**
 * O que sobra de um envio aceito, e por que sobra alguma coisa.
 *
 * `enviar` devolvia `void`, e o silêncio tinha um custo que só aparece meses
 * depois: o órgão diz que não recebeu o ofício, o município abre a tela e lê
 * "entregue", escrito pelo próprio sistema com base em nada além de "a
 * chamada HTTP não deu erro". Palavra contra palavra, e a do município vale
 * menos, porque é ele quem tem interesse no assunto.
 *
 * O provedor devolve um identificador da mensagem que aceitou. Guardado, ele
 * transforma a conversa: o município leva esse identificador ao painel do
 * provedor e lê o que aconteceu depois que a mensagem saiu daqui.
 *
 * `null` é resposta legítima, e não falha: o notificador de log e o de arquivo
 * não falam com provedor nenhum, então não têm o que devolver.
 */
export type Recibo = {
  idNoProvedor: string | null;
};

export type Notificador = {
  enviar(mensagem: Mensagem): Promise<Recibo>;
};

/**
 * Implementação de desenvolvimento: escreve no log do servidor.
 *
 * Em produção a configuração exige um notificador de verdade; subir sem ele
 * faria a recuperação responder "enviamos o link" sem enviar nada, que é pior
 * do que não ter recuperação.
 */
export function notificadorDeLog(
  registrar: (mensagem: string) => void = console.log,
): Notificador {
  return {
    async enviar(m) {
      // Só o suficiente para saber que a notificação aconteceu: destinatário
      // parcialmente encoberto e assunto. NADA do corpo, porque o corpo carrega
      // o link de redefinição, que é credencial de uso único viva por meia hora,
      // capaz de assumir qualquer conta de qualquer município. Ela saía por
      // `console.log`, ou seja, por fora do `redact` do Fastify.
      const encoberto = m.para.replace(/^(.)[^@]*(@.*)$/, "$1***$2");
      registrar(`[notificacao] para=${encoberto} assunto="${m.assunto}"`);
      // Não houve provedor, então não há recibo. Devolver um identificador
      // inventado aqui seria pior que não devolver nada: a coluna do banco
      // passaria a guardar um número que não existe no painel de provedor
      // nenhum, e o suporte perderia horas procurando.
      return { idNoProvedor: null };
    },
  };
}

/**
 * Implementação de teste: grava a mensagem INTEIRA num arquivo.
 *
 * Existe por um motivo específico e vale registrar, porque a alternativa
 * parecia mais simples e estava errada.
 *
 * A suíte de ponta a ponta contra a API precisa do link de redefinição para
 * conferir o fluxo de recuperação de senha. Ela colhia esse link do log do
 * servidor. No dia em que o log parou de imprimir o corpo, por segurança e com
 * razão, 49 das 103 verificações deixaram de ser alcançadas, e ninguém viu,
 * porque essa suíte nunca esteve na integração contínua.
 *
 * Voltar a imprimir no log seria trocar a cobertura pela credencial. O canal
 * separado resolve os dois: o log continua limpo e o teste continua tendo onde
 * ler.
 *
 * A trava está em `config.ts`: `NOTIFICADOR_ARQUIVO` derruba a partida em
 * produção. Um arquivo com link de redefinição de qualquer conta de qualquer
 * município é exatamente o que não pode existir num servidor de verdade.
 */
export function notificadorDeArquivo(caminho: string): Notificador {
  return {
    async enviar(m) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(
        caminho,
        `[notificacao] para=${m.para} assunto="${m.assunto}"
${m.corpo}
---
`,
        "utf8",
      );
      return { idNoProvedor: null };
    },
  };
}

export function mensagemDeRecuperacao(
  nome: string,
  email: string,
  link: string,
  minutos: number,
): Mensagem {
  return {
    para: email,
    nome,
    assunto: "Redefinição de senha, Defesa Civil Operacional 360",
    corpo:
      `Olá, ${nome}.\n\n` +
      `Alguém pediu a redefinição da sua senha. Se foi você, use o link abaixo. ` +
      `Ele vale por ${minutos} minutos e funciona uma vez só.\n\n` +
      `${link}\n\n` +
      `Se não foi você, ignore esta mensagem: sua senha continua a mesma e ` +
      `nenhuma sessão foi encerrada.\n`,
  };
}

/**
 * O notificador de produção enquanto não existe provedor: recusa, alto.
 *
 * Deliberadamente pior de usar que o de log, e melhor de ter. Sem provedor, a
 * alternativa honesta não é escrever o link em algum lugar: é a recuperação
 * dizer que não está disponível e mandar procurar quem administra o município,
 * que consegue redefinir a senha de qualquer jeito.
 */
export function notificadorIndisponivel(): Notificador {
  return {
    async enviar() {
      throw new Error(
        "Não há provedor de notificação configurado: nenhuma mensagem foi "
        + "enviada. Defina NOTIFICADOR_URL, NOTIFICADOR_CHAVE e "
        + "EMAIL_REMETENTE, e ligue com EMAIL_ATIVO=sim. O passo a passo está "
        + "em docs/LIGAR-O-EMAIL.md.",
      );
    },
  };
}

/**
 * Tira de um texto qualquer endereço que apareça no corpo da mensagem.
 *
 * O corpo carrega o link de uso único, e link de uso único é credencial. Um
 * provedor transacional costuma ecoar o pedido inteiro dentro do corpo do erro
 * ("campo `text` inválido: ..."), e esse corpo de erro vai para o log do
 * servidor e para a coluna `detalhe` da tentativa de envio, que é lida pelo
 * suporte. Sem esta limpeza, um erro de configuração do provedor grava o link
 * do dossiê de uma família em dois lugares que ninguém trata como segredo.
 *
 * Recorta por endereço inteiro, e não pelo token: assim vale para o link de
 * redefinição de senha e para o do ofício sem precisar saber qual dos dois é.
 *
 * O terceiro parâmetro é o endereço de email do destinatário, e ele entrou
 * quando o cliente passou a mandar o pedido no formato do provedor de verdade.
 * A razão é concreta: o provedor devolve erro de validação ecoando o campo que
 * recusou, e o campo mais recusado na estreia é justamente o de destinatário.
 * Esse eco viraria a coluna `detalhe` da tentativa e uma linha de log, e o
 * endereço de email de um cidadão (ou o do servidor público que assinou o
 * laudo) é dado pessoal que não tem por que morar em nenhum dos dois.
 */
export function semOsEnderecos(texto: string, corpo: string, para?: string): string {
  let limpo = texto;
  for (const endereco of corpo.match(/https?:\/\/\S+/g) ?? []) {
    limpo = limpo.split(endereco).join("[endereco removido]");
  }
  if (para) limpo = limpo.split(para).join("[email removido]");
  return limpo;
}

const TETO_DO_ERRO = 300;

/**
 * O endereço do Resend, escrito aqui para servir de valor padrão e de
 * documentação viva. `NOTIFICADOR_URL` continua existindo porque trocar de
 * provedor não pode exigir deploy, mas quem não souber o que preencher tem a
 * resposta a um `grep` de distância.
 */
export const URL_DO_RESEND = "https://api.resend.com/emails";

/**
 * Dez segundos. Sem tempo limite, um provedor que aceita a conexão e não
 * responde pendura a requisição do coordenador até o limite do servidor.
 * Nenhuma API transacional leva perto disso para responder.
 */
const TEMPO_LIMITE_PADRAO_MS = 10_000;

/**
 * O 429, que é o erro do dia de temporal, e o que fazemos com ele.
 *
 * O limite publicado do Resend é de dez requisições por segundo por equipe.
 * No dia a dia isso é folga enorme; no dia em que o coordenador encaminha o
 * mesmo evento para seis órgãos e a fila de avisos drena junto, é exatamente o
 * limite que se encosta.
 *
 * A DECISÃO: o 429 é o ÚNICO 4xx que este cliente tenta de novo por conta
 * própria, e ele tenta pouco. A razão é que o 429 é o único que não diz nada
 * sobre a mensagem: ela não tem defeito, ela chegou rápido demais. Repetir um
 * 422 de domínio não verificado só enche o log; repetir um 429 resolve.
 *
 * E a razão para tentar AQUI dentro, e não deixar para quem chama, é o teto de
 * reenvio do ofício: a rota grava a tentativa no banco ANTES de chamar o
 * provedor, e o município só tem três. Um 429 devolvido para fora queimaria
 * uma dessas três sem nenhuma mensagem ter saído, e o terceiro 429 do dia
 * deixaria o ofício sem nenhum caminho até o órgão.
 *
 * Duas tentativas extras, e não mais: a requisição que espera aqui é a do
 * coordenador olhando a tela. Passou disso, o erro sobe dizendo para tentar de
 * novo em alguns minutos, que é uma resposta honesta e rápida.
 */
const TENTATIVAS_EXTRAS_NO_429 = 2;

/**
 * Quanto esperar quando o provedor não diz quanto esperar.
 *
 * Um segundo, porque a janela do limite do Resend é de um segundo: esperar
 * menos é bater na mesma porta fechada, esperar muito mais é segurar a tela do
 * coordenador à toa.
 */
const ESPERA_PADRAO_NO_429_MS = 1_000;

/**
 * Teto para o que o provedor pedir no `retry-after`.
 *
 * O cabeçalho vem de fora, e o valor dele acaba virando tempo de requisição
 * pendurada. Um `retry-after: 3600` (que é o que um provedor manda quando a
 * COTA DIÁRIA estourou, e não o limite por segundo) travaria a tela do
 * coordenador por uma hora esperando algo que não vai melhorar. Com o teto, a
 * espera é curta e o erro sobe com a mensagem do provedor junto, que é o que
 * diz a quem lê se o caso é cota ou pressa.
 */
const TETO_DA_ESPERA_MS = 5_000;

/** O provedor exige `User-Agent` e recusa com 403 quem não mandar. */
const IDENTIFICACAO_DO_CLIENTE = "dc360-api";

/**
 * Quanto o provedor pediu para esperar, em milissegundos, dentro do teto.
 *
 * O Resend manda `retry-after` em SEGUNDOS, junto de `ratelimit-reset`. Ler o
 * cabeçalho em vez de fixar um número é o que faz a espera acompanhar o
 * provedor quando ele mudar de limite, e é o que a documentação dele manda
 * fazer.
 */
function esperaPedida(resposta: Response): number {
  const bruto = resposta.headers.get("retry-after") ?? resposta.headers.get("ratelimit-reset");
  const segundos = bruto === null ? Number.NaN : Number(bruto.trim());
  if (!Number.isFinite(segundos) || segundos <= 0) return ESPERA_PADRAO_NO_429_MS;
  return Math.min(segundos * 1000, TETO_DA_ESPERA_MS);
}

/**
 * O identificador da mensagem, tirado da resposta de sucesso, ou `null`.
 *
 * NUNCA lança. A mensagem já foi aceita quando esta função roda: transformar
 * uma resposta de sucesso com formato inesperado em exceção faria a rota
 * gravar `falha` para um ofício que de fato saiu, e o reenvio mandaria o mesmo
 * documento duas vezes para o órgão. Recibo faltando é um prejuízo pequeno
 * (uma investigação futura fica mais difícil); ofício duplicado é problema
 * jurídico.
 *
 * As checagens de formato existem porque este valor vai para uma coluna que o
 * suporte lê e que sai no pacote de saída do município. Se um dia vier HTML de
 * página de erro ou o eco do pedido no lugar do identificador, entra `null`.
 */
function idDaResposta(texto: string): string | null {
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof corpo !== "object" || corpo === null) return null;
  const id = (corpo as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const limpo = id.trim();
  // O mesmo formato que o CHECK da migração 027 aceita. Conferir aqui também
  // troca um erro de banco no meio do registro do desfecho (que é a parte que
  // não pode falhar) por um recibo ausente.
  if (limpo.length === 0 || limpo.length > 200 || /\s/.test(limpo)) return null;
  return limpo;
}

/**
 * A razão da recusa, em uma linha, sem nada que seja segredo.
 *
 * O Resend responde erro em JSON com `message` e `name`. Este código lê os
 * dois quando estão lá e cai no texto cru quando não estão, em vez de afirmar
 * um formato: o produto acabou de sair de um defeito causado exatamente por
 * afirmar um formato que ninguém tinha conferido.
 */
function razaoDaRecusa(texto: string): string {
  try {
    const corpo: unknown = JSON.parse(texto);
    if (typeof corpo === "object" && corpo !== null) {
      const { message, name } = corpo as { message?: unknown; name?: unknown };
      if (typeof message === "string" && message.length > 0) {
        return typeof name === "string" && name.length > 0 ? `${name}: ${message}` : message;
      }
    }
  } catch {
    // Não é JSON. O texto cru serve, e é o que o provedor tiver mandado.
  }
  return texto;
}

/**
 * O que fazer diante de 401 e 403, dito para quem vai ler o log às duas da
 * manhã. Os dois são erro de CONFIGURAÇÃO, e não de mensagem: insistir não
 * resolve nenhum dos dois, e quem lê precisa saber onde mexer.
 */
function ondeMexer(status: number): string {
  if (status === 401) {
    return " A chave do provedor foi recusada: confira NOTIFICADOR_CHAVE"
      + " (docs/LIGAR-O-EMAIL.md).";
  }
  if (status === 403 || status === 422 || status === 400) {
    return " Isto costuma ser o remetente: EMAIL_REMETENTE precisa ser de um"
      + " domínio verificado na conta do provedor (docs/LIGAR-O-EMAIL.md).";
  }
  return "";
}

/**
 * O cliente de verdade: o contrato REAL do Resend, conferido na documentação.
 *
 * O QUE ESTAVA ERRADO AQUI, e o defeito é pior que a ausência que ele veio
 * fechar. Este arquivo existia para acabar com "responder que enviou sem ter
 * enviado", e montava um corpo com os campos `de`, `para`, `nome`, `assunto` e
 * `texto`. Nenhum provedor de email do mundo aceita esse formato: os nomes
 * foram inventados, nunca falaram com provedor nenhum, e o desfecho garantido
 * em produção seria toda mensagem recusada na validação. Ou seja, o cliente
 * que existia para o email sair teria impedido o email de sair.
 *
 * POR QUE RESEND (https://resend.com/docs/api-reference/emails/send-email):
 *
 * 1. É um POST com JSON e `Authorization: Bearer`, então SEM SDK. Um SDK de
 *    email traz uma árvore de dependências inteira para dentro do `npm audit`
 *    de um produto que precisa fechar em zero, em troca de montar um objeto.
 * 2. A faixa gratuita cobre um piloto municipal com folga: o volume real aqui
 *    é link de redefinição de senha e ofício para órgão, não boletim.
 * 3. A resposta de erro é legível e o catálogo de erros é público, o que
 *    importa no dia da estreia, quando o erro vai ser domínio não verificado.
 * 4. O identificador da mensagem volta no corpo do sucesso, que é o que
 *    permite responder "o provedor aceitou, e o número é este" seis meses
 *    depois.
 *
 * O CONTRATO, campo a campo, como a documentação define:
 *
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer re_...
 *   Content-Type: application/json
 *   User-Agent: (obrigatório; sem ele o provedor responde 403)
 *   Idempotency-Key: (opcional; ver abaixo)
 *
 *   { "from": "Nome <endereco>", "to": ["endereco"], "subject": "...",
 *     "text": "..." }
 *
 *   200 -> { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
 *
 * `from`, `to` e `subject` são obrigatórios. `to` aceita string ou lista, e
 * este cliente manda sempre lista, que é o formato dos exemplos oficiais.
 *
 * O `nome` do destinatário NÃO vai para o pedido. O provedor documenta `to`
 * como endereço, e o nome já aparece na primeira linha do corpo da mensagem.
 * Enfiar `Nome <endereco>` ali porque "deve funcionar" seria repetir, em
 * escala menor, exatamente o erro que este trabalho está consertando.
 *
 * `text` e não `html`: as duas mensagens deste produto são texto, e texto puro
 * atravessa filtro de entrada de órgão público muito melhor que HTML.
 *
 * A CHAVE DE IDEMPOTÊNCIA existe por causa da repetição no 429. O provedor
 * guarda a chave por 24 horas e devolve a MESMA resposta em vez de enviar de
 * novo. Sem ela, a segunda tentativa de um 429 que na verdade tinha passado
 * mandaria o ofício duas vezes para o órgão. Ela é sorteada uma vez por
 * chamada de `enviar` e reusada nas repetições daquela chamada, que é
 * exatamente o recorte que se quer proteger: repetição automática sim,
 * reenvio pedido por uma pessoa não.
 *
 * As três garantias que este cliente já tinha, e continua tendo:
 *
 * 1. **Tempo limite explícito**, por tentativa.
 * 2. **Erro sobe como exceção**, nunca engolido: quem chama decide, e engolir
 *    aqui reproduziria o defeito que o arquivo existe para fechar.
 * 3. **O corpo da resposta do provedor passa por `semOsEnderecos`** antes de
 *    virar mensagem de erro, agora levando junto o endereço do destinatário.
 */
export function notificadorHttp(opcoes: {
  /** O endereço do provedor. Para o Resend, `URL_DO_RESEND`. */
  url: string;
  chave: string;
  /**
   * Remetente. OBRIGATÓRIO, e a obrigação é do provedor: sem `from` o Resend
   * recusa toda mensagem. Era opcional aqui, e opcional significava que uma
   * configuração aparentemente completa produziria cem por cento de recusa.
   * Precisa ser de domínio verificado na conta, senão o desfecho é o mesmo.
   */
  remetente: string;
  /** Injeção para o teste: sem isto não haveria como exercitar o cliente. */
  buscar?: typeof fetch;
  tempoLimiteMs?: number;
  /** Injeção para o teste: sem isto o caso do 429 dormiria de verdade. */
  esperar?: (ms: number) => Promise<void>;
  /** Injeção para o teste: a chave de idempotência é sorteada. */
  sortearChave?: () => string;
}): Notificador {
  const buscar = opcoes.buscar ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  const esperar = opcoes.esperar
    ?? ((ms: number) => new Promise<void>((ok) => { setTimeout(ok, ms); }));
  const sortearChave = opcoes.sortearChave ?? (() => randomUUID());

  return {
    async enviar(m): Promise<Recibo> {
      const chaveDeIdempotencia = sortearChave();
      const pedido = JSON.stringify({
        from: opcoes.remetente,
        to: [m.para],
        subject: m.assunto,
        text: m.corpo,
      });

      let ultimo429 = "";
      for (let tentativa = 0; tentativa <= TENTATIVAS_EXTRAS_NO_429; tentativa += 1) {
        let resposta: Response;
        try {
          resposta = await buscar(opcoes.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${opcoes.chave}`,
              "user-agent": IDENTIFICACAO_DO_CLIENTE,
              "idempotency-key": chaveDeIdempotencia,
            },
            body: pedido,
            // Novo a cada tentativa, de propósito: um sinal já disparado
            // aborta a repetição antes de ela sair.
            signal: AbortSignal.timeout(tempoLimiteMs),
          });
        } catch (erro) {
          const bruto = erro instanceof Error ? erro.message : String(erro);
          throw new Error(
            "O provedor de email nao respondeu: "
            + semOsEnderecos(bruto, m.corpo, m.para).slice(0, TETO_DO_ERRO),
          );
        }

        if (resposta.ok) {
          const texto = await resposta.text().catch(() => "");
          return { idNoProvedor: idDaResposta(texto) };
        }

        const corpo = await resposta.text().catch(() => "");
        const razao = semOsEnderecos(razaoDaRecusa(corpo), m.corpo, m.para)
          .slice(0, TETO_DO_ERRO);

        if (resposta.status === 429 && tentativa < TENTATIVAS_EXTRAS_NO_429) {
          ultimo429 = razao;
          await esperar(esperaPedida(resposta));
          continue;
        }

        if (resposta.status === 429) {
          throw new Error(
            "O provedor de email recusou o envio por excesso de pedidos (HTTP 429) "
            + `depois de ${TENTATIVAS_EXTRAS_NO_429 + 1} tentativas: `
            + `${razao || ultimo429}. Tente de novo em alguns minutos: a mensagem `
            + "nao tem defeito, ela so saiu junto de muitas outras.",
          );
        }

        throw new Error(
          `O provedor de email recusou o envio (HTTP ${resposta.status}): `
          + razao + ondeMexer(resposta.status),
        );
      }

      // Inalcançável: o laço ou devolve, ou lança. Existe porque o TypeScript
      // não sabe disso, e um `while (true)` esconderia a contagem de tentativas.
      throw new Error("O provedor de email nao respondeu depois das repeticoes.");
    },
  };
}
