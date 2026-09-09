import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { enderecoDoCliente } from "../src/rede.js";

/**
 * De quem o servidor aceita cabeçalho de endereço de origem.
 *
 * `rede.ts` nasceu para fechar um defeito provado: com `trustProxy: true`, o
 * endereço vinha da entrada mais à esquerda de `X-Forwarded-For`, que é a que
 * o cliente escreve. A correção trocou o cabeçalho por `Fly-Client-IP` e
 * MANTEVE O DEFEITO, porque passou a ler o cabeçalho novo sem amarrar essa
 * leitura a ambiente, plataforma ou lista de proxies confiáveis. Fora do Fly,
 * `Fly-Client-IP` é um cabeçalho comum: quem chama escreve o que quiser.
 *
 * Duas coisas dependem desse valor, e a segunda é a grave:
 *
 *   1. O teto de tentativas de login. Trinta tentativas do mesmo endereço
 *      davam vinte recusas; as mesmas trinta com `Fly-Client-IP` diferente a
 *      cada uma davam ZERO, e a força bruta ficava livre.
 *   2. O endereço gravado na trilha. Quem exporta a base de cidadãos ESCOLHIA
 *      o endereço que fica registrado como autor do ato, e esse registro é a
 *      resposta do município à autoridade nacional no dia em que um dado vaza.
 *
 * A correção é declarar (`PROXY_DE_BORDA`), e o padrão é o valor seguro:
 * `nenhum` ignora o cabeçalho, `fly` o aceita. `docs/COLOCAR-DE-PE.md` oferece
 * Fly, Railway e Render como equivalentes, então adivinhar nunca foi opção.
 */

const CREDENCIAL = { email: "rita@serraalta.mg.gov.br", senha: "senha-que-nao-e-a-certa" };

/** O padrão de `LOGIN_POR_IP` é 10 na janela de 5 minutos. */
const TENTATIVAS = 30;
const TETO = 10;

let mem: BancoEmMemoria;
let semBorda: FastifyInstance;
let comFly: FastifyInstance;

function servidor(proxy?: string): Promise<FastifyInstance> {
  return construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      ...(proxy ? { PROXY_DE_BORDA: proxy } : {}),
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
}

/**
 * Bate na porta do login `TENTATIVAS` vezes e conta quantas foram recusadas
 * pelo limitador.
 *
 * `cabecalhos` é uma FUNÇÃO da tentativa porque o ataque é exatamente esse:
 * mandar um valor diferente a cada requisição para ganhar um balde novo a cada
 * requisição.
 */
async function martelar(
  app: FastifyInstance,
  cabecalhos: (tentativa: number) => Record<string, string>,
): Promise<number> {
  let recusadas = 0;
  for (let i = 0; i < TENTATIVAS; i += 1) {
    const r = await app.inject({
      method: "POST",
      url: "/auth/entrar",
      headers: cabecalhos(i),
      payload: CREDENCIAL,
    });
    if (r.statusCode === 429) recusadas += 1;
  }
  return recusadas;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  semBorda = await servidor();
  comFly = await servidor("fly");
  await semBorda.ready();
  await comFly.ready();
  // Tempo limite explícito, como nos arquivos irmãos: este `beforeAll` sobe
  // PGlite, aplica as migrações e semeia, e o teto padrão de 10 s do vitest
  // vira vermelho intermitente num runner de dois núcleos.
}, 180_000);

afterAll(async () => {
  await semBorda?.close();
  await comFly?.close();
  await mem?.banco.encerrar();
});

describe("O teto de login nao se contorna por cabecalho", () => {
  it("sem borda declarada, trocar Fly-Client-IP nao ganha balde novo", async () => {
    const recusadas = await martelar(semBorda, (i) => ({ "fly-client-ip": `10.0.0.${i}` }));

    /*
      Este é o caso que reprovava. Antes da correção, `enderecoDoCliente` lia
      `Fly-Client-IP` sempre, então cada tentativa caía num balde diferente e
      as trinta passavam: `recusadas` era ZERO.
    */
    expect(
      recusadas,
      "trocar Fly-Client-IP a cada tentativa contornou o teto de login",
    ).toBe(TENTATIVAS - TETO);
  }, 180_000);

  it("sem borda declarada, o teto continua valendo sem cabecalho nenhum", async () => {
    /*
      Contraponto obrigatório: sem ele, um limitador quebrado que recusasse
      tudo passaria no caso de cima, e a suíte ficaria verde provando nada.
      Os baldes do caso anterior já estão gastos, então este começa recusando
      desde a primeira tentativa.
    */
    const recusadas = await martelar(semBorda, () => ({}));
    expect(recusadas).toBeGreaterThan(0);
  }, 180_000);

  it("com a borda declarada, o cabecalho do edge volta a valer", async () => {
    // E precisa voltar mesmo: no Fly é `Fly-Client-IP` que carrega o endereço
    // real do cidadão, e ignorá-lo lá jogaria a Defesa Civil inteira, que sai
    // por um NAT só, dentro de um balde único.
    const separados = await martelar(comFly, (i) => ({ "fly-client-ip": `10.0.0.${i}` }));
    expect(separados).toBe(0);

    const mesmo = await martelar(comFly, () => ({ "fly-client-ip": "10.0.0.200" }));
    expect(mesmo).toBe(TENTATIVAS - TETO);
    /*
      Tempo limite explícito, como nos arquivos irmãos: são sessenta injeções
      contra PGlite, e com a suíte inteira em paralelo isso passa do teto
      padrão de 30 s do vitest. Portão que às vezes fica vermelho no mesmo
      commit ensina o time a ignorar vermelho.
    */
  }, 180_000);
});

describe("O endereco que vai para a trilha", () => {
  /**
   * Um pedido de mentira, com o mínimo que `enderecoDoCliente` lê.
   *
   * Direto na função porque é ela que alimenta `sessoes`, `exportacoes`,
   * `recuperacoes_senha` e `interesse_municipio`: montar a exportação inteira
   * para conferir uma coluna esconderia o que está sendo cobrado.
   */
  const pedido = (proxy: string | null, cabecalho: string) => ({
    headers: { "fly-client-ip": cabecalho },
    ip: "198.51.100.7",
    server: proxy ? { proxyDeBorda: proxy } : {},
  }) as never;

  it("sem borda declarada, o cabecalho nao entra na trilha", () => {
    expect(
      enderecoDoCliente(pedido(null, "203.0.113.9")),
      "o autor do ato na trilha foi escolhido por quem mandou o cabeçalho",
    ).toBe("198.51.100.7");
    expect(enderecoDoCliente(pedido("nenhum", "203.0.113.9"))).toBe("198.51.100.7");
  });

  it("com a borda declarada, o cabecalho do edge entra", () => {
    expect(enderecoDoCliente(pedido("fly", "203.0.113.9"))).toBe("203.0.113.9");
  });

  it("borda declarada e cabecalho ausente cai no salto imediato", () => {
    const semCabecalho = { headers: {}, ip: "198.51.100.7", server: { proxyDeBorda: "fly" } } as never;
    expect(enderecoDoCliente(semCabecalho)).toBe("198.51.100.7");
  });
});
