import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";

/**
 * A configuração de produção, verificada.
 *
 * O arquivo de config abre dizendo que "um servidor que sobe com chave padrão
 * é pior que um servidor que não sobe, porque parece funcionar". Estes casos
 * cobram essa frase, e cobram também o caso que ela não pegava: endereço
 * apontando para a máquina local.
 *
 * Esse é o defeito silencioso do conjunto. O servidor sobe, responde a tudo, e
 * quem descobre o erro é o destinatário: o link de redefinição de senha que
 * chega por email apontando para `localhost` simplesmente não abre na casa da
 * pessoa, e do lado de cá ninguém vê nada acontecer.
 */

/** O mínimo que faz uma produção válida. Cada caso estraga um pedaço. */
function producao(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    /*
      Com `sslmode=verify-full`, e isto NÃO é enfeite do molde.

      Sem esse parâmetro a partida em produção é recusada desde 09/09/2026,
      porque `montarConfiguracaoDoPool` só monta a âncora de confiança quando a
      URL pede verificação: sem ele a conexão com o banco subia cifrada e não
      autenticada, em silêncio. Ver o caso "recusa DATABASE_URL sem verificação
      de certificado" em `banco-tls.test.ts`.
    */
    DATABASE_URL: "postgres://dc360:senha@banco.interno:5432/dc360?sslmode=verify-full",
    JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
    ORIGENS_PERMITIDAS: "https://painel.serraalta.mg.gov.br",
    S3_ENDPOINT: "https://balde.exemplo.com",
    S3_BALDE: "dc360-evidencias",
    S3_CHAVE_ID: "chave-de-acesso",
    S3_CHAVE_SECRETA: "segredo-de-acesso",
    URL_PUBLICA: "https://api.dc360.exemplo.br",
    URL_PAINEL: "https://painel.serraalta.mg.gov.br",
    /*
      Destino da recuperação de senha. Entrou no mínimo porque produção passou
      a recusar subir com a recuperação ligada e sem provedor: até então ela
      caía no notificador de log, que escrevia o link de uso único em texto
      puro no log do servidor, e a rota respondia "enviamos o link" sem enviar
      nada. Ver o caso "recusa recuperação ligada sem destino" abaixo.
    */
    NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
    NOTIFICADOR_CHAVE: "chave-do-provedor",
    /*
      E o interruptor que faz alguém FALAR com esse provedor.

      Entrou no mínimo em 09/09/2026, junto do cliente HTTP de email. Até
      então, ter as duas variáveis acima preenchidas era condição suficiente
      para a partida aceitar a recuperação de senha ligada, e mesmo assim
      nenhum email saía: não existia cliente nenhum no servidor, e a mensagem
      caía no notificador de log com o link de uso único dentro. A checagem
      passava, a configuração parecia certa, e o defeito só aparecia na caixa
      de entrada que nunca recebia nada. Ver o caso "recusa recuperação ligada
      com o envio de email desligado" abaixo.
    */
    EMAIL_ATIVO: "sim",
    /*
      E o remetente, que entrou no mínimo junto do cliente que fala o contrato
      de verdade do provedor. O provedor escolhido trata `from` como campo
      obrigatório: sem ele, a configuração passava, o servidor subia, e cem por
      cento das mensagens eram recusadas na validação, uma a uma, descobertas
      por quem estava esperando o email.
    */
    EMAIL_REMETENTE: "defesacivil@municipio.exemplo.gov.br",
    /*
      O contrato de ambiente (V2-F01-E09): as três declarações NÃO secretas que
      o `[env]` do fly.toml carrega. A identidade é um segmento do usuário ou do
      host de DATABASE_URL (`banco.interno` acima), e o domínio é o do painel.
      Os casos do contrato em si estão em `contrato-de-ambiente.test.ts`.
    */
    AMBIENTE_DC360: "prod",
    IDENTIDADE_DO_BANCO: "dc360",
    DOMINIO_DO_AMBIENTE: "serraalta.mg.gov.br",
    ...sobrescrever,
  } as NodeJS.ProcessEnv;
}

