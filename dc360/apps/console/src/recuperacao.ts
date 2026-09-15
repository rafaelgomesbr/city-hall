import { randomBytes } from "node:crypto";
import { conferirSenha, derivarSenha, gastarTempoEquivalente } from "../../api/src/auth/senha.js";
import { normalizarCodigoDeRecuperacao } from "../../api/src/auth/totp.js";
import type { EscritaDoConsole, LeituraDoConsole } from "./banco.js";

/**
 * A recuperação de senha do console, por códigos de recuperação.
 *
 * O PEDIDO DO DONO, NA LETRA: "faz a recuperação de senha para mim, até para
 * eu resetar a minha senha". Ele é o dono: ninguém acima dele redefine, e o
 * console não tem provedor de email (decisão 1 da ADR 0008: este processo não
 * envia nada). Sobra o que a pessoa guarda na gaveta: códigos de recuperação,
 * gerados uma vez e mostrados uma vez, cada um válido uma vez.
 *
 * USAR UM CÓDIGO REDEFINE A SENHA E TROCA O SEGUNDO FATOR, mostrando o QR
 * novo na hora. Isso é decisão, e não conveniência: a recuperação existe para
 * o dia em que o telefone foi perdido junto com a senha, e nesse dia o
 * autenticador antigo é inútil ou está com outra pessoa. Uma recuperação que
 * só trocasse a senha deixaria a pessoa trancada do lado de fora pela segunda
 * etapa da porta, com um código na mão que já provou quem ela é. Se ela só
 * esqueceu a senha, escanear de novo custa dez segundos.
 *
 * O QUE MORA AQUI: o sorteio e a forma dos códigos, a conferência em tempo
 * constante o bastante, e TODO o SQL da tabela `console_codigos_de_recuperacao`
 * e das três funções da migração 039, pela mesma razão de `municipios.ts` e
 * `operadores.ts`: abrir um arquivo e ver a superfície inteira.
 *
 * O QUE NÃO MORA AQUI: as rotas (em `servidor.ts`, sob o portão de sessão para
 * gerar e sob o limite da porta para recuperar) e a tela.
 */

/* ==========================================================================
   A forma dos códigos
   ========================================================================== */

/**
 * O alfabeto ditável do produto: sem `l`, `o`, `0` e `1`, que num papel
 * guardado na gaveta são o mesmo risco de leitura. Trinta e dois símbolos,
 * exatamente uma potência de dois, e o sorteio usa `byte & 31`: com alfabeto
 * que não divide 256, o resto do módulo tornaria os primeiros símbolos mais
 * prováveis, e entropia anunciada maior que a real é a definição de credencial
 * fraca que parece forte. É o mesmo alfabeto de `gerarSenhaTemporaria` e de
 * `gerarCodigoDeRecuperacao` da API, repetido aqui porque o tamanho do código
 * é outro (ver abaixo), e o alfabeto é uma linha.
 */
const ALFABETO_DITAVEL = "abcdefghijkmnpqrstuvwxyz23456789";
const SIMBOLOS_POR_GRUPO = 5;
const GRUPOS = 2;

/** Dez símbolos: 32^10, cerca de 2^50. */
export const SIMBOLOS_POR_CODIGO = SIMBOLOS_POR_GRUPO * GRUPOS;

/**
 * Oito por lote, como no produto: cobre a vida útil real (telefone trocado,
 * quebrado, esquecido em casa, reiniciado de fábrica) sem virar uma lista que
 * ninguém guarda. Menos que isso e a pessoa fica sem saída no segundo aperto.
 */
export const CODIGOS_POR_LOTE = 8;

