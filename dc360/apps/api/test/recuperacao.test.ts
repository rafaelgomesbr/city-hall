import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";

/**
 * Recuperação e troca de senha.
 *
 * O que estes testes protegem não é o caminho feliz: é que a rota não vire um
 * verificador de quais emails existem na prefeitura, que um link não sirva
 * duas vezes, e que trocar a senha realmente expulse quem já estava dentro.
 * Esse último ponto é o que importa quando a troca acontece justamente porque
 * alguém invadiu a conta.
 */

const SENHA = "defesa-civil-2026";
const HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const JONAS = "jonas.ferreira@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let enviadas: Mensagem[] = [];

/** Notificador que guarda em vez de enviar: é o que torna o link inspecionável. */
const notificador: Notificador = {
  async enviar(m) { enviadas.push(m); return { idNoProvedor: null }; },
};

function linkDaUltima(): string {
  const corpo = enviadas.at(-1)!.corpo;
  return corpo.match(/https?:\/\/\S+/)![0];
}

function tokenDoLink(link: string): string {
  return decodeURIComponent(new URL(link).searchParams.get("token")!);
}

async function entrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-recuperacao-com-mais-de-32-bytes-x",
    LOGIN_POR_IP: "10000",
    URL_PAINEL: "https://painel.exemplo.gov.br",
    RECUPERACAO_MINUTOS: "30",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco, config, notificador,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => { enviadas = []; });

describe("Pedido de recuperação", () => {
  it("responde igual para email existente e inexistente", async () => {
    const existe = await app.inject({
      method: "POST", url: "/auth/recuperar", payload: { email: HELENA },
    });
    const naoExiste = await app.inject({
      method: "POST", url: "/auth/recuperar", payload: { email: "ninguem@exemplo.gov.br" },
    });

    expect(existe.statusCode).toBe(202);
    expect(naoExiste.statusCode).toBe(202);
    // Corpos idênticos: a rota não diz quais emails a prefeitura tem.
    expect(existe.json()).toEqual(naoExiste.json());

    // Mas só uma mensagem sai de fato.
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]!.para).toBe(HELENA);
  }, 60_000);

  it("o link aponta para o painel e leva um token de uso único", async () => {
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email: HELENA } });

    const link = linkDaUltima();
    expect(link.startsWith("https://painel.exemplo.gov.br/redefinir-senha?token=")).toBe(true);
    expect(tokenDoLink(link).length).toBeGreaterThan(30);
  }, 60_000);

  it("a mensagem não carrega senha nem token de sessão", async () => {
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email: HELENA } });
    const corpo = enviadas[0]!.corpo;

    // Email trafega e repousa fora do controle do município.
    expect(corpo).not.toContain(SENHA);
    expect(corpo).not.toContain("scrypt$");
    expect(corpo).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // formato de JWT
    // E diz o que fazer se não foi a pessoa que pediu.
    expect(corpo).toContain("Se não foi você");
  }, 60_000);

  it("pedir de novo invalida o link anterior", async () => {
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email: JONAS } });
    const primeiro = tokenDoLink(linkDaUltima());

    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email: JONAS } });
    const segundo = tokenDoLink(linkDaUltima());
    expect(segundo).not.toBe(primeiro);

    // Dois links vivos ao mesmo tempo dobrariam a janela de ataque.
    const comAntigo = await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token: primeiro, senha: "senha-nova-do-jonas" },
    });
    expect(comAntigo.statusCode).toBe(401);
  }, 60_000);

  it("conta desativada não recebe link", async () => {
    const coordenador = (await entrar(HELENA, SENHA)).json().acesso;
    const criado = await app.inject({
      method: "POST", url: "/usuarios",
      headers: { authorization: `Bearer ${coordenador}` },
      payload: {
        nome: "Desligado da Silva", matricula: "SA-800",
        email: "desligado@serraalta.exemplo.gov.br", papel: "operador",
        senha: "senha-do-desligado-longa",
      },
    });
    await app.inject({
      method: "PATCH", url: `/usuarios/${criado.json().id}/situacao`,
      headers: { authorization: `Bearer ${coordenador}` },
      payload: { ativo: false },
    });

    enviadas = [];
    const r = await app.inject({
      method: "POST", url: "/auth/recuperar",
      payload: { email: "desligado@serraalta.exemplo.gov.br" },
    });

    // Resposta igual à de sempre, e nenhuma mensagem enviada: quem foi
    // desligado não recupera acesso por este caminho.
    expect(r.statusCode).toBe(202);
    expect(enviadas).toHaveLength(0);
  }, 120_000);
});

