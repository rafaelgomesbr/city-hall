import { useEffect, useState } from "react";
import type { MotivoDeSessao, ResumoFila } from "@dc360/campo";
import { enderecoDaApi } from "./api";
import { obterFila } from "./fila";
import { useSessao } from "./sessao";

/**
 * O RESUMO DA FILA, para quem só precisa dos números.
 *
 * Existe por causa de um defeito visto no aparelho, e a causa dele está
 * escrita em `app/(agente)/_layout.tsx`: "ao trocar de aba fica tudo escuro,
 * nada acontece, nem spinner". O layout das abas guardava o resumo da fila em
 * ESTADO, e a fila avisa os ouvintes assim que alguém assina
 * (`packages/campo/src/fila.ts`, `assinar`), ou seja, no instante em que a
 * tela de envio monta, que é o meio da transição de 120 ms. O `setState` no
 * pai do navegador refazia os descritores, o navegador reiniciava a animação
 * da cena que estava entrando, e a cena ficava com opacidade zero.
 *
 * Por isso o número passa a ser lido POR QUEM O DESENHA (a barra de abas e a
 * faixa de sincronização), e não pelo layout que embrulha o navegador. Um
 * redesenho da barra não redesenha o navegador; um redesenho do layout
 * redesenha tudo.
 *
 * `null` enquanto a fila não respondeu: quem desenha decide o que mostrar
 * sem número, e a resposta certa é "nada" (crachá com zero é ruído).
 *
 * Mora em `dados/` porque precisa da sessão e do endereço da API para chegar
 * à fila, que é a mesma singular de `obterFila`. Cada assinante passa pelos
 * mesmos argumentos, e a fila devolve a instância única.
 */
export function useResumoDaFila(): ResumoFila | null {
  const { identidade, obterToken, lerIdentidade } = useSessao();
  const [resumo, setResumo] = useState<ResumoFila | null>(null);

  const comSessao = Boolean(identidade);
  const quem = identidade?.usuarioId;

  useEffect(() => {
    if (!comSessao) return;
    let vivo = true;
    let desassinar: (() => void) | undefined;

    void (async () => {
      /*
        As funções passam DIRETO, como sempre passaram, e não embrulhadas: a
        fila guarda as da primeira chamada para sempre (ver o contrato em
        `obterFila`), e um embrulho preso a este componente viraria a fonte da
        autoria da coleta.
      */
      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      if (!vivo) return;
      desassinar = fila.assinar((r) => { if (vivo) setResumo(r); });
    })();

    return () => {
      vivo = false;
      desassinar?.();
    };
    /*
      Só a PESSOA decide reassinar, e por isso a lista leva o `usuarioId` e não
      as funções nem o objeto da identidade. Com eles na lista, um provedor que
      entregasse objeto ou função nova a cada desenho fazia o gancho desassinar
      e reassinar a cada desenho, e a reassinatura devolve o resumo do instante
      da assinatura: o Perfil, que passou a assinar por aqui na V2-F00-E15,
      ficava preso no número velho depois de a fila esvaziar. As funções só
      importam na primeira chamada de `obterFila`, que cria a instância única.
      O logout desmonta quem chama este gancho antes de a identidade virar nula.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comSessao, quem]);

  return resumo;
}

/**
 * O que a aba de envio mostra no número, e o que cada parte significa.
 *
 * Coleta de outro agente (ou sem autor registrado) entra no total e NÃO em
 * `pendentes`. No total porque ela é uma vistoria feita no morro que ainda
 * não chegou à coordenação, e o número responde exatamente essa pergunta.
 * Fora de `pendentes` porque "esperando envio" promete que sai sozinha assim
 * que houver sinal, e essa não sai enquanto o autor não entrar neste aparelho.
 */
export function contagemDaFila(resumo: ResumoFila | null): {
  pendentes: number;
  bloqueados: number;
  deOutroAutor: number;
  naFila: number;
  sincronizando: boolean;
  /** A fila está parada pela sessão desta pessoa (ver `pausa-da-fila.ts`). */
  pausadaPor: MotivoDeSessao | null;
} {
  const pendentes = (resumo?.pendentes ?? 0) + (resumo?.enviando ?? 0);
  const bloqueados = resumo?.bloqueados ?? 0;
  const deOutroAutor = resumo?.deOutroAutor ?? 0;
  return {
    pendentes,
    bloqueados,
    deOutroAutor,
    naFila: pendentes + bloqueados + deOutroAutor,
    sincronizando: resumo?.sincronizando ?? false,
    pausadaPor: resumo?.pausadaPor ?? null,
  };
}

/**
 * O RÓTULO FALADO da aba de envio, que NÃO promete envio.
 *
 * Ele dizia "N coletas esperando" sobre um número que soma três coisas com
 * destinos diferentes: o que sai sozinho quando houver sinal, o que o servidor
 * recusou, e o que NÃO sai por esta conta (a coleta do turno anterior, no
 * aparelho de plantão, que só sobe quando o autor dela entrar aqui, senão o
 * laudo sairia com o nome errado). "Esperando" é a palavra da primeira, e ela
 * estava cobrindo as três: quem ouve a tela recebia a promessa inteira, sem a
 * ressalva, e ia embora. É a mesma frase que a `FaixaDeSincronizacao` já teve
 * de corrigir, na superfície ao lado.
 *
 * O total diz só "na fila", que é o fato, e cada parte com destino próprio se
 * nomeia depois dele. Quem não vê a tela ouve a mesma separação que o desenho
 * da fila mostra em seções.
 */
export function fraseDaFila(resumo: ResumoFila | null): string {
  const { pendentes, bloqueados, deOutroAutor, naFila } = contagemDaFila(resumo);
  if (naFila === 0) return "Envio, nada esperando";
  return [
    `Envio, ${naFila} na fila`,
    pendentes > 0 ? `${pendentes} esperando envio` : null,
    bloqueados > 0 ? `${bloqueados} com problema` : null,
    deOutroAutor > 0 ? `${deOutroAutor} de outro agente` : null,
  ].filter((parte) => parte !== null).join(", ");
}
