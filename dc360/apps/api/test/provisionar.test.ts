import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { provisionarMunicipio } from "../src/provisionar.js";

/**
 * Provisionar um município novo.
 *
 * Este era o buraco que impedia o produto de ganhar um segundo cliente sem
 * alguém abrir o banco de produção e digitar INSERT: não havia rota nem
 * comando que criasse `organizacoes` e o primeiro administrador. Na prática o
 * poder máximo era quem tinha a `DATABASE_URL`, e isso não estava escrito.
 *
 * O que estes casos exigem, e que não é óbvio: o município recém-criado
 * precisa ENTRAR e FUNCIONAR imediatamente, sem passo manual nenhum depois. É
 * fácil escrever um provisionamento que cria as linhas e deixa o município
 * inutilizável, por exemplo sem sequência de protocolo.
 */

let mem: BancoEmMemoria;
let app: FastifyInstance;

const SENHA = "senha-inicial-sorteada-de-teste";
/**
 * A senha que a administradora DEFINE na primeira entrada. A inicial é
 * provisória (migração 046): entra, e só abre a troca de senha.
 */
const SENHA_DEFINIDA = "senha-definida-pela-vania-2026";
/** Quem, do lado do fornecedor, executou o provisionamento. */
const OPERADOR = "Rafael Gomes (operação da plataforma)";

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-provisionamento-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

/** O executor do teste é o banco cru, que é o papel de dono que a CLI usa. */
function comoDono() {
  return {
    query: async <T,>(sql: string, params?: readonly unknown[]) => {
      const r = await mem.bruto.query<Record<string, unknown>>(
        sql, params ? [...params] : undefined,
      );
      return { rows: r.rows as T[] };
    },
  };
}

describe("Provisionar município", () => {
  it("cria o município e o primeiro administrador", async () => {
    const criado = await provisionarMunicipio(comoDono(), {
      orgao: "Coordenadoria Municipal de Proteção e Defesa Civil de Pedra Branca",
      municipio: "Pedra Branca", uf: "mg",
      nome: "Vânia Estevam Nogueira", matricula: "PB-1",
      email: "vania.nogueira@pedrabranca.exemplo.gov.br",
      senha: SENHA,
      operador: OPERADOR,
    });

    expect(criado.organizacaoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(criado.usuarioId).toMatch(/^[0-9a-f-]{36}$/);

    const org = await mem.bruto.query<{ uf: string; municipio: string }>(
      "SELECT uf, municipio FROM organizacoes WHERE id = $1", [criado.organizacaoId],
    );
    // A UF é normalizada para maiúscula na gravação: quem digita na linha de
    // comando não deve precisar lembrar disso.
    expect(org.rows[0]!.uf).toBe("MG");
    expect(org.rows[0]!.municipio).toBe("Pedra Branca");
  }, 120_000);

  it("o administrador recém-criado consegue entrar, e a primeira entrada exige definir a senha", async () => {
    // Provisionar que não deixa ninguém entrar não provisionou nada.
    const r = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().usuario.papel).toBe("administrador");
    expect(r.json().usuario.municipio).toBe("Pedra Branca");
    // A senha inicial é provisória (migração 046): a sessão nasce trancada.
    expect(r.json().trocaDeSenhaObrigatoria).toBe(true);

    const troca = await app.inject({
      method: "POST", url: "/auth/trocar-senha",
      headers: { authorization: `Bearer ${r.json().acesso}` },
      payload: { senhaAtual: SENHA, senha: SENHA_DEFINIDA },
    });
    expect(troca.statusCode, troca.body).toBe(200);
  }, 120_000);

  it("o município nasce funcionando: dá para abrir ocorrência e sai protocolo", async () => {
    /*
      A sequência de protocolo é criada sob demanda pela função do banco, e não
      pelo provisionamento. Este caso existe para provar isso: um município que
      não consegue gerar o primeiro protocolo é um município que não funciona,
      e o defeito só apareceria na frente do primeiro cliente.
    */
    const entrada = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA_DEFINIDA },
    });
    const token = entrada.json().acesso;

    const r = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: "deslizamento",
        endereco: "Rua da Pedreira, 80, Centro",
        solicitanteNome: "Moradora do imóvel vizinho",
        canalEntrada: "telefone",
        descricao: "Barranco cedeu depois da chuva da madrugada.",
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().protocolo).toMatch(/^\d{6}\/\d{4}$/);
    // Município novo começa do começo, e não continua a numeração de outro.
    expect(r.json().protocolo.startsWith("000001/")).toBe(true);
  }, 120_000);

  it("o novo município não enxerga o município que já existia", async () => {
    // O provisionamento não pode abrir buraco no isolamento, que é a regra
    // número um. Aqui o município novo entra e a fila dele tem só o que é dele.
    const entrada = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA_DEFINIDA },
    });
    const token = entrada.json().acesso;

    const r = await app.inject({
      method: "GET", url: "/ocorrencias?status=todas",
      headers: { authorization: `Bearer ${token}` },
    });
    const protocolos = (r.json().itens as Array<{ protocolo: string }>)
      .map((o) => o.protocolo);
    expect(protocolos).toEqual(["000001/" + new Date().getFullYear()]);
  }, 120_000);

  it("recusa provisionar o mesmo município duas vezes", async () => {
    /*
      Sem esta recusa, provisionar de novo criaria um segundo município com o
      mesmo nome, e o isolamento faria os dados do primeiro ficarem invisíveis
      para ele. O sintoma seria "o sistema perdeu tudo", com tudo intacto no
      banco, do lado errado da parede.
    */
    await expect(provisionarMunicipio(comoDono(), {
      orgao: "Outra coordenadoria qualquer",
      municipio: "pedra branca", uf: "MG",
      nome: "Outra Pessoa", matricula: "PB-2",
      email: "outra.pessoa@pedrabranca.exemplo.gov.br",
      senha: SENHA,
      operador: OPERADOR,
    })).rejects.toThrow(/já existe município/i);
  }, 120_000);
});

