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

  const host = new URL(endpoint).host;
  const caminhoDe = (chave: string) => `/${balde}/${chave}`;

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
  };
}
