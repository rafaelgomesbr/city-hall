import { createHash, createHmac } from "node:crypto";

/**
 * URL pré-assinada, no padrão AWS Signature Version 4.
 *
 * Implementado à mão sobre `node:crypto` em vez de usar o SDK da AWS por dois
 * motivos concretos: o SDK traz dezenas de pacotes transitivos para uma conta
 * que precisa fechar em zero no `npm audit`, e o provedor escolhido é
 * S3-compatível (Cloudflare R2, por causa do egress), não a AWS. O que importa
 * é o protocolo, e ele cabe neste arquivo.
 *
 * A correção não é opinião: o algoritmo tem vetor de teste oficial publicado
 * pela AWS, e `test/assinatura.test.ts` confere byte a byte contra ele. Se
 * bater, a implementação está certa; uma assinatura de 256 bits não coincide
 * por acaso.
 */

export type Credenciais = {
  accessKeyId: string;
  secretAccessKey: string;
  /** Opcional, para credencial temporária (STS). */
  sessionToken?: string;
};

export type PedidoAssinatura = {
  metodo: "GET" | "PUT" | "HEAD" | "DELETE";
  /** Host do endpoint, sem esquema. Ex.: `conta.r2.cloudflarestorage.com`. */
  host: string;
  /** Caminho do objeto, começando com barra. Ex.: `/balde/tenant/xxx/foto.jpg`. */
  caminho: string;
  regiao: string;
  servico?: string;
  credenciais: Credenciais;
  /** Instante da assinatura. Recebido de fora para o teste ser determinístico. */
  agora: Date;
  expiraEmSegundos: number;
  /**
   * Cabeçalhos que entram na assinatura além de `host`.
   *
   * Assinar um cabeçalho o torna obrigatório e imutável: o armazenamento
   * recusa o envio se ele vier diferente. É assim que o limite de tamanho é
   * imposto de verdade, e não só pedido educadamente ao cliente.
   */
  cabecalhosAssinados?: Record<string, string>;
  consultaExtra?: Record<string, string>;
};

const ALGORITMO = "AWS4-HMAC-SHA256";

/**
 * Codificação RFC 3986.
 *
 * `encodeURIComponent` deixa passar `!`, `'`, `(`, `)` e `*`, que a AWS exige
 * codificados. Um caractere desses num nome de arquivo faria a assinatura
 * bater no cliente e falhar no servidor, com erro genérico de assinatura
 * inválida: o tipo de defeito que só aparece com o arquivo do usuário real.
 */
export function codificarRfc3986(valor: string): string {
  return encodeURIComponent(valor).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** No caminho, a barra separa segmentos e não pode ser codificada. */
function codificarCaminho(caminho: string): string {
  return caminho
    .split("/")
    .map((segmento) => codificarRfc3986(segmento))
    .join("/");
}

function sha256Hex(dado: string): string {
  return createHash("sha256").update(dado, "utf8").digest("hex");
}

function hmac(chave: Buffer | string, dado: string): Buffer {
  return createHmac("sha256", chave).update(dado, "utf8").digest();
}

/** Data no formato `20130524T000000Z`, sem separadores. */
function carimbo(data: Date): { completo: string; dia: string } {
  const completo = data.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { completo, dia: completo.slice(0, 8) };
}

/**
 * A chave de assinatura é derivada em quatro passos encadeados, cada um
 * usando o resultado do anterior como chave. É isso que faz uma chave vazada
 * valer só para uma data, uma região e um serviço.
 */
function chaveDeAssinatura(
  segredo: string,
  dia: string,
  regiao: string,
  servico: string,
): Buffer {
  const kData = hmac(`AWS4${segredo}`, dia);
  const kRegiao = hmac(kData, regiao);
  const kServico = hmac(kRegiao, servico);
  return hmac(kServico, "aws4_request");
}

export function assinarUrl(pedido: PedidoAssinatura): string {
  const servico = pedido.servico ?? "s3";
  const { completo, dia } = carimbo(pedido.agora);
  const escopo = `${dia}/${pedido.regiao}/${servico}/aws4_request`;

  const cabecalhos: Record<string, string> = {
    host: pedido.host,
    ...(pedido.cabecalhosAssinados ?? {}),
  };

  // Nomes em minúsculas e em ordem alfabética: a ordem faz parte da
  // assinatura, então divergir aqui produz erro no servidor, não aviso.
  const nomesAssinados = Object.keys(cabecalhos)
    .map((n) => n.toLowerCase())
    .sort();
  const cabecalhosCanonicos = nomesAssinados
    .map((nome) => {
      const chaveOriginal = Object.keys(cabecalhos).find((k) => k.toLowerCase() === nome)!;
      // Espaço interno colapsado e pontas aparadas, conforme a especificação.
      const valor = String(cabecalhos[chaveOriginal]).trim().replace(/\s+/g, " ");
      return `${nome}:${valor}\n`;
    })
    .join("");
  const listaAssinados = nomesAssinados.join(";");

  const consulta: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITMO,
    "X-Amz-Credential": `${pedido.credenciais.accessKeyId}/${escopo}`,
    "X-Amz-Date": completo,
    "X-Amz-Expires": String(pedido.expiraEmSegundos),
    "X-Amz-SignedHeaders": listaAssinados,
    ...(pedido.credenciais.sessionToken
      ? { "X-Amz-Security-Token": pedido.credenciais.sessionToken }
      : {}),
    ...(pedido.consultaExtra ?? {}),
  };

  // A consulta canônica é ordenada por nome já codificado.
  const consultaCanonica = Object.keys(consulta)
    .sort()
    .map((k) => `${codificarRfc3986(k)}=${codificarRfc3986(consulta[k]!)}`)
    .join("&");

  const caminhoCanonico = codificarCaminho(pedido.caminho);

  /**
   * `UNSIGNED-PAYLOAD` em vez do hash do conteúdo: numa URL pré-assinada o
   * corpo ainda não existe no momento da assinatura. É o valor previsto na
   * especificação para este caso, e o controle sobre o conteúdo vem dos
   * cabeçalhos assinados (tipo e tamanho), não do hash.
   */
  const requisicaoCanonica = [
    pedido.metodo,
    caminhoCanonico,
    consultaCanonica,
    cabecalhosCanonicos,
    listaAssinados,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const paraAssinar = [
    ALGORITMO,
    completo,
    escopo,
    sha256Hex(requisicaoCanonica),
  ].join("\n");

  const assinatura = createHmac(
    "sha256",
    chaveDeAssinatura(pedido.credenciais.secretAccessKey, dia, pedido.regiao, servico),
  )
    .update(paraAssinar, "utf8")
    .digest("hex");

  return `https://${pedido.host}${caminhoCanonico}?${consultaCanonica}&X-Amz-Signature=${assinatura}`;
}
