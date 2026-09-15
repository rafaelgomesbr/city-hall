import { useCallback, useEffect, useState } from "react";

import type { DecisaoDoMapa } from "../../dados/mapa";
import { buscarAutorizacaoDoMapa, chaveDoMapaDoBuild, decidirModoDoMapa } from "../../dados/mapa";

/**
 * A peça que as telas chamam para saber se podem desenhar mapa do Google.
 *
 * Quatro telas vão desenhar mapa nesta versão do aplicativo, e a pergunta é a
 * mesma nas quatro. Escrita quatro vezes, ela vira quatro respostas: uma tela
 * esquece o caso do binário sem chave, outra trata falha de rede como
 * autorização, e a promessa da seção 2.2 do `SUBPROCESSADORES.md` passa a
 * valer em três telas de quatro.
 *
 * ## O estado de "ainda não sei", e por que ele não é o modo esquemático
 *
 * Enquanto a resposta do servidor não chega, `decisao` é `null`. A tela não
 * deve desenhar nada nesse instante, e o painel já pagou para aprender por
 * quê: antes da correção de 13/09 ele aparecia no plano esquemático,
 * afirmava em voz alta "nenhuma coordenada sai deste navegador" e um instante
 * depois trocava pelo mapa de ruas do Google. A legenda de modo tinha dito uma
 * coisa falsa, e é justamente por ela que o município sabe se a coordenada das
 * famílias está saindo dali.
 *
 * Aqui o mesmo engano teria um agravante: `null` também é o que aparece no
 * morro sem sinal, e ali ele vira plano esquemático definitivo, porque
 * `buscarAutorizacaoDoMapa` devolve vazio quando não consegue perguntar. A
 * espera é curta (oito segundos de teto) e tem desfecho sempre.
 */
export type EstadoDoMapa = {
  /** `null` enquanto a resposta do servidor não chegou. A tela espera. */
  decisao: DecisaoDoMapa | null;
  /**
   * Avisar que o Google não terminou de desenhar.
   *
   * É o equivalente do `gm_authFailure` do painel, e ele não existe pronto: o
   * SDK nativo não tem retorno de chamada para chave recusada. O que existe é
   * `onMapLoaded`, e a ausência dele dentro do prazo é o sinal. Ver
   * `RECUSA_DA_CHAVE` em `src/dados/mapa.ts`.
   *
   * Só desce, nunca sobe sozinho: uma vez que o mapa não desenhou, a tela fica
   * no plano esquemático até ser remontada. Voltar para o Google sozinho faria
   * a tela piscar entre dois mapas enquanto o sinal oscila, que é o pior lugar
   * possível para um pisca-pisca.
   */
  aoGoogleNaoDesenhar: () => void;
  /**
   * A PORTA DE SAÍDA DA ESPERA, e ela existe porque o portão de design cobrou.
   *
   * `scripts/portao-design-do-aplicativo.test.mjs` reprova `Carregando` sem
   * `aoDesistir`, com a frase "espera sem porta é o que faz alguém fechar o
   * aplicativo à força no meio de um plantão". Ele mordeu esta peça na
   * primeira vez que ela rodou, e tinha razão: a espera aqui é curta (oito
   * segundos de teto), mas num morro com sinal oscilando oito segundos parados
   * olhando para uma roda é o suficiente para o agente concluir que travou.
   *
   * Desistir vira autorização VAZIA, e não um terceiro estado: quem não quis
   * esperar não autorizou nada, então o plano esquemático é a resposta certa e
   * é a segura. Nenhuma coordenada sai do aparelho por causa de uma desistência.
   */
  desistirDeEsperar: () => void;
};

export function useMapaDoMunicipio(token: string | null): EstadoDoMapa {
  /*
    `null` é "ainda não sei"; `true` e `false` são resposta. O booleano é o
    `mapaAutorizado` de `GET /configuracao`, e a chave que vem junto na mesma
    resposta não entra aqui (ver `decidirModoDoMapa`: ela é a do painel, e não
    há mais o que comparar com ela).
  */
  const [autorizacao, setAutorizacao] = useState<boolean | null>(null);
  const [recusou, setRecusou] = useState(false);

  useEffect(() => {
    if (!token) {
      /*
        Sem sessão não há a quem perguntar, e a resposta honesta é a mesma do
        município que não autorizou: não mande coordenada nenhuma para fora.
        Não é espera: é decisão, e por isso vira `false` e não `null`.
      */
      setAutorizacao(false);
      return;
    }
    let vivo = true;
    buscarAutorizacaoDoMapa(token)
      .then((autorizou) => { if (vivo) setAutorizacao(autorizou); })
      /*
        `buscarAutorizacaoDoMapa` já não rejeita: ela devolve `false` em
        qualquer fracasso, de propósito. Este `catch` existe para o dia em que
        alguém mudar aquilo, porque uma promessa rejeitada sem tratamento
        deixaria a tela pendurada no estado de espera para sempre, que é o
        único desfecho que este arquivo não pode ter.
      */
      .catch(() => { if (vivo) setAutorizacao(false); });
    return () => { vivo = false; };
  }, [token]);

  const aoGoogleNaoDesenhar = useCallback(() => { setRecusou(true); }, []);
  const desistirDeEsperar = useCallback(() => { setAutorizacao(false); }, []);

  return {
    decisao: autorizacao === null
      ? null
      : decidirModoDoMapa({
        mapaAutorizado: autorizacao,
        doBuild: chaveDoMapaDoBuild(),
        googleRecusou: recusou,
      }),
    aoGoogleNaoDesenhar,
    desistirDeEsperar,
  };
}
