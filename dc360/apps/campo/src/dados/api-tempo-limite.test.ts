import { SemSinal, baixarMeuTrabalho, baixarPendencias } from "./api";

/**
 * O que este teste protege: o teto de espera ser proporcional ao que se perde.
 *
 * O aplicativo tinha um tempo limite só, de vinte segundos, para tudo. Vinte é
 * o número certo para o que não pode falhar (entrar, e baixar as ocorrências
 * antes de subir o morro): numa borda de cobertura o aperto de mão sozinho já
 * leva segundos, e desistir cedo dessas custa ao agente trabalhar sem lista.
 *
 * Só que "minha equipe" não é isso. Ela é conforto: se falhar, a tela mostra a
 * cópia que já está no aparelho e o plantão segue igual. E é a única chamada
 * que o agente espera parado, olhando para uma tela de espera. Vinte segundos
 * de tela parada foi o que produziu o relato do spinner pendurado: muito antes
 * disso o agente já concluiu que o aplicativo travou e já o matou.
 *
 * Por isso o teste mede o teto de cada uma em milissegundos, e não confere
 * constante: o que importa é o instante em que a promessa desiste.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

/**
 * O servidor que aceita a conexão e nunca responde, que é o caso ruim de
 * verdade: sinal fraco não recusa a conexão, ele engole a requisição. Quem
 * termina a espera é o cancelador do lado de cá, e nada mais.
 */
function servidorMudo(): jest.Mock {
  return jest.fn((_endereco: string, opcoes: { signal: AbortSignal }) =>
    new Promise((_cumprir, recusar) => {
      opcoes.signal.addEventListener("abort", () => recusar(new Error("abortado")));
    }));
}

/**
 * Acompanha a chamada sem esperar por ela, que é o ponto do teste.
 *
 * A pergunta é sempre "neste instante do relógio, ela já desistiu?", e não "o
 * que ela devolveu no fim". Esperar pela promessa responderia sim para
 * qualquer teto, inclusive o de vinte segundos que este teste precisa reprovar.
 */
function acompanhar(promessa: Promise<unknown>) {
  const marca = { desistiu: false };
  const desfecho = promessa.then(
    (valor) => { marca.desistiu = true; return valor as unknown; },
    (erro: unknown) => { marca.desistiu = true; return erro; },
  );
  return { marca, desfecho };
}

/** Deixa as promessas em voo andarem sem deixar o relógio falso andar junto. */
async function deixarRespirar(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe("o teto de espera de cada chamada", () => {
  it("baixar minha equipe desiste aos 8 segundos, e não aos 20", async () => {
    globalThis.fetch = servidorMudo() as unknown as typeof fetch;

    const { marca, desfecho } = acompanhar(baixarMeuTrabalho("token-de-teste"));

    /* Sete segundos e nove décimos: ainda esperando, sem desistir antes da hora. */
    jest.advanceTimersByTime(7_900);
    await deixarRespirar();
    expect(marca.desistiu).toBe(false);

    jest.advanceTimersByTime(100);
    await deixarRespirar();
    expect(marca.desistiu).toBe(true);

    const erro = await desfecho;
    /*
      E o que chega ao agente é a frase do sem sinal, não "Network request
      failed" em inglês no meio do barranco.
    */
    expect(erro).toBeInstanceOf(SemSinal);
    expect((erro as Error).message).toMatch(/continua guardado no aparelho/i);
  });

  it("baixar as ocorrências continua com os 20 segundos, porque perdê-las custa o plantão", async () => {
    globalThis.fetch = servidorMudo() as unknown as typeof fetch;

    const { marca, desfecho } = acompanhar(baixarPendencias("token-de-teste"));

    /*
      Aos oito segundos esta ainda está de pé. É a mesma marca em que a chamada
      de conforto já desistiu, e é isso que prova que os dois tetos são
      independentes, e não um número só copiado.
    */
    jest.advanceTimersByTime(8_000);
    await deixarRespirar();
    expect(marca.desistiu).toBe(false);

    jest.advanceTimersByTime(12_000);
    await deixarRespirar();
    expect(marca.desistiu).toBe(true);
    expect(await desfecho).toBeInstanceOf(SemSinal);
  });
});
