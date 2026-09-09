import { SEVERIDADES } from "@dc360/shared";

import { CANAIS, CANAL_COMUM, CANAL_URGENCIA, canalDoAviso, deveTocarSom } from "./canais";

/**
 * Dois canais no Android, e som só para alta e crítica.
 *
 * O defeito que isto trava é de disponibilidade, e ele é irreversível na
 * prática: um prazo de severidade baixa tocando às três da manhã ensina o
 * agente a silenciar o aplicativo inteiro nos ajustes do sistema. A partir daí
 * o aviso de severidade crítica também não toca, e ninguém do lado do servidor
 * fica sabendo, porque a entrega continua sendo bem sucedida.
 */

it("acorda só nas duas severidades que justificam acordar alguém", () => {
  expect(canalDoAviso("critica")).toBe(CANAL_URGENCIA);
  expect(canalDoAviso("alta")).toBe(CANAL_URGENCIA);
  expect(canalDoAviso("media")).toBe(CANAL_COMUM);
  expect(canalDoAviso("baixa")).toBe(CANAL_COMUM);
});

it("faz som exatamente no canal de urgência, e em nenhum outro", () => {
  expect(deveTocarSom("critica")).toBe(true);
  expect(deveTocarSom("alta")).toBe(true);
  expect(deveTocarSom("media")).toBe(false);
  expect(deveTocarSom("baixa")).toBe(false);
});

/*
  Severidade desconhecida cai no silêncio. Errar para este lado custa um aviso
  que espera o agente abrir o aplicativo; errar para o outro custa o aplicativo
  silenciado nos ajustes para sempre.
*/
it("manda a severidade desconhecida para o canal silencioso", () => {
  expect(canalDoAviso(null)).toBe(CANAL_COMUM);
  expect(deveTocarSom(null)).toBe(false);
});

/*
  A taxonomia tem quatro palavras e a comparação não pode ser por ordem: em
  ordem alfabética "alta" vem antes de "baixa", e um `>=` daria exatamente o
  resultado invertido. Este caso reprova no dia em que alguém trocar a lista por
  uma comparação.
*/
it("responde para as quatro severidades da taxonomia, sem sobrar nenhuma", () => {
  for (const severidade of SEVERIDADES) {
    expect([CANAL_URGENCIA, CANAL_COMUM]).toContain(canalDoAviso(severidade));
  }
  expect(SEVERIDADES.filter((s) => deveTocarSom(s))).toEqual(["alta", "critica"]);
});

/*
  O Android congela som e importância de um canal no momento em que ele é
  criado: editar estes valores não muda o canal de quem já tem o aplicativo
  instalado. A versão no identificador é o que permite corrigir isso um dia, e
  este caso existe para quem for mexer nos valores ler o comentário antes.
*/
it("mantém os dois canais separados, com identificador versionado", () => {
  expect(CANAL_URGENCIA).not.toBe(CANAL_COMUM);
  expect(CANAL_URGENCIA).toMatch(/\.v\d+$/);
  expect(CANAL_COMUM).toMatch(/\.v\d+$/);
  expect(CANAIS.map((c) => c.id)).toEqual([CANAL_URGENCIA, CANAL_COMUM]);
  expect(CANAIS.map((c) => c.peso)).toEqual(["urgente", "comum"]);
});

/*
  Nome e descrição não são enfeite: são o texto que a pessoa lê na tela de
  notificações dos ajustes do Android, e é por ele que ela decide qual dos dois
  calar. Canal sem descrição vira "Canal 1" e "Canal 2" para quem está tentando
  parar de ser acordado.
*/
it("diz, em cada canal, o que cai nele", () => {
  for (const canal of CANAIS) {
    expect(canal.nome.length).toBeGreaterThan(0);
    expect(canal.descricao.length).toBeGreaterThan(20);
  }
});
