import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";

/**
 * O contrato de ambiente: DEV, HML e PROD (V2-F01-E09).
 *
 * O defeito que isto fecha: até aqui a API só distinguia ambiente por
 * `NODE_ENV`, e o piloto roda como `production`. Um HML também rodaria como
 * `production`, e nada impediria que a `DATABASE_URL` de PROD fosse colada nele.
 * O app de homologação subiria (a URL é válida, tem `verify-full`, a porta é
 * 5432) e a equipe passaria a "testar" em cima da base dos municípios, sem uma
 * linha de log dizendo isso.
 *
 * A organização (município) nunca aparece aqui: ela vem do token verificado, e
 * o último caso do arquivo prova que o esquema de configuração não tem
 * variável que a carregue.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");

/** A identidade do banco de PROD e a de HML: referências diferentes do provedor. */
const URL_DE_PROD = "postgres://dc360_api.refprodxxxxxxxx:senha-de-prod@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";
const URL_DE_HML = "postgres://dc360_api.refhmlxxxxxxxxx:senha-de-hml@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full";

/** PROD completo e coerente: cada caso estraga uma linha. */
function prod(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    AMBIENTE_DC360: "prod",
    DATABASE_URL: URL_DE_PROD,
    IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
    DOMINIO_DO_AMBIENTE: "painel-prod.exemplo.com.br",
    URL_PAINEL: "https://painel-prod.exemplo.com.br",
    ORIGENS_PERMITIDAS: "https://painel-prod.exemplo.com.br",
    URL_PUBLICA: "https://api-prod.exemplo.com.br",
    JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
    S3_ENDPOINT: "https://balde.exemplo.com",
    S3_BALDE: "dc360-evidencias",
    S3_CHAVE_ID: "chave-de-acesso",
    S3_CHAVE_SECRETA: "segredo-de-acesso",
    RECUPERACAO_ATIVA: "nao",
    ...sobrescrever,
  } as NodeJS.ProcessEnv;
}

/** HML: tudo do ambiente de homologação, e e-mail só a domínios de teste. */
function hml(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return prod({
    AMBIENTE_DC360: "hml",
    DATABASE_URL: URL_DE_HML,
    IDENTIDADE_DO_BANCO: "refhmlxxxxxxxxx",
    DOMINIO_DO_AMBIENTE: "painel-hml.exemplo.com.br",
    URL_PAINEL: "https://painel-hml.exemplo.com.br",
    ORIGENS_PERMITIDAS: "https://painel-hml.exemplo.com.br",
    URL_PUBLICA: "https://api-hml.exemplo.com.br",
    MARCA_DAGUA: "AMBIENTE DE HOMOLOGAÇÃO",
    EMAIL_DOMINIOS_DE_TESTE: "teste.exemplo.com.br",
    ...sobrescrever,
  });
}

/** O provedor de e-mail ligado: o que `EMAIL_ATIVO=sim` exige em qualquer ambiente. */
const EMAIL_LIGADO = {
  EMAIL_ATIVO: "sim",
  NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
  NOTIFICADOR_CHAVE: "chave-do-provedor",
  EMAIL_REMETENTE: "defesacivil@teste.exemplo.com.br",
};

/** Sem a chave: o jeito de "esquecer de definir". */
function sem(env: NodeJS.ProcessEnv, chave: string): NodeJS.ProcessEnv {
  const copia = { ...env };
  delete copia[chave];
  return copia;
}

