import { createHmac, randomBytes } from "node:crypto";
import type {
  Armazenamento, Envio, ObjetoListado, PaginaDeObjetos, PedidoEnvio,
} from "./tipos.js";

/**
 * Armazenamento para desenvolvimento e teste, servido pela própria API.
 *
 * Ele existe para que o fluxo completo (pedir a URL, enviar os bytes, ler de
 * volta) possa ser exercitado sem conta em nuvem nenhuma. E ele mantém a
 * propriedade que importa: a URL é assinada e expira. Fosse um caminho fixo e
 * público, o teste passaria e a garantia real nunca teria sido exercitada.
 *
 * A assinatura aqui é HMAC simples, não SigV4: o SigV4 é o protocolo que o
 * provedor externo exige, e ele tem o próprio teste contra o vetor oficial.
 */
export type ConfigMemoria = {
  /**
   * Prefixo público da API, para montar a URL.
   *
   * Aceita função porque o endereço às vezes só é conhecido depois de o
   * servidor começar a escutar (porta efêmera). Lido na construção, viraria
   * string vazia e a URL sairia relativa, que `fetch` recusa.
   */
  baseUrl: string | (() => string);
  segredo?: string;
  segundosEnvio?: number;
  segundosLeitura?: number;
  agora?: () => Date;
};

export type ArmazenamentoEmMemoria = Armazenamento & {
  /**
   * Chamado pela rota que recebe o PUT.
   *
   * `modificadoEm` é opcional e existe para o teste da varredura de órfão poder
   * ENVELHECER um objeto. A janela de graça dela é medida em dias, e um teste
   * que precisasse esperar trinta dias não seria rodado nunca.
   */
  guardar(chave: string, corpo: Buffer, tipoConteudo: string, modificadoEm?: Date): void;
  /** Chamado pela rota que serve o GET. */
  ler(chave: string): { corpo: Buffer; tipoConteudo: string } | null;
  conferirAssinatura(
    metodo: string,
    chave: string,
    consulta: Record<string, string | undefined>,
  ): { valida: boolean; motivo?: string };
  /** Só para teste: quantos objetos existem. */
  quantidade(): number;
};

/**
 * Quantos objetos cabem numa página da listagem.
 *
 * Mil, que é o mesmo teto do `ListObjectsV2` do S3. Igual de propósito: assim a
 * varredura exercita o laço de paginação nos dois caminhos, e um defeito de
 * continuação aparece no teste em vez de aparecer contra o provedor.
 */
const TAMANHO_DA_PAGINA = 1000;

export function armazenamentoEmMemoria(config: ConfigMemoria): ArmazenamentoEmMemoria {
  const {
    baseUrl,
    segredo = randomBytes(32).toString("hex"),
    segundosEnvio = 15 * 60,
    segundosLeitura = 5 * 60,
    agora = () => new Date(),
  } = config;

  const objetos = new Map<
    string,
    { corpo: Buffer; tipoConteudo: string; modificadoEm: Date }
  >();
  const base = () => (typeof baseUrl === "function" ? baseUrl() : baseUrl).replace(/\/$/, "");

  function assinar(metodo: string, chave: string, expiraEm: number): string {
    return createHmac("sha256", segredo)
      .update(`${metodo}\n${chave}\n${expiraEm}`)
      .digest("base64url");
  }

  function montar(metodo: string, chave: string, segundos: number): string {
    const expiraEm = Math.floor(agora().getTime() / 1000) + segundos;
    const assinatura = assinar(metodo, chave, expiraEm);
    const p = new URLSearchParams({ expira: String(expiraEm), assinatura });
    // A chave vai codificada inteira num único parâmetro: ela tem barras, e
    // deixá-las no caminho abriria espaço para travessia de diretório.
    p.set("chave", chave);
    return `${base()}/armazenamento/objeto?${p.toString()}`;
  }

  return {
    async urlParaEnviar(pedido: PedidoEnvio): Promise<Envio> {
      const instante = agora();
      return {
        url: montar("PUT", pedido.chave, segundosEnvio),
        cabecalhos: {
          "content-type": pedido.tipoConteudo,
          "content-length": String(pedido.tamanhoBytes),
        },
        expiraEm: new Date(instante.getTime() + segundosEnvio * 1000).toISOString(),
      };
    },

    async urlParaLer(chave: string, segundos = segundosLeitura): Promise<string> {
      return montar("GET", chave, segundos);
    },

    async descrever(chave: string) {
      const objeto = objetos.get(chave);
      return objeto
        ? { existe: true, tamanhoBytes: objeto.corpo.length }
        : { existe: false, tamanhoBytes: null };
    },

    async baixar(chave: string) {
      const objeto = objetos.get(chave);
      // `ausente`, e nunca `falha`: aqui o "armazenamento" é um mapa em
      // memória, então ele SEMPRE sabe responder se a chave existe. Devolver
      // falha daqui inventaria uma incerteza que este caminho não tem.
      return objeto
        ? { situacao: "encontrado" as const, corpo: objeto.corpo, tipoConteudo: objeto.tipoConteudo }
        : { situacao: "ausente" as const };
    },

    async listar(prefixo: string, continuacao?: string): Promise<PaginaDeObjetos> {
      /*
        Uma página só, e ordenada por chave.

        A ordenação não é capricho: é o que o S3 faz, e a continuação dele é a
        última chave devolvida. Um mapa sem ordem aqui deixaria a paginação
        passar em teste e falhar contra o provedor, que é o pior tipo de
        diferença entre as duas implementações desta porta.
      */
      const todas = [...objetos.keys()]
        .filter((c) => c.startsWith(prefixo))
        .filter((c) => (continuacao ? c > continuacao : true))
        .sort();

      const pagina = todas.slice(0, TAMANHO_DA_PAGINA);
      const objetosDaPagina: ObjetoListado[] = pagina.map((chave) => {
        const objeto = objetos.get(chave)!;
        return {
          chave,
          tamanhoBytes: objeto.corpo.length,
          modificadoEm: objeto.modificadoEm.toISOString(),
        };
      });

      return {
        objetos: objetosDaPagina,
        continuacao: todas.length > pagina.length ? pagina[pagina.length - 1]! : null,
      };
    },

    async apagar(chave: string) {
      if (!objetos.has(chave)) return { situacao: "ausente" as const };
      objetos.delete(chave);
      return { situacao: "apagado" as const };
    },

    guardar(chave, corpo, tipoConteudo, modificadoEm) {
      objetos.set(chave, { corpo, tipoConteudo, modificadoEm: modificadoEm ?? agora() });
    },

    ler(chave) {
      const objeto = objetos.get(chave);
      return objeto ? { corpo: objeto.corpo, tipoConteudo: objeto.tipoConteudo } : null;
    },

    conferirAssinatura(metodo, chave, consulta) {
      const expira = Number(consulta["expira"]);
      const assinatura = consulta["assinatura"];
      if (!chave || !assinatura || !Number.isFinite(expira)) {
        return { valida: false, motivo: "assinatura ausente" };
      }
      if (expira < Math.floor(agora().getTime() / 1000)) {
        return { valida: false, motivo: "URL expirada" };
      }
      if (assinar(metodo, chave, expira) !== assinatura) {
        return { valida: false, motivo: "assinatura inválida" };
      }
      return { valida: true };
    },

    quantidade() {
      return objetos.size;
    },
  };
}
