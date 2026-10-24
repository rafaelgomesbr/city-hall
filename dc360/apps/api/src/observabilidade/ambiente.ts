/**
 * As variáveis de ambiente da observabilidade (V2-F01-E14).
 *
 * Ficam FORA de `config.ts` por ora, pela mesma razão de `versao-do-build.ts`:
 * `config.ts` estava sendo mexido por outra etapa (E09) quando esta entrou. A
 * linha que a E09 deve acrescentar ao contrato de configuração está no RESUMO
 * da E14; quando entrar, este módulo passa a ler de `config` e some.
 *
 * Nada aqui derruba a partida: valor inválido vira `null` e uma frase em
 * `avisos`, que `index.ts` põe no log. Alerta de armazenamento mal configurado
 * não pode impedir a API de subir no meio de uma chuva.
 */

export interface AmbienteDeObservabilidade {
  /**
   * `ERROS_DSN` (CP-06): destino do erro centralizado. Ainda NÃO há SDK, então
   * o valor só liga um aviso de partida. Nunca é registrado: DSN carrega chave.
   */
  errosDsn: string | null;
  /** `S3_COTA_BYTES`: a cota do bucket em bytes. Ausente, sem alerta. */
  cotaDeArmazenamentoBytes: number | null;
  avisos: string[];
}

export function lerAmbienteDeObservabilidade(
  ambiente: NodeJS.ProcessEnv = process.env,
): AmbienteDeObservabilidade {
  const avisos: string[] = [];

  const dsn = (ambiente["ERROS_DSN"] ?? "").trim();

  const bruto = (ambiente["S3_COTA_BYTES"] ?? "").trim();
  let cota: number | null = null;
  if (bruto !== "") {
    // Só inteiro positivo em dígitos: `1e12`, `10GB` e `-5` são engano de quem
    // configurou, e o alerta calculado sobre um número errado é pior que nenhum.
    if (/^[1-9]\d{0,15}$/.test(bruto)) cota = Number(bruto);
    else avisos.push("S3_COTA_BYTES precisa ser um número inteiro de bytes, maior que zero: o alerta de armazenamento ficou desligado.");
  }

  return { errosDsn: dsn === "" ? null : dsn, cotaDeArmazenamentoBytes: cota, avisos };
}
