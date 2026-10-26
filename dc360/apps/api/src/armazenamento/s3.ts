import { assinarUrl, type Credenciais } from "./assinatura.js";
import type {
  Armazenamento, Envio, ObjetoListado, PaginaDeObjetos, PedidoEnvio,
  ResultadoDeExclusao, ResultadoDeLeitura,
} from "./tipos.js";

/**
 * Armazenamento S3-compatível.
 *
 * O levantamento técnico aponta Cloudflare R2 por causa do egress: o S3 na
 * região de São Paulo cobra por gigabyte que sai, e um sistema cujo conteúdo
 * principal é foto de vistoria paga essa conta todo mês, para sempre. O
 * protocolo é o mesmo, então trocar de provedor é trocar endpoint e região.
 */
export type ConfigS3 = {
  endpoint: string;
  balde: string;
  regiao: string;
  credenciais: Credenciais;
  /** Vida da URL de escrita. Curta: ela é entregue ao aparelho. */
  segundosEnvio?: number;
  /** Vida da URL de leitura. Mais curta ainda: ela pode acabar num print. */
  segundosLeitura?: number;
  buscar?: typeof fetch;
  agora?: () => Date;
  /**
   * Teto por chamada de leitura. Sem ele, o `fetch` do Node espera para sempre
   * quando o provedor aceita a conexão e para de responder, e o pacote de
   * saída fica pendurado sem nada em log dizendo por quê.
   */
  tempoLimiteMs?: number;
  /** Quantas vezes uma falha TRANSITÓRIA é tentada de novo, contando a primeira. */
  tentativasDeLeitura?: number;
  /** Injeção de espera, para o teste não gastar o tempo de recuo de verdade. */
  esperar?: (ms: number) => Promise<void>;
};

/**
 * Respostas que significam "tente de novo", e não "não existe".
 *
 * 429 é o limite de taxa, e é o caso concreto do defeito: um município com
 * três anos de histórico faz milhares de GET assinados seguidos, e o provedor
 * corta uma parte. 408 é tempo esgotado no lado dele; a faixa dos 500 é o
 * serviço fora. Nenhum dos três diz nada sobre o objeto existir.
 */
const STATUS_TRANSITORIO = (status: number) =>
  status === 408 || status === 429 || status >= 500;

/**
 * Recuo entre tentativas: 200 ms, 400 ms, 800 ms.
 *
 * Curto de propósito. Isto roda dentro da montagem do pacote de saída, com o
 * administrador esperando do outro lado; recuo longo multiplicado por milhares
 * de arquivos transforma a extração numa operação de horas. O que se combate
 * aqui é o pico de limite de taxa, que passa em segundos.
 */
const RECUO_BASE_MS = 200;

