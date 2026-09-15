import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verificarSessao } from "../src/tokens.js";
import { CODIGOS_POR_LOTE, SIMBOLOS_POR_CODIGO } from "../src/recuperacao.js";
import { base32Decodificar } from "../../api/src/auth/totp.js";
import {
  DONO, JWT_SEGREDO_DE_TESTE, codigoDe, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste,
} from "./apoio/console-de-teste.js";

/**
 * A recuperação de senha do console, por códigos de recuperação.
 *
 * O PEDIDO DO DONO, NA LETRA: "faz a recuperação de senha para mim, até para
 * eu resetar a minha senha". Ele é o dono: ninguém acima dele redefine, e o
 * console não tem provedor de email. A decisão: códigos de recuperação,
 * gerados uma vez e mostrados uma vez, cada um válido uma vez.
 *
 * USAR UM CÓDIGO REDEFINE A SENHA E TROCA O SEGUNDO FATOR, mostrando o QR novo
 * na hora. A recuperação existe para o dia em que o telefone foi perdido junto
 * com a senha, e nesse dia o autenticador antigo é inútil ou está com outra
 * pessoa. Se a pessoa só esqueceu a senha, escanear de novo custa dez segundos.
 *
 * O que este arquivo prova, e cada linha tem caso:
 *
 *   1. Gerar códigos exige a senha atual E um código novo do autenticador (a
 *      mesma régua da troca de senha), sai em lote de oito, e nada fica em
 *      texto claro: nem no banco, nem no log. Gerar de novo invalida os
 *      anteriores.
 *   2. Recuperar não exige sessão, e devolve o segredo novo UMA vez, sem
 *      token: a pessoa entra pela porta normal com a senha nova e o
 *      autenticador novo. As sessões que existiam caem.
 *   3. Email inexistente, operador inativo, código errado e código já usado
 *      recebem a MESMA resposta, no mesmo tempo aproximado: a rota não vira
 *      lista de quem trabalha no fornecedor.
 *   4. O banco recusa UPDATE e DELETE diretos nos códigos, e cada operador só
 *      enxerga as próprias linhas.
 *   5. A rota entra no limite da porta, e o argumento de por que isso basta
 *      está escrito em `recuperacao.ts`.
 */

let c: ConsoleDeTeste;
let tokenDoDono: string;
let idDoDono: string;

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
  idDoDono = (await c.mem.bruto.query<{ id: string }>(
    "SELECT id FROM console_operadores WHERE papel = 'dono'",
  )).rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

function comSessao(token: string, method: "GET" | "POST", url: string, payload?: unknown) {
  return c.app.inject({
    method, url, headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload } : {}),
  });
}

/** As linhas de código de um operador, lidas como dona das tabelas. */
async function codigosNoBanco(operadorId: string) {
  const r = await c.mem.bruto.query<{ id: string; codigo_hash: string; usado_em: string | null }>(
    `SELECT id, codigo_hash, usado_em::text AS usado_em
       FROM console_codigos_de_recuperacao WHERE operador_id = $1 ORDER BY criado_em, id`,
    [operadorId],
  );
  return r.rows;
}

/**
 * O formato combinado: dez símbolos do alfabeto ditável (sem `l`, `o`, `0` e
 * `1`), em dois grupos de cinco.
 */
const FORMA_DO_CODIGO = /^[a-km-np-z2-9]{5}-[a-km-np-z2-9]{5}$/;

async function recuperar(email: string, codigo: string, novaSenha: string) {
  return c.app.inject({ method: "POST", url: "/recuperar", payload: { email, codigo, novaSenha } });
}

/** O recado genérico da recuperação: toda recusa precisa ser exatamente este. */
const RECUSA_GENERICA = { erro: "recuperacao_invalida", mensagem: "Email ou código incorretos." };

