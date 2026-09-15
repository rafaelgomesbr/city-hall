import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";
import { abrirCofre, contextoDoOperador, lerRegistro, problemaNoHashDaSenha } from "../src/operadores.js";
import { faltaNoEsquema, mensagemDeEsquemaAtrasado } from "../src/esquema.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../src/banco-em-memoria.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";

/**
 * O que precisa ser verdade para este processo PODER subir em produção.
 *
 * Os três blocos abaixo cobrem defeitos que têm a mesma assinatura e por isso
 * andam juntos: o processo sobe, o log não diz nada, e o console fica inútil
 * de um jeito que só aparece quando alguém precisa dele.
 *
 *   1. `CONSOLE_HOST` de loopback num contêiner: sobe e não atende.
 *   2. Hash de senha comido pelo shell: sobe e recusa a senha certa, para
 *      sempre.
 *   3. Banco sem o que o console usa: sobe, mostra a tela inteira, e responde
 *      500 na hora de cadastrar a prefeitura.
 *
 * Nos três, a correção é a mesma: recusar a partida, dizendo a causa.
 */

const CHAVE_DO_COFRE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE_DO_COFRE);

/** Uma configuração de produção completa, para cada teste estragar uma linha. */
function ambienteDeProducao(alteracoes: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "production",
    CONSOLE_HOST: "0.0.0.0",
    CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
    CONSOLE_OPERADORES: "[]",
    CONSOLE_DATABASE_URL:
      "postgres://dc360_console_login:s@db.exemplo.com:5432/postgres?sslmode=verify-full",
    ...alteracoes,
  };
}

describe("CONSOLE_HOST de loopback não sobe em produção", () => {
  /**
   * O defeito, por extenso: dentro do contêiner, `127.0.0.1` é o loopback DO
   * CONTÊINER. O processo sobe inteiro, escreve no log que está no ar, e o
   * balanceador do Fly bate na porta publicada sem ninguém atender. Não existe
   * erro para procurar, existe um aplicativo de pé que não responde, e o
   * diagnóstico começa por rede e certificado porque o log diz que subiu.
   */
  for (const endereco of ["127.0.0.1", "localhost", "::1", "[::1]", "LocalHost"]) {
    it(`recusa CONSOLE_HOST=${endereco}`, () => {
      expect(() => carregarConfig(ambienteDeProducao({ CONSOLE_HOST: endereco })))
        .toThrow(/CONSOLE_HOST/);
      expect(() => carregarConfig(ambienteDeProducao({ CONSOLE_HOST: endereco })))
        .toThrow(/0\.0\.0\.0/);
    });
  }

  it("aceita 0.0.0.0, que é o que fly.console.toml declara", () => {
    expect(carregarConfig(ambienteDeProducao()).CONSOLE_HOST).toBe("0.0.0.0");
  });

  it("aceita `::`, que também atende em todas as interfaces", () => {
    expect(carregarConfig(ambienteDeProducao({ CONSOLE_HOST: "::" })).CONSOLE_HOST).toBe("::");
  });

  /**
   * FORA de produção o padrão continua sendo o loopback, e isso não é
   * inconsistência: na máquina de quem desenvolve, aceitar conexão de fora é
   * que seria o defeito.
   */
  it("em desenvolvimento o padrão continua sendo 127.0.0.1", () => {
    const config = carregarConfig({
      CONSOLE_JWT_SEGREDO: randomBytes(32).toString("base64url"),
      CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
      CONSOLE_OPERADORES: "[]",
    });
    expect(config.CONSOLE_HOST).toBe("127.0.0.1");
  });

  /**
   * A conexão com o banco de TODOS os municípios sem verificação de
   * certificado, conferida aqui além de na montagem do pool. A mensagem
   * precisa nomear `CONSOLE_DATABASE_URL`: quem lesse "DATABASE_URL" iria
   * procurar o defeito no segredo da API, que está certo.
   */
  it("recusa CONSOLE_DATABASE_URL sem sslmode que verifique", () => {
    expect(() => carregarConfig(ambienteDeProducao({
      CONSOLE_DATABASE_URL: "postgres://u:s@db.exemplo.com:5432/postgres",
    }))).toThrow(/CONSOLE_DATABASE_URL/);
  });
});

