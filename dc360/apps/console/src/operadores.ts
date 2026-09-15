import { z } from "zod";
import { abrirCofre, type Cofre } from "../../api/src/auth/cofre.js";
import { conferirSenha, gastarTempoEquivalente } from "../../api/src/auth/senha.js";
import { base32Decodificar, conferirTotp } from "../../api/src/auth/totp.js";
import type { EscritaDoConsole, LeituraDoConsole } from "./banco.js";

/**
 * Quem entra no console, e onde essas contas moram: em `console_operadores`.
 *
 * ATÉ A MIGRAÇÃO 038 elas moravam na configuração do processo, e a razão era a
 * decisão 3 da ADR 0008: o papel do console não escrevia em tabela nenhuma, e
 * uma tabela de operadores teria exigido dar escrita a ele. O que se perdia
 * com isso estava escrito aqui em voz alta: criar operador exigia implantar de
 * novo, e o teto de tentativas e o passo do TOTP já usado viviam na memória do
 * processo, então reiniciar esquecia os dois e o console só podia rodar numa
 * máquina.
 *
 * A 038 abriu UMA tabela ao console, e ela não é tabela de negócio: não tem
 * cidadão, imóvel nem município dentro, só quem opera o fornecedor. Com ela:
 *
 *   - o dono cria operadores abaixo dele pela tela, sem deploy;
 *   - tentativas falhadas, castigo de quinze minutos e passo queimado vão para
 *     a LINHA do operador, e valem em qualquer processo que olhe o banco;
 *   - quem pode fazer o quê é decidido por policy, no banco: operador atualiza
 *     a própria linha, só o dono cria e desativa, e o dono não se desativa.
 *
 * `CONSOLE_OPERADORES` NÃO SUMIU: virou a SEMENTE do dono. Na partida, se a
 * tabela estiver vazia e a variável existir, a linha entra como `papel =
 * 'dono'`, uma vez. Depois disso a variável é ignorada, com aviso no log. É
 * isso que faz a produção de hoje (um operador na variável) virar o dono sem
 * ninguém rodar comando (ver `semearDonoSePreciso`).
 */

/* ==========================================================================
   A semente: a forma antiga da variável, agora usada uma vez
   ========================================================================== */

/**
 * A forma de um operador na variável de semente.
 *
 * `segundoFator` é OBRIGATÓRIO, e é este `.min(1)` que faz a decisão 4 da ADR
 * 0008 deixar de ser intenção. Uma conta de console sem segredo de TOTP não é
 * uma conta em transição, é uma conta que entraria só com senha, e o processo
 * se recusa a subir com uma dessas.
 */
const OPERADOR_DA_SEMENTE = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  segundoFator: z.string().min(1),
});

const SEMENTE = z.array(OPERADOR_DA_SEMENTE).min(1);

export type Semente = { email: string; senhaHash: string; segundoFator: string };

/**
 * O contexto que amarra o envelope do TOTP ao operador.
 *
 * Mesma defesa da migração 022: sem ele, quem conseguisse escrever na tabela
 * copiaria o envelope de um operador para a linha de outro e passaria a gerar
 * os códigos dele com o próprio aplicativo, sem nunca decifrar nada. O prefixo
 * `console:` separa este espaço do produto, para um envelope do produto não
 * abrir aqui nem com a mesma chave.
 */
export function contextoDoOperador(email: string): string {
  return `console:${email.toLowerCase()}`;
}

/* ==========================================================================
   A ARMADILHA DAS ASPAS, e por que ela merece um portão só dela
   ========================================================================== */

