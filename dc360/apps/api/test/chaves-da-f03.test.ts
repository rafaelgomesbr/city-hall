import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";
import { lojaDoLimitador } from "../src/limite-persistente.js";
import { LimitePorRotaSemVersao } from "../src/limite-por-rota.js";

/**
 * As chaves de configuração da F03 (abertura da API, parte 1C): padrão
 * FECHADO, SEM EFEITO, e as regras de partida que valem desde já.
 *
 * O que este arquivo trava:
 *
 *   - PADRÃO: sem nenhuma das seis, a partida sobe (em desenvolvimento e na
 *     produção válida de hoje) e cada uma vale o valor fechado.
 *   - PORTAL_ATIVO=sim sem SEGUNDO_FATOR_ATIVO=sim RECUSA a partida, em qualquer
 *     ambiente; com o segundo fator ligado (e a chave dele) sobe.
 *   - COTAS_PERSISTENTES=sim em produção sem COTAS_SEGREDO recusa; com o segredo
 *     sobe; fora de produção não exige. Segredo curto é recusado.
 *   - Formatos: data inexistente, versão fora do formato e minutos fora da faixa
 *     derrubam a partida, e o valor vazio vale como ausente.
 *   - SEM EFEITO: ligar `COTAS_PERSISTENTES` não troca a loja do limitador, e
 *     `MFA_VIGENCIA_MINUTOS` não muda nada que a configuração exponha além de si.
 */

const JWT = "segredo-de-teste-com-mais-de-trinta-e-dois-bytes";
const CHAVE_DO_COFRE = Buffer.alloc(32, 7).toString("base64");
const SEGREDO_DAS_COTAS = "segredo-das-cotas-com-mais-de-trinta-e-dois-bytes";

function dev(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", JWT_SEGREDO: JWT, ...extra } as NodeJS.ProcessEnv;
}

/** Uma produção válida e completa, como a do Fly hoje. */
function producao(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL:
      "postgres://dc360.refprodxxxxxxxx:senha@banco.interno:5432/dc360?sslmode=verify-full",
    JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
    ORIGENS_PERMITIDAS: "https://painel.serraalta.mg.gov.br",
    S3_ENDPOINT: "https://balde.exemplo.com",
    S3_BALDE: "dc360-evidencias",
    S3_CHAVE_ID: "chave-de-acesso",
    S3_CHAVE_SECRETA: "segredo-de-acesso",
    URL_PUBLICA: "https://api.dc360.exemplo.br",
    URL_PAINEL: "https://painel.serraalta.mg.gov.br",
    RECUPERACAO_ATIVA: "nao",
    AMBIENTE_DC360: "prod",
    IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
    DOMINIO_DO_AMBIENTE: "serraalta.mg.gov.br",
    ...extra,
  } as NodeJS.ProcessEnv;
}

describe("Padrão fechado e sem efeito", () => {
  it("sem nenhuma das chaves, cada uma vale o valor fechado", () => {
    const c = carregarConfig(dev());
    expect(c.PORTAL_ATIVO).toBe("nao");
    expect(c.ACEITA_SUB_DE_CONTA_ATE).toBeUndefined();
    expect(c.VERSAO_DO_LOGIN_EM_DOIS_PASSOS).toBeUndefined();
    expect(c.MFA_VIGENCIA_MINUTOS).toBe(0);
    expect(c.COTAS_PERSISTENTES).toBe("nao");
    expect(c.COTAS_SEGREDO).toBeUndefined();
  });

  it("a produção válida de hoje sobe sem nenhuma delas", () => {
    expect(() => carregarConfig(producao())).not.toThrow();
  });

  it("variável vazia vale como ausente, como o .env.example manda deixar", () => {
    const c = carregarConfig(
      dev({
        ACEITA_SUB_DE_CONTA_ATE: "",
        VERSAO_DO_LOGIN_EM_DOIS_PASSOS: "",
        COTAS_SEGREDO: "",
      }),
    );
    expect(c.ACEITA_SUB_DE_CONTA_ATE).toBeUndefined();
    expect(c.VERSAO_DO_LOGIN_EM_DOIS_PASSOS).toBeUndefined();
    expect(c.COTAS_SEGREDO).toBeUndefined();
  });

  it("os valores declarados chegam à configuração", () => {
    const c = carregarConfig(
      dev({
        ACEITA_SUB_DE_CONTA_ATE: "2027-03-31",
        VERSAO_DO_LOGIN_EM_DOIS_PASSOS: "1.7.0",
        MFA_VIGENCIA_MINUTOS: "15",
        COTAS_PERSISTENTES: "sim",
        COTAS_SEGREDO: SEGREDO_DAS_COTAS,
      }),
    );
    expect(c.ACEITA_SUB_DE_CONTA_ATE).toBe("2027-03-31");
    expect(c.VERSAO_DO_LOGIN_EM_DOIS_PASSOS).toBe("1.7.0");
    expect(c.MFA_VIGENCIA_MINUTOS).toBe(15);
    expect(c.COTAS_PERSISTENTES).toBe("sim");
    expect(c.COTAS_SEGREDO).toBe(SEGREDO_DAS_COTAS);
  });
});