describe("a armadilha das aspas no hash da senha", () => {
  /**
   * O valor exato que sobra de
   * `fly secrets set CONSOLE_OPERADORES="...scrypt$131072$8$1$SAL$HASH..."`
   * com aspas duplas: o shell expande as três e some com elas.
   */
  const COMIDO_PELO_SHELL = "scrypt$$$c2FsZ2FkbzEyMzQ1Ng$aGFzaC1kZS1tZW50aXJpbmhh";

  it("o valor que o shell produz não passa", () => {
    expect(problemaNoHashDaSenha(COMIDO_PELO_SHELL)).not.toBeNull();
  });

  /**
   * Antes deste portão, este era o estado do defeito: `conferirSenha` devolve
   * `false` e nada mais acontece. Nenhum erro, nenhum log, nenhuma pista. O
   * teste afirma isso para o portão não ser confundido com defesa em
   * profundidade: sem ele, não existe defesa nenhuma.
   */
  it("o shell come SÓ os números, e o resto continua parecendo um hash", () => {
    expect(COMIDO_PELO_SHELL.startsWith("scrypt$")).toBe(true);
    expect(JSON.parse(`{"senha":${JSON.stringify(COMIDO_PELO_SHELL)}}`).senha)
      .toBe(COMIDO_PELO_SHELL);
  });

  it("o caso em que o shell come só o N, e as seis partes sobrevivem", () => {
    // `scrypt$$8$1$sal$hash` tem SEIS partes, então contar partes não basta.
    const soOn = "scrypt$$8$1$c2FsZ2FkbzEyMzQ1Ng$aGFzaC1kZS1tZW50aXJpbmhh";
    expect(soOn.split("$")).toHaveLength(6);
    expect(problemaNoHashDaSenha(soOn)).not.toBeNull();
  });

  /**
   * TETO DE TEMPO GENEROSO, e ele não é folga preguiçosa: `derivarSenha` roda o
   * scrypt do produto com N = 2^17, que come cerca de 128 MB e alguns décimos
   * de segundo por chamada, de propósito. Com a suíte inteira em paralelo numa
   * máquina ocupada, isso passa do teto padrão de cinco segundos e reprova um
   * teste que não tem defeito nenhum.
   */
  const TETO_DO_SCRYPT_MS = 30_000;

  it("um hash de verdade passa", async () => {
    expect(problemaNoHashDaSenha(await derivarSenha("uma-senha-qualquer"))).toBeNull();
  }, TETO_DO_SCRYPT_MS);

  it("não devolve o valor recebido na mensagem, porque ela vai para o log", () => {
    const problema = problemaNoHashDaSenha(COMIDO_PELO_SHELL);
    expect(problema).not.toContain("c2FsZ2FkbzEyMzQ1Ng");
    expect(problema).not.toContain("aGFzaC1kZS1tZW50aXJpbmhh");
  });

  it("a partida recusa o registro, nomeando o operador e a causa", () => {
    const email = "operacao@fornecedor.com.br";
    const envelope = cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(email));
    const registro = JSON.stringify([
      { email, senha: COMIDO_PELO_SHELL, segundoFator: envelope },
    ]);

    let erro: unknown;
    try {
      lerRegistro(registro, cofre);
    } catch (e) {
      erro = e;
    }

    const mensagem = erro instanceof Error ? erro.message : "";
    expect(mensagem).toContain(email);
    // A causa, e não o sintoma: quem lê precisa saber que foi o shell.
    expect(mensagem).toContain("aspas");
    expect(mensagem).toContain("fly secrets import");
  });

  /**
   * O ENVELOPE DO SEGUNDO FATOR CONTINUA ABRINDO com o hash estragado, e é
   * exatamente por isso que o portão da senha precisa existir separado: a
   * conferência que já havia na partida passa sem reclamar, porque o envelope
   * é base64 e não tem `$` para o shell comer.
   */
  it("o registro com hash estragado passaria pela conferência do envelope", () => {
    const email = "outra@fornecedor.com.br";
    const segredo = gerarSegredoTotp();
    const envelope = cofre.cifrar(segredo, contextoDoOperador(email));
    expect(cofre.decifrar(envelope, contextoDoOperador(email))).toBe(segredo);
  });

  it("um registro inteiro bem formado continua sendo aceito", async () => {
    const email = "certa@fornecedor.com.br";
    const registro = JSON.stringify([{
      email,
      senha: await derivarSenha("senha-de-verdade"),
      segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(email)),
    }]);
    expect(lerRegistro(registro, cofre).quantos()).toBe(1);
  }, TETO_DO_SCRYPT_MS);
});

