import { assinarUrl, type Credenciais } from "./assinatura.js";
import type { Armazenamento, Envio, PedidoEnvio } from "./tipos.js";

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
};

export function armazenamentoS3(config: ConfigS3): Armazenamento {
  const {
    endpoint, balde, regiao, credenciais,
    segundosEnvio = 15 * 60,
    segundosLeitura = 5 * 60,
    buscar = fetch,
    agora = () => new Date(),
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

    async baixar(chave: string) {
      /*
        A URL assinada vive sessenta segundos, e não os cinco minutos da
        leitura normal: aqui ela não é entregue a ninguém, é consumida na linha
        seguinte pelo próprio processo. URL de vida longa que não sai do
        servidor é vida longa desperdiçada, e ela ainda passaria por log de
        proxy no caminho.
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
      const r = await buscar(url, { method: "GET" }).catch(() => null);
      // Devolve nada em vez de lançar: quem monta o pacote de saída precisa
      // registrar a falta no relatório de pendências e seguir, e não abortar a
      // extração inteira porque um objeto sumiu do balde.
      if (!r || !r.ok) return null;
      return {
        corpo: new Uint8Array(await r.arrayBuffer()),
        tipoConteudo: r.headers.get("content-type"),
      };
    },
  };
}