describe("Configuração de produção", () => {
  it("uma produção bem montada sobe", () => {
    // Âncora: sem ela, um erro no molde faria todos os outros casos passarem
    // pelo motivo errado.
    const c = carregarConfig(producao());
    expect(c.NODE_ENV).toBe("production");
    expect(c.origens).toEqual(["https://painel.serraalta.mg.gov.br"]);
  });

  it("recusa subir sem banco, sem segredo ou sem armazenamento", () => {
    const semBanco = producao();
    delete semBanco["DATABASE_URL"];
    expect(() => carregarConfig(semBanco)).toThrow(/DATABASE_URL/);

    const semSegredo = producao();
    delete semSegredo["JWT_SEGREDO"];
    expect(() => carregarConfig(semSegredo)).toThrow(/JWT_SEGREDO/);

    const semBalde = producao();
    delete semBalde["S3_BALDE"];
    expect(() => carregarConfig(semBalde)).toThrow(/Armazenamento de evidência/);
  });

  it("recusa curinga de origem", () => {
    expect(() => carregarConfig(producao({ ORIGENS_PERMITIDAS: "*" })))
      .toThrow(/curinga/);
  });

  it("recusa endereço apontando para a máquina local", () => {
    /*
      Três variantes, porque as três aparecem em arquivo de ambiente copiado
      do desenvolvimento, e as três produzem o mesmo estrago.
    */
    expect(() => carregarConfig(producao({ URL_PAINEL: "http://localhost:5173" })))
      .toThrow(/URL_PAINEL.*máquina local/s);
    expect(() => carregarConfig(producao({ URL_PUBLICA: "http://127.0.0.1:3333" })))
      .toThrow(/URL_PUBLICA.*máquina local/s);
    expect(() => carregarConfig(producao({ ORIGENS_PERMITIDAS: "http://localhost:4173" })))
      .toThrow(/ORIGENS_PERMITIDAS.*máquina local/s);
  });

  it("o padrão de desenvolvimento é justamente o que produção recusa", () => {
    // Esta é a prova de que a checagem não é decorativa: os valores padrão do
    // esquema apontam para a máquina local, então esquecer de definir os dois
    // em produção é o caso comum, não o exótico.
    const padrao = carregarConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(padrao.URL_PAINEL).toMatch(/localhost/);
    expect(padrao.URL_PUBLICA).toMatch(/127\.0\.0\.1/);

    const semEnderecos = producao();
    delete semEnderecos["URL_PAINEL"];
    delete semEnderecos["URL_PUBLICA"];
    expect(() => carregarConfig(semEnderecos)).toThrow(/máquina local/);
  });

  it("recusa endereço sem https em produção", () => {
    // Token de sessão e foto de vistoria viajam por esses endereços.
    expect(() => carregarConfig(producao({ URL_PAINEL: "http://painel.exemplo.gov.br" })))
      .toThrow(/URL_PAINEL precisa ser https/);
    expect(() => carregarConfig(producao({ URL_PUBLICA: "http://api.exemplo.br" })))
      .toThrow(/URL_PUBLICA precisa ser https/);
  });

  it("desenvolvimento continua subindo sem nada configurado", () => {
    // A recusa é de produção. Exigir o mesmo em desenvolvimento tornaria o
    // repositório impossível de rodar recém-clonado, que é o oposto do que
    // este projeto quer.
    const c = carregarConfig({} as NodeJS.ProcessEnv);
    expect(c.NODE_ENV).toBe("development");
    expect(c.jwtSegredos[0]!.length).toBeGreaterThan(31);
  });

  it("recusa DATABASE_URL na porta 6543 do pooler (modo transação), e ensina a 5432", () => {
    /*
      O achado (revisão de 15/09/2026): 6543 é o modo TRANSAÇÃO do pooler da
      Supabase, em que a conexão volta para o bolo ao fim de cada transação.
      O `SET LOCAL ROLE dc360_app` de cada transação passa, mas a trava de
      aviso (`pg_try_advisory_lock`, que segura a varredura de push e a de
      órfão numa máquina só) é de SESSÃO: no modo transação o comando seguinte
      pode cair em outra conexão, a trava fica presa numa que ninguém mais tem
      ou é conferida numa que nunca a pegou, sem erro nenhum.
      `scripts/migrar-producao.mjs` já explicava isso para a migração; a
      partida da API aceitava a porta em silêncio.
    */
    const url = "postgres://dc360_api:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full";
    expect(() => carregarConfig(producao({ DATABASE_URL: url })))
      .toThrow(/6543[\s\S]*modo transa[çc][ãa]o[\s\S]*5432/);

    // A porta de sessão do mesmo pooler continua passando: a recusa é da porta, não do host.
    expect(() => carregarConfig(producao({
      DATABASE_URL: "postgres://dc360_api:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
      IDENTIDADE_DO_BANCO: "dc360_api",
    }))).not.toThrow();

    // E a mensagem não repete a senha: ela é a única parte da URL que não pode ir para o log.
    let mensagem = "";
    try { carregarConfig(producao({ DATABASE_URL: url })); } catch (e) { mensagem = (e as Error).message; }
    expect(mensagem).not.toContain("senha");
  });

  it("fora de produção, a porta 6543 passa: é decisão de quem está experimentando na própria máquina", () => {
    const c = carregarConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://dc360_api:senha@localhost:6543/dc360",
    } as NodeJS.ProcessEnv);
    expect(c.DATABASE_URL).toContain(":6543/");
  });
});