/**
 * DEZ SÍMBOLOS, E NÃO DEZESSEIS COMO NO PRODUTO, e a diferença é o que vai
 * para o banco.
 *
 * O produto guarda o resumo SHA-256 do código, sem sal, e por isso precisa de
 * 80 bits: contra um resumo barato, só o tamanho defende. Aqui o contrato da
 * migração 039 diz que `codigo_hash` é `scrypt`, a MESMA derivação da senha
 * (N = 2^17, cerca de 128 MB e alguns décimos de segundo por tentativa), e
 * contra uma derivação cara 50 bits sobram: quem tiver a tabela na mão gasta
 * 2^50 derivações de 128 MB por código, e quem não tiver está limitado pela
 * rota (ver "por que o limite da porta basta", mais abaixo).
 *
 * O preço dessa escolha é pago na hora de RECUPERAR, e é pago de propósito:
 * conferir um código contra oito hashes scrypt custa oito derivações, uns dois
 * segundos. Recuperação acontece uma vez por ano, com a pessoa já do lado de
 * fora; dois segundos ali não são nada, e dez símbolos num papel são metade
 * dos erros de digitação de dezesseis.
 *
 * O formato `xxxxx-xxxxx` é só para ler: o hífen sai antes de conferir.
 */
export function gerarCodigoDeRecuperacao(): string {
  const bytes = randomBytes(SIMBOLOS_POR_CODIGO);
  const simbolos = Array.from(bytes, (b) => ALFABETO_DITAVEL[b & 31]!);
  const grupos: string[] = [];
  for (let i = 0; i < GRUPOS; i++) {
    grupos.push(simbolos.slice(i * SIMBOLOS_POR_GRUPO, (i + 1) * SIMBOLOS_POR_GRUPO).join(""));
  }
  return grupos.join("-");
}

export type LoteDeCodigos = {
  /** Os códigos em texto claro. Existem só na resposta da rota, e nunca no log. */
  codigos: string[];
  /** O que vai para o banco: um hash scrypt por código, na mesma ordem. */
  hashes: string[];
};

/**
 * Sorteia um lote e deriva cada código, UM DE CADA VEZ.
 *
 * Em sequência e não em `Promise.all`, e o motivo é memória: cada `scrypt` do
 * produto pede cerca de 128 MB, e o `node:crypto` roda até quatro em paralelo
 * no conjunto de threads. Oito de uma vez seriam meio giga numa máquina de
 * servidor pequena, que é onde este processo roda. Os dois segundos a mais
 * acontecem com um botão de "gerando" na tela.
 */
export async function gerarLote(): Promise<LoteDeCodigos> {
  const codigos: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < CODIGOS_POR_LOTE; i++) {
    const codigo = gerarCodigoDeRecuperacao();
    codigos.push(codigo);
    hashes.push(await derivarSenha(normalizarCodigoDeRecuperacao(codigo)));
  }
  return { codigos, hashes };
}

/* ==========================================================================
   A conferência, em tempo constante o bastante
   ========================================================================== */

/** Uma linha de `console_recuperacao_por_email`: um código ainda não usado. */
export type Candidato = { operador_id: string; codigo_id: string; codigo_hash: string };

/**
 * Acha o código entre os candidatos, gastando SEMPRE o mesmo trabalho.
 *
 * Dois cuidados, e os dois existem para o tempo de resposta não contar nada:
 *
 *   1. Confere TODOS os candidatos, e não para no primeiro que bate. Parar no
 *      primeiro faria um acerto responder mais rápido que um erro, e a posição
 *      do acerto na lista viraria informação.
 *   2. Completa até `CODIGOS_POR_LOTE` derivações quando há menos candidatos:
 *      email que não existe, operador inativo e conta que nunca gerou código
 *      chegam aqui com lista vazia, e sem esta linha responderiam em
 *      milissegundos, contra os segundos de uma conta com oito códigos. É o
 *      mesmo `gastarTempoEquivalente` da primeira etapa da porta, oito vezes.
 *
 * "Constante o bastante" e não "constante": a lista pode ter mais de oito
 * linhas se a migração de verdade um dia permitir, e aí gasta mais. O que se
 * garante é que nenhum caminho gasta MENOS que um lote inteiro.
 */
export async function acharCodigo(
  candidatos: readonly Candidato[],
  codigoDigitado: string,
): Promise<Candidato | null> {
  const codigo = normalizarCodigoDeRecuperacao(codigoDigitado);
  let achado: Candidato | null = null;
  for (const candidato of candidatos) {
    const bate = await conferirSenha(codigo, candidato.codigo_hash);
    if (bate && achado === null) achado = candidato;
  }
  for (let i = candidatos.length; i < CODIGOS_POR_LOTE; i++) {
    await gastarTempoEquivalente();
  }
  return achado;
}

