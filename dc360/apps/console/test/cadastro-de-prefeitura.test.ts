import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../src/banco-em-memoria.js";
import type { EscritaDoConsole } from "../src/banco.js";
import type { Config } from "../src/config.js";
import { conferirSenha, derivarSenha } from "../../api/src/auth/senha.js";
import { base32Decodificar, codigoTotp, gerarSegredoTotp, passoDe } from "../../api/src/auth/totp.js";

/**
 * Cadastrar prefeitura pelo console, do formulário até a linha no banco.
 *
 * Este caminho nasceu como comando de linha rodado com a credencial de DONO do
 * banco. O que ele virou é uma tela, e a tela NÃO ganhou a credencial: o papel
 * `dc360_console` continua sem um privilégio sequer em tabela de negócio, e o
 * que a migração 036 lhe concedeu foi `EXECUTE` em UMA função do banco, que faz
 * o ato inteiro numa transação e devolve dois identificadores.
 *
 * O banco aqui é Postgres 16 em WebAssembly com as migrações reais, aberto pelo
 * MESMO `consoleEmMemoria` que a partida do console usa em desenvolvimento, e a
 * transação é aberta com o mesmo `SET LOCAL ROLE dc360_console` de produção.
 * Quando um caso abaixo mostra o banco recusando, quem recusa é o Postgres.
 *
 * Três coisas são cobradas aqui e não cabem no teste de banco:
 *
 *   1. A senha inicial que a tela mostra ABRE a conta criada. É o que amarra a
 *      derivação feita no processo do console à conferência feita pela API.
 *   2. A senha inicial não sobra em lugar nenhum: nem no log do processo, nem
 *      no banco, nem na resposta de nenhuma outra rota.
 *   3. A rota está atrás da sessão com segundo fator, e recusa ANTES de tocar
 *      no banco.
 */

const EMAIL = "coordenacao@fornecedor.com.br";
const SENHA = "senha-de-teste-bem-comprida-do-operador";
const CHAVE = randomBytes(32).toString("base64");

const cofre = abrirCofre(CHAVE);
const SEGREDO_TOTP = gerarSegredoTotp();

let mem: ConsoleEmMemoria;
let app: FastifyInstance;
let token: string;

/** O que o processo escreveu no log, para o caso da senha poder afirmar. */
const log: string[] = [];

/** Quantas vezes a rota chegou a falar com o banco. */
let chamadasAoBanco = 0;

const PEDIDO = {
  municipio: "Serra Alta",
  uf: "MG",
  nome: "Rita Lopes",
  matricula: "SA-1",
  email: "Rita@SerraAlta.MG.GOV.BR",
  operador: "Rafael Gomes (operacao da plataforma)",
};

beforeAll(async () => {
  mem = await consoleEmMemoria();

  /*
    A escrita do servidor é a do console, com um contador em volta. O contador
    é o que permite afirmar que uma recusa aconteceu ANTES do banco, e não
    depois: "respondeu 400" sozinho não distingue as duas coisas.
  */
  const escrita: EscritaDoConsole = {
    executar: (sql, params) => {
      chamadasAoBanco += 1;
      return mem.banco.executar(sql, params);
    },
  };

  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: EMAIL,
      senha: await derivarSenha(SENHA),
      segundoFator: cofre.cifrar(SEGREDO_TOTP, contextoDoOperador(EMAIL)),
    }]),
  };

  app = await construirConsole({
    config,
    leitura: mem.banco,
    escrita,
    limitePorEndereco: 500,
    // Alto de propósito: o teto de produção é cinco por hora, e a razão dele
    // está escrita no servidor. Aqui ele só faria os casos brigarem entre si.
    limiteDeCadastro: 500,
    destinoDeLog: { write: (linha: string) => { log.push(linha); } },
  });

  // A porta inteira: senha, depois o código do aplicativo. Não existe atalho.
  const primeira = await app.inject({
    method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
  });
  const codigo = codigoTotp(base32Decodificar(SEGREDO_TOTP)!, passoDe(new Date()));
  const segunda = await app.inject({
    method: "POST", url: "/entrar/codigo",
    payload: { desafio: primeira.json().desafio, codigo },
  });
  expect(segunda.statusCode, `nao consegui entrar no console: ${segunda.body}`).toBe(200);
  token = segunda.json().token;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

function cadastrar(corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST", url: "/prefeituras",
    headers: { authorization: `Bearer ${token}` },
    payload: corpo,
  });
}

async function quantasOrganizacoes(): Promise<number> {
  const r = await mem.bruto.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM organizacoes",
  );
  return Number(r.rows[0]!.n);
}

