/**
 * O que os roteiros de produção compartilham: qual ambiente, onde a senha
 * mora, qual é o banco, e como montar a URL sem que a senha a parta ao meio.
 *
 * Saiu de `migrar-producao.mjs` em 15/09/2026, quando `copiar-producao.mjs`
 * passou a precisar das mesmas coisas e o migrador passou a precisar de saber
 * se há cópia recente: dois arquivos importando um ao outro é um ciclo que
 * funciona por acaso.
 *
 * ## V2-F01-E15: por ambiente e em qualquer sistema
 *
 * Até aqui este arquivo fixava o banco de PRODUÇÃO e lia a senha só do
 * chaveiro do macOS. Agora:
 *
 *   - `--ambiente hml|prod` é OBRIGATÓRIO em todo roteiro. Sem ele o roteiro
 *     recusa: escolher o ambiente por omissão é como se migra o banco errado.
 *   - O projeto (identidade), o host e a porta vêm de `scripts/ambientes.json`
 *     (V2-F01-E09), que é o único lugar que sabe o endereço de cada banco.
 *   - A senha vem, nesta ordem, de: variável de ambiente do ambiente
 *     (`DC360_SENHA_BANCO_PROD` ou `DC360_SENHA_BANCO_HML`), do chaveiro do
 *     sistema (macOS: `security`; Linux: `secret-tool`, se instalado) e de
 *     pergunta sem eco no terminal. No Windows não existe comando embutido
 *     para ler credencial genérica, então vale a variável ou a pergunta.
 *     Nunca vem da linha de comando, e nunca é impressa.
 *   - Cada ambiente tem a SUA senha: a de HML não abre PROD, e vice-versa.
 *     Nenhum ambiente herda a senha do outro, nem como reserva.
 *
 * Os comentários das constantes de produção são os de origem, e valem.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/** Onde a senha mora no chaveiro. Ver `--ajuda`. */
export const CONTA = "dc360";
export const COFRE = "senha-do-banco-dc360";

/** O projeto de PRODUÇÃO na Supabase. Aparece no endereço e no nome do papel. */
export const PROJETO = "bppklrxxwjshxvkvwirw";

/**
 * O banco de produção, PELO POOLER, e isto foi correção e não gosto.
 *
 * A primeira versão apontava para a conexão direta
 * (`db.<projeto>.supabase.co`), com o argumento de que migração é sessão longa.
 * O argumento estava certo e o endereço estava errado: contra a rede de
 * verdade, em 14/09/2026,
 *
 *   Error: getaddrinfo ENOTFOUND db.bppklrxxwjshxvkvwirw.supabase.co
 *
 * Não é queda nem bloqueio. O nome da conexão direta só tem registro AAAA, ou
 * seja, só existe em IPv6:
 *
 *   dig +short A    db.<projeto>.supabase.co  ->  (vazio)
 *   dig +short AAAA db.<projeto>.supabase.co  ->  2600:1f1e:c3:2702:...
 *
 * Numa rede sem IPv6, que é a da máquina que rodou e provavelmente a da
 * prefeitura, aquilo é um nome que não resolve. O pooler tem IPv4.
 */
export const HOST = "aws-0-sa-east-1.pooler.supabase.com";

/**
 * MODO SESSÃO, e a porta é a diferença inteira.
 *
 * 5432 é sessão: a conexão é sua do começo ao fim. 6543 é transação, onde ela
 * volta para o bolo ao fim de cada transação, e aí não há sessão nenhuma para
 * segurar `SET ROLE`, trava de aviso, ou qualquer coisa que atravesse
 * comandos. Migração precisa das duas coisas.
 */
export const PORTA = 5432;

/** Os ambientes que têm banco de verdade. `dev` é a máquina de quem desenvolve. */
export const AMBIENTES_COM_BANCO = ["hml", "prod"];

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Lê `scripts/ambientes.json`. Função própria para o teste injetar uma matriz. */
export function lerAmbientes(caminho = join(AQUI, "ambientes.json")) {
  return JSON.parse(readFileSync(caminho, "utf8"));
}

