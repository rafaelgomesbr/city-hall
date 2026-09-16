jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo" } } },
}));

import { ErroDaApi, SemSinal } from "../dados/api";
import { criarDuploDePorta } from "./duplo-de-porta";
import {
  classificarFalha, lerAmbienteDoBuild, mereceContar, registrarEsteAparelho,
} from "./registro";

/**
 * Registrar a ficha depois do login, e não alarmar com o que não tem conserto.
 *
 * O valor deste arquivo está menos no caminho feliz e mais na classificação das
 * falhas. Push desligado no servidor, aparelho sem ficha e sinal ruim são três
 * coisas muito diferentes entre si, e todas as três têm em comum uma coisa: o
 * agente que está na rua não pode fazer NADA a respeito de nenhuma delas.
 * Tratá-las como erro produziria um alarme vermelho sobre algo sem ação, e
 * alarme sem ação é como se ensina alguém a ignorar alarme, inclusive o aviso
 * de prazo que este produto existe para dar.
 */

/*
  A rota de aparelhos responde 503 quando o push está desligado, em vez de
  aceitar e guardar em silêncio, exatamente para que o aplicativo possa saber e
  ficar quieto. Se ela aceitasse, o agente esperaria um aviso que nunca vem, que
  foi o que aconteceu com a recuperação de senha por semanas.
*/
it("trata o push desligado no servidor como normal, e não como erro", async () => {
  const desligado = new ErroDaApi(503, "push_desligado", "A notificação está desligada.");
  expect(classificarFalha(desligado)).toBe("push_desligado");
  expect(mereceContar("push_desligado")).toBe(false);
});

it("trata o Android sem Firebase no servidor do mesmo jeito", async () => {
  const semAndroid = new ErroDaApi(503, "push_android_desligado", "Ainda não ligada.");
  expect(classificarFalha(semAndroid)).toBe("push_desligado");
});

it("não alarma por sinal ruim nem por aparelho sem ficha", () => {
  expect(classificarFalha(new SemSinal())).toBe("sem_sinal");
  expect(mereceContar("sem_sinal")).toBe(false);
  expect(mereceContar("sem_ficha")).toBe(false);
  expect(mereceContar("registrado")).toBe(false);
});

/*
  O que SOBRA depois dos três casos acima merece aparecer, porque aí sim pode
  haver algo a fazer (entrar de novo, avisar a coordenação). Sem esta linha,
  classificar tudo como normal esconderia um defeito de verdade.
*/
it("conta o que sobra, para o defeito de verdade não ficar invisível", () => {
  expect(classificarFalha(new ErroDaApi(422, "invalido", "Plataforma inválida"))).toBe("falhou");
  expect(classificarFalha(new Error("qualquer outra coisa"))).toBe("falhou");
  expect(mereceContar("falhou")).toBe(true);
});

it("registra a ficha deste aparelho quando o servidor aceita", async () => {
  const duplo = criarDuploDePorta({ plataforma: "ios", ficha: "abc123" });
  const enviadas: { plataforma: string; ficha: string }[] = [];

  const desfecho = await registrarEsteAparelho({
    porta: duplo.porta,
    registrar: async (plataforma, ficha) => { enviadas.push({ plataforma, ficha }); },
    guardarFicha: async () => undefined,
  });

  expect(desfecho).toBe("registrado");
  expect(enviadas).toEqual([{ plataforma: "ios", ficha: "abc123" }]);
});

/*
  A cópia local é gravada ANTES da ida à rede, e a ordem é a decisão.

  Gravada depois, a entrada feita com sinal ruim terminaria sem ficha no cofre,
  e o logout daquele plantão iria embora sem ter o que mandar para `/auth/sair`.
  O aparelho seguiria recebendo tarefa da equipe de quem já saiu, que num
  telefone de plantão que passa de turno em turno é vazamento de dado
  operacional.
*/
it("guarda a ficha no cofre mesmo quando o servidor não responde", async () => {
  const duplo = criarDuploDePorta({ ficha: "ficha-do-plantao" });
  const guardadas: string[] = [];

  const desfecho = await registrarEsteAparelho({
    porta: duplo.porta,
    registrar: async () => { throw new SemSinal(); },
    guardarFicha: async (f) => { guardadas.push(f); },
  });

  expect(desfecho).toBe("sem_sinal");
  expect(guardadas).toEqual(["ficha-do-plantao"]);
});

it("não fala com o servidor quando este aparelho não tem ficha", async () => {
  const duplo = criarDuploDePorta({ ficha: null });
  let falouComOServidor = false;

  const desfecho = await registrarEsteAparelho({
    porta: duplo.porta,
    registrar: async () => { falouComOServidor = true; },
    guardarFicha: async () => undefined,
  });

  expect(desfecho).toBe("sem_ficha");
  expect(falouComOServidor).toBe(false);
});

/*
  Sistema sem provisionamento de push levanta em vez de devolver nulo (simulador
  sem certificado, build interno sem direito). Para quem está na rua os dois
  casos são o mesmo: este aparelho não recebe, e o aplicativo continua inteiro.
*/
it("sobrevive ao sistema que levanta em vez de devolver ficha", async () => {
  const duplo = criarDuploDePorta();
  duplo.porta.obterFicha = async () => { throw new Error("sem direito de push"); };

  const desfecho = await registrarEsteAparelho({
    porta: duplo.porta,
    registrar: async () => undefined,
    guardarFicha: async () => undefined,
  });

  expect(desfecho).toBe("sem_ficha");
});

/*
  A rota aceita `ios` e `android` e recusa o resto com 422. Mandar de um
  ambiente que não é aparelho gastaria uma ida à rede para receber um erro que
  já dava para prever aqui.
*/
it("não tenta registrar de uma plataforma que a rota não conhece", async () => {
  const duplo = criarDuploDePorta({ plataforma: "outra" });
  let falouComOServidor = false;

  const desfecho = await registrarEsteAparelho({
    porta: duplo.porta,
    registrar: async () => { falouComOServidor = true; },
    guardarFicha: async () => undefined,
  });

  expect(desfecho).toBe("sem_ficha");
  expect(falouComOServidor).toBe(false);
  expect(duplo.registro.fichasPedidas).toBe(0);
});

/*
  O AMBIENTE DA APNs, lido do `extra` que `app.config.ts` assou no build.

  Vem da MESMA constante que decide o `aps-environment` no plugin do
  `expo-notifications`, então os dois não têm como divergir. O que este bloco
  tranca é a leitura: os dois valores conhecidos passam, e QUALQUER outra
  coisa (campo ausente num binário anterior ao campo, valor que ninguém
  reconhece, `extra` nulo) vira "não sei", e "não sei" NÃO vira chute. Mandar
  `producao` para um binário do sandbox é o defeito que a coluna do servidor
  existe para fechar.
*/
describe("o ambiente da APNs deste binário", () => {
  it("lê producao e teste do extra", () => {
    expect(lerAmbienteDoBuild({ pushAmbiente: "producao" })).toBe("producao");
    expect(lerAmbienteDoBuild({ pushAmbiente: "teste" })).toBe("teste");
  });

  it("qualquer outra coisa é 'não sei', e não um chute", () => {
    expect(lerAmbienteDoBuild({})).toBeNull();
    expect(lerAmbienteDoBuild(undefined)).toBeNull();
    expect(lerAmbienteDoBuild(null)).toBeNull();
    // A palavra da Apple, que alguém vai tentar um dia.
    expect(lerAmbienteDoBuild({ pushAmbiente: "sandbox" })).toBeNull();
    expect(lerAmbienteDoBuild({ pushAmbiente: "" })).toBeNull();
  });
});