describe("O console cadastra a prefeitura e o primeiro administrador dela", () => {
  it("sem sessao, nao cadastra e nao toca no banco", async () => {
    const antes = await quantasOrganizacoes();
    const antesDeChamar = chamadasAoBanco;

    const r = await app.inject({
      method: "POST", url: "/prefeituras", payload: PEDIDO,
    });

    expect(r.statusCode, "a rota que cria prefeitura respondeu sem sessao").toBe(401);
    expect(
      chamadasAoBanco,
      "a rota falou com o banco antes de conferir a sessao: esconder o botao na " +
      "tela nao e controle de acesso",
    ).toBe(antesDeChamar);
    expect(await quantasOrganizacoes()).toBe(antes);
  });

  it("cria o municipio, o administrador e a linha de nascimento, e devolve a senha", async () => {
    const r = await cadastrar(PEDIDO);
    expect(r.statusCode, `nao cadastrou: ${r.body}`).toBe(201);

    const corpo = r.json();

    /*
      A RESPOSTA E EXATAMENTE TRES CAMPOS. Nada de nome de outro municipio, nada
      de contagem, nada de lista: este processo enxerga todas as prefeituras de
      uma vez, e um campo a mais aqui e um campo que ninguem revisou.
    */
    expect(
      Object.keys(corpo).sort(),
      "a resposta do cadastro traz campo que ninguem revisou",
    ).toEqual(["organizacaoId", "senhaInicial", "usuarioId"]);

    const org = await mem.bruto.query<{ nome: string; municipio: string; uf: string }>(
      "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1", [corpo.organizacaoId],
    );
    expect(org.rows[0]!.municipio).toBe("Serra Alta");
    expect(org.rows[0]!.uf).toBe("MG");
    // Sem o nome do órgão digitado, vale a forma que a Defesa Civil municipal
    // usa em documento oficial, e esse nome sai impresso no laudo.
    expect(org.rows[0]!.nome).toBe(
      "Coordenadoria Municipal de Proteção e Defesa Civil de Serra Alta",
    );

    const usuario = await mem.bruto.query<{
      papel: string; email: string; matricula: string; ativo: boolean;
    }>(
      "SELECT papel, email, matricula, ativo FROM usuarios WHERE id = $1",
      [corpo.usuarioId],
    );
    expect(usuario.rows[0]!.papel).toBe("administrador");
    expect(usuario.rows[0]!.ativo).toBe(true);
    // O email entra normalizado: quem digitou com maiúsculas entra com o mesmo
    // endereço com que vai tentar fazer login depois.
    expect(usuario.rows[0]!.email).toBe("rita@serraalta.mg.gov.br");

    /*
      A linha de nascimento, na trilha do próprio município. É a única resposta
      que ele tem para "quem criou isto", e é por isso que o formulário exige o
      nome de quem cadastra em vez de escrever "operação da plataforma".
    */
    const trilha = await mem.bruto.query<{ autor_nome: string; acao: string }>(
      `SELECT autor_nome, acao FROM trilha_administrativa WHERE organizacao_id = $1`,
      [corpo.organizacaoId],
    );
    expect(trilha.rows, "o municipio nasceu sem a linha que diz quem o criou")
      .toHaveLength(1);
    expect(trilha.rows[0]!.acao).toBe("municipio_provisionado");
    expect(trilha.rows[0]!.autor_nome).toBe(PEDIDO.operador);
  }, 60_000);

  it("a senha que a tela mostra abre a conta que acabou de nascer", async () => {
    /*
      O CASO QUE AMARRA AS DUAS PONTAS.

      A senha é sorteada e derivada no processo do console; quem confere, quando
      o administrador entra pela primeira vez, é a API. Se um dia as duas
      deixarem de falar a mesma língua (parâmetros diferentes de scrypt, formato
      diferente, normalização diferente), o cadastro continuaria respondendo 201
      e o município nasceria com um administrador que não consegue entrar. O
      defeito apareceria no telefone, dias depois, e ninguém ligaria uma coisa à
      outra.
    */
    const r = await cadastrar({
      ...PEDIDO, municipio: "Vale Fundo", matricula: "VF-1",
      email: "rita@valefundo.mg.gov.br",
    });
    expect(r.statusCode).toBe(201);
    const { usuarioId, senhaInicial } = r.json();

    const guardado = await mem.bruto.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM usuarios WHERE id = $1", [usuarioId],
    );
    const hash = guardado.rows[0]!.senha_hash;

    expect(
      await conferirSenha(senhaInicial, hash),
      "a senha mostrada na tela NAO abre a conta criada: o municipio nasceu com um " +
      "administrador que nao consegue entrar",
    ).toBe(true);

    // E a conferência recusa outra senha: sem isto, um `conferirSenha` que
    // devolvesse `true` para tudo faria o caso acima passar sem provar nada.
    expect(await conferirSenha("outra-senha-qualquer", hash)).toBe(false);
  }, 60_000);

  it("a senha inicial nao fica guardada em texto claro em lugar nenhum", async () => {
    const r = await cadastrar({
      ...PEDIDO, municipio: "Morro Claro", matricula: "MC-1",
      email: "rita@morroclaro.mg.gov.br",
    });
    const { organizacaoId, usuarioId, senhaInicial } = r.json();

    expect(senhaInicial.length, "a senha inicial veio vazia").toBeGreaterThan(11);

    // 1. No banco vai o hash, e ele não é a senha.
    const usuario = await mem.bruto.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM usuarios WHERE id = $1", [usuarioId],
    );
    expect(usuario.rows[0]!.senha_hash.startsWith("scrypt$")).toBe(true);
    expect(usuario.rows[0]!.senha_hash).not.toContain(senhaInicial);

    /*
      2. Nem na trilha. Ela é append-only: uma senha que entrasse ali não sairia
      mais, nem por correção, e este é o único lugar do produto onde uma senha
      em texto claro passa perto de uma escrita na trilha.
    */
    const trilha = await mem.bruto.query<{ linha: string }>(
      `SELECT row_to_json(t)::text AS linha FROM trilha_administrativa t
        WHERE organizacao_id = $1`,
      [organizacaoId],
    );
    expect(trilha.rows[0]!.linha).not.toContain(senhaInicial);
    expect(
      trilha.rows[0]!.linha,
      "o hash da senha entrou na trilha, que nao se corrige",
    ).not.toContain("scrypt");

    /*
      3. Nem no log do processo. O log deste console é lido por mais gente do
      que a tela e fica guardado pelo tempo de retenção inteiro: uma senha que
      caísse ali deixaria de ser "mostrada uma vez" sem ninguém perceber.
    */
    expect(
      log.length,
      "o coletor de log nao recebeu nada: a busca pela senha abaixo nao prova nada",
    ).toBeGreaterThan(0);
    const tudo = log.join("\n");
    expect(tudo, "a senha inicial foi parar no log do console").not.toContain(senhaInicial);
    // E o log REGISTRA o ato, que é o outro lado da mesma moeda: cadastrar
    // prefeitura não pode ser um ato sem rastro do lado do fornecedor.
    expect(tudo).toContain("prefeitura cadastrada pelo console");
    expect(tudo).toContain(organizacaoId);
  }, 60_000);

  it("recusa municipio duplicado, diz qual ja existe, e nao cria o segundo", async () => {
    await cadastrar({
      ...PEDIDO, municipio: "Pedra Branca", matricula: "PB-1",
      email: "rita@pedrabranca.mg.gov.br",
    });

    const antes = await quantasOrganizacoes();
    // Caixa diferente de propósito: "pedra branca" e "Pedra Branca" são a mesma
    // prefeitura, e dois cadastros dela seriam dois bancos de dados invisíveis
    // um para o outro.
    const r = await cadastrar({
      ...PEDIDO, municipio: "pedra branca", matricula: "PB-2",
      email: "outra@pedrabranca.mg.gov.br",
    });

    expect(r.statusCode, `esperava recusa de duplicata: ${r.body}`).toBe(409);
    expect(r.json().erro).toBe("municipio_duplicado");
    expect(
      r.json().mensagem,
      "a recusa nao diz QUAL municipio ja existe, e manda a pessoa procurar " +
      "sozinha numa lista",
    ).toContain("Pedra Branca/MG");

    expect(
      await quantasOrganizacoes(),
      "a recusa de duplicata deixou uma organizacao a mais para tras",
    ).toBe(antes);
  }, 60_000);

  it("recusa o email que ja tem conta em outro municipio, e nao diz em qual", async () => {
    /*
      O email de login vale para o PRODUTO INTEIRO, e não para o município (ver
      a migração 002): na hora de entrar ainda não se sabe o município, e dois
      usuários com o mesmo email em prefeituras diferentes tornariam a resposta
      ambígua. O banco tem índice único global para isso.

      Sem tradução, quem cadastra recebe "falha interna" e recomeça o formulário
      sem saber o que mudar. Este caso guarda a tradução E o limite dela: a
      mensagem diz que o email já tem conta e não diz onde. Município quem
      cadastra já pode listar; quem trabalha em cada um é dado de pessoa, e a
      decisão 2 da ADR 0008 fecha essa porta.
    */
    await cadastrar({
      ...PEDIDO, municipio: "Agua Limpa", matricula: "AL-1",
      email: "repetida@prefeitura.mg.gov.br",
    });

    const antes = await quantasOrganizacoes();
    const r = await cadastrar({
      ...PEDIDO, municipio: "Campo Verde", matricula: "CV-1",
      email: "Repetida@Prefeitura.MG.gov.br",
    });

    expect(r.statusCode, `esperava recusa de email repetido: ${r.body}`).toBe(409);
    expect(r.json().erro).toBe("email_em_uso");
    expect(r.json().mensagem).toContain("repetida@prefeitura.mg.gov.br");
    expect(
      r.json().mensagem,
      "a recusa entrega em qual prefeitura aquele email tem conta, e isso e dado " +
      "de pessoa: o console nao responde por ele",
    ).not.toContain("Agua Limpa");

    expect(
      await quantasOrganizacoes(),
      "a recusa do email repetido deixou a organizacao criada para tras",
    ).toBe(antes);
  }, 60_000);

  it("campo faltando recusa ANTES de falar com o banco", async () => {
    for (const [rotulo, corpo] of [
      ["sem municipio", { ...PEDIDO, municipio: "" }],
      ["uf que nao e uf", { ...PEDIDO, uf: "MGG" }],
      ["email invalido", { ...PEDIDO, email: "rita-arroba-prefeitura" }],
      ["sem quem esta cadastrando", { ...PEDIDO, operador: "   " }],
    ] as const) {
      const antesDeChamar = chamadasAoBanco;
      const r = await cadastrar(corpo);

      expect(r.statusCode, `${rotulo} passou pela validacao: ${r.body}`).toBe(400);
      expect(
        r.json().mensagem,
        `${rotulo} recusou sem dizer o que esta errado`,
      ).toBeTruthy();
      expect(
        chamadasAoBanco,
        `${rotulo} chegou a falar com o banco: uma derivacao de senha de 128 MB ` +
        "por pedido mal formado e uma porta de negacao de servico",
      ).toBe(antesDeChamar);
    }
  });

  it("a resposta nao devolve senha nenhuma que nao seja a do municipio criado", async () => {
    /*
      A rota que LE continua sendo a de números agregados, e ela não passou a
      devolver nada de pessoa por causa desta entrega. Vale a pena cobrar junto
      porque a prefeitura recém-criada é a linha mais nova da tabela, e é nela
      que um campo a mais apareceria primeiro.
    */
    const lista = (await app.inject({
      method: "GET", url: "/municipios",
      headers: { authorization: `Bearer ${token}` },
    })).body.toLowerCase();

    for (const proibido of ["senha", "scrypt", "hash", "matricula", "email"]) {
      expect(lista, `a lista de municipios carrega "${proibido}"`).not.toContain(proibido);
    }
  });

  it("depois de cadastrar, o console continua sem enxergar quem ele criou", async () => {
    /*
      A garantia do banco, vista pela conexão que o console de verdade usa. Se
      criar prefeitura desse ao console qualquer leitura a mais, seria por aqui
      que uma conta do fornecedor comprometida viraria dado de cidadão de todas
      as prefeituras de uma vez.

      A âncora: as linhas existem. Sem ela, a recusa seria indistinguível de uma
      consulta que não achou nada.
    */
    const quantos = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM usuarios",
    );
    expect(
      Number(quantos.rows[0]!.n),
      "nenhum administrador foi criado, entao a recusa abaixo nao prova nada",
    ).toBeGreaterThan(0);

    for (const consulta of [
      "SELECT nome, email FROM usuarios",
      "SELECT senha_hash FROM usuarios",
      "SELECT autor_nome FROM trilha_administrativa",
    ]) {
      let mensagem = "";
      try {
        await mem.banco.ler(consulta);
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(
        mensagem.toLowerCase(),
        `o console leu o que acabou de criar: "${consulta}"`,
      ).toMatch(/permission denied|permissão negada/);
    }
  });

  it("a escrita do console nao vira licenca para escrever em tabela", async () => {
    /*
      O que a migração 036 concedeu foi `EXECUTE` em UMA função. O papel
      continua sem `INSERT`, `UPDATE` e `DELETE` em tabela nenhuma, e é o banco
      quem garante isso: se alguém escrever um `INSERT` na rota de amanhã, ele
      responde "permissão negada".
    */
    for (const escrita of [
      "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('x','x','MG')",
      "UPDATE usuarios SET papel = 'administrador'",
      "DELETE FROM organizacoes",
      "UPDATE metricas_municipio SET ocorrencias_atrasadas = 0",
    ]) {
      let recusou = false;
      try {
        await mem.banco.executar(escrita);
      } catch {
        recusou = true;
      }
      expect(recusou, `o console executou "${escrita}"`).toBe(true);
    }
  });
});
