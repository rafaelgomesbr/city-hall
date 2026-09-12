import { z } from "zod";

/**
 * A configuração do console, e o que ela recusa.
 *
 * A régua é a mesma do `config.ts` da API, e a razão também: um servidor que
 * sobe com chave padrão é pior do que um que não sobe, porque parece funcionar.
 * No console isso pesa mais, porque a conta do fornecedor é a única do sistema
 * cujo comprometimento alcança mais de um município, ainda que só em métrica
 * agregada.
 *
 * TODAS AS VARIÁVEIS TÊM PREFIXO `CONSOLE_`, e isso não é organização: é a
 * decisão 1 da ADR 0008 escrita no nome. Com `JWT_SEGREDO` valendo para os
 * dois, bastaria um painel de implantação com variáveis de projeto
 * compartilhadas para os dois processos passarem a assinar com a mesma chave, e
 * a separação viraria uma convenção que ninguém consegue conferir. Com nomes
 * distintos, compartilhar segredo entre produto e console exige alguém digitar
 * o mesmo valor duas vezes, de propósito.
 *
 * Ainda assim o segredo NÃO é a separação: a separação é a plateia do token
 * (ver `tokens.ts`), e ela recusa o token do outro lado mesmo quando os dois
 * segredos são iguais.
 */

const ESQUEMA = z.object({
  NODE_ENV: z.string().default("development"),

  CONSOLE_PORT: z.coerce.number().int().positive().default(3344),
  CONSOLE_HOST: z.string().default("127.0.0.1"),

  /**
   * Trinta e dois bytes, como no produto.
   *
   * Não tem valor padrão, em ambiente nenhum, e isso é diferente da API (que
   * aceita subir sem `DATABASE_URL` no desenvolvimento). Aqui não existe modo
   * "só para experimentar": qualquer console de pé, ainda que apontado para um
   * banco descartável, é uma tela que mostra números de mais de um município, e
   * uma chave adivinhável nele é uma sessão forjada.
   */
  CONSOLE_JWT_SEGREDO: z.string().min(32, {
    message: "CONSOLE_JWT_SEGREDO precisa de pelo menos 32 caracteres. "
      + "Gere com: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",
  }),

  /**
   * A chave que abre o envelope do segundo fator dos operadores.
   *
   * SEPARADA da `SEGUNDO_FATOR_CHAVE` do produto, e por um motivo concreto: com
   * a mesma chave, quem tivesse acesso de escrita ao banco do produto poderia
   * cifrar um segredo de TOTP conhecido e colá-lo na configuração do console. O
   * contexto (`console:<email>`) já impediria isso, mas duas defesas custam uma
   * variável de ambiente.
   */
  CONSOLE_SEGUNDO_FATOR_CHAVE: z.string().min(1, {
    message: "CONSOLE_SEGUNDO_FATOR_CHAVE é obrigatória: sem ela não há como abrir "
      + "o segundo fator dos operadores, e sem segundo fator não se entra no console.",
  }),

  /** O registro de operadores. Ver `operadores.ts` para o formato e o porquê. */
  CONSOLE_OPERADORES: z.string().min(1, {
    message: "CONSOLE_OPERADORES é obrigatória. Gere a linha com "
      + "`npm run provisionar --workspace @dc360/console`.",
  }),

  /**
   * A conexão com o banco, com o papel de leitura do console.
   *
   * Ausente, o processo sobe um Postgres em WebAssembly efêmero para
   * desenvolvimento, e a validação abaixo recusa essa combinação em produção
   * pela mesma razão da API: um console de produção lendo um banco que morre no
   * reinício mostraria "nenhum município escreveu" para sempre, que é
   * exatamente o alarme que ele existe para dar.
   */
  CONSOLE_DATABASE_URL: z.string().optional(),

  /**
   * Onde o Postgres em WebAssembly do desenvolvimento guarda os arquivos dele.
   *
   * Só tem efeito quando `CONSOLE_DATABASE_URL` está ausente, e serve a duas
   * coisas concretas:
   *
   *   1. O console que alguém está desenvolvendo para de nascer vazio a cada
   *      reinício, e vazio aqui é a tela mais enganosa possível, porque ela é
   *      idêntica à de "todos os municípios pararam de escrever".
   *   2. Numa máquina sem Postgres instalado, o relógio da API e o console
   *      conseguem compartilhar UM banco: o relógio abre o diretório, escreve a
   *      métrica e fecha; o console abre o mesmo diretório e lê. É assim que dá
   *      para exercitar o caminho inteiro, com os dois processos separados, sem
   *      exigir infraestrutura que alguém possa "pular por enquanto".
   *
   * Não vale em produção pela mesma razão da ausência de `CONSOLE_DATABASE_URL`:
   * a validação abaixo exige a URL, e ela vence.
   */
  CONSOLE_BANCO_LOCAL: z.string().optional(),
});

export type Config = z.infer<typeof ESQUEMA>;

export function carregarConfig(ambiente: NodeJS.ProcessEnv = process.env): Config {
  const resultado = ESQUEMA.safeParse(ambiente);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((p) => `${p.path.join(".")}: ${p.message}`)
      .join("\n  ");
    throw new Error(`Configuração do console inválida:\n  ${problemas}`);
  }

  const config = resultado.data;
  const producao = config.NODE_ENV === "production";

  if (producao && !config.CONSOLE_DATABASE_URL) {
    throw new Error(
      "Em produção o console exige CONSOLE_DATABASE_URL. Sem ela ele subiria "
      + "contra um Postgres em WebAssembly efêmero, sem métrica nenhuma dentro, e "
      + "mostraria todos os municípios como calados: o alarme que ele existe para "
      + "dar, disparado por ele mesmo.",
    );
  }

  return config;
}