describe("positivos: prod e hml válidos partem", () => {
  it("prod parte e devolve o ambiente", () => {
    const c = carregarConfig(prod());
    expect(c.ambiente).toBe("prod");
    expect(c.dominiosDeEmailDeTeste).toEqual([]);
  });

  it("hml parte, com a lista de e-mails de teste normalizada", () => {
    const c = carregarConfig(hml({ EMAIL_DOMINIOS_DE_TESTE: " Teste.Exemplo.com.br , outro.exemplo.com.br," }));
    expect(c.ambiente).toBe("hml");
    expect(c.dominiosDeEmailDeTeste).toEqual(["teste.exemplo.com.br", "outro.exemplo.com.br"]);
  });

  it("hml com e-mail ligado e a lista de teste parte", () => {
    expect(() => carregarConfig(hml(EMAIL_LIGADO))).not.toThrow();
  });

  it("dev parte sem declarar nada, e sem nenhuma das três variáveis", () => {
    expect(carregarConfig({} as NodeJS.ProcessEnv).ambiente).toBe("dev");
    expect(carregarConfig({ AMBIENTE_DC360: "dev" } as NodeJS.ProcessEnv).ambiente).toBe("dev");
  });

  it("dev não exige identidade nem domínio, mesmo com um banco de verdade", () => {
    expect(() => carregarConfig({
      NODE_ENV: "development",
      DATABASE_URL: URL_DE_PROD,
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("dois painéis do mesmo ambiente passam, inclusive um subdomínio", () => {
    const c = carregarConfig(prod({
      ORIGENS_PERMITIDAS: "https://painel-prod.exemplo.com.br,https://m.painel-prod.exemplo.com.br",
    }));
    expect(c.origens).toHaveLength(2);
  });
});

describe("negativos: a declaração do ambiente", () => {
  it("produção sem AMBIENTE_DC360 recusa, e diz o que fazer", () => {
    const env = sem(prod(), "AMBIENTE_DC360");
    expect(() => carregarConfig(env)).toThrow(/AMBIENTE_DC360 é obrigatória com NODE_ENV=production/);
    expect(() => carregarConfig(env)).toThrow(/hml ou prod/);
  });

  it("AMBIENTE_DC360 vazia conta como ausente, e em produção recusa", () => {
    expect(() => carregarConfig(prod({ AMBIENTE_DC360: "" }))).toThrow(/obrigatória/);
  });

  it("valor desconhecido recusa com a lista dos aceitos, em vez de cair em dev", () => {
    for (const errado of ["producao", "PROD", "homologacao", "staging"]) {
      expect(() => carregarConfig(prod({ AMBIENTE_DC360: errado })), errado)
        .toThrow(/não é um ambiente conhecido[\s\S]*dev, hml, prod/);
    }
  });

  it("dev com NODE_ENV=production recusa: não se declara máquina de desenvolvimento em produção", () => {
    expect(() => carregarConfig(prod({ AMBIENTE_DC360: "dev" })))
      .toThrow(/dev não combina com NODE_ENV=production/);
  });

  it("prod sem NODE_ENV=production recusa", () => {
    expect(() => carregarConfig({ NODE_ENV: "development", AMBIENTE_DC360: "prod" } as NodeJS.ProcessEnv))
      .toThrow(/prod exige NODE_ENV=production/);
  });

  it("fora de produção, hml pode ser ensaiado na máquina de quem desenvolve", () => {
    expect(carregarConfig(hml({ NODE_ENV: "development" })).ambiente).toBe("hml");
  });
});

describe("negativos: a trava de ambiente cruzado do banco", () => {
  it("HML com a DATABASE_URL de PROD recusa a partida", () => {
    expect(() => carregarConfig(hml({ DATABASE_URL: URL_DE_PROD })))
      .toThrow(/DATABASE_URL não é do banco de HML/);
  });

  it("PROD com a DATABASE_URL de HML também recusa (a trava vale nos dois sentidos)", () => {
    expect(() => carregarConfig(prod({ DATABASE_URL: URL_DE_HML })))
      .toThrow(/DATABASE_URL não é do banco de PROD/);
  });

  it("a mensagem da trava não repete a URL nem a senha", () => {
    let mensagem = "";
    try { carregarConfig(hml({ DATABASE_URL: URL_DE_PROD })); } catch (e) { mensagem = (e as Error).message; }
    expect(mensagem).not.toContain("senha-de-prod");
    expect(mensagem).not.toContain("refprodxxxxxxxx");
    expect(mensagem).toContain("refhmlxxxxxxxxx");
  });

  it("a identidade pode estar no host em vez do usuário", () => {
    expect(() => carregarConfig(hml({
      DATABASE_URL: "postgres://dc360_api:senha@db.refhmlxxxxxxxxx.supabase.co:5432/postgres?sslmode=verify-full",
    }))).not.toThrow();
  });

  it("compara por segmento: um trecho dentro de outro nome NÃO conta", () => {
    expect(() => carregarConfig(hml({
      DATABASE_URL: "postgres://dc360_api.xrefhmlxxxxxxxxxx:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    }))).toThrow(/não é do banco de HML/);
  });

  it("a caixa das letras não derruba a partida certa", () => {
    expect(() => carregarConfig(hml({ IDENTIDADE_DO_BANCO: "REFHMLXXXXXXXXX" }))).not.toThrow();
  });

  it("hml e prod sem IDENTIDADE_DO_BANCO recusam", () => {
    expect(() => carregarConfig(sem(hml(), "IDENTIDADE_DO_BANCO")))
      .toThrow(/IDENTIDADE_DO_BANCO é obrigatória em HML/);
    expect(() => carregarConfig(sem(prod(), "IDENTIDADE_DO_BANCO")))
      .toThrow(/IDENTIDADE_DO_BANCO é obrigatória em PROD/);
  });

  it("identidade com ponto ou curta demais recusa na validação do esquema", () => {
    expect(() => carregarConfig(hml({ IDENTIDADE_DO_BANCO: "a.b" }))).toThrow(/IDENTIDADE_DO_BANCO/);
    expect(() => carregarConfig(hml({ IDENTIDADE_DO_BANCO: "ab" }))).toThrow(/IDENTIDADE_DO_BANCO/);
  });
});

describe("negativos: o domínio do ambiente (painel e CORS)", () => {
  it("sem DOMINIO_DO_AMBIENTE recusa em hml e prod", () => {
    expect(() => carregarConfig(sem(hml(), "DOMINIO_DO_AMBIENTE")))
      .toThrow(/DOMINIO_DO_AMBIENTE é obrigatório em HML/);
    expect(() => carregarConfig(sem(prod(), "DOMINIO_DO_AMBIENTE")))
      .toThrow(/DOMINIO_DO_AMBIENTE é obrigatório em PROD/);
  });

  it("domínio compartilhado do provedor recusa: um sufixo que é de todo mundo não separa ambiente", () => {
    for (const compartilhado of ["vercel.app", "fly.dev", "supabase.co", "com.br"]) {
      expect(() => carregarConfig(hml({ DOMINIO_DO_AMBIENTE: compartilhado })), compartilhado)
        .toThrow(/DOMINIO_DO_AMBIENTE[\s\S]*reparte com outros clientes/);
    }
  });

  it("domínio mal formado recusa (esquema, porta, caminho, curinga, um rótulo só)", () => {
    const ruins = [
      "https://painel-hml.exemplo.com.br",
      "painel-hml.exemplo.com.br:443",
      "painel-hml.exemplo.com.br/",
      "*.exemplo.com.br",
      "localhost",
    ];
    for (const ruim of ruins) {
      expect(() => carregarConfig(hml({ DOMINIO_DO_AMBIENTE: ruim })), ruim)
        .toThrow(/DOMINIO_DO_AMBIENTE precisa ser só o nome do domínio/);
    }
  });

  it("URL_PAINEL de outro ambiente recusa", () => {
    expect(() => carregarConfig(hml({ URL_PAINEL: "https://painel-prod.exemplo.com.br" })))
      .toThrow(/URL_PAINEL .* não é do domínio de HML/);
  });

  it("ORIGENS_PERMITIDAS com a origem de PROD em HML recusa: é o que ligaria um ambiente ao outro", () => {
    expect(() => carregarConfig(hml({
      ORIGENS_PERMITIDAS: "https://painel-hml.exemplo.com.br,https://painel-prod.exemplo.com.br",
    }))).toThrow(/ORIGENS_PERMITIDAS lista https:\/\/painel-prod\.exemplo\.com\.br, que não é do domínio de HML/);
  });

  it("o MESMO valor de ORIGENS_PERMITIDAS não vale nos dois ambientes", () => {
    const origens = "https://painel-hml.exemplo.com.br";
    expect(() => carregarConfig(hml({ ORIGENS_PERMITIDAS: origens }))).not.toThrow();
    expect(() => carregarConfig(prod({ ORIGENS_PERMITIDAS: origens }))).toThrow(/não é do domínio de PROD/);
  });

  it("um host que apenas TERMINA com o texto do domínio não é do domínio", () => {
    expect(() => carregarConfig(hml({
      URL_PAINEL: "https://evil-painel-hml.exemplo.com.br",
      ORIGENS_PERMITIDAS: "https://evil-painel-hml.exemplo.com.br",
    }))).toThrow(/não é do domínio de HML/);
  });
});

describe("negativos: ORIGENS_PERMITIDAS em produção (endurecimento pedido pela F01-E10)", () => {
  /*
    O @fastify/cors compara o texto do cabeçalho Origin com a lista, letra por
    letra. O navegador manda `https://host`, sem barra e sem caminho. Uma entrada
    diferente NUNCA casa: o painel não fala com a API e o servidor não registra
    nada.
  */
  const casos: Array<[string, string, RegExp]> = [
    ["curinga", "*", /curinga/],
    ["curinga junto de uma origem válida", "https://painel-prod.exemplo.com.br,*", /curinga/],
    ["http em vez de https", "http://painel-prod.exemplo.com.br", /só aceita https/],
    ["barra final", "https://painel-prod.exemplo.com.br/", /sem barra final, sem caminho/],
    ["caminho", "https://painel-prod.exemplo.com.br/app", /sem barra final, sem caminho/],
    ["consulta", "https://painel-prod.exemplo.com.br?x=1", /sem barra final, sem caminho/],
    ["usuário na URL", "https://u:p@painel-prod.exemplo.com.br", /sem barra final, sem caminho/],
    ["porta padrão escrita", "https://painel-prod.exemplo.com.br:443", /sem barra final, sem caminho/],
    ["host em maiúsculas", "https://PAINEL-PROD.exemplo.com.br", /sem barra final, sem caminho/],
    ["texto que não é URL", "painel-prod.exemplo.com.br", /não é uma URL/],
    ["lista vazia", " , ", /está vazia/],
  ];
  for (const [nome, valor, esperado] of casos) {
    it(`recusa ${nome}`, () => {
      expect(() => carregarConfig(prod({ ORIGENS_PERMITIDAS: valor }))).toThrow(esperado);
    });
  }

  it("porta diferente da padrão passa quando escrita", () => {
    expect(() => carregarConfig(prod({ ORIGENS_PERMITIDAS: "https://painel-prod.exemplo.com.br:8443" })))
      .not.toThrow();
  });

  it("espaços ao redor das vírgulas continuam sendo tolerados", () => {
    expect(() => carregarConfig(prod({
      ORIGENS_PERMITIDAS: "https://painel-prod.exemplo.com.br , https://m.painel-prod.exemplo.com.br",
    }))).not.toThrow();
  });
});

describe("negativos: as regras de HML", () => {
  it("MARCA_DAGUA vazia em HML recusa, mesmo sendo ato legítimo em outros ambientes", () => {
    expect(() => carregarConfig(hml({ MARCA_DAGUA: "" }))).toThrow(/MARCA_DAGUA não pode estar vazia em HML/);
    expect(() => carregarConfig(hml({ MARCA_DAGUA: "   " }))).toThrow(/MARCA_DAGUA não pode estar vazia em HML/);
    // Em PROD o ato continua sendo do operador (decisão antiga, intacta).
    expect(() => carregarConfig(prod({ MARCA_DAGUA: "" }))).not.toThrow();
  });

  it("MARCA_DAGUA ausente em HML parte: o padrão do esquema marca", () => {
    expect(carregarConfig(sem(hml(), "MARCA_DAGUA")).MARCA_DAGUA).toBe("DOCUMENTO DE VALIDAÇÃO");
  });

  it("e-mail ligado em HML sem EMAIL_DOMINIOS_DE_TESTE recusa", () => {
    expect(() => carregarConfig(sem(hml(EMAIL_LIGADO), "EMAIL_DOMINIOS_DE_TESTE")))
      .toThrow(/ligado em HML sem EMAIL_DOMINIOS_DE_TESTE/);
  });

  it("e-mail desligado em HML dispensa a lista", () => {
    expect(() => carregarConfig(sem(hml(), "EMAIL_DOMINIOS_DE_TESTE"))).not.toThrow();
  });

  it("EMAIL_DOMINIOS_DE_TESTE em PROD recusa: o filtro engoliria e-mail de verdade", () => {
    expect(() => carregarConfig(prod({ EMAIL_DOMINIOS_DE_TESTE: "teste.exemplo.com.br" })))
      .toThrow(/EMAIL_DOMINIOS_DE_TESTE não pode existir em PROD/);
  });
});

describe("a organização nunca vem de configuração", () => {
  it("o esquema não tem nenhuma variável de organização, município ou tenant", () => {
    const fonte = readFileSync(join(AQUI, "..", "src", "config.ts"), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const esquema"), fonte.indexOf("export type Config"));
    const chaves = [...bloco.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!);
    expect(chaves.length).toBeGreaterThan(20);
    expect(chaves.filter((k) => /ORGANIZACAO|MUNICIPIO|TENANT/.test(k))).toEqual([]);
  });
});

describe("o que o fly.toml de PROD declara parte, com segredos de mentira", () => {
  /*
    Prova que a produção de hoje continua subindo com o contrato novo: lê o
    `[env]` do arquivo versionado, soma o que o Fly guarda como segredo (valores
    fictícios que respeitam a identidade e o domínio declarados) e carrega. Se
    alguém mudar uma linha do `[env]` e quebrar a partida, é aqui que aparece, e
    não no deploy.
  */
  function envDoToml(arquivo: string): Record<string, string> {
    const texto = readFileSync(join(RAIZ, arquivo), "utf8");
    const saida: Record<string, string> = {};
    let dentro = false;
    for (const linha of texto.split(/\r?\n/)) {
      const t = linha.trim();
      if (t.startsWith("[")) { dentro = t === "[env]"; continue; }
      if (!dentro || t === "" || t.startsWith("#")) continue;
      const m = /^([A-Z][A-Z0-9_]*)\s*=\s*"(.*)"\s*(?:#.*)?$/.exec(t);
      if (m) saida[m[1]!] = m[2]!;
    }
    return saida;
  }

  function segredos(env: Record<string, string>, identidade: string): NodeJS.ProcessEnv {
    const dominio = env["DOMINIO_DO_AMBIENTE"]!;
    return {
      ...env,
      DATABASE_URL: `postgres://dc360_api.${identidade}:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
      JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
      URL_PUBLICA: "https://defesa-civil.fly.dev",
      URL_PAINEL: `https://${dominio}`,
      ORIGENS_PERMITIDAS: `https://${dominio}`,
      S3_ENDPOINT: "https://balde.exemplo.com",
      S3_BALDE: "dc360-evidencias",
      S3_CHAVE_ID: "chave-de-acesso",
      S3_CHAVE_SECRETA: "segredo-de-acesso",
    } as NodeJS.ProcessEnv;
  }

  it("fly.toml declara as três variáveis do contrato e nenhum filtro de e-mail de teste", () => {
    const env = envDoToml("fly.toml");
    expect(env["AMBIENTE_DC360"]).toBe("prod");
    expect(env["IDENTIDADE_DO_BANCO"]).toMatch(/^[a-z0-9][a-z0-9_-]{2,62}$/i);
    expect(env["DOMINIO_DO_AMBIENTE"]).toMatch(/\./);
    expect(env["EMAIL_DOMINIOS_DE_TESTE"]).toBeUndefined();
  });

  it("com o [env] do fly.toml e segredos coerentes, a produção sobe", () => {
    const env = envDoToml("fly.toml");
    const c = carregarConfig(segredos(env, env["IDENTIDADE_DO_BANCO"]!));
    expect(c.ambiente).toBe("prod");
  });

  it("com o [env] do fly.toml e o banco de OUTRO ambiente, a produção NÃO sobe", () => {
    const env = envDoToml("fly.toml");
    expect(() => carregarConfig(segredos(env, "outroprojetoxxxxx"))).toThrow(/não é do banco de PROD/);
  });

  it("com o [env] do fly.toml e sem o AMBIENTE_DC360, a produção NÃO sobe", () => {
    const env = envDoToml("fly.toml");
    delete env["AMBIENTE_DC360"];
    expect(() => carregarConfig(segredos(env, "refprodxxxxxxxx"))).toThrow(/AMBIENTE_DC360 é obrigatória/);
  });
});