describe("o console não sobe contra banco sem o que ele usa", () => {
  let memoria: ConsoleEmMemoria;

  beforeAll(async () => {
    memoria = await consoleEmMemoria();
  }, 120_000);

  afterAll(async () => {
    await memoria.banco.encerrar();
  });

  it("com as migrações todas aplicadas, não falta nada", async () => {
    expect(await faltaNoEsquema(memoria.banco)).toEqual([]);
  });

  /**
   * O caso relatado: banco sem a migração 036. A tela carrega inteira, os
   * números aparecem, e o defeito espera o "Cadastrar".
   */
  it("sem a função de provisionamento, recusa e diz qual função falta", async () => {
    await memoria.bruto.exec(
      "DROP FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)",
    );
    const faltas = await faltaNoEsquema(memoria.banco);
    expect(faltas.join("\n")).toContain("provisionar_municipio");
    expect(faltas.join("\n")).toContain("não existe");
  });

  /**
   * Existe e o console não alcança: é `GRANT` faltando, não migração faltando.
   * A mensagem precisa separar os dois, porque as correções são opostas e a
   * errada gasta a janela de implantação inteira.
   */
  it("com a função de volta e sem EXECUTE, a mensagem fala de privilégio", async () => {
    await memoria.bruto.exec(`
      CREATE FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)
      RETURNS TABLE (organizacao_id uuid, usuario_id uuid)
      LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::uuid $$;
      REVOKE ALL ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)
        FROM PUBLIC;
    `);

    const faltas = await faltaNoEsquema(memoria.banco);
    expect(faltas.join("\n")).toContain("provisionar_municipio");
    expect(faltas.join("\n")).toContain("EXECUTE");
    expect(faltas.join("\n")).not.toContain("não existe");

    await memoria.bruto.exec(`
      GRANT EXECUTE ON FUNCTION provisionar_municipio(text,text,text,text,text,text,text,text)
        TO dc360_console;
    `);
    expect(await faltaNoEsquema(memoria.banco)).toEqual([]);
  });

  it("coluna que o console lê e que sumiu do banco reprova pelo nome", async () => {
    await memoria.bruto.exec("ALTER TABLE metricas_municipio DROP COLUMN oficios_emitidos CASCADE");
    const faltas = await faltaNoEsquema(memoria.banco);
    expect(faltas.join("\n")).toContain("oficios_emitidos");
  });

  it("relação que sumiu reprova pelo nome", async () => {
    await memoria.bruto.exec("DROP VIEW IF EXISTS console_situacao_dos_municipios");
    const faltas = await faltaNoEsquema(memoria.banco);
    expect(faltas.join("\n")).toContain("console_situacao_dos_municipios");
  });

  /**
   * A mensagem é metade do valor deste portão: um processo que morresse
   * dizendo "erro ao consultar o banco" empurraria o diagnóstico para a rede e
   * para o certificado, que é onde o defeito não está.
   */
  it("a mensagem diz o que rodar, e separa migração de concessão", () => {
    const texto = mensagemDeEsquemaAtrasado(["a função `x` não existe neste banco"]);
    expect(texto).toContain("npm run migrar");
    expect(texto).toContain("dc360_console");
    expect(texto).toContain("docs/IMPLANTACAO.md");
  });
});
