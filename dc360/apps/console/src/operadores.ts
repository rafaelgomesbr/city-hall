import { z } from "zod";
import { abrirCofre, type Cofre } from "../../api/src/auth/cofre.js";
import { conferirSenha, gastarTempoEquivalente } from "../../api/src/auth/senha.js";
import { base32Decodificar, conferirTotp } from "../../api/src/auth/totp.js";

/**
 * Quem entra no console, e por que essas contas não moram no banco.
 *
 * A pergunta óbvia é onde guardar a conta do operador do fornecedor, e a
 * resposta sai direto da decisão 3 da ADR 0008: **o papel do console não tem
 * INSERT, UPDATE nem DELETE em lugar nenhum.** Ele tem SELECT em duas tabelas e
 * numa visão, e nada mais, no banco inteiro.
 *
 * Isso não é um obstáculo a contornar, é a garantia funcionando. Uma tabela de
 * operadores exigiria dar escrita ao console, e escrita é o que separa "um
 * vazamento do console entrega números agregados" de "um vazamento do console
 * entrega uma porta de escrita no banco de todos os municípios". Então as
 * contas vivem na CONFIGURAÇÃO do processo, e o console continua sendo, do
 * ponto de vista do banco, uma coisa que só lê.
 *
 * O que se perde, dito em voz alta para ninguém se enganar:
 *
 *   - Criar operador exige implantar de novo, porque é mudança de configuração.
 *     Para uma equipe de fornecedor isso acontece algumas vezes por ano.
 *   - O passo do TOTP já usado e o contador de tentativas vivem na memória do
 *     processo (ver `TetoDeTentativas` abaixo), não no banco. Reiniciar o
 *     processo esquece os dois. A janela que isso abre é a de um passo de trinta
 *     segundos, e ela exige que o atacante tenha o código E consiga reiniciar o
 *     processo no intervalo. Está escrito aqui porque é uma diferença real em
 *     relação ao produto, onde o passo queimado vai para o banco.
 */

/**
 * A forma de um operador na configuração.
 *
 * `segundoFator` é OBRIGATÓRIO, e é este `.min(1)` que faz a decisão 4 da ADR
 * 0008 deixar de ser intenção. No produto o segundo fator é exigido por
 * configuração do município e o administrador pode estar em processo de
 * ativação; aqui não existe esse estado. Uma conta de console sem segredo de
 * TOTP não é uma conta em transição, é uma conta que entraria só com senha, e o
 * processo se recusa a subir com uma dessas.
 */
const OPERADOR = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  segundoFator: z.string().min(1),
});

const REGISTRO = z.array(OPERADOR).min(1);

export type Operador = z.infer<typeof OPERADOR>;

/**
 * O contexto que amarra o envelope do TOTP ao operador.
 *
 * Mesma defesa da migração 022: sem ele, quem conseguisse escrever na
 * configuração copiaria o envelope de um operador para a linha de outro e
 * passaria a gerar os códigos dele com o próprio aplicativo, sem nunca decifrar
 * nada. O prefixo `console:` separa este espaço do produto, para um envelope do
 * produto não abrir aqui nem com a mesma chave.
 */
export function contextoDoOperador(email: string): string {
  return `console:${email.toLowerCase()}`;
}

export type Registro = {
  /** `null` quando não existe operador com aquele email. */
  buscar(email: string): Operador | null;
  /** Todos, para a partida poder afirmar quantos são no log. */
  quantos(): number;
};

/**
 * Lê o registro de operadores e recusa tudo que não seja utilizável.
 *
 * Falha ALTO E CEDO, na partida e não na primeira tentativa de entrar. Um
 * console que sobe com a configuração torta e só falha quando alguém tenta usar
 * é um console que parece pronto no dia em que ninguém precisa dele e some no
 * dia em que alguém precisa.
 */
export function lerRegistro(cru: string, cofre: Cofre): Registro {
  let analisado: unknown;
  try {
    analisado = JSON.parse(cru);
  } catch {
    throw new Error(
      "CONSOLE_OPERADORES não é JSON válido. Ela é uma lista de objetos "
      + '{"email","senha","segundoFator"}, e o comando `npm run provisionar '
      + '--workspace @dc360/console` imprime a linha pronta.',
    );
  }

  const resultado = REGISTRO.safeParse(analisado);
  if (!resultado.success) {
    /*
      A mensagem cita o campo que faltou, e nunca o valor recebido: os valores
      aqui são hash de senha e envelope do segundo fator, e uma mensagem de erro
      de partida vai para o log do provedor de hospedagem.
    */
    const caminhos = resultado.error.issues
      .map((p) => `${p.path.join(".")}: ${p.message}`)
      .join("; ");
    throw new Error(
      `CONSOLE_OPERADORES está fora de forma (${caminhos}). O segundo fator não é `
      + "opcional no console: operador sem `segundoFator` é operador que entraria só "
      + "com senha, e a ADR 0008 fecha essa porta sem exceção.",
    );
  }

  const porEmail = new Map<string, Operador>();
  for (const operador of resultado.data) {
    const chave = operador.email.toLowerCase();
    if (porEmail.has(chave)) {
      throw new Error(
        `CONSOLE_OPERADORES traz ${chave} duas vezes. Com duas linhas para o mesmo `
        + "email, qual delas vale depende da ordem, e a resposta certa para "
        + "credencial nunca depende de ordem.",
      );
    }

    /*
      O envelope precisa ABRIR na partida, e não na primeira entrada.

      Uma chave trocada, um envelope copiado de outra instalação ou uma
      configuração colada pela metade produzem exatamente o mesmo sintoma no
      login: "código inválido". A pessoa tentaria de novo, gastaria o teto de
      tentativas e concluiria que perdeu o aparelho. Aqui o processo diz na
      partida qual operador tem envelope que não abre.
    */
    const segredo = cofre.decifrar(operador.segundoFator, contextoDoOperador(chave));
    if (segredo === null || base32Decodificar(segredo) === null) {
      throw new Error(
        `O segundo fator de ${chave} não abre com a CONSOLE_SEGUNDO_FATOR_CHAVE atual. `
        + "Ou a chave mudou, ou o envelope veio de outra instalação. Gere de novo com "
        + "`npm run provisionar --workspace @dc360/console`.",
      );
    }

    porEmail.set(chave, operador);
  }

  return {
    buscar: (email) => porEmail.get(email.trim().toLowerCase()) ?? null,
    quantos: () => porEmail.size,
  };
}