/** Erro de uso ou de configuração com mensagem pronta para a tela. */
export class ErroDeUso extends Error {
  constructor(mensagem, codigo = 2) {
    super(mensagem);
    this.name = "ErroDeUso";
    this.codigo = codigo;
  }
}

/**
 * O ambiente pedido na linha de comando: `--ambiente hml` ou `--ambiente=prod`.
 * Devolve `{ ambiente, restante }`, com `restante` sem a opção (quem repassa
 * argumentos adiante não leva `--ambiente` junto). Sem a opção, ou com valor
 * que não é `hml` nem `prod`, lança `ErroDeUso`.
 */
export function lerAmbiente(argv) {
  const restante = [];
  let valor;
  let achou = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ambiente") {
      achou = true;
      const proximo = argv[i + 1];
      if (proximo !== undefined && !proximo.startsWith("--")) {
        valor = proximo;
        i++;
      }
    } else if (a.startsWith("--ambiente=")) {
      achou = true;
      valor = a.slice("--ambiente=".length);
    } else {
      restante.push(a);
    }
  }
  const opcoes = AMBIENTES_COM_BANCO.join(" ou ");
  if (!achou || !valor) {
    throw new ErroDeUso(
      `Falta dizer em qual ambiente agir: --ambiente ${AMBIENTES_COM_BANCO.join("|")}.\n\n`
      + "Não há ambiente padrão, de propósito: escolher por omissão é como se mexe no\n"
      + "banco errado. Acrescente a opção ao mesmo comando, por exemplo:\n\n"
      + "  --ambiente prod",
    );
  }
  if (!AMBIENTES_COM_BANCO.includes(valor)) {
    throw new ErroDeUso(
      `Ambiente "${valor}" não serve para este roteiro. Use --ambiente ${opcoes}.`
      + (valor === "dev" ? "\n(dev é a sua máquina: não há banco remoto para copiar nem migrar.)" : ""),
    );
  }
  return { ambiente: valor, restante };
}

/**
 * Tudo o que o roteiro precisa saber de UM ambiente, lido de `ambientes.json`.
 * Lança `ErroDeUso` quando o ambiente ainda não tem banco declarado (HML antes
 * da V2-F01-E11): melhor recusar do que cair no de outro ambiente.
 */
export function perfilDoAmbiente(ambiente, matriz = lerAmbientes()) {
  if (!AMBIENTES_COM_BANCO.includes(ambiente)) {
    throw new ErroDeUso(`Ambiente "${ambiente}" não tem banco remoto.`);
  }
  const amb = matriz?.ambientes?.[ambiente];
  const projeto = amb?.identidadeDoBanco;
  if (!projeto) {
    throw new ErroDeUso(
      `O ambiente ${ambiente} ainda não tem banco declarado em scripts/ambientes.json `
      + "(identidadeDoBanco vazia).\n"
      + (ambiente === "hml"
        ? "O banco de HML nasce na V2-F01-E11. Quando existir, preencha identidadeDoBanco, bancoHost e\nbancoPorta no ambientes.json."
        : "Sem isso o roteiro não sabe qual banco é o dele, e não vai chutar."),
    );
  }
  const sufixo = ambiente === "prod" ? "" : `-${ambiente}`;
  return {
    ambiente,
    projeto,
    host: amb.bancoHost ?? HOST,
    porta: amb.bancoPorta ?? PORTA,
    conta: CONTA,
    cofre: `${COFRE}${sufixo}`,
    variavelDaSenha: `DC360_SENHA_BANCO_${ambiente.toUpperCase()}`,
  };
}

/**
 * A URL, com a senha codificada para caber nela.
 *
 * `encodeURIComponent` e não interpolação crua: uma senha com `@` faz o
 * analisador de URL achar que o host começa ali, e o erro que sai fala de um
 * host que não existe. Quem lê aquilo vai conferir DNS, e o problema é um
 * caractere da senha.
 *
 * Função separada e exportada porque é a única parte que dá para provar sem um
 * banco de pé, e é a parte que erra em silêncio. Sem perfil, vale o de
 * produção (o comportamento de antes da E15, que os testes antigos cobrem).
 */
