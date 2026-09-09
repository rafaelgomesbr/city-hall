/**
 * Rotação e revogação do segredo que assina a sessão (`JWT_SEGREDO`).
 *
 * Existe porque são DOIS procedimentos opostos que usam a mesma variável, e
 * confundir um com o outro é a única forma de errar aqui que não aparece em log
 * nenhum. Prosa num documento não impede a confusão na madrugada; um comando
 * que imprime a linha pronta, impede.
 *
 *   ROTAÇÃO (o segredo está velho, ninguém sabe dele)
 *     O novo entra NA FRENTE, o antigo fica atrás. Todo token novo passa a sair
 *     assinado com o novo, e os já emitidos continuam valendo até vencerem
 *     sozinhos (`ACESSO_MINUTOS`, quinze no padrão, uma hora no teto). Depois
 *     disso, o antigo sai. NINGUÉM É DERRUBADO, e é por isso que a rotação
 *     passa a acontecer de verdade: enquanto trocar significava derrubar o
 *     plantão no meio de um temporal, ninguém trocava, e segredo que nunca gira
 *     é segredo que só precisa vazar uma vez.
 *
 *   REVOGAÇÃO (alguém tem o segredo)
 *     O segredo vazado SAI DA LISTA IMEDIATAMENTE, sem convivência. Aqui
 *     derrubar todo mundo é o comportamento CERTO, e não um efeito colateral a
 *     evitar: enquanto o segredo vazado for aceito, quem o tem fabrica token de
 *     administrador de qualquer município. O plantão volta com a senha; o
 *     invasor, não.
 *
 * Rodar:
 *   node scripts/rotacionar-segredo.mjs rotacionar "$JWT_SEGREDO"
 *   node scripts/rotacionar-segredo.mjs revogar "$JWT_SEGREDO" "<o que vazou>"
 */
import { randomBytes } from "node:crypto";

/** O mesmo teto que `apps/api/src/config.ts` aplica na partida. */
export const MAXIMO_DE_SEGREDOS = 3;

export function gerarSegredo() {
  /*
    48 bytes, bem acima do mínimo de 32 caracteres, em `base64url`.

    `base64url` e não `base64`: o alfabeto dele não tem `+`, `/` nem `=`, e
    esses três dão trabalho justamente onde este valor vai parar (arquivo
    `.env`, painel de variável da PaaS, linha de comando com aspas). Também não
    tem vírgula, que é o separador da lista: um segredo que a contivesse
    partiria a própria lista em dois pedaços curtos, e a partida recusaria por
    um motivo que ninguém entenderia.
  */
  return randomBytes(48).toString("base64url");
}

export function separar(valor) {
  return String(valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Passo 1 e passo 2 da rotação, na ordem, para a mesma variável.
 *
 * O passo 2 não é opcional nem "quando der". Enquanto ele não acontecer, o
 * segredo antigo continua abrindo sessão, e a rotação está pela metade: o
 * produto passou a ter dois segredos válidos em vez de ter trocado de segredo.
 */
export function planoDeRotacao(atual, novo = gerarSegredo()) {
  const lista = separar(atual);
  if (lista.length === 0) {
    throw new Error(
      "Não há segredo atual para rotacionar. Passe o valor de JWT_SEGREDO como "
      + "segundo argumento.",
    );
  }
  if (lista.includes(novo)) {
    throw new Error("O segredo novo já está na lista: isso não é rotação, é repetição.");
  }

  const durante = [novo, ...lista];
  if (durante.length > MAXIMO_DE_SEGREDOS) {
    throw new Error(
      `A lista ficaria com ${durante.length} segredos e o teto é ${MAXIMO_DE_SEGREDOS}. `
      + "Termine a rotação anterior (tire o mais antigo) antes de começar outra: "
      + "cada item da lista ainda abre sessão.",
    );
  }

  return {
    novo,
    durante: durante.join(","),
    // Só o novo sobra. O passo 2 é o que de fato aposenta o segredo velho.
    depois: novo,
  };
}

/**
 * A revogação, e ela é o oposto da rotação de propósito.
 *
 * O segredo vazado não aparece na saída em lugar nenhum: é justamente isso que
 * o comando garante, e é o erro que ele existe para impedir (alguém aplicar o
 * plano de rotação num caso de vazamento e deixar o segredo comprometido
 * valendo por mais uma hora "para não incomodar o plantão").
 */
export function planoDeRevogacao(atual, vazado, novo = gerarSegredo()) {
  const lista = separar(atual);
  if (!lista.includes(vazado)) {
    throw new Error(
      "O segredo apontado como vazado não está na lista atual. Confira o valor: "
      + "revogar o segredo errado derruba todo mundo e deixa o comprometido "
      + "valendo.",
    );
  }
  const restante = lista.filter((s) => s !== vazado && s !== novo);
  return { novo, agora: [novo, ...restante].join(",") };
}

function principal(argumentos) {
  const [comando, atual, vazado] = argumentos;

  if (comando === "rotacionar") {
    const plano = planoDeRotacao(atual);
    return [
      "ROTAÇÃO PROGRAMADA (ninguém é derrubado)",
      "",
      "Passo 1, agora. Suba com esta lista: o novo assina, o antigo ainda aceita.",
      `JWT_SEGREDO="${plano.durante}"`,
      "",
      "Passo 2, depois de os tokens antigos vencerem (ACESSO_MINUTOS: quinze no",
      "padrão, uma hora no teto). Suba com esta, e a rotação está concluída:",
      `JWT_SEGREDO="${plano.depois}"`,
      "",
      "Sem o passo 2 a rotação está pela metade: o segredo antigo continua",
      "abrindo sessão, e o produto passou a ter dois segredos em vez de ter",
      "trocado de segredo.",
      "",
    ].join("\n");
  }

  if (comando === "revogar") {
    const plano = planoDeRevogacao(atual, vazado);
    return [
      "REVOGAÇÃO POR VAZAMENTO (todo mundo cai, e isso é o certo)",
      "",
      "Suba JÁ com esta lista. O segredo comprometido não está nela:",
      `JWT_SEGREDO="${plano.agora}"`,
      "",
      "Toda sessão aberta cai, inclusive a do plantão, e é esse o objetivo:",
      "enquanto o segredo vazado for aceito, quem o tem fabrica token de",
      "administrador de qualquer município. O plantão volta com a senha.",
      "",
      "NÃO use o plano de rotação neste caso: ele mantém o segredo antigo",
      "válido por uma janela, o que aqui significa dar essa janela ao invasor.",
      "",
    ].join("\n");
  }

  throw new Error(
    "Uso:\n"
    + '  node scripts/rotacionar-segredo.mjs rotacionar "$JWT_SEGREDO"\n'
    + '  node scripts/rotacionar-segredo.mjs revogar "$JWT_SEGREDO" "<o que vazou>"',
  );
}

// Só executa quando chamado direto: importado pelo teste, nada é impresso.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  try {
    process.stdout.write(`${principal(process.argv.slice(2))}\n`);
  } catch (erro) {
    process.stderr.write(`${erro.message}\n`);
    process.exitCode = 1;
  }
}

export { principal };
