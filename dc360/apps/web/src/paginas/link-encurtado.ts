import { coordenadaEmTexto, type Coordenada } from "@dc360/shared";
import type { PontoDoLinkDeMapa } from "../dados/tipos";
import { arredondarCoordenada } from "./coordenada-colada";

/**
 * O link ENCURTADO do Google Maps, do lado da tela: as decisões que não
 * dependem de React.
 *
 * O reclame de quem paga, na letra: "o campo localização do mapa ao abrir a
 * ocorrência tem que aceitar link curto do gmaps, hoje não tá aceitando". O
 * painel recusava de propósito, e continua sem abrir link nenhum a partir do
 * navegador. Quem abre é o servidor da prefeitura (`POST /mapa/resolver-link`,
 * ver `apps/api/src/rotas/mapa.ts`), e só quando a pessoa aperta o botão:
 * abrir o link é o servidor contando ao Google que aquele ponto foi
 * consultado (`docs/SUBPROCESSADORES.md`, seção 2.2), e isso é um ato de quem
 * está atendendo, não um efeito colateral de colar.
 *
 * Mesma razão de `coordenada-corrigida.ts` para ser função pura: este painel
 * não roda em navegador de teste, e cada regra daqui tem teste que roda em
 * milissegundos com um resolvedor de mentira.
 */

/** O rótulo do botão, dito por extenso porque a mensagem da correção o cita. */
export const ROTULO_DO_BOTAO = "Descobrir o ponto";

/** O que a tela diz enquanto espera o servidor. */
export const FRASE_ABRINDO = "Abrindo o link no servidor da prefeitura para descobrir o ponto";

/**
 * O que a tela diz ANTES do clique. Diz o ato e quem o faz, porque a pessoa
 * precisa saber que é o servidor saindo para a rede em nome dela.
 */
export const FRASE_ANTES =
  "Este link é encurtado e não carrega a coordenada dentro dele. O servidor da "
  + "prefeitura pode abrir o link para descobrir o ponto (o Google fica sabendo "
  + "que o ponto foi consultado).";

/** Quem vai buscar: a função do repositório, ou um dublê no teste. */
export type Resolvedor = (url: string) => Promise<PontoDoLinkDeMapa>;

export type Descoberta =
  | { tipo: "ponto"; coordenada: Coordenada; urlFinal: string }
  | { tipo: "falha"; mensagem: string };

/**
 * Pede o ponto ao servidor e traduz o resultado no que a tela desenha.
 *
 * Toda falha vira FRASE. A API responde cada recusa com uma frase que termina
 * no que fazer (`link_nao_aceito`, `sem_ponto`, `nao_resolveu`), o transporte
 * já traduz falta de rede em "sem conexão", e o modo de demonstração recusa
 * com a frase dele. O que não tiver frase nenhuma ganha uma, para a tela
 * nunca mostrar "[object Object]" a quem está com o telefone no ombro.
 */
export async function descobrirPonto(texto: string, resolver: Resolvedor): Promise<Descoberta> {
  try {
    const ponto = await resolver(linkNoTexto(texto));
    return {
      tipo: "ponto",
      coordenada: arredondarCoordenada({ lat: ponto.latitude, lng: ponto.longitude }),
      urlFinal: ponto.urlFinal,
    };
  } catch (erro: unknown) {
    const mensagem = erro instanceof Error && erro.message.trim() !== ""
      ? erro.message
      : "Não foi possível descobrir o ponto agora. Abra o link no seu navegador "
        + "e cole aqui o endereço que aparecer na barra.";
    return { tipo: "falha", mensagem };
  }
}

/**
 * O link dentro do que foi colado, sem as palavras em volta.
 *
 * O leitor compartilhado aceita "veja aqui https://maps.app.goo.gl/x" como
 * `encurtado`, porque é assim que o link chega do WhatsApp. O servidor recebe
 * só o link: a frase inteira levaria um `link_nao_aceito` por causa de duas
 * palavras que não são o link. Sem `https://` no texto, vai o texto como está,
 * e o servidor diz o que ele é (é ele que tem a lista, e não este arquivo).
 */
export function linkNoTexto(texto: string): string {
  const achado = /https?:\/\/[^\s<>"']+/i.exec(texto);
  const bruto = achado ? achado[0] : texto.trim();
  // Vírgula ou ponto final colados no fim são da frase, não do link.
  return bruto.replace(/[.,;)]+$/, "");
}

/**
 * O texto que o botão põe no campo. É `coordenadaEmTexto`, e não outro
 * formato, porque o campo é relido a cada tecla pelo mesmo leitor que lê o
 * que a pessoa cola: o texto precisa ser reconhecido como ponto por ele.
 */
export function textoDoPontoDescoberto(descoberta: Extract<Descoberta, { tipo: "ponto" }>): string {
  return coordenadaEmTexto(descoberta.coordenada);
}

/**
 * De onde o ponto veio, dito na tela depois de preencher.
 *
 * Sem isto, o campo mostra uma coordenada que a pessoa não digitou nem colou,
 * e ela não tem como saber se foi o servidor ou um dedo no teclado. O link
 * final é para conferir no mapa o que o servidor viu.
 */
export function origemDoPonto(textoColado: string, urlFinal: string): { frase: string; link: string } {
  return {
    frase: "Ponto descoberto pelo servidor da prefeitura a partir do link encurtado "
      + `${linkNoTexto(textoColado)}.`,
    link: urlFinal,
  };
}