/**
 * As partes que o hash de senha do produto tem, e o que significa faltar uma.
 *
 * O formato é `scrypt$N$r$p$sal$hash` (ver `api/src/auth/senha.ts`), com N, r e
 * p em decimal e sal e hash em base64url. Com os parâmetros de hoje, um hash
 * real começa por `scrypt$131072$8$1$`.
 *
 * ESTE PORTÃO EXISTE POR UM DEFEITO CONCRETO, e ele é do pior tipo que há:
 *
 *   fly secrets set CONSOLE_OPERADORES="[... \"senha\":\"scrypt$131072$8$1$SAL$HASH\" ...]"
 *
 * Com aspas DUPLAS, quem lê `$131072`, `$8` e `$1` é o SHELL, antes de o `fly`
 * existir. Os três viram string vazia, e o que sobe para o provedor é
 * `scrypt$$$SAL$HASH`. Depois disso, TUDO continua parecendo certo: o JSON é
 * válido, o esquema passa, o envelope do segundo fator abre (ele é base64 e
 * não tem `$`), e o processo SOBE. E a senha certa nunca mais confere, para
 * sempre, sem exceção, sem log, sem nada em tela além de "email ou senha
 * inválidos".
 *
 * Com a semente indo para o BANCO, este portão passou a importar ainda mais:
 * um hash comido pelo shell que entrasse na tabela como dono seria um dono que
 * não entra, e a correção exigiria a credencial de dono do banco. Então a
 * regra continua: falhar ALTO E CEDO, antes de tocar no banco, e a mensagem
 * nomeia a causa em vez de descrever o sintoma.
 */
const PARTES_DO_HASH = 6;
const PREFIXO_DO_HASH = "scrypt";

/**
 * O que há de errado com este hash, ou `null` quando ele está bem formado.
 *
 * NÃO DEVOLVE O VALOR RECEBIDO em hipótese nenhuma: a mensagem sai na partida,
 * e partida em produção escreve no log do provedor de hospedagem. O que ela
 * devolve é a FORMA (quantas partes vieram, quais chegaram vazias), que
 * descreve o defeito sem carregar segredo nenhum.
 */
export function problemaNoHashDaSenha(hash: string): string | null {
  const partes = hash.split("$");

  if (partes[0] !== PREFIXO_DO_HASH) {
    return `não começa por "${PREFIXO_DO_HASH}$", então não é um hash deste produto`;
  }

  // Posição zero fora da conta: ela é o prefixo, e já foi conferida acima.
  const vazias = partes
    .map((parte, i) => (parte === "" ? i : -1))
    .filter((i) => i > 0);

  if (partes.length !== PARTES_DO_HASH) {
    return `tem ${partes.length} partes em vez de ${PARTES_DO_HASH}`
      + (vazias.length > 0 ? `, e as posições ${vazias.join(", ")} chegaram vazias` : "");
  }

  if (vazias.length > 0) {
    return `tem as ${PARTES_DO_HASH} partes, mas as posições ${vazias.join(", ")} `
      + "chegaram vazias";
  }

  /*
    N, r e p precisam ser inteiros POSITIVOS, e não só "inteiros": `Number("")`
    é zero e `Number.isInteger(0)` é verdadeiro, então uma checagem de inteiro
    sozinha deixaria passar `scrypt$0$8$1$sal$hash`, que é o que sobra quando o
    shell come SÓ o `$131072`.
  */
  const rotulos = ["N", "r", "p"];
  for (let i = 0; i < rotulos.length; i += 1) {
    const valor = Number(partes[i + 1]);
    if (!Number.isInteger(valor) || valor <= 0) {
      return `o parâmetro ${rotulos[i]} do scrypt não é um inteiro positivo`;
    }
  }

  return null;
}

/**
 * Lê a semente e recusa tudo que não seja utilizável.
 *
 * Falha ALTO E CEDO, na partida e não na primeira tentativa de entrar. Um
 * console que sobe com a semente torta e só falha quando alguém tenta usar é
 * um console que parece pronto no dia em que ninguém precisa dele e some no
 * dia em que alguém precisa.
 *
 * EXATAMENTE UM operador: a semente é o DONO, singular. Um segundo operador
 * na variável não tem para onde ir (o dono é um, e operador se cria pela tela
 * de usuários, com quem o criou registrado na linha). Recusar aqui é melhor
 * que escolher um dos dois pela ordem: credencial nunca depende de ordem.
 */
