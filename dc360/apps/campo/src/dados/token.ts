import type { ObterToken } from "@dc360/campo";
import type { Credenciais } from "./api";

/**
 * Quando renovar o token de acesso, e como não renovar duas vezes ao mesmo
 * tempo.
 *
 * Este arquivo existe separado de `sessao.tsx` porque a regra que ele guarda
 * é a mais cara de errar do aplicativo inteiro, e porque errada ela falha em
 * silêncio.
 *
 * O token de renovação é ROTATIVO: cada uso queima o anterior. O servidor
 * trata a reapresentação de um token já queimado como sintoma de roubo e
 * derruba TODAS as sessões do agente (`derrubarSePossivelReuso`, na API).
 * Duas consequências decorrem disso, e as duas moram aqui:
 *
 * 1. Duas renovações ao mesmo tempo se sabotam. A segunda a chegar leva um
 *    token já gasto, e o agente é deslogado por usar o aplicativo do jeito
 *    normal. Daí a trava de renovação em voo.
 * 2. Renovar a cada uso é a mesma armadilha em câmera lenta. O transporte
 *    pede o token uma vez por operação, e uma vistoria com três fotos são
 *    sete pedidos. Daí só renovar perto do vencimento, lendo o `exp` do
 *    próprio token.
 *
 * O que torna isso traiçoeiro é que a falha não aparece na hora: o token de
 * acesso derrubado continua sendo aceito até vencer, então o agente sobe o
 * morro achando que está tudo certo e descobre a perda quinze minutos depois,
 * com a fila inteira parada em 401.
 */

/**
 * Quanto antes do vencimento vale a pena renovar.
 *
 * Dois minutos, com o token de acesso vivendo quinze. A escolha equilibra
 * três coisas: o envio mais lento que o transporte tolera antes de desistir
 * (trinta segundos), a diferença comum entre o relógio do aparelho e o do
 * servidor (aparelho de campo passa o dia sem sinal e não sincroniza a hora),
 * e o desperdício de renovar cedo demais. Com dois minutos, uma requisição
 * que sai com o token ainda válido tem folga de sobra para terminar, e o
 * agente troca de token umas cinco vezes por plantão em vez de a cada foto.
 */
export const FOLGA_PADRAO_MS = 120_000;

/**
 * Piso entre duas tentativas de renovação.
 *
 * Serve para o caso ruim: renovação falhando (sessão morta, ou sinal indo e
 * vindo). Sem este piso, cada operação da fila dispararia uma tentativa nova
 * contra um servidor que já disse não, gastando bateria e dados justamente
 * quando o agente mais precisa dos dois. Um minuto é menor que a folga acima,
 * então ainda sobra uma segunda tentativa antes de o token morrer de fato.
 */
export const INTERVALO_MINIMO_MS = 60_000;

export type FerramentasDoToken = {
  /**
   * Lê as credenciais que valem AGORA.
   *
   * É um getter, e não um valor, de propósito. A fila do aplicativo é
   * memoizada: ela guarda a primeira função `obterToken` que recebe e usa
   * aquela para sempre. Se as credenciais viessem por valor, a fila ficaria
   * presa nas credenciais do momento em que foi criada, reapresentando um
   * token de renovação já rotacionado a cada envio.
   */
  lerCredenciais: () => Credenciais | null;
  guardarCredenciais: (novas: Credenciais) => Promise<void>;
  renovar: (renovacao: string) => Promise<Credenciais>;
  agora?: () => number;
  folgaMs?: number;
  intervaloMinimoMs?: number;
};

/**
 * Lê o `exp` do token de acesso, em milissegundos.
 *
 * Não verifica assinatura, e não deve: quem valida token é o servidor, com o
 * segredo que o aplicativo não tem nem pode ter. Aqui a leitura serve para
 * uma decisão local e sem consequência de segurança (renovar agora ou
 * depois), e um token adulterado só faria o aplicativo renovar na hora
 * errada, nunca ganhar acesso.
 *
 * Devolve `null` quando não dá para ler, e quem chama trata isso como "está
 * na hora de renovar".
 */