describe("Redefinição pelo link", () => {
  it("troca a senha, e a nova funciona enquanto a antiga não", async () => {
    const email = "diego.alves@serraalta.exemplo.gov.br";
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email } });
    const token = tokenDoLink(linkDaUltima());

    const r = await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token, senha: "senha-nova-do-diego-2026" },
    });
    expect(r.statusCode).toBe(200);
    // Nenhum token de sessão volta: quem redefiniu entra de novo, e é isso
    // que confirma que a senha nova funciona.
    expect(r.body).not.toContain("acesso");

    expect((await entrar(email, SENHA)).statusCode, "a senha antiga morreu").toBe(401);
    expect((await entrar(email, "senha-nova-do-diego-2026")).statusCode).toBe(200);
  }, 120_000);

  it("o mesmo link não serve duas vezes", async () => {
    const email = "rita.lopes@serraalta.exemplo.gov.br";
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email } });
    const token = tokenDoLink(linkDaUltima());

    const primeira = await app.inject({
      method: "POST", url: "/auth/redefinir", payload: { token, senha: "primeira-senha-nova" },
    });
    const segunda = await app.inject({
      method: "POST", url: "/auth/redefinir", payload: { token, senha: "segunda-senha-nova" },
    });

    expect(primeira.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(401);
    // E a segunda tentativa não trocou nada.
    expect((await entrar(email, "primeira-senha-nova")).statusCode).toBe(200);
  }, 120_000);

  it("redefinir derruba as sessões abertas", async () => {
    const email = "simone.paz@valefundo.exemplo.gov.br";
    const sessao = (await entrar(email, SENHA)).json();

    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email } });
    await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token: tokenDoLink(linkDaUltima()), senha: "senha-nova-da-simone" },
    });

    // Se a recuperação foi pedida porque alguém invadiu a conta, deixar a
    // sessão antiga viva entregaria a conta de volta ao invasor.
    const renovar = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: sessao.renovacao },
    });
    expect(renovar.statusCode).toBe(401);
  }, 120_000);

  it("token inventado é recusado, e a mensagem não confirma nada", async () => {
    const r = await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token: "token-completamente-inventado", senha: "uma-senha-qualquer-longa" },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toContain("nao vale mais");
  }, 60_000);

  it("recusa senha curta antes de tocar no banco", async () => {
    const email = "tarcisio.ramos@valefundo.exemplo.gov.br";
    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email } });
    const token = tokenDoLink(linkDaUltima());

    const r = await app.inject({
      method: "POST", url: "/auth/redefinir", payload: { token, senha: "curta" },
    });
    expect(r.statusCode).toBe(422);

    // O token continua valendo: uma senha recusada não pode queimar o link.
    const depois = await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token, senha: "agora-sim-uma-senha-longa" },
    });
    expect(depois.statusCode).toBe(200);
  }, 120_000);

  it("desbloqueia a conta que estava travada por tentativas", async () => {
    const email = "aurelio.machado@valefundo.exemplo.gov.br";
    for (let i = 0; i < 6; i++) {
      await entrar(email, "errada-de-proposito");
    }
    // Bloqueada em silêncio: 401 genérico, e nunca 429 (o 429 só para conta
    // que existe denunciava quais emails estão cadastrados).
    expect((await entrar(email, SENHA)).statusCode, "bloqueada").toBe(401);

    await app.inject({ method: "POST", url: "/auth/recuperar", payload: { email } });
    await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token: tokenDoLink(linkDaUltima()), senha: "senha-nova-do-aurelio" },
    });

    // Sem isso, quem foi travado por tentativas ficaria de fora mesmo depois
    // de redefinir, e o bloqueio viraria negação de serviço.
    expect((await entrar(email, "senha-nova-do-aurelio")).statusCode).toBe(200);
  }, 180_000);
});

describe("Troca de senha por quem já está dentro", () => {
  it("exige a senha atual", async () => {
    const email = "jonas.ferreira@serraalta.exemplo.gov.br";
    const sessao = (await entrar(email, SENHA)).json();

    const errada = await app.inject({
      method: "POST", url: "/auth/trocar-senha",
      headers: { authorization: `Bearer ${sessao.acesso}` },
      payload: { senhaAtual: "chute", senha: "senha-nova-do-jonas-2026" },
    });
    // Sem isso, um aparelho deixado desbloqueado na mesa vira conta
    // sequestrada em dois cliques.
    expect(errada.statusCode).toBe(401);
    expect((await entrar(email, SENHA)).statusCode, "a senha nao mudou").toBe(200);
  }, 120_000);

  it("troca e encerra as outras sessões, preservando a atual", async () => {
    const email = "osvaldo-troca@serraalta.exemplo.gov.br";
    const coordenador = (await entrar(HELENA, SENHA)).json().acesso;
    await app.inject({
      method: "POST", url: "/usuarios",
      headers: { authorization: `Bearer ${coordenador}` },
      payload: {
        nome: "Osvaldo da Troca", matricula: "SA-810", email,
        papel: "operador", senha: "senha-inicial-do-osvaldo",
      },
    });

    const noCelular = (await entrar(email, "senha-inicial-do-osvaldo")).json();
    const noComputador = (await entrar(email, "senha-inicial-do-osvaldo")).json();

    const r = await app.inject({
      method: "POST", url: "/auth/trocar-senha",
      headers: { authorization: `Bearer ${noComputador.acesso}` },
      payload: { senhaAtual: "senha-inicial-do-osvaldo", senha: "senha-trocada-do-osvaldo" },
    });
    expect(r.statusCode).toBe(200);

    // A sessão que trocou continua: expulsar quem acabou de trocar seria
    // punir o comportamento correto.
    const atual = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: noComputador.renovacao },
    });
    expect(atual.statusCode).toBe(200);

    // As outras caem: trocar a senha e continuar com cinco aparelhos logados
    // esvazia o sentido da troca.
    const outra = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: noCelular.renovacao },
    });
    expect(outra.statusCode).toBe(401);
  }, 180_000);

  it("não troca sem estar autenticado", async () => {
    const r = await app.inject({
      method: "POST", url: "/auth/trocar-senha",
      payload: { senhaAtual: SENHA, senha: "outra-senha-bem-longa" },
    });
    expect(r.statusCode).toBe(401);
  }, 60_000);
});