describe("O modelo de ambiente acompanha o esquema", () => {
  /**
   * `.env.example` é a única coisa que um operador lê antes de subir isto num
   * servidor. Variável nova que não aparece lá é variável que ninguém define,
   * e o efeito varia entre "o padrão serve" e "o link de recuperação de senha
   * aponta para a máquina de quem programou".
   *
   * Manter o arquivo sincronizado à mão dura até a primeira pressa. Aqui a
   * lista sai do próprio esquema.
   */
  const AQUI = dirname(fileURLToPath(import.meta.url));

  function variaveisDoEsquema(): string[] {
    const fonte = readFileSync(join(AQUI, "..", "src", "config.ts"), "utf8");
    const bloco = fonte.slice(fonte.indexOf("const esquema"), fonte.indexOf("export type Config"));
    return [...bloco.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!);
  }

  it("a leitura do esquema encontra as variáveis", () => {
    // Âncora: um erro na expressão faria o teste passar com lista vazia.
    const nomes = variaveisDoEsquema();
    expect(nomes.length).toBeGreaterThan(12);
    expect(nomes).toContain("JWT_SEGREDO");
    expect(nomes).toContain("S3_BALDE");
  });

  it("toda variável do esquema aparece no .env.example", () => {
    const modelo = readFileSync(join(AQUI, "..", ".env.example"), "utf8");
    const faltando = variaveisDoEsquema().filter((v) => !modelo.includes(v));
    expect(
      faltando,
      "variável nova sem linha no .env.example: quem for subir isto num " +
      "servidor não vai saber que ela existe",
    ).toEqual([]);
  });

  it("o modelo não traz segredo preenchido", () => {
    /*
      Modelo com valor real vira credencial commitada. As linhas de segredo
      ficam comentadas e vazias de propósito, e este caso impede que alguém
      "ajude" preenchendo.
    */
    const modelo = readFileSync(join(AQUI, "..", ".env.example"), "utf8");
    for (const linha of modelo.split("\n")) {
      const limpa = linha.trim();
      if (limpa.startsWith("#") || !limpa.includes("=")) continue;
      const [nome, valor] = limpa.split("=", 2) as [string, string];
      if (/SEGREDO|SECRETA|CHAVE_ID|DATABASE_URL/.test(nome)) {
        expect(valor.trim(), `${nome} preenchido no modelo`).toBe("");
      }
    }
  });
});

