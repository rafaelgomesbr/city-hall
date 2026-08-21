import { createHmac, randomBytes } from "node:crypto";
import type { Armazenamento, Envio, PedidoEnvio } from "./tipos.js";

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
  /** Chamado pela rota que recebe o PUT. */
  guardar(chave: string, corpo: Buffer, tipoConteudo: string): void;
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

export function armazenamentoEmMemoria(config: ConfigMemoria): ArmazenamentoEmMemoria {
  const {
    baseUrl,
    segredo = randomBytes(32).toString("hex"),
    segundosEnvio = 15 * 60,
    segundosLeitura = 5 * 60,
    agora = () => new Date(),
  } = config;

  const objetos = new Map<string, { corpo: Buffer; tipoConteudo: string }>();
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

    guardar(chave, corpo, tipoConteudo) {
      objetos.set(chave, { corpo, tipoConteudo });
    },

    ler(chave) {
      return objetos.get(chave) ?? null;
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
