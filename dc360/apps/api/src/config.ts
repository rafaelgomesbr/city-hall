import { z } from "zod";

/**
 * Configuração vem do ambiente e é validada na partida.
 *
 * Falhar no boot quando falta segredo é deliberado: um servidor que sobe com
 * chave padrão é pior que um servidor que não sobe, porque parece funcionar.
 */
const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().default("127.0.0.1"),

  /** Ausente em desenvolvimento e em teste: aí o banco sobe em WebAssembly. */
  DATABASE_URL: z.string().url().optional(),

  /**
   * Carimbo impresso em todo documento oficial.
   *
   * O padrão MARCA, e desmarcar exige ato deliberado: `MARCA_DAGUA=` vazio.
   * A regra já foi o contrário, ligada ao ambiente, e o contrário estava
   * errado de um jeito específico: `NODE_ENV === "production" ? undefined :
   * "DOCUMENTO DE VALIDAÇÃO"` desligava o carimbo exatamente no ambiente onde
   * o piloto roda. Ou seja, durante toda a validação com município real, o
   * laudo de teste saía indistinguível de um laudo verdadeiro, e não havia
   * variável nenhuma para corrigir isso.
   *
   * Um documento a mais com carimbo é um constrangimento. Um documento a menos
   * é uma peça anexada a processo por engano.
   */
  MARCA_DAGUA: z.string().default("DOCUMENTO DE VALIDAÇÃO"),

  /**
   * Chave de assinatura dos tokens de acesso. Mínimo de 32 bytes de entropia.
   * Em produção é obrigatória; sem ela o processo não sobe.
   */
  JWT_SEGREDO: z.string().min(32).optional(),

  /** Origens permitidas, separadas por vírgula. Em produção não pode ser "*". */
  ORIGENS_PERMITIDAS: z.string().default("http://localhost:5173"),

  ACESSO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
  RENOVACAO_DIAS: z.coerce.number().int().min(1).max(90).default(14),
  MAX_FALHAS_LOGIN: z.coerce.number().int().min(3).max(20).default(5),
  BLOQUEIO_MINUTOS: z.coerce.number().int().min(1).max(1440).default(15),
  /** Tentativas de login por endereço, na janela de 5 minutos. */
  LOGIN_POR_IP: z.coerce.number().int().min(1).max(10_000).default(10),

  /**
   * Armazenamento de evidência. Ausentes em desenvolvimento: aí a própria API
   * guarda os bytes em memória, com URL assinada e expirando do mesmo jeito.
   */
  S3_ENDPOINT: z.string().url().optional(),
  S3_BALDE: z.string().min(1).optional(),
  S3_REGIAO: z.string().min(1).default("auto"),
  S3_CHAVE_ID: z.string().min(1).optional(),
  S3_CHAVE_SECRETA: z.string().min(1).optional(),
  /** Endereço público desta API, para montar a URL do armazenamento local. */
  URL_PUBLICA: z.string().url().default("http://127.0.0.1:3333"),
  /** Endereço público do painel, para montar o link de redefinição de senha. */
  URL_PAINEL: z.string().url().default("http://localhost:5173"),
  RECUPERACAO_MINUTOS: z.coerce.number().int().min(5).max(120).default(30),
});

export type Config = z.infer<typeof esquema> & {
  jwtSegredo: Uint8Array;
  origens: string[];
};

export function carregarConfig(ambiente: NodeJS.ProcessEnv = process.env): Config {
  const analisado = esquema.safeParse(ambiente);
  if (!analisado.success) {
    const problemas = analisado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuração inválida: ${problemas}`);
  }
  const c = analisado.data;

  if (c.NODE_ENV === "production") {
    if (!c.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória em produção");
    if (!c.JWT_SEGREDO) throw new Error("JWT_SEGREDO é obrigatória em produção");
    if (c.ORIGENS_PERMITIDAS.includes("*")) {
      throw new Error("ORIGENS_PERMITIDAS não pode conter curinga em produção");
    }
    // Guardar evidência na memória do processo em produção significaria perder
    // toda foto de vistoria no primeiro reinício.
    if (!c.S3_ENDPOINT || !c.S3_BALDE || !c.S3_CHAVE_ID || !c.S3_CHAVE_SECRETA) {
      throw new Error(
        "Armazenamento de evidência é obrigatório em produção: " +
        "defina S3_ENDPOINT, S3_BALDE, S3_CHAVE_ID e S3_CHAVE_SECRETA",
      );
    }

    /*
      Endereço apontando para localhost em produção é a pior categoria de
      defeito de configuração: silenciosa. O servidor sobe, responde, e só o
      destinatário descobre, sozinho, que o link não abre.

      URL_PAINEL vira o link de redefinição de senha que chega por email.
      URL_PUBLICA vira o endereço de onde o aparelho busca a foto de vistoria.
      Nenhum dos dois tem valor padrão que faça sentido fora da máquina de
      quem desenvolve, então em produção os dois são obrigatórios e explícitos.
    */
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
      ["ORIGENS_PERMITIDAS", c.ORIGENS_PERMITIDAS],
    ] as const) {
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(valor)) {
        throw new Error(
          `${nome} aponta para a máquina local em produção (${valor}). ` +
          "Defina o endereço real: um link para localhost chega quebrado a " +
          "quem recebe, e ninguém percebe pelo lado de cá.",
        );
      }
    }

    // HTTPS não é preferência: token de sessão e foto de vistoria viajam aí.
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
    ] as const) {
      if (!valor.startsWith("https://")) {
        throw new Error(`${nome} precisa ser https em produção (${valor})`);
      }
    }
  }

  // Fora de produção, um segredo efêmero por processo: reiniciar invalida os
  // tokens, que é o comportamento correto para um ambiente descartável.
  const segredo = c.JWT_SEGREDO ?? crypto.randomUUID() + crypto.randomUUID();

  return {
    ...c,
    jwtSegredo: new TextEncoder().encode(segredo),
    origens: c.ORIGENS_PERMITIDAS.split(",").map((o) => o.trim()).filter(Boolean),
  };
}
