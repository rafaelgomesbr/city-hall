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
