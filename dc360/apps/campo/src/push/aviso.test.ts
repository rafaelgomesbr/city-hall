import { decidirAviso, lerAviso } from "./aviso";

/**
 * A terceira barreira contra o aviso de outro município.
 *
 * O que está sendo travado aqui é a regra número um do projeto, e não uma
 * questão de conforto. A ficha de push identifica um APARELHO FÍSICO e a
 * unicidade dela no banco é por município, de propósito, então a mesma ficha
 * pode ficar viva em duas prefeituras ao mesmo tempo. O custo assumido dessa
 * escolha é que um aviso despachado por A pode alcançar um aparelho que hoje
 * está logado em B, e o aplicativo é o ÚNICO lugar do sistema que sabe quem
 * está logado neste aparelho agora.
 *
 * Sem esta comparação o defeito deixa de ser barulho e vira vazamento entre
 * municípios: a tela de tarefas do agente de B abriria a ocorrência de A.
 *
 * As duas formas de payload abaixo são as de verdade, conferidas no código do
 * servidor: `push/apns.ts` escreve o detalhe AO LADO de `aps`, e `push/fcm.ts`
 * escreve dentro de `data`. Testar só uma delas seria deixar uma das duas lojas
 * sem barreira, e o aparelho sem barreira é justamente o que vaza.
 */

const MUNICIPIO_A = "3f1c6c4e-0a1b-4c2d-8e3f-aaaaaaaaaaaa";
const MUNICIPIO_B = "7b2d5e8a-1c3d-4e5f-9a0b-bbbbbbbbbbbb";
const OCORRENCIA = "11111111-2222-3333-4444-555555555555";

/** Como o aviso chega pelo APNs: o detalhe é irmão de `aps`. */
function comoNoIos(organizacaoId: string, extras: Record<string, string> = {}) {
  return {
    data: {},
    body: {
      aps: { alert: { title: "Nova tarefa", body: "A sua equipe recebeu uma tarefa." } },
      tipo: "tarefa_nova",
      organizacaoId,
      ocorrenciaId: OCORRENCIA,
      ...extras,
    },
  };
}

/** Como o aviso chega pelo FCM: o detalhe vai dentro de `data`. */
function comoNoAndroid(organizacaoId: string, extras: Record<string, string> = {}) {
  return {
    data: {
      tipo: "prazo_vencendo",
      organizacaoId,
      ocorrenciaId: OCORRENCIA,
      ...extras,
    },
    body: null,
  };
}

it("entrega o aviso do município da sessão, no formato do iOS", () => {
  const veredito = decidirAviso(comoNoIos(MUNICIPIO_A), MUNICIPIO_A);
  expect(veredito.entregar).toBe(true);
  if (!veredito.entregar) throw new Error("deveria entregar");
  expect(veredito.aviso.ocorrenciaId).toBe(OCORRENCIA);
  expect(veredito.aviso.tipo).toBe("tarefa_nova");
});

it("entrega o aviso do município da sessão, no formato do Android", () => {
  const veredito = decidirAviso(comoNoAndroid(MUNICIPIO_A), MUNICIPIO_A);
  expect(veredito.entregar).toBe(true);
  if (!veredito.entregar) throw new Error("deveria entregar");
  expect(veredito.aviso.tipo).toBe("prazo_vencendo");
});

it("DESCARTA o aviso de outro município no iOS, e diz por quê", () => {
  const veredito = decidirAviso(comoNoIos(MUNICIPIO_B), MUNICIPIO_A);
  expect(veredito).toEqual({ entregar: false, motivo: "outro_municipio" });
});

it("DESCARTA o aviso de outro município no Android, e diz por quê", () => {
  const veredito = decidirAviso(comoNoAndroid(MUNICIPIO_B), MUNICIPIO_A);
  expect(veredito).toEqual({ entregar: false, motivo: "outro_municipio" });
});

