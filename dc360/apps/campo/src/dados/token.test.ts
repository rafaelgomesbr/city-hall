import type { Credenciais } from "./api";
import { criarObtentorDeToken, lerExpiracaoDoAcesso } from "./token";

/**
 * O que estes testes protegem.
 *
 * O token de renovação é rotativo e o servidor derruba TODAS as sessões do
 * agente ao ver um token já gasto voltar. A falha é silenciosa: o token de
 * acesso derrubado continua sendo aceito até vencer. Na prática o agente
 * termina três vistorias no morro, desce, e descobre que perdeu tudo.
 *
 * Por isso os testes contam requisições a `/auth/renovar`, e não estado
 * interno: o número de renovações É o comportamento observável que separa o
 * aplicativo que funciona do que destrói o trabalho do dia.
 */

/** JWT de mentira, só com o `exp` que importa. Não é assinado nem precisa. */
function tokenQueVenceEm(msNoFuturo: number, agora = Date.now()): string {
  const emBase64Url = (texto: string) =>
    btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const carga = { sub: "agente", exp: Math.floor((agora + msNoFuturo) / 1000) };
  return [
    emBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    emBase64Url(JSON.stringify(carga)),
    "assinatura-de-mentira",
  ].join(".");
}

/**
 * Um cofre de mentira que se comporta como o de verdade: leitura sempre
 * devolve o que vale AGORA, e não o que valia quando a função foi criada.
 */
function cofre(inicial: Credenciais) {
  let atual: Credenciais | null = inicial;
  return {
    lerCredenciais: () => atual,
    guardarCredenciais: async (novas: Credenciais) => { atual = novas; },
    trocarPorFora: (novas: Credenciais | null) => { atual = novas; },
    get valor() { return atual; },
  };
}

describe("lerExpiracaoDoAcesso", () => {
  it("lê o exp do token de acesso sem verificar assinatura", () => {
    const agora = 1_700_000_000_000;
    const acesso = tokenQueVenceEm(15 * 60_000, agora);
    // Arredonda para segundo porque é assim que o `exp` do JWT é definido.
    expect(lerExpiracaoDoAcesso(acesso)).toBe(
      Math.floor((agora + 15 * 60_000) / 1000) * 1000,
    );
  });

  it("devolve nulo para coisa que não é JWT, em vez de explodir", () => {
    const semExp = btoa(JSON.stringify({ sub: "agente" }));
    expect(lerExpiracaoDoAcesso("")).toBeNull();
    expect(lerExpiracaoDoAcesso("token-opaco")).toBeNull();
    expect(lerExpiracaoDoAcesso("a.b.c")).toBeNull();
    expect(lerExpiracaoDoAcesso("x." + semExp + ".y")).toBeNull();
  });
});