describe("A recuperação de senha precisa de destino", () => {
  /** Produção sem as variáveis de notificação, que é o caso de esquecer. */
  function semDestino(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    // `EMAIL_ATIVO=nao` junto, porque ligar o envio sem provedor tem checagem
    // própria, que roda antes e em todo ambiente. Este bloco é sobre a outra
    // metade: a recuperação de senha ligada sem para onde mandar.
    const env = producao({ EMAIL_ATIVO: "nao", ...extra });
    delete env["NOTIFICADOR_URL"];
    delete env["NOTIFICADOR_CHAVE"];
    return env;
  }

  it("recusa recuperação ligada sem destino", () => {
    // O padrão é ligada, então esquecer o provedor é o caminho fácil, e era
    // exatamente ele que levava o segredo para o log.
    expect(() => carregarConfig(semDestino())).toThrow(/não tem por onde sair/i);
  });

  it("aceita a recuperação desligada, que é decisão explícita", () => {
    expect(() => carregarConfig(semDestino({ RECUPERACAO_ATIVA: "nao" }))).not.toThrow();
  });

  it("recusa recuperação ligada com o envio de email desligado", () => {
    /*
      O buraco que ficou aberto por semanas, e que a checagem acima NÃO pegava.

      `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` preenchidas, produção subindo sem
      reclamar, e nenhum email saindo: não havia cliente HTTP no servidor, as
      duas variáveis eram validadas e nunca lidas, e toda mensagem caía no
      notificador de log, que escreve o link de uso único em texto puro. A
      configuração parecia impecável dos dois lados.

      É por isso que a produção de hoje roda com `RECUPERACAO_ATIVA=nao`: não
      foi decisão de produto, foi a única saída honesta enquanto o envio não
      existia.
    */
    expect(() => carregarConfig(producao({ EMAIL_ATIVO: "nao" })))
      .toThrow(/EMAIL_ATIVO=nao/);

    // Desligar a recuperação continua sendo saída legítima e explícita.
    expect(() => carregarConfig(producao({ EMAIL_ATIVO: "nao", RECUPERACAO_ATIVA: "nao" })))
      .not.toThrow();
  });

  it("o envio de email ligado sem provedor não sobe, em ambiente nenhum", () => {
    /*
      Vale FORA de produção também, e de propósito: quem liga o envio na
      própria máquina para experimentar descobre na hora que falta o endereço
      do provedor, em vez de descobrir depois de meia hora achando que o ofício
      não chegou por outro motivo. É a mesma régua do `PUSH_ATIVO`.
    */
    expect(() => carregarConfig({
      NODE_ENV: "development", EMAIL_ATIVO: "sim",
    } as NodeJS.ProcessEnv)).toThrow(/não tem para onde mandar/i);
  });
});

/**
 * O ambiente da APNs, e o defeito que a falta dele causava.
 *
 * A Apple tem DOIS serviços de push que não se falam: `api.push.apple.com` e
 * `api.sandbox.push.apple.com`. Qual deles vale é decidido pelo
 * `aps-environment` com que o aplicativo foi ASSINADO, e uma ficha emitida num
 * ambiente é recusada no outro.
 *
 * Até 13/09/2026 o servidor montava o provedor sem escolha nenhuma, ou seja,
 * sempre contra produção. Um aplicativo compilado localmente pelo Xcode, que é
 * como o piloto é instalado e como o aparelho do Rafa recebeu o binário,
 * assina com `development` e recebe ficha de SANDBOX.
 *
 * O que acontecia então, e é pior do que "não chega": a produção responde
 * `BadDeviceToken`, que está na lista de recusas que significam "este aparelho
 * não existe mais". O varredor faz o que deve fazer com essa resposta e
 * REVOGA o aparelho. O agente não recebe o aviso, some da lista de aparelhos,
 * reinstala para tentar de novo, e o ciclo se repete. Ninguém vê erro nenhum:
 * o servidor está funcionando exatamente como foi escrito.
 */
describe("Ambiente da APNs", () => {
  const baseComPush = {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    PUSH_ATIVO: "sim",
    APNS_KEY_ID: "ABCDE12345",
    APNS_TEAM_ID: "TIME123456",
    APNS_BUNDLE: "com.exemplo.app",
    APNS_CHAVE: "-----BEGIN PRIVATE KEY-----\nfalsa\n-----END PRIVATE KEY-----",
  } as unknown as NodeJS.ProcessEnv;

  it("o padrão é produção, que é onde o binário de loja fala", () => {
    // Padrão errado aqui seria pior do que padrão ausente: o piloto acabaria e
    // o produto sairia para a loja falando com o sandbox, calado.
    const c = carregarConfig({ ...baseComPush });
    expect(c.APNS_AMBIENTE).toBe("producao");
  });

  it("aceita o sandbox, que é o que um build local do Xcode precisa", () => {
    const c = carregarConfig({ ...baseComPush, APNS_AMBIENTE: "teste" });
    expect(c.APNS_AMBIENTE).toBe("teste");
  });

  it("recusa valor que não é nenhum dos dois, em vez de escolher por conta", () => {
    /*
      Cair no padrão diante de um valor escrito errado (`sandbox`, `dev`,
      `producão` com acento) devolveria exatamente o defeito que esta variável
      existe para fechar, agora com alguém convencido de ter configurado.
    */
    expect(() => carregarConfig({ ...baseComPush, APNS_AMBIENTE: "sandbox" } as NodeJS.ProcessEnv))
      .toThrow();
  });
});