export function lerSemente(cru: string, cofre: Cofre): Semente {
  let analisado: unknown;
  try {
    analisado = JSON.parse(cru);
  } catch {
    throw new Error(
      "CONSOLE_OPERADORES não é JSON válido. Ela é uma lista com UM objeto "
      + '{"email","senha","segundoFator"}, a semente do dono, e o comando '
      + "`npm run provisionar --workspace @dc360/console` imprime a linha pronta.",
    );
  }

  const resultado = SEMENTE.safeParse(analisado);
  if (!resultado.success) {
    // A mensagem cita o campo que faltou, e nunca o valor recebido: os valores
    // aqui são hash de senha e envelope do segundo fator, e uma mensagem de
    // erro de partida vai para o log do provedor de hospedagem.
    const caminhos = resultado.error.issues
      .map((p) => `${p.path.join(".")}: ${p.message}`)
      .join("; ");
    throw new Error(
      `CONSOLE_OPERADORES está fora de forma (${caminhos}). O segundo fator não é `
      + "opcional no console: operador sem `segundoFator` é operador que entraria só "
      + "com senha, e a ADR 0008 fecha essa porta sem exceção.",
    );
  }

  if (resultado.data.length !== 1) {
    throw new Error(
      `CONSOLE_OPERADORES traz ${resultado.data.length} operadores, e a semente é UM: `
      + "o dono do console. Desde a migração 038 os operadores vivem no banco e são "
      + "criados pelo dono na área de usuários do próprio console. Deixe na variável "
      + "só a linha do dono.",
    );
  }

  const operador = resultado.data[0]!;
  const email = operador.email.trim().toLowerCase();

  /*
    O HASH DA SENHA precisa ter forma de hash, e esta é a única conferência
    possível: não dá para saber se ele é o hash da senha certa, mas dá para
    saber que ele não é hash nenhum. Vem ANTES do envelope de propósito: quem
    colou a linha pelo caminho errado quebrou a senha sem quebrar o envelope, e
    sem esta ordem leria a mensagem do segundo fator e trocaria a chave, que
    está certa.
  */
  const problema = problemaNoHashDaSenha(operador.senha);
  if (problema !== null) {
    throw new Error(
      `A senha de ${email} em CONSOLE_OPERADORES ${problema}. `
      + "A causa quase certa é o valor ter passado por um shell entre aspas "
      + "DUPLAS: em `fly secrets set VAR=\"...\"` o shell expande `$131072`, "
      + "`$8` e `$1` do hash para vazio, antes de o `fly` receber qualquer "
      + "coisa, e o que chega ao servidor é `scrypt$$$sal$hash`. O JSON "
      + "continua válido e o processo subiria normal, com a senha certa "
      + "recusada para sempre e nenhuma linha de log dizendo por quê. "
      + "Escreva os segredos num ARQUIVO e use `fly secrets import < arquivo`, "
      + "que não passa por shell nenhum; ver docs/IMPLANTACAO.md.",
    );
  }

  if (!envelopeAbre(cofre, operador.segundoFator, email)) {
    throw new Error(
      `O segundo fator de ${email} não abre com a CONSOLE_SEGUNDO_FATOR_CHAVE atual. `
      + "Ou a chave mudou, ou o envelope veio de outra instalação. Gere de novo com "
      + "`npm run provisionar --workspace @dc360/console`.",
    );
  }

  return { email, senhaHash: operador.senha, segundoFator: operador.segundoFator };
}

/** O envelope abre com esta chave e este contexto, e o que sai é base32. */
function envelopeAbre(cofre: Cofre, envelope: string, email: string): boolean {
  const segredo = cofre.decifrar(envelope, contextoDoOperador(email));
  return segredo !== null && base32Decodificar(segredo) !== null;
}

/* ==========================================================================
   O registro no banco
   ========================================================================== */

export type Papel = "dono" | "operador";

/** Uma linha de `console_operadores`, inteira, como a porta precisa dela. */
export type Operador = {
  id: string;
  email: string;
  senhaHash: string;
  segundoFator: string;
  papel: Papel;
  ativo: boolean;
  falhasLogin: number;
  bloqueadoAte: Date | null;
  ultimoPassoTotp: number | null;
};

/** O que a lista de usuários mostra: nunca hash, nunca envelope. */
export type OperadorListado = {
  id: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
};

type LinhaDoBanco = {
  id: string;
  email: string;
  senha_hash: string;
  segundo_fator: string;
  papel: Papel;
  ativo: boolean;
  falhas_login: number;
  bloqueado_ate: string | Date | null;
  ultimo_passo_totp: string | number | null;
};

/**
 * TODO o SQL de `console_operadores`, num lugar só.
 *
 * Pela mesma razão de `consultas.ts` e `cadastro.ts`: dá para abrir um arquivo
 * e ver a superfície inteira que o console alcança na própria tabela. Todo
 * valor viaja como parâmetro do driver.
 *
 * As colunas são nomeadas uma a uma, e `SELECT *` não aparece: uma coluna nova
 * na tabela não entra na porta sem alguém escrevê-la aqui.
 */
