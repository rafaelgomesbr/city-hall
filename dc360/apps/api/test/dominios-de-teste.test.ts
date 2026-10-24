import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dominioDoEmail, soParaDominiosDeTeste } from "../src/auth/dominios-de-teste.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";

/**
 * O filtro de e-mail da homologação (V2-F01-E09).
 *
 * HML tem dado sintético, mas as portas de saída são de verdade: o ofício vai
 * para o e-mail do órgão cadastrado, e a recuperação de senha para o e-mail da
 * conta. O filtro recusa ANTES de chamar o provedor, e o impacto LGPD que ele
 * fecha é uma mensagem de teste chegando a uma pessoa real.
 */

function gravador(): { notificador: Notificador; enviadas: Mensagem[] } {
  const enviadas: Mensagem[] = [];
  return {
    enviadas,
    notificador: {
      async enviar(m) {
        enviadas.push(m);
        return { idNoProvedor: "id-1" };
      },
    },
  };
}

function para(endereco: string): Mensagem {
  return { para: endereco, nome: "Fulana", assunto: "Teste", corpo: "corpo" };
}

describe("dominioDoEmail", () => {
  it("devolve o domínio em minúsculas, depois do último @", () => {
    expect(dominioDoEmail("Fulana@Teste.Exemplo.com.br")).toBe("teste.exemplo.com.br");
    expect(dominioDoEmail('"a@b"@teste.exemplo.com.br')).toBe("teste.exemplo.com.br");
  });

  it("devolve null quando não há domínio", () => {
    expect(dominioDoEmail("sem-arroba")).toBeNull();
    expect(dominioDoEmail("fulana@")).toBeNull();
    expect(dominioDoEmail("fulana@  ")).toBeNull();
  });
});

describe("soParaDominiosDeTeste", () => {
  it("deixa passar um domínio da lista e entrega a mensagem ao provedor", async () => {
    const { notificador, enviadas } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["teste.exemplo.com.br"]);
    const recibo = await limitado.enviar(para("fulana@teste.exemplo.com.br"));
    expect(recibo.idNoProvedor).toBe("id-1");
    expect(enviadas).toHaveLength(1);
  });

  it("ignora a caixa do domínio da mensagem e da lista", async () => {
    const { notificador, enviadas } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["Teste.Exemplo.com.br"]);
    await limitado.enviar(para("fulana@TESTE.exemplo.COM.br"));
    expect(enviadas).toHaveLength(1);
  });

  it("recusa um domínio fora da lista, SEM chamar o provedor", async () => {
    const { notificador, enviadas } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["teste.exemplo.com.br"]);
    await expect(limitado.enviar(para("cidadao@gmail.com")))
      .rejects.toThrow(/domínio gmail\.com não está em EMAIL_DOMINIOS_DE_TESTE/);
    expect(enviadas).toHaveLength(0);
  });

  it("a recusa não repete o endereço inteiro (e-mail é dado pessoal)", async () => {
    const { notificador } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["teste.exemplo.com.br"]);
    let mensagem = "";
    try { await limitado.enviar(para("maria.da.silva@gmail.com")); } catch (e) { mensagem = (e as Error).message; }
    expect(mensagem).not.toContain("maria");
    expect(mensagem).not.toContain("@");
  });

  it("compara por igualdade exata: nem o domínio pai nem um subdomínio passam", async () => {
    const { notificador, enviadas } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["teste.exemplo.com.br"]);
    await expect(limitado.enviar(para("x@exemplo.com.br"))).rejects.toThrow(/não está em/);
    await expect(limitado.enviar(para("x@outro.teste.exemplo.com.br"))).rejects.toThrow(/não está em/);
    await expect(limitado.enviar(para("x@teste.exemplo.com.br.evil.com"))).rejects.toThrow(/não está em/);
    expect(enviadas).toHaveLength(0);
  });

  it("endereço sem domínio legível é recusado", async () => {
    const { notificador, enviadas } = gravador();
    const limitado = soParaDominiosDeTeste(notificador, ["teste.exemplo.com.br"]);
    await expect(limitado.enviar(para("sem-arroba"))).rejects.toThrow(/ilegível/);
    expect(enviadas).toHaveLength(0);
  });

  it("com a lista vazia devolve o próprio notificador: sem filtro configurado, nada a limitar", () => {
    const { notificador } = gravador();
    expect(soParaDominiosDeTeste(notificador, [])).toBe(notificador);
  });
});

describe("a partida liga o filtro", () => {
  it("index.ts embrulha o notificador com a lista da configuração", () => {
    const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts"), "utf8");
    expect(fonte).toMatch(/import \{ soParaDominiosDeTeste \} from "\.\/auth\/dominios-de-teste\.js"/);
    expect(fonte).toMatch(/soParaDominiosDeTeste\(notificadorBase, config\.dominiosDeEmailDeTeste\)/);
  });
});