export function armazenamentoS3(config: ConfigS3): Armazenamento {
  const {
    endpoint, balde, regiao, credenciais,
    segundosEnvio = 15 * 60,
    segundosLeitura = 5 * 60,
    buscar = fetch,
    agora = () => new Date(),
    tempoLimiteMs = 30_000,
    tentativasDeLeitura = 3,
    esperar = (ms: number) => new Promise<void>((pronto) => {
      const relogio = setTimeout(pronto, ms);
      // Relógio vivo segura o processo em pé no encerramento, e o deploy
      // passaria a esperar o recuo para trocar de versão.
      if (typeof relogio.unref === "function") relogio.unref();
    }),
  } = config;

  const base = new URL(endpoint);
  const host = base.host;
  /*
    O caminho do endpoint precisa sobreviver, e não sobrevivia.

    Guardar só o `host` funciona no Cloudflare R2 e na AWS, onde o endpoint é
    a raiz do domínio. No Supabase Storage o endpoint é
    `https://<ref>.storage.supabase.co/storage/v1/s3`, e jogar fora o
    `/storage/v1/s3` produzia uma URL assinada apontando para uma rota que não
    existe.

    O efeito não era um erro de assinatura, era pior: o `PUT` do aparelho
    respondia 404, `descrever()` devolvia `existe: false`, e
    `POST /evidencias/confirmar-envio` respondia para sempre que o arquivo não
    havia chegado. Ou seja, foto de vistoria e assinatura do morador nunca
    entrariam no laudo, e o laudo sairia sem a prova do ato.
  */
  const caminhoDoEndpoint = base.pathname.replace(/\/$/, "");
  const caminhoDe = (chave: string) => `${caminhoDoEndpoint}/${balde}/${chave}`;

  return {
    async urlParaEnviar(pedido: PedidoEnvio): Promise<Envio> {
      /*
        Tipo e tamanho entram na assinatura: mandar diferente invalida a
        assinatura e o armazenamento recusa. O limite deixa de depender da
        boa vontade do cliente.

        `if-none-match: *` entra pelo mesmo mecanismo, e é o que torna a
        chave ESCRITA UMA VEZ: o PutObject condicional recusa com 412 quando
        já existe objeto na chave. Assinado, o cabeçalho é obrigatório (o
        aparelho não pode omiti-lo para sobrescrever), e vale para qualquer
        URL de escrita desta chave, não só para esta. É o que fecha a janela
        entre a confirmação e o vencimento da URL, que era de catorze minutos.

        Provedores: o Cloudflare R2 (o escolhido) e o S3 da AWS conferem
        cabeçalho condicional no PutObject. Um provedor S3-compatível que
        IGNORE o cabeçalho continua funcionando e perde só esta proteção (o
        hash conferido na confirmação e a soma do pacote de saída ainda
        denunciam uma troca); um que RECUSE cabeçalho desconhecido derruba o
        envio, e aí este cabeçalho precisa sair daqui junto com a troca de
        provedor, deliberadamente.
      */
      const cabecalhos = {
        "content-type": pedido.tipoConteudo,
        "content-length": String(pedido.tamanhoBytes),
        "if-none-match": "*",
      };
      const instante = agora();
      const url = assinarUrl({
        metodo: "PUT",
        host,
        caminho: caminhoDe(pedido.chave),
        regiao,
        credenciais,
        agora: instante,
        expiraEmSegundos: segundosEnvio,
        cabecalhosAssinados: cabecalhos,
      });
      return {
        url,
        cabecalhos,
        expiraEm: new Date(instante.getTime() + segundosEnvio * 1000).toISOString(),
      };
    },

    async urlParaLer(chave: string, segundos = segundosLeitura): Promise<string> {
      return assinarUrl({
        metodo: "GET",
        host,
        caminho: caminhoDe(chave),
        regiao,
        credenciais,
        agora: agora(),
        expiraEmSegundos: segundos,
      });
    },

    async descrever(chave: string) {
      const url = assinarUrl({
        metodo: "HEAD",
        host,
        caminho: caminhoDe(chave),
        regiao,
        credenciais,
        agora: agora(),
        expiraEmSegundos: 60,
      });
      const r = await buscar(url, { method: "HEAD" }).catch(() => null);
      if (!r || !r.ok) return { existe: false, tamanhoBytes: null };
      const tamanho = r.headers.get("content-length");
      return { existe: true, tamanhoBytes: tamanho ? Number(tamanho) : null };
    },

    async baixar(chave: string): Promise<ResultadoDeLeitura> {
      /*
        NÃO EXISTE e NÃO CONSEGUI LER são respostas diferentes, e juntá-las
        custava prova.

        Isto era um `.catch(() => null)` seguido de `if (!r || !r.ok) return
        null`, ou seja, erro de rede, DNS, conexão cortada, 429 de limite de
        taxa e 503 do provedor saíam pelo mesmo buraco que o 404. Em
        `saida/pacote.ts` esse `null` virava uma linha impressa sob o texto "O
        banco referia estes arquivos e eles NÃO foram encontrados no
        armazenamento", e o passo 6 do procedimento (a eliminação das nossas
        cópias) acontece depois dessa conferência, sem volta.

        Ou seja: quarenta fotografias que existem, declaradas inexistentes por
        um pico de limite de taxa, com soma de verificação ao lado dando
        aparência de conferência feita. Ver `tipos.ts`.
      */
      let ultimoMotivo = "";
      for (let tentativa = 1; tentativa <= tentativasDeLeitura; tentativa += 1) {
        /*
          A URL é assinada A CADA TENTATIVA, e não uma vez fora do laço: ela
          vive sessenta segundos, e o recuo entre tentativas consome parte
          desse tempo. Reaproveitar a assinatura transformaria a terceira
          tentativa num 403 por expiração, ou seja, o próprio remédio
          produziria a falha.

          Sessenta segundos, e não os cinco minutos da leitura normal, porque
          aqui a URL não é entregue a ninguém: é consumida na linha seguinte
          pelo próprio processo, e ainda assim passa por log de proxy no
          caminho.
        */
        const url = assinarUrl({
          metodo: "GET",
          host,
          caminho: caminhoDe(chave),
          regiao,
          credenciais,
          agora: agora(),
          expiraEmSegundos: 60,
        });

        let resposta: Awaited<ReturnType<typeof buscar>> | null = null;
        try {
          resposta = await buscar(url, {
            method: "GET",
            // Sem teto, o provedor que aceita a conexão e cala prende a
            // montagem do pacote para sempre.
            signal: AbortSignal.timeout(tempoLimiteMs),
          });
        } catch (erro) {
          /*
            Exceção do `fetch` é sempre transitória por natureza: DNS, conexão
            recusada, conexão cortada no meio, tempo esgotado. Nenhuma delas
            diz que o objeto não existe, e era exatamente isto que o
            `.catch(() => null)` afirmava.

            A mensagem entra no motivo porque ela é o que o município vai ler
            no relatório de pendências para decidir se refaz a extração. A URL
            NÃO entra: ela carrega a assinatura, e o relatório vai junto com o
            pacote.
          */
          ultimoMotivo = erro instanceof Error ? erro.message : String(erro);
        }

        if (resposta?.ok) {
          return {
            situacao: "encontrado",
            corpo: new Uint8Array(await resposta.arrayBuffer()),
            tipoConteudo: resposta.headers.get("content-type"),
          };
        }

        if (resposta && (resposta.status === 404 || resposta.status === 410)) {
          // Aqui o armazenamento RESPONDEU, e respondeu que não tem. Esta é a
          // única resposta que autoriza escrever "não encontrado".
          return { situacao: "ausente" };
        }

        if (resposta) {
          ultimoMotivo = `o armazenamento respondeu ${resposta.status}`;
          if (!STATUS_TRANSITORIO(resposta.status)) {
            /*
              403 e 400 não se resolvem tentando de novo: são credencial sem
              permissão, relógio fora de hora ou assinatura errada. Insistir
              gastaria tempo do administrador e, num 403 por permissão,
              multiplicaria por três a chamada que o provedor já recusou.
            */
            return { situacao: "falha", motivo: ultimoMotivo, tentativas: tentativa };
          }
        }

        if (tentativa < tentativasDeLeitura) {
          await esperar(RECUO_BASE_MS * 2 ** (tentativa - 1));
        }
      }

      return {
        situacao: "falha",
        motivo: ultimoMotivo || "nao houve resposta do armazenamento",
        tentativas: tentativasDeLeitura,
      };
    },

    async listar(prefixo: string, continuacao?: string): Promise<PaginaDeObjetos> {
      /*
        `ListObjectsV2`, assinado como qualquer outra chamada: o caminho é o
        BALDE (e não um objeto), e o resto vai na consulta.

        `max-keys` fica no padrão de mil do provedor. Pedir mais não é possível,
        e pedir menos multiplicaria o número de chamadas cobradas por listagem
        sem reduzir nada que importe: o que a varredura segura na memória é uma
        página, e mil chaves são centenas de kilobytes.
      */
      const consultaExtra: Record<string, string> = {
        "list-type": "2",
        prefix: prefixo,
        "max-keys": "1000",
        ...(continuacao ? { "continuation-token": continuacao } : {}),
      };

      const url = assinarUrl({
        metodo: "GET",
        host,
        caminho: `${caminhoDoEndpoint}/${balde}`,
        regiao,
        credenciais,
        agora: agora(),
        expiraEmSegundos: 60,
        consultaExtra,
      });

      let resposta: Awaited<ReturnType<typeof buscar>> | null = null;
      try {
        resposta = await buscar(url, {
          method: "GET",
          signal: AbortSignal.timeout(tempoLimiteMs),
        });
      } catch (erro) {
        return {
          objetos: [],
          continuacao: null,
          falha: erro instanceof Error ? erro.message : String(erro),
        };
      }

      if (!resposta.ok) {
        /*
          FALHA, e nunca lista vazia.

          Uma listagem que devolvesse `[]` num 403 ou num 503 diria à varredura
          que o balde está vazio. A varredura compararia um balde vazio com um
          banco cheio, não encontraria órfão nenhum, e escreveria no relatório
          que está tudo certo. Silêncio com cara de conferência feita é
          exatamente o defeito que `ResultadoDeLeitura` existe para não repetir.
        */
        return {
          objetos: [],
          continuacao: null,
          falha: `o armazenamento respondeu ${resposta.status} ao listar`,
        };
      }

      const xml = await resposta.text();
      return lerListagem(xml);
    },

    async apagar(chave: string): Promise<ResultadoDeExclusao> {
      const url = assinarUrl({
        metodo: "DELETE",
        host,
        caminho: caminhoDe(chave),
        regiao,
        credenciais,
        agora: agora(),
        expiraEmSegundos: 60,
      });

      let resposta: Awaited<ReturnType<typeof buscar>> | null = null;
      try {
        resposta = await buscar(url, {
          method: "DELETE",
          signal: AbortSignal.timeout(tempoLimiteMs),
        });
      } catch (erro) {
        return { situacao: "falha", motivo: erro instanceof Error ? erro.message : String(erro) };
      }

      /*
        O S3 responde 204 tanto para "apagou" quanto para "não existia": ele não
        distingue os dois, e não há como perguntar sem uma chamada a mais. Como
        quem chama já conferiu a existência na varredura, os dois desfechos
        levam ao mesmo lugar, e o que importa é NÃO chamar isto de sucesso
        quando o provedor recusou.
      */
      if (resposta.status === 204 || resposta.status === 200) return { situacao: "apagado" };
      if (resposta.status === 404) return { situacao: "ausente" };
      return { situacao: "falha", motivo: `o armazenamento respondeu ${resposta.status}` };
    },
  };
}