/*
 * POR QUE O LIMITE DA PORTA (20 por endereço a cada 5 minutos) BASTA, e não é
 * preciso teto por conta nem castigo de quinze minutos como no segundo fator.
 *
 * O segundo fator precisa de teto por conta porque são seis dígitos: um
 * milhão de possibilidades, e sem teto uma conta martelada de muitos
 * endereços cai em horas. Aqui a conta é outra:
 *
 *   - cada código tem 32^10, cerca de 1,1 x 10^15 possibilidades;
 *   - há no máximo oito válidos por conta, então um chute acerta com
 *     probabilidade de 8 / 1,1 x 10^15, cerca de 7 x 10^-15;
 *   - a 20 tentativas a cada 5 minutos, um endereço faz 2,1 milhões de
 *     tentativas por ANO, e a chance acumulada de um ano inteiro é da ordem
 *     de 10^-8. Com mil endereços, 10^-5 por ano. Não é um risco que um
 *     contador por conta mudaria de patamar, e um contador por conta abriria
 *     uma porta nova: quem quisesse trancar o dono para fora bastaria errar
 *     cinco vezes no email dele.
 *
 * O que o limite por endereço protege de verdade é o PROCESSADOR: cada
 * tentativa gasta oito derivações scrypt de 128 MB (ver `acharCodigo`), e sem
 * teto uma martelada nesta rota derruba o processo antes de descobrir código
 * nenhum. Vinte a cada cinco minutos é o mesmo teto da porta, pela mesma razão.
 */

/* ==========================================================================
   O SQL, por extenso e num lugar só
   ========================================================================== */

/**
 * As três funções da migração 039 e a contagem, com o que cada uma exige de
 * contexto. Todo valor viaja como parâmetro do driver.
 */
export const CHAMADAS = {
  /** COM o operador no contexto: marca os não usados como usados e insere os novos. */
  renovar: "SELECT console_renovar_codigos($1::text[]) AS inseridos",
  /** SEM contexto: não há sessão na recuperação. Vazio para email inexistente ou inativo. */
  porEmail: "SELECT operador_id, codigo_id, codigo_hash FROM console_recuperacao_por_email($1)",
  /** SEM contexto: marca usado (DC365 se já estava), grava senha e envelope novos, zera falhas. */
  consumir: "SELECT console_consumir_recuperacao($1, $2, $3)",
  /**
   * COM o operador no contexto. A policy já limita às próprias linhas; o
   * `WHERE` repete isso de propósito, para a intenção estar escrita aqui e não
   * só no banco.
   */
  restantes: `SELECT count(*)::int AS n FROM console_codigos_de_recuperacao
               WHERE operador_id = $1 AND usado_em IS NULL`,
} as const;

/** O código que o banco levanta quando o código já foi consumido. */
export const CODIGO_JA_CONSUMIDO = "DC365";

/**
 * Grava um lote novo para o operador do contexto, invalidando o anterior.
 *
 * `operador` é quem vai TER os códigos: na área "Minha senha" é a própria
 * sessão; na criação de operador é o id que acabou de nascer, declarado no
 * contexto pelo console do mesmo jeito que a porta declara o id achado pelo
 * email antes de haver sessão.
 */
export async function renovarCodigos(
  escrita: EscritaDoConsole, operador: string, hashes: readonly string[],
): Promise<number> {
  const r = await escrita.executar<{ inseridos: number }>(CHAMADAS.renovar, [hashes], operador);
  return Number(r[0]?.inseridos ?? 0);
}

export function candidatosPorEmail(
  leitura: LeituraDoConsole, email: string,
): Promise<Candidato[]> {
  return leitura.ler<Candidato>(CHAMADAS.porEmail, [email.trim().toLowerCase()]);
}

export function consumirCodigo(
  escrita: EscritaDoConsole, codigoId: string, senhaHash: string, segundoFator: string,
): Promise<unknown> {
  return escrita.executar(CHAMADAS.consumir, [codigoId, senhaHash, segundoFator]);
}

export async function codigosRestantes(leitura: LeituraDoConsole, operador: string): Promise<number> {
  const r = await leitura.ler<{ n: number }>(CHAMADAS.restantes, [operador], operador);
  return Number(r[0]?.n ?? 0);
}
