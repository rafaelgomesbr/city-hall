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
 *     --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br \
 *     --operador "Nome de quem está provisionando"
 *
 * `--operador` é obrigatório: o município nasce com uma linha na trilha dele
 * dizendo quem o criou, e essa linha é a única resposta que ele tem para "quem
 * criou isto". Sem nome, o registro existiria sem servir para nada.
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
  /**
   * Quem, do lado do fornecedor, está executando este provisionamento.
   *
   * Obrigatório, e sem valor padrao: uma frase generica como "operacao da
   * plataforma" responderia a pergunta da auditoria sem identificar ninguem, e
   * daria a aparencia de registro sem o conteudo dele.
   */
  operador: string;
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
  /*
    Antes de qualquer escrita, e nao depois: recusar no meio deixaria a
    organizacao criada e o municipio pela metade, dependendo de quem chama
    lembrar de desfazer.
  */
  const operador = pedido.operador.trim();
  if (!operador) {
    throw new Error(
      "Faltou dizer quem está provisionando. O município recebe uma linha na " +
      "trilha dele com o nome de quem o criou, e essa linha é a única resposta " +
      "que ele tem para \"quem criou isto\".",
    );
  }

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
  /*
    A senha inicial é PROVISÓRIA (migração 046): vale 72 horas para entrar, e
    a primeira sessão só alcança a troca de senha. É o mesmo carimbo que
    `provisionar_municipio` (o caminho do console) dá ao administrador que
    nasce por lá; sem ele, "quem recebe deve trocá-la na primeira entrada" era
    orientação, e orientação não é regra.
  */
  const usuario = await bd.query<{ id: string }>(
    `INSERT INTO usuarios
       (organizacao_id, nome, matricula, email, papel, senha_hash, senha_provisoria_ate)
     VALUES ($1,$2,$3,$4,'administrador',$5, now() + interval '72 hours') RETURNING id`,
    [organizacaoId, pedido.nome, pedido.matricula, pedido.email, hash],
  );

  const usuarioId = usuario.rows[0]!.id;

  await registrarNascimento(bd, {
    organizacaoId, usuarioId, operador,
    orgao: pedido.orgao,
    municipio: pedido.municipio,
    uf: pedido.uf.toUpperCase(),
    nome: pedido.nome,
    matricula: pedido.matricula,
    email: pedido.email,
  });

  return { organizacaoId, usuarioId };
}

/**
 * A linha espelho: o município passa a ler, na trilha dele, o próprio
 * nascimento.
 *
 * ## Por que aqui dentro, e não no comando de linha
 *
 * O comando é uma casca, e amanhã pode existir outra. O ato e o registro do
 * ato precisam ser a mesma transação: se o registro ficasse do lado de fora,
 * existiria um caminho que cria município sem registrar, e um registro que
 * pode ser esquecido não é registro.
 *
 * ## Por que trocar de papel no meio
 *
 * Quem provisiona conecta com a credencial de DONO do banco, a mesma que
 * aplica migração. `trilha_administrativa` tem `FORCE ROW LEVEL SECURITY`, e
 * as policies dela são `TO dc360_app`: o dono não tem policy nenhuma, então
 * `FORCE` o barra igual. Isso é bom e é de propósito, e a resposta certa não é
 * abrir uma policy para o dono, é gravar esta linha como qualquer tela do
 * produto grava, sob a mesma parede. Um erro de `organizacao_id` aqui não
 * conseguiria colocar o nascimento de um município dentro da trilha de outro:
 * a policy de inserção recusa antes.
 *
 * ## Por que `SET ROLE` e não `SET LOCAL ROLE`
 *
 * `SET LOCAL` só vale dentro de transação, e é silenciosamente ignorado fora
 * dela (com aviso, que ninguém lê). Esta função não abre a transação, quem
 * chama abre, e existe caminho legítimo que chama sem transação. `SET ROLE`
 * vale nos dois casos, e o `finally` devolve a conexão ao estado anterior
 * mesmo se a inserção falhar: sem ele, uma falha deixaria a conexão presa no
 * papel de aplicação, e o erro seguinte seria de permissão em vez do erro de
 * verdade.
 */
async function registrarNascimento(
  bd: ExecutorSql,
  dados: {
    organizacaoId: string; usuarioId: string; operador: string;
    orgao: string; municipio: string; uf: string;
    nome: string; matricula: string; email: string;
  },
): Promise<void> {
  /*
    A falha aqui é falha do ato inteiro, e a mensagem tem que dizer o conserto.

    Do Postgres 16 em diante, ser MEMBRO de `dc360_app` e poder ASSUMI-LO são
    direitos separados, e em produção o papel que provisiona tinha o primeiro e
    não o segundo. A migração 025 concede o segundo a quem migra, mas quem
    provisiona com outro papel esbarra nisto, e um erro cru do Postgres mandaria
    a pessoa procurar no lugar errado.
  */
  try {
    await bd.query("SET ROLE dc360_app");
  } catch (erro) {
    throw new Error(
      "Este papel de banco não consegue assumir dc360_app, e a linha espelho na " +
      "trilha do município é gravada sob a mesma segurança em nível de linha que " +
      "vale para o produto. Conceda o direito de assumir o papel e provisione de " +
      "novo:\n\n  GRANT dc360_app TO <o papel que você está usando> WITH SET TRUE;\n\n" +
      `Erro do banco: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
  try {
    await bd.query(
      "SELECT set_config('app.organizacao_atual', $1, false)",
      [dados.organizacaoId],
    );
    await bd.query(
      `INSERT INTO trilha_administrativa
         (organizacao_id, autor_id, autor_nome, autor_papel,
          acao, alvo_tipo, alvo_id, alvo_nome, antes, depois)
       VALUES ($1, NULL, $2, 'operador_da_plataforma',
               'municipio_provisionado', 'organizacao', $1, $3, NULL, $4)`,
      [
        dados.organizacaoId,
        dados.operador,
        `${dados.municipio}/${dados.uf}`,
        /*
          O "depois" descreve o que nasceu, para a auditoria não precisar
          cruzar com o cadastro atual, que pode ter mudado desde então.

          NUNCA a senha inicial, nem o hash dela. A migração 010 já escreveu
          essa regra, e este é o único lugar do produto onde uma senha em texto
          claro passa perto de uma escrita na trilha. A trilha é append-only:
          uma senha que entrasse aqui não sairia mais, nem por correção.
        */
        JSON.stringify({
          orgao: dados.orgao,
          municipio: dados.municipio,
          uf: dados.uf,
          administrador: {
            id: dados.usuarioId,
            nome: dados.nome,
            matricula: dados.matricula,
            email: dados.email,
            papel: "administrador",
          },
        }),
      ],
    );
  } finally {
    // `app.organizacao_atual` foi declarada no nível da sessão (a transação é
    // de quem chama), então some daqui explicitamente: deixá-la para trás faria
    // a próxima consulta desta conexão enxergar o município recém-criado sem
    // ninguém ter pedido.
    await bd.query("SELECT set_config('app.organizacao_atual', '', false)")
      .catch(() => undefined);
    await bd.query("RESET ROLE").catch(() => undefined);
  }
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
  const operador = exigir(args, "operador");

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
        orgao, municipio, uf, operador,
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
    console.log(`  Provisionado por ${operador}`);
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
