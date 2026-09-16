import type { Identidade } from "../servidor.js";

/**
 * O recorte que faz o token do agente de campo enxergar só a EQUIPE dele.
 *
 * O DEFEITO QUE ISTO FECHA foi provado pelo revisor contra a API real: as
 * leituras de ocorrência (`GET /ocorrencias`, `/:id`, `/mapa`, `/interditados`
 * e as duas de `/evidencias`) exigiam só autenticação, então o token de um
 * agente, que é o papel cujo aparelho anda pelo morro, cai e é emprestado,
 * paginava a base inteira do município, com nome, contato, relato e descrição
 * de vulnerabilidade de cada família, sem uma linha de registro de consulta.
 * `docs/PAPEIS_E_RESPONSABILIDADES.md` prometia que o agente "não pode ver a
 * fila do município", e a promessa valia só para o desenho da tela.
 *
 * A REGRA é a mesma de `/campo/meu-trabalho` e de `/sincronizacao/pendencias`:
 * a equipe vem do CADASTRO do próprio usuário, lida sob RLS no instante da
 * consulta, e nunca do token nem de parâmetro. Agente sem equipe cai num
 * `equipe_id = NULL`, que não casa com linha nenhuma: lista vazia e 404 em
 * qualquer dossiê. Ocorrência de outra equipe responde 404, nunca 403, pela
 * mesma razão de sempre: 403 confirmaria que aquele identificador existe.
 *
 * O recorte é UMA condição SQL, colada no `WHERE` de cada leitura, para que
 * a contagem, a página e o mapa contem a mesma coisa. Uma tela que dissesse
 * "2 de 8" denunciaria as seis que o agente não pode ver.
 *
 * Para todo outro papel a função devolve `null` e nada muda: coordenação,
 * plantão e administração continuam vendo o município inteiro, que é a fila
 * de trabalho deles.
 */
export function recorteDoAgente(
  quem: Pick<Identidade, "papel" | "usuarioId">,
  alias: string,
  params: unknown[],
): string | null {
  if (quem.papel !== "agente_campo") return null;
  params.push(quem.usuarioId);
  return `${alias}.equipe_id = (SELECT u.equipe_id FROM usuarios u WHERE u.id = $${params.length})`;
}

/**
 * O mesmo recorte, já com o `AND` na frente, para o `WHERE` que já existe.
 * String vazia para quem não é agente.
 */
export function eRecorteDoAgente(
  quem: Pick<Identidade, "papel" | "usuarioId">,
  alias: string,
  params: unknown[],
): string {
  const condicao = recorteDoAgente(quem, alias, params);
  return condicao ? ` AND ${condicao}` : "";
}
