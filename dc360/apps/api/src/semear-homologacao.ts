import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { IDENTIDADES_DE_PROD, carregarSemente, urlComAncoraDeConfianca } from "@dc360/db";
import { identidadeConstaNaUrlDoBanco } from "./ambiente.js";
import { derivarSenha } from "./auth/senha.js";

/**
 * Semeia o banco de HOMOLOGAÇÃO com dados SINTÉTICOS e senhas SORTEADAS
 * (V2-F01-E11).
 *
 * ## Por que existe, se já existe a semente de desenvolvimento
 *
 * `db/seeds/desenvolvimento.sql` dá a toda conta a mesma senha, `defesa-civil-2026`,
 * e ela está escrita no repositório. HML fica na internet. Semear HML com aquela
 * semente seria publicar a chave de todas as contas de teste.
 *
 * Aqui a estrutura vem de `db/seeds/homologacao.sql`, que NÃO tem hash nenhum
 * (toda conta nasce trancada), e a senha de cada conta é sorteada e gravada na
 * MESMA transação que cria as contas. Se qualquer passo falha, nada fica: não
 * existe estado intermediário com conta sem senha ou com a senha pública.
 * As senhas são devolvidas a quem chamou, que as imprime UMA vez. Não ficam
 * guardadas em texto claro em lugar nenhum.
 *
 * ## O que ele recusa (nesta ordem, antes de qualquer escrita)
 *
 *   1. `AMBIENTE_DC360` diferente de `hml`. É a declaração do processo sobre onde
 *      ele está; PROD e DEV nunca recebem esta semente.
 *   2. Sem `DATABASE_URL`, ou sem `IDENTIDADE_DO_BANCO`. Sem a identidade não há
 *      como provar que o banco é o de HML.
 *   3. Identidade de PROD (a conhecida, em `IDENTIDADES_DE_PROD`) declarada como a
 *      deste ambiente, ou presente no usuário ou no host da URL.
 *   4. URL que não traz a `IDENTIDADE_DO_BANCO` declarada: a credencial de outro
 *      banco colada aqui.
 *   5. Banco que já tem QUALQUER município. Se algum não é da lista sintética, é
 *      município real (recusa com essa frase); se todos são sintéticos, o banco já
 *      foi semeado e semear de novo duplicaria tudo. Para recomeçar, recrie o banco
 *      de HML (HML é descartável por desenho).
 *
 * A organização (município) das contas vem do SQL da semente, nunca de variável.
 *
 * Rodar, de dentro de `dc360`, com a credencial de dono (setup) do banco de HML:
 *   AMBIENTE_DC360=hml IDENTIDADE_DO_BANCO=<ref> DATABASE_URL=<url de setup> \
 *     cd apps/api && npx tsx src/semear-homologacao.ts
 */

/** Os municípios da semente. Qualquer outro, no banco, é município real. */
export const ORGANIZACOES_SINTETICAS: readonly string[] = [
  "11111111-1111-4111-8111-000000000001", // Serra Alta
  "22222222-2222-4222-8222-000000000002", // Vale Fundo
];

export type ExecutorSql = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  /** Vários comandos de uma vez, sem parâmetros. */
  exec(sql: string): Promise<unknown>;
};

export type ContaSemeada = {
  email: string;
  matricula: string;
  nome: string;
  papel: string;
  municipio: string;
  uf: string;
  senha: string;
};

export type OpcoesDaSemente = {
  /** As variáveis de ambiente do processo (a função só lê as quatro de HML). */
  env: Readonly<Record<string, string | undefined>>;
  /** Para teste: troca o sorteio. Em uso real é sempre `sortearSenha`. */
  sortear?: () => string;
  /** Para teste: troca a derivação (o scrypt real leva ~1 s por conta). */
  derivar?: (senha: string) => Promise<string>;
};

/**
 * Doze letras e números sem os pares que se confundem (O e 0, I e l e 1), em
 * três grupos de quatro: ditável por telefone, e 12 caracteres de um alfabeto de
 * 54 símbolos dão mais de 69 bits, muito acima de qualquer palpite, para contas
 * que só existem em um ambiente descartável.
 */
export function sortearSenha(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  const letras = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
  return `${letras.slice(0, 4)}-${letras.slice(4, 8)}-${letras.slice(8, 12)}`;
}

/**
 * As recusas que dependem só do ambiente (1 a 4 da lista do cabeçalho).
 * Devolve o motivo, ou `null`. Nunca repete a URL: a senha mora nela.
 */
export function recusaDoAmbiente(env: OpcoesDaSemente["env"]): string | null {
  const ambiente = env["AMBIENTE_DC360"]?.trim();
  if (ambiente !== "hml") {
    return (
      `A semente de homologação só roda com AMBIENTE_DC360=hml (veio ${ambiente ? `"${ambiente}"` : "vazio"}). ` +
      "Ela troca a senha de todas as contas, e em qualquer outro ambiente isso seria " +
      "destruir o acesso de quem usa o sistema, ou plantar contas de teste."
    );
  }
  const url = env["DATABASE_URL"]?.trim();
  if (!url) {
    return "Faltou DATABASE_URL: semear um banco efêmero não serviria para nada, ele some com o processo.";
  }
  const identidade = env["IDENTIDADE_DO_BANCO"]?.trim();
  if (!identidade) {
    return (
      "Faltou IDENTIDADE_DO_BANCO (a referência do projeto de banco de HML). Sem ela não há como " +
      "provar que a DATABASE_URL é do banco de homologação."
    );
  }
  if (IDENTIDADES_DE_PROD.some((p) => p.toLowerCase() === identidade.toLowerCase())) {
    return "IDENTIDADE_DO_BANCO é a de PRODUÇÃO. HML tem banco próprio; recusando.";
  }
  if (IDENTIDADES_DE_PROD.some((p) => identidadeConstaNaUrlDoBanco(url, p))) {
    return (
      "A DATABASE_URL traz a identidade de um banco de PRODUÇÃO. A semente de homologação " +
      "troca a senha de todas as contas: aqui, seria derrubar o acesso dos municípios. Recusando."
    );
  }
  if (!identidadeConstaNaUrlDoBanco(url, identidade)) {
    return (
      "A DATABASE_URL não é do banco de HML: a identidade declarada em IDENTIDADE_DO_BANCO não " +
      "consta no usuário nem no host dela. Confira a credencial colada neste terminal."
    );
  }
  return null;
}

