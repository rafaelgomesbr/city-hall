import { randomBytes } from "node:crypto";
import { derivarSenha, gerarSenhaTemporaria } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp, uriDeAtivacao } from "../../api/src/auth/totp.js";
import { abrirCofre, contextoDoOperador } from "./operadores.js";

/**
 * Cria a SEMENTE do dono do console: a linha de `CONSOLE_OPERADORES` que a
 * partida importa UMA vez, com a tabela `console_operadores` vazia.
 *
 * ISTO DEIXOU DE SER O CAMINHO NORMAL PARA CRIAR OPERADOR. Desde a migração
 * 038 os operadores vivem no banco, e quem os cria é o DONO, na área de
 * usuários do próprio console: a tela sorteia senha e segredo, mostra os dois
 * uma vez, e grava a linha com quem a criou. Este comando serve para UM caso:
 * o primeiro dono, num banco que ainda não tem nenhum. Rodar de novo com a
 * tabela povoada não faz nada, porque a variável é ignorada pela partida (com
 * aviso no log).
 *
 * A produção de hoje NÃO precisa rodar isto: a linha que já está em
 * `CONSOLE_OPERADORES` é importada como dono no primeiro deploy com a 038,
 * com a mesma senha e o mesmo segundo fator de sempre.
 *
 * O SEGUNDO FATOR SAI JUNTO, e não depois. A conta NASCE com ele, porque a
 * ADR 0008 diz "sem exceção e sem 'por enquanto não'". Uma conta que existisse
 * antes do segredo do TOTP seria uma conta que entra só com senha durante a
 * janela em que ninguém está olhando.
 *
 * NADA VAI PARA O BANCO POR AQUI. O comando imprime, e quem provisiona copia
 * para a configuração; é a PARTIDA do console, com o papel dele e pela policy
 * da 038, quem grava a linha. Este processo não precisa da credencial de dono
 * do banco, e não deve tê-la.
 *
 * Rodar:
 *   CONSOLE_SEGUNDO_FATOR_CHAVE=... npm run provisionar --workspace @dc360/console -- --email pessoa@fornecedor
 */

type Argumentos = { email: string };

function lerArgumentos(argv: readonly string[]): Argumentos {
  let email: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") email = argv[i + 1] ?? null;
  }
  if (!email || !email.includes("@")) {
    throw new Error(
      "Uso: npm run provisionar --workspace @dc360/console -- --email pessoa@fornecedor.com.br",
    );
  }
  return { email: email.trim().toLowerCase() };
}

async function principal(): Promise<void> {
  const { email } = lerArgumentos(process.argv.slice(2));

  const chave = process.env["CONSOLE_SEGUNDO_FATOR_CHAVE"];
  if (!chave) {
    throw new Error(
      "Falta CONSOLE_SEGUNDO_FATOR_CHAVE. Ela cifra o segredo do segundo fator, e "
      + "precisa ser a MESMA com que o console vai subir, senão o envelope não abre "
      + "na partida. Gere uma com:\n"
      + "  node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const cofre = abrirCofre(chave);

  /*
    A senha é SORTEADA pelo servidor, e não digitada por quem provisiona, pela
    mesma razão escrita em `auth/senha.ts`: quem digita repete a mesma senha
    para todo mundo do setor, e costuma escolher uma que já usa em outro lugar.
    Um sorteio não tem esses dois defeitos. O dono troca a senha na primeira
    entrada, pela tela "Minha senha".
  */
  const senha = gerarSenhaTemporaria();
  const hash = await derivarSenha(senha);

  const segredo = gerarSegredoTotp();
  const envelope = cofre.cifrar(segredo, contextoDoOperador(email));

  const linha = JSON.stringify([{ email, senha: hash, segundoFator: envelope }]);

  console.log("");
  console.log("Semente do DONO do console criada. Nada disto foi gravado em lugar nenhum.");
  console.log("");
  console.log(`  Email:  ${email}`);
  console.log(`  Senha:  ${senha}`);
  console.log("");
  console.log("Segundo fator, para o aplicativo de autenticação:");
  console.log(`  Segredo:  ${segredo}`);
  console.log(`  Endereço: ${uriDeAtivacao(segredo, email, "DC360 Console")}`);
  console.log("");
  console.log("Ponha isto na configuração do console, UMA vez, com a tabela de operadores vazia:");
  console.log(`  CONSOLE_OPERADORES='${linha}'`);
  console.log("");
  console.log("A partida importa a linha como dono e avisa no log. Depois disso a variável é");
  console.log("ignorada e pode sair da configuração. Os outros operadores são criados pelo dono");
  console.log("na área de usuários do console, e não por este comando.");
  console.log("");
  if (!process.env["CONSOLE_JWT_SEGREDO"]) {
    console.log("E, se ainda não houver uma, um segredo de token para este console:");
    console.log(`  CONSOLE_JWT_SEGREDO='${randomBytes(32).toString("base64url")}'`);
    console.log("");
  }
  /*
    O aviso não é formalidade. A senha aparece UMA vez, no terminal de quem
    provisiona, e o segredo do TOTP também: os dois vão para o histórico do
    terminal e para o log da sessão de quem estiver gravando. Dizer isso em voz
    alta é o que faz a pessoa fechar o terminal em vez de deixá-lo aberto.
  */
  console.log("A senha e o segredo acima não aparecem de novo, e não estão guardados.");
  console.log("Feche este terminal depois de configurar o aplicativo de autenticação.");
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