/**
 * A linha espelho na trilha do município.
 *
 * O plano pedia isto com uma frase curta ("linha espelho na trilha escrita
 * DENTRO da função de provisionamento") e a razão dela é longa.
 *
 * Provisionar é o único ato do produto praticado por quem NÃO é do município:
 * um operador da plataforma, com a credencial de dono do banco, a mesma que
 * aplica migração. Até aqui esse ato deixava rastro em um lugar só, o log do
 * servidor, que é justamente o lugar que o município não pode ler. Do lado de
 * dentro, a organização simplesmente aparecia: nenhuma resposta para "quem
 * criou isto, quando, e a mando de quem", que é a primeira pergunta de uma
 * auditoria e a primeira pergunta de um município que desconfia.
 *
 * Por que DENTRO da função, e não no comando de linha que a chama: o comando é
 * uma casca, e amanhã pode existir outra. O ato e o registro do ato precisam
 * ser a mesma transação, senão existe um caminho que cria município sem
 * registrar, e um registro que pode ser esquecido não é registro.
 *
 * Por que em `trilha_administrativa` e não em `trilha_eventos`: a trilha
 * operacional tem `ocorrencia_id NOT NULL`, e no instante do provisionamento
 * não existe ocorrência nenhuma. É a mesma decisão que a migração 010 já
 * tinha tomado, e ela já previa `alvo_tipo = 'organizacao'`.
 */
