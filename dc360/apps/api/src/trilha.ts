import type { Consulta } from "./banco/tipos.js";
import type { Identidade } from "./servidor.js";
import type { Origem } from "@dc360/shared";

/**
 * Registra um evento na trilha auditável.
 *
 * Autor, papel e origem vêm da identidade do token, nunca do corpo da
 * requisição: se o cliente pudesse dizer quem assinou, a trilha não provaria
 * nada. Roda na mesma transação da mudança que descreve, então ou os dois
 * acontecem ou nenhum acontece: não existe estado alterado sem rastro.
 *
 * Mora aqui, e não dentro de uma rota, porque quem escreve na trilha não é só
 * o fluxo da ocorrência. A emissão de documento oficial também escreve, e
 * enquanto esta função era privada de `rotas/ocorrencias.ts` o termo de
 * interdição saía sem deixar rastro nenhum de quem o emitiu.
 */
export async function registrarEvento(
  c: Consulta,
  quem: Identidade,
  ocorrenciaId: string,
  tipo: string,
  detalhe: unknown,
  origem: Origem = "escritorio",
): Promise<void> {
  await c.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)`,
    [
      quem.organizacaoId, ocorrenciaId, tipo, quem.usuarioId,
      quem.nome, quem.papel, origem, JSON.stringify(detalhe),
    ],
  );
}

/**
 * O mesmo, para a emissão de documento oficial, que é o único evento da trilha
 * que se repete sem que nada tenha mudado.
 *
 * Um laudo pode ser aberto dez vezes no mesmo dia: por quem despachou, por
 * quem vai assinar, pela recepção que imprime. Gravar dez linhas transformaria
 * a trilha num registro de cliques, e a trilha não tem policy de DELETE: o que
 * entra ali fica. O índice único parcial da migração 009 deixa passar a
 * primeira emissão de cada par (documento, vistoria) e recusa as repetições em
 * silêncio, com `ON CONFLICT DO NOTHING`.
 *
 * O efeito colateral é a propriedade que interessa para medir o piloto: uma
 * segunda linha só aparece quando existe vistoria nova, que é exatamente a
 * definição de retrabalho documental.
 */
export async function registrarEmissao(
  c: Consulta,
  quem: Identidade,
  ocorrenciaId: string,
  documento: "laudo" | "termo_de_interdicao",
  vistoriaId: string,
  formato: "html" | "pdf",
): Promise<void> {
  await c.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1,$2,'documento_emitido',$3,$4,$5,'escritorio', now(), $6)
     ON CONFLICT DO NOTHING`,
    [
      quem.organizacaoId, ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
      JSON.stringify({ documento, vistoriaId, formato }),
    ],
  );
}