describe("criarObtentorDeToken", () => {
  it("cinco chamadas ao mesmo tempo emitem UMA renovação", async () => {
    const agora = 1_700_000_000_000;
    // Token vencendo em trinta segundos: dentro da folga, então renovar é o
    // certo. O que não pode é renovar cinco vezes.
    const c = cofre({ acesso: tokenQueVenceEm(30_000, agora), renovacao: "r1" });

    let renovacoes = 0;
    const obterToken = criarObtentorDeToken({
      lerCredenciais: c.lerCredenciais,
      guardarCredenciais: c.guardarCredenciais,
      agora: () => agora,
      renovar: async () => {
        renovacoes += 1;
        // Uma volta pelo laço de eventos, como uma requisição de verdade.
        await new Promise((r) => setTimeout(r, 0));
        return {
          acesso: tokenQueVenceEm(15 * 60_000, agora),
          renovacao: "r" + String(renovacoes + 1),
        };
      },
      folgaMs: 120_000,
    });

    const tokens = await Promise.all([
      obterToken(), obterToken(), obterToken(), obterToken(), obterToken(),
    ]);

    expect(renovacoes).toBe(1);
    // E todas as cinco recebem o token novo, não o velho.
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).toBe(c.valor?.acesso);
  });

  it("não renova quando o token ainda tem folga: sete pedidos, zero renovações", async () => {
    const agora = 1_700_000_000_000;
    const c = cofre({ acesso: tokenQueVenceEm(15 * 60_000, agora), renovacao: "r1" });

    let renovacoes = 0;
    const obterToken = criarObtentorDeToken({
      lerCredenciais: c.lerCredenciais,
      guardarCredenciais: c.guardarCredenciais,
      agora: () => agora,
      renovar: async () => {
        renovacoes += 1;
        return { acesso: tokenQueVenceEm(15 * 60_000, agora), renovacao: "r2" };
      },
      folgaMs: 120_000,
    });

    // Uma vistoria com três fotos: o transporte pede o token sete vezes.
    for (let i = 0; i < 7; i += 1) await obterToken();

    expect(renovacoes).toBe(0);
    expect(c.valor?.renovacao).toBe("r1");
  });

  it("renova ao entrar na folga, e usa sempre o token de renovação mais recente", async () => {
    const nascimento = 1_700_000_000_000;
    let agora = nascimento;
    const c = cofre({ acesso: tokenQueVenceEm(15 * 60_000, nascimento), renovacao: "r1" });

    const renovacoesUsadas: string[] = [];
    const obterToken = criarObtentorDeToken({
      lerCredenciais: c.lerCredenciais,
      guardarCredenciais: c.guardarCredenciais,
      agora: () => agora,
      renovar: async (renovacao) => {
        renovacoesUsadas.push(renovacao);
        return {
          acesso: tokenQueVenceEm(15 * 60_000, agora),
          renovacao: "r" + String(renovacoesUsadas.length + 1),
        };
      },
      folgaMs: 120_000,
    });

    await obterToken();
    expect(renovacoesUsadas).toEqual([]);

    // Treze minutos e um segundo depois: falta menos de dois minutos.
    agora = nascimento + 13 * 60_000 + 1_000;
    await obterToken();
    expect(renovacoesUsadas).toEqual(["r1"]);

    // Mais treze minutos: renova de novo, agora com o token ROTACIONADO.
    // Reapresentar "r1" aqui é exatamente o que a API lê como roubo.
    agora = agora + 13 * 60_000 + 1_000;
    await obterToken();
    expect(renovacoesUsadas).toEqual(["r1", "r2"]);
  });

  it("devolve o token atual e respeita o piso quando a renovação falha", async () => {
    let agora = 1_700_000_000_000;
    const velho = tokenQueVenceEm(30_000, agora);
    const c = cofre({ acesso: velho, renovacao: "r1" });

    let tentativas = 0;
    const obterToken = criarObtentorDeToken({
      lerCredenciais: c.lerCredenciais,
      guardarCredenciais: c.guardarCredenciais,
      agora: () => agora,
      renovar: async () => { tentativas += 1; throw new Error("sem sinal"); },
      folgaMs: 120_000,
      intervaloMinimoMs: 60_000,
    });

    expect(await obterToken()).toBe(velho);
    expect(tentativas).toBe(1);

    // Dez pedidos logo em seguida não viram dez requisições contra um
    // servidor que já disse não.
    for (let i = 0; i < 10; i += 1) expect(await obterToken()).toBe(velho);
    expect(tentativas).toBe(1);

    // Passado o piso, tenta de novo: ainda dá tempo antes de o token morrer.
    agora += 61_000;
    await obterToken();
    expect(tentativas).toBe(2);
  });

  it("não ressuscita sessão encerrada com resposta de renovação atrasada", async () => {
    const agora = 1_700_000_000_000;
    const c = cofre({ acesso: tokenQueVenceEm(30_000, agora), renovacao: "r1" });

    let liberar: (() => void) | null = null;
    const obterToken = criarObtentorDeToken({
      lerCredenciais: c.lerCredenciais,
      guardarCredenciais: c.guardarCredenciais,
      agora: () => agora,
      renovar: async () => {
        await new Promise<void>((r) => { liberar = r; });
        return { acesso: tokenQueVenceEm(15 * 60_000, agora), renovacao: "r2" };
      },
      folgaMs: 120_000,
    });

    const emVoo = obterToken();
    await new Promise((r) => setTimeout(r, 0));

    // O agente sai enquanto a renovação está no ar.
    c.trocarPorFora(null);
    if (liberar) (liberar as () => void)();

    expect(await emVoo).toBeNull();
    expect(c.valor).toBeNull();
  });

  it("sem credenciais devolve nulo sem tocar na rede", async () => {
    let renovacoes = 0;
    const obterToken = criarObtentorDeToken({
      lerCredenciais: () => null,
      guardarCredenciais: async () => undefined,
      renovar: async () => { renovacoes += 1; return { acesso: "x", renovacao: "y" }; },
    });

    expect(await obterToken()).toBeNull();
    expect(renovacoes).toBe(0);
  });
});