/*
  Sem sessão nada é legítimo, e este caso fecha um buraco real: o agente que sai
  da conta sem sinal deixa a ficha registrada no servidor, porque `/auth/sair`
  não chegou lá. O aparelho continua recebendo tarefa da equipe de quem já saiu,
  e num telefone de plantão que passa de turno em turno isso é vazamento de dado
  operacional.
*/
it("descarta quando ninguém está logado neste aparelho", () => {
  expect(decidirAviso(comoNoIos(MUNICIPIO_A), null)).toEqual({
    entregar: false, motivo: "sem_sessao",
  });
});

/*
  A identidade guardada no cofre por uma versão anterior do aplicativo não tem
  `organizacaoId`. Entregar "porque provavelmente é do mesmo município" trocaria
  a regra número um por uma suposição, então a barreira falha FECHADA: o agente
  volta a receber aviso na próxima vez que entrar.
*/
it("descarta quando a sessão é de uma versão que não guardava o município", () => {
  expect(decidirAviso(comoNoIos(MUNICIPIO_A), undefined)).toEqual({
    entregar: false, motivo: "sem_sessao",
  });
  expect(decidirAviso(comoNoIos(MUNICIPIO_A), "   ")).toEqual({
    entregar: false, motivo: "sem_sessao",
  });
});

/*
  Aviso sem município é aviso que a barreira não consegue examinar. Aceitá-lo
  seria o jeito exato de a barreira virar decoração: bastaria uma mensagem sem o
  campo para tudo passar.
*/
it("descarta o aviso sem município, em vez de deixá-lo passar", () => {
  const semMunicipio = { data: { tipo: "tarefa_nova", ocorrenciaId: OCORRENCIA } };
  expect(decidirAviso(semMunicipio, MUNICIPIO_A)).toEqual({
    entregar: false, motivo: "ilegivel",
  });
});

it("descarta o que não é aviso deste produto", () => {
  expect(decidirAviso(null, MUNICIPIO_A).entregar).toBe(false);
  expect(decidirAviso("texto solto", MUNICIPIO_A).entregar).toBe(false);
  expect(decidirAviso({ data: { tipo: "promocao" } }, MUNICIPIO_A).entregar).toBe(false);
});

it("aceita a mesma identidade escrita com caixa e espaço diferentes", () => {
  const veredito = decidirAviso(
    comoNoIos(MUNICIPIO_A.toUpperCase()),
    ` ${MUNICIPIO_A} `,
  );
  expect(veredito.entregar).toBe(true);
});

it("lê a severidade e o prazo quando eles vêm, e aceita a ausência dos dois", () => {
  const com = lerAviso(comoNoAndroid(MUNICIPIO_A, {
    severidade: "critica", prazoEm: "2026-09-09T21:00:00.000Z",
  }));
  expect(com?.severidade).toBe("critica");
  expect(com?.prazoEm).toBe("2026-09-09T21:00:00.000Z");

  const sem = lerAviso(comoNoAndroid(MUNICIPIO_A));
  expect(sem?.severidade).toBeNull();
  expect(sem?.prazoEm).toBeNull();
});

/*
  Severidade fora da taxonomia vira nula, e não passa adiante como palavra
  desconhecida. É o que faz `canalDoAviso` cair no canal silencioso em vez de
  tentar decidir sobre uma palavra que não é severidade nenhuma.
*/
it("ignora severidade que não é da taxonomia", () => {
  expect(lerAviso(comoNoAndroid(MUNICIPIO_A, { severidade: "urgentissima" }))?.severidade)
    .toBeNull();
});

/*
  O servidor NÃO manda protocolo nem endereço no dado da mensagem (ver
  `push/mensagem.ts` na API: eles atravessam a fronteira e identificam família
  em situação de risco). Este caso trava o lado de cá: nem que eles cheguem, o
  aplicativo passa a depender deles.
*/
it("abre a tarefa com o identificador da ocorrência, sem precisar de endereço", () => {
  const aviso = lerAviso(comoNoIos(MUNICIPIO_A));
  expect(aviso?.ocorrenciaId).toBe(OCORRENCIA);
  expect(Object.keys(aviso ?? {})).not.toContain("endereco");
  expect(Object.keys(aviso ?? {})).not.toContain("protocolo");
});
