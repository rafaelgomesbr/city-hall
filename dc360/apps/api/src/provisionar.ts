import { randomBytes } from "node:crypto";
import pg from "pg";
import { PAPEIS, cadastroUsuarioSchema } from "@dc360/shared";
import { derivarSenha } from "./auth/senha.js";

/**
 * Cria um município e o primeiro administrador dele.
 *
 * Este arquivo existe porque faltava a única porta de entrada de um cliente
 * novo. Não havia rota, nem comando: a tabela `organizacoes` só era populada
 * pela semente de desenvolvimento ou por INSERT na mão no banco de produção.
 * Na prática, o poder máximo do produto era quem tinha a `DATABASE_URL`, e
 * isso não estava escrito em lugar nenhum.
 *
 * **Por que não é uma rota da API.** Um endpoint que cria município precisaria
 * de um usuário acima de todos os municípios, e um usuário assim contradiz o
 * isolamento, que é a regra número um deste produto: bastaria um token vazado
 * para alcançar todas as prefeituras de uma vez. Provisionar é ato de operador
 * da plataforma, feito com a credencial de dono do banco, a mesma que aplica
 * migração, e deixa rastro no log do servidor, não na trilha de um município
 * que ainda não existe.
 *
 * A senha inicial é sorteada e impressa UMA vez. Não fica guardada em lugar
 * nenhum em texto claro, e quem recebe deve trocá-la na primeira entrada.
 *
 * Rodar:
 *   DATABASE_URL=postgres://... npm run provisionar --workspace @dc360/api -- \
 *     --municipio "Serra Alta" --uf MG \
 *     --orgao "Coordenadoria Municipal de Proteção e Defesa Civil" \
 *     --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br
 */

/** O mínimo de banco que provisionar precisa. Existe para o teste poder entrar. */
export type ExecutorSql = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type PedidoDeProvisionamento = {
  orgao: string;
  municipio: string;
  uf: string;
  nome: string;
  matricula: string;
  email: string;
  senha: string;
};

export type MunicipioProvisionado = {
  organizacaoId: string;
  usuarioId: string;
};

/**
 * O ato em si, separado da linha de comando para poder ser testado.
 *
 * Quem chama é responsável pela transação: um município meio criado, com
 * organização sem administrador, seria pior que nenhum.
 */
export async function provisionarMunicipio(
  bd: ExecutorSql,
  pedido: PedidoDeProvisionamento,
): Promise<MunicipioProvisionado> {
  const jaExiste = await bd.query<{ id: string }>(
    "SELECT id FROM organizacoes WHERE lower(municipio) = lower($1) AND upper(uf) = upper($2)",
    [pedido.municipio, pedido.uf],
  );
  if (jaExiste.rows[0]) {
    throw new Error(
      `Já existe município cadastrado como ${pedido.municipio}/${pedido.uf} ` +
      `(id ${jaExiste.rows[0].id}). Provisionar de novo criaria um segundo, ` +
      "com os dados do primeiro invisíveis para ele.",
    );
  }

  const org = await bd.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1,$2,upper($3)) RETURNING id",
    [pedido.orgao, pedido.municipio, pedido.uf],
  );
  const organizacaoId = org.rows[0]!.id;

  const hash = await derivarSenha(pedido.senha);
  const usuario = await bd.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,$2,$3,$4,'administrador',$5) RETURNING id`,
    [organizacaoId, pedido.nome, pedido.matricula, pedido.email, hash],
  );

  return { organizacaoId, usuarioId: usuario.rows[0]!.id };
}

type Argumentos = Record<string, string>;

function lerArgumentos(argv: readonly string[]): Argumentos {
  const lidos: Argumentos = {};
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]!;
    if (!atual.startsWith("--")) continue;
    const chave = atual.slice(2);
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("--")) {
      throw new Error(`Faltou o valor de --${chave}`);
    }
    lidos[chave] = valor;
    i++;
  }
  return lidos;
}

/**
 * Senha inicial sorteada, não escolhida.
 *
 * Vinte e quatro caracteres de um alfabeto sem os pares que se confundem
 * lidos em voz alta ou copiados de um papel (O e 0, I e l e 1). Quem
 * provisiona vai ditar isso por telefone.
 */
function sortearSenha(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
}

function exigir(args: Argumentos, chave: string): string {
  const valor = args[chave]?.trim();
  if (!valor) throw new Error(`Faltou --${chave}`);
  return valor;
}

async function principal(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL ausente. Provisionar contra um banco efêmero não serviria " +
      "para nada: o município sumiria junto com o processo.",
    );
  }

  const args = lerArgumentos(process.argv.slice(2));
  const municipio = exigir(args, "municipio");
  const uf = exigir(args, "uf").toUpperCase();
  const orgao = args["orgao"]?.trim()
    ?? `Coordenadoria Municipal de Proteção e Defesa Civil de ${municipio}`;
  const papel = args["papel"]?.trim() ?? "administrador";

  if (uf.length !== 2) throw new Error("--uf precisa ter duas letras");
  if (!(PAPEIS as readonly string[]).includes(papel)) {
    throw new Error(`--papel inválido: ${papel}`);
  }
  if (papel !== "administrador") {
    // Provisionar com papel abaixo do teto deixaria o município nascendo sem
    // ninguém capaz de criar o próximo usuário.
    throw new Error("O primeiro usuário de um município precisa ser administrador");
  }

  const senha = args["senha"]?.trim() || sortearSenha();

  /*
    O mesmo schema que a rota de cadastro usa. Um município novo não pode
    nascer com um email inválido ou uma matrícula vazia só porque entrou por
    outra porta.
  */
  const pessoa = cadastroUsuarioSchema.parse({
    nome: exigir(args, "nome"),
    matricula: exigir(args, "matricula"),
    email: exigir(args, "email"),
    papel,
    senha,
  });

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();

  try {
    await cliente.query("BEGIN");

    const criado = await provisionarMunicipio(
      {
        query: async <T,>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
      },
      {
        orgao, municipio, uf,
        nome: pessoa.nome, matricula: pessoa.matricula,
        email: pessoa.email, senha: pessoa.senha,
      },
    );

    await cliente.query("COMMIT");

    console.log("");
    console.log("Município provisionado.");
    console.log(`  Órgão .......... ${orgao}`);
    console.log(`  Município ...... ${municipio}/${uf}`);
    console.log(`  Id ............. ${criado.organizacaoId}`);
    console.log("");
    console.log("Primeiro administrador:");
    console.log(`  Nome ........... ${pessoa.nome}`);
    console.log(`  Email .......... ${pessoa.email}`);
    console.log(`  Id ............. ${criado.usuarioId}`);
    console.log(`  Senha inicial .. ${pessoa.senha}`);
    console.log("");
    console.log("Esta senha não fica guardada em texto claro em lugar nenhum e não");
    console.log("será mostrada de novo. Entregue por canal combinado e peça a troca");
    console.log("na primeira entrada.");
    console.log("");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exitCode = 1;
});
