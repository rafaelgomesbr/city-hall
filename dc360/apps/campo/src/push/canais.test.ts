import { SEVERIDADES } from "@dc360/shared";

import {
  CANAIS, CANAL_COMUM, CANAL_DESPACHO, CANAL_URGENCIA, SOM_DE_DESPACHO,
  VIBRACAO_DE_DESPACHO, canalDoAviso, deveTocarSom,
} from "./canais";

/**
 * Três canais no Android: o despacho toca sempre, o prazo toca por severidade.
 *
 * A decisão de 15/09/2026, na letra de quem paga: o celular do agente deve
 * obrigatoriamente ser notificado, vibrado ou sonoro, de que recebeu uma nova
 * ocorrência, com som característico. Isso desfaz, PARA O DESPACHO, a regra
 * anterior de "som só para alta e crítica". A regra anterior continua valendo
 * para o aviso de prazo, e o argumento dela (um prazo baixo tocando às três da
 * manhã ensina o agente a calar o aplicativo inteiro) continua verdadeiro para
 * o prazo: prazo é relógio. Despacho é uma pessoa decidindo agora que esta
 * equipe vai, e quem despacha às três da manhã precisa da equipe às três da
 * manhã.
 */

describe("o despacho toca em toda severidade", () => {
  it("manda a tarefa nova para o canal de despacho, seja qual for a severidade", () => {
    for (const severidade of SEVERIDADES) {
      expect(canalDoAviso({ tipo: "tarefa_nova", severidade })).toBe(CANAL_DESPACHO);
    }
    expect(canalDoAviso({ tipo: "tarefa_nova", severidade: null })).toBe(CANAL_DESPACHO);
  });

  it("faz som na tarefa nova de severidade baixa, média, alta, crítica e desconhecida", () => {
    for (const severidade of [...SEVERIDADES, null]) {
      expect(deveTocarSom({ tipo: "tarefa_nova", severidade })).toBe(true);
    }
  });

  /*
    O canal de despacho tem som próprio, vibração explícita e importância
    máxima. Cada um dos três é uma condição do pedido: "sonoro" é o som,
    "vibrado" é o padrão, e importância máxima é o que faz o Android mostrar o
    aviso por cima de qualquer tela, como uma chamada.
  */
  it("declara o canal de despacho com o som característico, vibração e importância máxima", () => {
    const despacho = CANAIS.find((c) => c.id === CANAL_DESPACHO);
    expect(despacho).toBeDefined();
    expect(despacho?.som).toBe(SOM_DE_DESPACHO);
    expect(despacho?.importancia).toBe("maxima");
    expect(despacho?.vibracao).toEqual(VIBRACAO_DE_DESPACHO);
    // Padrão do Android: espera, vibra, espera, vibra... Precisa de pelo menos
    // um pulso de verdade, e um pulso de 50 ms ninguém sente no bolso.
    expect(VIBRACAO_DE_DESPACHO.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...VIBRACAO_DE_DESPACHO.slice(1))).toBeGreaterThanOrEqual(200);
  });

  it("o som característico é o arquivo que o app.config.ts declara ao plugin", () => {
    // O nome precisa bater com o `sounds` do plugin: o Android resolve pelo nome
    // do recurso em res/raw, e o iOS pelo nome do arquivo no bundle.
    expect(SOM_DE_DESPACHO).toBe("despacho.wav");
  });

  /*
    `bypassDnd` é decisão da PESSOA, e não do aplicativo. Ela liga nos ajustes
    do Android se quiser que o despacho fure o "Não perturbe"; o aplicativo não
    pode decidir isso por ela, porque é o mesmo caminho que leva a calar tudo.
  */
  it("não fura o Não Perturbe por conta própria", () => {
    for (const canal of CANAIS) {
      expect((canal as { bypassDnd?: boolean }).bypassDnd).toBeUndefined();
    }
  });
});

