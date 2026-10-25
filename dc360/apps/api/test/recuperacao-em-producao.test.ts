import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";
import { notificadorDeLog, type Mensagem } from "../src/auth/notificador.js";

/**
 * V2-F00-E10: a produção continua com a recuperação desligada até o CP-19, e
 * nenhum caminho de configuração deixa o link de redefinição sair por onde não
 * deve.
 *
 * Fluxo completo com notificador de teste, produção desligada: são duas
 * afirmações que precisam valer ao mesmo tempo. A primeira é provada pelos
 * testes de rota (`recuperacao.test.ts`, `recuperacao-sem-oraculo.test.ts`); a
 * segunda, aqui, olhando o arquivo que de fato vai para o Fly e a partida que
 * de fato roda lá.
 *
 * Quem liga a recuperação em produção (CP-19, depois de contratar o provedor)
 * quebra o primeiro caso de propósito, e é isso que se quer: a mudança passa a
 * exigir mexer num teste que diz por quê.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const FLY_TOML = readFileSync(join(AQUI, "..", "..", "..", "fly.toml"), "utf8");

/** Uma produção válida e COMPLETA, com a recuperação desligada, como a do Fly hoje. */
function producao(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://dc360.refprodxxxxxxxx:senha@banco.interno:5432/dc360?sslmode=verify-full",
    JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
    ORIGENS_PERMITIDAS: "https://painel.serraalta.mg.gov.br",
    S3_ENDPOINT: "https://balde.exemplo.com",
    S3_BALDE: "dc360-evidencias",
    S3_CHAVE_ID: "chave-de-acesso",
    S3_CHAVE_SECRETA: "segredo-de-acesso",
    URL_PUBLICA: "https://api.dc360.exemplo.br",
    URL_PAINEL: "https://painel.serraalta.mg.gov.br",
    RECUPERACAO_ATIVA: "nao",
    // O contrato de ambiente (V2-F01-E09): as três declarações não secretas.
    AMBIENTE_DC360: "prod",
    IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
    DOMINIO_DO_AMBIENTE: "serraalta.mg.gov.br",
    ...sobrescrever,
  } as NodeJS.ProcessEnv;
}

describe("A produção do Fly está com a recuperação de senha desligada", () => {
  it('o fly.toml declara RECUPERACAO_ATIVA = "nao"', () => {
    const linha = FLY_TOML.split(/\r?\n/).find((l) => /^\s*RECUPERACAO_ATIVA\s*=/.test(l));
    expect(linha, "RECUPERACAO_ATIVA precisa estar declarada no fly.toml").toBeDefined();
    expect(linha!.replace(/\s+/g, "")).toBe('RECUPERACAO_ATIVA="nao"');
  });

  it("o fly.toml não liga o envio de email nem declara o notificador de arquivo", () => {
    const ativas = FLY_TOML.split(/\r?\n/).filter((l) => !l.trim().startsWith("#"));
    expect(ativas.join("\n")).not.toMatch(/EMAIL_ATIVO\s*=\s*"sim"/);
    expect(ativas.join("\n")).not.toMatch(/NOTIFICADOR_ARQUIVO/);
  });

  it("e a partida de produção com o que o fly.toml declara sobe, com a recuperação desligada", () => {
    const config = carregarConfig(producao());
    expect(config.RECUPERACAO_ATIVA).toBe("nao");
    expect(config.EMAIL_ATIVO).toBe("nao");
  });
});

describe("Nenhuma configuração de produção deixa o link sair por onde não deve", () => {
  it("RECUPERACAO_ATIVA=sim sem EMAIL_ATIVO=sim não sobe, mesmo com o provedor preenchido", () => {
    expect(() => carregarConfig(producao({
      RECUPERACAO_ATIVA: "sim",
      NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-do-provedor",
      EMAIL_ATIVO: "nao",
    }))).toThrow(/EMAIL_ATIVO/);
  });

  it("RECUPERACAO_ATIVA=sim sem provedor nenhum não sobe", () => {
    expect(() => carregarConfig(producao({ RECUPERACAO_ATIVA: "sim" })))
      .toThrow(/NOTIFICADOR_URL/);
  });

  it("NOTIFICADOR_ARQUIVO não existe em produção, nem com a recuperação desligada", () => {
    expect(() => carregarConfig(producao({ NOTIFICADOR_ARQUIVO: "/tmp/notificacoes.txt" })))
      .toThrow(/NOTIFICADOR_ARQUIVO é canal de teste/);
  });

  it("NOTIFICADOR_ARQUIVO não escapa nem combinado com a recuperação ligada e o email ligado", () => {
    expect(() => carregarConfig(producao({
      RECUPERACAO_ATIVA: "sim", EMAIL_ATIVO: "sim",
      NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-do-provedor",
      EMAIL_REMETENTE: "defesacivil@municipio.exemplo.gov.br",
      NOTIFICADOR_ARQUIVO: "/tmp/notificacoes.txt",
    }))).toThrow(/NOTIFICADOR_ARQUIVO/);
  });

  it("a produção toda ligada, como será depois do CP-19, sobe", () => {
    const config = carregarConfig(producao({
      RECUPERACAO_ATIVA: "sim", EMAIL_ATIVO: "sim",
      NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-do-provedor",
      EMAIL_REMETENTE: "defesacivil@municipio.exemplo.gov.br",
    }));
    expect(config.RECUPERACAO_ATIVA).toBe("sim");
  });

  it("fora de produção o notificador de arquivo existe, que é o canal de teste", () => {
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      NOTIFICADOR_ARQUIVO: "/tmp/notificacoes.txt",
    } as NodeJS.ProcessEnv);
    expect(config.NOTIFICADOR_ARQUIVO).toBe("/tmp/notificacoes.txt");
  });
});

describe("O notificador de log, o que sobra em produção sem provedor, nunca imprime o link", () => {
  it("escreve o assunto e o destinatário encoberto, e nada do corpo", async () => {
    const linhas: string[] = [];
    const mensagem: Mensagem = {
      para: "helena.coutinho@serraalta.exemplo.gov.br",
      nome: "Helena",
      assunto: "Redefinição de senha, Defesa Civil Operacional 360",
      corpo: "Use o link https://painel.exemplo.gov.br/redefinir-senha?token=segredo-vivo-123 agora.",
    };
    await notificadorDeLog((l) => linhas.push(l)).enviar(mensagem);

    const saida = linhas.join("\n");
    expect(saida).not.toContain("segredo-vivo-123");
    expect(saida).not.toContain("redefinir-senha");
    expect(saida).not.toContain("helena.coutinho");
    expect(saida).toContain("Redefinição de senha");
  });
});
