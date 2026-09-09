import { assinarUrl, type Credenciais } from "./assinatura.js";
import type { Armazenamento, Envio, PedidoEnvio, ResultadoDeLeitura } from "./tipos.js";

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
  const prefixo = base.pathname.replace(/\/$/, "");
  const caminhoDe = (chave: string) => `${prefixo}/${balde}/${chave}`;

  return {
    async urlParaEnviar(pedido: PedidoEnvio): Promise<Envio> {
      // Tipo e tamanho entram na assinatura: mandar diferente invalida a
      // assinatura e o armazenamento recusa. O limite deixa de depender da
      // boa vontade do cliente.
      const cabecalhos = {
        "content-type": pedido.tipoConteudo,
        "content-length": String(pedido.tamanhoBytes),
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
  };
}