describe("PORTAL_ATIVO exige o segundo fator", () => {
  it("PORTAL_ATIVO=sim sem SEGUNDO_FATOR_ATIVO recusa a partida", () => {
    expect(() => carregarConfig(dev({ PORTAL_ATIVO: "sim" }))).toThrow(
      /PORTAL_ATIVO=sim exige SEGUNDO_FATOR_ATIVO=sim/,
    );
    expect(() => carregarConfig(dev({ PORTAL_ATIVO: "sim", SEGUNDO_FATOR_ATIVO: "nao" }))).toThrow(
      /SEGUNDO_FATOR_ATIVO=sim/,
    );
  });

  it("recusa também em produção, antes de qualquer outra coisa pedir o portal", () => {
    expect(() => carregarConfig(producao({ PORTAL_ATIVO: "sim" }))).toThrow(
      /PORTAL_ATIVO=sim exige/,
    );
  });

  it("com o segundo fator ligado e a chave dele, sobe", () => {
    expect(() =>
      carregarConfig(
        dev({
          PORTAL_ATIVO: "sim",
          SEGUNDO_FATOR_ATIVO: "sim",
          SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
        }),
      ),
    ).not.toThrow();
  });

  it("o segundo fator ligado sem o portal não liga o portal", () => {
    const c = carregarConfig(
      dev({ SEGUNDO_FATOR_ATIVO: "sim", SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE }),
    );
    expect(c.PORTAL_ATIVO).toBe("nao");
  });

  it("valor que não é sim nem nao derruba a partida", () => {
    expect(() => carregarConfig(dev({ PORTAL_ATIVO: "talvez" }))).toThrow(/PORTAL_ATIVO/);
  });
});

describe("COTAS_SEGREDO é exigido em produção com as cotas ligadas", () => {
  it("COTAS_PERSISTENTES=sim em produção sem COTAS_SEGREDO recusa", () => {
    expect(() => carregarConfig(producao({ COTAS_PERSISTENTES: "sim" }))).toThrow(/COTAS_SEGREDO/);
  });

  it("com o segredo, sobe", () => {
    expect(() =>
      carregarConfig(
        producao({
          COTAS_PERSISTENTES: "sim",
          COTAS_SEGREDO: SEGREDO_DAS_COTAS,
        }),
      ),
    ).not.toThrow();
  });

  it("fora de produção a regra não vale: o desenvolvimento sobe sem o segredo", () => {
    expect(() => carregarConfig(dev({ COTAS_PERSISTENTES: "sim" }))).not.toThrow();
  });

  it("em produção com as cotas desligadas o segredo não é exigido", () => {
    expect(() => carregarConfig(producao({ COTAS_PERSISTENTES: "nao" }))).not.toThrow();
  });

  it("segredo curto é recusado, em qualquer ambiente", () => {
    expect(() => carregarConfig(dev({ COTAS_SEGREDO: "curto" }))).toThrow(/COTAS_SEGREDO/);
  });
});

describe("Formatos", () => {
  it("data que não existe no calendário derruba a partida", () => {
    expect(() => carregarConfig(dev({ ACEITA_SUB_DE_CONTA_ATE: "2027-02-30" }))).toThrow(
      /ACEITA_SUB_DE_CONTA_ATE/,
    );
    expect(() => carregarConfig(dev({ ACEITA_SUB_DE_CONTA_ATE: "31/03/2027" }))).toThrow(
      /ACEITA_SUB_DE_CONTA_ATE/,
    );
  });

  it("versão fora do formato derruba a partida", () => {
    expect(() => carregarConfig(dev({ VERSAO_DO_LOGIN_EM_DOIS_PASSOS: "1.7" }))).toThrow(
      /VERSAO_DO_LOGIN_EM_DOIS_PASSOS/,
    );
    expect(() => carregarConfig(dev({ VERSAO_DO_LOGIN_EM_DOIS_PASSOS: "v1.7.0" }))).toThrow(
      /VERSAO_DO_LOGIN_EM_DOIS_PASSOS/,
    );
  });

  it("minutos fora da faixa ou não inteiros derrubam a partida", () => {
    expect(() => carregarConfig(dev({ MFA_VIGENCIA_MINUTOS: "-1" }))).toThrow(
      /MFA_VIGENCIA_MINUTOS/,
    );
    expect(() => carregarConfig(dev({ MFA_VIGENCIA_MINUTOS: "1441" }))).toThrow(
      /MFA_VIGENCIA_MINUTOS/,
    );
    expect(() => carregarConfig(dev({ MFA_VIGENCIA_MINUTOS: "1.5" }))).toThrow(
      /MFA_VIGENCIA_MINUTOS/,
    );
  });
});

describe("Sem efeito", () => {
  it("ligar COTAS_PERSISTENTES não troca a loja do limitador: segue a de memória", () => {
    const desligada = carregarConfig(dev());
    const ligada = carregarConfig(
      dev({ COTAS_PERSISTENTES: "sim", COTAS_SEGREDO: SEGREDO_DAS_COTAS }),
    );
    expect(lojaDoLimitador(desligada)).toBe(LimitePorRotaSemVersao);
    expect(lojaDoLimitador(ligada)).toBe(LimitePorRotaSemVersao);
  });
});