export function montarUrl(senha, perfil = { projeto: PROJETO, host: HOST, porta: PORTA }) {
  /*
    Pelo pooler o papel leva o projeto colado, e isso é exigência do provedor:
    é assim que ele sabe para qual banco encaminhar a conexão. O papel de
    verdade continua sendo `postgres`.
  */
  return `postgresql://postgres.${perfil.projeto}:${encodeURIComponent(senha)}`
    + `@${perfil.host}:${perfil.porta}/postgres?sslmode=verify-full`;
}

/** A mesma URL sem a senha, que é a que se mostra na tela antes de agir. */
export function urlSemSenha(perfil) {
  const url = new URL(montarUrl("x", perfil));
  url.password = "";
  return url.toString();
}

/** Duas linhas que dizem em qual banco o roteiro vai agir. Nunca trazem a senha. */
export function linhasDoAlvo(perfil) {
  return `Ambiente: ${perfil.ambiente}\nBanco: ${urlSemSenha(perfil)}`;
}

/** Falta de credencial, com a mensagem para quem não escreveu o sistema. */
export class ErroDeCredencial extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeCredencial";
  }
}

/** Como guardar a senha em cada sistema. Só comandos e nomes: nunca um valor. */
export function ajudaDaSenha({ plataforma = process.platform, perfil }) {
  const v = perfil.variavelDaSenha;
  const cabeca = `Não achei a senha do banco de ${perfil.ambiente.toUpperCase()}.\n\n`
    + "Ela é a do banco (painel da Supabase, Database > Settings > Reset database password)\n"
    + `e é só deste ambiente: a senha de outro ambiente não serve aqui.\n\n`;
  if (plataforma === "win32") {
    return cabeca
      + "No Windows, rode o roteiro num terminal aberto por você: ele PERGUNTA a senha, e ela\n"
      + "não aparece na tela nem fica no histórico. Para rodar sem perguntar (um pipeline,\n"
      + `por exemplo), a senha vai na variável de ambiente ${v}, definida na sessão:\n\n`
      + `  $env:${v} = Read-Host -MaskInput "Senha do banco"      # PowerShell 7\n`
      + `  Remove-Item Env:${v}                                    # ao terminar\n`;
  }
  if (plataforma === "darwin") {
    return cabeca
      + "Guarde no chaveiro do Mac. O comando PERGUNTA a senha e pede de novo para conferir,\n"
      + "e ela não aparece na tela nem fica no histórico do terminal:\n\n"
      + `  security add-generic-password -a ${perfil.conta} -s ${perfil.cofre} -w\n\n`
      + `Alternativa: a variável de ambiente ${v}, só na sessão (\`read -rs ${v}; export ${v}\`).\n`;
  }
  return cabeca
    + "No Linux, a opção sem arquivo é a variável de ambiente da sessão. Digite a senha sem\n"
    + "eco, e ela não vai para o histórico:\n\n"
    + `  read -rs ${v}; export ${v}\n`
    + `  unset ${v}                       # ao terminar\n\n`
    + "Com `secret-tool` (libsecret) instalado, o roteiro também lê do chaveiro da sessão:\n\n"
    + `  secret-tool store --label="${perfil.cofre}" conta ${perfil.conta} cofre ${perfil.cofre}\n\n`
    + "Se rodar num terminal interativo, ele pergunta a senha sem eco.\n";
}

/**
 * Lê UMA linha sem ecoar. A saída recebe a pergunta e o fim de linha, e nada do
 * que se digita. Injetável (`entrada`, `saida`) para o teste provar que a senha
 * não chega à tela.
 */
