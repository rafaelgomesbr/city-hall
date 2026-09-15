import { SemSinal } from "./api";
import { comoContarAFalha, motivoDaFalha } from "./falha-de-atualizacao";

/**
 * O acesso suspenso pelo fornecedor não é "sua sessão terminou".
 *
 * O console do fornecedor pode suspender o acesso de uma prefeitura, e a API
 * responde `acesso_suspenso` (403, ou 503 nas rotas da fila) a tudo que vem
 * dela: à entrada, à renovação, e ao token vencido que este aplicativo
 * continua apresentando depois que a renovação falha. Até aqui a tela lia
 * qualquer 401 como "sua sessão terminou" e oferecia "Sair e entrar de novo",
 * e entrar de novo num município suspenso dá 403 para sempre: o botão mandava
 * o agente fazer a única coisa que não resolve, e de quebra apagava do
 * aparelho a identidade que carimba a coleta.
 *
 * O que muda: um motivo próprio, classificado pelo CÓDIGO da resposta (o
 * status varia entre 403 e 503 de propósito, ver `auth/suspensao.ts` na API),
 * com frase que diz quem resolve e promete que a coleta continua guardada. E
 * sem ato, porque não existe ato do agente que resolva.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

/** A resposta do servidor, por forma: ver a razão em `falha-de-atualizacao`. */
class RespostaDoServidor extends Error {
  constructor(readonly status: number, readonly codigo: string) {
    super(`resposta ${status}`);
  }
}

describe("classificar a falha", () => {
  it("403 acesso_suspenso é acesso suspenso, e não sessão encerrada", () => {
    expect(motivoDaFalha(new RespostaDoServidor(403, "acesso_suspenso"))).toBe("acesso-suspenso");
  });

  it("503 acesso_suspenso (o que a fila recebe) também é acesso suspenso, e não 'outro'", () => {
    expect(motivoDaFalha(new RespostaDoServidor(503, "acesso_suspenso"))).toBe("acesso-suspenso");
  });

  it("403 de outro código continua sendo 'outro': perfil sem permissão não é suspensão", () => {
    expect(motivoDaFalha(new RespostaDoServidor(403, "sem_permissao"))).toBe("outro");
  });

  it("401 continua sendo sessão encerrada", () => {
    expect(motivoDaFalha(new RespostaDoServidor(401, "nao_autenticado"))).toBe("sessao-encerrada");
  });

  it("sem sinal continua sendo sem sinal", () => {
    expect(motivoDaFalha(new SemSinal())).toBe("sem-sinal");
  });
});

describe("o que a tela escreve para o acesso suspenso", () => {
  const frase = comoContarAFalha("acesso-suspenso", "Mostrando o que já estava no aparelho.");

  it("diz que foi o fornecedor, e quem resolve é quem administra o contrato", () => {
    expect(frase.resumo).toMatch(/suspenso/i);
    expect(frase.detalhe).toMatch(/fornecedor/i);
    expect(frase.detalhe).toMatch(/contrato/i);
  });

  it("NÃO manda entrar de novo, porque entrar de novo não resolve", () => {
    // A frase da sessão encerrada é a instrução: "Vá em Perfil, toque em Sair
    // da conta e entre de novo". Nada disso pode aparecer como instrução aqui.
    expect(frase.detalhe).not.toMatch(/vá em perfil|toque em|entre de novo/i);
    expect(frase.detalhe).toMatch(/não resolve/i);
    const daSessao = comoContarAFalha("sessao-encerrada", "a lista");
    expect(frase.detalhe).not.toBe(daSessao.detalhe);
    expect(frase.resumo).not.toBe(daSessao.resumo);
  });

  it("promete que o que foi coletado continua guardado, como a frase da sessão encerrada promete", () => {
    // É a mesma promessa, pela mesma razão: o que o agente mais teme é perder
    // a vistoria que fez no morro. E é verdade nos dois casos: a fila
    // sobrevive, e a API responde 503 à fila para ela esperar em vez de
    // bloquear.
    expect(frase.detalhe).toMatch(/continua guardad/i);
  });

  it("o resumo cabe numa linha da faixa", () => {
    expect(frase.resumo.length).toBeLessThanOrEqual(32);
  });
});