describe("o prazo continua tocando por severidade", () => {
  it("acorda só nas duas severidades que justificam acordar alguém", () => {
    expect(canalDoAviso({ tipo: "prazo_vencendo", severidade: "critica" })).toBe(CANAL_URGENCIA);
    expect(canalDoAviso({ tipo: "prazo_vencendo", severidade: "alta" })).toBe(CANAL_URGENCIA);
    expect(canalDoAviso({ tipo: "prazo_vencendo", severidade: "media" })).toBe(CANAL_COMUM);
    expect(canalDoAviso({ tipo: "prazo_vencendo", severidade: "baixa" })).toBe(CANAL_COMUM);
  });

  it("faz som exatamente no canal de urgência, e em nenhum outro", () => {
    expect(deveTocarSom({ tipo: "prazo_vencendo", severidade: "critica" })).toBe(true);
    expect(deveTocarSom({ tipo: "prazo_vencendo", severidade: "alta" })).toBe(true);
    expect(deveTocarSom({ tipo: "prazo_vencendo", severidade: "media" })).toBe(false);
    expect(deveTocarSom({ tipo: "prazo_vencendo", severidade: "baixa" })).toBe(false);
  });

  /*
    Severidade desconhecida no PRAZO cai no silêncio. Errar para este lado
    custa um aviso que espera o agente abrir o aplicativo; errar para o outro
    custa o aplicativo silenciado nos ajustes para sempre.
  */
  it("manda o prazo de severidade desconhecida para o canal silencioso", () => {
    expect(canalDoAviso({ tipo: "prazo_vencendo", severidade: null })).toBe(CANAL_COMUM);
    expect(deveTocarSom({ tipo: "prazo_vencendo", severidade: null })).toBe(false);
  });

  /*
    A taxonomia tem quatro palavras e a comparação não pode ser por ordem: em
    ordem alfabética "alta" vem antes de "baixa", e um `>=` daria exatamente o
    resultado invertido. Este caso reprova no dia em que alguém trocar a lista
    por uma comparação.
  */
  it("responde para as quatro severidades da taxonomia, sem sobrar nenhuma", () => {
    for (const severidade of SEVERIDADES) {
      expect([CANAL_URGENCIA, CANAL_COMUM]).toContain(
        canalDoAviso({ tipo: "prazo_vencendo", severidade }),
      );
    }
    expect(SEVERIDADES.filter((s) => deveTocarSom({ tipo: "prazo_vencendo", severidade: s })))
      .toEqual(["alta", "critica"]);
  });
});

describe("os canais, como o Android os congela", () => {
  /*
    O Android congela som, vibração e importância de um canal no momento em
    que ele é criado: editar estes valores não muda o canal de quem já tem o
    aplicativo instalado. A versão no identificador é o que permite corrigir
    isso um dia, e este caso existe para quem for mexer nos valores ler o
    comentário antes.

    O canal de despacho é NOVO (identificador que nenhum aparelho tem), e é por
    isso que ele nasce com o som certo em todo aparelho, inclusive nos que já
    tinham o aplicativo. Os dois antigos continuam, porque continuam servindo
    ao aviso de prazo.
  */
  it("mantém os três canais separados, com identificador versionado", () => {
    expect(new Set([CANAL_DESPACHO, CANAL_URGENCIA, CANAL_COMUM]).size).toBe(3);
    for (const id of [CANAL_DESPACHO, CANAL_URGENCIA, CANAL_COMUM]) {
      expect(id).toMatch(/^dc360\.[a-z]+\.v\d+$/);
    }
    expect(CANAIS.map((c) => c.id)).toEqual([CANAL_DESPACHO, CANAL_URGENCIA, CANAL_COMUM]);
    expect(CANAIS.map((c) => c.importancia)).toEqual(["maxima", "alta", "baixa"]);
  });

  it("o canal comum continua calado, e o de urgência continua com o som do sistema", () => {
    const comum = CANAIS.find((c) => c.id === CANAL_COMUM);
    const urgencia = CANAIS.find((c) => c.id === CANAL_URGENCIA);
    expect(comum?.som).toBeNull();
    expect(comum?.vibracao).toBeNull();
    expect(urgencia?.som).toBe("default");
    expect(urgencia?.vibracao).not.toBeNull();
  });

  /*
    Nome e descrição não são enfeite: são o texto que a pessoa lê na tela de
    notificações dos ajustes do Android, e é por ele que ela decide qual dos
    três calar. Canal sem descrição vira "Canal 1" e "Canal 2" para quem está
    tentando parar de ser acordado. E a descrição do despacho precisa dizer que
    ele toca sempre, para a escolha de calar ser informada.
  */
  it("diz, em cada canal, o que cai nele", () => {
    for (const canal of CANAIS) {
      expect(canal.nome.length).toBeGreaterThan(0);
      expect(canal.descricao.length).toBeGreaterThan(20);
    }
    const despacho = CANAIS.find((c) => c.id === CANAL_DESPACHO);
    expect(despacho?.descricao).toMatch(/severidade/i);
    expect(despacho?.descricao).toMatch(/toca/i);
  });
});
