import { useEffect, useState } from "react";
import { configuracaoDoPainel, type ConfiguracaoDoPainel, type Sessao } from "../dados/repositorio";

/**
 * O que o painel sabe do ambiente onde está rodando, perguntado uma vez.
 *
 * A chave do mapa deixou de vir de `import.meta.env` e passou a vir da API em
 * tempo de execução. A razão é de conta a pagar: `import.meta.env` é tempo de
 * BUILD, e o painel é UM build estático servindo TODOS os municípios, então a
 * chave assada ali seria a chave do FORNECEDOR, cobrada no cartão dele,
 * pagando o carregamento de mapa de todas as prefeituras (o Google cobra por
 * carregamento). Pela API, cada implantação responde com a chave de quem paga
 * por ela, e a prefeitura passa a ter onde pôr a dela.
 *
 * UMA PERGUNTA POR ABA, e não uma por tela. A resposta é a mesma durante a
 * sessão inteira, e este painel troca de tela o tempo todo: sem a memória
 * abaixo, abrir o mapa, voltar e abrir de novo seriam três requisições para
 * saber a mesma coisa.
 *
 * FALHA NÃO TRAVA A TELA. Se a pergunta não chega ao servidor, a resposta é
 * "sem chave", que é o plano esquemático: as mesmas coordenadas, em escala, sem
 * camada de ruas. Perder a camada de ruas porque a rede oscilou é aceitável;
 * deixar o coordenador olhando um "Carregando" para sempre, num dia de
 * temporal, não é.
 */
const SEM_CHAVE: ConfiguracaoDoPainel = { chaveDoMapa: "" };

let lembrada: ConfiguracaoDoPainel | null = null;
let emVoo: Promise<ConfiguracaoDoPainel> | null = null;

function perguntar(sessao: Sessao): Promise<ConfiguracaoDoPainel> {
  if (lembrada) return Promise.resolve(lembrada);
  emVoo ??= configuracaoDoPainel(sessao)
    .then((resposta) => {
      lembrada = resposta;
      return resposta;
    })
    .catch(() => SEM_CHAVE)
    .finally(() => { emVoo = null; });
  return emVoo;
}

/**
 * Esquece o que foi perguntado. Existe para o teste, e para a troca de conta.
 *
 * A resposta é da IMPLANTAÇÃO e não da pessoa, então trocar de usuário não
 * muda o valor. Ainda assim a memória é limpa na saída: guardar estado de uma
 * sessão para a seguinte é o tipo de atalho que envelhece mal, e aqui ele não
 * compra nada.
 */
export function esquecerConfiguracaoDoPainel(): void {
  lembrada = null;
  emVoo = null;
}

export type EstadoDaConfiguracao = {
  configuracao: ConfiguracaoDoPainel | null;
  /**
   * Já se sabe a resposta, mesmo que ela seja "sem chave".
   *
   * A tela do mapa espera por isto antes de escolher o modo. Sem a espera, ela
   * desenharia o plano esquemático, diria em voz alta "sem chave do Google" e
   * um instante depois trocaria pelo mapa de ruas: a legenda de modo teria
   * afirmado uma coisa falsa, e é justamente essa legenda que o município usa
   * para saber se a coordenada dele está saindo do navegador.
   */
  pronta: boolean;
};

export function useConfiguracaoDoPainel(sessao: Sessao): EstadoDaConfiguracao {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoDoPainel | null>(lembrada);

  useEffect(() => {
    let vivo = true;
    perguntar(sessao).then((resposta) => { if (vivo) setConfiguracao(resposta); });
    return () => { vivo = false; };
  }, [sessao]);

  return { configuracao, pronta: configuracao !== null };
}