const COLUNAS = `id, email, senha_hash, segundo_fator, papel, ativo,
                 falhas_login, bloqueado_ate, ultimo_passo_totp`;

const SQL = {
  porEmail: `SELECT ${COLUNAS} FROM console_operadores WHERE email = $1`,
  porId: `SELECT ${COLUNAS} FROM console_operadores WHERE id = $1`,
  quantos: "SELECT count(*)::int AS n FROM console_operadores",
  dono: `SELECT ${COLUNAS} FROM console_operadores WHERE papel = 'dono'`,
  listar: `SELECT id, email, papel, ativo, criado_em::text AS criado_em
             FROM console_operadores
            ORDER BY (papel = 'dono') DESC, criado_em`,
  semear: `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
           VALUES ($1, $2, $3, 'dono', NULL) RETURNING id`,
  criar: `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
          VALUES ($1, $2, $3, 'operador', $4) RETURNING id`,
  desativar: `UPDATE console_operadores SET ativo = false
               WHERE id = $1 AND papel <> 'dono' RETURNING id`,
  falha: `UPDATE console_operadores SET falhas_login = $2, bloqueado_ate = $3
           WHERE id = $1`,
  acerto: `UPDATE console_operadores
              SET ultimo_passo_totp = $2, falhas_login = 0, bloqueado_ate = NULL
            WHERE id = $1`,
  trocarSenha: "UPDATE console_operadores SET senha_hash = $2 WHERE id = $1",
} as const;

function daLinha(l: LinhaDoBanco): Operador {
  return {
    id: l.id,
    email: l.email,
    senhaHash: l.senha_hash,
    segundoFator: l.segundo_fator,
    papel: l.papel,
    ativo: l.ativo,
    falhasLogin: Number(l.falhas_login),
    bloqueadoAte: l.bloqueado_ate === null ? null : new Date(l.bloqueado_ate),
    ultimoPassoTotp: l.ultimo_passo_totp === null ? null : Number(l.ultimo_passo_totp),
  };
}

export type Registro = {
  /** `null` quando não existe operador com aquele email. Sem contexto: é a porta. */
  buscarPorEmail(email: string): Promise<Operador | null>;
  /**
   * Uma linha pelo id. Lida com o contexto de `comoQuem`, que por padrão é o
   * próprio id (a própria linha); o dono lê a linha de um operador passando o
   * id dele em `comoQuem`.
   */
  buscarPorId(id: string, comoQuem?: string): Promise<Operador | null>;
  quantos(): Promise<number>;
  dono(): Promise<Operador | null>;
  listar(quem: string): Promise<OperadorListado[]>;
  /**
   * Só com a tabela vazia, e sem contexto: é a partida semeando o dono. A
   * policy da 038 fecha este caminho na primeira linha, e existe teste que
   * tenta um segundo dono e mostra o banco recusando.
   */
  semearDono(semente: Semente): Promise<string>;
  criar(novo: Semente, criadoPor: string): Promise<string>;
  /** `false` quando a linha não mudou: não existe, ou é o dono. */
  desativar(id: string, por: string): Promise<boolean>;
  registrarFalha(operador: Operador, agora: Date): Promise<void>;
  registrarAcerto(operador: Operador, passo: number): Promise<void>;
  trocarSenha(id: string, novoHash: string): Promise<void>;
};