/**
 * Lê a resposta do `ListObjectsV2`, que vem em XML.
 *
 * Sem biblioteca de XML, pela mesma razão que a assinatura é escrita à mão: o
 * `npm audit --omit=dev` da raiz do produto fecha em zero (o aplicativo de campo só passa com exceções aceitas, ver `scripts/auditar.mjs`), e o que precisa ser lido aqui são
 * quatro campos de uma estrutura plana e publicada.
 *
 * O que ela NÃO faz é fingir robustez que não tem: campo que não casar sai
 * ausente, e objeto sem chave é ignorado em vez de virar uma entrada com chave
 * vazia (que a varredura leria como um objeto de prefixo desconhecido).
 */
export function lerListagem(xml: string): PaginaDeObjetos {
  const objetos: ObjetoListado[] = [];

  for (const bloco of xml.split("<Contents>").slice(1)) {
    const conteudo = bloco.split("</Contents>")[0] ?? "";
    const chave = entre(conteudo, "Key");
    if (!chave) continue;
    objetos.push({
      chave: semEscapeXml(chave),
      tamanhoBytes: Number(entre(conteudo, "Size") ?? 0),
      modificadoEm: entre(conteudo, "LastModified") ?? null,
    });
  }

  /*
    A continuação só vale quando o provedor diz que truncou.

    Ler o token sem olhar para `IsTruncated` faria a varredura pedir mais uma
    página depois da última em alguns provedores, e o laço só terminaria por
    acidente.
  */
  const truncado = (entre(xml, "IsTruncated") ?? "false").trim() === "true";
  const token = entre(xml, "NextContinuationToken");

  return { objetos, continuacao: truncado && token ? semEscapeXml(token) : null };
}

function entre(texto: string, marca: string): string | null {
  const inicio = texto.indexOf(`<${marca}>`);
  if (inicio < 0) return null;
  const fim = texto.indexOf(`</${marca}>`, inicio);
  if (fim < 0) return null;
  return texto.slice(inicio + marca.length + 2, fim);
}

function semEscapeXml(valor: string): string {
  return valor
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    // `&amp;` por último: antes dos outros, ele reintroduziria as entidades.
    .replaceAll("&amp;", "&");
}