/**
 * O ato: recusa, cria as contas trancadas, sorteia e grava a senha de cada uma,
 * tudo em uma transação, e devolve as senhas.
 *
 * `bd` precisa ser o papel de SETUP do banco de HML (o mesmo de `npm run migrar`),
 * que atravessa a RLS. A aplicação nunca roda isto.
 */
export async function semearHomologacao(
  bd: ExecutorSql,
  { env, sortear = sortearSenha, derivar = derivarSenha }: OpcoesDaSemente,
): Promise<ContaSemeada[]> {
  const recusa = recusaDoAmbiente(env);
  if (recusa) throw new Error(recusa);

  await bd.exec("BEGIN");
  try {
    // Dois semeadores ao mesmo tempo veriam as duas tabelas vazias e semeariam
    // em dobro. O bloqueio serializa a conferência com a escrita.
    await bd.exec("LOCK TABLE organizacoes IN SHARE ROW EXCLUSIVE MODE");

    const existentes = await bd.query<{ id: string; municipio: string; uf: string }>(
      "SELECT id, municipio, uf FROM organizacoes",
    );
    if (existentes.rows.length > 0) {
      const reais = existentes.rows.filter((o) => !ORGANIZACOES_SINTETICAS.includes(o.id));
      if (reais.length > 0) {
        throw new Error(
          "Este banco já tem município que não é da semente de homologação " +
            `(${reais.map((o) => `${o.municipio}/${o.uf}`).join(", ")}). Isso é município REAL, ou ` +
            "um cadastro de verdade feito em HML: a semente não mistura dado sintético com ele. " +
            "Se este é mesmo o banco de HML, recrie-o vazio.",
        );
      }
      throw new Error(
        "Este banco de HML já foi semeado (os municípios sintéticos já existem). Semear de novo " +
          "duplicaria tudo e trocaria as senhas que alguém já recebeu. Para recomeçar, recrie o banco.",
      );
    }

    await bd.exec(carregarSemente("homologacao.sql"));

    const contas = await bd.query<{
      id: string;
      email: string;
      matricula: string;
      nome: string;
      papel: string;
      municipio: string;
      uf: string;
    }>(
      `SELECT u.id, u.email, u.matricula, u.nome, u.papel, o.municipio, o.uf
         FROM usuarios u JOIN organizacoes o ON o.id = u.organizacao_id
        ORDER BY o.municipio, u.papel, u.matricula`,
    );
    if (contas.rows.length === 0) {
      throw new Error(
        "A semente de homologação não criou nenhuma conta. Nada a fazer; desfazendo.",
      );
    }

    const semeadas: ContaSemeada[] = [];
    const jaSorteadas = new Set<string>();
    for (const conta of contas.rows) {
      let senha = sortear();
      while (jaSorteadas.has(senha)) senha = sortear();
      jaSorteadas.add(senha);
      const hash = await derivar(senha);
      await bd.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [hash, conta.id]);
      semeadas.push({
        email: conta.email,
        matricula: conta.matricula,
        nome: conta.nome,
        papel: conta.papel,
        municipio: conta.municipio,
        uf: conta.uf,
        senha,
      });
    }

    // A rede de baixo: nenhuma conta pode sair desta transação sem hash.
    const sem = await bd.query<{ n: string | number }>(
      "SELECT count(*) AS n FROM usuarios WHERE senha_hash IS NULL",
    );
    if (Number(sem.rows[0]?.n ?? 0) !== 0) {
      throw new Error("Sobrou conta sem senha depois do sorteio. Desfazendo tudo.");
    }

    await bd.exec("COMMIT");
    return semeadas;
  } catch (erro) {
    await bd.exec("ROLLBACK").catch(() => undefined);
    throw erro;
  }
}

async function principal(): Promise<void> {
  // A recusa vem ANTES de conectar: o pedido errado não toca no banco.
  const recusa = recusaDoAmbiente(process.env);
  if (recusa) throw new Error(recusa);

  const { default: pg } = await import("pg");
  const cliente = new pg.Client({
    connectionString: urlComAncoraDeConfianca(process.env["DATABASE_URL"]!),
  });
  await cliente.connect();
  try {
    const contas = await semearHomologacao(
      {
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
        exec: (sql: string) => cliente.query(sql),
      },
      { env: process.env },
    );

    console.log("");
    console.log("HML semeado com dados sintéticos. Senhas sorteadas, mostradas só agora:");
    console.log("");
    for (const c of contas) {
      console.log(
        `  ${c.municipio}/${c.uf}  ${c.papel.padEnd(13)} ${c.email}  ${c.senha}  (${c.nome}, matrícula ${c.matricula})`,
      );
    }
    console.log("");
    console.log(
      "Entre pelo E-MAIL da conta. Nenhuma senha fica guardada em texto claro, e esta lista",
    );
    console.log(
      "não aparece de novo: copie agora para o cofre de HML. Para recomeçar, recrie o banco.",
    );
    console.log("");
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exitCode = 1;
  });
}