export function perguntarSemEco(pergunta, { entrada = process.stdin, saida = process.stderr } = {}) {
  return new Promise((resolver, rejeitar) => {
    let mudo = false;
    const filtro = new Writable({
      write(pedaco, _codificacao, pronto) {
        if (!mudo) saida.write(pedaco);
        pronto();
      },
    });
    const leitor = createInterface({ input: entrada, output: filtro, terminal: Boolean(entrada.isTTY) });
    leitor.question(pergunta, (resposta) => {
      resolver(resposta); // antes do close: o 'close' abaixo só vale se ninguém respondeu
      leitor.close();
      saida.write("\n");
    });
    mudo = true;
    leitor.once("close", () => {
      // fechou sem resposta (Ctrl+D ou entrada vazia)
      rejeitar(new ErroDeCredencial("A senha não foi digitada."));
    });
  });
}

/** Lê do chaveiro do sistema, ou devolve `null` se não houver ou não achar. */
export function senhaDoChaveiro({
  plataforma = process.platform,
  perfil,
  executar = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
}) {
  try {
    if (plataforma === "darwin") {
      return executar("security", ["find-generic-password", "-a", perfil.conta, "-s", perfil.cofre, "-w"])
        .replace(/\r?\n$/, "") || null;
    }
    if (plataforma === "linux") {
      return executar("secret-tool", ["lookup", "conta", perfil.conta, "cofre", perfil.cofre])
        .replace(/\r?\n$/, "") || null;
    }
  } catch {
    // sem a ferramenta ou sem o item: cai para a pergunta
  }
  return null;
}

/**
 * A senha do banco do ambiente. Ordem: variável do ambiente, chaveiro do
 * sistema, pergunta sem eco. Se nada serve, lança `ErroDeCredencial` com a
 * ajuda do sistema em que se está. Nunca olha a senha de outro ambiente.
 */
export async function obterSenha({
  perfil,
  plataforma = process.platform,
  env = process.env,
  executar,
  perguntar = process.stdin.isTTY ? (p) => perguntarSemEco(p) : null,
}) {
  const daVariavel = env[perfil.variavelDaSenha];
  if (daVariavel) return daVariavel;
  const doChaveiro = senhaDoChaveiro({ plataforma, perfil, ...(executar ? { executar } : {}) });
  if (doChaveiro) return doChaveiro;
  if (perguntar) {
    try {
      const digitada = await perguntar(`Senha do banco de ${perfil.ambiente.toUpperCase()} (não aparece na tela): `);
      if (digitada) return digitada;
    } catch {
      // cai para a ajuda
    }
  }
  throw new ErroDeCredencial(ajudaDaSenha({ plataforma, perfil }));
}

/**
 * Como chamar o `npm` em qualquer sistema SEM `shell`. No Windows o `npm` é um
 * `.cmd`, que o Node recusa abrir sem `shell: true`, e `shell: true` junta os
 * argumentos num texto só (um nome com espaço, como "Rita Lopes", se partiria).
 * O caminho certo é chamar o `node` com o `npm-cli.js`.
 */
export function comandoDoNpm({
  plataforma = process.platform,
  env = process.env,
  execPath = process.execPath,
  existe = existsSync,
} = {}) {
  if (env.npm_execpath && /\.c?js$/.test(env.npm_execpath)) {
    return { comando: execPath, prefixo: [env.npm_execpath], shell: false };
  }
  if (plataforma === "win32") {
    const cli = join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (existe(cli)) return { comando: execPath, prefixo: [cli], shell: false };
    return { comando: "npm.cmd", prefixo: [], shell: true };
  }
  return { comando: "npm", prefixo: [], shell: false };
}

/** Imprime o erro de uso ou de credencial e sai; qualquer outro erro sobe. */
export function sairComMensagem(erro) {
  if (erro instanceof ErroDeUso) {
    console.error(`\n${erro.message}\n`);
    process.exit(erro.codigo);
  }
  if (erro instanceof ErroDeCredencial) {
    console.error(`\n${erro.message}`);
    process.exit(1);
  }
  throw erro;
}