describe("Gerar codigos de recuperacao, na propria conta", () => {
  it("a area Minha senha comeca dizendo que nao ha codigo nenhum", async () => {
    const r = await comSessao(tokenDoDono, "GET", "/codigos-de-recuperacao");
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ restantes: 0 });
  });

  it("gerar exige a senha atual e um codigo NOVO do autenticador, como a troca de senha", async () => {
    /* O código que abriu a sessão (o do relógio de agora) já está queimado na
       linha do dono: `entrar` avançou o relógio e usou exatamente este. */
    const codigoDaEntrada = codigoDe(c.segredoDoDono, c.relogio.agora);
    const codigoUsado = await comSessao(tokenDoDono, "POST", "/codigos-de-recuperacao", {
      senha: DONO.senha, codigo: codigoDaEntrada,
    });
    expect(codigoUsado.statusCode, codigoUsado.body).toBe(401);
    expect(codigoUsado.json().erro).toBe("codigo_invalido");

    const senhaErrada = await comSessao(tokenDoDono, "POST", "/codigos-de-recuperacao", {
      senha: "chute", codigo: codigoNovo(c.relogio, c.segredoDoDono),
    });
    expect(senhaErrada.statusCode, senhaErrada.body).toBe(401);
    expect(senhaErrada.json().erro).toBe("senha_incorreta");

    expect(await codigosNoBanco(idDoDono), "uma recusa gravou codigo").toEqual([]);
  }, 60_000);

  let primeiroLote: string[] = [];

  it("com senha e codigo novo, saem oito codigos de dez simbolos, e nada em texto claro no banco nem no log", async () => {
    const r = await comSessao(tokenDoDono, "POST", "/codigos-de-recuperacao", {
      senha: DONO.senha, codigo: codigoNovo(c.relogio, c.segredoDoDono),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(Object.keys(r.json()).sort(), "a resposta traz campo que ninguem revisou")
      .toEqual(["codigos", "restantes"]);

    const codigos: string[] = r.json().codigos;
    expect(codigos).toHaveLength(CODIGOS_POR_LOTE);
    expect(CODIGOS_POR_LOTE).toBe(8);
    expect(new Set(codigos).size, "codigo repetido no lote").toBe(8);
    for (const codigo of codigos) {
      expect(codigo, "codigo fora da forma combinada (sem 0, O, 1 e l)").toMatch(FORMA_DO_CODIGO);
      expect(codigo.replace(/-/g, "")).toHaveLength(SIMBOLOS_POR_CODIGO);
    }
    expect(r.json().restantes).toBe(8);

    const linhas = await codigosNoBanco(idDoDono);
    expect(linhas).toHaveLength(8);
    for (const linha of linhas) {
      expect(linha.codigo_hash, "o codigo nao foi derivado com scrypt").toMatch(/^scrypt\$131072\$8\$1\$/);
      expect(linha.usado_em).toBeNull();
      for (const codigo of codigos) {
        expect(linha.codigo_hash).not.toContain(codigo);
        expect(linha.codigo_hash).not.toContain(codigo.replace(/-/g, ""));
      }
    }

    const tudo = c.log.join("\n");
    for (const codigo of codigos) {
      expect(tudo, "um codigo de recuperacao foi para o log").not.toContain(codigo);
      expect(tudo).not.toContain(codigo.replace(/-/g, ""));
    }
    expect(tudo, "gerar codigos nao deixou rastro").toContain("gerar_codigos_de_recuperacao");

    const contagem = await comSessao(tokenDoDono, "GET", "/codigos-de-recuperacao");
    expect(contagem.json()).toEqual({ restantes: 8 });

    primeiroLote = codigos;
  }, 120_000);

  let segundoLote: string[] = [];

  it("gerar de novo invalida os anteriores: os oito antigos ficam usados, e sobram exatamente oito", async () => {
    const r = await comSessao(tokenDoDono, "POST", "/codigos-de-recuperacao", {
      senha: DONO.senha, codigo: codigoNovo(c.relogio, c.segredoDoDono),
    });
    expect(r.statusCode, r.body).toBe(200);
    segundoLote = r.json().codigos;
    expect(segundoLote).toHaveLength(8);
    expect(segundoLote.some((x) => primeiroLote.includes(x))).toBe(false);

    const linhas = await codigosNoBanco(idDoDono);
    expect(linhas).toHaveLength(16);
    expect(linhas.filter((l) => l.usado_em === null)).toHaveLength(8);
    expect(linhas.slice(0, 8).every((l) => l.usado_em !== null), "o lote antigo continuou valendo").toBe(true);

    const contagem = await comSessao(tokenDoDono, "GET", "/codigos-de-recuperacao");
    expect(contagem.json()).toEqual({ restantes: 8 });
  }, 120_000);

  it("um codigo do lote invalidado nao recupera nada", async () => {
    const r = await recuperar(DONO.email, primeiroLote[0]!, "senha-nova-que-nao-vai-valer");
    expect(r.statusCode, r.body).toBe(401);
    expect(r.json()).toEqual(RECUSA_GENERICA);
  }, 120_000);

  it("cada operador so enxerga as proprias linhas, e o banco recusa UPDATE e DELETE diretos", async () => {
    /*
      A conexao do console, com a MESMA abertura que a producao emite, lendo
      com o contexto de outro operador: zero linhas. E escrevendo por fora das
      funcoes: permissao negada, do banco, e nao de uma condicao em TypeScript.
    */
    const outro = "00000000-0000-4000-8000-000000000000";
    const comOutro = await c.mem.banco.ler<{ n: number }>(
      "SELECT count(*)::int AS n FROM console_codigos_de_recuperacao", [], outro,
    );
    expect(Number(comOutro[0]!.n), "um operador enxergou os codigos de outro").toBe(0);
    const comDono = await c.mem.banco.ler<{ n: number }>(
      "SELECT count(*)::int AS n FROM console_codigos_de_recuperacao", [], idDoDono,
    );
    expect(Number(comDono[0]!.n)).toBe(16);

    for (const escrita of [
      "UPDATE console_codigos_de_recuperacao SET usado_em = NULL",
      "DELETE FROM console_codigos_de_recuperacao",
    ]) {
      let mensagem = "";
      try {
        await c.mem.banco.executar(escrita, [], idDoDono);
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(mensagem.toLowerCase(), `o console executou "${escrita}"`)
        .toMatch(/permission denied|permissão negada/);
    }
    expect((await codigosNoBanco(idDoDono)).filter((l) => l.usado_em === null)).toHaveLength(8);
  }, 60_000);

  it("o banco recusa lote com menos de quatro hashes", async () => {
    let codigo = "";
    try {
      await c.mem.banco.executar(
        "SELECT console_renovar_codigos($1::text[])",
        [["scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk"]],
        idDoDono,
      );
    } catch (erro) {
      codigo = String((erro as { code?: string }).code ?? "");
    }
    expect(codigo, "um lote de um codigo so passou").toMatch(/^DC36\d$/);
    expect((await codigosNoBanco(idDoDono)).filter((l) => l.usado_em === null)).toHaveLength(8);
  });

  /* ---------- A recuperação de verdade, com o segundo lote ---------- */

  describe("Esqueci a senha, sem sessao: ate o dono recupera a propria conta", () => {
    const SENHA_NOVA = "senha-recuperada-da-dona-bem-comprida";
    let segredoNovo = "";
    let tokenAntigo = "";

    it("um codigo valido redefine a senha E o segundo fator, devolve o segredo novo uma vez, e NAO devolve sessao", async () => {
      tokenAntigo = tokenDoDono;
      const antes = (await c.mem.bruto.query<{ senha_hash: string; segundo_fator: string }>(
        "SELECT senha_hash, segundo_fator FROM console_operadores WHERE id = $1", [idDoDono],
      )).rows[0]!;

      /* Com espaco e maiuscula: quem digita de um papel escreve assim. */
      const digitado = segundoLote[3]!.toUpperCase().replace("-", " ");
      const r = await recuperar(` ${DONO.email.toUpperCase()} `, digitado, SENHA_NOVA);
      expect(r.statusCode, r.body).toBe(200);
      const corpo = r.json();
      expect(Object.keys(corpo).sort(), "a resposta traz campo que ninguem revisou")
        .toEqual(["endereco", "qr", "restantes", "segredo"]);
      expect(corpo.token, "a recuperacao devolveu sessao: a pessoa entra pela porta normal").toBeUndefined();
      expect(base32Decodificar(corpo.segredo), "o segredo novo nao e base32").not.toBeNull();
      expect(corpo.segredo).not.toBe(c.segredoDoDono);
      expect(corpo.endereco).toMatch(/^otpauth:\/\/totp\//);
      expect(corpo.endereco).toContain(`secret=${corpo.segredo}`);
      expect(corpo.qr.tamanho).toBeGreaterThan(20);
      expect(corpo.restantes, "so o codigo usado queima; os outros continuam valendo").toBe(7);
      segredoNovo = corpo.segredo;

      const depois = (await c.mem.bruto.query<{
        senha_hash: string; segundo_fator: string; falhas_login: number;
        bloqueado_ate: string | null; ultimo_passo_totp: string | null;
      }>(
        `SELECT senha_hash, segundo_fator, falhas_login, bloqueado_ate::text, ultimo_passo_totp::text
           FROM console_operadores WHERE id = $1`, [idDoDono],
      )).rows[0]!;
      expect(depois.senha_hash).not.toBe(antes.senha_hash);
      expect(depois.segundo_fator).not.toBe(antes.segundo_fator);
      expect(depois.segundo_fator, "o segredo novo esta em texto claro no banco").not.toContain(segredoNovo);
      expect(depois.falhas_login).toBe(0);
      expect(depois.bloqueado_ate).toBeNull();
      expect(depois.ultimo_passo_totp, "o passo do autenticador antigo continuou queimado").toBeNull();

      const linhas = await codigosNoBanco(idDoDono);
      expect(linhas.filter((l) => l.usado_em === null)).toHaveLength(7);
    }, 120_000);

    it("a sessao que existia cai, porque o token carrega a versao da senha", async () => {
      const r = await comSessao(tokenAntigo, "GET", "/municipios");
      expect(r.statusCode, "a sessao antiga continuou lendo numeros depois da recuperacao").toBe(401);
    });

    it("a senha antiga e o autenticador antigo nao abrem mais nada", async () => {
      const antiga = await c.app.inject({
        method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
      });
      expect(antiga.statusCode).toBe(401);

      const primeira = await c.app.inject({
        method: "POST", url: "/entrar", payload: { email: DONO.email, senha: SENHA_NOVA },
      });
      expect(primeira.statusCode, primeira.body).toBe(200);
      const comAntigo = await c.app.inject({
        method: "POST", url: "/entrar/codigo",
        payload: { desafio: primeira.json().desafio, codigo: codigoNovo(c.relogio, c.segredoDoDono) },
      });
      expect(comAntigo.statusCode, "o autenticador antigo continuou valendo").toBe(401);
    }, 120_000);

    it("a senha nova com o autenticador novo entram, e a sessao e a de sempre", async () => {
      tokenDoDono = await c.entrar(DONO.email, SENHA_NOVA, segredoNovo);
      const sessao = await verificarSessao(new TextEncoder().encode(JWT_SEGREDO_DE_TESTE), tokenDoDono);
      expect(sessao?.id).toBe(idDoDono);
      const contagem = await comSessao(tokenDoDono, "GET", "/codigos-de-recuperacao");
      expect(contagem.json()).toEqual({ restantes: 7 });
    }, 120_000);

    it("o codigo usado nao serve de novo, e a resposta e a generica", async () => {
      const r = await recuperar(DONO.email, segundoLote[3]!, "outra-senha-comprida-qualquer");
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual(RECUSA_GENERICA);
    }, 120_000);

    it("o rastro diz quem recuperou, em warn, e nunca o codigo, a senha nem o segredo", async () => {
      const linhas = c.log.filter((l) => l.includes("recuperacao"));
      const sucesso = linhas.find((l) => l.includes("redefinid"));
      expect(sucesso, "a recuperacao bem-sucedida nao deixou rastro").toBeDefined();
      expect(JSON.parse(sucesso!).level, "o rastro nao saiu em warn").toBe(40);
      expect(sucesso).toContain(DONO.email);
      expect(sucesso).toContain(idDoDono);

      const tudo = c.log.join("\n");
      expect(tudo).not.toContain(SENHA_NOVA);
      expect(tudo).not.toContain(segredoNovo);
      for (const codigo of segundoLote) {
        expect(tudo).not.toContain(codigo);
        expect(tudo).not.toContain(codigo.replace(/-/g, ""));
      }
    });
  });
});

describe("Toda recusa da recuperacao e a mesma, no mesmo tempo aproximado", () => {
  let operadorInativo = "";

  it("email inexistente, operador inativo, codigo errado e codigo ja usado: uma resposta so", async () => {
    /* Um operador com codigos, desativado em seguida. */
    const criado = await comSessao(tokenDoDono, "POST", "/operadores", { email: "sumido@fornecedor.com.br" });
    expect(criado.statusCode, criado.body).toBe(201);
    operadorInativo = criado.json().email;
    const codigoDoSumido: string = criado.json().codigos[0];
    const desativa = await comSessao(tokenDoDono, "POST", `/operadores/${criado.json().id}/desativar`);
    expect(desativa.statusCode, desativa.body).toBe(200);

    /* Em sequencia, e nao em paralelo: cada tentativa gasta oito derivacoes
       scrypt de 128 MB, e tres ao mesmo tempo disputariam a memoria da maquina
       de teste por nada. */
    const respostas = [
      await recuperar("ninguem@fornecedor.com.br", "abcde-fghjk", "senha-comprida-de-teste-1"),
      await recuperar(operadorInativo, codigoDoSumido, "senha-comprida-de-teste-2"),
      await recuperar(DONO.email, "abcde-fghjk", "senha-comprida-de-teste-3"),
    ];
    for (const r of respostas) {
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual(RECUSA_GENERICA);
    }

    /*
      O log diz o email tentado e um motivo de maquina GENERICO, pela mesma
      razao da primeira etapa da porta: distinguir "nao existe" de "codigo
      errado" no log e entregar a lista de quem trabalha aqui a quem le o log.
    */
    const recusas = c.log.filter((l) => l.includes("recuperacao recusada"));
    expect(recusas.length).toBeGreaterThanOrEqual(3);
    for (const email of ["ninguem@fornecedor.com.br", operadorInativo, DONO.email]) {
      const linha = recusas.find((l) => l.includes(email));
      expect(linha, `a recusa de ${email} nao deixou rastro`).toBeDefined();
      expect(JSON.parse(linha!).level).toBe(40);
      expect(linha).toContain("email_ou_codigo");
    }
    expect(c.log.join("\n")).not.toContain("abcde-fghjk");
    expect(c.log.join("\n")).not.toContain(codigoDoSumido);
  }, 180_000);

  it("email inexistente gasta o mesmo trabalho de uma conta com oito codigos", async () => {
    /*
      Sem isto, o tempo de resposta entrega quais emails tem conta: uma conta
      com codigos confere oito hashes scrypt, e um email que nao existe
      responderia em milissegundos. A rota confere TODOS os candidatos (nunca
      para no primeiro que bate) e completa ate oito derivacoes quando ha
      menos, entao os dois caminhos custam a mesma coisa. A folga de 0,4 e
      larga de proposito: sem a defesa, a razao seria de centesimos.
    */
    const inicioCheio = performance.now();
    await recuperar(DONO.email, "zzzzz-zzzzz", "senha-comprida-de-teste-4");
    const cheio = performance.now() - inicioCheio;

    const inicioVazio = performance.now();
    await recuperar("ninguem-mesmo@fornecedor.com.br", "zzzzz-zzzzz", "senha-comprida-de-teste-5");
    const vazio = performance.now() - inicioVazio;

    expect(cheio, "a conferencia contra oito hashes foi rapida demais para ter conferido").toBeGreaterThan(200);
    expect(
      vazio,
      `email inexistente respondeu em ${Math.round(vazio)} ms contra ${Math.round(cheio)} ms de uma `
      + "conta com codigos: o tempo entrega quem tem conta",
    ).toBeGreaterThan(cheio * 0.4);
  }, 180_000);

  it("pedido fora de forma (senha nova curta) responde 400 sem gastar derivacao nenhuma", async () => {
    const inicio = performance.now();
    const r = await recuperar(DONO.email, "abcde-fghjk", "curta");
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toContain("12 caracteres");
    expect(performance.now() - inicio).toBeLessThan(200);
  });

  it("consumir um codigo ja usado direto no banco e recusado com DC365", async () => {
    const usado = (await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_codigos_de_recuperacao WHERE usado_em IS NOT NULL LIMIT 1",
    )).rows[0]!;
    let codigo = "";
    try {
      await c.mem.banco.executar(
        "SELECT console_consumir_recuperacao($1, $2, $3)",
        [usado.id, "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk", "v1.x"],
      );
    } catch (erro) {
      codigo = String((erro as { code?: string }).code ?? "");
    }
    expect(codigo).toBe("DC365");
  });
});

describe("Ao criar operador, os codigos dele saem junto com senha, segredo e QR", () => {
  /* Os codigos que a criacao devolveu, guardados no TESTE para o caso seguinte
     usar um. O que nao pode e o servidor guardar. */
  let codigosDaNovata: string[] = [];

  it("a resposta traz oito codigos, gravados como hash na linha do operador novo", async () => {
    const r = await comSessao(tokenDoDono, "POST", "/operadores", { email: "novata@fornecedor.com.br" });
    expect(r.statusCode, r.body).toBe(201);
    const corpo = r.json();
    expect(corpo.codigos).toHaveLength(8);
    for (const codigo of corpo.codigos as string[]) expect(codigo).toMatch(FORMA_DO_CODIGO);
    codigosDaNovata = corpo.codigos;

    const linhas = await codigosNoBanco(corpo.id);
    expect(linhas).toHaveLength(8);
    expect(linhas.every((l) => l.usado_em === null)).toBe(true);
    for (const linha of linhas) {
      for (const codigo of corpo.codigos as string[]) {
        expect(linha.codigo_hash).not.toContain(codigo.replace(/-/g, ""));
      }
    }
    for (const codigo of corpo.codigos as string[]) {
      expect(c.log.join("\n"), "um codigo do operador novo foi para o log").not.toContain(codigo);
    }

    /* E o operador novo, entrando, ve os oito como dele; o dono continua vendo os dele. */
    const tokenDaNovata = await c.entrar(corpo.email, corpo.senhaInicial, corpo.segredo);
    const dela = await comSessao(tokenDaNovata, "GET", "/codigos-de-recuperacao");
    expect(dela.json()).toEqual({ restantes: 8 });
    const doDono = await comSessao(tokenDoDono, "GET", "/codigos-de-recuperacao");
    expect(doDono.json()).toEqual({ restantes: 7 });
  }, 180_000);

  it("o operador novo recupera a propria conta com um dos codigos, sem precisar do dono", async () => {
    const r = await recuperar("novata@fornecedor.com.br", codigosDaNovata[5]!, "senha-nova-da-novata-comprida");
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().restantes).toBe(7);
    const entra = await c.entrar("novata@fornecedor.com.br", "senha-nova-da-novata-comprida", r.json().segredo);
    expect(entra).toBeTypeOf("string");
  }, 120_000);
});

describe("A rota de recuperar esta sob o limite da porta", () => {
  it("depois do teto, responde 429 com a espera da porta", async () => {
    const apertado = await subirConsoleDeTeste({ limitePorEndereco: 3 });
    try {
      const desfechos: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await apertado.app.inject({
          method: "POST", url: "/recuperar",
          payload: { email: DONO.email, codigo: "abcde-fghjk", novaSenha: "senha-comprida-de-teste-6" },
        });
        desfechos.push(r.statusCode);
        if (r.statusCode === 429) {
          expect(r.json().mensagem).toBe("Tentativas demais. Espere alguns minutos.");
          break;
        }
      }
      expect(
        desfechos.includes(429),
        `a rota de recuperar aceitou cinco tentativas com teto de tres: ${desfechos.join(", ")}`,
      ).toBe(true);
    } finally {
      await apertado.encerrar();
    }
  }, 180_000);
});
