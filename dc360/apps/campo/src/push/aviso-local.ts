import type { Severidade } from "@dc360/shared";

import type { TipoDeAviso } from "./aviso";
import { CANAL_DESPACHO, SOM_DE_DESPACHO, VIBRACAO_DE_DESPACHO } from "./canais";

/**
 * O aviso LOCAL de tarefa nova: o que o aplicativo mostra por conta própria
 * quando a atualização periódica da lista traz uma ocorrência que não estava
 * lá (ver `dados/pendencias.ts`, `aoChegarTarefaNova`).
 *
 * ## Por que ele existe
 *
 * O push cobre o aplicativo fechado. Com o aplicativo aberto, quem descobre o
 * despacho é a atualização da lista, e "descobrir" não pode ser uma linha a
 * mais numa tela que o agente não está olhando: o pedido é ser notificado,
 * vibrado ou sonoro. Então a descoberta vira uma notificação do sistema, com o
 * mesmo som e o mesmo canal do push, mais o retorno tátil.
 *
 * ## Por que a vitrine é a MESMA do servidor, palavra por palavra
 *
 * O agente não tem como saber se o aviso veio pela Apple, pelo Google ou pela
 * atualização da lista, e não deveria precisar: dois textos diferentes para o
 * mesmo fato pareceriam dois avisos diferentes. As palavras aqui são cópia de
 * `VITRINE.tarefa_nova` em `apps/api/src/push/mensagem.ts`, e existe teste
 * dos dois lados prendendo o texto.
 *
 * ## Por que a mesma trava de privacidade
 *
 * Este aviso é desenhado pelo sistema na tela bloqueada, à vista de quem
 * estiver por perto, exatamente como o push. A regra do servidor vale igual:
 * a vitrine é constante e o detalhe vai no dado. Diferente do servidor, este
 * lado TEM a pendência inteira no disco, com endereço e protocolo, e é por
 * isso que a trava importa mais aqui: a tentação de escrever "Nova tarefa em
 * Servidão Boa Esperança, 148" está a um `${}` de distância.
 */

export type AvisoLocal = {
  /** Vitrine: o que fica legível na tela bloqueada. */
  titulo: string;
  corpo: string;
  /** Só o aplicativo lê. No mesmo formato do push, para `decidirAviso` ler. */
  dados: Record<string, string>;
  /** Nome do arquivo de som, com extensão. */
  som: string;
  /** O canal do Android. */
  canal: string;
  vibracao: readonly number[];
};

const VITRINE: Record<TipoDeAviso, { titulo: string; corpo: string }> = {
  tarefa_nova: {
    titulo: "Nova tarefa",
    corpo: "A sua equipe recebeu uma tarefa. Abra o aplicativo para ver.",
  },
  prazo_vencendo: {
    titulo: "Prazo vencendo",
    corpo: "Uma tarefa da sua equipe está perto do prazo. Abra o aplicativo para ver.",
  },
};

/** O que fica legível sem destravar o aparelho. */
export function textoVisivel(aviso: Pick<AvisoLocal, "titulo" | "corpo">): string {
  return `${aviso.titulo} ${aviso.corpo}`;
}

export class VitrineIndiscreta extends Error {}

export type DetalheDaTarefaNova = {
  /** O município da sessão. É o carimbo que a terceira barreira examina. */
  organizacaoId: string;
  ocorrenciaId: string;
  severidade: Severidade | null;
};

export function montarAvisoLocalDeTarefaNova(detalhe: DetalheDaTarefaNova): AvisoLocal {
  const dados: Record<string, string> = {
    tipo: "tarefa_nova",
    organizacaoId: detalhe.organizacaoId,
    ocorrenciaId: detalhe.ocorrenciaId,
    ...(detalhe.severidade ? { severidade: detalhe.severidade } : {}),
  };

  const aviso: AvisoLocal = {
    ...VITRINE.tarefa_nova,
    dados,
    som: SOM_DE_DESPACHO,
    canal: CANAL_DESPACHO,
    vibracao: VIBRACAO_DE_DESPACHO,
  };

  /*
    Trava de tempo de execução, além do teste. A mesma de `mensagem.ts` na
    API, pelo mesmo motivo: hoje ela não pode disparar, porque a vitrine é
    constante; ela existe para o dia em que alguém achar que o protocolo na
    tela bloqueada é mais útil.
  */
  const visivel = textoVisivel(aviso).toLowerCase();
  for (const [campo, valor] of Object.entries(dados)) {
    if (campo === "tipo") continue;
    if (valor.length < 3) continue;
    if (visivel.includes(valor.toLowerCase())) {
      throw new VitrineIndiscreta(
        `O texto visível do aviso local carrega o campo "${campo}". Ele fica legível `
        + "na tela bloqueada, na mão de quem estiver por perto. Detalhe vai no dado, "
        + "nunca na vitrine.",
      );
    }
  }

  return aviso;
}