/* ==========================================================================
   A conferência da senha e a do código
   ========================================================================== */

/**
 * Confere a senha, gastando o mesmo tempo quando o email não existe.
 *
 * Sem o `gastarTempoEquivalente`, a diferença de tempo entre "email
 * desconhecido" e "senha errada" entrega quais emails do fornecedor têm conta
 * no console, e uma lista curta de emails de operador é o começo de qualquer
 * tentativa dirigida.
 */
export async function conferirEntrada(
  registro: Registro,
  email: string,
  senha: string,
): Promise<Operador | null> {
  const operador = registro.buscar(email);
  if (!operador) {
    await gastarTempoEquivalente();
    return null;
  }
  return (await conferirSenha(senha, operador.senha)) ? operador : null;
}

/**
 * O teto de tentativas do segundo fator, separado do da senha.
 *
 * Contador PRÓPRIO, pela mesma razão da migração 022: o contador da senha zera
 * a cada acerto de senha, então com um contador só, adivinhar seis dígitos
 * teria tentativas infinitas (basta acertar a senha de novo entre as
 * tentativas).
 *
 * Em memória, e a razão está no cabeçalho deste arquivo: o console não tem
 * escrita em lugar nenhum do banco, de propósito. Em produção o console roda em
 * um processo, então isto conta o que precisa contar; se um dia rodar em dois, o
 * teto passa a valer por processo, e é por isso que ele é baixo.
 */
export type TetoDeTentativas = {
  /** `false` significa "esta conta está de castigo agora". */
  permite(email: string, agora: number): boolean;
  errou(email: string, agora: number): void;
  acertou(email: string): void;
  /** O passo do TOTP já queimado por esta conta, ou `null`. */
  ultimoPasso(email: string): number | null;
  queimar(email: string, passo: number): void;
};

const TENTATIVAS = 5;
const CASTIGO_MS = 15 * 60_000;

export function tetoEmMemoria(): TetoDeTentativas {
  type Estado = { falhas: number; bloqueadoAte: number; passo: number | null };
  const porEmail = new Map<string, Estado>();

  function estado(email: string): Estado {
    const chave = email.toLowerCase();
    const atual = porEmail.get(chave) ?? { falhas: 0, bloqueadoAte: 0, passo: null };
    porEmail.set(chave, atual);
    return atual;
  }

  return {
    permite: (email, agora) => estado(email).bloqueadoAte <= agora,
    errou(email, agora) {
      const e = estado(email);
      e.falhas += 1;
      if (e.falhas >= TENTATIVAS) {
        e.falhas = 0;
        e.bloqueadoAte = agora + CASTIGO_MS;
      }
    },
    acertou(email) {
      const e = estado(email);
      e.falhas = 0;
      e.bloqueadoAte = 0;
    },
    ultimoPasso: (email) => estado(email).passo,
    queimar(email, passo) {
      estado(email).passo = passo;
    },
  };
}

export type DesfechoDoCodigo = "ok" | "codigo" | "bloqueado";

/**
 * Confere os seis dígitos e QUEIMA o passo usado.
 *
 * Queimar não é detalhe: sem isso, quem leu a tela por cima do ombro (ou o
 * print mandado num grupo) entra com o mesmo número enquanto a janela não
 * virar. É a mesma regra do produto, e a implementação é literalmente a mesma
 * função: `conferirTotp` recebe o último passo e recusa qualquer código igual
 * ou anterior a ele.
 */
export function conferirCodigo(
  operador: Operador,
  codigo: string,
  cofre: Cofre,
  teto: TetoDeTentativas,
  agora: Date,
): DesfechoDoCodigo {
  if (!teto.permite(operador.email, agora.getTime())) return "bloqueado";

  const segredoBase32 = cofre.decifrar(
    operador.segundoFator,
    contextoDoOperador(operador.email),
  );
  const segredo = segredoBase32 ? base32Decodificar(segredoBase32) : null;
  if (!segredo) {
    // A partida já recusaria subir com um envelope destes, então chegar aqui
    // significa que a configuração mudou embaixo do processo em execução.
    teto.errou(operador.email, agora.getTime());
    return "codigo";
  }

  const conferido = conferirTotp(
    segredo, codigo, agora, teto.ultimoPasso(operador.email),
  );
  if (!conferido) {
    teto.errou(operador.email, agora.getTime());
    return "codigo";
  }

  teto.queimar(operador.email, conferido.passo);
  teto.acertou(operador.email);
  return "ok";
}

export { abrirCofre };
export type { Cofre };