export function lerExpiracaoDoAcesso(acesso: string): number | null {
  const partes = acesso.split(".");
  if (partes.length !== 3) return null;

  const carga = decodificarBase64Url(partes[1] ?? "");
  if (carga === null) return null;

  try {
    const dados: unknown = JSON.parse(carga);
    if (typeof dados !== "object" || dados === null) return null;
    const exp = (dados as { exp?: unknown }).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}

/**
 * `atob` devolve os bytes como latin1, então acento no `nome` dentro do token
 * chega embaralhado. Não importa: o único campo lido aqui é o `exp`, que é
 * número, e byte de UTF-8 embaralhado continua sendo caractere válido dentro
 * de string JSON, então o `JSON.parse` não quebra por causa disso.
 */
function decodificarBase64Url(segmento: string): string | null {
  const base64 = segmento.replace(/-/g, "+").replace(/_/g, "/");
  const completo = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    return atob(completo);
  } catch {
    return null;
  }
}

/**
 * Monta a função que a fila e as telas chamam para conseguir um token.
 *
 * É uma fábrica, e não uma função solta, porque a trava de renovação em voo
 * precisa de estado com vida longa: uma trava por sessão, compartilhada por
 * todo mundo que pede token. Duas instâncias desta fábrica seriam duas
 * travas, que é o mesmo que trava nenhuma.
 */
export function criarObtentorDeToken(
  ferramentas: FerramentasDoToken,
): ObterToken {
  const agora = ferramentas.agora ?? (() => Date.now());
  const folgaMs = ferramentas.folgaMs ?? FOLGA_PADRAO_MS;
  const intervaloMinimoMs = ferramentas.intervaloMinimoMs ?? INTERVALO_MINIMO_MS;

  let renovacaoEmVoo: Promise<string | null> | null = null;
  let ultimaTentativaMs = Number.NEGATIVE_INFINITY;

  function estaPertoDeVencer(acesso: string): boolean {
    const expiraEmMs = lerExpiracaoDoAcesso(acesso);
    // Token ilegível é token em que não dá para confiar prazo: renova, que o
    // piso entre tentativas impede o desperdício virar tempestade.
    if (expiraEmMs === null) return true;
    return expiraEmMs - agora() <= folgaMs;
  }

  return async function obterToken(pedido?: { renovarJa?: boolean }): Promise<string | null> {
    const atuais = ferramentas.lerCredenciais();
    if (!atuais) return null;

    /*
      `renovarJa` e o pedido do transporte depois de um 401 `nao_autenticado`:
      o servidor recusou o token, entao a validade que o aparelho le dele (e o
      relogio do aparelho, que passa o dia sem sincronizar) nao vale mais como
      criterio. So esta linha muda: a TRAVA e o PISO abaixo continuam valendo
      para esse pedido, e e por eles que o laco "token recusado, renova, recusa
      de novo, renova" nao existe. Dentro do piso, ou com a renovacao recusada,
      a funcao devolve o MESMO token, e e essa igualdade que o transporte le como
      "repetir seria inutil" e pausa a fila em vez de insistir.
    */
    if (pedido?.renovarJa !== true && !estaPertoDeVencer(atuais.acesso)) return atuais.acesso;
    if (agora() - ultimaTentativaMs < intervaloMinimoMs) return atuais.acesso;

    // A trava. Quem chegar durante a renovação espera a mesma requisição, em
    // vez de abrir a segunda que queimaria o token da primeira.
    if (renovacaoEmVoo) return renovacaoEmVoo;

    renovacaoEmVoo = (async () => {
      try {
        const novas = await ferramentas.renovar(atuais.renovacao);

        const valendoAgora = ferramentas.lerCredenciais();
        if (valendoAgora?.renovacao !== atuais.renovacao) {
          /*
            O agente saiu, ou entrou de novo, enquanto esta renovação estava
            no ar. Gravar a resposta atrasada aqui ressuscitaria no cofre uma
            sessão que ele mandou encerrar, ou trocaria a sessão nova pela
            velha.
          */
          return valendoAgora?.acesso ?? null;
        }

        await ferramentas.guardarCredenciais(novas);
        return novas.acesso;
      } catch {
        /*
          Falhou: pode ser sinal, pode ser sessão morta. Devolver o token
          atual é o certo nos dois casos. Se for sinal, o token ainda vale e o
          envio vai tentar; se estiver morto, o servidor responde 401, que o
          transporte classifica como falha de sessão (`FalhaDeSessao`): a fila
          para e guarda a coleta, em vez de queimar bateria ou bloqueá-la.
        */
        return ferramentas.lerCredenciais()?.acesso ?? null;
      } finally {
        ultimaTentativaMs = agora();
        renovacaoEmVoo = null;
      }
    })();

    return renovacaoEmVoo;
  };
}