describe("Provisionar deixa linha espelho na trilha do município", () => {
  it("o município recém-criado enxerga, na trilha dele, o próprio nascimento", async () => {
    const criado = await provisionarMunicipio(comoDono(), {
      orgao: "Coordenadoria Municipal de Proteção e Defesa Civil de Serra Alta",
      municipio: "Serra Alta", uf: "MG",
      nome: "Otávio Ramalho Pinto", matricula: "SA-1",
      email: "otavio.ramalho@serraalta.exemplo.gov.br",
      senha: SENHA,
      operador: OPERADOR,
    });

    /*
      A leitura é feita como o município leria: papel de aplicação e
      `app.organizacao_atual`, ou seja, sob a mesma segurança em nível de linha
      que vale para qualquer tela do produto. Ler como dono provaria só que a
      linha existe em algum lugar do banco, e não que ela está do lado certo da
      parede, que é a única coisa que importa aqui.
    */
    const linhas = await mem.banco.comTenant(criado.organizacaoId, (c) =>
      c.query<{
        acao: string; alvo_tipo: string; alvo_id: string; alvo_nome: string;
        autor_id: string | null; autor_nome: string; autor_papel: string;
        antes: unknown; depois: Record<string, unknown> | null;
      }>("SELECT * FROM trilha_administrativa ORDER BY registrado_em"),
    );

    expect(linhas.rows).toHaveLength(1);
    const linha = linhas.rows[0]!;
    expect(linha.acao).toBe("municipio_provisionado");
    expect(linha.alvo_tipo).toBe("organizacao");
    expect(linha.alvo_id).toBe(criado.organizacaoId);
    expect(linha.alvo_nome).toBe("Serra Alta/MG");

    /*
      O autor não é usuário do município, e é por isso que `autor_id` fica
      nulo: carimbar o administrador recém-criado como autor seria escrever no
      registro que ele criou a si mesmo, que é falso, e é falso justamente na
      linha que existe para ser confiável.
    */
    expect(linha.autor_id).toBeNull();
    expect(linha.autor_nome).toBe(OPERADOR);
    expect(linha.autor_papel).toBe("operador_da_plataforma");

    // O ato não tem "antes": não havia município.
    expect(linha.antes).toBeNull();

    // O "depois" descreve o que nasceu, para a auditoria não precisar cruzar
    // com o cadastro atual, que pode ter mudado desde então.
    expect(linha.depois).toMatchObject({
      orgao: "Coordenadoria Municipal de Proteção e Defesa Civil de Serra Alta",
      municipio: "Serra Alta",
      uf: "MG",
      administrador: {
        id: criado.usuarioId,
        nome: "Otávio Ramalho Pinto",
        matricula: "SA-1",
        email: "otavio.ramalho@serraalta.exemplo.gov.br",
        papel: "administrador",
      },
    });
  }, 120_000);

  it("a senha inicial não entra na linha espelho", async () => {
    /*
      A migração 010 escreveu isto como regra ("NUNCA guardar senha, hash de
      senha, nem token"), e este é o único lugar do produto onde uma senha em
      texto claro passa perto de uma escrita na trilha. A trilha é append-only:
      uma senha que entrasse aqui não sairia mais, nem por correção.
    */
    const linhas = await mem.bruto.query<{ depois: unknown }>(
      "SELECT depois FROM trilha_administrativa WHERE acao = 'municipio_provisionado'",
    );
    const texto = JSON.stringify(linhas.rows.map((l) => l.depois));
    expect(texto).not.toContain(SENHA);
    expect(texto).not.toMatch(/senha|hash/i);
  }, 120_000);

  it("a linha espelho de um município não aparece para outro", async () => {
    /*
      A gravação acontece com a credencial de DONO do banco, que é a que provisiona.
      Se ela fosse feita por fora da segurança em nível de linha, um erro de
      `organizacao_id` colocaria o nascimento de um município dentro da trilha
      de outro, e ninguém perceberia. Este caso é o que prova que a escrita
      passa pela mesma parede que tudo o mais.
    */
    const serraAlta = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM organizacoes WHERE municipio = 'Serra Alta'",
    );
    const pedraBranca = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM organizacoes WHERE municipio = 'Pedra Branca'",
    );

    const vistoDePedraBranca = await mem.banco.comTenant(pedraBranca.rows[0]!.id, (c) =>
      c.query<{ alvo_nome: string }>(
        "SELECT alvo_nome FROM trilha_administrativa WHERE acao = 'municipio_provisionado'",
      ),
    );
    expect(vistoDePedraBranca.rows.map((l) => l.alvo_nome)).toEqual(["Pedra Branca/MG"]);
    expect(serraAlta.rows[0]!.id).not.toBe(pedraBranca.rows[0]!.id);
  }, 120_000);

  it("recusa provisionar sem dizer quem está provisionando", async () => {
    /*
      Campo obrigatório e não valor padrão: "operador da plataforma", genérico,
      responderia à pergunta da auditoria com uma frase que não identifica
      ninguém, e daria a aparência de registro sem o conteúdo dele.
    */
    await expect(provisionarMunicipio(comoDono(), {
      orgao: "Coordenadoria Municipal de Proteção e Defesa Civil de Vale Fundo",
      municipio: "Vale Fundo", uf: "MG",
      nome: "Iara Bezerra Lins", matricula: "VF-1",
      email: "iara.lins@valefundo.exemplo.gov.br",
      senha: SENHA,
      operador: "   ",
    })).rejects.toThrow(/quem está provisionando/i);

    // E a recusa não pode deixar município pela metade para trás.
    const sobrou = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes WHERE municipio = 'Vale Fundo'",
    );
    expect(sobrou.rows[0]!.n).toBe("0");
  }, 120_000);
});