/** O registro de operadores, sobre a conexão do console. */
export function registroNoBanco(leitura: LeituraDoConsole, escrita: EscritaDoConsole): Registro {
  async function uma(sql: string, params: readonly unknown[], operador: string | null) {
    const linhas = await leitura.ler<LinhaDoBanco>(sql, params, operador);
    return linhas[0] ? daLinha(linhas[0]) : null;
  }

  return {
    buscarPorEmail: (email) => uma(SQL.porEmail, [email.trim().toLowerCase()], null),
    buscarPorId: (id, comoQuem = id) => uma(SQL.porId, [id], comoQuem),
    async quantos() {
      const r = await leitura.ler<{ n: number }>(SQL.quantos);
      return Number(r[0]?.n ?? 0);
    },
    dono: () => uma(SQL.dono, [], null),
    listar: (quem) => leitura.ler<OperadorListado>(SQL.listar, [], quem),
    async semearDono(semente) {
      const r = await escrita.executar<{ id: string }>(
        SQL.semear, [semente.email, semente.senhaHash, semente.segundoFator],
      );
      return r[0]!.id;
    },
    async criar(novo, criadoPor) {
      const r = await escrita.executar<{ id: string }>(
        SQL.criar, [novo.email, novo.senhaHash, novo.segundoFator, criadoPor], criadoPor,
      );
      return r[0]!.id;
    },
    async desativar(id, por) {
      const r = await escrita.executar<{ id: string }>(SQL.desativar, [id], por);
      return r.length === 1;
    },
    async registrarFalha(operador, agora) {
      /*
        O teto de tentativas do segundo fator, separado do da senha, pela mesma
        razão da migração 022: o contador da senha zera a cada acerto de senha,
        então com um contador só, adivinhar seis dígitos teria tentativas
        infinitas (basta acertar a senha de novo entre as tentativas). O que
        conta aqui é código errado, e só código errado.
      */
      const falhas = operador.falhasLogin + 1;
      const castigo = falhas >= TENTATIVAS;
      await escrita.executar(
        SQL.falha,
        [
          operador.id,
          castigo ? 0 : falhas,
          castigo ? new Date(agora.getTime() + CASTIGO_MS) : operador.bloqueadoAte,
        ],
        operador.id,
      );
    },
    async registrarAcerto(operador, passo) {
      await escrita.executar(SQL.acerto, [operador.id, passo], operador.id);
    },
    async trocarSenha(id, novoHash) {
      await escrita.executar(SQL.trocarSenha, [id, novoHash], id);
    },
  };
}

const TENTATIVAS = 5;
const CASTIGO_MS = 15 * 60_000;

/* ==========================================================================
   A semente na partida
   ========================================================================== */

export type DestinoDeAviso = {
  info(objeto: Record<string, unknown>, mensagem: string): void;
  warn(objeto: Record<string, unknown>, mensagem: string): void;
};

/**
 * Semeia o dono a partir de `CONSOLE_OPERADORES`, UMA vez, e recusa subir sem
 * dono.
 *
 * A GRAVAÇÃO É PELO PAPEL DO CONSOLE, e é a policy da migração 038 quem deixa:
 * o INSERT de `console_operadores` tem um ramo para `papel = 'dono'` que só
 * vale enquanto a tabela está vazia (`console_sem_operadores()`), e fecha na
 * primeira linha. Não é preciso a credencial de dono do banco para o console
 * nascer, e é isso que faz a produção de hoje (um operador na variável) virar
 * o dono no primeiro deploy, sem ninguém rodar comando.
 *
 * Os desfechos, e o porquê de cada um:
 *
 *   - tabela vazia e variável definida: importa como dono, e diz no log que
 *     importou, para quem subiu o console saber que a variável já pode sair da
 *     configuração;
 *   - tabela povoada e variável ainda definida: IGNORA a variável e avisa em
 *     `warn`. Não falha, porque o console cairia por causa de uma variável que
 *     sobrou; não cala, porque senão ninguém lembra de tirá-la de lá;
 *   - tabela vazia e variável ausente: não sobe. Um console sem dono sobe,
 *     responde e não deixa ninguém entrar, e falhar alto na partida é melhor
 *     que parecer pronto;
 *   - tabela com dono cujo envelope não abre com a chave atual: não sobe, e
 *     diz de quem é o envelope. É a mesma conferência que a partida antiga
 *     fazia lendo a variável, agora feita contra a linha.
 */
export async function semearDonoSePreciso(
  registro: Registro,
  sementeCrua: string | undefined,
  cofre: Cofre,
  log: DestinoDeAviso,
): Promise<void> {
  const quantos = await registro.quantos();

  if (quantos === 0) {
    if (!sementeCrua) {
      throw new Error(
        "A tabela console_operadores está vazia e CONSOLE_OPERADORES não está definida: "
        + "não há dono para este console, e sem dono ninguém entra nem cria operador. "
        + "Gere a linha do dono com `npm run provisionar --workspace @dc360/console` e "
        + "suba UMA vez com ela em CONSOLE_OPERADORES; a partida importa a linha como "
        + "dono e a variável pode sair da configuração em seguida.",
      );
    }
    const semente = lerSemente(sementeCrua, cofre);
    const id = await registro.semearDono(semente);
    log.info(
      { operador: semente.email, operador_id: id },
      "dono do console semeado a partir de CONSOLE_OPERADORES. A variável já pode sair "
      + "da configuração: daqui em diante ela é ignorada.",
    );
  } else if (sementeCrua) {
    log.warn(
      {},
      "CONSOLE_OPERADORES ignorada: os operadores do console já vivem no banco "
      + "(console_operadores), e a variável só serve para semear o dono uma vez. "
      + "Remova-a da configuração.",
    );
  }

  const dono = await registro.dono();
  if (!dono || !dono.ativo) {
    throw new Error(
      "console_operadores não tem um dono ativo. O console não sobe sem dono: é ele "
      + "quem cria operadores, desativa e elimina município. Corrija a linha no banco "
      + "com a credencial de dono das tabelas.",
    );
  }
  if (!envelopeAbre(cofre, dono.segundoFator, dono.email)) {
    throw new Error(
      `O segundo fator de ${dono.email} (o dono do console) não abre com a `
      + "CONSOLE_SEGUNDO_FATOR_CHAVE atual. Ou a chave mudou no provedor, ou o envelope "
      + "veio de outra instalação. Com a chave errada, todo código seria recusado como "
      + "\"inválido\" e a pessoa concluiria que perdeu o aparelho.",
    );
  }
}

/* ==========================================================================
   A conferência da senha e a do código
   ========================================================================== */

/**
 * Confere a senha, gastando o mesmo tempo quando o email não existe ou a
 * conta está desativada.
 *
 * Sem o `gastarTempoEquivalente`, a diferença de tempo entre "email
 * desconhecido" e "senha errada" entrega quais emails do fornecedor têm conta
 * no console, e uma lista curta de emails de operador é o começo de qualquer
 * tentativa dirigida. Conta desativada recebe o MESMO tratamento de conta
 * inexistente, pela mesma razão: "existe mas está desativada" também é
 * informação.
 */
export async function conferirEntrada(
  registro: Registro,
  email: string,
  senha: string,
): Promise<Operador | null> {
  const operador = await registro.buscarPorEmail(email);
  if (!operador || !operador.ativo) {
    await gastarTempoEquivalente();
    return null;
  }
  return (await conferirSenha(senha, operador.senhaHash)) ? operador : null;
}

export type DesfechoDoCodigo = "ok" | "codigo" | "bloqueado";

/**
 * Confere os seis dígitos e QUEIMA o passo usado, na linha do operador.
 *
 * Queimar não é detalhe: sem isso, quem leu a tela por cima do ombro (ou o
 * print mandado num grupo) entra com o mesmo número enquanto a janela não
 * virar. É a mesma regra do produto, e a implementação é literalmente a mesma
 * função: `conferirTotp` recebe o último passo e recusa qualquer código igual
 * ou anterior a ele.
 *
 * SERVE PARA A PORTA E PARA OS ATOS QUE PEDEM "CÓDIGO NOVO" (trocar a senha,
 * eliminar município): como o passo da entrada já está queimado na linha, o
 * código que abriu a sessão não vale de novo aqui. Isso é o que a regra "não o
 * da entrada" quer dizer, e ela sai de graça do mesmo mecanismo.
 */
export async function conferirCodigo(
  registro: Registro,
  operador: Operador,
  codigo: string,
  cofre: Cofre,
  agora: Date,
): Promise<DesfechoDoCodigo> {
  if (operador.bloqueadoAte && operador.bloqueadoAte.getTime() > agora.getTime()) {
    return "bloqueado";
  }

  const segredoBase32 = cofre.decifrar(operador.segundoFator, contextoDoOperador(operador.email));
  const segredo = segredoBase32 ? base32Decodificar(segredoBase32) : null;
  if (!segredo) {
    // A partida confere o envelope do dono, mas um operador criado com outra
    // chave (ou uma chave trocada embaixo do processo) cai aqui. Conta como
    // erro, para não virar tentativa infinita.
    await registro.registrarFalha(operador, agora);
    return "codigo";
  }

  const conferido = conferirTotp(segredo, codigo, agora, operador.ultimoPassoTotp);
  if (!conferido) {
    await registro.registrarFalha(operador, agora);
    return "codigo";
  }

  await registro.registrarAcerto(operador, conferido.passo);
  return "ok";
}

export { abrirCofre };
export type { Cofre };
